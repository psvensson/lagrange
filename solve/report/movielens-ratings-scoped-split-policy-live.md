# Solve report: movielens-ratings-scoped-split-policy-live

**Goal:** One production MovieLens five-node local-process milestone reaches preload admission, loads ratings, and emits the successful three-way comparison report while node split defaults remain production-wide and only ratings carries the sparse 1 MiB split override. Deterministic guards prove invocation ordering, bounded stable confirmation, and ratings-only selection through the real policy/split owners; immutable milestone logs show the system logs partition was not selected.

**Class:** product · **Closure:** MEASURED

**Outcome:** IN PROGRESS (no terminal recorded)

**Attempts:** 5

## Links
- spec: solve/epics/service-data-affinity-placement.md
- parent quest: movielens-three-way-affinity-demo
- plan: solve/epics/service-data-affinity-placement.md

## Current Blocker
- Frontier: movielens-ratings-scoped-split-policy-live-main
- Owner: unknown
- Boundary: unknown
- Dominant reason: unknown
- Mechanism: transition_gap
- Movement: first blocker observed: FAIL
- Latest evidence: test-output/reports/movielens-lagrange-service-affinity-live-2026-07-15T21-59-01-787Z.report.json
- Selected theory: theory-20260715-the-order-guard-observes-joiner-loop (stale: selected theory status is falsified)
- Next move: record or select a fresh frontier theory for movielens-ratings-scoped-split-policy-live-main

## Continuation
- Status: allowed
- Next action: No open frontier remains; inspect solve report.
- Blocker: none

## Scope Pressure
- Changed files: 10
- Change bytes: 74624
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
- **movielens-ratings-scoped-split-policy-live-main** [parked {exhausted}] rung 5, attempts 5, metric 1 -> 1 — ladder exhausted without metric movement

## Findings
- **movielens-ratings-scoped-split-policy-live-main**: Ingested evidence from movielens-lagrange-service-affinity-live-2026-07-15T19-20-14-034Z.report.json. Metric: 1 -> 1. Verdict: FAIL. Root cause: none. Dominant reason: none. Owner: none. Ingestion outcome: changed. [test-output/reports/movielens-lagrange-service-affinity-live-2026-07-15T19-20-14-034Z.report.json]
- **movielens-ratings-scoped-split-policy-live-main**: At successor base 022f27a3, the five-node live run formed but failed preload with partition_topology_gap after the node-wide 1 MiB default selected the system logs table; the immutable archive binds this successor to the live mechanism rather than only its deterministic fixture. [data/examples/service-data-affinity-demo-archive/handoff-live-2026-07-15T19-20-14-034Z.tar.gz]
- **movielens-ratings-scoped-split-policy-live-main**: Exact attempt fingerprint rejected: ratings policy confirmation is cache-backed rather than authoritative because AdminWebSocketAPI intercepts tables SELECTs through shared SystemTableCache, so fresh clients do not prove durable CREATE metadata; the new bounded local retry loop also violates the decision-boundary audit. [subagent:verify_movielens_attempt5]
- **movielens-ratings-scoped-split-policy-live-main**: Exact attempt sha256:e0b71800a3b331a6090815db7e9ad425c7d362472be3e416cea94c5e242e4481 is rejected: createRatingsTableWithRetry counted every resolved CREATE query as a stable confirmation, including the durable owner's typed pending/retry outcome. The exact helper witness returned two confirmations from two pending outcomes, so joiner expansion could begin before durable provisioning was ready. Replacement must count only typed ready/proceed outcomes, reset/defer on pending retry, fail closed on missing metadata, and test typed reset/exhaustion paths. All other scoped checks passed except 48 pre-existing runner literal-audit findings. [subagent:verify_movielens_attempt5]
- **movielens-ratings-scoped-split-policy-live-main**: Independent verification passed for exact attempt sha256:177e3c790375f32d2ed86eab7020222ea748a0a426fb9a0367d4922f161622e9: typed pending resets and exhausts, only ready/proceed confirms, malformed and terminal outcomes fail closed, retry remains canonically owned, atomic ratings-only policy and invocation ordering are proven through real owners, deterministic scenario is 9/9, scoped ratchets are green, and the 48 literal findings are unchanged from base. [subagent:verify_movielens_attempt3]
- **movielens-ratings-scoped-split-policy-live-main**: Checkpoint e1f687ea removed the logs split/topology-gap mechanism, but the one-time milestone exposed a different deterministic ordering deadlock before expansion: ratings durable CREATE stayed pending because its owner required two replicas while only the seed existed (requiredReplicaCount=2, resolvedReplicaCount=1, maximumProvisionableReplicaCount=1). The table metadata and one replica were created successfully, no logs split was selected, but ten typed pending observations correctly exhausted. Move policy-bearing ratings CREATE after five-node formation while keeping it before preload/load; do not rerun unchanged. [data/examples/service-data-affinity-demo-archive/wave4-live-create-pending-2026-07-15T21-59-01-787Z.tar.gz]
- **movielens-ratings-scoped-split-policy-live-main**: The same single milestone emitted an honest failed three-way report because the Lagrange phase stopped at durable schema confirmation; PostgreSQL completed and cleaned up, while no comparison result was fabricated. [test-output/reports/movielens-three-way-affinity-demo-live-2026-07-15T21-59-01-791Z.report.json]
- **movielens-ratings-scoped-split-policy-live-main**: Ingested evidence from movielens-lagrange-service-affinity-live-2026-07-15T21-59-01-787Z.report.json. Metric: 1 -> 1. Verdict: FAIL. Root cause: none. Dominant reason: none. Owner: none. Ingestion outcome: changed. [test-output/reports/movielens-lagrange-service-affinity-live-2026-07-15T21-59-01-787Z.report.json]
- **movielens-ratings-scoped-split-policy-live-main**: Ingested evidence from movielens-lagrange-service-affinity-live-2026-07-15T21-59-01-787Z.report.json. Metric: 1 -> 1. Verdict: FAIL. Root cause: none. Dominant reason: none. Owner: none. Ingestion outcome: changed. [test-output/reports/movielens-lagrange-service-affinity-live-2026-07-15T21-59-01-787Z.report.json]
- **movielens-ratings-scoped-split-policy-live-main**: Exact attempt sha256:945fb995ba90dedb05b91d916df10fc3b78258f9fc5b2e5778e4c2b6801b3e62 is rejected despite correct implementation: the deterministic guard proves only joiner-loop start before ratings CREATE, not waitForActiveNodes formation completion. A mutant can place CREATE after joiner launch but before formation, pass all assertions, and retain maximumProvisionableReplicaCount=1. Replacement must assert joiner expansion < waitForActiveNodes completion < ratings CREATE < preload admission < ratings load. [subagent:verify_movielens_attempt3]

## Theories
- **theory-20260715-runner-ordering-invokes-policy-bearing-ratings** [active] system, mechanism Runner ordering invokes policy-bearing ratings CREATE before joiner expansion; the owner correctly reports requiredReplicaCount=2, resolvedReplicaCount=1, maximumProvisionableReplicaCount=1 forever on that topology., owner MovieLens runner ordering at the durable schema-owner boundary, modelGate npm run model:contracts
- **theory-20260715-the-loader-mistakes-transport-resolution-for** [falsified] frontier, frontier movielens-ratings-scoped-split-policy-live-main, layer ownership, mechanism The loader mistakes transport resolution for durable readiness and increments stable confirmation on pending/retry outcomes., modelGate npm run model:contracts
- **theory-20260715-the-scenario-s-create-before-expansion** [falsified] frontier, frontier movielens-ratings-scoped-split-policy-live-main, layer scheduling, mechanism The scenario's CREATE-before-expansion schedule cannot satisfy the durable owner's two-replica readiness condition on a one-node seed., modelGate npm run model:contracts
- **theory-20260715-the-order-guard-observes-joiner-loop** [falsified] frontier, frontier movielens-ratings-scoped-split-policy-live-main, layer observation, mechanism The order guard observes joiner-loop entry rather than the waitForActiveNodes formation barrier, so it cannot falsify CREATE while maximumProvisionableReplicaCount is still one., modelGate npm run model:contracts

## Selected Theories
- **movielens-ratings-scoped-split-policy-live-main**: theory-20260715-the-order-guard-observes-joiner-loop

## Theory Results
- **theory-20260715-the-loader-mistakes-transport-resolution-for**: falsified (scenario=failed, theory=falsified, movement=no_evidence) [test-output/reports/movielens-lagrange-service-affinity-live-2026-07-15T19-20-14-034Z.report.json]
- **theory-20260715-the-loader-mistakes-transport-resolution-for**: falsified (scenario=failed, theory=falsified, movement=no_previous) [test-output/reports/movielens-lagrange-service-affinity-live-2026-07-15T21-59-01-787Z.report.json]
- **theory-20260715-the-scenario-s-create-before-expansion**: falsified (scenario=failed, theory=falsified, movement=no_previous) [test-output/reports/movielens-lagrange-service-affinity-live-2026-07-15T21-59-01-787Z.report.json]
- **theory-20260715-the-order-guard-observes-joiner-loop**: falsified (scenario=failed, theory=falsified, movement=no_previous) [test-output/reports/movielens-lagrange-service-affinity-live-2026-07-15T21-59-01-787Z.report.json]

## Attempt log
| ts | frontier | rung | metric | result | blocker movement | theory | change |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 2026-07-15T21:10:36.456Z | movielens-ratings-scoped-split-policy-live-main | observe | 1 -> 1 | flat | no_evidence |  | diff:solve/changes/movielens-ratings-scoped-split-policy-live/attempt-1.diff |
| 2026-07-15T21:36:02.801Z | movielens-ratings-scoped-split-policy-live-main | local-fix | 1 -> 1 | flat | no_evidence |  | diff:solve/changes/movielens-ratings-scoped-split-policy-live/attempt-2.diff |
| 2026-07-15T21:48:45.800Z | movielens-ratings-scoped-split-policy-live-main | widen-scope | 1 -> 1 | flat | no_evidence | theory-20260715-the-loader-mistakes-transport-resolution-for | diff:solve/changes/movielens-ratings-scoped-split-policy-live/attempt-3.diff |
| 2026-07-15T22:03:06.728Z | movielens-ratings-scoped-split-policy-live-main | model | 1 -> 1 | flat | no_previous | theory-20260715-the-scenario-s-create-before-expansion | diff:solve/changes/movielens-ratings-scoped-split-policy-live/attempt-4.diff |
| 2026-07-15T22:07:32.367Z | movielens-ratings-scoped-split-policy-live-main | change-approach | 1 -> 1 | flat | no_previous | theory-20260715-the-order-guard-observes-joiner-loop | diff:solve/changes/movielens-ratings-scoped-split-policy-live/attempt-5.diff |
