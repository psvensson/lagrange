# Lagrange Roadmap


Lagrange evolves in stages:

> Research system -> Credible distributed database -> Distributed execution platform

The roadmap preserves Lagrange's core advantage: data locality + programmable
execution + strong distributed semantics.

## Status Legend

| Symbol | Meaning      |
|--------|--------------|
| ✅     | Done         |
| 🔧     | In Progress  |
| 🔲     | Not Started  |

## Editions

Lagrange is available in three editions:

Community (AGPL)
- Full distributed SQL database
- Programmable execution runtime
- Cluster operation via CLI

Pro
- Automated backup and point-in-time recovery
- Advanced observability
- Operational tooling

Enterprise
- Multi-tenant security
- Cross-region replication
- Compliance features

## Edition Legend

| Symbol | Edition              |
|--------|----------------------|
| 🟢     | Community (AGPL)     |
| 🟡     | Pro                  |
| 🔴     | Enterprise           |

---

## Phase 0.1 — Internal Coherence

*"The system behaves predictably under stress."*

Finishing the core database invariants. The foundations are strong: Raft partition
groups, CDC propagation, deterministic control-plane workflows, and system-table
cache. Before productization, a few foundational capabilities must be completed.

### 1. Distributed Transactions — 🟢 Community

| Item | Status | Notes |
|------|--------|-------|
| DistributedTransactionCoordinator skeleton | ✅ | Owns 2PC state machine |
| Transaction state tables | ✅ | sql_transactions, participants |
| Participant enlistment | ✅ | Idempotent operations |
| Prepare phase | 🔧 | Multi-partition incomplete |
| Commit phase | 🔧 | Atomic commit incomplete |
| Rollback | 🔧 | Cross-partition incomplete |
| Coordinator recovery | 🔧 | Replay in-flight transactions |
| Snapshot isolation | 🔲 | Multi-partition read/write |

Goal: multi-partition transactions with snapshot isolation.

### 2. Schema Migration Workflow — 🟢 Community

| Item | Status |
|------|--------|
| System table schema definitions | ✅ |
| Schema version tracking | ✅ |
| Bootstrap schema migration | ✅ |
| Internal ALTER TABLE support | ✅ |
| User-facing migration pipeline | 🔲 |
| Dual-write compatibility | 🔲 |
| Backfill stage | 🔲 |
| Cutover stage | 🔲 |

### 3. Backup / Restore / PITR — 🟡 Pro

| Item | Status |
|------|--------|
| Bootstrap snapshots | ✅ |
| Partition snapshots | ✅ |
| External backup storage | 🔲 |
| Incremental backup | 🔲 |
| Restore to cluster | 🔲 |
| Restore to new cluster | 🔲 |
| Point-in-time recovery | 🔲 |
| Cross-region replication | 🔲 🔴 |

Architecture: partition snapshots + CDC log replay.

### 4. Operational Visibility — 🟢 Basic / 🟡 Advanced

| Item | Status |
|------|--------|
| Metrics instrumentation | ✅ |
| Admin CLI | ✅ |
| Health probes | ✅ |
| Diagnostics API | ✅ |
| Live query subscriptions | ✅ |
| EXPLAIN DISTRIBUTED | ✅ |
| Cluster SQL diagnostics | 🔲 |
| Partition diagnostics | 🔲 |
| CDC diagnostics | 🔲 |

Future (Pro): Prometheus export, OpenTelemetry tracing, partition heatmaps,
runtime execution traces.

### 5. Failure Simulations — 🟢 Community

| Item | Status |
|------|--------|
| Distributed test harness | ✅ |
| Node failure tests | ✅ |
| Network partition tests | ✅ |
| Rolling restart tests | ✅ |
| Node join under load | ✅ |
| Seed restart under load | ✅ |
| Sustained throughput tests | ✅ |
| Write visibility tests | ✅ |
| WASM service failover | ✅ |
| Partition kill/heal | ✅ |
| 7-node stress scenarios | ✅ |
| Postgres baseline comparison | ✅ |
| Invariant engine | ✅ |
| Disk full simulation | 🔲 |
| Slow follower simulation | 🔲 |
| In-cluster chaos injection | 🔲 |

### Phase 0.1 Exit Criteria

The system survives node failure, replica movement, rebalancing, and transaction
retries without manual intervention.

---

## Phase 0.5 — External Usability

*"Developers can realistically try this."*

Focus shifts to developer experience.

### 1. Cluster Deployment Experience — 🟢 Community

| Item | Status |
|------|--------|
| Dockerfile | ✅ |
| Bootstrap API | ✅ |
| Node join protocol | ✅ |
| Admin port | ✅ |
| lagrange cluster init | 🔲 |
| lagrange node start | 🔲 |
| lagrange cluster join | 🔲 |
| docker-compose cluster | 🔲 |
| Kubernetes Helm chart | 🔧 |

### 2. Developer Workflow — 🟢 Community

| Item | Status |
|------|--------|
| Programmatic runtime | ✅ |
| Iterator mode | ✅ |
| Stage mode | ✅ |
| Plan mode | ✅ |
| WASM deployment via manifest | ✅ |
| CLI wasm publish | 🔲 |
| CLI wasm deploy | 🔲 |
| CLI wasm scale | 🔲 |
| Getting-started tutorial | 🔲 |

### 3. Debugging Tools — 🟢 Community

| Item | Status |
|------|--------|
| Debug sessions | ✅ |
| Breakpoints and snapshots | ✅ |
| DAP server | ✅ |
| DWARF mapping | ✅ |
| Replay runtime | ✅ |
| Plan diagnostics | ✅ |
| Playback viewer | ✅ |
| Query execution tracing | 🔲 |
| EXPLAIN EXECUTION | 🔲 |

### Phase 0.5 Exit Criteria

A developer can run a cluster, connect with psql, create tables, deploy WASM,
run distributed execution, and observe results — within 30 minutes.

---

## Phase 1.0 — Real Product

*"Companies can run this in production."*

### 1. PostgreSQL Compatibility — 🟢 Community

| Item | Status |
|------|--------|
| Postgres wire protocol | ✅ |
| SQL dialect translation | ✅ |
| CTEs / subqueries | ✅ |
| EXPLAIN DISTRIBUTED | ✅ |
| information_schema | 🔲 |
| pg_catalog shims | 🔲 |
| Window functions | 🔲 |
| Sequences | 🔲 |

### 2. Observability Platform — 🟡 Pro

| Item | Status |
|------|--------|
| Query correlation IDs | ✅ |
| CDC lag monitoring | ✅ |
| Diagnostics sampler | ✅ |
| Metrics dimensions | ✅ |
| Prometheus export | 🔲 |
| OpenTelemetry tracing | 🔲 |
| Partition heatmap | 🔲 |
| Runtime execution traces | 🔲 |

### 3. Security and Tenancy — 🔴 Enterprise

| Item | Status |
|------|--------|
| PG authentication | ✅ |
| Admin auth middleware | ✅ |
| Service authorization | ✅ |
| Audit context | ✅ |
| Tenant context propagation | 🔧 |
| RBAC | 🔲 |
| Tenant isolation | 🔲 |
| Resource quotas | 🔲 |
| Encryption at rest | 🔲 |
| TLS transport | 🔲 |

### 4. Production Guarantees — 🟢 Community

| Item | Status |
|------|--------|
| Replica count guarantees | ✅ |
| Replica recovery | ✅ |
| Failure detection | ✅ |
| Node reintegration | ✅ |
| Failover SLO definition | 🔲 |
| Durability SLO definition | 🔲 |

---

## Phase 2.0 — Distributed Execution Platform

*"The long-term vision."*

### 1. Multi-Stage Distributed Plans — 🟢 Community

| Item | Status |
|------|--------|
| Distributed query planner | ✅ |
| Parallel coordinator | ✅ |
| Merge engine | ✅ |
| Strategy selector | ✅ |
| Plan diagnostics | ✅ |
| Multi-stage plans | 🔲 |
| Cost-based optimizer | 🔲 |
| Query hints | 🔲 |

### 2. Runtime Services — 🟢 Community core / 🟡🔴 Advanced

| Item | Status |
|------|--------|
| native_js runtime | ✅ |
| wasm_component runtime | ✅ |
| OCI container runtime | 🔧 |
| Replicated KV store | ✅ |
| Persistent timers | ✅ |
| Communication ports | ✅ |
| Consistency modes | ✅ |
| Vector search service | 🔲 |
| Embedding service | 🔲 |

### 3. Data-Local AI Processing — Future Platform Capability

| Item | Status |
|------|--------|
| Local summarization | 🔲 |
| Local anomaly detection | 🔲 |
| Local semantic filtering | 🔲 |

---

## Long-Term Vision

Lagrange evolves toward a unified platform where data, computation, and
coordination live in the same system:

> Distributed database + distributed compute + programmable data locality +
> data-local AI reasoning
