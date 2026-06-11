import { google } from "googleapis";

export type DocReadFailureReason =
  | "auth_failure"
  | "fetch_403"
  | "fetch_404"
  | "fetch_error";

export class DocReaderError extends Error {
  constructor(
    public readonly reason: DocReadFailureReason,
    message: string
  ) {
    super(message);
    this.name = "DocReaderError";
  }
}

let cache: { text: string; fetchedAt: number } | null = null;
const CACHE_TTL_MS = 60_000;

function classifyDriveError(err: unknown): DocReaderError {
  const e = err as {
    response?: { status?: number };
    code?: number | string;
    message?: string;
  };
  const status =
    e.response?.status ??
    (typeof e.code === "number" ? e.code : undefined);
  const msg = e.message ?? String(err);
  if (status === 403) return new DocReaderError("fetch_403", `Drive 403: ${msg}`);
  if (status === 404) return new DocReaderError("fetch_404", `Drive 404: ${msg}`);
  return new DocReaderError("fetch_error", `Drive error (${status ?? "unknown"}): ${msg}`);
}

export async function getDocText(): Promise<string> {
  const now = Date.now();
  if (cache && now - cache.fetchedAt < CACHE_TTL_MS) {
    console.log("[docReader] cache hit");
    return cache.text;
  }

  const saKeyRaw = process.env.GOOGLE_SA_KEY;
  const docId = process.env.DOC_ID;

  if (!saKeyRaw) {
    throw new DocReaderError("auth_failure", "[docReader] missing required env var GOOGLE_SA_KEY");
  }
  if (!docId) {
    throw new DocReaderError("fetch_error", "[docReader] missing required env var DOC_ID");
  }

  let credentials: Record<string, unknown>;
  try {
    const decoded = Buffer.from(saKeyRaw, "base64").toString("utf8");
    credentials = JSON.parse(decoded) as Record<string, unknown>;
  } catch (err) {
    throw new DocReaderError(
      "auth_failure",
      `[docReader] failed to parse GOOGLE_SA_KEY: ${(err as Error).message}`
    );
  }

  const auth = new google.auth.GoogleAuth({
    credentials,
    scopes: ["https://www.googleapis.com/auth/drive.readonly"],
  });

  const drive = google.drive({ version: "v3", auth });

  let response: Awaited<ReturnType<typeof drive.files.export>>;
  try {
    response = await drive.files.export(
      { fileId: docId, mimeType: "text/plain" },
      { responseType: "text" }
    );
  } catch (err) {
    throw classifyDriveError(err);
  }

  const text =
    typeof response.data === "string"
      ? response.data
      : String(response.data ?? "");

  console.log("[docReader] cache miss — fetched from Drive");
  cache = { text, fetchedAt: now };
  return text;
}

export function clearDocCache(): void {
  cache = null;
}
