import { z } from "zod";
import { model } from "../../utils/model";
import type { TaskNode } from "../types";

export const PlanSchema = z.object({
  steps: z.array(z.string().min(3).max(150)).min(1).max(5),
});

export const PlanNode: TaskNode = async (state, config) => {
  if (state.status === "cancelled") return {};
  const plan = await model.withStructuredOutput(PlanSchema).invoke([
    { role: "system", content: "You are a helpful planner. Keep steps concrete, actionable and beginner friendly. Return JSON matching the schema." },
    { role: "human", content: `User goal: "${state.input}"\nDraft a small plan with 3-5 steps. Each step is a short sentence of at most 150 characters.` },
  ], config);
  return { steps: plan.steps, status: "planned" };
};
