# DEP-SCOPE — readiness planning generation granularity (v3 reseal of v2 at 0ecb49863; mutation -> affected (nodeId, variant) record)

Base: `a6d99aa3d9dc752400f334ca0b181f8c0e034e92` (exact green
Quest-P publish-gate repair).

This document replaces the refuted `P(X) -> X only` rule in the first Quest-2
design. The planning record for publisher Y contains an all-node membership
derivation, so a source change is local only when it cannot change that shared
derivation.

## Currency

For completed record `(nodeId, buildOptionsKey)`:

```text
PlanningIdentity = {
    globalPlanningGeneration,
    nodePlanningGeneration,
    saturated
}
```

Every stored-record admission requires equality with the current node-typed
PlanningIdentity. Exact-token equality is an additional stronger classification
inside that requirement, not an alternative to semantic currency. Both paths
retain the positive-decision live veto and node-row presence check.

`globalPlanningGeneration` identifies inputs shared by every publisher's
membership/readiness planning. `byNodePlanningGeneration[X]` identifies inputs
read only for X. Counters are monotone, saturation-safe, and never reset on
owner/cache replacement.

The typed seam is:

```text
readPlanningProjectionIdentity(nodeId, observedAtMs)
    -> frozen PlanningIdentity
planningIdentitiesEqual(left, right)
```

Equality validates own safe-integer/boolean data properties and compares the
three fields structurally. Per-publisher memos carry their publisher node ID
through this seam. A separately named global-only identity may be used only by
a memo proven to contain no per-node input; the old node-less scalar
`readPlanningProjectionSourceGeneration(observedAt)` is not an admissible
substitute.

Event revisions and PlanningIdentity fields are accepted only as own, unboxed,
safe primitive data. Transport topology is canonicalized from the raw owner
result into a tagged `{valid, fingerprint}` value; malformed, throwing,
accessor-bearing, inherited, or prototype-poisoned input is invalid and cannot
produce the valid-empty fingerprint.

## Source-owner identities

| Owner/source | Semantic projection consumed by planning | Impact |
| --- | --- | --- |
| `NodeLivenessSemanticProjectionOwner` P(X) | full P identity for X; membership-relevant component from the canonical P projection, never raw timestamps | X always when P changes; global only when the component directly consumed by shared membership changes |
| cached readiness/recovery for X | owner-produced readiness/recovery semantic signature | global when the signature changes, because every publisher consumes `readinessByNodeId[X]` |
| storage-capacity owner C(X) | immutable capacity semantic identity and next transition owned by storage accounting | X when C(X) changes |
| message-router transport topology | tagged `{valid, fingerprint}` canonical result | global when the fingerprint changes; invalid never aliases a legitimate empty topology |
| owner/cache replacement | monotone replacement generations | global; discard source shadows and all dependent memo entries |

P remains the sole liveness predicate and liveness-deadline owner. Storage
accounting uses the same numeric readiness `TimeSource`, but owns reservation
expiry semantics and its own one-earliest-deadline timer. Planning subscribes to
both owners and owns neither timer.

The all-node liveness component contains both the field consumed directly by
`active-node-projection.js` (`derivationGraceActive`) and the P fields used by
`isStoredNodeLivenessCurrent` to decide whether X remains present in the shared
`readinessByNodeId` map: `readyNow`, cluster-membership heartbeat freshness,
repair freshness, derivation grace, and cluster-membership health. A change to
that component is global. Other P-only dimensions first invalidate X; if
rebuilding X changes the canonical cached-readiness semantic signature, that
feedback then rotates global exactly once. This keeps the 10/15/30/60-second
facts distinct without duplicating any threshold.

## Table classification

Every notification carries `(tableName, operation, record, metadata)`. DELETE
uses the evicted record. Metadata contains the immutable apply-time
`tableMutationRevision`; reading the cache's latest revision later is not the
event identity. A malformed or unclassifiable relevant record/metadata fails
closed to global impact.

| Table/event | Semantic classification |
| --- | --- |
| NODES INSERT/DELETE | global plus X: candidate-set membership changed |
| NODES status/connection change | P decides liveness; global if canonical shared membership changes, X for the node record |
| NODES heartbeat/lease timestamp update | no direct planning impact; P event is authoritative. If P signature is unchanged, no generation rotates |
| NODES storage budget | C-owned X capacity impact; any separate node-readiness field impact is coalesced |
| other planning-relevant NODES fields | X; malformed/unknown relevant shape widens to global |
| NODE_ENDPOINTS | compare canonical websocket-eligibility projection per node; global only when the shared endpoint projection changes; X for node-specific endpoint evidence |
| SERVICES for a priority control-plane partition | global plus X |
| SERVICES first/last canonical active service for X when no canonical websocket endpoint exists | global plus X, because membership fallback changes |
| other planning-relevant SERVICES change | X for direct readiness; C independently owns used-capacity impact and both impacts are coalesced |
| PARTITIONS priority topology | global |
| PARTITIONS `size_bytes` | C-owned impact for nodes hosting the partition; planning does not reproduce the join |
| other user-table PARTITIONS changes | no-op |
| REPLICA_OPERATIONS for priority topology | global |
| non-priority operation transition | C owns live-operation/reservation joins and emits affected capacity nodes; planning does not reproduce the join |
| other non-priority REPLICA_OPERATIONS churn | no-op |
| STORAGE_RESERVATIONS insert/update/delete | route to C; C reprojects old and new target nodes and emits only when counted capacity changes |
| CONTROL_PLANE_PUBLICATIONS current `cluster_membership` winner/ack/status/content | global |
| superseded membership row or `formation_release_handoff` content unused by planning | no-op |

Table shadows contain only canonical semantic fields. They do not call `Date.now`
or reimplement source-owner predicates. Capacity-specific joins, reservation
counting, expiry, and old/new capacity attribution exist only in C. When one row
has both direct planning meaning and C-owned capacity meaning, the planning
owner coalesces the two owner-produced impacts before rotating/enqueueing.

Endpoint eligibility, active-service fallback, publication winner, and active
membership meaning are not rewritten in the tracker. It imports/extracts the
pure projections from `active-node-projection.js` and its publication helpers,
or consumes an equivalent canonical membership projection identity. A paired
first/last endpoint/service witness compares tracker impact with the canonical
projection and turns red if the implementations diverge.

## Inputs without a row notification

The following are part of the currency even though their present implementation
is token-only:

- readiness snapshot semantic feedback;
- recovery-epoch semantic feedback;
- connected-node transport fingerprint;
- cache identity and membership-publication owner identity;
- every dependency in `READINESS_PLANNING_OWNER_DEPENDENCIES`;
- build-options variant key;
- storage-capacity semantic generation;
- node-liveness semantic generation.

Changing one of these either supplies an owner event or is caught by a lazy
identity read before admission. Admission first forces overdue P for all shared
node rows and overdue C for the requested node, then captures PlanningIdentity
and exact token. A lazy catch-up performs generation rotation before returning
and enqueues through the existing macrotask queue.

That capture is one owner operation: observe/rotate lazy transport and other
token-only inputs, verify a stable live cache revision bracket, then return the
final node-typed identity and exact token. No later lazy observation may rotate
currency after the returned identity was captured.

## Shared membership and memo closure

All five memo layers that can feed a completed planning record consume the
semantic planning source identity, not the six-table 250 ms floor alone:

1. membership candidate sync/async derivation;
2. publisher planning snapshot memo;
3. priority-recovery projection memo;
4. publication-resolution/merge memo;
5. current-priority-placement observation memo.

CL-012 stored readiness reuse is a sixth inner reuse layer. Planning-owner and
cold-bootstrap builds bypass it and perform a current build; otherwise a stale
stored snapshot could be returned before the five planning memos are consulted
and then stamped under a new outer PlanningIdentity. Ordinary non-planning
callers retain CL-012 behavior.

The planning owner's separate `getReusableNodeReadinessSnapshotSync` rebase path
is removed from completed-record admission. It is another CL-012 path and can
otherwise republish a stale stored snapshot under current outer currency.

The old table-version floor may remain diagnostic or an exact-change detector,
but it is not semantic authority and cannot admit a stale inner memo under a new
outer generation.

## Deferred cache notification protocol

The cache mutation revision advances synchronously and its listener runs later.
The planning tracker records both:

```text
observedSourceRevision
classifiedSourceRevision
```

Semantic reuse is forbidden while `observed > classified` for any relevant
source. The live observed revision vector is also included in the exact token,
so a pre-write completed record cannot pass exact-token admission during this
window. The listener classifies the exact operation/row and advances
`classified`. A semantic no-op then permits the pre-existing record again; a
semantic change first rotates currency and queues affected variants. A build
is not cold-started through a pre-event semantic memo key while classification
is pending.

No stored exact or semantic record is admitted while an event is unclassified.
Cold bootstrap also fails closed/enqueues during that interval rather than
building through semantic-keyed inner memos whose identity still predates the
event.

Queued work is subject to the same barrier at reconcile start and immediately
before publication. A blocked reconcile records its exact `(nodeId,
buildOptionsKey, options)` without counting a heavy build or publishing a
completed record. When the final ordered event closes the barrier, all such
variants are enqueued exactly once even if that event was a semantic no-op;
ordinary no-op events with no barrier-blocked work still enqueue nothing.

Classification is ordered by the immutable apply-time revision. If revisions
N+1 and N+2 apply before either deferred callback, handling N+1 may advance
classified only to N+1, never to the cache's then-current N+2. A reentrant read
between those callbacks remains fail closed. Direct planning, P, and C
classification for one event must finish before that event revision is marked
classified.

The ordered state machine is explicit:

- exact next revision: classify against the pre-event shadow, commit the new
  shadow, then advance classified by one;
- duplicate/older revision: ignore without changing shadows or currency;
- missing, unsafe, or future/gapped revision: rotate/saturate fail closed and
  leave the barrier closed; never copy the cache's latest revision into
  `classified` from that event.

Classifier shadows and classified revisions are installed lazily on the first
planning demand using a canonical full snapshot bracketed by equal live version
vectors. This avoids a construction-time table scan. Cache replacement clears
the shadows, rotates global, and requires the same stable lazy rebaseline before
any completed record is admitted. A failed/drifting rebaseline leaves the
barrier closed and requeues through the existing macrotask owner.

## Feedback transaction

A planning build may change cached readiness/recovery evidence that every other
publisher consumes. The source owner exposes one canonical, variant-independent
membership-feedback projection rather than signing diagnostics or the caller's
whole option-specific snapshot. On a changed canonical feedback signature:

1. rotate global once;
2. stamp the producer's just-built record with the post-feedback planning
   identity and post-feedback exact token;
3. enqueue every dependent record except that exact producer
   `(nodeId, buildOptionsKey)`, including the producer node's other variants;
4. do not re-rotate for an identical signature.

This is a finite fixed-point transaction, not an unconditional build -> bump
loop.

Every build also has a source transaction. It captures start identity, exact
token, and semantic-change sequence after catch-up/barrier. After building it
classifies the producer's one canonical feedback transition, then recaptures the
barrier/token/identity/sequence before publication. The result may publish under
the post-feedback identity only when the entire start-to-end movement is either
none or exactly that owned feedback transition. Any reentrant P, C, cache,
transport, or owner change discards the result, returns deferred, and requeues;
pre-change content is never stamped under a post-change identity.

One deferred cache event is likewise one coalescing transaction. Synchronous P
and C callbacks plus direct table classification accumulate impact; commit
rotates global at most once and each affected node at most once, then marks the
exact event revision classified. Timer/independent owner events outside such a
transaction commit immediately.

## Retry and shutdown

Retry context includes `PlanningIdentity`, not only `tokenKey`. An exhausted key
is released by a genuinely newer planning identity; a same-identity nudge does
not reset attempts. P and capacity-owner subscription disposers are retained.
Shutdown disposes both, shuts the queue, and guarantees no later owner callback,
deadline, or lazy read schedules a build.

On `storageAccountingService` replacement, readiness/planning disposes the old
C subscription, configures the new C with the readiness TimeSource, baselines
its identities, subscribes, then rotates the replacement generation. The
production RebalanceCoordinator container shuts down readiness/planning first
and then calls C's semantic-projection shutdown, which clears its timer and
listeners.

C mirrors P's scheduler hardening: revision-fence stale or synchronously-fired
callbacks, reproject every co-due affected node, rearm the sole timer in
`finally`, deliver multiple observers in deterministic reentrancy-safe order,
contain and report the first observer failure only after state/timer progress,
and unref safely. Live-operation source changes recalculate the deadline even
when capacity bytes do not change.

## Admission and release contract

Every identity/barrier/build-transaction rejection returns the existing frozen
deferred snapshot with reason code `planning_snapshot_refresh_pending`. Its
evidence remains absent and its denial remains transient under the existing
readiness-denial classifier. No new wait, polling loop, retry budget, settling
rule, or consumer branch is introduced.

Release is an ordered cache event closing the barrier, a P/C semantic identity
change, or another classified source change. Each release only enqueues the
canonical affected variants through `OwnerKeyReconcileQueue`; it performs no
inline readiness work.

## Required proof distinctions

- raw heartbeat write, P unchanged: no currency rotation, no build;
- P(X) changes but its shared readiness/membership component does not: X rotates; other
  variants return the identical frozen records until canonical readiness
  feedback actually changes;
- P(X) changes the shared readiness/membership component: global rotates;
- X-only row/capacity change: every X variant invalidates, Y variants reuse;
- true shared topology/publication/transport/owner change: global rotates;
- relevant cache write before deferred listener: semantic reuse is refused;
- prequeued drain followed by apply and drain-before-listener performs no build
  or publish; semantic-noop classification then wakes exactly one build;
- every fail-closed branch retains the frozen refresh-pending reason shape,
  transient/evidence-absent classification, and existing retry budget;
- semantic-noop listener classification: reuse resumes without rotation and
  wakes only work that the barrier explicitly blocked;
- reservation expiry without a write: capacity owner changes C(X), only X
  invalidates;
- co-due capacity expiries all advance and the next timer is armed even when an
  observer throws or reenters; a stale/synchronous callback cannot double-fire;
- every admitted reuse is decision-content equal to a forced current build
  that bypasses both the outer completed record and CL-012 stored reuse;
- a stale CL-012 stored snapshot cannot be republished under a current outer
  PlanningIdentity;
- a builder that synchronously triggers P/C/cache/transport/owner drift cannot
  stamp its pre-change answer with the post-change identity;
- malformed event revisions, identities, and transport collections cannot
  alias valid-empty/current currency and fail closed;
- callbacks never build inline and the queue performs at most one heavy build
  per macrotask drain.

## Residual repair (2026-09-05): saturated identity is not a memo currency

Deterministic repro: `test/integration/three-node-seed-rebalance.integration.test.js`
(in-process three nodes) — red on this tree (node3 join timeout, 85–141 s),
green on pristine main 0ecb49863 (24–31 s).

Measured owner (memo counter probe over the real service, same head):

| Tree | planning-projection memo lookups | derivations | miss | derivation CPU |
| --- | --- | --- | --- | --- |
| pristine 0ecb49863 | 8742 | 174 | 2.0% | 0.5 s |
| Quest 2 before repair | 23466 | 23065 | 98.3% | 44.8 s |
| Quest 2 after repair | 11268 | 176 | 1.6% | 0.7 s |

Saturation probe: 149658 of 151900 identity reads were saturated by
`hasUnclassifiedSourceChange === true` with the baseline established and
every semantic input available (only 237 by unavailable input). Under
formation write bursts the cache revision runs ahead of the tracker's
classified revisions; `planningIdentitiesEqual` never equates saturated
identities, so every memo lookup re-derived, and the derivations delayed the
listener macrotask that classifies revisions — a feedback loop. CPU profile:
pristine shows no planning-candidate derivation in its top-40 inclusive
frames; Quest 2 spent 23.4 s (18.6%) there and was 21% idle in the join
window, so the seed's local partition handlers timed out (NODE_STATE_UPDATE
4 s, joiner WebSocket 5 s). Loop-lag sampling showed no single >1 s block
beyond the shared bootstrap stall: queue pressure, not one blocking call.

Decision (within `deferred-notification-is-fail-closed` and
`all-memo-layers-use-semantic-identity`): a saturated identity blocks
snapshot admission exactly as before (`planningIdentitiesEqual` unchanged;
`canReuseCompletedSnapshot` and completion currency still fail closed), but
it is NOT a memo currency. `readCurrentPlanningProjectionIdentity`
(participation base) yields the identity only when `isPlanningIdentityCurrent`
(semantic-generation: both generations readable, `saturated === false`); the
three memo layers — planning projection memo (publication-planning-snapshot),
derivation memo (publication-diagnostics), and
`readPlanningProjectionGenerationForCall` (priority-recovery-planning) —
consume it and fall back to the floored table-version key while saturated,
which any write still invalidates (latched ≤250 ms, the pre-existing CL-033
bound). Tests updated to the repaired contract:
`projection-planning-identity-memoization.test.js` and
`test/rebalancer/planning-sweep-memoization.test.js` now assert saturated
identity + null memo currency + shared projection at unchanged versions +
fresh projection after a further write past the latch.

## Verifier round 2 (2026-09-05): INVALID revision must not close the barrier forever

Measured on the real owner over a real cache (verifier probe): one event with a
null revision (as `handleCacheChange` delivers when a source-owner observer
throws), then 20 ordered exact events with reads and drains left the tracker
with stale `classifiedSourceRevisions`, every later exact event classified
INVALID, every identity saturated, and every read `planning_snapshot_refresh_pending`
until cache replacement — the sealed "woken exactly once when the ordered
barrier closes" was unsatisfiable. Repair (tracker): an INVALID revision sets
`sourceRevisionRebaselinePending`, drops the stale classified frontier, and
rotates global once; events while pending are `UNBASELINED` (quiet, already
fail-closed by the missing baseline); `ensureSourceRevisionBaseline` then adopts
the bracketed (`before == after`) observed revisions as the classified frontier,
rotates global exactly once for the unclassified span, and the owner
(`ensureSourceRevisionBaselineAndWake`) wakes barrier-blocked builds exactly once
outside a cache-change transaction. Pinned by
`test/control-plane/readiness-planning-cache-classification-barrier.test.js`
"an invalid source revision reopens the barrier at the next bracketed
re-baseline": global rotates exactly twice in total, exactly one rebuild, reads
current afterwards.

## Verifier round 3 (2026-09-05): the wake must not re-enqueue an in-flight variant

The re-baseline wake (`ensureSourceRevisionBaselineAndWake`) called
`wakeBarrierBlockedVariants()` without the caller's queue key; when the barrier
reopened inside a drain's own capture, a variant blocked before the INVALID and
already in flight was re-enqueued and built again with no source change
(measured: 2 builds / 2 publications for one wake at identical identity).
Repair: `wakeBarrierBlockedVariants` skips variants whose queue key
`this.queue.isInFlight(...)` in addition to the explicit exclusion; the in-flight
build's completion currency check already publishes when current and requeues
when stale. The barrier recovery test registers a blocked variant before the
fault and asserts exactly one build and exactly one publication after the wake.
