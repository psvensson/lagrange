# Solve report: formation-promoted-voter-not-voter-ready-routable-60s

**Goal:** SEALED RESULT: on cold formation of a critical control-plane ledger partition (canonically replica_operations-p1 / sql_transactions-p1) that transiently reaches 4 raft voters over target 3, the 4th replica that PROMOTED to raft-voter reaches voter-ready-ROUTABLE (context.isVoterReadyRoutableReplica true, src/rebalancer/priority-publication-safety-topology.js) within the executor's 60s voter-ready window — so the promotion guard's would_exceed_target deferral AND the drain floor's would-drop-voter-ready-below-minimum deferral both RELEASE, the transient raft-voter surplus resolves, and the dependent [2/4] ratings-load provisioning proceeds. This is the binding root the s13/s14 diagnosis chain and the REVERTED CL-045 both point to: on the real deadlock run the deferral SUB-reason distribution is dominated by would_exceed_target (345, promotion guard, activeVoterCount 4-5/target 3) and would-drop-voter-ready-below-minimum 2/3 (318, drain floor) — while the concurrent-op serialization is only 20; see the EXONERATED sibling quest formation-ledger-over-target-surplus-drain-coupled-removal (its RUNG-1 proved the CL-043 coupled-removal lever is a re-tread of reverted CL-045, and that the '4->3 drain is safe' premise is FALSE live because the floor counts voter-READY not raft-voters: only 3 of 4 raft voters are voter-ready, so draining -> 2 < min 3 and the floor CORRECTLY refuses). Both dominant deferrals are correct-by-design protection that RELEASES the instant the 4th voter becomes voter-ready-routable — so the single load-bearing question is: WHY does a promoted raft-voter fail to reach voter-ready-routable within 60s? RUNG 1 (mandatory, DT-first, discovery NEVER on the live demo) must reproduce the promoted-but-not-routable state deterministically AND disambiguate WHICH axis of isVoterReadyRoutableReplica fails to clear within the window: (a) the TOPOLOGY axis isVoterReadyReplicaTopology(row) — the promoted replica's raft_role/status not reaching voter-ready ON THE EVALUATING NODE (services-row raft_role CDC propagation lag to the evaluating node; the LEARNER_PROMOTION_PRIORITY_RECOVERY_DELAY_MS ~5s promotion-stability floor; or the s13 status-column-vs-raft_role-column read disagreement where the promoted voter's status lags at creating/syncing while raft_role=follower), OR (b) the ROUTING axis isNodeReadyForRouting(node_id) — the HOST NODE not routing-ready (isClusterMemberHealthy stale-heartbeat = prior MODE-A; ready_lease_expires_at / lease sweep; connection_state; the readiness-veto / hysteresis-consolidation node-liveness path). Do NOT seal a fix lever until the binding axis is confirmed against the deterministic reproduction (the s14/CL-045 chain repeatedly mis-attributed the sub-reason — break down the ACTUAL failing predicate axis, do not assume). The fix repairs whichever axis is confirmed live so the promoted voter becomes routable within the window, WITHOUT weakening the promotion guard or the drain floor (both are correct-by-design and must keep protecting quorum until the voter is genuinely routable), WITHOUT raising the 60s voter-ready bound or any provisioning/admission budget (TEST-0021), and reading authoritative actuals (raft_role voter-ready + node routing readiness), never targets, per doctrine state-encoding (ARCH-0080/0084). VETTED-DEAD / do-NOT-retread: relaxing the CL-043 concurrent-op serialization (== reverted CL-045, 0/0/1 live, 20-of-345 non-binding — the sibling quest's exonerated lever); relaxing/loosening the drain floor or promotion guard themselves (they release once the voter is routable; loosening them re-permits a real quorum-unsafe removal / over-promotion); app-tier coupled removal at the serialization layer (the sibling's dead class); raising the 60s or provisioning budgets (masking). doneWhen (machine oracle) = a deterministic in-process reproduction red-on-reverts the routability fix AND the promoted 4th voter reaches voter-ready-routable within the window so BOTH the would_exceed_target and would-drop-voter-ready-below-minimum deferrals release and the surplus resolves, reproduced by scenario-harness 3x consecutive. LIVE-VALIDATION SIGNAL (necessary-not-sufficient, NOT part of the seal): a 2-pre/2-post affinity-demo A/B shows the 'did not become voter-ready within 60000ms' timeouts drop to 0, the would_exceed_target / would-drop-below-minimum deferrals collapse, and [2/4] ratings load completes with NO interlock / progress-write amplification.

**Class:** product · **Closure:** MEASURED

**Outcome:** EXHAUSTED — 1 frontier(s) parked; human decision needed

**Attempts:** 1

## Links
- parent quest: formation-ledger-over-target-surplus-drain-coupled-removal
- plan: solve/changes/formation-ledger-over-target-surplus-drain-coupled-removal/rung1-lever-exonerated-cl045-retread.md

## Current Blocker
- Frontier: formation-promoted-voter-not-voter-ready-routable-60s-main
- Owner: unknown
- Boundary: unknown
- Dominant reason: unknown
- Mechanism: unknown
- Movement: no evidence recorded
- Latest evidence: none
- Selected theory: none
- Next move: continue supervised step for formation-promoted-voter-not-voter-ready-routable-60s-main
- No longer current: RUNG-1 ROUTING-axis fix as the current binding lever (would_drop/isVoterReadyRoutableReplica path does not fire on HEAD)

## Continuation
- Status: allowed
- Next action: No open frontier remains; inspect solve report.
- Blocker: none

## Scope Pressure
- Changed files: 1
- Owner areas: test/rebalancer
- Categories: runtime
- Split plan:
  - test/rebalancer: 1 file(s)
- Signals: none

## Frontiers
- **formation-promoted-voter-not-voter-ready-routable-60s-main** [parked {exhausted}] rung 0, attempts 1, metric ? -> ? — Operator PARK-AND-PIVOT (2026-07-09 decision, recorded in the altitude reflection): RUNG-2 (c7057af4, 12 instrumented runs, both transports) proved the sealed symptom (voter-ready-60s timeout wedging the drain floor) does not reproduce on HEAD — 0/12 on all three sealed signals; the shipped s14 fixes (bf535665, 1ff668b8) closed the routability wedge. No honest remaining move exists within this seal; the demo's actual binding blocker (operation_ledger_quorum_concentrated under REPLACE churn) is a different owner boundary, pursued by successor quest formation-ledger-quorum-concentrated-replace-churn-60s.

## Findings
- **formation-promoted-voter-not-voter-ready-routable-60s-main**: non-measuring sample (1/3): harness produced no trustworthy metric; holding the rung for retry rather than climbing toward an unearned exhausted park
- **formation-promoted-voter-not-voter-ready-routable-60s-main**: RUNG-2 (instrumented live reproduction, 12 runs: 5 local + 7 docker, converged+failed): the quest's sealed target symptom does NOT reproduce on HEAD. voter-ready-60s timeouts=0/12, drain-floor would-drop-voter-ready-below-minimum=0/12, TEMP-VDIAG-RUNG2 routing-axis-block=0/12 (instrumentation on the real isVoterReadyRoutableReplica, reverted). The over-target 4-voter surplus still forms intermittently (would_exceed 13x on replica_operations-p1, one docker run) but resolves within the window without a timeout; when it forms its voters are routable. Demo's actual binding blocker on HEAD = operation_ledger_quorum_concentrated (20-219x/docker run) under REPLACE churn = over-target/concentration domain (EXHAUSTED sibling), NOT voter-ready-routability. RUNG-1 ROUTING axis was inferred from the phase2 345+318 co-firing; the would_drop half does not materialize on HEAD so its premise is absent. Shipped s14 fixes (Part-1 bf535665, orphan-census 1ff668b8) appear to have closed the routability wedge. GOALPOST: sealed symptom not reproducing -> user decision pending (park+pivot-to-concentration vs bigger-batch vs defensive-fix). (rules out: RUNG-1 ROUTING-axis fix as the current binding lever (would_drop/isVoterReadyRoutableReplica path does not fire on HEAD)) [solve/changes/formation-promoted-voter-not-voter-ready-routable-60s/rung2-symptom-not-reproducing-on-head.md]

## Theories
_(none recorded)_

## Selected Theories
_(none selected)_

## Theory Results
_(none recorded)_

## Attempt log
| ts | frontier | rung | metric | result | blocker movement | theory | change |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 2026-07-09T19:52:00.742Z | formation-promoted-voter-not-voter-ready-routable-60s-main | observe | ? -> ? | flat | no_evidence |  | diff:solve/changes/formation-promoted-voter-not-voter-ready-routable-60s/rung1-axis-disambiguation.diff |
