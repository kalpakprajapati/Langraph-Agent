import assert from "node:assert/strict";
import { test } from "node:test";
import { Command, INTERRUPT } from "@langchain/langgraph";

// Test setup happens before importing modules that validate environment settings.
process.env.GEMINI_API_KEY = "test-key";
process.env.GEMINI_MODEL = "gemini-test";
process.env.PORT = "5000";

test("approval pauses, validates resume, and executes once after approval", async () => {
  const { createAgentGraph } = await import("./graph");
  let executions = 0;
  const graph = createAgentGraph({
    plan: (state) => state.status === "cancelled" ? {} : { steps: ["Read the guide", "Try an example"], status: "planned" },
    execute: () => { executions++; return { results: [{ step: "Read the guide", note: "Start here" }, { step: "Try an example", note: "Practice" }] }; },
  });
  const config = { configurable: { thread_id: "approve-test" } };
  const paused = await graph.invoke({ input: "  Learn graphs  ", status: "planned" }, config);
  assert.ok(graph.isInterrupted(paused));
  assert.deepEqual(paused[INTERRUPT][0].value, { type: "approval_request", steps: ["Read the guide", "Try an example"] });
  assert.equal(executions, 0);
  const snapshot = await graph.getState(config);
  assert.equal(snapshot.values.input, "Learn graphs");
  assert.deepEqual(snapshot.next, ["approve"]);
  await assert.rejects(graph.invoke(new Command({ resume: { approve: "yes" } }), config));
  assert.equal(executions, 0);
  const final = await graph.invoke(new Command({ resume: { approve: true } }), config);
  assert.ok(!graph.isInterrupted(final));
  assert.equal(final.approved, true);
  assert.equal(final.status, "done");
  assert.equal(final.results?.length, 2);
  assert.equal(executions, 1);
});

test("rejecting an approval skips execution and cancels the run", async () => {
  const { createAgentGraph } = await import("./graph");
  let executed = false;
  const graph = createAgentGraph({
    plan: () => ({ steps: ["Read the guide"] }),
    execute: () => { executed = true; return {}; },
  });
  const config = { configurable: { thread_id: "reject-test" } };
  await graph.invoke({ input: "Learn graphs" }, config);
  const final = await graph.invoke(new Command({ resume: { approve: false } }), config);
  assert.equal(final.status, "cancelled");
  assert.equal(final.approved, false);
  assert.deepEqual(final.results, []);
  assert.equal(executed, false);
});

test("empty input finishes cancelled without pausing or calling a model", async () => {
  const { createAgentGraph } = await import("./graph");
  const graph = createAgentGraph();
  const final = await graph.invoke({ input: "   " }, { configurable: { thread_id: "empty-test" } });
  assert.ok(!graph.isInterrupted(final));
  assert.equal(final.status, "cancelled");
});

test("unknown threads cannot be resumed", async () => {
  const { resumeAgentRun } = await import("./graph");
  await assert.rejects(resumeAgentRun({ threadId: "missing", approve: true }), /No pending approval/);
});

test("planner schema limits sentence length and number of steps", async () => {
  const { PlanSchema } = await import("./nodes/02_plan");
  assert.equal(PlanSchema.safeParse({ steps: ["x".repeat(151)] }).success, false);
  assert.equal(PlanSchema.safeParse({ steps: Array(6).fill("Read a guide") }).success, false);
  assert.equal(PlanSchema.safeParse({ steps: ["Read a guide"] }).success, true);
});

test("production helpers parse ChatGoogle structured output and prevent a second resume", async (t) => {
  const { AIMessage } = await import("@langchain/core/messages");
  const { model } = await import("../utils/model");
  const { startAgentRun, resumeAgentRun } = await import("./graph");
  const replies = [{ steps: ["Read the guide", "Try an example"] }, { notes: ["Start with the concepts", "Run a small graph"] }];
  t.mock.method(model, "_generate", async () => {
    const args = replies.shift();
    assert.ok(args, "Unexpected additional model call");
    return { generations: [{ text: "", message: new AIMessage({
      content: "",
      tool_calls: [{ name: "extract", args, id: "test-call", type: "tool_call" }],
    }) }] };
  });
  const started = await startAgentRun("Learn graphs");
  assert.ok("interrupt" in started);
  const final = await resumeAgentRun({ threadId: started.interrupt.threadId, approve: true });
  assert.equal(final.status, "done");
  assert.deepEqual(final.results, [
    { step: "Read the guide", note: "Start with the concepts" },
    { step: "Try an example", note: "Run a small graph" },
  ]);
  await assert.rejects(resumeAgentRun({ threadId: started.interrupt.threadId, approve: true }), /No pending approval/);
  assert.equal(replies.length, 0);
});

test("execution rejects a model response with fewer notes than steps", async (t) => {
  const { AIMessage } = await import("@langchain/core/messages");
  const { model } = await import("../utils/model");
  const { startAgentRun, resumeAgentRun } = await import("./graph");
  const replies = [{ steps: ["Read the guide", "Try an example"] }, { notes: ["Only one note"] }];
  t.mock.method(model, "_generate", async () => {
    const args = replies.shift();
    assert.ok(args);
    return { generations: [{ text: "", message: new AIMessage({
      content: "", tool_calls: [{ name: "extract", args, id: "test-call", type: "tool_call" }],
    }) }] };
  });
  const started = await startAgentRun("Learn graphs");
  assert.ok("interrupt" in started);
  await assert.rejects(resumeAgentRun({ threadId: started.interrupt.threadId, approve: true }));
});
