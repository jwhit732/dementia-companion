/**
 * One-time script to obtain a Gmail OAuth2 refresh token.
 *
 * Manual gate (run once):
 *   1. Set GMAIL_CLIENT_ID and GMAIL_CLIENT_SECRET in your shell or .env
 *   2. Run:  npm run get-gmail-token
 *   3. Visit the URL printed to the console and grant access
 *   4. Copy the refresh token printed after consent
 *   5. Add GMAIL_REFRESH_TOKEN to Vercel env vars
 */

import * as http from "http";
import { google } from "googleapis";

const CLIENT_ID = process.env.GMAIL_CLIENT_ID;
const CLIENT_SECRET = process.env.GMAIL_CLIENT_SECRET;
const REDIRECT_URI = "http://localhost:4000/callback";

if (!CLIENT_ID || !CLIENT_SECRET) {
  console.error("Set GMAIL_CLIENT_ID and GMAIL_CLIENT_SECRET before running this script.");
  process.exit(1);
}

const auth = new google.auth.OAuth2(CLIENT_ID, CLIENT_SECRET, REDIRECT_URI);

const authUrl = auth.generateAuthUrl({
  access_type: "offline",
  scope: ["https://www.googleapis.com/auth/gmail.send"],
  prompt: "consent",
});

console.log("\n=== Gmail OAuth setup ===\n");
console.log("1. Visit this URL and sign in as imynjimmy@gmail.com:\n");
console.log(authUrl);
console.log("\n2. After granting access, Google will redirect to localhost.");
console.log("   Waiting for callback on http://localhost:4000 ...\n");

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url ?? "/", "http://localhost:4000");
  const code = url.searchParams.get("code");

  if (!code) {
    res.writeHead(400);
    res.end("Missing code parameter.");
    return;
  }

  res.writeHead(200, { "Content-Type": "text/html" });
  res.end("<h2>Done! You can close this tab and check the terminal.</h2>");
  server.close();

  try {
    const { tokens } = await auth.getToken(code);
    if (!tokens.refresh_token) {
      console.error("\nNo refresh token returned. Make sure you ran with prompt=consent.");
      process.exit(1);
    }
    console.log("\n=== Success ===\n");
    console.log("Add this to Vercel as GMAIL_REFRESH_TOKEN:\n");
    console.log(tokens.refresh_token);
    console.log("\nAlso add ALERT_TO=imynjimmy@gmail.com to Vercel if not already set.");
    process.exit(0);
  } catch (err) {
    console.error("Failed to exchange token:", (err as Error).message);
    process.exit(1);
  }
});

server.listen(4000);
