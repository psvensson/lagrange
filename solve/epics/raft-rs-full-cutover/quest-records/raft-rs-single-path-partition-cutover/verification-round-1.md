# Verdict r1: raft-rs-single-path-partition-cutover (A1-A6 integrated)

Head verified: 4b6229d0194bbc31a2c5b9719a971fac14d4c423 (worktree
/mnt/data/peter/projects/lagrange/.claude/worktrees/raft-rs-write-path, tree clean before
and after; `git status --short` empty). Sealed head 19507fb7f was exercised from a read-only
`git archive` copy under scratchpad/verify/sealed-head (node_modules symlinked, the untracked
wasm glue copied in; `artifact-digest.json` identical to the head's). Every scratch script lives
under scratchpad/verify/ and ran under `timeout`; `pgrep` at the end found no surviving child.

## Verdict: REJECT

Three items block; the rest are findings to record. The six sealed receipts are green on the
head (6/6, exit 0) and red on the sealed head for exactly the census reasons (6/6 red, exit 1),
the operation-boundary audit and its witness are green (7/7), the 25 touched suites are green
(348/348), the generated test metadata is current (`--check` x3 + curated shards: current) and
the sealed witness file is byte-identical to the seal-time digest
(sha256 0650a3f1... = evidence/receipt.json testFileDigests). The blockers are not in the six
receipts; they are a sealed-constraint violation, one write-path acknowledgement regression the
receipts do not measure, and an owner-interaction registry that no longer describes the seam.

### Blocking

B1 (in-bar, constraint `record-not-absorb`, R16/R09). Attempt A5 (commit 44b09a430, "runtime
prerequisites for multi-replica partitions (F11 F15 F16 F17 F18)") fixes five findings whose
recorded owners are other quests: F15 "a failed delivery to one peer retires the whole shared
runtime ... Owner: runtime failure isolation (epic gap)" is the runtime blast radius the sealed
constraint names verbatim; F16 "Owner: the membership administration boundary (R2 quest)"; F17
"Owner: peer-identity administration"; F11 "Owner: the runtime owner should drain on delivery";
F18 "stopped with F5". Evidence: solve/epics/raft-rs-full-cutover/findings-2026-09-23.md
lines 118-186 (owner sentences unchanged; only F14 says "fixed in this quest");
`git show 44b09a430 --stat` (src/raft/raft-rs-runtime-owner.js +265, raft-rs-status-observation
+90, membership-administration +53, peer-identity +20); the quest log
solve/quests/raft-rs-single-path-partition-cutover/log.ndjson has exactly three entries and the
only recorded widening (2026-09-23T09:07:33Z) is F6 layer 1. The code itself is not found
defective (multi-replica-runtime-prerequisites 4/4 and partition-peer-admission green; my S5b/S6
runs exercised it), but a widening of a sealed unit by side effect is what R16 forbids; the
remedy is the lead's: record the widening (superseding `record-not-absorb` for F11/F15-F18 with
the reason Q6 "nothing red at land" needs them) or move A5 to its own quest.

B2 (in-bar, write-path acknowledgement; contradicts design A7.2 "as the deleted DIRECT path
reported it"). On a single-replica partition a duplicate primary-key INSERT proposed under a
DIFFERENT entryId is acknowledged `success:true, changes:0` and a log entry is consumed; the
row keeps its old value. Evidence: scratchpad/verify/s3-ack-durability.mjs output
`duplicatePkDifferentEntryId {"success":true,"changes":0,"logIndex":6,"rowValue":"1"}`; cause is
src/partition/partition-service-entry-apply-base.js:1122-1145 (`isIdempotentInsertReplayConstraint`,
src/partition/partition-service-cdc-stream-base.js:382-409, keys on the constraint code alone,
not on the entryId) now applied to every replica count. On the sealed head the DIRECT branch
(`git show 19507fb7f:src/partition/partition-write-kernel.js` lines 142-165,
`executePartitionWriteStatement` throws, caller builds `buildPartitionWriteFailureResult`)
reported the constraint failure to the client. So every single-replica partition (all seed system
partitions and 1-replica tables) changed its acknowledgement contract: a failed statement is
acknowledged as success. The suppression exists for a replayed entry after restart
(`recentlyAppliedEntryKeys` is empty then); a replay can be recognised by entryId against the
durable log (`RaftRsDurableStore.readCommittedEntriesIn`) instead of by constraint alone. Lead may
instead record "RAFT-path semantics apply uniformly" as a decision, but A7.2 as written promises
DIRECT parity and this is the one failed-statement class where it does not hold.

B3 (owner-interaction template item 10; constraint `independent-verification` names the seam).
The registry does not describe the seam this quest created or changed:
(a) `test/shards/impact-contracts.json:487-503` contract `partition-raft-operation-port` still
says "Both providers return the same operation-only partition capability" and lists
`src/raft/liferaft-provider.js` as an owner of the partition port after the cutover deleted
that provider from the partition path; (b) the new cross-owner interaction "the transaction owner
(partition-service-transaction-base.js) ends its SQLite session before proposing a marker and the
rs-raft store refuses persistence inside a transaction it did not open
(raft-rs-durable-store.js persistenceAdmission / raft-rs-persistence-admission.js)" has no
contract and no coupled pair (grep of impact-contracts.json for persistence-admission,
transaction-base, session-transaction: none; the 15 coupled pairs at :521+ are all
rebalancer/priority pairs). R02: where two owners meet, the interaction is the change boundary;
the registry entry classifies as `test` and rides in this quest.

### Findings to record (R17), not blocking

F-a (in-bar-adjacent, consequence of the recorded F6 widening). A prepared 2PC session is
LOCAL_STAGING with no PREPARE marker, so after a restart the participant has no record it ever
voted YES: `reconstructPreparedState()` returns 0/0, `preparedStateLostSessions` is empty, and the
coordinator's `commitTransaction('tx1')` gets the generic "No active transaction to commit"
instead of the typed prepare-lost outcome the sealed head produced from the marker
(s7-recovery.mjs `preparedAcrossRestart`; partition-service-transaction-base.js:646-668,
partition-service-constants.js PARTITION_TRANSACTION_PREPARED_STATE comment). R07: the typed state
was lost; it is recorded only as a code comment, not as a finding for the layer-2 quest.

F-b (recorded F13, measured as the brief asks). Three-replica group, real ports
(PartitionNodeCluster, tick 10 ms, election 150-300 ms): with a user transaction open on the
leader, a follower wins term 2 at round 19 (~190 ms of harness ticks; production tick =
heartbeat/3 = 50 ms with 1000-3000 ms election timeouts, so seconds), the old leader keeps
answering `role: leader` from its frozen observation until ROLLBACK, its own proposals during the
session are typed `HOST_FAILURE user-transaction-open` (no fork), and after ROLLBACK it steps down
to follower term 2 and converges (s5b-demotion-rounds.mjs). Explicit unavailability, as F13 says.

F-c (recorded F9, confirmed live on this head). An application host failure on a lone leader
(throw inside `applyCommittedEntry`) marks RECOVERY_REQUIRED, the next operation replaces the
shared runtime (runtimeGeneration 1 -> 2 for every group in the process), the group comes back
as follower while `PartitionService.isLeader` stays true, and every later write answers "No
leader available" until process restart; after restart the entry is re-delivered and applied
exactly once (s7-recovery.mjs `hostFailure`, `writeAfterHostFailure`, `afterRestart`:
boomApplications 1, disk commit/applied 4/4). Reachable from the in-bar write path via the
fail-closed UNRECOGNISED command (entry-apply-base.js:1035-1046) and any non-SQL throw.

F-d (recorded F12/F19, confirmed live). A peer-identity reservation made while a session is open
returns RESERVED, its row is a savepoint of the session and the ROLLBACK erases it:
`raftPeerIdOf('joiner-x')` is null afterwards and the row count on an independent connection is 0
(s4-session-entry-points.mjs `peerIdentityAfterRollback`; src/raft/raft-rs-peer-identity.js:121;
the lifecycle owner's INSERT at raft-rs-replica-lifecycle-owner.js:70-75 and the store
constructor DDL at raft-rs-durable-store.js:111-114 have the same shape).

F-e (recorded F10, still open at integration). `warmHlcFromCommittedLog()` runs at
partition-service-raft-init-base.js:423 outside the boot try-block; the codec's typed throw on an
undecodable applied entry leaves `this.db` open (the detector path at :369-372 closes it). Code
reading only; not driven live.

F-f (R11, pre-existing). `this.raft.campaign()` at raft-init-base.js:572 ignores its outcome: a
partition whose port refuses everything (`lifecycle-record-missing`, an rs record without a
lifecycle row) initializes, logs SINGLE_REPLICA_LEADER, and every write says "No leader
available" (s9-inert-port-init.mjs). Unavailability is not an explicit init outcome.

F-g (recorded S31). `src/lagrange-runtime-startup.js:713-717` still resolves and logs
`provider: liferaft` and `ensureLiferaftProviderForRuntime` refuses any other RAFT_PROVIDER while
every partition runs rs-raft (src/raft/raft-provider-control.js:12-41). Message honesty; not a
fallback (no partition consumer of the value).

F-h (R07, minor). `admitPartitionRaftPeer` (partition-service-raft-membership-administration.js:
36-64) records outcome PROPOSED whatever the port answered; a `HOST_FAILURE user-transaction-open`
or `CORE_REFUSED membership-change-peer-unreserved` proposal is logged as PROPOSED and re-driven
only by the next services-cache change (`reconcileRaftPeersFromCacheForService`), a poll-free
wake that exists but is not named.

F-i (design A7.2 boundary). STATEMENT_FAILED consumes the entry for any SQLite error, including
non-deterministic ones (SQLITE_FULL, IOERR, BUSY on one replica), so replicas can diverge silently
under storage pressure (R12); and a failed entryId is never deduped, so each client retry appends
a new consumed entry (s3 `statementFailedRetry logIndex 5`).

F-j (template admission item 3). USER_TRANSACTION_WRITE_DEFER_BUDGET_MS (2 s) is a new inner
budget with its own retry loop (partition-service-raft-write-commit.js:242-286) rather than an
attribution to an existing one; past it the write is a `deferRetry` the router's existing
retryable-write path owns (query-executor-write-retry-routing.js:489-504). Measured: a
sessionless write issued 300 ms before ROLLBACK lands at 356 ms (s4 `deferredSessionlessWrite`).

F-k (detector edges, per the sealed definition). `_raft_state.lastAppliedIndex` alone and a
non-numeric `currentTerm` read as ABSENT and the partition starts (s1-legacy-detector.mjs). Table
existence alone, a zero term and an empty vote start (correct). Note my `votedFor-only` seed was
wrong (`persistTerm` does not write the vote); the repo's own witness "a recorded legacy vote
alone refuses" (test/partition/partition-legacy-consensus-state.test.js:151) is green.

F-l (verifier incident, no harm). Invoking `scripts/generate-test-*-classes.js --help` rewrote
test/shards/{primary,resource,subsystem}-classes.json byte-identically (the census was current);
`git status --short` was empty afterwards. Reported for the record.

## Attack surface, item by item

1. Old-backend fallback. Production construction sites (seed-partitions-phase.js:197,
bootstrap-service-replica-registration-methods.js:119, node-joining-publication-activation.js:210)
pass no selection; `createOperationPort` (partition-service-core-base.js:476-478) returns
`RAFT_RS_PROVIDER.createPartitionPort` from a module-frozen provider; raft-backend-selection.js
and raft-backend-constants.js are deleted (diff --stat). Reachability, not grep: my closure walk
(s8-closure.mjs) from partition-service.js (624 modules) and from the three bootstrap sites reaches
no `liferaft*` module by basename and no non-literal dynamic import; `sqlite-log-adapter.js` is
reached only through `snapshot-install.js` (recorded S27/F5, inert on rs-raft: the port never
raises SNAPSHOT_CATCHUP_NEEDED, raft-rs-operation-port.js has no caller of it); from the
bootstrap sites `liferaft-provider.js` is reached via message-group-service-state.js:28 and
raft-group.js (R3/R4, recorded), never from the partition. Restart (s2, w4 after restart
logIndex 10 on rs-raft), worker path (no `PartitionService` construction under src/worker/, grep),
snapshot recovery (detector runs before DDL, boot-install rows without an rs record refuse:
s1 `boot-install-marker-shape` -> DETECTED). No `_raft_log`/`_raft_state` table exists on any path
(s2: legacyLogRows null at every step).

2. Alternate constructor / test seam. `raftBackend` and `raftProvider` at top level are refused
in the constructor with `.code partition_consensus_backend_selection_refused` for any value
including null/objects (core-base.js:60-78; receipt 3 green); `undefined` counts as absent
(correct). Nested spellings (`raft.backend`, `RAFT_BACKEND`, config keys) have no consumer in src
(grep of src/config and src: none). The subclass override of `createOperationPort` is guarded by
partition-construction-seam.test.js:125-133 ("no production module replaces the partition
operation-port factory", regex over src). Process env RAFT_PROVIDER is F-g.

3. Raw core reachability. `node scripts/checks/raft-rs-operation-boundary-audit.js` exit 0;
operation-port-boundary.test.js 7/7. The port keeps exactly twelve operations
(raft-operation-port.js:5-18, file unchanged vs origin/main). The callback contract is one frozen
`{command, index, term, effects}` (raft-rs-operation-port.js:60-67); the new static readers
(`readCommittedEntriesIn`, `readAppliedIndexIn`, `hasDurableRecordIn`) are DDL-free store reads,
not core entries, and the audit's owner census covers the store's callers (test 6/7 of the
boundary witness rejects import and lifecycle-writer bypass mutants). I could not defeat the
audit by renaming: it walks AST member calls against the runtime primitive list and forbids
binding-loader re-exports, not names.

4. Stale durable-state reuse and a second durable log. Detector matrix (s1): one log row, a
positive term, a positive committedIndex, boot-install rows, legacy rows beside EMPTY rs tables,
and legacy rows beside another group's rs record all refuse with the typed code, reasons listed,
`db` released, `raft` null, and NO table added by the attempt (DDL-free refusal); legacy rows
beside a real rs record for the same partition start (BESIDE, decision Q5). After refusal nothing
reads `_raft_log`: the only readers of the committed log are partition-committed-log.js (store
reads) - hlc-warmup, mirror cursor, reconstructPreparedState. Second log: `_raft_log` rows are
null (table absent) after 3 writes, a session commit, a session rollback, prepare+commit, a
MIGRATION_ALTER_TABLE and a post-restart write; the rs log grows by exactly one payload entry per
proposal (s2).

5. Test stand-in. Receipt 1 boots BootstrapService + BootstrapAPI + SQLQueryEngine and asserts
the rs-only status fields on every system partition and a CREATE/INSERT/SELECT round trip;
receipts 2-6 use `new PartitionService` with a file-backed db and read the durable record on an
independent read-only connection. Red on the sealed head for the census reasons: 135/135 system
replicas lack confState/runtimeGeneration; partition-service.js reaches six liferaft modules;
naming liferaft constructs; `_raft_log: 3` and zero rs entries after three writes; legacy state
initializes; restart commitIndex 0 (receipts-sealed-head.tap). Gap: receipt 6 reads rows and
commitIndex after restart but performs no write after the restart; s2 did (success, logIndex 10).
The ControllablePartitionRaftProvider seam is a consensus double that applies through the
production application-transaction owner; it is not used by any receipt.

6. Acknowledgement. Ack then independent read: row present, commit=applied=2 (s3). STATEMENT_FAILED:
`success:false`, entry consumed, group usable and still leader, next write succeeds. After a
session ROLLBACK an acknowledged pre-session write is intact and the deferred write lands after
the session (s4; W1/W2/W6 green). Restart replay of the same entryId: re-proposed once, replay
suppressed by the PK constraint, one row (known limit; UPDATE re-executes: value "1++"). CDC:
exactly one event per acknowledged applied write, none for the replay path (s3 `cdc`). Durability
level is the pre-existing WAL/synchronous=NORMAL commit. Regression: B2.

7. Session isolation, every entry point on a lone leader with a named session open (s4): tick,
campaign, probePeerProgress -> `HOST_FAILURE` reason `user-transaction-open`, phase
`ready-persistence`, retryable true, recoveryRequired false, synchronous; readStatus -> CORE_OK
synchronous without draining; step -> enqueued, drain deferred (runtime-owner.js:868-884);
proposeConfChange refused before the core; sessionless applyWrite deferred then landed; DEFAULT
session absorbs `executeQuery` writes by design; markers are proposed after COMMIT/ROLLBACK
(transaction-base.js:699-709, 800-806; W6 green); the durable record is unchanged during the
session and equals the core after. Not covered: peer-identity, lifecycle and store DDL writers
(F-d). Bounds: 2 s write budget (F-j), 120 s admission wait after which the group is
RECOVERY_REQUIRED (runtime-owner-constants.js:1049-1052; W7 green for the in-flight-send case).
Leadership during a long session: F-b.

8. readStatus synchrony (s6): 250 calls during a busy leader queue with held async sends, after a
delivered envelope, on a follower whose configuration names peers, during a user transaction, on a
closed port (`CORE_REFUSED closed`) and on a retired replica (`CORE_REFUSED retired`) - every
answer synchronous, none a Promise, none a throw. Unreserved peers are reported as
`addressStatus: unreserved` (status-observation.js:757-773).

9. Runtime failure isolation. A failed delivery to one peer is now a per-peer observation and never
fails the Ready (runtime-owner.js:336-418; F15 witness green) - this is B1's absorbed fix. A
persistence failure or an application failure marks the group RECOVERY_REQUIRED and the next
operation of ANY group replaces the shared runtime for every group (runtime-owner.js:284-305,
s7 gen 1 -> 2): the epic gap "runtime failure isolation" remains open as recorded; design Q4
(UNRECOGNISED fails closed) holds (entry-apply-base.js:1035-1046).

10. Recovery/replay. Applied <= commit holds at every transaction boundary (persistReady writes
the hard state before apply; putCommitIndex after apply; s7 disk commit 3 / applied 2 after the
injected failure, 4/4 after restart); restore bootstraps the core at the durable applied index
(runtime-owner.js:233-255) and re-delivers the gap exactly once; HLC warms from the applied
commands (s7: a far-future stored timestamp is the clock's physical time after restart);
prepared-state reconstruction: F-a.

## Templates

### admission-gating
1 Precheck-predicts-enforcement: applyWrite's commit mode reads `this.raft.readStatus().role`
(write-metrics-base.js:666-670), the same core the runtime enforces in `campaignGroup`/`propose`;
the refusal for a user transaction is decided by the store (`persistenceAdmission`,
durable-store.js:145-149) and consulted by the runtime before take_ready (:543-546) and at
`perform` (:820-823): one predicate, one owner.
2 Transient vs terminal: `user-transaction-open` is `HOST_FAILURE retryable:true
recoveryRequired:false` and mapped to `deferRetry` (raft-write-commit.js:242-257), which
`isRetryableControlPlaneError` classifies retryable (control-plane-error-classification.js:233);
the admission bound (120 s) is terminal `recoveryRequired:true` (runtime-owner.js:156-160).
3 Which budget: new 2 s inner budget then the router's existing retry (F-j).
4 Reason shape: the port emits `{outcome, reason, phase}` objects and every consumer reads
`.reason`/`.outcome` (raft-write-commit.js:244-246; s4 shapes).
5 Hold release: the session's COMMIT/ROLLBACK flips `db.inTransaction`; the next tick/operation
drains (measured 56 ms after ROLLBACK for the deferred write, s4).
6 Freshness: `db.inTransaction` is read per decision, never cached (durable-store.js:146).
7 Message honesty: the deferral error names the cause
(`WRITE_DEFERRED_USER_TRANSACTION_OPEN`); F-h and F-g are the dishonest messages found.

### recovery-replay
1 Never clobber live with stale: recovery rebuilds nothing in memory from rows except
prepared-state reconstruction, which now finds no PREPARE markers (F-a); the dedupe set is
cleared only by the rollback heal (transaction-base.js:359-364).
2 Restart vs live: `store.hasDurableRecord(groupId)` at open (runtime-owner.js:924-925) and
`restore` bootstraps from the record; false-positive cost is an rs record without a lifecycle
row -> inert port (F-f).
3 Lost-enlistment refusal: a prepared session lost on restart is not a typed refusal (F-a).
4 Replay idempotence: entryId dedupe in-process (entry-apply-base.js:1065-1083), constraint
suppression after restart (B2: too wide), applied state atomic with the SQL
(application-transaction-owner.js:904-926), Z1 clear in `clearPostRollbackApplyState`.
5 Absence proves nothing: an rs record's absence at boot is "create", not "terminal"; a missing
`_raft_rs_*` table reads as no applied proposals (durable-store.js:347-352), never as an error.

### owner-interaction
1 Single owner: "may consensus persist now" is the store's (`persistenceAdmission`); "who leads"
is the core's via readStatus; the durability-fitness detector no longer derives a commit
divergence from `_raft_state` (fitness diff).
2 Typed boundary: `RAFT_RS_PERSISTENCE_ADMISSION` and the port outcome objects; no boolean bag.
3 Paired invariants in one witness: W2 (ack never erased + deferred write lands) and W7 (held
Ready completes without reconstruction) are single deterministic witnesses; red-on-sealed-head
shown for the six receipts.
4 Stale-then-fresh: frozen status observation is replaced by every completed core entry
(`recordStatusObservation` in `announce`); the old leader re-enters the core path after ROLLBACK
and steps down (s5b).
5 Pressure/backoff: the write retries on the replica's clock with backoff 10 -> 100 ms within 2 s,
then hands off (F-j); inbound drain retries every 10 ms for 120 s then stops (:854-866).
6 Wake/release: session end + next tick; ADD_PEER deferral has only the cache-change wake (F-h).
7 Projection authority: `partition-committed-log.js` readers are bounded by the applied index in
one statement (durable-store-constants.js:516-526), not by the commit index; `statusObservation`
is served only while the queue is busy.
8 Controlled negative: sealed-head run red for the census reasons (receipts-sealed-head.tap).
9 No local escape hatch: no `this.storage`, `logAdapter`, `executePartitionWriteStatement` or
DIRECT mode survives in src/partition (grep); `applyPartitionApplicationAndProgress` deleted.
10 Contract + registry + proof aligned: B3.

### harness-fidelity
1 Red for the right reason: receipts-sealed-head.tap lines 16-17 (135 replicas), 28-60 (six
liferaft modules + missing fields), 84 (liferaft constructed), 103-122 (`_raft_log: 3`, no rs
entries), 140 (legacy state initialized), 159-191 (restart commitIndex 0, `_raft_log: 3`).
2 Stub honesty: the receipts use no stub; the persistence-admission W3-W7 use real ports and a
transport that queues envelopes (partition-node-cluster.js:153-162), with async sends only where
the test says so.
3 Time fidelity: PARTITION_TIMING (tick 10, election 150-300, heartbeat 50) preserves
tick < heartbeat < election; the 2 s write budget < 60 s hold sweep < 120 s admission bound
(runtime-owner-constants.js:1041-1052).
4 Field fidelity: proposals carry entryId/proposedBy/proposedAt from `buildPartitionWriteEntry`
(write-kernel.js:433-453); the commit witness is built from the committed entry's index/term
(entry-apply-base.js:994-1010).
5 Vacuous assertions: receipt 4's "legacyLogRows all 0" is trivially true when the tables do not
exist (rowCount returns 0 for an absent table) - the sealed statement wants "never written", so
absence satisfies it, but the witness cannot tell "never created" from "created empty"; s2 shows
the tables are absent. Receipt 6 asserts no post-restart write (item 5 above).
6 Live binding: receipt 1 is the live seed (BootstrapService); everything else is process-local.

## Commands run (counts, exit codes)
- `node --test --test-reporter=tap test/raft/raft-rs-backend/single-path-partition-cutover.test.js` on the head: 6 pass / 0 fail, exit 0 (receipts-run1.tap).
- Same file on the sealed-head copy (git archive 19507fb7f): 0 pass / 6 fail, exit 1 (receipts-sealed-head.tap).
- `node scripts/checks/raft-rs-operation-boundary-audit.js`: exit 0; `node --test test/raft/raft-rs-backend/operation-port-boundary.test.js`: 7/7, exit 0.
- 25 touched suites (session-transaction-isolation, persistence-admission, partition-legacy-consensus-state, durable-store-committed-entries, operation-port-ready-recovery, operation-port-status-observation, multi-replica-runtime-prerequisites, partition-peer-admission, partition-construction-seam, real-partition-on-raft-rs, transaction-durability-raft.property, partition-transaction.property, dt6-zombie-transaction-lifecycle, partition-service-hlc-monotonicity, durable-replay-cursor, partition-service-write-commit, partition-write-kernel, partition-service, backend-seam, operation-port-lifecycle, operation-port-provenance, snapshot-cadence, snapshot-catchup-end-to-end, partition-service-replay-dedupe, write-path-internal-pacing): 348 pass / 0 fail, exit 0 (suites-run.tap).
- `generate-test-{primary,resource,subsystem}-classes.js --check`, `check-curated-test-shards.js`: all exit 0 (current). `active-legacy-consensus-reference-audit.js`, `check-no-legacy-naming.js`, `checks/impact-contract-registry.js` (38 contracts, 15 pairs), `checks/check-quest-log-append-only.js`: all exit 0.
- Scratch: s1-legacy-detector (13 cases), s2-durable-logs, s3-ack-durability, s4-session-entry-points, s5/s5b multi-replica session, s6-readstatus-sync, s7-recovery, s8-closure, s9-inert-port-init: all exit 0; outputs quoted above.
- `node scripts/checks/wait-for-thermal-headroom.js` before the receipt run and before the suite batch: headroom OK.

## Not verified
- The whole corpus on this head (the attempt entry says it was running on the lab node); I ran the
25 touched suites plus the receipts and static audits, not the corpus, so the group-B/dt6 fixture
migrations outside that list are unverified by me.
- F10 (db handle leak on an undecodable committed entry) by code reading only.
- Snapshot install/catch-up on rs-raft: inert on this path by construction (no caller of
SNAPSHOT_CATCHUP_NEEDED); the install-then-boot sequence was not driven live.
- The non-deterministic-SQLite-error divergence (F-i) was reasoned from the STATEMENT_FAILED
branch, not induced.
