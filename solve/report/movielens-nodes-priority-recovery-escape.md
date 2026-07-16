# Solve report: movielens-nodes-priority-recovery-escape

**Goal:** The unchanged MovieLens service-affinity live scenario reaches PASS while ready-lease admission remains owner-authored, quorum-bounded, and fail-closed.

**Class:** product · **Closure:** MEASURED

**Outcome:** EXHAUSTED — 1 frontier(s) parked; human decision needed

**Attempts:** 1

## Links
- parent quest: movielens-authoritative-observation-watermark

## Current Blocker
- Frontier: movielens-nodes-priority-recovery-escape-main
- Owner: unknown
- Boundary: unknown
- Dominant reason: unknown
- Mechanism: topology_gap
- Movement: first blocker observed: FAIL
- Latest evidence: test-output/reports/movielens-lagrange-service-affinity-live-2026-07-16T16-08-27-003Z.report.json
- Selected theory: theory-20260716-nodes-p1-priority-recovery-escape-child (stale: selected theory status is falsified)
- Next move: record or select a fresh frontier theory for movielens-nodes-priority-recovery-escape-main
- No longer current: Do not ship or re-approve the nodes-p1 advance-now classification from deterministic engagement alone; retain only if independent aggregate review can reconcile the measured no-improvement and error-amplification evidence.; Do not approve, ship, or retain this exact aggregate on deterministic safety and engagement alone. A future candidate needs the amplification removed or explained and an interleaved A/B with non-regressed aggregate load plus meaningful outcome or sealed-milestone movement.

## Continuation
- Status: allowed
- Next action: No open frontier remains; inspect solve report.
- Blocker: none

## Scope Pressure
- Changed files: 6
- Change bytes: 10850
- Owner areas: src/bootstrap, test/bootstrap, test/control-plane, test/rebalancer
- Categories: runtime, test
- Action: land or separate 4 owner areas: src/bootstrap, test/bootstrap, test/control-plane, test/rebalancer
- Split plan:
  - test/bootstrap: 2 file(s)
  - test/rebalancer: 2 file(s)
  - src/bootstrap: 1 file(s)
  - test/control-plane: 1 file(s)
- Signal: broad-source-scope severity=medium

## Frontiers
- **movielens-nodes-priority-recovery-escape-main** [parked {exhausted}] rung 1, attempts 1, metric 1 -> 1 — The only sealed intervention—classifying nodes-p1 for the existing quorum-bounded priority-recovery lane—is checkpointed and live-engaged, but a fresh measured run remains blocked upstream by operation-ledger completion continuity. Any further source change would cross the Quest's explicit intervention constraint, and another unchanged live run cannot distinguish the successor response-loss, pre-hydration, ledger-persistence, or event-loop theories.

## Findings
- **movielens-nodes-priority-recovery-escape-main**: On the current pinned source, the five-node real checkRebalance discriminator reproduced the predicted cycle: nodes-p1 performed zero evaluations and scheduled a 75000ms settling retry with three recovery-eligible nodes, while the established priority partition proceeded; the new expectations were the only failures. (rules out: Do not change heartbeat priority, lease validity, admission, or live budgets; test only canonical recovery classification.) [test/rebalancer/unified-rebalancer-triggers-critical-deferral.test.js]
- **movielens-nodes-priority-recovery-escape-main**: Independent verification approved the exact nodes priority-recovery attempt: quorum and readiness ownership remain fail-closed, no lease or node status is synthesized, ordinary services-p1 stays blocked, canonical inventory is data-owned, focused and adjacent tests and model contracts pass. [subagent:verify_nodes_priority_escape]
- **movielens-nodes-priority-recovery-escape-main**: The attempt's automatic flat metric reused the 2026-07-16T12:23:19 pre-change live report, so it is not a post-change discriminator. Exact verification and the red-on-revert owner-path proof support the mechanism; the live outcome remains unknown until one fresh unchanged run. (rules out: Do not interpret the reused pre-change report as a fresh live falsification or launch more source work before the approved one-run live discriminator.) [solve/changes/dt-prove/unified-rebalancer-triggers-critical-deferral.test.js-2026-07-16T15-47-59-276Z.json]
- **movielens-nodes-priority-recovery-escape-main**: Ingested evidence from movielens-lagrange-service-affinity-live-2026-07-16T16-08-27-003Z.report.json. Metric: 1 -> 1. Verdict: FAIL. Root cause: none. Dominant reason: none. Owner: none. Ingestion outcome: changed. [test-output/reports/movielens-lagrange-service-affinity-live-2026-07-16T16-08-27-003Z.report.json]
- **movielens-nodes-priority-recovery-escape-main**: The fresh post-checkpoint run proves the nodes-p1 priority-recovery mechanism engaged but cannot close the sealed live scenario: an authoritative nonterminal replica_operations self-REPLACE remained the binding hold while exact target-side physical leadership progressed, dependent nodes-p1 was correctly deferred, and the seed-shared admin observation lane became unavailable. The binding owner moved upstream from system-partition classification to the operation-ledger physical-completion-to-authoritative-terminal handoff; this Quest's sealed intervention constraint permits no further in-scope source move. (rules out: Do not rerun live unchanged, weaken the authoritative-terminal hold, widen budgets, retry faster, treat observation as readiness, or add more nodes classification exceptions in this Quest.) [data/examples/service-data-affinity-demo-archive/wave4-live-nodes-priority-recovery-escape-2026-07-16T16-08-27-003Z.tar.gz]
- **movielens-nodes-priority-recovery-escape-main**: Independent aggregate review rejected release handoff: the exact patch is byte-identical, focused checks pass, and safety remains fail-closed, but converting nodes-p1 from a 75000ms defer to advance-now recovery evaluation is a hot recovery/backoff change that lacks the mandatory controlled live A/B evidence of at least two fixed and two reverted runs. [subagent:design_completion_discriminator]
- **movielens-nodes-priority-recovery-escape-main**: Controlled live A/B at fixed 54b672c4 versus exact one-line reversion ebf651ea satisfied the TEST-0022 sample floor and was not inert: both fixed runs emitted 40 nodes-p1 priority planning diagnostics and created operations, while reverted emitted none. All four runs still failed at replica_operations_in_flight; fixed ended at 3 and 4 versus reverted 2 and 2, and fixed produced 5622 aggregate level-50 events versus 1711 reverted over near-equal durations, dominated by repeat WebSocket/reconnection pairs. The advance-now classification therefore shows no outcome improvement and consistent error amplification pending independent aggregate verdict. (rules out: Do not ship or re-approve the nodes-p1 advance-now classification from deterministic engagement alone; retain only if independent aggregate review can reconcile the measured no-improvement and error-amplification evidence.) [solve/changes/movielens-nodes-priority-recovery-escape/live-ab-summary.json]
- **movielens-nodes-priority-recovery-escape-main**: Independent aggregate verification rejects release of the exact nodes-p1 priority classification. TEST-0022/0023's N=2 fixed versus N=2 reverted collection floor is now satisfied and the mechanism was non-inert, but outcome remained FAIL 0/2 in both arms, fixed ended with 3 and 4 in-flight operations versus 2 and 2 reverted, and duration-matched fixed logs contained 5622 level-50 events versus 1711 reverted (3.29x), with nodes-linked warnings 344 versus 29. The advance-now work engaged without sealed improvement and showed the load-amplification risk the rules require the A/B to catch. (rules out: Do not approve, ship, or retain this exact aggregate on deterministic safety and engagement alone. A future candidate needs the amplification removed or explained and an interleaved A/B with non-regressed aggregate load plus meaningful outcome or sealed-milestone movement.) [subagent:design_completion_discriminator]
- **movielens-nodes-priority-recovery-escape-main**: Ingested evidence from movielens-lagrange-service-affinity-live-2026-07-16T16-08-27-003Z.report.json. Metric: 1 -> 1. Verdict: FAIL. Root cause: none. Dominant reason: none. Owner: none. Ingestion outcome: changed. [test-output/reports/movielens-lagrange-service-affinity-live-2026-07-16T16-08-27-003Z.report.json]

## Theories
- **theory-20260716-nodes-placement-readiness-circularity-child** [active] system, mechanism nodes-p1 placement depends on ready leases whose durable publication depends on spreading nodes-p1, owner system-partition classification and UnifiedRebalancer priority recovery owner, modelGate npm run model:contracts
- **theory-20260716-nodes-p1-priority-recovery-escape-child** [falsified] frontier, frontier movielens-nodes-priority-recovery-escape-main, layer ownership, mechanism nodes_p1_excluded_from_priority_recovery_class, owner system-partition classification owner, boundary nodes-p1 classification to UnifiedRebalancer quorum recovery gate, modelGate npm run model:contracts

## Selected Theories
- **movielens-nodes-priority-recovery-escape-main**: theory-20260716-nodes-p1-priority-recovery-escape-child

## Theory Results
- **theory-20260716-nodes-p1-priority-recovery-escape-child**: falsified (scenario=failed, theory=falsified, movement=no_evidence) [test-output/reports/movielens-lagrange-service-affinity-live-2026-07-16T12-23-19-124Z.report.json]
- **theory-20260716-nodes-p1-priority-recovery-escape-child**: supported (scenario=invalid, theory=supported, movement=narrowed) [solve/changes/dt-prove/unified-rebalancer-triggers-critical-deferral.test.js-2026-07-16T15-47-59-276Z.json]
- **theory-20260716-nodes-p1-priority-recovery-escape-child**: falsified (scenario=failed, theory=falsified, movement=no_previous) [test-output/reports/movielens-lagrange-service-affinity-live-2026-07-16T16-08-27-003Z.report.json]

## Attempt log
| ts | frontier | rung | metric | result | blocker movement | theory | change |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 2026-07-16T15:58:21.426Z | movielens-nodes-priority-recovery-escape-main | observe | 1 -> 1 | flat | no_evidence | theory-20260716-nodes-p1-priority-recovery-escape-child | diff:solve/changes/movielens-nodes-priority-recovery-escape/attempt-1.diff |
