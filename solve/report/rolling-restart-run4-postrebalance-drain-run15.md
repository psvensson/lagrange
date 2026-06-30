# Solve report: rolling-restart-run4-postrebalance-drain-run15

**Goal:** A deterministic run15-shaped post-rebalance closure reproducer proves whether operation_drain_open with effective in-flight replica operations after publication convergence is real operation_workflow_owner progress debt or stale/terminal accounting debt, without changing the parent rolling-restart Wilson closure bar.

**Class:** process · **Closure:** DECISION

**Outcome:** SOLVED (DECISION) — evidence: solve/oracle/rolling-restart-run4-postrebalance-drain-run15.json

**Attempts:** 1

## Links
- roadmap row: RM-0.1-fs-rolling-restart
- spec: membership-lifecycle-placement-hard-cutover
- parent quest: rolling-restart-run4-drain-residual
- plan: solve/epics/topology-convergence-hardening.md

## Current Blocker
- Frontier: rolling-restart-run4-postrebalance-drain-run15-main
- Owner: unknown
- Boundary: unknown
- Dominant reason: unknown
- Mechanism: unknown
- Movement: no evidence recorded
- Latest evidence: none
- Selected theory: none
- Next move: continue supervised step for rolling-restart-run4-postrebalance-drain-run15-main
- No longer current: Do not use this proof to claim parent statistical closure, patch load-lane admission from playback labels, return to election/deconcentration, or broadly discount ACTIVE replica operations.

## Continuation
- Status: allowed
- Next action: No open frontier remains; inspect solve report.
- Blocker: none

## Scope Pressure
- Changed files: 1
- Owner areas: test/distributed/harness
- Categories: runtime
- Split plan:
  - test/distributed/harness: 1 file(s)
- Signal: mixed-runtime-and-harness severity=medium

## Frontiers
- **rolling-restart-run4-postrebalance-drain-run15-main** [solved] rung 1, attempts 1, metric 0 -> 0

## Findings
- **rolling-restart-run4-postrebalance-drain-run15-main**: Subagent verification accepted the run15 post-rebalance closure proof: the deterministic fixture pins publication/CDC closed, operation_drain_open plus no_over_target_open, raw in-flight 6, stale in-flight 3, additional discount 1, effective in-flight 2, and membership trim unavailable behind operation drain; the Quest constraints avoid parent Wilson closure and broad ACTIVE discount claims. (rules out: Do not use this proof to claim parent statistical closure, patch load-lane admission from playback labels, return to election/deconcentration, or broadly discount ACTIVE replica operations.) [subagent:019f1827-1497-7140-a292-ba1f8e5301a0; subagent:019f1823-cb72-7051-9a90-63f35f42d4f8; subagent:019f1823-e03e-7ad0-9e6d-1e14aa92351d; solve/oracle/rolling-restart-run4-postrebalance-drain-run15.json]

## Theories
_(none recorded)_

## Selected Theories
_(none selected)_

## Theory Results
_(none recorded)_

## Attempt log
| ts | frontier | rung | metric | result | blocker movement | theory | change |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 2026-06-30T10:55:02.615Z | rolling-restart-run4-postrebalance-drain-run15-main | observe | 0 -> 0 | flat | no_evidence |  | diff:solve/changes/rolling-restart-run4-postrebalance-drain-run15/run15-postrebalance-drain-proof.diff |
