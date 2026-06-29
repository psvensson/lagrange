# Solve report: rolling-restart-run4-operation-drain

**Goal:** Rolling-restart run4 operation drain residual no longer leaves terminal replica_operations_in_flight/effective-in-flight rows after publication and active-gate coverage are otherwise converged, while the inherited run4 safety floor and N>=15 Wilson closure bar remain intact.

**Class:** product · **Closure:** MEASURED

**Outcome:** IN PROGRESS (no terminal recorded)

**Attempts:** 1

## Links
- roadmap row: RM-0.1-fs-rolling-restart
- spec: membership-lifecycle-placement-hard-cutover
- parent quest: rolling-restart-run4-observer-staleness
- plan: solve/epics/topology-convergence-hardening.md

## Current Blocker
- Frontier: rolling-restart-run4-operation-drain-main
- Owner: unknown
- Boundary: unknown
- Dominant reason: unknown
- Mechanism: transition_gap
- Movement: solved: PASS -> PASS
- Latest evidence: test-output/reports/stat-gate-20260629T232437Z-run2.report.json
- Selected theory: theory-20260629-operation-workflow-remote-settle-effective-inflight
- Next move: continue supervised step for rolling-restart-run4-operation-drain-main
- No longer current: PASS; Do not keep widening row-shaped steps_history normalization for this observed run1 residual; completeOperation/failOperation row-shaped handling is a latent separate directed-repro candidate, while the live residual is critical_system_spread_open / topology spread.; Do not treat the PASS reports' compact satisfiedInvariants list as a regression of publication_converged or priority_spread_settled; split the remaining critical_system_spread_open residual instead.

## Continuation
- Status: allowed
- Next action: continue supervised step for rolling-restart-run4-operation-drain-main
- Blocker: none

## Scope Pressure
- Changed files: 2
- Owner areas: src/rebalancer, test/rebalancer
- Categories: runtime
- Split plan:
  - src/rebalancer: 1 file(s)
  - test/rebalancer: 1 file(s)
- Signals: none

## Frontiers
- **rolling-restart-run4-operation-drain-main** [open] rung 1, attempts 1, metric 3 -> 3 — fresh measured evidence no longer satisfies frontier

## Findings
- **rolling-restart-run4-operation-drain-main**: Ingested evidence from stat-gate-20260629T222417Z-run1.report.json. Metric: unknown -> 1. Verdict: BLOCK_TOPOLOGY_CONVERGENCE (topology_progress_blocked). Root cause: topology. Dominant reason: replica_operations_in_flight. Owner: none. Ingestion outcome: changed. [test-output/reports/stat-gate-20260629T222417Z-run1.report.json]
- **rolling-restart-run4-operation-drain-main**: This child Quest splits from observer-staleness after stat-gate-20260629T222417Z: the observer family no longer dominates, while run1 fails doneWhen on replica_operations_in_flight. The priority summary's target_creation witness is stale/diagnostic because full logs show operation 434ac3bb-c216-42f1-b7f0-ccfa948bac66 later completed; the terminal failure bundle has service_timers-p1 operation a3d54c47-50db-44b9-aa7f-869b8f6b4b28 as ACTIVE REPLACE effectiveInFlight=true and full logs also show repeated remote_settle_allowed drain settlements plus coordinator_created_remote_handoff TypeError for sql_write_operations-p1 operation 6a6e16e7-b894-4359-8f4f-bed8582cac12. (rules out: Do not treat dispatch_pending persisted_not_dispatched or parent run7 ACTIVE/source_removal as the current binding blocker; do not broaden the observer-staleness selector for this product workflow failure.) [test-output/reports/stat-gate-20260629T222417Z-run1.report.json; test-output/reports/.playback/stat-gate-20260629T222417Z-run1/rolling-restart/failure-bundle.json; subagent:019f1599-ecfd-7e33-86da-cfdc9b874f93; subagent:019f159a-0199-7a52-8fe9-85e484c909e4; subagent:019f159a-1b17-7c12-b5ed-56d63c3d91fe]
- **rolling-restart-run4-operation-drain-main**: Ingested evidence from stat-gate-20260629T222417Z-run2.report.json. Metric: 1 -> 3. Verdict: PASS (scenario_passed). Root cause: none. Dominant reason: none. Owner: none. Ingestion outcome: changed. [test-output/reports/stat-gate-20260629T222417Z-run2.report.json]
- **rolling-restart-run4-operation-drain-main**: Ingested evidence from stat-gate-20260629T222417Z-run3.report.json. Metric: 3 -> 3. Verdict: PASS (scenario_passed). Root cause: none. Dominant reason: none. Owner: none. Ingestion outcome: changed. [test-output/reports/stat-gate-20260629T222417Z-run3.report.json]
- **rolling-restart-run4-operation-drain-main**: Ingested evidence from stat-gate-20260629T222417Z-run3.report.json. Metric: 3 -> 3. Verdict: PASS (scenario_passed). Root cause: none. Dominant reason: none. Owner: none. Ingestion outcome: changed. [test-output/reports/stat-gate-20260629T222417Z-run3.report.json]
- **rolling-restart-run4-operation-drain-main**: Deterministic discriminator for the run1 operation-workflow drain theory is red/green: the new row-shaped steps_history updateStep regression fails on the previous source with TypeError Cannot read properties of undefined (reading push), then passes after normalizing raw steps_history before projection and assigning the committed projected history after commit. The tightened test also proves the persisted update payload carries the normalized two-entry stepsHistory before live-object mutation. (rules out: Do not broaden this patch to terminal completeOperation/failOperation row-shaped handling without separate evidence; the observed failure stack and retained log theory target updateStep/remote handoff progress.) [solve/changes/rolling-restart-run4-operation-drain/operation-workflow-row-history-normalization.diff; /tmp/rebalance-coordinator-atomic-transitions-red.out; node test/rebalancer/rebalance-coordinator-atomic-transitions.test.js; node test/rebalancer/operation-workflow-progress-event-driven-reentry.test.js; node test/rebalancer/rebalance-coordinator-outcome-routing.test.js; npm run model:contracts; git diff --check; subagent:019f15a9-5685-7240-acfe-d85387e56794]
- **rolling-restart-run4-operation-drain-main**: Post-attempt source verification: subagent 019f15a9-5685-7240-acfe-d85387e56794 reviewed the final diff after the persisted-payload assertion was added and found no blocking issues. The row-shaped steps_history regression now proves both durable payload normalization and committed live-object mutation; sibling terminal complete/fail row-shaped paths remain a separate non-blocking theory if future evidence points there. (rules out: Do not treat the metric-flat PASS-stamp attempt as refuting the deterministic red/green proof; no fresh statistical gate was run for this child Quest after the source patch.) [subagent:019f15a9-5685-7240-acfe-d85387e56794; solve/changes/rolling-restart-run4-operation-drain/operation-workflow-row-history-normalization.diff; node test/rebalancer/rebalance-coordinator-atomic-transitions.test.js; git diff --check]
- **rolling-restart-run4-operation-drain-main**: Ingested evidence from stat-gate-20260629T232437Z-run1.report.json. Metric: 3 -> 1. Verdict: BLOCK_TOPOLOGY_CONVERGENCE (topology_progress_blocked). Root cause: topology. Dominant reason: critical_system_spread_open. Owner: none. Ingestion outcome: changed. [test-output/reports/stat-gate-20260629T232437Z-run1.report.json]
- **rolling-restart-run4-operation-drain-main**: Ingested evidence from stat-gate-20260629T232437Z-run3.report.json. Metric: 1 -> 3. Verdict: PASS (scenario_passed). Root cause: none. Dominant reason: none. Owner: none. Ingestion outcome: changed. [test-output/reports/stat-gate-20260629T232437Z-run3.report.json]
- **rolling-restart-run4-operation-drain-main**: Ingested evidence from stat-gate-20260629T232437Z-run2.report.json. Metric: 3 -> 3. Verdict: PASS (scenario_passed). Root cause: none. Dominant reason: none. Owner: none. Ingestion outcome: changed. [test-output/reports/stat-gate-20260629T232437Z-run2.report.json]
- **rolling-restart-run4-operation-drain-main**: Ingested evidence from stat-gate-20260629T232437Z-run3.report.json. Metric: 3 -> 3. Verdict: PASS (scenario_passed). Root cause: none. Dominant reason: none. Owner: none. Ingestion outcome: changed. [test-output/reports/stat-gate-20260629T232437Z-run3.report.json]
- **rolling-restart-run4-operation-drain-main**: Fresh post-patch gate stat-gate-20260629T232437Z is safety-clean and removes the previous effective operation-drain blocker: 3/3 runs are CONVERGED with staleSource/CORRUPT/ORACLE_BLIND/NODE_EXIT=0 and missing=0, while doneWhen remains false for the sealed N>=15 bar. Run1 is a residual critical-system spread/topology failure, not another row-history operation-workflow failure: failure-bundle quiescence shows effectiveInFlightCount=0, staleInFlightCount=1 discounted, and criticalSystemTopology totalSpreadGap=4 across replica_operations/sql_transactions/sql_transaction_participants/sql_write_operations (each 2/3 ready distinct nodes); priority residual analyzer has witnessCount=0, and subagent 019f15c8-716e-7bf2-995a-8da27c4ff8b5 refuted the operation-workflow residual theory after full-log checks showed the stale source_removal witness operations completed. (rules out: Do not keep widening row-shaped steps_history normalization for this observed run1 residual; completeOperation/failOperation row-shaped handling is a latent separate directed-repro candidate, while the live residual is critical_system_spread_open / topology spread.) [test-output/reports/stat-gate-20260629T232437Z-run1.report.json; test-output/reports/stat-gate-20260629T232437Z-run2.report.json; test-output/reports/stat-gate-20260629T232437Z-run3.report.json; test-output/reports/.playback/stat-gate-20260629T232437Z-run1/rolling-restart/failure-bundle.json; /tmp/run1-liveness.out; /tmp/run1-topology.json; /tmp/run1-priority-residuals.out; subagent:019f15c8-716e-7bf2-995a-8da27c4ff8b5]
- **rolling-restart-run4-operation-drain-main**: Fresh post-patch PASS samples do not restate publication_converged or priority_spread_settled labels because PASS evidence is summarized as scenario_passed/no_invariant_breaches; the run1 failure report and stat-gate aggregate show missingPublishedCount=0 and priority spread settled, so these labels were not abandoned. The live blocker is split to critical_system_spread_open. (rules out: Do not treat the PASS reports' compact satisfiedInvariants list as a regression of publication_converged or priority_spread_settled; split the remaining critical_system_spread_open residual instead.) [test-output/reports/stat-gate-20260629T232437Z.json; test-output/reports/stat-gate-20260629T232437Z-run1.report.json; test-output/reports/stat-gate-20260629T232437Z-run2.report.json; test-output/reports/stat-gate-20260629T232437Z-run3.report.json; subagent:019f15c8-58bc-77f3-bbb7-23d0545f07d7; subagent:019f15c8-3f65-72b1-883c-3a0bf3d1fb62]

## Theories
- **theory-20260629-operation-workflow-remote-settle-effective-inflight** [supported] frontier, frontier rolling-restart-run4-operation-drain-main, layer scheduling, mechanism A coordinator-created operation workflow can keep terminal quiescence blocked after publication and active-gate coverage are satisfied because stale priority summaries and/or remote handoff retry paths leave an ACTIVE/effective-in-flight row or repeated remote-settle loop instead of recording a terminal operation drain., owner operation_workflow_owner, boundary workflow_progress, modelGate npm run model:contracts

## Selected Theories
- **rolling-restart-run4-operation-drain-main**: theory-20260629-operation-workflow-remote-settle-effective-inflight

## Theory Results
- **theory-20260629-operation-workflow-remote-settle-effective-inflight**: supported (scenario=done, theory=supported, movement=solved) [test-output/reports/stat-gate-20260629T222417Z-run2.report.json]
- **theory-20260629-operation-workflow-remote-settle-effective-inflight**: supported (scenario=done, theory=supported, movement=solved) [test-output/reports/stat-gate-20260629T222417Z-run3.report.json]
- **theory-20260629-operation-workflow-remote-settle-effective-inflight**: falsified (scenario=done, theory=falsified, movement=solved) [test-output/reports/stat-gate-20260629T222417Z-run3.report.json]
- **theory-20260629-operation-workflow-remote-settle-effective-inflight**: supported (scenario=needs-rerun, theory=supported-deterministic, movement=deterministic-proof-after-metric-flat-stamp) [solve/changes/rolling-restart-run4-operation-drain/operation-workflow-row-history-normalization.diff]
- **theory-20260629-operation-workflow-remote-settle-effective-inflight**: supported (scenario=improved, theory=supported, movement=narrowed) [test-output/reports/stat-gate-20260629T232437Z-run1.report.json]
- **theory-20260629-operation-workflow-remote-settle-effective-inflight**: supported (scenario=done, theory=supported, movement=solved) [test-output/reports/stat-gate-20260629T232437Z-run3.report.json]
- **theory-20260629-operation-workflow-remote-settle-effective-inflight**: supported (scenario=done, theory=supported, movement=solved) [test-output/reports/stat-gate-20260629T232437Z-run2.report.json]

## Attempt log
| ts | frontier | rung | metric | result | blocker movement | theory | change |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 2026-06-29T23:21:33.512Z | rolling-restart-run4-operation-drain-main | observe | 3 -> 3 | flat | solved | theory-20260629-operation-workflow-remote-settle-effective-inflight | diff:solve/changes/rolling-restart-run4-operation-drain/operation-workflow-row-history-normalization.diff |
