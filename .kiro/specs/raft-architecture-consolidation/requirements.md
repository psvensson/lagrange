# Requirements Document

## Introduction

The distributed database codebase has accumulated significant architectural debt around Raft consensus integration. Four separate service implementations (PartitionService, MessageGroupService, PartitionWorkerService, MessageGroupWorkerService) duplicate Raft lifecycle management, peer address resolution, and CDC handling. RaftReplicaBase imports NodeService as a singleton, creating hidden coupling. PartitionService remains a ~3000-line god object despite prior extraction efforts. This consolidation eliminates duplication, breaks hidden dependencies, and decomposes oversized components into focused, composable pieces.

## Glossary

- **RaftGroup**: A new composable class that encapsulates liferaft instance lifecycle (create, wire events, join peers, start election, shutdown). Replaces duplicated Raft setup code across services.
- **PeerAddressResolver**: A standalone utility that resolves peer replica IDs to unified addresses using peerAddresses arrays and system table cache lookups. Replaces duplicated buildPeerAddress() implementations.
- **PartitionService**: The main-process partition service in src/partition/partition-service.js (~3000 lines) that manages SQLite-backed Raft groups for data storage.
- **MessageGroupService**: The main-process message group service in src/message-group/message-group-service.js that manages in-memory Raft groups for inter-service communication.
- **PartitionWorkerService**: The worker-process partition service in src/worker/partition-worker-service.js that runs partition replicas in piscina worker threads.
- **MessageGroupWorkerService**: The worker-process message group service in src/worker/message-group-worker-service.js that runs message group replicas in piscina worker threads.
- **RaftReplicaBase**: The abstract base class in src/raft/raft-replica-base.js that provides common Raft functionality for main-process services.
- **ReplicaWorkerBase**: The abstract base class in src/worker/replica-worker-base.js that provides common lifecycle for worker-process replicas.
- **NodeService**: The singleton service in src/node/node-service.js that manages node lifecycle and owns the system table cache.
- **SystemTableCache**: The in-memory cache of system tables, updated only by CDC events.
- **AddressManager**: The singleton utility for formatting and parsing unified addresses ({nodeId}/{entityType}/{entityId}).
- **CDCEmitter**: A new composable class that encapsulates CDC event generation, subscriber management, and event delivery.
- **SQLiteStore**: A new composable class that encapsulates SQLite database lifecycle (open, schema creation, query execution, close).
- **PartitionCoordinator**: A new orchestrator class that wires RaftGroup, SQLiteStore, and CDCEmitter together for partition replicas.
- **Thin_Facade**: A main-process service that delegates all Raft and storage operations to its corresponding worker service, retaining only the API surface needed by callers.

## Requirements

### Requirement 1: Extract RaftGroup Class

**User Story:** As a developer, I want a single RaftGroup class that encapsulates all liferaft lifecycle management, so that Raft setup, event wiring, peer joining, election starting, and shutdown are defined once and reused by all replica types.

#### Acceptance Criteria

1. THE RaftGroup class SHALL encapsulate liferaft instance creation, event wiring, peer joining, election management, and shutdown in a single composable class
2. WHEN a RaftGroup is constructed, THE RaftGroup SHALL accept configuration options including replicaId, replicaIds, transport, entityType, peerAddresses, deferElection, systemTableCache, and logAdapter without importing any singleton services
3. WHEN RaftGroup.initialize() is called, THE RaftGroup SHALL create a liferaft instance with the provided configuration and wire leader, follower, candidate, commit, leader-change, and term-change events
4. WHEN RaftGroup.joinPeers() is called, THE RaftGroup SHALL join all peer replicas by resolving their addresses through the injected PeerAddressResolver
5. WHEN RaftGroup.startElection() is called on a multi-replica group, THE RaftGroup SHALL start the liferaft heartbeat timer to begin leader election
6. WHEN RaftGroup.startElection() is called on a single-replica group, THE RaftGroup SHALL immediately promote the replica to leader without starting election timers
7. WHEN RaftGroup.shutdown() is called, THE RaftGroup SHALL clear all liferaft timers, end the liferaft instance, and clear all internal retry timers
8. WHEN a Raft packet is received, THE RaftGroup SHALL validate the sender address format and emit the packet to the liferaft instance for processing
9. WHEN PartitionWorkerService or MessageGroupWorkerService initializes Raft, THE service SHALL use RaftGroup via composition instead of duplicating Raft setup code
10. WHEN RaftReplicaBase initializes Raft, THE RaftReplicaBase SHALL delegate to RaftGroup via composition instead of implementing Raft setup directly

### Requirement 2: Remove NodeService Singleton from RaftReplicaBase

**User Story:** As a developer, I want RaftReplicaBase to receive all dependencies through its constructor, so that the Raft layer has no hidden coupling to node-level or cache-level singletons.

#### Acceptance Criteria

1. THE RaftReplicaBase constructor SHALL accept systemTableCache as a required constructor option
2. THE RaftReplicaBase module SHALL NOT import NodeService
3. WHEN RaftReplicaBase is constructed without a systemTableCache option, THE RaftReplicaBase SHALL throw an error indicating that systemTableCache is required
4. WHEN any service creates a RaftReplicaBase instance, THE calling service SHALL pass the systemTableCache explicitly from its own dependencies
5. THE RaftReplicaBase constructor SHALL accept a logger instance as a constructor option instead of calling LoggingService.getInstance()
6. THE RaftReplicaBase constructor SHALL accept an addressManager instance as a constructor option instead of calling AddressManager.getInstance()

### Requirement 3: Extract PeerAddressResolver Utility

**User Story:** As a developer, I want a single PeerAddressResolver utility that resolves peer replica IDs to unified addresses, so that the ~40-line buildPeerAddress() logic is defined once instead of being duplicated across four services.

#### Acceptance Criteria

1. THE PeerAddressResolver SHALL accept an addressManager instance and a systemTableCache instance through its constructor
2. WHEN PeerAddressResolver.resolve() is called with a peerId that is already in unified address format, THE PeerAddressResolver SHALL validate the format and return the address as-is
3. WHEN PeerAddressResolver.resolve() is called with a peerId and a peerAddresses array, THE PeerAddressResolver SHALL search the array for a matching address and return it
4. WHEN PeerAddressResolver.resolve() is called with a peerId not found in peerAddresses, THE PeerAddressResolver SHALL look up the node ID from the systemTableCache services table and construct the unified address
5. IF PeerAddressResolver.resolve() cannot resolve a peerId from any source, THEN THE PeerAddressResolver SHALL throw an error with a descriptive message including the unresolved peerId
6. WHEN RaftReplicaBase, PartitionService, MessageGroupService, PartitionWorkerService, or MessageGroupWorkerService needs to resolve a peer address, THE service SHALL use PeerAddressResolver instead of implementing its own buildPeerAddress() method

### Requirement 4: Converge on Worker-Based Architecture

**User Story:** As a developer, I want the worker-based services (PartitionWorkerService, MessageGroupWorkerService) to be the sole Raft implementations, so that main-process services become thin facades and Raft lifecycle code exists in only one place per entity type.

#### Acceptance Criteria

1. WHEN PartitionService receives a Raft-related operation, THE PartitionService SHALL delegate the operation to PartitionWorkerService through the ReplicaWorkerManager instead of managing its own liferaft instance
2. WHEN MessageGroupService receives a Raft-related operation, THE MessageGroupService SHALL delegate the operation to MessageGroupWorkerService through the ReplicaWorkerManager instead of managing its own liferaft instance
3. THE PartitionService thin facade SHALL retain the public API surface (executeQuery, startElection, shutdown, getRole, isLeaderReplica) while delegating all Raft and storage operations to the worker
4. THE MessageGroupService thin facade SHALL retain the public API surface (deliver, handleMessage, startElection, shutdown, getRole) while delegating all message handling and Raft operations to the worker
5. WHEN the thin facade PartitionService is shut down, THE PartitionService SHALL coordinate shutdown of its corresponding worker replica through ReplicaWorkerManager
6. THE codebase SHALL NOT contain duplicate Raft initialization logic between main-process services and worker services after consolidation

### Requirement 5: Decompose PartitionService into Composable Pieces

**User Story:** As a developer, I want PartitionService broken into focused composable classes (RaftGroup, SQLiteStore, CDCEmitter, PartitionCoordinator), so that each class has a single responsibility and the overall system is easier to test and maintain.

#### Acceptance Criteria

1. THE SQLiteStore class SHALL encapsulate SQLite database lifecycle including opening the database, creating tables from schema, executing queries, and closing the database
2. WHEN SQLiteStore.executeQuery() is called with a SELECT statement, THE SQLiteStore SHALL return the result rows
3. WHEN SQLiteStore.executeQuery() is called with an INSERT, UPDATE, or DELETE statement, THE SQLiteStore SHALL execute the statement and return the change count
4. THE CDCEmitter class SHALL encapsulate CDC event generation, subscriber management, and event delivery
5. WHEN a write operation completes on a partition, THE CDCEmitter SHALL generate a CDC event with the table name, operation type, changed data, and HLC timestamp
6. THE PartitionCoordinator class SHALL wire RaftGroup, SQLiteStore, and CDCEmitter together, coordinating their lifecycle (initialize, start, shutdown)
7. WHEN PartitionCoordinator.initialize() is called, THE PartitionCoordinator SHALL initialize SQLiteStore, then RaftGroup, then CDCEmitter in sequence
8. WHEN PartitionCoordinator.shutdown() is called, THE PartitionCoordinator SHALL shut down CDCEmitter, then RaftGroup, then SQLiteStore in reverse order
9. THE PartitionCoordinator SHALL expose the same public query and replication API that PartitionService currently provides

### Requirement 6: Eliminate Remaining Singleton Imports in Raft Layer

**User Story:** As a developer, I want all singleton calls (ConfigurationManager.getInstance(), LoggingService.getInstance(), AddressManager.getInstance()) removed from the Raft layer constructors, so that dependencies are explicit and testable.

#### Acceptance Criteria

1. WHEN RaftGroup is constructed, THE RaftGroup SHALL receive heartbeat and election timeout configuration values as constructor options instead of calling ConfigurationManager.getInstance()
2. WHEN any Raft-layer class needs logging, THE class SHALL receive a logger instance through its constructor instead of calling LoggingService.getInstance()
3. WHEN any Raft-layer class needs address formatting, THE class SHALL receive an AddressManager instance through its constructor instead of calling AddressManager.getInstance()
4. THE src/raft/ directory SHALL NOT contain any getInstance() calls after consolidation

### Requirement 7: Update Architecture Documentation

**User Story:** As a developer, I want architecture.md to accurately reflect the consolidated Raft architecture, so that the documentation matches the actual codebase structure.

#### Acceptance Criteria

1. WHEN the RaftGroup class is introduced, THE architecture.md document SHALL describe RaftGroup as the single source of Raft lifecycle management used by all replica types
2. WHEN main-process services become thin facades, THE architecture.md document SHALL update the component descriptions for PartitionService and MessageGroupService to reflect their facade role
3. WHEN PeerAddressResolver is extracted, THE architecture.md document SHALL document PeerAddressResolver as the single peer address resolution mechanism
4. WHEN PartitionService is decomposed, THE architecture.md document SHALL describe the PartitionCoordinator, SQLiteStore, CDCEmitter, and RaftGroup composition pattern
5. THE architecture.md document SHALL remove any references to duplicate Raft initialization patterns across services

### Requirement 8: Maintain Test Coverage Through Refactoring

**User Story:** As a developer, I want all existing tests to continue passing after each refactoring step, so that the consolidation does not introduce regressions.

#### Acceptance Criteria

1. WHEN a refactoring step is completed, THE test suite SHALL pass with no new failures
2. THE RaftGroup class SHALL have unit tests verifying lifecycle management (initialize, joinPeers, startElection, shutdown)
3. THE PeerAddressResolver SHALL have unit tests verifying address resolution from unified format, peerAddresses array, and systemTableCache lookup
4. THE SQLiteStore class SHALL have unit tests verifying database lifecycle and query execution
5. THE CDCEmitter class SHALL have unit tests verifying event generation and subscriber notification
6. IF a test takes longer than 2 seconds, THEN THE test SHALL be analyzed and fixed to run within the time limit
