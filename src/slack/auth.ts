/**
 * Slack user → FIA profile resolution.
 *
 * Maps Slack user IDs to FIA profiles via the `profiles.slack_user_id` column.
 * Caches lookups for 5 minutes to avoid hammering Supabase on every command.
 */

import { SupabaseClient } from "@supabase/supabase-js";
import { type UserRole, type Permission, hasPermission } from "../api/permissions";

export interface SlackProfile {
  id: string;
  name: string;
  role: UserRole;
}

interface CacheEntry {
  profile: SlackProfile | null;
  expiresAt: number;
}

const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes
const cache = new Map<string, CacheEntry>();

/**
 * Resolve a Slack user ID to a FIA profile.
 * Returns null if the Slack user is not mapped to any profile.
 */
export async function resolveSlackUser(
  supabase: SupabaseClient,
  slackUserId: string,
): Promise<SlackProfile | null> {
  const now = Date.now();
  const cached = cache.get(slackUserId);
  if (cached && cached.expiresAt > now) {
    return cached.profile;
  }

  const { data } = await supabase
    .from("profiles")
    .select("id, name, role")
    .eq("slack_user_id", slackUserId)
    .single();

  const profile: SlackProfile | null = data ? { id: data.id, name: data.name, role: data.role as UserRole } : null;

  cache.set(slackUserId, { profile, expiresAt: now + CACHE_TTL_MS });
  return profile;
}

/** Clear cache for a specific user (e.g. after role change). */
export function clearSlackUserCache(slackUserId?: string): void {
  if (slackUserId) {
    cache.delete(slackUserId);
  } else {
    cache.clear();
  }
}

export interface PermissionResult {
  allowed: boolean;
  profile: SlackProfile | null;
  reason?: string;
}

/**
 * Check if a Slack user has a specific permission.
 * Returns { allowed: false } with a reason if denied.
 */
export async function checkSlackPermission(
  supabase: SupabaseClient,
  slackUserId: string,
  permission: Permission,
): Promise<PermissionResult> {
  const profile = await resolveSlackUser(supabase, slackUserId);

  if (!profile) {
    return {
      allowed: false,
      profile: null,
      reason: "Ditt Slack-konto är inte kopplat till FIA. Be en admin lägga till ditt slack_user_id i profilen.",
    };
  }

  if (!hasPermission(profile.role, permission)) {
    return {
      allowed: false,
      profile,
      reason: `Rollen '${profile.role}' har inte behörighet för denna åtgärd.`,
    };
  }

  return { allowed: true, profile };
}
