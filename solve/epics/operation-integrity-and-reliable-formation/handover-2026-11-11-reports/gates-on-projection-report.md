# Gates that opened on a failed read or a projection: repair report

Tree: `work/canonical-authority-epic-20261110`, uncommitted, based on HEAD 103f132c1. Rule-set: docs/steering/rules.md (last_reviewed 2026-10-30). I changed no git state.

Every "before" proof was run in a scratch copy of the working tree (`scratchpad/before`) with only my hunk reverted. Every test ran one file at a time behind `wait-for-thermal-headroom`, under `nice -n 15`.

## Item 1. Ordinary-priority serial gate

**Cause.** `src/rebalancer/unified-rebalancer-budget-planning.js` (`getOrdinaryPriorityRecoverySerialGateSnapshot`) read `counts.ordinaryPriorityCount`. When the owner list read failed or was deferred, the count was the projection fallback (often `[]`), so the count was 0 and a second ordinary-priority ADD was admitted.

**Change.**
- `getConcurrentAddCountByPriorityClass` in `rebalance-coordinator-priority-budget-helper.js` now returns `observation`. It is taken straight after the read, before any other await can record another read.
- The gate holds unless `observation.complete === true` and the state is not DEFERRED. On a hold it returns `countState: 'unanswered'` and `ordinaryPriorityInFlightCount: null` (never 0), with `blocked: true`.
- On a hold the gate arms the new named wait **OPERATION_LIST_READ_DEFERRED** (`armOperationListReadWake` in `rebalancer-local-mutation-readiness-wake.js`).
  - The wait listens on the existing cache-change seam for `replica_operations` and the owner-route source tables (nodes, partitions, services, i.e. `REPLICA_OPERATION_ROUTE_SOURCE_TABLES`).
  - When one changes it enqueues one check with the new reason `RECONCILE_REASON.OPERATION_LIST_READ_SOURCE_CHANGED`, then disarms.
  - It adds no timer; the cadence check remains the fallback. It is disarmed on an answered count and on shutdown (`unified-rebalancer-core.js`).

**What breaks the cycle.** The gate only applies to ORDINARY_PRIORITY partitions. The partitions that restore the owner lane (replica_operations, control_plane_publications) are EMERGENCY class and are never gated here.

**Test.** `test/rebalancer/unified-rebalancer-node-readiness-replica-state.test.js`, new subtest "Ordinary priority serial gate holds on an unanswered list read and admits once the owner answers".
- It drives `rebalancer.rebalance()` and uses the real coordinator's read path from `durable-step-authority-fixture` (OWNER_READ.UNAVAILABLE, CACHE_PROJECTION.EMPTY → ABSENT).
- It checks the hold, the armed wait, the wake on a `services` change, and that the ADD is admitted once the owner answers.
- After: file passes, 73 assertions.
- Before (hunk reverted): 4 assertions fail. The ADD was admitted on the unknown count, and there was no countState and no wait.
- I updated existing count stubs to carry an answered observation using the new `answeredPriorityClassCounts` helper in `test/rebalancer/incomplete-operations-read-stub.js`. The stubs are in serial-wait-test-cases (3), node-readiness-replica-state (2) and priority-surrogate-followup (1).

## Item 2. Remove safety: "no concurrent operation"

**Cause.** `operation-workflow-remove-safety-evaluator.js`:511 read `repository.getOperationsByEntity`, which returns the cache projection whenever a cache exists. An empty or lagging projection meant "none", so a removal could run beside another membership change.

**Change.**
- New module `src/rebalancer/operation-workflow-remove-safety-concurrent-operation.js`. It consumes the owner's `getOperationsByEntityAuthoritativeObservation`.
  - DEFERRED → a named DEFER: REMOVE_SAFETY_BLOCKED, or REPLACE_REMOVE_SAFETY_BLOCKED for a REPLACE. Unavailability never fails the removal.
  - Otherwise the CL-043 (stale past step timeout) and CL-044 (uncontactable target) exclusions apply to the owner rows.
- The evaluator was 851 lines on arrival, not the ~799 in the brief. I also moved the STOPPING re-send classification out to `operation-workflow-remove-safety-stopping-resend.js`. The evaluator is now 777 lines.

**What re-asks.** The existing remove-safety deferral re-drive.

**What breaks the cycle.** The replica_operations lane is restored by ADD admission and leadership (the emergency lane). Neither passes this removal floor.

**Test.** New file `test/rebalancer/remove-safety-concurrent-operation-authority.test.js`.
- It goes through `workflowOwner.evaluateRemoveSafety` on a real coordinator, with the concurrent ADD visible only to the owner (cache projection empty).
- Owner unavailable → named wait. Owner shows the ADD → held on it. Owner answers none → passes the floor.
- After: passes, 8 assertions.
- Before (projection loop restored): assertions 1, 3 and 5 fail. No owner read was made, there was no named wait, and the owner-visible concurrent ADD was missed.
- Existing remove-safety tests were retargeted to the owner observation and pass: concurrent-stale-phantom 4, concurrent-down-target 8, universal-floor 17, entity-interaction-contract 34.

## Item 3. Storage capacity accounting

**Cause.** `src/rebalancer/storage-capacity-accounting-service.js` `getSystemTableRows`:
- A failed gateway read returned `result?.rows || []`.
- A missing gateway or query returned `[]`.
- Either way, reserved and used bytes were understated and capacity admission opened.

**Change.**
- A failed read now throws `STORAGE_CAPACITY_ACCOUNTING_UNAVAILABLE` (retryable, with a new constant `STORAGE_CAPACITY_ERROR_MSG.ACCOUNTING_READ_UNAVAILABLE`). The silent `[]` branches are gone, since `ensureDataSource` already proves a readable source.
- `StorageAdmissionService.evaluateCapacity` already turned a throw into CAPACITY_ACCOUNTING_UNAVAILABLE. `resolveDeniedDecisionType` now answers **DEFERRED** (retryable) for it instead of BLOCKED.

**Owner decision on the cache-present branch (not yet implemented).** The cache is a CDC projection with no completeness or currency evidence; `SystemTableCache` exposes none.
- What an admission decision needs to be authoritative: reserved bytes (`storage_reservations` and the liveness of their `replica_operations`). A stale-low projection lets two quick admissions on one node each miss the other's reservation.
- Used bytes (services, partitions, nodes) lag only in the stale-high direction during an operation. The reservation covers the in-flight replica until its services row appears.
- The cache-backed `getCapacitySnapshotForNode` is entitled to advisory uses only: readiness projection, pressure behaviour, metrics, admin diagnostics.
- I did **not** switch admission to an owner read. Every existing admission test composes accounting over a SystemTableCache only (storage-admission-service, functional, reservation-*, admission-real-size-estimates, split-merge-capacity-preflight, formation-sim and others). Switching needs a gateway fixture migration across them, plus a lab cost check: there are per-admission owner reads of reservations and operations.

**Test.** `test/rebalancer/storage-admission-service.test.js`, new "checkAdd - holds on a failed reservations read and decides once it answers". The reservations read fails at the gateway port, then answers with a reservation (BUDGET_EXCEEDED), then answers empty (ALLOW).
- After: file passes, 145 assertions. The no-source test's decision type was updated to DEFERRED on purpose.
- Before (both src files at HEAD): 4 assertions fail. With the failed read the request was admitted at 10% and the hold was BLOCKED.
- Also green: storage-capacity accounting-service 73, functional 85, metrics 70, ownership 140, migration 54, semantic-projection-owner 54.

## Item 4. Background-priority spread release fence

**Cause.** `background-priority-spread-release-condition.js` (`observePriorityTransitions`) read CLEAR from an empty cache projection.

**Why not the node-scoped list.** `getIncompleteOperationObservation` describes a node-scoped list (`source_node_id = ? OR target_node_id = ?`) of unknown age. It cannot certify the fence's cluster-wide "no fence-blocking operation of any phase".

**Change.** New module `src/rebalancer/priority-spread-fence-operation-census.js`: the owner's cluster-wide census (`queryClusterWideIncompleteOperations`, strict owner read). It runs single-flight per coordinator and is cached with the instant it answered.
- A fence-blocking operation in the projection is still IN_FLIGHT, and still rearms.
- An empty projection is CLEAR only if a census answered within the stability window and holds no fence-blocking operation.
- No census, or an older one, gives UNAVAILABLE with reason `operation_census_unanswered`. That holds the fence **without starting or restarting the dwell**, and requests a census.
- A census-only blocking operation is IN_FLIGHT and re-asks the census (the census may be the stale side).
- A census older than half the window is refreshed ahead of need.
- On answer, the census enqueues `RECONCILE_REASON.PRIORITY_SPREAD_FENCE_CENSUS_ANSWERED` for waiters that were held on it. Other waiters are woken only when the census content changed, so a re-ask cannot become a read loop.
- A failed census wakes nobody. The next evaluation, on cadence or any fence wake, asks again.
- The fence's other inputs are unchanged: the drained fence-holding id set, founding-work holds, planner moves never rearming, and the published membership cohort.

**What breaks the cycle.** The fence holds ordinary work only. Priority partitions, whose recovery restores the owner lane, never defer on it.

**Test.** New `test/rebalancer/priority-spread-release-fence-owner-census.test.js` (46 assertions), entering through `resolvePrioritySpreadPlanningGateDecision`.
- (1) No census → named UNAVAILABLE, no release past the window, and the unanswered span earns no dwell credit.
- (2) Census-only blocking op → NOT_HELD.
- (3) Census answers → one wake, the dwell starts, and the fence releases exactly one window after the first HELD observation.
- Before (only my census call reverted in scratch): 11 assertions fail. The fence released on the empty projection.

**Fence test timing migration.** The dwell now starts at the first observation after the census answers, so these tests were migrated with a helper subagent that ran no tests; I ran them all after:
- fence world (`answerOwnerCensus`)
- fence-durable-condition 108
- founding-work 29
- own-moves 29
- real-serve-owner 11
- blocked-spread-release-event-wake 49 (a census port was added to its mock)
- unified-rebalancer.test.js / planning-gate-decisions-test-cases 256

The shared `createMockCoordinator` (test-helpers.js) now carries an answering census port.

One pin value changed on purpose: the release log's `priorityTransitionSource` is now `operation_ledger_owner_census`.

## Item 5. Census of remaining gates

| file:line (current tree) | What it gates | Unsafe direction? | Status / reason |
|---|---|---|---|
| unified-rebalancer-budget-planning.js `getGlobalInFlightOperationCount` (~:149) | global move budget (pacing) | yes, mildly: a failed or empty COUNT read gives 0 in flight and the full budget | **Left.** It reads a local replica (OWNER_LOCAL_ONLY/ANY_REPLICA). Throwing would block all planning on nodes without a local replica_operations replica; that needs lab evidence first. The coordinator's own ADD/REMOVE admission is observation-aware and is the real gate, so this is a pacing hint. |
| unified-rebalancer-budget-planning.js `getConfiguredRebalanceBudget` | budget config | no (falls back to the configured default) | advisory |
| rebalance-coordinator-topology-guard-methods.js ~:451-537 (brief said ~:82) | topology-increasing creates | no | Safe. Operations come from `getEntityRecoveryOperationObservation` (DEFERRED unless the owner's bounded-usable exception applies). Cache state is used only as revision/watermark currency evidence. Service rows are cache ∪ owner, which can only count more and so blocks more ADDs. Availability comes from the owner read. |
| unified-rebalancer-replica-state.js `getCurrentReplicas` ~:307-347 | planner input | no | Advisory planner input (REBALANCE_CURRENT_REPLICAS). The execution gates are authoritative: remove safety (item 2), topology guard, admission. |
| unified-rebalancer-follow-up-decision.js `getCurrentPartitionReplicasByPartitionId` ~:694-716 | follow-up planning input | no | Advisory, same as above. |
| operation-workflow-dispatch-response-reconcile.js ~:1228 `resolveCreateInProgressDispatchResponseStatus` | observed create progress | no | The target's response comes first. The projection fallback only advances to committed observed progress (a projection lags, it never leads). Empty projection → no advance. |
| operation-workflow-dispatch-response-reconcile.js ~:1243 `handleCreatePhaseSatisfiedResponse` | ACTIVE on create satisfied | no | Authority is the target handler's answer, not a projection. |
| priority-publication-safety-topology.js `getCachedCriticalReplicaRows` (:273; brief's :91/:283 refer to older content) | addressee lists for replace-owner wakes and survivor asks (operation-workflow-replace-surviving-membership.js:130/196, -replace-owner-wake.js:128) | no | Advisory addressing: an empty projection asks fewer members, which costs liveness, not safety. These files belong to the node-removal writer's family. |
| priority-surplus-remove-placement-fence.js ~:113-126 | surplus REMOVE | no | Already requires available, rowSetComplete, non-partial and a leader witness. |
| entity-service-row-read.js ~:78-104 `readAuthoritativeEntityServiceRows` | services rows for an entity | no | It passes `success` through unchanged. Both consumers gate on it: operation-read-methods:485-515 (`available` requires success + complete + optional leader witness) and priority-publication-safety-rows:120. |
| priority-publication-safety-rows.js :46-90 (`authoritativeReadAvailable`) | remove-safety critical rows | no at the evaluator; **yes at one consumer** | The evaluator (remove-safety-evaluator ~:519) honours the flag. **operation-workflow-recovery-reconcile.js ~:522 does not**: there `criticalReplicaRows.length > minReplicaCount` turns an unavailable read into "not over-replicated", so `resolveRemoveSafetyDeferredReason` returns null and the concurrent-op deferral becomes a FAIL of the REMOVE. This direction is FAIL, not admit, so it is not unsafe. It still loses meaning (unavailable → definite). **Left:** small fix (treat `authoritativeReadAvailable === false` as defer); recorded for the owner. |
| priority-publication-safety-rows.js ~:251-281 `getCriticalPartitionRowForSafety` | leader row for remove safety | no | A failed or empty read returns null. Callers treat null as unavailable (defer). |
| user-table-leader-placement-cure.js ~:258-300 | user-table leadership balancing handoff | no (optimization) | Cache-only, advisory. A leader transfer to a stale "voter" is refused by raft itself and is reversible. Labelled advisory. |
| rebalance-coordinator-priority-budget-helper.js canStartAdd/PriorityAdd/RemoveOperation | coordinator admission | no | They already block on DEFERRED and admit on DEFERRED only through the owner's contained-pressure exception (zero visible ops). The cache-saturation short-circuits only deny. |
| rebalance-coordinator-replica-identity-methods.js:144 `readAdditiveEntityOperationProjection` | replica-id allocation supplement | no | Additive only, after the authoritative gate. It now calls the honestly named `getOperationsByEntityProjection`. |

## Item 6. Split `getOperationsByEntity`

- **Coordinator:** removed `getOperationsByEntity(type, id, options)` and the unused `getOperationsByPartition`. Added `getAuthoritativeOperationsByEntity(type, id)`, the strict owner rows: `getEntityAuthoritativeOperationObservation` + `requireEntityOperationRows`. It throws the typed deferred error.
- **No coordinator projection read.** No production consumer needs one, and adding it would be dead code.
- **Repository:** the cache-first `getOperationsByEntity` was renamed `getOperationsByEntityProjection` (its doc already says ADVISORY). Its only caller is the identity supplement.
- **Callers updated mechanically:** sql-query-engine-provisioning-methods.js, sql-query-engine-provisioning-admission-methods.js, unified-rebalancer-critical-topology-methods.js, plus 19 test files (helper subagent).
- **Tests pinning the removed dual mode** now assert that both old names are undefined: facade-compatibility, readiness-fixture-custody, triggers-scheduling.
- **Green:** required-entity-operation-observation 147, facade-compatibility 27, readiness-fixture-custody 49, critical-topology-committed-lease 58, operation-list-read-authority 23, triggers-scheduling 60, triggers-priority-cohort 14, timeout-cache-visibility 214 (includes test 41), operation-ownership 180, priority-recovery-cache-bypass 53, priority-surrogate-followup 18, query: schema-job-held-founder-release 12, initial-partition-bootstrap-cohort 53, provision-partition-waits 75, provision-partition-quorum 71, provisioning-admission-transient-deferral 34.

## Item 7. Triage: learner-discovery subtest 12

- **At committed HEAD 103f132c1** (scratch `git archive` export with node_modules symlinked): the file is green, 21 assertions. That green is false.
- **Where the HEAD green comes from.**
  - At HEAD, `handleRecovery` already chooses `FAIL_PRE_SYNC_RECOVERY` for `consumer-operation`, a message-group membership REPLACE at PENDING with `messageGroupMembershipPhase: learner_proposal_in_flight` and obligation `unknown`.
  - It then calls `failOperation`, which throws `TypeError: Cannot read properties of undefined (reading 'getNodeReadinessSync')` at `operation-workflow-transition-orchestration.js:234` (HEAD), inside `buildOperationTransitionStepEntry`. The fixture has no readiness service.
  - `handleRecovery` puts the throw into `result.errors`, which the test does not check. So the row is never failed.
  - I traced this by instrumenting both trees: lifecycle action, admission, persist and the exception.
- **First change that makes it red.** The uncommitted `operation-workflow-transition-orchestration.js` no longer reads readiness inside `buildOperationTransitionStepEntry`; readiness evidence logging moved to the new `operation-readiness-evidence-log.js`. With the crash gone, `failOperation` commits FAILED: status failed, completed_at, "Node recovery - incomplete operation". The list-read hunks are not the cause, which matches the brief's observation.
- **Correct behaviour.** Restart recovery must **leave it to its owner**, not fail it and not re-drive it.
  - The row carries owner-recorded membership debt: a learner proposal that may be in raft already.
  - Failing it abandons an effect that may commit, which risks an orphan learner. `handleRecovery`'s own membership-debt census is the owner that records its exact outcome, and that is what the test pins.
  - Re-driving a dispatch-pending row from `handleRecovery` has no production caller on the rebalancer side. The dispatch service's startup replay is the only prompt path.
  - So `resolveOperationLifecycleAction` (`FAIL_PRE_SYNC_RECOVERY`, via `NODE_RECOVERY_MARK_FAILED_WORKFLOW_STEPS` including PENDING) should exclude rows whose message-group membership phase or obligation says an effect may be in flight, and hand them to the membership-debt owner. A PENDING row with no recorded effect stays fail-able.
- **Not fixed.** The cause is in the recovery lifecycle owner (operation-workflow-recovery-status-reconcile.js / replica-operation-step-policy.js), not in my gate files. It is routed here as a finding.

## Files I changed

**src:**
- unified-rebalancer-budget-planning.js
- rebalance-coordinator-priority-budget-helper.js
- rebalancer-local-mutation-readiness-wake.js
- unified-rebalancer-core.js
- workflow/reconcile-queue-constants.js (2 reasons)
- operation-workflow-remove-safety-evaluator.js
- NEW operation-workflow-remove-safety-concurrent-operation.js
- NEW operation-workflow-remove-safety-stopping-resend.js
- rebalance-coordinator-recovery-helper.js
- rebalance-coordinator-recovery-budget-bindings.js
- replica-operation-repository-entity-read-methods.js
- rebalance-coordinator-replica-identity-methods.js
- unified-rebalancer-critical-topology-methods.js
- query/sql-query-engine-provisioning-methods.js
- query/sql-query-engine-provisioning-admission-methods.js
- storage-capacity-accounting-service.js
- storage-capacity-constants.js
- storage-admission-service.js
- background-priority-spread-release-condition.js
- NEW priority-spread-fence-operation-census.js

**tests:** as listed per item.

## Needs a lab run (integration owner)

- The full rebalancer, query, control-plane and partition suites. Many storage/reservation/readiness test files compose `StorageCapacityAccountingService`; only the storage-capacity-* and admission files were run here.
- A fresh three-node formation, which exercises the fence census (cluster-wide owner reads while the fence is active) and the serial-gate hold during priority recovery.
- `npm run -s test:duplication`. It could not complete here ("metric inputs changed during measurement": other writers are active). Two 13-line `answeredEntityObservation` helpers in the concurrent-* remove-safety tests may trip it; if so, move them into test-helpers.js.
- The unused-exports, complexity, file-size and navigability audits on the final composed tree. The file-size ratchet was already 24/21 before my work, from other writers; my evaluator change reduces it.

## Left

- Item 3: switch admission's reserved-bytes reads to the owner (decision recorded above; needs fixture migration plus a cost check).
- The global in-flight pacing count opening on a failed read (census row 1).
- The recovery-reconcile `isCriticalRemoveOverReplicated` unavailable→FAIL meaning loss (census row 11).
- Item 7's lifecycle exclusion for rows with in-flight membership debt (owner: recovery lifecycle).
