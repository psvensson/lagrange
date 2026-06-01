# Active Gate Convergence Contract

<!-- system-contract
{
  "schema": "system-contract-v1",
  "contractId": "active-gate-convergence",
  "status": "active",
  "owners": [
    {
      "owner": "startup_active_gate_owner",
      "boundary": "snapshot_coverage"
    },
    {
      "owner": "operation_workflow_owner",
      "boundary": "rebalancer_handoff"
    }
  ],
  "failureClasses": [
    "snapshot coverage and rebalancer handoff can move as coupled invariants",
    "fixing one owner boundary can leave the representative frontier unchanged because the paired invariant still blocks progress"
  ],
  "stateVariables": [
    "activeGateState",
    "snapshotCoverage",
    "handoffEpoch",
    "pendingAcknowledgement",
    "staleEvent",
    "representativeResidualCount"
  ],
  "safetyInvariants": [
    {
      "id": "no-ambiguous-active-owner",
      "statement": "The model must not allow two active owners for the same handoff epoch."
    },
    {
      "id": "covered-snapshot-not-forgotten",
      "statement": "Once snapshot coverage is accepted by the owner path, later handoff events cannot erase it as fresh evidence."
    },
    {
      "id": "published-subset-covered",
      "statement": "A node can never be published before its snapshot coverage is accepted; published is always a subset of covered."
    },
    {
      "id": "covered-disjoint-pending",
      "statement": "A node with accepted snapshot coverage has already been reconciled by the owner; covered and pending never intersect."
    }
  ],
  "livenessExpectations": [
    {
      "id": "active-gate-eventually-resolves",
      "statement": "Under fair scheduling, active-gate progress eventually reaches a covered, retried, migrated, or bounded residual state."
    },
    {
      "id": "active-gate-eventually-converged",
      "statement": "Under weak fairness of the progress actions and bounded owner re-entry, every node eventually reaches published with a fresh quorum snapshot, so the active gate eventually goes green."
    }
  ],
  "knownResiduals": [
    "The current representative residual still requires fresh route evidence before release-gate success can be claimed."
  ],
  "systemTheory": {
    "problemStatement": "The active-gate / snapshot-coverage convergence protocol oscillates: a reconciled-but-not-yet-published node can be deferred back to pending unboundedly, so the green gate is never reached even though every local owner patch closes.",
    "phaseChain": [
      "owner reconcile removes a node from pending",
      "snapshot coverage advances and the node publishes",
      "a deferred owner re-entry returns the node to pending before the gate goes green",
      "unbounded re-entry keeps the representative frontier red"
    ],
    "ownerBoundaryMap": [
      "startup_active_gate_owner / snapshot_coverage owns publication and coverage convergence",
      "operation_workflow_owner / rebalancer_handoff owns the deferred re-entry that feeds the oscillation"
    ],
    "invariantRefs": [
      "published-subset-covered",
      "covered-disjoint-pending",
      "active-gate-eventually-converged",
      "bounded-owner-reentry"
    ]
  },
  "modelProvenRoutes": [
    {
      "owner": "startup_active_gate_owner",
      "boundary": "snapshot_coverage",
      "selectedLayer": "observation",
      "livenessHolds": true,
      "evidenceArtifact": "test-output/reports/active-gate-tlc-route.model.report.json",
      "ledgerRef": "theory-20260529-rolling-restart-active-gate-snapshot-coverage-architecture-gap-stop",
      "note": "TLC proves EventuallyConverged holds when deferred owner re-entry is bounded (AllowUnboundedReentry=FALSE); the unbounded protocol returns the oscillation as a liveness counterexample. The loop must implement the bounded-re-entry route, not re-open analysis."
    }
  ],
  "runtimeBindings": [
    {
      "path": "src/rebalancer/operation-workflow-owner-ports.js",
      "owner": "operation_workflow_owner",
      "boundary": "rebalancer_handoff",
      "transition": "handoff retry progress must not weaken active-gate snapshot coverage"
    }
  ],
  "modelBindings": [
    {
      "kind": "tla-spec",
      "artifact": "models/active-gate/ActiveGate.tla",
      "properties": "safety and liveness properties for active-gate convergence"
    },
    {
      "kind": "property-test",
      "artifact": "test/model/active-gate/model.js",
      "properties": "fast-check generated command histories match the abstract protocol manifest"
    },
    {
      "kind": "invariant-spec",
      "artifact": "models/active-gate/action-manifest.json",
      "properties": "manifest drift check keeps TLA+ and fast-check actions aligned"
    }
  ],
  "metrics": [
    {
      "name": "active-gate model check",
      "probe": "npm run model:check"
    },
    {
      "name": "rolling restart Quest status",
      "probe": "npm run solve:status -- --id rolling-restart"
    }
  ],
  "questRefs": [
    "solve/quests/rolling-restart-core-stability.json"
  ],
  "theoryLedgerRefs": [
    "theory-20260529-rolling-restart-active-gate-priority-recovery-coupled-invariants"
  ],
  "failureAnalysis": {
    "fmea": [
      {
        "failureMode": "one coupled invariant improves while the paired invariant keeps the representative frontier blocked",
        "severity": "high - local green proof can mask release-gate non-progress",
        "detectability": "high - frontier-history loop metrics expose pair alternation and residual trend",
        "mitigation": "require joint falsifier evidence and route-layer rotation after no-progress closes",
        "probe": "npm run model:check"
      }
    ],
    "stpa": [
      {
        "controller": "theory-loop workflow",
        "unsafeAction": "opens another same-layer runtime package after repeated no-progress route implementations",
        "feedbackSignal": "Quest metric movement, Solver health, and representative scenario probe output",
        "ownerBoundary": "startup_active_gate_owner / snapshot_coverage and operation_workflow_owner / rebalancer_handoff"
      }
    ]
  }
}
-->

## Failure Classes

This contract covers active-gate convergence failures where snapshot coverage
and rebalancer handoff behave as coupled invariants. A package may move one
local owner proof while the representative frontier remains blocked by the
paired invariant.

## Invariants

The active-gate model must preserve unambiguous ownership and accepted snapshot
coverage across handoff events. Coupled invariant evidence must be handled at
the contract layer before another same-layer runtime patch is opened.

## Runtime Bindings

The current runtime binding named by active context is
`src/rebalancer/operation-workflow-owner-ports.js`; future packages may add
other owner bindings only by updating this contract and validating the model
bindings.

## Model Bindings

The high-resolution model remains `models/active-gate/ActiveGate.tla`, backed
by the fast-check model under `test/model/active-gate/`. The action manifest is
the drift guard between the two surfaces.

## Operational Analysis

The FMEA/STPA entries make the ping-pong risk explicit: same-layer proof can
keep closing without representative movement. Quest theory gates and
`npm run solve:health` are the workflow controls that prevent that from
becoming another local patch cycle.
