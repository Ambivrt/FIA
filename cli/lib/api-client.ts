// HTTP-klient mot FIA Gateway REST API

import { CLI_CONFIG } from "./config";

interface ApiResponse<T> {
  data: T;
  meta?: {
    total: number;
    page: number;
    per_page: number;
  };
}

class ApiClientError extends Error {
  constructor(
    public statusCode: number,
    public code: string,
    message: string,
  ) {
    super(message);
    this.name = "ApiClientError";
  }
}

const MAX_RETRIES = 3;
const BASE_DELAY_MS = 1000;

function headers(): Record<string, string> {
  return {
    Authorization: `Bearer ${CLI_CONFIG.cliToken}`,
    "Content-Type": "application/json",
  };
}

async function fetchWithRetry(url: string, init?: RequestInit): Promise<Response> {
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    const res = await fetch(url, init);
    if (res.status !== 429 || attempt === MAX_RETRIES) return res;

    const retryAfter = res.headers.get("retry-after");
    const delay = retryAfter ? parseInt(retryAfter, 10) * 1000 : BASE_DELAY_MS * Math.pow(2, attempt);
    await new Promise((r) => setTimeout(r, delay));
  }
  throw new Error("Max retries exceeded");
}

async function handleResponse<T>(res: Response): Promise<T> {
  if (!res.ok) {
    let code = "UNKNOWN";
    let message = `HTTP ${res.status}`;
    try {
      const body = (await res.json()) as { error?: { code?: string; message?: string } };
      if (body.error) {
        code = body.error.code || code;
        message = body.error.message || message;
      }
    } catch {
      // Svaret var inte JSON
    }
    throw new ApiClientError(res.status, code, message);
  }

  return (await res.json()) as T;
}

export async function apiGet<T>(path: string, params?: Record<string, string>): Promise<ApiResponse<T>> {
  const url = new URL(`${CLI_CONFIG.apiBaseUrl}${path}`);
  if (params) {
    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined && value !== "") {
        url.searchParams.set(key, value);
      }
    }
  }

  const res = await fetchWithRetry(url.toString(), { headers: headers() });
  return handleResponse<ApiResponse<T>>(res);
}

export async function apiPost<T>(path: string, body?: unknown): Promise<ApiResponse<T>> {
  const res = await fetchWithRetry(`${CLI_CONFIG.apiBaseUrl}${path}`, {
    method: "POST",
    headers: headers(),
    body: body ? JSON.stringify(body) : undefined,
  });
  return handleResponse<ApiResponse<T>>(res);
}

export async function apiPatch<T>(path: string, body: unknown): Promise<ApiResponse<T>> {
  const res = await fetchWithRetry(`${CLI_CONFIG.apiBaseUrl}${path}`, {
    method: "PATCH",
    headers: headers(),
    body: JSON.stringify(body),
  });
  return handleResponse<ApiResponse<T>>(res);
}

export { ApiClientError };
