/**
 * Guards against write amplification from CDC row-fetch info logs.
 */

import Database from 'better-sqlite3';
import {test} from '../../src/test-helpers/tap.js';
import {PartitionService} from '../../src/partition/partition-service.js';
import {ConfigurationManager} from '../../src/config/configuration-manager.js';
import {LoggingService} from '../../src/logging/logging-service.js';
import {
  SystemTableName,
} from '../../src/bootstrap/system-table-schemas-constants.js';

function createTestPartitionService() {
  return new PartitionService({
    partitionId: 'partition-1',
    tableId: 'table-1',
    replicaId: 'partition-1-r1',
    dbPath: ':memory:',
  });
}

function createCapturingLogger(infoCalls) {
  return {
    debug: () => {},
    info: (...args) => infoCalls.push(args),
    warn: () => {},
    error: () => {},
  };
}

function initializeTestConfig() {
  ConfigurationManager.resetInstance();
  LoggingService.resetInstance();
  const config = ConfigurationManager.getInstance();
  config.initialize({node: {id: 'test-node'}});
  const logger = LoggingService.getInstance();
  logger.initialize({level: 'error'});
}

test('setup partition-service CDC log suppression tests', async (t) => {
  initializeTestConfig();
  t.pass('configuration initialized');
});

test('PartitionService does not emit insert row-fetch info logs for logs table',
  async (t) => {
    const partition = createTestPartitionService();
    const db = new Database(':memory:');
    const infoCalls = [];
    partition.db = db;
    partition.logger = createCapturingLogger(infoCalls);

    db.exec(`
      CREATE TABLE logs (
        log_id TEXT PRIMARY KEY,
        timestamp INTEGER,
        level TEXT,
        node_id TEXT,
        message TEXT,
        created_at INTEGER
      )
    `);
    db.exec(`
      INSERT INTO logs (log_id, timestamp, level, node_id, message, created_at)
      VALUES ('log-1', 1, 'INFO', 'node-1', 'hello', 1)
    `);

    const row = partition.extractInsertDataFromSQL(
      'INSERT INTO logs (log_id, timestamp, level, node_id, message, created_at) ' +
      'VALUES (\'log-1\', 1, \'INFO\', \'node-1\', \'hello\', 1)',
      SystemTableName.LOGS,
    );

    t.equal(row.log_id, 'log-1', 'should still return fetched row');
    t.equal(
      infoCalls.length,
      0,
      'should suppress insert row-fetch info log for logs table',
    );

    db.close();
  });

test('PartitionService does not emit update row-fetch info logs for logs table',
  async (t) => {
    const partition = createTestPartitionService();
    const db = new Database(':memory:');
    const infoCalls = [];
    partition.db = db;
    partition.logger = createCapturingLogger(infoCalls);

    db.exec(`
      CREATE TABLE logs (
        log_id TEXT PRIMARY KEY,
        timestamp INTEGER,
        level TEXT,
        node_id TEXT,
        message TEXT,
        created_at INTEGER
      )
    `);
    db.exec(`
      INSERT INTO logs (log_id, timestamp, level, node_id, message, created_at)
      VALUES ('log-2', 2, 'INFO', 'node-1', 'before', 2)
    `);
    db.exec(
      'UPDATE logs SET message = \'after\' WHERE log_id = \'log-2\'',
    );

    const row = partition.extractUpdateDataFromSQL(
      'UPDATE logs SET message = \'after\' WHERE log_id = \'log-2\'',
      SystemTableName.LOGS,
    );

    t.equal(row.log_id, 'log-2', 'should still return fetched row');
    t.equal(row.message, 'after', 'should return updated row data');
    t.equal(
      infoCalls.length,
      0,
      'should suppress update row-fetch info logs for logs table',
    );

    db.close();
  });

test('PartitionService still emits row-fetch info logs for non-logs tables',
  async (t) => {
    const partition = createTestPartitionService();
    const db = new Database(':memory:');
    const infoCalls = [];
    partition.db = db;
    partition.logger = createCapturingLogger(infoCalls);

    db.exec(`
      CREATE TABLE users (
        id TEXT PRIMARY KEY,
        name TEXT
      )
    `);
    db.exec('INSERT INTO users (id, name) VALUES (\'u-1\', \'User 1\')');

    const row = partition.extractInsertDataFromSQL(
      'INSERT INTO users (id, name) VALUES (\'u-1\', \'User 1\')',
      'users',
    );

    t.equal(row.id, 'u-1', 'should still return fetched row');
    t.ok(
      infoCalls.length > 0,
      'non-logs table writes should keep existing row-fetch info logging',
    );

    db.close();
  });

test('PartitionService does not emit update row-fetch info logs for nodes table',
  async (t) => {
    const partition = createTestPartitionService();
    const db = new Database(':memory:');
    const infoCalls = [];
    partition.db = db;
    partition.logger = createCapturingLogger(infoCalls);

    db.exec(`
      CREATE TABLE nodes (
        node_id TEXT PRIMARY KEY,
        status TEXT
      )
    `);
    db.exec('INSERT INTO nodes (node_id, status) VALUES (\'node-1\', \'active\')');
    db.exec('UPDATE nodes SET status = \'ready\' WHERE node_id = \'node-1\'');

    const row = partition.extractUpdateDataFromSQL(
      'UPDATE nodes SET status = \'ready\' WHERE node_id = \'node-1\'',
      SystemTableName.NODES,
    );

    t.equal(row.node_id, 'node-1', 'should still return fetched row');
    t.equal(row.status, 'ready', 'should return updated row data');
    t.equal(
      infoCalls.length,
      0,
      'should suppress update row-fetch info logs for nodes table',
    );

    db.close();
  });

test('PartitionService does not emit insert row-fetch info logs for node_endpoints table',
  async (t) => {
    const partition = createTestPartitionService();
    const db = new Database(':memory:');
    const infoCalls = [];
    partition.db = db;
    partition.logger = createCapturingLogger(infoCalls);

    db.exec(`
      CREATE TABLE node_endpoints (
        endpoint_id TEXT PRIMARY KEY,
        node_id TEXT
      )
    `);
    db.exec(
      'INSERT INTO node_endpoints (endpoint_id, node_id) VALUES (\'ep-1\', \'node-1\')',
    );

    const row = partition.extractInsertDataFromSQL(
      'INSERT INTO node_endpoints (endpoint_id, node_id) VALUES (\'ep-1\', \'node-1\')',
      SystemTableName.NODE_ENDPOINTS,
    );

    t.equal(row.endpoint_id, 'ep-1', 'should still return fetched row');
    t.equal(
      infoCalls.length,
      0,
      'should suppress insert row-fetch info logs for node_endpoints table',
    );

    db.close();
  });

test('cleanup partition-service CDC log suppression tests', async (t) => {
  ConfigurationManager.resetInstance();
  LoggingService.resetInstance();
  t.pass('cleanup complete');
});
