---
audience: development
documentClass: planning
---

# TX1 Leg A design, revision 2 (2026-10-10)

Quest `replicated-transaction-decision-and-apply` (sealed df51b799a). Supersedes
[revision 1](design-leg-a-2026-10-10.md), which the independent design vet
rejected (REVISE, recorded in `log.ndjson`). This revision answers each blocker
and the seven decisions of the local handoff's section 3. Citations are
`file:line` on 1bd3921597c2cc35ea91884dc925fe7c719ce6bd unless noted. Owner split
as in [`seam-2026-10-10.md`](seam-2026-10-10.md): the participant/replication
lane is designed here; the coordinator lane's obligations are named, not designed.

## 0. What changed since revision 1 and why

| Vet blocker | Revision 2 answer |
| --- | --- |
| Staged rows visible on the shared connection | No open SQLite transaction between session requests (F6 c'): each request validates in a synchronous SAVEPOINT that is rolled back before the request returns; reads inside the session replay the staged operations in a savepoint. Section 1. |
| No fence on the write set | A replicated, durable partition reservation written by the committed PREPARE; every later committed write command is dispositioned against it deterministically. Section 3. |
| Conflict check has no durable input | The reservation IS the conflict authority; leader memory becomes advisory. Section 3. |
| APPLY_FAILED contradicts itself | Deterministic statement failure is settled under a SAVEPOINT on every replica as a recorded outcome; after PREPARED, validation has already run, so apply cannot fail deterministically; a single-replica storage failure is a host failure that records nothing. Section 4. |
| Lagging-leader outcome read | UNKNOWN unless a durable terminal row or committed tombstone exists; the coordinator's decision record is the authority for "never prepared". Section 5. |
| Non-unique key, epoch not on the wire | `transactionId` allocated once by the coordinator, carried on every request and command with `participantId` and `commitMode`. Section 2. |
| Uncited log-scan authorities | `reconstructPreparedState` and `hasPendingPreparedTransactions` move to the `_prepared_transactions` row owner. Section 6. |
| Late PREPARE after ROLLBACK, no 1PC end state | A committed ROLLBACK tombstone per key; first authorized terminal applied wins and a later PREPARE for a terminal key is REFUSED_TERMINAL. Section 4. |
| P1/P2 await the ack before consensus | Witnesses drive the port's commit while the request is pending, then await the answer; atomicity measured; positive controls in separate tests. Section 8. |

## 1. Isolation throughout ACTIVE (F6 c')

Consumed: F6 record `solve/epics/raft-rs-full-cutover/quest-records/raft-rs-single-path-partition-cutover/design-f6-session-transaction-isolation.md`
section 3(c) and (a1); the one-connection fact (its F0.1); `executeTransactionWrite`
`src/partition/partition-service-write-metrics-base.js:193-235` (runs the staged
statement on the shared connection inside the session's `BEGIN IMMEDIATE`);
`beginTransaction` `src/partition/partition-service-transaction-base.js:560-642`;
read-your-writes today = the open transaction itself.

Mechanism:

- BEGIN no longer opens a SQLite transaction. A session is a volatile record
  `{transactionId, sessionId, epoch, operations[], writeSetKeys, replayBytes}`.
- A session write: admit (`admitCommittedCommand`, WRITE_PATH origin), then
  validate deterministically inside `SAVEPOINT tx_validate`: replay the session's
  earlier operations, run the new statement, capture `changes`, `ROLLBACK TO` and
  `RELEASE`, all synchronously within the request (better-sqlite3 is synchronous;
  no await while the savepoint is open; no statement object escapes). Append the
  operation `{type, table, sql, params, entryId}` to the session.
- A session read: `SAVEPOINT`, replay, run the read, `ROLLBACK TO`, `RELEASE`,
  synchronously; the answer is the only thing that leaves the savepoint.
- Replay bound: `operations.length` and encoded bytes are bounded by owned
  constants; exceeding either is a typed refusal `SESSION_REPLAY_BUDGET_EXCEEDED`
  (the caller may PREPARE or ROLLBACK, not write more).
- Observer scope: between requests the connection is in autocommit, so neither
  other sessions nor sessionless readers nor consensus persistence can observe or
  be erased by staging. Read-your-writes holds inside the owning session only,
  exactly as today's contract promises; stable reads against concurrent committed
  writes are NOT promised (no row MVCC); the reservation in section 3 is the only
  conflict rule.
- Determinism: the staged operation list is what replays and what is applied;
  the leader's validation result (`changes`) is advisory. `lastInsertRowid` and
  `changes` returned to the client come from the committed application (as for
  any replicated write today). Nondeterministic SQL functions are the same class
  as in ordinary replicated statements; they are not newly introduced here.

Explicit supersession this implies (listed, decided with their owners at
implementation): Property 12 of `test/partition/partition-transaction.property.test.js:227`
("prepare stages locally without a marker and the commit marker follows the
SQLite commit"), the persistence-admission contract wording "ends its session
before it proposes a marker" (`test/shards/impact-contracts.json:565-578`, which
becomes vacuous rather than false), W6 of
`test/transaction/session-transaction-isolation.test.js:286` (marker after the
session's terminal statement), Property 13 (:525, reconstruction from the log)
and Property 15 (:590, hold timeout releases prepared state autonomously, which
section 4 forbids). Properties 1, 5, 6, 10, 11 keep their meaning.

## 2. Exact identity end to end

Consumed: `sql_transactions.transaction_id` already exists as the coordinator's
primary key (`src/bootstrap/system-table-workflow-schema-definitions.js:15-31`);
today PREPARE/COMMIT/ROLLBACK deliveries carry only `sessionId` and an optional
`transactionEpoch` (`src/query/sql-query-engine.js:569-590`); the participant keys
`_transaction_outcomes` by `(session_id, transaction_epoch)`
(`src/partition/partition-service-constants.js:89-104`).

- Key: `transactionId` (coordinator-allocated, never reused) + `partitionId`.
  `sessionId` stays routing/session context; `transactionEpoch` stays the
  snapshot epoch. Every BEGIN/write/PREPARE/COMMIT/ROLLBACK/outcome request and
  every committed transaction command carries `transactionId`, `participantId`
  (= partitionId), `commitMode` and `transactionEpoch`. A request without a
  `transactionId` is refused `TRANSACTION_ID_REQUIRED` (typed), so the legacy
  session-only path cannot reach the new owner silently.
- Durable bytes: the proposal codec encodes with `JSON.stringify` and decodes
  with `JSON.parse` (`src/raft/raft-rs-proposal-codec.js:33-55`); no key-order
  canonicalisation exists. The design pins the encoded bytes of the operation
  list by building every operation through one owner (`buildPartitionWriteEntry`,
  `src/partition/partition-write-kernel.js:215-231`, whose key insertion order is
  fixed) and digesting `encodeProposal(operations)` bytes (sha256). Parameter
  values are restricted at admission to JSON scalars (string, finite number,
  boolean, null); Buffer, BigInt, undefined and nested objects are refused
  `UNSUPPORTED_PARAM_TYPE` before staging. The digest is recorded on the PREPARED
  row and compared on duplicate PREPARE.
- Per-operation `entryId`: each staged operation keeps its minted entryId, and
  committed-statement outcomes are recorded per entryId inside the transaction's
  apply transaction, so a partial apply is impossible (one application
  transaction) and a replayed transaction command finds every entryId settled.

## 3. A durable PREPARE promise: the partition reservation

Consumed: `admitCommittedCommand` `src/partition/partition-committed-command-admission.js:125`;
committed statement apply `src/partition/partition-service-entry-apply-base.js:1015-1060`;
`checkWriteConflicts` `partition-service-transaction-base.js:242` over
`rowCommitEpoch`/`committedWriteLog` (`partition-service-core-base.js:185-186`,
leader-only, never rebuilt); the split/merge mirror origin field on committed
entries (`partition-service-cdc-stream-base.js:136`, `partition-write-metrics-base.js:675,753`).

Mechanism (conservative, deterministic, replicated):

- `_prepared_transactions (transaction_id PK, partition_id, session_id,
  transaction_epoch, commit_mode, operations_json, operation_digest,
  write_set_json, state, prepare_index, prepare_term, decision_index,
  decision_term, updated_at)`, state in {PREPARED, COMMITTED, ROLLED_BACK,
  REFUSED}. Written only by committed-entry application.
- Reservation rule (phase 1, partition-level): while any row is PREPARED, every
  other committed command that writes application rows on this partition
  (ordinary write, another transaction's PREPARE, schema change, mirror apply)
  is dispositioned `REFUSED_RESERVED`: recorded as that entry's committed-statement
  outcome, nothing applied, the proposer answered with the typed refusal and
  `deferRetry`. The log is never stalled: the disposition is immediate and
  non-mutating. Commands of the reserving transaction itself (its COMMIT/ROLLBACK)
  are admitted. Row-level reservation on `write_set_json` is a later refinement
  with the same disposition shape.
- PREPARE validity is decided at apply from durable committed state only: no
  other PREPARED row -> PREPARED; otherwise REFUSED (reason RESERVED). The
  leader's `checkWriteConflicts` becomes an advisory early refusal at staging and
  is never an authority. Every replica reaches the same row because the inputs
  are the committed prefix only.
- Protection survives leader change and restart because it is a row in the
  partition database written by the apply transaction, included in checkpoints as
  ordinary application state.
- Cost: ordinary writes on a partition are refused with `deferRetry` for the
  duration of one transaction's PREPARE-to-decision window; bounded by the
  coordinator's budget and recovery, visible as a typed refusal, never a stall.
  This is the honest price of a correct 2PC without row MVCC and is recorded as
  the phase-1 limit.

## 4. Terminal authority at the participant

- COMMIT applies iff a PREPARED row exists for `transactionId` with the same
  digest (2PC) and the command names the same `commitMode`; it executes the
  stored operations in order inside the application transaction, records each
  entryId's committed-statement outcome, sets the row state COMMITTED with the
  decision entry's `(index, term)`, writes `_transaction_outcomes` COMMITTED, and
  the rs-raft applied index in that same transaction (the owner already writes
  configuration and applied index as one write, `test/raft/raft-rs-backend/durable-ready-loop.test.js:259`).
- ROLLBACK terminalizes: state ROLLED_BACK, outcome ROLLED_BACK, nothing
  executed. A ROLLBACK for a key with no PREPARED row writes a ROLLBACK tombstone
  row (state ROLLED_BACK, no operations) so that a late PREPARE for that key is
  `REFUSED_TERMINAL` and the outcome read is definitive. This closes the
  late-PREPARE-after-ROLLBACK gap and gives 1PC a terminal state for a lost
  marker once the coordinator decides to roll back.
- First authorized terminal applied wins; the opposite terminal afterwards is
  `OUTCOME_REVERSAL_REFUSED`. This is idempotence among authorized decisions
  only: it does not authorize a participant to roll back after a global COMMIT;
  the coordinator's immutable decision (section 5) decides what is authorized.
- Deterministic statement failure inside COMMIT (constraint violation that the
  validation savepoint could not foresee only if the committed base state changed,
  which the reservation prevents) is impossible after PREPARED; the design still
  settles any such failure identically on every replica under a SAVEPOINT as
  outcome `COMMIT_APPLY_FAILED` with the whole transaction rolled back to the
  savepoint, applied index advanced, nothing partially applied. A single-replica
  storage failure is the existing host failure (`groupHostFailure`), records
  nothing, and the group recovers through its existing owner.
- Expiry: the prepared-hold sweep (today `PREPARED_HOLD_TIMEOUT_MS`,
  `partition-service-transaction-base.js:18`) may report and re-enter the
  coordinator's recovery owner; it never writes a terminal state. Property 15 is
  superseded explicitly.

## 5. One decision and exact outcomes (seam obligations)

Participant (local lane):

- `resolveTransactionCommitOutcome(transactionId)` answers COMMITTED or
  ROLLED_BACK from `_prepared_transactions`/`_transaction_outcomes`; PREPARED ->
  UNKNOWN; absent -> UNKNOWN. Never NOT_COMMITTED from absence: a delayed
  PREPARE or COMMIT may still arrive, and only the coordinator's durable decision
  (or a committed tombstone) is definitive. The sealed test
  `test/partition/partition-service.test.js:365` ("never-delivered-session" ->
  NOT_COMMITTED) is superseded explicitly by this rule.
- The outcome answer carries `{transactionId, partitionId, state, decision_index,
  decision_term}` so proof identity survives the hop to the coordinator.

Coordinator (query lane, recorded, not designed here): persist one immutable
decision (conditional monotonic write on `sql_transactions`, not the mutable
status UPSERT nor `commitPointReached`) before any COMMIT fanout; resolve an
uncertain decision write before choosing an incompatible decision; treat
participant UNKNOWN as pending, never as COMMITTED (`resolveParticipantCommitMiss`
`src/query/distributed/distributed-transaction-protocol.js:669-685` today returns
COMMITTED on `NO_TRANSACTION` in 2PC); never enter rollback after the decision
(`abortTimedOutTransaction` `:258-275` today can). Falsifiers are in the seam.

## 6. One recovery/apply authority

- `reconstructPreparedState` (`partition-service-transaction-base.js:104-174`,
  a committed-log scan on fields `epoch`/`writeSet`) reads `_prepared_transactions`
  instead; `preparedStateLostSessions` is removed (nothing prepared is lost).
- `hasPendingPreparedTransactions` (`src/raft/snapshot-checkpoint-store.js:208`,
  a log scan to the checkpoint boundary) reads PREPARED rows in the checkpoint
  copy; because the rows are application state, a checkpoint carries them and the
  gate becomes "any PREPARED row in the copy", consistent with the log.
- Mirror apply: transaction operations run through the same committed-statement
  path as ordinary writes, so the `splitMirrorOrigin` handling of that path
  applies unchanged; a mirror command arriving while a reservation holds is
  `REFUSED_RESERVED` like any other write.
- CDC: the leader emits per-operation CDC from the apply's post-commit effect as
  for ordinary writes (`entry-apply-base.js:1057-1060`). The existing buffer
  (`src/partition/cdc-event-buffer.js`, in-memory, identity dedup) and delivery
  replay (`src/partition/partition-cdc-delivery.js`) are volatile; durable
  delivery across a crash between data commit and emission is NOT provided for
  ordinary writes today either. Receipt 8 stays red until a CDC cursor/retention
  owner exists; this design does not claim it.

## 7. 1PC: decision to take with the query owner

The sealed statement requires a coordinator decision before COMMIT fanout for
both modes. A one-round 1PC in which the single participant's apply-time
validation can refuse an unconditional COMMIT contradicts that promise. Two
consistent options, for the query owner to choose and, if the second, to
supersede explicitly:

- (A) prepare-first: 1PC runs PREPARE then COMMIT (two participant rounds plus
  the decision write); correct under the current promise; the participant
  implements nothing 1PC-specific.
- (B) participant-decided 1PC: the coordinator persists an intent, the single
  participant's committed PREPARE_AND_COMMIT command is the decision, and the
  coordinator records the participant's outcome; one round; requires superseding
  the "decision before fanout" promise for 1PC and a distinct command type.

Until chosen, the participant implements (A); a COMMIT without a PREPARED row is
`COMMIT_REFUSED_NOT_PREPARED` in both modes.

## 8. Witnesses (red now) and the proof ladder

`test/partition/partition-transaction-replicated-apply.test.js` is rewritten so
consensus progress never depends on first receiving its own acknowledgment:

- P1 (visibility): a request is started and left pending; while it is pending the
  proposal is observed, the leader's connection shows no staged row to a
  sessionless reader; then the port commits the marker on the leader and the
  pending request resolves. Red today: the row is visible and the request
  resolves before any commit.
- P2 (replicated application and atomicity): the follower applies the committed
  marker; after apply, the row is present, the outcome row is COMMITTED and the
  follower's durable applied index equals the marker's index. Red today.
- P3 (fault): a two-operation transaction whose second statement violates a
  constraint applies nothing and records a typed outcome, applied index
  advanced. Red today (first row applied, nothing recorded).
- Positive controls, separately executed: an ordinary committed write still
  applies exactly once and advances the applied index; replay of a committed
  marker applies nothing twice.

Next reds before source changes (vet's list, kept): intervening plain write
between PREPARE and COMMIT (`REFUSED_RESERVED`); late PREPARE after a ROLLBACK
tombstone; outcome read on a lagging replica -> UNKNOWN; identity collisions on
`sessionId` with distinct `transactionId`; same PREPARE on a leader with conflict
memory and a restarted follower without it writes the same row; restart after
PREPARE reconstructs from the row owner; PREPARE on a non-leader typed refusal;
`entryId` collision refused; hold sweep keeps PREPARED. Then PR100 A1-A5 on a
real three-replica rs-raft group. The controllable port proves scheduling, not
durability: restart and quorum witnesses use the real backend.

Receipts: the eight sealed ids keep their meaning; the atomicity receipt binds P2
and P3 (not row count alone); receipt 6 is owned by the query lane; receipt 8
stays red until the CDC owner exists.
