import { Resend } from "resend";

/**
 * Reason an alert is being raised about the carer's schedule document.
 * - `"stale"` — the document's "Today" header date does not match the current date.
 * - `"parse_error"` — the document content failed to parse against the expected format.
 */
export type AlertReason = "stale" | "parse_error";

/** Debounce window: at most one alert per reason per 6 hours. */
const DEBOUNCE_MS = 6 * 60 * 60 * 1000;

/** Module-level in-memory store mapping reason -> last-sent epoch millis. */
const lastSent = new Map<AlertReason, number>();

/**
 * Reasons mapped to the human-readable subject suffix and plain-text body.
 * Single template, single source of truth (DRY).
 */
const REASON_COPY: Record<AlertReason, { subjectSuffix: string; body: string }> = {
  stale: {
    subjectSuffix: "schedule not updated",
    body:
      "The companion's schedule document has not been updated for today. " +
      "Please update the 'Today' header date and schedule, then save.",
  },
  parse_error: {
    subjectSuffix: "document parse error",
    body:
      "The companion's document could not be parsed. " +
      "Please check the format matches the carer guide and save again.",
  },
};

/**
 * Send a carer alert email about a stale or unparseable schedule document.
 *
 * Behaviour:
 * - Debounces to at most one email per `reason` per 6 hours (in-memory).
 * - Reads `RESEND_API_KEY`, `ALERT_FROM`, and `ALERT_TO` from the environment.
 * - Never throws. Errors (including missing env vars or Resend failures) are
 *   swallowed and logged so callers can fire-and-forget.
 *
 * @param reason - Why the alert is being raised.
 */
export async function sendAlert(reason: AlertReason): Promise<void> {
  const now = Date.now();
  const last = lastSent.get(reason) ?? 0;

  if (now - last < DEBOUNCE_MS) {
    console.log(`[alerts] suppressed (debounce): ${reason}`);
    return;
  }

  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.ALERT_FROM;
  const to = process.env.ALERT_TO;

  if (!apiKey || !from || !to) {
    console.log(
      `[alerts] error: missing env vars (RESEND_API_KEY/ALERT_FROM/ALERT_TO); reason=${reason}`,
    );
    return;
  }

  const { subjectSuffix, body } = REASON_COPY[reason];
  const subject = `Companion alert: ${subjectSuffix}`;

  try {
    const resend = new Resend(apiKey);
    await resend.emails.send({
      from,
      to,
      subject,
      text: body,
    });
    lastSent.set(reason, now);
    console.log(`[alerts] sent: ${reason}`);
  } catch (err) {
    console.log(`[alerts] error: ${(err as Error).message ?? String(err)}; reason=${reason}`);
  }
}

/**
 * Reset the in-memory debounce state. Intended for tests only.
 * @internal
 */
export function _resetDebounce(): void {
  lastSent.clear();
}
