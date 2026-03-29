import type { AdapterCapability, IndexRecord } from "../core/schema.js";

/** Result of reading memories from a source */
export interface ReadResult {
  records: IndexRecord[];
  partial: boolean;
  errors: string[];
}

/** Result of writing a memory to a source */
export interface WriteResult {
  success: boolean;
  source_object_id?: string;
  source_path?: string;
  error?: string;
}

/** Result of a sync scan */
export interface SyncScanResult {
  added: IndexRecord[];
  updated: IndexRecord[];
  removed: string[]; // record_ids no longer found at source
  unchanged: number;
  errors: string[];
}

/**
 * Base adapter interface.
 *
 * Each adapter must declare its capabilities and implement
 * the methods matching those capabilities.
 */
export interface MemoryAdapter {
  /** Static capability declaration */
  readonly capability: AdapterCapability;

  /** Discover and read all memories from this source */
  read(): Promise<ReadResult>;

  /** Write a memory to this source (if can_write) */
  write(record: IndexRecord): Promise<WriteResult>;

  /** Scan source for changes since last sync (if can_sync) */
  sync(existingRecords: IndexRecord[]): Promise<SyncScanResult>;
}
