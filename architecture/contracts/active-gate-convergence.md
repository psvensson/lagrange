# Active Gate Convergence Contract

> **Reading this contract.** The block immediately below is the machine-readable
> `system-contract` consumed by `npm run model:contracts` — you do not need to
> read the JSON. For the human narrative, jump to
> [Membership Publication Drain](#membership-publication-drain-reconciled-but-unpublished-residual)
> and [Operational Analysis](#operational-analysis); the
> [Failure Classes](#failure-classes), [Invariants](#invariants),
> [Runtime Bindings](#runtime-bindings), and [Model Bindings](#model-bindings)
> sections render the same contract in prose.

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
    "the same undrained publication surfaces as correlated downstream symptoms (publication_missing_active_node, readiness_probe_timeout, and join retryable-resume budget exhaustion) that look like distinct bugs but share one root",
    "a transient authoritative-repair failure defers with a bounded backoff, the underlying authoritative/cache/discovery evidence subsequently advances, but the active-gate owner keeps re-reading the stale repair-deferred observation because no level-trigger invalidates it against the now-advanced owner evidence"
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
    },
    {
      "id": "active-gate-evidence-advance-level-trigger",
      "statement": "While a repair-deferred observation is still binding, when the repair owner's authoritative evidence revision for the same failed table(s) advances materially past the deferred repair's own evidence revision, the active-gate owner re-evaluates the ACTIVE meaning against the advanced evidence (without re-admitting repair and without weakening the backoff) and converges; same unchanged failed evidence keeps the backoff honored."
    }
  ],
  "knownResiduals": [
    "The liveness proof assumes fair scheduling and bounded owner re-entry; live readiness certification is evaluated separately."
  ],
  "systemTheory": {
    "problemStatement": "Active-gate convergence requires snapshot coverage, durable publication visibility, and recoverable follow-up to remain coupled across owner handoff.",
    "phaseChain": [
      "owner reconcile identifies an eligible active node",
      "snapshot coverage is accepted for the current owner epoch",
      "membership publication is written and read back as durably visible",
      "the node enters the published set or retains a typed retry or owner-wake obligation"
    ],
    "ownerBoundaryMap": [
      "startup_active_gate_owner / snapshot_coverage owns publication and coverage convergence",
      "operation_workflow_owner / rebalancer_handoff preserves coverage and recoverable follow-up across handoff"
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
      "evidenceArtifact": "architecture/contracts/evidence/active-gate-tlc-route.model.report.json",
      "ledgerRef": "theory-20260529-rolling-restart-active-gate-snapshot-coverage-architecture-gap-stop",
      "note": "TLC proves EventuallyConverged under bounded owner re-entry and returns a liveness counterexample for an unbounded deferral loop."
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
    },
    {
      "path": "src/control-plane/control-plane-snapshot-owner-evidence-advance.js",
      "owner": "startup_active_gate_owner",
      "boundary": "snapshot_coverage",
      "transition": "probeRepairOwnerEvidenceAdvance consumes the repair owner's typed evidence-revision observation and re-evaluates a repair-deferred ACTIVE observation against materially-newer authoritative evidence, converging without re-admitting repair or weakening the e2797b6c8 backoff"
    },
    {
      "path": "src/admin/admin-service-discovery-repair-cache-methods.js",
      "owner": "authoritative_discovery_repair_owner",
      "boundary": "authoritative_repair_admission",
      "transition": "probeAuthoritativeDiscoveryEvidenceRevision answers the current authoritative evidence revision for the deferred repair's own failed table(s) as an observation-only typed read; it admits no repair, records no attempt, and leaves the failure-deferral (keyed by repair tables + failure class + time, no bypassReuse guard) fully binding"
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
      "name": "system contract registry",
      "probe": "npm run model:contract-records"
    }
  ],
  "questRefs": [
    "solve/quests/membership-publication-drain-determinism.json"
  ],
  "theoryLedgerRefs": [
    "theory-20260529-rolling-restart-active-gate-priority-recovery-coupled-invariants"
  ],
  "failureAnalysis": {
    "fmea": [
      {
        "failureMode": "a reconciled active node remains unpublished without an enabled drain or owner wake",
        "severity": "high - readiness and membership convergence can remain blocked",
        "detectability": "high - missingPublishedCount and the typed handoff action expose the residual",
        "mitigation": "preserve durable readback and a retry, drain, or owner-wake obligation until the residual reaches zero",
        "probe": "npm run model:check"
      }
    ],
    "stpa": [
      {
        "controller": "membership publication active-gate reconcile owner",
        "unsafeAction": "returns a terminal no-change outcome while a reconciled active node is still unpublished",
        "feedbackSignal": "missingPublishedCount, durable row visibility, owner epoch, and typed handoff next action",
        "ownerBoundary": "startup_active_gate_owner / snapshot_coverage"
      }
    ]
  }
}
-->

## Failure Classes

This contract covers active-gate convergence failures in which snapshot
coverage, durable membership publication, or rebalancer handoff loses its
owner, wake obligation, or epoch fence. A local transition is not complete
until its required durable visibility or recoverable follow-up exists.

## Invariants

The active-gate model preserves unambiguous ownership and accepted snapshot
coverage across handoff events. Published membership is always a subset of
covered membership, durable row visibility precedes publication, and every
retryable residual retains a drain or wake action.

## Runtime Bindings

The runtime bindings are
`src/rebalancer/operation-workflow-owner-ports.js`,
`src/control-plane/membership-publication-active-gate-reconcile.js`, and
`src/control-plane/publication-active-gate-handoff-contract-evidence.js`.
Owner-boundary changes update this contract and validate both model bindings.

## Model Bindings

The high-resolution model remains `models/active-gate/ActiveGate.tla`, backed
by the fast-check model under `test/model/active-gate/`. The action manifest is
the drift guard between the two surfaces. The membership-publication drain
liveness (a reconciled active node cannot stay unpublished while a drain/wake
action remains enabled) is bound to
`models/readiness-starvation/PublicationConvergence.tla`.

## Membership Publication Drain (Reconciled-But-Unpublished Residual)

The owner path is `startup_active_gate_owner / snapshot_coverage`. The drain
lives in
`src/control-plane/membership-publication-active-gate-reconcile.js`
(`drainActiveGateMembershipPublicationSnapshotQueue` and
`reconcileActiveGateMembershipPublication`); the residual is derived by
`resolvePublicationActiveGateHandoffMissingPublishedNodeIds` in
`src/control-plane/publication-active-gate-handoff-contract-evidence.js`.

`missingPublishedCount` is the expected-minus-durably-published residual. It is
not a completion signal and may not be cleared from publication intent alone.
The reconcile path confirms the target row through durable readback before the
node enters the published set.

### Publication Drain Obligations

1. A retryable deferral retains queue pressure or schedules an owner wake.
2. A drain result reports work performed; it does not by itself prove that the
   publication residual reached zero.
3. An `ABSENT_ROW` or non-visible readback remains unpublished and preserves the
   follow-up obligation.
4. Owner-locality and epoch-fence failures return typed retry/wait outcomes so
   ownership changes cannot orphan the publication.
5. Protected pressure lanes carry convergence-critical publication and join
   work; background node-state publication remains background work.

### Executable Guards

The binding executable guards are the
`publication-drain-deterministic` liveness property in
`models/readiness-starvation/PublicationConvergence.tla` and a deterministic-drain
reschedule regression for the reconcile deferral branch. The regression asserts
that retryable unpublished residuals enqueue, drain, or retain an owner wake
instead of returning a terminal no-change outcome.

## Operational Analysis

The machine-readable FMEA/STPA entries above define the unsafe actions,
feedback signals, and owner boundaries checked by the contract tooling.
