"use client";

import {
  AlertCircle,
  CheckCircle,
  CheckCircle2,
  Loader2,
  Sparkles,
  ThumbsDown,
  ThumbsUp,
} from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "../ui/card";
import { FinalView, InterruptView } from "@/lib/types";
import { Button } from "../ui/button";
import { Alert, AlertDescription, AlertTitle } from "../ui/alert";

function RunLogs({
  interrupt,
  final,
  loading,
  onApprove,
  onReject,
}: {
  interrupt?: InterruptView | null;
  final?: FinalView | null;
  loading?: boolean;
  onApprove?: () => void;
  onReject?: () => void;
}) {
  if (loading) {
    return (
      <Card className="mt-5 border-primary/20">
        <CardContent className="flex items-center justify-center py-12">
          <div className="text-center space-y-3">
            <Loader2 className="h-8 w-8 animate-spin text-primary mx-auto" />
            <p className="text-2xl font-bold text-muted-foreground">
              Agent is processing your request...
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (interrupt) {
    return (
      <Card className="mt-5 border-primary/20">
        <div className="p-6">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-2xl">
              <AlertCircle className="h-5 w-5 text-yellow-500" />
              Approval Required
            </CardTitle>
          </CardHeader>
          <CardDescription className="text-base pt-3">
            {interrupt?.prompt}
          </CardDescription>
          <CardContent className="space-y-5">
            <div className="space-y-3 mt-5">
              <h4 className="font-semibold text-sm text-muted-foreground uppercase tracking-wide">
                Planned Steps
              </h4>
              <ol className="space-y-2 pl-6 list-decimal">
                {interrupt?.steps.map((step, i) => (
                  <li
                    className="text-foreground leading-relaxed"
                    key={`${step}-${i}`}
                  >
                    {step}
                  </li>
                ))}
              </ol>
              <div className="mt-6 flex gap-3">
                <Button onClick={onApprove} className="flex-1">
                  <ThumbsUp className="mr-2 h-4 w-4" />
                  Approve & Continue
                </Button>
                <Button
                  variant="outline"
                  onClick={onReject}
                  className="flex-1 border-destructive/40"
                >
                  <ThumbsDown className="mr-2 h-4 w-4" />
                  Reject Plan
                </Button>
              </div>
            </div>
          </CardContent>
        </div>
      </Card>
    );
  }

  if (final) {
    return (
      <Card className="mt-6">
        <CardHeader>
          <div className="flex items-center justify-center">
            <CardTitle className="flex items-center gap-2 text-xl text-green-700">
              <CheckCircle2 className="h-5 w-5 text-green-500" />
              Execution Result
            </CardTitle>
            <CardContent>
              {final.message && (
                <Alert>
                  <AlertTitle>Status Message</AlertTitle>
                  <AlertDescription>{final?.message}</AlertDescription>
                </Alert>
              )}
              {final?.steps && final?.steps?.length > 0 && (
                <div className="space-y-3 mt-6">
                  <h4 className="text-2xl text-muted-foreground font-bold">
                    Execution Steps
                  </h4>
                  <ol className="space-y-2 pl-6 list-decimal">
                    {final?.steps.map((step, i) => (
                      <li
                        className="text-foreground leading-relaxed"
                        key={`${step}-${i}`}
                      >
                        {step}
                      </li>
                    ))}
                  </ol>
                </div>
              )}

              {final?.results && final?.results?.length > 0 && (
                <div className="space-y-3 mt-7">
                  <h4 className="text-3xl text-muted-foreground font-bold">
                    Results
                  </h4>
                  <ul className="space-y-3">
                    {final?.results?.map((result, index) => (
                      <li
                        key={`${result.step}-${index}`}
                        className="bg-accent/30 rounded-lg p-4 border border-border/50"
                      >
                        <p className="font-semibold text-foreground mb-1">
                          {result?.step}
                        </p>
                        <p className="text-sm text-muted-foreground">
                          {result?.note}
                        </p>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </CardContent>
          </div>
        </CardHeader>
      </Card>
    );
  }

  return (
    <Card className="mt-6 border-dashed">
      <CardContent className="flex items-center justify-center py-12">
        <div className="text-center space-y-2">
          <Sparkles className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
          <p className="text-2xl font-bold text-muted-foreground">
            No active run, Start the agent above to begin
          </p>
        </div>
      </CardContent>
    </Card>
  );
}

export default RunLogs;
