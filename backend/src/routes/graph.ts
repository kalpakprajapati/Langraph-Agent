import { Router, type Response } from "express";
import { z } from "zod";
import { once } from "node:events";
import { resumeAgentRun, startAgentRun, streamAgentRun, streamResumeAgentRun } from "../graph/graph";
import type { AgentStreamEvent } from "../graph/streaming";

const router = Router();
const StartSchema = z.object({ input: z.string().trim().min(1, "Input is needed") });
const ApproveSchema = z.object({ threadId: z.string().min(1), approve: z.boolean() });

async function sendStream(
  res: Response,
  run: (signal: AbortSignal) => AsyncIterable<AgentStreamEvent>
) {
  const controller = new AbortController();
  const close = () => { if (!res.writableEnded) controller.abort(); };
  res.on("close", close);
  res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders();

  // Keep otherwise idle connections alive while waiting for the model.
  const heartbeat = setInterval(() => {
    if (!res.destroyed && !res.writableEnded && !res.writableNeedDrain) res.write(": heartbeat\n\n");
  }, 15_000);

  try {
    for await (const event of run(controller.signal)) {
      controller.signal.throwIfAborted();
      if (!res.write(`data: ${JSON.stringify(event)}\n\n`)) {
        await once(res, "drain", { signal: controller.signal });
      }
    }
  } catch (error) {
    if (!controller.signal.aborted && !res.destroyed) {
      console.error("Agent stream failed:", error);
      const event: AgentStreamEvent = { type: "error", message: "The agent could not finish. Please start a new run." };
      res.write(`data: ${JSON.stringify(event)}\n\n`);
    }
  } finally {
    clearInterval(heartbeat);
    res.off("close", close);
    if (!res.destroyed && !res.writableEnded) res.end();
  }
}

router.post("/", async (req, res) => {
  const parsed = StartSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ status: "error", error: "A non-empty task is required" });
  if (req.get("accept")?.includes("text/event-stream")) {
    await sendStream(res, (signal) => streamAgentRun(parsed.data.input, signal));
    return;
  }
  try {
    const result = await startAgentRun(parsed.data.input);
    if ("final" in result) return res.json({ status: "ok", data: { kind: "final", final: result.final } });
    return res.json({
      status: "ok",
      data: { kind: "needs_approval", interrupt: {
        ...result.interrupt,
        prompt: "Approve the generated plan to continue, or reject to cancel.",
      } },
    });
  } catch (error) {
    console.error("Agent start failed:", error);
    return res.status(500).json({ status: "error", error: "Failed to start the agent" });
  }
});

router.post("/approve", async (req, res) => {
  const parsed = ApproveSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ status: "error", error: "A threadId and boolean approval are required" });
  if (req.get("accept")?.includes("text/event-stream")) {
    await sendStream(res, (signal) => streamResumeAgentRun(parsed.data, signal));
    return;
  }
  try {
    const final = await resumeAgentRun(parsed.data);
    return res.json({ status: "ok", data: { kind: "final", final } });
  } catch (error) {
    console.error("Agent resume failed:", error);
    return res.status(500).json({ status: "error", error: "Failed to resume the agent" });
  }
});

export default router;
