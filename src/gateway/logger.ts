import fs from "fs";
import path from "path";
import { AppConfig } from "../utils/config";

export interface LogEntry {
  timestamp: string;
  level: string;
  message: string;
  agent?: string;
  task_id?: string;
  model?: string;
  action?: string;
  input_hash?: string;
  output_summary?: string;
  tokens_in?: number;
  tokens_out?: number;
  cost_usd?: number;
  duration_ms?: number;
  status?: "success" | "error" | "escalated";
  brand_review?: "approved" | "rejected" | "pending";
  error?: string;
  [key: string]: unknown;
}

export interface Logger {
  info(message: string, meta?: Partial<LogEntry>): void;
  warn(message: string, meta?: Partial<LogEntry>): void;
  error(message: string, meta?: Partial<LogEntry>): void;
  debug(message: string, meta?: Partial<LogEntry>): void;
}

const LEVELS: Record<string, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

export function createLogger(config: AppConfig): Logger {
  if (!fs.existsSync(config.logDir)) {
    fs.mkdirSync(config.logDir, { recursive: true });
  }

  const logFilePath = path.join(config.logDir, "fia-gateway.log");
  const logStream = fs.createWriteStream(logFilePath, { flags: "a" });

  const configuredLevel = LEVELS[config.logLevel] ?? LEVELS.info;

  function writeLog(level: string, message: string, meta?: Partial<LogEntry>): void {
    if ((LEVELS[level] ?? 0) < configuredLevel) {
      return;
    }

    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level,
      message,
      ...meta,
    };

    const line = JSON.stringify(entry);
    logStream.write(line + "\n");
    process.stdout.write(line + "\n");
  }

  return {
    info: (message, meta?) => writeLog("info", message, meta),
    warn: (message, meta?) => writeLog("warn", message, meta),
    error: (message, meta?) => writeLog("error", message, meta),
    debug: (message, meta?) => writeLog("debug", message, meta),
  };
}
