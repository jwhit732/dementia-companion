import { google } from "googleapis";
import { PersonaKnobs } from "../schema";
import type { Contact } from "../schema";

export type SheetData = {
  name: string;
  preferredName: string;
  reminders: string[];
  contacts: Contact[];
  personaKnobs: PersonaKnobs;
};

export type SheetReadResult =
  | { ok: true; data: SheetData }
  | { ok: false; reason: "auth_failure" | "fetch_error" | "parse_error"; diagnostics?: string };

const KNOB_DEFAULTS: PersonaKnobs = {
  preferred_name: "Marg",
  persona_name: "Companion",
  greeting_style: "warm",
  redirect_contact: "James",
};

let cache: { data: SheetData; fetchedAt: number } | null = null;
const CACHE_TTL_MS = 60_000;

function getAuth() {
  const saKeyRaw = process.env.GOOGLE_SA_KEY;
  if (!saKeyRaw) throw new Error("missing GOOGLE_SA_KEY");
  const credentials = JSON.parse(Buffer.from(saKeyRaw, "base64").toString("utf8")) as Record<string, unknown>;
  return new google.auth.GoogleAuth({
    credentials,
    scopes: ["https://www.googleapis.com/auth/spreadsheets.readonly"],
  });
}

function parseKnobs(rows: string[][]): PersonaKnobs {
  const map: Record<string, string> = {};
  for (const row of rows) {
    const key = row[0]?.trim().toLowerCase();
    const val = row[1]?.trim();
    if (key && val) map[key] = val;
  }
  const raw = map["greeting_style"] ?? "";
  const greeting = (["warm", "cheerful", "gentle"] as const).includes(raw as "warm")
    ? (raw as PersonaKnobs["greeting_style"])
    : KNOB_DEFAULTS.greeting_style;
  return {
    preferred_name: map["preferred_name"] || KNOB_DEFAULTS.preferred_name,
    persona_name: map["persona_name"] || KNOB_DEFAULTS.persona_name,
    greeting_style: greeting,
    redirect_contact: map["redirect_contact"] || KNOB_DEFAULTS.redirect_contact,
  };
}

export async function getSheetData(): Promise<SheetReadResult> {
  const now = Date.now();
  if (cache && now - cache.fetchedAt < CACHE_TTL_MS) {
    return { ok: true, data: cache.data };
  }

  const sheetId = process.env.SHEET_ID;
  if (!sheetId) return { ok: false, reason: "fetch_error", diagnostics: "missing SHEET_ID env var" };

  try {
    const auth = getAuth();
    const sheets = google.sheets({ version: "v4", auth });

    const [aboutRes, remindersRes, contactsRes, voiceRes] = await Promise.all([
      sheets.spreadsheets.values.get({ spreadsheetId: sheetId, range: "About!A1:B10" }),
      sheets.spreadsheets.values.get({ spreadsheetId: sheetId, range: "Reminders!A2:A200" }),
      sheets.spreadsheets.values.get({ spreadsheetId: sheetId, range: "Contacts!A2:C200" }),
      sheets.spreadsheets.values.get({ spreadsheetId: sheetId, range: "Voice-settings!A2:B20" }),
    ]);

    // About tab: key-value rows, e.g. ["Name", "Margaret Thompson"]
    const aboutRows = (aboutRes.data.values ?? []) as string[][];
    const about: Record<string, string> = {};
    for (const [key, val] of aboutRows) {
      if (key && val) about[key.trim().toLowerCase()] = val.trim();
    }
    const name = about["name"];
    const preferredName = about["preferred name"] ?? about["preferred_name"];
    if (!name || !preferredName) {
      return {
        ok: false,
        reason: "parse_error",
        diagnostics: `About tab missing Name or Preferred Name (got keys: ${Object.keys(about).join(", ")})`,
      };
    }

    // Reminders tab: single-column list, row 1 is a header
    const reminders = ((remindersRes.data.values ?? []) as string[][])
      .map((r) => r[0]?.trim())
      .filter(Boolean) as string[];

    // Contacts tab: Name | Relationship | Phone (optional)
    const contacts: Contact[] = ((contactsRes.data.values ?? []) as string[][])
      .filter((r) => r[0] && r[1])
      .map((r) => ({
        name: r[0]!.trim(),
        relationship: r[1]!.trim(),
        ...(r[2]?.trim() ? { phone: r[2].trim() } : {}),
      }));

    // Voice-settings tab: Setting | Value
    const personaKnobs = parseKnobs((voiceRes.data.values ?? []) as string[][]);

    const data: SheetData = { name, preferredName, reminders, contacts, personaKnobs };
    cache = { data, fetchedAt: now };
    console.log("[sheetSource] cache miss — fetched from Sheets");
    return { ok: true, data };
  } catch (err) {
    const msg = (err as Error).message ?? String(err);
    if (!process.env.GOOGLE_SA_KEY) return { ok: false, reason: "auth_failure", diagnostics: msg };
    return { ok: false, reason: "fetch_error", diagnostics: msg };
  }
}

export function clearSheetCache(): void {
  cache = null;
}
