# CDC Stage 3 + dead-recipient measures — writer report (2026-11-11)

All results are unit level. Nothing has been independently verified or measured on the lab, and no git state was changed.
Design note section appended: "Stage 3 as built, and the dead-recipient measures (2026-11-11)" in
solve/epics/operation-integrity-and-reliable-formation/cdc-delivery-design-note-2026-11-11.md.

## Summary
- Part A (Stage 3): built and witnessed.
- Part C (DETACHED{lifecycle}): built and witnessed.
- Part D (MUST_RELIST): built and witnessed.
- Selection churn: fixed and witnessed.
- Part B (admission reserve): NOT BUILT. It is blocked at an owner boundary (see below).

## Part A — Stage 3

### Decisions
1. **Incarnation.** No per-log incarnation exists. I checked these, and none of them changes when one partition's log is rebuilt:
   - the raft-rs applied state;
   - the snapshot identity {clusterId, raftGroupId}: clusterId is cluster-wide and a backup restore keeps it;
   - the opening history;
   - the services-row birth (created_at, per replica);
   - the boot incarnation.

   The ledger therefore mints one: `_cdc_ledger_incarnation` = term:index:entryId of the first entry that records an obligation. It is written with INSERT OR IGNORE in the apply transaction, so every replica and every snapshot install holds the same value.
   - Ranges and images both carry it.
   - The cell treats a range from another incarnation as GAP.
   - An image from another incarnation replaces the cell.
   - This is a finding: there was no existing authority to consume.
2. **Range.** `sourceRange {sourcePartition, incarnation, after, through}` travels beside the events. `after` is read from the replicated ledger (`readCdcPredecessorPosition`).
3. **One source-order owner.** `SystemTableCacheSourceOrder` (system-table-cache-cdc-observation.js) holds the position cell plus the within-entry rule. The within-entry rule stays because unranged paths (local-replica apply, provisional ingress, list rows) cannot be gated by the cell. system-table-cache-source-order.js is deleted.
4. **ALREADY_APPLIED is a group-log fact.** It is decided per group replica: the highest committed range per source incarnation. GAP is decided per node cell. A list is node-local, so a leader that listed must still propose; otherwise followers never see the range.
5. **A gapped member never merges.** It lists instead. The "merge safely" claim is withdrawn.
6. **Classification happens after capture,** inside the reservation. The input-guard witness showed that the raft status read before capture serialized data.
7. **New positioned re-list.** It uses a hydration-image query (one span on the leader) and installs rows and position in one span on the recipient. The CL-014 catch-up is unchanged; it does not read in one span.
8. **The new-recipient window is closed by:**
   - the position probe: the newest recorded event, kept in a separate one-row record `_cdc_ledger_newest`, so D1 is NOT changed (a first draft that retained a ledger row broke D1 and the seed census and was replaced);
   - a recipient-domain cache wake (services, message_groups, latency_groups, nodes) held by the bound propagation.
   - No timer is involved.
   - Behind ⇔ a ledger row lies above the cursor. The probe is sent only when no owed row lies after the cursor.

### Wire and contract changes (one change, no dual path)
- **Durable `CDC_BATCH`:** exactly {type, events, sourceRange}. A single `CDC` command never carries a durable event. Refusal: `message_group_cdc_batch_shape_invalid`.
- **Outcomes:**
  - new `CDC_COMPLETION.POSITION_GAP` (`cdc_recipient_position_gap`, typed, with hint, kept through relays);
  - new already-applied outcome {cdcAlreadyApplied, cdcAppliedThrough, cdcSourceIncarnation, groupId}, with a closed field set.
- **Payload `sourceRange`** is carried on all of these paths:
  - the topology target payload;
  - source `applyCDCBatch`;
  - the forward payload;
  - the scoped recipient invocation.
- **Partition query flag `hydrationImage`:** answered by `answerHydrationImageQuery` with rows, the leader witness and sourceImage {sourcePartition, incarnation, appliedIndex}. Refusals are `partition_hydration_image_not_leader|_refused|_exceeds_bound`.

### Changes (file : function)
- **Ledger and lane:**
  - partition-cdc-obligation-ledger.js: ensureCdcObligationLedger(db, entry), readCdcLedgerIncarnation, readCdcLedgerNewest, readCdcPredecessorPosition, countOwedCdcObligationsAfter, insertCdcObligation (upserts the newest record);
  - partition-cdc-obligation-constants.js: SQL, RELIST_LAG_ROWS, OWED_RETIREMENT_RESERVE_EVENTS (unused, see B), recipient states POSITION_GAP/MUST_RELIST/DETACHED, DETACH_REASON, REASON.RECIPIENT_DOMAIN_CHANGED;
  - partition-cdc-obligation.js: mints on recording;
  - partition-cdc-obligation-vector.js: sourceRangeOf, positionProbe/isPositionProbe;
  - partition-cdc-recipient-drive.js: frontier excludes DETACHED/MUST_RELIST, confirmedThrough, POSITION_GAP hold, behind/ledger view;
  - partition-cdc-obligation-progress.js: invocation carries sourceRange, domain watch release;
  - partition-cdc-obligation-lane.js: releases topology watches;
  - partition-cdc-obligation-delivery.js: recipientDomainChanged, lifecycle trigger, markRelistRecipients call;
  - partition-cdc-delivery.js: accepts already-applied, keeps the gap reason.
- **Topology and progress:**
  - cdc/cdc-propagation-progress.js: plannedGroupIds, watchRecipientDomain;
  - cdc-delivery-outcome.js: outcomes above;
  - topology/cdc-group-propagation-durable-delivery.js and -delivery-methods.js: range on the wire, foreground loop stops on a gap;
  - cdc-group-propagation-routing.js: exports.
- **Message group:**
  - message-group-cdc-committed-acceptance.js: range capture and classification;
  - new message-group-cdc-source-range.js: classifyDurableRangeAtLeader, applyCommittedCdcRange, group committed map;
  - message-group-service-raft-timing.js: CDC_BATCH durable branch;
  - message-group-committed-command-admission.js and constants.js: closed shape;
  - forwarding-owner-delivery-methods.js, cdc-replication/propagation-runtime-methods.js: range threading.
- **Cache:** system-table-cache-cdc-observation.js (cell); system-table-cache.js (import only).
- **Re-list:**
  - new cdc/cdc-integration-service-source-relist.js;
  - cdc-integration-service-lifecycle.js: registers the relister;
  - partition-service-hydration-image-methods.js and partition-service-remote-query-methods.js: serving side.
- **Propagation subscriber:** bootstrap/shared/partition-cdc-propagation-subscriber.js (already-applied, gap reason, binding).

### Tests
New witness files:
- test/message-group/cdc-vector-application-equivalence.test.js, rewritten, 6 tests:
  - S3-1 to S3-4 and S3-6;
  - S3-5 is a 150-trial seeded property test through the real committed application, CDCHandler, SystemTableCache and CDCIntegrationService relister. It covers tombstones, delete/re-create, same-entry siblings, late older ranges, gaps, list/stream races and an incarnation change.
- test/partition/partition-cdc-source-relist.test.js, 7 tests on the real source lane, ledger, topology and hydration-image serving:
  - L1 to L5;
  - S3-C (Part C) and S3-D (Part D).
- test/bootstrap/message-group-selection-binding.test.js, 1 test.

Mutations, each killed by the named test:

| Mutation | Killed by |
| --- | --- |
| Cell incarnation check | S3-3 |
| Member skip | S3-1, S3-5 |
| Gap merge | S3-1, S3-5 |
| Need tracking | S3-1, S3-4 |
| Within-entry rule | S3-6 |
| MUST_RELIST outside frontier | S3-D |
| Lag marking | S3-D |
| Detach on non-retired evidence | S3-C |
| Incarnation on already-applied | L4 |
| Probe removed | L5 (livelock, killed by timeout) |
| Domain wake removed | L5 |
| Newest record removed | L5 |
| Predecessor forced to the start | S3-D |
| boundService ignored | selection test |

Before-failure evidence:
- On the old code these could not run or fail: S3-1 (an old CDC_BATCH merge has no range), L2 (no sourceRange on the wire), L5 (no probe and no wake), S3-C and S3-D (no states).
- The mutations above revert each safety line individually.
- I did NOT revert the whole change set in a scratch copy, because that needs a pre-change snapshot of other writers' uncommitted tree.

Existing tests adapted (R09 where a pinned expectation changed):
- message-group-cdc-receiver-admission: ranges and positioned recipients. The C1 race cell "same vector admitted again after closure" is superseded: it is now answered already-applied, with no second native entry.
- message-group-cdc-input-guard, native-mixed-vector, native-application-membership, native-custody-handoff, cdc-public-defer-repair, native-provisional-route, native-w7-multi-target-route, topology proposal-cost and service harness (carry ranges), bootstrap cdc-source-occurrence-delivery.integration: the 65-vector gets a synthetic source of its own, and the composition gets a production-shaped relister (test-helpers/cdc-source-range-fixture.js registerLeaderRelister).
- cdc-hydration-old-order: the late positionless subscriber now gets the probe row (1 event; 599 of 600 still missing).
- seed-retained-effects: the ledger mint argument.
- system-table-cache-observation: fixed a pre-existing defect where a reused eventKey for two occurrences was dropped by the earlier eventKey dedupe.

Directly affected files now green (about 60 files, each run alone):
- the partition cdc-* files;
- message-group cdc/native files;
- topology cdc-group-propagation-*;
- cdc-delivery-outcome/complete-vector;
- the cache files;
- seed-retained-effects;
- the cdc-group-boundary-handoff and cdc-source-occurrence integration tests.

Still red:
- test/bootstrap/cdc-initial-subscription-leader-fallback.test.js (3 tests). Its mocked seed-phase propagatePartitionCDCEvent is no longer called, because the bridge now goes to latencyTopology (a mock that returns undefined). By reading this comes from the previous writer's one-bridge change and is not Stage 3. It has not been confirmed against a baseline.

## Part C — DETACHED{lifecycle}

- **Authority.** `readRecipientGroupLifecycle` (cdc/cdc-recipient-lifecycle.js) uses leader-witnessed reads of services, message_groups and nodes:

  | Evidence | State |
  | --- | --- |
  | The message_groups row is retired/inactive | RETIRED |
  | Every replica row is stopped, or on a node that is stopped or failed | RETIRED |
  | Any replica is active | ACTIVE |
  | No rows at all | NOT_ESTABLISHED |
  | The read is unavailable or not from the leader | UNAVAILABLE |

  - Only RETIRED detaches.
  - The routing RETIRED/INACTIVE classes are cache filters; they are used only as values in the authoritative read.
- **When it is asked.** For a held target group that the sender's cache no longer names, or for a MUST_RELIST group. It runs from both the hold path and the domain wake, with one read in flight per recipient.
- **Return.** If the lifecycle owner says the group is ACTIVE again and the cache names it, it is re-attached as a new recipient with no cursor.
- **Witness S3-C** (one test, real lane):
  - a dead group pins the frontier;
  - cache omission alone detaches nothing (the authority says active);
  - the authority then records stopped, the group is DETACHED{lifecycle}, the frontier advances, owed rows go to 0, and later writes drain, all without a restart.
- **Deviation.** The "at capacity, retiring write admitted through the reserve" step is missing because Part B is not built.

## Part D — MUST_RELIST

- **Bound.** `RELIST_LAG_ROWS` = OWED_MAX_EVENTS / 2 = 2048.
  - A recipient that is still in the frontier is at most 2048 behind.
  - Owed rows therefore stay at most 2048 + ACK pipeline (2×256) + one burst between drives, which is under 4096.
- **Marking.** At each frontier computation, and only while owed > bound (one bounded COUNT per target).
- **Effect.** The recipient stays required and keeps being shipped to; the ledger reclaims past it. Its next range answers a gap and it lists once. It rejoins the frontier on confirm. No clock is used.
- **Flapping.** One re-list per more-than-2048 rows of lag.
- **Re-list cost.** One image in flight per (cache, partition), at most 65 536 rows and 16 MiB. A larger image is refused with a typed error. Retries are paced at 500 ms or the leader's hint.
- **Recipient-side staleness.** The cell is GAP/UNKNOWN and exposes `sourceOrder.positionOf(partition)`.
  - NOT DONE: wiring that state into the freshness/observation waits (awaitProjectionAt and the cache-visibility waits). Those waits already stay open while the row is absent, but no "currency-required" read refuses on GAP yet. This is open.
- **Witness S3-D** (real lane):
  - a refusing recipient sees 2560 commits;
  - maximum owed stays under 4096, so no capacity refusal occurs;
  - the recipient is MUST_RELIST and the ledger is reclaimed past it;
  - on return there is exactly one re-list (the real hydration image), it streams again, and the recipient's rows equal the source table.

## Part B — admission reserve: NOT BUILT

- **Why it is blocked.** System-table lifecycle writes (nodes and services via NodesOwner/ServicesOwner, gateway, CDC integration, SQL engine) reach the partition as TX1 PREPARE commands. Their bytes are pinned by partition-participant-transaction-bytes.js, which is another active writer's area (operations = {entryId, sql, params}). A typed intent can reach `admitCdcOwedWork` only by:
  - adding a field to the pinned PREPARE bytes and their admission (`isPinnedParticipantCommand`);
  - threading it through the SQL engine write plan (sql-query-engine-write-execution.js and distributedWriteCoordinator), the CDC integration executeSQL option pick-lists and the gateway;
  - declaring it at NodesOwner (terminal transition and removeTerminalNode) and at the services owner.

  Classifying by SQL text is forbidden, and so is adding the field without the pinned bytes.
- **What is in place.** The constant `OWED_RETIREMENT_RESERVE_EVENTS` = ACK_BATCH_MAX_EVENTS (256), with its justification. One ack batch drains it; it covers a node's retirement rows; the ledger worst case grows by 6%.
- **Needs an owner decision:** whether the participant-transaction owner adds a typed `cdcAdmissionClass` to PREPARE.
- **Consequence.** With C and D, a dead recipient can no longer drive the ledger to the cap. The cap is still reachable when there is no subscriber or when acks stall.

## Selection churn (fixed)
- **Where.** message-group-selection.js. Both resolvers honour `options.boundService` by one rule: the service is registered and live. The sync resolver names it by identity; the async resolver uses it while it is ready.
- **Subscriber.** It binds the service its delivery used.
- **Witness.** The rules diverge without the binding (sync picks the relay, async picks the leader). With it, the delivery service and the lane's comparison agree on every pass, and the binding rebinds only when the bound service stops being live.

## Transition record (moved / owners)
- **Recipient start position.** Previously none (the HLC merge, plus 5 s/30 s sweeps and a one-shot catch-up). Now the cache source-order owner (cell) and the message-group range owner (decision at apply).
- **"May I skip"** moved from the HLC merge to the position cell. The merge remains the guarantee for unranged paths.
- **Invariants:**
  - position compared only within one incarnation;
  - rows and position read in one leader span and installed in one span;
  - a gap is never merged;
  - a member at or below the position is refused before the merge;
  - the frontier moves only on committed or already-applied receipts, lifecycle evidence, or the row-lag bound.
- **Named states:**
  - cell: UNKNOWN / CURRENT / GAP;
  - relist: IDLE / RUNNING / NO_RELISTER, with outcomes RETRY / STOPPED;
  - recipient: CONFIRMED / SUBSCRIBER_UNCONFIRMED / POSITION_GAP / MUST_RELIST / DETACHED{lifecycle};
  - lifecycle: ACTIVE / RETIRED / NOT_ESTABLISHED / UNAVAILABLE;
  - durable range decision: APPLY / GAP / ALREADY_APPLIED;
  - selection: BOUND_READY / BOUND_NOT_READY.
- **Recovery:** list on gap; re-attach on ACTIVE evidence; tenure reset rebuilds cursors (the probe re-confirms).
- **Removed:** system-table-cache-source-order.js, the positionless durable CDC_BATCH, and durable single CDC commands.

## R09 supersession texts (also in the design note, S3.3)
- **D1 is not superseded.** A separate record holds the probe.
- **O-C:** chosen in the built form. "absorbed by the merge" → "dropped by position; merge retained for unranged paths".
- **§5.2 / §5.6:** DETACHED is approved by the owner ruling and built with lifecycle evidence, plus MUST_RELIST. Still no deadline and no permanent refusal.
- **Amendment B:** the module is deleted and its rule is kept as the within-entry rule.
- **§6.2:** "a gapped follower still merges" is withdrawn.
- **C1 race cell:** above.
- **OWED_MAX_EVENTS:** unchanged as the capacity of ordinary writes; a single recipient's share is now at most RELIST_LAG_ROWS.
- **RETAINED_DELIVERED_MAX:** unchanged.

## Timers and sweeps
- **New:** none. The relister uses the existing delayUntilShutdown.
- **Redundant by construction for the joiner window** (follow-up deletions, not done: control-plane and bootstrap files outside my scope, and the lab must confirm): C5 (5 s fast cooldown), C8's window-closing role, and the joiner-window purpose of C6/C7.
- **C4** (handler out-of-order warning): still reachable for unranged ingress; kept.

## Aggregate bounds per node
- **Lane:** one in-flight vector per (led source partition × recipient). Each is bounded by SHIP bytes, except a singleton, which ships alone. Plus one lifecycle read per held target.
- **Ledger:** below OWED_MAX_EVENTS; at most RELIST_LAG_ROWS per recipient; plus RETAINED_DELIVERED_MAX and two one-row records.
- **Recipient:** one image per (cache, partition), each at most 65 536 rows / 16 MiB.
- **Not node-wide bounded:** the product of partitions × recipients × vector bytes, and concurrent images across partitions.

## Lab run needed (integration owner)
Fresh three-host formation without the 400 ms loop. Measure:
- per-table owed depth over time;
- POSITION_GAP and list counts per joiner per table (expected about one per table, then none);
- joiner cache equal to the source with no sweep repairs (the C5/C6/C7 counters should be zero for the joiner window);
- MUST_RELIST and DETACHED occurrences;
- seed CPU and event-loop delay;
- image sizes;
- receiver proposal-queue depth.

Also run the broad suite (I ran only directly affected files), including all composition/integration tests that compose message groups without a CDC integration service. Any such test now needs positionRecipients/registerLeaderRelister (test/test-helpers/cdc-source-range-fixture.js).

## Open
1. Part B (above).
2. Freshness waits do not yet refuse on GAP/UNKNOWN for currency-required reads.
3. A backup restore keeps the incarnation while rewinding positions; the restore owner must re-mint it.
4. A new member of an existing group with an UNKNOWN cell learns it is stale only at the group's next committed range.
5. Images above the bound are refused and leave the recipient gapped; no chunked image exists.
6. leader-fallback test (pre-existing by reading).
7. audit:file-size is red (source 24 > 21, test 22 > 21) from other writers' files. None of my files is over its threshold.
8. Independent verification of this change is owed.

---
# Follow-up round (coordinator, 2026-11-11 afternoon)

## 7. cdc-initial-subscription-leader-fallback — resolved, not by me
- Checked against the committed base in a scratch copy made with `git archive HEAD` (no git state changed). Through the project runner (`scripts/run-test-files.js`) it passes 5/5 at base and 5/5 on the current tree. Under bare `node --test` all 5 are skipped at both base and tree, because the runner supplies the environment.
- The 3 failures I saw earlier were in the working tree's half-migrated version, which mocked `seedCacheHydrationPhase.propagatePartitionCDCEvent`. The file was changed at 15:55, apparently by the triage agent; it now uses the one propagation seam (`latencyTopology.cdcGroupPropagationService`) and passes. No product defect.

## 6. Repair counters on the compensations — built
- `CDC_CATCHUP_TRIGGER {JOIN_CATCHUP, PUBLICATIONS_SWEEP, PROPAGATED_SWEEP_FAST, PROPAGATED_SWEEP}` lives in cdc-integration-service-authoritative-catchup.js.
- `recordCatchupRepairs` counts per trigger `{runs, repairingRuns, rowsApplied, rowsSwept}` on `service.catchupRepairCounts`. It logs a WARN "CDC catch-up repaired cache rows (a compensation found a difference)" only when rows changed.
- Callers now pass their trigger:
  - membership-publication-coordinator-reconcile.js: the publications sweep (5 s), and the propagated sweep (5 s fast vs 30 s, chosen by the resolved cooldown; the 30 s constant is now exported from -helpers.js);
  - node-joining-ready-signal-readiness.js: the join catch-up.
- Witness test/cdc/cdc-catchup-repair-counter.test.js: a run with no change counts a run and no repair; a changing run counts and logs a repair under its trigger.
- Lab: grep for that WARN per trigger. Zero over a formation soak is the deletion evidence.

## 5. New group member, prompt re-list — built
- `requireSourcePositions(service)` (message-group-cdc-source-range.js) is called at message-group replica initialization (one line in message-group-service-raft-lifecycle.js; this is outside the CDC files, kept minimal).
- For every CDC-propagated source the node's cell holds no position of, `SystemTableCacheSourceOrder.requireListed` marks it GAP and owes a list. A positioned node lists nothing.
- If no relister is registered yet (seed bootstrap), the cell waits as NO_RELISTER; registering the relister lists every GAP cell.
- Witness test/message-group/message-group-cdc-member-relist.test.js: a real replica on a quiet table, no range delivered, each source listed once, and a positioned source is not listed again.
- Mutations, both kill the witness: the call removed; the position check removed.
- Lab: each node now lists up to ~10 propagated tables at its first group initialization. That is the same load as the C8 catch-up.

## 3. Currency-required reads on a gapped cell — built
- Census of currency-requiring cache readers: `awaitProjectionAt` (the one projection wait), with production callers table-creation-service-durable-job.js:27 and runtime-access-policy-owner.js:627.
  - Its upsert branch proves itself: the row carries the write's origin.
  - Its deletion branch took absence as proof, which is the hazard on a stale cache.
  - The cache-visibility waits/repairs read the authority, not the cache, so they are unaffected.
  - Every other cache read is an ordinary projection read and is unaffected.
- Rule: absence proves a deletion only when the table's source cell is CURRENT. Otherwise the wait stays open; it is visible in the projection wait diagnostics and its start log.
- Wake: `SystemTableCacheSourceOrder.onCurrent`, which also fires for an image install that changed no row.
- Tables without a cell, and caches without a source-order owner, behave as before. The wait never answers a write or an admission.
- Witness test/cdc/cdc-projection-wait-source-currency.test.js (2 tests): a gapped deletion wait stays open, then the install answers it; an upsert wait is unaffected.
- Mutations, both kill it: absence on a non-current cell accepted; the wake removed.
- Existing tests cdc-projection-wait-observable and write-then-read-projection-census pass.

## 4. Backup restore and the ledger incarnation — finding; no code
- Restore owner: BackupRestoreOwner.restoreFromBackup → `hydratePartitionSnapshots` port. In production that port is bound to `NULL_PORT` (management-v1-owner.js:275), so `capabilitySupported` is false and restore is refused (BACKUP_CAPABILITY_UNSUPPORTED). No production path rewinds a live partition's ledger today.
- A log rebuilt from fresh storage already mints a new incarnation at its first recording.
- I did not add a re-mint helper with no production caller (it would be dead code).
- Contract recorded in the design note: whoever binds the restore port must mint a new ledger incarnation in the same restore transaction.
- The recipient side of an incarnation change is witnessed: S3-3, where a rebuilt log's ranges gap, re-list and converge, and none skips.

## 1. Part B admission reserve — NOT built in this round (traced, design ready)
Traced write path of a lifecycle write. Each hop below must carry a typed `admissionClass`; several hops build their options from explicit pick-lists, so each needs an edit:
1. NodesOwner/ServicesOwner/message-groups owner retirement methods
2. SystemMetadataOwnerBase.executeMutation (spreads options)
3. gateway submitMutation → `cdcIntegrationService.updateSystemTableRow(deliveryOptions)`
4. cdc-integration-service-mutation-operations (explicit executeSQL option pick-list)
5. writeRouter
6. cdc-routed-mutation-readiness `executeSQLViaQueryEngine` (builds its own query options; ~700 lines)
7. SQL engine write execution → the TX1 transaction
8. decision protocol runPrepareStage → `prepareParticipant(sessionId, partitionId, identity)`
9. sql-query-engine `deliverTransactionOperation` / `participantTransactionRequestOf` (closed request)
10. partition-participant-transaction-request.js `sealSession` → `buildPrepareCommand`
11. the bytes pin (`isPinnedPrepare`, which needs the new field)
12. `admitCdcOwedWork`: for a PREPARE with RECIPIENT_RETIREMENT, capacity is OWED_MAX_EVENTS + OWED_RETIREMENT_RESERVE_EVENTS, logged with the owed depth

The entry-side enforcement must be a brand minted only by the lifecycle owner module; over the wire it is a closed enum.

Not done because the remaining budget could not cover 12 hops across query, coordinator and participant owners, plus the full-stack witness (lifecycle owner → partition through the real SQL engine and 2PC) the coordinator asked for, at the quality the other parts have. This is the next unit.

Bounds today for the other two causes that can fill the ledger:
- **No propagation subscriber:** the named DRIVE state NO_PROPAGATION_SUBSCRIBER exists, with the log "CDC obligations owed on a propagated table with no propagation subscriber" (once per tenure). The deferred attachment is retried on message-group init/leader election. It is bounded only by OWED_MAX_EVENTS.
- **Stalled acknowledgements:** FLUSH states REFUSED / OUTCOME_UNKNOWN / PROPOSER_UNAVAILABLE / NOT_LEADER and DRIVE ACKNOWLEDGEMENT_BACKPRESSURE, each logged. Also bounded only by OWED_MAX_EVENTS; the reserve (when built) is what lets retirement writes through.

No new state added.

## 2. Chunked re-list — NOT built (design)
- Images above 65 536 rows / 16 MiB are refused (`partition_hydration_image_exceeds_bound`). The recipient stays GAP and the relister retries every 500 ms, so it is permanently gapped for such a table.
- Proposed design: a position-pinned paged image. The leader serves pages keyed by (incarnation, appliedIndex P, after-key) from a read transaction held open per image session, with a lease bounded by pages and time. When the leader cannot hold it (leader change, lease expiry, or the connection releasing the read), it answers a typed `partition_hydration_image_expired`. The recipient stages pages and installs rows plus position in one span only when the final page arrives; a restart begins from page 1. Pacing comes from the receiver's own request cadence.
- Witnesses owed: a multi-page table equals the source; a leader change mid-image restarts and converges; a concurrent stream applies after P.

## Files touched in this round
- src: cdc-integration-service-authoritative-catchup.js; membership-publication-coordinator-reconcile.js (+ -helpers.js export); node-joining-ready-signal-readiness.js; cdc-integration-service-projection-wait.js; system-table-cache-cdc-observation.js (requireListed, onCurrent); message-group-cdc-source-range.js (requireSourcePositions); message-group-service-raft-lifecycle.js (1 call)
- tests: cdc-catchup-repair-counter.test.js, cdc-projection-wait-source-currency.test.js, message-group-cdc-member-relist.test.js (new); membership-publication-deferred-catchup.test.js (trigger pinned in the option shape)
- Re-run green: membership deferred catch-up, publications leader-pinned, node-joining catch-up wiring, projection wait observable / census, receiver admission, W7, custody, raft-replication-and-cdc, failover continuity, source-relist, vector equivalence. Lint clean.
