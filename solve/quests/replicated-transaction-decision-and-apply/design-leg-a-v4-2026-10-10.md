---
audience: development
documentClass: planning
---

# TX1 Leg A design, revision 4 (2026-10-10)

Quest `replicated-transaction-decision-and-apply` (sealed df51b799a). Supersedes
[revision 3](design-leg-a-v3-2026-10-10.md), rejected by the round-3 design vet
(REVISE, 13 blockers V1-V13, recorded in `log.ndjson` at 12:48:48.261). Revisions
1-3 stay as history. Revision 4 is revision 3 amended: unchanged text is carried
over, and every change answers a round-3 blocker or nit, or one of the lead's
revision-4 decisions Q-Z. Deviations from the brief are in section 0.5.

Citations are `file:line` verified on this checkout at HEAD 0643090d7. `git diff
84ae1a623..0643090d7 -- src test scripts` is empty (the commits since revision 3
only append quest logs), so the round-3 vet's verification of about 90
citations still holds. New citations were checked for this revision.

Witnesses:

- [`test/partition/partition-transaction-replicated-apply-v3.test.js`](../../../test/partition/partition-transaction-replicated-apply-v3.test.js)
  is the live file, amended in place: 46 tests, 42 red, 4 controls green.
- [`test/partition/partition-transaction-replay-cursor-v4.test.js`](../../../test/partition/partition-transaction-replay-cursor-v4.test.js)
  is a sibling: 2 tests over a real rs-raft log, both red.
- [`test/test-helpers/participant-transaction-fixture.js`](../../../test/test-helpers/participant-transaction-fixture.js)
  is the shared fixture.

First run: `evidence/red-v4-first-run.tap`. The revision-3 run stays as
`evidence/red-v3-first-run.tap`.

## 0. Dispositions

### 0.1 Plain statement of the landing rule (lead decision A, unchanged)

There is ONE protocol and ONE cutover change set. It spans the coordinator
(query lane) and the participant (this lane) and lands as one unit, under the
query owner's agreement of the seam in [`seam-2026-10-10.md`](seam-2026-10-10.md)
(revision-3 and revision-4 sections). No landed head keeps a legacy acceptance
path, and no landed head breaks a current transaction. Consequently **no
participant source lands before the seam is agreed**. Until then this lane's
deliverables are exactly: this design, the witness files and their red output,
the evidence producer, and the supersession inventory (section 9).

### 0.2 The 13 round-3 blockers

| # | Blocker (round 3) | Revision-4 disposition | Section | Witness |
| --- | --- | --- | --- | --- |
| V1 | Atomicity witnesses measure only `test_table` rows; state and outcome rows written after commit would pass | W2b's probe now records, at the applied-state write, the row count, the `_participant_transactions` state and the `txop:` count: expected `[{rows:1, state:'COMMITTED', txop:1}]`. An afterCommit write of the state or the outcomes fails it. | 6.1 | W2b |
| V2 | Nothing witnesses the BEGIN-time base | Two leader-driven witnesses. W14: BEGIN, session read, session write, committed write, PREPARE: refused `conflict`, nothing proposed (a base read at PREPARE fails it). W15: the proposed `validationText` equals the digest of the generation read at BEGIN, and the apply refuses it after a write committed between proposal and apply. | 3.2 | W14, W15 |
| V3 | Nondeterministic SQL makes PREPARE and COMMIT diverge across replicas | Lead decision Q: such session writes are refused at staging (`participant_transaction_session_write_nondeterministic`, limit L7). The same classifier, a pure function of the committed SQL text, refuses a PREPARE carrying one on every replica (`refusalCause: nondeterministic`), before any dry run. K is restated in 6.2. Ordinary writes keep the class, as finding F-DET. | 3.3, 6.2 | W6n, W3c |
| V4 | `g` derived from compactable outcome rows can revisit a value (ABA) | Lead decision R: a dedicated single-row write generation in the sibling table `_partition_write_generation`. It is incremented inside the apply transaction by every applying write and every writing PREPARE/decision apply, never compacted, and carried in any partition image. | 3.2, 5.1 | W13 |
| V5 | `transactionId` collides across SQL engines on one node | Lead decision S: 128-bit random, made unique by an insert-once write of the `sql_transactions` row before any fanout. The primary key is the authority; a collision is typed and re-mints. No node, incarnation, sequence, session or clock component. | 2.1 | W10a, W10c |
| V6 | A committed transaction command can be answered as failed | Lead decision T: the participant's answer owner maps every answer for a command that is committed or may still commit to `{success:false, outcome: UNKNOWN}`. That covers an environmental failure of the leader's own apply and a host failure while proposing. | 7 | W11e, W11f |
| V7 | S1 pins `success:false`; FAILED after COMMITTING strands PREPARED; the row is silently unpersisted | Lead decision U: S1 rewritten (no rollback, still COMMITTING, the caller learns the commit point). S3: no FAILED and no re-PREPARE after COMMITTING. S4a: recovery completes a decided FAILED row. S4b: unpersistable transaction state is a typed refusal. New seam falsifiers S5-S8 cover items A, E, F and G. | 8.4, 11 | S1, S3, S4a, S4b, S5-S8 |
| V8 | L5 understates the contention regression (R12) | Lead decision V. Single-partition autocommit statements are not distributed transactions and are unaffected (`sql-query-engine-write-execution.js:83-90`). Multi-partition autocommit statements are affected; they are listed, along with their retry owner and budget (with a recorded deviation, 0.5), and a contention witness measures the abort rate. Hybrid per-row bases are the Leg B refinement. **The exposure is an explicit owner decision.** | 3.6 | W16 |
| V9 | Receipts 2, 3 and 4 can close on port-only evidence | Lead decision W: shell receipts that run the port subset with the exact-count rule AND the real three-replica file `test/raft/raft-rs-backend/transaction-leg-a-three-replica.test.js`, which does not exist yet, so they stay red until A1-A5 exist. | 10.2 | producer |
| V10 | Deferred writer budget unnamed; release is polling only | Lead decision X. A write arriving while the partition is reserved is parked unproposed in the proposal queue, under its own `PENDING_REQUEST_TIMEOUT_MS` deadline. The decision's apply re-admits the parked writers as a post-commit effect. | 4, 7 | W7a, W7b |
| V11 | Inventory incomplete | Added: `durable-replay-cursor.test.js`, the three ONE_PHASE_COMMIT fixtures, the BLOB/BigInt/Date parameter narrowing (a named contract change), and the multi-partition autocommit population. | 9 | inventory |
| V12 | The replay-cursor half of B8 is expressible | Sibling file, real rs-raft log. RC1 (a STATEMENT_FAILED source entry is mirrored today: red through the existing mechanism, finding F-MIR). RC2 (reserved-refused and transaction entries are not mirrored: new-surface red). | 8.1 | RC1, RC2 |
| V13 | Brief and deviations unrecorded; producer widening unrecorded | The A-P brief and the 84ae1a623 producer/harness widening were recorded by the lead at 0643090d7. The Q-Z brief and every deviation from A-Z are recorded in section 0.5. 10.2 is corrected: this revision changes the producer under the lead's widened scope. | 0.5, 10.2 | n/a |

### 0.3 The twelve witnesses round 3 requires (its section 3)

| # | Requirement | Witness | Red on 0643090d7 because | Not greenable by |
| --- | --- | --- | --- | --- |
| 1 | W2b probe records state and txop | W2b | decision UNRECOGNISED, probe `[]` | an afterCommit state/outcome write (probe would show `state: PREPARED, txop: 0`) |
| 2 | Leader-driven conflict base | W14, W15 | W14: the ordinary write fails `RAFT_RS_STORE_USER_TRANSACTION_OPEN` under the open session; PREPARE answers LOCAL_STAGING success. W15: no PREPARE proposed | reading the base at PREPARE (W14 then proposes) |
| 3 | Nondeterministic operation: identical disposition | W6n (staging), W3c (apply, two replicas) | W6n: all five writes are staged (success, no code). W3c: UNRECOGNISED | pinning nothing at staging (W6n), or a per-replica dry run (W3c) |
| 4 | Generation ABA or monotonic generation | W13 | the intervening write fails under the open session; PREPARE succeeds | a MAX over compactable rows (after the DELETE the leader would propose) |
| 5 | Same node, same incarnation, distinct ids | W10a, W10c | both mint `tx-default-1000-1`; BEGIN throws on the collision with one attempt | a node/incarnation/sequence composition |
| 6 | Leader environmental apply failure, host failure while proposing: UNKNOWN | W11e, W11f | no PREPARE proposed; COMMIT answers without `outcome` | today's `unansweredWriteResult` mapping |
| 7 | S3, S4, S1 without `success:false` | S1, S3, S4a, S4b | S1 rolls back `['p1','p2']`; S3 `FAILED` and 1 re-prepare; S4a no commit; S4b `skipped silently` | n/a (query lane) |
| 8 | Contention | W16 | answers are untyped LOCAL_STAGING successes | n/a (measurement; the rate is reported, not asserted) |
| 9 | Deferred writer released on the decision apply within its budget | W7a, W7b | the write is proposed at once (1), and the deadline answers OUTCOME_UNKNOWN | polling `deferRetry` (W7a expects no proposal while reserved) |
| 10 | Replay cursor over a real log | RC1, RC2 | RC1 mirrors `dup-a`; RC2 fails at setup (`HOST_FAILURE: committed-command-unknown`) | n/a |
| 11 | Real A1-A5 bound into receipts 2-4 | producer | shell receipts fail on the missing real-backend file and on the red subset | port-only evidence |
| 12 | CDC exactly-once; mirror sender's handling of a reserved refusal | stays red / stated unverified | no witness possible yet (section 10.3) | n/a |

### 0.4 Round-2 blockers

Round 3 closed B1, B3, B5, B9, B11, B12, B14, B16, B17 and B18 (its section
2a). It accepted B6 and B8 as limits. It left B2, B4, B7, B13, B15 and B19
partial and B10 unresolved. Revision 4 answers those through V1 (B2), V3
(B4), V10 (B7), V6 (B13), V11 (B15), V7 (B19) and V5 (B10). Revision 3's 0.2
table stays as the record for the closed items.

### 0.5 The brief and every deviation (R16, R21)

Revision 3 was built on lead decisions A-P, recorded at 0643090d7. Revision 4
builds on them plus Q-Z:

- Q: fail closed on nondeterministic session writes.
- R: a dedicated write generation.
- S: a random insert-once transactionId.
- T: UNKNOWN for any command that is committed or may still commit.
- U: rewritten S1, plus S3, S4 and seam falsifiers for A, E, F and G.
- V: name the contention population, retry owner and budget; the exposure is
  an owner decision.
- W: shell receipts bind the real three-replica file.
- X: event-driven release of deferred writers under their own deadline.
- Y: inventory additions, and a real-log replay-cursor witness.
- Z: W2b probe, leader-driven base witnesses, session-read column, typed
  COMMIT-time recheck.

Deviations and refinements, with their evidence:

1. **D (per-row base digests), unchanged from revision 3.** Leg A's only key is
   the partition. Session writes reach the participant only as raw SQL
   (`partition-service-write-metrics-base.js:100-118`). The only key resolver
   guesses one primary key from SQL text (`partition-service-transaction-base.js:195-222`,
   `partition-split-routing.js:102-131`). Round 3 judged this justified. Under R
   the base is the dedicated generation.
2. **B and S (identity).** The row key is `(transaction_id, participant_id)`
   with `transaction_id` leading (merge sources cannot collide). The revision-3
   `nodeId/bootIncarnation/sequence` id is withdrawn: two engines on one node
   collide (round-3 V5). It is replaced by S.
3. **K (faults), restated.** Under Q no operation's result depends on a value
   that differs per replica or per execution. The premise that "an identical
   deterministic failure" is the only possible failure therefore holds. A
   residual identical COMMIT failure, including a COMMIT-time generation
   mismatch (`commit_base_moved`, nit N5), is settled REFUSED-with-cause on
   every replica, with an alarm. Local logical divergence stays limit L4.
4. **L (mirror).** Transactions are not mirrored in Leg A, the fence is a hint,
   and the replay cursor mirrors APPLIED entries only. Round-3 V12 showed the
   cursor is witnessable now: RC1/RC2 are written. The mirror sender's handling
   of a reserved refusal stays unverified.
5. **O (the witness file).** The file cannot be brought under 1000 lines. Even
   with every helper moved to `test/test-helpers/participant-transaction-fixture.js`,
   the 46 tests take 1240 lines. A second witness file for the seam falsifiers
   was outside the write scope. The duplication ratchet therefore does not scan
   the file (nit N8). It is measured separately in 10.1: 0 clones. The lead may
   move seam S1-S8 to a `test/query/` file, which would bring both under 1000.
6. **P/W (receipts).** The producer was re-anchored by the lead in 84ae1a623.
   It is changed here under the widened scope. All eight ids are kept, the CDC
   receipt stays absent, and every count stays exact.
7. **V (retry owner), deviation.** The brief says "the coordinator retries a
   PREPARE refused for stale base under its existing transaction budget with
   its existing backoff". Re-sending the same PREPARE cannot succeed: the base
   is fixed at BEGIN (3.2), so a stale base stays stale. The unit that can be
   retried is the whole statement-autocommit transaction (rollback, re-BEGIN,
   re-execute). It is owned by the engine's statement-autocommit path, which
   today returns the commit failure without retrying
   (`sql-query-engine-write-execution.js:159-176`). The proposed budget and
   backoff are the existing ones: the transaction budget
   `TIMEOUT_BUDGET_DEFAULT.TRANSACTION_BUDGET_MS` = 60000
   (`src/control-plane/timeout-budget.js:20`), and the exponential participant
   backoff `calculateParticipantRetryDelay`
   (`distributed-transaction-protocol.js:714-718`, 3 retries, 10-250 ms,
   `distributed-transaction-coordinator-constants.js:39-41`). Explicit
   transactions get the typed `conflict` and are retried by the client. Recorded
   as seam item V (query lane).
8. **X (parked writer).** A parked write is pending in the proposal queue in
   state QUEUED, never PROPOSED. Its deadline release therefore answers
   `partition_write_commit_deadline_exceeded` (unproposed,
   `partition-write-kernel.js:79-92`, `:370-387`), not OUTCOME_UNKNOWN. That code
   is already retryable (`:57-66`). Owner: the write commit owner
   `partition-service-raft-write-commit.js`, which gains the reservation waiters.
   Waker: the decision apply's afterCommit effect in the transaction owner.
9. **Q, refined.** Beyond staging refusal, the apply side refuses a committed
   PREPARE that carries a nondeterministic operation (W3c). This defends against
   a faulty or old leader. Being a pure function of the committed bytes, it is
   identical on every replica.
10. **Y.** The real-log replay-cursor witnesses are in the sibling file
    `test/partition/partition-transaction-replay-cursor-v4.test.js`, not in the
    v3 file: they need the restart fixture over a real rs-raft log
    (`partition-rs-raft-restart-fixture.js:98-145`), not the controllable port.

### 0.6 Round-3 nits

- N1: W12d pins `participant_transaction_not_active`.
- N2: W5a adds `sessionSeesLaterCommit` (c' replay sees a later commit; a
  private snapshot database does not).
- N3: section 4 has a session-read column.
- N4: the PREPARE apply check order is pinned (2.3).
- N5: the COMMIT-time recheck is typed `commit_base_moved` (6.2).
- N6: binding is self-certifying; stated as limit L8 (2.4).
- N7: `expectedTests` counts selected tests. The witness names are unique by
  construction; the harness-witness over-count case is the lead's file.
- N8: see 0.5 item 5.
- N9: W1a asserts `prepareIndex` and `prepareTerm`.
- N10: the session-discard hook is a surface to create, at
  `partition-service-raft-lifecycle-wiring.js:70-83` beside
  `releasePendingWrites()` (`:79`).
- N11: the cost of a zero-operation PREPARE is stated (6.2).
- N12: of the 44 red tests (42 here plus RC1 and RC2), 16 fail first at
  UNRECOGNISED: W1b, W2a, W2b, W3a, W3b, W3c, W4, W7a, W7b, W9, W10b, W11f,
  W12a, W12c, W12e and RC2. Per harness fidelity item 1 these bind only against
  a candidate. The other 28 fail on today's mechanisms (LOCAL_STAGING, the
  session holding the connection, NOT_COMMITTED from absence, absorption, the
  coordinator's clock-built id and its FAILED/rollback paths, F-MIR).
- N13: the lead's.

## 1. Consumed surfaces (verified)

Participant transaction owner, current behaviour to replace:

- `beginTransaction` opens `BEGIN IMMEDIATE` on the shared connection:
  `partition-service-transaction-base.js:560-637` (`:611`); one non-terminal
  transaction per partition `:598-603`; removal fence `:591-597`.
- `prepareTransaction` returns `LOCAL_STAGING` without proposing anything:
  `:643-701` (`:679-700`); conflict check on leader memory `:666-678`.
- `commitTransaction` records the outcome and runs `COMMIT` before proposing a
  fire-and-forget marker: `:707-796` (`:732-743`); CDC per op `:746-748`;
  leader-only conflict memory `:749-765`; on failure it erases prepared state
  `:786-793`; missing session throws `:721-723`; PREPARE_LOST `:712-717`.
- `rollbackTransaction` answers success for an unknown session: `:801-884`
  (`:815-824`).
- Marker proposal is fire-and-forget and silent on a non-leader: `:971-990`
  (`:979-981`); markers carry no entryId `:948-956`, `:1003-1010`.
- Outcome: `recordTransactionCommitOutcome` UPSERT with `Date.now()` `:901-911`;
  `resolveTransactionCommitOutcome` answers NOT_COMMITTED from absence `:913-936`
  (`:935`).
- Log-scan reconstruction `reconstructPreparedState` `:104-174`, run on every
  leader activation `partition-service-core-base.js:593-604`; volatile maps
  `:176-186`.
- Hold sweep: `:354-478`; leader heal deferral `:421-441`; bare `ROLLBACK`
  `:442-449`; PREPARED erasure + PREPARE_LOST `:453-464`. The bound is
  `TIMEOUT_BUDGET_DEFAULT.PREPARED_HOLD_TIMEOUT_MS` = 60000
  (`src/control-plane/timeout-budget.js:22`, read at
  `partition-service-core-base.js:192-196`); `transaction-base.js:18` is only
  the reporting string (round-2 B18 corrected).
- Epoch snapshot filter and conflict memory: `checkWriteConflicts` `:242-265`,
  `isSnapshotExpired` `:289-301`, `applySnapshotReadFilter` `:309-339`, used by
  session reads at `partition-service-write-metrics-base.js:76-81`.
- Default-session absorption: `resolveActiveTransactionSessionId`
  `partition-service-transaction-session-methods.js:26-41` (`:37-39`),
  `DEFAULT_TRANSACTION_SESSION_ID = 'default'`
  `partition-service-shared.js:221`.
- Session write staging on the shared connection:
  `partition-service-write-metrics-base.js:193-243` (admission `:216-220`, run
  `:221-223`, staged `changes` stored on the op `:224`, reply `:228-235`).
- Wire entry: `handleTransactionMessage` / `executeTransactionControl`
  `partition-service-entry-apply-base.js:393-457` (epoch only to BEGIN and
  OUTCOME, `:436-453`); removal admission `:311-327`.

Committed-entry application and its owners:

- `applyCommittedEntry` `partition-service-entry-apply-base.js:970-1106`:
  unknown type fails closed `:989-1002`; SQL apply `:1015-1074` (settled replay
  `:1024-1029`, statement `:1031-1039`, outcome row `:1040-1046`, proposer
  answer and leader CDC in afterCommit `:1050-1073`); `TRANSACTION_COMMIT`
  records the outcome without running operations `:1075-1092`.
- Admission owner `admitCommittedCommand`
  `partition-committed-command-admission.js:125-138` (marker origin rule
  `:89-101`, origins `:40-43`).
- Committed-statement outcome owner: read `partition-committed-statement-outcome.js:92-109`,
  record `:119-127`, deterministic classifier `:180-187`, settled answer
  `:220-251` (a non-APPLIED row answers `success:false, committed:true` without
  `deferRetry`, `:243-250`), settled replay `:262-282`, failed statement
  `:295-324`. Table and bound: `partition-committed-statement-outcome-constants.js:6-43`
  (rows grow one per statement until the log-bound owner compacts them,
  `:16-19`); deterministic codes `:87-93`.
- Entry key `entry:${entryId}`: `partition-service-cdc-stream-base.js:419-436`.
- Command type lists: `partition-service-constants.js:173-191`; outcomes
  `:202-209`; error codes `:213-223`; `_transaction_outcomes` DDL and UPSERT
  `:89-108`; `LOCAL_STAGING` `:63-65`.

Application transaction (the real owner of applied-index atomicity):

- `applyCommittedEntryTransaction` `src/raft/raft-rs-application-transaction-owner.js:51-98`:
  `store.transaction` `:60`, application callback `:61-68`, `putAppliedState`
  `:77-78`, admission index `:81-83`, rollback effects then rethrow `:85-94`,
  afterCommit effects only after commit `:95-97`. Called from the runtime's
  `applyEntryDurablyOrFailure` `src/raft/raft-rs-runtime-owner.js:920-941`,
  whose failure is the group's `groupHostFailure(APPLICATION)`.
  (`test/raft/raft-rs-backend/durable-ready-loop.test.js:259`, cited in
  revision 2, proves only configuration + applied index; corrected, B18.)
- Store: `transaction()` refuses a foreign open transaction
  `src/raft/raft-rs-durable-store.js:385-395`, `persistenceAdmission`
  `:358-362`; applied-state UPSERT `:483-497`.
- Port adapter decodes once: `src/raft/raft-rs-operation-port.js:90-97`;
  codec is `JSON.stringify`/`JSON.parse` with no canonicalization
  `src/raft/raft-rs-proposal-codec.js:33-60`.
- `buildPartitionWriteEntry` spreads the caller's operation first, so key order
  follows each caller (`src/partition/partition-write-kernel.js:215-231`;
  revision 2's "fixed key order" corrected, B18). Revision 3 never digests a
  re-encoded object: it digests carried strings (section 2.3).

Write path, await and release:

- `applyWrite` `partition-service-write-metrics-base.js:657-728`: pending
  outcome `:672-676`, admission `:680-689`, settled answer `:693-701`
  (`answerSettledWrite` `:635-649`), leadership `:703-720`, commit `:723-727`.
- `startPartitionRaftWriteCommit` / `executePartitionRaftWriteCommit`
  `src/partition/partition-service-raft-write-commit.js:133-252`:
  `waitForCommittedWrite` registered before propose `:146`, deferral budget
  `:89-105` (`USER_TRANSACTION_WRITE_DEFER_BUDGET_MS`
  `partition-service-constants.js:56`), failed result returned `:192-202`,
  side-effect plan `:203-220`.
- `waitForCommittedWrite` `partition-service-cdc-stream-base.js:313-347` with
  `PENDING_REQUEST_TIMEOUT_MS` = 30 s (`partition-service-constants.js:26`),
  deadline release `:329-337`; pending outcomes `:357-376`; resolve/reject
  `:377-401`; release-all `:405-407`, wired to leadership loss
  `partition-service-raft-lifecycle-wiring.js:34-40`.
- Proposal queue refuses a duplicate pending entryId
  `src/partition/proposal-queue.js:96-99`.
- Typed answers: refusal codes `partition-write-kernel.js:34-44`, retryable list
  `:57-66`, release causes and unproposed answers `:71-92`, leadership refusal
  `:338-362`, released answer (OUTCOME_UNKNOWN only if proposed) `:370-387`,
  side-effect plan `:469-500`.

Determinism of ordinary writes (the class transactions inherit):

- The entry carries the client's SQL and params; each replica executes them at
  apply (`partition-service-entry-apply-base.js:1032`); the proposer's own
  apply answers `changes`/`lastInsertRowid` (`:1050-1056`), retained for replay
  (`partition-committed-statement-outcome.js:119-127`, `:136-145`).
- `NOW()`/`CURRENT_TIMESTAMP` become SQLite `datetime('now')`
  (`src/query/pg/pg-function-registry.js:88-94`, `:174-175`): evaluated per
  replica at apply. Nothing pins nondeterministic SQL values today (R17
  finding F-DET, section 9.3).

Mirror, checkpoint, CDC (section 8): side-effect chain
`partition-service-raft-write-commit.js:203-220` ->
`partition-service-write-metrics-base.js:729-769` (`:751-762`) ->
`partition-service-split-mirror-queue-methods.js:44-67` /
`partition-service-merge-replication-methods.js:461-500`; mirror delivery
throws on any failure `partition-split-routing.js:200-246` (`:241-245`); durable
replay cursor `partition-mirror-replay-cursor.js:89-128`; mirror source lookup
`:143-163`. Checkpoint: `src/raft/snapshot-checkpoint-store.js:208-227`
(legacy gate), `:295-309` (rs-raft copy), `:311-332` (legacy copy refuses
rs-raft), `:339-357` (rs-raft scrub keeps only `raft_rs_peer_identity`),
`:397-416`; partition cadence `src/partition/partition-snapshot-cadence.js:8-18`,
`:55-71`; catch-up creation without a group id `src/raft/snapshot-catchup.js:210-215`.
CDC: `generateCDCEvent` `partition-service-cdc-stream-base.js:129-138`;
in-process sequence `src/partition/partition-cdc-delivery.js:215-219`; volatile
buffer `src/partition/cdc-event-buffer.js:1-10`.

Coordinator (query lane, consumed only):

- Identity: `createTransactionId` = `tx-${sessionId}-${now()}-${seq}`
  `src/query/distributed/distributed-transaction-records.js:79-82`;
  `createParticipantId` `:101-103`; sequence and clock-seeded epoch
  `distributed-transaction-coordinator.js:115-124`; `begin` `:204-273`
  (`:237`, `:261`); participant BEGIN `:331`.
- Durable owner: `DurableWorkflowCoordinator.registerWorkflow`
  `src/workflow/durable-workflow-coordinator.js:61-65`; status row UPSERT
  `src/query/sql-query-engine.js:114-147` (silently skipped without a gateway,
  `:115-117`); `sql_transactions` schema
  `src/bootstrap/system-table-workflow-schema-definitions.js:14-33`; gateway
  mutation kinds `src/control-plane/control-plane-system-table-gateway-constants.js:153-158`.
- Protocol: `abortTimedOutTransaction` `distributed-transaction-protocol.js:258-275`
  and its call sites `:296`, `:313`, `:324`, `:344`, `:351`, `:366`, `:392`;
  `runCommitProtocol` `:289-424`; `resolveParticipantCommitMiss` `:669-689`
  (2PC NO_TRANSACTION -> COMMITTED `:673-675`).
- Recovery: `resumeRecoveredTransactions` `distributed-transaction-recovery.js:269-363`
  (`:310-320`); `runRecoverySweep` `:365-512` (`:404-431`); status sets
  `distributed-transaction-coordinator-constants.js:27-36`; sweep interval 1000
  ms `:46`; transaction budget 60000 ms `src/control-plane/timeout-budget.js:20`;
  every engine loads every row `sql-query-engine-transaction-recovery-methods.js:151-159`;
  started by `sql-query-engine-lifecycle-and-callback-dispatch.js:185-197`.
- Engine wire: participant callbacks `sql-query-engine-instance-initializer.js:190-244`;
  `deliverTransactionOperation` `sql-query-engine.js:569-627`; delivery
  identity `{sessionId, partitionId, operation}` `:66-96`; session id onto
  QUERY requests `src/query/query-executor-partition-request-builders.js:80`;
  1PC selection `distributed-transaction-commit-mode.js:29-40`.

Added for revision 4 (verified at 0643090d7):

- Statement ownership: one-partition statements are DIRECT_AUTOCOMMIT and never
  reach the coordinator; multi-partition statements are STATEMENT_AUTOCOMMIT
  transactions (`src/query/sql-query-engine-write-execution.js:83-90`, BEGIN at
  `:110-147`); the autocommit finish returns a failed COMMIT without retrying
  (`:159-176`).
- Client in-doubt answer: a failed COMMIT whose `commitPointReached` is not false
  becomes `TRANSACTION_OUTCOME_UNKNOWN` (`src/query/application-database.js:123-149`);
  the coordinator stamps it (`distributed-transaction-commit-point.js:51-65`,
  `distributed-transaction-coordinator.js:505-510`).
- FAILED after COMMITTING: set at `distributed-transaction-protocol.js:396-398`;
  `runCommitProtocol` re-enters FAILED at PREPARING (`:299-310`); recovery skips
  FAILED when resuming (`distributed-transaction-recovery.js:297-306`) and when
  sweeping (`:404-410`).
- Answers on committed entries: an environmental statement failure rejects the
  pending write in afterRollback (`partition-committed-statement-outcome.js:297-300`);
  `unansweredWriteResult` answers a rejection as a failure
  (`partition-service-raft-write-commit.js:122-131`); a host failure while
  proposing is `CONSENSUS_HOST_FAILURE` (`partition-write-kernel.js:390-397`).
- Release of one pending write at its deadline: `proposal-queue.js:202-222`.
- Leadership-loss wiring: `partition-service-raft-lifecycle-wiring.js:70-83`
  (`releasePendingWrites()` at `:79`); no session hook exists yet.
- Real-log replay-cursor fixture: `test/partition/partition-rs-raft-restart-fixture.js:98-145`,
  used by `test/partition/durable-replay-cursor.test.js:252-300`.

Surfaces this design must create (no citation exists):

- the two committed command types;
- `_participant_transactions`;
- the write generation table `_partition_write_generation`;
- the determinism classifier, owned by a new
  `src/partition/partition-transaction-determinism.js`;
- the reservation waiters of the write commit owner;
- the session-discard hook on demotion;
- the `partition_write_reserved` refusal;
- the participant answer fields;
- the coordinator's insert-once transaction row and decision record;
- the engine's statement-autocommit retry.

## 2. Protocol and identity

### 2.1 Identity (decisions B and S)

- `transactionId` is a 128-bit random identifier: 32 lowercase hex characters
  from `crypto.randomBytes(16)`, minted by the coordinator's
  `createTransactionId`. The function replaces `tx-${sessionId}-${now()}-${seq}`
  (`distributed-transaction-records.js:79-82`).
- Uniqueness comes from an **insert-once** write of the `sql_transactions` row
  (primary key `transaction_id`, `system-table-workflow-schema-definitions.js:17`),
  made by `registerWorkflow` inside `begin` (`distributed-transaction-coordinator.js:261`)
  before any participant BEGIN (`:331`). It uses the gateway's INSERT kind
  (`control-plane-system-table-gateway-constants.js:153-158`), never the status
  UPSERT (`sql-query-engine.js:119-134`). Behaviour on the insert:
  - a primary-key collision is the typed `TRANSACTION_ID_COLLISION`, and the
    coordinator mints again (bounded at 3 attempts, then a typed BEGIN failure);
  - an insert whose outcome is unknown is resolved by reading the row, never
    assumed;
  - a coordinator without a usable gateway refuses BEGIN, typed
    (`TRANSACTION_STATE_PERSISTENCE_UNAVAILABLE`), instead of the silent return
    at `sql-query-engine.js:115-117`.

  Every later write of the row is an UPDATE of an existing row.
- No component is taken from the node id, boot incarnation, sequence, session
  or clock. The revision-3 premises (node-id uniqueness, per-data-directory
  incarnation) are withdrawn. Two coordinators on one node and incarnation
  cannot share an id (W10a). A collision of 128 random bits is refused by the
  primary key, not assumed impossible (W10c).
- `participantId = ${transactionId}:${partitionId}`
  (`distributed-transaction-records.js:101-103`). The participant refuses any
  request or command whose `participantId` is not exactly that with its own
  `partitionId` (`participant_transaction_identity_mismatch`). It also refuses
  any request missing one of `transactionId`, `participantId`, `commitMode` or
  `transactionEpoch` (`participant_transaction_identity_required`).
- `commitMode` is `NOT_SELECTED` on BEGIN and session writes
  (`distributed-transaction-commit-mode.js:29-40`). It carries the selected mode
  on PREPARE, decision and outcome requests. A decision whose mode differs from
  the PREPARED row's is an identity mismatch.
- `transactionEpoch` is carried and pinned per `transactionId`. It has no
  isolation meaning.
- `sessionId` is routing context only. The delivery identity becomes
  `{transactionId, partitionId, operation}` (replacing `sessionId` at
  `sql-query-engine.js:66-96`; seam A, falsifier S5).

Identity anchoring when it moves: a leader change discards volatile sessions
(section 7). The durable row is keyed by the identity, so a COMMIT reaching a
new leader finds the same row. A coordinator restart re-reads its rows, and the
ids it mints afterwards are fresh random values checked by the same insert.

### 2.2 Requests (the participant's wire)

`TRANSACTION` messages (`PARTITION_SERVICE_MESSAGE_TYPE.TRANSACTION`) carry an
`operation` in `{BEGIN_TRANSACTION, PREPARE_TRANSACTION, COMMIT, ROLLBACK,
TRANSACTION_OUTCOME}` and the identity fields. Session reads and writes are
`QUERY` messages carrying the same identity. COMMIT and bound ROLLBACK add
`{decision, preparedDigest, decisionText, decisionDigest}`; an unbound ROLLBACK
omits them.

Every answer carries `{success, operation, partitionId, transactionId,
participantId, state, outcome}`. Where relevant it also carries `failureCode`,
`deferRetry`, `preparedDigest`, `prepareIndex`, `prepareTerm`,
`decisionIndex`, `decisionTerm`, `refusalCause`, `results` and `provisional`.

### 2.3 Committed commands (pinned bytes)

Two new committed command types replace the three legacy markers in
`PARTITION_COMMITTED_MARKER_COMMAND_TYPES` (`partition-service-constants.js:182-186`).

- **`PARTICIPANT_PREPARE`**: `{type, entryId, sessionId, transactionId,
  participantId, commitMode, transactionEpoch, operationsText, validationText,
  preparedDigest, timestamp, proposedBy, proposedAt}`.
  - `operationsText` is the leader's `JSON.stringify` of the staged operations
    `[{entryId, sql, params}]`, each exactly the client's statement and params.
  - `validationText` is `JSON.stringify([["partition", partitionId,
    sha256("generation:" + g)]])`, where `g` is the BEGIN-time write generation
    of section 3.2.
  - `preparedDigest` is `sha256(operationsText + "\n" + validationText)`.
- **`PARTICIPANT_DECISION`**: `{type, entryId, sessionId, transactionId,
  participantId, commitMode, transactionEpoch, decision, preparedDigest,
  decisionText, decisionDigest, timestamp, proposedBy, proposedAt}`.
  - `decisionText` is `JSON.stringify({transactionId, decision, participants:
    [[participantId, preparedDigest|null], ...sorted]})`.
  - `decisionDigest` is `sha256(decisionText)`.
  - It carries no operations.
- **Deterministic entryIds**: `${participantId}:prepare` and
  `${participantId}:decision:${decisionDigest}`. A retry joins the pending
  outcome (`partition-service-write-metrics-base.js:672-676`).
- **Per-operation outcome keys**: `txop:${participantId}:${ordinal}`, never
  `entry:${entryId}` (W12e).
- **Legacy marker types are removed.** A legacy `TRANSACTION_COMMIT`,
  `PREPARE_TRANSACTION` or `ROLLBACK` marker reaching apply fails closed as
  UNRECOGNISED (`partition-service-entry-apply-base.js:989-1002`). The upgrade
  precondition is in 11.3.

**PREPARE apply check order** (pinned, nit N4; first match wins, every step a
deterministic function of the committed prefix and the command bytes):

1. Identity: an exact `participantId` and the digest integrity
   `sha256(operationsText + "\n" + validationText) === preparedDigest`. A
   mismatch is typed with no row written (`identity_mismatch`), or a REFUSED row
   with cause `digest_invalid`.
2. Existing row for this identity: the same digest is an idempotent PREPARED
   answer; any other row state is `terminal`; a different digest is
   `prepare_content_conflict`. No write in any case.
3. Reservation: if another row is PREPARED, the disposition is
   `reserved_refused`. It is non-settling: no write, deferRetry.
4. Determinism classifier (section 3.3): a REFUSED row, cause `nondeterministic`.
5. Generation: if the current `g` digest differs from `validationText`, a
   REFUSED row, cause `conflict`.
6. Dry run of the operations in a nested `db.transaction` that throws a
   sentinel:
   - a deterministic failure writes a REFUSED row, cause `statement_failed`;
   - an environmental failure is the host failure (nothing recorded).
7. INSERT the PREPARED row and increment `g`.

Under "reserved and conflicted", the answer is therefore `reserved_refused`.

### 2.4 Decision binding (decision C)

A decision applies only if all of these hold:

- `sha256(decisionText) === decisionDigest`;
- `decisionText` names this `transactionId`, the same `decision`, and an entry
  for this `participantId`;
- for COMMIT, that entry's digest and the command's `preparedDigest` both equal
  the PREPARED row's `prepared_digest`.

Otherwise it is refused `participant_transaction_decision_digest_mismatch`, and
nothing is written. For ROLLBACK the entry's digest may be null; if it is
present, it must match.

An **unbound ROLLBACK** (no `decisionDigest`) is a request-level action only:

- it discards a volatile ACTIVE session;
- it is refused against PREPARED (`participant_transaction_decision_binding_required`).

**Limit L8 (nit N6).** The binding is self-certifying. Any caller can build a
`decisionText` and its digest, so the participant cannot tell a persisted
decision from a fabricated one. Safety against an unauthorized terminal rests
on seam C: only the coordinator sends decisions, and only after the
insert-once decision record. The binding protects against mixing decisions and
prepared contents, not against a forging coordinator.

## 3. Isolation and the conflict rule

### 3.1 Staging under F6 c' (no SQLite transaction across requests)

- **BEGIN** creates a volatile session `{identity, sessionId, operations[],
  generationBase, bytes, startedAt, phase}` on the leader. It reads `g` at
  BEGIN (3.2). No SQLite transaction is opened (W5a).
- **A session write** goes through three steps:
  1. Admission: `admitCommittedCommand`, WRITE_PATH.
  2. The parameter check (below) and the determinism classifier (3.3). A
     refusal leaves nothing staged.
  3. Synchronous validation in ONE `db.transaction(fn)()`. `fn` replays the
     staged operations decoded from their JSON text, runs the new statement,
     captures `{changes, lastInsertRowid}` and throws a private sentinel.
     better-sqlite3 rolls the transaction back on any throw
     (`node_modules/better-sqlite3/lib/methods/transaction.js:52-77`).

  The reply is `{success, provisional: true, changes, lastInsertRowid}`. A
  deterministic failure of the new statement is `statement_failed` (not
  staged). A failed replay of an earlier operation is `replay_diverged`, which
  dooms the session.
- **A session read** uses the same synchronous replay, a bounded read, and a
  sentinel rollback. It sees current committed state plus the session's own
  operations (W5a `sessionSeesLaterCommit`). A private snapshot database would
  not.
- **Parameter narrowing (named contract change, V11).** Staged params must
  survive the proposal codec's JSON round trip unchanged
  (`raft-rs-proposal-codec.js:33-60`): string, finite number, or null. A
  Buffer/BLOB, BigInt, Date, boolean, undefined or object param is refused
  `participant_transaction_session_write_param_unsupported` (W6n). Today a
  session write binds such values directly on the connection
  (`partition-service-write-metrics-base.js:221-223`). Ordinary replicated
  writes already lose them at the codec: a Buffer becomes an object at apply,
  and a BigInt fails to encode. The narrowing therefore aligns transactions
  with the replicated class.
- **Bounds**: 256 operations, 1 MiB of encoded bytes, and 50 ms of replay work
  checked after each statement (proposed new constants). Exceeding any is
  `replay_budget_exceeded`.
- **Observer scope** is unchanged from revision 3:
  - no other reader sees staging;
  - `persistenceAdmission` (`raft-rs-durable-store.js:358-362`) never defers
    consensus because of a session;
  - default-session absorption is deleted (W5b);
  - Leg A admits one non-terminal transaction per partition.

### 3.2 First-committer-wins from a dedicated write generation (decisions D and R)

- **The write generation `g`** is one row of the sibling table
  `_partition_write_generation (singleton INTEGER PRIMARY KEY CHECK (singleton =
  1), generation INTEGER NOT NULL)`, created with `(1, 0)` at partition
  initialization, identically on every replica.
- **Why a sibling table and not a reserved row in `_participant_transactions`.**
  The participant table's rows have a per-transaction lifecycle, a state domain
  `{PREPARED, COMMITTED, ROLLED_BACK, REFUSED}`, a reservation query (`state =
  'PREPARED'`) and a retention rule. A sentinel row would need a fake identity
  and a fifth state that every reader would have to exclude. A one-row table
  has a single writer and a single meaning.
- **When `g` increments.** It is incremented by exactly 1, inside the
  application transaction, by:
  - every committed SQL command whose statement is APPLIED (ordinary writes,
    mirror applies, migrations);
  - every PREPARE apply that writes a row (PREPARED or REFUSED);
  - every decision apply that writes a row (once per decision, not per
    operation).

  It never moves for these: a `reserved_refused` disposition, a
  STATEMENT_FAILED write, a settled replay, a marker, a refused decision, or the
  bootstrap-only `executeLocalQuery` (`partition-service-write-metrics-base.js:133-185`).
- **No compaction.** No owner ever deletes or lowers `g`. It is part of the
  partition's application state, so any partition image (SN1) carries it
  (8.2). Compaction of `_partition_statement_outcomes`
  (`partition-committed-statement-outcome-constants.js:16-19`) cannot move it,
  so ABA is impossible (W13 deletes every outcome row and still expects
  `conflict`).
- **The base is read at BEGIN** and carried unchanged. A lagging leader reads
  an older value, which only refuses conservatively.
  - W14: a base read at PREPARE fails it.
  - W15: the proposed `validationText` is the BEGIN-time digest.
- **PREPARE request (leader, advisory).** If `g` has moved since BEGIN, the
  answer is `{success:false, failureCode: participant_transaction_prepare_refused,
  refusalCause: conflict}` and nothing is proposed. The session is doomed.
- **PREPARE apply (authority).** The check order is in 2.3. The reservation
  then blocks every other applying write until the decision, so `g` cannot
  move between PREPARE apply and COMMIT apply on a consistent replica.
- **COMMIT apply** re-checks `g`. It must equal the PREPARED row's base plus
  1 (the PREPARE's own increment). A mismatch is impossible on consistent
  replicas. Under K it is settled REFUSED with cause `commit_base_moved`
  identically, with an alarm (nit N5).

Consequence: a transaction commits only if its partition applied no other
write between its BEGIN and its PREPARE. Every read it made saw one committed
prefix, so each partition is optimistically serializable. Aborts are
partition-granular (limit L5, 3.6).

### 3.3 Determinism: fail closed (decisions I and Q)

- **Classifier.** A pure function of the SQL text, owned by the new
  `src/partition/partition-transaction-determinism.js`. Token rules,
  case-insensitive, outside string literals except where stated:
  - `random(` and `randomblob(`;
  - `changes(`, `last_insert_rowid(` and `total_changes(`;
  - `current_timestamp`, `current_date` and `current_time`;
  - any call whose arguments contain the literal `'now'`: `datetime`, `date`,
    `time`, `julianday`, `strftime` and `unixepoch` (`NOW()` and
    `CURRENT_TIMESTAMP` arrive translated as `datetime('now')`,
    `pg-function-registry.js:88-94`, `:174-175`);
  - an INSERT whose column list omits the partition schema's primary-key
    column, or that has no column list (implicit key or rowid).

  False positives are typed refusals; a false negative is a defect of the
  classifier owner.
- **At staging**, a match is refused `participant_transaction_session_write_nondeterministic`
  and nothing is staged (W6n). The PREPARE seals only the deterministic
  operations.
- **At PREPARE apply** (step 4 of 2.3), a match is REFUSED with cause
  `nondeterministic` on every replica. The input is the committed bytes, so the
  disposition is identical (W3c). This defends against a faulty or old leader.
- **Consequence.** With params restricted to JSON scalars (3.1) and no
  per-execution values, every operation is a deterministic function of the
  committed state. The PREPARE dry run and the COMMIT execution compute
  identical results on every replica. Combined with the frozen state (the
  reservation and `g`), that makes K's premise true (6.2).
- **Results**: staged replies are `provisional: true`; the COMMIT answer
  carries `results: [{ordinal, changes, lastInsertRowid}]` from the committed
  apply (W6).
- **Limit L7.** Transactions cannot use clock or random functions, implicit
  keys or BLOB params. Applications must supply such values as params.
- **Finding F-DET** (R17, not fixed here). Ordinary replicated writes still
  evaluate `datetime('now')`/`random()` per replica, so their stored values may
  differ between replicas. Their control state does not diverge, because
  ordinary writes do not create reservations or terminal states.

### 3.4 Explicit supersession of epoch snapshot isolation

The promise "epoch-based snapshot isolation (committed-before-epoch visibility
+ read-your-own-writes) and first-committer-wins write-conflict detection at
prepare" is superseded by: **reads in a session see committed state plus the
session's own staged operations (c' replay); a transaction commits only if no
committed write was applied to its partition between its BEGIN and its PREPARE
apply (partition-granular first-committer-wins, validated from committed state
on every replica).** Documents to change in the cutover change set:

- `architecture/process-replication.md:348-354` (also the claim that PREPARE is
  a durable `PREPARE_TRANSACTION` entry);
- `architecture/runtime-components.md:226-235` (also "reconstructs prepared
  state from Raft log entries" and "PREPARE_LOST after autonomous timeout
  release");
- `architecture/postgres-wire.md:284-286`;
- `architecture/postgres-locking-reads.md:7-8`;
- `architecture/INDEX.md:96-98`;
- `docs/development/product-roadmap.md:88-89`;
- `docs/development/agpl-feature-map.md:127-131`.

Tests: Property 1, 10 and 11 of `partition-transaction.property.test.js`
(section 9). Code deleted with the promise (R11): `checkWriteConflicts`,
`getOldestRetainedCommitEpoch`, `isSnapshotExpired`, `applySnapshotReadFilter`,
`pruneCommittedWriteLog`, `trackTransactionWriteSetKey`,
`resolveTransactionWriteSetKey`, `rowCommitEpoch`, `committedWriteLog`
(`transaction-base.js:195-348`, `core-base.js:185-191`).

### 3.5 Cached-view audit

| View | Invalidated by | Stale at the read site | Why staleness cannot unsafely decide |
| --- | --- | --- | --- |
| Volatile session (ACTIVE/PREPARING) | leader loss, restart, sweep, terminal decision | a request finds no session: `not_active` | no durable decision is read from it; outcome reads use rows only |
| `generationBase` (the BEGIN-time value of `_partition_write_generation`) | none (fixed at BEGIN) | older than committed state | only causes a refusal; authority is recomputed at apply |
| Leader prechecks (reservation, terminal row, digest) | the next apply | may park a write the apply would admit (released at the decision or its own deadline), or propose a decision the apply refuses | prechecks only refuse or answer from immutable terminal rows; apply decides |
| Reservation waiters (parked writers, volatile, leader only) | the decision apply's afterCommit re-admission; the writer's own deadline; leadership loss (`releasePendingCommittedWrites`) | a parked writer whose wake was missed waits at most to its own 30 s deadline | it holds no durable state; it is answered typed and retryable (unproposed), never applied twice: its entryId is unsettled |
| Pending outcome map | settle of the outcome promise `cdc-stream-base.js:369-374` | none | joins retries of one entryId only |

### 3.6 Contention: population, retry owner, budget (decision V; an R12 exposure)

- **Population affected.**
  - Every explicit transaction.
  - Every multi-partition statement without an explicit transaction: it runs as
    a STATEMENT_AUTOCOMMIT distributed transaction
    (`sql-query-engine-write-execution.js:83-90`, BEGIN at `:129`).
  - Internal coordinator users, such as migrations driven through the seed
    engine's coordinator.
- **Population not affected.** Single-partition statements without an explicit
  transaction are DIRECT_AUTOCOMMIT: they never reach the coordinator and are
  ordinary replicated writes (`:83-90`, `:120-121`). Verified on this head.
- **Regression.** Today a session's `BEGIN IMMEDIATE` makes concurrent writers
  wait (deferral up to `USER_TRANSACTION_WRITE_DEFER_BUDGET_MS`). Under Leg A,
  concurrent writers proceed, and any committed write to a participant
  partition between BEGIN and PREPARE refuses the transaction (`conflict`). A
  sustained stream of single-partition writes can starve a multi-partition
  statement.
- **Retry owner and budget (deviation 0.5 item 7).** The unit retried is the
  whole statement-autocommit transaction:
  1. roll back;
  2. BEGIN again (a new transactionId and base);
  3. re-execute;
  4. COMMIT.

  The owner is the engine's statement-autocommit path
  (`finishWriteTransaction`, `sql-query-engine-write-execution.js:159-176`). It
  works under the transaction budget (60 s, `timeout-budget.js:20`) with the
  coordinator's exponential participant backoff (`distributed-transaction-protocol.js:714-718`,
  `distributed-transaction-coordinator-constants.js:39-41`). Explicit
  transactions are not retried by the system: the client receives the typed
  conflict through the facade. Starvation is bounded by the budget and then
  becomes a typed failure, never a hang.
- **Measurement, not promise.** W16 drives four transactions, each with a
  concurrent committed writer. It asserts only that every PREPARE answer is
  typed (PREPARED, or refused `conflict`), and reports the measured abort rate
  as a test diagnostic. Under the design the rate with a writer in every round
  is 4/4; on this head the answers are untyped.
- **Owner decision.** Accepting this exposure for Leg A is an explicit owner
  decision (R12: load may degrade throughput but not correctness; here it
  turns waiting into typed aborts). It is recorded as limit L5, with W16 as its
  falsifier.
- **Refinement for Leg B.** Hybrid bases: per-row base digests for statements
  whose write set is provably a single primary key (the structured
  insert/update/delete builders, `partition-service-write-metrics-base.js:250-332`).
  The partition generation stays the base for everything else.

## 4. State x command transition table (decision G)

Legend:

- `W` = writes durable state in the application transaction (and increments
  `g`); `-` = writes nothing.
- "req" is the leader's request handling, before any proposal; "apply" is the
  committed command's application on every replica.
- Codes are `participant_transaction_*` unless prefixed `partition_write_*`.
- "Reserved" means some PREPARED row exists on the partition.
- Missing identity fields, or a mismatching `participantId`/epoch, answer
  `identity_required` / `identity_mismatch` in every cell (-).
- Any request whose committed command may still commit answers `{success:false,
  outcome: UNKNOWN}` when it is released (deadline, leader loss, own apply's
  environmental failure, host failure while proposing; section 7).

| State | BEGIN | session write | session read | PREPARE | COMMIT (bound) | ROLLBACK (bound) | ROLLBACK (unbound) |
| --- | --- | --- | --- | --- | --- | --- | --- |
| ABSENT | req: fences (removal, topology, `already_active` if another non-terminal) -> ACTIVE; `g` read as base (-) | `not_active` (-) | `not_active` (-) | req: `not_leader` on a non-leader; else `not_active`, outcome UNKNOWN (-). apply: steps 1-7 of 2.3 -> PREPARED (W) or REFUSED+cause (W) or `reserved_refused` (-) | req: propose. apply: `not_prepared` (-), alarm | req: propose. apply: TOMBSTONE (W) | `success`, `durable: false` (-) |
| ACTIVE (volatile) | same identity: idempotent; other: `already_active` (-) | classifier/param refusal (`session_write_nondeterministic`, `session_write_param_unsupported`); else c' validate: STAGED provisional / `statement_failed` / `replay_diverged` (doomed) / `replay_budget_exceeded` (-) | replay + read: committed state plus own operations (-) | req: `g` moved since BEGIN -> refused `conflict`, nothing proposed (-); else seal -> PREPARING, propose | `not_prepared` (-) | discard; propose; apply TOMBSTONE (W) | discard, `durable: false` (-) |
| PREPARING (volatile, proposer only) | same: PREPARING; other: `already_active` (-) | `preparing` (-) | replay + read of the sealed operations (-) | join the pending outcome (-) | `preparing`, deferRetry (-) | propose; apply after the PREPARE: ROLLED_BACK (W); before it: TOMBSTONE (W) | `preparing`, deferRetry (-) |
| PREPARED | same: `sealed`; other: `already_active` (-) | `sealed` (-) | `sealed`: reads go sessionless (-) | req: PREPARED + digest from the row (-). apply duplicate: idempotent or `prepare_content_conflict` (-) | req: digest/text check else `decision_digest_mismatch` (-); propose. apply: recheck binding and `g` (base + 1, else REFUSED `commit_base_moved` (W)); run operations, per-op outcomes, `UPDATE ... SET state='COMMITTED' WHERE state='PREPARED'`, `g` + 1, applied index, one transaction (W); environmental -> host failure (-) | apply: `UPDATE ... SET state='ROLLED_BACK' WHERE state='PREPARED'` (W); a present, different digest: `decision_digest_mismatch` (-) | `decision_binding_required` (-) |
| COMMITTED | `terminal` (-) | `terminal` (-) | `terminal` (-) | `terminal` (-) | same digest: replayed, answered from per-op rows (-); other: `decision_conflict` (-) | `decision_conflict` (-) | `decision_conflict` (-) |
| ROLLED_BACK | `terminal` (-) | `terminal` (-) | `terminal` (-) | `terminal` (-) | `decision_conflict` (-) | same digest replayed; other `decision_conflict` (-) | `success`, durable not committed (-) |
| REFUSED | `terminal` (-) | `terminal` (-) | `terminal` (-) | `terminal` (-) | `not_prepared` (-), alarm | answered NOT_COMMITTED, REFUSED stays (-) | `success`, durable not committed (-) |
| TOMBSTONE | `terminal` (-) | `terminal` (-) | `terminal` (-) | apply: `terminal`, late PREPARE refused, no reservation (-) | `decision_conflict` (-) | replayed / `decision_conflict` (-) | `success` (-) |

| State | outcome read | hold sweep | restart | leader loss | ordinary write while reserved | mirror apply while reserved |
| --- | --- | --- | --- | --- | --- | --- |
| ABSENT | UNKNOWN, ABSENT (-) | n/a | n/a | n/a | not reserved: applies (W) | applies (W) |
| ACTIVE | UNKNOWN, ACTIVE (-) | past `PREPARED_HOLD_TIMEOUT_MS`: discarded on any role, no SQL; later requests `not_active` (-) | lost -> ABSENT | discarded by the demotion hook -> ABSENT | not reserved: applies (the transaction will refuse `conflict`) | applies |
| PREPARING | UNKNOWN (-) | not swept (the pending write owns its 30 s deadline) | lost; the proposal may still commit | released: UNKNOWN if proposed, `not_leader` if not | not reserved until the PREPARE applies | same |
| PREPARED | UNKNOWN, PREPARED, digest, prepare index/term (-) | reported only (`held_reported`), never terminalized (-) | row survives with its reservation | row unaffected | req: **parked** unproposed in the proposal queue under its own `PENDING_REQUEST_TIMEOUT_MS` deadline; re-admitted by the decision apply's post-commit effect; deadline -> `partition_write_commit_deadline_exceeded` (unproposed, retryable) (-). apply (a write proposed elsewhere, or raced): `reserved_refused`: no statement, no outcome row, `g` unchanged, applied index advances; the proposer (if it is this leader) re-parks it, and any other proposer is answered `partition_write_reserved`, retryable (-) | same as ordinary write; the mirror sender throws on a refusal (`partition-split-routing.js:241-245`, L1, unverified) |
| COMMITTED | COMMITTED (-) | n/a | survives | n/a | applies | applies |
| ROLLED_BACK | NOT_COMMITTED (-) | n/a | survives | n/a | applies | applies |
| REFUSED | NOT_COMMITTED + `refusalCause` (-) | n/a | survives | n/a | applies | applies |
| TOMBSTONE | NOT_COMMITTED (-) | n/a | survives | n/a | applies | applies |

Another transaction's PREPARE while the partition is reserved is
`reserved_refused` at apply and `reserved` with deferRetry at request (the
coordinator's participant retry owns it), so contention never forces an abort.

## 5. Durable row and outcome vocabulary (decision F)

### 5.1 One transaction table, one generation row

`_participant_transactions` REPLACES `_transaction_outcomes`
(`partition-service-constants.js:89-108`). It is a new table because SQLite
cannot change a primary key in place, and the old key `(session_id,
transaction_epoch)` is non-unique. The old table and its UPSERT are dropped in
the cutover, after the drain (11.3).

```
_participant_transactions (
  transaction_id TEXT NOT NULL, participant_id TEXT NOT NULL,
  session_id TEXT, commit_mode TEXT NOT NULL, transaction_epoch INTEGER NOT NULL,
  state TEXT NOT NULL,               -- PREPARED | COMMITTED | ROLLED_BACK | REFUSED
  operations_text TEXT, validation_text TEXT, prepared_digest TEXT,
  prepare_entry_id TEXT, prepare_index INTEGER, prepare_term INTEGER,
  decision TEXT, decision_digest TEXT, decision_entry_id TEXT,
  decision_index INTEGER, decision_term INTEGER,
  refusal_cause TEXT, refusal_detail TEXT,
  PRIMARY KEY (transaction_id, participant_id)
)  + INDEX ON (state)

_partition_write_generation (
  singleton INTEGER PRIMARY KEY CHECK (singleton = 1),
  generation INTEGER NOT NULL
)                                     -- (1, 0) at initialization; never deleted
```

Writes happen only inside the application transaction:

- `INSERT` of a PREPARED, REFUSED or TOMBSTONE row;
- `UPDATE ... WHERE ... AND state = 'PREPARED'`, whose `changes` must be 1 (an
  invariant: otherwise throw, host failure);
- `UPDATE _partition_write_generation SET generation = generation + 1`.

There is no UPSERT and no `Date.now()`: time is the entry's `(index, term)`.
The reservation read is `SELECT 1 FROM _participant_transactions WHERE state =
'PREPARED' LIMIT 1`.

Retention (R13): one row per transaction per participant, like
`_partition_statement_outcomes` (`partition-committed-statement-outcome-constants.js:16-19`).
Rows are removed only by a committed command of the log-bound owner after the
coordinator's record is terminal; Leg A adds none. The generation row is never
removed. An unbound ROLLBACK of an ACTIVE session costs no round and no row.

### 5.2 `resolveTransactionCommitOutcome` mapping (unchanged)

| Durable/volatile state | Answer |
| --- | --- |
| COMMITTED row | COMMITTED |
| ROLLED_BACK row (incl. TOMBSTONE) or REFUSED row | NOT_COMMITTED |
| PREPARED row | UNKNOWN |
| no row (ABSENT), ACTIVE, PREPARING | UNKNOWN |

- NOT_COMMITTED is answered only from a durable ROLLED_BACK or REFUSED row,
  never from absence.
- Any replica may answer.
- The answer carries `{transactionId, participantId, state, preparedDigest,
  prepareIndex, prepareTerm, decisionIndex, decisionTerm, refusalCause}`.
- `PARTICIPANT_COMMIT_OUTCOME` (`src/constants/transactions.js:17-21`) is
  unchanged.

## 6. Atomicity and faults (decisions J and K)

### 6.1 The one transaction

The transaction is the `store.transaction` opened by
`applyCommittedEntryTransaction` (`raft-rs-application-transaction-owner.js:60`).
Inside it, in order, the partition's `applyCommittedEntry` callback (`:61-68`):

1. re-checks the binding and `g`;
2. runs the decision's operations;
3. records each per-operation committed-statement outcome (`txop:` keys,
   APPLIED, with `changes`/`lastInsertRowid`);
4. applies the conditional row UPDATE to COMMITTED;
5. increments `g`.

Then `putAppliedState` runs (`:77-78`). Everything commits together or not at
all. The proposer's answer, the CDC events, the size update and the parked
writers' re-admission are afterCommit effects (`:95-97`). A throw inside rolls
everything back and rethrows (`:85-94`); the runtime makes it the group's host
failure (`raft-rs-runtime-owner.js:920-941`).

- W2a: a planted failure of the applied-state write leaves no row, no `txop:`
  outcome and the state PREPARED, with the applied index unchanged.
- W2b (V1): records, from inside the applied-state write, the row count, the
  participant state and the `txop:` count: `[{rows:1, state:'COMMITTED',
  txop:1}]`. An afterCommit write of the state or outcomes would show
  `PREPARED`/`0`.

### 6.2 Typed failure edges and K restated

| Edge | Typed outcome | Fails closed | Caller observes |
| --- | --- | --- | --- |
| Nondeterministic operation at staging | `session_write_nondeterministic` (-) | yes | write refused, nothing staged |
| Unsupported parameter at staging | `session_write_param_unsupported` (-) | yes | write refused |
| Nondeterministic operation in a committed PREPARE | REFUSED `nondeterministic` (W), identical | yes | PREPARE refused |
| Deterministic failure at PREPARE dry run | REFUSED `statement_failed` (W), identical | yes | PREPARE refused; NOT_COMMITTED |
| `g` moved before PREPARE apply | REFUSED `conflict` (W) | yes | PREPARE refused |
| `g` not base + 1 at COMMIT apply (impossible on consistent replicas) | REFUSED `commit_base_moved` (W), identical, alarm | yes | COMMIT answered not committed; atomicity alarm |
| Deterministic failure at COMMIT apply (impossible under Q + reservation) | REFUSED `commit_statement_failed` (W), identical, alarm | yes | same |
| Environmental failure at any apply | host failure, nothing recorded, applied index unchanged | yes | UNKNOWN (section 7) |
| Replay of an earlier staged op fails | `replay_diverged`, doomed | yes | session request refused |
| Replay budget | `replay_budget_exceeded` | yes | write refused |
| Digest or decision text mismatch | `decision_digest_mismatch` (-) | yes | refused |
| Opposite terminal | `decision_conflict` (-) | yes | first terminal stands |
| COMMIT on ABSENT/REFUSED | `not_prepared` (-), alarm | yes | refused |
| PREPARE while reserved | `reserved`, deferRetry, non-settling | yes | retry |
| Zero-operation PREPARE (read-only participant) | PREPARED, reserves the partition until the decision | n/a | cost (nit N11): a read-only participant blocks the partition's writers for its PREPARE-to-decision window; the coordinator may omit read-only participants (seam F) |
| Late PREPARE after TOMBSTONE | `terminal` (-) | yes | refused |

K precisely:

- On consistent replicas the PREPARE dry run and the COMMIT run the same
  deterministic operations (Q), against frozen committed state (the
  reservation, plus `g` checked at both). So a COMMIT-time failure is
  unreachable except through a bug.
- If a bug makes it happen, it is identical everywhere and settled REFUSED,
  with an alarm.
- A single-replica environmental failure is the host failure (W3b, control 3).
- Limit L4 stands: a replica whose rows silently diverged records alone,
  exactly as for ordinary writes (`partition-committed-statement-outcome.js:180-187`).

## 7. Await, deadline, leader loss, and the answer owner (decisions H, T, X)

- **Proposing.** PREPARE, COMMIT and bound ROLLBACK requests:
  1. build their command;
  2. ask `admitCommittedCommand` (origin TRANSACTION_OWNER, identity required);
  3. check leadership as `applyWrite` does (`partition-write-kernel.js:294-312`,
     `:338-362`);
  4. join a pending outcome of the same entryId;
  5. otherwise call `startPartitionRaftWriteCommit`
     (`partition-service-raft-write-commit.js:237-252`, with
     `waitForCommittedWrite` registered before the proposal at `:146`).
- **The answer owner (T).** The transaction owner wraps the write commit
  owner's answer for its commands. Every answer that leaves the command
  committed, or possibly committed, becomes `{success:false, outcome: UNKNOWN,
  failureCode: partition_write_outcome_unknown, entryId}`. These are:
  - a proposed release at the deadline or on leader loss
    (`partition-write-kernel.js:370-387`): W11a, W11b;
  - a rejection by the leader's own apply with an environmental failure
    (`partition-committed-statement-outcome.js:297-300`, today answered as a
    failure by `partition-service-raft-write-commit.js:122-131`): W11e;
  - a port refusal whose outcome is `HOST_FAILURE` or `CORE_FATAL` (today
    `CONSENSUS_HOST_FAILURE`, `partition-write-kernel.js:390-414`): W11f;
  - any rejection whose cause the owner cannot classify.

  Only answers that prove nothing was proposed stay refusals:
  `partition_write_not_leader` (unproposed), `partition_write_backpressure`,
  and `partition_write_commit_deadline_exceeded` (unproposed). This also holds
  under 1PC (option B stays the query owner's call).
- **Parked writers (X).** `applyWrite` asks the reservation
  (`SELECT 1 ... WHERE state = 'PREPARED'`) after its settled-answer check
  (`partition-service-write-metrics-base.js:693-701`) and before leadership. If
  the partition is reserved:
  - it registers the write's pending commit (`waitForCommittedWrite`, which
    starts its own `PENDING_REQUEST_TIMEOUT_MS` deadline,
    `partition-service-cdc-stream-base.js:313-347`) but does not propose;
  - it parks `{entry, phaseTimings}` in the write commit owner's reservation
    waiters.

  The decision apply schedules an afterCommit effect that re-admits every
  parked writer (proposes it through the same path). A parked writer still
  waiting at its deadline is released unproposed:
  `partition_write_commit_deadline_exceeded` (`proposal-queue.js:202-222`,
  `partition-write-kernel.js:79-92`), retryable (`:57-66`). A raced write that
  reached apply while reserved is `reserved_refused` (non-settling). If this
  leader proposed it, the proposer re-parks it under the same entryId;
  otherwise it is answered `partition_write_reserved`, retryable. Witnesses:
  W7a, W7b.
- **Non-leader**: `partition_write_not_leader`, nothing proposed (W11c).
- **PREPARING**: session writes are refused `preparing` (W11d).
- **Demotion**: the session-discard hook at
  `partition-service-raft-lifecycle-wiring.js:79` drops volatile sessions
  (surface to create, N10).
- **Cost on the healthy path**: per 2PC participant, 2 awaited rounds plus the
  coordinator's two insert-once writes (transaction row and decision).

## 8. Mirror, checkpoint, CDC, reservation bound (decisions L and M)

### 8.1 Split/merge mirror (limit L1)

Mirroring is a proposer-side effect of an acknowledged ordinary write:
`executePartitionRaftWriteCommit` builds the side-effect plan
(`partition-service-raft-write-commit.js:203-220`), and
`applyWriteSideEffectPlan` calls `handleSplitReplicationAfterWrite` and, while a
merge is active, `handleMergeReplicationAfterWrite`
(`partition-service-write-metrics-base.js:751-762`). `applyCommittedEntry`
forwards nothing. The durable replay cursor re-sends every committed write-type
entry after the watermark, whatever its outcome
(`partition-mirror-replay-cursor.js:89-128`).

Transactions are not mirrored in Leg A, and are not mirrored today
(`transaction-base.js:707-796`). Leg A adds three things:

1. **An admission fence (a hint, R10).** BEGIN and PREPARE are refused
   `participant_transaction_topology_transition_active` while a split/merge
   handle or durable transition row names the partition (lookup shaped like `findDurableMirrorTransitionForService`,
   `partition-mirror-replay-cursor.js:143-163`).
2. **APPLIED-only replay.** The replay cursor mirrors an entry only if its
   `entry:` outcome row is APPLIED. RC1 (red on this head through the existing
   mechanism, finding F-MIR): a STATEMENT_FAILED source entry `dup-a` is
   mirrored today. RC2 (new-surface red): a `reserved_refused` write and the
   transaction commands are not mirrored, and replay resumes with the next
   applied write. Both run over a real rs-raft log in
   `partition-transaction-replay-cursor-v4.test.js`.
3. **Unverified mirror-sender behaviour.** A mirror delivery onto a reserved
   partition is refused non-settling. Whether the mirror sender handles that
   correctly is unverified: it throws on any failure
   (`partition-split-routing.js:241-245`).

A PREPARE committed before a split, then committed during it, applies on the
source and not on the target. Closing that is Leg B's barrier.

### 8.2 Checkpoint (rs-raft path, truthfully)

rs-raft partitions own no checkpoint today: the leader cadence answers
`COMMITTED_LOG_UNSUPPORTED` (`partition-snapshot-cadence.js:8-18`, `:55-71`);
catch-up creation calls `createSqliteStateMachineCheckpoint` without a group id
(`snapshot-catchup.js:210-215`), whose legacy copy refuses an rs-raft database
(`snapshot-checkpoint-store.js:311-315`). The rs-raft copy path
(`:295-309`) is reached only with `raftRsGroupId` (message-group callers) and
its scrub drops every table but `raft_rs_peer_identity` (`:339-357`). The
legacy `hasPendingPreparedTransactions` (`:208-227`) runs only inside the
legacy copy (`:323-326`) and is not on any rs-raft path.

Revision 3: PREPARED rows are application state in `_participant_transactions`,
written in the apply transaction. A partition image taken at applied index N
(when SN1 builds one) contains exactly the rows applied at or below N, which
is consistent with the log suffix above N, so no prepared gate is needed. The
SN1 owner must keep `_participant_transactions` and
`_partition_statement_outcomes` in the partition image (the message-group
scrub shape would drop them). Leg A leaves the legacy gate and its legacy-path
tests untouched; deleting them with the legacy path is finding F-CKPT for the
snapshot owner. `reconstructPreparedState` and its leader-activation call
(`core-base.js:593-604`) are deleted: nothing is reconstructed, the row is
read. W12c restarts over the same file and finds PREPARED with its
reservation.

The partition image must also carry `_partition_write_generation`. A checkpoint
at index N then holds `g` exactly as applied at N, so a replica installed from
it continues the same monotonic sequence.

### 8.3 CDC (receipt 8 stays red)

v3 emits transaction CDC per operation from the decision's afterCommit on the
leader, as ordinary writes do (`partition-service-entry-apply-base.js:1057-1072`),
instead of from `commitTransaction` (`transaction-base.js:746-748`). Sequence
numbers are in-process (`partition-cdc-delivery.js:215-219`) and the buffer is
volatile (`cdc-event-buffer.js`); a crash after the data commit and before
emission loses the event for ordinary writes and transactions alike. No CDC
cursor/retention owner exists; receipt 8's CDC half stays red until one does.

### 8.4 Reservation bound (decision M), corrected

- The participant never calls the coordinator. The hold sweep only reports. A
  PREPARED row is released only by an applied decision.
- Who reaches the decision:
  - normally, the coordinator's commit protocol;
  - if the coordinator is lost, any SQL engine's recovery. Every engine loads
    every `sql_transactions` row
    (`sql-query-engine-transaction-recovery-methods.js:151-159`) and sweeps
    every 1000 ms (`distributed-transaction-coordinator-constants.js:46`).
- Round 3 found the claimed bound false (V7), for two reasons:
  - **FAILED after COMMITTING** is set (`distributed-transaction-protocol.js:396-398`)
    and skipped by recovery (`distributed-transaction-recovery.js:297-306`,
    `:404-410`), so PREPARED participants stay reserved forever. Seam items:
    COMMITTING never becomes FAILED (S3), and recovery completes a decided
    FAILED row (S4a).
  - **The transaction row can be silently unpersisted**
    (`sql-query-engine.js:115-117`). Seam item: a typed refusal at BEGIN (S4b,
    2.1).
- With those seam items in place, the bound is: transaction budget 60 s
  (`timeout-budget.js:20`) + one sweep + one participant round, while some
  engine runs recovery with the control plane readable.
- Otherwise the reservation is unbounded. Writers on that partition are parked
  and released at their own 30 s deadline with
  `partition_write_commit_deadline_exceeded`, retryable. This is a typed,
  non-stalling R12 exposure, recorded. Removal drain
  (`transaction-base.js:88-96`) waits on PREPARED rows for the same bound.

## 9. Supersession inventory (run on this head)

### 9.1 Runs

Revision 3's runs (on cfce28ad0/045c9130e; no src change and no change to an inventoried test file since) are
kept below; the four rows marked v4 were run for this revision on 0643090d7.

`npm run -s test:file -- <file>` one file at a time (thermal ok). Assertion
counts are the runner's.

| File | Exit | Assertions |
| --- | --- | --- |
| test/convergence/dt6-ledger-leader-durability-fitness.test.js | 0 | 45 |
| test/convergence/dt6-zombie-transaction-lifecycle.test.js | 0 | 30 |
| test/partition/partition-runtime-reconstruction-leadership.test.js | 0 | 21 |
| test/transaction/session-transaction-isolation.test.js | 0 | 3 |
| test/transaction/single-partition-acid.property.test.js | 0 | 8 |
| test/transaction/transaction-durability-raft.property.test.js | 0 | 10 |
| test/integration/sql-workflow.integration.test.js | 0 | 71 |
| test/partition/partition-transaction.property.test.js | 0 | 16 |
| test/partition/partition-service.test.js | 0 | 132 |
| test/raft/snapshot-boundary-observability.test.js | 0 | 28 |
| test/raft/snapshot-checkpoint-sqlite-payload.test.js | 0 | 33 |
| test/raft/snapshot-compaction-catchup-integration.test.js | 0 | 37 |
| test/query/distributed-transaction-coordinator.test.js | 0 | 125 |
| test/partition/committed-statement-outcome.test.js | 0 | 18 |
| test/partition/partition-write-typed-releases.test.js | 0 | 7 |
| test/partition/partition-service-role-metadata-publication.test.js | 0 | 91 |
| test/partition/partition-service-transactions-query-routing.test.js | 0 | 94 |
| test/partition/partition-service-write-commit.test.js | 0 | 91 |
| test/partition/partition-transaction-handler.test.js | 0 | 46 |
| test/query/sql-query-engine-transaction-owned-commit-mode.test.js | 0 | 22 |
| test/query/distributed-transaction-wait-bound-spent.test.js | 0 | 22 |
| test/raft/raft-rs-backend/persistence-admission.test.js | 0 | 4 |
| test/partition/partition-port-refusal-outcomes.test.js | 0 | 4 |
| test/integration/public-application-database-transaction-facade.integration.test.js | 0 | 58 |
| test/partition/partition-transaction-replicated-apply.test.js (v2 witnesses) | 1 | 5 (2 pass, 3 fail: P1, P2, P3 red as recorded) |
| v4: test/partition/durable-replay-cursor.test.js | 0 | 11 |
| v4: test/query/transaction-recovery-poison-row-attribution.test.js | 0 | 14 |
| v4: test/distributed/harness/transaction-recovery-poison-row-live-contract.test.js | 0 | 43 |
| v4: test/query/application-database.test.js | 0 | 189 |

Found by grepping `test/` for `LOCAL_STAGING`, `prepareTransaction`,
`commitTransaction`, `TRANSACTION_COMMIT`, `_transaction_outcomes`,
`resolveTransactionCommitOutcome`, `reconstructPreparedState`,
`preparedStateLostSessions`, `hasPendingPreparedTransactions`,
`beginTransaction(`, `rollbackTransaction(`, `checkWriteConflicts`,
`resolveParticipantCommitMiss`, `abortTimedOutTransaction`,
`USER_TRANSACTION_OPEN`, `inTransaction`.

### 9.2 Assertions whose meaning changes (each to be superseded explicitly)

All participant calls change signature from `(sessionId, epoch)` to an identity
object; that mechanical change is not listed per call. Listed are meaning
changes.

| Test (file:line) | Today | New meaning under revision 3 |
| --- | --- | --- |
| dt6-ledger-leader-durability-fitness:133-205 (`:141`, `:151-156`, `:170-171`) | participant BEGIN holds the connection; a sessionless write is deferred `WRITE_DEFERRED_USER_TRANSACTION_OPEN`; `db.inTransaction === true` | participant BEGIN never holds the connection; the zombie fixture must open a raw foreign `BEGIN` on `db` to keep testing the detector; a sessionless write during a session applies |
| dt6-ledger fitness :206, :298, :334, :371, :419, :541 (BEGIN at `:235`, `:305`, `:349`, `:388`, `:448`, `:561`; `:515-523`) | detector driven by a participant session | same detector, driven by a raw foreign transaction; meaning of the detector unchanged |
| dt6-zombie-transaction-lifecycle:127-170 | ACTIVE heal runs SQL `ROLLBACK`, marks `preparedStateLostSessions` | ACTIVE expiry discards a volatile session; no SQL, no PREPARE_LOST set (deleted) |
| dt6-zombie :204-255 | multi-replica leader defers the heal | nothing durable or connection-bound to heal: ACTIVE discarded on any role; PREPARED kept on every role (W12d) |
| dt6-zombie :256-278 | solo leader heals in place via ROLLBACK | as above, no ROLLBACK |
| dt6-zombie :279-305 | a sessionless write is not registered in a foreign session's operations (`activeTransactions` map) | unchanged meaning, measured on the v3 volatile session record; the default-session arm is also deleted (W5b) |
| partition-runtime-reconstruction-leadership:1091-1111 | a user session holds the connection so the held group names USER_TRANSACTION_OPEN | must open a raw foreign `BEGIN` to keep that reason reachable; a participant session can no longer produce it |
| session-transaction-isolation W1 :156-226 | session rollback after BEGIN on the connection | the session never touches the connection; W1's durable-record facts unchanged, its scenario becomes vacuous unless the foreign-transaction fixture is used |
| session-transaction-isolation W2 :228-284 | sessionless write under an open session is deferred or acked | always acked and applied (no deferral from sessions) |
| session-transaction-isolation W6 :286-355 | marker types `TRANSACTION_COMMIT`/`ROLLBACK` after the terminal SQLite statement; `_transaction_outcomes` row | no terminal SQLite statement exists; commands are `PARTICIPANT_PREPARE`/`PARTICIPANT_DECISION`; the outcome row is `_participant_transactions` |
| impact contract `partition-session-transaction-persistence-admission` (`test/shards/impact-contracts.json:565-578`) and pair `:1360-1385` | "ends its session before it proposes a marker" | superseded: no session holds a SQLite transaction; the store refusal stays as enforcement; owners/tests lists change |
| single-partition-acid Property 46 Atomicity/Consistency/Isolation/Durability (:45, :108, :162, :219) | default session absorbs sessionless writes; COMMIT without PREPARE | every write carries the identity; COMMIT requires PREPARED and a bound decision (or the chosen 1PC form) |
| transaction-durability-raft Property 48 (:79, :143 with `:184-187`, :200, :256, :329) | one marker per commit (`commitIndex + 1`), rollback after BEGIN | two committed entries per committed participant (PREPARE + decision); an unbound rollback of an ACTIVE session adds no entry; a bound rollback adds one |
| sql-workflow.integration :298-327, :329-362 | sessionless calls absorbed into the default session; "should see deletion during transaction" via a sessionless read | reads and writes must carry the identity; a sessionless read never sees staging |
| partition-transaction.property Property 1 (:128-194) | conflict by epoch order (an older epoch PREPARE conflicts with a higher-epoch commit even when it began after it) | conflict iff a committed write applied between the transaction's BEGIN and its PREPARE apply |
| Property 5 (:387-452) | CDC emitted by `commitTransaction` | CDC emitted from the decision's afterCommit on the leader, after the PREPARE and decision commands apply |
| Property 6 (:456-514) | rollback of a prepared session succeeds unbound; missing session idempotent | prepared: unbound ROLLBACK refused `decision_binding_required`; bound ROLLBACK terminalizes; missing: `durable: false` success |
| Property 10 (:314-383) | snapshot reader at epoch 200 does not see a row committed at epoch 300 | superseded (section 3.4): the reader sees committed state at read time plus its own operations; the newer row is visible and the reader's later PREPARE is refused `conflict` |
| Property 11 (:55-124) | write set tracked on leader memory | deleted with the key resolver; validation is the partition generation |
| Property 12 (:226-310) | LOCAL_STAGING, no marker until the SQLite COMMIT | PREPARE proposes `PARTICIPANT_PREPARE` and is acknowledged only after it applies (W1a) |
| Property 13 restart (:524-584) | reconstruction from the committed PREPARE log entry | no reconstruction; the PREPARED row is read after restart (W12c) |
| Property 15 (:589-663) | hold timeout releases prepared state autonomously, COMMIT answers PREPARE_LOST | PREPARED is never released by time; sweep reports only (W12d) |
| partition-service.test :365-415 | 1PC COMMIT without PREPARE is COMMITTED after restart; `never-delivered-session` -> NOT_COMMITTED; outcomes keyed by epoch | COMMIT requires PREPARED; absence -> UNKNOWN; outcomes keyed by `(transactionId, participantId)` |
| partition-service-transactions-query-routing :1199-1450 | BEGIN idempotent per session; BEGIN refused while another is prepared; removal fence drains via `isInTransaction` | idempotent per `transactionId`; refused while any PREPARED row exists; drain waits on volatile sessions and PREPARED rows |
| committed-statement-outcome F-ai :625-660 | session write admitted at staging; the commit marker carries string entryIds | admitted at staging; the PREPARE command carries them in `operationsText`; per-op outcomes under `txop:` keys |
| partition-write-typed-releases :265-277 (`withSessionHeldLeader`) | a participant session holds the leader's connection to make proposals defer | needs a raw foreign `BEGIN`; meaning of the releases unchanged |
| partition-service-write-commit :455-500 | legacy `TRANSACTION_COMMIT` outcome rolls back with applied state | legacy type is UNRECOGNISED; the same property is W2a for `PARTICIPANT_DECISION` |
| partition-service-role-metadata-publication :92 | stubs `reconstructPreparedState` | the method is deleted; the stub and its count go |
| distributed-transaction-coordinator :442-502 | recovery treats a 2PC NO_TRANSACTION commit miss as COMMITTED | must read the participant outcome (seam S2); a COMMIT on a COMMITTED row is answered COMMITTED, so the miss disappears |
| distributed-transaction-coordinator :646-673 | "one phase must not prepare" | superseded only if the query owner chooses prepare-first (11.2) |
| distributed-transaction-coordinator :767-810 | 1PC outcome read by `(sessionId, partitionId, epoch)` | by `(transactionId, participantId)`; NOT_COMMITTED only from a durable row |
| sql-query-engine-transaction-owned-commit-mode :180-200 | outcome read keyed by session/epoch | keyed by identity |
| distributed-transaction-wait-bound-spent :55-160 | `abortTimedOutTransaction` from PREPARING rolls back unbound | the rollback fanout carries a bound ROLLBACK decision inserted first (seam C) |
| public-application-database-transaction-facade :1-20, :213-225 | header says followers never run operations; F-2PC-CONCURRENT witness | header claim becomes false (supersede the comment); the concurrent-refusal witness keeps its meaning (one non-terminal transaction per partition), now with a typed `already_active` |
| snapshot-boundary-observability :224-252, snapshot-compaction-catchup :355-380 | legacy-path prepared gate on `_raft_log` | unchanged in Leg A (legacy path only); retired with the legacy path (F-CKPT) |
| partition-transaction-replicated-apply (v2) P1-P3 | legacy-shape witnesses | superseded history; kept red and unchanged; v3 file replaces them |

Added in revision 4 (V11):

| Test or contract (file:line) | Today | New meaning under revision 4 |
| --- | --- | --- |
| durable-replay-cursor :252-300 (legacy marker at `:266-271`) | a legacy `PREPARE_TRANSACTION` control entry is committed through a real lone-leader log and filtered out of the mirror replay | the legacy type fails closed as UNRECOGNISED at apply, so the fixture's control entry becomes a `PARTICIPANT_PREPARE` (RC2 shape); "control entries are not mirrored" keeps its meaning and the cursor additionally requires an APPLIED outcome row (RC1) |
| transaction-recovery-poison-row-attribution :56; poison-row live-contract :234; scenarios/transaction-recovery-poison-row-live.js :61 | fixtures name `ONE_PHASE_COMMIT` | affected only if the query owner chooses prepare-first and deletes the label (11.2): the fixtures then name the surviving mode; otherwise unchanged |
| Transaction parameters (contract change) | a session write binds Buffer/BLOB, BigInt and Date params directly on the connection (`partition-service-write-metrics-base.js:221-223`) | refused `session_write_param_unsupported` at staging; only JSON scalars survive the replicated form (3.1, W6n) |
| Nondeterministic SQL in transactions (contract change, L7) | allowed (evaluated on the leader's connection) | refused `session_write_nondeterministic` at staging; refused `nondeterministic` at PREPARE apply (W6n, W3c) |
| Multi-partition statements without an explicit transaction (contract change, L5) | statement-autocommit transactions whose concurrent writers wait behind `BEGIN IMMEDIATE` | may abort `conflict` under concurrent writes; retried as a whole statement by the engine's statement-autocommit owner within the 60 s transaction budget (3.6, W16) |
| application-database :687-725 | a failed COMMIT with `commitPointReached` true is `TRANSACTION_OUTCOME_UNKNOWN` | unchanged; seam S1 relies on it for the client answer after a COMMIT decision |

Unaffected after reading: `persistence-admission.test.js` (uses raw `BEGIN`,
meaning unchanged), `partition-port-refusal-outcomes.test.js`,
`snapshot-checkpoint-sqlite-payload.test.js`, `partition-transaction-handler.test.js`
(tests `src/partition/partition-transaction-handler.js`, which no `src/` module
imports: finding F-DEAD).

### 9.3 Findings recorded (R17, not absorbed)

- F-DET: nondeterministic SQL (`datetime('now')`, `random()`) in any
  replicated write is evaluated per replica; no owner pins values.
- F-MIR: the durable replay cursor mirrors STATEMENT_FAILED source entries.
- F-DIV: no owner detects logical replica divergence.
- F-CKPT: the legacy prepared gate and its tests outlive the legacy path.
- F-DEAD: `partition-transaction-handler.js` has no production importer.
- F-REC: every SQL engine loads and may drive every recovered transaction
  concurrently; only the insert-once decision makes that safe.
- F-ID: revision 3's identity premises were wrong (two engines per node,
  configured node ids); withdrawn (2.1).
- F-DET is restated in 3.3: for ordinary writes it changes stored values only;
  transactions now refuse such SQL (L7).
- F-MIR is now witnessed (RC1, red on this head).

## 10. Witness ladder and receipts

### 10.1 The witnesses on 0643090d7

`node --test --test-reporter=tap test/partition/partition-transaction-replicated-apply-v3.test.js`
exits 1: 46 tests, 42 fail, 4 pass. `node --test --test-reporter=tap
test/partition/partition-transaction-replay-cursor-v4.test.js` exits 1: 2 tests,
2 fail. Output: `evidence/red-v4-first-run.tap` (sha256 929b7046ef4e7464...;
witness file sha256 5833d78ad865dc5d..., sibling 481e6d722ec95a86..., fixture
26b25da66517076f...). A second run gave identical verdicts. Each red names its
first differing facts:

| Witness | Red on this head because (actual) |
| --- | --- |
| W1a | no `PARTICIPANT_PREPARE` proposed; PREPARE settled at once (LOCAL_STAGING); staged row visible (1) |
| W1b, W2a, W3a, W3b, W3c, W4, W9, W10b, W12a, W12c, W12e | revision-4 commands fail as `partition_committed_command_unrecognised`; outcome reads answer NOT_COMMITTED with no state |
| W2b | UNRECOGNISED; probe `[]` |
| W5a | `inTransaction` true after BEGIN and after the write; sessionless reader sees 1; the sessionless write's apply fails `RAFT_RS_STORE_USER_TRANSACTION_OPEN`; `sessionSeesLaterCommit` 0 |
| W5b | the sessionless write is absorbed into the default session, not proposed |
| W6 | `provisional` absent; no PREPARE proposed |
| W6n | all five writes staged (`success: true`, no code); no PREPARE proposed |
| W7a | the write is proposed at once (1) while the hand-built PREPARE is unrecognised; the raced write applied and settled |
| W7b | proposed at once; the deadline answers `partition_write_outcome_unknown` |
| W10a | both coordinators mint `tx-default-1000-1` |
| W10c | one attempt; BEGIN throws on the collision; no insert-once option |
| W11a, W11b, W11e | no PREPARE proposed; the answer is an immediate LOCAL_STAGING success |
| W11c | the follower's refusal has no `failureCode` |
| W11d | the late write is proposed as an ordinary write and stays pending |
| W11f | UNRECOGNISED PREPARE; the COMMIT answer has no `outcome` |
| W12b | absence answers NOT_COMMITTED (expected UNKNOWN, ABSENT) |
| W12d | `inTransaction` true; the PREPARE apply is refused `RAFT_RS_STORE_USER_TRANSACTION_OPEN`; the swept session still stages |
| W13, W14 | the intervening write fails under the open session; the PREPARE answers success |
| W15 | no PREPARE proposed |
| W16 | answers untyped (LOCAL_STAGING successes) |
| S1 | rollback `['p1','p2']` after COMMITTING; transaction ended |
| S2 | COMMITTED with 0 outcome reads |
| S3 | `FAILED` after the lost answer; 1 re-prepare on the re-drive |
| S4a | no commit; transaction still active |
| S4b | `skipped silently` |
| S5 | request carries no `transactionId`/`participantId`/`commitMode` |
| S6 | no retained digest/index/term on the participant row |
| S7 | `['commit']` (no prepare) |
| S8 | no decision recorded |
| RC1 | the replay cursor mirrors `dup-a` (STATEMENT_FAILED) before `insert-b` |
| RC2 | setup fails: `Raft operation HOST_FAILURE: committed-command-unknown` |
| controls 1-4 | green |

Lint and ratchets:

- `npx eslint` passes for the witness file, the sibling, the fixture and the
  producer.
- `npm run -s test:duplication` exits 1 at the same pre-existing 698/697
  groups and 26410/26369 lines as revision 3. The fixture and the sibling are
  scanned with 0 clones.
- The live witness file is 1240 lines, so jscpd skips it (nit N8). A scoped
  jscpd at the ratchet's thresholds over `test/partition` and
  `test/test-helpers`, with the cap raised, finds 0 clones involving it.

### 10.2 Receipts (eight sealed ids unchanged; producer amended under the lead's widening)

| Receipt | Kind | Witnesses (exact count) | Stays red until |
| --- | --- | --- | --- |
| no-speculative-visibility-before-consensus | subtest | W1a, W5a, W5b (3) | participant cutover |
| replicated-prepare-committed-and-applied-on-every-replica | shell | W1a, W1b, W12c, W11a, W11b, W11c, W11d, W11e, W15 (9) **and** the real three-replica file | cutover **and** A1-A3 on real rs-raft |
| commit-applies-operations-outcome-and-applied-index-atomically | shell | W1b, W2a, W2b, W3a, W3b, W3c, W4, W6, W6n, W13, W14 (11) **and** the real file | cutover **and** A5 |
| duplicate-and-conflicting-decisions-idempotent-or-refused | shell | W9, W12a, W12e, W10a, W10b, W10c, seam S5 (7) **and** the real file | both lanes **and** A4 |
| exact-participant-outcome-no-transaction-is-not-committed | subtest | W12b, W1b, W11f, seam S2 (4) | both lanes |
| immutable-coordinator-decision-before-fanout | subtest | seam S1, S4b, S6, S7, S8 (5) | query lane |
| no-rollback-after-commit-decision-and-no-prepared-erasure | subtest | W9, W12d, seam S1, S3, S4a (5) | both lanes |
| recovery-and-cdc-survive-deadline-and-crash | absent | (none) | a CDC cursor/retention owner exists, or the seal is superseded (owner decision) |

How the shell receipts work:

- The command is `out=$(env -u NODE_TEST_CONTEXT node --test-reporter=tap
  --test-name-pattern='<anchored pattern>' <v3 file> 2>&1)`. It then requires
  the lines `# tests N`, `# fail 0`, `# skipped 0` and `# todo 0`, and finally
  runs `npm run -s test:file -- test/raft/raft-rs-backend/transaction-leg-a-three-replica.test.js`.
- That file does not exist. The classified runner refuses it ("unclassified or
  missing test file", exit 1), so the receipts stay red until A1-A5 are
  written and green.
- The exact-count snippet was checked against the four green controls:
  `# tests 4` exits 0 and `# tests 3` exits 1.

Producer run to scratch:

- `node scripts/quest-evidence/replicated-transaction-decision-and-apply.js
  --output <scratch>` exits 1 with 0/7 receipts passing.
- The tracked `evidence/receipt.json` was not regenerated in this unit.
- The probe still reads 8 outstanding.

Not bound to a sealed receipt (design witnesses only):

- W7a and W7b (admission-gating);
- W16 (a measurement);
- RC1 and RC2 (mirror, Leg A limit L1 and Leg B).

Correction to revision 3 (V13): its sentence "outside this unit's write scope
... No receipt is added or renamed here" was stale. The lead changed the
producer and the shared harness in 84ae1a623, recorded at 0643090d7. This
revision changes the producer under the widened scope and leaves the harness
untouched.

### 10.3 Not expressible yet

- **The transaction commit reaching a split target, and the mirror sender's
  handling of a reserved refusal.** These need the split/merge workers. They
  belong to Leg B (TX2) and stay red; the sender's behaviour is stated as
  unverified in 8.1.
- **CDC exactly-once across a crash after the data commit.** There is no
  durable cursor owner.
- **PR100 A1-A5 on a real three-replica rs-raft group.** They are bound into
  receipts 2-4 through the missing file.

## 11. What remains for the query owner; the single cutover change set

### 11.1 Seam items (detail and falsifiers in the seam record, revision-4 section)

| Item | Seam obligation | Falsifier |
| --- | --- | --- |
| A | identity on every request and answer; delivery key `{transactionId, partitionId, operation}` | S5 |
| B/S | 128-bit random id, insert-once `sql_transactions` row before fanout, typed collision re-mint, typed refusal without a gateway | W10a, W10c, S4b |
| C | insert-once decision record before any fanout; every rollback path inserts ROLLBACK first; a found COMMIT continues commit | S1, S8 |
| C' | after the decision the client answer is in doubt (`commitPointReached: true` -> `TRANSACTION_OUTCOME_UNKNOWN`), never a rollback | S1 |
| D | outcome reads by identity; UNKNOWN pending; NOT_COMMITTED only from the participant's row | S2 |
| E | PREPARE answers (digest, index, term) retained on the participant row before deciding | S6 |
| F | 1PC choice; option A falsifier pinned | S7 |
| G | concurrent recovery converges on one insert-once decision | S8 |
| U | COMMITTING never becomes FAILED; recovery completes decided FAILED rows | S3, S4a |
| V | statement-autocommit retry of a `conflict` within the transaction budget and backoff | W16 (measurement; a retry witness lands with the query lane) |
| H | register the coordinator-participant coupled pair in `test/shards/impact-contracts.json` | gate |

### 11.2 1PC

- **Option A, prepare-first (recommended).**
  - The participant has no 1PC-specific code.
  - It supersedes `test/query/distributed-transaction-coordinator.test.js:646-673`
    and `architecture/images-distributed-public-seam.md:102`.
  - `COMMIT_MODE.ONE_PHASE_COMMIT` is deleted, not relabelled; the three
    fixtures in 9.2 then change.
  - Falsifier: S7.
- **Option B, participant-decided.**
  - It needs a quest supersession of "decision before fanout" for 1PC.
  - It needs the T answer mapping (section 7), so the coordinator never adopts
    a failure for a committed command.
  - Falsifier: S7 is replaced by a test that the coordinator adopts only a
    durable participant outcome.

### 11.3 The single cutover change set (lands together)

The participant lane changes:

- `partition-service-transaction-base.js`, rewritten on c' with the answer
  owner;
- `partition-service-write-metrics-base.js`: session paths and the reservation
  check in `applyWrite`;
- `partition-service-raft-write-commit.js`: the reservation waiters;
- `partition-service-entry-apply-base.js`: the two command branches, the
  generation increments and identity on the wire;
- `partition-service-transaction-session-methods.js`;
- `partition-committed-command-admission.js`;
- `partition-service-constants.js`: the types, codes, tables, SQL and budgets;
- the new `partition-transaction-determinism.js`;
- `partition-committed-statement-outcome*.js`: the `txop:` keys;
- `partition-write-kernel.js`: `partition_write_reserved` and the side-effect
  plan;
- `partition-service-core-base.js`;
- `partition-service-raft-lifecycle-wiring.js`: the session-discard hook;
- `partition-mirror-replay-cursor.js`: APPLIED-only replay;
- the admission fence;
- the documents of section 3.4;
- the superseded tests of section 9.2.

The query lane changes the coordinator identity, the insert-once transaction
row and decision record, the protocol (S1/S3), recovery (S4a/S8), the engine
wire (S5), the persistence refusal (S4b) and the statement-autocommit retry.
Both lanes register the impact-contract pair.

Landing gate:

1. the v3 and v4 witnesses are green, except the receipts marked red in 10.2;
2. the superseded tests are rewritten to their new meanings;
3. the shard census (`test/shards/*.json`) is regenerated for the two new test
   files;
4. independent source verification;
5. the real three-replica A1-A5.

Upgrade precondition (L6): no non-terminal transaction may be in flight at
cutover.

Limits:

- L1: no transaction mirroring (Leg B).
- L2: CDC is not durable.
- L3: the reservation is unbounded without a recovering engine (R12).
- L4: local divergence is indistinguishable from an identical failure.
- L5: partition-granular conflicts, and one non-terminal transaction per
  partition. This is an owner-accepted R12 exposure (3.6).
- L6: upgrade drain.
- L7: no nondeterministic SQL or non-JSON params in transactions.
- L8: decision binding is self-certifying; seam C carries safety.
