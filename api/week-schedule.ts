import type { IncomingMessage, ServerResponse } from "http";
import { checkAuth } from "../lib/auth";
import { getWeekItems } from "../lib/sources/calendarSource";
import { readBody, vapiOk, vapiError, formatWeekSchedule } from "../lib/vapiAdapter";
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

  try {
    const result = await getWeekItems(new Date());

    if (!result.ok) {
      void sendAlert(result.reason, result.diagnostics);
      vapiError(res, toolCallId, "The weekly schedule is unavailable right now. James needs to check it.");
      return;
    }

    vapiOk(res, toolCallId, formatWeekSchedule(result.days));
  } catch (err) {
    const msg = (err as Error).message ?? String(err);
    console.error(`[week-schedule] unexpected error: ${msg}`);
    void sendAlert("unknown", msg);
    vapiError(res, toolCallId, "The weekly schedule is unavailable right now. [unknown]");
  }
}
