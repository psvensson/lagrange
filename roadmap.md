# Lagrange AGPL Roadmap

This document is the implementation roadmap for the AGPL repository.

Only items in this file may be used to create specs, tasks, or code changes in
this repository.

Cross-edition product status lives in `product-roadmap.md`.
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

Broad rows may guide implementation only when they are paired with a linked spec
or architecture document that makes the intended scope concrete.

## Status Legend

| Symbol | Meaning      |
|--------|--------------|
| ✅     | Done         |
| 🔧     | In Progress  |
| 🔲     | Not Started  |

For Phase 0.1 closure, status is split when runtime proof matters:

1. `Capability Exists` means the implementation or guardrail exists.
2. `Representative Gate Green` means the current representative proof for that
   capability is green and not contradicted by an active sprint/package.

---

## Phase 0.1 — Internal Coherence

*"The system behaves predictably under stress."*

Finishing the core database invariants. The foundations are strong: Raft
partition groups, CDC propagation, deterministic control-plane workflows, and
system-table cache. Before productization, a few foundational capabilities must
be completed.

### 0.1 Status Rebaseline

Phase 0.1 is capability-complete in several areas, but not exit-complete.
Representative gate status is the current source of truth for closure.

Open exit blockers as of April 26, 2026:

| Exit area | Capability Exists | Representative Gate Green | Current blocker |
|-----------|-------------------|---------------------------|-----------------|
| Rolling restart under load | ✅ | 🔧 | `rolling-restart` remains the active representative gate in `work/sprints/active-2026-q2-publication-scoped-consistency-and-node-join-closure.md` |
| Priority recovery progress under load | ✅ | 🔧 | Missing-operation and stale ACK blockers migrated; `work/packages/active-20260426-publication-recovery-machine-spec-and-preflight-verification.md` owns the current missing-published active-node / heartbeat-status revival blocker |
| Metadata gateway and owner-ingress audit | ✅ | ✅ | `npm run test:metadata-gateway:audit` passed on April 26, 2026 |
| Decision-boundary guardrail | ✅ | ✅ | `npm run audit:guideline:decision-boundaries` passed on April 26, 2026 |
| Literal-owner guardrail | ✅ | ✅ | `npm run audit:guideline:literals` passed on April 26, 2026 with 0 new violations against the 6285-entry inherited baseline |

### 0.1a. Topology Workflow Stabilization (March 2026)

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

### 1. Distributed Transactions

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

Goal achieved: multi-partition transactions with snapshot isolation and
deterministic recovery/timeout handling.

### 2. Schema Migration Workflow

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

### 3. Operational Visibility

| Item | Status |
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

| Item | Capability Exists | Representative Gate Green | Notes |
|------|-------------------|---------------------------|-------|
| Distributed test harness | ✅ | ✅ | Harness exists and remains the proof surface |
| Node failure tests | ✅ | ✅ | No active blocker contradicts this row |
| Network partition tests | ✅ | ✅ | No active blocker contradicts this row |
| Rolling restart tests | ✅ | 🔧 | Current representative gate is still failing under load |
| Node join under load | ✅ | ✅ | Historical representative proof exists |
| Seed restart under load | ✅ | ✅ | No active blocker contradicts this row |
| Sustained throughput tests | ✅ | 🔧 | Load-pressure behavior is still implicated by `rolling-restart` |
| Write visibility tests | ✅ | ✅ | No active blocker contradicts this row |
| WASM service failover | ✅ | ✅ | No active blocker contradicts this row |
| Partition kill/heal | ✅ | ✅ | No active blocker contradicts this row |
| 7-node stress scenarios | ✅ | 🔧 | Matrix re-entry waits on the current `rolling-restart` gate |
| Postgres baseline comparison | ✅ | ✅ | No active blocker contradicts this row |
| Invariant engine | ✅ | ✅ | Existing proof surface remains valid |
| Disk full simulation | ✅ | ✅ | No active blocker contradicts this row |
| Slow follower simulation | ✅ | ✅ | No active blocker contradicts this row |
| In-cluster chaos injection | ✅ | ✅ | No active blocker contradicts this row |

### Phase 0.1 Exit Criteria

The system survives node failure, replica movement, rebalancing, and
transaction retries without manual intervention.

Exit remains open until the representative gate rows above are green or each
remaining failure is moved into a narrower active blocker package with an
explicit owner boundary and static drift ledger.

---

## Phase 0.5 — External Usability

Focus shifts to developer experience.

### 1. Cluster Deployment Experience

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
| Kubernetes Helm chart | 🔧 |

`Kubernetes Helm chart` is the active row in this section. Further
implementation work stays tied to a deployment description that covers values
surface, networking, storage, bootstrap flow, and upgrade behavior before more
task expansion begins.

### 2. Developer Workflow

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

### 3. Service Development Inner Loop

Fast iteration for service authors. The goal is that the path from "I
changed a line" to "I can test it in the cluster" stays under a few
seconds for WASM services and under a minute for OCI containers.

| Item | Status | Notes |
|------|--------|-------|
| `lagrange service dev-install` zero-ceremony path | 🔲 | Point at local dir, CLI wraps in OCI layout, installs without registry push or full manifest |
| `lagrange service init` scaffold | 🔲 | Generate minimal manifest + project structure for new services |
| WASM hot reload in dev mode | 🔲 | File watcher detects changes, rebuilds module, swaps in running cluster without full install cycle |
| Dev-mode manifest defaults | 🔲 | Minimal required fields for local development; full manifest only required for registry publish |
| In-process WASM debugging preserved | ✅ | DAP, breakpoints, DWARF, snapshots, replay all work because `wasm_component` loads in-process regardless of OCI packaging |
| OCI container dev logging | 🔲 | Structured log tailing for container-runtime services during development |
| Service dev example walkthrough | 🔲 | End-to-end example: create, dev-install, iterate, debug, publish |

### 4. Debugging Tools

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

| Item | Status | Notes |
|------|--------|-------|
| Unified service lifecycle | ✅ | `ServiceLifecycleManager` + `ServiceReconciler` + `ServiceDispatcher` |
| Built-in runtime services | ✅ | `sys-postgres-wire`, `sys-admin-meta`, `sys-wasm-meta` run on the service substrate |
| `native_js` runtime | ✅ | Active runtime for first-party system services |
| `wasm_component` runtime | ✅ | Available runtime for replicated services |
| Service manifest schema definition | 🔲 | Identity, runtime, capabilities, compatibility. Architecture: `architecture/lagrange-service-manifest.md` |
| Manifest validation rules | 🔲 | Required fields, format and capability validation. Architecture: `architecture/lagrange-service-manifest.md` |
| Service catalog system tables | 🔲 | Desired/actual installed-service state and failure recording. Architecture: `architecture/lagrange-service-registry.md` |
| Installation reconciler | 🔲 | Fetch/validate/place/start-stop convergence for service revisions. Architecture: `architecture/lagrange-service-registry.md` |
| Service lifecycle API | 🔲 | `onInstall`, `onStart`, `onStop`, `onUpgrade`, `onUninstall`. Architecture: `architecture/lagrange-kernel-platform-api-v0.md` |
| Replicated service state API | 🔲 | Stable service-owned state surface above replicated storage. Architecture: `architecture/lagrange-kernel-platform-api-v0.md` |
| CDC subscription API | 🔲 | Change-stream consumption for service workflows. Architecture: `architecture/lagrange-kernel-platform-api-v0.md` |
| Admin surface registration | 🔲 | Services register SQL/CLI/HTTP control surfaces. Architecture: `architecture/lagrange-kernel-platform-api-v0.md` |
| Capability enforcement | 🔲 | Kernel gates service access to privileged APIs. Architecture: `architecture/lagrange-kernel-platform-api-v0.md` |
| Consistent snapshot API | 🔲 | Required for cluster-consistent reads and service barriers. Architecture: `architecture/lagrange-kernel-platform-api-v0.md` |
| Topology API | 🔲 | Required for service placement and orchestration. Architecture: `architecture/lagrange-kernel-platform-api-v0.md` |
| Event emission API | 🔲 | Structured progress and failure reporting for system services. Architecture: `architecture/lagrange-kernel-platform-api-v0.md` |

### 2. PostgreSQL Compatibility

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

### 3. Production Guarantees

| Item | Status | Notes |
|------|--------|-------|
| Replica count guarantees | ✅ | |
| Replica recovery | ✅ | |
| Failure detection | ✅ | |
| Node reintegration | ✅ | |
| Failover SLO definition | 🔲 | Requires a dedicated spec defining metric, measurement window, reporting surface, and test gate before implementation starts |
| Durability SLO definition | 🔲 | Requires a dedicated spec defining durability target, failure envelope, reporting surface, and test gate before implementation starts |

---

## Phase 2.0 — Distributed Execution Platform

*"The long-term vision: database + compute + service platform."*

### 1. Multi-Stage Distributed Plans

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

### 2. Advanced Runtime Services

| Item | Status | Notes |
|------|--------|-------|
| OCI container runtime | 🔧 | Process-isolated execution for container-packaged services. Align active work with `architecture/lagrange-service-registry.md`, `architecture/lagrange-service-manifest.md`, and `.kiro/specs/activation-cost-aware-placement/` |
| OCI artifact fetch and extraction | 🔲 | Shared prerequisite: pull OCI artifacts, route by `media_type` to WASM or container activation |
| Artifact media type discrimination | 🔲 | Distinguish WASM binary vs container image in OCI artifacts |
| Activation-cost-aware placement | 🔲 | Image presence tracking, activation class taxonomy, placement scoring, admission gating, workflow step, readiness dimension, developer feedback CLI/SQL. Spec: `.kiro/specs/activation-cost-aware-placement/`. Architecture: `architecture/future/activation-cost-aware-placement.md` |
| Vector search service | 🔲 | |
| Embedding service | 🔲 | |

Note: `native_js` is kernel-internal only. User-installable services
use `wasm_component` or `oci_container`, both packaged as OCI artifacts.

### 3. External Kernel Platform API

Phase 1.0 establishes the internal substrate for first-party system services.
This phase externalizes that substrate into a small, stable API surface for
installable replicated services.

Rows in this section are design-preparation scoped until each item is backed by
a linked architecture or spec document that defines the contract boundary well
enough for direct implementation tasks.

#### Phase A — Stable External Service Contract

| Item | Status | Notes |
|------|--------|-------|
| Stable manifest registration contract | 🔲 | Versioned external contract for identity, runtime, capabilities, compatibility |
| Stable service lifecycle API | 🔲 | Supported install/start/stop/upgrade hooks for third-party services |
| Stable replicated service state API | 🔲 | Versioned service-owned state contract |
| Stable CDC subscription API | 🔲 | Supported table change streams for external services |
| Stable admin surface registration | 🔲 | Supported SQL/CLI/HTTP command registration contract |
| Stable capability model | 🔲 | Public capability taxonomy and enforcement contract |

#### Phase B — Advanced External Service APIs

| Item | Status | Notes |
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

| Item | Status | Notes |
|------|--------|-------|
| OCI artifact transport | 🔲 | Canonical and only artifact distribution format; all runtime kinds packaged as OCI |
| Registry configuration (`add` / `list` / `remove`) | 🔲 | Multiple registries with priority and auth |
| Local artifact path (dev-install) | 🔲 | OCI-compatible local directory layout for fast development |
| Trust and verification (digest, signature) | 🔲 | Artifact and manifest integrity checks |

#### Manifest and Install UX

| Item | Status | Notes |
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

| Item | Status | Notes |
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

| Item | Status | Notes |
|------|--------|-------|
| Artifact metadata tables (`artifacts`, `artifact_versions`, `artifact_objects`) | 🔲 | CDC-propagated system tables for artifact identity, versioning, and object tracking |
| Blob-class chunk storage | 🔲 | Content-addressed immutable chunks in dedicated partitions with blob-optimized policies |
| Artifact service (`sys-artifact-store`) | 🔲 | Built-in replicated system service owning publish, lookup, streaming, GC, and policy |
| Chunk streaming via message group transport | 🔲 | Internal distribution of artifact bytes without external registry dependency |
| Local chunk cache per node | 🔲 | Filesystem cache with integration into `node_image_presence` tracking |
| Internal-source preference in `OciPullService` | 🔲 | Prefer internal chunk streaming over external registry pulls |
| Reference-counted GC | 🔲 | Content-addressed deduplication with reference counting for safe cleanup |
| OCI Distribution API compatibility | 🔲 | Optional: expose OCI-compatible pull API so external tools can interact with the cluster as a registry |

Architecture: `architecture/future/native-artifact-store.md`

Design principle: same cluster, same nodes, same replication — different
object semantics for artifact bytes. No special registry nodes required.
Artifact chunks are just another replicated system-managed dataset spread
across the cluster according to policy.
