# /loci Commands

The `/loci` command manages the Memory Palace at `~/.loci/`.

**Data directory**: `~/.loci/` (user data, never modified by skill updates)
**Engine directory**: this skill (updatable via `npx skills add`)

## Lazy Initialization

Before ANY write operation, check if `~/.loci/` exists. If not:

1. Create directory structure: `~/.loci/`, `~/.loci/inbox/`, `~/.loci/attic/`
2. Copy templates from `references/palace-template.md`:
   - `~/.loci/PALACE.md` (root navigation)
   - `~/.loci/MAP.yml` (empty index)
   - `~/.loci/inbox/SKILL.md` (empty inbox)
   - `~/.loci/attic/SKILL.md` (empty archive)
3. Confirm: "Created memory palace at ~/.loci/"

## Commands

### Store a new memory

```
/loci remember <free-form description>
```

**Agent workflow:**

1. Ensure `~/.loci/` exists (lazy init if needed)
2. Read `~/.loci/MAP.yml` — check if an existing category fits
3. Parse the content for topic and key facts
4. Generate a slug (lowercase, hyphens, e.g. `react-server-components`)
5. Check if a similar memory already exists (scan MAP.yml keywords)
   - If exists → update the existing leaf SKILL.md (append, don't overwrite)
   - If new + category exists → create leaf in that category
   - If new + **no category fits** → **put it in `inbox/`**
6. Write the leaf SKILL.md (see template in `references/palace-template.md`)
7. Update the category (or inbox) SKILL.md routing table
   Row format: `| {name} | {slug} | {keywords} | {YYYY-MM-DD} |`
   (matches the Category SKILL.md template in `references/palace-template.md`)
8. Update `~/.loci/MAP.yml` (add entry with keywords + date)
9. Confirm to user: "Stored in `~/.loci/{category}/{slug}/`"

### Update an existing memory

```
/loci update <category/slug>: <new content>
```

1. Read `~/.loci/{category}/{slug}/SKILL.md`
2. Merge new content (append new section or update existing)
3. Update "Last updated" date and append to Change Log
4. If keywords changed → update category routing table + `~/.loci/MAP.yml`
5. Confirm with diff summary

### Archive a memory

```
/loci archive <category/slug>
```

1. Move `~/.loci/{category}/{slug}/` to `~/.loci/attic/{slug}/`
2. Remove from source category routing table
3. Add to `~/.loci/attic/SKILL.md` archived memories table
4. Move entry in `~/.loci/MAP.yml` from source category to attic
5. Confirm

### List memories

```
/loci list              — All categories with counts
/loci list <category>   — All memories in a category
```

1. Read `~/.loci/MAP.yml`
2. Format as table: name, keywords, updated
3. Show total counts per category

### Search memories

```
/loci search <keywords>
```

1. Read `~/.loci/MAP.yml`, match keywords (case-insensitive)
2. If no MAP.yml match → `grep -rl "keyword" ~/.loci/`
3. Return ranked list with paths
4. Offer to load any specific memory

### Tidy inbox

```
/loci tidy
```

1. Read all leaf SKILL.md files in `~/.loci/inbox/*/SKILL.md`
   (exclude `~/.loci/inbox/SKILL.md` itself — that's the routing table)
2. Analyze themes — group memories that share topics
3. For each group with 3+ memories:
   - Propose a new category name and description
   - Ask user for approval
   - If approved: create category dir + SKILL.md, move memories, update MAP.yml
4. For groups with 1-2 memories: leave in inbox, note the theme
5. Report: "Moved N memories to M new categories, K remain in inbox"

### Create a new category

```
/loci new-category <name>: <description>
```

1. Create `~/.loci/{name}/`
2. Write category SKILL.md using the "Category SKILL.md" template in `references/palace-template.md`
3. Add category to `~/.loci/MAP.yml`
4. Add row to `~/.loci/PALACE.md` categories table
5. Confirm

### Status check

```
/loci status
```

1. Check if `~/.loci/` exists
2. Count total memories (leaf SKILL.md files)
3. Count per category
4. Validate MAP.yml integrity (entries match actual files)
5. Show last modified date
6. Report any orphaned files (exist on disk but not in MAP.yml)

### Rebuild MAP.yml

```
/loci rebuild-map
```

Use when MAP.yml is corrupted, out of sync, or deleted.

1. Scan category routing tables: `~/.loci/*/SKILL.md` (depth 2)
   Parse each frontmatter to reconstruct the `categories:` block
2. Scan leaf memories only: `~/.loci/*/*/SKILL.md` (depth 3, non-recursive)
   Skip routing tables and `PALACE.md`
3. Parse each leaf SKILL.md frontmatter (name, description)
4. Extract keywords from description
5. Rebuild MAP.yml from scratch: version, categories with memories, landmarks (preserve if recoverable)
6. Verify against `~/.loci/PALACE.md` categories table — sync if mismatched
7. Report: "Rebuilt MAP.yml with N memories across M categories"

### Import from other systems

```
/loci import claude       — From ~/.claude/memory/ and project memories
/loci import openclaw     — From ~/.openclaw/workspace/MEMORY.md
/loci import cursor       — From .cursor/rules/*.mdc
/loci import text <file>  — From plain text (one memory per paragraph)
/loci import loci <path>  — From another loci palace
```

**General import workflow:**

1. Ensure `~/.loci/` exists (lazy init if needed)
2. Read source file(s) based on source type
3. Parse into individual knowledge entries
4. For each entry, show summary and ask: "Import this? [Y/n/edit]"
5. Imported entries go to `~/.loci/inbox/` by default
6. Update `~/.loci/MAP.yml` for each imported entry
7. Report: "Imported N memories to inbox. Run `/loci tidy` to organize."

**Source-specific parsing:**

- **claude**: Read `~/.claude/memory/MEMORY.md` + `~/.claude/projects/*/memory/*.md`.
  Split by `##` headings. Use project path as keyword hint.
- **openclaw**: Read `~/.openclaw/workspace/MEMORY.md`.
  Split by `##` headings. Check `daily/` logs for recent entries.
- **cursor**: Read `.cursor/rules/*.mdc` files.
  Each file becomes one memory. Filename as slug.
- **text**: Split by double newlines (blank line = separator).
  Each paragraph becomes one memory.
- **loci**: Copy leaf SKILL.md files and merge MAP.yml entries.
  Skip duplicates by matching slugs.

## Category Growth Rules

- **Don't create empty categories**. Categories emerge from content, not prediction.
- **Inbox first**: When unsure, put it in inbox. That's what it's for.
- **3+ threshold**: When 3+ inbox memories share a theme → time for a new category.
- **User approval**: Always ask before creating a new category.

## Auto-Remember (Passive Detection)

Agents should consider storing memories when they detect:

- **Corrections**: "No, actually it should be..." / "That's wrong..."
- **Preferences**: "I prefer X over Y" / "Always use X"
- **Solutions**: Debugging reveals a non-obvious root cause
- **Decisions**: Architectural decision made with rationale
- **Facts**: Project fact established ("The API endpoint is X")

**Workflow:**

1. Detect the memorable event
2. Ask user: "Should I remember this? [Y/n]"
3. If yes → execute `/loci remember` store workflow

## Concurrency Note

If multiple AI sessions access `~/.loci/` simultaneously, the last writer wins
on MAP.yml and routing tables. For safety, avoid parallel `/loci remember`
operations across different AI tools. Reading is always safe.
