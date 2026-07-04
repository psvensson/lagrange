# Adversarial verification: formation-control-plane-move-interlock

## Status: IN PROGRESS

## Diff read
- system-partition-classification.js: isOperationLedgerPartition via resolvePartitionTableId(options) === SYSTEM_TABLE_NAME.REPLICA_OPERATIONS. OK pending resolvePartitionTableId({partitionId}) shape check.
- shared re-export OK.
- operation-creation: sync wrapper wraps createOperationInternal INSIDE operationWorkflowRunExclusive; async lane inserted before ensureNoConflictingInFlightReplaceForRemove.
- new mixin read in full.

## Early suspicions to chase
1. TOCTOU across `await tryClearHeldOperationLedgerSelfMove` in the non-self-move path: after the await, no re-check of state.selfMoveCreateInFlight → a self-move admitted during the await co-admits with this create.
2. Disruptive self-move path does NOT check heldSelfMoveOperationId — second self-move (different ledger partition) can admit while previous self-move still live but not yet observation-visible.
3. operation?.type from queryIncompleteOperations used unnormalized in direction-2 detection — verify shape/casing.
4. queryOperationById return shape vs isOperationTerminal/staleness predicate field reads.
5. isEmergencyPriorityControlPlanePartition semantics — table-membership or live-emergency-state?

## Verified so far
- isOperationLedgerPartition: resolvePartitionTableId({partitionId}) parses table id from partition-id string (canonical pattern + initial-partition map). Call shape {partitionId} valid.
- Emergency predicate = TABLE MEMBERSHIP set {CONTROL_PLANE_PUBLICATIONS, REPLICA_OPERATIONS} (priority-recovery-admission-constants.js:43-47). So ALL ledger ADDs (spread recovery) are exempt in BOTH directions in BOTH gates. CL-013 holds. Sync wrapper (line 275-277) and async lane (line 124-126) use the SAME predicate + direction. PASS.
- createConcurrentOperationBudgetError sets rebalanceSkipReason=BUDGET_EXCEEDED, accepts {message, conflictingOperationId} options (concurrent-budget-gate.js:75-93). PASS (no timeout/budget raises; limit param=1 is only message cosmetics).
- admissionResult {allowed:false, decisionType:DEFERRED, reason, blockingReasons:[{code}]} satisfies isProvisioningAdmissionDeniedError (checks allowed!==true) and createProvisioningTargetRejection (reads decisionType, blockingReasons[].code). PASS.
- workflowOwner.isConcurrentOperationStalePastStepTimeout exists on OperationWorkflowOwner.prototype (verified via node import). Field reads: stepsHistory/updatedAt/createdAt/workflowStep — camelCase. Both call sites pass rowToOperation-mapped camelCase ops (queryIncompleteOperations + queryOperationById both map via rowToOperation). PASS.
- queryOperationById returns operation object (camelCase) or null; cache-first, SQL fallback; returns null for non-coordinator-owned types. isOperationTerminal(operation) accepts operation objects. tryClear catch→false on throw. PASS.
- OperationType values uppercase; rows inserted with normalized type; direction-2 detection on operation.type OK.
- Interlock lane wired FIRST among serialized admission gates in createOperationInternal (before ensureNoConflictingInFlightReplaceForRemove / RemoveLane / budget gates). Dedupe/reuse paths run before it, but those reuse EXISTING ops (already counted as live by direction 1) — acceptable.
- Counter accounting: otherCreatesInFlight incremented immediately before try/finally; selfMoveCreateInFlight set then cleared in finally; heldSelfMoveOperationId only set on successful create with operationId. No leak path found. PASS.

## FINDINGS (candidate FAILs / notes)
### F1 (race): TOCTOU across `await tryClearHeldOperationLedgerSelfMove` (mixin lines ~289-301)
Non-self-move path awaits the point read; after resume it does NOT re-check state.selfMoveCreateInFlight before incrementing otherCreatesInFlight. Interleaving: B (normal) at await; C (ledger self-move) passes sync gate (counters 0/false), sets selfMoveCreateInFlight=true; B resumes cleared=true, admits. C's async lane cannot see B (B has no row yet) -> co-admission, the exact race the wrapper claims to close. Reachable only when held is set (a prior self-move existed). Fix: re-check selfMoveCreateInFlight after the await (or loop).
### F2 (minor): disruptive self-move path ignores heldSelfMoveOperationId
Second self-move admits through sync gate while previous held self-move still live; backstop = async lane observing the committed row (cache-visible post-create), so low risk, but asymmetric — cheap to also tryClear/check held in the self-move branch.
### F3 (scope): queryIncompleteOperations SQL is NODE-SCOPED
SELECT_INCOMPLETE_OPERATIONS WHERE (source_node_id=? OR target_node_id=?) — the async lane's "no other live op" observation only sees ops involving THIS node (plus locally-cached ops). Ops created by ANOTHER coordinator between third-party nodes are invisible. Same read model as all existing budget gates (consistent, "established observation"), and formation is single-coordinator, but the cross-coordinator backstop claim is weaker than stated. Note, not a regression.
### F4 (behavioral): client CREATE TABLE during live self-move can now FAIL FAST
Direction-2 rejects every ADD create; initial-partition provisioning absorbs as target rejections but with routable=0/planned=0 it calls throwProvisioningInsufficientTargets -> client-visible error. reason 'operation_ledger_self_move_in_flight' is NOT in TRANSIENT_PROVISIONING_SHORTFALL_REASONS and checkProvisioningAdmission precheck does NOT run the interlock (provisioningAdmissionPolicy path), so the convergence-wait cannot wait it out. Vs. memory directive ARCH-0016/0017 (internal transient must not surface as client failure). Narrow window (one ledger REPLACE), but check quest intent / test coverage.

## Test runs (all on the working tree with the fix)
- DT6 proof suite: 15/15 pass (npx tap test/convergence/dt6-rebalancer-formation-self-move-interlock.test.js) EXIT=0.
- dt:prove artifact ...14-05-16-299Z.json: verdict red-on-revert-proven (fix GREEN, revert RED exit 1, restore GREEN).
- test/rebalancer ALL 156 suites: 827+1990+2423 asserts pass (8 pre-existing skips), EXIT=0 each shard.
- Both other timeout-test-coordinator consumers pass (timeout-triggers-failure.property, dt6-rebalancer-timeout-failure-virtual-clock).

## F1 CONFIRMED EMPIRICALLY (scratchpad/toctou-repro.test.js)
Setup: self-move A created+held, row made terminal (hold not yet lazily cleared). Fire concurrently:
B = ADD movies-p1 (hits held -> awaits point read), C = REPLACE replica_operations-p2 (second self-move).
Result: BOTH fulfilled -> co-admission of a live ledger self-move with a sibling create.
Root: rebalance-coordinator-ledger-interlock-admission.js:290 — after `await this.tryClearHeldOperationLedgerSelfMove(state)`
resumes, the code does not re-check state.selfMoveCreateInFlight before `state.otherCreatesInFlight += 1` (line 304).
Fix: after the await (whether cleared or not), re-run the selfMoveCreateInFlight check (or loop the whole gate).
One line:
    if (!cleared) throw ...;
    if (state.selfMoveCreateInFlight) throw <blocking error>;  // re-check across the await

## Deadlock analysis
- No DELETE FROM replica_operations anywhere -> held row cannot vanish permanently; unreadable only while ledger degraded.
- Wedged live self-move: CL-043 staleness (stepsHistory/updatedAt/createdAt vs step timeout) clears it in BOTH the async lane
  filter and tryClear. A wedged op whose progress writes fail stops bumping timestamps -> goes stale -> released. Bounded.
- Emergency ADDs (control_plane_publications + replica_operations tables) bypass BOTH gates in BOTH directions -> ledger
  quorum restore can always proceed -> unreadable-ledger dam is self-healing. No permanent all-creates-blocked state found.
- Coordinator restart: in-memory state lost; async lane re-covers from committed rows (subject to F3 node-scoping).

## Final constraint verdicts: see final message.
