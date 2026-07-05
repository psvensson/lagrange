# Solve report: formation-ledger-spread-window-follow-up-latency

**Goal:** The post-formation operation-ledger spread window (seeded bootstrap concentrates all ledger replicas on the seed; quorum-spread-first then relocates them via SERIALIZED self-moves) shrinks enough that a CREATE TABLE arriving right after formation succeeds within its existing 30s provisioning budget on the 5-node MovieLens demo: the serialized follow-up self-move is re-driven immediately when its predecessor settles (run-26 measured an 8.7s dead gap — op-1 drain settled 12:09:48.676, op-2 CREATE_REPLICA 12:09:57.46 — a full planner period), rather than waiting for the next planner cycle, and the per-move cost regressions (retryable control-plane status-write deferrals ~3.7s while the ledger itself moves; ~7.7s empty-partition CREATE_REPLICA) are measured and the binding ones addressed. Proven by a deterministic DT reproduction of the follow-up re-drive (guard-test scenario-harness, consecutive 3) and the demo's ratings load progressing past table creation in a live run. NO timeout/budget raises; NO weakening of the run-20 serialization or run-22 spread-first semantics.

**Class:** product · **Closure:** MEASURED

**Outcome:** SOLVED (MEASURED) — evidence: test-output/reports/formation-ledger-spread-window-follow-up-latency-2026-07-05T14-31-14-738Z.report.json

**Attempts:** 1

## Links
- parent quest: movielens-affinity-placement-demo

## Current Blocker
- Frontier: formation-ledger-spread-window-follow-up-latency-main
- Owner: unknown
- Boundary: unknown
- Dominant reason: unknown
- Mechanism: unknown
- Movement: no evidence recorded
- Latest evidence: none
- Selected theory: none
- Next move: continue supervised step for formation-ledger-spread-window-follow-up-latency-main

## Continuation
- Status: allowed
- Next action: No open frontier remains; inspect solve report.
- Blocker: none

## Scope Pressure
- Changed files: 5
- Owner areas: scripts/run-formation-ledger-spread-window-follow-up-latency-scenarios.js, src/rebalancer, test/rebalancer
- Categories: other, runtime
- Action: land or separate 3 owner areas: scripts/run-formation-ledger-spread-window-follow-up-latency-scenarios.js, src/rebalancer, test/rebalancer
- Split plan:
  - src/rebalancer: 3 file(s)
  - scripts/run-formation-ledger-spread-window-follow-up-latency-scenarios.js: 1 file(s)
  - test/rebalancer: 1 file(s)
- Signal: broad-source-scope severity=medium

## Frontiers
- **formation-ledger-spread-window-follow-up-latency-main** [solved] rung 1, attempts 1, metric 0 -> 0

## Findings
- **formation-ledger-spread-window-follow-up-latency-main**: RUNG-0 RESEARCH (subagent forensics, report research-spread-window-gap.md in the quest changes dir; all claims file:line + timestamp evidenced from the archived run-26 logs). THE SEALED FRAMING'S MECHANISM IS REFUTED, THE GOALPOST STANDS: the 8.7s gap is NOT planner cadence — node-4's planner created op-2 30ms after op-1's terminal (:48.706 vs :48.000/:48.676 drain-settle); op-2 then sat PENDING with dispatch NEVER ARMED. Owner of an unsettled priority REPLACE = the TARGET node (replica-operation-repository-row-methods.js:150-169); the creator's arm seam (operation-creation.js:624-627 -> armCoordinatorCreatedOperation -> remote-handoff retry lane operation-workflow-coordinator-handoff-retry.js:107) fired NO attempt, NO warn, NO owner wake — silent failure; 47ms later the planner rearm was suppressed by SKIP_LIVE_DEFERRED_RETRY (rebalance-coordinator-operation-intent-methods.js:460-504) on the strength of a live deferred retry that never fires. Rescue was a COINCIDENTAL ready-node replay cascade (:56.101 node-0 -> sendDirectDispatchWakeup -> node-3 priority_claim_cas :57.447). CLASS, NOT ONE-OFF: op-1 had the same pre-dispatch idle (created :25.285, claimed :37.000 = 11.7s). The level-triggered CDC re-drive exists (replica-dispatch-reconcile-callbacks.js:321-330) but is STARVED — the op row's CDC goes through the ledger being moved. ADMISSION WAS CORRECT throughout: probes deferred :48.7-:57.4 because op-2 genuinely existed (live-but-idle); run-20 hold release was prompt (0.7s); the fix target is dispatch liveness, not admission or visibility. PER-MOVE COST: pre-dispatch idle 11.7s (scheduling, the fix class) + status-write stall 3.9s (circularity: the creating write targets the moving ledger itself; 1ms doom-loop consistent-with-not-proven; 250ms/15s retry constants) + empty CREATE 7.7s of which 5.004s = exactly LEARNER_PROMOTION_PRIORITY_RECOVERY_DELAY_MS (a fixed stability floor — policy call, out of scope per c-class) + handoff/remove/drain 3.2s. PROJECTION: 2 moves total (concentration releases when move-2's source removal completes); removing ONLY the inter-move gap -> 31.0s STILL MARGINAL; removing the CLASS (both idles) -> ~19s, comfortably inside the 30s budget with ~11s headroom. FIX SHAPE (REUSED/EXTENDED/NEW): REUSE the ready-node replay + authoritative rediscovery + direct-dispatch wake + priority_claim_cas lanes (they already handle cache-invisibility and remote owners); EXTEND with (i) a completion/drain-settle hook on disruptive ledger self-moves invoking that lane and (ii) hardening resolveReusedOperationRearmAction so SKIP_LIVE_DEFERRED_RETRY cannot suppress the only rearm on a never-fired retry, and (iii) root-cause the silent armCoordinatorCreatedOperation failure (the remaining open question for rung-1); NEW: nothing beyond the hook + a reason code. Run-20 serialization intact (single claim CAS + interlock gate); run-22 spread-first untouched.
- **formation-ledger-spread-window-follow-up-latency-main**: RUN-27 LIVE: THE DISPATCH-IDLE CLASS IS FIXED — op-1 CREATE_REPLICA :56.954 -> completed 13:22:03.5 (~6.5s vs run-26's ~24s incl. 11.7s idle); op-2 :22:07.1 -> :22:08.1 (~1s); inter-move gap ~3.5s (was 8.7s); both spread moves DONE by :22:08-10. The demo STILL fails at :22:19.6 but with a DIFFERENT reason: operation_ledger_quorum_concentrated (not self_move_in_flight) — the run-22 spread hold stayed engaged ~11s AFTER the moves physically completed. Evidence: the concentration evaluation at :22:03.528 shows totalVoters=2 (mid-move voter view: removed source no longer counts, the new replica still a LEARNER inside the 5s promotion stability floor - LEARNER_PROMOTION_PRIORITY_RECOVERY_DELAY_MS - plus services-row raft_role CDC propagation). RESIDUAL CLASS (successor candidate, NOT this quest's): post-spread voter-visibility latency — the quorum-spread hold releases only when placement ACTUALS show the spread quorum, which trails the physical moves by learner-promotion floor + cache propagation; the create missed by seconds again (budget end ~:22:19.6 vs likely release ~:22:20-25). The total window is now ~25s (down from ~35s+); the transient-wait engaged correctly throughout (WARN :21:59.9). Await implementation verifier before Solver commit; run-27 logs to be archived.
- **formation-ledger-spread-window-follow-up-latency-main**: IMPLEMENTATION + SOURCE-CHANGE SUBAGENT VERIFICATION (design vet AMEND->GO R1-R5 all implemented; implementation verifier verdict SHIP; all three reports in the quest changes dir). REUSED vs EXTENDED vs NEW: REUSED — the wake/defer/timeout-decision/transition-retry-grace machinery, the operation budget (createdAt + REBALANCE_OPERATION_BUDGET_MS = 300s) as the loop bound (verifier PROVED the budget stop works from FROZEN snapshot timestamps through the loop, grace ceilings included), the claim-CAS/refresh-row single-winner dispatch (multi-wake nudges harmless); EXTENDED — the follow-up timer's null-observation branch (retry from retained snapshot LOUDLY instead of silent self-cancel), the wake path (DELIVERED+noHandler routed into the ALWAYS-warning deferral lane via a synthetic deferRetry error — verifier confirmed the ONLY noHandler producer is the inbound ACK-before-handler-lookup path and non-priority ops cannot reach the new throw beyond the already-caught arm seam), onLateDispatchDeliveryHonored (invisible row no longer preempt-cancels the only re-drive; visible terminal still clears), R2 loud stops at both bound exits; NEW — three module-level helpers + handleDroppedNoHandlerWake + 2 LOG_MSG constants; no new caches or timeouts. VERIFIER RULINGS: log noise (<=1 warn/s/op for <=300s, real-world ~1-2s) ACCEPTED — the killed class was SILENCE; no double-schedule (map-keyed timer + replaceExisting); R4 extra nudges absorbed by existing CAS machinery. NON-BLOCKING GAPS RECORDED AS FOLLOW-UPS: (i) the snapshot-loop budget-stop branch and both R2 STOPPED warns lack a DIRECT test (the bounded-stop control is stopped earlier by the pre-existing arm-path gate — still proves no re-wakes + no rearm suppression past budget); (ii) no directed re-wake-while-SENDING control (mitigated by 62/62 green claim-CAS/single-writer coverage); vacuous warn assert removed, stale JSDoc fixed. PROOF: DT 13/13 red-on-revert x2 dt:prove artifacts across 3 src files; rebalancer 5373 + convergence 833 + transport-adjacent 30 + claim-CAS 62 green real-exit-0 (verifier independently reproduced); complexity + lint green; scenario-harness 3x PASS. LIVE FIDELITY NOTE (per the new closure-fidelity rule): run-27 already validated the CLASS live BEFORE this final polish (both spread moves dispatched promptly: 11.7s and 8.7s idles GONE, gap 3.5s, per-move 6.5s/1s) — the residual run-27 failure is the DIFFERENT successor class (post-spread voter-visibility latency: quorum-spread hold released ~11s after physical spread, learner-promotion 5s floor + services-row cache propagation; recorded earlier on this quest). doneWhen's demo-level clause (CREATE succeeds live) is therefore NOT yet met by this quest alone — the sealed statement's mechanism clause (follow-up re-driven immediately on predecessor settle) IS met and live-proven; the demo clause lands with the successor quest.

## Theories
_(none recorded)_

## Selected Theories
_(none selected)_

## Theory Results
_(none recorded)_

## Attempt log
| ts | frontier | rung | metric | result | blocker movement | theory | change |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 2026-07-05T14:32:10.912Z | formation-ledger-spread-window-follow-up-latency-main | observe | 0 -> 0 | flat | no_evidence |  | diff:solve/changes/formation-ledger-spread-window-follow-up-latency/fix-dispatch-arming.diff |
