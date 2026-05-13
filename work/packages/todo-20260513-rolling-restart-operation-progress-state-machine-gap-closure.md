# Rolling Restart Operation Progress State Machine Gap Closure

<!-- work-package
{
  "schema": "work-package-v1",
  "status": "todo",
  "opened": "2026-05-13",
  "lane": "runtime-owner-boundary",
  "scenario": "rolling-restart",
  "artifact": "test-output/reports/rolling-restart-green-gate-after-dispatch-retry-recovery-readiness.report.json",
  "playback": "none",
  "owner": "operation_workflow_owner",
  "boundary": "workflow_progress_state_machine",
  "dominantReason": "priority_recovery_event_driven_wait_state_gap",
  "currentState": "This package is conditional on the latest preflight proving that priority-recovery workflow progress is still actionable. If actionable, the operation workflow owner must expose one explicit state model for spread-satisfied in-flight, dispatched-waiting-progress, wait-for-operation-progress, retry, timeout, reconcile, completion, and bounded owner migration.",
  "nextAction": "Review the operation-progress state machine against the latest preflight decision; repair any missing transition or close with no runtime change only if priority recovery is proven stale, subordinate, or already covered by focused tests.",
  "proof": [
    "npm run work:subagent-prompt -- --role review --package work/packages/todo-20260513-rolling-restart-operation-progress-state-machine-gap-closure.md",
    "npm run analyze:owner-files -- operation_workflow_owner workflow_progress",
    "npm run work:evidence-summary -- test-output/reports/rolling-restart-green-gate-after-dispatch-retry-recovery-readiness.report.json",
    "npm run analyze:priority-recovery-residuals -- test-output/reports/rolling-restart-green-gate-after-dispatch-retry-recovery-readiness.report.json --markdown",
    "npm test -- test/rebalancer/coordinator-created-operation-progress-remote-handoff.test.js test/rebalancer/priority-recovery-dispatch-pending-timeout-reentry.test.js test/rebalancer/operation-workflow-progress-event-driven-reentry.test.js",
    "node scripts/check-guideline-literals.js src/rebalancer/operation-workflow-owner-segment-7-stage-3.js src/rebalancer/operation-workflow-owner-segment-7-stage-shared.js src/rebalancer/operation-workflow-owner-segment-4.js src/rebalancer/replica-operation-constants.js",
    "node scripts/check-guideline-decision-boundaries.js src/rebalancer/operation-workflow-owner-segment-7-stage-3.js src/rebalancer/operation-workflow-owner-segment-7-stage-shared.js src/rebalancer/operation-workflow-owner-segment-4.js src/rebalancer/replica-operation-constants.js",
    "npm run audit:runtime-grammar:file -- src/rebalancer/operation-workflow-owner-segment-7-stage-3.js src/rebalancer/operation-workflow-owner-segment-7-stage-shared.js src/rebalancer/operation-workflow-owner-segment-4.js src/rebalancer/replica-operation-constants.js",
    "npm run work:validate -- --closure work/packages/todo-20260513-rolling-restart-operation-progress-state-machine-gap-closure.md"
  ],
  "writeScope": [
    "work/packages/todo-20260513-rolling-restart-operation-progress-state-machine-gap-closure.md",
    "work/sprints/todo-2026-q2-rolling-restart-llm-preflight-and-code-risk-closure.md",
    "src/rebalancer/operation-workflow-owner-segment-7-stage-3.js",
    "src/rebalancer/operation-workflow-owner-segment-7-stage-shared.js",
    "src/rebalancer/operation-workflow-owner-segment-4.js",
    "src/rebalancer/replica-operation-constants.js",
    "test/rebalancer/coordinator-created-operation-progress-remote-handoff.test.js",
    "test/rebalancer/priority-recovery-dispatch-pending-timeout-reentry.test.js",
    "test/rebalancer/operation-workflow-progress-event-driven-reentry.test.js"
  ],
  "handoffFiles": [
    "work/packages/todo-20260513-rolling-restart-latest-artifact-preflight-refresh.md",
    "work/packages/todo-20260513-rolling-restart-owner-boundary-consistency-closure.md",
    "test-output/reports/rolling-restart-green-gate-after-dispatch-retry-recovery-readiness.report.json"
  ],
  "generatedFiles": [],
  "candidateRuntimeFiles": [
    "src/rebalancer/operation-workflow-owner-segment-7-stage-3.js",
    "src/rebalancer/operation-workflow-owner-segment-7-stage-shared.js",
    "src/rebalancer/operation-workflow-owner-segment-4.js",
    "src/rebalancer/replica-operation-constants.js"
  ],
  "commitScope": [
    "work/packages/todo-20260513-rolling-restart-operation-progress-state-machine-gap-closure.md",
    "work/sprints/todo-2026-q2-rolling-restart-llm-preflight-and-code-risk-closure.md",
    "src/rebalancer/operation-workflow-owner-segment-7-stage-3.js",
    "src/rebalancer/operation-workflow-owner-segment-7-stage-shared.js",
    "src/rebalancer/operation-workflow-owner-segment-4.js",
    "src/rebalancer/replica-operation-constants.js",
    "test/rebalancer/coordinator-created-operation-progress-remote-handoff.test.js",
    "test/rebalancer/priority-recovery-dispatch-pending-timeout-reentry.test.js",
    "test/rebalancer/operation-workflow-progress-event-driven-reentry.test.js"
  ],
  "modelFit": {
    "packageClass": "representative-frontier-closure",
    "intendedMinimumModel": "gpt-5.3-codex",
    "scopeShape": "owner-boundary-state-machine/current-frontier",
    "escalationTriggers": [
      "latest preflight proves active-gate snapshot coverage is the first actionable owner",
      "the state transition requires control-plane dispatch changes",
      "the fix needs diagnostics projection changes instead of workflow-owner state changes"
    ]
  },
  "causalGovernance": {
    "hypothesis": "If priority recovery remains actionable, every operation-progress state must have exactly one owner-owned entry condition, progress signal, retry or wake path, timeout or migration path, and terminal outcome.",
    "stopConditionCheck": "Run npm run analyze:causal-model on the latest artifact, focused operation workflow owner tests, and static guardrails after any state-machine change.",
    "expectedCausalModelChange": "Priority-recovery waits either disappear, become bounded under the owner state model, or migrate with fresh evidence.",
    "representativeOutcome": "pending-before-rerun",
    "causalDebt": "The representative gate remains red until focused owner proof and final scenario confirmation run.",
    "crossBoundaryReview": "Requires runtime-owner-boundary review/fix/implementation sequencing when activated."
  }
}
-->

## Why

The state-machine recommendation is complete only when every relevant state has
an owned transition. If preflight proves priority recovery is stale or
subordinate, this package closes by recording that proof and must not edit
runtime files.

## Scope Basis

Runtime owner-boundary work for `operation_workflow_owner` only, conditional on
fresh preflight evidence.

## Workflow Lane

- Selected lane: `runtime-owner-boundary`
- Why this lane is required: it can change owner runtime state transitions.
- Escalation trigger: active-gate snapshot coverage is first actionable owner,
  or the required fix is in diagnostics/control-plane rather than operation
  workflow.

## State Table To Complete

The implementation must create or verify a table covering:

1. `needs_operation`
2. `operation_created`
3. `handoff_pending`
4. `handoff_acknowledged`
5. `dispatch_pending`
6. `dispatched_waiting_progress`
7. `spread_satisfied_in_flight`
8. `wait_for_operation_progress`
9. `retry_scheduled`
10. `timeout_reconcile_due`
11. `completed`
12. `terminal_failed`
13. bounded owner migration

Each row must name entry condition, progress signal, retry/wake path,
timeout/migration path, owner module, diagnostics projection, and focused test.

## Subagent Sequencing Requirement

When activated, run runtime-owner-boundary review, fix if needed, and
implementation subagents before closure. The implementation subagent owns only
the files in `writeScope`.

## In Scope

1. Operation workflow owner state normalization.
2. Priority-recovery state constants.
3. Focused operation workflow owner tests.
4. Static guardrail proof on touched runtime files.

## Out Of Scope

1. Active-gate snapshot coverage implementation.
2. Diagnostics projection repairs unless this package is superseded.
3. Control-plane wake delivery implementation unless delegated to the wake/retry
   package.
4. Full scenario rerun before focused tests pass.

## Model Fit

- Package class: `representative-frontier-closure`
- Intended minimum model: `gpt-5.3-codex`
- Scope shape: `owner-boundary-state-machine/current-frontier`
- Owned files: metadata `writeScope`
- Forbidden files: startup active-gate runtime, diagnostics projection, and
  broad bootstrap files unless a successor package changes scope.
- Frozen decisions: one state outcome must come from one owner decision table.
- Escalation triggers: preflight selects active-gate, control-plane wake is the
  missing edge, or projection is the true issue.
- Focused proof: owner tests, guideline checks, runtime grammar audit.

## Validation

1. `npm run work:package:doctor -- --suggest work/packages/todo-20260513-rolling-restart-operation-progress-state-machine-gap-closure.md`
2. `npm run work:validate -- --entry work/packages/todo-20260513-rolling-restart-operation-progress-state-machine-gap-closure.md`
3. Before closure, run metadata proof ladder and closure validation.
