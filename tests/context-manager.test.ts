import fs from "fs";
import path from "path";
import os from "os";
import { loadFile, clearCache, CACHE_TTL_MS } from "../src/context/context-manager";

describe("ContextManager", () => {
  let tmpDir: string;
  let testFile: string;

  beforeEach(() => {
    clearCache();
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "fia-ctx-test-"));
    testFile = path.join(tmpDir, "test.md");
    fs.writeFileSync(testFile, "original content", "utf-8");
  });

  it("caches file content on first read", () => {
    const first = loadFile(testFile);
    expect(first).toBe("original content");

    // Modify file on disk
    fs.writeFileSync(testFile, "updated content", "utf-8");

    // Should still return cached version
    const second = loadFile(testFile);
    expect(second).toBe("original content");
  });

  it("re-reads file after TTL expires (B3)", () => {
    const first = loadFile(testFile);
    expect(first).toBe("original content");

    // Modify file on disk
    fs.writeFileSync(testFile, "updated content", "utf-8");

    // Fast-forward time past TTL
    const realNow = Date.now;
    Date.now = () => realNow() + CACHE_TTL_MS + 1000;

    const second = loadFile(testFile);
    expect(second).toBe("updated content");

    Date.now = realNow;
  });

  it("returns empty string for non-existent files", () => {
    const result = loadFile(path.join(tmpDir, "nonexistent.md"));
    expect(result).toBe("");
  });

  it("clearCache forces re-read", () => {
    loadFile(testFile);
    fs.writeFileSync(testFile, "new content", "utf-8");

    clearCache();

    const result = loadFile(testFile);
    expect(result).toBe("new content");
  });
});
