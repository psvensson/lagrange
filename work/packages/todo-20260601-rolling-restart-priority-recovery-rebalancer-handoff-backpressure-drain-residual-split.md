# Rolling Restart Priority Recovery Rebalancer Handoff Backpressure Drain Residual Split

<!-- work-package
{
  "schema": "work-package-v2",
  "intent": {
    "opened": "2026-06-01",
    "lane": "runtime-owner-boundary",
    "scenario": "rolling-restart",
    "artifact": "test-output/reports/rolling-restart-priority-recovery-backpressure-rerun.report.json",
    "playback": "none",
    "owner": "operation_workflow_owner",
    "boundary": "rebalancer_handoff",
    "dominantReason": "priority_recovery_event_driven_wait",
    "currentState": "Escalation package confirmed H2: backpressure drains are stalled in event-driven wait and require a scheduling-layer timer or retry.",
    "nextAction": "Implement a retry timer/scheduling re-arm in the operation workflow rebalancer handoff path so stuck event-driven waits can advance retry states."
  },
  "scope": {
    "writeScope": [
      "src/rebalancer/operation-workflow-owner-ports.js",
      "test/rebalancer/operation-workflow-progress-event-driven-reentry.test.js"
    ],
    "handoffFiles": [],
    "generatedFiles": [],
    "candidateRuntimeFiles": [],
    "commitScope": [
      "src/rebalancer/operation-workflow-owner-ports.js",
      "test/rebalancer/operation-workflow-progress-event-driven-reentry.test.js",
      "work/packages/active-20260601-rolling-restart-priority-recovery-rebalancer-handoff-backpressure-drain-residual-split.md",
      "work/sprints/active-2026-q2-rolling-restart-active-gate-resolution.md",
      "work/sprints/current-blocker.json"
    ]
  },
  "gates": {
    "stabilityCredit": "local-proof-only",
    "whyHighestLeverageNow": "This runtime package is the highest leverage next action to advance the active sprint goal (Rolling Restart Active Gate Resolution) by implementing rebalancer handoff retry timers."
  },
  "modelFit": {
    "packageClass": "runtime-owner-boundary",
    "intendedMinimumModel": "gpt-5.3-codex",
    "scopeShape": "bounded-owner-runtime/current-frontier",
    "outputProfile": "medium",
    "ambiguityScore": 1,
    "escalationTriggers": [
      "owned files expand beyond this package",
      "a frozen decision must be reopened"
    ]
  },
  "execution": {
    "theoryLedgerRefs": [
      "theory-20260601-rolling-restart-priority-recovery-backpressure-drain-escalation"
    ],
    "proof": {
      "commands": [
        "falsifier: npm test -- test/rebalancer/operation-workflow-progress-event-driven-reentry.test.js",
        "regression: npm run work:advance -- --check"
      ]
    }
  }
}
-->

## Why

This package implements the retry timer / scheduling re-arm in the rebalancer handoff ports to advance event-driven retry states when stuck under backpressure.

## Scope Basis

Package metadata fixes the owner, boundary, lane, scope, proof, and stop rule before implementation.

## Workflow Lane

- Selected lane: `runtime-owner-boundary`
- Why this lane is sufficient: bounded to owner ports.

## Core Logic Brief

- Canonical outcome: rebalancer handoff retry progress timer is scheduled when stalled.
- Inputs/signals: priority recovery event driven wait.
- State model or invariant: transition states must advance retry states if wait is stuck.
- Non-goals: do not edit non-owner port files.
- Proof mapping: test-driven verification.
- Wrong-slice trigger: none.

## Execution Evidence

- [ ] action: freshness-review; owner: operation_workflow_owner; files-changed: none; validation: pending; outcome: pending.
- [ ] action: implementation; owner: operation_workflow_owner; files-changed: none; validation: pending; outcome: pending.

## Validation

1. `npm test -- test/rebalancer/operation-workflow-progress-event-driven-reentry.test.js`
