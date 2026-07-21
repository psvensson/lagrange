# Solve report: runtime-service-affinity-observer-intent-parity

**Goal:** For a runtime service carrying fresh non-empty data-affinity weights, the suboptimality observer and the placement intent share one decision: whenever isDataAffinityPlacementSuboptimal reports true, the same evaluation evidence yields a minted REPLACE toward an affinity-preferred feasible node through the existing full-score placement intent — or the observer does not report true — so detection can never latch without a cure. Modeled on the exact 2026-07-21T15:06:54 live ordering (svc-movielens-topn healthy 2 of desired 2 across 5 nodes, observer fired once on the affinity term, rebalance() ran and minted zero moves, weightedLocality stayed 0.000 for 300s with attributionRows=2 and working top-10), proven by a deterministic discriminator at the observer-intent seam that is red on current HEAD, with no new scoring formula (only the existing kernel terms and margins), no churn below the incumbent-retention margin, no flag or disable switch, byte-identical behavior for entities without preferDataAffinity, and the unchanged five-node MovieLens live scenario converging weightedLocality above zero once planning is admitted.

**Class:** product · **Closure:** MEASURED

**Outcome:** IN PROGRESS (no terminal recorded)

**Attempts:** 1

## Links
- spec: solve/epics/service-data-affinity-placement.md
- parent quest: runtime-service-add-creating-owner-rearm
- plan: solve/epics/topology-convergence-hardening.md

## Current Blocker
- Frontier: runtime-service-affinity-observer-intent-parity-main
- Owner: unknown
- Boundary: unknown
- Dominant reason: unknown
- Mechanism: unknown
- Movement: no evidence recorded
- Latest evidence: none
- Selected theory: none
- Next move: continue supervised step for runtime-service-affinity-observer-intent-parity-main

## Continuation
- Status: allowed
- Next action: continue supervised step for runtime-service-affinity-observer-intent-parity-main
- Blocker: none

## Scope Pressure
- Changed files: 3
- Change bytes: 14091
- Owner areas: src/rebalancer, test/rebalancer
- Categories: runtime
- Split plan:
  - src/rebalancer: 2 file(s)
  - test/rebalancer: 1 file(s)
- Signals: none

## Frontiers
- **runtime-service-affinity-observer-intent-parity-main** [open] rung 0, attempts 1, metric 1 -> 1

## Findings
- **runtime-service-affinity-observer-intent-parity-main**: Run-1 mechanism trace (immutable archive data/examples/service-data-affinity-demo-archive/run-2026-07-21T15-14-00-080Z.tar.gz, report movielens-lagrange-service-affinity-live-2026-07-21T15-10-38-912Z): the affinity detection chain is landed and FIRED — at 15:06:54.973 node-0 logged Suboptimal-rebalancing-state for svc-movielens-topn with healthy 2 of desired 2 across 5 nodes, which with count and spread satisfied can only be isDataAffinityPlacementSuboptimal (src/rebalancer/move-planner-state-methods.js:715-720 -> placement-owner-decision.js:478), proving nodeWeights were non-empty and a data-node challenger beat the off-data incumbents — yet rebalance() minted zero moves and weightedLocality stayed 0.000 (placementScore=0: both replicas hold none of the accessed data; metric computed by the production buildServiceDataAffinityWeights via examples/service-data-affinity/affinity-demo-evidence.js:47-74). Root asymmetry: the observer compares affinity-only over unfiltered readyNodes (placement-owner-decision.js:504) while the intent minter selects from capacity-filtered feasibleNodes under the full multi-dimensional score plus reservations (move-planner.js:305-308,650-680; placement-owner-decision.js:365-411), then pressure gating — so detection does not imply a cure. The one-line-only logging is a dedup blind to locality (rebalancer-evaluation-methods.js:116-126,169-184 signal excludes affinity), and the whole affinity decision path emits zero diagnostics. Secondary environmental starvation, out of this seal: the WAIT_CONTROL_PLANE_PRIORITY_STABILITY planning gate deferred non-system planning 160 times in the run (rebalancer-priority-recovery-planning-gate-methods.js:108-144) under 306 CL-017 CDC divergence hits, leaving only ~2 open planning windows before leadership loss at 15:10:23. [subagent:a04e0fbddfa8b3d7b]
- **runtime-service-affinity-observer-intent-parity-main**: Ledger prior-art: locality convergence requires policy assembly (getRuntimeServicePolicy, quest runtime-service-affinity-policy-lift, commit 4c0101b9), the full-score MovePlanner kernel with DATA_AFFINITY 16w vs INCUMBENT_MOVEMENT_COST 4 (quest placement-data-affinity-tier1b, 3ebff067), and the suboptimality observer re-planning trigger (quest runtime-service-affinity-suboptimality-observer, 1988437b) — the stack that produced three consecutive passes on 2026-07-20T15:41. Prior stalls: attributionRows=0 was the pk-projection authoritative-read drop, fixed 07-18; the 07-20 0.5-stall was the missing affinity term in isSuboptimalState plus the creating-owner wake seam, both fixed. The observer quest RECORDED an open bounded false-positive producing detect-without-cure (incumbent in the dominant-data latency group with zero node weight: trigger latches, scorer group term keeps incumbent, zero moves; candidate fix recorded: give the trigger the same AFFINITY_WEIGHT*groupWeight term so trigger and scorer share the full primary-score inequality — runtime-service-affinity-suboptimality-observer.md:27-28). Forbidden levers: no flag or disable switch (affinity is intrinsic, epic decision 2026-07-11), no new scoring formula, no churn below the retention margin, byte-identical for entities without preferDataAffinity, and reservation-based retainHealthyIncumbents hysteresis is REJECTED (symmetric-high freeze; the in-score retention margin is the chosen form). [subagent:a46c0a0890b067427]
- **runtime-service-affinity-observer-intent-parity-main**: DT red-on-revert proven for test/rebalancer/unified-rebalancer-affinity-policy-refetch-parity.test.js [dt:solve/changes/dt-prove/unified-rebalancer-affinity-policy-refetch-parity.test.js-2026-07-21T17-43-36-977Z.json]

## Theories
_(none recorded)_

## Selected Theories
_(none selected)_

## Theory Results
_(none recorded)_

## Attempt log
| ts | frontier | rung | metric | result | blocker movement | theory | change |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 2026-07-21T17:45:55.266Z | runtime-service-affinity-observer-intent-parity-main | observe | 1 -> 1 | flat | no_evidence |  | diff:solve/changes/runtime-service-affinity-observer-intent-parity/attempt-1.diff |
