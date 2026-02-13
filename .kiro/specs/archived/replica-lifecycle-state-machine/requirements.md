# Requirements Document

## Introduction

This document defines requirements for a formal state machine governing replica lifecycle and rebalancing operations. The current implementation has implicit state transitions scattered across `ReplicaLifecycleManager` and `UnifiedRebalancer`. This spec formalizes these transitions into a single, well-defined state machine with clear invariants, improving debuggability, correctness, and operational visibility.

## Glossary

- **Replica_State_Machine**: The formal state machine governing all replica lifecycle transitions
- **Replica**: A single copy of a partition's data, managed by a PartitionService instance
- **Rebalancer**: The component that decides when to add/remove replicas based on policies
- **Lifecycle_Manager**: The component that executes replica creation and removal on target nodes
- **Pending_Move**: A tracked operation representing an in-flight replica add or remove
- **Stabilization_Period**: Time window after state changes before rebalancing decisions are made
- **Transition_Event**: An event that triggers a state change in the replica state machine
- **State_Observer**: A component that receives notifications of state transitions

## Requirements

### Requirement 1: Unified Replica State Machine

**User Story:** As a system operator, I want all replica state transitions to follow a single, well-defined state machine, so that I can understand and debug replica lifecycle issues.

#### Acceptance Criteria

1. THE Replica_State_Machine SHALL define exactly these states: `pending`, `creating`, `syncing`, `active`, `removing`, `removed`, `failed`
2. THE Replica_State_Machine SHALL enforce that transitions only occur along valid edges as defined in the state diagram
3. WHEN an invalid transition is attempted, THE Replica_State_Machine SHALL reject it and log an error with the current state, attempted state, and context
4. THE Replica_State_Machine SHALL be the single source of truth for replica status across all components

### Requirement 2: State Transition Definitions

**User Story:** As a developer, I want clear definitions of what triggers each state transition, so that I can implement correct state handling.

#### Acceptance Criteria

1. WHEN the Rebalancer decides to add a replica, THE Replica_State_Machine SHALL transition from `(none)` to `pending`
2. WHEN a CREATE_REPLICA message is sent to the target node, THE Replica_State_Machine SHALL transition from `pending` to `creating`
3. WHEN the target node acknowledges CREATE_REPLICA with `initiated`, THE Replica_State_Machine SHALL transition from `creating` to `syncing`
4. WHEN Raft log sync completes successfully, THE Replica_State_Machine SHALL transition from `syncing` to `active`
5. WHEN the Rebalancer decides to remove a replica, THE Replica_State_Machine SHALL transition from `active` to `removing`
6. WHEN REMOVE_REPLICA completes and resources are cleaned up, THE Replica_State_Machine SHALL transition from `removing` to `removed`
7. WHEN any operation fails during `creating`, `syncing`, or `removing`, THE Replica_State_Machine SHALL transition to `failed`
8. THE Replica_State_Machine SHALL allow transition from `failed` to `removed` after cleanup

### Requirement 3: Rebalancer Integration

**User Story:** As a system architect, I want the Rebalancer to query the state machine before making decisions, so that it doesn't create conflicting operations.

#### Acceptance Criteria

1. WHEN calculating moves, THE Rebalancer SHALL query the Replica_State_Machine for all replicas in transitional states (`pending`, `creating`, `syncing`, `removing`)
2. THE Rebalancer SHALL NOT generate ADD moves for partitions that already have a replica in `pending`, `creating`, or `syncing` state on the target node
3. THE Rebalancer SHALL NOT generate REMOVE moves for replicas that are already in `removing` state
4. WHEN a replica is in `failed` state, THE Rebalancer SHALL generate a cleanup move to transition it to `removed`

### Requirement 4: State Persistence

**User Story:** As a system operator, I want replica states to survive node restarts, so that the system can recover correctly after failures.

#### Acceptance Criteria

1. THE Replica_State_Machine SHALL persist state transitions to the `services` system table via CDC
2. WHEN a node recovers, THE Lifecycle_Manager SHALL query the `services` table to restore replica states
3. WHEN a replica is found in `creating` or `syncing` state after recovery, THE Lifecycle_Manager SHALL transition it to `failed`
4. WHEN a replica is found in `removing` state after recovery, THE Lifecycle_Manager SHALL complete the removal and transition to `removed`

### Requirement 5: State Observation and Events

**User Story:** As a monitoring system, I want to receive events for all state transitions, so that I can track replica lifecycle and alert on issues.

#### Acceptance Criteria

1. THE Replica_State_Machine SHALL emit an event for every state transition including: replica_id, partition_id, node_id, previous_state, new_state, timestamp, trigger_reason
2. THE Replica_State_Machine SHALL support registering multiple State_Observers
3. WHEN a transition to `failed` occurs, THE Replica_State_Machine SHALL include the error message and stack trace in the event
4. THE Replica_State_Machine SHALL emit events synchronously before the transition completes

### Requirement 6: Timeout Handling

**User Story:** As a system operator, I want stuck operations to be detected and handled automatically, so that the system doesn't get into an inconsistent state.

#### Acceptance Criteria

1. THE Replica_State_Machine SHALL track entry time for each transitional state (`pending`, `creating`, `syncing`, `removing`)
2. WHEN a replica remains in `pending` state longer than the configured timeout (default 30s), THE Replica_State_Machine SHALL transition to `failed`
3. WHEN a replica remains in `creating` state longer than the configured timeout (default 60s), THE Replica_State_Machine SHALL transition to `failed`
4. WHEN a replica remains in `syncing` state longer than the configured timeout (default 300s), THE Replica_State_Machine SHALL transition to `failed`
5. WHEN a replica remains in `removing` state longer than the configured timeout (default 60s), THE Replica_State_Machine SHALL transition to `failed`

### Requirement 7: Concurrent Operation Limits

**User Story:** As a system architect, I want to limit concurrent replica operations, so that the system doesn't become overloaded during rebalancing.

#### Acceptance Criteria

1. THE Replica_State_Machine SHALL track the count of replicas in each transitional state globally
2. THE Rebalancer SHALL NOT initiate new ADD operations when the count of replicas in `pending` + `creating` + `syncing` exceeds the configured limit (default 5)
3. THE Rebalancer SHALL NOT initiate new REMOVE operations when the count of replicas in `removing` exceeds the configured limit (default 5)
4. WHEN the concurrent operation limit is reached, THE Rebalancer SHALL log a warning and skip the move

### Requirement 8: State Machine Visualization

**User Story:** As a system operator, I want to see the current state of all replicas in the admin CLI, so that I can understand the system's health.

#### Acceptance Criteria

1. THE Admin_CLI SHALL display replica state in the services view with color coding: `active` (green), `syncing` (yellow), `creating`/`pending` (blue), `removing` (orange), `failed` (red)
2. THE Admin_CLI SHALL show time-in-state for replicas in transitional states
3. WHEN a replica is in `failed` state, THE Admin_CLI SHALL display the failure reason
4. THE Admin_CLI SHALL provide a command to view state transition history for a specific replica

### Requirement 9: Idempotent Operations

**User Story:** As a developer, I want all state machine operations to be idempotent, so that retries don't cause inconsistencies.

#### Acceptance Criteria

1. WHEN a CREATE_REPLICA message is received for a replica that already exists in `active` state, THE Lifecycle_Manager SHALL return `already_exists` without changing state
2. WHEN a CREATE_REPLICA message is received for a replica in `creating` or `syncing` state, THE Lifecycle_Manager SHALL return `in_progress` without changing state
3. WHEN a REMOVE_REPLICA message is received for a replica that doesn't exist, THE Lifecycle_Manager SHALL return `not_found` without error
4. WHEN a REMOVE_REPLICA message is received for a replica already in `removing` state, THE Lifecycle_Manager SHALL return `in_progress` without changing state

### Requirement 10: State Machine Metrics

**User Story:** As a system operator, I want metrics about state machine operations, so that I can monitor system health and performance.

#### Acceptance Criteria

1. THE Replica_State_Machine SHALL expose metrics for: count of replicas in each state, count of transitions per state pair, average time spent in each transitional state
2. THE Replica_State_Machine SHALL expose metrics for: count of failed transitions, count of timeout-triggered failures
3. THE Replica_State_Machine SHALL expose metrics for: current concurrent operations count, peak concurrent operations count
4. WHEN a transition completes, THE Replica_State_Machine SHALL update the transition duration histogram
