# Solve report: formation-replace-dispatch-deferred-retry-hold

**Goal:** A 5-node formation dispatches its control-plane REPLACE moves into execution without the run-22 pre-dispatch hold: four formation REPLACEs (sql_write_operations-p1 and replica_operations-p1 PENDING, sql_transactions-p1 and sql_transaction_participants-p1 SENDING) sat pinned before dispatch for the entire run in the coordinator's deferred-dispatch hold — the planner re-observed them every cycle ('Reusing in-flight operation for planned move', rearmAction alternating skip_live_deferred_retry/rearm_dispatch) while no dispatch attempt or dispatch error was logged mid-run, and control_plane_publications-p1's REPLACE reached SYNCING then held skip_not_pending — so active counts sat at 4 over target 3 with spread ADDs deferred over-creation-cap, formation settling hit the demo's 120s stall cut, and the phase-2 CREATE TABLE/ratings load died on an admin WS response timeout. Same class as the run-21 residual ledger rows 2f0237dc/ea742515/fd0b247f (never-dispatched REPLACEs in perpetual deferred-dispatch loops, isolated by the terminal-transition-repair vet). The fix makes the deferred-dispatch hold self-resolving — the armed retry actually fires and either dispatches the operation, re-plans it, or terminalizes it within a bounded window — WITHOUT weakening dispatch backpressure semantics or raising timeouts/budgets, proven FIRST by a deterministic in-process reproduction of the hold (compose the real coordinator-created remote-handoff/deferred-dispatch retry machinery with the formation move shape) that red-on-reverts the pre-dispatch pinning, and then by the live affinity demo's formation settling completing with the ratings load surviving phase 2.

**Class:** product · **Closure:** MEASURED

**Outcome:** EXHAUSTED — 0 frontier(s) parked; human decision needed

**Attempts:** 0

## Links
- parent quest: movielens-affinity-placement-demo

## Current Blocker
- Frontier: formation-replace-dispatch-deferred-retry-hold-main
- Owner: unknown
- Boundary: unknown
- Dominant reason: unknown
- Mechanism: unknown
- Movement: no evidence recorded
- Latest evidence: none
- Selected theory: none
- Next move: continue supervised step for formation-replace-dispatch-deferred-retry-hold-main

## Continuation
- Status: allowed
- Next action: continue supervised step for formation-replace-dispatch-deferred-retry-hold-main
- Blocker: none

## Scope Pressure
- Changed files: 0
- Owner areas: none
- Categories: none
- Signals: none

## Frontiers
- **formation-replace-dispatch-deferred-retry-hold-main** [open] rung 0, attempts 0, metric ? -> ?

## Findings
- **formation-replace-dispatch-deferred-retry-hold-main**: RUNG-0 FORENSICS (c-forensics-first satisfied; 3 parallel investigators, scratchpad research-{run22-dispatch-hold-forensics,dispatch-machinery-map,coalescing-ledger-crosscheck}.md + per-op ndjson extracts): THE SEALED MECHANISM IS REFUTED. Dispatch DID happen for 3 of the 4 pinned ops — 31a46b4d's target replica was VOTER-READY at 23:30:49, 5531160f and f4c7e8fa had replicas CREATED (23:31:25/23:31:55), 25c9ce61 reached leader handoff — the ledger rows (PENDING/SENDING/SYNCING) are STALE, hiding completed work. TRUE MECHANISM = LEDGER-WRITE STARVATION CASCADE: bootstrap placed all 3 replica_operations-p1 replicas on the seed N0; the run-20-fix self-move (59697071, interlock worked correctly) moved LEADERSHIP to N1 but both followers stayed on the overloaded seed (14 event-loop gaps 1-2.5s, 368 clock-drift warnings), so every ledger raft commit needed an N0 ack -> 1s query timeouts / 30s commit timeouts -> (a) step-transition persists fail (rows freeze while execution proceeds); (b) N1's coordinator reconciliation lane FROZE 23:30:46->23:33:19 head-of-line-blocked on 0117dfd8's ledger INSERT (30s raft commit timeout in the tick loop) so owner-side reconcile_active (SYNCING->ACTIVE for the voter-ready 31a46b4d) never ran; (c) dedupe reads COMMITTED ledger rows and was blind while the ledger was unwritable -> duplicate REPLACE ccff2762 for 25c9ce61's partition -> the two mutually blocked source removal ('Quorum check failed: concurrent partition operation is active') ~1s cadence for 2 minutes; (d) a SECOND ledger self-move ca191926 was admitted at 23:31:52 — the run-20 interlock is ALSO ledger-blind when the ledger is unwritable (CL-043 stale-exclusion disarms it); (e) the planner's remedy (move ledger follower r3 off N0) was skipped 43x budget_exceeded — THE CIRCULARITY: the ledger's own corrective move starves on budget held by ops wedged on the unhealthy ledger. SECONDARY CONFIRMED DEFECTS: dispatch deferral 'while control-plane path recovers' is EVENT-GATED with no timer fallback (readiness fence promotion_denied/snapshot_coverage_unavailable never recovered all run on all 5 nodes -> deferrals flushed only at Router shutdown = the 6 teardown lines); rearm_dispatch for remote-owned ops only WAKES the target (owner = TARGET node for unsettled priority REPLACEs, replica-operation-repository-row-methods.js:135-170); PENDING/SENDING 30s step timeouts sit inside the priority-partition grace ceiling createdAt+300s (transition-retry-grace.js:120-159) so checkTimeouts was shielded for the whole demo window; SEND_OPERATION logs at debug only (the 'silence' was partly observability). COALESCING HYPOTHESIS REFUTED (runExclusive loser's factory never runs -> orphan rows structurally impossible; arm happens inside the factory on the persisted object). RUN-21 rows 2f0237dc/ea742515/fd0b247f = same CL-017-class ledger-write-starvation but NOISY (peer-address resolution failure on sql_transactions-p1-r5 poisoning transition transactions) — the class is LONG-STANDING (CL-017 pinned it 2026-06-11), not a regression. PHASE-2 VERDICT: downstream, not independent (CREATE TABLE received; provisioning op 55aa3055 failed with the same DISTRIBUTED_PARTICIPANT_FAILURE; admin channel healthy). activeCount:4 = un-removed sources, NOT duplicate emergency ADDs (except sql_transaction_participants-p1 which hit 5 via the ghost-row duplicate). CONSEQUENCE: this quest's sealed statement ('pre-dispatch hold; the armed retry actually fires and dispatches') targets a mechanism that does not exist; per Must-Not #15 the honest terminal is EXHAUSTED with the insight captured and a correctly-framed successor authored.
- **formation-replace-dispatch-deferred-retry-hold-main**: FRAMING VET (adversarial subagent, scratchpad vet-successor-framing.md; run-22 logs preserved to data/examples/service-data-affinity-demo-archive/run22-logs-2026-07-04T23-29-manual-preserve.tar.gz): EXHAUST REQUIRED — the sealed statement asserts a pre-dispatch hold that does not exist; the doneWhen scenario would pass vacuously; the outcome clause transfers to the parent line, and re-scoping the frontier would be goalpost-moving. TWO CORRECTIONS TO THE RUNG-0 FORENSICS (verified in code + logs by the vet): (1) MOVE_SKIPPED/EXECUTE_MOVE entityId is the rebalancer INSTANCE, not the move's partition (unified-rebalancer-follow-up-move.js:557-566,606-617) — the 'remedy skipped 43x all run' claim was wrong; the corrective r3-off-N0 move was budget-blocked only ~45s (23:31:07-23:31:52) and then EXECUTED as ca191926 (the same event the forensics separately condemned as 'the blind interlock wrongly admitting a second self-move'); (2) run-22 therefore ALREADY RAN the emergency-lane experiment: the corrective move admitted, its target reached voter-ready 23:32:29, and the run STILL died — because the 4-voter intermediate quorum (r2,r3@N0 + r4@N1 + r6@N3) still required an N0 ack until source removal, and removal needs the same wedged ledger-write machinery. FIX-ARC A (emergency lane for ledger moves) alone is REFUTED (~45-85s gain, no convergence). BINDING ARC = LEDGER QUORUM SPREAD OUTRANKS THE MACHINERY IT PROTECTS: ledger writes were healthy 23:30:27-23:30:51; the run-20 interlock released 200ms after the LEADERSHIP-ONLY self-move with 2/3 of the quorum still on the seed, and all dependent control-plane moves piled onto a ledger whose every commit needed the overloaded node — only pre-wedge ORDERING (full quorum spread first; dependent-move admission holds until ledger commits no longer require the concentrated node) breaks the circularity, since every other candidate operates inside the wedge where all writes fail. Also: replica_operations IS in the emergency set (priority-recovery-admission-constants.js:43-46) but the lane keys on publication-reported spread BLOCKAGE, not quorum concentration (priority-recovery-snapshot-workflow.js:28-206). SECONDARY-DEFECT SCOPE RANKING: (iv) coordinator-lane head-of-line blocking (one ledger INSERT froze N1's reconciliation lane 2m33s) = author P2 quest; (iii) NARROW own-create-memory dedupe (the duplicate REPLACE was the SAME coordinator re-creating 400ms after its own persist give-up; blanket fail-closed admission is ANTI-convergent — it would have blocked the healing move ca191926) = author P2 quest; (v) readiness fence = finding + bounded verification lead: NO production caller supplies snapshotCoverage/activeNodeViews to the publication-active-gate fence (membership-publication-coordinator-reconcile.js:614-619, heartbeat-service-lifecycle-methods.js:377-385 vs publication-active-gate-handoff-contract-fence.js:151-161) so promotion_denied/contractState=degraded is structurally permanent from t0 — what actually gates on it is UNVERIFIED; (i) deferRetryableReplicaCreateStatusWrite is a DROP not a deferral (replica-handler-create-methods.js:306-322, no work item retained) = finding; (ii) 300s grace ceiling shielding 30s step timeouts = finding; SEND_OPERATION debug-only logging + move-vs-instance log fields = observability fixes folded into the successor's scope.

## Theories
_(none recorded)_

## Selected Theories
_(none selected)_

## Theory Results
_(none recorded)_

## Attempt log
| ts | frontier | rung | metric | result | blocker movement | theory | change |
| --- | --- | --- | --- | --- | --- | --- | --- |
