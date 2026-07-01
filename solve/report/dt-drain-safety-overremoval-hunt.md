# Solve report: dt-drain-safety-overremoval-hunt

**Goal:** Directed PCT interleaving hunt on the DT6-hosted REAL RebalanceCoordinator + OperationWorkflowOwner finds-or-bounds safety-invariant breaches on two targets: (1) the self-documented over-removal seam in projectQuorumAfterRemoval (the optimistic recoveryProjectionNodeIds node-union on the completion-safe floor path) and (2) source-removal-only-after-target-durably-active drain ordering. Terminal is BINARY: a minimized seed that deterministically breaches the invariant with red-on-revert proof, OR a bounded 'no breach at PCT depth <= D over >= N seeds' negative. This is the dst-cost-model-circle epic's Option-A (safety / design-bug) lane and makes NO scenario passRate / cost-model fidelity claim.

**Class:** product · **Closure:** DECISION

**Outcome:** SOLVED (DECISION) — evidence: solve/oracle/dt-drain-safety-overremoval-hunt.json

**Attempts:** 1

## Links
- plan: solve/epics/dst-cost-model-circle.md

## Current Blocker
- Frontier: dt-drain-safety-overremoval-hunt-main
- Owner: unknown
- Boundary: unknown
- Dominant reason: unknown
- Mechanism: unknown
- Movement: no evidence recorded
- Latest evidence: none
- Selected theory: none
- Next move: continue supervised step for dt-drain-safety-overremoval-hunt-main
- No longer current: Do NOT ship the blunt COMPLETION_SAFE_FLOOR strict-floor fix - it breaks deliberately-tested optimistic-dispatch behavior (source-not-leader / spread-satisfied-in-flight). Any real fix must be narrow (the irreversibility/persistent-under-quorum path), gated on the residual question, not the predicate.

## Continuation
- Status: allowed
- Next action: No open frontier remains; inspect solve report.
- Blocker: none

## Scope Pressure
- Changed files: 1
- Owner areas: solve
- Categories: workflow
- Split plan:
  - solve: 1 file(s)
- Signals: none

## Frontiers
- **dt-drain-safety-overremoval-hunt-main** [solved] rung 1, attempts 1, metric 0 -> 0

## Findings
- **dt-drain-safety-overremoval-hunt-main**: STEP-1 DE-DUP + FEASIBILITY READ (subagent aa4848030035daf79 + own cross-read of the evaluator seam). (Q1) T1 UNCOVERED: the only test on the optimistic union (test/rebalancer/operation-workflow-remove-safety-quorum-predicate.test.js:48-60) asserts floorSatisfied===true, PINNING the seam open as behavior-preserving; no test asserts the over-removal is wrong. (Q4) T1 REACHABLE: recoveryProjectionNodeIds is built from projected/eligible MEMBERSHIP ids (operation-workflow-remove-safety-membership.js:21-25 -> active-node-projection.js:676-677) with NO voter-ready filter, so a projected-active node whose replica is still a catch-up learner enters the union and can inflate effectiveProjectedVoterReadyCount past the strict minReplicaCount floor, permitting a removal the strict floor blocks; the evaluator header (evaluator.js:42-45) itself flags 'a future over-removal fix'. (Q2) T2 COVERED (cl-038-source-removed-handoff-terminalizes.test.js:120-143 asserts source-removal-after-target-active adversarially) -> DROP T2. (Q3) Step A / DT6 hosting is BIGGER-THAN-SCOPED (needs the deferred op-store fixture PLUS a control-plane readiness-snapshot fixture: getPriorityRecoveryPlanningSnapshotBestEffort -> resolveActiveNodeViews) AND UNNECESSARY: T1 is provable at the PURE synchronous evaluator seam. VERDICT: PROCEED on T1 at the pure seam; drop T2; do NOT build Step A. HONESTY CAVEAT: a pure-seam test that the evaluator ACCEPTS the optimistic input only proves the documented accept-gap; the BUG-FOUND terminal additionally requires showing the accept can cause a real below-true-floor / data-loss outcome (learner never catches up), else it is benign optimism -> bounded-no-breach. (rules out: Do not build DT6 hosting or the PCT scheduler for T1 - it is provable at the pure evaluator seam; DT6 hosting is escalation-only if real-harm reachability needs a live interleaving. Do not pursue T2 (covered). A unit test that the evaluator accepts the optimistic union is NOT by itself a bug - must show real below-floor harm.)
- **dt-drain-safety-overremoval-hunt-main**: HUNT RESULT (NOT a clean bug-found; the honesty caveat fired). The pure-predicate over-removal accept is REAL and reachable (subagent a18bfa45 traced the full chain: a REPLACE remove in the SPREAD_SATISFIED_IN_FLIGHT grace window has completion.blocked!==true while the target is still a learner -> completionSafe bypasses the strict floor at evaluator.js:559 -> the optimistic union floor at :611-626 counts an unfiltered projected-membership learner). BUT implementing the documented strict-floor fix (require projectedVoterReadyCount>=min on COMPLETION_SAFE_FLOOR) and running the suite REFUTED it as a clean fix: the dispatch layer DELIBERATELY relies on the optimism. Blast radius = 3 test files break, incl. quorum-conditioned-remove-safety.test.js 'dispatches priority REPLACE source removal when recovery completion is spread-satisfied in flight AND SOURCE IS NOT LEADER' - an INTENDED, tested optimistic dispatch, guarded (leader-source goes through separate leader-handoff defer; grace-window bounds future optimism). So predicate-accept is necessary-but-not-sufficient for harm; the blunt fix breaks intended liveness. Changes reverted, tree clean (201/201). RESIDUAL narrow real-harm question (the only remaining bug candidate): source-removal is IRREVERSIBLE, but the grace window only stops FUTURE optimism - so if a non-leader source is optimistically removed and the target then never becomes voter-ready, is there a PERSISTENT under-quorum, or does the actual raft config-change execution separately gate on target readiness (dispatch != execution)? That is a NARROW end-to-end question, NOT a predicate fix. (rules out: Do NOT ship the blunt COMPLETION_SAFE_FLOOR strict-floor fix - it breaks deliberately-tested optimistic-dispatch behavior (source-not-leader / spread-satisfied-in-flight). Any real fix must be narrow (the irreversibility/persistent-under-quorum path), gated on the residual question, not the predicate.)
- **dt-drain-safety-overremoval-hunt-main**: CLOSURE: verdict bounded-no-breach (T1 is deliberate, guarded, recoverable optimism - NOT a safety bug). Residual-harm question resolved by a full dispatch->execution trace, adversarially refuted (subagent a70d66587 attacked both a re-entry bypass and the recoverability claim; both closed). Load-bearing facts (verified): GATE 1 - the REPLACE-remove ACTIVE dispatch defers a learner target at evaluator.js:513-533 via isVoterReadyReplicaTopology (topology.js:122-134), BEFORE the optimistic count floor matters (own read); STOPPING re-entry only retransmits an already-Gate-1-authorized removal (evaluator.js:367), no fresh below-quorum authorization. GATE 2 - execution is a local non-leader voter SELF-SHUTDOWN (service.shutdown), no removeVoter RPC / no joint-consensus config change (liferaft leave() is a local splice); majority() recomputes over live self-excluded peers so 3->2 keeps committing; rebalancer re-adds under-replicated partitions. The only residual is a latency/availability tail = the same run4 CPU-tail, not a persistent breach. The candidate strict-floor fix was implemented + REFUTED by blast radius (breaks intended optimistic-dispatch tests) and reverted (tree clean 201/201). Verdict artifact: solve/oracle/dt-drain-safety-overremoval-hunt.json. [solve/oracle/dt-drain-safety-overremoval-hunt.json; subagent:a70d66587d26fcc30; src/rebalancer/operation-workflow-remove-safety-evaluator.js:513-533; src/rebalancer/priority-publication-safety-topology.js:118-136]
- **dt-drain-safety-overremoval-hunt-main**: Ingested evidence from dt-drain-safety-overremoval-hunt.json. Metric: unknown -> 0. Verdict: unknown. Root cause: none. Dominant reason: none. Owner: none. Ingestion outcome: changed. [solve/oracle/dt-drain-safety-overremoval-hunt.json]

## Theories
_(none recorded)_

## Selected Theories
_(none selected)_

## Theory Results
_(none recorded)_

## Attempt log
| ts | frontier | rung | metric | result | blocker movement | theory | change |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 2026-07-01T08:06:26.561Z | dt-drain-safety-overremoval-hunt-main | observe | 0 -> 0 | flat | no_evidence |  | diff:solve/changes/dt-drain-safety-overremoval-hunt/verdict.diff |
