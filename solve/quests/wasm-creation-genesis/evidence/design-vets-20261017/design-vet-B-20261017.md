# Design vet B: temporal / interleaving / transport / harness

Subject: `solve/quests/wasm-creation-genesis/SERVING-PUBLICATION-RETIREMENT-DESIGN-20261017.md`
Tree read: `/mnt/data/peter/projects/.worktrees/rs-raft-event-reconciliation-20261016` at `6cc314f53`
(design commit; `src`/`test` identical to the lab-accepted `35d533b6b`). Every `file:line`
below is from that tree and was re-read, not taken from the design. Read-only; no file in
any worktree touched. Templates applied: design-note, transport-delivery, harness-fidelity,
formation-circularity, concurrency-serialization (temporal items), sweep-timer, retry-loops.
Owner-interaction/admission/recovery belong to vet A; where I hit them I say so and stop.

## Verdict

**REVISE (blocking).** Three refutations break the design's own frozen claim on the time axis:

- R1: `publishReplica` runs outside the per-replica queue and outside the shutdown join; after
  its grant await it writes the local grant and enables serving on a replica whose stop has
  already begun (leaked safety-broadcast interval, PUBLISHED result for a STOPPED replica,
  endpoint/ACTIVE/COMPLETED published for a CLOSED slot).
- R2: the OBSERVED->wake predicate is undefined on a coalesced work item and has no latch, so a
  waited START and an event wake both publish (duplicate publication) and, after serving, every
  APPLIED_PROGRESS keeps running genesis reads for the replica's lifetime.
- R3: "closes new user admission synchronously" is false for a bound replica once `serving`
  derives from the local phase alone: reads and ASYNC writes are admitted between
  `shutdown()` and the RETIRED write; strong writes are refused only by an incidental guard.
  `closeAdmission()` at `wasm-service-replica-lifecycle.js:235` fences the reconciliation
  queue, not user admission; D4(b) and M4 conflate the two.

Plus required (non-blocking) changes R4-R8 and harness repairs H1-H6. Detail follows.

## 1. Temporal substrate established from the tree

- Events are emitted synchronously inside the port's drain, after the apply transaction has
  committed and after `sendMessages`: `finishReady` persists, sends, then applies
  (`raft-rs-runtime-owner.js:1139-1183`); `announce` runs when no Ready remains
  (`:1207-1209`) and emits APPLIED_PROGRESS first (`:1273,1296-1304`), then ROLE, TERM_CHANGE,
  LEADER_CHANGE (`:1274-1283`). Listeners run inline in that turn; the adapter's listener only
  enqueues (`wasm-creation-reconciliation.js:46-49`); the drain is a microtask
  (`owner-key-reconcile-queue.js:95-97`). So no listener can interleave with synchronous JS.
- `port.close()` clears listeners and refuses later dispatch typed
  (`raft-rs-operation-port.js:301-309,460-474`). An unsubscribe after close is a harmless
  Set delete (`:367`).
- `apply` is one synchronous SQLite transaction (`raft-rs-application-transaction-owner.js:61-92`);
  `commitDurably` refuses inside a transaction (`raft-rs-durable-store.js:189-194`). Because
  better-sqlite3 is synchronous, no await point can observe an open transaction, so a RETIRED
  write between awaits never collides with apply.
- `replica.role`/`isLeader` are set for bound replicas too: `applyReplicaLeadership/Demotion`
  (`replica-leadership-state.js:62-103`) have no creation guard; only `queueRoleUpdate`,
  `queueLeaderNodeUpdate`, `onBecameLeader`, `flush*` do (`wasm-service-replica.js:490,512,545,584,594`).
- Shutdown fences at call: `lifecycleState=STOPPING` (`wasm-service-replica-lifecycle.js:234`),
  `creationReconciliation.closeAdmission()` (`:235`), `stopActivity()` (`:240`: writer abort,
  timers, broadcasts, helper shutdown `wasm-service-replica.js:745-751`). Then awaits:
  `starting` (`:170`), `creationReconciliation.shutdown()` (`:173`; joins only queue work via
  `awaitCurrentWorkIdle`, `owner-key-reconcile-queue-current-work.js:29-46`),
  `retireReplicaTransportHandler` (`:185`), `releaseWasmServiceReplicaConsensus` (`:196`).
- User admission today: `handleMessage` has no lifecycle check (`wasm-service-replica.js:350-371`);
  `heldCreationRefusal()` keys on `consensusCreation !== null` (`:285-288`); strong writes are
  refused after STOPPING only by `WasmWriterCompletion.submit`'s `initialized` check
  (`wasm-writer-completion.js:27`); `_handleRead` serves from `kvStore` with no lifecycle check
  (`:381-410`); ASYNC writes go straight to `proposeEntry` (`:435-443`) which has no lifecycle
  check either (`:462-483`).
- `createReplica` admits a successor while the current replica is STOPPING
  (`wasm-service-lifecycle.js:205-215`): `stopOwnedReplica` adds current to `retiringReplicas`
  (`:525`) so `priorStop` is false for it.
- `publishReplica` per D1 runs in `startReplica`'s bound branch after `request()` resolves
  (`wasm-service-lifecycle.js:352-364`), i.e. after the queue item completed: outside the key,
  not joined by `awaitCurrentWorkIdle`, not coalesced with a concurrent START.
- The queue's retry policy never retries by default (`reconcile-queue-retry-ownership.js:
  defaultRetryableDrainFailureClassifier` -> false); `enqueueAndWait` merges a completion waiter
  into an existing pending/in-flight item (`owner-key-reconcile-queue.js:225-236,589-599`), so one
  run can carry both the waited START reason and merged event reasons.
- Loopback transport throws on a missing handler (`test/partition/partition-service-test-support.js:
  96-102`); the fixtures replay queued envelopes through that original `deliver` inside
  `deliverScheduled` (`wasm-strong-write-native-fixture.js:57-64`). Production answers
  `acknowledged:true` then `{noHandler:true}` (`message-router-inbound-dispatch.js:436-457`).
- Fixture publication sinks throw (`wasm-retained-bootstrap-fixture.js:128-139`); no endpoint
  remover is set; `cdcIntegrationService` is absent from the lifecycle dependencies (`:93-95`), so
  `queueRoleUpdate` returns before any flush (`wasm-service-replica.js:495-497`).
- Metadata CAS: `commitState` resolves a lost reply itself with one authoritative reread
  (`service-instance-metadata.js:45-72`); the SQLite fixture's `loseReply` throws after applying
  (`service-instance-creation-sqlite-fixture.js:83-89`), so a lost CLOSED reply resolves to
  CLOSED inside `closeInstanceResource` and never reaches D4(d)'s "UNKNOWN -> one resolve".
- Role/leader publication helper retry: 250 ms base, x2 backoff, 30 s cap, no attempt budget
  unless configured, zero-row CAS schedules a silent retry
  (`authoritative-row-mutation-helper.js:380-397,587-624`;
  `authoritative-row-mutation-vocabulary.js:47-50`); `shutdown()` clears the timer (`:702-715`)
  but an in-flight `executeFlush` continues past the await and may still write (`:271-305`).
- Manager STOP: `runReplicaOperation` completes the row when the adapter returns and marks FAILED
  when it throws (`service-lifecycle-operations.js:332-407`); no path leaves it IN_PROGRESS.
  Runtime `stop` for bound definitions throws SERVING_UNAVAILABLE (`service-runtime-lifecycle-
  operation-methods.js:485-487`); the unbound flow journals its own STOP row (`:495-516`).

## 2. Coverage model

Decisions: GRANT = publishReplica (a)-(c); ENABLE = (d)-(e); RETIRE-LOCAL = D4 (b)-(c);
CLOSE-CAS = D4 (d); WAKE = D6. State inputs noted per row: local phase L {ADMITTED,PUBLISHED,
RETIRED}, metadata slot phase S, lifecycleState Y, isLeader, INIT recorded I, queue in-flight Q.
Relation: BEFORE = pending when the decision starts; JUST = processed just before; MID = arrives
across an await inside the decision; DEADLINE = a deadline crosses during it.
Marks: W:<witness> covered by an existing test; P:<n>/M:<n> covered by the plan; U = UNCOVERED.

| # | Decision | Event | Relation | State inputs that matter | Coverage |
|---|---|---|---|---|---|
| 1 | GRANT | explicit START re-entry | BEFORE (second START queued) | Q in-flight; coalesced item | W: genesis "concurrent genesis reentries join one native proposal" (covers request(); publishReplica itself: U) |
| 2 | GRANT | wake-driven START | MID (during grant await) | Q idle (publish is outside queue), L ADMITTED | U -> R1/R2 |
| 3 | GRANT | LEADER | MID | isLeader flips true, onBecameLeader suppressed | U (design text only) |
| 4 | GRANT | FOLLOWER / CANDIDATE | MID | writerCompletion.abort no-op (no interest), isLeader false at (e) | U |
| 5 | GRANT | LEADER_CHANGE (demotion) | MID | same as 4 | U |
| 6 | GRANT | TERM_CHANGE | MID | tenure re-minted only if leader | U (benign) |
| 7 | GRANT | APPLIED_PROGRESS | MID | enqueues; reconcile returns OBSERVED again -> wake? | U -> R2 |
| 8 | GRANT | user read/write | MID | L ADMITTED => refused | W: retained "held admission applies to direct read and write owners" |
| 9 | GRANT | shutdown (shutdownAll) | MID | Y STOPPING; db still open then closed | U -> R1 |
| 10 | GRANT | retire (D4) | MID | as 9 plus RETIRED write + CLOSED CAS | U -> R1 (plan has no retire-during-publish case) |
| 11 | GRANT | successor takes registry entry | MID | current STOPPING -> createReplica allowed | U -> R4 |
| 12 | GRANT | selection of J | BEFORE | S: instance !== selected | P3 (STALE_BINDING) |
| 13 | GRANT | selection of J | MID (between read and CAS) | CAS predicate on prior state | P3 only if the hold is placed on the write; design does not say -> H2 |
| 14 | GRANT | metadata lost reply | MID | commitState rereads; UNKNOWN only if reread fails | U (plan has P5 for CLOSE only; and see H3) |
| 15 | GRANT | metadata unavailable | BEFORE | UNAVAILABLE -> HELD | U (edge table only) |
| 16 | GRANT | INIT not yet recorded | BEFORE | (b) refuses | W: genesis "corrupt rejected INIT receipt", "recorded initialization does not replace refused read" (held, not publish) |
| 17 | ENABLE | FOLLOWER | JUST (between grant and enable) | isLeader false -> no timers | U |
| 18 | ENABLE | LEADER | MID | impossible: enable is synchronous, events are synchronous in the drain | n/a (argued in §1) |
| 19 | ENABLE | LEADER then FOLLOWER then LEADER | BEFORE (all during grant await) | onBecameLeader suppressed twice; enable reconstructs once | U |
| 20 | ENABLE | shutdown | JUST | Y STOPPING, stopActivity already ran | U -> R1 (leaked interval) |
| 21 | ENABLE | KV timer fire | after enable | proposeEntry admission now serving | U (no timer in P1-P8) |
| 22 | ENABLE | safety broadcast tick | after enable | raft present | U |
| 23 | ENABLE | role flush retry (250 ms) | after enable | cdc absent in fixture -> inert | U -> H4/R7 |
| 24 | ENABLE | reopen with L PUBLISHED | BEFORE (servingState set at open) | serving before re-grant | P6 (positive only) ; S CLOSED variant U -> R8 |
| 25 | RETIRE-LOCAL | user strong write | MID (after STOPPING, before RETIRED) | submit refuses on !initialized | P4 (passes via incidental guard) -> R3 |
| 26 | RETIRE-LOCAL | user read | MID | served from kvStore until db closed | U -> R3 |
| 27 | RETIRE-LOCAL | user ASYNC write | MID | proposed through live port | U -> R3 |
| 28 | RETIRE-LOCAL | LEADER/FOLLOWER events | MID | listeners still bound until unbind at :173 -> enqueue refused by `closed` | W: reconciliation "shutdown aborts event-owned INIT, joins the queue" |
| 29 | RETIRE-LOCAL | APPLIED_PROGRESS (late apply of committed user writes) | MID (between RETIRED write and port.close) | apply continues; local record untouched | U (benign; argue in design) |
| 30 | RETIRE-LOCAL | in-flight publishReplica | MID | see 9/10 | U -> R1 |
| 31 | RETIRE-LOCAL | pending writer interest deadline (5000 ms) | DEADLINE | abort settles waiters at stopActivity; join never waits on it | W: genesis "shutdown joins existing writer interest"; reconciliation shutdown case |
| 32 | RETIRE-LOCAL | successor open on same file | MID | RETAINED open reads L before RETIRED lands | U -> R4 |
| 33 | RETIRE-LOCAL | RETIRED write fails | n/a | CLEANUP_REQUIRED, CLOSED not attempted | U (edge row; no P) |
| 34 | CLOSE-CAS | metadata lost reply | MID | resolved inside commitState -> CLOSED | P5 as written is red/vacuous -> H3 |
| 35 | CLOSE-CAS | metadata unavailable | BEFORE | CLOSE_UNRESOLVED; custody retained | U (edge row; manager path missing -> R5) |
| 36 | CLOSE-CAS | re-stop after CLOSE_UNRESOLVED | BEFORE | idempotent CLOSED | P5 (depends on R5) |
| 37 | CLOSE-CAS | late raft envelope to retired address | MID | handler gone -> transport noHandler (prod) / throw (fixture) | U -> H1 |
| 38 | CLOSE-CAS | selection of J | BEFORE | retiring instance; CLOSED allowed | P8 |
| 39 | WAKE | OBSERVED from waited START | JUST | completion waiter present | U -> R2 |
| 40 | WAKE | OBSERVED from event run | JUST | no waiter | P1 |
| 41 | WAKE | OBSERVED repeated per APPLIED_PROGRESS after serving | after | no latch/unbind | U -> R2 |
| 42 | WAKE | CLOSED per replica (3 wakes) | JUST | outstanding(retiring) decides "last" | P8 (in-process consumer only) -> R6 scope |
| 43 | WAKE | consumer re-enters START while retire in flight | MID | REPLICA_RETIRED refusal at startReplica:311 | U |
| 44 | WAKE | consumer absent | n/a | CREATION_WAKE_UNDELIVERED | U (edge row) |
| 45 | all | stale callback after retirement | after | current() false | P7; W: mechanism file stale registry/port rejection |

44 cells; 7 covered by existing witnesses, 9 by the plan (3 of them for the wrong reason or
vacuously: 13, 25, 34), 28 uncovered. The uncovered band is exactly the MID column of GRANT and
RETIRE-LOCAL, which is where the claim lives.

## 3. Refutations (category-complete)

### R1 (BLOCKING) publishReplica is unjoined, unserialized and unfenced after its await

Evidence: D1 (`design:156-163`) runs `publishReplica` in `startReplica` after
`creationReconciliation.request()` (`wasm-service-lifecycle.js:354`), so it is not queue work;
`retireReplica` joins only `creationReconciliation.shutdown()` -> `awaitCurrentWorkIdle()`
(`wasm-service-replica-lifecycle.js:173`, `wasm-creation-reconciliation.js:102-110`); the design's
only recheck is step (a) before the grant (`design:163`); `enableServing` (`design:197-201`) has no
lifecycle gate; `stopActivity` runs at shutdown call (`:240`) and never again.

Interleaving:
1. Wake-driven START: `request()` -> OBSERVED; queue idle. `publishReplica` (a) passes, (b) RECORDED,
   (c) `await grantInstanceResource` (fixture: `holdNext('owner-a')` holds the UPDATE).
2. `stopReplica`/`retireReplica` begins: `STOPPING`, `closeAdmission`, `stopActivity` (timers,
   broadcasts, helpers stopped), `creationReconciliation.shutdown()` resolves at once (no queue
   work), `await retireReplicaTransportHandler` (handler gone).
3. The grant resolves PUBLISHED (CAS won against ADMITTED). (d) local CAS ADMITTED->PUBLISHED
   succeeds (db still open; RETIRED not yet written). (e) `enableServing`: servingState=SERVING,
   `isLeader` true -> `timerManager.reconstructTimers()` schedules KV timers,
   `_startSafetyBroadcasts()` installs a new `setInterval` (`wasm-service-replica.js:703-722`),
   `queueRoleUpdate` is swallowed (`shuttingDown`).
4. `retireReplica` continues: RETIRED write (PUBLISHED->RETIRED allowed), `port.close`, `db.close`,
   registry delete, `closeInstanceResource` -> CLOSED, wake J.
5. `startReplica` returns `{started:true, status:PUBLISHED, port}`; the design's own
   `!replica.initialized` check sits before the bound branch (`:343-350`), not after publish.
   Driver -> RUNNING + endpointIntent; runtime writes the endpoint, projects ACTIVE; manager
   COMPLETES the creation row and sets RUNNING.

Wrong outputs: endpoint row, ACTIVE projection and COMPLETED creation row for a replica that is
STOPPED and whose slot is CLOSED; a leaked safety-broadcast interval that nothing stops
(`stopActivity` already ran; `_stopSafetyBroadcasts` is never called again) and KV timers whose
`onTimerFired` runs `kvStore.get` on a closed db (unhandled rejection; `timer-manager.js:154-174`).
Variant: grant resolves after `db.close` -> (d) throws -> `LOCAL_GRANT_NOT_RECORDED`; metadata is
PUBLISHED then CLOSED by step 4: consistent, but the START caller's refusal is not
`STOPPED_DURING_START` as the edge table promises (`design:280`).

Classification: NEW SHAPE (ordering and fencing of an existing mechanism).

Required change:
(i) Make `publishReplica` owned work: run it inside the replica's `OwnerKeyReconcileQueue` key
(so `awaitCurrentWorkIdle` joins it and concurrent STARTs coalesce), or track its settlement on the
replica and have `retireReplica` await it before the RETIRED write (HANDOFF-INTERFACES: "joins the
owned outstanding start/publication work"). (ii) Recheck `lifecycleState === READY`, exact registry
identity, `!consensusClosing`, same port/creation after EVERY await (grant, resolve) and
immediately before (d) and (e); a failed recheck returns `STOPPED_DURING_START` and skips (d)/(e).
(iii) `enableServing` itself refuses synchronously unless READY and registered, with a typed
outcome. (iv) Add P9 "retire during in-flight grant (holdNext)" asserting no endpoint/ACTIVE,
no interval, local RETIRED, metadata CLOSED; add M "remove the post-grant recheck" (P9 red).

### R2 (BLOCKING) The OBSERVED -> wake predicate is undefined on a merged item and unlatched

Evidence: `enqueueAndWait` merges a completion waiter into the pending/in-flight item
(`owner-key-reconcile-queue.js:225-236`, `owner-key-reconcile-completion.js:58-65`,
`_deferInFlightItem :589-599`); `reconcile(context)` receives neither reasons nor waiters
(`wasm-creation-reconciliation.js:24-25,60-64`); D6 says the wake is called "when the
continuation's result first becomes OBSERVED for a replica" (`design:232-234`) without saying on
which runs or how "first" is remembered; nothing unbinds the adapter after PUBLISHED.

Interleaving A (duplicate publication):
1. Explicit START re-entry -> `enqueueAndWait`; an APPLIED_PROGRESS enqueue merges into the same
   item (reasons {PROGRESS_RECONCILE, 'applied progress'}, one waiter).
2. One run returns OBSERVED. The waiter resolves -> `startReplica` continues to `publishReplica`.
   The adapter, seeing OBSERVED, also fires `creationWake` -> fixture consumer ->
   `bootstrapConsensusCreation` -> `startReplica` -> `request()` -> OBSERVED -> a second
   `publishReplica` concurrently (R1: outside the queue).
3. Both grants answer PUBLISHED (idempotent), both local CASes (RECORDED/ALREADY), both enables;
   both return PUBLISHED -> two endpoint writes, two ACTIVE projections, two
   `transitionOperation(IN_PROGRESS->COMPLETED)` (second matches zero rows).

Interleaving B (steady-state tax): after serving, every committed user write emits
APPLIED_PROGRESS on every replica -> `current()` true -> reconcile -> `progressWasmCreationGenesis`
(meta read, classify, `readStatus`, `readCommittedMembership`) -> OBSERVED -> wake again unless
latched -> consumer re-runs bootstrap (journal reads, prepare, start) per commit.

Wrong outputs: P1's "one endpoint write per replica" red, or green only because the fixture
consumer happens to serialize; unbounded repeated START re-entries and metadata/journal reads per
committed entry (retry-loops item 3/5: a loop with no loud stop).

Classification: NEW SHAPE (predicate + latch + unbind).

Required change: define the wake predicate as OBSERVED AND the run carried no completion waiter
(or: OBSERVED AND the previous result was not OBSERVED) AND a per-adapter latch not yet set; set
the latch; after local PUBLISHED, retire the event subscriptions (`unbind()`) or make `current()`
false once `servingState !== HELD`, so the adapter is quiescent while serving. Plan: P1 must run
with `automaticReconciliation:true`, make no explicit second START, and assert exactly one
wake-driven re-entry; add M6 "disconnect OBSERVED->wake" (P1 red) and M7 "remove the latch"
(a bounded-wake-count assertion red).

### R3 (BLOCKING) User admission is not closed synchronously for bound replicas

Evidence: `shutdownWasmServiceReplica` sets STOPPING and calls `closeAdmission()` on the
reconciliation adapter only (`wasm-service-replica-lifecycle.js:234-235`;
`wasm-creation-reconciliation.js:66-68`); `handleMessage`/`_handleRead`/`_handleWrite` consult
only `heldCreationRefusal()` (`wasm-service-replica.js:358,382,422`); D3 derives `serving` from
the local phase (`design:191-197`) which becomes RETIRED only at D4(c), after at least three awaits
(`:170,173,185`); strong writes are refused by `submit`'s `initialized` check
(`wasm-writer-completion.js:27`), ASYNC writes bypass it (`wasm-service-replica.js:435-443`,
`proposeEntry :462-483` has no lifecycle check), reads have no check at all.

Interleaving:
1. Replica PUBLISHED, SERVING, leader. 2. `retireReplica`/`shutdown()`: STOPPING (sync).
3. User read -> `heldCreationRefusal()` null (SERVING) -> `_handleRead` -> `kvStore.get` -> answered
   by a retiring replica (or throws after `db.close`).
4. User write on a definition with `writeConsistency:'async'` -> `proposeEntry` ->
   `admitWasmServiceCommand` (serving) -> `raft.propose` on the still-open port -> entry committed
   and replicated -> `{accepted:true, async:true}`.

Wrong outputs: a read answered and an acknowledged ASYNC write accepted after the stop began; P4
"a user write issued after the stop began is refused" passes through `submit`'s guard, not the
serving owner; M4 "move closeAdmission after the first await" mutates the reconciliation fence and
cannot touch user admission, so M4 is red for the wrong reason or green.

Classification: NEW SHAPE (the single serving predicate must consume the lifecycle state).

Required change: for bound replicas `serving = servingState === SERVING && lifecycleState === READY`
(unbound OPEN unchanged, as D3 promises); P4 must issue a read and an ASYNC write after the stop
began; M4 must remove the lifecycle term from the serving predicate.

### R4 (REQUIRED) A successor replica may open the file a retiring replica is about to tombstone

Evidence: `createReplica` admits a successor when the current replica is STOPPING
(`wasm-service-lifecycle.js:205-215`); `openReplica` RETAINED reads the local record after an
await on metadata (`wasm-service-replica-lifecycle.js:80-86`); D4(c) writes RETIRED after the
handler-retirement await (`design:209-212`); the data-directory process owner is per node
process, not per replica instance.

Interleaving: 1. retire(A) in flight, awaiting `retireReplicaTransportHandler`. 2. wake-driven
START -> `createReplica` -> B takes the entry; `startReplica(B)` -> `resolveWasmCreationAdmission`
(metadata still ADMITTED/PUBLISHED) -> `openWasmServiceDatabase` (same path, second connection) ->
`openWasmCreationRecords` reads phase ADMITTED|PUBLISHED -> READY. 3. A writes RETIRED on the
shared file, closes, CLOSES the slot, wakes J. 4. B lives on a RETIRED record; its publish answers
RESOURCE_CLOSED (metadata) and a RETIRED-terminal refusal (local); the directory is not
exclusively owned by one instance while J may be granted.

Wrong output: a live replica instance (registry, port, handler) on a tombstoned directory while the
metadata says CLOSED and J proceeds. Classification: NEW SHAPE. Change: for bound creations,
`createReplica` refuses typed while any retiring replica with the same `creation.identity` exists
(or `retireReplica` installs a per-identity fence that `createReplica`/`openReplica` consult);
add a plan case "START re-entry during retire" expecting the typed refusal.

### R5 (REQUIRED) D7's STOP custody has no path in the manager or runtime

Evidence: `runReplicaOperation` completes the STOP row whenever the adapter returns and FAILS it on
throw (`service-lifecycle-operations.js:381-407`); runtime `stop` throws for bound definitions
(`service-runtime-lifecycle-operation-methods.js:485-487`) and the unbound flow journals its own
STOP row (`:495-516`); D7 says the manager's STOP row "stays IN_PROGRESS with the typed outcome"
when `closed === false` (`design:257-259`). A returned `{retired:true, closed:false}` is COMPLETED;
a thrown `CLOSE_UNRESOLVED` is FAILED. "Explicit re-stop retries the exact CAS" (P5) therefore has
no owner state to resume from. Classification: NEW MECHANISM (an explicit bound STOP branch in
both runtime and manager, mirroring `bootstrapConsensusCreation`'s no-transition return, with no
nested STOP journal). Owner-interaction detail belongs to vet A; recorded here because P5's timing
claim depends on it.

### R6 (REQUIRED, scope) The CLOSED wake is process-local; the contract's cross-node wake is not this

Evidence: D6's `creationWake` is a callback on `WasmServiceLifecycle` (`design:230-239`); J's
continuation lives on J's founding nodes; CONTRACT-R2 names the cross-node path ("Successful CLOSED
CAS ... enqueue the existing runtime-service reconcile owner for the selected binding. The
services/currentness cache notification is a wake only."). P8 passes because all hosts share one
process and one callback. Not a defect of this stage, but §0's claim "the last CLOSED of I wakes
J's continuation through the same wake surface that genesis observation uses" is true only
in-process; §0/§7 must say so and name the cache-notification path as the production wake.
"Last" is correctly decided by `outstanding(state.retiring)` (`service-instance-state.js:38-41,
261-263`) at J's grant; three per-replica CLOSED wakes are harmless (bounded, idempotent).

### R7 (REQUIRED) Role/leader publication after enable targets a row nobody writes, and is inert in the fixture

Evidence: D3 enables `queueRoleUpdate`/`queueLeaderNodeUpdate` at enable (`design:197-202`); the
helpers CAS a `services` row keyed by the instance-qualified replicaId
(`wasm-service-metadata-mutation-helpers.js:28-50`); nothing in this stage inserts that row (the
endpoint writer is a different table; CONTRACT-R2 "Services/endpoints carry B and attempt
identity" names a future owner). With CDC present: UPDATE matches zero rows ->
OBSERVED_STATE_CHANGED -> `scheduleRetry` with no log (`authoritative-row-mutation-helper.js:
380-397`), 250 ms x2^n capped at 30 s (`:626-644`; `MAX_DELAY_MS` 30 s), no attempt budget
(`retryBudgetAttempts` null) -> a silent per-replica retry for the replica's lifetime (retry-loops
items 3 and 5). Bounded by `roleMutationHelper.shutdown()` at `wasm-service-replica.js:749`
(timer cleared, unref'd); an `executeFlush` already past its await still writes after retirement
(`:289-298`), so a `services` row update can land for a retired replica (routing/presentation only).
In the fixture `cdcIntegrationService` is null, so none of this runs: P1's "same helpers, same
services row" is unexercised (harness item 5, vacuous). Classification: NEW SHAPE (name the
services-row owner or keep role publication disabled until it exists) + harness. Change: either
state that bound role/leader publication stays disabled in this stage (then D3's replay is a no-op
and the design must say which guards remain), or add the recording `roleUpdateWriter`/
`leaderNodeUpdateWriter` dependencies (`wasm-service-lifecycle.js:170-177`) to the P1 fixture and
assert exactly one role write and one leader write per replica.

### R8 (REQUIRED) Reopen with a local PUBLISHED record serves before the re-grant answers

Evidence: §4 sets `servingState` "from the record read at open" (`design:294-297`); READY is set
synchronously after the port opens (`wasm-service-replica-lifecycle.js:90-127`); the re-entered
START's `publishReplica` runs later. If metadata answers RESOURCE_CLOSED or STALE_BINDING (I closed
by reconciliation while this node was down; contract B1 "Reconciliation later closes I"), the
replica is already serving and the design names no consequence: HELD is returned to the caller but
serving continues until an operator stops it. Contract permits serving until exact local closure,
so this is not unsafe, but the typed edge is missing: re-entry observing CLOSED/STALE_BINDING on a
locally PUBLISHED replica must trigger `retireReplica` (or a named hold), and P6 needs the
negative variant (reopen after the slot was CLOSED). Classification: NEW SHAPE.

### Minor temporal notes (not blocking)

- N1 `enableServing` calls `queueLeaderNodeUpdate(nodeId)` without the term that
  `applyReplicaLeadership` passes (`replica-leadership-state.js:78`); pass
  `replica.leadershipTenure?.term`, else the tenure claim is never minted for bound replicas.
- N2 `TimerManager.reconstructTimers` is not idempotent: `_scheduleTimer` overwrites the handle
  without clearing it (`timer-manager.js:193-198`). Today a second reconstruct always has a
  `stopAll` between (ROLE emits only on state change, `raft-rs-runtime-owner.js:1274-1276`;
  `announceNoRole :177-189` also demotes), so it is bounded; make `enableServing`'s "exactly once"
  a latch, and route the reconstruct hardening to the timer owner (R17).
- N3 Role flips during the grant await are correct by construction (`isLeader` is current at (e);
  enable is synchronous; `onBecameLeader` is suppressed while held), but no witness drives
  LEADER->FOLLOWER->LEADER across a held grant: add it to P1's fixture schedule or record as
  uncovered.
- N4 `handleMessage` answers `{acknowledged:true}` for a raft envelope when `raft` is null
  (`wasm-service-replica.js:353-356`): an ACK without processing (transport template item 1).
  Pre-existing; the handler is retired before the port closes, so the window is the
  `retireReplicaTransportHandler` -> `port.close` gap. Raft tolerates it; not a design defect.
- N5 D4(c) says "no await between the handler retirement and the write": true for that pair, but
  the write is three awaits after `shutdown()`; the user-visible fence is R3, not this ordering.
  `commitDurably` cannot collide with apply (synchronous transactions), and the SQLite reader
  connection P4 opens does not block a WAL writer.
- N6 Writer-interest deadline (5000 ms) never delays the shutdown join: `abort` settles every
  waiter and clears its timer at `stopActivity` (`wasm-writer-completion.js:72-80,94-98`).
  Covered by the existing shutdown witnesses.

## 4. Answers to the brief's attack questions

- publishReplica vs. the queue: outside the key (D1). Consequences: not joined by
  `awaitCurrentWorkIdle` (so the shutdown join in HANDOFF-INTERFACES is not met), not coalesced
  with a wake-driven START (two concurrent publishes), and its only recheck precedes the grant.
  The design's "recheck exact replica/port/creation/READY" is necessary but placed once; it must
  follow every await and gate (d)/(e). Moving publish inside the key costs nothing: the queue is
  per replica with one key, `maxConcurrency` 1, and a merged START simply shares the result.
- LEADER->FOLLOWER during the grant: `writerCompletion.abort` has nothing to abort (publish only
  classifies); (e) sees `isLeader` false and starts no timers. Correct, unwitnessed (row 4/17).
- APPLIED_PROGRESS during the grant: enqueues a run that returns OBSERVED again and fires the
  wake unless latched (R2).
- Concurrent shutdown: R1. Replacement replica: R4. Second START from the wake: R2 (duplicate),
  R1 (unserialized).
- enableServing ordering: a FOLLOWER between grant and enable cannot start timers on a follower
  (`isLeader` read at (e)); a LEADER during enable is impossible (synchronous); double reconstruct
  is bounded by the intervening `stopAll` (N2); `replica.role` is current because
  `applyReplicaLeadership/Demotion` are unguarded for bound replicas.
- Retirement timing: R3 (reads/async writes between `shutdown()` and RETIRED), N6 (deadline),
  rows 29/37 (port still applies committed entries between RETIRED and `port.close`; late
  envelopes hit noHandler in production, throw in the fixture: H1). Order of the three replicas'
  retirement is irrelevant to correctness; the LAST is decided by `outstanding()` at J's grant;
  the wake fires per replica (three times), R6 for the cross-node reality.
- Transport: no wake or publication depends on `acknowledged:true`; the wake is a direct callback
  and the grant/close are owner CASes with authoritative rereads. The retired-handler race is
  benign in production (noHandler) and breaks the fixture (H1).
- Timers: the design introduces none; it makes reachable the mutation-helper retry (R7: bounded by
  replica lifetime, silent, survives nothing past `roleMutationHelper.shutdown()` except an
  in-flight flush) and TimerManager reconstruction (N2).
- Formation circularity: grant and close go through the gateway (component SQLite in the fixture;
  CDC routed mutation in production with `CDC_DEFAULTS.RETRY_MAX_ATTEMPTS` 6 x `RETRY_DELAY_MS`
  100 ms, `cdc-constants.js:28-29`) and surface UNAVAILABLE -> HELD / CLOSE_UNRESOLVED; no wait
  runs to a full budget beyond that readiness loop, but while it runs `publishReplica` holds the
  manager's bootstrap and (R1) cannot be joined by shutdown. A local stop never waits on metadata
  (RETIRED precedes CLOSED; D5 refuses RELEASING for exactly this reason): correct. The remaining
  circularity is at OPEN: `openReplica` requires `resolveInstanceResource` before any native
  handle (`wasm-service-replica-lifecycle.js:80-82`), so a node restart with metadata down cannot
  reopen a PUBLISHED replica (contract B1 says it may); the design's D2 widens the accepted phase
  but keeps the read mandatory. Out of this stage's scope by §0, but P6 will encode the dependency;
  say so in §7.

## 5. Harness fidelity of P1-P8 / M1-M5

- H1 (P4, P7, P8) Undeliverable throws. After any partial retirement, surviving replicas keep
  sending to the retired address; the next `deliverScheduled` replays through the original
  loopback `deliver`, which throws `No handler registered` (`partition-service-test-support.js:
  96-102`; `wasm-strong-write-native-fixture.js:63`). The plan must either never call
  `deliverScheduled` after a partial retirement (then P7's "stale callbacks enqueue nothing" and
  P8's post-close progress cannot be driven) or make the fixture answer the production shape
  `{acknowledged:true, noHandler:true}` and record it.
- H2 (P3) "select J before I publishes" proves STALE_BINDING only if the selection lands between
  publish's read and its CAS, or before publish starts; the plan must say which (use
  `holdNext('owner-a')` on the grant UPDATE for the mid-CAS variant; both are worth one case).
- H3 (P5) `loseReply` throws after applying; `commitState` rereads and returns CLOSED
  (`service-instance-metadata.js:62-71`), so `closeInstanceResource` answers CLOSED, not UNKNOWN:
  P5's "stop reports CLOSE_UNRESOLVED" is red as written, and D4(d)'s "UNKNOWN -> one resolve"
  is never exercised. To reach it the fixture needs a read fault on the gateway's
  `readAuthoritativeRows` after the lost reply (the creation fixture's `setReadFault` covers the
  journal reader only). Name that fault or re-scope P5 to "lost reply resolves to CLOSED inside
  the owner; re-stop is idempotent".
- H4 (P1) Role/leader publication is inert without CDC (R7); the endpoint remover is not set in
  the fixture (`wasm-retained-bootstrap-fixture.js:128-139`; `_removeEndpoint` returns early,
  `service-runtime-lifecycle.js:516-519`), so P4 "endpoint removed" is vacuous unless the new
  file installs a recording remover. Keep the nested-journal sink throwing (it is the only thing
  that catches a PUBLISHED path that journals).
- H5 (P4) WAL witness: at the first `closeInstanceResource` call `replica.db` is already closed
  (`closeWasmServiceConsensus :252-256` precedes D4(d)), so a fresh connection reads the
  checkpointed file: sound, provided the intercept opens its own connection and reads
  `_wasm_creation_local.phase` rather than inferring from WAL presence, and does not await
  anything that lets the test's `deliverScheduled` interleave (H1).
- H6 (P1) The delayed-wake wrapper only delays enqueues without a completion waiter
  (`wasm-retained-bootstrap-fixture.js:110-119`); a wake-driven START uses `enqueueAndWait`, so it
  bypasses the delay. If the wake fires on waited runs (R2), an explicit START both publishes and
  triggers a second START, and a test that merely asserts "published" passes for the wrong reason.
  P1 must use `automaticReconciliation:true`, make no explicit re-entry, and count re-entries.
- H7 (P6) "no second endpoint write" asserts the wrong invariant: `stopOwnedReplica` released the
  port (`wasm-service-lifecycle.js:527`) and `PortAllocator.allocate` returns the lowest free port
  (`port-allocator.js:50-68`); if it differs, a second endpoint write is required. Assert "one
  endpoint write per (replica, current port)" and an idempotent re-grant (no metadata mutation).
- Mutations: M1-M5 bind to real seams; M4 is mis-targeted (R3). Add M6 (disconnect the wake), M7
  (remove the latch), M8 (remove the post-grant recheck). `holdResponses` cannot hold the grant
  (it withholds APPEND_RESPONSE only, `wasm-strong-write-native-fixture.js:57-60`); the grant hold
  is `holdNext` on the SQLite fixture (`service-instance-creation-sqlite-fixture.js:61-79`): the
  plan should name it for P9.

## 6. Required changes (summary)

Blocking: R1 (publish inside the queue key or tracked and joined; recheck after every await;
`enableServing` gated on READY and registry identity; P9 + M8), R2 (wake predicate on waiter-free
OBSERVED, latch, unbind after PUBLISHED; P1 counting; M6/M7), R3 (bound `serving` requires
`lifecycleState === READY`; P4 read + async write; M4 retargeted).
Required: R4 (refuse bound successor while a same-identity replica is retiring), R5 (explicit
bound STOP branch; vet A owns the shape), R6 (scope the CLOSED wake as in-process; name the
cache-notification path), R7 (services-row owner or disabled publication; recording role/leader
writers in P1), R8 (typed consequence of CLOSED/STALE at re-entry on a locally PUBLISHED replica;
P6 negative), H1-H7 harness repairs, N1 (tenure term), N2 (enable latch).
Record for owners (R17): `openReplica`'s metadata read at reopen vs. contract B1;
`reconstructTimers` idempotence; `handleMessage` ACK on a null port.
