# Query participant manifest resource budget proposal

Status: round-three proposed for independent owner re-review. No implementation
or compatibility claim follows from this note.

## Problem and boundary

`sql_transactions.participant_set_text` is the one durable authority for the
complete admitted participant set. `readParticipantSet` currently lets
`JSON.parse`, array construction, deduplication, sorting, canonical encoding and
freezing allocate without an owner-accounted byte reservation. There is no
accepted logical participant count limit to reuse. The 1 MiB participant staging
limit, query result limits, transport payload limits and PostgreSQL wire limits
own different content and cannot authorize a manifest cap.

This proposal adds a resource owner around the existing manifest codec. It does
not change which participant sets are valid, infer an empty set, abandon durable
debt, or classify a structurally valid set as corrupt because current capacity is
smaller than its bytes.

The SQL read owner has already allocated the returned row and its
`participant_set_text` JavaScript string before this boundary runs. The proposed
reservation accounts for incremental decode, pair arrays, maps/sets, sort work,
canonical output and frozen copies. It does not claim to bound the memory used by
the SQL row transport itself.

## Owners and configuration provenance

`TransactionParticipantManifestResourceOwner` is an engine-instance owner used
by every call to the canonical participant manifest codec. It is constructed by
`SQLQueryEngine` and passed to the live participant-set owner, recovery authority,
release census and cutover settlement. No caller can supply an `allowed` boolean
or bypass the owner for critical/recovery work.

Two new configuration keys are proposed and must move together through
`config-key-constants`, defaults, schema, definitions, startup wiring and dynamic
configuration:

- `distributedTransaction.participantManifestMaxUtf8Bytes`: the maximum fresh
  manifest text admitted by the current configuration. Proposed default:
  1 MiB. This is a fresh-growth admission limit, not a compatibility limit on a
  durable row that already exists.
- `distributedTransaction.participantManifestAggregateReservationBytes`: the
  maximum incremental manifest working-set reservation held concurrently by one
  query engine. Proposed default: 16 MiB and never lower than the fresh admission
  limit multiplied by the fixed incremental amplification reservation below.

The values are positive safe integers. Startup rejects invalid values. A dynamic
decrease affects later fresh admissions but does not invalidate, rewrite, or
terminalize an acknowledged durable row. A dynamic increase wakes retained
recovery waiters immediately through the existing recovery sweep owner. A
decrease does not revoke a reservation already held; it applies after releases.

The default values are new owner choices and require independent review. They are
not derived from an unrelated existing payload limit.

## Captured input and reservation

The codec accepts only an own enumerable data property containing one primitive
string. It obtains that property descriptor once, stores the primitive string in
a local binding, and never reads the row property again. Accessors, proxies,
inherited values, boxed strings and exotic objects are refused before parsing.
The captured string is immutable by JavaScript value semantics.

The owner measures UTF-8 bytes from that one captured string. Before
`JSON.parse`, it reserves:

```
incrementalReservation = fixedOverhead +
  amplificationFactor * capturedUtf8Bytes
```

The proposed fixed `amplificationFactor` is 8 and `fixedOverhead` is 4 KiB. The
factor accounts for decoded string storage, pair arrays, canonical ID and
partition strings, set/map indexes, sorting scratch, canonical output and frozen
copies. It is a resource admission estimate, not a statement about V8's total
heap or the already allocated SQL result. Changing either constant is an owner
contract change with adversarial allocation measurements.

For a live union, the reservation covers both old and candidate content. Before
parsing the old text or constructing arrays, a no-allocation measurement pass
over the dense own-data partition ID input computes the exact JSON-escaped UTF-8
contribution of every requested ID and the deterministic participant ID derived
from it. The owner then reserves the old parse amplification plus the measured
candidate output and its amplification. If the reservation is unavailable,
there is no participant BEGIN/QUERY/PREPARE effect and no manifest CAS.

The reservation is released in `finally` after parse, canonical comparison,
union construction, sorting, freezing and CAS candidate construction. Persisted
text and installed transaction state are durable/live ownership, not charged to
this transient parse reservation.

## Typed outcomes

The manifest reader returns one of these owner states:

- `canonical`: parsed and exactly canonical for the transaction ID.
- `retained_resource_pressure`: the captured durable text cannot currently
  obtain the reservation. The result includes transaction ID, UTF-8 bytes,
  required reservation, configured aggregate capacity and retry generation. It
  says nothing about structural validity.
- `malformed_retained_manifest`: capacity was obtained, but syntax, shape,
  identity, uniqueness, ordering or exact canonical bytes failed. The row stays
  preserved and activation stays closed.
- `invalid_input`: the source was not one captured primitive own-data string.

A structurally valid durable manifest that exceeds a newly lowered fresh limit
or current aggregate availability remains `retained_resource_pressure`. It is
retried when capacity is released or configuration increases. It is never
relabelled corruption, unsupported, empty, terminal, or completed.

Fresh growth whose candidate would exceed
`participantManifestMaxUtf8Bytes` returns typed retryable
`participant_manifest_admission_pressure` before the manifest CAS and before
any participant effect. The caller receives current bytes, candidate bytes and
limit. A later retry rereads the authoritative old text and recomputes the exact
union; the prior candidate is not authority.

## Scheduling and wake ownership

The resource owner has two FIFO classes:

1. retained recovery/cutover debt;
2. fresh admission.

When a retained waiter exists, newly arriving fresh admission cannot consume the
last capacity needed by that waiter. Within the retained class, transaction ID
is only a diagnostic; FIFO arrival order owns service. This avoids a fresh-load
starvation loop without making transaction ID or status an authority field.

Every reservation release wakes the first fitting retained waiter, then the
first fitting fresh waiter. A dynamic capacity increase performs the same wake.
The existing bounded transaction recovery sweep remains the durable backstop and
re-discovers retained IDs; no second ledger or timer is introduced. Shutdown
rejects volatile waiters with the typed retryable pressure result while durable
rows remain discoverable on restart.

Recovery, release census and cutover settlement propagate
`retained_resource_pressure` as a hold with the exact transaction IDs and byte
requirements. They cannot treat it as legacy disposition, drain completion or a
terminal transaction status. Ordinary live callers propagate fresh admission
pressure through the existing transaction failure result without minting a new
transaction identity or sending a participant request for the rejected union.

## Required implementation order

1. Add the configuration contract and the single engine-instance resource owner.
2. Change the manifest codec to require the owner and captured immutable text;
   remove unowned direct parse call sites.
3. Route live union through pre-parse/pre-effect reservation and preserve the
   existing exact old-text CAS.
4. Route recovery authority, release census and settlement through retained
   priority and typed outcomes.
5. Register config, manifest, recovery, release and caller-result endpoints in
   the impact contract.

No participant row, PREPARE evidence or decision may be written before a fresh
union's exact candidate is accepted by the existing manifest CAS.

## Required falsifiers and controls

- A valid durable manifest admitted under a larger configuration is restarted
  with a temporarily lower limit: it is held as resource pressure with the same
  bytes and transaction ID. Raising capacity wakes it and canonical recovery
  completes under the same identity.
- A malformed text below the capacity is retained and reported as corruption;
  the same over-capacity bytes are pressure until capacity permits parsing, then
  become corruption. No path infers `[]`.
- A union reserves old parse plus candidate allocations. Reservation refusal
  produces no participant BEGIN/QUERY/PREPARE and no participant row; a later
  accepted reservation persists the exact union CAS before the first participant
  effect.
- Fresh admissions cannot starve one retained recovery waiter under continuous
  load. Reservation release and dynamic capacity increase both re-enter the same
  waiter exactly once.
- Concurrent old-plus-candidate parses never exceed the configured aggregate
  reservation. Every success, parse refusal, CAS loss, exception and shutdown
  releases its reservation exactly once.
- Boundary tests cover UTF-8 multibyte text, JSON escaping, empty legal set,
  large legitimate set, dense own arrays, sparse arrays, inherited/accessor/
  proxy/boxed inputs, `-0`, NaN, Infinity and unsafe configuration values.
- Existing small canonical manifests produce byte-for-byte identical text and
  preserve all participant identities, ordering, decisions and recovery fanout.

## Non-claims

This contract does not bound the SQLite result row already materialized, define
a logical participant cardinality, prove arbitrary process-memory safety, or
make a valid retained transaction incompatible. It creates a bounded owner for
the additional work the manifest codec performs and a wakeable refusal state
when that work cannot currently be admitted.

## Round-two executable amendment

The rejected round-one subject is preserved verbatim at
`evidence/design-query-participant-manifest-resource-budget-round1-57b6886d.md`,
SHA-256
`57b6886dfa347549b216096142269e76212e118a7765decde15f2dbfaeb8008b`.
This amendment answers F1 through F4 in independent review
`review-c56-8-participant-manifest-budget-fresh56.md`, SHA-256
`ebfbfc00d84590b677457f50a23324b0ff2842394481b3641b5e7d41e411573e`.
It supersedes the reservation, waiter, fairness and dynamic configuration text
above. Source and tests remain held.

### F1. Staged lease and exact union upgrade

One call captures the durable participant text once from an own primitive data
property and captures one frozen configuration snapshot. It never rereads the
row property. The already materialized SQL row/string remains outside this
budget and is stated in every pressure diagnostic.

The resource owner performs a live union in four nonblocking stages:

1. **Old decode lease.** Measure the captured text's UTF-8 bytes without
   parsing. Acquire the fixed overhead plus the measured old-decode
   amplification before `JSON.parse`. If that lease cannot fit, release nothing
   and return `retained_resource_pressure`. Parse, exact-canonical validation,
   old pair freezing and the old membership index all remain charged to this
   lease. A valid historical row larger than the current fresh limit is still
   eligible when aggregate capacity can hold it; otherwise it remains pressure.
2. **Bounded requested-input capture.** The caller input must be a genuine
   dense array and not a proxy. Its finite native array length is captured once
   and bounds one forward scan; every iteration checks the existing caller
   cancellation/deadline. Each index must be an own data descriptor containing
   one primitive nonempty string; sparse, accessor, inherited and boxed entries
   refuse. Before retaining a new unique candidate string or deriving its
   participant ID, incrementally upgrade the lease for that string, ID, set
   entry and measurement scratch. Duplicate old/request strings are compared
   from their already allocated primitive value and add no retained entry or
   lease growth. Early fresh-byte saturation is applied only when the measured
   **unique** candidate lower bound proves that the exact union cannot fit, not
   from raw array length. A failed upgrade drops the staged candidates, releases
   the whole lease in `finally`, and returns pressure immediately. It sends no
   participant operation. This keeps additional memory bounded without
   inventing a logical count limit or rejecting a dense duplicate-only request
   as durable growth.
3. **Exact union sizing.** Under the decode/input lease, compare each captured
   candidate with the validated old membership index and the request's staged
   unique set. Duplicate old entries and duplicate request entries add no union
   member. From the resulting exact unique strings, compute the exact canonical
   JSON byte length and the owner formula for sort storage, pair arrays,
   canonical output and frozen copies without constructing those copies. Then
   atomically upgrade the same lease to that exact total. Upgrade failure
   discards all transient state and retries later from newly read authoritative
   old bytes; a stale parsed old set is never retained as authority.
4. **Construct and CAS.** Only after the exact upgrade succeeds may the owner
   allocate/sort pairs, encode/freeze canonical bytes and construct the existing
   exact-old-text CAS request. The lease remains charged through the bounded CAS
   await because the candidate text is still live, and is released exactly once
   on success, CAS loss, refusal, exception or shutdown. A CAS loss rereads the
   row and restarts at stage 1. No participant row, BEGIN, QUERY, PREPARE or
   decision effect precedes the successful existing manifest CAS.

The fresh byte limit applies to exact growth after stage 3. An unchanged
duplicate-only union bypasses the fresh-growth limit because it adds no durable
bytes, while still paying the old-decode and requested-input working leases.
Thus an arbitrarily repeated duplicate cannot become permanent fresh-growth
pressure; it can only receive transient aggregate pressure for the actual input
work. Malformed old bytes receive `malformed_retained_manifest` only after the
decode lease permits their complete validation. No over-budget valid text is
called malformed, and no malformed text is inferred empty.

The owner formula explicitly includes, per stage, the captured text reference,
decoded old array and strings, old membership index, captured candidate
references, candidate unique set, participant IDs, union pairs, sort scratch,
canonical output and frozen copies. Fixed overhead and amplification constants
must be established by adversarial allocation measurement before implementation
review. `minimumAggregateForFreshLimit(maxUtf8Bytes)` is computed from one old
manifest at the fresh limit plus one candidate/union output at that limit and
the queue metadata reserve below. It is not borrowed from the participant
staging, result, transport or wire budgets.

The proposed measured-envelope candidates are 4 KiB fixed overhead per decode
and output phase and 8 bytes of lease per measured canonical UTF-8 byte. Thus a
union holds `8 KiB + 8 * (oldTextBytes + uniqueCandidateContributionBytes +
exactUnionTextBytes)`, plus the wake metadata slice. The round-one 16 MiB
aggregate default is withdrawn because it cannot conservatively hold all three
1 MiB components plus metadata. The round-two default pair is 1 MiB fresh text
and 32 MiB aggregate. These values remain review inputs: implementation cannot
land unless allocation instrumentation shows the formula covers every named
copy, or a newly reviewed larger factor/default replaces it.

### F2. Nonblocking keyed wake into the existing recovery sweep

Reservation failure never waits and never stores a promise, parsed array,
captured manifest text or candidate set. It returns typed pressure immediately,
so `runRecoverySweep()` can continue to later transactions and clear
`recoverySweepInFlight`. Manifest pressure is per transaction and does not set
the coordinator's existing whole-sweep control-plane defer deadline.

For retained debt, the owner may store one transient wake registration per
transaction:

```text
{
  transactionId,
  participantSetDigest,
  configGeneration,
  requiredBytes,
  firstPressureSequence
}
```

The key is the transaction ID plus the exact authoritative text digest and
configuration generation. The exact text digest is the row revision for this
purpose; no new schema field is invented. Rediscovery of the same key
coalesces; changed bytes replace it only after the recovery owner rereads the
canonical row. Terminalization, source disappearance, successful
reservation/CAS or shutdown retires it. The registration contains fixed-size
identity metadata, not authority; the durable row remains the only recovery
source.

Wake metadata is charged to `min(1 MiB, floor(aggregate / 16))` of the same
aggregate budget. The proposed per-entry reservation is 512 bytes because the
transaction ID and SHA-256 digest widths are fixed; measurement must confirm or
increase it before implementation review. The maximum entry count is the floor
of that slice divided by the reviewed per-entry reservation. At saturation,
later discoveries return pressure without registration. They remain in the
existing durable recovery census and are retried by its periodic sweep. The
bounded map always keeps earlier `firstPressureSequence` entries rather than
evicting them for newer work.

The existing coordinator recovery owner gains only a coalesced immediate-wake
flag. A lease release or published capacity increase sets it once. If no sweep
is running, it invokes the existing `runRecoverySweep`; if one is running, its
`finally` schedules exactly one successor pass. Repeated releases and repeated
row discovery cannot create more promises, timers or passes. The existing
unreferenced periodic recovery timer remains the durable backstop, including
registrations omitted at the metadata bound. Shutdown clears volatile
registrations and the wake flag; restart rediscovers rows. This adds no durable
queue, timer, scheduler or authority ledger.

### F3. Fit-capable head protection and oversized rotation

Retained debt is ordered by first pressure arrival within the process. Recovery
reconstruction visits durable rows by canonical `created_at`, then transaction
ID only as a deterministic scheduling tie breaker; neither field changes
transaction authority. Fresh work is always below retained work.

The oldest registered retained requirement that is no larger than the current
aggregate capacity becomes the **protected head**. Existing leases may finish,
but later retained or fresh leases are admitted only from bytes above the
head's required amount. Releases therefore accumulate enough capacity for that
head, and the coalesced successor sweep attempts it before younger work. The
fence ends only when that exact row digest obtains its lease, changes,
terminalizes, disappears or becomes oversized under a newly published lower
capacity. Acknowledgement, cache activity and parse progress do not reset its
arrival order.

A requirement larger than the published aggregate capacity is classified
`retained_resource_pressure` with `fitState: "requires_capacity_increase"`. It
is visited once in the current sweep and rotated out of the protected-head
slot, so smaller independent retained debt can proceed. It is not deleted or
made terminal and does not consume a bounded registration slot indefinitely;
the durable row supplies rediscovery. A capacity generation increase triggers
an immediate full retained sweep in canonical recovery order. If the old
oversized row now fits, its durable creation order puts it ahead of younger
rows and it becomes the protected head. If it still does not fit, it rotates
for one more sweep cycle. This one-cycle cooldown prevents a permanently
oversized head from blocking small work while guaranteeing immediate
reconsideration on every relevant configuration increase.

When the registration map is full, its earlier fit-capable entries keep their
places. As they resolve or rotate oversized, later durable rows enter on the
next existing sweep. While any fit-capable retained entry is registered, fresh
admission cannot consume its protected bytes. Continuous fresh or smaller
retained work therefore cannot starve a large requirement that can fit, while
an impossible current head cannot stop useful independent recovery.

### F4. One frozen two-key configuration generation

`ParticipantManifestBudgetConfigOwner` is the sole producer of the engine's
budget snapshot. Startup obtains both keys from one `DynamicConfigService`
`getAll()` result, captures primitive own safe integers, validates the complete
pair with `minimumAggregateForFreshLimit`, and publishes one frozen generation:

```text
{
  generation,
  participantManifestMaxUtf8Bytes,
  participantManifestAggregateReservationBytes
}
```

The engine and every codec/reservation/diagnostic call capture this object
reference once. They never read the two dynamic keys independently.

Pair validation requires `aggregate - metadataSlice(aggregate)` to be at least
`8 KiB + 8 * (3 * maxUtf8Bytes)`, matching the maximum old, unique-candidate
and exact-union components admitted by one fresh-growth operation. The proposed
1 MiB/32 MiB defaults satisfy this relation. This validation does not promise a
historical row fits: larger acknowledged durable bytes remain retained pressure
until a sufficient reviewed capacity is published.

Runtime retains the existing per-key CDC watchers, but their callbacks only
stage candidate values inside this owner. An update replaces the staged value
for that key. The owner combines staged values with the last published pair and
publishes one new frozen object, with `generation + 1`, only when both values are
present, positive safe integers and the complete pair satisfies the minimum
aggregate formula. Publication is one reference swap. Invalid or incomplete
pairs remain staged and produce a loud typed diagnostic; they do not alter the
published generation, revoke held leases, wake recovery or strand debt. A later
second-key event may complete the pair. Both delivery orders therefore expose
only validated snapshots, although an independently valid intermediate pair
may be its own generation.

A decrease applies only to later reservations; held leases retain the snapshot
generation under which they were granted and release normally. An increase
publishes first, then sets the existing recovery owner's single coalesced wake
flag. A decrease that makes a historical manifest larger than capacity changes
its next result to retained pressure, never corruption or incompatibility.
Pending wake registrations are revalidated against the new snapshot and exact
current row before acquiring a lease.

### Feasible witness matrix

- A duplicate-only request much larger than the old set completes an unchanged
  exact union when staged input work fits; when it does not fit it returns
  transient pressure, sends no participant effect, and later succeeds without a
  fresh-growth refusal.
- An old parse lease succeeds, exact-union upgrade fails, and a retry after
  release rereads changed authoritative bytes before constructing or CASing.
  Old plus candidate arrays, maps, sort, canonical text and frozen copies remain
  below the captured aggregate generation in allocation instrumentation.
- Repeated sweeps of one pressure row retain one registration and no promise.
  A different row continues in the same sweep. Map saturation preserves earlier
  registrations; omitted debt reenters from the periodic canonical census.
- A fit-capable large retained head under continuous small retained and fresh
  load receives accumulated capacity and runs first. An oversized head rotates,
  small debt completes, then a capacity increase wakes the old head and restores
  its durable ordering.
- The two keys update in both orders, including an invalid intermediate pair,
  while a lease is active. Consumers observe only whole generations; lowering
  capacity does not revoke the lease, and the valid increase causes one wake.
- A valid historical row accepted under a larger configuration remains typed
  pressure under a temporary lower generation, then resumes the same recovery
  identity after capacity returns. Malformed bytes remain preserved hard
  refusal once enough decode capacity exists.
- Dense multibyte and escaped inputs, minimum-byte early saturation, sparse and
  accessor arrays, proxies, boxed strings, unsafe numeric configuration, CAS
  loss, shutdown and row revision exercise every release/retirement edge. Empty
  canonical sets and every legitimate participant count remain valid.

The impact contract must pair configuration snapshot production, manifest
decode/union, transaction recovery sweep, release census and settlement, and
live caller pressure propagation. This amendment defines no logical participant
count cap and authorizes no source implementation until independent re-review.

## Round-three executable amendment

The independently rejected round-two subject is preserved verbatim at
`evidence/design-query-participant-manifest-resource-budget-round2-dbd4fcc0.md`,
SHA-256
`dbd4fcc0f8c1b52bf186099553b03b583e2a35735ee30c7809788442f9bfbe17`.
This amendment answers F1 through F4 in independent review
`review-c56-8-participant-manifest-budget-round2-fresh56.md`, SHA-256
`648edb806e04d864054dd0bb142990f832b0e0fcb657e0b182a9167ecc8cba2c`.
It supersedes the fit calculation, committed-apply ownership, wake-entry
accounting and disappearance text above. Source, tests and numeric constants
remain held.

### F1. One allocatable work capacity

Every reservation decision captures one published configuration generation and
derives exactly once:

```text
metadataCapacityBytes = min(1 MiB, floor(aggregateCapacityBytes / 16))
workCapacityBytes = aggregateCapacityBytes - metadataCapacityBytes
```

Only `workCapacityBytes` is available to decode, capture, union, sort, encode
and CAS leases. The same value owns initial fit, protected-head selection,
protected free bytes, oversized rotation, diagnostics, and the generation
revalidation immediately before acquisition. Gross aggregate capacity never
makes a work lease fit. Metadata cannot be borrowed by a work lease, and an
unused work balance cannot expand the metadata map.

A retained requirement in `(workCapacityBytes, aggregateCapacityBytes]` is
therefore `retained_resource_pressure` with
`fitState: "requires_capacity_increase"`. It rotates for this sweep exactly like
any larger requirement, lets smaller debt and fresh work use unprotected work
capacity, and is reconsidered when a published generation makes the derived
**work** capacity sufficient. Pair validation compares the maximum fresh
operation requirement with work capacity, never the gross value.

The boundary witness places a requirement strictly above work capacity and
below gross aggregate. It rotates, permits smaller retained debt to complete,
and remains durable pressure. A generation whose derived work capacity now fits
wakes the existing recovery sweep; the same row becomes protected and
completes. Diagnostics name gross, metadata and work capacity separately.

### F2. Split admission codec from deterministic committed apply

There are two surfaces with one semantic manifest authority and different
resource lifetimes:

1. `SQLQueryEngine` owns `TransactionParticipantManifestResourceOwner` for live
   union, coordinator recovery, release census and pre-proposal settlement
   observation. These paths may return typed pressure and re-enter through the
   existing transaction recovery sweep.
2. `PartitionService.applyCommittedEntry`, `applyCoordinatorSettlement` and
   `applyTransactionSettlement` run inside the existing
   `RaftRsApplicationTransactionOwner` SQLite application transaction on
   leader, follower and restart replay. They consume no engine lease, dynamic
   config generation or volatile wake registration. Their allocating
   `readParticipantSet` calls are replaced by one deterministic
   `scanCanonicalParticipantManifest` primitive owned by the committed
   application boundary.

The scanner receives the already materialized primitive command and SQLite row
strings. It is one forward state machine over the exact canonical JSON grammar
emitted by `participantSetTextOf`: dense two-string pairs, canonical escaping
and UTF-8, nonempty partition ID, exact derived participant ID, and strict
partition-ID ordering. It retains fixed parser state, comparison/hash cursors,
one incremental SHA-256 context, and safe-integer byte/count accumulators. It
hashes and compares partition text by spans or chunks and constructs no array,
map, set, decoded copy, participant list or full token string. Invalid escapes,
surrogates, order, derived ID, unsafe count, trailing bytes or noncanonical
encoding deterministically refuse. Command and row manifest text must then be
byte-identical; FREEZE uses the scanner's safe count. DECIDE and PROGRESS keep
their exact current decision and CAS checks.

The leader request observation runs the same fixed-workspace scanner before
proposal and every replica runs it again at committed apply. Thus identical
command/row bytes produce the same READY or REFUSED result without local
capacity pressure. Invalid bytes use the existing typed settlement refusal;
SQLite/application failure remains the existing committed-apply host failure
and replay path. No committed entry is skipped or consumed without its atomic
owner result, and a leader precheck is never apply authorization.

The scanner is reachable only by the query settlement request owner and the
partition committed-application owner. Its impact registration pairs
`distributed-transaction-settlement.js`,
`partition-coordinator-settlement.js`,
`partition-service-entry-apply-base.js` and
`raft-rs-application-transaction-owner.js`. Parity tests feed the allocating
codec and scanner canonical, malformed, escaped, multibyte, long-token and
boundary-count bytes and require identical canonicality/count. A committed
leader/follower/restart matrix proves apply has no query engine or budget owner.

### F3. Wake metadata charges the complete retained identity

No fixed transaction-ID width is assumed. A wake registration captures the
primitive retained transaction ID once and computes its exact UTF-8 bytes and
actual JavaScript key representation before insertion. Its metadata lease is:

```text
measured fixed entry/key overhead
+ measured retained transactionId/key bytes
+ fixed participantSetDigest/config generation/sequence fields
```

The complete amount is atomically reserved from `metadataCapacityBytes`.
Modern 32-hex IDs and older or nonmodern IDs admitted by REQUIRED-schema census
take the same path. If the exact entry cannot fit, it is omitted from the
volatile map and the call returns retained pressure; periodic durable census
remains its recovery source. Omission neither rejects the row nor changes its
priority on durable reconstruction. The transient result may include the ID,
but no unaccounted copy remains after the call returns.

The former 512-byte constant is withdrawn. Exact-source allocation measurement
must establish map/key/entry overhead and ID encoding amplification, including
non-ASCII and long retained IDs, replacement, deletion and generation overlap.
That formula bounds registrations and does not impose an ID, participant-count
or manifest-content limit.

### F4. Only exact authoritative MISSING retires disappearance

“Source disappearance” means only `TRANSACTION_SET_READ_STATE.MISSING` from the
existing authoritative transaction-set reader for the same transaction ID and
current coordinator scope after its complete read/sandwich. Only that result
retires the matching wake registration for disappearance.

`UNAVAILABLE` retains the registration and original pressure sequence when one
exists. `INVALID` also retains it and reports the typed retained authority or
corruption defect; neither state becomes missing, completion or a priority
reset. `AVAILABLE` must match the current manifest digest and config generation
before acquisition or replacement. Terminalization may retire only after the
existing decision/status owner proves the exact terminal row under that same
authoritative read. Shutdown may clear volatile metadata because restart's
durable census reconstructs it; shutdown is not row disappearance.

The paired witness returns MISSING and UNAVAILABLE around an existing
registration. MISSING retires it. UNAVAILABLE and INVALID preserve its bounded
slot/order, and later AVAILABLE resumes the same debt. A stale MISSING from an
older scope cannot retire the current digest because retirement revalidates the
current scope and row revision.

### Round-three measurement and proof gate

No numeric default is approved here. Before source approval, exact-source
allocation instrumentation must establish scanner workspace,
old/candidate/union amplification, CAS lifetime, metadata key/ID retention and
config-generation overlap. It must prove the proposed pair leaves sufficient
`workCapacityBytes` after metadata reservation. A failing envelope returns the
constants/defaults to independent design review and cannot be repaired with a
logical participant cap.

The implementation witness plan adds four discriminators to the round-two
matrix: gross-versus-work fit; committed leader/follower/replay without a query
engine; long retained REQUIRED-schema IDs with charged or omitted wakes; and
MISSING-versus-UNAVAILABLE/INVALID retirement. No source implementation is
authorized until this exact amendment and measured envelope receive independent
review.

## Round-four whole-operation producer, retention and continuation amendment

The unreviewed round-three subject is preserved verbatim at
`evidence/design-query-participant-manifest-resource-budget-round3-22ec1630.md`,
SHA-256
`22ec16308e7d46183c415ccc8d31797692a343db3d779081ab9c1d57bb8fbb84`.
This amendment answers the later source-bound scope finding recorded in the TX
Quest log at `2026-10-11T17:23:08.338Z`. It supersedes every earlier statement
that excludes an SQL-produced row/string or complete recovery/census copy from
the operation budget. It does not change the round-three deterministic apply
split, BEGIN identity/transition design, or transaction semantics. Source,
tests, metadata, numeric defaults and Quest logs remain held.

The navigation source is the coherent startup checkpoint rooted at
`c6d71665e98be03de916705f272a9d6340e4a842`; the later BEGIN proof snapshot
`2925863c3e72a17854413fa2c850ce4ff76f6aff` is evidence context only and is not
adopted by this design. The concrete unbounded paths are:

- `distributed-transaction-release-census.js:36-55`, which calls `.all()`,
  retains every row, builds a second `canonicalRows` population, serializes the
  whole population, then builds complete legacy/recoverable ID arrays;
- `sql-query-engine-transaction-set-methods.js:18-82`, which sandwiches a
  complete participant-row array between two complete transaction rows;
- `sql-query-engine-transaction-recovery-methods.js:30-59,128-159` and
  `distributed-transaction-recovery.js:491-645`, which copy complete
  transaction, participant and write-operation arrays into recovery maps and
  workflow state; and
- `distributed-transaction-release-settlement.js:156-246`, which retains every
  participant answer, every transaction result and the full release proof.

### One resource owner, with the existing producer and semantic owners

`TransactionParticipantManifestResourceOwner` remains the sole resource owner
for this transaction-specific operation. Its aggregate configuration now covers
all additional bytes from producer materialization through consumer decode,
private construction, queued continuation, retained workflow state and final
proof. The existing name is retained; no generic memory owner or second store is
introduced. One instance is composed per runtime node and is passed to the
node's SQL query engine and its transaction-purpose control-plane query
producer. It is not global static state and does not grant transaction
authority.

The semantic owners remain unchanged:

| Boundary | Existing owner | Resource responsibility added here |
| --- | --- | --- |
| Authoritative SQL production | `ControlPlaneSystemTableGateway` query route and the owning partition SQLite connection | Purpose-specific descriptor/page claim before variable values leave SQLite; source response bytes retained through delivery completion. |
| Live union and exact CAS | `SQLQueryEngine` participant-set owner | Old/candidate/union/CAS lease from the same aggregate generation. |
| Recovery | `DistributedTransactionCoordinator` session FIFO and recovery sweep | One private transaction builder and one retained workflow lease; no public partial workflow. |
| Release | Partition release-facts owner plus `settleTransactionReleaseRows` | Bounded census/result continuations and compact invocation proof. |
| Committed apply/replay | `RaftRsApplicationTransactionOwner` and partition settlement owner | Fixed-workspace canonical scanners only; no dynamic admission or pressure decision. |
| Cache discovery | `SystemTableCache` read-only projection | Bounded shared-reference discovery pages only; cache never certifies complete authority. |

The frozen configuration generation and the round-three
`metadataCapacityBytes`/`workCapacityBytes` split remain. Work capacity is now
charged by three tagged lease kinds: `producer_page`, `transient_operation` and
`retained_workflow`. They share one arithmetic balance and the same retained-
debt priority/protected-head policy. A tag is diagnostic, not an independent
pool. A lease upgrade is atomic; failure allocates nothing further and returns
typed pressure. Every checked sum includes descriptor arrays, SQLite-to-JS row
objects, own-data capture, UTF-8/JSON encoding, page/cursor objects, gateway and
transport handoff copies, codec state, private builder maps/arrays, published
workflow objects, response/result objects and old-plus-new overlap.

The reviewed BEGIN owner retains its existing transaction-owned uncertainty
reservation and transition semantics. After that owner has established the
exact creation identity, this resource owner acquires the retained
participant/write-state lease before the first participant effect and upgrades
it before each later participant or write-operation admission. The measured
aggregate accounts for simultaneous BEGIN and manifest leases without assigning
the same bytes to two owners. No manifest pressure result remints, adopts or
changes a BEGIN identity. Recovery acquires the corresponding retained lease
before building an old transaction and transfers that exact lease to the
existing workflow only at atomic publication. The coordinator releases it when
that workflow is terminal and removed. Valid historical state above current
free or configured work capacity remains
`retained_resource_pressure`; capacity restoration resumes the same durable
identity. No entry is evicted, inferred empty or marked complete to make room.

There is no participant, transaction or write-operation count limit. Counts are
safe-integer progress facts only. A few very large fields and many small fields
pay their measured byte/copy requirements through the same claim. Fresh growth
still obeys the separately reviewed fresh-manifest byte admission limit. That
fresh limit never reclassifies already acknowledged rows.

### Pre-materialization descriptor and page protocol

The authoritative producer adds a transaction-purpose read contract to its
existing query route. It does not expose arbitrary SQL or a cache read. Each
source node applies the locally published aggregate generation and the request's
smaller remaining byte/deadline envelope.

For `sql_transactions`, `sql_transaction_participants` and
`sql_write_operations`, the producer runs a bounded synchronous SQLite read
slice:

1. Acquire a fixed descriptor-page lease before issuing SQL. The descriptor
   query selects only `rowid`, `typeof(...)`, `length(CAST(... AS BLOB))` for
   every variable column, and fixed-width numeric/null flags. SQLite traverses
   the existing primary/index BINARY order; no variable value enters JavaScript.
   Descriptor row count is derived from the measured metadata reservation, not
   a logical record cap.
2. Validate types and safe checked byte arithmetic. Reserve the exact full-row,
   canonical encoding and declared source handoff copies before selecting the
   row by its descriptor `rowid`. If the row cannot fit, return
   `retained_resource_pressure` with table, row ordinal, measured requirement,
   available work bytes and configuration generation. A structurally valid
   historical row is not `unsupported` merely because current capacity is low.
3. Fetch and capture one full row, verify all observed types/byte lengths and
   immutable identity against the descriptor, feed the rolling digest/scanner,
   and release its temporary row copy before the next row unless the bounded
   response page owns it. A mismatch is `STALE_PAGE`, discards that page and
   restarts from authoritative state.
4. Encode one bounded page only after the exact response/handoff upgrade. The
   producer keeps its lease until the gateway/transport completion or close
   callback proves that response bytes are no longer retained. A consumer
   timeout, cancellation or retry cannot release source bytes.

For an in-process gateway handoff, the immutable page transfers with its charged
lease to the local consumer and releases only after that consumer validates or
discards it. For remote delivery, source and consumer hold disjoint charged
copies; the source copy releases on actual send completion/close/error and the
consumer copy releases on consume/discard. A local shortcut may share bytes and
one transferred claim, but may not count neither copy or release at handler
return.

The page cursor is fixed-schema own data:

```text
purpose, tableName, sourcePartitionId, sourceLifecycleIncarnation,
sourceAppliedIndex, sourceConfigurationKey, operationId,
pageOrdinal, lastPrimaryKey, rowCount, rollingDigest, configGeneration
```

`lastPrimaryKey` is the exact captured primitive key and is charged for its full
representation. It is not truncated or assumed to be 32 hex. Pages use BINARY
primary-key order. A row/key too large for current capacity is pressure and can
progress after a reviewed capacity increase; it is never skipped. The cursor
contains no row population and is not authority. A continuation whose source
lifecycle, configuration, operation, ordinal, digest or deadline changed is
stale and must restart. `sourceAppliedIndex` must be safe and monotonic; an
unrelated advance does not itself invalidate a transaction page. Target-row and
child-population digests plus the final verification decide whether the relevant
state changed. A lower index or changed source incarnation/configuration is
stale. The source read transaction ends before any network await.

The supported data boundary is an existing canonical schema row whose SQLite
types are correct and whose byte lengths and complete lease formula are positive
safe integers representable by the current runtime. Fresh writes are refused
before durability if they exceed that platform representation. Pre-contract
durable bytes outside the current runtime representation remain a loud retained
resource/runtime hold; they are not corruption, absence or completion. This is
a representation boundary, not a logical participant count cap.

### Release census and compact invocation proof

`readTransactionReleaseCensus` becomes a bounded census operation rather than a
function returning populations. Inside one synchronous SQLite read transaction,
it streams descriptor/full rows in BINARY `transaction_id` order, validates the
manifest and recorded decision with the charged scanner, and maintains only:

```text
schemaVersion, semanticVersion, state,
rowCount, legacyCount, recoverableCount,
rowGenerationDigest, recoverableIdentityDigest
```

The digest encoding is field tagged, type pinned and length prefixed; it is not
`JSON.stringify` of a full array. An empty `rowCount:0` is CLEAR only after the
complete read transaction ends successfully. Deadline, descriptor pressure,
row pressure, malformed authority or SQLite failure returns HELD/UNAVAILABLE
with an incomplete flag; no partial digest is a census. A legacy row increments
the count and digest without retaining a full ID array. Diagnostics may retain
one fully charged current ID for the immediate consumer; otherwise they report
its length and digest, never a fabricated truncated identity.

Release settlement re-enumerates rows in bounded pages under the one existing
release attempt and its original absolute deadline. It settles one transaction
and one participant reply at a time; response, manifest and decision bytes stay
charged until exact before/after authoritative readback. The canonical manifest
and decision scanners advance in lockstep, so no participant-pair or reply array
is required. Creating a missing rollback decision uses one measured streaming
encoding lease and persists the exact canonical text before participant fanout.

For each successfully re-driven transaction the owner adds one canonical result
record to an incremental SHA-256 and increments a safe count. It does not retain
the result or participant IDs after the digest update. After the last page it
runs a fresh complete census and a fixed-workspace expected-result digest over
the final rows. Completion requires:

- zero legacy rows;
- final row count equals the number re-driven in this invocation;
- the invocation result digest equals the final expected-result digest;
- the final source population digest and schema/enforcer facts are complete; and
- the release attempt, membership/configuration and absolute deadline are still
  current.

The resulting proof contains only release/attempt identity, schema/semantic
version, final row count, final row-generation digest and settlement-result
digest. `transactionReleaseProofValid` compares those compact facts with the
fresh local complete census. Historical terminal status alone still proves
nothing: every row contributes to the current invocation digest only after its
participants are idempotently re-driven and terminal readback succeeds.

The compact proof is produced only by the existing private release-settlement
owner from its live accumulator and final census. A caller-supplied digest,
terminal row projection or cache summary is not accepted as that owner result;
the release request boundary carries the exact immutable result returned by the
current attempt. Impact/audit registration must keep the producer and consumer
paired so replacing the live result with a digest computed from rows is a
required negative.

An insert, delete or mutation before/behind the cursor changes the final count
or digest. The proof is discarded and the same durable attempt restarts from
the first row. Already committed settlement effects remain idempotent. An
interruption retains no population array or false completion marker. This
replaces the current unbounded `legacyTransactionIds`,
`recoverableTransactionIds`, `transactions` and `participantIds` proof arrays;
it does not weaken the release lane, drain or origin rules.

### Authoritative recovery builder and cache discovery

The cache becomes discovery input only. `SystemTableCache` exposes a read-only
shared-reference page bound to one table mutation version and ordinal. It walks
the existing Map in its stable iteration order, returning at most the rows whose
reference-array charge fits the acquired page lease. It does not clone values,
sort the table or call `getAll`/`filter`. A version change invalidates the cursor
and restarts discovery. Cache absence, a partial page or completion of one cache
table never proves durable transaction absence or a complete recovery set.

Each discovered transaction ID enters the existing coordinator recovery sweep
and session FIFO. The authoritative gateway then supplies one paged transaction
bundle:

1. descriptor/full `sql_transactions` row before;
2. all matching participant rows through bounded BINARY pages;
3. all matching write-operation rows through bounded BINARY pages; and
4. descriptor/full `sql_transactions` row after plus a second fixed-workspace
   digest/count verification of the two child populations.

All pages share one operation ID, original sweep or transaction deadline and
source lifecycle/applied/configuration witness. The before/after transaction
fence retains the existing exact fields. Child population counts and digests
must match their verification pass. Missing, unavailable, stale or changed
pages retain debt and publish nothing.

The coordinator has at most one private builder for an exact transaction and
operation generation. Same-ID rediscovery coalesces into it; another sweep does
not create a second copy. The builder holds the retained-workflow lease and
incrementally constructs the existing workflow participant map and
write-operation array. Manifest pairs are emitted by the canonical scanner one
at a time and matched against authoritative participant pages. Every child row
must occur exactly once; missing, duplicate, foreign or extra rows refuse the
complete bundle. The builder is not in `workflowsById`, `recoveredTransactionIds`
or any execution queue until all fences, canonical bytes, counts and digests
pass. Publication is one synchronous handoff into the existing workflow owner,
then the retained lease transfers with it.

Pressure, deadline, shutdown or source mutation discards the unpublished
builder and releases every transient/retained lease exactly once. Durable source
rows and an existing bounded wake registration remain; periodic recovery and
cache/gateway revision wakes rediscover the transaction. A published workflow
is never evicted for pressure. Its existing session FIFO owns replay, and the
single retained lease survives queued/retry work until the existing
`DurableWorkflowCoordinator.removeWorkflow` transition removes that exact
workflow. A terminal row that remains published therefore keeps its lease; a
status projection alone is not release authority.

`retainAdvancedDistributedTransactionReadback` remains the reviewed BEGIN
single-row handoff and is not changed into bulk recovery. It may publish only
the already validated same-creation advanced row through its existing FIFO; this
amendment neither remints identity nor reopens the approved BEGIN transition.

### Deterministic committed apply remains outside dynamic pressure

Round three's committed-application split is retained and extended to all
variable settlement fields. Leader request observation and every committed
leader/follower/restart apply use the same fixed-workspace
`scanCanonicalTransactionSet` state machine over the already owned immutable
command and SQLite row strings. It validates manifest grammar, decision grammar,
pair identity/order, exact command/row bytes, counts and digests without arrays,
maps, decoded token copies or dynamic configuration.

The log entry and durable SQLite row are base bytes already owned by the Raft
log/application database. All additional apply work is fixed workspace. Query
resource pressure cannot return DEFERRED, choose a different outcome, skip an
entry or make replicas disagree. An invalid canonical stream produces the same
typed deterministic refusal everywhere; an environmental SQLite/runtime
allocation failure remains the existing fail-closed application/replay failure.
The request-side producer/admission limits future command creation before Raft,
but they are never apply authorization.

### Single deadline, wakes and exact release rules

One absolute deadline belongs to each live transaction call, recovery sweep
turn or release attempt. Descriptor scans, page production, transport, decode,
builder work, participant delivery, final verification and CAS consume its
remaining time. Pages, pressure replies, ACKs, cache revisions and retries never
reset it. A deadline can stop new work and release locally unreferenced leases;
it cannot free a source response still owned by transport or a published
workflow's retained state.

The existing coalesced recovery wake and periodic sweep remain the only retry
owners. Lease release, configuration increase, cache mutation revision and
authoritative gateway availability set the existing one-bit successor wake.
They add no promise per row and no timer. Shutdown blocks new acquisition,
invalidates private continuations, waits for in-flight producer close, discards
unpublished builders/wake metadata and preserves all durable debt for restart.

Exact release rules are:

| Allocation | Release fact |
| --- | --- |
| Descriptor/full-row/page scratch | Page consumed/refused or local exception, after no owner retains the values. |
| Source encoded response | Actual transport completion/close/error, never caller timeout alone. |
| Consumer page/decode | Page validated into the private builder/digest or discarded stale. |
| Private builder | Atomic workflow publication transfers the lease; otherwise discard/timeout/shutdown releases it. |
| Published workflow | Existing terminal removal after durable outcome; pressure cannot evict it. |
| Compact release proof | Current release attempt consumes/refuses it; proof has no population arrays. |
| Wake metadata | Exact success/terminal authoritative MISSING/revision replacement/shutdown under round-three rules. |

### Completion, interruption and proof matrix

No operation reports complete from page exhaustion alone. Completion always
requires the final authoritative count/digest verification for the same source
witness and operation. The following paired witnesses are required in addition
to rounds two and three:

- **Huge few entries:** one transaction with a very large manifest/decision and
  one very large participant/write field pressures before source
  materialization under low capacity, then completes under increased capacity
  with exact bytes and no logical count rejection.
- **Historical over-current-limit:** a valid acknowledged row admitted under a
  larger generation remains durable pressure after a decrease; unrelated small
  debt progresses; restoration wakes and recovers the same identity.
- **Census mutation/interruption:** insert/delete/update before and behind a
  page cursor, interruption after participant effects, and lost final response
  all fail the final digest/count or return HOLD. Retry re-drives idempotently
  and produces one compact proof; no partial array or terminal status alone
  closes release.
- **Recovery population:** cache pages discover an ID, authoritative child pages
  mutate between passes, and shutdown interrupts a private builder. No partial
  workflow becomes visible. Stable retry publishes one exact workflow with all
  participants/write operations and one retained lease.
- **Aggregate copies/concurrency:** overlap source descriptor/full row/encoded
  response, consumer bytes, codec scratch, private builder, published workflows
  and wake metadata at measured maxima. Claims never exceed the frozen work and
  metadata capacities; later work receives typed pressure and resumes on the
  same owner wake.
- **Committed parity:** long canonical/malformed manifest and decision bytes
  produce identical leader, follower and restart scanner results with no query
  engine, config generation or pressure branch.
- **Positive small control:** existing canonical small unions, recovery,
  release settlement and committed apply remain byte-for-byte and decision-
  for-decision equivalent, including empty legal participant sets.

Allocation instrumentation must measure every named source, transport,
consumer, builder and retained copy, including JSON/UTF-8 amplification and
overlap. It must establish configuration defaults and descriptor/page metadata
sizes before implementation approval. A failed envelope requires a larger
reviewed formula or capacity; it cannot be repaired by dropping accepted rows,
calling pressure corruption, treating a partial page as complete, or imposing a
logical participant count cap.

### Round-four producer-to-release timeline and ceiling

```text
frozen config + operation deadline
  -> source descriptor claim before variable SQLite materialization
  -> exact row/page + encoded-response claims
  -> consumer page/decode claim
  -> canonical scanner / private recovery builder / rolling release digest
  -> final source count+digest verification
  -> atomic workflow lease transfer OR compact release proof
  -> terminal workflow removal / proof consumption releases retained bytes
```

This is a coherent existing-owner design path, not an implementation approval.
It adds no durable scope table, queue, scheduler, timer, cache authority, raw-SQL
bypass or generic memory framework. Parameterized sizes remain measurement
gates. C56-1/4/6 transition semantics and BEGIN recovery are not reopened;
activation, FreshMG, other C56 findings and whole-TX acceptance remain separate.
