import fs from "fs";
import path from "path";
import os from "os";
import { createLogger, LogEntry } from "../src/gateway/logger";
import { AppConfig } from "../src/utils/config";

function makeTempConfig(): AppConfig {
  const logDir = fs.mkdtempSync(path.join(os.tmpdir(), "fia-logger-test-"));
  return {
    nodeEnv: "test",
    logDir,
    logLevel: "debug",
    knowledgeDir: "",
    anthropicApiKey: "",
    geminiApiKey: "",
    serperApiKey: "",
    slackBotToken: "",
    slackAppToken: "",
    slackSigningSecret: "",
    supabaseUrl: "",
    supabaseServiceRoleKey: "",
    supabaseAnonKey: "",
    gwsCredentialsFile: "",
    hubspotApiKey: "",
    linkedinAccessToken: "",
    ga4CredentialsPath: "",
    bufferAccessToken: "",
    gatewayApiHost: "127.0.0.1",
    gatewayApiPort: 3001,
    usdToSek: 10.5,
    queueMaxConcurrency: 3,
  };
}

// Capture stdout writes to verify JSON format (avoids async stream flush issues)
function captureStdout(fn: () => void): string[] {
  const lines: string[] = [];
  const origWrite = process.stdout.write;
  process.stdout.write = ((chunk: string | Buffer) => {
    lines.push(chunk.toString().trim());
    return true;
  }) as typeof process.stdout.write;
  try {
    fn();
  } finally {
    process.stdout.write = origWrite;
  }
  return lines.filter(Boolean);
}

describe("Logger", () => {
  let config: AppConfig;

  beforeEach(() => {
    config = makeTempConfig();
  });

  // Temp dirs in /tmp are cleaned by the OS. Removing them during test
  // teardown races with the write stream's background flush, causing
  // an unhandled ENOENT. We leave the dirs for the OS to reclaim.

  it("writes valid JSON to stdout", () => {
    const logger = createLogger(config);
    const lines = captureStdout(() => logger.info("test message"));

    expect(lines).toHaveLength(1);
    const entry: LogEntry = JSON.parse(lines[0]);
    expect(entry.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(entry.level).toBe("info");
    expect(entry.message).toBe("test message");
  });

  it("includes all audit trail metadata", () => {
    const logger = createLogger(config);
    const lines = captureStdout(() =>
      logger.info("agent action", {
        agent: "content",
        task_id: "uuid-123",
        model: "claude-opus-4-6",
        action: "generate_blog_post",
        input_hash: "sha256abc",
        output_summary: "Generated blog post about AI",
        tokens_in: 1234,
        tokens_out: 5678,
        cost_usd: 0.023,
        duration_ms: 3400,
        status: "success",
        brand_review: "approved",
      }),
    );

    const entry: LogEntry = JSON.parse(lines[0]);
    expect(entry.agent).toBe("content");
    expect(entry.task_id).toBe("uuid-123");
    expect(entry.model).toBe("claude-opus-4-6");
    expect(entry.action).toBe("generate_blog_post");
    expect(entry.input_hash).toBe("sha256abc");
    expect(entry.output_summary).toBe("Generated blog post about AI");
    expect(entry.tokens_in).toBe(1234);
    expect(entry.tokens_out).toBe(5678);
    expect(entry.cost_usd).toBe(0.023);
    expect(entry.duration_ms).toBe(3400);
    expect(entry.status).toBe("success");
    expect(entry.brand_review).toBe("approved");
  });

  it("respects log level filtering", () => {
    config.logLevel = "warn";
    const logger = createLogger(config);

    const lines = captureStdout(() => {
      logger.debug("should not appear");
      logger.info("should not appear");
      logger.warn("should appear");
    });

    expect(lines).toHaveLength(1);
    expect(JSON.parse(lines[0]).level).toBe("warn");
  });

  it("handles circular references in meta without crashing (B10)", () => {
    const logger = createLogger(config);
    const circular: Record<string, unknown> = { key: "value" };
    circular.self = circular;

    const lines = captureStdout(() => logger.error("bad meta", circular as any));

    expect(lines).toHaveLength(1);
    const entry = JSON.parse(lines[0]);
    expect(entry.level).toBe("error");
    expect(entry.error).toBe("Failed to serialize log entry");
    expect(entry.message).toBe("bad meta");
  });

  it("supports all four log levels", () => {
    const logger = createLogger(config);

    const lines = captureStdout(() => {
      logger.debug("debug msg");
      logger.info("info msg");
      logger.warn("warn msg");
      logger.error("error msg");
    });

    expect(lines).toHaveLength(4);
    expect(JSON.parse(lines[0]).level).toBe("debug");
    expect(JSON.parse(lines[1]).level).toBe("info");
    expect(JSON.parse(lines[2]).level).toBe("warn");
    expect(JSON.parse(lines[3]).level).toBe("error");
  });
});
