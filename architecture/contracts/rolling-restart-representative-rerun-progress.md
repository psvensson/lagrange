# Rolling Restart Representative Rerun Progress Contract

<!-- system-contract
{
  "schema": "system-contract-v1",
  "contractId": "rolling-restart-representative-rerun-progress",
  "status": "active",
  "owners": [
    {
      "owner": "representative_evidence_owner",
      "boundary": "rolling_restart_rerun"
    }
  ],
  "failureClasses": [
    "a non-shrinking representative residual window can trigger another rolling_restart_rerun instead of a model-backed stop",
    "a docs/specs model can exist without owner-dossier-visible contract or invariant coverage",
    "blocked_model_route evidence can be mistaken for permission to rerun representative evidence"
  ],
  "stateVariables": [
    "representativeResidualCount",
    "residualWindow",
    "representativeRerunRoute",
    "modelCoverageStatus",
    "ownerDossierModelStatus"
  ],
  "safetyInvariants": [
    {
      "id": "non_shrinking_window_blocks_rerun",
      "statement": "A non-shrinking residual-count window cannot authorize another rolling_restart_rerun; it enters blocked_model_route."
    }
  ],
  "livenessExpectations": [
    {
      "id": "blocked_route_has_non_rerun_exits",
      "statement": "A blocked representative rerun route must exit through owner-boundary migration or architecture/causal successor selection before representative evidence runs again."
    }
  ],
  "knownResiduals": [
    "The rolling-restart baseline artifact still reports priority_recovery_partition_progress witnesses until a later legal successor reruns or migrates evidence.",
    "This contract records model coverage; it does not claim representative green movement."
  ],
  "systemTheory": {
    "problemStatement": "The representative rerun progress model blocks non-shrinking residual windows, but the rerun loop can only use that fact when owner-dossier sees contract or invariant model coverage.",
    "phaseChain": [
      "runtime progress emits representativeRerunRoute=blocked_model_route",
      "representative residual history remains non-shrinking",
      "the state model routes window_non_shrinking to blocked_model_route",
      "owner-dossier reads modelProvenRoutes and invariant modelRef coverage before authorizing the next route"
    ],
    "ownerBoundaryMap": [
      "representative_evidence_owner / rolling_restart_rerun owns rerun authorization and model route coverage",
      "operation_workflow_owner / rebalancer_handoff owns the stale priority-recovery artifact frontier",
      "workflow_tooling_owner / owner_dossier_model_coverage owns escalation if coverage is not visible"
    ],
    "invariantRefs": [
      "non_shrinking_window_blocks_rerun",
      "blocked_route_has_non_rerun_exits"
    ]
  },
  "modelProvenRoutes": [
    {
      "owner": "representative_evidence_owner",
      "boundary": "rolling_restart_rerun",
      "selectedLayer": "model",
      "livenessHolds": true,
      "evidenceArtifact": "docs/specs/representative-rerun-progress-model.json",
      "ledgerRef": "theory-20260531-rolling-restart-representative-rerun-progress-model-route",
      "note": "The state model records that a non-shrinking residual window enters blocked_model_route and can only exit through non-rerun successors."
    }
  ],
  "runtimeBindings": [
    {
      "path": "scripts/work-tracker.js",
      "owner": "workflow_tooling_owner",
      "boundary": "owner_dossier_model_coverage",
      "transition": "owner-dossier reads modelProvenRoutes and invariant modelRef coverage for representative rerun admission"
    },
    {
      "path": "src/rebalancer/operation-workflow-owner-ports.js",
      "owner": "operation_workflow_owner",
      "boundary": "rebalancer_handoff",
      "transition": "emits representativeRerunRoute=blocked_model_route for retry progress consumed by the rerun model"
    }
  ],
  "modelBindings": [
    {
      "kind": "state-model",
      "artifact": "docs/specs/representative-rerun-progress-model.json",
      "properties": "non-shrinking residual windows route to blocked_model_route and blocked routes exit only through non-rerun successors"
    }
  ],
  "metrics": [
    {
      "name": "owner-dossier model coverage",
      "probe": "npm --silent run work:owner-dossier -- --owner representative_evidence_owner --boundary rolling_restart_rerun --json"
    },
    {
      "name": "representative rerun route health",
      "probe": "npm run work:frontier-history -- --owner representative_evidence_owner --boundary rolling_restart_rerun --limit 12"
    }
  ],
  "packageRefs": [
    "work/packages/done-20260531-rolling-restart-priority-recovery-rebalancer-handoff-owner-wake-rerun-gate.md",
    "work/packages/done-20260531-rolling-restart-priority-recovery-rebalancer-handoff-blocked-route-rerun-gate.md",
    "work/packages/active-20260531-representative-rerun-progress-model-coverage-binding.md"
  ],
  "theoryLedgerRefs": [
    "theory-20260531-rolling-restart-representative-rerun-progress-model-route",
    "theory-20260531-rolling-restart-representative-rerun-progress-model-coverage-binding"
  ],
  "failureAnalysis": {
    "fmea": [
      {
        "failureMode": "owner-dossier cannot see the representative rerun model and reports modelStatus=none",
        "severity": "high - the loop can repeat unmodelled rerun attempts after no residual movement",
        "detectability": "high - owner-dossier JSON exposes contractRecord, invariants, modelStatus, and provenRoutes",
        "mitigation": "bind modelProvenRoutes and invariant modelRef entries for the exact owner boundary",
        "probe": "npm --silent run work:owner-dossier -- --owner representative_evidence_owner --boundary rolling_restart_rerun --json"
      }
    ],
    "stpa": [
      {
        "controller": "representative_evidence_owner",
        "unsafeAction": "authorizes another rolling_restart_rerun when the residual window is non-shrinking and model coverage is absent",
        "feedbackSignal": "representativeResidual.residualCount and owner-dossier modelStatus",
        "ownerBoundary": "representative_evidence_owner / rolling_restart_rerun"
      }
    ]
  }
}
-->

## Failure Classes

This contract covers representative rerun failures where non-shrinking
residual evidence repeats the same owner boundary and the model that should
block another rerun is not visible to the workflow read model.

## Invariants

`non_shrinking_window_blocks_rerun` prevents another representative evidence
slice from a non-shrinking residual window. `blocked_route_has_non_rerun_exits`
requires a blocked route to leave through migration or architecture/causal
successor selection before representative evidence runs again.

## Runtime Bindings

`scripts/work-tracker.js` owns the owner-dossier read model that reports proven
or modeled coverage. `src/rebalancer/operation-workflow-owner-ports.js` owns
the upstream `blocked_model_route` signal consumed by this representative rerun
progress model.

## Model Bindings

`docs/specs/representative-rerun-progress-model.json` is the durable state
model. Its two properties are registered as contract invariants so owner-dossier
can report model coverage for `representative_evidence_owner /
rolling_restart_rerun`.

## Operational Analysis

FMEA/STPA frame the risk as an unsafe rerun admission problem: the controller
must not authorize another representative evidence slice while the residual
window is non-shrinking and model coverage is absent. The owner-dossier command
is the operator-facing proof that coverage is visible.
