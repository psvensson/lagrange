// The partition leader's snapshot catch-up driver
// (partition-snapshot-catchup-driver.js) against a service double that holds
// exactly what the driver reads: the dispatcher seam, the consensus status
// (shaped by its owner, test/test-helpers/raft-leader-status-fixture.js),
// the role, the clock, the logger, the system-table cache and a replica
// path whose checkpoints root is a real directory. The driver over the
// production wiring is test/raft/snapshot-catchup-wiring-reask.test.js; on
// real services, test/raft/raft-rs-backend/partition-checkpoint-epoch-generation.test.js.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {afterEach, beforeEach, test} from 'node:test';

import {AddressManager} from '../../src/address/address-manager.js';
import {ConfigurationManager} from '../../src/config/configuration-manager.js';
import {
  createPartitionSnapshotCatchupDriver,
} from '../../src/partition/partition-snapshot-catchup-driver.js';
import {
  PARTITION_SNAPSHOT_CATCHUP_CLOSE as CLOSE,
  PARTITION_SNAPSHOT_CATCHUP_DISPATCH_IDLE_BOUND_MS as IDLE_BOUND_MS,
  PARTITION_SNAPSHOT_CATCHUP_DRIVER_OUTCOME as DRIVER,
  PARTITION_SNAPSHOT_CATCHUP_REASK_BOUND_MS as REASK_BOUND_MS,
  PARTITION_SNAPSHOT_CATCHUP_SERVED_REASK_BOUND_MS as SERVED_REASK_BOUND_MS,
  PARTITION_SNAPSHOT_CATCHUP_SWEEP_OUTCOME as SWEEP,
  PARTITION_SNAPSHOT_CATCHUP_TRIGGER as TRIGGER,
  PARTITION_SNAPSHOT_PROGRESS_EVENT as EVENT,
} from '../../src/partition/partition-snapshot-progress-constants.js';
import {RAFT_ROLE} from '../../src/raft/constants.js';
import {
  RAFT_SNAPSHOT_CATCHUP_DECISION_OUTCOME,
  RAFT_SNAPSHOT_CATCHUP_DISPATCH_OUTCOME as DISPATCH,
  buildSnapshotCatchupDecision,
} from '../../src/raft/snapshot-catchup-constants.js';
import {resolveReplicaCheckpointsRoot} from '../../src/raft/snapshot-install.js';
import {leaderStatusOf} from '../test-helpers/raft-leader-status-fixture.js';

const PARTITION_ID = 'drv_rows-p1';
const LEADER_IDENTITY = 'drv_rows-p1-r1';
const FOLLOWER_IDENTITY = 'drv_rows-p1-r2';
const FOLLOWER = `node-b/partition/${FOLLOWER_IDENTITY}`;
const BOUNDARY = 40;
const START_MS = 1_000_000;
const DECISION = buildSnapshotCatchupDecision({
  outcome: RAFT_SNAPSHOT_CATCHUP_DECISION_OUTCOME.INSTALL_SNAPSHOT,
  followerAddress: FOLLOWER, startIndex: 1, failedIndex: BOUNDARY,
  leaderBoundary: BOUNDARY});
const ABORTED = Object.freeze({outcome: DISPATCH.TRANSFER_ABORTED,
  transfer: Object.freeze({outcome: 'aborted', reason: 'stale_epoch'})});
const SERVED = Object.freeze({outcome: DISPATCH.SERVED, generationIndex: BOUNDARY});
const SLOT_BUSY = Object.freeze({outcome: DISPATCH.ALREADY_IN_FLIGHT});
const THE_FOLLOWER = Object.freeze({peerId: '2', replicaIdentity: FOLLOWER_IDENTITY,
  address: FOLLOWER, matched: 1});
const ANOTHER_VOTER = Object.freeze({peerId: '3', replicaIdentity: 'drv_rows-p1-r3',
  address: 'node-c/partition/drv_rows-p1-r3', matched: 90});

let workDir;

beforeEach(() => {
  ConfigurationManager.resetInstance();
  AddressManager.resetInstance();
  ConfigurationManager.getInstance().initialize({node: {id: 'node-a'}});
  workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'catchup-driver-'));
});

afterEach(() => {
  fs.rmSync(workDir, {recursive: true, force: true});
  ConfigurationManager.resetInstance();
  AddressManager.resetInstance();
});

// The leader's status for a configuration of the given peers, as the
// runtime's own observation owner shapes it.
function statusOf(peers) {
  return leaderStatusOf({groupId: PARTITION_ID,
    leaderReplicaIdentity: LEADER_IDENTITY,
    leaderAddress: `node-a/partition/${LEADER_IDENTITY}`, peers});
}

function serviceDouble(seam) {
  const lines = [];
  const world = {nowMs: START_MS, epoch: 1, status: statusOf([THE_FOLLOWER]),
    lines, calls: []};
  const record = (level) => (message, fields) => lines.push({level, message, fields});
  world.service = {
    partitionId: PARTITION_ID, tableName: 'drv_rows',
    dbPath: path.join(workDir, 'partition', 'drv_rows-p1-r1.db'),
    role: RAFT_ROLE.LEADER, isShutdown: false,
    timeSource: {now: () => world.nowMs},
    logger: {warn: record('warn'), info: record('info')},
    systemTableCache: {
      getAll: () => [{status: 'PUBLISHED', publication_epoch: world.epoch}],
      get: () => null},
    raft: {readStatus: () => world.status},
    onSnapshotCatchupNeeded: seam === undefined ? null : (decision, dispatch) => {
      world.calls.push({decision, dispatch});
      return seam(decision, dispatch);
    },
  };
  world.driver = createPartitionSnapshotCatchupDriver({service: world.service});
  world.follower = () => world.driver.readDiagnostics().followers[0];
  world.sealGeneration = (index) => fs.mkdirSync(path.join(
    resolveReplicaCheckpointsRoot(world.service.dbPath), String(index)),
  {recursive: true});
  world.closings = () => lines.filter(({fields}) =>
    fields.event === EVENT.CATCHUP_SETTLED).map(({fields}) => fields.reason);
  return world;
}

function dispatchLines(world) {
  return world.lines.filter(({fields}) =>
    fields.event === EVENT.CATCHUP_DISPATCH_OUTCOME);
}

// One sweep, then one turn of the loop so a dispatch it started settles
// (these seams answer at once).
async function sweepAfter(world, elapsedMs) {
  const swept = await world.driver.sweep(world.follower().settledAtMs + elapsedMs);
  await new Promise((resolve) => setImmediate(resolve));
  return swept.reasked.map(({trigger}) => trigger);
}

test('a leader with no dispatcher wired answers and logs the typed state', async () => {
  const world = serviceDouble();
  assert.equal((await world.driver.dispatch(DECISION)).outcome,
    DRIVER.DISPATCHER_UNWIRED);
  assert.deepEqual({outcome: world.follower().lastOutcome,
    attempts: world.follower().attempts, inFlight: world.follower().inFlight},
  {outcome: DRIVER.DISPATCHER_UNWIRED, attempts: 1, inFlight: false});
  assert.deepEqual(dispatchLines(world).map(({level, fields}) =>
    [level, fields.outcome, fields.followerAddress, fields.partitionId]),
  [['warn', DRIVER.DISPATCHER_UNWIRED, FOLLOWER, PARTITION_ID]]);
});

test('a seam that answers no typed result, throws or rejects is a typed outcome', async () => {
  const untyped = serviceDouble(() => 7);
  assert.equal((await untyped.driver.dispatch(DECISION)).outcome, DRIVER.RESULT_UNTYPED);
  const thrown = serviceDouble(() => {
    throw new Error('dial failed');
  });
  const faulted = await thrown.driver.dispatch(DECISION);
  assert.deepEqual({outcome: faulted.outcome, detail: faulted.detail},
    {outcome: DRIVER.DISPATCH_FAULTED, detail: 'dial failed'});
  const rejected = serviceDouble(() => Promise.reject(new Error('socket lost')));
  assert.equal((await rejected.driver.dispatch(DECISION)).outcome,
    DRIVER.DISPATCH_FAULTED);
  assert.equal(rejected.follower().lastOutcome, DRIVER.DISPATCH_FAULTED);
});

test('notifications for a follower whose dispatch is in flight coalesce', async () => {
  let release;
  const world = serviceDouble(() => new Promise((resolve) => {
    release = () => resolve(SERVED);
  }));
  const first = world.driver.dispatch(DECISION);
  const second = world.driver.dispatch(DECISION);
  assert.equal(world.follower().inFlight, true);
  assert.equal(world.follower().lastOutcome, DRIVER.IN_FLIGHT);
  assert.deepEqual((await world.driver.sweep(START_MS + REASK_BOUND_MS)).reasked, [],
    'a record in flight is never re-asked');
  release();
  assert.equal(await first, await second);
  assert.equal(world.calls.length, 1);
  assert.equal(dispatchLines(world).length, 0, 'a served dispatch is not a failure line');
});

test('a dispatch that did not serve is re-asked on a newer generation, a ' +
  'changed identity, or the bound; an unchanged one is not', async () => {
  const world = serviceDouble(() => ABORTED);
  world.sealGeneration(BOUNDARY);
  await world.driver.dispatch(DECISION);
  assert.deepEqual({reason: world.follower().lastReason,
    trigger: world.follower().lastTrigger},
  {reason: 'stale_epoch', trigger: TRIGGER.RUNTIME_NOTIFICATION});
  assert.deepEqual(await sweepAfter(world, REASK_BOUND_MS - 1), []);
  world.sealGeneration(BOUNDARY + 5);
  assert.deepEqual(await sweepAfter(world, 1000), [TRIGGER.NEWER_CHECKPOINT_GENERATION]);
  assert.deepEqual(await sweepAfter(world, 1000), [],
    'the same generation does not re-ask twice');
  world.epoch = 2;
  assert.deepEqual(await sweepAfter(world, 1000), [TRIGGER.IDENTITY_CHANGED]);
  assert.deepEqual(await sweepAfter(world, 1000), []);
  assert.deepEqual(await sweepAfter(world, REASK_BOUND_MS), [TRIGGER.BOUND_ELAPSED]);
  assert.equal(world.follower().attempts, 4);
  assert.equal(world.follower().inFlight, false);
});

test('a served follower is not offered the image again while it may be ' +
  'installing: only its own, longer bound re-asks it', async () => {
  const world = serviceDouble(() => SERVED);
  await world.driver.dispatch(DECISION);
  world.sealGeneration(BOUNDARY + 5);
  world.epoch = 2;
  assert.deepEqual(await sweepAfter(world, REASK_BOUND_MS), [],
    'neither an event nor the refused-dispatch bound re-offers a served image');
  assert.deepEqual(await sweepAfter(world, SERVED_REASK_BOUND_MS - 1), []);
  assert.deepEqual(await sweepAfter(world, SERVED_REASK_BOUND_MS),
    [TRIGGER.SERVED_BOUND_ELAPSED]);
});

test('a dispatch refused because the follower node\'s slot was busy is ' +
  'asked again on the next sweep, without a failure line', async () => {
  const answers = [SLOT_BUSY, SLOT_BUSY, SERVED];
  const world = serviceDouble(() => answers.shift());
  await world.driver.dispatch(DECISION);
  assert.deepEqual(await sweepAfter(world, 1000), [TRIGGER.FOLLOWER_NODE_SLOT_BUSY]);
  assert.deepEqual(await sweepAfter(world, 1000), [TRIGGER.FOLLOWER_NODE_SLOT_BUSY]);
  assert.deepEqual([world.follower().attempts, world.follower().lastOutcome],
    [3, DISPATCH.SERVED]);
  assert.equal(dispatchLines(world).length, 0);
});

test('a dispatch in flight with no progress for the idle bound is aborted ' +
  'through its signal and settles typed; progress resets the bound', async () => {
  const world = serviceDouble(() => new Promise(() => {}));
  world.driver.dispatch(DECISION);
  assert.ok(world.calls[0].dispatch, 'the seam is given an abort signal and a progress observer');
  const {signal, onProgress} = world.calls[0].dispatch;
  assert.equal(signal.aborted, false);
  // Progress at +30 s: the bound counts from there.
  world.nowMs = START_MS + IDLE_BOUND_MS / 2;
  onProgress();
  await world.driver.sweep(START_MS + IDLE_BOUND_MS);
  assert.equal(world.follower().inFlight, true, 'progress was reported inside the bound');
  await world.driver.sweep(world.nowMs + IDLE_BOUND_MS - 1);
  assert.equal(signal.aborted, false);

  await world.driver.sweep(world.nowMs + IDLE_BOUND_MS);
  assert.equal(signal.aborted, true, 'the dispatcher is told to stop');
  assert.deepEqual({inFlight: world.follower().inFlight,
    outcome: world.follower().lastOutcome, attempts: world.follower().attempts},
  {inFlight: false, outcome: DRIVER.DISPATCH_UNANSWERED, attempts: 1});
  assert.deepEqual(dispatchLines(world).map(({level, fields}) =>
    [level, fields.outcome]), [['warn', DRIVER.DISPATCH_UNANSWERED]]);
  // Unanswered is a dispatch that did not serve: the refused bound re-asks.
  assert.deepEqual(await sweepAfter(world, REASK_BOUND_MS), [TRIGGER.BOUND_ELAPSED]);
  assert.equal(world.calls.length, 2);
});

test('an aborted dispatch that answers late does not overwrite the record', async () => {
  let answerLate;
  const world = serviceDouble(() => new Promise((resolve) => {
    answerLate = () => resolve(SERVED);
  }));
  world.driver.dispatch(DECISION);
  await world.driver.sweep(START_MS + IDLE_BOUND_MS);
  assert.equal(world.follower().inFlight, false, 'aborted at the idle bound');
  answerLate();
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(world.follower().lastOutcome, DRIVER.DISPATCH_UNANSWERED);
});

test('the record closes when the leader\'s progress for the follower is ' +
  'past the boundary, when the configuration no longer names it, and on ' +
  'lost leadership', async () => {
  const closedBy = async (arrange, seam = () => ABORTED) => {
    const world = serviceDouble(seam);
    world.driver.dispatch(DECISION);
    await new Promise((resolve) => setImmediate(resolve));
    arrange(world);
    const swept = await world.driver.sweep(START_MS + 1000);
    return {outcome: swept.outcome, open: world.driver.readDiagnostics().followers.length,
      reasons: world.closings(), world};
  };
  const closed = ({outcome, open, reasons}) => ({outcome, open, reasons});
  assert.deepEqual(closed(await closedBy((world) => {
    world.status = statusOf([{...THE_FOLLOWER, matched: BOUNDARY}]);
  })), {outcome: SWEEP.SWEPT, open: 0, reasons: [CLOSE.PAST_BOUNDARY]});
  assert.deepEqual(closed(await closedBy((world) => {
    world.status = statusOf([{...THE_FOLLOWER, matched: BOUNDARY - 1}]);
  })), {outcome: SWEEP.SWEPT, open: 1, reasons: []});
  // Departure is read from the committed configuration: the follower's
  // identity is not among its peers, however their addresses resolve.
  assert.deepEqual(closed(await closedBy((world) => {
    world.status = statusOf([{...ANOTHER_VOTER, address: null}]);
  })), {outcome: SWEEP.SWEPT, open: 0, reasons: [CLOSE.NOT_IN_CONFIGURATION]});
  assert.deepEqual(closed(await closedBy((world) => {
    world.status = statusOf([{...THE_FOLLOWER, address: null}]);
  })), {outcome: SWEEP.SWEPT, open: 1, reasons: []},
  'a configured follower whose address does not resolve has not departed');
  assert.deepEqual(closed(await closedBy((world) => {
    world.status = statusOf([ANOTHER_VOTER,
      {peerId: '4', replicaIdentity: null, address: null, matched: 0, learner: true}]);
  })), {outcome: SWEEP.SWEPT, open: 1, reasons: []},
  'a configured peer of unknown identity may be the follower: not departed');
  assert.deepEqual(closed(await closedBy((world) => {
    world.service.role = RAFT_ROLE.FOLLOWER;
  })), {outcome: SWEEP.NOT_LEADER, open: 0, reasons: [CLOSE.LEADERSHIP_LOST]});
  // Lost leadership with the dispatch still in flight: aborted and closed.
  const inFlight = await closedBy((world) => {
    world.service.role = RAFT_ROLE.FOLLOWER;
  }, () => new Promise(() => {}));
  assert.deepEqual(closed(inFlight),
    {outcome: SWEEP.NOT_LEADER, open: 0, reasons: [CLOSE.LEADERSHIP_LOST]});
  assert.ok(inFlight.world.calls[0].dispatch, 'the seam is given an abort signal');
  assert.equal(inFlight.world.calls[0].dispatch.signal.aborted, true);
});

test('a sweep with no record reads nothing; an unreadable status keeps the record', async () => {
  const idle = serviceDouble(() => SERVED);
  idle.service.raft.readStatus = () => {
    throw new Error('status must not be read without a record');
  };
  assert.equal((await idle.driver.sweep(START_MS)).outcome, SWEEP.NO_FOLLOWER_RECORD);
  const held = serviceDouble(() => ABORTED);
  await held.driver.dispatch(DECISION);
  held.status = {outcome: 'RECOVERY_DEFERRED'};
  assert.deepEqual({...await held.driver.sweep(START_MS + REASK_BOUND_MS)},
    {outcome: SWEEP.STATUS_UNAVAILABLE, statusOutcome: 'RECOVERY_DEFERRED'});
  assert.equal(held.driver.readDiagnostics().followers.length, 1);
  held.service.raft.readStatus = () => {
    throw new Error('status read failed');
  };
  assert.deepEqual({...await held.driver.sweep(START_MS + REASK_BOUND_MS)},
    {outcome: SWEEP.SWEEP_FAILED, detail: 'status read failed'});
});

test('shutting the driver down aborts every flight, closes every record ' +
  'and refuses later notifications typed', async () => {
  const world = serviceDouble(() => new Promise(() => {}));
  world.driver.dispatch(DECISION);
  assert.equal(typeof world.driver.shutdown, 'function', 'the driver ends with its service');
  world.driver.shutdown();
  assert.equal(world.calls[0].dispatch.signal.aborted, true);
  assert.deepEqual(world.driver.readDiagnostics().followers, []);
  assert.deepEqual(world.closings(), [CLOSE.SERVICE_SHUT_DOWN]);
  assert.equal((await world.driver.dispatch(DECISION)).outcome, DRIVER.SERVICE_SHUT_DOWN);
  assert.equal(world.calls.length, 1, 'the dispatcher is not asked after shutdown');
  assert.equal((await world.driver.sweep(START_MS)).outcome, SWEEP.NO_FOLLOWER_RECORD);
});
