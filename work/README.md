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

Use the tracker utility for current sprint/package mechanics:

1. `npm run work:current-blocker` regenerates the compact current-blocker
   handoff files from the active package metadata.
2. `npm run work:context` prints a compact human and LLM handoff with the
   current blocker, first-read files, proof ladder, useful commands, and dirty
   worktree summary.
3. `npm run work:validate` checks active and metadata-bearing packages for
   filename/header drift and stale open checklist items.
4. `npm run work:package:close -- --write work/packages/active-...md` renames a
   package to `done-...` only after open checklist items are closed.
5. `npm run work:package:migrate -- --write work/packages/active-...md`
   `work/packages/active-successor.md` performs the same closure gate while
   recording a successor handoff.
6. `npm run work:package:move -- --write work/packages/todo-...md --to active`
   performs non-terminal state moves.
7. After each completed package slice, create one focused git commit containing
   only that slice's package-owned changes and push the current branch before
   starting the next slice.
8. If the slice cannot be pushed because the remote or credentials are
   unavailable, record the unpushed commit SHA and reason in the package or
   sprint handoff. If package-owned and unrelated dirty changes cannot be
   separated safely, stop for human direction instead of committing a mixed
   slice.

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

Every active package should start with a machine-readable metadata comment:

```md
<!-- work-package
{
  "schema": "work-package-v1",
  "status": "active",
  "opened": "YYYY-MM-DD",
  "scenario": "scenario-or-none",
  "artifact": "path/to/latest.report.json",
  "playback": "path/to/playback-or-none",
  "owner": "canonical owner",
  "boundary": "current boundary",
  "dominantReason": "current dominant reason",
  "currentState": "one-line current state",
  "nextAction": "next proof or implementation action",
  "proof": [
    "Focused owner test",
    "Representative scenario rerun"
  ],
  "touchedFiles": [
    "src/example.js",
    "test/example.test.js"
  ],
  "predecessor": "work/packages/done-predecessor.md"
}
-->
```

The header exists to make handoff and automation reliable. The prose package
body remains the source for reasoning, context, and the checklist.

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
14. If the package has accumulated repeated blocker migrations:
    - which single current blocker remains active
    - which historical migrations are evidence only
    - whether the next step is a contraction package instead of another broad
      patch
    - what replayable owner-decision fixture or blocker probe represents the
      current blocker

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

When a scenario-driven package crosses two material blocker migrations, prefer
splitting a new contraction package over continuing to edit the historical
package. The contraction package should carry only the current owner,
boundary, fixture or probe, touched files, and proof ladder. The older package
may stay queued as history or later re-entry work.

Shared-boundary work is not done when only the implementation changes land.
The package should update the relevant architecture record and any bounded
static guardrail in the same work cycle when the boundary contract is durable.

## Package Commit And Push

A completed package slice is not closed until its package-owned changes are in
a focused git commit and that commit has been pushed.

Required workflow:

1. Finish validation, static guardrails, residual closure, and the deep-dive
   review first.
2. Rename or migrate the work package with the tracker command.
3. Review the dirty worktree and separate unrelated changes.
4. Commit only the package-owned files, package-status updates, and sprint
   handoff updates for the slice.
5. Push the current branch before starting the next package slice.
6. If push is blocked by remote or credential state, record the unpushed commit
   SHA and reason in the package or sprint handoff.
7. If unrelated dirty changes cannot be safely separated from package-owned
   files, stop and ask for human direction before committing.

## Sprint Use

`work/sprints/` is optional.

Use a sprint file only when several active work packages must be coordinated.
The sprint file should link packages; it should not replace them.

Scenario-driven active sprints should keep their newest compact handoff in:

1. `work/sprints/current-blocker.json`
2. `work/sprints/current-blocker.md`

These files are generated from the active package metadata by
`npm run work:current-blocker`. Keep long migration narratives in package
history or archived sprint notes; the current-blocker files are the starting
point for humans and LLM agents.

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

## Size Ratchet

Implementation speed depends on keeping owner files small enough to inspect.

Use `npm run audit:file-size` to keep the current inherited large-file count
from increasing. The ratchet uses these thresholds:

1. production JavaScript files over `800` lines
2. test JavaScript files over `1200` lines

Use `npm run audit:file-size:strict` when a package explicitly owns file-size
cleanup and should fail on any remaining oversized file.

## Scoped Static Ratchets

Use scoped ratchets during focused work when the repo-wide complexity output is
too large to be useful:

1. `npm run test:complexity:scoped -- <files...>` reports cyclomatic
   complexity only for the named files or directories.
2. `npm run test:complexity:cognitive:scoped -- <files...>` reports cognitive
   complexity only for the named files or directories.
3. `npm run test:metrics:scoped -- <files...>` runs both scoped complexity
   ratchets and writes compact reports under `test-output/analysis/`.
4. Add `:strict` to fail on any scoped violation, for example
   `npm run test:metrics:scoped:strict -- <files...>`.

The default scoped commands do not fail on inherited local debt; use them to
record before/after counts in the package static drift ledger. Strict scoped
commands are for cleanup packages or touched boundaries expected to be clean.
