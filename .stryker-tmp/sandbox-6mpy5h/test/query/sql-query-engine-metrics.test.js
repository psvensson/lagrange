/**
 * SQL Query Engine Metrics Tests
 * Verifies metrics.query.lifecycle log emission from executeQuery().
 * Requirements: 1.1, 1.3, 1.4, 1.5, 10.1, 10.3, 10.4
 */
// @ts-nocheck


import {test} from '../../src/test-helpers/tap.js';
import {SQLQueryEngine} from '../../src/query/sql-query-engine.js';
import {METRICS_LOG_TAG} from '../../src/constants/index.js';

import {ConfigurationManager} from '../../src/config/configuration-manager.js';
const config = ConfigurationManager.getInstance();
config.initialize();

const mockPartitionData = new Map();

function createMockMessageRouter() {
  return {
    deliver: async function(address, message) {
      const parts = address.split('/');
      const replicaId = parts[2];
      if (message.type === 'QUERY') {
        const data = mockPartitionData.get(replicaId) || [];
        return {
          acknowledged: true,
          success: true,
          rows: data,
          changes: 0,
        };
      }
      return {acknowledged: true, success: true};
    },
  };
}

function createMockSystemCache(tables, partitions) {
  return {
    tables,
    partitions,
    services: partitions.map((p) => ({
      service_id: p.partition_id,
      service_type: 'partition',
      partition_id: p.partition_id,
      node_id: 'test-node',
      raft_role: 'leader',
      address: `test-node/partition/${p.partition_id}`,
      status: 'active',
    })),
    get(type, key) {
      if (type === 'tables') {
        return this.tables.find((t) => t.table_name === key);
      }
      return null;
    },
    filter(type, predicate) {
      if (type === 'partitions') return this.partitions.filter(predicate);
      if (type === 'services') return this.services.filter(predicate);
      return [];
    },
    getAll(type) {
      if (type === 'partitions') return this.partitions;
      if (type === 'tables') return this.tables;
      if (type === 'services') return this.services;
      return [];
    },
  };
}

function createEngine(cache) {
  return new SQLQueryEngine({
    systemCache: cache,
    messageRouter: createMockMessageRouter(),
  });
}

function collectInfoCalls(engine) {
  const calls = [];
  const originalInfo = engine.logger.info.bind(engine.logger);
  engine.logger.info = function(tag, data) {
    calls.push({tag, data});
    return originalInfo(tag, data);
  };
  return calls;
}

test('executeQuery emits metrics.query.lifecycle on successful SELECT',
  async (t) => {
    mockPartitionData.set('p1', [{id: 1, name: 'Alice'}]);
    const cache = createMockSystemCache(
      [{table_name: 'users', primaryKey: 'id'}],
      [{
        partition_id: 'p1',
        table_name: 'users',
        partition_key_start: null,
        partition_key_end: null,
      }],
    );
    const engine = createEngine(cache);
    const infoCalls = collectInfoCalls(engine);

    await engine.executeQuery('SELECT * FROM users');

    const metric = infoCalls.find(
      (c) => c.tag === METRICS_LOG_TAG.QUERY_LIFECYCLE
    );
    t.ok(metric, 'metrics.query.lifecycle log emitted');
    t.equal(metric.data.statementType, 'SELECT');
    t.equal(metric.data.success, true);
    t.equal(typeof metric.data.parseDurationMs, 'number');
    t.equal(typeof metric.data.executionDurationMs, 'number');
    t.equal(typeof metric.data.totalDurationMs, 'number');
    t.ok(metric.data.parseDurationMs >= 0, 'parseDurationMs non-negative');
    t.ok(
      metric.data.executionDurationMs >= 0,
      'executionDurationMs non-negative'
    );
    t.ok(metric.data.totalDurationMs >= 0, 'totalDurationMs non-negative');
    t.equal(typeof metric.data.partitionCount, 'number');
    t.equal(typeof metric.data.rowCount, 'number');
    t.ok(metric.data.sessionId, 'sessionId present');

    mockPartitionData.clear();
  });

test('executeQuery emits metrics.query.lifecycle on execution failure',
  async (t) => {
    const cache = createMockSystemCache([], []);
    const engine = createEngine(cache);
    const infoCalls = collectInfoCalls(engine);

    await engine.executeQuery('SELECT * FROM nonexistent');

    const metric = infoCalls.find(
      (c) => c.tag === METRICS_LOG_TAG.QUERY_LIFECYCLE
    );
    t.ok(metric, 'metrics.query.lifecycle emitted on failure');
    t.equal(metric.data.success, false);
    t.equal(metric.data.statementType, 'SELECT');
    t.ok(metric.data.totalDurationMs >= 0, 'totalDurationMs non-negative');
  });

test('executeQuery does not emit lifecycle metric for parse errors',
  async (t) => {
    const engine = createEngine(createMockSystemCache([], []));
    const infoCalls = collectInfoCalls(engine);

    await engine.executeQuery('INVALID SQL STATEMENT');

    const metric = infoCalls.find(
      (c) => c.tag === METRICS_LOG_TAG.QUERY_LIFECYCLE
    );
    t.notOk(metric, 'no lifecycle metric on parse error');
  });

test('executeQuery metrics use info level, not debug', async (t) => {
  mockPartitionData.set('p1', [{id: 1}]);
  const cache = createMockSystemCache(
    [{table_name: 'items', primaryKey: 'id'}],
    [{
      partition_id: 'p1',
      table_name: 'items',
      partition_key_start: null,
      partition_key_end: null,
    }],
  );
  const engine = createEngine(cache);
  const debugCalls = [];
  const originalDebug = engine.logger.debug.bind(engine.logger);
  engine.logger.debug = function(tag, data) {
    debugCalls.push({tag, data});
    return originalDebug(tag, data);
  };

  await engine.executeQuery('SELECT * FROM items');

  const debugMetric = debugCalls.find(
    (c) => c.tag === METRICS_LOG_TAG.QUERY_LIFECYCLE
  );
  t.notOk(debugMetric, 'no metrics log at debug level');

  mockPartitionData.clear();
});

test('executeQuery emits lifecycle metric for INSERT', async (t) => {
  mockPartitionData.set('p1', []);
  const cache = createMockSystemCache(
    [{table_name: 'users', primaryKey: 'id'}],
    [{
      partition_id: 'p1',
      table_name: 'users',
      partition_key_start: null,
      partition_key_end: null,
    }],
  );
  const engine = createEngine(cache);
  const infoCalls = collectInfoCalls(engine);

  await engine.executeQuery(
    'INSERT INTO users (id, name) VALUES (\'a\', \'Alice\')'
  );

  const metric = infoCalls.find(
    (c) => c.tag === METRICS_LOG_TAG.QUERY_LIFECYCLE
  );
  t.ok(metric, 'lifecycle metric emitted for INSERT');
  t.equal(metric.data.statementType, 'INSERT');
  t.ok(metric.data.parseDurationMs >= 0);
  t.ok(metric.data.executionDurationMs >= 0);
  t.ok(metric.data.totalDurationMs >= 0);

  mockPartitionData.clear();
});
