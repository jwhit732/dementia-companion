import { google } from "googleapis";

/**
 * In-memory cache for the fetched Google Doc text.
 * Module-level state — persists for the lifetime of the process.
 */
let cache: { text: string; fetchedAt: number } | null = null;

/**
 * Cache time-to-live in milliseconds (60 seconds).
 */
const CACHE_TTL_MS = 60_000;

/**
 * Fetches the configured Google Doc as plain text using the Google Drive API
 * with a service account, then caches the result for 60 seconds.
 *
 * Required environment variables (read at runtime):
 *   - `GOOGLE_SA_KEY`: JSON string of the service account key.
 *   - `DOC_ID`: the Google Doc ID (from the URL).
 *
 * @returns The plain-text contents of the Google Doc.
 * @throws If env vars are missing/invalid or the Drive export fails.
 */
export async function getDocText(): Promise<string> {
  const now = Date.now();
  if (cache && now - cache.fetchedAt < CACHE_TTL_MS) {
    console.log("[docReader] cache hit");
    return cache.text;
  }

  const saKeyRaw = process.env.GOOGLE_SA_KEY;
  const docId = process.env.DOC_ID;

  if (!saKeyRaw) {
    throw new Error("[docReader] missing required env var GOOGLE_SA_KEY");
  }
  if (!docId) {
    throw new Error("[docReader] missing required env var DOC_ID");
  }

  let credentials: Record<string, unknown>;
  try {
    const decoded = Buffer.from(saKeyRaw, "base64").toString("utf8");
    credentials = JSON.parse(decoded) as Record<string, unknown>;
  } catch (err) {
    throw new Error(
      `[docReader] failed to parse GOOGLE_SA_KEY: ${(err as Error).message}`
    );
  }

  const auth = new google.auth.GoogleAuth({
    credentials,
    scopes: ["https://www.googleapis.com/auth/drive.readonly"],
  });

  const drive = google.drive({ version: "v3", auth });

  const response = await drive.files.export(
    { fileId: docId, mimeType: "text/plain" },
    { responseType: "text" }
  );

  // When responseType is "text", the data is a string.
  const text =
    typeof response.data === "string"
      ? response.data
      : String(response.data ?? "");

  console.log("[docReader] cache miss \u2014 fetched from Drive");
  cache = { text, fetchedAt: now };
  return text;
}

/**
 * Clears the in-memory cache. Primarily useful for testing.
 */
export function clearDocCache(): void {
  cache = null;
}
