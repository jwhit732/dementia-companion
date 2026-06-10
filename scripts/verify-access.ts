import * as fs from "fs";
import * as path from "path";
import { google } from "googleapis";

// Load key from ./companion-sa-key.json if env var not set
const saKeyRaw =
  process.env.GOOGLE_SA_KEY ??
  (() => {
    const keyPath = path.resolve(process.cwd(), "companion-sa-key.json");
    if (fs.existsSync(keyPath)) {
      console.log(`[verify] loading key from ${keyPath}`);
      return Buffer.from(fs.readFileSync(keyPath, "utf8")).toString("base64");
    }
    return undefined;
  })();

const docId = process.env.DOC_ID;

if (!saKeyRaw) {
  console.error(
    "[verify] ERROR: no service account key found.\n" +
      "  Set GOOGLE_SA_KEY env var, or place companion-sa-key.json in the project root."
  );
  process.exit(1);
}
if (!docId) {
  console.error(
    "[verify] ERROR: DOC_ID env var is not set.\n" +
      "  Get it from the Google Doc URL: docs.google.com/document/d/THIS_PART/edit"
  );
  process.exit(1);
}

const decoded = Buffer.from(saKeyRaw, "base64").toString("utf8");
const credentials = JSON.parse(decoded) as Record<string, unknown>;

const auth = new google.auth.GoogleAuth({
  credentials,
  scopes: ["https://www.googleapis.com/auth/drive.readonly"],
});

const drive = google.drive({ version: "v3", auth });

console.log("[verify] authenticating with service account...");

drive.files
  .export({ fileId: docId, mimeType: "text/plain" }, { responseType: "text" })
  .then((response) => {
    const text =
      typeof response.data === "string" ? response.data : String(response.data ?? "");
    console.log("[verify] SUCCESS — doc is accessible.");
    console.log("[verify] First 200 chars:\n");
    console.log(text.slice(0, 200));
  })
  .catch((err: Error & { code?: number }) => {
    if (err.code === 403 || err.code === 404) {
      console.error(
        "[verify] FAILED — 403/404 from Drive API.\n" +
          "  Most likely cause: the doc was not shared with the service account.\n" +
          `  Share the doc with: ${(credentials.client_email as string) ?? "the service account email"}\n` +
          "  Role: Viewer"
      );
    } else {
      console.error("[verify] FAILED —", err.message);
    }
    process.exit(1);
  });
