# Verdict r4: raft-rs-single-path-partition-cutover (attempts A1-A10 integrated)

Head verified: c203c85dce0b1e38158984a4e5b8d1669922e9dc (worktree
/mnt/data/peter/projects/lagrange/.claude/worktrees/raft-rs-write-path). `git status --short` before and
after: ` M solve/quests/raft-rs-single-path-partition-cutover/log.ndjson` and
`?? solve/quests/raft-rs-single-path-partition-cutover/verification-round-3.md` (both present before I
started; the lead's uncommitted A10 attempt entry and the round-3 report); I changed no repository file and
ran no git write command. The previous head 75724c71a was exercised from a read-only `git archive` copy under
scratchpad/verify/r4/prev-head (node_modules symlinked; the three A10 test files copied in for the controlled
negative; removed after this report). The sealed-head archive scratchpad/verify/sealed-head (19507fb7f tree,
verified in rounds 1-3) served the sealed receipts' red control. Every scratch script lives under
scratchpad/verify/r4/ (round-1/2/3 scripts re-run in place), each under `timeout`; `pgrep -af "node
.*(scratchpad/verify|--test)"` at the end: 0 children; no temp directory of mine survives (`ls /tmp | grep
'^r4'` empty). Thermal gate `scripts/checks/wait-for-thermal-headroom.js`: "headroom OK (cpu 58C, nvme
67.85C)" before the receipts and "headroom OK (cpu 56C ...)" before the suite batch; the batch ran at
`--test-concurrency=2`.

## Verdict: APPROVE

No item blocks. B5 and B6 (the round-3 blockers) are resolved on this head with real injection, the round-3
storm shapes re-run at +0 on every sibling, and each A10 witness is red on the previous head at its named
behavioral assertion. The six sealed receipts are green on the head (6/6, exit 0) and red on the sealed head
for the census reasons (0/6, exit 1); the 86-file suite batch (44 touched suites + boundary witness + 3
dt-movielens + 40 dt6 + 5 test/transaction files) is 1766/1766 green, exit 0; every static gate is green;
the two main reds the quest fixes are green on this head. Two in-bar findings are recorded that the lead may
weigh differently than I do (F-z and F-aa below): neither changes correctness, drops an acknowledged
obligation, touches another group, or grows any durable log; both are message-honesty / stated-bound gaps of
the mechanism A10 built.

### Blocking

None.

### Round-3 blockers, re-attacked

B6 resolved. Failure scope now follows failure class (src/raft/raft-rs-runtime-owner.js:475-486
`ensureExecution`: `replaceRuntime` only when `runtimeHealth !== HEALTHY`, i.e. after a CORE_FATAL from
`invokeCore` :247-256; a RECOVERY_REQUIRED group goes through `reconstructGroup` :448-473: `free` of its own
handle, `openGroupInCurrentRuntime(group, true)` from the durable record, `drainReady`, then
`resumeAfterReconstruction`; single-flight through the group's queue; `settleReconstruction` :422-440 sets
`retryNotBefore = attemptedAt + recoveryRetryWindowMsOf(timing)`; `insideRetryWindow` :417-420 answers
`recoveryOutcome` :403-415 with no core entry; `enqueueStep` drops inside the window :1165-1170).
Measured, real SQLITE_FULL at the application via `max_page_count`:
- scratchpad/verify/r4/rerun-r3-s7-tick-storm.out (exit 0, the round-3 shape unchanged): no calls for 2 s,
  `generationsPerSecond:0, healthyTermGrowth:0, healthyLogGrowth:0, brokenLogGrowth:0` (round 3: 50/50/50);
  `afterHeal500ms generationsBumped:0`.
- rerun-r3-s1b-scale.out (20 healthy + 1 broken, 50 reads): healthy entries/terms `40/20 -> 40/20`, read
  latency 0.0 ms (round 3: +1000/+1000, 7-13 ms).
- r4-s1-apply.out (exit 0): 20 reads on the broken partition are synchronous typed deferrals
  (`HOST_FAILURE reason:recovery-deferred phase:application attempts:1 retryAfterMs:999 role:null
  failure:{phase, reason}`), sibling `term 1->1, entries 2->2, gen 1->1`; a write during the outage is refused
  at once with `failureCode:partition_write_consensus_recovery_required, consensus:{reason:recovery-deferred,
  phase:application, retryAfterMs:998}`, `entriesAdded 0, rowB2:0`; after the heal, honouring
  `retryAfterMs`, the first successful write lands at `healToFirstSuccessMs:1006` (2 calls), `role:leader,
  gen:1, isLeaderFlag:true, rows [b0,b1,b3]` (the committed entry the host failed is applied once, then the
  next write); a second cycle is identical (`attempts:1` again, 1007 ms).
- r4-c1.out (exit 0), attempts over 10 s while the failure persists: test-default timing (tick 20, election
  1000 -> window 1000 ms) `attempts:10 <= 11`; production timing (heartbeat 150, election 1000, config tick
  20 -> window 1000 ms) `attempts:10`; deferred election (no ticks) `attempts:2` (only my two reads drove
  it); sibling `+0 term, +0 entries, +0 generations` in all three.
- rerun-r3-s5-group-outage.out: a three-replica leader's persistence outage burns `generationsBurned:0`,
  `observationMismatches:0` over 57 samples, the sole-voter sibling `[term 1, entries 2]` unchanged
  (round 3: +2/+2); `secondOutage oldLeaderObservation "false/follower"` right after the failure.
- rerun-r2-s10-delivery.out `followerPersistenceFailure`: `leaderDuring role:leader gen:1`,
  `leaderAfterFollowerOp gen:1`, `followerRecoveredAfterHeal:true` (round 3: `gen:3`, F-n) - F-n is fixed.
- W-B6-5 (core trap) still replaces the runtime once and resumes every group: suites-r4.tap `ok 289`.
- Controlled negative, scratchpad/verify/r4/a10-witnesses-prev-head.tap (75724c71a + the A10 test files,
  exit 1, 12 pass / 16 fail): W-B6-1 "sibling term unchanged while the broken partition's failure persists
  (1 -> 161)"; W-B6-2/4 x2 `partition.isLeader` "expected false, actual true" (:287, the ignore-demotion
  clause); W-B6-3 follower "the leader's term is unchanged by the follower's failure" 161 vs 162; W-B6-3
  leader "the shared runtime was not replaced" 162 vs 163; operation-port-ready-recovery "replay occurs in
  the group reconstructed in the current core" expected 1 actual 2, "a storage failure reconstructs the group
  in the current core" 3 vs 4, "closing the failed group frees its node" `'closed-without-core-entry'`.
  Red for the right reason in every case; W-B6-5 green on both heads (the retained core-failure path).
The B6 attack list: (a) above. (b) the removed single-replica ignore-demotion clause
(src/partition/partition-service-raft-init-base.js:507-516 keeps only the joining-learner clause): every
sole-voter FOLLOWER/LEADER_CHANGE(null) I could produce is either the runtime's own no-role announce (real)
or raft-rs stepping down on a higher-term message; r4-b-head.out vs r4-b-prev.out (both exit 0): a
higher-term heartbeat from a foreign peer makes a scheduled lone leader `follower term 2` and it re-campaigns
at `firstSuccessAfterMs:1063` (election timeout) on BOTH heads; a deferred-election lone leader stays
follower for the whole 3 s probe (146 refused calls) on BOTH heads until an explicit `campaign()`; the only
difference between heads is `isLeader` (head false / prev true while the port says follower) and the refusal
code (head `partition_write_not_leader` / prev null). A stale (lower-term) envelope, `configureTick`, and a
restart (scheduled and deferred) produce no role event and keep serving on both heads. The clause removal is
an honesty fix with no availability cost; the deferred-sole-voter demotion by an unreserved sender is
pre-existing and out-of-bar (finding F-ab). movielens/dt6/partition suites: green in the batch. (c) window:
attempts above; inbound dropped on a follower: raft re-delivers, the follower catches up after the heal
(W-B6-3 `ok 287`; r4-c2.out `catchUpMs:62`; r4-c2b.out `catchUpMs:730` under load) - but see F-aa for the
persistence class; a leader held by an apply-class failure: r4-c2b.out `leaderApplyFailure`: the old leader
is held (`attempts:32` over 5 s at a 160 ms window, `isLeader:false`, no heartbeats), node-2 is elected at
`5031 ms` and serves at `5035 ms`; the followers' election minimums are 2650/5150 ms (production
`JITTER_PER_REPLICA_MS` 2500) and raft-rs randomizes in [T, 2T), so 5.0 s is inside the expected range; after
the heal `converged:true, leaders:1`, rows identical on all three (finding F-ac, out-of-bar timing policy).
(d) `free`: vendor/raft-rs-wasm/src/lib.rs:541-546 is a HashMap remove (no-op for an unknown handle);
handles are a wrapping u32 counter (`hm.next.wrapping_add(1)`, :475-480), never reused; `with_node` on a freed
handle answers `jserr("invalid handle")` with `kind: "raft-rs-refusal"` (:924-927, :1270-1272) -> CORE_REFUSED,
not a trap. Measured, r4-d.out (exit 0): a leader's Ready whose sends are held, `close()` during the pending
send (`freed`), then the send released: the continuation enters the core exactly once (`advance_append@g1`)
and settles `CORE_REFUSED`; the other replica `gen [1,1], health healthy, groupHealth usable`, proposes
`CORE_OK` afterwards. `close` inside the window: `CORE_OK/closed`, one core entry (`free`), status after
`CORE_REFUSED/closed`, shutdown clean. (e) readStatus inside an announcement: r4-e.out
`insideAnnouncement`: the 'follower' and 'leader-change' listeners fired by the no-role announce read a
synchronous `HOST_FAILURE/recovery-deferred` with `attempts:0` (no reconstruction inside the group's own
operation), never a Promise, never a throw; during the heal's announcements the listeners read `CORE_OK/leader`
synchronously; a busy RECOVERY_REQUIRED follower under 30 oversized leader writes: 385 samples, `promises:0,
throws:0`; a closed failed group: `CORE_REFUSED/closed` for read/tick/step. (f) the recovery record keeps the
latest failure (`groupFailed` :191-203 replaces `failure`, keeps `attempts`; `settleReconstruction` answers
`failure.reason ?? result.reason`): by code reading only - the class change I drove (apply -> persistence) did
not hold the group (F-aa), so no mixed record was observable. (g) released pending writes: finding F-z.
(h) file size: scratchpad/verify/r4/static-node_scripts_check-file-size-thresholds.js.log "Source
oversized-file ratchet: 27/27 over 800 lines" (test 21/21), `1208 src/raft/raft-rs-runtime-owner.js
(threshold 800)` listed, no hint printed (the checker hints only when the count drops), exit 0.

B5 resolved. One admission owner src/partition/partition-committed-command-admission.js (`admitCommittedCommand`
:106-114: COMMAND_TYPE_UNKNOWN -> marker: SESSION_MISSING then MARKER_NOT_ADMISSIBLE unless origin
transaction-owner / SQL: STATEMENT_MISSING then ENTRY_ID_MISSING), asked by `applyWrite`
(partition-service-write-metrics-base.js:670-678, origin WRITE_PATH, before the settled-key read and before
consensus) and by the transaction owner's `proposeTransactionMarker` (partition-service-transaction-base.js:933-951,
origin TRANSACTION_OWNER, after the local COMMIT/ROLLBACK; a refusal is logged and nothing proposed); origin
is the call site's, never the payload's (only two call sites, grep). The type lists are the constants owner's
frozen arrays (partition-service-constants.js:168-184) with exactly one membership consumer (the admission
owner; the application asks `isCommittedCommandType`/`isCommittedSqlCommandType`, entry-apply-base.js:1032,
1062, 1148). Measured, r4-b5.out (exit 0), sixteen shapes through the production transport
(`handleTransportMessage({payload:{type:'FORWARD_WRITE', operation}})`): unknown/empty/undefined/number/object
type -> `partition_write_command_type_unknown`; PREPARE/ROLLBACK markers with a sessionId ->
`partition_write_marker_not_admissible`; PREPARE without sessionId and TRANSACTION_COMMIT without sessionId
-> `partition_write_session_missing`; TRANSACTION_COMMIT with a sessionId, and the same payload claiming
`origin:'transaction-owner'` -> `partition_write_marker_not_admissible` (the claim is ignored); non-string
and missing sql -> `partition_write_statement_missing`; each `entriesAdded:0, outcomeRowsAdded:0`, the
partition keeps serving; rerun-r3-s2-shapes.out and rerun-r3-s2b-poison.out agree on the applyWrite path and
the REPLICATE_ROWS poison (`entriesAdded:0`, restart `initialized:true`). `entryId` missing / number / empty
-> admitted with a generated UUID (partition-write-kernel.js:41-47), so ENTRY_ID_MISSING is unreachable from
every production caller (finding F-ad, minor). A direct port `propose({type:'BOGUS'})`: `readStatus` is
`HOST_FAILURE reason:committed-command-unknown phase:application failure:{detail:{index:3,
commandType:'BOGUS'}} role:null`; attempts `[1,2,3]` over two windows (single-flight, <= 3); sibling untouched;
the next write `partition_write_consensus_recovery_required`; the restart throws
`partition_single_replica_campaign_refused` naming `committed-command-unknown {"index":3,"commandType":"BOGUS"}`
with `dbReleased:true, raftNull:true`. RECORDED_ONLY remains reachable only for the transaction owner's own
PREPARE/ROLLBACK markers (no proposer waits on them; R07-honest as an application outcome).

## A10 claims, item by item

1. B6: above. 2. B5: above.
3. F-w stopped: src/admin/admin-write-receipt.js unchanged in the change set (`git diff origin/main...HEAD
--stat -- src/admin/admin-write-receipt.js` empty); rerun-r3-s3-follower-retry.out: `attestation
followerReplay {leaderNodeId:"node-2", leaderReplicaId:"r3s3-group-r2", accepting:"node-2"}` while
`actualLeaderNode:"node-1"`, `adminReceiptOfFollowerReplay complete:true`. Still open; a replay answer
does not claim a completeness it cannot prove in a way the sealed statement covers (term/logIndex are the
original's, the row is replicated committed state), so not blocking, as instructed.
4. Registry: test/shards/impact-contracts.json:475-489 `raft-rs-runtime-application-transaction` adds
src/raft/raft-rs-runtime-tuning.js and src/partition/partition-committed-command-admission.js as owners and
the pair endpoints `ready-persistence-and-reconstruction` (:885-891) and the partition endpoint (:895-902)
carry them; `impact-contract-registry.js`: "PASS (39 contracts, 16 coupled pairs)"; both witnesses
primary-classified `unit` (test/shards/primary-classes.json:1119, :1156); `generate-test-primary-classes
--check` "primary classification OK: 2162 tests"; resource/subsystem `--check` exit 0; curated shards current.
The contract description's sentence "a host failure reconstructs its own group at most once per retry window"
is true for the apply class and overstated for the persistence class (F-aa).

## Attack surface, items 1-10 on this head

1. Old-backend fallback. Closure walk (rerun-s8-closure.out): 627 modules from src/partition/partition-service.js
(+1: the admission owner), `legacy by basename: []`, `non-literal dynamic imports: []`; the seed and
registration roots likewise; liferaft reachable only from the message-group roots outside the partition
closure (unchanged). Selection spellings (rerun-r2-s12-selection.out, identical to round 3): every
`raftBackend`/`raftProvider` spelling refused `partition_consensus_backend_selection_refused`, env/nested/
uppercase and an options-supplied `createOperationPort` ignored. Restart serves from the rs store
(rerun-s2-durable-logs.out `afterRestart term 2 commit 9 role leader`, write at logIndex 10). Worker path:
no PartitionService construction under src/worker (unchanged).
2. Alternate constructor / test seam: as above; partition-construction-seam.test.js green in the batch.
3. Raw core reachability. The port keeps twelve operations (src/raft/raft-operation-port.js:5-18
`RAFT_OPERATION_PORT_METHODS`); callback contract `{command, index, term, effects}`
(raft-rs-operation-port.js:60-67). Audit on the head: `violations=0` (static-audit-head.log, exit 0);
mutants (rerun-r2-audit-mutants.out, identical to round 3): M1/M2/M4/M5/M7 caught, M3/M6/M8 not (F-s open).
Boundary witness in the batch (`ok 455 - the partition receives only a frozen operation port and immutable
snapshots`, `ok 459 - the operation boundary removes public capability instead of renaming it`).
4. Stale durable-state reuse / second durable log. Detector matrix rerun-s1-detector.out identical to round 3
(13 cases; F-k edges open; F-u residue open). Second log rerun-s2-durable-logs.out: `_raft_log`/`_raft_state`
`null` at all nine steps, one payload entry per proposal; B6's unbounded `_raft_rs_log` growth on healthy
groups is gone (r4-c1 sibling `entries 2->2` over 10 s; the broken group's own log `entries 3` throughout).
5. Test stand-in. The W-B6 witnesses run production PartitionService on file dbs with real `max_page_count`
injection and the production admission fixture; observations are the port's `readStatus` and the store
owner's reader on an independent read-only connection (a prototype view, no DDL); the B5 witnesses drive
`applyWrite` and `handleTransportMessage` on production construction; the ready-recovery witness uses the
PartitionNodeCluster harness (real ports). The retry window bound is asked of the tuning owner
(`recoveryRetryWindowMsOf`), not asserted as a literal; my r4-c1 measured the bound independently.
6. Acknowledgement. rerun-r2-s3-ack.out identical to round 3 (ack after the applied transaction; same-entryId
retries answered from the row in process and after restart; CDC once). rerun-r2-s3b-full-apply.out: the
environmental failure is never acknowledged, applied once after the heal, `afterRestart busyEntriesOnDisk:1,
busyOutcomeRows:["applied"]`; the script's immediate post-heal write is now refused inside the window
(`afterHealInProcess success:false`), which r4-s1 shows lands after `retryAfterMs`. No write is acknowledged
during a reconstruction outage (r4-s1 `rowB2:0`; W-B6-1 "acknowledged nothing it did not apply"). Released
pending writes: F-z.
7. Session-transaction isolation layer 1. rerun-s4-session.out identical to round 3 (tick/campaign/probe
typed `user-transaction-open`, durable record unchanged, markers after COMMIT/ROLLBACK, F-d still erased,
deferred write at 356 ms, budgets 2000 ms). New: r4-e2.out (exit 0), a group held RECOVERY_REQUIRED across a
session whose window passes and whose host heals inside the session: `coreEntriesForGroupInSession:0`,
`recordUnchanged:true`, reads `HOST_FAILURE/recovery-deferred/a1` synchronous, tick `user-transaction-open`,
after ROLLBACK the first read reconstructs (`CORE_OK/leader`) and the write lands. rerun-r3-s6: a sibling's
reconstruction writes nothing inside the session-holder's transaction. F13 demotion under a long session
(rerun-s5b-demotion.out): new leader at round 44 / ~440 ms in the harness (round 3: 18 / 180 ms; the
mechanism is the same, timing noise), explicit unavailability as F13 says - a finding, not a rejection.
8. readStatus synchrony. rerun-s6-readstatus.out identical (busy queue, follower, user transaction, closed,
retired: all `sync`); r4-e.out adds inside-announcement, busy RECOVERY_REQUIRED and closed-failed cases, all
synchronous, none a Promise, none a throw.
9. Runtime failure isolation. rerun-r2-s10-delivery.out: seven per-peer delivery failure modes isolated
(`gen:[1,1,1]`, leader keeps role, catch-up after heal); a follower's real persistence failure no longer
replaces the shared runtime (`leaderDuring gen:1`), F-n fixed; a lone leader's application or persistence
failure recovers in process (rerun-s7-recovery.out `writeAfterHostFailure success:true gen:1`); only a core
trap replaces the runtime (W-B6-5). Design Q4 (UNRECOGNISED fails closed) holds and is now unreachable from
every production proposer (B5).
10. Recovery/replay. applied <= commit at every boundary (r4-s1 `commit 3 / applied 2` during, `5/5` after;
r2-s3b `4/4` after restart); the restore re-delivers the gap exactly once (`boomApplications:1`,
`busyEntriesOnDisk:1`); HLC warms from applied commands (rerun-s7 `1790173875045-7-other-replica` ->
`...-9-s7-hlc-r1`); prepared-state reconstruction still lost across restart (F-a). A poisoned partition's
restart fails closed typed and releases the db (r4-b5 `restart`).

## Findings, grouped by category (new this round)

owner-interaction / R19 (in-bar, not blocking in my judgment):
- F-aa. The retry window engages only for failures that recur inside the reconstruction (a committed entry
  whose application fails; bootstrap persistence). A persistence-class failure whose Ready is gone after
  the restore (a follower whose store cannot persist the leader's append; a leader whose oversized proposal
  cannot be appended) reconstructs successfully at once, becomes usable, and fails again on the next Ready:
  the group is reconstructed once per failing Ready, not once per window. r4-c2b.out (exit 0), three-replica
  group, follower store at `max_page_count = page_count`, the leader serving 60 KB writes for 2 s
  (`leaderWritesServed:448`): `followerReconstructions:28` (`reconstructionsPerSecond:14`, 28 `free` + 28
  `create_node`, each a full `readDurableRecord`), `followerAnnouncementsEmitted:55` (LEADER_CHANGE null then
  the leader again, each cycle, i.e. info-level transition evidence twice per cycle), `attemptsSeen:[]`,
  `retryAfterPositiveSeen:[]` (the window never engaged), `statusKinds {CORE_OK/follower:225,
  HOST_FAILURE:7}`; the leader `term 1, gen 1` untouched, the follower's log does not grow (`entries 4`), and
  after the heal it catches up in 730 ms. The same on a lone leader: r4-s1-persist.out `stormFirst CORE_OK
  leader`, `attempts:null`, each retried oversized write costs the broken partition its own +1 term / +1
  empty entry (sole-voter re-campaign) and a log reload, bounded by the client's retry rate. No other group
  is touched and nothing durable grows on any healthy group, so the round-3 blocker's substance is fixed;
  but the tuning owner's comment (raft-rs-runtime-tuning.js:40-44 "never one per operation") and the
  contract description overstate the bound for this class. Owner: the runtime owner (remember the failure
  class on the group so a re-failure within one window of a successful reconstruction engages the window),
  or correct the stated bound. The cost is proportional to log length (no compaction, epic F5).
- F-z. A pending proposal released by the no-role announce is answered `{success:false, error:"No leader
  available for write operation", partitionId}` with no `failureCode` while its entry is on the leader's disk
  and later commits on every replica. r4-g.out (exit 0), three-replica group, the leader's outgoing dropped
  so write A stays pending, then write B whose Ready persistence fails: `aResult {success:false, error:"No
  leader available for write operation", keys:[success,error,partitionId]}`, `aOnLeaderDisk:true`, after the
  heal `aLandedAnywhere:true` (row-A on all three replicas), a same-entryId retry `idempotentReplay:true`
  (the durable outcome row answers it, so a retrying client is safe). B is answered `{success:false,
  error:"Raft operation HOST_FAILURE: database or disk is full"}` with no `failureCode` either. The shape is
  pre-existing (the sealed head and 75724c71a release with the same message:
  partition-service-raft-lifecycle-wiring.js:64-65 `clearPendingCommittedWrites(ERRORS.NO_LEADER_AVAILABLE_FOR_WRITE)`),
  but A10 built `PROPOSAL_QUEUE_RELEASED_CODE` (proposal-queue.js:161-163) and consults it only for answer
  precedence (partition-service-raft-write-commit.js:166-170) without surfacing it: the client cannot tell
  "not proposed" from "proposed, outcome unknown". R07; in-bar for the write-path owner; not blocking
  because no acknowledgement is wrong and the retry is idempotent.

admission-gating (minor, in-bar):
- F-ae. Message honesty of the typed recovery refusal: `error` says "No leader available for write
  operation" while `failureCode` is `partition_write_consensus_recovery_required` (r4-s1-apply.out
  `writeDuringOutage`); the environmental-failure and persistence HOST_FAILURE write results carry
  `failureCode:null` (r4-s1 `injected`, r4-c1 `bigWrite code:null`, unchanged since round 3).
- F-af. Inside a user session a held group's write is refused `consensus_recovery_required` with
  `reason:recovery-deferred` and `retryAfterMs` ~0 rather than the `deferRetry` deferral (r4-e2.out
  `sessionlessWrite`): `reconstructGroup` :455-457 answers RECOVERY_DEFERRED for both "inside the window" and
  "persistence not admitted", so a caller retrying on `retryAfterMs` spins until the session ends (no core
  entry per retry; bounded only by the caller).
- F-ad. ENTRY_ID_MISSING is unreachable from every production caller (`buildPartitionWriteEntry` assigns a
  UUID; r4-b5 `entryId-missing/number/empty` admitted and applied). A guard of the owner's contract, not
  vacuous code, but a wire `entryId: 42` becomes a fresh UUID so such a client's retry is not idempotent
  (pre-existing).
- F-ag. The recovery status has no `runtimeGeneration`/`peerId`/`commitIndex` fields (recoveryOutcome
  :403-415); W-B6-3 (leader) reads `during.runtimeGeneration ?? generationBefore`, which hides the absence
  (harness-fidelity item 5, minor).

recovery-replay / out-of-bar (recorded for their owners):
- F-ab. A deferred-election sole voter demoted by a higher-term message from an unreserved sender never
  re-campaigns (no ticks): writes refused until an explicit `campaign()` (r4-b-head.out
  `deferred-higher-term`), identical on 75724c71a; the ingress admits envelopes whose `from` is unreserved
  (src/raft/raft-rs-ingress.js checks groupId and `to` only). Owner: R5 "no stale/retired replica can tick,
  campaign, or re-enter core" and the re-campaign path of a deferred lone voter.
- F-ac. With the production per-replica jitter (2500 ms) and raft-rs's [T, 2T) randomization, a group whose
  leader is held fails over to another replica in ~2.7-5.3 s (measured 5.03 s), not within the leader's own
  election timeout; the old leader's partition observes no leadership meanwhile. Owner: election timing
  policy (R5 election settings).

## Still-open findings from rounds 1-3, current status with fresh evidence

- F-a prepared 2PC session lost across restart: still open (rerun-s7 `preparedAcrossRestart
  commitAfterRestart "No active transaction to commit"`).
- F-b/F13 leader demotion under a long session: still open (rerun-s5b round 44 / ~440 ms); a finding.
- F-c/F9 host failure wedges the lone leader: FIXED (rerun-s7 `writeAfterHostFailure success:true gen:1`;
  r4-s1 both cycles).
- F-d/F12 peer-identity reservation erased by a session ROLLBACK: still open (rerun-s4
  `peerIdentityAfterRollback peerIdOfJoiner:null rowOnDisk:0`).
- F-e/F10 db handle on a refused init: the campaign-refusal path releases it (r4-b5 `restart dbReleased:true,
  raftNull:true`; rerun-r2-s9-inert `dbNull:true`); the warm-up undecodable-entry path still by code reading
  only (raft-init-base.js unchanged there): open for that path.
- F-f campaign refusal: FIXED; F-u init-refusal DDL residue: still open (rerun-s1 `legacy-beside-rs-record
  tablesAddedByAttempt` non-empty).
- F-g S31 startup names the retired provider: still open (src/lagrange-runtime-startup.js:18, :717
  `ensureLiferaftProviderForRuntime`, file untouched by the change set).
- F-h admission outcomes: FIXED; F-v QUEUED counted current: still open (peer-cache-reconciliation.js
  changed only for F16 shapes, not this).
- F-i deterministic/environmental boundary: closed (r2-s3b reruns agree).
- F-j 2 s inner deferral budget: still open (rerun-s4 `writeDeferBudgetMs:2000`, deferred write at 356 ms).
- F-k detector edges (`lastAppliedIndex` alone, non-numeric `currentTerm` start): still open (rerun-s1
  identical).
- F-l verifier incident: n/a.
- F-m lone-leader wedge: FIXED (narrow form; witness `ok 284-285`; red on 75724c71a at :287).
- F-n runtime blast radius (a follower's persistence failure replaced the shared runtime for the leader):
  FIXED (rerun-r2-s10 `leaderDuring gen:1`, `leaderAfterFollowerOp gen:1`; W-B6-3 `ok 287`).
- F-o cache/shape divergence: FIXED; residual F-w still open (above).
- F-p malformed shapes: FIXED for every shape (r4-b5, rerun-r3-s2/s2b); B5 resolved.
- F-q stale-address REMOVE_PEER without replicaIdentity refused by shape: still open (module untouched for
  this; rerun-r2-s3c identical).
- F-r `_partition_statement_outcomes` growth with no compaction: still open (constants comment only); the
  B6 `_raft_rs_log` growth on healthy groups is FIXED; the broken group's own reconstruction cost grows with
  log length (F-aa).
- F-s audit strength (M3/M6/M8 undetected): still open (rerun-r2-audit-mutants identical).
- F-t active-legacy reference census: metric 1735 on this head (round 3: 1729), exit 1, not a gate of this
  quest.
- F-u, F-v: still open (above).
- F-w self-attested leader identity in a replay answer / admin receipt "complete": still open (above).
- F-x `Object.freeze(new Set(...))`: FIXED - the lists are frozen arrays (partition-service-constants.js:168-184;
  `node -e`: a frozen array's `push` throws TypeError, a frozen Set still grows to size 2).
- F-y TRANSACTION_COMMIT without sessionId acknowledged: FIXED (`partition_write_session_missing`, r4-b5 and
  rerun-r3-s2 `transaction-commit-via-applyWrite`).
- B5, B6: resolved (above). Epic F3 (unrecognised committed command silent no-op): closed by B5 + Q4.

## Templates

### admission-gating
1 Precheck-predicts-enforcement: `applyWrite` and the transaction owner ask the same owner the application
asks (`isCommittedCommandType`, entry-apply-base.js:1032; `admitCommittedCommand`, write-metrics-base.js:670,
transaction-base.js:934): the precheck admits exactly what enforcement applies, for every type, statement and
session shape (r4-b5, sixteen shapes, `entriesAdded:0` each; the admitted shapes apply). The settled-key
precheck reads the same outcome row the application reads (unchanged).
2 Transient vs terminal: admission refusals are terminal for the request, typed
(`PARTITION_COMMITTED_COMMAND_ERROR_CODE`); `partition_write_consensus_recovery_required` is retryable with
`retryAfterMs` (r4-s1); `partition_write_not_leader` terminal for this replica; `user-transaction-open`
retryable deferral; UNRECOGNISED at apply time terminal for the partition by design (Q4), now unreachable
from production proposers.
3 Which budget governs: the recovery retry window is the tuning owner's one election timeout
(`recoveryRetryWindowMsOf`, raft-rs-runtime-tuning.js:45-47; 1000 ms at production and test-default timing,
r4-c1); the write deferral 2 s (F-j); no budget was raised.
4 Reason shape: port outcomes objects with `reason`, `phase`, `failure:{phase, reason, detail}`,
`retryAfterMs`, `attempts`; write results carry `failureCode` strings for admission and leadership refusals
and `consensus:{reason, phase, retryAfterMs}` for the recovery refusal (write-kernel.js:147-164); host
failures and released proposals expose only `error` text (F-z, F-ae).
5 Hold release: the host heal + the next operation after `retryNotBefore` (r4-s1 1006 ms measured, one
window); a session end for the layer-1 deferral (356 ms); no polling timer drives recovery on a
deferred-election partition (r4-c1 `production-deferred attempts:2`), i.e. the next client operation is the
release path (event-driven by the caller).
6 Freshness: `timers.now()` per decision (`insideRetryWindow` :417-420); `persistenceAdmitted` per
reconstruction; the durable record re-read per attempt (`createNodeArguments` :274-296, read twice per
attempt: minor).
7 Message honesty: the recovery outcome names the original failure's phase/reason/detail and the attempt
count (r4-s1, r4-b5 `detail:{index, commandType}`); the restart refusal names the unknown command; F-ae,
F-af, F-z as recorded.

### recovery-replay
1 Never clobber live with stale: `reconstructGroup` restores only the failing group from its durable record;
`replaceRuntime` still restores every group only on a core fatal (W-B6-5); the queue makes the
reconstruction single-flight (r4-e `busyRecoveryQueue`, r4-b5 attempts `[1,2,3]`); a stale continuation from
before a group's close answers CORE_REFUSED (r4-d), never enters a new node (handles never reused).
2 Restart vs live: `hasDurableRecord` at open; a reconstruction restores as a restart would (`applied` =
durable applied) and re-delivers the committed gap once (r4-s1 rows `[b0,b1,b3]`); the discriminator for "the
failure that held me persists" is the failure recurring inside the drain (F-aa: absent for the persistence
class).
3 Lost-enlistment refusal: F-a still open.
4 Replay idempotence: the durable outcome row is the sole authority (rerun-r2-s3-ack, r3-s3 followers, r4-g
`retryOfA idempotentReplay:true`); rollback clears it by rolling back.
5 Absence proves nothing: a missing row is UNSETTLED; a released proposal is answered as a failure while its
entry may commit (F-z: the client is told "no leader", not "unknown").

### owner-interaction
1 Single owner: "may this command be proposed" has one owner for both proposers (admission owner); "who
leads" is the core's, and the partition's `isLeader` now follows the port's announce with no local
single-replica exception (r4-b: head flag false when the port says follower; prev-head true).
2 Typed boundary: `PARTITION_COMMITTED_COMMAND_ORIGIN` (call-site, never payload), `PARTITION_COMMITTED_COMMAND_ERROR_CODE`,
`PARTITION_WRITE_LEADERSHIP_REFUSAL`, `PROPOSAL_QUEUE_RELEASED_CODE`, `RUNTIME_REASON.RECOVERY_DEFERRED /
GROUP_RECONSTRUCTED`; the released code is typed at the queue but not at the write result (F-z).
3 Paired invariants in one witness: W-B6-1 holds "sibling +0 term/log/gen" + "typed deferral inside the
window" + "attempts <= ceil(elapsed/window)+1" + "nothing acknowledged unapplied" in one deterministic witness
with real injection, red on 75724c71a at the sibling-term assertion; W-B6-2/4 pair "does not lead during the
outage" with "serves after the heal in the same core".
4 Stale-then-fresh: a remembered status survives two cycles (r4-s1 `secondCycle`); a settled row answers a
later retry after a release (r4-g).
5 Pressure/backoff: PASSES for the apply class (10 attempts / 10 s, no sibling work, no durable growth);
the persistence class reconstructs per failing Ready (F-aa: 14/s confined to the group, no durable growth
anywhere); repeated reads never amplify (r3-s1b 0.0 ms, 50 reads, attempts unchanged).
6 Wake/release: the heal is observed by the next operation after the window; on a deferred-election
partition only a caller wakes it (no timer) - acceptable since the seed's writes are the callers, recorded
under item 5 of admission-gating.
7 Projection authority: `isLeader` follows the port (the clause removed); the write path reads the port
(`consensusStatus`); the recovery status is the port's own typed state, not a cached projection.
8 Controlled negative: receipts 0/6 on the sealed head for the census reasons; the A10 witnesses 16 red on
75724c71a at their named behavioral assertions (a10-witnesses-prev-head.tap).
9 No local escape hatch: no `this.storage`/`logAdapter`/DIRECT mode; no options-supplied port; the
transaction owner's markers go through the same admission owner; no second interpretation of the type lists
(grep: one consumer).
10 Contract + registry + proof aligned: owners, endpoints and witnesses changed together (A10 diff of
impact-contracts.json, impact-graph-seal.json, subsystem-classes.json); registry PASS; metadata current; the
contract's "at most once per retry window" sentence is overstated for the persistence class (F-aa: a text
correction or a mechanism extension is owed by the owner).

### harness-fidelity
1 Red for the right reason: a10-witnesses-prev-head.tap names the assertions (sibling term 1 -> 161;
isLeader true; generation +1; close reason); receipts-sealed.tap names the census reasons.
2 Stub honesty: W-B6 and B5 witnesses use no stub (real `max_page_count`, real transport handler); the
ready-recovery witness's `faultableDatabase` proxy injects a thrown store transaction (the class the store
raises); the B4 double unchanged since round 3 (rerun-r3-s4-double `addressesEqual:true`).
3 Time fidelity: group witnesses heartbeat 20 / election 150-300 (+ production jitter 2500/replica) / 10 s
budget; the window = electionTick x tick (160 ms for r1 at that timing, 1000 ms at production); ordering
(tick < heartbeat < window = election < jittered follower timeouts < budget) preserved; the fixture's config
tick 20 ms applies at production timing too (r4-c1 `production-scheduled tick:20`).
4 Field fidelity: entries carry entryId/proposedBy/proposedAt/timestamp; the recovery outcome carries
`failure.detail {index, commandType}` for the apply-time refusal; the recovery status lacks generation/peer
fields (F-ag).
5 Vacuous assertions: W-B6-1's `attempts <= ceil(elapsed/window)+1` depends on the tuning owner's window
being sane (a 1 ms window would admit a storm); my r4-c1 measured 10 attempts at a 1000 ms window
independently; "reads inside the window are typed deferrals" needs at least one deferral, which the quiet
period guarantees; W-B6-3 (leader) `during.runtimeGeneration ?? generationBefore` can pass when the field is
absent (F-ag) - the follower-side generation assertions and the row assertions carry the claim.
6 Live binding: receipt 1 is the live seed; W-B6 binds the live runtime owner with real SQLITE_FULL; the
movielens witness is double-bound (coverage note from round 3 stands).

## Commands run (counts, exit codes)
- Static (scratchpad/verify/r4/static-r4.out): check-complexity 1814/1814 exit 0; check-unused-exports
  1437/1437 exit 0; check-file-size-thresholds 27/27 + 21/21 exit 0 (no hint); check-no-legacy-naming exit 0;
  check-curated-test-shards exit 0; generate-test-{primary,resource,subsystem}-classes --check exit 0 (2162
  tests); impact-contract-registry PASS 39/16 exit 0; check-quest-log-append-only exit 0;
  active-legacy-consensus-reference-audit metric 1735 exit 1 (census, not a gate); eslint on 98 changed js
  files exit 0; audit-runner on the head `violations=0` exit 0.
- Receipts (suites-r4.out): head 6 pass / 0 fail exit 0 (r4/receipts-head.tap); sealed-head archive 0 pass /
  6 fail exit 1 (r4/receipts-sealed.tap).
- Suites (r4/suites-r4.sh, thermal gate OK before each batch, `--test-concurrency=2`): 86 files
  (r4/suite-files-r4.txt): 1766 tests, 1766 pass, 0 fail, 0 cancelled, exit 0, 77.0 s (r4/suites-r4.tap);
  incl. `ok 10 - authoritative replica deletes prune departed peers ... MovieLens cohort` (:352), `ok 97 -
  fitness contract: the durability detector marks the leader unfit ...` (:4124), W-B6-1..5 `ok 284-289`, B5
  `ok 252-259`, ready-recovery and boundary witnesses.
- A10 witnesses on the 75724c71a archive: 12 pass / 16 fail, exit 1 (r4/a10-witnesses-prev-head.tap).
- Scratch (r4/run-r4.out, run-r4b.out; all exit 0 after the r4-d harness fix): r4-s1-heal apply/persist,
  r4-b-demotion head/prev, r4-b5-transport, r4-d-stale, r4-e-readstatus, r4-e2-session-hold, r4-g-released,
  r4-c2-follower, r4-c2b-follower-loop, r4-c1-attempts (10 s x3).
- Reruns of rounds 1-3 (r4/rerun-r4.sh, all exit 0): s1-detector, s2-durable-logs, s4-session,
  s6-readstatus, s7-recovery, s5b-demotion, s8-closure, s9-inert, r2-s3-ack, r2-s3b x3, r2-s3c-group,
  r2-s10-delivery, r2-s9-inert, r2-s12-selection, r2-audit-mutants, r3-s7-tick-storm, r3-s1-storm apply/persist,
  r3-s1b-scale, r3-s2-shapes, r3-s2b-poison, r3-s3-follower-retry, r3-s4-double, r3-s5-group-outage,
  r3-s6-resume-session.
- Hygiene: `git status --short` unchanged (the two pre-existing entries); `pgrep` 0 children; prev-head
  archive removed after this report; no /tmp directory of mine left.

## Not verified
- The whole corpus on this head (86 files run; the quest log records suite counts for A10, no corpus run).
- B6 at 135 groups on a seed: extrapolated from 21 groups (r3-s1b rerun) and the per-group counts.
- A follower held by an apply-class failure (window engaged, inbound dropped) and its catch-up: covered
  only by the leader-side apply case and the follower-side persistence case.
- (f) a recovery record whose failure class changes while held: by code reading only (the class change I
  drove did not hold the group).
- F10's warm-up path and snapshot install/catch-up: by code reading, inert by construction.
- The main reds sea-bundle-smoke and production-scheduling-defaults: out-of-bar main debt owned by
  fixes/main-corpus-green-2026-09-23, not run.
