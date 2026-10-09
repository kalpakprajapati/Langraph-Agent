import { randomUUID } from "node:crypto";
import { Command, END, INTERRUPT, MemorySaver, START, StateGraph } from "@langchain/langgraph";
import { ValidateNode } from "./nodes/01_validate";
import { PlanNode } from "./nodes/02_plan";
import { approveNode } from "./nodes/03_approve";
import { executeNode } from "./nodes/04_execute";
import { finalizeNode } from "./nodes/05_finalize";
import { ApprovalRequestSchema, makeInitialState, TaskState, type State, type TaskNode } from "./types";

// Overrides allow testing the workflow without paid model calls.
export function createAgentGraph(nodes: { plan?: TaskNode; execute?: TaskNode } = {}) {
  return new StateGraph(TaskState)
    .addNode("validate", ValidateNode)
    .addNode("plan", nodes.plan ?? PlanNode)
    .addNode("approve", approveNode)
    .addNode("execute", nodes.execute ?? executeNode)
    .addNode("finalize", finalizeNode)
    .addEdge(START, "validate")
    .addEdge("validate", "plan")
    .addEdge("plan", "approve")
    .addConditionalEdges("approve", (state) => state.approved ? "execute" : "finalize", ["execute", "finalize"])
    .addEdge("execute", "finalize")
    .addEdge("finalize", END)
    .compile({ checkpointer: new MemorySaver() });
}

const graph = createAgentGraph();
type RunResult = { interrupt: { threadId: string; steps: string[] } } | { final: State };

export async function startAgentRun(input: string): Promise<RunResult> {
  const threadId = `t_${randomUUID()}`;
  const result = await graph.invoke(makeInitialState(input), {
    configurable: { thread_id: threadId },
  });
  // The type guard exposes interrupt metadata without an any cast.
  if (graph.isInterrupted(result)) {
    const request = ApprovalRequestSchema.parse(result[INTERRUPT][0]?.value);
    return { interrupt: { threadId, steps: request.steps } };
  }
  return { final: result };
}

export async function resumeAgentRun(args: { threadId: string; approve: boolean }): Promise<State> {
  const config = { configurable: { thread_id: args.threadId } };
  const snapshot = await graph.getState(config);
  if (!snapshot.tasks.some((task) => task.interrupts.length > 0)) {
    throw new Error("No pending approval for this thread. It may have completed or the backend restarted.");
  }
  const result = await graph.invoke(new Command({ resume: { approve: args.approve } }), config);
  if (graph.isInterrupted(result)) {
    throw new Error("The graph paused again instead of completing.");
  }
  return result;
}
