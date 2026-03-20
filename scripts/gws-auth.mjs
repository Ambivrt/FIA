#!/usr/bin/env node
/**
 * Headless OAuth 2.0 auth for @alanse/mcp-server-google-workspace.
 *
 * Usage:
 *   node scripts/gws-auth.mjs
 *   1. Copy the URL and open in browser
 *   2. Grant consent
 *   3. Copy the "code" parameter from the redirect URL
 *   4. Paste it back here
 */

import { google } from "googleapis";
import fs from "fs";
import path from "path";
import readline from "readline";

const CREDS_DIR = process.env.GWORKSPACE_CREDS_DIR || "./credentials";
const CLIENT_ID = process.env.CLIENT_ID;
const CLIENT_SECRET = process.env.CLIENT_SECRET;

if (!CLIENT_ID || !CLIENT_SECRET) {
  console.error("Missing CLIENT_ID or CLIENT_SECRET env vars");
  process.exit(1);
}

const SCOPES = [
  "https://www.googleapis.com/auth/drive.readonly",
  "https://www.googleapis.com/auth/spreadsheets",
  "https://www.googleapis.com/auth/documents",
  "https://www.googleapis.com/auth/gmail.readonly",
  "https://www.googleapis.com/auth/gmail.send",
  "https://www.googleapis.com/auth/gmail.modify",
  "https://www.googleapis.com/auth/gmail.labels",
  "https://www.googleapis.com/auth/calendar",
];

const oauth2Client = new google.auth.OAuth2(
  CLIENT_ID,
  CLIENT_SECRET,
  "http://localhost", // Must match the redirect_uri in the OAuth client
);

const authUrl = oauth2Client.generateAuthUrl({
  access_type: "offline",
  scope: SCOPES,
  prompt: "consent",
});

console.log("\n=== GWS OAuth 2.0 Setup ===\n");
console.log("1. Open this URL in your browser:\n");
console.log(authUrl);
console.log("\n2. Grant all permissions");
console.log('3. After redirect, copy the "code" parameter from the URL bar');
console.log("   (The page will show an error — that's expected)\n");
console.log("   URL will look like: http://localhost/?code=4/0XXXXX&scope=...");
console.log('   Copy everything between "code=" and "&scope"\n');

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

rl.question("Paste the authorization code here: ", async (code) => {
  rl.close();

  try {
    const { tokens } = await oauth2Client.getToken(code.trim());

    const credsPath = path.join(CREDS_DIR, ".gworkspace-credentials.json");
    fs.mkdirSync(CREDS_DIR, { recursive: true });
    fs.writeFileSync(credsPath, JSON.stringify(tokens, null, 2));

    console.log("\nTokens saved to:", credsPath);
    console.log("Scopes:", tokens.scope);
    console.log("Refresh token:", tokens.refresh_token ? "YES" : "NO");
    console.log("\nDone! GWS MCP tools should now work.");
  } catch (err) {
    console.error("\nFailed to exchange code for tokens:", err.message);
    process.exit(1);
  }
});
