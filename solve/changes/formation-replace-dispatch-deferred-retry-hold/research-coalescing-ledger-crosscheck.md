# Research: coalescing hypothesis + ledger crosscheck (quest formation-replace-dispatch-deferred-retry-hold)
Date 2026-07-05. HEAD = 2009194a + 70e434e6 (terminal-transition durability repair, committed 07-05 01:29 +0200, AFTER run-21).

## TASK 1 — budget-lane coalescing hypothesis: REFUTED for the run-22 shape

### Code facts (all verified on HEAD)
- `DurableWorkflowCoordinator.runExclusive` (src/workflow/durable-workflow-coordinator.js:499-520): if the key is in-flight it RETURNS THE EXISTING PROMISE; the second caller's executionFactory NEVER RUNS. Coalescing confirmed (not queueing).
- `runConcurrentCreateBudgetGate` (src/rebalancer/rebalance-coordinator-concurrent-add-budget.js:15-36): single-flights budget-check+create under per-LANE key `getCreateBudgetSingleFlightKey(scope)`; scope = REMOVE/ADD/PRIORITY_ADD/EMERGENCY_PRIORITY_ADD (:38-65). Formation REPLACEs on priority control-plane partitions land in PRIORITY_ADD (shouldUsePriorityConcurrentAddLane :113-129 accepts ADD+REPLACE).
- `createOperation` (src/rebalancer/rebalance-coordinator-operation-creation.js:62-119): outer single-flight is per-INTENT (:82-85, includes entity/partition/target) — no cross-partition coalescing there; wraps `runOperationLedgerInterlockAccountedCreate` (d07c63dc admission; rejects BEFORE any persist, so it cannot strand rows) → `createOperationInternal`.
- `createOperationInternal` (:145-305) → budget gate wraps `createOperationRecordInternal` (:269-291).
- `createOperationRecordInternal` (:408-564): persists the row (:528 persistNewOperation), THEN — INSIDE the same factory, on the SAME persisted operation object — `emit(OPERATION_CREATED)` + `armCoordinatorCreatedOperationProgress(operation)` (:558-561). The dispatch trigger is NOT armed by the caller on the returned object.

### Finding re-read
"3 concurrent priority-lane creates all returned the same operationId; only 1 row persisted" — CONSISTENT with code: coalesced callers' factories never run, so their rows are NEVER persisted. Only the first caller's row exists.

### Consequences
1. Coalescing CANNOT mint a persisted row no caller holds: a coalesced-away create produces NO row at all (a MISSING op, retried on a later planning tick), never an orphan PENDING row.
2. The persisted row always gets its OPERATION_CREATED emit + arm, because arming happens inside the factory before return. There is no "dispatch trigger keyed on the RETURNED object" path.
3. Therefore the run-22 shape (row EXISTS + PENDING + zero dispatch attempts) is NOT producible by budget-lane coalescing. Coalescing produces the OPPOSITE artifact. It remains a real latent defect (caller B gets caller A's op and believes partition-B's move exists) but is not this quest's defect.
4. Run-21 corroboration: 2f0237dc (nodes-p1, 14:35:15) and ea742515 (tables-p1, 14:35:19) were created 4s apart on the same coordinator (742baa79) and BOTH persisted rows — no coalescing at demo cadence.

### Formation REPLACE creation flow
unified-rebalancer-rebalance-loop.js:80 → executeMove (unified-rebalancer-follow-up-move.js:547) → executeMoveViaCoordinator (unified-rebalancer-move-execution.js:23) → coordinator.createOperation. Creator = rebalancer-leader node's coordinator (run-21: 742baa79 created 2f0237dc + ea742515; 870eebdd created fd0b247f). Only non-planner caller with emitOperationCreated:false = sql-query-engine-initial-partition-provisioning.js:394 (bootstrap provisioning), not the formation path.

### Candidate silent-hold mechanism (for the quest, NOT coalescing)
- If the single post-persist arm fails, it is swallowed: armCoordinatorCreatedOperationProgress catch→warn 'Failed to prime coordinator-created operation progress' (operation-creation.js:585-596). GREP run-22 for that msg.
- Planner-level dedupe (CL-008 layer a: hasPendingAddForNode/hasPendingMove, move-planner-move-calculation-methods.js) suppresses re-planning while the row exists, so `maybeRearmReusedPendingOperation` (operation-intent-methods.js:416-446; rearm only for PENDING with no live local retry, :461-470; SENDING → SKIP_NOT_PENDING) may never run.
- hasLiveDeferredDispatchRetry (:482-504) consults only the LOCAL workflowOwner registries — cross-node ownership blindness.
- Recovery: dispatch-rearm-evidence.js:134-158 treats PENDING/SENDING as dispatch-retryable, but CL-008 notes WAKE_REMOTE_OWNER is DISPATCH_REARM_BUDGET-gated.

## TASK 2 — run-21 rows 2f0237dc / ea742515 / fd0b247f: ACTIVELY-FAILING loops, NOT silent

Archive extracted to scratchpad/run21/service-data-affinity-demo/ (node-{0..4}.log).
- Creation: all three are formation REPLACEs — 2f0237dc nodes-p1→target 3c1e2260 (14:35:15), ea742515 tables-p1→target ab7d7e0b (14:35:19), fd0b247f mg-870eebdd→target 742baa79 (14:36:36). Loops run on the TARGET/owner node (2f0237dc on 3c1e2260=node-1 290 lines; ea742515 on node-4 106; fd0b247f on node-2 152), until run end ~14:45:43.
- Loop signature (identical for all three), msg histogram per op:
  - "Failed to upsert system table row" (tableName=sql_transactions, tx-<opId>:CREATING/:ACTIVE rows) — DISTRIBUTED_PARTICIPANT_FAILURE
  - "Deferred retryable replica operation transition failure"
  - "Deferred replica operation dispatch while control-plane path recovers" (subsystem replica-dispatch-service, retryAfterMs:250, error 'Distributed operation failed due to participant failures')
  - "Rotating transition execution session after stale session collision" (error 'Transaction already active for this session', attempt counter climbing)
- ROOT error under every loop: `Unable to resolve unified peer address for sql_transactions-p1-r5` (105/62/53 occurrences for the three ops respectively). The transition-transaction upsert into sql_transactions-p1 can't reach participant r5 → participant failure → dispatch/transition deferred → 250ms retry forever.
- NOTE vs prior forensics: "never dispatched" is imprecise — dispatch WAS attempted continuously (deferral loop), and 2f0237dc + ea742515 even show one 'Handling CREATE_REPLICA request' + 'Replica creation completed'; the durable op row stayed PENDING/SENDING because every transition write died on the sql_transactions-p1-r5 participant.
- COMPARISON with run-22 (per quest statement: no dispatch attempts logged): DIFFERENT signature. Run-21 = actively-failing dispatch/transition retry livelock (control-plane self-reference, CL-017 class but on sql_transactions instead of replica_operations). Run-22 = silent (no driver). Do not treat them as one mechanism without run-22 log evidence.

## TASK 3 — recorded theories/closures touching this class

Closure ledger (solve/specs/membership-lifecycle-placement-hard-cutover/closure-ledger.md):
- CL-017 (fix-landed) operation-ledger-self-reference: transitions must survive the ledger's own surgery — participant failures pin ops CREATING/SENDING forever when replica_operations-p1 is mid-REPLACE. Run-21's Class B is the SAME class with sql_transactions-p1 as the self-referential table (fix presumably covered replica_operations lane only).
- CL-008 (narrowed) planning-reuse side effects: REFUTED levers recorded — "each re-execution creates a NEW op record" and "no dedup against in-flight ops" are both REFUTED (3 dedupe layers work). Confirmed gap = UNCONDITIONAL rearm on reuse (since bounded by resolveReusedOperationRearmAction). Don't re-propose dedupe-missing theories.
- CL-023 (narrowed): REPLACE terminalization must not assert retirements that never happened (stale replica rows like sql_transactions-p1-r5 lingering is adjacent).
- CL-029 (narrowed): target-completion evidence must retain a retry owner until applied to the durable workflow row.
- CL-038 (guarded): surplus-drain REPLACE source-leader handoff must terminalize when source already removed (STEP_DOWN re-dispatch forever).
- CL-043 (fix-landed): persist-failed REPLACE must not count as active forever in the concurrent-op gate — fix = isConcurrentOperationStalePastStepTimeout.
- Vet doc (vet-ghost-row-theory.md): Class A (terminal transition lost) FIXED by 70e434e6; Class B (these 3 rows) explicitly UNTOUCHED; also recorded: handleRecovery is production-dead (no callers); SYNCING alive-owner ops are SKIP_REMOTE_OWNER forever; refuted lever: predicate strict-floor fix (dt-drain-safety quest).
- theory-ledger.md: theory-2026052x persisted-not-dispatched priority-recovery lineage ("dispatch_pending / planned still the first frontier", rolling-restart line) + active-gate owner-wake scheduling architecture-gap theories (owner_reconcile_pending write_deferred enqueued=false; bounded owner-wake route). Same phenomenon family (persisted-not-dispatched), older harness vocabulary.

## TASK 4 — regression vs long-standing: LONG-STANDING class

- git log src/rebalancer since 07-01: 70e434e6 (07-05 01:29, Class-A durability repair), d07c63dc (07-04 16:30, ledger self-move interlock admission — pure pre-create admission, throws before persist, cannot strand rows), e28f2c72 (07-04 13:58, idempotent op-row inserts), affinity feature commits 07-03/04.
- Run-21 (logs 14:35-14:45 UTC = 16:35-16:45 +0200) ran just AFTER d07c63dc (16:30 +0200) — its 3 stuck rows exist WITH the interlock in place, and the identical class exists in run-19/20 (prior forensics) and in CL-017 (2026-06-11). The pinned-PENDING/SENDING-forever class therefore PREDATES both recent fixes by weeks → NOT a regression from the interlock admission or the durability repair.
- Caveat: run-22's specific SILENT signature (zero dispatch attempts vs run-21's noisy deferral loop) is not yet matched to a run-19/20/21 precedent; if run-22 is genuinely silent, that sub-shape could still be new — needs run-22 log confirmation before calling the sub-shape long-standing.
