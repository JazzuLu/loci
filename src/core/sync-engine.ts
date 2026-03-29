import type { MemoryAdapter } from "../adapters/base.js";
import { IndexStore } from "./index-store.js";

export interface SyncResult {
  adapter_id: string;
  added: number;
  updated: number;
  removed: number;
  unchanged: number;
  errors: string[];
}

export interface SyncSummary {
  results: SyncResult[];
  total_added: number;
  total_updated: number;
  total_removed: number;
  total_errors: number;
}

export class SyncEngine {
  private readonly store: IndexStore;
  private readonly adapters: Map<string, MemoryAdapter>;

  constructor(store: IndexStore, adapters: MemoryAdapter[]) {
    this.store = store;
    this.adapters = new Map(adapters.map((a) => [a.capability.adapter_id, a]));
  }

  /**
   * Sync a single adapter by ID.
   * Fetches existing records for that adapter's source_system, calls adapter.sync(),
   * then applies added/updated/removed changes to the index store.
   */
  async syncAdapter(adapterId: string): Promise<SyncResult> {
    const adapter = this.adapters.get(adapterId);
    if (!adapter) {
      throw new Error(`Adapter not found: ${adapterId}`);
    }

    // Filter existing records by source_adapter_id or source_system matching this adapter
    const allRecords = await this.store.query({});
    const existingRecords = allRecords.filter(
      (r) => r.source_adapter_id === adapterId || r.source_system === adapterId
    );

    const scanResult = await adapter.sync(existingRecords);

    // Apply added records
    for (const record of scanResult.added) {
      await this.store.create(record);
    }

    // Apply updated records
    for (const record of scanResult.updated) {
      await this.store.update(record);
    }

    // Mark removed records as stale (do not delete)
    for (const recordId of scanResult.removed) {
      const existing = await this.store.get(recordId);
      if (existing) {
        await this.store.update({ ...existing, status: "stale" });
      }
    }

    return {
      adapter_id: adapterId,
      added: scanResult.added.length,
      updated: scanResult.updated.length,
      removed: scanResult.removed.length,
      unchanged: scanResult.unchanged,
      errors: scanResult.errors,
    };
  }

  /**
   * Sync all registered adapters and return an aggregated summary.
   */
  async syncAll(): Promise<SyncSummary> {
    const results: SyncResult[] = [];

    for (const adapterId of this.adapters.keys()) {
      const result = await this.syncAdapter(adapterId);
      results.push(result);
    }

    return {
      results,
      total_added: results.reduce((sum, r) => sum + r.added, 0),
      total_updated: results.reduce((sum, r) => sum + r.updated, 0),
      total_removed: results.reduce((sum, r) => sum + r.removed, 0),
      total_errors: results.reduce((sum, r) => sum + r.errors.length, 0),
    };
  }

}
