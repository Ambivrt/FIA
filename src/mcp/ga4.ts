/**
 * GA4 (Google Analytics 4) wrapper — tunn integration mot GA4 Data API och Admin API.
 *
 * Anvander googleapis (redan installerat via GWS) for:
 * - Data API v1beta: rapporter, realtidsdata, metadata
 * - Admin API v1beta: properties, audiences, konverteringsmal
 *
 * Agent-manifesten refererar till "ga4" (eller legacy "gws:analytics").
 */

import { ToolDefinition, ToolUseResult } from "../llm/types";
import { AppConfig } from "../utils/config";
import { getServiceAccountAuth } from "./google-auth";

const GA4_SCOPES = [
  "https://www.googleapis.com/auth/analytics.readonly",
  "https://www.googleapis.com/auth/analytics.edit",
];

const TOOL_PREFIX = "ga4_";

// ---------------------------------------------------------------------------
// Tool definitions — kurerad uppsattning for LLM
// ---------------------------------------------------------------------------

const GA4_TOOLS: ToolDefinition[] = [
  {
    name: "ga4_run_report",
    description: "Kor en GA4-rapport med dimensioner och metriker. Returnerar rader med data for angiven tidsperiod.",
    input_schema: {
      type: "object",
      properties: {
        property_id: { type: "string", description: "GA4 property ID (utan 'properties/' prefix)" },
        date_range_start: { type: "string", description: "Startdatum (YYYY-MM-DD)" },
        date_range_end: { type: "string", description: "Slutdatum (YYYY-MM-DD)" },
        dimensions: {
          type: "array",
          items: { type: "string" },
          description: "Dimensioner att gruppera pa (t.ex. 'date', 'country', 'pagePath')",
        },
        metrics: {
          type: "array",
          items: { type: "string" },
          description: "Metriker att hamta (t.ex. 'sessions', 'activeUsers', 'screenPageViews', 'conversions')",
        },
        limit: { type: "number", description: "Max antal rader (standard 100)" },
      },
      required: ["property_id", "date_range_start", "date_range_end", "metrics"],
    },
  },
  {
    name: "ga4_run_realtime_report",
    description: "Hamta realtidsdata fran GA4 — aktiva anvandare, sidor, handelser just nu.",
    input_schema: {
      type: "object",
      properties: {
        property_id: { type: "string", description: "GA4 property ID" },
        dimensions: {
          type: "array",
          items: { type: "string" },
          description: "Realtidsdimensioner (t.ex. 'unifiedScreenName', 'country', 'eventName')",
        },
        metrics: {
          type: "array",
          items: { type: "string" },
          description: "Realtidsmetriker (t.ex. 'activeUsers', 'eventCount')",
        },
      },
      required: ["property_id", "metrics"],
    },
  },
  {
    name: "ga4_get_metadata",
    description: "Hamta tillgangliga dimensioner och metriker for en GA4-property.",
    input_schema: {
      type: "object",
      properties: {
        property_id: { type: "string", description: "GA4 property ID" },
      },
      required: ["property_id"],
    },
  },
  {
    name: "ga4_list_properties",
    description: "Lista alla GA4-properties som service-kontot har tillgang till.",
    input_schema: {
      type: "object",
      properties: {
        account_id: { type: "string", description: "Google Analytics account ID (valfritt — listar alla om tom)" },
      },
    },
  },
  {
    name: "ga4_get_property",
    description: "Hamta detaljer for en specifik GA4-property.",
    input_schema: {
      type: "object",
      properties: {
        property_id: { type: "string", description: "GA4 property ID" },
      },
      required: ["property_id"],
    },
  },
  {
    name: "ga4_list_audiences",
    description: "Lista malgrupper (audiences) for en GA4-property.",
    input_schema: {
      type: "object",
      properties: {
        property_id: { type: "string", description: "GA4 property ID" },
      },
      required: ["property_id"],
    },
  },
  {
    name: "ga4_create_audience",
    description: "Skapa en ny malgrupp (audience) i GA4.",
    input_schema: {
      type: "object",
      properties: {
        property_id: { type: "string", description: "GA4 property ID" },
        display_name: { type: "string", description: "Namn pa malgruppen" },
        description: { type: "string", description: "Beskrivning av malgruppen" },
        membership_duration_days: { type: "number", description: "Hur lange anvandare stannar i malgruppen (dagar)" },
        filter_expression: {
          type: "object",
          description: "Filter-uttryck for malgruppen (GA4 AudienceFilterExpression JSON)",
        },
      },
      required: ["property_id", "display_name", "filter_expression"],
    },
  },
  {
    name: "ga4_list_conversion_events",
    description: "Lista alla konverteringshandelser for en GA4-property.",
    input_schema: {
      type: "object",
      properties: {
        property_id: { type: "string", description: "GA4 property ID" },
      },
      required: ["property_id"],
    },
  },
];

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Build ToolDefinition[] for GA4 tools.
 */
export async function buildGa4ToolDefinitions(): Promise<ToolDefinition[]> {
  return GA4_TOOLS;
}

/**
 * Check if a tool name belongs to GA4.
 */
export function isGa4Tool(toolName: string): boolean {
  return toolName.startsWith(TOOL_PREFIX);
}

/**
 * Execute a GA4 tool_use call from the LLM.
 */
export async function handleGa4ToolUse(toolUse: ToolUseResult, config: AppConfig): Promise<string> {
  const authClient = await getServiceAccountAuth(config, GA4_SCOPES);
  if (!authClient) {
    throw new Error("GA4 auth not configured — set GA4_CREDENTIALS_PATH in .env");
  }

  const { google } = await import("googleapis");
  const analyticsData = google.analyticsdata({ version: "v1beta", auth: authClient as any });
  const analyticsAdmin = google.analyticsadmin({ version: "v1beta", auth: authClient as any });
  const input = toolUse.input;

  switch (toolUse.toolName) {
    case "ga4_run_report": {
      const res = await analyticsData.properties.runReport({
        property: `properties/${input.property_id}`,
        requestBody: {
          dateRanges: [
            {
              startDate: String(input.date_range_start),
              endDate: String(input.date_range_end),
            },
          ],
          dimensions: Array.isArray(input.dimensions)
            ? (input.dimensions as string[]).map((d) => ({ name: d }))
            : undefined,
          metrics: (input.metrics as string[]).map((m) => ({ name: m })),
          limit: input.limit ? Number(input.limit) : 100,
        },
      });
      return JSON.stringify(res.data, null, 2);
    }

    case "ga4_run_realtime_report": {
      const res = await analyticsData.properties.runRealtimeReport({
        property: `properties/${input.property_id}`,
        requestBody: {
          dimensions: Array.isArray(input.dimensions)
            ? (input.dimensions as string[]).map((d) => ({ name: d }))
            : undefined,
          metrics: (input.metrics as string[]).map((m) => ({ name: m })),
        },
      });
      return JSON.stringify(res.data, null, 2);
    }

    case "ga4_get_metadata": {
      const res = await analyticsData.properties.getMetadata({
        name: `properties/${input.property_id}/metadata`,
      });
      return JSON.stringify(res.data, null, 2);
    }

    case "ga4_list_properties": {
      const filter = input.account_id ? `parent:accounts/${input.account_id}` : undefined;
      const res = await analyticsAdmin.properties.list({
        filter,
      });
      return JSON.stringify(res.data, null, 2);
    }

    case "ga4_get_property": {
      const res = await analyticsAdmin.properties.get({
        name: `properties/${input.property_id}`,
      });
      return JSON.stringify(res.data, null, 2);
    }

    case "ga4_list_audiences": {
      const res = await analyticsAdmin.properties.audiences.list({
        parent: `properties/${input.property_id}`,
      });
      return JSON.stringify(res.data, null, 2);
    }

    case "ga4_create_audience": {
      const res = await analyticsAdmin.properties.audiences.create({
        parent: `properties/${input.property_id}`,
        requestBody: {
          displayName: String(input.display_name),
          description: input.description ? String(input.description) : undefined,
          membershipDurationDays: input.membership_duration_days ? Number(input.membership_duration_days) : 30,
          filterClauses: [
            {
              clauseType: "INCLUDE",
              ...(input.filter_expression as Record<string, unknown>),
            },
          ],
        },
      });
      return JSON.stringify(res.data, null, 2);
    }

    case "ga4_list_conversion_events": {
      const res = await analyticsAdmin.properties.conversionEvents.list({
        parent: `properties/${input.property_id}`,
      });
      return JSON.stringify(res.data, null, 2);
    }

    default:
      throw new Error(`Unknown GA4 tool: "${toolUse.toolName}"`);
  }
}

/**
 * Quick health check — verifies that GA4 credentials are configured and API is reachable.
 */
export async function checkGa4Health(config: AppConfig): Promise<{ ok: boolean; error?: string }> {
  if (!config.ga4CredentialsPath) {
    return { ok: false, error: "GA4_CREDENTIALS_PATH not set" };
  }

  try {
    const authClient = await getServiceAccountAuth(config, GA4_SCOPES);
    if (!authClient) {
      return { ok: false, error: "Could not create auth client" };
    }

    const { google } = await import("googleapis");
    const analyticsAdmin = google.analyticsadmin({ version: "v1beta", auth: authClient as any });
    await analyticsAdmin.properties.list({ filter: undefined });
    return { ok: true };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}
