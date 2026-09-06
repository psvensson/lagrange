# Rolling Restart Rebalancer Handoff Contract

<!-- system-contract
{
  "schema": "system-contract-v1",
  "contractId": "rolling-restart-rebalancer-handoff",
  "status": "active",
  "owners": [
    {
      "owner": "operation_workflow_owner",
      "boundary": "rebalancer_handoff"
    }
  ],
  "failureClasses": [
    "priority recovery handoff retry can wait on event-driven progress without a scheduler wake",
    "pending acknowledgement residuals can stay unresolved when representative evidence returns same-frontier",
    "same-frontier evidence can trigger another local patch instead of a contract-level discriminator",
    "accepted classified backpressure can map to representative rerun after the representative-progress model has already blocked that rerun"
  ],
  "stateVariables": [
    "routeOwnerBoundary",
    "dominantReason",
    "causalOutcome",
    "representativeRerunRoute",
    "writeScopeFit",
    "pendingAcknowledgementResidual",
    "representativeMetricDelta"
  ],
  "safetyInvariants": [
    {
      "id": "single-owner-handoff-decision",
      "statement": "Only operation_workflow_owner / rebalancer_handoff decides the local priority_recovery_event_driven_wait handoff transition."
    },
    {
      "id": "no-local-patch-on-unchanged-frontier",
      "statement": "Same-frontier or no-reduction evidence cannot promote another local runtime patch without a higher-level discriminator."
    }
  ],
  "livenessExpectations": [
    {
      "id": "pending-ack-eventually-routes",
      "statement": "A pending rebalancer handoff acknowledgement eventually reruns representative evidence, retries through the owner wake path, migrates owner, or records an architecture-gap stop."
    },
    {
      "id": "blocked-rerun-routes-to-model-successor",
      "statement": "When the representative-progress model reports blocked_model_route, accepted classified backpressure must route to a non-repeated model or architecture successor instead of another representative rerun."
    },
    {
      "id": "bounded-owner-reentry",
      "statement": "A reconciled-but-not-yet-published node may be deferred back to pending only a bounded number of times; unbounded deferred owner re-entry is the higher-level oscillation that prevents convergence."
    }
  ],
  "knownResiduals": [
    "The decision table and abstract model do not by themselves certify concrete wake scheduling or live-cluster convergence."
  ],
  "runtimeBindings": [
    {
      "path": "src/rebalancer/operation-workflow-owner-ports.js",
      "owner": "operation_workflow_owner",
      "boundary": "rebalancer_handoff",
      "transition": "priority_recovery_event_driven_wait retry wake and representative rerun routing"
    }
  ],
  "modelBindings": [
    {
      "kind": "decision-table",
      "artifact": "docs/specs/decision-tables/rebalancer-handoff-priority-recovery.json",
      "properties": "every route evidence combination, including blocked_model_route representative rerun evidence, emits exactly one owner-owned action"
    },
    {
      "kind": "tla-spec",
      "artifact": "models/active-gate/ActiveGate.tla",
      "properties": "active-gate convergence remains coupled to rebalancer handoff progress under restart"
    },
    {
      "kind": "property-test",
      "artifact": "test/model/active-gate/model.js",
      "properties": "generated active-gate histories preserve the same convergence contract as the abstract model"
    }
  ],
  "metrics": [
    {
      "name": "handoff decision-table check",
      "probe": "npm run model:decision-tables"
    },
    {
      "name": "active-gate model check",
      "probe": "npm run model:check"
    }
  ],
  "questRefs": [
    "solve/quests/rolling-restart-core-stability/quest.json"
  ],
  "theoryLedgerRefs": [
    "theory-20260530-rolling-restart-priority-recovery-rebalancer-handoff-scheduling-retry-architecture-gap",
    "theory-20260529-rolling-restart-active-gate-priority-recovery-coupled-invariants",
    "theory-20260531-rolling-restart-priority-recovery-rebalancer-handoff-decision-table-circuit-breaker-repair"
  ],
  "failureAnalysis": {
    "fmea": [
      {
        "failureMode": "scheduler retry wake is absent after priority recovery handoff evidence",
        "severity": "high - representative rolling restart can stall behind a valid handoff residual",
        "detectability": "medium - scenario-route and loop-health expose the repeated frontier",
        "mitigation": "bind the owner decision to a decision table and require representative rerun evidence after accept_classified_backpressure",
        "probe": "npm run model:decision-tables"
      }
    ],
    "stpa": [
      {
        "controller": "operation_workflow_owner",
        "unsafeAction": "continues local runtime patching after same-frontier evidence instead of selecting a higher-level discriminator",
        "feedbackSignal": "closureSummary.resultClassification and observablePrediction.metricDelta",
        "ownerBoundary": "operation_workflow_owner / rebalancer_handoff"
      }
    ]
  }
}
-->

## Failure Classes

This contract covers rolling-restart priority recovery handoff failures where
the rebalancer handoff owner has enough evidence to act but lacks a stable
contract for retry, representative rerun, migration, or architecture-gap
selection.

## Invariants

The handoff decision has one semantic owner. Same-frontier evidence cannot be
converted into another local runtime patch unless the package also records a
fresh discriminator that changes owner, boundary, layer, or residual metric.

## Runtime Bindings

The runtime binding is `src/rebalancer/operation-workflow-owner-ports.js`.
Packages that touch this binding must preserve the decision table in
`docs/specs/decision-tables/rebalancer-handoff-priority-recovery.json`.

## Model Bindings

The decision table is the low-resolution contract for routing and escalation.
The active-gate TLA+ and fast-check models remain the high-resolution protocol
bindings for convergence and coupled invariant checks.

## Operational Analysis

FMEA records the missing scheduler-wake and repeated-rerun risks. STPA records
the unsafe control action of treating unchanged frontier feedback as permission
for another local transition. The durable guards are the handoff decision table,
the active-gate models, and their registered invariants.
