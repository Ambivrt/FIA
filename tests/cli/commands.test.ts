// Tester för hjälpfunktioner och kommando-parsning

// Mocka config
jest.mock("../../cli/lib/config", () => ({
  CLI_CONFIG: {
    apiBaseUrl: "http://localhost:3001",
    cliToken: "test-token",
    supabaseUrl: "",
    supabaseServiceRoleKey: "",
  },
  validateConfig: jest.fn(),
}));

// Mocka fetch
const mockFetch = jest.fn();
global.fetch = mockFetch;

import { resolveTaskId } from "../../cli/commands/helpers";

beforeEach(() => {
  mockFetch.mockReset();
});

describe("resolveTaskId", () => {
  it("returnerar fullständigt UUID direkt", async () => {
    const uuid = "abc12345-def6-7890-ghij-klmnopqrstuv";
    const result = await resolveTaskId(uuid);
    expect(result).toBe(uuid);
  });

  it("söker och matchar kort ID", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        data: [
          { id: "abc123-def-456-ghi-jkl", type: "blog_post", status: "queued" },
          { id: "xyz789-def-456-ghi-jkl", type: "seo_audit", status: "queued" },
        ],
        meta: { total: 2, page: 1, per_page: 100 },
      }),
    });

    const result = await resolveTaskId("abc123");
    expect(result).toBe("abc123-def-456-ghi-jkl");
  });

  it("avslutar vid flera matchningar", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        data: [
          { id: "abc123-first", type: "blog_post", status: "queued" },
          { id: "abc123-second", type: "seo_audit", status: "queued" },
        ],
        meta: { total: 2, page: 1, per_page: 100 },
      }),
    });

    const mockExit = jest.spyOn(process, "exit").mockImplementation(() => {
      throw new Error("process.exit");
    });

    await expect(resolveTaskId("abc123")).rejects.toThrow("process.exit");
    mockExit.mockRestore();
  });

  it("avslutar vid inga matchningar", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        data: [{ id: "xyz789-first", type: "blog_post", status: "queued" }],
        meta: { total: 1, page: 1, per_page: 100 },
      }),
    });

    const mockExit = jest.spyOn(process, "exit").mockImplementation(() => {
      throw new Error("process.exit");
    });

    await expect(resolveTaskId("abc123")).rejects.toThrow("process.exit");
    mockExit.mockRestore();
  });
});
