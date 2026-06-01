# Rolling Restart Priority Recovery Rebalancer Handoff Backpressure Drain Representative Rerun

<!-- work-package
{
  "schema": "work-package-v2",
  "intent": {
    "opened": "2026-06-01",
    "lane": "diagnostic-classification",
    "scenario": "rolling-restart",
    "artifact": "test-output/reports/rolling-restart-priority-recovery-backpressure-rerun.report.json",
    "playback": "none",
    "owner": "representative_evidence_owner",
    "boundary": "rolling_restart_rerun",
    "dominantReason": "representative_rerun_model_route_decision",
    "currentState": "Retry progress timer implemented and validated on rebalancer handoff; representative rerun must be executed to measure convergence.",
    "nextAction": "Rerun the representative rolling-restart scenario to measure priority recovery progress."
  },
  "scope": {
    "writeScope": [
      "work/packages/todo-20260601-rolling-restart-priority-recovery-rebalancer-handoff-backpressure-drain-representative-rerun.md",
      "work/sprints/active-2026-q2-rolling-restart-active-gate-resolution.md",
      "work/theory-ledger.md"
    ],
    "handoffFiles": [],
    "generatedFiles": [],
    "candidateRuntimeFiles": [],
    "commitScope": [
      "work/packages/todo-20260601-rolling-restart-priority-recovery-rebalancer-handoff-backpressure-drain-representative-rerun.md",
      "work/sprints/active-2026-q2-rolling-restart-active-gate-resolution.md",
      "work/theory-ledger.md",
      "work/sprints/current-blocker.json"
    ]
  },
  "gates": {
    "stabilityCredit": "local-proof-only",
    "whyHighestLeverageNow": "Rerunning the representative scenario is required to verify that the retry timer resolves backpressure and priority recovery converges."
  },
  "modelFit": {
    "packageClass": "diagnostic-classification",
    "intendedMinimumModel": "gpt-5.3-codex",
    "scopeShape": "diagnostic-owner-evidence/current-artifact",
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
        "falsifier: npm run work:owner-dossier -- --owner representative_evidence_owner --boundary rolling_restart_rerun --json",
        "regression: npm run work:scenario-route -- test-output/reports/rolling-restart-priority-recovery-backpressure-rerun.report.json --owner representative_evidence_owner --boundary rolling_restart_rerun --dominant-reason representative_rerun_model_route_decision --explain priority_recovery_partition_progress",
        "supporting: npm run work:frontier-history -- --owner representative_evidence_owner --boundary rolling_restart_rerun --limit 12"
      ]
    }
  },
  "theoryLoop": {
    "gateMarker": "same-mechanism-repeat",
    "jointFalsifierCommand": "npm --silent run work:owner-dossier -- --owner representative_evidence_owner --boundary rolling_restart_rerun --json",
    "result": "supported",
    "outcome": "theory-confirmed",
    "successorRequired": true,
    "architectureRoute": {
      "selectedLayer": "model",
      "ledgerRef": "theory-20260531-rolling-restart-representative-rerun-progress-model-route",
      "coupledInvariant": "representative residual count must shrink or route through a model-backed non-rerun exit before another rolling_restart_rerun evidence slice"
    }
  },
  "sliceTheory": {
    "systemTheoryRef": "architecture/contracts/rolling-restart-representative-rerun-progress.md#rolling-restart-representative-rerun-progress",
    "selectedSystemTheory": "The proven representative rerun progress model coverage must route to a legal successor before another rerun is attempted.",
    "selectedMechanism": "contract_gap",
    "sourceTestContract": "architecture/contracts/rolling-restart-representative-rerun-progress.md",
    "falsifier": "npm run work:owner-dossier -- --owner representative_evidence_owner --boundary rolling_restart_rerun --json",
    "representativeExpectedMovement": "selected route",
    "killRule": "If route selection cannot find a legal successor, open an architecture-gap experiment or record a blocked termination handoff.",
    "theoryFitScore": {
      "evidenceFit": "high - owner-dossier reports proven model coverage for the exact owner/boundary.",
      "ownerBoundaryFit": "high - representative_evidence_owner / rolling_restart_rerun owns the rerun admission decision.",
      "falsifiability": "high - falsifier command asserts model status and proven routes in owner-dossier.",
      "representativeMovement": "high - route classification must select a concrete successor route.",
      "downstreamRiskContainment": "high - runtime, downstream owners, and reruns stay frozen during classification."
    },
    "wrongSliceTriggers": [
      "route classification contradicts the proven model state",
      "the route requires architecture changes beyond the contract scope",
      "owner-dossier reports a different deciding owner/boundary"
    ]
  },
  "mechanismCard": {
    "failureMechanism": "scheduling_gap with contract_gap guard",
    "stableFacts": "Focused TAP proof shows event-driven waits under rebalancer handoff schedule a retry timer of 1000ms, arm owner reentry, and block direct representative reruns.",
    "changedFacts": "Retry timer implementation is validated locally. Representative rerun is required to verify whole-system convergence.",
    "rejectedAlternatives": "Bypassing the representative rerun is blocked by validation and the sprint continuation condition.",
    "ownerWhoDecides": "representative_evidence_owner",
    "currentAction": "Expose the retry timer in the progress contract and schedule the representative rerun.",
    "missingTransitionOrObservation": "Rerun is required to observe and verify system-level convergence.",
    "smallestFalsifyingProbe": "falsifier: npm run work:owner-dossier -- --owner representative_evidence_owner --boundary rolling_restart_rerun --json",
    "expectedMovement": "The representative rerun converges and priority recovery advances.",
    "negativeResultMeans": "If the rerun does not converge, escalate or rotate the layer.",
    "escalationRule": "If the rerun is flat or does not converge, rotate the layer or record an architecture-gap."
  },
  "result": {
    "classification": "pending-before-probe"
  }
}
-->

## Why

This package schedules the representative rerun of priority recovery under backpressure to measure convergence after the retry timer fix.

## Lane

- Selected lane: diagnostic-classification
- Representative scenario or blocker probe: rolling-restart priority recovery rebalancer handoff backpressure drain representative rerun
- Current owner: representative_evidence_owner
- Current boundary: rolling_restart_rerun
- Current dominant reason: representative_rerun_model_route_decision

## Scope Basis

Package metadata fixes the owner, boundary, lane, scope, proof, and stop rule before implementation.

## Workflow Lane

- Selected lane: `diagnostic-classification`
- Why this lane is sufficient: representative rerun measures system convergence without runtime code modifications.

## Execution Evidence

- [ ] action: freshness-review; owner: representative_evidence_owner; files-changed: none; validation: pending; outcome: pending.
- [ ] action: implementation; owner: representative_evidence_owner; files-changed: none; validation: pending; outcome: pending.

## Validation

1. `npm run work:owner-dossier -- --owner representative_evidence_owner --boundary rolling_restart_rerun --json`
