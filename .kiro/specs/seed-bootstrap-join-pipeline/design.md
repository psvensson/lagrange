# Seed Bootstrap + Join Pipeline Design

## Pipeline Phases
1. INFRA
   - Initialize transport, SQL engine, and basic services.
   - Gate: transport and SQL engine are available.

2. RAFT_ELECTION
   - Start raft for all partitions and message groups.
   - Gate: leader metadata complete and stable (optional stability window).

3. SYSTEM_TABLE_SEED
   - Use direct partition writes to seed system tables.
   - Gate: required system rows exist and pass schema checks.

4. CACHE_HYDRATION
   - Snapshot system tables into cache.
   - Gate: cache row counts match system table counts; leaders present in cache.

5. CDC_SUBSCRIBE
   - Start CDC subscriptions.
   - Gate: CDC is applying to cache or buffered and ready to apply.

6. CONTROL_PLANE_REGISTER
   - Register control-plane services through SQL routing.
   - Gate: routing and writes succeed via SQL engine.

7. READY
   - Serve join requests and provide bootstrap snapshots.

## Components

### BootstrapStateMachine
- Owns the phase pipeline.
- Enforces gates, timeouts, and error reporting.
- Emits structured phase logs (phase, duration, missing leaders).

### SystemTableWriter (single API)
- One interface used everywhere for system table writes.
- Implementation is swapped once after cache hydration.

Implementations:
- BootstrapWriter
  - Directly writes to local partition services.
  - Only valid during SYSTEM_TABLE_SEED.
- RoutedSqlWriter
  - Writes through SQL engine and cache-based routing.
  - Only valid from CACHE_HYDRATION onward.

### LeaderReadinessGate
Checks that leader metadata is complete:
- `services` leader rows (raft_role, status, address).
- `partitions.leader_node_id` for all partitions.
- `message_groups.leader_node_id` for all message groups.

Outputs:
- missingPartitionLeaders
- missingMessageGroupLeaders
- missingPartitionLeaderNodes
- missingMessageGroupLeaderNodes

### CdcHydrationCoordinator
- Controls when CDC can mutate the cache.
- Modes:
  - Buffer CDC events until hydration completes.
  - Subscribe after hydration completes.

### JoinGate
- Blocks bootstrap and join requests until READY.
- Returns structured errors on failure.

## Data Flow
Bootstrap writes -> partition leader -> CDC -> cache

Rules:
- Cache is never written directly.
- Cache is authoritative for reads and routing after hydration.

## Join Flow
1. Joiner calls seed bootstrap endpoint.
2. Seed checks READY + leader metadata.
3. If incomplete, return `LEADER_METADATA_INCOMPLETE` with missing lists.
4. If ready, seed provides snapshot with leadership metadata.
5. Joiner hydrates cache and proceeds to register replicas via SQL routing.

## Observability
- Phase logs include name, duration, and missing leader details.
- Bootstrap API returns structured errors with explicit codes and lists.
