# Requirements: Pilot Readiness and Public-Path Proof

Epic: [`solve/epics/pilot-readiness-and-public-proof.md`](../../epics/pilot-readiness-and-public-proof.md).
Design decisions cited below as D1–D12 are the epic's binding decisions and are
authoritative; this spec restates them as per-Quest requirements and does not
override them.

## Scope and claim rule

This spec covers the twelve Community/AGPL Quests that take the code-first
public WASM service path from a bounded demo contract to a pilot-ready,
publicly provable product surface. Every capability lands on the one canonical
execution path (D1) through its existing owner (D11), is reachable from
code-first authoring (D2), and is proven on the public path with reproducible
receipts (D6, D7). Documentation alone never closes a Quest (D10), and every
success path ships with its failure cases (D12).

Out of scope for this repository, per D8/D9 and `edition-matrix.md`:
commercial backup/restore/PITR, enterprise SSO/RBAC/tenancy/policy providers,
secrets/KMS integrations, and cross-region durability. Cryptographic node
transport is explicitly NOT external — it is core cluster safety (D8).

Seven Quests carry their own detailed design spec as a sibling document in
this directory (named per section below); this requirements file is the
epic-level contract each of those specs must satisfy. Each Quest's acceptance
bar is its sealed `doneWhen`: the named `scenario-harness` scenario green three
consecutive times on live evidence.

## Public path baseline

Quest: `public-path-multinode-baseline` (Q1, gate).

- A named baseline scenario SHALL compile a code-first JavaScript service into
  a genuine WASI component, deploy it only through generated lifecycle
  records, and invoke it through authenticated HTTP on a cluster whose data
  partitions live on at least two nodes.
- The harness SHALL record per-host local row reads, partial bytes, final
  bytes, latency distributions (p50/p95/p99), CPU, peak memory, retries, and
  topology, and SHALL prove result parity against an independent oracle — not
  against the service under test.
- No internal `native_js` or legacy-callback substitution can satisfy the
  scenario (D1, D6); shard rows SHALL be proven read locally on at least two
  partition-host nodes with no raw shard-table query delivery across the
  message router.
- The scenario SHALL fail if the WASM path is replaced by `native_js`, if both
  partitions land on one host, if metrics are synthetic, or if parity is
  self-referential (red-on-revert).
- The emitted report schema (digests, topology, local-read proof, latency
  percentiles, bytes by channel, CPU, peak memory, retries, fidelity `live`)
  SHALL be stable enough for the scale/failure certification Quest to consume
  unchanged (D7).

Acceptance: `scenario-harness` scenario `public-path-multinode-baseline`,
3 consecutive, metric `priority`. Non-goal: no new harness machinery — the
scenario registry, harness runner, and service pipeline remain the owners
(D11); this Quest is evidence substrate, not runtime change.

## Typed selector narrowing

Quest: `call-selector-typed-parameter-narrowing` (Q2, gate).

- A distributed operation SHALL be able to declare typed selector parameters
  whose values come from the authorized invocation arguments and bind through
  the canonical SQL parameter path; the Binding remains the owner of statement
  shape and permitted parameters (D3, D11).
- Partition planning and local SQL SHALL use the same normalized parameter
  set, with byte-identical values at planner and partition-host executor; SQL
  text remains immutable and parameters participate in Binding digest/version
  fencing.
- Unknown or type-invalid parameters SHALL fail before dispatch. The caller
  cannot choose a table, column, operator, tenant, or arbitrary SQL; no SQL
  template-string interpolation is enabled (D3).
- The code-first compiler SHALL generate the declaration without exposing raw
  Binding names or SQL concatenation (D2); raw Binding JSON tests are
  diagnostic only and cannot satisfy `doneWhen` (D6).
- Semantics for nulls, numbers, strings, ranges, and missing values SHALL be
  defined and tested; restoring full scatter (removing narrowing) SHALL fail
  the local-read/rows-scanned metric (red-on-revert, D12).

Acceptance: `scenario-harness` scenario
`call-selector-typed-parameter-narrowing`, 3 consecutive, metric `priority`.
Non-goal: no second planner or alternate statement builder.

## Paged execution

Quest: `call-shard-paged-execution` (Q3, gate). Detailed design spec:
`paged-execution.md` in this directory (required before implementation by the
Quest's `spec-before-code` constraint: cursor model, snapshot behavior across
pages, component ABI, partial limits, cancellation/deadline cleanup, ambiguous
retry, movement between pages, retained coordination state).

- A call shard whose declared selector exceeds one batch SHALL execute through
  a bounded deterministic page protocol owned by the existing call batch
  executor; the invoker and reduce coordinator keep orchestration and
  completion ownership (D11).
- Every page SHALL have stable invocation/shard/page identity, advance a
  monotonic cursor, honor the one absolute deadline and resource budgets,
  apply backpressure, journal replay safely, and contribute to one complete
  result without materializing the full shard or silently skipping rows (D4).
- Silently raising `BATCH_ROW_BOUND` or other defaults until a test passes is
  a failing result (D4).
- The live scenario SHALL cover inputs well above 4096 rows per selected shard
  with no lost or duplicate rows, retry and restart, replica movement between
  pages, deadline exhaustion, backpressure, and an independent oracle;
  removing page identity, cursor persistence, or the memory bound SHALL fail
  deterministically (D12).

Acceptance: `scenario-harness` scenario `call-shard-paged-execution`,
3 consecutive, metric `priority`.

## Structured partials

Quest: `call-bounded-structured-partials` (Q4). Detailed design spec:
`structured-partials.md` in this directory.

- The call coordination contract SHALL accept a versioned canonical structured
  partial value with a closed type grammar — null, boolean, safe integer,
  finite float, string, bounded list, bounded record with lexical field order —
  and explicit byte/count budgets (D5).
- One canonical encoding owner SHALL exist (canonical binary or canonical
  JSON); guests and hosts agree on it, replay is byte-stable, and reducer
  input is deterministic. The routing contract and reduce coordinator remain
  the validation/merge owners — no second partial codec (D11).
- Malformed, oversized, prototype-polluting, or non-canonical values SHALL
  fail closed; duplicate cross-shard keys SHALL keep the disjoint-keys
  fail-closed semantic for the first release (no silent merge or
  double-counting) unless an algebraic merge contract is separately specified
  (D5).
- Backward compatibility: previously valid numeric-key partials SHALL continue
  to validate and reduce unchanged; the account-summary example moves to one
  structured record per shard. Generated editor types SHALL be exposed from
  the code-first compiler (D2).

Acceptance: `scenario-harness` scenario `call-bounded-structured-partials`,
3 consecutive, metric `priority`.

## Service cell v2 default

Quest: `service-cell-v2-default-multi-operation` (Q5).

- The default code-first generate/build/deploy pipeline SHALL emit the
  current handler-aware service-cell and Binding contract: at least two
  distributed operations and multiple HTTP handlers in one component, each
  call routed by immutable operation identity, with generated per-handler
  least-authority policies.
- This is default-cutover plus compatibility work, not new mechanism work
  (epic decision log, 2026-08-07): the v2 mechanism is landed and SOLVED; the
  service-source contract, entry generator, deployment-record generator, and
  `CallCellInvoker` remain the owners (D11).
- The v2 path SHALL be the live default of the public CLI, evidenced by a
  fresh code-first multi-operation service building and invoking through the
  default commands; a flag that leaves v1 as the live default is an unfinished
  cutover and cannot outlive the session.
- Previously deployed v1 artifacts SHALL remain invocable with their existing
  behavior on the same node, without a second runtime path (D1, D11).
- Cross-operation confusion, stale handler or operation IDs, and per-handler
  policy escalation SHALL fail closed; the passing shape is a service exposing
  two routes that call different operations plus a route authorized for only
  one (D12).

Acceptance: `scenario-harness` scenario
`service-cell-v2-default-multi-operation`, 3 consecutive, metric `priority`.

## Learner promotion progress

Quest: `learner-promotion-progress-proof` (Q6).

- A partition learner SHALL become a voter only after the current leader
  proves the learner has applied through a safe promotion index for the
  current term and membership epoch; elapsed time is only a retry/backoff
  input, never the promotion condition.
- Snapshot-installed and log-caught-up learners SHALL use the same progress
  contract; stale leaders and membership changes SHALL invalidate the proof.
- The partition-service learner-promotion methods remain the promotion owner
  and the raft layer remains the replication-progress owner; the progress
  contract flows between them with no second promotion authority (D11).
- Promotion SHALL keep every existing quorum-shape gate (even-voter
  avoidance, target replica count, priority-control-plane behavior) and add
  the progress proof as a necessary condition; it must not reduce quorum
  safety or exceed the target voter count.
- Required attacks (D12): slow learner past the old timer, snapshot install
  still applying, leader change after proof collection, membership epoch
  change, learner reporting a future or stale index, restart between proof
  and promotion, even-voter and target-count pressure, priority control-plane
  partition behavior. A live five-node recovery scenario SHALL never promote
  a deliberately lagging learner and SHALL promote once the authoritative
  applied-index condition holds; reintroducing time-only promotion SHALL fail
  deterministically.

Acceptance: `scenario-harness` scenario `learner-promotion-progress-proof`,
3 consecutive, metric `priority`.

## Node transport security

Quest: `node-transport-authenticated-encryption` (Q7, gate). Detailed design
spec: `node-transport-security.md` in this directory (cluster CA, per-node
certificate and rotation model, bootstrap/first-node trust, identity binding
to admission record and boot incarnation).

- Node transport SHALL use one canonical TLS server/client composition with
  cryptographic peer authentication bound to cluster identity and logical
  node identity; unknown, expired, wrong-cluster, wrong-node, or untrusted
  certificates SHALL fail before MessageRouter adoption.
- The message-router server/connection authority and the bulk-transfer
  channel remain the transport owners; join, reconnect, bulk snapshot, and
  ordinary message channels SHALL share one trust owner — no parallel
  transport stack, per-channel trust model, or rotation-created parallel path
  (D11).
- Address changes SHALL be preserved without accepting identity changes;
  expiry and trust diagnostics SHALL be exposed without logging secrets.
- Insecure transport SHALL become test-only or an explicit local-development
  mode that cannot bind externally by accident; the default production
  composition refuses plaintext.
- Edition boundary (D8): this is core cluster safety and lands in the AGPL
  runtime. OIDC, customer RBAC, policy providers, KMS, and hostile
  multi-tenancy remain external per `edition-matrix.md`.
- Multi-node scenarios SHALL pass under mTLS and fail for wrong CA,
  wrong-cluster certificate, stolen certificate with mismatched node
  identity, expired certificate, plaintext downgrade, and rotation during
  load (D12).

Acceptance: `scenario-harness` scenario
`node-transport-authenticated-encryption`, 3 consecutive, metric `priority`.

## Bulk load

Quest: `resumable-bulk-data-load` (Q8). Detailed design spec: `bulk-load.md`
in this directory.

- A bulk-load command SHALL import a declared table from a versioned input
  stream through bounded batches with durable checkpoint identity, source
  offset, schema digest, row counts, checksums, idempotent replay, and
  restart recovery.
- Writes SHALL route through the canonical SQL/transaction owners; the loader
  owns checkpoint identity and replay — no bypass write path, no second
  transaction coordinator (D11).
- First scope is one narrow source format (newline-delimited canonical JSON
  or CSV with an explicit schema); PostgreSQL CDC is excluded from this
  Quest.
- Completeness SHALL be proven against an independent source checksum and
  key-range sample, never the loader's own success counter (D7); rejected
  rows SHALL be reported explicitly with reasons.
- Killing and restarting the loader and one cluster node mid-import SHALL
  resume with no duplicates and no gaps; removing checkpoint identity or
  idempotent replay SHALL fail reconciliation deterministically (D12).

Acceptance: `scenario-harness` scenario `resumable-bulk-data-load`,
3 consecutive, metric `priority`.

## Cutover rollback

Quest: `pilot-cutover-and-rollback-receipts` (Q9). Detailed design spec:
`cutover-rollback.md` in this directory.

- A pilot SHALL be able to record a versioned migration plan, complete an
  initial load, keep a bounded change feed or dual-write adapter until a
  declared high-water mark, run parity checks, switch selected traffic, and
  roll back.
- Every step (initial load, change feed, parity, cutover, rollback) SHALL
  produce a durable receipt naming source position, target state, outstanding
  divergence, and the exact decision (D7); success is never inferred from
  process exit or a disconnected client.
- One general receipt/workflow owner in this repository records plans,
  positions, parity, and decisions — no second migration-state store (D11).
  Source-specific PostgreSQL CDC integration stays in an external adapter,
  with that boundary explicit.
- Required failure cases (D12): source reconnect, duplicate change,
  out-of-order change, target outage, schema drift, cutover timeout, parity
  mismatch, rollback after partial traffic. Removing receipt durability,
  parity checks, or divergence accounting SHALL make cutover and rollback
  fail closed rather than silently proceed.

Acceptance: `scenario-harness` scenario `pilot-cutover-and-rollback-receipts`,
3 consecutive, metric `priority`.

## Postgres compatibility matrix

Quest: `postgres-compatibility-certification-matrix` (Q10).

- The repository SHALL publish a machine-readable compatibility matrix
  generated from live external-client scenarios against named driver versions
  and SQL features; the matrix is generated from test receipts, never
  hand-maintained prose (D7, D10).
- Each supported cell SHALL have a test receipt; unsupported cells are
  explicit rather than absent; a release cannot silently regress a supported
  cell — the matrix diff is checked in the release process.
- Initial clients: Node `pg`, `psql`, and one additional pilot-relevant
  driver selected from actual customer discovery; an ORM is not claimed
  merely because its underlying driver connects. Initial dimensions:
  startup/TLS/authentication, simple and extended query, parameter types,
  transactions, DDL, inserts/updates/deletes, result types, errors,
  connection pooling, prepared statements, cancellation behavior, and
  lifecycle SQL permissions.
- The pgwire runtime and existing compatibility tests remain the owners of
  wire behavior; this Quest adds matrix generation and the regression gate
  over their receipts — no second compatibility claim surface (D11).
- Wrong-password, wrong-CA, and unsupported-SQL attacks SHALL remain red;
  hand-editing the matrix without receipts or deleting a supported cell's
  test SHALL fail the gate (D12).

Acceptance: `scenario-harness` scenario
`postgres-compatibility-certification-matrix`, 3 consecutive, metric
`priority`. Edition boundary: PostgreSQL compatibility is Community/AGPL
scope per `edition-matrix.md`.

## Scale failure certification

Quest: `public-path-scale-and-failure-certification` (Q11, gate). Detailed
design spec: `scale-failure-certification.md` in this directory.

- On named hardware and a sealed multi-node topology, one code-first public
  WASM service SHALL process a representative data-intensive workload against
  a strong conventional PostgreSQL/application baseline, with result parity
  and declared bars for p95/p99 latency, transferred bytes, CPU, memory,
  throughput, retry rate, node-loss behavior, and recovery (D6, D7).
- Workload representativeness (epic decision log, 2026-08-07): the chosen
  workload SHALL exercise typed selector narrowing, input above one old
  batch, structured partials, more than one service operation, multiple
  partition hosts, and the public HTTP path.
- Sealed method: dataset and workload-generator digests sealed; repeated warm
  steady-state windows; machine, storage, network, release, and topology
  named; baseline and Lagrange under comparable durability; p50/p95/p99,
  throughput, bytes by channel, CPU, memory, retries, and errors reported; a
  non-seed data host stopped during load; acknowledged-result parity verified
  against an independent oracle; Wilson or other predeclared statistical bars
  where variance matters.
- The report SHALL record neutral or negative outcomes as faithfully as wins
  and cannot omit a measured dimension to reach a passing verdict; internal
  runtime substitution or synthetic metrics cannot satisfy it (D1, D6).
- This Quest consumes the Q1 report schema unchanged; scale-axis cardinality
  claims link to the `large-scale-data-plane-certification` epic and
  cost-efficiency comparison to `comparative-workload-efficiency-evidence`
  rather than duplicating either (D11). Any missing public-path proof,
  local-read proof, independent oracle, or failure drill makes the verdict
  non-terminal (D12).

Acceptance: `scenario-harness` scenario
`public-path-scale-and-failure-certification`, 3 consecutive, metric
`sealed-bar`.

## Support envelope

Quest: `supported-upgrade-and-recovery-envelope` (Q12). Detailed design spec:
`support-envelope.md` in this directory.

- A named supported topology SHALL perform the selected upgrade,
  downgrade-or-rollback boundary, one-node failure, wiped-replica rebuild,
  and service-artifact upgrade under foreground load while preserving
  acknowledged data and producing typed availability outcomes.
- The envelope is one machine-readable record consumed by the release
  process; it SHALL name exact source and target versions, schema boundaries,
  tested node counts and failure-domain assumptions, drain and readiness
  conditions, backup dependency if any, rollback cutoff, max tested replica
  size and rebuild window, expected availability behavior, and linked
  certification receipts (D7).
- This is an exact-version-pair envelope, not a generic "all rolling upgrades
  work" claim; mixed-version unsupported cases SHALL fail closed with an
  operator-readable reason, and the release process SHALL refuse claims
  outside the envelope — executable evidence, not prose (D10).
- Certification receipts from the dependency Quests (learner promotion, node
  transport, bulk load/cutover, scale/failure certification) are linked, not
  re-run or duplicated (D11).
- Removing acknowledged-data preservation checks, availability typing, or the
  outside-envelope refusal SHALL fail the scenario deterministically (D12).

Acceptance: `scenario-harness` scenario
`supported-upgrade-and-recovery-envelope`, 3 consecutive, metric `priority`.
