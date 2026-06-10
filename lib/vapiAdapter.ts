import type { IncomingMessage, ServerResponse } from "http";
import type { ScheduleItem, Contact } from "./schema";

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
