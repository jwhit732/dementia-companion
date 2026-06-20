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
      description: "Get today's full schedule — all appointments with pre-computed time context (what segment of day it is, what's next). Use for 'what's my day?' or 'what have I got on today?'",
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
      description: "Get what's coming up next right now — a focused, time-relative phrase like 'physio in about 20 minutes'. Use for 'is there anything soon?' or 'what's next?' or 'anything left today?'",
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
];

const patch = {
  // firstMessage and endCallMessage are overridden per-call by /api/assistant-config
  // These are the fallback values if the override endpoint isn't reached
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

console.log(`[vapi] Updating assistant ${ASSISTANT_ID} — Phase 3 (4 tools + new system prompt)…`);

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
