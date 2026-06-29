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
- Dominant reason: unknown
- Mechanism: topology_gap
- Movement: first blocker observed: PASS
- Latest evidence: test-output/reports/stat-gate-20260629T200727Z-run15.report.json
- Selected theory: theory-20260629-active-gate-observer-staleness-contract
- Next move: continue supervised step for rolling-restart-run4-observer-staleness-main
- No longer current: Do not treat the selector fallback as dropping current failure evidence; it remains exposed in noProgress.currentProgress and publication summaries still receive the current gate record.; Do not read the metric-flat auto theory result as refuting the red-on-revert unit proof; no fresh statistical gate was run for this child Quest.

## Continuation
- Status: allowed
- Next action: No open frontier remains; inspect solve report.
- Blocker: none

## Scope Pressure
- Changed files: 2
- Owner areas: test/distributed/harness
- Categories: runtime
- Split plan:
  - test/distributed/harness: 2 file(s)
- Signal: mixed-runtime-and-harness severity=medium

## Frontiers
- **rolling-restart-run4-observer-staleness-main** [solved] rung 1, attempts 1, metric 3 -> 3

## Findings
- **rolling-restart-run4-observer-staleness-main**: This child Quest splits from parent rolling-restart-run4-drain-residual because the parent frontier is honestly parked/exhausted and refused reopen, while N=15 stat-gate-20260629T200727Z exposed a new observation-layer residual: stale/regressed terminal active/readiness evidence can surface nodeSlotUnavailable, publication visibility, or observer-authority lag after monotonic best progress was already green. Work here must stay below-gate until deterministic retained-report and unit coverage falsifies or supports that observation contract. (rules out: Do not patch the exhausted parent frontier directly. Do not weaken SAFE bars or hide acknowledged-write readback failures; stale observer handling must preserve real missing publication and real ack/readback failures.) [solve/report/rolling-restart-run4-drain-residual.md; test-output/reports/stat-gate-20260629T200727Z.json; subagent:019f1565-448e-7250-9fad-15ab0cb148f2; subagent:019f1565-4550-7842-8899-f39038b26039]
- **rolling-restart-run4-observer-staleness-main**: Ingested evidence from stat-gate-20260629T200727Z-run15.report.json. Metric: unknown -> 3. Verdict: PASS (scenario_passed). Root cause: none. Dominant reason: none. Owner: none. Ingestion outcome: changed. [test-output/reports/stat-gate-20260629T200727Z-run15.report.json]
- **rolling-restart-run4-observer-staleness-main**: Ingested evidence from stat-gate-20260629T200727Z-run15.report.json. Metric: unknown -> 3. Verdict: PASS (scenario_passed). Root cause: none. Dominant reason: none. Owner: none. Ingestion outcome: changed. [test-output/reports/stat-gate-20260629T200727Z-run15.report.json]
- **rolling-restart-run4-observer-staleness-main**: Subagent verifier Carson approved the active-gate terminal observer patch with no blocking findings: the new selection rule only falls back to last meaningful progress when current publicationEpoch is lower and no semantic publication improvement exists, current final evidence remains retained in noProgress.currentProgress, and equal/newer epoch publication debt still selects current. Residual risk is limited to unmodeled pending-ack/readback variants, which are guarded by the shared no-publication-improvement predicate and existing adjacent bundle tests. (rules out: Do not treat the selector fallback as dropping current failure evidence; it remains exposed in noProgress.currentProgress and publication summaries still receive the current gate record.) [subagent:019f1574-d776-78e3-9d98-9c903f319c31; test/distributed/harness/cluster-active-wait-loop.js; test/distributed/harness/__tests__/cluster-active-wait-terminal-startup-blocker-test-cases.js]
- **rolling-restart-run4-observer-staleness-main**: Post-attempt source verification: subagent 019f1574-d776-78e3-9d98-9c903f319c31 reviewed the committed change artifact and found no blocking issues. The patch is scoped to terminal active-gate observer selection, keeps current final evidence in noProgress.currentProgress, and does not hide equal/newer epoch publication debt. The metric-flat attempt result reflects the child frontier's inherited PASS liveness stamp, not a failed deterministic discriminator. (rules out: Do not read the metric-flat auto theory result as refuting the red-on-revert unit proof; no fresh statistical gate was run for this child Quest.) [subagent:019f1574-d776-78e3-9d98-9c903f319c31; solve/changes/rolling-restart-run4-observer-staleness/active-gate-publication-epoch-regression.diff]

## Theories
- **theory-20260629-active-gate-observer-staleness-contract** [supported] frontier, frontier rolling-restart-run4-observer-staleness-main, layer observation, mechanism The rolling-restart terminal observer can classify stale or regressed readiness/authority samples as nodeSlotUnavailable, publication visibility, or observer lag after the monotonic active-gate evidence already reached full published-active coverage, pendingAck=0, missingPublished=0, priority spread ready, and blockers ready., owner startup_active_gate_owner, boundary terminal_observer_evidence, modelGate npm run model:contracts

## Selected Theories
- **rolling-restart-run4-observer-staleness-main**: theory-20260629-active-gate-observer-staleness-contract

## Theory Results
- **theory-20260629-active-gate-observer-staleness-contract**: supported (scenario=done, theory=supported, movement=solved) [test-output/reports/stat-gate-20260629T200727Z-run15.report.json]
- **theory-20260629-active-gate-observer-staleness-contract**: supported (scenario=needs-rerun, theory=supported, movement=deterministic-proof) [solve/changes/rolling-restart-run4-observer-staleness/active-gate-publication-epoch-regression.diff]
- **theory-20260629-active-gate-observer-staleness-contract**: falsified (scenario=done, theory=falsified, movement=solved) [test-output/reports/stat-gate-20260629T200727Z-run15.report.json]
- **theory-20260629-active-gate-observer-staleness-contract**: supported (scenario=needs-rerun, theory=supported-deterministic, movement=deterministic-proof-after-metric-flat-stamp) [solve/changes/rolling-restart-run4-observer-staleness/active-gate-publication-epoch-regression.diff]

## Attempt log
| ts | frontier | rung | metric | result | blocker movement | theory | change |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 2026-06-29T22:22:40.086Z | rolling-restart-run4-observer-staleness-main | observe | 3 -> 3 | flat | solved | theory-20260629-active-gate-observer-staleness-contract | diff:solve/changes/rolling-restart-run4-observer-staleness/active-gate-publication-epoch-regression.diff |
