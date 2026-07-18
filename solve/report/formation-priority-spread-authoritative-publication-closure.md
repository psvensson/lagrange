# Solve report: formation-priority-spread-authoritative-publication-closure

**Goal:** Cold five-node formation reaches schema-admission quiescence within the unchanged 180000ms budget and 60000ms stability window because the priority control-plane partitions (including the replica_operations ledger) reach their spread targets without paying the serialized exclusive ledger self-move cost class measured at 85-110s: replicas of priority partitions are placed or cured such that no schema-admission-blocking window carries back-to-back exclusive ledger self-moves, while the ledger interlock's exclusivity during any live self-move, quorum and voter safety, remove-safety authorities, and the sealed live scenario semantics all remain byte-unchanged.

**Class:** product · **Closure:** MEASURED

**Outcome:** IN PROGRESS (no terminal recorded)

**Attempts:** 2

## Links
- spec: solve/epics/service-data-affinity-placement.md
- parent quest: formation-priority-spread-authoritative-handoff-closure
- plan: solve/epics/topology-convergence-hardening.md

## Current Blocker
- Frontier: formation-priority-spread-authoritative-publication-closure-main
- Owner: unknown
- Boundary: unknown
- Dominant reason: unknown
- Mechanism: unknown
- Movement: no evidence recorded
- Latest evidence: none
- Selected theory: theory-20260718-complete-authoritative-cache-row-exact-replace
- Next move: continue supervised step for formation-priority-spread-authoritative-publication-closure-main

## Continuation
- Status: allowed
- Next action: continue supervised step for formation-priority-spread-authoritative-publication-closure-main
- Blocker: none

## Scope Pressure
- Changed files: 4
- Change bytes: 29373
- Owner areas: src/control-plane, test/cache, test/cdc, test/convergence
- Categories: runtime, test
- Action: land or separate 4 owner areas: src/control-plane, test/cache, test/cdc, test/convergence
- Split plan:
  - src/control-plane: 1 file(s)
  - test/cache: 1 file(s)
  - test/cdc: 1 file(s)
  - test/convergence: 1 file(s)
- Signal: broad-source-scope severity=medium

## Frontiers
- **formation-priority-spread-authoritative-publication-closure-main** [open] rung 1, attempts 2, metric 1 -> 1

## Findings
- **formation-priority-spread-authoritative-publication-closure-main**: Independent verification rejected attempt 1: a caller equality override could bypass canonical full-row comparison for a valid complete-table receipt, leave durable cache divergence untouched, and still publish the authoritative observation watermark. [subagent:formation_barrier_verifier]
- **formation-priority-spread-authoritative-publication-closure-main**: DT red-on-revert proven for test/convergence/dt6-authoritative-observation-watermark.test.js [dt:solve/changes/dt-prove/dt6-authoritative-observation-watermark.test.js-2026-07-18T00-53-54-028Z.json]

## Theories
- **theory-20260718-complete-authoritative-cache-row-exact-replace** [supported] frontier, frontier formation-priority-spread-authoritative-publication-closure-main, layer observation, mechanism complete_authoritative_cache_row_exact_replace, owner ControlPlaneSystemTableGateway_and_SystemTableCache, boundary complete_authoritative_observation_to_observed_cache, modelGate npm run model:contracts

## Selected Theories
- **formation-priority-spread-authoritative-publication-closure-main**: theory-20260718-complete-authoritative-cache-row-exact-replace

## Theory Results
- **theory-20260718-complete-authoritative-cache-row-exact-replace**: supported (scenario=failed, theory=supported, movement=no_evidence) [test-output/reports/movielens-lagrange-service-affinity-live-2026-07-17T23-34-41-192Z.report.json]
- **theory-20260718-complete-authoritative-cache-row-exact-replace**: supported (scenario=failed, theory=supported, movement=no_evidence) [test-output/reports/movielens-lagrange-service-affinity-live-2026-07-17T23-34-41-192Z.report.json]

## Attempt log
| ts | frontier | rung | metric | result | blocker movement | theory | change |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 2026-07-18T00:48:36.827Z | formation-priority-spread-authoritative-publication-closure-main | observe | 1 -> 1 | flat | no_evidence | theory-20260718-complete-authoritative-cache-row-exact-replace | diff:solve/changes/formation-priority-spread-authoritative-publication-closure/attempt-1.diff |
| 2026-07-18T00:54:28.007Z | formation-priority-spread-authoritative-publication-closure-main | observe | 1 -> 1 | flat | no_evidence | theory-20260718-complete-authoritative-cache-row-exact-replace | diff:solve/changes/formation-priority-spread-authoritative-publication-closure/attempt-2.diff |
