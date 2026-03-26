import { SupabaseClient } from "@supabase/supabase-js";

export interface IntelligenceProfileRow {
  id: string;
  topic_slug: string;
  topic_name: string;
  category: "company" | "competitor" | "trend" | "technology" | "industry";
  summary: string;
  key_facts: Record<string, unknown>;
  last_updated: string;
  research_count: number;
  sources: string[];
  related_profiles: string[];
  created_at: string;
}

export async function getProfile(supabase: SupabaseClient, topicSlug: string): Promise<IntelligenceProfileRow | null> {
  const { data, error } = await supabase.from("intelligence_profiles").select("*").eq("topic_slug", topicSlug).single();

  if (error && error.code !== "PGRST116") {
    throw new Error(`Failed to get profile: ${error.message}`);
  }
  return data as IntelligenceProfileRow | null;
}

export async function upsertProfile(
  supabase: SupabaseClient,
  profile: Partial<IntelligenceProfileRow> & { topic_slug: string },
): Promise<string> {
  const { data, error } = await supabase
    .from("intelligence_profiles")
    .upsert(
      {
        ...profile,
        last_updated: new Date().toISOString(),
      },
      { onConflict: "topic_slug" },
    )
    .select("id")
    .single();

  if (error) throw new Error(`Failed to upsert profile: ${error.message}`);
  return data.id;
}

export async function searchProfiles(
  supabase: SupabaseClient,
  query: string,
  limit: number = 20,
): Promise<IntelligenceProfileRow[]> {
  const { data, error } = await supabase
    .from("intelligence_profiles")
    .select("*")
    .textSearch("fts", query, { config: "swedish" })
    .order("last_updated", { ascending: false })
    .limit(limit);

  if (error) throw new Error(`Failed to search profiles: ${error.message}`);
  return (data ?? []) as IntelligenceProfileRow[];
}

export async function listProfilesByCategory(
  supabase: SupabaseClient,
  category: string,
  limit: number = 50,
): Promise<IntelligenceProfileRow[]> {
  const { data, error } = await supabase
    .from("intelligence_profiles")
    .select("*")
    .eq("category", category)
    .order("last_updated", { ascending: false })
    .limit(limit);

  if (error) throw new Error(`Failed to list profiles: ${error.message}`);
  return (data ?? []) as IntelligenceProfileRow[];
}
