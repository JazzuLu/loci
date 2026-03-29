# Loci Adapter Architecture

## Adapter Classes

| Class | Role | Examples |
|-------|------|----------|
| `native_memory` | Tools with first-class memory semantics | Claude Code, OpenClaw |
| `context_memory` | Tools with durable context files | Codex, Cursor, Gemini CLI |
| `canonical_memory` | Loci's own long-term store | Loci |
| `memory_mcp` | User-installed MCP memory servers | mem0, AutoMem, etc. |

## Capability Interface

Each adapter declares:

| Capability | Type | Description |
|-----------|------|-------------|
| `adapter_id` | string | Unique identifier |
| `adapter_class` | enum | One of the four classes above |
| `display_name` | string | Human-readable name |
| `can_read` | boolean | Can discover and read memories |
| `can_write` | boolean | Can write memories to the source |
| `can_search` | boolean | Supports search queries |
| `can_sync` | boolean | Supports sync scanning |
| `can_auto_capture` | boolean | Has native auto-capture |
| `source_of_truth_role` | enum | Truth role declaration |
| `supported_scopes` | Scope[] | Which scopes this adapter handles |

## Adapter Matrix (MVP)

| Adapter | Class | Truth Role | Read | Write | Sync | Scopes |
|---------|-------|-----------|------|-------|------|--------|
| Claude Code | native_memory | native_project_truth | yes | no* | yes | session, project |
| OpenClaw | native_memory | workspace_truth | yes | no* | yes | session, project |
| Codex | context_memory | context_truth | yes | no | yes | project |
| Cursor | context_memory | context_truth | yes | no | yes | project |
| Gemini CLI | context_memory | context_truth | yes | no | yes | project |
| Loci | canonical_memory | canonical_truth | yes | yes | yes | cross_project, personal, team |
| Memory MCP | memory_mcp | delegated_truth | * | * | * | project, cross_project |

\* MVP does not auto-write to native tools. MCP capabilities are runtime-detected.

## MemoryAdapter Interface

```typescript
interface MemoryAdapter {
  readonly capability: AdapterCapability;
  read(): Promise<ReadResult>;
  write(record: IndexRecord): Promise<WriteResult>;
  sync(existingRecords: IndexRecord[]): Promise<SyncScanResult>;
}
```
