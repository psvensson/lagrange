# Requirements Document

## Introduction

This document specifies requirements for completing the cluster reliability improvements needed to make the seed node bootstrap, node joining, and rebalancing flow production-ready. The requirements address gaps identified from incomplete tasks in previous specs (node-joining-rebalancer-fixes task 22, seed-bootstrap-join-pipeline incomplete tasks) and recent bug fixes.

The goal is to achieve high confidence in the cluster joining and rebalancing flow through:
1. Completing the services-p1 CREATE_REPLICA timeout investigation
2. Adding missing integration tests for leader metadata validation
3. Implementing explicit BootstrapStateMachine with phase gates
4. Adding cache hydration completeness verification
5. Ensuring all tests use deterministic timeouts

## Glossary

- **Seed_Node**: The first node in a cluster that bootstraps system tables and partitions
- **Joining_Node**: A node that joins an existing cluster by contacting the seed node
- **BootstrapStateMachine**: State machine that manages bootstrap phases with explicit gates and timeouts
- **LeaderReadinessGate**: Component that validates leader metadata completeness before allowing joins
- **Cache_Hydration**: Process of populating the system cache from partition data
- **CDC**: Change Data Capture - mechanism for streaming changes from partitions to cache
- **Phase_Gate**: Validation checkpoint that must pass before proceeding to next phase
- **Services_Table**: System table tracking all service instances (partitions, message groups)
- **Replica_Operation**: CREATE_REPLICA or REMOVE_REPLICA message for managing replicas

## Requirements

### Requirement 1: Services-P1 CREATE_REPLICA Timeout Resolution

**User Story:** As a cluster operator, I want the services-p1 partition to handle CREATE_REPLICA operations without timeout, so that replica creation completes reliably for all system tables.

#### Acceptance Criteria

1. WHEN a CREATE_REPLICA message is sent to services-p1 THEN the Replica_Handler SHALL return an ACK within the configured timeout (default 30 seconds)
2. WHEN the services-p1 partition inserts a row into itself during replica creation THEN the operation SHALL NOT cause a deadlock or circular dependency
3. WHEN multiple partitions simultaneously insert into the services table THEN the operations SHALL complete without blocking each other
4. IF a services-p1 CREATE_REPLICA times out THEN the system SHALL log diagnostic information including elapsed time at each step
5. THE diagnostic logging SHALL capture timing for: services table insert, CREATE_REPLICA message send, and ACK receipt

### Requirement 2: Leader Metadata Validation Integration Tests

**User Story:** As a developer, I want integration tests that verify leader metadata validation, so that I can catch regressions in the join flow.

#### Acceptance Criteria

1. WHEN a joining node contacts a seed node with incomplete leader metadata THEN the join SHALL fail fast with LEADER_METADATA_INCOMPLETE error
2. THE integration test SHALL verify that missing partition leaders are reported in the error response
3. THE integration test SHALL verify that missing message group leaders are reported in the error response
4. WHEN all leader metadata is complete THEN the join SHALL proceed successfully
5. THE integration tests SHALL complete within 30 seconds (integration test limit)

### Requirement 3: BootstrapStateMachine Implementation

**User Story:** As a cluster operator, I want explicit bootstrap phases with gates, so that bootstrap failures are deterministic and diagnosable.

#### Acceptance Criteria

1. THE BootstrapStateMachine SHALL define explicit phases: INFRA, RAFT_ELECTION, SYSTEM_TABLE_SEED, CACHE_HYDRATION, CDC_SUBSCRIBE, CONTROL_PLANE_REGISTER, READY
2. WHEN a phase gate fails THEN the BootstrapStateMachine SHALL report the specific gate that failed with diagnostic details
3. WHEN a phase times out THEN the BootstrapStateMachine SHALL report the phase name, elapsed time, and timeout value
4. THE BootstrapStateMachine SHALL prevent progression to the next phase until the current phase gate passes
5. WHEN the READY phase is reached THEN the BootstrapStateMachine SHALL allow join requests
6. IF a phase fails THEN the BootstrapStateMachine SHALL transition to a FAILED state with error details

### Requirement 4: Cache Hydration Completeness Verification

**User Story:** As a cluster operator, I want cache hydration to be verified complete before allowing joins, so that joining nodes receive accurate system state.

#### Acceptance Criteria

1. WHEN cache hydration completes THEN the system SHALL verify that all expected tables are populated
2. THE cache hydration verification SHALL check that leader metadata exists for all partitions
3. THE cache hydration verification SHALL check that leader metadata exists for all message groups
4. IF cache hydration is incomplete THEN the system SHALL report which tables or leaders are missing
5. WHEN cache hydration verification passes THEN the system SHALL transition to CDC_SUBSCRIBE phase

### Requirement 5: LeaderReadinessGate Unit Tests

**User Story:** As a developer, I want unit tests for LeaderReadinessGate, so that leader metadata validation logic is verified.

#### Acceptance Criteria

1. THE unit tests SHALL verify that getMissingSystemServiceLeaders returns empty arrays when all leaders are present
2. THE unit tests SHALL verify that missing partition leaders are correctly identified
3. THE unit tests SHALL verify that missing message group leaders are correctly identified
4. THE unit tests SHALL verify that partial leader metadata (some present, some missing) is correctly reported
5. THE unit tests SHALL complete within 2 seconds (unit test limit)

### Requirement 6: Deterministic Test Timeouts

**User Story:** As a developer, I want all tests to use deterministic timeouts, so that test results are reliable and CI pipelines are stable.

#### Acceptance Criteria

1. THE unit tests SHALL complete within 2 seconds
2. THE integration tests SHALL complete within 30 seconds
3. WHEN a test involves waiting for leadership election THEN it SHALL use configurable timeouts with test-appropriate values
4. THE test configuration SHALL allow shorter timeouts for unit tests than production defaults
5. IF a test exceeds its timeout THEN it SHALL fail with a clear timeout error message

### Requirement 7: Bootstrap and Join Integration Test Updates

**User Story:** As a developer, I want existing bootstrap and join integration tests updated to use deterministic timeouts, so that tests are reliable.

#### Acceptance Criteria

1. THE existing node-join-replica-activation tests SHALL use deterministic timeouts under 30 seconds
2. THE existing node-joining-rebalance tests SHALL use deterministic timeouts under 30 seconds
3. WHEN tests wait for partition leaders THEN they SHALL use bounded polling with configurable intervals
4. THE tests SHALL NOT use unbounded waits or infinite loops
5. IF a test timeout is reached THEN the test SHALL fail with diagnostic information about what was being waited for

### Requirement 8: Services Table Self-Reference Handling

**User Story:** As a cluster operator, I want the services table to handle self-referential writes correctly, so that services-p1 can track its own replicas.

#### Acceptance Criteria

1. WHEN services-p1 creates a new replica THEN it SHALL be able to insert a row for that replica into itself
2. THE self-referential insert SHALL NOT cause a deadlock
3. THE self-referential insert SHALL NOT require routing through another partition
4. WHEN the insert completes THEN the CDC event SHALL propagate to the system cache
5. IF the self-referential insert fails THEN the error SHALL be logged with diagnostic details

