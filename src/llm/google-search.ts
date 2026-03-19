import { AppConfig } from "../utils/config";
import { SearchResult } from "./types";
import { withRetry } from "./retry";

const SERPER_API_URL = "https://google.serper.dev/search";

export async function searchGoogle(config: AppConfig, query: string, numResults: number = 10): Promise<SearchResult[]> {
  if (!config.serperApiKey) {
    throw new Error("SERPER_API_KEY must be configured");
  }

  return withRetry(async () => {
    const res = await fetch(SERPER_API_URL, {
      method: "POST",
      headers: {
        "X-API-KEY": config.serperApiKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        q: query,
        gl: "se",
        hl: "sv",
        num: Math.min(numResults, 10),
      }),
    });

    if (!res.ok) {
      const body = await res.text();
      const err = new Error(`Serper API error ${res.status}: ${body}`);
      (err as any).status = res.status;
      throw err;
    }

    const data = (await res.json()) as {
      organic?: Array<{ title?: string; snippet?: string; link?: string }>;
    };

    return (data.organic ?? []).map((item) => ({
      title: item.title ?? "",
      snippet: item.snippet ?? "",
      url: item.link ?? "",
    }));
  });
}
