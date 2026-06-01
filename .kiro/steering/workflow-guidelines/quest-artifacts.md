---
scope: governance
status: canonical
always_load: false
source_of_truth: self
compiled_pack: .kiro/steering/llm/governance.md
parent_index: ../workflow-guidelines/INDEX.md
last_reviewed: 2026-06-01
---

> **Canonical source.** Quest artifact ownership and tracked data. Index:
> [`INDEX.md`](INDEX.md).

# Quest Artifacts

## Authored Artifacts

The authored unit of work is:

```text
solve/quests/<id>.json
```

Commit Quest files because they define the sealed goal, frontiers, metrics, and
constraints.

## Runtime Artifacts

The Solver may create:

- `solve/log/<id>.ndjson`
- `solve/state/<id>.json`
- `solve/report/<id>.md`
- `solve/changes/<id>/...`

These are derived runtime artifacts. They are git-ignored and may be rebuilt or
regenerated from the Quest and available evidence.

## Artifact Boundaries

Use `docs/` for user-facing or operator-facing documentation.

Use `solve/quests/` for active work definition.

Use source, test, architecture, and steering files for the implementation or
documentation changes required by the Quest. Keep unrelated edits out of an
attempt so the `diff:<path>` artifact remains reviewable.
