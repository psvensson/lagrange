# Verdict r7: raft-rs-single-path-partition-cutover (attempts A1-A13 integrated, landing round, narrow on A13)

Head verified: 8092ccc5993ad6b27265f524fe90f692d07f51a4 (worktree
/mnt/data/peter/projects/lagrange/.claude/worktrees/raft-rs-write-path). `git status --short` at start and end
(unchanged by me): ` M .../evidence/receipt.json` (the lead's `solve probe` output, `status fail -> pass`,
`generatedAt 2026-09-23T14:40:08Z`, which predates the A13 commit at 17:33Z; same test-file digest), ` M .../log.ndjson`
(the A13 attempt entry `at 8092ccc59` is the last line; append-only clean), `?? verification-round-3/4/5/6.md`. I
edited no repository file and ran no git write command. Every scratch script of this round lives under
scratchpad/verify/r7/ (the round-6 scripts re-run in place from r6/ with outputs written into r7/; the implementer's
three a13 controls copied into r7/ and re-run), each under `timeout`; the sealed-head archive scratchpad/verify/
sealed-head served the receipts' red control. `ps` at the end: 0 children of mine (the three `node --test
test/scripts/test-placement.test.js` processes alive at the end belong to the concurrent process-cone verifier,
`--test-concurrency=1`, not to my chain); no temp directory of mine survives (`ls /tmp | grep r7fao|r7fap|r7fan|
r7r14|a13x`: 0). Thermal gate before the receipts ("headroom OK (cpu 46C, nvme 67.85C)") and before the suite batch
("cpu 52C"); the batch ran at `--test-concurrency=2`.

## Verdict: APPROVE (no blocking item; every A13 claim holds under fresh measurement; four new non-blocking findings)

B7/F-am is closed: `isRetryableControlPlaneError` decides a partition write answer by ONE owner. The kernel
(src/partition/partition-write-kernel.js:53-70 `RETRYABLE_WRITE_FAILURE_CODES`, :98-124 `isPartitionWriteFailureCode`
/ `isRetryableWriteFailureCode` / `isReroutableWriteFailureCode(code, {carriesEntryId})`) owns the code list; the errors
owner (src/constants/errors.js:44-77) owns the texts and re-states nothing: `isRetryableWriteError` = the reroutable
fragments + the unknown-outcome text, `REROUTABLE_WRITE_ERROR_FRAGMENTS` no longer holds `WRITE_OUTCOME_UNKNOWN`. The
classifier (src/control-plane/control-plane-error-classification.js:230-256) asks the kernel when the candidate carries
a kernel code, the errors owner's text predicate otherwise, then its own non-write fragments; the dead fragment
`RETRYABLE_RAFT_WRITE_COMMIT_TIMEOUT_FRAGMENT` is gone (grep src test docs solve: none; r7-classify `OLD_deadlineText cp
false, fragmentGone true`); the classification test builds its inputs with the kernel builders and the port's own throw
(test/control-plane/control-plane-error-classification.test.js:39-92). r7/r7-classify.out: every kernel answer but the
host failure is retryable as the result, as an Error of its text, as an Error wrapping the answer (`cause`), as an Error
carrying the failureCode (text opaque), inside `participantFailures` / `firstFailedParticipant`, as the plain text and
as `{error}`; the host failure (and its environmental variant) is not, in every one of those shapes but the coordinator
wrapper (F-as, below); OUTCOME_UNKNOWN is `retryableByCode true, reroutableByCode false, reroutableWithEntryId true,
retryableText true, reroutableText false` (deadline, leadership-lost and core-fatal releases alike).

The reroute narrowing holds on production: the real executor over a real admitted three-replica group answers its
client the unknown outcome once and never sends the statement again (r7/a13-exec-dup.out: `deliveries [r1]`,
`values [v+,v+,v+]`, `doubleApplied false`; round 6 on fe70eb76e: v++), and a router carrying the entryId replays
idempotently (r7/r5-g2-dup.out `retrySameEntryId idempotentReplay`, witness test/query/partition-write-answer-
consumers.test.js F-aj case green). F-ao, F-an and F-ap hold as measured below. Receipts 6/6 on the head and 0/6 on
the sealed head for the census reasons; the 568-file batch (the a12 244 + test/control-plane 182 + test/query 148 +
branch-touched tests) is 19431 tests / 0 fail; the cdc epoch integration file passed under the batch load and alone
(11/11 both); every ratchet and static gate is green; `git diff fe70eb76e..HEAD -- src/query` is empty.

### Blocking
- none.

## Round-7 specifics, item by item (the lead's list), with fresh evidence

1. B7/F-am. One owner: the kernel's list (`RETRYABLE_WRITE_FAILURE_CODES`, every REFUSAL code but
   CONSENSUS_HOST_FAILURE, kernel :53-70) and the errors owner's text predicate (`isRetryableWriteError`, errors.js
   :65-77) which delegates to `isReroutableWriteError` + the unknown text - the errors owner lists texts, the kernel
   lists codes, neither restates the other; the classifier consumes both (control-plane-error-classification.js
   :236-249) and keeps its own fragments only for non-write failures. Call-site shapes: the 40+ `isRetryableControlPlaneError`
   consumers (grep, 54 files) hand it Errors, result objects and strings; `collectLinkedControlPlaneFailures` walks
   `cause`, `firstFailedParticipant` and `participantFailures` (:186-200), so an Error built by the rebalancer's
   `buildOperationPersistError` (message + deferRetry, no failureCode copied) classifies by text or by the `deferRetry`
   it already carries (r7-classify `errorOfText`/`errorWithCause`/`participantFailures` all true for the retryable
   answers). r7/r6-classify.out re-run: `deadlineProposed`/`deadlineQueued` `cpRetryable_result true, cpRetryable_asError
   true` (round 6: false/false); `leadershipLostQueued` (NOT_LEADER) true; `hostFailure` false; `OLD_deadlineText_preA12`
   false. The SQL engine's write tracking: witness test/query/partition-write-answer-consumers.test.js B7 case (real
   SQLQueryEngine + controllable partition released at its own virtual-clock deadline: `recorded []` for the routed
   release and for both kernel answers as answer and as Error) green in r7/a13-witnesses-head.tap; r7/a13-engine-
   deadline.out `persisted []`. Workflow transition retry: `deferTransitionRetry` (operation-workflow-transition-retry.js
   :152) asks the classifier, which now answers true for the deadline answers. Second local text matches among the
   consumers (grep): the rebalancer gateway keeps `isReroutableWriteError(errorMessage)` beside the classifier in
   `isRetryableOperationPersistError` (:249, a subset of what the classifier already answers - redundant, not
   contradictory) and in `hasOperationMutationRouteRepairSignature` (:398, the route-repair question, correctly the
   reroutable subset); cdc-routed-mutation-readiness `isTransientCdcError` (:697-717) asks the classifier first and
   keeps only non-write fragments; cdc-integration-service-shared-constants.js:45 spreads `REROUTABLE_WRITE_ERROR_FRAGMENTS`
   into the owner-handoff fragments (consumes the owner's list, so the narrowing reaches it). No consumer keeps a text
   of its own for a write answer.
2. Reroute narrowing. `REROUTABLE_WRITE_ERROR_FRAGMENTS` (r7-classify `owners`): six texts, no unknown-outcome text;
   `isReroutableWriteFailureCode(OUTCOME_UNKNOWN)` false, `{carriesEntryId: true}` true (kernel test `assertCodeRouting`,
   r7-classify). Parity witness states the exception (partition-write-kernel.test.js:669-708 `assertRetryAgreement`,
   `unknown` flag). Consumers census (grep `isReroutableWriteFailureCode|isReroutableWriteError` src): cdc-routed-
   mutation-readiness.js:181-183 (`isLocalSystemTableWriteRoutedOn`, code-first, no entryId -> unknown not sent on:
   witness partition-write-typed-releases.test.js F-aj case, PROPOSED not sent on / QUEUED sent on), cdc-integration-
   service-shared.js:420 (`isSystemTableOwnerHandoffFailure`, no entryId, default false -> unknown is not a handoff
   failure), replica-operation-repository-mutation-gateway-methods.js:384 (`isOperationMutationRouteRepairCandidate`,
   no entryId -> unknown not route-repaired) and :249/:398 by text (unknown text out), query-executor-write-retry-
   routing.js:394 text only (unknown text out: r7/a13-exec-dup.out, write-path-internal-pacing "answered its unknown
   outcome once, never re-sent" green). No code-aware consumer without the entryId reroutes it. `git diff --stat
   fe70eb76e..HEAD -- src/query`: empty (the branch carries A11's 3-line change only, approved in round 5).
3. F-ao. `createRecordTables` (raft-rs-durable-store.js:146-158) runs the four CREATEs inside `this.transaction(...)`
   (:213-221, admitted like every store write, better-sqlite3 transaction -> rollback on a throw). Witness
   partition-unreadable-durable-record.test.js F-ao (real SQLITE_FULL at the third CREATE via max_page_count: 0 tables
   left, the next open creates all four and serves; a hand-made two-table schema refused typed naming
   `_raft_rs_applied_state`, nothing created) green (r7/a13-witnesses-head.tap). r7/r7-fao.out (exit 0): hand-made
   partial schemas of two tables, three tables and the snapshot table alone are each refused
   `partition_consensus_init_refused` phase `durable-record-read` naming the missing table and `SQLITE_ERROR`, db and
   port released, no record table created (only the lifecycle table: F-u residue); a fresh db gets all four and serves;
   a store constructed while a user transaction is open on the connection is refused typed
   `RAFT_RS_STORE_USER_TRANSACTION_OPEN` and leaves no table. `hasDurableRecordIn` (:482-492, every table present) and
   `createRecordTables` (any table present) still answer different questions on a partial schema (false / skip), but
   with atomic creation a partial schema only ever comes from outside and both routes end in the same typed refusal.
   Note: the DDL is `CREATE TABLE IF NOT EXISTS`, so a non-table object bearing a record table's name (my VIEW
   `_raft_rs_applied_state`) is not "a table present", is silently skipped by the creation, and the record read then
   fails typed (`no such column: applied_index`, table named) - refused, db released; an outside shape, recorded only.
4. F-an. src/partition/partition-consensus-hold-log.js (100 lines) wired on every announcement (raft-lifecycle-wiring.js
   :41,68,82,94,112); the port and the runtime owner stay logger-free (grep `logger`: 0/0). r7/r7-fan.out (exit 0),
   the r6-listener shape with the partition's logger replaced by a recorder and three consecutive holds over 3-4
   windows each with 5 refused writes during the first: exactly ONE error line per hold (`errorLines 1 -> 2 -> 3`),
   message "Consensus group held by a contained unexpected throw; its writes are refused until it is reconstructed",
   payload `{partitionId, groupId, replicaIdentity, phase: unexpected-throw, reason: <the listener's message>,
   attempts}` with groupId/replicaIdentity equal to the port's status; no repetition across 5 refused writes nor across
   a hold with zero writes (`hold3NoWrites errorLines 3` after two heals); ONE info line per heal ("Consensus group
   serves again after its hold", role leader, term) confirmed on the next turn (`infoLines 1 -> 2 -> 3`); `mentionsTotal
   1` (no other line carries the message). The process output shows the same three level-50 lines (the recorder
   forwards to the base logger). r7/r6-listener.out re-run: 1 level-50 line naming the throw (round 6: none).
   Residue (implementer-reported, measured): an environment-failure hold logs nothing at warn/error - r7-fan
   `envHold` (dropped applied-state table, `HOST_FAILURE/durable-record-read`, attempts 3 over two windows):
   `warnOrErrorLines` = one unrelated CDC warn, `infoLinesNamingPhase 0`; and by code reading a hold that starts on a
   leaderless follower emits no announcement (`announceNoRole`, raft-rs-runtime-owner.js:169-180, emits only on a role
   or leader change), so it is named on the next announcement.
5. F-ap. `refuseConsensusHeldAtOpen` (raft-init-base.js:639-646) after the port is built (:483), for any replica count,
   `isHeldByHostFailure(readStatus())` -> `shutdown()` + `consensusInitRefusedError` (:93-101: code
   `partition_consensus_init_refused`, `phase`, `consensus` = the port's answer); the lone campaign refusal uses the
   same builder (:601). r7/r7-fap.out (exit 0): a follower of a real admitted three-replica group restarted on a
   dropped applied-state table: `initialize()` throws `partition_consensus_init_refused`, phase `durable-record-read`,
   `consensus.failure.detail {table: _raft_rs_applied_state, code: SQLITE_ERROR}`, message names phase and table,
   `initialized false, raft null, db null`; the leader keeps serving (`write true, role leader`); the table restored
   through the store owner's DDL and `putAppliedState` -> a FRESH `initialize()` resolves, `CORE_OK/follower`, catches
   up (row-0, row-1) and applies the next write once (row-2); a lone partition restarted on a dropped hard-state table
   is refused the same way, db released. r7/r6-multi-init.out: `missingTable` and `wrongSchema_multi` now refused typed
   with `dbReleased true` (round 6: initialized held, db open); r7/r6-follower-restart.out: `restartInit threw
   partition_consensus_init_refused` (round 6: resolved). Healing in place while running still holds: r7/r6-corrupt.out
   and r7/r5-ag.out identical to round 6 up to timing (SQLITE_CORRUPT garbaged/truncated page and DROP TABLE while
   running: held typed, one reconstruction per window, sibling untouched, heals after restore). Witnesses: F-ap
   follower case and the B5 restart case (committed-statement-outcome.test.js:702-708, unknown committed command at
   open -> `CONSENSUS_INIT_REFUSED`) green. One builder with an honest name; its message says "phase undefined" when
   the port's answer carries no phase (a campaign refusal): finding F-au below (r7-fap `messageWithoutPhase`,
   r7/rerun-s1-detector.out `legacy-beside-rs-record`).
6. Suites and receipts. r7/receipts-head.tap 6 pass / 0 fail, exit 0; r7/receipts-sealed.tap 0 pass / 6 fail, exit 1
   (sealed-head archive; census reasons). r7/a13-witnesses-head.tap: the nine A13 witness files 190/190, exit 0.
   Batch (r7/chain-r7.sh, thermal gate OK, `--test-concurrency=2`): r7/suite-files-r7.txt = 568 files (a12 244 +
   test/control-plane/*.test.js 182 + test/query/*.test.js 148 + branch-touched, deduplicated; none missing): 19431
   tests, 19385 pass, 0 fail, 0 cancelled, 46 skipped, 186.9 s, exit 0 (r7/suites-r7.tap, stderr empty).
   test/cdc/current-epoch-propagation.integration.test.js under the batch load (started 60 s in): 11/11 exit 0
   (r7/epoch-under-load.tap); alone after the batch: 11/11 exit 0 (r7/epoch-alone.tap) - the two A13 load timeouts did
   not reproduce. Static (r7/static-r7.out, every exit 0): complexity 1814/1814, cognitive 159/159, unused exports
   1437/1437, file size 27/27 + 21/21 (no hint), no-legacy-naming clean, curated shards current, primary/resource/
   subsystem `--check` 2167 (round 6: 2165, +2 files), impact registry PASS 40 contracts / 17 pairs, quest-log
   append-only clean, boundary audit exit 0 (silent) and r2/audit-runner `violations=0`, eslint on the 117 changed js
   files (19 by A13) 0 lines. r7/static2-r7.out: check-fast-static and audit:guidelines / audit:closure-ledger, see the
   commands section.
7. Still-open list and new findings: below.

## Deviation 4 (retryable includes outcome_unknown), weighed

(a) Control-plane consumers that re-send after `isRetryableControlPlaneError` (census of the 54 files): the bootstrap
retry loop `runRetryableControlPlaneWrite` (retryable-control-plane-write.js:18-23, 5 call sites: service-registration
handoff row, node-registration publication submit/update, system-metadata owner mutation, replica-handler status
update - all system-table rows), the CDC routed-mutation retry (`shouldRetryRoutedSystemTableMutationFailure`,
cdc-routed-mutation-readiness.js:720-738, system tables only), the rebalancer transition/persist retry
(replica_operations rows), the query executor's widening to a recovery candidate (`isRetryableControlPlaneWriteFailure`,
query-executor-write-retry-routing.js:450-462, gated on SYSTEM_TABLE_NAMES). NONE re-sends a USER-TABLE write:
r7/a13-exec-systable.out `user-proposed sent [node-a], success false` (unknown returned to the client) while
`system-proposed`/`system-queued` `sent [node-a, node-b]` (F-aq, both heads); the SQL engine's disposition
(sql-query-engine.js:302-306) and the distributed-transaction recovery sweep deferral (:226-228) are not re-sends;
the engine's `isRetryableControlPlaneMutationFailure` consumers (sql-query-engine-write-failure-methods.js:46,104,169)
build deferred results for system-table mutations. (b) R14 by measurement, r7/r7-r14.out (exit 0), a real lone
rs-raft partition, each statement sent twice under DIFFERENT entryIds (what a re-send after an unknown outcome is):
the CDC routed mutation's `INSERT OR REPLACE` (cdc-integration-service-mutations.js:188): `changes 1 / 1`, one row;
the replica-operation repository's canonical-ingress `INSERT OR IGNORE` (`ignoreExisting`, mutation-persistence-
methods.js:126-151 -> the gateway's `INSERT_OR_IGNORE_INTO`): `changes 1 / 0`, one row; its step-CAS
`UPDATE ... WHERE operation_id = ? AND workflow_step = ?`: `changes 1 / 0`; its terminal `... AND completed_at IS NULL`:
`changes 1 / 0`, the first terminal wins; the plain `INSERT` (the non-ingress shape) is NOT idempotent
(`SQLITE_CONSTRAINT_PRIMARYKEY` on the second), which is why the repository ingress uses OR IGNORE. Verdict on the
deviation: it re-establishes the pre-A11 behaviour for the deadline in the control plane only, on mutations that are
idempotent by construction; no user-table double application is reachable from it. Not blocking.

(c) Reach of the narrowing on text-only system-table loops (F-aj design point 4), by census with the measurements
above: the executor still widens a system-table write after an unknown outcome (a13-exec-systable); the CDC routed
mutation retries it in place (unknown is transient by the classifier and no longer a handoff signature -> retried,
not handed off); the rebalancer gateway retries it (deferred) but no longer route-repairs it; the CDC local
system-table lane answers it as is (handled) and its caller's retry loop re-sends. No system-table write fails
terminally on a release mid-proposal by this census. A live 5-node formation with the r5-g2 shapes was NOT run
(time; the thermal budget was spent on the 568-file batch); recorded under "not verified".

## Attack surface, items 1-10 (this head)

1. Old-backend fallback: r7/rerun-s8-closure.out identical to round 6 up to listing order and +1 module (the hold
   log); r7/rerun-r2-s12-selection.out identical; r7/rerun-s2-durable-logs.out identical (`legacyLogRows null`
   throughout, one payload entry per proposal).
2. Alternate constructor/test seam: as above; partition-construction-seam in the batch.
3. Raw core reachability: the port is untouched by A13 (diff stat); audit exit 0, `violations=0`.
4. Stale durable-state reuse / second log: r7/rerun-s1-detector.out identical but for the refusal code name;
   r7-fao partial schemas never reused; no `_raft_log` row anywhere (s2); r7-r14 `logEntries 11` for 11 proposals.
5. Test stand-in: the F-an witness and my r7-fan run production PartitionService on file dbs with a real SQLITE_FULL;
   the F-ap/F-ao witnesses and r7-fap/r7-fao use the production admitted-group fixture and real DROP TABLE / page
   limits; the F-aj witness and a13-exec-dup put the REAL QueryExecutor over a real 3-replica group; the B7 engine
   witness uses the real SQLQueryEngine over a controllable partition released on its own virtual clock (the
   production 30 s deadline is r7/r5-g2-timeout.out, identical to round 6).
6. Acknowledgement: r7/rerun-r2-s3-ack.out identical (ack after the applied transaction; same-entryId retries; CDC
   once); nothing acknowledged while held (r7-fan refusals typed); released writes never acknowledged (r5-g2 reruns).
7. Session isolation layer 1: r7/rerun-s4-session.out identical (typed refusals, markers after COMMIT/ROLLBACK, F-d,
   F-j); r7/r5-ad.out and r7/r5-ae.out identical (`deferralBudgetExpiry afterMs 2002`).
8. readStatus synchrony: r7/rerun-s6-readstatus.out identical; every held status this round was a value.
9. Runtime failure isolation: an unreadable record at open is now a typed init refusal of that replica alone (the
   leader serves: r7-fap); while running it stays the group's own hold (r7/r6-corrupt sibling untouched).
10. Recovery/replay: r7/r6-restart-restored.out: restart on the missing table refused typed; restored with its row ->
    serves, same-entryId replay idempotent; restored empty -> refused `CORE_REFUSED not-an-active-voter`, db released;
    r7-fap fresh init after restore catches up. F-a (prepared 2PC session lost across restart): not re-run this round
    (untouched by A13).

## Findings (new this round), grouped by category

owner-interaction / R02, R03 (in-bar, minor, not blocking):
- F-at. The environmental application failure is classified as failed for good. `hostFailureProposalAnswer`
  (partition-write-kernel.js:334-342) answers a committed entry whose application failed in the host environment with
  the rejection's own code `partition_committed_statement_environment_failed` and the text "Committed partition
  statement failed in the host environment; the entry is not consumed and is applied again when the host recovers";
  that code is not a kernel REFUSAL code and the text is on no owner's list, so the control plane classifies it
  terminal in every shape (r7-classify `hostFailureEnv cp:* false` except the coordinator wrapper): the SQL engine
  records a durable failed write-operation row and a workflow transition goes terminal for a write that consensus
  committed and will apply. The lead's rule excluded the host failure while proposing (CONSENSUS_HOST_FAILURE) from
  retry; this is the post-commit application variant of the same class. Owner decision: list the environmental code
  (or its text) with the not-failed-for-good answers, or state that the caller decides for both host-failure variants.
- F-av. The registered pair `partition-write-answer-retry-classification` names three consumer owners; two more
  consume the same owners' predicates and are not in the pair: src/cdc/cdc-integration-service-shared.js:420
  (`isReroutableWriteFailureCode` in the handoff signature) with src/cdc/cdc-integration-service-shared-constants.js:45
  (spreads `REROUTABLE_WRITE_ERROR_FRAGMENTS`), and src/query/query-executor-write-retry-routing.js:394 (the text
  consumer the pair's own witness exercises). Registry PASS does not require them; R02 does for the next change to
  that interaction.

admission-gating / R07 message honesty (in-bar, minor):
- F-au. `consensusInitRefused(partitionId, answer)` (partition-service-constants.js:720-725) interpolates
  `${answer?.phase}` unconditionally, so a campaign refusal without a phase reads "refused it in phase undefined
  (CORE_REFUSED: not-an-active-voter)" (r7-fap `messageWithoutPhase`; live: r7/rerun-s1-detector.out
  `legacy-beside-rs-record`, r7/r6-restart-restored.out `restartEmptyTable` names phase `campaign-eligibility` because
  that answer carries one). The old builder omitted the phase clause when absent.

harness-fidelity / observability (in-bar residue of F-an, implementer-reported, measured):
- F-an residue: environment-failure holds (durable-record-read, application) have no warn/error line
  (r7-fan `envHold`), and a hold starting on a leaderless follower is named on the next announcement
  (announceNoRole emits nothing when the role and leader are unchanged). The unexpected-throw hold - the round's
  stated expectation - is named once at error level.

recovery-replay / R11 (in-bar, minor, recorded):
- The init-refusal path still creates `_raft_rs_replica_lifecycle` before refusing (r7-fao `after` lists it on
  every partial schema; F-u residue, unchanged).
- `CREATE TABLE IF NOT EXISTS` lets a non-table object with a record table's name block that table's creation
  silently inside the atomic creation; the read then refuses typed (r7-fao `viewCollision`). Outside shape.

implementer-reported residue for the F-aj src/query quest, confirmed by measurement or reading: F-aq (system-table
writes with an unknown outcome are widened to a recovery candidate under a fresh id: a13-exec-systable, both heads;
idempotent by R14 for the upsert shapes measured), F-ar (the transport query reply drops failureCode/retryAfterMs/
consensus/entryId: entry-apply-base.js:753-768, so every routed answer classifies by text - r7-classify shows text
and code agree for every kernel answer, so nothing is lost today), F-as (the classifier walks `participantFailures`
and `firstFailedParticipant`, not `participantResults`; the coordinator's generic "Distributed operation failed due
to participant failures" text makes the wrapper retryable whatever the participant's code: r7-classify
`hostFailure cp:participantFailures true`, `SQLITE_CONSTRAINT_asParticipant cp true`; pre-existing).

process hygiene (landing):
- receipt.json `generatedAt 14:40:08Z` predates the A13 head; re-run `solve probe` on the landing head and commit it
  with the untracked verification-round-3..7.md in the landing scope.

## Still-open findings from rounds 1-6, status

- F-a prepared 2PC session lost across restart: open (not re-run; untouched by A13).
- F-b/F13 leader demotion under a long session: open, by design (not re-run; untouched).
- F-d/F12 peer-identity reservation erased by a session ROLLBACK: open (r7/rerun-s4-session.out identical).
- F-e/F10 warm-up path: the campaign/open refusal paths release the db (r7-fap, r7-fao, r7/r6-multi-init `dbOpen
  false`); the undecodable-entry warm-up throw path by code reading only: open for that path.
- F-g S31 startup names the retired provider: open (`src/lagrange-runtime-startup.js` not in the branch diff).
- F-j 2 s inner deferral budget untyped beyond `deferRetry`: open (r7/r5-ae.out `deferralBudgetExpiry code null`).
- F-k detector edges, F-u init-refusal DDL residue: open (r7/rerun-s1-detector.out identical; r7-fao lifecycle table).
- F-q stale-address REMOVE_PEER refused by shape: open (not re-run; untouched).
- F-r `_partition_statement_outcomes` growth: open (untouched); healthy-group `_raft_rs_log` growth 0 holds (s2).
- F-s audit strength (M3/M6/M8 undetected): open (not re-run; the audit and the port untouched by A13).
- F-u, F-v (QUEUED counted current): open (untouched).
- F-w self-attested leader identity in a replay answer: open (not re-run).
- F-ab deferred sole voter demoted by an unreserved sender never re-campaigns: open (not re-run).
- F-ac failover 2.7-5.3 s under production jitter: open (not re-run).
- F-aj executor reroute without entryId double-applies: NARROWED - no consumer reroutes an unknown outcome without
  the entryId any more (a13-exec-dup `doubleApplied false`); the src/query quest still owes carrying the entryId on
  every reroute (F-aq/F-ar/F-as recorded for it); a caller that re-proposes by hand under a fresh id still
  double-applies (r7/r5-g2-dup `rerouteWithoutEntryId doubleApplied true` - inherent, not a consumer).
- F-al healed group's first write waits up to one window: unchanged (r7/r6-listener +1 term per reconstruction).
- F-am/B7, F-an (unexpected-throw hold), F-ao, F-ap: FIXED as measured above.
- F-ah, F-ak, F-ai: hold (round-6 measurements re-run identical: r7/r6-corrupt, r5-ag, r5-ad, r5-ae, r5-g2-*).

## Templates

### admission-gating
1 Precheck-predicts-enforcement: the control-plane classification precheck now consults the same owner the
kernel enforces (code list / text list, r7-classify parity columns); the SQL engine's disposition and the workflow
retry follow it (a13-engine-deadline `persisted []`; transition-retry :152). The init refusal precheck
(`refuseConsensusHeldAtOpen`) reads the same `readStatus()` the write path refuses on (`isHeldByHostFailure`, one
predicate, kernel :268-271).
2 Transient vs terminal: every kernel code but CONSENSUS_HOST_FAILURE is retryable; OUTCOME_UNKNOWN is retryable but
reroutable only with the entryId; the environmental application failure is terminal by omission (F-at); the
coordinator wrapper is retryable by its generic text whatever the participant (F-as).
3 Which budget governs: unchanged (retry window = one election timeout; backpressure retryAfterMs 100; pending-commit
deadline 30 s; deferral 2 s; the bootstrap retry loop's 30 s `DEFAULT_RETRY_TIMEOUT_MS`); no budget raised.
4 Reason shape: the classifier reads `failureCode` on the candidate, `message`/`error`/string for text, `retryAfterMs`
top-level; the transport reply drops the code (F-ar) so routed answers are text; text and code agree (r7-classify).
5 Hold release: the hold log confirms a heal on the partition's next turn after the announcement that showed the
group usable (r7-fan `heal1` info after `nextTurn`); the init refusal releases db and port at once (r7-fap).
6 Freshness: `readStatus()` per announcement and per confirmation turn; the record re-read per reconstruction.
7 Message honesty: the hold line carries the throw's message, group, replica and attempts (r7-fan `first`); the init
refusal names phase, table and SQLite code (r7-fap), except "phase undefined" without a phase (F-au).

### recovery-replay
1 Never clobber live with stale: a replica refused at open holds nothing (db/port null, r7-fap); a partial schema is
never completed in place (r7-fao `after` = `before` + lifecycle).
2 Restart vs live discrimination: unreadable at open -> refused typed; unreadable while running -> held in place and
healed (r7/r6-corrupt, r5-ag); the two are told apart by where the read fails (`refuseConsensusHeldAtOpen` runs once
after the port is built).
3 Lost-enlistment refusal: F-a open.
4 Replay idempotence: same-entryId retry answered from the outcome row (r7-r14 `sameEntryIdRetry idempotentReplay
true`; r7/r5-g2-dup `retrySameEntryId`); re-sends under fresh ids are idempotent only for the OR REPLACE / OR IGNORE /
CAS shapes the control-plane consumers use (r7-r14), which is the ground deviation 4 stands on.
5 Absence proves nothing: an unknown outcome is answered unknown to the client and never re-proposed by a text-only
consumer (a13-exec-dup, write-path-internal-pacing); the control plane treats it as not failed (r7-classify).

### owner-interaction
1 Single owner: "may this answer be retried / routed again" - the kernel's code lists + the errors owner's text lists,
consumed by the classifier and the four routers; no consumer keeps a text of its own (item 1 grep).
2 Typed boundary: `RETRYABLE_WRITE_FAILURE_CODES`, `isReroutableWriteFailureCode(code, {carriesEntryId})` (a named
option, not a boolean bag: it states what the caller carries), `isHeldByHostFailure`, `CONSENSUS_INIT_REFUSED` with
`phase` and `consensus`.
3 Paired invariants in one witness: partition-write-answer-consumers.test.js F-aj case holds "the executor sends once
and the client is told unknown" and "a router with the entryId replays idempotently" in one deterministic witness
over one real group; partition-write-kernel.test.js holds code/text parity and the unknown exception in one test.
Red-on-revert: write-path-internal-pacing's re-expressed case and the classification test are red on fe70eb76e by
construction (the old assertions were the opposite); I did not re-run the previous head this round (the round-6
archive was removed); the implementer's red taps are in a13/out.
4 Stale-then-fresh: the hold log's CONFIRMING state re-arms to NAMED when the next turn still shows the hold
(hold-log.js:58-62; r7-fan `hold2` after `heal1`: named again once).
5 Pressure/backoff: the classifier keeps `retryAfterMs`/`deferRetry`/pressure first (:237-241); the bootstrap and
CDC loops keep their own budgets and delays (`resolveTransientCdcRetryDelayMs` honours `retryAfterMs`); one error
line per hold, none per operation (r7-fan).
6 Wake/release: announcements drive the hold log; the init refusal is immediate; the healed group serves on the next
operation after the window (r7-fan `heal1 write true`).
7 Projection authority: the hold log reads the port's status, never its own state, to name a heal (confirmHealed);
`isLeader` follows the port (r7/r6-listener `isLeaderFlagWhileHeld false`).
8 Controlled negative: receipts 0/6 on the sealed head; r7/r6-classify.out vs round 6 (the same script, head-only
change: deadline answers false -> true, OLD text true -> false); a13-exec-dup `doubleApplied false` vs round 6 true.
9 No local escape hatch: no consumer bypasses the pair; the gateway's residual `isReroutableWriteError` calls are
subsets of the owner's answer; the hold log is one observer, once per hold.
10 Contract + registry + proof aligned: new contract + pair registered with five witnesses, the port contract and the
runtime-application contract descriptions changed with the mechanism, the hold log added as an owner, seal and classes
regenerated, registry PASS 40/17; two consumers outside the pair (F-av).

### harness-fidelity
1 Red for the right reason: the re-expressed pacing case asserts the opposite of the old head's behaviour at the named
behavioural assertions ("the statement is not sent again without its entryId", count 0); the classification test's
inputs are the kernel's answers; the F-ao case asserts a real SQLITE_FULL code and zero tables.
2 Stub honesty: the F-aj CDC lane case stubs `resolveLocalSystemTableServices` with the kernel's own answers (the seam's
contract shape) - stated in the file; the engine's B7 case uses a real partition and a stubbed router that advances
the partition's own clock; a13-exec-dup/systable use real handlers or the kernel's answers.
3 Time fidelity: group timing 20/150-300 ms, lone window 1000 ms; the hold-log witness sleeps 3 windows + 80 ms
(ordering tick < heartbeat < window preserved); the deadline case advances exactly PENDING_REQUEST_TIMEOUT_MS.
4 Field fidelity: answers carry entryId/failureCode/consensus; refusals carry phase/table/code; log payload carries
groupId/replicaIdentity/attempts (r7-fan).
5 Vacuous assertions: "exactly one error line" needs a hold that reconstructs more than once (`attempts >= 2` asserted;
r7-fan attempts 4/7/11); "recorded []" needs the engine to have tracked the result (`tracked.length 1` asserted).
6 Live binding: receipt 1 is the live seed (6/6); the F-an/F-ap/F-ao shapes bind the live runtime owner and store
with real SQLite failures on production PartitionService.

## Commands run (counts, exit codes)
- Static (r7/static-r7.out): check-complexity 1814/1814 exit 0; check-cognitive-complexity 159/159 exit 0;
  check-unused-exports 1437/1437 exit 0; check-file-size-thresholds 27/27 + 21/21 exit 0; check-no-legacy-naming exit
  0; check-curated-test-shards exit 0; generate-test-{primary,resource,subsystem}-classes --check exit 0 (2167);
  impact-contract-registry PASS 40/17 exit 0; check-quest-log-append-only exit 0; raft-rs-operation-boundary-audit
  exit 0; eslint on 117 changed js files exit 0 (0 lines); r2/audit-runner `violations=0` exit 0.
- Static 2 (r7/static2-r7.out, every exit 0): check-fast-static "ok in 48687ms" (proof range 9d85ac283..HEAD);
  audit:guidelines 0 new violations in every guideline (literals, decision boundaries, boundary-mode contracts,
  hot-path diagnostics, deferred outcomes, silent catch, ambient intrinsics, terminalize vocabulary; inherited
  baselines matched); audit:closure-ledger 43 records, 0 drift.
- Scratch reruns (r7/rerun-r7.out, every exit 0): r6-classify, r6-restart-restored, r6-multi-init, r6-listener,
  r6-corrupt, r6-follower-restart, r6-encode, r5-ag, r5-g2 dup/timeout/shutdown, r5-ad, r5-ae, rerun-s2/s1/s8/s6/s4,
  rerun-r2-s12/s3-ack. Normalized diffs against the round-6 outputs: only the expected A13 changes (classification,
  refusal code/message, multi-replica init refusal, the hold log line), timing and pids.
- New attacks (r7/run-r7-attacks.out, every exit 0): r7-classify, r7-fao, r7-r14, r7-fap, r7-fan (15 s),
  a13-exec-dup, a13-exec-systable, a13-engine-deadline.
- Chain (r7/chain-r7.out): receipts head 6/0 exit 0; sealed archive 0/6 exit 1; A13 witnesses 190/190 exit 0; batch
  568 files 19431 tests / 19385 pass / 0 fail / 46 skipped, 186.9 s, exit 0; epoch file under load 11/11 exit 0 and
  alone 11/11 exit 0.
- Hygiene: `git status --short` unchanged by me; `ps` 0 children of mine at the end; no temp directory of mine.

## Not verified
- The whole corpus on this head (568 files run; main debt sea-bundle-smoke / production-scheduling-defaults out-of-bar,
  not run).
- A live 5-node formation with the r5-g2 shapes through a node (deviation 4 (b) was answered by census + the executor
  and CDC-lane measurements).
- Red-on-revert of the A13 witnesses on fe70eb76e (not re-run; the implementer's a13/out red taps not reproduced).
- The rebalancer gateway's classification was read, not driven (its predicates are prototype methods over a
  repository; the kernel answers were fed to the classifier it delegates to).
- F-a, F-b, F-q, F-s, F-w, F-ab, F-ac: not re-run this round (their owners untouched by A13).
- SQLITE_IOERR proper; CORE_REFUSED on production; inbound accumulation on a permanently held follower (as in round 6).
