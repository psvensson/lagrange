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

## Version Sequence

Publication and milestone acceptance follow one ordered sequence after the
published 0.3.0 baseline:

`0.3.1 -> 0.3.2 -> 0.4 -> 0.5 -> 0.6 -> 0.7 -> 0.8 -> 0.9 -> 1.0 -> 1.1 -> 1.2 -> 2.0 -> 2.1`

Every planned feature has one primary version home below. Earlier capabilities
are prerequisites reused by later milestones. Phase 0.1 and Phase 0.2 retain
historical foundation scope; they are not open-ended feature backlogs.
Phase 1.2 is an explicit external-edition milestone and authorizes no paid
implementation in this repository. Version placement is delivery order, not a
calendar promise, runtime claim or Quest completion receipt.

The former future 0.2.9 is retired. Its stable row IDs remain below under their
current 0.3.1 or 0.3.2 allocation. The existing stabilization and Queryable Core
epics retain their identities and acceptance ownership; publication of 0.3.0
does not discharge unfinished axes or historical seals.

Independent bounded implementation, including 0.4 and 0.5 work, may proceed
concurrently when consumed contracts are defined. One writer owns each changing
interaction, dependent changes integrate in order, and the release candidate
proves their composition. Early implementation neither advances milestone
acceptance nor creates a separate release track. Major product capability
acceptance follows the existing testing owner's
[user-journey rule](../../test/guidelines/release-gate.md#major-feature-user-journeys).

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
putting that id in its `links.roadmapRow` or citing the epic's `roadmapRow`.
`npm run audit:roadmap-authority` checks these scope references; the Solver board
shows the work advancing them.

Two rules keep the ids durable:

- **Slugs, never positions.** The id encodes the phase and a topic slug, not a row
  number, so inserting or reordering rows never renumbers existing ids (the
  positional-renumbering trap that breaks rule-id and CL citations). A row keeps
  its id for life; a removed row's id is retired, not reused.
- **Added on first link, not all at once.** A table gains the `Id` column when one
  of its rows first becomes a Quest link target. Tables without active Quest links
  may omit the column until they need it; this is intentional, not drift.

When a feature moves to an earlier delivery milestone, its existing row ID is
preserved. The containing milestone supplies the current version assignment;
the version-shaped ID prefix records its original identity. In particular,
`RM-2.0-minimal-deployment-surface` remains the historical ID for the substrate
consumed by 0.6. New work must not infer delivery order from an ID prefix.

This roadmap still does not certify proof; for an id'd row in flight, the live
status is the linked Quest record and retained evidence, not the row's symbol.

## Live Truth Pointers

Use these documents for mutable execution and readiness state:

| Question | Source of truth |
| --- | --- |
| Open epics and Quests | `node scripts/solve.js board` |
| Current milestone, integration owner, first blocker and next action | The active epic's current summary, linked to Quest records and receipts |
| A Quest's latest measured acceptance | `node scripts/solve.js probe --id <id>` |
| Durable attempts, findings, verifications and terminal state | `solve/quests/<id>/log.ndjson` |
| Authored statement, sealed acceptance and constraints | `solve/quests/<id>/quest.json` |
| Historical packages and sprint material | Git history and retained Solver evidence; not current instructions |

---

## Phase 0.1 — Internal Coherence

*"The system behaves predictably under stress."*

Historical foundation scope: Raft partition groups, CDC propagation,
deterministic control-plane workflows and the system-table cache. The rows
retain their original scope; current support and later release acceptance are
owned by the capability document and release evidence.

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
| Prepare phase | ✅ | Real `PARTICIPANT_PREPARE` dispatch + participant conflict checks |
| Prepared-state durability | ✅ | `PARTICIPANT_PREPARE` and `PARTICIPANT_DECISION` replicated in participant Raft log |
| Commit phase | ✅ | Commit decision persisted before participant fanout |
| Rollback | ✅ | Cross-partition rollback with idempotent participant handling |
| Coordinator recovery | ✅ | Status-driven replay to terminal state after restart |
| Read-your-own-writes isolation | ✅ | Session staged read-your-own-writes over current committed state |
| Write conflict detection | ✅ | Partition-write-generation first-committer-wins conflict detection at prepare and apply |
| Timeout and cleanup | ✅ | Budget-based abort + persisted deadline coordinator rollback + recovery sweep |

Original component scope: multi-partition coordination, session staged
read-your-own-writes, partition-write-generation conflict detection and
recovery/timeout machinery. Current public transaction behavior and remaining
composed evidence are reconciled in 0.3.2.

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
| Cache-backed live query subscriptions | ✅ |
| EXPLAIN DISTRIBUTED | ✅ |
| Cluster SQL diagnostics | ✅ |
| Partition diagnostics | ✅ |
| CDC diagnostics | ✅ |

The existing live-subscription row covers the cache-backed observation surface.
Generic application-table live queries have their own Phase 0.3.2 row.

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

## Phase 0.2 — Released Stable-Core Foundation

*"A narrow, credible release of the core cluster."*

This section preserves the scope of the earlier 0.2 release foundation.
Released changes are recorded in `CHANGELOG.md`; residual stabilization belongs
to 0.3.1/0.3.2 as allocated below, useful service expansion to 0.4, and managed
OCI execution to 0.6.

| Id | Item | Roadmap state | Scope notes |
|----|------|---------------|-------------|
| `RM-0.2-five-node-convergence` | Five-node cold formation and runtime-service initial placement | ✅ | Formation, table creation, and initial service placement complete without stalled control-plane or service operations |
| `RM-0.2-topology-safety` | Topology-operation safety closure | ✅ | Authoritative operation-ledger release, safe surplus removal, and ready-lease candidate admission retain their safety invariants |
| `RM-0.2-snapshot-integration` | Compacted-follower snapshot catch-up integration | ✅ | Automatic `raft-rs` partition snapshot cadence, retention sweep, `_raft_rs_log` compaction (`SN1`), and follower catch-up landed in `0.2.6`; subsequent retention corrections belong to 0.3.2, pilot log/recovery qualification to 0.5, and customer backup/PITR to the external 1.0 product |
| `RM-0.2-release-verification` | Core release verification | ✅ | Historical release checks include the tagged but unpublished `0.2.0` candidate and published `0.2.5`/`0.2.6` releases, as recorded in `CHANGELOG.md`; each current release claim still requires its own exact-candidate evidence |

### Phase 0.2 Exit Criteria

- The representative cold five-node workload completes three consecutive runs
  without a formation, table-readiness, or initial-service-placement stall.
- The topology safety cases linked to the release scope have terminal evidence.
- Compacted-follower snapshot catch-up is integrated and independently
  verified.
- An enforcing memory-soak run reports sufficient samples and no detected leak.
- Required CI and release checks are green, and remaining limitations are
  documented.

Automatic `raft-rs` partition snapshot cadence, retention sweep, `_raft_rs_log`
compaction (`SN1`), and follower catch-up shipped in `0.2.6`, while
the remaining bounded-log corrections are assigned to 0.3.2 and pilot-scale
log/recovery qualification to 0.5. Customer backup/PITR is an external 1.0
product. The existing bounded distributed service journey is consumed by 0.3.2;
service expansion and qualified multi-machine comparison belong to 0.4, OCI
execution to 0.6, and advanced automatic data-affinity/cost-aware placement to 2.0.

Phase 0.5 deployment CLI, Docker Compose, WASM CLI, and onboarding work is not
part of the 0.2 release gate.

---

## Released 0.3.0 — Implementation Baseline

Credit the released 0.3.0 implementation and PR #151's merged Scenario A
framework/runtime corrections when assigning remaining work. Release history is
in `CHANGELOG.md`; exact-candidate acceptance remains with the existing proof
owners. Historical branch execution and implemented proof-ID coverage do not
certify the merged candidate. Planned rows below describe remaining completion
scope, not a finding that every underlying component is absent.

## Phase 0.3.1 — Installed-Product And Claim Corrections

Complete the selected installed-startup, artifact/publication and truthful-claim
corrections through the existing stabilization and bounded feature owners. Adopt
the standing major-feature user-journey rule through its testing owner and
reconcile the advertised capability inventory using existing records. This
bounded reconciliation does not make every historical capability a new gate.

| Id | Item | Roadmap state | Scope notes |
|----|------|---------------|-------------|
| RM-0.2.9-published-operating-contract | Usable artifacts and exact-candidate operating contract | 🔲 | Bounded installed-startup/artifact/publication corrections, genuine supported-use consumer checks and accurate read/transaction/retry/recovery declarations. Existing owner: `solve/epics/release-0-2-7-stabilization.md`. Full composed stable-core and service acceptance remains 0.3.2; no new service-envelope features are included. |

### Phase 0.3.1 Exit Criteria

The selected correction scope passes through actual supported distributions,
public claims match the measured envelope, and existing publication/consumer
requirements are satisfied. Independently proved bounded feature corrections
may ship here. The remaining Queryable Core axes, full distributed service
journey and inherited stable-core obligations stay open for 0.3.2. This release
does not discharge all of stabilization Q17. Versions are assigned through
`RELEASE.md`; this scope map is not a release receipt.

---

## Phase 0.3.2 — Queryable Core Completion

*"Ordinary SQL reaches the right data efficiently without physical-partition knowledge."*

Consume delivered 0.3.0/PR151 work and the bounded 0.3.1 corrections. Start with the
admitted key/row-identity and read-visibility contracts shared by routing,
indexes, locking candidate discovery and live-query startup. Then complete
ordered access paths, locking reads and live results through their existing
owners. The superseded `solve/epics/query-access-path-ladder.md` is historical
rationale; its older source census and async-first lean are not current seals.

The existing `solve/epics/release-0-3-queryable-core.md` owns completion of the
Queryable Core axes. Its `solve/specs/release-0-3-queryable-core/user-journeys.md`
names the useful feature outcomes and consumes inherited obligations through
their existing owners. Do not duplicate stabilization, service or comparison
acceptance predicates in the Queryable Core specification.

| Id | Item | Roadmap state | Scope notes |
|----|------|---------------|-------------|
| RM-0.2.9-stable-core-completion | Residual correctness, ingress and runtime stability | 🔲 | Complete remaining SQL/routing, internal-ingress, bounded-retention/recovery and composed operating obligations through `solve/epics/release-0-2-7-stabilization.md`. Consume the existing bounded public WASI service and applicable current-candidate Scenario A semantic evidence; preserve their service/comparison owners. |
| RM-0.3-qs-typed-key-ordering | Typed partition-key and tuple ordering | 🔲 | One declared type/precision/NULL/collation and persisted representation contract, including boundary migration or revalidation. Consume completed 0.2.x ordering fixes; do not repeat them. |
| RM-0.3-qs-read-visibility | Shared base/index/transaction read contract | 🔲 | Define ordinary freshness, distributed visibility and transaction-local staged reads before index or locking implementation. TX1 outcome durability does not itself establish a global read snapshot. Contract: `docs/execution-semantics.md`. |
| RM-0.3-qs-pk-partition-narrowing | Primary-key and compound-primary-key partition narrowing beyond `id` | 🔲 | Consume declared metadata through one owner; prove read/write identity and the admitted scalar/compound lifecycle. Full compound equality narrows; unproved partial predicates scatter safely. Explicitly refuse unsupported topology transitions. |
| RM-0.3-qs-local-index-ddl | Local ordered index DDL | 🔲 | Reuse and complete `IndexService` material through canonical SQL dispatch and lifecycle owners. Prove physical materialization, readable publication, retry, restart, later partitions and drop for ordinary/compound B-tree indexes. Unsupported families fail closed. |
| RM-0.3-qs-compound-index-semantics | Ordered and compound index planner semantics | 🔲 | Seal tuple/NULL/type/collation semantics, left-prefix and equality-prefix-plus-next-range selection. Candidate sets must include every possible match; rejected narrowing preserves ordinary correct execution. |
| RM-0.3-qs-global-secondary-indexes | Non-unique global secondary and compound indexes | 🔲 | Partitioned replicated index datasets with one selected maintenance model, complete candidates, concurrent resumable backfill, restart-safe lifecycle, drop fencing and `EXPLAIN DISTRIBUTED`. Spec: `solve/specs/global-secondary-indexes/requirements.md`. |
| RM-0.3-qs-locking-reads | PostgreSQL `SELECT ... FOR UPDATE` locking reads | 🔲 | Canonical AST and existing transaction/participant owners enforce the supported fail-fast reservation contract, timeout/cancellation, commit/rollback release and recovery through public PG across nodes. Index and scan discovery reserve the same base-row identity beneath projection. Broader modes require an explicit scope decision. Architecture: `architecture/postgres-locking-reads.md`. |
| RM-0.3-qs-generic-live-queries | Generic push-backed application live queries | 🔲 | Canonical query identity and continuing dependencies, ordinary user-table change capture, coalesced local interest, gap-free snapshot/stream startup, bounded resume or explicit reset, and topology handoff. Idle observations perform zero reads solely to discover change. Architecture: `architecture/live-query-data-plane.md`. |

The former `RM-1.0-qs-typed-key-ordering`,
`RM-1.0-qs-pk-partition-narrowing`, `RM-1.0-qs-local-index-ddl` and
`RM-1.0-qs-global-secondary-indexes` IDs remain retired historical references.

Global-index maintenance completion belongs to 0.3.2. Current research provisionally
favors synchronous TX1 maintenance for ordinary non-unique indexes, conditional
on a proved read contract and measured write/fanout/contention cost. Reconcile
and explicitly seal or supersede the existing maintenance decision through its
requirements owner; a provisional recommendation is not a seal.
An unreadable/incomplete index is rejected for reads with correct fallback;
required synchronous maintenance cannot silently skip a failed index write.
Rechecking returned base rows cannot repair omitted index candidates.
Global uniqueness remains 1.0 work, even if transactional maintenance lands here.

The [0.3 research retained with PR #74](https://github.com/psvensson/lagrange/pull/74)
is decision preparation, not evidence that its runtime branch or release axes
are complete. Reconcile it with the actual 0.3.0/PR151 implementation before
sealing the choice; preserve completed component evidence.

Live result maintenance admits a proved row-delta subset and relevant-event
normal-query re-execution/reset for other supported plans. Dependencies cover
future matching mutations, including initially empty results. Reconnect and
split/merge/leader transitions preserve continuity or issue an explicit reset.
No new global snapshot, serializability or general incremental-view guarantee
is implied by these rows.

### Phase 0.3.2 Exit Criteria

- Declared-key lifecycle: admitted non-`id`/compound schemas preserve row identity
  through writes, narrowed reads, real boundaries/topology and restart.
- Indexed query: local/global indexes handle existing rows, key-changing writes,
  interrupted build/recovery and safe rejection under the same read contract;
  `EXPLAIN DISTRIBUTED` reports the selected prefix/range or rejection reason.
- Public locking transaction: contention, release, timeout/cancel and recovery
  are proved through PG across relevant participants.
- Live application view: remote changes, future matches, snapshot/stream races,
  reconnect, topology changes and final-interest cleanup are covered; an idle
  observation receives an unsolicited update without change-detection polling.
- The real SQL/CDC owners establish snapshot/occurrence provenance, comparable
  per-partition frontiers and topology lineage. Bounded pressure/reset/reconnect
  handling reaches useful current results after finite faults clear and shares
  acknowledgement/retention authority with the inherited operating owners.
- Applicable inherited stabilization obligations, current-candidate Scenario A
  semantic regressions and the existing bounded public distributed WASI service
  journey pass through their own owners on the integrated candidate.
- Existing exact-candidate release and published-consumer requirements pass;
  current declarations match measured support. Only the existing certification
  process discharges outstanding axes. Full comparison remains 0.4.

---

## Phase 0.4 — Practical and Demonstrated Service Core

*"The existing WASM service path handles useful workloads and has reproducible evidence."*

Extend the public code-first WASM / HTTP-to-distributed-call path after the
queryable core. This milestone owns the service-envelope work previously left
inside an open-ended 0.2 phase. Bounded input paging is scoped to this call
contract; general multi-stage exchange and backpressure belong to 2.0.

| Id | Item | Roadmap state | Scope notes |
|----|------|---------------|-------------|
| RM-0.4-call-selector-narrowing | Safe selector narrowing from call arguments | 🔲 | Canonical admission/planning derives only authorized data dependencies; no callback-local partition policy. Contract: `architecture/minimal-deployment-surface.md`. |
| RM-0.4-call-bounded-input | Inputs beyond one shard batch | 🔲 | Explicit bounded paging/streaming with continuation, cancellation and resource ownership through the existing call path. |
| RM-0.4-call-structured-partials | Bounded structured partials | 🔲 | Extend the scalar result envelope with a sealed bounded representation and owned reduction/error semantics. |
| RM-0.4-call-multi-operation | Multi-operation service dispatch | 🔲 | Complete compiler/export/binding dispatch beyond the one-operation component limit through existing service owners. Scope: `solve/epics/code-first-service-compiler.md`. |
| RM-0.4-wasm-public-comparison | Public multi-machine WASM service evidence | 🔲 | Reproducible public service path, named workload/hardware and a strong conventional baseline; claims identify the measured supported configuration. Scope: `solve/epics/comparative-workload-efficiency-evidence.md`. |
| RM-0.4-scenario-a-comparison | Complete TiDB/TiKV Scenario A comparison | 🔲 | Complete the agreed ordinary-application semantic/retry/failure profile and controlled comparison, not only a preliminary visibility slice. Reuse the approved comparison program and require equivalent declared semantics. |

### Phase 0.4 Exit Criteria

A public multi-machine service exercises selectors, larger bounded inputs,
structured partials and multi-operation dispatch with honest failure/resource
semantics. Both the WASM/conventional comparison and full Scenario A publish
reproducible method, results and limits; preparation or a partial semantic gate
alone does not close the milestone.

---

## Phase 0.5 — Pilot-Ready Security and Operations

A developer can try the 0.3.2 query and 0.4 service capabilities through a secure,
observable deployment with a supported pilot operating envelope. This is the
first pilot boundary; 0.9 integrates the complete service product and 1.0 adds
production support guarantees.

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
| `RM-0.5-dw-cli-wasm-publish` | Qualified WASM publication workflow | 🔲 |
| `RM-0.5-dw-cli-wasm-deploy` | Qualified WASM service deployment workflow | 🔲 |
| `RM-0.5-dw-cli-wasm-scale` | Qualified WASM service scaling workflow | 🔲 |
| `RM-0.5-dw-getting-started` | Complete pilot getting-started journey | 🔲 |

The existing service init/generate/build/deploy and lifecycle commands are
implementation material, with the 0.2.7 authoring/package corrections recorded
in `CHANGELOG.md`. The rows above require coherent installed-consumer pilot
journeys, not another WASM command family. Stable `cli-wasm` row IDs do not
prescribe a namespace beside the canonical service CLI.

The 0.5 onboarding and operator surface should make the 0.3.2 access paths easy
to inspect: index definitions/state and build failures belong in ordinary
SQL/catalog diagnostics, and examples should demonstrate indexed access without
requiring callers to understand partition internals.

### 3. Service Development Inner Loop

Fast iteration for WASM service authors through the existing artifact model.
Native container development/logging is assigned to 0.6 alongside real OCI
activation. Development convenience must preserve package and invocation
authority.

| Id | Item | Roadmap state | Scope notes |
|----|------|--------|-------|
| — | `lagrange service dev-install` zero-ceremony path | 🔲 | Point at local dir, CLI wraps in OCI layout, installs without registry push or full manifest |
| `RM-0.5-il-service-init-scaffold` | Existing `lagrange service init` scaffold | ✅ | Shipped authoring scaffold recorded in `CHANGELOG.md` Q05-Q07; complete pilot workflow qualification remains in the rows above |
| — | WASM hot reload in dev mode | 🔲 | File watcher detects changes, rebuilds module, swaps in running cluster without full install cycle |
| — | Dev-mode manifest defaults | 🔲 | Minimal required fields for local development; full manifest only required for registry publish |
| — | In-process WASM debugging preserved | ✅ | DAP, breakpoints, DWARF, snapshots, replay all work because `wasm_component` loads in-process regardless of OCI packaging |
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

### 5. Pilot Operating Contract

| Id | Item | Roadmap state | Scope notes |
|----|------|---------------|-------------|
| RM-0.5-pilot-transport-security | Authenticated and encrypted node transport | 🔲 | Protect the supported transport before pilot use. Enterprise identity, RBAC and tenant policy remain the external 1.2 milestone. Contract: `docs/security.md`. |
| RM-0.5-pilot-pg-authentication | Pilot PostgreSQL authentication and TLS | 🔲 | Qualify the selected driver/authentication profile, including SCRAM where required; preserve explicit trust/password/TLS limits. Enterprise identity integration remains 1.2. Contract: `architecture/postgres-wire.md`. |
| RM-0.5-pilot-recovery-envelope | Bounded logs and pilot recovery certification | 🔲 | Qualify message-group compaction and multi-machine soak/recovery using the delivered mechanisms and 0.3.2's completed initial retention obligations. Name supported topology, capacity and fault cases; do not defer initial pilot proof to 0.9. Contract: `docs/operations-readiness.md`. |
| RM-0.5-pilot-migration-upgrades | Pilot migration, upgrade and exit procedures | 🔲 | Data load, shadowing, cutover, rollback/exit and supported release-pair upgrade/downgrade rehearsals. Customer backup/PITR implementation remains external in 1.0. Contract: `docs/migration.md`. |
| RM-0.5-pilot-driver-certification | Named PostgreSQL-driver and SQL profiles | 🔲 | Certify the declared current subset and necessary metadata through actual drivers. Broader catalogs, window functions, sequences and index syntax are assigned to 1.1. Contract: `architecture/postgres-wire.md`. |
| RM-0.5-pilot-operational-view | One public operating and diagnostics view | 🔲 | Correlate requests, shard runs, partials, placement, retries and typed failures; expose index state/build failures and live-query dependencies/frontiers/maintenance mode. Basic diagnostics remain Community; advanced exporters remain external. |

The existing PostgreSQL wire, dialect translation, supported CTE/subquery
surface and `EXPLAIN DISTRIBUTED` are prerequisites, not new blanket SQL
compatibility claims. Their current limits remain in
`docs/current-capabilities-and-limitations.md`.

### Phase 0.5 Exit Criteria

A developer can run a cluster, connect with `psql`, create tables, deploy WASM,
run distributed execution, and observe results within 30 minutes. The same
supported profile has authenticated/encrypted node communication, a measured
pilot capacity envelope, recovery and upgrade/rollback evidence, and actionable
SQL/service diagnostics.

The 0.6 milestone consumes working `lagrange cluster init`, `lagrange node start`,
`lagrange cluster join`, a local-cluster tutorial and aligned public package/CLI
naming. Preserve these pilot operator prerequisites for release acceptance;
independent bounded implementation follows the concurrency rule above. Phase
0.6 remains the first versioned service-runtime expansion after these basics.

At 0.5, choose the first intended production workload and review whether OCI and
every alternative transport must precede 1.0. Until an explicit coordinated
version reallocation changes this map and the other planning surfaces, 0.6-0.9
retain their existing scope and remain chronological predecessors. The review
alone does not move a feature or relax a production guarantee.

---

## Phase 0.6 — Native OCI Call Cells

*"Keep the customer's runtime; move the selected function to the data."*

Complete the minimum safe real OCI lifecycle, then invoke native functions
through the existing Artifact / Binding / Cell and Call Cell owners. Package
trust, compatibility/configuration admission, health, instance identity and
cleanup are prerequisites here. Full customer rollout/support operation is
0.9; advanced providers and cost-aware placement are 2.0.

| Id | Item | Roadmap state | Scope notes |
|----|------|---------------|-------------|
| RM-2.0-minimal-deployment-surface | Existing unified artifact / binding / cell substrate | ✅ | Historical row ID retained. Schema-v3 Artifacts, immutable schema-v2 Bindings and reconciled Cells are existing material; provider execution still needs its own proof. Contract: `architecture/minimal-deployment-surface.md`. |
| RM-0.6-verified-oci-package | Verified immutable OCI acquisition | 🔲 | Digest/signature verification, fetch/extraction and media-type dispatch for WASM versus container artifacts through one package path. Contracts: `architecture/lagrange-service-manifest.md`, `architecture/lagrange-service-registry.md`. |
| RM-0.6-activation-preflight | Compatibility, dependency and configuration preflight | 🔲 | Complete manifest schema/validation, config schema, capability admission and required kernel/service dependencies before activation. A manifest declares requirements; it cannot grant itself authority. |
| RM-0.6-install-reconciliation | Installation intent and runtime reconciliation | 🔲 | Desired/actual catalog state, installation reconciler, bounded health/probes, typed failures and idempotent basic install/status/remove. Catalog presence alone is not readiness. |
| RM-0.6-managed-oci-activation | Real managed OCI activation | 🔧 | Pull/create/start/inspect/health-check/stop/remove/replace a pinned `oci_container` revision through `ServiceRuntimeLifecycle`, with bounded resources and restart cleanup. Spec: `solve/specs/service-portability-ladder/`; host contract: `architecture/oci-runtime-host-contract.md`. |
| RM-0.6-call-continuity | Provider-neutral request continuity and failover | 🔲 | Ready-actual replacement, route continuity, receiver revalidation, durable effect deduplication and bounded stale-route recovery are prerequisites for OCI. Spec: `solve/specs/request-invocation-partitioning/`. |
| RM-0.6-native-oci-call-cells | Native OCI Call Cells | 🔧 | Handler-originated SDK calls and direct `CALL BINDING` converge on `CallCellInvoker`. Local batch/fence/reduce ownership remains shared; `ServiceRuntimeLifecycle.invoke()` reaches `OciContainerDriver.invoke()` and an authenticated application-initiated broker stream. Architecture: `architecture/native-oci-call-cells.md`; sequence: `solve/specs/service-portability-ladder/tasks.md` Phase 5. |
| RM-0.6-native-dev-observation | Native development and runtime observation | 🔲 | OCI dev logging plus exact instance/revision, health, endpoint and basic diagnostics through existing service owners. No separate container supervisor. |

The existing unified lifecycle, built-in services, kernel-internal provider and
`wasm_component` provider are reused. The kernel-internal provider remains
unavailable to customer installations. Native process globals/models/heaps are
disposable warm cache; arbitrary external effects require application
idempotency under the documented retry/ambiguity contract.

### Phase 0.6 Exit Criteria

A real managed service is verified, admitted, started, observed, recovered and
removed through the ordinary lifecycle. Its handler-originated and direct
calls execute a genuine native dependency on multiple partition hosts, read
locally before native invocation, preserve exact revision identity, and expose
honest worker-loss/retry outcomes. A second materially different language
conforms to the same broker/context contract without another execution owner.

---

## Phase 0.7 — NATS Transport and Effective Timing

*"Run the complete cluster through NATS with explicit operating timing."*

Consume retained N0 measurements and complete N1's transport-independent
foundation before NATS implementation. The published
[N0/N1 planning proposal](https://github.com/psvensson/lagrange/pull/145) remains
preparation evidence; version assignment does not certify its implementation.

| Id | Item | Roadmap state | Scope notes |
|----|------|---------------|-------------|
| RM-0.7-transport-foundation | N0/N1 baseline and transport-independent contract | 🔲 | Reconcile measurements against the candidate and seal peer identity, delivery, cancellation, pressure and lifecycle behavior at existing transport owners. |
| RM-0.7-nats-only | Complete NATS-only cluster transport | 🔲 | Formation, consensus, control, SQL/service and CDC traffic operate through NATS without a required second transport; reuse existing semantic owners. |
| RM-0.7-effective-static-timing | Effective configurable static timing | 🔲 | Validated timing settings reach the actual Raft/transport owners and diagnostics. Prove the supported latency envelope; merely exposing configuration fields is insufficient. |

### Phase 0.7 Exit Criteria

The supported cluster workloads and failure/reconnect/restart cases succeed
with NATS as the sole transport. Effective timing and security/pressure behavior
are observable and measured against the declared profile. Adaptive tuning is
not implied by the static configuration contract.

---

## Phase 0.8 — Veilid Transport

*"Run the complete cluster through Veilid alone."*

| Id | Item | Roadmap state | Scope notes |
|----|------|---------------|-------------|
| RM-0.8-veilid-only | Complete Veilid-only cluster transport | 🔲 | Extend the 0.7 transport contract without another routing/consensus owner. Veilid may be the only configured transport; NATS/WebSocket assistance is not required. |
| RM-0.8-veilid-operating-envelope | Veilid resource and recovery qualification | 🔲 | Measure bandwidth, latency, reconnect/routing recovery, pressure and security on the supported topology; report availability limits and effective timing through existing diagnostics. |

### Phase 0.8 Exit Criteria

A Veilid-only multi-machine cluster completes the supported application and
failure workloads with bounded resources and an evidence-backed operating
envelope. Transport mixing is not an acceptance prerequisite.

---

## Phase 0.9 — Installable Service Product and Qualification

*"Install, operate, upgrade and support a separately released service."*

This milestone completes the customer service product on 0.6's safe managed
runtime and the supported transports. It has one common implementation path
for Community and commercial consumers. Contract:
`solve/specs/installable-service-product-platform/contract.md`.

| Id | Item | Roadmap state | Scope notes |
|----|------|---------------|-------------|
| RM-0.9-stable-service-api | Stable public service contract | 🔲 | Version manifest registration, lifecycle hooks, replicated service state, CDC subscription, admin registration and capability contracts. Reuse `solve/specs/service-portability-ladder/kernel-platform-api-v0.md`; do not add a second API owner. |
| RM-0.9-service-upgrade-rollback | Health-gated upgrade and rollback | 🔲 | Immutable revision transitions, migration compatibility, declared rollout strategies, restart recovery and rollback to a prior known-good revision only while safe. |
| RM-0.9-service-management-ux | Complete install/status/remove/upgrade surface | 🔲 | Idempotent SQL/CLI operations, revision/instance inspection, drain/cleanup and durable typed failure queryability. Complete the existing lifecycle SQL/catalog path rather than equating recorded installation with running service. |
| RM-0.9-registry-offline-operation | Registry management and mirrored/air-gapped operation | 🔲 | Registry add/list/remove, priority/auth, verified local OCI layouts, offline trust and upgrades from customer-controlled artifacts. Native distributed artifact storage is assigned to 2.0. |
| RM-0.9-service-diagnostics-support | Diagnostics and customer-inspectable support bundles | 🔲 | Stable service health/metrics/failure contribution, versioned local bundles, bounded collection, redaction and contributor-failure isolation. Submission is a separate explicit action. |
| RM-0.9-service-telemetry-contribution | Customer-controlled telemetry contribution | 🔲 | One local contribution/export boundary, explicit customer destination policy and telemetry/licensing separation. Paid exporters and advanced observability stay external. |
| RM-0.9-commercial-extension-seams | Entitlement and external-reference integration contracts | 🔲 | Community consumes typed external assertions and opaque references. Offline entitlement policy/verification and paid providers remain external; Enterprise secret/KMS and policy implementations are assigned to 1.2. |
| RM-0.9-service-product-acceptance | Real service and integrated product qualification | 🔲 | A separately released service completes install, readiness, restart, diagnostics, bounded support, upgrade, rollback and remove on the supported cluster. Consume prior milestone evidence and close integration gaps. |

Existing `INSTALL SERVICE` / `REMOVE SERVICE` / `UPGRADE SERVICE` and
`SHOW SERVICES` SQL are implementation material. Revision/instance views and
end-to-end customer operation need their own proof. CLI service and registry
commands consume the same owner outcomes. Public topology and event-emission
interfaces needed by installed services belong to this stable contract;
advanced placement and execution expansion belongs to 2.0.

Commercial entitlement implementations and advanced telemetry/export products
share this version milestone in their external repositories. Core only supplies
the generic extension and contribution boundaries. Lagrange AI is the intended
acceptance candidate in the platform contract; its currently unclassified
edition/implementation home must be resolved before implementation, without
moving its workload into AGPL scope by implication.

### Phase 0.9 Exit Criteria

A real signed service passes the common lifecycle, recovery, health-gated
upgrade/rollback, redacted support and offline-operation journey without a
repository checkout or another service manager. Telemetry may remain disabled
without invalidating entitlement or readiness. Removal leaves no unmanaged
runtime state. Earlier pilot and provider guarantees remain qualified.

---

## Phase 1.0 — Production Guarantees and Relational Invariants

*"Companies can operate the declared product profile under explicit support guarantees."*

Production support builds on the already qualified query, service, transport
and installable-product capabilities. It does not reopen their initial
implementation. Broader SQL syntax is 1.1; Enterprise/cross-region additions
are 1.2 in their external implementation homes.

### 1. Production Guarantees

| Id | Item | Roadmap state | Scope notes |
|----|------|--------|-------|
| — | Replica count guarantees | ✅ | |
| — | Replica recovery | ✅ | |
| — | Failure detection | ✅ | |
| — | Node reintegration | ✅ | |
| — | Failover SLO definition | 🔲 | Define hardware class, workload, failure envelope, pass-rate confidence bound, convergence percentiles, reporting surface, and representative gate. The topology contract must be refreshed from `solve/epics/topology-convergence-hardening.md` before a Quest links this row. |
| — | Durability SLO definition | 🔲 | Define acknowledged-write durability, restart/rebuild envelope, measurement surface, and adversarial gate before implementation starts |
| — | Raft snapshot recovery and bounded log lifecycle | 🔲 | Production guarantees for the checkpoint, transfer-pressure, atomic install/restart, compacted-leader catch-up, retention and physical-compaction mechanisms qualified in 0.2.x/0.5; do not reopen their first implementation. Spec: `solve/specs/raft-snapshot-transfer-install/`. |
| — | Supported data-plane scale envelope | 🔲 | Publish only measured node/table/partition/replica/data-volume profiles tied to a hardware class and workload. Spec: `solve/specs/large-scale-data-plane-certification/`. |
| — | Feasibility-qualified placement balance SLO | 🔲 | Hard constraints, byte/replica/leader/load/affinity objectives, oracle or lower-bound gap, bounded movement, and typed degraded outcomes when the target is infeasible. Spec: `solve/specs/large-scale-data-plane-certification/`. |
| — | Topology convergence SLO | 🔲 | Statistical, hardware-relative convergence after add, failure, restart, replacement, and decommission; no single-run or timeout-extension certification. Contract: `solve/epics/topology-convergence-hardening.md` plus `solve/specs/large-scale-data-plane-certification/`. |
| — | Large-scale data-plane certification | 🔲 | Separate metadata-cardinality and physical-byte ladders, with enforced throughput, latency, heap/RSS, file-descriptor, queue, in-flight-work, and leak gates. Spec: `solve/specs/large-scale-data-plane-certification/`. |

### 2. Production Index and Constraint Guarantees

| Item | Roadmap state | Scope notes |
|------|---------------|-------------|
| Unique global secondary indexes | 🔲 | Enforce global uniqueness transactionally through synchronous maintenance, with typed refusal when the invariant cannot be maintained. |
| Transactional uniqueness participation | 🔲 | Extend the selected 0.3.2 maintenance/read contract with uniqueness reservation and correctness; do not defer all synchronous non-unique maintenance to this phase. |
| Production index rebuild/backfill guarantees | 🔲 | Restart/failover-safe rebuild with measured pressure, bounded operating impact and a supported recovery envelope. |
| Index write-amplification and capacity envelope | 🔲 | Publish representative write/read/rebuild costs for supported compound/global-index profiles. |
| Supported ordered-key/NULL/type/collation contract | 🔲 | Stabilize the production subset exposed through PG metadata and constraints; broader compatibility is 1.1. |

### 3. Supported Production Boundary

| Id | Item | Roadmap state | Scope notes |
|----|------|---------------|-------------|
| RM-1.0-consistent-snapshot-api | Shared consistent snapshot/barrier API | 🔲 | Core-owned service barrier and cluster-consistent read contract consumed by external backup/recovery. Design: `solve/specs/service-portability-ladder/kernel-platform-api-v0.md`. |
| RM-1.0-support-contract | Supported compatibility, security and recovery contract | 🔲 | Stable SQL/service/upgrade policies, named hardware/workload certification, measured recovery bounds and explicit support distinctions. Current safety controls remain prerequisites; Enterprise policy remains external 1.2. |

Backup/restore/PITR and its measured disaster-recovery RPO/RTO are assigned to
1.0 in the external Pro implementation home. Core supplies only its owned
snapshot/barrier and service-platform prerequisites. This placement does not
authorize the backup product in this AGPL repository.

### Phase 1.0 Exit Criteria

The declared production profile has evidence-backed durability, availability,
consistency, recovery, balance and supported-scale contracts; representative
failure/upgrade certification; supported global uniqueness and index recovery;
and a tested backup/restore/disaster-recovery path in its assigned product home.
Implemented, tested, certified and commercially supported remain distinct claims.

---

## Phase 1.1 — SQL Breadth and Compatibility

*"Broaden relational ergonomics on the established query and index contracts."*

| Item | Roadmap state | Scope notes |
|------|---------------|-------------|
| Broader `information_schema` and `pg_catalog` coverage | 🔲 | Extend the named driver metadata subset qualified in 0.5 with honest catalog and constraint behavior. |
| Window functions | 🔲 | Explicit supported syntax, distributed semantics and compatibility proof. |
| Sequences | 🔲 | Owned allocation, persistence, concurrency and recovery semantics. |
| Partial indexes | 🔲 | Predicate-scoped index membership and matching rules. |
| Expression indexes | 🔲 | Stable expression identity and evaluation semantics before planner use. |
| `INCLUDE` / covering syntax and index-only scans | 🔲 | Separate key/payload columns and prove visibility for base-row-free reads. |
| Richer collation and operator semantics | 🔲 | Expand the deliberately bounded 0.3.2/1.0 ordered-key contract. |
| Broader PostgreSQL index DDL | 🔲 | Compatible options and concurrent-build behavior where supported by the lifecycle contract. |

### Phase 1.1 Exit Criteria

The expanded declared SQL/catalog/index subset is certified through public SQL
and named drivers with unsupported forms refused explicitly. New breadth
preserves the supported transaction, index and upgrade contracts.

---

## Phase 1.2 — Enterprise and Cross-Region Product

This is the next version in the single product sequence, with implementation
outside the AGPL repository. Enterprise identity/RBAC, tenant isolation,
resource quotas, encryption-at-rest policy, secrets/KMS, enterprise policy,
compliance and cross-region durability/replication remain governed by
`edition-matrix.md` and the external backlog mirrored in
`docs/development/product-roadmap.md`.

There are no paid implementation rows here. Previously delivered Community
transport protection, capability enforcement, operating bounds and generic
reference seams remain prerequisites. This milestone does not postpone those
basic safety requirements or authorize an Enterprise policy implementation in
core.

---

## Phase 2.0 — Deeper Distributed Execution and Planning

*"Compose richer computation at the data through the established service model."*

### 1. Multi-Stage Plans and Optimizer

The existing distributed planner, parallel coordinator, merge engine, strategy
selector and plan diagnostics are reused. First complete deeper execution,
then qualify the full Scenario B comparison against that supported contract.

| Id | Item | Roadmap state | Scope notes |
|----|------|---------------|-------------|
| RM-2.0-multi-stage-execution | Multi-stage plans and streaming exchange | 🔲 | Streaming exchange, backpressure, deeper composition and concurrent invocations on one Cell through existing owners; 0.4 bounded call input remains a prerequisite. |
| RM-2.0-planner-pushdown | Planner-initiated execution and richer SDKs | 🔲 | Query-planner pushdown and richer typed/generated operation handles across WASM and native providers. |
| RM-2.0-cost-based-planning | Statistics and cost-based access planning | 🔲 | Cardinality estimates, cost-based optimizer/index selection, index intersection/union and bitmap-style plans, hints and index advisor tooling. The conservative 0.3.2 planner remains the correctness foundation. |
| RM-2.0-scenario-b-comparison | Complete Scenario B comparison | 🔲 | Full compute-at-data comparison using the approved workload and equivalent declared semantics; early evidence does not substitute for this complete acceptance. Scope: `solve/epics/comparative-workload-efficiency-evidence.md`. |

### 2. Advanced Provider and Placement Behavior

| Item | Roadmap state | Scope notes |
|------|---------------|-------------|
| Additional OCI providers and resource placement | 🔲 | Kubernetes/containerd and broader runtime-platform scale reuse the 0.6 lifecycle and invocation owner. |
| Activation-cost-aware placement | 🔲 | Image presence, warm runtime/WASM materialization cost, partition locality, admission/readiness and developer feedback through existing placement authority. Spec: `solve/specs/activation-cost-aware-placement/`. |
| Advanced network operating policies | 🔲 | Adaptive timing or mixed-transport policy builds on the measured sole-transport contracts from 0.7/0.8; this does not reopen their delivery or routing ownership. |
| Keyed invocation routing | 🔲 | Canonical actor-key extraction and transport-neutral rendezvous routing; seal a fixed-shard/epoch ownership contract. Spec: `solve/specs/request-invocation-partitioning/`. |
| Non-request source completion | 🔲 | Complete CDC, timer, once, boot and planner-pushdown invocation through existing desired-state/Cell owners; consume the call path already established in 0.4/0.6. Plan: `solve/epics/minimal-deployment-surface.md`. |

### 3. Advanced External Service API

Deepen external execution and placement APIs where the 0.9 stable service
contract needs additional capabilities. Basic lifecycle/state/CDC/admin,
capability, topology, event and supported rollout interfaces remain 0.9
obligations; they are not postponed to this phase.

### 4. Native Artifact Store

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

Planning design: `solve/specs/native-artifact-store/design.md`. Its installable
service prerequisite is delivered in 0.9; activation-cost-aware placement is
ordered before it within 2.0. Phase 0.9 mirrored/air-gapped operation uses
verified OCI registries/local layouts and does not wait for this native store.

Design principle: same cluster, same nodes, same replication — different
object semantics for artifact bytes. No special registry nodes required.
Artifact chunks are just another replicated system-managed dataset spread
across the cluster according to policy.

### Phase 2.0 Exit Criteria

The supported deeper execution workload and full Scenario B comparison have
reproducible correctness, pressure, failure/recovery and performance evidence.
Optimizer choices preserve the established query semantics. Advanced provider,
placement and native artifact-store behavior is qualified through the existing
service/storage owners, with explicit supported interfaces and bounds.

---

## Phase 2.1 — Specialized Search and Derived Services

| Id | Item | Roadmap state | Scope notes |
|----|------|---------------|-------------|
| RM-2.1-specialized-search | Vector, full-text and spatial search | 🔲 | Specialized services/access-path families with explicit query, consistency, storage and lifecycle semantics; use the installable-service platform where appropriate. |
| RM-2.1-embedding-service | Embedding and derived-service substrate | 🔲 | Seal capture, progress, freshness, rebuild and resource behavior through existing service/data owners. Edition assignment precedes any service-specific implementation; unclassified AI behavior is not implicitly Community. |

### Phase 2.1 Exit Criteria

Each declared search/service family has public-query correctness, freshness,
rebuild/recovery and operating-envelope evidence. These families do not change
the ordinary ordered-index contract or introduce another lifecycle owner.
