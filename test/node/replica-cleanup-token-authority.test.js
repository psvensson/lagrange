/**
 * cleanup_token is the canonical durable generation of cleanup ownership.
 *
 * The seven permanent proofs (owner decision D2, 2026-09-29):
 *   P1 the token is durably attached to the canonical services.service_id;
 *   P2 creation and cleanup contend on that one identity;
 *   P3 only the exact token holder performs destructive cleanup;
 *   P4 an old token cannot delete a later recreation's artifacts;
 *   P5 a same-token replay is idempotent;
 *   P6 an invented token fails closed;
 *   P7 lost cleanup outcomes resolve by authoritative token/state observation.
 */
import {test} from '../../src/test-helpers/tap.js';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {ConfigurationManager} from '../../src/config/configuration-manager.js';
import {LoggingService} from '../../src/logging/logging-service.js';
import {ReplicaHandler} from '../../src/node/replica-handler.js';
import {ReplicaStateMachine} from '../../src/node/replica-state-machine.js';
import {
  REPLICA_CLEANUP_ACQUIRE_OUTCOME,
  REPLICA_CLEANUP_ERROR_CODE,
  ReplicaCleanupTombstoneOwner,
} from '../../src/node/replica-cleanup-tombstone-owner.js';
import {
  createLifecycleServiceRow,
  createLifecycleStateStore,
} from '../test-helpers/lifecycle-state-store.js';

const SERVICES = 'services';
const NODE_ID = 'cleanup-node';
const PARTITION_ID = 'partition-1';

function initializeEnvironment() {
  ConfigurationManager.resetInstance();
  LoggingService.resetInstance();
  ConfigurationManager.getInstance().initialize({});
  LoggingService.getInstance().initialize({level: 'error'});
}

function cleanupOwner(store, token, now = 100) {
  return new ReplicaCleanupTombstoneOwner({
    gateway: store.gateway,
    now: () => now,
    randomUUID: () => token,
  });
}

function acquireFor(owner, replicaId) {
  return owner.acquire({replicaId, partitionId: PARTITION_ID,
    nodeId: NODE_ID, reason: 'token-proof'});
}

function liveRow(replicaId, version) {
  return createLifecycleServiceRow({replicaId, status: 'active', version,
    partitionId: PARTITION_ID, nodeId: NODE_ID});
}

function storageFixture(t, replicaId, contents) {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cleanup-token-'));
  t.teardown(() => fs.rmSync(dataDir, {recursive: true, force: true}));
  const dbDir = path.join(dataDir, 'partitions', PARTITION_ID);
  fs.mkdirSync(dbDir, {recursive: true});
  const dbPath = path.join(dbDir, `${replicaId}.db`);
  fs.writeFileSync(dbPath, contents);
  return {dataDir, dbPath};
}

function storageHandler(store, dataDir) {
  return new ReplicaHandler({
    nodeId: NODE_ID,
    dataDir,
    systemTableCache: store.cache,
    cdcIntegrationService: {},
    controlPlaneSystemTableGateway: store.gateway,
    replicaStateMachine: new ReplicaStateMachine({nodeId: NODE_ID,
      systemTableCache: store.cache,
      controlPlaneSystemTableGateway: store.gateway}),
    createPartitionService: async () => ({}),
    executorOutcomeEmitter: {emitOutcome: () => {}},
  });
}

test('P1+P2 the token lives on services.service_id and contends with creation',
  async (t) => {
    initializeEnvironment();
    const store = createLifecycleStateStore();
    const acquired = await acquireFor(cleanupOwner(store, 'token-a'), 'r1');
    t.equal(acquired.outcome, REPLICA_CLEANUP_ACQUIRE_OUTCOME.ACQUIRED);
    const durable = store.durable[SERVICES].get('r1');
    t.equal(durable.service_id, 'r1', 'P1 keyed by the canonical service_id');
    t.equal(durable.cleanup_token, 'token-a', 'P1 the token is durable');
    t.equal(acquired.authority.ownerToken, 'token-a');

    const contender = await acquireFor(cleanupOwner(store, 'token-b'), 'r1');
    t.equal(contender.outcome, REPLICA_CLEANUP_ACQUIRE_OUTCOME.OWNED,
      'P2 a second cleanup loses on the same identity');
    t.equal(store.durable[SERVICES].get('r1').cleanup_token, 'token-a');

    store.durable[SERVICES].set('r2', liveRow('r2', 300));
    const blocked = await acquireFor(cleanupOwner(store, 'token-c'), 'r2');
    t.equal(blocked.outcome, REPLICA_CLEANUP_ACQUIRE_OUTCOME.LIVE_GENERATION,
      'P2 a live generation on the identity blocks cleanup');
    t.equal(store.durable[SERVICES].get('r2').status, 'active');
  });

test('P3+P6 only the exact token holder deletes; an invented token fails closed',
  async (t) => {
    initializeEnvironment();
    const store = createLifecycleStateStore();
    const owner = cleanupOwner(store, 'token-real');
    const {authority} = await acquireFor(owner, 'r3');
    const invented = Object.freeze({...authority, ownerToken: 'invented'});
    const mutationsBefore = store.mutations.length;

    t.equal(await owner.requireCurrent(invented), false,
      'P6 an invented token is never current');
    t.equal(await owner.release(invented, {artifactsAbsent: true}), false,
      'P6 an invented token cannot release the tombstone');
    t.equal(store.mutations.length, mutationsBefore,
      'P6 no durable mutation is attempted');
    t.equal(store.durable[SERVICES].get('r3').cleanup_token, 'token-real');

    const {dataDir, dbPath} = storageFixture(t, 'r3', 'owned');
    await t.rejects(storageHandler(store, dataDir)
      .cleanupReplicaResources(PARTITION_ID, 'r3', invented),
    /ownership changed/u, 'P3 destructive cleanup revalidates the token');
    t.ok(fs.existsSync(dbPath), 'P3 storage survives a non-holder');
    t.equal(await owner.requireCurrent(authority), true,
      'P3 the exact holder remains current');
  });

test('P4+P5 an old token cannot touch a recreation; same-token replay is idempotent',
  async (t) => {
    initializeEnvironment();
    const store = createLifecycleStateStore();
    const oldOwner = cleanupOwner(store, 'token-old', 100);
    const {authority: oldAuthority} = await acquireFor(oldOwner, 'r4');
    t.equal(await oldOwner.release(oldAuthority, {artifactsAbsent: true}),
      true, 'the holder releases once storage is absent');
    const mutationsAfterRelease = store.mutations.length;
    t.equal(await oldOwner.release(oldAuthority, {artifactsAbsent: true}),
      false, 'P5 a replayed release reports nothing further to release');
    t.equal(store.mutations.length, mutationsAfterRelease,
      'P5 the replay submits no second destructive mutation');

    const newOwner = cleanupOwner(store, 'token-new', 200);
    const {authority: newAuthority} = await acquireFor(newOwner, 'r4');
    t.equal(await oldOwner.release(oldAuthority, {artifactsAbsent: true}),
      false, 'P4 the old token cannot release the later cleanup generation');
    t.equal(store.durable[SERVICES].get('r4').cleanup_token, 'token-new');
    const {dataDir, dbPath} = storageFixture(t, 'r4', 'recreated');
    await t.rejects(storageHandler(store, dataDir)
      .cleanupReplicaResources(PARTITION_ID, 'r4', oldAuthority),
    /ownership changed/u);
    t.ok(fs.existsSync(dbPath), 'P4 recreated artifacts survive the old token');
    t.equal(await newOwner.requireCurrent(newAuthority), true);
  });

test('P7 lost cleanup outcomes resolve by authoritative token observation',
  async (t) => {
    initializeEnvironment();
    const store = createLifecycleStateStore();
    store.setNextMutationBehavior({lostAcknowledgement: true});
    const owner = cleanupOwner(store, 'token-lost');
    const acquired = await acquireFor(owner, 'r5');
    t.equal(acquired.outcome, REPLICA_CLEANUP_ACQUIRE_OUTCOME.ACQUIRED,
      'durable acquire with a lost ack is recognised by its token');

    store.setNextMutationBehavior({unavailable: true});
    const notDurable = await acquireFor(cleanupOwner(store, 'token-x'), 'r6');
    t.equal(notDurable.authority, null, 'an unapplied acquire invents nothing');
    t.equal(store.durable[SERVICES].has('r6'), false);

    store.setNextMutationBehavior({unavailable: true});
    await t.rejects(owner.release(acquired.authority, {artifactsAbsent: true}),
      {code: REPLICA_CLEANUP_ERROR_CODE.CLEANUP_OWNER_DEFERRED},
      'an unapplied release with an unknown outcome stays owned debt');
    t.equal(store.durable[SERVICES].get('r5').cleanup_token, 'token-lost');

    store.setNextMutationBehavior({lostAcknowledgement: true});
    t.equal(await owner.release(acquired.authority, {artifactsAbsent: true}),
      true, 'a durable release with a lost ack resolves by observed absence');
    t.equal(store.durable[SERVICES].has('r5'), false);

    store.durable[SERVICES].set('r7', createLifecycleServiceRow({
      replicaId: 'r7', status: 'removing', version: 400,
      partitionId: PARTITION_ID, nodeId: NODE_ID}));
    store.setNextMutationBehavior({lostAcknowledgement: true});
    const takeover = await cleanupOwner(store, 'token-takeover', 500)
      .takeoverRemoving({
        replicaState: {serviceId: 'r7', partitionId: PARTITION_ID,
          nodeId: NODE_ID},
        durableVersionColumn: 'state_entered_at',
        durableVersion: 400,
      }, 'token-proof');
    t.equal(takeover.ownerToken, 'token-takeover',
      'a durable takeover with a lost ack is recognised by its token');
  });
