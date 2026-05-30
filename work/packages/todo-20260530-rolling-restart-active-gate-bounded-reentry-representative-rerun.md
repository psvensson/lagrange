# Rolling Restart Active Gate Bounded Reentry Representative Rerun

<!-- work-package
{
  "schema": "work-package-v2",
  "status": "todo",
  "intent": {
    "opened": "2026-05-30",
    "lane": "causal-escalation",
    "scenario": "rolling-restart",
    "artifact": "test-output/reports/rolling-restart-active-gate-bounded-reentry-model-route.report.json",
    "playback": "none",
    "owner": "startup_active_gate_owner",
    "boundary": "snapshot_coverage",
    "dominantReason": "owner_reconcile_pending",
    "currentState": "The model-layer bounded-re-entry invariant is implemented in the decision rule table. We must run a representative scenario rerun to generate fresh distributed evidence and confirm that the active-gate snapshot-coverage oscillation is resolved.",
    "nextAction": "Run a representative scenario rerun and perform causal explain/scenario route checks."
  },
  "scope": {
    "writeScope": [
      "work/packages/todo-20260530-rolling-restart-active-gate-bounded-reentry-representative-rerun.md"
    ],
    "handoffFiles": [
      "test-output/reports/rolling-restart-active-gate-bounded-reentry-model-route.report.json"
    ],
    "generatedFiles": [
      "work/sprints/current-blocker.json",
      "work/sprints/current-blocker.md"
    ],
    "candidateRuntimeFiles": [],
    "commitScope": [
      "work/packages/todo-20260530-rolling-restart-active-gate-bounded-reentry-representative-rerun.md",
      "work/sprints/current-blocker.json",
      "work/sprints/current-blocker.md"
    ]
  },
  "gates": {
    "stabilityCredit": "local-proof-only",
    "whyHighestLeverageNow": "Representative rerun will generate fresh distributive evidence after the model-layer bounded-re-entry implementation, verifying if active-gate snapshot coverage converges."
  },
  "modelFit": {
    "packageClass": "representative-rerun",
    "intendedMinimumModel": "gpt-5.3-codex",
    "scopeShape": "representative-rerun",
    "outputProfile": "medium",
    "ambiguityScore": 1,
    "escalationTriggers": [
      "owned files expand beyond this package",
      "runtime source write is selected"
    ]
  },
  "execution": {
    "theoryLedgerRefs": [
      "theory-20260530-active-gate-bounded-reentry-model-implementation"
    ],
    "proof": {
      "commands": [
        "falsifier: node test/distributed/run.js --config test/distributed/config/local.json --scenario rolling-restart --output test-output/reports/rolling-restart-active-gate-bounded-reentry-model-route.report.json --fast-local --verbose"
      ]
    }
  },
  "representativeResidual": {
    "status": "needs-rerun",
    "scenario": "rolling-restart",
    "artifact": "test-output/reports/rolling-restart-active-gate-bounded-reentry-model-route.report.json",
    "frontier": "active_gate_snapshot_coverage",
    "owner": "startup_active_gate_owner",
    "boundary": "snapshot_coverage",
    "dominantReason": "owner_reconcile_pending",
    "nextAction": "Run a fresh representative rerun to generate fresh routing evidence."
  },
  "observablePrediction": {
    "metric": "rolling-restart / startup_active_gate_owner / snapshot_coverage / representative route",
    "predicted": "The representative rerun will demonstrate that active-gate snapshot-coverage moves off owner_reconcile_pending toward convergence.",
    "observed": "pending-before-observation",
    "accuracy": "pending-before-observation",
    "evidence": "pending-before-observation"
  }
}
-->

## Why

This package exists to run the representative scenario rerun following implementation of the model-layer bounded-re-entry invariant in src/control-plane/publication-active-gate-handoff-contract-decision.js. Running the scenario generates fresh distributed evidence to verify if active-gate snapshot coverage is resolved.

## Validation

1. `falsifier: node test/distributed/run.js --config test/distributed/config/local.json --scenario rolling-restart --output test-output/reports/rolling-restart-active-gate-bounded-reentry-model-route.report.json --fast-local --verbose`
