---
audience: evidence
recorded: 2026-11-14
quest: cdc-obligation-range-shipping
---

(Typographic dashes in this report were replaced by ASCII hyphens for the documentation audit; nothing else was changed.)

# Challenge: timing, interleaving and size gaps in the range-shipping coverage model

Subject: `coverage-model-draft.md` (quest `cdc-obligation-range-shipping`).
Code read at the sealed base `9a22bf79b` (`git show 9a22bf79b:<path>`), not the worktree HEAD.
Read-only. Nothing was run. Numbers marked **[static]** come from the code. Numbers marked
**[est]** are my throughput assumptions, not measurements. The evidence has to measure them
(see M-13).

Abbreviations: `D` = `src/partition/partition-cdc-obligation-delivery.js`, `L` = `-lane.js`,
`P` = `-progress.js`, `C` = `-constants.js`, `DD` = `src/topology/cdc-group-propagation-durable-delivery.js`,
`CA` = `src/message-group/message-group-cdc-committed-acceptance.js`,
`RM` = `src/message-group/message-group-service-cdc-replication-runtime-methods.js`,
`INV` = `src/cdc/cdc-delivery-invocation.js`.

---

## 1. Constants on the path and how they relate

| # | Constant (owner file:line) | Value | What it bounds | Scales with vector? |
|---|---|---|---|---|
| K1 | Invocation budget `configuredInvocationBudget` (INV:60-67) = min(`messageGroup.deliveryTimeoutMs`, `transport.messageTimeoutMs`) (`src/config/config-definitions.js:66,102`; `MESSAGE_GROUP_SERVICE_DEFAULT.DELIVERY_TIMEOUT_MS` `src/message-group/constants.js:80`; `TRANSPORT_DEFAULT.MESSAGE_TIMEOUT_MS` `src/constants/transport.js:65`) | 5000 ms | one `beginCdcDeliveryInvocation` per `driveOnce` loop step (D:608-610): today **one row**, with vectors **one whole vector** across all leaves, all subscribers and foreground retries | **Yes. The budget is per step, so a vector gets 1/256 of the per-row time today's rows get.** |
| K2 | Per-attempt CDC propose timeout `computeCdcProposeTimeoutMs` (RM:485-504) | min(1500, floor((5000-200)/3)=1600) = **1500 ms** (floor 200) | the commit wait of one leaf. `runCdcProposal` re-arms the waiter with this budget (CA:178-181). When it fires, the waiter resolves UNKNOWN (CA:73-76) and the later retry attempts find `currentWait` false (CA:150,176). **In practice 1500 ms is the ceiling for one leaf's commit and apply, not 3×1500.** | Yes. It covers Raft replicate + commit + apply of the whole vector + `afterCommit` |
| K3 | MG retry budget `retryMaxAttempts` (`config-definitions.js:67`), forward retry delay (RM:443-465) | 3 attempts; delays 100, 200 ms (`100·2^(attempt-2)`), max 10 s | re-routing (forward/propose) inside one leaf. `onRetry` throws once delay ≥ remaining (RM:363) | No |
| K4 | Foreground wave retry `CDC_GROUP_PROPAGATION_RETRY` (`src/topology/cdc-group-propagation-constants.js:59-64`) | 3 attempts; 50, 100 ms (max 1000) | re-delivering uncovered leaves inside one wave. Skipped when delay ≥ remaining (DD:439-442) | No (but see M-1: fewer attempts fit) |
| K5 | Router ACK/response wait = `timeoutMs: context.remainingMs()` (DD:375). Default bound `MESSAGE_TIMEOUT_MS` (`src/transport/message-router-ack-delivery.js:11-13`) | ≤ remaining of K1 | a target leaf's send + ACK + response | Yes: serialization (DD:369, `message-router-delivery-encoding.js:65-98`), socket write, remote JSON.parse |
| K6 | Lane retry: initial / max (`src/partition/partition-service-constants.js:39-40`), hinted ceiling `HINTED_BACKPRESSURE_MAX_DELAY_MS` (L:20), doubling (D:336-339) | 50 ms / 10 s / 250 ms | delay before the next drive after HELD / BACKPRESSURE / TRANSIENT | No (values fixed). **Per-retry cost** scales (M-2) |
| K7 | Page-yield hint (D:550-551), slice-turn wake (D:359, L:160-165) | 10 ms, 1 ms | the next drive after a contended yield or a slice-turn wake | No. Per-retry cost scales (M-2) |
| K8 | `ACK_FLUSH_DEADLINE_MS` (C:79) | 1000 ms | proposing a partial ack batch | Becomes almost irrelevant: a 256-row vector fills the batch (C:74) and flushes at once (D:144-147) |
| K9 | `ACK_BATCH_MAX_EVENTS` / `ACK_BATCH_MAX_BYTES` / `ACK_MAX_OUTSTANDING_BATCHES` (C:74-76) | 256 / 64 KiB / 2 | ack batches. Per-row ack bytes ≈ 100 B (+≈30 B per new log index) (`partition-cdc-obligation-ledger.js:398-405`), so 256 rows ≈ 26-33 KB. **The byte bound cannot be reached before the count bound.** | One vector = 1 batch, or 2 when the batch was not empty |
| K10 | `DRIVE_PAGE_ROWS` (C:80), `RETAINED_DELIVERED_MAX` (C:81), `RECLAIM_ROWS_PER_APPLY` (C:82), `OWED_MAX_EVENTS` (C:73) | 256 / 1024 / 4096 / 4096 | a pass visits 256 rows = **exactly one full vector**; retained = 4 vectors; owed capacity = 16 vectors | Count only |
| K11 | Slot: `CONTENDED_TABLE_SLICE_WAVES` 4, `CONTENDED_SLICE_YIELD_HOLD_MS` 300, `BUSY_CONTENDED_RETRY_AFTER_MS` 10, `MIN_YIELD_HOLD_RETRY_AFTER_MS` 5 (DD:34-37) | as listed | node-wide wave fairness | **The slice is counted in waves, not rows**: 4 waves = 4 rows today, 1024 rows with vectors |
| K12 | Recipient commit-waiter queue `PROPOSAL_QUEUE_DEFAULT.MAX_CAPACITY` / `BACKPRESSURE_RETRY_AFTER_MS` (`src/partition/proposal-queue-constants.js:14-20`; queue `src/message-group/message-group-service-state.js:223`) | 1000 entries / 100 ms | concurrent recipient waits; a duplicate key is refused with 100 ms (CA:126) | Count-bounded, not byte-bounded (S-5) |
| K13 | Authoritative catch-up `MAX_ATTEMPTS_PER_TABLE` / `RETRY_FALLBACK_DELAY_MS` (`src/cdc/cdc-integration-service-authoritative-catchup.js:50-54`); observation-reconciliation cadence measured at ≈5-6 s (trace §5) | 3 / 500 ms | the repair that today closes episodes before live CDC does | No. The vector competes with it for latency, not correctness (C-6) |
| K14 | Raft `electionTimeoutMinMs` / `heartbeatIntervalMs` / `tickIntervalMs` (`config-definitions.js:37-40`) | 1000 / 50 / 20 ms | how long one synchronous span may block a node that hosts ~139 groups (trace §1) | **Synchronous spans scale with vector bytes** (M-3) |

### Relationships the model has to state, with the boundary cases

1. **K2 < K1, and the leaves of one wave are serial.** For L leaves, a wave succeeds in one
   attempt only if Σ leaf_i ≤ K1 = 5000 ms and every leaf_i ≤ K2 = 1500 ms (DD:391-410 serial
   loop; CA:178). Measured for one event: leaf p50 54-376 ms, **max 1277 ms**, against a
   1500 ms ceiling (trace §1, the seed as target). Headroom on the slow leaf is about 220 ms.
   - Boundary per member: the CDC_BATCH apply (`src/message-group/message-group-service-raft-timing.js:64-80`)
     runs `applyImmediate` and pushes one `afterCommit` emit per member, on **each** replica.
     In the measured topology all 3 replicas of a group sit on one node (trace §0.1).
     So 256 × 3 = 768 member applies land on one event loop. If the per-member
     apply cost a ≥ 220 ms / 768 ≈ **0.29 ms**, a full vector pushes the measured worst
     seed leaf past K2. A single event never comes within 2 orders of magnitude of
     this. [static arithmetic, a unknown]
   - Consequence: K2 expires, the leaf answers UNKNOWN, but the proposal still commits.
     The same pinned vector is re-presented and refused with BACKPRESSURE 100 ms while the
     raw operation is open (K12, CA:126; `proposal-queue.js:97-99,156-168`). It is then
     re-proposed, commits again, and misses K2 again. **This is a livelock: work is applied
     on every wave and the receipt never arrives.** With one row per wave it cannot happen.
2. **Digest passes per leaf scale with bytes.** Full canonical-serialize + SHA-256 passes over the
   vector: sender `prepareCdcObligationProgress` (P:56) and `bindCdcPropagationProgress`.
   Recipient: `captureCdcCommandVector` computes 2 vector digests (CA:103,125). Then
   `buildCommittedCdcOutcome` computes 1 vector digest + 256 per-event digests
   (`src/cdc/cdc-delivery-outcome.js:202-236`), and `isCommittedCdcOutcome` re-derives it at
   least 4× more (CA:247,266,282,325; DD:418; `observeCdcCoverage`). That is ≥ ~10 byte-linear passes
   per leaf, plus `captureCdcEvents` deep copies (DD:501; CA:107; raft-timing.js:66),
   `encodeProposal` (JSON) + base64 (`src/raft/raft-rs-proposal-codec.js:33-46`;
   `src/raft/raft-rs-ingress.js:39`), and decode per replica. **[est] about 15-30 byte-linear
   passes per leaf on the recipient's node; at roughly 10 ms per MiB per pass that is
   150-300 ms per MiB per leaf.**
3. **The page read and `eventOf`.** `readOwedCdcObligations(limit N)` is one synchronous
   `.all()` (`partition-cdc-obligation-ledger.js:158-172`). `eventOf` (D:91-100) does one
   `JSON.parse` + spread + `captureCdcEvents([event])` deep copy + freeze per row. Both are
   linear in Σ event_json. Today this happens once per row per attempt. With vectors it is
   N rows per attempt **and it repeats on every refused retry** (M-2).
4. **K11 × wave time.** A worst-case wave is still capped by K1 (5 s), so the worst-case slice is
   4 × 5 s + 300 ms in both designs. The *typical* slice grows from 4 × ~450 ms to
   4 × (450 ms + vector cost). Fairness counts waves, so a 256-row table and a 1-row table get
   equal slot time per turn but very different row throughput (M-6).
5. **K8 vs K9.** With vectors, a covered 256-row vector flushes at once. CDC_DELIVERED proposals become
   one per vector instead of one per second, so the source group's commit rate of
   acknowledgement entries rises up to 1 per wave (~2/s per lane). That is new load on the
   *source* group's Raft, and today's model does not mention it.
6. **K6/K7 vs per-attempt cost.** Retry delays are fixed (10, 1, 50→250 ms). A refused attempt
   costs O(vector bytes) (relationship 3 plus one digest), so CPU per waiting lane =
   bytes × (1000 / delay) per second (M-2).

---

## 2. Size limits on the path

| Stage | Limit and owner | What happens above it |
|---|---|---|
| Ledger row `event_json` | **None.** `OWED_MAX_EVENTS` comment "no new per-event payload … cap" (C:72); `INSERT` takes any TEXT (C:135-138) | n/a. A single row can be larger than any vector bound (R1-5 rule: it ships alone) |
| Sender page / vector | none today (SHIP_MAX_BYTES to be chosen) | - |
| Propagation request / `captureCdcEvents` | no size limit; refuses an **empty** array (`src/cdc/cdc-event-envelope.js:133`) and a **duplicate identity** inside one vector (`:139-141`) | typed INVALID throw |
| Router frame (primary socket) | **ws default `maxPayload` = 100 MiB**: server created without options (`src/transport/message-router-server-lifecycle.js:112-118,146-149`; `router-server-manager.js:155-158`), client without `maxPayload` (`message-router-connection-lifecycle-methods.js:342-346`); default `node_modules/ws/lib/websocket-server.js:74`, `websocket.js:675` (ws 8.21.0). No owner constant in `src/constants/transport.js` (only the bulk channel has one: `MAX_PAYLOAD_BYTES` 1 MiB + 1 KiB, `:214-222`, not on this path) | **Not a typed refusal.** The receiver closes the socket with 1009 "Max payload size exceeded" (`node_modules/ws/lib/receiver.js:419-445`). Every in-flight message on that peer connection fails, including Raft traffic sent on the same socket (`tryDeliverRaftDirect`, `message-router-delivery-behaviors.js:242-270`). Because the row stays owed it is re-sent, so the peer link is severed again on every retry. |
| Router outbound queue | `OUTBOUND_QUEUE_MAX_PENDING` 64, concurrency 32 (`transport.js:86-87`): counts messages, not bytes | backpressure error with 500 ms hint (`:117`) |
| MG command admission | `assertMessageGroupCommandAdmitted`: type check only; no batch size (`src/message-group/message-group-committed-command-admission.js`) | - |
| Commit-waiter queue | 1000 entries, counted not sized (K12) | typed BACKPRESSURE, 100 ms |
| Raft proposal codec | **None.** JSON → UTF-8 (`raft-rs-proposal-codec.js:33-46`) | - |
| raft-rs | `max_size_per_msg` = 1 MiB, **soft** (`vendor/raft-rs-wasm/src/lib.rs:463-465`): an append carries at least one entry. `max_inflight_msgs` 256 (`:466-468`). `max_uncommitted_size` left at the raft-rs default (no limit) | An entry > 1 MiB goes alone in its own append message. Entries reach the wire and storage as **base64** (`lib.rs:117,241`; `raft-rs-durable-store.js:63`): ×4/3 |
| Raft append on the wire | goes through the same router socket → the 100 MiB ws limit applies to the base64 form | an entry with JSON size above ≈ 75 MiB (100 / 1.33, minus envelope) severs follower links (as above) |
| `CDC_BATCH` apply / recipient handler | no member bound (raft-timing.js:64-80; `LATENCY_CDC_PROPAGATION_BATCH` handlers `message-group-forwarding-owner-delivery-methods.js:414-514`) | - |
| `CDC_DELIVERED` | 256 events / 64 KiB (C:74-76); never reached by vector size (K9) | typed admission refusal (D:205-211) |

**The only hard limit is ws 100 MiB, and crossing it severs the connection instead of
returning a typed refusal.** No owner constant states it. The quest should name it as a
transport owner constant before choosing `SHIP_MAX_BYTES` (must-add M-12).

### Recommended byte bound: `SHIP_MAX_BYTES` = 256 KiB of Σ `event_json`

Hard limits do not constrain the choice: anything below ~70 MiB is safe against them. The
binding constraints are time:

- (a) **Per-leaf slack under K2.** The measured worst slow leaf leaves ≈ 220 ms
  (1500 − 1277). At [est] 150-300 ms per MiB per leaf (relationship 2), 220 ms allows
  ≈ 0.7-1.4 MiB. Taking half of that slack for the vector gives ≈ 0.35-0.7 MiB.
- (b) **Longest synchronous span** must stay well under the 1000 ms election minimum
  and ideally near the 50 ms heartbeat (K14). The node already showed a 1381 ms gap
  (trace §1). One apply span (decode + capture + 256 applies + digests ≈ 5-8 passes) at
  [est] 10 ms/MiB/pass ≈ 50-80 ms per MiB. ≤ 50 ms gives ≈ 0.6-1 MiB, but this repeats
  per co-located replica and per waiting lane (M-2).
- (c) **Refused-retry amplification (M-2)**: up to 100 attempts/s at 10 ms, settling at
  4/s at 250 ms per waiting lane. At 256 KiB and 4/s that is ≈ 1 MiB/s of parse+copy+digest
  per waiting lane. Acceptable. At 4 MiB it is not.
- (d) **Raft batching**: staying ≤ 1 MiB keeps `max_size_per_msg` batching intact.
- (e) **Typical rows**: system-table rows of about 0.5-1 KB make 256 rows ≈ 128-256 KiB,
  so with 256 KiB the count bound and the byte bound coincide for typical traffic. 64 KiB is
  the precedent the ack owner chose (C:76).

**Pick 256 KiB**: the minimum of (a)/2, (b) and (d), rounded to the typical-row regime.
State the throughput estimates as assumptions that M-13 must measure. An oversized single
row still ships alone (R1-5). Rows above ~64 MiB stay a pre-existing hazard: today a single
row already severs the link, so this is not new, but the model should record it (C-1).

---

## 3. Missing interleavings and temporal cases

Await points with a vector in hand: `drivePage` (sync) → pre-pass (sync) → per subscriber
`await deliverCDCEventToSubscriber` (D:377) → inside it `await wait(beforePropagation)`,
`await resolveOperationalMessageGroupSelectionAsync`, `await propagate…`
(`partition-cdc-propagation-subscriber.js:238-262`) → inside the wave the serial leaves
`await context.run(applyCDCBatch | deliver)` (DD:397-400) and `await wave.wait(retryDelay)`
(DD:444) → back in the lane: synchronous `acknowledgeDelivered` × N (D:394), whose
`flushCdcAcknowledgements` runs synchronously up to `await acknowledgementProposer` (D:235).
Things that can run at any await: hydration handshake (D:768-786), a flush settling →
`settleAcknowledgedObligations` → `drainPendingHydratedObligations` + `driveCdcObligations` (D:74-89),
the flush-deadline timer (D:113-117), the retry timer → `retryAcknowledgements` (D:340-347, 299-312),
`reconcilePendingAcknowledgement` adding a replacement command (D:283-297), tenure reset (L:59-68),
subscriber churn (P:41-48), invocation timeout `retire` (INV:217-223,308), slot release →
`onSliceTurnReady` → `wakeContendedLaneForSliceTurn` (DD:119-134; D:352-361).

### Must add

**M-1. Per-leaf K2 ceiling and the livelock (temporal, timing arithmetic).** RM:485-504, CA:175-191, CA:73-76.
Scenario: the slowest leaf's commit+apply of a full vector exceeds 1500 ms. The receipt is
always UNKNOWN, the entry always commits, and the lane re-ships forever. One-row waves would
progress. Add to Events: *E1b: the leaf's commit lands after K2 but before K1*, and to the
claim: *liveness: a vector that cannot be covered within K2 must not be re-presented
unchanged forever* (S1-a currently says "pressure changes latency, never correctness";
here it changes liveness). Also add *a leaf answering UNKNOWN whose entry later commits*,
with the duplicate apply that follows and the BACKPRESSURE window of K12 while the raw
operation is open (`proposal-queue.js:156-168`).

**M-2. Refused-retry amplification (timing × size).** D:366-369, P:55-56, DD:477-486, D:550-551, D:359, L:181-187.
The slot refusal comes *after* the lane has read, parsed, captured and digested the whole
vector (`eventOf` + `cdcCommitWaitIdentity`). Admission precedes capture only inside the
propagation service. The refusal hint is 10 ms, a slice-turn wake is 1 ms, and the
backoff cap is 250 ms. Today a refused retry re-reads one row. With vectors it re-reads up to
256 rows / SHIP_MAX_BYTES, every 1-250 ms, per waiting lane (the trace saw 376 refusals and a
queue of up to 6). Add a model row: *S9 × retry cadence: the work done per refused attempt,
and its bound*. Mutation to add: "the page is re-parsed on every refused retry", which must
show in a cost metric.

**M-3. Synchronous span vs Raft timing (K14).** raft-timing.js:64-80; CA:101-108; `raft-rs-proposal-codec.js:53-58`.
The CDC_BATCH apply on each co-located replica, `captureCdcCommandVector`, the receiver's frame
`JSON.parse` and the sender's `encodeDeliveryMessage` are each one synchronous span linear in
vector bytes. A single event never approaches the 50 ms heartbeat or the 1000 ms election
minimum. Add a temporal relationship: *T8: the longest synchronous span per vector stays below
a stated fraction of `heartbeatIntervalMs`*, and an anchor at SHIP_MAX_BYTES and at the
oversized-row case.

**M-4. Pre-pass admission is stale at acknowledgement time (T2 vs T5).** D:429-434, D:130-150, D:120-128, D:394, D:113-117, D:283-297, D:750-766.
The design says acknowledging a vector "forces at most one flush; that flush has a free command
slot by the precondition" (design 4.2). The precondition `commands.size < 2` is read at T2,
before the awaits. During T3, the flush deadline, a hydration drain flush or a reconcile
replacement can each add a command. At T5, `commands.size` can therefore be 2. The row that fills
the batch to 256 then gets `FLUSH.BACKPRESSURE` (D:177-180), the next row returns false from
`flushFullBatchBeforeAdd` (D:126-127), and `deliverObligation` ignores that return value (D:394).
**Up to 255 covered rows of one vector stay owed and are not pending, while the cursor has
already advanced past them** (D:478; `acknowledgementBackpressured` does not clear `lane.scan`
for the commands bound, D:430). Today this loses at most one row per occurrence. Add S6 ×
T3: *outstanding commands go from <2 to 2 during the subscriber await*. Expected result:
the rows are re-shipped in a later pass, and claim 3 must hold, including the order of
re-delivery against later vectors.

**M-5. `retainedDeliveredBackpressured` is not cumulative inside a vector (S6, non-head rows).** D:419-427, C:81.
Today each row is checked as `pending.size + retained ≥ 1024` just before *its own* delivery, so
after delivery pending + retained ≤ 1024. A pre-pass that evaluates all 256 rows against the T2
`pending.size` lets the lane overshoot to 1024 + 255. During T3 the retained count also moves:
a later CDC_DELIVERED that commits before an earlier one raises it. Row 0 may be the head
(exempt) while rows 1..255 are not. Add: *the bound as a function of the row index i within the
vector (pending.size + i)*, and *the retained count changing during T3*.

**M-6. Fairness unit changes from rows to vectors (Q4).** DD:224-241, DD:287-310, DD:312-329.
The slice is 4 *waves*. One table can now move 1024 rows per turn while a 1-row table moves 1.
Each wave is still capped at K1, so the worst-case wait of another table per table ahead is
unchanged: 4 × 5000 + 300 ms = 20.3 s. The *expected* wait grows with vector cost: 4 × (≈450 ms +
c·bytes). The exclusion "the node-wide propagation slot … carried unchanged" hides this. Add an
external output: *per-table slot hold time per turn*, plus an anchor that two contending tables
(256-row backlog vs 1-row) both make progress within a stated bound.

**M-7. Overlapping, non-identical vectors while an older wait is open on the recipient.** CA:110-145, `src/cdc/cdc-delivery-outcome.js:221-226`, design 4.5.
The duplicate guard is keyed by the exact vector digest (CA:125-126). It catches only E8 (the
same vector). Any boundary change gives a different key: tail growth after `scan.through = null`
(D:547), rows acknowledged by hydration, a new tenure re-reading from the head, or the M-4
remainder. Both vectors are admitted, both proposals can commit, and **in either log order**:
the old one may be forwarded on a slower route (RM:355-358) and commit after the new one. The
recipient then applies rows k..k+255 and afterwards rows j..j+255 with j < k, so older versions
of keys come after newer ones. Correctness then rests entirely on per-member HLC LWW and
tombstones (design 4.6). With one row per wave, the overlap is one row and the same-key guard
usually serializes it. Add to Events: *E8b: a vector that overlaps a still-open or still-proposing
vector with different boundaries; both commit, in reverse order*. The differential oracle must
cover reverse-order commits with several versions of one key and DELETE tombstones (S3).

**M-8. Hydration retire rule for a range.** D:726-734.
`retireHydratedInvocationAndResetIdleScan` compares one `currentObligation.logIndex` with
`throughLogIndex`. The design changes it to first/last (design 4.2, P:61-62) but defines no
rule for `first ≤ P < last`. Retiring on `first` kills a vector whose tail still needs delivery.
Retiring on `last` keeps delivering hydrated rows. Add an S4 case: *P falls strictly inside the
in-flight vector*, with the expected retire decision.

**M-9. Pinning vs pre-pass conflict while hydration acks are uncommitted.** D:736-748, C:140-146, D:491-506.
Hydration puts rows of a pinned vector into `lane.pending` (possibly only a prefix: the loop breaks
at D:740-744). The owed read still returns them, because `delivered = 0` until CDC_DELIVERED
commits. The design's check that the "read returns the same rows" therefore says *keep the vector*,
while the per-row pre-pass says *skip the pending rows*. The digest differs depending on which rule
wins. Add an E3 sub-case: *hydration acknowledged rows inside the pinned vector, before their
CDC_DELIVERED commits / after it commits*, with the expected vector for each.

**M-10. Frozen claim 5 is false with holes.** Model D2/S5.
"The maximal run of READY rows from the page head" splits at every pending or hydrated hole, so
waves ≥ ceil(B/256) + byte splits + **one per hole**. Restate claim 5, or count holes in the
anchor.

**M-11. Invocation finished, children still open (T between `context.finish()` and close).** INV:206-211,232-248; D:623-628; D:650-656; DD:487-498.
After `finish()` the invocation stays active until every owned child settles: a recipient raw
proposal (CA:156), router deliveries (DD:370-381), the wave child scope. The node-wide slot is
released only on that cleanup (DD:493-498). Meanwhile every drive returns `JOINED_IN_FLIGHT`, and
progress waits on `resumeAfterCdcCleanup`. Child lifetimes grow with vector apply time, so this
window grows too. Add T9: *after finish, before close*: what joins, what wakes the lane, and how
long the slot stays held after the response.

**M-12. Size limit table as an owner fact.** The model's S2 has "one row above the byte bound" but no
case at or above the transport limit, and no owner states that limit (§2). Add S2 cases *vector
bytes near the ws maxPayload after base64* (the Raft append path) and *single row above it*, with
the observed outcome (connection close 1009, not a typed answer). Alternatively, scope them out
explicitly as pre-existing.

**M-13. Timing contracts must be measured, not only held constant.** The model's "Timing contracts:
no … value changes" is necessary but not sufficient: the constants stay the same while the work
they bound grows 256×. Add externally relevant outputs: *per-leaf commit+apply time for a full
vector on the slowest leaf vs K2*, *sender per-attempt cost vs vector bytes*, *longest synchronous
span*. These turn the [est] figures in §1-§2 into evidence.

### Consider

**C-1. Oversized single row** (R1-5) above ~64 MiB: pre-existing hazard (§2). Record it as an exclusion with its reason.

**C-2. Memory per wave (Q4).** Per lane: event_json strings + parsed objects + `eventOf` frozen copy
+ propagation capture (DD:501) + per-target encoded frame (built serially, one per leaf in
flight) + recipient captures (CA:103-107) + Raft JSON + base64 × replicas. [est] ≈ 15-25 × vector
bytes on a node that is both sender and source-group host, so ≈ 4-6 MiB at 256 KiB. **Across lanes**
it is *not* × 1: every lane that is driving builds its vector before the slot refuses it (M-2),
so the peak is (#driving lanes) × ~4 × vector bytes plus one admitted wave. Today it is ≈ 1 KB
per lane. Add a bound row.

**C-3. Recipient waiter memory.** K12 counts entries: 1000 × captured vector = up to 250 MiB at
256 KiB per recipient group, against ≈ 1 MiB today. Concurrency is realistically ≈ sender nodes ×
few, but the bound is no longer a memory bound.

**C-4. Source-group acknowledgement rate** (relationship 5): CDC_DELIVERED entries go from ≤1/s to
≈1 per wave per lane. Measure them as extra Raft load on the source partition.

**C-5. Router head-of-line blocking.** Raft heartbeats use the same socket (`tryDeliverRaftDirect`).
A large CDC frame delays them by its transmit time. That is negligible at 256 KiB, but matters if
the bound is raised.

**C-6. Catch-up race (K13).** A vector applied after an authoritative catch-up image with a newer
`authoritativeObservedAtMs` (`cdc-integration-service-authoritative-catchup.js:111-120`) gets the
same per-row HLC treatment as today. Note it explicitly as unchanged.

**C-7. Per-member side effects** that were per wave become per vector: the subscriber's
`beforePropagation`/`afterPropagation` hooks and `logPropagationEvent`
(`partition-cdc-propagation-subscriber.js:238-262`), `registerContentionOwner` using `event?.tableName`
(P:124-127), and `describeDeliveryEvents` labelling the batch "batch" (`cdc-group-propagation-delivery-methods.js:53-66`).
Note any hook whose semantics are per row.

**C-8. Restart re-ship content (Q5).** After a restart or leader change the new vector may (i) start
later, because rows were acknowledged and reclaimed, (ii) end later, because the tail grew, and
(iii) skip M-4 remainder rows only until a later pass. Neither the recipient's duplicate wait
(different key) nor its order guard covers (i)-(iii). Only idempotent HLC apply does, which is
M-7's oracle. Sequence numbers are re-minted per attempt (D:368) but sit outside the digest
(`cdc-delivery-outcome.js:183-200`), so they cannot cause a digest mismatch.

---

## 4. Rows to add to the model (summary)

| Model section | Add |
|---|---|
| Events | E1b leaf commits after K2 (M-1); E8b overlapping different vector, reverse commit order (M-7); E3a/E3b hydration inside pinned vector before/after commit (M-8, M-9); E9 commands 1→2 during T3 (M-4) |
| State | S6: pending.size + i per row index; retained count moving in T3 (M-5); S2: vector/row near ws limit (M-12); S9 × retry cadence (M-2) |
| Temporal | T8 sync span vs heartbeat/election (M-3); T9 finish→close with open children (M-11); T3 split into T3a pre-admission (refused) / T3b in wave |
| Outputs | per-table slot hold per turn (M-6); per-leaf vector commit time vs K2, per-attempt sender cost, longest sync span (M-13); rows left owed by a failed in-vector ack (M-4) |
| Claims | claim 5 + one per hole (M-10); liveness under K2 (M-1) |
| Exclusions | the slot is "carried unchanged" in code but not in effect (M-6); single row > ws limit (C-1) |
