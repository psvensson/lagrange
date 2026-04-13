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

Use rename, not copy, when state changes.

Examples:

- `idea-20260409-control-plane-simplification.md`
- `todo-20260409-control-plane-simplification.md`
- `active-20260409-control-plane-simplification.md`
- `done-20260409-control-plane-simplification.md`

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

If the work package cannot answer those clearly, it is still an idea, not a
package.

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
