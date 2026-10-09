import { consumeAgentStream } from "./event-stream";
import type { AgentStreamEvent } from "./types";

const BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:5000";

async function streamAgent(
  path: string,
  body: unknown,
  onEvent: (event: AgentStreamEvent) => void,
  signal?: AbortSignal
) {
  const res = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "text/event-stream" },
    body: JSON.stringify(body),
    signal,
  });
  if (!res.ok) {
    const error = await res.json().catch(() => null);
    throw new Error(error?.error ?? `Agent request failed: ${res.status}`);
  }
  if (!res.body || !res.headers.get("content-type")?.includes("text/event-stream")) {
    throw new Error("The backend did not return an event stream");
  }
  await consumeAgentStream(res.body, onEvent);
}

export function startAgent(
  input: string,
  onEvent: (event: AgentStreamEvent) => void,
  signal?: AbortSignal
) {
  return streamAgent("/agent", { input }, onEvent, signal);
}

export function approveAgent(
  threadId: string,
  approve: boolean,
  onEvent: (event: AgentStreamEvent) => void,
  signal?: AbortSignal
) {
  return streamAgent("/agent/approve", { threadId, approve }, onEvent, signal);
}
