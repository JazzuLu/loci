# Palace Templates

Templates used during lazy initialization (`~/.loci/` scaffold).

**Important**: Each template below has a YAML block (frontmatter) and a markdown
block (body). Concatenate them into a single file — the YAML frontmatter goes
between `---` delimiters at the top, followed immediately by the markdown body.

---

## PALACE.md → writes to `~/.loci/PALACE.md`

```yaml
---
name: loci-palace
description: >-
  Memory palace root. Navigate categories below or use MAP.yml for keyword search.
---
```

```markdown
# My Memory Palace

| Category | Covers | Memories |
|----------|--------|----------|
| inbox | Unsorted memories awaiting categorization | 0 |
| attic | Archived/superseded memories | 0 |

Categories grow on demand. When 3+ inbox memories share a theme, create a new one.
```

---

## MAP.yml → writes to `~/.loci/MAP.yml`

```yaml
version: 1

# Landmarks: high-priority memories AI should check first
landmarks: []

categories:
  inbox:
    description: "Unsorted memories awaiting categorization"
    path: inbox/
    memories: {}

  attic:
    description: "Archived/superseded memories (cold storage)"
    path: attic/
    memories: {}
```

---

## inbox/SKILL.md → writes to `~/.loci/inbox/SKILL.md`

```yaml
---
name: loci-inbox
description: >-
  Unsorted memories awaiting categorization. New memories land here when
  no existing category fits. Use when storing quick notes, uncategorized
  learnings, or anything that doesn't have a clear home yet.
---
```

```markdown
# Inbox

Default landing zone for memories without a clear category.

| Memory | Slug | Keywords | Updated |
|--------|------|----------|---------|

When 3+ memories share a theme, run `/loci tidy` to organize.
```

---

## attic/SKILL.md → writes to `~/.loci/attic/SKILL.md`

```yaml
---
name: loci-attic
description: >-
  Archived and superseded memories. Cold storage for knowledge that is
  outdated, rarely needed, or replaced by newer patterns.
---
```

```markdown
# Attic (Archive)

Cold storage. Only load when current memories don't have the answer.

| Memory | Slug | Original Category | Archived Date | Reason |
|--------|------|-------------------|---------------|--------|
```

---

## Category SKILL.md → writes to `~/.loci/{name}/SKILL.md` (for new categories)

```yaml
---
name: loci-{category-name}
description: >-
  {Category description}. Use when looking for memories about {topics}.
---
```

```markdown
# {Category Name}

| Memory | Slug | Keywords | Updated |
|--------|------|----------|---------|
```

---

## Leaf Memory SKILL.md → writes to `~/.loci/{category}/{slug}/SKILL.md`

```yaml
---
name: loci-{category}-{slug}
description: >-
  {Topic summary with keywords}. {What this covers}.
  Use when {trigger conditions}.
---
```

```markdown
# {Topic Title}

**Last updated**: {YYYY-MM-DD}
**Source**: {Where this knowledge came from}
**Confidence**: {high | medium | low}

## Key Learnings

### {Subtopic}
- {Fact or pattern}

## Related Memories
- [{Related topic}](../../{category}/{slug}/SKILL.md)

## Change Log
- {YYYY-MM-DD}: Created
```
