# Distributed Database System

A scalable distributed database system with self-contained metadata storage, built on Raft consensus.

## Overview

This system implements a distributed database where ALL persistent information is stored in tables, ALL tables are implemented as partitions, and ALL partitions are Raft consensus groups with odd-numbered replicas (minimum 3) using SQLite for storage. WASM service groups provide a third Raft group type for hosting replicated WASI/WASM services.

It aims to have similar(ish) functionality to that of Spanner and CockroachDB, a scalalble and distributed DB where the system itself partitions and replicates according to user policy - no manual placement.

It also aims, as a future feature to allow code to be executed near the data it should operate on or with. Like rpc calls with SELECT routing, or accomodating stored procedures, perhaps.

All SQL execution flows through a single engine (SqlCore) regardless of
entrypoint: internal API, external PostgreSQL-wire protocol, or programmatic
`DB.call(select, fn)` from WASM services. Three adapters normalize each
entrypoint into a canonical `SqlRequest` before delegation to SqlCore, so there
is exactly one planner, one optimizer, and one execution path.

There are other raft abstractions - one is the message group, where every node in the system must be a part of one. So nodes organizes in one way themselves in three-ring raft group replicas which uses in-memory sqlite to ensure message deliveries to other nodes. Another is the WASM service group, a persistent Raft consensus group that hosts WASI/WASM handler functions with a replicated key-value store for session context, configurable read consistency (leader-only, strong via safety interval, or eventual), persistent timers with exactly-once firing semantics, and communication port allocation for external connectivity.

It will be several orders of magnitude slower than any comparable system running on just one node, but it will never get slower - regardless of how much the system grows horizontally.

## Requirements

- Node.js >= 22.0.0
- npm

## Installation

```bash
npm install
```

## Configuration

Configuration can be provided via environment variables or the central configuration system.

### Environment Variables

Create a `.env` file based on `.env.example`:

```bash
# Node Configuration
NODE_ID=node-1
SEED_NODE_ADDRESS=http://seed-node:8080
REST_API_PORT=8080

# Logging Configuration
LOG_LEVEL=info
LOG_PRETTY_PRINT=false
```

### Configuration Sections

The system uses a centralized configuration system with the following sections:

- **node**: Node-specific settings (ID, seed address, REST API port)
- **raft**: Raft consensus parameters (election timeouts, heartbeat interval)
- **messageGroup**: Message group configuration (replica count, retry settings)
- **partition**: Partition management (split/merge thresholds, replication)
- **logging**: Logging configuration (level, pretty print)
- **workerThreads**: Thread pool settings (min/max threads, idle timeout)
- **bootstrap**: Bootstrap process settings (leadership timeouts)
- **query**: Query execution settings (timeouts, buffer limits)

## Running

```bash
# Start the system
npm start

# Run tests
npm test

# Run linter
npm run lint
```

## On-Save System-Guideline Checks

You can enforce `.kiro/steering/system guidelines.md` on every file save with
an LLM-backed checker.

1. Install the VS Code extension `emeraldwalk.runonsave`
  (recommended in `.vscode/extensions.json`).
2. Set env vars (for example in `.env.local`):

```bash
GUIDELINE_LLM_API_KEY=your_key
GUIDELINE_LLM_BASE_URL=https://api.openai.com/v1
GUIDELINE_LLM_MODEL=gpt-4.1-mini
```

When you save a `.js`, `.mjs`, `.cjs`, or `.md` file, VS Code runs:

```bash
npm run guard:guidelines:file -- <saved-file>
```

If a violation is found, the command exits non-zero and prints structured
errors that include title, rule reference, and suggested fix.

## Deployment Probes

Seed nodes expose dedicated probe endpoints:

- `GET /livez` for process liveness
- `GET /startupz` for bootstrap completion
- `GET /readyz` for join/admin readiness
- `GET /bootstrap/ready` for lightweight bootstrap-operation readiness

Readiness probe endpoint usage is documented in
`docs/bootstrap-readiness-probes.md`.

## Architecture

### Core Principles

1. **All Information in Tables**: System metadata and user data are stored in tables
2. **Tables as Partitions**: Each table is implemented as one or more partitions
3. **Partitions as Raft Groups**: Each partition is a Raft consensus group using liferaft
4. **WASM Service Groups**: A third Raft group type for hosting replicated WASI/WASM services
5. **System Cache**: In-memory cache of system tables, updated by CDC events
6. **Message Router**: All communication (even local) goes through message groups

### System Cache Seeding Architecture

System tables are the source of truth for cluster metadata. `SystemTableCache` is the read-optimized local view of CDC-propagated system tables on each node.

#### System Tables

The following system tables store cluster metadata:

- **nodes**: All registered nodes with addresses and status
- **partitions**: All partitions with key ranges and replica counts
- **services**: All partition, message group, and WASM service replicas with addresses and Raft roles
- **tables**: All user tables with schemas and policies
- **message_groups**: All message groups with replica counts
- **replica_operations**: Pending replica operations (splits, merges, rebalancing)
- **service_definitions**: WASM service definitions with handler functions and configuration
- **service_endpoints**: WASM service endpoint addresses for gateway integration
- **service_timers**: Persistent timers for WASM service groups

#### Bootstrap Process

**Seed Node Bootstrap:**

1. **Infrastructure Phase**: Create node service and message router
2. **Message Groups Phase**: Create message group replicas
3. **Partitions Phase**: Create partition services for system tables
4. **Registration Phase** (Bootstrap Mode):
   - Enable bootstrap mode with direct write capability
   - Write initial data DIRECTLY to local partition services
   - Register message groups, services, tables, and partitions
   - Disable bootstrap mode
5. **Cache Hydration Phase**:
   - Read all system table data from local partitions
   - Populate system cache with complete cluster state
6. **Post-Bootstrap**: All writes route through SQL engine and system cache

**Joining Node Bootstrap:**

1. **HTTP Bootstrap Request**: Contact seed node via `/bootstrap` endpoint
2. **Receive Complete Snapshots**: Bootstrap response includes complete snapshots of all system tables
3. **Cache Hydration**: Populate local system cache from snapshots
4. **CDC Subscription**: Subscribe to CDC events for all system tables
5. **Node Registration**: Register self in nodes table (routes through system cache)
6. **Ready**: Node is ready to serve queries

#### Query Routing

All SQL queries route through the system cache:

1. **Parse SQL**: Determine target table and operation
2. **Find Partitions**: Query system cache for table partitions
3. **Resolve Partition**: Determine which partition(s) to query based on key
4. **Find Leader**: Query services table in cache for partition leader address
5. **Route Query**: Send query through message router to leader address
6. **Return Results**: Aggregate results from all queried partitions

**Example Query Flow:**

```
SELECT * FROM users WHERE user_id = 123
  ↓
System Cache: Find partitions for 'users' table
  ↓
Partition Resolver: Determine partition for key 123
  ↓
System Cache: Find leader address for partition
  ↓
Message Router: Deliver query to leader
  ↓
Return results
```

#### CDC Subscription

Change Data Capture keeps the system cache synchronized across all nodes:

1. **Subscription**: Each node subscribes to CDC events for all system tables
2. **Event Generation**: When system tables change, CDC events are generated
3. **Event Propagation**: CDC events are streamed to all nodes via message groups
4. **Cache Update**: Each node updates its local system cache from CDC events
5. **Eventual Consistency**: All nodes eventually have the same view of system tables

**CDC Event Flow:**

```
Node A: INSERT INTO nodes (...)
  ↓
Partition Leader: Write to SQLite
  ↓
CDC Service: Generate change event
  ↓
Message Group: Broadcast to all nodes
  ↓
All Nodes: Update system cache
  ↓
All Nodes: Can now route queries to new node
```

#### Bootstrap Mode (Seed Node Only)

The seed node faces a chicken-and-egg problem during bootstrap:
- System cache is empty (no data exists yet)
- Need to write to system tables (to register partitions, services, etc.)
- SQL routing requires cache to find partition leaders
- **Solution**: Temporary bootstrap mode with direct write path

**Bootstrap Mode Characteristics:**

- **Temporary**: Only active during seed node registration phase
- **Direct Writes**: Bypass SQL routing, write directly to local partitions
- **Single Use**: Disabled immediately after registration completes
- **Seed Node Only**: Joining nodes never use bootstrap mode

After bootstrap mode is disabled, the seed node populates its system cache by reading from local partitions, then all subsequent writes route through the SQL engine like any other node.

### Core Components

1. **Configuration Manager**: Centralized configuration with validation
2. **Logger Factory**: Structured logging with pino
3. **Worker Thread Pool Manager**: Service execution in worker threads
4. **System Table Cache**: In-memory cache of cluster metadata
5. **CDC Integration Service**: Change data capture for cache synchronization
6. **Message Router**: Reliable message delivery through message groups
7. **SQL Query Engine (SqlCore)**: Single SQL planner/executor for all entrypoints
8. **SQL Adapter Layer**: InternalSqlAdapter, PostgresWireAdapter, WasmCallAdapter
9. **Bootstrap Service**: Seed node initialization
10. **Node Joining Service**: Joining node bootstrap

### SQL Entrypoints

All SQL traffic converges through three adapters into SqlCore:

- **Internal SQL** — in-process calls from system components via `InternalSqlAdapter`
- **External SQL Protocol** — PostgreSQL-wire compatible sessions via `PostgresWireAdapter`, with authentication and tenant/service policy mapping
- **DB.call(select, fn)** — programmatic distributed execution via `WasmCallAdapter`, running `fn` on every partition selected by `select` in batch/stage mode

`SqlCore.executeRequest` dispatches by execution mode with dedicated branches:
`sql_statement` for standard SQL, `partition_callback` for `DB.call` style
per-partition callback execution, `stage` for callback-stage plans, and `plan`
for plan-object modes such as `reduceByKey` / `useBroadcast`. Each mode has its
own dispatch path and typed validation failures. `partition_callback` is never
aliased to plain statement execution.

Admin ingress remains fixed at `:8081` as a compatibility endpoint, but command
and mutation ownership routes through adapter -> meta-service contracts rather
than node-local direct mutation handlers.

### Distributed Movement Primitives

Cross-partition data movement from WASM callbacks is restricted to three
explicit primitives to prevent accidental cluster chatter:

- **ctx.lookup(table, keys[])** — batched, deduplicated key fetch (pk/unique/bounded index only)
- **ctx.emit(key, value)** — engine-managed shuffle/group with backpressure and spill-to-disk
- **ctx.broadcast(ref, dataset)** / **ctx.useBroadcast(ref)** — versioned small dataset replication with hard size cap

Strategy selection (broadcast → lookup → emit/shuffle) is automatic based on
dataset size and access path, with optional user hints validated against
guardrails. Decisions are visible in EXPLAIN output.

### Programmatic Runtime v0

Distributed execution is available through a runtime API that injects session,
snapshot, and budget defaults:

```javascript
runtime.run(async (ctx) => {
  // Iterator mode — async iteration over query results
  for await (const row of ctx.call('SELECT * FROM users')) {
    ctx.out(row);
  }

  // Stage mode — batch handler invoked per partition
  await ctx.call('SELECT * FROM orders', null, async (batch) => {
    for (const row of batch) ctx.out(row);
  }, {exchangeBy: 'key'});

  // Plan mode — grouped reduce across partitions
  await ctx.call({kind: 'reduceByKey', source: 'events', key: 'user_id'});
});
```

`ctx.call` supports three modes: iterator (no handler), stage (with handler),
and plan (plan object). `ctx.out(value, meta?)` emits final output into the
result stream with budget enforcement.

Stage options accept `exchangeBy: 'local'` (default, no shuffle) or
`exchangeBy: 'key'` (keyed shuffle with at-least-once delivery). Exchange
delivery does not guarantee global ordering across records.

Nested `ctx.call` inside stage handlers is classified as bounded or unbounded.
In v0, unbounded nested calls are rejected with a teachable error directing
users to `ctx.emit(...)` + `ctx.call({kind: 'reduceByKey', ...})`. Bounded
patterns (constant key lookups, single-row fetches) pass through.

### Resource Guardrails

Per-query budgets are enforced for CPU time, memory, wall time, lookup
keys/bytes, emitted intermediate bytes, and broadcast payload bytes. Budget
violations terminate the operation with a descriptive error. Lineage IDs
attached to stage artifacts enable retry deduplication and cancellation
propagation across distributed stages.

### WASM Module Manifests

Every deployable WASM module requires a manifest declaring `run_export` (entry
function), pinned dependency digests, and capability requirements. Activation
validates the export signature, resolves dependencies from approved sources, and
enforces tenant/service capability allowlists. All resolution decisions are
audit-logged.

#### Manifest Fields

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `module_id` | string | yes | Unique module identifier |
| `version` | string | yes | Semantic version |
| `digest` | string | yes | `sha256:` followed by 64 hex chars; immutable identity |
| `run_export` | string | yes | Named export serving as the callable entry function |
| `exports` | string[] | yes | All declared module exports; `run_export` must be listed |
| `dependencies` | object[] | no | Pinned digest references to capability modules |
| `capabilities` | string[] | no | Required capabilities (e.g., `sql.read`, `kv.session`) |

#### run_export Contract

The `run_export` function must:
- Exist in the module's declared `exports` list
- Resolve to a function in the WASM module instance
- Accept 2-3 parameters: `(context, batch)` or `(context, batch, options)`

#### Dependency Resolution

Each dependency entry requires `module_id` and `digest`. At activation:
- Dependencies are resolved from approved module sources by pinned digest
- Digest mismatches are rejected (no implicit mutation)
- Version upgrades require explicit rollout with new digest

#### Capability Policy

Capabilities declared in the manifest are checked against tenant/service
allowlists. Only declared and allowed capabilities are injected into runtime
imports. Undeclared capability usage is rejected at deployment time.

### Key Features

- **Configuration Centralization**: All constants accessible via symbolic names
- **Structured Logging**: Consistent metadata (node_id, service_id, timestamp)
- **Worker Thread Pool**: Efficient service execution with piscina
- **Validation**: JSON schema validation for all configuration
- **System Cache**: Single source of truth for cluster metadata
- **CDC Synchronization**: Automatic cache updates across all nodes
- **Cache-Based Routing**: All queries route through system cache
- **Bootstrap Mode**: Seed node can bootstrap without existing cache

## Testing

The system uses Node.js built-in test runner with property-based testing via fast-check.

```bash
# Run all tests
npm test

# Run specific test file
node --test test/config/configuration.test.js
```

### Test Coverage

- **Property Tests**: Configuration validation and centralization
- **Unit Tests**: Logging metadata consistency

## Development

### Code Style

The project follows Google JavaScript style guide with ESLint:

- 2-space indentation
- Single quotes for strings
- Semicolons required
- Max line length: 100 characters

```bash
# Check linting
npm run lint

# Fix linting issues
npm run lint:fix
```

## Project Structure

```
.
├── src/
│   ├── config/          # Configuration management
│   ├── logging/         # Logging infrastructure
│   ├── query/           # SQL adapters, strategy selector, primitives, guardrails
│   ├── threading/       # Worker thread pool
│   ├── wasm-service/    # WASM service group components, module manifests
│   └── index.js         # Main entry point
├── test/
│   ├── config/          # Configuration tests
│   ├── logging/         # Logging tests
│   └── query/           # SQL adapter, strategy, primitive, guardrail tests
├── package.json
├── .eslintrc.json
└── README.md
```

## License

MIT
