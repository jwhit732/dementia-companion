import type { IncomingMessage, ServerResponse } from "http";
import { checkAuth } from "../lib/auth";
import { appendJournalRow } from "../lib/journal";

interface VapiToolCall {
  id?: string;
  function?: { name?: string };
}

interface VapiMessage {
  role?: string;
  toolCalls?: VapiToolCall[];
  toolCallId?: string;
  content?: string;
}

interface VapiEndOfCallReport {
  message?: {
    type?: string;
    summary?: string;
    analysis?: { summary?: string };
    messages?: VapiMessage[];
    call?: {
      id?: string;
      startedAt?: string;
      endedAt?: string;
      customer?: { number?: string };
    };
  };
}

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve) => {
    let data = "";
    req.on("data", (chunk: Buffer) => { data += chunk.toString(); });
    req.on("end", () => resolve(data));
    req.on("error", () => resolve(""));
  });
}

export function toAest(iso?: string): string {
  return (iso ? new Date(iso) : new Date()).toLocaleString("en-AU", {
    timeZone: "Australia/Brisbane",
  });
}

export function calcDuration(start?: string, end?: string): number {
  if (!start || !end) return 0;
  return Math.round((new Date(end).getTime() - new Date(start).getTime()) / 1000);
}

export function extractToolInfo(messages: VapiMessage[]): { fired: string; status: string } {
  const fired: string[] = [];
  const statuses: string[] = [];

  for (const msg of messages) {
    if (msg.role === "assistant" && msg.toolCalls?.length) {
      for (const tc of msg.toolCalls) {
        fired.push(tc.function?.name ?? "unknown");
      }
    }
    if (msg.role === "tool") {
      const content = msg.content ?? "";
      const isOk = content.length > 0 && !content.toLowerCase().startsWith("error");
      statuses.push(`${msg.toolCallId ?? "?"}: ${isOk ? "ok" : "error"}`);
    }
  }

  return {
    fired: fired.length ? fired.join(", ") : "none",
    status: statuses.join(", "),
  };
}

export default async function handler(
  req: IncomingMessage & { query?: Record<string, string | string[]> },
  res: ServerResponse
): Promise<void> {
  if (!checkAuth({
    headers: req.headers as Record<string, string | string[] | undefined>,
    query: req.query,
  })) {
    res.statusCode = 401;
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ error: "unauthorized" }));
    return;
  }

  const raw = await readBody(req);
  let payload: VapiEndOfCallReport;
  try { payload = JSON.parse(raw) as VapiEndOfCallReport; }
  catch { payload = {}; }

  const msg = payload.message;

  // Ignore non-report events — Vapi sends several event types to serverUrl
  if (msg?.type && msg.type !== "end-of-call-report") {
    res.statusCode = 200;
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ ok: true }));
    return;
  }

  const call = msg?.call;
  const callId = call?.id ?? "unknown";
  const { fired, status } = extractToolInfo(msg?.messages ?? []);
  const summary = msg?.analysis?.summary ?? msg?.summary ?? "(no summary)";

  try {
    await appendJournalRow({
      timestamp: toAest(call?.startedAt),
      caller: call?.customer?.number ?? "unknown",
      durationSecs: calcDuration(call?.startedAt, call?.endedAt),
      toolsFired: fired,
      toolStatus: status,
      summary,
      transcriptLink: `https://dashboard.vapi.ai/calls/${callId}`,
      callId,
    });

    res.statusCode = 200;
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ ok: true }));
  } catch (err) {
    console.error("[call-report] journal append failed:", (err as Error).message);
    // Always 200 so Vapi doesn't retry; the error is logged
    res.statusCode = 200;
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ ok: false, error: (err as Error).message }));
  }
}
