---
scope: governance
status: canonical
always_load: false
source_of_truth: self
compiled_pack: .kiro/steering/llm/governance.md
last_reviewed: 2026-05-23
---

> **Canonical source.** Roadmap and edition-scope pointer.

# Roadmap Steering Pointer

## Document Role

This document governs how roadmap and scope documents constrain implementation
work without replacing packages, tracks, releases, or generated blocker state.

Use this file for:

- roadmap scope and sequence authority
- AGPL scope and implementation-home checks
- readiness rules for starting work under roadmap rows
- idea triage into roadmap rows or work packages

Do not use this file for:

- current blocker or active-package truth
- release-gate closure truth
- system behavior rules
- testing policy
- style guidance
- current subsystem owner maps
- package-local execution detail

The canonical AGPL feature sequence and scope map lives at `../../roadmap.md`.

Cross-edition visibility lives at `../../product-roadmap.md`.
Edition ownership and implementation-home rules live at `../../edition-matrix.md`.

Use these documents as follows:
- `../../roadmap.md` constrains allowed AGPL feature scope and broad sequencing.
  It does not activate implementation work or certify release readiness.
- `../../product-roadmap.md` is visibility-only and must not be used as an
  implementation source here.
- Any feature whose `Implementation home` is not `AGPL repo` in
  `../../edition-matrix.md` is out of scope for implementation in this
  repository.

## Document Authority Map

Use the repository documents according to this ownership split:

| Document class | Canonical location | Primary concern |
| --- | --- | --- |
| Implementation doctrine | `.kiro/steering/doctrine.md` | Short repo-wide architectural intent |
| Stable implementation contract | `.kiro/steering/system-guidelines.md` | Compact repo-wide hard stops |
| Runtime contract detail | `.kiro/steering/runtime-contracts.md` | Control-plane, cache, metadata, pressure, and transport rules |
| Workflow contract detail | `.kiro/steering/workflow-guidelines.md` | Package, sprint, execution-role, guardrail, and causal-closure workflow |
| Stable testing policy | `.kiro/steering/testing-guidelines.md` | Durable repo-wide testing rules |
| Style and lint | `.kiro/steering/code-style.md` | Formatting, lint, and local coding style |
| Architecture entrypoint | `architecture/INDEX.md` | Canonical architecture entrypoint, current subsystem owner maps, and data flow index |
| Architecture compatibility pointer | `architecture.md` | Compatibility pointer for older links only |
| Architecture support docs | `architecture/*.md` | Current concrete owner maps and subsystem detail |
| AGPL roadmap | `roadmap.md` | Allowed feature scope and broad sequence |
| Visibility roadmap | `product-roadmap.md` | Cross-edition status only |
| Scope matrix | `edition-matrix.md` | Edition and implementation-home mapping |
| Internal work tracking | `work/*` | Ideas, work packages, sprint grouping, execution progress |
| Workstream-local procedure | `.kiro/specs/*`, `test/*.local.md` | Thresholds, scripts, checklists, local closure flow |

## Work Intake And Execution Flow

All non-trivial implementation work must start from a human idea and then
follow one of two paths:

1. `idea -> roadmap sharpening -> work package`
2. `idea -> direct work package`

Use the paths as follows:

1. Capture the idea in `work/ideas/` as `idea-YYYYMMDD-slug.md`.
2. If the idea changes feature scope, product direction, or the broad sequence,
   sharpen `../../roadmap.md` first.
3. If the idea is already within approved scope and is bounded enough to
   execute directly, create a work package in `work/packages/`.
4. Active implementation work begins only from
   `work/packages/active-YYYYMMDD-slug.md` or from explicit roadmap-sharpening
   work that is creating such a package.
5. Completed work packages are renamed to `done-...` in the filename, then
   committed and pushed as a focused package slice before the next slice starts.
   Packages closed under the current tracker workflow carry a Commit And Push
   Ledger naming the focused package commit SHA, pushed remote/branch, and
   package-only commit confirmation. Historical closed-package proof must not
   be backfilled by invention; if a package is reopened, migrated, or closed
   again, the current proof rules apply.

Use `work/sprints/` only to group multiple active packages. Sprint files do not
replace work packages.

Scenario-driven sprint files must keep a compact current blocker snapshot near
the top of the document. The snapshot is the handoff point for agents and any
optional delegated sub-agents when starting or continuing the sprint. The
snapshot must identify the latest artifact, representative gate, current
representative package, owner boundary, canonical blocker, prior blocker status,
subordinate evidence, and next focused proof surface.

At most one package in a sprint may own the current representative re-entry
gate. Residual packages that are not currently being executed must be renamed
to `todo-...` or `superseded-...` unless they are actively worked with
explicitly disjoint owner and file scope.

`docs/` is reserved for end-user or operator-facing documentation. Internal
planning, work-package execution, and sprint tracking must not live there.

## AGPL Preparatory Work

Shared substrate work may happen in this repository only when all of the
following are true:

1. The implementation home remains `AGPL repo`, or the user explicitly asks for
   AGPL-scoped preparatory work only.
2. The work does not implement paid-only behavior, paid-only operator flows, or
   paid-only control surfaces in this repository.
3. The work remains consistent with the scope and sequence in `../../roadmap.md`
   and the edition ownership in
   `../../edition-matrix.md`.

Architecture documents may mention Pro or Enterprise services only as examples
of external consumers of AGPL substrate. Such examples must not define
implementation tasks in this repository unless the active package explicitly
limits the work to AGPL-owned substrate and excludes paid-only behavior,
operator flows, and control surfaces.

## Readiness To Start Work

Before implementation tasks begin from a roadmap row:

1. The row must be in scope for this repository under
   `../../edition-matrix.md`.
2. Broad rows must gain a linked spec or architecture document before active
   implementation starts.
3. A row may move to active implementation only when the intended behavior is
   sharp enough to produce tasks without inventing scope locally.
4. Non-trivial implementation changes must be driven by an active work package
   under `work/packages/`, unless the immediate work is the roadmap-sharpening
   step itself.
5. Direct work packages must cite the roadmap row they belong to, or the
   already-approved maintenance/refactor scope that makes them valid without a
   roadmap change.

## Roadmap State Policy

Roadmap state is scope and sequence metadata. It is not package activation,
release-gate proof, or current-blocker truth.

Required workflow:

1. Treat `../../roadmap.md` as a stable AGPL feature map: row presence and row
   order constrain what can be scoped in this repository.
2. Treat `work/packages/`, `work/sprints/current-blocker.*`,
   `work/releases/*`, and `work/tracks/*` as the sources of truth for active
   execution, representative evidence, release risk, and gate closure.
3. A roadmap row marked available means the capability exists at roadmap scope;
   it does not mean release readiness is green or that no active maintenance
   package can still target that area.
4. If implementation proves a roadmap row is absent, overbroad, out of AGPL
   scope, or ordered incorrectly, classify that as a roadmap correction and fix
   the row. If implementation proves only that a release gate remains red, keep
   the live truth in release, track, sprint, and package files instead.
5. Roadmap corrections discovered during implementation should land with the
   package or sprint closure that discovered them. Do not leave truth repair as
   an out-of-band memory item.
6. Do not use roadmap state to close packages, close sprints, or claim release
   readiness. Those claims require the relevant package, sprint, release, and
   track evidence.

## Sprint Continuation And Package Split Policy

When a sprint is started or resumed, the current blocker snapshot is the
execution source of truth for work sequencing.

Required workflow:

1. Refresh or confirm the snapshot before activating implementation work.
2. Keep artifact-derived evidence attached to the current package while the
   semantic owner, owner boundary, and next required action remain the same.
3. Do not create a new package solely for changed artifact timestamps, epochs,
   node ids, counters, or presentation-only shape.
4. Split or activate a new package only when the normalized evidence identifies
   a new owner boundary or materially different next action.
5. Execute owner-boundary work through required `implementation` and
   `verification-fix` roles. Optional delegated review, artifact extraction,
   owner-path mapping, and focused proof design can accelerate those roles but
   do not replace them.
6. When starting or continuing a work package, review the most recently executed
   package on the same sprint or owner boundary when that context can affect the
   new package. A real sub-agent may perform the review, but identity is
   optional provenance.
7. If that review finds stale status, incomplete closure, missing residual
   split, guardrail drift, evidence mismatch, or package-snapshot inconsistency,
   fix those findings before implementation of the new package starts.
8. Start the current package's `implementation` role only after the
   previous-package review is clean, not needed, or fixed.
9. Parallel real sub-agents are allowed only for independent sidecar questions
   with disjoint owner or file scope.
10. The main package owner must reconcile optional delegated findings into one
   package status update rather than creating parallel status narratives.
11. Parent-session notes, local/manual session labels, arbitrary text, and real
    agent ids are provenance only. Closure proof comes from checked
    `## Execution Evidence` roles; use `human-waived`, `tool-unavailable`, or
    `blocked-by-environment-policy` with a reason when delegation is not used or
    unavailable.

## Audit Procedure

Use these repository-root checks to confirm the steering stack still has one
doctrine path and that top-level canonical source files declare their role:

```sh
rg -n --glob '*.md' '`doctrine\\.md`' .kiro/steering
rg -n --glob '*.md' '\\.kiro/steering/doctrine\\.md' .kiro/steering
for f in .kiro/steering/*.md; do
  rg -q '^status: canonical$' "$f" || continue
  rg -q '^## Document Role$' "$f" || echo "$f"
done
```

Expected result:

1. Short-name doctrine references return zero hits in steering Markdown.
2. Canonical `.kiro/steering/doctrine.md` references remain.
3. The `Document Role` loop prints no paths for top-level canonical source
   files. Pointer files, split subfiles, and generated LLM packs are outside
   this check.
