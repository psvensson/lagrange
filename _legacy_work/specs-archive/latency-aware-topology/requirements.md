# Requirements Document

## Introduction

This feature introduces latency-aware topology with **latency groups** for
cluster nodes. The goal is to reduce cross-region fanout and improve large-scale
CDC and control-plane efficiency by grouping nodes by measured RTT and using
deterministic representative/coordinator selection.

This is an active successor to the archived latency topology concept and is
aligned with the current architecture constraints:

- one owner per concern
- SQL/CDC as authoritative metadata path
- no parallel fallback implementations

## Glossary

- **Latency_Group**: A set of nodes with low mutual RTT under a configured threshold.
- **Latency_Group_Representative**: Deterministically selected node used for
  membership RTT measurement and group-level liveness probes.
- **Latency_Group_Coordinator**: Deterministically selected node responsible for
  fanout from inter-group CDC ingress to local group redistribution.
- **Inter_Group_Latency**: Measured RTT between representatives of two groups.
- **Latency_Tree**: In-memory tree derived from inter-group latency for
  propagation ordering and routing preference.
- **Latency_Measurement_Service**: Owner component for RTT ping/pong collection.
- **Latency_Group_Manager**: Owner component for group assignment and
  recalculation lifecycle.
- **Topology_Cache_View**: Read-only projection from SystemTableCache used by
  routing/rebalancing decisions; not a second cache.

## Requirements

### Requirement 1: System Metadata Model

**User Story:** As a node, I want latency topology metadata in system tables, so
all nodes share one consistent topology view.

#### Acceptance Criteria

1. THE system SHALL add latency group membership metadata to the `nodes` table.
2. THE system SHALL add a `latency_groups` system table for group-level metadata.
3. THE system SHALL add an `inter_group_latencies` system table for measured
   group RTT samples.
4. ALL writes to latency topology metadata SHALL flow through existing SQL/CDC
   ownership paths.
5. SystemTableCache SHALL expose latency topology data via the same cache update
   path used for other system tables.

### Requirement 2: Initial Group Assignment

**User Story:** As a joining node, I want automatic initial group assignment, so
I join the nearest available latency group or create a new one.

#### Acceptance Criteria

1. WHEN a node starts/joins, THE system SHALL measure RTT to known group
   representatives.
2. WHEN at least one group is below the configured threshold, THE node SHALL
   join the nearest eligible group.
3. WHEN no eligible group exists, THE node SHALL create a new latency group and
   join it.
4. Representative and coordinator selection SHALL be deterministic.
5. Assignment completion SHALL be persisted via SQL/CDC before being treated as
   authoritative.

### Requirement 3: Periodic Recalculation

**User Story:** As an operator, I want periodic recalculation with jitter, so
group membership adapts without synchronized spikes.

#### Acceptance Criteria

1. THE system SHALL recalculate latency group membership periodically.
2. Recalculation interval SHALL be configurable with a default value.
3. THE system SHALL add bounded jitter to recalculation scheduling.
4. WHEN a better eligible group is found, THE node SHALL reassign membership.
5. Reassignment SHALL be emitted as topology metadata updates through CDC.

### Requirement 4: Measurement Protocol

**User Story:** As a node, I want a deterministic RTT measurement protocol, so
latency group decisions are reproducible and testable.

#### Acceptance Criteria

1. THE system SHALL use message-router ping/pong exchanges for RTT measurement.
2. RTT samples SHALL include timestamp, source, target, and sample quality.
3. Measurement smoothing/aggregation policy SHALL be defined in constants.
4. Timeouts and retry counts SHALL be configurable constants.
5. Invalid or stale measurement samples SHALL be ignored with diagnostics.

### Requirement 5: Deterministic Representative and Coordinator Selection

**User Story:** As a maintainer, I want deterministic selection rules, so all
nodes compute the same representative/coordinator for each group.

#### Acceptance Criteria

1. THE system SHALL define deterministic representative selection for each
   latency group.
2. THE system SHALL define deterministic coordinator selection for each latency
   group.
3. Selection rules SHALL depend only on authoritative topology metadata.
4. WHEN representative/coordinator changes, updates SHALL propagate via CDC.
5. Failover selection SHALL converge without manual intervention.

### Requirement 6: Topology-Aware CDC Propagation

**User Story:** As an operator, I want CDC fanout to scale with latency groups,
so cross-region traffic is reduced.

#### Acceptance Criteria

1. THE system SHALL support group-level CDC ingress through one coordinator per
   target group.
2. Local redistribution within each group SHALL be handled by that group's
   coordinator.
3. Propagation ordering across groups SHALL follow the in-memory latency tree.
4. WHEN group topology is unavailable, THE system SHALL use a defined safe
   fallback propagation mode.
5. Propagation mode changes SHALL be logged and observable.

### Requirement 7: Bootstrap and Join Integration

**User Story:** As a joining node, I want bootstrap responses to include
topology hints, so initial assignment starts immediately.

#### Acceptance Criteria

1. Bootstrap response metadata SHALL include known latency groups and
   representatives.
2. Joining flow SHALL begin assignment measurement after websocket/router
   readiness.
3. Joining node SHALL become cluster-eligible before assignment finalization.
4. Assignment finalization SHALL not bypass lifecycle ownership boundaries.
5. Seed and joining flows SHALL both use shared owner components for setup.

### Requirement 8: Routing and Placement Integration

**User Story:** As a runtime operator, I want routing and placement to consider
latency groups, so locality improves without violating correctness.

#### Acceptance Criteria

1. Read-path routing MAY prefer same-group candidates when correctness is
   equivalent.
2. Replica placement heuristics SHALL include optional group diversity/locality
   signals.
3. Topology signals SHALL not override quorum/correctness requirements.
4. Topology-aware decisions SHALL be traceable in logs/telemetry.

### Requirement 9: Configuration and Safety Limits

**User Story:** As an operator, I want explicit configuration controls, so
latency group behavior is tunable and safe.

#### Acceptance Criteria

1. THE system SHALL define config keys for threshold, recalculation interval,
   timeout, retry count, and smoothing policy.
2. Config values SHALL be validated on startup.
3. Invalid config SHALL fail fast with explicit messages.
4. Defaults SHALL be documented and centrally defined.

### Requirement 10: Observability and Admin Surface

**User Story:** As an operator, I want topology visibility and diagnostics, so I
can reason about group behavior and failures.

#### Acceptance Criteria

1. THE system SHALL log group membership changes at info level.
2. THE system SHALL log measurement and recomputation details at debug level.
3. Admin/API query surfaces SHALL expose latency group and inter-group latency
   rows.
4. Metrics SHALL include group counts, reassignments, and coordinator failovers.

### Requirement 11: Ownership Constraints

**User Story:** As an architect, I want clear ownership boundaries, so this
feature does not reintroduce duplication.

#### Acceptance Criteria

1. Latency measurement SHALL have one owner component.
2. Group assignment/recalculation SHALL have one owner component.
3. CDC group propagation SHALL have one owner component.
4. No duplicate in-memory caches of topology metadata SHALL be introduced.
5. No dual old/new logic path SHALL be kept after migration.

### Requirement 12: Verification Coverage

**User Story:** As a maintainer, I want robust tests, so latency group behavior
is stable under reconfiguration and failures.

#### Acceptance Criteria

1. Unit tests SHALL cover assignment, measurement, and deterministic selection.
2. Property tests SHALL cover convergence and deterministic ownership behavior.
3. Integration tests SHALL cover bootstrap/join assignment and coordinator
   failover.
4. Integration tests SHALL cover topology-aware CDC propagation correctness.
