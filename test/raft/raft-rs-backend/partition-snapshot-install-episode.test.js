// Witnesses of the install episode (quest
// partition-checkpoint-epoch-generation, hand-over coverage model, round 5):
// while a replica is under a snapshot-install episode, its registry entry and
// its tracked service are the episode's; another owner takes the replica only
// through a claim, and a hold names who the episode is waiting for. Real
// PartitionServices and the target node's real ReplicaHandler
// (snapshot-install-recreate-fixture.js states the fixture seams).
//
//  E-fence      a direct registry write and a memo service write during an
//               episode are refused typed and counted (choke point).
//  E-remove     cells 6 and 7, S1: a REMOVE accepted while the replacement is
//               opening holds the episode; the removal claims it once
//               REMOVING is durable and acts on the tracked, stopped service
//               after the replacement was closed.
//  E-answer     S1: a removal acts on the service its claim answers (the
//               tracked one), never on the object it captured when it began.
//  E-deferred   cells 8 and 20, C1: a REMOVE accepted through the request
//               path whose REMOVING write is deferred lifts its hold when
//               its task ends; the replica returns, fenced for serving.
//  E-removing   cell 9: a recreation that reads REMOVING with no local
//               removal holds (awaiting_removal_owner); the real REMOVE
//               request clears it.
//  E-failed     cell 10: a recreation that reads FAILED holds
//               (awaiting_cleanup_owner); the row returning ACTIVE clears it.
//  E-stop       cells 15 and 16: a handler that stops before the shutdown
//               step claims the episode; nothing is installed afterwards.

import assert from 'node:assert/strict';
import fs from 'node:fs';
import {test} from 'node:test';

import {
  REPLICA_SNAPSHOT_INSTALL_CLAIM,
  REPLICA_SNAPSHOT_INSTALL_ERROR_CODE,
  REPLICA_SNAPSHOT_INSTALL_HOLD,
  REPLICA_SNAPSHOT_INSTALL_STATE,
} from '../../../src/node/replica-snapshot-install-constants.js';
import {RAFT_SNAPSHOT_OFFER_RECEIVER} from
  '../../../src/raft/snapshot-offer-router.js';
import {
  ReplicaOperationField,
  ReplicaOperationResponseStatus,
} from '../../../src/rebalancer/replica-operation-constants.js';
import {ReplicaStatus} from '../../../src/rebalancer/replica-status.js';
import {
  CADENCE_ENTRY_THRESHOLD,
  PARTITION_ID,
  cutOff,
  durableStatus,
  enterRowState,
  faultNextOpen,
  gateAdmissions,
  holdNextOpen,
  recreationOf,
  targetService,
  userRows,
  waitFor,
  withInstallWorld,
  writeAndCompact,
} from './snapshot-install-recreate-fixture.js';

const ROWS = CADENCE_ENTRY_THRESHOLD;
const SCENARIO = Object.freeze({timeout: 180000});
// Longer than the REMOVING write's own retry budget (about 40 s measured).
const HOLD_LIFT_BOUND_MS = 120000;

async function withFollowerBehindCompaction(fn) {
  await withInstallWorld({establishedOnTarget: true}, async (world) => {
    const reconnect = cutOff(world, world.third);
    await writeAndCompact(world, 1, ROWS);
    await fn(world, world.third.replicaId, reconnect);
  });
}

function removeRequest(replicaId, suffix = '') {
  return {
    [ReplicaOperationField.OPERATION_ID]: `remove-op-${replicaId}${suffix}`,
    [ReplicaOperationField.PARTITION_ID]: PARTITION_ID,
    [ReplicaOperationField.REPLICA_ID]: replicaId,
  };
}

function refusalCodeOf(action) {
  try {
    action();
  } catch (error) {
    return error.code;
  }
  return 'not_refused';
}

async function returnsRunning(world, replicaId) {
  await waitFor(() => {
    const current = targetService(world, replicaId);
    return current !== null && current.isShutdown !== true &&
      current.raft?.readStatus?.().appliedIndex ===
        world.leader.raft.readStatus().appliedIndex;
  }, 'the replica returns and converges');
  assert.deepEqual(userRows(targetService(world, replicaId)),
    userRows(world.leader));
}

test('E-fence: a registry write and a memo service write for a replica under ' +
  'an install episode are refused typed and counted; other memo fields pass',
SCENARIO, async () => {
  await withFollowerBehindCompaction(async (world, replicaId, reconnect) => {
    const held = holdNextOpen(world, replicaId);
    reconnect();
    await held.reached;
    let facts;
    try {
      const {handler} = world;
      const stranger = {replicaId, partitionId: PARTITION_ID, isShutdown: false};
      facts = {
        set: refusalCodeOf(() => handler.localServices.set(replicaId, stranger)),
        delete: refusalCodeOf(() => handler.localServices.delete(replicaId)),
        memoService: refusalCodeOf(() => handler.setLocalReplica(replicaId,
          {service: stranger})),
        memoCleared: refusalCodeOf(() => handler.setLocalReplica(replicaId,
          {service: null})),
        memoStatus: refusalCodeOf(() => handler.setLocalReplica(replicaId,
          {status: ReplicaStatus.ACTIVE})),
        tracked: targetService(world, replicaId) === world.third,
        memo: handler.localReplicas.get(replicaId).service === world.third,
        refusals: handler.localServices.episodeRefusals,
      };
    } finally {
      held.open();
    }
    const code = REPLICA_SNAPSHOT_INSTALL_ERROR_CODE.REPLICA_UNDER_INSTALL_EPISODE;
    assert.deepEqual(facts, {set: code, delete: code, memoService: code,
      memoCleared: code, memoStatus: 'not_refused', tracked: true, memo: true,
      refusals: 4}, JSON.stringify(facts));
    await returnsRunning(world, replicaId);
    assert.equal(world.handler.localServices.episodeRefusals, 4,
      'the episode\'s own registration was not a refusal');
  });
});

test('E-remove: a REMOVE accepted while the replacement is opening holds the ' +
  'episode, claims it once REMOVING is durable, and acts on the tracked ' +
  'stopped service after the replacement was closed', SCENARIO, async () => {
  await withFollowerBehindCompaction(async (world, replicaId, reconnect) => {
    const held = holdNextOpen(world, replicaId);
    reconnect();
    await held.reached;
    const {handler} = world;
    const exits = [];
    const exit = handler.awaitReplicaRemovalConsensusExit.bind(handler);
    handler.awaitReplicaRemovalConsensusExit = (service, context) => {
      exits.push({onOriginal: service === world.third,
        tracked: targetService(world, replicaId) === world.third,
        durable: durableStatus(world, replicaId),
        createdShutdown: world.created.map((created) => created.isShutdown)});
      return exit(service, context);
    };
    let accepted;
    try {
      const response = await handler.handleRemoveReplica(removeRequest(replicaId));
      accepted = {status: response.status,
        hold: recreationOf(world, replicaId).hold,
        state: recreationOf(world, replicaId).state,
        opened: world.created.length};
    } finally {
      held.open();
    }
    await waitFor(() => exits.length === 1,
      'the removal reaches its consensus exit');
    const record = recreationOf(world, replicaId);
    const facts = {accepted, exits, state: record.state, claim: record.claim,
      hold: record.hold, created: world.created.map((s) => s.isShutdown),
      tracked: targetService(world, replicaId) === world.third,
      trackedShutdown: world.third.isShutdown,
      durable: durableStatus(world, replicaId)};
    assert.deepEqual(facts, {
      accepted: {status: ReplicaOperationResponseStatus.INITIATED,
        hold: REPLICA_SNAPSHOT_INSTALL_HOLD.REMOVAL_PENDING,
        state: REPLICA_SNAPSHOT_INSTALL_STATE.RECREATE_PENDING, opened: 0},
      exits: [{onOriginal: true, tracked: true, durable: ReplicaStatus.REMOVING,
        createdShutdown: [true]}],
      state: REPLICA_SNAPSHOT_INSTALL_STATE.CLAIMED,
      claim: REPLICA_SNAPSHOT_INSTALL_CLAIM.REMOVAL,
      hold: REPLICA_SNAPSHOT_INSTALL_HOLD.NONE, created: [true], tracked: true,
      trackedShutdown: true, durable: ReplicaStatus.REMOVING},
    JSON.stringify(facts));
  });
});

test('E-answer: a removal acts on the service its claim answers, not on the ' +
  'object it captured before a recreation replaced it', SCENARIO, async () => {
  await withFollowerBehindCompaction(async (world, replicaId, reconnect) => {
    const held = holdNextOpen(world, replicaId);
    reconnect();
    await held.reached;
    const {handler} = world;
    // The removal's own task, started without the request path's hold and
    // paused after it captured the tracked (stopped) service, before its
    // REMOVING write: the recreation completes meanwhile.
    const drainGate = Promise.withResolvers();
    const captured = Promise.withResolvers();
    const drain = handler.waitForReplicaServingDrain.bind(handler);
    handler.waitForReplicaServingDrain = async (service) => {
      captured.resolve(service);
      await drainGate.promise;
      return drain(service);
    };
    const exits = [];
    const exit = handler.awaitReplicaRemovalConsensusExit.bind(handler);
    handler.awaitReplicaRemovalConsensusExit = (service, context) => {
      exits.push(service);
      return exit(service, context);
    };
    const removal = handler.removeReplicaAsync({
      operationId: `remove-op-${replicaId}`, replicaId,
      partitionId: PARTITION_ID}).catch(() => {});
    assert.equal(await captured.promise, world.third,
      'the removal began with the stopped service');
    held.open();
    await waitFor(() => targetService(world, replicaId) === world.created[0],
      'the recreation registered the replacement');
    const replacement = world.created[0];
    drainGate.resolve();
    await waitFor(() => exits.length === 1,
      'the removal reaches its consensus exit');
    assert.equal(durableStatus(world, replicaId), ReplicaStatus.REMOVING);
    assert.equal(exits[0] === replacement, true,
      'the removal acts on the tracked replacement, not the object it captured');
    handler.removalConsensusExitRelease.abort();
    await removal;
  });
});

test('E-deferred: an accepted REMOVE whose REMOVING write is deferred lifts ' +
  'its hold when its task ends: the replica returns, carrying the serving ' +
  'fence the acceptance raised', {timeout: 300000}, async () => {
  await withFollowerBehindCompaction(async (world, replicaId, reconnect) => {
    faultNextOpen(world, replicaId, async () => {
      world.store.setAuthoritativeReadAvailable(false);
      throw new Error('the factory could not open the replica');
    });
    reconnect();
    await waitFor(() => recreationOf(world, replicaId)?.attempts >= 2,
      'the recreation is pending behind an unobservable lifecycle');
    const {handler} = world;
    const response = await handler.handleRemoveReplica(removeRequest(replicaId));
    const accepted = {status: response.status,
      hold: recreationOf(world, replicaId).hold,
      held: recreationOf(world, replicaId).removalOperations};
    assert.deepEqual(accepted, {
      status: ReplicaOperationResponseStatus.INITIATED,
      hold: REPLICA_SNAPSHOT_INSTALL_HOLD.REMOVAL_PENDING, held: 1},
    JSON.stringify(response));
    // The control plane stays unavailable for the whole REMOVING write: the
    // removal defers. Nothing is opened while it holds the episode.
    const attemptsWhenHeld = recreationOf(world, replicaId).attempts;
    const liftDeadline = Date.now() + HOLD_LIFT_BOUND_MS;
    for (;;) {
      const record = recreationOf(world, replicaId);
      if (record.removalOperations === 0) break;
      assert.equal(world.created.length, 0, 'nothing is opened under the hold');
      assert.ok(Date.now() < liftDeadline,
        `the deferred removal lifted its hold: ${JSON.stringify(record)}`);
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
    const lifted = {durable: durableStatus(world, replicaId),
      state: recreationOf(world, replicaId).state,
      claim: recreationOf(world, replicaId).claim,
      removing: handler.hasInProgressReplicaRemoval(replicaId)};
    assert.deepEqual(lifted, {durable: ReplicaStatus.ACTIVE,
      state: REPLICA_SNAPSHOT_INSTALL_STATE.RECREATE_PENDING,
      claim: REPLICA_SNAPSHOT_INSTALL_CLAIM.NONE, removing: false},
    'the deferred removal claimed nothing and lifted its hold');
    assert.ok(recreationOf(world, replicaId).attempts > attemptsWhenHeld,
      'the lifted hold asked the recreation again');
    world.store.setAuthoritativeReadAvailable(true);
    await returnsRunning(world, replicaId);
    assert.equal(targetService(world, replicaId).removalServingAdmissionFenced,
      true, 'the replacement carries the irreversible serving fence');
    assert.equal(recreationOf(world, replicaId).state,
      REPLICA_SNAPSHOT_INSTALL_STATE.RUNNING);
  });
});

test('E-removing: a recreation that reads REMOVING with no local removal ' +
  'holds for the removal owner, answers offers installing, and the real ' +
  'REMOVE request claims it', SCENARIO, async () => {
  await withFollowerBehindCompaction(async (world, replicaId, reconnect) => {
    // An earlier removal of this node made REMOVING durable and ended (its
    // outcome unknown to the coordinator): the row is REMOVING through the
    // node's own lifecycle owner, and no removal task runs.
    faultNextOpen(world, replicaId, async () => {
      await world.handler.persistReplicaStatusWithRetry(replicaId,
        ReplicaStatus.REMOVING, {partitionId: PARTITION_ID});
      throw new Error('the factory could not open the replica');
    });
    reconnect();
    await waitFor(() => recreationOf(world, replicaId)?.attempts >= 2,
      'the second attempt read the REMOVING row');
    assert.equal(world.handler.hasInProgressReplicaRemoval(replicaId), false);
    const held = recreationOf(world, replicaId);
    const before = {state: held.state, hold: held.hold,
      receiver: world.handler.snapshotInstallOwner.resolveReceiver(PARTITION_ID)
        .state, opened: world.created.length,
      tracked: targetService(world, replicaId) === world.third};
    assert.deepEqual(before, {
      state: REPLICA_SNAPSHOT_INSTALL_STATE.RECREATE_PENDING,
      hold: REPLICA_SNAPSHOT_INSTALL_HOLD.AWAITING_REMOVAL_OWNER,
      receiver: RAFT_SNAPSHOT_OFFER_RECEIVER.INSTALLING, opened: 0,
      tracked: true}, JSON.stringify(before));
    assert.deepEqual(world.handler.getStats().snapshotInstalls, [held],
      'the hold is visible in the handler\'s statistics');
    // The hold's production clearing actor: the REMOVE re-dispatch.
    const response = await world.handler.handleRemoveReplica(
      removeRequest(replicaId));
    assert.ok([ReplicaOperationResponseStatus.INITIATED,
      ReplicaOperationResponseStatus.IN_PROGRESS].includes(response.status),
    JSON.stringify(response));
    await waitFor(() => recreationOf(world, replicaId).state ===
      REPLICA_SNAPSHOT_INSTALL_STATE.CLAIMED, 'the removal claimed the episode');
    assert.equal(recreationOf(world, replicaId).claim,
      REPLICA_SNAPSHOT_INSTALL_CLAIM.REMOVAL);
    assert.equal(world.created.length, 0, 'nothing was reopened');
  });
});

test('E-failed: a recreation that reads FAILED holds for the cleanup owner, ' +
  'visible, and the row returning ACTIVE brings the replica back', SCENARIO,
async () => {
  await withFollowerBehindCompaction(async (world, replicaId, reconnect) => {
    faultNextOpen(world, replicaId, async () => {
      await enterRowState(world, replicaId, ReplicaStatus.FAILED);
      throw new Error('the factory could not open the replica');
    });
    reconnect();
    await waitFor(() => recreationOf(world, replicaId)?.attempts >= 2,
      'the second attempt read the FAILED row');
    const held = recreationOf(world, replicaId);
    assert.deepEqual({state: held.state, hold: held.hold,
      opened: world.created.length}, {
      state: REPLICA_SNAPSHOT_INSTALL_STATE.RECREATE_PENDING,
      hold: REPLICA_SNAPSHOT_INSTALL_HOLD.AWAITING_CLEANUP_OWNER, opened: 0},
    JSON.stringify(held));
    await enterRowState(world, replicaId, ReplicaStatus.ACTIVE);
    await returnsRunning(world, replicaId);
    const ended = recreationOf(world, replicaId);
    assert.deepEqual({state: ended.state, hold: ended.hold}, {
      state: REPLICA_SNAPSHOT_INSTALL_STATE.RUNNING,
      hold: REPLICA_SNAPSHOT_INSTALL_HOLD.NONE});
  });
});

test('E-stop: a handler that stops while an install is before its shutdown ' +
  'step claims the episode: nothing is installed after the stop', SCENARIO,
async () => {
  await withFollowerBehindCompaction(async (world, replicaId, reconnect) => {
    const gates = gateAdmissions(world);
    reconnect();
    await waitFor(() => gates.length === 1, 'the offer is routed');
    await gates[0].reached;
    const dbPath = world.third.dbPath;
    const inodeBefore = fs.statSync(dbPath).ino;
    const stopping = world.handler.shutdown();
    gates[0].open();
    await stopping;
    await waitFor(() => gates[0].admission !== null,
      'the pre-shutdown admission answered');
    await new Promise((resolve) => setTimeout(resolve, 500));
    const record = recreationOf(world, replicaId);
    const facts = {admitted: gates[0].admission.admitted,
      inodeSame: fs.statSync(dbPath).ino === inodeBefore,
      opened: world.created.length, state: record?.state ?? null,
      claim: record?.claim ?? null};
    assert.deepEqual(facts, {admitted: false, inodeSame: true, opened: 0,
      state: REPLICA_SNAPSHOT_INSTALL_STATE.CLAIMED,
      claim: REPLICA_SNAPSHOT_INSTALL_CLAIM.HANDLER_STOP}, JSON.stringify(facts));
  });
});
