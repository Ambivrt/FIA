/**
 * Workvivo wrapper — tunn integration mot Workvivo REST API v2.
 *
 * Stodjer bade lasning (engagement-data, surveys, kudos) och skrivning (posts, kudos).
 * Auth: Bearer token (API key).
 *
 * Agent-manifesten refererar till "workvivo".
 */

import { ToolDefinition, ToolUseResult } from "../llm/types";
import { AppConfig } from "../utils/config";

const TOOL_PREFIX = "workvivo_";

// ---------------------------------------------------------------------------
// HTTP helper
// ---------------------------------------------------------------------------

async function workviveFetch(
  config: AppConfig,
  path: string,
  method: "GET" | "POST" = "GET",
  body?: Record<string, unknown>,
): Promise<unknown> {
  if (!config.workvivoApiKey) {
    throw new Error("Workvivo API key not configured — set WORKVIVO_API_KEY in .env");
  }

  const url = `${config.workvivoBaseUrl}${path}`;
  const res = await fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${config.workvivoApiKey}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Workvivo API ${method} ${path} failed (${res.status}): ${text}`);
  }

  return res.json();
}

// ---------------------------------------------------------------------------
// Tool definitions
// ---------------------------------------------------------------------------

const WORKVIVO_TOOLS: ToolDefinition[] = [
  {
    name: "workvivo_list_posts",
    description:
      "Lista inlagg och nyheter fran Workvivo. Returnerar de senaste inlaggen med titel, innehall och engagemangsdata.",
    input_schema: {
      type: "object",
      properties: {
        space_id: { type: "string", description: "Filtrera pa specifikt space (valfritt)" },
        limit: { type: "number", description: "Max antal inlagg (standard 20)" },
        offset: { type: "number", description: "Offset for paginering" },
      },
    },
  },
  {
    name: "workvivo_get_post",
    description: "Hamta ett enskilt Workvivo-inlagg med alla detaljer.",
    input_schema: {
      type: "object",
      properties: {
        post_id: { type: "string", description: "Unikt ID for inlagget" },
      },
      required: ["post_id"],
    },
  },
  {
    name: "workvivo_create_post",
    description: "Publicera ett nytt inlagg eller nyhet pa Workvivo.",
    input_schema: {
      type: "object",
      properties: {
        title: { type: "string", description: "Rubrik pa inlagget" },
        body: { type: "string", description: "Inlaggets innehall (stodjer HTML)" },
        space_id: { type: "string", description: "Space att publicera i" },
        post_type: {
          type: "string",
          enum: ["update", "article", "event"],
          description: "Typ av inlagg (standard: update)",
        },
      },
      required: ["title", "body"],
    },
  },
  {
    name: "workvivo_list_spaces",
    description: "Lista alla spaces (kanaler/grupper) i Workvivo.",
    input_schema: {
      type: "object",
      properties: {
        limit: { type: "number", description: "Max antal spaces" },
      },
    },
  },
  {
    name: "workvivo_list_surveys",
    description: "Lista tillgangliga enkater i Workvivo.",
    input_schema: {
      type: "object",
      properties: {
        status: {
          type: "string",
          enum: ["active", "closed", "draft"],
          description: "Filtrera pa enkatstatus (valfritt)",
        },
      },
    },
  },
  {
    name: "workvivo_get_survey_results",
    description: "Hamta resultat och svar for en specifik enkat.",
    input_schema: {
      type: "object",
      properties: {
        survey_id: { type: "string", description: "Unikt ID for enkaten" },
      },
      required: ["survey_id"],
    },
  },
  {
    name: "workvivo_get_engagement_stats",
    description: "Hamta engagemangsstatistik — aktiva anvandare, inlagg, reaktioner, kommentarer over tid.",
    input_schema: {
      type: "object",
      properties: {
        period: {
          type: "string",
          enum: ["day", "week", "month", "quarter"],
          description: "Tidsperiod for statistik (standard: week)",
        },
        from_date: { type: "string", description: "Startdatum (YYYY-MM-DD, valfritt)" },
        to_date: { type: "string", description: "Slutdatum (YYYY-MM-DD, valfritt)" },
      },
    },
  },
  {
    name: "workvivo_list_kudos",
    description: "Lista kudos/erkannananden som getts i Workvivo.",
    input_schema: {
      type: "object",
      properties: {
        limit: { type: "number", description: "Max antal kudos" },
        from_date: { type: "string", description: "Filtrera fran datum (YYYY-MM-DD)" },
      },
    },
  },
  {
    name: "workvivo_create_kudos",
    description: "Ge kudos/erkannande till en medarbetare via Workvivo.",
    input_schema: {
      type: "object",
      properties: {
        recipient_id: { type: "string", description: "Mottagarens anvander-ID" },
        message: { type: "string", description: "Kudos-meddelande" },
        badge_id: { type: "string", description: "Badge/kategori (valfritt)" },
      },
      required: ["recipient_id", "message"],
    },
  },
];

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export async function buildWorkvivoDefs(): Promise<ToolDefinition[]> {
  return WORKVIVO_TOOLS;
}

export function isWorkvivo(toolName: string): boolean {
  return toolName.startsWith(TOOL_PREFIX);
}

export async function handleWorkvivo(toolUse: ToolUseResult, config: AppConfig): Promise<string> {
  const input = toolUse.input;

  switch (toolUse.toolName) {
    case "workvivo_list_posts": {
      const params = new URLSearchParams();
      if (input.space_id) params.set("space_id", String(input.space_id));
      if (input.limit) params.set("limit", String(input.limit));
      if (input.offset) params.set("offset", String(input.offset));
      const query = params.toString() ? `?${params.toString()}` : "";
      const data = await workviveFetch(config, `/posts${query}`);
      return JSON.stringify(data, null, 2);
    }

    case "workvivo_get_post": {
      const data = await workviveFetch(config, `/posts/${input.post_id}`);
      return JSON.stringify(data, null, 2);
    }

    case "workvivo_create_post": {
      const body: Record<string, unknown> = {
        title: String(input.title),
        body: String(input.body),
        post_type: input.post_type || "update",
      };
      if (input.space_id) body.space_id = String(input.space_id);
      const data = await workviveFetch(config, "/posts", "POST", body);
      return JSON.stringify(data, null, 2);
    }

    case "workvivo_list_spaces": {
      const params = new URLSearchParams();
      if (input.limit) params.set("limit", String(input.limit));
      const query = params.toString() ? `?${params.toString()}` : "";
      const data = await workviveFetch(config, `/spaces${query}`);
      return JSON.stringify(data, null, 2);
    }

    case "workvivo_list_surveys": {
      const params = new URLSearchParams();
      if (input.status) params.set("status", String(input.status));
      const query = params.toString() ? `?${params.toString()}` : "";
      const data = await workviveFetch(config, `/surveys${query}`);
      return JSON.stringify(data, null, 2);
    }

    case "workvivo_get_survey_results": {
      const data = await workviveFetch(config, `/surveys/${input.survey_id}/results`);
      return JSON.stringify(data, null, 2);
    }

    case "workvivo_get_engagement_stats": {
      const params = new URLSearchParams();
      if (input.period) params.set("period", String(input.period));
      if (input.from_date) params.set("from_date", String(input.from_date));
      if (input.to_date) params.set("to_date", String(input.to_date));
      const query = params.toString() ? `?${params.toString()}` : "";
      const data = await workviveFetch(config, `/analytics/engagement${query}`);
      return JSON.stringify(data, null, 2);
    }

    case "workvivo_list_kudos": {
      const params = new URLSearchParams();
      if (input.limit) params.set("limit", String(input.limit));
      if (input.from_date) params.set("from_date", String(input.from_date));
      const query = params.toString() ? `?${params.toString()}` : "";
      const data = await workviveFetch(config, `/kudos${query}`);
      return JSON.stringify(data, null, 2);
    }

    case "workvivo_create_kudos": {
      const body: Record<string, unknown> = {
        recipient_id: String(input.recipient_id),
        message: String(input.message),
      };
      if (input.badge_id) body.badge_id = String(input.badge_id);
      const data = await workviveFetch(config, "/kudos", "POST", body);
      return JSON.stringify(data, null, 2);
    }

    default:
      throw new Error(`Unknown Workvivo tool: "${toolUse.toolName}"`);
  }
}

/**
 * Quick health check — verifies that Workvivo API key is configured and API is reachable.
 */
export async function checkWorkvivoHealth(config: AppConfig): Promise<{ ok: boolean; error?: string }> {
  if (!config.workvivoApiKey) {
    return { ok: false, error: "WORKVIVO_API_KEY not set" };
  }

  try {
    await workviveFetch(config, "/spaces?limit=1");
    return { ok: true };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}
