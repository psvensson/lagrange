# Solve report: service-data-affinity-parallel-reduce-demo

**Goal:** A runnable single-latency-domain demo under examples/service-data-affinity performs a controlled affinity-off versus node-affinity-on comparison for the same MovieLens workload and service replicas, reports production-equivalent weighted node-locality rather than any-holder membership, and reaches the best achievable weighted placement without changing the correct top-10 result. The deployed native_js service splits disjoint reduce work across its replicas, publishes per-replica partial top-N results, and one replica merges those bounded partials into the exact global top-10; the demo reports the centralized full-scan row transfer versus the bounded cross-replica candidate set and labels scan fan-out, per-replica reduction, and cross-replica merge separately. Deterministic guard tests prove canonical base-service attribution from placed replica identities, shard selection, partial publication, final merge correctness, weighted-locality scoring, and affinity-off/on report acceptance.

**Class:** product · **Closure:** MEASURED

**Outcome:** EXHAUSTED — 1 frontier(s) parked; human decision needed

**Attempts:** 0

## Links
- parent quest: movielens-affinity-placement-demo
- plan: solve/epics/service-data-affinity-placement.md

## Scope Pressure
- Changed files: 0
- Change bytes: 0
- Owner areas: none
- Categories: none
- Signals: none

## Frontiers
- **service-data-affinity-parallel-reduce-demo-main** [parked {exhausted}] rung 0, attempts 0, metric ? -> 0 — No honest move can make the deterministic-guard doneWhen prove the sealed live result without weakening fidelity. The corrected successor uses the live demo scenario directly; two preserved pre-deployment write-timeout runs establish its current failing baseline.

## Findings
- **service-data-affinity-parallel-reduce-demo-main**: Adversarial verifier falsified the first cross-replica protocol before commit: runtime-service REPLACE allocates generation ids r3+, so shard ownership keyed directly by replica ordinal fails exactly when affinity moves replicas; independent DELETE/INSERT partial publication also admitted incomplete/stale merges, and driver START_STATUS.FAILED was projected ACTIVE. The replacement design rules out those levers: stable leased slot rows own shards across replica generations, partial and final values are atomic JSON UPDATE snapshots, current/fresh/bounded evidence is required, and failed starts now fail the lifecycle owner. (rules out: Replica-id ordinal shard ownership and DELETE-then-INSERT cross-replica partial publication)
- **service-data-affinity-parallel-reduce-demo-main**: Two fresh live demo attempts were non-measurements: both formed five single-zone nodes but the first MovieLens admin write timed out before ratings load; attempt 1 followed a 120s formation-operation stall and attempt 2 timed out even after three quiet settlement polls. Neither reached service deployment or any new parallel-reduce code. Per live two-strikes, no third unchanged run is honest; live Quest closure remains blocked on the pre-existing cluster write-path precondition. [solve/changes/service-data-affinity-parallel-reduce-demo/live-validation-attempts.md]
- **service-data-affinity-parallel-reduce-demo-main**: REUSED vs EXTENDED vs NEW: reused production affinity weights, service-scoped execution, native lifecycle, placement toggle, and row reducer; extended canonical issuing-service identity, fail-closed driver start handling, and query-loop parallel mode; new stable leased-slot/atomic-snapshot coordination only after confirming the existing distributed SQL aggregation owner coordinates partitions within one query and has no cross-runtime-replica work assignment/exchange contract. Coordination SQL uses an un-attributed executor so bookkeeping cannot steer its own placement.
- **service-data-affinity-parallel-reduce-demo-main**: Ingested evidence from service-data-affinity-parallel-reduce-demo-2026-07-11T17-21-00-853Z.report.json. Metric: unknown -> 0. Verdict: PASS. Root cause: none. Dominant reason: none. Owner: none. Ingestion outcome: changed. [test-output/reports/service-data-affinity-parallel-reduce-demo-2026-07-11T17-21-00-853Z.report.json]
- **service-data-affinity-parallel-reduce-demo-main**: Ingested evidence from service-data-affinity-parallel-reduce-demo-2026-07-11T17-21-00-853Z.report.json. Metric: 0 -> 0. Verdict: PASS. Root cause: none. Dominant reason: none. Owner: none. Ingestion outcome: changed. [test-output/reports/service-data-affinity-parallel-reduce-demo-2026-07-11T17-21-00-853Z.report.json]
- **service-data-affinity-parallel-reduce-demo-main**: Ingested evidence from service-data-affinity-parallel-reduce-demo-2026-07-11T17-37-54-287Z.report.json. Metric: 0 -> 0. Verdict: PASS. Root cause: none. Dominant reason: none. Owner: none. Ingestion outcome: changed. [test-output/reports/service-data-affinity-parallel-reduce-demo-2026-07-11T17-37-54-287Z.report.json]

## Theories
_(none recorded)_

## Selected Theories
_(none selected)_

## Theory Results
_(none recorded)_

## Attempt log
| ts | frontier | rung | metric | result | blocker movement | theory | change |
| --- | --- | --- | --- | --- | --- | --- | --- |
