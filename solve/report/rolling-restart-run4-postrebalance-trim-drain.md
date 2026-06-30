# Solve report: rolling-restart-run4-postrebalance-trim-drain

**Goal:** Run3-shaped post-rebalance closure has deterministic local owner proof: publication/readiness are closed, priority residual witnesses are absent, spread_satisfied_in_flight priority progress no longer blocks membership steady-trim retirement, and the remaining operation_workflow_owner wait is represented without broad ACTIVE discounts or parent Wilson closure.

**Class:** process · **Closure:** DECISION

**Outcome:** SOLVED (DECISION) — evidence: solve/oracle/rolling-restart-run4-postrebalance-trim-drain.json

**Attempts:** 1

## Links
- roadmap row: RM-0.1-fs-rolling-restart
- spec: membership-lifecycle-placement-hard-cutover
- parent quest: rolling-restart-run4-drain-residual
- plan: solve/epics/topology-convergence-hardening.md

## Current Blocker
- Frontier: rolling-restart-run4-postrebalance-trim-drain-main
- Owner: unknown
- Boundary: unknown
- Dominant reason: unknown
- Mechanism: unknown
- Movement: no evidence recorded
- Latest evidence: none
- Selected theory: theory-run3-membership-trim-owner-normalized-priority (stale: selected theory status is needs-rerun)
- Next move: record or select a fresh frontier theory for rolling-restart-run4-postrebalance-trim-drain-main

## Continuation
- Status: allowed
- Next action: No open frontier remains; inspect solve report.
- Blocker: none

## Scope Pressure
- Changed files: 3
- Owner areas: src/control-plane, test/control-plane
- Categories: runtime, test
- Split plan:
  - src/control-plane: 2 file(s)
  - test/control-plane: 1 file(s)
- Signals: none

## Frontiers
- **rolling-restart-run4-postrebalance-trim-drain-main** [solved] rung 1, attempts 1, metric ? -> 0

## Findings
- **rolling-restart-run4-postrebalance-trim-drain-main**: Subagent verifier approved source changes after closure-only priority owner evidence was wired through candidate derivation and covered by focused tests [subagent:019f192d-1e48-7442-a6a8-4fc26f5060a9]

## Theories
- **theory-run3-membership-trim-owner-normalized-priority** [needs-rerun] frontier, frontier rolling-restart-run4-postrebalance-trim-drain-main, layer ownership, mechanism membership publication steady-trim consumes raw priorityRecoverySpreadGapPending and keeps a stale published node when priority recovery is only spread_satisfied_in_flight with no unresolved residual witnesses, owner topology_publication_owner, boundary membership_publication_target_selection, modelGate npm run model:contracts

## Selected Theories
- **rolling-restart-run4-postrebalance-trim-drain-main**: theory-run3-membership-trim-owner-normalized-priority

## Theory Results
- **theory-run3-membership-trim-owner-normalized-priority**: needs-rerun (scenario=done, theory=needs-rerun, movement=no_evidence) [solve/oracle/rolling-restart-run4-postrebalance-trim-drain.json]

## Attempt log
| ts | frontier | rung | metric | result | blocker movement | theory | change |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 2026-06-30T15:46:10.936Z | rolling-restart-run4-postrebalance-trim-drain-main | observe | ? -> 0 | flat | no_evidence | theory-run3-membership-trim-owner-normalized-priority | diff:solve/changes/rolling-restart-run4-postrebalance-trim-drain/membership-trim-owner-normalized-priority.diff |
