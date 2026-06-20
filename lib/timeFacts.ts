import type { ScheduleItem } from "./schema";

export type DaySegment = "morning" | "afternoon" | "evening";

export interface TimeFacts {
  daySegment: DaySegment;
  nowMinutes: number;
  nowTimePhrase: string;         // "2:30 PM" — pre-computed so LLM never guesses the time
  nextItem: ScheduleItem | null;
  nextRelativePhrase: string;    // "in about 20 minutes" | "right now" | "" (empty → use absolute)
  nextAbsolutePhrase: string;    // "at 2 this afternoon"
  remainingItems: ScheduleItem[];
  pastItems: ScheduleItem[];
  allPassed: boolean;
  nothingScheduled: boolean;
}

// An item is considered past once 45 minutes have elapsed since its start
const PAST_THRESHOLD_MIN = 45;

export function timeToMinutes(time: string): number {
  if (time === "All day") return -1;
  const m = time.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
  if (!m) return 9999;
  let h = parseInt(m[1]);
  const min = parseInt(m[2]);
  const period = m[3].toUpperCase();
  if (period === "AM" && h === 12) h = 0;
  if (period === "PM" && h !== 12) h += 12;
  return h * 60 + min;
}

export function nowMinutesBrisbane(now: Date): number {
  const parts = new Intl.DateTimeFormat("en-AU", {
    timeZone: "Australia/Brisbane",
    hour: "numeric",
    minute: "numeric",
    hour12: false,
  }).formatToParts(now);
  const h = parseInt(parts.find((p) => p.type === "hour")?.value ?? "0");
  const min = parseInt(parts.find((p) => p.type === "minute")?.value ?? "0");
  return h * 60 + min;
}

function nowTimePhraseFromDate(now: Date): string {
  const parts = new Intl.DateTimeFormat("en-AU", {
    timeZone: "Australia/Brisbane",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).formatToParts(now);
  const h = parseInt(parts.find((p) => p.type === "hour")?.value ?? "0");
  const min = parts.find((p) => p.type === "minute")?.value ?? "00";
  const period = parts.find((p) => p.type === "dayPeriod")?.value?.toUpperCase() ?? "";
  return `${h}:${min} ${period}`;
}

function segmentOf(minutes: number): DaySegment {
  if (minutes < 720) return "morning";    // before noon
  if (minutes < 1080) return "afternoon"; // noon to 6 pm
  return "evening";
}

function dayPartLabel(itemMinutes: number): string {
  if (itemMinutes < 720) return "this morning";
  if (itemMinutes < 1080) return "this afternoon";
  return "this evening";
}

function absolutePhrase(item: ScheduleItem): string {
  const t = item.time;
  if (t === "All day") return "all day";
  // Drop ":00" for on-the-hour times: "2:00 PM" → "2 PM"
  const pretty = t.replace(/:00(\s*(?:AM|PM))$/i, "$1").trim();
  return `${pretty} ${dayPartLabel(timeToMinutes(t))}`;
}

function relativePhrase(diffMinutes: number): string {
  if (diffMinutes <= 2) return "right now";
  if (diffMinutes < 10) return "in a few minutes";
  if (diffMinutes < 20) return "in about 10 minutes";
  if (diffMinutes < 40) return "in about 20 minutes";
  if (diffMinutes < 55) return "in about half an hour";
  if (diffMinutes < 75) return "in about an hour";
  if (diffMinutes < 105) return "in about an hour and a half";
  if (diffMinutes < 150) return "in about 2 hours";
  return ""; // too far out — caller uses absolute phrase
}

export function computeTimeFacts(now: Date, items: ScheduleItem[]): TimeFacts {
  const nowMins = nowMinutesBrisbane(now);
  const daySegment = segmentOf(nowMins);

  const pastItems: ScheduleItem[] = [];
  const remainingItems: ScheduleItem[] = [];

  for (const item of items) {
    const mins = timeToMinutes(item.time);
    if (mins === -1 || nowMins - mins <= PAST_THRESHOLD_MIN) {
      remainingItems.push(item);
    } else {
      pastItems.push(item);
    }
  }

  const nothingScheduled = items.length === 0;
  const allPassed = !nothingScheduled && remainingItems.length === 0;

  // Next = first remaining item with a future start (not all-day)
  const nextItem =
    remainingItems.find((it) => it.time !== "All day" && timeToMinutes(it.time) > nowMins) ??
    null;

  let nextRelativePhrase = "";
  let nextAbsolutePhrase = "";
  if (nextItem) {
    const diff = timeToMinutes(nextItem.time) - nowMins;
    nextRelativePhrase = relativePhrase(diff);
    nextAbsolutePhrase = absolutePhrase(nextItem);
  }

  return {
    daySegment,
    nowMinutes: nowMins,
    nowTimePhrase: nowTimePhraseFromDate(now),
    nextItem,
    nextRelativePhrase,
    nextAbsolutePhrase,
    remainingItems,
    pastItems,
    allPassed,
    nothingScheduled,
  };
}
