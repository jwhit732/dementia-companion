import * as fs from "fs";
import * as path from "path";

const VAPI_API_KEY = process.env.VAPI_API_KEY;
const configPath = path.resolve(process.cwd(), "vapi/assistant-config.json");
const config = JSON.parse(fs.readFileSync(configPath, "utf8")) as { id: string };
const ASSISTANT_ID = config.id;

if (!VAPI_API_KEY) { console.error("Missing VAPI_API_KEY"); process.exit(1); }

const COMPANION_SECRET = process.env.COMPANION_SECRET;
if (!COMPANION_SECRET) { console.error("Missing COMPANION_SECRET"); process.exit(1); }

const VERCEL_URL = process.env.VERCEL_URL ?? "https://dementia-companion-rho.vercel.app";

const patch = {
  model: {
    provider: "anthropic",
    model: "claude-sonnet-4-6",
    tools: [
      {
        type: "function",
        function: {
          name: "get_today_schedule",
          description: "Get today's schedule for Margaret — appointments, activities, and their times and locations.",
          parameters: { type: "object", properties: {}, required: [] },
        },
        server: {
          url: `${VERCEL_URL}/api/today?secret=${COMPANION_SECRET}`,
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
          url: `${VERCEL_URL}/api/reminders?secret=${COMPANION_SECRET}`,
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
          url: `${VERCEL_URL}/api/person?secret=${COMPANION_SECRET}`,
          headers: { "x-companion-secret": COMPANION_SECRET },
        },
      },
    ],
  },
};

console.log(`[vapi] Updating assistant ${ASSISTANT_ID} tools (Vapi response contract fix)...`);

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
    console.log("[vapi] Voice updated. Try the call again.");
  })
  .catch((err: Error) => {
    console.error("[vapi] Request failed:", err.message);
    process.exit(1);
  });
