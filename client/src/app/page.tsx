"use client";

import AgentForm from "@/components/task-agent/AgentForm";
import RunLogs from "@/components/task-agent/RunLogs";
import { approveAgent, startAgent } from "@/lib/api";
import type { AgentStreamEvent, FinalView, InterruptView, LiveView } from "@/lib/types";
import { useEffect, useRef, useState } from "react";

export default function AgentPage() {
  const [loading, setLoading] = useState(false);
  const [interrupt, setInterrupt] = useState<InterruptView | null>(null);
  const [final, setFinal] = useState<FinalView | null>(null);
  const [live, setLive] = useState<LiveView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [threadId, setThreadId] = useState<string | null>(null);
  const request = useRef<AbortController | null>(null);
  const busy = useRef(false);

  useEffect(() => () => request.current?.abort(), []);

  function handleEvent(event: AgentStreamEvent) {
    switch (event.type) {
      case "started":
        setThreadId(event.threadId);
        break;
      case "preview":
        setLive((current) => ({
          phase: event.node,
          steps: event.node === "plan" ? event.items : current?.steps ?? [],
          notes: event.node === "execute" ? event.items : [],
        }));
        break;
      case "needs_approval":
        setThreadId(event.threadId);
        setInterrupt(event);
        setLive(null);
        break;
      case "final":
        setInterrupt(null);
        setLive(null);
        setFinal(event.final);
        break;
    }
  }

  async function handleAgentStart(input: string) {
    if (busy.current) return;
    busy.current = true;
    const controller = new AbortController();
    request.current = controller;
    setLoading(true);
    setFinal(null);
    setInterrupt(null);
    setThreadId(null);
    setError(null);
    setLive({ phase: "plan", steps: [], notes: [] });
    try {
      await startAgent(input, handleEvent, controller.signal);
    } catch (cause) {
      if (!controller.signal.aborted) {
        setError(cause instanceof Error ? cause.message : "Failed to start agent");
      }
    } finally {
      if (!controller.signal.aborted) {
        setLoading(false);
        busy.current = false;
      }
    }
  }

  async function handleDecision(approve: boolean) {
    if (!threadId || busy.current) return;
    busy.current = true;
    const controller = new AbortController();
    request.current = controller;
    setLoading(true);
    setError(null);
    setLive({ phase: approve ? "execute" : "reject", steps: interrupt?.steps ?? [], notes: [] });
    try {
      await approveAgent(threadId, approve, handleEvent, controller.signal);
    } catch (cause) {
      if (!controller.signal.aborted) {
        setError(cause instanceof Error ? cause.message : "Failed to resume agent");
      }
    } finally {
      if (!controller.signal.aborted) {
        setLoading(false);
        busy.current = false;
      }
    }
  }

  return (
    <main className="min-h-screen">
      <div className="max-w-5xl mx-auto space-y-6 px-4 py-8">
        <div className="text-center mb-8 space-y-2">
          <h1 className="text-4xl font-bold text-cyan-700">LangGraph Task Agent</h1>
          <p className="text-muted-foreground text-lg">
            AI-powered task planning with human approval and live responses
          </p>
        </div>
        <AgentForm disabled={loading} onStart={handleAgentStart} />
        <RunLogs
          interrupt={interrupt}
          final={final}
          live={live}
          error={error}
          loading={loading}
          onApprove={() => handleDecision(true)}
          onReject={() => handleDecision(false)}
        />
      </div>
    </main>
  );
}
