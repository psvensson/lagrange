# Distributed-transaction replicated apply: current mechanism (phase 1, 2026-09-26)

Quest `distributed-transaction-replicated-apply`, phase 1. This phase gathers
evidence only. Nothing here repairs anything.

- Finding: F-TX-REPLICATED-APPLY.
- Head measured: see "Measurements" (the lab commit is named there).
- Source head read: 19995c7bc. `git diff --stat 33885263f 19995c7bc -- src/`
  is empty, so every src citation below holds on main 33885263f too.
- The line-by-line census is the read-only census report produced in parallel
  for the lead (`tx-census-report.md`, scratchpad of the lead's session). This
  document merges its table and cites it rather than re-deriving it. It also
  merges a second read-only investigator's CDC, 40 s and PREPARE answers.

## The claim under test (frozen)

> After a distributed transaction's COMMIT is acknowledged to the public
> application session, the transaction's rows are present in the authoritative
> SQLite state of EVERY replica of the affected partition, exactly as an
> autocommit row is.

Verdict: FALSE, measured on a real three-process RF=3 cluster. The
Measurements section below gives the numbers.

## Current state machine

The table follows one transaction from `db.transaction` to recovery. For each
step it gives the owner, the durable state produced, whether that state is
replicated, and whether the client's success waits for it.

| # | Step | Owner (file:line at 19995c7bc) | Durable state produced | Replicated? | Awaited before the client sees success | Idempotency key | Recovery authority |
|---|---|---|---|---|---|---|---|
| 1 | `db.transaction()` | src/query/application-database.js:456-536 (BEGIN :475-481, COMMIT :519-525) | none (in-process session record) | n/a | yes, waits for the COMMIT result | `sessionId = application:<id>:<uuid>` :463 | one ROLLBACK when the callback fails |
| 2 | pgwire BEGIN/COMMIT | src/runtime/pgwire-protocol-handler.js:602-681 | none | n/a | yes | pg session | none: a failed session stays FAILED |
| 3 | SqlCore dispatch | src/query/sql-query-engine-statement-execution.js:473-479; sql-query-engine.js:352-401 | none | n/a | yes | sessionId | none |
| 4 | Coordinator BEGIN | src/query/distributed/distributed-transaction-coordinator.js:195-262 | `sql_transactions` row, written as an autocommit system-table write | yes (the coordinator row only) | yes | transactionId = f(sessionId) | 60 s budget (control-plane/timeout-budget.js:20), then the recovery sweep |
| 5 | Participant BEGIN | coordinator.js:299-345 -> sql-query-engine.js:530-575 -> partition-service-entry-apply-base.js:384-446 -> partition-service-transaction-base.js:522-593 (`BEGIN IMMEDIATE` :573) | an open SQLite transaction on the one connection of whichever replica answered (no leader check) | NO | yes | sessionId; a second session is refused :560-565 | 60 s hold sweep (:375-448) |
| 6 | Statement inside the transaction | partition-service-write-metrics-base.js:113-119 -> `executeTransactionWrite` :193-235 (`stmt.run`, push to `operations`) | uncommitted page change on the staging replica only | **NO**: `proposeWrite` is used only by the autocommit branch | the client sees `changes` | entryId minted, **never checked** | ROLLBACK, hold sweep, or process death |
| 6b | Autocommit write, for contrast | applyWrite -> partition-service-raft-write-commit.js:108-231 (`raft.propose`, then waits for commit) | committed log entry plus a statement-outcome row on every replica | yes | yes | `entry:<entryId>` in `_partition_statement_outcomes` | log replay |
| 7 | PREPARE (2PC) | transaction-base.js:605-662: in-memory conflict check, then "No PREPARE marker ... LOCAL_STAGING" | none (moves an entry between two maps) | NO, since 64f420ace | yes | sessionId | hold sweep |
| 8 | Commit decision | coordinator.js:460-499; distributed-transaction-commit-mode.js:20-41 (one participant => 1PC); distributed-transaction-protocol.js:206-377 | `sql_transactions` status rows | yes (the rows only) | yes: success follows sequential `commitParticipant` calls | transactionId | recovery.js sweep, only after the budget expires |
| 9 | Participant COMMIT | transaction-base.js:669-751: outcome upsert :693, local `COMMIT` :698, `replicateTransactionCommit` :701 -> :904-921 -> `proposeTransactionMarker` :933-958, CDC :707-710, return | a local SQLite commit plus a local `_transaction_outcomes` row | marker only. It is proposed ONLY if this replica is the Raft LEADER (:941-943), fire-and-forget (not awaited), and a failure is logged at debug | local COMMIT yes; **consensus NO** | (session_id, transaction_epoch) | none |
| 10 | Participant ROLLBACK | transaction-base.js:763-849; marker :960-978 (same leader-only fire-and-forget path) | none | marker only (recorded, not applied) | yes | idempotent when no transaction is open | keeps the session visible when a heal is not permitted |
| 11 | Raft proposal | operation port `propose` (liferaft-provider.js:286 / raft-rs-operation-port.js:240) | log entry | yes, when reached | autocommit yes; the transaction marker no | entryId (autocommit only) | provider log |
| 12 | Raft apply | partition-service-entry-apply-base.js:1017-1152. SQL types: `stmt.run` :1079 plus an outcome row. TRANSACTION_COMMIT: `recordTransactionCommitOutcome` only (:1121-1136); `command.operations` is only counted for a debug log (:1131) | the outcome row only | yes | n/a | outcome PK | replay |
| 13 | SQLite mutation and reads | one WAL connection per replica, partition-service-raft-init-base.js:383 | | | | no `busy_timeout` | reads on the staging replica see the open transaction's uncommitted rows |
| 14 | Outcome record | `_transaction_outcomes` (constants.js:84-102). Writers: the staging replica :693 (inside the user transaction) and the marker apply :1123 on every replica that applies a marker. Reader: :875-902 (1PC commit-miss resolution) | one row per replica that saw either writer | partial | | PK (session_id, epoch) | **the answering replica's row, not a quorum** |
| 15 | CDC | from commitTransaction :707-710 on the staging replica, whatever its role, after the local COMMIT and before or without any marker commit. Autocommit CDC comes from apply on the leader only (:1102-1117) | subscriber delivery or the buffer | n/a | the transaction CDC is awaited before the participant answers | none | none |
| 16 | Recovery/replay | hold sweep (60 s, 1 s cadence, refused on a non-solo leader :389-401); durability fitness (partition-service-durability-fitness.js:147-203, 60 s hold); coordinator sweep; `reconstructPreparedState` (:67-140, reads rs-raft tables only, inert under liferaft); snapshot install (`db.backup` of the whole file) | | | | | **elapsed time, on every path** |

Two routing facts from the census (§5):

- `beginTransaction` has no leader check, so a BEGIN can stage on a follower.
- The session is then pinned to that follower. The follower redirects the
  session's writes to the leader (entry-apply-base.js:690-706). There they run
  as replicated autocommit writes, while the follower holds an idle
  `BEGIN IMMEDIATE`.

The same statement is therefore either local-only or replicated, depending on
which replica answered BEGIN. The settling run records which replica staged.

## History of the PREPARE marker (not assumed to be the fix)

- 12a52da9a (2026-03-08) introduced `replicatePreparedTransaction`.
  - It proposed `{type: PREPARE_TRANSACTION, sessionId, epoch, writeSet: [keys], timestamp, proposedBy, proposedAt}`.
  - It was proposed leader-only, fire-and-forget, inside the user's `BEGIN IMMEDIATE`.
  - Verified in `git show 64f420ace^:src/partition/partition-service-transaction-base.js:978-1004`.
- Follower apply had no branch for it ("recorded in the log only").
- Its only consumer was `reconstructPreparedState` on leader election. That
  rebuilt `preparedTransactions` with `operations: []`, for conflict checks
  only.
- **It never carried mutation content.**
- 64f420ace (2026-09-23, "wip: attempt A4 ... implementer output, unverified")
  deleted the PREPARE marker. It also reordered commit to: outcome row, local
  COMMIT, then marker. It reordered rollback to: local ROLLBACK, then marker.
  The reason was the rs-raft persistence admission (a consensus row must never
  be written inside a user transaction). The deletion removed conflict
  reconstruction on failover. It did not remove replication of data, because
  there never was any.
- From 30d64250a (2026-01-19, the first real commit) in-transaction writes
  never went through `proposeWrite`, and `operations[]` rode in
  TRANSACTION_COMMIT from day one.
- The earliest apply branch (2e0f6976c / 12a52da9a) is a debug log only, with
  the comment "operations already applied" (the lineage continues through
  e2797b6c8).
- No version ever executed `operations` on a follower.

Restoring PREPARE would therefore bring back failover conflict state, not
replica data.

## CDC origin

- Transactional CDC is published by `commitTransaction`
  (transaction-base.js:707-710 -> partition-service-cdc-stream-base.js:82) on
  the staging replica, from local execution.
  - This happens after the local COMMIT.
  - The marker has at most been proposed (not committed) by then, and none is
    proposed at all when the staging replica is not the leader.
  - There is no role check.
- Autocommit CDC is published from apply, on the leader only (entry-apply-base.js:1102-1117).
- The marker apply publishes nothing.
- An application table has no subscriber: partition CDC propagation is
  attached only for cache-hydration system tables
  (src/bootstrap/shared/cdc-propagation-filter.js:20-22), and live queries
  observe only the SystemTableCache.
  - The event is therefore parked in the partition's `cdcEventBuffer`
    (external CDC is allowed by default for user tables,
    partition-cdc-delivery.js:184-214).
  - It is logged at warn: "CDC event buffered while no subscribers
    registered", with tableName, operation and partitionId.
  - That log line is the measurement used below.
- **Consequence:** CDC publishes mutations that the replicated state machine
  never applied. A follower that later becomes leader never publishes them,
  and never has them. This violates R7 (CDC follows authoritative apply).

## Where the authoritative replicated mutation is absent

This is not a repair design.

Between `executeTransactionWrite` (write-metrics-base.js:193-235) and
`commitTransaction` (transaction-base.js:669-751), no entry that a follower
can execute is ever proposed:

- Each statement mutates only the staging replica's SQLite connection, inside
  the user's `BEGIN IMMEDIATE`.
- PREPARE moves a map.
- COMMIT commits locally, records a local outcome row, and acknowledges.
- Only then, and only if this replica happens to be the Raft leader, it
  fire-and-forgets a TRANSACTION_COMMIT marker. Every replica's
  `applyCommittedEntry` (:1121-1136) discards that marker's `operations[]`.

The replicated log therefore holds, at best, a claim that session S committed
at epoch E. It never holds the mutation.

The autocommit path (`applyWrite -> startPartitionRaftWriteCommit`,
partition-service-raft-write-commit.js:217-231, then apply :1062-1119) is the
only owner in the repository that does all of the following:

- puts a deterministic mutation into the log;
- waits for its commit;
- applies it identically on every replica, with an idempotent outcome row;
- publishes CDC from apply.

The transaction path never enters it.

Both providers feed the same `applyCommittedEntry`, and the propose-and-wait
seam is generic (the operation port `propose` plus the `waitForCommittedWrite`
registry). What is missing is a committed-command type whose apply executes a
transaction's statement list atomically. That is a partition
transaction/apply owner concern, not a provider seam.

## Measurements

MEASUREMENTS_PLACEHOLDER

## Docs contradicted by the measured behaviour

- architecture/process-replication.md:278 "Reads may be served by any
  routable replica" is true of routing. For committed transactional rows it
  yields [] from followers.
- architecture/process-replication.md:282-285 "A partition's prepared state
  is a durable `PREPARE_TRANSACTION` Raft entry, so prepared writes survive
  leader failover." No such entry has existed since 64f420ace. Nothing about
  a transaction survives failover.
- architecture/process-replication.md:290 "A write is acknowledged after
  majority commit." This is false for every in-transaction statement and for
  COMMIT.
- architecture/postgres-wire.md:262-264 "appends `PREPARE_TRANSACTION` in its
  Raft log before prepare success" is false.
- architecture/postgres-wire.md:274-276 says 1PC replay resolves from "the
  participant's SQLite-atomic outcome record". That record is atomic with the
  local commit only, and it is read from whichever replica answers.
- src/partition/partition-service-transaction-base.js:664-667 says "Ensures
  durability through Raft replication before acknowledging." This is false.

## Files and owners involved (read-only in phase 1)

- src/partition/partition-service-transaction-base.js: prepare, commit and
  rollback, marker construction, the outcome record.
- src/partition/partition-service-entry-apply-base.js: the TRANSACTION_COMMIT
  apply and the participant BEGIN/COMMIT dispatch.
- src/partition/partition-service-write-metrics-base.js:
  `executeTransactionWrite`.
- src/partition/partition-service-raft-write-commit.js: the propose-and-wait
  unit a repair must reuse, not duplicate.
- src/partition/partition-committed-command-admission.js and
  partition-service-constants.js: committed command types.
- src/partition/partition-service-cdc-stream-base.js: the CDC publication
  point.
- src/query/distributed/distributed-transaction-protocol.js and
  distributed-transaction-coordinator.js: commit acknowledgement, and 1PC
  outcome resolution from the answering replica.
- src/query/sql-query-engine.js:530-575 and src/query/query-executor-base.js:
  participant BEGIN leader-binding and session affinity.
- Interacting, unchanged: partition-service-durability-fitness.js, the hold
  sweep, distributed-transaction-recovery.js.
- Not touched, and read-only by rule: src/raft/**.
  - liferaft shares the partition connection for its log and has no
    `inTransaction` guard.
  - rs-raft refuses persistence while a user session holds the connection
    (raft-rs-durable-store.js:187-205).
