#!/usr/bin/env node
/**
 * Headless OAuth 2.0 auth for @alanse/mcp-server-google-workspace.
 * Zero external dependencies — uses built-in fetch + readline.
 *
 * Usage:
 *   CLIENT_ID=xxx CLIENT_SECRET=xxx GWORKSPACE_CREDS_DIR=/abs/path node scripts/gws-auth.mjs
 *
 *   1. Copy the URL and open in browser
 *   2. Grant consent
 *   3. Copy the "code" parameter from the redirect URL
 *   4. Paste it back here
 */

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

const REDIRECT_URI = "http://localhost";

// Build OAuth URL manually
const authParams = new URLSearchParams({
  client_id: CLIENT_ID,
  redirect_uri: REDIRECT_URI,
  response_type: "code",
  scope: SCOPES.join(" "),
  access_type: "offline",
  prompt: "consent",
});

const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?${authParams}`;

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
    // Exchange code for tokens via Google's token endpoint
    const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code: code.trim(),
        client_id: CLIENT_ID,
        client_secret: CLIENT_SECRET,
        redirect_uri: REDIRECT_URI,
        grant_type: "authorization_code",
      }),
    });

    const tokens = await tokenRes.json();

    if (tokens.error) {
      console.error("\nGoogle returned an error:", tokens.error, tokens.error_description || "");
      process.exit(1);
    }

    const credsPath = path.join(CREDS_DIR, ".gworkspace-credentials.json");
    fs.mkdirSync(CREDS_DIR, { recursive: true });
    fs.writeFileSync(credsPath, JSON.stringify(tokens, null, 2));

    console.log("\nTokens saved to:", credsPath);
    console.log("Scopes:", tokens.scope || "(not returned)");
    console.log("Refresh token:", tokens.refresh_token ? "YES" : "NO");
    console.log("\nDone! GWS MCP tools should now work.");
  } catch (err) {
    console.error("\nFailed to exchange code for tokens:", err.message);
    process.exit(1);
  }
});
