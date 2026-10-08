/**
 * CDC-only partial witness for canonical-system-mutation-capability-boundary
 * pair 5. The production CDC owner reads one real local SERVICES replica.
 * Setup uses a short-lived test-owned SQLite fixture connection after the
 * production partition initializes its canonical schema. Only the measured
 * CDC read is wrapped.
 */

import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {test} from 'node:test';
import Database from 'better-sqlite3';

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
import {PartitionService} from
  '../../src/partition/partition-service.js';
import {MessageRouter} from '../../src/transport/message-router.js';
import {withFoundingStamp} from
  '../partition/partition-founding-stamp.js';
import {TEST_BOOT_INCARNATION} from
  '../test-helpers/boot-incarnation-fixture.js';

const NODE_ID = 'cdc-private-consumer-node';
const PARTITION_ID = INITIAL_PARTITION_IDS[SYSTEM_TABLE_NAME.SERVICES];
const REPLICA_ID = `${PARTITION_ID}-r1`;
const SERVICE_ID = 'cdc-private-consumer-row';
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
  throw new Error('SERVICES fixture did not elect its single-voter leader');
}

function createSystemTableCache() {
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

function measureForbiddenReadDependencies(partition) {
  const liveDatabase = partition.db ?? null;
  const genericLocalQuery = typeof partition.executeLocalQuery === 'function' ?
    partition.executeLocalQuery : null;
  const genericQuery = typeof partition.executeQuery === 'function' ?
    partition.executeQuery : null;
  let genericLocalQueryCalls = 0;
  let genericQueryCalls = 0;
  let livePrepareCalls = 0;
  if (liveDatabase && typeof liveDatabase.prepare === 'function') {
    partition.db = new Proxy(liveDatabase, {
      get(target, property) {
        if (property === 'prepare') {
          return (...args) => {
            livePrepareCalls += 1;
            return target.prepare(...args);
          };
        }
        const value = Reflect.get(target, property, target);
        return typeof value === 'function' ? value.bind(target) : value;
      },
    });
  }
  if (genericLocalQuery) {
    partition.executeLocalQuery = (...args) => {
      genericLocalQueryCalls += 1;
      return genericLocalQuery.apply(partition, args);
    };
  }
  if (genericQuery) {
    partition.executeQuery = (...args) => {
      genericQueryCalls += 1;
      return genericQuery.apply(partition, args);
    };
  }
  return {
    counts: () => ({
      genericLocalQueryCalls, genericQueryCalls, livePrepareCalls,
    }),
    restore() {
      if (liveDatabase) partition.db = liveDatabase;
      if (genericLocalQuery) partition.executeLocalQuery = genericLocalQuery;
      if (genericQuery) partition.executeQuery = genericQuery;
    },
  };
}

test('CDC local authoritative SERVICES read consumes an owned result without ' +
  'public generic SQL or live storage traversal', {timeout: TEST_TIMEOUT_MS},
async () => {
  initializeEnvironment();
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'cdc-private-read-'));
  const dbPath = path.join(directory, `${REPLICA_ID}.db`);
  const partition = new PartitionService(withFoundingStamp({
    partitionId: PARTITION_ID,
    tableId: SYSTEM_TABLE_NAME.SERVICES,
    tableName: SYSTEM_TABLE_NAME.SERVICES,
    replicaId: REPLICA_ID,
    replicaIds: [REPLICA_ID],
    nodeId: NODE_ID,
    dbPath,
    schema: SERVICES_SCHEMA,
  }));
  let observer = null;
  let messageRouter = null;
  let measurement = null;
  try {
    await partition.initialize();
    await waitForLeader(partition);
    // Fixture setup only: use a short-lived test-owned connection after the
    // real PartitionService created the canonical SERVICES schema. This is
    // deliberately outside the measured CDC consumer path and remains valid
    // when generic SERVICES mutation APIs are closed by the later L3 boundary.
    const fixtureDatabase = new Database(dbPath, {fileMustExist: true});
    try {
      fixtureDatabase.prepare(`INSERT INTO services (
        service_id, service_type, node_id, partition_id, replica_id,
        status, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
        .run(SERVICE_ID, 'partition', NODE_ID, 'application-p1',
          'application-p1-r1', 'active', 10, 10);
    } finally {
      fixtureDatabase.close();
    }

    observer = new Database(dbPath, {readonly: true, fileMustExist: true});
    assert.deepEqual(observer.prepare(
      'SELECT service_id, status FROM services WHERE service_id = ?',
    ).get(SERVICE_ID), {service_id: SERVICE_ID, status: 'active'},
    'separate read-only SQLite confirms the durable fixture row');

    const partitionServices = new Map([[REPLICA_ID, partition]]);
    let routedSqlCalls = 0;
    const rejectRoutedSql = () => {
      routedSqlCalls += 1;
      throw new Error('CDC local read unexpectedly used routed SQL');
    };
    messageRouter = new MessageRouter({
      bootIncarnation: TEST_BOOT_INCARNATION,
      nodeId: NODE_ID,
      inProcess: true,
    });
    const cdc = CDCIntegrationSetup.createForNormal({
      nodeId: NODE_ID,
      sqlQueryEngine: {
        executeQuery: rejectRoutedSql,
        queryExecutor: {executeOnPartition: rejectRoutedSql},
      },
      systemTableCache: createSystemTableCache(),
      messageRouter,
      partitionServicesProvider: () => partitionServices,
    });
    measurement = measureForbiddenReadDependencies(partition);
    const result = await cdc.executeAuthoritativeSystemTableRead(
      SYSTEM_TABLE_NAME.SERVICES,
      'SELECT service_id, status FROM services WHERE service_id = ?',
      [SERVICE_ID],
      {readAuthority: buildControlPlaneReadAuthority({
        authoritativeReadMode: CONTROL_PLANE_AUTHORITATIVE_READ_MODE
          .OWNER_LOCAL_PREFERRED_OWNER_RPC_FALLBACK,
      })},
    );
    measurement.restore();

    assert.equal(result.success, true);
    assert.deepEqual(result.rows,
      [{service_id: SERVICE_ID, status: 'active'}],
      'the actual CDC authoritative read returns the durable SERVICES row');
    assert.equal(routedSqlCalls, 0,
      'the explicitly local witness did not escape through routed SQL');
    assert.deepEqual(measurement.counts(), {
      genericLocalQueryCalls: 0,
      genericQueryCalls: 0,
      livePrepareCalls: 0,
    }, 'CDC consumes an owned result instead of either forbidden dependency');
  } finally {
    measurement?.restore();
    observer?.close();
    await messageRouter?.shutdown();
    await partition.shutdown();
    fs.rmSync(directory, {recursive: true, force: true});
    ConfigurationManager.resetInstance();
    LoggingService.resetInstance();
  }
});
