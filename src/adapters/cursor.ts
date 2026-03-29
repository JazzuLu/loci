import { readdir, readFile } from "node:fs/promises";
import { join, basename, extname } from "node:path";
import type { MemoryAdapter, ReadResult, WriteResult, SyncScanResult } from "./base.js";
import type { AdapterCapability, IndexRecord } from "../core/schema.js";
import { contentHash } from "../lib/hash.js";

const ADAPTER_ID = "cursor";
const SOURCE_SYSTEM = "cursor";

/**
 * Parse YAML-style frontmatter from .mdc file content.
 * Returns { description, globs } if present.
 */
function parseFrontmatter(content: string): { description?: string; globs?: string } {
  if (!content.startsWith("---")) return {};

  const end = content.indexOf("\n---", 3);
  if (end === -1) return {};

  const block = content.slice(3, end).trim();
  const result: { description?: string; globs?: string } = {};

  for (const line of block.split("\n")) {
    const colonIdx = line.indexOf(":");
    if (colonIdx === -1) continue;
    const key = line.slice(0, colonIdx).trim();
    const value = line.slice(colonIdx + 1).trim();
    if (key === "description") result.description = value;
    if (key === "globs") result.globs = value;
  }

  return result;
}

/**
 * Derive a human-readable title from a filename (without extension).
 * e.g. "my-rule" -> "my-rule", "typescript_rules" -> "typescript_rules"
 */
function titleFromFilename(filename: string): string {
  const base = basename(filename, extname(filename));
  return base;
}

/**
 * CursorAdapter: context-memory adapter for Cursor AI editor rule files.
 *
 * Reads .cursor/rules/*.mdc and *.md files as IndexRecords.
 * Write is not supported in MVP.
 */
export class CursorAdapter implements MemoryAdapter {
  readonly capability: AdapterCapability = {
    adapter_id: ADAPTER_ID,
    adapter_class: "context_memory",
    display_name: "Cursor",
    can_read: true,
    can_write: false,
    can_search: false,
    can_sync: true,
    can_auto_capture: false,
    source_of_truth_role: "context_truth",
    supported_scopes: ["project"],
  };

  private readonly rulesDir: string;

  constructor(projectDir: string) {
    this.rulesDir = join(projectDir, ".cursor", "rules");
  }

  async read(): Promise<ReadResult> {
    const records: IndexRecord[] = [];
    const errors: string[] = [];

    let entries: string[];
    try {
      const dirEntries = await readdir(this.rulesDir);
      entries = dirEntries.filter((f) => f.endsWith(".mdc") || f.endsWith(".md"));
    } catch (err: unknown) {
      // Directory doesn't exist — return empty, not an error
      return { records: [], partial: false, errors: [] };
    }

    for (const filename of entries) {
      const filePath = join(this.rulesDir, filename);
      try {
        const raw = await readFile(filePath, "utf-8");
        const ext = extname(filename);
        const isMdc = ext === ".mdc";

        let description: string | undefined;
        let globs: string | undefined;

        if (isMdc) {
          const fm = parseFrontmatter(raw);
          description = fm.description;
          globs = fm.globs;
        }

        const title = titleFromFilename(filename);
        const summary = description ?? `Cursor rule: ${title}`;
        const keywords: string[] = [title, "cursor", "rules"];
        if (globs) keywords.push(globs);

        const hash = contentHash(raw);
        const now = new Date().toISOString();

        const record: IndexRecord = {
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

        records.push(record);
      } catch (err: unknown) {
        errors.push(`Failed to read ${filePath}: ${String(err)}`);
      }
    }

    return { records, partial: errors.length > 0, errors };
  }

  async write(_record: IndexRecord): Promise<WriteResult> {
    return { success: false, error: "Cursor context write not supported in MVP" };
  }

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
}
