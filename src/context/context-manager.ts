import fs from "fs";
import path from "path";

export const CACHE_TTL_MS = 300_000; // 5 minutes

const fileCache = new Map<string, { content: string; cachedAt: number }>();

export function loadFile(filePath: string): string {
  const cached = fileCache.get(filePath);
  if (cached !== undefined && Date.now() - cached.cachedAt < CACHE_TTL_MS) {
    return cached.content;
  }

  if (!fs.existsSync(filePath)) {
    return "";
  }

  const content = fs.readFileSync(filePath, "utf-8");
  fileCache.set(filePath, { content, cachedAt: Date.now() });
  return content;
}

export function loadFiles(basePath: string, relativePaths: string[]): string {
  return relativePaths
    .map((rel) => loadFile(path.join(basePath, rel)))
    .filter(Boolean)
    .join("\n\n---\n\n");
}

export function loadBrandContext(knowledgeDir: string): string {
  const brandDir = path.join(knowledgeDir, "brand");
  const files = ["platform.md", "tonality.md", "visual.md", "messages.md"];

  return loadFiles(brandDir, files);
}

export function clearCache(): void {
  fileCache.clear();
}
