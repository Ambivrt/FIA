import { AppConfig } from "../utils/config";
import { SearchResult } from "./types";

const SERPER_API_URL = "https://google.serper.dev/search";

export async function searchGoogle(
  config: AppConfig,
  query: string,
  numResults: number = 10
): Promise<SearchResult[]> {
  if (!config.serperApiKey) {
    throw new Error("SERPER_API_KEY must be configured");
  }

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
    throw new Error(`Serper API error ${res.status}: ${body}`);
  }

  const data = (await res.json()) as {
    organic?: Array<{ title?: string; snippet?: string; link?: string }>;
  };

  return (data.organic ?? []).map((item) => ({
    title: item.title ?? "",
    snippet: item.snippet ?? "",
    url: item.link ?? "",
  }));
}
