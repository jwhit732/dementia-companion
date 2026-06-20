import { google } from "googleapis";
import type { ScheduleItem } from "../schema";

export type CalendarReadResult =
  | { ok: true; items: ScheduleItem[] }
  | { ok: false; reason: "auth_failure" | "fetch_error"; diagnostics?: string };

let cache: { items: ScheduleItem[]; fetchedAt: number; dateKey: string } | null = null;
const CACHE_TTL_MS = 60_000;

function todayKeyBrisbane(now: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Australia/Brisbane",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

function brisbaneRangeForDay(dateKey: string): { timeMin: string; timeMax: string } {
  // Brisbane is UTC+10, no daylight saving
  return {
    timeMin: `${dateKey}T00:00:00+10:00`,
    timeMax: `${dateKey}T23:59:59+10:00`,
  };
}

function parseEventTime(
  dateTime: string | null | undefined,
  date: string | null | undefined
): string | null {
  if (date && !dateTime) return "All day";
  if (!dateTime) return null;

  const d = new Date(dateTime);
  const parts = new Intl.DateTimeFormat("en-AU", {
    timeZone: "Australia/Brisbane",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).formatToParts(d);

  const hour = parts.find((p) => p.type === "hour")?.value;
  const minute = parts.find((p) => p.type === "minute")?.value;
  const period = parts.find((p) => p.type === "dayPeriod")?.value?.toUpperCase();

  if (!hour || !minute || !period) return null;
  return `${parseInt(hour)}:${minute} ${period}`;
}

export async function getCalendarItems(now: Date = new Date()): Promise<CalendarReadResult> {
  const dateKey = todayKeyBrisbane(now);

  if (cache && cache.dateKey === dateKey && now.getTime() - cache.fetchedAt < CACHE_TTL_MS) {
    return { ok: true, items: cache.items };
  }

  const calendarId = process.env.CALENDAR_ID;
  if (!calendarId) {
    return { ok: false, reason: "fetch_error", diagnostics: "missing CALENDAR_ID env var" };
  }

  const saKeyRaw = process.env.GOOGLE_SA_KEY;
  if (!saKeyRaw) {
    return { ok: false, reason: "auth_failure", diagnostics: "missing GOOGLE_SA_KEY env var" };
  }

  try {
    const credentials = JSON.parse(Buffer.from(saKeyRaw, "base64").toString("utf8")) as Record<string, unknown>;
    const auth = new google.auth.GoogleAuth({
      credentials,
      scopes: ["https://www.googleapis.com/auth/calendar.readonly"],
    });

    const calendar = google.calendar({ version: "v3", auth });
    const { timeMin, timeMax } = brisbaneRangeForDay(dateKey);

    const res = await calendar.events.list({
      calendarId,
      timeMin,
      timeMax,
      singleEvents: true,
      orderBy: "startTime",
      timeZone: "Australia/Brisbane",
    });

    const items: ScheduleItem[] = [];
    for (const event of res.data.items ?? []) {
      if (!event.summary?.trim()) continue;
      const time = parseEventTime(event.start?.dateTime, event.start?.date);
      if (!time) continue;
      items.push({
        time,
        title: event.summary.trim(),
        ...(event.location?.trim() ? { location: event.location.trim() } : {}),
      });
    }

    cache = { items, fetchedAt: now.getTime(), dateKey };
    console.log(`[calendarSource] cache miss — fetched ${items.length} events for ${dateKey}`);
    return { ok: true, items };
  } catch (err) {
    const msg = (err as Error).message ?? String(err);
    return { ok: false, reason: "fetch_error", diagnostics: msg };
  }
}

export function clearCalendarCache(): void {
  cache = null;
}
