# Rolling Restart Diff Aware Risk Review

<!-- work-package
{
  "schema": "work-package-v1",
  "status": "todo",
  "opened": "2026-05-13",
  "lane": "read-review-doc-only",
  "scenario": "rolling-restart",
  "artifact": "test-output/reports/rolling-restart-green-gate-after-dispatch-retry-recovery-readiness.report.json",
  "playback": "none",
  "owner": "workflow_tooling_owner",
  "boundary": "dirty_diff_risk_review",
  "dominantReason": "broad_dirty_runtime_diff_before_release_gate",
  "currentState": "The worktree contains broad runtime and test changes across bootstrap, control-plane, diagnostics, rebalancer, and fixtures. Before another full rolling-restart run, the sprint needs a recorded diff-aware review that separates package-owned changes from unrelated or risky work.",
  "nextAction": "Review dirty files against the active package and this sprint queue, classify each changed file as package-owned, generated, unrelated, or blocking-risk, and split or stop before full scenario execution if ownership is mixed.",
  "proof": [
    "npm run work:dirty-scope",
    "git status --short",
    "git diff --stat",
    "git diff --check",
    "npm run work:validate -- --entry work/packages/todo-20260513-rolling-restart-diff-aware-risk-review.md"
  ],
  "writeScope": [
    "work/packages/todo-20260513-rolling-restart-diff-aware-risk-review.md",
    "work/sprints/todo-2026-q2-rolling-restart-llm-preflight-and-code-risk-closure.md"
  ],
  "handoffFiles": [
    "work/packages/active-20260513-rolling-restart-green-gate-workflow-progress-recovery.md",
    "work/sprints/current-blocker.md",
    "work/sprints/current-blocker.json"
  ],
  "generatedFiles": [],
  "candidateRuntimeFiles": [],
  "commitScope": [
    "work/packages/todo-20260513-rolling-restart-diff-aware-risk-review.md",
    "work/sprints/todo-2026-q2-rolling-restart-llm-preflight-and-code-risk-closure.md"
  ],
  "modelFit": {
    "packageClass": "release-gate-risk-review",
    "intendedMinimumModel": "gpt-5.3-codex",
    "scopeShape": "dirty-diff-review/no-runtime-edits",
    "escalationTriggers": [
      "dirty package-owned and unrelated changes cannot be separated safely",
      "the review finds a runtime regression that must be fixed before rerun",
      "the review requires editing runtime or tests"
    ]
  }
}
-->

## Why

The diff-aware recommendation is not complete until today’s broad dirty worktree
is reviewed against package ownership. A full release-gate rerun with mixed
changes can hide whether a fix helped or whether an unrelated edit moved the
failure.

## Scope Basis

Read/review package under `work/`. This package records risk and split
decisions only.

## Workflow Lane

- Selected lane: `read-review-doc-only`
- Why this lane is sufficient: the package reviews and records diff ownership
  without editing runtime files.
- Escalation trigger to a heavier lane: a concrete runtime/test fix is required
  before rerun.

## Required Review Table

The executed package must classify each dirty entry into one of:

1. `package-owned`
2. `sprint-owned`
3. `tracker-generated`
4. `unrelated-ignore`
5. `blocking-risk`
6. `split-required`

For `blocking-risk` and `split-required`, the package must name the exact
successor package or ask the human before continuing.

## In Scope

1. Dirty scope report.
2. Diff stat and diff check.
3. Risk ledger inside this package.
4. Sprint/package activation notes for split-required findings.

## Out Of Scope

1. Runtime source edits.
2. Test implementation.
3. Reverting user changes.
4. Full distributed rerun.

## Model Fit

- Package class: `release-gate-risk-review`
- Intended minimum model: `gpt-5.3-codex`
- Scope shape: `dirty-diff-review/no-runtime-edits`
- Owned files: this package and the new sprint file
- Forbidden files: `src/`, `test/`, report artifacts
- Frozen decisions: review does not modify runtime; it only blocks, splits, or
  clears risk.
- Escalation triggers: mixed ownership cannot be separated, runtime regression
  found, or edit required.
- Focused proof: dirty scope, git status/stat, diff check, entry validation.

## Validation

1. `npm run work:package:doctor -- --suggest work/packages/todo-20260513-rolling-restart-diff-aware-risk-review.md`
2. `npm run work:validate -- --entry work/packages/todo-20260513-rolling-restart-diff-aware-risk-review.md`
3. `git diff --check -- work/packages/todo-20260513-rolling-restart-diff-aware-risk-review.md work/sprints/todo-2026-q2-rolling-restart-llm-preflight-and-code-risk-closure.md`
