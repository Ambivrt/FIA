import { buildGwsToolDefinitions, handleGwsToolUse, isGwsTool } from "../src/mcp/gws";
import { buildToolDefinitions, dispatchToolUse, hasTools } from "../src/mcp/tool-registry";

// Mock the @alanse MCP package
jest.mock("@alanse/mcp-server-google-workspace/dist/tools/index.js", () => ({
  tools: [
    {
      name: "drive_list_files",
      description: "List files in Google Drive",
      inputSchema: {
        type: "object",
        properties: {
          query: { type: "string", description: "Search query" },
        },
        required: [],
      },
      handler: jest.fn().mockResolvedValue({
        files: [{ id: "abc123", name: "test-file.txt" }],
      }),
    },
    {
      name: "drive_search",
      description: "Search files in Google Drive",
      inputSchema: {
        type: "object",
        properties: {
          query: { type: "string", description: "Search query" },
        },
        required: ["query"],
      },
      handler: jest.fn().mockResolvedValue({
        files: [{ id: "abc123", name: "found-file.txt" }],
      }),
    },
    {
      name: "gdocs_create",
      description: "Create a Google Doc",
      inputSchema: {
        type: "object",
        properties: {
          title: { type: "string", description: "Document title" },
        },
        required: ["title"],
      },
      handler: jest.fn().mockResolvedValue({
        documentId: "doc123",
        title: "Test Doc",
      }),
    },
    {
      name: "gsheets_read",
      description: "Read a Google Sheet",
      inputSchema: {
        type: "object",
        properties: {
          spreadsheetId: { type: "string" },
          range: { type: "string" },
        },
        required: ["spreadsheetId"],
      },
      handler: jest.fn().mockResolvedValue({
        values: [
          ["A1", "B1"],
          ["A2", "B2"],
        ],
      }),
    },
  ],
}));

describe("GWS Wrapper", () => {
  describe("isGwsTool", () => {
    it("returns true for drive tools", () => {
      expect(isGwsTool("drive_list_files")).toBe(true);
      expect(isGwsTool("drive_search")).toBe(true);
    });

    it("returns true for docs tools", () => {
      expect(isGwsTool("gdocs_create")).toBe(true);
    });

    it("returns true for sheets tools", () => {
      expect(isGwsTool("gsheets_read")).toBe(true);
    });

    it("returns false for non-GWS tools", () => {
      expect(isGwsTool("hubspot_list_contacts")).toBe(false);
      expect(isGwsTool("unknown_tool")).toBe(false);
    });
  });

  describe("buildGwsToolDefinitions", () => {
    it("returns empty array for agents without GWS tools", async () => {
      const result = await buildGwsToolDefinitions(["hubspot", "buffer"]);
      expect(result).toEqual([]);
    });

    it("returns drive tools for gws:drive", async () => {
      const result = await buildGwsToolDefinitions(["gws:drive"]);
      expect(result.length).toBeGreaterThan(0);
      expect(result.every((t) => t.name.startsWith("drive_"))).toBe(true);
      expect(result[0]).toHaveProperty("name");
      expect(result[0]).toHaveProperty("description");
      expect(result[0]).toHaveProperty("input_schema");
    });

    it("returns docs tools for gws:docs", async () => {
      const result = await buildGwsToolDefinitions(["gws:docs"]);
      expect(result.length).toBeGreaterThan(0);
      expect(result.every((t) => t.name.startsWith("gdocs_"))).toBe(true);
    });

    it("returns sheets tools for gws:sheets", async () => {
      const result = await buildGwsToolDefinitions(["gws:sheets"]);
      expect(result.length).toBeGreaterThan(0);
      expect(result.every((t) => t.name.startsWith("gsheets_"))).toBe(true);
    });

    it("combines tools from multiple services", async () => {
      const result = await buildGwsToolDefinitions(["gws:drive", "gws:docs"]);
      const driveTools = result.filter((t) => t.name.startsWith("drive_"));
      const docsTools = result.filter((t) => t.name.startsWith("gdocs_"));
      expect(driveTools.length).toBeGreaterThan(0);
      expect(docsTools.length).toBeGreaterThan(0);
    });

    it("returns empty for gws:analytics (not yet supported)", async () => {
      const result = await buildGwsToolDefinitions(["gws:analytics"]);
      expect(result).toEqual([]);
    });
  });

  describe("handleGwsToolUse", () => {
    const mockConfig = {
      gwsCredentialsFile: "",
    } as any;

    it("calls MCP handler for drive_list_files", async () => {
      const result = await handleGwsToolUse({ toolName: "drive_list_files", input: {} }, mockConfig);
      const parsed = JSON.parse(result);
      expect(parsed.files).toBeDefined();
      expect(parsed.files[0].id).toBe("abc123");
    });

    it("calls MCP handler for gdocs_create", async () => {
      const result = await handleGwsToolUse({ toolName: "gdocs_create", input: { title: "Test" } }, mockConfig);
      const parsed = JSON.parse(result);
      expect(parsed.documentId).toBe("doc123");
    });

    it("throws for unknown tool", async () => {
      await expect(handleGwsToolUse({ toolName: "nonexistent_tool", input: {} }, mockConfig)).rejects.toThrow();
    });
  });
});

describe("Tool Registry", () => {
  describe("hasTools", () => {
    it("returns true for agents with GWS tools", () => {
      expect(hasTools(["gws:drive", "gws:docs"])).toBe(true);
    });

    it("returns false for agents without tools", () => {
      expect(hasTools([])).toBe(false);
    });

    it("returns false for agents with only non-GWS tools", () => {
      expect(hasTools(["hubspot", "buffer"])).toBe(false);
    });
  });

  describe("buildToolDefinitions", () => {
    it("builds tool definitions from agent manifest tools", async () => {
      const defs = await buildToolDefinitions(["gws:drive", "gws:docs"]);
      expect(defs.length).toBeGreaterThan(0);
      // Each definition should match Claude ToolDefinition format
      for (const def of defs) {
        expect(def).toHaveProperty("name");
        expect(def).toHaveProperty("description");
        expect(def).toHaveProperty("input_schema");
        expect(typeof def.name).toBe("string");
        expect(typeof def.description).toBe("string");
      }
    });
  });

  describe("dispatchToolUse", () => {
    const mockConfig = { gwsCredentialsFile: "" } as any;

    it("dispatches GWS tools correctly", async () => {
      const result = await dispatchToolUse({ toolName: "drive_list_files", input: {} }, mockConfig);
      expect(result).toBeTruthy();
    });

    it("throws for unknown tool prefixes", async () => {
      await expect(dispatchToolUse({ toolName: "unknown_tool", input: {} }, mockConfig)).rejects.toThrow(
        'Unknown tool: "unknown_tool"',
      );
    });
  });
});
