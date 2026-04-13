# Requirements Document

## Introduction

The previous transport-stability tranche removed broad discovery repair and
bounded the router backlog, but the focused distributed reruns still fail for a
more specific reason: the seed saturates its outbound delivery queues and
background control-plane work continues to compete with critical system-table
traffic.

The common sequence is:

1. seed outbound queues fill,
2. joiners fail canonical sends to seed-hosted system partitions,
3. readiness and admin snapshots collapse,
4. leadership and placement convergence stall.

This spec targets the next pressure-management tranche without creating new
owners or fallback paths. It keeps the existing ownership model intact:

- `MessageRouter` remains the only outbound queue owner,
- `MessageGroupService` and `RebalanceCoordinator` remain their own producer
  owners,
- `AuthoritativeControlPlaneView` remains the owner for canonical
  control-plane reads,
- `UnifiedRebalancer` remains the owner for periodic background placement
  checks.

## Requirements

### Requirement 1: Router Must Reserve Capacity For Critical Control-Plane Traffic

**User Story:** As a cluster operator, I want critical control-plane traffic to
retain outbound queue capacity even when background work is already queued, so
that the cluster can still make progress under seed pressure.

#### Acceptance Criteria

1. `MessageRouter` SHALL support explicit outbound delivery priority through
   its canonical deliver/enqueue path.
2. `MessageRouter` SHALL reserve a configurable portion of each per-node
   pending queue for critical deliveries.
3. WHEN normal/background work reaches the non-reserved pending limit, THEN the
   router SHALL reject additional normal/background deliveries while still
   accepting critical deliveries up to the total queue limit.
4. Queue draining SHALL prefer critical deliveries ahead of normal/background
   deliveries without introducing a second queue owner.
5. Router delivery results and stats SHALL preserve the canonical delivery
   shape and expose enough queue detail to diagnose lane pressure.

### Requirement 2: Producers Must Use Explicit Pressure Semantics

**User Story:** As a cluster operator, I want major transport producers to use
appropriate delivery priority, so that background rebalance fanout cannot starve
critical message-group control traffic.

#### Acceptance Criteria

1. `MessageGroupService` CDC-forward traffic to the authoritative leader SHALL
   use critical delivery priority through `MessageRouter`.
2. `RebalanceCoordinator` replica-operation dispatch traffic SHALL use
   background delivery priority through `MessageRouter`.
3. These producer changes SHALL stay on the existing owner paths and SHALL NOT
   add alternative delivery helpers or fallback send logic.
4. Queue backpressure errors returned to producers SHALL remain typed and
   canonical so producers can distinguish pressure from routing failure.

### Requirement 3: Authoritative Control-Plane Reads Must Be Single-Flight

**User Story:** As a cluster operator, I want duplicate authoritative
control-plane reads for the same key to share one in-flight request, so that
hot admin/readiness paths do not hammer `nodes`, `services`, `tables`, or
`replica_operations` partitions with redundant requests.

#### Acceptance Criteria

1. `AuthoritativeControlPlaneView` SHALL dedupe concurrent identical reads
   through one in-flight promise per canonical read key.
2. The dedupe key SHALL include the authoritative read inputs that affect the
   result shape, including table name, SQL, params, and routing-relevant read
   options.
3. `readNodeSnapshot()` SHALL reuse the same underlying in-flight reads when
   called concurrently for the same node.
4. Dedupe entries SHALL be removed when the in-flight request settles so later
   calls can observe fresh state.
5. This SHALL remain the single authoritative read owner path; callers SHALL
   not add their own read coalescing logic.

### Requirement 4: Rebalancer Must Defer Periodic Work During Local Transport Pressure

**User Story:** As a cluster operator, I want background rebalance loops to
back off while the local router is already under outbound pressure, so that
system recovery traffic is not competing with optional placement work.

#### Acceptance Criteria

1. `UnifiedRebalancer` SHALL consult `MessageRouter` queue-pressure state
   before running periodic planning/execution.
2. WHEN local router pressure exceeds the router-defined backpressure
   threshold, THEN `UnifiedRebalancer.checkRebalance()` SHALL defer the
   periodic cycle and schedule a later retry instead of evaluating or
   dispatching new work.
3. The defer decision SHALL stay inside `UnifiedRebalancer`; producers SHALL
   not add ad-hoc scheduler bypasses elsewhere.
4. Deferred periodic checks SHALL preserve existing shutdown, leadership, and
   stabilization behavior.
5. The defer path SHALL be visible in diagnostics/logging and SHALL not mutate
   placement state.

### Requirement 5: Regression Coverage And Focused Harness Verification

**User Story:** As a maintainer, I want owner-path tests and focused harness
reruns for the pressure-management tranche, so that later changes do not
reintroduce seed overload through duplicate logic.

#### Acceptance Criteria

1. Tests SHALL prove router reserved capacity rejects background work before it
   rejects critical work on the same node queue.
2. Tests SHALL prove `MessageGroupService` and `RebalanceCoordinator` use the
   intended delivery priorities through the canonical router owner.
3. Tests SHALL prove `AuthoritativeControlPlaneView` coalesces identical
   in-flight reads and clears the dedupe entry afterward.
4. Tests SHALL prove `UnifiedRebalancer` defers periodic checks when the local
   router reports outbound pressure.
5. Verification SHALL include targeted unit suites and focused distributed
   reruns for `node-join-under-load`, `rolling-restart`, and
   `seven-node-table-partition-distribution`.
