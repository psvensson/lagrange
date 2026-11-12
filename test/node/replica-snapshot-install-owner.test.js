// The replica handler's snapshot install owner (quest
// partition-checkpoint-epoch-generation, the install episode: custody, holds
// and claims), branch by branch: the
// node's REAL replica handler, lifecycle state machine and lifecycle rows
// (snapshot-wiring-inproc-fixture.js createNodeReplicaHandler); the replica
// services and the factory are stand-ins, so every fault is placed exactly.
// The end-to-end witnesses over real PartitionServices are
// test/raft/raft-rs-backend/partition-snapshot-install-recreate.test.js.

import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {afterEach, beforeEach, test} from 'node:test';

import {ConfigurationManager} from '../../src/config/configuration-manager.js';
import {TABLES} from '../../src/constants/index.js';
import {LoggingService} from '../../src/logging/logging-service.js';
import {PARTITION_SERVICE_ERROR_CODE} from
  '../../src/partition/partition-service-constants.js';
import {
  REPLICA_RECREATE_ATTEMPT as ATTEMPT,
  REPLICA_RECREATE_TRIGGER as TRIGGER,
  REPLICA_SNAPSHOT_INSTALL_CLAIM as CLAIM,
  REPLICA_SNAPSHOT_INSTALL_ERROR_CODE as ERROR_CODE,
  REPLICA_SNAPSHOT_INSTALL_HOLD as HOLD,
  REPLICA_SNAPSHOT_INSTALL_STATE as STATE,
  REPLICA_SNAPSHOT_INSTALL_WAIT as WAIT,
  REPLICA_SNAPSHOT_OFFER_REFUSAL as REFUSAL,
} from '../../src/node/replica-snapshot-install-constants.js';
import {
  REPLICA_ACTIVATION_HANDLER_NOT_REGISTERED,
  REPLICA_STATE_MACHINE_EVENT,
} from '../../src/node/replica-state-machine-constants.js';
import {RAFT_SNAPSHOT_RECREATION_STATE as RECREATION} from
  '../../src/raft/snapshot-catchup-constants.js';
import {RAFT_CHECKPOINT_PAYLOAD_KIND} from
  '../../src/raft/snapshot-checkpoint-constants.js';
import {RAFT_SNAPSHOT_OFFER_RECEIVER as RECEIVER} from
  '../../src/raft/snapshot-offer-router.js';
import {ReplicaStatus} from '../../src/rebalancer/replica-status.js';
import {createNodeReplicaHandler} from '../raft/snapshot-wiring-inproc-fixture.js';

const NODE_ID = 'install-owner-node';
const PARTITION_ID = 'owner_rows-p1';
const REPLICA_ID = 'owner_rows-p1-r2';
const TRANSITION = REPLICA_STATE_MACHINE_EVENT.STATE_TRANSITION;
const SINGLETONS = [ConfigurationManager, LoggingService];

let dataDir;

beforeEach(() => {
  for (const singleton of SINGLETONS) singleton.resetInstance();
  ConfigurationManager.getInstance().initialize({node: {id: NODE_ID}});
  LoggingService.getInstance().initialize({level: 'error'});
  dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'install-owner-'));
});

afterEach(() => {
  fs.rmSync(dataDir, {recursive: true, force: true});
  for (const singleton of SINGLETONS) singleton.resetInstance();
});

// A replica service stand-in; `faults.shutdown` throws that many times.
function standIn(fields = {}, faults = {shutdown: 0}) {
  return {partitionId: PARTITION_ID, tableId: 'owner_rows',
    tableName: 'owner_rows', replicaId: REPLICA_ID, replicaIds: [REPLICA_ID],
    nodeId: NODE_ID, dbPath: path.join(dataDir, 'replica.db'),
    isShutdown: false, shutdowns: 0,
    fenceServingAdmissionForRemoval() {
      this.removalServingAdmissionFenced = true;
    },
    async shutdown() {
      this.isShutdown = true;
      this.shutdowns += 1;
      if (faults.shutdown > 0) {
        faults.shutdown -= 1;
        throw new Error('the service could not be released');
      }
    }, ...fields};
}

// The node, hosting one running replica; `open` is the factory's behaviour.
async function hostedNode(t, open = async (options) => standIn(options)) {
  const node = createNodeReplicaHandler({nodeId: NODE_ID, dataDir,
    createPartitionService: (options) => node.open(options)});
  node.open = open;
  node.owner = node.replicaHandler.snapshotInstallOwner;
  node.service = standIn();
  node.record = () => node.owner.readDiagnostics().replicas[0];
  node.held = () => node.replicaHandler.localServices.get(REPLICA_ID);
  t.after(async () => {
    node.replicaStateMachine.stopTimeoutChecker();
    await node.replicaHandler.shutdown();
  });
  await node.host(node.service);
  return node;
}

// A raft-rs replica image descriptor naming the given voters.
function imageNaming(replicaIdentities) {
  const peerReservations = replicaIdentities.map((replicaIdentity, index) =>
    ({replicaIdentity, peerId: String(index + 1)}));
  return {payloadKind: RAFT_CHECKPOINT_PAYLOAD_KIND.RAFT_RS_REPLICA_IMAGE,
    raftRs: {peerReservations, confState: {
      voters: peerReservations.map(({peerId}) => peerId), learners: []}}};
}

// The orchestration's steps up to the receive: the offer is admitted and the
// episode taken.
async function admitOffer(node, service = node.service) {
  const admission = await node.owner.admitOffer(service);
  assert.equal(admission.admitted, true, JSON.stringify(admission));
  return node.owner.episodeFor(service);
}

// ... and up to the stopped replica: admitted before the shutdown, then the
// shutdown step.
async function stopForInstall(node, service = node.service) {
  const episode = await admitOffer(node, service);
  const admission = await episode.admit(imageNaming([service.replicaId]));
  assert.equal(admission.admitted, true, JSON.stringify(admission));
  await episode.step(() => service.shutdown().catch(() => {}));
  return episode;
}

function wake(node) {
  node.replicaStateMachine.emit(TRANSITION, {replicaId: REPLICA_ID});
}

async function ended(node, state) {
  for (let turn = 0; turn < 200 && node.record().state !== state; turn += 1) {
    await new Promise((resolve) => setImmediate(resolve));
  }
  assert.equal(node.record().state, state, JSON.stringify(node.record()));
}

function turns(count = 20) {
  let chain = Promise.resolve();
  for (let turn = 0; turn < count; turn += 1) {
    chain = chain.then(() => new Promise((resolve) => setImmediate(resolve)));
  }
  return chain;
}

function facts(record) {
  return {state: record.state, attempts: record.attempts,
    lastAttempt: record.lastAttempt, lastTrigger: record.lastTrigger};
}

function refusalCodeOf(action) {
  try {
    action();
  } catch (error) {
    return error.code;
  }
  return 'not_refused';
}

const UNDER_EPISODE = ERROR_CODE.REPLICA_UNDER_INSTALL_EPISODE;

test('the first attempt recreates and registers the replica with the ' +
  'episode\'s custody, carrying the create identity, the serving fence and ' +
  'the handler\'s retirement lane', async (t) => {
  const opened = [];
  const node = await hostedNode(t, async (options) => {
    opened.push(options);
    return standIn(options);
  });
  Object.assign(node.service, {createAdmissionOperationId: 'op-1',
    createAdmissionToken: 'token-1', createAttemptToken: 'attempt-1'});
  node.service.fenceServingAdmissionForRemoval();
  const episode = await stopForInstall(node);
  assert.equal(node.owner.resolveReceiver(PARTITION_ID).state, RECEIVER.INSTALLING);
  assert.equal(episode.custody.isHeld(), true);
  assert.equal(node.owner.custodyOf(REPLICA_ID), episode.custody);
  const recreation = await episode.recreate();
  assert.equal(recreation.state, RECREATION.RUNNING);
  assert.equal(recreation.service, node.held());
  assert.notEqual(node.held(), node.service);
  assert.deepEqual({op: node.held().createAdmissionOperationId,
    token: node.held().createAdmissionToken,
    attempt: node.held().createAttemptToken,
    fenced: node.held().removalServingAdmissionFenced},
  {op: 'op-1', token: 'token-1', attempt: 'attempt-1', fenced: true});
  assert.equal(opened.length, 1);
  assert.equal(opened[0].resolveHandlerRetirementLane(),
    node.replicaStateMachine, 'retired through the handler\'s lifecycle owner');
  assert.equal(opened[0].dbPath, node.service.dbPath, 'over the same database');
  assert.deepEqual(facts(node.record()), {state: STATE.RUNNING, attempts: 1,
    lastAttempt: ATTEMPT.RECREATED, lastTrigger: TRIGGER.INSTALL_SETTLED});
  assert.equal(episode.custody.isHeld(), false, 'the custody is void at the end');
  assert.equal(node.owner.custodyOf(REPLICA_ID), null);
  assert.deepEqual(node.owner.resolveReceiver(PARTITION_ID),
    {state: RECEIVER.RUNNING, service: node.held()});
  assert.equal(node.owner.continuationOf(node.service), node.held());
  assert.equal(node.replicaHandler.localServices.episodeRefusals, 0);
});

test('a previous service whose shutdown threw is released again before the ' +
  'reopen, and the replica\'s next lifecycle transition wakes the retry',
async (t) => {
  const node = await hostedNode(t);
  const idle = node.replicaStateMachine.listenerCount(TRANSITION);
  node.service = standIn({}, {shutdown: 2});
  node.replicaHandler.replaceLocalReplicaService(REPLICA_ID, node.service, null);
  const episode = await stopForInstall(node);
  const recreation = await episode.recreate();
  assert.deepEqual({state: recreation.state, attempt: recreation.attempt}, {
    state: RECREATION.PENDING, attempt: ATTEMPT.PREVIOUS_SERVICE_NOT_RELEASED});
  assert.equal(node.held(), node.service, 'nothing was opened over it');
  assert.equal(node.replicaStateMachine.listenerCount(TRANSITION), idle + 1,
    'the owner listens while a recreation is pending');
  wake(node);
  await ended(node, STATE.RUNNING);
  assert.deepEqual(facts(node.record()), {state: STATE.RUNNING, attempts: 2,
    lastAttempt: ATTEMPT.RECREATED, lastTrigger: TRIGGER.LIFECYCLE_TRANSITION});
  assert.equal(node.service.shutdowns, 3, 'released by the orchestration, ' +
    'then by each attempt until it was');
  assert.equal(node.replicaStateMachine.listenerCount(TRANSITION), idle,
    'and stops listening when none is');
});

test('a replacement that cannot be registered is released, and the ' +
  'recreation stays pending', async (t) => {
  const node = await hostedNode(t);
  const register = node.replicaHandler.replaceLocalReplicaService;
  const refused = [];
  node.replicaHandler.replaceLocalReplicaService = (replicaId, replacement) => {
    refused.push(replacement);
    throw new Error('the registry refused the replacement');
  };
  const recreation = await (await stopForInstall(node)).recreate();
  assert.deepEqual({state: recreation.state, attempt: recreation.attempt,
    reason: recreation.reason}, {state: RECREATION.PENDING,
    attempt: ATTEMPT.REGISTER_THREW,
    reason: 'the registry refused the replacement'});
  assert.equal(refused[0].isShutdown, true, 'never left running unregistered');
  node.replicaHandler.replaceLocalReplicaService = register;
  wake(node);
  await ended(node, STATE.RUNNING);
});

test('the choke point: under an episode, in every state, the registry entry ' +
  'and the tracked service are written only with the custody', async (t) => {
  let opens = 0;
  const node = await hostedNode(t, async () => {
    opens += 1;
    throw new Error('the factory could not open the replica');
  });
  const {replicaHandler: handler} = node;
  const stranger = standIn();
  const writes = () => ({
    set: refusalCodeOf(() => handler.localServices.set(REPLICA_ID, stranger)),
    foreignCustody: refusalCodeOf(() => handler.localServices.set(REPLICA_ID,
      stranger, {isHeld: () => true})),
    delete: refusalCodeOf(() => handler.localServices.delete(REPLICA_ID)),
    memo: refusalCodeOf(() => handler.setLocalReplica(REPLICA_ID,
      {service: stranger})),
    replace: refusalCodeOf(() => handler.replaceLocalReplicaService(REPLICA_ID,
      stranger, null)),
    memoBound: refusalCodeOf(() => handler.setLocalReplica(REPLICA_ID,
      {service: node.service, status: ReplicaStatus.ACTIVE})),
  });
  const refusedAll = {set: UNDER_EPISODE, foreignCustody: UNDER_EPISODE,
    delete: UNDER_EPISODE, memo: UNDER_EPISODE, replace: UNDER_EPISODE,
    memoBound: 'not_refused'};
  const episode = await admitOffer(node);
  assert.deepEqual(writes(), refusedAll, 'receiving');
  await episode.admit(imageNaming([REPLICA_ID]));
  await episode.step(() => node.service.shutdown());
  assert.deepEqual(writes(), refusedAll, 'installing');
  await episode.recreate();
  assert.equal(node.record().state, STATE.RECREATE_PENDING);
  assert.deepEqual(writes(), refusedAll, 'recreate pending');
  assert.equal(handler.localServices.episodeRefusals, 15);
  assert.equal(node.held(), node.service, 'the entry never changed');
  assert.equal(handler.localReplicas.get(REPLICA_ID).service, node.service);
  // A claim ends the episode: the claimant writes as without an episode.
  assert.equal(await node.owner.claimForRemoval(REPLICA_ID), node.service);
  assert.equal(refusalCodeOf(() => handler.localServices.delete(REPLICA_ID)),
    'not_refused');
  assert.equal(opens, 1);
});

test('an offer takes the episode only for the running service the handler ' +
  'tracks, with no episode and no removal in progress', async (t) => {
  const node = await hostedNode(t);
  const stale = standIn();
  const refused = async (service) => (await node.owner.admitOffer(service)).reason;
  assert.equal(await refused(stale), REFUSAL.NOT_TRACKED_RUNNING,
    'a service object the handler does not track');
  node.replicaHandler.trackReplicaRemovalOperation('remove-op', PARTITION_ID,
    REPLICA_ID);
  assert.equal(await refused(node.service), REFUSAL.REMOVAL_IN_PROGRESS);
  node.replicaHandler.inProgressOperations.delete('remove-op');
  assert.equal(node.record(), undefined, 'a refused offer leaves no record');
  const first = node.owner.admitOffer(node.service);
  // Taken synchronously: a second offer, before the first admission read
  // answered, finds the episode.
  assert.equal(node.owner.resolveReceiver(PARTITION_ID).state, RECEIVER.INSTALLING);
  assert.equal(await refused(node.service), REFUSAL.EPISODE_LIVE);
  assert.equal((await first).admitted, true);
  assert.equal(node.record().state, STATE.RECEIVING);
  await node.service.shutdown();
  assert.deepEqual(node.owner.resolveReceiver(PARTITION_ID).state,
    RECEIVER.INSTALLING, 'still the episode\'s');
});

test('the admission before the shutdown: the lifecycle, the received image ' +
  'naming the replica, and the service still tracked and running; a ' +
  'refusal ends the episode with the replica never stopped', async (t) => {
  const node = await hostedNode(t);
  const notStopped = async (arrange, descriptor = imageNaming([REPLICA_ID])) => {
    const episode = await admitOffer(node);
    await arrange();
    const admission = await episode.admit(descriptor);
    assert.equal(node.record().state, STATE.NOT_STOPPED);
    assert.equal(episode.custody.isHeld(), false);
    assert.equal(node.service.isShutdown, false);
    return admission.reason;
  };
  assert.equal(await notStopped(() => {}, imageNaming(['owner_rows-p1-r1'])),
    REFUSAL.IMAGE_OMITS_REPLICA);
  let lift;
  assert.equal(await notStopped(() => {
    lift = node.owner.holdForRemoval(REPLICA_ID, 'remove-op');
  }), REFUSAL.REMOVAL_PENDING, 'held by an accepted removal: not stopped');
  lift();
  await node.store.gateway.updateSystemTableRow(TABLES.SERVICES,
    {service_id: REPLICA_ID}, {status: ReplicaStatus.SYNCING});
  const admitted = await admitOffer(node);
  await node.store.gateway.updateSystemTableRow(TABLES.SERVICES,
    {service_id: REPLICA_ID}, {status: ReplicaStatus.REMOVING});
  assert.equal((await admitted.admit(imageNaming([REPLICA_ID]))).reason,
    'row_removal_in_progress');
  assert.equal(node.record().state, STATE.NOT_STOPPED);
  assert.equal((await node.owner.admitOffer(node.service)).admitted, false);
  assert.equal(node.record(), undefined,
    'an offer refused at its admission leaves no record');
});

test('two running local replicas of one group: an offer for the group is ' +
  'ambiguous, and takes no episode', async (t) => {
  const node = await hostedNode(t);
  const second = standIn({replicaId: 'owner_rows-p1-r9'});
  await node.host(second);
  assert.deepEqual(node.owner.resolveReceiver(PARTITION_ID),
    {state: RECEIVER.AMBIGUOUS});
  assert.equal(node.record(), undefined);
  await second.shutdown();
  assert.deepEqual(node.owner.resolveReceiver(PARTITION_ID),
    {state: RECEIVER.RUNNING, service: node.service},
    'one running replica of the group is the receiver');
});

test('a service the handler stopped tracking as running during the receive ' +
  'is not stopped for an install', async (t) => {
  const node = await hostedNode(t);
  const episode = await admitOffer(node);
  await node.service.shutdown();
  const admission = await episode.admit(imageNaming([REPLICA_ID]));
  assert.deepEqual({admitted: admission.admitted, reason: admission.reason,
    state: node.record().state}, {admitted: false,
    reason: REFUSAL.NOT_TRACKED_RUNNING, state: STATE.NOT_STOPPED});
});

test('the cleanup owner, under a current token, claims the episode and ' +
  'removes nothing before the step in flight settled', async (t) => {
  const node = await hostedNode(t);
  const {replicaHandler: handler} = node;
  fs.writeFileSync(node.service.dbPath, 'the replica database');
  const episode = await admitOffer(node);
  await episode.admit(imageNaming([REPLICA_ID]));
  const stepGate = Promise.withResolvers();
  const step = episode.step(() => stepGate.promise);
  // The cleanup owner's current durable token (the tombstone owner's row is
  // not part of this fixture: it answers current).
  handler.getReplicaCleanupTombstoneOwner = () => ({requireCurrent: async () => true});
  handler.getPartitionDbPath = () => node.service.dbPath;
  handler.assertGroupRetiredTombstoneBeforeDelete = () => {};
  const cleanup = handler.cleanupReplicaResources(PARTITION_ID, REPLICA_ID,
    {kind: 'cleanup_owned', replicaCreatedAt: 1, createAttemptToken: 'attempt'});
  await turns();
  assert.deepEqual({state: node.record().state, claim: node.record().claim,
    wait: node.record().wait, database: fs.existsSync(node.service.dbPath)},
  {state: STATE.CLAIMED, claim: CLAIM.CLEANUP, wait: WAIT.EPISODE_STEP_SETTLE,
    database: true}, 'claimed; the database is untouched while the step runs');
  stepGate.resolve();
  await Promise.all([step, cleanup]);
  assert.equal(fs.existsSync(node.service.dbPath), false,
    'the storage is removed after the step settled');
});

test('an accepted removal holds the episode by operation id: nothing is ' +
  'opened, an open in flight is released, and the last lift resumes',
async (t) => {
  const opened = [];
  const gate = Promise.withResolvers();
  const node = await hostedNode(t, async (options) => {
    opened.push(standIn(options));
    if (opened.length === 1) await gate.promise;
    return opened.at(-1);
  });
  const episode = await stopForInstall(node);
  const recreating = episode.recreate();
  await turns();
  assert.equal(opened.length, 1, 'the first open is in flight');
  const liftFirst = node.owner.holdForRemoval(REPLICA_ID, 'remove-op-1');
  const liftSecond = node.owner.holdForRemoval(REPLICA_ID, 'remove-op-2');
  assert.deepEqual({hold: node.record().hold, held: node.record().removalOperations},
    {hold: HOLD.REMOVAL_PENDING, held: 2});
  gate.resolve();
  const recreation = await recreating;
  assert.deepEqual({state: recreation.state, attempt: recreation.attempt}, {
    state: RECREATION.PENDING, attempt: ATTEMPT.HELD_FOR_REMOVAL});
  assert.equal(opened[0].isShutdown, true, 'the open in flight was released');
  assert.equal(node.held(), node.service, 'and never registered');
  liftFirst();
  liftFirst();
  wake(node);
  await turns();
  assert.deepEqual({opened: opened.length, hold: node.record().hold,
    lastAttempt: node.record().lastAttempt}, {opened: 1,
    hold: HOLD.REMOVAL_PENDING, lastAttempt: ATTEMPT.HELD_FOR_REMOVAL},
  'the other operation still holds it: nothing is opened');
  liftSecond();
  await ended(node, STATE.RUNNING);
  assert.deepEqual({opened: opened.length, trigger: node.record().lastTrigger,
    hold: node.record().hold}, {opened: 2, trigger: TRIGGER.HOLD_LIFTED,
    hold: HOLD.NONE});
  assert.equal(node.held(), opened[1]);
});

test('a claim is synchronous, voids the custody, and the claimant waits ' +
  'for the step in flight (episode_step_settle)', async (t) => {
  let opens = 0;
  const node = await hostedNode(t, async (options) => {
    opens += 1;
    return standIn(options);
  });
  const episode = await admitOffer(node);
  await episode.admit(imageNaming([REPLICA_ID]));
  const stepGate = Promise.withResolvers();
  const step = episode.step(() => stepGate.promise);
  let claimed = 'pending';
  const claim = node.owner.claimForRemoval(REPLICA_ID).then((service) => {
    claimed = service;
  });
  assert.deepEqual({held: episode.custody.isHeld(), state: node.record().state,
    claim: node.record().claim, wait: node.record().wait,
    aborted: episode.signal.aborted}, {held: false, state: STATE.CLAIMED,
    claim: CLAIM.REMOVAL, wait: WAIT.EPISODE_STEP_SETTLE, aborted: true},
  'synchronously');
  // A second claimant waits for the same step.
  let cleanupSettled = false;
  const cleanup = node.owner.claimForCleanup(REPLICA_ID).then(() => {
    cleanupSettled = true;
  });
  await turns();
  assert.deepEqual({claimed, cleanupSettled}, {claimed: 'pending',
    cleanupSettled: false}, 'no claimant acts while the step is in flight');
  stepGate.resolve();
  await Promise.all([step, claim, cleanup]);
  assert.equal(claimed, node.service, 'the removal acts on the tracked service');
  assert.equal(node.record().wait, WAIT.NONE);
  const recreation = await episode.recreate();
  assert.deepEqual({state: recreation.state, claim: recreation.claim,
    attempt: recreation.attempt}, {state: RECREATION.RELEASED,
    claim: CLAIM.REMOVAL, attempt: ATTEMPT.EPISODE_CLAIMED});
  assert.equal(opens, 0, 'a claimed episode opens nothing');
  assert.equal(await node.owner.claimForRemoval('a-replica-with-no-record'), null);
});

test('a claim while the replacement opens: the product is released before ' +
  'the claimant acts; one that cannot be released stays in the handler\'s ' +
  'custody of unreleased runtimes', async (t) => {
  const node = await hostedNode(t);
  const gate = Promise.withResolvers();
  const opened = [];
  node.open = async (options) => {
    opened.push(standIn(options, {shutdown: 1}));
    await gate.promise;
    return opened.at(-1);
  };
  const recreating = (await stopForInstall(node)).recreate();
  await turns();
  let claimSettled = false;
  const claim = node.owner.claimForCleanup(REPLICA_ID).then(() => {
    claimSettled = true;
  });
  await turns();
  assert.equal(claimSettled, false, 'the open is the step in flight');
  gate.resolve();
  await claim;
  const recreation = await recreating;
  assert.deepEqual({state: recreation.state, claim: recreation.claim,
    attempt: recreation.attempt}, {state: RECREATION.RELEASED,
    claim: CLAIM.CLEANUP, attempt: ATTEMPT.EPISODE_CLAIMED});
  assert.equal(opened[0].shutdowns, 1, 'its release was attempted');
  assert.equal(node.held(), node.service, 'it was never registered');
  const retained = node.replicaHandler.pendingRuntimeShutdowns.get(opened[0]);
  assert.equal(retained.replicaId, REPLICA_ID);
  assert.equal(retained.partitionId, PARTITION_ID);
  assert.equal(retained.primary, null);
  assert.equal(retained.releaseInFlight, null);
  assert.equal(retained.lastFailure, node.record().releaseFailure,
    'quiescence retains the exact failed physical release cause');
  await node.replicaHandler.fenceFailedReplicaCreateRuntime(
    REPLICA_ID, PARTITION_ID, node.service);
  assert.equal(opened[0].shutdowns, 2, 'retry reaches the same unpublished product');
  assert.equal(node.replicaHandler.pendingRuntimeShutdowns.size, 0);
});

test('a failing create claims the episode only when it owns the replica',
  async (t) => {
    const node = await hostedNode(t);
    await stopForInstall(node);
    const other = standIn();
    assert.equal(await node.owner.claimForCreateFailure(REPLICA_ID, other), other);
    assert.equal(node.record().state, STATE.INSTALLING,
      'a create holding another service claims nothing');
    assert.equal(await node.owner.claimForCreateFailure(REPLICA_ID, undefined),
      undefined, 'a create that opened nothing claims nothing');
    assert.equal(node.record().claim, CLAIM.NONE);
    assert.equal(await node.owner.claimForCreateFailure(REPLICA_ID, node.service),
      node.service);
    assert.deepEqual({state: node.record().state, claim: node.record().claim},
      {state: STATE.CLAIMED, claim: CLAIM.CREATE_FAILURE});
  });

test('the handler\'s stop claims a pending recreation, and its retry never ' +
  'runs', async (t) => {
  let opens = 0;
  const node = await hostedNode(t, async () => {
    opens += 1;
    throw new Error('the factory could not open the replica');
  });
  const recreation = await (await stopForInstall(node)).recreate();
  assert.equal(recreation.attempt, ATTEMPT.CREATE_THREW);
  await node.owner.shutdown();
  assert.deepEqual({state: node.record().state, claim: node.record().claim},
    {state: STATE.CLAIMED, claim: CLAIM.HANDLER_STOP});
  wake(node);
  await turns();
  assert.equal(opens, 1);
  assert.deepEqual(node.owner.resolveReceiver(PARTITION_ID), {state: RECEIVER.ABSENT},
    'a stopped replica with no episode is not installing');
});

test('holds name who clears them: an open refused by an install conflict, ' +
  'a row another owner has, and the install outcome stay on the record',
async (t) => {
  const node = await hostedNode(t, async () => {
    throw Object.assign(new Error('install state conflict'),
      {code: PARTITION_SERVICE_ERROR_CODE.SNAPSHOT_INSTALL_STATE_CONFLICT});
  });
  const episode = await stopForInstall(node);
  const outcome = Object.freeze({outcome: 'install_rejected',
    reason: 'custody_not_held'});
  node.owner.recordInstallOutcome(node.service, outcome);
  const recreation = await episode.recreate();
  assert.equal(recreation.attempt, ATTEMPT.OPEN_REFUSED_INSTALL_CONFLICT);
  assert.deepEqual({state: node.record().state, hold: node.record().hold,
    install: node.record().install}, {state: STATE.RECREATE_PENDING,
    hold: HOLD.OPEN_REFUSED_INSTALL_CONFLICT, install: outcome});
  assert.deepEqual(node.replicaHandler.getStats().snapshotInstalls,
    [node.record()], 'visible in the handler\'s statistics');
  await node.store.gateway.updateSystemTableRow(TABLES.SERVICES,
    {service_id: REPLICA_ID}, {status: ReplicaStatus.FAILED});
  wake(node);
  await turns();
  assert.deepEqual({hold: node.record().hold, lastAttempt: node.record().lastAttempt,
    lastReason: node.record().lastReason}, {hold: HOLD.AWAITING_CLEANUP_OWNER,
    lastAttempt: ATTEMPT.ADMISSION_REFUSED, lastReason: 'row_failed'});
  await node.store.gateway.updateSystemTableRow(TABLES.SERVICES,
    {service_id: REPLICA_ID}, {status: ReplicaStatus.REMOVING});
  wake(node);
  await turns();
  assert.equal(node.record().hold, HOLD.AWAITING_REMOVAL_OWNER);
  // The hold's clearing actor: the removal's claim.
  assert.equal(await node.owner.claimForRemoval(REPLICA_ID), node.service);
  assert.deepEqual({state: node.record().state, hold: node.record().hold,
    install: node.record().install}, {state: STATE.CLAIMED, hold: HOLD.NONE,
    install: outcome});
});

function notRegistered() {
  return Object.assign(new Error('activation refused'),
    {code: REPLICA_ACTIVATION_HANDLER_NOT_REGISTERED});
}

const FAR_DEADLINE_MS = 60000;

test('a create activates the service that runs: over an install that ' +
  'stopped it around the write, and through later installs', async (t) => {
  const node = await hostedNode(t);
  const original = node.service;
  const activated = [];
  const active = await node.owner.activateContinuation(original,
    Date.now() + FAR_DEADLINE_MS, async (service) => {
      activated.push(service);
      if (activated.length === 1) {
        // The install got to the lifecycle lane first.
        const episode = await stopForInstall(node, service);
        setImmediate(() => episode.recreate());
        throw notRegistered();
      }
    });
  assert.equal(active, node.held());
  assert.deepEqual(activated, [original, node.held()],
    'refused on the stopped service, then written for its replacement');
  const second = node.held();
  await (await stopForInstall(node, second)).recreate();
  assert.equal(node.owner.continuationOf(original), node.held(),
    'the continuation follows every later install');
  assert.notEqual(node.held(), second);
});

test('an activation refusal that no install explains, and any other ' +
  'failure, are the create\'s own', async (t) => {
  const node = await hostedNode(t);
  await assert.rejects(node.owner.activateContinuation(node.service,
    Date.now() + FAR_DEADLINE_MS, async () => {
      throw notRegistered();
    }), {code: REPLICA_ACTIVATION_HANDLER_NOT_REGISTERED});
  await assert.rejects(node.owner.activateContinuation(node.service,
    Date.now() + FAR_DEADLINE_MS, async () => {
      throw new Error('the control plane refused the write');
    }), /the control plane refused the write/u);
});

test('a create does not continue with a replica that was claimed, or ' +
  'that is not back at its deadline', async (t) => {
  const node = await hostedNode(t, async () => {
    throw new Error('the factory could not open the replica');
  });
  const recreation = await (await stopForInstall(node)).recreate();
  assert.equal(recreation.state, RECREATION.PENDING);
  const neverActivated = async () => assert.fail('a stopped replica is not activated');
  await assert.rejects(node.owner.activateContinuation(node.service,
    Date.now() + 30, neverActivated),
  {code: ERROR_CODE.REPLICA_NOT_BACK_FROM_INSTALL});
  const waiting = node.owner.activateContinuation(node.service,
    Date.now() + FAR_DEADLINE_MS, neverActivated);
  await node.owner.claimForCleanup(REPLICA_ID);
  await assert.rejects(waiting, (error) => {
    assert.equal(error.code, ERROR_CODE.REPLICA_NOT_BACK_FROM_INSTALL);
    assert.deepEqual({state: error.recreation.state, claim: error.recreation.claim},
      {state: STATE.CLAIMED, claim: CLAIM.CLEANUP});
    return true;
  });
});


test('factory completion after simultaneous claims retains product before release awaits', async (t) => {
  const node = await hostedNode(t);
  const opening = Promise.withResolvers(); const finishOpen = Promise.withResolvers();
  const releasing = Promise.withResolvers(); const finishRelease = Promise.withResolvers();
  let product;
  node.open = async (options) => {
    product = standIn({...options, async shutdown() {
      this.shutdowns++;
      releasing.resolve();
      await finishRelease.promise;
    }});
    opening.resolve();
    await finishOpen.promise;
    return product;
  };
  const recreating = (await stopForInstall(node)).recreate();
  await opening.promise;
  let settled = false;
  const removal = node.owner.claimForRemoval(REPLICA_ID);
  const cleanup = node.owner.claimForCleanup(REPLICA_ID).then(() => {
    settled = true;
  });
  finishOpen.resolve();
  await releasing.promise;
  assert.equal(settled, false, 'claim settlement waits for factory continuation');
  assert.equal(node.replicaHandler.pendingRuntimeShutdowns.has(product), true,
    'unpublished object has custody before awaiting shutdown');
  assert.equal(node.held(), node.service, 'late product cannot publish');
  finishRelease.resolve();
  assert.equal(await removal, node.service, 'removal retains predecessor for consensus exit');
  await cleanup;
  await recreating;
  assert.equal(product.shutdowns, 1, 'claimants do not duplicate release');
  assert.equal(node.replicaHandler.pendingRuntimeShutdowns.size, 0);
});

test('failed unpublished product must release before recreation opens again', async (t) => {
  let opens = 0;
  let fail = true;
  let product;
  const node = await hostedNode(t, async () => {
    opens++;
    product = standIn({async shutdown() {
      if (fail) throw new Error('retained product still open');
      this.isShutdown = true;
    }});
    return product;
  });
  const register = node.replicaHandler.replaceLocalReplicaService;
  node.replicaHandler.replaceLocalReplicaService = () => {
    throw new Error('registration refused');
  };
  const episode = await stopForInstall(node);
  await episode.recreate();
  node.replicaHandler.replaceLocalReplicaService = register;
  await episode.recreate();
  assert.equal(opens, 1, 'retained release debt forbids another acquisition');
  assert.equal(node.replicaHandler.pendingRuntimeShutdowns.has(product), true);
  fail = false;
  await episode.recreate();
  assert.equal(opens, 2);
  assert.equal(node.record().state, STATE.RUNNING);
});
