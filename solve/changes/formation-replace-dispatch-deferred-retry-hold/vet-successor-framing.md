# Adversarial vet: EXHAUST decision + successor framing (run-22 ledger-starvation cascade)
Date 2026-07-05. Reviewer: rubber-duck subagent. Sources: research-run22-dispatch-hold-forensics.md,
research-dispatch-machinery-map.md, research-coalescing-ledger-crosscheck.md + live code/log checks below.

## Verification log (write-as-you-go)

### V1. The "43x budget-starved corrective move" claim is MATERIALLY WRONG in two ways
- Log-field semantics: in `unified-rebalancer-follow-up-move.js:557-566` (EXECUTE_MOVE) and :606-617
  (MOVE_SKIPPED), `entityId` is `this.entityId` — the per-entity rebalancer INSTANCE that ran the
  planning pass — while `replicaId`/`moveReplicaId` is the move's actual source replica. The
  "replica_operations-p1-r3" skip lines carry entityId of OTHER partitions and vice versa; grep by
  replicaId, not entityId.
- Timeline: r3-off-N0 skips = 42 lines, window 23:31:07.476 → 23:31:42.659 ONLY (~35s), reason 100%
  budget_exceeded (138 total MOVE_SKIPPED all budget_exceeded). Then 23:31:52.599 the SAME move
  (moveReplicaId=replica_operations-p1-r3, target N3=4fd8f904) EXECUTED, and 23:31:52.682 op
  ca191926 was created: REPLACE replica_operations-p1 → N3.
- ⇒ **ca191926 IS the corrective r3 move.** It was NOT starved all run; budget starved it ~45s,
  then admitted it. Forensics' "second ledger self-move that the blind interlock wrongly admitted"
  and "the planner's remedy starved 43x" are THE SAME EVENT described as both a defect and a
  desired remedy. Any successor framing must resolve this tension explicitly.
- After admission the remedy STILL failed to heal in time: ca191926's own ledger INSERT persist
  failed for good at 23:32:08.339 (attempt 4, participant = ledger leader r4@N1 'Pending response
  timeout' — i.e. r4's commit stalling on N0-follower acks); target r6@N3 was created anyway
  (learner 32:24.781, voter-ready 32:29.886) but SOURCE REMOVAL of r3 never ran before teardown.
  With 4 voters {r2@N0, r3@N0, r4@N1, r6@N3} quorum=3 still requires one N0 ack — a single
  follower REPLACE only restores commit latency AFTER source removal (3 voters: quorum 2 = N1+N3).
  Source removal progress = the same wedged workflow + ledger-write machinery. That is the real
  circularity: ledger workflow progress needs ledger commits; ledger commits need N0; escaping N0
  needs ledger workflow progress. Budget was a 45-second bystander.

### V2. Candidate A code facts (emergency lane)
- `replica_operations` IS in the emergency set: PRIORITY_RECOVERY_EMERGENCY_PARTITION_TABLE_IDS =
  {CONTROL_PLANE_PUBLICATIONS, REPLICA_OPERATIONS} (src/control-plane/priority-recovery-admission-constants.js:43-46).
- But the emergency lane is NOT a budget bypass: `buildPriorityRecoveryAdmissionPlan`
  (src/control-plane/priority-recovery-snapshot-workflow.js:28-206) gives emergency partitions
  `maxConcurrentAdds + emergencyPriorityOverflowSlotCount` — a bounded overflow (:67-70), and
  `usesEmergencyPriorityOverflow` (:110-113) requires `emergencyRecoveryActive`, which requires the
  partition to appear BLOCKED in the membership publication's priorityPartitionSummary
  (spread-gap/missing), or detail-unavailable-while-recovery-active (:53-59).
- Run-22: replica_operations-p1 had a live leader and 3-4 replicas — present, not "blocked";
  `emergencyRecoveryActive` therefore false for it; the r3 REPLACE rode the ORDINARY priority lane
  (budgetLimit = maxConcurrentAdds) behind 4-5 wedged formation REPLACEs → budget_exceeded.
- So A's precise gap statement: **quorum-health of the ledger is invisible to the emergency
  classifier** — it keys on placement/spread blockage from the publication row, not on
  commit-latency starvation. Real gap; verified. But per V1 it cost only ~45s in run-22.
- Extra circularity: the admission plan is derived from the membership PUBLICATION row
  (concurrent-add-budget.js:156-173); publications flow through control_plane_publications —
  itself mid-REPLACE (31a46b4d) during the window. Emergency detection depends on the very
  control-plane paths that formation is moving.

### V3. What released the budget at 23:31:52?
Not directly nailed; consistent with CL-043 staleness exclusion (persist-failed/stale ops aging
out of the concurrent count ~60-70s after creation). The load-bearing point is that the budget
hold SELF-RESOLVED in ~45s — the "corrective move starves indefinitely" premise is refuted.

### V4. Log-field trap (observability finding)
In both EXECUTE_MOVE and MOVE_SKIPPED, `entityId` is the per-entity rebalancer INSTANCE that ran
the (shared, critical-system) planning pass, NOT the move's partition; the move is identified by
`replicaId`/`moveReplicaId` (unified-rebalancer-follow-up-move.js:557-566, :606-617). This
corrupted the forensics count ("43x") and will mislead every future log reader. Cheap fix: log
the move's own partitionId. Related: SEND_OPERATION at debug only
(operation-workflow-dispatch-response-reconcile.js:396-403) is what cost the PARENT quest its
premise ("no dispatch attempt logged" was an observability artifact).

### V5. Candidate F — the readiness fence is structurally un-clearable at production call sites
- Run-22 fence lines (node-0, 35x, from 23:30:29 i.e. BEFORE any degradation): fenceState=
  promotion_denied, fenceMissingProofReasons=["snapshot_coverage_unavailable"],
  fenceSnapshotCoverageMissingCount=5, durablePublication available, presence complete.
- Snapshot-coverage evidence source: `resolvePublicationActiveGateHandoffSnapshotCoverageSource`
  (publication-active-gate-handoff-contract-fence.js:151-161) reads ONLY
  `options.snapshotCoverage` or `options.activeNodeViews`; `available = nodeIds.length>0 ||
  revision!==null` (:239).
- Neither production caller supplies either input: membership-publication-coordinator-reconcile.js
  :614-619 and heartbeat-service-lifecycle-methods.js:377-385 pass only nodeRows/readinessByNodeId/
  publicationConvergence. ⇒ at these call sites snapshot coverage is ALWAYS unavailable ⇒ fence
  promotion permanently denied ⇒ `contractState` forced DEGRADED with reason
  published_active_coverage_incomplete (publication-active-gate-handoff-contract.js:280-300).
- Consequence: any hold that waits for "control-plane path recovered / contract non-degraded" is
  a one-way trap by construction, in EVERY run, not just run-22. This is a half-wired mechanism
  (research-existing-mechanisms-first class). CAVEAT: unverified how much actually gates on the
  fence/contract state vs merely logs it (the only non-contract consumer grep found was the trace
  line at membership-publication-coordinator-reconcile.js:489-508); and healthy demo runs complete
  despite permanent degraded — so it bites only what explicitly waits on recovery. Needs one
  focused verification pass before promoting to a quest.

### V6. "Deferred" status write is actually a DROP
`deferRetryableReplicaCreateStatusWrite` (src/node/replica-handler-create-methods.js:306-322)
deletes the in-progress op record, deletes the local-service entry, and logs — no queue entry, no
timer, no event subscription. There is nothing to flush on recovery; the workflow owner must
independently re-discover the replica via reconciliation (which in run-22 was frozen and
ledger-blind). Candidate E as stated ("timer fallback for event-gated deferrals") under-describes
this: for create-status writes there is no retained work item at all.

### V7. Duplicate REPLACE was a SAME-NODE, 400ms-later self-duplicate
25c9ce61 created by N0 30:45.789, its ledger INSERT gave up 31:07.308 (attempt 4, retryAfterMs 0);
ccff2762 created by N0 31:07.706 — the SAME coordinator that had just failed to persist a REPLACE
for the same partition minted another one 400ms later. A purely LOCAL in-memory record of own
recent/persist-failed creates would have prevented it — no ledger read, no fail-closed global
admission needed. Candidate D as a blanket "defer creates when ledger unwritable" is
ANTI-convergent: it would have blocked ca191926, the only move that could heal the ledger.

---

## VERDICTS

### 1. EXHAUST vs continue: EXHAUST — correct and required
The sealed statement asserts as fact: ops "sat pinned before dispatch for the entire run in the
coordinator's deferred-dispatch hold", "no dispatch attempt or dispatch error was logged mid-run",
"same class as the run-21 residual rows", and seals the fix as "makes the deferred-dispatch hold
self-resolving", proven by a DT repro "of the hold" that "red-on-reverts the pre-dispatch pinning".
Rung-0 refuted each: dispatch happened (replicas created, voter-ready, one leader-handoff);
absence of dispatch logs was a debug-level artifact; run-21 was a NOISY retry livelock on
sql_transactions-p1-r5 address resolution — different signature. There is no pre-dispatch pinning
to reproduce; a scenario passing `formation-replace-dispatch-deferred-retry-hold` 3x consecutive
would be vacuous (proving dispatch happens, which was never false). The quest's own
c-forensics-first constraint anticipated exactly this outcome ("the mechanism is UNPROVEN").
- The counter-argument (the OUTCOME clause — formation settling, ratings surviving phase 2 — is
  the real goal) does not survive: that clause is the validation tail of a fix to the refuted
  mechanism, not an independent doneWhen; re-scoping the frontier to the ledger-starvation cascade
  is precisely "move goalposts mid-Quest" which AGENTS.md forbids. The outcome lives on as the
  parent line (movielens-affinity-placement-demo) and transfers to the successor.
- Required exhaust hygiene: record the mechanism-refuted finding WITH the run-22 evidence pointers
  (logs get wiped by the next demo run — archive node-{0..4}.log first if not already), including
  the run-21-vs-run-22 class discrimination and the phase-2 admin-WS verdict (downstream, not
  independent — c-vet satisfied).

### 2. Successor framing — ranked, with the A-alone trace

**A-alone convergence trace verdict: NO — refuted by run-22 itself.** Run-22 effectively ran the
A experiment: the corrective r3 move was budget-blocked for only ~45s (23:31:07-23:31:52), then
admitted as ca191926; target r6@N3 reached voter-ready 23:32:29 — and the run still died. An
emergency-lane bypass buys ≤45-85s and changes nothing else, because:
1. Intermediate quorum: after the target lands, voters = {r2@N0, r3@N0, r4@N1, r6@N3}, quorum 3
   — still needs one N0 ack until SOURCE REMOVAL completes (only then 3 voters, quorum 2 = N1+N3).
2. Source removal is driven by the same wedged workflow whose step transitions need ledger
   commits — the circularity A never touches.
3. The duplicate-REPLACE mutual block (25c9ce61⟂ccff2762) and the N1 frozen lane are independent
   of budget and persist under A.
4. The 300s grace ceiling and drop-not-defer status writes still hide progress past the demo cut.
Also A is misdefined in the prompt: the emergency lane is a bounded overflow
(maxConcurrentAdds + slots), engaged only when the publication reports the partition BLOCKED
(spread-gap); it is not a budget bypass, and ledger quorum-HEALTH is invisible to it (V2).

**Ranking (by evidence that fixing it alone converges the run-22 shape):**
1. **B-unified (absorbs A's valid core): ledger-quorum-spread-first formation ordering.** The one
   place the circularity can be broken is BEFORE the ledger becomes unwritable. Run-22 timeline
   proves the window existed: ledger writes were healthy 23:30:27-23:30:51; the self-move took 16s;
   follower spread takes ~10-20s per move (r4: learner 30:44.3 → voter-ready 30:49.5). The run-20
   interlock already serializes self-moves vs siblings but RELEASES as soon as the ONE leadership
   move completes (data REPLACEs created 200ms after 59697071), leaving 2/3 of the ledger quorum on
   the overloaded seed while all dependent moves pile on. Invariant: formation control-plane moves
   are subordinate to the operation ledger's own full quorum spread — the ledger's spread moves are
   created/admitted first (emergency classification per V2's gap: quorum-concentration, not just
   publication-reported blockage) and dependent REPLACEs hold until the ledger no longer requires
   the concentrated node for commit. Every downstream defect (blind dedupe, blind interlock, frozen
   lane, drop-not-defer) simply never triggers. This is the circular-dependency-class fix (formation
   invariant vs steady-state machinery that assumes a writable ledger) and the internal-pacing fix
   (client-visible CREATE TABLE death traces to internal ledger starvation). DT-faithful: compose
   real planner + budget + interlock (createTimeoutTestCoordinator precedent) with a slow-seed
   fault; ordering assertion is deterministic and red-on-revert-able.
2. **C — coordinator lane head-of-line robustness.** One ledger INSERT froze N1's
   reconciliation/planning lane 2m33s (30:46→33:19). Unconditional blast-radius win,
   DT-provable, BUT does not alone converge run-22: an unfrozen lane still can't persist
   transitions into an unwritable ledger. Second quest, not the arc.
3. **D-narrow — same-coordinator in-memory create dedupe** (V7): kills the duplicate/mutual-
   livelock class cheaply without the anti-convergent blanket fail-closed. Not convergence-binding
   alone.
4. **F(+E) — permanently-degraded readiness contract** (V5, V6): potential sleeper with
   cluster-wide reach, but gating-surface unverified; investigation first.
5. **A standalone / E standalone**: refuted as binding arcs (above).

A and B are one quest only in B-unified form: "the ledger's own health outranks the machinery it
protects" — but the mechanism that matters is the ORDERING/HOLD (B), with A's emergency
classification as the enforcement detail. Pure A (budget bypass for corrective moves mid-wedge)
is firefighting inside the trap.

**Strongest surviving sealed-statement draft (one paragraph):**
"Formation on a 5-node cluster never leaves the operation ledger's quorum concentrated on the
seed while dependent control-plane moves proceed: in run-22 the ledger self-move relocated only
leadership to N1, the interlock released with followers r2,r3 still on overloaded N0, every ledger
commit thereafter needed an N0 ack (1s query/30s commit timeouts), and the resulting write
starvation cascaded — step transitions ghosted, N1's reconciliation lane froze 2m33s behind one
30s commit timeout, dedupe and the run-20 interlock went blind (duplicate REPLACE ccff2762,
second self-move ca191926), and the planner's own corrective r3 move (admitted after 45s of
budget_exceeded as ca191926) could not complete because its removal step required the very ledger
commits it was meant to heal. The fix subordinates formation control-plane moves to the ledger's
full quorum spread: ledger spread moves (leader AND followers) are planned and admitted first —
classified emergency on quorum-concentration evidence, not only publication-reported spread
blockage — and dependent REPLACE admission holds until ledger commits no longer require the
concentrated node; no timeout or budget is raised. Proven FIRST by a deterministic in-process
composition of the real planner/budget/interlock with a slow-seed fault, red-on-reverting the
ordering invariant (a dependent REPLACE admitted while ledger quorum still pins to the slow seed),
and then by the live affinity demo's formation settling completing with the ratings load surviving
phase 2."

### 3. Scope hygiene — secondary defects, ranked by demo-line convergence yield
1. (iv) Lane head-of-line blocking — AUTHOR QUEST NOW (P2). Biggest single blast-radius reducer;
   deterministic; independent of the successor arc.
2. (iii) Ledger-blind dedupe/interlock — AUTHOR QUEST NOW (P2) in the NARROW V7 form
   (same-coordinator in-memory memory of recent/persist-failed creates; explicitly NOT blanket
   fail-closed admission — that would block the healing move). Feeds the same mutual-livelock
   class as the run-21 successor already authored.
3. (v) Readiness fence stuck — FINDING + one bounded verification pass (does anything supply
   snapshotCoverage anywhere? what actually gates on contractState degraded?). Promote to quest
   only if a real gating surface is confirmed; if confirmed it may outrank (iv).
4. (i) Event-gated deferral / drop-not-defer status writes — FINDING now (V6 upgrade: it is a
   DROP, not a deferral), quest after the successor lands; its yield materializes only once the
   ledger can heal mid-run.
5. (ii) Grace-ceiling 300s shielding — FINDING only. It is a designed budget; firing the reaper
   earlier just failOperations into the same wedge; revisit only if post-fix runs show the 300s
   ceiling vs 120s demo cut still masking progress.
6. Observability nits to fold into the successor quest scope, not separate quests:
   SEND_OPERATION at info for priority partitions; EXECUTE_MOVE/MOVE_SKIPPED logging the move's
   own partitionId (V4).
