import { Request, Response, NextFunction } from "express";
import { dnsRebindingProtection } from "../src/api/middleware/dns-rebinding";

function mockReqRes(host?: string): { req: Partial<Request>; res: Partial<Response>; nextCalled: boolean } {
  const state = { nextCalled: false };
  const req: Partial<Request> = { headers: {} as Record<string, string> };
  if (host !== undefined) {
    (req.headers as Record<string, string>).host = host;
  }
  const res: Partial<Response> = {
    status: jest.fn().mockReturnThis() as unknown as Response["status"],
    json: jest.fn().mockReturnThis() as unknown as Response["json"],
  };
  return { req, res, ...state };
}

describe("dnsRebindingProtection", () => {
  const middleware = dnsRebindingProtection({
    allowedHosts: ["127.0.0.1:3001", "localhost:3001"],
  });

  it("allows requests with valid Host header", () => {
    const { req, res } = mockReqRes("127.0.0.1:3001");
    let called = false;
    middleware(
      req as Request,
      res as Response,
      (() => {
        called = true;
      }) as NextFunction,
    );
    expect(called).toBe(true);
    expect(res.status).not.toHaveBeenCalled();
  });

  it("allows requests with localhost Host header", () => {
    const { req, res } = mockReqRes("localhost:3001");
    let called = false;
    middleware(
      req as Request,
      res as Response,
      (() => {
        called = true;
      }) as NextFunction,
    );
    expect(called).toBe(true);
  });

  it("rejects requests with invalid Host header", () => {
    const { req, res } = mockReqRes("evil.attacker.com:3001");
    let called = false;
    middleware(
      req as Request,
      res as Response,
      (() => {
        called = true;
      }) as NextFunction,
    );
    expect(called).toBe(false);
    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith({
      error: { code: "FORBIDDEN", message: "Invalid Host header." },
    });
  });

  it("rejects requests with DNS rebinding Host header", () => {
    const { req, res } = mockReqRes("192.168.1.100:3001");
    let called = false;
    middleware(
      req as Request,
      res as Response,
      (() => {
        called = true;
      }) as NextFunction,
    );
    expect(called).toBe(false);
    expect(res.status).toHaveBeenCalledWith(403);
  });

  it("allows requests without Host header", () => {
    const { req, res } = mockReqRes(undefined);
    let called = false;
    middleware(
      req as Request,
      res as Response,
      (() => {
        called = true;
      }) as NextFunction,
    );
    expect(called).toBe(true);
  });

  it("is case-insensitive for Host matching", () => {
    const { req, res } = mockReqRes("LOCALHOST:3001");
    let called = false;
    middleware(
      req as Request,
      res as Response,
      (() => {
        called = true;
      }) as NextFunction,
    );
    expect(called).toBe(true);
    expect(res.status).not.toHaveBeenCalled();
  });
});
