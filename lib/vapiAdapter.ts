import type { IncomingMessage, ServerResponse } from "http";
import type { ScheduleItem, Contact } from "./schema";
import type { TimeFacts } from "./timeFacts";

export interface VapiToolCallBody {
  message?: {
    toolCallList?: Array<{ id: string; function?: { name: string } }>;
  };
}

export async function readBody(req: IncomingMessage): Promise<VapiToolCallBody> {
  return new Promise((resolve) => {
    let data = "";
    req.on("data", (chunk: Buffer) => { data += chunk.toString(); });
    req.on("end", () => {
      try { resolve(JSON.parse(data) as VapiToolCallBody); }
      catch { resolve({}); }
    });
    req.on("error", () => resolve({}));
  });
}

export function vapiOk(res: ServerResponse, toolCallId: string, result: string): void {
  res.statusCode = 200;
  res.setHeader("Content-Type", "application/json");
  res.end(JSON.stringify({ results: [{ toolCallId, result }] }));
}

export function vapiError(res: ServerResponse, toolCallId: string, error: string): void {
  res.statusCode = 200;
  res.setHeader("Content-Type", "application/json");
  res.end(JSON.stringify({ results: [{ toolCallId, error }] }));
}

// Prose formatters — result must be a plain string
export function formatSchedule(schedule: ScheduleItem[]): string {
  if (schedule.length === 0) return "Marg has nothing scheduled today.";
  const items = schedule.map((s) => {
    const loc = s.location ? ` at ${s.location}` : "";
    return `${s.time}: ${s.title}${loc}`;
  });
  return `Today Marg has: ${items.join(". ")}.`;
}

export function formatReminders(reminders: string[]): string {
  if (reminders.length === 0) return "There are no standing reminders.";
  return `Reminders: ${reminders.join(". ")}.`;
}

export function formatPerson(
  name: string,
  preferredName: string,
  contacts: Contact[]
): string {
  const lines = [`Her full name is ${name}, she goes by ${preferredName}.`];
  for (const c of contacts) {
    const phone = c.phone ? `, phone ${c.phone}` : "";
    lines.push(`${c.name} is her ${c.relationship}${phone}.`);
  }
  return lines.join(" ");
}

// Phase 3: time-aware schedule — pre-computed phrases so the LLM never does time arithmetic
export function formatSchedulePhase3(
  items: ScheduleItem[],
  facts: TimeFacts,
  tomorrowItems: ScheduleItem[] = []
): string {
  const timeStamp = `It's ${facts.nowTimePhrase} (${facts.daySegment}).`;

  if (facts.nothingScheduled) {
    if (tomorrowItems.length > 0) {
      const tmr = tomorrowItems
        .map((it) => `${it.title} at ${it.time}${it.location ? ` at ${it.location}` : ""}`)
        .join(", ");
      return `${timeStamp} Nothing scheduled for today. Tomorrow: ${tmr}.`;
    }
    return `${timeStamp} Nothing scheduled for today.`;
  }

  if (facts.allPassed) {
    const list = facts.pastItems
      .map((it) => `${it.title}${it.location ? ` at ${it.location}` : ""} at ${it.time}`)
      .join(", ");
    const tmrNote =
      tomorrowItems.length > 0
        ? ` Tomorrow: ${tomorrowItems.map((it) => `${it.title} at ${it.time}`).join(", ")}.`
        : "";
    return `${timeStamp} All done for today. Marg had: ${list}.${tmrNote}`;
  }

  const nextPhrase = (() => {
    if (!facts.nextItem) return "";
    const loc = facts.nextItem.location ? ` at ${facts.nextItem.location}` : "";
    const rel = facts.nextRelativePhrase ? ` — ${facts.nextRelativePhrase}` : "";
    return ` Next is ${facts.nextItem.title}${loc}, ${facts.nextAbsolutePhrase}${rel}.`;
  })();

  const isPastSet = new Set(facts.pastItems);
  const allLine = items
    .map((it) => {
      const loc = it.location ? ` at ${it.location}` : "";
      const done = isPastSet.has(it) ? " (done)" : "";
      return `${it.time} ${it.title}${loc}${done}`;
    })
    .join(". ");

  const n = items.length;
  return `${timeStamp} Marg has ${n} ${n === 1 ? "thing" : "things"} today.${nextPhrase} Full schedule: ${allLine}.`;
}

export function formatWhatsNext(facts: TimeFacts, tomorrowItems: ScheduleItem[] = []): string {
  const timeStamp = `It's ${facts.nowTimePhrase}.`;

  if (facts.nothingScheduled || facts.allPassed) {
    const doneNote =
      facts.allPassed && facts.pastItems.length > 0
        ? ` Marg has had: ${facts.pastItems.map((it) => `${it.title} at ${it.time}`).join(" and ")}.`
        : "";
    if (tomorrowItems.length > 0) {
      const tmr = tomorrowItems
        .map((it) => `${it.title} at ${it.time}${it.location ? ` at ${it.location}` : ""}`)
        .join(", ");
      return `${timeStamp}${doneNote} Nothing more today. Tomorrow: ${tmr}.`;
    }
    return `${timeStamp}${doneNote} Nothing more for today.`;
  }

  if (!facts.nextItem) return `${timeStamp} No more appointments coming up for today.`;

  const loc = facts.nextItem.location ? ` at ${facts.nextItem.location}` : "";
  const rel = facts.nextRelativePhrase ? ` — ${facts.nextRelativePhrase}` : "";
  const timeStr = `${facts.nextAbsolutePhrase}${rel}`;
  const remaining = facts.remainingItems.length - 1;
  const tail =
    remaining > 0
      ? ` After that, ${remaining} more ${remaining === 1 ? "thing" : "things"} today.`
      : " That's the last thing today.";

  return `${timeStamp} Marg's next thing is ${facts.nextItem.title}${loc}, ${timeStr}.${tail}`;
}
