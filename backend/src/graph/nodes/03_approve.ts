// role -> pause the graph to ask the user/human -> Approve these steps ?
// true, false
// write { arppoved } state

import { State } from "../types";

// per run helper passeed by langgraph in the node context
// interrupt({steps}) -> pauses
//  {threadID, steps} -> send back to UI
// post api call to approve endpoint
// backend -> resume -> new Command

export async function approveNode(
  state: State,
  context: any
): Promise<Partial<State>> {
  if (state.status === "cancelled") return {};

  const steps = state.steps ?? [];

  if (steps.length === 0) {
    return {
      approved: true,
      message: "No steps to approve; procedding->",
    };
  }

  const interrupt = context?.interrupt as (
    payload: unknown
  ) => Promise<unknown>;

  const decision = await interrupt({
    type: "approval_request",
    steps,
  });

  let approved: boolean;

  if (
    decision &&
    typeof decision === "object" &&
    "approve" in (decision as any)
  ) {
    approved = !!(decision as any).approve;
  } else {
    approved = !!decision;
  }

  return {
    approved,
  };
}
