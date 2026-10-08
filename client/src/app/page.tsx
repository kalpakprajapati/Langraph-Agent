"use client";
import AgentForm from "@/components/task-agent/AgentForm";
import RunLogs from "@/components/task-agent/RunLogs";
import { approveAgent, startAgent } from "@/lib/api";
import { FinalView, InterruptView } from "@/lib/types";
import { useState } from "react";

export default function AgentPage() {
  const [loading, setLoading] = useState(false);
  const [interrupt, setInterrupt] = useState<InterruptView | null>(null);
  const [final, setFinal] = useState<FinalView | null>(null);
  const [threadId, setThreadId] = useState<string | null>(null);

  async function handleAgentStart(input: string) {
    setLoading(true);
    setFinal(null);
    setInterrupt(null);
    setThreadId(null);
    try {
      const res = await startAgent(input);
      if (res.status === "error") throw new Error(res.error);

      if (res.data?.kind === "needs_approval") {
        setThreadId(res.data.interrupt.threadId);
        setInterrupt(res.data.interrupt);
      } else if (res.data?.kind === "final") {
        setFinal(res.data?.final);
      } else {
        throw new Error("Some error occured");
      }
    } catch (e: any) {
      setFinal({
        status: "cancelled",
        message: e?.message ?? "Failed to start agent run",
      });
    } finally {
      setLoading(false);
    }
  }

  async function handleOnApprove() {
    if (!threadId) return;
    setLoading(true);

    try {
      const res = await approveAgent(threadId, true);
      if (res.status === "error") throw new Error(res.error);
      setInterrupt(null);
      setFinal(res.data?.final ?? null);
    } catch (e: any) {
      setFinal({
        status: "cancelled",
        message: e?.message ?? "Failed to approve the flow",
      });
    } finally {
      setLoading(false);
    }
  }

  async function handleOnReject() {
    if (!threadId) return;
    setLoading(true);

    try {
      const res = await approveAgent(threadId, false);
      if (res.status === "error") throw new Error(res.error);
      setInterrupt(null);
      setFinal(res.data?.final ?? null);
    } catch (e: any) {
      setFinal({
        status: "cancelled",
        message: e?.message ?? "Failed to reject the flow",
      });
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen">
      <div className="max-w-5xl mx-auto space-y-6 py-8">
        <div className="text-center mb-8 space-y-2">
          <h1 className="text-4xl font-bold text-cyan-700">
            LangGraph Task Agent
          </h1>
          <p className="text-muted-foreground text-lg">
            AL-Powered task planning and execution with human-in-the-loop
          </p>
        </div>
        <AgentForm disabled={loading} onStart={handleAgentStart} />
        <RunLogs
          interrupt={interrupt}
          final={final}
          loading={loading}
          onApprove={handleOnApprove}
          onReject={handleOnReject}
        />
      </div>
    </main>
  );
}
