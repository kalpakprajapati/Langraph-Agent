import type { LangGraphRunnableConfig } from "@langchain/langgraph";
import { arrayPreviewCallbacks } from "../streaming";
import { ChatGoogleGenerativeAI } from "@langchain/google-genai";
import { z } from "zod";
import { env } from "../../utils/env";
import { State } from "../types";

const NotesSchema = z.object({
  notes: z.array(z.string().min(1).max(500)).min(1).max(20),
});

type Notes = z.infer<typeof NotesSchema>;

function makeModel() {
  return new ChatGoogleGenerativeAI({
    apiKey: env.GEMINI_API_KEY,
    model: env.GEMINI_MODEL,
    temperature: 0.2,
    streaming: true,
  });
}

function createHumanPromptContent(steps: string[]) {
  const list = JSON.stringify(steps, null, 0);

  return [
    "You are a concise assistant.",
    'Given a list of steps, return a JSON object {"notes" : string[]}',
    "Rules:",
    "notes.length must be equals as steps.length",
    "Each note <=300 characters",
    "Plain text, no markdown",
    "",
    `Steps = ${list}`,
  ].join("\n");
}

export async function executeNode(state: State, config: LangGraphRunnableConfig): Promise<Partial<State>> {
  if (!state.approved) return {};

  const steps = state.steps ?? [];
  if (steps.length === 0) return {};

  const model = makeModel();
  const structured = model.withStructuredOutput(NotesSchema, { method: "jsonSchema" });

  const out: Notes = await structured.invoke([
    {
      role: "system",
      content: "Return only valid JSON matching the schema",
    },
    {
      role: "human",
      content: createHumanPromptContent(steps),
    },
  ], { ...config, callbacks: arrayPreviewCallbacks(config, "execute", "notes", steps.length) });

  const count = Math.min(steps.length, out.notes.length);
  const results = Array.from({ length: count }, (_, i) => ({
    step: steps[i],
    note: out.notes[i],
  }));

  return {
    results,
    status: "done",
    message: `Executed ${results.length} step(s)`,
  };
}
