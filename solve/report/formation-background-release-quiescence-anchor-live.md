# Solve report: formation-background-release-quiescence-anchor-live

**Goal:** The unchanged movielens-lagrange-service-affinity-live scenario reports priority metric 0 on one fresh run, and while the existing background formation-release handoff is active, authoritative topology-shaping replica work resets its maturity clock so ordinary work remains closed until the existing 60000ms admission interval plus 10000ms observation handoff has elapsed after operation drain; priority recovery stays exempt and ordinary work never rearms the fence after release.

**Class:** product · **Closure:** MEASURED

**Outcome:** IN PROGRESS (no terminal recorded)

**Attempts:** 3

## Links
- spec: solve/epics/service-data-affinity-placement.md
- parent quest: formation-background-release-owner-closure
- plan: solve/epics/topology-convergence-hardening.md

## Current Blocker
- Frontier: formation-background-release-quiescence-anchor-live-main
- Owner: unknown
- Boundary: unknown
- Dominant reason: unknown
- Mechanism: unknown
- Movement: no evidence recorded
- Latest evidence: none
- Selected theory: theory-20260718-a-scheduled-background-recheck-can-recover (stale: selected theory status is falsified)
- Next move: record or select a fresh frontier theory for formation-background-release-quiescence-anchor-live-main

## Continuation
- Status: blocked-theory
- Next action: record system theory before the next formation-background-release-quiescence-anchor-live-main attempt using npm run model:contracts as model discriminator
- Blocker: system theory required for formation-background-release-quiescence-anchor-live-main
- Blocker: frontier theory required for formation-background-release-quiescence-anchor-live-main
- Blocker: selected theory stale: selected theory status is falsified

## Scope Pressure
- Changed files: 4
- Change bytes: 15093
- Owner areas: src/rebalancer, test/rebalancer
- Categories: runtime
- Split plan:
  - src/rebalancer: 3 file(s)
  - test/rebalancer: 1 file(s)
- Signals: none

## Frontiers
- **formation-background-release-quiescence-anchor-live-main** [open] rung 3, attempts 3, metric 1 -> 1

## Findings
- **formation-background-release-quiescence-anchor-live-main**: DT red-on-revert proven for test/rebalancer/unified-rebalancer.test.js [dt:solve/changes/dt-prove/unified-rebalancer.test.js-2026-07-18T09-27-31-414Z.json]
- **formation-background-release-quiescence-anchor-live-main**: Ingested evidence from movielens-lagrange-service-affinity-live-2026-07-18T09-04-17-360Z.report.json. Metric: 1 -> 1. Verdict: FAIL. Root cause: none. Dominant reason: none. Owner: none. Ingestion outcome: changed. [test-output/reports/movielens-lagrange-service-affinity-live-2026-07-18T09-04-17-360Z.report.json]
- **formation-background-release-quiescence-anchor-live-main**: attempt 1 did not prove work appearing after priority clear [subagent:root/quiescence_anchor_verifier]
- **formation-background-release-quiescence-anchor-live-main**: DT red-on-revert proven for test/rebalancer/unified-rebalancer.test.js [dt:solve/changes/dt-prove/unified-rebalancer.test.js-2026-07-18T09-30-47-206Z.json]
- **formation-background-release-quiescence-anchor-live-main**: Failed live run repeatedly evaluated the production background planning gate while schema ADDs were in flight: ADD creation began at node-0.log:4467 and background stability samples continued through node-0.log:4719 before the final ADD drain at node-0.log:4876, so the active-clock reset path is engaged by the unchanged scenario. [log:data/examples/service-data-affinity-demo/node-0.log]
- **formation-background-release-quiescence-anchor-live-main**: attempt 2 can miss topology work that starts and drains between scheduled background evaluations [subagent:root/quiescence_anchor_verifier]
- **formation-background-release-quiescence-anchor-live-main**: DT red-on-revert proven for test/rebalancer/unified-rebalancer.test.js [dt:solve/changes/dt-prove/unified-rebalancer.test.js-2026-07-18T09-44-04-735Z.json]

## Theories
- **theory-20260718-a-scheduled-background-recheck-can-recover** [falsified] frontier, frontier formation-background-release-quiescence-anchor-live-main, layer observation, mechanism a scheduled background recheck can recover topology work missed between evaluations from a terminal coordinator-owned operation whose completion watermark is newer than the active priority-clear clock, modelGate npm run model:contracts

## Selected Theories
- **formation-background-release-quiescence-anchor-live-main**: theory-20260718-a-scheduled-background-recheck-can-recover

## Theory Results
- **theory-20260718-a-scheduled-background-recheck-can-recover**: falsified (scenario=failed, theory=falsified, movement=no_evidence) [test-output/reports/movielens-lagrange-service-affinity-live-2026-07-18T09-04-17-360Z.report.json]

## Attempt log
| ts | frontier | rung | metric | result | blocker movement | theory | change |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 2026-07-18T09:28:32.204Z | formation-background-release-quiescence-anchor-live-main | observe | 1 -> 1 | flat | no_evidence |  | diff:solve/changes/formation-background-release-quiescence-anchor-live/attempt-1.diff |
| 2026-07-18T09:30:59.131Z | formation-background-release-quiescence-anchor-live-main | local-fix | 1 -> 1 | flat | no_evidence |  | diff:solve/changes/formation-background-release-quiescence-anchor-live/attempt-2.diff |
| 2026-07-18T09:44:49.860Z | formation-background-release-quiescence-anchor-live-main | widen-scope | 1 -> 1 | flat | no_evidence | theory-20260718-a-scheduled-background-recheck-can-recover | diff:solve/changes/formation-background-release-quiescence-anchor-live/attempt-3.diff |
