# Adversarial vet: quorum-concentration hold design (formation-ledger-quorum-spread-first)
Date 2026-07-05. Write-as-you-go. Verdicts at bottom.

## Verification log

### V0. Interlock file read (src/rebalancer/rebalance-coordinator-ledger-interlock-admission.js)
- ensureOperationLedgerSelfMoveSerialized (:117-197): async lane. Exemptions verified:
  - disruptive self-move = REPLACE/REMOVE of ledger partition (:19-21, :52-57)
  - emergency quorum-restore ADD exemption: `normalizedMoveType === ADD && isEmergencyPriorityControlPlanePartition(partitionId)` (:124-129) — returns early, skips the whole check.
  - NOTE (:127): the early-return requires `!isDisruptiveSelfMove && isEmergencyQuorumRestoreAdd` — ordinary (non-emergency-set) ADDs do NOT early-return; they fall through to the sibling-defer direction.
- Sync gate: runOperationLedgerInterlockAccountedCreate (:243-338) wraps createOperation execution.
- Error channel: createOperationLedgerInterlockError (:210-227) = createConcurrentOperationBudgetError + error.admissionResult (DEFERRED). Verified dual channel exists.
- Sibling-defer direction gates only on OBSERVED rows; absence never blocks (:177-187). Doctrine confirmed.

(remaining sections filled in as verified)

### V1. createOperation admission chain order (rebalance-coordinator-operation-creation.js)
Outer: createOperation :62-119 → dedupe intents → singleFlight → operationWorkflowRunExclusive(
  runOperationLedgerInterlockAccountedCreate(:115) [SYNC gate wraps everything below]).
Inner createOperationInternal order (:145-305):
1. assertMembershipPublicationEpoch :146
2. retiredSourceSafety :171
3. queryExistingInFlightOperation dedupe :183
4. ensureOperationLedgerSelfMoveSerialized :225  ← NEW HOLD goes here (async lane)
5. ensureNoConflictingInFlightReplaceForRemove :232
6. ensurePriorityControlPlaneRemoveLaneAvailable :239
7. ensureEntityAddLikeCreateLaneAvailable :246
8. ensureCriticalPartitionCreateLaneAvailable :254
9. ensureCreateTopologyGuardAllowed :261
10. shouldEnforceConcurrentOperationBudget → runConcurrentCreateBudgetGate :269-291
⇒ interlock sits BEFORE budget gates and the critical create lane; a ledger self-move REPLACE
still passes through gates 5-10 AFTER the interlock — need to check each for holds a wedged
sibling landscape could keep closed (surface A/F).

### V2. Gates a ledger self-move REPLACE passes AFTER the interlock (rebalance-coordinator-priority-budget-admission.js, topology-guard-methods.js)
- ensureEntityAddLikeCreateLaneAvailable :317 — PER-ENTITY (getEntityAuthoritativeOperationObservation on the ledger entity only). Held siblings of other partitions cannot close it. An earlier ledger REPLACE in remove-dispatch phase blocks a new ledger REPLACE — that is the intended serialization.
- ensureCriticalPartitionCreateLaneAvailable :132 — per-entity; over-target hold (:222-271) counts ALIVE (ACTIVE+REMOVING on ready nodes) rows vs target; ledger at 3 replicas = target 3 → open. Mid-own-REPLACE 4 alive → would block a SECOND concurrent ledger add-like — again intended.
- ensurePriorityControlPlaneRemoveLaneAvailable :570 — REMOVE only, per-entity.
- Topology guard (topology-guard-methods.js): TARGET_COUNT block applies to ADD ONLY (:29-31); REPLACE is NOT distinct-node-count blocked. TARGET_NODE_OCCUPIED (:193-197) applies to ADD+REPLACE: cure REPLACE must target a node with no replica of the partition — consistent with the proposed feasibility guard. Guard active only when move.enforceConcurrentOperationBudget===true (:154), set by planner at unified-rebalancer-move-execution.js:69.
- Budget gate: planner ledger REPLACE rides priority add lane (shouldUsePriorityConcurrentAddLane includes REPLACE, concurrent-add-budget.js:113-129); EMERGENCY_PRIORITY_ADD scope iff usesEmergencyPriorityOverflow(partitionId) (:55-64) — evidence today = publication-reported blockage (V2 of vet-successor-framing).
⇒ No cross-entity gate exists that a HELD sibling landscape keeps closed against the ledger self-move. Composition clean.

### V3. Quorum math analysis (surface C)
- Counting source-REMOVING + target-ACTIVE as 4 voters is CORRECT, not double-counting: during a REPLACE completion window the source IS still a raft voter until removal commits; 4 voters with 2 on N0 → (4−2)=2 < 3 → concentrated — matches reality (quorum 3 still needs one N0 ack; exactly the run-22 intermediate state per forensics V1).
- Learner exclusion correct (learners don't vote). Candidate = voter, correct.
- Risk 1: REMOVING row lingering after raft removal committed → hold persists slightly long (conservative, bounded by cache freshness) — acceptable.
- Risk 2: services row shows ACTIVE but raft role still learner at promotion boundary — depends where raft_role is updated (cache-actuals agent).
- Risk 3 (release-early): stale rows showing spread that no longer exists (dead node with ACTIVE rows) → predicate under-counts concentration. Observation lag; steady-state node death is emergency-recovery's job, not this formation hold. Acceptable with note.

### V4. Feasibility-guard hole (surface D / A) — DEFECT
Predicate "some ready node hosts zero replicas of the partition" misses the SURPLUS case:
e.g. 3-node cluster, ledger voters {r2@N0,r3@N0,r4@N1,r5@N2} (mid-replace / over target):
concentrated (4−2=2 < 3) TRUE, but every node hosts a replica → infeasible → hold RELEASES —
yet real quorum still pins to N0 and the cure (surplus/source REMOVE, which is exempt) is
imminent. Dependents admit into the concentrated ledger = run-22 shape on small clusters.
AMENDMENT REQUIRED: feasibility must be "spread improvable" = (zero-replica ready node exists)
OR (occupiedAlive > target — a removal cure is available/imminent). Both are cache-derived
actuals. Single-node / true no-target clusters still release (correct deadlock guard).
2-node check: 3 voters on N0, N1 empty → hold; after REPLACE→N1: {2@N0,1@N1} concentrated
forever (unavoidable) but no zero-replica node and not over target → infeasible → release. Correct.

### V5. Bootstrap + DDL (subagent, verified pointers)
- Seed bootstrap NEVER enters createOperation: src/bootstrap/phases/seed-partitions-phase.js:71-156, :163-240 instantiate PartitionService directly. Hold cannot brick single-node bootstrap.
- Only two createOperation callers: DDL provisioning (sql-query-engine-initial-partition-provisioning.js:382) and planner moves (unified-rebalancer-move-execution.js:94). Planner absorbs skip via rebalanceSkipReason/admissionResult (:95-108) → retry next cycle. Safe.
- Ledger + control_plane_publications ADDs exempt via isEmergencyPriorityControlPlanePartition (interlock :124-129 async, :290-293 sync; emergency set = {CONTROL_PLANE_PUBLICATIONS, REPLICA_OPERATIONS} priority-recovery-admission-constants.js:43-53). Cure ADDs self-relieving ✓.
- ⚠️ DDL DEFERRED handling (surface E) — DEFECT IN DESIGN PREMISE: sql-query-engine-provisioning-admission-methods.js:34-46 treats ANY admissionResult with allowed!==true as a target REJECTION; initial-partition-provisioning.js:279-312, :405-419 folds it into fallback-minimum planning and, when all targets defer, throws provisioning-insufficient-targets — CREATE TABLE FAILS FAST, it does NOT wait-and-retry. The design claim "DDL defers then succeeds" is FALSE on current code. Same latent behavior already exists for the run-20 hold (known memory item "DDL fails fast in self-move window") but the new hold WIDENS the window from a self-move (~16s) to full concentration (~30-60s+ formation). ARCH-0016/0017 violation surface. Amendment required (internal pacing: provisioning loop should treat decisionType DEFERRED as bounded wait-and-retry, or the demo/client must retry).

### V6. Planner path (subagent, key pointers)
- Per-partition UnifiedRebalancer instance (partition-service-rebalancer-methods.js:223-236, entityId=partitionId, leader-gated). Ledger loop independent of other partitions' loops ✓.
- Spread REPLACE for concentrated-at-target-count ledger: MovePlanner fuses spread ADD + SPREAD_REPLICAS REMOVE into count-neutral REPLACE (move-planner-move-calculation-methods.js:276-304, :438-453, :483-553). Run-22's ca191926 empirically confirms.
- Critical-REPLACE serialization: one in-flight REPLACE per priority partition, drain-inclusive (:507-540) → self-moves sequential. OK.
- Budget lane: priority add lane incl. REPLACE (concurrent-add-budget.js:113-129); skip → rebalanceSkipReason BUDGET_EXCEEDED (rebalance-coordinator-concurrent-budget-gate.js:85) → planner retry ~5s cadence (rebalancer-planning-gate-methods.js:685-712; CRITICAL_CHECK_DELAY_MS=5000 rebalancer-constants.js:88).
- ⚠️ DEADLOCK CANDIDATE (surface A): planning-gate chain (rebalancer-planning-gate-methods.js:638-658, first-closed-wins). Gate #6 local-serve-readiness (:511-547 → unified-rebalancer-local-serve-readiness.js:127-157) defers ALL planning for the entity when PRIORITY_CONTROL_PLANE_RECOVERY_PENDING is present ALONGSIDE any other blocking reason (:81-94). The priority bypass (rebalancer-priority-recovery-planning-gate-methods.js:289-319) fires only when isPriorityRecoveryFollowUpOperationRequired — and a count-neutral spread REPLACE at target count is NOT a priority-recovery follow-up ⇒ bypass does not fire ⇒ the CURE move can be un-plannable while the new hold is engaged. Run-22 empirically hit this gate 23:31:54→33:13 (18x WAIT_LOCAL_SERVE_READINESS, 75s). Circularity risk: hold blocks dependent cpp/control-plane REPLACEs; if their absence keeps a second blocking reason present, the ledger cure is never planned → wedge (typed, visible, but a wedge).
  MITIGATION = the sealed statement's own emergency-classification clause: extending the priority-recovery evidence (isPriorityRecoveryFollowUpOperationRequired / admission plan) with quorum-concentration makes operationCreationRequired TRUE for the concentrated ledger partition → planning-gate bypass fires AND budget rides the emergency overflow scope. This closes the deadlock; therefore MIN scope (skip classification) is NOT honest — see scope ruling.
- Latent note: run-22 delayMs=75000 on a priority partition implies the ledger rebalancer evaluated isControlPlanePriorityPartition()===false at that tick (should be 5000 priority cadence) — possible misclassification; observability/latent-defect note for the quest.

### V7. Gate 0 + composition (surface F)
- assertLocalControlPlaneMutationReady (provisioning-admission-policy.js:210-239) has the CL-028 priority-recovery bypass for priority control-plane partitions → cannot veto the ledger cure. ✓
- Composition timeline: during live self-move both holds defer siblings (overlap harmless). At self-move terminal, old hold releases; NEW hold keeps holding until services cache shows placement improved — closes the run-22 release-too-early gap COMPLETELY (placement-derived, not op-row-derived), modulo services-cache row-lifecycle lag (verify: source row deleted only after actual raft removal — cache agent).
- Reverse direction: new hold must sit in the non-disruptive branch of ensureOperationLedgerSelfMoveSerialized AFTER the emergency-ADD early return (:127) and never in the isDisruptiveSelfMove branch (:148-175) — then self-moves and emergency ADDs are exempt by construction. Implementation-order requirement, not a defect.
- Holds gate CREATION only; in-flight workflow steps (e.g. a REPLACE's own source-removal) are untouched ✓ (run-22: source removals are workflow messages, not createOperation).
- Sync-gate coverage not needed for the new hold: predicate is stateless cache read; no TOCTOU between concurrent creates (unlike op-row-based old hold). Async-lane-only placement is sound.
- Storage-full feasible-target residual (surface D): ensureProvisioningAdmissionAllowed (operation-creation.js:430) can reject every zero-replica node → cure unplaceable → hold persists. Rare at formation (fresh nodes); acceptable residual IF observable; optional amendment: feasibility check may reuse the planner's node-eligibility/storage filter.

### V8. DT plan honesty (surface H)
- RED direction needs NO driver placement updates (bootstrap-concentrated fixture; HEAD co-admits after self-move terminal) → not circular by construction.
- GREEN direction: driver-updated services rows model production CDC — honest IFF (1) updates fire only on observed self-move terminal events from the real composed workflow (not timers), (2) the test asserts the typed rejection ('operation_ledger_quorum_concentrated') in the window BETWEEN self-move terminal and placement update (the exact run-22 gap, regression-pinned), (3) row transitions replay the production sequence (target learner→ACTIVE, source ACTIVE→REMOVING→deleted), not a jump-to-final placement.
- Fixture: quest notes coordinator services reads are EMPTY in the DT fixture — the new test must populate the exact read seam the hold uses; direct asserts (no-hold on empty cache) also pin the fail-open doctrine.

### V9. Cache actuals (subagent, verified pointers)
- this.systemTableCache EXISTS on coordinator (rebalance-coordinator-lifecycle.js:92-93, critical dep) and repository (replica-operation-repository.js:513). Read path: getEntityServiceRows → replica-operation-repository-entity-read-methods.js:276-296 (filters service_type+partition_id ONLY — caller must filter status/raft_role). Predicate implementable as designed.
- Field facts: services columns incl. partition_id, node_id, raft_role, status (system-table-core-schema-definitions.js:217-245). status enum LOWERCASE {pending,creating,syncing,active,removing,removed,failed} (replica-operation-progress.js:14-26); raft_role {follower,candidate,leader,learner} (src/raft/constants.js:29-34); ESTABLISHED_VOTER_ROLES={leader,follower,candidate} precedent (replica-handler-transition-policy.js:38-42). Implementation must compare lowercase.
- Row lifecycle: active → removing (replica-handler-remove-execution-methods.js:190-196) → row DELETED (:226-233). Counting REMOVING as a voter is CORRECT for quorum math (source is a raft voter until removal); the planner's exclusion of removing is for PLACEMENT occupancy — different question. The 4-rows-for-3-voters transient is the TRUE raft state (quorum 3 needs N0) — not double-counting. (V3 confirmed.)
- ⚠️ raft_role durable write DEFERS through the control plane (replica-handler-voter-readiness-methods.js:144-199, seedLocalPriorityReplicaRaftRole :160): promoted target may transiently show learner/null → EXCLUDED from voters → concentration OVERESTIMATED → hold persists slightly long. Conservative direction — safe. Small-count math also biases toward 'concentrated' (2 visible voters on 2 nodes ⇒ concentrated by definition) — lag can only lengthen the hold, not open the gap. Acceptable; pin in DT direct asserts.
- Cache is CDC-lagging (system-table-cache.js:691-818); topology guard compensates with cache∪authoritative merge (rebalance-coordinator-operation-read-methods.js:399-478). Cache-only for the new hold is doctrinally consistent (fail-open, absence never blocks) and avoids a new authoritative-read failure surface during exactly the distress window; accepted trade-off (lag bounded, both directions analyzed).
- ⚠️ Feasibility source mismatch (surface D): getReadyNodes = connection_state==='ready' + lease (system-table-cache.js:252-256), but the PLANNER's target set = controlPlaneReadinessService.getNodeReadinessSync-filtered + published-membership-constrained (unified-rebalancer-available-nodes.js:181-226, :330-336) + storage admission (storage-admission-service.js:207-330 rejects capacity-poor nodes). Raw ready-nodes feasibility is LOOSER than what the planner can actually do → hold can persist with no realizable target (and draining nodes may count as feasible). AMENDMENT: feasibility should reuse the planner-aligned node source (getAvailableNodes semantics, sync) + the V4 over-target arm; storage capacity accepted as residual overestimate (rare at formation) with observability.
- No synchronous live raft peer-list actual exists on the coordinator (node-side getTrackedReplicaRole reaches it only via deferred durable write + CDC) ⇒ services rows ARE the best available actual for voter placement; membership publication rows are node-level, not per-replica. Design choice CONFIRMED.

### V10. Test blast radius (subagent, spot-verified)
- createTimeoutTestCoordinator fixture: createMockCache() no-args → EMPTY nodes/services (test/rebalancer/timeout-test-coordinator.js; test-helpers.js:137); broad services queries fall through to rows:[] → new hold inert on all fixture-default tests ✓ (incl. dt6-rebalancer-formation-self-move-interlock.test.js).
- dt6-voter-surplus-promotion-drain-livelock.test.js populates a cache but with sql_write_operations-p1 voters, NOT ledger → safe.
- The feature DT test ALREADY EXISTS UNTRACKED: test/convergence/dt6-formation-ledger-quorum-spread-first.test.js (mtime 2026-07-05 08:55, `?? ` in git status; defines QUORUM_CONCENTRATED_REASON, buildPlacementCache, feasibility control case). Rung-1 WIP from the authoring session.
- Estimated breakage: 0-1 (borderline: test/rebalancer/replace-replica-workflow.test.js — ledger voters on 2 nodes + createOperation ADD of the LEDGER itself: exempt ADD + no nodes cache ⇒ stays green if exemption + feasibility implemented as designed) + 3 planner-level watch items (unified-rebalancer-triggers-bootstrap-lifecycle / odd-replica-policy / replica-state-management-node-state-change — no direct createOperation).
- Interlock skip reason CONFLICTING_OPERATION_IN_FLIGHT already in all RETRYABLE_SKIP_REASONS sets (rebalance-coordinator-concurrent-budget-gate.js:171,203) → no retry-classification test updates needed; typed reason rides admissionResult.reason only.

---

## VERDICTS (per attack surface)

A. DEADLOCK/LIVELOCK — DEFECT (conditional): the cure-planning path has a real closable gate.
   Local-serve-readiness planning gate defers ALL planning for the ledger entity when
   PRIORITY_CONTROL_PLANE_RECOVERY_PENDING + any second blocking reason (unified-rebalancer-
   local-serve-readiness.js:81-94, gate chain rebalancer-planning-gate-methods.js:638-658), and
   the priority bypass does NOT fire for a count-neutral spread REPLACE (rebalancer-priority-
   recovery-planning-gate-methods.js:289-319 requires isPriorityRecoveryFollowUpOperationRequired).
   Run-22 hit exactly this (75s WAIT_LOCAL_SERVE_READINESS). Also budget: exempt-but-wedged
   emergency ADDs can occupy the priority lane ~60-70s (CL-043) against the cure REPLACE.
   BOTH closed by implementing the sealed "classified emergency on quorum-concentration evidence"
   clause at the evidence layer (see scope ruling). "Cure keeps failing on slow seed → hold
   persists" = ACCEPTABLE (releasing recreates the wedge; state is typed+observable; predicate
   re-evaluates per attempt so recovery is automatic) — but add periodic WARN observability.
B. BOOTSTRAP — PASS. Seed provisioning never enters createOperation (seed-partitions-phase.js:71-240);
   only DDL + planner reach the admission chain; ledger/cpp cure ADDs exempt via emergency set
   (interlock :124-129/:290-293, constants :43-53); planner absorbs skips (move-execution.js:95-108).
C. QUORUM MATH — PASS with notes. {active,removing}×{leader,follower,candidate} is the CORRECT
   quorum actual (REMOVING source is a raft voter until removal; row deleted at removal
   completion). Learner excluded ✓. raft_role CDC lag only lengthens the hold (conservative).
   Stale-spread release = observation lag, out of scope (steady-state failure is emergency
   recovery's job). No better synchronous actual exists on the coordinator. Compare statuses
   LOWERCASE (enum is lowercase, replica-operation-progress.js:14-26).
D. FEASIBILITY GUARD — DEFECT (two holes).
   (1) Missing over-target arm: all-nodes-occupied + over-target (surplus removable) reads
   INFEASIBLE → hold releases into a still-concentrated ledger (3-node run-22 shape). Feasibility
   must be (zero-replica ready node exists) OR (occupiedAlive > target).
   (2) Source mismatch: raw connection_state ready (system-table-cache.js:252-256) is looser than
   the planner's target set (readiness-dimension + published membership, unified-rebalancer-
   available-nodes.js:181-226) — draining/not-serve-ready nodes count as feasible → hold with no
   realizable target. Use the planner-aligned node source. Storage-capacity overestimate accepted
   as residual (rare at formation) with observability.
E. CLIENT IMPACT — DEFECT in design premise. DDL does NOT "defer then re-plan": any
   admissionResult with allowed!==true is a target REJECTION (sql-query-engine-provisioning-
   admission-methods.js:34-46); all-targets-deferred ⇒ provisioning-insufficient-targets throw ⇒
   CREATE TABLE FAILS FAST (initial-partition-provisioning.js:279-419). Known latent for the
   run-20 hold; this design WIDENS the window (self-move ~16s → concentration ~30-60s+).
   ARCH-0016/0017: internal transient surfacing as client failure IS the bug. Amendment required.
F. COMPOSITION with run-20 interlock — PASS (with placement requirements). New hold reads
   placement, not op rows → holds through the self-move-terminal→placement-improved window,
   closing the run-22 release-too-early gap completely. Exemptions inherited by placing the check
   in the non-disruptive branch after the emergency-ADD early return. No cross-entity gate can
   block the self-move (V2); gate 0 has the CL-028 priority bypass (V7). Async-lane-only is sound
   (stateless predicate, no TOCTOU).
G. TEST BLAST RADIUS — PASS. 0-1 borderline breaks + 3 watch items (V10). Fixture-default DT
   tests unaffected (empty caches).
H. DT PLAN — PASS with honesty constraints (V8): RED needs no driver updates (not circular);
   GREEN driver updates must be event-gated on real self-move terminals and replay the production
   row-transition sequence; must assert the typed hold in the terminal→placement-update window.

## SCOPE RULING (open question 3): neither MIN nor FULL as framed — "EVIDENCE-EXTENSION" scope
- MIN (skip emergency classification) is REFUTED: (a) it drops an explicit sealed-statement clause
  (goalpost move); (b) it leaves two verified holes — the planning-gate bypass never fires for the
  cure REPLACE (deadlock candidate A), and wedged exempt ADDs can budget-starve the cure ~60-70s.
- FULL as framed ("bypass the global concurrent budget") mischaracterizes the mechanism: the
  emergency lane is a BOUNDED overflow (maxConcurrentAdds + emergencyPriorityOverflowSlotCount,
  priority-recovery-snapshot-workflow.js:28-206), not a bypass — and c-class explicitly commands
  "extend its evidence to quorum concentration rather than adding a parallel lane".
- REQUIRED SCOPE: feed quorum-concentration evidence (the same cache predicate) into the priority-
  recovery admission plan / follow-up-required predicates so that for a concentrated ledger
  partition (i) usesEmergencyPriorityOverflow → EMERGENCY_PRIORITY_ADD budget scope
  (concurrent-add-budget.js:55-64) and (ii) the planning-gate bypass fires
  (isPriorityRecoveryFollowUpOperationRequired → shouldBypass). Budget semantics stay bounded;
  no timeout/budget raised (TEST-0021 respected). Self-move still passes the idle-ledger interlock.

## REQUIRED DESIGN AMENDMENTS
1. Feasibility = (planner-aligned ready node with zero replicas of the partition) OR
   (occupiedAlive > target for the partition) — closes D(1)+D(2).
2. Implement the emergency classification on concentration evidence (scope ruling) — closes A.
3. DDL pacing: provisioning loop must treat decisionType DEFERRED as bounded wait-and-retry
   (or equivalent internal pacing) instead of insta-rejecting targets — closes E. At minimum,
   quest must own the widened fail-fast window explicitly if deferred to a follow-up.
4. Observability: periodic WARN while the hold is engaged (reason + concentration snapshot +
   feasibility basis); plus the quest's own c-class items (SEND_OPERATION info, move partitionId
   in EXECUTE_MOVE/MOVE_SKIPPED). Investigate the run-22 delayMs=75000-on-priority-partition
   misclassification hint (V6).
5. DT honesty constraints per V8; keep the fail-open (empty-cache) and infeasible-no-hold direct
   asserts (the untracked WIP test already has the latter).

## OVERALL: AMEND (design core is sound and verified against code; 3 defect-class amendments
required before implementation — none invalidate the approach).
