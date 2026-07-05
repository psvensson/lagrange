# Solve report: formation-ledger-quorum-spread-first

**Goal:** Formation on a 5-node cluster never leaves the operation ledger's quorum concentrated on the seed while dependent control-plane moves proceed: in run-22 the ledger self-move relocated only LEADERSHIP to another node, the run-20 interlock released 200ms later with followers r2,r3 still on the overloaded seed, every ledger commit thereafter needed the seed's ack (1s query / 30s commit timeouts), and the resulting write starvation cascaded — step transitions ghosted (stale PENDING/SENDING rows hiding created/voter-ready replicas), the new leader's reconciliation lane froze 2m33s behind one 30s commit timeout, dedupe and the interlock went ledger-blind (duplicate REPLACE ccff2762 mutually blocking 25c9ce61's source removal; second self-move ca191926), and the planner's corrective follower move could not complete because its removal step required the very ledger commits it was meant to heal (circular-dependency-class-formation-vs-steady-state at the ledger-placement level). The fix subordinates formation control-plane moves to the ledger's FULL quorum spread: ledger spread moves (leader AND followers) are planned and admitted first — classified emergency on quorum-concentration evidence, not only publication-reported spread blockage — and dependent REPLACE admission holds until ledger commits no longer require the concentrated node; no timeout or budget is raised. Proven FIRST by a deterministic in-process composition of the real planner/budget/interlock machinery with a slow-seed fault, red-on-reverting the ordering invariant (a dependent REPLACE admitted while the ledger quorum still pins to the slow seed), and then by the live affinity demo's formation settling completing with the ratings load surviving phase 2.

**Class:** product · **Closure:** MEASURED

**Outcome:** SOLVED (MEASURED) — evidence: test-output/reports/formation-ledger-quorum-spread-first-2026-07-05T07-55-17-425Z.report.json

**Attempts:** 1

## Links
- parent quest: movielens-affinity-placement-demo

## Current Blocker
- Frontier: formation-ledger-quorum-spread-first-main
- Owner: unknown
- Boundary: unknown
- Dominant reason: unknown
- Mechanism: unknown
- Movement: no evidence recorded
- Latest evidence: none
- Selected theory: none
- Next move: continue supervised step for formation-ledger-quorum-spread-first-main

## Continuation
- Status: allowed
- Next action: No open frontier remains; inspect solve report.
- Blocker: none

## Scope Pressure
- Changed files: 14
- Owner areas: scripts/run-formation-ledger-quorum-spread-first-scenarios.js, src/query, src/rebalancer, test/convergence
- Categories: other, runtime, test
- Action: split by owner area before the next attempt (14 files)
- Action: land or separate 4 owner areas: scripts/run-formation-ledger-quorum-spread-first-scenarios.js, src/query, src/rebalancer, test/convergence
- Split plan:
  - src/rebalancer: 10 file(s)
  - test/convergence: 2 file(s)
  - scripts/run-formation-ledger-quorum-spread-first-scenarios.js: 1 file(s)
  - src/query: 1 file(s)
- Signal: broad-source-scope severity=medium
- Signal: large-diff-stack severity=medium

## Frontiers
- **formation-ledger-quorum-spread-first-main** [solved] rung 1, attempts 1, metric 0 -> 0

## Findings
- **formation-ledger-quorum-spread-first-main**: RUNG 1 (c-dt-first) REPRODUCTION COMPLETE at test/convergence/dt6-formation-ledger-quorum-spread-first.test.js. Composition: REAL createOperation admission chain (run-20 ledger interlock, lanes, budget) on a real RebalanceCoordinator with ACTUAL placement rows through the systemTableCache seam; MODELED: tick-driven workflow folding with the run-20 fault model extended by the concentration dimension (a ledger progress write fails exactly while the ledger quorum is CONCENTRATED — no majority without the hottest node — AND >1 live operation contends; run-22's first self-move completed precisely because it ran alone pre-storm), driver-applied placement effects on spread completion (production: CDC). MEASURED ON HEAD: (a) run-22 gap scenario RED — start = post-first-self-move placement (leader relocated, both followers on seed, concentrated); dependents admit into the concentrated window (nothing holds them between spread moves), wedge PENDING forever on failing ledger writes, and the LATE second spread can never admit into a non-idle ledger, so concentration never clears — the exact live cascade; (b) bootstrap scenario RED — fully-concentrated start; the first spread runs alone (run-20 interlock serializes correctly) but its completion releases the sibling hold while the quorum is STILL concentrated, dependents flood in, wedge; (c) CONTROLS GREEN — already-spread ledger: same storm completes with zero write failures (fault is concentration-gated); infeasible-spread (single-node): no hold may engage, lone op completes; (d) determinism proven. DT trap fixed in the driver: two same-partition ledger REPLACEs get DEDUPED into one operation (Reusing in-flight) — the coalescing guard must verify operation.targetNodeId against the requested move, not just partition+type.
- **formation-ledger-quorum-spread-first-main**: IMPLEMENTATION + SOURCE-CHANGE SUBAGENT VERIFICATION (constraints c-vet + source-change-subagent-verification satisfied; design vet scratchpad vet-quorum-concentration-hold-design.md verdict AMEND with 3 amendments folded in; implementation verifier scratchpad verify-quorum-spread-first-implementation.md verdict FIX-FIRST with 3 items, ALL FIXED). REUSED vs EXTENDED vs NEW: REUSED — the run-20 interlock file/error channels/typed-reason plumbing (the hold lives in the same owner boundary and rides createOperationLedgerInterlockError), the existing TRANSIENT_PROVISIONING_SHORTFALL_REASONS set (3 reason codes added), the existing planning-gate operationCreationRequired predicate (one evidence arm added); EXTENDED — isPriorityRecoveryOperationCreationRequiredForPlanningGate now consults the coordinator's quorum-concentration evidence (the verifier TRACED my deferral of this as a REACHABLE PERMANENT WEDGE: the hold itself sustains PRIORITY_CONTROL_PLANE_RECOVERY_PENDING by blocking non-emergency priority cures, and a concentration-sustained second readiness reason closes the LOCAL_SERVE planning gate loop — cure never planned, hold never releases; the run-22 '75s bounded' rationale was contingent, not guaranteed); NEW — only src/rebalancer/operation-ledger-quorum-concentration.js (shared pure predicate over placement actuals). VERIFIER FINDINGS ACTED ON: (1) my emergency-budget-scope classification was INERT (scope is only the single-flight mutex key; admitted limits come from partition CLASS via evaluatePriorityAddAdmission, and replica_operations is already emergency-class) — DELETED per the reuse directive rather than shipped as a no-op; residual cure budget contention inside a pre-hold wedge stays bounded by CL-043 staleness (~60-70s) and is prevented going forward by the hold keeping dependents out of the lane; (2) planner-gate extension implemented (coordinator owns placement actuals, planner asks via rebalanceCoordinator.isOperationLedgerQuorumConcentratedForPartition) + regression subtest; (3) DDL transient-set comment rewritten to its TRUE effect (lowers the provisioning fallback minimum so partially-held creates proceed under-planned) with the full-hold fail-fast OWNED explicitly as the recorded DDL-pacing follow-up; (4) WARN-throttle zero-init nit fixed (null-init). VERIFIER PASSES: predicate math incl. 1-voter/2-voter shapes (deficit ADD cure is exempt+emergency; permanent 2-at-target unreachable, replica_count floor 3), REMOVING-row counting matches real raft membership, single interlock-wrapped create path with no bypass, blast radius zero strict assertions (11 at-risk files 638 asserts green). ACCEPTED RESIDUALS (recorded): feasibility reads raw connection_state without lease/serve-eligibility (hold can outlast a dead-node window; WARN-observable), over-target feasibility arm and budget-saturated path not DT-exercised, production row-transition sequence modeled not replayed. USER DIRECTIVE FOLDED IN: complexity ratchet run locally BEFORE commit — my last two sessions' commits pushed the count 1857->1866; all 7 net-new violations refactored under threshold plus 2 pre-existing in touched files (persistOperationUpdate, executeMove) brought under; ratchet passes at <=1857. dt:prove re-proven on the final code (artifact solve/changes/dt-prove/dt6-formation-ledger-quorum-spread-first.test.js-2026-07-05T07-49-17-649Z.json).

## Theories
_(none recorded)_

## Selected Theories
_(none selected)_

## Theory Results
_(none recorded)_

## Attempt log
| ts | frontier | rung | metric | result | blocker movement | theory | change |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 2026-07-05T07:55:35.166Z | formation-ledger-quorum-spread-first-main | observe | 0 -> 0 | flat | no_evidence |  | diff:solve/changes/formation-ledger-quorum-spread-first/fix-ledger-quorum-spread-first.diff |
