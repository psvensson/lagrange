# Solve report: formation-priority-spread-authoritative-publication-closure

**Goal:** Cold five-node formation reaches schema-admission quiescence within the unchanged 180000ms budget and 60000ms stability window because the priority control-plane partitions (including the replica_operations ledger) reach their spread targets without paying the serialized exclusive ledger self-move cost class measured at 85-110s: replicas of priority partitions are placed or cured such that no schema-admission-blocking window carries back-to-back exclusive ledger self-moves, while the ledger interlock's exclusivity during any live self-move, quorum and voter safety, remove-safety authorities, and the sealed live scenario semantics all remain byte-unchanged.

**Class:** product · **Closure:** MEASURED

**Outcome:** IN PROGRESS (no terminal recorded)

**Attempts:** 5

## Links
- spec: solve/epics/service-data-affinity-placement.md
- parent quest: formation-priority-spread-authoritative-handoff-closure
- plan: solve/epics/topology-convergence-hardening.md

## Current Blocker
- Frontier: formation-priority-spread-authoritative-publication-closure-main
- Owner: unknown
- Boundary: unknown
- Dominant reason: unknown
- Mechanism: transition_gap
- Movement: same blocker remains: FAIL
- Latest evidence: test-output/reports/movielens-lagrange-service-affinity-live-2026-07-18T01-55-19-235Z.report.json
- Selected theory: theory-20260718-priority-placement-ready-quiescence-handoff
- Next move: continue supervised step for formation-priority-spread-authoritative-publication-closure-main

## Continuation
- Status: allowed
- Next action: continue formation-priority-spread-authoritative-publication-closure-main with modelRef or modelNotApplicable evidence
- Blocker: none

## Scope Pressure
- Changed files: 9
- Change bytes: 51897
- Owner areas: src/control-plane, src/rebalancer, test/cache, test/cdc, test/convergence, test/rebalancer
- Categories: runtime, test
- Action: land or separate 6 owner areas: src/control-plane, src/rebalancer, test/cache, test/cdc, test/convergence, test/rebalancer
- Split plan:
  - src/rebalancer: 3 file(s)
  - src/control-plane: 2 file(s)
  - test/cache: 1 file(s)
  - test/cdc: 1 file(s)
  - test/convergence: 1 file(s)
  - test/rebalancer: 1 file(s)
- Signal: broad-source-scope severity=medium

## Frontiers
- **formation-priority-spread-authoritative-publication-closure-main** [open] rung 3, attempts 5, metric 1 -> 1

## Findings
- **formation-priority-spread-authoritative-publication-closure-main**: Independent verification rejected attempt 1: a caller equality override could bypass canonical full-row comparison for a valid complete-table receipt, leave durable cache divergence untouched, and still publish the authoritative observation watermark. [subagent:formation_barrier_verifier]
- **formation-priority-spread-authoritative-publication-closure-main**: DT red-on-revert proven for test/convergence/dt6-authoritative-observation-watermark.test.js [dt:solve/changes/dt-prove/dt6-authoritative-observation-watermark.test.js-2026-07-18T00-53-54-028Z.json]
- **formation-priority-spread-authoritative-publication-closure-main**: Independent verification passed replacement attempt 2: complete observations force canonical durable-row equality, the prior comparator bypass repairs before watermark publication, non-observation comparators remain scoped, and stale/tombstone/local-evidence/production behavior remains correct. [subagent:formation_barrier_verifier]
- **formation-priority-spread-authoritative-publication-closure-main**: Ingested evidence from movielens-lagrange-service-affinity-live-2026-07-18T01-03-24-593Z.report.json. Metric: 1 -> 1. Verdict: FAIL. Root cause: none. Dominant reason: none. Owner: none. Ingestion outcome: changed. [test-output/reports/movielens-lagrange-service-affinity-live-2026-07-18T01-03-24-593Z.report.json]
- **formation-priority-spread-authoritative-publication-closure-main**: Fresh sealed MovieLens run reproduces on current source fingerprint 5539122d3d120bd5: schema admission times out with cache_stale_watermark because all four active connected joiners still have null ready leases behind the formation barrier; the prior control_plane_publications created_at divergence is absent. [test-output/reports/movielens-lagrange-service-affinity-live-2026-07-18T01-03-24-593Z.report.json]
- **formation-priority-spread-authoritative-publication-closure-main**: After the first replica_operations REPLACE terminalized and ledger leadership moved to node 5acb51ed, the real planner repeatedly produced the second spread cure but pre-execution rejected its active connected startup-authority target as node_not_ready/repair_ineligible. The branch evaluates startup-authority pre-ready eligibility only when controlPlaneRecoveryEligible is false; explicit true falls through to strict ready-lease validation, creating a cycle because the join barrier withholds that lease until spread completes. [data/examples/service-data-affinity-demo-archive/quest-live-authoritative-publication-cache-stale-2026-07-18T01-03-24Z.tar.gz]
- **formation-priority-spread-authoritative-publication-closure-main**: DT red-on-revert proven for test/rebalancer/startup-authority-available-node-contract.test.js [dt:solve/changes/dt-prove/startup-authority-available-node-contract.test.js-2026-07-18T01-17-59-156Z.json]
- **formation-priority-spread-authoritative-publication-closure-main**: Ingested evidence from movielens-lagrange-service-affinity-live-2026-07-18T01-03-24-593Z.report.json. Metric: 1 -> 1. Verdict: FAIL. Root cause: none. Dominant reason: none. Owner: none. Ingestion outcome: changed. [test-output/reports/movielens-lagrange-service-affinity-live-2026-07-18T01-03-24-593Z.report.json]
- **formation-priority-spread-authoritative-publication-closure-main**: DT red-on-revert proven for test/rebalancer/startup-authority-available-node-contract.test.js [dt:solve/changes/dt-prove/startup-authority-available-node-contract.test.js-2026-07-18T01-20-46-465Z.json]
- **formation-priority-spread-authoritative-publication-closure-main**: DT red-on-revert proven for test/rebalancer/startup-authority-available-node-contract.test.js [dt:solve/changes/dt-prove/startup-authority-available-node-contract.test.js-2026-07-18T01-20-55-393Z.json]
- **formation-priority-spread-authoritative-publication-closure-main**: Independent verification rejected the first readiness-inversion patch because the rebalancer accepted retained canonical startup node ids even when authorityAvailable was explicitly false, allowing pre-ready placement from an unavailable authority. [subagent:formation_barrier_verifier]
- **formation-priority-spread-authoritative-publication-closure-main**: Independent re-verification approves the corrected readiness-inversion scope: startup-authority placement remains available across the recovery-dimension handoff only while authorityAvailable is true; retained ids fail closed when authority is unavailable; priority, remote-only, ACTIVE/CONNECTED, transport, outbound, ping, ordinary-partition, and public-lease boundaries remain intact; 186 focused assertions pass and both source mechanisms are red-on-revert. [subagent:formation_barrier_verifier]
- **formation-priority-spread-authoritative-publication-closure-main**: Ingested evidence from movielens-lagrange-service-affinity-live-2026-07-18T01-35-47-131Z.report.json. Metric: 1 -> 1. Verdict: FAIL. Root cause: none. Dominant reason: none. Owner: none. Ingestion outcome: changed. [test-output/reports/movielens-lagrange-service-affinity-live-2026-07-18T01-35-47-131Z.report.json]
- **formation-priority-spread-authoritative-publication-closure-main**: Independent exact-attempt verification rejected sha256:cfeca4c614172d3090b80536b656907a3b73c438eaab3399b24370fc5634b3f5 because the artifact renames filterReplicasRetiredByTerminalReplaceOperations but omits the reachable caller migration in unified-rebalancer-follow-up-decision.js; the ambient workspace masks the undefined-method defect. [subagent:formation_barrier_verifier]
- **formation-priority-spread-authoritative-publication-closure-main**: Fresh sealed run 01:35:47 proves the readiness-dimension fix removed the prior circular blocker: schema admission sees ready=true, zero total and priority spread gap, zero missing leaders, zero effective in-flight operations, no pressure signals, no canonical blocker, and no candidate reset; failure is now solely late entry into the unchanged stability window at 20,814ms of 60,000ms. [test-output/reports/movielens-lagrange-service-affinity-live-2026-07-18T01-35-47-131Z.report.json]
- **formation-priority-spread-authoritative-publication-closure-main**: The final priority operation work terminalizes before the clean placement observation, but the seed continues to report status_syncing for sql_transaction_participants and sql_transactions until 01:35:17.557Z and first enters stabilizing at 01:35:18.146Z. Projecting terminal operations into admission observation could recover only the post-terminal visibility lag and cannot supply the roughly 39,186ms still missing from the sealed 60,000ms window; the safe lever is to execute the unavoidable priority placement work before public all-ACTIVE visibility. (rules out: post-terminal observation projection as the sole budget-closing mechanism) [data/examples/service-data-affinity-demo/node-0.log]
- **formation-priority-spread-authoritative-publication-closure-main**: Independent exact-attempt verification rejected sha256:8ea43e8d43e2319b56e83dd1cb49dd6371c6db44ef75d3c9897e4712ff3d6edc: the corrected caller is present, but the artifact imports the new startup-authority-placement-eligibility.js module without including that base-absent module, so base plus artifact fails module resolution while the ambient workspace masks the omission. [subagent:formation_barrier_verifier]
- **formation-priority-spread-authoritative-publication-closure-main**: Independent exact verification approves Attempt 5: the five-file base-relative artifact includes the shared startup-authority module and every renamed caller, resolves without ambient source, preserves priority-only and fail-closed authority/readiness/transport boundaries, and passes 838 assertions across 261 suites. [subagent:formation_barrier_verifier]
- **formation-priority-spread-authoritative-publication-closure-main**: Ingested evidence from movielens-lagrange-service-affinity-live-2026-07-18T01-35-47-131Z.report.json. Metric: 1 -> 1. Verdict: FAIL. Root cause: none. Dominant reason: none. Owner: none. Ingestion outcome: changed. [test-output/reports/movielens-lagrange-service-affinity-live-2026-07-18T01-35-47-131Z.report.json]
- **formation-priority-spread-authoritative-publication-closure-main**: Ingested evidence from movielens-lagrange-service-affinity-live-2026-07-18T01-55-19-235Z.report.json. Metric: 1 -> 1. Verdict: FAIL. Root cause: none. Dominant reason: none. Owner: none. Ingestion outcome: changed. [test-output/reports/movielens-lagrange-service-affinity-live-2026-07-18T01-55-19-235Z.report.json]
- **formation-priority-spread-authoritative-publication-closure-main**: Ingested evidence from movielens-lagrange-service-affinity-live-2026-07-18T01-55-19-235Z.report.json. Metric: 1 -> 1. Verdict: FAIL. Root cause: none. Dominant reason: none. Owner: none. Ingestion outcome: changed. [test-output/reports/movielens-lagrange-service-affinity-live-2026-07-18T01-55-19-235Z.report.json]
- **formation-priority-spread-authoritative-publication-closure-main**: Fresh post-checkpoint run localizes the four final blockers to ordinary non-priority REPLACEs for module_dependency_locks-p1, service_definitions-p1, service_timers-p1, and config-p1. Priority topology was already ready with zero gap. The background release tracker started its 60000ms clock at 01:53:50.498 and created ordinary work at 01:54:51.919, leaving the equally long but stricter schema-admission candidate no guaranteed observation turn. This is a competing-clock ownership defect, not a priority spread or stale-watermark regression. [data/examples/service-data-affinity-demo/node-0.log]

## Theories
- **theory-20260718-formation-quiescence-handoff-order** [active] system, mechanism public_active_and_background_release_are_independent_of_formation_quiescence_handoff, owner join readiness publication owner plus background priority-spread release owner, modelGate npm run model:contracts
- **theory-20260718-complete-authoritative-cache-row-exact-replace** [falsified] frontier, frontier formation-priority-spread-authoritative-publication-closure-main, layer observation, mechanism complete_authoritative_cache_row_exact_replace, owner ControlPlaneSystemTableGateway_and_SystemTableCache, boundary complete_authoritative_observation_to_observed_cache, modelGate npm run model:contracts
- **theory-20260718-startup-authority-readiness-dimension-inversion** [falsified] frontier, frontier formation-priority-spread-authoritative-publication-closure-main, layer ownership, mechanism startup_authority_readiness_dimension_inversion, owner UnifiedRebalancerReplicaState, boundary startup_authority_priority_placement_eligibility_to_public_ready_lease_policy, modelGate npm run model:contracts
- **theory-20260718-priority-placement-ready-quiescence-handoff** [active] frontier, frontier formation-priority-spread-authoritative-publication-closure-main, layer ownership, mechanism priority_placement_ready_quiescence_handoff, owner join readiness publication owner and background priority-spread release owner, boundary membership-written to public ACTIVE to ordinary placement release, modelGate npm run model:contracts

## Selected Theories
- **formation-priority-spread-authoritative-publication-closure-main**: theory-20260718-priority-placement-ready-quiescence-handoff

## Theory Results
- **theory-20260718-complete-authoritative-cache-row-exact-replace**: supported (scenario=failed, theory=supported, movement=no_evidence) [test-output/reports/movielens-lagrange-service-affinity-live-2026-07-17T23-34-41-192Z.report.json]
- **theory-20260718-complete-authoritative-cache-row-exact-replace**: supported (scenario=failed, theory=supported, movement=no_evidence) [test-output/reports/movielens-lagrange-service-affinity-live-2026-07-17T23-34-41-192Z.report.json]
- **theory-20260718-complete-authoritative-cache-row-exact-replace**: falsified (scenario=failed, theory=falsified, movement=no_previous) [test-output/reports/movielens-lagrange-service-affinity-live-2026-07-18T01-03-24-593Z.report.json]
- **theory-20260718-startup-authority-readiness-dimension-inversion**: supported (scenario=failed, theory=supported, movement=no_previous) [test-output/reports/movielens-lagrange-service-affinity-live-2026-07-18T01-35-47-131Z.report.json]
- **theory-20260718-startup-authority-readiness-dimension-inversion**: supported (scenario=failed, theory=supported, movement=no_previous) [test-output/reports/movielens-lagrange-service-affinity-live-2026-07-18T01-35-47-131Z.report.json]
- **theory-20260718-startup-authority-readiness-dimension-inversion**: supported (scenario=failed, theory=supported, movement=no_previous) [test-output/reports/movielens-lagrange-service-affinity-live-2026-07-18T01-35-47-131Z.report.json]
- **theory-20260718-startup-authority-readiness-dimension-inversion**: falsified (scenario=failed, theory=falsified, movement=same) [test-output/reports/movielens-lagrange-service-affinity-live-2026-07-18T01-55-19-235Z.report.json]

## Attempt log
| ts | frontier | rung | metric | result | blocker movement | theory | change |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 2026-07-18T00:48:36.827Z | formation-priority-spread-authoritative-publication-closure-main | observe | 1 -> 1 | flat | no_evidence | theory-20260718-complete-authoritative-cache-row-exact-replace | diff:solve/changes/formation-priority-spread-authoritative-publication-closure/attempt-1.diff |
| 2026-07-18T00:54:28.007Z | formation-priority-spread-authoritative-publication-closure-main | observe | 1 -> 1 | flat | no_evidence | theory-20260718-complete-authoritative-cache-row-exact-replace | diff:solve/changes/formation-priority-spread-authoritative-publication-closure/attempt-2.diff |
| 2026-07-18T01:36:11.487Z | formation-priority-spread-authoritative-publication-closure-main | local-fix | 1 -> 1 | flat | no_previous | theory-20260718-startup-authority-readiness-dimension-inversion | diff:solve/changes/formation-priority-spread-authoritative-publication-closure/attempt-3.diff |
| 2026-07-18T01:45:04.611Z | formation-priority-spread-authoritative-publication-closure-main | local-fix | 1 -> 1 | flat | no_previous | theory-20260718-startup-authority-readiness-dimension-inversion | diff:solve/changes/formation-priority-spread-authoritative-publication-closure/attempt-4.diff |
| 2026-07-18T01:48:29.688Z | formation-priority-spread-authoritative-publication-closure-main | widen-scope | 1 -> 1 | flat | no_previous | theory-20260718-startup-authority-readiness-dimension-inversion | diff:solve/changes/formation-priority-spread-authoritative-publication-closure/attempt-5.diff |
