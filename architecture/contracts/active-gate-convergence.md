# Active Gate Convergence Contract

> **Reading this contract.** The block immediately below is the machine-readable
> `system-contract` consumed by `npm run model:contracts` — you do not need to
> read the JSON. For the human narrative, jump to
> [Membership Publication Drain](#membership-publication-drain-reconciled-but-unpublished-residual),
> [Protected Repair/ACTIVE Interaction](#protected-repairactive-interaction), and
> [Operational Analysis](#operational-analysis); the
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
    },
    {
      "owner": "authoritative_discovery_repair_owner",
      "boundary": "repair_admission_backoff"
    }
  ],
  "failureClasses": [
    "snapshot coverage and rebalancer handoff can move as coupled invariants",
    "fixing one owner boundary can leave the representative frontier unchanged because the paired invariant still blocks progress",
    "a reconciled active node can stay unpublished when the membership-publication drain pass no-ops without rescheduling, so missingPublishedCount never reaches zero",
    "the same undrained publication surfaces as correlated downstream symptoms (publication_missing_active_node, readiness_probe_timeout, and join retryable-resume budget exhaustion) that look like distinct bugs but share one root",
    "a repair caller can mistake force intent for permission to bypass owner-owned failed-repair backoff, reopening repair-storm amplification",
    "fresh lifecycle or publication evidence can coexist with a stale repair-deferred snapshot unless evidence advancement or repair completion re-drives the active-gate owner",
    "diagnostic node status, publication counts, and snapshot coverage can be mistaken for competing cluster-ACTIVE authorities"
  ],
  "stateVariables": [
    "activeGateState",
    "snapshotCoverage",
    "handoffEpoch",
    "pendingAcknowledgement",
    "staleEvent",
    "representativeResidualCount",
    "repairDisposition",
    "repairRetryAfterMs",
    "repairEvidenceRevision"
  ],
  "safetyInvariants": [
    {
      "id": "no-ambiguous-active-owner",
      "statement": "The model must not allow two active owners for the same handoff epoch."
    },
    {
      "id": "cluster-active-single-decision-owner",
      "statement": "Only startup_active_gate_owner decides cluster ACTIVE; node lifecycle status, membership publication counts, cache coverage, and admin or harness projections are evidence or presentation and cannot independently authorize convergence."
    },
    {
      "id": "failed-repair-backoff-non-bypassable",
      "statement": "Caller urgency, force intent, or successful-result reuse bypass cannot override an active failed-repair defer decision owned by authoritative_discovery_repair_owner; retry-after and single-flight pressure containment remain binding until the owner re-admits repair."
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
      "id": "deferred-repair-does-not-strand-active-gate",
      "statement": "A repair-deferred observation is not a terminal semantic veto: when relevant authoritative evidence advances, repair completes, or the owner retry boundary opens, active-gate re-evaluation remains reachable through the canonical owner path; periodic polling may recover missed wakes but is not the sole correctness path."
    }
  ],
  "knownResiduals": [
    "The liveness proof assumes fair scheduling and bounded owner re-entry; live readiness certification is evaluated separately.",
    "The exact evidence-revision wake mechanism is runtime-owned and may evolve; changes to it must preserve both failed-repair pressure containment and eventual active-gate re-evaluation in one coupled witness."
  ],
  "systemTheory": {
    "problemStatement": "Active-gate convergence requires snapshot coverage, durable publication visibility, authoritative repair pressure containment, and recoverable follow-up to remain coupled across owner handoff.",
    "phaseChain": [
      "owner reconcile identifies an eligible active node",
      "snapshot coverage is accepted for the current owner epoch",
      "authoritative discovery repair owner admits, reuses, or defers refresh work with typed retry evidence",
      "membership publication is written and read back as durably visible",
      "the startup active-gate owner adjudicates cluster ACTIVE from canonical evidence",
      "the node enters the published set or retains a typed retry or owner-wake obligation"
    ],
    "ownerBoundaryMap": [
      "startup_active_gate_owner / snapshot_coverage owns the cluster-ACTIVE decision plus publication and coverage convergence",
      "authoritative_discovery_repair_owner / repair_admission_backoff owns repair admission, failure backoff, retry-after, and repair-result reuse",
      "operation_workflow_owner / rebalancer_handoff preserves coverage and recoverable follow-up across handoff",
      "admin, diagnostics, and harness consumers submit observation intent and render owner outcomes; they do not own repair admission or cluster-ACTIVE semantics"
    ],
    "invariantRefs": [
      "cluster-active-single-decision-owner",
      "failed-repair-backoff-non-bypassable",
      "published-subset-covered",
      "covered-disjoint-pending",
      "active-gate-eventually-converged",
      "deferred-repair-does-not-strand-active-gate",
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
      "path": "src/admin/admin-service-discovery-repair-cache-methods.js",
      "owner": "authoritative_discovery_repair_owner",
      "boundary": "repair_admission_backoff",
      "transition": "successful-repair reuse may be bypassed by explicit freshness intent, while a live failed-repair DEFER_REPAIR decision remains owner-binding with retryAfterMs and cannot be bypassed by callers"
    },
    {
      "path": "src/admin/admin-control-snapshot-active-gate-handoff-projection.js",
      "owner": "startup_active_gate_owner",
      "boundary": "snapshot_coverage",
      "transition": "admin snapshot presentation projects active-gate owner evidence without becoming a second cluster-ACTIVE adjudicator"
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
      },
      {
        "failureMode": "a stale repair-deferred observation remains the effective ACTIVE-gate truth after newer authoritative evidence exists",
        "severity": "high - a healthy cluster can remain below the ACTIVE convergence gate",
        "detectability": "high - diagnostic publication/lifecycle evidence disagrees with the canonical active-gate decision while repairDisposition remains deferred",
        "mitigation": "keep failure backoff owner-binding but preserve an evidence-change, repair-completion, or retry-boundary re-drive into startup_active_gate_owner",
        "probe": "registered impact-contract coupled witness"
      }
    ],
    "stpa": [
      {
        "controller": "membership publication active-gate reconcile owner",
        "unsafeAction": "returns a terminal no-change outcome while a reconciled active node is still unpublished",
        "feedbackSignal": "missingPublishedCount, durable row visibility, owner epoch, and typed handoff next action",
        "ownerBoundary": "startup_active_gate_owner / snapshot_coverage"
      },
      {
        "controller": "authoritative discovery repair owner",
        "unsafeAction": "allows caller force intent to bypass an active failed-repair backoff, or leaves a deferred observation semantically sticky after the evidence revision changes",
        "feedbackSignal": "repair disposition, retryAfterMs, evidence revision, and active-gate owner wake/re-evaluation",
        "ownerBoundary": "authoritative_discovery_repair_owner / repair_admission_backoff -> startup_active_gate_owner / snapshot_coverage"
      }
    ]
  }
}
-->

## Failure Classes

This contract covers active-gate convergence failures in which snapshot
coverage, durable membership publication, authoritative repair observation, or
rebalancer handoff loses its owner, wake obligation, or epoch/evidence fence. A
local transition is not complete until its required durable visibility or
recoverable follow-up exists.

## Invariants

The active-gate model preserves unambiguous ownership and accepted snapshot
coverage across handoff events. Published membership is always a subset of
covered membership, durable row visibility precedes publication, and every
retryable residual retains a drain or wake action.

The cluster-ACTIVE semantic decision belongs only to
`startup_active_gate_owner`. Node lifecycle rows, membership-publication counts,
cache coverage, admin snapshots, diagnostics, and harness views are evidence or
presentation. They may disagree temporarily without becoming alternate ACTIVE
authorities.

Authoritative discovery repair admission and failed-repair backoff belong only
to `authoritative_discovery_repair_owner`. Caller urgency or a request to bypass
recent successful-result reuse cannot bypass a live failed-repair deferral.
Liveness is paired with that safety rule: once the evidence described by a
deferred observation materially advances, or repair/retry ownership advances,
the ACTIVE decision must remain reachable through the canonical owner path.

## Runtime Bindings

The runtime bindings are
`src/rebalancer/operation-workflow-owner-ports.js`,
`src/control-plane/membership-publication-active-gate-reconcile.js`,
`src/control-plane/publication-active-gate-handoff-contract-evidence.js`,
`src/admin/admin-service-discovery-repair-cache-methods.js`, and
`src/admin/admin-control-snapshot-active-gate-handoff-projection.js`.
Owner-boundary changes update this contract and validate the applicable model
and coupled-witness bindings.

## Model Bindings

The high-resolution model remains `models/active-gate/ActiveGate.tla`, backed
by the fast-check model under `test/model/active-gate/`. The action manifest is
the drift guard between the two surfaces. The membership-publication drain
liveness (a reconciled active node cannot stay unpublished while a drain/wake
action remains enabled) is bound to
`models/readiness-starvation/PublicationConvergence.tla`.

The repair/ACTIVE seam is additionally protected as a registered coupled pair
in `test/shards/impact-contracts.json`. Runtime changes that alter the seam must
keep the repair-pressure and ACTIVE-liveness witnesses green together; a model
extension is required in the same change when the state-machine semantics, not
only the wiring, change.

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

## Protected Repair/ACTIVE Interaction

The repair/ACTIVE seam is protected core because two individually correct
safety policies can otherwise ping-pong: aggressive freshness repair can reopen
a repair storm, while strong failure backoff can leave the ACTIVE consumer on a
stale observation.

The binding ownership split is:

1. `authoritative_discovery_repair_owner` decides whether repair is admitted,
   reused, deferred, or unavailable and owns retry/backoff timing.
2. `startup_active_gate_owner` decides whether the cluster has crossed ACTIVE
   convergence using canonical owner evidence.
3. Admin, diagnostics, and harness callers express observation/freshness intent
   and render the typed outcomes. They do not decide either semantic question.

Forbidden local fixes:

- making `bypassReuse`, force, or caller urgency bypass a live failed-repair
  deferral;
- deciding cluster ACTIVE directly from `nodes.status`, published-node counts,
  cache coverage, or another presentation projection;
- adding a reader-local repair/retry loop beside the authoritative repair
  owner;
- shortening a backoff or polling interval as the primary liveness mechanism;
- allowing a stale deferred observation to remain a terminal veto after the
  relevant owner evidence/revision has advanced.

A valid change must prove both sides in one deterministic coupled witness:
failed-repair pressure remains bounded **and** newer evidence/retry ownership
can re-drive the canonical ACTIVE decision. The registered impact contract
selects that proof whenever either endpoint changes; cross-endpoint changes are
hard-blocked from landing if the contract edge or exact witnesses are missing.

## Operational Analysis

The machine-readable FMEA/STPA entries above define the unsafe actions,
feedback signals, owner boundaries, and coupled repair/ACTIVE obligations checked
by the contract and impact tooling.
