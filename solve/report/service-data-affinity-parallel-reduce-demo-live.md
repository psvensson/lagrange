# Solve report: service-data-affinity-parallel-reduce-demo-live

**Goal:** A live report emitted by examples/service-data-affinity/run-affinity-demo.js proves on a five-node single-latency-domain cluster that the same MovieLens workload first produces a correct centralized top-10, then two placed runtime-service replicas own stable disjoint reduce slots, publish fresh bounded atomic partial snapshots, and merge the exact ranked top-10; changing only the service's read_locality from any to same_group preserves that result while reaching the best production-weighted node-locality placement. The report is PASS with fidelity live, current replica identities equal live slot owners, candidate count no greater than replicas times top-N, and no multi-zone dependency.

**Class:** product · **Closure:** MEASURED

**Outcome:** EXHAUSTED — 1 frontier(s) parked; human decision needed

**Attempts:** 1

## Links
- parent quest: service-data-affinity-parallel-reduce-demo
- plan: solve/epics/service-data-affinity-placement.md

## Current Blocker
- Frontier: service-data-affinity-parallel-reduce-demo-live-main
- Owner: unknown
- Boundary: unknown
- Dominant reason: unknown
- Mechanism: unknown
- Movement: no evidence recorded
- Latest evidence: none
- Selected theory: none
- Next move: continue supervised step for service-data-affinity-parallel-reduce-demo-live-main
- No longer current: Repeating the unchanged live demo while the first admin write precondition fails

## Continuation
- Status: blocked-unrecorded-evidence
- Next action: No open frontier remains; inspect solve report.
- Blocker: fresh frontier evidence is not recorded; run node scripts/solve.js ingest-evidence --id service-data-affinity-parallel-reduce-demo-live --frontier service-data-affinity-parallel-reduce-demo-live-main --evidence test-output/reports/service-data-affinity-parallel-reduce-demo-live-2026-07-11T17-06-00-000Z.report.json

## Scope Pressure
- Changed files: 3
- Change bytes: 40135
- Owner areas: examples
- Categories: other
- Split plan:
  - examples: 3 file(s)
- Signals: none

## Frontiers
- **service-data-affinity-parallel-reduce-demo-live-main** [parked {exhausted}] rung 1, attempts 1, metric 1 -> 1 — Two preserved five-node runs fail the first MovieLens admin write before service deployment, so no in-scope change to the independently approved affinity demo can produce the sealed live observable. A third unchanged run is ruled out; resume only after the existing cluster write-path precondition is restored.

## Findings
- **service-data-affinity-parallel-reduce-demo-live-main**: inherited from service-data-affinity-parallel-reduce-demo: Adversarial verifier falsified the first cross-replica protocol before commit: runtime-service REPLACE allocates generation ids r3+, so shard ownership keyed directly by replica ordinal fails exactly when affinity moves replicas; independent DELETE/INSERT partial publication also admitted incomplete/stale merges, and driver START_STATUS.FAILED was projected ACTIVE. The replacement design rules out those levers: stable leased slot rows own shards across replica generations, partial and final values are atomic JSON UPDATE snapshots, current/fresh/bounded evidence is required, and failed starts now fail the lifecycle owner. (rules out: Replica-id ordinal shard ownership and DELETE-then-INSERT cross-replica partial publication)
- **service-data-affinity-parallel-reduce-demo-live-main**: Independent verifier approved the stable leased-slot protocol, atomic bounded snapshots, exact disjoint merge, current/fresh report semantics, canonical attribution and failed-start propagation after reproducing the 202-assertion guard; verifier separately confirmed this does not claim unavailable live closure. [subagent:/root/affinity_parallel_reduce_verify]
- **service-data-affinity-parallel-reduce-demo-live-main**: Two live five-node runs reached cluster formation but the first MovieLens admin write timed out before service deployment in both runs; this is a non-measurement of the new parallel-reduce path and a third unchanged run is ruled out by the two-strikes rule. (rules out: Repeating the unchanged live demo while the first admin write precondition fails) [solve/changes/service-data-affinity-parallel-reduce-demo/live-validation-attempts.md]
- **service-data-affinity-parallel-reduce-demo-live-main**: Post-attempt independent review approves the exact live report protocol and bounded child packages while explicitly confirming that the preserved pre-service timeout cannot satisfy live closure. [subagent:/root/affinity_parallel_reduce_verify]
- **service-data-affinity-parallel-reduce-demo-live-main**: Ingested evidence from service-data-affinity-parallel-reduce-demo-live-2026-07-11T17-06-00-000Z.report.json. Metric: 1 -> 1. Verdict: FAIL (precondition_admin_write_timeout_before_service_deploy). Root cause: none. Dominant reason: none. Owner: none. Ingestion outcome: changed. [test-output/reports/service-data-affinity-parallel-reduce-demo-live-2026-07-11T17-06-00-000Z.report.json]

## Theories
_(none recorded)_

## Selected Theories
_(none selected)_

## Theory Results
_(none recorded)_

## Attempt log
| ts | frontier | rung | metric | result | blocker movement | theory | change |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 2026-07-11T17:31:13.811Z | service-data-affinity-parallel-reduce-demo-live-main | observe | 1 -> 1 | flat | no_evidence |  | diff:solve/changes/service-data-affinity-parallel-reduce-demo-live/attempt-1.diff.json |
