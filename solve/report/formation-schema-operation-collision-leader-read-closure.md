# Solve report: formation-schema-operation-collision-leader-read-closure

**Goal:** The unchanged movielens-lagrange-service-affinity-live scenario reports priority metric 0 on one fresh run, and every zero-change deterministic replica-operation INSERT collision is accepted only after the canonical replica_operations partition leader confirms the matching durable row, with leader-pin intent preserved through the control-plane gateway.

**Class:** product · **Closure:** MEASURED

**Outcome:** IN PROGRESS (no terminal recorded)

**Attempts:** 4

## Links
- spec: solve/epics/service-data-affinity-placement.md
- parent quest: formation-background-release-owner-closure
- plan: solve/epics/topology-convergence-hardening.md

## Current Blocker
- Frontier: formation-schema-operation-collision-leader-read-closure-main
- Owner: unknown
- Boundary: unknown
- Dominant reason: unknown
- Mechanism: transition_gap
- Movement: same blocker remains: FAIL
- Latest evidence: test-output/reports/movielens-lagrange-service-affinity-live-2026-07-18T07-27-39-737Z.report.json
- Selected theory: theory-20260718-a-stored-multi-table-readiness-snapshot (stale: selected theory status is falsified)
- Next move: record or select a fresh frontier theory for formation-schema-operation-collision-leader-read-closure-main

## Continuation
- Status: blocked-theory
- Next action: record and select frontier theory for formation-schema-operation-collision-leader-read-closure-main with npm run model:contracts as discriminator
- Blocker: frontier theory required for formation-schema-operation-collision-leader-read-closure-main
- Blocker: selected theory stale: selected theory status is falsified

## Scope Pressure
- Changed files: 10
- Change bytes: 23171
- Owner areas: src/control-plane, src/rebalancer, test/control-plane, test/rebalancer
- Categories: runtime, test
- Action: land or separate 4 owner areas: src/control-plane, src/rebalancer, test/control-plane, test/rebalancer
- Split plan:
  - test/control-plane: 4 file(s)
  - src/control-plane: 3 file(s)
  - src/rebalancer: 2 file(s)
  - test/rebalancer: 1 file(s)
- Signal: broad-source-scope severity=medium

## Frontiers
- **formation-schema-operation-collision-leader-read-closure-main** [open] rung 3, attempts 4, metric 1 -> 1

## Findings
- **formation-schema-operation-collision-leader-read-closure-main**: DT red-on-revert proven for test/rebalancer/replica-operation-repository.test.js [dt:solve/changes/dt-prove/replica-operation-repository.test.js-2026-07-18T03-05-07-174Z.json]
- **formation-schema-operation-collision-leader-read-closure-main**: DT red-on-revert proven for test/control-plane/control-plane-system-table-gateway.test.js [dt:solve/changes/dt-prove/control-plane-system-table-gateway.test.js-2026-07-18T03-05-10-955Z.json]
- **formation-schema-operation-collision-leader-read-closure-main**: Fresh live attribution isolates a false-negative collision confirmation: the deterministic schema operation INSERT was fetched from replica_operations-p1-r1, later OR-IGNORE returned zero changes, but collision verification used OWNER_RPC_REQUIRED without leader pinning. The repository then dropped preferOwnerRpcReadLeader in queryAuthoritativeOperationById and the gateway dropped it again before CDC owner-RPC execution, so a lagging co-located owner could report the durable row missing. [data/examples/service-data-affinity-demo/node-0.log]
- **formation-schema-operation-collision-leader-read-closure-main**: Two independent aggregate red-on-revert proofs pass: repository collision caller plus read-option forwarding is GREEN/RED/GREEN, and gateway leader-pin preservation is GREEN/RED/GREEN; the existing owner-RPC execution test proves the preserved flag maps to executeOnPartition preferLeader=true while the default remains false. [dt:solve/changes/dt-prove/replica-operation-repository.test.js-2026-07-18T03-05-07-174Z.json]
- **formation-schema-operation-collision-leader-read-closure-main**: Independent verification rejected exact attempt 1: the gateway read single-flight identity omits preferOwnerRpcReadLeader, so a concurrent generic operation read can absorb a leader-pinned collision confirmation and reproduce the false missing-row failure; replacement must bind explicit and implicit read coalescing to the leader-pin authority requirement. [subagent:formation_barrier_verifier]
- **formation-schema-operation-collision-leader-read-closure-main**: DT red-on-revert proven for test/control-plane/control-plane-system-table-gateway.test.js [dt:solve/changes/dt-prove/control-plane-system-table-gateway.test.js-2026-07-18T03-20-53-563Z.json]
- **formation-schema-operation-collision-leader-read-closure-main**: DT red-on-revert proven for test/control-plane/control-plane-system-table-gateway.test.js [dt:solve/changes/dt-prove/control-plane-system-table-gateway.test.js-2026-07-18T03-24-23-121Z.json]
- **formation-schema-operation-collision-leader-read-closure-main**: Independent verification passed: cumulative leader-pinned collision confirmation and routing-aware read coalescing remain fail-closed through the real REPLACE path [subagent:formation_barrier_verifier]
- **formation-schema-operation-collision-leader-read-closure-main**: Checkpoint rejected approved attempt 2 because the new concurrency regression pushed control-plane-system-table-gateway.test.js over the 1500-line test ratchet; replacement must preserve the same behavior in a bounded registered test-case module. [command:node-scripts-solve-checkpoint]
- **formation-schema-operation-collision-leader-read-closure-main**: DT red-on-revert proven for test/control-plane/control-plane-system-table-gateway.test.js [dt:solve/changes/dt-prove/control-plane-system-table-gateway.test.js-2026-07-18T03-35-02-477Z.json]
- **formation-schema-operation-collision-leader-read-closure-main**: Independent verification approved the exact cumulative attempt-3 leader-pinned collision and routing-aware coalescing artifact, including its bounded registered concurrency regression [subagent:formation_barrier_verifier]
- **formation-schema-operation-collision-leader-read-closure-main**: Ingested evidence from movielens-lagrange-service-affinity-live-2026-07-18T06-51-59-091Z.report.json. Metric: 1 -> 1. Verdict: FAIL. Root cause: none. Dominant reason: none. Owner: none. Ingestion outcome: changed. [test-output/reports/movielens-lagrange-service-affinity-live-2026-07-18T06-51-59-091Z.report.json]
- **formation-schema-operation-collision-leader-read-closure-main**: Ingested evidence from movielens-lagrange-service-affinity-live-2026-07-18T06-51-59-091Z.report.json. Metric: 1 -> 1. Verdict: FAIL. Root cause: none. Dominant reason: none. Owner: none. Ingestion outcome: changed. [test-output/reports/movielens-lagrange-service-affinity-live-2026-07-18T06-51-59-091Z.report.json]
- **formation-schema-operation-collision-leader-read-closure-main**: Fresh live evidence moved the first blocker beyond schema operation collision: formation admitted quiescent with zero spread gaps, all joiners crossed the ledger barrier and signaled ready, but ordinary service placement remained at one of two replicas because joiner repairEligible stayed false despite repeated authoritative node/service/partition cache repair. [test-output/reports/movielens-lagrange-service-affinity-live-2026-07-18T06-51-59-091Z.report.json]
- **formation-schema-operation-collision-leader-read-closure-main**: The readiness reuse predicate ignores node/service invalidation whenever the visible node heartbeat watermark is older than the stored snapshot; therefore an independently fresher service repair cannot rebuild repairEligible while node-row CDC lags, coupling unrelated table revisions and preserving a stale false placement gate. [source:src/control-plane/control-plane-readiness-snapshot-store.js]
- **formation-schema-operation-collision-leader-read-closure-main**: The core-system-logic model remains the governing ownership invariant but is not a discriminating executable model for this intervention: it names the readiness snapshot store and per-node invalidation boundary at low resolution, while its known residual explicitly delegates subsystem revision-ordering details to focused tests; model:contracts is also excluded because it rewrites the protected user-owned active-gate model report. [architecture/contracts/core-system-logic.md]
- **formation-schema-operation-collision-leader-read-closure-main**: DT red-on-revert proven for test/control-plane/readiness-per-change-reuse.test.js [dt:solve/changes/dt-prove/readiness-per-change-reuse.test.js-2026-07-18T07-11-39-597Z.json]
- **formation-schema-operation-collision-leader-read-closure-main**: Independent verification approved exact Attempt 4 mixed-revision readiness invalidation artifact, including regressed-node service/publication invalidation, node-only bridge preservation, numeric marker compatibility, equal-time TOCTOU retention, 220 supporting assertions, and red-on-revert proof. [subagent:formation_barrier_verifier]
- **formation-schema-operation-collision-leader-read-closure-main**: Independent verification approved exact Attempt 4 after attempt recording; service/publication invalidation defeats regressed-row reuse, node-only bridging remains, focused/supporting tests and red-on-revert proof pass. [subagent:formation_barrier_verifier]
- **formation-schema-operation-collision-leader-read-closure-main**: Ingested evidence from movielens-lagrange-service-affinity-live-2026-07-18T07-27-39-737Z.report.json. Metric: 1 -> 1. Verdict: FAIL. Root cause: none. Dominant reason: none. Owner: none. Ingestion outcome: changed. [test-output/reports/movielens-lagrange-service-affinity-live-2026-07-18T07-27-39-737Z.report.json]
- **formation-schema-operation-collision-leader-read-closure-main**: Ingested evidence from movielens-lagrange-service-affinity-live-2026-07-18T07-27-39-737Z.report.json. Metric: 1 -> 1. Verdict: FAIL. Root cause: none. Dominant reason: none. Owner: none. Ingestion outcome: changed. [test-output/reports/movielens-lagrange-service-affinity-live-2026-07-18T07-27-39-737Z.report.json]

## Theories
- **theory-20260718-the-read-model-snapshot-owner-collapses** [active] system, mechanism The read-model snapshot owner collapses node, service, partition, and publication evidence into one snapshot but uses only the node heartbeat watermark to arbitrate reuse; when that row regresses, a later service invalidation is ignored and stale repairEligible=false survives repeated authoritative repair., owner read_model_contract_owner, modelGate npm run model:contracts
- **theory-20260718-the-approved-concurrency-behavior-is-correct** [falsified] frontier, frontier formation-schema-operation-collision-leader-read-closure-main, layer observation, mechanism The approved concurrency behavior is correct, but its regression was placed in a nearly full aggregate test file; registering the same test from a bounded sibling test-case module preserves execution while restoring the file-size contract., owner control_plane_gateway_test_registration, boundary source_attempt_checkpoint, modelGate npm run model:contracts
- **theory-20260718-a-stored-multi-table-readiness-snapshot** [falsified] frontier, frontier formation-schema-operation-collision-leader-read-closure-main, layer observation, mechanism A stored multi-table readiness snapshot with repairEligible=false is retained when the visible node row regresses, because getFresherStoredReadinessSnapshot checks node/service invalidation only on equal node watermarks; authoritative service repair invalidates the target but the older node watermark suppresses that independent revision., modelGate npm run model:contracts

## Selected Theories
- **formation-schema-operation-collision-leader-read-closure-main**: theory-20260718-a-stored-multi-table-readiness-snapshot

## Theory Results
- **theory-20260718-the-approved-concurrency-behavior-is-correct**: falsified (scenario=failed, theory=falsified, movement=no_evidence) [test-output/reports/movielens-lagrange-service-affinity-live-2026-07-18T02-52-56-530Z.report.json]
- **theory-20260718-the-approved-concurrency-behavior-is-correct**: falsified (scenario=failed, theory=falsified, movement=no_previous) [test-output/reports/movielens-lagrange-service-affinity-live-2026-07-18T06-51-59-091Z.report.json]
- **theory-20260718-a-stored-multi-table-readiness-snapshot**: supported (scenario=failed, theory=supported, movement=no_previous) [test-output/reports/movielens-lagrange-service-affinity-live-2026-07-18T06-51-59-091Z.report.json]
- **theory-20260718-a-stored-multi-table-readiness-snapshot**: falsified (scenario=failed, theory=falsified, movement=same) [test-output/reports/movielens-lagrange-service-affinity-live-2026-07-18T07-27-39-737Z.report.json]

## Attempt log
| ts | frontier | rung | metric | result | blocker movement | theory | change |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 2026-07-18T03:07:16.831Z | formation-schema-operation-collision-leader-read-closure-main | observe | 1 -> 1 | flat | no_evidence |  | diff:solve/changes/formation-schema-operation-collision-leader-read-closure/attempt-1.diff |
| 2026-07-18T03:26:11.676Z | formation-schema-operation-collision-leader-read-closure-main | local-fix | 1 -> 1 | flat | no_evidence |  | diff:solve/changes/formation-schema-operation-collision-leader-read-closure/attempt-2.diff |
| 2026-07-18T06:31:16.976Z | formation-schema-operation-collision-leader-read-closure-main | widen-scope | 1 -> 1 | flat | no_evidence | theory-20260718-the-approved-concurrency-behavior-is-correct | diff:solve/changes/formation-schema-operation-collision-leader-read-closure/attempt-3.diff |
| 2026-07-18T07:22:12.213Z | formation-schema-operation-collision-leader-read-closure-main | model | 1 -> 1 | flat | no_previous | theory-20260718-a-stored-multi-table-readiness-snapshot | diff:solve/changes/formation-schema-operation-collision-leader-read-closure/attempt-4.diff |
