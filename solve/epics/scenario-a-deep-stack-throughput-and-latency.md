---
id: scenario-a-deep-stack-throughput-and-latency
status: done
proof: deterministic
roadmapRow: null
doneWhen:
  probe: script
  args:
    command: node scripts/checks/scenario-a-deep-stack-throughput-and-latency-guard.js --metric
    target: 0
quests:
  - scenario-a-deep-stack-throughput-and-latency
authorizes:
  - CHANGELOG.md
  - RELEASE.md
  - charts/lagrange-node/Chart.yaml
  - data/tidb-comparison
  - docs/benchmarks
  - knip.json
  - package-lock.json
  - package.json
  - scripts/check-cognitive-complexity.js
  - scripts/check-complexity.js
  - scripts/check-duplication.js
  - scripts/checks
  - solve/changes
  - solve/epics
  - src/cache
  - src/cdc
  - src/cli/cli-constants.js
  - src/constants/entrypoint.js
  - src/control-plane
  - src/partition
  - src/query
  - src/raft
  - src/workflow
  - test/distributed
  - test/partition
  - test/query
  - test/raft
  - test/shards
  - test/transaction
---

# Scenario A Deep-Stack Throughput and Latency Optimization

## Intent (why now)

Deliver the next structural order-of-magnitude reduction in Scenario A (`tidb-oltp-baseline`) transaction latency and multi-worker contention by eliminating redundant per-statement system-table Raft consensus rounds, fixing `SELECT ... FOR UPDATE` parameter binding and split-PK reservation resolution, batching concurrent Raft proposals per Ready cycle, scoping partition concurrency and prepare validation to canonical row keys, and reducing repeated SQLite staging replay.

## Independently Verified Root-Cause Findings (`v0.3.3` Baseline)

Independent verification against `v0.3.3` (`b41d4ccec4b2236bd2223c24cea07ed7d2a2c3c2`) confirmed five compounding bottlenecks across the query, coordinator, Raft, and partition layers:

### 1. Coordinator Metadata Persistence as Full Distributed SQL + Raft + CDC Writes
- **Verified Call Chain**:
  - `DistributedTransactionCoordinator` persistence callbacks (`src/query/sql-query-engine.js:146-163`, `src/query/sql-query-engine-transaction-persistence-methods.js:116-412`, `src/query/sql-query-engine-transaction-set-methods.js:44-78`) invoke `ControlPlaneSystemTableGateway.submitMutation` (`src/control-plane/control-plane-system-table-gateway-mutation-submission.js:161-257`) -> `CDCIntegrationService` (`src/cdc/cdc-integration-service-mutation-operations.js:228-445`) -> `executeSQL(sql, values, ...)`.
  - Every coordinator metadata mutation executes a full distributed SQL query, a 3-voter Raft proposal on `sql_transactions-p1`, `sql_transaction_participants-p1`, or `sql_write_operations-p1`, a `PRAGMA synchronous = FULL` WAL fsync, and—for `sql_transactions` and `sql_transaction_participants` (`CDC_POLICY_CLASS.CONTROL_INTERNAL_PROPAGATION` in `src/cache/cdc-table-policy.js:187-205`)—a committed CDC obligation and cluster-wide `SystemTableCache` broadcast.
- **Unconditional Per-Statement `retainParticipantSet` Raft Write**:
  - Both `executeReadStatement` (`src/query/distributed/distributed-transaction-statement.js:106-108` via `transactionRead.enlist(allParticipants)` in `src/query/sql-query-engine-select-execution.js:322`) and `executeWriteStatement` (`src/query/distributed/distributed-transaction-statement.js:58-61`) call `enlistParticipantsOwned` (`src/query/distributed/distributed-transaction-participant-set.js:63-88`).
  - Line 76 of `distributed-transaction-participant-set.js` unconditionally calls `await this.retainParticipantSet(tx, requested)` before checking `newlyEnlisted`, executing a full Raft-replicated `UPDATE sql_transactions SET participant_set_text = ...` on every single transactional `SELECT` and write statement even when `newlyEnlisted.length === 0` and `text === tx.participantSetText`.
- **Commit Protocol System-Table Multiplier (`8 + 4P` Raft Writes)**:
  - `COMMIT` executes `freezeParticipantSet`, `setTransactionStatus('PREPARING')`, $P \times$ `persistParticipant('PREPARING')`, $P \times$ `persistParticipant('PREPARED')`, `setTransactionStatus('PREPARED')`, `recordTransactionDecision`, `setTransactionStatus('COMMITTING')`, $P \times$ `persistParticipant('COMMITTING')`, $P \times$ `persistParticipant('COMMITTED')`, and `setTransactionStatus('COMMITTED')`.
  - Because all $P$ participant rows live on `sql_transaction_participants-p1`, `Promise.all` across participants still serializes $4P$ Raft proposals on that single Raft group.

### 2. `SELECT ... FOR UPDATE` Parameter Omission & Split-PK Reservation Resolution Bug
- **Verified Call Chain**:
  - `executeSelectOwned` (`src/query/sql-query-engine-select-execution.js:350`) calls `this.finalizeSelectSuccess(ast, sessionId, queryOptions, transactionRead, result, partitionIds)` without passing `params`.
  - `finalizeSelectSuccess` (`lines 240-246`) calls `executeLockingReadReservations` without `params`, so `src/query/sql-locking-read-execution.js:279` resolves `params = []`.
  - None of the 5 Scenario A `FOR UPDATE` queries in `test/distributed/reference-client/lagrange-oltp-adapter.js:41-110` (`DISTRICT_NEXT_ORDER_FOR_UPDATE`, `STOCK_QUANTITY_FOR_UPDATE`, `DELIVERY_OLDEST_NEW_ORDER_FOR_UPDATE`, `DELIVERY_ORDER_FOR_UPDATE`, `DELIVERY_LINES_FOR_UPDATE`) project all primary-key columns in `SELECT`.
  - Consequently, in `resolveCanonicalPkTuples` (`src/query/sql-locking-read-execution.js:143-161`):
    1. `allInProjection` (`line 148`) is always `false`.
    2. `extractPkFromWhereClause(ast.where, pkColumns, params)` (`line 151`) receives `params = []`, evaluates `$1, $2, ...` to `null`, and returns `null`.
    3. It falls back to `queryMatchingPkRows` (`lines 744-773`), issuing a second distributed `SELECT` RPC over the network with `statement.params === []` and stripping `ORDER BY` and `LIMIT`.
  - Furthermore, for `DELIVERY_OLDEST_NEW_ORDER_FOR_UPDATE` (`SELECT order_id FROM new_order WHERE warehouse_id = $1 AND district_id = $2 ORDER BY order_id ASC LIMIT 1 FOR UPDATE`), the 3-column PK `(warehouse_id, district_id, order_id)` is split between `WHERE` (`warehouse_id, district_id`) and the projected row (`order_id`). Merging `WHERE` equality-bound PK columns with projected row columns resolves the exact canonical PK tuple in memory with zero fallback queries.

### 3. Unbatched Per-Proposal `persistReady` WAL Fsyncs in `RaftRsRuntimeOwner`
- **Verified Call Chain**:
  - In `RaftRsRuntimeOwner.performCommand` (`src/raft/raft-rs-runtime-owner.js:1811-1820`), each `'propose'` command calls `invokeCoreAt(group, expectedGeneration, 'propose', command.bytes)` and immediately awaits `drainReady(group, expectedGeneration)` before `group.tail` (`enqueue`, `lines 1063-1089`) advances to the next queued proposal.
  - Each `drainReady` cycle calls `RaftRsDurableStore.persistReady` (`src/raft/raft-rs-durable-store.js:459-469`) -> `commitDurably` (`lines 200-216`), forcing a separate synchronous SQLite transaction and WAL `fsync` (`synchronous = FULL`) per proposal instead of batching concurrently queued proposals into the Raft core prior to draining `Ready`.

### 4. Partition Concurrency Serialization, False `40001` Conflicts, and Row-Key Extraction Bug
- **Verified Call Chain**:
  - `buildCreateTableMetadataContext` (`src/query/table-creation-service-create-table.js:174-218`) creates every table with a single initial partition (`${tableId}-p1`).
  - Even when `concurrencyGranularity === 'row-key'` (`src/partition/partition-participant-transaction-session.js:44-62`) is enabled:
    1. `checkAndRecordSessionRowKey` (`lines 64-80`) extracts `String(params[0])` as the row key. For `UPDATE` statements (`UPDATE warehouse SET ytd_cents = ytd_cents + $1 WHERE id = $2`, `UPDATE district SET next_order_id = $1 WHERE warehouse_id = $2 AND district_id = $3`, `UPDATE stock SET quantity = $1 ... WHERE warehouse_id = $4 AND item_id = $5`), `params[0]` is the updated value (`amountCents`, `nextOrderId`, `nextQuantity`), not the primary key; and for composite-PK tables, `params[0]` is only `warehouse_id`.
    2. `canAdmitConcurrentParticipantSession` (`lines 58-62`) blocks any new `BEGIN` whenever any session on the partition is in `PREPARING` or `PREPARED`.
    3. `sealSession` (`src/partition/partition-participant-transaction-request.js:352`) and `applyParticipantPrepare` (`src/partition/partition-participant-transaction-apply.js:318`) validate the partition-wide `_participant_write_generation` (`g`), so any committed write on a partition causes all other concurrent transactions on that partition—even on disjoint row keys—to abort at `PREPARE` with `40001`.
    4. `isPartitionReserved(service.db)` (`src/partition/partition-participant-transaction-apply.js:315`) rejects `applyParticipantPrepare` if any row exists in `_prepared_participant_transactions` on that partition.

### 5. $O(N^2)$ Leader Staging Replay Across Multi-Statement Transactions
- **Verified Call Chain**:
  - `stageWrite` (`src/partition/partition-participant-transaction-staging.js:253`) and `readInSession` (when `session.operations.length > 0`, `line 301`) call `validateOverReplay` (`lines 168-181`), which replays all $k-1$ prior staged operations inside a rollback transaction on every new statement, resulting in $N(N+1)/2$ SQLite executions during leader staging before `dryRunCarriedOperations` (`PREPARE`) and `runCommittedOperations` (`COMMIT`).

---

## Workstreams & Planned Quests

1. **Quest 1 — Locking-Read Parameter Propagation & Split-PK Canonical Tuple Resolution**:
   - Pass `params` through `executeSelectOwned` -> `finalizeSelectSuccess` -> `executeLockingReadReservations`.
   - Enhance `resolveCanonicalPkTuples` in `src/query/sql-locking-read-execution.js` to merge equality-bound PK columns from `ast.where` with projected columns in `selectResult.rows` before falling back to `queryMatchingPkRows`.
   - Preserve `params`, `orderBy`, `limit`, and `offset` in `queryMatchingPkRows` when a fallback query is required (e.g., `DELIVERY_LINES_FOR_UPDATE` where `line_number` is unprojected).

2. **Quest 2 — Coordinator System-Table Consensus Reduction & Commit Coalescing**:
   - In `enlistParticipantsOwned` (`src/query/distributed/distributed-transaction-participant-set.js`), skip `retainParticipantSet` when `newlyEnlisted.length === 0` and `participantSetText` is unchanged while preserving CAS authority fencing when the participant set changes or freezes.
   - Coalesce non-decision-bearing intermediate coordinator status transitions (`PREPARING`, `PREPARED`, `COMMITTING` on `sql_transactions` and transient `PREPARING`/`COMMITTING` status writes on `sql_transaction_participants`) while preserving:
     - SQLite trigger `sql_transactions_initial_lineage_v1`,
     - CAS fencing on `participant_set_text` and `decision IS NULL`,
     - durable `PREPARED` participant evidence (`prepared_digest`, `prepare_index`, `prepare_term`) before `persistDecision`, and
     - terminal `COMMITTED` / `ROLLED_BACK` recovery semantics.

3. **Quest 3 — Raft Runtime Proposal Batching (Group Commit per Ready Cycle)**:
   - In `RaftRsRuntimeOwner` (`src/raft/raft-rs-runtime-owner.js`), batch concurrently queued `propose` commands on the same Raft group into the Raft core before invoking `drainReady`, so a single `take_ready` -> `persistReady` (`synchronous = FULL` WAL fsync) -> `sendMessages` -> `advance_ready` cycle commits the entire concurrent batch while strictly preserving Raft Ready persistence ordering.

4. **Quest 4 — Canonical Row-Key Partition Concurrency & Row-Scoped Prepare Validation**:
   - Fix `checkAndRecordSessionRowKey` (`src/partition/partition-participant-transaction-session.js`) to derive canonical primary-key / target-row identity from the statement (`INSERT` values or `UPDATE`/`DELETE`/`SELECT` `WHERE` PK equalities) rather than `params[0]`.
   - When `concurrencyGranularity === 'row-key'` is active, scope session conflict admission, `sealSession` / `applyParticipantPrepare` validation (`validationText`), and prepared reservations to the transaction's canonical row keys (falling back to partition-wide generation fenced validation when a statement touches a non-PK predicate), preserving deterministic replica agreement during `applyParticipantPrepare`.

5. **Quest 5 — Incremental Session Staging & Scenario A End-to-End Verification**:
   - Reduce $O(N^2)$ staging replay overhead in `partition-participant-transaction-staging.js` for disjoint-row staged writes while preserving read-your-own-writes and `REPLAY_DIVERGED` detection.
   - Prove the combined speedup and consensus-round reduction across `Payment`, `New-Order`, and `Delivery` transactions with deterministic metrics and guard verification.
