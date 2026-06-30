# Solve report: rolling-restart-run4-observer-staleness

**Goal:** Rolling-restart terminal active/readiness observer staleness no longer converts green publication/readiness progress into nodeSlotUnavailable, publication visibility, or observer-authority false failures, while the parent run4 safety floor and N>=15 Wilson closure bar remain intact.

**Class:** product · **Closure:** MEASURED

**Outcome:** IN PROGRESS (no terminal recorded)

**Attempts:** 1

## Links
- roadmap row: RM-0.1-fs-rolling-restart
- spec: membership-lifecycle-placement-hard-cutover
- parent quest: rolling-restart-run4-drain-residual
- plan: solve/epics/topology-convergence-hardening.md

## Current Blocker
- Frontier: rolling-restart-run4-observer-staleness-main
- Owner: unknown
- Boundary: unknown
- Dominant reason: convergence_timeout
- Mechanism: transition_gap
- Movement: narrowed: PASS -> convergence_timeout
- Latest evidence: test-output/reports/stat-gate-20260630T020210Z-run15.report.json
- Selected theory: theory-20260629-active-gate-observer-staleness-contract
- Next move: continue supervised step for rolling-restart-run4-observer-staleness-main
- No longer current: PASS; Do not continue source edits in the observer-staleness Quest; do not patch dispatch_pending or source_removal broadly from this N=3 sample without a fresh discriminator.

## Continuation
- Status: allowed
- Next action: continue supervised step for rolling-restart-run4-observer-staleness-main
- Blocker: none

## Scope Pressure
- Changed files: 2
- Owner areas: test/distributed/harness
- Categories: runtime
- Split plan:
  - test/distributed/harness: 2 file(s)
- Signal: mixed-runtime-and-harness severity=medium

## Frontiers
- **rolling-restart-run4-observer-staleness-main** [open] rung 1, attempts 1, metric 3 -> 2 — fresh measured evidence no longer satisfies frontier

## Findings
- **rolling-restart-run4-observer-staleness-main**: This child Quest splits from parent rolling-restart-run4-drain-residual because the parent frontier is honestly parked/exhausted and refused reopen, while N=15 stat-gate-20260629T200727Z exposed a new observation-layer residual: stale/regressed terminal active/readiness evidence can surface nodeSlotUnavailable, publication visibility, or observer-authority lag after monotonic best progress was already green. Work here must stay below-gate until deterministic retained-report and unit coverage falsifies or supports that observation contract. (rules out: Do not patch the exhausted parent frontier directly. Do not weaken SAFE bars or hide acknowledged-write readback failures; stale observer handling must preserve real missing publication and real ack/readback failures.) [solve/report/rolling-restart-run4-drain-residual.md; test-output/reports/stat-gate-20260629T200727Z.json; subagent:019f1565-448e-7250-9fad-15ab0cb148f2; subagent:019f1565-4550-7842-8899-f39038b26039]
- **rolling-restart-run4-observer-staleness-main**: Ingested evidence from stat-gate-20260629T200727Z-run15.report.json. Metric: unknown -> 3. Verdict: PASS (scenario_passed). Root cause: none. Dominant reason: none. Owner: none. Ingestion outcome: changed. [test-output/reports/stat-gate-20260629T200727Z-run15.report.json]
- **rolling-restart-run4-observer-staleness-main**: Ingested evidence from stat-gate-20260629T200727Z-run15.report.json. Metric: unknown -> 3. Verdict: PASS (scenario_passed). Root cause: none. Dominant reason: none. Owner: none. Ingestion outcome: changed. [test-output/reports/stat-gate-20260629T200727Z-run15.report.json]
- **rolling-restart-run4-observer-staleness-main**: Subagent verifier Carson approved the active-gate terminal observer patch with no blocking findings: the new selection rule only falls back to last meaningful progress when current publicationEpoch is lower and no semantic publication improvement exists, current final evidence remains retained in noProgress.currentProgress, and equal/newer epoch publication debt still selects current. Residual risk is limited to unmodeled pending-ack/readback variants, which are guarded by the shared no-publication-improvement predicate and existing adjacent bundle tests. (rules out: Do not treat the selector fallback as dropping current failure evidence; it remains exposed in noProgress.currentProgress and publication summaries still receive the current gate record.) [subagent:019f1574-d776-78e3-9d98-9c903f319c31; test/distributed/harness/cluster-active-wait-loop.js; test/distributed/harness/__tests__/cluster-active-wait-terminal-startup-blocker-test-cases.js]
- **rolling-restart-run4-observer-staleness-main**: Post-attempt source verification: subagent 019f1574-d776-78e3-9d98-9c903f319c31 reviewed the committed change artifact and found no blocking issues. The patch is scoped to terminal active-gate observer selection, keeps current final evidence in noProgress.currentProgress, and does not hide equal/newer epoch publication debt. The metric-flat attempt result reflects the child frontier's inherited PASS liveness stamp, not a failed deterministic discriminator. (rules out: Do not read the metric-flat auto theory result as refuting the red-on-revert unit proof; no fresh statistical gate was run for this child Quest.) [subagent:019f1574-d776-78e3-9d98-9c903f319c31; solve/changes/rolling-restart-run4-observer-staleness/active-gate-publication-epoch-regression.diff]
- **rolling-restart-run4-observer-staleness-main**: Ingested evidence from stat-gate-20260629T222417Z-run1.report.json. Metric: 3 -> 1. Verdict: BLOCK_TOPOLOGY_CONVERGENCE (topology_progress_blocked). Root cause: topology. Dominant reason: replica_operations_in_flight. Owner: none. Ingestion outcome: changed. [test-output/reports/stat-gate-20260629T222417Z-run1.report.json]
- **rolling-restart-run4-observer-staleness-main**: Ingested evidence from stat-gate-20260629T222417Z-run2.report.json. Metric: 1 -> 3. Verdict: PASS (scenario_passed). Root cause: none. Dominant reason: none. Owner: none. Ingestion outcome: changed. [test-output/reports/stat-gate-20260629T222417Z-run2.report.json]
- **rolling-restart-run4-observer-staleness-main**: Ingested evidence from stat-gate-20260629T222417Z-run3.report.json. Metric: 3 -> 3. Verdict: PASS (scenario_passed). Root cause: none. Dominant reason: none. Owner: none. Ingestion outcome: changed. [test-output/reports/stat-gate-20260629T222417Z-run3.report.json]
- **rolling-restart-run4-observer-staleness-main**: Ingested evidence from stat-gate-20260629T222417Z-run3.report.json. Metric: 3 -> 3. Verdict: PASS (scenario_passed). Root cause: none. Dominant reason: none. Owner: none. Ingestion outcome: changed. [test-output/reports/stat-gate-20260629T222417Z-run3.report.json]
- **rolling-restart-run4-observer-staleness-main**: Post-fix N=3 gate stat-gate-20260629T222417Z is safety-clean and supports retiring the active-gate observer-staleness family as the current blocker: 3/3 runs were CONVERGED with staleSourceRuns=0, CORRUPT=0, ORACLE_BLIND=0, NODE_EXIT=0, missingPublished=0, and no nodeSlotUnavailable/publication_missing_active_node/observer_authority_visibility_lag dominant residuals. It is not closure evidence because run1 still failed doneWhen with replica_operations_in_flight, and liveness classifies that sample as operation_workflow_owner/workflow_progress stuck_downstream_workflow_progress in REPLACE target_creation dispatched_waiting_progress. (rules out: Do not widen the active-gate observer selector for the run1 failure; the next source theory must target operation workflow progress or split to a child Quest.) [test-output/reports/stat-gate-20260629T222417Z.json; test-output/reports/stat-gate-20260629T222417Z-run1.report.json; npm run analyze:rolling-restart-liveness -- test-output/reports/stat-gate-20260629T222417Z-run1.report.json; npm run analyze:topology-convergence -- test-output/reports/stat-gate-20260629T222417Z-run1.report.json]
- **rolling-restart-run4-observer-staleness-main**: Parallel subagent split verification completed after stat-gate-20260629T222417Z: target_creation dispatched_waiting_progress is a real stale priority witness, dispatch_pending persisted_not_dispatched is a distinct but non-binding residue because N=3 runs 2/3 passed with it, and ACTIVE/source_removal from parent run7 should be postponed. Full-log replay shows the run1 representative target_creation operation 434ac3bb-c216-42f1-b7f0-ccfa948bac66 later reached ACTIVE, source removal, drain settlement, and Operation completed; the terminal failure bundle instead has an effective in-flight ACTIVE REPLACE row a3d54c47-50db-44b9-aa7f-869b8f6b4b28 on service_timers-p1 plus a coordinator_created_remote_handoff error on sql_write_operations-p1 operation 6a6e16e7-b894-4359-8f4f-bed8582cac12. Split further work to a new operation-drain Quest. (rules out: Do not continue source edits in the observer-staleness Quest; do not patch dispatch_pending or source_removal broadly from this N=3 sample without a fresh discriminator.) [subagent:019f1599-ecfd-7e33-86da-cfdc9b874f93; subagent:019f159a-0199-7a52-8fe9-85e484c909e4; subagent:019f159a-1b17-7c12-b5ed-56d63c3d91fe; test-output/reports/stat-gate-20260629T222417Z-run1.report.json; test-output/reports/.playback/stat-gate-20260629T222417Z-run1/rolling-restart/failure-bundle.json]
- **rolling-restart-run4-observer-staleness-main**: Ingested evidence from stat-gate-20260630T020210Z-run15.report.json. Metric: 3 -> 2. Verdict: BLOCK_TOPOLOGY_CONVERGENCE (topology_progress_blocked). Root cause: topology. Dominant reason: convergence_timeout. Owner: none. Ingestion outcome: changed. [test-output/reports/stat-gate-20260630T020210Z-run15.report.json]
- **rolling-restart-run4-observer-staleness-main**: Ingested evidence from stat-gate-20260630T020210Z-run15.report.json. Metric: 3 -> 2. Verdict: BLOCK_TOPOLOGY_CONVERGENCE (topology_progress_blocked). Root cause: topology. Dominant reason: convergence_timeout. Owner: none. Ingestion outcome: changed. [test-output/reports/stat-gate-20260630T020210Z-run15.report.json]

## Theories
- **theory-20260629-active-gate-observer-staleness-contract** [supported] frontier, frontier rolling-restart-run4-observer-staleness-main, layer observation, mechanism The rolling-restart terminal observer can classify stale or regressed readiness/authority samples as nodeSlotUnavailable, publication visibility, or observer lag after the monotonic active-gate evidence already reached full published-active coverage, pendingAck=0, missingPublished=0, priority spread ready, and blockers ready., owner startup_active_gate_owner, boundary terminal_observer_evidence, modelGate npm run model:contracts

## Selected Theories
- **rolling-restart-run4-observer-staleness-main**: theory-20260629-active-gate-observer-staleness-contract

## Theory Results
- **theory-20260629-active-gate-observer-staleness-contract**: supported (scenario=done, theory=supported, movement=solved) [test-output/reports/stat-gate-20260629T200727Z-run15.report.json]
- **theory-20260629-active-gate-observer-staleness-contract**: supported (scenario=needs-rerun, theory=supported, movement=deterministic-proof) [solve/changes/rolling-restart-run4-observer-staleness/active-gate-publication-epoch-regression.diff]
- **theory-20260629-active-gate-observer-staleness-contract**: falsified (scenario=done, theory=falsified, movement=solved) [test-output/reports/stat-gate-20260629T200727Z-run15.report.json]
- **theory-20260629-active-gate-observer-staleness-contract**: supported (scenario=needs-rerun, theory=supported-deterministic, movement=deterministic-proof-after-metric-flat-stamp) [solve/changes/rolling-restart-run4-observer-staleness/active-gate-publication-epoch-regression.diff]
- **theory-20260629-active-gate-observer-staleness-contract**: supported (scenario=improved, theory=supported, movement=narrowed) [test-output/reports/stat-gate-20260629T222417Z-run1.report.json]
- **theory-20260629-active-gate-observer-staleness-contract**: supported (scenario=done, theory=supported, movement=solved) [test-output/reports/stat-gate-20260629T222417Z-run2.report.json]
- **theory-20260629-active-gate-observer-staleness-contract**: supported (scenario=done, theory=supported, movement=solved) [test-output/reports/stat-gate-20260629T222417Z-run3.report.json]
- **theory-20260629-active-gate-observer-staleness-contract**: supported (scenario=failed, theory=partial, movement=narrowed) [test-output/reports/stat-gate-20260629T222417Z.json]
- **theory-20260629-active-gate-observer-staleness-contract**: supported (scenario=improved, theory=supported, movement=narrowed) [test-output/reports/stat-gate-20260630T020210Z-run15.report.json]

## Attempt log
| ts | frontier | rung | metric | result | blocker movement | theory | change |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 2026-06-29T22:22:40.086Z | rolling-restart-run4-observer-staleness-main | observe | 3 -> 3 | flat | solved | theory-20260629-active-gate-observer-staleness-contract | diff:solve/changes/rolling-restart-run4-observer-staleness/active-gate-publication-epoch-regression.diff |
