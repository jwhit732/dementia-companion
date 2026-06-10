import { Doc, ScheduleItem, Contact } from "./schema";

export type ParseResult =
  | { ok: true; data: Doc }
  | { ok: false; reason: "stale" | "parse_error" | "unavailable" };

const MONTH_NAMES: Record<string, number> = {
  january: 1,
  february: 2,
  march: 3,
  april: 4,
  may: 5,
  june: 6,
  july: 7,
  august: 8,
  september: 9,
  october: 10,
  november: 11,
  december: 12,
  jan: 1,
  feb: 2,
  mar: 3,
  apr: 4,
  jun: 6,
  jul: 7,
  aug: 8,
  sep: 9,
  sept: 9,
  oct: 10,
  nov: 11,
  dec: 12,
};

const BULLET_RE = /^\s*[-•*]\s*/;

/**
 * Returns today's date in `Australia/Brisbane` timezone as a "YYYY-MM-DD"
 * string. Brisbane does not observe daylight saving so this is stable.
 */
function getTodayInBrisbane(now: Date = new Date()): string {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Australia/Brisbane",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  // en-CA gives YYYY-MM-DD
  const parts = fmt.formatToParts(now);
  const year = parts.find((p) => p.type === "year")?.value ?? "";
  const month = parts.find((p) => p.type === "month")?.value ?? "";
  const day = parts.find((p) => p.type === "day")?.value ?? "";
  return `${year}-${month}-${day}`;
}

/**
 * Strip a bullet marker (`-`, `•`, `*`) from the start of a line and
 * return the trimmed remainder. If no bullet is present returns `null`.
 */
function stripBullet(line: string): string | null {
  if (!BULLET_RE.test(line)) return null;
  return line.replace(BULLET_RE, "").trim();
}

/**
 * Normalise a time string to "H:MM AM/PM" form, accepting 12h variants
 * ("10:00am", "10:00 AM", "10am", "2pm") and 24h ("14:00", "09:30").
 * Returns null if the input is not parseable.
 */
export function normaliseTime(raw: string): string | null {
  const s = raw.trim().toLowerCase().replace(/\s+/g, "");
  if (!s) return null;

  // 12h with optional minutes: 10am, 10:30am, 2:00pm
  const twelve = s.match(/^(\d{1,2})(?::(\d{2}))?(am|pm)$/);
  if (twelve) {
    const hour = parseInt(twelve[1], 10);
    const minute = twelve[2] ? parseInt(twelve[2], 10) : 0;
    const period = twelve[3].toUpperCase();
    if (hour < 1 || hour > 12) return null;
    if (minute < 0 || minute > 59) return null;
    return `${hour}:${String(minute).padStart(2, "0")} ${period}`;
  }

  // 24h: 14:00, 09:30, 9:30
  const twentyFour = s.match(/^(\d{1,2}):(\d{2})$/);
  if (twentyFour) {
    const hour = parseInt(twentyFour[1], 10);
    const minute = parseInt(twentyFour[2], 10);
    if (hour < 0 || hour > 23) return null;
    if (minute < 0 || minute > 59) return null;
    let displayHour = hour % 12;
    if (displayHour === 0) displayHour = 12;
    const period = hour < 12 ? "AM" : "PM";
    return `${displayHour}:${String(minute).padStart(2, "0")} ${period}`;
  }

  return null;
}

/**
 * Parse the parenthetical date in a `Today (Tuesday 10 June 2025):`
 * header. Returns a "YYYY-MM-DD" string or null.
 */
function parseTodayHeaderDate(headerLine: string): string | null {
  const m = headerLine.match(/\(([^)]+)\)/);
  if (!m) return null;
  const inside = m[1].trim();
  // Expect optional day-of-week + day + month + year. Examples:
  //   Tuesday 10 June 2025
  //   10 June 2025
  const tokens = inside.split(/\s+/);
  // Find a numeric day, a month name, and a 4-digit year.
  let day: number | null = null;
  let month: number | null = null;
  let year: number | null = null;
  for (const tok of tokens) {
    const lower = tok.toLowerCase().replace(/[.,]/g, "");
    if (/^\d{4}$/.test(lower)) {
      year = parseInt(lower, 10);
    } else if (/^\d{1,2}(st|nd|rd|th)?$/.test(lower)) {
      const numeric = lower.replace(/(st|nd|rd|th)$/, "");
      const n = parseInt(numeric, 10);
      if (n >= 1 && n <= 31) day = n;
    } else if (MONTH_NAMES[lower] !== undefined) {
      month = MONTH_NAMES[lower];
    }
  }
  if (day === null || month === null || year === null) return null;
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

/**
 * Parse a single schedule line of the form `<time> — <title>[, <location>]`.
 * Returns null if the line is not a valid schedule item.
 */
function parseScheduleItem(line: string): ScheduleItem | null {
  // Split on em dash or hyphen surrounded by spaces, to avoid breaking
  // hyphenated words. Accept `—`, ` - `, or ` – `.
  const splitMatch = line.match(/^(.+?)\s*[—–-]\s*(.+)$/);
  if (!splitMatch) return null;
  const rawTime = splitMatch[1].trim();
  const rest = splitMatch[2].trim();
  const time = normaliseTime(rawTime);
  if (time === null) return null;
  if (!rest) return null;

  let title = rest;
  let location: string | undefined;
  const commaIdx = rest.indexOf(",");
  if (commaIdx !== -1) {
    title = rest.slice(0, commaIdx).trim();
    const tail = rest.slice(commaIdx + 1).trim();
    if (tail) location = tail;
  }
  if (!title) return null;

  const item: ScheduleItem = location
    ? { time, title, location }
    : { time, title };
  return item;
}

/**
 * Parse a single contact line of the form `Name (relationship): phone`.
 * Phone is optional. Returns null if the line is not a valid contact.
 */
function parseContactLine(line: string): Contact | null {
  const m = line.match(/^(.+?)\s*\(([^)]+)\)\s*(?::\s*(.*))?$/);
  if (!m) return null;
  const name = m[1].trim();
  const relationship = m[2].trim();
  const phoneRaw = (m[3] ?? "").trim();
  if (!name || !relationship) return null;
  const contact: Contact = phoneRaw
    ? { name, relationship, phone: phoneRaw }
    : { name, relationship };
  return contact;
}

type Section =
  | "none"
  | "today"
  | "reminders"
  | "contacts";

/**
 * Tolerant line-based parser. Accepts the raw text of a carer's daily
 * Google Doc and returns either the parsed `Doc` or a typed failure
 * reason. Never throws.
 *
 * @param raw  Raw document text (as fetched from Google Docs).
 * @param now  Optional injected "now" for deterministic testing.
 */
export function parseDoc(raw: string, now: Date = new Date()): ParseResult {
  try {
    if (typeof raw !== "string") {
      return { ok: false, reason: "parse_error" };
    }
    if (raw.trim() === "") {
      return { ok: false, reason: "parse_error" };
    }

    const lines = raw.split(/\r?\n/);

    let name: string | null = null;
    let preferredName: string | null = null;
    let scheduleDate: string | null = null;
    let todayHeaderSeen = false;
    let remindersHeaderSeen = false;
    let contactsHeaderSeen = false;

    const schedule: ScheduleItem[] = [];
    const reminders: string[] = [];
    const contacts: Contact[] = [];

    let section: Section = "none";

    for (const rawLine of lines) {
      const line = rawLine.replace(/\uFEFF/g, "");
      const trimmed = line.trim();
      if (trimmed === "") continue;

      const lower = trimmed.toLowerCase();

      // Section headers
      if (lower.startsWith("name:")) {
        const value = trimmed.slice("name:".length).trim();
        if (value) name = value;
        section = "none";
        continue;
      }
      if (lower.startsWith("preferred name:")) {
        const value = trimmed.slice("preferred name:".length).trim();
        if (value) preferredName = value;
        section = "none";
        continue;
      }
      if (lower.startsWith("today")) {
        // Expect `Today (...):`
        const colonIdx = trimmed.indexOf(":");
        if (colonIdx === -1) {
          // header without colon — treat as parse error later (no date)
          section = "today";
          todayHeaderSeen = true;
          continue;
        }
        const headerPart = trimmed.slice(0, colonIdx);
        const parsedDate = parseTodayHeaderDate(headerPart);
        if (parsedDate) scheduleDate = parsedDate;
        todayHeaderSeen = true;
        section = "today";
        continue;
      }
      if (lower.startsWith("reminders:")) {
        remindersHeaderSeen = true;
        section = "reminders";
        continue;
      }
      if (lower.startsWith("contacts:")) {
        contactsHeaderSeen = true;
        section = "contacts";
        continue;
      }

      // Body lines depend on the current section
      const content = stripBullet(trimmed) ?? trimmed;
      if (!content) continue;

      if (section === "today") {
        const item = parseScheduleItem(content);
        if (item === null) {
          // A non-empty bullet inside Today that can't be parsed is a
          // structural error. Be strict so carers see their mistake.
          return { ok: false, reason: "parse_error" };
        }
        schedule.push(item);
      } else if (section === "reminders") {
        reminders.push(content);
      } else if (section === "contacts") {
        const contact = parseContactLine(content);
        if (contact === null) {
          return { ok: false, reason: "parse_error" };
        }
        contacts.push(contact);
      }
      // section === "none": stray lines between sections are ignored
    }

    if (
      name === null ||
      preferredName === null ||
      !todayHeaderSeen ||
      scheduleDate === null ||
      !remindersHeaderSeen ||
      !contactsHeaderSeen
    ) {
      return { ok: false, reason: "parse_error" };
    }

    const today = getTodayInBrisbane(now);
    if (scheduleDate !== today) {
      return { ok: false, reason: "stale" };
    }

    const candidate = {
      name,
      preferredName,
      scheduleDate,
      schedule,
      reminders,
      contacts,
    };

    const result = Doc.safeParse(candidate);
    if (!result.success) {
      return { ok: false, reason: "parse_error" };
    }
    return { ok: true, data: result.data };
  } catch {
    return { ok: false, reason: "parse_error" };
  }
}
