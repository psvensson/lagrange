---
audience: agent
documentClass: steering
scope: governance
status: canonical
always_load: false
source_of_truth: self
---

# Lagrange AGPL Feature Map

This document is the stable AGPL feature sequence and scope map. It answers
which features belong in this repository and the intended order in which broad
capabilities mature.

This document does not activate Quests, close release gates, record the current
blocker, or certify that representative proof is green. Executable work is
authorized by active Quests under `solve/quests/`; attempts, findings, reports,
and release-readiness evidence live under `solve/`.

The human-readable product direction lives in `roadmap.md`.
Cross-edition product status lives in `docs/development/product-roadmap.md`.
Edition ownership and implementation-home rules live in `edition-matrix.md`.

## Scope

- In scope: Community / AGPL features and shared platform substrate whose
  implementation home is this repository in `edition-matrix.md`
- Out of scope: Pro and Enterprise backlog, even when those items are visible
  elsewhere for status tracking

Lagrange evolves in stages:

> Research system -> Credible distributed database -> Distributed execution platform

The roadmap preserves Lagrange's core advantage: data locality + programmable
execution + strong distributed semantics.

Broad rows may constrain implementation scope only when they are paired with a
linked spec or architecture document that makes the intended behavior concrete.

## Roadmap State Legend

| Symbol | Meaning |
|--------|---------|
| ✅     | Available at roadmap scope; release readiness may still require release-gate proof |
| 🔧     | Approved implementation scope; execution still requires a Quest |
| 🔲     | Planned but not yet active implementation scope |

## Roadmap Row IDs

Rows that a Quest needs to cite carry a stable id in an `Id` column, of the form
`RM-<phase>-<slug>` (e.g. `RM-0.1-fs-rolling-restart`). A Quest links to a row by
putting that id in its `links.roadmapRow`; the roadmap authority check (`--row
RM-...` and `npm run overview` then join the row to the Quests advancing it.

Two rules keep the ids durable:

- **Slugs, never positions.** The id encodes the phase and a topic slug, not a row
  number, so inserting or reordering rows never renumbers existing ids (the
  positional-renumbering trap that breaks rule-id and CL citations). A row keeps
  its id for life; a removed row's id is retired, not reused.
- **Added on first link, not all at once.** A table gains the `Id` column when one
  of its rows first becomes a Quest link target. Tables without active Quest links
  may omit the column until they need it; this is intentional, not drift.

This roadmap still does not certify proof; for an id'd row in flight, the live
status is the linked Quest report and the closure ledger, not the row's symbol.

## Live Truth Pointers

Use these documents for mutable execution and readiness state:

| Question | Source of truth |
| --- | --- |
| Current active Quest, frontier, latest probe, and next action | `npm run quest:context` |
| Quest reports / closure projection | `solve/report/*.md` |
| Durable attempts, findings, and terminal state | `solve/log/*.ndjson` |
| Authored Quest goals and frontiers | `solve/quests/*.json` |
| Archived pre-Quest packages and sprint material | `_legacy_work/` |

---

## Phase 0.1 — Internal Coherence

*"The system behaves predictably under stress."*

Finishing the core database invariants. The foundations are strong: Raft
partition groups, CDC propagation, deterministic control-plane workflows, and
system-table cache. Before productization, a few foundational capabilities must
be completed.

### 0.1 Release Truth Pointer

Phase 0.1 feature scope is listed below. Whether the release is currently
exit-complete is intentionally not tracked in this roadmap.

Use `solve/quests/<id>/` (quest.json, log.ndjson, evidence/) for active release-gate truth. Archived
pre-Quest release notes live in git history (the `_legacy_work/` checkout copy
was pruned) for historical context only.

### 0.1a. Topology Workflow Stabilization (March 2026)

| Id | Item | Roadmap state | Scope notes |
|----|------|--------|-------|
| RM-0.1a-replica-operations-cutover | `replica_operations` single-writer cutover | ✅ | `RebalanceCoordinator` is the canonical writer/owner path |
| RM-0.1a-managed-split-cutover | Managed split durable-owner cutover | ✅ | `ManagedSplitWorkflow` owns split lifecycle and resume |
| RM-0.1a-readiness-stratification | Readiness stratification for internal vs load lanes | ✅ | Internal topology paths use `repairEligible`; load/routing paths use `serveEligible` |
| RM-0.1a-atomic-topology-transitions | Atomic topology transitions fail closed without transaction owner | ✅ | Optional fallback semantics removed on atomic cut points |
| RM-0.1a-cache-observation-boundary | Cache observation boundary enforcement | ✅ | Workflow advance requires owner commit and acknowledgement, not cache timing |
| RM-0.1a-owner-dependency-fallback-removal | Owner-dependency fallback removal | ✅ | Active topology paths fail closed when required owners are missing |
| RM-0.1a-deterministic-regression-ladder | Deterministic regression ladder enforcement | ✅ | Repros and focused suites run before 7-node harness confirmation |
| RM-0.1a-scenario-policy-sql-guard | Scenario policy SQL ownership guard | ✅ | `npm run guard:scenario-policy:file` enforces `table_policies` owner helper usage |

### 1. Distributed Transactions

| Item | Roadmap state | Scope notes |
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

Goal achieved: multi-partition transactions with snapshot isolation and
deterministic recovery/timeout handling.

### 2. Schema Migration Workflow

| Item | Roadmap state |
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

### 3. Operational Visibility

| Item | Roadmap state |
|------|--------|
| Metrics instrumentation | ✅ |
| Admin CLI | ✅ |
| Health probes | ✅ |
| Diagnostics API | ✅ |
| Live query subscriptions | ✅ |
| EXPLAIN DISTRIBUTED | ✅ |
| Cluster SQL diagnostics | ✅ |
| Partition diagnostics | ✅ |
| CDC diagnostics | ✅ |

### 4. Failure Simulations

| Id | Item | Roadmap state | Scope notes |
|----|------|---------------|-------------|
| RM-0.1-fs-distributed-harness | Distributed test harness | ✅ | Harness exists and remains the proof surface |
| RM-0.1-fs-node-failure | Node failure tests | ✅ | Capability is in roadmap scope; live release-gate proof belongs in Solver reports |
| RM-0.1-fs-network-partition | Network partition tests | ✅ | Capability is in roadmap scope; live release-gate proof belongs in Solver reports |
| RM-0.1-fs-rolling-restart | Rolling restart tests | ✅ | Capability is in roadmap scope; current representative truth belongs in the active Quest report |
| RM-0.1-fs-node-join-under-load | Node join under load | ✅ | Capability is in roadmap scope; live release-gate proof belongs in Solver reports |
| RM-0.1-fs-seed-restart-under-load | Seed restart under load | ✅ | Capability is in roadmap scope; live release-gate proof belongs in Solver reports |
| RM-0.1-fs-sustained-throughput | Sustained throughput tests | ✅ | Capability is in roadmap scope; live release-gate proof belongs in Solver reports |
| RM-0.1-fs-write-visibility | Write visibility tests | ✅ | Capability is in roadmap scope; live release-gate proof belongs in Solver reports |
| RM-0.1-fs-wasm-failover | WASM service failover | ✅ | Capability is in roadmap scope; live release-gate proof belongs in Solver reports |
| RM-0.1-fs-partition-kill-heal | Partition kill/heal | ✅ | Capability is in roadmap scope; live release-gate proof belongs in Solver reports |
| RM-0.1-fs-7-node-stress | 7-node stress scenarios | ✅ | Capability is in roadmap scope; live release-gate proof belongs in Solver reports |
| RM-0.1-fs-postgres-baseline | Postgres baseline comparison | ✅ | Capability is in roadmap scope; live release-gate proof belongs in Solver reports |
| RM-0.1-fs-invariant-engine | Invariant engine | ✅ | Capability is in roadmap scope; live release-gate proof belongs in Solver reports |
| RM-0.1-fs-disk-full | Disk full simulation | ✅ | Capability is in roadmap scope; live release-gate proof belongs in Solver reports |
| RM-0.1-fs-slow-follower | Slow follower simulation | ✅ | Capability is in roadmap scope; live release-gate proof belongs in Solver reports |
| RM-0.1-fs-chaos-injection | In-cluster chaos injection | ✅ | Capability is in roadmap scope; live release-gate proof belongs in Solver reports |

### Phase 0.1 Exit Criteria

The system survives node failure, replica movement, rebalancing, and
transaction retries without manual intervention.

The release program owns the live answer to whether these criteria are
currently satisfied. This roadmap records the criteria and sequence only.

---

## Phase 0.2 — Stable Core Release

*"A narrow, credible release of the core cluster."*

Phase 0.2 packages stable core cluster operation and snapshot work already
integrated into the core. It does not expand the product claim to full snapshot
recovery, automatic data-affinity placement, distributed-reduce certification,
or OCI container execution.

| Id | Item | Roadmap state | Scope notes |
|----|------|---------------|-------------|
| `RM-0.2-five-node-convergence` | Five-node cold formation and runtime-service initial placement | 🔧 | Formation, table creation, and initial service placement complete without stalled control-plane or service operations |
| `RM-0.2-topology-safety` | Topology-operation safety closure | 🔧 | Authoritative operation-ledger release, safe surplus removal, and ready-lease candidate admission retain their safety invariants |
| `RM-0.2-snapshot-integration` | Compacted-follower snapshot catch-up integration | 🔧 | Current snapshot catch-up work is landed and independently verified; this row does not claim complete snapshot recovery |
| `RM-0.2-release-verification` | Core release verification | 🔧 | Enforcing memory-soak evidence and all required CI and release checks are green |

### Phase 0.2 Exit Criteria

- The representative cold five-node workload completes three consecutive runs
  without a formation, table-readiness, or initial-service-placement stall.
- The topology safety cases linked to the release scope have terminal evidence.
- Compacted-follower snapshot catch-up is integrated and independently
  verified.
- An enforcing memory-soak run reports sufficient samples and no detected leak.
- Required CI and release checks are green, and remaining limitations are
  documented.

Snapshot protocol foundations may ship in 0.2, but the release must not claim
complete snapshot recovery or large-follower live rebuild until the retention,
compaction, and live-rebuild Quests required by
`solve/specs/raft-snapshot-transfer-install/requirements.md` are terminal.
Automatic data affinity, the distributed-reduce live demonstration, and OCI
container execution remain outside the 0.2 claim unless their own live
acceptance Quests become terminal before the release cutoff.

Phase 0.5 deployment CLI, Docker Compose, WASM CLI, and onboarding work is not
part of the 0.2 release gate.

---

## Phase 0.3 — Queryable Core

*"Ordinary SQL reaches the right data efficiently without physical-partition knowledge."*

Phase 0.3 owns the query-access-path ladder that was previously parked under
1.0. The sequencing rationale and implementation boundaries live in
`solve/epics/query-access-path-ladder.md`; global-index machinery is further
constrained by `solve/specs/global-secondary-indexes/requirements.md`.

| Id | Item | Roadmap state | Scope notes |
|----|------|---------------|-------------|
| RM-0.3-qs-typed-key-ordering | Typed partition-key and tuple ordering | 🔲 | One shared type-aware total order (or order-preserving key encoding) replaces the duplicated `localeCompare` helpers and raw JS compare, with a migration/revalidation story for persisted boundaries. This is correctness work as well as planner substrate. |
| RM-0.3-qs-pk-partition-narrowing | Primary-key and compound-primary-key partition narrowing beyond `id` | 🔲 | Read the already-persisted primary key (`tables.partition_key`) in partition resolution and the remaining `id`-fallback modules, activating the existing composite-key path. Depends on typed key ordering. |
| RM-0.3-qs-local-index-ddl | Local ordered index DDL | 🔲 | Wire parsed `CREATE INDEX` / `DROP INDEX` through statement dispatch into the existing `IndexService`, instantiate it in runtime composition, and support ordinary and compound local B-tree indexes. Unsupported index families fail closed rather than existing as metadata-only claims. |
| RM-0.3-qs-compound-index-semantics | Ordered and compound index planner semantics | 🔲 | Seal tuple/NULL/type/collation behavior plus left-prefix and equality-prefix-plus-next-range rules for local and global indexes. Remove the current heuristic that treats any matching non-leading column as sufficient index use. |
| RM-0.3-qs-global-secondary-indexes | Non-unique global secondary and compound indexes | 🔲 | Index-as-partitioned-dataset storage, index-side routing, write-path maintenance, resumable backfill, lifecycle/failure state, planner integration, and `EXPLAIN DISTRIBUTED`. An unavailable/unreadable index degrades to scatter-gather rather than affecting correctness. Spec: `solve/specs/global-secondary-indexes/`. |

The former planning IDs `RM-1.0-qs-typed-key-ordering`,
`RM-1.0-qs-pk-partition-narrowing`, `RM-1.0-qs-local-index-ddl`, and
`RM-1.0-qs-global-secondary-indexes` are retired and must not be reused. Their
historical references remain valid; new Quests link the 0.3 IDs above.

### Phase 0.3 Exit Criteria

- Persisted partition and indexed tuples have one type-aware ordering contract.
- Tables with non-`id` and compound primary keys narrow to the correct
  partitions where their predicates permit it.
- Ordinary and compound local B-tree indexes can be created, dropped, and used
  under explicit ordered-index semantics.
- A non-unique global secondary/compound index survives resumable backfill and
  restart/failure cases, and can route a representative non-PK query more
  narrowly than scatter-gather without changing correctness when rejected.
- `EXPLAIN DISTRIBUTED` identifies the selected index and compound prefix/range
  shape, or explains why an available index was not usable.

Global uniqueness is explicitly outside the 0.3 contract. If enforcing an
index changes transaction correctness rather than only query performance, that
work belongs to the 1.0 production-invariant boundary below.

---

## Phase 0.5 — External Usability

Focus shifts to developer experience.

### 1. Cluster Deployment Experience

| Id | Item | Roadmap state |
|----|------|--------|
| `RM-0.5-cde-dockerfile` | Dockerfile | ✅ |
| `RM-0.5-cde-bootstrap-api` | Bootstrap API | ✅ |
| `RM-0.5-cde-node-join` | Node join protocol | ✅ |
| `RM-0.5-cde-admin-port` | Admin port | ✅ |
| `RM-0.5-cde-cluster-init` | `lagrange cluster init` | 🔲 |
| `RM-0.5-cde-node-start` | `lagrange node start` | 🔲 |
| `RM-0.5-cde-cluster-join` | `lagrange cluster join` | 🔲 |
| `RM-0.5-cde-docker-compose` | `docker-compose` cluster | 🔲 |
| `RM-0.5-cde-helm-chart` | Kubernetes Helm chart | ✅ |

The Kubernetes Helm chart shipped: `charts/lagrange-node/` exists and the
release pipeline packages it. Further hardening of the chart stays tied to a
deployment description that covers values surface, networking, storage,
bootstrap flow, and upgrade behavior before more task expansion begins.

### 2. Developer Workflow

| Id | Item | Roadmap state |
|----|------|--------|
| `RM-0.5-dw-programmatic-runtime` | Programmatic runtime | ✅ |
| `RM-0.5-dw-iterator-mode` | Iterator mode | ✅ |
| `RM-0.5-dw-stage-mode` | Stage mode | ✅ |
| `RM-0.5-dw-plan-mode` | Plan mode | ✅ |
| `RM-0.5-dw-wasm-manifest` | WASM deployment via manifest | ✅ |
| `RM-0.5-dw-cli-wasm-publish` | CLI wasm publish | 🔲 |
| `RM-0.5-dw-cli-wasm-deploy` | CLI wasm deploy | 🔲 |
| `RM-0.5-dw-cli-wasm-scale` | CLI wasm scale | 🔲 |
| `RM-0.5-dw-getting-started` | Getting-started tutorial | 🔲 |

The 0.5 onboarding and operator surface should make the 0.3 access paths easy
to inspect: index definitions/state and build failures belong in ordinary
SQL/catalog diagnostics, and examples should demonstrate indexed access without
requiring callers to understand partition internals.

### 3. Service Development Inner Loop

Fast iteration for service authors. The goal is that the path from "I
changed a line" to "I can test it in the cluster" stays under a few
seconds for WASM services and under a minute for OCI containers.

| Id | Item | Roadmap state | Scope notes |
|----|------|--------|-------|
| — | `lagrange service dev-install` zero-ceremony path | 🔲 | Point at local dir, CLI wraps in OCI layout, installs without registry push or full manifest |
| `RM-0.5-il-service-init-scaffold` | `lagrange service init` scaffold | 🔲 | Generate minimal manifest + project structure for new services |
| — | WASM hot reload in dev mode | 🔲 | File watcher detects changes, rebuilds module, swaps in running cluster without full install cycle |
| — | Dev-mode manifest defaults | 🔲 | Minimal required fields for local development; full manifest only required for registry publish |
| — | In-process WASM debugging preserved | ✅ | DAP, breakpoints, DWARF, snapshots, replay all work because `wasm_component` loads in-process regardless of OCI packaging |
| — | OCI container dev logging | 🔲 | Structured log tailing for container-runtime services during development |
| — | Service dev example walkthrough | 🔲 | End-to-end example: create, dev-install, iterate, debug, publish |

### 4. Debugging Tools

| Item | Roadmap state |
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

A developer can run a cluster, connect with `psql`, create tables, deploy WASM,
run distributed execution, and observe results within 30 minutes.

Until `lagrange cluster init`, `lagrange node start`, `lagrange cluster join`,
one local-cluster tutorial, and public package/CLI naming alignment are real,
broad service-platform expansion remains design/substrate work only. It must
not outrank Phase 0.1 representative-gate closure or Phase 0.5 operator basics.

---

## Phase 1.0 — Real Product

*"Companies can run this in production."*

### 1. System Service Foundations

These items are intentionally in scope for the AGPL repository even when they
also enable future paid system services.

| Item | Roadmap state | Scope notes |
|------|--------|-------|
| Unified service lifecycle | ✅ | `ServiceLifecycleManager` + `ServiceReconciler` + `ServiceDispatcher` |
| Built-in runtime services | ✅ | `sys-postgres-wire`, `sys-admin-meta`, `sys-wasm-meta` run on the service substrate |
| `native_js` runtime | ✅ | Active runtime for first-party system services |
| `wasm_component` runtime | ✅ | Available runtime for replicated services |
| Service manifest schema definition | 🔲 | Identity, runtime, capabilities, compatibility. Architecture: `architecture/lagrange-service-manifest.md` |
| Manifest validation rules | 🔲 | Required fields, format and capability validation. Architecture: `architecture/lagrange-service-manifest.md` |
| Service catalog system tables | 🔲 | Desired/actual installed-service state and failure recording. Architecture: `architecture/lagrange-service-registry.md` |
| Installation reconciler | 🔲 | Fetch/validate/place/start-stop convergence for service revisions. Architecture: `architecture/lagrange-service-registry.md` |
| Service lifecycle API | 🔲 | `onInstall`, `onStart`, `onStop`, `onUpgrade`, `onUninstall`. Design: `solve/specs/service-portability-ladder/kernel-platform-api-v0.md` |
| Replicated service state API | 🔲 | Stable service-owned state surface above replicated storage. Design: `solve/specs/service-portability-ladder/kernel-platform-api-v0.md` |
| CDC subscription API | 🔲 | Change-stream consumption for service workflows. Design: `solve/specs/service-portability-ladder/kernel-platform-api-v0.md` |
| Admin surface registration | 🔲 | Services register SQL/CLI/HTTP control surfaces. Design: `solve/specs/service-portability-ladder/kernel-platform-api-v0.md` |
| Capability enforcement | 🔲 | Kernel gates service access to privileged APIs. Design: `solve/specs/service-portability-ladder/kernel-platform-api-v0.md` |
| Consistent snapshot API | 🔲 | Required for cluster-consistent reads and service barriers. Design: `solve/specs/service-portability-ladder/kernel-platform-api-v0.md` |
| Topology API | 🔲 | Required for service placement and orchestration. Design: `solve/specs/service-portability-ladder/kernel-platform-api-v0.md` |
| Event emission API | 🔲 | Structured progress and failure reporting for system services. Design: `solve/specs/service-portability-ladder/kernel-platform-api-v0.md` |

### 2. PostgreSQL Compatibility

| Item | Roadmap state |
|------|--------|
| Postgres wire protocol | ✅ |
| SQL dialect translation | ✅ |
| CTEs / subqueries | ✅ |
| EXPLAIN DISTRIBUTED | ✅ |
| `information_schema` | 🔲 |
| `pg_catalog` shims | 🔲 |
| Window functions | 🔲 |
| Sequences | 🔲 |

### 3. Production Guarantees

| Id | Item | Roadmap state | Scope notes |
|----|------|--------|-------|
| — | Replica count guarantees | ✅ | |
| — | Replica recovery | ✅ | |
| — | Failure detection | ✅ | |
| — | Node reintegration | ✅ | |
| — | Failover SLO definition | 🔲 | Define hardware class, workload, failure envelope, pass-rate confidence bound, convergence percentiles, reporting surface, and representative gate. The topology contract must be refreshed from `solve/epics/topology-convergence-hardening.md` before a Quest links this row. |
| — | Durability SLO definition | 🔲 | Define acknowledged-write durability, restart/rebuild envelope, measurement surface, and adversarial gate before implementation starts |
| — | Raft snapshot recovery and bounded log lifecycle | 🔲 | Versioned checkpoint creation, separately bounded snapshot transfer pressure, atomic install/restart recovery, compacted-leader catch-up, retention, and physical compaction. Spec: `solve/specs/raft-snapshot-transfer-install/`. |
| — | Supported data-plane scale envelope | 🔲 | Publish only measured node/table/partition/replica/data-volume profiles tied to a hardware class and workload. Spec: `solve/specs/large-scale-data-plane-certification/`. |
| — | Feasibility-qualified placement balance SLO | 🔲 | Hard constraints, byte/replica/leader/load/affinity objectives, oracle or lower-bound gap, bounded movement, and typed degraded outcomes when the target is infeasible. Spec: `solve/specs/large-scale-data-plane-certification/`. |
| — | Topology convergence SLO | 🔲 | Statistical, hardware-relative convergence after add, failure, restart, replacement, and decommission; no single-run or timeout-extension certification. Contract: `solve/epics/topology-convergence-hardening.md` plus `solve/specs/large-scale-data-plane-certification/`. |
| — | Large-scale data-plane certification | 🔲 | Separate metadata-cardinality and physical-byte ladders, with enforced throughput, latency, heap/RSS, file-descriptor, queue, in-flight-work, and leak gates. Spec: `solve/specs/large-scale-data-plane-certification/`. |

### 4. Production Index and Constraint Guarantees

These rows build on Phase 0.3 rather than re-owning ordinary index storage or
planner semantics. The distinction is semantic: 0.3 indexes are optional
access paths; 1.0 may make an index part of a database invariant.

| Item | Roadmap state | Scope notes |
|------|---------------|-------------|
| Unique global secondary indexes | 🔲 | Require synchronous index maintenance capable of participating in transaction correctness; asynchronous uniqueness is not claimable. |
| Transactional synchronous index maintenance | 🔲 | Enlist required index partitions in the write/2PC correctness boundary with typed failure when the invariant cannot be maintained. |
| Production index rebuild/backfill guarantees | 🔲 | Restart/failover-safe rebuild with measured pressure, bounded operational impact, durable state, and a supported recovery envelope. |
| Index write-amplification and capacity envelope | 🔲 | Publish representative write/read/rebuild costs for supported compound/global-index profiles rather than treating index overhead as unbounded. |
| Supported ordered-key/NULL/type/collation contract | 🔲 | Stabilize the subset exposed through PostgreSQL-facing metadata and constraint behavior; richer compatibility remains 1.x. |

---

## Phase 1.x — SQL Breadth and Compatibility

*"Broaden relational ergonomics without changing the distributed index foundation."*

These features intentionally follow the 0.3 ordered-index contract and 1.0
production invariants. They improve PostgreSQL/SQL breadth but are not required
for the first correct and useful secondary-index implementation.

| Item | Roadmap state | Scope notes |
|------|---------------|-------------|
| Partial indexes | 🔲 | Predicate-scoped index membership and matching rules. |
| Expression indexes | 🔲 | Stable expression identity/evaluation semantics before planner use. |
| `INCLUDE` / covering index syntax and index-only scans | 🔲 | Separate key columns from payload columns and prove visibility semantics for base-row-free reads. |
| Richer collation and operator semantics | 🔲 | Expand beyond the deliberately small 0.3 ordered-key contract. |
| PostgreSQL index catalog and DDL compatibility | 🔲 | Broader `pg_catalog` exposure and compatible index options/concurrent-build behavior where honestly supportable. |

---

## Phase 2.0 — Distributed Execution Platform

*"The long-term vision: database + compute + service platform."*

### 1. Multi-Stage Distributed Plans

| Item | Roadmap state |
|------|--------|
| Distributed query planner | ✅ |
| Parallel coordinator | ✅ |
| Merge engine | ✅ |
| Strategy selector | ✅ |
| Plan diagnostics | ✅ |
| Multi-stage plans | 🔲 |
| Cost-based optimizer | 🔲 |
| Statistics and cardinality estimates | 🔲 |
| Cost-based index selection | 🔲 |
| Index intersection / union and bitmap-style access plans | 🔲 |
| Query hints | 🔲 |
| Index recommendation / advisor tooling | 🔲 |

The 0.3 planner contract remains deterministic and semantically conservative.
This phase is where multiple valid access paths may be costed, combined, or
recommended based on statistics rather than expanding 0.3 into optimizer
research.

### 2. Advanced Runtime Services

| Item | Roadmap state | Scope notes |
|------|--------|-------|
| OCI container runtime | 🔧 | Process-isolated execution for container-packaged services. Align active work with `architecture/lagrange-service-registry.md`, `architecture/lagrange-service-manifest.md`, and `solve/specs/activation-cost-aware-placement/` |
| OCI artifact fetch and extraction | 🔲 | Shared prerequisite: pull OCI artifacts, route by `media_type` to WASM or container activation |
| Artifact media type discrimination | 🔲 | Distinguish WASM binary vs container image in OCI artifacts |
| Activation-cost-aware placement | 🔲 | Image presence tracking, activation class taxonomy, placement scoring, admission gating, workflow step, readiness dimension, developer feedback CLI/SQL. Spec: `solve/specs/activation-cost-aware-placement/`. |
| Vector search service | 🔲 | Specialized search family, intentionally separate from the ordinary 0.3 ordered-index contract. |
| Full-text search service | 🔲 | Specialized search semantics/storage rather than a required 0.3 B-tree variant. |
| Spatial search/index service | 🔲 | Specialized geometry/index semantics rather than a required 0.3 B-tree variant. |
| Embedding service | 🔲 | |

Note: `native_js` is kernel-internal only. User-installable services
use `wasm_component` or `oci_container`, both packaged as OCI artifacts.

### 3. External Kernel Platform API

Phase 1.0 establishes the internal substrate for first-party system services.
This phase externalizes that substrate into a small, stable API surface for
installable replicated services.

Rows in this section are design-preparation scoped until each item is backed by
a linked architecture or spec document that defines the contract boundary well
enough for direct implementation tasks; Phase 0 has landed.

#### Phase 0 — Minimal Deployment Surface

| Id | Item | Roadmap state | Scope notes |
|----|------|--------|-------|
| RM-2.0-minimal-deployment-surface | Unified artifact / binding / cell deployment surface | ✅ | Landed: content-addressed schema-v3 Artifacts, immutable schema-v2 Bindings (`on <source> run <export>`) for all seven sources, direct runtime access policy, and reconciled ready/running Cells on the existing runtime-service substrate. Request routing is landed; non-request invocation and optional actor-key routing are separate follow-ons. Contract: `architecture/minimal-deployment-surface.md`; decision trail: `solve/epics/minimal-deployment-surface.md`. |
| — | Keyed invocation routing | 🔲 | Transport-owned canonical actor-key extraction plus transport-neutral rendezvous assignment inside `RequestBindingRouteResolver`; strict single ownership requires a separate fixed-shard/epoch contract. Spec: `solve/specs/request-invocation-partitioning/`. |
| — | Generic Cell request continuity and failover | 🔲 | Ready-actual replacement, route continuity, receiver revalidation, durable effect deduplication, and bounded stale-route recovery. OCI portability consumes this proof rather than owning a second continuity mechanism. Spec: `solve/specs/request-invocation-partitioning/`. |
| — | Non-request source invocation | 🔲 | Activate CDC, timer, once, boot, call, and pushdown execution one source at a time through the existing desired-state, Cell, dispatcher, and runtime owners; placement alone is not invocation proof. Plan: `solve/epics/minimal-deployment-surface.md`. |

#### Phase A — Stable External Service Contract

| Item | Roadmap state | Scope notes |
|------|--------|-------|
| Stable manifest registration contract | 🔲 | Versioned external contract for identity, runtime, capabilities, compatibility |
| Stable service lifecycle API | 🔲 | Supported install/start/stop/upgrade hooks for third-party services |
| Stable replicated service state API | 🔲 | Versioned service-owned state contract |
| Stable CDC subscription API | 🔲 | Supported table change streams for external services |
| Stable admin surface registration | 🔲 | Supported SQL/CLI/HTTP command registration contract |
| Stable capability model | 🔲 | Public capability taxonomy and enforcement contract |

#### Phase B — Advanced External Service APIs

| Item | Roadmap state | Scope notes |
|------|--------|-------|
| Upgrade / rollout API | 🔲 | Rolling, canary, all-at-once strategies |
| External topology API | 🔲 | Supported node, partition, and leader introspection for installable services |
| External event emission API | 🔲 | Public structured events contract from kernel and services |

### 4. Installable Service Ecosystem

Builds on the earlier first-party service substrate. Focus here is artifact
distribution, operator UX, and external installability at scale.

This section is not ready for direct task creation from row title alone. Each
broad row must first gain a linked spec or architecture note that defines the
operator flow, desired durable state, and success criteria for the active slice.

#### Artifact and Package Registry

| Item | Roadmap state | Scope notes |
|------|--------|-------|
| OCI artifact transport | 🔲 | Canonical and only artifact distribution format; all runtime kinds packaged as OCI |
| Registry configuration (`add` / `list` / `remove`) | 🔲 | Multiple registries with priority and auth |
| Local artifact path (dev-install) | 🔲 | OCI-compatible local directory layout for fast development |
| Trust and verification (digest, signature) | 🔲 | Artifact and manifest integrity checks |

#### Manifest and Install UX

| Item | Roadmap state | Scope notes |
|------|--------|-------|
| Configuration schema support | 🔲 | JSON Schema for service config contracts |
| Upgrade strategy declaration | 🔲 | Rolling, canary, all-at-once in manifest |
| Health and probe definitions | 🔲 | Startup, readiness, liveness probes |
| Dependency declaration | 🔲 | Service and kernel feature dependencies |
| Media type / artifact kind discrimination | 🔲 | Manifest `artifact.media_type` routes WASM binary vs container image activation |
| Install lifecycle (discover → resolve → validate → record → reconcile → observe) | 🔲 | Declarative desired-state convergence |
| Remove lifecycle | 🔲 | Drain, stop, cleanup per policy |
| Upgrade lifecycle with rollback | 🔲 | Versioned revisions, rollback to prior known-good |
| Failure recording and queryability | 🔲 | Structured durable failure state |

#### SQL / CLI Surface

| Item | Roadmap state | Scope notes |
|------|--------|-------|
| `INSTALL SERVICE` / `REMOVE SERVICE` / `UPGRADE SERVICE` SQL | 🔲 | Service lifecycle as first-class cluster operations |
| `SHOW SERVICES` / `SHOW SERVICE REVISIONS` / `SHOW SERVICE INSTANCES` SQL | 🔲 | Observability via SQL |
| `lagrange service install` / `upgrade` / `remove` / `list` / `status` CLI | 🔲 | CLI equivalents |
| `lagrange registry add` / `list` CLI | 🔲 | Registry management |

---

## Long-Term Vision

Lagrange evolves toward a unified platform where data, computation, and
coordination live in the same system:

> Distributed database + distributed compute + programmable data locality +
> distributed service platform

### Native Artifact Store

| Item | Roadmap state | Scope notes |
|------|--------|-------|
| Artifact metadata tables (`artifacts`, `artifact_versions`, `artifact_objects`) | 🔲 | CDC-propagated system tables for artifact identity, versioning, and object tracking |
| Blob-class chunk storage | 🔲 | Content-addressed immutable chunks in dedicated partitions with blob-optimized policies |
| Artifact service (`sys-artifact-store`) | 🔲 | Built-in replicated system service owning publish, lookup, streaming, GC, and policy |
| Chunk streaming via message group transport | 🔲 | Internal distribution of artifact bytes without external registry dependency |
| Local chunk cache per node | 🔲 | Filesystem cache with integration into `node_image_presence` tracking |
| Internal-source preference in `OciPullService` | 🔲 | Prefer internal chunk streaming over external registry pulls |
| Reference-counted GC | 🔲 | Content-addressed deduplication with reference counting for safe cleanup |
| OCI Distribution API compatibility | 🔲 | Optional: expose OCI-compatible pull API so external tools can interact with the cluster as a registry |

Planning design: `solve/specs/native-artifact-store/design.md`

Design principle: same cluster, same nodes, same replication — different
object semantics for artifact bytes. No special registry nodes required.
Artifact chunks are just another replicated system-managed dataset spread
across the cluster according to policy.
