# Query participant manifest resource budget proposal

Status: round-two proposed for independent owner re-review. No implementation
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
