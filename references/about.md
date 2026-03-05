# Loci — Skill-Chain Memory Palace

A cross-platform long-term memory system built on the [Agent Skills](https://skills.sh)
open standard. Named after the [method of loci](https://en.wikipedia.org/wiki/Method_of_loci),
an ancient mnemonic technique that uses spatial relationships to organize and recall information.

## Architecture: Engine + Palace

Loci separates **engine** (this skill, updatable) from **palace** (user data, permanent).

```
Engine (installed via npx skills add, safely updatable)
{skills-dir}/loci/              e.g. ~/.claude/skills/loci
├── SKILL.md                        ← AI entry point
└── references/
    ├── about.md                    ← This file
    ├── remember-command.md         ← /loci command specification
    ├── palace-template.md          ← Templates for lazy initialization
    └── examples/
        ├── preference.md           ← Example: personal preference memory
        └── project.md              ← Example: project context memory

Palace (created on first use at ~/.loci/, never touched by updates)
~/.loci/
├── PALACE.md                       ← Root navigation (categories table)
├── MAP.yml                         ← Global keyword index
├── inbox/                          ← Unsorted memories
│   ├── SKILL.md                    ← Routing table
│   └── {slug}/
│       └── SKILL.md               ← Individual unsorted memory
├── attic/                          ← Archived cold memories
│   ├── SKILL.md                    ← Routing table
│   └── {slug}/
│       └── SKILL.md               ← Archived memory
└── {category}/                     ← User-created categories
    ├── SKILL.md                    ← Category routing table
    └── {topic}/
        └── SKILL.md               ← Individual memory (leaf)
```

## Installation

```bash
npx skills add <username>/loci
```

Or manually symlink to your AI platform's skill directory:

```bash
# Claude Code
ln -sf /path/to/loci ~/.claude/skills/loci

# Codex
ln -sf /path/to/loci ~/.codex/skills/loci

# Cursor
ln -sf /path/to/loci ~/.cursor/skills/loci
```

The palace (`~/.loci/`) is created automatically on first `/loci remember`.

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
| `/loci import <source>` | Migrate from Claude/OpenClaw/Cursor/text |

## How Discovery Works

```
Path A: MAP.yml shortcut (2 reads)
  User question → ~/.loci/MAP.yml keyword match → leaf SKILL.md

Path B: Skill chain (3 reads)
  User question → engine SKILL.md → ~/.loci/PALACE.md → category → leaf

Path C: grep fallback (1 command)
  grep -rl "keyword" ~/.loci/
```

## Design Principles

1. **Engine/Palace separation** — skill updates never touch user memories
2. **Every memory uses Skill format** — YAML frontmatter + markdown, human-readable
3. **No API keys** — pure filesystem, no vector DB, no external services
4. **Inbox first** — don't force categorization, let patterns emerge
5. **3-level max** — palace → category → leaf (no deeper nesting)
6. **MAP.yml as escape hatch** — flat keyword index for fast lookup
7. **Cross-platform** — works with any AI tool that supports Agent Skills
8. **Lazy initialization** — palace created on first write, not on install

## Updating the Skill

```bash
npx skills update loci
```

This only updates the engine (SKILL.md + references/). Your memories in `~/.loci/`
are completely unaffected.

## Migrating from Other Systems

```
/loci import claude      — Claude Code memory files
/loci import openclaw    — OpenClaw MEMORY.md + daily logs
/loci import cursor      — Cursor .mdc rule files
/loci import text <file> — Plain text, one memory per paragraph
/loci import loci <path> — Another loci palace (merge with dedup)
```

## License

MIT
