# Requirements Document

## Introduction

This document defines requirements for simplifying the service communication and rebalancing workflow in the distributed database system. The current architecture has complexity spread across multiple components (`ReplicaStateMachine`, `ReplicaLifecycleManager`, `UnifiedRebalancer`) with overlapping responsibilities and implicit coordination through events and CDC. This spec proposes a simplified architecture that maintains the decentralized, scalable design while making the system easier to understand and debug.

## Glossary

- **Rebalance_Coordinator**: A unified component that owns the complete rebalancing workflow from decision to completion
- **Replica_Operation**: A single atomic operation (ADD or REMOVE) with clear start, progress, and completion states
- **Operation_Log**: A persistent log of all replica operations for debugging and recovery
- **RPC_Client**: Request-response abstraction built on top of message groups for simpler calling patterns
- **State_Owner**: The single component responsible for a piece of state (no shared ownership)
- **Workflow_Step**: A discrete, observable step in a multi-step operation

## Requirements

### Requirement 1: Single State Owner for Replica Lifecycle

**User Story:** As a developer, I want each piece of replica state to have exactly one owner, so that I can understand where state changes originate and debug issues.

#### Acceptance Criteria

1. THE System SHALL designate exactly one component as the owner of replica lifecycle state
2. WHEN replica state changes, THE State_Owner SHALL be the only component that modifies the state
3. THE System SHALL NOT have multiple components tracking the same replica state with different enums
4. WHEN other components need replica state, THE System SHALL provide read-only access through the State_Owner

### Requirement 2: Unified Rebalancing Workflow

**User Story:** As a developer, I want the entire rebalancing workflow to be visible in one place, so that I can trace operations from decision to completion.

#### Acceptance Criteria

1. THE Rebalance_Coordinator SHALL own the complete workflow: decision → message → acknowledgment → completion
2. WHEN a rebalancing decision is made, THE Rebalance_Coordinator SHALL create a Replica_Operation record
3. THE Replica_Operation SHALL track: operation_id, type (ADD/REMOVE), partition_id, target_node, status, timestamps, error_info
4. WHEN an operation completes or fails, THE Rebalance_Coordinator SHALL update the Replica_Operation record
5. THE System SHALL NOT require external components to track pending moves separately

### Requirement 3: RPC Abstraction over Message Groups

**User Story:** As a developer, I want a request-response abstraction over message groups, so that I can write simpler code while maintaining the decentralized transport.

#### Acceptance Criteria

1. THE System SHALL provide an RPC_Client abstraction that uses message groups as transport
2. THE RPC_Client SHALL support request-response pattern with configurable timeout
3. WHEN the Rebalance_Coordinator sends a CREATE_REPLICA request, THE RPC_Client SHALL handle correlation and response matching
4. THE RPC_Client SHALL return a Promise that resolves with the response or rejects on timeout
5. THE System SHALL continue to use message groups for all inter-node communication (no direct WebSocket calls)
6. WHEN RPC times out, THE RPC_Client SHALL reject with a timeout error (caller handles retry)

### Requirement 4: Observable Operation Steps

**User Story:** As an operator, I want to see the current step of each in-flight operation, so that I can understand what the system is doing.

#### Acceptance Criteria

1. THE Replica_Operation SHALL have explicit Workflow_Steps: PENDING, SENDING, CREATING, SYNCING, ACTIVE (for ADD)
2. THE Replica_Operation SHALL have explicit Workflow_Steps: PENDING, SENDING, STOPPING, REMOVED (for REMOVE)
3. WHEN a Workflow_Step changes, THE System SHALL log the transition with context
4. THE Admin_CLI SHALL display current Workflow_Step for all in-flight operations

### Requirement 5: Consolidated Status Enum

**User Story:** As a developer, I want a single status enum used consistently across all components, so that I don't have to translate between different status representations.

#### Acceptance Criteria

1. THE System SHALL define exactly one ReplicaStatus enum for all replica states
2. THE ReplicaStatus enum SHALL include: pending, creating, syncing, active, removing, removed, failed
3. ALL components (Rebalancer, LifecycleManager, StateMachine, CDC) SHALL use the same ReplicaStatus enum
4. THE System SHALL NOT define component-specific status enums that duplicate ReplicaStatus

### Requirement 6: Simplified Timeout Handling

**User Story:** As a developer, I want timeout handling to be centralized and predictable, so that stuck operations are handled consistently.

#### Acceptance Criteria

1. THE Rebalance_Coordinator SHALL own all timeout handling for replica operations
2. WHEN an operation times out, THE Rebalance_Coordinator SHALL transition it to failed state
3. THE System SHALL NOT have multiple components independently checking for timeouts
4. THE timeout configuration SHALL be in one place (not scattered across components)

### Requirement 7: Operation Recovery on Restart

**User Story:** As an operator, I want the system to recover gracefully from restarts, so that in-flight operations are handled correctly.

#### Acceptance Criteria

1. WHEN a node restarts, THE Rebalance_Coordinator SHALL query the Operation_Log for incomplete operations
2. FOR operations in SENDING or CREATING state, THE Rebalance_Coordinator SHALL mark them as failed
3. FOR operations in SYNCING state, THE Rebalance_Coordinator SHALL check actual replica status and reconcile
4. THE System SHALL NOT leave orphaned replicas after recovery

### Requirement 8: Reduced Event-Driven Complexity

**User Story:** As a developer, I want fewer implicit event chains, so that I can trace the flow of operations.

#### Acceptance Criteria

1. THE Rebalance_Coordinator SHALL use direct method calls for local operations (not events)
2. THE System SHALL use events only for cross-component notifications (not for control flow)
3. WHEN an operation completes, THE Rebalance_Coordinator SHALL update state directly (not via event)
4. THE System SHALL document which events are informational vs which trigger actions

### Requirement 9: Debuggable Operation Log

**User Story:** As a developer, I want a queryable log of all replica operations, so that I can debug issues after the fact.

#### Acceptance Criteria

1. THE Operation_Log SHALL be stored in a system table (not just in-memory)
2. THE Operation_Log SHALL include: operation_id, type, partition_id, source_node, target_node, status, created_at, updated_at, error_message, workflow_steps_history
3. THE Admin_CLI SHALL provide commands to query the Operation_Log
4. THE Operation_Log SHALL retain entries for at least 24 hours after completion

### Requirement 10: Clear Component Boundaries

**User Story:** As a developer, I want clear boundaries between components, so that I know which component is responsible for what.

#### Acceptance Criteria

1. THE Rebalance_Coordinator SHALL be responsible for: deciding when to rebalance, creating operations, tracking progress, handling timeouts
2. THE Target_Node SHALL be responsible for: creating local replica, syncing data, reporting status back
3. THE System SHALL NOT have overlapping responsibilities between Rebalance_Coordinator and Target_Node
4. THE System SHALL document the responsibility boundary in the design document

