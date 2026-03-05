---
name: loci
description: >-
  Long-term memory system using the method of loci (memory palace). Stores and
  retrieves personal knowledge as nested skills: preferences, project context,
  decisions, error fixes, learned patterns. Use when recalling past decisions,
  project history, personal preferences, debugging solutions, or any previously
  stored knowledge. Triggers on: remember, recall, "last time", "we decided",
  "we learned", lookup, "do you remember", "what was", "how did we", note,
  learned, history, preferences, knowledge.
---

# Loci — Memory Palace

This skill is the **engine**. User memories live in `~/.loci/` (the palace).

## Quick Start

1. Read `~/.loci/MAP.yml` — scan keywords to locate a memory
2. If MAP.yml has no match → `grep -rl "keyword" ~/.loci/`
3. Read the matched leaf SKILL.md for full content

If `~/.loci/` does not exist, the first `/loci remember` will create it.

## Palace Structure

```
~/.loci/
├── PALACE.md       ← Palace root navigation (categories table)
├── MAP.yml         ← Global keyword index (fast lookup)
├── inbox/          ← Unsorted memories
├── attic/          ← Archived cold memories
└── {category}/     ← User-created categories
    └── {topic}/
        └── SKILL.md  ← A single memory
```

## Commands

| Command | Purpose |
|---------|---------|
| `/loci remember <content>` | Store a new memory |
| `/loci update <path>` | Update existing memory |
| `/loci search <keywords>` | Find memories |
| `/loci list` | List all memories |
| `/loci tidy` | Organize inbox into categories |
| `/loci archive <path>` | Move to attic |
| `/loci new-category <name>` | Create a new category |
| `/loci status` | Palace health check |
| `/loci rebuild-map` | Regenerate MAP.yml from files |
| `/loci import <source>` | Migrate from other systems |

Full command specification in `references/remember-command.md`.
