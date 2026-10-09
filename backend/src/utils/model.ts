import { ChatGoogle } from "@langchain/google/node";
import { env } from "./env";

// Reuse the same stateless client in both model nodes.
export const model = new ChatGoogle({
  apiKey: env.GEMINI_API_KEY,
  model: env.GEMINI_MODEL,
});
