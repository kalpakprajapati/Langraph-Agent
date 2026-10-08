const BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:5000";

export async function startAgent(input: string) {
  const res = await fetch(`${BASE}/agent`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ input }),
  });

  if (!res.ok) throw new Error(`Start agent failed: ${res.status}`);

  return res.json() as Promise<{
    status: "ok" | "error";
    data?:
      | { kind: "final"; final: any }
      | {
          kind: "needs_approval";
          interrupt: {
            threadId: string;
            steps: string[];
            prompt: string;
          };
        };
    error?: string;
  }>;
}

export async function approveAgent(threadId: string, approve: boolean) {
  const res = await fetch(`${BASE}/agent/approve`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ threadId, approve }),
  });

  if (!res.ok) throw new Error(`Approve step failed: ${res.status}`);

  return res.json() as Promise<{
    status: "ok" | "error";
    data?: { kind: "final"; final: any };
    error?: string;
  }>;
}
