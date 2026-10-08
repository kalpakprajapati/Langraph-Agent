import dotenv from "dotenv";
dotenv.config();

import { z } from "zod";

const EnvSchema = z.object({
  GEMINI_API_KEY: z.string().min(1, "Api key is needed"),
  GEMINI_MODEL: z.string().default("gemini-3.5-flash-lite"),
  PORT: z.string(),
});

const parsed = EnvSchema.safeParse(process.env);

if (!parsed.success) {
  throw new Error("Error while parsing env");
}

const raw = parsed.data;

export const env = Object.freeze({
  GEMINI_API_KEY: raw.GEMINI_API_KEY,
  GEMINI_MODEL: raw.GEMINI_MODEL,
  PORT: raw.PORT,
});
