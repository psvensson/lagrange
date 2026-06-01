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
  - Optional grouping documents that collect several packages into one focused
    push.
- `work/templates/`
  - Templates for ideas and work packages.

## Recommended Workflow

Use one simple path:

1. Capture the human idea.
2. Triage it.
3. Either sharpen `roadmap.md` first or create a direct work package.
4. Work the package until done.
5. Rename the file to mark completion.
6. Commit and push the focused package slice before starting the next slice.

## Useful Commands

1. `npm run work:context` prints the active package handoff, first-read files,
   proof ladder, useful commands, and dirty worktree summary.
2. `npm run work:dirty-scope` prints dirty worktree entries grouped as
   package-owned, tracker-generated, or unrelated.
3. `npm run work:model-ledger -- summary` prints recent model, reasoning
   effort, task class, outcome, validation, correction-loop, and
   review-finding signals.
4. `npm run work:model-ledger -- record ...` appends package experience to
   `work/model-ledger.jsonl`.
5. `npm run work:validate` checks work-package metadata and closure proof.
6. `npm run work:current-blocker` writes compact current-blocker handoff files
   under `work/sprints/`.
7. `npm run commands` lists discoverable project commands.

## Model Ledger

The model ledger is advisory. It helps future agents choose a model and
reasoning effort, but it never replaces validation, review, sequencing, closure
proof, or focused commits.

Example:

```bash
npm run work:model-ledger -- record \
  --package work/packages/active-YYYYMMDD-slug.md \
  --model gpt-5-codex \
  --reasoning-effort medium \
  --task-class workflow-tooling \
  --outcome success \
  --validation-status passed \
  --correction-loops 0 \
  --review-findings 0 \
  --notes "short package-specific note"
```

## Filename State Model

Keep the filename state model intentionally small:

1. `idea-YYYYMMDD-slug.md`
2. `todo-YYYYMMDD-slug.md`
3. `active-YYYYMMDD-slug.md`
4. `done-YYYYMMDD-slug.md`
5. `superseded-YYYYMMDD-slug.md`

Use rename, not copy, when state changes.

## Package Metadata

Every active package should start with a machine-readable metadata comment:

```md
<!-- work-package
{
  "schema": "work-package-v1",
  "status": "active",
  "opened": "YYYY-MM-DD",
  "scenario": "scenario-or-none",
  "artifact": "path/to/latest-artifact-or-none",
  "playback": "path/to/replay-or-none",
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

The header makes handoff and automation reliable. The prose body remains the
source for reasoning, context, and checklist detail.

## Package Checklist Expectations

Every package should answer:

1. Why this work exists.
2. Which roadmap row or approved scope it belongs to.
3. What is in scope.
4. What is out of scope.
5. What invariants must not regress.
6. What files or subsystems are expected hotspots.
7. What tests and validation are required.
8. What counts as done.
9. What residual closure remains after the hot-path fix.
10. Which static guardrails apply.

## Commit And Push Ledger

Closed metadata-bearing packages should prove the focused package slice was
committed and pushed:

1. `Focused package commit: <sha>`
2. `Pushed to: <remote>/<branch>`
3. `Commit contains only package-owned files/package-status/allowed sprint handoff: yes`

Do not backfill proof by invention. If a package is reopened, migrated, or
closed again, current proof rules apply.
