import type { IncomingMessage, ServerResponse } from "http";
import { checkAuth } from "../lib/auth";
import { getDocText } from "../lib/docReader";
import { parseDoc } from "../lib/parser";

export default async function handler(
  req: IncomingMessage,
  res: ServerResponse
): Promise<void> {
  res.setHeader("Content-Type", "application/json");

  if (req.method !== "GET") {
    res.statusCode = 405;
    res.end(JSON.stringify({ ok: false, reason: "method_not_allowed" }));
    return;
  }

  if (!checkAuth({ headers: req.headers as Record<string, string | string[] | undefined> })) {
    res.statusCode = 401;
    res.end(JSON.stringify({ ok: false, reason: "unauthorized" }));
    return;
  }

  try {
    const raw = await getDocText();
    const result = parseDoc(raw);

    if (!result.ok) {
      res.statusCode = 200;
      res.end(JSON.stringify({ ok: false, reason: "parse_error" }));
      return;
    }

    const { reminders } = result.data;
    res.statusCode = 200;
    res.end(JSON.stringify({ ok: true, data: { reminders } }));
  } catch {
    res.statusCode = 500;
    res.end(JSON.stringify({ ok: false, reason: "unavailable" }));
  }
}
