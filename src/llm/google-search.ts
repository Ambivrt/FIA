import { AppConfig } from "../utils/config";
import { SearchResult } from "./types";

const SEARCH_API_URL = "https://www.googleapis.com/customsearch/v1";

export async function searchGoogle(
  config: AppConfig,
  query: string,
  numResults: number = 10
): Promise<SearchResult[]> {
  if (!config.googleSearchApiKey || !config.googleSearchCx) {
    throw new Error("GOOGLE_SEARCH_API_KEY and GOOGLE_SEARCH_CX must be configured");
  }

  const params = new URLSearchParams({
    key: config.googleSearchApiKey,
    cx: config.googleSearchCx,
    q: query,
    num: String(Math.min(numResults, 10)),
  });

  const res = await fetch(`${SEARCH_API_URL}?${params}`);

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Google Search API error ${res.status}: ${body}`);
  }

  const data = (await res.json()) as {
    items?: Array<{ title?: string; snippet?: string; link?: string }>;
  };

  return (data.items ?? []).map((item) => ({
    title: item.title ?? "",
    snippet: item.snippet ?? "",
    url: item.link ?? "",
  }));
}
