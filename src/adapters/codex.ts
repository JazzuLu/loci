import { readFile } from "node:fs/promises";
import { join, dirname } from "node:path";
import { existsSync } from "node:fs";
import type { MemoryAdapter, ReadResult, WriteResult, SyncScanResult } from "./base.js";
import type { AdapterCapability, IndexRecord } from "../core/schema.js";
import { contentHash } from "../lib/hash.js";

const ADAPTER_ID = "codex";
const SOURCE_SYSTEM = "codex";
const AGENTS_FILE = "AGENTS.md";

/**
 * CodexAdapter: context memory adapter that reads AGENTS.md files.
 *
 * Scans projectDir and parent directories (layered) for AGENTS.md files,
 * parsing each into an IndexRecord.
 *
 * Capability:
 *   adapter_class: "context_memory"
 *   source_of_truth_role: "context_truth"
 *   can_read: true, can_write: false, can_sync: true
 *   can_search: false, can_auto_capture: false
 */
export class CodexAdapter implements MemoryAdapter {
  readonly capability: AdapterCapability = {
    adapter_id: ADAPTER_ID,
    adapter_class: "context_memory",
    display_name: "Codex",
    can_read: true,
    can_write: false,
    can_search: false,
    can_sync: true,
    can_auto_capture: false,
    source_of_truth_role: "context_truth",
    supported_scopes: ["project"],
  };

  private readonly projectDir: string;

  constructor(projectDir: string) {
    this.projectDir = projectDir;
  }

  /** Discover AGENTS.md files at projectDir root and parent dirs, return as IndexRecords */
  async read(): Promise<ReadResult> {
    const records: IndexRecord[] = [];
    const errors: string[] = [];

    const paths = _collectAgentsPaths(this.projectDir);

    for (const filePath of paths) {
      try {
        const content = await readFile(filePath, "utf-8");
        const hash = contentHash(content);
        const now = new Date().toISOString();

        const record: IndexRecord = {
          record_id: `${ADAPTER_ID}:${filePath}`,
          source_system: SOURCE_SYSTEM,
          source_object_id: filePath,
          source_path: filePath,
          scope: "project",
          kind: "reference",
          truth_mode: "context_truth",
          status: "active",
          title: `AGENTS.md (${filePath})`,
          summary: content.slice(0, 500).trim() || "(empty)",
          keywords: ["agents", "context", "codex"],
          created_at: now,
          updated_at: now,
          capture_mode: "sync_scan",
          preferred_write_target: ADAPTER_ID,
          sync_strategy: "scan_on_demand",
          version_hash: hash,
          source_adapter_id: ADAPTER_ID,
        };
        records.push(record);
      } catch (err: unknown) {
        errors.push(`Failed to read ${filePath}: ${String(err)}`);
      }
    }

    return { records, partial: errors.length > 0, errors };
  }

  /** Write is not supported in MVP */
  async write(_record: IndexRecord): Promise<WriteResult> {
    return { success: false, error: "Codex context write not supported in MVP" };
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
}

/**
 * Walk from startDir up to filesystem root, collecting paths to AGENTS.md files
 * that actually exist. Returns them ordered from root (outermost) to startDir (innermost).
 */
function _collectAgentsPaths(startDir: string): string[] {
  const dirs: string[] = [];
  let current = startDir;

  while (true) {
    dirs.push(current);
    const parent = dirname(current);
    if (parent === current) break; // reached filesystem root
    current = parent;
  }

  // Reverse so we go outermost -> innermost (layered context order)
  dirs.reverse();

  const result: string[] = [];
  for (const dir of dirs) {
    const candidate = join(dir, AGENTS_FILE);
    if (existsSync(candidate)) {
      result.push(candidate);
    }
  }

  return result;
}
