export type InterruptView = {
  threadId: string;
  steps: string[];
  prompt: string;
};

export type FinalView = {
  status: "planned" | "done" | "cancelled";
  message?: string;
  steps?: string[];
  results?: { step: string; note: string }[];
};

export type AgentStreamEvent =
  | { type: "started"; threadId: string }
  | { type: "preview"; node: "plan" | "execute"; items: string[] }
  | { type: "progress"; node: string }
  | ({ type: "needs_approval" } & InterruptView)
  | { type: "final"; final: FinalView }
  | { type: "error"; message: string };

export type LiveView = {
  phase: "plan" | "execute" | "reject";
  steps: string[];
  notes: string[];
};
