import { readFile, readdir, stat } from "node:fs/promises";
import { join, resolve, sep } from "node:path";
import type { MemoryAdapter, ReadResult, WriteResult, SyncScanResult } from "./base.js";
import type { AdapterCapability, IndexRecord } from "../core/schema.js";
import { contentHash } from "../lib/hash.js";

const ADAPTER_ID = "gemini";
const SOURCE_SYSTEM = "gemini";

/**
 * GeminiAdapter: context-memory adapter for Gemini CLI GEMINI.md files.
 *
 * Capability:
 *   adapter_class: "context_memory"
 *   source_of_truth_role: "context_truth"
 *   can_read/can_sync: true
 *   can_write/can_search/can_auto_capture: false
 *
 * Discovers GEMINI.md files at:
 *   - projectDir and its parent directories up to filesystem root
 *   - userHome/.gemini/GEMINI.md (if userHome provided)
 */
export class GeminiAdapter implements MemoryAdapter {
  readonly capability: AdapterCapability = {
    adapter_id: ADAPTER_ID,
    adapter_class: "context_memory",
    display_name: "Gemini CLI",
    can_read: true,
    can_write: false,
    can_search: false,
    can_sync: true,
    can_auto_capture: false,
    source_of_truth_role: "context_truth",
    supported_scopes: ["project"],
  };

  private readonly projectDir: string;
  private readonly userHome: string | undefined;

  constructor(projectDir: string, userHome?: string) {
    this.projectDir = resolve(projectDir);
    this.userHome = userHome;
  }

  /** Discover all GEMINI.md files and return them as IndexRecords */
  async read(): Promise<ReadResult> {
    const records: IndexRecord[] = [];
    const errors: string[] = [];
    const seen = new Set<string>();

    const candidates = await this._discoverPaths();

    for (const filePath of candidates) {
      if (seen.has(filePath)) continue;
      seen.add(filePath);

      try {
        const stats = await stat(filePath).catch(() => null);
        if (!stats || !stats.isFile()) continue;

        const content = await readFile(filePath, "utf-8");
        const record = this._buildRecord(filePath, content);
        records.push(record);
      } catch (err: unknown) {
        errors.push(`Failed to read ${filePath}: ${String(err)}`);
      }
    }

    return { records, partial: errors.length > 0, errors };
  }

  /** Write is not supported in MVP */
  async write(_record: IndexRecord): Promise<WriteResult> {
    return {
      success: false,
      error: "Gemini context write not supported in MVP",
    };
  }

  /** Hash-based diff against existing index records */
  async sync(existingRecords: IndexRecord[]): Promise<SyncScanResult> {
    const added: IndexRecord[] = [];
    const updated: IndexRecord[] = [];
    const removed: string[] = [];
    const errors: string[] = [];
    let unchanged = 0;

    const existingByPath = new Map<string, IndexRecord>();
    for (const r of existingRecords) {
      if (r.source_system === SOURCE_SYSTEM) {
        existingByPath.set(r.source_object_id, r);
      }
    }

    const { records: currentRecords, errors: readErrors } = await this.read();
    errors.push(...readErrors);

    const currentPaths = new Set<string>();

    for (const current of currentRecords) {
      currentPaths.add(current.source_object_id);
      const existing = existingByPath.get(current.source_object_id);

      if (!existing) {
        added.push(current);
      } else if (existing.version_hash !== current.version_hash) {
        updated.push({ ...current, record_id: existing.record_id });
      } else {
        unchanged++;
      }
    }

    for (const [path, rec] of existingByPath) {
      if (!currentPaths.has(path)) {
        removed.push(rec.record_id);
      }
    }

    return { added, updated, removed, unchanged, errors };
  }

  /** Collect all candidate GEMINI.md paths to check */
  private async _discoverPaths(): Promise<string[]> {
    const paths: string[] = [];

    // Walk from projectDir up to filesystem root
    let current = this.projectDir;
    const root = resolve(sep);
    // eslint-disable-next-line no-constant-condition
    while (true) {
      paths.push(join(current, "GEMINI.md"));
      if (current === root) break;
      const parent = resolve(current, "..");
      if (parent === current) break;
      current = parent;
    }

    // Scan projectDir subdirectories (non-recursive beyond immediate children
    // is enough; walk all subdirs recursively for layered support)
    try {
      const subPaths = await this._walkDir(this.projectDir);
      for (const p of subPaths) {
        paths.push(p);
      }
    } catch {
      // ignore scan errors
    }

    // Global user GEMINI.md
    if (this.userHome) {
      paths.push(join(this.userHome, ".gemini", "GEMINI.md"));
    }

    // Deduplicate while preserving order
    const seen = new Set<string>();
    const unique: string[] = [];
    for (const p of paths) {
      const resolved = resolve(p);
      if (!seen.has(resolved)) {
        seen.add(resolved);
        unique.push(resolved);
      }
    }

    return unique;
  }

  /** Recursively find all GEMINI.md files under a directory */
  private async _walkDir(dir: string): Promise<string[]> {
    const results: string[] = [];
    let entries: import("node:fs").Dirent[];
    try {
      entries = await readdir(dir, { withFileTypes: true, encoding: "utf8" });
    } catch {
      return results;
    }

    for (const entry of entries) {
      const name = entry.name as string;
      const fullPath = join(dir, name);
      if (entry.isDirectory()) {
        // Skip hidden dirs
        if (name.startsWith(".")) continue;
        const sub = await this._walkDir(fullPath);
        results.push(...sub);
      } else if (entry.isFile() && name === "GEMINI.md") {
        results.push(fullPath);
      }
    }

    return results;
  }

  /** Build an IndexRecord from a GEMINI.md file path and content */
  private _buildRecord(filePath: string, content: string): IndexRecord {
    const now = new Date().toISOString();
    const hash = contentHash(content);
    const title = `Gemini Context: ${filePath}`;
    const summary = content.slice(0, 500).trim() || "Gemini CLI context memory file.";
    const keywords = this._extractKeywords(content, filePath);

    return {
      record_id: `${ADAPTER_ID}:${filePath}`,
      source_system: SOURCE_SYSTEM,
      source_object_id: filePath,
      source_path: filePath,
      source_adapter_id: ADAPTER_ID,
      scope: "project",
      kind: "reference",
      truth_mode: "context_truth",
      status: "active",
      title,
      summary,
      keywords,
      created_at: now,
      updated_at: now,
      capture_mode: "sync_scan",
      preferred_write_target: ADAPTER_ID,
      sync_strategy: "scan_on_demand",
      version_hash: hash,
    };
  }

  /** Extract basic keywords from content and path */
  private _extractKeywords(content: string, filePath: string): string[] {
    const keywords = new Set<string>(["gemini", "context"]);

    // Pull heading words from markdown
    const headings = content.match(/^#{1,3}\s+(.+)$/gm) ?? [];
    for (const heading of headings) {
      const words = heading
        .replace(/^#+\s+/, "")
        .toLowerCase()
        .split(/\s+/)
        .filter((w) => w.length > 2);
      for (const word of words) {
        keywords.add(word.replace(/[^a-z0-9_-]/g, ""));
      }
    }

    // Add path segment as keyword
    const parts = filePath.split(sep).filter(Boolean);
    if (parts.length >= 2) {
      const dir = parts[parts.length - 2];
      if (dir && dir !== ".gemini") {
        keywords.add(dir.toLowerCase());
      }
    }

    const result = [...keywords].filter((k) => k.length > 0);
    return result.length > 0 ? result : ["gemini", "context"];
  }
}
