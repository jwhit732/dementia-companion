import * as fs from "fs";
import * as path from "path";
import { google } from "googleapis";

const saKeyRaw =
  process.env.GOOGLE_SA_KEY ??
  (() => {
    const keyPath = path.resolve(process.cwd(), "companion-sa-key.json");
    if (fs.existsSync(keyPath)) {
      console.log(`[verify-sheet] loading key from ${keyPath}`);
      return Buffer.from(fs.readFileSync(keyPath, "utf8")).toString("base64");
    }
    return undefined;
  })();

const sheetId = process.env.SHEET_ID;

if (!saKeyRaw) {
  console.error("[verify-sheet] ERROR: no service account key found.");
  process.exit(1);
}
if (!sheetId) {
  console.error(
    "[verify-sheet] ERROR: SHEET_ID env var not set.\n" +
      "  Run setup-sheet.ts first, then export SHEET_ID=<id>"
  );
  process.exit(1);
}

const credentials = JSON.parse(Buffer.from(saKeyRaw, "base64").toString("utf8")) as Record<
  string,
  unknown
>;
const auth = new google.auth.GoogleAuth({
  credentials,
  scopes: ["https://www.googleapis.com/auth/spreadsheets.readonly"],
});
const sheets = google.sheets({ version: "v4", auth });

console.log("[verify-sheet] authenticating…");

async function verify() {
  const [aboutRes, remindersRes, contactsRes, voiceRes] = await Promise.all([
    sheets.spreadsheets.values.get({ spreadsheetId: sheetId!, range: "About!A1:B10" }),
    sheets.spreadsheets.values.get({ spreadsheetId: sheetId!, range: "Reminders!A2:A200" }),
    sheets.spreadsheets.values.get({ spreadsheetId: sheetId!, range: "Contacts!A2:C200" }),
    sheets.spreadsheets.values.get({ spreadsheetId: sheetId!, range: "Voice-settings!A2:B20" }),
  ]);

  const aboutRows = (aboutRes.data.values ?? []) as string[][];
  const about: Record<string, string> = {};
  for (const [k, v] of aboutRows) {
    if (k && v) about[k.toLowerCase()] = v;
  }

  const reminders = ((remindersRes.data.values ?? []) as string[][]).map((r) => r[0]).filter(Boolean);
  const contacts = ((contactsRes.data.values ?? []) as string[][]).filter((r) => r[0] && r[1]);
  const voiceRows = ((voiceRes.data.values ?? []) as string[][]).filter((r) => r[0] && r[1]);

  console.log("\n[verify-sheet] SUCCESS — sheet is accessible\n");
  console.log(`  Name:           ${about["name"] ?? "(missing)"}`);
  console.log(`  Preferred name: ${about["preferred name"] ?? about["preferred_name"] ?? "(missing)"}`);
  console.log(`  Reminders:      ${reminders.length} row(s)`);
  console.log(`  Contacts:       ${contacts.length} row(s)`);
  console.log(`  Voice-settings: ${voiceRows.length} row(s)`);
  console.log();
  voiceRows.forEach(([k, v]) => console.log(`    ${k} = ${v}`));
}

verify().catch((err: Error & { code?: number }) => {
  if (err.code === 403 || err.code === 404) {
    console.error(
      "[verify-sheet] FAILED — 403/404 from Sheets API.\n" +
        "  Most likely cause: sheet not shared with the service account.\n" +
        `  Share the sheet with: ${(credentials.client_email as string) ?? "the SA email"} (Viewer)\n` +
        "  Or run scripts/setup-sheet.ts to create a fresh sheet."
    );
  } else {
    console.error("[verify-sheet] FAILED —", err.message);
  }
  process.exit(1);
});
