---
audience: development
documentClass: planning
---

# TX1 Leg A design note - replicated participant transactions (2026-10-10)

Quest: `replicated-transaction-decision-and-apply` (sealed at df51b799a against
the red witnesses in `test/partition/partition-transaction-replicated-apply.test.js`).
Structure follows `docs/development/verification-templates/design-note-template.md`.
This is the participant/replication lane's proposal; the coordinator lane's
decision record is named but not designed here (see `seam-2026-10-10.md`).
Every citation is a `file:line` on 80632c7e4c7da43fc84139e82dc8f7f336dec720.

## 1. Consumed surfaces (cited) and surfaces this design must create

Consumed as they are:

- Session staging: `src/partition/partition-service-write-metrics-base.js:193-235`
  `executeTransactionWrite` admits the entry through `admitCommittedCommand`
  (`src/partition/partition-committed-command-admission.js:125`) with origin
  WRITE_PATH, runs it on the leader's SQLite connection inside the session's
  open transaction and keeps `{type, table, sql, params, changes}` in
  `transactionState.operations` (`:225`) plus the write-set key (`:226`).
- Conflict evidence: `checkWriteConflicts(writeSet, transactionEpoch)`
  (`src/partition/partition-service-transaction-base.js:242`, used at `:666`)
  against `rowCommitEpoch` / `committedWriteLog`
  (`src/partition/partition-service-core-base.js:185-186`).
- PREPARE today: `partition-service-transaction-base.js:643-700` moves the
  session from `activeTransactions` to `preparedTransactions` and answers
  `preparedState: LOCAL_STAGING` (`:698`) without any consensus command.
- COMMIT today: `:707-760` records the outcome row (`:733`), executes the local
  SQLite `COMMIT` (`:736`) and only then proposes the marker through
  `replicateTransactionCommit` (`:942-960`) and `proposeTransactionMarker`
  (`:971-991`), which is leader-gated and fire-and-forget (errors logged).
- ROLLBACK today: `:801-870` executes SQLite `ROLLBACK` then proposes the
  rollback marker.
- Outcome row owner: `_transaction_outcomes (session_id, transaction_epoch,
  outcome, updated_at)` (`src/partition/partition-service-constants.js:89-104`),
  written by `recordTransactionCommitOutcome` (`transaction-base.js:901`) and
  read by `resolveTransactionCommitOutcome` (`:913-934`), which answers
  NOT_COMMITTED when no row, no open session and no prepared-lost mark exist.
- Committed-entry application: `src/partition/partition-service-entry-apply-base.js:1015-1060`
  executes SQL command types once per entry key through
  `readCommittedStatementOutcome` / `recordCommittedStatementOutcome`
  (`src/partition/partition-committed-statement-outcome.js`), inside the
  application transaction the rs-raft runtime owns (`applyCommittedEntryTransaction`,
  reached from `test/test-helpers/controllable-consensus-port.js:54-74` in tests
  and from `src/raft/raft-rs-runtime-owner.js` in production). The
  `TRANSACTION_COMMIT` branch (`entry-apply-base.js:1074-1090`) records the
  outcome row and resolves the proposer's write without executing
  `command.operations`.
- Command vocabulary: `PARTITION_SERVICE_OPERATION` (`partition-service-constants.js:151-165`)
  already names `PREPARE_TRANSACTION`, `TRANSACTION_COMMIT`, `ROLLBACK`; the
  admission owner's frozen type lists decide what may be proposed (`:167-173`).
- Durability floor: the rs-raft store refuses consensus persistence while a
  user transaction is open on the connection (`RAFT_RS_STORE_USER_TRANSACTION_OPEN`,
  `src/raft/raft-rs-durable-store-constants.js:259,298`), and every must-sync
  Ready commits at FULL before its messages leave (`src/raft/raft-rs-durable-store.js:189-255`,
  verified by `test/raft/raft-rs-backend/durable-commit-sync.test.js`).
- Coordinator consumers (query lane): `src/query/distributed/distributed-transaction-protocol.js:669-685`
  (`resolveParticipantCommitMiss`), `:258-275` (`abortTimedOutTransaction`),
  `:289-345` (`runCommitProtocol`).

Surfaces this design must create (none exist today):

- A durable `_prepared_transactions` record per `(session_id, transaction_epoch)`
  holding the operation list, write-set keys, operation digest, prepare entry
  index/term and a state {PREPARED, COMMITTED, ROLLED_BACK, REFUSED}.
- Application of `PREPARE_TRANSACTION` and `ROLLBACK` as committed commands
  (today "recorded in the log only").
- A committed-apply path that executes a prepared operation list exactly once
  in the same application transaction as the outcome row and applied index.
- A participant outcome read that answers from durable rows and in-flight
  proposals, never from a missing session.

## 2. Mechanism

Leader, 2PC (`prepareTransaction`):

1. Capture `operations`, `writeSet`, `transactionEpoch` from the session.
2. End speculative staging: SQLite `ROLLBACK` of the session (the leader's
   local state is no longer ahead of consensus). This is the inverse of today's
   `:736` ordering and removes the window the red witness P1 measures.
3. Propose `PREPARE_TRANSACTION {sessionId, transactionEpoch, operations,
   writeSetKeys, operationDigest, proposedBy, timestamp}` through
   `proposeTransactionMarker`, now awaiting the committed-entry answer the way
   `applyWrite` awaits its commit callback (`write-metrics-base.js:657+`,
   `getPendingCommittedWriteOutcome`).
4. Apply (every replica, same committed prefix): re-run the conflict check
   against durable committed state; on no conflict write the PREPARED row with
   the operation list and digest; on conflict write REFUSED. Idempotent by
   `(sessionId, epoch, digest)`; a different digest for the same key is refused
   (CONFLICTING_CONTENT). Acknowledge PREPARE to the coordinator only from the
   applied outcome.

Leader, decision (`commitTransaction` / `rollbackTransaction` after PREPARED):

5. Propose `TRANSACTION_COMMIT {sessionId, transactionEpoch}` (2PC: operations
   come from the PREPARED row; 1PC: the marker carries the operations and the
   same staging-end precedes it) or `ROLLBACK {sessionId, transactionEpoch}`.
6. Apply COMMIT: inside the application transaction, read the PREPARED row (or
   the marker's operations for 1PC), execute each operation in order, write
   the outcome row COMMITTED and the prepared state COMMITTED; the rs-raft
   applied index is written by the same transaction (`durable-ready-loop.test.js`
   "the configuration and its applied index are one write"). A key already
   COMMITTED is a no-op replay; ROLLED_BACK -> COMMIT is refused
   (OUTCOME_REVERSAL). CDC is scheduled as a post-commit effect on the leader
   only, as today (`entry-apply-base.js:1057-1060`); recoverable delivery after a
   crash between data commit and CDC emission is specified in section 2a.
7. Apply ROLLBACK: prepared state ROLLED_BACK, outcome row ROLLED_BACK, nothing
   executed; COMMITTED -> ROLLBACK refused.

Outcome read (`resolveTransactionCommitOutcome`, consumed by the coordinator):

8. COMMITTED / ROLLED_BACK from the outcome row. PREPARED -> UNKNOWN (awaiting
   the coordinator's decision). No row: UNKNOWN while a proposal for that
   `(sessionId, epoch)` is in flight on this leader or the session is open;
   otherwise NOT_PREPARED (typed; a 2PC coordinator may treat NOT_PREPARED as
   proof of noncommitment because COMMIT requires PREPARED; a 1PC coordinator
   may not, and keeps UNKNOWN until its own decision record answers).

2a. CDC after a crash between data commit and emission: the outcome row carries
the committing entry's index/term; on restart the leader re-emits CDC for
COMMITTED transactions whose emission was not confirmed, keyed by entry
identity, through the existing CDC owner's deduplication. This is specified,
not implemented, in this leg; its witness is A5's crash boundary.

## 3. Typed failure edges

| Edge | Typed outcome | Fails closed? | Caller observes |
| --- | --- | --- | --- |
| PREPARE with no active session | existing `NO_ACTIVE_TRANSACTION_PREPARE` | yes | error, nothing proposed |
| PREPARE conflict at apply | prepared state REFUSED, reason `PREPARE_CONFLICT` | yes | prepare failure with conflicts |
| duplicate PREPARE, same digest | idempotent PREPARED | n/a | success, same prepared identity |
| duplicate PREPARE, different digest | `PREPARE_CONFLICTING_CONTENT` | yes | refusal, PREPARED row unchanged |
| COMMIT without PREPARED (2PC) | `COMMIT_REFUSED_NOT_PREPARED` | yes | refusal, no apply |
| COMMIT after ROLLED_BACK / ROLLBACK after COMMITTED | `OUTCOME_REVERSAL_REFUSED` | yes | refusal, rows unchanged |
| marker proposed while not leader | existing leader gate (`:981`) | yes | no proposal; caller retries through routing |
| proposal lost / no commit callback within budget | UNKNOWN (no settlement) | yes | coordinator keeps the obligation |
| operation fails at apply (nondeterminism) | outcome `APPLY_FAILED` recorded, group host failure surfaced | yes | typed failure; no partial apply (application transaction rolls back) |
| persistence refused (user transaction open) | existing deferral `USER_TRANSACTION_OPEN` | yes | Ready stays in the core |
| prepared hold past its legal budget | reenter the decision owner; PREPARED never erased | yes | hold reported, obligation kept |
| outcome read for unknown session, nothing in flight | `NOT_PREPARED` (new), never COMMITTED | yes | coordinator decides per commit mode |

## 4. Cached-view audit

| View | Today | Under this design |
| --- | --- | --- |
| `activeTransactions`, `preparedTransactions` (process maps) | authoritative for PREPARE/COMMIT | `activeTransactions` stays volatile (staging only); `preparedTransactions` becomes a read-through of `_prepared_transactions`; restart and leader change rebuild it from rows |
| `preparedStateLostSessions` | marks prepared sessions lost on restart | removed: nothing prepared is lost; its `buildPrepareLostResponse` callers become reads of the durable row |
| `rowCommitEpoch`, `committedWriteLog` (conflict memory) | rebuilt only from in-process commits | must be rebuilt from durable committed statement outcomes on restart, or the apply-time conflict check reads the durable outcome rows; gap recorded as its own edge |
| `_transaction_outcomes` | written before local COMMIT, before consensus | written only by committed-entry application, same transaction as apply |
| coordinator `sql_transaction_participants` / cache | query lane | unchanged here; the coordinator must not read a missing row as COMMITTED |
| leader's SQLite data during staging | visible to local readers before consensus (red P1) | staging ends before proposal; data appears only through committed apply |

## 5. Identity anchoring

- `sessionId` (normalized by `normalizeTransactionSessionId`) and
  `transactionEpoch`: the row key of every durable record.
- `operationDigest`: sha256 over the ordered `{type, table, sql, params}`
  list; pins idempotent vs conflicting PREPARE.
- `entryId` per operation (minted by `buildPartitionWriteEntry`): pins each
  operation's committed statement outcome.
- `(index, term)` of the PREPARE and decision entries: recorded on the prepared
  row; a replay of the same entry is a no-op, a later term's conflicting
  decision for the same key is refused.
- Partition identity and replica identity from the service; the application
  transaction's applied index from the rs-raft store.
- Anchor movement: leadership change between PREPARE and decision is safe
  because the new leader reads the PREPARED row; a coordinator epoch change is
  a new `transactionEpoch` key and cannot touch the old row.

## 6. Witness ladder and order

Red now: P1, P2 in `partition-transaction-replicated-apply.test.js`.
Next reds before source changes: duplicate/conflicting PREPARE, COMMIT without
PREPARED, outcome reversal, outcome read on a missing session, restart after
PREPARE (process restart of the controllable partition over the same db file).
Then A1-A5 of the PR100 design on a real three-replica rs-raft group.

Implementation order (participant lane): durable prepared/outcome records and
their committed-apply branches; PREPARE ends staging and awaits its applied
outcome; 1PC COMMIT follows the same path; outcome read semantics; then the
coordinator seam (query lane) consumes PREPARED/NOT_PREPARED and persists its
decision before fanout.
