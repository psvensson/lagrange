---
audience: development
documentClass: evidence
---

# Census: legacy volatile CDC, legacy transport, second leadership-transfer caller, hand-written owner doubles (2026-10-24)

Read-only census. Subject: lineage worktree
`/mnt/data/peter/projects/.worktrees/mg-delivery-resume-r2-20261023`.

- Code read at `a334068f3`. The lineage head moved to `b42dfd45c` during the
  census. `git diff a334068f3 b42dfd45c` touches **no file under `src/`**. The
  test delta is the cluster-P fixture repair `3829a3c3b`. My scratch run tree was
  `a334068f3` plus that exact staged patch. I compared all 16 test files with
  `cmp` against `b42dfd45c` and they are byte-identical. So every src line
  number here and every test verdict holds at `b42dfd45c`.
- Runs used a detached scratch worktree under the scratchpad, with
  `node_modules` symlinked. Each run was a single test file, one at a time.
  Probes were throw-away copies inside the scratch tree. Nothing in the lineage
  or in `/mnt/data/peter/projects/lagrange` was edited.
- An earlier stream already classified the dead-behaviour tests:
  `solve/quests/retained-seed-original-handoff/evidence/VERIFY-partition-admission-fixtures-r1-2026-10-24.md` §F3.
  I re-derived each verdict from src and from runs, and I say where I agree and
  where I add to it.

Owner directive applied: no legacy; exactly one version of any logic
(memory `no-legacy-one-version-of-logic`; quest log
`retained-seed-original-handoff/log.ndjson:85`).

---

## 0. Headline findings

1. **The volatile partition CDC emitter is unreachable in production.**
   `generateCDCEvent` has one src caller, `partition-service-write-metrics-base.js:691-702`.
   It is gated on `sideEffectPlan.emitCdcEntry`, and that field is `null` on
   every path:
   - `partition-write-kernel.js:543` and `:566`
   - `partition-service-raft-write-commit.js:216`, which overrides it again

   `cdcEventBuffer.buffer()` has only two src writers. Both are inside
   `generateCDCEvent` (`partition-service-cdc-stream-base.js:95` via
   `bufferCDCEventWithoutSubscribers`, and `:168/:206` via
   `bufferCDCEventForRetry`). **So the in-memory backlog buffer is always empty
   in production.** Backfill catch-up, buffered replay and the replay timer are
   therefore dead too.
2. **The sliding-window catch-up is LIVE and is a second catch-up owner.**
   The wrapper records every acknowledged durable event in the volatile
   sliding window (`partition-cdc-delivery.js:521`, `recordDelivered`). A new
   subscriber's handshake then re-delivers up to the window's capacity of those
   already-acknowledged events (`:636-667`). This bypasses the obligation
   ledger. Its per-event `deliverCapturedCdcEvent` is a fresh delivery context
   outside the lane's ordering. The ledger's own `SUBSCRIPTION_HANDSHAKE` drive
   (`:716`) is the owner of catch-up.
3. **The owner's own unit suite is red because its subscriber double predates
   the receipt contract.** `test/partition/partition-cdc-obligation.test.js`
   fails 10/20 at the lineage head (O3, O4, O5, O6, O8, O9, O10, O11, O14, O17).
   - Its `recordingSubscriber` (`:70-91`) returns `undefined`.
   - Since `681da1dc1` (2026-10-23), `assertSubscriberAcceptance`
     (`partition-cdc-delivery.js:79-89`) refuses any durable answer that is not a
     `cdcCommitted` receipt.
   - The test was last touched in `4151a3ab4`.
4. **The table CDC policy is enforced only on the dead path.** Probed at the
   head: a write with no subscriber records one **owed** obligation, and the
   volatile buffer stays at 0. This held for each of:
   - a user table with `externalCdcAllowed:false`
   - `sql_write_operations`
   - `logs`

   `shouldBufferCdcWithoutSubscribers`, `cdcEventHasNoAudience` and
   `CDC_NO_SUBSCRIBER_BUFFER_SUPPRESSED_TABLES` are consulted only by
   `generateCDCEvent`. The durable recorders
   (`partition-cdc-obligation.js:123-174`) apply no policy. Two things are
   unknown:
   - whether production attaches subscribers for those tables
   - whether owed rows for them are ever retired

   **This is an owner decision, not a deletion.** partition-service #23 and #24
   and log-suppression #86 pass vacuously against the dead buffer while the live
   owner records the obligations they say are suppressed.
5. **Admin readiness reads constant-zero volatile counters.**
   - `admin-service-discovery-readiness-context-methods.js:637-650` reads
     `bufferedEvents` and `bufferReplayInFlight` and marks a partition
     "buffered".
   - `admin-control-snapshot-local-diagnostics-methods.js:143-160` reads
     `bufferedEvents` as `catchupLagEvents`.

   Both are always 0/false, so both cannot see real durable CDC debt (owed
   obligations).
6. **The leadership-transfer single-path witness W5 is red at the head.**
   `test/raft/leadership-transfer-single-path.test.js` fails "one partition
   issuer and one caller of it". The second caller is
   `src/node/replica-handler-participant-cutover.js:239`, added by `4151a3ab4`
   ("Ephemeral exact-byte proof snapshot only; not reviewed or landed").
7. **The legacy transport stack has no production constructor.** That stack is
   `WebSocketTransport`, `WebSocketTransportProvider`, `TransportProvider`,
   `TransportRegistry`, `ConnectionPool` and `RouterMessageHandler`.
   - All of it is exported publicly through `src/transport/index.js:5-44`, then
     `src/public-api.js:23`, then `package.json` `"."`.
   - The only producer of inline-ACK payloads is
     `websocket-transport-messages.js:30-45`.
   - So `hasInlineAckPayload` (`message-router-pending-response-ledger.js:484-495`)
     and `completeRemoteDelivery`'s INLINE_ACK branch
     (`message-router-delivery-behaviors.js:439-445`) are reachable only from a
     legacy peer.
8. **The non-durable branch of `CDCGroupPropagationService.propagateCDCEvent`
   is unreachable from production producers.** The branch is
   `cdc-group-propagation-service.js:213-~330`, plus `propagateSafe :414`, the
   immediate-batch maps and the background-retry maps.
   - Its only callers are the two `propagatePartitionCDCEvent` wrappers:
     `seed-runtime-bridge-owner.js:200-215` and
     `node-joining-publication-activation.js:719-729`.
   - Both carry partition subscriber events, and those are always durable.
   - The durable wave says so itself: "No durable payload enters the existing
     immediate-batch or background-retry maps" (`cdc-group-propagation-durable-delivery.js:1-3`).
   - This is also the root cause the verifier left unknown for
     `seed-teardown-pending-cdc-delivery` (see §1.4).

---

## 1. Family 1: volatile CDC emission

### 1.1 Durable owner (the one version to keep)

| Concern | Owner (file:line) |
| --- | --- |
| Record obligation at committed apply (statement) | `src/partition/partition-cdc-obligation.js:123` `recordCommittedStatementCdc` (called `partition-service-entry-apply-base.js:656`) |
| Record obligation at committed apply (participant decision) | `partition-cdc-obligation.js:146` `recordCommittedOperationCdc` (called `partition-participant-transaction-apply.js:373`) |
| Ordered delivery lane, retry, ack batching (`CDC_DELIVERED`) | `src/partition/partition-cdc-obligation-delivery.js` (`deliverObligation :469-497`, `drivePrecondition :500`, `scheduleDeliveryRetry :440`) |
| Event build from obligation | `partition-cdc-obligation-delivery.js:180-192` `eventOf` (adds `eventKey`/`entryId`/`logIndex`/`ordinal`, so always durable) |
| Receipt contract | `src/cdc/cdc-delivery-outcome.js:308-320` `isCommittedCdcOutcome`, builder `:239` `buildCommittedCdcOutcome`; gate `partition-cdc-delivery.js:79-89` `assertSubscriberAcceptance` |
| Catch-up for a new subscriber | `partition-cdc-delivery.js:716` `driveCdcObligations(SUBSCRIPTION_HANDSHAKE)` |
| New-leader redrive | `partition-cdc-delivery.js:170-173` (`LEADER_ELECTED` handler) |
| Shutdown custody | `partition-service-cdc-stream-base.js:225` `trackPendingCDCEvent` (live: `partition-cdc-obligation.js:167`, `partition-cdc-obligation-delivery.js:136`, `cdc-delivery-invocation.js:274`) |

History of the cutover:
- `4151a3ab4` (2026-10-12, an unreviewed snapshot) introduced the ledger and
  lane, and nulled `emitCdcEntry` (comment `partition-write-kernel.js:532-537`:
  "the old volatile emission would create a second retry owner").
- `681da1dc1` (2026-10-23, WIP) added the receipt gate
  (`assertSubscriberAcceptance`, `deliverCapturedCdcEvent`).
- On origin/main `emitCdcEntry` is still `executedEntry` (verifier F3,
  `partition-write-kernel.js:435` there). So main still runs the volatile path
  and the lineage does not.

### 1.2 Symbol inventory: definition, src callers, production reachability, durable equivalent

Reachability is traced from the write entry points: `insertData` / `executeQuery`
-> `startAdmittedPartitionWrite` -> committed apply
(`partition-service-raft-write-commit.js:205-220`, `applyCommittedWriteSideEffects`)
-> `applyWriteSideEffectPlan`. It is also traced from the three bootstrap
subscription sites. Grep alone was not used to decide reachability.

| # | Symbol (definition) | src callers | Production reach | Durable equivalent / action |
| --- | --- | --- | --- | --- |
| V1 | `generateCDCEvent` `partition-service-cdc-stream-base.js:129-219` | `partition-service-write-metrics-base.js:693` only | **DEAD**: guarded by `sideEffectPlan.emitCdcEntry`, always null (`partition-write-kernel.js:543,566`; `raft-write-commit.js:216`) | `recordCommittedStatementCdc` + lane. Delete V1 and the guard `:691-702` |
| V2 | `emitCdcEntry` plan field `partition-write-kernel.js:543,566`; override `partition-service-raft-write-commit.js:214-217` | consumer `write-metrics-base.js:691` | always null | Delete the field from the plan shape |
| V3 | `bufferCDCEventWithoutSubscribers` `cdc-stream-base.js:91-112`; `cdcEventHasNoAudience :119-122` | V1 only (`:155,:174`) | DEAD | none (policy question, §0.4) |
| V4 | `cdcEventBuffer` field `partition-service-core-base.js:156` (class `src/partition/cdc-event-buffer.js:91-257`) | writers: V1/V3/V5 only. Readers: `partition-cdc-delivery.js:375,412-461,573-671,769`; `partition-service-lifecycle-methods.js:144` | buffer **always empty**; sliding window **live** (V9) | ledger (`countCdcObligations`, `readOwedCdcObligations`) |
| V5 | `bufferCDCEventForRetry` `partition-cdc-delivery.js:328-360` (+ delegate `cdc-stream-base.js:556`) | V1 only (`cdc-stream-base.js:168,206`) | DEAD | lane retry `scheduleDeliveryRetry` |
| V6 | `scheduleBufferedCDCReplay` `partition-cdc-delivery.js:364-401` (+ `cdc-stream-base.js:565`) | V5, V7, handshake `:713` | called, but a no-op (buffer empty, `:375`) | lane retry timer |
| V7 | `flushBufferedCDCEvents` `partition-cdc-delivery.js:408-463` (+ `cdc-stream-base.js:575`) | V6 timer only | DEAD | lane drive |
| V8 | Handshake **backfill** `partition-cdc-delivery.js:573-632` (`CATCHUP_MODE_BACKFILL`, `CDC_CATCHUP_STARTED/COMPLETED` emits `:586,:677`) | `subscribeToCDCWithHandshake` | DEAD (needs `cdcEventBuffer.size()>0`) | `driveCdcObligations(SUBSCRIPTION_HANDSHAKE)` `:716` |
| V9 | Handshake **sliding window** `partition-cdc-delivery.js:633-667`, fed by `recordDelivered` in wrapper `:521` (`cdc-event-buffer.js:218-256`) | every subscription with a new wrapper | **LIVE**: re-delivers already-acknowledged durable events to a new subscriber outside the ledger; a refusal throws out of the handshake into the bootstrap caller | delete; the ledger drive is the only catch-up. (Acked events are not owed: whether a late subscriber needs history is a snapshot/hydration question, not CDC) |
| V10 | `subscribeToCDC` fire-and-forget `partition-cdc-delivery.js:723-730` (+ `cdc-stream-base.js:630`) | none in src (the `subscribeToCDC(tableName)` calls in bootstrap are the **message-group** method, `message-group-service-cdc-replication-runtime-methods.js:84`) | test-only | `subscribeToCDCWithHandshake` |
| V11 | Null-context plain-callback delivery `partition-cdc-delivery.js:487-499` (`deliveryContext === null` arm, `subscriber(cdcEvent)` with no context) | only for non-durable events (`:488`) | DEAD for partition sources (every lane event is durable). The context-less branch of the production subscriber `partition-cdc-propagation-subscriber.js:220-222` (`wait` with null) is dead for the same reason | always a `cdc-delivery-invocation` context |
| V12 | Object-subscriber shape `handleCDCEvent` `partition-cdc-delivery.js:145-149,496` | production subscriber is a function (`partition-cdc-propagation-subscriber.js:220`) | test-only for partition sources (`recordingSubscriber`). `live-query-group.js:389` and `cli/core/cdc-stream-handler.js:149` are unrelated client caches, not partition subscribers | one subscriber shape (function + `canAcceptCDCEvent`) |
| V13 | `PartitionCDCGenerator` volatile half: `cdcSubscribers :96`, `subscribe :112`, `unsubscribe :124`, `getSubscriberCount :104`, `generateEvent :137-170`, `deliverEvent :466-497` (`partition-cdc-generator.js`) | none (src uses only `resolveEventEnvelope`/`hydrateEventEnvelope`/`buildEvent`/extractors via `syncCDCGeneratorDependencies` `cdc-stream-base.js:261`, `partition-cdc-obligation.js:97,126`, `seed-retained-partition-effects.js:158`) | DEAD (a third subscriber set and a third delivery loop) | the generator keeps only event building |
| V14 | Volatile counters/timers: `cdcBufferReplayTimer/InFlight/DelayMs`, `cdcReplayBufferGrowthCount`, `cdcReplayRetryDepth` (`core-base.js:157-162`; reset `partition-service-lifecycle-methods.js:51-55,213-216`; status `:144-148`) | V5 to V8 | constant values | lane diagnostics `getCdcObligationDiagnostics` |
| V15 | `getCDCSubscriptionDiagnostics` `bufferedEvents`/`bufferReplay*` (`partition-cdc-delivery.js:752-775`) | **production consumers** `admin-service-discovery-readiness-context-methods.js:631-650`, `admin-control-snapshot-local-diagnostics-methods.js:72-76,138-160` | live consumers of constant 0/false (§0.5) | migrate both consumers to owed-obligation counts (`countCdcObligations`) / `getCdcObligationDiagnostics()`; then delete the fields |
| V16 | Handshake `catchup.{mode,bufferedEventsAtHandshake,bufferedEventsReplayed,slidingWindowEventsReplayed}` | logged at `bootstrap-service-replica-registration-methods.js:248-249`, `node-joining-publication-activation.js:336-337`, `phases/seed-cache-hydration-cdc-subscription.js:120-122`, `partition-cdc-delivery.js:704` | log-only | handshake answers status/epoch only |
| V17 | Constants: `PARTITION_SERVICE_CDC.CATCHUP_MODE_*`, `STREAM_MODE_*`, `REPLAY_REASON_BUFFERED_REMAINING` (`partition-service-constants.js:337-343`); `CDC_BUFFER_REPLAY_*` defaults `:39-40` (also used by the lane, so keep the max delay or move it to `PARTITION_CDC_OBLIGATION_BOUND`); `GENERATE_CDC_EVENT_CALLED :496`; log msgs `:504-518`; `PARTITION_CDC_DELIVERY_LITERAL` `partition-cdc-delivery.js:42-49`; `CDC_NO_SUBSCRIBER_BUFFER_SUPPRESSED_TABLES :50` | the above | follows the above | |
| V18 | `isExternalCdcAllowedForTable`/`shouldBufferCdcWithoutSubscribers`/`parseExternalCdcAllowedOverride` (`partition-cdc-delivery.js:114-140,288-317`; delegates `cdc-stream-base.js:526-544`) | V3/V5 only | DEAD at the partition (the policy owner `src/cache/cdc-table-policy.js:539` stays) | owner decision (§0.4) |
| V19 | `buildEventIdentity` (`cdc-event-buffer.js:42`) | **live**: `src/cdc/cdc-event-envelope.js:2,68,139` (envelope capture) and `partition-cdc-delivery.js:599,640` | live | **move** to the envelope owner (`src/cdc/cdc-event-envelope.js` or a `src/cdc/` identity module) before deleting `cdc-event-buffer.js`; `buildInternalCoalescingIdentity :66` is dead with the buffer |

Further legacy reached from the same root, outside the partition source:

| # | Symbol | Reach | Note |
| --- | --- | --- | --- |
| V20 | `CDCGroupPropagationService.propagateCDCEvent` non-durable branch `src/topology/cdc-group-propagation-service.js:213-~330`, `propagateSafe :414-~470`, immediate batch `cdc-group-propagation-delivery-methods.js:193-355`, background retry `:356-603`, `deliverToTargets :678` | **unreachable from production producers** (§0.8); the only `.propagateCDCEvent(` callers are the two wrappers, both fed by partition subscribers | Its owner is `propagateDurableCdcEvent` (`cdc-group-propagation-durable-delivery.js:176`). A deletion here is its own unit. |
| V21 | Message-group receiver non-durable branch `applyCDCBatch` (`message-group-service-cdc-replication-runtime-methods.js:175` onward) and `applyCDCEvent` | **LIVE**: seed cache hydration applies snapshot rows non-durably, `phases/seed-cache-hydration-phase.js:415` (`leaderMessageGroup.applyCDCEvent(tableName, INSERT, row)`). Remote ingress non-durable handlers (`message-group-service-cdc-propagation-runtime-methods.js:128,165,252,282,294`) are reached only if a peer sends non-durable payloads, which V20 being dead implies does not happen in production. Not proven, because mixed-version peers are not modelled. | NOT deletable before hydration has an owner (hydration is state transfer, not CDC). Unknown: whether hydration should become a durable or snapshot path. C1 owns these files (§1.6). |
| V22 | `seed-runtime-bridge-owner.js:200-204` `getCompatibilityOverride('propagatePartitionCDCEvent')` (13 `getCompatibilityOverride` sites in `src/bootstrap/owners/`) | not censused | a compatibility-override seam; recorded here only as an observed legacy class |

### 1.3 Tests: verdicts

Runs are at the head test state (`b42dfd45c`-equivalent). "Mine" means re-derived
from src plus a run, or a probe where stated. The verifier column is
`VERIFY-partition-admission-fixtures-r1` §F3.

| Test | Run result | Verifier | Mine | Basis |
| --- | --- | --- | --- | --- |
| partition-service #25, #27, #28, #29, #30 (`test/partition/partition-service.test.js:1158,1237,1277,1325,1377`) | red | REWRITE | **CONFIRM REWRITE**. CDC generation is live; the volatile semantics are dead | Probe on #25 with admission resumed: the subscriber saw `INSERT:durable` twice and never the UPDATE. Lane `lastDrive.state = held_by_subscriber` on the INSERT event key, `retryArmed:true`. The plain callback returns `undefined`, `:79-89` refuses it, and the ordered lane blocks the later events (`partition-cdc-obligation-delivery.js:466-468` (`deliverObligation :469`)). Rewrite: resume admission, subscriber answers `buildCommittedCdcOutcome`, await `pendingCDCEventDeliveries`. The probe file also hung after the asserts (shutdown or retry timer); cause not traced, **unknown**. |
| partition-service #22 (`:1011`) | passes | needs acknowledging subscriber | **CONFIRM**: passes only because the callback pushes before its refusal | same mechanism |
| partition-service #23, #24 (`:1048,:1101`) | pass | not classified | **NEW: vacuous.** They assert `cdcEventBuffer.size()===0` (always true). The live owner records an owed obligation for exactly these tables (§0.4 probe) | owner decision on the policy, then rewrite against `countCdcObligations` |
| size-split #2 (`partition-service-size-split-transport.test.js:171`) | red | Mixed | **CONFIRM mixed.** The `cdcEventBuffer.size()===1` assertion is dead. The replay assertions pass only because each redelivery pushes into `delivered` before refusal (`undefined` answer); the retry is the lane's, not the buffer's | probe with admission resumed: only the `:213` buffer assert fails |
| size-split #14 (`:784`) | red | REWRITE | **CONFIRM REWRITE**: `subscribeToCDC` is fire-and-forget (V10) and delivery is async | probe: `cdcEvents.length` 0 at `:814` with admission resumed |
| size-split #1 (`:115`) | passes | not classified | **NEW: vacuous.** It overrides `partition.generateCDCEvent` to throw, and that method is never called (V1) | delete; the live equivalent is "a subscriber failure in the lane is not an unhandled rejection" |
| size-split #15, #16 (`:821,:878`) | red | cluster H | **CONFIRM not CDC.** Failure: "Replica transport handler left registered: the transport cannot prove handler identity" (`src/node/replica-transport-handler-identity.js:16`). It is a hand-written transport double lacking `unregisterExact` (§4) | |
| `test/partition/cdc-generation.property.test.js` (4 tests) | 4/4 red | REWRITE | **CONFIRM REWRITE**: plain `subscribeToCDC` callbacks (`:122,206,286,365`) | |
| `test/integration/cdc-subscription-catchup.integration.test.js` (2 tests) | 2/2 red | likely dead as written | **CONFIRM DEAD as written.** Test 1 needs `CATCHUP_MODE_BACKFILL` (V8, needs buffered events). Test 2 asserts the sliding window (V9) and `generateCDCEvent` recording (`:242,:477-552`). If V9 is deleted, delete both; the obligation catch-up property is already O8/O9 of `partition-cdc-obligation.test.js` | |
| `test/bootstrap/seed-teardown-pending-cdc-delivery.test.js` | red | UNKNOWN | **RESOLVED: dead as written.** With admission resumed (probe) the write succeeds, `propagation.immediateBatchEntriesByKey.size` is 0 and the lane is `held_by_subscriber`. Two reasons: (a) the subscriber `(cdcEvent) => bridge.propagatePartitionCDCEvent(sourceMessageGroup, cdcEvent)` (`:129-131`) drops `deliveryContext`; (b) durable events never enter the immediate-batch map the test waits on (`cdc-group-propagation-durable-delivery.js:1-3`, V20). The property "teardown completes with a pending durable delivery" is still real. Rewrite against the durable wave, with a context-passing subscriber and an acknowledging target. The probe run then hung (teardown or retry); **unknown** cause | |
| statement-admission A2 (`partition-statement-admission.test.js:183`) | red | dead | **CONFIRM dead, but NOT CDC.** Probe: `executeLocalQuery(TOP_THEN_ALLOCATE)` answers `participant_transaction_unreplicated_local_mutation` (`src/partition/partition-local-mutation-admission.js:28`, since `d35d8828c`), before the ROWID_CEILING layer. It belongs to the retired local-mutation family, not this one | |
| settled-replay W1-race (`settled-replay-preserves-result.test.js:295`) | red | dead | **CONFIRM dead, NOT CDC.** Answer `partition_write_cutover_paused` with `deferRetry:true`, `retryAfterMs:100` | |
| `test/partition/partition-cdc-obligation.test.js` | **10/20 red** (O3, O4, O5, O6, O8, O9, O10, O11, O14, O17), red both with and without the cluster-P patch | not classified | **NEW: owner suite red; rewrite the double.** `recordingSubscriber :70-91` (object shape, returns `undefined`) predates `681da1dc1`. `ackApply: 'not proposed'` because nothing is acknowledged. Fix: the subscriber answers `buildCommittedCdcOutcome(...)`. Also `:814,:864-877` read/write `cdcEventBuffer` (V9) | |
| `test/partition/partition-write-kernel.test.js` #5 (`:194-214`) | red | not classified | **NEW: asserts V2** (`emitCdcEntry: {...}`) | delete the field assertion with V2 |
| `test/partition/partition-participant-transaction-apply.test.js:658` | passes | – | restates the plan shape with `emitCdcEntry: null` | edit with V2 |
| `test/cdc/cdc-observability.test.js` #1 (`:36`, `cdcEventBuffer.buffer`, `generateCDCEvent :60-75`) | pass | – | **NEW: dead (V1/V4)** | delete or rewrite on lane metrics; #2 and #3 not inspected |
| `test/partition/partition-service-cdc-log-suppression.test.js` #86 (`:86-123`, overrides `cdcEventBuffer.buffer`, calls `generateCDCEvent`) | pass | – | **NEW: dead (V1).** Its policy is not applied by the live owner (§0.4). Other tests in the file call extractors (live, used by `buildEvent`) | |
| `test/partition/partition-service-shutdown-timers.test.js` (`:80,:132,:189` replay timer; `:222` tracks a `generateCDCEvent` promise) | pass | – | **NEW: dead (V6/V14/V1).** The `:222` property (shutdown awaits a tracked delivery) is live but proven through a dead producer; rewrite with a lane drive | |
| `test/partition/cdc-subscriber-registration-timing.test.js` (5 tests, `:86-353`) | pass | – | **NEW: dead (V8)**: they fill the buffer by hand | delete |
| `test/partition/cdc-buffer-replay-robustness.test.js` (6 tests, `:84-412`) | pass | – | **NEW: dead (V5 to V8, V14)** | delete; the retryAfter-hint properties exist on the lane (`scheduleDeliveryRetry :440-446`), so keep or port them as lane tests |
| `test/partition/cdc-sliding-window-catchup.{preservation,exploration}.test.js` | pass | – | **NEW: assert V9/V5** | delete with V9 |
| `test/partition/cdc-event-buffer.test.js`, `cdc-event-buffer.property.test.js` | pass | – | **NEW: unit tests of V4** | delete; move `buildEventIdentity` coverage to the envelope owner |
| `test/partition/partition-cdc-generator.test.js` (`generateEvent :96-238`), `extracted-module-api-equivalence.property.test.js:143,357` | pass | – | **NEW: test V13** | delete the delivery half; keep the build/extract assertions |
| `test/integration/cdc-bootstrap-control-plane-pressure.integration.test.js:326-330` (`bufferCDCEventForRetry`) | pass | – | **NEW: dead (V5)** | rewrite on owed obligations |
| `test/message-group/message-group-cdc-input-guard.test.js:15,168,173` | pass (not run) | – | imports `buildEventIdentity` from `cdc-event-buffer.js` | re-point with V19 |
| Handshake-shape stubs `{catchup: {bufferedEventsReplayed: 0}}`: `test/bootstrap/cdc-initial-subscription-leader-fallback.test.js:66,150,244,364,429`; `dynamic-partition-cdc-subscription.test.js:164,445`; `node-joining-service-message-group-activation.test.js:937,1081` | not run | – | **NEW: hand-written restatements of V16** | edit with V16 |

### 1.4 Systemic root

The cutover moved the producer and left everything else in place. `4151a3ab4`
was an unreviewed exact-byte proof snapshot. It made committed application the
one CDC producer and nulled `emitCdcEntry` at the plan builder, instead of
deleting the volatile emitter and its state. Its own comment
(`partition-cdc-delivery.js:714-715`, "after the volatile buffer's catch-up was
scheduled") shows the old path was kept on purpose as a sibling.

`681da1dc1` then tightened the subscriber contract to receipts. It did not
migrate:
- the owner's test double (`recordingSubscriber`)
- the plain-callback tests
- the bootstrap handshake stubs
- the readiness consumers of `bufferedEvents`

Each surviving piece still "works" against a silently constant input, so no
gate fires:
- an always-empty buffer
- an always-zero counter
- a method nobody calls

The unused-export and unused-files gates do not see this, because each symbol
is still referenced by tests.

### 1.5 Bounded deletion units (order matters)

- **D1a — policy ruling (owner judgment, first).** Decide whether the obligation
  recorder applies `getTableCdcPolicy` (logs suppression, `externalCdcAllowed`,
  non-propagated control tables). Alternatively, prove that production
  subscribers exist and acknowledge those tables. Without this ruling, deleting
  V3/V18 removes the last copy of the policy. Proof: a red-then-green probe like
  §0.4. Size: decision plus about 20-60 src lines if the policy moves into
  `recordCommittedStatementCdc`.
- **D1b — consumers first (src, landing-required).**
  - Migrate the admin readiness and control-snapshot consumers (V15) to owed
    obligation counts.
  - Drop the V16 log fields at the three bootstrap sites.
  - Re-home `buildEventIdentity` (V19) into `src/cdc/`.

  Proof: an admin readiness test that is red on a held obligation with the old
  code and green after. Size: about 60-120 src lines and about 4 test files.
- **D1c — delete the dead producer and buffer (src).**
  - V1, V2, V3, V5, V6, V7, V8, V10, V11, V13, V14, V17, V18 (subject to D1a),
    and `cdc-event-buffer.js` (263 lines).
  - The handshake shrinks to: register the wrapper, then drive obligations.
  - V9 (live) is deleted here, with a witness that a second subscriber receives
    only owed obligations.

  Proof:
  - W5-style source census: no `cdcEventBuffer`, `generateCDCEvent`,
    `emitCdcEntry`, `recordDelivered` or `subscribeToCDC(` (partition method)
    in src.
  - The obligation suite green.

  Size: about 700-900 src lines deleted across
  `partition-cdc-delivery.js` (about 400 of 776),
  `partition-service-cdc-stream-base.js` (about 200 of 777),
  `partition-cdc-generator.js` (about 110),
  `cdc-event-buffer.js` (263), constants, `core-base.js`, `lifecycle-methods.js`.
- **D1d — tests (same unit as D1c or immediately after).**
  - Rewrite: partition-service #22, #25, #27-#30; size-split #2 and #14;
    cdc-generation.property; seed-teardown-pending-cdc-delivery (durable wave);
    partition-cdc-obligation `recordingSubscriber`; shutdown-timers `:222`.
  - Delete: about 11 files and test blocks listed in §1.3.

  There is no owner-provided acknowledging-subscriber fixture today (§4.5).
  Create one: one fixture in `test/test-helpers/`, built on
  `buildCommittedCdcOutcome`. Size: about 15 test files.
- **D1e — non-durable propagation (separate unit, after D1c).** Delete V20 once
  partition sources are proven durable-only by D1c's census. Size:
  `cdc-group-propagation-delivery-methods.js` (789 lines, most of it) plus about
  250 lines of `cdc-group-propagation-service.js`, plus their tests (for example
  `test/topology/cdc-group-propagation-service.test.js`).
- V21 is NOT in scope until seed hydration has an owner. Unknown.

### 1.6 Conflicts with in-flight branches

- **`work/partition-admission-fixtures-20261024`**: landed as `3829a3c3b` and
  merged `9b78690a7`. Its worktree is at `8c51246e2` with the same staged tree.
  It edited partition-service, size-split, statement-admission, settled-replay
  and `test/test-helpers/participant-transaction-fixture.js`. D1d rewrites some
  of the same test bodies (#22, #25, #27-#30; size-split #2 and #14). There is
  no textual conflict with the merged content, but D1d must build on
  `b42dfd45c`. The quest log's correction entry (2026-10-24T12:17) already asks
  for these rewrites.
- **`work/mg-c2-transport-outcome-20261024`** (dirty, staged, at `bed8c6354`)
  edits two files that D1 also touches:
  - `src/partition/partition-service-write-metrics-base.js`: the forward
    metrics around `:475-492`. D1c deletes `:691-702` in the same file, so
    there is a textual-adjacency risk only.
  - `src/topology/cdc-group-propagation-delivery-methods.js`: the
    `deliverToTargets` delivered-test. **That hunk hardens V20, which D1e
    deletes.** Land C2 first, or drop that hunk if D1e is accepted.
- **`work/mg-c1-receiver-admission-20261024`**: committed `1f0dc0855` and
  merged into the lineage (`2b8a4639a`). Its worktree is clean. It touched
  `message-group-cdc-committed-acceptance.js`, `-forwarding-owner-*`,
  `-service-cdc-propagation-runtime-methods.js` and
  `-service-cdc-replication-runtime-methods.js`, which are the V21 files.
  There is no conflict with D1a-D1e. V21 would conflict with any C1 follow-up.

---

## 2. Family 2: `WebSocketTransport`, the legacy provider stack, and the router inline-ACK path

### 2.1 Inventory

| Item | Definition | Production construction / import | Public export |
| --- | --- | --- | --- |
| `WebSocketTransport` | `src/transport/websocket-transport.js` (724 lines) + `websocket-transport-messages.js` (110) + `websocket-transport-connection-records.js` (84) | **none**. `new WebSocketTransport` appears nowhere in src; it is imported only by `index.js:24-26` | yes: `transport/index.js:24` -> `public-api.js:23` -> `package.json` `exports["."]` |
| `WebSocketTransportProvider` | `websocket-transport-provider.js` (789) + `-provider-constants.js` (51) | none (only a jsdoc example `transport-provider.js:33`) | yes `index.js:29-33` |
| `TransportProvider` | `transport-provider.js` (179) | base class of the above; referenced by `transport-registry.js`, `connection-pool.js` | yes `index.js:6` |
| `TransportRegistry` | `transport-registry.js` (299) | none | yes `index.js:10-14` |
| `ConnectionPool` | `connection-pool.js` (391) | none | yes `index.js:17-21` |
| `RouterMessageHandler` | `src/transport/router-message-handler.js` (388) | **imported by no src module**. Its ACK frame is plain (`:267-271`) | no (not in `index.js`) |
| `ConnectionState` (websocket) | `websocket-transport.js` | exported `index.js:25`; the router has its own `ConnectionState as RouterConnectionState` (`index.js:37-41`), which means two enums of one concept | yes |
| Inline-ACK producer | `websocket-transport-messages.js:30-45` `buildServiceAcknowledgment` (handler result folded into the ACK), called `websocket-transport.js:431,443` | only from WebSocketTransport | – |
| Inline-ACK consumer | `message-router-pending-response-ledger.js:484-495` `hasInlineAckPayload`; branch `message-router-delivery-behaviors.js:439-445`; reason `message-router-shared-vocabulary.js:102` (`RETIRED_PENDING_RESPONSE_REASON.INLINE_ACK`), `:35` `STRING_LATE_AFTER_INLINE_ACK`, `:231-240` `INLINE_ACK_RESULT_FIELD`/`INLINE_ACK_PASSTHROUGH_KEYS` (re-exported `message-router-connection-authority.js:37,573-574`); late classification `message-router-outbound-queue-admission.js:74-75`; ACK passthrough `...rest` in `handleAcknowledgment` `message-router-pending-response-ledger.js:524-560` | MessageRouter peers never send extra ACK keys: the only router ACK producer is `message-router-inbound-dispatch.js:435-439` (plain). This is the same conclusion as REVIEW-mg-c2-transport-roundtrip-witness-r1 C2 | – |
| Constants used only by the stack | `src/constants/transport.js:183` (`WEBSOCKET`), `:337`, `:363` (log msgs); `src/constants/subsystems.js:82,85` | | |
| Stale owner card | `src/transport/README.md:12-18` names ConnectionPool, TransportRegistry and WebSocketTransportProvider as owners | | |

`RPCClient` is live (`src/bootstrap/node-joining-admission-readiness.js`,
`node-joining-service-shared.js`, `phases/seed-cache-hydration-phase.js`). Keep it.

External consumer check: `/mnt/data/peter/projects/lagrange-images` (peer dep
`lagrange-server`) has no import of WebSocketTransport, TransportRegistry,
ConnectionPool, RouterMessageHandler, RPCClient or MessageRouter (targeted grep,
`node_modules` excluded). Other external consumers: **unknown**. The release
consumer contract (`test/release/public-consumer-contract-ratchet.test.js:87-96`)
pins only `createEmbeddedLagrange`, `VERSION`, `ApplicationDatabaseError` and
error codes.

### 2.2 Tests depending on it (all pass; they test dead code)

| Test | Lines | Target |
| --- | --- | --- |
| `test/transport/websocket-transport.test.js` | 371 | WebSocketTransport |
| `test/transport/exact-handler-identity-api.test.js` | 143 | runs the N2 identity witness on WebSocketTransport **and** MessageRouter (`:26-43`); the WebSocketTransport half witnesses an unconstructed class (`unregisterExact` was added to it in `1aea11baf` only to satisfy this) |
| `test/transport/websocket-transport-provider.test.js` | 419 | provider |
| `test/transport/websocket-provider-interface-compliance.property.test.js` | 648 | provider |
| `test/transport/websocket-provider-backward-compatibility.property.test.js` | 648 | provider ("backward compatibility" by name) |
| `test/transport/transport-provider-interface.property.test.js` | 448 | base class |
| `test/transport/transport-registry.test.js`, `transport-registry-provider-management.property.test.js`, `endpoint-priority-selection.property.test.js` | 534, 477, 571 | registry |
| `test/control-plane/endpoint-incarnation-authority.test.js:16,180-182` | – | asserts on `new TransportRegistry(cache)` as "the delivery owner". It is not the production delivery owner, so that assertion is vacuous for production. Rewrite against `resolveNodeWebSocketAddressResult` (already asserted next to it at `:183`) |
| `test/transport/connection-pool.test.js`, `connection-ttl-lifecycle.property.test.js` | 521, 604 | pool |
| `test/transport/service-response-correlation.property.test.js:19`, `immediate-ack-ordering.property.test.js:18`, `message-router-late-response-classification.test.js:3` | 367, 256, 208 | RouterMessageHandler (dead duplicate of `message-router-inbound-dispatch.js`). Whether MessageRouter's own tests cover the same properties: **unknown** (not compared) |
| `test/transport/message-router-delivery-deadline-liveness.test.js:33,68-74,155` | – | MODE.INLINE_ACK: a hand-built ws double calls `router.handleAcknowledgment({..., result: {ok: true}})`, a synthetic legacy peer |
| C2 witness `test/transport/message-router-cdc-outcome-roundtrip.test.js` (untracked in `mg-c2-transport-witness-20261024`, staged-then-deleted `AD` in `mg-c2-transport-outcome-20261024`) | `:32,43-45,166-174` | uses a real `WebSocketTransport` as the INLINE_ACK peer |

### 2.3 Systemic root

`MessageRouter` replaced the provider design (`62a1e525a` 2026-02-09, "stable
trinity achieved", which also added `router-message-handler.js`). The old stack
stayed exported "for compatibility" because the public barrel `export *` has no
consumer contract. Its tests kept it out of the unused-files gate. The inline-ACK
branch in the router exists only to speak to that stack, which makes it an
implicit mixed-version protocol even though rs-raft rules "upgrade unsupported"
(memory `rs-raft-closeout-rulings-2026-10-04`).

The commit that disconnected `RouterMessageHandler` from `MessageRouter` is
**unknown**. `git log -S RouterMessageHandler -- src/transport/` shows only its
addition (`62a1e525a`) and a doc mention removed in `24ccf5cca`.

### 2.4 Bounded deletion unit D2

- **Scope:**
  - Delete `websocket-transport*.js` (5 files, 1758 lines),
    `transport-provider.js`, `transport-registry.js`, `connection-pool.js` and
    `router-message-handler.js` (about 1257 lines).
  - Remove `index.js:5-34` exports and the websocket `ConnectionState`.
  - Delete `hasInlineAckPayload`, the INLINE_ACK branch, its reason/late
    vocabulary, and `INLINE_ACK_*`.
  - Narrow `handleAcknowledgment` to `{messageId, acknowledged, error}`, with no
    `...rest` passthrough. This also removes the "normalized twice" idempotence
    requirement noted in HANDOVER-2026-10-24 §C2.
  - Remove the constants in §2.1 and update the README.
- **Order:**
  1. C2 lands first.
  2. Remove the C2 witness's INLINE_ACK path, or replace it with a negative
     witness that an ACK carrying extra keys is ignored or refused.
  3. Delete the router inline-ACK consumer.
  4. Delete the stack and its tests.
- **Proof:**
  - A src census witness: no `WebSocketTransport`, `RouterMessageHandler`,
    `hasInlineAckPayload` or `INLINE_ACK` in src.
  - `test/release/public-consumer-contract-ratchet.test.js` green.
  - `npm pack` contents diff (the export removal is a public-API change, so
    record it in CHANGELOG).
  - The lagrange-images grep above.
- **Size:** about 3,000 src lines and about 7,000 test lines deleted, 1-2 test
  files edited.
- **Owner decision needed:** a public-API removal in a patch release.

### 2.5 Conflicts

- `work/mg-c2-transport-outcome-20261024` (dirty) edits several of the same
  files: `message-router-shared-vocabulary.js` (removes one literal),
  `message-router-connection-authority.js` (the file that re-exports
  `INLINE_ACK_*`), `message-router-delivery-pressure-routing.js` and
  `transport-semantic-outcome.js`. D2 must follow C2.
- `work/mg-c2-transport-witness-20261024`: the C2 witness depends on
  WebSocketTransport (§2.2).

---

## 3. Family 3: second leadership-transfer caller

### 3.1 Callers

| Role | file:line | Note |
| --- | --- | --- |
| Port operation | `src/raft/raft-rs-operation-port.js:421` `transferLeadership`; core `raft-rs-runtime-owner.js:1567-1614`; normaliser `raft-rs-leadership-transfer.js` | listed `raft-operation-port.js:17` |
| **One partition issuer (owner)** | `src/partition/partition-service-leadership-transfer.js:39-44` `requestLeadershipTransfer` -> `this.raft.transferLeadership(successor)` | the only src `.transferLeadership(` |
| **Owner caller** | `src/node/replica-handler-leader-handoff-methods.js:120-148` `requestTrackedPartitionLeaderHandoff` (STEP_DOWN_REPLICA; `transferRequestOf :83-97` builds `MOST_CAUGHT_UP` for source demotion, `NAMED`-self for the replacement-target election; typed result `:56-80`) | reached from `replica-handler-remove-request-methods.js:603-640` `handleStepDownReplica` |
| **Duplicate caller** | `src/node/replica-handler-participant-cutover.js:239-242` in `reopenCohort :221-251` | asks `requestLeadershipTransfer({successor: NAMED, replicaIdentity: <another voter whose connection did not serve legacy>})` directly. It bypasses the handoff owner's typed result and role gate; the answer is wrapped as `attemptRefusal(STALE, {transfer})` |

Witness: `test/raft/leadership-transfer-single-path.test.js:77-87` (quest F1, W5)
asserts the issuer's only caller file is `replica-handler-leader-handoff-methods.js`.
**It is RED at the head** (run: "not ok 2 - W5: the port operation has one
partition issuer and one caller of it"). The F1 verification
(`solve/epics/raft-rs-full-cutover/quest-records/f1-step-down-port/verification-round-4.md:135`,
mutant "F10 second path ... handler bypasses requestLeadershipTransfer") built
the witness precisely to kill this.

### 3.2 History (`git log -S requestLeadershipTransfer -- src`)

- `1aea11baf` (2026-09-30, PR #63, rs-raft cutover replica-lifecycle 0.2.6):
  introduced the single issuer and the handler handoff (F1 quest).
- `4151a3ab4` (2026-10-12, "Ephemeral exact-byte proof snapshot only; not
  reviewed or landed"): added `replica-handler-participant-cutover.js` (324
  lines), including the second caller. The same unreviewed snapshot is the root
  of family 1.
- `servedLegacy`: `0ffd3a1ec` (TX1 increment 4), then `4151a3ab4`, then
  `b8e36a97c` ("remove unused legacy connection mutator"). Since `b8e36a97c`
  the only `servedLegacy: true` source is `UNSTAMPED`
  (`partition-participant-transaction-connection.js:15`): a connection the
  lifecycle owner's open hook never stamped.

**Why two exist.** The handoff owner's request vocabulary is keyed by
STEP_DOWN reasons and can only express "most caught up" or "name myself". The
cutover needed "name a specific other voter". It reached past the owner to the
issuer, and no reviewer saw it, because the snapshot was not reviewed.

### 3.3 Bounded unit D3

Two options; the choice is owner judgment.

- **(a) Route through the owner.** Give `requestTrackedPartitionLeaderHandoff`
  (or a sibling in the same module) a named-successor request with a typed
  result. Have `reopenCohort` call it. W5 stays as written. Size: about 30-60
  src lines plus one witness case.
- **(b) Delete the branch.** If the reopen-with-transfer branch is legacy
  residue — that is, every connection a hosted partition serves is stamped by
  the lifecycle owner, so a `servedLegacy` leader with more than one voter
  cannot exist — then delete `reopenCohort :233-243`. Possibly delete the whole
  `servedLegacy` reopen family too (`replica-handler-participant-release.js:170`,
  `partition-participant-release-contract.js:139`,
  `partition-participant-transaction-apply.js:591`).

Reachability of the branch in production is **unknown**:
- Whether any production open bypasses `stampParticipantConnection` (for
  example a snapshot install or a reopen) is not traced.
- No test exercises the transfer branch. Grep of `reopen` plus `transfer` finds
  only unrelated suites.

Proof for either option: W5 green; plus, for (b), a census of every
`new Database`/open path for stamping.

Conflicts: none of the three in-flight branches touches
`replica-handler-participant-cutover.js` or the handoff module.

Tests calling `raft.transferLeadership` directly bypass the issuer by design as
test drivers. They are not src callers and not covered by W5:
- `settled-replay-preserves-result.test.js:515`
- `partition-write-leadership-transfer-committed.test.js:196`
- `wasm-service/bound-creation-handler-embedding.integration.test.js:89`
- `wasm-creation-publication.integration.test.js:233`
- `test-helpers/transaction-coordinator-group-fixture.js:292`
- `rebalancer/replace-real-group-harness.js:727`

---

## 4. Family 4: hand-written test doubles restating owner contracts

Rule source: `test/guidelines/fixtures.md` states "Use the real path" and "No
test-only code paths" (`:52-83`). **It does not literally state "consume the
owner's builder or one owner fixture".** That rule exists only in the owner
directive (memory `no-legacy-one-version-of-logic` point 3; quest log
`retained-seed-original-handoff:85`; `wasm-creation-genesis:76` "third
test-double contract-drift instance today"). Writing it into `fixtures.md` is
itself a unit.

### 4.1 Lifecycle manager (`ServiceLifecycleManager`, `src/service/service-lifecycle-manager.js:61`)

| Fake (file:line) | Owner shape restated | Should consume | Dependants |
| --- | --- | --- | --- |
| `test/node/runtime-service-handler.test.js:72-108` `createMockLifecycleManager` | `readRetainedCreation`, `resumeConsensusCreation` (both hard-coded `UNAVAILABLE`), `createReplica`/`startReplica`/`stopReplica` | real `new ServiceLifecycleManager({logger})` with a `ServiceTypeAdapter` registered through `registerAdapter` (`:121`), as done in `test/node/runtime-service-bound-route.test.js:151`; or with journal `createOriginFixture` (`test/service/service-consensus-creation-fixture.js:10`) | 5 call sites in the file |
| `test/rebalancer/runtime-service-replace-canonical-target-handoff.test.js:165-197` `createLifecycleManager` | same, plus SERVICES-row side effects | same | `:207` (the drift that broke REPLACE, `wasm-creation-genesis` log:76; `dc4567e2c`) |
| `test/bootstrap/pgwire-startup-safety-gate.test.js:29-31` `mockServiceLifecycleManager` | `createReplica`/`startReplica`/`stopReplica` returning `{}` | same | `:68,85,101,136` |
| `test/node/runtime-service-remove-execution-custody.test.js:64-65,224` `{stopReplica}` | partial manager | same (the real manager plus a stopping adapter) | `genericWorld` users in the file |
| `test/node/runtime-service-restart-inventory-custody.test.js:22-25` | monkey-patches `inspectRetainedCreation` on the real fixture manager | owner fixture seam (acceptable decorator; flag only) | – |

Owner fixture: **none dedicated.** The journal fixture `createOriginFixture`
exists, and the real class plus `registerAdapter` is the seam. Proposal: one
`test/test-helpers/service-lifecycle-manager-fixture.js` over the real class.

Also legacy: `src/node/replica-lifecycle-manager.js` (651 lines,
`ReplicaLifecycleManager`) has **no production constructor**.
`replica-lifecycle-recovery.js:11` calls it a "compatibility delegator". It is
exported `src/node/index.js:36`, then `public-api.js:19`. About 10 test files
under `test/node/`, plus `test/bootstrap/lifecycle-message-delegation.property.test.js`
and `test/integration/{ack-delivery,websocket-create-replica-ack,cross-node-replica-placement}`,
reference `lifecycleManager`/`ReplicaLifecycleManager`. Not traced further;
record it as a deletion candidate of the D2 kind (a public-API removal).

### 4.2 Consensus port

Owner fixture: `test/test-helpers/controllable-consensus-port.js` (the
production frozen shape through `createRaftOperationPort`; 13 consumers). Real
clusters are also available: `test/raft/raft-rs-backend/partition-node-cluster.js`
and `raft-rs-network-host.js`.

| Fake (file:line) | Restates |
| --- | --- |
| `test/test-helpers/participant-release-recovery-harness.js:40-43` `raft: {readStatus}` ("exact recovery-owner test doubles ... moved byte-for-byte", `:1-2`) | `readStatus` |
| `test/node/replica-handler-release-recovery.test.js:537,598` (20 `readStatus` literals; wraps a real port with an override) | `readStatus` |
| `test/partition/partition-peer-cache-identity-record.test.js:30-36` | `readStatus`, `proposeConfChange` with `{outcome: CORE_OK}` |
| `test/node/group-retirement-fences.test.js:218-` | `readStatus`, membership op |
| `test/node/replica-removal-consensus-exit-reported-once.test.js:36-48` | `subscribe`, `READ_COMMITTED_MEMBERSHIP` answer by hand |
| `test/convergence/dt6-ledger-leader-durability-fitness.test.js:39` | `readStatus` `{peerCount}` (not a port field name; drifted) |
| `test/message-group/message-group-proposal-deadline-wait-bound-spent.test.js:59` | `propose` |
| `test/raft/raft-rs-backend/runtime-opening-refusal.integration.test.js:326`, `startup-cleanup.integration.test.js:137` | `close`/`stopScheduling` |
| `test/transport/message-router-cdc-encoding.test.js:56` | `raft: {}` |
| `test/wasm-service/wasm-service-replica.test.js:300,316` | `propose` answers |
| `test/partition/participant-release-applied-position.test.js:820-826` | decorates a real port (`{...actualPort, readStatus}`; acceptable seam, flag only) |

### 4.3 Message router and transport delivery outcomes

- Owner fixture: `test/contract/message-router-contract-support.js:182-185`
  `createContractMessageRouterStub` + `assertMessageRouterDeliveryContract`.
  Its header (`:4-17`) states the problem: "178 test files hand-roll inline
  `messageRouter: {...}` literals whose `deliver()` returns a bare
  `{acknowledged: true}`". **Consumers: 3 files.**
- Owner builder: `src/transport/transport-semantic-outcome.js:368`
  `buildTransportDeliveryOutcome` (2 test consumers).

Census: **233 test files** define a hand-written `deliver` and **231 of them do
not use the contract stub**. The machine list, with first fake line, fake count,
`acknowledged: true` literal count and stub use, is at
`/tmp/claude-1000/-mnt-data-peter-projects-lagrange/c74561e1-2969-4696-bd5a-1d3a410f38a7/scratchpad/legacy/router-fakes.txt`.

Heaviest:
- `test/query/query-executor-executeonpartition-no-handler-repair.test.js:97`
  (9 fakes, 29 ack literals)
- `test/topology/cdc-group-propagation-service.test.js:753` (22 literals)
- `test/rebalancer/rebalance-coordinator-timeout-cache-visibility-tail-test-cases.js:78`
  (16 and 16)
- `test/bootstrap/node-joining-service-node-state-update-ingress.test.js:373`
  (12 and 16)
- `test/query/query-executor-executeonpartition-leader-resolution.test.js:330`
  (12 and 15)
- `test/topology/cdc-group-propagation-service-harness.js` `createMessageRouter([{acknowledged: true}])`
  (used by `seed-teardown-pending-cdc-delivery`)

Transport doubles lacking the identity API: size-split #15 and #16 fail on
"transport cannot prove handler identity". The real owner shape is
`MessageRouter.register`/`unregisterExact`. **The double's file:line was not
isolated: unknown.**

### 4.4 Participant release and participant protocol

- Owner builders: `src/partition/partition-participant-release-contract.js:200`
  `releaseAnswer` (plus `releaseIdentityOf` and others). Owner fixture:
  `test/test-helpers/participant-release-protocol-fixture.js:131`
  `withParticipantReleaseProtocol` (real owners; 2 consumers).
- Fakes:
  - `test/node/participant-release-fresh-create-completion.test.js:72`
    (`participantReleaseAuthorizationOwner` replaced), `:135,159,174,185`
    (hand-built `{outcome: OUTCOME.CUT_OVER}` and `DRAIN_PENDING` answers)
  - `test/bootstrap/seed-release-once-per-cohort.test.js:52,65`
  - `test/bootstrap/seed-participant-release-failure-projection.test.js:50`
    (authorization owner replaced; otherwise uses the owner, 13 references)
  - `test/scripts/participant-release-completion-owner.test.js:81,159` (a source
    rewrite of `requestParticipantRelease`; mutation-style, probably intended)
- `test/test-helpers/participant-protocol-double.js:33-75`
  `answerParticipantTransactionRequest` re-implements the participant
  transaction owner's success answers by hand. Its header says so
  ("for engine tests whose partitions are mocks"). **12 consumers**:
  - `test/query/transaction-session-reads`, `internal-sql-adapter.integration`,
    `transaction-coordinator-participant-protocol`,
    `postgres-wire-adapter.integration`, `sql-query-engine-execution`,
    `sql-query-engine-test-support`, `transaction-review-adversarial`,
    `sql-query-engine-transaction-owned-commit-mode`,
    `transaction-evidence-binding-production`
  - `test/transaction/transaction-support`,
    `cross-partition-rejection.property`
  - `test/test-helpers/transaction-coordinator-unit-fixture.js`

  The owner equivalent is a real partition (`participant-transaction-fixture.js`)
  or `transaction-coordinator-group-fixture.js`. Whether a cheap enough real
  owner exists for the query-engine unit tests is **unknown**.

### 4.5 CDC subscriber doubles (overlap with family 1)

- Owner builder: `buildCommittedCdcOutcome`/`buildProvisionalCdcOutcome`
  (`src/cdc/cdc-delivery-outcome.js:239,249`). **No owner-provided
  acknowledging-subscriber fixture exists.**
- Two local re-wraps exist:
  - `test/partition/partition-cdc-delivery-progress.test.js:46-50` `recipientAnswer`
  - `test/test-helpers/cdc-topology-progress-fixture.js:31`
- Receipt-less hand doubles:
  - `test/partition/partition-cdc-obligation.test.js:70-91` `recordingSubscriber`
    (the owner suite, §0.3)
  - plain callbacks in partition-service #22, #25 and #27-#30
  - size-split #2 and #14
  - cdc-generation.property
  - `seed-teardown-pending-cdc-delivery.test.js:129-131` (drops `deliveryContext`)

### 4.6 Systemic root and unit D4

**Root.** Owner contracts changed several times in October:
- receipts (`681da1dc1`)
- journal-first CREATE (`9514ba8bf`)
- the identity API (`1aea11baf`)
- the admission proof (cluster-P)

Each change migrated the owner and its own fixture but not the hand copies,
because nothing binds a copy to the owner. The contract-stub file exists
precisely for this and was adopted by 3 of about 233 files ("migrate
opportunistically").

**D4, in bounded slices, one owner per unit:**

- **D4a — CDC acknowledging subscriber.** One fixture over
  `buildCommittedCdcOutcome`. Migrate §4.5 together with D1d. About 15 files.
- **D4b — lifecycle-manager fixture.** One fixture over the real
  `ServiceLifecycleManager` plus an adapter. Migrate §4.1. 4-5 files.
- **D4c — consensus port.** Migrate §4.2 literals to `ControllableConsensusPort`.
  About 12 files.
- **D4d — router.** Make `createContractMessageRouterStub` mandatory for new
  code with a ratchet (count 231, one-way). Migrate in batches by subsystem.
  Large: 231 files.
- **D4e — participant protocol.** Owner judgment on
  `participant-protocol-double.js`. 12 consumers.
- **D4f.** Write the rule into `test/guidelines/fixtures.md`.

Proof per slice: the slice's tests green, plus a census count ratchet
(hand-written fakes of owner X = 0, or a one-way baseline).

### 4.7 Conflicts

- `work/mg-c2-transport-outcome-20261024` edits several test files that hold
  router or port fakes: `test/raft/raft-rs-backend/{conf-change-pending-deferral,participation-gate}.test.js`,
  `partition-node-cluster.js`, `evidence-o1-model.js`,
  `test/rebalancer/{replace-real-group-harness,rolling-restart-rebalancer-handoff-witness}`,
  `test/bootstrap/seed-infrastructure-phase.test.js`. D4c and D4d must not
  start in those files before C2 lands.
- `work/partition-admission-fixtures-20261024` (merged) edited
  `participant-transaction-fixture.js`. D4e builds on it.

---

## 5. Unknowns (explicit)

1. Whether production subscribes to and acknowledges CDC for user tables with
   `externalCdcAllowed:false`, for `logs` and for `sql_write_operations`.
   Whether owed obligations for them are bounded or retired (§0.4).
2. Why the probe copies of partition-service #25 and seed-teardown hung after
   their assertions (lane retry timer versus shutdown custody). Not traced.
3. Whether any production SQLite open bypasses `stampParticipantConnection`.
   This decides whether D3(b) is possible.
4. Whether seed cache hydration (`seed-cache-hydration-phase.js:415`) is the
   last non-durable receiver producer, and who should own it (V21).
5. Which commit disconnected `RouterMessageHandler` from `MessageRouter`.
   Whether MessageRouter's own tests cover the properties of the three
   RouterMessageHandler suites.
6. External public-API consumers other than lagrange-images.
7. The file:line of the transport double behind size-split #15 and #16.
8. cdc-observability #2 and #3, and the non-#86 log-suppression tests, were not
   individually classified. They are likely live: they exercise extractors and
   message-group resolution.
