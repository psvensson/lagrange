# Query participant manifest resource budget proposal

Status: proposed for independent owner review. No implementation or compatibility
claim follows from this note.

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
