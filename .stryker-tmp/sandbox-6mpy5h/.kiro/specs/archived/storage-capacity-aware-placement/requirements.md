# Requirements Document

## Introduction

Today, placement uses node load scoring (`cpu_usage_percent`,
`memory_usage_percent`, `disk_usage_percent`) but does not enforce a hard,
allocatable storage budget per node. This leaves a gap: replication, recovery,
and partition split workflows can choose nodes that look "less loaded" but still
cannot safely host additional data.

This spec defines a storage-capacity model with strict admission control,
reservation tracking, and policy integration so partitioning and replication
respect dedicated node storage budgets.

## Glossary

- **Node_Storage_Budget**: Node-local bytes reserved for this system to use for
  partition/message-group/service replica data.
- **Storage_Admission**: Mandatory check that must pass before creating an
  operation that increases storage usage on a target node.
- **Storage_Reservation**: Temporary byte reservation for an in-flight
  operation, persisted in system metadata.
- **Capacity_Snapshot**: Derived per-node `{used_bytes, reserved_bytes,
  available_bytes, pressure_state}` view used by planners.
- **Pressure_State**: Node storage pressure classification (`normal`, `soft`,
  `hard`, `exhausted`) derived from budget utilization.
- **Replica_Size_Estimator**: Owner logic that estimates bytes needed for a
  replica operation from partition metadata and runtime overhead constants.
- **Emergency_Headroom**: Reserved fraction of budget usable only for critical
  correctness-preserving operations.

## Requirements

### Requirement 1: Dedicated Node Storage Budget

**User Story:** As an operator, I want each node to declare a dedicated storage
budget at startup, so placement decisions are based on explicit capacity.

#### Acceptance Criteria

1. THE system SHALL support explicit per-node budget configuration at node
   startup (`node.storageBudgetBytes` or `node.storageBudgetRatio`).
2. THE system SHALL persist resolved budget bytes in system metadata for each
   node.
3. IF both absolute and ratio budget are provided, THEN one deterministic
   precedence rule SHALL be applied and documented.
4. Invalid budgets (non-positive, over physical disk size, malformed) SHALL
   fail fast with explicit startup errors.
5. Nodes without resolved budgets SHALL NOT be considered placement-eligible.

### Requirement 2: Capacity Accounting Metadata Model

**User Story:** As a planner, I want one authoritative accounting model for
used and reserved bytes, so all admission and placement paths agree.

#### Acceptance Criteria

1. THE system SHALL persist storage reservations in a dedicated system table.
2. Capacity snapshots SHALL derive used bytes from authoritative replica +
   partition metadata, not ad-hoc local counters.
3. Capacity snapshots SHALL include used, reserved, available, and pressure
   state values.
4. Capacity calculations SHALL include runtime-type overhead constants in
   addition to partition payload size.
5. The accounting model SHALL have one owner component.

### Requirement 3: Mandatory Storage Admission

**User Story:** As a reliability engineer, I want every storage-increasing
operation preflighted, so no move is scheduled without capacity.

#### Acceptance Criteria

1. ADD and REPLACE operations SHALL require storage admission before operation
   creation.
2. Split-triggered replica creation SHALL require storage admission.
3. Admission SHALL evaluate projected post-operation availability against budget
   and minimum headroom policy.
4. Rejected admissions SHALL return structured reason codes and diagnostics.
5. No alternate operation path SHALL bypass storage admission.

### Requirement 4: Reservation Lifecycle Integration

**User Story:** As an operator, I want in-flight storage reservations tracked
end-to-end, so concurrent operations cannot over-commit node storage.

#### Acceptance Criteria

1. Reservation records SHALL be created atomically with operation creation.
2. Reservation status SHALL track operation lifecycle transitions.
3. Reservations SHALL be released on terminal operation outcomes.
4. A reconciliation pass SHALL expire or repair stale reservations after crash
   recovery.
5. Reservation TTL and expiry behavior SHALL be configurable and documented.

### Requirement 5: Move Planner Capacity Integration

**User Story:** As a planner, I want node candidate selection to filter by hard
capacity feasibility before scoring, so infeasible nodes are never selected.

#### Acceptance Criteria

1. `MovePlanner` SHALL filter out nodes that fail storage feasibility checks.
2. Node scoring SHALL include storage-aware ordering among feasible nodes.
3. Target-state degradation reasons SHALL distinguish `insufficient_capacity`
   from `insufficient_nodes`.
4. Placement diagnostics SHALL include capacity rejection counts by reason.
5. Existing correctness constraints (quorum/odd replica counts/readiness) SHALL
   remain dominant.

### Requirement 6: Policy and Configuration Controls

**User Story:** As an operator, I want policy knobs for storage safety margins,
so I can tune behavior for different environments.

#### Acceptance Criteria

1. Table/message-group policies SHALL support storage headroom constraints.
2. Global config SHALL define soft/hard pressure thresholds and emergency
   headroom behavior.
3. All new policy/config keys SHALL be centrally defined and validated.
4. Invalid policy values SHALL be rejected by a single canonical validation
   path; no secondary validator path is permitted.
5. Effective storage policy values SHALL be observable via admin surfaces.

### Requirement 7: Partition Split/Merge Capacity Semantics

**User Story:** As an operator, I want split/merge decisions to consider node
capacity, so partitioning actions do not trigger avoidable storage exhaustion.

#### Acceptance Criteria

1. Split planning SHALL include temporary write-amplification reservation
   estimates.
2. Splits SHALL be deferred when no feasible capacity plan exists.
3. Merge operations that reduce pressure SHALL remain eligible under constrained
   capacity.
4. Split/merge decisions SHALL emit capacity-aware reasons.
5. Split amplification factors SHALL be configurable constants.

### Requirement 8: Pressure-State Behavior

**User Story:** As an operator, I want deterministic pressure-state behavior,
so low-space conditions trigger predictable rebalancer actions.

#### Acceptance Criteria

1. Pressure states SHALL be derived from budget utilization with defined
   thresholds.
2. `soft` state SHALL reduce optional balancing work while allowing safe
   correctness-preserving operations.
3. `hard` and `exhausted` states SHALL block non-critical storage-increasing
   operations.
4. Critical replacement logic SHALL use explicit emergency-headroom rules.
5. Pressure transitions SHALL be observable via logs and metrics.

### Requirement 9: Bootstrap and Join Integration

**User Story:** As a joining node, I want storage budget registration to be part
of startup ownership, so placement eligibility is correct from first use.

#### Acceptance Criteria

1. Seed and join pipelines SHALL resolve and persist node storage budget before
   node eligibility for placement.
2. Heartbeat updates SHALL not override budget ownership semantics.
3. Nodes failing budget registration SHALL remain non-eligible until resolved.
4. Startup diagnostics SHALL include resolved budget and source.
5. Shared setup ownership boundaries SHALL remain intact.

### Requirement 10: Observability and Admin Diagnostics

**User Story:** As an operator, I want capacity visibility per node and per
operation, so low-space decisions are actionable.

#### Acceptance Criteria

1. Metrics SHALL report used/reserved/available bytes and pressure state per
   node.
2. Logs SHALL report admission allow/deny decisions with reason codes and
   projected usage.
3. Admin query surfaces SHALL expose reservation rows and capacity snapshots.
4. CLI/node views SHALL display budget utilization and reservation totals.
5. Capacity audit data SHALL remain queryable even when logs table is excluded
   from default cache hydration.

### Requirement 11: Ownership and Single-Path Constraints

**User Story:** As an architect, I want explicit ownership boundaries, so
capacity logic cannot fork across modules.

#### Acceptance Criteria

1. Capacity accounting SHALL have one owner component.
2. Admission checks SHALL have one owner component.
3. `MovePlanner` SHALL remain the only placement planner and consume admission
   owner APIs rather than duplicating logic.
4. `RebalanceCoordinator` SHALL remain operation-lifecycle owner and consume
   reservation owner APIs rather than duplicating reservation logic.
5. No duplicate in-memory capacity cache outside existing SQL/cache ownership
   paths SHALL be introduced.

### Requirement 12: Migration and Backfill

**User Story:** As an operator, I want safe rollout from existing deployments,
so capacity enforcement can be introduced without metadata ambiguity.

#### Acceptance Criteria

1. Schema migrations SHALL add required columns/tables in forward-compatible
   order.
2. Existing nodes SHALL receive deterministic budget backfill values.
3. In-flight operations at upgrade time SHALL reconstruct reservations via
   reconciliation.
4. Rollout SHALL support observe mode before full enforce mode.
5. Enforce mode SHALL remove legacy non-admission execution paths.

### Requirement 13: Verification Coverage

**User Story:** As a maintainer, I want targeted tests for storage admission and
reservations, so regressions are detected quickly.

#### Acceptance Criteria

1. Unit tests SHALL cover size estimation, pressure-state classification,
   admission decisions, and reservation lifecycle.
2. Property tests SHALL validate capacity invariants (never over-commit budget,
   deterministic admission with same inputs).
3. Integration tests SHALL cover join/bootstrap budget registration, placement
   rejection on low capacity, and recovery reconciliation.
4. Integration tests SHALL cover split gating and critical replacement behavior
   under pressure.
5. Ownership contract tests SHALL assert no bypass paths for admission and
   reservation logic.

### Requirement 14: Documentation and Traceability

**User Story:** As a maintainer, I want architecture and operator docs updated,
so runtime behavior and ownership are clear.

#### Acceptance Criteria

1. `.kiro/steering/architecture.md` SHALL document storage capacity owners,
   metadata model, and admission flow.
2. Operator-facing docs SHALL document budget configuration and diagnostics.
3. Task-to-requirement traceability SHALL be maintained in `tasks.md`.
4. Naming in docs SHALL match canonical runtime and rebalancer terminology.
