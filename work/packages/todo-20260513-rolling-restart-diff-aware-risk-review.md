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
  "currentState": "Executed the dirty-diff review on May 13, 2026. `npm run work:dirty-scope` reports 44 dirty entries: 23 current-blocker package-owned entries under `startup_active_gate_owner / snapshot_coverage`, no tracker-generated entries, and 21 unrelated entries. After removing sprint metadata/package-status cleanup from the unrelated bucket, 14 runtime/test files remain split-required before a representative full rolling-restart rerun can be trusted.",
  "nextAction": "Do not run the full rolling-restart gate from this mixed diff. Continue only focused proof until the active startup package is committed and the unrelated control-plane, node, rebalancer, and failure-bundle edits are split into their own package or explicitly admitted by the human.",
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

## Risk Ledger

Executed on May 13, 2026.

| Class | Dirty entries | Decision |
| --- | ---: | --- |
| `package-owned` | 23 | Owned by `work/packages/active-20260513-rolling-restart-green-gate-workflow-progress-recovery.md`; keep focused proof there and do not commit from this package. |
| `sprint-owned` | 7 | Metadata/package-status cleanup from this sprint: moved latest-artifact refresh to `done`, moved two priority-recovery packages to `superseded`, and updated package references. Safe to commit with this package as package-status cleanup. |
| `tracker-generated` | 0 | No generated tracker entries in this review. |
| `split-required` | 14 | Runtime/test edits in control-plane, node, rebalancer, and failure-bundle files are outside the active startup package and outside this review package. |
| `blocking-risk` | 37 runtime/test entries | Full `rolling-restart` would run over both current active-package changes and unrelated runtime/test changes, so a representative rerun would not isolate causality. |

Split-required files:

1. `src/control-plane/replica-dispatch-service-segment-1.js`
2. `src/control-plane/replica-dispatch-service-segment-2.js`
3. `src/control-plane/replica-dispatch-service-segment-4.js`
4. `src/node/replica-handler-class-part-1.js`
5. `src/rebalancer/operation-workflow-owner-segment-4.js`
6. `src/rebalancer/operation-workflow-owner-segment-7-stage-3.js`
7. `src/rebalancer/operation-workflow-owner-segment-7-stage-shared.js`
8. `src/rebalancer/replica-operation-constants.js`
9. `src/rebalancer/unified-rebalancer-segment-4-stage-3.js`
10. `test/control-plane/replica-dispatch-node-state-update.test-part-2.js`
11. `test/distributed/harness/__tests__/failure-bundle-core-16-test-cases.js`
12. `test/distributed/harness/failure-bundle-segment-4.js`
13. `test/rebalancer/priority-follow-up-target-readiness.test.js`
14. `test/rebalancer/rebalance-coordinator-outcome-routing.test.js`

Successor decision: the package-owned path remains the active startup package;
the split-required files need a separate owner-boundary package or explicit
human admission before the final green-gate confirmation package can run.

## Execution Notes

1. `npm run work:dirty-scope` reported 44 dirty entries, including 23 current
   active-package entries and no tracker-generated entries.
2. `git status --short` confirmed broad runtime/test changes plus sprint
   package-status cleanup.
3. `git diff --stat` showed 42 changed tracked files with broad bootstrap,
   diagnostics, control-plane, rebalancer, test, and package metadata churn.
4. `git diff --check` passed with no whitespace errors.

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
