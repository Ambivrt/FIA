import { loadConfig } from "../src/utils/config";

// Save and restore env between tests
const originalEnv = process.env;

beforeEach(() => {
  jest.resetModules();
  process.env = { ...originalEnv };
  // Set minimum required env vars
  process.env.ANTHROPIC_API_KEY = "test-key";
});

afterAll(() => {
  process.env = originalEnv;
});

describe("loadConfig", () => {
  it("throws when ANTHROPIC_API_KEY is missing", () => {
    delete process.env.ANTHROPIC_API_KEY;
    expect(() => loadConfig()).toThrow();
  });

  it("throws when ANTHROPIC_API_KEY is empty string", () => {
    process.env.ANTHROPIC_API_KEY = "";
    expect(() => loadConfig()).toThrow();
  });

  it("returns valid config with only ANTHROPIC_API_KEY set", () => {
    const config = loadConfig();
    expect(config.anthropicApiKey).toBe("test-key");
    // Jest sets NODE_ENV=test automatically
    expect(["development", "test"]).toContain(config.nodeEnv);
    expect(config.logLevel).toBe("info");
    expect(config.gatewayApiPort).toBe(3001);
    expect(config.usdToSek).toBe(10.5);
    expect(config.queueMaxConcurrency).toBe(3);
  });

  it("applies custom values from env vars", () => {
    process.env.NODE_ENV = "production";
    process.env.LOG_LEVEL = "error";
    process.env.GATEWAY_API_PORT = "8080";
    process.env.USD_TO_SEK = "11.2";
    process.env.QUEUE_MAX_CONCURRENCY = "10";

    const config = loadConfig();
    expect(config.nodeEnv).toBe("production");
    expect(config.logLevel).toBe("error");
    expect(config.gatewayApiPort).toBe(8080);
    expect(config.usdToSek).toBe(11.2);
    expect(config.queueMaxConcurrency).toBe(10);
  });

  it("throws on invalid GATEWAY_API_PORT", () => {
    process.env.GATEWAY_API_PORT = "99999";
    expect(() => loadConfig()).toThrow();
  });

  it("throws on non-numeric GATEWAY_API_PORT", () => {
    process.env.GATEWAY_API_PORT = "abc";
    expect(() => loadConfig()).toThrow();
  });

  it("throws on invalid LOG_LEVEL", () => {
    process.env.LOG_LEVEL = "verbose";
    expect(() => loadConfig()).toThrow();
  });

  it("throws on invalid NODE_ENV", () => {
    process.env.NODE_ENV = "staging";
    expect(() => loadConfig()).toThrow();
  });

  it("throws on negative USD_TO_SEK", () => {
    process.env.USD_TO_SEK = "-5";
    expect(() => loadConfig()).toThrow();
  });

  it("throws on zero QUEUE_MAX_CONCURRENCY", () => {
    process.env.QUEUE_MAX_CONCURRENCY = "0";
    expect(() => loadConfig()).toThrow();
  });

  it("throws on QUEUE_MAX_CONCURRENCY over 100", () => {
    process.env.QUEUE_MAX_CONCURRENCY = "101";
    expect(() => loadConfig()).toThrow();
  });

  it("includes all expected fields in result", () => {
    const config = loadConfig();
    const expectedFields = [
      "nodeEnv",
      "logDir",
      "logLevel",
      "knowledgeDir",
      "anthropicApiKey",
      "geminiApiKey",
      "serperApiKey",
      "slackBotToken",
      "slackAppToken",
      "slackSigningSecret",
      "supabaseUrl",
      "supabaseServiceRoleKey",
      "supabaseAnonKey",
      "gwsCredentialsFile",
      "hubspotApiKey",
      "linkedinAccessToken",
      "ga4CredentialsPath",
      "bufferAccessToken",
      "gatewayApiPort",
      "usdToSek",
      "queueMaxConcurrency",
    ];
    for (const field of expectedFields) {
      expect(config).toHaveProperty(field);
    }
  });
});
