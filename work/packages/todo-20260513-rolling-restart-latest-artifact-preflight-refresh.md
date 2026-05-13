# Rolling Restart Latest Artifact Preflight Refresh

<!-- work-package
{
  "schema": "work-package-v1",
  "status": "todo",
  "opened": "2026-05-13",
  "lane": "read-review-doc-only",
  "scenario": "rolling-restart",
  "artifact": "test-output/reports/rolling-restart-green-gate-after-dispatch-retry-recovery-readiness.report.json",
  "playback": "none",
  "owner": "diagnostics_owner",
  "boundary": "latest_artifact_preflight",
  "dominantReason": "active_handoff_stale_against_latest_artifact",
  "currentState": "The latest known rolling-restart artifact differs from the older current-blocker handoff: canonical evidence now promotes active_gate_snapshot_coverage under startup_active_gate_owner / snapshot_coverage, while one priority-recovery residual extractor still reports a single operation_workflow_owner / workflow_progress witness and the causal graph still carries a priority_recovery:event_driven wait.",
  "nextAction": "Refresh the preflight baseline to the newest rolling-restart artifact, run canonical extractors, and record whether priority recovery is actionable, stale/subordinate, or superseded by active-gate snapshot coverage before any runtime implementation starts.",
  "proof": [
    "npm run work:context",
    "npm run work:llm-start",
    "npm run work:evidence-summary -- test-output/reports/rolling-restart-green-gate-after-dispatch-retry-recovery-readiness.report.json",
    "npm run analyze:priority-recovery-residuals -- test-output/reports/rolling-restart-green-gate-after-dispatch-retry-recovery-readiness.report.json --markdown",
    "npm run analyze:topology-convergence -- test-output/reports/rolling-restart-green-gate-after-dispatch-retry-recovery-readiness.report.json --explain priority_recovery_partition_progress",
    "npm run analyze:topology-convergence -- test-output/reports/rolling-restart-green-gate-after-dispatch-retry-recovery-readiness.report.json --explain active_gate_snapshot_coverage",
    "npm --silent run analyze:causal-model -- test-output/reports/rolling-restart-green-gate-after-dispatch-retry-recovery-readiness.report.json",
    "npm run analyze:distributed-failure -- --report test-output/reports/rolling-restart-green-gate-after-dispatch-retry-recovery-readiness.report.json",
    "npm run work:validate -- --entry work/packages/todo-20260513-rolling-restart-latest-artifact-preflight-refresh.md"
  ],
  "writeScope": [
    "work/packages/todo-20260513-rolling-restart-latest-artifact-preflight-refresh.md",
    "work/sprints/todo-2026-q2-rolling-restart-llm-preflight-and-code-risk-closure.md"
  ],
  "handoffFiles": [
    "work/packages/active-20260513-rolling-restart-green-gate-workflow-progress-recovery.md",
    "work/sprints/active-2026-q2-phase-0-1-rolling-restart-release-gate-closure.md",
    "test-output/reports/rolling-restart-green-gate-after-dispatch-retry-recovery-readiness.report.json"
  ],
  "generatedFiles": [],
  "candidateRuntimeFiles": [],
  "commitScope": [
    "work/packages/todo-20260513-rolling-restart-latest-artifact-preflight-refresh.md",
    "work/sprints/todo-2026-q2-rolling-restart-llm-preflight-and-code-risk-closure.md"
  ],
  "modelFit": {
    "packageClass": "representative-frontier-classification",
    "intendedMinimumModel": "gpt-5.3-codex",
    "scopeShape": "latest-artifact-preflight/no-runtime-edits",
    "escalationTriggers": [
      "canonical extractors disagree on the first frontier after refresh",
      "fresh evidence points to a runtime owner package",
      "raw JSON is needed because canonical extractors are insufficient"
    ]
  },
  "causalGovernance": {
    "hypothesis": "If the latest artifact has promoted active_gate_snapshot_coverage, preflight must prevent stale priority-recovery handoff data from driving another workflow-progress runtime package.",
    "stopConditionCheck": "Run evidence-summary, priority-recovery residuals, topology explain for priority recovery and active gate, npm run analyze:causal-model, and distributed-failure on the latest artifact.",
    "expectedCausalModelChange": "No runtime change in this package; expected result is a durable activation decision for the next package.",
    "representativeOutcome": "pending-before-rerun",
    "causalDebt": "The representative gate remains red until a later runtime or scenario package addresses the current owner boundary.",
    "crossBoundaryReview": "When executed, record whether priority recovery, active-gate snapshot coverage, or diagnostics projection owns the next package."
  }
}
-->

## Why

The active handoff can become stale faster than the artifact history. This
package prevents the sprint from implementing a fix for the wrong owner.

The seeded artifact currently has a mixed shape: topology says active-gate
snapshot coverage is first, priority recovery topology explain says satisfied,
residual extraction still reports one priority-recovery witness, and the causal
graph still shows a priority-recovery event-driven wait. That discrepancy must
be resolved before runtime work.

## Scope Basis

Read/review execution package under the active `rolling-restart` release-gate
scope. It writes only package/sprint handoff truth.

## Workflow Lane

- Selected lane: `read-review-doc-only`
- Why this lane is sufficient: it classifies latest evidence and selects the
  next package without editing runtime code.
- Escalation trigger to a heavier lane: the package starts changing runtime
  projection, diagnostics, owner state, tests, or representative artifacts.

## Required Decision

This package must end with one of these decisions:

1. `priority-recovery-actionable`: activate the operation-progress state machine
   and wake/retry packages.
2. `priority-recovery-stale-or-subordinate`: activate owner-boundary
   consistency and fixture synthesis.
3. `active-gate-first-frontier`: activate or create a
   `startup_active_gate_owner / snapshot_coverage` runtime package.
4. `contradictory-evidence`: stop and create a diagnostics projection package
   before runtime implementation.

## In Scope

1. Refresh the artifact pointer to the newest rolling-restart report.
2. Run canonical extractors and record the exact outputs needed by the sprint.
3. Update this package and the sprint with the activation decision.

## Out Of Scope

1. Runtime source edits.
2. Test implementation.
3. Full distributed rerun.
4. Closing the active release-gate sprint.

## Model Fit

- Package class: `representative-frontier-classification`
- Intended minimum model: `gpt-5.3-codex`
- Scope shape: `latest-artifact-preflight/no-runtime-edits`
- Owned files: this package and the new sprint file
- Forbidden files: `src/`, `test/`, report artifacts
- Frozen decisions: the package can choose the next package but cannot make the
  runtime fix itself.
- Escalation triggers: extractor disagreement, runtime owner activation, or raw
  JSON fallback.
- Focused proof: the canonical extractor ladder in metadata.

## Validation

1. `npm run work:package:doctor -- --suggest work/packages/todo-20260513-rolling-restart-latest-artifact-preflight-refresh.md`
2. `npm run work:validate -- --entry work/packages/todo-20260513-rolling-restart-latest-artifact-preflight-refresh.md`
3. `git diff --check -- work/packages/todo-20260513-rolling-restart-latest-artifact-preflight-refresh.md work/sprints/todo-2026-q2-rolling-restart-llm-preflight-and-code-risk-closure.md`
