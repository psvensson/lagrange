# Requirements: Pilot Readiness and Public-Path Proof

Epic: [pilot-readiness-and-public-proof](../../epics/pilot-readiness-and-public-proof.md).
Design decisions D1–D12 and the epic's dated 2026-10-31 supersession govern
this planning contract. The edition-ownership correction below supersedes
their former commercial scope classifications only; no behavioral or sealed
acceptance predicate is changed.

## Edition-scope supersession (2026-11-01)

The current [edition matrix](../../../edition-matrix.md) assigns user
backup/restore/PITR, regional replication/locality, standard observability
and the authorization/isolation required by supported use to AGPL. External
commercial services own recurring recovery assurance, organization policy,
identity synchronization, managed fleet release, billing and audit reporting.
Old references to commercial-only backup, cross-region operation or basic RBAC
below are dated D8/D9 context, not binding new implementation scope. This pilot
still requires only its existing 0.5 operational proof and does not claim
1.0/1.2 feature completion.

## Release allocation and current baseline

Current planning reconciliation, 2026-11-12: source inspection compared main
`ef93af85dcd6add82ff5b5fee21ca12d205c61cd` with WIP
`dc29d85bedbbe4310bfcd4cf7e46e8b65a654b2d`. These are separate candidates;
WIP-only owners are explicitly pinned below. No test, lab run, red measurement
or receipt was produced by this documentation change. The epic's
[current sequence](../../epics/pilot-readiness-and-public-proof.md#current-convergence-decision-2026-11-12)
coordinates implementation; the following v0.4.0 description remains a dated
release baseline, not a claim that later main implementation is absent.

The exact reviewed release is v0.4.0 at
`07206ba1c8bb396f4eb097a753915bb34580d824`, published on 2026-10-31.
The release contains canonical artifact publication/store activation, binding
version pinning and JSON-object request-body normalization. It does not by
itself complete this epic's service envelope or public-path certification.

The single sequence is:

1. **0.4.1 bounded correctness:** reject aggregate partial count/byte overflow
   instead of returning a truncated generic reduction; enforce the SQL byte
   budget before a local batch is fully retained. Consume the admitted-reader
   custody and truthful pgwire continuations under operation integrity. These
   repairs consume the current contract and do not reopen ordinary SQL
   optimization or add a global snapshot/API.
2. **0.5 service and pilot milestone:** this epic retains Q2 typed selectors,
   Q3 explicit paged accumulation, Q4 structured partials and Q5 canonical
   multi-operation dispatch. The
   [standard HTTP service API](../standard-http-service-api/requirements.md)
   owns Hono/Fetch ingress, async guest integration and its bounded sequential
   request-scoped SDK client. The bounded read-worker/cancellation continuation
   follows current storage custody and native API feasibility. A coherent cut,
   mutating descriptor or optional SELECT alias requires its own capability
   decision within these existing owners. The owners integrate into one
   supported path.
3. Q7–Q12 remain this epic's operational pilot work with their existing
   dependencies. Q11 cannot pass without Q7 and the other declared prerequisites.
   Existing accepted prerequisites, including Q6, are consumed rather than
   reopened. Later OCI and deeper concurrent composition retain their owners.

This revision explicitly supersedes conflicting Q2–Q5 planning clauses:
parallel v1 compatibility paths, a custom per-handler routing/call DSL,
disjoint semantic group keys, implicit page combine, whole-batch run repeated
per page, and read-committed keyset continuity. It does not rewrite historical
Quest statements, logs or verdicts. The older source audit and decision log
remain dated evidence.

## Scope and claim rule

Every capability uses the canonical Binding resolver, invocation lifecycle,
partition-host execution, partial coordinator and reducer through their existing
owners (D1, D11). Code-first authoring must reach the capability through the
normal generate/build/publish/deploy journey (D2). Runtime activation consumes
sealed artifact bytes from the replicated payload store; local author files
may be used during build/publication, never as a deployment/runtime fallback.

User backup/restore/PITR, core authorization/roles/tenancy and regional
durability remain Community/AGPL in their assigned milestones; enterprise
organization SSO/SCIM, managed policies and secrets/KMS integrations stay
external per `edition-matrix.md`. Cryptographic node trust is Community/AGPL
cluster safety. Capability reports
and management outcomes must never claim implemented operations from synthetic
defaults; correcting a false positive does not authorize a new backup product.

Existing sealed Quest acceptance remains binding. Q2–Q5, Q10 and Q11 now have
sealed main records and historical terminal logs; descriptions below of a
proposed scenario are broader public-path requirements, not replacements for
those records' script predicates. Preserve both the original acceptance and
the outstanding production-composition obligation. New continuations are
unsealed until an actual red witness is measured. A planning contract is not
a run, a sealed verdict or a promise of performance. The epic's front-matter
probe remains unchanged.

A major feature's evidence must exercise real production composition: the
generated compiled component, actual WASI worker/call bridge, canonical
deployment and request ingress, and independent multi-node data hosts. Building
a component and then importing its source into a handwritten dispatcher does
not prove its runtime behavior. A second store owner sharing an in-process
database does not prove a node restart, replication or leader loss. Receipts
must retain exact source/artifact digests, original logs, actual host identities,
workload, failure points and observed outcomes. Modelled timings and claims
copied from earlier releases cannot satisfy a current measured result.

## Public path baseline

Quest: `public-path-multinode-baseline` (Q1, existing gate).

- A named baseline scenario SHALL compile a code-first JavaScript service into
  a genuine WASI component, publish and deploy it through the canonical
  lifecycle/payload-store owners, and invoke it through authenticated HTTP on
  a cluster whose data partitions live on at least two independent nodes.
- The harness SHALL record per-host local row reads, partial/final bytes,
  latency distributions (p50/p95/p99), CPU, peak memory, retries and topology,
  and prove result parity against an independent oracle.
- Actual production composition SHALL execute the compiled artifact. No
  internal native-JavaScript path, source-imported handler, handwritten
  dispatcher or legacy callback substitution can satisfy the scenario.
  Shard rows SHALL be read locally on at least two partition hosts without
  raw shard-table query delivery through the message router.
- Replacing WASI with direct JavaScript, placing all data on one host,
  substituting modelled measurements or making the oracle self-referential
  SHALL fail the relevant witness.
- The original report schema and exact-head provenance SHALL be retained for
  Q11 to consume. Missing proof is unverified; source inspection or a later
  summary cannot manufacture a passing result.

Existing acceptance: `scenario-harness` scenario
`public-path-multinode-baseline`, 3 consecutive, metric `priority`.
The scenario registry, harness and service pipeline remain the owners.
This is public-path evidence substrate, not permission to build a new harness.

## Typed selector narrowing

Historical Quest: `call-selector-typed-parameter-narrowing` (Q2).

- A distributed operation SHALL declare typed parameter slots for a fixed
  selector. Authorized invocation arguments supply values, not SQL syntax,
  identifiers, operators or tenant authority. No string concatenation is
  enabled.
- The existing planner SHALL normalize the typed vector once. The same
  canonical parameter bytes, slot order and digest SHALL reach partition
  selection, every local SQL execution and each page/retry. The partition
  host SHALL bind them through the existing SQL parameter mechanism, rather
  than re-deriving values from JSON or passing an empty parameter list.
- Selector/parameter schema belongs to the immutable operation/Binding
  generation; invocation values belong to its invocation/attempt identity.
  Both SHALL be fenced appropriately. A value change is a new invocation,
  not an in-place change to an existing page or retry.
- Missing, unknown, invalid, out-of-range and disallowed values SHALL fail
  before dispatch. Null, booleans, finite numeric types, text, ranges and
  empty values SHALL have explicit declaration and binding semantics.
  Caller data cannot impersonate platform-derived tenant/principal values.
- The compiler and generated SDK/types SHALL expose the declaration without
  raw Binding names or arbitrary SQL. The real public journey SHALL narrow
  rows before guest execution and prove results against an independent oracle.
- The witness SHALL detect restored full scatter, divergent planner/executor
  values, changed retry values, wrong-type/null handling and stale schema.

Ordinary SQL and locking-read parameter support already exist on v0.4.0.
They are reused; Q2 closes the service-selector plumbing and admission gap.
It does not reopen their completed access-path/query optimization work.

Proposed acceptance: scenario `call-selector-typed-parameter-narrowing`,
3 consecutive, metric `priority`, sealed on actual public-path evidence
before implementation. No second planner or statement builder.

## Paged execution

Historical Quest: `call-shard-paged-execution` (Q3). Full contract:
[paged-execution.md](paged-execution.md).
The unsealed 0.4.1 `retained-read-view-generation-custody` successor owns
physical handle retirement and pressure; the existing Q3 seal is unchanged.

- All inputs SHALL use one explicit bounded init/step/finish accumulator
  lifecycle, including the single-page case. State schema and bounds are
  declared; no host-invented combine law or repeated arbitrary whole-batch
  run is permitted.
- Each shard attempt SHALL read one stable retained read view. A keyset cursor
  gives position within that view, not continuity under read-committed changes.
  If the backend cannot supply the required view, admission SHALL refuse.
  The actual per-shard consistency scope SHALL be stated without claiming an
  unavailable cluster-wide snapshot.
- A resumable transition SHALL commit cursor, recoverable accumulator bytes,
  counters, read-view identity and accepted page identity atomically under the
  same attempt fence. Persisting only a cursor and digest is insufficient.
- If exact view/state/commit custody is lost, the invocation owner SHALL
  discard the whole attempt, fence all its contributions, and return a typed
  outcome or retry the entire invocation within its original deadline. It
  SHALL NOT resume a new view from an old cursor or mix old and new shard state.
- Row, early SQL byte, page, state, aggregate partial and retention limits SHALL
  apply before unbounded materialization. At most one page transition per
  shard is in flight; existing dispatch owners retain concurrency control.
- Independent multi-node evidence SHALL cover inputs well above 4096 rows per
  shard, uneven pages, concurrent data changes, ambiguous commits, duplicate
  deliveries, restart/movement, deadline/cancellation and bounded retention.
  Exact-boundary and single-page inputs SHALL traverse the same model.

Proposed acceptance: scenario `call-shard-paged-execution`, 3 consecutive,
metric `priority`. Stable-view, atomic-progress or whole-attempt-discard
weakening must fail the corresponding red witness. Defaults are not raised
to make the workload pass.

## Structured partials

Quest slot: `call-bounded-structured-partials` (Q4). Full contract:
[structured-partials.md](structured-partials.md).

- The operation SHALL declare typed finite-JSON values and state using one
  versioned canonical codec: null, boolean, bounded finite numbers, strings,
  arrays and records with explicit schema and resource limits.
- Runtime delivery identity SHALL be separate from the application group
  key. Distinct authorized deliveries with the same group key SHALL be
  preserved. Identical replay SHALL be idempotent; conflicting replay or a
  stale attempt SHALL fail closed.
- The coordinator SHALL supply every admitted contribution in a specified
  deterministic shard/emission order. The application reducer owns grouping,
  aggregation and explicit top-K. No implicit merge law, numeric ranking or
  generic truncation is allowed.
- Per-value, per-shard and aggregate count/byte/depth limits SHALL be enforced
  by the shared codec and existing coordination owners before excessive
  retention. Overflow SHALL prevent successful reduction of a subset.
- Numeric values remain a subset of the canonical grammar, with one wire
  contract. Old bare-number encoding is not a parallel compatibility path.
  Generated types and artifacts SHALL migrate through Q5's canonical cutover.
- The real account-summary journey SHALL include the same account group on
  multiple shards, structured sum/count contributions and independent total/
  weighted-average parity, plus replay, malformed input and aggregate-overflow
  attacks. A numeric-only single-shard demonstration is insufficient.

Proposed acceptance: scenario `call-bounded-structured-partials`,
3 consecutive, metric `priority`; actual Quest and meaningful red witness
required before runtime implementation.

## One canonical multi-operation service target

Quest slot: `service-cell-v2-default-multi-operation` (Q5).

- The public default generate/build/publish/deploy pipeline SHALL target the
  one current generic operation-dispatch contract. A fresh service SHALL
  support both an HTTP-only component with zero distributed operations and a
  component with at least two immutable operation identities. An empty
  operation declaration must build and run without a fabricated no-op operation.
- Existing service-source, entry-generation, deployment-record, Binding and
  call-invoker owners SHALL perform the cutover. Reuse the landed v2
  substrate; do not invent a second dispatch mechanism.
- The old target SHALL cease to be an executable alternate path. Unsupported
  old artifacts SHALL produce a typed upgrade/rebuild requirement through the
  same admission owner. There is no v1 flag, compatibility runtime or fallback
  that outlives the cutover.
- HTTP authoring SHALL use the Hono/Fetch contract in
  [standard-http-service-api/requirements.md](../standard-http-service-api/requirements.md).
  This epic SHALL NOT preserve a per-handler route descriptor, `calls` list
  or injected `call/json` handler dialect.
- The Hono epic owns the request-scoped SDK, authorization boundary, async
  adapter and bounded sequential calls with unique child identities. Q5 owns
  operation-ID correctness below that client. The same compiled public
  journey SHALL prove their interaction without duplicating either owner.
- A service with multiple routes and operations SHALL preserve the declared
  call authority, Binding generation, deadline and caller context. Unknown,
  stale, forged or unauthorized operation identities SHALL fail closed.
  Route middleware is not a replacement for the canonical capability gate.
- A separate HTTP-only artifact with zero operations SHALL build, publish,
  deploy and answer a normal Hono request through the compiled runtime. A
  health route inside a service that also has operations does not prove this.
- The public journey SHALL build and publish a compiled artifact, remove the
  publisher's source directory, deploy by artifact identity from a clean
  client and invoke/update the same endpoint through the actual runtime.
  Cross-node activation and restart proof require independent nodes and real
  process failure, not another owner over the same fixture database.

Proposed acceptance: scenario `service-cell-v2-default-multi-operation`,
3 consecutive, metric `priority`, integrated with the Hono epic's public
journey. Its Quest must seal a bounded meaningful red witness; this planning
revision grants no implementation or measured-readiness claim.

### Direct public call identity and replay — 0.5

This is a bounded integration obligation of Q5 through the existing service
lifecycle SQL contract, CLI and CallCellInvoker. It is not a second transport,
invocation owner or idempotency store.

- Public `CALL BINDING` SHALL accept an optional explicit invocation key.
  The CLI and existing SQL payload grammar SHALL preserve it to the canonical
  invocation owner; generated operation clients SHALL use the same contract.
- In the direct-call namespace, lookup uses authenticated tenant, principal
  and the supplied key. Operation identity, immutable Binding/artifact
  generation, canonical typed arguments and relevant authorization context
  form the stored intent to compare; changing them must not create a new lookup
  namespace that silently bypasses conflict detection. The owner SHALL persist
  admission and replay state through its existing durable mechanisms before
  treating a delivery as accepted. Current authentication and operation grants
  are checked before returning retained results.
- Repeating the same key and intent within its declared retention window
  SHALL observe the original invocation: pending/uncertain, failed or complete
  as applicable. A changed argument, explicitly selected operation/generation
  or authority under the same key SHALL return a typed conflict, not start
  another execution. A retry of the same logical target consumes its recorded
  immutable generation, even if the deployment's ready revision has advanced;
  only a newly admitted key resolves the new revision.
- Retry SHALL retain the original deadline, outcome uncertainty and effect
  obligations. A lost reply is not permission to re-mint identity or infer
  rollback. Caller cancellation does not establish that admitted work had no
  effect. The API SHALL not promise exactly-once physical execution.
- The owning contract SHALL declare finite replay/result/tombstone retention
  and key-expiry behavior before implementation. The supported retry window
  and behavior after it expires SHALL be visible to callers; an expired key
  cannot silently be advertised as a protected replay. Resource cleanup
  follows the existing invocation lifetime owner.
- Omitting a key retains ordinary invocation admission. A timeout/lost answer
  without a key SHALL preserve an explicit unknown-outcome warning and no
  general automatic-retry guarantee.
- HTTP method, URL, headers and body belong only to the Hono HTTP layer's
  request-intent comparison. SQL callers SHALL not fabricate an HTTP request,
  and the shared operation owner SHALL not maintain a second HTTP-specific
  idempotency store.

Public SQL/CLI evidence SHALL exercise same-intent retry, changed-intent
conflict, lost reply, process restart, retained pending/completed outcome and
expiry/cleanup on independent nodes. The Hono journey consumes this same
invocation identity behavior; source-level payload acceptance alone cannot
satisfy the integration obligation.

The durable authorities remain the existing
[committed-statement outcomes](../../../src/partition/partition-committed-statement-outcome.js),
[TX1 participant identity/content contract](../../../src/partition/partition-participant-transaction-bytes.js)
and public invocation owner. They have different scopes: a public invocation,
its attempt and its ordinal child statements are not interchangeable keys.
The integration SHALL map those identities explicitly, compare stable identity
with canonical semantic payload before accepting replay, and preserve the
mutation/outcome atomicity owned by committed apply. It SHALL NOT introduce an
`applied_calls` ledger or infer a durable commit from resource cancellation.
Retain the actual committed result, or a durable reconstructible reference
whose bytes share the outcome's lifetime. A `result_digest` can verify bytes
but cannot return a lost result; replay must not recompute effects to recover it.

An authoritative outcome lookup needs an implemented read fence to establish
which committed history it has observed. The current
[Raft ingress contract](../../../src/raft/raft-rs-ingress-constants.js) explicitly
notes that its binding exports no `read_index`. Prove the supported native/API
path and its quorum/applied-position semantics before claiming a linearizable
outcome read. Snapshot-local applied position alone is insufficient. Without
the required quorum or witness, the client may remain uncertain; do not
automatically rerun a mutating operation to manufacture a definite answer.
Even a successful linearizable ReadIndex followed by a missing outcome row
does not prove an earlier in-flight proposal will never commit after that
read. Preserve the original logical identity and semantic payload through any
re-delivery, with apply-time deduplication; do not mint a fresh identity or
infer permanent non-execution from an absence at one read position.

Retention consumes the existing, **unmerged** WIP
[system-table-retention epic](https://github.com/psvensson/lagrange/blob/dc29d85bedbbe4310bfcd4cf7e46e8b65a654b2d/solve/epics/system-table-retention.md)
and [partition-statement-outcome-retention draft](https://github.com/psvensson/lagrange/blob/dc29d85bedbbe4310bfcd4cf7e46e8b65a654b2d/solve/quests/partition-statement-outcome-retention/quest.json).
The main stabilization owner must reconcile these owners, table inventory,
deletion dependencies and acceptance before implementation; the reference
grants no integration or measurement credit. A bounded ring/TTL alone cannot
distinguish a never-admitted key from a forgotten accepted intent. Define the
authenticated key namespace and finite retry horizon, preserve parent/child
references, and retain sufficient retirement evidence to refuse expired or
retired intent instead of executing it afresh. A retirement floor requires an
actual orderable identity component; opaque UUIDs do not acquire ordering by
policy. If the protocol cannot distinguish expiry after metadata reclamation,
stop claiming retry protection there and refuse the ambiguous retry path.

### Conditional mutation is a separate capability decision — 0.5

The initial distributed operation contract remains read-only. If a mutating
operation descriptor is admitted later, the existing query/TX1 owners SHALL
validate the complete declared read dependencies and mutation intent under
the same transaction decision. Dependencies include absence observations,
predicate/range reads and read-only participants, not only rows subsequently
written; otherwise write skew remains possible. Use the existing conservative
whole-partition generation/origin validation and participant prepare/commit contract; do not
turn per-shard read views into an implicit cluster-wide snapshot or add another
coordinator. A cross-shard read whose dependency cannot be represented and
validated by that contract is unsupported, not silently ignored.

A guest-provided `retrySafe` flag is not authority to rerun. Automatic retry
requires proved deterministic, effect-free computation from newly validated
inputs, a bounded whole-attempt restart and the original invocation deadline.
External HTTP effects, time, randomness or an uncertain prior commit require
their declared outcome/recovery policy. The capability's preregistered negative
witnesses must include write skew/read-dependency change, same identity with
different intent, a lost commit answer, and one participant unavailable after
the durable decision. Descriptor authoring, SQL authorization and runtime
effects must share that decision before any support claim is admitted.

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
- Edition boundary (D8, superseded scope 2026-11-01): node transport trust,
  ordinary authorization/roles and supported tenant isolation are AGPL.
  Organization SSO/group synchronization, delegated policy administration and
  KMS integrations remain external; hostile multi-tenancy is not claimed
  without an explicit supported contract.
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

### Admitted wire contract correction — 0.4.1

The unsealed
[postgres-wire-description-contract](../../quests/postgres-wire-description-contract/quest.json)
successor is coordinated by operation integrity. Q10's sealed
[record](../../quests/postgres-compatibility-certification-matrix/quest.json)
and terminal evidence stay unchanged. Source observation at main `ef93af85`:
[`PgWireExtendedQueryHandler._handleDescribe`](../../../src/runtime/pgwire-extended-query-handler.js)
answers `NoData` for both existing statements and portals without establishing
whether they return rows. This is not a live driver regression receipt.

For every admitted prepared-statement/portal shape, Describe SHALL expose the
correct parameter count/types and result descriptor before Execute, including
zero-row and NULL-valued results. Metadata discovery SHALL NOT execute effects
or invoke guest code. Bind parameter formats/counts, row field counts/OIDs,
NULL handling and DataRow encodings SHALL agree with that descriptor. Unknown
or unsupported formats, portal suspension/resumption and statement classes
receive an explicit protocol/feature error; do not send generic success or
infer a stable schema from the first returned value. Existing supported matrix
cells cannot be quietly downgraded to avoid their proof.

Binary acceptance uses the existing protocol adapter and live external-client
matrix: statement and portal Describe, zero rows, NULL/text/numeric values,
parameter mismatch, attempted side effects during Describe, stale statement/
portal lifetime, and supported versus refused formats. Predeclare named
driver versions, SQLSTATEs and packet/result expectations, and make the witness
red when truthful metadata or refusal is removed. Unsupported `SET` isolation
requests SHALL be refused with the catalog's declared behavior; a no-op success
cannot imply an isolation level that TX1 does not implement.

An optional SELECT-shaped service-call alias remains a **0.5 capability
decision**, not this repair's acceptance. If admitted, normalize it to the
canonical lifecycle `PGWIRE_AUTH_ACTION.BINDING_CALL` (`pgwire.binding.call`)
authorization/effect owner before execution;
the current [text classifier](../../../src/query/pg/postgres-wire-adapter.js)
otherwise defaults non-lifecycle text to `EXECUTE_QUERY`. Authorize one
canonical invocation, not a privileged path disguised as a read. Use a stable
JSON result or a fixed schema pinned to the admitted descriptor/revision;
dynamic guest output cannot determine the wire schema after Describe. A
cluster-routed CancelRequest is also a separate 0.5 decision consuming the
[execution cancellation contract](scale-failure-certification.md#read-execution-isolation-and-cancellation-continuation--05),
with authenticated session/operation/generation mapping and explicit unsupported
behavior until proved. Neither choice requires a new SQL execution engine.

Broader public-path acceptance (unchanged): `scenario-harness` scenario
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
