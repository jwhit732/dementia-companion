/**
 * Story 0.1 — one-time setup script.
 * Creates the companion Google Sheet owned by the service account,
 * shares it with imynjimmy@gmail.com (editor), and prints the SHEET_ID.
 *
 * Usage:  npx tsx scripts/setup-sheet.ts
 * Prereqs: companion-sa-key.json in project root (or GOOGLE_SA_KEY env var set)
 */

import * as fs from "fs";
import * as path from "path";
import { google } from "googleapis";

const SHARE_WITH = "imynjimmy@gmail.com";

const saKeyRaw =
  process.env.GOOGLE_SA_KEY ??
  (() => {
    const keyPath = path.resolve(process.cwd(), "companion-sa-key.json");
    if (fs.existsSync(keyPath)) {
      console.log(`[setup-sheet] loading key from ${keyPath}`);
      return Buffer.from(fs.readFileSync(keyPath, "utf8")).toString("base64");
    }
    return undefined;
  })();

if (!saKeyRaw) {
  console.error("[setup-sheet] ERROR: no service account key found.");
  process.exit(1);
}

const credentials = JSON.parse(Buffer.from(saKeyRaw, "base64").toString("utf8")) as Record<
  string,
  unknown
>;

const auth = new google.auth.GoogleAuth({
  credentials,
  scopes: [
    "https://www.googleapis.com/auth/spreadsheets",
    "https://www.googleapis.com/auth/drive",
  ],
});

const sheets = google.sheets({ version: "v4", auth });
const drive = google.drive({ version: "v3", auth });

async function run() {
  console.log("[setup-sheet] creating spreadsheet…");

  // Create spreadsheet with all tabs defined upfront
  const create = await sheets.spreadsheets.create({
    requestBody: {
      properties: { title: "Margaret's Companion — Carer Sheet" },
      sheets: [
        { properties: { title: "About", sheetId: 0 } },
        { properties: { title: "Reminders", sheetId: 1 } },
        { properties: { title: "Contacts", sheetId: 2 } },
        { properties: { title: "Voice-settings", sheetId: 3 } },
      ],
    },
  });

  const spreadsheetId = create.data.spreadsheetId!;
  console.log(`[setup-sheet] created: ${spreadsheetId}`);

  // Populate initial data
  await sheets.spreadsheets.values.batchUpdate({
    spreadsheetId,
    requestBody: {
      valueInputOption: "RAW",
      data: [
        {
          range: "About!A1:B2",
          values: [
            ["Name", "Margaret Thompson"],
            ["Preferred Name", "Marg"],
          ],
        },
        {
          range: "Reminders!A1:A1",
          values: [["Reminder"]],
        },
        {
          range: "Reminders!A2:A5",
          values: [
            ["Take blood pressure tablet at 8am with breakfast"],
            ["Take cholesterol tablet at night with dinner"],
            ["Don't drive — licence surrendered July 2025"],
            ["James picks up shopping on Thursdays"],
          ],
        },
        {
          range: "Contacts!A1:C1",
          values: [["Name", "Relationship", "Phone"]],
        },
        {
          range: "Contacts!A2:C4",
          values: [
            ["James Thompson", "son", "0400 000 000"],
            ["Dr Patel", "GP", "07 4400 0000"],
            ["Mary Thompson", "daughter-in-law", "0400 000 001"],
          ],
        },
        {
          range: "Voice-settings!A1:B1",
          values: [["Setting", "Value"]],
        },
        {
          range: "Voice-settings!A2:B5",
          values: [
            ["preferred_name", "Marg"],
            ["persona_name", "Companion"],
            ["greeting_style", "warm"],
            ["redirect_contact", "James"],
          ],
        },
      ],
    },
  });

  console.log("[setup-sheet] populated tabs with example data");

  // Share with carer email
  await drive.permissions.create({
    fileId: spreadsheetId,
    requestBody: {
      type: "user",
      role: "writer",
      emailAddress: SHARE_WITH,
    },
    sendNotificationEmail: false,
  });

  console.log(`[setup-sheet] shared with ${SHARE_WITH}`);
  console.log("\n========================================");
  console.log(`SHEET_ID=${spreadsheetId}`);
  console.log("========================================");
  console.log("\nNext steps:");
  console.log("  1. Add SHEET_ID to Vercel env vars");
  console.log("  2. Update Margaret's real data in the sheet");
  console.log(`  3. Sheet URL: https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit`);
  console.log("  4. Run: npx tsx scripts/verify-sheet-access.ts");
}

run().catch((err) => {
  console.error("[setup-sheet] FAILED:", (err as Error).message);
  process.exit(1);
});
