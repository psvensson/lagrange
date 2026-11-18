# Recovery lifecycle repairs: restart recovery, critical-remove reads, global count

Tree: `work/canonical-authority-epic-20261110`, uncommitted, based on HEAD 103f132c1. I changed no git state. Every test ran one file at a time behind `wait-for-thermal-headroom`, under `nice -n 15`. Each "before" proof ran in a scratch copy of the working tree with only my hunk absent.

## A. Restart recovery and in-flight membership effects

### Settled: `handleRecovery` had no production caller

Neither copy is called anywhere in `src/`:
- the coordinator's (`rebalance-coordinator-recovery-helper.js` and its bindings);
- the workflow owner's (`operation-workflow-recovery-reconcile.js`).

What the coordinator really runs on a restarted node is the timer in `rebalance-coordinator-lifecycle.js` `startTimeoutChecking`:
- `checkTimeouts()`: step budgets, which also reconciles reservations;
- `reconcileOrphanedOperations()`: the level-triggered PROGRESS-cause reconcile of locally owned, non-terminal rows that are stale or whose replica truth is actionable;
- `reconcileMessageGroupMembershipDebt()`.

So `handleRecovery` was a recovery routine that only tests ran. It was also the only path to the destructive RECOVERY-cause decisions. **I deleted it.**

### Census of every decision that failed an operation on restart

All four sat on the RECOVERY cause, which only `handleRecovery` reached. All four are deleted.

| Decision | Evidence that no effect is in flight | Verdict |
|---|---|---|
| `FAIL_PRE_SYNC_RECOVERY`: PENDING, SENDING, CREATING → FAILED "Node recovery - incomplete operation" | None. SENDING and CREATING have an effect in flight by definition. A PENDING message-group membership REPLACE can carry a learner proposal already in raft (phase `learner_proposal_in_flight`, obligation `unknown`). | Deleted. The row is left to its owner: the membership-debt owner, the orphan sweep, or the step-budget timeout. |
| `FAIL_STOPPING_RECOVERY`: STOPPING (pre-intent) → FAILED | None: a removal may already have been sent. A post-intent REPLACE was already resumed instead of failed. | Deleted. |
| SYNCING with replica "not found" → FAILED | An actual-status read of null does not distinguish absent from unread. | Deleted. |
| SYNCING with replica FAILED → FAILED "during sync" | The replica's own FAILED status. | This one has evidence, so it is not deleted. The PROGRESS path keeps it under the general `REPLICA_FAILED_DURING_OPERATION_RECONCILIATION`; only the recovery-specific message variant is gone. |

Also deleted, because only `handleRecovery` reached them:
- `reconcileRecoveryOperation` and `reconcileSyncingOperation` on the coordinator and the owner. The coordinator's question (2) asked about the latter; see below.
- `operation-workflow-reservation-recovery.js` and `OPERATION_RESERVATION_RECOVERY_OUTCOME`.
- `NODE_RECOVERY_MARK_FAILED_WORKFLOW_STEPS`.
- The RECOVERY log messages and the `RECOVERY_COMPLETED` event.
- The `cause` parameter of `resolveOperationLifecycleAction`.

There is no dual path left.

### Errors collected during recovery

`result.errors` is gone together with `handleRecovery`. It was the only recovery error list, and nothing in production read it. The timer chain rejects into `logQueryOperationsFailure`. The rewritten integration subtests assert outcomes directly. A failing census now **rejects** (subtest 15 asserts `rejects`), where before it was folded into `{available: false}` inside a collected list.

### The owner must pick the row up: now armed

Without `handleRecovery`, nothing on a restarted node read the authoritative debt census, and the cache hint can miss an owing row. So `reconcileMessageGroupMembershipDebt()` on the workflow owner now reads the **AUTHORITATIVE** census on every timer tick until one answers. After that the cache hint serves. A census that does not answer keeps the restart census owed, and the next tick asks again.

### Learner-discovery integration test

`test/integration/message-group-learner-discovery.integration.test.js`:
- **Subtest 12, rewritten.** Production restart path: the orphan sweep leaves the PENDING learner REPLACE untouched (not failed, not re-proposed, proposal count unchanged). Then the first debt sweep with no argument reads the owner census and records the exact learner outcome (`summaryOf({recorded: 1})`, `assertExactReceipt`).
- **Subtest 15, rewritten.** A census that throws rejects. The next tick reads the owner census again and recovers.
- **Subtest 13** now passes the periodic census explicitly (`DEBT_CENSUS.CACHE_HINT`).
- **After:** 21 assertions, all pass.
- **Before** (scratch copy with the old owner code): subtests 12 and 15 fail. With no argument the debt sweep used the cache hint, which lists nothing, so the row was not recovered. The old `handleRecovery` FAILED the row (shown in the earlier triage). At HEAD it only stayed green because `failOperation` threw a TypeError before persisting.

### Genuinely pre-effect PENDING row

The legitimate outcome is now the owner's:
- the orphan sweep re-drives it once it is stale past its step timeout;
- the step-budget timeout ends it with a typed timeout;
- the dispatch path replays it.

Restart no longer fails it merely for being incomplete. **Open:** I have not written a separate witness for this case; the migrated restart tests below are expected to carry it.

### Test migration (helper subagent; it ran no tests)

I ran every migrated file myself afterwards; all pass.
- **step-policy (45 assertions):** the deleted export is pinned as absent.
- **canonical-replica-completion-observation (5):** now uses the PROGRESS cause.
- **orphaned-operation-reconcile-redrive (17):** adds a new-law test, a fresh PENDING row with no replica is not FAILED by the orphan sweep.
- **reservation-fail-closed-dispatch-gate (74):** the restart is the timer tick, `checkTimeouts` then `reconcileOrphanedOperations`. Kept: no dispatch while reservation authority is down, at most one progress owner, the row is not failed, no duplicate operation or reservation, the hold stays ACTIVE.
- **reservation-file-backed-restart (27):** the same, over the reopened SQLite store.
- **coordinator-reservation-lifecycle (86):** see the leak below.
- **partition-policy-remove-retry (20):** the canonical retry timer is still retained, and exactly one REMOVE follows once policy and voters are restored.
- **replace-source-removal-owner (100), replace-in-flight-blocks-planning, replace-replica-workflow (291):** `reconcileSyncingOperation` → `reconcileOperationProgress`.
- **rebalance-coordinator-timeout-cache-visibility (212):** the tail case that pinned "PENDING marked FAILED" now asserts the row stays PENDING.
- **owner-path-convergence (46):** the three `handleRecovery` subtests now go through the orphan sweep and still assert the shared runExclusive key.
- **The two recovery property files (26 and 21):** "restart fails pre-sync and STOPPING rows" is inverted to "not failed within budget". Stale rows are retired by their owner (re-drive or timeout). SYNCING with an ACTIVE replica ends ACTIVE; SYNCING with a FAILED replica ends FAILED.
- **`test/shards/impact-contracts.json`:** the entries for the deleted module are removed.

Tests that tolerated a non-empty recovery error list: every former `handleRecovery` test (owner-path-convergence, reservation-fail-closed, reservation-file-backed, partition-policy in both loops, coordinator-reservation-lifecycle, cache-visibility-tail, and the two property files except one empty-store case). All are migrated. No result-error list remains: the production entries report per-operation errors through `handleReplicaOperationReconcileError` and logging.

Properties I could not keep, by design under the new law:
- **"Restart re-drives a reservation-backed PENDING row to dispatch":** that was the deleted reservation-backed re-drive. A non-priority PENDING row is now held until its step budget and then timed out. That is liveness, not safety. Weakened alongside it: "exactly one retry reconstructed" became "at most one progress owner".
- **Also found and fixed: a reservation leak.** `checkTimeouts` returned on a confirmed-EMPTY ledger *before* `reconcileReservations()`. With `handleRecovery` gone, a hold whose operation is terminal was never released while nothing was in flight. The EMPTY branch now runs the reservation sweep: `reconcileReservationsOnSweep`, extracted in `operation-workflow-recovery-timeout.js`.
  - Witness: `coordinator-reservation-lifecycle.test.js` "checkTimeouts - releases an orphan hold and keeps a live one".
  - Before the fix it failed 2 assertions ("the timer sweep releases exactly the orphan hold"); after, 86 assertions pass.
- **Clean-up:** removed the now-unused `OPERATION_WORKFLOW_OWNER_LITERAL.RECOVERY` and fixed the stale `handleRecovery` comments in recovery-timeout.js and message-group-membership-recovery.js.

## B. `isCriticalRemoveOverReplicated` ignored `authoritativeReadAvailable`

**Cause.** In `operation-workflow-recovery-reconcile.js` (~:522 in the old tree), the rows from an unavailable read (`[]`) have length 0, which is never greater than the minimum. That read as "not over-replicated", so `resolveRemoveSafetyDeferredReason` returned null and the held REMOVE was **failed**.

**Change.**
- `classifyCriticalRemoveReplication` returns a named state: NOT_APPLICABLE / OVER_REPLICATED / AT_OR_BELOW_MINIMUM / UNAVAILABLE.
- `resolveCriticalRemoveDeferReason` defers (REMOVE_SAFETY_BLOCKED) on OVER_REPLICATED **or UNAVAILABLE**.
- Both former callers use it: `getRemoveSafetyDeferReason` and `priority-recovery-superseded-target.js` `resolveRemoveSafetyDeferredReason`.
- What re-asks: the existing remove-safety deferral re-drive.

**Census of the same file.**
- `ensureReplaceRemovalIntentRecorded`: an unavailable durable read gives `false` ("intent not durable"), and the REPLACE owner waits. That is the safe direction.
- `persistReplaceRemovalIntent`: a thrown error is logged and returns `false`, which also waits.
- No other length or empty-list decision on a read remains in the file.
- Note: `getRemoveSafetyDeferReason` and `resolveRemoveSafetyDeferredReason` are near-twins. Both now delegate to the one classifier.

**Witness.** New subtest "a held system REMOVE waits while its replication cannot be read" in `test/rebalancer/remove-safety-concurrent-operation-authority.test.js`. It goes through `workflowOwner.evaluateRemoveSafety` with a concurrent operation the owner can see.
- Replica rows unreadable → DEFER `remove_safety_blocked`.
- Rows answer at the minimum → FAIL (the legitimate outcome).
- Rows answer over-replicated → DEFER.
- **After:** 14 assertions, all pass.
- **Before** (old boolean): assertions 1 and 2 fail; the REMOVE was FAILED on the unread state.

## C. The global in-flight count opened the pacing budget on a failed read

**Cause.** `unified-rebalancer-budget-planning.js` `getGlobalInFlightOperationCount` returned 0 when the read failed or had no rows. The budget read used `OWNER_LOCAL_ONLY`, which also fails on a node that does not host replica_operations.

**Change.**
- **Not hosted vs failed.** The budget reads (`REBALANCER_BUDGET_READ_OPTIONS`) now use `OWNER_LOCAL_PREFERRED_OWNER_RPC_FALLBACK`: the local replica when it is hosted here, the owner otherwise.
- **A failed read throws.** A read that still does not answer exactly one count row throws the typed list unavailability (`buildOperationListUnavailableError`, the list observation contract) and arms the OPERATION_LIST_READ_DEFERRED wait. It never returns 0.
- **Ordinary entities hold.** The loop reports BUDGET_QUERY_FAILED for an ordinary entity's pass.
- **The emergency lane stays ungated.** For `replica_operations` and `control_plane_publications` partitions, `resolveGlobalInFlightOperationCountForBudget` turns the unknown count into "no free budget". The coordinator's emergency admission then decides through the existing priority bypass (`canBypassGlobalBudgetForPriorityRecovery` → `canStartPriorityAddOperation`).

**What breaks the cycle during control-plane recovery.** The count needs the replica_operations owner. The owner is restored by the emergency lane, which this count never holds.

**Witness.** New test "An unanswered global in-flight count holds ordinary planning and leaves the emergency lane to its admission" in `test/rebalancer/unified-rebalancer-node-readiness-replica-state.test.js`. It drives `rebalance()` with the count failing at the gateway port.
- An ordinary partition holds (BUDGET_QUERY_FAILED, wait armed), then admits once the count answers.
- The emergency partition proceeds when emergency admission admits, and does not proceed when it refuses.
- **After:** the file passes, 81 assertions.
- **Before** (old open-on-failure count): assertions 2, 3, 4 and 7 fail. The ordinary move ran on an unknown count, and the emergency lane ran without its admission.

**Test fixture corrections.**
- `priority-followup-creation` read-mode pin: now `OWNER_LOCAL_PREFERRED_OWNER_RPC_FALLBACK`.
- `rebalance-budget-enforcement.property`: the fixture answered COUNT with `{count}`; it now answers `{total_count}`.
- Count stubs (`getGlobalInFlightOperationCount = async () => 0`, the suite's usual stub) were added to the storage-pressure case in lifecycle-and-recovery-progress-events-test-cases, rebalance-pass-leadership-checkpoints, message-group-membership-change-parked and runtime-service-replace-canonical-target-handoff. In those compositions the real budget read never answered (`owner_not_ready`), and they passed only because a failure counted as 0.
- Green: unified-rebalancer.test.js 256, rebalance-budget-enforcement 10, planner-single-path 9, planning-target-readiness-deferred-wake 52, message-group-replica-distribution 178, group-retirement-fences 68, plus the four fixed files.

**Lab risk.** In those test compositions the budget read never answered. A lab formation must confirm that in a real cluster the owner-RPC fallback answers the COUNT on every node. If it does not, all ordinary planning holds; that is the safe direction, but it would be a liveness regression.

## Coordinator addendum (1): two REPLACE harnesses blind to the concurrent operation

**Cause.**
- `replace-real-group-scheduling.test.js` (S11 decide-first and process-first, T5' re-send) and `replace-owner-recovery-equivalence.test.js` ('the driver reached the phase', active_deferring / R-1f, S9) put their concurrent operation only into the cache.
- The test coordinator (`createTestCoordinator`) answers owner reads from its `trackedOperations` store. That store is seeded from the cache only at construction.
- So the authoritative ledger read (remove safety, item 2 of the earlier report) never saw the operation.

**Fix (harness only; the product check is unchanged).**
- `createTestCoordinator` now exposes `coordinator.testReplicaOperationLedger.commit(row)`, a row committed to that durable store and replicated into the cache.
- Both harnesses commit their concurrent row, and its terminal update, through it.
- Green: scheduling 137, recovery-equivalence 288.

**Census for the same blindness.** I searched `test/` for replica_operations rows written only into a cache after construction. The remaining hits are the owner's own row (terminal replication in the replace harness) and admin diagnostics (advisory). Rows passed at construction (`cacheData.replicaOperations`) are seeded into the durable store by `seedReplicaOperationsFromCache`. No other blind fixture was found.

## Coordinator addendum (2): `reconcileSyncingOperation is not a function`

I removed it in item A of this session. `reconcileSyncingOperation` was reachable only from the deleted `handleRecovery` (`git diff HEAD -- src/rebalancer/operation-workflow-recovery-drain.js`: 38 lines removed). Its body ran `reconcileOperationLifecycle(cause RECOVERY)` on a SYNCING row.

The behaviour the tests legitimately pin is "a SYNCING row is reconciled against replica truth and is not abandoned". That is still provided by the PROGRESS-cause path: `reconcileOperationProgress` and the orphan sweep. Only the recovery-only FAIL on a null read is gone, and it was deliberately removed (census row 3). So the tests call the replacement; nothing was restored. The three files are covered by the migration below.

**Still red, not mine: `replace-in-flight-blocks-planning.test.js` W7** ("D2: the STOPPING owner failed the REPLACE", plus 56/58/59/61).
- It is green at HEAD and red in the working tree.
- It stays red with my remove-safety concurrent-operation hunk reverted, and it calls `owner.runReplaceStoppingOwner` directly, so the A/B/C changes are not on its path.
- Trace: `reconcileReplaceStoppingOwner` reaches `isReplaceTargetGone` true → `handleReplaceTargetDeath`, but the row stays STOPPING.
- That code is `operation-workflow-replace-owner.js` / `failOperation` admission in `operation-workflow-transition-persistence.js`, the active removal writer's files. Routed to them.

## Needs a lab run

- The full rebalancer and integration suites. The integration files call `rebalance()` with real compositions and no count stub: multi-node-cluster, cross-node-replica-placement, three-node-seed-rebalance, membership-consistency, node-joining-rebalance, critical-replica-placement-causal-trace, three-node-partition-rebalance, failure-scenarios.
- A fresh three-node formation with a node restart: the restart debt census, no restart FAIL, and the global-count owner fallback answering.
- `npm run -s test:duplication` and the audits on the composed tree.

## Left

- W7 above: removal writer.
- `scripts/check-guideline-decision-boundaries-baseline.json` still holds two `handleRecovery` entries (~5802 and ~6265). They should be tightened by the integration owner. I did not run `--update-baseline`: the checker currently reports 17 new violations from other writers' changes (none in the functions I changed), which an update would bake in.
- `operation-workflow-recovery-timeout.js` is 1032 lines. It was already over the 800-line threshold and already counted in the ratchet; my net change there is a few lines.
- `SQL_RECONCILIATION_REASON.RECOVERY_REPLICA_STATUS` (control-plane read-model-contract) has no remaining emitter. It is an enum member of a control-plane contract, left for its owner.
- Lab: whether the owner-RPC fallback answers the global COUNT on every node of a real formation (C).
