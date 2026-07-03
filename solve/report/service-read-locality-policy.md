# Solve report: service-read-locality-policy

**Goal:** service_definitions carries a durable per-service readLocality policy field (default off, not a flag): accepted at service registration/validation, CDC-propagated to all nodes, readable from the node-local cached view on the query read hot path without per-read lookups; when readLocality is enabled for a service, read routing candidate selection prefers same-latency-group (and local-node) replicas via the existing dormant ordering mechanism; with the policy off, routing behavior is unchanged. Proven by deterministic tests that are red-on-revert of the wiring (dt:prove), including one test showing policy-off order is unchanged and policy-on order prefers the local latency group.

**Class:** product · **Closure:** MEASURED

**Outcome:** SOLVED (MEASURED) — evidence: test-output/reports/service-read-locality-policy-2026-07-03T11-04-47-839Z.report.json

**Attempts:** 1

## Links
- plan: solve/epics/service-data-affinity-placement.md

## Current Blocker
- Frontier: service-read-locality-policy-main
- Owner: unknown
- Boundary: unknown
- Dominant reason: unknown
- Mechanism: unknown
- Movement: no evidence recorded
- Latest evidence: none
- Selected theory: none
- Next move: continue supervised step for service-read-locality-policy-main

## Continuation
- Status: allowed
- Next action: No open frontier remains; inspect solve report.
- Blocker: none

## Scope Pressure
- Changed files: 15
- Owner areas: scripts/checks, scripts/run-placement-affinity-scenarios.js, scripts/run-restart-new-ip-scenarios.js, src/bootstrap, src/constants, src/query, src/wasm-service, test/query, test/wasm-service
- Categories: other, runtime, test
- Action: split by owner area before the next attempt (15 files)
- Action: land or separate 9 owner areas: scripts/checks, scripts/run-placement-affinity-scenarios.js, scripts/run-restart-new-ip-scenarios.js, src/bootstrap, src/constants, src/query, src/wasm-service, test/query, test/wasm-service
- Split plan:
  - src/query: 4 file(s)
  - src/wasm-service: 3 file(s)
  - src/constants: 2 file(s)
  - scripts/checks: 1 file(s)
  - scripts/run-placement-affinity-scenarios.js: 1 file(s)
  - scripts/run-restart-new-ip-scenarios.js: 1 file(s)
  - src/bootstrap: 1 file(s)
  - test/query: 1 file(s)
  - test/wasm-service: 1 file(s)
- Signal: broad-source-scope severity=medium
- Signal: large-diff-stack severity=medium

## Frontiers
- **service-read-locality-policy-main** [solved] rung 1, attempts 1, metric ? -> 0

## Findings
- **service-read-locality-policy-main**: Policy resolved at the issuing-service seam per the sealed user decision: the service-scoped query executor factory passes issuingServiceId, the engine's resolveIssuingServiceReadLocality reads the CDC-fed systemCache service_definitions row (one Map.get per SELECT), and executeSelect threads preferSameLatencyGroup into the existing dormant ordering mechanism — routing module stays partition-keyed, callers observe.
- **service-read-locality-policy-main**: Schema change is pre-first-release-safe by decision: read_locality added to CREATE TABLE schema only; no column migration machinery exists (CREATE TABLE IF NOT EXISTS keeps old columns on existing data dirs) and none was built — v0.1.0 is unpushed, no deployed clusters. Post-release column adds will need a system-table migration path.
- **service-read-locality-policy-main**: orderServicesByLatencyGroup extended to rank local node first, then same latency group, then rest — safe because the mechanism was dormant (no prod call site passed enabled=true; verified by survey of all 8 call sites, all defaulting false); write path is structurally unaffected (forRead && flag gate at resolvePartitionServiceCandidates).
- **service-read-locality-policy-main**: Subagent verifier (evidence subagent:readlocality-adversarial-verify) audited the full diff adversarially: wiring reaches all read delivery/retry/recovery paths, off-neutrality proven (zero prior enabled=true call sites), no import cycles, schema/list/serialize consistent at 17 columns, hot path is one cache Map.get per SELECT. Two defects found and FIXED before commit: (D1) wasm-service-models round-trip fixture red with the new deserialize field — fixture extended with readLocality same_group; (D2) mid-chain threading unpinned — added an end-to-end guard case (real engine + real QueryExecutor + recording router) asserting policy-on delivers to the local-node replica first and policy-off keeps snapshot order. Re-proven red-on-revert after both fixes.
- **service-read-locality-policy-main**: PRE-EXISTING gap surfaced by the verifier (not introduced, not fixed here): parallel-query-coordinator.js:534 speculative-straggler retry calls executeQueryOnService without partitionId and options, so forRead/preferLeader/preferSameLatencyGroup all degrade to false on that path (locality degradation is in the safe direction — uniform routing). Follow-up quest candidate.

## Theories
_(none recorded)_

## Selected Theories
_(none selected)_

## Theory Results
_(none recorded)_

## Attempt log
| ts | frontier | rung | metric | result | blocker movement | theory | change |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 2026-07-03T11:05:36.047Z | service-read-locality-policy-main | observe | ? -> 0 | flat | no_evidence |  | diff:solve/changes/service-read-locality-policy/attempt1.diff |
