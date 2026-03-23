// Tester för API-klienten – mockar fetch

// Mocka config innan import
jest.mock("../../cli/lib/config", () => ({
  CLI_CONFIG: {
    apiBaseUrl: "http://localhost:3001",
    cliToken: "test-token",
    supabaseUrl: "",
    supabaseServiceRoleKey: "",
  },
  validateConfig: jest.fn(),
}));

import { apiGet, apiPost, apiPatch, ApiClientError } from "../../cli/lib/api-client";

// Mocka global fetch
const mockFetch = jest.fn();
global.fetch = mockFetch;

beforeEach(() => {
  mockFetch.mockReset();
});

describe("apiGet", () => {
  it("skickar GET med auth-header", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ data: [{ id: "1" }] }),
    });

    const result = await apiGet("/api/agents");

    expect(mockFetch).toHaveBeenCalledWith(
      "http://localhost:3001/api/agents",
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: "Bearer test-token",
        }),
      }),
    );
    expect(result.data).toEqual([{ id: "1" }]);
  });

  it("lägger till query-parametrar", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ data: [] }),
    });

    await apiGet("/api/tasks", { status: "queued", per_page: "10" });

    const calledUrl = mockFetch.mock.calls[0][0];
    expect(calledUrl).toContain("status=queued");
    expect(calledUrl).toContain("per_page=10");
  });

  it("kastar ApiClientError vid HTTP-fel", async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 404,
      json: async () => ({ error: { code: "NOT_FOUND", message: "Task not found." } }),
    });

    await expect(apiGet("/api/tasks/unknown")).rejects.toThrow(ApiClientError);
    await expect(apiGet("/api/tasks/unknown")).rejects.toMatchObject({
      statusCode: 404,
      code: "NOT_FOUND",
      message: "Task not found.",
    });
  });
});

describe("apiPost", () => {
  it("skickar POST med JSON-body", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ data: { id: "abc-123", status: "activated" } }),
    });

    const result = await apiPost("/api/kill-switch", { action: "activate" });

    expect(mockFetch).toHaveBeenCalledWith(
      "http://localhost:3001/api/kill-switch",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ action: "activate" }),
      }),
    );
    expect(result.data).toMatchObject({ status: "activated" });
  });
});

describe("apiPatch", () => {
  it("skickar PATCH med JSON-body", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ data: { slug: "content", routing: { default: "claude-opus" } } }),
    });

    const result = await apiPatch("/api/agents/content/routing", {
      routing: { default: "claude-opus" },
    });

    expect(mockFetch).toHaveBeenCalledWith(
      "http://localhost:3001/api/agents/content/routing",
      expect.objectContaining({
        method: "PATCH",
      }),
    );
    expect(result.data).toMatchObject({ slug: "content" });
  });
});
