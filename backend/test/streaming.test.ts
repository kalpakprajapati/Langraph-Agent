import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import express from "express";
import type { Server } from "node:http";
import { ChatGoogleGenerativeAI } from "@langchain/google-genai";
import { AIMessageChunk } from "@langchain/core/messages";
import { ChatGenerationChunk } from "@langchain/core/outputs";
import { Graph } from "@langchain/core/runnables/graph";
import { consumeAgentStream } from "../../client/src/lib/event-stream";
import type { AgentStreamEvent } from "../../client/src/lib/types";

process.env.GEMINI_API_KEY = "mock-test-key";
process.env.GEMINI_MODEL = "mock-test-model";
process.env.PORT = "5000";

const originalStream = ChatGoogleGenerativeAI.prototype._streamResponseChunks;
const originalImage = Graph.prototype.drawMermaidPng;
let modelCalls = 0;
let abortedCalls = 0;
let server: Server;
let base: string;

before(async () => {
  Graph.prototype.drawMermaidPng = async () => { throw new Error("Diagram export skipped in tests"); };
  ChatGoogleGenerativeAI.prototype._streamResponseChunks = async function* (messages, options, runManager) {
    modelCalls++;
    const prompt = messages.map((message) => String(message.content)).join(" ");
    const execution = prompt.includes("Steps =");
    const output = prompt.includes("FAIL_TEST") ? '{"steps":[]}' :
      execution ? JSON.stringify({ notes: ["Review closures and promises.", "Practice arrays and objects.", "Try a mock interview."] }) :
        JSON.stringify({ steps: ["Review JavaScript fundamentals.", "Practice coding questions.", "Complete a mock interview."] });
    try {
      for (let offset = 0; offset < output.length; offset += 3) {
        if (options.signal?.aborted) { abortedCalls++; throw new Error("Aborted mock generation"); }
        const text = output.slice(offset, offset + 3);
        yield new ChatGenerationChunk({ text, message: new AIMessageChunk({ content: text }) });
        await runManager?.handleLLMNewToken(text);
        await new Promise((resolve) => setTimeout(resolve, 1));
      }
    } catch (error) { throw error; }
  };
  const { default: router } = await import("../src/routes/graph");
  const app = express();
  app.use(express.json());
  app.use("/agent", router);
  server = await new Promise<Server>((resolve) => {
    const listener = app.listen(0, "127.0.0.1", () => resolve(listener));
  });
  const address = server.address();
  assert(address && typeof address !== "string");
  base = "http://127.0.0.1:" + address.port;
});

after(async () => {
  ChatGoogleGenerativeAI.prototype._streamResponseChunks = originalStream;
  Graph.prototype.drawMermaidPng = originalImage;
  await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
});

async function collect(path: string, body: unknown) {
  const res = await fetch(base + path, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "text/event-stream" },
    body: JSON.stringify(body),
  });
  assert.equal(res.status, 200);
  assert.match(res.headers.get("content-type") ?? "", /text\/event-stream/);
  assert(res.body);
  const events: AgentStreamEvent[] = [];
  await consumeAgentStream(res.body, (event) => events.push(event));
  return events;
}

function approval(events: AgentStreamEvent[]) {
  const event = events.find((event) => event.type === "needs_approval");
  assert(event?.type === "needs_approval");
  return event;
}

test("plan previews arrive before approval and resume streams notes before final state", async () => {
  const events = await collect("/agent", { input: "Prepare for a JavaScript interview" });
  const pending = approval(events);
  const previews = events.filter((event) => event.type === "preview");
  assert(previews.length > 3);
  assert(previews.some((event) => event.type === "preview" && event.items[0]?.length > 0 &&
    event.items[0].length < pending.steps[0].length));
  assert.equal(events.at(-1)?.type, "needs_approval");
  const resumed = await collect("/agent/approve", { threadId: pending.threadId, approve: true });
  assert(resumed.some((event) => event.type === "preview" && event.node === "execute"));
  const final = resumed.at(-1);
  assert(final?.type === "final");
  assert.equal(final.final.status, "done");
  assert.equal(final.final.results?.length, 3);
  assert.equal(final.final.results?.[0].note, "Review closures and promises.");
});

test("rejecting a plan skips execution and returns cancellation", async () => {
  const pending = approval(await collect("/agent", { input: "Plan a study schedule" }));
  const before = modelCalls;
  const events = await collect("/agent/approve", { threadId: pending.threadId, approve: false });
  assert.equal(modelCalls, before);
  assert(!events.some((event) => event.type === "preview"));
  const final = events.at(-1);
  assert(final?.type === "final");
  assert.equal(final.final.status, "cancelled");
});

test("simultaneous runs have separate threads and previews", async () => {
  const [a, b] = await Promise.all([
    collect("/agent", { input: "First concurrent task" }),
    collect("/agent", { input: "Second concurrent task" }),
  ]);
  assert.notEqual(approval(a).threadId, approval(b).threadId);
  assert.deepEqual(approval(a).steps, approval(b).steps);
});

test("invalid input is rejected before opening an SSE stream", async () => {
  const res = await fetch(base + "/agent", {
    method: "POST", headers: { "Content-Type": "application/json", Accept: "text/event-stream" },
    body: JSON.stringify({ input: "   " }),
  });
  assert.equal(res.status, 400);
  assert.equal((await res.json()).status, "error");
});

test("model validation failures and missing threads surface as stream errors", async () => {
  await assert.rejects(collect("/agent", { input: "FAIL_TEST" }), /could not finish/);
  await assert.rejects(collect("/agent/approve", { threadId: "missing-thread", approve: true }), /could not finish/);
});

test("JSON API clients still receive the original response shape", async () => {
  const res = await fetch(base + "/agent", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ input: "Legacy API task" }),
  });
  const body = await res.json();
  assert.equal(body.status, "ok");
  assert.equal(body.data.kind, "needs_approval");
  assert.equal(body.data.interrupt.steps.length, 3);
});

test("SSE parser handles byte-split UTF-8, CRLF, comments, and multiple events", async () => {
  const source = ': heartbeat\r\n\r\ndata: {"type":"preview","node":"plan","items":["Study \\u263a and \\u00e9"]}\r\n\r\n' +
    'data: {"type":"final","final":{"status":"done","message":"Completed"}}\n\n';
  // Include literal non-ASCII bytes as well as escaped JSON.
  const bytes = new TextEncoder().encode(source.replace("Study", "Cafe\u0301"));
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const byte of bytes) controller.enqueue(Uint8Array.of(byte));
      controller.close();
    },
  });
  const events: AgentStreamEvent[] = [];
  await consumeAgentStream(body, (event) => events.push(event));
  assert.equal(events.length, 2);
  assert(events[0].type === "preview");
  assert.equal(events[0].items[0], "Cafe\u0301 \u263a and \u00e9");
});

test("SSE parser detects truncated responses and explicit error events", async () => {
  function body(text: string) {
    return new ReadableStream<Uint8Array>({
      start(controller) { controller.enqueue(new TextEncoder().encode(text)); controller.close(); },
    });
  }
  await assert.rejects(consumeAgentStream(body('data: {"type":"started","threadId":"x"}\n\n'), () => {}), /before the agent finished/);
  await assert.rejects(consumeAgentStream(body('data: {"type":"preview"'), () => {}), /Incomplete/);
  await assert.rejects(consumeAgentStream(body('data: {"type":"error","message":"Provider failed"}\n\n'), () => {}), /Provider failed/);
});

test("closing the browser stream aborts ongoing model generation", async () => {
  const controller = new AbortController();
  const res = await fetch(base + "/agent", {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "text/event-stream" },
    body: JSON.stringify({ input: "Disconnect during generation" }),
    signal: controller.signal,
  });
  assert(res.body);
  const before = abortedCalls;
  await assert.rejects(consumeAgentStream(res.body, (event) => {
    if (event.type === "preview") controller.abort();
  }));
  const deadline = Date.now() + 2000;
  while (abortedCalls === before && Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  assert(abortedCalls > before);
});
