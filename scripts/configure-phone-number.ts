/**
 * Story 3.1 wiring — sets the Vapi phone number's serverUrl to /api/assistant-config
 * so persona knobs are injected on every inbound call.
 *
 * Usage:
 *   VAPI_API_KEY=... COMPANION_SECRET=... npx tsx scripts/configure-phone-number.ts
 */

const VAPI_API_KEY = process.env.VAPI_API_KEY;
const COMPANION_SECRET = process.env.COMPANION_SECRET;
const VERCEL_URL = process.env.VERCEL_URL ?? "https://dementia-companion-rho.vercel.app";

if (!VAPI_API_KEY) { console.error("Missing VAPI_API_KEY"); process.exit(1); }
if (!COMPANION_SECRET) { console.error("Missing COMPANION_SECRET"); process.exit(1); }

const assistantConfigUrl = `${VERCEL_URL}/api/assistant-config?secret=${COMPANION_SECRET}`;

async function run() {
  // List all phone numbers on the account
  const listRes = await fetch("https://api.vapi.ai/phone-number", {
    headers: { Authorization: `Bearer ${VAPI_API_KEY}` },
  });
  const numbers = await listRes.json() as Array<{ id: string; number?: string; serverUrl?: string; assistantId?: string }>;

  if (!Array.isArray(numbers) || numbers.length === 0) {
    console.error("[vapi] No phone numbers found on this account.");
    process.exit(1);
  }

  console.log("[vapi] Phone numbers on account:");
  numbers.forEach((n) => console.log(`  ${n.id}  ${n.number ?? "(no number)"}  serverUrl=${n.serverUrl ?? "(none)"}`));

  if (numbers.length > 1) {
    console.error("\n[vapi] Multiple numbers found — set PHONE_NUMBER_ID env var to specify which one.");
    process.exit(1);
  }

  const phoneNumber = numbers[0]!;
  console.log(`\n[vapi] Configuring phone number ${phoneNumber.id} (${phoneNumber.number ?? "unknown"})…`);
  console.log(`[vapi] Setting serverUrl → ${assistantConfigUrl}`);

  const patchRes = await fetch(`https://api.vapi.ai/phone-number/${phoneNumber.id}`, {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${VAPI_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ serverUrl: assistantConfigUrl }),
  });

  const body = await patchRes.json() as Record<string, unknown>;
  if (!patchRes.ok) {
    console.error("[vapi] API error:", JSON.stringify(body, null, 2));
    process.exit(1);
  }

  console.log("[vapi] Done. Inbound calls will now use /api/assistant-config for persona knobs.");
  console.log("[vapi] Make a test call to verify the greeting uses Robyn's name.");
}

run().catch((err: Error) => {
  console.error("[vapi] Failed:", err.message);
  process.exit(1);
});
