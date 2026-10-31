# Detailed design: Call-shard paged execution

Quest slot: `call-shard-paged-execution` (Q3, gate). Requirements contract:
[requirements.md](requirements.md#paged-execution). Epic:
[pilot-readiness-and-public-proof](../../epics/pilot-readiness-and-public-proof.md).

## Status and supersession — 2026-10-31

This is the proposed implementation contract for the 0.5 service milestone,
following the bounded 0.4.1 correctness repairs. It is not an implementation
receipt or a sealed Quest verdict. The Q3 Quest record and meaningful red
witness must be created and sealed before runtime work; this document does not
assert that the proposed acceptance scenario already exists.

This revision explicitly supersedes the earlier planning clauses that treated
read-committed keyset reads as stable continuity, ran an arbitrary whole-batch
function once per page, left its combine law implicit, persisted only a partial
digest, or retained a parallel non-paged v1 execution contract. Historical
Quest logs and receipts are unchanged. A cursor, an accumulator and a read
view together define a computation; none alone proves resumability.

## Existing owners and interaction boundary

| Concern | Existing owner and required extension |
| --- | --- |
| Typed selector and page planning | `src/service/call-cell-batch-executor.js` owns the immutable selector, admitted parameter vector, stable row order and next-page plan. |
| Invocation and attempt lifecycle | `src/service/call-cell-invoker.js` owns admission, deadline, expected shard set, attempt fencing, dispatch and terminal outcome. |
| Local reads and read-view custody | `src/node/runtime-service-call-cell-handler.js` uses the partition/query owner for a retained read view and bounded local page reads. It cannot invent a snapshot from a cursor. |
| Progress and completion visibility | `src/runtime/call-cell-reduce-coordinator.js` owns admission of completed contributions and their durable relationship to the invocation attempt. Extend the current coordination contract through the existing mutation/workflow primitives; do not add an independent resume authority. |
| Guest execution and marshalling | The existing service entry generator, WASI runtime and call-context owners carry the explicit accumulator lifecycle and its bounded values. |
| Resource and concurrency admission | Existing invocation setup, dispatch pool and SQL result-budget owners supply row, byte, state, queue and deadline limits. |

The implementation must name the actual durable rows, transition owner and
commit operation in its Quest before code. A process-local map, cached cursor,
lease timestamp or replica address cannot become authoritative progress.
Page reads and guest execution remain on the partition host; raw shard rows
must not be collected at ingress.

## One execution model

Every admitted operation uses an explicit bounded accumulator lifecycle:

1. `init(arguments)` creates its initial state.
2. `step(state, page, arguments)` returns the next state.
3. `finish(state, arguments)` returns that shard's final partial entries.

These names describe the required semantics. The compiler's public declaration,
generated types and component ABI must expose the same lifecycle without
hiding a merge function in the host. The operation declares the state schema
and its maximum encoded size before admission. State and partials use Q4's
one canonical finite-JSON codec; the host validates both before retaining them.

A one-page input follows this same lifecycle: one init, one step and one
finish. An empty shard follows init and finish with no fabricated row. There
is no second whole-batch runtime, automatic adaptation that re-runs an
arbitrary old `run` function per page, or implicit host combine. Authors must
express the accumulation law. For example, an average carries sum and count
through step and divides in finish; averaging page averages is incorrect.

Step and finish are deterministic for the admitted inputs and order. They
must not publish external effects. A retried execution can run again
physically, while its progress and contribution are accepted at most once.
An operation that cannot express its algorithm with bounded state is refused
as unsupported under this contract; the host cannot quietly materialize its
whole shard. Existing artifacts must be rebuilt for the canonical target
under Q5 rather than kept on a second execution path.

The global reducer receives every admitted final shard contribution, in Q4's
defined order. It does not receive partial results from an unfinished shard.
No host-imposed sum, averaging, group merge, ordering by value or top-K
selection is permitted.

## Admission and identity

Before the first page, the invocation owner freezes:

- Invocation identity, attempt identity, operation identity, artifact digest
  and Binding generation.
- Selector schema and text, canonical typed parameter bytes and their digest.
  Q2 supplies the same normalized values to planning and every local read.
- The expected shard identities and their storage/schema generations.
- The selected per-shard read-view identities and the declared consistency
  scope, row ordering and comparator version.
- One absolute deadline and all row, byte, page, state, partial and retry limits.

A delivery is identified by invocation, attempt, operation, shard generation
and zero-based page index. Host identity is routing information, not page
identity. A retry preserves the entire admitted identity; it cannot change
parameters, read view or operation code under an existing page identity.
A new attempt has a new fence and cannot consume the previous attempt's state
or contributions.

## Read-view and cursor contract

### Stable read view is required

All pages of a shard attempt read the same retained logical row versions.
The partition/query read owner supplies an immutable read-view identity and
an explicit lifetime, invalidation outcome and capability to serve that view.
The selected shard set and read-view vector are recorded with the attempt.

This is a per-shard stable-view requirement. It does not claim a common
cluster-wide transaction snapshot. The public operation result and evidence
must name the actual consistency scope. A cluster-wide point-in-time claim
requires a separately implemented common read barrier and cannot be inferred
from this vector.

If the selected backend cannot provide the required stable view, admission
fails with a typed read-view-unavailable outcome. A sealed benchmark dataset,
a caller promise not to write, a timestamp in a request or a keyset cursor
alone cannot substitute for that capability. Read-committed page-by-page
queries are not an implementation of this contract.

View retention is bounded by the attempt deadline and explicit resource
limits. Cancellation, terminal refusal and successful completion release the
owned read resources. The current owner must account for pinned storage and
native memory; a bounded JavaScript accumulator alone is insufficient.

### Keyset position within that view

Pages use a deterministic total order over the selected row identity. The
Binding declares or derives a usable unique tie-breaker through the current
schema owner. Comparison types, NULL placement and collation are fixed for
the attempt. No unqualified rowid, locale-dependent comparison or unspecified
SQL order is admitted as a portable continuation key.

The cursor is internal and contains its format version, view identity and
last consumed key tuple. Each subsequent page advances strictly within the
same view and order. Cursor equality is permitted only when recognizing the
same already-committed page delivery; it is not progress. No caller supplies
or edits this token.

A unique key makes navigation deterministic. It does not preserve deleted
rows, old values or an old snapshot by itself. Replica movement is allowed
only when the destination can prove custody of the identical view and
generation. Splits, schema changes or view loss cannot silently change the
meaning of a retained cursor.

## Atomic progress and recovery

A resumable page transition atomically commits the complete progress tuple:

- Admitted invocation/attempt, operation and shard generation.
- Previous and next page positions and read-view identity.
- Validated new accumulator bytes, or a durable content-addressed reference
  whose bytes are retained under the same owned lifetime.
- Input identity/digest, state digest, consumed row/byte/page counters and
  the last accepted page delivery identity.
- Completion state and the fencing revision used by the next transition.

The cursor and accumulator must advance together under a conditional
transition from the exact previous revision. A cursor plus a partial digest
does not reconstruct the state and is not a sufficient journal. Advancing
the cursor before durable state, or retaining state from a page whose
progress was not committed, is forbidden.

The existing owner decides lost-answer and restart behavior:

| Observation | Required consequence |
| --- | --- |
| Same completed page identity and identical canonical input/state bytes | Return the existing progress outcome without applying step again logically. |
| Same identity with different input, parameters, view or result bytes | Typed conflict; fence the affected attempt. |
| Page execution happened but its commit cannot be confirmed | Query the durable progress owner; retain uncertainty until confirmed, or discard the whole attempt. Never infer commit from a cache or timeout. |
| Exact committed state and identical read view remain recoverable | Resume the next page through the normal owner/routing path. |
| Read view, state or required commit evidence is unavailable | Fence and discard the entire invocation attempt and all its shard contributions. Return a typed restart-required/refused outcome, or begin a fresh whole attempt under the existing retry policy and remaining deadline. |

An implementation that cannot retain resumable progress may choose the
whole-attempt-discard outcome after interruption. It must not advertise
restart continuity. This is the failure rule of the same canonical execution
model, not a second legacy mode. A fresh attempt starts all shards with new
views and fresh accumulators; it cannot mix one retried shard with results
from the old attempt. Retry counters and the original absolute deadline are
not reset.

Finish is accepted only after the final page transition is complete. Its
canonical contributions and completion marker are committed under the same
attempt fence before global reduction becomes eligible. Late output from an
abandoned attempt is refused. The coordinator verifies exact coverage of
the admitted shard set, not merely a count of arrival messages.

## Budgets and backpressure

All limits are declared, validated before dispatch and enforced where the
resource is first retained:

- Per-page rows (the existing 4096 default is a page bound), per-page encoded
  bytes and per-value/string limits.
- SQL result collection bytes before full page materialization, guest
  transfer, cloning or JSON encoding.
- Accumulator bytes, depth and element counts before accepting a step.
- Per-shard and whole-invocation page/row/byte ceilings and retry ceilings.
- Per-contribution, per-shard and aggregate partial count/byte limits from Q4.
- Queue depth, in-flight work and read-view retention through existing owners.

Exceeding any limit produces a typed refusal and invalidates the whole
attempt. No truncation, row skipping, implicit top-K, best-effort reducer
input or silent increase in defaults is allowed. The 0.4.1 no-truncation and
early SQL byte-budget repairs are prerequisites, not substitutes for paging.

At most one page transition is in flight per shard. The next page is admitted
only after its predecessor's state/progress outcome is authoritative.
Cross-shard concurrency remains owned by the dispatch pool. One absolute
deadline reaches planning, SQL, guest work, state persistence and reduction;
queueing or retry cannot refresh it. Cancellation stops new work and retains
only bounded terminal/fencing evidence needed to reject late deliveries.

## Planned acceptance and red witnesses

The proposed Q3 gate is the existing scenario-harness mechanism with scenario
`call-shard-paged-execution`, three consecutive accepted runs and metric
`priority`. The Quest must seal its concrete workload and failure schedule
against a meaningful red measurement before implementation. This document
does not record such a run.

The real public journey must build a generated service, publish its compiled
component, deploy through the canonical payload store and invoke it over HTTP
on at least two independent partition hosts. It must execute the actual WASI
worker and call bridge. A handwritten dispatcher, direct JavaScript source
import or an in-process second store owner cannot satisfy this gate.

Required evidence:

- Empty, one-page, exact-boundary and multi-page inputs, including well above
  4096 rows per selected shard; page sizes chosen to expose uneven pages.
- An independent oracle for sum/count, weighted average and an order-sensitive
  bounded accumulator. Page-size changes must preserve the operation's
  declared semantics and reveal any implicit whole-batch/combine assumption.
- Concurrent inserts, updates and deletes: results remain faithful to the
  admitted views, or the whole attempt refuses/restarts. No successful mixed
  read-view result is permitted.
- Duplicate, delayed and conflicting page deliveries; interruption immediately
  before and after the atomic progress commit; loss of its reply; restart and
  movement with and without recoverable read-view custody.
- Rejection of cursor/state divergence, stale Binding/schema generations and
  output from discarded attempts; independent checks for omitted or repeated
  rows and contributions.
- Deadline, cancellation, SQL byte, state-byte, total-page and aggregate
  partial overflow; measured bounded retention and continued SQL/control
  progress under backpressure.

Removing the stable-view check, atomic progress requirement, whole-attempt
discard rule, delivery fence or any resource bound must make its relevant
witness fail. Receipts name exact source/artifact digests, hosts, workload,
failure points, actual observations and neutral/negative outcomes. They
establish only the envelope exercised.

## Scope limits

Q3 does not add client-visible cursor APIs, arbitrary SQL, cross-invocation
streaming, unbounded reducers, a new scheduler or a new workflow store.
Q4 owns the partial grammar and delivery/group identity separation. Q5 owns
canonical multi-operation dispatch; the
[standard HTTP service API](../standard-http-service-api/requirements.md)
owns Hono/Fetch and the request-scoped bounded sequential SDK client.
Community/AGPL boundaries and later OCI ownership remain unchanged.
