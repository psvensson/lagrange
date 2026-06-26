# Requirements Document

## Introduction

This document specifies requirements for improving test coverage across critical components of the distributed database system. The project has established testing guidelines requiring specific coverage targets that are currently not being met. This spec addresses coverage gaps in Raft consensus, CDC (Change Data Capture), bootstrap/lifecycle, and partition services.

The goal is to achieve the following coverage targets:
- Core consensus (Raft, replication): 90%+ line coverage, 85%+ branch coverage
- Bootstrap/lifecycle: 85%+ line coverage, 80%+ branch coverage
- CDC: 85%+ line coverage, 80%+ branch coverage
- Query routing/partition: 80%+ line coverage, 75%+ branch coverage

## Glossary

- **Raft_Consensus**: Distributed consensus algorithm used for leader election and log replication across replicas
- **RaftReplicaBase**: Abstract base class providing common Raft functionality for PartitionService and MessageGroupService
- **RaftTransportAdapter**: Adapter that bridges Raft protocol messages with the message routing system
- **CDC**: Change Data Capture - mechanism for streaming changes from partitions to system cache
- **CDCEventHandler**: Component that processes CDC events for epoch changes, node state changes, and node joins
- **CDCIntegrationService**: Service that routes all system table writes through SQL and handles CDC event processing
- **Bootstrap_Phase**: Discrete stage in the node startup process (INFRA, RAFT_ELECTION, SYSTEM_TABLE_SEED, etc.)
- **PartitionService**: Service managing a single partition replica with Raft consensus and SQL execution
- **Property_Test**: Test that verifies universal properties across many generated inputs using fast-check
- **Unit_Test**: Test that verifies specific examples, edge cases, and error conditions

## Requirements

### Requirement 1: Raft Replica Base Coverage

**User Story:** As a developer, I want comprehensive tests for RaftReplicaBase, so that leader election, role transitions, and peer communication are verified to work correctly.

#### Acceptance Criteria

1. WHEN a RaftReplicaBase instance is created with multiple replicas THEN the createRaftInstance method SHALL correctly configure liferaft with heartbeat and election timeouts
2. WHEN wireRaftEvents is called THEN the replica SHALL correctly handle leader, follower, candidate, and commit events from liferaft
3. WHEN joinPeers is called THEN the replica SHALL join all peer addresses to the Raft cluster
4. WHEN handleRaftPacket receives a valid Raft packet THEN the replica SHALL route it to liferaft and send responses via transport
5. WHEN handleRaftPacket receives a packet with invalid sender address THEN the replica SHALL log an error and skip sending response
6. WHEN startElection is called on a multi-replica group THEN the replica SHALL start the liferaft heartbeat timer
7. WHEN scheduleLearnerPromotion is called THEN the replica SHALL schedule a timer to check learner promotion
8. WHEN checkLearnerPromotion is called on a learner THEN the replica SHALL promote to follower and start election
9. IF a role update is queued with cdcIntegrationService set THEN the replica SHALL call flushRoleUpdate
10. IF a leader node update is queued THEN the replica SHALL call flushLeaderNodeUpdate

### Requirement 2: Raft Transport Adapter Coverage

**User Story:** As a developer, I want comprehensive tests for RaftTransportAdapter, so that message delivery between Raft replicas is verified to work correctly.

#### Acceptance Criteria

1. WHEN deliver is called with a valid peer address THEN the adapter SHALL route the message through the message router
2. WHEN deliver is called with an invalid address THEN the adapter SHALL throw an appropriate error
3. WHEN a Raft packet is received THEN the adapter SHALL validate the packet format before processing
4. WHEN the message router is unavailable THEN the adapter SHALL handle the error gracefully
5. FOR ALL valid Raft packets, delivering and receiving SHALL preserve packet contents (round-trip property)

### Requirement 3: CDC Event Handler Coverage

**User Story:** As a developer, I want comprehensive tests for CDCEventHandler, so that epoch changes, node state changes, and node join events are verified to be handled correctly.

#### Acceptance Criteria

1. WHEN handleEpochChangeCDC receives a valid epoch change event THEN the handler SHALL parse the epoch data and apply it to the epoch manager
2. WHEN handleEpochChangeCDC receives an event with invalid JSON THEN the handler SHALL return an error result without crashing
3. WHEN handleEpochChangeCDC receives an event for a non-epoch config key THEN the handler SHALL return a not-applied result
4. WHEN handleNodeStateCDC receives a valid node state change THEN the handler SHALL update tracked state and notify the rebalancer
5. WHEN handleNodeStateCDC receives an event with unchanged state THEN the handler SHALL return processed but not emit events
6. WHEN handleNodeJoinedCDC receives a new node INSERT event THEN the handler SHALL establish a WebSocket connection to the new node
7. WHEN handleNodeJoinedCDC receives an event for the current node THEN the handler SHALL skip connection (self-skip)
8. WHEN deriveWsAddressFromNodeAddress is called with valid address THEN the handler SHALL return correct WebSocket URL
9. IF the epoch manager is not set THEN handleEpochChangeCDC SHALL return an error result
10. IF the message router is not set THEN handleNodeJoinedCDC SHALL return an error result

### Requirement 4: CDC Integration Service Coverage

**User Story:** As a developer, I want comprehensive tests for CDCIntegrationService error paths and edge cases, so that the service handles failures gracefully.

#### Acceptance Criteria

1. WHEN executeSQL encounters a transient error THEN the service SHALL retry with exponential backoff
2. WHEN executeSQL exceeds max retry attempts THEN the service SHALL throw the final error
3. WHEN bootstrap mode is enabled THEN executeSQLDirectToLocalPartition SHALL write directly to local partitions
4. WHEN bootstrap mode is disabled THEN executeSQL SHALL route through the SQL query engine
5. WHEN waitForCacheUpdate is called THEN the service SHALL wait for cache to reflect the write
6. WHEN prepareInsertData is called THEN the service SHALL apply schema defaults and generate primary keys
7. IF the SQL query engine returns a failure result THEN the service SHALL handle it appropriately
8. IF bootstrap mode is enabled without partition services THEN setBootstrapMode SHALL throw an error

### Requirement 5: Bootstrap Phase Coverage

**User Story:** As a developer, I want comprehensive tests for bootstrap phase transitions and failure scenarios, so that bootstrap failures are deterministic and diagnosable.

#### Acceptance Criteria

1. WHEN a bootstrap phase completes successfully THEN the state machine SHALL transition to the next phase
2. WHEN a bootstrap phase fails THEN the state machine SHALL transition to FAILED state with error details
3. WHEN a phase timeout occurs THEN the state machine SHALL report the phase name, elapsed time, and timeout value
4. WHEN the READY phase is reached THEN the state machine SHALL allow join requests
5. FOR ALL valid phase sequences, transitioning through phases SHALL maintain state consistency (invariant property)
6. FOR ALL phase transitions, the state machine SHALL emit appropriate events

### Requirement 6: Partition Service Coverage

**User Story:** As a developer, I want comprehensive tests for PartitionService query handling and replication, so that partition operations are verified to work correctly.

#### Acceptance Criteria

1. WHEN executeLocalQuery is called on a leader THEN the partition SHALL execute the query and return results
2. WHEN executeLocalQuery is called on a follower THEN the partition SHALL forward to the leader or return an error
3. WHEN a write operation is committed through Raft THEN the partition SHALL generate a CDC event
4. WHEN handleRaftPacket receives a valid packet THEN the partition SHALL process it through the Raft consensus
5. FOR ALL valid SQL queries, executing on leader SHALL return consistent results
6. IF the partition is not initialized THEN operations SHALL return appropriate errors

### Requirement 7: Integration Test Requirements

**User Story:** As a developer, I want integration tests that verify real Raft consensus behavior, so that the system is tested end-to-end without mocking critical components.

#### Acceptance Criteria

1. THE integration tests SHALL use real Raft consensus (no mocking liferaft)
2. THE integration tests SHALL complete within 30 seconds
3. WHEN testing leader election THEN the tests SHALL create real multi-replica Raft groups
4. WHEN testing replication THEN the tests SHALL verify data is replicated through Raft consensus
5. THE integration tests SHALL verify CDC events propagate correctly after writes

### Requirement 8: Property Test Requirements

**User Story:** As a developer, I want property-based tests that verify universal correctness properties, so that edge cases are discovered through randomized testing.

#### Acceptance Criteria

1. THE property tests SHALL use fast-check with {numRuns: 10} configuration
2. THE property tests SHALL complete within 2 seconds (unit test limit)
3. WHEN testing round-trip properties THEN the tests SHALL verify encode/decode preserves data
4. WHEN testing invariants THEN the tests SHALL verify properties hold across all generated inputs
5. THE property tests SHALL reference the design document property they validate

