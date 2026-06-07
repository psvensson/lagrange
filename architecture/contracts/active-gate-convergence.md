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
    "fixing one owner boundary can leave the representative frontier unchanged because the paired invariant still blocks progress",
    "a reconciled active node can stay unpublished when the membership-publication drain pass no-ops without rescheduling, so missingPublishedCount never reaches zero",
    "the same undrained publication surfaces as correlated downstream symptoms (publication_missing_active_node, readiness_probe_timeout, and join retryable-resume budget exhaustion) that look like distinct bugs but share one root"
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
    },
    {
      "id": "published-reflects-durable-visibility",
      "statement": "A reconciled active node is reported published only after its publication row is read back as durably visible for the target; an absent or non-visible readback must not be counted as published."
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
    },
    {
      "id": "publication-drain-deterministic",
      "statement": "Whenever missingPublishedCount > 0 with reconciled active nodes, a drain or wake action stays enabled until those nodes publish; the active-gate reconcile deferral branch must reschedule (enqueue/drain) rather than return a silent NO_CHANGE or TARGET_BLOCKED that strands the residual."
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
    },
    {
      "path": "src/control-plane/membership-publication-active-gate-reconcile.js",
      "owner": "startup_active_gate_owner",
      "boundary": "snapshot_coverage",
      "transition": "reconcileActiveGateMembershipPublication drains the publication snapshot queue, reads back the publication row as durably visible, and on the deferral branch must reschedule (drain/enqueue) instead of stranding a reconciled-but-unpublished node"
    },
    {
      "path": "src/control-plane/publication-active-gate-handoff-contract-evidence.js",
      "owner": "startup_active_gate_owner",
      "boundary": "snapshot_coverage",
      "transition": "resolvePublicationActiveGateHandoffMissingPublishedNodeIds derives the missingPublished residual (expected minus published) that the drain must drive to zero"
    }
  ],
  "modelBindings": [
    {
      "kind": "tla-spec",
      "artifact": "models/active-gate/ActiveGate.tla",
      "properties": "safety and liveness properties for active-gate convergence"
    },
    {
      "kind": "tla-spec",
      "artifact": "models/readiness-starvation/PublicationConvergence.tla",
      "properties": "a reconciled active node cannot remain unpublished indefinitely while a drain/wake action stays enabled (publication-drain-deterministic)"
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
    "solve/quests/rolling-restart-core-stability.json",
    "solve/quests/membership-publication-drain-determinism.json"
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
the drift guard between the two surfaces. The membership-publication drain
liveness (a reconciled active node cannot stay unpublished while a drain/wake
action remains enabled) is bound to
`models/readiness-starvation/PublicationConvergence.tla`.

## Membership Publication Drain (Reconciled-But-Unpublished Residual)

This is the dominant blocker behind the chronic `rolling-restart` failures. It
is a refinement of the convergence oscillation above: active nodes are
reconciled but never *published*, so `missingPublishedCount` stays above zero and
the active gate never goes green. Empirically, three back-to-back fast-local
runs all graded `BLOCK_TOPOLOGY_CONVERGENCE` — runs surfaced
`publication_missing_active_node` (`missingPublishedCount = 4`) and the
correlated `readiness_probe_timeout`. The verdict *class* was 100% stable while
the dominant *reason* alternated between these correlated facets: this is **one
systemic defect**, not many small bugs.

Downstream, an undrained publication starves node join: the joining node spins in
the `querying_state` phase until `retryableFailureResumeMaxElapsedMs` is exhausted
and logs `Join retryable resume budget exhausted`
(`src/bootstrap/node-joining-admission-readiness.js` timeout check; the source
default is three minutes, while the failing harness ran with an effective policy
of 300000 ms). The join timeout is a *downstream consumer*, not the owner of the
defect.

Owner path: `startup_active_gate_owner / snapshot_coverage`. The drain lives in
`src/control-plane/membership-publication-active-gate-reconcile.js`
(`drainActiveGateMembershipPublicationSnapshotQueue` and
`reconcileActiveGateMembershipPublication`); the residual is derived by
`resolvePublicationActiveGateHandoffMissingPublishedNodeIds` in
`src/control-plane/publication-active-gate-handoff-contract-evidence.js`.

### Risky Paths (regression hot spots)

1. **Deferral branch that only drains under owner-recovery wait.** When
   `target.reconcileRequired !== true`, the reconcile path drains the snapshot
   queue *only* if the target is an owner-recovery-wait target; otherwise it
   returns `NO_CHANGE` / `TARGET_BLOCKED`. A reconciled-but-unpublished node that
   is not in that wait shape can be stranded without a reschedule.
2. **Drain returns a boolean, not a guarantee.**
   `drainActiveGateMembershipPublicationSnapshotQueue` returns true when queue
   pressure is detected *or* `drainedCount > 0`. A pass that neither drains nor
   re-arms a follow-up leaves the residual in place with no enabled wake.
3. **Silent absent/non-visible readback.** The publication-row readback returns
   an `ABSENT_ROW` sentinel when the durable row is missing or fails the
   target-visibility check. A candidate may be "published" in intent but never
   counted as published, with no error surfaced — the residual persists
   indefinitely (invariant `published-reflects-durable-visibility`).
4. **Owner-not-local / epoch-fence short-circuits.** Handoff-contract decisions
   that gate on owner locality or epoch freshness can defer the drain across an
   ownership change, orphaning the publication.

### Regression Guard

Prose alone will not prevent recurrence. The binding executable guards are the
`publication-drain-deterministic` liveness property in
`models/readiness-starvation/PublicationConvergence.tla` and a deterministic-drain
reschedule regression test for the reconcile deferral branch (asserting it
enqueues/drains rather than returning a silent `NO_CHANGE` / `TARGET_BLOCKED`
while a reconciled active node is still unpublished). These are the `doneWhen`
deliverables of the narrowly scoped Quest
`solve/quests/membership-publication-drain-determinism.json`; the
3-consecutive rolling-restart harness pass remains the integration gate of
`solve/quests/rolling-restart-core-stability.json`.

## Operational Analysis

The FMEA/STPA entries make the ping-pong risk explicit: same-layer proof can
keep closing without representative movement. Quest theory gates and
`npm run solve:health` are the workflow controls that prevent that from
becoming another local patch cycle.
