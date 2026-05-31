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
    "same-frontier evidence can trigger another local patch instead of a contract-level discriminator"
  ],
  "stateVariables": [
    "routeOwnerBoundary",
    "dominantReason",
    "causalOutcome",
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
      "id": "bounded-owner-reentry",
      "statement": "A reconciled-but-not-yet-published node may be deferred back to pending only a bounded number of times; unbounded deferred owner re-entry is the higher-level oscillation that prevents convergence."
    }
  ],
  "knownResiduals": [
    "Fresh representative evidence is still required after accept_classified_backpressure before this contract can claim release-gate convergence."
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
      "properties": "every route evidence combination emits exactly one owner-owned action"
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
      "name": "representative residual route",
      "probe": "npm run work:scenario-route -- test-output/reports/rolling-restart-active-gate-bounded-reentry-model-route.report.json --owner operation_workflow_owner --boundary rebalancer_handoff --dominant-reason priority_recovery_event_driven_wait"
    },
    {
      "name": "loop health",
      "probe": "npm run work:loop-health -- --owner operation_workflow_owner --boundary rebalancer_handoff"
    }
  ],
  "packageRefs": [
    "work/packages/done-20260530-rolling-restart-priority-recovery-rebalancer-handoff-scheduling-retry.md",
    "work/packages/superseded-20260530-rolling-restart-priority-recovery-rebalancer-handoff-rerun-backpressure-residual.md"
  ],
  "theoryLedgerRefs": [
    "theory-20260530-rolling-restart-priority-recovery-rebalancer-handoff-scheduling-retry-architecture-gap",
    "theory-20260529-rolling-restart-active-gate-priority-recovery-coupled-invariants"
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

FMEA records the missing scheduler wake and representative rerun risk. STPA
records the unsafe control action: continuing local patching after unchanged
frontier feedback. `npm run work:loop-health` is the operator-facing summary of
that risk.
