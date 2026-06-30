# Solve report: rolling-restart-run4-join-runtime-activation

**Goal:** Rolling-restart run4 no longer hits NODE_EXIT during joiner startup/querying_state from partition service activation requiring initialized runtime for control-plane replicas such as replica_operations-p1-r5, while the prior run4 safety floor and N>=15 priority closure bar remain intact.

**Class:** product · **Closure:** MEASURED

**Outcome:** IN PROGRESS (no terminal recorded)

**Attempts:** 2

## Links
- parent quest: rolling-restart-run4-critical-spread
- plan: solve/epics/topology-convergence-hardening.md

## Current Blocker
- Frontier: rolling-restart-run4-join-runtime-activation-main
- Owner: unknown
- Boundary: unknown
- Dominant reason: publication_recovery_gate_not_ready
- Mechanism: transition_gap
- Movement: unknown: PASS -> publication_recovery_gate_not_ready
- Latest evidence: test-output/reports/stat-gate-20260630T010857Z-run3.report.json
- Selected theory: durable-rejoin-runtime-proof-after-reconciler
- Next move: continue supervised step for rolling-restart-run4-join-runtime-activation-main
- No longer current: PASS; Do not treat triggerJoinReconciler returning as proof that durable rejoin recreated every local partition runtime; do not mix the run3 publication_recovery_gate_not_ready stall into the initialized-runtime NODE_EXIT fix.; No verifier blocker for duplicate recreate, exact replica id, election ordering, lifecycle/desired-state leak, or activation guard weakening; existing scoped metrics complexity warnings are unrelated baseline issues.

## Continuation
- Status: blocked-regression
- Next action: restore previously-green invariant(s) priority_recovery_bootstrap_ready_allows_join_during_priority_recovery, priority_recovery_readyz_closed_during_priority_recovery, priority_recovery_cluster_active_requires_publication_convergence_and_priority_spread for rolling-restart-run4-join-runtime-activation-main, or record a finding explaining why they were abandoned
- Blocker: regression restore required: priority_recovery_bootstrap_ready_allows_join_during_priority_recovery, priority_recovery_readyz_closed_during_priority_recovery, priority_recovery_cluster_active_requires_publication_convergence_and_priority_spread

## Scope Pressure
- Changed files: 4
- Owner areas: src/bootstrap, test/bootstrap
- Categories: runtime
- Split plan:
  - src/bootstrap: 3 file(s)
  - test/bootstrap: 1 file(s)
- Signals: none

## Frontiers
- **rolling-restart-run4-join-runtime-activation-main** [open] rung 2, attempts 2, metric 3 -> 1 — fresh measured evidence no longer satisfies frontier

## Findings
- **rolling-restart-run4-join-runtime-activation-main**: Ingested evidence from stat-gate-20260630T002604Z-run1.report.json. Metric: unknown -> 3. Verdict: PASS (scenario_passed). Root cause: none. Dominant reason: none. Owner: none. Ingestion outcome: changed. [test-output/reports/stat-gate-20260630T002604Z-run1.report.json]
- **rolling-restart-run4-join-runtime-activation-main**: Ingested evidence from stat-gate-20260630T002604Z-run2.report.json. Metric: 3 -> null. Verdict: BLOCK_EVIDENCE_INCOMPLETE (execution_incomplete_or_metrics_missing). Root cause: load. Dominant reason: admin_not_ready=Admin API query failed for node 8be8d30f-4499-5eed-865c-71b4d529a67a on lane probe: connect EHOSTUNREACH 172.18.0.6:8081. Owner: startup_readiness_owner. Ingestion outcome: changed. [test-output/reports/stat-gate-20260630T002604Z-run2.report.json]
- **rolling-restart-run4-join-runtime-activation-main**: Ingested evidence from stat-gate-20260630T002604Z-run3.report.json. Metric: 3 -> 3. Verdict: PASS (scenario_passed). Root cause: none. Dominant reason: none. Owner: none. Ingestion outcome: changed. [test-output/reports/stat-gate-20260630T002604Z-run3.report.json]
- **rolling-restart-run4-join-runtime-activation-main**: Ingested evidence from stat-gate-20260630T002604Z-run3.report.json. Metric: 3 -> 3. Verdict: PASS (scenario_passed). Root cause: none. Dominant reason: none. Owner: none. Ingestion outcome: changed. [test-output/reports/stat-gate-20260630T002604Z-run3.report.json]
- **rolling-restart-run4-join-runtime-activation-main**: This child Quest splits from critical-system spread after stat-gate-20260630T002604Z: the post-restart critical-spread residual is gone (TOPOLOGY_BLOCKED=0, missingPublishedCount=0, staleSourceRuns=0), and the remaining non-PASS sample is run2 NODE_EXIT. Joiner 8be8d30f-4499-5eed-865c-71b4d529a67a exited code 1 during querying_state after fatal 'Partition service activation requires initialized runtime for replica_operations-p1-r5'; downstream active wait then stalled at active=4/5 with publication=PUBLISHED and prioritySpread ready gap 0. (rules out: Do not continue adjusting critical-system spread or operation-drain for this sample; target joiner startup/querying_state partition-service activation requiring initialized runtime.) [test-output/reports/stat-gate-20260630T002604Z.json; test-output/reports/stat-gate-20260630T002604Z-run2.report.json; test-output/reports/.playback/stat-gate-20260630T002604Z-run2/rolling-restart/failure-bundle.json; commit:593f7b89]
- **rolling-restart-run4-join-runtime-activation-main**: Parallel subagent research converged on a second-incarnation durable-rejoin ordering bug: after clean rolling-restart shutdown leaves a local partition service with initialized=false, the join actual-state planner treated the stale map entry as an existing created replica and could activate it during querying_state without recreating its PartitionService runtime. (rules out: Do not weaken activatePartitionServiceRows fail-closed initialized-runtime guard, and do not chase publication or priority-spread convergence for this NODE_EXIT sample; the fault is stale local partition runtime reuse during durable-rejoin restore planning.) [subagents:019f1601-ed70-7ac3-9509-f9d8ae4121bd,019f1601-edbb-7cc2-b11d-a6597a71b00f,019f1601-ede9-78b0-8007-4616a6f7bdda; test-output/reports/stat-gate-20260630T002604Z-run2.report.json; test-output/reports/.playback/stat-gate-20260630T002604Z-run2/rolling-restart/8be8d30f-4499-5eed-865c-71b4d529a67a.log; /tmp/rolling-restart-join-runtime-activation-red.out]
- **rolling-restart-run4-join-runtime-activation-main**: Subagent source-change verification approved the patch after the recorded attempt: the guard in activatePartitionServiceRows remains fail-closed, stale initialized=false partition services are omitted from join actual-state planning, stale runtimes are stopped and recreated before activation, and the deterministic restore/reconciler path test plus focused activation coverage passed. (rules out: No source-change blocker found by verifier; legacy stubs with initialized undefined remain reusable, initialized true services still reuse existing runtime, and the activation guard was not weakened.) [subagent:019f160b-4528-7e23-b756-2233693ce4f9; git diff --check; node test/bootstrap/node-joining-service.test.js; node test/bootstrap/partition-service-activation.test.js; npm test -- test/bootstrap/node-joining-service.test.js]
- **rolling-restart-run4-join-runtime-activation-main**: Ingested evidence from stat-gate-20260630T002604Z-run3.report.json. Metric: 3 -> 3. Verdict: PASS (scenario_passed). Root cause: none. Dominant reason: none. Owner: none. Ingestion outcome: changed. [test-output/reports/stat-gate-20260630T002604Z-run3.report.json]
- **rolling-restart-run4-join-runtime-activation-main**: Ingested evidence from stat-gate-20260630T010857Z-run1.report.json. Metric: 3 -> 1. Verdict: FAIL_CORE_INVARIANT (core_invariant_or_safety_violation). Root cause: startup. Dominant reason: admin_probe_error=Node admin readiness probe timed out for 8be8d30f-4499-5eed-865c-71b4d529a67a. Owner: startup_readiness_owner. Ingestion outcome: changed. [test-output/reports/stat-gate-20260630T010857Z-run1.report.json]
- **rolling-restart-run4-join-runtime-activation-main**: Ingested evidence from stat-gate-20260630T010857Z-run2.report.json. Metric: 1 -> 3. Verdict: PASS (scenario_passed). Root cause: none. Dominant reason: none. Owner: none. Ingestion outcome: changed. [test-output/reports/stat-gate-20260630T010857Z-run2.report.json]
- **rolling-restart-run4-join-runtime-activation-main**: Ingested evidence from stat-gate-20260630T010857Z-run3.report.json. Metric: 3 -> 1. Verdict: FAIL_CORE_INVARIANT (core_invariant_or_safety_violation). Root cause: unknown. Dominant reason: publication_recovery_gate_not_ready. Owner: none. Ingestion outcome: changed. [test-output/reports/stat-gate-20260630T010857Z-run3.report.json]
- **rolling-restart-run4-join-runtime-activation-main**: Fresh gate stat-gate-20260630T010857Z on checkpoint b98d9ee1 had staleSourceRuns=0 and split the previous source patch: run2 converged, run1 still hit the same querying_state NODE_EXIT from 'Partition service activation requires initialized runtime' for sql_transaction_participants-p1-r5, and run3 stalled on publication_recovery_gate_not_ready without NODE_EXIT. The run1 fatal shows durable rejoin must prove exact restored partition runtimes after reconciliation, not only hide initialized=false entries from planner actual state. (rules out: Do not treat triggerJoinReconciler returning as proof that durable rejoin recreated every local partition runtime; do not mix the run3 publication_recovery_gate_not_ready stall into the initialized-runtime NODE_EXIT fix.) [test-output/reports/stat-gate-20260630T010857Z.md; test-output/reports/stat-gate-20260630T010857Z-run1.report.json; test-output/reports/.playback/stat-gate-20260630T010857Z-run1/rolling-restart/8be8d30f-4499-5eed-865c-71b4d529a67a.log; subagent:019f161a-c201-76a1-bcbc-789c8ea646bd; subagent:019f161b-5318-7011-bfe9-5f13ad2de096]
- **rolling-restart-run4-join-runtime-activation-main**: Subagent source-change verification approved the follow-up patch after the recorded attempt: durable rejoin now verifies each restorePlan replica has an initialized exact local PartitionService after reconciliation and before activation/election, using the existing createJoinPartitionReplica stale-runtime recreate hook; guard semantics remain fail-closed and initialized undefined remains consistent with the existing activation contract. (rules out: No verifier blocker for duplicate recreate, exact replica id, election ordering, lifecycle/desired-state leak, or activation guard weakening; existing scoped metrics complexity warnings are unrelated baseline issues.) [subagent:019f1622-ccab-7560-a2e3-515a1737a6e8; git diff --check; npm test -- test/bootstrap/node-joining-service.test.js; npm run audit:runtime-grammar:file -- src/bootstrap/node-joining-publication-activation.js; npm run test:metrics:scoped -- src/bootstrap/node-joining-publication-activation.js test/bootstrap/node-joining-service.test.js; npm run model:contracts; node test/bootstrap/partition-service-activation.test.js; node test/bootstrap/node-joining-service-join-lifecycle-resume.test.js]
- **rolling-restart-run4-join-runtime-activation-main**: Ingested evidence from stat-gate-20260630T010857Z-run3.report.json. Metric: 1 -> 1. Verdict: FAIL_CORE_INVARIANT (core_invariant_or_safety_violation). Root cause: unknown. Dominant reason: publication_recovery_gate_not_ready. Owner: none. Ingestion outcome: changed. [test-output/reports/stat-gate-20260630T010857Z-run3.report.json]

## Theories
- **durable-rejoin-runtime-proof-after-reconciler** [supported] frontier, frontier rolling-restart-run4-join-runtime-activation-main, layer ownership, mechanism Durable rejoin restore treated a completed reconciler cycle as proof that exact local partition runtimes were initialized, but ServiceReconciler records per-action failures without throwing, so explicit restore activation can still see stale initialized=false PartitionService entries., owner NodeJoiningPublicationActivation durable-rejoin restore owner, boundary restoreDurableRejoinLocalPartitionServices -> activateJoinPartitionServiceRows, modelGate npm run model:contracts

## Selected Theories
- **rolling-restart-run4-join-runtime-activation-main**: durable-rejoin-runtime-proof-after-reconciler

## Theory Results
- **durable-rejoin-runtime-proof-after-reconciler**: supported (scenario=failed, theory=supported, movement=unknown) [test-output/reports/stat-gate-20260630T010857Z-run3.report.json]

## Attempt log
| ts | frontier | rung | metric | result | blocker movement | theory | change |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 2026-06-30T01:08:05.082Z | rolling-restart-run4-join-runtime-activation-main | observe | 3 -> 3 | flat | solved |  | diff:solve/changes/rolling-restart-run4-join-runtime-activation/stale-partition-runtime-recreate.diff |
| 2026-06-30T01:34:00.439Z | rolling-restart-run4-join-runtime-activation-main | local-fix | 1 -> 1 | flat | unknown | durable-rejoin-runtime-proof-after-reconciler | diff:solve/changes/rolling-restart-run4-join-runtime-activation/durable-rejoin-restore-runtime-ensure.diff |
