---
audience: development
documentClass: planning
---

# Lagrange Product Roadmap

This document is a cross-edition status board for Community, Pro, and
Enterprise planning.

It is visibility-only. Do not use this file to create specs, tasks, or code in
the AGPL repository. Use `roadmap.md` for AGPL implementation planning.

Paid-tier source-of-truth planning remains external to this repository. Statuses
here are mirrored so progress can be shown without turning paid backlog into
actionable work in this codebase.

## Status Legend

| Symbol | Meaning      |
|--------|--------------|
| ✅     | Done         |
| 🔧     | In Progress  |
| 🔲     | Not Started  |

Note: in [roadmap.md](roadmap.md) the ✅ glyph means "available at roadmap
scope" — release readiness may still need release-gate proof there, while
here it simply means done.

## Edition Legend

| Symbol | Edition              |
|--------|----------------------|
| 🟢     | Community (AGPL)     |
| 🟡     | Pro                  |
| 🔴     | Enterprise           |

## Editions

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

---

## Phase 0.1 — Internal Coherence

*"The system behaves predictably under stress."*

### 0.1a. Topology Workflow Stabilization — 🟢 Community

| Item | Status | Notes |
|------|--------|-------|
| `replica_operations` single-writer cutover | ✅ | `RebalanceCoordinator` is the canonical writer/owner path |
| Managed split durable-owner cutover | ✅ | `ManagedSplitWorkflow` owns split lifecycle and resume |
| Readiness stratification for internal vs load lanes | ✅ | Internal topology paths use `repairEligible`; load/routing paths use `serveEligible` |
| Atomic topology transitions fail closed without transaction owner | ✅ | Optional fallback semantics removed on atomic cut points |
| Cache observation boundary enforcement | ✅ | Workflow advance requires owner commit and acknowledgement, not cache timing |
| Owner-dependency fallback removal | ✅ | Active topology paths fail closed when required owners are missing |
| Deterministic regression ladder enforcement | ✅ | Repros and focused suites run before 7-node harness confirmation |
| Scenario policy SQL ownership guard | ✅ | `npm run guard:scenario-policy:file` enforces `table_policies` owner helper usage |

### 1. Distributed Transactions — 🟢 Community

| Item | Status | Notes |
|------|--------|-------|
| DistributedTransactionCoordinator skeleton | ✅ | Owns 2PC state machine |
| Transaction state tables | ✅ | `sql_transactions`, `sql_transaction_participants`, `sql_write_operations` |
| Participant enlistment | ✅ | Idempotent operations |
| Prepare phase | ✅ | Real `PREPARE` dispatch + participant conflict checks |
| Prepared-state durability | ✅ | `PREPARE_TRANSACTION` replicated in participant Raft log |
| Commit phase | ✅ | Commit decision persisted before participant fanout |
| Rollback | ✅ | Cross-partition rollback with idempotent participant handling |
| Coordinator recovery | ✅ | Status-driven replay to terminal state after restart |
| Snapshot isolation | ✅ | Epoch-based visibility + read-your-own-writes |
| Write conflict detection | ✅ | First-committer-wins conflict detection at prepare |
| Timeout and cleanup | ✅ | Budget-based abort + participant hold timeout + recovery sweep |

### 2. Schema Migration Workflow — 🟢 Community

| Item | Status |
|------|--------|
| System table schema definitions | ✅ |
| Schema version tracking | ✅ |
| Bootstrap schema migration | ✅ |
| Internal ALTER TABLE support | ✅ |
| User-facing migration pipeline | ✅ |
| Dual-write compatibility | ✅ |
| Backfill stage | ✅ |
| Cutover stage | ✅ |
| Cancellation and rollback path | ✅ |
| Restart recovery of non-terminal migrations | ✅ |
| Migration observability tables (`schema_migrations`, `schema_migration_partitions`) | ✅ |

### 3. Operational Visibility — 🟢 Community basics / 🟡 Pro advanced

| Item | Edition | Status |
|------|---------|--------|
| Metrics instrumentation | 🟢 | ✅ |
| Admin CLI | 🟢 | ✅ |
| Health probes | 🟢 | ✅ |
| Diagnostics API | 🟢 | ✅ |
| Live query subscriptions | 🟢 | ✅ |
| EXPLAIN DISTRIBUTED | 🟢 | ✅ |
| Cluster SQL diagnostics | 🟢 | ✅ |
| Partition diagnostics | 🟢 | ✅ |
| CDC diagnostics | 🟢 | ✅ |
| Prometheus export | 🟡 | 🔲 |
| OpenTelemetry tracing | 🟡 | 🔲 |
| Partition heatmaps | 🟡 | 🔲 |
| Runtime execution traces | 🟡 | 🔲 |

### 4. Failure Simulations — 🟢 Community

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
| Disk full simulation | ✅ |
| Slow follower simulation | ✅ |
| In-cluster chaos injection | ✅ |

---

## Phase 0.5 — External Usability

*"Developers can realistically try this."*

### 1. Cluster Deployment Experience — 🟢 Community

| Item | Status |
|------|--------|
| Dockerfile | ✅ |
| Bootstrap API | ✅ |
| Node join protocol | ✅ |
| Admin port | ✅ |
| `lagrange cluster init` | 🔲 |
| `lagrange node start` | 🔲 |
| `lagrange cluster join` | 🔲 |
| `docker-compose` cluster | 🔲 |
| Kubernetes Helm chart | ✅ |

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

---

## Phase 1.0 — Real Product

*"Companies can run this in production."*

### 1. System Service Foundations — 🟢 Community core

| Item | Status | Notes |
|------|--------|-------|
| Unified service lifecycle | ✅ | `ServiceLifecycleManager` + `ServiceReconciler` + `ServiceDispatcher` |
| Built-in runtime services | ✅ | `sys-postgres-wire`, `sys-admin-meta`, `sys-wasm-meta` |
| `native_js` runtime | ✅ | Active runtime for first-party system services |
| `wasm_component` runtime | ✅ | Available runtime for replicated services |
| Service manifest schema definition | 🔲 | Identity, runtime, capabilities, compatibility |
| Manifest validation rules | 🔲 | Required fields, version format, capability recognition, dependency validation |
| Service catalog system tables | 🔲 | Desired/actual installed-service state and failure recording |
| Installation reconciler | 🔲 | Fetch/validate/place/start-stop convergence |
| Service lifecycle API | 🔲 | `onInstall`, `onStart`, `onStop`, `onUpgrade`, `onUninstall` |
| Replicated service state API | 🔲 | Stable service-owned state surface |
| CDC subscription API | 🔲 | Change-stream consumption for service workflows |
| Admin surface registration | 🔲 | Services register SQL/CLI/HTTP control surfaces |
| Capability enforcement | 🔲 | Kernel gates service access to privileged APIs |
| Consistent snapshot API | 🔲 | Required for backup barriers and cluster-consistent reads |
| Topology API | 🔲 | Required for service placement and orchestration |
| Event emission API | 🔲 | Structured progress and failure reporting |

### 2. Backup / Restore / PITR — 🟡 Pro

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

### 3. PostgreSQL Compatibility — 🟢 Community

| Item | Status |
|------|--------|
| Postgres wire protocol | ✅ |
| SQL dialect translation | ✅ |
| CTEs / subqueries | ✅ |
| EXPLAIN DISTRIBUTED | ✅ |
| `information_schema` | 🔲 |
| `pg_catalog` shims | 🔲 |
| Window functions | 🔲 |
| Sequences | 🔲 |

### 4. Observability Platform — 🟡 Pro

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

### 5. Security and Tenancy — 🔴 Enterprise

| Item | Status |
|------|--------|
| PG authentication | 🔧 | Loopback-only explicit trust is live; password/SCRAM exchange remains unimplemented |
| Admin auth middleware | ✅ |
| Service authorization | ✅ |
| Audit context | ✅ |
| Tenant context propagation | 🔧 |
| RBAC | 🔲 |
| Tenant isolation | 🔲 |
| Resource quotas | 🔲 |
| Encryption at rest | 🔲 |
| TLS transport | 🔲 |

### 6. Production Guarantees — 🟢 Community

| Item | Status |
|------|--------|
| Replica count guarantees | ✅ |
| Replica recovery | ✅ |
| Failure detection | ✅ |
| Node reintegration | ✅ |
| Failover SLO definition | 🔲 |
| Durability SLO definition | 🔲 |
| Raft snapshot recovery and bounded log lifecycle | 🔲 |
| Supported data-plane scale envelope | 🔲 |
| Feasibility-qualified placement balance SLO | 🔲 |
| Topology convergence SLO | 🔲 |
| Large-scale data-plane certification | 🔲 |

---

## Phase 2.0 — Distributed Execution Platform

*"The long-term vision: database + compute + service platform."*

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

### 2. Advanced Runtime Services — 🟢 Community core / future service platform

| Item | Status |
|------|--------|
| OCI container runtime | 🔧 |
| Vector search service | 🔲 |
| Embedding service | 🔲 |

### 3. External Kernel Platform API — 🟢 Community core / 🔴 Enterprise extensions

#### Phase 0 — Minimal Deployment Follow-ons — 🟢 Community

| Item | Status | Notes |
|------|--------|-------|
| Keyed invocation routing | 🔲 | Trusted actor-key extraction and rendezvous assignment over ready Cells |
| Generic Cell request continuity and failover | 🔲 | Provider-neutral route recovery and duplicate-effect safety |
| Non-request source invocation | 🔲 | CDC, timer, once, boot, named call, and pushdown execution through existing Cell owners |

#### Phase A — Stable External Service Contract — 🟢 Community

| Item | Status | Notes |
|------|--------|-------|
| Stable manifest registration contract | 🔲 | Versioned external contract for identity, runtime, capabilities, compatibility |
| Stable service lifecycle API | 🔲 | Supported install/start/stop/upgrade hooks |
| Stable replicated service state API | 🔲 | Versioned service-owned state contract |
| Stable CDC subscription API | 🔲 | Supported table change streams |
| Stable admin surface registration | 🔲 | Supported SQL/CLI/HTTP command registration contract |
| Stable capability model | 🔲 | Public capability taxonomy and enforcement contract |

#### Phase B — Advanced External Service APIs — 🟢 Community

| Item | Status | Notes |
|------|--------|-------|
| Upgrade / rollout API | 🔲 | Rolling, canary, all-at-once strategies |
| External topology API | 🔲 | Supported node, partition, and leader introspection |
| External event emission API | 🔲 | Public structured events contract |

#### Phase C — Enterprise Platform APIs — 🔴 Enterprise

| Item | Status | Notes |
|------|--------|-------|
| Policy provider API | 🔲 | RBAC, tenant isolation, quotas, placement rules |
| Secrets and external references API | 🔲 | Cluster-resolved credentials and KMS integration |

### 4. Installable Service Ecosystem — 🟢 Community core / 🟡🔴 advanced controls

#### Artifact and Package Registry — 🟢 Community

| Item | Status | Notes |
|------|--------|-------|
| OCI registry transport | 🔲 | Primary artifact distribution via OCI |
| Registry configuration (`add` / `list` / `remove`) | 🔲 | Multiple registries with priority and auth |
| Local artifact path (dev-install) | 🔲 | Fast local development workflow |
| Air-gapped / mirror registry support | 🔲 | Enterprise local mirror path |
| Trust and verification (digest, signature) | 🔲 | Artifact and manifest integrity checks |

#### Manifest and Install UX — 🟢 Community

| Item | Status | Notes |
|------|--------|-------|
| Configuration schema support | 🔲 | JSON Schema for service config contracts |
| Upgrade strategy declaration | 🔲 | Rolling, canary, all-at-once in manifest |
| Health and probe definitions | 🔲 | Startup, readiness, liveness probes |
| Dependency declaration | 🔲 | Service and kernel feature dependencies |
| Install lifecycle (discover → resolve → validate → record → reconcile → observe) | 🔲 | Declarative desired-state convergence |
| Remove lifecycle | 🔲 | Drain, stop, cleanup per policy |
| Upgrade lifecycle with rollback | 🔲 | Versioned revisions, rollback to prior known-good |
| Failure recording and queryability | 🔲 | Structured durable failure state |

#### SQL / CLI Surface — 🟢 Community

| Item | Status | Notes |
|------|--------|-------|
| `INSTALL SERVICE` / `REMOVE SERVICE` / `UPGRADE SERVICE` SQL | 🔲 | Service lifecycle as first-class cluster operations |
| `SHOW SERVICES` / `SHOW SERVICE REVISIONS` / `SHOW SERVICE INSTANCES` SQL | 🔲 | Observability via SQL |
| `lagrange service install` / `upgrade` / `remove` / `list` / `status` CLI | 🔲 | CLI equivalents |
| `lagrange registry add` / `list` CLI | 🔲 | Registry management |

#### Licensing and Edition Gating — 🟡 Pro / 🔴 Enterprise

| Item | Status | Notes |
|------|--------|-------|
| Edition requirement enforcement | 🔲 | Services declare `community` / `pro` / `enterprise` |
| License token / entitlement validation | 🔲 | Cluster validates entitlement before activation |

### 5. Data-Local AI Processing — visibility only until edition classification

| Item | Status |
|------|--------|
| Local summarization | 🔲 |
| Local anomaly detection | 🔲 |
| Local semantic filtering | 🔲 |
