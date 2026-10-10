---
audience: development
documentClass: planning
---

# TX1 Leg A design, revision 5 (2026-10-10)

Quest `replicated-transaction-decision-and-apply` (sealed df51b799a). This
revision supersedes [revision 4](design-leg-a-v4-2026-10-10.md), which the
round-4 design vet rejected (REVISE, 6 blockers R4-1..R4-6 and 15 nits,
recorded in `log.ndjson` by bb155b29f). Revisions 1-4 stay as history.

Revision 5 is revision 4 amended. Unchanged text is carried over. Every change
answers a round-4 blocker or nit, or one of the lead's revision-5 decisions
AA-AG. Deviations from the brief are listed in section 0.5.

Citations are `file:line` on HEAD bb155b29f. `git diff f9bcfe493..bb155b29f --
src test scripts` is empty, so round 4's check of about 45 new citations still
holds. Every new citation in this revision was checked on this head.

Witness files (first run: `evidence/red-v5-first-run.tap`):

| File | Role | Tests | Result |
| --- | --- | --- | --- |
| [`test/partition/partition-transaction-replicated-apply-v3.test.js`](../../../test/partition/partition-transaction-replicated-apply-v3.test.js) | participant witnesses, amended in place | 39 (991 lines, now inside jscpd's 1000-line cap) | 35 red, 4 controls green |
| [`test/query/partition-transaction-seam-falsifiers.test.js`](../../../test/query/partition-transaction-seam-falsifiers.test.js) | new; S1-S8, W10a and W10c moved here from the participant file | 11 | 11 red |
| [`test/partition/partition-transaction-replay-cursor-v4.test.js`](../../../test/partition/partition-transaction-replay-cursor-v4.test.js) | replay cursor over a real rs-raft log, unchanged | 2 | 2 red |
| [`test/test-helpers/participant-transaction-fixture.js`](../../../test/test-helpers/participant-transaction-fixture.js) | shared fixture | n/a | n/a |

## 0. Dispositions

### 0.1 The landing rule (lead decision A, unchanged)

There is one protocol and one cutover change set. It spans both lanes and lands
only under the query owner's agreement of the seam
([`seam-2026-10-10.md`](seam-2026-10-10.md), revision-3, -4 and -5 sections).

**No participant source lands before the seam is agreed.**

One exception is recorded. The write kernel's may-be-committed answer fix (AD,
section 7) is a bounded single-owner kernel change and can land on its own
(0.5 item 4).

### 0.2 The 6 round-4 blockers

| # | Blocker (round 4) | Revision-5 disposition | Section | Witness |
| --- | --- | --- | --- | --- |
| R4-1 | `g` moves under the reservation (a foreign TOMBSTONE, a `digest_invalid` row), so a decided COMMIT is durably REFUSED | Decision AA: `g` advances only on application-data changes, never on control rows. The COMMIT recheck compares the current `g` digest with the carried digest; the "+1" wording is dropped (nit N7). Table 4 gains the column "foreign decision / tombstone / refused PREPARE while PREPARED". | 3.2, 4 | W17 |
| R4-2 | The census is not fail-closed, and apply-side re-classification diverges under version skew | Decision AB. One classifier, at staging on the leader only. It is an allow-list of deterministic functions (anything unknown is refused) read from SQLite's own compiled program, and it refuses every date/time function. Implicit keys are detected from SQLite's schema plus the INSERT column list. The apply side never re-classifies: a committed PREPARE is applied as carried. | 3.3 | W6n (extended), W3c (rewritten) |
| R4-3 | The in-transaction write of `g` is unwitnessed | Decision AC. The W2b probe records `g` at the decision's applied-state write. The new W2c probes `g` at an ordinary write's applied-state write. | 6.1 | W2b, W2c |
| R4-4 | T was a second answer mapping; the ordinary-write instance went unrecorded | Decision AD. The write kernel's answer builders own "committed or may be committed -> OUTCOME_UNKNOWN" for all writes, and the transaction owner consumes that typed fact. The ordinary-write defect is finding F-ANS. | 7, 9.3 | W11e-ord, W11f-ord |
| R4-5 | The real-backend half of the receipts accepts any green file | Decision AE. A1-A5 are named as tests; each receipt runs its exact A-subset under the same exact-count rule. | 10.2 | producer |
| R4-6 | The inventory misses revision 4's own contract changes | Decision AF. S4b is narrowed: an explicit BEGIN or a multi-partition statement without a gateway is refused, while DIRECT_AUTOCOMMIT is unchanged. Inventory additions: `transaction-support.test.js:107-120`, `application-database.test.js`, `postgres-wire-adapter.integration.test.js`, `cross-partition-rejection.property.test.js`, the seed-hydration engine, and the change from a 2 s deferral to a parked write. | 2.1, 9, 11 | S4b |

### 0.3 The eight witnesses round 4 requires (its section 3)

| # | Requirement | Witness | Red on bb155b29f because | Not greenable by |
| --- | --- | --- | --- | --- |
| 1 | Foreign TOMBSTONE and `digest_invalid` PREPARE while T1 is PREPARED; T1 then COMMITTED on two replicas | W17 | every command is UNRECOGNISED (new surface) | a `g` that moves on control rows (T1 would be REFUSED `commit_base_moved`) |
| 2 | `datetime()`, `unixepoch()`, `datetime(?)` with `'now'`, `'localtime'` and `'NOW'` refused; identical at apply | W6n (12 refusals plus a Buffer), W3c | W6n: all writes staged (`failureCode: null`). W3c: UNRECOGNISED | a `'now'`-literal token rule (`datetime()` passes it); a classifier at apply (W3c expects the carried PREPARE applied, never REFUSED) |
| 3 | `g` in the W2b probe; an ordinary-write probe of `g` | W2b, W2c | W2b: probe `[]` (UNRECOGNISED). W2c: the probe's read of the absent `_partition_write_generation` fails the apply (`SQLITE_ERROR`): a new-surface red | bumping `g` in afterCommit (the probe shows the old value) |
| 4 | Ordinary-write analogue of W11e | W11e-ord, W11f-ord | W11e-ord: `{success:false}` with no `failureCode`. W11f-ord: `partition_write_consensus_host_failure` | a transaction-only wrapper |
| 5 | Named A1-A5 with per-receipt exact counts | producer | the A-subsets fail (the file is missing) | a placeholder file (the exact count requires each named A test) |
| 6 | A gateway-less BEGIN among the superseded tests | 9.2 rows, S4b | S4b: BEGIN succeeds silently | n/a (query lane) |
| 7 | W7b: a decision applied after the deadline proposes nothing | W7b | proposed at once (1); the deadline answers OUTCOME_UNKNOWN | a stale waiter proposing after release (blocked by `markProposal`; witnessed) |
| 8 | CDC exactly-once, mirror sender, real A1-A5 | stays red, unverified, bound | 10.3 | n/a |

### 0.4 Earlier rounds

- **Round 3 closed:** V2, V7, V12 and V13. V1 and V5 were closed on their halves.
- **Answered here:** the remaining halves, R4-3 (V1) and nit N11 (V5).
- **Round 2:** carried as in revision 4, section 0.4.
- **History:** revision 4's V-table remains the record for round 3.

### 0.5 The brief and every deviation (R16, R21)

**Lead decisions** (recorded by the lead):

- A-P are recorded at 12:48:48.074.
- Q-Z are in revision 4, section 0.5.
- **AA:** `g` moves only on application data.
- **AB:** one classifier at staging, allow-list, no apply-side re-classification.
- **AC:** probes of `g`.
- **AD:** the kernel owns the UNKNOWN mapping.
- **AE:** named A1-A5.
- **AF:** S4b narrowed, plus the inventory.
- **AG:** nits.

Revision 4's deviations 1-8 and 10 stand as written there; item 9 is withdrawn
(see item 1 below). New in this revision:

1. **Q, refined, is withdrawn.** Revision 4's apply-side refusal of
   nondeterministic operations is removed, per AB. W3c now witnesses the
   opposite: a committed PREPARE is applied as carried.
2. **AB: date/time functions refused entirely in Leg A, whatever their
   arguments.** I chose this over argument analysis because the time-value can
   come from a literal, a bound param (`'now'`, any case), a column (data
   dependent), or a modifier (`'localtime'`/`'utc'`, which depend on the host
   time zone). Telling these apart needs expression-level data flow that no
   owner has.
3. **AB: classifier input.** The function census is read from SQLite's own
   compiled program, not from SQL text. The classifier runs
   `EXPLAIN <statement>` on the leader's connection at staging and reads the
   `Function`, `PureFunc`, `AggStep` and `AggFinal` opcodes, whose `p4` names
   each called function (measured on this better-sqlite3, SQLite 3.49.2: for
   example `Function:datetime(-1)`, `Function:current_timestamp(0)`,
   `Function:randomblob(1)`). Inline built-ins such as `coalesce`/`ifnull`
   compile to no function opcode and are therefore allowed implicitly. A
   statement whose program contains a `Program` opcode (a trigger sub-program)
   is refused, because the functions inside it are not visible.

   The opcode format is not a stable SQLite API. That is acceptable only
   because the classifier is leader-only and per binary: a census change
   alters what a new leader admits, never how a committed PREPARE applies, so
   no drain or version gate is needed.
4. **AD: independently landable.** Moving the may-be-committed mapping into the
   write kernel (`partition-service-raft-write-commit.js:122-131`,
   `partition-write-kernel.js:390-414`) is a single-owner change that also
   fixes ordinary writes (W11e-ord, W11f-ord). It is in the cutover change
   set's participant scope, and it can land earlier as a bounded kernel fix,
   independent of the seam.
5. **AF: seed-hydration engine.** It is constructed without a gateway or a CDC
   service (`seed-cache-hydration-phase.js:220-234`). Its coordinator is handed
   to the migration owners (`migration-composition.js:42`,
   `migration-coordinator.js:260`), and no module under `src/migration/` calls
   the coordinator's `begin`/`enlistParticipants`/`commit` (grep: no call site).
   Whether any other caller of that engine runs an explicit transaction or a
   multi-partition statement is not established here. Under AF such a call
   becomes a typed refusal. This is recorded as an owner check (0.7).
6. **N5, stated precisely.** Single-partition statements never abort with
   `conflict`. While a participant row on their partition is PREPARED they are
   parked, up to their own 30 s deadline. Under L3 (no recovering engine) they
   are refused at that deadline for as long as the reservation lasts.
7. **N6.** The statement-autocommit retry unit spans `openWriteTransaction`,
   execute and `finishWriteTransaction` at three call sites
   (`sql-query-engine-write-execution.js:225-294`, `:392-462`, `:559-629`).
   - The cited backoff is the participant retry: 3 retries, 10-250 ms
     (`distributed-transaction-coordinator-constants.js:38-42`). It is not a
     60 s loop: the 60 s transaction budget bounds the whole attempt.
   - A retry fires only on a durable REFUSED `conflict`, never on UNKNOWN.
   - Whether it counts as a "retry framework" under the constraint
     `existing-owner-chain` is the query owner's seam-V decision.

### 0.6 Round-4 nits

- **N1:** the `markProposal` guard is cited (`proposal-queue.js:118-124`,
  `partition-service-raft-write-commit.js:67-71`). W7b applies a decision after
  the deadline and asserts 0 proposals.
- **N2:** f9bcfe493 did regenerate `receipt.json`. `testFileDigests` record the
  first file of each receipt: the participant file and the seam file. The
  fixture and the sibling are not recorded (a harness owner limit). The lead
  regenerates `receipt.json` at commit (10.2).
- **N3:** corrected. CORE_FATAL already answers OUTCOME_UNKNOWN
  (`partition-write-kernel.js:410-413`).
- **N4:** the stay-refusal list is completed (section 7).
- **N5, N6:** see 0.5 items 6 and 7.
- **N7:** the "+1" wording is dropped. Under AA the PREPARE does not move `g`,
  so the COMMIT recheck is `digest(current g) == carried digest`.
- **N8:** finding F-SNAP: the snapshot owner must carry the three tables.
- **N9:** stands. A leader dual path that applies the decision from volatile
  operations is excluded by design: COMMIT runs `operations_text` from the row.
  No port witness can discriminate this; the real A2 (leader change) does.
- **N10:** accepted, harmless.
- **N11:** a re-mint happens only on the primary-key collision class (W10c's
  second case). The insert-once mutation must not carry the
  `sql-transaction:${id}` coalescing key (`sql-query-engine.js:142-144`); seam
  B, revision 5.
- **N12:** the lead's.
- **N13:** W7a, W7b, W16, RC1 and RC2 stay bound only by the landing gate
  (stated in 10.2).
- **N14:** the re-admission burst is bounded by the proposal queue's
  `MAX_CAPACITY` of 1000 (`proposal-queue-constants.js:13`). Re-admission goes
  through the queue's backpressure.
- **N15:** the AA-AG brief is summarized in 0.5. Appending it to the log is the
  lead's.

### 0.7 Open owner and seam decisions (for the lead's report)

- **Seam items A, B/S, C, C', D, E, F, G, H, U, V and T:** all recorded, none
  agreed. The query owner has not been present in any round.
- **1PC:** option A (prepare-first, recommended) or option B.
- **L5:** acceptance of the partition-granular conflict exposure as an R12
  exposure. It is still not recorded as accepted.
- **L3:** the reservation is unbounded without a recovering engine. An owner
  must accept it, or name a bound.
- **Receipt 8:** a CDC cursor/retention owner, or a seal supersession.
- **The seed-hydration engine's transaction use under AF** (0.5 item 5).
- **Witness-file split: done.** S1-S8, W10a and W10c moved to
  `test/query/partition-transaction-seam-falsifiers.test.js`. The participant
  file is 991 lines.
- **Shard census:** `test/shards/*.json` must be regenerated for the new seam
  file at commit.

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
  - only the primary-key collision class re-mints; any other persistence
    error is a typed BEGIN failure (W10c);
  - the insert-once mutation carries no `sql-transaction:${id}` coalescing key
    (`sql-query-engine.js:142-144`), so a pending status UPSERT can never
    replace it;
  - (AF, narrowed) an engine without a usable gateway refuses an explicit BEGIN
    and a multi-partition statement, typed
    (`TRANSACTION_STATE_PERSISTENCE_UNAVAILABLE`), instead of the silent return
    at `sql-query-engine.js:115-117`. DIRECT_AUTOCOMMIT single-partition
    statements never reach the coordinator
    (`sql-query-engine-write-execution.js:83-90`, `:120-121`) and are
    unchanged (S4b).

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

1. Identity: an exact `participantId`, and the digest integrity
   `sha256(operationsText + "\n" + validationText) === preparedDigest`. A
   mismatch is typed with no row written (`identity_mismatch`), or a REFUSED row
   with cause `digest_invalid`.
2. Existing row for this identity: the same digest is an idempotent PREPARED
   answer; any other row state is `terminal`; a different digest is
   `prepare_content_conflict`. No write in any case.
3. Reservation: if another row is PREPARED, the disposition is
   `reserved_refused`. It is non-settling: no write, deferRetry.
4. (Revision 5) no classification at apply: the operations are applied as
   carried (AB, W3c).
5. Generation: if the current `g` digest differs from `validationText`, a
   REFUSED row, cause `conflict`.
6. Dry run of the operations in a nested `db.transaction` that throws a
   sentinel:
   - a deterministic failure writes a REFUSED row, cause `statement_failed`;
   - an environmental failure is the host failure (nothing recorded).
7. INSERT the PREPARED row. `g` does not move: a PREPARED row is a control
   row (AA).

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
- **When `g` increments (decision AA; revision 5).** Only when application
  data changes. It is incremented by exactly 1, inside the application
  transaction, by:
  - every committed SQL command whose statement is APPLIED: ordinary writes,
    mirror applies, and schema changes (`MIGRATION_ALTER_TABLE`);
  - a COMMIT decision whose operations apply (once per decision, not per
    operation).

  Control rows never move it: a PREPARED row, a REFUSED row (including
  `digest_invalid`, `conflict` and `statement_failed`), a TOMBSTONE, a
  ROLLED_BACK transition, a `reserved_refused` disposition, a STATEMENT_FAILED
  write, a settled replay, a refused decision, and the bootstrap-only
  `executeLocalQuery` (`partition-service-write-metrics-base.js:133-185`).

  So nothing that may apply while a row is PREPARED can move `g`:
  - writes and other PREPAREs are reserved;
  - a foreign decision can only be a ROLLBACK, because a foreign COMMIT needs
    its own PREPARED row, which the reservation prevents;
  - a foreign TOMBSTONE or REFUSED row is a control row.

  W17 witnesses this. It closes round-4 R4-1.
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
- **COMMIT apply** re-checks `g`: `sha256("generation:" + g)` must equal the
  digest carried in the PREPARED row's `validation_text` (no "+1": the PREPARE
  did not move `g`; round-4 nit N7). A mismatch is impossible on consistent
  replicas. Under K it is settled REFUSED with cause `commit_base_moved`
  identically, with an alarm.

Consequence: a transaction commits only if its partition applied no other
write between its BEGIN and its PREPARE. Every read it made saw one committed
prefix, so each partition is optimistically serializable. Aborts are
partition-granular (limit L5, 3.6).

### 3.3 Determinism: one fail-closed classifier at staging (decisions I, Q, AB)

- **One classifier, leader only.** It is owned by the new
  `src/partition/partition-transaction-determinism.js` and runs at staging, on
  the leader, before the c' validation (3.1). **The apply side never
  re-classifies.** A committed PREPARE is applied exactly as carried (step 4 of
  2.3; W3c applies a `datetime('2020-01-01')` operation as carried, identically
  on two replicas). A classifier change across versions therefore changes only
  what a new leader admits, never the disposition of a committed command. No
  drain or census version gate is needed. Revision 4's apply-side refusal is
  withdrawn (round-4 R4-2).
- **Function census: an allow-list read from SQLite's compiled program.**
  `EXPLAIN <statement>` runs on the leader's connection, and the classifier
  reads every opcode `Function`, `PureFunc`, `AggStep` or `AggFinal`, whose
  `p4` names the function (for example `datetime(-1)`,
  `current_timestamp(0)`, `randomblob(1)`, `upper(1)`; measured on SQLite
  3.49.2).
  - Every named function must be on the allow-list, which is owned by the
    classifier module. Anything unknown is refused.
  - A program with a `Program` opcode (a trigger sub-program, whose functions
    are invisible) is refused.
  - Inline built-ins such as `coalesce`/`ifnull` compile to no function opcode
    and are inherently deterministic.
  - The Leg A allow-list: `abs`, `char`, `hex`, `instr`, `length`, `lower`,
    `ltrim`, `max`, `min`, `nullif`, `quote`, `replace`, `round`, `rtrim`,
    `substr`, `substring`, `trim`, `typeof`, `unhex`, `unicode`, `upper`, and
    the aggregates `avg`, `count`, `group_concat`, `max`, `min`, `sum`,
    `total`.
  - Not on it, so refused, among others: `random`, `randomblob`, `changes`,
    `last_insert_rowid`, `total_changes`, `sqlite_version`, `sqlite_source_id`,
    `printf`/`format` (format-dependent; a conservative false positive), every
    date/time function (`date`, `time`, `datetime`, `julianday`, `strftime`,
    `unixepoch`, `timediff`), and `current_timestamp`/`current_date`/`current_time`.
- **Date/time functions are refused entirely in Leg A, whatever their
  arguments** (0.5 item 2). This covers `datetime()` and `unixepoch()` (which
  assume 'now' when the time-value is omitted), a bound param `'now'` in any
  case, a column holding 'now', and the host-dependent `'localtime'`/`'utc'`
  modifiers. `NOW()`/`CURRENT_TIMESTAMP` reach the participant as
  `datetime('now')` (`pg-function-registry.js:88-94`, `:174-175`). Every other
  function passes through the registry unchanged (`:199-205`), which is why the
  census is an allow-list.
- **Implicit keys.** The table's primary key is read with `PRAGMA
  table_info(<table>)` on the leader's connection at staging; the partition
  already reads its schema this way (`partition-service-entry-apply-base.js:81`).
  That schema comes from initialization (`partition-service-table-bootstrap.js:146-190`)
  plus committed `MIGRATION_ALTER_TABLE` commands, and is the same on every
  replica. Because classification is leader-only, the classifier does not need
  to be a function of the committed bytes. An INSERT/REPLACE is refused when it
  has no column list, or its column list (the parenthesized identifiers after
  the target table) omits the primary-key column. If the table has no declared
  primary key, every INSERT is refused (the rowid would be implicit).
- **Answer.** A refusal is
  `participant_transaction_session_write_nondeterministic` and nothing is
  staged. W6n covers: `datetime('now')`, `DATETIME('NOW')`, `datetime()`,
  `unixepoch()`, `strftime('%s')`, `datetime(?)` with `'now'` and with `'NOW'`,
  `datetime('2020-01-01', ?)` with `'localtime'`, `random()`, `randomblob`,
  `sqlite_version()`, an implicit key, and a Buffer param (separate code). An
  allowed `upper(?)` stages.
- **Consequence.** With params restricted to JSON scalars (3.1) and only
  allow-listed functions, every staged operation is a deterministic function of
  the committed state on the leader's binary. The PREPARE dry run and the
  COMMIT execution compute identical results on every replica that runs the
  same SQLite semantics for the allow-listed functions. An allow-listed function
  whose semantics differ between SQLite versions is a classifier-owner defect,
  recorded under L4.
- **Results**: staged replies are `provisional: true`; the COMMIT answer
  carries `results` from the committed apply (W6).
- **Limit L7.** Transactions cannot use date/time or random functions, unknown
  functions, implicit keys or non-JSON params. Applications must supply such
  values as params.
- **Finding F-DET** (R17). Ordinary replicated writes still evaluate such
  functions per replica.

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
- **Population not aborted.** Single-partition statements without an explicit
  transaction are DIRECT_AUTOCOMMIT: they never reach the coordinator and are
  ordinary replicated writes (`:83-90`, `:120-121`). They never abort with
  `conflict`. They are delayed, though: while a PREPARED row exists on their
  partition they are parked up to their own 30 s deadline. Today a session
  defers them for up to 2 s (`USER_TRANSACTION_WRITE_DEFER_BUDGET_MS`,
  `partition-service-constants.js:56`). Under L3 they are refused at the
  deadline for as long as the reservation lasts (round-4 N5).
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

  The owner is the engine's statement-autocommit path. The unit spans
  `openWriteTransaction`, execute and `finishWriteTransaction` at three call
  sites (`sql-query-engine-write-execution.js:225-294`, `:392-462`,
  `:559-629`); `finishWriteTransaction` alone (`:159-176`) cannot re-execute.
  The retry:
  - fires only on a durable REFUSED `conflict`, never on UNKNOWN;
  - is bounded by the 60 s transaction budget (`timeout-budget.js:20`);
  - waits between attempts with the coordinator's participant backoff of 3
    retries at 10-250 ms (`distributed-transaction-protocol.js:714-718`,
    `distributed-transaction-coordinator-constants.js:38-42`).

  Whether this is a "retry framework" under the constraint
  `existing-owner-chain` is the query owner's seam-V decision (round-4 N6). Explicit
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

- `W` = writes durable state in the application transaction; `g+1` marks
  the only cells that advance the write generation (application data, AA);
  `-` = writes nothing.
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
| PREPARED | same: `sealed`; other: `already_active` (-) | `sealed` (-) | `sealed`: reads go sessionless (-) | req: PREPARED + digest from the row (-). apply duplicate: idempotent or `prepare_content_conflict` (-) | req: digest/text check else `decision_digest_mismatch` (-); propose. apply: recheck binding and `g` (digest of the current `g` equals the carried digest, else REFUSED `commit_base_moved` (W)); run operations, per-op outcomes, `UPDATE ... SET state='COMMITTED' WHERE state='PREPARED'`, `g+1`, applied index, one transaction (W); environmental -> host failure (-) | apply: `UPDATE ... SET state='ROLLED_BACK' WHERE state='PREPARED'` (W); a present, different digest: `decision_digest_mismatch` (-) | `decision_binding_required` (-) |
| COMMITTED | `terminal` (-) | `terminal` (-) | `terminal` (-) | `terminal` (-) | same digest: replayed, answered from per-op rows (-); other: `decision_conflict` (-) | `decision_conflict` (-) | `decision_conflict` (-) |
| ROLLED_BACK | `terminal` (-) | `terminal` (-) | `terminal` (-) | `terminal` (-) | `decision_conflict` (-) | same digest replayed; other `decision_conflict` (-) | `success`, durable not committed (-) |
| REFUSED | `terminal` (-) | `terminal` (-) | `terminal` (-) | `terminal` (-) | `not_prepared` (-), alarm | answered NOT_COMMITTED, REFUSED stays (-) | `success`, durable not committed (-) |
| TOMBSTONE | `terminal` (-) | `terminal` (-) | `terminal` (-) | apply: `terminal`, late PREPARE refused, no reservation (-) | `decision_conflict` (-) | replayed / `decision_conflict` (-) | `success` (-) |

| State | outcome read | hold sweep | restart | leader loss | ordinary write while reserved | mirror apply while reserved | foreign decision / tombstone / refused PREPARE while PREPARED |
| --- | --- | --- | --- | --- | --- | --- | --- |
| ABSENT | UNKNOWN, ABSENT (-) | n/a | n/a | n/a | not reserved: applies (W, `g+1`) | applies (W) | n/a (no reservation) |
| ACTIVE | UNKNOWN, ACTIVE (-) | past `PREPARED_HOLD_TIMEOUT_MS`: discarded on any role, no SQL; later requests `not_active` (-) | lost -> ABSENT | discarded by the demotion hook -> ABSENT | not reserved: applies (the transaction will refuse `conflict`) | applies | n/a (no reservation) |
| PREPARING | UNKNOWN (-) | not swept (the pending write owns its 30 s deadline) | lost; the proposal may still commit | released: UNKNOWN if proposed, `not_leader` if not | not reserved until the PREPARE applies | same | n/a (no reservation) |
| PREPARED | UNKNOWN, PREPARED, digest, prepare index/term (-) | reported only (`held_reported`), never terminalized (-) | row survives with its reservation | row unaffected | req: **parked** unproposed in the proposal queue under its own `PENDING_REQUEST_TIMEOUT_MS` deadline; re-admitted by the decision apply's post-commit effect; deadline -> `partition_write_commit_deadline_exceeded` (unproposed, retryable) (-). apply (a write proposed elsewhere, or raced): `reserved_refused`: no statement, no outcome row, `g` unchanged, applied index advances; the proposer (if it is this leader) re-parks it, and any other proposer is answered `partition_write_reserved`, retryable (-) | same as ordinary write; the mirror sender throws on a refusal (`partition-split-routing.js:241-245`, L1, unverified) | foreign bound ROLLBACK: that transaction's TOMBSTONE or ROLLED_BACK row (W, control, `g` unchanged); a foreign COMMIT cannot occur (it needs its own PREPARED row, which the reservation prevents) and would be `not_prepared` (-); a foreign PREPARE with a bad digest: REFUSED `digest_invalid` (W, control, `g` unchanged); this row and its reservation are unaffected, so its COMMIT applies (W17) |
| COMMITTED | COMMITTED (-) | n/a | survives | n/a | applies | applies | n/a (no reservation) |
| ROLLED_BACK | NOT_COMMITTED (-) | n/a | survives | n/a | applies | applies | n/a (no reservation) |
| REFUSED | NOT_COMMITTED + `refusalCause` (-) | n/a | survives | n/a | applies | applies | n/a (no reservation) |
| TOMBSTONE | NOT_COMMITTED (-) | n/a | survives | n/a | applies | applies | n/a (no reservation) |

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
5. increments `g` once (application data changed, AA).

Then `putAppliedState` runs (`:77-78`). Everything commits together or not at
all. The proposer's answer, the CDC events, the size update and the parked
writers' re-admission are afterCommit effects (`:95-97`). A throw inside rolls
everything back and rethrows (`:85-94`); the runtime makes it the group's host
failure (`raft-rs-runtime-owner.js:920-941`).

- W2a: a planted failure of the applied-state write leaves no row, no `txop:`
  outcome and the state PREPARED, with the applied index unchanged.
- W2b (V1, R4-3): records, from inside the applied-state write, the row
  count, the participant state, the `txop:` count and `g`: `[{rows:1,
  state:'COMMITTED', txop:1, generation:1}]`. An afterCommit write of any of
  them shows the old value.
- W2c (R4-3): an ordinary write's applied-state write sees its own increment
  of `g` (`[{rows:1, generation:2}]` after a warm-up write). On this head the
  probe's read of the absent table fails the apply: a new-surface red.

### 6.2 Typed failure edges and K restated

| Edge | Typed outcome | Fails closed | Caller observes |
| --- | --- | --- | --- |
| Nondeterministic operation at staging | `session_write_nondeterministic` (-) | yes | write refused, nothing staged |
| Unsupported parameter at staging | `session_write_param_unsupported` (-) | yes | write refused |
| Operation the staging classifier would refuse, inside a committed PREPARE | applied as carried; no apply-side classification (AB) | n/a | identical on every replica (W3c) |
| Deterministic failure at PREPARE dry run | REFUSED `statement_failed` (W), identical | yes | PREPARE refused; NOT_COMMITTED |
| `g` moved before PREPARE apply | REFUSED `conflict` (W) | yes | PREPARE refused |
| `g` digest differs from the carried digest at COMMIT apply (impossible on consistent replicas: control rows never move `g`, W17) | REFUSED `commit_base_moved` (W), identical, alarm | yes | COMMIT answered not committed; atomicity alarm |
| Deterministic failure at COMMIT apply (impossible under the classifier + reservation) | REFUSED `commit_statement_failed` (W), identical, alarm | yes | same |
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
  allow-listed deterministic operations (AB), against frozen committed state
  (the reservation, and `g`, which only application data moves). So a COMMIT-time failure is
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
- **The answer owner is the write kernel (decision AD; revision 5).** The
  kernel's answer builders own the fact "committed or may be committed":
  `unansweredWriteResult` (`partition-service-raft-write-commit.js:122-131`)
  and `buildPartitionWriteProposalRefusal` (`partition-write-kernel.js:390-414`).
  For every write, ordinary or transactional, they answer `{success:false,
  failureCode: partition_write_outcome_unknown, entryId}` for:
  - a proposed release at the deadline or on leader loss (already so,
    `partition-write-kernel.js:370-387`): W11a, W11b;
  - a rejection by the proposer's own committed apply with an environmental
    failure (`partition-committed-statement-outcome.js:297-300`; today a plain
    failure): W11e, W11e-ord;
  - a port refusal with outcome `HOST_FAILURE` (today
    `partition_write_consensus_host_failure`, `:392-397`): W11f, W11f-ord;
  - `CORE_FATAL`, already OUTCOME_UNKNOWN (`:410-413`; round-4 N3 corrected).

  The transaction owner consumes that typed code. Its answer adds `outcome:
  UNKNOWN` one-to-one for `partition_write_outcome_unknown` and classifies no
  causes itself. Answers that stay refusals are those proving that nothing
  entered the log, plus one committed non-mutating disposition:
  - `partition_write_not_leader` (unproposed);
  - `partition_write_backpressure`;
  - `partition_write_commit_deadline_exceeded` (unproposed);
  - `partition_write_consensus_refused` (the core refused the proposal);
  - `partition_write_service_shutdown` (unproposed);
  - the committed, non-mutating `reserved` PREPARE answer (round-4 N4).

  This kernel fix is landable on its own (0.5 item 4). The ordinary-write
  defect is finding F-ANS.
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
  parked writer through the same path, bounded by the proposal queue's
  `MAX_CAPACITY` of 1000 and its backpressure (`proposal-queue-constants.js:13`;
  round-4 N14). A writer already released is never proposed: re-admission goes
  through `proposeUnlessDeferred`, whose `markProposal` refuses an entry no
  longer pending (`partition-service-raft-write-commit.js:67-71`,
  `proposal-queue.js:118-124`; W7b, round-4 N1). A parked writer still
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

The partition image must also carry `_partition_write_generation`. This
obligation on the snapshot owner (SN1) is finding F-SNAP: no falsifier exists
until that owner builds a partition image. A checkpoint
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
    (`sql-query-engine.js:115-117`). Seam item, narrowed by AF: an explicit
    BEGIN or a multi-partition statement on an engine without a gateway is a
    typed refusal; DIRECT_AUTOCOMMIT is unchanged (S4b, 2.1).
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
| Nondeterministic, unknown or date/time functions and implicit keys in transactions (contract change, L7) | allowed (evaluated on the leader's connection) | refused `session_write_nondeterministic` at staging by the allow-list classifier; a committed PREPARE is applied as carried (W6n, W3c) |
| Multi-partition statements without an explicit transaction (contract change, L5) | statement-autocommit transactions whose concurrent writers wait behind `BEGIN IMMEDIATE` | may abort `conflict` under concurrent writes; retried as a whole statement by the engine's statement-autocommit owner within the 60 s transaction budget (3.6, W16) |
| application-database :687-725 | a failed COMMIT with `commitPointReached` true is `TRANSACTION_OUTCOME_UNKNOWN` | unchanged; seam S1 relies on it for the client answer after a COMMIT decision |

Added in revision 5 (round-4 R4-6; run on bb155b29f, each exit 0):

| Test or contract (file:line) | Assertions | Today | New meaning under revision 5 |
| --- | --- | --- | --- |
| transaction-support :107-120 | 50 | `new SQLQueryEngine({messageRouter, systemCache})` (no gateway, no CDC); `BEGIN TRANSACTION` succeeds and the row is silently unpersisted | an explicit BEGIN without a gateway is refused `TRANSACTION_STATE_PERSISTENCE_UNAVAILABLE`; the fixture must supply a gateway (or a stub with `supportsMutationSubmission`) to keep testing BEGIN |
| application-database (whole file; BEGIN through `db.transaction`) | 189 | transactions run on an engine with no gateway reference | same as above: the fixture supplies a persistence gateway; DIRECT_AUTOCOMMIT statements unchanged |
| postgres-wire-adapter.integration (BEGIN over pgwire) | 77 | BEGIN succeeds with no gateway reference | same as above |
| cross-partition-rejection.property | 8 | BEGIN on a gateway-less engine | same as above; its multi-partition statements are refused typed without a gateway |
| Seed-hydration engine (`seed-cache-hydration-phase.js:220-234`), production | n/a | constructed without a gateway or CDC; its coordinator goes to the migration owners, which never call `begin`/`commit` (grep over `src/migration/`) | an explicit BEGIN or a multi-partition statement on it becomes a typed refusal; whether any other caller does either is an open owner check (0.7) |
| Writes during PREPARED (contract change) | n/a | a write behind an open session is deferred within 2 s (`USER_TRANSACTION_WRITE_DEFER_BUDGET_MS`, `partition-service-constants.js:56`) and then answered deferRetry | parked up to its own `PENDING_REQUEST_TIMEOUT_MS` (30 s, `:26`) and then answered `partition_write_commit_deadline_exceeded` (retryable); under L3 refused at every deadline for as long as the reservation lasts |
| Ordinary-write answers (contract change, AD) | n/a | an environmental failure of the proposer's own committed apply, or a host failure while proposing, is answered as a failure | answered `partition_write_outcome_unknown` (W11e-ord, W11f-ord); every consumer that routes `OUTCOME_UNKNOWN` re-delivers only under the same entryId (`partition-write-kernel.js:124-127`) |

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
- F-ANS (revision 5, AD): an ordinary write whose own committed apply failed
  environmentally on the leader, or whose proposal hit a host failure, is
  answered as a failure although the entry is, or may be, in the log and
  re-applies after reconstruction (`partition-service-raft-write-commit.js:122-131`,
  `partition-write-kernel.js:390-397`). Witnessed by W11e-ord and W11f-ord (red
  through the existing mechanism). It is fixed in the write kernel, landable
  on its own.
- F-SNAP (revision 5): the snapshot owner (SN1) must carry
  `_partition_write_generation`, `_participant_transactions` and
  `_partition_statement_outcomes` in any partition image; the message-group
  scrub shape (`snapshot-checkpoint-store.js:339-357`) would drop them.

## 10. Witness ladder and receipts

### 10.1 The witnesses on bb155b29f

Runs, each with `node --test --test-reporter=tap <file>`:

| File | Exit | Tests | Fail | Pass |
| --- | --- | --- | --- | --- |
| participant file | 1 | 39 | 35 | 4 (controls) |
| seam file | 1 | 11 | 11 | 0 |
| replay-cursor sibling | 1 | 2 | 2 | 0 |

The output is in `evidence/red-v5-first-run.tap` (sha256 53b89283ff7f8ebc...);
the file hashes are in its header. A second run gave identical verdicts. Each red names its first
differing facts.

| Witness | Red on this head because (actual) |
| --- | --- |
| W1a | no `PARTICIPANT_PREPARE` proposed; PREPARE settled at once (LOCAL_STAGING); staged row visible (1) |
| W1b, W2a, W3a, W3b, W4, W9, W10b, W12a, W12c, W12e | revision-5 commands fail as `partition_committed_command_unrecognised`; outcome reads answer NOT_COMMITTED with no state |
| W2b | UNRECOGNISED; probe `[]` (expects `[{rows:1, state:'COMMITTED', txop:1, generation:1}]`) |
| W2c (new) | the warm-up write applies; the probed write's apply fails `SQLITE_ERROR` because the probe reads the absent `_partition_write_generation` (new surface); expects `[{rows:1, generation:2}]` |
| W3c (rewritten) | UNRECOGNISED on both replicas; expects COMMITTED with value `2020-01-01 00:00:00` on both (applied as carried) |
| W17 (new) | UNRECOGNISED for T1's PREPARE, the foreign TOMBSTONE, the `digest_invalid` PREPARE and T1's COMMIT; expects T1 COMMITTED (rows 1), T2 ROLLED_BACK, T3 REFUSED `digest_invalid`, on both replicas |
| W5a | `inTransaction` true; sessionless reader sees 1; the sessionless write fails `RAFT_RS_STORE_USER_TRANSACTION_OPEN`; `sessionSeesLaterCommit` 0 |
| W5b | the write is absorbed into the default session |
| W6 | `provisional` absent; no PREPARE proposed |
| W6n (extended) | all twelve classifier cases and the Buffer case are staged (`failureCode: null`); no PREPARE proposed |
| W7a | the write is proposed at once (1); the raced write applied and settled |
| W7b (extended) | proposed at once (1); the deadline answers `partition_write_outcome_unknown`; the later decision is UNRECOGNISED |
| W11a, W11b, W11e | no PREPARE proposed; immediate LOCAL_STAGING success |
| W11e-ord (new) | the proposer's own apply fails `partition_committed_statement_environment_failed`, and the answer is `{success:false}` with no `failureCode` (existing mechanism, F-ANS) |
| W11f | UNRECOGNISED PREPARE; the COMMIT answer has no `outcome` |
| W11f-ord (new) | `partition_write_consensus_host_failure` (existing mechanism, F-ANS) |
| W11c | the follower's refusal has no `failureCode` |
| W11d | the late write is proposed as an ordinary write and stays pending |
| W12b | absence answers NOT_COMMITTED |
| W12d | `inTransaction` true; the PREPARE apply is refused `USER_TRANSACTION_OPEN`; the swept session still stages |
| W13, W14 | the intervening write fails under the open session; the PREPARE succeeds |
| W15 | no PREPARE proposed |
| W16 | untyped answers (LOCAL_STAGING successes) |
| seam W10a | both coordinators mint `tx-default-1000-1` |
| seam W10c (narrowed) | collision: one attempt, BEGIN throws; other error: BEGIN throws without the insert-once option |
| seam S1 | rollback `['p1','p2']`; transaction ended |
| seam S2 | COMMITTED with 0 outcome reads |
| seam S3 | FAILED; 1 re-prepare |
| seam S4a | no commit; still active |
| seam S4b (narrowed) | an explicit BEGIN on a gateway-less engine succeeds (`success: true`) |
| seam S5 | the request carries no identity |
| seam S6 | no retained digest, index or term |
| seam S7 | `['commit']` |
| seam S8 | no decision recorded |
| RC1, RC2 | as in revision 4: `dup-a` mirrored; setup `HOST_FAILURE: committed-command-unknown` |
| controls 1-4 | green |

Lint and ratchets:

- `npx eslint` passes on all five touched JS files.
- The participant file is 991 lines (within jscpd's cap). Duplication is
  measured in 10.4.
- The seam file and the fixture are new or changed and are scanned.

### 10.2 Receipts (eight sealed ids unchanged; exact counts per file)

| Receipt | Kind | Participant file | Seam file | Real file (absent) | Stays red until |
| --- | --- | --- | --- | --- | --- |
| no-speculative-visibility-before-consensus | subtest | W1a, W5a, W5b (3) | - | - | participant cutover |
| replicated-prepare-committed-and-applied-on-every-replica | shell | W1a, W1b, W12c, W11a, W11b, W11c, W11d, W11e, W15 (9) | - | A1, A2, A3 (3) | cutover and A1-A3 |
| commit-applies-operations-outcome-and-applied-index-atomically | shell | W1b, W2a, W2b, W2c, W3a, W3b, W3c, W4, W6, W6n, W13, W14, W17 (13) | - | A5 (1) | cutover and A5 |
| duplicate-and-conflicting-decisions-idempotent-or-refused | shell | W9, W12a, W12e, W10b (4) | W10a, W10c, S5 (3) | A4 (1) | both lanes and A4 |
| exact-participant-outcome-no-transaction-is-not-committed | shell | W12b, W1b, W11f, W11e-ord, W11f-ord (5) | S2 (1) | - | both lanes, plus the kernel fix |
| immutable-coordinator-decision-before-fanout | subtest | - | S1, S4b, S6, S7, S8 (5) | - | query lane |
| no-rollback-after-commit-decision-and-no-prepared-erasure | shell | W9, W12d, W17 (3) | S1, S3, S4a (3) | - | both lanes |
| recovery-and-cdc-survive-deadline-and-crash | absent | - | - | - | a CDC cursor/retention owner, or a seal supersession |

**Shell receipts.** For each file, the receipt runs `out=$(env -u
NODE_TEST_CONTEXT node --test-reporter=tap --test-name-pattern='^<prefix>
(<names>): .*$' <file> 2>&1)`. It then requires the lines `# tests N`,
`# fail 0`, `# skipped 0` and `# todo 0`. Parts are chained with `&&`. The
prefixes are:

- `TX1 v3` for the participant file;
- `TX1 seam` for the seam file;
- `TX1` for the real file, so the patterns read `^TX1 (A1|A2|A3): .*$` etc.

A placeholder file cannot pass: each named A test must exist and pass. Every
subset was counted on this head and selects exactly its declared number
(3/9/13/4+3/5+1/5/3+3). The exact-count snippet was validated against the green
controls in revision 4: 4 passes, 3 fails.

**The real three-replica witnesses (decision AE).** They are named now in
`test/raft/raft-rs-backend/transaction-leg-a-three-replica.test.js`, which is
still absent:

| Test name | Covers |
| --- | --- |
| `TX1 A1: a PREPARE on a three-replica rs-raft group is PREPARED with the same identity and digest on every replica` | PREPARE replication |
| `TX1 A2: after a leader change following PREPARE the new leader applies the COMMIT and the rows appear exactly once on every replica` | leader change |
| `TX1 A3: a replica restarted after PREPARE reaches the decided terminal state for both a COMMIT and a ROLLBACK decision` | restart |
| `TX1 A4: replayed COMMIT and ROLLBACK deliveries apply nothing twice, emit no duplicate CDC and never reverse the outcome` | duplicate decisions |
| `TX1 A5: a crash and restart after the PREPARE commit, after the coordinator decision and during decision fanout reach one terminal state on every replica` | crash boundaries |

**Producer and receipt file.**

- `node scripts/quest-evidence/replicated-transaction-decision-and-apply.js
  --output <scratch>` exits 1, with 0/7 passing.
- `testFileDigests` record the participant file and the seam file. The fixture
  and the sibling are not recorded, which is a harness owner limit (round-4 N2).
- The tracked `evidence/receipt.json` is regenerated by the lead at commit;
  f9bcfe493 did so for revision 4.
- Not bound to any sealed receipt, held only by the landing gate (round-4
  N13): W7a, W7b, W16, RC1 and RC2.

### 10.3 Not expressible yet

- A transaction commit reaching a split target, and the mirror sender's handling
  of a reserved refusal. Both are Leg B. They stay red; the sender's behaviour
  is unverified.
- CDC exactly-once across a crash after the data commit. No durable cursor owner
  exists.
- PR100 A1-A5 on real rs-raft. They are named and bound (10.2).

### 10.4 Duplication

- `npm run -s test:duplication` exits 1 at the same counts as before this
  revision: 698/697 groups and 26410/26369 lines. That red predates this
  revision.
- All four TX1 files are scanned, with 0 clone groups each: the participant
  file (now within jscpd's 1000-line cap, round-4 N8 closed), the seam file,
  the sibling and the fixture.

## 11. What remains for the query owner; the single cutover change set

### 11.1 Seam items (falsifiers in the seam file; seam record revision-5 section)

| Item | Seam obligation | Falsifier |
| --- | --- | --- |
| A | identity on every request and answer; delivery key `{transactionId, partitionId, operation}` | S5 |
| B/S | 128-bit random id; insert-once `sql_transactions` row before fanout, with no coalescing key; re-mint only on the primary-key collision class | W10a, W10c |
| C | insert-once decision record before any fanout; every rollback path inserts ROLLBACK first | S1, S8 |
| C' | after the decision, the client answer is in doubt (`commitPointReached: true` -> `TRANSACTION_OUTCOME_UNKNOWN`) | S1 |
| D | outcome reads by identity; NOT_COMMITTED only from the participant's row | S2 |
| E | PREPARE answers retained before deciding | S6 |
| F | 1PC choice (option A falsifier pinned) | S7 |
| G | concurrent recovery converges on one decision | S8 |
| U | COMMITTING never becomes FAILED; recovery completes decided FAILED rows | S3, S4a |
| S4b (AF) | without a gateway, an explicit BEGIN and a multi-partition statement are refused typed; DIRECT_AUTOCOMMIT is unchanged | S4b |
| V | statement-autocommit retry of a durable `conflict` across the three call sites, within the 60 s budget | W16 (measurement); a retry witness lands with the query lane |
| T/AD | the kernel answers UNKNOWN for may-be-committed writes; the coordinator treats UNKNOWN as pending | W11e, W11f, W11e-ord, W11f-ord |
| H | register the coupled pair in `test/shards/impact-contracts.json` | gate |

### 11.2 1PC

This is unchanged from revision 4:

- **Option A, prepare-first (recommended):**
  - supersedes `test/query/distributed-transaction-coordinator.test.js:646-673`
    and `architecture/images-distributed-public-seam.md:102`;
  - deletes `COMMIT_MODE.ONE_PHASE_COMMIT`, which changes three fixtures (9.2);
  - falsifier: S7.
- **Option B:**
  - needs a quest supersession;
  - relies on the AD kernel mapping, so that a committed command is never
    answered as failed.

### 11.3 The single cutover change set (lands together)

The participant lane changes the files listed in revision 4, section 11.3,
plus `src/partition/partition-transaction-determinism.js` (the EXPLAIN
allow-list classifier). In the write kernel (`partition-write-kernel.js`,
`partition-service-raft-write-commit.js`), the AD mapping can land earlier on
its own.

The query lane changes the coordinator identity, the insert-once rows, the
decision record, the protocol, recovery, the engine wire, the narrowed S4b and
the statement-autocommit retry.

**Landing gate**, in order:

1. all three witness files are green, except receipts that are still red by
   design;
2. the superseded tests (sections 9.2 and 9.2-rev-5) are rewritten;
3. the shard census is regenerated for the new seam file and the earlier new
   files;
4. independent source verification;
5. the real three-replica A1-A5.

**Upgrade precondition (L6):** no in-flight transaction at cutover.

**Limits:**

- L1: no transaction mirroring.
- L2: CDC is not durable.
- L3: the reservation is unbounded without a recovering engine, and
  single-partition writers are refused at each 30 s deadline meanwhile.
- L4: local divergence, and allow-listed function semantics differing across
  SQLite versions.
- L5: partition-granular conflicts, as an R12 exposure awaiting owner
  acceptance.
- L6: the upgrade drain.
- L7: no date/time, random or unknown functions, no implicit keys and no
  non-JSON params in transactions.
- L8: decision binding is self-certifying.
