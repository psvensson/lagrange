# Reader census: participant rows and the coordinator transaction status

> **Stage 0b scope note (2026-11-28).** The lead ruled that only removal **(a)**, the
> ACTIVE participant row, proceeds in this quest; removal **(b)**, `status = PREPARED`,
> is a recorded proposal for the TX1 owner (`deferred-prepared-status-removal.md`).
> The census below covered both and is kept whole; every "(b)" column and the rows
> 13-17 concern the deferred proposal only. The design review's corrections are in
> section 6 at the end.

Quest `transaction-redundant-progress-writes`, stage 0. Code read at
`ab347e9625a64ed24b7700b8f958bd54d8e3db06` in the quest worktree; every
`path:line` is at that head. **[V]** = verified by reading the code or by a
measurement named here; **[I]** = inferred.

Subjects:

- **(a)** the ACTIVE row written on `sql_transaction_participants` at the first
  write to each table (R1 W4a): `src/query/distributed/distributed-transaction-participant-set.js:299-305`
  through `src/workflow/durable-workflow-coordinator.js:254-288` and
  `src/query/sql-query-engine-transaction-persistence-methods.js:580-613`,
  overlapped with the statement in `src/query/distributed/distributed-transaction-statement.js:174-204`.
  Question asked of every reader: what does it see if no participant row
  exists until the PREPARED row?
- **(b)** `status = PREPARED` on `sql_transactions` (R1 C4):
  `src/query/distributed/distributed-transaction-decision-protocol.js:228-230`,
  persisted as a status-only UPDATE by `persistDistributedTransactionRow`
  (`sql-query-engine-transaction-persistence-methods.js:320-359`). Question:
  what does it see if the row goes from PREPARING (set atomically with the
  freeze, `:209-231`) straight to the decision (which sets COMMITTING or
  ROLLING_BACK in the same UPDATE, `:459-498`)?

## How the census was taken (complete)

- Scope: every tracked file under `src/` (2239 files, 2170 `.js`), `test/`
  (3974), `scripts/`, `architecture/`, `docs/`, `models/`, `solve/quests`,
  `solve/epics`. Tool: `git grep` on the tracked tree (no filesystem walk).
- Search terms (union): `sql_transaction_participants`,
  `SQL_TRANSACTION_PARTICIPANTS`, `sql_transactions`, `SQL_TRANSACTIONS`,
  `TRANSACTION_STATUS.PREPARED`, `PARTICIPANT_STATUS.` (every member),
  `'PREPARED'`, `RECOVERY_COMMIT_TRANSACTION_STATUS`,
  `PREPARE_SENT_TRANSACTION_STATUS`, `getTransaction(`, `transactionMetadataOf`,
  `getRecoveryObligation`, `readDistributedTransactionRow`,
  `readDistributedTransactionRecoveryState`, `loadDistributedTransactionRecoveryState`,
  `readTransactionReleaseCensus`, `isTableCdcReadinessRelevant`,
  `upsertParticipant`, `persistActiveParticipants`; plus the literal table
  names with partition suffixes, `participant.status`/`tx.status` reads, the
  `stage` result field and its PG-wire consumer.
- Result: **53 `src` files** contain at least one term. Each was opened at its
  hits and classified below; none is left unread. The four groups are row
  readers (section 1), in-memory status readers (section 2), schema, CDC and
  cache (section 3), and partition-level classifications that never read a
  row (section 4). In tests and harness 304 files hit; section 5 lists those
  that observe either write (all others name the partitions for placement,
  or seed recovery rows).

## 1. Readers of durable rows

| # | Reader | What it does with the value | (a) no participant row before PREPARED | (b) PREPARING -> decision |
| --- | --- | --- | --- | --- |
| 1 | Recovery authority, participant restore: `src/query/distributed/distributed-transaction-recovery-authority.js:90-122` | Builds the participant map from the **manifest pairs**, not from rows; a row may only add evidence. A present row whose status is PREPARED with complete evidence makes the participant PREPARED; any other row or a missing row gives FAILED with no evidence (`:106-110`). A row naming a partition outside the manifest refuses the authority (`:94-96`). | Identical. An ACTIVE row is already read as FAILED, the same as a missing row. [V] | Not a status reader. [V] |
| 2 | Recovery authority, candidate status: `...-recovery-authority.js:127-169` | The restored status is the row's own only when the row and all participants are verified terminal (COMMITTED/ROLLED_BACK); otherwise `FROZEN -> PREPARING`, `OPEN -> ACTIVE` (`:159-161`). | Not affected. [V] | PREPARED is never read: a FROZEN undecided row is PREPARING either way. [V] |
| 3 | Recovery authority, decide undecided: `...-recovery-authority.js:207-235` | `prepared` = FROZEN and every manifest participant has retained evidence (`:211-213`); COMMIT only then, else ROLLBACK after the deadline or on a live ROLLBACK. | Unchanged: evidence comes only from PREPARED rows. [V] | Unchanged: never consults the status. [V] |
| 4 | Fully-terminal test: `...-recovery-authority.js:39-88` | A row is settled only if status COMMITTED/ROLLED_BACK matches the decision and every manifest participant has a terminal row. | Not affected (terminal rows only). [V] | Not affected. [V] |
| 5 | Recovery discovery: `src/query/distributed/distributed-transaction-recovery.js:79-98`, `src/query/sql-query-engine-transaction-recovery-methods.js:154-186` | A cached row is eligible when not fully terminal and either decided / post-decision status (COMMITTING, ROLLING_BACK, FAILED, COMMITTED, ROLLED_BACK) or past its persisted deadline. Participant rows only feed the terminal test. | Not affected. [V] | PREPARED is not a post-decision status: a PREPARED and a PREPARING row are both eligible only after the deadline. Measured: a crash at the decision write leaves status PREPARED and recovery recovers nothing before the deadline (`totalRecovered: 0`), then commits after it (`lab/td-stage0`, scratch probe; witness `recovery-before-decision`). [V] |
| 6 | Cache-row restore: `...-recovery.js:596-769` (`loadParticipant` `:700-721`), `src/workflow/durable-workflow-coordinator.js:480-501` | Restores participant rows into the recovered obligation's registry (gap-fill only); every status must be a non-empty string (`src/query/distributed/distributed-transaction-recovery-validation.js:99-108`). Replaced wholesale by the authoritative re-drive (reader 1) before any decision. | Fewer rows restored; the authoritative read supplies the set from the manifest. [V] | The restored status is read only for the non-recovered live path (reader 13). [V] |
| 7 | Authoritative recovery read: `src/query/sql-query-engine-transaction-set-methods.js:43-61` | Reads the row, all participant rows, the row again; refuses when the fence fields changed. Status is not a fence field (`:19-22`). | Empty participant page is a valid answer. [V] | Status not fenced. [V] |
| 8 | Release census: `src/query/distributed/distributed-transaction-release-census.js:43-60,68-124` | Classifies every row for a release drain. Undecided FROZEN rows: ACTIVE/PREPARING/PREPARED accepted; COMMIT-decided rows: PREPARED/COMMITTING/COMMITTED accepted (PREPARING is **not**). | Does not read participant rows. [V] | Safe only because every COMMIT decision write sets COMMITTING in the same UPDATE: `persistDistributedTransactionDecision` (`sql-query-engine-transaction-persistence-methods.js:463-470`), and the release settlement writes only ROLLBACK decisions (with ROLLING_BACK, `distributed-transaction-settlement.js:177-178,215-220`; `distributed-transaction-release-settlement.js:258-271`). No path records a COMMIT decision on a PREPARING row. [V] |
| 9 | Release settlement: `...-release-settlement.js:185-208,340-367` | Admits participant rows only if each names a manifest member; drives every manifest member by the decision; compares status only to the terminal status. | Missing rows tolerated (manifest drives). [V] | Not a PREPARED reader. [V] |
| 10 | Coordinator settlement command: `src/query/distributed/distributed-transaction-settlement.js:115-119,138-186` | PROGRESS accepts only COMMITTING/COMMITTED/ROLLING_BACK/ROLLED_BACK; DECIDE sets the progress status itself. | Not a participant reader. [V] | Never writes or requires PREPARED. [V] |
| 11 | Decision record read: `src/query/distributed/distributed-transaction-decision-record.js:29-45`, `distributed-transaction-decision.js:112-127,187-203` | Reads only `decision`, `decision_text`, `decision_digest`. | n/a | Status not read. [V] |
| 12 | Participant-set CAS readback: `sql-query-engine-transaction-persistence-methods.js:147-155,233-245,507-543` | After a lost freeze answer, accepts the row if set text/state/mode/count match and (status equals the intended PREPARING, or a decision exists). | n/a | PREPARED never written before this point; unaffected. [V] |

## 2. Readers of the in-memory status (the value the PREPARED write also sets)

| # | Reader | Use | (a) | (b): in-memory status stays PREPARING until the decision |
| --- | --- | --- | --- | --- |
| 13 | Live sweep re-drive: `distributed-transaction-recovery.js:134-155`, set `distributed-transaction-coordinator-constants.js:32-35` | A live (not row-discovered) transaction past its budget: status PREPARED or COMMITTING continues the commit protocol; any other undecided status runs the rollback protocol. | n/a | **Changes routing.** A live transaction whose decision write is in doubt after PREPARE (commit point reached, `distributed-transaction-decision.js:170`) is today routed to `runCommitProtocol`; without PREPARED it goes to `runRollbackProtocol`. Both adopt the recorded decision first, so the durable outcome is the same, but the rollback path reports `{path: ROLLBACK, success: false, TRANSACTION_COMMIT_DECIDED}` for a committed transaction (`distributed-transaction-decision-protocol.js:636-666`). **Measured** with a scratch simulation of the removal: witness `live in-doubt decision` turns red (`lab/td-stage0/transaction-redundant-progress-writes-recovery-simulated-removals.tap`). Needs the named additional change (design note). [V] |
| 14 | Prepare-stage entry: `distributed-transaction-decision-protocol.js:72-75,213-217` | Writes PREPARING unless status is already PREPARING or PREPARED. | n/a | Status is PREPARING from the freeze: no write either way. [V] |
| 15 | The write itself: `...-decision-protocol.js:228-232` | `setTransactionStatus(PREPARED)`; the returned `stage: PREPARED` is a constant label, consumed only by `driveTransactionDecision` when a ROLLBACK recorded first is followed (`:441`). | n/a | The label can stay; it does not read the status. [V] |
| 16 | Failure stage on answers: `buildDecisionInDoubtResult` (`...-decision-protocol.js:681-696`), `buildCommitCatchFailure` (`src/query/sql-query-engine.js:81-108`), PG-wire detail `engine_stage` (`src/runtime/pgwire-transaction-outcome.js:184`) | Diagnostic text of a 08007 / 25P04 answer. No code branches on it (searched `stage ===`, `.stage` in `src/query`, `src/runtime`). | n/a | An in-doubt COMMIT after PREPARE reports `engine_stage: PREPARING` instead of `PREPARED` (measured today: `stage: 'PREPARED'`). Client-visible text only. [V] |
| 17 | Commit point: `src/query/distributed/distributed-transaction-commit-point.js:39-55` | COMMITTING/COMMITTED and the field only. | n/a | Not a PREPARED reader. [V] |
| 18 | Metadata purpose labels: `sql-query-engine-transaction-persistence-methods.js:157-198`, `distributed-transaction-telemetry.js:135-160` | Status -> telemetry purpose (PREPARED and PREPARING -> `preparing`; participant ACTIVE -> `participantAdmission`). | `participantAdmission` falls from 2P to P. [V] | `preparing` falls from P+1 to P (R1's prediction). [V] |
| 19 | In-memory participant status: `distributed-transaction-participant-set.js:107,137,286-288`; stage key selectors `distributed-transaction-protocol.js:82-126` | `newlyEnlisted` = participants whose **in-memory** status is not ACTIVE: a second write to a table must not BEGIN again. The in-memory ACTIVE is set by `upsertParticipant` (`durable-workflow-coordinator.js:254-260`) **before** the persist call. | **The in-memory transition must stay.** Removing the durable write by deleting the `upsertParticipant` call without setting the registry status would re-BEGIN the participant on every statement. [V] | n/a |
| 20 | `prepareEvidenceRetained`: `distributed-transaction-coordinator.js:207-209`, `...-protocol.js:82-92` | Set only after a PREPARED row persisted; PREPARE is re-asked for participants without it. | Unaffected (PREPARED rows stay). [V] | Unaffected. [V] |
| 21 | Diagnostics of the session: `transactionMetadataOf` (`distributed-transaction-coordinator.js:629-648`), `getRecoveryObligation` (`distributed-transaction-recovery.js:218-221`), budget-spent log `countParticipantStatuses` (`distributed-transaction-protocol.js:169-201`) | Report status and participant statuses; `getTransaction` callers use only existence, `transactionId`, `transactionMode`, `participants` (`sql-query-engine-statement-admission.js:72,216,236`, `sql-query-engine-write-execution.js:168-296`, `sql-query-engine-select-execution.js:267`, `sql-query-engine.js:294-366`). | Same in-memory values (reader 19). [V] | A diagnostic snapshot taken between the prepare stage and the decision shows PREPARING. [V] |

## 3. Schema, triggers, constraints, CDC and caches

| # | Owner | Finding |
| --- | --- | --- |
| 22 | Schemas: `src/bootstrap/system-table-workflow-schema-definitions.js:17-77` | `status TEXT NOT NULL` on both tables, indices on status, **no CHECK constraint and no transition rule**. [V] |
| 23 | Trigger `sql_transactions_initial_lineage_v1`: `src/query/distributed/distributed-transaction-schema-enforcement.js:27-46` | BEFORE INSERT only (status must be ACTIVE at insert). No UPDATE trigger; `partition-service-table-bootstrap.js:63` refuses triggers on every other system table. [V] |
| 24 | CDC policy: `src/cache/cdc-table-policy.js:187-205,537-551` | Both tables are `CONTROL_INTERNAL_PROPAGATION`, readiness-relevant: every committed write records a CDC obligation (owner decision D2). Removing the writes removes **P + 1 obligations per write transaction** (new_order 6, payment 5) and their `CDC_DELIVERED` acknowledgements; nothing waits for them on the answer path (R1 1.1). [V] |
| 25 | System cache consumers | Only recovery discovery reads cached rows of these tables (reader 5/6, `sql-query-engine-transaction-recovery-methods.js:132-143`). Readiness relevance (`admin-service-discovery-readiness-context-methods.js:600-625`, `admin-service-discovery-table-readiness-methods.js:105`) looks at CDC buffer state, not row content. [V] |
| 26 | Coalescing: `sql-query-engine-transaction-persistence-methods.js:254-258,337-346`, `sql-query-engine-transaction-recovery-methods.js:228-263` | Participant rows coalesce per participant (`REPLACE_PENDING`), status updates per transaction; the decision has no coalescing key. Without the ACTIVE row the PREPARED row is the first write under its key; without the PREPARED status the COMMITTED status is the first status UPDATE after the freeze. [V] |

## 4. Partition-level classifications (never read a row)

`src/bootstrap/system-partition-classification.js:50-77` (priority and
critical-transport tables), `src/control-plane/control-plane-mutation-readiness.js:57-62`
(routing-gap dependency tables), `src/admin/admin-control-snapshot-leadership-summary.js:76-82,241-247,523`
(the "admin snapshot summary" R1 left unread: a set of priority partition ids
for discounting stale replica operations), `src/query/sql-query-engine-shared.js:148-152`
(delivery priority), `src/rebalancer/replica-operation-liveness.js:482-488`,
`src/rebalancer/operation-workflow-owner-shared.js:372-378`,
`src/rebalancer/cluster-readiness-signal.js:144` (comment),
`src/node/replica-handler-participant-cutover.js:181-329`, `src/node/replica-handler-release-recovery.js:49,325`,
`src/partition/partition-coordinator-settlement.js:59,86`, `src/partition/partition-participant-transaction-pause.js:128`
(runs the release census, reader 8), `src/partition/partition-participant-transaction-request.js:761`,
`src/bootstrap/bootstrap-service-seed-workflow.js:295`, `src/bootstrap/seed-retained-partition-effects.js:217`,
`src/bootstrap/system-table-schemas-constants.js`, `src/constants/tables.js`,
`src/partition/partition-service-constants.js:437-447` (migration descriptions).
Participant-side `PREPARED` states of the **workload** partitions, a different
table (`_participant_transactions`): `src/partition/partition-participant-transaction-constants.js:54`,
`src/partition/partition-row-key-waiters.js:34`, `src/raft/snapshot-application-content.js:25`.
Managed split workflows: `src/partition/managed-workflow-record-coordinator.js`,
`partition-service-split-mirror-queue-methods.js`. None reads either write. [V]

## 5. Tests, guards and harness that observe either write

Each one was read; disposition in `seals-and-contracts.md` section 3.

| File:line | Observes | Effect of the removal |
| --- | --- | --- |
| `test/query/tx-metadata-pgwire-and-result-representation.test.js:323-333,385-392` | 6 `sql_transactions` mutations incl. PREPARED; decision at index 4; `participantAdmission` 2, `preparing` 2, 10 mutations | Must change (5, index 3, 1, 1, 8). |
| `test/query/transaction-participant-set-authority.test.js:622-707` | Waits for the ACTIVE upsert to start inside `executeWrite` | Would hang: superseded with the overlap machinery. |
| `test/query/transaction-participant-set-authority.test.js:709-881` | ACTIVE persistence failure, delayed sibling, stale ACTIVE rejection | Hazard disappears with the write: superseded. |
| `test/query/scenario-a-transaction-coordination-fast-path.test.js:95-99` | "newly enlisted participant persisted once" (1 participant mutation) | Becomes 0: sealed-quest witness, supersession. |
| `test/query/scenario-a-transaction-coordination-fast-path.test.js:1441-1484` | Finding 1B with ACTIVE failures | Would hang: supersession. |
| `scripts/checks/scenario-a-transaction-coordination-fast-path-guard.js:333-338` | `participantMutationsOnEnlist.length === ONE` | Closed epic's probe turns red: supersession (ruling 3 precedent). |
| `test/raft/raft-rs-backend/transaction-leg-a-three-replica.test.js:194-232,473-474` | A2 and A5 `afterPrepare` hold on `statusWriteOf(PREPARED)` | Hold never reached: hold point moves to the decision write (same crash point). TX1 sealed witness. |
| `test/integration/transaction-coordinator-restart.integration.test.js:117,261` | Hold on `status COMMITTING`, expects `{status: PREPARED, decision: COMMIT}` at interruption | Expects PREPARED; see seals file for a suspected pre-existing red. TX1 sealed witness. |
| `test/runtime/pgwire-transaction-outcome.test.js:64`, `test/query/transaction-release-census.test.js:144`, `test/query/transaction-participant-set-authority.test.js:90`, `test/query/distributed-transaction-coordinator.test.js:360`, `test/query/sql-query-engine-execution.test.js:1202-1217`, `test/transaction/transaction-support.test.js:441`, `test/test-helpers/transaction-recovery-rows-fixture.js:44-48`, `test/distributed/scenarios/seven-node-read-write-load-transaction-recovery.js:38,392`, `test/distributed/scenarios/transaction-recovery-poison-row-live.js:162-171` | **Seed** rows or stage labels with PREPARED or ACTIVE as recovery inputs | Untouched: readers keep accepting durable rows of earlier builds (section 1). |
| `test/integration/helpers/pgwire-rollback-recovery.js:89-93`, `test/integration/helpers/tx1-postkill-coordinator-reader.js:11-17`, `test/integration/seed-migration-cutover-persisted.integration.test.js:217-227`, `test/query/transaction-coordinator-participant-protocol.test.js:232-260`, `scripts/checks/scenario-a-deep-stack-throughput-and-latency-guard.js:292-329`, `test/query/scenario-a-deep-stack-throughput-and-latency.test.js:244-288` | Terminal or PREPARED participant rows, decision ordering | Untouched: those rows are kept. [V] |

## Census result in short

1. No reader in `src` needs the ACTIVE participant row: recovery restores the
   admitted set from the manifest and reads an ACTIVE row as FAILED, exactly as
   a missing row. The in-memory ACTIVE transition, which `upsertParticipant`
   performs before persisting, is load-bearing and must stay.
2. No durable reader needs `status = PREPARED`. Discovery, recovery authority,
   release census (given the atomic decision status), settlement and decision
   reads behave identically.
3. One in-memory reader changes behaviour: the live sweep's routing on
   PREPARED (`distributed-transaction-recovery.js:136`). Without the write,
   an in-doubt live transaction is re-driven through the rollback protocol and
   reported as a failed rollback although it commits. That makes removal (b)
   safe only with a named additional change.
4. Visible side effects: `engine_stage` text on an in-doubt COMMIT, telemetry
   purpose counts, `P + 1` fewer CDC obligations, fewer rows in admin SQL views
   of `sql_transaction_participants` before PREPARE.

## 6. Corrections after the independent design review (stage 0b)

The review's own search confirmed that no reader depends on either write. Its
additions and one misclassification, each re-read here at `ab347e962`:

| Reader | Use | Effect of (a) |
| --- | --- | --- |
| `src/partition/partition-participant-release-contract.js:124-139,191-202` | the release contract consumes the release census result (state, schema and semantic version, row digest) | none: the census never reads participant rows (reader 8) [V] |
| `src/query/sql-locking-read-execution.js:337-339` (`getConflictingReservations`) | iterates live transactions by id for in-memory reservations | none: ids only [V] |
| `src/query/sql-query-engine-lifecycle-and-callback-dispatch.js:247` (`releasePendingReservations`) | iterates live transactions by id at shutdown | none: ids only [V] |
| `src/partition/managed-merge-topology-adapter.js:257` | exposes the coordinator to the merge adapter | none [V] |
| `isOpenDecisionState` (`src/query/distributed/distributed-transaction-recovery-validation.js:125-130`) | validates a restored OPEN candidate's status (ACTIVE, ROLLING_BACK, FAILED) | none for (a); a (b) reader of the restored transaction status [V] |

Misclassified in section 5: `test/query/distributed-transaction-coordinator.test.js:335`
("emits persistence callbacks") **asserts the PREPARED status write**; it belongs to the
deferred removal (b) and is untouched by (a) (the review measured 109/109 on the
baseline and 1 failure only under the simulated (b)).

The AUTHORITATIVE enlistment callers (all reach the same producer; covered by the
begin-gate property): `sql-query-engine-select-execution.js:72-87` (locking read),
`sql-query-engine-global-index-tx1.js:443-450` (global index),
`sql-query-engine.js:379-385` (`bindTransactionToPartition`).
