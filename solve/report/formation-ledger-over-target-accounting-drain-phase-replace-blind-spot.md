# Solve report: formation-ledger-over-target-accounting-drain-phase-replace-blind-spot

**Goal:** The operation-ledger (replica_operations-p1) planner does NOT mint a spurious count-increasing ADD while a prior spread REPLACE's replacement is a promoting-but-not-yet-visible voter, so the ledger never exceeds targetReplicaCount during post-formation spread (steady state <= target on the 5-node MovieLens demo). ROOT (run-28 forensics + THREE adversarial verifications under the predecessor quest formation-ledger-spread-completion-self-move-interlock-deadlock, evidence solve/changes/formation-ledger-spread-completion-self-move-interlock-deadlock/verify-legc-{final,corrected}.md): the move planner's committed-voter read (computeInFlightAwareReplicaAccounting.activeCount / deficitEffectiveCount, in-flight-aware-replica-count.js) UNDERCOUNTS by 1 exactly when a REPLACE's SOURCE has left activeCount while its REPLACEMENT is a durable LEARNER not yet visible as an ACTIVE voter (the voter-visibility read path the SIBLING quest 136aebbc addressed on services.raft_role, NOT this count read). The deficit guards (move-planner-move-calculation-methods.js count-increasing-ADD deferral, the two DEFER_ADD_OVER_TARGET sites) then fire a deficit-fill ADD; when the learner promotes the ledger is +1 over target. CRITICAL CONSTRAINT (why count-based fixes FAIL): the fix must be ROW-OP-LINKED (credit only the SPECIFIC drain-phase REPLACE's replacement replica, excluding replacements already ACTIVE) or fix the committed-voter VISIBILITY read directly. Three refuted approximations, all recorded: (a) occupiedCount-only broke unified-rebalancer-move-calculation-state-evaluation.test.js 'stale syncing replicas without in-flight operations' (counts stale learners); (b) deficitEffectiveCount + all-phase-inFlightReplaceCount broke move-planner-critical-replace-serialization.test.js 'genuine deficit filled while a REPLACE drains' (net-neutral REPLACE double-credited); (c) min(occupiedSurplus, drainPhaseReplaceCount) DEGENERATES to occupiedCount>=target whenever drainPhaseReplaceCount>=surplus (the ~17-REPLACE spread window) AND double-counts a drain-phase REPLACE whose replacement already promoted to ACTIVE (source-removal dispatches AFTER promotion per workflow). MUST author DTs for all three refuted forms as anti-regressions plus the run-28 blind-spot repro; the three constraint tuples (active/occupied/inFlightAdd/drainPhaseReplace/target): stale-syncing 1/3/0/0->ADD, serialization 2/2/0/1->ADD, run-28 2/3/0/1->suppress, verifier-starvation 1/3/0/1->ADD. NOT in scope: the interlock deadlock (predecessor SOLVED via cache-bypassing self-move re-verify); raising timeouts/budgets; weakening run-20/run-22. NOTE the over-target 4th voter is a formation TRANSIENT the existing over-creation cap (activeCount>target) + surplus drain clear once voters settle, so this is a churn-reduction / cleanliness quest, NOT the demo's binding blocker.

**Class:** product · **Closure:** MEASURED

**Outcome:** SOLVED (MEASURED) — evidence: test-output/reports/formation-ledger-over-target-accounting-drain-phase-replace-blind-spot-2026-07-08T17-32-45-408Z.report.json

**Attempts:** 1

## Current Blocker
- Frontier: formation-ledger-over-target-accounting-drain-phase-replace-blind-spot-main
- Owner: unknown
- Boundary: unknown
- Dominant reason: unknown
- Mechanism: transition_gap
- Movement: first blocker observed: PASS
- Latest evidence: test-output/reports/formation-ledger-over-target-accounting-drain-phase-replace-blind-spot-2026-07-08T17-32-45-408Z.report.json
- Selected theory: none
- Next move: continue supervised step for formation-ledger-over-target-accounting-drain-phase-replace-blind-spot-main

## Continuation
- Status: allowed
- Next action: No open frontier remains; inspect solve report.
- Blocker: none

## Scope Pressure
- Changed files: 1
- Owner areas: src/rebalancer
- Categories: runtime
- Split plan:
  - src/rebalancer: 1 file(s)
- Signals: none

## Frontiers
- **formation-ledger-over-target-accounting-drain-phase-replace-blind-spot-main** [solved] rung 1, attempts 1, metric 0 -> 0

## Findings
- **formation-ledger-over-target-accounting-drain-phase-replace-blind-spot-main**: LIVE-RUN GROUND TRUTH (s13, 3 fresh affinity-demo runs HEAD 33e0026d; report solve/changes/formation-ledger-over-target-accounting-drain-phase-replace-blind-spot/live-run-ground-truth-modeb-not-binding.md). This quest's ROOT FIX IS DONE + LIVE-CLEAN: c78833f0's row-op-linked drainPhaseReplacementCredit is shipped, wired into move-planner ADD-suppression guards (move-planner-move-calculation-methods.js:563,628), DT-green (in-flight-aware-drain-phase-replace-credit.test.js 10/10 + dt6 5/5), AND live-clean = DEFER_ADD_OVER_TARGET=0 & actual 4-voter overshoot=0 in ALL 3 runs. MODE-A also gone (0 cluster_member_unhealthy 3/3, a79b3728). The s12 premise that MODE-B/this quest is the demo's binding blocker is INVALIDATED. Demo is NOT reliably green (1/3 converged: run1 [4/4] via fallback, run2 [4/4] STALL, run3 [2/4] FAIL) but the binding failures (2/3) have a DIFFERENT root = control-plane replica voter-ready-60s promotion timeout (control_plane_publications learners not promoting in 60000ms; run2 6x/run3 13x) starving the admissible node set -> run3 'Insufficient admissible provisioning targets -> Initial table partition provisioning failed'; run2 'service_definitions partition not found -> runtime-service owner inert -> svc replicas=0'. Residual self-move interlock churn (76-238) SECONDARY, not decisive. attributionRows=0 all 3 = demo-fidelity gap (affinity via all-partitions fallback). RECOMMEND: close this quest SOLVED on its churn-reduction scope (fix done+DT-green+live-clean); do NOT build a new accounting/self-move fix; next roots (out of this quest) = voter-ready-60s promotion timeout + attribution feed.
- **formation-ledger-over-target-accounting-drain-phase-replace-blind-spot-main**: Ingested evidence from formation-ledger-over-target-accounting-drain-phase-replace-blind-spot-2026-07-08T17-32-45-408Z.report.json. Metric: 0 -> 0. Verdict: PASS. Root cause: none. Dominant reason: none. Owner: none. Ingestion outcome: changed. [test-output/reports/formation-ledger-over-target-accounting-drain-phase-replace-blind-spot-2026-07-08T17-32-45-408Z.report.json]
- **formation-ledger-over-target-accounting-drain-phase-replace-blind-spot-main**: CLOSURE VERIFIED (subagent adversarial verify, verdict SHIP): (B) drainPhaseReplacementCredit is live on disk in src/rebalancer/in-flight-aware-replica-count.js:173-226 (row-op-linked, binds one non-active occupied replacement per REPLACE via creditedReplacementIds, feeds deficitEffectiveCount) and wired into both DEFER_ADD_OVER_TARGET guards move-planner-move-calculation-methods.js:563,628; git log -1 on the file = c78833f0. (C) guard tests genuinely bind production computeInFlightAwareReplicaAccounting (not a mock): credit 10/10 (run-28 2/3/0/1->deficitEffectiveCount==3 suppresses ADD; three refuted approximations pinned as anti-regressions: stale-syncing/serialization/verifier-starvation) + dt6 5/5; red-on-revert holds by inspection. (D) doneWhen probe done:true metric:0 verdict PASS consecutive 3. (E) guard-test-scenario-runner spawns real tap, stamps fidelity:deterministic-guard (no overclaim of live binding). Closure is honest and bounded to this quest's over-target-accounting doneWhen (churn-reduction scope); the finding record is honest that this root is NOT the demo's binding blocker. [subagent:a9a769232b549b116]

## Theories
_(none recorded)_

## Selected Theories
_(none selected)_

## Theory Results
_(none recorded)_

## Attempt log
| ts | frontier | rung | metric | result | blocker movement | theory | change |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 2026-07-08T17:32:45.414Z | formation-ledger-over-target-accounting-drain-phase-replace-blind-spot-main | observe | 0 -> 0 | flat | no_evidence |  | diff:solve/changes/formation-ledger-over-target-accounting-drain-phase-replace-blind-spot/root-fix-c78833f0.diff |
