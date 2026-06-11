import * as fs from "fs";
import * as path from "path";

const VAPI_API_KEY = process.env.VAPI_API_KEY;
const COMPANION_SECRET = process.env.COMPANION_SECRET;
const VERCEL_URL = process.env.VERCEL_URL ?? "https://dementia-companion-rho.vercel.app";

if (!VAPI_API_KEY) { console.error("Missing VAPI_API_KEY"); process.exit(1); }
if (!COMPANION_SECRET) { console.error("Missing COMPANION_SECRET"); process.exit(1); }

const configPath = path.resolve(process.cwd(), "vapi/assistant-config.json");
const config = JSON.parse(fs.readFileSync(configPath, "utf8")) as { id: string };
const ASSISTANT_ID = config.id;

const webhookUrl = `${VERCEL_URL}/api/call-report?secret=${COMPANION_SECRET}`;

console.log(`[vapi] Setting end-of-call webhook on assistant ${ASSISTANT_ID}...`);
console.log(`[vapi] URL: ${webhookUrl}`);

fetch(`https://api.vapi.ai/assistant/${ASSISTANT_ID}`, {
  method: "PATCH",
  headers: {
    Authorization: `Bearer ${VAPI_API_KEY}`,
    "Content-Type": "application/json",
  },
  body: JSON.stringify({ serverUrl: webhookUrl }),
})
  .then(async (res) => {
    const body = await res.json() as Record<string, unknown>;
    if (!res.ok) {
      console.error("[vapi] API error:", JSON.stringify(body, null, 2));
      process.exit(1);
    }
    fs.writeFileSync(configPath, JSON.stringify(body, null, 2));
    console.log("[vapi] Webhook configured. Config saved to vapi/assistant-config.json");
    console.log("[vapi] Next: make a test call and check the journal Sheet for a new row.");
  })
  .catch((err: Error) => {
    console.error("[vapi] Request failed:", err.message);
    process.exit(1);
  });
