import type { IncomingMessage, ServerResponse } from "http";
import { checkAuth } from "../lib/auth";
import { readBody, vapiOk, vapiError } from "../lib/vapiAdapter";

function currentTimePhraseAusBrisbane(): string {
  const now = new Date();
  const parts = new Intl.DateTimeFormat("en-AU", {
    timeZone: "Australia/Brisbane",
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).formatToParts(now);

  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  const h = parseInt(get("hour"));
  const min = get("minute");
  const period = get("dayPeriod").toUpperCase();
  const weekday = get("weekday");
  const day = get("day");
  const month = get("month");
  const year = get("year");

  return `It's ${h}:${min} ${period} on ${weekday} ${day} ${month} ${year}.`;
}

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

  vapiOk(res, toolCallId, currentTimePhraseAusBrisbane());
}
