/**
 * In-memory Supabase mock for integration tests.
 *
 * Tracks all writes for assertion.
 */

export interface MockSupabaseState {
  tasks: Array<{ id: string; [key: string]: unknown }>;
  approvals: Array<Record<string, unknown>>;
  activityLog: Array<Record<string, unknown>>;
  metrics: Array<Record<string, unknown>>;
}

export function createMockSupabase() {
  const state: MockSupabaseState = {
    tasks: [],
    approvals: [],
    activityLog: [],
    metrics: [],
  };

  let taskCounter = 0;

  const mock = {
    _state: state,

    from: jest.fn((table: string) => {
      return {
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            single: jest.fn().mockResolvedValue({
              data: { id: `${table}-agent-id` },
              error: null,
            }),
          }),
        }),
        insert: jest.fn((data: any) => {
          const id = `task-${++taskCounter}`;
          if (table === "tasks") {
            state.tasks.push({ id, ...data });
          } else if (table === "approvals") {
            state.approvals.push({ id, ...data });
          } else if (table === "activity_log") {
            state.activityLog.push({ id, ...data });
          } else if (table === "metrics") {
            state.metrics.push({ id, ...data });
          }
          return {
            select: jest.fn().mockReturnValue({
              single: jest.fn().mockResolvedValue({
                data: { id, ...data },
                error: null,
              }),
            }),
          };
        }),
        update: jest.fn((data: any) => {
          return {
            eq: jest.fn().mockResolvedValue({ data, error: null }),
          };
        }),
      };
    }),
  };

  return mock as any;
}
