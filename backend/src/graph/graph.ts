// define and compile the langgraph workflow
// startAgentRun
// resumeAgentRun

import {
  Annotation,
  INTERRUPT,
  Command,
  END,
  MemorySaver,
  START,
  StateGraph,
} from "@langchain/langgraph";
import { ValidateNode } from "./nodes/01_validate";
import { PlanNode } from "./nodes/02_plan";
import { approveNode } from "./nodes/03_approve";
import { executeNode } from "./nodes/04_execute";
import { finalizeNode } from "./nodes/05_finalize";
import { makeInitialState, State } from "./types";
import * as fs from "node:fs/promises";
import { z } from "zod";
import { PreviewSchema, type AgentStreamEvent } from "./streaming";


const StateAnn = Annotation.Root({
  input: Annotation<string>,
  steps: Annotation<string[] | undefined>,
  approved: Annotation<boolean | undefined>,
  results: Annotation<Array<{ step: string; note: string }> | undefined>,
  status: Annotation<"planned" | "done" | "cancelled" | undefined>,
  message: Annotation<string | undefined>,
});

// linear path
// start -> validate -> plan -> approve -> execute  -> finalize -> end

const builder = new StateGraph(StateAnn)
  .addNode("validate", ValidateNode)
  .addNode("plan", PlanNode)
  .addNode("approve", approveNode)
  .addNode("execute", executeNode)
  .addNode("finalize", finalizeNode);

builder.addEdge(START, "validate");
builder.addEdge("validate", "plan");
builder.addEdge("plan", "approve");

// conditional ->

builder.addConditionalEdges("approve", (s: typeof StateAnn.State) => {
  return s.approved ? "execute" : "finalize";
});

builder.addEdge("execute", "finalize");
builder.addEdge("finalize", END);

const checkPointer = new MemorySaver();
const graph = builder.compile({
  checkpointer: checkPointer,
});


async function exportGraphImage(): Promise<void> {
  const drawableGraph = await graph.getGraphAsync();
  const image = await drawableGraph.drawMermaidPng();
  const imageBuffer = new Uint8Array(await image.arrayBuffer());

  await fs.writeFile("graph.png", imageBuffer);
}

void exportGraphImage().catch((error: unknown) => {
  console.error("Failed to export graph.png:", error);
});

function createThreadId() {
  return `t_${Date.now().toString(36)}_${Math.random()
    .toString(36)
    .slice(2, 8)}`;
}

export async function startAgentRun(
  input: string
): Promise<
  { interrupt: { threadId: string; steps: string[] } } | { final: State }
> {
  const threadId = createThreadId();

  const config = { configurable: { thread_id: threadId } };

  const result: any = await graph.invoke(makeInitialState(input), config);

  if (result && result.__interrupt__) {
    const first = Array.isArray(result.__interrupt__)
      ? result.__interrupt__[0]
      : result.__interrupt__;

    const steps = (first?.value?.steps as string[]) ?? [];
    return {
      interrupt: {
        threadId,
        steps,
      },
    };
  }

  return {
    final: result as State,
  };
}

export async function resumeAgentRun(args: {
  threadId: string;
  approve: boolean;
}): Promise<State> {
  const { threadId, approve } = args;
  const config = { configurable: { thread_id: threadId } };

  const finalState = (await graph.invoke(
    new Command({ resume: { approve } }),
    config
  )) as State;

  return finalState;
}

/** Custom previews are display-only; updates and checkpoints stay authoritative. */
async function* streamRun(
  input: Parameters<typeof graph.invoke>[0],
  threadId: string,
  signal?: AbortSignal
): AsyncGenerator<AgentStreamEvent> {
  const config = { configurable: { thread_id: threadId }, signal };
  yield { type: "started", threadId };

  const stream = await graph.stream(input, {
    ...config,
    streamMode: ["custom", "updates"],
  });
  for await (const [mode, data] of stream) {
    if (mode === "custom") {
      const preview = PreviewSchema.safeParse(data);
      if (preview.success) yield preview.data;
    } else if (mode === "updates" && data && typeof data === "object") {
      for (const node of Object.keys(data)) {
        if (node !== INTERRUPT) yield { type: "progress", node };
      }
    }
  }

  signal?.throwIfAborted();
  const snapshot = await graph.getState(config);
  const interrupts = snapshot.tasks.flatMap((task) => task.interrupts ?? []);
  if (interrupts.length) {
    const payload = z.object({ steps: z.array(z.string()) }).parse(interrupts[0].value);
    yield {
      type: "needs_approval",
      threadId,
      steps: payload.steps,
      prompt: "Approve the generated plan to continue, or reject to cancel.",
    };
  } else {
    const final = snapshot.values as State;
    if (final.status !== "done" && final.status !== "cancelled") {
      throw new Error("The graph ended without a final result");
    }
    yield { type: "final", final };
  }
}

export function streamAgentRun(input: string, signal?: AbortSignal) {
  return streamRun(makeInitialState(input), createThreadId(), signal);
}

export async function* streamResumeAgentRun(
  args: { threadId: string; approve: boolean },
  signal?: AbortSignal
): AsyncGenerator<AgentStreamEvent> {
  const snapshot = await graph.getState({ configurable: { thread_id: args.threadId } });
  if (!snapshot.tasks.some((task) => task.interrupts?.length)) {
    throw new Error("No pending approval found for this thread");
  }
  yield* streamRun(new Command({ resume: { approve: args.approve } }), args.threadId, signal);
}
