# Solve report: formation-priority-spread-authoritative-handoff-closure

**Goal:** Cold five-node formation reaches schema-admission quiescence within the unchanged 180000ms budget and 60000ms stability window because the priority control-plane partitions (including the replica_operations ledger) reach their spread targets without paying the serialized exclusive ledger self-move cost class measured at 85-110s: replicas of priority partitions are placed or cured such that no schema-admission-blocking window carries back-to-back exclusive ledger self-moves, while the ledger interlock's exclusivity during any live self-move, quorum and voter safety, remove-safety authorities, and the sealed live scenario semantics all remain byte-unchanged.

**Class:** product · **Closure:** MEASURED

**Outcome:** IN PROGRESS (no terminal recorded)

**Attempts:** 7

## Links
- spec: solve/epics/service-data-affinity-placement.md
- parent quest: formation-priority-spread-without-exclusive-self-move-cost
- plan: solve/epics/topology-convergence-hardening.md

## Current Blocker
- Frontier: formation-priority-spread-authoritative-handoff-closure-main
- Owner: unknown
- Boundary: unknown
- Dominant reason: unknown
- Mechanism: unknown
- Movement: no evidence recorded
- Latest evidence: none
- Selected theory: theory-20260718-services-composite-owner-terminal-alignment
- Next move: continue supervised step for formation-priority-spread-authoritative-handoff-closure-main

## Continuation
- Status: allowed
- Next action: No open frontier remains; inspect solve report.
- Blocker: none

## Scope Pressure
- Changed files: 18
- Change bytes: 61992
- Owner areas: src/cache, src/cdc, src/partition, src/rebalancer, test/partition, test/rebalancer
- Categories: runtime, test
- Action: split by owner area before the next attempt (18 files)
- Action: land or separate 6 owner areas: src/cache, src/cdc, src/partition, src/rebalancer, test/partition, test/rebalancer
- Split plan:
  - src/rebalancer: 9 file(s)
  - src/cache: 4 file(s)
  - test/rebalancer: 2 file(s)
  - src/cdc: 1 file(s)
  - src/partition: 1 file(s)
  - test/partition: 1 file(s)
- Signal: broad-source-scope severity=medium
- Signal: large-diff-stack severity=medium

## Frontiers
- **formation-priority-spread-authoritative-handoff-closure-main** [parked {exhausted}] rung 5, attempts 7, metric 1 -> 1 — ladder exhausted without metric movement

## Findings
- **formation-priority-spread-authoritative-handoff-closure-main**: Ingested evidence from movielens-lagrange-service-affinity-live-2026-07-17T23-34-41-192Z.report.json. Metric: 1 -> 1. Verdict: FAIL. Root cause: none. Dominant reason: none. Owner: none. Ingestion outcome: changed. [test-output/reports/movielens-lagrange-service-affinity-live-2026-07-17T23-34-41-192Z.report.json]
- **formation-priority-spread-authoritative-handoff-closure-main**: Bounded source receipt 1 isolates exact live-leader surplus retention and terminal ACTIVE SERVICES handoff (13 paths, 29,405 bytes); the independent authoritative publication reconciliation belongs to a separate owner-boundary attempt. [solve/changes/formation-priority-spread-authoritative-handoff-closure/attempt-1.diff]
- **formation-priority-spread-authoritative-handoff-closure-main**: Independent verification rejected receipt 1: byte-exact leader/terminal-handoff changes are substantively fail-closed, but the pinned patch omits the CDC/cache post-apply equality dependency and therefore is not self-contained against a silently dropped repair. [subagent:formation_barrier_verifier]
- **formation-priority-spread-authoritative-handoff-closure-main**: Independent verification rejected replacement receipt 2: it omitted the changed stale-backfill owner required by SystemTableCache's five-argument calls, and full-row SERVICES equality can livelock valid composite-owner reconciliation when cache role/version evidence is newer but authority lifecycle evidence is newer. [subagent:formation_barrier_verifier]
- **formation-priority-spread-authoritative-handoff-closure-main**: DT red-on-revert proven for test/rebalancer/operation-workflow-active-cache-handoff.test.js [dt:solve/changes/dt-prove/operation-workflow-active-cache-handoff.test.js-2026-07-18T00-16-15-785Z.json]
- **formation-priority-spread-authoritative-handoff-closure-main**: Independent verification rejected replacement receipt 3: equal updated_at with a newer cache-only HLC can let lifecycle repair overwrite newer raft_role evidence and then release, while a partial authoritative SERVICES row can pass a status-only postcondition after deleting identity/lifecycle fields. [subagent:formation_barrier_verifier]
- **formation-priority-spread-authoritative-handoff-closure-main**: DT red-on-revert proven for test/rebalancer/operation-workflow-active-cache-handoff.test.js [dt:solve/changes/dt-prove/operation-workflow-active-cache-handoff.test.js-2026-07-18T00-28-12-995Z.json]
- **formation-priority-spread-authoritative-handoff-closure-main**: DT red-on-revert proven for test/rebalancer/operation-workflow-active-cache-handoff.test.js [dt:solve/changes/dt-prove/operation-workflow-active-cache-handoff.test.js-2026-07-18T00-28-29-604Z.json]
- **formation-priority-spread-authoritative-handoff-closure-main**: Independent verification rejected replacement receipt 5: a refresh aligned to newer FAILED lifecycle could return true and release an ACTIVE handoff, while numeric coercion admitted null/blank lifecycle timestamps as zero and allowed malformed authority to mutate cache. [subagent:formation_barrier_verifier]
- **formation-priority-spread-authoritative-handoff-closure-main**: DT red-on-revert proven for test/rebalancer/operation-workflow-active-cache-handoff.test.js [dt:solve/changes/dt-prove/operation-workflow-active-cache-handoff.test.js-2026-07-18T00-35-52-210Z.json]
- **formation-priority-spread-authoritative-handoff-closure-main**: Independent verification passed attempt 6: exact ACTIVE postcondition, strict complete-row shape validation, lifecycle-owner monotonicity, leader retention, and full-row gateway mode isolation all held under adversarial replay. [subagent:formation_barrier_verifier]
- **formation-priority-spread-authoritative-handoff-closure-main**: Independent verification rejected attempt 4: it is runtime-identical to rejected attempt 5 apart from indentation and retains both malformed numeric coercion and missing expected-ACTIVE postcondition witnesses. [subagent:formation_barrier_verifier]

## Theories
- **theory-20260718-the-repository-supplies-expected-active-state** [active] system, mechanism The repository supplies expected ACTIVE state to the direct authoritative refresh; CDC accepts only complete shape-valid SERVICES rows, applies monotonic lifecycle reconciliation, and returns true only when the refreshed cache is both owner-aligned and still matches expected ACTIVE., owner replica-operation repository terminal handoff through CDC authoritative cache reconciliation, modelGate npm run model:contracts
- **theory-20260718-live-leader-identity-and-terminal-services** [supported] frontier, frontier formation-priority-spread-authoritative-handoff-closure-main, layer ownership, mechanism live_leader_identity_and_terminal_services_cache_handoff, owner formation_priority_recovery_handoff_chain, boundary placement_to_terminal_services_projection, modelGate npm run model:contracts
- **theory-20260718-complete-authoritative-cache-row-exact-replace** [active] frontier, frontier formation-priority-spread-authoritative-handoff-closure-main, layer observation, mechanism complete_authoritative_cache_row_exact_replace, owner ControlPlaneSystemTableGateway_and_SystemTableCache, boundary complete_authoritative_observation_to_observed_cache, modelGate npm run model:contracts
- **theory-20260718-services-composite-owner-terminal-alignment** [supported] frontier, frontier formation-priority-spread-authoritative-handoff-closure-main, layer ownership, mechanism services_composite_owner_terminal_alignment, owner SystemTableCache_and_operation_workflow_owner, boundary authoritative_SERVICES_lifecycle_to_terminal_operation_release, modelGate npm run model:contracts

## Selected Theories
- **formation-priority-spread-authoritative-handoff-closure-main**: theory-20260718-services-composite-owner-terminal-alignment

## Theory Results
- **theory-20260718-live-leader-identity-and-terminal-services**: supported (scenario=failed, theory=supported, movement=no_evidence) [test-output/reports/movielens-lagrange-service-affinity-live-2026-07-17T23-34-41-192Z.report.json]
- **theory-20260718-live-leader-identity-and-terminal-services**: supported (scenario=failed, theory=supported, movement=no_evidence) [test-output/reports/movielens-lagrange-service-affinity-live-2026-07-17T23-34-41-192Z.report.json]
- **theory-20260718-services-composite-owner-terminal-alignment**: supported (scenario=failed, theory=supported, movement=no_evidence) [test-output/reports/movielens-lagrange-service-affinity-live-2026-07-17T23-34-41-192Z.report.json]
- **theory-20260718-services-composite-owner-terminal-alignment**: supported (scenario=failed, theory=supported, movement=no_evidence) [test-output/reports/movielens-lagrange-service-affinity-live-2026-07-17T23-34-41-192Z.report.json]
- **theory-20260718-services-composite-owner-terminal-alignment**: supported (scenario=failed, theory=supported, movement=no_evidence) [test-output/reports/movielens-lagrange-service-affinity-live-2026-07-17T23-34-41-192Z.report.json]
- **theory-20260718-services-composite-owner-terminal-alignment**: supported (scenario=failed, theory=supported, movement=no_evidence) [test-output/reports/movielens-lagrange-service-affinity-live-2026-07-17T23-34-41-192Z.report.json]
- **theory-20260718-services-composite-owner-terminal-alignment**: supported (scenario=failed, theory=supported, movement=no_evidence) [test-output/reports/movielens-lagrange-service-affinity-live-2026-07-17T23-34-41-192Z.report.json]

## Attempt log
| ts | frontier | rung | metric | result | blocker movement | theory | change |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 2026-07-18T00:01:14.166Z | formation-priority-spread-authoritative-handoff-closure-main | observe | 1 -> 1 | flat | no_evidence | theory-20260718-live-leader-identity-and-terminal-services | diff:solve/changes/formation-priority-spread-authoritative-handoff-closure/attempt-1.diff |
| 2026-07-18T00:09:07.082Z | formation-priority-spread-authoritative-handoff-closure-main | observe | 1 -> 1 | flat | no_evidence | theory-20260718-live-leader-identity-and-terminal-services | diff:solve/changes/formation-priority-spread-authoritative-handoff-closure/attempt-2.diff.json |
| 2026-07-18T00:15:05.027Z | formation-priority-spread-authoritative-handoff-closure-main | local-fix | 1 -> 1 | flat | no_evidence | theory-20260718-services-composite-owner-terminal-alignment | diff:solve/changes/formation-priority-spread-authoritative-handoff-closure/attempt-3.diff.json |
| 2026-07-18T00:26:27.042Z | formation-priority-spread-authoritative-handoff-closure-main | local-fix | 1 -> 1 | flat | no_evidence | theory-20260718-services-composite-owner-terminal-alignment | diff:solve/changes/formation-priority-spread-authoritative-handoff-closure/attempt-4.diff.json |
| 2026-07-18T00:27:29.777Z | formation-priority-spread-authoritative-handoff-closure-main | widen-scope | 1 -> 1 | flat | no_evidence | theory-20260718-services-composite-owner-terminal-alignment | diff:solve/changes/formation-priority-spread-authoritative-handoff-closure/attempt-5.diff.json |
| 2026-07-18T00:38:09.590Z | formation-priority-spread-authoritative-handoff-closure-main | model | 1 -> 1 | flat | no_evidence | theory-20260718-services-composite-owner-terminal-alignment | diff:solve/changes/formation-priority-spread-authoritative-handoff-closure/attempt-6.diff.json |
| 2026-07-18T00:44:17.973Z | formation-priority-spread-authoritative-handoff-closure-main | change-approach | 1 -> 1 | flat | no_evidence | theory-20260718-services-composite-owner-terminal-alignment | diff:solve/changes/formation-priority-spread-authoritative-handoff-closure/attempt-7.diff.json |
