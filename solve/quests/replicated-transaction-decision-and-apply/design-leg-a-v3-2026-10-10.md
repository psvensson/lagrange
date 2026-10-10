---
audience: development
documentClass: planning
---

# TX1 Leg A design, revision 3 (2026-10-10)

Quest `replicated-transaction-decision-and-apply` (sealed df51b799a). Supersedes
[revision 2](design-leg-a-v2-2026-10-10.md), rejected by the round-2 design vet
(REVISE, 19 blockers, recorded in `log.ndjson` at 11:40:23). Revision 1 and
revision 2 stay as history. Built on the lead decisions A-P of the revision-3
brief; where the evidence forced a refinement it is named in section 0.3.

Citations are `file:line` verified on this checkout. The worktree HEAD moved
from cfce28ad0 to 045c9130e during authoring (e005749ce records the round-2 vet
in the quest log; 045c9130e is a FreshMG rebalancer change). `git diff
cfce28ad0..045c9130e` touches none of `src/partition`, `src/raft`, `src/query`,
`src/bootstrap`, `src/constants`, `src/control-plane`, `src/workflow` or
`test/test-helpers`, so every citation holds on both heads.

The witnesses are
[`test/partition/partition-transaction-replicated-apply-v3.test.js`](../../../test/partition/partition-transaction-replicated-apply-v3.test.js);
their first run is `evidence/red-v3-first-run.tap` (25 red, 4 controls green).

## 0. Dispositions

### 0.1 Plain statement of the landing rule (lead decision A)

There is ONE protocol and ONE cutover change set. It spans the coordinator
(query lane) and the participant (this lane) and lands as one unit, under the
query owner's agreement of the seam in
[`seam-2026-10-10.md`](seam-2026-10-10.md) (revision-3 section). No landed head
keeps a legacy acceptance path, and no landed head breaks a current
transaction. Consequently **no participant source lands before the seam is
agreed**. Until then this lane's deliverables are exactly: this design, the
witness file and its red output, and the supersession inventory (section 9).

### 0.2 The 19 round-2 blockers

| # | Blocker (round 2) | Revision-3 disposition | Section | Witness |
| --- | --- | --- | --- | --- |
| B1 | P1/P2/P3 use the legacy session-only shape and are greened by revision 1 | Witnesses rewritten on the v3 protocol: `transactionId`, a committed `PARTICIPANT_PREPARE` awaited until applied, a bound `PARTICIPANT_DECISION` with no operations, follower apply. Revision 1 proposes neither command, so it greens none. The v2 file is kept unchanged as history. | 2, 10 | W1a, W1b |
| B2 | Atomicity receipt greenable by an afterCommit shortcut | Two witnesses inside the application transaction: a planted failure of the applied-state write after the operations (W2a) and an ordering probe that observes the rows at the applied-state write (W2b); an afterCommit shortcut fails W2b with `[0]`. | 6 | W2a, W2b |
| B3 | P3 records divergence as success | W3a makes the failure identical on two replicas and compares them. W3b is the separate host-failure witness (single-replica storage failure: nothing recorded, applied index unchanged, re-applied after recovery). Logical divergence that raises a deterministic SQLite code on one replica only is not detectable by any owner today (same class as ordinary writes, `partition-committed-statement-outcome.js:180-187`); listed limit L4. | 6 | W3a, W3b |
| B4 | Deterministic COMMIT failure reachable after a global COMMIT | PREPARE apply recomputes the validation base from committed state AND dry-runs the operations in a nested savepoint on every replica; the reservation then freezes committed state until the decision. A residual identical failure at COMMIT is settled REFUSED-with-cause per lead decision K (alarm); an environmental failure is the host failure. | 3, 6 | W3a, W4 |
| B5 | Documented epoch snapshot isolation dropped silently | Superseded explicitly (section 3.4 lists the seven documents and the tests); `applySnapshotReadFilter`, `isSnapshotExpired`, `checkWriteConflicts`, `rowCommitEpoch`, `committedWriteLog` are deleted in the change set (R11). | 3 | W5a |
| B6 | Deterministic results unanswered | Inherit the ordinary-write class exactly (SQL text + params replicated, evaluated per replica at apply, the proposer's own apply answers). Staged replies are marked `provisional`; COMMIT answers carry per-operation `results` from the committed apply. | 3.3 | W6, control 4 |
| B7 | REFUSED_RESERVED settles the entryId | Non-settling disposition: no committed-statement outcome row, no state change, applied index advances, proposer answered `partition_write_reserved` with `deferRetry`; a leader precheck answers the same without proposing. The retried entryId finds UNSETTLED and applies. | 4, 5 | W7 |
| B8 | Mirror claim false, citation missing | Corrected: mirroring is a proposer-side effect (section 8.1). Leg A states plainly that transactions are not mirrored (limit L1), adds a leader admission fence, and makes the durable replay cursor skip entries without an APPLIED outcome row. The barrier is Leg B. | 8.1 | not expressible on the port (section 10.3) |
| B9 | Terminal commands not bound to decision or digest | `PARTICIPANT_DECISION` carries `{decision, preparedDigest, decisionText, decisionDigest}`; the participant verifies `sha256(decisionText)`, its own entry in it, and the prepared digest. An unbound ROLLBACK is refused against PREPARED. Coordinator obligations in the seam. | 2.4, 4 | W9, seam S1 |
| B10 | `transactionId` not unique, delivery key omitted | `transactionId = nodeId/bootIncarnation/sequence` (durable monotonic boot incarnation, no clock); delivery key `{transactionId, partitionId, operation}`; row key `(transaction_id, participant_id)`. Seam items. | 2.1 | W10a, W10b |
| B11 | Two tables, overwriting UPSERT | One table `_participant_transactions` replaces `_transaction_outcomes`; INSERT-once rows and conditional `UPDATE ... WHERE state = 'PREPARED'`; no `Date.now()` column. | 5 | W12b |
| B12 | No transition table; forked vocabulary | Full state x command table (section 4); every state maps onto `{COMMITTED, NOT_COMMITTED, UNKNOWN}` (section 5.2). | 4, 5 | W12a, W12b |
| B13 | Await mechanism unspecified | PREPARE and decision commands go through `startPartitionRaftWriteCommit` / `waitForCommittedWrite` with deterministic entryIds; deadline and leader loss answer UNKNOWN when proposed; non-leader answers NOT_LEADER; a write during PREPARING is refused. | 7 | W11a-d |
| B14 | Increment breaks current transactions or keeps a second path | Decision A (0.1): one cutover change set across both lanes; nothing lands before the seam is agreed. 1PC: section 11.2 lists what each option supersedes, including the coordinator's sealed "one phase must not prepare". | 11 | (gate, not a test) |
| B15 | Silent supersessions | 25 files run on this head (24 green with 1,016 assertions; the v2 witness file red as recorded, 2 of 5 tests passing); every assertion whose meaning changes is listed with its new meaning. | 9 | inventory |
| B16 | c' isolation has no witness | W5a (no SQLite transaction between requests, no other reader sees staging, session reads its own write, sessionless write applies) and W5b (no default-session absorption). | 3.1 | W5a, W5b |
| B17 | Recovery/checkpoint authority misdescribed | Corrected: rs-raft partitions own no checkpoint today; the legacy gate is off the rs-raft path; PREPARED rows are application state and ride in any future partition image without a gate. `reconstructPreparedState` is deleted. | 8.2 | W12c |
| B18 | Wrong citations | Re-verified; the four named errors are corrected in section 1 (owner of applied-index atomicity, budget constant, entry builder key order, mirror lines). | 1 | n/a |
| B19 | Reservation unbounded; invented channel | The participant never calls the coordinator; the hold sweep only reports. Bound = transaction budget + recovery sweep while any SQL engine runs recovery; otherwise unbounded write refusal on that partition, stated as R12 exposure. | 8.4 | W12d |

### 0.3 Lead decisions refined by evidence (not silently changed)

1. **Decision D, write-set key granularity.** Session writes reach the
   participant only as raw SQL (`QUERY` type, `partition-service-write-metrics-base.js:100-118`,
   via `handleRemoteQuery` `partition-service-entry-apply-base.js:749-758`). The
   only key resolver, `resolveTransactionWriteSetKey`
   (`partition-service-transaction-base.js:195-222`, falling back to
   `extractRoutingKeyFromSql` `partition-split-routing.js:102-131`), parses one
   primary-key value from the statement text and cannot prove the statement
   touches only that row (`WHERE id = ? OR value = ?`). A per-row base built
   from it under-approximates the write set and lets a lost update through. So
   the validation list keeps decision D's exact shape (per write-set key, a base
   digest read from committed state, recomputed by every replica at apply,
   refused on any difference) but Leg A's only key is the partition itself, and
   its base is the partition commit generation read at BEGIN (section 3.2).
   Per-row keys are a later refinement that needs an exact write-set capture
   owner; nothing in Leg A depends on it.
2. **Decision B, row key.** The row key is `(transaction_id, participant_id)`
   with `transaction_id` leading, and every lookup is by `transactionId` plus
   this partition's `participantId`. The participant id embeds the partition,
   so two merge sources' rows for one transaction can never collide (round-2
   B10).
3. **Decision K, divergence.** Honoured as written: an identical deterministic
   failure at COMMIT is settled REFUSED-with-cause on every replica; a
   single-replica environmental failure is the host failure. A replica whose
   state silently diverged and which raises a deterministic code is
   indistinguishable, locally, from the identical case; that is limit L4, the
   same class as ordinary writes today.
4. **1PC (not decided by A-P).** Left to the query owner (section 11.2); the
   design recommends prepare-first because it changes no participant semantics.

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
- Boot incarnation owner: `reserveBootIncarnation`
  `src/bootstrap/boot-incarnation-owner.js:196` (contract `:13-41`), held at
  startup `src/lagrange-runtime-startup.js:107`.
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

Surfaces this design must create (no citation exists): the two committed
command types, `_participant_transactions`, the partition commit generation
read, the `partition_write_reserved` refusal, the participant answer fields,
the coordinator decision record, `nodeId`/`bootIncarnation` on the coordinator.

## 2. Protocol and identity

### 2.1 Identity (lead decision B)

- `transactionId = ${nodeId}/${bootIncarnation}/${sequence}`, minted by the
  coordinator's `createTransactionId`. `bootIncarnation` is the durable,
  monotonic, never-reissued value of `reserveBootIncarnation`
  (`boot-incarnation-owner.js:13-24`, `:196`), already held at runtime start
  (`lagrange-runtime-startup.js:107`) and passed to the coordinator at
  construction (seam). `sequence` is the coordinator's in-process counter
  (`transactionIdSequence`, `distributed-transaction-coordinator.js:115`)
  restarting at 1 per incarnation: a crash burns the incarnation, so no
  `(nodeId, incarnation, sequence)` is ever reissued. No clock participates.
  The id is persisted as `sql_transactions.transaction_id`
  (`system-table-workflow-schema-definitions.js:17`) by `registerWorkflow`
  inside `begin` (`distributed-transaction-coordinator.js:261`) before any
  participant BEGIN (`:331`). Uniqueness additionally rests on `nodeId` being
  unique per data directory (the node identity owner's invariant).
- `participantId = ${transactionId}:${partitionId}`
  (`distributed-transaction-records.js:101-103`). The participant refuses any
  request or command whose `participantId` is not exactly that with its own
  `partitionId` (`participant_transaction_identity_mismatch`), and any request
  missing one of `transactionId`, `participantId`, `commitMode`,
  `transactionEpoch` (`participant_transaction_identity_required`).
- `commitMode` is `NOT_SELECTED` on BEGIN and session writes (the coordinator
  selects only after freezing, `distributed-transaction-commit-mode.js:29-40`)
  and the selected mode on PREPARE, decision and outcome requests. A decision
  whose mode differs from the PREPARED row's is an identity mismatch.
- `transactionEpoch` is carried and pinned: every request for one
  `transactionId` must repeat the epoch recorded at BEGIN, else identity
  mismatch. It has no isolation meaning any more (section 3.4).
- `sessionId` is routing context only. The delivery identity becomes
  `{transactionId, partitionId, operation}` (replacing `sessionId` at
  `sql-query-engine.js:66-96`, seam item).

Identity anchoring when it moves: a leader change discards volatile sessions
(section 7); the durable row is keyed by the identity, so a COMMIT reaching a
new leader finds the same row. A new incarnation of the coordinator node never
re-mints an id the old one used.

### 2.2 Requests (the participant's wire)

`TRANSACTION` messages (`PARTITION_SERVICE_MESSAGE_TYPE.TRANSACTION`) with
`operation` in `{BEGIN_TRANSACTION, PREPARE_TRANSACTION, COMMIT, ROLLBACK,
TRANSACTION_OUTCOME}` and the identity fields; session reads and writes are
`QUERY` messages carrying the same identity. COMMIT and bound ROLLBACK add
`{decision, preparedDigest, decisionText, decisionDigest}`; an unbound ROLLBACK
omits them. Every answer carries `{success, operation, partitionId,
transactionId, participantId, state, outcome}` plus, where relevant,
`failureCode`, `deferRetry`, `preparedDigest`, `prepareIndex`, `prepareTerm`,
`decisionIndex`, `decisionTerm`, `refusalCause`, `results`, `provisional`.

### 2.3 Committed commands (pinned bytes)

Two new committed command types replace the three legacy markers in
`PARTITION_COMMITTED_MARKER_COMMAND_TYPES` (`partition-service-constants.js:182-186`):

- `PARTICIPANT_PREPARE`: `{type, entryId, sessionId, transactionId,
  participantId, commitMode, transactionEpoch, operationsText, validationText,
  preparedDigest, timestamp, proposedBy, proposedAt}`.
  - `operationsText` = the leader's `JSON.stringify` of the staged operations
    `[{entryId, sql, params}]`, each exactly the client's statement and params.
  - `validationText` = `JSON.stringify([["partition", partitionId,
    sha256("generation:" + (g ?? "none"))]])`, with `g` the base of section 3.2.
  - `preparedDigest = sha256(operationsText + "\n" + validationText)`.
  The texts are carried as strings, so every replica digests the committed
  bytes, never a re-encoded object (JSON string round trip is lossless; integer
  keys and code-version skew cannot change them).
- `PARTICIPANT_DECISION`: `{type, entryId, sessionId, transactionId,
  participantId, commitMode, transactionEpoch, decision, preparedDigest,
  decisionText, decisionDigest, timestamp, proposedBy, proposedAt}`, with
  `decisionText` the coordinator's immutable record text
  `JSON.stringify({transactionId, decision, participants: [[participantId,
  preparedDigest|null], ...]})` (sorted by participant) and `decisionDigest =
  sha256(decisionText)`. It carries no operations.
- Deterministic entryIds: `${participantId}:prepare` and
  `${participantId}:decision:${decisionDigest}`, so a retried request joins the
  pending outcome (`partition-service-write-metrics-base.js:672-676`) instead
  of tripping the queue's duplicate refusal (`proposal-queue.js:96-99`).
- Per-operation outcomes are recorded under `txop:${participantId}:${ordinal}`,
  never under `entry:${entryId}`, so a transaction operation and a later
  ordinary write with the same client entryId cannot answer for each other
  (round-2 entryId collision; W12e).
- The legacy `TRANSACTION_COMMIT`, `PREPARE_TRANSACTION` and `ROLLBACK`
  committed types are removed: a legacy marker reaching apply fails closed as
  UNRECOGNISED (`partition-service-entry-apply-base.js:989-1002`). That is the
  no-legacy-acceptance rule; the upgrade precondition is in section 11.3.

### 2.4 Decision binding (lead decision C)

A decision applies only if: `sha256(decisionText) === decisionDigest`;
`decisionText` names this `transactionId`, the same `decision`, and an entry
for this `participantId`; for COMMIT, that entry's digest and the command's
`preparedDigest` both equal the PREPARED row's `prepared_digest`. Otherwise it
is refused with `participant_transaction_decision_digest_mismatch`, nothing
written. For ROLLBACK the entry's digest may be null (the coordinator may
decide without having seen the PREPARE answer) but if present must match.

An **unbound ROLLBACK** (no `decisionDigest`) is a request-level action only,
never a committed command: it discards a volatile ACTIVE session, and is
refused against PREPARED (`participant_transaction_decision_binding_required`)
because the participant cannot know whether a COMMIT decision exists. That is
the participant-side half of preventing `abortTimedOutTransaction`
(`distributed-transaction-protocol.js:258-275`) from rolling back a PREPARED
participant; the coordinator half (insert-once decision before any rollback
fanout) is seam item C with falsifier S1 (executable in the witness file, red).

## 3. Isolation and the conflict rule

### 3.1 Staging under F6 c' (no SQLite transaction across requests)

- BEGIN creates a volatile session `{identity, sessionId, operations[],
  generationBase, bytes, startedAt, phase}` on the leader. No SQLite statement
  runs (W5a: `db.inTransaction` stays false; today it is true).
- A session write: admit (`admitCommittedCommand`, WRITE_PATH), then validate
  synchronously in ONE `db.transaction(fn)()` whose `fn` replays the staged
  operations decoded from their JSON text (so binding behaves exactly as at
  apply), runs the new statement, captures `{changes, lastInsertRowid}`, and
  throws a private sentinel. better-sqlite3 rolls the transaction back on any
  throw (`node_modules/better-sqlite3/lib/methods/transaction.js:52-77`),
  including a mid-iteration throw of `collectBoundedSqliteRows`; nothing awaits
  inside. On success the operation is appended and the reply is
  `{success, provisional: true, changes, lastInsertRowid}`. A deterministic
  failure of the new statement is `statement_failed` (not staged, session
  continues). A failure of an earlier operation on replay is
  `participant_transaction_replay_diverged` and dooms the session.
- A session read: the same synchronous replay + bounded read + sentinel
  rollback; only the rows leave.
- Bounds: `operations.length` and encoded bytes are capped by new owned
  constants in `partition-service-constants.js` (proposed 256 operations, 1
  MiB); each replay checks elapsed time after every statement against a work
  bound (proposed 50 ms). Exceeding any is
  `participant_transaction_replay_budget_exceeded`. A single long statement
  cannot be interrupted (same as an ordinary write's apply).
- Observer scope: between requests the connection is in autocommit, so no
  other session, sessionless reader, independent connection or consensus write
  sees or is erased by staging, and `persistenceAdmission`
  (`raft-rs-durable-store.js:358-362`) never defers consensus because of a
  session. Read-your-writes holds inside the owning session (by replay).
- Default-session absorption is deleted: a request without `transactionId` is
  never a session request (`transaction-session-methods.js:37-39` removed; W5b).
- Leg A keeps the existing admission of one non-terminal transaction per
  partition (`transaction-base.js:598-603`, plus "any PREPARED row"); multiple
  concurrent sessions are a later refinement.

### 3.2 First-committer-wins at PREPARE apply, from committed state only (decision D)

- **Commit generation** `g` = `SELECT MAX(log_index) FROM
  _partition_statement_outcomes WHERE outcome = 'applied'` (new index on
  `(outcome, log_index)`). Every committed change to application rows writes
  an APPLIED outcome row at its own log index (ordinary SQL commands
  `partition-service-entry-apply-base.js:1040-1046`, migrations, mirror
  applies, and in v3 each transaction operation), so `g` changes exactly when
  committed application state changes, and it is replicated state (identical on
  every replica at the same applied index). Markers, refusals and failed
  statements do not move it. The only unreplicated writer,
  `executeLocalQuery` (`partition-service-write-metrics-base.js:133-185`,
  bootstrap-only), is outside the replicated state by definition.
- The session records `generationBase = g` at BEGIN (on a lagging leader this
  is an older value, which only causes a conservative refusal).
- PREPARE request (leader, advisory): replay all operations once more on
  current committed state; if `g !== generationBase` answer
  `PREPARE refused, refusalCause: conflict` without proposing (no row; the
  coordinator must still terminate with a bound ROLLBACK).
- PREPARE apply (authority, every replica): recompute `g` from this replica's
  committed state and compare its digest with `validationText`; on difference
  write a REFUSED row with `refusal_cause = conflict`. Then dry-run the
  operations in a nested `db.transaction` that throws a sentinel; a
  deterministic failure writes REFUSED with `refusal_cause =
  statement_failed`; an environmental failure is rethrown (host failure,
  nothing recorded). Only then INSERT the PREPARED row.
- The reservation (section 4) starts at the PREPARED row and blocks every other
  committed write until the decision applies, so between PREPARE apply and
  COMMIT apply `g` and every row the operations read are frozen: the COMMIT
  re-executes exactly the dry run.

Consequence: a transaction commits only if its partition applied no committed
write between its BEGIN and its PREPARE. Every read it made (committed state
plus its own staged operations) therefore saw one committed prefix. Abort
granularity is the partition (limit L5).

### 3.3 Deterministic results (decision I)

Transaction operations are the SAME class as ordinary replicated writes: SQL
text and params are replicated (`operationsText`), evaluated by each replica at
apply, and the proposer's own apply answers. Implicit rowid is deterministic
given identical committed state; `datetime('now')` (from `NOW()`,
`pg-function-registry.js:88-94`) and `random()` are evaluated per replica, as
they are for ordinary writes today. Staged replies are marked `provisional:
true`; the COMMIT answer carries `results: [{ordinal, changes,
lastInsertRowid}]` from the committed apply (retained on the per-operation
outcome rows for replay). Witness W6 proves parity, not a stronger promise;
control 4 pins the ordinary-write half on this head.

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
| `generationBase` | none (fixed at BEGIN) | older than committed state | only causes a refusal; authority is recomputed at apply |
| Leader prechecks (reservation, terminal row, digest) | the next apply | may refuse a write the apply would admit (deferRetry), or propose a decision the apply refuses | prechecks only refuse or answer from immutable terminal rows; apply decides |
| Pending outcome map | settle of the outcome promise `cdc-stream-base.js:369-374` | none | joins retries of one entryId only |

## 4. State x command transition table (decision G)

Legend. `W` = writes durable state in the application transaction; `-` =
writes nothing. "req" is the leader's request handling (before any proposal);
"apply" is the committed command's application on every replica. Codes are
`participant_transaction_*` unless prefixed `partition_write_*`. Reserved =
some PREPARED row exists on the partition. Absent identity fields or a
mismatching `participantId`/epoch answer `identity_required` /
`identity_mismatch` in every cell (-).

| State | BEGIN | write | PREPARE | COMMIT (bound) | ROLLBACK (bound) | ROLLBACK (unbound) |
| --- | --- | --- | --- | --- | --- | --- |
| ABSENT | req: fences (removal, topology, `already_active` if another non-terminal) -> ACTIVE, base `g` read (-) | `not_active` (-) | req: `not_leader` on a non-leader; else `not_active`, outcome UNKNOWN (-). apply: validate -> PREPARED (W) or REFUSED+cause (W); another PREPARED -> `reserved` deferRetry, non-settling (-) | req: propose (a lagging leader may not have applied the PREPARE). apply: `not_prepared` (-), alarm | req: propose. apply: TOMBSTONE row (W) | `success`, `durable: false` (-) |
| ACTIVE (volatile) | same identity: idempotent; other: `already_active` (-) | c' validate: STAGED provisional / `statement_failed` / `replay_diverged` (doomed) / `replay_budget_exceeded` (-) | req: replay; `g` moved -> refused `conflict`, no proposal (-); else seal -> PREPARING, propose PREPARE | `not_prepared` (-) | discard session; propose; apply TOMBSTONE (W) | discard session, `durable: false` (-) |
| PREPARING (volatile, proposer only) | same: answer PREPARING; other: `already_active` (-) | `preparing` (-) | join the pending outcome (same entryId) (-) | `preparing`, deferRetry (-) | propose; apply after the PREPARE: ROLLED_BACK (W); before it: TOMBSTONE (W) | `preparing`, deferRetry (-) |
| PREPARED | same: `sealed`; other: `already_active` (-) | `sealed` (-) | req: answer PREPARED + digest from the row (-). apply duplicate: same digest idempotent (-); other digest `prepare_content_conflict` (-) | req: digest/text check else `decision_digest_mismatch` (-); propose. apply: recheck binding and `g`; run operations, per-op outcomes, `UPDATE ... SET state='COMMITTED' WHERE state='PREPARED'`, applied index, one transaction (W); identical deterministic failure -> REFUSED `commit_statement_failed` (W, alarm); environmental -> host failure (-) | apply: `UPDATE ... SET state='ROLLED_BACK' WHERE state='PREPARED'` (W); digest present and different: `decision_digest_mismatch` (-) | `decision_binding_required` (-) |
| COMMITTED | `terminal` (-) | `terminal` (-) | req/apply: `terminal`, state COMMITTED (-) | same digest: replayed, answer from per-op rows (-); other: `decision_conflict` (-) | `decision_conflict` (reversal refused) (-) | `decision_conflict` (-) |
| ROLLED_BACK | `terminal` (-) | `terminal` (-) | `terminal` (-) | `decision_conflict` (-) | same digest replayed; other `decision_conflict` (-) | `success`, durable not committed (-) |
| REFUSED | `terminal` (-) | `terminal` (-) | `terminal` (-) | `not_prepared` (-), alarm | answered NOT_COMMITTED, state stays REFUSED (-) | `success`, durable not committed (-) |
| TOMBSTONE (ROLLED_BACK, never prepared) | `terminal` (-) | `terminal` (-) | apply: `terminal`, late PREPARE refused, no reservation (-) | `decision_conflict` (-) | replayed / `decision_conflict` (-) | `success` (-) |

| State | outcome read | hold sweep | restart | leader loss | ordinary write while reserved | mirror apply while reserved |
| --- | --- | --- | --- | --- | --- | --- |
| ABSENT | UNKNOWN, state ABSENT (-) | n/a | n/a | n/a | not reserved: applies | not reserved: applies |
| ACTIVE | UNKNOWN, state ACTIVE (-) | past `PREPARED_HOLD_TIMEOUT_MS`: discarded on any role, no SQL (-) | lost -> ABSENT | discarded on demotion -> ABSENT | not reserved: applies (T will refuse `conflict`) | applies |
| PREPARING | UNKNOWN (-) | not swept (the pending write owns its 30 s deadline) | lost; the proposal may still commit | pending released: UNKNOWN if proposed, `not_leader` if not | not reserved until the PREPARE applies | same |
| PREPARED | UNKNOWN, state PREPARED, digest, prepare index/term (-) | reported only (`held_reported`), never terminalized (-) | row survives with its reservation | row unaffected | req: `partition_write_reserved`, deferRetry, not proposed (-). apply: `reserved_refused`: no statement, no outcome row, applied index advances, proposer answered deferRetry (-) | same as ordinary write (non-settling); the mirror sender throws on it (L1) |
| COMMITTED | COMMITTED (-) | n/a | survives | n/a | applies | applies |
| ROLLED_BACK | NOT_COMMITTED (-) | n/a | survives | n/a | applies | applies |
| REFUSED | NOT_COMMITTED + `refusalCause` (-) | n/a | survives | n/a | applies | applies |
| TOMBSTONE | NOT_COMMITTED (-) | n/a | survives | n/a | applies | applies |

Another transaction's PREPARE while reserved is the PREPARED-row case of the
"ordinary write while reserved" column: `reserved`, deferRetry, non-settling,
so contention never forces an abort.

## 5. Durable row and outcome vocabulary (decision F)

### 5.1 One table

`_participant_transactions` REPLACES `_transaction_outcomes`
(`partition-service-constants.js:89-108`). It is a new table, not an extension,
because SQLite cannot change a primary key in place and the old key
`(session_id, transaction_epoch)` is the non-unique identity rejected in
rounds 1 and 2; the old table and its overwriting UPSERT are dropped in the
cutover (after the drain precondition, 11.3).

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
```

Writes (all inside the application transaction, never elsewhere):
`INSERT` of a PREPARED row; `INSERT` of a REFUSED row or of a TOMBSTONE
(ROLLED_BACK, prepare fields NULL); and `UPDATE ... SET state = ?, decision...
WHERE transaction_id = ? AND participant_id = ? AND state = 'PREPARED'`, whose
`changes` must be 1 (otherwise an invariant breach: throw, host failure). No
UPSERT, no `Date.now()`: time is the entry's `(index, term)`. The reservation
read is `SELECT 1 FROM _participant_transactions WHERE state = 'PREPARED'
LIMIT 1`.

Retention (R13): one row per transaction per participant, like
`_partition_statement_outcomes` (`...-outcome-constants.js:16-19`); rows may be
removed only by a committed command of the log-bound/compaction owner after the
coordinator's record is terminal. Leg A adds no removal. An unbound ROLLBACK of
an ACTIVE session costs no consensus round and no row.

### 5.2 `resolveTransactionCommitOutcome` mapping

| Durable/volatile state | Answer |
| --- | --- |
| COMMITTED row | COMMITTED |
| ROLLED_BACK row (incl. TOMBSTONE) or REFUSED row | NOT_COMMITTED |
| PREPARED row | UNKNOWN |
| no row (ABSENT), ACTIVE, PREPARING | UNKNOWN |

NOT_COMMITTED is answered **only** from a durable ROLLED_BACK or REFUSED row,
never from absence, a missing session or a lost process. Any replica may answer
(terminal rows are immutable, absence is never definitive), so no leader-lease
read is needed (round-1 R5). The answer carries `{transactionId, participantId,
state, preparedDigest, prepareIndex, prepareTerm, decisionIndex, decisionTerm,
refusalCause}` so proof identity survives the hop. `PARTICIPANT_COMMIT_OUTCOME`
(`src/constants/transactions.js:17-21`) is unchanged; states are a separate
field, never a fourth outcome.

## 6. Atomicity and faults (decisions J, K)

### 6.1 The one transaction

The transaction is the `store.transaction` opened by
`applyCommittedEntryTransaction` (`raft-rs-application-transaction-owner.js:60`).
Inside it, in order: the partition's `applyCommittedEntry` callback
(`:61-68`) runs the decision's operations (each `db.prepare(sql).run(params)`),
records each per-operation committed-statement outcome (`txop:` keys, APPLIED
with `changes`/`lastInsertRowid`), and applies the conditional row UPDATE; then
`putAppliedState` (`:77-78`). Everything commits together or not at all; the
proposer's answer, CDC and size updates are afterCommit effects (`:95-97`),
which run only after the commit. A throw anywhere inside rolls back all of it,
runs the rollback effects (the pending write is rejected) and rethrows
(`:85-94`); the runtime turns it into the group's host failure
(`raft-rs-runtime-owner.js:920-941`) and the entry is delivered again at the
same index after reconstruction.

Witnesses: W2a plants a failure in the applied-state write (after the
operations): no row, no `txop:` outcome, state still PREPARED, applied index
unchanged. W2b records, from inside the applied-state write, how many of the
transaction's rows exist: `[1]` in v3, `[0]` under an afterCommit shortcut.
Control 2 shows the same planted failure leaves an ordinary write unapplied
today.

### 6.2 Typed failure edges

| Edge | Typed outcome | Fails closed | Caller observes |
| --- | --- | --- | --- |
| Deterministic failure at PREPARE dry run | REFUSED row, `statement_failed` (W, all replicas identical) | yes | PREPARE refused; outcome NOT_COMMITTED |
| Generation moved before PREPARE apply | REFUSED row, `conflict` (W) | yes | same |
| Deterministic failure at COMMIT apply (impossible after a valid PREPARE) | REFUSED row, `commit_statement_failed`, identical on every replica, alarm (decision K) | yes | COMMIT answered not committed; coordinator must surface an atomicity alarm |
| Environmental failure (busy, I/O, full, JS throw) at any apply | host failure, nothing recorded, applied index unchanged (`partition-committed-statement-outcome.js:295-301`) | yes | UNKNOWN until re-delivery |
| Replay of an earlier staged op fails | `replay_diverged`, session doomed | yes | session request refused |
| Replay budget | `replay_budget_exceeded` | yes | write refused; PREPARE or ROLLBACK allowed |
| Prepared digest or decision text mismatch | `decision_digest_mismatch` (-) | yes | refused |
| Decision after the opposite terminal | `decision_conflict` (-) | yes | refused, first terminal stands |
| COMMIT on ABSENT/REFUSED | `not_prepared` (-) | yes | refused + alarm |
| PREPARE while reserved | `reserved`, deferRetry, non-settling (-) | yes | retry later |
| Absent/empty operations | allowed: a PREPARE with zero operations reserves and validates like any other | n/a | normal |
| Late PREPARE after TOMBSTONE | `terminal` (-) | yes | refused |

K precisely: the dry run and the frozen state make an identical deterministic
COMMIT failure unreachable on consistent replicas; if a bug makes it happen
anyway it is settled identically everywhere, never retried forever. A
single-replica environmental failure is the existing host failure (W3b,
control 3). Limit L4: a replica whose application rows silently diverged and
which fails a statement with a deterministic code records REFUSED alone; the
classifier cannot tell this from the identical case
(`partition-committed-statement-outcome.js:180-187`), exactly as for ordinary
writes today. Detecting divergence is a replica-consistency owner's job
(R17 finding F-DIV).

## 7. Await, deadline, leader loss (decision H)

- PREPARE, COMMIT and bound ROLLBACK requests build their committed command,
  ask `admitCommittedCommand` (origin TRANSACTION_OWNER, identity required in
  place of `sessionId`), check leadership exactly as `applyWrite` does
  (`resolvePartitionWriteCommitMode` + `buildPartitionWriteLeadershipRefusal`,
  `partition-write-kernel.js:294-312`, `:338-362`), join a pending outcome of
  the same entryId if one exists, and otherwise call
  `startPartitionRaftWriteCommit` (`partition-service-raft-write-commit.js:237-252`),
  which registers `waitForCommittedWrite` before proposing (`:146`).
- The apply resolves the pending answer in afterCommit with the typed result
  (PREPARED + digest + index/term; REFUSED + cause; COMMITTED + results; ...).
  A failed (non-`success`) answer is returned unchanged (`:192-202`). The
  side-effect plan is empty for these commands except a size update after a
  COMMIT (`partition-write-kernel.js:469-500` extended; mirroring is limit L1).
- Deadline (`PENDING_REQUEST_TIMEOUT_MS`, 30 s): the release answers
  `partition_write_outcome_unknown` if proposed, else
  `partition_write_commit_deadline_exceeded` (`partition-write-kernel.js:370-387`);
  the transaction owner maps a proposed release to `{success: false, outcome:
  UNKNOWN}`, never to a refusal (W11a).
- Leader loss: `releasePendingCommittedWrites` with LEADERSHIP_LOST
  (`partition-service-raft-lifecycle-wiring.js:34-40`): proposed -> UNKNOWN;
  unproposed -> `not_leader` (W11b). Volatile sessions on the demoted replica
  are discarded.
- Non-leader: `partition_write_not_leader`, nothing proposed (W11c).
- PREPARING: a session write is refused `preparing` and the sealed operations
  do not change (W11d); ROLLBACK (unbound) and COMMIT are deferred.
- Retry after UNKNOWN: the coordinator re-sends; the same entryId joins a
  pending outcome, or the leader answers from the row (PREPARED/REFUSED), or
  answers `not_active`/UNKNOWN when it holds neither; the coordinator then
  terminates with a bound ROLLBACK, which tombstones or rolls back in log order.
- Backpressure: a full proposal queue answers `partition_write_backpressure`
  (`partition-write-kernel.js:418-428`), retryable.
- Cost on the healthy path: 2PC per participant goes from 0 to 2 awaited rounds
  (PREPARE, decision), plus the coordinator's decision insert; 1PC is decided
  in 11.2.

## 8. Mirror, checkpoint, CDC, reservation bound (decisions L, M)

### 8.1 Split/merge mirror (limit L1)

Mirroring is a proposer-side effect of an acknowledged ordinary write:
`executePartitionRaftWriteCommit` builds the side-effect plan
(`partition-service-raft-write-commit.js:203-220`), `applyWriteSideEffectPlan`
calls `handleSplitReplicationAfterWrite` and, while a merge is active,
`handleMergeReplicationAfterWrite` (`partition-service-write-metrics-base.js:751-762`);
those enqueue or mirror only on the source leader
(`partition-service-split-mirror-queue-methods.js:44-67`,
`partition-service-merge-replication-methods.js:461-500`). `applyCommittedEntry`
forwards nothing. The durable replay cursor re-sends every committed
write-type entry after the watermark whatever its outcome
(`partition-mirror-replay-cursor.js:89-128`), and excludes transaction
commands. Mirror delivery throws on any failure, `deferRetry` included
(`partition-split-routing.js:241-245`).

Honest Leg A answer: **transactions are not mirrored in Leg A** (they are not
today either: `commitTransaction` never reaches the mirror chain,
`transaction-base.js:707-796`). Leg A adds:

1. an admission fence: BEGIN and PREPARE are refused
   (`participant_transaction_topology_transition_active`) on a partition whose
   split or merge handle is live or whose durable transition row names it as
   source or target (lookup shaped like `findDurableMirrorTransitionForService`,
   `partition-mirror-replay-cursor.js:143-163`). This reads a cache projection
   and a volatile handle, so it is a hint (R10), not the barrier;
2. the replay cursor mirrors an entry only if its `entry:` outcome row is
   APPLIED (`readCommittedStatementOutcome`), so a `reserved_refused` or
   STATEMENT_FAILED source entry is never applied on the target (the latter is
   a pre-existing defect, finding F-MIR);
3. a mirror delivery onto a reserved partition is refused non-settling; the
   mirror sender's handling of that refusal is unverified (it throws).

A PREPARE committed before a split starts, then COMMITTED during it, applies
on the source and not on the target: the PR100 Leg B cutover barrier (S1-S5,
M1-M5) closes that. Witnesses for L1 need the split machinery and stay red as
Leg B obligations (section 10.3).

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

### 8.3 CDC (receipt 8 stays red)

v3 emits transaction CDC per operation from the decision's afterCommit on the
leader, as ordinary writes do (`partition-service-entry-apply-base.js:1057-1072`),
instead of from `commitTransaction` (`transaction-base.js:746-748`). Sequence
numbers are in-process (`partition-cdc-delivery.js:215-219`) and the buffer is
volatile (`cdc-event-buffer.js`); a crash after the data commit and before
emission loses the event for ordinary writes and transactions alike. No CDC
cursor/retention owner exists; receipt 8's CDC half stays red until one does.

### 8.4 Reservation bound (decision M)

The participant never calls the coordinator; the hold sweep only reports
(`reportWaitBoundSpent`, outcome `held_reported`). A PREPARED row is released
only by an applied decision. The decision comes from the coordinator's commit
protocol or, if the coordinator is lost, from any SQL engine's recovery: every
engine loads every `sql_transactions` row
(`sql-query-engine-transaction-recovery-methods.js:151-159`), the sweep runs
every 1000 ms (`distributed-transaction-coordinator-constants.js:46`) over
transactions past their budget (`distributed-transaction-recovery.js:404-431`),
committing PREPARED/COMMITTING and rolling back ACTIVE/PREPARING/ROLLING_BACK
(`distributed-transaction-coordinator-constants.js:27-36`). Bound: transaction
budget 60 s (`timeout-budget.js:20`) + one sweep interval + one participant
round, provided some engine runs recovery with the control plane readable and
the decision record writable. Otherwise the bound is unbounded and every write
to that partition is answered `partition_write_reserved` with deferRetry for
the duration: a typed, non-stalling R12 exposure, recorded, never a log stall.
Removal drain (`transaction-base.js:88-96`) waits on PREPARED rows for the same
bound.

## 9. Supersession inventory (run on this head)

### 9.1 Runs

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

## 10. Witness ladder and receipts

### 10.1 The twelve required witnesses (round-2 section 3)

| # | Requirement | Test | Red on this head because | Revision 1 cannot green it because |
| --- | --- | --- | --- | --- |
| 1 | v2-protocol P1/P2 | W1a, W1b | W1a: no `PARTICIPANT_PREPARE` proposed, PREPARE settled at once (LOCAL_STAGING), staged row visible (1). W1b: commands UNRECOGNISED; absence read NOT_COMMITTED | it proposes no PREPARE/decision command |
| 2 | atomicity under fault | W2a, W2b | UNRECOGNISED before the planted failure; probe `[]` | an afterCommit apply gives probe `[0]`; no decision command |
| 3 | identical failure; divergence host failure | W3a, W3b | UNRECOGNISED on both replicas | no PREPARE dry run, no decision command |
| 4 | intervening write refuses PREPARE; COMMIT never fails | W4 | UNRECOGNISED; the reserved write applied (row 1, settled) | no reservation |
| 5 | c' isolation, default absorption | W5a, W5b | `inTransaction` true after BEGIN and write; sessionless reader sees 1; sessionless write refused USER_TRANSACTION_OPEN at apply; default session absorbs | revision 1 keeps BEGIN IMMEDIATE and absorption |
| 6 | result determinism | W6 | no `provisional`; no PREPARE proposed | no PREPARE command, no provisional marking |
| 7 | reserved write retried; mirror on reserved target | W7 (mirror half: 10.3) | write proposed and applied, settled; no reservation | no reservation |
| 8 | transaction commit reaches split target; refused source write not mirrored | not expressible on the port (10.3) | - | - |
| 9 | unbound ROLLBACK refused, digest mismatch refused | W9 + seam S1 | unbound ROLLBACK answered success; no `failureCode`; commands UNRECOGNISED. S1: `rollbackCalls ['p1','p2']` after COMMITTING | no binding exists |
| 10 | two coordinators, same id | W10a, W10b | both mint `tx-default-1000-1`; UNRECOGNISED | coordinator untouched |
| 11 | deadline, leader loss, non-leader, PREPARING write | W11a-d | PREPARE settled immediately (no proposal); follower answer has no `failureCode`; late write proposed as an ordinary write | no PREPARE command |
| 12 | late PREPARE, lagging outcome, restart, paired sweep, entryId collision, CDC, A1-A5 | W12a-e (CDC and A1-A5: 10.3) | UNRECOGNISED; absence answered NOT_COMMITTED (W12b); the store refuses the PREPARE apply under the open session (W12d) | no rows, no tombstone, no `txop:` keys |

Also red: seam S2 (`resolveParticipantCommitMiss` returns COMMITTED with zero
outcome reads for a 2PC NO_TRANSACTION). Controls 1-4 are green on this head:
ordinary write applies once; planted applied-state failure leaves an ordinary
write unapplied and unrecorded; single-replica storage failure on an ordinary
write is a host failure and re-applies once; an ordinary write carries its SQL
verbatim and answers its own apply's `lastInsertRowid`.

Every failing assertion is in `evidence/red-v3-first-run.tap` (sha256
504b30e861d8c791...; file sha256 00d4bcd14759d049...). The witness file
passes `npx eslint` and `npm run -s audit:file-size` (1289 lines, test
threshold 1500). `npm run -s test:duplication` does not scan it (jscpd skips
files over 1000 lines; the largest scanned source has 998); measured
separately at the ratchet's thresholds (20 lines, 100 tokens) over
`test/partition` and `test/test-helpers`, it has 0 clone groups. The ratchet
itself is red on this head (698/697 groups, 26410/26369 lines) through clones
that involve neither this file nor the session's other commits.

### 10.2 Receipt mapping (sealed ids unchanged)

| Receipt | v3 sub-evidence | Status after the cutover change set |
| --- | --- | --- |
| no-speculative-visibility-before-consensus | W1a (no row before the decision applies), W5a, W5b | can turn green on the port |
| replicated-prepare-committed-and-applied-on-every-replica | W1a, W1b, W12c, W11a-c | port green possible; real three-replica A1-A3 required before closure |
| commit-applies-operations-outcome-and-applied-index-atomically | W1b, W2a, W2b, W3a, W3b, W4, W6 | port green possible; A5 crash boundary on the real backend required |
| duplicate-and-conflicting-decisions-idempotent-or-refused | W9, W12a, W12e, W10b | port green possible; A4 on the real backend |
| exact-participant-outcome-no-transaction-is-not-committed | W12b, W1b, seam S2 | participant half on the port; S2 is the query lane |
| immutable-coordinator-decision-before-fanout | seam S1 (+ query-lane witnesses of the decision insert) | query lane only; stays red until the coordinator lands |
| no-rollback-after-commit-decision-and-no-prepared-erasure | W9, W12d, seam S1 | needs both lanes |
| recovery-and-cdc-survive-deadline-and-crash | W11a, W11b, W12c (recovery half) | stays red: no CDC cursor/retention owner |

The receipt producer (`scripts/quest-evidence/replicated-transaction-decision-and-apply.js`)
is outside this unit's write scope; at the next attempt it must be re-anchored
to the v3 file with an exact expected test count per receipt (round-2 noted
that `allowMultiple` passes on a renamed subset). No receipt is added or
renamed here.

### 10.3 Not expressible on the controllable port

- #8 and the mirror half of #7: need the split/merge workers and a real log
  (the port writes no `_raft_rs_log` rows, so the replay cursor reads nothing).
  Owned by Leg B (TX2), red until then.
- CDC exactly-once across a crash after data commit: no durable cursor exists.
- PR100 A1-A5 on a real three-replica rs-raft group (durable Ready, restart
  replay at the original index, leader change with an uncommitted PREPARE
  tail, quorum, fsync cost).

## 11. What remains for the query owner; the single cutover change set

### 11.1 Seam items (detail in the seam record, revision-3 section)

A. One cutover change set, agreed before any source lands. B. Identity
composition, coordinator construction with `nodeId` and `bootIncarnation`,
delivery key, identity on every request and on the outcome callback. C. An
insert-once decision record; COMMIT/ROLLBACK fanout bound to it; every
rollback path (including `abortTimedOutTransaction` and recovery) inserts the
ROLLBACK decision first and never rolls back once COMMIT is recorded
(falsifier S1). D. Outcome semantics: UNKNOWN is pending; NOT_COMMITTED only
from the participant's durable row; `resolveParticipantCommitMiss` reads the
outcome (falsifier S2). E. PREPARE answers retained (digest, index, term) on
the participant row before deciding. F. 1PC choice. G. Register the
coordinator-participant coupled pair in `test/shards/impact-contracts.json`
with these witnesses.

### 11.2 1PC

- Option A, prepare-first (recommended): a single participant runs PREPARE then
  the bound COMMIT; the participant has no 1PC-specific code and the sealed
  statement holds unchanged. Supersedes the coordinator's sealed "one phase
  must not prepare" (`test/query/distributed-transaction-coordinator.test.js:646-673`)
  and the documented "one-phase commit for a single participant"
  (`architecture/images-distributed-public-seam.md:102`); `COMMIT_MODE.ONE_PHASE_COMMIT`
  must then be deleted, not kept as a label. Cost: 2 awaited rounds.
- Option B, participant-decided: one committed command with `commitMode:
  ONE_PHASE_COMMIT` whose apply validates, dry-runs and commits in one
  transaction (ABSENT -> COMMITTED or REFUSED); the coordinator records an
  intent before fanout and adopts the participant's durable outcome. Needs a
  quest supersession of "the coordinator persists one immutable decision before
  COMMIT fanout" for 1PC (owner decision) and adds one row to the transition
  table. Cost: 1 round.

### 11.3 The single cutover change set (lands together)

Participant lane: `partition-service-transaction-base.js` (rewrite on c'),
`partition-service-write-metrics-base.js` (session read/write paths),
`partition-service-entry-apply-base.js` (two command branches, identity on the
wire), `partition-service-transaction-session-methods.js` (absorption and
aliases gone), `partition-committed-command-admission.js` (marker rule ->
identity rule), `partition-service-constants.js` (types, codes, table, SQL,
budgets), `partition-committed-statement-outcome*.js` (`txop:` keys, generation
index), `partition-write-kernel.js` (`partition_write_reserved`, side-effect
plan), `partition-service-core-base.js` (state maps, activation),
`partition-mirror-replay-cursor.js` (APPLIED-only), the admission fence, the
docs of section 3.4, and the superseded tests of section 9.2. Query lane: the
coordinator identity, decision record, protocol, recovery and engine wire of
section 11.1. Both lanes: the impact-contract pair.

Landing gate: the v3 witnesses green except the receipts marked red in 10.2;
the superseded tests rewritten to their new meanings in the same change set;
independent source verification; then the real three-replica A1-A5.

Upgrade precondition: no non-terminal transaction may be in flight when a
partition first runs the cutover code (a legacy marker above the applied index
fails closed as UNRECOGNISED, by design); the coordinator drains or rolls back
its in-flight transactions before the upgrade. Recorded as an operational
limit (L6).

Limits recorded: L1 no transaction mirroring (Leg B); L2 CDC not durable; L3
reservation unbounded without a recovering engine (R12 exposure); L4 local
divergence indistinguishable; L5 partition-granular conflicts and one
non-terminal transaction per partition; L6 upgrade drain.
