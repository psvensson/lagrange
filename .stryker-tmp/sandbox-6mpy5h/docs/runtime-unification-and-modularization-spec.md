# Runtime Unification and Modularization Specification

This specification defines a target architecture for simplifying runtime
ownership, reducing duplicated control-plane logic, and making development
changes safer and more modular.

It is based on repeated failure patterns already visible in the codebase:

- duplicated raft lifecycle logic across replica services
- overlapping authority between `services` and group-owner tables
- repeated cache-visibility retry logic in multiple services
- harness/runtime config normalization split across multiple layers
- diagnostics and control snapshots deriving truth from ambiguous projections

The intent is not a cosmetic refactor. The intent is to remove entire classes
of bugs by reducing the number of places where the same decision can be made.

## 1. Problem Statement

The current system works, but important control-plane behavior is spread across
too many layers:

1. Replica lifecycle behavior exists in both shared raft abstractions and
   domain services.
2. Leader truth is represented both as per-replica role and as per-group leader
   identity, but readers do not always consume those fields with the same
   ownership model.
3. System-table row mutation reliability is implemented repeatedly instead of
   through one primitive.
4. Harness defaults are partially parsed in generic config code and partially
   normalized again inside scenario code.
5. Diagnostics often infer canonical state from whichever local projection is
   easiest to read, instead of a single owner-defined model.

This creates three practical problems:

1. Bug fixes must often be applied in more than one place.
2. Control-plane correctness depends on implicit conventions rather than hard
   module boundaries.
3. New feature work pays a high integration tax because every change must touch
   runtime logic, system metadata, diagnostics, and harness policy separately.

## 2. Goals

The target architecture MUST satisfy the following goals:

1. One owner per concern, per the system steering rules.
2. One canonical lifecycle path for raft-backed replicas.
3. One canonical authority model for system-table rows and field subsets.
4. One shared mutation primitive for authoritative system-table updates with
   cache-visibility confirmation and retry behavior.
5. One normalized scenario-config model before scenario execution starts.
6. One canonical control-snapshot and consistency-evaluation contract.
7. Clear module seams so new features can be added by extending one layer
   rather than editing several parallel implementations.

## 3. Non-Goals

This specification does not require:

1. A change in storage model. Tables, partitions, CDC, and raft groups remain.
2. A change in transport model. Router-based communication remains.
3. A rewrite of the distributed harness.
4. A change from liferaft to another raft provider in this workstream.
5. Immediate removal of all legacy code in one patch. Migration may be phased,
   but each completed phase must converge to a single owning path.

## 4. Architectural Principles

The following principles are mandatory for all work produced under this spec.

### 4.1 Canonical Runtime Layers

The system will be organized into four explicit layers:

1. Replica Runtime Platform
   - raft lifecycle
   - leader/follower/candidate transitions
   - learner promotion
   - role persistence scheduling
   - leader identity persistence scheduling
   - retry semantics for owner writes
2. Metadata Authority
   - canonical row creation owner
   - canonical row update owner
   - field-subset ownership
   - owner-defined read models
3. Runtime Read Models and Diagnostics
   - control snapshots
   - readiness projections
   - consistency evaluation inputs
   - operator-facing diagnostics
4. Harness and Scenario Contracts
   - config normalization
   - timeout budgets
   - gate contracts
   - report structure

No module may silently implement logic owned by a lower or parallel layer.

### 4.2 Single Path, No Fallback

Once a concern is assigned to one owner, all callers must route through that
owner. There must not be:

- best-effort alternative owners
- parallel caches of canonical state
- inference-based reconstruction when owner state is available
- "new path plus old path" compatibility logic outside explicit migration
  boundaries

### 4.3 Canonical Read Before Derived Read

If a read path needs group leadership or lifecycle truth, it must consume the
group-owner row first and only use replica rows as detail. The system must not
let convenience projections outrank canonical authority.

## 5. Target Architecture

### 5.1 Replica Runtime Platform

All raft-backed domain services must inherit the same lifecycle behavior from a
single platform layer. The shared layer will own:

1. raft event wiring
2. local leader/follower/candidate transitions
3. leader-change reconciliation
4. learner promotion timing and promotion-state transitions
5. pending role update state
6. pending leader-node update state
7. persistence retry timers
8. demotion semantics when leader-change is observed without a separate local
   follower event

### Required Module Shape

Introduce or complete a platform module with this ownership:

- `RaftReplicaBase` owns lifecycle semantics
- `replica-leadership-state` owns shared transition helpers only
- domain services provide only:
  - entity identity
  - owner-table names and row keys
  - domain-specific callbacks
  - domain-specific replication behavior

`PartitionService` and `MessageGroupService` must not each wire their own
slightly different raft lifecycle behavior once this migration is complete.

### Required API Direction

The base layer must expose narrow overridable hooks rather than requiring
services to copy lifecycle code. Examples:

1. `onBecameLeader()`
2. `onBecameFollower()`
3. `onLeaderChanged(nextLeaderId)`
4. `flushRoleUpdate()`
5. `flushLeaderNodeUpdate()`
6. `isOwnerTableWriteReady()`

The base layer owns when these hooks run. Domain services own only what those
hooks do for their entity type.

### 5.2 Metadata Authority Model

System-table ownership must be explicit and stable.

#### 5.2.1 Group-Owner Rows

The table that owns a group entity must own group identity state.

For partition-backed tables:

- `partitions` owns:
  - `partition_id`
  - `table_id`
  - `table_name`
  - `replica_count`
  - `leader_node_id`
  - partition-level lifecycle/state fields

For message-group-backed entities:

- `message_groups` owns:
  - `group_id`
  - `leader_node_id`
  - group-level lifecycle/state fields

#### 5.2.2 Replica Rows

`services` owns per-replica state only:

- `service_id`
- `service_type`
- `node_id`
- `partition_id` or `group_id`
- `replica_id`
- `address`
- `status`
- `raft_role`
- lifecycle/status transition fields that belong to the replica row

#### 5.2.3 Canonical Truth Rules

1. Group leader identity comes from the group-owner row.
2. Replica role comes from the replica row.
3. If replica rows imply a different leader than the owner row, that is an
   inconsistency signal, not an alternative truth source.
4. Read models must surface that inconsistency explicitly instead of silently
   choosing one projection based on row iteration order.

### 5.3 Shared Authoritative Mutation Primitive

All authoritative system-table updates that require cache visibility must use
one shared primitive.

#### Required Behavior

The primitive must own:

1. canonical row key construction
2. partial update shape validation
3. expected cache fields
4. cache-visibility confirmation
5. authoritative fallback read on cache visibility gap
6. retry scheduling
7. caller-visible failure classification

#### Forbidden Behavior

Domain services must not each separately implement:

- local pending update maps
- ad hoc cache equality checks
- ad hoc retry timers
- ad hoc authoritative read fallback

#### Required Output Model

The shared primitive must produce a structured result:

```javascript
{
  applied: true,
  authoritativeWriteApplied: true,
  cacheVisible: true,
  recoveredFromCacheGap: false,
  attempts: 1,
}
```

Failure results must preserve reason classification such as:

- owner-not-ready
- authoritative-write-failed
- cache-visibility-gap-recovered
- cache-visibility-gap-unrecovered

### 5.4 Canonical Control Snapshot Contract

Control snapshots must stop rebuilding leadership truth from whichever local
`services` row last overwrote a map entry.

#### Required Control Snapshot Rules

1. `leaders[partitionId]` must be derived from the owner row:
   - `partitions.leader_node_id` for partitions
   - `message_groups.leader_node_id` for message groups
2. Replica rows may be attached as supporting detail only.
3. If more than one replica row is marked `raft_role = leader` for the same
   partition, the snapshot must report a diagnostic inconsistency field.
4. Snapshot readers must not treat duplicate local leader rows as canonical
   leader changes.

#### Required Snapshot Shape

The snapshot payload must separate canonical truth from replica detail:

```javascript
{
  leaders: {
    "partition-id": {
      leaderNodeId: "node-1",
      source: "partitions",
      inconsistentReplicaRoles: false,
    }
  },
  replicaRoles: {
    "partition-id": {
      "replica-1": "leader",
      "replica-2": "follower",
      "replica-3": "follower",
    }
  }
}
```

The harness may flatten this for display, but not before preserving the
canonical source and inconsistency information.

### 5.5 Consistency Evaluation Contract

Consistency evaluation must compare canonical leader identity, not ambiguous
local leader-row projections.

#### Required Evaluation Inputs

The evaluator must compare:

1. partition membership set
2. canonical group leader identity
3. replica operation in-flight counts
4. optional replica-role agreement diagnostics

Replica-role disagreement should be reported as its own mismatch class rather
than being folded into canonical leader mismatch.

#### Required Mismatch Classes

At minimum:

1. `partition_set_mismatch`
2. `group_leader_mismatch`
3. `replica_role_inconsistency`
4. `replica_operation_mismatch`

### 5.6 Harness and Scenario Config Normalization

Scenario configuration must be fully normalized before scenario logic begins.

#### Current Anti-Pattern

Generic config parsing and scenario-local normalization both apply defaults.
This makes it easy for a config file to appear valid while only failing once
scenario code interprets it.

#### Target Model

Each scenario must receive a single normalized config object created by:

1. parse
2. validate
3. normalize
4. freeze

No scenario may silently reinterpret raw config input after this phase.

#### Required Config Semantics

Timeouts and budgets must be represented explicitly:

1. discovery timeout
2. preload quiescence timeout
3. preload stable window
4. preload no-progress timeout
5. post-load drain timeout
6. post-load drain stable window
7. post-load no-progress timeout

Scenario code must not infer these from a mixture of unrelated fields once the
normalized config exists.

## 6. Required Module Boundaries

The following module boundaries are required after migration.

### 6.1 Replica Runtime

- `src/raft/raft-replica-base.js`
- `src/raft/replica-leadership-state.js`
- one shared system-table mutation helper module

### 6.2 Domain Services

- `src/partition/partition-service.js`
- `src/message-group/message-group-service.js`
- `src/wasm-service/wasm-service-replica.js`

These must depend on the runtime platform rather than re-own it.

### 6.3 Metadata Read Models

- `src/admin/admin-websocket-api.js`
- any control-snapshot builder
- any readiness/read-model projection helpers

These must read canonical owner rows first.

### 6.4 Harness

- `test/distributed/harness/config-parser.js`
- `test/distributed/scenarios/postgres-baseline-comparison.js`
- `test/distributed/harness/gate-engine.js`
- `test/distributed/harness/consistency-evaluator.js`

These must consume canonical snapshot and normalized config contracts rather
than reconstruct them.

## 7. Migration Plan

Migration must proceed in phases. Each phase must end with one owner per
concern for that completed slice.

### Phase U1: Shared Replica Lifecycle Closure

Deliverables:

1. Move all leader-change reconciliation into the shared raft base.
2. Remove duplicated lifecycle wiring from partition and message-group services
   where possible.
3. Add regression tests for leader-change without follower-event demotion.

Exit Criteria:

1. No duplicated leader-change demotion logic remains in service code.
2. Partition, message-group, and other raft replicas pass the same lifecycle
   regression suite.

### Phase U2: Shared Authoritative Mutation Helper

Deliverables:

1. Introduce one mutation helper for authoritative row updates.
2. Migrate role and leader-node persistence in all raft-backed services.
3. Remove ad hoc retry and cache-gap logic from services.

Exit Criteria:

1. All role/leader persistence paths call the shared helper.
2. No service maintains private mutation-reliability logic for the same
   concern.

### Phase U3: Canonical Snapshot and Evaluator Closure

Deliverables:

1. Control snapshots derive leader truth from owner rows.
2. Consistency evaluator compares canonical leader identity.
3. Replica-role inconsistency becomes a separate mismatch type.

Exit Criteria:

1. Snapshot output preserves canonical source and inconsistency diagnostics.
2. Evaluator no longer depends on ambiguous local leader-row selection.

### Phase U4: Scenario Config Normalization Closure

Deliverables:

1. Introduce normalized scenario config builder(s).
2. Remove duplicate normalization from scenario execution code.
3. Add config regression tests for timeout budget invariants.

Exit Criteria:

1. Scenario code receives only normalized config.
2. Timeout and gate budgets are validated before scenario start.

### Phase U5: Documentation and Governance Closure

Deliverables:

1. Update operator docs and runbooks to reflect canonical ownership.
2. Document read-model vs owner-model distinction.
3. Update contributor guidance for new runtime services.

Exit Criteria:

1. New runtime service work can follow one documented extension path.
2. No architecture doc suggests parallel ownership for the same concern.

## 8. Acceptance Criteria

This specification is satisfied only when all of the following are true.

1. A leader-change event to another replica cannot leave the local replica
   logically or persistently marked as leader.
2. Control snapshots do not infer canonical group leadership from local
   `services` row iteration order.
3. `partitions.leader_node_id` or the equivalent owner row is the sole
   canonical leader identity input for diagnostics and consistency checks.
4. All cache-visibility-confirmed owner-row mutations share one implementation.
5. Scenario configs are validated and normalized before scenario execution.
6. Timeout budgets that conflict with known runtime timing floors fail at
   config-validation time rather than after a full harness run.
7. Adding a new raft-backed runtime service requires implementing domain hooks
   on the shared runtime platform, not copying lifecycle logic.

## 9. Risks and Mitigations

### Risk 1: Shared Abstraction Becomes Too Generic

Mitigation:

Keep the shared layer responsible only for lifecycle semantics and mutation
reliability. Domain-specific replication, scheduling, and CDC behavior stays in
the service.

### Risk 2: Migration Leaves Partial Ownership Split

Mitigation:

Each phase must remove the superseded path before the phase is considered
complete. Parallel ownership is not an acceptable end state.

### Risk 3: Diagnostics Regress During Snapshot Contract Change

Mitigation:

Preserve old fields for report compatibility only at the serialization edge,
but derive them from the new canonical snapshot contract.

### Risk 4: Refactor Touches Too Much Runtime Code At Once

Mitigation:

Use phase-local regression tests that prove one ownership closure at a time:

1. leader-change demotion
2. cache-gap recovery
3. canonical snapshot leader source
4. config timeout budget validation

## 10. Open Questions

These questions must be resolved during implementation, but they do not block
the spec itself.

1. Should the shared mutation helper live under `src/raft/`, `src/runtime/`, or
   a new `src/system-tables/` module boundary?
2. Should canonical control-snapshot payloads include full replica-role maps by
   default or only when strict diagnostics are enabled?
3. Should `group_leader_mismatch` be raised when owner rows disagree but
   replica-role maps agree, or should that be a separate owner-row mismatch
   class?
4. Should the normalized scenario config objects be frozen plain objects or
   explicit model classes?

## 11. Immediate Implementation Guidance

If work begins against this spec now, the recommended order is:

1. shared replica lifecycle closure
2. shared authoritative mutation helper
3. canonical control snapshot and evaluator closure
4. scenario config normalization closure

That order removes correctness bugs first, then removes duplication, then
reduces harness complexity.
