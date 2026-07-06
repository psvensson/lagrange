# Diagnose run-1 post-C3 settle stall and ledger writes

Artifact: current `data/examples/service-data-affinity-demo/node-{0..4}.log` (the fresh run-1 post-C3 artifact). Scope: settle stall and write failures after the unfit-leader durability deadlock was already fixed.

## Verdict

The 63 failed **ledger** row writes are real, but they are **not** confined to the `17:48:32` durability-unfit r4 window. They start at `17:46:30.662Z` (`node-2.log:490`) and continue after the r4 heal through `17:49:19.401Z` (`node-0.log:7448`), with three more ratings-table provisioning failures during shutdown at `17:53:52.163Z`-`17:53:52.167Z` (`node-0.log:11596`, `node-0.log:11601`, `node-0.log:11604`).

The binding head for the `17:51:19` -> `17:53:15` settle stall is **not continuing ledger write failure**: no failed `replica_operations` row write is observed between `17:49:19.401Z` and the ratings create/shutdown failures at `17:53:52.163Z`. The control-plane owner still reports `contractState:degraded`, `contractReason:published_active_coverage_incomplete`, `fenceState:promotion_denied`, `fenceMissingProofReasons:[snapshot_coverage_unavailable]`, `fenceSnapshotCoverageMissingCount:5`, while `prioritySpreadPending:false` (`node-0.log:11073`). Separately, the demo settle loop is a `replica_operations.completed_at` drain loop; at least one operation completes at `17:51:19.717Z` (`node-2.log:3159`) and then no `Operation completed` line is observed before ratings starts at `17:53:17.394Z` (`node-0.log:11127`-`node-0.log:11128`). Owner component: **control-plane active-gate / membership-publication handoff for the coverage invariant**, with **RebalanceCoordinator operation workflow** as the direct source of nonzero in-flight operations for the demo's settle loop.

## Source semantics used

- CDC system-table INSERT/UPDATE writes route through SQL to the target partition leader, then CDC updates caches (`src/cdc/cdc-integration-service-mutation-operations.js:211`-`src/cdc/cdc-integration-service-mutation-operations.js:214`, `src/cdc/cdc-integration-service-mutation-operations.js:357`-`src/cdc/cdc-integration-service-mutation-operations.js:360`). The CDC failure logger copies `firstFailedParticipant`/participant counts onto the failed row log (`src/cdc/cdc-integration-service-shared.js:578`-`src/cdc/cdc-integration-service-shared.js:629`).
- A one-partition write executes one participant (`src/query/distributed/distributed-write-coordinator.js:141`-`src/query/distributed/distributed-write-coordinator.js:164`); failed participants become `participantFailures` and `firstFailedParticipant` (`src/query/distributed/distributed-write-coordinator.js:236`-`src/query/distributed/distributed-write-coordinator.js:315`). INSERT partitioning is by primary key (`src/query/distributed/distributed-write-coordinator.js:462`-`src/query/distributed/distributed-write-coordinator.js:490`).
- `Pending response timeout` is armed after ACK and means no `SERVICE_RESPONSE` arrived before the pending-response timeout (`src/transport/message-router-pending-response-ledger.js:270`-`src/transport/message-router-pending-response-ledger.js:291`).
- The temporary-unroutable quarantine is explicitly a no-handler/stale-address marker (`src/query/query-executor-temporary-unroutable-addresses.js:11`-`src/query/query-executor-temporary-unroutable-addresses.js:55`), while the existing write retry decision can widen to recovery candidates on retryable control-plane write failures (`src/query/query-executor-write-retry-routing.js:486`-`src/query/query-executor-write-retry-routing.js:545`).
- The C3 successorless fallback is a 15s multi-member fallback (`src/partition/partition-service-durability-fitness.js:34`-`src/partition/partition-service-durability-fitness.js:50`), but the normal path demotes immediately when `successorViable:true` (`src/partition/partition-service-durability-fitness.js:358`-`src/partition/partition-service-durability-fitness.js:371`). The loud fallback message is defined as `Durability-unfit leader demoted WITHOUT...` (`src/partition/partition-service-constants.js:253`-`src/partition/partition-service-constants.js:258`); that string was **not observed** in the current `node-*.log` files.
- The readiness trace emits the exact fields used below (`src/control-plane/membership-publication-coordinator-reconcile.js:474`-`src/control-plane/membership-publication-coordinator-reconcile.js:523`). Snapshot coverage or presence failure denies active-gate promotion (`src/control-plane/publication-active-gate-handoff-contract-decision.js:177`-`src/control-plane/publication-active-gate-handoff-contract-decision.js:183`).
- The demo settle loop polls `replica_operations` and `partitions`; it returns settled only after `inFlight === 0` and stable partitions for 3 polls, otherwise it prints STALLED after 120s without completion progress (`examples/service-data-affinity/run-affinity-demo.js:215`-`examples/service-data-affinity/run-affinity-demo.js:278`). `[2/4]` starts by calling the ratings loader (`examples/service-data-affinity/run-affinity-demo.js:455`-`examples/service-data-affinity/run-affinity-demo.js:460`), and the loader runs `DROP`, then `CREATE_RATINGS_SQL`, then INSERT batches (`examples/movielens-access-affinity/lagrange-loader.js:21`-`examples/movielens-access-affinity/lagrange-loader.js:31`, `examples/movielens-access-affinity/lagrange-loader.js:76`-`examples/movielens-access-affinity/lagrange-loader.js:95`).

## 1. Failure histogram and ownership of the 63 ledger row writes

There are 64 `Failed to insert/update system table row` logs in the run, but one is a `nodes` row (`17:49:16.831Z`, `node-1.log:2692`), not a ledger row. The 63 ledger rows are exactly `tableName:"replica_operations"`.

### By minute

| minute | failed ledger row writes |
|---|---:|
| `2026-07-06T17:46` | 9 |
| `2026-07-06T17:47` | 21 |
| `2026-07-06T17:48` | 26 |
| `2026-07-06T17:49` | 4 |
| `2026-07-06T17:53` | 3 |

Pre/post split: `44` before `17:48:33.000Z`; `16` after the r4 heal and before shutdown (`17:48:33`-`17:52:59`); `3` during ratings create/shutdown at `17:53:52`. Therefore the failures continue after the heal and are not only the ~1s durability wedge.

### By failure reason

| reason from `firstFailedParticipant.error` (or row error) | count |
|---|---:|
| Query timeout after 1000ms | 23 |
| Distributed operation failed due to participant failures | 18 |
| Message timeout | 9 |
| Pending response timeout | 4 |
| Query timeout after 1ms | 2 |
| Query timeout after 2500ms | 2 |
| CDCIntegrationService not properly initialized: sqlQueryEngine not provided | 2 |
| Query timeout after 986ms | 1 |
| Query timeout after 383ms | 1 |
| Unable to resolve unified peer address for sql_transaction_participants-p1-r4 | 1 |

### By surfaced participant route

| surfaced route | count |
|---|---:|
| `<none>` | 49 |
| `e5983827-cd93-4ec9-8b8b-bda874ece329/partition/replica_operations-p1-r2` | 6 |
| `6f953741-0b5a-49f4-a146-18e55186a406/partition/replica_operations-p1-r4` | 5 |
| `16ef7595-449a-45f1-a0bf-26c35c2ed82f/partition/replica_operations-p1-r5` | 2 |
| `e5983827-cd93-4ec9-8b8b-bda874ece329/partition/sql_transaction_participants-p1-r2` | 1 |

`<none>` means the log surfaced `partitionId` but no participant address, e.g. `node-2.log:490` has `participantAddress:null` with `replica_operations-p1`; `node-0.log:4291` has the same no-address form with a `Query timeout after 986ms`. Explicit routes include the old r4 leader (`6f953.../replica_operations-p1-r4`), the seed r2 route (`e598.../replica_operations-p1-r2`), and the post-demotion r5 route (`16ef.../replica_operations-p1-r5`).

### By owning operation row

| op row | created as | failures | first -> last failed row | post-heal? | dominant failures / routes |
|---|---|---:|---|---:|---|
| `a4bf20d1` | `2026-07-06T17:46:19.986Z` `node-1.log:781` REPLACE `sql_write_operations-p1` -> `231f721e-1ae5-4084-9fc1-678ec86589bc` | 10 | `2026-07-06T17:46:30.662Z` `node-2.log:490` -> `2026-07-06T17:48:34.196Z` `node-2.log:1420` | 1 | 6x Query timeout after 1000ms; 3x Distributed operation failed due to participant failures; 1x Query timeout after 2500ms<br>10x `<none>` |
| `5deaec9c` | `2026-07-06T17:46:23.794Z` `node-0.log:3950` ADD `control_plane_publications-p1` -> `6f953741-0b5a-49f4-a146-18e55186a406` | 7 | `2026-07-06T17:46:40.479Z` `node-0.log:4291` -> `2026-07-06T17:48:30.530Z` `node-0.log:6470` | 0 | 3x Query timeout after 1000ms; 2x Distributed operation failed due to participant failures; 1x Query timeout after 986ms<br>7x `<none>` |
| `114fa70c` | `2026-07-06T17:46:24.033Z` `node-3.log:605` ADD `sql_transaction_participants-p1` -> `6f953741-0b5a-49f4-a146-18e55186a406` | 6 | `2026-07-06T17:46:41.974Z` `node-3.log:684` -> `2026-07-06T17:47:56.079Z` `node-3.log:956` | 0 | 4x Distributed operation failed due to participant failures; 2x Query timeout after 1000ms<br>6x `<none>` |
| `d7934d68` | `2026-07-06T17:46:22.852Z` `node-1.log:815` REPLACE `sql_transactions-p1` -> `2296b321-3d84-4b61-8818-1a6e7849c5e9` | 12 | `2026-07-06T17:46:41.982Z` `node-4.log:566` -> `2026-07-06T17:49:04.522Z` `node-2.log:1659` | 5 | 7x Query timeout after 1000ms; 4x Distributed operation failed due to participant failures; 1x Query timeout after 2500ms<br>12x `<none>` |
| `5c629581` | `2026-07-06T17:45:19.614Z` `node-0.log:1522` REPLACE `replica_operations-p1` -> `6f953741-0b5a-49f4-a146-18e55186a406` | 6 | `2026-07-06T17:46:45.222Z` `node-2.log:633` -> `2026-07-06T17:48:47.788Z` `node-2.log:1541` | 1 | 4x Query timeout after 1000ms; 2x Distributed operation failed due to participant failures<br>6x `<none>` |
| `983e0fd1` | `2026-07-06T17:47:03.037Z` `node-3.log:755` REPLACE `mg-16ef7595-26c35c2ed82f` -> `e5983827-cd93-4ec9-8b8b-bda874ece329` | 4 | `2026-07-06T17:47:08.173Z` `node-3.log:776` -> `2026-07-06T17:48:39.442Z` `node-3.log:1142` | 1 | 2x Message timeout; 1x Pending response timeout; 1x Unable to resolve unified peer address for sql_transaction_participants-p1-r4<br>2x `e5983827-cd93-4ec9-8b8b-bda874ece329/partition/replica_operations-p1-r2`; 1x `6f953741-0b5a-49f4-a146-18e55186a406/partition/replica_operations-p1-r4`; 1x `e5983827-cd93-4ec9-8b8b-bda874ece329/partition/sql_transaction_participants-p1-r2` |
| `abd28ec1` | `2026-07-06T17:47:02.057Z` `node-4.log:689` REPLACE `sql_transaction_participants-p1` -> `16ef7595-449a-45f1-a0bf-26c35c2ed82f` | 3 | `2026-07-06T17:47:31.148Z` `node-4.log:839` -> `2026-07-06T17:48:37.232Z` `node-3.log:1127` | 1 | 1x Message timeout; 1x Pending response timeout; 1x Distributed operation failed due to participant failures<br>1x `e5983827-cd93-4ec9-8b8b-bda874ece329/partition/replica_operations-p1-r2`; 1x `6f953741-0b5a-49f4-a146-18e55186a406/partition/replica_operations-p1-r4`; 1x `<none>` |
| `f5d2a314` | `2026-07-06T17:47:37.822Z` `node-0.log:5539` ADD `sql_write_operations-p1` -> `2296b321-3d84-4b61-8818-1a6e7849c5e9` | 3 | `2026-07-06T17:48:00.137Z` `node-0.log:5948` -> `2026-07-06T17:48:55.249Z` `node-0.log:6990` | 1 | 2x Query timeout after 1ms; 1x Pending response timeout<br>2x `<none>`; 1x `6f953741-0b5a-49f4-a146-18e55186a406/partition/replica_operations-p1-r4` |
| `6dea483f` | `2026-07-06T17:47:26.669Z` `node-3.log:858` REMOVE `control_plane_publications-p1` -> `e5983827-cd93-4ec9-8b8b-bda874ece329` | 3 | `2026-07-06T17:48:01.108Z` `node-3.log:964` -> `2026-07-06T17:48:22.671Z` `node-3.log:1026` | 0 | 2x Message timeout; 1x Pending response timeout<br>2x `6f953741-0b5a-49f4-a146-18e55186a406/partition/replica_operations-p1-r4`; 1x `e5983827-cd93-4ec9-8b8b-bda874ece329/partition/replica_operations-p1-r2` |
| `1316cda5` | `2026-07-06T17:48:00.355Z` `node-0.log:5976` ADD `sql_transactions-p1` -> `6f953741-0b5a-49f4-a146-18e55186a406` | 3 | `2026-07-06T17:48:36.043Z` `node-0.log:6556` -> `2026-07-06T17:49:19.401Z` `node-0.log:7448` | 3 | 2x Message timeout; 1x Query timeout after 1000ms<br>2x `16ef7595-449a-45f1-a0bf-26c35c2ed82f/partition/replica_operations-p1-r5`; 1x `<none>` |
| `50c73b0d` | `2026-07-06T17:48:27.507Z` `node-2.log:1372` REPLACE `mg-231f721e-678ec86589bc` -> `16ef7595-449a-45f1-a0bf-26c35c2ed82f` | 3 | `2026-07-06T17:48:36.571Z` `node-2.log:1444` -> `2026-07-06T17:49:08.851Z` `node-2.log:1699` | 3 | 2x Message timeout; 1x Distributed operation failed due to participant failures<br>2x `e5983827-cd93-4ec9-8b8b-bda874ece329/partition/replica_operations-p1-r2`; 1x `<none>` |
| `5407795e` | `2026-07-06T17:53:17.407Z` `node-0.log:11137` ADD `tbl-bcd735ff-0e03-434a-b545-b08808eedec4-p1` -> `e5983827-cd93-4ec9-8b8b-bda874ece329` | 2 | `2026-07-06T17:53:52.163Z` `node-0.log:11596` -> `2026-07-06T17:53:52.167Z` `node-0.log:11604` | 2 | 1x Distributed operation failed due to participant failures; 1x CDCIntegrationService not properly initialized: sqlQueryEngine not provided<br>2x `<none>` |
| `99d459cc` | `2026-07-06T17:53:22.613Z` `node-0.log:11188` ADD `tbl-bcd735ff-0e03-434a-b545-b08808eedec4-p1` -> `16ef7595-449a-45f1-a0bf-26c35c2ed82f` | 1 | `2026-07-06T17:53:52.165Z` `node-0.log:11601` -> `2026-07-06T17:53:52.165Z` `node-0.log:11601` | 1 | 1x CDCIntegrationService not properly initialized: sqlQueryEngine not provided<br>1x `<none>` |

### Full ledger failure ledger (all 63 timestamps)

| # | time | cite | row op | action | participant / route | failure |
|---:|---|---|---|---|---|---|
| 1 | `2026-07-06T17:46:30.662Z` | `node-2.log:490` | `a4bf20d1` | UPDATE | `replica_operations-p1 / <none>` | Distributed operation failed due to participant failures |
| 2 | `2026-07-06T17:46:40.479Z` | `node-0.log:4291` | `5deaec9c` | UPDATE | `replica_operations-p1 / <none>` | Query timeout after 986ms |
| 3 | `2026-07-06T17:46:41.974Z` | `node-3.log:684` | `114fa70c` | UPDATE | `replica_operations-p1 / <none>` | Query timeout after 1000ms |
| 4 | `2026-07-06T17:46:41.982Z` | `node-4.log:566` | `d7934d68` | UPDATE | `replica_operations-p1 / <none>` | Query timeout after 1000ms |
| 5 | `2026-07-06T17:46:45.222Z` | `node-2.log:633` | `5c629581` | UPDATE | `replica_operations-p1 / <none>` | Query timeout after 1000ms |
| 6 | `2026-07-06T17:46:46.341Z` | `node-2.log:639` | `a4bf20d1` | UPDATE | `replica_operations-p1 / <none>` | Query timeout after 1000ms |
| 7 | `2026-07-06T17:46:56.778Z` | `node-4.log:637` | `d7934d68` | UPDATE | `replica_operations-p1 / <none>` | Query timeout after 1000ms |
| 8 | `2026-07-06T17:46:56.781Z` | `node-3.log:732` | `114fa70c` | UPDATE | `replica_operations-p1 / <none>` | Distributed operation failed due to participant failures |
| 9 | `2026-07-06T17:46:58.418Z` | `node-0.log:4650` | `5deaec9c` | UPDATE | `replica_operations-p1 / <none>` | Query timeout after 383ms |
| 10 | `2026-07-06T17:47:00.168Z` | `node-2.log:737` | `5c629581` | UPDATE | `replica_operations-p1 / <none>` | Query timeout after 1000ms |
| 11 | `2026-07-06T17:47:01.132Z` | `node-2.log:746` | `a4bf20d1` | UPDATE | `replica_operations-p1 / <none>` | Query timeout after 1000ms |
| 12 | `2026-07-06T17:47:08.173Z` | `node-3.log:776` | `983e0fd1` | INSERT | `e5983827-cd93-4ec9-8b8b-bda874ece329/partition/replica_operations-p1-r2` | Message timeout |
| 13 | `2026-07-06T17:47:11.326Z` | `node-4.log:729` | `d7934d68` | UPDATE | `replica_operations-p1 / <none>` | Distributed operation failed due to participant failures |
| 14 | `2026-07-06T17:47:11.514Z` | `node-3.log:789` | `114fa70c` | UPDATE | `replica_operations-p1 / <none>` | Distributed operation failed due to participant failures |
| 15 | `2026-07-06T17:47:14.182Z` | `node-3.log:794` | `983e0fd1` | INSERT | `e5983827-cd93-4ec9-8b8b-bda874ece329/partition/replica_operations-p1-r2` | Message timeout |
| 16 | `2026-07-06T17:47:14.235Z` | `node-0.log:4973` | `5deaec9c` | UPDATE | `replica_operations-p1 / <none>` | Query timeout after 1000ms |
| 17 | `2026-07-06T17:47:17.005Z` | `node-2.log:859` | `a4bf20d1` | UPDATE | `replica_operations-p1 / <none>` | Query timeout after 1000ms |
| 18 | `2026-07-06T17:47:26.142Z` | `node-4.log:801` | `d7934d68` | UPDATE | `replica_operations-p1 / <none>` | Distributed operation failed due to participant failures |
| 19 | `2026-07-06T17:47:26.304Z` | `node-3.log:839` | `114fa70c` | UPDATE | `replica_operations-p1 / <none>` | Query timeout after 1000ms |
| 20 | `2026-07-06T17:47:29.427Z` | `node-0.log:5346` | `5deaec9c` | UPDATE | `replica_operations-p1 / <none>` | Distributed operation failed due to participant failures |
| 21 | `2026-07-06T17:47:30.217Z` | `node-3.log:869` | `983e0fd1` | INSERT | `6f953741-0b5a-49f4-a146-18e55186a406/partition/replica_operations-p1-r4` | Pending response timeout |
| 22 | `2026-07-06T17:47:31.148Z` | `node-4.log:839` | `abd28ec1` | INSERT | `e5983827-cd93-4ec9-8b8b-bda874ece329/partition/replica_operations-p1-r2` | Message timeout |
| 23 | `2026-07-06T17:47:31.991Z` | `node-2.log:993` | `5c629581` | UPDATE | `replica_operations-p1 / <none>` | Query timeout after 1000ms |
| 24 | `2026-07-06T17:47:31.995Z` | `node-2.log:997` | `a4bf20d1` | UPDATE | `replica_operations-p1 / <none>` | Query timeout after 1000ms |
| 25 | `2026-07-06T17:47:41.293Z` | `node-3.log:914` | `114fa70c` | UPDATE | `replica_operations-p1 / <none>` | Distributed operation failed due to participant failures |
| 26 | `2026-07-06T17:47:44.859Z` | `node-0.log:5665` | `5deaec9c` | UPDATE | `replica_operations-p1 / <none>` | Query timeout after 1000ms |
| 27 | `2026-07-06T17:47:46.704Z` | `node-4.log:908` | `abd28ec1` | INSERT | `6f953741-0b5a-49f4-a146-18e55186a406/partition/replica_operations-p1-r4` | Pending response timeout |
| 28 | `2026-07-06T17:47:46.993Z` | `node-2.log:1109` | `5c629581` | UPDATE | `replica_operations-p1 / <none>` | Query timeout after 1000ms |
| 29 | `2026-07-06T17:47:48.489Z` | `node-2.log:1119` | `a4bf20d1` | UPDATE | `replica_operations-p1 / <none>` | Query timeout after 1000ms |
| 30 | `2026-07-06T17:47:56.079Z` | `node-3.log:956` | `114fa70c` | UPDATE | `replica_operations-p1 / <none>` | Distributed operation failed due to participant failures |
| 31 | `2026-07-06T17:48:00.137Z` | `node-0.log:5948` | `f5d2a314` | INSERT | `6f953741-0b5a-49f4-a146-18e55186a406/partition/replica_operations-p1-r4` | Pending response timeout |
| 32 | `2026-07-06T17:48:00.369Z` | `node-0.log:5980` | `f5d2a314` | UPDATE | `replica_operations-p1 / <none>` | Query timeout after 1ms |
| 33 | `2026-07-06T17:48:01.108Z` | `node-3.log:964` | `6dea483f` | INSERT | `6f953741-0b5a-49f4-a146-18e55186a406/partition/replica_operations-p1-r4` | Message timeout |
| 34 | `2026-07-06T17:48:01.402Z` | `node-4.log:1049` | `d7934d68` | UPDATE | `replica_operations-p1 / <none>` | Query timeout after 1000ms |
| 35 | `2026-07-06T17:48:03.360Z` | `node-2.log:1218` | `a4bf20d1` | UPDATE | `replica_operations-p1 / <none>` | Distributed operation failed due to participant failures |
| 36 | `2026-07-06T17:48:07.118Z` | `node-3.log:978` | `6dea483f` | INSERT | `e5983827-cd93-4ec9-8b8b-bda874ece329/partition/replica_operations-p1-r2` | Message timeout |
| 37 | `2026-07-06T17:48:09.465Z` | `node-1.log:1736` | `a4bf20d1` | UPDATE | `replica_operations-p1 / <none>` | Query timeout after 2500ms |
| 38 | `2026-07-06T17:48:15.049Z` | `node-0.log:6219` | `5deaec9c` | UPDATE | `replica_operations-p1 / <none>` | Query timeout after 1000ms |
| 39 | `2026-07-06T17:48:16.320Z` | `node-4.log:1147` | `d7934d68` | UPDATE | `replica_operations-p1 / <none>` | Query timeout after 1000ms |
| 40 | `2026-07-06T17:48:19.322Z` | `node-2.log:1314` | `a4bf20d1` | UPDATE | `replica_operations-p1 / <none>` | Query timeout after 1000ms |
| 41 | `2026-07-06T17:48:22.671Z` | `node-3.log:1026` | `6dea483f` | INSERT | `6f953741-0b5a-49f4-a146-18e55186a406/partition/replica_operations-p1-r4` | Pending response timeout |
| 42 | `2026-07-06T17:48:30.530Z` | `node-0.log:6470` | `5deaec9c` | UPDATE | `replica_operations-p1 / <none>` | Distributed operation failed due to participant failures |
| 43 | `2026-07-06T17:48:31.534Z` | `node-4.log:1265` | `d7934d68` | UPDATE | `replica_operations-p1 / <none>` | Query timeout after 1000ms |
| 44 | `2026-07-06T17:48:32.721Z` | `node-2.log:1412` | `5c629581` | UPDATE | `replica_operations-p1 / <none>` | Distributed operation failed due to participant failures |
| 45 | `2026-07-06T17:48:34.196Z` | `node-2.log:1420` | `a4bf20d1` | UPDATE | `replica_operations-p1 / <none>` | Distributed operation failed due to participant failures |
| 46 | `2026-07-06T17:48:36.043Z` | `node-0.log:6556` | `1316cda5` | INSERT | `16ef7595-449a-45f1-a0bf-26c35c2ed82f/partition/replica_operations-p1-r5` | Message timeout |
| 47 | `2026-07-06T17:48:36.571Z` | `node-2.log:1444` | `50c73b0d` | INSERT | `e5983827-cd93-4ec9-8b8b-bda874ece329/partition/replica_operations-p1-r2` | Message timeout |
| 48 | `2026-07-06T17:48:37.232Z` | `node-3.log:1127` | `abd28ec1` | UPDATE | `replica_operations-p1 / <none>` | Distributed operation failed due to participant failures |
| 49 | `2026-07-06T17:48:39.442Z` | `node-3.log:1142` | `983e0fd1` | UPDATE | `e5983827-cd93-4ec9-8b8b-bda874ece329/partition/sql_transaction_participants-p1-r2` | Unable to resolve unified peer address for sql_transaction_participants-p1-r4 |
| 50 | `2026-07-06T17:48:46.389Z` | `node-4.log:1427` | `d7934d68` | UPDATE | `replica_operations-p1 / <none>` | Query timeout after 1000ms |
| 51 | `2026-07-06T17:48:47.788Z` | `node-2.log:1541` | `5c629581` | UPDATE | `replica_operations-p1 / <none>` | Distributed operation failed due to participant failures |
| 52 | `2026-07-06T17:48:49.734Z` | `node-1.log:1974` | `d7934d68` | UPDATE | `replica_operations-p1 / <none>` | Query timeout after 2500ms |
| 53 | `2026-07-06T17:48:49.737Z` | `node-2.log:1570` | `d7934d68` | UPDATE | `replica_operations-p1 / <none>` | Query timeout after 1000ms |
| 54 | `2026-07-06T17:48:50.988Z` | `node-2.log:1571` | `50c73b0d` | INSERT | `e5983827-cd93-4ec9-8b8b-bda874ece329/partition/replica_operations-p1-r2` | Message timeout |
| 55 | `2026-07-06T17:48:55.064Z` | `node-0.log:6963` | `1316cda5` | INSERT | `16ef7595-449a-45f1-a0bf-26c35c2ed82f/partition/replica_operations-p1-r5` | Message timeout |
| 56 | `2026-07-06T17:48:55.249Z` | `node-0.log:6990` | `f5d2a314` | UPDATE | `replica_operations-p1 / <none>` | Query timeout after 1ms |
| 57 | `2026-07-06T17:49:03.284Z` | `node-4.log:1568` | `d7934d68` | UPDATE | `replica_operations-p1 / <none>` | Distributed operation failed due to participant failures |
| 58 | `2026-07-06T17:49:04.522Z` | `node-2.log:1659` | `d7934d68` | UPDATE | `replica_operations-p1 / <none>` | Distributed operation failed due to participant failures |
| 59 | `2026-07-06T17:49:08.851Z` | `node-2.log:1699` | `50c73b0d` | UPDATE | `replica_operations-p1 / <none>` | Distributed operation failed due to participant failures |
| 60 | `2026-07-06T17:49:19.401Z` | `node-0.log:7448` | `1316cda5` | UPDATE | `replica_operations-p1 / <none>` | Query timeout after 1000ms |
| 61 | `2026-07-06T17:53:52.163Z` | `node-0.log:11596` | `5407795e` | UPDATE | `replica_operations-p1 / <none>` | Distributed operation failed due to participant failures |
| 62 | `2026-07-06T17:53:52.165Z` | `node-0.log:11601` | `99d459cc` | UPDATE | `<none> / <none>` | CDCIntegrationService not properly initialized: sqlQueryEngine not provided |
| 63 | `2026-07-06T17:53:52.167Z` | `node-0.log:11604` | `5407795e` | UPDATE | `<none> / <none>` | CDCIntegrationService not properly initialized: sqlQueryEngine not provided |

## 2. Settle-pending reconstruction (`17:49`-`17:53`)

The active-gate owner repeatedly reports that all 5 active nodes are published but the active gate is denied by snapshot coverage:

- `17:49:00.722Z` — `contractState:degraded`, `contractReason:published_active_coverage_incomplete`, `expectedNodeCount:5`, `publishedActiveNodeCount:5`, `fenceSnapshotCoverageMissingCount:5`, `prioritySpreadPending:false` (`node-0.log:7110`).
- `17:49:16.209Z` — same coverage denial, but priority spread reopens: `prioritySpreadPending:true`, `priorityRecoveryReasonCodes:["priority_partitions_not_spread"]`, `recoveryProtocolState:"priority_spread_pending"` (`node-0.log:7321`). The contemporaneous non-system rebalancer deferral names `sql_transactions-p1` as the remaining blocked priority partition with `readyDistinctNodeCount:1`, `spreadGap:2` (`node-0.log:7313`-`node-0.log:7326`). Earlier in that same phase the blocked set was `sql_transaction_participants-p1`, `sql_transactions-p1`, and `sql_write_operations-p1` (`node-0.log:7087`), then shrank to `sql_transactions-p1` + `sql_write_operations-p1` (`node-0.log:7163`), then only `sql_transactions-p1` (`node-0.log:7176`).
- `17:49:32.671Z` — priority spread temporarily closes (`prioritySpreadPending:false`) but the same snapshot coverage denial remains (`node-0.log:8200`).
- `17:49:44.075Z` and `17:50:47.961Z` — priority spread reopens with `priority_partitions_not_spread` (`node-0.log:8487`, `node-0.log:9499`). Planning diagnostics show create-required churn on `control_plane_publications-p1`, `sql_transactions-p1`, and `sql_write_operations-p1` between `17:49:30` and `17:51:16` (examples: `node-0.log:8118`, `node-4.log:3402`, `node-4.log:3406`).
- `17:51:19.212Z`, `17:53:04.284Z`, `17:53:09.284Z`, `17:53:14.279Z`, `17:53:19.281Z` — final stable state: `prioritySpreadPending:false`, no priority recovery reasons, but `contractState:degraded`, `contractReason:published_active_coverage_incomplete`, `fenceState:promotion_denied`, `fenceMissingProofReasons:["snapshot_coverage_unavailable"]`, `fenceSnapshotCoverageMissingCount:5` (`node-0.log:9788`, `node-0.log:10931`, `node-0.log:11011`, `node-0.log:11073`, `node-0.log:11156`).

The trace reports a missing **node-count** for active-gate snapshot coverage; it does not emit per-partition IDs for the final coverage gap. The only per-partition priority-spread blockers observed in logs are the priority control-plane partitions above; by the final `17:51:19`-`17:53:19` trace, priority spread is closed and the last unmet active-gate condition is snapshot coverage (`missingNodeCount:5`).

The demo's own settle loop is not an active-gate check: it waits for no `replica_operations.completed_at IS NULL` rows and stable partition count (`examples/service-data-affinity/run-affinity-demo.js:215`-`examples/service-data-affinity/run-affinity-demo.js:278`). In the logs, the last observed operation completion before ratings is `4560bbbc...` (`ADD sql_transactions-p1`) at `17:51:19.717Z` (`node-2.log:3158`-`node-2.log:3159`). Several operation workflow rows remain non-terminal across/through the settle window, with log evidence such as `3efed647...` created for `control_plane_publications-p1` at `17:51:28.330Z` and only deferred at shutdown (`node-0.log:9933`, `node-1.log:3265`, `node-2.log:4852`), `84048586...` created for `debug_snapshots-p1` at `17:52:41.531Z` and only moved to ACTIVE (`node-0.log:10664`, `node-0.log:10746`), and older pending workflow rows such as `22475eb1...` / `51be5f59...` (`node-0.log:9129`, `node-2.log:2422`, `node-4.log:3762`, `node-2.log:4896`). These in-flight rows explain why the demo settle loop does not satisfy `inFlight === 0`; the active-gate trace explains the semantic formation contract still being degraded.

## 3. Ratings `[2/4]` client-side failure

No `[2/4]`, `STALLED`, or admin-timeout stdout lines are present in the artifact directory; only the five node logs and per-node `cluster-rejoin-hints.json` files are present. The runner source prints `[2/4]` immediately before `loadRatingsIntoLagrange()` (`examples/service-data-affinity/run-affinity-demo.js:455`-`examples/service-data-affinity/run-affinity-demo.js:457`).

Server-side evidence for the failed ratings load:

- The loader's tolerated `DROP TABLE IF EXISTS ratings` fails because `DROP_TABLE` is unsupported at `17:53:17.394Z` (`node-0.log:11127`), which is expected by the loader (`examples/movielens-access-affinity/lagrange-loader.js:25`-`examples/movielens-access-affinity/lagrange-loader.js:30`).
- `CREATE TABLE IF NOT EXISTS ratings` starts at `17:53:17.397Z` (`node-0.log:11128`). It creates the first table partition operation at `17:53:17.407Z` (`node-0.log:11136`-`node-0.log:11137`) and a second ADD at `17:53:22.613Z` (`node-0.log:11187`-`node-0.log:11188`).
- At `17:53:52.168Z`, table provisioning fails with `CDCIntegrationService not properly initialized: sqlQueryEngine not provided`, and the SQL query for the ratings CREATE logs the same error with `retryAfterMs:100`, `deferRetry:true` (`node-0.log:11608`-`node-0.log:11609`). The admin client default timeout is 30s (`scripts/examples/examples-runner-constants.js:8`, `scripts/examples/admin-ws-client.js:123`-`scripts/examples/admin-ws-client.js:131`), matching the ~35s server-side CREATE interval plus shutdown cleanup. No `INSERT INTO ratings` line is observed; the load never reaches batch inserts.

## 4. Leader and routing health after the r4 heal

The C3 fallback did not fire in this artifact: the observed r4 demotion was the normal viable-successor path. Node-1 reports r4 as durability-unfit with `successorViable:true` at `17:48:32.374Z` (`node-1.log:1915`), loses leadership immediately (`node-1.log:1916`), rolls the zombie ACTIVE transaction back at `17:48:33.375Z` (`node-1.log:1917`), and reports durability recovered at `17:48:33.376Z` (`node-1.log:1918`).

The next ledger leader is r5 on node-3: `Became leader (liferaft)` for `replica_operations-p1-r5` at `17:48:41.750Z` (`node-3.log:1148`-`node-3.log:1149`). It loses leadership at `17:48:56.510Z` (`node-3.log:2894`) and becomes leader again at `17:49:07.159Z` (`node-3.log:2948`-`node-3.log:2949`). I did not observe another `leader_durability_unfit` for `replica_operations-p1` after node-1's recovery line.

Post-heal failures show both recovery and a routing-health gap:

- Explicit post-heal ledger routes hit r5 (`16ef.../replica_operations-p1-r5`) and time out at `17:48:36.043Z` and `17:48:55.064Z` (`node-0.log:6556`, `node-0.log:6963`); others still route to seed r2 (`e598.../replica_operations-p1-r2`) at `17:48:36.571Z` and `17:48:50.988Z` (`node-2.log:1444`, `node-2.log:1571`). These are not stale r4 hammering.
- The old r4 pending-response route appears only before the heal (`17:47:30.217Z`, `17:47:46.704Z`, `17:48:00.137Z`, `17:48:22.671Z`; e.g. `node-3.log:869`-`node-3.log:870`, `node-0.log:5948`). After `17:48:33`, the post-heal explicit routes are r5, r2, or the unrelated `sql_transaction_participants-p1-r2` failed-table route (`node-3.log:1142`-`node-3.log:1143`).
- The final pre-ratings failed ledger row is at `17:49:19.401Z` (`node-0.log:7448`-`node-0.log:7450`). After that, no failed `replica_operations` row write is observed until ratings CREATE/shutdown at `17:53:52.163Z` (`node-0.log:11596`).

So Leg-2-style quarantine is still relevant as a defense-in-depth gap (message timeouts and null-route query timeouts keep retrying through whatever route the coordinator selects), but this artifact does **not** show retries hammering the old r4 leader after the heal. It shows a broader route/settle health problem across r5/r2/null-address paths, followed by a long no-ledger-failure interval where active-gate coverage and in-flight operation drain remain unresolved.

## 5. Binding head / first violated invariant

For this artifact, the binding head is:

1. **Semantic control-plane formation contract:** active-gate snapshot coverage is unavailable for all five expected/published active nodes. Evidence: `publishedActiveNodeCount:5`, `missingPublishedCount:0`, `pendingRecoveryCount:0`, `pendingReconcileCount:0`, `prioritySpreadPending:false`, but `fenceSnapshotCoverageState:"unavailable"`, `fenceSnapshotCoverageMissingCount:5`, `fencePromotionAllowed:false` at `17:53:14.279Z` (`node-0.log:11073`). Owner: **control-plane active-gate / membership-publication handoff**.
2. **Demo settle-loop mechanical condition:** the runner waits for no in-flight `replica_operations`, and operation completions stop after `17:51:19.717Z` (`node-2.log:3159`) while in-flight operation workflow rows continue to exist / defer until shutdown (examples above). Owner: **RebalanceCoordinator / operation workflow**.

Continuing ledger write failures are not the binding head after `17:49:19`: there is a multi-minute gap with no observed failed `replica_operations` row write before ratings create/shutdown. A repeated unfit-leader demote cycle is also not observed after r4 recovers.

## Open questions

- The final active-gate trace gives `fenceSnapshotCoverageMissingCount:5` but not the node IDs or partitions behind the coverage gap. If the next fix targets active-gate coverage, add/enable a low-volume trace that emits the missing coverage identities.
- Several operation rows remain non-terminal across the settle window even after priority spread reports closed. Determine whether operation workflow should terminalize/retire these rows once active-gate coverage is unavailable but priority recovery is clean, or whether active-gate snapshot coverage should advance first and then allow retirement.
- The post-heal route failures include r5/r2 message timeouts and null-address query timeouts. Leg-2 quarantine should be evaluated against these post-heal routes, not only the old r4 route.
