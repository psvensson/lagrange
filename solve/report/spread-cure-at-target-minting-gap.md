# Solve report: spread-cure-at-target-minting-gap

**Goal:** A priority control-plane partition observed at target replica count with co-located replicas (distinct-node spread gap), at least one free active node, and an UNAVAILABLE authoritative inventory read receives a cure-typed spread-restoring move from the planner within one evaluation cycle even when no natural REPLACE pairing exists and when accounting rows lag a just-completed surplus drain; the topology guard's conservative-union escape admits that move under its existing provenance preconditions; and a planner evaluation that declines cure minting while a priority spread gap is open emits one typed composite-state diagnostic naming the failed precondition instead of emitting an untyped spread ADD silently.

**Class:** product · **Closure:** MEASURED

**Outcome:** SOLVED (MEASURED) — evidence: test-output/reports/spread-cure-at-target-minting-gap-2026-07-19T08-53-05-143Z.report.json

**Attempts:** 2

## Links
- spec: solve/epics/formation-complexity-consolidation.md

## Scope Pressure
- Changed files: 2
- Change bytes: 3166
- Owner areas: src/rebalancer
- Categories: runtime
- Split plan:
  - src/rebalancer: 2 file(s)
- Signals: none

## Frontiers
- **spread-cure-at-target-minting-gap-main** [solved] rung 2, attempts 2, metric 0 -> 0

## Findings
- **spread-cure-at-target-minting-gap-main**: Live run 2026-07-19T07-22-01: after the surplus drain COMPLETED (REMOVE c98831ba done 07:18:57, over-target window only 36s), the partition sat at target 3 replicas on 2 distinct nodes with authoritative inventory UNAVAILABLE — the sealed spread-cure scenario — for 3 minutes to timeout. The planner minted spread ADDs typed plain spread_replicas because classifyPriorityExpandForSpreadCureCondition requires naturalReplaceCount>=1 (no natural REPLACE candidate exists post-drain at exact target) plus five exact count equalities (occupied/deficit/voter/active === target; lagging accounting rows can break these), so the cure declined SILENTLY in its own target state; the topology guard denied every untyped ADD replica_inventory_unusable and the conservative-union escape ignores non-cure moves. Same failure shape as TiKV PD issue 6559 (exact-state escape rule missing a neighboring composite state; see solve/artifacts/priority-spread-peer-research/). [test-output/reports/movielens-lagrange-service-affinity-live-2026-07-19T07-22-01-510Z.report.json]
- **spread-cure-at-target-minting-gap-main**: Deterministic repro landed (test/rebalancer/spread-cure-at-target-minting-gap.test.js, uncommitted): clean [A,A,B]+authoritative-unavailable passes on HEAD, as do lingering-REMOVE-row and unrelated-entity-op residue cases; a NON-TERMINAL DRAIN-PHASE REPLACE row (creation complete, workflow REMOVING_SOURCE, status active) goes RED — the planner emits NO moves because the priority-recovery planning gate lands in topology_settling_blocked. The settling gate has ordered blocker rows (node lease, transitional membership, transport, endpoint visibility, TOPOLOGY_OPERATIONS_IN_FLIGHT); the in-flight row counts ALL non-terminal entity ops with no add-transitional (creation vs drain) distinction — unified-rebalancer-critical-topology-methods.js buildInFlightTopologyBlocker — so a slow drain blocks critical planning for its whole duration (live node 0b5f). The guard-side escape defeat that denied node f39e's plain ADDs (replica_inventory_unusable at 07:20-07:21) is NOT yet reproduced in-process; candidate mechanism is the escape's blanket topology-increasing check (rebalance-coordinator-topology-guard-methods.js:296-297) which also ignores addTransitional phase. Fix direction for both seams: creation-phase-only blocking via the inventory's existing addTransitional typing. Mock harness gap: test helpers provide no endpoint visibility, so the endpoint row fires before the in-flight row; faithful RED needs endpoint mocks or direct in-flight-row assertion. [test/rebalancer/spread-cure-at-target-minting-gap.test.js]
- **spread-cure-at-target-minting-gap-main**: Guard-level deterministic RED landed: driving coordinator.createOperation directly with a spread-typed ADD for at-target [A,A,B] + draining REPLACE row + authoritative-services-unavailable + ops observation surfacing the row is DENIED by ensureCriticalPartitionCreateLaneAvailable (rebalance-coordinator-priority-budget-admission.js:112-179) — 'already has an add-like operation in flight'. The critical create lane counts the drain-phase REPLACE as a conflicting add-like workflow with no creation-vs-drain distinction (isConcurrentAddBudgetOperation; escape hatch exists via priority-recovery decision snapshots but does not cover this composite state). THREE phase-blind seams now mapped, all fixable with the inventory's existing addTransitional typing: (1) critical create lane (this RED), (2) topology-settling gate's buildInFlightTopologyBlocker (planner RED, endpoint-mock caveat), (3) union escape's blanket topology-increasing check (topology-guard-methods.js:296-297, suspected live denier, not yet isolated in-process). Repro file test/rebalancer/spread-cure-at-target-minting-gap.test.js (uncommitted): 3 green cases + 2 red anchors. [test/rebalancer/spread-cure-at-target-minting-gap.test.js]
- **spread-cure-at-target-minting-gap-main**: Adversarial subagent verification CONFIRMED-SAFE (evidence subagent:verifier-2026-07-19): addTransitional is stamped on every union inventory operation; for ADD non-terminal is equivalent to transitional so no creation can slip the narrowed escape; for REPLACE the only non-terminal non-transitional steps are the drain phase (ACTIVE/STOPPING), whose add-like admission is independently blocked by ensureEntityAddLikeCreateLaneAvailable ordered BEFORE the topology guard on the single production call path; the one-cure-per-tick re-block survives (admitted cure mints a PENDING transitional row); occupied/target-count decision rows run independently of the escape; the narrowing is scoped to the escape alone (countedDistinctNodeIds still counts terminal targets, conservative); the planner change is log-only and crash-safe. RED-check: stashing the guard fix makes the new test fail 4 ways, restoring returns green. Residual risks recorded: lane-before-guard ordering coupling for future callers, blank-workflow-field schema drift, injected inventory builders omitting addTransitional. Proofs: quest scenario 6/6 x3 consecutive, sibling sealed suite 10/10, stall repro 6/6. [test-output/reports/spread-cure-at-target-minting-gap-2026-07-19T08-26-44-251Z.report.json]
- **spread-cure-at-target-minting-gap-main**: Live fix-run 2026-07-19T08-49-05: SCHEMA ADMISSION PASSED (mutation admitted after stable control snapshots, state=quiescent) — the gate both same-morning clean-HEAD controls failed (07-14-01 in-flight drain; 07-22-01 the cured critical-spread denial storm). The cured wedge signature is ABSENT: all 252 replica_inventory_unusable denials in this run coincide with genuinely in-flight creation-phase operations (replicas stuck status_syncing; 'Replica creation already in progress' x17) — the escape correctly refusing to stack creations, not blocking a lone cure. The run failed DOWNSTREAM at ratings-partition split/spread: a managed split aborted on 'Distributed operation failed due to participant failures' (08:40:33) leaving priority partitions at 1 ready replica with syncing exclusions, deferring non-system rebalancing to the 600s timeout — a provisioning-liveness residual class (rotating residual lineage: initial service placement / formation timeout), out of this quest's sealed scope. Fix-run progressed strictly further than both controls. [test-output/reports/movielens-lagrange-service-affinity-live-2026-07-19T08-49-05-180Z.report.json]
- **spread-cure-at-target-minting-gap-main**: Ingested evidence from spread-cure-at-target-minting-gap-2026-07-19T08-26-44-251Z.report.json. Metric: unknown -> 0. Verdict: PASS. Root cause: none. Dominant reason: none. Owner: none. Ingestion outcome: changed. [test-output/reports/spread-cure-at-target-minting-gap-2026-07-19T08-26-44-251Z.report.json]
- **spread-cure-at-target-minting-gap-main**: Ingested evidence from spread-cure-at-target-minting-gap-2026-07-19T08-26-44-251Z.report.json. Metric: 0 -> 0. Verdict: PASS. Root cause: none. Dominant reason: none. Owner: none. Ingestion outcome: changed. [test-output/reports/spread-cure-at-target-minting-gap-2026-07-19T08-26-44-251Z.report.json]
- **spread-cure-at-target-minting-gap-main**: Ingested evidence from spread-cure-at-target-minting-gap-2026-07-19T08-31-18-177Z.report.json. Metric: 0 -> 0. Verdict: PASS. Root cause: none. Dominant reason: none. Owner: none. Ingestion outcome: changed. [test-output/reports/spread-cure-at-target-minting-gap-2026-07-19T08-31-18-177Z.report.json]
- **spread-cure-at-target-minting-gap-main**: Ingested evidence from spread-cure-at-target-minting-gap-2026-07-19T08-31-18-177Z.report.json. Metric: 0 -> 0. Verdict: PASS. Root cause: none. Dominant reason: none. Owner: none. Ingestion outcome: changed. [test-output/reports/spread-cure-at-target-minting-gap-2026-07-19T08-31-18-177Z.report.json]
- **spread-cure-at-target-minting-gap-main**: Ingested evidence from spread-cure-at-target-minting-gap-2026-07-19T08-53-05-143Z.report.json. Metric: 0 -> 0. Verdict: PASS. Root cause: none. Dominant reason: none. Owner: none. Ingestion outcome: changed. [test-output/reports/spread-cure-at-target-minting-gap-2026-07-19T08-53-05-143Z.report.json]
- **spread-cure-at-target-minting-gap-main**: Ingested evidence from spread-cure-at-target-minting-gap-2026-07-19T08-53-05-143Z.report.json. Metric: 0 -> 0. Verdict: PASS. Root cause: none. Dominant reason: none. Owner: none. Ingestion outcome: changed. [test-output/reports/spread-cure-at-target-minting-gap-2026-07-19T08-53-05-143Z.report.json]
- **spread-cure-at-target-minting-gap-main**: independent verification passed [subagent:a19daa7b3b69cf919]

## Theories
_(none recorded)_

## Selected Theories
_(none selected)_

## Theory Results
_(none recorded)_

## Attempt log
| ts | frontier | rung | metric | result | blocker movement | theory | change |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 2026-07-19T08:51:37.166Z | spread-cure-at-target-minting-gap-main | observe | 0 -> 0 | flat | solved |  | diff:solve/changes/spread-cure-at-target-minting-gap/attempt-2.diff |
| 2026-07-19T08:53:16.732Z | spread-cure-at-target-minting-gap-main | local-fix | 0 -> 0 | flat | solved |  | diff:solve/changes/spread-cure-at-target-minting-gap/attempt-3.diff |
