# Distributed Database System - Tasks

> **Document Hierarchy**: Implementation tasks for [requirements.md](.kiro/specs/distributed-database-system/requirements.md). See [design.md](.kiro/specs/distributed-database-system/design.md) for architecture details.

## Status Legend

- ⬜ Not Started
- 🔄 In Progress
- ✅ Completed
- 🚫 Blocked

---

## Phase 1: Core Infrastructure

### 1.1 Configuration Management (Req 11)
- [x] Central configuration system with symbolic names
- [x] JSON schema validation for configuration
- [x] Configuration categories (node, raft, partition, logging, etc.)
- [x] Environment variable support via dotenv

### 1.2 Logging Infrastructure (Req 17)
- [x] Pino logger integration
- [x] Structured logging with metadata (node_id, service_id, timestamp)
- [x] Configurable log levels
- [x] Log storage in logs system table

### 1.3 Worker Thread Pool (Req 2)
- [x] Piscina thread pool setup
- [x] Service execution in worker threads
- [x] Inter-thread message passing
- [x] Worker health monitoring

---

## Phase 2: Storage Layer

### 2.1 SQLite Partition Storage (Req 3)
- [x] better-sqlite3 integration
- [x] Partition replica storage implementation
- [x] ACID transaction support within partitions
- [x] Storage size tracking for split/merge decisions

### 2.2 Raft Consensus (Req 3, 20)
- [ ] raft-logic integration
- [x] Raft group management for partitions
- [x] Leader election and failover
- [x] Log replication across replicas

### 2.3 Partition Management (Req 3, 21)
- [x] Partition creation with key ranges
- [x] Automatic partition splitting at median key
- [x] Adjacent partition merging
- [x] Partition key range validation

---

## Phase 3: Message Groups

### 3.1 Message Group Service (Req 4)
- [x] 3-replica Raft groups with in-memory storage
- [x] Simultaneous delivery and persistence
- [x] Message retry with exponential backoff
- [x] Acknowledgment handling

### 3.2 System Table Cache (Req 4, 5)
- [x] Read-only cache wrapper implementation
- [x] CDC subscription for cache updates
- [x] Cache query API for local services
- [x] Cache consistency via CDC events only

### 3.3 Message Group Transport (Req 4, 10)
- [x] MessageGroupTransport for partition Raft
- [x] WebSocket connections between nodes
- [x] Local message routing (same-node)
- [x] Remote message routing (cross-node)

---

## Phase 4: Node Management

### 4.1 Node Service (Req 1, 2)
- [x] Node service implementation
- [x] Service start/stop/monitor capabilities
- [x] Node resource statistics collection
- [x] REST API via Fastify

### 4.2 Node Bootstrap (Req 6, 8)
- [x] Seed node initialization
- [x] System tables creation on first node
- [x] New node bootstrap from seed
- [x] Message group assignment during join

### 4.3 Node Discovery (Req 8)
- [x] UUID v4 node ID generation
- [x] Seed node REST API for joining
- [x] Bootstrap response with cluster state
- [x] Message group creation/joining

---

## Phase 5: System Tables

### 5.1 Core System Tables (Req 6)
- [x] `tables` - Table metadata and policies
- [x] `partitions` - Partition locations and ranges
- [x] `indices` - Index metadata
- [x] `message_groups` - Message group membership
- [x] `nodes` - Node registry and statistics
- [x] `services` - Service registry with raft_role
- [x] `logs` - Centralized log storage
- [x] `config` - System configuration

### 5.2 CDC Integration (Req 5)
- [x] CDC event generation on table changes
- [x] CDC propagation to message groups
- [x] CDCIntegrationService for system table writes
- [x] INSERT/UPDATE/DELETE event handling

---

## Phase 6: SQL Processing

### 6.1 Query Parsing (Req 7)
- [x] SQL dialect parser (CockroachDB-like)
- [x] Query plan generation
- [x] Partition resolution from WHERE clauses

### 6.2 Query Execution (Req 7, 16)
- [x] SELECT routing to partitions
- [x] Parallel query execution
- [x] Result aggregation
- [x] INSERT/UPDATE/DELETE routing

### 6.3 Transaction Support (Req 22)
- [x] Single-partition ACID transactions
- [x] BEGIN/COMMIT/ROLLBACK support
- [x] READ COMMITTED isolation
- [x] Cross-partition transaction rejection

---

## Phase 7: Rebalancing & Fault Tolerance

### 7.1 Unified Rebalancer (Req 9)
- [x] Single rebalancer for partitions and message groups
- [x] Policy-driven placement decisions
- [x] Node resource consideration
- [x] Replica count management (3→5→7)

### 7.2 Failure Detection (Req 15)
- [x] Node failure detection
- [x] Replica unavailability marking
- [x] Replacement replica creation
- [x] Node recovery and reintegration

### 7.3 Message Retry (Req 18)
- [x] Exponential backoff retry
- [x] Alternative replica delivery
- [x] Metadata cache with TTL
- [x] Fresh metadata queries on failures

---

## Phase 8: Policies & Indices

### 8.1 Table Policies (Req 14)
- [x] Split threshold configuration
- [x] Merge criteria configuration
- [x] Replication factor settings
- [x] Policy storage in tables system table

### 8.2 Index Management (Req 13)
- [x] Index creation on columns
- [x] Index metadata in indices table
- [x] Automatic index maintenance
- [x] Query optimization with indices

---

## Phase 9: Packaging & Deployment

### 9.1 Single Executable (Req 19)
- [x] Node.js SEA packaging for database
- [x] Node.js SEA packaging for admin CLI
- [x] Linux binary builds
- [x] Dependency bundling

### 9.2 Admin CLI Tool
- [x] WebSocket connection to nodes
- [x] Cluster monitoring commands
- [x] Node management operations
- [x] Query execution interface

---

## Phase U: Runtime Unification & Modularization

> **Spec**: [docs/runtime-unification-and-modularization-spec.md](docs/runtime-unification-and-modularization-spec.md)

### U1 Shared Replica Lifecycle Closure
- [x] Move leader-change reconciliation fully into `RaftReplicaBase`
- [x] Remove duplicated raft lifecycle wiring from partition/message-group services
- [x] Add shared lifecycle regressions for demotion without follower event

### U2 Shared Authoritative Mutation Helper
- [x] Introduce one owner-row mutation helper with cache-visibility confirmation
- [x] Migrate raft role persistence to the shared helper
- [x] Migrate leader-node persistence to the shared helper
- [x] Remove per-service retry/cache-gap mutation logic

### U3 Canonical Snapshot & Evaluator Closure
- [x] Derive canonical leaders from owner rows in control snapshots
- [x] Separate replica-role inconsistency from canonical leader mismatch
- [x] Update consistency evaluator to compare canonical leader identity first

### U4 Scenario Config Normalization Closure
- [x] Create a harness-owned spec for runtime unification and modularization
- [x] Normalize `postgres-baseline-comparison` benchmark config in the harness config layer
- [x] Validate preload/post-load timeout budgets before scenario execution
- [x] Freeze normalized `postgres-baseline-comparison` benchmark config objects
- [x] Remove remaining scenario-local config reinterpretation from distributed scenarios

### U5 Documentation & Governance Closure
- [x] Update operator docs to describe canonical owner rows vs read models
- [x] Document the extension path for new raft-backed runtime services
- [x] Align contributor guidance with the runtime-unification ownership rules

---

## Checkpoints

### Checkpoint 1: Infrastructure Complete
- [ ] Configuration, logging, and threading operational
- [ ] Run full test suite: `npm test`

### Checkpoint 2: Storage Layer Complete
- [ ] SQLite + Raft partitions working
- [ ] Run full test suite: `npm test`

### Checkpoint 3: Message Groups Complete
- [ ] Message routing and CDC operational
- [ ] Run full test suite: `npm test`

### Checkpoint 4: Single Node Bootstrap
- [ ] Seed node creates all system tables
- [ ] Run full test suite: `npm test`

### Checkpoint 5: Multi-Node Cluster
- [ ] Nodes can join and communicate
- [ ] Run full test suite: `npm test`

### Checkpoint 6: SQL Operations
- [ ] SELECT/INSERT/UPDATE/DELETE working
- [ ] Run full test suite: `npm test`

### Checkpoint 7: Production Ready
- [ ] Rebalancing, fault tolerance, packaging complete
- [ ] Run full test suite: `npm test`
