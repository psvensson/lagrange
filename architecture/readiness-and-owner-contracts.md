# Readiness Gating & Owner-Contract Kernels

This document is the detailed home for the **Readiness Gating** concern named in
the [`overview.md`](overview.md) Single-Path Contract (item 6). It collects the
readiness dimensions and the shared cross-layer owner-contract kernels that used
to accumulate as a single unnavigable list item. Each subsection below is one
concern; the summary at the top of each is the invariant, and the prose is the
mechanism and its failure mode.

This narrative explains why the semantic owners exist without exposing the
contributor-only file-level owner ledger.

## Readiness Gating (repairEligible vs serveEligible)

Internal topology consumers (`ReplicaDispatchService`, `RebalanceCoordinator`,
`ManagedSplitWorkflow`, admission planning) use the shared `repairEligible`
dimension from `ControlPlaneReadinessService`. Routing and benchmark admission
use `serveEligible`.

Self-readiness may preserve `serveEligible` through one timed-out
`node_state_reporter` attempt when the last canonically visible local heartbeat
is still fresh; this prevents transient self-denial while the bounded
authoritative repair path is timing out under load.

## Cluster Membership Health

`NodeLivenessSemanticProjectionOwner` is the single semantic owner for the
time-dependent node facts that feed `isClusterMemberHealthy`,
`repairEligible`, membership derivation, and planning. It consumes raw row,
transport, reporter, and grace evidence at the readiness `TimeSource`'s numeric
`nowMs` and publishes an immutable projection containing status, connection,
cluster-membership, lease, heartbeat, repair, transport-grace, provisioning
trust, and local-reporter semantics.

The owner preserves the existing fact-specific clocks rather than collapsing
them into one liveness timeout: 60-second derivation grace, 30-second
cluster-member heartbeat freshness, row-defined ready-lease validity,
10-second repair freshness, and 15-second transport grace. It exposes the
earliest future semantic deadline, drives that deadline with one coalesced
readiness-owned timer, and rotates a per-node generation only when semantic
content changes. Relevant cache and transport events reproject immediately;
an overdue consumer read is only a lazy backstop for delayed timer delivery.

The guards below are expressed by that projection. Readiness, membership
planning, rebalancing, diagnostics, and node-trust views consume the projected
verdict or generation. They do not compare raw timestamps or use presentation
ages as a second authority.

### Transport-reconciled cluster membership

The liveness owner reconciles cache lease/heartbeat evidence with live
transport connectivity from the `MessageRouter`. When the existing membership
rules permit transport to rescue lagging cache evidence, every consumer sees
that same projected verdict. A transport change is an authoritative source
event and reprojects the affected node without waiting for a NODES write.

### Lease sweep transport guard

`LeaseService` consults the `MessageRouter` before marking a node as
disconnected during expired-lease sweeps. When the router reports the node as
connected or ready, the sweep skips the disconnect — the expired lease is caused
by CDC propagation delay, not actual node failure. Without this guard, the sweep
poisons the `connection_state` field in the cache, causing
`isClusterMemberHealthy` to return false for all nodes and blocking split child
provisioning admission.

### Self-node cluster membership fast path

When a node evaluates its own cluster membership (`nodeId === this.nodeId`) and
its cached status is `active`, it is trivially healthy — the node is alive and
executing the check. This is the strongest possible signal, stronger than any
cache lease or transport evidence. Without this, CDC propagation delays during
topology changes cause the local cache lease to expire before the heartbeat CDC
event propagates back, leading to self-denial of load-lane admission.

### Load-lane cache invalidation

The load-lane readiness path (`resolveLoadLaneReadinessSnapshot` in
`AdminWebSocketAPI`) does not use `allowStaleOnCacheChange`, so cache
invalidation forces immediate re-evaluation rather than serving a stale
snapshot. This ensures load-lane admission reflects the latest readiness state
after topology changes.

## Promise-Shaped Owner Contract Kernel

`src/control-plane/owner-contract-outcome.js` defines one shared cross-layer
envelope: `contractState` (`ready`, `pending`, `deferred`, `blocked`, `failed`)
plus `nextAction` (`proceed`, `wait`, `retry`, `stop`). Reason codes, retry
hints, visibility state, runtime-authority evidence, and durable protocol phase
remain attached as evidence instead of widening the caller-facing branch
surface.

## Readiness-Owner Read Interaction

`AuthoritativeControlPlaneView.readReadinessOwnerRows(...)` owns the complete
cross-subsystem contract for reads whose result is an input to readiness or
formation. It fixes owner-RPC-required delivery, canonical-leader requirement,
served-by-leader witness validation, SQL-fallback denial, and the
readiness-internal authority purpose in one named operation;
callers own only query shape, workload, and timeout.

Query routing for that operation admits an active addressed owner service only
when the shared live-transport owner reports the peer connected. A follower,
stale session pin, missing leader, or unwitnessed ACK cannot satisfy it. It deliberately
does not consult node readiness, ready leases, or a joiner's local nodes
projection: those are downstream consumers of the very owner answer being
requested. Ordinary reads keep the full readiness gate. This is the interaction
form of single ownership: each subsystem may have one owner internally, but the
edge between them must also have one owner and cannot be reconstructed from
caller-local flags or projections.

## Control-Plane Mutation Defer Contract

Background gateway-owned metadata writes and retryable routed system-table SQL
DML both consume `ControlPlaneMutationReadiness`, which derives one canonical
deferred outcome from `ControlPlaneReadinessService` while publication
convergence is still establishing. `ControlPlaneSystemTableGateway` normalizes
those mutation results into the shared owner-contract envelope, and admin plus
harness consumers preserve `contractState`/`nextAction` alongside the legacy
`outcome`/`reasonCodes`/`runtimeAuthority` evidence instead of inferring meaning
from opaque write timeouts. The same owner also classifies transaction-control
routing gaps on `sql_transactions`, `sql_transaction_participants`, and
`sql_write_operations`, so retryable system-table mutations preserve one explicit
deferred owner-gap outcome instead of re-entering CDC retry loops as generic
distributed failures.

## Control-Plane Write-Health Contract

Bootstrap/startup readiness consumes one shared `ControlPlaneWriteHealth` owner,
which reuses heartbeat publication evidence plus transport pressure partitions to
distinguish three states: `healthy`, `background_backlog_contained`, and
`critical_write_unhealthy`. Contained observability backlog is exposed as
degraded soft context, while true critical-reserve exhaustion remains a hard
readiness blocker. This prevents background heartbeat churn from poisoning the
same dependency used by actual control-plane write loss.

## Canonical Leader-Gap Routing Contract

Routing snapshots derive one shared `canonicalLeaderRoutingGapState` from
canonical leader identity and required-table service visibility. Query write
routing and `ControlPlaneKernelIngress` consume that same state, so only
recovery-owned system-table writes may widen on `owner_missing` or
`service_missing` during `controlPlaneRecoveryEligible`; steady-state writes stay
fail-closed, while local `NODE_STATE_UPDATE` ingress keeps only a bounded local
fallback on that same contract.

## Priority Recovery Completion Contract

Critical control-plane recovery derives one shared `PriorityRecoveryCompletion`
outcome, including bounded `temporaryOverflowVoterBudget` while replace/remove
work is still pending. `PartitionService`, priority remove-safety, and other
recovery consumers must use that completion/planning contract instead of
inferring temporary overflow or authoritative recovery membership from local
voter-count math or stale durable published-membership rows, so multi-learner
recovery can finish without widening steady-state promotion rules or deadlocking
source removal behind lagging publication visibility.

## Strict CDC Recovery-Routing Contract

Strict system-table CDC dissemination derives one shared
`MessageGroupForwardingOwner.resolveCdcIngressDecision(...)` outcome. For strict
CDC tables, the forwarding owner reuses one recovery-routing contract from the
system-table partition `controlPlaneRecoveryEligible` routing snapshot, ordered
connected message-group candidates, and bounded local system-table write
availability. Metadata-ingress readiness, bootstrap/join CDC propagation, and
strict CDC apply-vs-forward execution must therefore consume the same ingress
states: `forward_strict_target`, `forward_strict_recovery_target`,
`local_strict_convergence_ingress`, `local_strict_recovery_ingress`, or
`defer_strict_target_unknown`, instead of re-deriving leader-unknown behavior
from partial cache visibility.

## Benchmark Admission Contracts

### Benchmark table bootstrap timeout

Admin control-lane SQL requests derive one inner `SqlRequest.timeoutBudget` with
bounded completion margin, and `CREATE TABLE` carries that same budget through
`SQLQueryEngine` and `TableCreationService` into initial partition provisioning
and `IF NOT EXISTS` reconciliation. Benchmark table bootstrap must therefore fail
or defer on the same caller-owned timeout path instead of letting inner
provisioning outlive the outer admin request.

### Benchmark load-node availability

Distributed harness benchmark load first derives one shared
`Cluster.resolveBenchmarkLoadAdmissionSnapshot(...)` from table-local benchmark
discovery plus the real load lane, then `benchmark-partition-convergence`
combines that snapshot with replica-bearing spread so planners can distinguish
`ready_replica` from `replica_blocked` and `routed_admission_only` while
preserving the readiness and degradation evidence that explains each node:
routing/schema/topology readiness, local replica role and voter readiness,
degradation state, blocker reasons, and bounded `retryAfterMs`.

The same convergence owner also derives one explicit dispatch contribution
state: `local_primary`, `local_blocked`, `routed_support`, or `none`.
`resolveBenchmarkPartitionDispatchMode(...)` then derives one shared
steady-dispatch outcome from that convergence snapshot: `local_ready_only` or
`bootstrap_backfill_required`. Partitioning load must therefore stay in backfill
mode until the usable-spread target exists, instead of collapsing to the smaller
bootstrap quorum while replica-bearing or routed support is still needed.

`LoadNodeAvailability` then derives one canonical dispatch state from local
cooldown, external admission, and sustained slot saturation. Borrowed
healthy-node overflow is explicit as `slot_borrowing`, while `slot_stalled` is
reserved for peers that have aged out at the borrowed dispatch ceiling, not
merely at the steady contribution floor. Healthy benchmark nodes can therefore
keep borrowing that budget instead of being capped by peers that are only
nominally admitted or only routable through another node.

## Boundary Catalog Rule

Hotspot boundaries use the same fields each time: semantic owner, canonical
evidence, canonical vocabulary, allowed consumers, forbidden reinterpretations,
and primary diagnostics. The current catalog centers on:

- benchmark load admission
- usable benchmark spread
- benchmark dispatch contribution
- structured deferred owner outcomes
- promise-shaped owner contracts: callers branch on `contractState` and
  `nextAction`; visibility, phase, and owner-specific outcome labels stay in
  reasons/evidence
- strict CDC recovery ingress
- diagnostics as derived consumers of owner state

Architectural fixes in these areas should extend that catalog instead of adding
new prose-only explanations or caller-local interpretations.
