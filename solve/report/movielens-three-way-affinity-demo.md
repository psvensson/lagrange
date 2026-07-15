# Solve report: movielens-three-way-affinity-demo

**Goal:** One newcomer-facing MovieLens example replaces the callback and affinity-toggle demos with a single command and report comparing the same confidence-adjusted ranking through PostgreSQL grouped SQL, Lagrange distributed grouped SQL, and an always-data-affine replicated Lagrange service. Placement affinity engages whenever fresh service access evidence exists independently of read_locality; the service learns and reports its data-optimal placement without a public disable switch. All three paths emit identical ranked results, comparable steady-state transfer/latency metrics, explicit caveats, and the obsolete callback demo and orchestration are removed after their reusable dataset, loader, PostgreSQL, and cluster helpers move under the surviving example.

**Class:** product · **Closure:** MEASURED

**Outcome:** IN PROGRESS (no terminal recorded)

**Attempts:** 4

## Links
- parent quest: service-data-affinity-parallel-reduce-demo-live
- plan: solve/epics/service-data-affinity-placement.md

## Current Blocker
- Frontier: movielens-three-way-affinity-demo-main
- Owner: unknown
- Boundary: unknown
- Dominant reason: unknown
- Mechanism: transition_gap
- Movement: unknown: unknown -> FAIL
- Latest evidence: test-output/reports/movielens-lagrange-service-affinity-live-2026-07-15T19-20-14-034Z.report.json
- Selected theory: theory-load-after-full-formation-drain (stale: selected theory status is falsified)
- Next move: record or select a fresh frontier theory for movielens-three-way-affinity-demo-main
- No longer current: unknown

## Continuation
- Status: blocked-theory
- Next action: record and select frontier theory for movielens-three-way-affinity-demo-main with npm run model:contracts as discriminator
- Blocker: frontier theory required for movielens-three-way-affinity-demo-main
- Blocker: selected theory stale: selected theory status is falsified

## Scope Pressure
- Changed files: 10
- Change bytes: 85805
- Owner areas: examples, src/rebalancer, src/runtime, test/rebalancer
- Categories: other, runtime
- Action: land or separate 4 owner areas: examples, src/rebalancer, src/runtime, test/rebalancer
- Split plan:
  - examples: 4 file(s)
  - src/rebalancer: 3 file(s)
  - test/rebalancer: 2 file(s)
  - src/runtime: 1 file(s)
- Signal: broad-source-scope severity=medium

## Frontiers
- **movielens-three-way-affinity-demo-main** [open] rung 2, attempts 4, metric 1 -> 1

## Findings
- **movielens-three-way-affinity-demo-main**: Ingested evidence from movielens-lagrange-service-affinity-live-2026-07-11T19-31-44-570Z.report.json. Metric: 1 -> 1. Verdict: FAIL. Root cause: none. Dominant reason: none. Owner: none. Ingestion outcome: changed. [test-output/reports/movielens-lagrange-service-affinity-live-2026-07-11T19-31-44-570Z.report.json]
- **movielens-three-way-affinity-demo-main**: Independent verifier approved always-on affinity, shared confidence-adjusted ranking with movie-id tie-breaking, and unified demo wiring; live success remains unproven. [subagent:/root/affinity_parallel_reduce_verify]
- **movielens-three-way-affinity-demo-main**: The sealed live completion symptom still reproduces on HEAD: the second operation-ledger spread is not planned, so the three-way live proof remains incomplete. [test-output/reports/movielens-lagrange-service-affinity-live-2026-07-11T19-31-44-570Z.report.json]
- **movielens-three-way-affinity-demo-main**: Ingested evidence from movielens-three-way-affinity-demo-live-2026-07-11T19-58-38-986Z.report.json. Metric: 1 -> 1. Verdict: unknown. Root cause: none. Dominant reason: none. Owner: none. Ingestion outcome: changed. [test-output/reports/movielens-three-way-affinity-demo-live-2026-07-11T19-58-38-986Z.report.json]
- **movielens-three-way-affinity-demo-main**: Ingested evidence from movielens-three-way-affinity-demo-live-2026-07-11T19-58-38-986Z.report.json. Metric: 1 -> 1. Verdict: unknown. Root cause: none. Dominant reason: none. Owner: none. Ingestion outcome: changed. [test-output/reports/movielens-three-way-affinity-demo-live-2026-07-11T19-58-38-986Z.report.json]
- **movielens-three-way-affinity-demo-main**: Independent verifier approved ledger-cure ordering through the real move-limit slice and the saturated cleanup-only composition control. [subagent:/root/affinity_parallel_reduce_verify]
- **movielens-three-way-affinity-demo-main**: Ingested evidence from movielens-three-way-affinity-demo-live-2026-07-11T20-30-06-401Z.report.json. Metric: 1 -> 1. Verdict: unknown. Root cause: none. Dominant reason: none. Owner: none. Ingestion outcome: changed. [test-output/reports/movielens-three-way-affinity-demo-live-2026-07-11T20-30-06-401Z.report.json]
- **movielens-three-way-affinity-demo-main**: Ingested evidence from movielens-three-way-affinity-demo-live-2026-07-11T20-30-06-401Z.report.json. Metric: 1 -> 1. Verdict: unknown. Root cause: none. Dominant reason: none. Owner: none. Ingestion outcome: changed. [test-output/reports/movielens-three-way-affinity-demo-live-2026-07-11T20-30-06-401Z.report.json]
- **movielens-three-way-affinity-demo-main**: Independent verifier approved the move-limit scheduling patch after its recorded attempt, including saturated cleanup composition. [subagent:/root/affinity_parallel_reduce_verify]
- **movielens-three-way-affinity-demo-main**: Independent verifier approved the bounded full-drain bootstrap sequencing and corrected pre/post-ledger diagnostics. [subagent:/root/affinity_parallel_reduce_verify]
- **movielens-three-way-affinity-demo-main**: Ingested evidence from movielens-lagrange-service-affinity-live-2026-07-15T19-20-14-034Z.report.json. Metric: 1 -> 1. Verdict: FAIL. Root cause: none. Dominant reason: none. Owner: none. Ingestion outcome: changed. [test-output/reports/movielens-lagrange-service-affinity-live-2026-07-15T19-20-14-034Z.report.json]
- **movielens-three-way-affinity-demo-main**: At merged main a49dda6d the five-node cluster formed, but preload admission failed before ratings load because the control snapshot remained stale_usable with cache_stale_watermark and partition_topology_gap; this is a fresh live blocker after the priority-summary and split-policy owner fixes, not live closure. [test-output/reports/movielens-lagrange-service-affinity-live-2026-07-15T19-20-14-034Z.report.json]
- **movielens-three-way-affinity-demo-main**: Immutable run forensics bind partition_topology_gap to the system logs table entering split_preparing at pending partition version 2 while the control-snapshot cache and authoritative tables/partitions projection diverged. The demo's 1 MiB split threshold is global even though its intent is ratings-specific. The next investigation must discriminate table-local scenario policy from platform topology-repair convergence before changing source or rerunning live. [solve/changes/movielens-three-way-affinity-demo/handoff-2026-07-15-wave4-live-preload-topology-gap.md]
- **movielens-three-way-affinity-demo-main**: Ingested evidence from movielens-lagrange-service-affinity-live-2026-07-15T19-20-14-034Z.report.json. Metric: 1 -> 1. Verdict: FAIL. Root cause: none. Dominant reason: none. Owner: none. Ingestion outcome: changed. [test-output/reports/movielens-lagrange-service-affinity-live-2026-07-15T19-20-14-034Z.report.json]

## Theories
- **theory-ledger-cure-move-limit-starvation** [falsified] frontier, frontier movielens-three-way-affinity-demo-main, layer scheduling, mechanism scheduling_starvation, owner rebalancer_planning_owner, boundary move_limit_ordering, modelGate npm run model:contracts
- **theory-ledger-cure-move-limit-starvation-v2** [supported] frontier, frontier movielens-three-way-affinity-demo-main, layer scheduling, mechanism scheduling_starvation, owner rebalancer_planning_owner, boundary move_limit_ordering, modelGate npm run model:contracts
- **theory-load-after-full-formation-drain** [falsified] frontier, frontier movielens-three-way-affinity-demo-main, layer scheduling, mechanism transition_gap, owner demo_bootstrap_owner, boundary formation_to_data_load, modelGate npm run model:contracts

## Selected Theories
- **movielens-three-way-affinity-demo-main**: theory-load-after-full-formation-drain

## Theory Results
- **theory-ledger-cure-move-limit-starvation**: falsified (scenario=failed, theory=falsified, movement=no_previous) [test-output/reports/movielens-three-way-affinity-demo-live-2026-07-11T19-58-38-986Z.report.json]
- **theory-ledger-cure-move-limit-starvation-v2**: supported (scenario=failed, theory=supported, movement=no_previous) [test-output/reports/movielens-lagrange-service-affinity-live-2026-07-11T19-31-44-570Z.report.json]
- **theory-ledger-cure-move-limit-starvation-v2**: falsified (scenario=failed, theory=falsified, movement=same) [test-output/reports/movielens-three-way-affinity-demo-live-2026-07-11T20-30-06-401Z.report.json]
- **theory-ledger-cure-move-limit-starvation-v2**: supported (scenario=failed, theory=partial, movement=moved_boundary) [test-output/reports/movielens-three-way-affinity-demo-live-2026-07-11T20-30-06-401Z.report.json]
- **theory-load-after-full-formation-drain**: supported (scenario=failed, theory=supported, movement=same) [test-output/reports/movielens-lagrange-service-affinity-live-2026-07-11T19-31-44-570Z.report.json]
- **theory-load-after-full-formation-drain**: needs-rerun (scenario=failed, theory=inconclusive, movement=moved_boundary) [data/examples/service-data-affinity-demo-archive/run-2026-07-11T20-34-45-161Z.tar.gz]
- **theory-load-after-full-formation-drain**: falsified (scenario=failed, theory=falsified, movement=unknown) [test-output/reports/movielens-lagrange-service-affinity-live-2026-07-15T19-20-14-034Z.report.json]

## Attempt log
| ts | frontier | rung | metric | result | blocker movement | theory | change |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 2026-07-11T19:38:52.670Z | movielens-three-way-affinity-demo-main | observe | 1 -> 1 | flat | no_evidence |  | diff:solve/changes/movielens-three-way-affinity-demo/attempt-1.diff |
| 2026-07-11T19:47:29.603Z | movielens-three-way-affinity-demo-main | local-fix | 1 -> 1 | flat | no_evidence |  | diff:solve/changes/movielens-three-way-affinity-demo/attempt-2.diff |
| 2026-07-11T20:06:06.329Z | movielens-three-way-affinity-demo-main | widen-scope | 1 -> 1 | flat | no_previous | theory-ledger-cure-move-limit-starvation-v2 | diff:solve/changes/movielens-three-way-affinity-demo/attempt-3.diff |
| 2026-07-11T20:50:16.771Z | movielens-three-way-affinity-demo-main | widen-scope | 1 -> 1 | flat | same | theory-load-after-full-formation-drain | diff:solve/changes/movielens-three-way-affinity-demo/attempt-4.diff |
