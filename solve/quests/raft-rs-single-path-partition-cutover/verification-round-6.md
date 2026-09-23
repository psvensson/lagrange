# Verdict r6: raft-rs-single-path-partition-cutover (attempts A1-A12 integrated, landing round, narrow on A12)

Head verified: fe70eb76ef210bd901d39ae4e56284bc718072d2 (worktree
/mnt/data/peter/projects/lagrange/.claude/worktrees/raft-rs-write-path). `git status --short` at start and end
(unchanged by me): ` M .../evidence/receipt.json` (the lead's `solve probe` output, `status fail -> pass`,
`generatedAt 2026-09-23T14:40:08Z`, which predates the A12 commit at 16:14Z; same test-file digest), ` M .../log.ndjson`
(nine appended entries incl. the A12 attempt `at fe70eb76e`), `?? verification-round-3/4/5.md`. I edited no repository
file and ran no git write command. Every scratch script lives under scratchpad/verify/r6/ (the round-5 scripts
re-run from copies in r6/, the round-1..4 scripts in place with outputs written into r6/), each under `timeout`;
the previous head 48ec6f3d6 was exercised from a read-only `git archive` copy (r6/prev-head, node_modules
symlinked, the five A12 test files copied in; removed after this report); the sealed-head archive
scratchpad/verify/sealed-head (19507fb7f tree) served the receipts' red control. `ps` at the end: 0 children of mine;
no temp directory of mine survives (every script removes its own). Thermal gate before the receipts ("headroom OK
(cpu 44C, nvme 67.85C)") and before the suite batch ("cpu 54C"); the batch ran at `--test-concurrency=2`, alone.

## Verdict: REJECT (one blocking item, B7; everything else A12 claimed holds under fresh measurement)

A12's three corrections hold on this head with red controls on 48ec6f3d6: F-ah (every durable-record read on the
open/reconstruction/replacement path is a typed `durable-record-read` host failure of the group alone, incl. real
SQLITE_CORRUPT on a garbaged or truncated page; the port's containment turns an untyped throw, incl. a caller's
throwing listener, into a typed `unexpected-throw` hold with 0 escapes across scheduled ticks; a lone restart on the
missing table is refused typed and releases the db; a follower is held while its leader serves and heals in place),
F-ak (every release and refusal on the write path is answered by the kernel's two builders with a code, the entry and
the cause; the reroute consumers that hold the answer branch on the code) and F-ai (a session write is admitted at
staging). Receipts 6/6 on the head, 0/6 on the sealed head for the census reasons; the 252-file batch is 6466 tests /
0 fail; every ratchet and static gate is green; src/query is untouched by A12.

The blocking item is a consequence of F-ak the census missed: A12 deleted the deadline text a FIFTH consumer keys on.
`src/control-plane/control-plane-error-classification.js:10-11,29` lists `'Raft write commit timed out'` in
`RETRYABLE_CONTROL_PLANE_ERROR_FRAGMENTS`, and `isRetryableControlPlaneError` (about 40 call sites: the SQL query
engine's write tracking disposition, distributed-transaction recovery, the rebalancer's workflow transition retry,
outcome reconcile and planning gate, the replica handler) classifies by that text only - it consults neither the
answer's `failureCode` nor the errors owner's `REROUTABLE_WRITE_ERROR_FRAGMENTS`. On 48ec6f3d6 the deadline release
was `"Raft write commit timed out after 30000ms"` and classified retryable; on this head it is `WRITE_OUTCOME_UNKNOWN`
(PROPOSED) or `WRITE_COMMIT_DEADLINE_EXCEEDED` (QUEUED) and classified NOT retryable, as a result object and as an
Error (r6/r6-classify.out: `OLD_deadlineText_preA12 cpRetryable true`; `deadlineProposed`/`deadlineQueued`
`cpRetryable_result false, cpRetryable_asError false`). So a 30 s pending-commit release that the query engine
skipped recording (`sql-query-engine.js:302-306`, "recording those defers ... feeds more load into the same
recovering priority partition") is now PERSISTed as a durable write-operation row, and a workflow transition that
was `retryable: true` (`operation-workflow-transition-retry.js:152`) is now terminal. The fragment constant is dead
(nothing produces the text: `grep` src) and `test/control-plane/control-plane-error-classification.test.js:17` asserts
the retired literal (hollow green 12/12). R03/R08/systemic-not-local: one owner decides which write answers may be
routed again; the classifier must ask the kernel's code or the errors owner's list, the dead fragment goes, and the
test takes the producer's shape. Small fix, narrow re-verification.

### Blocking
- B7 (new, F-am below): the control-plane retry classifier lost the deadline release. Evidence:
  src/control-plane/control-plane-error-classification.js:10-11,29,228-251; r6/r6-classify.out; the 40 consumers
  (`grep -rn isRetryableControlPlaneError src`, r6 grep in this round's transcript);
  test/control-plane/control-plane-error-classification.test.js:14-17; r6/classification-test.tap 12/12 (hollow).

## Round-6 specifics, item by item (the lead's list), with fresh evidence

1. F-ah. Mechanism read: `readOpeningRecord` (src/raft/raft-rs-runtime-owner.js:272-281) is the one contained read
   (`hasDurableRecord` + `readDurableRecord`) used at open (:1293-1300, a held group keeps its port; any other open
   failure still throws), in `reconstructGroup` (:602-605) and through `openingForReplacement` in `replaceRuntime`
   (:464-473, :488-498: an unreadable group's stale handle is nulled and the others restored); the store names the
   table and SQLite's code on the error (`readRecordTable`, src/raft/raft-rs-durable-store.js:110-117, used by
   `readProgressRows`/`readDurableRecord` :330-378); `durableRecordReadFailure` carries them as `detail` (:254-264);
   `containUnexpectedThrow` (:290-299) records `unexpected-throw` and never throws (announcement errors caught);
   the port's `dispatch()`/`containRuntimeThrow` (src/raft/raft-rs-operation-port.js:85-94, :193-201) covers
   execute/step/proposeConfChange/configureTick/startScheduling/admitScheduledEntry, sync throws and rejections;
   `scheduleTicks` (:214-218) is the one timer. `createRecordTables` (durable-store.js:141-152) creates the four tables
   only when none exists.
   - r6/r5-ag.out (exit 0), the round-5 DROP TABLE shape re-run: `uncaughtDuringWindowWait 0`, `readAfterWindow`
     synchronous `HOST_FAILURE/recovery-deferred` with `dp {state: unreadable, reason: no such table:
     _raft_rs_applied_state}`, `attempts 2`, write `partition_write_consensus_recovery_required` "(phase durable...",
     `tick` typed, `uncaughtTotalBeforeShutdown 0` (round 5 on 48ec6f3d6: 18 uncaught, THROW everywhere).
   - r6/r6-corrupt.out (exit 0), REAL SQLite failure classes on the read: journal_mode DELETE, the root page of
     `_raft_rs_hard_state` overwritten with garbage (+ header change counter bumped) and, on a second partition, the
     file truncated below that page. Both: the first write fails typed (`partition_write_consensus_host_failure`,
     phase `light-ready-persistence`, "database disk image is malformed"); the status is then
     `HOST_FAILURE` phase `durable-record-read`, `failure.detail {table: _raft_rs_hard_state, code: SQLITE_CORRUPT}`,
     `dp unreadable`; attempts 1 -> 2 -> 3 across two windows (one reconstruction per window); `uncaughtAfter2Windows
     0`; a write refused `consensus_recovery_required` with `consensus.phase durable-record-read`; sibling
     `untouched true, serves true`; after the file bytes are restored the group heals WITHOUT a restart (write
     success, `CORE_OK/leader`, `isLeader true`). SQLITE_IOERR itself was not produced (a short read surfaces as
     SQLITE_CORRUPT through the same site).
   - r6/r6-listener.out (exit 0), R07 attack: a throwing LEADER listener subscribed on the production port; after a
     healed SQLITE_FULL the reconstruction's resume announces LEADER, the listener throws: status `HOST_FAILURE
     recovery-deferred` phase `unexpected-throw` with `failure.reason "verifier listener bug: cannot handle
     leadership"`; `attempts 4` over 3240 ms (bound 5); `termGrowth 3` (+1 term/+1 entry per reconstruction, F-al
     class); write refused `consensus_recovery_required` "(phase unexpected-throw)"; `isLeader false`; `uncaught 0`;
     after unsubscribe the group leads again and the held committed entry applies once (rows r0, r1, r3). BUT no log
     line at any level names the contained throw (levels seen: 20/30/40 only; 9 `role_transition` info lines show the
     flap without its cause): finding F-an.
   - r6/r6-restart-restored.out (exit 0): restart with the table missing -> `partition_single_replica_campaign_refused`,
     campaign `HOST_FAILURE` phase `durable-record-read`, table named; the table restored WITH its row through the
     store owner's writer -> restart resolves, leader, write logIndex 5, rows r0/r1/r2, same-entryId retry
     `idempotentReplay true`; the table restored EMPTY -> refused typed `CORE_REFUSED not-an-active-voter`
     (campaign-eligibility), db and port released (fail-closed, never reused).
   - r6/r6-follower-restart.out (exit 0), three-replica admitted group, a follower restarted on its damaged record:
     `initialize()` RESOLVES (`initialized true`), status `HOST_FAILURE/durable-record-read` (SQLITE_ERROR, table
     named), the leader keeps serving (`leaderServesWhileFollowerHeld true`, role leader); the table restored on the
     follower's own connection -> `caughtUp true`, `CORE_OK/follower`, rows converge (row-0..row-2), `uncaught 0`.
     Multi-replica init holds instead of refusing: finding F-ap.
   - Witnesses: r6/a12-witnesses-head.tap 87/87 (the four F-ah cases incl. the follower and the core-trap sibling
     shape, the two port containment cases); r6/a12-witnesses-prev-head.tap on 48ec6f3d6: 34 red at the named
     behavioural assertions ("no exception or rejection escaped the port or its scheduled ticks" with the escapes
     listed; "the port's answer names the durable-record-read phase ({CORE_REFUSED not-an-active-voter})" - the old
     head restored an empty configuration; "the replacement answers the sibling's operation, never throws (no such
     table)"; "the campaign: the port answers, never throws (the leader listener refused the announcement)").
2. F-ak. Mechanism: `PARTITION_WRITE_RELEASE_CAUSE` and `RELEASED_UNPROPOSED_ANSWER` (src/partition/partition-write-kernel.js:62-86),
   `buildReleasedPendingWriteAnswer(pending, partitionId, {cause, deadlineMs})` (:271-288), `PROPOSAL_REFUSAL_ANSWER`
   + `backpressureProposalAnswer` + `buildPartitionWriteProposalRefusal` (:301-356); the three release sites pass a
   cause (cdc-stream-base.js:281-287 deadline via `releaseEntry`, lifecycle-methods.js:150-155 shutdown,
   raft-lifecycle-wiring.js:35-37 leadership-lost); `clear()` deleted, `releaseEntry` is the queue's one release
   (proposal-queue.js:185-224); `PARTITION_SERVICE_SHUTDOWN` literal and `clearPendingCommittedWrites` gone (grep src
   test scripts: none); `isReroutableWriteFailureCode` = every code but CONSENSUS_HOST_FAILURE (:51-60,93-95).
   - r6/r5-g2-timeout.out (exit 0), production, both transport directions dropped: at 30001 ms
     `partition_write_outcome_unknown`, `consensus {reason: commit-deadline-exceeded, deadlineMs: 30000}`, `entryId
     e-A` (round 5: untyped "Raft write commit timed out after 30000ms").
   - r6/r5-g2-shutdown.out: PROPOSED at `shutdown()` -> `outcome_unknown`, `consensus.reason shutdown`, entryId; the
     entry was on the leader's disk only (`aLandedOnSurvivors [0,0]`, honest).
   - r6/r5-g2-backpressure.out and r6/r5-ae.out: `partition_write_backpressure`, `retryAfterMs 100`
     (PROPOSAL_QUEUE_DEFAULT.BACKPRESSURE_RETRY_AFTER_MS), entryId, nothing proposed; the held write A commits after
     the queue frees.
   - r6/r4-g.out, r6/r5-z2.out: the no-role release now carries `consensus.reason leadership-lost`; unchanged
     otherwise (A idempotent retry, W0 lands, in-flight A forwarded into the void answered unknown).
   - CORE_REFUSED: not stageable on production (raft-rs forwards to the announced leader); the controllable-port
     witness (partition-write-typed-releases.test.js:320-346) and kernel test 7 cover the shape by construction.
   - `success: false` builders on the write path without a code (grep, this round): the deferral-budget expiry
     (raft-write-commit.js:85-93, `deferRetry: true`; F-j), `encodeProposal` throws (r6/r6-encode.out: BigInt /
     cyclic param -> `{success:false, error, partitionId}`, nothing proposed, `pendingAfter 0`, group usable), and the
     transport handlers' "not leader here" answers (entry-apply-base.js:709-715, :825-828,
     merge-replication-methods.js:217-220: text only). Recorded below as residue.
   - Reroute consumers: cdc-routed-mutation-readiness.js:149,694 and cdc-integration-service-shared.js:419-420 and the
     rebalancer gateway :242-243,:384 branch on the code first, text second; the query executor
     (src/query/query-executor-write-retry-routing.js:394, A11, untouched by A12) matches text only. NONE of the three
     carries an entryId (`grep -c entryId`: 0/0/0), so a rerouted `outcome_unknown` is re-proposed under a fresh id
     (F-aj, re-measured: r6/r5-g2-dup.out `doubleApplied true`, `rowACount 1` with a SQLITE_CONSTRAINT answer for the
     rerouted INSERT; with the entryId `idempotentReplay`). Code/text parity: kernel test 7 green on head, 21 sub-reds
     on the previous head (r6/a12-witnesses-prev-head.tap 1173-1646). The uncensused fifth consumer is B7.
3. F-ai. `executeTransactionWrite` admits at staging (write-metrics-base.js:212-220); `executeQuery` passes
   `options.entryId ?? null` (:108). r6/r5-ad.out: the session write with `entryId: 42` is refused
   ("Partition write refused before it was proposed: its entryId ..."), `rowPresent 0`, the TRANSACTION_COMMIT marker
   carries `ops: []`; committed-statement-outcome.test.js F-ai case green on head, red on 48ec6f3d6 ("a session write
   with an invalid entryId (number) is refused ({success:true, ... inTransaction:true})"). Direct
   `waitForCommittedWrite(42)` now registers a pending entry that the deadline releases 30 s later
   (`directGuard "The write was not proposed before its commit deadline"`): reachable only by a direct call; minor.
4. Hygiene. The cdc-stream-base guard is deleted (grep `Promise.reject|NO_LEADER` in that file: none); the
   `hostedConsensusSubstrate` comment corrected (raft-init-base.js:99-101); the tuning comment (raft-rs-runtime-tuning.js:49-51)
   and the contract sentence (impact-contracts.json `raft-rs-runtime-application-transaction`) state the healed-group
   first-write delay. Remaining out-of-bar "liferaft" text in touched files is pre-existing: the log message constants
   `PARTITION_SERVICE_LOG_MSG.BECAME_LEADER: 'Became leader (liferaft)'` (emitted at info on every leadership,
   r6/r6-listener.out) and `CLEARED_LIFERAFT_TIMERS`, the `LIFERAFT_*` value names, `Uses liferaft library`
   (raft-init-base.js:317), core-base.js:108,762, entry-apply-base.js:199; the no-legacy-naming guard checks only `ddb`.
5. Suites and receipts. r6/receipts-head.tap 6 pass / 0 fail, exit 0; r6/receipts-sealed.tap 0 pass / 6 fail, exit 1,
   census reasons ("135/135 system partition replicas ... lacks the rs-raft runtime fields", 'naming "liferaft"
   constructed and initialized a partition', `durable logs after 3 acknowledged writes: {"rsRaftPayloadEntries":0,
   "legacyLogRows":{"_raft_log":3}}`, "after restart: commitIndex=0", the legacy-state db initialized). Suite batch
   (r6/chain-r6.sh, thermal gate OK, `--test-concurrency=2`): r6/suite-files-r6.txt = the implementer's a12 244 files +
   the classification test + the branch-touched test files = 252 files: 6466 tests, 6448 pass, 0 fail, 0 cancelled,
   18 skipped, 138.2 s, exit 0 (r6/suites-r6.tap). test/scripts consumers of src/constants/errors.js: none; test
   importers: partition-runtime-reconstruction-leadership.test.js and partition-write-kernel.test.js (both in the
   batch). Static (r6/static-r6.out, every exit 0): complexity 1814/1814, cognitive 159/159, unused exports
   1437/1437, file size 27/27 + 21/21 (no hint), no-legacy-naming clean, curated shards current, primary/resource/
   subsystem `--check` 2165 (round 5: 2162, +3 new files), impact registry PASS 39 contracts / 16 pairs, quest-log
   append-only clean, boundary audit exit 0 (silent) and r2/audit-runner `violations=0`, eslint on the 112 changed js
   files (30 by A12) 0 lines. `git diff 48ec6f3d6..HEAD --stat -- src/query`: empty (the branch carries A11's 3-line
   `isReroutableWriteError` change there, approved in round 5).
6. Still-open list and new findings: below.

## Attack surface, items 1-10 (this head)

1. Old-backend fallback: r6/rerun-s8-closure.out identical to round 5 up to listing order (no legacy basename in the
   closure, no non-literal dynamic import); r6/rerun-r2-s12-selection.out identical (every `raftBackend`/`raftProvider`
   spelling `partition_consensus_backend_selection_refused`; nested/uppercase/options `createOperationPort` ignored,
   `factoryIsPrototype true`); r6/rerun-s2-durable-logs.out identical (`legacyLogRows null` at every step through
   session commit/rollback, 2PC, migration, restart; one payload entry per proposal).
2. Alternate constructor/test seam: as above; partition-construction-seam in the batch.
3. Raw core reachability: twelve operations unchanged (the A12 port diff touches only dispatch/containment); audit
   exit 0, `violations=0`; r6/rerun-r2-audit-mutants.out identical (M5/M7 detected, M3/M6/M8 undetected: F-s open).
4. Stale durable-state reuse / second log: r6/rerun-s1-detector.out identical (13 cases; F-k/F-u edges open); the
   restored-empty-table restart is refused, never reused (r6-restart-restored); no `_raft_log` row anywhere (s2).
   NEW rule attack: the partial-schema rule refuses a brand-new database that crashed between the constructor's four
   separate `exec` calls (F-ao).
5. Test stand-in: the F-ah witnesses run production PartitionService on file dbs with a real DROP TABLE, the
   production admitted-group fixture and a real core trap; my corruption probe adds SQLITE_CORRUPT. The F-ak
   deadline and CORE_REFUSED witnesses use the controllable port on a VirtualTimeSource (stated in the file); the
   production deadline is my r5-g2-timeout (30001 ms, real transport drop). The router witness feeds the kernel's own
   codes to real CDCIntegrationService/ReplicaOperationRepository instances.
6. Acknowledgement: r6/rerun-r2-s3-ack.out identical (ack after the applied transaction; same-entryId retries from
   the row in process and after restart; CDC once); nothing acknowledged while held (r6-corrupt, r6-listener);
   released writes never acknowledged (r5-g2, r4-g, r5-z2); `concurrentSameEntryId` shares one pending outcome
   (r6-encode: same answer object, `rowCount 1`), so DUPLICATE_ENTRY is unreachable from the write path.
7. Session isolation layer 1: r6/rerun-s4-session.out identical (typed `user-transaction-open` on every entry point,
   markers after COMMIT/ROLLBACK, F-d peer identity still erased, F-j budget); r6/rerun-s5b-demotion.out: new leader
   at round 21 (~160 ms harness; round 5: 16) - F13 as designed.
8. readStatus synchrony: r6/rerun-s6-readstatus.out identical; every held status this round answered synchronously
   (r5-ag/r6-corrupt `kind: value`; the witnesses assert `typeof then === 'undefined'`).
9. Runtime failure isolation: r6/rerun-r2-s10-delivery.out identical (per-peer delivery failures isolated); an
   unreadable record is now isolated to its group (r6-corrupt sibling untouched; witness 4: a core trap restores every
   readable group and holds the unreadable one); only a core trap replaces the runtime (W-B6-5, witness 4 in batch).
10. Recovery/replay: r6/rerun-s7-recovery.out identical (F-a open); restart on a restored record serves and replays
    idempotently (r6-restart-restored); the follower catches up after an in-place restore (r6-follower-restart);
    r6/rerun-r3-s7-tick-storm.out identical.

## Findings (new this round), grouped by category

owner-interaction / R03, R08 (in-bar: a consequence of A12's F-ak change, BLOCKING as B7):
- F-am. The control-plane retry classifier keys on the deleted deadline text. Evidence and consequences in the verdict
  paragraph above; fix: `isRetryableControlPlaneError` classifies a partition write answer by the kernel's
  `isReroutableWriteFailureCode` / the errors owner's fragments (one owner), delete
  `RETRYABLE_RAFT_WRITE_COMMIT_TIMEOUT_FRAGMENT`, and the classification test takes its input from
  `buildReleasedPendingWriteAnswer`. A related widening for the lead's F-aj quest: the deadline, shutdown, backpressure
  and consensus-refused texts joined `REROUTABLE_WRITE_ERROR_FRAGMENTS`, so the text-only query executor now
  auto-reroutes a 30 s `outcome_unknown` deadline release without an entryId (before A12 that answer was a hard
  failure the client decided on) - the F-aj double application is now reachable automatically from the deadline path.

harness-fidelity / observability (in-bar residue of F-ah, not blocking; the lead weighs it against the round's stated
expectation "a log line at error level names it"):
- F-an. A contained programming error leaves no log line. r6/r6-listener.out: the throwing listener is held typed
  with its message in `failure.reason` and answered on every write, but the runtime owner and the port have no logger
  (grep: none) and the partition logs only `role_transition` at info (9 lines, no cause) and "Raft command failed" at
  debug. An operator sees a partition flapping leader/follower once per window and typed write refusals, never the
  message at error level. One log line where the partition observes a HOST_FAILURE hold (once per record) closes it.

admission-gating / R11 (in-bar, minor: A12 introduced the rule):
- F-ao. The partial-schema rule cannot tell a lost table from an unfinished creation. `createRecordTables`
  (raft-rs-durable-store.js:141-152) runs the four CREATEs as four separate `exec` calls, not in one transaction; a
  brand-new database that crashed between them holds `_raft_rs_log` only and is refused forever as "lost a table"
  (r6/r6-restart-restored.out `freshDbPartialSchema`: `HOST_FAILURE durable-record-read no such table:
  _raft_rs_hard_state`, db released). `hasDurableRecordIn` (:476-486, every table present) and `createRecordTables`
  (any table present) also disagree on partial schemas. Fix: create the four tables in one transaction so the rule's
  premise holds.

recovery-replay / R11 (in-bar residue, recorded; implementer-reported):
- F-ap. A multi-replica partition whose record is unreadable initializes held: `initialize()` resolves and reports
  `initialized true` while the port answers `HOST_FAILURE/durable-record-read` (r6/r6-follower-restart.out); a lone
  partition is refused at init. The unavailability is explicit only on `readStatus`; the hold does let the follower
  heal in place (measured), which a refusal would not. Owner decision: refuse at init on both shapes, or make the
  partition's readiness consult the port's hold.

minor residues (in-bar, recorded):
- `encodeProposal` throws outside the port's containment: an un-encodable param (BigInt, cyclic) is answered
  `{success:false, error, partitionId}` without a code; nothing proposed, group usable (r6/r6-encode.out).
- The transport handlers' "not leader here" answers (entry-apply-base.js:709-715, :825-828,
  merge-replication-methods.js:217-220) carry text only; consumers classify by the owned fragment.
- Direct `waitForCommittedWrite(<non-string>)` registers a pending entry released only by the 30 s deadline
  (r6/r5-ad.out `directGuard`); the write path refuses before it.

process hygiene (landing):
- The worktree carries the uncommitted quest log (nine entries) and the lead's receipt.json whose `generatedAt`
  predates the A12 head; re-run `solve probe` on the landing head and commit both with the untracked
  verification-round-3/4/5.md in the landing scope.

## Still-open findings from rounds 1-5, status

- F-a prepared 2PC session lost across restart: open (r6/rerun-s7-recovery.out identical to round 5).
- F-b/F13 leader demotion under a long session: open, by design (r6/rerun-s5b round 21 / ~160 ms).
- F-d/F12 peer-identity reservation erased by a session ROLLBACK: open (r6/rerun-s4-session.out identical).
- F-e/F10 warm-up path db handle on a refused init: the campaign-refusal path releases it (r6-restart-restored
  `dbReleased true`; r6-multi-init `wrongSchema_lone dbReleased true` - the warm-up query does not touch the missing
  column, so that shape refuses typed); the undecodable-entry/warm-up throw path still by code reading
  (partition-committed-log.js -> `readCommittedEntriesIn` has no containment): open for that path.
- F-g S31 startup names the retired provider: open (`src/lagrange-runtime-startup.js` not in the branch diff).
- F-j 2 s inner deferral budget untyped beyond `deferRetry`: open (r6/r5-ae.out `deferralBudgetExpiry code null,
  deferRetry true, afterMs 2001`).
- F-k detector edges, F-u init-refusal DDL residue: open (r6/rerun-s1-detector.out identical).
- F-q stale-address REMOVE_PEER refused by shape: open (not re-run; membership administration untouched by A12).
- F-r `_partition_statement_outcomes` growth: open (untouched); healthy-group `_raft_rs_log` growth 0 holds (s2).
- F-s audit strength (M3/M6/M8 undetected): open (r6/rerun-r2-audit-mutants.out identical).
- F-u, F-v (QUEUED counted current): open (untouched).
- F-w self-attested leader identity in a replay answer: open (not re-run; untouched).
- F-ab deferred sole voter demoted by an unreserved sender never re-campaigns: open (not re-run; `enqueueStep`
  admission untouched by A12).
- F-ac failover 2.7-5.3 s under production jitter: open (not re-run).
- F-aj executor reroute without entryId double-applies: open, owner src/query (r6/r5-g2-dup.out `doubleApplied
  true`); reach widened by A12's fragment list (F-am note).
- F-al healed group's first write waits up to one window: stated in the tuning comment and the contract (A12); cost
  unchanged (r6-listener +1 term per reconstruction).
- F-ah, F-ak, F-ai: FIXED as measured above (F-ak with the consumer regression F-am/B7).

## Templates

### admission-gating
1 Precheck-predicts-enforcement: the write path and the session staging ask the same admission owner
(`admitCommittedCommand`, write-metrics-base.js:216-220 and :680-688); r5-ad: refused shapes add no entry, no row,
no marker operation. The classification precheck of the control plane (B7) now admits as terminal what the kernel
types as routable.
2 Transient vs terminal: every kernel code is classified by `isReroutableWriteFailureCode` (all but
CONSENSUS_HOST_FAILURE) and its text by the errors owner's list, in parity (kernel test 7); the control-plane
classifier disagrees for every kernel text except backpressure-by-`retryAfterMs` (r6-classify: OUTCOME_UNKNOWN,
DEADLINE, SHUTDOWN, CONSENSUS_REFUSED, NOT_LEADER, RECOVERY all `cpRetryable false`; only the deadline is a change
from the previous head).
3 Which budget governs: retry window = one election timeout (tuning owner; 1000 ms lone, 2660 ms under the fixture
jitter); backpressure retryAfterMs 100 (proposal-queue owner); pending-commit deadline 30 s
(PENDING_REQUEST_TIMEOUT_MS); deferral 2 s (F-j); no budget raised.
4 Reason shape: released/refused answers are objects `{success:false, error, failureCode, consensus{reason, phase|
deadlineMs, retryable|retryAfterMs}, partitionId, entryId}` (r5-g2-*.out, r4-g.out); held statuses carry
`failure{phase, reason, detail{table, code}}` and `durableProgress{state}` (r6-corrupt); the control-plane
classifier normalizes neither the code nor the nested `consensus.retryAfterMs` (B7).
5 Hold release: the next operation after `retryNotBefore` once the record/page/listener is healed (r6-corrupt
`afterRestore` success within one window, r6-listener heal, r6-follower-restart catch-up); a restart on a restored
record (r6-restart-restored).
6 Freshness: the record is re-read per reconstruction attempt (`readOpeningRecord` inside `reconstructGroup`);
`durableProgressOf` per failure record.
7 Message honesty: the recovery text names reason, phase and retry time; the deadline/shutdown/backpressure answers
now name cause, deadline and retry time; the contained throw's message is carried; the hollow classification test
asserts a text nothing produces.

### recovery-replay
1 Never clobber live with stale: `openingForReplacement` restores only readable groups and nulls the unreadable
group's stale handle (:464-473); the restored-empty-table restart refuses instead of leading an empty configuration;
`reconstructGroup` nulls the handle before re-reading (:602).
2 Restart vs live discrimination: `hasDurableRecord` at open; a reconstruction restores as a restart would and applies
the held committed entry once (r6-listener rows r0,r1,r3; witness 1 rows row-0..row-2).
3 Lost-enlistment refusal: F-a open.
4 Replay idempotence: the durable outcome row keyed by the client's entryId (r6-restart-restored `retryR1 true`,
r5-g2-dup `idempotentReplay`); a reroute without the id is not idempotent (F-aj, now automatic on the deadline path).
5 Absence proves nothing: a PROPOSED write released at the deadline or at shutdown is answered unknown, not failed
(r5-g2-timeout/shutdown); the control-plane classifier treats that unknown as terminal (B7).

### owner-interaction
1 Single owner: "may this answer be routed again" is decided by the kernel's code list and the errors owner's text
list in parity; a third decider (`RETRYABLE_CONTROL_PLANE_ERROR_FRAGMENTS`) restates it in its own terms and is now
wrong (B7, R03).
2 Typed boundary: `PARTITION_WRITE_RELEASE_CAUSE`, the release answer's `consensus.reason`, `RUNTIME_PHASE.
DURABLE_RECORD_READ/UNEXPECTED_THROW`, `failure.detail{table, code}`; `releaseEntry` is the one release; no boolean
option bag.
3 Paired invariants in one witness: partition-unreadable-durable-record.test.js test 1 holds "no escape across
scheduled ticks" + "bounded reconstruction" + "typed refusal with the phase" + "sibling untouched" + "heals in place"
in one deterministic witness, red on 48ec6f3d6 at "no exception or rejection escaped"; partition-write-typed-
releases.test.js pairs each release with "never proposed" (durable log read independently).
4 Stale-then-fresh: a record held across a class change carries the latest failure (r6-listener: SQLITE_FULL then
unexpected-throw, attempts accumulate); restoring the page/table heals on the next operation after the window.
5 Pressure/backoff: 1 reconstruction per window under a persisting read failure (r6-corrupt attempts 1/2/3 across two
windows), a throwing listener costs 4 reconstructions in 3.2 s (bound 5); backpressure carries the queue's own
retryAfterMs; whether the CDC/rebalancer reroute of a backpressure answer honours it was not measured (below).
6 Wake/release: the next operation after the window; the scheduled tick drives it on scheduled partitions.
7 Projection authority: `isLeader` follows the port while held (r6-listener `isLeaderFlagWhileHeld false`); the
durable progress is an observation with a named UNREADABLE state, never a claim.
8 Controlled negative: receipts 0/6 on the sealed head; the five A12 witness files 53 pass / 34 fail on 48ec6f3d6 at
the named behavioural assertions (r6/a12-witnesses-prev-head.tap); the implementer's red-first taps (a12/red-*.tap)
were not reproduced beyond this.
9 No local escape hatch: no options-supplied port; one release path (`clear` gone); one text list; the control-plane
classifier is a surviving second interpretation (B7).
10 Contract + registry + proof aligned: both contract descriptions changed with the mechanism and the four new
witnesses are registered (a12 impact-contracts diff), seal and classes regenerated, registry PASS; no contract
registers the kernel/errors-owner <-> control-plane-classification interaction (B7).

### harness-fidelity
1 Red for the right reason: item 5 above (34 behavioural reds; the CORE_REFUSED not-an-active-voter red on test 20 is
the old head's own answer).
2 Stub honesty: the F-ah witnesses use no stub; the deadline/CORE_REFUSED witnesses use the controllable port whose
propose answer is the port's own outcome vocabulary, and my production r5-g2-timeout confirms the deadline shape.
3 Time fidelity: the witnesses' windows are the tuning owner's (1000 ms lone, 150-300 ms election + 20 ms heartbeat in
the group fixture); the deadline witness advances the partition's own virtual clock by PENDING_REQUEST_TIMEOUT_MS;
ordering tick < heartbeat < window < deadline preserved.
4 Field fidelity: released answers carry entryId/cause/deadline; held statuses carry table/code/durableProgress;
the router witness feeds real instances the kernel's codes.
5 Vacuous assertions: `attempts <= bound` needs a sane window (measured); "never proposed" is read from the durable
log through the store's own statement; "nothing escaped" needs the escape counter to be the process's only listener
(it displaces and restores the others).
6 Live binding: receipt 1 is the live seed (6/6 head); the unreadable-record and corruption shapes bind the live
runtime owner with real SQLite failures.

## Commands run (counts, exit codes)
- Static (r6/static-r6.out): check-complexity 1814/1814 exit 0; check-cognitive-complexity 159/159 exit 0;
  check-unused-exports 1437/1437 exit 0; check-file-size-thresholds 27/27 + 21/21 exit 0; check-no-legacy-naming exit
  0; check-curated-test-shards exit 0; generate-test-{primary,resource,subsystem}-classes --check exit 0 (2165);
  impact-contract-registry PASS 39/16 exit 0; check-quest-log-append-only exit 0; raft-rs-operation-boundary-audit
  exit 0; eslint on 112 changed js files exit 0 (0 lines); r2/audit-runner `violations=0` exit 0.
- Scratch (r6/run-r6.out, every exit 0): r6-classify, r6-encode, r6-restart-restored, r6-multi-init, r6-listener,
  r6-corrupt, r5-ag, r5-ae, r5-g2 shutdown/backpressure/dup/timeout, r5-z2, r5-ad, r4-g, rerun-s8/s2/s1/s6/s4/s7/s5b,
  rerun-r2-s12/s10/s3-ack/audit-mutants, rerun-r3-s7; r6-follower-restart (exit 0, run separately). Normalized diffs
  against the round-5 outputs: 0 lines except s8 listing order and s5b's round count.
- Chain (r6/chain-r6.out): receipts head 6/0 exit 0; sealed archive 0/6 exit 1; A12 witnesses head 87/87 exit 0;
  A12 witnesses on the 48ec6f3d6 archive 53/34 exit 1; control-plane-error-classification test 12/0 exit 0; suite
  batch 252 files 6466 tests / 6448 pass / 0 fail / 18 skipped, 138.2 s, exit 0.
- Hygiene: `git status --short` unchanged by me; `ps` 0 children of mine at the end; the prev-head archive removed;
  no temp directory of mine in /tmp.

## Not verified
- The whole corpus on this head (252 files run).
- CORE_REFUSED on production (controllable port only; raft-rs forwards to the announced leader).
- SQLITE_IOERR proper (a short read surfaced as SQLITE_CORRUPT through the same read site).
- Whether the CDC/rebalancer reroute of a BACKPRESSURE answer honours `retryAfterMs` (owner-interaction item 5 for
  that code): not measured.
- The HLC warm-up throw path for an undecodable entry / a schema lacking `applied_index` (F-e/F10): code reading only.
- Inbound-envelope accumulation on a permanently held follower between windows: not observable from outside the
  runtime owner; not measured.
- F-q, F-w, F-ab, F-ac: not re-run this round (their owners untouched by A12).
- Main debt sea-bundle-smoke and production-scheduling-defaults: out-of-bar, not run.
