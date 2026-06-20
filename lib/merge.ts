import { Doc, ScheduleItem } from "./schema";
import type { SheetData } from "./sources/sheetSource";

function todayBrisbane(now: Date): string {
  const p = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Australia/Brisbane",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const v = (t: string) => p.find((x) => x.type === t)!.value;
  return `${v("year")}-${v("month")}-${v("day")}`;
}

function timeToMinutes(time: string): number {
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

// Deduplicate across sources: same time + same title (case-insensitive) = same event
function dedup(items: ScheduleItem[]): ScheduleItem[] {
  const seen = new Set<string>();
  const result: ScheduleItem[] = [];
  for (const item of items) {
    const key = `${item.time}|${item.title.toLowerCase().trim()}`;
    if (!seen.has(key)) {
      seen.add(key);
      result.push(item);
    }
  }
  return result;
}

export function merge(
  sheet: SheetData,
  calendarItems: ScheduleItem[],
  now: Date = new Date()
): Doc {
  // All-day items sort before timed items; timed items sort by time
  const sorted = dedup(calendarItems).sort(
    (a, b) => timeToMinutes(a.time) - timeToMinutes(b.time)
  );

  return {
    name: sheet.name,
    preferredName: sheet.preferredName,
    scheduleDate: todayBrisbane(now),
    schedule: sorted,
    reminders: sheet.reminders,
    contacts: sheet.contacts,
  };
}
