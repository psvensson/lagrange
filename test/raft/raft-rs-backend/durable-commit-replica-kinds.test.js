// Receipt: every-replica-kind-takes-the-durable-persist-path
//
// The three kinds of consensus replica - partition, message group and WASM
// service - each open their own database with the replica pragmas
// (journal_mode WAL, synchronous NORMAL) and reach the one durable store
// through the raft-rs operation port. Each is built here by its production
// construction, writes once, and the observer reads, on that replica's own
// connection, the level every persist committed under: FULL exactly when
// raft-rs requires the Ready synced, the connection's own NORMAL otherwise
// and for the application's transactions.

import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {test} from 'node:test';

import {ConfigurationManager} from
  '../../../src/config/configuration-manager.js';
import {SystemTableCache} from '../../../src/cache/system-table-cache.js';
import {
  SERVICE_STATUS,
  SERVICE_TYPE,
  TABLES,
} from '../../../src/constants/index.js';
import {LoggingService} from '../../../src/logging/logging-service.js';
import {MessageGroupService} from
  '../../../src/message-group/message-group-service.js';
import {NodeService} from '../../../src/node/node-service.js';
import {PartitionService} from '../../../src/partition/partition-service.js';
import {PARTITION_SERVICE_OPERATION} from
  '../../../src/partition/partition-service-constants.js';
import {RAFT_OPERATION_OUTCOME} from
  '../../../src/raft/raft-operation-port-constants.js';
import {MessageRouter} from '../../../src/transport/message-router.js';
import {WasmServiceReplica} from
  '../../../src/wasm-service/wasm-service-replica.js';
import {TEST_BOOT_INCARNATION} from
  '../../test-helpers/boot-incarnation-fixture.js';
import {withFoundingStamp} from '../../partition/partition-founding-stamp.js';
import {
  DURABLE_EVENT,
  SQLITE_SYNCHRONOUS,
  installDurableCommitObserver,
  persistCommits,
  raftRsRequiresSync,
} from './durable-commit-observer.js';

const NODE_ID = 'durable-kinds-node';
const BUDGET_MS = 10000;
const POLL_MS = 10;
const KIND_TIMEOUT_MS = 30000;
const COLUMN = Object.freeze({
  SERVICE_ID: 'service_id',
  NODE_ID: 'node_id',
  SERVICE_TYPE: 'service_type',
  STATUS: 'status',
});

function configure() {
  NodeService.resetInstance();
  ConfigurationManager.resetInstance();
  LoggingService.resetInstance();
  ConfigurationManager.getInstance().initialize({
    node: {id: NODE_ID},
    raft: {heartbeatIntervalMs: 20, electionTimeoutMinMs: 150,
      electionTimeoutMaxMs: 300},
  });
  LoggingService.getInstance().initialize({level: 'error'});
}

function resetEnvironment() {
  NodeService.resetInstance();
  ConfigurationManager.resetInstance();
  LoggingService.resetInstance();
}

function waitFor(predicate) {
  const deadline = Date.now() + BUDGET_MS;
  return new Promise((resolve) => {
    const poll = () => {
      if (predicate()) {
        resolve(true);
      } else if (Date.now() >= deadline) {
        resolve(false);
      } else {
        setTimeout(poll, POLL_MS);
      }
    };
    poll();
  });
}

function leads(port) {
  const status = port.readStatus();
  return status.outcome === RAFT_OPERATION_OUTCOME.CORE_OK &&
    status.role === 'leader';
}

// The kind's own file: every persist on it committed at the level raft-rs
// requires, left the connection at NORMAL, and the application's own
// transactions on it stayed at NORMAL.
function assertKindDurability(events, file, kind) {
  const pairs = persistCommits(events)
    .filter(({persist}) => persist.file === file);
  assert.ok(pairs.some(({persist}) => raftRsRequiresSync(persist)),
    `${kind}: a must-sync Ready was persisted on ${file}`);
  for (const {persist, commit, end} of pairs) {
    const required = raftRsRequiresSync(persist);
    assert.equal(persist.mustSync, required,
      `${kind}: the core's must_sync matches raft-rs's rule`);
    assert.equal(commit.level >= SQLITE_SYNCHRONOUS.FULL, required,
      `${kind}: persist committed at level ${commit.level}, sync ` +
      `required: ${required}`);
    assert.equal(end.levelAfter, SQLITE_SYNCHRONOUS.NORMAL,
      `${kind}: the replica's connection is back at NORMAL`);
  }
  const application = events.filter((event) =>
    event.type === DURABLE_EVENT.COMMIT && !event.persist &&
    event.file === file);
  assert.ok(application.length > 0, `${kind}: application transactions ran`);
  assert.deepEqual([...new Set(application.map((event) => event.level))],
    [SQLITE_SYNCHRONOUS.NORMAL],
    `${kind}: application transactions keep NORMAL`);
}

test('partition replica: the persist path syncs, the application does not',
  {timeout: KIND_TIMEOUT_MS}, async () => {
    configure();
    const directory = fs.mkdtempSync(path.join(os.tmpdir(),
      'durable-kinds-partition-'));
    const dbPath = path.join(directory, 'partition.sqlite');
    const observer = installDurableCommitObserver();
    const service = new PartitionService(withFoundingStamp({
      partitionId: 'durable-kinds-partition',
      tableId: 'kinds_rows',
      tableName: 'kinds_rows',
      replicaId: 'durable-kinds-partition-r1',
      replicaIds: ['durable-kinds-partition-r1'],
      nodeId: NODE_ID,
      dbPath,
      schema: {columns: [
        {name: 'id', type: 'TEXT', primaryKey: true},
        {name: 'value', type: 'TEXT'},
      ]},
    }));
    try {
      await service.initialize();
      const written = await service.applyWrite({
        type: PARTITION_SERVICE_OPERATION.INSERT,
        sql: 'INSERT INTO kinds_rows (id, value) VALUES (?, ?)',
        params: ['row-1', 'value-1'],
        entryId: 'durable-kinds-entry-1',
      });
      assert.equal(written.success, true, JSON.stringify(written));
      assertKindDurability(observer.events, dbPath, 'partition');
    } finally {
      observer.uninstall();
      await service.shutdown().catch(() => undefined);
      fs.rmSync(directory, {recursive: true, force: true});
      resetEnvironment();
    }
  });

async function routerHost(prefix) {
  configure();
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  const router = new MessageRouter({bootIncarnation: TEST_BOOT_INCARNATION,
    nodeId: NODE_ID, wsPort: 0});
  await router.initialize({startServer: false});
  return {directory, router};
}

test('message-group replica: the persist path syncs, the application does ' +
  'not', {timeout: KIND_TIMEOUT_MS}, async () => {
  const {directory, router} = await routerHost('durable-kinds-mg-');
  const groupId = 'durable-kinds-mg';
  const replicaId = 'dkm-0';
  const dbPath = path.join(directory, 'message-groups', groupId,
    `${replicaId}.db`);
  fs.mkdirSync(path.dirname(dbPath), {recursive: true});
  const cache = new SystemTableCache();
  const observer = installDurableCommitObserver();
  const service = new MessageGroupService({
    groupId,
    replicaId,
    nodeId: NODE_ID,
    replicaIds: [replicaId],
    peerAddresses: [`${NODE_ID}/message-group/${replicaId}`],
    transport: router,
    nodeService: {
      getSystemTableCache: () => cache,
      getReadOnlySystemTableCache: () => cache,
    },
    dbPath,
  });
  try {
    await service.initialize();
    assert.ok(leads(service.raft), 'the lone replica leads its group');
    // Its own election is the write under test: the term and vote change
    // and the leader's first entry are must-sync Readys, and applying that
    // entry is an application transaction of the group's.
    assert.ok(await waitFor(() => observer.events.some((event) =>
      event.type === DURABLE_EVENT.COMMIT && !event.persist &&
      event.file === dbPath)), 'the group applied its first entry');
    assertKindDurability(observer.events, dbPath, 'message group');
  } finally {
    observer.uninstall();
    await service.shutdown().catch(() => undefined);
    await router.shutdown();
    fs.rmSync(directory, {recursive: true, force: true});
    resetEnvironment();
  }
});

test('WASM-service replica: the persist path syncs, the application does ' +
  'not', {timeout: KIND_TIMEOUT_MS}, async () => {
  const {directory, router} = await routerHost('durable-kinds-wasm-');
  const serviceId = 'durable-kinds-wasm';
  const replicaId = 'dkw-0';
  const dbPath = path.join(directory, 'wasm-services', serviceId,
    `${replicaId}.db`);
  fs.mkdirSync(path.dirname(dbPath), {recursive: true});
  const cache = new SystemTableCache();
  cache.applySystemTableChange(TABLES.SERVICES, 'INSERT', {
    [COLUMN.SERVICE_ID]: replicaId,
    [COLUMN.NODE_ID]: NODE_ID,
    [COLUMN.SERVICE_TYPE]: SERVICE_TYPE.WASM_SERVICE,
    [COLUMN.STATUS]: SERVICE_STATUS.ACTIVE,
  });
  const observer = installDurableCommitObserver();
  const replica = new WasmServiceReplica({
    replicaId,
    nodeId: NODE_ID,
    replicaIds: [replicaId],
    transport: router,
    serviceDefinitionId: serviceId,
    dbPath,
    systemTableCache: cache,
  });
  try {
    await replica.initialize();
    assert.ok(await waitFor(() => leads(replica.raft)),
      'the lone replica leads its group');
    const written = await replica.handleMessage({payload: {
      operation: 'write', sessionId: 'session-1', key: 'k', value: 'v'}});
    assert.equal(written.accepted, true, JSON.stringify(written));
    assertKindDurability(observer.events, dbPath, 'WASM service');
  } finally {
    observer.uninstall();
    await replica.shutdown().catch(() => undefined);
    await router.shutdown();
    fs.rmSync(directory, {recursive: true, force: true});
    resetEnvironment();
  }
});
