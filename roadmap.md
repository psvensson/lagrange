# Lagrange Roadmap

Research system → credible product → strategic platform, without losing the
architectural advantages already built.

Status legend: ✅ Done · 🔧 In Progress · 🔲 Not Started

---

## Phase 0.1 — Internal Coherence

*"The system behaves predictably under stress."*

Finishing the core database invariants. The foundations are strong: Raft
partition groups, CDC propagation, system table cache, strict ownership,
deterministic control-plane workflows. A few foundational capabilities must
exist before anything is productizable.

### 1. Distributed Transactions

Complete the multi-partition 2PC path.

| Item | Status | Notes |
|------|--------|-------|
| `DistributedTransactionCoordinator` skeleton | ✅ Done | Owns 2PC state machine, composes `DurableWorkflowCoordinator` |
| `sql_transactions` / `sql_transaction_participants` / `sql_write_operations` tables | ✅ Done | Persisted transaction state |
| Participant enlistment | ✅ Done | Idempotency enforced by operation ID and step ID |
| Prepare phase | 🔧 In Progress | Single-partition prepare works; multi-partition 2PC prepare incomplete |
| Commit phase | 🔧 In Progress | Single-partition commit works; multi-partition atomic commit incomplete |
| Rollback | 🔧 In Progress | Basic rollback exists; cross-partition rollback incomplete |
| Recovery after coordinator failure | 🔧 In Progress | System-table recovery now replays in-flight transactions through coordinator commit/rollback protocols |
| Snapshot isolation | 🔲 Not Started | Read-write multi-partition transactions with snapshot isolation |

Target: read-write multi-partition transactions with snapshot isolation.
Serializable isolation is not required immediately.

### 2. Schema Migration Workflow

Canonical schema-change pipeline using `DurableWorkflowCoordinator`.

| Item | Status | Notes |
|------|--------|-------|
| System table schema definitions | ✅ Done | `system-table-schemas-constants.js` |
| Schema versioning in join readiness | ✅ Done | `schema_version` field tracked |
| Bootstrap schema migration | ✅ Done | Handles schema migration during node join |
| Internal `ALTER TABLE` for system tables | ✅ Done | Column additions in `partition-service.js` |
| User-facing DDL migration pipeline | 🔲 Not Started | Phase 1: add new schema version |
| Dual-write compatibility phase | 🔲 Not Started | Phase 2 |
| Backfill phase | 🔲 Not Started | Phase 3 |
| Cutover and cleanup | 🔲 Not Started | Phases 4–5 |

### 3. Backup / Restore / PITR

Absolute requirement for production.

| Item | Status | Notes |
|------|--------|-------|
| Bootstrap snapshots (point-in-time state capture) | ✅ Done | Used during node join for cache hydration |
| Partition-local SQLite snapshots | ✅ Done | Raft snapshot mechanism exists |
| Persistent snapshot backup to external storage | 🔲 Not Started | |
| Incremental backup (CDC log replay) | 🔲 Not Started | CDC infrastructure exists; backup consumer does not |
| Restore to existing cluster | 🔲 Not Started | |
| Restore to new cluster | 🔲 Not Started | |
| Point-in-time recovery | 🔲 Not Started | |
| Cross-region replication | 🔲 Not Started | |

Architecture: partition-local snapshots + CDC log replay.

### 4. Operational Visibility

Operators must be able to answer: which node is leader? which partitions are
hot? how many replica operations are active? is rebalancing stuck? is CDC
lagging?

| Item | Status | Notes |
|------|--------|-------|
| Metrics instrumentation | ✅ Done | Transport delivery, CDC pipeline, dispatch latency |
| Admin CLI (`ddb-admin`) with terminal UI | ✅ Done | K9s-inspired interactive cluster view |
| Health probes (`/livez`, `/startupz`, `/readyz`) | ✅ Done | |
| Diagnostics API (`/api/admin/diagnostics/services`) | ✅ Done | Reconciler decision history |
| Live query subscriptions via CDC | ✅ Done | `LiveQueryManager` bridges CDC to WebSocket clients |
| `EXPLAIN DISTRIBUTED` | ✅ Done | Returns canonical planner output for distributed queries |
| `SHOW CLUSTER STATUS` | 🔲 Not Started | SQL-surface cluster diagnostics |
| `SHOW PARTITIONS` | 🔲 Not Started | |
| `SHOW REBALANCER` | 🔲 Not Started | |
| `SHOW CDC` | 🔲 Not Started | |
| `SHOW SERVICES` | 🔲 Not Started | |

### 5. Failure Simulations

Automated chaos tests to verify invariants under stress.

| Item | Status | Notes |
|------|--------|-------|
| Distributed test harness | ✅ Done | Docker-based, fast-local reuse mode |
| Node failure + rebalance scenario | ✅ Done | SIGKILL non-seed, verify rebalance |
| Network partition / split-brain scenario | ✅ Done | Partition into groups, verify Raft leader election |
| Rolling restart scenario | ✅ Done | Restart nodes one at a time under load |
| Node join under load | ✅ Done | Add node during sustained writes |
| Seed restart under load | ✅ Done | |
| Sustained write throughput | ✅ Done | |
| Write-ack visibility | ✅ Done | Verify acknowledged writes are visible |
| WASM service failover | ✅ Done | |
| Partition kill/heal under load | ✅ Done | |
| 7-node scenarios (load, partitioning, distribution) | ✅ Done | |
| Postgres baseline comparison | ✅ Done | |
| Failure class registry + deterministic test IDs | ✅ Done | `FailureClassRegistry` |
| Invariant engine for hard breach detection | ✅ Done | `InvariantEngine` with catalog |
| Disk full simulation | 🔲 Not Started | |
| Slow follower / slow leader simulation | 🔲 Not Started | |
| In-cluster chaos injection (not harness-only) | 🔲 Not Started | |

### Phase 0.1 Exit Criteria

The system must survive node failure, replica movement, rebalancing, schema
change, and transaction retries without manual intervention.

| Criterion | Status |
|-----------|--------|
| Node failure survival | ✅ Verified via harness |
| Replica movement | ✅ Verified via harness |
| Rebalancing | ✅ Verified via harness |
| Schema change (system tables) | ✅ Works for internal schema |
| Schema change (user tables) | 🔲 Not Started |
| Multi-partition transaction retries | 🔲 Not Started |

---

## Phase 0.5 — External Usability

*"Developers can realistically try this."*

Focus shifts from core correctness to developer experience.

### 1. Cluster Deployment Experience

A developer should be able to run a cluster trivially.

| Item | Status | Notes |
|------|--------|-------|
| Dockerfile | ✅ Done | Node.js 22 slim base |
| Bootstrap API for seed node | ✅ Done | |
| Node join protocol via HTTP | ✅ Done | `/bootstrap` endpoint |
| Fixed admin port for operator predictability | ✅ Done | Port 8081 |
| `lagrange cluster init` | 🔲 Not Started | |
| `lagrange node start` | 🔲 Not Started | |
| `lagrange cluster join` | 🔲 Not Started | |
| `docker-compose up` single-command cluster | 🔲 Not Started | |
| Kubernetes Helm chart | 🔧 In Progress | Endpoint sync controller exists with Helm chart skeleton |

### 2. Clear Developer Workflow

The programming model is powerful but must be simple to start.

| Item | Status | Notes |
|------|--------|-------|
| Programmatic runtime v0 (`runtime.run`) | ✅ Done | `ctx.call`, `ctx.lookup`, `ctx.emit`, `ctx.broadcast`, `ctx.out` |
| Iterator mode | ✅ Done | Basic partition-local iteration |
| Stage mode (batch) | ✅ Done | Batch processing with handler |
| Plan mode (reduceByKey) | ✅ Done | Distributed reduce-by-key |
| WASM module deployment via `sys-wasm-meta` | ✅ Done | Manifest-based with capability enforcement |
| `lagrange wasm publish` | 🔲 Not Started | CLI command |
| `lagrange wasm deploy` | 🔲 Not Started | CLI command |
| `lagrange wasm scale` | 🔲 Not Started | CLI command |
| Getting-started tutorial | 🔲 Not Started | |

### 3. Debugging Tools

| Item | Status | Notes |
|------|--------|-------|
| Debug sessions table (`debug_sessions`) | ✅ Done | Distributed trace state |
| Debug breakpoints and snapshots | ✅ Done | `debug_breakpoints`, `debug_snapshots` |
| DAP server for IDE integration | ✅ Done | Debug Adapter Protocol |
| DWARF index builder for source mapping | ✅ Done | |
| Replay runtime for deterministic replay | ✅ Done | |
| Plan diagnostics with strategy decisions | ✅ Done | `PlanDiagnostics.toExplain()` |
| Distributed playback viewer | ✅ Done | HTML-based harness playback |
| SQL query execution tracing | 🔲 Not Started | Trace individual query execution across partitions |
| `EXPLAIN EXECUTION` for runtime plans | 🔲 Not Started | |

### 4. Runtime Semantics Documentation

Developers must know callback retries, emit duplication, lookup guarantees,
snapshot visibility, and ordering guarantees.

| Item | Status | Notes |
|------|--------|-------|
| At-least-once callback delivery (lineage ID dedup) | ✅ Done | Implementation exists |
| At-least-once emit via exchange manager | ✅ Done | Implementation exists |
| No global ordering across exchanged records | ✅ Done | Implementation exists |
| Bounded primitives with guardrails | ✅ Done | Guardrail failure example exists |
| Formal developer-facing semantics documentation | 🔲 Not Started | |
| Latency / throughput SLO documentation | 🔲 Not Started | |

### 5. Example Workloads

| Item | Status | Notes |
|------|--------|-------|
| Basic iterator mode example | ✅ Done | `01-basic-iterator` |
| Stage batching example | ✅ Done | `02-stage-batching` |
| Plan reduce-by-key example | ✅ Done | `03-plan-reduce-by-key` |
| Nested bounded call example | ✅ Done | `04-nested-bounded-call` |
| Guardrail failure example | ✅ Done | `05-guardrail-failure` |
| WASM remote replica example | ✅ Done | `06-wasm-remote-replica` |
| Distributed aggregation (scan → emit → reduceByKey) | 🔲 Not Started | |
| Event processing pipeline | 🔲 Not Started | |
| Distributed analytics (scan → summarize → merge) | 🔲 Not Started | |

### Phase 0.5 Exit Criteria

A developer unfamiliar with the system can: run a cluster, connect with psql,
create tables, deploy a WASM function, run distributed execution, and observe
results — within 30 minutes.

| Criterion | Status |
|-----------|--------|
| Run a cluster | 🔧 Possible but not trivial |
| Connect with psql | ✅ Done (`sys-postgres-wire`) |
| Create tables | ✅ Done |
| Deploy a WASM function | ✅ Done (via API) |
| Run distributed execution | ✅ Done |
| Observe results | ✅ Done |
| All of the above in 30 minutes | 🔲 Not yet achievable |

---

## Phase 1.0 — Real Product

*"Companies can run this in production."*

Operational reliability and clear value.

### 1. Strong PG Compatibility Baseline

Full PG parity is not needed. ORM compatibility, migration tool compatibility,
and psql usability are.

| Item | Status | Notes |
|------|--------|-------|
| PostgreSQL wire protocol (`sys-postgres-wire`) | ✅ Done | Replicated service, hard cutover |
| SQL dialect translation (positional params, booleans, type casts) | ✅ Done | |
| ILIKE, RETURNING, subqueries, CTEs, set operations | ✅ Done | |
| `EXPLAIN DISTRIBUTED` | ✅ Done | |
| `information_schema` | 🔲 Not Started | |
| `pg_catalog` shims | 🔲 Not Started | |
| Window functions | 🔲 Not Started | |
| Sequences | 🔲 Not Started | |
| `NOTIFY` / `LISTEN` | 🔲 Not Started | |
| ORM compatibility testing (Prisma, Drizzle, TypeORM) | 🔲 Not Started | |

### 2. Observability Platform

| Item | Status | Notes |
|------|--------|-------|
| Query correlation IDs | ✅ Done | |
| CDC lag monitoring (confirmation tracker) | ✅ Done | |
| Resource diagnostics sampler | ✅ Done | Point-in-time and trend diagnostics |
| Metrics dimensions (serviceId, serviceType, runtimeKind, etc.) | ✅ Done | |
| Endpoint sync metrics | ✅ Done | |
| Prometheus / OpenMetrics export | 🔲 Not Started | |
| Distributed tracing backend (OpenTelemetry) | 🔲 Not Started | |
| Partition heatmap dashboard | 🔲 Not Started | |
| Runtime execution trace viewer | 🔲 Not Started | |

### 3. Security / Tenancy

| Item | Status | Notes |
|------|--------|-------|
| PG wire authentication (trust, password, SCRAM-SHA-256) | ✅ Done | Config field exists |
| Admin auth middleware | ✅ Done | Policy-based guard |
| Service dispatcher authorization | ✅ Done | |
| Admin audit context | ✅ Done | Structured audit log entries |
| Tenant context propagation (`tenant_id`) | 🔧 In Progress | Field exists; enforcement incomplete |
| Role-based access control | 🔲 Not Started | |
| Tenant isolation enforcement | 🔲 Not Started | |
| Resource quotas | 🔲 Not Started | |
| Encryption at rest | 🔲 Not Started | |
| TLS for inter-node transport | 🔲 Not Started | TLS mode field exists in PG wire config |

### 4. Production Stability Guarantees

| Item | Status | Notes |
|------|--------|-------|
| Replica count guarantees | ✅ Done | Policy-based, min 3 replicas |
| Replica recovery service | ✅ Done | Automatic recovery for under-replicated partitions |
| Failure detection | ✅ Done | Single `FailureDetector` instance |
| Node reintegration | ✅ Done | Automatic reintegration after recovery |
| Defined failover time SLO | 🔲 Not Started | |
| Defined data durability SLO | 🔲 Not Started | |
| Defined transaction guarantee SLO | 🔲 Not Started | |

### 5. First Commercial Workload

Pick a clear niche where Lagrange shines: data locality + programmable
execution + strong distributed semantics.

| Candidate | Status | Notes |
|-----------|--------|-------|
| Distributed log processing (Splunk/Datadog-like) | 🔲 Not Started | |
| Real-time analytics | 🔲 Not Started | |
| Event-driven pipelines | 🔲 Not Started | |
| High-ingest OLTP with local compute | 🔲 Not Started | |

### Phase 1.0 Exit Criteria

A company can: deploy a cluster, ingest real data, run distributed execution,
survive failures, and operate the system with confidence.

---

## Phase 2.0 — Distributed Execution Platform

*"The long-term vision."*

The system evolves into something truly unique.

### 1. Rich Distributed Execution Planning

Multi-stage distributed plans.

| Item | Status | Notes |
|------|--------|-------|
| `DistributedQueryPlanner` (multi-table partition planning) | ✅ Done | |
| `ParallelQueryCoordinator` (fanout scheduling) | ✅ Done | |
| `DistributedMergeEngine` (global merge semantics) | ✅ Done | |
| Strategy selector (broadcast → lookup → emit/shuffle) | ✅ Done | |
| Plan diagnostics with classification reasons | ✅ Done | |
| Multi-stage plans (summarize → aggregate → repartition → reduce) | 🔲 Not Started | |
| Cost-based optimizer | 🔲 Not Started | |
| Query hints | 🔲 Not Started | |

### 2. Tool / Service Integration

Runtime services that run as replicated Raft groups.

| Item | Status | Notes |
|------|--------|-------|
| `native_js` runtime kind | ✅ Done | In-process handlers as replicated workloads |
| `wasm_component` runtime kind | ✅ Done | WASI/WASM with manifest/capability enforcement |
| Replicated KV store for session context | ✅ Done | |
| Persistent timers with exactly-once firing | ✅ Done | |
| Communication port allocation | ✅ Done | |
| Configurable read consistency (leader-only, strong, eventual) | ✅ Done | |
| `oci_container` runtime kind | 🔧 Feature-gated | Policy/rollout/operations gates pending |
| Vector search service | 🔲 Not Started | |
| Embedding model service | 🔲 Not Started | |

### 3. Data-Local AI Reasoning

| Item | Status | Notes |
|------|--------|-------|
| Partition-local WASM execution | ✅ Done | Foundation exists |
| Local summarization | 🔲 Not Started | |
| Local anomaly detection | 🔲 Not Started | |
| Local semantic filtering | 🔲 Not Started | |

### 4. Distributed Cognitive Workflows

Queries like `explain anomalies in the last hour` that internally execute:
scan metrics partitions → summarize anomalies → aggregate explanations.

| Item | Status | Notes |
|------|--------|-------|
| All items | 🔲 Not Started | Requires phases 2.1–2.3 |

---

## Key Principle

Across all phases, the system preserves its core architectural advantage:

**data locality + programmable execution + strong distributed semantics**

---

## Strongest Single Recommendation

If the roadmap compresses to one next step:

**Finish distributed transactions.**

That step turns Lagrange from a distributed execution engine into a fully
credible distributed SQL database — and dramatically increases adoption
potential.

---

## Current System Summary

What already works well:

- Raft consensus groups for all storage (partitions, message groups, WASM
  services)
- CDC propagation with single-owner system table cache on every node
- Deterministic control-plane progression via `OwnerKeyReconcileQueue`
- Unified service runtime with `native_js`, `wasm_component`, and gated
  `oci_container`
- PostgreSQL wire protocol via replicated `sys-postgres-wire` service
- Distributed SQL with planner, parallel coordinator, and merge engine
- Programmatic runtime with iterator, stage, and plan execution modes
- Distributed test harness with 17+ scenarios including network partition,
  node failure, rolling restart, and 7-node configurations
- Admin CLI with interactive terminal UI
- Debug infrastructure with DAP server, DWARF indexing, and replay runtime
- Live query subscriptions bridging CDC to WebSocket clients
- Latency topology with group-aware CDC fanout
- Invariant engine and failure class registry for correctness verification

What needs the most work:

- Multi-partition distributed transactions (skeleton exists, 2PC incomplete)
- Backup / restore / PITR (nothing exists)
- User-facing schema migration pipeline (nothing exists)
- `pg_catalog` / `information_schema` (nothing exists)
- Observability export (Prometheus, OpenTelemetry — nothing exists)
- Security enforcement (auth middleware exists, RBAC/tenancy does not)
- Developer onboarding experience (no `docker-compose`, no simple CLI)
