#!/usr/bin/env node
import fs from "fs";

// 1. Check credentials file
const dir = process.env.GWORKSPACE_CREDS_DIR || "/home/marcus_landstrom/FIA";
const credsPath = dir + "/.gworkspace-credentials.json";
const keysPath = dir + "/gcp-oauth.keys.json";

console.log("=== Credentials check ===");
console.log("GWORKSPACE_CREDS_DIR:", process.env.GWORKSPACE_CREDS_DIR || "(not set)");
console.log("CLIENT_ID env:", process.env.CLIENT_ID ? "SET" : "NOT SET");
console.log("CLIENT_SECRET env:", process.env.CLIENT_SECRET ? "SET" : "NOT SET");
console.log("Creds file exists:", fs.existsSync(credsPath));
console.log("Keys file exists:", fs.existsSync(keysPath));

if (fs.existsSync(credsPath)) {
  const creds = JSON.parse(fs.readFileSync(credsPath, "utf8"));
  console.log("Has access_token:", !!creds.access_token);
  console.log("Has refresh_token:", !!creds.refresh_token);
  console.log("Has client_id:", !!creds.client_id);
  console.log("Has expiry_date:", !!creds.expiry_date);
}

// 2. Initialize auth BEFORE calling tools
console.log("\n=== Auth init ===");
const auth = await import("@alanse/mcp-server-google-workspace/dist/auth.js");
const authClient = await auth.loadCredentialsQuietly();
console.log("Auth client:", authClient ? "OK" : "NULL");

// 3. Try loading MCP tools
console.log("\n=== MCP tool test ===");
try {
  const mod = await import("@alanse/mcp-server-google-workspace/dist/tools/index.js");
  const tools = mod.tools || [];
  console.log("Tools loaded:", tools.length);
  const driveTool = tools.find((t) => t.name === "drive_list_files");
  if (driveTool) {
    console.log("drive_list_files found, calling...");
    const result = await driveTool.handler({ max_results: 1 });
    console.log("Result:", JSON.stringify(result).substring(0, 500));
  } else {
    console.log("drive_list_files NOT found");
  }
} catch (err) {
  console.error("MCP error:", err.message);
}
