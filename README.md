# Loci

A cross-tool memory plane for coding agents.

Loci routes writes to the right native memory system, maintains a canonical cross-tool index, and provides stable recall across fragmented agent ecosystems.

## Problem

The coding-agent ecosystem has multiple overlapping memory systems: Claude Code, OpenClaw, Cursor, Gemini CLI, Codex, and various MCP memory servers. The problem isn't lack of memory — it's fragmentation. Multiple sources claim truth, writes happen in different places with different semantics, and recall paths are uncertain.

Loci coordinates this landscape. It doesn't replace every native system.

## How It Works

```
remember "Always use TDD for this project"
    |
    v
classify (scope: project, kind: preference)
    |
    v
route (project scope -> native tool adapter)
    |
    v
write via adapter + create index record
    |
    v
recall "tdd" -> find by keyword, return with source path
```

## Architecture

### Four Adapter Classes

| Class | Role | Examples |
|-------|------|----------|
| Native Memory | Tools with first-class memory semantics | Claude Code, OpenClaw |
| Context Memory | Tools with durable context files | Codex, Cursor, Gemini CLI |
| Canonical Memory | Loci's own long-term store | Loci |
| Memory MCP | User-installed MCP memory servers | mem0, AutoMem, etc. |

### Unified Index

Every memory — regardless of where it lives — gets an index record in Loci with identity, classification, provenance, routing metadata, and relations. Phase 1 is symbolic and provenance-first; embedding retrieval is planned for Phase 2.

### Write Routing

Loci follows an 8-step decision flow: detect intent, check explicit target, classify content, validate target, choose action, execute via adapter, index, and run post-write checks. Default routing sends project-local knowledge to native tools and cross-project/personal knowledge to Loci's canonical store.

### Sync Model

Manual-first by design. Sync detects additions, modifications, and removals without blindly copying content or overwriting native memory.

## CLI

```bash
loci remember <content>     # Store a memory (routed to appropriate target)
loci recall <query>         # Retrieve memories by keyword/title search
loci sync                   # Sync external memory sources into the index
loci status                 # Show adapter status and index diagnostics
```

## Supported Sources

| Source | Adapter Class | Read | Sync | Write |
|--------|--------------|------|------|-------|
| Claude Code | Native Memory | .claude/projects/*/memory/*.md, CLAUDE.md | Hash-based | Planned |
| OpenClaw | Native Memory | MEMORY.md, memory/*.md | Hash-based | Planned |
| Codex | Context Memory | Layered AGENTS.md | Hash-based | - |
| Cursor | Context Memory | .cursor/rules/*.mdc | Hash-based | - |
| Gemini CLI | Context Memory | Layered GEMINI.md | Hash-based | - |
| Loci | Canonical | ~/.loci/ palace structure | Built-in | Yes |
| Memory MCP | MCP | Capability-detected | Runtime | Runtime |

## Palace Structure

Loci's canonical store uses the method of loci (memory palace) metaphor:

```
~/.loci/
├── PALACE.md        Palace root navigation
├── MAP.yml          Global keyword index
├── index.json       Cross-tool unified index
├── inbox/           Unsorted memories
├── attic/           Archived cold memories
└── {category}/      User-created categories
    └── {topic}/
        └── SKILL.md   A single memory (YAML frontmatter + content)
```

## Development

```bash
# Install dependencies
npm install

# Run tests (226 tests)
npm test

# Type check
npm run typecheck

# Run CLI in development
npm run dev -- status
```

### Project Structure

```
src/
├── adapters/       7 adapters across 4 classes
├── cli/            CLI entrypoint
├── commands/       remember, recall, sync, status
├── core/           schema, index-store, routing, retrieval, sync-engine, conflicts, relations
└── lib/            classifier, hash, files, paths, log, source-discovery
```

## Design Principles

1. Native memory first when the memory belongs to that tool's scope
2. Loci is the canonical long-term cross-tool layer, not the default sink
3. Every memory write produces a Loci index record
4. Every source declares its source-of-truth role
5. Provenance and version matter more than semantic similarity in Phase 1
6. Sync is manual-first, automation-later
7. Embeddings are planned but don't substitute for correct indexing

## Roadmap

- **Phase 1 (current)**: Symbolic retrieval, manual sync, 7 adapters, canonical store
- **Phase 1.5**: Scan-on-demand with incremental detection
- **Phase 2**: Hybrid symbolic + embedding retrieval, hook-driven sync
- **Phase 3**: Embedding-assisted routing, stale detection, cross-tool terminology mapping

## License

MIT
