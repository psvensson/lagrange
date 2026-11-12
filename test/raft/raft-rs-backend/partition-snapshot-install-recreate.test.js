// Witnesses of quest partition-checkpoint-epoch-generation, round 4 (verifier
// finding 1): a replica that installs a snapshot is brought back by the node's
// replica handler, whatever lifecycle state its row is in when the install
// lands. Real PartitionServices on the raft-rs port; the target node's
// handler, lifecycle state machine and offer routing are the ones
// ReplicaHandlerSetup.create builds (snapshot-install-recreate-fixture.js
// states the fixture seams).
//
//  W-established  the control: an ACTIVE follower that fell behind the
//                 leader's compaction installs, is recreated and catches up.
//  W-new          a NEW replica is created through the handler's CREATE path
//                 (its row PENDING -> CREATING -> SYNCING) on a partition
//                 whose leader compacted past its start: the leader offers a
//                 snapshot, the learner installs, IS RECREATED and running,
//                 catches up, and its row reaches ACTIVE.
//  W-new-late     the same create, its wait outliving the install: it
//                 continues with the replacement (release, then ACTIVE).
//  W-new-failed   a create failing after the install fences the replacement.
//  W-offer-*      an offer the node's lifecycle does not admit is refused
//                 before anything is received: the replica is untouched and
//                 running, and the leader's record names the refusal.
//  W-recreate-*   after the shutdown the replica's return is the handler's
//                 obligation: retried on its bound, visible, held for the
//                 removal owner, claimed by the handler's stop. (A REMOVE
//                 through the real request path, the claims and the fence:
//                 partition-snapshot-install-episode.test.js.)
//  W-installing   an offer for a replica stopped for an install is answered
//                 "installing", never "not found".

import assert from 'node:assert/strict';
import {test} from 'node:test';

import {
  REPLICA_RECREATE_ADMISSION_REASON,
  REPLICA_RECREATE_ATTEMPT,
  REPLICA_RECREATE_RETRY_BOUND_MS,
  REPLICA_SNAPSHOT_INSTALL_CLAIM,
  REPLICA_SNAPSHOT_INSTALL_HOLD,
  REPLICA_SNAPSHOT_INSTALL_STATE,
} from '../../../src/node/replica-snapshot-install-constants.js';
import {
  RAFT_SNAPSHOT_CATCHUP_DISPATCH_OUTCOME,
  RAFT_SNAPSHOT_CATCHUP_INSTALL_OUTCOME,
} from '../../../src/raft/snapshot-catchup-constants.js';
import {RAFT_SNAPSHOT_OFFER_RECEIVER} from
  '../../../src/raft/snapshot-offer-router.js';
import {
  RAFT_SNAPSHOT_TRANSFER_ABORT_REASON,
} from '../../../src/raft/snapshot-transfer-constants.js';
import {
  ReplicaOperationResponseStatus,
} from '../../../src/rebalancer/replica-operation-constants.js';
import {PARTICIPANT_RELEASE_TRIGGER} from
  '../../../src/partition/partition-participant-transaction-cutover-constants.js';
import {ReplicaStatus} from '../../../src/rebalancer/replica-status.js';
import {
  CADENCE_ENTRY_THRESHOLD,
  PARTITION_ID,
  committedAddRequest,
  cutOff,
  durableStatus,
  enterRowState,
  faultNextOpen,
  holdNextOpen,
  reaskAfter,
  recreationOf,
  rowStatesOf,
  targetService,
  userRows,
  waitFor,
  withInstallWorld,
  writeAndCompact,
} from './snapshot-install-recreate-fixture.js';

const ROWS = CADENCE_ENTRY_THRESHOLD;
const SCENARIO = Object.freeze({timeout: 120000});

function served(world) {
  return world.dispatches.filter((dispatch) => dispatch?.outcome ===
    RAFT_SNAPSHOT_CATCHUP_DISPATCH_OUTCOME.SERVED).length;
}

// The replica the node's handler holds is a running service that holds the
// leader's rows and has applied the leader's last index.
async function convergesOnLeader(world, replicaId, label) {
  await waitFor(() => {
    const current = targetService(world, replicaId);
    return current !== null && current.isShutdown !== true &&
      current.raft?.readStatus?.().appliedIndex ===
        world.leader.raft.readStatus().appliedIndex;
  }, `${label}: the replica the handler holds runs and applied the leader's ` +
    'last index');
  assert.deepEqual(userRows(targetService(world, replicaId)),
    userRows(world.leader), `${label}: its rows equal the leader's`);
}

test('W-established: an ACTIVE follower behind the leader\'s compaction ' +
  'installs the snapshot, is recreated by the node\'s handler and catches up',
SCENARIO, async () => {
  await withInstallWorld({establishedOnTarget: true}, async (world) => {
    const replicaId = world.third.replicaId;
    const reconnect = cutOff(world, world.third);
    await writeAndCompact(world, 1, ROWS);
    reconnect();
    await waitFor(() => world.created.length === 1,
      'the handler recreated the follower through the node\'s factory')
      .catch((error) => assert.fail(`${error.message}: dispatches ` +
        `${JSON.stringify(world.dispatches)}, install ${JSON.stringify(
          world.third.getSnapshotCatchupDiagnostics().install)}`));
    await convergesOnLeader(world, replicaId, 'established');
    assert.notEqual(targetService(world, replicaId), world.third,
      'the handler holds the replacement, not the service that was shut down');
    assert.equal(world.third.isShutdown, true);
    assert.equal(served(world), 1, 'one snapshot was served');
    assert.equal(durableStatus(world, replicaId), ReplicaStatus.ACTIVE);
    assert.equal(world.handler.localReplicas.get(replicaId).service,
      targetService(world, replicaId), 'the tracked metadata swapped too');
  });
});

const NEW_REPLICA_ID = `${PARTITION_ID}-r4`;

// The handler's CREATE of a new replica on the target node, until it settles.
async function createNewReplica(world) {
  const {request} = await committedAddRequest(world, NEW_REPLICA_ID);
  const settled = new Promise((resolve) => {
    world.handler.once('replicaCreated', () => resolve({created: true}));
    world.handler.once('replicaCreationFailed', (event) =>
      resolve({created: false, error: String(event?.error)}));
  });
  const response = await world.handler.handleCreateReplica(request);
  assert.equal(response.status, ReplicaOperationResponseStatus.INITIATED,
    `the create was admitted: ${JSON.stringify(response)}`);
  return settled;
}

// A new replica created through the handler's CREATE path on a partition
// whose leader compacted past its start; `arrange` places the scenario's
// fault before the create is dispatched.
async function createsBehindCompaction(arrange = () => {}) {
  await withInstallWorld({establishedOnTarget: false}, async (world) => {
    await writeAndCompact(world, 1, ROWS);
    const replicaId = NEW_REPLICA_ID;
    arrange(world);
    const outcome = await createNewReplica(world);
    assert.deepEqual(outcome, {created: true},
      `the create completed; row states ${JSON.stringify(rowStatesOf(world, replicaId))}, ` +
      `dispatches ${JSON.stringify(world.dispatches)}, ` +
      `install ${JSON.stringify(world.created.map((service) =>
        service.getSnapshotCatchupDiagnostics().install))}`);
    assert.equal(served(world), 1, 'the leader served one snapshot');
    assert.equal(world.created.length, 2,
      'the factory built the created replica and its replacement');
    assert.deepEqual(rowStatesOf(world, replicaId), [ReplicaStatus.PENDING,
      ReplicaStatus.CREATING, ReplicaStatus.SYNCING, ReplicaStatus.ACTIVE],
    'the row went PENDING -> CREATING -> SYNCING -> ACTIVE');
    assert.equal(durableStatus(world, replicaId), ReplicaStatus.ACTIVE);
    await convergesOnLeader(world, replicaId, 'new');
    const leaderVoters = world.leader.raft.readStatus().confState.voters;
    assert.equal(leaderVoters.length, 4, 'the new replica is a committed voter');
    assert.deepEqual(world.releaseTriggers.filter((trigger) =>
      trigger === PARTICIPANT_RELEASE_TRIGGER.FRESH_CREATE).length > 0, true,
    'the create ran its own participant release before it published ACTIVE');
  });
}

test('W-new: a replica created through the handler\'s CREATE path on a ' +
  'partition whose leader compacted past its start installs the snapshot, ' +
  'is recreated, catches up and its row reaches ACTIVE', SCENARIO,
() => createsBehindCompaction());

test('W-new-late: a create whose wait outlives the install continues with ' +
  'the service that runs in place of the one it opened', SCENARIO,
() => createsBehindCompaction((world) => {
  // The leader admits the replica; its answer reaches the create only after
  // the install replaced the service the create opened.
  world.admissionAnswerGate = () => waitFor(() => world.created.length === 2,
    'the install recreated the replica while the create waited');
}));

const SHORT_CREATE_DEADLINE_MS = 3000;

test('W-new-failed: a create that fails after an install replaced its ' +
  'service fences the service that runs, not the one it opened',
SCENARIO, async () => {
  await withInstallWorld({establishedOnTarget: false,
    syncTimeoutMs: SHORT_CREATE_DEADLINE_MS}, async (world) => {
    await writeAndCompact(world, 1, ROWS);
    // The create's release request is lost on the network, and only after
    // the install replaced the service the create opened: the create fails
    // at its own deadline holding a replaced service.
    world.releaseRequestGate = async (request) => {
      if (request.trigger !== PARTICIPANT_RELEASE_TRIGGER.FRESH_CREATE) return;
      await waitFor(() => world.created.length === 2,
        'the install recreated the replica while the create waited');
      throw new Error('the release request was lost');
    };
    const outcome = await createNewReplica(world);
    assert.equal(outcome.created, false, JSON.stringify(outcome));
    assert.match(outcome.error, /participant release failed/u);
    assert.equal(durableStatus(world, NEW_REPLICA_ID), ReplicaStatus.FAILED);
    assert.deepEqual(world.created.map((service) => service.isShutdown),
      [true, true], 'the replacement the install opened is fenced too');
    assert.equal(targetService(world, NEW_REPLICA_ID), null,
      'and the handler holds no service of the failed create');
  });
});

// An established follower cut off while the leader writes and compacts; the
// scenario runs with the follower about to be reconnected.
async function withFollowerBehindCompaction(fn) {
  await withInstallWorld({establishedOnTarget: true}, async (world) => {
    const reconnect = cutOff(world, world.third);
    await writeAndCompact(world, 1, ROWS);
    await fn(world, world.third.replicaId, reconnect);
  });
}

function dispatchFacts(world) {
  return world.dispatches.map((dispatch) => ({outcome: dispatch.outcome,
    reason: dispatch.transfer?.reason ?? null}));
}

function abortedWith(reason) {
  return {outcome: RAFT_SNAPSHOT_CATCHUP_DISPATCH_OUTCOME.TRANSFER_ABORTED, reason};
}

const SERVED_FACT = Object.freeze({
  outcome: RAFT_SNAPSHOT_CATCHUP_DISPATCH_OUTCOME.SERVED, reason: null});
const REASK_BOUND_MS = 30001;
const SERVED_REASK_BOUND_MS = 300001;

function assertUntouched(world, replicaId, reason) {
  assert.equal(targetService(world, replicaId), world.third,
    'the handler still holds the same service object');
  assert.equal(world.third.isShutdown, false, 'which was not shut down');
  assert.equal(world.created.length, 0, 'and nothing was opened in its place');
  assert.equal(recreationOf(world, replicaId), null,
    'no recreation record was taken');
  assert.deepEqual(dispatchFacts(world), [abortedWith(
    RAFT_SNAPSHOT_TRANSFER_ABORT_REASON.RECEIVER_NOT_ADMITTED)],
  'the leader\'s dispatch was aborted before anything was served');
  const install = world.third.getSnapshotCatchupDiagnostics().install;
  assert.deepEqual({outcome: install.outcome, reason: install.reason}, {
    outcome: RAFT_SNAPSHOT_CATCHUP_INSTALL_OUTCOME.RECREATE_NOT_ADMITTED, reason},
  'the replica\'s own diagnostics name the refusal');
}

test('W-offer-unobservable: an offer while the lifecycle row is unobservable ' +
  'is refused with the replica untouched, and the leader\'s re-ask installs ' +
  'once the row is observable', SCENARIO, async () => {
  await withFollowerBehindCompaction(async (world, replicaId, reconnect) => {
    world.store.setAuthoritativeReadAvailable(false);
    reconnect();
    await waitFor(() => world.dispatches.length === 1, 'the offer is answered');
    assertUntouched(world, replicaId,
      REPLICA_RECREATE_ADMISSION_REASON.ROW_UNOBSERVABLE);
    world.store.setAuthoritativeReadAvailable(true);
    await reaskAfter(world, REASK_BOUND_MS);
    await waitFor(() => world.created.length === 1,
      'the re-asked offer is installed and the replica recreated');
    await convergesOnLeader(world, replicaId, 'unobservable');
    assert.deepEqual(dispatchFacts(world), [abortedWith(
      RAFT_SNAPSHOT_TRANSFER_ABORT_REASON.RECEIVER_NOT_ADMITTED), SERVED_FACT]);
  });
});

test('W-offer-removing: an offer for a replica whose row is REMOVING is ' +
  'refused: the removal owner has the replica, and it is not stopped',
SCENARIO, async () => {
  await withFollowerBehindCompaction(async (world, replicaId, reconnect) => {
    await enterRowState(world, replicaId, ReplicaStatus.REMOVING);
    reconnect();
    await waitFor(() => world.dispatches.length === 1, 'the offer is answered');
    assertUntouched(world, replicaId,
      REPLICA_RECREATE_ADMISSION_REASON.ROW_REMOVAL_IN_PROGRESS);
  });
});

test('W-recreate-owned: a recreate that throws, then finds the lifecycle ' +
  'unobservable, stays the handler\'s obligation: visible, retried on its ' +
  'bound, and the replica returns', SCENARIO, async () => {
  await withFollowerBehindCompaction(async (world, replicaId, reconnect) => {
    faultNextOpen(world, replicaId, async () => {
      world.store.setAuthoritativeReadAvailable(false);
      throw new Error('the factory could not open the replica');
    });
    const startedAt = Date.now();
    reconnect();
    await waitFor(() => recreationOf(world, replicaId)?.attempts === 2,
      'the second attempt ran on the retry bound');
    assert.ok(Date.now() - startedAt >= REPLICA_RECREATE_RETRY_BOUND_MS,
      'not before the declared bound');
    const pending = recreationOf(world, replicaId);
    assert.deepEqual({state: pending.state, lastAttempt: pending.lastAttempt,
      lastReason: pending.lastReason}, {
      state: REPLICA_SNAPSHOT_INSTALL_STATE.RECREATE_PENDING,
      lastAttempt: REPLICA_RECREATE_ATTEMPT.ADMISSION_HELD,
      lastReason: REPLICA_RECREATE_ADMISSION_REASON.ROW_UNOBSERVABLE},
    'the pending recreation is visible with its typed reason');
    assert.deepEqual(world.handler.getStats().snapshotInstalls, [pending],
      'in the handler\'s own statistics');
    assert.equal(world.third.isShutdown, true, 'the stopped replica is down');
    assert.equal(world.created.length, 0);
    assert.deepEqual(
      world.third.getSnapshotCatchupDiagnostics().install.recreation,
      {state: 'pending', attempt: REPLICA_RECREATE_ATTEMPT.CREATE_THREW,
        reason: 'the factory could not open the replica'},
      'the install outcome names the first attempt');
    world.store.setAuthoritativeReadAvailable(true);
    await waitFor(() => world.created.length === 1,
      'the third attempt recreates the replica');
    await convergesOnLeader(world, replicaId, 'owned');
    const ended = recreationOf(world, replicaId);
    assert.deepEqual({state: ended.state, attempts: ended.attempts,
      lastAttempt: ended.lastAttempt}, {
      state: REPLICA_SNAPSHOT_INSTALL_STATE.RUNNING, attempts: 3,
      lastAttempt: REPLICA_RECREATE_ATTEMPT.RECREATED});
    assert.deepEqual(dispatchFacts(world), [SERVED_FACT],
      'one snapshot was served: the leader was not asked again');
  });
});

test('W-recreate-held: a replica whose row turns REMOVING while its ' +
  'recreate is pending is held for the removal owner: stopped, still ' +
  'registered, still under its episode, never reopened', SCENARIO, async () => {
  await withFollowerBehindCompaction(async (world, replicaId, reconnect) => {
    faultNextOpen(world, replicaId, async () => {
      await enterRowState(world, replicaId, ReplicaStatus.REMOVING);
      throw new Error('the factory could not open the replica');
    });
    reconnect();
    await waitFor(() => recreationOf(world, replicaId)?.hold ===
      REPLICA_SNAPSHOT_INSTALL_HOLD.AWAITING_REMOVAL_OWNER,
    'the second attempt holds the replica for its removal owner');
    const held = recreationOf(world, replicaId);
    assert.deepEqual({state: held.state, attempts: held.attempts,
      lastAttempt: held.lastAttempt, lastReason: held.lastReason}, {
      state: REPLICA_SNAPSHOT_INSTALL_STATE.RECREATE_PENDING,
      attempts: 2, lastAttempt: REPLICA_RECREATE_ATTEMPT.ADMISSION_REFUSED,
      lastReason: REPLICA_RECREATE_ADMISSION_REASON.ROW_REMOVAL_IN_PROGRESS});
    assert.equal(targetService(world, replicaId), world.third,
      'the handler still holds the stopped service for the removal owner');
    assert.equal(world.third.isShutdown, true);
    assert.equal(world.created.length, 0, 'it was not reopened');
    assert.equal(world.handler.snapshotInstallOwner.resolveReceiver(PARTITION_ID)
      .state, RAFT_SNAPSHOT_OFFER_RECEIVER.INSTALLING,
    'a held replica is still installing: no second offer is taken');
  });
});

test('W-installing: an offer for a replica stopped for an install is ' +
  'answered installing, and the replica returns from its own install',
SCENARIO, async () => {
  await withFollowerBehindCompaction(async (world, replicaId, reconnect) => {
    const held = holdNextOpen(world, replicaId);
    reconnect();
    await held.reached;
    // The open is released whatever is asserted, so a failure is reported.
    try {
      assert.equal(world.handler.snapshotInstallOwner.resolveReceiver(PARTITION_ID)
        .state, RAFT_SNAPSHOT_OFFER_RECEIVER.INSTALLING);
      await waitFor(() => world.leader.getSnapshotCatchupDiagnostics().catchup
        .followers.every((follower) => !follower.inFlight) &&
        world.dispatches.length === 1, 'the leader\'s first dispatch settled');
      await reaskAfter(world, SERVED_REASK_BOUND_MS);
      await waitFor(() => world.dispatches.length === 2,
        'the leader\'s second offer is answered');
      assert.deepEqual(dispatchFacts(world), [SERVED_FACT, abortedWith(
        RAFT_SNAPSHOT_TRANSFER_ABORT_REASON.REPLICA_INSTALLING)]);
      assert.equal(world.created.length, 0, 'the second offer opened nothing');
    } finally {
      held.open();
    }
    await waitFor(() => world.created.length === 1, 'the replica is recreated');
    await convergesOnLeader(world, replicaId, 'installing');
    assert.equal(recreationOf(world, replicaId).attempts, 1);
  });
});

test('W-recreate-stop: a handler that stops while a recreate is opening ' +
  'ends the record and releases what was opened', SCENARIO, async () => {
  await withFollowerBehindCompaction(async (world, replicaId, reconnect) => {
    const held = holdNextOpen(world, replicaId);
    reconnect();
    await held.reached;
    const stopping = world.handler.shutdown();
    held.open();
    await stopping;
    const record = recreationOf(world, replicaId);
    assert.deepEqual({state: record.state, claim: record.claim,
      lastAttempt: record.lastAttempt}, {
      state: REPLICA_SNAPSHOT_INSTALL_STATE.CLAIMED,
      claim: REPLICA_SNAPSHOT_INSTALL_CLAIM.HANDLER_STOP,
      lastAttempt: REPLICA_RECREATE_ATTEMPT.EPISODE_CLAIMED});
    assert.deepEqual(world.created.map((service) => service.isShutdown), [true]);
  });
});
