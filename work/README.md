# Work Tracking

`docs/` is reserved for end-user or operator-facing documentation.

Internal execution planning, work packages, and sprint tracking live under
`work/`.

## Directory Layout

- `work/ideas/`
  - Human ideas before they are approved for implementation work.
- `work/packages/`
  - Actionable work packages that can be executed end to end.
- `work/sprints/`
  - Optional grouping documents that collect several active work packages into
    one focused push.
- `work/templates/`
  - Templates for ideas and work packages.

## Recommended Workflow

Use one simple path:

1. Capture the human idea.
2. Triage it.
3. Either sharpen `roadmap.md` first or create a direct work package.
4. Work the package until done.
5. Rename the file to mark completion.

## Triage Rule

An idea must become a `roadmap.md` item first when it does any of these:

1. Adds a new feature area.
2. Changes product scope or user-facing direction.
3. Commits the repository to a new multi-step implementation track.
4. Is too broad to execute safely as one bounded package.

An idea may become a direct work package when it is already within approved
scope and is one of:

1. Bug fixing.
2. Refactoring or simplification.
3. Reliability or performance work.
4. Test harness stabilization.
5. Architecture cleanup within an already-approved roadmap area.

Direct work packages must still cite the roadmap row or existing subsystem they
belong to.

## Filename State Model

Keep the filename state model intentionally small:

1. `idea-YYYYMMDD-slug.md`
2. `todo-YYYYMMDD-slug.md`
3. `active-YYYYMMDD-slug.md`
4. `done-YYYYMMDD-slug.md`
5. `superseded-YYYYMMDD-slug.md`

Use rename, not copy, when state changes.

Examples:

- `idea-20260409-control-plane-simplification.md`
- `todo-20260409-control-plane-simplification.md`
- `active-20260409-control-plane-simplification.md`
- `done-20260409-control-plane-simplification.md`
- `superseded-20260409-control-plane-simplification.md`

Do not create parallel status systems in both directory names and filenames.
The filename is the status.

## Package Rules

Every work package should answer:

1. Why this work exists.
2. Which roadmap row or approved scope it belongs to.
3. What is in scope.
4. What is out of scope.
5. What invariants must not regress.
6. What files or subsystems are expected hotspots.
7. What tests and validation are required.
8. What counts as done.
9. If it adds or reshapes a shared runtime boundary:
   - who owns the boundary
   - what the canonical contract shape or vocabulary is
   - which consumers may use it
   - which reinterpretations are forbidden
10. What residual closure remains after the hot-path fix:
   - owner-path cutovers
   - tail consumers
   - diagnostics, admin, or report surfaces
   - superseded paths or vocabulary to delete
11. If the package is driven by a failing scenario:
   - what the current dominant blocker is
   - what probe or scenario will confirm the next-order blocker after each fix
   - where blocker migration will be recorded if the failure moves
12. If the package touches lifecycle, readiness, admission, recovery, or
    convergence behavior:
   - what the shared progress grammar is
   - what blocked, deferred, retryable, terminal, and ready mean
   - which surfaces are allowed to expose that grammar directly
13. If the package touches runtime, control-plane, harness, diagnostics, admin,
    shared test infrastructure, or broad refactor boundaries:
   - which static guardrails apply
   - what the preflight baseline is
   - what inherited touched-file debt is in or out of scope
   - what after-state proves no drift increased

Package closure also requires one final deep dive across the affected area:

1. read the touched files and their direct owner collaborators as one boundary
2. look for mistakes, irregularities, and doctrine/system-guideline violations
3. fix any discovered issue that falls inside the affected area before renaming
   the package to `done-...`
4. if the package was driven by a failing scenario, rerun the reference
   scenario or blocker probe and record any blocker migration before closure
5. rerun the same static guardrails recorded in the package preflight and
   confirm no relevant count increased

If the work package cannot answer those clearly, it is still an idea, not a
package.

Shared-boundary work is not done when only the implementation changes land.
The package should update the relevant architecture record and any bounded
static guardrail in the same work cycle when the boundary contract is durable.

## Sprint Use

`work/sprints/` is optional.

Use a sprint file only when several active work packages must be coordinated.
The sprint file should link packages; it should not replace them.

Recommended naming:

- `active-2026-q2-control-plane-stability.md`
- `done-2026-q2-control-plane-stability.md`

## Simplicity Rule

Do not let the work-tracking system become complicated.

Prefer:

1. One idea file per idea.
2. One work package per executable concern.
3. One filename status.
4. One sprint file only when grouping adds real value.

Avoid:

1. Multiple backlog systems.
2. Separate status fields and filename states that can drift.
3. Large umbrella packages spanning unrelated concerns.
4. Sprint docs that contain detailed execution steps better owned by packages.
