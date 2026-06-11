import type { IncomingMessage, ServerResponse } from "http";
import { checkAuth } from "../lib/auth";
import { sendAlert, _resetDebounce } from "../lib/alerts";

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

  // Reset debounce so the test email always fires
  _resetDebounce();

  try {
    await sendAlert("stale", "Triggered by /api/test-alert — safe to ignore.");
    res.statusCode = 200;
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ ok: true, message: "Alert fired — check inbox." }));
  } catch (err) {
    res.statusCode = 200;
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ ok: false, error: (err as Error).message }));
  }
}
