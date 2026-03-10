import dotenv from "dotenv";
import path from "path";

export interface AppConfig {
  nodeEnv: string;
  logDir: string;
  logLevel: string;
  knowledgeDir: string;
  anthropicApiKey: string;
  geminiApiKey: string;
  serperApiKey: string;
  slackBotToken: string;
  slackAppToken: string;
  slackSigningSecret: string;
  supabaseUrl: string;
  supabaseServiceRoleKey: string;
  supabaseAnonKey: string;
  gwsCredentialsFile: string;
  wordpressUrl: string;
  wordpressApiKey: string;
  hubspotApiKey: string;
  linkedinAccessToken: string;
  ga4CredentialsPath: string;
  bufferAccessToken: string;
  gatewayApiPort: number;
}

export function loadConfig(): AppConfig {
  dotenv.config();

  return {
    nodeEnv: process.env.NODE_ENV || "development",
    logDir: process.env.LOG_DIR || path.join(process.cwd(), "logs"),
    logLevel: process.env.LOG_LEVEL || "info",
    knowledgeDir: process.env.KNOWLEDGE_DIR || path.join(process.cwd(), "knowledge"),
    anthropicApiKey: process.env.ANTHROPIC_API_KEY || "",
    geminiApiKey: process.env.GEMINI_API_KEY || "",
    serperApiKey: process.env.SERPER_API_KEY || "",
    slackBotToken: process.env.SLACK_BOT_TOKEN || "",
    slackAppToken: process.env.SLACK_APP_TOKEN || "",
    slackSigningSecret: process.env.SLACK_SIGNING_SECRET || "",
    supabaseUrl: process.env.SUPABASE_URL || "",
    supabaseServiceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY || "",
    supabaseAnonKey: process.env.SUPABASE_ANON_KEY || "",
    gwsCredentialsFile: process.env.GOOGLE_WORKSPACE_CLI_CREDENTIALS_FILE || "",
    wordpressUrl: process.env.WORDPRESS_URL || "",
    wordpressApiKey: process.env.WORDPRESS_API_KEY || "",
    hubspotApiKey: process.env.HUBSPOT_API_KEY || "",
    linkedinAccessToken: process.env.LINKEDIN_ACCESS_TOKEN || "",
    ga4CredentialsPath: process.env.GA4_CREDENTIALS_PATH || "",
    bufferAccessToken: process.env.BUFFER_ACCESS_TOKEN || "",
    gatewayApiPort: parseInt(process.env.GATEWAY_API_PORT || "3001", 10),
  };
}
