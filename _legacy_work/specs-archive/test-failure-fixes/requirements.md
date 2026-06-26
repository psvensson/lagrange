# Requirements Document

## Introduction

This document specifies the requirements for fixing 52 failing tests across 27 test suites in the distributed database system. The failures span multiple categories including bootstrap sequence issues, code path uniqueness violations, integration test failures, message delivery property test failures, and empty property test files that need implementation.

## Glossary

- **Bootstrap_Service**: The service responsible for initializing a seed node with system tables, partitions, and message groups
- **CDC_Integration_Service**: The service that routes system table writes and generates CDC events for cache updates
- **Message_Router**: The WebSocket-based transport layer for all inter-service communication
- **System_Table_Cache**: The in-memory cache of system tables updated by CDC events
- **Partition_Service**: A SQLite-backed Raft group for data storage
- **Message_Group_Service**: A Raft group for reliable inter-service communication
- **Worker_Raft_Node**: An inner class extending LifeRaft for worker process Raft consensus
- **Property_Test**: A test that verifies universal properties across many generated inputs using fast-check
- **Leader_Election**: The Raft consensus process for selecting a leader replica

## Requirements

### Requirement 1: Bootstrap Sequence System Table Initialization

**User Story:** As a system administrator, I want the bootstrap sequence to properly initialize system tables before CDC operations, so that the system can start reliably without "Table not found" errors.

#### Acceptance Criteria

1. WHEN the Bootstrap_Service starts the registration phase, THE System SHALL ensure all system tables (nodes, services, partitions, tables, message_groups, replica_operations) exist before CDC_Integration_Service attempts to use them
2. WHEN the CDC_Integration_Service attempts to insert into the services table, THE System SHALL have already created the services table schema
3. IF the services table does not exist during CDC operations, THEN THE Bootstrap_Service SHALL create it before proceeding with registration
4. WHEN bootstrap completes successfully, THE System_Table_Cache SHALL contain valid entries for all system tables

### Requirement 2: Code Path Uniqueness Compliance

**User Story:** As a developer, I want the codebase to have exactly one implementation for each class, so that the system follows the "no legacy or fallback code" principle.

#### Acceptance Criteria

1. THE Worker_Raft_Node class SHALL exist in exactly one location in the codebase
2. WHEN the code-path-uniqueness property test scans for duplicate classes, THE System SHALL report zero unexpected duplicates
3. IF a class needs to be shared between message-group-worker-service.js and partition-worker-service.js, THEN THE System SHALL extract it to a shared module
4. THE transport implementations test SHALL pass by having router-message-handler.js serve a distinct purpose from other transport files

### Requirement 3: Cross-Worker CDC Leader Election

**User Story:** As a system operator, I want CDC events to flow correctly across worker processes, so that partition leaders can communicate with message group leaders reliably.

#### Acceptance Criteria

1. WHEN partition replicas are created in worker processes, THE System SHALL complete leader election within the configured timeout (10 seconds)
2. WHEN message group replicas are created in worker processes, THE System SHALL complete leader election within the configured timeout (10 seconds)
3. WHEN a partition leader generates a CDC event, THE System SHALL deliver it to the subscribed message group leader
4. WHEN a message group leader receives a CDC event, THE System SHALL replicate it to followers via Raft consensus

### Requirement 4: Failure Scenario Handling

**User Story:** As a system administrator, I want the system to handle failure scenarios gracefully, so that UNIQUE constraint violations and routing failures are properly managed.

#### Acceptance Criteria

1. WHEN inserting into the nodes table, THE System SHALL handle UNIQUE constraint violations by updating existing records or returning appropriate errors
2. WHEN inserting into the services table, THE System SHALL handle UNIQUE constraint violations by updating existing records or returning appropriate errors
3. IF a route to partition replica_operations-p1 fails, THEN THE System SHALL retry with exponential backoff or return a clear error message

### Requirement 5: Multi-Worker Raft Leader Election

**User Story:** As a system operator, I want Raft leader election to complete reliably in multi-worker configurations, so that the system can operate with worker process isolation.

#### Acceptance Criteria

1. WHEN multiple partition replicas run in separate worker processes, THE System SHALL elect a leader within the configured timeout
2. WHEN multiple message group replicas run in separate worker processes, THE System SHALL elect a leader within the configured timeout
3. IF leader election times out, THEN THE System SHALL provide diagnostic information about which replicas failed to elect

### Requirement 6: Node Join Replica Activation

**User Story:** As a cluster administrator, I want joining nodes to activate replicas correctly, so that new nodes can participate in the cluster.

#### Acceptance Criteria

1. WHEN a node joins the cluster, THE System SHALL populate the nodes table within the configured timeout
2. WHEN waiting for the nodes table, THE System SHALL not timeout if the table is being populated via CDC
3. IF the nodes table is not available within timeout, THEN THE System SHALL provide a clear error message indicating the cause

### Requirement 7: WebSocket CREATE_REPLICA ACK Handling

**User Story:** As a developer, I want WebSocket CREATE_REPLICA operations to return proper errors on timeout, so that the system can handle network issues gracefully.

#### Acceptance Criteria

1. WHEN a CREATE_REPLICA request times out, THE System SHALL return an error response (not undefined)
2. WHEN handling CREATE_REPLICA ACK timeout, THE System SHALL include the timeout duration in the error message
3. IF CREATE_REPLICA fails due to timeout, THEN THE System SHALL clean up any partially created resources

### Requirement 8: Message Delivery Reliability

**User Story:** As a developer, I want message delivery through the message group system to be reliable, so that messages are either delivered or properly persisted for retry.

#### Acceptance Criteria

1. WHEN a message is sent through Message_Group_Service, THE Message_Router SHALL receive the message for delivery
2. WHEN the transport is available, THE System SHALL increment the message count on the router
3. WHEN a message is sent, THE System SHALL return a messageId and status indicating delivery or pending state
4. FOR ALL messages sent through the message group system, THE System SHALL either deliver directly or persist for retry

### Requirement 9: No Silent Delivery Failures

**User Story:** As a developer, I want message delivery failures to be explicit, so that the system never silently drops messages.

#### Acceptance Criteria

1. WHEN transport is null or unavailable, THE Message_Group_Service SHALL throw an error with message "WebSocket transport required but not available"
2. WHEN delivery fails due to unavailable transport, THE System SHALL NOT emit local events as a fallback
3. WHEN a valid transport is provided, THE System SHALL successfully deliver messages and increment the router message count

### Requirement 10: Property Test Implementation

**User Story:** As a developer, I want all property test files to contain actual test implementations, so that the test suite provides comprehensive coverage.

#### Acceptance Criteria

1. THE aggregate-function-correctness.property.test.js SHALL contain working property tests for COUNT, SUM, AVG, MIN, MAX aggregates
2. THE cache-based-routing.property.test.js SHALL contain working property tests for SQL query routing through system cache
3. THE sql-query-pbt.test.js SHALL contain working property tests for SQL query distribution and routing
4. THE cross-partition-join.property.test.js SHALL contain working property tests or be removed if not applicable
5. THE no-orphaned-replicas-after-recovery.property.test.js SHALL contain working property tests or be removed if not applicable
6. THE operation-log-persistence.property.test.js SHALL contain working property tests or be removed if not applicable
7. THE recovery-handles-incomplete-operations.property.test.js SHALL contain working property tests or be removed if not applicable
8. THE remove-workflow-step-progression.property.test.js SHALL contain working property tests or be removed if not applicable
9. THE cross-partition-rejection.property.test.js SHALL contain working property tests or be removed if not applicable
10. THE single-partition-acid.property.test.js SHALL contain working property tests or be removed if not applicable
11. THE transaction-durability-raft.property.test.js SHALL contain working property tests or be removed if not applicable
12. THE phase-lifecycle-events.property.test.js SHALL contain working property tests or be removed if not applicable

### Requirement 11: Test Configuration Compliance

**User Story:** As a developer, I want all property tests to follow the testing guidelines, so that tests run quickly and reliably.

#### Acceptance Criteria

1. FOR ALL property tests using fast-check, THE System SHALL configure numRuns to 10 as per testing guidelines
2. FOR ALL unit tests, THE System SHALL complete within 2 seconds
3. FOR ALL integration tests, THE System SHALL complete within 30 seconds
4. THE System SHALL NOT skip any tests using .skip(), xit(), or xdescribe()
