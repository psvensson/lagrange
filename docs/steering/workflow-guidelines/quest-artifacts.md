---
scope: governance
status: canonical
always_load: false
source_of_truth: self
compiled_pack: docs/steering/llm/governance.md
parent_index: ../workflow-guidelines/INDEX.md
last_reviewed: 2026-07-10
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

Track `solve/log/` because it is the append-only source of truth for attempts,
findings, and terminal events. Track `solve/report/` and `solve/changes/` when
they document committed Quest progress or closure.

`solve/state/` is derived cache. The derived cache is git-ignored and may be
rebuilt from the Quest plus event log.

## Artifact Boundaries

Use `docs/` for documentation (user/operator-facing docs, the agent steering
tree under `docs/steering/`, and internal engineering plans) — never for active
work definition.

Use `solve/quests/` for active work definition.

Use source, test, architecture, and steering files for the implementation or
documentation changes required by the Quest. Keep unrelated edits out of an
attempt so the `diff:<path>` artifact remains reviewable.
