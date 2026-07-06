# Run-1 post-C3 interlock/composition diagnosis

Artifact: current `data/examples/service-data-affinity-demo/node-{0..4}.log` files (mtimes 2026-07-06 19:53 local). I treated the earlier 15:22-15:30Z bundle as stale and cited only the current 17:44-17:53Z contents.

## Source semantics used

- A disruptive operation-ledger self-move is only `REPLACE`/`REMOVE` of an operation-ledger partition; `ADD` is not in the disruptive set (`src/rebalancer/rebalance-coordinator-ledger-interlock-admission.js:18-27`, `src/rebalancer/rebalance-coordinator-ledger-interlock-admission.js:64-68`).
- While a live ledger self-move exists, non-emergency operations defer; a self-move itself admits only into an idle ledger (`src/rebalancer/rebalance-coordinator-ledger-interlock-admission.js:100-121`, `src/rebalancer/rebalance-coordinator-ledger-interlock-admission.js:160-222`). The synchronous create gate also emits `operation_ledger_self_move_waiting_for_idle_ledger` when another create/self-move is in the gate (`src/rebalancer/rebalance-coordinator-ledger-interlock-admission.js:437-561`).
- `operation_ledger_quorum_concentrated` is emitted when actual operation-ledger voters outside the hottest node cannot form a majority, and the hold is actionable if a feasible target exists or the ledger partition is over target (`src/rebalancer/operation-ledger-quorum-concentration.js:117-155`, `src/rebalancer/operation-ledger-quorum-concentration.js:158-166`).
- `MOVE_SKIPPED` logs contain both `admissionReason` and `admissionBlockingReasonCodes`, so raw string counts double-count one skip record; the actual moved partition is `movePartitionId` when present, otherwise the rebalancer `entityId` (`src/rebalancer/unified-rebalancer-follow-up-move.js:622-646`). Examples in this run show the same reason twice on one record (`node-0.log:1508` at 17:45:19.558Z, `node-0.log:2185` at 17:45:36.423Z).
- `Creating operation` is logged immediately before `persistNewOperation()`, after admission/interlock checks (`src/rebalancer/rebalance-coordinator-operation-creation.js:580-594`). Therefore a ratings `Creating operation` line is evidence that the ADD was admitted, not held.

## Node/replica alias map

| file | node id | evidence |
| --- | --- | --- |
| `node-0.log` | `e5983827-cd93-4ec9-8b8b-bda874ece329` | `node-0.log:1` at 17:44:48.425Z |
| `node-1.log` | `6f953741-0b5a-49f4-a146-18e55186a406` | `node-1.log:1` at 17:45:18.349Z |
| `node-2.log` | `231f721e-1ae5-4084-9fc1-678ec86589bc` | `node-2.log:1` at 17:45:18.358Z |
| `node-3.log` | `16ef7595-449a-45f1-a0bf-26c35c2ed82f` | `node-3.log:1` at 17:45:18.356Z |
| `node-4.log` | `2296b321-3d84-4b61-8818-1a6e7849c5e9` | `node-4.log:1` at 17:45:18.358Z |

## `replica_operations-p1` composition / leadership timeline

| time (UTC) | event | composition implication | citations |
| --- | --- | --- | --- |
| 17:45:02.535-17:45:07.022 | Bootstrap creates `r1`, `r3`, `r2` on node-0. | Count is 3, but all three observed bootstrap replicas are on the seed node. | `node-0.log:311-312`, `node-0.log:392-393`, `node-0.log:442-443` |
| 17:45:17.951 | `r1` is leader term 1 on node-0. | Seed owns the ledger leader before spread. | `node-0.log:1190` |
| 17:45:19.552-17:45:36.279 | First disruptive self-move executes: `REPLACE replica_operations-p1-r1` node-0 -> node-1, op `5c629581-...`; `r4` is created/activated, leadership handoff completes, `r1` is removed, operation completes. | Composition becomes observed `r2,r3` on node-0 + `r4` on node-1. Count is target 3 but still seed-heavy. | move `node-0.log:1504`; create `node-0.log:1522`; `r4` start/active `node-1.log:208-209`, `node-1.log:275-278`; handoff `node-1.log:281-282`; `r1` removal `node-0.log:2122-2129`; complete `node-0.log:2132-2136` |
| 17:45:36.422-17:45:41.533 | Quorum-spread hold observes `replica_operations-p1` concentrated/actionable (`totalVoters:2`, `maxVotersOnOneNode:2`, feasible target node-4), and defers dependent control-plane/system REPLACEs. | The first spread leg has not released dependent admission. | `node-0.log:2184-2192`; repeated warning from node-1 `node-1.log:357-358` |
| 17:45:41.539-17:45:51.049 | Non-disruptive spread ADD executes: op `20b25796-...` creates `r5` on node-3; `r5` reaches active; ADD completes. | Ledger gains a voter on node-3. Because ADD is not a disruptive self-move, it is a spread leg, not a self-move execution. | create `node-1.log:360`; dispatch `node-1.log:366-376`; `r5` create/active `node-3.log:297-301`, `node-3.log:383-387`; complete `node-1.log:433-434` |
| 17:45:51.115-17:46:12.395 | Second disruptive self-move executes: `REPLACE replica_operations-p1-r3` node-0 -> node-4, op `ad610cdc-...`; `r6` is created/activated; `r3` is removed on node-0; operation completes. | Observed active set becomes `r2` node-0 + `r4` node-1 + `r5` node-3 + `r6` node-4: spread has executed, but count is 4 for a target of 3. | move `node-1.log:448`; create `node-1.log:450`; `r6` create/active `node-4.log:300-302`, `node-4.log:387-390`; remove dispatch `node-4.log:398-400`; `r3` removal `node-0.log:3414-3420`; complete `node-3.log:463-465`, `node-1.log:665-668` |
| 17:46:20.477-17:46:20.485 | A later `REPLACE replica_operations-p1-r5` node-3 -> node-2 is planned, but skipped with `operation_ledger_self_move_waiting_for_idle_ledger`. | This is a self-move attempt, not an execution: no `Creating operation` for this p1 move is observed; the idle-ledger interlock blocks it. | `node-1.log:787-788` |
| 17:48:32.374-17:48:41.750 | Closed C3 class: `r4` is demoted after durability unfitness; `r5` later becomes leader. | Leadership moves from node-1 `r4` to node-3 `r5`; I did not re-diagnose this closed deadlock. | unfit/demotion evidence `node-1.log:1915-1918`; `r5` leader `node-3.log:1148-1149` |
| 17:48:56.510-17:49:07.159 | `r5` loses and regains leadership (term 8). | Same node-3 replica resumes p1 leadership before the surplus-drain attempt. | `node-3.log:2894`, `node-3.log:2948-2949` |
| 17:49:07.219-17:49:07.958 | Surplus state is explicit: `targetReplicaCount:3`, `activeCount:4`, `overCreationCap:true`. Rebalancer plans a `REMOVE replica_operations-p1-r5` with `currentCount:4`, `targetCount:3`, but the remove is skipped with `operation_ledger_self_move_waiting_for_idle_ledger`. | The partition is still over target (4/3). Surplus drain is attempted and skipped; it is not observed to complete in this artifact. | over-target/defer-add `node-3.log:2957`; planning `node-3.log:2958-2959`; remove attempt `node-3.log:2960`; skip `node-3.log:2964` |
| 17:49:45.804 | Last observed `operation_ledger_quorum_concentrated` reason record, deferring a `control_plane_publications-p1` REPLACE. | Last interlock reason is still >85s before the 17:51:15 stall window and >3.5 minutes before ratings create starts. | `node-0.log:8498-8500` |
| 17:53:47.401 | `r5` loses p1 leadership during shutdown/failure tail. | Shows p1 logs continue after the last interlock record; not a new self-move. | `node-3.log:4913` |

Summary: the spread operations execute and terminalize at the operation-row level by 17:46:12, but the partition is later observed over target at 4/3 and the surplus-drain remove is skipped at 17:49:07. A clean target composition (3 active replicas at target placement) is not observed after the spread.

## Interlock hold accounting

Counts below are JSON log records containing the reason code; raw string occurrences are exactly double because each `MOVE_SKIPPED` line carries the reason in both `admissionReason` and `admissionBlockingReasonCodes` (e.g. `node-0.log:1508`, `node-0.log:2185`; logging source `src/rebalancer/unified-rebalancer-follow-up-move.js:622-646`).

| reason | raw occurrences | JSON records | first record | last record | 10s-bin histogram (records) | operations deferred |
| --- | ---: | ---: | --- | --- | --- | --- |
| `operation_ledger_self_move_in_flight` | 346 | 173 | `node-0.log:1508` 17:45:19.558Z, `control_plane_publications-p1` REPLACE | `node-0.log:3413` 17:46:06.664Z, `control_plane_publications-p1` REPLACE | 17:45:10=4, 17:45:20=36, 17:45:30=15, 17:45:50=51, 17:46:00=67 | Only rebalancer `MOVE_SKIPPED` records: 65 `control_plane_publications-p1` REPLACEs, 36 `sql_transaction_participants-p1` REPLACEs, 36 `sql_transactions-p1` REPLACEs, 36 `sql_write_operations-p1` REPLACEs. Examples: `node-0.log:1508`, `node-0.log:1518-1520`; last cluster `node-0.log:3408-3413`. |
| `operation_ledger_quorum_concentrated` | 366 | 183 | `node-0.log:2185` 17:45:36.423Z, `control_plane_publications-p1` REPLACE | `node-0.log:8500` 17:49:45.804Z, `control_plane_publications-p1` REPLACE | 17:45:30=34, 17:45:40=61, 17:45:50=19, 17:46:00=1, 17:46:10=54, 17:46:20=5, 17:49:30=5, 17:49:40=4 | Mostly rebalancer REPLACEs: 54 `control_plane_publications-p1`, 44 `sql_transactions-p1`, 43 `sql_write_operations-p1`, 40 `sql_transaction_participants-p1`, plus 2 `sql_transaction_participants-p1` ADD skips. Warning examples show the held cause/partition (`node-0.log:2184`, `node-0.log:8142`); last skip is `node-0.log:8500`. |
| `operation_ledger_self_move_waiting_for_idle_ledger` | 4 | 2 | `node-1.log:788` 17:46:20.485Z, p1 REPLACE | `node-3.log:2964` 17:49:07.958Z, p1 REMOVE | 17:46:20=1, 17:49:00=1 | These are the ledger's own self-move/surplus-drain attempts: a `REPLACE r5 -> node-2` (`node-1.log:787-788`) and a `REMOVE r5` surplus drain (`node-3.log:2957-2964`). |

The rate-limited quorum warning records are four, not 183: `node-0.log:2184` at 17:45:36.422Z, `node-1.log:357` at 17:45:41.533Z, `node-0.log:3493` at 17:46:10.333Z, and `node-0.log:8142` at 17:49:31.103Z. The source intentionally rate-limits these warnings (`src/rebalancer/rebalance-coordinator-ledger-interlock-admission.js:368-390`); the reason-code records are the per-move skips.

## Do ledger self-moves thrash?

No repeated self-move executions are observed. Under the source definition, the only executed disruptive p1 self-moves are:

1. `5c629581-9c0e-4adf-bbaf-b4323edda7c7`, `REPLACE replica_operations-p1` to node-1, created at `node-0.log:1522` (17:45:19.614Z) and completed at `node-0.log:2136` (17:45:36.279Z), with later duplicate/repair completions visible on other nodes (`node-2.log:298`, `node-3.log:328`).
2. `ad610cdc-0f7a-43b8-adaa-62f27f4dec36`, `REPLACE replica_operations-p1` to node-4, created at `node-1.log:450` (17:45:51.122Z) and completed at `node-3.log:465` (17:46:07.206Z) / `node-1.log:668` (17:46:12.395Z).

The p1 `ADD` `20b25796-...` is a spread ADD, not a disruptive self-move; it completes (`node-1.log:360`, `node-1.log:434`). Later self-move/surplus-drain work is planned but skipped by the idle-ledger rule (`node-1.log:787-788`, `node-3.log:2960-2964`). The `MOVE_SKIPPED` records are repeated planning attempts and dependent-operation deferrals, not repeated p1 operation executions.

The exact conflicting operation ID for `operation_ledger_self_move_waiting_for_idle_ledger` is not surfaced in the `MOVE_SKIPPED` payload. Nearby evidence shows the first wait occurs immediately after other control-plane operation creation (`sql_write_operations-p1` op `a4bf20d1-...` at `node-1.log:781`, followed by the p1 skip at `node-1.log:787-788`), and the second wait occurs while p1 is still processing operation-row visibility/failures around `50c73b0d-...` (`node-3.log:2962-2964`, `node-2.log:1699`). Treat those as nearby blockers, not definitive conflict IDs.

## Ratings / [2/4] relation

No `[1/4]`/`[2/4]`/`STALLED` parent-runner lines are present under `data/examples/service-data-affinity-demo/`; the artifact directory contains only child node logs and rejoin hints. That is expected from the runner: child node stdout/stderr are piped into `node-N.log` (`examples/service-data-affinity/run-affinity-demo.js:114`, `examples/service-data-affinity/run-affinity-demo.js:135-137`), while step markers are parent `console.log()` calls (`examples/service-data-affinity/run-affinity-demo.js:444-456`).

The ratings create observed in node logs starts after every interlock reason record has ended:

- Ratings table creation starts at `node-0.log:11128` (17:53:17.397Z).
- All five storage target admissions are `allow` at `node-0.log:11131-11135` (17:53:17.403-17:53:17.404Z).
- The ratings partition dispatch proceeds without bootstrap topology at `node-0.log:11136` (17:53:17.407Z).
- A ratings partition `ADD` operation is created at `node-0.log:11137` (17:53:17.407Z). Per source, that is after admission/interlock checks (`src/rebalancer/rebalance-coordinator-operation-creation.js:580-594`).
- The failure is later: a `replica_operations` row update for that ratings op fails at `node-0.log:11596-11597` (17:53:52.163-17:53:52.164Z), followed by `Initial table partition provisioning failed` for `ratings` with `CDCIntegrationService not properly initialized: sqlQueryEngine not provided` at `node-0.log:11608-11609` (17:53:52.168Z).

Thus the ratings operation is not observed being held by `operation_ledger_self_move_in_flight`, `operation_ledger_quorum_concentrated`, or `operation_ledger_self_move_waiting_for_idle_ledger`.

## Verdict for this scope

The interlock is not the binding blocker for settle/[2/4] in this fresh run. The raw 346/366 counts are double-counted `MOVE_SKIPPED` strings, concentrated in early formation and system-partition rebalancing, with the last self-move-in-flight record at 17:46:06.664Z (`node-0.log:3413`), the last waiting-for-idle-ledger record at 17:49:07.958Z (`node-3.log:2964`), and the last quorum-concentrated record at 17:49:45.804Z (`node-0.log:8500`). Ratings does not begin until 17:53:17.397Z (`node-0.log:11128`) and is admitted (`node-0.log:11137`).

There is a real residual: `replica_operations-p1` is observed over target (4/3) and the surplus drain is skipped at 17:49:07 (`node-3.log:2957-2964`). But the skipped drain is not a never-completing self-move execution, and no interlock record is observed in the 17:51-17:53 failure window. In this artifact, the binding failure has moved beyond the ledger self-move/interlock mechanism; the visible ratings failure is operation-row/CDC/control-plane write failure after an admitted ADD (`node-0.log:11596-11609`).

## Open questions / follow-ups

1. The p1 over-target residual remains real: why does the `REMOVE r5` surplus drain at 17:49:07 see the ledger as non-idle, and should `MOVE_SKIPPED` include the conflicting operation ID to avoid inference from nearby logs? (`node-3.log:2957-2964`; source currently logs reason but not conflict in the rebalancer skip payload, `src/rebalancer/unified-rebalancer-follow-up-move.js:622-633`.)
2. Why does the quorum-concentration evaluator still emit `operation_ledger_quorum_concentrated` at 17:49:31-17:49:45 after the p1 spread operations completed? The warning says `totalVoters:2`, `maxVotersOnOneNode:1`, feasible node-2 (`node-0.log:8142`, last skip `node-0.log:8500`); that needs a separate actuals/cache-vs-raft-row audit.
3. The 17:53 ratings failure is outside this scope but is the next live blocker: `CDCIntegrationService not properly initialized: sqlQueryEngine not provided` and/or shutdown-time query routing appears in the failure tail (`node-0.log:11592-11609`).
