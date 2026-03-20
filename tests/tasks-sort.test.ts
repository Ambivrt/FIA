/**
 * B4: Verify sort parameter whitelist in tasks route.
 *
 * We test the whitelist logic by importing the route and sending mock requests.
 */

import express from "express";
import { taskRoutes } from "../src/api/routes/tasks";

// Mock Supabase to capture the sort field passed to .order()
let capturedSortField: string | undefined;
let capturedAscending: boolean | undefined;

const mockQuery = {
  select: jest.fn().mockReturnThis(),
  eq: jest.fn().mockReturnThis(),
  order: jest.fn().mockImplementation(function (this: any, field: string, opts: { ascending: boolean }) {
    capturedSortField = field;
    capturedAscending = opts.ascending;
    return this;
  }),
  range: jest.fn().mockResolvedValue({ data: [], error: null, count: 0 }),
};

const mockSupabase = {
  from: jest.fn().mockReturnValue(mockQuery),
} as any;

function buildApp() {
  const app = express();
  app.use(express.json());
  // Skip auth for testing
  app.use("/api/tasks", taskRoutes(mockSupabase));
  return app;
}

// Use supertest-like approach with raw http
import http from "http";

function request(app: express.Express, path: string): Promise<{ status: number; body: any }> {
  return new Promise((resolve, reject) => {
    const server = app.listen(0, () => {
      const port = (server.address() as any).port;
      http
        .get(`http://127.0.0.1:${port}${path}`, (res) => {
          let data = "";
          res.on("data", (chunk) => (data += chunk));
          res.on("end", () => {
            server.close();
            resolve({ status: res.statusCode!, body: JSON.parse(data) });
          });
        })
        .on("error", (err) => {
          server.close();
          reject(err);
        });
    });
  });
}

describe("Tasks sort whitelist (B4)", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    capturedSortField = undefined;
    capturedAscending = undefined;
  });

  it("allows valid sort field", async () => {
    const app = buildApp();
    await request(app, "/api/tasks?sort=-updated_at");

    expect(capturedSortField).toBe("updated_at");
    expect(capturedAscending).toBe(false);
  });

  it("falls back to created_at for invalid sort field", async () => {
    const app = buildApp();
    await request(app, "/api/tasks?sort=evil_column");

    expect(capturedSortField).toBe("created_at");
    expect(capturedAscending).toBe(true);
  });

  it("falls back to created_at for SQL injection attempt", async () => {
    const app = buildApp();
    await request(app, "/api/tasks?sort=-id;DROP%20TABLE%20tasks");

    expect(capturedSortField).toBe("created_at");
  });

  it("defaults to -created_at when no sort param", async () => {
    const app = buildApp();
    await request(app, "/api/tasks");

    expect(capturedSortField).toBe("created_at");
    expect(capturedAscending).toBe(false);
  });
});
