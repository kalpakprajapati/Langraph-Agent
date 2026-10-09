import { interrupt } from "@langchain/langgraph";
import { ApprovalDecisionSchema, type TaskNode } from "../types";

export const approveNode: TaskNode = (state) => {
  if (state.status === "cancelled") return {};
  const steps = state.steps ?? [];
  if (steps.length === 0) {
    return { approved: true, message: "No steps to approve; proceeding" };
  }

  // Pauses on the first run. On resume this node restarts, and interrupt()
  // returns the validated Command.resume value, not a graph state update.
  const decision = interrupt(
    { type: "approval_request", steps },
    { responseSchema: ApprovalDecisionSchema },
  );
  return { approved: decision.approve };
};
