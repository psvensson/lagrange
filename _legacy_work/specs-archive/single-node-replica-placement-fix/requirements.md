# Stable Raft Leadership Requirements

## Problem Statement

Partition Raft groups should quickly elect a leader and maintain stable leadership until a cluster topology change occurs (e.g., node joining/leaving). Currently, replicas may experience "wobbling" - constant leadership changes where multiple replicas declare themselves leader.

## Glossary

- **Partition**: A SQLite-backed Raft group for data storage
- **Replica**: An instance of a partition on a specific node
- **Raft_Group**: A set of replicas that form a consensus group (managed by liferaft library)
- **Leader**: The replica that handles writes and coordinates replication
- **Wobbling**: Unstable state where leadership constantly changes
- **Liferaft**: The external library that implements Raft consensus protocol
- **Message_Router**: The transport layer for all inter-replica communication

## Requirements

### Requirement 1: Quick Leader Election

**User Story:** As a system operator, I want partition Raft groups to quickly elect a leader, so that the system becomes operational without unnecessary delays.

#### Acceptance Criteria

1. WHEN a partition Raft group initializes with multiple replicas THEN the Raft_Group SHALL elect exactly one leader within the election timeout period
2. WHEN all replicas are on the same node THEN the Raft_Group SHALL still elect exactly one leader through proper Raft protocol
3. WHEN replicas are distributed across multiple nodes THEN the Raft_Group SHALL elect a leader regardless of network topology

### Requirement 2: Stable Leadership

**User Story:** As a system operator, I want partition leadership to remain stable, so that the system operates efficiently without constant re-elections.

#### Acceptance Criteria

1. WHEN a leader is elected THEN the Raft_Group SHALL maintain that leader until a topology change or leader failure occurs
2. WHEN the leader sends heartbeats THEN followers SHALL acknowledge them and not start new elections
3. WHEN Raft term numbers are observed THEN the system SHALL show stable terms (not constantly incrementing)

### Requirement 3: Proper Raft Communication

**User Story:** As a system operator, I want replicas to properly communicate via Raft protocol, so that consensus can form correctly.

#### Acceptance Criteria

1. WHEN a replica initializes THEN the Partition_Service SHALL register with the Message_Router using its unified address
2. WHEN a replica sends Raft messages THEN the Message_Router SHALL deliver them to peer replicas regardless of node placement
3. WHEN replicas are co-located on the same node THEN the Message_Router SHALL route messages correctly between them

### Requirement 4: Correct Peer Discovery

**User Story:** As a system operator, I want replicas to know about all their peers, so that Raft elections work correctly.

#### Acceptance Criteria

1. WHEN a replica is created THEN the Partition_Service SHALL receive the list of all peer replica IDs
2. WHEN joining the Raft group THEN the replica SHALL connect to all known peers via liferaft's join() method
3. WHEN the peer list is incomplete THEN the replica SHALL NOT immediately declare itself leader

### Requirement 5: Liferaft Library Usage

**User Story:** As a developer, I want all Raft consensus logic to be handled by the liferaft library, so that we don't implement Raft ourselves.

#### Acceptance Criteria

1. THE system SHALL use the liferaft library for all Raft consensus operations
2. THE system SHALL NOT implement custom Raft election logic outside of liferaft
3. WHEN leader election is needed THEN the system SHALL rely on liferaft's built-in election mechanism
4. THE system SHALL only provide transport (write method) and configuration to liferaft

### Requirement 6: Message Router Transport

**User Story:** As a developer, I want all Raft communication to go through the Message Router, so that we have a unified transport layer.

#### Acceptance Criteria

1. THE Partition_Service SHALL use Message_Router as the transport for all Raft communication
2. WHEN liferaft calls the write() method THEN the system SHALL deliver messages via Message_Router
3. THE system SHALL NOT use any other transport mechanism for Raft messages
4. WHEN receiving Raft messages THEN the Message_Router SHALL route them to the correct replica handler

## Success Metrics

1. Raft groups elect exactly one leader
2. Leadership remains stable (no constant "Became leader" / "Lost leadership" cycles)
3. Raft term numbers stabilize after initial election
4. No "Critical rebalancing state detected" warnings after stabilization
