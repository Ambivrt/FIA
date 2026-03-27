import { withRetry, isRetryableError, RetryConfig } from "../src/llm/retry";

const FAST_CONFIG: RetryConfig = {
  maxRetries: 3,
  baseDelayMs: 1, // Fast for tests
  maxDelayMs: 10,
  retryableStatuses: [429, 529, 500, 502, 503, 504],
};

describe("isRetryableError", () => {
  it("returns true for 429 rate limit", () => {
    const err = new Error("Rate limited") as any;
    err.status = 429;
    expect(isRetryableError(err)).toBe(true);
  });

  it("returns true for 503 service unavailable", () => {
    const err = new Error("Service unavailable") as any;
    err.status = 503;
    expect(isRetryableError(err)).toBe(true);
  });

  it("returns true for 500 server error", () => {
    const err = new Error("Internal server error") as any;
    err.status = 500;
    expect(isRetryableError(err)).toBe(true);
  });

  it("returns true for 529 overloaded", () => {
    const err = new Error("Overloaded") as any;
    err.status = 529;
    expect(isRetryableError(err)).toBe(true);
  });

  it("matches 529 in error message text", () => {
    expect(isRetryableError(new Error("529 overloaded_error"))).toBe(true);
  });

  it("returns false for 400 bad request", () => {
    const err = new Error("Bad request") as any;
    err.status = 400;
    expect(isRetryableError(err)).toBe(false);
  });

  it("returns false for 401 unauthorized", () => {
    const err = new Error("Unauthorized") as any;
    err.status = 401;
    expect(isRetryableError(err)).toBe(false);
  });

  it("returns true for timeout errors", () => {
    expect(isRetryableError(new Error("Request timeout"))).toBe(true);
  });

  it("returns true for connection reset errors", () => {
    expect(isRetryableError(new Error("ECONNRESET"))).toBe(true);
  });

  it("returns false for generic errors without status", () => {
    expect(isRetryableError(new Error("Something went wrong"))).toBe(false);
  });

  it("does not false-positive on port numbers containing retryable status codes", () => {
    // "port 5029" should NOT match "502"
    expect(isRetryableError(new Error("Connection to port 5029 refused"))).toBe(false);
    // "error 5001" should NOT match "500"
    expect(isRetryableError(new Error("Process exited with code 5001"))).toBe(false);
  });

  it("matches exact HTTP status codes in error messages", () => {
    expect(isRetryableError(new Error("HTTP error 502: Bad Gateway"))).toBe(true);
    expect(isRetryableError(new Error("Status 429 rate limit"))).toBe(true);
  });
});

describe("withRetry", () => {
  it("returns immediately on success", async () => {
    const fn = jest.fn().mockResolvedValue("ok");
    const result = await withRetry(fn, FAST_CONFIG);
    expect(result).toBe("ok");
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("retries on retryable error and succeeds", async () => {
    const err = new Error("Service unavailable") as any;
    err.status = 503;
    const fn = jest.fn().mockRejectedValueOnce(err).mockResolvedValueOnce("recovered");

    const result = await withRetry(fn, FAST_CONFIG);
    expect(result).toBe("recovered");
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it("retries on 529 overloaded and succeeds", async () => {
    const err = new Error("Overloaded") as any;
    err.status = 529;
    const fn = jest.fn().mockRejectedValueOnce(err).mockResolvedValueOnce("recovered");

    const result = await withRetry(fn, FAST_CONFIG);
    expect(result).toBe("recovered");
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it("does not retry on non-retryable error", async () => {
    const err = new Error("Bad request") as any;
    err.status = 400;
    const fn = jest.fn().mockRejectedValue(err);

    await expect(withRetry(fn, FAST_CONFIG)).rejects.toThrow("Bad request");
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("gives up after maxRetries", async () => {
    const err = new Error("Server error") as any;
    err.status = 500;
    const fn = jest.fn().mockRejectedValue(err);

    await expect(withRetry(fn, FAST_CONFIG)).rejects.toThrow("Server error");
    expect(fn).toHaveBeenCalledTimes(4); // 1 initial + 3 retries
  });

  it("retries exactly maxRetries times", async () => {
    const err = new Error("Rate limited") as any;
    err.status = 429;
    const fn = jest
      .fn()
      .mockRejectedValueOnce(err)
      .mockRejectedValueOnce(err)
      .mockRejectedValueOnce(err)
      .mockResolvedValueOnce("finally");

    const result = await withRetry(fn, FAST_CONFIG);
    expect(result).toBe("finally");
    expect(fn).toHaveBeenCalledTimes(4);
  });
});
