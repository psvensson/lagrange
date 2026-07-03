# Solve report: service-partition-access-attribution

**Goal:** Per-(service, partition) access attribution exists as a production feed: the SQL engine records (issuingServiceId, partitionId, read|write) counts in a node-local accumulator at the statement seams (SELECT counts the executed partition set including join fanout on success; INSERT/UPDATE/DELETE count their write-plan partitions; statements without an issuing service are skipped, so external SQL clients are unaffected), and a node-owned shutdown-aware publisher periodically flushes non-empty deltas as one CDC-propagated service_partition_access row per (node, service) through the control-plane system-table gateway (coalesced, background work class), resetting the accumulator on publish, so the rows are readable from any node's system-table cache. Proven by deterministic red-on-revert tests (dt:prove) covering recording at each statement seam, publishing (fake gateway/clock), and cache readability; the query hot path gains no per-read table lookups.

**Class:** product · **Closure:** MEASURED

**Outcome:** SOLVED (MEASURED) — evidence: test-output/reports/service-partition-access-attribution-2026-07-03T12-22-32-983Z.report.json

**Attempts:** 1

## Links
- parent quest: placement-data-affinity-tier1b
- plan: solve/epics/service-data-affinity-placement.md

## Current Blocker
- Frontier: service-partition-access-attribution-main
- Owner: unknown
- Boundary: unknown
- Dominant reason: unknown
- Mechanism: unknown
- Movement: no evidence recorded
- Latest evidence: none
- Selected theory: none
- Next move: continue supervised step for service-partition-access-attribution-main

## Continuation
- Status: allowed
- Next action: No open frontier remains; inspect solve report.
- Blocker: none

## Scope Pressure
- Changed files: 16
- Owner areas: scripts/run-placement-affinity-scenarios.js, src/bootstrap, src/cache, src/constants, src/query, test/query
- Categories: other, runtime
- Action: split by owner area before the next attempt (16 files)
- Action: land or separate 6 owner areas: scripts/run-placement-affinity-scenarios.js, src/bootstrap, src/cache, src/constants, src/query, test/query
- Split plan:
  - src/query: 7 file(s)
  - src/bootstrap: 3 file(s)
  - src/constants: 3 file(s)
  - scripts/run-placement-affinity-scenarios.js: 1 file(s)
  - src/cache: 1 file(s)
  - test/query: 1 file(s)
- Signal: broad-source-scope severity=medium
- Signal: large-diff-stack severity=medium

## Frontiers
- **service-partition-access-attribution-main** [solved] rung 1, attempts 1, metric ? -> 0

## Findings
- **service-partition-access-attribution-main**: Epic assumption CORRECTED: 'extend the managed-split-metrics sampler' cannot supply A[s][p] — that sampler is leader-local and write-only (its queriesPerMinute diffs CDC EVENTS_GENERATED; reads are never counted, and the issuing-service identity exists only on the coordinator where the service replica runs). The attribution edge is a NEW signal recorded at the engine statement layer (the only place issuingServiceId and the touched partition set coexist, zero new plumbing); SELECT uses result.partitions (join fanout included), writes use writePlan partitions, delivery-level counting was rejected (no identity there + would double-count retries). Publication follows the heartbeat precedent: per-node CDC-propagated rows, coalesced, background class.
- **service-partition-access-attribution-main**: Subagent verifier (evidence subagent:attribution-adversarial-verify) verdict FAITHFUL-with-defects; ALL FIXED pre-commit: (D1 medium) the gateway signals readiness-deferred and coalescing-superseded outcomes by RESOLVING (success:false / superseded:true) not throwing — publisher now merges those deltas back too (pinned by a resolved-failure guard test); (D2) publishOnce is now single-flight so a slow gateway cannot self-supersede an intermediate window (pinned); (D3) stop() is terminal — a statement served during node drain cannot re-arm a shut-down publisher (pinned); duplicate local constant removed. Verifier independently confirmed registration completeness (all derived sets), hot-path cleanliness (one falsy check for non-attributed statements), gateway options real end-to-end, no overlap with managed-split-metrics-provider.

## Theories
_(none recorded)_

## Selected Theories
_(none selected)_

## Theory Results
_(none recorded)_

## Attempt log
| ts | frontier | rung | metric | result | blocker movement | theory | change |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 2026-07-03T12:23:08.652Z | service-partition-access-attribution-main | observe | ? -> 0 | flat | no_evidence |  | diff:solve/changes/service-partition-access-attribution/attempt1.diff |
