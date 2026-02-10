# Distributed Database System Architecture

This document describes the architecture of the distributed database system. It should be updated as features are added or changed.

## Overview

A scalable distributed database where:
- ALL persistent information is stored in tables
- ALL tables are implemented as partitions
- ALL partitions are Raft consensus groups with odd-numbered replicas (minimum 3)
- ALL partitions use SQLite for storage
- WASM service groups are a third Raft group type for hosting replicated WASI/WASM services

## Core Principles

1. **Tables as the Universal Storage Model** - System metadata and user data are stored in tables
2. **Partitions as Raft Groups** - Each partition is a Raft consensus group using liferaft
3. **System Cache as Single Source of Truth** - In-memory cache of system tables, updated by CDC events
4. **Message Router for All Communication** - All messages (local and remote) route through WebSocket-based MessageRouter
5. **No Fallback Code Paths** - Single code path for any given logic; no legacy or alternative mechanisms
6. **SQL Engine for All System Reads** - All reads of system information go through the SQL engine (which uses the system cache for routing); no direct cache reads outside cache/query internals
7. **Single Owner per Concern** - Each concern (state tracking, failure detection, replica state, writes) has exactly one owning component

## Single-Path Contract

To prevent overlap and contradictory runtime behavior:

1. **Placement Planning:** `MovePlanner` is the only planner implementation.  
   `UnifiedRebalancer` may orchestrate, but must not duplicate planning logic.
2. **Operation Lifecycle:** `RebalanceCoordinator` + `replica_operations` owns
   operation state. Workflow transitions must be monotonic and idempotent.
3. **Dispatch:** `ReplicaDispatchService` dispatches only after an atomic
   workflow-step claim (`PENDING -> SENDING`) to prevent duplicate dispatch.
4. **Leader Discovery for Writes:** write routing uses `services` metadata via
   system cache/SQL routing; alternate leader hints are non-authoritative.
5. **Readiness Gating:** dispatch and rebalancer use a shared readiness policy.
6. **Epoch Propagation:** `config.current_epoch` + CDC is the single epoch
   authority; no secondary epoch source.

## System Tables

The following system tables store cluster metadata:

| Table | Purpose | Primary Key |
|-------|---------|-------------|
| `nodes` | All registered nodes with addresses and status | `node_id` |
| `partitions` | All partitions with key ranges and replica counts | `partition_id` |
| `services` | All partition, message group, and WASM service replicas with addresses and Raft roles | `service_id` |
| `tables` | All user tables with schemas and policies | `table_id` |
| `message_groups` | All message groups with replica counts | `group_id` |
| `replica_operations` | Pending replica operations (splits, merges, rebalancing) | `operation_id` |
| `indices` | Secondary indices for tables | `index_id` |
| `logs` | System logs | `log_id` |
| `config` | Dynamic configuration | `config_key` |
| `live_queries` | Active live query subscriptions | `query_id` |
| `contexts` | Function execution contexts | `context_id` |
| `code` | Stored functions/procedures | `code_id` |
| `service_definitions` | WASM service definitions with handler functions and configuration | `service_id` |
| `service_endpoints` | WASM service endpoint addresses for gateway integration | `endpoint_id` |
| `service_timers` | Persistent timers for WASM service groups | `timer_id` |

## Node State Vocabulary

All node states use the unified `NODE_STATE` enum from `src/constants/node-state.js`. There is no separate `NODE_STATUS` or node-specific `STATE` enum.

| State | Meaning |
|-------|---------|
| INITIALIZING | Node starting up, pre-bootstrap |
| STARTING | Seed node bootstrap in progress |
| CONNECTING | Establishing connections |
| DISCOVERING | Discovering cluster topology |
| JOINING | Joining node bootstrap in progress |
| READY | Node ready to serve queries |
| ACTIVE | Node fully operational |
| SUSPECTED | Heartbeat delayed, under suspicion |
| FAILED | Confirmed failure |
| RECOVERING | Recovery detected, health checks in progress |
| DRAINING | Graceful shutdown, draining traffic |
| SHUTTING_DOWN | Shutdown in progress |
| STOPPED | Fully stopped |

The general `STATE` enum (`src/constants/states.js`) retains only non-node values: CONNECTED, DISCONNECTED, NORMAL.

## Component Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              Node                                            │
├─────────────────────────────────────────────────────────────────────────────┤
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────────────────┐  │
│  │   Admin API     │  │  Bootstrap API  │  │      SQL Query Engine       │  │
│  │  (WebSocket)    │  │    (HTTP)       │  │                             │  │
│  └────────┬────────┘  └────────┬────────┘  └──────────────┬──────────────┘  │
│           │                    │                          │                  │
│           ▼                    ▼                          ▼                  │
│  ┌──────────────────────────────────────────────────────────────────────┐   │
│  │                        System Table Cache                             │   │
│  │              (In-memory, updated by CDC events only)                  │   │
│  └──────────────────────────────────────────────────────────────────────┘   │
│           │                    │                          │                  │
│           ▼                    ▼                          ▼                  │
│  ┌──────────────────────────────────────────────────────────────────────┐   │
│  │                         Message Router                                │   │
│  │           (WebSocket-based, handles local and remote)                 │   │
│  └──────────────────────────────────────────────────────────────────────┘   │
│           │                    │                          │                  │
│           ▼                    ▼                          ▼                  │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────────────────┐  │
│  │ Message Group   │  │ Message Group   │  │    Partition Services       │  │
│  │ Replica 1       │  │ Replica 2       │  │    (SQLite + Raft)          │  │
│  │ (Raft)          │  │ (Raft)          │  │                             │  │
│  └─────────────────┘  └─────────────────┘  └─────────────────────────────┘  │
│                                            ┌─────────────────────────────┐  │
│                                            │  WASM Service Groups        │  │
│                                            │  (SQLite + Raft + WASM)     │  │
│                                            └─────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────────────┘
```

## Key Components

### NodeService (Singleton)
- Administrative component present on every node
- Manages service lifecycle and health monitoring
- Owns the system table cache (singleton per node)

### NodeLifecycleStateMachine
- Unified state machine for all node lifecycle states using NODE_STATE enum
- Supports sub-phases within STARTING (bootstrap) and JOINING states
- Bootstrap sub-phases: INFRASTRUCTURE → MESSAGE_GROUPS → PARTITIONS → REGISTRATION → CACHE_HYDRATION
- Joining sub-phases: CONTACTING_SEED → CONNECTING_WEBSOCKET → CREATING/JOINING_MG → WAITING_LEADERSHIP → QUERYING_STATE
- Phase gates can be registered per sub-phase for validation
- Terminal sub-phases auto-advance the parent state
- Replaces the former independent BootstrapPhaseStateMachine, JoiningPhaseStateMachine, and EnhancedBootstrapStateMachine

### FailureDetector (Single Instance)
- Single failure detection component (no duplicate detection in NodeLifecycleService)
- Reads node state via SQL engine (not direct cache access)
- Writes status changes via CDC (single write per status change)
- Supports adaptive thresholds for flapping nodes
- Detects recovery when failed nodes resume heartbeating

### MessageRouter
- Unified message routing for local and remote communication
- WebSocket-based transport (mandatory)
- Self-connection for uniform routing (all messages go through WebSocket)
- Address format: `{nodeId}/{entityType}/{entityId}`

### SystemTableCache
- In-memory cache of all system tables
- Updated ONLY by CDC events (single source of truth)
- Provides read-only wrapper for safe access
- Supports cache change listeners for reactive updates

### CDCIntegrationService
- Routes all system table writes through SQL
- Bootstrap mode for seed node direct writes (temporary, cleared after registration)
- Normal mode routes through SQL engine to partition leaders
- Generates CDC events that update all node caches
- Single bootstrap writer: replaces the former BootstrapPartitionWriter and BootstrapSystemTableWriter
- Runtime CDC event processing is instantiated once via `CDCEventHandler`
- `handleEpochChangeCDC` and `handleNodeStateCDC` delegate to that single runtime handler path
- Epoch propagation is cluster-scoped via `config.current_epoch` and `setEpochManager(...)`

### PartitionService
- SQLite-backed Raft group for data storage
- Uses liferaft library for Raft consensus
- Generates CDC events on writes
- Supports transactions (single-partition only)

### MessageGroupService
- Reliable inter-service communication
- 3-replica Raft groups using liferaft
- Ensures message delivery with retry logic
- Every node has at least one message group replica

### WasmServiceReplica
- Third Raft group type alongside partitions and message groups
- Extends `RaftReplicaBase` with `entityType` set to `WASM_SERVICE`
- Integrates SessionKVStore (replicated KV), SafetyInterval (read consistency), TimerManager (persistent timers), and WasmExecutor (WASM function execution)
- Registers in `services` table with `service_type` set to `wasm_service`
- Managed by `UnifiedRebalancer` for replica placement using the same policy-based approach as other entity types

### SQLQueryEngine
- Main entry point for SQL query processing
- Routes queries through system cache to find partition leaders
- Supports SELECT, INSERT, UPDATE, DELETE, CREATE TABLE
- Transaction support (BEGIN, COMMIT, ROLLBACK)
- All system reads (outside cache/query internals) must go through this engine

### ReplicaStateMachine (Single Replica State Owner)
- Single authority for all replica state tracking
- ReplicaLifecycleManager and ReplicaHandler delegate to it (no independent state maps)
- All replica state changes produce exactly one CDC write to the services table
- Replaces the former triple-tracking in ReplicaStateMachine, ReplicaLifecycleManager, and ReplicaHandler

### Control Plane Services (Decomposed)
The former monolithic ControlPlaneService is decomposed into four focused services, each with a CREATED → INITIALIZED → RUNNING → STOPPED lifecycle:

- **HeartbeatService** (`src/control-plane/heartbeat-service.js`) — periodic heartbeat updates, consecutive failure tracking
- **LeaseService** (`src/control-plane/lease-service.js`) — lease-based readiness tracking, expired lease sweeping
- **EndpointService** (`src/control-plane/endpoint-service.js`) — endpoint registration and management
- **ReplicaDispatchService** (`src/control-plane/replica-dispatch-service.js`) — replica operation dispatch, message forwarding to leaders

A thin `ControlPlaneService` facade remains for backward compatibility, delegating to these focused services.

### UnifiedRebalancer
- Manages replica placement for partitions, message groups, and WASM service groups
- Operates autonomously (no manual placement)
- Uses policies to determine target replica count and placement
- Stabilization period prevents thrashing
- Cluster-wide rebalance budget limits concurrent moves (stored in config table)
- Critical moves (under-replicated from node failure) get elevated budget via multiplier
- Reads in-flight operation count via SQL engine before planning moves

## Bootstrap Process

### Seed Node Bootstrap

```
Phase 1: Infrastructure
├── Initialize ConfigurationManager
├── Initialize NodeService (creates SystemTableCache)
├── Create MessageRouter with WebSocket server
└── Establish self-connection for uniform routing

Phase 2: Message Groups
├── Create 3 message group replicas (deferred election)
├── Register handlers with MessageRouter
└── Elections deferred until Phase 3 complete

Phase 3: Partitions
├── Create partition services for all system tables
├── Each partition is a 3-replica Raft group
├── Start elections for message groups and partitions
└── Wait for leadership establishment

Phase 4: Registration (Bootstrap Mode)
├── Enable bootstrap mode (direct writes)
├── Write initial system table data directly to partitions
├── Seed `config.current_epoch` when absent
├── Register nodes, services, partitions, tables
└── Disable bootstrap mode

Phase 5: Cache Hydration
├── Read all system table data from local partitions
├── Populate system cache with complete cluster state
├── Strict hydration verification fails hard on missing/incomplete required tables
├── Strict leader-readiness gate blocks on missing leader metadata (including addresses)
└── Only then swap to routed SQL writer/cdc mode for all subsequent writes
```

### Joining Node Bootstrap

```
1. HTTP Bootstrap Request → Contact seed node via /bootstrap endpoint
2. Receive Complete Snapshots → Bootstrap response includes all system tables
3. Cache Hydration → Populate local system cache from snapshots
4. Leader Readiness Gate → Block until leader metadata is complete (including addresses)
5. CDC Subscription → Subscribe to CDC events for all system tables
6. Node Registration → Register self in nodes table (routes through SQL)
7. Ready → Node is ready to serve queries
```

## Data Flow

### Query Routing Flow

```
Client SQL Query
       │
       ▼
┌──────────────────┐
│ SQL Query Engine │
│   (Parse SQL)    │
└────────┬─────────┘
         │
         ▼
┌──────────────────┐
│  System Cache    │
│ (Find partitions)│
└────────┬─────────┘
         │
         ▼
┌──────────────────┐
│Partition Resolver│
│(Determine target)│
└────────┬─────────┘
         │
         ▼
┌──────────────────┐
│  System Cache    │
│(Find leader addr)│
└────────┬─────────┘
         │
         ▼
┌──────────────────┐
│ Message Router   │
│(Deliver to leader)│
└────────┬─────────┘
         │
         ▼
┌──────────────────┐
│Partition Service │
│ (Execute query)  │
└────────┬─────────┘
         │
         ▼
    Return Results
```

### CDC Event Flow

```
Write Operation (INSERT/UPDATE/DELETE)
              │
              ▼
┌─────────────────────────┐
│   Partition Leader      │
│   (Write to SQLite)     │
└───────────┬─────────────┘
            │
            ▼
┌─────────────────────────┐
│   CDC Event Generated   │
│   (table, op, data)     │
└───────────┬─────────────┘
            │
            ▼
┌─────────────────────────┐
│   Message Group         │
│   (Broadcast to nodes)  │
└───────────┬─────────────┘
            │
            ▼
┌─────────────────────────┐
│   All Nodes             │
│   (Update local cache)  │
└─────────────────────────┘
```

## Address Format

All services use a unified address format:
```
{nodeId}/{entityType}/{entityId}
```

Examples:
- `node-1/partition/partition-nodes-p1-r1`
- `node-2/message-group/mg-1-r2`
- `node-3/wasm-service/my-service-r1`
- `seed-node/lifecycle`

Entity types:
- `partition` - Partition service replicas
- `message-group` - Message group replicas
- `wasm-service` - WASM service group replicas
- `lifecycle` - Node lifecycle handler

## Raft Consensus

### Configuration
- Heartbeat interval: 150ms (configurable)
- Election timeout: 1000-3000ms (configurable)
- Replica-index-based jitter (2500ms per index) prevents election storms
- Jitter >= election range width guarantees lower-indexed replicas always win first

### Leadership
- Single-replica groups become leader immediately
- Multi-replica groups use standard Raft election
- Deferred election start during bootstrap prevents storms
- Learner phase for new replicas joining existing groups

### Log Storage
- Message groups: In-memory log adapter
- Partitions: SQLite log adapter (persistent)
- WASM service groups: SQLite log adapter (persistent)

## Rebalancing

### UnifiedRebalancer

The `UnifiedRebalancer` is the single rebalancer implementation for partitions, message groups, and WASM service groups. Each partition/message group/WASM service group leader runs its own rebalancer instance, making independent decisions that converge to optimal state.

Key characteristics:
- **Per-entity rebalancer**: Each partition/message group/WASM service group has its own rebalancer instance
- **Leader-driven**: Only the Raft leader runs the rebalancer for that entity
- **Event-driven**: Emits `nodeStateChange` and `rebalanceNeeded` events for observability
- **Policy-based**: Uses `TablePolicyService` for placement decisions
- **Coordinator delegation**: Delegates operation execution to `RebalanceCoordinator`

### Triggers
- Node join/leave (via CDC events)
- Replica failure
- Policy changes
- Periodic checks

### Budget Coordination
- Cluster-wide budget stored in `config` table (`rebalance_budget` key, default 10)
- Before planning moves, queries `replica_operations` via SQL engine for in-flight count
- Proposed moves capped at `max(0, budget - in_flight_count)`
- When budget exceeded, backs off with jitter and retries next cycle
- Critical moves (under-replicated) get `budget * CRITICAL_BUDGET_MULTIPLIER`

### Stabilization
- Minimum 1000ms, maximum 10000ms
- Prevents thrashing during cluster changes
- Timer resets on state changes

### Policies
- Target replica count (odd numbers: 3, 5, 7)
- Placement constraints (spread across nodes)
- Resource thresholds (CPU, memory, disk)

### Move Strategy
- ADD moves execute first to ensure data availability
- Critical REMOVE moves (failed replicas, wrong nodes) execute alongside ADDs
- Non-critical REMOVE moves (spread optimization) deferred until ADDs complete

## Safety Interval (Read Consistency)

WASM service groups use a CockroachDB-style closed-timestamp mechanism for strong reads without routing all reads to the leader.

- The leader periodically broadcasts its committed log index and timestamp to followers
- Followers track their local applied index and the last leader broadcast
- A follower can serve a strong read locally when its applied index >= the leader's last broadcast index AND the broadcast is within the configured safety interval
- When a follower's apply lag exceeds the safety interval, it forwards the read to the leader
- Three read consistency modes:
  - **leader_only** — all reads route to the Raft leader
  - **strong** — reads served locally when within safety interval, forwarded to leader otherwise
  - **eventual** — any replica serves reads from local state without staleness checks

## Timer Persistence and Exactly-Once Semantics

WASM service groups support persistent timers with exactly-once firing guarantees.

- Timer entries are stored in the Raft-replicated KV store under the reserved `_timers/` prefix
- Only the Raft leader runs active timers; followers store timer state but do not schedule execution
- On leader election, the new leader reconstructs all active timers from the KV store, skipping entries with `fired` or `cancelled` status
- **Fire-before-invoke**: when a timer fires, the leader marks it as `fired` via a Raft-committed write BEFORE invoking the handler function
- If the leader fails after committing the fired marker but before completing handler invocation, the new leader sees the `fired` status and does not re-fire, ensuring exactly-once semantics

## Epoch Management

Partition assignments are coordinated using versioned epochs with compare-and-swap (CAS) semantics.

### AssignmentEpoch (Value Object)

An immutable, versioned snapshot of all partition-to-node assignments:

```javascript
{
  epoch: number,           // Monotonically increasing version
  assignments: {           // Partition to node list mapping
    [partitionId]: [nodeId, nodeId, nodeId],
  },
  timestamp: string,       // HLC timestamp
  proposedBy: string       // nodeId that proposed this epoch
}
```

Key properties:
- **Immutable**: Once created, cannot be modified (Object.freeze)
- **Validated**: All fields validated on construction
- **Serializable**: Can be converted to/from JSON for CDC transmission

### AssignmentEpochManager (Stateful Coordinator)

Manages epoch transitions with CAS coordination:

- **proposeEpoch(expectedEpoch, newAssignments)**: CAS operation - only succeeds if current epoch matches expected
- **applyEpoch(epoch)**: Apply epoch received via CDC - rejects stale epochs
- **proposeEpochWithRetry()**: Handles CAS failures with exponential backoff

Events emitted:
- `epochChange`: When a new epoch is successfully proposed
- `epochApplied`: When an epoch is applied via CDC
- `proposalRetry`: When a CAS failure triggers retry

### Why Two Classes?

The separation follows single responsibility principle:
- `AssignmentEpoch`: Pure data structure (immutable value object)
- `AssignmentEpochManager`: Stateful coordination (mutable manager)

This allows epochs to be safely passed around and serialized without risk of modification.

## Message Group Assignment

When a new node joins the cluster, it needs at least one message group replica for communication. Two strategies determine how this is assigned:

### CREATE_SELF_HOSTED Strategy

Used when no existing replicas can be moved:

```
New Node joins
     │
     ▼
┌─────────────────────────┐
│ Create new message group│
│ with 3 local replicas   │
└───────────┬─────────────┘
            │
            ▼
┌─────────────────────────┐
│ All 3 replicas on new   │
│ node (temporary)        │
└───────────┬─────────────┘
            │
            ▼
┌─────────────────────────┐
│ Rebalancer spreads      │
│ replicas to other nodes │
└─────────────────────────┘
```

When used:
- First node joining after seed node
- No existing message groups have movable replicas
- Cluster is scaling up rapidly

### MOVE_REPLICA Strategy

Used when an existing replica can be transferred:

```
New Node joins
     │
     ▼
┌─────────────────────────┐
│ Find node with excess   │
│ message group replicas  │
└───────────┬─────────────┘
            │
            ▼
┌─────────────────────────┐
│ Transfer replica ID to  │
│ new node (not copy)     │
└───────────┬─────────────┘
            │
            ▼
┌─────────────────────────┐
│ Update services table   │
│ to point to new node    │
└─────────────────────────┘
```

When used:
- Existing nodes have more than one message group replica
- Rebalancing message groups across cluster
- Preferred strategy for even distribution

### Strategy Selection

The bootstrap API automatically selects the strategy:

1. Query services table for message group replicas
2. Find nodes with multiple replicas (candidates for MOVE_REPLICA)
3. If found: Use MOVE_REPLICA with the excess replica
4. If not found: Use CREATE_SELF_HOSTED with new group ID

## Configuration

Configuration is centralized in ConfigurationManager with sections:
- `node` - Node identity and addresses
- `raft` - Raft consensus parameters
- `messageGroup` - Message group settings
- `partition` - Partition management
- `logging` - Logging configuration
- `transport` - WebSocket transport settings
- `query` - Query execution settings
- `bootstrap` - Bootstrap process settings

## Error Handling

- Try/catch errors MUST NOT be swallowed
- Errors must be re-thrown or clearly logged
- No try/catch for conditionals or communication flow
- Transient errors (no leader, cache unavailable) trigger retries

## Testing

- Node.js built-in test runner with tap
- Property-based testing with fast-check (max 10 iterations)
- Tests must complete in under 2 seconds
- No skipped tests allowed
