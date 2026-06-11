import { google } from "googleapis";

export interface JournalRow {
  timestamp: string;
  caller: string;
  durationSecs: number;
  toolsFired: string;
  toolStatus: string;
  summary: string;
  transcriptLink: string;
  callId: string;
}

const HEADERS = [
  "Timestamp (AEST)",
  "Caller",
  "Duration (s)",
  "Tools Fired",
  "Tool Status",
  "Summary",
  "Transcript Link",
  "Call ID",
];

export async function appendJournalRow(row: JournalRow): Promise<void> {
  const saKeyRaw = process.env.GOOGLE_SA_KEY;
  const sheetId = process.env.JOURNAL_SHEET_ID;

  if (!saKeyRaw) throw new Error("[journal] missing GOOGLE_SA_KEY");
  if (!sheetId) throw new Error("[journal] missing JOURNAL_SHEET_ID");

  const credentials = JSON.parse(
    Buffer.from(saKeyRaw, "base64").toString("utf8")
  ) as Record<string, unknown>;

  const auth = new google.auth.GoogleAuth({
    credentials,
    scopes: ["https://www.googleapis.com/auth/spreadsheets"],
  });

  const sheets = google.sheets({ version: "v4", auth });

  // Write headers on first use (when A1 is empty)
  const check = await sheets.spreadsheets.values.get({
    spreadsheetId: sheetId,
    range: "Sheet1!A1",
  });
  if (!check.data.values?.length) {
    await sheets.spreadsheets.values.update({
      spreadsheetId: sheetId,
      range: "Sheet1!A1",
      valueInputOption: "USER_ENTERED",
      requestBody: { values: [HEADERS] },
    });
  }

  await sheets.spreadsheets.values.append({
    spreadsheetId: sheetId,
    range: "Sheet1!A:H",
    valueInputOption: "USER_ENTERED",
    requestBody: {
      values: [[
        row.timestamp,
        row.caller,
        row.durationSecs,
        row.toolsFired,
        row.toolStatus,
        row.summary,
        row.transcriptLink,
        row.callId,
      ]],
    },
  });
}
