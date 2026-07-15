# Solve report: movielens-ratings-scoped-split-policy-live

**Goal:** One production MovieLens five-node local-process milestone reaches preload admission, loads ratings, and emits the successful three-way comparison report while node split defaults remain production-wide and only ratings carries the sparse 1 MiB split override. Deterministic guards prove invocation ordering, bounded stable confirmation, and ratings-only selection through the real policy/split owners; immutable milestone logs show the system logs partition was not selected.

**Class:** product · **Closure:** MEASURED

**Outcome:** IN PROGRESS (no terminal recorded)

**Attempts:** 3

## Links
- spec: solve/epics/service-data-affinity-placement.md
- parent quest: movielens-three-way-affinity-demo
- plan: solve/epics/service-data-affinity-placement.md

## Current Blocker
- Frontier: movielens-ratings-scoped-split-policy-live-main
- Owner: unknown
- Boundary: unknown
- Dominant reason: unknown
- Mechanism: unknown
- Movement: no evidence recorded
- Latest evidence: none
- Selected theory: theory-20260715-the-loader-mistakes-transport-resolution-for (stale: selected theory status is falsified)
- Next move: record or select a fresh frontier theory for movielens-ratings-scoped-split-policy-live-main

## Continuation
- Status: blocked-theory
- Next action: record system theory before the next movielens-ratings-scoped-split-policy-live-main attempt using npm run model:contracts as model discriminator
- Blocker: system theory required for movielens-ratings-scoped-split-policy-live-main
- Blocker: frontier theory required for movielens-ratings-scoped-split-policy-live-main
- Blocker: selected theory stale: selected theory status is falsified

## Scope Pressure
- Changed files: 10
- Change bytes: 70327
- Owner areas: examples, scripts/run-placement-affinity-scenarios.js, src/query, test/partition, test/query, test/runtime
- Categories: other, runtime, test
- Action: land or separate 6 owner areas: examples, scripts/run-placement-affinity-scenarios.js, src/query, test/partition, test/query, test/runtime
- Split plan:
  - src/query: 3 file(s)
  - examples: 2 file(s)
  - test/runtime: 2 file(s)
  - scripts/run-placement-affinity-scenarios.js: 1 file(s)
  - test/partition: 1 file(s)
  - test/query: 1 file(s)
- Signal: broad-source-scope severity=medium

## Frontiers
- **movielens-ratings-scoped-split-policy-live-main** [open] rung 3, attempts 3, metric 1 -> 1

## Findings
- **movielens-ratings-scoped-split-policy-live-main**: Ingested evidence from movielens-lagrange-service-affinity-live-2026-07-15T19-20-14-034Z.report.json. Metric: 1 -> 1. Verdict: FAIL. Root cause: none. Dominant reason: none. Owner: none. Ingestion outcome: changed. [test-output/reports/movielens-lagrange-service-affinity-live-2026-07-15T19-20-14-034Z.report.json]
- **movielens-ratings-scoped-split-policy-live-main**: At successor base 022f27a3, the five-node live run formed but failed preload with partition_topology_gap after the node-wide 1 MiB default selected the system logs table; the immutable archive binds this successor to the live mechanism rather than only its deterministic fixture. [data/examples/service-data-affinity-demo-archive/handoff-live-2026-07-15T19-20-14-034Z.tar.gz]
- **movielens-ratings-scoped-split-policy-live-main**: Exact attempt fingerprint rejected: ratings policy confirmation is cache-backed rather than authoritative because AdminWebSocketAPI intercepts tables SELECTs through shared SystemTableCache, so fresh clients do not prove durable CREATE metadata; the new bounded local retry loop also violates the decision-boundary audit. [subagent:verify_movielens_attempt5]
- **movielens-ratings-scoped-split-policy-live-main**: Exact attempt sha256:e0b71800a3b331a6090815db7e9ad425c7d362472be3e416cea94c5e242e4481 is rejected: createRatingsTableWithRetry counted every resolved CREATE query as a stable confirmation, including the durable owner's typed pending/retry outcome. The exact helper witness returned two confirmations from two pending outcomes, so joiner expansion could begin before durable provisioning was ready. Replacement must count only typed ready/proceed outcomes, reset/defer on pending retry, fail closed on missing metadata, and test typed reset/exhaustion paths. All other scoped checks passed except 48 pre-existing runner literal-audit findings. [subagent:verify_movielens_attempt5]

## Theories
- **theory-20260715-the-loader-mistakes-transport-resolution-for** [falsified] frontier, frontier movielens-ratings-scoped-split-policy-live-main, layer ownership, mechanism The loader mistakes transport resolution for durable readiness and increments stable confirmation on pending/retry outcomes., modelGate npm run model:contracts

## Selected Theories
- **movielens-ratings-scoped-split-policy-live-main**: theory-20260715-the-loader-mistakes-transport-resolution-for

## Theory Results
- **theory-20260715-the-loader-mistakes-transport-resolution-for**: falsified (scenario=failed, theory=falsified, movement=no_evidence) [test-output/reports/movielens-lagrange-service-affinity-live-2026-07-15T19-20-14-034Z.report.json]

## Attempt log
| ts | frontier | rung | metric | result | blocker movement | theory | change |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 2026-07-15T21:10:36.456Z | movielens-ratings-scoped-split-policy-live-main | observe | 1 -> 1 | flat | no_evidence |  | diff:solve/changes/movielens-ratings-scoped-split-policy-live/attempt-1.diff |
| 2026-07-15T21:36:02.801Z | movielens-ratings-scoped-split-policy-live-main | local-fix | 1 -> 1 | flat | no_evidence |  | diff:solve/changes/movielens-ratings-scoped-split-policy-live/attempt-2.diff |
| 2026-07-15T21:48:45.800Z | movielens-ratings-scoped-split-policy-live-main | widen-scope | 1 -> 1 | flat | no_evidence | theory-20260715-the-loader-mistakes-transport-resolution-for | diff:solve/changes/movielens-ratings-scoped-split-policy-live/attempt-3.diff |
