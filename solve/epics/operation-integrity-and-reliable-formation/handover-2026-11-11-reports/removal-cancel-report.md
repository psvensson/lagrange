# Removal cancel, spent-wait and participant custody: report (2026-11-11)

All three tasks are implemented, each with a paired witness that drives the production entry point on a real rs-raft group or a real database file. Each witness fails with my source hunks reverted in a scratch copy and passes with them in place. Both residuals were read and pinned by tests. Git state is unchanged.

Every test ran after the thermal gate, under `nice -n 15`, one file at a time through `scripts/run-test-files.js`. eslint is clean on every touched file.

There are two open points:
1. A cancelled removal can still be undone by an inherited RemoveNode held only by another survivor (Task 1, (ii)). This needs a leader-side settlement fact.
2. The degraded "source removed" outcome is a WARN line, not a durable record. A durable record needs `completeOperation(op, {stepMetadata})`, which is in the other writer's file.

## Task 1: CANCEL_REPLICA_REMOVAL

**Confirmed cause.** In the old code, `src/rebalancer/operation-workflow-replace-owner.js` `handleReplaceTargetDeath` (~:513-523) recorded TARGET_DEAD_SOURCE_RETAINED as soon as the witness said STILL_VOTER. Nothing touched the node side:
- The REMOVING row stayed in place, so any leader's row-driven reconcile could still propose RemoveNode(s).
- The serving fence stayed raised.
- The removal execution kept waiting, and the old 30 s backstop then retired the port.

A real-group debug run reproduced it. The operation was FAILED/retained while the committed configuration no longer held s: an inherited R-1f RemoveNode committed after the decision.

**Design decisions.**
- **(i) One owner, typed request.** The single owner is the node's removal owner, `src/node/replica-removal-cancellation.js`. The vocabulary is in `src/node/replica-removal-cancel-contract.js`.
  - Request: `{operationId, partitionId, replicaId, replicaGeneration}`, where the generation is the source row's `created_at`. The coordinator reads it authoritatively through `getActualReplicaObservation`.
  - It is idempotent. A repeat answers the state the first request left.
  - A removal of the same replica owned by another operation answers UNAVAILABLE / OTHER_OPERATION.
  - A different generation answers UNAVAILABLE / GENERATION_MISMATCH.
- **(ii) What CANCELLED guarantees, in order.**
  1. The local exit is held.
     - If a removal is running, the cancel is handed to it. The cancel releases that removal's consensus-exit wait with exit reason CANCELLED, through a per-removal AbortController combined with the shutdown signal. The removal settles the cancel at its next checkpoint: before its retiring row, or at the wait. So its exit path cannot retire the port meanwhile.
     - If nothing is running, nothing local can retire the port.
  2. The replica's own applied configuration names it a voter, and its own log holds nothing that could still commit its removal:
     - leading: `currentTermApplied && !confChangePending`;
     - following a known leader: `appliedIndex === lastIndex`.
  3. The row moves REMOVING → ACTIVE by compare-and-set on the exact REMOVING generation. This is a new single-purpose edge, `src/node/replica-state-machine-removal-cancellation.js`. The ordinary transition table is unchanged, so a timeout or failure still never reverts a removal. A serving row stops survivor proposals (`forgetDeferredRetirement`). While the target is silent past the leader's liveness window, REMOVES_LIVE_QUORUM also refuses new proposals.
  4. The configuration is read again. Still a voter → CANCELLED: the fence lifts, local status becomes ACTIVE, the execution ends with no executor outcome. Absent → the retiring row is published again and the answer is ALREADY_REMOVED; the teardown completes.

  Crash cases:
  - A crash before step 3 leaves the REMOVING row with no execution. A repeated request runs steps 2-4.
  - A crash after step 3 leaves a serving row. A repeat answers NOT_IN_PROGRESS or ALREADY_REMOVED.

  **Residual, recorded in the owner header.** A RemoveNode proposed by an earlier leader and held only by another survivor's log, not yet replicated to s, can still commit after CANCELLED. Closing it needs the leader's `currentTermApplied` in the witness observation, so the asker can require it before recording retained. That observation is an exact-record contract in `raft-committed-membership-stamp.js`, used by many consumers, so I did not widen it.
- **(iii) ALREADY_REMOVED.** The operation is never recorded as "retained". The owner reports the degraded group by name as a WARN:
  - `outcome: replace_target_dead_source_removed`;
  - `degraded {removedSourceReplicaId, deadTargetReplicaId, lastObservedVoterReplicaIds, repair: durability_repair_add}`.
  It then waits (SOURCE_MEMBERSHIP_REMOVAL_PENDING). The one R-1a completion edge completes the operation as REMOVED from the committed absence.

  Why not a separate FAILED: the source's own REPLICA_REMOVE_COMPLETED outcome, and P6 (c), already complete the same end state as REMOVED. A separate FAILED raced them in the real-group run and gave two classifications of one state, so I kept one classification.
  - Open: the degraded mark is a log line, not durable step metadata, because `completeOperation` takes no options (`operation-workflow-transition-persistence.js`, the other writer's file).
  - Please decide: either a durable degraded record on that completion, or supersede P6 (c) so that "target gone + source absent" is a FAILED-degraded outcome everywhere. The latter is a one-line reorder in `reconcileReplaceStoppingOwner`, but it changes 5 pinned cells, which I tried and reverted.
- **(iv) UNAVAILABLE, or an undelivered or untyped answer.** The owner records nothing and waits with SOURCE_REMOVAL_CANCEL_PENDING. It is woken by its ordinary owner wakes. The post-intent budget stays a diagnostic only (existing D2 rule).
- **(v)** TARGET_DEAD_SOURCE_RETAINED is recorded only on CANCELLED or NOT_IN_PROGRESS. The step metadata carries `replaceTargetDeath.sourceRemoval {answer, reason, generation}`.

**Changes.**

New files:
- `src/node/replica-removal-cancel-contract.js`
- `src/node/replica-removal-cancellation.js`: handler `handleCancelReplicaRemoval`, the checkpoint, and execution registration.
- `src/node/replica-state-machine-removal-cancellation.js`
- `src/rebalancer/operation-workflow-replace-source-cancellation.js`
- `src/rebalancer/operation-workflow-replace-source-retirement.js`: R-1f moved out of the REPLACE owner unchanged, to keep that file under 800 lines (it is 722 now).

Edits:
- `src/rebalancer/operation-workflow-replace-owner.js`: `handleReplaceTargetDeath`.
- `src/rebalancer/operation-workflow-replace-witness.js`: optional extra message fields.
- `operation-workflow-replace-terminal-admission.js`: doc only.
- `src/constants/messages.js` and `replica-operation-constants.js`: message type, plus REPLICA_GENERATION and REMOVAL_CANCELLATION fields.
- Handler wiring: `replica-handler-class.js`, `replica-handler-lifecycle-methods.js` (dispatch).
- `replica-state-machine.js` (+5 lines) and `replica-state-machine-constants.js` (reason REMOVAL_CANCELLED).
- `replica-handler-constants.js`: two log messages.
- `partition-service-removal-serving-methods.js`: `liftServingAdmissionFenceForCancelledRemoval`.

**Tests.**
- **Witness:** `test/rebalancer/replace-real-group-target-death-cancel.test.js`, 33 assertions, 3/3 runs. It uses a real group {s, x, t}, a real coordinator, and the production handler's `handleMessage`. Faults are injected at ports: t is isolated, the FD row says FAILED, the R-1f delivery fails, and the leader's row-driven reconcile is modelled exactly on its row condition.
  - CANCELLED: FAILED/retained only after the cancel. The row serves, no survivor proposes, the fence lifts, local status is ACTIVE, the lifecycle stays active, s stays a committed voter, and a write lands. Then the dead t is removed, a repair ADD brings the group back to 3 voters, and a write lands.
  - ALREADY_REMOVED: the answer is ALREADY_REMOVED, then REMOVED (R-1a). Never "retained". One named degraded report. The source's lifecycle is retired, its row deleted, the group is at 2 voters, and the repair ADD restores 3.
- **Before (source reverted):** CANCELLED fails 7 assertions (no cancel asked, row REMOVING, fence raised, removal still running); ALREADY_REMOVED fails 5.
- **Adjusted:**
  - `replace-real-group-completion.test.js` P1 prime: the source row the owner reads was deleted by the test, so the generation is unknown. It now waits with SOURCE_REMOVAL_CANCEL_PENDING and writes nothing. Once the node's row is visible again, it cancels and records retained. 150/150.
  - `replace-witness-fixture.js`: answers CANCEL from its configuration.
  - `replace-real-group-harness.js`: routes CANCEL to the source handler's `handleMessage`, or UNREACHABLE.
  - `replica-removal-consensus-exit-fixture.js`: a bound transport handler, which the ACTIVE CAS requires, and the fence lift.
- **Green:** d2 92, completion 150, replace-source-removal-owner 100, terminal-failed-add-target-cleanup 109, replace-owner-wake 182, phase-staleness 22, lease-causal 20, lease-verdict-property 38, handoff 84, retire-route 11, latency 30, deposed-leader 24, partition-removal-live-quorum 1, subject-leadership 4.
- **Not mine, red with all my source hunks reverted (only my test-fixture edits remained, which do not touch these cases):**
  - `replace-owner-recovery-equivalence` (active_deferring "phase reached", S9);
  - `replace-real-group-scheduling` (S11 concurrent operation). Likely the other writer's repository and visibility work.

**R09 supersession text.**
> R09 supersession, 2026-11-11 (D2): after the durable intent, a REPLACE whose target died with its source still a voter records TARGET_DEAD_SOURCE_RETAINED only after the source's node answers CANCEL_REPLICA_REMOVAL with CANCELLED or NOT_IN_PROGRESS. Any other answer records nothing and waits (SOURCE_REMOVAL_CANCEL_PENDING). ALREADY_REMOVED is reported as the named degraded group (replace_target_dead_source_removed, repair durability_repair_add) and completes by R-1a. This supersedes "FAILED source-retained is written on the witness's STILL_VOTER alone". The replica lifecycle gains one authority-bound REMOVING → ACTIVE edge, owned by the node's removal-cancellation owner; the transition table is unchanged.

## Task 2: a spent wait never retires a voter

**Confirmed causes,** in `src/node/replica-removal-consensus-exit.js` and `replica-handler-remove-execution-methods.js` (old):
- BACKSTOP finished the wait (~:143), and `performReplicaRemoval` (~:307) went on to `retireReplica` and deletion regardless of the exit reason.
- `consensusExitOf` (~:67-76) answered GROUP_UNAVAILABLE for any refused read (HELD, closed), and teardown followed.
- It answered REMOVAL_APPLIED for UNRESOLVED (a voter without identity) when the gate was open.
- A read that threw finished the wait with GROUP_UNAVAILABLE (~:130), and teardown followed.
- NO_CONSENSUS_PORT went to teardown with no evidence.
- Separately, `reconcileRemovedReplicaCleanup` deleted storage with no participant-custody check (see Task 3).

**Design and changes.**
- The primitive now exits only on REMOVAL_APPLIED: ABSENT and gate open.
- Refused, thrown and unresolved reads are no evidence. The wait continues, and `lastObservation` records what was read.
- GROUP_UNAVAILABLE is removed. CANCELLED is new.
- The new owner `src/node/replica-removal-participation.js` holds the exit loop moved from the execution file, which shrinks that file from 837 to 781 lines.
  - BACKSTOP is reported once (`wait_bound_spent`, the same single report) and the wait is armed again.
  - Each round reads again, so a missed event is recovered by a read, never by a retirement.
- `requireRemovalTeardownAuthority` allows teardown only on:
  - REMOVAL_APPLIED;
  - GROUP_RETIRED;
  - or, with no port, a durable lifecycle that is absent (it never held consensus) or already retired.
  Anything else is the retryable REPLICA_REMOVAL_CONSENSUS_EXIT_DEFERRED: the port is kept and the owner re-drives.

**Tests.**
- **Witness**, appended to `test/node/replica-removal-consensus-exit.test.js` (33/33). Real two-voter group, production handler, mocked setTimeout. The bound is spent twice:
  - one alarm;
  - lifecycle unchanged and the port answers;
  - still a committed voter;
  - a write in {s, leader} commits, which needs s's ack.
  Then RemoveNode commits late: the exit is REMOVAL_APPLIED, it retires, the row is deleted, REMOVE_COMPLETED.
- **Before:** 5 assertions fail: retired after the spent wait, port gone, the write did not commit, and the removal never committed.
- **Adjusted:**
  - `replica-removal-consensus-exit-decisions` (16/16): new cell. Refused, thrown and unresolved reads each answer BACKSTOP with their `lastObservation`. Before: all 3 failed.
  - `reported-once` (7/7): the caller is the participation module.
  - `replica-lifecycle-durable-generation` (194/194) and `replica-handler-owner-path-bypass` (84/84): their stubbed exits now name REMOVAL_APPLIED. The owner-path stub replica also gets an idle in-memory participant store. That file is exactly 1500 lines.
- **Green:** group-retirement-as-a-unit 189 (W7 still sees exactly one alarm), deferred-row-write 13, leader-source 20, reasked-after-completion 18, runtime-service-remove-execution-custody 5, failed-replica-removal-transition-tolerance 12, evidence-o1-admission-liveness 3, message-group-replace-removal-fence 3, group-retirement-{fail-closed 62, fences 68, redrive 100, reseed-held 37}, group-retired-tombstone 34 and -incarnation 69, replica-failed-create-cleanup-generation 52, fresh-create-claimed-cleanup-never-admitted 5, replica-handler 453, runtime-service-{bound-route 63, handler 51}, message-group-service-handler 8, runtime-service-replace-canonical-target-handoff 12, removed-replica-cleanup-debt-owner 35.

**Left open.** A resumed removal whose replica has an active lifecycle row but no open port now defers typed and indefinitely. Before, it tore down. Whether startup reopens the port of a REMOVING replica is an owner question I did not resolve.

**R09 supersession text.**
> R09 supersession, 2026-11-11 (ruling F2 consensus exit, owner decision 2026-10-04): the consensus-exit backstop stays an alarm reported once, but "the removal proceeds as before so a missed event never wedges the node" is superseded. A spent wait is a deferral: the port is kept, the wait is re-armed, and each round reads the configuration again. A refused, unreadable or unresolved configuration is no evidence. Local teardown rests only on REMOVAL_APPLIED, GROUP_RETIRED, or (without a port) a durable lifecycle that is absent or already retired; otherwise REPLICA_REMOVAL_CONSENSUS_EXIT_DEFERRED.

## Task 3: participant custody on real debt

**Confirmed cause.** `participantTransactionCustodyOf` (`partition-participant-transaction-session.js` ~:407) returned CLOSED before looking at sessions or reservations. The removal (`replica-handler-remove-execution-methods.js` ~:283) then treated CLOSED with a durable retiring row as "its own teardown" and went on to retire and delete. The rebuilt witness showed the database file holding a PREPARED row was deleted: in the reverted scratch run the directory was gone.

**Design and changes.**
- CUSTODY.CLOSED is replaced by UNAVAILABLE. Volatile sessions answer ACTIVE first. A released connection with no sessions answers UNAVAILABLE, never settled.
- The removal-serving surface's CLOSED answer now carries `participantCustody`.
- New `readDurableParticipantCustodyAt(dbPath)` in `partition-participant-transaction-store.js` reads the file on an independent read-only connection:
  - ACTIVE when a PREPARED row exists;
  - IDLE when there is no file or no table;
  - UNAVAILABLE when the file is unreadable.
- `requireRemovalParticipantCustodySettled` (participation owner) runs at the irreversible boundary of `performReplicaRemoval` (before `retireReplica`) and of `reconcileRemovedReplicaCleanup` (before takeover). It uses the live connection, or the file once the connection is released. Anything but IDLE throws REPLICA_REMOVAL_PARTICIPANT_CUSTODY_DEFERRED (retryable, typed). Nothing is retired, deleted or completed, and PREPARED is kept.

**Tests.** Appended to `test/node/replica-handler-remove-closed-service.test.js` (6/6). It uses the real ReplicaStateMachine with a lifecycle store and a real database file, through `handleRemoveReplica` and the real asynchronous start:
- (a) A resumed removal with a released connection and a durable PREPARED row: REPLICA_REMOVE_FAILED with deferRetry and the custody code. Row REMOVING, local status REMOVING, file kept, PREPARED intact.
- (b) After the participant is settled to COMMITTED through `updateParticipantTransactionDecided`, the same REMOVE completes: row gone, REMOVED, file deleted.
- (c) A duplicate after completion answers COMPLETED. The service is never reopened and its db stays null.

Before: the case fails because the first removal deleted the database directory with the PREPARED row in it. The fence and drain case now expects `participantCustody: unavailable` on CLOSED. Green neighbours: partition-tx1-single-path-alpha 7, participant-transaction-staging 19, transactions-query-routing 66.

**Not addressed:** the serving drain still polls every 10 ms while custody is ACTIVE on an open connection. That is a poll, not a named, woken wait.

## Residuals read and pinned (`test/raft/raft-rs-removal-step-down-and-liveness.test.js`, 2/2)

These tests pin the current behaviour and passed before as well, so there is no before-failure; no code changed.
- **Removed-leader step-down** (`stepDownIfRemovedLeader`, `raft-rs-runtime-owner.js` ~:1488). The MOST_CAUGHT_UP decision chooses only from the configuration's voters, never a learner, itself or an outsider. With no voter it is a typed CORE_REFUSED (NO_ELIGIBLE_SUCCESSOR) and nothing is stepped. The queued flag allows one transfer per drain, so a group with no caught-up voter re-asks once per later drain and never loops in its own turns. It still re-asks every drain for as long as it leads, which is bounded in rate but not in duration.
- **VOTER_LIVENESS_CHANGED volume.** It fires on the first sample of a leadership and on a change of the live set only. A voter whose recentActive flag clears every election timeout causes no change. One dead voter gives exactly one change, about two election timeouts later. Minor: `lastActiveTick` is never pruned of removed peers, which is bounded by membership history.

## Transition record

| Concern | Old owner | New owner |
|---|---|---|
| "Removal cancelled" | none | node removal-cancellation owner |
| REMOVING → ACTIVE | forbidden | authority-bound edge in `replica-state-machine-removal-cancellation.js` |
| Exit loop and teardown authority | execution file plus primitive | `replica-removal-participation.js` |
| R-1f re-drive | REPLACE owner | `operation-workflow-replace-source-retirement.js` (moved, unchanged) |
| Durable custody read | none | participant store |

- **Invariants:** no "retained" without a typed cancel; no teardown without exact evidence; nothing irreversible with custody not IDLE.
- **Named states:** CANCELLED, ALREADY_REMOVED, NOT_IN_PROGRESS, UNAVAILABLE (with reasons); SOURCE_REMOVAL_CANCEL_PENDING; REPLICA_REMOVAL_CONSENSUS_EXIT_DEFERRED; REPLICA_REMOVAL_PARTICIPANT_CUSTODY_DEFERRED; CUSTODY.UNAVAILABLE; exit reason CANCELLED.
- **Removed code:** GROUP_UNAVAILABLE; CUSTODY.CLOSED; the backstop-proceeds path; the UNRESOLVED-as-applied path.

## Lab runs needed (integration owner)

- `npm run generate:source-owner-index`, after all writers land. The index is stale in 8 directories including mine; new files need entries.
- `test:static`: `audit:guidelines` (the inline `'string'` typeof in `replica-removal-cancellation.js` `ownLogSettled` may be flagged), `test:complexity`, `test:complexity:cognitive`, duplication, `test:unused` (new exports), `test:cycles` (rebalancer imports `node/replica-removal-cancel-contract.js`).
- Full `test/node`, `test/partition`, `test/raft`, `test/rebalancer`, `test/message-group`, plus the integration lanes that run removals (`message-group-service-handler-services-row`, `fresh-create-authority-unavailability-native`, `bound-creation-restart`).
- `audit:file-size`: source 24 > 21 and test 22 > 21. None of the oversized files is mine; mine are all under the limits, and `replica-handler-owner-path-bypass.test.js` is at exactly 1500.

## Left
1. The Task 1 residual: an inherited RemoveNode held only by another survivor. It needs a leader settlement fact in the witness observation contract.
2. A durable degraded record on completion, or superseding P6 (c).
3. A REMOVING replica with no port after a restart now defers indefinitely.
4. The two rebalancer reds above, which belong to the other writer.
