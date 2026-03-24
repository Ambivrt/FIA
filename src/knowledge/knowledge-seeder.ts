import fs from "fs";
import path from "path";
import { SupabaseClient } from "@supabase/supabase-js";
import { AppConfig } from "../utils/config";
import {
  loadAgentManifest,
  parseSkillReference,
  resolveSkillPath,
  parseSkillFrontmatter,
  resolveAgentFiles,
} from "../agents/agent-loader";
import { getAllAgentSlugs } from "../agents/agent-factory";
import type { KnowledgeInsert, KnowledgeCategory } from "./types";

export interface SeedDiff {
  slug: string;
  added: number;
  updated: number;
  unchanged: number;
  items: Array<{ slug: string; category: string; diff: string }>;
}

/**
 * Seed knowledge for a single agent from YAML/disk into agent_knowledge table.
 */
export async function seedAgentKnowledge(
  supabase: SupabaseClient,
  config: AppConfig,
  agentSlug: string,
  dryRun = false,
): Promise<SeedDiff> {
  const manifest = loadAgentManifest(config.knowledgeDir, agentSlug);
  const inserts: KnowledgeInsert[] = [];
  let sortOrder = 0;

  // --- Skills ---
  if (manifest.skills && manifest.skills.length > 0) {
    for (const ref of manifest.skills) {
      const { scope, name } = parseSkillReference(ref);
      const skillPath = resolveSkillPath(config.knowledgeDir, agentSlug, ref);
      if (!fs.existsSync(skillPath)) continue;

      const raw = fs.readFileSync(skillPath, "utf-8");
      const { metadata, body } = parseSkillFrontmatter(raw);

      inserts.push({
        agent_slug: scope === "shared" ? "_shared" : agentSlug,
        category: "skill",
        slug: ref,
        title: metadata.name,
        description: metadata.description,
        body,
        metadata: { version: metadata.version, source: scope },
        sort_order: sortOrder++,
        source: "yaml",
      });
    }
  } else {
    // Legacy: single SKILL.md
    const legacyPath = path.join(config.knowledgeDir, "agents", agentSlug, "SKILL.md");
    if (fs.existsSync(legacyPath)) {
      const raw = fs.readFileSync(legacyPath, "utf-8");
      const { metadata, body } = parseSkillFrontmatter(raw);
      inserts.push({
        agent_slug: agentSlug,
        category: "skill",
        slug: `agent:${agentSlug}-skill`,
        title: metadata.name,
        description: metadata.description,
        body,
        sort_order: sortOrder++,
        source: "yaml",
      });
    }
  }

  // --- System Context ---
  const systemContextFiles = (manifest.system_context ?? []).filter((f) => f !== "SKILL.md");
  for (const file of systemContextFiles) {
    const fullPath = path.join(config.knowledgeDir, "agents", agentSlug, file);
    if (!fs.existsSync(fullPath)) continue;
    const content = fs.readFileSync(fullPath, "utf-8");
    inserts.push({
      agent_slug: agentSlug,
      category: "system_context",
      slug: file,
      title: path.basename(file, path.extname(file)),
      body: content,
      sort_order: sortOrder++,
      source: "yaml",
    });
  }

  // --- Task Context ---
  for (const [taskType, files] of Object.entries(manifest.task_context ?? {})) {
    for (const file of files) {
      const fullPath = path.join(config.knowledgeDir, "agents", agentSlug, file);
      if (!fs.existsSync(fullPath)) continue;
      const content = fs.readFileSync(fullPath, "utf-8");
      inserts.push({
        agent_slug: agentSlug,
        category: "task_context",
        task_type: taskType,
        slug: file,
        title: path.basename(file, path.extname(file)),
        body: content,
        sort_order: sortOrder++,
        source: "yaml",
      });
    }
  }

  // --- Memory files ---
  const memoryDir = path.join(config.knowledgeDir, "agents", agentSlug, "memory");
  if (fs.existsSync(memoryDir)) {
    const memoryFiles = fs.readdirSync(memoryDir).filter((f) => f.endsWith(".md") || f.endsWith(".json"));
    for (const file of memoryFiles) {
      const content = fs.readFileSync(path.join(memoryDir, file), "utf-8");
      inserts.push({
        agent_slug: agentSlug,
        category: "memory",
        slug: `memory/${file}`,
        title: path.basename(file, path.extname(file)),
        body: content,
        sort_order: sortOrder++,
        source: "yaml",
      });
    }
  }

  if (dryRun) {
    // Compare with existing
    const { data: existing } = await supabase
      .from("agent_knowledge")
      .select("slug, category, task_type, body, version")
      .eq("agent_slug", agentSlug);

    const existingMap = new Map((existing ?? []).map((r: any) => [`${r.category}:${r.task_type ?? ""}:${r.slug}`, r]));

    let added = 0;
    let updated = 0;
    let unchanged = 0;
    const items: Array<{ slug: string; category: string; diff: string }> = [];

    for (const ins of inserts) {
      const key = `${ins.category}:${ins.task_type ?? ""}:${ins.slug}`;
      const ex = existingMap.get(key);
      if (!ex) {
        added++;
        items.push({ slug: ins.slug, category: ins.category, diff: "Ny" });
      } else if (ex.body !== ins.body) {
        updated++;
        items.push({ slug: ins.slug, category: ins.category, diff: "Ändrad" });
      } else {
        unchanged++;
      }
    }

    return { slug: agentSlug, added, updated, unchanged, items };
  }

  // Perform upsert
  if (inserts.length > 0) {
    const { error } = await supabase.from("agent_knowledge").upsert(
      inserts.map((ins) => ({
        ...ins,
        task_type: ins.task_type ?? null,
      })),
      { onConflict: "agent_slug,category,task_type,slug", ignoreDuplicates: false },
    );
    if (error) throw error;
  }

  return { slug: agentSlug, added: inserts.length, updated: 0, unchanged: 0, items: [] };
}

/**
 * Seed knowledge for all agents.
 */
export async function seedAllKnowledge(
  supabase: SupabaseClient,
  config: AppConfig,
  dryRun = false,
): Promise<SeedDiff[]> {
  const slugs = getAllAgentSlugs();
  const results: SeedDiff[] = [];

  for (const slug of slugs) {
    try {
      const diff = await seedAgentKnowledge(supabase, config, slug, dryRun);
      results.push(diff);
    } catch (err) {
      // Non-fatal per agent
      results.push({
        slug,
        added: 0,
        updated: 0,
        unchanged: 0,
        items: [{ slug, category: "error", diff: (err as Error).message }],
      });
    }
  }

  return results;
}
