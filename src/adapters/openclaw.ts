import { readFile, readdir, stat } from "node:fs/promises";
import { join, basename } from "node:path";
import type { MemoryAdapter, ReadResult, WriteResult, SyncScanResult } from "./base.js";
import type { AdapterCapability, IndexRecord } from "../core/schema.js";
import { contentHash } from "../lib/hash.js";

const ADAPTER_ID = "openclaw";
const SOURCE_SYSTEM = "openclaw";
const NOW = new Date().toISOString();

/**
 * OpenClawAdapter: workspace-memory adapter for OpenClaw.
 *
 * Reads MEMORY.md (workspace index) and memory/*.md (dated daily entries)
 * from the configured workspace directory.
 *
 * MVP write is disabled — OpenClaw manages its own memory files.
 */
export class OpenClawAdapter implements MemoryAdapter {
  readonly capability: AdapterCapability = {
    adapter_id: ADAPTER_ID,
    adapter_class: "native_memory",
    display_name: "OpenClaw",
    can_read: true,
    can_write: true,
    can_sync: true,
    can_search: false,
    can_auto_capture: true,
    source_of_truth_role: "workspace_truth",
    supported_scopes: ["session", "project"],
  };

  private readonly workspaceDir: string;

  constructor(workspaceDir: string) {
    this.workspaceDir = workspaceDir;
  }

  // ---------------------------------------------------------------------------
  // read()
  // ---------------------------------------------------------------------------

  async read(): Promise<ReadResult> {
    const records: IndexRecord[] = [];
    const errors: string[] = [];

    // 1. MEMORY.md
    const memoryMdPath = join(this.workspaceDir, "MEMORY.md");
    try {
      const s = await stat(memoryMdPath);
      if (s.isFile()) {
        const content = await readFile(memoryMdPath, "utf-8");
        records.push(this._buildRecord(memoryMdPath, content, "reference", "OpenClaw workspace memory index"));
      }
    } catch {
      // File doesn't exist — skip silently
    }

    // 2. memory/*.md
    const memoryDir = join(this.workspaceDir, "memory");
    try {
      const entries = await readdir(memoryDir);
      for (const entry of entries.sort()) {
        if (!entry.endsWith(".md")) continue;
        const filePath = join(memoryDir, entry);
        try {
          const s = await stat(filePath);
          if (!s.isFile()) continue;
          const content = await readFile(filePath, "utf-8");
          const title = _extractTitle(content) ?? basename(entry, ".md");
          records.push(this._buildRecord(filePath, content, "fact", title));
        } catch (err: unknown) {
          errors.push(`Failed to read ${filePath}: ${String(err)}`);
        }
      }
    } catch {
      // memory/ dir doesn't exist — skip silently
    }

    return { records, partial: errors.length > 0, errors };
  }

  // ---------------------------------------------------------------------------
  // write()
  // ---------------------------------------------------------------------------

  async write(_record: IndexRecord): Promise<WriteResult> {
    return {
      success: false,
      error: "OpenClaw native write not yet implemented in MVP",
    };
  }

  // ---------------------------------------------------------------------------
  // sync()
  // ---------------------------------------------------------------------------

  async sync(existingRecords: IndexRecord[]): Promise<SyncScanResult> {
    const added: IndexRecord[] = [];
    const updated: IndexRecord[] = [];
    const removed: string[] = [];
    const errors: string[] = [];
    let unchanged = 0;

    // Build lookup by source_object_id for this adapter's records
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

    // Records that were indexed but are no longer found on disk
    for (const [path, rec] of existingByPath) {
      if (!currentPaths.has(path)) {
        removed.push(rec.record_id);
      }
    }

    return { added, updated, removed, unchanged, errors };
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  private _buildRecord(
    filePath: string,
    content: string,
    kind: IndexRecord["kind"],
    title: string,
  ): IndexRecord {
    const hash = contentHash(content);
    const summary = _extractSummary(content);
    const keywords = _extractKeywords(content, title);

    return {
      record_id: `${ADAPTER_ID}:${filePath}`,
      source_system: SOURCE_SYSTEM,
      source_object_id: filePath,
      source_path: filePath,
      scope: "project",
      kind,
      truth_mode: "workspace_truth",
      status: "active",
      title,
      summary,
      keywords,
      created_at: NOW,
      updated_at: NOW,
      capture_mode: "auto_native",
      preferred_write_target: ADAPTER_ID,
      sync_strategy: "scan_on_demand",
      version_hash: hash,
      source_adapter_id: ADAPTER_ID,
    };
  }
}

// ---------------------------------------------------------------------------
// File parsing helpers
// ---------------------------------------------------------------------------

/** Extract the first heading from markdown content */
function _extractTitle(content: string): string | undefined {
  for (const line of content.split("\n")) {
    const m = line.match(/^#{1,6}\s+(.+)$/);
    if (m?.[1]) return m[1].trim();
  }
  return undefined;
}

/** Extract a short summary from content (first non-heading, non-empty line) */
function _extractSummary(content: string): string {
  const lines = content.split("\n");
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith("#")) {
      return trimmed.slice(0, 200);
    }
  }
  // Fall back to a truncation of the whole content
  return content.replace(/\s+/g, " ").trim().slice(0, 200) || "OpenClaw memory entry";
}

/** Derive keywords from title words plus simple noun extraction from content */
function _extractKeywords(content: string, title: string): string[] {
  const words = new Set<string>();

  // Words from title
  for (const w of title.toLowerCase().split(/\W+/)) {
    if (w.length > 3) words.add(w);
  }

  // Words from ## headings
  for (const line of content.split("\n")) {
    if (line.startsWith("##")) {
      for (const w of line.replace(/^#+/, "").toLowerCase().split(/\W+/)) {
        if (w.length > 3) words.add(w);
      }
    }
  }

  const result = Array.from(words).slice(0, 10);
  return result.length > 0 ? result : ["memory"];
}
