import * as fs from "fs";
import * as path from "path";

const VAPI_API_KEY = process.env.VAPI_API_KEY;
const COMPANION_SECRET = process.env.COMPANION_SECRET;
const VERCEL_URL = process.env.VERCEL_URL ?? "https://dementia-companion-rho.vercel.app";

const configPath = path.resolve(process.cwd(), "vapi/assistant-config.json");
const config = JSON.parse(fs.readFileSync(configPath, "utf8")) as { id: string };
const ASSISTANT_ID = config.id;

if (!VAPI_API_KEY) { console.error("Missing VAPI_API_KEY"); process.exit(1); }
if (!COMPANION_SECRET) { console.error("Missing COMPANION_SECRET"); process.exit(1); }

const systemPrompt = fs.readFileSync(
  path.resolve(process.cwd(), "prompts/system-prompt.md"),
  "utf8"
);

const secret = COMPANION_SECRET;
const tools = [
  {
    type: "function",
    function: {
      name: "get_today_schedule",
      description: "Get today's full schedule with pre-computed time context. When today is empty, also returns tomorrow's events. Use for any question about today's plans, today's appointments, or what's on tomorrow.",
      parameters: { type: "object", properties: {}, required: [] },
    },
    server: {
      url: `${VERCEL_URL}/api/today?secret=${secret}`,
      headers: { "x-companion-secret": secret },
    },
  },
  {
    type: "function",
    function: {
      name: "get_whats_next",
      description: "Get what's coming up next — a focused, time-relative phrase. Looks ahead to tomorrow if nothing is left today. Use for 'what's next?', 'anything soon?', 'anything left today?', 'anything coming up?', or 'anything tomorrow?'",
      parameters: { type: "object", properties: {}, required: [] },
    },
    server: {
      url: `${VERCEL_URL}/api/whats-next?secret=${secret}`,
      headers: { "x-companion-secret": secret },
    },
  },
  {
    type: "function",
    function: {
      name: "get_reminders",
      description: "Get standing reminders — medications, things to remember, recurring notes.",
      parameters: { type: "object", properties: {}, required: [] },
    },
    server: {
      url: `${VERCEL_URL}/api/reminders?secret=${secret}`,
      headers: { "x-companion-secret": secret },
    },
  },
  {
    type: "function",
    function: {
      name: "get_person_context",
      description: "Get information about the person and the people in her life — family members, friends, contact numbers.",
      parameters: { type: "object", properties: {}, required: [] },
    },
    server: {
      url: `${VERCEL_URL}/api/person?secret=${secret}`,
      headers: { "x-companion-secret": secret },
    },
  },
  {
    type: "function",
    function: {
      name: "get_current_time",
      description: "Get the current time and date in Brisbane. Use when asked what time it is, what day it is, or what the date is.",
      parameters: { type: "object", properties: {}, required: [] },
    },
    server: {
      url: `${VERCEL_URL}/api/current-time?secret=${secret}`,
      headers: { "x-companion-secret": secret },
    },
  },
  {
    type: "function",
    function: {
      name: "get_week_schedule",
      description: "Get appointments for the next 7 days. Only lists days that have something on. Use for 'what do I have this week?', 'what's coming up this week?', 'anything on in the next few days?'",
      parameters: { type: "object", properties: {}, required: [] },
    },
    server: {
      url: `${VERCEL_URL}/api/week-schedule?secret=${secret}`,
      headers: { "x-companion-secret": secret },
    },
  },
];

const patch = {
  firstMessage: "Hello Robyn, lovely to hear your voice. How can I help you today?",
  endCallMessage: "Take good care, Robyn. Imogen is always just a call away.",
  model: {
    provider: "anthropic",
    model: "claude-sonnet-4-6",
    messages: [{ role: "system", content: systemPrompt }],
    tools,
    temperature: 0.3,
  },
};

console.log(`[vapi] Updating assistant ${ASSISTANT_ID} — 5 tools + updated system prompt…`);

fetch(`https://api.vapi.ai/assistant/${ASSISTANT_ID}`, {
  method: "PATCH",
  headers: {
    Authorization: `Bearer ${VAPI_API_KEY}`,
    "Content-Type": "application/json",
  },
  body: JSON.stringify(patch),
})
  .then(async (res) => {
    const body = await res.json() as Record<string, unknown>;
    if (!res.ok) {
      console.error("[vapi] API error:", JSON.stringify(body, null, 2));
      process.exit(1);
    }
    fs.writeFileSync(configPath, JSON.stringify(body, null, 2));
    console.log("[vapi] Assistant updated. Config saved to vapi/assistant-config.json");
  })
  .catch((err: Error) => {
    console.error("[vapi] Request failed:", err.message);
    process.exit(1);
  });
