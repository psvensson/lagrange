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
    assert.ok(!router.hasSelfConnection());
    assert.equal(router.nodeConnections.has(router.nodeId), false);
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
    assert.ok(!f.service.messageRouter.hasSelfConnection());
    assert.equal(
      f.service.messageRouter.nodeConnections.has(f.service.messageRouter.nodeId),
      false,
    );
    assert.equal(f.service.messageRouter.isExternalAdmissionEnabled(), false);
  }
  assert.deepEqual(f.entries, []);
});

// Additional acquisition and late-completion witnesses. The original first
// 14 cases remain preserved in commits 3fa20cef and 7fa4d79. Four self-connection
// oracles in this revised file follow the existing falsy predicate contract
// and additionally require exact absence of the self-node connection entry.
import {MessageGroupService} from '../../src/message-group/message-group-service.js';
import {PartitionService} from '../../src/partition/partition-service.js';
import {ServiceReconciler} from '../../src/service/service-reconciler.js';
import {RAFT_OPERATION_OUTCOME} from '../../src/raft/raft-operation-port-constants.js';

function pausedWorkEntered(entered, work) {
  return Promise.race([entered.promise, work.then(() => {
    assert.fail('the actual owner completed without reaching its controlled await');
  })]);
}

async function assertShutdownJoins(shutdown) {
  let settled = false;
  shutdown.then(() => {
    settled = true;
  }, () => {
    settled = true;
  });
  // Flush the real shutdown yield and its following microtasks without
  // releasing the acquisition. No elapsed-time success threshold is used.
  await new Promise((resolve) => setImmediate(resolve));
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(settled, false, 'shutdown must join the in-flight acquisition');
}

function assertNativeClosed(f, runtime, db, port, router, entityType, groupId) {
  assert.equal(db.open, false);
  assert.equal(port.readStatus().outcome, RAFT_OPERATION_OUTCOME.CORE_REFUSED);
  const address = [NODE_ID, entityType, runtime.replicaId].join(ADDRESS.SEPARATOR);
  assert.equal(router.getRegisteredHandler(address), null);
  assert.equal(f.entries.filter((entry) =>
    entry.groupId === groupId && entry.operation === 'free').length, 1,
  'the actual native group was freed exactly once');
}

test('message-group creator retains its exact native runtime when revocation wins initialize completion',
  async (t) => {
    let runtime;
    // A failing custody assertion must not leave an unowned native runtime
    // alive in the test process; this runs before the fixture releases its directory.
    t.after(async () => {
      if (runtime?.db?.open) await runtime.shutdown();
    });
    const f = await fixture(t);
    await f.service.prepareOriginalSeedAttempt();
    const options = replicaOptions(f, SERVICE_TYPE.MESSAGE_GROUP);
    const entered = Promise.withResolvers();
    const resume = Promise.withResolvers();
    const initialize = MessageGroupService.prototype.initialize;
    t.mock.method(MessageGroupService.prototype, 'initialize', async function(...args) {
      runtime = this;
      await Reflect.apply(initialize, this, args);
      entered.resolve();
      await resume.promise;
    });
    const creation = f.service.seedMessageGroupsPhase.createBootstrapMessageGroupReplica(
      queueReplica(f, options));
    const settled = Promise.allSettled([creation]);
    try {
      await pausedWorkEntered(entered, creation);
      assert.equal(runtime.raft.readStatus().outcome, RAFT_OPERATION_OUTCOME.CORE_OK);
      assert.equal(f.service.messageGroupServices.get(options.replicaId), runtime);
      f.controller.abort();
    } finally {
      resume.resolve();
    }
    const [result] = await settled;
    assert.equal(result.status, 'rejected');
    assert.ok(hold(REASON.CLOSED)(result.reason));
    assert.equal(f.service.messageGroupServices.get(options.replicaId), runtime);
    assert.equal(f.service.messageGroupReplicas.length, 0);
    const {db, raft: port} = runtime;
    const router = f.service.messageRouter;
    assert.equal(db.open, true, 'the rejected creator retains its acquired resource for cleanup');
    await f.service.shutdown();
    assert.equal(f.service.messageGroupServices.size, 0);
    assertNativeClosed(f, runtime, db, port, router, ENTITY_TYPE.MESSAGE_GROUP, options.groupId);
  });

test('partition creator distinguishes an initializing resource from the same settled valid runtime',
  async (t) => {
    let runtime;
    t.after(async () => {
      if (runtime?.db?.open) await runtime.shutdown();
    });
    const f = await fixture(t);
    await f.service.prepareOriginalSeedAttempt();
    const options = replicaOptions(f, SERVICE_TYPE.PARTITION);
    const context = queueReplica(f, options);
    const entered = Promise.withResolvers();
    const resume = Promise.withResolvers();
    const updateSize = PartitionService.prototype.updatePartitionSize;
    let paused = false;
    t.mock.method(PartitionService.prototype, 'updatePartitionSize', async function(...args) {
      await Reflect.apply(updateSize, this, args);
      if (paused) return;
      paused = true;
      runtime = this;
      entered.resolve();
      await resume.promise;
    });
    const create = () => f.service.seedPartitionsPhase.createBootstrapPartitionReplica(context);
    const creation = create();
    const settled = Promise.allSettled([creation]);
    try {
      await pausedWorkEntered(entered, creation);
      assert.equal(runtime.initialized, false);
      assert.equal(runtime.raft.readStatus().outcome, RAFT_OPERATION_OUTCOME.CORE_OK);
      assert.equal(f.service.partitionServices.get(options.replicaId), runtime);
      await assert.rejects(create(), hold(REASON.RESOURCE));
      assert.equal(f.service.partitionServices.get(options.replicaId), runtime);
    } finally {
      resume.resolve();
    }
    const [result] = await settled;
    assert.equal(result.status, 'fulfilled');
    assert.equal(result.value.status, SERVICE_LIFECYCLE_STATE.CREATED);
    assert.equal((await create()).status, SERVICE_LIFECYCLE_STATE.CREATED);
    assert.equal(f.service.partitionServices.get(options.replicaId), runtime);
    assert.equal(f.entries.filter((entry) => entry.operation === 'create_node').length, 1);
    const {db, raft: port} = runtime;
    const router = f.service.messageRouter;
    await f.service.shutdown();
    assertNativeClosed(f, runtime, db, port, router, ENTITY_TYPE.PARTITION, options.partitionId);
  });

test('partition initialization failure remains exact cleanup debt and refuses a successful CREATE retry',
  async (t) => {
    let runtime;
    t.after(async () => {
      if (runtime?.db?.open) await runtime.shutdown();
    });
    const f = await fixture(t);
    await f.service.prepareOriginalSeedAttempt();
    const options = replicaOptions(f, SERVICE_TYPE.PARTITION);
    const context = queueReplica(f, options);
    const failure = new Error('partition initialization size stage failed');
    const updateSize = PartitionService.prototype.updatePartitionSize;
    t.mock.method(PartitionService.prototype, 'updatePartitionSize', async function(...args) {
      runtime = this;
      await Reflect.apply(updateSize, this, args);
      throw failure;
    });
    const create = () => f.service.seedPartitionsPhase.createBootstrapPartitionReplica(context);
    await assert.rejects(create(), (error) => error === failure);
    assert.equal(f.service.partitionServices.get(options.replicaId), runtime);
    assert.equal(runtime.initialized, false);
    assert.equal(runtime.db.open, true);
    assert.equal(f.service.partitionReplicas.length, 0);
    await assert.rejects(create(), hold(REASON.RESOURCE));
    assert.equal(f.service.partitionServices.get(options.replicaId), runtime);
    assert.equal(f.entries.filter((entry) => entry.operation === 'create_node').length, 1);
    const {db, raft: port} = runtime;
    const router = f.service.messageRouter;
    await f.service.shutdown();
    assert.equal(f.service.partitionServices.size, 0);
    assertNativeClosed(f, runtime, db, port, router, ENTITY_TYPE.PARTITION, options.partitionId);
  });

test('original SERVICES admission pins canonical schema before queueing and actual SQLite DDL',
  async (t) => {
    const f = await fixture(t);
    await f.service.prepareOriginalSeedAttempt();
    const options = replicaOptions(f, SERVICE_TYPE.PARTITION);
    const canonical = structuredClone(options.schema);
    const changed = structuredClone(canonical);
    changed.columns[0].name = 'substituted_service_identity';
    assert.throws(() => queueReplica(f, {...options, schema: changed}), hold(REASON.IDENTITY));
    assert.equal(f.service.bootstrapDesiredServiceDefinitions.size, 0);
    assert.equal(f.service.bootstrapReplicaOptionsByServiceId.size, 0);
    const unopened = new Database(options.dbPath, {readonly: true, fileMustExist: true});
    try {
      assert.equal(unopened.prepare('SELECT name FROM sqlite_master WHERE name = ?')
        .get(SYSTEM_TABLE_NAME.SERVICES), undefined, 'schema refusal precedes system-table DDL');
    } finally {
      unopened.close();
    }
    assert.deepEqual(f.entries, []);

    const callerSchema = structuredClone(canonical);
    const context = queueReplica(f, {...options, schema: callerSchema});
    const admitted = f.service.bootstrapReplicaOptionsByServiceId.get(options.replicaId);
    callerSchema.columns[0].name = 'changed_after_queue';
    callerSchema.indices[0].columns[0] = 'changed_after_queue';
    assert.notEqual(admitted.schema, callerSchema);
    assert.deepEqual(admitted.schema, canonical);
    assert.ok(Object.isFrozen(admitted.schema));
    assert.ok(Object.isFrozen(admitted.schema.columns));
    assert.ok(Object.isFrozen(admitted.schema.columns[0]));
    assert.ok(Object.isFrozen(admitted.schema.indices[0].columns));
    const created = await f.service.seedPartitionsPhase.createBootstrapPartitionReplica(context);
    assert.equal(created.status, SERVICE_LIFECYCLE_STATE.CREATED);
    const runtime = f.service.partitionServices.get(options.replicaId);
    assert.equal(runtime.raft.readStatus().outcome, RAFT_OPERATION_OUTCOME.CORE_OK);
    assert.deepEqual(runtime.db.prepare(`PRAGMA table_info(${SYSTEM_TABLE_NAME.SERVICES})`)
      .all().map((column) => column.name), canonical.columns.map((column) => column.name));
  });

test('BootstrapService shutdown joins an acquired real router whose initialization is still pending',
  async (t) => {
    let router;
    t.after(async () => {
      if (router?.initialized) await router.shutdown();
    });
    const f = await fixture(t, {wsPort: 18082}, {withRouter: false});
    await f.service.prepareOriginalSeedAttempt();
    const entered = Promise.withResolvers();
    const resume = Promise.withResolvers();
    const initialize = MessageRouter.prototype.initialize;
    t.mock.method(MessageRouter.prototype, 'initialize', async function(...args) {
      router = this;
      entered.resolve();
      await resume.promise;
      return Reflect.apply(initialize, this, args);
    });
    const infrastructure = f.service.seedInfrastructurePhase.phaseInfrastructure();
    const initialized = Promise.allSettled([infrastructure]);
    let shutdown;
    try {
      await pausedWorkEntered(entered, infrastructure);
      assert.equal(f.service.messageRouter, router, 'custody precedes initialize completion');
      shutdown = f.service.shutdown();
      await assertShutdownJoins(shutdown);
    } finally {
      resume.resolve();
      await initialized;
      await shutdown;
    }
    const [result] = await initialized;
    assert.equal(result.status, 'rejected');
    assert.ok(hold(REASON.CLOSED)(result.reason));
    assert.equal(router.initialized, false);
    assert.equal(router.server, null);
    assert.ok(!router.hasSelfConnection());
    assert.equal(router.nodeConnections.has(router.nodeId), false);
    assert.equal(f.service.messageRouter, null);
    assert.equal(f.service.serviceLifecycleManager, null);
    assert.equal(f.service.serviceReconciler, null);
    assert.deepEqual(f.entries, []);
  });

test('BootstrapService shutdown joins initial reconciliation and retires its actual cadence',
  async (t) => {
    let reconciler;
    let router;
    t.after(() => reconciler?.stop());
    const f = await fixture(t, {wsPort: 18082}, {withRouter: false});
    await f.service.prepareOriginalSeedAttempt();
    const phase = f.service.seedInfrastructurePhase;
    const entered = Promise.withResolvers();
    const resume = Promise.withResolvers();
    const start = ServiceReconciler.prototype.start;
    const readActual = phase.buildBootstrapActualStateRows;
    t.mock.method(ServiceReconciler.prototype, 'start', function(...args) {
      reconciler = this;
      return Reflect.apply(start, this, args);
    });
    t.mock.method(phase, 'buildBootstrapActualStateRows', async function(...args) {
      const actual = Reflect.apply(readActual, this, args);
      entered.resolve();
      await resume.promise;
      return actual;
    });
    const infrastructure = phase.phaseInfrastructure();
    const initialized = Promise.allSettled([infrastructure]);
    let shutdown;
    try {
      await pausedWorkEntered(entered, infrastructure);
      router = f.service.messageRouter;
      assert.ok(router instanceof MessageRouter);
      assert.equal(f.service.serviceReconciler, reconciler,
        'the running reconciler is owned before its initial read completes');
      assert.equal(reconciler._running, true);
      assert.ok(reconciler._interval);
      shutdown = f.service.shutdown();
      await assertShutdownJoins(shutdown);
    } finally {
      resume.resolve();
      await initialized;
      await shutdown;
    }
    const [result] = await initialized;
    assert.equal(result.status, 'rejected');
    assert.ok(hold(REASON.CLOSED)(result.reason));
    assert.equal(reconciler._running, false);
    assert.equal(reconciler._interval, null);
    assert.equal(router.initialized, false);
    assert.equal(router.server, null);
    assert.ok(!router.hasSelfConnection());
    assert.equal(router.nodeConnections.has(router.nodeId), false);
    assert.equal(f.service.serviceReconciler, null);
    assert.equal(f.service.serviceLifecycleManager, null);
    assert.equal(f.service.messageRouter, null);
    assert.deepEqual(f.entries, []);
  });

test('BootstrapService retains an exact acquired router after close rejection and retries real release',
  async (t) => {
    const f = await fixture(t, {wsPort: 18082}, {withRouter: false});
    await f.service.prepareOriginalSeedAttempt();
    await f.service.seedInfrastructurePhase.phaseInfrastructure();
    const router = f.service.messageRouter;
    const close = router.shutdown;
    const failure = new Error('router release has not settled');
    let failClose = true;
    t.mock.method(router, 'shutdown', async function(...args) {
      if (failClose) throw failure;
      return Reflect.apply(close, this, args);
    });
    try {
      await assert.rejects(f.service.shutdown(), (error) => error === failure);
      assert.equal(f.service.messageRouter, router);
      assert.equal(router.initialized, true);
      assert.equal(router.server, null);
      assert.throws(() => f.service.assertOriginalSeedAttempt(), hold(REASON.CLOSED));
    } finally {
      failClose = false;
    }
    await f.service.shutdown();
    assert.equal(router.initialized, false);
    assert.equal(router.server, null);
    assert.equal(f.service.messageRouter, null);
    assert.equal(f.service.serviceReconciler, null);
    assert.deepEqual(f.entries, []);
  });
