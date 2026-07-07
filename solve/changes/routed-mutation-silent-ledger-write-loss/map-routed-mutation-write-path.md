# Routed-mutation silent ledger write-loss — exact code-path map (gap v)

Grounds the claim: a `writeMode=sql-routed` single-write UPDATE to `replica_operations`
can report `changeCount>0` / `recoveredAfterRetryableFailure` → `persistOperationUpdate`
returns `true` → "Operation completed" logged, WITHOUT the write durably replicating to a
ledger quorum. The durable row stays PENDING on the quorum; a downstream CDC fetch then
re-drives forever on "No row found for CDC update".

All citations are `file:line` at repo state of this trace. NO source edited.

---

## Hop-by-hop path

### Hop 0 — Terminal completion caller (where "Operation completed" originates)
- `src/rebalancer/operation-workflow-transition-persistence.js:287-292` — the terminal
  `persistFn` calls `repository.persistOperationUpdate(projectedOperation, {…, terminalTransition:true})`.
- `:298-312` — `executeAtomicTransition(...)` runs `persistFn`; `transitionCommitted` is
  its boolean return (i.e. the return value of `persistOperationUpdate`).
- `:334-340` — on `transitionCommitted` truthy, `this.stats.operationsCompleted++` and
  `logger.info(REBALANCE_COORDINATOR_LOG_MSG.OPERATION_COMPLETED, …)` fire. So the
  "Operation completed" log is gated ONLY on `persistOperationUpdate` returning `true`.
  (Design anchor cited this as `:315-320`; the actual log site is `:334`.)

### Hop 1 — The persist decision (`persistOperationUpdate`)
`src/rebalancer/replica-operation-repository-mutation-persistence-methods.js`
- `:175-207` — builds a `CONTROL_PLANE_MUTATION_OPERATION.UPDATE` mutation on
  `SYSTEM_TABLE_NAME.REPLICA_OPERATIONS` and calls
  `executeReplicaOperationGatewayMutationWithRetry(...)`.
- **Success arms that return `true`:**
  - `:211-214` — `result.recoveredAfterRetryableFailure === true` → `syncIncompleteOperationObservation` → `return true`. (See Hop 2b — recovery is an owner-LOCAL read, not a quorum read.)
  - `:215-224` — `changeCount = extractMutationChangeCount(result)`; if `changeCount <= 0`
    with a guarded/terminal write it goes to `resolveZeroChangeOperationUpdate`
    (the CL-017(b) reinsert branch, `:277-320`); otherwise `changeCount === null || > 0`
    falls through to…
  - `:225` → `confirmPersistedOperationUpdate(operation, options)`.
- `confirmPersistedOperationUpdate` `:230-252` — **always returns `true`** (`:251`),
  independent of the visibility outcome. It calls `confirmReplicaOperationPersistence`
  (`:446-466`) in a `try`, but:
  - a DEFERRED confirmation returns the visibility object (`:452-456`) and still falls
    through to `return true` at `:251`;
  - only a MISSING confirmation throws (`:458-462`).
  So a changed-rows UPDATE is reported as persisted whenever the confirm read is CONFIRMED
  **or** DEFERRED.
- **Why confirmation cannot catch a non-durable write:** `confirmReplicaOperationVisibility`
  `:498-592` reads `OWNER_LOCAL_ONLY` then `OWNER_RPC_PREFERRED_SQL_FALLBACK`
  (`:509-547`). Both resolve against the owner/leader's own copy — there is **no
  quorum/durable read** in the confirmation. A write that landed only on the leader's
  local SQLite (see Hop 4) satisfies this confirmation.

`extractMutationChangeCount` `:613-621` (gateway-methods file): reads
`result.changes ?? result.affectedRows ?? result.partitionResult.changes ?? result.partitionResult.affectedRows`.

### Hop 2 — Gateway mutation & ack semantics
`src/rebalancer/replica-operation-repository-mutation-gateway-methods.js`
- `executeReplicaOperationGatewayMutationWithRetry` `:91-154` → `executeReplicaOperationGatewayMutation` `:156-203`.
  For an UPDATE it dispatches `gateway.submitMutation(mutation, queryOptions)` (`:165-166`)
  or `gateway.updateSystemTableRow(tableName, whereClause, data, queryOptions)` (`:178-188`).
  `gateway` = `this.controlPlaneSystemTableGateway` = the CDC integration service.
- **(2a) changeCount is whatever the routed SQL result carries** — the gateway does not
  itself add any quorum wait; success is `result.success` from the CDC service (`:115`).
- **(2b) `recoveredAfterRetryableFailure` success arm** `:118-124` — on a retryable
  failure, `options.onRetryableFailure(result)` runs; if it returns `true`,
  the gateway returns `{success:true, recoveredAfterRetryableFailure:true}`.
  `onRetryableFailure` for the UPDATE path (persistence-methods `:192-196`) is
  `recoverPersistedReplicaOperationMutation` (persistence-methods `:468-496`), which
  confirms via `authoritativeReadMode: OWNER_LOCAL_ONLY` (`:479-485`) — the leader's own
  copy. So a routed UPDATE that FAILED at the gateway is still reported as success (and
  short-circuits Hop 1 at `:211`) purely on an owner-local read.
- **Query options set `skipCacheWait: true`** — `buildOperationMutationQueryOptions`
  `:512-517` always sets `skipCacheWait: true`. This disables the cache/visibility wait
  inside `updateSystemTableRow` (see Hop 3), so the routed replica-operation UPDATE never
  waits for CDC cache convergence.

### Hop 3 — CDC service routed UPDATE (`updateSystemTableRow`)
`src/cdc/cdc-integration-service-mutation-operations.js`
- `updateSystemTableRow` `:367-539`. Builds `UPDATE <table> SET … WHERE …` and calls
  `this.executeSQL(sql, [...setValues, ...whereValues], {...})` `:412-432`.
- `:434-439` — success is decided solely by `result.success`; on false it throws.
- `:440-464` — the cache/visibility wait (`waitForCacheUpdate`) runs **only when
  `options.skipCacheWait !== true`**. Because the replica-operation gateway forces
  `skipCacheWait: true` (Hop 2), this block is skipped entirely — no post-write read-back,
  no durable convergence check.
- `:492-505` — returns `{success:true, …, partitionResult: result}`; the caller's
  `changeCount` therefore comes from `result.affectedRows` (`partitionResult.affectedRows`),
  i.e. the routed SQL apply's change count.

### Hop 4 — The routed SQL execution (`executeSQL` → write router → query engine → partition)
`src/cdc/cdc-routed-mutation-readiness.js`
- `executeSQL` `:608-618` → `this.writeRouter.execute(...)`.
  Write router: `src/cdc/write-router/index.js` — `SqlWriteRouter` (`mode:'sql-routed'`,
  `:33-43`) is a thin pass-through to `executeFn`; `WRITE_ROUTER_MODE.SQL_ROUTED = 'sql-routed'`
  (`:12`). The router adds **no durability semantics** — it just forwards.
- The wired `executeFn` is `executeSQLViaQueryEngine` `:311-606`:
  - `:501-508` — when **not** bootstrap, it first tries
    `tryExecuteLocalSystemTableWrite(sql, params)` `:57-123`. If this node hosts a local
    `LOCAL_LEADER` partition service for the table (`:84-91`), the write executes via
    `partitionService.executeQuery(sql, params)` (`:97`) and its normalized result is
    returned directly (`:506-507`) — **local-leader apply, no separate quorum step here**.
  - `:510-518` — otherwise routes via `sqlQueryEngine.executeQuery(sql, params, queryOptions)`
    (fanout → parallel coordinator → partition leader).
  - `:519-548` — success/failure is read straight off `result.success` / `result.error`;
    retries on transient errors; no quorum assertion.
- Fanout: `src/query/query-executor-sql-command-rendering.js` `executeUpdate` `:409-471`
  → `executeOnPartitions` `:415-427`. `totalChanges` = Σ `result.changes` over partition
  results (`:430-433`); `affectedRows: totalChanges` (`:464`). This is the `changeCount`.
- `executeOnPartitions` `src/query/query-executor-base.js:478-511` →
  `parallelQueryCoordinator.executeParallel(...)` → routes to the partition leader's
  `applyWrite`.

### Hop 5 — The durability boundary (`applyWrite` on the partition leader)
`src/partition/partition-service-write-metrics-base.js`
- `applyWrite` `:598-771`. Commit mode chosen by
  `resolvePartitionWriteCommitMode({replicaIds, raftState, raftLeaderState:LEADER, hasKnownRemoteLeader})`
  `:614-619`.
- `resolvePartitionWriteCommitMode` — `src/partition/partition-write-kernel.js:42-65`:
  - `replicaIds.length <= 1` **and** `hasKnownRemoteLeader !== true` → **`DIRECT`** (`:59`).
  - `replicaIds.length <= 1` **and** `hasKnownRemoteLeader === true` → `REJECTED` (`:56-57`).
  - `replicaIds.length > 1` and local raft is LEADER → `RAFT` (`:62-63`); else `REJECTED`.
- **`changes` is computed from the LEADER's LOCAL SQLite apply, before any quorum ack:**
  `executePartitionWriteStatement(this.db, entry, …)` `:664-669` →
  kernel `:67-78`: `statement.run(...)` and `changes: info.changes` — a plain local
  `better-sqlite3` apply.
- **RAFT mode ordering** `:635-770`:
  1. `storage.appendEntry(entry)` `:636`.
  2. `commitPromise = waitForCommittedWrite(entry.entryId, {logIndex})` `:643-647`.
  3. **local apply** `:664` (computes `changes`), then `applyWriteSideEffectPlan` `:676`
     which `setPendingCommittedWriteResult(entry.entryId, result)` `:781` (stores the
     local-apply result, changes and all) **and emits the CDC UPDATE event** `:783-794`
     — the CDC fan-out happens here, before commit resolves.
  4. `raftProvider.propose(this.raft, entry)` `:715`.
  5. `await commitPromise` `:744` → returns `committedResult` `:750`.
  The committed result is resolved by `resolveCommittedWrite(entryId)` on the raft
  state-machine apply path (`src/partition/partition-service-entry-apply-base.js:578-705`);
  on the leader the entryKey is already in `recentlyAppliedEntryKeys` (tracked at
  side-effect apply, `applyWriteSideEffectPlan` → `trackAppliedEntryKey` `:779`), so the
  commit callback takes the skip-replay branch `:608-623` and resolves with the SAME
  local-apply `result` (`setPendingCommittedWriteResult`, `:781`).
  ⇒ **The reported `changes` never reflects a re-verification against a durable quorum;
  it is always the leader's local-apply count.**
- **DIRECT mode** `:764-770`: no `commitPromise`, no `propose`, no quorum — applies to the
  leader's local SQLite and returns `result` (with `changes>0`) immediately.

### Hop 6 — Downstream symptom ("No row found for CDC update")
`src/partition/partition-cdc-parameterized-sql.js`
- The CDC UPDATE event's payload is built by `extractParamUpdateData` `:89-159`, which
  calls `fetchUpdatedRow(tableName, whereClause)` `:153` to read back the canonical row.
- `fetchUpdatedRow` `:279-357`: `SELECT * FROM <table> WHERE …` against the applying
  replica's local db (`:316-322`). When the row is **absent on that replica** it emits
  `logger.warn(PARTITION_SERVICE_ERROR_MSG.CDC_NO_ROW_UPDATE, {…, cdcReplicaId})` `:335-344`
  and returns `null`. Constant `CDC_NO_ROW_UPDATE = 'No row found for CDC update'`
  (`src/partition/partition-service-constants.js:418`). The comment at `:341` names this
  the CL-017 divergence witness — which replica's db lacks the row.
- This is a **CDC-apply read-back on the replica applying the UPDATE event**, NOT a
  pre-write existence check and NOT the writer's ack path. It fires when the UPDATE's row
  was never durably present on that replica.

---

## What "reports success without durable quorum" resolves to (the gap-v mechanism)

Three concrete arms let a routed `replica_operations` UPDATE report success without a
durable quorum landing. All converge on the same downstream `No row found for CDC update`
re-drive when a replica that is authoritative for a subsequent read/CDC-apply never
received the durable row:

1. **DIRECT-commit single-replica apply** — `partition-write-kernel.js:42-65` +
   `write-metrics-base.js:614-634,764-770`. If the leader's `replicaIds` is
   viability-filtered to `<=1` and `hasKnownRemoteLeaderWitness()` (`:569-589`) is false,
   the UPDATE applies to ONE replica's SQLite and returns `changes>0` with **no raft
   propose and no quorum**. The code comment (`partition-write-kernel.js:45-55`) explicitly
   ties this to the run-15 phantom-commit fork. The durable quorum row stays at its prior
   (PENDING) step.
2. **changeCount from leader-local apply, committed result never re-verified** —
   `write-metrics-base.js:664` computes `changes` locally; the RAFT commit resolves the
   same local-apply object (`entry-apply-base.js:608-623` skip-replay → `resolveCommittedWrite`).
   If the raft "commit" is not backed by a genuine quorum (the CARDINAL committed-entry-loss
   / phantom-MAX-index class, memory s10), `changes>0` is still reported.
3. **`recoveredAfterRetryableFailure` on an owner-LOCAL read** —
   gateway-methods `:118-124` + persistence-methods `:468-496` (`OWNER_LOCAL_ONLY`,
   `:479-485`). A gateway failure is upgraded to success on the leader's own copy.

In all three, Hop 1's confirmation (`confirmReplicaOperationPersistence`, owner-local /
owner-RPC only — persistence-methods `:498-547`) cannot detect the missing quorum
durability, and `confirmPersistedOperationUpdate` returns `true` unconditionally
(`:251`). "Operation completed" then logs (transition-persistence `:334`).

---

## Candidate fix surfaces (NOT implemented)

Ranked; each notes whether it fixes durability "where it is claimed" (design principle)
vs papers over in persistence.

1. **[Fix where durability is claimed — PREFERRED] The partition write ack.**
   `src/partition/partition-service-write-metrics-base.js:643-770` +
   `src/partition/partition-write-kernel.js:42-65`.
   Make a routed control-plane UPDATE's returned `changes`/`success` contingent on a
   genuine quorum commit: (a) do not report `changes` from the pre-commit local apply —
   carry the change count through `committedResult` only after `waitForCommittedWrite`
   resolves against an actual quorum; (b) narrow/remove the `DIRECT` self-only arm for
   quorum-bearing control-plane tables (or require `hasKnownRemoteLeaderWitness`-style
   positive quorum evidence before DIRECT). Tradeoff: touches the hot write path and the
   run-15 fork guard; must not regress single-node/degraded legitimate DIRECT writes.
   This is the design's stated principle: durability is asserted where the write commits.

2. **[Fix at the CDC routed-write ack boundary] `updateSystemTableRow` / `executeSQLViaQueryEngine`.**
   `src/cdc/cdc-integration-service-mutation-operations.js:434-464` and
   `src/cdc/cdc-routed-mutation-readiness.js:514-548`.
   For quorum-bearing control-plane tables, do not treat `result.success` as durable
   unless the routed result carries a quorum-commit witness (e.g. a committed logIndex /
   commit-mode=RAFT marker) — reject/retry a `DIRECT`-mode or unwitnessed apply for these
   tables. Tradeoff: needs the partition layer to surface commit-mode/quorum evidence in
   the result (couples layers), but keeps the persistence caller unchanged. Note the
   `skipCacheWait:true` forced by the gateway (gateway-methods `:517`) already disables the
   only convergence check here — re-enabling a durable (not cache) confirmation is an
   option but the cache is not the quorum, so this alone is insufficient.

3. **[REJECTED — papers over] The persistence success arm.**
   `src/rebalancer/replica-operation-repository-mutation-persistence-methods.js:211-251`.
   Could gate `return true` on a quorum/durable confirmation instead of the owner-local /
   always-true `confirmPersistedOperationUpdate`. Rejected by the design principle: it
   detects the loss after the fact at the consumer instead of fixing durability where it is
   claimed, adds a new authoritative read path (conflicts with the "avoid secondary caches
   / fix the existing mechanism" directive), and cannot distinguish a genuinely-durable
   write from a leader-local one without the same quorum witness surface fix #1/#2 add.

---

## Key file:line index
- Persist decision / success arms: `src/rebalancer/replica-operation-repository-mutation-persistence-methods.js:175-252`, `:468-496`, `:498-547`
- Gateway ack + `skipCacheWait`/changeCount: `src/rebalancer/replica-operation-repository-mutation-gateway-methods.js:91-203`, `:512-517`, `:613-621`
- CDC routed UPDATE (skip cache wait): `src/cdc/cdc-integration-service-mutation-operations.js:367-539` (`:440-464`)
- Write router (`sql-routed`): `src/cdc/write-router/index.js:10-43`; `executeSQL`/query-engine: `src/cdc/cdc-routed-mutation-readiness.js:57-123`, `:311-618`
- Fanout changeCount: `src/query/query-executor-sql-command-rendering.js:409-471`; `src/query/query-executor-base.js:478-511`
- Durability boundary: `src/partition/partition-service-write-metrics-base.js:598-807`, `:569-589`; `src/partition/partition-write-kernel.js:42-78`
- Commit resolve: `src/partition/partition-service-entry-apply-base.js:578-705`
- "No row found for CDC update": `src/partition/partition-cdc-parameterized-sql.js:279-357` (`:337`); constant `src/partition/partition-service-constants.js:418`
- "Operation completed" log: `src/rebalancer/operation-workflow-transition-persistence.js:287-340`
