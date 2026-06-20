import * as fs from "fs";
import * as path from "path";
import { google } from "googleapis";

const saKeyRaw =
  process.env.GOOGLE_SA_KEY ??
  (() => {
    const keyPath = path.resolve(process.cwd(), "companion-sa-key.json");
    if (fs.existsSync(keyPath)) {
      console.log(`[verify-calendar] loading key from ${keyPath}`);
      return Buffer.from(fs.readFileSync(keyPath, "utf8")).toString("base64");
    }
    return undefined;
  })();

const calendarId = process.env.CALENDAR_ID;

if (!saKeyRaw) {
  console.error("[verify-calendar] ERROR: no service account key found.");
  process.exit(1);
}
if (!calendarId) {
  console.error(
    "[verify-calendar] ERROR: CALENDAR_ID env var not set.\n" +
      "  Get the calendar ID from Google Calendar settings → Integrate calendar.\n" +
      "  Then: export CALENDAR_ID=<id>"
  );
  process.exit(1);
}

const credentials = JSON.parse(Buffer.from(saKeyRaw, "base64").toString("utf8")) as Record<
  string,
  unknown
>;
const auth = new google.auth.GoogleAuth({
  credentials,
  scopes: ["https://www.googleapis.com/auth/calendar.readonly"],
});
const calendar = google.calendar({ version: "v3", auth });

console.log("[verify-calendar] authenticating…");

async function verify() {
  // List upcoming events (next 7 days) as a sanity check
  const now = new Date();
  const weekOut = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

  const res = await calendar.events.list({
    calendarId: calendarId!,
    timeMin: now.toISOString(),
    timeMax: weekOut.toISOString(),
    singleEvents: true,
    orderBy: "startTime",
    maxResults: 10,
    timeZone: "Australia/Brisbane",
  });

  const events = res.data.items ?? [];
  console.log(`\n[verify-calendar] SUCCESS — calendar accessible. ${events.length} event(s) in the next 7 days:\n`);

  if (events.length === 0) {
    console.log("  (no events — add some to the calendar to verify they appear)");
  } else {
    for (const e of events) {
      const when = e.start?.dateTime ?? e.start?.date ?? "?";
      console.log(`  ${when}  ${e.summary ?? "(no title)"}`);
    }
  }
  console.log();
}

verify().catch((err: Error & { code?: number }) => {
  if (err.code === 403 || err.code === 404) {
    console.error(
      "[verify-calendar] FAILED — 403/404 from Calendar API.\n" +
        "  Steps to fix:\n" +
        "  1. Enable the Calendar API on your GCP project (companion-voice-agent-2)\n" +
        "  2. Share the calendar with the service account (Viewer): Settings → Share with specific people\n" +
        `     SA email: ${(credentials.client_email as string) ?? "see companion-sa-key.json"}`
    );
  } else {
    console.error("[verify-calendar] FAILED —", err.message);
  }
  process.exit(1);
});
