# Pin run-1 read-back non-confirmation

Artifact: `data/examples/service-data-affinity-demo/node-{0..4}.log` and the read-only SQLite files under `data/examples/service-data-affinity-demo/node-*/partitions/replica_operations-p1/`.
Foundation read first: `solve/changes/formation-ledger-self-move-blocks-cluster-ops/pin-run1-terminal-repair-wiring.md`.

## Verdict

First violated invariant: **terminal-transition confirmation must read the same ledger authority/copy that the terminal mutation wrote**. The current repair confirmation uses `OWNER_LOCAL_ONLY`, which means "read my local `replica_operations-p1` partition service (leader if local, otherwise any local replica fallback) and never owner-RPC/leader-confirm." After spread, the ledger leader is `replica_operations-p1-r5` on node-3 (`node-3.log:1148-1149`), while node-0 still has a stale local `replica_operations-p1-r2` copy and node-2 has no local `replica_operations-p1` DB at all. Node-0 therefore confirms against stale r2; node-2 confirms against no local authority. The terminal rows are present on the live ledger replicas, so this is **read-source mismatch / stale local ledger read**, not write-not-applied and not a CDC cache read-back stall.

Minimal fix direction: terminal repair and terminal post-commit confirmation must escalate from `OWNER_LOCAL_ONLY` to the write authority for `replica_operations-p1` (owner-RPC required/preferred to the ledger partition leader, or an equivalent leader/SQL-routed authority read) before declaring MISSING/DEFERRED or re-arming. The fix must also apply to terminal-repair helper reads used by `shouldRejectConflictingTerminalTransitionMutation()` / zero-change diagnosis, because those currently use the same local-only source.

## 1. What `OWNER_LOCAL_ONLY` actually reads

`confirmReplicaOperationPersistence()` calls `confirmReplicaOperationVisibility()` and throws `Authoritative replica operation not confirmed: <id>` when the result is non-deferred and has no operation (`src/rebalancer/replica-operation-repository-mutation-persistence-methods.js:391-410`). The visibility loop clears the last outcome, then for up to 5s repeatedly calls `queryAuthoritativeOperationVisibilityObservation(operationId, { authoritativeReadMode: OWNER_LOCAL_ONLY, ... })` (`src/rebalancer/replica-operation-repository-mutation-persistence-methods.js:443-459`). It confirms only if operation id, replica id, workflow step, status, updatedAt, and completedAt satisfy the projected terminal operation (`src/rebalancer/replica-operation-repository-mutation-persistence-methods.js:461-472`, `src/rebalancer/replica-operation-repository-mutation-persistence-methods.js:506-549`). If it saw a mismatching row, it suppresses deferred and returns MISSING at the deadline (`src/rebalancer/replica-operation-repository-mutation-persistence-methods.js:474-498`).

The read observation method selects `REPLICA_OPERATION_LOCAL_VISIBILITY_READ_QUERY_OPTIONS` when the mode is `OWNER_LOCAL_ONLY` (`src/rebalancer/replica-operation-repository-read-methods.js:300-320`). Those options are built from the critical recovery read options and set `authoritativeReadMode: OWNER_LOCAL_ONLY` (`src/rebalancer/replica-operation-repository.js:405-408`); the base options force `readStrategy: OWNER_LOCAL_NON_PROPAGATED`, `replicaFallbackConsistency: ANY_REPLICA`, and no owner-RPC or SQL fallback (`src/rebalancer/replica-operation-repository.js:327-345`). The general visibility options are different: they use `OWNER_RPC_PREFERRED_SQL_FALLBACK` (`src/rebalancer/replica-operation-repository.js:410-418`), but the confirmation path explicitly does not use them.

From there the path is:

1. `executeReplicaOperationsRead()` calls `readAuthoritativeControlPlaneRows()` with those query options (`src/rebalancer/replica-operation-repository-read-methods.js:50-100`).
2. The gateway dispatches `OWNER_LOCAL_NON_PROPAGATED` to `executeOwnerLocalRead()` (`src/control-plane/control-plane-system-table-gateway-read-dispatch.js:102-124`).
3. `executeOwnerLocalRead()` calls `cdcIntegrationService.executeAuthoritativeSystemTableRead()` if CDC exists, and only falls back to the local SQL engine when CDC is absent (`src/control-plane/control-plane-system-table-gateway-read-strategies.js:243-302`).
4. `executeAuthoritativeSystemTableRead()` first reads local authoritative rows, returns them immediately when owner-RPC is not preferred/required, and when `allowOwnerRpcFallback` is false returns `authoritative_row_source_unavailable` instead of routing to the owner (`src/cdc/cdc-integration-service-authoritative-read-flow.js:272-363`, `src/cdc/cdc-integration-service-authoritative-read-flow.js:411-430`).
5. Local authoritative rows are selected with `resolveLocalSystemTableServices()` and read via `executeLocalSystemTableRead()` (`src/cdc/cdc-integration-service-authoritative-read-flow.js:98-154`). Service selection uses LOCAL_LEADER first and then the `ANY_REPLICA` fallback from the repository options if no local leader is available (`src/cdc/cdc-integration-service-authoritative-read-flow.js:299-325`, `src/cdc/cdc-integration-service-local-system-table-routing.js:148-193`). The final read is local partition SQL (`executeLocalQuery`, `db.prepare`, or `executeQuery`) against the local partition service (`src/cdc/cdc-integration-service-local-system-table-routing.js:196-209`, `src/cdc/cdc-integration-service-local-system-table-routing.js:255-256`).

So `OWNER_LOCAL_ONLY` is **not the operation owner** and not a system-table-cache row read. It means "the caller's local copy of the `replica_operations-p1` ledger partition, non-propagated, no owner-RPC fallback." If the repairing node does not host the ledger leader, it reads a local follower if one exists; if it hosts no local replica, it returns unavailable/deferred.

## 2. Artifact-local read source after spread

The artifact's leadership and DB layout make the mismatch concrete.

- node-1 became `replica_operations-p1-r4` leader early (`node-1.log:292`).
- node-3 became the `replica_operations-p1-r5` leader at 17:48:41 (`node-3.log:1148-1149`).
- node-0 has local `replica_operations-p1-r2` (`node-0.log:442-443`; shutdown still references r2 at `node-0.log:11721`, `node-0.log:11818`).
- On disk there are ledger DBs at node-0/r2, node-1/r4, node-3/r5, and node-4/r6. There is no `node-2/partitions/replica_operations-p1/*.db`, so node-2's `OWNER_LOCAL_ONLY` confirmation has no local ledger copy to read.

That explains the two concrete confirmation shapes:

- **node-0 / `114fa70c` throws:** node-0's local r2 DB still has `114fa70c` as `PENDING/pending/completed_at:null`, while r4/r5/r6 have `ACTIVE/active/completed_at:1783360159398`. The visibility loop sees a mismatching operation, sets `sawVisibilityMismatch`, and returns MISSING, causing the throw (`src/rebalancer/replica-operation-repository-mutation-persistence-methods.js:474-498`; failures at `node-0.log:8374-8375`, `node-0.log:9824-9825`, `node-0.log:11332-11333`).
- **node-2 / `114fa70c` silently re-arms:** node-2 does not host any local `replica_operations-p1` DB, so local-only read cannot reach r5 and the owner-persisted/deferred path re-arms without the catch-log throw (`node-2.log:2038`, `node-2.log:4559`; deferred handling in `src/rebalancer/replica-operation-repository-read-methods.js:323-410`).

## 3. CDC/cache state in the window

The read-back is not cache-based, so a stalled `systemTableCache` is not the direct explanation. The cache is used to locate partitions/services and build diagnostics, not to return the `replica_operations` row for `OWNER_LOCAL_ONLY` confirmation (`src/cdc/cdc-integration-service-local-system-table-routing.js:122-146`, `src/cdc/cdc-integration-service-authoritative-read-flow.js:157-251`).

There is still propagation evidence, but it points to stale/local-ledger divergence rather than cache read-back:

- node-0 has late transient routed CDC SQL retry evidence at the writable boundary and shutdown (`node-0.log:7446`, `node-0.log:11594`, `node-0.log:11857`), but not for the ghost terminal repair rows after 17:49.
- node-2 has late transient retries only at shutdown (`node-2.log:4886-4888`, `node-2.log:4906`) and readiness-cache refreshes at 17:49:19 (`node-2.log:1808-1809`). Those do not provide a local `replica_operations-p1` row source.
- node-0's late `No row found for CDC update` lines after 17:49 are for `services`, `partitions`, or `storage_reservations`, not for the `114fa70c`/`f5d2a314`/`5c629581` terminal `replica_operations` rows (`node-0.log:8013`, `node-0.log:8351`, `node-0.log:8437`, `node-0.log:9365`, `node-0.log:9741`).

The decisive state is the on-disk local ledger row: node-0/r2 is stale/missing for the ghosts while r4/r5/r6 contain terminal rows.

## 4. Dueling-repair angle

The repair state and single-flight are per `OperationWorkflowOwner` process. The owner initializes `terminalTransitionRepairTimerByOperationId` and `terminalTransitionRepairStateByOperationId` as local maps (`src/rebalancer/operation-workflow-owner-retry-registry.js:99-103`). Arming retains the first projected terminal operation in that process and only suppresses duplicate timers in that same map (`src/rebalancer/operation-workflow-terminal-transition-repair.js:58-81`). Attempts run under `operationWorkflowRunExclusive(owner.getOperationOwnerSingleFlightKey(operationId))` (`src/rebalancer/operation-workflow-terminal-transition-repair.js:161-182`), and the key is just the operation-scope key inside that owner instance (`src/rebalancer/operation-workflow-owner-execution-lane.js:245-249`). Therefore two nodes can indeed hold repair projections for the same operation.

But the artifact does not support dueling writers as the reason `114fa70c` never confirms. Both node-0 and node-2 armed repair (`node-0.log:8375`, `node-2.log:2038`) and kept re-arming (`node-0.log:11333`, `node-2.log:4559`), yet the ledger replicas r4/r5/r6 are terminal for `114fa70c` at shutdown. There is no evidence that the leader row kept flipping non-terminal; the only non-terminal row is node-0's stale r2 copy.

The separate `a4bf20d1` row does show a competing non-terminal/drain pattern: it failed terminally, then an owner copy was reinserted as `STOPPING` (`node-2.log:1815-1819`), and later priority recovery repeatedly observed it as `SENDING` (`node-2.log:3123-3124`, `node-2.log:4492`). That is a real separate ledger inconsistency class, but it is not the cause of `114fa70c`/`f5d2a314` terminal read-back non-confirmation.

## 5. Did the write actually succeed? DB shutdown evidence

Yes for the terminal ghosts on the live ledger replicas. I inspected the SQLite files read-only with `sqlite3.connect('file:<db>?mode=ro', uri=True)` and queried `replica_operations` by operation-id prefix. The table below shows `status/workflow_step/completed_at` per ledger DB:

| op prefix | node-0 r2 DB | node-1 r4 DB | node-3 r5 DB (leader after 17:48:41) | node-4 r6 DB |
|---|---|---|---|---|
| `5c629581` | `removed/REMOVED/1783359936004` | `removed/REMOVED/1783359936004` | `removed/REMOVED/1783359936004` | `removed/REMOVED/1783359936004` |
| `a4bf20d1` | `pending/SENDING/null` | `failed/FAILED/1783360117092` | `failed/FAILED/1783360117092` | `failed/FAILED/1783360117092` |
| `d7934d68` | `pending/SENDING/null` | `removed/REMOVED/1783360083798` | `removed/REMOVED/1783360083798` | `removed/REMOVED/1783360083798` |
| `114fa70c` | `pending/PENDING/null` | `active/ACTIVE/1783360159398` | `active/ACTIVE/1783360159398` | `active/ACTIVE/1783360159398` |
| `f5d2a314` | missing | `active/ACTIVE/1783360135259` | `active/ACTIVE/1783360135259` | `active/ACTIVE/1783360135259` |
| `50c73b0d` | missing | `removed/REMOVED/1783360193652` | `removed/REMOVED/1783360193652` | `removed/REMOVED/1783360193652` |
| `f0078a9b` | missing | `removed/REMOVED/1783360211396` | `removed/REMOVED/1783360211396` | `removed/REMOVED/1783360211396` |
| `dfdc00cf` | missing | `removed/REMOVED/1783360235423` | `removed/REMOVED/1783360235423` | `removed/REMOVED/1783360235423` |
| `1bfde519` | missing | `removed/REMOVED/1783360235432` | `removed/REMOVED/1783360235432` | `removed/REMOVED/1783360235432` |
| `a0c27727` | missing | `removed/REMOVED/1783360251955` | `removed/REMOVED/1783360251955` | `removed/REMOVED/1783360251955` |

For `114fa70c`, node-0 started completion via priority-recovery drain at 17:49:19.398 (`node-0.log:7444`), then the later completion log appeared only after visibility work (`node-0.log:8374-8376`). The live ledger replicas contain the terminal `ACTIVE` row with `completed_at:1783360159398`, matching that completion start. The terminal row therefore reached the ledger authority; confirmation failed because node-0 read stale r2, not because the leader lacked the terminal row.

For `f5d2a314`, node-0's local r2 copy is missing the row entirely, while r4/r5/r6 have the terminal `ACTIVE` row. That matches the silent re-arm path: empty/unavailable local read plus owner-persisted witness can return DEFERRED instead of throwing (`src/rebalancer/replica-operation-repository-read-methods.js:323-410`; schedules at `node-0.log:8237`, `node-0.log:9764`, `node-0.log:11298`).

For `5c629581`, node-2 reinserted after a zero-row update (`node-2.log:1810`) and still re-armed (`node-2.log:1886`, `node-2.log:4469`) because node-2 has no local ledger DB to confirm from. The ledger DBs that exist all contain the terminal `REMOVED` row.

## 6. Deterministic test that must be red on unfixed head

A deterministic in-process test should create a `replica_operations-p1` ledger with the leader on node B, a repairing `OperationWorkflowOwner` on node A, and either (a) a stale local follower on node A containing `operation_id=X` as `PENDING/completed_at:null` while the leader has `ACTIVE/completed_at=T`, or (b) no local ledger replica on node A. Then run terminal repair for projected `X ACTIVE completedAt=T` through the normal routed mutation path. The expected fixed behavior is: repair confirms against the ledger authority and clears the repair. The unfixed head stays red because `confirmReplicaOperationPersistence()` uses `OWNER_LOCAL_ONLY`, returns MISSING/DEFERRED from the stale/missing local source, and keeps the terminal repair armed even though the leader row is terminal.
