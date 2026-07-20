# Solve report: runtime-service-affinity-suboptimality-observer

**Goal:** A runtime service at its target replica count with spread satisfied, whose fresh data-affinity node weights make a non-incumbent ready node strictly better than an incumbent by more than the incumbent movement-cost margin, is observed as suboptimal by the planner state evaluation within one policy-refresh cycle — using the canonical placement-owner affinity score constants with no new scoring formula, no churn below the retention margin, and byte-identical evaluation for entities without preferDataAffinity — proven by a deterministic red-on-revert discriminator, and the unchanged MovieLens live scenario's learned-affinity phase converges placement onto the data-holder nodes.

**Class:** product · **Closure:** MEASURED

**Outcome:** SOLVED (MEASURED) — evidence: test-output/reports/movielens-lagrange-service-affinity-live-2026-07-20T15-41-10-348Z.report.json

**Attempts:** 0

## Links
- parent quest: movielens-three-way-affinity-demo
- plan: solve/epics/service-data-affinity-placement.md

## Scope Pressure
- Changed files: 0
- Change bytes: 0
- Owner areas: none
- Categories: none
- Signals: none

## Frontiers
- **runtime-service-affinity-suboptimality-observer-main** [open] rung 0, attempts 0, non-measurements 1, metric ? -> 0 — measurement unavailable (retry 1)

## Findings
- **runtime-service-affinity-suboptimality-observer-main**: DT red-on-revert proven for test/rebalancer/runtime-service-affinity-suboptimality-observer.test.js [dt:solve/changes/dt-prove/runtime-service-affinity-suboptimality-observer.test.js-2026-07-20T14-05-08-824Z.json]
- **runtime-service-affinity-suboptimality-observer-main**: Independent verification passed: artifact byte-identical at sha256 e6a44846, red-on-revert with a stronger discrimination check (helper-only base fails exactly the two wiring assertions), observer inert for partition/message-group policies, strict-inequality hysteresis confirmed at the exact retention boundary, hostile inputs fail closed, rebalancer 189/189 green, static gates green. One documented bounded imprecision: group weights can latch a false suboptimal flag (incumbent in the dominant-data group with zero node weight vs a cross-group challenger) — no hot loop (cadence is clock-driven and identical for no-move rounds) and no churn (scorer retention owns movement); costs one extra planning pass per round. [subagent:verify_affinity_observer_attempt1]
- **runtime-service-affinity-suboptimality-observer-main**: Known bounded false-positive of the trigger (verifier scenario): a service whose incumbent sits in the dominant-data latency group with zero node weight retains against a cross-group challenger the trigger flags; the scorer's group term (AFFINITY_WEIGHT * groupWeight) ranks the incumbent ahead so no move is planned while the trigger stays latched. Candidate future fix: add the group term to the trigger's incumbent and challenger scores so trigger and scorer share the full primary-score inequality. [solve/changes/runtime-service-affinity-suboptimality-observer/attempt-1.diff]
- **runtime-service-affinity-suboptimality-observer-main**: non-measuring sample (1/3): harness produced no trustworthy metric; holding the rung for retry rather than climbing toward an unearned exhausted park

## Theories
- **theory-20260720-no-affinity-suboptimality-observer** [supported] frontier, frontier runtime-service-affinity-suboptimality-observer-main, layer observation, mechanism placement-affinity-suboptimality-is-never-observed-by-the-planning-gate, modelGate npm run model:contracts

## Selected Theories
- **runtime-service-affinity-suboptimality-observer-main**: theory-20260720-no-affinity-suboptimality-observer

## Theory Results
- **theory-20260720-no-affinity-suboptimality-observer**: needs-rerun (scenario=invalid, theory=needs-rerun, movement=no_evidence) [test-output/reports/movielens-lagrange-service-affinity-live-2026-07-20T12-37-12-178Z.report.json]
- **theory-20260720-no-affinity-suboptimality-observer**: supported (scenario=done, theory=supported, movement=solved) [test-output/reports/movielens-lagrange-service-affinity-live-2026-07-20T15-10-32-079Z.report.json]
- **theory-20260720-no-affinity-suboptimality-observer**: supported (scenario=done, theory=supported, movement=solved) [test-output/reports/movielens-lagrange-service-affinity-live-2026-07-20T15-33-44-756Z.report.json]
- **theory-20260720-no-affinity-suboptimality-observer**: supported (scenario=done, theory=supported, movement=solved) [test-output/reports/movielens-lagrange-service-affinity-live-2026-07-20T15-41-10-348Z.report.json]

## Attempt log
| ts | frontier | rung | metric | result | blocker movement | theory | change |
| --- | --- | --- | --- | --- | --- | --- | --- |
