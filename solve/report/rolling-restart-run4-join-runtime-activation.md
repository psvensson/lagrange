# Solve report: rolling-restart-run4-join-runtime-activation

**Goal:** Rolling-restart run4 no longer hits NODE_EXIT during joiner startup/querying_state from partition service activation requiring initialized runtime for control-plane replicas such as replica_operations-p1-r5, while the prior run4 safety floor and N>=15 priority closure bar remain intact.

**Class:** product · **Closure:** MEASURED

**Outcome:** IN PROGRESS (no terminal recorded)

**Attempts:** 1

## Links
- parent quest: rolling-restart-run4-critical-spread
- plan: solve/epics/topology-convergence-hardening.md

## Current Blocker
- Frontier: rolling-restart-run4-join-runtime-activation-main
- Owner: unknown
- Boundary: unknown
- Dominant reason: unknown
- Mechanism: observation_gap
- Movement: solved: PASS -> PASS
- Latest evidence: test-output/reports/stat-gate-20260630T002604Z-run3.report.json
- Selected theory: none
- Next move: continue supervised step for rolling-restart-run4-join-runtime-activation-main
- No longer current: PASS; Do not weaken activatePartitionServiceRows fail-closed initialized-runtime guard, and do not chase publication or priority-spread convergence for this NODE_EXIT sample; the fault is stale local partition runtime reuse during durable-rejoin restore planning.; No source-change blocker found by verifier; legacy stubs with initialized undefined remain reusable, initialized true services still reuse existing runtime, and the activation guard was not weakened.

## Continuation
- Status: allowed
- Next action: No open frontier remains; inspect solve report.
- Blocker: none

## Scope Pressure
- Changed files: 3
- Owner areas: src/bootstrap, test/bootstrap
- Categories: runtime
- Split plan:
  - src/bootstrap: 2 file(s)
  - test/bootstrap: 1 file(s)
- Signals: none

## Frontiers
- **rolling-restart-run4-join-runtime-activation-main** [solved] rung 1, attempts 1, metric 3 -> 3

## Findings
- **rolling-restart-run4-join-runtime-activation-main**: Ingested evidence from stat-gate-20260630T002604Z-run1.report.json. Metric: unknown -> 3. Verdict: PASS (scenario_passed). Root cause: none. Dominant reason: none. Owner: none. Ingestion outcome: changed. [test-output/reports/stat-gate-20260630T002604Z-run1.report.json]
- **rolling-restart-run4-join-runtime-activation-main**: Ingested evidence from stat-gate-20260630T002604Z-run2.report.json. Metric: 3 -> null. Verdict: BLOCK_EVIDENCE_INCOMPLETE (execution_incomplete_or_metrics_missing). Root cause: load. Dominant reason: admin_not_ready=Admin API query failed for node 8be8d30f-4499-5eed-865c-71b4d529a67a on lane probe: connect EHOSTUNREACH 172.18.0.6:8081. Owner: startup_readiness_owner. Ingestion outcome: changed. [test-output/reports/stat-gate-20260630T002604Z-run2.report.json]
- **rolling-restart-run4-join-runtime-activation-main**: Ingested evidence from stat-gate-20260630T002604Z-run3.report.json. Metric: 3 -> 3. Verdict: PASS (scenario_passed). Root cause: none. Dominant reason: none. Owner: none. Ingestion outcome: changed. [test-output/reports/stat-gate-20260630T002604Z-run3.report.json]
- **rolling-restart-run4-join-runtime-activation-main**: Ingested evidence from stat-gate-20260630T002604Z-run3.report.json. Metric: 3 -> 3. Verdict: PASS (scenario_passed). Root cause: none. Dominant reason: none. Owner: none. Ingestion outcome: changed. [test-output/reports/stat-gate-20260630T002604Z-run3.report.json]
- **rolling-restart-run4-join-runtime-activation-main**: This child Quest splits from critical-system spread after stat-gate-20260630T002604Z: the post-restart critical-spread residual is gone (TOPOLOGY_BLOCKED=0, missingPublishedCount=0, staleSourceRuns=0), and the remaining non-PASS sample is run2 NODE_EXIT. Joiner 8be8d30f-4499-5eed-865c-71b4d529a67a exited code 1 during querying_state after fatal 'Partition service activation requires initialized runtime for replica_operations-p1-r5'; downstream active wait then stalled at active=4/5 with publication=PUBLISHED and prioritySpread ready gap 0. (rules out: Do not continue adjusting critical-system spread or operation-drain for this sample; target joiner startup/querying_state partition-service activation requiring initialized runtime.) [test-output/reports/stat-gate-20260630T002604Z.json; test-output/reports/stat-gate-20260630T002604Z-run2.report.json; test-output/reports/.playback/stat-gate-20260630T002604Z-run2/rolling-restart/failure-bundle.json; commit:593f7b89]
- **rolling-restart-run4-join-runtime-activation-main**: Parallel subagent research converged on a second-incarnation durable-rejoin ordering bug: after clean rolling-restart shutdown leaves a local partition service with initialized=false, the join actual-state planner treated the stale map entry as an existing created replica and could activate it during querying_state without recreating its PartitionService runtime. (rules out: Do not weaken activatePartitionServiceRows fail-closed initialized-runtime guard, and do not chase publication or priority-spread convergence for this NODE_EXIT sample; the fault is stale local partition runtime reuse during durable-rejoin restore planning.) [subagents:019f1601-ed70-7ac3-9509-f9d8ae4121bd,019f1601-edbb-7cc2-b11d-a6597a71b00f,019f1601-ede9-78b0-8007-4616a6f7bdda; test-output/reports/stat-gate-20260630T002604Z-run2.report.json; test-output/reports/.playback/stat-gate-20260630T002604Z-run2/rolling-restart/8be8d30f-4499-5eed-865c-71b4d529a67a.log; /tmp/rolling-restart-join-runtime-activation-red.out]
- **rolling-restart-run4-join-runtime-activation-main**: Subagent source-change verification approved the patch after the recorded attempt: the guard in activatePartitionServiceRows remains fail-closed, stale initialized=false partition services are omitted from join actual-state planning, stale runtimes are stopped and recreated before activation, and the deterministic restore/reconciler path test plus focused activation coverage passed. (rules out: No source-change blocker found by verifier; legacy stubs with initialized undefined remain reusable, initialized true services still reuse existing runtime, and the activation guard was not weakened.) [subagent:019f160b-4528-7e23-b756-2233693ce4f9; git diff --check; node test/bootstrap/node-joining-service.test.js; node test/bootstrap/partition-service-activation.test.js; npm test -- test/bootstrap/node-joining-service.test.js]
- **rolling-restart-run4-join-runtime-activation-main**: Ingested evidence from stat-gate-20260630T002604Z-run3.report.json. Metric: 3 -> 3. Verdict: PASS (scenario_passed). Root cause: none. Dominant reason: none. Owner: none. Ingestion outcome: changed. [test-output/reports/stat-gate-20260630T002604Z-run3.report.json]

## Theories
_(none recorded)_

## Selected Theories
_(none selected)_

## Theory Results
_(none recorded)_

## Attempt log
| ts | frontier | rung | metric | result | blocker movement | theory | change |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 2026-06-30T01:08:05.082Z | rolling-restart-run4-join-runtime-activation-main | observe | 3 -> 3 | flat | solved |  | diff:solve/changes/rolling-restart-run4-join-runtime-activation/stale-partition-runtime-recreate.diff |
