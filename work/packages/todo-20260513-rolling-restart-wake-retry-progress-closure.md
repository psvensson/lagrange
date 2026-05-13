# Rolling Restart Wake Retry Progress Closure

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
  "boundary": "wake_retry_progress",
  "dominantReason": "dispatched_waiting_progress_without_effective_trigger",
  "currentState": "This package is conditional on preflight and state-machine review proving a real operation-workflow wait remains. If actionable, the remaining event-driven wait must have a bounded wake, delivery, progress-event, retry, timeout, or reconcile trigger that is owned by operation_workflow_owner and backed by ReplicaDispatchService transport proof.",
  "nextAction": "Trace dispatch to target/source observation, progress event emission, workflow owner consumption, retry, timeout, and reconcile; implement only the missing bounded trigger if the latest preflight proves the wait is real.",
  "proof": [
    "npm run work:subagent-prompt -- --role review --package work/packages/todo-20260513-rolling-restart-wake-retry-progress-closure.md",
    "npm run analyze:owner-files -- operation_workflow_owner workflow_progress",
    "npm run analyze:priority-recovery-residuals -- test-output/reports/rolling-restart-green-gate-after-dispatch-retry-recovery-readiness.report.json --markdown",
    "npm test -- test/rebalancer/priority-recovery-dispatch-pending-timeout-reentry.test.js test/rebalancer/operation-workflow-progress-event-driven-reentry.test.js",
    "node --test test/control-plane/replica-dispatch-node-state-update.test-part-2.js",
    "node scripts/check-guideline-literals.js src/control-plane/replica-dispatch-service-segment-1.js src/control-plane/replica-dispatch-service-segment-2.js src/control-plane/replica-dispatch-service-segment-4.js src/rebalancer/operation-workflow-owner-segment-7-stage-3.js src/rebalancer/operation-workflow-owner-segment-7-stage-shared.js",
    "node scripts/check-guideline-decision-boundaries.js src/control-plane/replica-dispatch-service-segment-1.js src/control-plane/replica-dispatch-service-segment-2.js src/control-plane/replica-dispatch-service-segment-4.js src/rebalancer/operation-workflow-owner-segment-7-stage-3.js src/rebalancer/operation-workflow-owner-segment-7-stage-shared.js",
    "npm run audit:runtime-grammar:file -- src/control-plane/replica-dispatch-service-segment-1.js src/control-plane/replica-dispatch-service-segment-2.js src/control-plane/replica-dispatch-service-segment-4.js src/rebalancer/operation-workflow-owner-segment-7-stage-3.js src/rebalancer/operation-workflow-owner-segment-7-stage-shared.js",
    "npm run work:validate -- --closure work/packages/todo-20260513-rolling-restart-wake-retry-progress-closure.md"
  ],
  "writeScope": [
    "work/packages/todo-20260513-rolling-restart-wake-retry-progress-closure.md",
    "work/sprints/todo-2026-q2-rolling-restart-llm-preflight-and-code-risk-closure.md",
    "src/control-plane/replica-dispatch-service-segment-1.js",
    "src/control-plane/replica-dispatch-service-segment-2.js",
    "src/control-plane/replica-dispatch-service-segment-4.js",
    "src/rebalancer/operation-workflow-owner-segment-7-stage-3.js",
    "src/rebalancer/operation-workflow-owner-segment-7-stage-shared.js",
    "test/control-plane/replica-dispatch-node-state-update.test-part-2.js",
    "test/rebalancer/priority-recovery-dispatch-pending-timeout-reentry.test.js",
    "test/rebalancer/operation-workflow-progress-event-driven-reentry.test.js"
  ],
  "handoffFiles": [
    "work/packages/todo-20260513-rolling-restart-operation-progress-state-machine-gap-closure.md",
    "work/packages/todo-20260513-rolling-restart-latest-artifact-preflight-refresh.md",
    "test-output/reports/rolling-restart-green-gate-after-dispatch-retry-recovery-readiness.report.json"
  ],
  "generatedFiles": [],
  "candidateRuntimeFiles": [
    "src/control-plane/replica-dispatch-service-segment-1.js",
    "src/control-plane/replica-dispatch-service-segment-2.js",
    "src/control-plane/replica-dispatch-service-segment-4.js",
    "src/rebalancer/operation-workflow-owner-segment-7-stage-3.js",
    "src/rebalancer/operation-workflow-owner-segment-7-stage-shared.js"
  ],
  "commitScope": [
    "work/packages/todo-20260513-rolling-restart-wake-retry-progress-closure.md",
    "work/sprints/todo-2026-q2-rolling-restart-llm-preflight-and-code-risk-closure.md",
    "src/control-plane/replica-dispatch-service-segment-1.js",
    "src/control-plane/replica-dispatch-service-segment-2.js",
    "src/control-plane/replica-dispatch-service-segment-4.js",
    "src/rebalancer/operation-workflow-owner-segment-7-stage-3.js",
    "src/rebalancer/operation-workflow-owner-segment-7-stage-shared.js",
    "test/control-plane/replica-dispatch-node-state-update.test-part-2.js",
    "test/rebalancer/priority-recovery-dispatch-pending-timeout-reentry.test.js",
    "test/rebalancer/operation-workflow-progress-event-driven-reentry.test.js"
  ],
  "modelFit": {
    "packageClass": "representative-frontier-closure",
    "intendedMinimumModel": "gpt-5.3-codex",
    "scopeShape": "owner-boundary-wake-retry/current-frontier",
    "escalationTriggers": [
      "latest preflight proves priority recovery is not actionable",
      "delivery failure belongs to transport outside ReplicaDispatchService",
      "owner state machine is missing before wake/retry can be fixed"
    ]
  },
  "causalGovernance": {
    "hypothesis": "If an event-driven workflow wait remains actionable, it must have a bounded owner-owned wake, retry, timeout, reconcile, dispatch, delivery, or advance mechanism that fires without a full active-gate timeout.",
    "stopConditionCheck": "Run npm run analyze:causal-model on the latest artifact, focused ReplicaDispatchService and workflow progress tests, plus static guardrails.",
    "expectedCausalModelChange": "The priority-recovery wait disappears, becomes bounded with a named deadline, or migrates with fresh evidence.",
    "representativeOutcome": "pending-before-rerun",
    "causalDebt": "Representative rolling-restart remains red until final confirmation.",
    "crossBoundaryReview": "Requires runtime-owner-boundary subagent sequencing when activated."
  }
}
-->

## Why

The wake/retry recommendation is complete only if an event-driven wait has a
real bounded trigger. If preflight proves the wait is stale or subordinate, this
package closes with that proof and no runtime change.

## Scope Basis

Runtime owner-boundary work across operation workflow progress and the dispatch
service transport path, conditional on fresh evidence.

## Workflow Lane

- Selected lane: `runtime-owner-boundary`
- Why this lane is required: it can change owner wake/retry runtime behavior.
- Escalation trigger: priority recovery is no longer actionable, or the missing
  trigger belongs to a different transport owner.

## Audit Path

The implementation must trace and prove:

1. dispatch issued
2. target/source observes dispatch
3. progress event emitted
4. workflow owner consumes progress event
5. retry fires if no event arrives
6. timeout converts wait into owner-owned reconcile or migration
7. diagnostics report the bounded mechanism and deadline

## Subagent Sequencing Requirement

When activated, run runtime-owner-boundary review, fix if needed, and
implementation subagents before closure.

## In Scope

1. Replica dispatch critical routing and owner wake proof.
2. Workflow owner event consumption and retry/timeout proof.
3. Focused control-plane and rebalancer tests.
4. Static guardrails for touched runtime files.

## Out Of Scope

1. Active-gate snapshot coverage fixes.
2. Diagnostics projection consistency fixes already owned by the consistency
   package.
3. Full distributed rerun before focused proof.

## Model Fit

- Package class: `representative-frontier-closure`
- Intended minimum model: `gpt-5.3-codex`
- Scope shape: `owner-boundary-wake-retry/current-frontier`
- Owned files: metadata `writeScope`
- Forbidden files: startup active-gate runtime and broad bootstrap files.
- Frozen decisions: no retryable wait can close without a named bounded
  mechanism.
- Escalation triggers: priority recovery stale/subordinate, missing state model,
  or different transport owner.
- Focused proof: ReplicaDispatchService, workflow progress tests, guideline
  checks, runtime grammar audit.

## Validation

1. `npm run work:package:doctor -- --suggest work/packages/todo-20260513-rolling-restart-wake-retry-progress-closure.md`
2. `npm run work:validate -- --entry work/packages/todo-20260513-rolling-restart-wake-retry-progress-closure.md`
3. Before closure, run metadata proof ladder and closure validation.
