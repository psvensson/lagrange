# Raft, Rebalancing, And Placement

Where data and services live, and how that changes safely: the unified address
format, Raft consensus configuration, the UnifiedRebalancer,
storage-capacity-aware placement, and message-group assignment.

Partitions, message groups, and runtime-service Cells are all placed by the
same rebalancer — a partition is one kind of rebalanced entity, not a special
case. The membership and ownership rows these decisions read are
defined in [control-plane.md](control-plane.md); the readiness states that
gate moves are in [runtime-lifecycle.md](runtime-lifecycle.md);
operator-facing capacity controls are in
[../docs/storage-capacity-operations.md](../docs/storage-capacity-operations.md).

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
- `wasm-service` - Legacy WASM replica address vocabulary; no production
  rebalancer currently constructs this entity kind
- `runtime-service` - Placed runtime-service Cells (e.g., PG wire)
- `lifecycle` - Node lifecycle handler

## Raft Consensus

### Configuration
- Heartbeat interval: `CONFIG_KEY.RAFT_HEARTBEAT_INTERVAL_MS`
  (`src/config/config-constants.js`), defaulting to
  `RAFT_ELECTION_TIMING.HEARTBEAT_DEFAULT_MS` (`src/raft/constants.js`)
- Election timeout range:
  `CONFIG_KEY.RAFT_ELECTION_TIMEOUT_MIN_MS` /
  `CONFIG_KEY.RAFT_ELECTION_TIMEOUT_MAX_MS`
  (`src/config/config-constants.js`), defaulting to
  `RAFT_ELECTION_TIMING.ELECTION_MIN_DEFAULT_MS` /
  `RAFT_ELECTION_TIMING.ELECTION_MAX_DEFAULT_MS`
  (`src/raft/constants.js`)
- Replica-index-based jitter uses
  `RAFT_ELECTION_TIMING.JITTER_PER_REPLICA_MS`
  (`src/raft/constants.js`) to prevent election storms
- Jitter >= election range width guarantees lower-indexed replicas always win first

### Leadership
- Single-replica groups become leader immediately
- Multi-replica groups use standard Raft election
- Deferred election start during bootstrap prevents storms
- Learner phase for new replicas joining existing groups

### Log Storage
- Message groups: In-memory log adapter
- Partitions: SQLite log adapter (persistent)
- Runtime-service Cells have no service-state Raft log; durable state remains in
  partitioned tables.

The in-memory adapter is ephemeral across process restart; that weaker
durability contract does not permit deleting committed entries while the
adapter is live. The snapshot protocol now exists END TO END and is WIRED INTO PRODUCTION for
file-backed SQLite partition replicas (quests S1-S6 of
`solve/specs/raft-snapshot-transfer-install/`, ladder complete): checkpoint
CREATION (`src/raft/snapshot-checkpoint-{constants,format,store}.js`), atomic
INSTALL at the closed-handle boot boundary (`snapshot-install{,-constants}.js`,
`snapshot-boundary.js`), bulk TRANSFER over a dedicated byte-bounded per-peer
channel (`snapshot-transfer{,-constants,-receiver}.js`,
`src/transport/bulk-transfer-channel.js`), compacted-follower CATCH-UP
(typed install_snapshot dispatch + orchestrator, `snapshot-catchup.js`), and
bounded RETENTION with proof-gated physical compaction
(`snapshot-retention.js`, `snapshot-compaction.js`). A proofless
`compactCommittedEntries` call still returns the typed
`snapshot_protocol_unavailable` refusal; physical prefix removal requires a
durable, term-anchored local snapshot proof and advances the compacted-log
boundary in the same transaction. S6 (`raft-snapshot-live-rebuild`) added the
production trigger: a leader-only checkpoint cadence
(`src/partition/partition-snapshot-cadence.js`) rides the 1s
prepared-state-hold sweep, and on fire seals a generation, sweeps retention,
and proof-gate-compacts the committed prefix past that generation — so a
lagging or from-scratch SQLite follower is caught up by snapshot install
rather than replaying an unbounded prefix. This was certified live on a
five-node docker cluster (a wiped follower rebuilds ACTIVE under continuous
foreground writes with zero lost acknowledged writes; N=15 window ABOVE_BAR).
The in-memory adapter still retains its full committed prefix (its weaker
durability contract forbids live prefix deletion); clearing it during
lifecycle teardown is whole-instance destruction, not live log compaction.

## Rebalancing

### UnifiedRebalancer

The `UnifiedRebalancer` is the single rebalancer implementation for
partitions, message groups, and `runtime_service` Cells. Partition and
message-group instances run on their entity's Raft leader; runtime-service
instances are owned by the `service_definitions` planning leader. The
`wasm_service` enum retains a default policy, but production startup constructs
no rebalancer for it.

Key characteristics:
- **Per-entity rebalancer**: Each partition, message group, or active runtime
  service has its own rebalancer instance
- **Leader-driven**: Entity Raft leaders own partition/message-group decisions;
  the `service_definitions` planning leader owns runtime-service decisions
- **Event-driven**: Emits `nodeStateChange` and `rebalanceNeeded` events for observability
- **Policy-based**: Uses `TablePolicyService` for placement decisions
- **Coordinator delegation**: Delegates operation execution to `RebalanceCoordinator`

### Triggers
- Node join/leave (via CDC events)
- Replica failure
- Policy changes
- Periodic checks

### Budget Coordination
- Cluster-wide budget stored in `config` via
  `REBALANCER_CONFIG_KEY.REBALANCE_BUDGET`
  (`src/rebalancer/rebalancer-constants.js`), defaulting to
  `REBALANCER_DEFAULT.UNIFIED.REBALANCE_BUDGET`
  (`src/rebalancer/rebalancer-constants.js`)
- Before planning moves, queries `replica_operations` via SQL engine for in-flight count
- Proposed moves capped at `max(0, budget - in_flight_count)`
- When budget exceeded, backs off with jitter and retries next cycle
- Critical moves (under-replicated) get `budget * CRITICAL_BUDGET_MULTIPLIER`

### Stabilization
- Range clamps to `REBALANCER_DEFAULT.UNIFIED.MIN_STABILIZATION_MS` and
  `REBALANCER_DEFAULT.UNIFIED.MAX_STABILIZATION_MS`
  (`src/rebalancer/rebalancer-constants.js`)
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

## Read-Locality Routing (Service↔Data Affinity)

Placement (above) decides *where replicas live*; read-locality routing decides
*which replica a read is sent to*. They are distinct layers — read-locality
needs no placement move.

Read-locality is a **per-service** policy carried by the durable
`service_definitions.read_locality` column (`SERVICE_READ_LOCALITY` in
`src/constants/service.js`):

- `any` — uniform routing over routable replicas (implicit load spreading). The
  default when no policy is set.
- `same_group` — prefer replicas in the reader's own latency group, local node
  first.

At read time, `SqlCore` calls `resolveIssuingServiceReadLocality(queryOptions)`
(`src/query/sql-query-engine-table-routing-methods.js`), which reads the issuing
service's definition from the node-local CDC-fed `SystemTableCache`. No issuing
service, no definition, or `any` yields uniform routing; `same_group` steers
partition-routing candidate selection toward the local latency group
(`src/query/sql-query-engine-select-execution.js`). This is the current
service↔data affinity mechanism.

**Not to be confused with** the *placement*-side data-access affinity scoring
dimension (`calculateDataAffinityScoreDimensions` in
`src/rebalancer/placement-owner-decision.js`). Placement and read routing remain
separate decisions, but both are active: fresh, decaying
`service_partition_access` evidence is aggregated by runtime-service policy into
`dataAffinity.groupWeights`, and production policy sets `preferDataAffinity`
when usable evidence exists. The placement scorer then trades that affinity
gradient against spread, capacity, and incumbent movement cost. Read-locality
routing above still independently selects which data replica serves a read.

## Storage Capacity-Aware Placement

Placement decisions are gated by per-node storage budgets, admission
checks, and reservation accounting. This prevents over-commitment of
node storage during replication, recovery, and split workflows.

### Ownership Map

| Concern | Owner | Notes |
|---------|-------|-------|
| Control-plane readiness classification | `ControlPlaneReadinessService` | Canonical per-node readiness snapshot with `repairEligible` and `serveEligible` stratification; internal topology consumers gate on `repairEligible`, routing/benchmark on `serveEligible` |
| Metadata publication mode | `CDCGroupPropagationService` | Canonical grouped/conservative-fanout/repair-only publication owner |
| Budget resolution/registration | `NodeStorageBudgetService` | Seed/join startup-owned integration |
| Replica size estimation + capacity snapshot | `StorageCapacityAccountingService` | Derives used/reserved/available from metadata |
| Admission decision + reservation API | `StorageAdmissionService` | Single gate for ADD/REPLACE/SPLIT increases; consumes readiness + publication owners |
| Operation lifecycle transitions | `RebalanceCoordinator` | Delegates reservation state changes and routes ADD/REPLACE creation through admission owner |
| Placement planning | `MovePlanner` | Consumes admission/accounting APIs; no duplicate planner |
| Pressure-state behavior | `StoragePressureBehavior` | Gates moves by per-node pressure state |
| Split gating integration | `PartitionSplitMergeManager` | Calls admission owner for feasibility |
| Managed split workflow admission | `ManagedSplitWorkflow` | Persists admission_pending/blocked/deferred outcomes from the admission owner |
| Capacity metrics | `StorageCapacityMetrics` | Collects per-node metrics and admission counters |
| Migration/backfill | `StorageCapacityMigration` | Deterministic backfill for existing nodes |

### Metadata Model

Node budget metadata is stored as extensions to the `nodes` table:
- `storage_budget_bytes` — resolved budget in bytes
- `storage_budget_source` — origin of budget (`absolute`, `ratio`)
- `storage_budget_updated_at` — last budget update timestamp

The `storage_reservations` system table tracks in-flight reservations:
- `reservation_id` — unique identifier
- `operation_id` — associated replica operation
- `node_id` — target node
- `estimated_bytes` — reserved byte count
- `status` — reservation lifecycle state
- `created_at`, `expires_at` — TTL tracking

Capacity snapshots are derived projections (not persisted) computed by
`StorageCapacityAccountingService` from `nodes`, `services`,
`partitions`, and `storage_reservations` cache data.

### Admission Flow

```
Storage-Increasing Operation (ADD/REPLACE/SPLIT)
       │
       ├── ControlPlaneReadinessService projects canonical node readiness
       │
       ├── CDCGroupPropagationService exposes current publication mode
       │
       ▼
StorageAdmissionService.checkAdd/checkReplace/checkSplit
       │
       ├── Consume readiness + publication diagnostics
       │
       ├── Get capacity snapshot from StorageCapacityAccountingService
       │   (reads nodes, services, partitions, storage_reservations)
       │
       ├── Evaluate projected utilization against thresholds
       │   - Normal: allow
       │   - Soft: allow (non-critical with reduced priority)
       │   - Hard: deny non-critical, allow critical with headroom
       │   - Exhausted: deny non-critical, allow critical with headroom
       │
       ├── Apply configured admission policy override
       │
       └── Return structured decision (allow/deny, reason, projected %)

Callers:
- `ManagedSplitWorkflow` persists admission outcomes for split workflows.
- `RebalanceCoordinator.createOperation()` invokes the same owner for ADD and
  REPLACE workflows before operation rows are created.
```

### Pressure States

| State | Threshold | Behavior |
|-------|-----------|----------|
| normal | utilization < soft threshold | All operations allowed |
| soft | soft threshold <= utilization < hard threshold | Critical allowed, non-critical reduced priority |
| hard | hard threshold <= utilization < 100% | Critical with emergency headroom only |
| exhausted | utilization >= 100% | Critical with emergency headroom only |

Thresholds are configurable via `rebalancer.storageSoftPressurePercent`
and `rebalancer.storageHardPressurePercent`.

### Configuration

Node startup keys:
- `node.storageBudgetBytes` — absolute budget in bytes
- `node.storageBudgetRatio` — fraction of physical disk

Rebalancer/storage keys:
- `CONFIG_KEY.REBALANCER_STORAGE_SOFT_PRESSURE_PERCENT`
  (`src/config/config-constants.js`) — soft threshold, default
  `DEFAULT_CONFIG.rebalancer.storageSoftPressurePercent`
- `CONFIG_KEY.REBALANCER_STORAGE_HARD_PRESSURE_PERCENT`
  (`src/config/config-constants.js`) — hard threshold, default
  `DEFAULT_CONFIG.rebalancer.storageHardPressurePercent`
- `CONFIG_KEY.REBALANCER_STORAGE_RESERVATION_TTL_MS`
  (`src/config/config-constants.js`) — reservation expiry TTL, default
  `DEFAULT_CONFIG.rebalancer.storageReservationTtlMs`
- `rebalancer.storageEmergencyHeadroomPercent` — critical-only headroom
- `rebalancer.minimumReplicaBytes` — floor for size estimation
- `rebalancer.splitAmplificationFactor` — split write-amplification multiplier
- `rebalancer.storageAdmissionMode` — `observe` or `enforce`
- `rebalancer.partitionReplicaOverheadBytes` — per-partition replica overhead
- `rebalancer.messageGroupReplicaOverheadBytes` — per-message-group replica overhead
- `rebalancer.serviceReplicaOverheadBytes` — per-service replica overhead

### Storage Capacity Anti-Patterns (Forbidden)

1. No duplicate capacity cache outside `SystemTableCache`.
2. No alternate admission path bypassing `StorageAdmissionService`.
3. No direct reservation management outside `RebalanceCoordinator`.
4. No parallel pressure-state tracking outside `StoragePressureBehavior`.
5. No ad-hoc storage accounting maps or sets in planner or coordinator.
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
