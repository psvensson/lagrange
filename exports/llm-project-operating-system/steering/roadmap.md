---
scope: governance
status: canonical
always_load: false
source_of_truth: self
compiled_pack: steering/packs/governance.md
last_reviewed: 2026-06-01
---

> Method kernel — portable. Keep the mechanism; this file is domain-neutral. Extend it with your project's own roadmap.

> **Canonical source.** Roadmap and scope pointer.

# Roadmap Steering Pointer

## Document Role

This document governs how roadmap and scope documents constrain Quest authoring
and implementation without replacing the Solver.

Use this file for:

- roadmap scope and sequence authority;
- in-scope / implementation-home checks;
- readiness rules for starting implementation from roadmap rows;
- deciding whether a Quest is in scope.

Do not use this file for:

- Quest attempt logs or terminal reports;
- system behavior rules;
- testing policy;
- style guidance;
- current subsystem owner maps.

This file is the pointer; the data it gates lives in the project's own roadmap
and scope-gate documents. Wire these three pointers to your project's real
files (paths shown are illustrative — replace them):

- a **feature roadmap** (e.g. `../roadmap.md`) that constrains allowed feature
  scope and broad sequencing. It does not by itself prove a Quest is SOLVED.
- a **visibility roadmap** (e.g. `../product-roadmap.md`) that shows
  out-of-scope or externally-owned work. It is visibility-only and must not be
  used as an implementation source here.
- a **scope gate** — the edition matrix
  ([`../governance/edition-matrix.template.md`](../governance/edition-matrix.template.md))
  enforced by the rule in
  [`../governance/scope-discipline.md`](../governance/scope-discipline.md). Any
  feature whose `Implementation home` is not **this repo** in the matrix is
  out of scope for implementation here unless the user explicitly asks for
  in-scope preparatory work.

## Document Authority Map

Use repository documents according to this ownership split. Locations are
illustrative; keep the **concern** column when you remap them:

| Document class | Canonical location | Primary concern |
| --- | --- | --- |
| Implementation doctrine | `steering/doctrine/INDEX.md` | Repo-wide architectural intent |
| Stable implementation contract | `steering/system-guidelines.md` | Repo-wide hard stops |
| Runtime contract detail | `steering/runtime-contracts.md` | Domain-specific runtime rules |
| Workflow contract detail | `steering/workflow/INDEX.md` | Quest workflow |
| Stable testing policy | `steering/testing/INDEX.md` | Durable repo-wide testing rules |
| Style and lint | `steering/style.md` | Formatting, lint, and local coding style |
| Architecture entrypoint | `architecture/INDEX.md` | Canonical architecture entrypoint and subsystem detail |
| Feature roadmap | `roadmap.md` | Allowed feature scope and broad sequence |
| Visibility roadmap | `product-roadmap.md` | Out-of-scope / externally-owned status only |
| Scope gate (edition matrix) | `governance/edition-matrix.template.md` | Feature-area to implementation-home mapping |
| Quest definitions | `solve/quests/*` | Active work goals, frontiers, and constraints |
| Workstream-local procedure | `specs/*`, `test/*.local.md` | Thresholds, scripts, checklists, local proof detail |

When two documents appear to conflict, the more specific and the
more-locally-owned document wins for its own concern; this pointer never
overrides a document on that document's own subject.

## Quest Intake And Execution Flow

All non-trivial implementation work should start from a bounded Quest:

1. If the request changes product scope, feature sequence, or implementation
   ownership, sharpen the feature roadmap or the scope gate first.
2. If the request is already in scope, create or select a Quest under
   `solve/quests/`.
3. The Quest must cite or encode enough scope context to prevent local invention.
4. Implementation begins only after `doneWhen`, frontiers, metrics, and
   constraints are clear.
5. Completion is claimed only through the Solver report.

`docs/` is reserved for user-facing or operator-facing documentation. Active
work definition lives under `solve/quests/`.

## In-Scope Preparatory Work

Shared substrate work may happen in this repository only when all of the
following are true:

1. The implementation home remains **this repo**, or the user explicitly asks
   for in-scope preparatory work only.
2. The work does not implement externally-owned behavior, externally-owned
   operator flows, or externally-owned control surfaces in this repository.
3. The work remains consistent with the scope and sequence in the feature
   roadmap and the ownership in the scope gate.

Architecture documents may mention externally-owned services only as examples
of external consumers of this repository's substrate. Such examples must not
define implementation tasks in this repository unless the active Quest
explicitly limits the work to locally-owned substrate and excludes
externally-owned behavior, operator flows, and control surfaces.

## Readiness To Start Work

Before implementation tasks begin from a roadmap row:

1. The row must be in scope for this repository under the scope gate.
2. Broad rows must gain a linked spec or architecture document before active
   implementation starts.
3. A row may move to active implementation only when the intended behavior is
   sharp enough to produce a sealed `doneWhen`.
4. The Quest must name the roadmap row, approved maintenance scope, or explicit
   user request that makes it valid.

## Roadmap State Policy

Roadmap state is scope and sequence metadata. It is not Solver evidence.

Required workflow:

1. Treat the feature roadmap as a stable feature map: row presence and row
   order constrain what can be scoped in this repository.
2. Treat `solve/quests/` and Solver reports as active execution truth.
3. A roadmap row marked available means the capability exists at roadmap scope;
   it does not mean every related Quest is SOLVED.
4. If implementation proves a roadmap row is absent, overbroad, out of scope, or
   ordered incorrectly, classify that as a roadmap correction and fix the row.
5. Roadmap corrections discovered during implementation should land with the
   Quest changes that discovered them. Do not leave truth repair as chat-only
   memory.
6. Do not use roadmap state to claim Quest closure. Closure requires Solver
   terminal evidence.

## Illustrative Roadmap Rows

> EXAMPLE — neutral placeholders. Delete these and list your project's real
> feature areas. Each row inherits its in-scope / out-of-scope verdict from the
> scope gate, not from this list.

| Feature area | Broad sequence note | In scope here? |
| --- | --- | --- |
| Core API | Foundational; sequence first | Yes (home: this repo) |
| Core data model | Co-evolves with Core API | Yes (home: this repo) |
| Background jobs | After core surfaces stabilize | Yes (home: this repo) |
| Operational visibility | Metrics and diagnostics | Yes (home: this repo) |
| Billing | Externally owned | No (visibility-only) |
| Advanced analytics | Externally owned | No (visibility-only) |

## Audit Procedure

Use these repository-root checks to confirm the steering stack still has one
doctrine path and that top-level canonical source files declare their role:

```sh
# Canonical steering trees are referenced by their INDEX.md, not a short name.
rg -n --glob '*.md' '\bsteering/(doctrine|workflow|testing)/INDEX\.md' steering
# No reference should point at a bare short-name file for a moved tree.
rg -n --glob '*.md' '\bsteering/(doctrine|workflow|testing)\.md' steering
# Every top-level canonical source file declares a Document Role.
for f in steering/*.md; do
  rg -q '^status: canonical$' "$f" || continue
  rg -q '^## Document Role$' "$f" || echo "$f"
done
```

Expected result:

1. Canonical `steering/*/INDEX.md` references remain for moved steering trees.
2. Bare short-name references for moved steering trees return zero hits in
   steering Markdown.
3. The `Document Role` loop prints no paths for top-level canonical source
   files. Pointer files, split subfiles, and generated LLM packs are outside
   this check.
