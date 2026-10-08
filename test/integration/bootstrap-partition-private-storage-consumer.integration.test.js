/**
 * Supplemental L0 RED for coupled pair
 * `partition-private-storage-operation-consumers`.
 *
 * This covers one authentic crossing only: BootstrapAPI's production
 * BootstrapTopologySnapshotOwner reading a local initialized PartitionService.
 * The semantic result and a test-owned read-only file observer are the row
 * oracles. Access to `PartitionService.db.prepare` is instrumented only to
 * measure the current forbidden live-storage dependency.
 */

import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {test} from 'node:test';
import Database from 'better-sqlite3';

import {BootstrapAPI} from '../../src/bootstrap/bootstrap-api.js';
import {SystemTableCache} from '../../src/cache/system-table-cache.js';
import {ConfigurationManager} from
  '../../src/config/configuration-manager.js';
import {TABLES} from '../../src/constants/index.js';
import {LoggingService} from '../../src/logging/logging-service.js';
import {PartitionService} from
  '../../src/partition/partition-service.js';
import {withFoundingStamp} from
  '../partition/partition-founding-stamp.js';

const NODE_ID = 'p5-bootstrap-node';
const TABLE_NAME = 'p5_snapshot_rows';
const PARTITION_ID = 'p5-snapshot-p1';
const REPLICA_ID = 'p5-snapshot-p1-r1';
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
  throw new Error('scratch partition did not elect its single-voter leader');
}

function createTopologyCache() {
  const cache = new SystemTableCache();
  cache.applySystemTableChange(TABLES.PARTITIONS, 'INSERT', {
    partition_id: PARTITION_ID,
    table_id: TABLE_NAME,
    table_name: TABLE_NAME,
    partition_key_start: null,
    partition_key_end: null,
    replica_count: 1,
    created_at: 1,
  });
  return cache;
}

function installForbiddenDependencyCounter(partition) {
  const liveDatabase = partition.db;
  const genericExecuteLocalQuery = partition.executeLocalQuery;
  let dependencyCount = 0;
  if (liveDatabase && typeof liveDatabase.prepare === 'function') {
    partition.db = new Proxy(liveDatabase, {
      get(target, property) {
        if (property === 'prepare') {
          return (...args) => {
            dependencyCount += 1;
            return target.prepare(...args);
          };
        }
        const value = Reflect.get(target, property, target);
        return typeof value === 'function' ? value.bind(target) : value;
      },
    });
  }
  if (typeof genericExecuteLocalQuery === 'function') {
    partition.executeLocalQuery = (...args) => {
      dependencyCount += 1;
      return genericExecuteLocalQuery.apply(partition, args);
    };
  }
  return {
    count: () => dependencyCount,
    restore() {
      if (liveDatabase) partition.db = liveDatabase;
      if (typeof genericExecuteLocalQuery === 'function') {
        partition.executeLocalQuery = genericExecuteLocalQuery;
      }
    },
  };
}

test('BootstrapTopologySnapshotOwner consumes frozen partition rows without ' +
  'a live SQLite handle', {timeout: TEST_TIMEOUT_MS}, async () => {
  initializeEnvironment();
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'partition-p5-'));
  const dbPath = path.join(directory, `${REPLICA_ID}.db`);
  let observerDb = null;
  let dependencyCounter = null;
  const partition = new PartitionService(withFoundingStamp({
    partitionId: PARTITION_ID,
    tableId: TABLE_NAME,
    tableName: TABLE_NAME,
    replicaId: REPLICA_ID,
    replicaIds: [REPLICA_ID],
    nodeId: NODE_ID,
    dbPath,
    schema: {columns: [
      {name: 'id', type: 'TEXT', primaryKey: true},
      {name: 'value', type: 'TEXT'},
    ]},
  }));
  try {
    await partition.initialize();
    await waitForLeader(partition);
    const write = await partition.insertData(TABLE_NAME, {
      id: 'snapshot-row',
      value: 'owned-snapshot-value',
    });
    assert.equal(write.success, true,
      'setup row must commit through normal partition admission');

    observerDb = new Database(dbPath, {readonly: true, fileMustExist: true});
    assert.deepEqual(observerDb.prepare(
      `SELECT id, value FROM ${TABLE_NAME} WHERE id = ?`,
    ).get('snapshot-row'), {
      id: 'snapshot-row',
      value: 'owned-snapshot-value',
    }, 'test-owned file observer confirms the committed setup row');

    const partitionServices = new Map([[REPLICA_ID, partition]]);
    const api = new BootstrapAPI({
      seedNodeId: NODE_ID,
      seedNodeAddress: '127.0.0.1:0',
      systemTableCache: createTopologyCache(),
      partitionServices,
    });
    dependencyCounter = installForbiddenDependencyCounter(partition);
    const rowSets = await api.queryLocalAuthoritativePartitionRowSets(
      TABLE_NAME,
    );
    dependencyCounter.restore();

    assert.deepEqual(rowSets, [[{
      id: 'snapshot-row',
      value: 'owned-snapshot-value',
    }]], 'production bootstrap consumer returns the authoritative semantic row');
    assert.equal(partition.getRole(), 'leader',
      'partition-owned status remains available without storage traversal');
    assert.equal(dependencyCounter.count(), 0,
      'bootstrap consumer must use a frozen value or owned snapshot action, ' +
      'not live SQLite or generic executeLocalQuery');
  } finally {
    dependencyCounter?.restore();
    observerDb?.close();
    await partition.shutdown();
    fs.rmSync(directory, {recursive: true, force: true});
    ConfigurationManager.resetInstance();
    LoggingService.resetInstance();
  }
});
