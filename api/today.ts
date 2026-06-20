import type { IncomingMessage, ServerResponse } from "http";
import { checkAuth } from "../lib/auth";
import { getCalendarItems, getTomorrowItems } from "../lib/sources/calendarSource";
import { computeTimeFacts } from "../lib/timeFacts";
import { readBody, vapiOk, vapiError, formatSchedulePhase3 } from "../lib/vapiAdapter";
import { sendAlert } from "../lib/alerts";

export default async function handler(
  req: IncomingMessage & { query?: Record<string, string | string[]> },
  res: ServerResponse
): Promise<void> {
  const body = await readBody(req);
  const toolCallId = body.message?.toolCallList?.[0]?.id ?? "unknown";

  if (!checkAuth({ headers: req.headers as Record<string, string | string[] | undefined>, query: req.query })) {
    vapiError(res, toolCallId, "unauthorized");
    return;
  }

  const now = new Date();
  try {
    const result = await getCalendarItems(now);

    if (!result.ok) {
      void sendAlert(result.reason, result.diagnostics);
      vapiError(res, toolCallId, "The schedule is unavailable right now. James needs to check it.");
      return;
    }

    const facts = computeTimeFacts(now, result.items);

    // Peek at tomorrow if today has nothing (or everything is done)
    const tomorrowItems =
      facts.nothingScheduled || facts.allPassed ? await getTomorrowItems(now) : [];

    vapiOk(res, toolCallId, formatSchedulePhase3(result.items, facts, tomorrowItems));
  } catch (err) {
    const msg = (err as Error).message ?? String(err);
    console.error(`[today] unexpected error: ${msg}`);
    void sendAlert("unknown", msg);
    vapiError(res, toolCallId, "The schedule is unavailable right now. [unknown]");
  }
}
