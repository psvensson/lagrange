# Design

## Overview

This tranche does not replace the existing topology owners. It closes the gap
between owner-written topology truth and cluster-wide convergence by adding one
canonical control-plane publication workflow and one durable publication
artifact that all restart, readiness, and harness convergence decisions can
share.

The design reuses the repository's existing authoritative read path,
readiness service, owner-key reconcile queues, durable workflow coordinator,
operation lanes, admin control snapshot, heartbeat publication diagnostics,
and priority control-plane partition spread logic. The new work extends those
components so the cluster can converge on one published membership epoch even
when CDC replay is still catching up.

## Goals

1. Provide one durable, owner-published control-plane membership view.
2. Separate convergence completion from local cache repair completion.
3. Prioritize and serialize recovery of the control-plane partitions that gate
   restart and transaction recovery.
4. Add an explicit publication convergence readiness stage.
5. Cut harness, benchmark admission, and restart readiness over to the
   published artifact.

## Non-Goals

1. No second placement planner.
2. No second replica lifecycle owner.
3. No replacement of `SystemTableCache` as the steady-state observational read
   model.
4. No replacement of CDC as the steady-state propagation path.
5. No open-ended "repair until green" heuristics without a durable publication
   contract.

## Reused Building Blocks

The following existing components are extended rather than replaced:

- `AuthoritativeControlPlaneView`
  - authoritative owner-backed reads for convergence-critical rows
- `ControlPlaneReadinessService`
  - canonical readiness dimensions, diagnostics ledger, recovery epoch history,
    readiness operation lanes
- `OwnerKeyReconcileQueue`
  - single in-flight reconcile per owner key
- `DurableWorkflowCoordinator`
  - durable monotonic workflow transitions with fence tokens
- `OperationLane`
  - owner-scoped exclusive execution and timeout-budget plumbing
- `UnifiedRebalancer`
  - existing priority control-plane partition spread checks
- `AdminControlSnapshot` and authoritative discovery repair
  - admin surfacing of convergence and repair diagnostics
- `HeartbeatService`
  - existing publication-path diagnostics and optional visibility proof model
- `active-node-projection`
  - canonical active-node derivation helper to be cut over to published state

## Owner Model

### Existing Owners Preserved

- `nodes`, `node_endpoints` -> existing node lifecycle / heartbeat owners
- `partitions` -> canonical partition owner rows
- `services` -> service lifecycle and replica owners
- `replica_operations` -> `RebalanceCoordinator`
- transaction workflow tables -> `DistributedTransactionCoordinator`
- steady-state metadata propagation -> CDC pipeline and `SystemTableCache`

### New Owner

A new `MembershipPublicationCoordinator` owns only the publication workflow and
publication artifact. It does not own topology planning or row lifecycle for
existing topology tables.

Responsibilities:

- derive publication candidates from canonical owners
- open publication epochs
- persist publication rows
- track acknowledgement progress
- close or abandon publication epochs
- emit publication diagnostics for readiness/admin/harness consumers

## New Durable Artifact

### System Table: `control_plane_publications`

Add one system table for durable publication state.

Concrete repository mapping for this artifact:

- `TABLES.CONTROL_PLANE_PUBLICATIONS` in `src/constants/tables.js`
- `SYSTEM_TABLE_NAME.CONTROL_PLANE_PUBLICATIONS` in
  `src/bootstrap/system-table-schemas-constants.js`
- `CONTROL_PLANE_PUBLICATIONS_SCHEMA` in
  `src/bootstrap/system-table-schemas-constants.js`
- `ControlPlanePublicationsOwner` in
  `src/control-plane/owners/control-plane-publications-owner.js`
- `MembershipPublicationCoordinator` in
  `src/control-plane/membership-publication-coordinator.js`
- `CONTROL_PLANE_READINESS_DIMENSION.CONTROL_PLANE_PUBLISHED` in
  `src/control-plane/control-plane-readiness-constants.js`

Concrete test targets for the initial tranche:

- publication artifact derivation and acknowledgement:
  `test/control-plane/membership-publication-coordinator.test.js`
- readiness cutover:
  `test/control-plane/control-plane-readiness-service.test.js`
- active-node projection cutover:
  `test/control-plane/active-node-projection.test.js`
- harness benchmark and restart-readiness cutover:
  `test/distributed/harness/__tests__/cluster.test.js`

Suggested row shape:

- `publication_id`
- `publication_kind`
  - initially `cluster_membership`
- `publication_epoch`
- `publisher_node_id`
- `source_topology_epoch`
- `source_snapshot_version`
- `published_active_node_ids`
- `required_ack_node_ids`
- `acknowledged_node_ids`
- `priority_partition_summary`
- `status`
  - `OPEN`
  - `ACK_PENDING`
  - `PUBLISHED`
  - `ABANDONED`
  - `SUPERSEDED`
- `reason_code`
- `created_at`
- `updated_at`
- `published_at`
- `closed_at`
- `transition_history`

This table is not a second topology store. It is a durable convergence record
that says: "given canonical topology rows at source version X, the cluster has
published and acknowledged active set Y under publication epoch Z."

## Publication Workflow

### 1. Trigger Conditions

The publication owner is enqueued when any of the following occur:

- node lifecycle or heartbeat updates change canonical member health
- priority control-plane partition spread changes
- `replica_operations` or transaction workflow rows enter or leave
  convergence-critical states
- restart recovery begins or ends
- publication health degrades
- authoritative control snapshot detects a gap between published state and
  canonical owner state

### 2. Derive Candidate Publication

The coordinator performs authoritative reads for the minimal convergence set:

- `nodes`
- `node_endpoints`
- `services`
- `partitions`
- `replica_operations`
- `sql_transactions`
- `sql_transaction_participants`
- `sql_write_operations`
- current publication rows

The coordinator derives:

- candidate active node IDs
- required acknowledgement node IDs
- priority partition spread summary
- source topology epoch / source snapshot version
- whether priority recovery mode is required

### 3. Open Or Advance Publication Epoch

If the derived candidate differs from the latest durable published state, the
coordinator opens a new publication epoch.

The open transition is persisted via `DurableWorkflowCoordinator.transitionStep`
with owner key `membership-publication:cluster-membership`.

Transitions:

- `IDLE -> DERIVING`
- `DERIVING -> OPEN`
- `OPEN -> ACK_PENDING`
- `ACK_PENDING -> PUBLISHED`
- `ACK_PENDING -> ABANDONED`
- `OPEN -> SUPERSEDED`
- `ACK_PENDING -> SUPERSEDED`

### 4. Acknowledgement

A node acknowledges a publication epoch when it can authoritatively observe the
publication row and verify that the epoch is locally visible through the
canonical publication owner path.

Acknowledgement rules:

- acknowledgement uses an owner-routed mutation path, not cache-only inference
- acknowledgements are idempotent per `(publication_id, node_id)`
- the publication owner closes the epoch only when all required
  acknowledgements are durable
- timeouts and abandonment use shared timeout budgets

### 5. Publication Completion

Publication is complete only when:

- priority recovery preconditions are satisfied
- the publication row is durable
- required acknowledgements are durable
- no newer superseding epoch exists

Only then does the coordinator mark the row `PUBLISHED`.

## Separation From CDC Catch-Up

### Principle

CDC remains the steady-state propagation path, but publication completion does
not wait for all nodes to finish local CDC replay.

### Mechanism

1. The publication owner uses `AuthoritativeControlPlaneView` for reads.
2. Publication rows are written through an authoritative owner path.
3. Readiness, harness, and benchmark gating read the publication artifact from
   authoritative state first.
4. `SystemTableCache` repair may hydrate or accelerate local observation, but
   publication success does not depend on that repair.

### Why This Works

This preserves the single-owner model:

- existing topology rows remain the source of topology truth
- the publication row is only a convergence checkpoint
- cache repair remains observational, not the completion oracle

## Priority Control-Plane Recovery Mode

### Trigger

Priority recovery mode is active when any of the following are true:

- latest publication row is not `PUBLISHED`
- priority partitions do not satisfy quorum and spread policy
- control-plane writability is degraded
- recovery eligibility is false for nodes that should participate
- restart recovery is active for any published member

### Behavior

When active:

- non-critical rebalancing is deferred
- optional background topology work yields
- priority partition spread and publication workflows use dedicated lanes
- background mutation paths consult the priority recovery state before running

### Priority Partition Set

Initial required set:

- `replica_operations-p1`
- `sql_transactions-p1`
- `sql_transaction_participants-p1`
- `sql_write_operations-p1`

The design keeps the existing spread blocker in `UnifiedRebalancer` but extends
it with publication-aware state so the blocker depends on published convergence,
not only local ready replicas.

## Serialized Execution Model

### Owner Keys

Use stable owner keys:

- `membership-publication:cluster-membership`
- `priority-recovery:replica_operations-p1`
- `priority-recovery:sql_transactions-p1`
- `priority-recovery:sql_transaction_participants-p1`
- `priority-recovery:sql_write_operations-p1`

### Execution Primitives

- `OwnerKeyReconcileQueue` receives typed reasons
- `OperationLane` ensures one exclusive execution per owner key
- `DurableWorkflowCoordinator` records monotonic transitions

### Fence Tokens

Fence tokens prevent stale executors from overwriting newer publication epochs
or recovery transitions.

## Readiness Cutover

### New Dimension

Add one new readiness dimension:

- `controlPlanePublished`

### Semantics

`controlPlanePublished == true` when the local node can authoritatively observe
that the latest required publication epoch is durable and either:

- fully published, or
- already acknowledged by this node when the epoch remains open for other
  nodes.

### Updated Staging

The readiness progression becomes:

1. `processAlive`
2. `clusterMemberHealthy`
3. `controlPlaneWritable`
4. `metadataPublicationHealthy`
5. `controlPlanePublished`
6. `controlPlaneRecoveryEligible`
7. `repairEligible`
8. `serveEligible`

### Updated Composite Rules

- `controlPlaneRecoveryEligible` requires publication convergence
- `repairEligible` requires recovery eligibility plus priority recovery policy
- `serveEligible` remains stricter and still depends on routing/load readiness

## Active-Node Projection Cutover

`resolveCanonicalActiveNodeIds()` is extended to prefer the latest durable
published active-node set when available.

Fallback order:

1. latest durable `control_plane_publications` row
2. authoritative control snapshot derived from owner rows
3. existing cache/readiness projection

This keeps degraded modes available while making the success path depend on the
published artifact.

## Admin And Harness Cutover

### Admin Control Snapshot

Extend the admin control snapshot with:

- latest publication epoch
- latest publication status
- published active-node IDs
- required and acknowledged node IDs
- priority recovery mode state
- priority partition spread summary
- publication source version summary

### Harness

The harness success path should verify:

- all sampled nodes agree on the latest publication epoch
- all sampled nodes agree on the latest published active-node set
- publication status is `PUBLISHED`
- priority recovery mode is inactive before benchmark-ready admission

The harness should continue to emit failures when disagreement persists.

## Diagnostics Model

### Distinguish Publication From Repair

Every admin and readiness surface must distinguish:

- repaired observational state
- authoritative source state
- durable published state

### Recovery Epoch Correlation

Extend the existing recovery epoch history in `ControlPlaneReadinessService` so
recovery episodes record:

- publication epoch entered during recovery
- publication epoch closed during recovery
- publication failure reason codes
- priority partition spread gap at entry and exit

## Testing Strategy

### Unit Tests

- publication row creation and monotonic epoch progression
- acknowledgement idempotency
- readiness evaluation for `controlPlanePublished`
- active-node projection preference for published set
- priority recovery activation and deactivation

### Integration Tests

- rolling restart
- node join under load
- seed restart under load
- transaction recovery under restart churn
- postgres baseline discovery using published active-node state

### Matrix Validation

The final matrix rerun must show:

- no active-node disagreement after recovery gates pass
- priority control-plane partitions spread before non-critical rebalance
- recovery readiness and benchmark-ready admission use the same published epoch
- CDC backlog no longer blocks publication completion

## Implementation Notes

1. This design is intentionally additive.
2. It reuses existing owner machinery wherever possible.
3. The main new state is the durable publication artifact and its workflow.
4. The main cutover risk is changing success criteria from repaired observation
   to durable published convergence; that is why the rollout is phased.
