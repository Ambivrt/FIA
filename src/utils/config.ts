import dotenv from "dotenv";
import path from "path";
import { z } from "zod";

const configSchema = z.object({
  nodeEnv: z.enum(["development", "production", "test"]).default("development"),
  logDir: z.string().min(1),
  logLevel: z.enum(["debug", "info", "warn", "error"]).default("info"),
  knowledgeDir: z.string().min(1),
  anthropicApiKey: z.string().min(1, "ANTHROPIC_API_KEY is required"),
  geminiApiKey: z.string().default(""),
  serperApiKey: z.string().default(""),
  slackBotToken: z.string().default(""),
  slackAppToken: z.string().default(""),
  slackSigningSecret: z.string().default(""),
  supabaseUrl: z.string().default(""),
  supabaseServiceRoleKey: z.string().default(""),
  supabaseAnonKey: z.string().default(""),
  gwsCredentialsFile: z.string().default(""),
  hubspotApiKey: z.string().default(""),
  linkedinAccessToken: z.string().default(""),
  ga4CredentialsPath: z.string().default(""),
  bufferAccessToken: z.string().default(""),
  gatewayApiHost: z.string().default("127.0.0.1"),
  gatewayApiPort: z.number().int().min(1024).max(65535).default(3001),
  usdToSek: z.number().positive().default(10.5),
  queueMaxConcurrency: z.number().int().min(1).max(100).default(3),
});

export type AppConfig = z.infer<typeof configSchema>;

export function loadConfig(): AppConfig {
  dotenv.config();

  const raw = {
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
    hubspotApiKey: process.env.HUBSPOT_API_KEY || "",
    linkedinAccessToken: process.env.LINKEDIN_ACCESS_TOKEN || "",
    ga4CredentialsPath: process.env.GA4_CREDENTIALS_PATH || "",
    bufferAccessToken: process.env.BUFFER_ACCESS_TOKEN || "",
    gatewayApiHost: process.env.GATEWAY_API_HOST || "127.0.0.1",
    gatewayApiPort: parseInt(process.env.GATEWAY_API_PORT || "3001", 10),
    usdToSek: parseFloat(process.env.USD_TO_SEK || "10.5"),
    queueMaxConcurrency: parseInt(process.env.QUEUE_MAX_CONCURRENCY || "3", 10),
  };

  return configSchema.parse(raw);
}
