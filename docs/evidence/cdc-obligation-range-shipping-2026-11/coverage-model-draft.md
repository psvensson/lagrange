---
audience: evidence
recorded: 2026-11-14
quest: cdc-obligation-range-shipping
---

(Typographic dashes in this report were replaced by ASCII hyphens for the documentation audit; nothing else was changed.)

# Coverage model (draft) - quest `cdc-obligation-range-shipping`

Base: `9a22bf79b` (worktree `/mnt/data/peter/projects/lagrange-cdc-range-shipping-20261114`).
Design: `cdc-delivery-design-note-2026-11-11.md` section 4 (in `/mnt/data/peter/projects/lagrange-wip-lab/solve/epics/operation-integrity-and-reliable-formation/`).

## Frozen claim (behaviour, not structure)

For any state of one partition's obligation ledger and any sequence of subscriber
answers, lane wakes and lifecycle events, shipping owed rows as bounded ordered
vectors produces the same externally relevant result as shipping the same rows one
event per wave:

1. every current recipient commits the same occurrences (`eventKey`) in the same
   `(log_index, ordinal)` order, each occurrence carried unchanged;
2. the recipient's cache ends in the same state (HLC last-writer-wins merge,
   tombstones), also when a vector is re-shipped after any failure;
3. the same rows become delivered, and a row is named by a committed `CDC_DELIVERED`
   only after every current leaf of every current subscriber returned a committed
   receipt bound to a vector containing it;
4. no row is dropped, refused, split, merged or reordered by the sender;
5. the number of waves needed to drain B owed rows is at most `ceil(B / count bound)`
   plus one per byte-bound split.

- Semantic owner: the partition CDC obligation lane (`src/partition/partition-cdc-obligation-delivery.js` and its lane/progress helpers).
- Authoritative oracle: the one-event-per-wave behaviour of the sealed base, and the
  ledger (`_cdc_obligations`, `CDC_DELIVERED`) as the only durable progress.
- Externally relevant outputs: per recipient, the ordered sequence of committed
  occurrences and vector digests; the set and order of `CDC_DELIVERED` proposals; rows
  still owed; the lane's typed drive/flush outcomes; the retry disposition and delay
  values (must keep today's values); what the lane retains between attempts.
- Allowed nondeterminism: where vector boundaries fall (any split that respects the
  bounds and order); duplicate delivery of an occurrence after a failure (recipients
  are idempotent).
- Exclusions: the node-wide propagation slot and its slicing (carried unchanged);
  recipient isolation; re-list; the non-durable user-table CDC path; cross-partition order.
- Timing contracts: no timeout, hold, retry count, cooldown or bound value changes.

## Axes

### Decisions the lane makes
D1 page composition: which owed rows after the cursor form the vector (count bound, byte bound, captured tail `scan.through`, at least one row).
D2 per-row pre-pass before any await: already pending acknowledgement → skip; at or below `hydratedThroughLogIndex` → acknowledge without delivery; acknowledgement backpressure → end the pass; otherwise READY. The vector is the maximal run of READY rows from the page head.
D3 vector pinning: on retry after partial coverage, present the same vector (same digest) or rebuild.
D4 acknowledgement: after coverage of the whole cell, `acknowledgeDelivered` per row in order; batch flush on count/byte bound; outstanding-batch bound.
D5 cursor and quantum: cursor advances to the last row of the vector; `visited` counts rows against `DRIVE_PAGE_ROWS`; drive outcome (DRAINED, PAGE_YIELDED, PROVISIONAL, HELD_BY_SUBSCRIBER, ACKNOWLEDGEMENT_BACKPRESSURE, JOINED_IN_FLIGHT, NOT_LEADER, NO_SUBSCRIBERS, SHUTDOWN).
D6 retry scheduling after an uncovered vector (disposition, hinted delay, backoff) - values unchanged.

### State inputs
S1 owed rows after the cursor: 0, 1, fewer than the count bound, exactly the bound, more than the bound, more than `DRIVE_PAGE_ROWS`.
S2 row sizes: all small; one row above the byte bound (alone, at head, in the middle); cumulative size crossing the byte bound at row k.
S3 entry structure: several ordinals of one `log_index` (same-entry siblings) split or not split across a vector boundary; several versions of one key inside one vector; INSERT/UPDATE/DELETE mixes (tombstones).
S4 `hydratedThroughLogIndex` relative to the page: none, covers a prefix, covers the whole page, moves during the wave.
S5 `lane.pending` rows inside the page: at the head, in the middle (hole), at the tail.
S6 acknowledgement state: batch empty / partly full / at bound; outstanding commands 0, 1, at `ACK_MAX_OUTSTANDING_BATCHES`; `lane.held` set; retained-delivered count against `RETAINED_DELIVERED_MAX` for a head row versus a non-head row.
S7 subscribers: none; the propagation subscriber only; propagation plus live-query; a subscriber for a different table (`acceptsPropagationTable`).
S8 topology leaves for the wave: source group only; source plus one target; source plus several targets; a target without a route.
S9 the node-wide slot: free; busy (the lane is refused with backpressure and a hint).

### Events
E1 subscriber answer over the vector: committed; provisional; unknown; backpressure with a hint; throws; never settles until the invocation budget ends.
E2 partial coverage: leaf A committed, leaf B unknown, then B committed on the retry; leaf route replaced between attempts.
E3 a hydration handshake (`acknowledgeHydratedObligationsThrough`) arrives while a vector is in flight or pinned.
E4 new rows are committed while a vector is in flight (tail grows past `scan.through`).
E5 `CDC_DELIVERED` flush for rows of a delivered vector: committed; refused (typed, terminal and non-terminal); outcome unknown; proposer unavailable; identity compacted (reconcile).
E6 leadership tenure changes; subscriber set or subscription epoch changes; propagation lifetime changes; partition shutdown.
E7 a drive is requested while one is in flight (join, rerun).
E8 the same vector is presented while its commit wait is still open on the recipient.

### Temporal relationships
T1 before the drive reads its page; T2 between the page read and the first await;
T3 while the subscriber call is awaited; T4 between attempts (retry timer armed);
T5 after coverage and before acknowledgement; T6 after the acknowledgement flush is
proposed and before it commits; T7 after the pass ends (DRAINED / yielded).

## Evidence shape planned
- Differential property: the same generated ledger and answer schedule driven (a) one
  row per wave by a reference driver in the test and (b) by the lane's vectors; compare
  the full externally relevant result listed above, with the cache state compared
  through the real cache apply path.
- Direct anchors (against a bug shared by both sides): R1-1 … R1-5 of the design, the
  hydrated prefix, several versions of one key, the oversized row, partial coverage
  with identical digest, acknowledgement backpressure on the first row, the second
  durable subscriber.
- Enumerations imported from their owners, never copied as test literals: drive
  states, flush states, retry dispositions, coverage states, completion codes.
- Mutation by mechanism (each must turn some evidence red): vector reordered; a row
  dropped at a byte split; a covered leaf re-sent after retry (digest changes); a row
  acknowledged before every leaf's receipt; hydrated-prefix row delivered instead of
  acknowledged; a pending row re-delivered; the cursor advanced past an undelivered
  row; payload retained between attempts; SQLite read held across an await; a bound or
  delay value changed; the oversized row refused.
