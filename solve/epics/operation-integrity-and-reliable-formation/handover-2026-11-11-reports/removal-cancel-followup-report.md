# Removal cancel follow-up: report (2026-11-11)

All five items are done. Item 1, the liveness hole I introduced, is now closed. The settlement witness (item 1) and the durable-record witness (item 2) were each run with my change reverted in a scratch copy and fail there; the drain witness (item 3) has no reverted run. Git state is unchanged. Every test ran thermal-gated under `nice -n 15`, one file at a time. eslint is clean on every touched file.

One file I don't own went red in the tree while I worked, by someone else's change: `replace-source-removal-owner.test.js` (details at the end).

## 1. A REMOVING replica with no port after a restart: liveness hole closed

**What evidence exists after the restart.** Three things:
- The durable lifecycle row in the replica's database file.
- The group's committed configuration as its leader answers it. This is the creation owner's existing read (`readCommittedMembershipStamp` in `src/rebalancer/committed-membership-bootstrap-read.js`): only a leader answers COMMITTED, with one NOT_LEADER redirect.
- The node's own lifecycle owner signal, described below.

I did not reopen the port: the core cannot be kept from campaigning, so the node asks the group instead.

**Changes.**
- **`src/node/replica-removal-group-verdict.js` (new).** It asks the nodes of the partition's other replicas, using services rows for routing only. Answers:
  - REMOVED: the leader's committed configuration names the replica nowhere.
  - STILL_MEMBER: it names the replica as a voter or learner.
  - UNANSWERED: no node answered as leader.
- **`requireRemovalTeardownAuthority`** (`src/node/replica-removal-participation.js`, now async). When there is no port and the durable lifecycle is still active, it asks the group:
  - REMOVED → teardown.
  - STILL_MEMBER → a named, typed deferral, `REPLICA_REMOVAL_STILL_MEMBER_WITHOUT_PORT`; nothing retires.
  - UNANSWERED → `REPLICA_REMOVAL_CONSENSUS_EXIT_DEFERRED`.
  - Each verdict is logged (`REMOVE_GROUP_VERDICT`).
- **What re-asks it.** The REMOVING timeout event already re-fired every 60 s with no consumer.
  - **New `src/node/replica-removal-settlement.js`** subscribes to it as the REMOVING re-drive (`REMOVING_REDRIVE`), wired in `replica-handler-class.js`.
  - When the replica is REMOVING locally and no removal runs, it re-drives the one removal path. It needs no operation id because the durable REMOVING row is the authority.
  - The coordinator's re-dispatch of the REMOVE re-asks as well.
  - The timeout only re-asks; every decision comes from the group's answer.
- **Not done: "resuming participation if the group says still a voter".** The node holds the named deferral but cannot reopen the port. Reopening is the restart restore path, and I could not find where startup restores a partition service whose row is REMOVING. That needs its owner.

**Witness:** `test/node/replica-removal-settlement.test.js`, test 1. A real group {s, a, b} with every member hosted by the production handler; the READ_COMMITTED_MEMBERSHIP between nodes goes through each peer's `handleMessage`.
- The REMOVE is accepted, then the "restart": the removal is released and s's port is gone.
- While the group still names s, a re-dispatched REMOVE gives `REPLICA_REMOVE_FAILED` with `REPLICA_REMOVAL_STILL_MEMBER_WITHOUT_PORT`. The lifecycle stays active, the row stays REMOVING, and s is still a committed voter.
- {a, b} commit RemoveNode(s).
- The lifecycle owner's REMOVING timeout re-drive asks the group and tears s down: REMOVE_COMPLETED, row deleted, local status REMOVED.

## 2. Durable degraded record (decision implemented; P6 (c) not superseded)

- **`completeOperation(operation, options = {})`** in `src/rebalancer/operation-workflow-transition-persistence.js` now takes `{stepMetadata}` and records it on the completion step.
- **For a partition REPLACE**, the one completion sink adds `replaceCompletionStepMetadataOf(...)` itself (`operation-workflow-replace-owner.js`, delegating to `degradedCompletionStepMetadataOf` in `operation-workflow-replace-source-cancellation.js`). When the target is gone at R-1a completion, it records `replaceTargetDeath {outcome: replace_target_dead_source_removed, degraded {removedSourceReplicaId, deadTargetReplicaId, lastObservedVoterReplicaIds, repair: durability_repair_add}}`.
- **One classification.** The outcome is still REMOVED, and every success edge carries the record, including the source's own REMOVE_COMPLETED outcome and P6 (c). There are no new `completeOperation` callers, so the P1 census is unchanged.
- **The planner decides from rows, not the record.** In the ALREADY_REMOVED witness of `test/rebalancer/replace-real-group-target-death-cancel.test.js` (35/35), the production planner (`createTestRebalancer`, over the services and replica_operations rows) plans the ADD. With the record removed in a scratch copy, the record assertion fails and the planner assertion still passes. The ADD comes from `src/rebalancer/move-planner-move-calculation-methods.js` (deficit fill, reason INCREASE_REPLICA_COUNT, around :805-812).

## 3. The removal drain no longer polls

- **New `src/partition/partition-service-removal-drain-wake.js`.** `nextRemovalDrainWake(service)` registers synchronously after the drain reads its state, so it cannot miss a wake. It is woken by:
  - a finished serving request (`partition-service-entry-apply-base.js`, in the finally that decrements the count);
  - a participant session ended, discarded or swept (`partition-participant-transaction-session.js`);
  - the connection released (`partition-service-lifecycle-methods.js`, `closePartitionPersistenceResources`);
  - the port's APPLIED_PROGRESS, which is how a committed entry decides a PREPARED row.
- **`waitForRemovalServingDrain`** has no timer. Its bound is the removal's own, unchanged.
- **Witness:** added to `test/node/replica-handler-remove-closed-service.test.js` (7/7). It shows:
  - the drain stays pending with a request in flight, and still pending after the count changes but before the wake;
  - DRAINED on the request wake;
  - pending while a row is PREPARED, DRAINED on applied progress;
  - CLOSED with custody UNAVAILABLE on release;
  - no listener left behind.

## 4. The residual race: honest contract and a converging end state

- **Contract.** `replica-removal-cancel-contract.js` and the `replica-removal-cancellation.js` header now say CANCELLED means "cancelled as far as this replica's own log shows". The witness contract is not widened.
- **End state.** A RemoveNode of s that commits afterwards leaves s applying its own removal with an ACTIVE row and no removal running. The `REMOVED_OUTSIDE_REMOVAL` branch of `replica-removal-settlement.js` handles it:
  - It is woken by the node's consensus relay (MEMBERSHIP_CHANGED), deferred to a microtask so it never re-enters the port.
  - It requires an exact own-absence past the gate.
  - It then raises the serving fence (stops serving) and marks the row FAILED with cause `own_removal_applied_outside_removal`, logged at WARN.
  - The repair path takes it from there: the planner plans REMOVE (reason `replica_failed`) plus the ADD, and the REMOVE tears the replica down through the removal owner on its applied removal.
  - It never leaves a voter-less replica serving.
- **Witness:** `test/node/replica-removal-settlement.test.js`, test 2, on a real group. It uses the production relay wiring (`relayPartitionConsensusObservations`). RemoveNode(s) commits while s serves; s is fenced and FAILED with the named cause; the production planner over the rows removes the FAILED replica and plans the ADD; the repair REMOVE exits REMOVAL_APPLIED and deletes the row and the storage.
- **Before:** with `subscribeRemovalSettlement` and the group ask reverted, the file fails 7 assertions (STILL_MEMBER deferral, re-drive teardown, fence, FAILED, planner).

## 5. Attribution of the two reds

- **Green at HEAD 103f132c1** (git archive extract): `replace-owner-recovery-equivalence` 288 and `replace-real-group-scheduling` 137.
- **Cause.** The new remove-safety concurrency check, in `src/rebalancer/operation-workflow-remove-safety-concurrent-operation.js` (untracked) called from `operation-workflow-remove-safety-evaluator.js` (~:473). It now reads `repository.getOperationsByEntityAuthoritativeObservation` (the SQL ledger) where HEAD read `getOperationsByEntity` (the cache-first projection).
  - The harnesses write the concurrent operation only into the cache (`concurrentRemoveRow` → `cache.upsert`), so the authoritative read never sees it.
  - Proof: a current-tree copy with only that read switched back to the projection is green on both files (137 and 288).
- **Failing assertions:**
  - scheduling: S11 "decide-first: the effect is withheld (WAIT)", "process-first: deferred", and S11 T5' "no re-send while a concurrent partition operation is active";
  - recovery-equivalence: "the driver reached the phase (production classification: source_row_retiring)", the restart-class "phase reached" cells, "active_deferring: it names its phase / R-1f admissibility", and S9.
- **Owner:** the writer active in `operation-workflow-remove-safety-evaluator.js`, which you told me to stay out of, so I did not change anything there. The authoritative read is the principled side, so the likely fix is in the harnesses: put the concurrent operation where the ledger read sees it.

## Other things found
- **New red, not mine:** `test/rebalancer/replace-source-removal-owner.test.js` now fails at `harness.coordinator.reconcileSyncingOperation is not a function`. That method was removed from src during this session; it was 100/100 earlier. `replace-replica-workflow-tail-test-cases.js` and `replace-in-flight-blocks-planning.test.js` still call it. Owner: whoever removed it.
- **Fixture fixes in `replica-removal-consensus-exit-fixture.js`:** the stub service now has a `timeSource`, because the release-recovery relay listener threw "reading 'now'" inside the port's event and turned it into HOST_FAILURE; and `shutdown` tolerates a null port.

## Tests run (one file each, all green)
- **New witnesses:** replica-removal-settlement 22, replace-real-group-target-death-cancel 35, replica-handler-remove-closed-service 7.
- **Re-run:** consensus-exit 33, consensus-exit-decisions 16, reported-once 7, group-retirement-as-a-unit 189, replica-handler 453, owner-path-bypass 84, lifecycle-durable-generation 194, leader-source 20, reasked-after-completion 18, deferred-row-write 13, group-retirement-fences 68, group-retirement-redrive 100, replace-real-group-d2 92, replace-real-group-completion 150, handoff 84, replace-owner-wake 182, tx1-single-path-alpha 7, participant-transaction-staging 19, transactions-query-routing 66, partition-removal-live-quorum 1, partition-removal-subject-leadership 4, raft-rs-removal-step-down-and-liveness 2.
- **`audit:file-size`:** source 24 and test 22 against baselines of 21. That is unchanged from before; none of the oversized files is mine.

## R09 supersession texts
> 2026-11-11 (ruling F2): a removal resumed without a consensus port, with an active durable lifecycle, asks its group's leader for the committed configuration. REMOVED permits teardown. STILL_MEMBER is the typed deferral REPLICA_REMOVAL_STILL_MEMBER_WITHOUT_PORT. The lifecycle owner's REMOVING timeout is the node's re-drive signal for a REMOVING replica no removal carries.

> 2026-11-11 (D2 / R-1a): a REPLACE completing with its target gone records `replaceTargetDeath.degraded` (removed source, dead target, repair `durability_repair_add`) on its REMOVED completion step. P6 (c) is unchanged.

## Left / lab
- Resuming participation of a still-member replica with no port needs the restart-restore owner.
- Lab runs: full `test/node`, `test/partition`, `test/rebalancer`, `test/raft`, `test/message-group`, because the settlement subscription is on every ReplicaHandler and the drain wake sits on the partition serving path.
- Lab runs: `test:static`, including cycles: node now imports `rebalancer/committed-membership-bootstrap-read.js`.
- `generate:source-owner-index` once all writers land.
