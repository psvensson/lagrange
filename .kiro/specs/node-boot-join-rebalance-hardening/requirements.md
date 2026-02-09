# Requirements Document

## Introduction

This document defines requirements to close architectural gaps in node boot,
join, and replica rebalancing. The current implementation has correctness risks
in MOVE_REPLICA handoff, message-group rebalancer wiring, epoch propagation,
and readiness gates.

## Glossary

- **Seed_Node**: The first cluster node that bootstraps system tables and APIs.
- **Joining_Node**: A node that joins an existing cluster.
- **MOVE_REPLICA**: A strategy where an existing replica ID is moved to a new
  node during join.
- **Handoff_Operation**: The ordered workflow that transfers ownership of a
  replica from source node to target node.
- **System_Cache**: CDC-fed local cache of system tables.
- **Leader_Readiness_Gate**: Validation that leaders exist and have routable
  metadata.
- **Epoch**: Versioned assignment snapshot for pull-based replica placement.

## Requirements

### Requirement 1: Transactional MOVE_REPLICA Handoff

**User Story:** As a cluster operator, I want MOVE_REPLICA to complete as a
single handoff workflow, so that a replica ID never has two active owners and
never becomes unreachable.

#### Acceptance Criteria

1. WHEN a Joining_Node receives MOVE_REPLICA assignment THEN it SHALL execute a
   Handoff_Operation with explicit phases: `prepare_target`, `verify_target`,
   `remove_source`, `commit_metadata`.
2. WHEN `remove_source` has not completed THEN the system SHALL NOT commit the
   final service ownership change to the target node.
3. WHEN handoff commits THEN exactly one active `services` row owner SHALL
   exist for the moved replica ID.
4. IF any phase fails THEN the operation SHALL transition to failed state and
   SHALL preserve a single consistent owner (source or target), with no split
   ownership.
5. THE Handoff_Operation SHALL be persisted in `replica_operations` and be
   observable for retries and debugging.

### Requirement 2: Topology-Accurate Peer Address Resolution

**User Story:** As a developer, I want peer routing to follow current topology,
so that moved replicas are reachable after handoff.

#### Acceptance Criteria

1. THE runtime address resolver SHALL treat bootstrap `peerAddresses` as
   bootstrap hints only, not long-lived authoritative topology.
2. WHEN a service location changes in `services` THEN message-group peer
   resolution SHALL converge to cache-backed addresses without restart.
3. IF a cached address is missing THEN routing MAY use bootstrap hints only for
   bootstrap/join windows and SHALL emit structured diagnostics.
4. AFTER handoff completion, routing attempts to the moved replica SHALL use
   its new node address.

### Requirement 3: Complete Service Registration for CREATE_SELF_HOSTED

**User Story:** As a cluster operator, I want self-hosted message-group joins
to register complete metadata, so that future joins and balancing can discover
them.

#### Acceptance Criteria

1. WHEN CREATE_SELF_HOSTED message-group replicas are created THEN
   `message_groups` and `services` metadata SHALL be upserted in the same join
   flow.
2. THE `services` table SHALL contain one active row per created replica with
   valid `node_id`, `service_type`, `group_id`, and `address`.
3. IF metadata upsert fails THEN join SHALL fail and SHALL NOT report success.
4. Bootstrap assignment discovery SHALL be able to use only persisted system
   table metadata for this group.

### Requirement 4: End-to-End Message-Group Rebalancer Wiring

**User Story:** As an operator, I want message-group balancing to use the same
reliable execution path as partition balancing, so that architecture and
runtime behavior match.

#### Acceptance Criteria

1. WHEN a message-group leader is active THEN runtime SHALL instantiate and
   initialize UnifiedRebalancer for `entityType=message_group`.
2. THE rebalancer SHALL source current message-group replicas from `services`
   (service_type `message_group`) and not require non-existent schema fields.
3. Replica operations SHALL encode entity identity in a single canonical model
   that supports both partitions and message groups.
4. RebalanceCoordinator and dispatch paths SHALL route message-group operations
   to the correct lifecycle handler type.
5. Message-group rebalancing SHALL be triggerable by node readiness/state
   changes with the same trigger semantics as partitions.

### Requirement 5: Cluster-Scoped Epoch Persistence and CDC Propagation

**User Story:** As a developer, I want assignment epochs to be cluster-scoped
and durable, so that join-time proposals are safe and convergent.

#### Acceptance Criteria

1. THE authoritative epoch SHALL be stored in `config.current_epoch`.
2. Seed bootstrap SHALL initialize `config.current_epoch` if absent.
3. Joining nodes SHALL read the authoritative epoch before proposing a new
   epoch and SHALL use CAS semantics.
4. CDCIntegrationService SHALL be wired with `setEpochManager(...)` in runtime
   for seed and joining flows.
5. WHEN `config.current_epoch` changes THEN local epoch managers SHALL apply
   newer epochs via CDC and ignore stale epochs.

### Requirement 6: Strict Leader Readiness and Hydration Gates

**User Story:** As an operator, I want boot/join readiness checks to reject
incomplete routing state, so that nodes do not proceed with unusable metadata.

#### Acceptance Criteria

1. Leader readiness waits in bootstrap and join SHALL count missing leader
   addresses as blocking conditions.
2. Cache hydration verification SHALL fail fast (not warn-only) when required
   system tables are missing or hydration results are incomplete.
3. Writer/cdc routing mode swaps SHALL occur only after strict hydration and
   leader readiness checks pass.
4. Error payloads SHALL include missing leader categories for diagnostics.

### Requirement 7: Runtime Path Consolidation

**User Story:** As a maintainer, I want one runtime path for lifecycle and CDC
event handling, so that behavior is predictable and testable.

#### Acceptance Criteria

1. Node lifecycle state vocabulary SHALL have one canonical enum for node
   states used by runtime services.
2. Dead or duplicate phase/state-machine wiring that is not used by runtime
   entrypoints SHALL be removed or explicitly integrated.
3. CDC node-state trigger wiring SHALL use one runtime path and SHALL not rely
   on uninstantiated handlers.

