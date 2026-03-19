import { startCommandListener } from "../src/supabase/command-listener";
import { Logger } from "../src/gateway/logger";

// Mock task-writer
const mockUpdateTaskStatus = jest.fn().mockResolvedValue(undefined);
const mockCreateApproval = jest.fn().mockResolvedValue("approval-id");
const mockCreateTask = jest.fn().mockResolvedValue("new-task-id");
jest.mock("../src/supabase/task-writer", () => ({
  updateTaskStatus: (...args: unknown[]) => mockUpdateTaskStatus(...args),
  createApproval: (...args: unknown[]) => mockCreateApproval(...args),
  createTask: (...args: unknown[]) => mockCreateTask(...args),
}));

// Mock activity-writer
const mockLogActivity = jest.fn().mockResolvedValue(undefined);
jest.mock("../src/supabase/activity-writer", () => ({
  logActivity: (...args: unknown[]) => mockLogActivity(...args),
}));

const mockLogger: Logger = {
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
};

const mockKillSwitch = {
  activate: jest.fn().mockResolvedValue(undefined),
  deactivate: jest.fn().mockResolvedValue(undefined),
  isActive: jest.fn().mockReturnValue(false),
  getStatus: jest.fn().mockReturnValue({ active: false }),
};

// Capture the Realtime callback
let realtimeCallback: (payload: { new: Record<string, unknown> }) => Promise<void>;

const mockUpdate = jest.fn().mockReturnValue({ eq: jest.fn().mockResolvedValue({ error: null }) });
const mockInsert = jest.fn().mockResolvedValue({ error: null });
const mockSelectSingle = jest.fn().mockResolvedValue({
  data: { agent_id: "agent-1", type: "blog_post", title: "Test", priority: "normal", content_json: {} },
  error: null,
});

const mockSupabase = {
  channel: jest.fn().mockReturnValue({
    on: jest.fn().mockImplementation((_event: string, _opts: unknown, cb: typeof realtimeCallback) => {
      realtimeCallback = cb;
      return {
        subscribe: jest.fn().mockImplementation((statusCb: (s: string) => void) => {
          statusCb("SUBSCRIBED");
        }),
      };
    }),
  }),
  from: jest.fn().mockImplementation((table: string) => {
    if (table === "commands") {
      return { update: mockUpdate, insert: mockInsert };
    }
    if (table === "agents") {
      return { update: jest.fn().mockReturnValue({ eq: jest.fn().mockResolvedValue({ error: null }) }) };
    }
    if (table === "tasks") {
      return { select: jest.fn().mockReturnValue({ eq: jest.fn().mockReturnValue({ single: mockSelectSingle }) }) };
    }
    return { insert: mockInsert };
  }),
} as any;

describe("CommandListener", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    startCommandListener(mockSupabase, mockLogger, mockKillSwitch as any);
  });

  it("subscribes to commands channel on start", () => {
    expect(mockSupabase.channel).toHaveBeenCalledWith("commands");
    expect(mockLogger.info).toHaveBeenCalledWith(
      "Command listener subscribed",
      expect.objectContaining({ action: "command_listener_start" }),
    );
  });

  it("processes kill_switch activate command", async () => {
    await realtimeCallback({
      new: {
        id: "cmd-1",
        command_type: "kill_switch",
        target_slug: null,
        payload_json: { active: true },
        issued_by: "user-1",
        status: "pending",
        created_at: new Date().toISOString(),
      },
    });

    expect(mockKillSwitch.activate).toHaveBeenCalledWith("realtime", "user-1");
    expect(mockUpdate).toHaveBeenCalled();
  });

  it("processes kill_switch deactivate command", async () => {
    await realtimeCallback({
      new: {
        id: "cmd-2",
        command_type: "kill_switch",
        target_slug: null,
        payload_json: { active: false },
        issued_by: "user-1",
        status: "pending",
        created_at: new Date().toISOString(),
      },
    });

    expect(mockKillSwitch.deactivate).toHaveBeenCalledWith("realtime", "user-1");
  });

  it("processes pause_agent command with target_slug", async () => {
    await realtimeCallback({
      new: {
        id: "cmd-3",
        command_type: "pause_agent",
        target_slug: "content",
        payload_json: {},
        issued_by: "user-1",
        status: "pending",
        created_at: new Date().toISOString(),
      },
    });

    expect(mockLogActivity).toHaveBeenCalledWith(
      mockSupabase,
      expect.objectContaining({ action: "agent_paused" }),
    );
  });

  it("processes approve_task command", async () => {
    await realtimeCallback({
      new: {
        id: "cmd-4",
        command_type: "approve_task",
        target_slug: null,
        payload_json: { task_id: "task-1" },
        issued_by: "user-1",
        status: "pending",
        created_at: new Date().toISOString(),
      },
    });

    expect(mockUpdateTaskStatus).toHaveBeenCalledWith(mockSupabase, "task-1", "approved");
    expect(mockCreateApproval).toHaveBeenCalledWith(
      mockSupabase,
      expect.objectContaining({ task_id: "task-1", decision: "approved" }),
    );
  });

  it("processes reject_task command", async () => {
    await realtimeCallback({
      new: {
        id: "cmd-5",
        command_type: "reject_task",
        target_slug: null,
        payload_json: { task_id: "task-2", feedback: "Not good enough" },
        issued_by: "user-1",
        status: "pending",
        created_at: new Date().toISOString(),
      },
    });

    expect(mockUpdateTaskStatus).toHaveBeenCalledWith(mockSupabase, "task-2", "rejected");
    expect(mockCreateApproval).toHaveBeenCalledWith(
      mockSupabase,
      expect.objectContaining({ task_id: "task-2", decision: "rejected", feedback: "Not good enough" }),
    );
  });

  it("processes revision_task command", async () => {
    await realtimeCallback({
      new: {
        id: "cmd-6",
        command_type: "revision_task",
        target_slug: null,
        payload_json: { task_id: "task-3", feedback: "Please revise" },
        issued_by: "user-1",
        status: "pending",
        created_at: new Date().toISOString(),
      },
    });

    expect(mockUpdateTaskStatus).toHaveBeenCalledWith(mockSupabase, "task-3", "revision_requested");
    expect(mockCreateApproval).toHaveBeenCalledWith(
      mockSupabase,
      expect.objectContaining({ task_id: "task-3", decision: "revision_requested" }),
    );
    expect(mockCreateTask).toHaveBeenCalledWith(
      mockSupabase,
      expect.objectContaining({
        status: "queued",
        source: "dashboard",
        content_json: expect.objectContaining({ revision_feedback: "Please revise", original_task_id: "task-3" }),
      }),
    );
  });

  it("logs warning for unknown command types", async () => {
    await realtimeCallback({
      new: {
        id: "cmd-7",
        command_type: "unknown_command",
        target_slug: null,
        payload_json: {},
        issued_by: "user-1",
        status: "pending",
        created_at: new Date().toISOString(),
      },
    });

    expect(mockLogger.warn).toHaveBeenCalledWith(
      "Unknown command type: unknown_command",
      expect.objectContaining({ action: "command_unknown" }),
    );
  });

  it("marks command as failed on error", async () => {
    mockKillSwitch.activate.mockRejectedValueOnce(new Error("Kill switch failure"));

    await realtimeCallback({
      new: {
        id: "cmd-8",
        command_type: "kill_switch",
        target_slug: null,
        payload_json: { active: true },
        issued_by: "user-1",
        status: "pending",
        created_at: new Date().toISOString(),
      },
    });

    expect(mockLogger.error).toHaveBeenCalledWith(
      "Failed to process command kill_switch",
      expect.objectContaining({ action: "command_error" }),
    );
  });
});
