/**
 * L0-only dynamic identity witness for the production Bootstrap registry ->
 * CDC provider -> PartitionService read path across service replacement.
 */

import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {test} from 'node:test';

import Database from 'better-sqlite3';

import {BootstrapAPI} from '../../src/bootstrap/bootstrap-api.js';
import {BootstrapService} from '../../src/bootstrap/bootstrap-service.js';
import {CDCIntegrationSetup} from
  '../../src/bootstrap/shared/cdc-integration-setup.js';
import {INITIAL_PARTITION_IDS, SERVICES_SCHEMA, SYSTEM_TABLE_NAME} from
  '../../src/bootstrap/system-table-schemas-constants.js';
import {SystemTableCache} from '../../src/cache/system-table-cache.js';
import {ConfigurationManager} from
  '../../src/config/configuration-manager.js';
import {CONTROL_PLANE_AUTHORITATIVE_READ_MODE} from
  '../../src/control-plane/control-plane-system-table-gateway-constants.js';
import {buildControlPlaneReadAuthority} from
  '../../src/control-plane/control-plane-system-table-gateway-read-contracts.js';
import {LoggingService} from '../../src/logging/logging-service.js';
import {PartitionService} from '../../src/partition/partition-service.js';
import {MessageRouter} from '../../src/transport/message-router.js';
import {withFoundingStamp} from
  '../partition/partition-founding-stamp.js';
import {TEST_BOOT_INCARNATION} from
  '../test-helpers/boot-incarnation-fixture.js';

const NODE_ID = 'bootstrap-cdc-replacement-node';
const PARTITION_ID = INITIAL_PARTITION_IDS[SYSTEM_TABLE_NAME.SERVICES];
const REGISTRY_KEY = 'current-services-replica';
const OLD_REPLICA = `${PARTITION_ID}-old`;
const NEW_REPLICA = `${PARTITION_ID}-new`;
const TEST_TIMEOUT_MS = 30_000;

function initializeEnvironment() {
  ConfigurationManager.resetInstance();
  LoggingService.resetInstance();
  ConfigurationManager.getInstance().initialize({node: {id: NODE_ID}});
  LoggingService.getInstance().initialize({level: 'error'});
}

async function waitForLeader(partition) {
  const deadline = Date.now() + 5_000;
  while (Date.now() < deadline) {
    if (partition.getRole() === 'leader') return;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error(`replica ${partition.replicaId} did not elect a leader`);
}

async function createService(root, replicaId, serviceId) {
  const dbPath = path.join(root, `${replicaId}.db`);
  const service = new PartitionService(withFoundingStamp({
    partitionId: PARTITION_ID,
    tableId: SYSTEM_TABLE_NAME.SERVICES,
    tableName: SYSTEM_TABLE_NAME.SERVICES,
    replicaId,
    replicaIds: [replicaId],
    nodeId: NODE_ID,
    dbPath,
    schema: SERVICES_SCHEMA,
  }));
  await service.initialize();
  await waitForLeader(service);
  // Test-owned fixture seed after the production service initializes the
  // canonical schema. This does not claim a SERVICES creation-owner path.
  const fixture = new Database(dbPath, {fileMustExist: true});
  try {
    fixture.prepare(`INSERT INTO services (
      service_id, service_type, node_id, partition_id, replica_id,
      status, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
      .run(serviceId, 'partition', NODE_ID, 'application-p1', replicaId,
        'active', 10, 10);
  } finally {
    fixture.close();
  }
  return service;
}

function createCache() {
  const cache = new SystemTableCache();
  cache.applySystemTableChange(SYSTEM_TABLE_NAME.PARTITIONS, 'INSERT', {
    partition_id: PARTITION_ID,
    table_id: SYSTEM_TABLE_NAME.SERVICES,
    table_name: SYSTEM_TABLE_NAME.SERVICES,
    replica_count: 1,
    created_at: 1,
  });
  return cache;
}

function instrumentGenericReadEscape(service) {
  const database = service.db ?? null;
  const executeLocalQuery = typeof service.executeLocalQuery === 'function' ?
    service.executeLocalQuery : null;
  const executeQuery = typeof service.executeQuery === 'function' ?
    service.executeQuery : null;
  const counts = {dbPrepare: 0, executeLocalQuery: 0, executeQuery: 0};
  if (database && typeof database.prepare === 'function') {
    service.db = new Proxy(database, {
      get(target, property) {
        if (property === 'prepare') {
          return (...args) => {
            counts.dbPrepare += 1;
            return target.prepare(...args);
          };
        }
        const value = Reflect.get(target, property, target);
        return typeof value === 'function' ? value.bind(target) : value;
      },
    });
  }
  if (executeLocalQuery) {
    service.executeLocalQuery = (...args) => {
      counts.executeLocalQuery += 1;
      return executeLocalQuery.apply(service, args);
    };
  }
  if (executeQuery) {
    service.executeQuery = (...args) => {
      counts.executeQuery += 1;
      return executeQuery.apply(service, args);
    };
  }
  return {
    counts,
    restore() {
      if (database) service.db = database;
      if (executeLocalQuery) service.executeLocalQuery = executeLocalQuery;
      if (executeQuery) service.executeQuery = executeQuery;
    },
  };
}

async function namedRead(cdc, serviceId) {
  return cdc.executeAuthoritativeSystemTableRead(
    SYSTEM_TABLE_NAME.SERVICES,
    'SELECT service_id, replica_id FROM services WHERE service_id = ?',
    [serviceId],
    {readAuthority: buildControlPlaneReadAuthority({
      authoritativeReadMode: CONTROL_PLANE_AUTHORITATIVE_READ_MODE
        .OWNER_LOCAL_PREFERRED_OWNER_RPC_FALLBACK,
    })},
  );
}

test('Bootstrap registry CDC provider follows exact replacement identity ' +
  'without exposing generic storage', {timeout: TEST_TIMEOUT_MS}, async () => {
  initializeEnvironment();
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'bootstrap-cdc-replace-'));
  const bootstrap = new BootstrapService({
    bootIncarnation: TEST_BOOT_INCARNATION,
    nodeId: NODE_ID,
    nodeAddress: 'ws://127.0.0.1:19090',
  });
  const cache = createCache();
  const router = new MessageRouter({
    bootIncarnation: TEST_BOOT_INCARNATION,
    nodeId: NODE_ID,
    inProcess: true,
  });
  let oldService = null;
  let newService = null;
  let api = null;
  let measurement = null;
  try {
    oldService = await createService(root, OLD_REPLICA, 'old-generation-row');
    newService = await createService(root, NEW_REPLICA, 'new-generation-row');
    const allocation = new WeakMap([
      [oldService, 'old-allocation'],
      [newService, 'new-allocation'],
    ]);
    bootstrap.partitionServices.set(REGISTRY_KEY, oldService);
    api = new BootstrapAPI({
      bootstrapService: bootstrap,
      partitionServices: bootstrap.partitionServices,
      systemTableCache: cache,
      seedNodeId: NODE_ID,
      seedNodeAddress: 'ws://127.0.0.1:19090',
      messageRouter: router,
    });
    let routedSqlCalls = 0;
    const refuseRoutedSql = () => {
      routedSqlCalls += 1;
      throw new Error('local identity witness unexpectedly used routed SQL');
    };
    const cdc = CDCIntegrationSetup.createForNormal({
      nodeId: NODE_ID,
      sqlQueryEngine: {executeQuery: refuseRoutedSql,
        queryExecutor: {executeOnPartition: refuseRoutedSql}},
      systemTableCache: cache,
      messageRouter: router,
      partitionServicesProvider: () => bootstrap.partitionServices,
    });

    assert.equal(api.partitionServices, bootstrap.partitionServices,
      'BootstrapAPI retains the production BootstrapService registry');
    assert.equal(allocation.get(cdc.partitionServicesProvider()
      .get(REGISTRY_KEY)), 'old-allocation');
    const before = await namedRead(cdc, 'old-generation-row');
    assert.deepEqual(before.rows, [{service_id: 'old-generation-row',
      replica_id: OLD_REPLICA}],
    'sanctioned CDC read initially resolves the old registered allocation');

    bootstrap.partitionServices.set(REGISTRY_KEY, newService);
    assert.equal(allocation.get(cdc.partitionServicesProvider()
      .get(REGISTRY_KEY)), 'new-allocation',
    'provider invocation observes exact replacement object identity');
    measurement = instrumentGenericReadEscape(newService);
    const after = await namedRead(cdc, 'new-generation-row');
    measurement.restore();
    assert.deepEqual(after.rows, [{service_id: 'new-generation-row',
      replica_id: NEW_REPLICA}],
    'sanctioned CDC read follows the replacement and returns its row');
    assert.equal(routedSqlCalls, 0,
      'local replacement read does not escape through routed SQL');
    assert.deepEqual(measurement.counts, {
      dbPrepare: 0,
      executeLocalQuery: 0,
      executeQuery: 0,
    }, 'named CDC read does not expose generic SQL or live storage authority');
  } finally {
    measurement?.restore();
    await api?.shutdown?.();
    await router.shutdown();
    await oldService?.shutdown();
    await newService?.shutdown();
    fs.rmSync(root, {recursive: true, force: true});
    ConfigurationManager.resetInstance();
    LoggingService.resetInstance();
  }
});
