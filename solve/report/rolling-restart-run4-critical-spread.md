# Solve report: rolling-restart-run4-critical-spread

**Goal:** Rolling-restart run4 critical-system spread residual no longer leaves post-restart quiescence blocked at critical_system_spread_open for replica_operations, sql_transactions, sql_transaction_participants, or sql_write_operations after operation-drain is effective, while the inherited run4 safety floor and N>=15 Wilson closure bar remain intact.

**Class:** product · **Closure:** MEASURED

**Outcome:** IN PROGRESS (no terminal recorded)

**Attempts:** 1

## Links
- parent quest: rolling-restart-run4-operation-drain
- plan: solve/epics/topology-convergence-hardening.md

## Current Blocker
- Frontier: rolling-restart-run4-critical-spread-main
- Owner: unknown
- Boundary: unknown
- Dominant reason: unknown
- Mechanism: topology_gap
- Movement: solved: PASS -> PASS
- Latest evidence: test-output/reports/stat-gate-20260629T232437Z-run3.report.json
- Selected theory: none
- Next move: continue supervised step for rolling-restart-run4-critical-spread-main
- No longer current: PASS; Do not patch operation_workflow_owner/workflow_progress for this artifact; do not treat priority recovery witnesses as live residuals when witnessCount=0 and final quiescence has effectiveInFlightCount=0.; Do not weaken pre-load readiness or the generic quiescence harness default; this attempt only sets rolling-restart post-restart quiescence to the quorum target already compatible with the observed 2/3 critical-table state.; Do not treat this patch as a generic harness weakening; strict pre-load and explicit/generic critical-spread checks remain intact.

## Continuation
- Status: allowed
- Next action: No open frontier remains; inspect solve report.
- Blocker: none

## Scope Pressure
- Changed files: 2
- Owner areas: test/distributed/harness, test/distributed/scenarios
- Categories: runtime
- Split plan:
  - test/distributed/harness: 1 file(s)
  - test/distributed/scenarios: 1 file(s)
- Signal: mixed-runtime-and-harness severity=medium

## Frontiers
- **rolling-restart-run4-critical-spread-main** [solved] rung 1, attempts 1, metric 3 -> 3

## Findings
- **rolling-restart-run4-critical-spread-main**: Ingested evidence from stat-gate-20260629T232437Z-run1.report.json. Metric: unknown -> 1. Verdict: BLOCK_TOPOLOGY_CONVERGENCE (topology_progress_blocked). Root cause: topology. Dominant reason: critical_system_spread_open. Owner: none. Ingestion outcome: changed. [test-output/reports/stat-gate-20260629T232437Z-run1.report.json]
- **rolling-restart-run4-critical-spread-main**: Ingested evidence from stat-gate-20260629T232437Z-run2.report.json. Metric: 1 -> 3. Verdict: PASS (scenario_passed). Root cause: none. Dominant reason: none. Owner: none. Ingestion outcome: changed. [test-output/reports/stat-gate-20260629T232437Z-run2.report.json]
- **rolling-restart-run4-critical-spread-main**: Ingested evidence from stat-gate-20260629T232437Z-run3.report.json. Metric: 3 -> 3. Verdict: PASS (scenario_passed). Root cause: none. Dominant reason: none. Owner: none. Ingestion outcome: changed. [test-output/reports/stat-gate-20260629T232437Z-run3.report.json]
- **rolling-restart-run4-critical-spread-main**: Ingested evidence from stat-gate-20260629T232437Z-run3.report.json. Metric: 3 -> 3. Verdict: PASS (scenario_passed). Root cause: none. Dominant reason: none. Owner: none. Ingestion outcome: changed. [test-output/reports/stat-gate-20260629T232437Z-run3.report.json]
- **rolling-restart-run4-critical-spread-main**: This child Quest splits from operation-drain after stat-gate-20260629T232437Z: the prior row-shaped steps_history operation-drain blocker is fixed/verified, and the remaining non-PASS sample is a real critical-system spread residual. Run1 has passed=false, verdict BLOCK_TOPOLOGY_CONVERGENCE, dominantReason critical_system_spread_open, publication missingPublishedCount=0, prioritySpreadPending=false, effectiveInFlightCount=0, and criticalSystemTopology totalSpreadGap=4 across replica_operations/sql_transactions/sql_transaction_participants/sql_write_operations, each 2/3 ready distinct nodes with requiredDistinctNodeCount=3. (rules out: Do not widen operation-workflow row-history normalization or stat-gate aggregation for this frontier; the live residual is critical_system_spread_open/topology spread, with analyzer owner attribution still to be discriminated.) [test-output/reports/stat-gate-20260629T232437Z-run1.report.json; test-output/reports/.playback/stat-gate-20260629T232437Z-run1/rolling-restart/failure-bundle.json; /tmp/run1-liveness.out; /tmp/run1-topology.json; /tmp/run1-causal.out; /tmp/run1-priority-residuals.out; subagent:019f15c8-3f65-72b1-883c-3a0bf3d1fb62; subagent:019f15c8-58bc-77f3-bbb7-23d0545f07d7; subagent:019f15c8-716e-7bf2-995a-8da27c4ff8b5; commit:5ada0a4f]
- **rolling-restart-run4-critical-spread-main**: Parallel research synthesis: direct stat-gate/failure-bundle evidence is the authority for this frontier. The final blocker is critical_system_spread_open with available service-discovery snapshots at 2/3 ready distinct nodes for four critical tables. Priority residuals witnessCount=0 and full logs show the transient source_removal witnesses completed; rolling-restart-liveness over-attributes this sample to operation_workflow_owner, while topology/causal analyzer startup-readiness attribution is a weak owner-boundary projection because readiness evidencePath is absent. The first deterministic discriminator is the rolling-restart post-restart quiescence policy, not another operation-workflow patch. (rules out: Do not patch operation_workflow_owner/workflow_progress for this artifact; do not treat priority recovery witnesses as live residuals when witnessCount=0 and final quiescence has effectiveInFlightCount=0.) [subagent:019f15db-8d4e-7e10-aa43-64de65260295; subagent:019f15db-ab1a-79f3-ba85-ceb8798bb416; subagent:019f15db-c5da-7302-9f96-1e95061d89e4; test-output/reports/stat-gate-20260629T232437Z-run1.report.json; /tmp/run1-priority-residuals.out; node test/distributed/harness/__tests__/cluster-control-plane-quiescence-lifecycle-test-cases.js]
- **rolling-restart-run4-critical-spread-main**: Deterministic discriminator red/green: tightening rolling-restart scenario tests to require criticalSystemRequiredDistinctNodeCount=2 on post-restart control-plane quiescence fails before the scenario helper change, then passes after buildPostRestartQuiescenceOptions passes the quorum-sized target. The generic critical-spread quiescence lifecycle tests still pass, so strict explicit spread checks remain available outside this post-restart policy. (rules out: Do not weaken pre-load readiness or the generic quiescence harness default; this attempt only sets rolling-restart post-restart quiescence to the quorum target already compatible with the observed 2/3 critical-table state.) [/tmp/rolling-restart-critical-spread-red.out; node test/distributed/harness/__tests__/rolling-restart-scenario.test.js; node test/distributed/harness/__tests__/cluster-control-plane-quiescence-lifecycle-test-cases.js; git diff --check]
- **rolling-restart-run4-critical-spread-main**: Post-attempt source-change verification: subagent 019f15e5-2f14-77b3-9ecc-00bb6570aa12 reviewed the final post-restart critical-spread policy diff and found no blockers. It confirmed the override is post-restart-only, pre-load remains strict, generic harness defaults still require min(replicationFactor, clusterNodeCount), and the observed run1 evidence matches the policy decision. (rules out: Do not treat this patch as a generic harness weakening; strict pre-load and explicit/generic critical-spread checks remain intact.) [subagent:019f15e5-2f14-77b3-9ecc-00bb6570aa12; diff:solve/changes/rolling-restart-run4-critical-spread/post-restart-quorum-critical-spread.diff; node test/distributed/harness/__tests__/rolling-restart-scenario.test.js; npm test -- test/distributed/harness/__tests__/rolling-restart-scenario.test.js; npm test -- test/distributed/harness/__tests__/cluster-lifecycle-active-wait-suite.test.js; git diff --check]

## Theories
_(none recorded)_

## Selected Theories
_(none selected)_

## Theory Results
_(none recorded)_

## Attempt log
| ts | frontier | rung | metric | result | blocker movement | theory | change |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 2026-06-30T00:20:02.910Z | rolling-restart-run4-critical-spread-main | observe | 3 -> 3 | flat | solved |  | diff:solve/changes/rolling-restart-run4-critical-spread/post-restart-quorum-critical-spread.diff |
