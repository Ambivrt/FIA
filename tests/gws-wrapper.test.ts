import { buildGwsToolDefinitions, handleGwsToolUse, isGwsTool, toolNameToCliArgs } from "../src/mcp/gws";
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

describe("toolNameToCliArgs — CLI fallback mapping", () => {
  describe("Drive tools (8)", () => {
    it("maps drive_list_files", () => {
      const result = toolNameToCliArgs("drive_list_files", {});
      expect(result).toEqual(["drive", "files", "list"]);
    });

    it("maps drive_search with query", () => {
      const result = toolNameToCliArgs("drive_search", { query: "budget" });
      expect(result).toEqual(["drive", "files", "list", "--q", "budget"]);
    });

    it("maps drive_read_file with file_id", () => {
      const result = toolNameToCliArgs("drive_read_file", { file_id: "abc123" });
      expect(result).toEqual(["drive", "files", "export", "--file-id", "abc123"]);
    });

    it("maps drive_get_metadata with file_id", () => {
      const result = toolNameToCliArgs("drive_get_metadata", { file_id: "abc123" });
      expect(result).toEqual(["drive", "files", "get", "--file-id", "abc123"]);
    });

    it("maps drive_create_file", () => {
      const result = toolNameToCliArgs("drive_create_file", { name: "test.txt" });
      expect(result).toEqual(["drive", "files", "create", "--name", "test.txt"]);
    });

    it("maps drive_upload_file with filePath", () => {
      const result = toolNameToCliArgs("drive_upload_file", { name: "doc.pdf", filePath: "/tmp/doc.pdf" });
      expect(result).toEqual(["drive", "files", "create", "--upload", "/tmp/doc.pdf", "--name", "doc.pdf"]);
    });

    it("maps drive_create_folder with folder mime-type", () => {
      const result = toolNameToCliArgs("drive_create_folder", { name: "Reports" });
      expect(result).toEqual([
        "drive",
        "files",
        "create",
        "--mime-type",
        "application/vnd.google-apps.folder",
        "--name",
        "Reports",
      ]);
    });

    it("maps drive_list_folder_contents with parent query", () => {
      const result = toolNameToCliArgs("drive_list_folder_contents", { folderId: "folder123" });
      expect(result).toEqual(["drive", "files", "list", "--q", "'folder123' in parents"]);
    });
  });

  describe("Docs tools (9)", () => {
    it("maps gdocs_create", () => {
      expect(toolNameToCliArgs("gdocs_create", { title: "My Doc" })).toEqual([
        "docs",
        "documents",
        "create",
        "--title",
        "My Doc",
      ]);
    });

    it("maps gdocs_read", () => {
      expect(toolNameToCliArgs("gdocs_read", { documentId: "doc123" })).toEqual([
        "docs",
        "documents",
        "get",
        "--document-id",
        "doc123",
      ]);
    });

    it("maps gdocs_get_metadata", () => {
      expect(toolNameToCliArgs("gdocs_get_metadata", { documentId: "doc123" })).toEqual([
        "docs",
        "documents",
        "get",
        "--document-id",
        "doc123",
      ]);
    });

    it("maps gdocs_list_documents with mime-type filter", () => {
      expect(toolNameToCliArgs("gdocs_list_documents", {})).toEqual([
        "drive",
        "files",
        "list",
        "--q",
        "mimeType='application/vnd.google-apps.document'",
      ]);
    });

    it("maps gdocs_insert_text with batchUpdate body", () => {
      const result = toolNameToCliArgs("gdocs_insert_text", { documentId: "doc1", text: "Hello", index: 5 });
      expect(result!.slice(0, 3)).toEqual(["docs", "documents", "batchUpdate"]);
      expect(result).toContain("--request-body");
      const body = JSON.parse(result![result!.indexOf("--request-body") + 1]);
      expect(body.requests[0].insertText.location.index).toBe(5);
      expect(body.requests[0].insertText.text).toBe("Hello");
    });

    it("maps gdocs_update_text with delete+insert body", () => {
      const result = toolNameToCliArgs("gdocs_update_text", {
        documentId: "doc1",
        text: "New",
        startIndex: 10,
        endIndex: 20,
      });
      const body = JSON.parse(result![result!.indexOf("--request-body") + 1]);
      expect(body.requests).toHaveLength(2);
      expect(body.requests[0].deleteContentRange.range.startIndex).toBe(10);
      expect(body.requests[1].insertText.text).toBe("New");
    });

    it("maps gdocs_append_text with endOfSegmentLocation", () => {
      const result = toolNameToCliArgs("gdocs_append_text", { documentId: "doc1", text: "Appended" });
      const body = JSON.parse(result![result!.indexOf("--request-body") + 1]);
      expect(body.requests[0].insertText.endOfSegmentLocation).toBeDefined();
    });

    it("maps gdocs_replace_text with replaceAllText body", () => {
      const result = toolNameToCliArgs("gdocs_replace_text", { documentId: "doc1", find: "old", replaceWith: "new" });
      const body = JSON.parse(result![result!.indexOf("--request-body") + 1]);
      expect(body.requests[0].replaceAllText.containsText.text).toBe("old");
      expect(body.requests[0].replaceAllText.replaceText).toBe("new");
    });

    it("maps gdocs_export with file-id and mime-type", () => {
      expect(toolNameToCliArgs("gdocs_export", { documentId: "doc1", mimeType: "text/plain" })).toEqual([
        "drive",
        "files",
        "export",
        "--file-id",
        "doc1",
        "--mime-type",
        "text/plain",
      ]);
    });
  });

  describe("Sheets tools (6)", () => {
    it("maps gsheets_read", () => {
      expect(toolNameToCliArgs("gsheets_read", { spreadsheetId: "ss1", range: "A1:B2" })).toEqual([
        "sheets",
        "spreadsheets",
        "values",
        "get",
        "--spreadsheet-id",
        "ss1",
        "--range",
        "A1:B2",
      ]);
    });
    it("maps gsheets_list_sheets", () => {
      expect(toolNameToCliArgs("gsheets_list_sheets", { spreadsheetId: "ss1" })).toEqual([
        "sheets",
        "spreadsheets",
        "get",
        "--spreadsheet-id",
        "ss1",
      ]);
    });
    it("maps gsheets_create_spreadsheet", () => {
      expect(toolNameToCliArgs("gsheets_create_spreadsheet", { title: "Budget" })).toEqual([
        "sheets",
        "spreadsheets",
        "create",
        "--title",
        "Budget",
      ]);
    });
    it("maps gsheets_update_cell", () => {
      expect(toolNameToCliArgs("gsheets_update_cell", { spreadsheetId: "ss1", range: "A1" })).toEqual([
        "sheets",
        "spreadsheets",
        "values",
        "update",
        "--spreadsheet-id",
        "ss1",
        "--range",
        "A1",
      ]);
    });
    it("maps gsheets_append_data", () => {
      expect(toolNameToCliArgs("gsheets_append_data", { spreadsheetId: "ss1", range: "A1" })).toEqual([
        "sheets",
        "spreadsheets",
        "values",
        "append",
        "--spreadsheet-id",
        "ss1",
        "--range",
        "A1",
      ]);
    });
    it("maps gsheets_batch_update", () => {
      expect(toolNameToCliArgs("gsheets_batch_update", { spreadsheetId: "ss1" })).toEqual([
        "sheets",
        "spreadsheets",
        "batchUpdate",
        "--spreadsheet-id",
        "ss1",
      ]);
    });
  });

  describe("Gmail tools (4)", () => {
    it("maps gmail_search_messages", () => {
      expect(toolNameToCliArgs("gmail_search_messages", { query: "from:boss", max_results: 10 })).toEqual([
        "gmail",
        "users",
        "messages",
        "list",
        "--q",
        "from:boss",
        "--max-results",
        "10",
      ]);
    });
    it("maps gmail_get_message", () => {
      expect(toolNameToCliArgs("gmail_get_message", { messageId: "msg123" })).toEqual([
        "gmail",
        "users",
        "messages",
        "get",
        "--id",
        "msg123",
      ]);
    });
    it("maps gmail_send_message", () => {
      expect(toolNameToCliArgs("gmail_send_message", { to: "a@b.com", subject: "Hi", body: "Hello" })).toEqual([
        "gmail",
        "users",
        "messages",
        "send",
        "--to",
        "a@b.com",
        "--subject",
        "Hi",
        "--body",
        "Hello",
      ]);
    });
    it("maps gmail_draft_message", () => {
      expect(toolNameToCliArgs("gmail_draft_message", { to: "a@b.com", subject: "Draft" })).toEqual([
        "gmail",
        "users",
        "drafts",
        "create",
        "--to",
        "a@b.com",
        "--subject",
        "Draft",
      ]);
    });
  });

  describe("Calendar tools (5)", () => {
    it("maps calendar_list_events", () => {
      expect(toolNameToCliArgs("calendar_list_events", { calendarId: "primary", timeMin: "2026-01-01" })).toEqual([
        "calendar",
        "events",
        "list",
        "--calendar-id",
        "primary",
        "--time-min",
        "2026-01-01",
      ]);
    });
    it("maps calendar_get_event", () => {
      expect(toolNameToCliArgs("calendar_get_event", { calendarId: "primary", eventId: "ev1" })).toEqual([
        "calendar",
        "events",
        "get",
        "--calendar-id",
        "primary",
        "--event-id",
        "ev1",
      ]);
    });
    it("maps calendar_create_event", () => {
      expect(
        toolNameToCliArgs("calendar_create_event", { summary: "Meeting", start: "2026-01-01T10:00:00" }),
      ).toEqual([
        "calendar",
        "events",
        "insert",
        "--summary",
        "Meeting",
        "--start",
        "2026-01-01T10:00:00",
      ]);
    });
    it("maps calendar_update_event", () => {
      expect(toolNameToCliArgs("calendar_update_event", { eventId: "ev1", summary: "Updated" })).toEqual([
        "calendar",
        "events",
        "patch",
        "--event-id",
        "ev1",
        "--summary",
        "Updated",
      ]);
    });
    it("maps calendar_delete_event", () => {
      expect(toolNameToCliArgs("calendar_delete_event", { calendarId: "primary", eventId: "ev1" })).toEqual([
        "calendar",
        "events",
        "delete",
        "--calendar-id",
        "primary",
        "--event-id",
        "ev1",
      ]);
    });
  });

  describe("Edge cases", () => {
    it("returns null for unknown tools", () => {
      expect(toolNameToCliArgs("unknown_tool", {})).toBeNull();
    });

    it("skips undefined and null input values", () => {
      expect(toolNameToCliArgs("drive_list_files", { query: undefined, max_results: null, name: "" })).toEqual([
        "drive",
        "files",
        "list",
      ]);
    });

    it("covers all 32 curated tools", () => {
      const all = [
        "drive_list_files",
        "drive_search",
        "drive_read_file",
        "drive_get_metadata",
        "drive_create_file",
        "drive_upload_file",
        "drive_create_folder",
        "drive_list_folder_contents",
        "gdocs_create",
        "gdocs_read",
        "gdocs_get_metadata",
        "gdocs_list_documents",
        "gdocs_insert_text",
        "gdocs_update_text",
        "gdocs_append_text",
        "gdocs_replace_text",
        "gdocs_export",
        "gsheets_read",
        "gsheets_list_sheets",
        "gsheets_create_spreadsheet",
        "gsheets_update_cell",
        "gsheets_append_data",
        "gsheets_batch_update",
        "gmail_search_messages",
        "gmail_get_message",
        "gmail_send_message",
        "gmail_draft_message",
        "calendar_list_events",
        "calendar_get_event",
        "calendar_create_event",
        "calendar_update_event",
        "calendar_delete_event",
      ];
      for (const tool of all) {
        expect(toolNameToCliArgs(tool, {})).not.toBeNull();
      }
    });
  });
});
