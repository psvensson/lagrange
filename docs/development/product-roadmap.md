---
audience: development
documentClass: planning
---

# Lagrange Product Roadmap

This is the cross-edition view of one ordered release sequence. Every future
capability below has a numbered release home. Publication and milestone acceptance
follow the preceding release. Independent bounded implementation may proceed
concurrently when consumed contracts are defined, with one writer per changing
interaction and ordered integration. A section assigns intended scope, not a
delivery date or a claim that its work is complete.

This file is visibility-only. The [AGPL feature map](agpl-feature-map.md) owns
allowed implementation scope and sequence in this repository. The
[edition matrix](../../edition-matrix.md) owns edition and implementation-home
boundaries. Pro and Enterprise implementation remains in the external commercial
repository; listing it here does not authorize implementation in the AGPL tree.

[Current capabilities and limitations](../current-capabilities-and-limitations.md)
is the checked-in support authority; [CHANGELOG.md](../../CHANGELOG.md) records
released changes. Existing components, an unmerged candidate, a passing focused
proof, a qualified release and a supported operating guarantee are distinct
states. The active epic and its original evidence establish detailed progress.
No status in this roadmap substitutes for that evidence.

## Release Sequence

| Version | Product outcome | Edition scope |
| --- | --- | --- |
| 0.3.1 | Bounded installed-product, publication and claim corrections after 0.3.0 | Community |
| 0.3.2 | Complete Queryable Core and inherited stable-core/public-service acceptance | Community |
| 0.4 | Practical service core, complete developer journey, and a qualified ordinary-SQL comparison (active milestone on main 0.4.0) | Community |
| 0.5 | Pilot-ready security, deployment and operations | Community |
| 0.6 | Safe managed OCI activation and native Call Cells | Community |
| 0.7 | Transport independence, NATS-only operation and effective static timing | Community |
| 0.8 | Veilid-only cluster operation | Community |
| 0.9 | Complete installable-service lifecycle, diagnostics and support | Community core; Pro/Enterprise commercial integrations |
| 1.0 | Production guarantees, global uniqueness and backup/recovery products | Community core; Pro backup/restore/PITR |
| 1.1 | Broader SQL and PostgreSQL compatibility | Community |
| 1.2 | Enterprise identity, tenancy, secrets and cross-region operation | Enterprise, external implementation |
| 2.0 | Deeper execution, optimizer, advanced artifact storage and full Scenario B | Community |
| 2.1 | Specialized search and data-local processing services | Community search substrate; AI edition remains unclassified |

The latest GitHub published release is 0.3.3, and the active development source on
main is 0.4.0 (experimental alpha). Active development works toward 0.4 milestone
acceptance (incorporating remaining 0.3.1/0.3.2 queryable-core deliverables alongside
developer-journey and measured-comparison obligations); package version 0.4.0 on
main does not imply 0.4 acceptance is complete. The standing major-feature
[user-journey rule](../../test/guidelines/release-gate.md#major-feature-user-journeys)
governs useful public outcomes; this visibility document does not certify them.

## Baseline Through 0.3.0

The earlier roadmap's completed-component inventory is retained here as the
foundation for the numbered releases. It is not blanket certification of every
listed behavior under the current backend, topology or failure schedule. Read
the current capability page before relying on a specific operation.

Credit the published 0.3.0 implementation and the Scenario A framework/runtime
corrections merged in [PR #151](https://github.com/psvensson/lagrange/pull/151).
The latter is current-main material for the next candidate. Historical branch
receipts and implemented proof-ID coverage are distinct from execution and
qualification on that candidate.

| Foundation | Existing work carried forward |
| --- | --- |
| Topology workflow ownership | Single-writer `replica_operations`, managed split ownership, internal/load readiness separation, owner-required atomic transitions, committed cache-observation boundaries and removal of owner-dependency fallbacks |
| Transaction machinery | Coordinator and participant state, enlistment, prepare/decision durability, commit/rollback, recovery, read-your-writes, conflict detection, deadlines and cleanup; remaining composed public correctness obligations close in 0.3.2 |
| Schema migrations | System schema definitions and versions, bootstrap migrations, internal ALTER TABLE, user migration workflow, dual-write compatibility, backfill, cutover, rollback, restart recovery and migration diagnostics |
| Operational visibility | Metrics, admin CLI, health probes, diagnostics APIs, `EXPLAIN DISTRIBUTED`, cluster/partition/CDC views, correlation IDs and diagnostic sampling; generic application live-query completion remains a 0.3.2 milestone |
| Failure and regression apparatus | Deterministic regression ladder, scenario SQL ownership guard, distributed harness, node/seed restart, join and failure cases, network partition, disk-full and slow-follower cases, chaos, sustained load, visibility, WASM failover, seven-node scenarios, baseline comparisons and invariant checks |
| Deployment and development substrate | Docker and Helm scaffolding, bootstrap/join/admin surfaces, programmatic runtime, iterator/stage/plan modes and manifest-based WASM deployment |
| Debugging substrate | Debug sessions, breakpoints, snapshots, DAP, DWARF mapping, replay, plan diagnostics and playback |
| Service substrate | Unified lifecycle, built-in runtime services, kernel-internal and WASM providers, immutable Artifact/Binding/Cell records and existing service SQL; managed OCI execution remains a 0.6 deliverable |
| Query execution substrate | Distributed planner, parallel coordinator, merge engine and strategy selection; SQL support is limited to the tested subset in the capability page |
| Replica-recovery substrate | raft-rs cutover, partition snapshots/catch-up, progress-proven learner promotion and existing failure detection/reintegration; snapshots are not the 1.0 backup product |

## Phase 0.3.1 - Installed-Product And Claim Corrections

The latest GitHub published release is 0.3.3, while active development on main is
0.4.0 working toward 0.4 acceptance. The existing stabilization and bounded feature
owners complete the selected correction slice. Shared setup and valid existing
evidence are reused. This release does not discharge the whole Queryable Core epic,
stabilization Q17 or the full distributed service milestone.

| Requirement | Edition | Release outcome |
| --- | --- | --- |
| Installed consumer usability | Community | Supported artifacts boot in a clean consumer environment and complete their declared SQL/restart or authoring/build/basic-deployment use, using actual artifact bytes |
| Release integrity | Community | Selected binary/npm/container corrections, current Docker Hub overview and immutable post-publication identity/content/consumer confirmation |
| Capability truth | Community | Current operational and compatibility guidance matches the measured correction scope and names unfinished behavior explicitly |
| Major-feature journey rule | Community | Existing specifications and Quest evidence show useful public outcomes; the bounded historical inventory does not turn every old capability into a new release gate |
| Selected bounded repairs | Community | Independently verified corrections may ship without claiming that their wider feature or service acceptance passed |

Missing feature journeys retain their existing owner and assigned version.
Completion claims still require the existing proof and release authorities.

## Phase 0.3.2 - Queryable Core Completion

Remaining 0.3.2 Queryable Core obligations are incorporated into the active 0.4
milestone on main. The existing Queryable Core epic owns its feature acceptance
and consumes stabilization, service and comparison evidence through their existing
owners. Credit delivered components; prove the claimed combination on one candidate.

| Requirement | Edition | Release outcome |
| --- | --- | --- |
| Inherited public SQL and transaction correctness | Community | Stabilization owners complete expression/constraint/routing/session repairs and prove admitted visibility, contention, commit/abort, restart and follower behavior; global uniqueness remains 1.0 |
| Transaction uncertainty and retry contract | Community | Preserve durable decisions, distinguish acknowledged, known-abort, outcome-unknown and recovered states, and retain the correct public retry boundary |
| Current-candidate Scenario A regression | Community | Use PR151's merged ordinary-SQL workload and runtime corrections; exercise current-core guarantees with actual semantic receipts and honest performance observations |
| Representative public WASI service | Community | Existing service owners and stabilization Q17 prove the bounded public distributed business/failure journey without importing 0.4 service expansions |
| Inherited operating acceptance | Community | Stabilization owners complete remaining internal ingress, diagnostic, queue, durable retention/replay and recovery obligations with useful progress and cleanup |
| Typed persisted keys and tuples | Community | One type-aware order, exact boundary representation, declared primary-key metadata and compound-key narrowing beyond an implicit `id` convention |
| Local ordered index DDL | Community | Ordinary and compound `CREATE INDEX` / `DROP INDEX`, with a defined B-tree family and typed refusal for unsupported kinds |
| Compound access-path semantics | Community | Correct left-prefix and equality-prefix-plus-range behavior, with explicit NULL/type/collation rules |
| Non-unique global secondary indexes | Community | Partitioned and replicated index datasets, one selected maintenance contract, resumable backfill, restart-safe lifecycle and failure state |
| Safe index reads and fallback | Community | An unavailable or insufficiently current index cannot omit valid base-table results; use the owned safe fallback when eligibility is not proven |
| Planner and catalog visibility | Community | Explain selected/rejected indexes; inspect definitions, build/backfill progress and failures through ordinary SQL/catalog surfaces |
| PostgreSQL locking reads | Community | Preserve `SELECT ... FOR UPDATE` in the canonical AST and enforce the supported fail-fast distributed reservation, cancellation, timeout, release and recovery contract; broader modes require a scope decision |
| Generic push-backed live queries | Community | Ordinary application queries, partition-scoped CDC dependencies, equivalent-interest coalescing, gap-free snapshot/frontier handoff and topology changes |
| Live-query maintenance | Community | Incremental deltas for supported plans and event-triggered re-execution/reset for other plans; idle change discovery performs no repeated data reads |

Global unique secondary indexes belong to 1.0. An optional 0.3.2 access path may
change performance but may not weaken base-table correctness. The owner contracts
remain [PostgreSQL Locking Reads](../../architecture/postgres-locking-reads.md)
and [Live Query Data Plane](../../architecture/live-query-data-plane.md).

User journeys establish actual index engagement and complete results in the same
execution, distributed locking authority, and the real SQL/CDC snapshot and
occurrence handoff. Empty live results retain future dependencies; bounded
pressure or reset/reconnect handling must restore useful results. Existing
certification and release owners accept the integrated candidate and published
consumers. Full qualified comparison remains 0.4; a current promised SQL or
transaction defect cannot be deferred as an optional benchmark improvement.

## Phase 0.4 - Practical And Demonstrated Service Core

Phase 0.4 is the active milestone for main source 0.4.0 (experimental alpha; latest
GitHub published release is 0.3.3). Package version 0.4.0 on main does not imply
0.4 acceptance is complete. This milestone incorporates developer-journey,
measured-comparison, and remaining queryable-core obligations.

| Requirement | Edition | Release outcome |
| --- | --- | --- |
| Typed per-call selector narrowing | Community | Call arguments bind declared parameter slots without arbitrary caller SQL or selector concatenation |
| Paging or streaming beyond one shard batch | Community | Explicit page identity, backpressure, budgets, cancellation/deadlines and deterministic reduction |
| Bounded structured partials | Community | Versioned canonical encoding, size limits and defined duplicate-key/merge behavior |
| Multi-operation service dispatch | Community | Default code-first output and examples expose multiple operations through the existing service owners |
| Public-path physical evidence | Community | Multi-machine WASM-over-HTTP behavior, local-data execution and reproducible resource/performance evidence |
| Complete Scenario A SQL comparison | Community | Both products satisfy the independent semantic contract; matched-budget and architecture-native accounting, open-loop latency, repeated paired runs and honest statistical results |

Scenario A measures the ordinary database cost without substituting WASM or a
custom service for SQL work. A result favoring TiDB/TiKV is valid. This release
makes the bounded service path useful; full dynamic-graph Scenario B is assigned
to 2.0 with its deeper-composition prerequisites.

## Phase 0.5 - Pilot Operations

| Requirement | Edition | Release outcome |
| --- | --- | --- |
| Core cluster security | Community | Cryptographic peer authentication and encrypted node transport, plus ingress/PG authentication, SCRAM and TLS for the selected pilot driver/network profile |
| Usable deployment | Community | Cluster init/start/join, compose and Helm paths with persistent state, readiness admission, cleanup and reproducible fresh-clone onboarding |
| Practical authoring and debugging | Community | Coherent programmatic/CLI publish, deploy and scale workflow; local OCI dev-install, scaffold/defaults and WASM hot reload; getting-started and indexed-query examples, query execution tracing and `EXPLAIN EXECUTION` |
| Recovery and log lifecycle | Community | Qualify delivered bounded-log and message-group compaction mechanisms under the declared pilot topology, load, multi-machine soak, node-loss, replica-rebuild and recovery profiles; initial bounded-log correctness obligations close in 0.3.2 |
| Data adoption | Community | Resumable load, shadowing, parity, cutover, rollback and exit tooling |
| Driver and SQL compatibility | Community | Named, tested PostgreSQL-driver/SQL matrix; unsupported authentication and SQL modes are explicit |
| Upgrade and operating envelope | Community | Supported topology/capacity bounds and executable upgrade/downgrade rehearsals for named release pairs |
| Operator view | Community | Correlated request, shard, partial, placement, retry and failure diagnostics; inspect index and live-query dependency/frontier state |

Security is required on the supported transport in 0.5. It does not wait for
NATS or Veilid. Advanced exporters and paid telemetry are assigned to 0.9;
enterprise identity and tenancy are assigned to 1.2.

At 0.5, choose the first production workload and review whether OCI and all
alternative transports must precede 1.0. Until an explicit coordinated version
reallocation changes the scope map, 0.6-0.9 retain their current homes and remain
chronological predecessors. This review alone does not accelerate 1.0.

## Phase 0.6 - Safe Managed OCI And Native Call Cells

This release establishes the minimum complete, safe runtime lifecycle consumed
by native calls. Its package, compatibility, identity and health prerequisites
are included here; 0.9 expands the customer product surface around that runtime.

| Requirement | Edition | Release outcome |
| --- | --- | --- |
| Verified managed activation | Community | Signature/digest-verified acquisition of a pinned revision, runtime/media-type discrimination, compatibility/dependency and configuration preflight, pull/create/start/inspect/stop/remove and exact-instance replacement |
| Identity and health | Community | Authenticated service/revision/Cell identity, activation leases, endpoint/log integration and readiness evidence through ordinary lifecycle owners |
| Required request continuity | Community | Provider-neutral route recovery, receiver revalidation and idempotent managed-result visibility required by native invocation; no second OCI routing/retry owner |
| Native invocation seam | Community | `ServiceRuntimeLifecycle.invoke()` dispatches to `OciContainerDriver.invoke()` through a node-local authenticated application-initiated broker stream |
| Code-first native SDK | Community | Source-level operation handles generate immutable Artifact/Binding/export identity and outbound-call authority; no closure shipping |
| Shared execution semantics | Community | Handler-originated and direct calls converge on `CallCellInvoker`, destination-local replica reads, emit/reduce, deadlines, budgets and typed outcomes |
| Native workload qualification | Community | A genuine native dependency runs across partition hosts, survives named worker loss honestly and conforms from a second materially different language/runtime |
| Fresh-clone acceptance | Community | Identity, authorization, locality, result visibility, failure negatives, teardown and documented replay/ambiguity semantics are exercised end to end |

Native process globals and loaded models are disposable cache. Exactly-once
managed-result visibility does not make arbitrary external side effects exactly
once. The contract is [Native OCI Call Cells](../../architecture/native-oci-call-cells.md).

## Phase 0.7 - Transport Independence And NATS

Complete these steps in order on an accepted stable-core baseline:

1. **N0:** finish the physical multi-host baseline, per-peer/message-class and
   pressure attribution, and desired-versus-effective timing observations.
2. **N1:** isolate the narrow peer-link interaction while preserving WebSocket
   identity, delivery, ACK/correlation, cancellation, pressure and retry semantics.
3. **NATS-only:** prove formation, SQL/services, replication, CDC, snapshot/bulk
   transfer, split/merge, restart, broker loss and seed loss with direct inter-node
   WebSocket paths disabled.
4. **Effective static timing:** prove that declared Raft profiles control actual
   behavior and remain correct within their measured latency/pressure envelopes.

All four are Community scope. `MessageRouter` retains semantic authority; a
transport adapter owns physical framing and link behavior. Component tests on
two workers do not certify a three-host network. Dynamic timing adaptation and
optional mixed-transport policy are assigned to 2.0.

## Phase 0.8 - Veilid-Only Cluster Operation

Community scope: the complete cluster workload operates over Veilid alone,
including bounded frame/bulk transfer, private-route establishment and renewal,
backpressure, effective timing, formation, recovery and snapshot catch-up.
Acceptance disables alternate inter-node WebSocket and NATS paths. Mixed
transports are not required for correctness or availability of this mode.

This release consumes 0.7's transport and timing contracts and publishes its
measured capacity and latency envelope. It does not promise enterprise
cross-region replication, which is assigned to 1.2.

## Phase 0.9 - Installable Service Product Platform

A separately released service must install, become ready, survive restart,
expose useful diagnostics, upgrade, roll back and remove through the common
lifecycle. This is one versioned product milestone, building on 0.6.

| Requirement | Edition / implementation | Release outcome |
| --- | --- | --- |
| Stable manifest and validation contract | Community / AGPL | Versioned identity/runtime/capability/configuration, dependency and compatibility declarations, including startup/readiness/liveness probes |
| Catalog and reconciliation | Community / AGPL | Desired/actual state, immutable revisions, durable typed failures, installation reconciliation and inspectable progress |
| Complete lifecycle and rollout API | Community / AGPL | Install/start/stop/upgrade/uninstall hooks, idempotent install/status/remove, health-gated rolling/canary/all-at-once rollout and rollback |
| Stable service APIs | Community / AGPL | Replicated service state, supported CDC subscriptions, admin surface registration, capability enforcement, topology introspection and structured event emission |
| Registry and acquisition UX | Community / AGPL | Complete OCI registry add/list/remove with priority/auth, digest/signature trust, mirrored and air-gapped operation, consuming the 0.5 development-install path and 0.6 verified acquisition |
| SQL and CLI operations | Community / AGPL | Service install/upgrade/remove/list/status, service revision/instance views and registry management through the normal public surfaces |
| Diagnostics and support | Community / AGPL | Health/metrics contributions, bounded customer-inspectable support bundles and explicit secret/payload redaction |
| Telemetry contributions | Community / AGPL | Customer-controlled export plumbing, separate from licensing and entitlement validity |
| Advanced observability | Pro / External commercial | Prometheus export, OpenTelemetry tracing, partition heatmaps and advanced runtime traces |
| Entitlement and edition controls | Pro/Enterprise / External commercial | Offline-capable signed entitlement assertions, edition requirements, activation checks and safe typed grace/expiry behavior |
| Commercial provider integration contracts | Community seams; external commercial providers | Defined capability discovery and secret-reference/policy integration; unavailable paid providers fail explicitly rather than being presumed implemented |

The complete enterprise identity/policy/secrets providers remain 1.2 work.
0.9 mirroring and air-gapped use can consume ordinary registries; the advanced
in-cluster native artifact store is assigned to 2.0. A real separately released
service is the acceptance consumer; Lagrange AI is a possible consumer only
within its eventual edition classification.

## Phase 1.0 - Production Guarantees

| Requirement | Edition / implementation | Release outcome |
| --- | --- | --- |
| Supported operational guarantees | Community / AGPL | Named durability, availability, consistency, failover, recovery and topology-convergence contracts on measured hardware/workloads |
| Capacity and placement guarantees | Community / AGPL | Supported data-plane scale, bounded queues/resources, feasibility-qualified placement balance and large-scale certification |
| Recovery and log guarantees | Community / AGPL | Qualified checkpoint, snapshot transfer/install, compaction/retention and restart/rebuild behavior, including acknowledged-write reconciliation |
| Stable compatibility policies | Community / AGPL | SQL/service/driver, upgrade/downgrade and supported transport-profile contracts |
| Global unique indexes | Community / AGPL | Synchronous transactional index maintenance participates in commit correctness and enforces global uniqueness |
| Production index guarantees | Community / AGPL | Supported NULL/type/collation contract, rebuild/backfill under failure, write amplification and recovery/pressure bounds |
| Consistent snapshot service API | Community / AGPL | Cluster-consistent barriers and snapshot contracts consumed by recovery products |
| Backup, restore and PITR | Pro / External commercial | External storage, incremental backup, restore into existing/new clusters, point-in-time recovery and measured disaster-recovery RPO/RTO |
| Supported installed services | Community core; commercial products externally | Production security, compatibility, diagnostics, upgrade/rollback and operating guarantees over the 0.9 lifecycle |

Replica snapshots remain distinct from customer backups. A support statement
names its edition, tested configuration, failure envelope and original evidence.

## Phase 1.1 - SQL Breadth And PostgreSQL Compatibility

Community scope follows the 0.3.2 access-path foundation and 1.0 invariants:

- partial and expression indexes;
- `INCLUDE` / covering-index syntax and index-only scans;
- richer collation and operator semantics;
- broader PostgreSQL index catalog and DDL compatibility, including concurrent
  builds where the guarantees can be preserved;
- broader `information_schema` and `pg_catalog` compatibility;
- window functions, sequences and other explicitly tested relational conveniences.

## Phase 1.2 - Enterprise Operations

These are Enterprise features implemented in the external commercial repository.
The AGPL implementation home and the security floor of earlier releases do not
change.

| Requirement | Release outcome |
| --- | --- |
| Enterprise identity and policy | Enterprise authentication/SSO integrations, RBAC, audit policy and a supported policy-provider API |
| Tenancy | Tenant context propagation, isolation, resource quotas and policy-controlled placement |
| Secrets and encryption | Cluster-resolved external references, credentials, secrets/KMS integrations and encryption-at-rest controls |
| Cross-region operation | Supported replication, durability/failover, data-sovereignty and latency contracts with measured failure/recovery evidence |
| Compliance surfaces | Commercial operational and audit controls for the declared tenancy and deployment model |

## Phase 2.0 - Deeper Distributed Execution

| Requirement | Edition | Release outcome |
| --- | --- | --- |
| Multi-stage execution | Community | Deeper data-dependent call composition, streaming exchange/backpressure, concurrent Cell invocation and planner-initiated pushdown |
| Expanded SDK and runtime placement | Community | Richer typed handles across WASM/native providers, additional host providers and activation/image/warm-cache/locality cost modeling without new scheduling authority |
| Advanced invocation sources | Community | Keyed actor routing and the remaining change/time/once/boot/pushdown sources through existing Cell owners; basic named calls remain established by earlier releases |
| Optimizer | Community | Statistics, cardinality estimates, cost-based index choice, intersection/union/bitmap access plans, hints and index recommendation tools |
| Full Scenario B architecture comparison | Community | Local-only, one-remote, sequential and fan-out graphs, controlled topology cost and movement, strong valid TiDB/TiKV implementations, independent oracle and repeated paired evidence |
| Advanced network policy | Community | Optional mixed transports and dynamic per-group timing adaptation, each preserving the standalone transport contracts and measured authority boundaries |
| Native artifact store | Community | Artifact metadata/version/object tables, immutable blob chunks, replicated `sys-artifact-store`, bounded streaming, node-local cache, internal acquisition preference and reference-counted GC |
| Native registry interoperability | Community | Optional OCI Distribution API over the native artifact store, with ordinary OCI identity and trust semantics |

Scenario B's full graph ladder depends on this release's deeper composition.
The initial comparison uses immutable preloaded histories and a single region
before controlled latency experiments. Earlier limited demonstrations do not
complete this milestone. The artifact store extends distribution of immutable
bytes; it does not create a second service lifecycle.

## Phase 2.1 - Specialized Search And Data-Local Processing

| Requirement | Edition / implementation | Release outcome |
| --- | --- | --- |
| Vector, full-text and spatial search | Community substrate / AGPL | Separate specialized access paths or services with their own semantics and storage contracts |
| Embedding service | Community substrate / AGPL | A specialized service workload consuming the ordinary installation and runtime contracts |
| Local summarization | TBD / not yet classified | Version home is 2.1; implementation waits for an explicit edition and implementation-home decision |
| Local anomaly detection | TBD / not yet classified | Version home is 2.1; implementation waits for an explicit edition and implementation-home decision |
| Local semantic filtering | TBD / not yet classified | Version home is 2.1; implementation waits for an explicit edition and implementation-home decision |

Specialized search is separate from the ordered B-tree family. Assigning an AI
feature to 2.1 does not classify its edition or authorize it in the AGPL repo.
