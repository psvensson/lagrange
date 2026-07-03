# Solve report: placement-data-affinity-tier1b

**Goal:** The real placement kernel scores a DATA_AFFINITY dimension (service near its accessed data) beside the existing latency-group dimensions, fed by an affinity context on the evidence path, and its effect is proven through the REAL MovePlanner: deterministic tests drive calculateTargetState + calculateMoves (stubbed moveStateProvider) showing (a) an affinity gradient moves a service replica toward its data's latency group, (b) an in-score incumbent movement-cost (hysteresis) term prevents churn when the gradient is below the retention margin, per the Tier-1a sim findings, and (c) with no affinity context supplied, kernel output is unchanged. Tests are red-on-revert of the src wiring (dt:prove).

**Class:** product · **Closure:** MEASURED

**Outcome:** SOLVED (MEASURED) — evidence: test-output/reports/placement-data-affinity-tier1b-2026-07-03T11-25-19-895Z.report.json

**Attempts:** 1

## Links
- parent quest: service-read-locality-policy
- plan: solve/epics/service-data-affinity-placement.md

## Current Blocker
- Frontier: placement-data-affinity-tier1b-main
- Owner: unknown
- Boundary: unknown
- Dominant reason: unknown
- Mechanism: unknown
- Movement: no evidence recorded
- Latest evidence: none
- Selected theory: none
- Next move: continue supervised step for placement-data-affinity-tier1b-main

## Continuation
- Status: allowed
- Next action: No open frontier remains; inspect solve report.
- Blocker: none

## Scope Pressure
- Changed files: 5
- Owner areas: scripts/run-placement-affinity-scenarios.js, src/rebalancer, test/convergence
- Categories: other, runtime, test
- Action: land or separate 3 owner areas: scripts/run-placement-affinity-scenarios.js, src/rebalancer, test/convergence
- Split plan:
  - src/rebalancer: 3 file(s)
  - scripts/run-placement-affinity-scenarios.js: 1 file(s)
  - test/convergence: 1 file(s)
- Signal: broad-source-scope severity=medium

## Frontiers
- **placement-data-affinity-tier1b-main** [solved] rung 1, attempts 1, metric ? -> 0

## Findings
- **placement-data-affinity-tier1b-main**: Hysteresis form DECIDED: in-score incumbent movement-cost dimension (DATA_AFFINITY_INCUMBENT_RETENTION, -4 vs affinity weight 10), NOT the reservation-based retainHealthyIncumbents lever — reservation retention seeds reserved incumbents into intent FIRST, which would freeze affinity movement regardless of gradient; the in-score margin matches the Tier-1a sim semantics (move iff gradient > margin, sweeps B/C/E band). retainHealthyIncumbents left as-is (dead through the wired path, still documented by real-kernel harness claim 3, avoids two parallel hysteresis mechanisms per ARCH-0040).
- **placement-data-affinity-tier1b-main**: No MovePlanner bridge change was needed: buildPlacementOwnerPolicyDecision forwards the policy object whole, so placementConstraints.preferDataAffinity and policy.dataAffinity (groupWeights) ride the existing conduit calculateTargetState -> calculatePartitionPlacement -> normalizePlacementOwnerEvidence. The affinity evidence enters ON the policy object by design: the production policy owner (getRuntimeServicePolicy) will assemble groupWeights from access attribution + readLocality — that lift is the epic's recorded production prerequisite, not built here.
- **placement-data-affinity-tier1b-main**: Subagent verifier (evidence subagent:tier1b-adversarial-verify) verdict FAITHFUL: off-neutrality byte-identical when gated (zero prod policy sources carry the new keys; stored table policies strip top-level dataAffinity via mergeWithDefaults), score arithmetic and sign convention correct, MovePlanner conduit forwards policy+currentReplicas whole, calculateMoves damping sound, reservation-vs-in-score decision confirmed in code (reserved incumbents seed intent first -> would freeze movement). Three low findings ALL FIXED pre-commit: zero-weight entries now dropped (zero-only map no longer engages retention, pinned in test (c)), array-typed groupWeights rejected (pinned), and tests (a)/(b) made ordinal-non-degenerate (each picks node order the feature must overturn). Re-proven red-on-revert after fixes.

## Theories
_(none recorded)_

## Selected Theories
_(none selected)_

## Theory Results
_(none recorded)_

## Attempt log
| ts | frontier | rung | metric | result | blocker movement | theory | change |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 2026-07-03T11:26:56.773Z | placement-data-affinity-tier1b-main | observe | ? -> 0 | flat | no_evidence |  | diff:solve/changes/placement-data-affinity-tier1b/attempt1.diff |
