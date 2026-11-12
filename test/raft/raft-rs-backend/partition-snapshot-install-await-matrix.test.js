// The await-point matrix of the install episode (quest
// partition-checkpoint-epoch-generation, hand-over coverage model section 10):
// a REMOVE that is accepted, and a REMOVE whose REMOVING row becomes durable,
// while the episode is suspended at exactly one of its awaits:
//   A1  the offer admission's lifecycle read (the episode is already taken)
//   R1  the recreation attempt's release of the previous service
//   R2  the recreation attempt's lifecycle read
// Real PartitionServices and the target node's real ReplicaHandler; the REMOVE
// arrives through the handler's request path. Fixture gates: one lifecycle
// read held at the control plane, one service shutdown held, and the
// removal's serving drain held (it precedes the REMOVING write, so a held
// drain is "accepted, not durable").

import assert from 'node:assert/strict';
import fs from 'node:fs';
import {test} from 'node:test';

import {
  REPLICA_RECREATE_ATTEMPT,
  REPLICA_SNAPSHOT_INSTALL_CLAIM,
  REPLICA_SNAPSHOT_INSTALL_HOLD,
  REPLICA_SNAPSHOT_INSTALL_STATE,
  REPLICA_SNAPSHOT_INSTALL_WAIT,
} from '../../../src/node/replica-snapshot-install-constants.js';
import {RAFT_SNAPSHOT_CATCHUP_DISPATCH_OUTCOME} from
  '../../../src/raft/snapshot-catchup-constants.js';
import {RAFT_SNAPSHOT_TRANSFER_ABORT_REASON} from
  '../../../src/raft/snapshot-transfer-constants.js';
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
  holdCall,
  holdLifecycleRead,
  recreationOf,
  targetService,
  waitFor,
  withInstallWorld,
  writeAndCompact,
} from './snapshot-install-recreate-fixture.js';

const SCENARIO = Object.freeze({timeout: 180000});
const STATE = REPLICA_SNAPSHOT_INSTALL_STATE;
const NO_RECORD = 'no_record';

function removeRequest(replicaId) {
  return {
    [ReplicaOperationField.OPERATION_ID]: `remove-op-${replicaId}`,
    [ReplicaOperationField.PARTITION_ID]: PARTITION_ID,
    [ReplicaOperationField.REPLICA_ID]: replicaId,
  };
}

const stateOf = (world, replicaId) =>
  recreationOf(world, replicaId)?.state ?? NO_RECORD;

// The episode's awaits, each held by a fixture gate armed before the offer.
const AWAIT_POINTS = Object.freeze({
  A1: {
    hold: (world, replicaId) => holdLifecycleRead(world, replicaId,
      () => stateOf(world, replicaId) === STATE.RECEIVING),
    reachedIn: {state: STATE.RECEIVING, attempts: 0, stopped: false},
  },
  R1: {
    hold: (world, replicaId) => holdCall(world.third, 'shutdown',
      () => stateOf(world, replicaId) === STATE.RECREATE_PENDING),
    reachedIn: {state: STATE.RECREATE_PENDING, attempts: 1, stopped: true},
  },
  R2: {
    hold: (world, replicaId) => holdLifecycleRead(world, replicaId,
      () => stateOf(world, replicaId) === STATE.RECREATE_PENDING),
    reachedIn: {state: STATE.RECREATE_PENDING, attempts: 1, stopped: true},
  },
});

// A follower behind the leader's compaction is reconnected with the await
// point's gate armed; the scenario runs with the episode suspended there.
async function suspendedAt(point, fn) {
  await withInstallWorld({establishedOnTarget: true}, async (world) => {
    const replicaId = world.third.replicaId;
    const reconnect = cutOff(world, world.third);
    await writeAndCompact(world, 1, CADENCE_ENTRY_THRESHOLD);
    const inodeBefore = fs.statSync(world.third.dbPath).ino;
    const held = AWAIT_POINTS[point].hold(world, replicaId);
    reconnect();
    await held.reached;
    const record = recreationOf(world, replicaId);
    assert.deepEqual({state: record.state, attempts: record.attempts,
      stopped: world.third.isShutdown === true, opened: world.created.length},
    {...AWAIT_POINTS[point].reachedIn, opened: 0},
    `the episode is suspended at ${point}`);
    // What the removal acts on, observed where it leaves the consensus group.
    const {handler} = world;
    const exits = [];
    const exit = handler.awaitReplicaRemovalConsensusExit.bind(handler);
    handler.awaitReplicaRemovalConsensusExit = (service, context) => {
      exits.push({onTracked: service === world.third &&
        targetService(world, replicaId) === world.third,
      durable: durableStatus(world, replicaId), opened: world.created.length});
      return exit(service, context);
    };
    try {
      await fn({world, replicaId, held, exits,
        installed: () => fs.statSync(world.third.dbPath).ino !== inodeBefore});
    } catch (error) {
      console.error('DEBUG-MATRIX', point, error.message, JSON.stringify({record: recreationOf(world, replicaId), exits, dispatches: world.dispatches.map((d) => [d.outcome, d.transfer?.reason])}));
      throw error;
    } finally {
      held.open();
      console.error('DEBUG-MATRIX leaving', point);
    }
  });
}

// The leader's dispatch of the offer, once it settled.
async function offerAnswer(world) {
  await waitFor(() => world.dispatches.length >= 1, 'the offer settled');
  const [dispatch] = world.dispatches;
  return {outcome: dispatch.outcome, reason: dispatch.transfer?.reason ?? null};
}

const NOT_ADMITTED = Object.freeze({
  outcome: RAFT_SNAPSHOT_CATCHUP_DISPATCH_OUTCOME.TRANSFER_ABORTED,
  reason: RAFT_SNAPSHOT_TRANSFER_ABORT_REASON.RECEIVER_NOT_ADMITTED});

test('A1 x REMOVE accepted: the offer is refused not admitted, nothing is ' +
  'received, no episode remains and the removal is an ordinary removal',
SCENARIO, () => suspendedAt('A1', async ({world, replicaId, held, exits,
  installed}) => {
  const drain = holdCall(world.handler, 'waitForReplicaServingDrain', () => true);
  const response = await world.handler.handleRemoveReplica(removeRequest(replicaId));
  await drain.reached;
  const accepted = {status: response.status,
    held: recreationOf(world, replicaId).removalOperations,
    hold: recreationOf(world, replicaId).hold,
    durable: durableStatus(world, replicaId)};
  held.open();
  const answer = await offerAnswer(world);
  const refused = {record: stateOf(world, replicaId),
    running: world.third.isShutdown !== true, installed: installed(),
    opened: world.created.length, exits: exits.length};
  drain.open();
  await waitFor(() => exits.length === 1, 'the removal reaches its consensus exit');
  assert.deepEqual({accepted, answer, refused, exits}, {
    accepted: {status: ReplicaOperationResponseStatus.INITIATED, held: 1,
      hold: REPLICA_SNAPSHOT_INSTALL_HOLD.REMOVAL_PENDING,
      durable: ReplicaStatus.ACTIVE},
    answer: NOT_ADMITTED,
    refused: {record: NO_RECORD, running: true, installed: false, opened: 0,
      exits: 0},
    exits: [{onTracked: true, durable: ReplicaStatus.REMOVING, opened: 0}]});
}));

// The REMOVING write of a removal on this node reads the replica's lifecycle
// row first, and that read coalesces with the one the episode is waiting for
// (one in-flight authoritative read per replica): REMOVING cannot become
// durable from this node while the A1 or the R2 read is pending. When the
// read answers, the accepted removal's hold is what the episode sees.
async function removingWaitsForTheRead(world, replicaId, exits) {
  const response = await world.handler.handleRemoveReplica(removeRequest(replicaId));
  await new Promise((resolve) => setTimeout(resolve, 1000));
  const record = recreationOf(world, replicaId);
  return {status: response.status, durable: durableStatus(world, replicaId),
    claim: record.claim, held: record.removalOperations, exits: exits.length};
}

const WRITE_PENDING = Object.freeze({
  status: ReplicaOperationResponseStatus.INITIATED,
  durable: ReplicaStatus.ACTIVE, claim: REPLICA_SNAPSHOT_INSTALL_CLAIM.NONE,
  held: 1, exits: 0});

test('A1 x REMOVING durable: the REMOVING write waits for the same lifecycle ' +
  'read; when it answers the offer is refused by the hold, nothing is ' +
  'received, and the removal continues as an ordinary removal',
SCENARIO, () => suspendedAt('A1', async ({world, replicaId, held, exits,
  installed}) => {
  const pending = await removingWaitsForTheRead(world, replicaId, exits);
  held.open();
  const answer = await offerAnswer(world);
  const refused = {record: stateOf(world, replicaId), installed: installed(),
    opened: world.created.length};
  await waitFor(() => exits.length === 1, 'the removal reaches its consensus exit');
  assert.deepEqual({pending, answer, refused, exits}, {
    pending: WRITE_PENDING, answer: NOT_ADMITTED,
    refused: {record: NO_RECORD, installed: false, opened: 0},
    exits: [{onTracked: true, durable: ReplicaStatus.REMOVING, opened: 0}]});
}));

for (const point of ['R1', 'R2']) {
  test(`${point} x REMOVE accepted: the attempt ends held for the removal ` +
    'and opens nothing; the removal then claims the stopped replica',
  SCENARIO, () => suspendedAt(point, async ({world, replicaId, held, exits}) => {
    const drain = holdCall(world.handler, 'waitForReplicaServingDrain', () => true);
    const response = await world.handler.handleRemoveReplica(removeRequest(replicaId));
    await drain.reached;
    held.open();
    await waitFor(() => recreationOf(world, replicaId).lastAttempt ===
      REPLICA_RECREATE_ATTEMPT.HELD_FOR_REMOVAL, 'the attempt ended in the hold');
    const record = recreationOf(world, replicaId);
    const heldFacts = {status: response.status, state: record.state,
      hold: record.hold, attempts: record.attempts,
      durable: durableStatus(world, replicaId), opened: world.created.length,
      tracked: targetService(world, replicaId) === world.third,
      exits: exits.length};
    drain.open();
    await waitFor(() => exits.length === 1,
      'the removal reaches its consensus exit');
    const after = recreationOf(world, replicaId);
    assert.deepEqual({heldFacts, exits, state: after.state, claim: after.claim,
      attempts: after.attempts}, {
      heldFacts: {status: ReplicaOperationResponseStatus.INITIATED,
        state: STATE.RECREATE_PENDING,
        hold: REPLICA_SNAPSHOT_INSTALL_HOLD.REMOVAL_PENDING, attempts: 1,
        durable: ReplicaStatus.ACTIVE, opened: 0, tracked: true, exits: 0},
      exits: [{onTracked: true, durable: ReplicaStatus.REMOVING, opened: 0}],
      state: STATE.CLAIMED, claim: REPLICA_SNAPSHOT_INSTALL_CLAIM.REMOVAL,
      attempts: 1});
  }));
}

const POINT = 'R1';

test(`${POINT} x REMOVING durable: the removal claims the episode, waits ` +
  'for the attempt in flight, and the attempt opens nothing',
SCENARIO, () => suspendedAt(POINT, async ({world, replicaId, held, exits}) => {
  const response = await world.handler.handleRemoveReplica(removeRequest(replicaId));
  await waitFor(() => stateOf(world, replicaId) === STATE.CLAIMED,
    'the durable REMOVING row claimed the episode');
  // The claimant waits for the step in flight: it has not acted yet.
  await new Promise((resolve) => setTimeout(resolve, 300));
  const record = recreationOf(world, replicaId);
  const waiting = {status: response.status, claim: record.claim,
    wait: record.wait, durable: durableStatus(world, replicaId),
    exits: exits.length, opened: world.created.length};
  held.open();
  await waitFor(() => exits.length === 1,
    'the removal reaches its consensus exit');
  const after = recreationOf(world, replicaId);
  assert.deepEqual({waiting, exits, lastAttempt: after.lastAttempt,
    wait: after.wait, attempts: after.attempts}, {
    waiting: {status: ReplicaOperationResponseStatus.INITIATED,
      claim: REPLICA_SNAPSHOT_INSTALL_CLAIM.REMOVAL,
      wait: REPLICA_SNAPSHOT_INSTALL_WAIT.EPISODE_STEP_SETTLE,
      durable: ReplicaStatus.REMOVING, exits: 0, opened: 0},
    exits: [{onTracked: true, durable: ReplicaStatus.REMOVING, opened: 0}],
    lastAttempt: REPLICA_RECREATE_ATTEMPT.EPISODE_CLAIMED,
    wait: REPLICA_SNAPSHOT_INSTALL_WAIT.NONE, attempts: 1});
}));

test('R2 x REMOVING durable: the REMOVING write waits for the same lifecycle ' +
  'read; when it answers the attempt ends held and opens nothing, then the ' +
  'removal claims the stopped replica',
SCENARIO, () => suspendedAt('R2', async ({world, replicaId, held, exits}) => {
  const pending = await removingWaitsForTheRead(world, replicaId, exits);
  held.open();
  await waitFor(() => exits.length === 1, 'the removal reaches its consensus exit');
  const after = recreationOf(world, replicaId);
  assert.deepEqual({pending, exits, lastAttempt: after.lastAttempt,
    state: after.state, claim: after.claim, attempts: after.attempts}, {
    pending: WRITE_PENDING,
    exits: [{onTracked: true, durable: ReplicaStatus.REMOVING, opened: 0}],
    lastAttempt: REPLICA_RECREATE_ATTEMPT.HELD_FOR_REMOVAL,
    state: STATE.CLAIMED, claim: REPLICA_SNAPSHOT_INSTALL_CLAIM.REMOVAL,
    attempts: 1});
}));

// C7: an acceptance that throws after the removal was offered leaves the
// episode exactly as it was: the hold is taken as the last synchronous step
// before the removal's task starts, so nothing has to be undone.
test('R1 x REMOVE refused by a throwing acceptance: no hold, no tracked ' +
  'removal, the episode unchanged, and the replica returns',
SCENARIO, () => suspendedAt('R1', async ({world, replicaId, held}) => {
  const {handler} = world;
  const before = recreationOf(world, replicaId);
  const fence = handler.fenceReplicaServingAdmissionForRemoval;
  handler.fenceReplicaServingAdmissionForRemoval = () => {
    throw new Error('the serving fence could not be raised');
  };
  await assert.rejects(handler.handleRemoveReplica(removeRequest(replicaId)),
    /the serving fence could not be raised/u);
  handler.fenceReplicaServingAdmissionForRemoval = fence;
  assert.deepEqual({record: recreationOf(world, replicaId),
    removing: handler.hasInProgressReplicaRemoval(replicaId)},
  {record: before, removing: false});
  held.open();
  await waitFor(() => stateOf(world, replicaId) === STATE.RUNNING,
    'the recreation brings the replica back');
  assert.deepEqual({opened: world.created.length,
    running: targetService(world, replicaId) === world.created[0] &&
      world.created[0].isShutdown !== true,
    held: recreationOf(world, replicaId).removalOperations},
  {opened: 1, running: true, held: 0});
}));
