import { Doc, ScheduleItem, Contact } from "./schema";

export type NormaliserResult =
  | { ok: true; data: Doc }
  | { ok: false; reason: "stale" | "parse_error"; diagnostics?: string };

// Extended bullet pattern: any common list glyph or numbered/lettered list item
const BULLET_RE = /^\s*(?:\d+[.)]\s+|[a-z][)]\s+|[-•*·‣▸▪○◦→»–—]+\s*)/i;

const MONTHS: Record<string, number> = {
  january:1, february:2, march:3, april:4, may:5, june:6,
  july:7, august:8, september:9, october:10, november:11, december:12,
  jan:1, feb:2, mar:3, apr:4, jun:6, jul:7, aug:8, sep:9, sept:9, oct:10, nov:11, dec:12,
};

function todayBrisbane(now: Date): string {
  const p = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Australia/Brisbane", year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(now);
  const v = (t: string) => p.find(x => x.type === t)!.value;
  return `${v("year")}-${v("month")}-${v("day")}`;
}

export function normaliseTime(raw: string): string | null {
  const s = raw.trim().toLowerCase().replace(/\s+/g, "");
  if (!s) return null;

  // 12h: 10am, 10:30am, 10.30am
  const t12 = s.match(/^(\d{1,2})[:.]?(\d{2})?(am|pm)$/);
  if (t12) {
    const h = +t12[1], m = t12[2] ? +t12[2] : 0, per = t12[3].toUpperCase();
    if (h < 1 || h > 12 || m > 59) return null;
    return `${h}:${String(m).padStart(2, "0")} ${per}`;
  }

  // 24h: 14:00, 09:30
  const t24 = s.match(/^(\d{1,2}):(\d{2})$/);
  if (t24) {
    const h = +t24[1], m = +t24[2];
    if (h > 23 || m > 59) return null;
    return `${h % 12 || 12}:${String(m).padStart(2, "0")} ${h < 12 ? "AM" : "PM"}`;
  }

  // Bare hour: "10" → "10:00 AM", "14" → "2:00 PM", "2" → "2:00 PM"
  const bare = s.match(/^(\d{1,2})$/);
  if (bare) {
    const h = +bare[1];
    if (h < 1 || h > 23) return null;
    if (h >= 13) return `${h - 12}:00 PM`;
    return `${h}:00 ${h <= 5 ? "PM" : "AM"}`;
  }

  return null;
}

function parseDateHeader(line: string, now: Date): string | null {
  const m = line.match(/\(([^)]+)\)/);
  if (!m) return null;
  const inside = m[1].trim().toLowerCase();

  if (inside === "today") return todayBrisbane(now);

  // Numeric DD/MM[/YY or /YYYY]
  const num = inside.match(/^(\d{1,2})[/\-.:](\d{1,2})(?:[/\-.](\d{2,4}))?$/);
  if (num) {
    const d = +num[1], mo = +num[2];
    const yr = num[3]
      ? (num[3].length === 2 ? 2000 + +num[3] : +num[3])
      : +todayBrisbane(now).slice(0, 4);
    if (d < 1 || d > 31 || mo < 1 || mo > 12) return null;
    return `${yr}-${String(mo).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
  }

  // Word-based: "Tues 11 June 2026" — year optional, defaults to current year
  let day: number | null = null, month: number | null = null, year: number | null = null;
  for (const tok of inside.split(/\s+/)) {
    const t = tok.replace(/[.,]/g, "");
    if (/^\d{4}$/.test(t)) { year = +t; }
    else if (/^\d{1,2}(st|nd|rd|th)?$/.test(t)) {
      const n = +t.replace(/(st|nd|rd|th)$/, "");
      if (n >= 1 && n <= 31) day = n;
    } else if (MONTHS[t] !== undefined) { month = MONTHS[t]!; }
  }
  if (day === null || month === null) return null;
  if (year === null) year = +todayBrisbane(now).slice(0, 4);
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function firstCommaOutsideParens(s: string): number {
  let depth = 0;
  for (let i = 0; i < s.length; i++) {
    if (s[i] === "(") depth++;
    else if (s[i] === ")") depth--;
    else if (s[i] === "," && depth === 0) return i;
  }
  return -1;
}

function parseScheduleItem(line: string): ScheduleItem | null {
  const m = line.match(/^(.+?)\s*[—–\-]\s*(.+)$/);
  if (!m) return null;
  const time = normaliseTime(m[1].trim());
  const rest = m[2].trim();
  if (!time || !rest) return null;
  let title = rest;
  let location: string | undefined;
  const ci = firstCommaOutsideParens(rest);
  if (ci !== -1) {
    title = rest.slice(0, ci).trim();
    const tail = rest.slice(ci + 1).trim();
    if (tail) location = tail;
  }
  if (!title) return null;
  return location ? { time, title, location } : { time, title };
}

function parseContact(line: string): Contact | null {
  const m = line.match(/^(.+?)\s*\(([^)]+)\)\s*(?::\s*(.*))?$/);
  if (!m) return null;
  const name = m[1].trim(), rel = m[2].trim(), phone = (m[3] ?? "").trim();
  if (!name || !rel) return null;
  return phone ? { name, relationship: rel, phone } : { name, relationship: rel };
}

type Section = "none" | "today" | "reminders" | "contacts";

export function deterministicNormalise(raw: string, now: Date = new Date()): NormaliserResult {
  try {
    if (typeof raw !== "string" || raw.trim() === "")
      return { ok: false, reason: "parse_error", diagnostics: "Document is empty." };

    let name: string | null = null, preferredName: string | null = null;
    let scheduleDate: string | null = null;
    let todaySeen = false, remindersSeen = false, contactsSeen = false;
    const schedule: ScheduleItem[] = [], reminders: string[] = [], contacts: Contact[] = [];
    let section: Section = "none";

    for (const rawLine of raw.split(/\r?\n/)) {
      const line = rawLine.replace(/﻿/g, "").trim();
      if (!line) continue;
      const lower = line.toLowerCase();

      if (lower.startsWith("name:"))
        { name = line.slice("name:".length).trim() || null; section = "none"; continue; }
      if (lower.startsWith("preferred name:") || lower.startsWith("preferred:"))
        { preferredName = line.slice(line.indexOf(":") + 1).trim() || null; section = "none"; continue; }
      if (lower.startsWith("today")) {
        const ci = line.indexOf(":");
        if (ci !== -1) { const d = parseDateHeader(line.slice(0, ci), now); if (d) scheduleDate = d; }
        todaySeen = true; section = "today"; continue;
      }
      if (lower.startsWith("reminder")) { remindersSeen = true; section = "reminders"; continue; }
      if (lower.startsWith("contact"))  { contactsSeen = true;  section = "contacts";  continue; }

      const content = (BULLET_RE.test(line) ? line.replace(BULLET_RE, "") : line).trim();
      if (!content) continue;

      if (section === "today") {
        const item = parseScheduleItem(content);
        if (!item) return { ok: false, reason: "parse_error",
          diagnostics: `Could not parse: "${content}"\nExpected: "10:00 AM — Appointment, Location"` };
        schedule.push(item);
      } else if (section === "reminders") {
        reminders.push(content);
      } else if (section === "contacts") {
        const c = parseContact(content);
        if (!c) return { ok: false, reason: "parse_error",
          diagnostics: `Could not parse: "${content}"\nExpected: "Name (relationship): phone"` };
        contacts.push(c);
      }
    }

    const missing: string[] = [];
    if (!name) missing.push("Name");
    if (!preferredName) missing.push("Preferred name");
    if (!todaySeen) missing.push("Today section");
    if (!scheduleDate) missing.push("valid date in Today header (e.g. Today (11 June 2026):)");
    if (!remindersSeen) missing.push("Reminders section");
    if (!contactsSeen) missing.push("Contacts section");
    if (missing.length)
      return { ok: false, reason: "parse_error", diagnostics: `Missing: ${missing.join(", ")}` };

    if (scheduleDate !== todayBrisbane(now))
      return { ok: false, reason: "stale" };

    const r = Doc.safeParse({ name, preferredName, scheduleDate, schedule, reminders, contacts });
    if (!r.success)
      return { ok: false, reason: "parse_error", diagnostics: "Schema validation failed." };
    return { ok: true, data: r.data };
  } catch {
    return { ok: false, reason: "parse_error", diagnostics: "Unexpected parser error." };
  }
}
