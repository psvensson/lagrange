---
audience: evidence
recorded: 2026-11-14
quest: cdc-obligation-range-shipping
---

(Typographic dashes in this report were replaced by ASCII hyphens for the documentation audit; nothing else was changed.)

# Challenge: state and event completeness of the range-shipping coverage model

Model challenged: `coverage-model-draft.md` (same directory). Code read at sealed base `9a22bf79b`
(`git show 9a22bf79b:<path>`) in worktree `lagrange-cdc-range-shipping-20261114`. Unless a file
is named, line numbers are for `src/partition/partition-cdc-obligation-delivery.js`
(abbreviated `delivery.js`). Other abbreviations: `progress.js` = `partition-cdc-obligation-progress.js`,
`lane.js` = `partition-cdc-obligation-lane.js`, `durable.js` = `src/topology/cdc-group-propagation-durable-delivery.js`,
`acceptance.js` = `src/message-group/message-group-cdc-committed-acceptance.js`.

Each item gives: where, the scenario, why it matters to the frozen claim, and the row to add.

---

## A. Must add (real holes)

### A1. A poison member makes a vector deliver fewer rows than the reference
- Where: `captureCdcEvents` throws for the whole array when any member is invalid or duplicates an identity
  (`src/cdc/cdc-event-envelope.js:132-148`). `eventOf` runs `JSON.parse` and the capture once per row
  (`delivery.js:91-100`). The recipient's `CDC_BATCH` apply loop rethrows on the first member whose cache
  apply throws (`src/message-group/message-group-service-raft-timing.js:64-83`;
  `src/message-group/cdc-handler.js:544-561`; `src/cache/system-table-cache.js:276-292`, missing PK at
  `:289-291`). Provisional ingress refuses the whole vector if any member's table is unsubscribed
  (`acceptance.js:200-204`).
- Scenario: owed rows r1..r5, and r4 fails permanently (bad `event_json`, missing PK, unsubscribed table).
  The reference delivers and acknowledges r1..r3, then holds at r4. A vector [r1..r5] is uncovered on every
  attempt, so r1..r3 are never delivered.
- Why: this breaks frozen claim 3 ("the same rows become delivered"). Design note 4.9 calls it "no weaker",
  but that holds only for the head row, not for the rows before the poison row inside the same vector.
- Row to add: S10, a member whose build, capture, apply or subscription check fails permanently (at head,
  middle, tail). E9: the vector is refused because of one member. The model must decide whether the claim is
  weakened to "same rows delivered up to the first poisoned vector" or whether the lane must shrink the vector
  (for example to the prefix before a failing member) after repeated refusals. In either case the oracle must
  state this case explicitly.

### A2. The pre-pass does not charge the vector's own rows against `RETAINED_DELIVERED_MAX`
- Where: `retainedDeliveredBackpressured` (`delivery.js:419-427`) compares
  `lane.pending.size + countRetainedDelivered >= 1024`. `lane.pending` grows only in
  `acknowledgeDelivered` (`:140`), which runs after delivery.
- Scenario: pending + retained = 1000 and the page holds 200 READY rows. The reference delivers 24 rows. At
  the 25th row its check sees 1024, sets `lane.scan = null` and ends with ACKNOWLEDGEMENT_BACKPRESSURE. The
  vector pre-pass runs before any await, so `pending` has not changed: all 200 rows pass the check, and
  retained+pending reaches 1200.
- Why: this silently raises a bound past its value (constraint "memory-and-custody-unchanged", "no bound value
  changes"). It also changes D5 outcomes and `lane.scan` resets.
- Row to add: S6b, retained + pending + rows already admitted to the current vector, measured against the
  bound at row k (crossing inside the page). D2 must count the vector's own rows. Add a mutation: "pre-pass
  ignores rows already in the vector".

### A3. Claim 5 is false whenever the page has non-READY holes
- Where: the design takes the maximal READY run from the page head. Holes come from rows that are owed but not
  pending, sitting between pending rows: rows skipped as PROVISIONAL (cursor advanced, not pending,
  `delivery.js:470-475`), rows whose `acknowledgeDelivered` returned false while the cursor still advanced
  (`:394`, `:478`), and rows re-read after a `lane.scan = null` reset (`:432`, `:547`, `:587`).
- Scenario: the next scan reads [owed-provisional r1, pending r2, r3 READY, pending r4, r5 READY ...]. Each
  pending row cuts the run, so B rows can take far more than `ceil(B/bound) + byte splits` waves.
- Why: frozen claim 5 counts only byte splits.
- Row to add: S5 must name how holes arise, not just where they sit. Claim 5 must either add "+1 per pending
  hole", or D2 must state that pending rows are skipped inside a vector without ending it (a choice about
  vector contiguity that the model has not made).

### A4. Vector length 1 and vector length 2 or more take different recipient and router paths
- Where: wire type `CDC_PROPAGATION` vs `CDC_PROPAGATION_BATCH` (`durable.js:338-346`). Recipient command
  `CDC` vs `CDC_BATCH` (`acceptance.js:35-39`). Committed apply: `CDC` mints `timestamp || hlcClock.now()`
  and announces the whole command, while `CDC_BATCH` announces `{tableName, operation, data, logIndex, causeId}`
  with the recipient's log index (`raft-timing.js:56-83`). Router `deliverySource` is a per-row key for one
  event and a per-table key for several (`src/cache/cdc-propagation-delivery-profile.js:116-139`), and router
  queue admission and per-source pending counts are keyed by it
  (`src/transport/message-router-delivery-source-admission.js:56-89,104-119`). The diagnostic label is
  `'batch'` (`src/topology/cdc-group-propagation-delivery-methods.js:53-66`).
- Scenario: the same row as a 1-vector and as a member of a 2-vector reaches the recipient through different
  apply branches, announcement shapes and router admission classes.
- Why: "message-group files and cache unchanged" does not make the two shapes equivalent. The differential
  oracle sees mostly 1-vectors in the reference and mostly N-vectors in the candidate, so it compares two code
  paths, not two batchings.
- Row to add: S11, vector length 1 vs 2 or more. Outputs: recipient command type, `cdcApplied` announcement
  shape, router delivery source. Anchor: the same row through both shapes yields the same cache state and the
  same `cdcApplied` consumer effect (`src/control-plane/replica-dispatch-service-lifecycle.js:522-547`,
  `src/config/dynamic-config-startup-wiring.js:499-523`).

### A5. Per-event hooks around propagation read cache state that a vector changes
- Where: `beforePropagation(cdcEvent)` and `afterPropagation(cdcEvent)`
  (`src/bootstrap/shared/partition-cdc-propagation-subscriber.js:241-264`). On the seed path the before-hook
  reads `previousNodeRow` from the cache and calls `handleNodeReadyRebalanceTrigger`
  (`src/bootstrap/phases/seed-cache-hydration-cdc-subscription.js:81-101`;
  `src/bootstrap/owners/bootstrap-node-ready-rebalance-owner.js:134-165` merges previous and incoming status).
  The CONFIG after-hook calls `applyCurrentEpochFromCache` (`:102-106`;
  `bootstrap-service-replica-registration-methods.js:231-235`).
- Scenario: a vector holds NODES v1 (JOINING→READY) and v2 (READY→…) for one node. In the reference, v2's
  hook sees the cache after v1 was applied by the source leaf. In a vector both hooks run before the batch, so
  v2 sees the pre-v1 row. The merged status, and so the rebalance trigger, differ. The hooks also run once per
  attempt, so retries repeat them N times. The after-hook runs once per vector, so intermediate epochs are not
  observed. The provisional answer skips the after-hook (`:259-261`).
- Why: externally relevant effects (rebalance triggers, epoch application) are absent from the model's outputs.
- Row to add: Output O-hooks: per-event hook invocations, their arguments and the cache state each hook
  observes. Pairwise case: two versions of one NODES key in one vector × before-hook.

### A6. The invocation budget is per wave, so a large vector can livelock where the reference progresses
- Where: one budget `min(MESSAGE_GROUP_DELIVERY_TIMEOUT_MS, MESSAGE_TIMEOUT_MS)` per drive step
  (`src/cdc/cdc-delivery-invocation.js:60-67,195,308`). It is shared by every subscriber, every leaf, the
  in-wave foreground retries (`delivery-methods.js:24-42`; `durable.js:439-444`) and the recipient wait
  (`acceptance.js:252-262`).
- Scenario: the recipient's commit of a 256-member `CDC_BATCH` (proposal, synchronous apply of 256 members
  with deep clones and listeners) takes longer than the budget. Every attempt ends UNKNOWN. Pinning presents
  the same vector again, so the lane never progresses. The reference fits one row per budget.
- Why: claims 3 and 5 fail without any value changing. The timing contract is kept literally but changes in
  meaning.
- Row to add: S12, wave cost vs invocation budget (vector size × recipient apply time). E10, budget expiry on a
  pinned vector repeated K times. The model must decide whether repeated budget expiry may shrink a pinned
  vector.

### A7. A rebuilt or overlapping vector bypasses the recipient's duplicate-wait key
- Where: the wait key is the digest of the exact vector, and only an identical vector gets BACKPRESSURE
  (`acceptance.js:123-126`). The old wait's raw proposal remains owned until it settles (`:147-173`).
- Scenario: vector V1=[r1..r9] times out at the source while its wait is still open on recipient A. Hydration
  acknowledges r1..r3, so the cell is rebuilt as V2=[r4..r9]. V2 has a different key, so A proposes it while
  V1's proposal is still live. V1 can then commit after V2. The same can happen after a lane reset or a
  byte-split boundary that moves.
- Why: E8 covers only the same vector. Two overlapping vectors in flight at one recipient is a new
  interleaving. Order within an entry is kept, but across entries an older vector can re-apply after a newer
  one. LWW and tombstones must absorb that (claim 2); the model does not exercise it.
- Row to add: E8b, a different vector overlapping an open wait (prefix shrink, tail extension, new tenure).
  T: the old vector commits before or after the new one.

### A8. Hydration retirement is keyed on one cell position
- Where: `retireHydratedInvocationAndResetIdleScan` retires the active invocation only if
  `lane.currentObligation.logIndex <= throughLogIndex` (`delivery.js:726-734`). The cell stores one
  `logIndex`/`ordinal` (`progress.js:61-66`). `isObligationAlreadyAcknowledged` in the catch path is decided
  per row (`delivery.js:482-489,523-527`).
- Scenario: a hydration handshake through index P arrives while vector [first ≤ P < last] is in flight.
  Whether the invocation is retired depends on whether the cell stores first or last. Afterwards the catch path
  must decide "skip" or "held" for a vector that is only partly acknowledged.
- Row to add: E3 refined: hydration index P < first, first ≤ P < last, P ≥ last. D-new: the retirement and
  catch-path skip rule for a partly hydrated vector.

### A9. Per-row side effects that mutate retry and backoff state multiply inside a vector loop
- Where: `acknowledgeDelivered` → `flushFullBatchBeforeAdd` → `scheduleDeliveryRetry(BACKPRESSURE)` on each
  failing row (`delivery.js:120-128`). Each call raises `consecutiveBackpressure` and may double
  `retryDelayMs` (`delivery.js:336-339`; `lane.js:169-203`). `recordObligationDeliveryResult` resets backoff
  per row (`:476-477`). A flush refused by admission sets `lane.held` mid-loop (`:206-212`), and the
  proposer-unavailable path restores the batch (`:195-203`).
- Scenario: the vector is covered, and at row k a flush is refused (held) or the proposer is unavailable. Every
  remaining row's `acknowledgeDelivered` fails, so N−k retry schedulings run in one synchronous loop where the
  reference ran one. Rows k..N stay owed and are not pending while the cursor moves past them (as in the
  reference, `:394` ignores the result).
- Why: D6 and the outputs promise unchanged delay values. These values come from state that the loop shape
  changes.
- Row to add: S13, backoff state as an input: `retryDelayMs`, `consecutiveBackpressure`, `sliceTurnReady`
  (`lane.js:159-167`), and an already armed earlier retry timer (`delivery.js:332-335`). E11, acknowledgement
  refused or proposer unavailable mid-vector. Define delay equality per failure event given the same state, not
  as a sequence.

### A10. The page read materialises payloads beyond the byte bound
- Where: `readOwedCdcObligations` selects `event_json` for `limit` rows (`partition-cdc-obligation-ledger.js:158-172`).
  The design reads `limit: SHIP_MAX_EVENTS` and then truncates by bytes (design 4.2).
- Scenario: 256 owed rows of 2 MiB each (W9). A single page read loads about 512 MiB to ship one row.
- Why: this breaks the custody constraint. The model's S2 varies row size but does not treat page-read memory
  as an output.
- Row to add: Output O-memory: bytes materialised per page read ≤ byte bound + one row. Mutation: "read the
  full count page, then truncate".

### A11. A differential oracle on per-call answer schedules is ill-defined and shares the vector rule
- Where: the reference makes B subscriber calls and the candidate makes about B/256. Coverage is
  all-or-nothing per vector (`src/cdc/cdc-delivery-outcome.js:370-383`). Acknowledgement batches are flushed by
  count, bytes and a 1 s deadline timer (`delivery.js:109-118,144-149`), and the `CDC_DELIVERED` entryId hashes
  its groups (`partition-cdc-obligation-ledger.js:418-422`).
- Problems: (a) "the same answer schedule" must be keyed by (leaf, row set, attempt), not call index. Turning
  per-row answers into a vector answer bakes the rule under test into the generator. (b) "The set and order of
  `CDC_DELIVERED` proposals" cannot be equal, because drain speed changes batch composition and therefore
  entryIds. (c) Write admission at the source refuses on owed depth (`partition-cdc-owed-admission.js:58-67`,
  OWED_MAX_EVENTS 4096), so with an interleaved write schedule (E4) the two runs admit different writes and end
  with different ledgers.
- Row to add: the oracle compares per-row facts: the delivered order of eventKeys, the occurrence multiset per
  recipient, and the final cache. CDC_DELIVERED is compared as "rows named, in order", not as proposals. The
  write schedule is fixed below the admission bound, or a separate case asserts the refusal set is a subset.
  Anchors independent of both drivers: (1) occurrences read from the recipient's committed command log
  (`CDC`/`CDC_BATCH` members), not from the cache, because `cdcHandler` dedups by
  `table:op:key:timestamp` (`src/message-group/cdc-handler.js:652-654`) and same-entry siblings share the
  decision HLC (`partition-cdc-obligation.js:132-143,177`), so both sides can lose an occurrence and still
  agree. (2) Expected events built from raw ledger `event_json` + eventKey, not through `eventOf`
  (`delivery.js:91-100`) or `captureCdcEvents`, which both sides share. (3) The reference is the sealed base
  code run in a worktree at `9a22bf79b`, not a reference driver re-implemented in the test from the same
  helpers (`resolveDriveObligationStep`, `acknowledgeDelivered`). (4) A literal poison-member anchor (A1) and a
  literal retained-bound anchor (A2), because a shared generator would produce matching results on both sides
  for these cases.

### A12. Partial coverage across subscribers, not only across leaves
- Where: per-subscriber branches with their own coverage, and the start subscriber rotates across attempts
  (`progress.js:63-73`). The cell is kept only while every branch's subscription and topology binding is
  current (`progress.js:41-48`).
- Scenario: two propagation subscribers on one partition, one per message group (the seed path loops
  `for (const messageGroup of messageGroups)`, `seed-cache-hydration-cdc-subscription.js:54-112`).
  Subscriber 1 commits the vector. Subscriber 2 is refused by the node-wide slot because subscriber 1's wave is
  still held by its unsettled child scope (`durable.js:489-498`). The retry rotation starts with subscriber 2.
- Row to add: S7 adds "two or more propagation subscribers (one per message group)". E2 adds "branch-level
  partial coverage" and "self-contention: the next subscriber is refused by this lane's own previous wave".

### A13. Topology changes besides route replacement
- Where: `refreshCdcPropagationRoutes` adds new targets and discards provisional coverage
  (`src/cdc/cdc-propagation-progress.js:109-131`). `transferInvalidLatencyBindings` replaces a leaf with
  candidate groups or drops a pre-activation group (`:46-107`). A source plan mismatch refuses with
  SOURCE_GROUP_MISMATCH (`durable.js:502-506`). A subscriber's selected service changes, so
  `topologyBindingCurrent` fails or `topologyProgressOf` throws and clears the cell
  (`progress.js:30-39,75-84`). GROUPED vs SAFE plan (`src/topology/cdc-group-propagation-service.js:52-56`;
  `durable.js:450-475`).
- Row to add: E2b, a target added, removed or replaced by candidates between attempts. The source group or the
  selected propagation service changes. Plan GROUPED vs SAFE. S8 adds the propagation mode.

### A14. Additional events inside one wave and in the invocation lifecycle
- Where: in-wave foreground retry (attempts, `sleep`, INSUFFICIENT_DURATION, propagation stopped →
  `wave.stopped()`; `delivery-methods.js:24-42`). The invocation outlives `finish` while a child is unsettled,
  so `activeCdcInvocation` stays set → JOINED_IN_FLIGHT and `resumeAfterCdcCleanup` (`delivery.js:625-628,650-656`;
  `cdc-delivery-invocation.js:206-211,302`). Slot contention is marked while this wave is admitted
  (`durable.js:236-238,307-309`), so `stepContended` yields with hint 10 and the tail is reset (`delivery.js:546-554,620-621`).
  A slice-turn wake (`delivery.js:352-361`). The pressure governor defers a target (`durable.js:357-358`).
- Row to add: E12 to E16 for these. T3 needs "after the response, before child cleanup".

### A15. Missing outputs
- `owner.emit(CDC_EVENT, event)` and `EVENTS_DELIVERED` once per row before its acknowledgement
  (`delivery.js:392-394`). Order relative to acknowledgement inside a vector. `DELIVERY_FAILURES` per failed
  step (`:445`), which changes from per row to per vector.
- Typed drive outcome fields: HELD_BY_SUBSCRIBER carries one `eventKey` and logs `eventKey/logIndex`
  (`:447-461`). Which row a vector names must be defined. The design adds "acknowledgeDelivered returned false"
  to the outcome.
- Sequence numbers: one per row per attempt (`delivery.js:368`; `partition-cdc-delivery.js:274-277`). They feed
  the handshake `streamVersion` (`:533-534`), `lastDeliveredSequenceNumber` (`:475,580-600`) and the
  live-query frontier fallback (`src/live-query/live-query-group-helpers.js:75-78,110-115`). Vector retries
  consume different counts. Name this as allowed divergence, or bind it.
- Propagation service per wave: the `PROPAGATED` emit, `stats` counters, publication-mode transitions
  (`durable.js:450-466,507`), the retry-spent report label (`delivery-methods.js:37-40`).
- Slice fairness: `CONTENDED_TABLE_SLICE_WAVES = 4` counts waves (`durable.js:34,225-229,298-299`). With
  vectors, a slice is up to 4×256 rows, which changes the fairness that other tables' lanes see. The
  "slot carried unchanged" exclusion keeps the code but not its meaning. State it as an accepted divergence.
- Source write admission refusals (`CDC_CAPACITY`) as a function of drain speed (A11c).

---

## B. Consider (plausible, not proven)

### B1. Mixed-table vectors
A partition owes CDC for its own `service.tableName` (`partition-cdc-obligation.js:120-122`). The ledger has
no table column, and events come from the generator over that partition's statements (`:155-180`), so a
single table per ledger looks like an invariant that nothing enforces at the lane. Table-keyed consumers that
would misbehave on a mixed vector:
- `acceptsPropagationTable` throws INVALID for a durable foreign-table event (`partition-cdc-propagation-subscriber.js:159-165`).
- Slot admission and the slice are keyed by `options.tableName` (`durable.js:480-492`).
- `registerContentionOwner` defaults to `event.tableName` (`progress.js:124-127`).
- The delivery source falls back to generic CRITICAL_VISIBILITY when the vector holds more than one table (`profile:116-124`).
- Strict-forwarding picks the first strict event for the whole vector (`message-group-forwarding-owner-native-delivery-methods.js:129-133`; `acceptance.js:212-220`; `message-group-service-cdc-propagation-runtime-methods.js:200-212`).
- `canAcceptCDCEvent` is asked with the first event (design 4.2).

Row to add: an invariant row "one tableName per vector", with an anchor showing it is either impossible or
refused before the subscriber call. Check whether a split mirror or a schema migration can emit another
`tableName` or `sourceScope.tableName`.

### B2. The live-query durable subscriber can never cover a durable event
The live-query handler returns `undefined` (`src/live-query/live-query-startup-wiring.js:420-423`;
`live-query-group.js:405-411`). `assertSubscriberAcceptance` treats that as refused for durable events
(`partition-cdc-delivery.js:86-96`). On a recorded (system-table) partition with a live query, the lane would
hold forever in both reference and candidate. Its frontier also drops events whose `logIndex` is not strictly
greater (`live-query-group-helpers.js:97-105`), so same-entry siblings are lost. Before S7 "propagation plus
live-query" is meaningful, confirm whether live queries ever subscribe to recorded partitions, and what the new
`(events, ctx)` contract returns.

### B3. A second single-event contract
`getCompatibilityOverride('propagatePartitionCDCEvent')` takes one `cdcEvent`
(`src/bootstrap/owners/seed-runtime-bridge-owner.js:200-205`). The one-contract constraint must include it.

### B4. Recipient apply turn length
256 synchronous `applyImmediate` calls, each with a deep clone and apply listeners
(`system-table-cache.js:529-557`), run in one raft apply. Given the project's seed event-loop starvation
history, consider an output "longest synchronous apply turn at the recipient".

### B5. Readiness side effects asked once per vector
The forwarding owner's `canAcceptCDCEvent` requests an authoritative topology repair as a side effect
(`src/message-group/message-group-forwarding-owner.js:419-423`). With vectors this runs per vector instead of
per row.

### B6. Router per-source admission with the table-level key
Whether per-source pending caps (`message-router-outbound-queue-admission.js:236`) now charge every vector of
a table to one source, where they used to be spread over row keys.

### B7. Quantum yield per vector
`visited` counts rows (design), so a full 256-row vector ends the pass with PAGE_YIELDED and an initial-delay
retry (`delivery.js:582-585`). Claim 5 counts waves, not time. Confirm this matches the intended latency.
