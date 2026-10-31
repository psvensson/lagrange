# Detailed design: Bounded structured partials

Quest slot: `call-bounded-structured-partials` (Q4). Requirements contract:
[requirements.md](requirements.md#structured-partials). Epic:
[pilot-readiness-and-public-proof](../../epics/pilot-readiness-and-public-proof.md).

## Status and supersession — 2026-10-31

This is the proposed 0.5 implementation contract, following 0.4.1's bounded
count/byte and no-truncation repair. Q4 has no accepted implementation or new
sealed verdict by virtue of this revision. Its actual Quest and red witness
must be prepared before runtime work.

This revision explicitly supersedes the earlier planning requirements that
semantic group keys remain disjoint across shards, that an additive bare-number
wire format coexist with a new structured envelope, or that the coordinator
implicitly merge/select results. Existing Quest history and accepted evidence
are not rewritten. The new contract uses one codec and separates transport
delivery identity from application group keys.

## Existing owners

| Boundary | Responsibility |
| --- | --- |
| `src/service/call-cell-routing-contract.js` | Validate admitted emitted contributions and typed refusal vocabulary. |
| `src/runtime/call-cell-reduce-coordinator.js` | Admit exact delivery identities, enforce aggregate completeness/budgets and present ordered contributions to the reducer. |
| `src/runtime/call-cell-context-host.js` and `src/runtime/call-cell-value-mapping.js` | Preserve value types and bounds across guest/host representation boundaries. |
| `src/service/service-source-contract.js` and `src/service/service-typings-generator.js` | Declare the partial/state schemas and generate immutable editor types. |
| One shared codec owner used by these boundaries | Canonical finite-JSON encoding, validation, size accounting and deterministic comparison. Its placement is selected before the Quest is sealed; there is no per-channel codec. |

The compiler, guest entry, local receiver, durable coordination representation
and reducer must use the same versioned contract. An adapter may change bytes
only according to that owner's declared encoding; it may not change meaning,
identity, limits, deadline or failure.

## Closed value grammar

Admitted values are finite JSON data:

- Null and booleans.
- Finite IEEE-754 numbers. Integral values must be safe integers; larger exact
  integers require an explicitly declared string representation. NaN and
  infinities are rejected. Negative zero is normalized to zero at value
  encoding and has no distinct wire representation.
- Unicode strings with valid scalar values and explicit UTF-8 byte bounds.
- Bounded arrays of admitted values.
- Bounded records with string field names and admitted values.

The typed schema declares required/optional fields and permitted value kinds.
Missing, null and a concrete value have distinct semantics; undefined is
invalid, not silently omitted. Unknown fields follow the declared closed
schema and are refused unless the schema explicitly admits a dictionary.

Dates, functions, symbols, BigInt, binary objects, class instances, cycles,
getters, setters and custom prototypes are invalid. Binary and other richer
types require a future explicit contract; JSON serialization must not silently
coerce them. Duplicate textual record names and invalid Unicode are refused.
Decoding creates immutable safe data records without invoking object setters
or constructors. Property names remain data; no merge or prototype operation
may interpret them as authority.

## One canonical codec

The canonical encoding is a versioned JSON envelope with its schema identity
and value. Use a specified deterministic JSON serialization profile:
deterministic UTF-16 code-unit property ordering, ECMAScript shortest-round-trip
number spelling, standard minimal JSON escaping, no insignificant whitespace,
and no Unicode normalization. The restricted number/value grammar above is
validated before encoding.

The codec owner must define the exact bytes and share golden vectors across
guest and host. Describing an implementation merely as "JCS-style" is
insufficient: every accepted number, escaped string, ordering case and envelope
field has one representation. Wire decoding rejects duplicate fields before
they can be lost by ordinary JSON parsing.

There is one distinction between value input and wire input:

- Typed author values are validated and encoded canonically by the shared
  encoder; their JavaScript insertion order does not define wire order.
- Received canonical bytes must satisfy
  `encode(decode(bytes)) === bytes`; alternate spellings, unknown versions and
  non-canonical field order are typed refusals.

Durable records retain those canonical bytes or their durably owned content
reference. A digest without recoverable bytes is not replay state. Decoded
reducer/state values are deeply immutable. The codec guarantees deterministic
input bytes; it does not make a nondeterministic user reducer deterministic.

Finite numeric values are a subset of the new value grammar. They travel
through the same canonical envelope as records and arrays. Q5's cutover
rebuilds service artifacts for this contract; there is no retained v0/bare-value
wire branch, dual validation policy or parallel old runtime.

## Delivery identity and group identity

Each final shard contribution has a runtime-owned delivery identity including
invocation, attempt, operation, Binding generation, stable shard generation
and emission ordinal. The guest supplies the group key and value; it cannot
forge the source or retry identity. Page delivery identities belong to Q3 and
are not reused as business group keys.

A group key is application data, with an explicitly typed string or finite
numeric representation. For example, several shards may emit the group key
`"account-42"`. Those are distinct valid contributions and all reach the
application reducer. String `"1"` and number `1` remain distinct. A logical
group may occur repeatedly within a shard as well as across shards.

The coordination owner applies these rules:

| Observation | Required behavior |
| --- | --- |
| New authorized delivery identity | Validate, account and retain its contribution. |
| Same delivery identity and identical canonical group/value bytes | Idempotent duplicate; do not count or reduce it twice. |
| Same delivery identity but different canonical bytes or source fence | Typed conflict or stale-delivery refusal; no successful partial result. |
| Distinct delivery identities with the same semantic group key | Preserve every contribution for the declared reducer. |
| Contribution from an abandoned attempt or unadmitted shard/generation | Refuse; it cannot satisfy completion. |

Deduplication is based on delivery identity, never on the group key. Removing
the old `SHARD_OVERLAP` semantic-group refusal must therefore be paired with
actual replay/delivery fencing; simply accepting duplicate keys is incomplete.

## Reducer semantics and ordering

The reducer receives the complete validated contribution sequence in a
specified total order: canonical stable shard identity followed by emission
ordinal, within the pinned invocation/attempt/operation. The shard comparator
uses canonical bytes and an explicit type order, never host locale or arrival
timing. The admitted shard set is frozen for the attempt; a new topology/view
attempt cannot reuse old contributions.

The application reducer owns grouping, sum/count/average, ordering and final
selection. The host performs no implicit group merge, algebraic fold, numeric
ranking, truncation or top-K. An explicit operation may compute top-K, but
that is its declared algorithm with its own correct bounded accumulator and
oracle, not a generic coordinator optimization.

The same logical input and declared order must produce the same reducer input
on replay. Floating-point addition is not assumed associative. A future
parallel/tree reduction requires an explicit separately proven algebraic
contract; this Quest does not silently introduce one.

## Count, byte and retention bounds

The contract declares maximum encoded bytes per contribution, maximum string
bytes, nesting depth, list length and record-field count. It also declares
per-shard and whole-invocation contribution count and total encoded bytes,
and a bounded final result. Q3's accumulator uses compatible state limits.

Every ingress validates using the shared codec before cloning, allocating a
large decoded graph or retaining durable bytes. Aggregate counters are
computed over admitted unique delivery identities and committed with their
progress; an identical replay neither consumes budget again nor grants a new
budget. Count checks per shard are insufficient to bound the combined input.

If the full set cannot fit, the invocation fails with a typed count/byte
refusal and the reducer is not invoked with a subset. The coordinator must
not first concatenate an unbounded set and only then check its size.
No `sort(...).slice(...)`, implicit max-items success or hidden top-K is
allowed on the generic path. The planned 0.4.1 correction must establish this
failure behavior for the current contract before Q4 extends it to the
structured grammar without changing its meaning.

Existing invocation and coordination owners retain partials only for the
bounded attempt, terminal-result and replay-fencing lifetimes. Deadline,
cancellation, conflict and whole-attempt discard release buffers/state through
those owners while preserving the bounded evidence needed to reject late
delivery. No second partial store or cleanup loop is introduced.

## Typed failure classes

The owned vocabulary must distinguish unsupported codec/schema version,
invalid value/type, malformed/non-canonical bytes, depth/element/count/byte
overflow, delivery conflict, stale attempt/generation, incomplete shard
coverage and final-result overflow. Failures preserve the invocation's
outcome and cleanup obligations. They are not mapped to an empty partial
array, empty JSON object or successful truncated result.

## Planned acceptance

The proposed Q4 scenario is `call-bounded-structured-partials`, through the
existing scenario-harness, three consecutive accepted runs, metric
`priority`. A concrete red witness and original receipts are required before
claiming completion; this plan is not evidence that the scenario exists.

A generated public service must publish its compiled component and run through
the canonical HTTP/WASI/call path on at least two independent partition
hosts. The account-summary journey uses structured contributions containing
sum and count, with the same account group present on multiple shards.
An independent oracle verifies the complete total and weighted average.
The normal journey also exercises Q3's one-page and multi-page forms.

Required attacks and evidence include:

- The same group key from different shards, repeated group keys within a shard
  and string/numeric lookalikes; all valid unique deliveries reach reduction.
- Identical delivery replay, conflicting replay and late output from an
  abandoned attempt; only the identical replay is an idempotent no-op.
- Arrival permutations produce the same ordered reducer input; removal of
  deterministic ordering fails an order-sensitive witness.
- Non-finite/unsafe numbers, negative-zero normalization, invalid Unicode,
  duplicate field names, non-canonical bytes, prototypes/accessors and cyclic
  author values; guest and host agree on acceptance and canonical vectors.
- Boundary and overflow values for every count/byte/depth limit, including
  many individually valid shards whose combined contribution exceeds the
  global limit. No reducer sees a truncated set.
- Real restart/lost-answer injection around durable contribution acceptance,
  deadline/cancellation cleanup and measured retained-memory bounds.

A handwritten dispatcher, source-imported reducer, fixture-only numeric matrix,
single process with two logical owners or self-referential oracle cannot close
this feature. Receipts identify exact source, component, workload, host and
failure observations. Numeric success in one example does not certify the
whole grammar or failure envelope.

## Integration and limits

Q2 owns typed selector parameters; Q3 owns read views, page accumulation and
attempt progress; Q5 owns one canonical multi-operation component target.
The [standard HTTP service API](../standard-http-service-api/requirements.md)
owns Hono and the request-scoped SDK. This contract is internal to those
public calls and adds no new routing or request-handler framework.

No generalized algebraic merge, unbounded stream, new edition boundary,
alternative wire format or legacy fallback is introduced.
