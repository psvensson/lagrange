---
scope: governance
status: canonical
always_load: false
source_of_truth: self
compiled_pack: docs/steering/llm/governance.md
last_reviewed: 2026-06-01
---

> **Canonical source.** Roadmap and edition-scope pointer.

# Roadmap Steering Pointer

## Document Role

This document governs how roadmap and scope documents constrain Quest authoring
and implementation without replacing the Solver.

Use this file for:

- roadmap scope and sequence authority;
- AGPL scope and implementation-home checks;
- readiness rules for starting implementation from roadmap rows;
- deciding whether a Quest is in scope.

Do not use this file for:

- Quest attempt logs or terminal reports;
- system behavior rules;
- testing policy;
- style guidance;
- current subsystem owner maps.

The canonical AGPL feature sequence and scope map lives at `../../roadmap.md`.

Cross-edition visibility lives at `../../product-roadmap.md`.
Edition ownership and implementation-home rules live at `../../edition-matrix.md`.

Use these documents as follows:

- `../../roadmap.md` constrains allowed AGPL feature scope and broad sequencing.
  It does not by itself prove a Quest is SOLVED.
- `../../product-roadmap.md` is visibility-only and must not be used as an
  implementation source here.
- Any feature whose `Implementation home` is not `AGPL repo` in
  `../../edition-matrix.md` is out of scope for implementation in this
  repository unless the user explicitly asks for AGPL-scoped preparatory work.

## Document Authority Map

Use repository documents according to this ownership split:

| Document class | Canonical location | Primary concern |
| --- | --- | --- |
| Implementation doctrine | `docs/steering/doctrine/INDEX.md` | Repo-wide architectural intent |
| Stable implementation contract | `docs/steering/system-guidelines.md` | Repo-wide hard stops |
| Runtime contract detail | `docs/steering/runtime-contracts.md` | Control-plane, cache, metadata, pressure, and transport rules |
| Workflow contract detail | `docs/steering/workflow-guidelines/INDEX.md` | Quest workflow |
| Stable testing policy | `docs/steering/testing-guidelines/INDEX.md` | Durable repo-wide testing rules |
| Style and lint | `docs/steering/code-style.md` | Formatting, lint, and local coding style |
| Architecture entrypoint | `architecture/INDEX.md` | Canonical architecture entrypoint and subsystem detail |
| AGPL roadmap | `roadmap.md` | Allowed feature scope and broad sequence |
| Visibility roadmap | `product-roadmap.md` | Cross-edition status only |
| Scope matrix | `edition-matrix.md` | Edition and implementation-home mapping |
| Quest definitions | `solve/quests/*` | Active work goals, frontiers, and constraints |
| Workstream-local procedure | `solve/specs/*`, `test/*.local.md` | Thresholds, scripts, checklists, local proof detail |

## Quest Intake And Execution Flow

All non-trivial implementation work should start from a bounded Quest:

1. If the request changes product scope, feature sequence, or edition ownership,
   sharpen `../../roadmap.md` or `../../edition-matrix.md` first.
2. If the request is already in scope, create or select a Quest under
   `solve/quests/`.
3. The Quest must cite or encode enough scope context to prevent local invention.
4. Implementation begins only after `doneWhen`, frontiers, metrics, and
   constraints are clear.
5. Completion is claimed only through the Solver report.

`docs/` is reserved for user-facing or operator-facing documentation. Active
work definition lives under `solve/quests/`.

## AGPL Preparatory Work

Shared substrate work may happen in this repository only when all of the
following are true:

1. The implementation home remains `AGPL repo`, or the user explicitly asks for
   AGPL-scoped preparatory work only.
2. The work does not implement paid-only behavior, paid-only operator flows, or
   paid-only control surfaces in this repository.
3. The work remains consistent with the scope and sequence in `../../roadmap.md`
   and the edition ownership in `../../edition-matrix.md`.

Architecture documents may mention Pro or Enterprise services only as examples
of external consumers of AGPL substrate. Such examples must not define
implementation tasks in this repository unless the active Quest explicitly
limits the work to AGPL-owned substrate and excludes paid-only behavior,
operator flows, and control surfaces.

## Readiness To Start Work

Before implementation tasks begin from a roadmap row:

1. The row must be in scope for this repository under the repo-root `edition-matrix.md`.
2. Broad rows must gain a linked spec or architecture document before active
   implementation starts.
3. A row may move to active implementation only when the intended behavior is
   sharp enough to produce a sealed `doneWhen`.
4. The Quest must name the roadmap row, approved maintenance scope, or explicit
   user request that makes it valid.

## Roadmap State Policy

Roadmap state is scope and sequence metadata. It is not Solver evidence.

Required workflow:

1. Treat `../../roadmap.md` as a stable AGPL feature map: row presence and row
   order constrain what can be scoped in this repository.
2. Treat `solve/quests/` and Solver reports as active execution truth.
3. A roadmap row marked available means the capability exists at roadmap scope;
   it does not mean every related Quest is SOLVED.
4. If implementation proves a roadmap row is absent, overbroad, out of AGPL
   scope, or ordered incorrectly, classify that as a roadmap correction and fix
   the row.
5. Roadmap corrections discovered during implementation should land with the
   Quest changes that discovered them. Do not leave truth repair as chat-only
   memory.
6. Do not use roadmap state to claim Quest closure. Closure requires Solver
   terminal evidence.

## Feature Flag Lifecycle

A default-off feature flag (e.g. a `LAGRANGE_*` lever) is a temporary validation
gate, not a permanent home for a second implementation. Every flag carries, in its
landing commit or Quest, an owner and a written promote-or-retire condition — the
evidence that would graduate it to default-on, or the finding that would delete it.

A flag that preserves old behavior as the live default while a new mechanism sits
dormant is an unfinished cutover (see [`doctrine/owner-boundaries.md`](doctrine/owner-boundaries.md) §1),
not a building block. Periodically sweep the flags and retire or promote any whose
condition has been met or has gone stale. This sweep is a manual discipline today —
there is no automated flag-audit script — so it must be performed deliberately, not
assumed.

## Audit Procedure

Use these repository-root checks to confirm the steering stack still has one
doctrine path and that top-level canonical source files declare their role:

```sh
rg -n --glob '*.md' '`(doctrine|workflow-guidelines|testing-guidelines)\\.md`' docs/steering
rg -n --glob '*.md' '\\docs/steering/(doctrine|workflow-guidelines|testing-guidelines)\\.md' docs/steering
rg -n --glob '*.md' '\\docs/steering/(doctrine|workflow-guidelines|testing-guidelines)/INDEX\\.md' docs/steering
for f in docs/steering/*.md; do
  rg -q '^status: canonical$' "$f" || continue
  rg -q '^## Document Role$' "$f" || echo "$f"
done
```

Expected result:

1. Short-name moved steering pointer references return zero hits in steering
   Markdown.
2. Canonical `docs/steering/*/INDEX.md` references remain for moved steering
   trees.
3. The `Document Role` loop prints no paths for top-level canonical source
   files. Pointer files, split subfiles, and generated LLM packs are outside
   this check.
