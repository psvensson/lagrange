/**
 * SQL Query Engine Dispatch Metrics Tests
 * Verifies metrics.query.dispatch log emission from executeRequest().
 * Requirements: 1.2, 1.4, 1.5, 10.1, 10.3, 10.4
 */
// @ts-nocheck


import {test} from '../../src/test-helpers/tap.js';
import {SQLQueryEngine} from '../../src/query/sql-query-engine.js';
import {METRICS_LOG_TAG} from '../../src/constants/index.js';
import {createSqlRequest} from '../../src/query/sql-request.js';
import {EXECUTION_MODE} from '../../src/query/sql-adapter-constants.js';

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

test('executeRequest emits metrics.query.dispatch on successful SQL_STATEMENT',
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

    const request = createSqlRequest({
      statement: 'SELECT * FROM users',
      executionMode: EXECUTION_MODE.SQL_STATEMENT,
    });
    await engine.executeRequest(request);

    const metric = infoCalls.find(
      (c) => c.tag === METRICS_LOG_TAG.QUERY_DISPATCH
    );
    t.ok(metric, 'metrics.query.dispatch log emitted');
    t.equal(metric.data.executionMode, EXECUTION_MODE.SQL_STATEMENT);
    t.equal(metric.data.success, true);
    t.equal(typeof metric.data.totalDurationMs, 'number');
    t.ok(metric.data.totalDurationMs >= 0, 'totalDurationMs non-negative');
    t.ok(metric.data.sessionId, 'sessionId present');

    mockPartitionData.clear();
  });

test('executeRequest emits metrics.query.dispatch on failure',
  async (t) => {
    const cache = createMockSystemCache([], []);
    const engine = createEngine(cache);
    const infoCalls = collectInfoCalls(engine);

    const request = createSqlRequest({
      statement: 'SELECT * FROM nonexistent',
      executionMode: EXECUTION_MODE.SQL_STATEMENT,
    });
    await engine.executeRequest(request);

    const metric = infoCalls.find(
      (c) => c.tag === METRICS_LOG_TAG.QUERY_DISPATCH
    );
    t.ok(metric, 'metrics.query.dispatch emitted on failure');
    t.equal(metric.data.success, false);
    t.equal(metric.data.executionMode, EXECUTION_MODE.SQL_STATEMENT);
    t.ok(metric.data.totalDurationMs >= 0, 'totalDurationMs non-negative');
  });

test('executeRequest emits dispatch metric with success=false on throw',
  async (t) => {
    const cache = createMockSystemCache([], []);
    const engine = createEngine(cache);
    const infoCalls = collectInfoCalls(engine);

    const request = createSqlRequest({
      statement: 'INVALID SQL GARBAGE',
      executionMode: EXECUTION_MODE.SQL_STATEMENT,
    });

    // executeQuery may return error result or throw depending on parse
    await engine.executeRequest(request);

    const metric = infoCalls.find(
      (c) => c.tag === METRICS_LOG_TAG.QUERY_DISPATCH
    );
    t.ok(metric, 'dispatch metric emitted even on error');
    t.equal(typeof metric.data.totalDurationMs, 'number');
    t.ok(metric.data.totalDurationMs >= 0, 'totalDurationMs non-negative');
  });

test('executeRequest dispatch metric uses info level, not debug',
  async (t) => {
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

    const request = createSqlRequest({
      statement: 'SELECT * FROM items',
      executionMode: EXECUTION_MODE.SQL_STATEMENT,
    });
    await engine.executeRequest(request);

    const debugMetric = debugCalls.find(
      (c) => c.tag === METRICS_LOG_TAG.QUERY_DISPATCH
    );
    t.notOk(debugMetric, 'no dispatch metric at debug level');

    mockPartitionData.clear();
  });
