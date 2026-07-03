# Solve report: runtime-service-affinity-policy-lift

**Goal:** getRuntimeServicePolicy assembles the affinity placement policy from live evidence, coherently with the service's routing policy: when service_definitions.read_locality is same_group, it aggregates the CDC-propagated service_partition_access rows for the service across nodes (staleness-bounded), joins each accessed partition's active replica locations to latency groups, normalizes to per-group weights (best group = 1), and returns policy.dataAffinity.groupWeights plus placementConstraints.preferDataAffinity=true so the shipped DATA_AFFINITY kernel dimension engages in production; when read_locality is any, or no fresh attribution exists, the returned policy is unchanged from today. Proven by deterministic red-on-revert tests (dt:prove) including an end-to-end case walking record -> publish -> aggregate -> policy -> DATA_AFFINITY score dimensions in the real placement kernel.

**Class:** product · **Closure:** MEASURED

**Outcome:** SOLVED (MEASURED) — evidence: test-output/reports/runtime-service-affinity-policy-lift-2026-07-03T12-22-34-574Z.report.json

**Attempts:** 1

## Links
- parent quest: service-partition-access-attribution
- plan: solve/epics/service-data-affinity-placement.md

## Current Blocker
- Frontier: runtime-service-affinity-policy-lift-main
- Owner: unknown
- Boundary: unknown
- Dominant reason: unknown
- Mechanism: unknown
- Movement: no evidence recorded
- Latest evidence: none
- Selected theory: none
- Next move: continue supervised step for runtime-service-affinity-policy-lift-main

## Continuation
- Status: allowed
- Next action: No open frontier remains; inspect solve report.
- Blocker: none

## Scope Pressure
- Changed files: 4
- Owner areas: src/rebalancer, test/rebalancer
- Categories: runtime
- Split plan:
  - src/rebalancer: 3 file(s)
  - test/rebalancer: 1 file(s)
- Signals: none

## Frontiers
- **runtime-service-affinity-policy-lift-main** [solved] rung 1, attempts 1, metric 0 -> 0

## Findings
- **runtime-service-affinity-policy-lift-main**: Coherence gate implemented as decided: the lift fires ONLY when service_definitions.read_locality = same_group — the same durable field the query router reads — so the planner scores exactly the read-cost regime the service's reads actually route under (sim finding: with uniform routing and spread data, affinity placement cannot move read locality; lifting affinity for 'any' services would be incoherent). Reads credit every group holding an active replica (what locality routing can serve), writes credit the leader group only (writes always route to the leader) — the epic's Phi model.
- **runtime-service-affinity-policy-lift-main**: Subagent verifier (evidence subagent:policy-lift-adversarial-verify) verdict FAITHFUL: unchanged-policy claim probe-verified byte-identical for read_locality any/absent (shared frozen default constraints never mutated), all downstream policy consumers key-specific, join constants match production row shapes (query-router uses the identical services filter), no new feedback loop (weights depend on what the service queries and where data sits, not on service placement; REPLACE-per-(node,service) delta rows are disjoint windows — no double counting after a move, bounded <=120s stale steering that decays). Minor steering finding FIXED: policy contract keys now use the exported PLACEMENT_OWNER_POLICY_FIELD constants (producer/consumer can no longer drift) and the services filter uses COLUMN.* constants.

## Theories
_(none recorded)_

## Selected Theories
_(none selected)_

## Theory Results
_(none recorded)_

## Attempt log
| ts | frontier | rung | metric | result | blocker movement | theory | change |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 2026-07-03T12:23:25.573Z | runtime-service-affinity-policy-lift-main | observe | 0 -> 0 | flat | no_evidence |  | diff:solve/changes/runtime-service-affinity-policy-lift/attempt1.diff |
