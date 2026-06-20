import * as fs from "fs";
import * as path from "path";
import type { IncomingMessage, ServerResponse } from "http";
import { checkAuth } from "../lib/auth";
import { getSheetData } from "../lib/sources/sheetSource";
import type { PersonaKnobs } from "../lib/schema";

const ASSISTANT_ID =
  process.env.VAPI_ASSISTANT_ID ?? "d7d001fc-d9ec-47d3-af89-91a4a3083053";

const SAFE_DEFAULTS: PersonaKnobs = {
  preferred_name: "Robyn",
  persona_name: "Companion",
  greeting_style: "warm",
  redirect_contact: "Imogen",
};

// Read the template once at cold-start — included via vercel.json includeFiles
const PROMPT_TEMPLATE = fs.readFileSync(
  path.resolve(process.cwd(), "prompts/system-prompt.md"),
  "utf8"
);

function fillPrompt(knobs: PersonaKnobs): string {
  return PROMPT_TEMPLATE
    .replace(/\{\{preferred_name\}\}/g, knobs.preferred_name)
    .replace(/\{\{persona_name\}\}/g, knobs.persona_name)
    .replace(/\{\{greeting_style\}\}/g, knobs.greeting_style)
    .replace(/\{\{redirect_contact\}\}/g, knobs.redirect_contact);
}

function buildResponse(knobs: PersonaKnobs) {
  return {
    assistantId: ASSISTANT_ID,
    assistantOverrides: {
      firstMessage: `Hello ${knobs.preferred_name}, lovely to hear your voice. How can I help you today?`,
      endCallMessage: `Take good care, ${knobs.preferred_name}. ${knobs.redirect_contact} is always just a call away.`,
      model: {
        messages: [{ role: "system", content: fillPrompt(knobs) }],
      },
    },
  };
}

export default async function handler(
  req: IncomingMessage & { query?: Record<string, string | string[]> },
  res: ServerResponse
): Promise<void> {
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
