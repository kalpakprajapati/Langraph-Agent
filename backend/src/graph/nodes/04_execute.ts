import { z } from "zod";
import { model } from "../../utils/model";
import type { TaskNode } from "../types";

export const executeNode: TaskNode = async (state, config) => {
  if (!state.approved) return {};
  const steps = state.steps ?? [];
  if (steps.length === 0) return {};

  const NotesSchema = z.object({
    notes: z.array(z.string().min(1).max(300)).length(steps.length),
  });
  const out = await model.withStructuredOutput(NotesSchema).invoke([
    { role: "system", content: "Return only valid JSON matching the schema." },
    { role: "human", content: [
      "Given these steps, return a JSON object with one note per step, in the same order.",
      "Each note must be plain text, without markdown, and at most 300 characters.",
      `Steps = ${JSON.stringify(steps)}`,
    ].join("\n") },
  ], config);
  const results = steps.map((step, i) => ({ step, note: out.notes[i] }));
  return { results, status: "done", message: `Executed ${results.length} step(s)` };
};
