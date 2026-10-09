import { parsePartialJson } from "@langchain/core/output_parsers";
import type { LangGraphRunnableConfig } from "@langchain/langgraph";
import { z } from "zod";
import type { State } from "./types";

export const PreviewSchema = z.object({
  type: z.literal("preview"),
  node: z.enum(["plan", "execute"]),
  items: z.array(z.string()),
});

export type AgentStreamEvent =
  | { type: "started"; threadId: string }
  | z.infer<typeof PreviewSchema>
  | { type: "progress"; node: string }
  | { type: "needs_approval"; threadId: string; steps: string[]; prompt: string }
  | { type: "final"; final: State }
  | { type: "error"; message: string };

// A preview is display-only. The structured-output parser still validates the
// complete model response before the node commits anything to graph state.
export function arrayPreviewCallbacks(
  config: LangGraphRunnableConfig,
  node: "plan" | "execute",
  key: "steps" | "notes",
  maxItems: number
) {
  let json = "";
  let previous = "";

  return [{
    handleLLMNewToken(token: string) {
      json += token;
      let partial: unknown;
      try {
        partial = parsePartialJson(json);
      } catch {
        return; // A JSON string/escape may be split across model chunks.
      }
      if (!partial || typeof partial !== "object") return;
      const items = (partial as Record<string, unknown>)[key];
      if (!Array.isArray(items)) return;
      const strings = items.slice(0, maxItems).filter(
        (item): item is string => typeof item === "string"
      );
      const serialized = JSON.stringify(strings);
      if (serialized !== previous) {
        previous = serialized;
        config.writer?.({ type: "preview", node, items: strings });
      }
    },
  }];
}
