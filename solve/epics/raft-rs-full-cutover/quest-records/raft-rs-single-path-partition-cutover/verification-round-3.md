# Verdict r3: raft-rs-single-path-partition-cutover (attempts A1-A9 integrated)

Head verified: 75724c71a88d398f0d63a43e57a9a9b822f90896 (worktree
/mnt/data/peter/projects/lagrange/.claude/worktrees/raft-rs-write-path). `git status --short` before and
after: only ` M solve/quests/raft-rs-single-path-partition-cutover/log.ndjson` (the lead's uncommitted A9
attempt entry, present before I started); I changed no repository file and ran no git write command. The
sealed-head archive under scratchpad/verify/sealed-head is the 19507fb7f tree (three sampled files
sha256-identical to `git show 19507fb7f:<path>`); the sealed witness file
test/raft/raft-rs-backend/single-path-partition-cutover.test.js is unchanged since 6e4fe787c (`git diff
--stat 6e4fe787c HEAD -- <file>` empty). The previous head 380d96d23 was exercised from read-only `git
archive` copies (scratchpad/verify/r3/prev-head, removed afterwards). Every scratch script lives under
scratchpad/verify/r3/ (round-1/2 scripts re-run in place from scratchpad/verify/ and verify/r2/), each under
`timeout`; `pgrep -af "node .*(scratchpad/verify|--test)"` at the end: 0 children; my one leftover temp
directory (/tmp/r3s4-*, from a first s4 run that threw before its cleanup) was removed. Thermal gate
`scripts/checks/wait-for-thermal-headroom.js`: "headroom OK (cpu 73C, nvme 67.85C)" before the static batch,
"headroom OK (cpu 59C ...)" before the receipts and again before the suite batch; the batch ran at
`--test-concurrency=4`.

## Verdict: REJECT

B4 (the round-2 blocker) is resolved. Two new items block, both measured on this head with real
injection and both with a controlled negative on the previous head 380d96d23. The six sealed receipts are
green on the head (6/6, exit 0) and red on the sealed head for exactly the census reasons (0/6, exit 1); the
83-file suite batch (44 touched suites + boundary witness + 3 dt-movielens + 40 dt6 files) is 1708/1708
green; every static gate is green; the F-m witness is red 0/3 on 380d96d23 at its named behavioral
assertions.

### Blocking

B5 (in-bar: the F-p class A9 took on, R07/R11, reachable from the production transport). A write whose
`type` is not a recognised committed command type is proposed, committed and then fails the application
closed forever: the partition is permanently unavailable, in process and across restarts, from one
malformed forwarded write. `applyWrite` refuses a sql-less SQL-typed write before consensus
(src/partition/partition-service-write-metrics-base.js:664-680) but proposes an unknown-typed one; the
application throws UNRECOGNISED inside the apply transaction
(src/partition/partition-service-entry-apply-base.js:1023-1033), the runtime marks RECOVERY_REQUIRED, and
every later operation re-delivers the same committed entry. Evidence (scratchpad/verify/r3/r3-s2.out,
exit 0): `unknown-type`, `empty-type`, `undefined-type` each `entriesAdded:1, commit 2->3, applied 2->2`,
status `HOST_FAILURE role:null`, next write "No leader available for write operation", and after a restart
`initialize()` throws `partition_single_replica_campaign_refused` ("the consensus port refused its campaign
(HOST_FAILURE: Committed partition command type is not recognised"). Reachability: the production transport
handler dispatches `FORWARD_WRITE` payloads straight into `applyWrite(payload.operation)`
(entry-apply-base.js:203-247 -> 340-344) with `operation.type` taken from the wire;
scratchpad/verify/r3/r3-s2b.out (exit 0): one `handleTransportMessage({payload:{type:'FORWARD_WRITE',
operation:{type:'REPLICATE_ROWS', sql, entryId}}})` -> `enteredConsensus {entriesAdded:1, poisonOnDisk:true}`,
`nextWriteOnPoisoned success:false`, `restart threw partition_single_replica_campaign_refused`, rows on disk
`["r0"]` only. Round 2 recorded F-p as "reachable only through a direct applyWrite/propose"; it is reachable
through the cluster transport. The write path holds `PARTITION_COMMITTED_COMMAND_TYPES`
(partition-service-constants.js:175-180) and can refuse before consensus exactly as it refuses the sql-less
shape; proposing an entry the proposer knows cannot be applied is the one-write-path owner's defect. The
markers via applyWrite remain the round-2 shape: `prepare-marker-via-applyWrite` and
`rollback-marker-via-applyWrite` are proposed, consumed RECORDED_ONLY and never answer the proposer
(`PENDING(>1500ms)`, r3-s2.out), i.e. they wait for the 30 s PENDING_REQUEST_TIMEOUT
(partition-service-constants.js:19); `transaction-commit-via-applyWrite` with no sessionId is acknowledged
`success:true` and writes a `_transaction_outcomes` row for a normalized-null session.

B6 (in-bar under the recorded F-m widening, log.ndjson 2026-09-23T11:45:20.230Z; R12/R13; a regression
against the previous head). The F-m mechanism resumes every restored group on every runtime reconstruction
(src/raft/raft-rs-runtime-owner.js:315-344 `replaceRuntime` -> :298-309 `resumeAfterReconstruction` ->
:718-740 `campaignGroup` for a sole voter), and reconstruction still happens on every operation of a group
whose failure persists (`ensureExecution` :346-351 on `group.health === RECOVERY_REQUIRED`; `readStatusUndrained`
:692-696; `perform` :871). So while one partition's host failure persists, every sole-voter partition in the
process campaigns again on every tick, read or write of the broken one: +1 term and +1 durable
`_raft_rs_log` entry each, unbounded and self-driven by the broken partition's own tick timer (the port
starts scheduling on construction unless the election is deferred, src/raft/raft-rs-operation-port.js:288-290).
Measured, real SQLITE_FULL at the application via `max_page_count` (the store's own writes still fit):
- scratchpad/verify/r3/r3-s7.out (exit 0), no calls at all for 2 s: `generationsPerSecond:50,
  healthyTermGrowth:50, healthyLogGrowth:50` per second on the healthy sibling partition (tick 20 ms from the
  50 ms test heartbeat; production HEARTBEAT_DEFAULT_MS 150, src/raft/constants.js:50, gives a 50 ms tick =
  20 reconstructions/s per broken non-deferred partition).
- Controlled negative on the previous head 380d96d23 (r3-s7-prev-head.out, exit 0): the same 50
  reconstructions/s but `healthyTermGrowth:0, healthyLogGrowth:0` (the sibling was wedged as follower: F-m).
  A9 traded the wedge for unbounded durable growth on every unrelated sole-voter group.
- r3-s1-apply.out: 20 `readStatus()` calls on the broken partition (52 ms): healthy sibling term 1->21, log
  2->22 entries, runtimeGeneration 1->21; the broken partition's own log 3->23.
- r3-s1b.out: 20 healthy partitions + 1 broken, 50 reads: healthy logs +1000 entries and +1000 terms in
  total (50 each), per-read latency 7 -> 13 ms and rising with log length (each restore reloads every log),
  versus 0.03 ms for a read on a healthy partition.
- r3-s5.out: a three-replica group's two reconstructions cost the lone-voter sibling in the same process
  +2 terms / +2 entries; r3-s2b.out: 10 client writes to the B5-poisoned partition cost the healthy sibling
  +10 terms / +10 entries.
In a seed process (~135 partitions on one node) one persistent host failure becomes ~135 core restores plus
~135 fsynced appends per tick, growing quadratically, with no rs-raft log compaction (epic F5). The narrow F-m
requirement itself holds (r3-s1-apply.out `afterHeal success:true role:leader isLeaderFlag:true`, second cycle
too; witness 3/3), but the mechanism that delivers it is a repair storm (owner-interaction template item 5).
The lead may judge the storm's re-entry (per-operation reconstruction) as the deferred F-n blast radius; the
durable side effect on unrelated groups is new on this head and is what I block on.

### Round-2 blocker, re-attacked

B4 resolved. test/convergence/dt-movielens-raft-peer-cohort-pruning-election.test.js: 20/20 in the batch
(scratchpad/verify/r3/suites-r3.tap line 352 `ok 10 - authoritative replica deletes ...`, 20 subtests ok, incl.
`ok 2 - the bootstrap voters are the port's initial configuration: nothing is proposed for them`, `ok 4 - r1
leads the bootstrap cohort`, `ok 5 - the accepted deletes retire r2/r3 and the reconcile admits r4/r5`, `ok 19
- row absence alone proposes no retirement`). Double honesty (scratchpad/verify/r3/r3-s4.out, exit 0): the
same request through production construction (real port, file db, replicaIds r1/r2/r3, deferElection,
resolvable peerAddresses) and through the double report identical `peers` for the fields the witness reads
(`addressesEqual:true`: address + replicaIdentity of r2/r3, `peerCount:2`), the real port proposes nothing for
bootstrap voters (its voters come from BOOTSTRAP_PEER_IDS, src/raft/raft-rs-operation-port.js:117-119;
`peerSnapshot` excludes the local peer, src/raft/raft-rs-status-observation.js:45-54, as the double does,
test/partition/partition-service-test-support.js:123-136). Differences that the witness does not read: the
double omits `learner`/`addressStatus`/`delivery`, starts at term 1 (real: 0), and answers `campaign()` LEADER
by fiat where the real port becomes CANDIDATE (`realCampaignWithoutPeers roleAfter:"candidate"`), which the
witness header states ("this double cannot witness a real vote"). Explicit `peers` are kept
(`explicitPeersKept`). No original assertion weakened: versus the sealed-head file (`git show 19507fb7f:...`),
every prune/replace/stale-delete/mismatched-evidence/row-absence assertion survives and three proposal-shape
assertions were added; the one dropped claim, "r1 reaches leadership through real vote and append RPCs after
peer retirement", was a LifeRaft-network assertion and is recorded in the header as needing a live-voter
witness (round-2 harness item 6 stands as a coverage note). The pruning mechanism is exercised: the
REMOVE/ADD proposals are produced by the production reconcile
(src/partition/partition-service-raft-peer-cache-reconciliation.js:160-185, :263-270) and asserted by shape;
the leader shortcut only satisfies the admission owner's NOT_LEADER gate
(src/partition/partition-service-raft-membership-administration.js:120-134).

## A9 claims, item by item

1. B4: above.

2. F-m (runtime reconstruction resumes leadership). Witness 3/3 in the batch (`ok 276-278`), red 0/3 on
380d96d23 at the named assertions (scratchpad/verify/r3/fm-witness-prev-head.tap: "the next write after the
host heals succeeds without a restart ({success:false, error:'No leader available ...'})" x2, "the old
leader's leadership observation follows its port right after the reconstruction (port role follower) true
!== false"), i.e. red for the right reason. Attacks: (a) during the outage `readStatus()` answers
`HOST_FAILURE phase:application role:null` synchronously (r3-s1-apply.out `stormFirst/stormLast`) and
`isLeader` stays true (`p2IsLeaderFlag:true`; the single-replica demotion guard
src/partition/partition-service-raft-init-base.js:504-512 ignores the FOLLOWER announce); a write during the
outage is NOT acknowledged (`writeDuringOutage success:false "No leader available"`, `rowB2:0`); each read
retries reconstruction: B6. (b) Other groups' campaigns/announcements run inside the triggering group's
operation (runtime-owner.js:333-342): measured cost above (F-n blast radius, widened by B6). (c) A second
reconstruction keeps the remembered status: r3-s1-apply.out `secondCycle {healed:true, role:leader,
isLeaderFlag:true}`; r3-s5.out `secondOutage oldLeaderObservation "false/follower"` then `afterSecondHeal
leaders:1`, rows identical on all three replicas. (d) Resume never campaigns a non-sole voter: `isSoleVoter`
(:287-290) requires one voter, no outgoing voters; the three-replica case only announces (r3-s5.out roles all
`follower/f/g2` right after the failure, `observationMismatches:0` over 59 samples). (e) The partition side
follows events only: the leadership observation changes only through the port's ROLE/LEADER_CHANGE events
(src/partition/partition-service-raft-lifecycle-wiring.js:32-100); no new compatibility hook in src/partition
(A9 src diff touches only the runtime owner on the raft side). (f) Reconstruction during a user session on a
sibling (r3-s6.out, exit 0): five reconstructions left the session-holding partition's durable record
unchanged (`p1RecordUnchanged:true`, its campaign's Ready deferred by the store's admission), a sessionless
write was the typed deferral (`deferRetry:true`), and after ROLLBACK it leads and serves (`afterSession
role:leader write:true`), but the sibling's tick storm ran meanwhile (gen 6 -> 110 in ~2 s: B6).

3. F-o (in-memory applied-key cache deleted; retries answered from the durable outcome row).
`recentlyAppliedEntryKeys/Order/Witnesses`, `MAX_TRACKED_APPLIED_ENTRIES`, `trackAppliedEntryKey`,
`getAppliedEntryDurableCommitWitness`, `buildAppliedEntryReplayResult`, `clearPostRollbackApplyState` are gone
(A9 diff: core-base.js, lifecycle-methods.js, cdc-stream-base.js:370-405 deleted, transaction-base.js:357-367
and :839 deleted, write-metrics-base.js:620-636 `answerSettledWrite`). One builder `answerSettledStatement`
(src/partition/partition-committed-statement-outcome.js:180-208) answers both before proposal
(write-metrics-base.js:686-694) and at apply (:219-239). Evidence: rerun r2-s3-ack (scratchpad/verify/r3/
rerun-r2-s3-ack.out, exit 0): `okRetryInProcess {idempotentReplay:true, replayOfLogIndex:2, logIndex:2,
proposedAgain:false}` and `afterRestart.okRetry` the same shape; the F-o witness green (`ok 250`), the B2 retry
test now `instances.length === 1` (committed-statement-outcome.test.js:262-264). Attacks: (a) a retry racing
its own in-flight proposal: r3-s3.out `inFlightRace entriesForRace:1`, both answers `logIndex:6`
(`getPendingCommittedWriteOutcome` shares the outcome, cdc-stream-base.js:300-319; the two outer promises differ
but one entry is proposed), rerun r2-s3c `concurrentSameEntryId sameObject:true`; (b) a retry on a FOLLOWER
is answered locally without consensus: r3-s3.out `followerRetryApplied {role:follower, success:true,
idempotentReplay:true, replayOfLogIndex:4}`, `followerRetryFailed {success:false, SQLITE_CONSTRAINT_PRIMARYKEY,
replayOfLogIndex:5}`, logs unchanged on all replicas (`[5,5,5] -> [5,5,5]`), a NEW entryId on the follower
refused ("No leader available"), and after the leader's shutdown a follower still answers the replay. The row
exists on the follower only because the committed entry was applied there, so the answer is a read of
replicated, committed state, consistent with "the write path has one durable log" (nothing is proposed); it
is acceptable per design section 2 idempotency, with the attestation residual below. (c) Attestation: the
replay answer names the ANSWERING replica as leader: `followerReplay {leaderNodeId:"node-2",
leaderReplicaId:"r3s3-group-r2", acceptingNodeId:"node-2"}` while `actualLeaderNode:"node-1"` (the
original answer named node-1/r1); src consumers of the witness: `src/admin/admin-write-receipt.js:57-79`
requires `witness.leaderNodeId === acceptingNodeId` for a "complete" receipt, which a follower's self-attested
answer satisfies (`adminReceiptOfFollowerReplay complete:true`); no src consumer reads `leaderReplicaId`
(grep). Message honesty, not correctness (term/logIndex are the original's). Finding F-w. (d) Z1: the
dt6-zombie assertion on the poison seed/set size is removed with the set; the property "a healed rollback
strands no apply state" is now carried by the durable rows rolling back with the transaction: the same file
still asserts the durable applied index equals the independent record after the heal, and
partition-service-write-commit.test.js:343-348 asserts an UNSETTLED outcome for rolled-back SQL; live: rerun
r2-s3b full-apply `afterRestart busyEntriesOnDisk:1, busyOutcomeRows:["applied"]` (re-applied exactly once
after the rollback). Coverage did not drop for the mechanism; the removed assertion measured the deleted
cache.

4. F-p (typed refusal of a sql-less SQL-typed write). `sql-less-insert` and `non-string-sql` are refused
before consensus with `partition_write_statement_missing` (r3-s2.out, `entriesAdded:0`), F-p witness green
(`ok 251`), rerun r2-s3-ack `writeWithoutSql resolved ... refused before it was proposed`. Every other
malformed shape: B5. `PARTITION_COMMITTED_SQL_COMMAND_TYPES`/`PARTITION_COMMITTED_COMMAND_TYPES` now live in
partition-service-constants.js:167-181 as `Object.freeze(new Set(...))`: `Object.freeze` does not make a Set
immutable (`node -e` check: a frozen Set still accepts `add`, size 2), so "frozen sets" is a comment-level
claim (minor, F-x). RECORDED_ONLY is a named outcome for the marker types (R07-honest as an application
outcome) but the proposer of a marker proposed through applyWrite is never resolved (B5, second paragraph).

5. Registry. `raft-rs-runtime-application-transaction` contract and pair now add
src/partition/partition-service-write-metrics-base.js as owner and
test/partition/partition-runtime-reconstruction-leadership.test.js as witness (A9 diff of
test/shards/impact-contracts.json:473-491, :890-905); `impact-contract-registry.js`: PASS (39 contracts, 16
coupled pairs); both witnesses primary-classified `unit` (test/shards/primary-classes.json:1119, :1156);
generated metadata current (`generate-test-primary-classes --check`: "2162 tests", resource/subsystem
`--check` exit 0, curated shards current). Endpoints live: the witness runs the production PartitionService
and the production admission fixture (partition-admitted-group-fixture.js).

## Attack surface, items 1-10 on this head

1. Old-backend fallback. Closure walk from src/partition/partition-service.js: 626 modules, `legacy by
basename: []`, no non-literal dynamic import (rerun-s8-closure.out); the legacy adapters are reached only via
snapshot-install/checkpoint (inert, S27) and liferaft-provider only from message-group/raft-group (outside the
partition closure). Selection spellings (rerun-r2-s12-selection.out): `raftBackend` in {liferaft, raft-rs,
null, false} and `raftProvider` {object, class} refused `partition_consensus_backend_selection_refused`;
env/nested/uppercase spellings and an options-supplied `createOperationPort` ignored
(`factoryIsPrototype:true`), the live partition runs with `hasConfState:true, hasRuntimeGeneration:true` and
only `_raft_rs_*` tables. Restart: rerun-s2 `afterRestart term 2 commit 9 role leader`, write at logIndex 10;
worker path: no PartitionService construction under src/worker (unchanged since r2).
2. Alternate constructor/test seam: as above; partition-construction-seam.test.js green in the batch.
3. Raw core reachability. Boundary witness 7/7 in the batch; `auditRaftRsOperationBoundary({root})` on the head:
`violations=0`; mutants (rerun-r2-audit-mutants.out): M1/M2/M4/M5/M7 caught, M3 (computed dynamic import),
M6 (renamed core member), M8 (raw `_raft_rs_log` INSERT from a partition module) still not caught (F-s
open). The port keeps twelve operations; callback contract `{command, index, term, effects}`
(raft-rs-operation-port.js:60-67; application-transaction-owner.js:45-52).
4. Stale durable-state reuse / second durable log. Detector matrix (rerun-s1-detector.out, 13 cases): one log
row, uncommitted term-0 log row, positive term, positive committedIndex, boot-install shape, legacy beside
empty rs tables, legacy beside another group's record all refuse `legacy_partition_consensus_state_detected`
with the reason code; tables-only, term 0, vote-only, `lastAppliedIndex`-only and a non-numeric term start
(F-k unchanged); legacy beside a real rs record passes the detector (Q5) and fails on F-f without a lifecycle
row. Second log (rerun-s2-durable-logs.out): `_raft_log`/`_raft_state` absent (`null`) at all nine steps
(init, 3 writes, session commit, session rollback, prepare, 2PC commit, MIGRATION_ALTER_TABLE, shutdown,
restart write); exactly one payload entry per proposal. B6 adds one EMPTY entry per reconstruction to every
sole-voter log (not a second log, but unbounded growth of the one log).
5. Test stand-in. Receipt 1 boots BootstrapService/BootstrapAPI/SQLQueryEngine; receipts 2-6 construct
`new PartitionService` on file dbs with independent connections (file unchanged since the seal). The three A9
witnesses use production construction: the F-m witness injects SQLITE_FULL through `max_page_count` on the
real partition connection and the production admission fixture; committed-statement-outcome's F-o/F-p cases
are production PartitionService on files. The double is used by the B4 witness (honest for what it reads,
above) and partition-port-refusal-outcomes.
6. Acknowledgement. rerun-r2-s3-ack: ack after the applied transaction commits (`ackThenIndependentRead
rowsA:["1"], commit 2 applied 2, outcomeRow applied@2`); STATEMENT_FAILED `success:false` consumed; after a
session ROLLBACK (rerun-s4) the acknowledged pre-session write is intact and the deferred write lands at
354 ms; same-entryId retry after restart answered from the row with no new entry; UPDATE across restart is
a replay (`valueNow "1+"`); CDC exactly once (`beforeRestart:["INSERT"], afterRestart:["UPDATE"]`);
environmental failures never acknowledged (rerun-r2-s3b x3: `success:false`, not consumed, applied
unchanged, re-applied once after restart `busyEntriesOnDisk:1`). No write acknowledged during a
reconstruction outage (r3-s1-apply.out). A9-specific: the F-m in-process heal path applies the previously
committed entry then the next write, rows `["b0","b1","b3"]` in order.
7. Session-transaction isolation layer 1 (rerun-s4): tick/campaign/probe -> `HOST_FAILURE
user-transaction-open` phase ready-persistence retryable, non-fatal, synchronous; readStatus CORE_OK without
draining; durable record unchanged during the session (`sameEntries:true`), equal to the core after; markers
after COMMIT/ROLLBACK (transaction-base.js:690-701); peer-identity reservation still erased by ROLLBACK (F-d:
`peerIdOfJoiner:null, rowOnDisk:0`); demotion under a long session at round 18 (~180 ms in the harness,
rerun-s5b: F-b/F13, reported as a finding); reconstruction during a session writes nothing inside the session
(r3-s6.out).
8. readStatus synchrony (rerun-s6): busy queue, follower with configured peers, during a user transaction,
closed port, retired replica: all synchronous, none a Promise, none a throw; during a reconstruction outage
it returns a synchronous HOST_FAILURE object (r3-s1-apply.out).
9. Runtime failure isolation (rerun-r2-s10): seven per-peer delivery failure modes isolated
(`hostFailures:[]`, leader keeps role, `gen:[1,1,1]`, catch-up after heal); a follower's real persistence
failure still replaces the shared runtime for the leader in the same process (`leaderDuring role:follower
gen:3`, F-n open); an application failure or persistence failure on a lone leader now recovers in process
(rerun-s7 `writeAfterHostFailure success:true role:leader gen:2`; r2-s3b `afterHealInProcess success:true`),
at the B6 cost while the failure persists. Design Q4 (UNRECOGNISED fails closed) holds and is B5's poison.
10. Recovery/replay. applied <= commit at every boundary (r2-s3b full-apply: commit 3 / applied 2 during,
7/7 after restart; r3-s2 poison cases: commit 3 / applied 2, restart refused); restore re-delivers the gap
exactly once (`busyEntriesOnDisk:1`, rerun-s7 `boomApplications:1`); HLC warms from applied commands
(rerun-s7 `1790169650671-7-other-replica` -> `...-9-s7-hlc-r1`); prepared-state reconstruction still
lost across restart (F-a: `reconstruction 0/0, commitAfterRestart "No active transaction to commit"`).

## Still-open findings from rounds 1-2, current status with fresh evidence

- F-a prepared 2PC session lost across restart: still open (rerun-s7 `preparedAcrossRestart`).
- F-b/F13 leader demotion under a long session: still open, measured round 18 / ~180 ms in the harness
  (rerun-s5b), explicit unavailability as F13 says; a finding, not a rejection.
- F-c/F9 host failure wedges the lone leader: FIXED in the narrow form (rerun-s7 `writeAfterHostFailure
  success:true`; r2-s3b `afterHealInProcess success:true` in all three modes); superseded by B6 for the
  persistent-failure case.
- F-d/F12 peer-identity reservation erased by a session ROLLBACK: still open (rerun-s4
  `peerIdentityAfterRollback peerIdOfJoiner:null rowOnDisk:0`).
- F-e/F10 db handle on an undecodable applied entry: still open by code reading only
  (`warmHlcFromCommittedLog()` at raft-init-base.js:444, outside the detector's try block).
- F-f campaign refusal: FIXED (rerun-s9/r2-s9 `partition_single_replica_campaign_refused`,
  `lifecycle-record-missing`); F-u residual DDL still left behind on the refused init (rerun-s1
  `legacy-beside-rs-record tablesAddedByAttempt: _partition_statement_outcomes, _raft_rs_replica_lifecycle,
  _transaction_outcomes, raft_rs_peer_identity, v_rows`).
- F-g S31 startup names the retired provider: still open (src/lagrange-runtime-startup.js:714-717,
  `ensureLiferaftProviderForRuntime`; raft-provider-control.js:6-8).
- F-h admission outcomes: FIXED (partition-port-refusal-outcomes green; rerun-r2-s3c `followerAdmission
  NOT_LEADER`); F-v residual (QUEUED counted current, peer-cache-reconciliation.js:13-16, :290) still open.
- F-i deterministic/environmental boundary: closed at the state-machine level (r2-s3b reruns agree).
- F-j 2 s inner deferral budget: still open (rerun-s4 `budgets writeDeferBudgetMs:2000`, deferred write at
  354 ms).
- F-k detector edges (`lastAppliedIndex` alone, non-numeric `currentTerm` start): still open (rerun-s1).
- F-l verifier incident: n/a.
- F-m lone-leader wedge: FIXED in its widened narrow form (witness 3/3, red 0/3 on 380d96d23); superseded by
  B6 (the mechanism's storm).
- F-n runtime blast radius (follower persistence failure replaces the shared runtime for the leader in the
  same process): still open (rerun-r2-s10 `followerPersistenceFailure leaderDuring role:follower gen:3`), now
  with B6's durable cost per replacement.
- F-o in-memory cache / shape divergence: FIXED (cache deleted; one builder; deep-equal answers, F-o witness
  green; rerun r2-s3-ack `proposedAgain:false`); residual F-w (self-attested leader identity in a replay
  answer, admin receipt "complete", r3-s3.out `attestation`).
- F-p sql-less write: FIXED for the sql-less/non-string-sql shapes; every other shape open and one of them
  is B5 (poison via FORWARD_WRITE); markers via applyWrite still never answered.
- F-q stale-address REMOVE_PEER without replicaIdentity refused by shape: still open (rerun-r2-s3c
  `followerRemovePeerProposal CORE_REFUSED membership-change-without-replica-identity`;
  peer-cache-reconciliation.js:263-270 unchanged).
- F-r `_partition_statement_outcomes` growth with no compaction and a consumed entry per FAILED-key retry:
  still open (constants comment only); B6 adds unbounded `_raft_rs_log` growth on healthy groups.
- F-s audit strength (M3/M6/M8 undetected; the audit script is a library): still open
  (rerun-r2-audit-mutants.out).
- F-t active-legacy reference census: metric 1729 on this head (round 2: 1724 with the same worktree
  artifacts), exit 1, not a gate of this quest.
- F-u init-refusal DDL residue: still open (above).
- F-v QUEUED admission counted as current: still open (code unchanged).
- F-w (new, F-o residual; R07 message honesty): a replay answered from a replica's own outcome row attests
  `leaderNodeId: service.nodeId, leaderReplicaId: service.replicaId`
  (partition-committed-statement-outcome.js:193-199), i.e. the answering replica, follower or not, while the
  original answer named the proposer; `acceptingNodeId` is the same node so the admin receipt's
  `leaderNodeId === acceptingNodeId` check (admin-write-receipt.js:65-67) cannot tell. Evidence r3-s3.out.
- F-x (new, minor, R06 comment honesty): `Object.freeze(new Set(...))` for the command-type sets
  (partition-service-constants.js:167-181) does not freeze the Set's contents.
- F-y (new, F-p residual; R07): `TRANSACTION_COMMIT` proposed through `applyWrite` with no sessionId is
  acknowledged `success:true` and upserts a `_transaction_outcomes` row for a normalized-null session
  (r3-s2.out `transaction-commit-via-applyWrite`; entry-apply-base.js:1117-1131,
  transaction-base.js:859-869).

## Templates

### admission-gating
1 Precheck-predicts-enforcement: `applyWrite` refuses a sql-less SQL-typed write on the same predicate the
application branches on (`command.sql`, entry-apply-base.js:1049-1050) but NOT on the type set the
application refuses (`PARTITION_COMMITTED_COMMAND_TYPES`, :1023): the precheck admits what enforcement
refuses, and here enforcement is terminal for the partition (B5). The settled-key precheck reads the same
outcome row the application reads (write-metrics-base.js:627 / entry-apply-base.js:1057, both
`readCommittedStatementOutcome`).
2 Transient vs terminal: `partition_write_statement_missing` terminal for the request, typed; UNRECOGNISED
terminal for the PARTITION (B5); `user-transaction-open` retryable deferral; HOST_FAILURE application/persistence
`recoveryRequired:true` retryable, and A9's retry is the reconstruction itself (B6).
3 Which budget governs: the write deferral 2 s (F-j) then the router; the reconstruction retry has NO budget
and no backoff: every tick/read/write re-runs it (runtime-owner.js:346-351) - B6.
4 Reason shape: port outcomes objects; write results carry `failureCode` strings; the poison error carries
`.code = partition_committed_command_unrecognised` (entry-apply-base.js:1027) but the write result exposes only
`error` text (`failureCode:null`, r3-s2.out).
5 Hold release: session end (354 ms measured); host heal releases the reconstruction loop (r3-s7
`afterHeal500ms generationsBumped:0`).
6 Freshness: `db.inTransaction` per decision; the outcome row per apply and per applyWrite; the conf state
per resume (`invokeCoreAt CONF_STATE`, runtime-owner.js:299-300).
7 Message honesty: the environmental error names the SQLite code; the campaign refusal names the port's
reason; F-g, F-w, F-y as recorded.

### recovery-replay
1 Never clobber live with stale: `replaceRuntime` restores every group from its durable record and discards
the in-memory core, including a sibling's unpersisted campaign term (r3-s6: term 7 durable after 110
generations); the restored applied index bounds re-delivery (createNodeArguments :238).
2 Restart vs live: `hasDurableRecord` at open; the F-m resume runs on every in-process reconstruction as
though restarted, with no discriminator for "the failure that triggered me still persists" (B6).
3 Lost-enlistment refusal: F-a still open.
4 Replay idempotence: the durable outcome row is the sole authority (cache deleted); a settled key is never
executed (r3-s3 followers, r2-s3-ack restart); rollback clears it by rolling back (write-commit.test.js:343).
5 Absence proves nothing: a missing row is UNSETTLED (named); a missing `_raft_rs_*` table reads as no
proposals; B5's poison entry is treated as unreadable-as-fatal, forever.

### owner-interaction
1 Single owner: settled-statement answers from one builder; "who leads" from the core; but "may this command
be proposed" is decided by the write path for one shape and by the application for the rest (B5).
2 Typed boundary: `PARTITION_COMMITTED_COMMAND_OUTCOME`, `RAFT_MEMBERSHIP_ADMISSION_OUTCOME`,
`RAFT_RS_PERSISTENCE_ADMISSION`, `RUNTIME_REASON.RUNTIME_RECONSTRUCTED`; F-q's second REMOVE_PEER shape open.
3 Paired invariants in one witness: the F-m witness holds "not consumed" + "applied once after heal" +
"leadership observation follows the port" in one deterministic witness with real injection; red on
380d96d23 at those assertions.
4 Stale-then-fresh: a settled row answers a later retry regardless of memory, in process, on a follower and
after restart (r3-s3, r2-s3-ack); a remembered pre-failure status survives two reconstructions (r3-s1, r3-s5).
5 Pressure/backoff: FAILS - repeated callers (and the group's own tick) amplify: each reconstruction restores
and campaigns every group, unbounded (B6: 50/s, +50 terms and +50 entries per healthy partition per second,
per-read cost rising with log length).
6 Wake/release: host heal + the next operation (event-driven); no backoff between attempts.
7 Projection authority: `isLeader` stays true during an outage while the port reports HOST_FAILURE
(single-replica demotion guard, raft-init-base.js:504-512); the write path reads the port, so no write is
acknowledged on the stale projection.
8 Controlled negative: receipts 0/6 on the sealed head for the census reasons; F-m witness 0/3 and B6's
`healthyTermGrowth:0` on 380d96d23.
9 No local escape hatch: no `this.storage`/`logAdapter`/DIRECT mode in src/partition; no options-supplied
port; retries answered before proposal is a read of the owner's row, not a shortcut.
10 Contract + registry + proof aligned: the contract text, owners and witnesses changed together (A9 diff);
registry PASS; metadata current.

### harness-fidelity
1 Red for the right reason: fm-witness-prev-head.tap names the behavioral assertions; receipts-sealed.tap
names the census reasons (135/135 replicas lack rs fields; six liferaft modules; `_raft_log: 3`; legacy
state initialized; restart commitIndex 0).
2 Stub honesty: the F-m witness uses no stub (real `max_page_count`); the B4 double's default configuration
equals the real port's for the fields read (r3-s4.out), with the listed differences.
3 Time fidelity: group witness heartbeat 20 / election 150-300 / 10 s budget; the tick that drives B6 is
20 ms in tests and 50 ms in production (HEARTBEAT_DEFAULT_MS 150 / 3), the ordering (tick < heartbeat <
election) preserved.
4 Field fidelity: entries carry entryId/proposedBy/proposedAt/timestamp (write-kernel.js:31-51); outcome
rows keyed `entry:<entryId>` (cdc-stream-base.js:355-372); a same-entryId different-params retry is answered
as the original (r3-s3 `rowZZ:0`, by design).
5 Vacuous assertions: the movielens "nothing is proposed for them" passes on any double that proposes
nothing at init; it is paired with the address assertion that the real port also satisfies (r3-s4); the
witness's `readStatus().peerCount + 1 === 3` is the double's arithmetic, not a core's.
6 Live binding: receipt 1 is the live seed; the F-m witness binds the live runtime owner (real SQLITE_FULL);
the B4 witness is double-bound with no live-voter counterpart for the prune/replace flow (coverage note).

## Commands run (counts, exit codes)
- Static (scratchpad/verify/r3/static-r3.out): check-complexity 1814/1814 exit 0; check-unused-exports
  1437/1437 exit 0; check-file-size-thresholds exit 0; check-no-legacy-naming exit 0; check-curated-test-shards
  "current" exit 0; generate-test-{primary,resource,subsystem}-classes --check exit 0 (2162 tests);
  impact-contract-registry PASS 39/16 exit 0; check-quest-log-append-only clean exit 0;
  active-legacy-consensus-reference-audit metric 1729 exit 1 (census, not a gate); eslint on 94 changed js
  files exit 0 (empty log); audit-runner on the head `violations=0` exit 0.
- Receipts: head 6 pass / 0 fail exit 0 (r3/receipts-head.tap); sealed-head archive 0 pass / 6 fail exit 1
  (r3/receipts-sealed.tap).
- Suites (r3/suites-r3.sh, thermal gate OK before each batch, `--test-concurrency=4`): 83 files
  (r3/suite-files-r3.txt = 44 touched test files from `git diff origin/main...HEAD --name-only --diff-filter=d
  -- test` + operation-port-boundary + 3 dt-movielens + 40 dt6): 1708 tests, 1708 pass, 0 fail, 0 cancelled,
  exit 0, 46.9 s (r3/suites-r3.tap); movielens 20/20; F-m 3/3; F-o, F-p green.
- F-m witness on 380d96d23 archive (+ the new witness and fixture files): 0 pass / 3 fail, exit 1
  (r3/fm-witness-prev-head.tap).
- Scratch, all exit 0: r3-s1-storm apply/persist, r3-s1b-scale (20 healthy, 50 reads), r3-s2-shapes (10
  shapes), r3-s2b-poison-transport, r3-s3-follower-retry, r3-s4-double-honesty, r3-s5-group-outage,
  r3-s6-resume-during-session, r3-s7-tick-storm (head) and r3-s7-prev (380d96d23 archive).
- Reruns of rounds 1-2 (r3/rerun-r3.out, all exit 0): s1-detector (13 cases), s2-durable-logs,
  s4-session, s6-readstatus, s7-recovery, s5b-demotion, s8-closure, s9-inert, r2-s3-ack, r2-s3b x3,
  r2-s3c-group, r2-s10-delivery, r2-s9-inert, r2-s12-selection, r2-audit-mutants.
- Hygiene: `git status --short` unchanged (only the pre-existing log.ndjson modification); `pgrep` 0
  children; prev-head archives removed; /tmp/r3s4-* leftover removed; a `node_modules` symlink was added
  inside the scratch sealed-head archive only.

## Not verified
- The whole corpus on this head (I ran 83 files; the quest log records suite counts for A9, no corpus run).
- B6 at production tick timing and 135 groups: extrapolated from 20 ms/2 groups and 21 groups/50 reads; not
  run on a seed.
- F10 by code reading only; snapshot install/catch-up inert by construction, not driven.
- A leader restart in a three-replica group with pending outcome rows (followers only: r2-s3c rerun).
- The QUEUED admission path live.
