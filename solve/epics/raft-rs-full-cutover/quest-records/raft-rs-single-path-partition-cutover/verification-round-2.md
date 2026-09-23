# Verdict r2: raft-rs-single-path-partition-cutover (attempts A1-A8 integrated)

Head verified: 97c4dc8e726270cb2d84971cf74534af59a9dbde (worktree
/mnt/data/peter/projects/lagrange/.claude/worktrees/raft-rs-write-path). Tree before and after:
`git status --short` shows only ` M solve/quests/raft-rs-single-path-partition-cutover/log.ndjson`
(the lead's uncommitted A4-A8 attempt entry, present before I started; I changed no repository file
and ran no git write command). The sealed head 19507fb7f and the bisect points (origin/main
9d85ac283, 3c942d8f9, d0aa6558d, f9ddcc8d8) were exercised from read-only `git archive` copies
under scratchpad/verify/ with node_modules symlinked. Every scratch script lives under
scratchpad/verify/r2/ (round-1 scripts re-run from scratchpad/verify/), each ran under `timeout`;
`pgrep -af "node .*(scratchpad/verify|--test)"` at the end: 0 children; my temp database
directories under /tmp were removed. Thermal gate: `wait-for-thermal-headroom.js` "headroom OK
(cpu 44C, nvme 67.85C)" before the suite batch; the batch ran at `--test-concurrency=4`.

## Verdict: REJECT

One item blocks. B1-B3 of round 1 are resolved (fresh evidence below). The six sealed receipts are
green on the head (6/6, exit 0) and red on the sealed head for the census reasons (0/6, exit 1);
the operation-boundary witness is 7/7; generated test metadata is current; the impact-contract
registry passes with the new contract and pair; complexity ratchet 1814/1814; unused-export ratchet
1437/1437; eslint clean on all 92 changed files. The blocker is a touched witness of the widened
F16 scope that is red on this head and was red at every attempt head since the widening.

### Blocking

B4 (in-bar under the recorded F16/F11/F15/F17/F18 widening, log.ndjson 2026-09-23T10:39:45Z; R23
and design Q6 "nothing is left red at land"; `solve land` runs npm test).
`test/convergence/dt-movielens-raft-peer-cohort-pruning-election.test.js` is red on the head: 11 of
17 subtests fail, both inside the batch (scratchpad/verify/r2/suites-r2.tap, `not ok 7 ...
authoritative replica deletes prune departed peers`, `error: '11 subtests failed'`) and solo
(scratchpad/verify/r2/movielens-solo.tap: `# pass 6 # fail 11`, exit 1). It is identically red at
the round-1 head 3c942d8f9, at A7 d0aa6558d and at A8 f9ddcc8d8 (bisect-*.tap, each `# pass 6 #
fail 11`), and differently red on origin/main where the pre-quest version fails on
`partitionService.raft.proposeConfChange is not a function` (bisect-origin_main.tap, 1/2); the file
is in the change set (+231/-... in `git diff origin/main...HEAD --stat`, commits 2955f9eaa "A6 ...
4/6 green; 2 wait on the honest progress probe", e2da3c9db, d0aa6558d), so the quest rewrote the
witness and left it red. Mechanism (movielens-solo.tap lines 34-60): line 154 expects
`partition.raft.readStatus().peers` to name r2/r3 after `initialize()` with `deferElection: true`
on the ControllablePartitionRaftProvider, and gets `[]`; line 176 expects four membership
proposals and gets `[]`. The double starts as FOLLOWER with `peers: []` and `confState: {}`
(test/partition/partition-service-test-support.js:19-24,65,182) and the admission owner proposes
only on a leader and never for the bootstrap voters the configuration already names
(src/partition/partition-service-raft-membership-administration.js `admitPartitionRaftPeer` ->
NOT_LEADER; src/partition/partition-service-raft-init-base.js:568-571), so nothing ever fills the
double's configuration. Either the double must report the bootstrap ConfState the real port
reports, or the witness must be re-homed on live rs-raft voters as the dt6 witnesses were (design
A7.4). Round 1 did not run this file (not among its 25 suites); the quest log records no corpus
result for A4-A8 ("whole corpus running on the lab node" is only in the A1-A3 entry).

### Round-1 blockers, re-attacked

B1 resolved: the widening is a recorded decision, `solve/quests/.../log.ndjson` entry
2026-09-23T10:39:45.780Z `kind: decision` "Scope widened (R16), recorded after the fact on the
verifier's B1: attempt A5 (44b09a430) fixed F11, F15, F16, F17, F18 inside this quest", with the
reason (multi-replica partitions unusable on the single path) and the remaining runtime gap (F9,
shared-runtime replacement) left recorded. `check-quest-log-append-only.js`: clean.

B2 resolved, fresh evidence (scratchpad/verify/r2/r2-s3-ack.mjs, exit 0):
- duplicate primary key under a NEW entryId -> `success:false, error:"UNIQUE constraint failed:
  v_rows.id", failureCode:"SQLITE_CONSTRAINT_PRIMARYKEY", logIndex:3`, entry consumed (index 3 <=
  applied), row keeps "1", outcome row `["statement_failed",3,"SQLITE_CONSTRAINT_PRIMARYKEY"]`;
- same-entryId retry of the FAILED statement in process -> `success:false`, same error and code,
  `replayOfLogIndex:3` (a new consumed entry 4, one outcome row); after restart -> `success:false`,
  `replayOfLogIndex:3`, entry 7 consumed, still one outcome row for the key, row unchanged;
- same-entryId retry of an APPLIED statement after restart -> `success:true, changes:0,
  idempotentReplay:true, replayOfLogIndex:2`, no second row; an UPDATE retried across a restart is
  now a replay (`second: changes 0, replayOfLogIndex 9`, value "1+" not "1++"; round 1 saw "1++");
- CDC exactly once per acknowledged applied write (`beforeRestart:["INSERT"],
  afterRestart:["UPDATE"]`);
- three-replica group formed through the production admission path
  (scratchpad/verify/r2/r2-s3c-group.mjs, exit 0): `outcomeRowsIdentical:true,
  userRowsIdentical:true` on all three replicas
  (`[["entry:e-c","applied",4],["entry:e-cdup","statement_failed",5],["entry:e-d","applied",7]]`),
  the retried failure on the leader `replayOfLogIndex:5`, identical again after a follower restart
  (`afterFollowerRestart.outcomeRowsIdentical:true, failedRowsOnR3:1, r3EntriesForCdup:[5,6,9]`);
  two concurrent proposals of the same entryId share one outcome promise (`sameObject:true`, one
  log entry);
- environmental SQLite errors are NOT consumed, injected for real, no stub
  (scratchpad/verify/r2/r2-s3b-env.mjs, three runs, exit 0): SQLITE_FULL raised by the application
  statement itself (trigger amplifier under `max_page_count`) -> `success:false`, error
  "Committed partition statement failed in the host environment ... (SQLITE_FULL)", applied index
  unchanged (2 -> 2 while commit 2 -> 3), no row, no outcome row; after restart the entry is applied
  exactly once (`busyEntriesOnDisk:1, busyOutcomeRows:["applied"], rowIds:["r0","r1","r3"]`).
  SQLITE_FULL in the store's log append and a busy-connection TypeError in the store's append are
  HOST_FAILUREs with nothing on disk and no acknowledgement. The witness
  test/partition/committed-statement-outcome.test.js:490-545 injects the same class through a
  `db.prepare` stub; my real injection agrees with it.

B3 resolved: test/shards/impact-contracts.json now carries contract
`partition-session-transaction-persistence-admission` (owners transaction-base, raft-write-commit,
durable-store, persistence-admission, runtime-owner; witnesses session-transaction-isolation,
persistence-admission) and coupled pair `partition-session-transaction-store-persistence-admission`
with two endpoints; `partition-raft-operation-port` names only the rs-raft provider and adds
core-base and membership-administration with witness partition-port-refusal-outcomes;
`raft-rs-runtime-application-transaction` adds entry-apply-base and the outcome owner with witness
committed-statement-outcome. `impact-contract-registry.js`: PASS (39 contracts, 16 coupled pairs).

### Findings to record (R17), not blocking unless marked

F-m (new; owner: runtime failure isolation / F9; an availability regression versus the sealed head
on single-replica partitions, i.e. every seed system partition). Any environmental SQLite failure
on a lone leader wedges the partition until process restart: after the injected SQLITE_FULL at the
apply, at the log append, or the busy-connection TypeError at the log append, the group is
RECOVERY_REQUIRED, the next operation replaces the shared runtime (`gen:2`), the group returns as
`role:"follower"` while `isLeader` stays true, and every later write answers "No leader available
for write operation" even after the environment is healed (`afterHealInProcess` in all three
r2-s3b runs); a restart recovers (`afterRestart.writeOk:true`). On the sealed head the DIRECT path
(`git show 19507fb7f:src/partition/partition-write-kernel.js` 142-165) reported the statement error
and the partition kept serving. The state-machine half of A7 (not consumed, no outcome row, typed
error, re-applied once) is right; the adjacent owner turns it into unavailability. R12. The sealed
constraint `record-not-absorb` defers runtime blast radius, so I record rather than block; the
lead should decide whether the default flip ships with this class.

F-n (new evidence for the recorded epic gap "runtime failure isolation"). On real ports
(scratchpad/verify/r2/r2-s10-delivery.mjs, exit 0) every per-peer delivery failure mode is isolated
(rejected promise, synchronous throw, `noHandler`, `acknowledged:false`, `error` field, an
unresolvable address, a late rejection): `hostFailures:[]`, leader keeps `role:"leader"`,
`gen:[1,1,1]`, commit 0 -> 4 with the reachable follower, the peer carries `delivery:"failed"` with
phase `send`/`send-no-handler`/`address-resolution`, and catches up after heal. A follower's REAL
persistence failure (SQLITE_FULL in its store) is not isolated: the shared runtime is replaced for
the leader in the same process (`genBefore:1` -> `gen:3`, leader `role:"follower"` until the
harness re-elects it: `followerPersistenceFailure`). In production one replica's full disk unseats
every leader hosted on that node.

F-o (new; R01/R08, documentation honesty). `applyWrite`
(src/partition/partition-service-write-metrics-base.js:657-663) answers an in-process retry from
`recentlyAppliedEntryKeys` without proposing and without consulting the durable outcome row, while
src/partition/partition-committed-statement-outcome.js:28-29 says the set "never decides". The two
answers for the same semantic question differ in shape: in-process `{success, changes:0,
idempotentReplay:true, durableCommitWitness}` with no `logIndex`/`replayOfLogIndex`; after restart
`{..., replayOfLogIndex:2, logIndex:8}` (r2-s3-ack `okRetryInProcess` vs `afterRestart.okRetry`).
No divergence found: the set is fed only after the row's transaction committed (entry-apply-base.js
:1102-1103, raft-write-commit.js:134-143) and cleared on rollback heal (transaction-base.js:363).

F-p (new; R07). A SQL-typed command without `sql` is consumed as RECORDED_ONLY
(entry-apply-base.js:1069,1150-1155) and the proposer's pending write is never resolved: r2-s3-ack
`writeWithoutSql: pendingAfterMs:1500, entryOnDisk:[5], consumed:true` (it times out at the 30 s
PENDING_REQUEST_TIMEOUT_MS, partition-service-constants.js:19). Production callers always carry
`sql` (the write kernel); reachable only through a direct `applyWrite`/`propose`.

F-q (new; membership administration boundary, R11). The cache reconcile's stale-address
REMOVE_PEER (src/partition/partition-service-raft-peer-cache-reconciliation.js:263-270) carries
only `peerAddress`; the port refuses it by shape (`membership-change-without-replica-identity`,
src/raft/raft-rs-operation-port.js:92-94) on every role and the outcome is dropped
(r2-s3c `followerRemovePeerProposal: {outcome:"CORE_REFUSED", reason:
"membership-change-without-replica-identity"}`). The retirement path (:175-180) carries
`replicaIdentity` and is the shape the red witness B4 expects.

F-r (new; R13 bound recorded only in code). `_partition_statement_outcomes` grows one row per
committed SQL entry with no compaction; the bound is a comment
(src/partition/partition-committed-statement-outcome-constants.js:271-275: "compacted together
with the rs-raft log by the snapshot/log-bound quest") and appears in no epic finding (grep of
solve/epics/raft-rs-full-cutover/findings-2026-09-23.md: none). Each client retry of a FAILED key
also appends a consumed log entry (r2-s3-ack `entriesForDup:[3,4,7]`). It is state-machine state
in the apply transaction, not a second command log: `_raft_log`/`_raft_state` are absent on every
write path (s2-durable-logs: `legacyLogRows:null` at all nine steps, exactly one payload entry per
proposal).

F-s (new; audit strength, out of bar). `scripts/checks/raft-rs-operation-boundary-audit.js` is a
library (no CLI, no `process.exit`); `node scripts/checks/raft-rs-operation-boundary-audit.js`
exits 0 without scanning anything, so round 1's "audit exit 0" and my first run were vacuous; the
gate is test/raft/raft-rs-backend/operation-port-boundary.test.js (7/7 green in suites-r2.tap
lines `ok 234`-`ok 240`). Calling `auditRaftRsOperationBoundary({root})` on a mutated archive
(scratchpad/verify/r2/r2-audit-mutant.sh + audit-runner.mjs): caught M1 direct core-loader import,
M2 renamed re-export, M4 runtime-owner namespace alias, M5 membership-admin import, M7 lifecycle
owner import; NOT caught: M3 a dynamic import of the vendored binding by a computed specifier
(`[..].join('/')`), M6 a core primitive called through a renamed member (`x['pro'+'pose']`), M8 a
raw `INSERT INTO _raft_rs_log` from a partition module (no rule guards `_raft_rs_log`/hard/applied
writers outside the store; only lifecycle tables are guarded). Nothing in the head does any of
these (s8-closure: no non-literal dynamic import in the 626-module closure; grep of `_raft_rs_`
SQL literals: only the store/constants).

F-t (census, not a gate). `active-legacy-consensus-reference-audit.js` (target 0, `exitCode 1`
when metric > 0) reports metric 1724 on the head; like-for-like without the `.tap/test-results`
artifacts an earlier run left in the worktree (5 ignored files, +111 matches) it is 1613 over 291
files versus 1609 on origin/main (+4; 54 src files still reference the retired backend, e.g.
liferaft-provider.js 60, raft-group.js 28). Round 1's "exit 0" for this audit cannot have been a
real run. The sealed statement does not require zero; it is an epic completion criterion.

F-u (F-f consequence; R13 minor). The campaign refusal happens after the partition DDL, so a
refused `initialize()` leaves `_partition_statement_outcomes`, `_transaction_outcomes`,
`_raft_rs_replica_lifecycle`, `raft_rs_peer_identity` and the user table in the database
(s1-legacy-detector `legacy-beside-rs-record: tablesAddedByAttempt`), unlike the detector refusal
which is DDL-free. Handles are released (`dbNull:true, raftNull:true`, r2-s9-inert).

F-v (F-h residual). A QUEUED admission counts its address as current for the pass
(`UNADMITTED_PEER_OUTCOMES` excludes QUEUED, peer-cache-reconciliation.js:10-14,288-292); a queued
proposal that settles REFUSED is re-driven only by the next services-cache change, the same
unnamed wake round 1 recorded.

F-i status: the deterministic/environmental boundary now exists and holds under real injection
(B2 evidence). It classifies by error class (SQLite primary-code allow-list; `TypeError`/
`RangeError` while `db.open`), so better-sqlite3's "This database connection is busy executing a
query" TypeError would be classed deterministic at the apply; unreachable there because the
store's append on the same synchronous drain raises it first (r2-s3b iterator -> HOST_FAILURE at
persistence). Closed at the state-machine level; the remaining exposure is F-m.

Still open from round 1 (fresh evidence): F-a prepared 2PC session lost silently across restart
(s7 `preparedAcrossRestart: reconstruction 0/0, commitAfterRestart "No active transaction to
commit", prepareLost null`); F-b/F13 leader demotion under a long session at round 13 (~130 ms in
the harness; s5b); F-c/F9 host failure wedges the lone leader (s7 `writeAfterHostFailure "No
leader available"`, now also F-m); F-d/F12 peer-identity reservation erased by a session ROLLBACK
(s4 `peerIdentityAfterRollback: peerIdOfJoiner null, rowOnDisk 0`); F-e/F10 by code reading only;
F-g S31 startup still names the retired provider; F-j 2 s inner deferral budget (s4 deferred
write landed at 354 ms); F-k detector edges (`lastAppliedIndex` alone and a non-numeric
`currentTerm` start; s1). Fixed: F-f (r2-s9: `partition_single_replica_campaign_refused`,
`campaign.reason:"lifecycle-record-missing"`, both with and without `deferElection`), F-h
(partition-port-refusal-outcomes 4/4 in the batch; F-v residual).

## Attack surface, item by item

1. Old-backend fallback. `createOperationPort` returns the module-frozen rs provider's port
(partition-service-core-base.js:55-57,476-478); raft-backend-selection/constants are deleted
(diff --stat). Closure walk from partition-service.js (626 modules) and the three bootstrap sites
(632): no `liferaft*` module by basename, no non-literal dynamic import; `sqlite-log-adapter.js`
reached only via `snapshot-install.js` (S27, inert: no caller of SNAPSHOT_CATCHUP_NEEDED) (s8.out).
Restart (s2: term 2, commit 9 after restart, write logIndex 10 on the rs store), worker path (no
PartitionService construction under src/worker), snapshot recovery (boot-install rows without an
rs record refuse: s1 `boot-install-marker-shape` DETECTED). Env `RAFT_BACKEND`/`RAFT_PROVIDER`/
`LAGRANGE_RAFT_BACKEND=liferaft` plus nested `{raft:{backend}}` and `RAFT_BACKEND` option: the
partition still initializes on rs-raft (`hasConfState:true, hasRuntimeGeneration:true`, only
`_raft_rs_*` tables; r2-s12 `liveWithSpellings`).

2. Alternate constructor / test seam. `raftBackend` in {'liferaft','raft-rs',null,false} and
`raftProvider` in {object, class instance} are refused with
`partition_consensus_backend_selection_refused`; `undefined` is absent (r2-s12). An
options-supplied `createOperationPort` is ignored: `factoryIsPrototype:true` and the live
partition never called it (it would have thrown). The subclass seam is guarded by
partition-construction-seam.test.js (green in the batch).

3. Raw core reachability. The port keeps twelve operations (raft-operation-port.js unchanged);
callback contract `{command, index, term, effects}` (raft-rs-operation-port.js:60-67;
application-transaction-owner.js:41-63 passes `{index, term, effects}`); boundary witness 7/7;
mutants: F-s.

4. Stale durable-state reuse / second durable log. Detector matrix (s1, 13 cases): one log row, a
positive term, a positive committedIndex, boot-install rows, legacy rows beside empty rs tables and
beside another group's record all refuse with the typed code, `db` released, `raft` null, no table
added; legacy rows beside a real rs record for the same partition pass the detector (Q5) and now
fail on F-f because my seed has no lifecycle row. After refusal nothing reads `_raft_log` (the only
committed-log readers are partition-committed-log.js store reads). Second log: `_raft_log`/
`_raft_state` absent after plain writes, session commit, session rollback, prepare+commit, a
MIGRATION_ALTER_TABLE and a post-restart write (s2); the rs log grows by exactly one payload entry
per proposal. The new outcome table: F-r.

5. Test stand-in. Receipt 1 boots BootstrapService + BootstrapAPI + SQLQueryEngine
(single-path-partition-cutover.test.js:271); receipts 2-6 use `new PartitionService` on file
databases with an independent read-only connection; sealed-head run red for the census reasons
(receipts-sealed-r2.tap). The B2 witnesses (committed-statement-outcome.test.js) use production
construction and, for the group, the production admission path; the environmental case stubs
`db.prepare` (harness-fidelity item 2) and my real injection reproduces it. The
ControllablePartitionRaftProvider double is used by partition-port-refusal-outcomes (F-f/F-h) and
by the red B4 witness, where its empty bootstrap configuration is the mechanism.

6. Acknowledgement. Ack after the applied transaction commits: independent read sees the row and
commit=applied=2 (r2-s3-ack `ackThenIndependentRead`); STATEMENT_FAILED `success:false`;
environmental failures not acknowledged and not consumed (r2-s3b); after a session ROLLBACK an
acknowledged pre-session write is intact and the deferred write lands after the session (s4);
same-entryId replay after restart answered from the durable row (B2); CDC exactly once.

7. Session isolation layer 1 (s4, lone leader with a named session open): tick, campaign,
probePeerProgress -> `HOST_FAILURE user-transaction-open` phase `ready-persistence` retryable
recoveryRequired:false synchronous; readStatus CORE_OK without draining; step enqueued;
proposeConfChange refused before the core; the durable record unchanged during the session and
equal to the core after; markers proposed after COMMIT/ROLLBACK (transaction-base.js:699-706,
800-803; no PREPARE marker, :650-668). Deferral typed (`RAFT_RS_PERSISTENCE_ADMISSION`), bounded
(2 s write budget, 120 s admission bound runtime-owner-constants.js:122-123), non-fatal. Not
covered: peer-identity, lifecycle and store DDL writers (F-d/F12). Demotion under a long session:
F-b.

8. readStatus synchrony (s6): busy queue with held async sends (200 reads + 50 after a delivered
envelope), a follower with configured peers, during a user transaction, a closed port
(`CORE_REFUSED closed`), a retired replica (`CORE_REFUSED retired`): all synchronous, none a
Promise, none a throw; unreserved peers are typed (`addressStatus`, status-observation.js:27-43).

9. Runtime failure isolation: per-peer delivery failures isolated in seven modes (F-n); a
persistence failure or an application failure marks RECOVERY_REQUIRED and the next operation of
ANY group replaces the shared runtime (runtime-owner.js:284-305, 462-465, 553-555): F-m, F-n, F9.
Design Q4 (UNRECOGNISED fails closed) holds (entry-apply-base.js:1045-1054).

10. Recovery/replay. applied <= commit at every boundary (r2-s3b full-apply: disk commit 3 /
applied 2 after the failure, 4/4 after restart; s7 3/2 -> 4/4); restore re-delivers the gap exactly
once (`busyEntriesOnDisk:1`, `boomApplications:1`); HLC warms from the applied commands (s7: a
far-future stored timestamp `1790166860800-7-other-replica` gives `1790166860800-9-...` after
restart); prepared-state reconstruction: F-a.

## Templates

### admission-gating
1 Precheck-predicts-enforcement: applyWrite reads `this.raft.readStatus().role`
(write-metrics-base.js:666-670), the same core the runtime enforces; the session refusal is one
predicate owned by the store (`persistenceAdmission`, durable-store.js:145-149), consulted before
take_ready (runtime-owner.js:543-546) and at `perform` (:820-823); the admission outcome is now what
the port answered (membership-administration.js:36-48).
2 Transient vs terminal: `user-transaction-open` HOST_FAILURE retryable/recoveryRequired:false ->
`deferRetry` (raft-write-commit.js:21-31); `STATEMENT_ENVIRONMENT_FAILED` is a host failure
(recoveryRequired:true) never consumed; `STATEMENT_FAILED` terminal for the entry; the admission
bound (120 s) terminal (runtime-owner.js:150-161).
3 Which budget: the new 2 s inner budget (F-j) then the router's retry; the admission wait 120 s.
4 Reason shape: port outcomes are objects and every consumer reads `.outcome/.reason`
(raft-write-commit.js:23-25; membership-administration.js:36-48); the write result carries
`failureCode` as a string and `error` as the message (r2-s3-ack).
5 Hold release: the session's COMMIT/ROLLBACK flips `db.inTransaction`; measured 354 ms for a
deferred write issued 300 ms before ROLLBACK (s4).
6 Freshness: `db.inTransaction` read per decision (durable-store.js:146); the outcome row read per
apply (entry-apply-base.js:1074).
7 Message honesty: the environmental error names the SQLite code and the non-consumption
(r2-s3b); the campaign refusal names the port's reason (r2-s9); F-g still names the retired
provider at startup; F-p's silent pending write.

### recovery-replay
1 Never clobber live with stale: recovery rebuilds nothing from rows except prepared state (F-a);
the replay set is cleared only on rollback heal (transaction-base.js:363).
2 Restart vs live: `hasDurableRecord` at open; restore bootstraps at the applied index
(runtime-owner.js:233-255); false-positive cost now a typed init refusal (F-f fixed) with DDL left
behind (F-u).
3 Lost-enlistment refusal: F-a still open.
4 Replay idempotence: the durable outcome row is the authority on every replica and after restart
(B2 evidence, including the UPDATE case); the in-process set is a cache in front of it (F-o); Z1
clear in `clearPostRollbackApplyState`.
5 Absence proves nothing: a missing outcome row means UNSETTLED (named state,
outcome-constants.js:296-301) and the statement runs; a missing `_raft_rs_*` table reads as no
applied proposals (durable-store.js:349-352).

### owner-interaction
1 Single owner: "what did this committed statement settle to" is the outcome owner's row;
"may consensus persist now" the store's; "who leads" the core's; the admission outcome is the
port's answer, never PROPOSED by fiat (F-h fixed).
2 Typed boundary: `PARTITION_COMMITTED_COMMAND_OUTCOME` incl. STATEMENT_ENVIRONMENT_FAILED,
`RAFT_MEMBERSHIP_ADMISSION_OUTCOME` {PROPOSED, REFUSED, DEFERRED, QUEUED, NOT_LEADER,
ALREADY_MEMBER}, `RAFT_RS_PERSISTENCE_ADMISSION`; no boolean bag. Second interpretation found: the
stale-address REMOVE_PEER shape (F-q).
3 Paired invariants in one witness: committed-statement-outcome "three-replica group" holds
identical rows and the retried failure in one deterministic witness; W2/W7 as in round 1;
red-on-sealed-head for the six receipts.
4 Stale-then-fresh: an APPLIED row answers a later retry as replay and a FAILED row as the original
failure regardless of the in-memory state, in process and after restart (B2).
5 Pressure/backoff: deferral retries 10 -> 100 ms within 2 s then hands off (F-j); a retry of a
FAILED key appends a consumed entry each time (F-r); no repair storm observed.
6 Wake/release: session end + next tick; ADD_PEER deferral/QUEUED-then-REFUSED re-driven only by
the next cache change (F-v).
7 Projection authority: `recentlyAppliedEntryKeys` still short-circuits applyWrite (F-o), fed only
by committed rows; status observation served only while the queue is busy.
8 Controlled negative: receipts-sealed-r2.tap 0/6 for the census reasons; bisect of B4 across
main/r1-head/A7/A8.
9 No local escape hatch: no `this.storage`, `logAdapter`, `executePartitionWriteStatement` or
DIRECT mode in src/partition (grep); `isIdempotentInsertReplayConstraint` deleted (A7 diff).
10 Contract + registry + proof aligned: B3 resolved; but the pair `partition-raft-operation-port`'s
consumer endpoint names membership-administration whose live witness of the widened scope (B4) is
red.

### harness-fidelity
1 Red for the right reason: receipts-sealed-r2.tap (135 replicas lack rs fields; six liferaft
modules; constructed backend; `_raft_log: 3`; legacy state initialized; restart commitIndex 0);
B4's red is a fixture-shape red, not a mechanism red (this is the finding).
2 Stub honesty: committed-statement-outcome's `db.prepare` stub for SQLITE_BUSY matches the real
SQLITE_FULL/busy-connection behaviour I induced; the ControllablePartitionRaftProvider double does
not reproduce the real port's bootstrap ConfState (B4) and answers campaign/conf-change by handler.
3 Time fidelity: PARTITION_TIMING tick 10 < heartbeat 50 < election 150-300; group witness
heartbeat 20 / election 150-300 with a 5 s budget; 2 s write budget < 60 s hold sweep < 120 s
admission bound.
4 Field fidelity: entries carry entryId/proposedBy/proposedAt/timestamp from
`buildPartitionWriteEntry` (write-kernel.js:31-51); outcome rows keyed `entry:<entryId>`
(cdc-stream-base.js:355-372), so a same-entryId different-params retry is answered as the original
(r2-s3-ack `sameEntryIdDifferentParamsInProcess: rowZZ 0`), by design.
5 Vacuous assertions: receipt 4's "legacy rows 0" is satisfied by absent tables (s2 shows absence);
the group witness's `followerProgress === commitIndex` admission wait is a real core read.
6 Live binding: receipt 1 is the live seed; B4 is a double-bound witness of the F16 mechanism with
no live-voter counterpart for the prune/replace cohort flow.

## Commands run (counts, exit codes)
- Receipts on head: `node --test --test-reporter=tap test/raft/raft-rs-backend/single-path-partition-cutover.test.js` 6 pass / 0 fail, exit 0 (r2/receipts-r2.tap). Same file on the sealed-head archive 19507fb7f: 0 pass / 6 fail, exit 1 (r2/receipts-sealed-r2.tap).
- Touched suites (46 test files from `git diff origin/main...HEAD --name-only -- test`, r2/touched-tests-r2.txt) + operation-port-boundary.test.js, `--test-concurrency=4`: 837 tests, 826 pass / 11 fail, exit 1 (r2/suites-r2.tap); all 11 failures in dt-movielens-raft-peer-cohort-pruning-election; solo re-run 6 pass / 11 fail, exit 1 (r2/movielens-solo.tap); bisect archives: origin/main 1/2 (old test, different red), 3c942d8f9 6/17, d0aa6558d 6/17, f9ddcc8d8 6/17 (r2/bisect-*.tap).
- Static: check-complexity 1814/1814 exit 0; check-curated-test-shards current; generate-test-{primary,resource,subsystem}-classes --check exit 0 (2161 tests); impact-contract-registry PASS 39/16; check-quest-log-append-only clean; check-no-legacy-naming clean; check-unused-exports 1437/1437; check-file-size-thresholds exit 0; eslint on 92 changed files exit 0; active-legacy-consensus-reference-audit exit 1 metric 1724 (1613 without `.tap/`; main 1609) (r2/static-*.log); `node scripts/checks/raft-rs-operation-boundary-audit.js` exit 0 = vacuous (library), replaced by audit-runner.mjs: baseline 0 violations, mutants M1/M2/M4/M5/M7 caught, M3/M6/M8 not.
- Scratch, all exit 0: r2-s3-ack, r2-s3b-env x3 (full-apply, full-persist, iterator), r2-s3c-group, r2-s10-delivery, r2-s9-inert, r2-s12-selection, r2-audit-mutant.sh; round-1 s1 (13 cases), s2, s4, s6, s7, s5b, s8 re-run on this head.
- Hygiene: `git status --short` unchanged (only the pre-existing log.ndjson modification); `pgrep` 0 children; temp dbs removed.

## Not verified
- The whole corpus on this head: I ran the 46 touched suites plus the boundary witness; the quest
log records no corpus result for A4-A8. Untouched suites that consume the changed owners
(membership reconcile, write path) are unverified by me beyond the impact registry.
- F10 (db handle on an undecodable applied entry) by code reading only.
- Snapshot install/catch-up on rs-raft: inert by construction; not driven live.
- The QUEUED admission path live (only through the F-h controllable witness).
- Leader restart in a three-replica group with pending outcome rows (I restarted a follower only).
