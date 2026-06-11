import * as nodemailer from "nodemailer";

export type AlertReason =
  | "stale"
  | "parse_error"
  | "auth_failure"
  | "fetch_403"
  | "fetch_404"
  | "fetch_error"
  | "unknown";

const DEBOUNCE_MS = 6 * 60 * 60 * 1000;
const lastSent = new Map<AlertReason, number>();

const REASON_COPY: Record<AlertReason, { subjectSuffix: string; body: string }> = {
  stale: {
    subjectSuffix: "schedule not updated",
    body: "The companion's schedule document has not been updated for today. Please update the 'Today' header date and schedule, then save.",
  },
  parse_error: {
    subjectSuffix: "document parse error",
    body: "The companion's document could not be parsed. Please check the format matches the carer guide and save again.",
  },
  auth_failure: {
    subjectSuffix: "authentication failure",
    body: "The companion could not authenticate with Google. The service account credentials may be invalid. Check GOOGLE_SA_KEY in Vercel.",
  },
  fetch_403: {
    subjectSuffix: "document access denied (403)",
    body: "The companion was denied access to the schedule document. Check that it is still shared with the service account.",
  },
  fetch_404: {
    subjectSuffix: "document not found (404)",
    body: "The companion could not find the schedule document. Check that DOC_ID in Vercel is correct.",
  },
  fetch_error: {
    subjectSuffix: "document fetch error",
    body: "The companion encountered an error fetching the schedule document from Google Drive.",
  },
  unknown: {
    subjectSuffix: "unexpected error",
    body: "The companion encountered an unexpected error. Check Vercel function logs for details.",
  },
};

export async function sendAlert(reason: AlertReason, detail?: string): Promise<void> {
  const now = Date.now();
  const last = lastSent.get(reason) ?? 0;

  if (now - last < DEBOUNCE_MS) {
    console.log(`[alerts] suppressed (debounce): ${reason}`);
    return;
  }

  const user = process.env.GMAIL_USER;
  const pass = process.env.GMAIL_APP_PASSWORD;
  const to = process.env.ALERT_TO;

  if (!user || !pass || !to) {
    console.log(`[alerts] missing env vars (GMAIL_USER/APP_PASSWORD/ALERT_TO); reason=${reason}`);
    return;
  }

  const { subjectSuffix, body: baseBody } = REASON_COPY[reason];
  const subject = `Companion alert: ${subjectSuffix}`;
  const text = detail ? `${baseBody}\n\nDetail: ${detail}` : baseBody;

  try {
    const transporter = nodemailer.createTransport({
      service: "gmail",
      auth: { user, pass },
    });

    await transporter.sendMail({ from: user, to, subject, text });
    lastSent.set(reason, now);
    console.log(`[alerts] sent: ${reason}`);
  } catch (err) {
    console.log(`[alerts] error: ${(err as Error).message ?? String(err)}; reason=${reason}`);
  }
}

export function _resetDebounce(): void {
  lastSent.clear();
}
