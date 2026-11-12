// A create that fails while its replica is under a snapshot-install episode
// (quest partition-checkpoint-epoch-generation, hand-over coverage model cells
// 12, 13 and 14, decision D7). Real PartitionServices, the target node's real
// ReplicaHandler and its real CREATE path.
//
//  F-deferred  cells 12 and 14 end to end, at R3: the create fails while the
//              replacement is opening; its failure claims the episode and
//              waits for that open; its FAILED write is deferred (the row
//              stays SYNCING); the replayed CREATE is refused typed while the
//              episode lives, answered in progress while the failure settles,
//              and is the ONE opener afterwards (RESTART_CREATE).
//  F-admission the create fails between the pre-shutdown admission and the
//              shutdown (A3): the episode is claimed, the replica is never
//              stopped by the install and nothing is installed.

import assert from 'node:assert/strict';
import fs from 'node:fs';
import {test} from 'node:test';

import {
  REPLICA_SNAPSHOT_INSTALL_CLAIM,
  REPLICA_SNAPSHOT_INSTALL_ERROR_CODE,
  REPLICA_SNAPSHOT_INSTALL_STATE,
  REPLICA_SNAPSHOT_INSTALL_WAIT,
} from '../../../src/node/replica-snapshot-install-constants.js';
import {TABLES} from '../../../src/constants/index.js';
import {PARTICIPANT_RELEASE_TRIGGER} from
  '../../../src/partition/partition-participant-transaction-cutover-constants.js';
import {ReplicaOperationResponseStatus} from
  '../../../src/rebalancer/replica-operation-constants.js';
import {ReplicaStatus} from '../../../src/rebalancer/replica-status.js';
import {
  CADENCE_ENTRY_THRESHOLD,
  PARTITION_ID,
  committedAddRequest,
  durableStatus,
  gateAdmissions,
  holdLifecycleRead,
  recreationOf,
  targetService,
  userRows,
  waitFor,
  withInstallWorld,
  writeAndCompact,
} from './snapshot-install-recreate-fixture.js';

const SCENARIO = Object.freeze({timeout: 240000});
const REPLICA_ID = `${PARTITION_ID}-r4`;
const STATE = REPLICA_SNAPSHOT_INSTALL_STATE;
const UNDER_EPISODE =
  REPLICA_SNAPSHOT_INSTALL_ERROR_CODE.REPLICA_UNDER_INSTALL_EPISODE;

// Every open of the replica on the target node, observed at the factory: an
// opener is an open in flight or a service it returned that is not shut
// down. `violations` records each open that began beside another opener.
function observeOpeners(world, holdOpenNumber) {
  const gate = Promise.withResolvers();
  const reached = Promise.withResolvers();
  const openers = {begun: 0, inFlight: 0, violations: [], open: gate.resolve,
    reached: reached.promise};
  world.factoryHook = async (options) => {
    if (options.replicaId !== REPLICA_ID) return;
    openers.begun += 1;
    const running = world.created.filter((service) =>
      service.replicaId === REPLICA_ID && service.isShutdown !== true).length;
    if (running > 0 || openers.inFlight > 0) {
      openers.violations.push({open: openers.begun, running,
        inFlight: openers.inFlight});
    }
    openers.inFlight += 1;
    try {
      if (openers.begun === holdOpenNumber) {
        reached.resolve();
        await gate.promise;
      }
    } finally {
      // The factory constructs and initializes synchronously after the hook.
      setImmediate(() => {
        openers.inFlight -= 1;
      });
    }
  };
  return openers;
}

// The create's own participant release is lost on the network once `when`
// resolves, the first time only: the create fails holding its replica.
function loseFirstFreshCreateRelease(world, when) {
  let lost = false;
  world.releaseRequestGate = async (request) => {
    if (lost || request.trigger !== PARTICIPANT_RELEASE_TRIGGER.FRESH_CREATE) {
      return;
    }
    lost = true;
    await when;
    throw new Error('the release request was lost');
  };
}

async function replay(world, request) {
  const response = await world.handler.handleCreateReplica(request);
  return {status: response.status, errorCode: response.errorCode ?? null,
    deferRetry: response.deferRetry ?? null};
}

test('F-deferred: a create failing while the replacement opens claims the ' +
  'episode after that open; its FAILED write deferred, the replayed CREATE ' +
  'is the one opener', SCENARIO, async () => {
  await withInstallWorld({establishedOnTarget: false}, async (world) => {
    await writeAndCompact(world, 1, CADENCE_ENTRY_THRESHOLD);
    const {handler} = world;
    // Open 1 is the create's own, open 2 the episode's replacement (held).
    const openers = observeOpeners(world, 2);
    const fail = Promise.withResolvers();
    loseFirstFreshCreateRelease(world, fail.promise);
    // The control plane refuses the create's FAILED write: it is deferred.
    world.store.setBeforeMutation((mutation) => {
      if (mutation.tableName === TABLES.SERVICES &&
          mutation.whereClause?.service_id === REPLICA_ID &&
          mutation.data?.status === ReplicaStatus.FAILED) {
        throw new Error('control plane unavailable for the FAILED write');
      }
    });
    const {operationId, request} = await committedAddRequest(world, REPLICA_ID);
    const first = await handler.handleCreateReplica(request);
    assert.equal(first.status, ReplicaOperationResponseStatus.INITIATED,
      JSON.stringify(first));
    await openers.reached;
    const original = world.created[0];
    // (1) The episode lives (its replacement is opening); the create has not
    // failed yet: the replay is refused typed and retryable.
    const whileEpisode = {replay: await replay(world, request),
      state: recreationOf(world, REPLICA_ID).state, begun: openers.begun,
      row: durableStatus(world, REPLICA_ID)};
    // (2) The create fails; its failure claims the episode and waits for the
    // open in flight. Nothing is unregistered or opened meanwhile.
    fail.resolve();
    await waitFor(() => recreationOf(world, REPLICA_ID).state === STATE.CLAIMED,
      'the failing create claimed the episode');
    await new Promise((resolve) => setTimeout(resolve, 300));
    const record = recreationOf(world, REPLICA_ID);
    const whileSettling = {claim: record.claim, wait: record.wait,
      tracked: targetService(world, REPLICA_ID) === original,
      replay: await replay(world, request), begun: openers.begun,
      row: durableStatus(world, REPLICA_ID)};
    // (3) The open settles: its product is released, the failure fences the
    // stopped replica, the FAILED write is deferred.
    openers.open();
    await waitFor(() => !handler.inProgressOperations.has(operationId),
      'the failed create settled');
    const afterFailure = {row: durableStatus(world, REPLICA_ID),
      tracked: targetService(world, REPLICA_ID),
      created: world.created.map((service) => service.isShutdown),
      wait: recreationOf(world, REPLICA_ID).wait, begun: openers.begun};
    // (4) The control plane is back; the coordinator's re-dispatch restarts
    // the create, which is the one opener.
    world.store.setBeforeMutation(null);
    const created = new Promise((resolve) => {
      handler.once('replicaCreated', () => resolve('created'));
      handler.once('replicaCreationFailed', (event) => resolve(event.error));
    });
    const restarted = await replay(world, request);
    const outcome = await created;
    const facts = {whileEpisode, whileSettling, afterFailure, restarted, outcome,
      violations: openers.violations};
    assert.deepEqual(facts, {
      whileEpisode: {replay: {status: ReplicaOperationResponseStatus.ERROR,
        errorCode: UNDER_EPISODE, deferRetry: true},
      state: STATE.RECREATE_PENDING, begun: 2, row: ReplicaStatus.SYNCING},
      whileSettling: {claim: REPLICA_SNAPSHOT_INSTALL_CLAIM.CREATE_FAILURE,
        wait: REPLICA_SNAPSHOT_INSTALL_WAIT.EPISODE_STEP_SETTLE, tracked: true,
        replay: {status: ReplicaOperationResponseStatus.IN_PROGRESS,
          errorCode: null, deferRetry: null},
        begun: 2, row: ReplicaStatus.SYNCING},
      afterFailure: {row: ReplicaStatus.SYNCING, tracked: null,
        created: [true, true], wait: REPLICA_SNAPSHOT_INSTALL_WAIT.NONE,
        begun: 2},
      restarted: {status: ReplicaOperationResponseStatus.INITIATED,
        errorCode: null, deferRetry: null},
      outcome: 'created', violations: []}, JSON.stringify(facts));
    await waitFor(() => targetService(world, REPLICA_ID)?.raft?.readStatus()
      .appliedIndex === world.leader.raft.readStatus().appliedIndex,
    'the restarted create\'s replica converges');
    assert.deepEqual(userRows(targetService(world, REPLICA_ID)),
      userRows(world.leader));
    assert.equal(durableStatus(world, REPLICA_ID), ReplicaStatus.ACTIVE);
    assert.deepEqual({violations: openers.violations,
      running: world.created.filter((service) => !service.isShutdown).length},
    {violations: [], running: 1}, 'at most one opener at any time');
  });
});

test('F-admission: a create failing between the pre-shutdown admission and ' +
  'the shutdown claims the episode: nothing is installed, and the failure ' +
  'fences the running replica', SCENARIO, async () => {
  await withInstallWorld({establishedOnTarget: false}, async (world) => {
    await writeAndCompact(world, 1, CADENCE_ENTRY_THRESHOLD);
    const {handler} = world;
    const openers = observeOpeners(world, 0);
    const gates = gateAdmissions(world);
    // A3 itself: the lifecycle read inside the pre-shutdown admission.
    let inAdmission = false;
    const read = holdLifecycleRead(world, REPLICA_ID, () => inAdmission);
    const fail = Promise.withResolvers();
    loseFirstFreshCreateRelease(world, fail.promise);
    const failed = new Promise((resolve) => {
      handler.once('replicaCreationFailed', (event) => resolve(event.error));
    });
    const {request} = await committedAddRequest(world, REPLICA_ID);
    await handler.handleCreateReplica(request);
    await waitFor(() => gates.length === 1, 'the offer is routed');
    await gates[0].reached;
    inAdmission = true;
    gates[0].open();
    await read.reached;
    const original = world.created[0];
    const inodeBefore = fs.statSync(original.dbPath).ino;
    const before = {state: recreationOf(world, REPLICA_ID).state,
      running: original.isShutdown !== true};
    fail.resolve();
    const error = await failed;
    const claimed = {state: recreationOf(world, REPLICA_ID).state,
      claim: recreationOf(world, REPLICA_ID).claim,
      row: durableStatus(world, REPLICA_ID),
      tracked: targetService(world, REPLICA_ID),
      shutdown: original.isShutdown};
    read.open();
    await waitFor(() => gates[0].admission !== null,
      'the pre-shutdown admission answered');
    await new Promise((resolve) => setTimeout(resolve, 500));
    const facts = {before, claimed, admitted: gates[0].admission.admitted,
      installed: fs.existsSync(original.dbPath) &&
        fs.statSync(original.dbPath).ino !== inodeBefore,
      begun: openers.begun, violations: openers.violations};
    assert.match(error, /participant release failed/u);
    assert.deepEqual(facts, {
      before: {state: STATE.RECEIVING, running: true},
      claimed: {state: STATE.CLAIMED,
        claim: REPLICA_SNAPSHOT_INSTALL_CLAIM.CREATE_FAILURE,
        row: ReplicaStatus.FAILED, tracked: null, shutdown: true},
      admitted: false, installed: false, begun: 1, violations: []},
    JSON.stringify(facts));
  });
});
