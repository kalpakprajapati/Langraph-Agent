import { StateSchema, type GraphNode } from "@langchain/langgraph";
import { z } from "zod";

export const ExecutionStatus = z.enum(["planned", "done", "cancelled"]);
export type ExecutionStatus = z.infer<typeof ExecutionStatus>;
export const StepResult = z.object({ step: z.string(), note: z.string() });

// One schema defines the graph channels and their TypeScript types.
// These fields overwrite previous values; this sequential workflow needs no reducers.
export const TaskState = new StateSchema({
  input: z.string(),
  steps: z.array(z.string()).optional(),
  approved: z.boolean().optional(),
  results: z.array(StepResult).optional(),
  status: ExecutionStatus.optional(),
  message: z.string().optional(),
});
export type State = typeof TaskState.State;
export type StateUpdate = typeof TaskState.Update;
export type TaskNode = GraphNode<typeof TaskState>;

export const ApprovalRequestSchema = z.object({
  type: z.literal("approval_request"),
  steps: z.array(z.string()),
});
export const ApprovalDecisionSchema = z.object({ approve: z.boolean() });

export function makeInitialState(input: string): StateUpdate {
  return { input, status: "planned" };
}
