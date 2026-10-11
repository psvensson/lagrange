---
audience: development
documentClass: proposal
---

# Receipt 8 continuation: exact obligations and delivery lifetime

Subject: inherited CDC draft on e7c89f4b5114c0238312d3831b65889a4622f4e9.
Accepted v10 section 8.3 and owner-decisions-2026-10-10 remain the authority.
The draft cites a nonexistent section 0.0.16; that citation grants no authority.
No sealed receipt is changed or certified here.

The initial canonical run passed 2 of 9 cases. O1's expected planted error
message drifted from the fixture's returned SQLITE_CONSTRAINT_TRIGGER code;
its atomicity assertions remain. The other failures expose a delayed
LEADER_ELECTED notification clearing an already-active acknowledgement batch.
The callback denotes activation, not a new leadership tenure.

## Owner decisions for correction

- Bind volatile delivery and proposal work to the existing canonical
  PartitionService leadershipTenure object, plus the current delivery lane.
  Repeated activation of the same tenure preserves its batch. A new tenure
  replaces the lane; old asynchronous completions cannot acknowledge, propose,
  clear or reschedule successor work. Shutdown ends that lifetime.
- A consumer acknowledgement is not a committed delivered flag. Keep pending
  work until the replicated acknowledgement applies. An uncertain proposal
  retains its exact command identity and bytes and has a bounded retry through
  the existing pending-write owner; lack of traffic cannot strand it forever.
  Backpressure bounds outstanding acknowledgement work. No timeout clears debt.
- Capture each operation's event before a later operation can replace the row
  version it describes, inside the same application transaction. No subscriber
  runs until the whole application commits. Recovery reads recorded payloads.
- Measure acknowledgement byte limits as UTF-8 bytes, not JavaScript string
  length. Preserve both count and byte limits and the sparse flush deadline.
- The inherited test consumer prepended eventKey itself to buildEventIdentity,
  while production did not. That hides collisions for two same-row UPDATEs
  sharing a decision timestamp. Supersede only v10 section 8.3 point 7's mapping
  implementation: the existing identity owner uses the carried durable event
  key together with its source partition when present, and keeps its existing
  identity for events without a durable key. It remains the sole identity
  algorithm. Stable replay and distinct operation identity are both required;
  this strengthens the unchanged sealed obligation. Prove real producer and
  consumer paths rather than adding identity logic in a test subscriber.
- Include ordinary committed writes in this obligation owner, as 8.3 requires.
  The inherited transaction-only implementation cannot certify receipt 8.
- Owed rows survive retention and snapshots. No current evidence supports the
  draft's claim that delivered rows are already compacted with the log; remove
  that claim until the existing retention owner supplies an implemented bound.
- The CDC bootstrap owner propagates a refused/unavailable mutation lane;
  it must not treat a Raft refusal as authority for unreplicated local mutation.
  The cutover owner supplies closed admission and permanent post-origin local
  mutation retirement. Positive real seed/bootstrap proof remains required.

These choices follow architecture/contracts/authority-and-recovery.md's
safety-first mandate. They do not waive independent review, accepted transaction
semantics, F-DET/F-SNAP owner obligations, or locked-lab restart proof. O10-O13
add direct witnesses for tenure, stale completion, per-operation payload and
consumer identity, and encoded bytes before correction.

## Coupled identity and completion refinement after independent design review

Read-only review `subagent:/root/review_freshmg_c2`, report SHA-256
`db2583206a3e06ee38d03d7ea1f92c3e0f8ce87cfb7f669ec71622b6f726cd2f`,
found that partition identity alone is insufficient. The exact source-to-
consumer interaction is one change boundary: partition producer/delivery,
seed and joining propagation subscribers, topology propagation and its
normalizers/deferred queues, message-group singleton/batch/forwarding paths,
committed CDC apply, and CDCHandler's deduplication. Each preserves the
canonical producer timestamp, source partition and event key. Durable identity
uses an unambiguous tagged tuple; malformed durable identities are refused,
not downgraded to the legacy tuple. CDCHandler delegates this identity to the
existing shared owner; its separate algorithm is retired for durable events.

A production propagation callback must return exact semantic consumer
acceptance or durable transfer of this same obligation. Resolved false,
transport acknowledgement, noHandler, deferred delivery, volatile queueing,
and message-group leader-log append do not qualify. The existing transport
semantic classifier remains its owner; message-group CDC committed application
owns event-bound acceptance. Its bounded waiter is registered before proposing
and completes only at actual committed application, including one-voter
synchronous apply. Lost answer/timeout leaves UNKNOWN and exact replay; no
source CDC_DELIVERED may retire debt first. Direct terminal local consumers
retain their existing awaited Promise<void> completion convention; the
production forwarding bridge carries explicit outcomes end-to-end.

The delivery owner's existing retry timer reconciles retained ACK commands
before delivering more work. It uses the existing 50 ms initial / 10 s maximum
backoff and the write owner's finite 30 s pending wait per attempt, without
resetting an in-flight deadline. A bounded number of outstanding batches plus
bounded queued events/bytes applies backpressure. Retrying a durable obligation
can continue while prerequisites are unavailable; its total number of attempts
is not claimed finite. Invalid bytes/unknown event/entry mismatch is alarmed
held debt with repair re-entry, not a fast loop. Sparse deadlines do not move
when newer events arrive. A committed ACK remains authoritative even when its
proposer's tenure ended; only stale asynchronous callbacks are fenced out.

ACK semantic content identity is partition plus exact ordered groups. The
HLC/proposer/time stamps are proposal diagnostics, excluded from this identity
and from obligation settlement. Retry within one tenure retains the complete
command bytes. Restart may reconstruct the same semantic command with new
proposal diagnostics, so byte-identical restart reconstruction is not claimed.
No redundant durable command ledger is introduced for those diagnostics.

The full coupled consumer proof, count/byte backpressure, ordinary writes,
snapshot retention, delivered-row retention and real seed/migration proof
remain unfinished. The first local-owner correction passed 13 obligation
witnesses plus 94 event-buffer assertions on locked lenovo-laptop at exact
proof snapshot `4e36693759d5352c9179a8525932c17a100436d0`; it does not certify
those remaining obligations. The corresponding red snapshot
`914f3cdadd4d74c2e36af3d5503d1a31d91666cb` failed 10 of 13, including all four
new behavioral witnesses. Tests alone were then lint-cleaned without changing
production bytes. O14-O16 add UNKNOWN re-entry, false semantic ACK, and
ordinary-write durable-obligation witnesses for the next correction.


## Canonical envelope and formation interaction

The exact proof snapshot `67324406a5ada14741680d7f907cca7aec265e17`
passed the nine new identity cases plus existing CDCHandler and event-buffer
coverage on locked lenovo-laptop (202 assertions). The preceding snapshot
`e4ffd5dfc52202ed425a4a3ef42ebdf7b55d1ae6` failed 15 of 18 assertions
inside those nine cases. This is identity proof, not committed acceptance.

The existing identity owner remains buildEventIdentity. The shared CDC envelope
copier carries that identity and the producer timestamp through owner boundaries;
it does not derive another identity. CDCHandler preserves its legacy no-key
row canonicalization. Durable events are not row-coalesced or transport-replaced.
Immediate topology batches retain each durable identity. Topology's volatile
background retry does not enroll durable events: the partition obligation owns
their next attempt, so a deferred result returns with source debt intact.
Its legacy scheduling key is named retryEventKey and is not a CDC event key.

The strict CDC ingress states in architecture/readiness-and-owner-contracts.md
remain authoritative for early metadata visibility. Removing local strict
convergence ingress until message-group commit creates a formation cycle:
peer admission itself requires this metadata. Such local application is
provisional for a carried durable event and cannot produce committed acceptance.
Source debt remains until canonical message-group leader replication commits.
A later retry may apply an already-seen cache event idempotently while obtaining
its durable transfer receipt. No new cache-readiness truth or second durable
receipt ledger is introduced. Positive formation and loss-after-append proof
are still required.

## C17 source order, restart coverage and bounded hydration

The 2026-10-11 owner judgment accepts complete source coverage only as an
interaction of the existing descriptor owner, partition application owner,
authoritative read owner and `SystemTableCache`. It does not create a second
delivery ledger or persisted descriptor copy.

### Current descriptor reacquisition

Genesis may construct immutable scope evidence from its fixed partition and
table descriptors. A CREATE request may carry its admitted workflow descriptors
to construction, but those bytes prove only historical provenance. A restored
or long-lived service activates coverage only after `ReplicaHandler` consumes
fresh committed rows through `ControlPlaneSystemTableGateway` with
`OWNER_RPC_REQUIRED` and `leaderMode: REQUIRED`.

The reacquisition read is a stable sandwich: read the exact `tables` row, read
the exact `partitions` row, then read the same `tables` row again. Each result
must contain exactly one requested row and a valid serving-leader witness for
that system table's source partition. The two table rows must have identical
scope-bearing fields and transition generation; the partition row must bind
the requested partition/table IDs, be in its normal active state, and have
`partition_version === tables.active_partition_version`. The scope digest covers
the authority kind, IDs, table name, canonical range endpoints and both version
values. Missing, mixed, fallback, duplicate or changing reads return typed
recoverable unavailability.

The service installs evidence with a monotonic observation generation. Exact
same scope is idempotent; a strictly newer active partition version replaces an
older scope; a lower version or an equal version with different scope bytes is
refused. The request captures the service lifecycle generation, so a delayed
answer cannot mutate a replacement service. Durable rejoin starts with no active
coverage scope, invokes this path once owner routing exists, and keeps bootstrap
and subscriber catch-up provisional below COMPLETE until it succeeds. Operation
history pruning is irrelevant because the current owner rows, rather than the
old operation, supply the evidence.

### Enumeration and independently complete cells

The source read owner admits `sqlite-binary-text-v1` only when the canonical
propagated-table schema has exactly one `TEXT` primary key. All 22 currently
propagated schemas satisfy that shape. Composite, missing, non-TEXT or changed
schema metadata is a typed recoverable refusal; it never silently selects the
first key column.

The enumeration cursor is the exact primary-key string. Source SQL explicitly
uses `COLLATE BINARY`, an inclusive lower cursor and exclusive upper cursor,
and `ORDER BY key COLLATE BINARY`. The consumer compares UTF-8 bytes with the
same unsigned binary order. This enumeration interval is separate from the
canonical routing scope, which continues to use `compareRoutingKeys`. Every
source row must belong to the descriptor's canonical range; range drift refuses
the cell. A coverage cell is identified by source scope, enumeration-domain
version, lower cursor, exclusive upper cursor and digest. Duplicate keys,
overlapping/conflicting cells and mismatched continuation cursors are refused.

Each cell reads its application `appliedIndex` and cell rows in one local SQLite
read transaction. It certifies only its own enumeration interval at that N.
Partial pages never mint a wider floor. The cache retains uncovered cells and,
for every installed cell, overlays retained per-key UPSERT and DELETE events
strictly later than that cell's N. Floors from another scope are incomparable.
Generation replacement requires a strictly newer authoritative descriptor and
supersedes only the new cell's overlap. Same-position different semantic bytes
are contradictory; listener publication occurs after row, tombstone, revision,
cell floor and suffix state are all installed.

### Bounded fragment transfer for a large row

There is no existing admitted maximum for a CDC-propagated system-table row.
`ROW_TOO_LARGE` therefore cannot be terminal. The existing hydration request is
extended with a volatile fragment session; no durable frontier, coordinator or
descriptor store is added.

Before selecting a row into JavaScript, the source transaction queries SQLite
storage classes and raw byte lengths for its declared schema columns. The
encoder computes a conservative exact reservation bound from fixed field/type
framing plus the worst-case escaped UTF-8 expansion. `CdcCoverageTransferOwner`
then reserves that many retained bytes and one of eight session slots before
the full row is selected or encoded. The owner default is 128 MiB aggregate,
is constructor configurable, and reports recoverable backpressure when current
capacity is insufficient. A retry with adequate configured capacity is the
supported progress route for any finite committed row; debt remains owed while
capacity is unavailable. The source transaction then captures N, exact row
identity and row bytes, incrementally hashes the canonical transfer encoding,
and closes before any network await. Actual retained bytes replace the
conservative reservation without exceeding it.

The immutable offer binds transfer ID, lifecycle generation, source scope and
cell, N, row key, byte length, chunk geometry and SHA-256 digest. Chunks are
512 KiB, indexed, individually length/digest checked, and fetched through the
same authoritative hydration interaction. Source sessions expire after the
existing 30-second partition request bound and release on completion,
cancellation, shutdown or service replacement. A missing session after restart
causes a new capture; it never authorizes completion from old fragments.

The consumer has the same eight-session/128 MiB aggregate owner. It reserves
the offer's complete byte length before accepting chunk zero, retains at most
one requested chunk per session, and releases on mismatch, timeout, shutdown or
completion. Capacity refusal is recoverable backpressure. Only a complete
length and whole-row digest match may decode the row and stage the cell. Cell
rows, absence, its N floor and preserved suffix are then published atomically;
no fragment is cache truth. A source session never holds a SQLite transaction
over network awaits.

The existing `PressureGovernor` BULK work class remains the admission signal
for transfer work. The snapshot bulk socket is not reused as a semantic owner:
its protocol binds snapshot generations and peer sockets, while hydration may
be local and is request/response routed. Its established one-chunk-at-a-time,
digest, cancellation and shutdown disciplines are reused in the hydration
interaction. Direct proof covers Unicode and embedded NUL ordering, duplicate
rows, unsupported composite/non-TEXT schemas, descriptor range drift, page
overlap, suffix UPSERT/DELETE races, source and consumer exhaustion/release,
restart/session loss, and a row larger than the former 16 MiB page budget when
both capacity owners admit it.

## C17 revision after author-distinct design review

This section supersedes the C17 mechanics above. It incorporates the REVISE
verdict on subject SHA-256
`c911fc241e7167c2b15dc23b1e1cf0820017639d68254455d0ead7de3677c1bf` in
`review-cdc-c17-design-56.md` SHA-256
`a828c1181b65532ffdb4a63cc949404259cd7c5cb05c347533b4457d3d88c177`.
The fragment implementation remains stopped until this revision is reviewed.

### One reconcile owner, one generation, one deadline

The existing `CDCIntegrationService` authoritative catch-up interaction owns
descriptor reacquisition and coverage hydration. Its private single-flight key
is `(target service lifecycle generation, source partition, table name)`. The
same key accepts synchronous subscription-arm admission, route-readiness wakes,
authoritative `tables`/`partitions` cache revision wakes, source suffix-capacity
release, fragment-capacity release and the bounded timer backstop. Those cache
revisions are wake signals only; cached rows never supply descriptor evidence.
No page, chunk, handler answer or transport acknowledgement creates a second
retry owner.

The caller captures one `coverageDeadlineMs` when the subscription/formation
generation is armed. Join uses the existing 30 second
`CDC_REESTABLISHMENT.TIMEOUT_MS`; a live repair caller supplies an equal or
tighter absolute deadline. Descriptor reads, page reads, offers, chunks,
backoff and atomic publication all spend that one deadline. Hinted retry is
clamped to 100..1000 ms. There is at most one request in flight for a key, at
most the 22 `CDC_PROPAGATED_TABLES` keys per target lifecycle, one sequential
page or chunk per key, and eight admitted fragment sessions per node. ACK-only,
late answers and new chunks never reset attempt counters or the deadline.

Deadline exhaustion emits one folded `wait_bound_spent` containing request
generation, last semantic outcome, pages, chunks, retries and retained bytes,
then leaves that table's bootstrap handshake and coverage status incomplete.
It does not turn absence into success. A later explicit route/capacity/lifecycle
wake may arm a new reconcile generation with its own captured deadline; the
spent generation is retired first and its answers are inert. Shutdown and
service replacement synchronously unregister all wakes, cancel the timer and
release every reservation before removing the generation.

### Current descriptor evidence and the epoch premise

`ControlPlaneSystemTableGateway.readRows` is called with an authoritative
intent whose frozen authority is `OWNER_RPC_REQUIRED`, `leaderMode: REQUIRED`,
recovery routing `PRIORITY_RECOVERY_BOOTSTRAP`, CRITICAL work class and the
same absolute deadline. The stable sandwich is exact `tables` row A, exact
`partitions` row P, exact `tables` row B. Every answer must have exactly one
requested row and an `isValidLeaderReadAuthorityWitness` for that system
table's initial partition. A and B must have byte-identical scope fields,
`active_partition_version`, pending version/state and transition generation.
P must bind the requested IDs and table name, have `state === NORMAL`, and have
`partition_version === active_partition_version`. Missing, duplicated,
fallback, changed or unwitnessed results are recoverable unavailability.

The premise is the descriptor-epoch owner in
`architecture/process-partitioning.md` and
`partition-descriptor-epoch-contract.js`: routing admits an active partition
only at an exact table/partition epoch match. The audited writers are seed
registration and table creation, then
`managed-split-workflow-persistence-methods.js` and
`managed-merge-workflow-persistence-methods.js`; each change of active range,
identity or state must be represented by its table transition and active
epoch. A cutover between A/P or P/B therefore yields a mismatch and retry,
never a mixed accepted scope. The implementation audit must reject any other
writer or handoff that changes a scope field without that epoch transition.

The attempt captures the requesting `CDCIntegrationService` generation and
the exact target `PartitionService` object plus lifecycle generation. Install
revalidates both. The target accepts an identical observation idempotently,
accepts a strictly newer epoch, and rejects lower or equal conflicting bytes.
A delayed old sandwich cannot mutate a replacement service. Genesis alone may
activate its fixed version-1 descriptors at construction. CREATE-carried
workflow descriptors become historical `sourceScopeProvenance`; they do not
activate coverage. Restored, rejoined and long-lived services start without an
active scope and acquire it from this owner path after recovery routing exists.

### Routing scope and BINARY enumeration are independent

The canonical routing scope remains `(partition range start, partition range
end, compareRoutingKeys version)`. It is never used as an SQL cursor. The
physical source partition enumerates its whole local table in a separate
`sqlite-binary-text-v1` domain, from BINARY negative infinity to BINARY positive
infinity. SQL uses `key COLLATE BINARY >= ?`, `ORDER BY key COLLATE BINARY` and
the first omitted key as the exclusive cell end. The consumer compares encoded
UTF-8 key bytes unsigned. Scope and cell digests bind both the routing scope and
this independent enumeration domain.

The distinction is observable in both directions under the live routing
owner. A numeric routed key `2` sorts before the persisted TEXT boundary
`"11"`, while their TEXT encodings sort as `"11"`, `"2"` in SQLite BINARY
order. For two TEXT values routing uses `localeCompare`: `"a"` sorts before
`"Z"`, while SQLite BINARY orders `"Z"` before `"a"`. Neither order may be
used to infer the other.

Every returned row is separately checked with `compareRoutingKeys` against the
authoritative routing scope. Any out-of-range row refuses the cell and wakes
descriptor reconciliation. This makes a physical partition's complete empty
table valid evidence for its routing scope without interpreting routing bounds
as BINARY bounds. Tests cover the mixed numeric/TEXT routing boundary, the
TEXT locale/BINARY reversal, empty string refusal, `"\u0000"`, non-ASCII text
and both routing boundary rows.

A cell is `(scope digest, schema/domain digest, lower BINARY cursor or -inf,
exclusive first-omitted cursor or +inf, N)`. The source captures N, all rows in
that half-open interval and the first omitted key in one local SQLite read
transaction. The next request begins inclusively at that authenticated omitted
key. Duplicate keys, a non-advancing cursor, overlap with different bytes or a
continuation that is not the prior authenticated end is refused. Each cell has
its own N; no table-wide prefix is fabricated.

### Live schema and lossless supported value domain

The schema owner remains `SYSTEM_TABLE_SCHEMAS`; the coverage owner does not
invent a second schema catalogue. At source capture it reads `sqlite_master`
and `pragma_table_xinfo` in the same transaction and requires an exact digest
of the declared propagated schema: column order/name/type/nullability/default,
one and only one `TEXT` primary key, and BINARY collation. The digest binds
`SYSTEM_TABLE_SCHEMAS`, the live shape, `sqlite-binary-text-v1` and
`cdc-system-row-json-v1`. Changed, composite, missing, non-TEXT or non-BINARY
keys are recoverable unsupported-schema refusals and mint no cell.

The 22 current propagated descriptors contain only TEXT, INTEGER and REAL.
`cdc-system-row-json-v1` frames columns in declared order with explicit
NULL/TEXT/INTEGER/REAL tags. TEXT is exact UTF-8, including embedded NUL. REAL
must be finite. INTEGER and Raft positions stay inside their existing owners:
system-table integers must arrive as exact safe integers, and source N/log
positions must pass `isValidRaftLogIndex`/the existing safe-position admission.
N is transported as canonical decimal text but is not broadened beyond that
safe bound. Unsupported SQLite storage classes, unsafe integers, NaN/infinity,
missing columns and an empty primary key are refused before a cell is minted.
This is lossless within the existing JSON/cache value domain; it does not add
BigInt, BLOB or a wider Raft position contract. The implementation audit must
identify any propagated-table writer that can currently commit outside this
domain before this refusal can be treated as complete.

### Large row offer and semantic transport

The same authoritative owner-RPC query path carries scope, page, offer and
chunk requests. Raw delivery is classified by
`transport-semantic-outcome.js`; the coverage normalizer then binds the handler
answer to request ID, admitted read-authority digest, recipient node and service
incarnations, source service incarnation and scope, cell, transfer generation,
chunk ordinal and absolute deadline. Only transport `DELIVERED` plus exact
semantic handler success advances. `acknowledged:true` with `noHandler`, no
connection, timeout, pressure refusal and a missing session are `DEFERRED` with
the canonical `deferRetry`/`retryAfterMs`; malformed identity, digest or ordinal
is `FAILED`. Late/retired answers are diagnostic only and cannot release a
current reservation or advance its cursor.

Before materializing a large row, the source transaction performs a bounded
one-row `typeof`/`length(CAST(column AS BLOB))` probe over the declared column
list. It reserves for the resulting worst-case peak, then reads the row, N and
the next BINARY key. The immutable offer binds the opaque random transfer ID,
both service incarnations, recipient, admitted authority/request generation,
scope/domain/cell, N, predecessor/lower cursor, row key, next key or final
domain end, `nextPageStart`, codec/schema digest, total bytes, chunk geometry,
whole digest and absolute deadline. Thus a large row at `k` proves exactly the
cell `[lower,next)` and the retry advances to `next`; it cannot loop on `k` or
invent absence. The source transaction closes before the first network await.

Every offer/chunk request revalidates source scope, source lifecycle, target
lifecycle, recipient and deadline. The transfer ID is usable only through the
owner-routed request that created it. Cancellation/replacement deletes the
session before answering later chunks. Recipient restart discards partial
assembly and starts a new capture. Only full length, sequence and whole digest
success decodes and stages a complete cell; no fragment is cache truth.

### Retained-byte admission and release

The existing node `PressureGovernor` BULK lane is extended with retained-byte
leases shared by source and consumer, so colocated ends cannot each admit the
same node budget independently. One precheck and lease operation reads the same
live session/byte counters. Per-node defaults remain eight sessions and 128 MiB,
constructor configurable; insufficient capacity is recoverable backpressure
and source debt stays owed. Adequate configured capacity is the supported path
for every finite row in the admitted value domain.

The source reservation is the sum of: bounded probe scalars; worst-case
better-sqlite3 TEXT/number row materialization; tagged canonical encoding;
retained encoded row; one raw chunk; its base64 transport expansion; and one
router frame copy. The consumer reservation is the sum of: router/base64 input;
decoded chunk; retained assembly; tagged decoded row; cache row clone;
notification clone; the previous/final table-map entry staging bound; and the
cell/floor/suffix staging clone. Fixed framing and per-column/per-map-entry
constants are checked for safe arithmetic. A new allocation is made only after
its corresponding incremental lease succeeds. Probe SQL yields lengths only
and is itself capped by declared column count.

Charges are not replaced by a smaller encoded-byte count while other copies
live. Source frame/chunk charges release after semantic handler completion;
source materialization/encoding/session charges release after final completion,
cancellation, deadline or replacement. Consumer frame/chunk charges release
after verified append; assembly/decoded/cache/publication charges remain
through atomic commit and listener scheduling, then release. Shutdown releases
all leases after fencing callbacks. Diagnostics expose live bytes by category,
sessions, high-water bytes, refusals and releases; proof asserts no negative or
stranded charge on timeout, retry, restart and planted publication failure.

### Source-order arming, atomic cache publication and writer inventory

For a fresh target lifecycle the sequence is fixed: register the single-flight
reconcile key and strict provenance-bearing ingress; enable bounded suffix
retention/backpressure; acquire current scope; then capture/install cells.
Durable identity with absent or malformed scope is `PROVENANCE_INVALID`, never
LEGACY. Capacity refusal preserves source debt and wakes the same reconcile
key. Cache restart loses floors and suffix together and therefore cannot mean
empty evidence. Transaction rollback loses effect and volatile dedupe together.

`SystemTableCache` is the sole writer of cell floors, per-key suffix,
tombstones, revisions and row publication. It validates and clones all
throwable inputs, stages previous/final maps plus suffix/floor/generation state,
then swaps them synchronously before deferred listeners. It retains every
UPSERT/DELETE later than that cell's N, rejects equal-position different bytes,
never compares floors across scope digests, replaces exact repeated cell
metadata and prunes fully superseded old-generation cells/suffix state. Partial
overlap stays represented until independently covered; arrival order alone
cannot supersede a generation.

The active-scope writers are genesis once and the witnessed reconcile installer.
CREATE workflow bytes are provenance only. The source `PartitionService`
coverage methods are the sole volatile transfer-session writer. The target
`CDCIntegrationService` catch-up owner is the sole reconcile/retry/consumer
assembly writer. `SystemTableCache` is a disposable projection for rows,
suffixes and cell floors. Join readiness, CDC listeners, bootstrap overlays,
gateway cache reconciliation and diagnostics may wake or observe these owners;
none derives scope, advances a cell, forces completion or owns another retry
loop. Static audit searches for raw `cdcSourceScopeEvidence` assignment,
descriptor cache reads, force flags and duplicate coverage timers.

### Concrete proof plan

`test/partition/partition-cdc-source-coverage.test.js` will cover the live
schema digest, supported value tags, safe-index bound, full-table BINARY domain,
numeric-text routing divergence, Unicode/NUL/empty keys, boundary rows,
duplicate/non-advancing pages, large-row next-key capture and source lease
release. `test/cache/system-table-cache-cdc-source-order.test.js` will cover the
12 C17 discriminators, exact-cell metadata replacement/pruning, old-generation
delay, suffix UPSERT/DELETE, complete empty cells, conflicting bytes and planted
failure before publication.

A new `test/cdc/cdc-authoritative-coverage-reconciliation.test.js` uses the
real `ControlPlaneSystemTableGateway`, `OWNER_RPC_REQUIRED` leader witnesses,
real query-router register/deliver shapes and `classifyTransportDeliveryOutcome`.
It cuts over between A/P and P/B, replaces source and target lifecycles during
each await, exercises ACK+`noHandler`, disconnect, timeout, pressure and late
success, and asserts exact request/deadline/lease diagnostics. Stubs must return
the production gateway/router envelopes.

A new `test/integration/cdc-coverage-rejoin-formation.integration.test.js`
starts a fresh seed and a durable rejoin after operation-history pruning,
withholds routing then wakes it, restarts the consumer mid-fragment, transfers
a row larger than 16 MiB under an adequate retained-byte budget, and reaches
semantic cache/formation assertions before the one absolute deadline. Locked
lab evidence records exact source fingerprints, snapshot SHA, host and log.
Physical image proof opens the generated application SQLite payload and checks
exact owed `_cdc_obligations`; it makes no delivered-row retention claim.

## C17 round-two revision: normalized cover and real lifecycle fences

This section supersedes the remaining mechanics above. It incorporates the
second author-distinct REVISE verdict on subject SHA-256
`79cb363f758b935f895bb78160b32f3779276f6c5f29e15e36716f8a07162fa9` in
`review-cdc-c17-design-round2-56.md` SHA-256
`e3e24a155a95764414cb1fce10ff6afa4bdf5b0a292f1bb0db73296ab1134232`.
Fragment implementation remains stopped until this revision is approved.

### Logical intervals and immutable observations

`N` is not part of the logical interval key. A source cell request is keyed by
`(scope digest, schema/domain digest, lower BINARY cursor, exclusive upper
BINARY cursor)`. Its immutable observation is `(N, ordered tagged source rows,
first omitted key or +inf, observation digest)`. The consumer validates the
whole observation before decomposing it into a normalized, non-overlapping
cover. The cover has two atom kinds: a key atom holding that source key's
tagged row digest and N, and an absence-gap atom holding N for the BINARY
interval between adjacent observed keys or cell endpoints. There is no
append-only cell/floor history.

Installing an observation compares each overlapping atom by N. Same N and
same tagged row/absence bytes is idempotent; same N and different bytes is a
contradiction; lower N is stale and changes nothing; higher N replaces the
overlap. The interval overlay splits old atoms only at the incoming endpoints
or returned keys, removes covered interior atoms, preserves uncovered left and
  right tails, then coalesces adjacent absence gaps with identical scope/domain
  and N. Every returned key and every absence gap is therefore represented once.
Retained cover metadata has no row-cardinality-derived bound; changing
boundaries and differing N can retain multiple empty segments. The exact staged
post-overlay atom/byte capacity described below is its only admission bound.
Its retained bytes are charged with the cache/suffix lease before staging.
The cache coverage owner also enforces constructor-configurable defaults of
20,000 atoms and 16 MiB of atom metadata. Precheck and install reserve against
the same live counters. A cell that would cross either limit is refused whole
as recoverable `cdc_coverage_atom_capacity_unavailable`, retains source debt
and wakes the same reconcile key when capacity releases. Disjoint empty cells
therefore cannot accumulate without a count/byte admission decision. Raising
that configured volatile cache capacity is the supported completion route for
a finite table whose normalized cover legitimately needs more metadata; the
default limit is not called an unsupported-row or completed state.

For `[a,m)` at N=10 followed by `[a,h)` and `[h,m)` at N=11, the first N=11
install replaces only `[a,h)` and preserves the N=10 `[h,m)` tail. The second
replaces that tail and coalesces the complete N=11 cover. An insert or delete
that moves the keyset boundary uses the same rule. A suffix UPSERT or DELETE is
retired only when the atom covering its exact key has N greater than or equal
to the event position; suffixes above that atom's N remain overlaid. A late
N=10 cell is stale even if it arrived after N=11. The proof includes moving
page boundaries in both directions, late old pages and suffix events on both
sides of the boundary.

### Lifecycle observations issued by existing owners

`CDCIntegrationService` issues one opaque frozen coverage token in its
constructor and registers it live in the coverage owner's private weak state.
The token is private to that exact service object. Coverage wake registration
captures both object identity and token. `markShuttingDown` synchronously
removes the token from live state, unregisters wake sources and reconcile
keys, cancels cooldown/deadline timers and fragment sessions, and only then
releases waiters. This service is terminal after `markShuttingDown`; a new node
wiring uses a new service object and token. `initialize` is idempotent while
live and does not mint a replacement token. A callback may enter only while
the registry still maps its key to that exact object/token; removal and token
fencing occur synchronously before any asynchronous release callback runs.

For the remotely hosted source `PartitionService`, the public operation boundary
is `service.raft.readStatus()`. The source handler captures the exact service
object and non-empty `lifecycleIncarnation`, then rechecks `CORE_OK` plus the
same incarnation before every source action. Recipient publication is instead
fenced by the exact CDC service token and cache/mutation-target objects described
in the round-three revision; it does not require a local target/source partition
service. No private Raft runtime object is traversed.

Tests replace `CDCIntegrationService` objects and also close/reopen a partition
operation port between every await boundary. They assert that old callbacks
cannot mutate the shared cache, advance the current cursor or release a current
reservation.

### Progress after a spent reconcile window

A table remains registered as debt until its normalized cover completes or its
target lifecycle ends. Spending the 30-second generation retires that
generation, emits the folded wait report, and arms exactly one cooldown timer
on the same single-flight reconcile owner. Consecutive spent-window count is
owned by the table debt record across generations. Cooldown grows
exponentially from one second to 30 seconds and is capped there; it never resets
for ACK-only, no-handler, timeout, pressure or a late answer. Thus persistent
failure produces at most two new 30-second generations per minute per table
after the cap, with at most 22 tables and one request per table. Logs emit for
the first spent window, powers of two, and then once per ten minutes; counters
retain total windows, attempts and last semantic outcome.

The cooldown expiry is the guaranteed future wake when transport or handler
health recovers without a route revision. Route, capacity, descriptor,
partition-status and explicit handler-readiness revisions may coalesce into
the same owner and start the next generation early, but do not reset the
consecutive-spent counter. Semantic completion clears the debt and counters.
Target lifecycle replacement drops the old debt after fencing it and creates a
new debt record only when the replacement arms strict ingress. Shutdown drops
the timer after loudly reporting incomplete table identities and retained
bytes; source durable obligations remain the durable retry authority.

Virtual-clock proof runs a handler beyond one full deadline, verifies the old
late answer is inert, advances the one-second cooldown, observes exactly one
new generation, then completes without any route/cache/capacity revision. A
persistent timeout witness advances through the 30-second cap and checks the
request and folded-log bounds.

### Exact transport and handler result mapping

The coverage transport adapter first decides whether the raw value is a clean
ACK-plus-handler-response or a transport-level failure. For raw `noHandler`,
`ROUTER_MESSAGE_TIMEOUT`, `ROUTER_NO_CONNECTION`, connection-closed,
connect-timeout, outbound-pressure and query-transport-not-ready shapes it
calls:

```
classifyTransportDeliveryOutcome(raw, {
  defaultRetryAfterMs: clampCoverageRetry(remainingDeadlineMs),
})
```

where the owner clamp is 100..1000 ms and never exceeds the remaining absolute
deadline. This makes the real ACK-then-`noHandler` envelope and message timeout
DEFERRED under the caller-owned policy instead of relying on fixture-added
retry fields. The default is omitted for a clean delivered handler response;
otherwise it could convert a terminal semantic refusal into transport retry.

After transport `DELIVERED`, the coverage handler normalizer requires the
exact request/lifecycle/scope/session binding and maps these production result
shapes: `{success:false, reasonCode:'cdc_coverage_capacity_unavailable',
deferRetry:true, retryAfterMs}` and `{success:false,
reasonCode:'cdc_coverage_transfer_session_missing', deferRetry:true,
retryAfterMs}` are DEFERRED; a scope/status change is recoverable DEFERRED and
wakes descriptor reconciliation; `{success:false,
reasonCode:'cdc_coverage_identity_invalid'|'cdc_coverage_digest_invalid'|
'cdc_coverage_chunk_ordinal_invalid', deferRetry:false}` is FAILED and held for
repair. Only `{success:true, ...exact bound receipt}` advances. Missing or
unknown handler fields are FAILED. Contract tests feed the real router
ACK-then-response envelope with and without hints and assert both the transport
classification and budget consumed by no-handler, disconnect, timeout,
pressure, missing session and each terminal result.

### Interaction and proof registration

`test/shards/impact-contracts.json` gains contract and coupled pair
`cdc-source-coverage-reconcile-publication`. Endpoint
`source-scope-prefix-capture` owns
`src/partition/partition-cdc-source-coverage.js` and
`src/partition/partition-service-cdc-coverage-methods.js`. Endpoint
`reconcile-cache-publication` owns
`src/cdc/cdc-integration-service-authoritative-catchup.js`, its extracted
coverage reconcile/transfer modules, and
`src/cache/system-table-cache-cdc-source-order.js`. Witnesses are:

* `test/partition/partition-cdc-source-coverage.test.js` — primary `unit`,
  resource classification provisional pending final-body measurement,
  subsystem `storage-partition`;
* `test/cache/system-table-cache-cdc-source-order.test.js` — primary `unit`,
  resource classification provisional pending final-body measurement,
  subsystem `storage-partition`;
* `test/cdc/cdc-authoritative-coverage-reconciliation.test.js` — primary
  `unit`, resource classification provisional pending final-body measurement,
  subsystem `cdc-metadata`;
* `test/integration/cdc-coverage-rejoin-formation.integration.test.js` —
  primary `integration`, resource classification provisional pending final-body
  measurement, subsystem `cdc-metadata`.

The three generated class manifests and impact selection metadata are
regenerated and audited rather than hand-edited except for the curated impact
contract. The red treatment snapshot uses all new production paths and the
final test bodies but predecessor behavior at the semantic assertions; it is
recorded as `test-output/continuation-20261011/cdc-c17/treatment.json` with
source fingerprint, snapshot SHA and lab log hash. Expected environmental
negatives (withheld route, real no-handler, pressure, spent first window and
session loss) are separately recorded in
`cdc-c17/expected-negatives.json`; none is counted as the treatment failure.
The treatment must reach the moving-boundary, stale-lifecycle, post-timeout
wake and pruned-rejoin semantic assertions. Setup failure, missing methods,
manifest drift, deadline before assertion, an empty topology or provisional
visibility alone invalidates the artifact. The corrected snapshot records the
same fingerprints in `cdc-c17/correction.json`, and locked-lab selection must
show the coupled pair selected from a change at either endpoint.

## C17 round-three revision: exact cache targets and terminal retry edge

This section supersedes the four remaining mechanics above. It incorporates
the third author-distinct REVISE verdict on subject SHA-256
`4f4d037ac046382909f5df41c911a056cfeb6dc2a999d5c5aa611980d0088202` in
`review-cdc-c17-design-round3-56.md` SHA-256
`b052181d63e9604323d203cd9a60b036a1ca5da2b1d70a1013cd88cab0fc64a7`.
Fragment implementation remains stopped until this corrected design receives
author-distinct approval.

### Cover capacity has no row-cardinality shortcut

The statement that retained cover has at most one gap per currently cached
source row is withdrawn. Differing-N observations and changing keyset boundaries
can leave multiple absence segments even when no live row occupies them. No
row-count-derived bound authorizes install or completion.

The only capacity authority is the exact staged post-overlay cover. Before
publication the coverage owner builds the candidate normalized overlay in its
bounded staging reservation, counts every resulting key and absence atom, and
counts its exact retained metadata bytes. It admits publication only when both
that candidate and the simultaneously retained old cover fit the already
reserved atom/byte budgets. The same counters are recomputed at atomic install;
a mismatch or capacity excess refuses the whole candidate as recoverable
`cdc_coverage_atom_capacity_unavailable`, preserves the old cover and suffix,
retains debt and releases staging reservation. Coalescing can reduce the
candidate; current row cardinality, returned row count and prior cell count can
never raise its budget. The configured atom and byte caps remain the explicit
volatile capacity ceiling and adequate configured capacity remains the supported
route for a finite normalized cover.

### Remote source and recipient lifecycle authority are distinct

There is no target `PartitionService` requirement. The remote source handler is
the only side that owns the local source `PartitionService` object. At handler
entry it resolves the exact locally hosted source replica, captures that service
object and its non-empty `service.raft.readStatus().lifecycleIncarnation`, and
revalidates `CORE_OK`, object identity and the same incarnation before source
view capture, every fragment materialization and the final source receipt. A
request routed to a node with no hosted source replica is recoverable
`cdc_coverage_source_not_hosted`; it does not return rows, absence or completion.
A late handler from a closed/replaced source object cannot answer for its
successor.

The recipient reconcile owner binds publication to its exact live
`CDCIntegrationService` object/token, the exact `SystemTableCache` object, and
the exact cache mutation-target object/callback registered when the debt was
armed. It rechecks all three object identities plus the live token before staging
and again inside the synchronous cache publication owner. Replacing the cache or
mutation target on the same service first fences/cancels the old reconcile key,
sessions, reservations and deferred notifications, then arms replacement debt
against the new exact objects; it cannot preserve the old token/object tuple as
current. The recipient needs no local source replica and never traverses or
fabricates a source `PartitionService`. Source lifecycle facts arrive only in
the exact source-bound receipt produced by the remote handler; target authority
remains the CDC token and cache/mutation-target identities.

Tests close/replace the source service between each remote await, replace the
recipient CDC service, and replace cache and mutation-target objects independently
while keeping the other objects live. Every old receipt/callback must be inert.
The formation witness includes a node with no hosted source and a seed-loss/
route-recovery interval: `source_not_hosted` retains debt below COMPLETE, then
the existing route/formation wake reaches a real hosted source and completes
without a local recipient source replica.

### Sub-minimum retry remainder

The retry clamp applies only when `remainingDeadlineMs >= 100`. When a retryable
transport or handler outcome arrives with less than 100 ms remaining, the owner
records the exact DEFERRED outcome but launches no retry and supplies no default
retry delay. The debt remains attached to the current captured absolute deadline;
the already armed deadline timer spends that generation at the same instant and
then follows the one cooldown path. This edge never rounds up, extends or replaces
the deadline and never starts a zero-delay loop. A virtual-clock discriminator
delivers no-handler, timeout, pressure and missing-session results at 99 ms, 1 ms
and exactly 0 ms remaining and proves zero further request launches, one deadline
transition and one cooldown wake.

### Resource classification remains provisional until measured

The proposed `ordinary` resource classifications for the three new coverage
unit tests and the formation integration test are provisional, not registry authority.
Before metadata generation, the final generated test bodies are inspected and
measured under the repository resource policy with their actual fragment size,
simultaneously retained old/candidate cover, route withholding, no-hosted-source
and seed-loss/recovery phases. The resulting existing resource class is recorded
truthfully; no baseline is raised and no separate artificial load-proof framework
is introduced. A timeout or worker loss before the semantic no-hosted-source,
seed-loss recovery and completion assertions invalidates the witness rather than
justifying a lighter class.
