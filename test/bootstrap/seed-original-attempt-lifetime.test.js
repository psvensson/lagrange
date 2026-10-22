// BootstrapService -> allocation preparation -> creation catalog/phase ->
// actual SQLite/native opening. Directory custody, membership, boot identity,
// build measurement, transport and replica services are their real owners.
// Only pacing is controlled in the abort/shutdown tests. Deferred native
// construction proves this checkpoint, not registration or useful service.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import Database from 'better-sqlite3';
import {BootstrapService} from '../../src/bootstrap/bootstrap-service.js';
import {reserveBootIncarnation} from '../../src/bootstrap/boot-incarnation-owner.js';
import {resolveAutoRejoinStartupDecision} from '../../src/bootstrap/rejoin-hints.js';
import {readDurableServicesIdentitySnapshot} from
  '../../src/bootstrap/rejoin-hints-durable-evidence.js';
import {originalSeedAnchor} from
  '../../src/bootstrap/seed-original-allocation-declaration.js';
import {INITIAL_MESSAGE_GROUP_ID, INITIAL_MESSAGE_GROUP_REPLICA_IDS,
  INITIAL_PARTITION_IDS, SYSTEM_TABLE_NAME, SYSTEM_TABLE_SCHEMAS,
  getInitialReplicaIds} from '../../src/bootstrap/system-table-schemas-constants.js';
import {ConfigurationManager} from '../../src/config/configuration-manager.js';
import {LoggingService} from '../../src/logging/logging-service.js';
import {NodeService} from '../../src/node/node-service.js';
import {ServiceThreadManager} from '../../src/threading/service-thread-manager.js';
import {DataDirectoryManager, getMessageGroupDbPath} from
  '../../src/storage/data-directory-manager.js';
import {acquireDataDirectoryProcessOwner} from
  '../../src/storage/data-directory-process-owner.js';
import {MessageRouter} from '../../src/transport/message-router.js';
import {ADDRESS, ENTITY_TYPE, SERVICE_TYPE, SERVICE_LIFECYCLE_STATE} from
  '../../src/constants/index.js';
import {setActualCoreEntryObserver} from '../../src/raft/raft-rs-runtime-owner.js';
import {originalAllocationRow} from '../../src/raft/raft-rs-original-allocation-store.js';
import {ORIGINAL_ALLOCATION as STATE, ORIGINAL_ALLOCATION_REASON as REASON,
  ORIGINAL_ALLOCATION_COLUMN as COLUMN, REPLICA_LIFECYCLE_TABLE} from
  '../../src/raft/raft-rs-original-allocation-constants.js';
import {RAFT_RS_OPENING_HISTORY as HISTORY} from
  '../../src/raft/raft-rs-opening-history-constants.js';

const NODE_ID = 'original-startup-node';
const NODE_ADDRESS = 'http://127.0.0.1:18081';
const hold = (reason) => (error) => error?.code === STATE.HOLD && error.reason === reason;

async function fixture(t, overrides = {}, {withRouter = true} = {}) {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'seed-original-lifetime-'));
  const directoryOwner = acquireDataDirectoryProcessOwner(dataDir);
  const services = [];
  const controller = new AbortController();
  const entries = [];
  const threadManager = new ServiceThreadManager();
  const nodeService = new NodeService({threadManager});
  t.after(async () => {
    setActualCoreEntryObserver(null);
    const failures = [];
    for (const service of services.reverse()) {
      try {
        await service.shutdown();
      } catch (error) {
        failures.push(error);
      }
    }
    try {
      await nodeService.shutdown();
      await threadManager.shutdown();
    } catch (error) {
      failures.push(error);
    }
    if (failures.length > 0) {
      throw new AggregateError(failures, `startup cleanup failed; retained ${dataDir}`);
    }
    directoryOwner.release();
    fs.rmSync(dataDir, {recursive: true, force: true});
  });
  ConfigurationManager.resetInstance();
  LoggingService.resetInstance();
  ConfigurationManager.getInstance().initialize({node: {id: NODE_ID},
    storage: {dataDir}, logging: {level: 'fatal'}});
  LoggingService.getInstance().initialize({level: 'fatal'});
  const dataDirectoryManager = new DataDirectoryManager();
  dataDirectoryManager.initialize();
  threadManager.initialize({minThreads: 1, maxThreads: 1});
  nodeService.initialize({nodeId: NODE_ID, nodeAddress: NODE_ADDRESS,
    autoTransitionLifecycle: false});
  setActualCoreEntryObserver((entry) => entries.push(entry));
  const createService = async (extra = {}) => {
    const bootIncarnation = await reserveBootIncarnation(dataDir);
    const decision = await resolveAutoRejoinStartupDecision({dataDir,
      nodeId: NODE_ID, nodeAddress: NODE_ADDRESS});
    const startupServicesAdmission = await readDurableServicesIdentitySnapshot(dataDir);
    const service = new BootstrapService({nodeId: NODE_ID, nodeAddress: NODE_ADDRESS,
      bootIncarnation, nodeService, dataDirectoryManager,
      dataDirectoryProcessOwner: directoryOwner, startupAbortSignal: controller.signal,
      membershipOwnerOutcome: decision.membershipOwnerOutcome,
      startupServicesAdmission, ...extra});
    services.push(service);
    if (withRouter) {
      service.messageRouter = new MessageRouter({nodeId: NODE_ID,
        nodeAddress: NODE_ADDRESS, bootIncarnation});
      service.transport = service.messageRouter;
    }
    service.systemTableCache = nodeService.getSystemTableCache();
    return service;
  };
  return {dataDir, directoryOwner, dataDirectoryManager, controller, entries,
    createService, service: await createService(overrides)};
}

function replicaOptions(f, serviceType) {
  const messageGroup = serviceType === SERVICE_TYPE.MESSAGE_GROUP;
  const tableName = SYSTEM_TABLE_NAME.SERVICES;
  const groupId = messageGroup ? INITIAL_MESSAGE_GROUP_ID : INITIAL_PARTITION_IDS[tableName];
  const replicaIds = messageGroup ? [...INITIAL_MESSAGE_GROUP_REPLICA_IDS] :
    getInitialReplicaIds(tableName);
  const replicaId = replicaIds[0];
  const entity = messageGroup ? ENTITY_TYPE.MESSAGE_GROUP : ENTITY_TYPE.PARTITION;
  return {serviceType, replicaId, replicaIds, replicaIndex: 0,
    peerAddresses: replicaIds.map((id) => [NODE_ID, entity, id].join(ADDRESS.SEPARATOR)),
    deferElection: true, createDelayMs: 0,
    ...(messageGroup ? {groupId,
      dbPath: getMessageGroupDbPath(f.dataDir, groupId, replicaId)} :
      {partitionId: groupId, tableName,
        schema: SYSTEM_TABLE_SCHEMAS.find((schema) => schema.tableName === tableName),
        dbPath: f.dataDirectoryManager.getPartitionDbPath(groupId, replicaId)})};
}

function queueReplica(f, options) {
  const phase = f.service.seedInfrastructurePhase;
  const definition = phase.createBootstrapServiceDescriptor(options.serviceType, options.replicaId);
  phase.queueBootstrapServiceReplica(definition, options);
  return {definition};
}

function readRow(member) {
  const db = new Database(member.dbPath, {readonly: true, fileMustExist: true});
  try {
    return originalAllocationRow(db, member);
  } finally {
    db.close();
  }
}

function declarationOf(f) {
  const anchor = originalSeedAnchor(f.dataDir);
  const db = new Database(anchor.dbPath, {readonly: true, fileMustExist: true});
  try {
    const row = db.prepare(`SELECT ${COLUMN.DECLARATION} FROM ${REPLICA_LIFECYCLE_TABLE}
      WHERE group_id = ? AND peer_id = ? AND replica_identity = ?`)
      .get(anchor.groupId, anchor.peerId, anchor.replicaId);
    return JSON.parse(row[COLUMN.DECLARATION]);
  } finally {
    db.close();
  }
}

function memberOf(f, options) {
  return declarationOf(f).members.find((member) => member.replicaId === options.replicaId);
}

test('BootstrapService prepares one live original attempt before either creation catalog mutates',
  async (t) => {
    const f = await fixture(t);
    const options = replicaOptions(f, SERVICE_TYPE.MESSAGE_GROUP);
    assert.throws(() => queueReplica(f, options), hold(REASON.AUTHORITY));
    assert.equal(f.service.bootstrapDesiredServiceDefinitions.size, 0);
    assert.equal(f.service.bootstrapReplicaOptionsByServiceId.size, 0);
    assert.equal(fs.existsSync(originalSeedAnchor(f.dataDir).dbPath), false);

    await Promise.all([
      f.service.prepareOriginalSeedAttempt(), f.service.prepareOriginalSeedAttempt(),
    ]);
    const preparation = f.service.originalAllocationPreparation;
    const declaration = declarationOf(f);
    await f.service.prepareOriginalSeedAttempt();
    assert.equal(f.service.originalAllocationPreparation, preparation);
    assert.deepEqual(declarationOf(f), declaration,
      'retry preserves the original births and rights');
    assert.deepEqual(preparation.observeResources(), [], 'preparation releases all SQLite handles');
    queueReplica(f, options);
    const admitted = f.service.bootstrapReplicaOptionsByServiceId.get(options.replicaId);
    assert.ok(Object.isFrozen(admitted));
    assert.ok(Object.isFrozen(admitted.replicaIds));
    assert.ok(Object.isFrozen(admitted.peerAddresses));
    assert.equal(admitted.originalAllocationOpening, preparation.openingFor(options.replicaId));
    assert.deepEqual(f.entries, [], 'queue admission alone performs no native work');
  });

test('BootstrapService admission binds exact original identity, peer mapping ' +
  'and deferred participation',
async (t) => {
  const f = await fixture(t);
  await f.service.prepareOriginalSeedAttempt();
  const options = replicaOptions(f, SERVICE_TYPE.MESSAGE_GROUP);
  for (const changed of [
    {groupId: 'unrelated-group'}, {serviceType: SERVICE_TYPE.PARTITION},
    {dbPath: path.join(f.dataDir, 'other.db')}, {replicaIds: [options.replicaId]},
    {peerAddresses: options.peerAddresses.map((address) => `wrong-${address}`)},
    {originalAllocationOpening: {}},
  ]) {
    assert.throws(() => queueReplica(f, {...options, ...changed}), hold(REASON.IDENTITY));
    assert.equal(f.service.bootstrapDesiredServiceDefinitions.size, 0);
    assert.equal(f.service.bootstrapReplicaOptionsByServiceId.size, 0);
  }
  assert.throws(() => queueReplica(f, {...options, deferElection: false}),
    hold(REASON.CONTINUATION_UNAVAILABLE));
  const admitted = f.service.admitOriginalSeedReplica(options);
  assert.equal(admitted.originalAllocationOpening,
    f.service.originalAllocationPreparation.openingFor(options.replicaId));
  assert.deepEqual(f.entries, []);
});

test('BootstrapService abort during build measurement cannot prepare an original allocation',
  async (t) => {
    const f = await fixture(t);
    const preparation = f.service.prepareOriginalSeedAttempt();
    f.controller.abort();
    await assert.rejects(preparation, hold(REASON.CLOSED));
    assert.equal(fs.existsSync(originalSeedAnchor(f.dataDir).dbPath), false);
    assert.equal(f.service.bootstrapDesiredServiceDefinitions.size, 0);
    assert.deepEqual(f.entries, []);
  });

test('SeedInfrastructurePhase requires an original attempt before lifecycle or listener setup',
  async (t) => {
    const f = await fixture(t, {wsPort: 18082}, {withRouter: false});
    const phase = f.service.seedInfrastructurePhase;
    await assert.rejects(phase.phaseInfrastructure(), hold(REASON.AUTHORITY));
    assert.equal(f.service.messageRouter, null);
    assert.equal(f.service.serviceLifecycleManager, null);
    assert.equal(f.service.serviceReconciler, null);

    await f.service.prepareOriginalSeedAttempt();
    await phase.phaseInfrastructure();
    const router = f.service.messageRouter;
    assert.ok(router instanceof MessageRouter);
    assert.equal(f.service.transport, router);
    assert.equal(router.server, null, 'a configured wsPort does not open a public listener');
    assert.equal(router.hasSelfConnection(), false);
    assert.equal(router.isExternalAdmissionEnabled(), false);
    assert.ok(f.service.serviceLifecycleManager);
    assert.ok(f.service.serviceReconciler);
    assert.deepEqual(f.entries, []);
  });

test('BootstrapService queue carries one opaque opening into actual native ' +
  'message-group and partition creation',
async (t) => {
  const f = await fixture(t);
  await f.service.prepareOriginalSeedAttempt();
  const group = replicaOptions(f, SERVICE_TYPE.MESSAGE_GROUP);
  const partition = replicaOptions(f, SERVICE_TYPE.PARTITION);
  const createdGroup = await f.service.seedMessageGroupsPhase.createBootstrapMessageGroupReplica(
    queueReplica(f, group));
  const createdPartition = await f.service.seedPartitionsPhase.createBootstrapPartitionReplica(
    queueReplica(f, partition));
  assert.equal(createdGroup.status, SERVICE_LIFECYCLE_STATE.CREATED);
  assert.equal(createdPartition.status, SERVICE_LIFECYCLE_STATE.CREATED);
  for (const [options, runtime] of [
    [group, f.service.messageGroupServices.get(group.replicaId)],
    [partition, f.service.partitionServices.get(partition.replicaId)],
  ]) {
    const member = memberOf(f, options);
    assert.ok(runtime.db instanceof Database);
    assert.equal(runtime.raft.readStatus().outcome, 'CORE_OK');
    assert.equal(runtime.electionStarted, false);
    const admitted = f.service.bootstrapReplicaOptionsByServiceId.get(options.replicaId);
    assert.equal(runtime.originalAllocationOpening, admitted.originalAllocationOpening);
    assert.equal(readRow(member).native_history_state, HISTORY.ESTABLISHED);
    assert.equal(readRow(member)[COLUMN.SERVICE_RIGHT], STATE.UNUSED);
    assert.ok(f.entries.some((entry) =>
      entry.groupId === member.groupId && entry.operation === 'create_node'));
  }
  assert.equal(readRow(memberOf(f, partition))[COLUMN.IDENTITY_RIGHT], STATE.UNUSED);
});

test('direct message-group creation cannot bypass BootstrapService attempt ownership',
  async (t) => {
    const f = await fixture(t);
    const options = replicaOptions(f, SERVICE_TYPE.MESSAGE_GROUP);
    const create = () => f.service.seedMessageGroupsPhase.createBootstrapMessageGroupReplica(
      {replicaOptions: options});
    await assert.rejects(create(), hold(REASON.AUTHORITY));
    assert.equal(fs.existsSync(options.dbPath), false);
    assert.equal(f.service.messageGroupServices.size, 0);
    assert.deepEqual(f.entries, []);
    await f.service.prepareOriginalSeedAttempt();
    assert.equal((await create()).status, SERVICE_LIFECYCLE_STATE.CREATED);
    const runtime = f.service.messageGroupServices.get(options.replicaId);
    assert.equal(runtime.raft.readStatus().outcome, 'CORE_OK');
    assert.equal(readRow(memberOf(f, options)).native_history_state, HISTORY.ESTABLISHED);
  });

for (const serviceType of [SERVICE_TYPE.MESSAGE_GROUP, SERVICE_TYPE.PARTITION]) {
  test(`${serviceType} creator rechecks the original attempt after its stagger await`,
    async (t) => {
      const f = await fixture(t);
      await f.service.prepareOriginalSeedAttempt();
      const options = {...replicaOptions(f, serviceType), createDelayMs: 1};
      const context = queueReplica(f, options);
      const entered = Promise.withResolvers();
      const resume = Promise.withResolvers();
      t.mock.method(f.service, 'sleep', async () => {
        entered.resolve();
        await resume.promise;
      });
      const creation = serviceType === SERVICE_TYPE.MESSAGE_GROUP ?
        f.service.seedMessageGroupsPhase.createBootstrapMessageGroupReplica(context) :
        f.service.seedPartitionsPhase.createBootstrapPartitionReplica(context);
      const settlement = Promise.allSettled([creation]);
      try {
        await Promise.race([entered.promise, creation.then(() => {
          assert.fail('creation completed without the requested stagger');
        })]);
        f.controller.abort();
        assert.throws(() => f.service.originalAllocationPreparation.assertCurrent(),
          hold(REASON.CLOSED));
      } finally {
        resume.resolve();
      }
      const [result] = await settlement;
      assert.equal(result.status, 'rejected');
      assert.ok(hold(REASON.CLOSED)(result.reason));
      assert.equal(f.service.messageGroupServices.size, 0);
      assert.equal(f.service.partitionServices.size, 0);
      assert.deepEqual(f.entries, [], 'revocation precedes the actual native construction');
      assert.equal(readRow(memberOf(f, options)).native_history_state, HISTORY.NEVER_OPENED);
    });
}

test('BootstrapService shutdown revokes original authority before its first event-loop yield',
  async (t) => {
    const f = await fixture(t);
    await f.service.prepareOriginalSeedAttempt();
    const resume = Promise.withResolvers();
    t.mock.method(f.service, 'yieldEventLoopTurn', () => resume.promise);
    const shutdown = f.service.shutdown();
    try {
      assert.throws(() => f.service.originalAllocationPreparation.assertCurrent(),
        hold(REASON.CLOSED));
      assert.throws(() => queueReplica(f, replicaOptions(f, SERVICE_TYPE.MESSAGE_GROUP)),
        hold(REASON.CLOSED));
    } finally {
      resume.resolve();
      await shutdown;
    }
    assert.deepEqual(f.service.originalAllocationPreparation.observeResources(), []);
    assert.deepEqual(f.entries, []);
  });

test('SeedCleanupHandler failure cleanup revokes original authority before yielding', async (t) => {
  const f = await fixture(t);
  await f.service.prepareOriginalSeedAttempt();
  const cleanup = f.service.seedCleanupHandler.handleBootstrapFailure(new Error('attempt failed'));
  try {
    assert.throws(() => f.service.originalAllocationPreparation.assertCurrent(),
      hold(REASON.CLOSED));
  } finally {
    await cleanup;
  }
  const failure = await cleanup;
  assert.equal(failure.success, false);
  assert.deepEqual(f.service.originalAllocationPreparation.observeResources(), []);
  assert.deepEqual(f.entries, []);
});

for (const [name, override, reason] of [
  ['directory custody', {dataDirectoryProcessOwner: null}, REASON.DIRECTORY],
  ['membership authority', {membershipOwnerOutcome: null}, REASON.AUTHORITY],
]) {
  test(`direct BootstrapService.bootstrap refuses missing ${name} before creating original work`,
    async (t) => {
      const f = await fixture(t, override);
      const result = await f.service.bootstrap();
      assert.equal(result.success, false);
      assert.ok(hold(reason)(result.cause));
      assert.equal(fs.existsSync(originalSeedAnchor(f.dataDir).dbPath), false);
      assert.equal(f.service.bootstrapDesiredServiceDefinitions.size, 0);
      assert.equal(f.service.messageGroupServices.size, 0);
      assert.equal(f.service.partitionServices.size, 0);
      assert.deepEqual(f.entries, []);
    });
}

test('a later BootstrapService attempt holds a retained declaration ' +
  'without a real history classifier',
async (t) => {
  const f = await fixture(t);
  await f.service.prepareOriginalSeedAttempt();
  const anchor = memberOf(f, replicaOptions(f, SERVICE_TYPE.PARTITION));
  const before = readRow(anchor);
  await f.service.shutdown();
  const later = await f.createService();
  await assert.rejects(later.prepareOriginalSeedAttempt(),
    hold(REASON.CLASSIFICATION_UNAVAILABLE));
  assert.throws(() => later.assertOriginalSeedAttempt(), hold(REASON.CLOSED));
  assert.deepEqual(readRow(anchor), before,
    'inspection preserves original births, rights and history');
  assert.deepEqual(later.originalAllocationPreparation.observeResources(), []);
  assert.deepEqual(f.entries, []);
});

test('BootstrapService continuation entry points hold elections, registration and public admission ' +
  'while preserving original rights',
async (t) => {
  const f = await fixture(t, {wsPort: 18082}, {withRouter: false});
  await f.service.prepareOriginalSeedAttempt();
  await f.service.seedInfrastructurePhase.phaseInfrastructure();
  const anchor = memberOf(f, replicaOptions(f, SERVICE_TYPE.PARTITION));
  const before = readRow(anchor);
  const phase = f.service.phase;
  const checks = [
    ['startDeferredBootstrapReplicaElections', () =>
      f.service.seedPartitionsPhase.startDeferredBootstrapReplicaElections()],
    ['phaseRegistration', () => f.service.seedRegistrationPhase.phaseRegistration()],
    ['ensureSystemTableWriter', () => f.service.seedRegistrationPhase.ensureSystemTableWriter()],
    ['startWebSocketServer', () => f.service.startWebSocketServer()],
    ['openExternalTransportAdmission', () => f.service.openExternalTransportAdmission()],
    ['completeSuccessfulBootstrap', () => f.service.completeSuccessfulBootstrap()],
  ];
  for (const [name, invoke] of checks) {
    await assert.rejects(async () => invoke(), hold(REASON.CONTINUATION_UNAVAILABLE), name);
    assert.deepEqual(readRow(anchor), before, `${name} preserves the durable original rights`);
    assert.equal(f.service.systemTableWriter, null);
    assert.equal(f.service.phase, phase);
    assert.equal(f.service.messageRouter.server, null);
    assert.equal(f.service.messageRouter.hasSelfConnection(), false);
    assert.equal(f.service.messageRouter.isExternalAdmissionEnabled(), false);
  }
  assert.deepEqual(f.entries, []);
});
