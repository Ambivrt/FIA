/**
 * Shared retry logic with exponential backoff for LLM clients.
 */

export interface RetryConfig {
  maxRetries: number;
  baseDelayMs: number;
  maxDelayMs: number;
  retryableStatuses: number[];
}

export const DEFAULT_RETRY_CONFIG: RetryConfig = {
  maxRetries: 3,
  baseDelayMs: 1000,
  maxDelayMs: 30000,
  retryableStatuses: [429, 500, 502, 503, 504],
};

export function isRetryableError(error: unknown, config: RetryConfig = DEFAULT_RETRY_CONFIG): boolean {
  if (error instanceof Error) {
    // Check for status code in error properties
    const statusCode = (error as any).status ?? (error as any).statusCode ?? (error as any).code;
    if (typeof statusCode === "number") {
      return config.retryableStatuses.includes(statusCode);
    }

    // Check for timeout errors
    const message = error.message.toLowerCase();
    if (message.includes("timeout") || message.includes("econnreset") || message.includes("econnrefused")) {
      return true;
    }

    // Check for HTTP status in error message (word boundary to avoid false positives like "port 5029")
    for (const status of config.retryableStatuses) {
      if (new RegExp(`\\b${status}\\b`).test(message)) return true;
    }
  }

  return false;
}

function getDelayMs(attempt: number, config: RetryConfig): number {
  const delay = config.baseDelayMs * Math.pow(2, attempt);
  const jitter = delay * 0.2 * Math.random();
  return Math.min(delay + jitter, config.maxDelayMs);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function withRetry<T>(fn: () => Promise<T>, config: RetryConfig = DEFAULT_RETRY_CONFIG): Promise<T> {
  let lastError: Error | undefined;

  for (let attempt = 0; attempt <= config.maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error as Error;

      if (attempt === config.maxRetries || !isRetryableError(error, config)) {
        throw error;
      }

      const delayMs = getDelayMs(attempt, config);
      await sleep(delayMs);
    }
  }

  throw lastError;
}
