# Changelog

All notable changes to Lagrange are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project aims to follow [Semantic Versioning](https://semver.org/spec/v2.0.0.html).
While the major version is `0`, the public surface (SQL dialect, wire
protocols, admin CLI, cluster membership behaviour) may change between minor
releases without a compatibility guarantee.

## [Unreleased]

## [0.4.0] — 2026-10-31

Scenario A (`tidb-oltp-baseline`) deep-stack throughput and latency optimization,
distributed scale-out, provenance separation, longitudinal metrics evolution,
and unified 5-node and Scenario C summary benchmark release completing epics
`scenario-a-deep-stack-throughput-and-latency` and
`distributed-scaleout-and-provenance-benchmark-series` (Slices 1–5):

Formation health at cut time: `formation health: 0/20 passed (0%), 0 with a
starved seed`.

### Added
- **Locking-read bound parameter propagation & split-PK tuple resolution (`sql-query-engine-select-execution.js`, `sql-locking-read-execution.js`):**
  Propagates bound `params` and `queryOptions` into `executeLockingReadReservations`,
  merges equality-bound `WHERE` PK columns with projected `SELECT` columns so both
  full-PK-in-`WHERE` (`SELECT quantity FROM stock ... FOR UPDATE`) and split-PK
  (`SELECT order_id FROM new_order WHERE warehouse_id = ? AND district_id = ? FOR UPDATE`)
  locking reads resolve canonical PK tuples in memory with 0 extra `SELECT` RPCs,
  and preserves `orderBy`, `limit`, and `offset` on any fallback PK query.
- **Coordinator participant-set deduplication & transient status skip (`distributed-transaction-participant-set.js`, `sql-query-engine-transaction-persistence-methods.js`, `distributed-transaction-telemetry.js`):**
  Skips redundant `persistAdmittedParticipantSet` gateway mutations when the
  admitted `participant_set_text` is already persisted on `tx.participantSetText`
  (tracked via `skippedParticipantSetMutations`), and skips non-authoritative
  pre-RPC participant status writes (`PREPARING`, `COMMITTING`, `ROLLING_BACK`)
  while preserving `ACTIVE`, `PREPARED` evidence, `COMMITTED`, `ROLLED_BACK`,
  and `FAILED`.
- **Raft runtime proposal batching & durable batch telemetry (`raft-rs-runtime-owner.js`, `raft-rs-durable-store.js`):**
  Coalesces concurrent `propose` commands arriving while a Raft group turn is in
  flight into a single `drainReady` cycle and tracks `batchedEntryCount` and
  `multiEntryReadyCount` in `getDurableSyncStats()`.
- **Canonical row-key extraction, disjoint-commit generation advancement & $O(1)$ disjoint write staging (`partition-participant-transaction-session.js`, `partition-participant-transaction-request.js`, `partition-participant-transaction-apply.js`, `partition-participant-transaction-staging.js`):**
  Extracts canonical PK row keys from `INSERT` column lists and `UPDATE`/`DELETE`
  `WHERE` clauses, advances `session.generationBase` at `sealSession` when
  intervening committed generations touched only disjoint row keys, cleans up
  prepared participant row keys on rollback/refusal/expiry, and validates
  disjoint-row staged writes directly in $O(1)$ (`disjointDirectValidations`).
- **Distributed scale-out & provenance benchmark series (`#169`–`#173`):**
  Scenario B measurement provenance audit and reclassification (`local-oracle-plus-network-model` /
  `contract-model-non-comparable`) plus longitudinal Lagrange metrics evolution
  (`lagrange-metrics-evolution.{md,html,svg}`, Slice 1); 3-to-5-node `RF=3`
  partial replica-coverage (`100%` vs `60%`) scale-out and Scenario A three-mode
  separation (`scaleout-3to5-node-rf3-progress.{md,html,svg}`, Slice 2); 5-node
  `RF=3` partition granularity sweep across `P=6, 15, 30, 60`
  (`partition-granularity-sweep-progress.{md,html,svg}`, Slice 3); Scenario B
  network RTT crossover (`0.2 ms` to `30 ms`) and working-set growth
  (`scenario-b-rtt-working-set-crossover.{md,html,svg}`, Slice 4); and live
  partition movement under load plus Scenario C `5x` joint scaling and
  operating-boundary map (`movement-and-scenario-c-scaling-progress.{md,html,svg}`,
  Slice 5).
- **Unified 5-node (`RF=3`) and Scenario C summary page statistics (`0.3.3` & `0.4.0`):**
  Added 5-node `RF=3` (`lagrange-5node-rf3`) and Scenario C (`streaming-feature-risk-decision`)
  statistics, charts, and multi-system tables directly to the benchmark summary
  landing page (`docs/benchmarks/README.md`, `docs/benchmarks/index.html`, and
  `docs/benchmarks/comparative-overview.svg`).

## [0.3.3] — 2026-10-30

Scenario A transaction coordination fast-path and multi-system comparative
benchmark completion release reducing per-statement coordinator metadata
bookkeeping, overlapping independent participant `BEGIN`/`PREPARE`/`COMMIT`/`ROLLBACK`
stages, adding opt-in row-key-disjoint concurrent participant staging sessions,
reusing pre-validated compiled operations across staging replay, pruning
composite-key partitions by prefix and range, caching SQLite determinism
compilation plans, and completing Slices 3–5 of the comparative benchmark
matrix (epic `scenario-a-transaction-coordination-fast-path`):

Formation health at cut time: `formation health: 0/20 passed (0%), 0 with a
starved seed`.

### Added
- **Scenario A transaction coordination fast path & telemetry (`scenario-a-transaction-coordination-fast-path`):**
  Per-transaction phase and metadata telemetry (`distributed-transaction-telemetry.js`),
  reduced durable transaction bookkeeping (`sql-query-engine-transaction-set-methods.js`,
  `distributed-transaction-participant-set.js`, `distributed-transaction-statement.js`),
  concurrent independent participant `BEGIN`, `PREPARE`, `COMMIT`, and `ROLLBACK`
  stages (`distributed-transaction-protocol.js`), opt-in row-key-disjoint concurrent
  participant staging sessions (`partition-participant-transaction-session.js`),
  pre-validated compiled operation reuse and empty-read direct execution during
  staging replay (`partition-participant-transaction-staging.js`), composite
  partition prefix and range pruning (`partition-resolver-composite.js`,
  `lagrange-oltp-adapter.js`), and `schema_version`-fenced SQLite determinism
  plan caching plus Raft durable sync telemetry (`partition-transaction-determinism.js`,
  `raft-rs-durable-store.js`).
- **Multi-system comparative benchmark matrix completion (`#166`–`#168`):**
  Citus colocated tables and distributed functions comparison (Slice 3),
  YugabyteDB 2024.2 and Apache Ignite 3 colocated compute comparison (Slice 4),
  and Scenario C PostgreSQL + Valkey freshness-bounded risk comparison (Slice 5).

## [0.3.2] — 2026-10-30

Queryable Core 0.3.2 completion release sealing synchronous transactional global
index maintenance (Mode A), end-to-end SQL key-routed read/write journeys (`J2`),
local and compound secondary index journeys (`J3`), locking read conflict and
timeout journeys (`J4`), online global secondary index lifecycle and routing
journeys (`J5`), push-driven live-query subscription journeys (`J6`), PG-wire
idle rollback notice preservation, comparative OLTP and Scenario B benchmark
matrix progression artifacts, and solver/publisher proof reuse (epic
`release-0-3-queryable-core`):

Formation health at cut time: `formation health: 0/20 passed (0%), 0 with a
starved seed`.

### Added
- **Queryable Core 0.3.2 journey completion (`J2`–`J6`, `C1`):**
  Composite partition key resolution (`partition-resolver-composite.js`),
  global index lifecycle coordinator (`global-index-lifecycle-coordinator.js`
  and `index-service-global-methods.js`), live-query group helpers
  (`live-query-group-helpers.js`), Mode A synchronous global index maintenance
  specification seal (`global-index-maintenance-mode-seal-guard.js`), and
  end-to-end journey suites (`J2`–`J6`).
- **Comparative OLTP and Scenario B benchmark progression & matrix (`#158`–`#164`):**
  Version-gated TiDB and PostgreSQL comparison history store, Scenario B
  three-island distributed risk decision comparators and fairness gate, and
  static Markdown, HTML, and SVG comparison progression renderers.
- **Solver & publisher proof deduplication (`scripts/solve/commands.js`, `scripts/checks/push-gate-change-proof.js`, `scripts/publish-head.js`):**
  `solve land` records a commit- and base-bound test proof receipt
  (`lagrange-land-proof.json`) reused by the push gate, `pushGatedHead` skips
  redundant `.githooks/pre-push` re-entry via `LAGRANGE_GATE_ALREADY_PROVED_SHA`,
  corpus ratchets execute concurrently, and `dependency-cruiser` import-graph
  analysis caches verified reports in `<gitCommonDir>/lagrange-import-graph-cache.json`.

### Fixed
- **PG-wire idle transaction rollback notice preservation (`postgres-wire-adapter.js`):**
  Preserves the idle-timeout `NoticeResponse` (`25P02` / `57P01`) before closing
  or resetting the session state, and ensures Scenario A public PG contexts issue
  explicit `ROLLBACK` before pool release (`oltp-scenario-a-lagrange-public-pg-context.js`).
- **Runtime container `/proto` asset inclusion (`Dockerfile`):**
  Copies `/proto` into the production runtime image stage (`J1` repair).

## [0.3.0] — 2026-10-29

Phase 0.3 Queryable Core release delivering explicit typed partition boundary
ordering across split, merge, and routing paths, SQL-first local and compound
index DDL and planner selection, PostgreSQL locking reads (`SELECT ... FOR
UPDATE` and `SELECT ... FOR SHARE` with `NOWAIT`), partition-independent Global
Secondary Indexes (`CREATE INDEX ... GLOBAL`) with online backfill and
point-read routing, and generic push-driven live queries over table CDC without
polling (epic `release-0-3-queryable-core`):

Formation health at cut time: `formation health: 0/20 passed (0%), 0 with a
starved seed`.

### Added
- **Typed partition boundary ordering and representation (`partition-key-ordering-owner-completion`, `A1`–`A4`):**
  Canonical `partition-boundary-representation.js` and `split-key-comparator.js`
  enforce explicit `partition_key_type` (`INTEGER`, `REAL`, `TEXT`, `BLOB`)
  ordering across `CREATE TABLE`, `PartitionResolver`, `ManagedSplitWorkflow`,
  and `ManagedMergeWorkflow` with zero text-to-number coercion or untyped
  fallback.
- **SQL-first local and compound secondary index DDL and planner selection (`A5`–`A6`):**
  `SQLQueryEngine` routes `CREATE [UNIQUE] INDEX [IF NOT EXISTS]` and
  `DROP INDEX [IF EXISTS]` through `IndexService` and replicates local index
  DDL across table partitions; `DistributedQueryPlanner` and `QueryOptimizer`
  enforce strict leftmost-prefix matching for single-column and compound
  indexes.
- **PostgreSQL locking reads (`SELECT ... FOR UPDATE` / `FOR SHARE`, `B1`–`B5`):**
  Canonical AST normalization (`lockingRead: {strength, waitPolicy, ofTables}`),
  explicit transaction-block admission (`25P01` outside `BEGIN`), Fail-Fast /
  `NOWAIT` conflict rejection (`SQLSTATE 55P03`), and participant row-lock
  reservations that block conflicting concurrent `UPDATE`/`DELETE`/`INSERT` and
  release deterministically on `COMMIT`, `ROLLBACK`, and session teardown.
- **Global Secondary Indexes (`CREATE INDEX ... GLOBAL`, `C1`–`C5`):**
  Catalog metadata contract (`scope: 'GLOBAL'`, lifecycle state machine
  `WRITE_ONLY` -> `BACKFILLING` -> `PUBLIC` -> `DROPPING`), independent global
  index dataset and Raft partition provisioning, idempotent online backfill
  coordinator, synchronous write-path index maintenance across `INSERT`,
  `UPDATE`, and `DELETE`, and two-hop point-read routing when `PUBLIC`.
- **Generic push-driven live-query data plane (`D0`–`D6`):**
  `LiveQueryService`, `LiveQueryManager`, and `LiveQueryGroup` subscribe
  active SQL queries directly to `CDCManager` table events and re-evaluate and
  push delta updates (`added`, `modified`, `removed`) to WebSocket subscribers
  without polling timers.
- **Solver parallelization and home lab placement (`scripts/solve/*`, `scripts/lab/probe.js`):**
  `solve.js land` synthesizes a candidate commit from the staged index for
  remote lab test placement, routes `select-change-tests.js` through
  `runPlacedClassifiedTestFiles()`, deduplicates `.githooks/pre-commit`, and
  serializes concurrent worktree landings via a cross-worktree lock.

## [0.2.8] — 2026-10-29

Patch release repairing the runtime container build context for `wit/` after the
`0.2.7` partial-channel release (where npm published `0.2.7` before the Docker
image step failed on `.dockerignore`) and improving release-proof receipt
recording and reuse (epic `release-0-2-7-stabilization`):

Formation health at cut time: `formation health: 0/20 passed (0%), 0 with a
starved seed`.

### Fixed
- **Docker build context for `wit/` (`release-0-2-7-docker-context-and-publish-speedup`):**
  `.dockerignore` now admits `!wit/` and `!wit/**` alongside `Dockerfile`'s
  `COPY wit/ ./wit/`, and `test/release/project-hardening-contracts.test.js`
  enforces that the build context admits `wit/` for the runtime image stage.
- **Whole-corpus proof receipt recording (`scripts/proof-authority.js`):**
  `recordProof` skips release-content identity traversal when recording
  non-identity-reusable contracts (`corpus-full-v1`), preventing cold
  working-tree scans from exceeding the publisher's receipt-recording timeout.
- **Release-proof whole-corpus receipt reuse (`scripts/run-release-proof.js`):**
  `npm run check:release` reuses an exact-SHA `corpus-full-v1` receipt for
  `HEAD` and runs only the non-corpus CI and release-hardening steps instead of
  repeating `npm run test:all`.

## [0.2.7] — 2026-10-29

Stabilization release repairing SQL mutation and schema-constraint semantics,
TEXT split-key ordering, Bootstrap HTTP ingress authentication, Raft durable
journal and inbound-queue bounds, partition snapshot cadence and log compaction
coverage, consumer npm package and SEA service-build ergonomics, non-root
container and Helm chart hardening, and release provenance attribution (epic
`release-0-2-7-stabilization`, developer ergonomics epic
`developer-adoption-and-ergonomics`):

Formation health at cut time: `formation health: 0/20 passed (0%), 0 with a
starved seed`.

### Fixed
- **SQL mutation expressions (Q01):** `INSERT ... VALUES` and `UPDATE ... SET`
  evaluate deterministic arithmetic (`+`, `-`, `*`, `/`, `%`), unary minus,
  dollar-quoted strings, `CAST(...)`, and deterministic scalar functions
  (`UPPER`, `LOWER`, `TRIM`, `COALESCE`, `NULLIF`, `ABS`, `ROUND`, `LENGTH`)
  before replication instead of silently coercing non-literal AST nodes to
  `NULL`; unsupported or nondeterministic expressions are refused before any
  state change.
- **Schema constraint admission and enforcement (Q02):** `CREATE TABLE`
  preserves and enforces `NOT NULL`, single and composite `PRIMARY KEY`,
  single-partition `UNIQUE`, and `DEFAULT` literals across catalog metadata,
  distributed write validation, and physical SQLite bootstrap, while refusing
  unsupported `CHECK`, `FOREIGN KEY`, and non-partition-key `UNIQUE`
  constraints at admission time.
- **Split-key ordering for `TEXT` primary keys (Q03):** Partition boundary
  routing and backfill filter comparison compare `TEXT` keys lexicographically
  instead of coercing numeric prefixes (`"10a"` vs `"2"`).
- **Bootstrap HTTP ingress authentication boundary (Q04):** Non-loopback
  Bootstrap HTTP binds require bearer-token authentication (`authToken` /
  `LAGRANGE_BOOTSTRAP_AUTH_TOKEN`) on `/sql`, `/partitions/*`, `/cdc/*`,
  `/cluster/*`, `/admin/*`, and `/services*`, while keeping `/health` and
  `/ready` unauthenticated for probes.
- **CLI & SEA service authoring and npm packaging (Q05, Q06, Q07):**
  `lagrange service init` scaffolds multi-partition key-routed SQL, `lagrange
  service pipeline` runs `init -> generate -> build` in one command, SEA
  invocations return a dedicated `SEA_SERVICE_BUILD_UNSUPPORTED` diagnostic,
  `wit/` and `@bytecodealliance/componentize-js` ship in `lagrange-server`
  consumer installs, `blessed-contrib` is replaced by an owned table widget,
  and `npm audit --omit=dev` reports zero vulnerabilities.
- **Bounded Raft storage and inbound queue (Q08, Q09, Q10, Q11):**
  `RaftRsDurableStore` compacts `raft-rs-store.ndjson` at checkpoint boundaries,
  `RaftRsRuntimeOwner` drains inbound messages iteratively with a bounded queue
  (`MAX_INBOUND_QUEUE_DEPTH = 4096`), and `PartitionSnapshotCadence` honors
  configured entry/interval thresholds and compacts `_raft_rs_log` across both
  TX1 and legacy commit paths.
- **Provenance, capabilities, Helm, and container hardening (Q12–Q17):**
  `ProofAuthority` records attributable producer metadata, `vendor/raft-rs-wasm`
  provenance digests and `docs/current-capabilities.json` are reconciled,
  `Dockerfile` runs as non-root `USER 10001:10001` with writable `/data`, Helm
  templates isolate Admin WebSocket ingress (`8081`) when `admin.enabled=false`,
  and Docker Hub overview rendering filters out newer changelog sections.

### Known limitations
- **Rolling-restart convergence is a statistical property, not a bounded-time
  guarantee.** Eventual stabilization is proven for the rebalancer kernel, while
  bounded-time convergence under rolling restart remains a statistical latency
  tail (`docs/convergence-donewhen-metric.md`).

## [0.2.6] — 2026-10-27

Consensus cutover to the Rust `raft-rs` core through the WASM operation
port, with full partition snapshot compaction and follower reconstruction,
replicated two-phase transaction decision and participant apply, fresh-identity
message-group membership replacement, cold retained-seed handoff, and
systematic deterministic replicated SQL admission (epic `raft-rs-full-cutover`):

Formation health at cut time: `formation health: 0/20 passed (0%), 0 with a
starved seed`.

- Every node boot reserves a durable, monotonic boot incarnation from one
  owner per data directory before any lifecycle side effect; legacy
  rejoin hints are a one-time migration source only, and `bootIncarnation`
  is a required option of the public bootstrap and join services.
- `ReplicaStateMachine` is the sole lifecycle owner per partition-replica
  and message-group row: every transition is an exact-generation
  conditional update, activation checks the exact transport handler inside
  the lifecycle lane and holds it through the durable ACTIVE write, and
  handler retirement is exact-identity only. Executor-created replicas are
  born STOPPED and activate through the same lane.
- Reaped node generations are terminal: liveness, endpoint refresh and
  delayed READY work from a superseded incarnation can no longer mutate a
  successor's rows; bootstrap-snapshot addressing only breaks the initial
  connection circularity and never out-ranks an authoritative NODES row.
- Automatic `raft-rs` partition snapshot creation, retention sweep, committed
  log compaction (`_raft_rs_snapshot` / `_raft_rs_log`), interrupted compaction
  retry across leadership changes, pending-log byte growth trigger, and
  follower snapshot catch-up reconstruction.
- Replicated transaction coordinator decision persistence, participant staging
  and deterministic apply (`TX1`), and fresh-identity message-group learner
  admission, caught-up promotion, replacement, and source removal (`FreshMG`).
- Cold retained-seed continuation and handoff across restarts, system-table
  client ingress refusal at both engine and partition boundaries, and
  deterministic replicated SQL write and schema-default admission across
  date/time, version, randomness, connection-state, and user-defined functions.
- One replica lifecycle owner per live node incarnation across join
  retries, with timers on the node's canonical time source.
- The vendored `raft-rs` WASM binding ships in the Docker image and the
  packaged runtime.

### Removed
- Intentional public-API removal (alpha single-path mandate, owner decision
  2026-10-26). These exports of the package root (`lagrange-server`,
  `src/public-api.js`) were retired implementations with no production
  constructor; `MessageRouter` is the one transport and `ReplicaHandler` with
  `ReplicaStateMachine` is the one replica lifecycle path. No replacement
  export is provided:
  - Transport (from `src/transport/index.js`): `WebSocketTransport`, its
    `ConnectionState`, `WebSocketTransportProvider`, `WS_PROVIDER_SUBSYSTEM`,
    `WS_PROVIDER_LOG_MSG`, `WS_PROVIDER_ERROR_MSG`, `TransportProvider`,
    `TransportRegistry`, `REGISTRY_SUBSYSTEM`, `REGISTRY_LOG_MSG`,
    `REGISTRY_ERROR_MSG`, `ConnectionPool`, `POOL_SUBSYSTEM`,
    `POOL_LOG_MSG`, `POOL_ERROR_MSG`. `MessageRouter`,
    `RouterConnectionState`, `RouterMessageType` and `RPCClient` remain.
  - Replica lifecycle (from `src/node/index.js`): `ReplicaLifecycleManager`,
    `LifecycleReplicaStatus`, `VALID_STATUS_TRANSITIONS`,
    `LifecycleMessageType`, `AckStatus`.
- The unexported `RouterMessageHandler` module (a dead duplicate of the
  router's inbound dispatch, imported by no module).

## [0.2.5] — 2026-09-13

The first 0.2 release that ships. `v0.2.0`, `v0.2.1`, `v0.2.2`, `v0.2.3`
and `v0.2.4` were tagged but never published: each tagged run stopped
before any artifact left the runner (0.2.2 in the Docker smoke test, 0.2.3
and the first two release candidates at the npm publication owner's
ten-second observation window, 0.2.4 at the release identity step, which
ranked `v0.2.4-rc.2` above `v0.2.4` with git's default version sort and
refused to "move latest backward"), so no npm version, Docker image, Helm
chart or GitHub release exists for them; npm served `0.1.1` under `latest`
throughout. The
release pipeline was then published end to end on the production path
under `v0.2.4-rc.0`, `-rc.1` and `-rc.2` (npm under the `next` dist-tag,
Docker tagged with the version only, GitHub pre-releases), with each run's
publication receipt committed under `data/releases/` and re-read from the
registries. No functional change since the `v0.2.3` tag beyond the release
apparatus itself.

### Fixed
- The release identity step derives the latest tag with prereleases ranked
  below their release (`versionsort.suffix=-`), so the first release after a
  release candidate is no longer refused as moving `latest` backward.
- The npm publication owner observes the registry for minutes and types an
  accepted, still-processing publish as such instead of reading npm's
  post-publish processing latency as absence.
- The release workflow writes its publication receipt from what the
  registries report, asking only for fields the runner's tools expose, and
  the values it observes reach the receipt writer.
- `release:preflight` requires the tagged SHA to be proven and on the
  remote main history, no longer the remote tip, so landings can publish
  behind a running release proof without invalidating it.

## [0.2.4-rc.2] — 2026-09-12

Pipeline dry run, third attempt. No functional change since the `v0.2.3`
tag. `v0.2.4-rc.0` and `v0.2.4-rc.1` both reached npm under the `next`
dist-tag; each run then stopped because the npm publication owner watched
the registry for ten seconds while npm was still processing the publish and
read absence as failure, so Docker, Helm and the GitHub release were never
attempted. The owner now observes for minutes and types an accepted,
still-processing publish as such.

## [0.2.4-rc.1] — 2026-09-12

Pipeline dry run, second attempt. No functional change since the `v0.2.3`
tag. `v0.2.4-rc.0` reached the npm publication step and stopped there - the
same boundary where 0.2.3 stopped - with `npm publish` exiting 0 and the
registry unchanged; the npm publication owner now carries npm's own output
in that verdict, so this run can explain itself.

## [0.2.4-rc.0] — 2026-09-12

Pipeline dry run. No functional change since the `v0.2.3` tag: this
prerelease exists to publish the release pipeline end to end on the
production path under a prerelease semver - npm under the `next` dist-tag,
Docker tagged with the version only, the GitHub release marked pre-release -
and to record the first publication receipt at `data/releases/`.

## [0.2.3] — 2026-09-11

This forward patch preserves the immutable `v0.2.2` tag after its release
workflow completed the full release proof and build but stopped in the Docker
image smoke test before publishing npm, Docker, Helm, SEA, or GitHub artifacts.

### Fixed
- The production Docker image now retains `node-sql-parser/build`, which
  contains the SQLite and PostgreSQL dialect modules imported by the runtime
  SQL parser. The v0.2.2 image build pruned that directory, so the release
  smoke test failed with `ERR_MODULE_NOT_FOUND` before any artifact publication.

## [0.2.2] — 2026-09-11

This forward patch preserves the immutable `v0.2.1` tag after its release
workflow stopped in the full pre-release proof, before publishing npm, Docker,
Helm, SEA, or GitHub artifacts. It includes the `0.2.1` changes described below.

Formation health at cut time: `formation health: 0/0 passed (0%), 0 with a
starved seed`.

### Fixed
- The Admin CDC release proof now gives synthetic notification operations one
  isolated cache owner while retaining a separate real shared-cache wiring
  witness. A deterministic authoritative-absence sweep and exact ordered event
  assertions prevent a repair DELETE from preempting or impersonating the
  intended INSERT, UPDATE, and DELETE operations.

## [0.2.1] — 2026-09-10

This forward patch preserves the immutable `v0.2.0` tag after its release
workflow stopped before publishing npm, Docker, Helm, SEA, or GitHub artifacts.
Formation health at cut time: `formation health: 0/0 passed (0%), 0 with a
starved seed`.

### Fixed
- The admin CDC release scenario now uses the canonical isolated fixture and
  authors monotonically causal mutation timestamps, so a legitimate
  authoritative-absence fence cannot discard its synthetic INSERT.
- Admin notification ownership is stable and serialized across same-cache
  binding, cache handoff, shutdown, and restart, with typed atomic propagation
  to every cache-backed child owner.
- Admin control, preflight, and service-discovery work is generation-bound
  across every awaited boundary: fulfilled or rejected retired-owner work is
  discarded and re-driven, current-owner failures remain visible, and repeated
  owner churn fails closed at a bounded attempt count.
- Change-scoped CI now compares the semantic installed dependency graph in
  `package-lock.json`, so a coordinated root version-only release edit runs the
  release-packaging proof while real graph changes and unreadable lockfiles
  still require the full release proof.

## [0.2.0] — 2026-09-10

The 0.2 _Stable Core_ work (`RM-0.2-*` rows in
`docs/development/agpl-feature-map.md`) landed on `main` with Solver-verified
evidence. The release process changed on 2026-09-05
(`RELEASE.md`): a tag proves what is deterministic about its bytes (full
corpus green on the exact SHA, artifacts built and smoke-tested by the tag
workflow, an honest changelog), and five-node formation is a measured
standing signal rather than a release gate.

Formation health at cut time: `formation health: 0/1 passed (0%), 0 with a
starved seed`. The 2026-09-10 scheduled record on `9bf8bc0` was `UNKNOWN` with
`seed_log_unavailable`: the run never provisioned because the workflow's
ordinary `npm ci` omitted the GCP harness's deliberately optional Pulumi
packages. This release repairs that installation boundary; the record is not
a formation verdict. The latest actual measurement remains the 2026-09-05 run
on `103786ef3`: five-node MovieLens formation failed with
`seed_event_loop_starved` after 49.8 s of unexplained seed blocking inside a
135 s window. A bounded three-run five-node GCP formation-only streak last
passed on 2026-08-30 (42.8 s / 38.1 s / 35.9 s), also the date of the last
full MovieLens GCP pass.

### Added
- Five-node cold formation: an operation-ledger formation barrier with a
  spread cure (closure CL-044) so joiners held on priority spread no longer
  stall cold formation, and a versioned, incarnation-bound formation-release
  handoff authority that carries the whole-plane priority-spread observation
  through to release.
- Startup active-gate convergence after authoritative-discovery repair
  backoff: the active-gate owner re-evaluates cluster-ACTIVE when the repair
  owner's evidence revision advances, without re-admitting repair or weakening
  the anti-storm backoff (`architecture/contracts/active-gate-convergence.md`).
- Release scenario producers for the sealed 0.2 frontiers: G2 five-node
  convergence (cold formation, user-table readiness, runtime-service
  placement) and G3 compacted-follower snapshot integration, plus the GCP
  memory-soak configuration (one node per VM) and a GCP A/B runner whose
  fixed/reverted sources must differ by fingerprint before a run is admitted.
- Memory-soak enforcement: leak admission consumes only node-owned process
  RSS, container capacity shares one reclaimable-cache-adjusted working-set
  owner, and the sustained-write soak fails closed when required per-node
  analysis is missing.
- Readiness-planning and owner-key reconcile-queue diagnostics with fixed
  retention bounds and exact drop accounting; GCP affinity teardown
  materializes every captured full-node log; harness failure bundles collect
  each node's logs through that node's own provider.
- Five-node formation-time priority recovery no longer straddles the 60-second
  certification window: priority control-plane ADDs dispatch concurrently
  under the existing `maxConcurrentAdds` budget (the create-budget turn now
  ends after persist and claim), the operation-ledger self-move hold engages
  only once the self-move is dispatch-admissible and cannot be overtaken
  indefinitely by later ADDs, the held self-move is released only by its own
  terminal row (no second ledger self-move can be admitted), a failed
  cluster-wide idle census retries on the dispatch cadence, and a locally
  owned self-move parked behind live incumbents carries typed park evidence so
  the priority-recovery drain no longer stale-fails it.
- Learner promotion proofs are event-driven: a learner re-requests its proof
  when its own services row becomes visible or the published membership epoch
  changes, refusals carry a typed cause (`learner_address_unresolvable`,
  `request_shape`, `response_binding_mismatch`, `leader_unreachable`,
  `delivery_failed`) logged at info, and an unresolvable-address refusal
  re-asserts the learner's durable services row; proof deliveries carry the
  router-configured message timeout explicitly.
- Joiners consume the seed-owned formation-release handoff contract (a typed
  AUTHORITY/CONSUMER validation role) so a captured JOINING cohort is released
  from the whole-plane authority answer across a priority-spread reopen; a
  non-hosting joiner's consumer read of the authority publication rides a
  typed priority-recovery bootstrap read lane exactly as the seed's write
  does, the validated cached authority row is a typed fallback, and the seed
  mints a successor generation when a captured generation completes after the
  reopen was observed so late joiners no longer wait for the raw three-way
  spread cure. The transport boot-incarnation fence binds both connection
  directions (the acceptor answers an adopted primary IDENTIFY once) and an
  unknown existing incarnation never yields in a cross-connect.
- A joiner honestly waiting inside the formation barrier logs a typed
  still-waiting line on the existing liveness-refresh cadence (wait reason and
  elapsed time) and a rate-limited debug line when the gate's evidence
  advances.
- Five-node certification tooling: the GCP formation runner has a bounded
  `--runs N` certification mode (N pinned to the sealed consecutive count,
  refuses dirty sources or fingerprint drift, halts at the first failed run,
  writes a projection-only streak report), the analyzer classifies a
  generation retained uncompleted at teardown as its own failing invariant and
  reports completion across every generation, and
  `npm run analyze:formation-release-phases -- <report-dir>` prints the
  per-node W → handoff → release → READY timeline.
- Readiness planning owner: one node process owns exactly one readiness
  planning owner (the per-partition duplicates are gone), readiness evidence
  is generated per node and keyed on content rather than on observation
  time, membership-publication planning consumption has one owner, a
  completed readiness snapshot is reused across unclassified source changes
  instead of being rebuilt on every table write, and query routing served
  through the single owner stays open across the system-table cache's
  node-table lag window (heartbeat and lease lag are bridged at read time
  for routed reads only; a STOPPED or DISCONNECTED node row still vetoes
  stale-positive reuse immediately).
- Node liveness: every time-dependent node-liveness decision (ready lease,
  heartbeat staleness, connection state) is projected by one semantic owner.
- Membership epoch binding: a `replica_operations` row whose membership
  publication epoch is SQL NULL rehydrates as UNBOUND through one decode
  owner (it used to decode as epoch 0 and fail the dispatch epoch gate), and
  the current published epoch reads as unreadable rather than 0 before the
  first PUBLISHED publication.
- Critical placement: convergence is driven from authoritative owner
  evidence, the critical system-partition distinct-node invariant is defined
  and proved, the desired replication factor has one authority contract,
  every behaviour-changing desired-placement consumer converges, and a
  causal-trace tool names the first broken transition in a live formation.
- Release and CI tooling: the publisher streams its gate stage by stage and
  fails the mutation check early, the two `main` workflows carry distinct
  run names, `TAP_TIMEOUT_FLOOR` is a lane floor that never caps a declared
  test budget, and the MovieLens dataset fetch has a digest-pinned fallback.
- Release process: `npm run release:preflight` evaluates the release-exit
  facts and prints the exact tag commands; `npm run check:formation` is the
  local seed-starvation gate (five local node processes through schema
  admission, seed event-loop budget); `npm run health:formation` appends one
  formation-verdict record per run to a trend and the scheduled
  `formation-health` workflow runs it nightly on GCP; every live demo report
  carries a machine-readable `formationVerdict` with its causal chain. The
  digest-bound release row Quests, the seven local gate receipts and the
  release verification scenario producer were removed (`RELEASE.md`).
- Solver tooling (internal): `preflight`, `reattempt` and `rebase-epoch`
  verbs, a verifier-rejection repair amendment path, one override per
  logical run with a visible budget, observation-severity findings, new-code
  complexity admission scoped to each ratchet's trees, review delta
  manifests, in-process subtest receipts, and a harness scaffold.

### Changed
- Topology-operation safety: removing a FAILED or SYNCING replica succeeds
  through every removal writer; a replica operation that retires a source
  replica rests terminal only when the retired replica's ACTIVE service is
  gone from routing; a replica CREATE failure is published only after any
  created local PartitionService is non-promotable and unroutable.
- Operation ledger: the quorum-spread hold can no longer defer its own cure
  once a surplus placement occupies every distinct node; a disruptive
  self-move publishes one durable PENDING intent before waiting so dependent
  admissions cannot starve it.
- Release automation: npm publishing uses Trusted Publishing (OIDC) instead
  of a stored token; the GCP release runner wakes and stops itself around a
  tag push; `gh` is installed with the gate tools; the local push-gate test
  corpus retries a failed file once.
- Solver tooling (internal): landing review has one owner per subsystem with
  an immutable review envelope, and landing tolerates candidate diffs larger
  than the default child-process buffer.
- Solver tooling (internal): landing never commits source bytes outside the
  recorded attempt union, the pending step's pin is the single attempt base,
  another Quest's regenerated evidence is excluded from a capture, registered
  generated outputs are covered at landing when byte-identical to a fresh
  regeneration, and the evidence harness runtime accepts `--output`.
- Readiness planning under formation load: the planning snapshot owner no
  longer defers unboundedly on token status alone, the canonical readiness
  identity owner recognises its own normalised output, memo freshness is
  keyed on the publication version, and a snapshot lane still in flight at
  its deadline is classified as blindness rather than as an inactive cluster.
- Managed split of a user table under write load resumes its persisted plan
  instead of re-planning, a distributed write that fails on a participant
  surfaces the first failed participant in the admin envelope, and a joiner
  whose services cache missed a late row converges through the routing
  table.

### Fixed
- Seven-node formation no longer strands critical system tables in seed-only
  placement: authoritative absence is causally fenced against stale cache
  resurrection, including delete/recreate and CDC/tombstone races, and repair
  continues through the serving-leader authority path until placement spreads.
- Membership-publication owner scenarios now use one prototype-complete
  coordinator host. Repeated real driver ticks expose rejected async refreshes
  and cannot leave the in-flight latch silently stuck after the first tick.
- The scheduled GCP formation-health workflow installs the exact-pinned Pulumi
  boundary that its provisioner dynamically imports; a contract test keeps the
  packages optional for ordinary installs while preventing another no-run
  `seed_log_unavailable` health record.
- The formation-release GCP analyzer classifies a generation revoked by a
  valid disconnect after the authority began draining as teardown-truncated
  rather than stranded, and the reverted-control verdict reads the analyzer's
  real invariants.
- The three-node seed rebalance integration lane no longer sleeps its
  discovery window through convergence, and a closed-log commit race no
  longer raises a false "no durable progress" at teardown.
- `npm pack` output stays parseable: the hooks installer's prepare-lifecycle
  diagnostic moved to stderr.

## [0.1.1] — 2026-08-22

Maintenance release. First release published by the GitHub Actions release
workflow (the sole release owner going forward): the `v*` tag drives the full
release gate, checksummed SEA and Helm artifacts, the GitHub Release page,
Docker Hub images, and the first `lagrange-server` npm publication.

### Added
- Per-release notes on every release surface, generated from this changelog
  (`scripts/release-notes.js`): the GitHub release page carries the
  tagged version's section instead of boilerplate, the Docker Hub repository
  description gains an auto-updated per-release "Release notes" history, and
  the Docker image carries OCI provenance labels
  (`org.opencontainers.image.version/revision/created`). Tagging a version
  without a non-empty changelog section now fails the release in seconds.

### Fixed
- The admin dashboard's playback viewer read memory fields the recorder no
  longer emits, rendering a dead `0.0 MB` memory row and hiding capture
  errors for new recordings. The admin static viewer is now the single
  checked-in copy, shows process RSS and the reclaimable-cache-adjusted
  container working set, and the test harness ships that same file into every
  scenario bundle.

### Removed
- The broken `test:coverage` npm script (`tap test/` exceeds the OS argument
  limit; use the sharded `test:*` scripts instead).
- Helm chart publication of the unauthenticated admin listener. Chart-managed
  pods now bind admin to loopback and reject the original insecure values;
  REST `/health` and `/readyz` remain available through the Services.
- Seventeen dead symlinks under `scripts/` that pointed at an external
  tooling pack via an absolute path that never resolved.

## [0.1.0] — 2026-07-02

First tagged release. **Experimental / alpha** — Lagrange is a research-grade
distributed SQL database and compute-near-data runtime. It is substantial and
extensively tested, but not production-hardened; see _Known limitations_ below.

### Added
- Distributed SQL over Raft-replicated partitions with a shared execution path.
- Compute-near-data runtime: distributed functions and services co-located with
  the partitions that own the relevant data.
- Unified rebalancer with load-aware placement; runtime services are first-class
  rebalancer entities (a partition is a service).
- SWIM/Lifeguard failure detection, shipped default-on and unconditional.
- Postgres wire (`pgwire`) SQL endpoint, registered as a managed service (a bare
  node exposes 8080/8081/8082; the SQL endpoint is started on demand, not at boot).
- Deterministic/directed testing substrate: virtual clock, seeded RNG, and PCT
  scheduling for reproducible convergence and safety investigations.
- Distroless Docker image and single-executable (SEA) builds.

### Changed
- Package version set to `0.1.0` (was an internal `1.0.0`); user-facing
  `--version` output (admin CLI and node entrypoint) now reports the release
  version, guarded against drift by a test.

### Fixed
- Raft safety: same-index stale-commit (CL-040), vote double-vote TOCTOU
  (CL-041), and empty-log-term masquerade (CL-042).
- Node restart with a new IP: stale-seed-vs-canonical reconciliation and
  keepalive/pong severing on transport re-resolution.
- Durable node identity: a node started without an explicit `NODE_ID` now
  restores its persisted identity from the data directory on restart instead
  of minting a fresh UUID and refusing to start over its own durable state
  (identity mismatch). Enables orchestrators (Kubernetes, plain restarts) to
  restart nodes onto their volumes without pinning `NODE_ID`.
- SEA single-executable boot: dynamic imports with const-variable specifiers
  were silently left out of the esbuild bundle, so the binary could never
  boot the full system (`ERR_MODULE_NOT_FOUND`); the entrypoint and SQL
  runtime composition imports are now literal and bundled.
- Dockerfile `EXPOSE` corrected to the real listener set 8080/8081/8082
  (nothing listens on the previously exposed 9080).
- Test gating: in-process tests asserting bounded-time convergence
  (node-join SLO, multi-join formation) moved out of the blocking `test:ci`
  lanes into an on-demand statistical lane (`npm run test:convergence-probes`)
  — per-run bounded-time convergence is exactly the property this release
  documents as statistical and hardware-relative, so it cannot be a
  deterministic gate; the shard generator now supports (and existence-checks)
  such curated exclusions.
- Control-plane readiness: stored readiness snapshots could be reused while
  the live local query-transport verdict had flipped (transport evidence is
  live router state and advances no heartbeat watermark or cache marker), so
  owner-read participation could answer `ready` with the transport down — or
  keep deferring after it recovered. Snapshot reuse now rebuilds on local
  query-transport drift.

### Known limitations
- **Rolling-restart convergence is a statistical property, not a bounded-time
  guarantee.** Under a rolling restart the cluster settles into either a
  convergent basin or a slow/limit-cycle basin. *Eventual* stabilization is
  proven for the sole residual head (a monotone Φ-fixpoint over the real
  rebalancer kernel), but *bounded-time* convergence within any fixed window is
  a latency tail near its statistical floor. The measured per-run scenario-PASS
  rate is ≈25–33%; the release does not promise convergence by a specific
  deadline. See `docs/convergence-donewhen-metric.md`.
- **Safety is the hard floor and is never relaxed.** Every certified run holds
  the safety invariants (no data corruption, no unexpected node exit, no
  blind/stale oracle reads); convergence *latency* is the residual, not
  correctness.
- No autoscaler for load; scaling is operator-driven.
- Alpha surface: SQL coverage, wire protocols, and admin/CLI behaviour may
  change between `0.x` releases without migration guarantees.

[Unreleased]: https://github.com/psvensson/lagrange/compare/v0.4.0...HEAD
[0.4.0]: https://github.com/psvensson/lagrange/compare/v0.3.3...v0.4.0
[0.3.3]: https://github.com/psvensson/lagrange/compare/v0.3.2...v0.3.3
[0.3.2]: https://github.com/psvensson/lagrange/compare/v0.3.0...v0.3.2
[0.3.0]: https://github.com/psvensson/lagrange/compare/v0.2.8...v0.3.0
[0.2.8]: https://github.com/psvensson/lagrange/compare/v0.2.7...v0.2.8
[0.2.7]: https://github.com/psvensson/lagrange/compare/v0.2.6...v0.2.7
[0.2.6]: https://github.com/psvensson/lagrange/compare/v0.2.5...v0.2.6
[0.2.5]: https://github.com/psvensson/lagrange/compare/v0.2.3...v0.2.5
[0.2.4-rc.2]: https://github.com/psvensson/lagrange/compare/v0.2.4-rc.1...v0.2.4-rc.2
[0.2.4-rc.1]: https://github.com/psvensson/lagrange/compare/v0.2.4-rc.0...v0.2.4-rc.1
[0.2.4-rc.0]: https://github.com/psvensson/lagrange/compare/v0.2.3...v0.2.4-rc.0
[0.2.3]: https://github.com/psvensson/lagrange/compare/v0.2.2...v0.2.3
[0.2.2]: https://github.com/psvensson/lagrange/compare/v0.2.1...v0.2.2
[0.2.1]: https://github.com/psvensson/lagrange/compare/v0.2.0...v0.2.1
[0.2.0]: https://github.com/psvensson/lagrange/compare/v0.1.1...v0.2.0
[0.1.1]: https://github.com/psvensson/lagrange/compare/v0.1.0...v0.1.1
[0.1.0]: https://github.com/psvensson/lagrange/releases/tag/v0.1.0
