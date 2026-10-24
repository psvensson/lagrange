---
audience: development
documentClass: evidence
---

# D4 design review: the hand-off from hydration to live CDC (2026-10-26)

This is a read-only design review. Nothing was edited or committed.

- **Subject.** The lineage head `a51f49929`
  (`/mnt/data/peter/projects/.worktrees/mg-delivery-resume-r2-20261023`).
- **Working tree.** A detached scratch worktree at that head, with
  `node_modules` symlinked. It was removed after the review.
- **Probe.** `probes-d4/d4-handoff.probe.mjs`, next to this file. It runs on
  real `PartitionService` owners (the controllable-port fixture). Its output
  is `d4-probe-output.json`.

**Binding input.**

- Owner review 2026-10-26, decision 4, D4: "a gap-free handoff between
  hydration and live CDC at a defined committed position, subscribe-before-hydrate
  preferred if hydration provides a coherent read position, else ledger-backed
  catch-up from a cursor, decided by the owners after a short design review;
  the sliding window is removed only after the witness."
- Owner review 2026-10-26, decision 4, D1: "reclamation of delivered
  obligations with compact durable progress preserving acknowledgement-replay
  distinguishability, retained-seed inspection evidence (or an owner-defined
  durable summary) and the D4 contract, distinguishing source-event from
  delivery-marker positions, no tombstone per write, pending work under budget
  and backpressure never silently dropped".
- Ledger investigation 2026-10-24, §4.

## 0. Headline

1. **Today the gap is real, and it has been measured on real owners.**
   - Setup: a later subscriber B takes its hydration read at position H. 600
     events then commit and are acknowledged by an earlier subscriber A. Only
     then does B subscribe.
   - Result: B obtains 256 of the 600 events, all through the sliding window.
     344 are lost (log indexes 25-368). The lost events include a DELETE, so
     B's view keeps a stale row.
   - B's view diverges from the partition in 344 rows. The ledger serves B
     nothing: it holds `owed 0 / delivered 620`.
2. **The window is smaller than its constant.**
   - `recordDelivered` runs once per subscriber call, so the 256-slot ring
     holds about 256/K distinct events when K subscribers are attached.
   - With three earlier subscribers, which is the seed's shape per leader
     replica, B received only 86 of 200 events.
3. **Subscribe-before-hydrate works on today's ledger with no ledger change.**
   - Setup: B registers first. The hydration read is then taken on the leader
     at P = the durable applied index of the partition's rs-raft group. After
     that, 600 events commit.
   - Result: B obtains all 600 events after P, and its view equals the
     partition (0 divergent rows). This holds with 1 and with 3 earlier
     subscribers, and with an event that A had acknowledged but whose
     `CDC_DELIVERED` had not yet committed at B's registration.
   - Why it works: the ledger acknowledges an event only when *every current*
     subscriber covered it. So once B is registered, nothing after the
     registration can be marked delivered without B.
4. **The coherent position exists, but nothing exposes it.**
   - The partition's data, its `_cdc_obligations` rows and its rs-raft
     applied state are written in one SQLite transaction on one connection.
   - The seed's hydration read is a synchronous `SELECT *` on that same
     connection. So a read of the applied index in the same synchronous span is
     coherent: rows ≤ P are in the image, and rows > P are not.
   - No hydration owner reads or exposes this position today.
5. **A correction to the investigation's framing.**
   - At the seed, the "message groups" iterated by the subscription loop are
     the three *replicas* of the one group `mg-1`, all on the seed. So "group
     2 misses what group 1 acknowledged" is benign there at the *effect* level.
     The reason: every propagation subscriber is a substitute for the others.
     Each one's wave commits the event into the source group's log and fans it
     out to every *active* message group.
   - The effect-level gap lives one level up. Consider a message group that
     becomes a fan-out target *after* an event's wave was planned, for example
     a joiner's self-hosted group. It never receives that event:
     - the ledger has it as delivered;
     - the window repairs it only by accident;
     - the joiner's authoritative backfill repairs present rows only, so it
       cannot repair deletes.
   - Neither design, as stated in D4, closes that group-level gap. It needs its
     own witness before the window is deleted (§6, §8).
6. **Recommendation.**
   - Subscribe-before-hydrate at the partition boundary, with P = the durable
     applied index read on the leader, in the same synchronous span as the
     image. It is the smaller design and can be proven. It needs no delivered
     rows, so D1 is unconstrained by D4.
   - Ledger-backed catch-up is larger, couples D1 to a retention floor
     (a handoff registry), and still does not cover the joiner's group-level
     gap.

## 1. Facts: how a message group's cache is hydrated today

There are three hydration owners and three subscriber-registration sites. Only
one owner reads a partition.

### 1.1 Seed (`src/bootstrap/phases/seed-cache-hydration-phase.js`)

**Order in `phaseCacheHydration`:**

1. `hydrateFromLocalPartitions` (`:155`).
2. Verify.
3. `waitForSystemServiceLeadersInCache` (`:174`).
4. Latency owners.
5. `subscribeToInitialSystemTableCDC` (`:190`).

Steps 2 to 4 are awaits that can take seconds. All 23 tables are read before
any subscriber exists.

**What it reads.** `hydrateFromLocalPartitions` (`:342-449`), for each table
in `CACHE_HYDRATION_TABLES` (the 23 propagated tables):

- It picks the **local leader replica** of the initial partition
  (`partition.isLeader`, `:370-379`).
- It runs `SELECT * FROM <table>` (`:77-78`, `:396-398`) through
  `PartitionService.executeQuery`. That is a synchronous better-sqlite3 read,
  `collectBoundedSqliteRows` (`partition-service-write-metrics-base.js:105-128`).
  It returns `{rows, count, partitionId}` and **no position**.
- It applies each row as `INSERT` through
  `leaderMessageGroup.applyCDCEvent(..., {skipReplication: true, skipSubscriptionCheck: true})`
  (`:94-97`, `:413-418`). That is a node-local cache write: the
  `applyImmediate` path of `applyCDCBatch`
  (`message-group-service-cdc-replication-runtime-methods.js:172-245`).

**What carries the position, and where it is lost.**

- The durable applied index exists on the same connection. "The durable Raft
  record of one replica's raft-rs groups, in that replica's own SQLite
  database" (`raft-rs-durable-store.js:1-2`).
- `applyCommittedEntryTransaction` runs the entry's application (data rows plus
  ledger rows) and `putAppliedState` in one `store.transaction`
  (`raft-rs-application-transaction-owner.js:51-90`, `:59-79`).
- The reader exists: `readDurableProgress(groupId)` → `{commitIndex, appliedIndex}`
  (`raft-rs-durable-store.js:649-657`). The runtime already uses it in
  `durableProgressOf` (`raft-rs-runtime-owner.js:199-213`), and so does the
  fixture's `durableAppliedIndex` (`participant-transaction-fixture.js:889-893`).
- No hydration owner calls it. `result.tables[t]` records only `rowCount`.

**Which position is the right one.** The ledger's own `MAX(log_index)` is
*not* the right position. CDC_DELIVERED entries advance the applied index
without writing ledger rows. The probe shows this: applied 24 against ledger
max 22, and after more acknowledgements applied 31 against ledger 31. Use the
applied index. That is the D1 text's "source-event vs delivery-marker
positions" distinction.

**Repair re-read.** `repairPropagatedCacheTablesFromLocalPartitions`
(`:658-697`) is the same read, re-run, with no position.

### 1.2 Joiner (`query-system-state-phase.js`, `node-joining-*`)

**Hydration source.** The joiner hydrates from the **seed's cache**, not from a
partition.

- `hydrateSystemCacheFromBootstrap` (`:414-520`) applies
  `bootstrapResponse.systemTableSnapshots` with `systemTableCache.applySystemTableChange`
  (`:479`).
- The snapshot is built from `systemTableCache.getAll(t)` on the serving node
  (`bootstrap-topology-snapshot.js:61-70`).
- Its metadata is `publishedAt`, `topologyEpoch` (a cache epoch), the active
  node ids and row counts (`:72-86`). **There is no per-partition committed
  position.**

**Order.**

1. Hydrate (`:165`).
2. Register the node and the self-hosted group metadata.
3. `subscribeToCDCEvents` (`:228`). These are cdcIntegrationService listeners,
   not partition subscriptions (`node-joining-cdc-subscription-and-backfill.js:202-320`).
4. The CDC readiness gate.
5. `backfillBlockingDiscoveryTables` (`:250`).

**The backfill.** `backfillPropagatedCacheTablesFromAuthoritativeState`
(`node-joining-cdc-subscription-and-backfill.js:498-560`) re-reads authoritative
rows through routed SQL and upserts them.

- Its own doc says it "closes the blind window between the initial bootstrap
  snapshot and the moment CDC subscriptions become active".
- It is already a *read-after-subscribe* pattern, but:
  - it has no position;
  - it is upsert-only, so it cannot express a missed DELETE;
  - only `nodes` and `node_endpoints` block (`node-joining-constants.js:132-142`);
    the other tables are opportunistic.

**Partition subscribers on the joiner.** The joiner gets one only when it hosts
a propagated system-partition replica: `createJoinLocalPartitionService`
(`node-joining-publication-activation.js:279-326`). There is no hydration read
at that site. The cache is already hydrated.

### 1.3 Dynamic replica registration

Site: `bootstrap-service-replica-registration-methods.js:173-240`.

- A new local replica of a propagated table gets one subscriber, for the
  operational message-group selection.
- There is no hydration read at this site. The node cache is already live.

### 1.4 What a message group is at these sites

- **Keying.** `getMessageGroupServices()` is keyed by **replica id**
  (`seed-message-groups-phase.js:169`). At seed formation it holds `mg-1-r1`,
  `mg-1-r2` and `mg-1-r3` of the one group `mg-1`
  (`system-table-schemas-constants.js:383,388`), all on the seed. The initial
  partitions have three replicas, all on the seed (`getInitialReplicaIds`, `:413-419`).
- **Shared cache.** Every message-group service writes the **one node cache**
  (`message-group-service-state.js:247`, `nodeService.getSystemTableCache()`).
- **What a subscriber does.** A partition propagation subscriber
  (`partition-cdc-propagation-subscriber.js:192-252`):
  - resolves an operational message-group selection;
  - calls `cdcGroupPropagationService.propagateCDCEvent`
    (`seed-runtime-bridge-owner.js:200-215`; `node-joining-publication-activation.js:718-729`).
- **The durable wave** (`cdc-group-propagation-durable-delivery.js:181-212`):
  - it commits the event into the **source group's** raft log (`source.applyCDCBatch`, `:99-102`);
  - it delivers to every **target group** in the plan captured at that moment
    (`captureDurablePropagationPlan`, `cdc-group-propagation-durable-plan.js:14-31`).
- **The targets.** They are every message-group `services` row that is
  `status = active` and has an address, **as the propagating node's cache sees
  it** (`buildSafeTargets` / `resolveActiveMessageGroupServices`,
  `cdc-group-propagation-routing.js:14-31,100-138`). Grouped mode only adds
  routes (`durable-plan.js:26-29`).
- **Consequence.** Any one subscriber's committed answer delivers the event's
  effect to the source group plus all active groups. Subscribers on one node are
  substitutes for one another.
- Side fact: all three seed subscribers on one replica share one
  `subscriberId` string, because the id ends in `messageGroup.groupId`, which
  is `mg-1` for all three (`seed-cache-hydration-cdc-subscription.js:55-61`).
  The wrappers are distinct objects. Only the diagnostics collide.

## 2. Subscription order at bootstrap, and the race

### 2.1 The seed site

`subscribeToHydrationCDC` (`seed-cache-hydration-cdc-subscription.js:21-134`)
runs this loop for each table:

1. Every message-group replica calls `subscribeToCDC(table)`, the handler's
   table flag (`:39-41`).
2. Then, for each local partition replica, and within it for each
   message-group replica, it calls
   `await partition.subscribeToCDCWithHandshake(...)` (`:43-124`).

So 3 × 3 = 9 subscribers per table, serialized. Only the **leader** replica's
three subscribers are ever driven.

Two facts about the lane:

- **The drive is leader-only.** `currentTenureOf` requires `owner.isLeader`
  (`partition-cdc-obligation-delivery.js:112-127`). `drivePrecondition` returns
  `NOT_LEADER` or `NO_SUBSCRIBERS` (`:500-507`).
- **The handshake.** It registers the wrapper synchronously
  (`partition-cdc-delivery.js:533-568`). It then replays the window (`:630-669`)
  and only then fires `driveCdcObligations(SUBSCRIPTION_HANDSHAKE)` without
  awaiting it (`:716`). That drive captures the subscriber set
  (`driveOnce`, `:582-612`). An in-flight delivery whose set changed becomes
  non-current (`captureSubscriberCurrentness`, `:614-625`), and the event is
  retried to the new set.

### 2.2 The two intervals at the seed

**Interval A: from the hydration read of table T to T's first subscriber.**

- Today this interval is closed. No subscriber of T exists before it, so every
  event stays **owed** (`NO_SUBSCRIBERS`). The first subscriber's handshake
  drive delivers the entire history in log order, including every event at or
  below the read.
- The consequences: duplicates of the image, history-replay hooks
  (`beforePropagation` runs `handleNodeReadyRebalanceTrigger` on historical
  `nodes` events, `:81-101`), and transient resurrection of rows that the
  image correctly omits until the later DELETE replays.

**Interval B: between the serialized subscribers of one leader replica.**

- (r1, mg-1-r1)'s drive can fully acknowledge and commit events before
  (r1, mg-1-r2) registers. mg-1-r2's subscriber never sees those events: they
  are delivered rows, and `SELECT_OWED_AFTER` serves only `delivered = 0`
  (`partition-cdc-obligation-constants.js:113-119`).
- This is the investigation's race. At the seed it is **benign at the effect
  level**: mg-1-r1's wave committed the event into `mg-1`'s log, which every
  `mg-1` replica applies to the same node cache.
- It stops being benign as soon as a later subscriber is **not** a substitute
  for the earlier one. That happens in two cases:
  - an external consumer (D2);
  - any subscriber whose own effect is not produced by another subscriber's
    wave.

### 2.3 The concrete effect-level race (group level, joiner)

This construction is from code. It is **not run live** (see §8).

1. **The cluster.** The seed hosts every replica of the `nodes` partition and
   of group `mg-1`. Joiner J is assigned `CREATE_SELF_HOSTED` group `mg-J`
   (`create-message-group-phase.js:639-657`).
2. **The snapshot.** At t0 the seed builds J's bootstrap snapshot from its
   cache (`bootstrap-topology-snapshot.js:61-70`).
3. **The event.** At t1 > t0, another node's heartbeat or state update commits
   on the `nodes` partition as event E.
4. **The wave.** At t2 the seed leader's subscriber (nodes-r1, mg-1-r1)
   propagates E. The plan's targets are the active message-group services rows
   in the **seed's** cache. `mg-J`'s rows are not active yet, so E goes to
   `mg-1` only.
5. **The acknowledgement.** At t3 `CDC_DELIVERED` commits E.
6. **The miss.** At t4 `mg-J` becomes active, and later waves include it. J is
   not a member of `mg-1`. J's cache came from the t0 snapshot, so it lacks E.
   - E is never served again from the ledger.
   - The window re-propagates E only if a new subscriber attaches **on the
     seed's leader replica** of `nodes` while E is still among the last
     ~256/3 deliveries. The replay re-plans targets and so includes `mg-J`.
   - J's backfill repairs E only if E is an upsert of a row that still exists.
     A DELETE in the gap leaves a stale row in J's cache.

## 3. What the handshake delivers today, and what the ledger could serve

### 3.1 The handshake for a new subscriber (`partition-cdc-delivery.js:533-720`)

1. **The volatile buffer catch-up** (`:588-629`). `cdcEventBuffer` is always
   empty on the durable path (investigation §1.1), so this is dead.
2. **The sliding window** (`:630-669`). It delivers every entry of
   `getRecentEvents()` (the 256-slot ring; `CDC_EVENT_SLIDING_WINDOW_CAPACITY = NUM.TWO_HUNDRED_FIFTY_SIX`,
   `cdc-lifecycle-constants.js:17`; ring `cdc-event-buffer.js:218-241`).
   - It goes to the new subscriber only, as `replayOnly`, through
     `deliverCapturedCdcEvent` (`:56-69`). That is a fresh invocation outside
     the lane. It requires `owner.isLeader` and the same tenure and
     subscription epoch, and writes no ledger record.
   - The ring is filled by the wrapper (`:521`) **once per subscriber call**.
     So its distinct-event capacity is ⌊256/K⌋ for K subscribers. At the seed,
     K = 3 per leader replica, so about 85.
3. **The ledger drive** (`:716`, `driveCdcObligations(SUBSCRIPTION_HANDSHAKE)`).
   - It delivers **owed rows only**: `drivePage` → `readOwedCdcObligations` /
     `SELECT_OWED_AFTER`.
   - It delivers them to **all** current subscribers.
   - It skips keys already in `lane.pending`, which are acknowledged here with
     the flag not yet committed (`driveOneObligation`, `:540-563`).

**So a new subscriber receives:**

- every owed row, from the ledger;
- the last ⌊256/K⌋ distinct acknowledged events, from the window, including
  pending ones;
- **nothing** older that was delivered.

### 3.2 What the ledger could serve from a cursor

- Every row stays until D1 reclaims it. Today nothing reclaims anything
  (investigation §2.2).
- The rows have `(log_index, ordinal)` UNIQUE, `event_json` as of commit, and
  `delivered, delivered_index, delivered_term` (`partition-cdc-obligation-constants.js:83-100`).
- So a reader `WHERE (log_index, ordinal) > cursor ORDER BY log_index, ordinal`,
  including delivered rows, could serve a full catch-up from any P. It would be
  correct only while D1 keeps every delivered row above the minimum outstanding
  handoff cursor. That is the D1/D4 coupling.

## 4. The two designs

### 4.1 Subscribe-before-hydrate (partition level)

**Contract.**

1. Register the subscriber, so it counts for acknowledgement.
2. Then, **on the current leader replica**, in **one synchronous span**: read
   the image (`SELECT *`) and P = `readDurableProgress(groupId).appliedIndex`.
3. Apply the image.
4. Every ledger event with `logIndex > P` reaches the subscriber through the
   lane, in log order.

**What makes P coherent.**

- *Image versus P.* Data rows, ledger rows and the applied state are committed
  in one transaction on the connection the read uses
  (`raft-rs-application-transaction-owner.js:59-79`). A synchronous read sees
  exactly the state after entry P.
- *P covers everything already acknowledged.*
  - The lane runs only on the leader, and a ledger row exists only after the
    leader applied it. So every row that was delivered or pending at
    registration has `log_index` ≤ the leader's applied index at any later
    instant.
  - After registration, an event can be acknowledged only once the new
    subscriber has covered it. Coverage requires every current subscriber
    (`deliverObligation`, `:469-498`, and the currentness capture, `:614-625`).
- *A read on a follower* is coherent only after the follower's applied index
  reaches the leader's applied index at registration, read-index style. The
  seed reads on the leader already (`:370-379`).
- *A leadership change after registration* resets `pending`
  (`resetCdcObligationLane`, `:147-157`). Pending events become owed again and
  are redelivered to the subscriber set on the new leader's node.

**Duplicates between the image and the first live events.**

- Events ≤ P still arrive. Examples: owed history at a fresh seed, events
  pending at registration, and (while it exists) the window.
- The obligation owner does **not** de-duplicate them for the consumer. The
  identity de-duplication `buildEventIdentity` (`cdc-event-buffer.js:41-55`) is
  used only inside the handshake, between the buffer and the window.
- At the cache, duplicates are absorbed by the **row-version merge**:
  - the stale check `isStaleForExistingRecord` (`system-table-cache.js:322-330,669-679`;
    HLC / `updated_at`);
  - the DELETE tombstone fence (`:302-320`; TTL 30 s, at most 1024 per table,
    `system-table-cache-tombstone-store.js:7-8`).
- This is correct for upserts in log order. It leaves today's transient
  resurrection for a history INSERT whose DELETE also replays.
- A positional filter (`logIndex ≤ P`) is possible, because every obligation
  event carries `logIndex` (`eventOf`, `partition-cdc-obligation-delivery.js:180-192`).
  But it must **not** suppress propagation into the message-group log at a
  fresh seed. Today the first subscriber's history replay is what puts the
  foundation rows into `mg-1`'s log. So the filter belongs, if anywhere, to the
  local re-apply only. Recommendation: leave duplicates to the row-version
  merge. The handoff's correctness does not depend on de-duplication.

**Probe result** (S1/S2, `d4-probe-output.json`).

- Setup: B registered, then read at P = 31, then 600 events: 1 DELETE of an
  image row, then 599 distinct inserts. One event was pending at registration.
- Result: B received all 600 events above P, plus 27 events at or below P
  (21 from the window, 6 owed from the ledger). Divergence from the partition
  was 0 rows. The same holds with 3 earlier subscribers.

### 4.2 Ledger-backed catch-up from a cursor

**Contract.**

1. The subscriber supplies its hydration position P.
2. The ledger serves every row with `(log_index, ordinal) > (P, ∞)`, delivered
   rows included, to that subscriber only.
3. The subscriber then joins the all-subscriber lane at the owed head.

**What it needs.**

- A new ledger reader that includes delivered rows.
- A per-subscriber catch-up cursor beside the lane's all-subscriber `pending`.
- A synchronous handover from catch-up to the main lane when the cursor reaches
  the owed tail. Otherwise the same race reappears inside the ledger.
- A position passed in at all three sites. The dynamic and joiner sites have no
  hydration read, so they have no P.
- **D1 retention**: keep every delivered row above the minimum P of every
  handoff in progress, including handoffs whose hydration read is done but
  whose subscription has not happened yet. That needs a handoff registry valid
  across leader changes (the read may be on another replica than the leader).
  It also needs an answer for snapshot install (whether images carry the
  ledger is unverified, investigation §7).

### 4.3 Comparison

| Criterion | Subscribe-before-hydrate | Ledger-backed catch-up |
| --- | --- | --- |
| Defined committed position | P = durable applied index, read in the image's synchronous span on the leader (coherent by one-transaction apply) | The same P, plus it must be carried to the ledger |
| Gap-free at the partition boundary | Yes, by the existing all-current-subscriber acknowledgement rule. **Probed**: 600/600 with traffic > window | Yes, if the retention floor holds and the catch-up-to-lane handover is atomic |
| Ledger change | None | New reader, per-subscriber cursor, handover, retention floor |
| D1 coupling | None beyond D1's own (acknowledgement-replay distinguishability, census) | Retention floor = min outstanding handoff P; durable or leader-tenure handoff registry |
| Sites affected | Seed hydration owner (reorder plus expose P). Dynamic and joiner sites have no partition read, so nothing to reorder | All three sites must pass a P; two of them have none |
| Duplicates ≤ P | Yes. Row-version merge absorbs them (as today) | No, if served from P exactly |
| Window deletion | Safe at the partition boundary once the witness passes | Same |
| Closes the group-level gap (§2.3) | **No** | **No**: the joiner's image is the seed cache, with no per-partition P |
| Size | S-M | M-L |
| Provable now | Yes: deterministic unit witness on real owners (§5); the probe already demonstrates it | Needs new owner code before any witness |

### 4.4 Recommendation

**Choose subscribe-before-hydrate at the partition boundary.** These are the
owner functions it touches.

1. **`PartitionService` read surface** (new, about 25 lines). One method, for
   example `readHydrationImage(sql)`. It runs the admitted read and, in the
   same synchronous span, `RaftRsDurableStore.readDurableProgress(groupId).appliedIndex`.
   It returns `{rows, appliedIndex, leader: isLeader, tenure}`. It refuses
   unless the replica is the leader, or unless the read-index condition holds.
2. **`SeedCacheHydrationPhase`**:
   - `phaseCacheHydration` (`:130-336`);
   - `hydrateFromLocalPartitions` (`:342-449`);
   - `subscribeToInitialSystemTableCDC` (`:532-552`);
   - `subscribeToHydrationCDC` (`seed-cache-hydration-cdc-subscription.js:21-134`).

   For each table: register the 9 subscribers. Then, in one synchronous span,
   read the image and P on the leader and apply it to the cache (the
   `applyImmediate` path is synchronous with `skipReplication`). Record P per
   table in the result and the diagnostics. Each table's registration must
   precede that table's read, which keeps it per table.

   The awaited waits between the read and the subscription today (verify,
   wait for leaders, latency owners) must move after the per-table handoff, or
   the read must be redone after them. About 60-100 lines changed.

   Before the reorder, the owners must decide whether the leader wait
   (`:174`) depends on CDC already running.
3. **`PartitionCDCDelivery.subscribeToCDCWithHandshake`** (`:533-720`). Delete:
   - the window block (`:630-669`);
   - `recordDelivered` (`:521`);
   - the ring (`cdc-event-buffer.js:218-260`);
   - `slidingWindowEventsReplayed`;
   - the dead buffer catch-up (`:588-629`, V16).

   The handshake becomes: register, then `driveCdcObligations(SUBSCRIPTION_HANDSHAKE)`.
   This also removes the window-refusal throw that skipped the drive
   (investigation L3b). About −120 lines.
4. **`repairPropagatedCacheTablesFromLocalPartitions`** (`:658-697`). It
   re-reads through the same owner and records P. It needs no reorder, because
   subscribers already exist.
5. **Tests.**
   - Five window-pinning tests are rewritten or deleted (investigation §4,
     "Tests that pin the window").
   - The seed hydration tests assert the per-table order and a recorded P.

**Total.** About +150 / −200 lines of source and a test rewrite. The ledger and
the lane are not touched.

Ledger-backed catch-up is not recommended. It is larger, it binds D1 to a
handoff registry, and it buys nothing at the boundary where a position exists.

**The group-level gap (§2.3) is a separate owner decision**, and the window
must not be deleted before it is witnessed. Candidates:

- **(a) Group subscribe-before-hydrate.** A new group becomes an active
  fan-out target in every propagating node's cache before its members read an
  authoritative image with a per-partition position vector.
- **(b) The joiner reads through `readHydrationImage` on each partition
  leader after subscription.** This turns the existing backfill
  (`node-joining-cdc-subscription-and-backfill.js:498-560`) into a positional,
  delete-aware read. It also removes the upsert-only blind spot.

## 5. Decisive witness

### W-D4a: partition boundary (unit tier, real owners, deterministic)

**Harness.** A real `PartitionService` leader on the controllable consensus
port (`participant-transaction-fixture.js` `startLeader`, `applyCommitted`),
with a `VirtualTimeSource`. `CDC_DELIVERED` proposals are applied back, as in
the probe.

**Positive (the production handoff function).**

1. Attach K ∈ {1, 3} earlier subscribers A (the seed's per-leader K is 3).
   Commit 20 events and let them be acknowledged and committed.
2. Commit 7 more and let A acknowledge one of them without flushing, so
   `pendingAcknowledgements` ≥ 1.
3. Later subscriber B runs **the production handoff**: register, then
   `readHydrationImage` returns `{rows, appliedIndex: P}`.
4. Commit M = 600 events: first a DELETE of an image row, then 599 inserts of
   distinct keys. M exceeds `CDC_EVENT_SLIDING_WINDOW_CAPACITY` (256), and it
   exceeds ⌊256/K⌋ by more.
5. Let A acknowledge everything and drain.

Assertions:

- Every ledger row with `log_index > P` reached B. Missing = 0.
- B's materialized view equals `SELECT * FROM test_table`: image + events
  > P in log order. Divergence = 0, including the deleted row.
- The ledger ends with `owed 0`.
- Once the window is deleted, `handshake.catchup` has no window field and B
  received nothing outside the lane.
- Run it on a real seed-hydration-phase double too: drive
  `SeedCacheHydrationPhase` with an interleaving hook that commits and
  acknowledges events between registration and the read. Assert the recorded
  P per table and cache equality.

**Negative (today's order, both with and without the window).**

- Same events, but B's read at H comes before the M events and B subscribes
  afterwards.
- **With the window**, today's code, measured:
  - K = 1, M = 600: missing 344 (log indexes 25-368), divergence 344, window
    replayed 256, ledger `owed 0 / delivered 620`.
  - K = 3, M = 200: missing 114, divergence 114, window replayed 86.
  - Control, K = 1, M = 100: missing 0. The window covers it only because
    M + 20 ≤ 256.
- **Without the window**, required to show red: missing = M.

### W-D4b: group boundary (required before the window is deleted)

**Topology.** A 3-node formation (the odd-count rule): the seed plus two
joiners, at least one of them `CREATE_SELF_HOSTED`.

**Interleaving hook.** It holds the joiner's group `services` row non-active.
While the row is held, commit and acknowledge more than 256 `nodes` /
`node_endpoints` updates and one DELETE of a `node_endpoints` row on the seed
leader. Then it releases the row.

**Assert.** The joiner's cache equals the authoritative partitions for those
tables, including the absence of the deleted row, within the CDC readiness
budget.

**Negative.** Today's code with the window: expect missing deletes, which
backfill is upsert-only and cannot repair. Run it with the window removed too.
This witness decides whether (a) or (b) of §4.4 is needed. It is a lab
formation run.

## 6. The D1 coupling

**Under subscribe-before-hydrate (recommended), D4 adds no retention
requirement.** No subscriber ever needs a delivered row. D1's floor is bounded
only by D1's own constraints:

1. **Acknowledgement-replay distinguishability.** A late or replayed
   `CDC_DELIVERED` naming a reclaimed position is today answered `UNKNOWN_EVENT`
   (`partition-cdc-obligation.js:206-224`). The lane treats that as **terminal**
   and sets `lane.held` (`acknowledgementFailureIsTerminal`,
   `partition-cdc-obligation-delivery.js:400-419`), which stalls the partition.
   D1's compact durable progress must answer "delivered, below the floor"
   distinctly from "unknown". This is the owner's D1 text.
2. **The seed census** reads delivered rows with `delivered_index` and
   `delivered_term` for foundation statements
   (`seed-retained-partition-effects.js:181-193,227-234`). It needs the
   retained-seed evidence or an owner-defined summary.
3. **Source-event versus delivery-marker positions.** P is the applied index,
   and it advances on `CDC_DELIVERED` entries, which have no ledger row.

Under ledger-backed catch-up, D1 would additionally have to keep every
delivered row above min(P) over all outstanding handoffs. That needs a handoff
registry that survives a leader change, and a rule for a handoff that never
completes. Otherwise retention is unbounded or the catch-up is unsafe.

**Order constraint.** Delete the window (F5) only after W-D4a and W-D4b pass.
D1 reclamation can proceed independently of D4 under the recommended design.

## 7. Probe output (`d4-probe-output.json`, summarized)

| Case | K earlier | Events in interval | P / H | B received > P | Missing | View divergence | Window replayed |
| --- | --- | --- | --- | --- | --- | --- | --- |
| T1 today (read, events, subscribe) | 1 | 600 | 24 | 256 | **344** (idx 25-368) | **344** | 256 |
| T2 today | 3 | 200 | 24 | 86 | **114** (idx 25-138) | **114** | 86 |
| T3 today (control, below window) | 1 | 100 | 24 | 100 | 0 | 0 | 120 (20 duplicates of the image) |
| S1 subscribe first, then read P | 1 | 600 | 31 | 600 | 0 | 0 | 21 |
| S2 subscribe first, then read P | 3 | 600 | 31 | 600 | 0 | 0 | 21 |

**Reproduce.** From a scratch tree at the lineage head, with `node_modules`
symlinked and the probe copied to `probe/`:

```sh
node probe/d4-handoff.probe.mjs
```

The run takes about 1 minute.

## 8. Unknowns

- **Group-level gap live.** §2.3 is constructed from code and was not run in a
  formation. Unknowns:
  - whether a joiner's group can be non-active as a target while events commit
    that J needs;
  - whether the joiner is also made a member of `mg-1`, and when;
  - whether the authoritative absence sweep
    (`system-table-cache-authoritative-absence-sweep.js`, caller
    `cdc-integration-service-cache-visibility-authority.js`) repairs missed
    deletes for a joiner.

  I did not trace these. W-D4b decides them.
- **Seed durable restart.** Whether a restarted seed runs `phaseCacheHydration`
  while dynamic-site subscribers already exist on the same partitions. If they
  do, interval A is open at the seed too, because events are acknowledged
  before the read's subscribers register.
- **The leader wait.** Whether `waitForSystemServiceLeadersInCache` (`:174`)
  depends on CDC being live. That decides whether the reorder can put
  registration first, or must re-read after it.
- **Follower reads.** Whether any production hydration reads a follower.
  Today's seed reads the leader. The read-index condition of §4.1 is needed
  only if one does.
- **Partition images.** Whether partition images (snapshot install) carry
  `_cdc_obligations` (investigation §7). This matters for D1 and for
  ledger-backed catch-up. It does not matter for the recommended design.
- **History replay hooks.** The history replay at a fresh seed runs
  `handleNodeReadyRebalanceTrigger` on historical `nodes` events (interval A).
  The effect was not measured. It is unchanged by the recommended design,
  because owed history is still delivered.
