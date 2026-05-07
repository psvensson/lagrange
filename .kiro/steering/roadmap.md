# Roadmap Steering Pointer

## Document Role

This document governs how roadmap and scope documents are used during
implementation work.

Use this file for:

- implementation-driving roadmap authority
- AGPL scope and implementation-home checks
- readiness rules for starting work from roadmap rows
- idea triage into roadmap rows or work packages

Do not use this file for:

- system behavior rules
- testing policy
- style guidance
- current subsystem owner maps
- package-local execution detail

The canonical AGPL implementation roadmap lives at `../../roadmap.md`.

Cross-edition visibility lives at `../../product-roadmap.md`.
Edition ownership and implementation-home rules live at `../../edition-matrix.md`.

Use these documents as follows:
- `../../roadmap.md` is the only roadmap that may drive specs, tasks, or code
  in this repository.
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
| Stable implementation rules | `.kiro/steering/system guidelines.md` | Durable repo-wide coding rules |
| Stable testing policy | `.kiro/steering/testing-guidelines.md` | Durable repo-wide testing rules |
| Style and lint | `.kiro/steering/code-style.md` | Formatting, lint, and local coding style |
| Architecture entrypoint | `architecture.md` | Current subsystem owner maps and data flow index |
| Architecture support docs | `architecture/*.md` | Current concrete owner maps and subsystem detail |
| Implementation-driving roadmap | `roadmap.md` | Allowed implementation scope and status |
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
2. If the idea changes scope, product direction, or starts a broad new
   implementation track, sharpen `../../roadmap.md` first.
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
the top of the document. The snapshot is the handoff point for agents and
sub-agents when starting or continuing the sprint. It must identify the latest
artifact, representative gate, current representative package, owner boundary,
canonical blocker, prior blocker status, subordinate evidence, and next focused
proof surface.

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
3. The work remains consistent with `../../roadmap.md` and
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

## Roadmap Status Truth Policy

Roadmap status must be reconciled with current work-tracker and representative
scenario evidence.

Required workflow:

1. A roadmap row may be treated as complete only when no active package or
   active sprint is still fixing the same declared exit criterion.
2. For resilience, topology, failure-simulation, production-guarantee, or
   distributed-harness rows, completion requires named representative evidence,
   not only focused unit or integration proof.
3. If a package discovers that a completed roadmap row still has an active
   representative blocker, the package must classify the mismatch as one of:
   - capability-complete but gate-open
   - status-overstated and requiring roadmap correction
   - new maintenance concern outside the original row
4. A sprint may not close while `../../roadmap.md` says a relevant exit
   criterion is complete and the sprint's current package says that same
   criterion still fails.
5. Roadmap corrections discovered during implementation should land with the
   package or sprint closure that discovered them. Do not leave truth repair as
   an out-of-band memory item.
6. If a broad row is marked complete but still has known guardrail failures in
   the owner path it claims to close, the row must either name the remaining
   guardrail package or be downgraded to a capability-only status.

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
5. Use real sub-agents in sequence across owner-boundary work: artifact evidence
   extraction, owner-path mapping, focused proof design, then bounded
   implementation.
6. When starting or continuing a work package, first assign a sub-agent to
   review the most recently executed package on the same sprint or owner
   boundary.
7. If that review finds stale status, incomplete closure, missing residual
   split, guardrail drift, evidence mismatch, or package-snapshot
   inconsistency, assign the next sub-agent to fix those findings before
   implementation of the new package starts.
8. Assign the implementation sub-agent for the current package only after the
   previous-package review is clean or the review findings have been fixed.
9. Parallel sub-agents are allowed only for independent sidecar questions with
   disjoint owner or file scope.
10. The main package owner must reconcile sub-agent results into one package
   status update rather than creating parallel status narratives.
11. Parent-session notes, local/manual session labels, and arbitrary text
    without a real agent id do not satisfy review, fix, or implementation
    roles unless the user explicitly disables sub-agents for that task.

## Audit Procedure

Use these repository-root checks to confirm the steering stack still has one
doctrine path and one owning document per rule class:

```sh
rg -n --glob '*.md' '`doctrine\\.md`' .kiro/steering
rg -n --glob '*.md' '\\.kiro/steering/doctrine\\.md' .kiro/steering
rg -n --glob '*.md' '^## Document Role$' .kiro/steering
```

Expected result:

1. Short-name doctrine references return zero hits in steering Markdown.
2. Canonical `.kiro/steering/doctrine.md` references remain.
3. Every steering Markdown file carries a `Document Role` header.
