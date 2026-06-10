import * as fs from "fs";
import * as path from "path";

const VAPI_API_KEY = process.env.VAPI_API_KEY;
const VERCEL_URL = process.env.VERCEL_URL ?? "https://dementia-companion-rho.vercel.app";
const COMPANION_SECRET = process.env.COMPANION_SECRET;

if (!VAPI_API_KEY) { console.error("Missing VAPI_API_KEY"); process.exit(1); }
if (!COMPANION_SECRET) { console.error("Missing COMPANION_SECRET"); process.exit(1); }

const systemPrompt = fs.readFileSync(
  path.resolve(process.cwd(), "prompts/system-prompt.md"),
  "utf8"
);

const tools = [
  {
    type: "function",
    function: {
      name: "get_today_schedule",
      description: "Get today's schedule for Margaret — appointments, activities, and their times and locations.",
      parameters: { type: "object", properties: {}, required: [] },
    },
    server: {
      url: `${VERCEL_URL}/api/today`,
      headers: { "x-companion-secret": COMPANION_SECRET },
    },
  },
  {
    type: "function",
    function: {
      name: "get_reminders",
      description: "Get standing reminders for Margaret — medications, things to remember, recurring notes.",
      parameters: { type: "object", properties: {}, required: [] },
    },
    server: {
      url: `${VERCEL_URL}/api/reminders`,
      headers: { "x-companion-secret": COMPANION_SECRET },
    },
  },
  {
    type: "function",
    function: {
      name: "get_person_context",
      description: "Get information about Margaret and the people in her life — family members, friends, contact numbers.",
      parameters: { type: "object", properties: {}, required: [] },
    },
    server: {
      url: `${VERCEL_URL}/api/person`,
      headers: { "x-companion-secret": COMPANION_SECRET },
    },
  },
];

const assistantConfig = {
  name: "Margaret's Companion",
  firstMessage: "Hello Marg, lovely to hear your voice. How can I help you today?",
  model: {
    provider: "anthropic",
    model: "claude-sonnet-4-6",
    messages: [{ role: "system", content: systemPrompt }],
    tools,
    temperature: 0.3,
  },
  voice: {
    provider: "11labs",
    voiceId: "XrExE9yKIg1WjnnlVkGX", // Matilda — warm, friendly female
    stability: 0.5,
    similarityBoost: 0.75,
    speed: 0.85,
  },
  transcriber: {
    provider: "deepgram",
    model: "nova-2",
    language: "en-AU",
  },
  silenceTimeoutSeconds: 30,
  maxDurationSeconds: 600,
  backgroundSound: "off",
  backchannelingEnabled: false,
  endCallMessage: "Take good care, Marg. James is always just a call away.",
};

console.log("[vapi] Creating assistant...");

fetch("https://api.vapi.ai/assistant", {
  method: "POST",
  headers: {
    Authorization: `Bearer ${VAPI_API_KEY}`,
    "Content-Type": "application/json",
  },
  body: JSON.stringify(assistantConfig),
})
  .then(async (res) => {
    const body = await res.json() as Record<string, unknown>;
    if (!res.ok) {
      console.error("[vapi] API error:", JSON.stringify(body, null, 2));
      process.exit(1);
    }
    const outPath = path.resolve(process.cwd(), "vapi/assistant-config.json");
    fs.writeFileSync(outPath, JSON.stringify(body, null, 2));
    console.log(`[vapi] Assistant created! ID: ${body["id"]}`);
    console.log(`[vapi] Config saved to vapi/assistant-config.json`);
    console.log(`\nNext: assign this assistant to your Twilio number in the Vapi dashboard.`);
  })
  .catch((err: Error) => {
    console.error("[vapi] Request failed:", err.message);
    process.exit(1);
  });
