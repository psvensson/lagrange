# Solve report: formation-runtime-service-create-lane-budget-starvation

**Goal:** A deployed runtime-service's replica-count-increase ADD moves actually create active replicas during post-formation on the 5-node MovieLens demo, so svc-movielens-topn reaches its target replica_count and the demo convergence watch sees replicas>0 (currently replicas=0 the entire 300s watch → STALL). ROOT (run-30 forensics, after the logs.message poison fix 56ebbedb let the demo first reach [4/4]): the runtime-service rebalancer HOLDS leadership the whole watch and executes type=add reason=increase_replica_count moves 6x on cadence (19:23:35/19:25:12/19:27:20, 2 per cycle) but NO replica-create ever lands (zero downstream replica-create logs for the service; 6x interleaved 'Rebalancing move skipped reason=budget_exceeded') EVEN THOUGH 32 control-plane moves COMPLETE during the same watch — the shared move budget is NOT permanently saturated, it has free windows the service create cannot exploit. The runtime-service ADD competes in the shared move budget against concurrent control-plane formation churn (260x operation_ledger_self_move_in_flight, 56x quorum_concentrated) and never wins a create slot / is admission-rejected before dispatching its replica_operations create. SCOPE: make the executed service ADD produce an active replica within available budget windows (fair-share / priority / admission fix at the create-dispatch lane). NOT the projection gap (runtime-replica-state-projection — replicas are never CREATED here, not created-and-invisible); NOT host oversubscription (20 cores, load 4.28); NOT a synchronous event-loop blocker (gaps rare 0.68% wall + descheduled ELU 0.21); NOT the over-target accounting transient (formation-ledger-over-target-accounting-drain-phase-replace-blind-spot). doneWhen = scenario-harness reproduces replicas>0 (service create lands under concurrent control-plane churn) 3x consecutive.

**Class:** product · **Closure:** MEASURED

**Outcome:** SOLVED (MEASURED) — evidence: test-output/reports/formation-runtime-service-create-lane-budget-starvation-2026-07-15T14-57-27-616Z.report.json

**Attempts:** 3

## Scope Pressure
- Changed files: 9
- Change bytes: 29223
- Owner areas: scripts/run-formation-runtime-service-create-lane-budget-starvation-scenarios.js, src/rebalancer, test/rebalancer
- Categories: other, runtime
- Action: land or separate 3 owner areas: scripts/run-formation-runtime-service-create-lane-budget-starvation-scenarios.js, src/rebalancer, test/rebalancer
- Split plan:
  - src/rebalancer: 6 file(s)
  - test/rebalancer: 2 file(s)
  - scripts/run-formation-runtime-service-create-lane-budget-starvation-scenarios.js: 1 file(s)
- Signal: broad-source-scope severity=medium

## Frontiers
- **formation-runtime-service-create-lane-budget-starvation-main** [solved] rung 3, attempts 3, metric 0 -> 0 — exact terminal source attempt was rejected

## Findings
- **formation-runtime-service-create-lane-budget-starvation-main**: Independent exact and aggregate verification rejected attempt 2: its unconditional default create-reservation owner read regressed timeout/cache visibility subtests 21-25 (7 assertions), while exact base e7c1de49 passed 47/47. [subagent:join_runtime_legacy_migration]
- **formation-runtime-service-create-lane-budget-starvation-main**: Ingested evidence from formation-runtime-service-create-lane-budget-starvation-2026-07-15T14-50-45-941Z.report.json. Metric: 0 -> 0. Verdict: PASS. Root cause: none. Dominant reason: none. Owner: none. Ingestion outcome: changed. [test-output/reports/formation-runtime-service-create-lane-budget-starvation-2026-07-15T14-50-45-941Z.report.json]
- **formation-runtime-service-create-lane-budget-starvation-main**: Ingested evidence from formation-runtime-service-create-lane-budget-starvation-2026-07-15T14-50-45-941Z.report.json. Metric: 0 -> 0. Verdict: PASS. Root cause: none. Dominant reason: none. Owner: none. Ingestion outcome: changed. [test-output/reports/formation-runtime-service-create-lane-budget-starvation-2026-07-15T14-50-45-941Z.report.json]
- **formation-runtime-service-create-lane-budget-starvation-main**: Independent exact and aggregate verification rejected attempt 3: the decision-boundary audit reports three independent semantic return branches in buildReplicaOperationVisibilityReadOptions after adding the bounded owner-read mode, despite all focused behavioral suites passing. [subagent:runtime_create_attempt3_verify]
- **formation-runtime-service-create-lane-budget-starvation-main**: Ingested evidence from formation-runtime-service-create-lane-budget-starvation-2026-07-15T14-57-27-616Z.report.json. Metric: 0 -> 0. Verdict: PASS. Root cause: none. Dominant reason: none. Owner: none. Ingestion outcome: changed. [test-output/reports/formation-runtime-service-create-lane-budget-starvation-2026-07-15T14-57-27-616Z.report.json]
- **formation-runtime-service-create-lane-budget-starvation-main**: Ingested evidence from formation-runtime-service-create-lane-budget-starvation-2026-07-15T14-57-27-616Z.report.json. Metric: 0 -> 0. Verdict: PASS. Root cause: none. Dominant reason: none. Owner: none. Ingestion outcome: changed. [test-output/reports/formation-runtime-service-create-lane-budget-starvation-2026-07-15T14-57-27-616Z.report.json]
- **formation-runtime-service-create-lane-budget-starvation-main**: Independent verification approved attempt 4 exact and aggregate: replacement switch closes the decision-boundary rejection; scenario, cache/timeout, repository visibility, lint, size, and exact identity checks pass. [subagent:runtime_create_attempt3_verify]
- **formation-runtime-service-create-lane-budget-starvation-main**: Ingested evidence from formation-runtime-service-create-lane-budget-starvation-2026-07-15T15-01-17-503Z.report.json. Metric: 0 -> 0. Verdict: PASS. Root cause: none. Dominant reason: none. Owner: none. Ingestion outcome: changed. [test-output/reports/formation-runtime-service-create-lane-budget-starvation-2026-07-15T15-01-17-503Z.report.json]
- **formation-runtime-service-create-lane-budget-starvation-main**: Ingested evidence from formation-runtime-service-create-lane-budget-starvation-2026-07-15T15-01-17-503Z.report.json. Metric: 0 -> 0. Verdict: PASS. Root cause: none. Dominant reason: none. Owner: none. Ingestion outcome: changed. [test-output/reports/formation-runtime-service-create-lane-budget-starvation-2026-07-15T15-01-17-503Z.report.json]

## Theories
- **theory-20260715-replica-operation-visibility-read-mode** [supported] frontier, frontier formation-runtime-service-create-lane-budget-starvation-main, layer ownership, mechanism replica_operation_visibility_read_mode, owner replica_operation_repository, boundary visibility_read_option_resolution, modelGate npm run model:contracts

## Selected Theories
- **formation-runtime-service-create-lane-budget-starvation-main**: theory-20260715-replica-operation-visibility-read-mode

## Theory Results
- **theory-20260715-replica-operation-visibility-read-mode**: falsified (scenario=done, theory=falsified, movement=solved) [test-output/reports/formation-runtime-service-create-lane-budget-starvation-2026-07-15T14-57-27-616Z.report.json]
- **theory-20260715-replica-operation-visibility-read-mode**: supported (scenario=done, theory=supported, movement=solved) [test-output/reports/formation-runtime-service-create-lane-budget-starvation-2026-07-15T15-01-17-503Z.report.json]

## Attempt log
| ts | frontier | rung | metric | result | blocker movement | theory | change |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 2026-07-15T14:37:59.638Z | formation-runtime-service-create-lane-budget-starvation-main | observe | 0 -> 0 | flat | no_evidence |  | diff:solve/changes/formation-runtime-service-create-lane-budget-starvation/attempt-2.diff |
| 2026-07-15T14:51:03.867Z | formation-runtime-service-create-lane-budget-starvation-main | local-fix | 0 -> 0 | flat | solved |  | diff:solve/changes/formation-runtime-service-create-lane-budget-starvation/attempt-3.diff |
| 2026-07-15T14:58:09.059Z | formation-runtime-service-create-lane-budget-starvation-main | widen-scope | 0 -> 0 | flat | solved | theory-20260715-replica-operation-visibility-read-mode | diff:solve/changes/formation-runtime-service-create-lane-budget-starvation/attempt-4.diff |
