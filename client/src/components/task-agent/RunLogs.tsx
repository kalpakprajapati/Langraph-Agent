"use client";

import { AlertCircle, CheckCircle2, Loader2, Sparkles, ThumbsDown, ThumbsUp } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../ui/card";
import type { FinalView, InterruptView, LiveView } from "@/lib/types";
import { Button } from "../ui/button";
import { Alert, AlertDescription, AlertTitle } from "../ui/alert";

function Steps({ steps }: { steps: string[] }) {
  return (
    <ol className="space-y-2 pl-6 list-decimal">
      {steps.map((step, index) => (
        <li key={index} className="text-foreground leading-relaxed whitespace-pre-wrap">{step}</li>
      ))}
    </ol>
  );
}

export default function RunLogs({
  interrupt, final, live, error, loading, onApprove, onReject,
}: {
  interrupt?: InterruptView | null;
  final?: FinalView | null;
  live?: LiveView | null;
  error?: string | null;
  loading?: boolean;
  onApprove?: () => void;
  onReject?: () => void;
}) {
  const showLive = live && (loading || error);
  return (
    <div className="space-y-4">
      {error && (
        <Alert variant="destructive">
          <AlertCircle />
          <AlertTitle>Request failed</AlertTitle>
          <AlertDescription>{error} Any text shown below is an unfinished preview.</AlertDescription>
        </Alert>
      )}
      {showLive && (
        <Card className="border-primary/20" aria-busy={loading}>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-xl">
              {loading && <Loader2 className="h-5 w-5 animate-spin" />}
              {live.phase === "plan" ? "Creating your plan" :
                live.phase === "reject" ? "Cancelling the plan" : "Working through your plan"}
            </CardTitle>
            <CardDescription>{loading ? "The response appears as it is generated." : "Generation stopped before completion."}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {live.steps.length === 0 ? <p className="text-muted-foreground">Waiting for the first words...</p> :
              live.phase === "plan" ? <Steps steps={live.steps} /> :
                live.steps.map((step, index) => (
                  <div key={index} className="rounded-lg border p-4 space-y-2">
                    <p className="font-semibold">{index + 1}. {step}</p>
                    <p className="text-sm text-muted-foreground whitespace-pre-wrap">
                      {live.notes[index] || (loading ? "Waiting for this step..." : "No note generated.")}
                    </p>
                  </div>
                ))}
          </CardContent>
        </Card>
      )}
      {interrupt && !loading && !showLive && (
        <Card className="border-primary/20">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-2xl">
              <AlertCircle className="h-5 w-5 text-yellow-500" /> Approval Required
            </CardTitle>
            <CardDescription>{interrupt.prompt}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <Steps steps={interrupt.steps} />
            <div className="flex gap-3">
              <Button onClick={onApprove} disabled={loading} className="flex-1">
                <ThumbsUp className="mr-2 h-4 w-4" /> Approve & Continue
              </Button>
              <Button variant="outline" onClick={onReject} disabled={loading} className="flex-1">
                <ThumbsDown className="mr-2 h-4 w-4" /> Reject Plan
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
      {final && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-xl">
              {final.status === "cancelled" ? <AlertCircle className="h-5 w-5 text-yellow-500" /> :
                <CheckCircle2 className="h-5 w-5 text-green-500" />}
              {final.status === "cancelled" ? "Run cancelled" : "Execution Result"}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-5">
            {final.message && <Alert><AlertTitle>Status</AlertTitle><AlertDescription>{final.message}</AlertDescription></Alert>}
            {!!final.steps?.length && <Steps steps={final.steps} />}
            {!!final.results?.length && (
              <ul className="space-y-3">
                {final.results.map((result, index) => (
                  <li key={index} className="bg-accent/30 rounded-lg p-4 border border-border/50">
                    <p className="font-semibold mb-1">{result.step}</p>
                    <p className="text-sm text-muted-foreground whitespace-pre-wrap">{result.note}</p>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      )}
      {!live && !interrupt && !final && !error && (
        <Card className="border-dashed">
          <CardContent className="text-center py-12">
            <Sparkles className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
            <p className="text-muted-foreground">Start the agent above to begin.</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
