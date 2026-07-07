# Trace: self-referential 2PC participant hold on `replica_operations-p1`

Question: does a `replica_operations` ledger progress/terminal write NEED to open a
blocking 2PC participant `BEGIN IMMEDIATE` on its own partition, or is that hold
avoidable / mis-triggered?

All `file:line` at repo state of this trace. NO source edited.

---

## Executive answer

**No — a ledger progress write does not need 2PC, and the hold is already recognized
as avoidable in code.** The atomic-transition wrapper around a `replica_operations`
row update is a **single-partition** write with **exactly one durable participant**
(replica_operations-p1). The distributed 2PC transaction the wrapper opens provides
**zero atomicity benefit** (the partition's own raft log already commits the single row
atomically); its only effect is to drag in cross-partition 2PC bookkeeping writes to
`sql_transactions` / `sql_transaction_participants` / `sql_write_operations`, which is
the exact self-referential coupling that wedges when `sql_transaction_participants-p1`
is leaderless.

There is already a bypass (`bypassExecutionTransaction`) that skips 2PC for priority
control-plane partitions, and **`replica_operations` is already in the priority set**.
The residual hold on `replica_operations-p1` therefore comes from the class of ops that
is NOT bypassed — see Feasibility.

---

## Hop-by-hop call chain (progress write → BEGIN IMMEDIATE)

### Hop A — the transition wrapper decides 2PC vs plain write
`src/rebalancer/operation-workflow-transition-orchestration.js`
- `executeAtomicTransition(operation, step, reason, persistFn, options)` `:246`.
- **The branch** `:273` `if (options?.bypassExecutionTransaction === true)` →
  `transitionStep(...)` `:274` then `persistFn(null)` `:280` — a **plain single write,
  no transaction, no participant hold**.
- **Else (default 2PC path)** `:293-376`:
  - `sessionId = buildTransitionExecutionSessionId(...)` `:311`
  - `txCoordinator.begin(sessionId)` `:317` — registers an active transaction on the session.
  - `operationWorkflowCoordinator.transitionStep(...)` `:343` (in-memory only — see Hop F).
  - `persistFn(sessionId)` `:349` — the durable `replica_operations` UPDATE, carrying the session.
  - `txCoordinator.commit(sessionId)` `:363`.
- Both the terminal path (`operation-workflow-transition-persistence.js:286-313`) and the
  progress path (`operation-workflow-transition-orchestration.js:515-569`) feed
  `bypassExecutionTransaction` into `executeAtomicTransition`.

### Hop B — persistFn → single-partition UPDATE on `replica_operations`
`src/rebalancer/replica-operation-repository-mutation-persistence-methods.js`
- `persistOperationUpdate(operation, {sessionId,…})` `:151`, `:175-207` builds a
  `CONTROL_PLANE_MUTATION_OPERATION.UPDATE` on `SYSTEM_TABLE_NAME.REPLICA_OPERATIONS`
  and passes `sessionId: options.sessionId` `:188` into the gateway.
- Gateway dispatch: `replica-operation-repository-mutation-gateway-methods.js:156-203`
  → `gateway.submitMutation` / `gateway.updateSystemTableRow` (CDC integration service).

### Hop C — CDC gateway routes the SQL to the query engine (session preserved)
`src/cdc/cdc-integration-service-mutation-operations.js:367-419` `updateSystemTableRow`
→ `executeSQL(sql, params, {sessionId,…})` →
`src/cdc/cdc-routed-mutation-readiness.js:608-618` `executeSQL` → `writeRouter.execute`
→ `src/cdc/write-router/index.js:40-42` (SqlWriteRouter) → `executeSQLViaQueryEngine`
`src/cdc/cdc-routed-mutation-readiness.js:311`, which at `:514` calls
`sqlQueryEngine.executeQuery(sql, params, queryOptions)` with the `sessionId` carried
through `baseQueryOptions.sessionId` `:457-459`.
(A `tryExecuteLocalSystemTableWrite` local-leader bypass exists at `:57-123` /invoked `:502`,
but it calls `partitionService.executeQuery` directly and does NOT open a participant txn.)

### Hop D — the query engine's write path: `if (txState)` is the decision point
`src/query/sql-query-engine-write-execution.js` (UPDATE path `:220-373`; INSERT path `:25-178`)
- `const txState = this.transactionCoordinator.getTransaction(sessionId);` **`:246`** (UPDATE) / `:51` (INSERT).
- **`if (txState)` `:252` / `:56`** → `this.transactionCoordinator.enlistParticipants(sessionId, writePartitions)` **`:257-261`** / `:61-65`, then `recordWriteOperation` `:278` / `:82`.
- The actual data write is `this.distributedWriteCoordinator.executePlan(writePlan,…)` `:314` / `:119`.
- `writePartitions = Array.from(writePlan.partitionStatements.keys())` `:244` — for an
  `UPDATE replica_operations … WHERE operation_id=…` this resolves to a **single**
  partition, `replica_operations-p1`.

  **Whoever supplies a non-null `sessionId` with an active transaction is what turns a
  single-partition ledger UPDATE into a 2PC participant transaction.** With `sessionId`
  null/disabled, `getTransaction` returns null → no enlist → `executePlan` runs a plain
  single write (`distributed-write-coordinator.js:147-164`, `orderedPartitions.length === 1`).

### Hop E — enlistParticipants → beginParticipant → BEGIN IMMEDIATE
`src/query/distributed/distributed-transaction-coordinator.js`
- `enlistParticipants(sessionId, partitionIds)` `:242`:
  - `await this.beginParticipant(sessionId, partitionId, tx.transactionEpoch)` **`:258`** — opens the hold.
  - `await this.persistTransactionRecord(tx)` `:273` and `await this.persistParticipants(tx, newlyEnlisted)` `:274` — the **cross-partition 2PC bookkeeping** writes (Hop G), issued AFTER the BEGIN.
- `beginParticipant` wiring: `src/query/sql-query-engine-instance-initializer.js:168-174` →
  `engine.deliverTransactionOperation(sessionId, partitionId, QUERY_OPERATION.BEGIN, …)`.
- Delivered to the partition: `src/partition/partition-service-entry-apply-base.js:166-205`
  `handleTransactionMessage` → `case BEGIN_TRANSACTION:` `:175-177` → `beginTransaction`.
- `src/partition/partition-service-transaction-base.js:465` `beginTransaction` →
  `this.db.exec(PARTITION_SERVICE_SQL.BEGIN_IMMEDIATE)` (~`:512`) — the single-connection
  `BEGIN IMMEDIATE` that also gates `_raft_log` / `_raft_state`.

### Hop F — the transaction has only ONE durable write (2PC is spurious)
- `transitionStep` (Hop A `:343`) → `src/workflow/durable-workflow-coordinator.js:111-168`
  → `await this.persistWorkflow(workflow)` `:163`.
- For the rebalancer's `operationWorkflowCoordinator` this is `new DurableWorkflowCoordinator()`
  with **no `persistWorkflow` callback** (`src/rebalancer/rebalance-coordinator-lifecycle.js:217-218`),
  so `persistWorkflow` defaults to a **no-op** (`durable-workflow-coordinator.js:29`).
- Therefore the atomic transition's ONLY durable side effect is the `persistOperationUpdate`
  UPDATE to `replica_operations` (Hop B). The workflow-step advance is in-memory; the
  ledger row IS its durable representation. → **single participant, single durable write.**
- Multi-partition mirror participants are added only during a live SPLIT_CUTOVER
  (`src/query/sql-query-engine-table-routing-methods.js:423-454`), not in the normal case.

### Hop G — why the hold depends on `sql_transaction_participants-p1` having a leader
`src/query/sql-query-engine.js`
- `persistDistributedTransactionRow` `:93-122` → `submitMutation` to `TABLES.SQL_TRANSACTIONS` (`:100`).
- `persistDistributedTransactionParticipantRow` `:130-157` → `submitMutation` to
  `TABLES.SQL_TRANSACTION_PARTICIPANTS` (`:138`).
- `persistDistributedWriteOperationRow` `:165-201` → `TABLES.SQL_WRITE_OPERATIONS` (`:178`).
- These fire from `enlistParticipants` `:273-274`, `recordWriteOperation` `:314-315`, and every
  `setTransactionStatus` in the commit protocol.
- Commit protocol is **always full PREPARE→PREPARED→COMMITTING→COMMITTED**, no single-participant
  one-phase optimization (`src/query/distributed/distributed-transaction-protocol.js:187-298`;
  status persists at `:201/:239/:246/:290`). The COMMIT/ROLLBACK that would release the
  `BEGIN IMMEDIATE` on replica_operations-p1 can only be reached after these bookkeeping
  writes succeed. When `sql_transaction_participants-p1` returns "No leader available for
  write operation", `persistParticipants` (`:274`) fails/stalls with the BEGIN already open →
  the transaction cannot progress to a clean commit → the participant `BEGIN IMMEDIATE`
  survives for the full `PREPARED_HOLD_TIMEOUT_MS` legal window.

---

## Answers to the five sub-questions

1. **Decision point / branch:** `sql-query-engine-write-execution.js:246` + `if (txState) …
   enlistParticipants(sessionId, writePartitions)` `:252-261`. The write becomes a 2PC
   participant transaction **iff** its `sessionId` has an active transaction, which is opened
   upstream by `operation-workflow-transition-orchestration.js:317` (`txCoordinator.begin`).

2. **Multi-partition or single?** **Single-partition.** `writePartitions` resolves to just
   `replica_operations-p1` (Hop D `:244`), and the transaction's only durable write is that one
   row (Hop F — `transitionStep`/`persistWorkflow` is a no-op). The 2PC is spurious: it adds no
   atomicity, only the `sql_transactions`/`sql_transaction_participants`/`sql_write_operations`
   bookkeeping dependency (Hop G). Mirror participants (the only multi-partition case) apply
   only during SPLIT_CUTOVER.

3. **Release path & the sql_transaction_participants dependency:** the `BEGIN IMMEDIATE` is
   released only by a COMMIT (or ROLLBACK) control message to replica_operations-p1, reached
   through the commit protocol (`distributed-transaction-protocol.js:187-298`). Every stage
   persists 2PC state to `sql_transactions` / `sql_transaction_participants` (Hop G). A
   leaderless `sql_transaction_participants-p1` makes `enlistParticipants`'s
   `persistParticipants` (`distributed-transaction-coordinator.js:274`) fail with the BEGIN
   already open (issued at `:258`), stranding the hold.

4. **Existing non-blocking single-partition path?** **Yes — it already exists.**
   `operation-workflow-transition-orchestration.js:273-291` runs `persistFn(null)` with no
   transaction; `operation-workflow-owner-execution-lane.js:709-720`
   `buildOperationTransitionPersistOptions` strips the session (`disableSystemWriteSession:true`,
   `delete …sessionId`). The gate is
   `shouldBypassTransitionExecutionTransaction(operation)` `:696-699` =
   `isPriorityControlPlanePartition({partitionId})`, and
   `src/bootstrap/system-partition-classification.js:17-23` **already lists
   `REPLICA_OPERATIONS`** in `PRIORITY_CONTROL_PLANE_TABLE_IDS`. So **self-move ops (target
   partition = replica_operations-p1) are already bypassed and do NOT open the hold.**
   The residual holds on replica_operations-p1 come from **NON-priority ops** (normal
   data-partition operations): their ledger progress write still targets replica_operations-p1
   as a 2PC participant, but their `operation.partitionId` (e.g. `ratings-p3`) is not priority,
   so the bypass does not fire.

5. **Feasibility verdict — see below.**

---

## Feasibility verdict

**Fix (1) "don't take the self-referential participant hold" is a clean, bounded change,
and the mechanism already exists in-tree.** The hold is spurious for *any* single-partition
`replica_operations` ledger write, not just self-moves.

Two shapes, in order of preference:

- **(Preferred) Widen the bypass from "op targets a priority partition" to "the write itself
  is a single-partition `replica_operations` ledger write."** The correct invariant is that a
  ledger progress/terminal write touches exactly one partition and carries exactly one durable
  write (Hop F), so it never needs distributed 2PC. Concretely: make the ledger progress write
  route without a transactional `sessionId` (the existing `disableSystemWriteSession` /
  `bypassExecutionTransaction` machinery) regardless of the op's target-partition class — or,
  equivalently, short-circuit `enlistParticipants` in `sql-query-engine-write-execution.js:252`
  to a plain write when `writePartitions.length === 1` and the sole partition equals the
  statement's own table partition. Guard/branch to change:
  `operation-workflow-owner-execution-lane.js:696-699` (broaden the predicate) **or**
  `sql-query-engine-write-execution.js:246-261` (single-participant one-phase short-circuit).

- **Invariant that must be preserved:** genuinely multi-partition writes (SPLIT_CUTOVER mirror
  participants, `sql-query-engine-table-routing-methods.js:423-454; any future
  multi-partition ledger statement) MUST keep 2PC. Gate the bypass on
  `writePartitions.length === 1` so atomicity is only dropped where there is nothing to be
  atomic across. This is safe precisely because `transitionStep`/`persistWorkflow` is a no-op
  (Hop F) — there is no second durable write that must commit-or-rollback with the ledger row.

**Critical caveat (cross-quest):** the single-write (bypass) path is exactly the path the
sibling quest `routed-mutation-silent-ledger-write-loss` shows can ack a write WITHOUT durable
quorum replication (`map-routed-mutation-write-path.md`: sql-routed single write reports
`changeCount>0` / `recoveredAfterRetryableFailure` while the durable row stays PENDING on the
quorum → downstream "No row found for CDC update" non-termination). So widening the 2PC bypass
trades the participant-hold wedge for the silent-write-loss wedge **unless the single-write path
is simultaneously made to confirm durable quorum replication.** The two fixes are coupled and
should ship together (or the bypass write must gain a quorum-durable confirmation before it is
allowed to report success).

**Not recommended:** narrowing/patching the 2PC bookkeeping itself (e.g. skipping
`persistParticipants` for single participants) — it leaves the spurious `BEGIN IMMEDIATE`
in place and only removes one of several bookkeeping dependencies.
