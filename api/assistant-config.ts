import type { IncomingMessage, ServerResponse } from "http";
import { checkAuth } from "../lib/auth";
import { getSheetData } from "../lib/sources/sheetSource";
import type { PersonaKnobs } from "../lib/schema";

const ASSISTANT_ID =
  process.env.VAPI_ASSISTANT_ID ?? "d7d001fc-d9ec-47d3-af89-91a4a3083053";

const SAFE_DEFAULTS: PersonaKnobs = {
  preferred_name: "Marg",
  persona_name: "Companion",
  greeting_style: "warm",
  redirect_contact: "James",
};

function buildResponse(knobs: PersonaKnobs) {
  return {
    assistantId: ASSISTANT_ID,
    assistantOverrides: {
      // firstMessage and endCallMessage use knob values
      firstMessage: `Hello ${knobs.preferred_name}, lovely to hear your voice. How can I help you today?`,
      endCallMessage: `Take good care, ${knobs.preferred_name}. ${knobs.redirect_contact} is always just a call away.`,
      variableValues: {
        preferred_name: knobs.preferred_name,
        persona_name: knobs.persona_name,
        greeting_style: knobs.greeting_style,
        redirect_contact: knobs.redirect_contact,
      },
    },
  };
}

export default async function handler(
  req: IncomingMessage & { query?: Record<string, string | string[]> },
  res: ServerResponse
): Promise<void> {
  // Auth check — the phone number serverUrl should include ?secret=...
  if (!checkAuth({ headers: req.headers as Record<string, string | string[] | undefined>, query: req.query })) {
    res.statusCode = 401;
    res.end(JSON.stringify({ error: "unauthorized" }));
    return;
  }

  let knobs = SAFE_DEFAULTS;
  try {
    const result = await getSheetData();
    if (result.ok) {
      knobs = result.data.personaKnobs;
    } else {
      console.warn(`[assistant-config] sheet unavailable (${result.reason}), using defaults`);
    }
  } catch (err) {
    console.warn(`[assistant-config] error reading sheet, using defaults: ${(err as Error).message}`);
  }

  res.statusCode = 200;
  res.setHeader("Content-Type", "application/json");
  res.end(JSON.stringify(buildResponse(knobs)));
}
