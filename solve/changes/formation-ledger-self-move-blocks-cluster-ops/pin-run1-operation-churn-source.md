# Pin run-1 operation churn source

Artifact: `data/examples/service-data-affinity-demo/node-{0..4}.log`, fresh 2026-07-06 17:45-17:53Z run.

## Source semantics used

- The demo settle loop reads `SELECT operation_id, completed_at FROM replica_operations`, counts rows with falsy `completed_at`, and declares settled only after `inFlight === 0` plus stable partition count for three polls. If no operation completes for `SETTLE_STALL_MS`, it prints `STALLED` and proceeds (`examples/service-data-affinity/run-affinity-demo.js:215-278`).
- `Creating operation` is emitted by the RebalanceCoordinator immediately before `persistNewOperation()`, after admission/interlock checks (`src/rebalancer/rebalance-coordinator-operation-creation.js:580-594`). The same method creates the storage reservation and only then emits/arms the created-operation path when enabled (`src/rebalancer/rebalance-coordinator-operation-creation.js:621-627`).
- A terminal transition that is not authoritatively visible is explicitly treated as an immortal non-terminal ledger row: the source comment says it leaves an "immortal non-terminal ledger row" that holds budget/admission lanes until terminal repair re-persists the retained terminal projection (`src/rebalancer/operation-workflow-terminal-transition-repair.js:12-22`). The confirmation path arms that repair for terminal transitions whose visibility is not positively confirmed (`src/rebalancer/operation-workflow-owner-execution-lane.js:723-728`, `src/rebalancer/operation-workflow-owner-execution-lane.js:784-798`).
- The periodic rebalancer computes target state and moves, then slices by budget and executes them (`src/rebalancer/unified-rebalancer-rebalance-loop.js:155-172`, `src/rebalancer/unified-rebalancer-rebalance-loop.js:197-280`). Surplus/placement cleanup REMOVE reasons come from the move planner: excess replicas become `node_not_in_target` when the target node count is zero for that node, otherwise `spread_replicas` (`src/rebalancer/move-planner-move-calculation-methods.js:356-381`). `executeMoveViaCoordinator()` turns a move into a coordinator operation (`src/rebalancer/unified-rebalancer-move-execution.js:31-70`, `src/rebalancer/unified-rebalancer-move-execution.js:87-95`).
- CREATE TABLE initial partition provisioning plans `targetReplicaCount` ADD operations sequentially (`src/query/sql-query-engine-initial-partition-provisioning.js:401-420`), then persists/executes the planned operations (`src/query/sql-query-engine-initial-partition-provisioning.js:543-588`) and waits for minimum routable metadata/count plus a leader (`src/query/sql-query-engine-initial-partition-provisioning.js:610-656`). The default minimum routable count for a 3-replica partition is quorum, i.e. 2 (`src/query/table-creation-service-partition-provisioning.js:95-104`).

## 1. Non-terminal-row census for 17:51:15 -> 17:53:15

Inclusion rule: I counted rows created by 17:53:15 that either (1) have no observed `Operation completed`/`Operation failed` before the window, (2) terminalize inside the window, or (3) have in-window terminal-repair / stale-drain / handoff evidence after an earlier terminal log, because the source says that class is an authoritatively non-terminal ghost until repair confirms it (`operation-workflow-terminal-transition-repair.js:12-22`). `c2e11353` is excluded: it failed at 17:49:56 (`node-2.log:2120`) and I found no in-window repair/non-terminal evidence for it.

Origin shorthand for the census tables: A/B/C rows are pre-ratings `rebalance-coordinator` rows created by ordinary rebalancer placement/cleanup plans, not by ratings DDL; D rows are the in-window cleanup churn and include exact planner lines. The `ADD` rows are count-increase/provisioning placements; `REPLACE` rows are spread/failed-replica replacement placements; `REMOVE` rows are surplus cleanup. The terminal-visibility rows are then owned by the operation-workflow terminal repair owner after their local terminal transition.

### A. Terminal-visibility ghosts (old rows whose terminal state did not become authoritative)

These are STUCK, not useful progress. They are old operations that reached local terminal state before the stalled window, but terminal repair/handoff evidence says the authoritative row still did not reflect that terminal state.

| op | partition / action | creation and local terminal evidence | in-window non-terminal evidence / why it does not drain |
|---|---|---|---|
| `5c629581` | `replica_operations-p1` REPLACE | Created `17:45:19.614` (`node-0.log:1522`); local completions include `node-0.log:2136`, `node-2.log:298`, `node-3.log:328`. | Terminal visibility repair still armed in the window (`node-2.log:3268`, later `node-2.log:4469`): terminal projection not authoritatively visible. |
| `a4bf20d1` | `sql_write_operations-p1` REPLACE | Created `17:46:19.986` (`node-1.log:781`); local failure at `17:49:20.815` (`node-2.log:1816`). | The row was re-inserted as a non-terminal owner copy after the failure (`node-2.log:1819`) and then repeatedly logs `Priority recovery drain settled operation` with `workflowStep:SENDING`, `action:fail_priority_recovery_drain_stale` during the window (`node-2.log:3123`, `node-2.log:4492`). |
| `d7934d68` | `sql_transactions-p1` REPLACE | Created `17:46:22.852` (`node-1.log:815`); completed `17:49:06.933` (`node-3.log:2945`). | Remote handoff budget stopped while the operation remained for rearm/replay (`workflowStep:SENDING`) at `node-0.log:9840` and `node-2.log:3271`. |
| `114fa70c` | `sql_transaction_participants-p1` ADD | Created `17:46:24.033` (`node-3.log:605`); completed `node-0.log:8376` / `node-2.log:2039`. | Terminal repair attempts remain unconfirmed and re-arm (`node-0.log:9824`, `node-0.log:9825`, continuing through `node-0.log:10979`). |
| `f5d2a314` | `sql_write_operations-p1` ADD | Created `17:47:37.822` (`node-0.log:5539`); completed `17:49:35.276` (`node-0.log:8238`). | Terminal repair scheduled in-window with `workflowStep:ACTIVE` (`node-0.log:9764`, `node-0.log:10901`), so the terminal projection is not authoritative. |
| `50c73b0d` | `mg-231f721e-678ec86589bc` REPLACE | Created `17:48:27.507` (`node-2.log:1372`); completed `17:50:05.567` (`node-2.log:2193`). | Terminal repair scheduled in-window (`node-2.log:3149`, `node-2.log:4395`). |
| `f0078a9b` | `sql_transactions-p1` REPLACE | Created `17:49:07.992` (`node-3.log:2967`); completed `17:50:17.119` (`node-0.log:8912`). | Terminal repair scheduled in-window (`node-0.log:9870`, `node-0.log:11059`). |
| `dfdc00cf` | `sql_write_operations-p1` REPLACE | Created `17:49:20.362` (`node-2.log:1814`); completed `17:50:41.538` (`node-0.log:9428`). | Terminal repair scheduled in-window (`node-0.log:9886`, `node-0.log:10865`). |
| `1bfde519` | `sql_write_operations-p1` REPLACE | Created `17:49:38.681` (`node-4.log:2692`); completed `node-3.log:3990` / `node-0.log:9487`. | Terminal repair scheduled in-window (`node-0.log:9763`, `node-0.log:10900`). |
| `a0c27727` | `sql_transactions-p1` REPLACE | Created `17:50:42.993` (`node-2.log:2659`); completed `17:50:57.031` (`node-0.log:9585`). | Terminal repair scheduled in-window (`node-0.log:9762`, `node-0.log:11060`). |

### B. Older non-terminal rows with no observed terminal transition

These are STUCK rows. They were created before the stalled window and I found no `Operation completed` or `Operation failed` line for them before 17:53:15.

| op | partition / action | state transitions / latest evidence | why it does not complete |
|---|---|---|---|
| `1316cda5` | `sql_transactions-p1` ADD; created `node-0.log:5976` | Persist/dispatch failures end at `node-0.log:7448`-`node-0.log:7451`; no terminal line observed. | It remains a PENDING/dispatch-deferred row; last evidence is retryable control-plane write/dispatch failure, not progress. |
| `b5192375` | `sql_transaction_participants-p1` REMOVE; created `node-4.log:2543` | PENDING -> ACTIVE via `dispatch_already_exists` (`node-4.log:2551`); no terminal line observed. | Remove was considered already applied, but row never got terminal `completed_at`. |
| `72e4caf4` | `sql_transaction_participants-p1` REMOVE; created `node-4.log:2932` | PENDING -> ACTIVE via `dispatch_already_exists` (`node-4.log:2938`); no terminal line observed. | Same already-applied-but-not-terminalized shape. |
| `51be5f59` | `debug_snapshots-p1` REPLACE; created `node-0.log:8910` | PENDING -> SENDING (`node-2.log:2422`); handler completed the create (`node-2.log:2841`); shutdown still deferred transition as PENDING (`node-2.log:4896`). | Executor-side work completed, but operation-row transition did not persist/terminalize. |
| `8d4ddd5e` | `mg-231f721e-678ec86589bc` REPLACE; created `node-2.log:2369` | No step-change observed; dispatch deferred at `node-2.log:2454`, and shutdown still deferred transition/dispatch (`node-2.log:4901`, `node-2.log:4903`). | Still PENDING behind retryable control-plane path. |
| `22475eb1` | `service_endpoints-p1` REPLACE; created `node-0.log:9129` | Reservation created (`node-0.log:9237`); shutdown transition deferred as PENDING (`node-4.log:3762`). | No dispatch/terminal progress observed. |
| `8d35b06b` | `schema_migration_partitions-p1` REPLACE; created `node-0.log:9243` | Shutdown transition deferred as PENDING (`node-4.log:3767`). | No dispatch/terminal progress observed. |
| `54b5151e` | `storage_reservations-p1` REPLACE; created `node-0.log:9386` | Shutdown transition/dispatch deferred as PENDING (`node-1.log:3309`, `node-1.log:3312`). | No dispatch/terminal progress observed. |
| `a2335184` | `control_plane_publications-p1` REMOVE; created `node-0.log:9557` | PENDING -> ACTIVE via `dispatch_already_exists` (`node-0.log:9648`); no terminal line observed. | Already-applied remove did not terminalize. |

### C. Rows that were non-terminal only briefly inside the window

These are not the post-17:51:19 stall cause, but they were non-terminal at some instant in the requested interval.

| op | partition / action | state transitions | terminal evidence |
|---|---|---|---|
| `a5aa89fd` | `sql_transaction_participants-p1` REMOVE; created `node-4.log:3377` | PENDING -> SENDING (`node-4.log:3383`), SENDING -> STOPPING (`node-4.log:3393`), drain settled (`node-4.log:3397`). | Completed `17:51:15.028` (`node-4.log:3399`). |
| `4560bbbc` | `sql_transactions-p1` ADD; created `node-2.log:2792` | PENDING -> SENDING (`node-2.log:2983`), SENDING -> CREATING (`node-2.log:3074`), terminal confirmation initially deferred (`node-2.log:3158`). | Completed `17:51:19.717` (`node-2.log:3159`). This is the last pre-ratings `Operation completed` line I observed. |

### D. Late churn created during the stalled window

These are CHURN rows: new operations appear after the last completion, so `inFlight` cannot drain even if older rows were fixed.

| op | partition / action | planner evidence | state / why no completion |
|---|---|---|---|
| `3efed647` | `control_plane_publications-p1` REMOVE; created `node-0.log:9933` | Periodic rebalancer saw `currentCount:4`, `targetCount:3` (`node-0.log:9930`), planned one ready remove (`node-0.log:9931`), and executed `replicaId:control_plane_publications-p1-r6`, reason `node_not_in_target` (`node-0.log:9932`). | PENDING -> ACTIVE via `dispatch_already_exists` (`node-0.log:10107`); no terminal line observed; shutdown still shows retryable dispatch failure (`node-1.log:3265`, `node-2.log:4852`). |
| `84048586` | `debug_snapshots-p1` REMOVE; created `node-0.log:10664` | Periodic rebalancer saw `currentCount:4`, `targetCount:3` (`node-0.log:10661`), planned one ready remove (`node-0.log:10662`), and executed `replicaId:debug_snapshots-p1-r1`, reason `spread_replicas` (`node-0.log:10663`). | PENDING -> ACTIVE via `dispatch_already_exists` (`node-0.log:10746`); no terminal line observed. |

## 2. What creates the late operations?

`3efed647` and `84048586` are created by the ordinary periodic rebalancer path, not by recovery replay. The path is:

1. `UnifiedRebalancer.rebalance()` reads current replicas, computes target state, calculates moves, applies pressure gating, subtracts in-flight budget, then executes the limited moves (`src/rebalancer/unified-rebalancer-rebalance-loop.js:155-172`, `src/rebalancer/unified-rebalancer-rebalance-loop.js:197-280`).
2. For over-target/spread cleanup, the move planner emits REMOVE moves for excess replicas and labels them `node_not_in_target` or `spread_replicas` (`src/rebalancer/move-planner-move-calculation-methods.js:356-381`).
3. `executeMoveViaCoordinator()` converts the move to a coordinator operation (`src/rebalancer/unified-rebalancer-move-execution.js:31-70`, `src/rebalancer/unified-rebalancer-move-execution.js:87-95`).
4. `createOperationRecordInternal()` logs `Creating operation`, persists the row, and creates the reservation (`src/rebalancer/rebalance-coordinator-operation-creation.js:580-594`, `src/rebalancer/rebalance-coordinator-operation-creation.js:621-627`).

The late creates are therefore grounded in real observed placement debt (`currentCount:4`, `targetCount:3`) for their partitions, but they also show re-planning/churn because older cleanup rows for the same families are not terminalizing. Example: `control_plane_publications-p1` already had non-terminal remove `a2335184` (`node-0.log:9557`, `node-0.log:9648`), then planned `3efed647` for another replica at `node-0.log:9930`-`node-0.log:9933`. This is not an exact duplicate op-id loop; it is a placement-cleanup loop around a non-draining operation ledger.

The broader control-plane publication gate is still degraded at the end (`publishedActiveNodeCount:5`, `prioritySpreadPending:false`, but `contractReason:published_active_coverage_incomplete`, `fenceSnapshotCoverageMissingCount:5`) at `node-0.log:11073` and again after ratings starts at `node-0.log:11156`. That semantic gate is separate from the demo settle loop, which only counts `replica_operations.completed_at`.

## 3. Ratings CREATE TABLE trace

The artifact actually shows three ratings ADD rows. The prompt named the first two; the third (`1d926aa1`) is important because the provisioning code plans all target replicas before the final waits (`src/query/sql-query-engine-initial-partition-provisioning.js:401-420`, `src/query/sql-query-engine-initial-partition-provisioning.js:543-588`).

| op | timeline through 17:53:47 | waiting / blocker |
|---|---|---|
| `5407795e` | Ratings CREATE begins at `node-0.log:11128`; first ADD created after `no_service_rows` bootstrap-topology warning (`node-0.log:11136`-`node-0.log:11137`). Reservation is not created until `17:53:22.605` (`node-0.log:11186`). It reaches SENDING at `17:53:27.743` (`node-0.log:11224`), dispatches to local handler (`node-0.log:11225`-`node-0.log:11226`), and local replica creation completes at `17:53:28.840` (`node-0.log:11251`). The operation row only advances SENDING -> CREATING at `17:53:39.114` (`node-0.log:11311`). | Not terminal by the 30s client timeout. At shutdown it is still trying to reconcile ACTIVE/CREATING and persist operation-row updates (`node-0.log:11596`-`node-0.log:11599`, `node-0.log:11604`, `node-0.log:11607`). |
| `99d459cc` | Second ADD created at `17:53:22.613` (`node-0.log:11187`-`node-0.log:11188`). Its reservation appears at `17:53:34.058` (`node-0.log:11283`). It reaches SENDING at `17:53:44.287` (`node-0.log:11336`) and dispatches (`node-0.log:11337`). Node-3 handles it at `17:53:44.295` (`node-3.log:4887`) and local creation completes at `17:53:44.742` (`node-3.log:4903`). | It has not persisted CREATING/ACTIVE before timeout; shutdown sees it still in SENDING transition failure (`node-0.log:11601`-`node-0.log:11606`, `node-3.log:4971`). Node-3 logs learner promotion delay (`promotionDelayMs:30000`) at `node-3.log:4891`, but service state reaches active immediately (`node-3.log:4901`-`node-3.log:4903`), so the dominant CREATE blocker here is operation-row/provisioning progression, not waiting 30s for learner promotion. |
| `1d926aa1` | Third ADD created at `17:53:34.064` (`node-0.log:11284`) for target node `2296b...`. Its reservation is not created until `17:53:49.701` (`node-0.log:11510`), after the runner's 30s timeout window. | It is not sent before the timeout/shutdown. This alone prevents the provisioning loop from reaching its post-plan metadata/routability waits in a few seconds. |

The admin client timeout is 30s (`scripts/examples/examples-runner-constants.js:8`; `_sendRequest()` rejects after `this.timeoutMs`, `scripts/examples/admin-ws-client.js:123-131`). The server-side failure at `17:53:52.168` is after shutdown has begun and reports `CDCIntegrationService not properly initialized: sqlQueryEngine not provided` (`node-0.log:11608`-`node-0.log:11609`), so I treat it as failure-tail/shutdown noise, not the root cause of the 30s CREATE latency.

For CREATE to finish in a few seconds here, operation creation/reservation and operation-row transitions would have to be fast enough that either all planned target replicas (3) are created/reserved/dispatched promptly, or the provisioning owner would have to stop planning at the quorum minimum (2) before returning. Then the waits at `src/query/sql-query-engine-initial-partition-provisioning.js:610-656` would need to see at least two active/addressed routable service rows and a leader. In this run, the first reservation took ~5.2s, the second ~11.4s, and the third ~15.6s; operation-row state propagation adds another ~10s per op. That serial control-plane/operation-ledger latency dominates the 30s budget.

## 4. Verdict

The first violated invariant keeping `inFlight` from reaching zero is **operation-row terminal visibility / repair ownership**: a terminal operation must become authoritatively visible as terminal, otherwise it remains an immortal non-terminal ledger row. Owner: `OperationWorkflowOwner` / terminal-transition repair (`src/rebalancer/operation-workflow-terminal-transition-repair.js:12-22`, `src/rebalancer/operation-workflow-owner-execution-lane.js:723-728`). The first in-window symptom is already present at `17:51:15.288`: `a4bf20d1` repeatedly logs stale priority-recovery drain with `workflowStep:SENDING` (`node-2.log:3123`) after its earlier failure/repair path (`node-2.log:1815`-`node-2.log:1819`).

Classification: **(b) re-planning / terminalization loop**, with real placement debt as a secondary input. The late `3efed647` and `84048586` rows are legitimate cleanup responses to observed `4/3` over-target partitions, but the system is not merely slow: many rows are terminal ghosts or already-applied removes that do not get `completed_at` authoritatively set, so the planner keeps creating/repairing around non-draining ledger state. It is not (c); the dominant latency is not learner promotion but serial operation-row/reservation/terminal-visibility repair latency under control-plane pressure.