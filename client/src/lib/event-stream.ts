import type { AgentStreamEvent } from "./types";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
function isStrings(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

function parseEvent(data: string): AgentStreamEvent {
  const value: unknown = JSON.parse(data);
  if (!isRecord(value)) throw new Error("Invalid stream event");
  switch (value.type) {
    case "started":
      if (typeof value.threadId === "string") return value as AgentStreamEvent;
      break;
    case "preview":
      if ((value.node === "plan" || value.node === "execute") && isStrings(value.items)) {
        return value as AgentStreamEvent;
      }
      break;
    case "progress":
      if (typeof value.node === "string") return value as AgentStreamEvent;
      break;
    case "needs_approval":
      if (typeof value.threadId === "string" && typeof value.prompt === "string" && isStrings(value.steps)) {
        return value as AgentStreamEvent;
      }
      break;
    case "final": {
      const final = value.final;
      if (isRecord(final) && (final.status === "done" || final.status === "cancelled") &&
        (final.message === undefined || typeof final.message === "string") &&
        (final.steps === undefined || isStrings(final.steps)) &&
        (final.results === undefined || (Array.isArray(final.results) && final.results.every(
          (item) => isRecord(item) && typeof item.step === "string" && typeof item.note === "string"
        )))) {
        return value as AgentStreamEvent;
      }
      break;
    }
    case "error":
      if (typeof value.message === "string") return value as AgentStreamEvent;
  }
  throw new Error("Invalid stream event");
}

// Network reads do not align with SSE frames or UTF-8 character boundaries.
export async function consumeAgentStream(
  body: ReadableStream<Uint8Array>,
  onEvent: (event: AgentStreamEvent) => void
): Promise<void> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let terminal = false;

  function dispatch(frame: string) {
    const data = frame.split(/\r?\n/)
      .filter((line) => line.startsWith("data:"))
      .map((line) => line.slice(5).replace(/^ /, ""))
      .join("\n");
    if (!data) return; // Ignore heartbeat/comment frames.
    const event = parseEvent(data);
    if (event.type === "error") throw new Error(event.message);
    if (event.type === "final" || event.type === "needs_approval") terminal = true;
    onEvent(event);
  }

  function drain() {
    let match: RegExpExecArray | null;
    while ((match = /\r?\n\r?\n/.exec(buffer))) {
      const frame = buffer.slice(0, match.index);
      buffer = buffer.slice(match.index + match[0].length);
      dispatch(frame);
    }
  }

  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) {
        buffer += decoder.decode();
        drain();
        if (buffer.trim()) throw new Error("Incomplete stream event");
        if (!terminal) throw new Error("Connection closed before the agent finished");
        return;
      }
      buffer += decoder.decode(value, { stream: true });
      drain();
    }
  } finally {
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}
