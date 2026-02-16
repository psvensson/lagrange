/**
 * QueryExecutor Distributed SELECT Metrics Tests
 * Verifies metrics.select.distributed log emission from executeSelect().
 * Requirements: 2.1, 2.3, 2.4, 10.1, 10.3, 10.4
 */

import {test} from '../../src/test-helpers/tap.js';
import {QueryExecutor} from '../../src/query/query-executor.js';
import {SQLParser} from '../../src/query/sql-parser.js';
import {METRICS_LOG_TAG} from '../../src/constants/index.js';

import {ConfigurationManager} from '../../src/config/configuration-manager.js';
const config = ConfigurationManager.getInstance();
config.initialize();

const mockPartitionData = new Map();

function createMockMessageRouter() {
  return {
    deliver: async function(address, message) {
      const parts = address.split('/');
      const partitionId = parts[2];
      if (message.type === 'QUERY') {
        const data = mockPartitionData.get(partitionId) || [];
        return {
          acknowledged: true,
          success: true,
          rows: data,
          changes: data.length || 1,
        };
      }
      return {acknowledged: true, success: true, changes: 1};
    },
  };
}

function createMockSystemCache(partitionIds) {
  const services = partitionIds.map((pid) => ({
    service_id: pid,
    service_type: 'partition',
    partition_id: pid,
    node_id: 'test-node',
    raft_role: 'leader',
    address: `test-node/partition/${pid}`,
    status: 'active',
  }));

  return {
    services,
    filter: function(type, predicate) {
      if (type === 'services') {
        return this.services.filter(predicate);
      }
      return [];
    },
  };
}

function parseSQL(sql) {
  const parser = new SQLParser(sql);
  return parser.parse();
}

function collectInfoCalls(executor) {
  const calls = [];
  const originalInfo = executor.logger.info.bind(executor.logger);
  executor.logger.info = function(tag, data) {
    calls.push({tag, data});
    return originalInfo(tag, data);
  };
  return calls;
}

test('executeSelect emits metrics.select.distributed on success',
  async (t) => {
    mockPartitionData.set('p1', [{id: 1, name: 'Alice'}]);
    mockPartitionData.set('p2', [{id: 2, name: 'Bob'}]);

    const executor = new QueryExecutor({
      messageRouter: createMockMessageRouter(),
      systemCache: createMockSystemCache(['p1', 'p2']),
    });
    const infoCalls = collectInfoCalls(executor);

    const ast = parseSQL('SELECT * FROM users');
    const result = await executor.executeSelect(
      ast, ['p1', 'p2']
    );

    t.equal(result.success, true);

    const metric = infoCalls.find(
      (c) => c.tag === METRICS_LOG_TAG.SELECT_DISTRIBUTED
    );
    t.ok(metric, 'metrics.select.distributed log emitted');
    t.equal(metric.data.partitionCount, 2);
    t.equal(typeof metric.data.fanoutTotalLatencyMs, 'number');
    t.equal(typeof metric.data.fanoutMedianLatencyMs, 'number');
    t.equal(typeof metric.data.mergeDurationMs, 'number');
    t.ok(
      metric.data.mergeDurationMs >= 0,
      'mergeDurationMs non-negative'
    );
    t.equal(metric.data.totalRows, 2);
    t.equal(typeof metric.data.stragglerCount, 'number');
    t.ok(
      metric.data.stragglerCount >= 0,
      'stragglerCount non-negative'
    );
    t.equal(typeof metric.data.speculativeExecutions, 'number');
    t.ok(
      metric.data.speculativeExecutions >= 0,
      'speculativeExecutions non-negative'
    );

    mockPartitionData.clear();
  });

test('executeSelect does not emit distributed metric for empty partitions',
  async (t) => {
    const executor = new QueryExecutor({
      messageRouter: createMockMessageRouter(),
      systemCache: createMockSystemCache([]),
    });
    const infoCalls = collectInfoCalls(executor);

    const ast = parseSQL('SELECT * FROM users');
    await executor.executeSelect(ast, []);

    const metric = infoCalls.find(
      (c) => c.tag === METRICS_LOG_TAG.SELECT_DISTRIBUTED
    );
    t.notOk(
      metric,
      'no distributed metric when no partitions'
    );
  });

test('executeSelect distributed metric uses info level, not debug',
  async (t) => {
    mockPartitionData.set('p1', [{id: 1}]);

    const executor = new QueryExecutor({
      messageRouter: createMockMessageRouter(),
      systemCache: createMockSystemCache(['p1']),
    });
    const debugCalls = [];
    const origDebug = executor.logger.debug.bind(executor.logger);
    executor.logger.debug = function(tag, data) {
      debugCalls.push({tag, data});
      return origDebug(tag, data);
    };

    const ast = parseSQL('SELECT * FROM items');
    await executor.executeSelect(ast, ['p1']);

    const debugMetric = debugCalls.find(
      (c) => c.tag === METRICS_LOG_TAG.SELECT_DISTRIBUTED
    );
    t.notOk(
      debugMetric,
      'no distributed metric at debug level'
    );

    mockPartitionData.clear();
  });

test('executeSelect distributed metric has structured object fields',
  async (t) => {
    mockPartitionData.set('p1', [
      {id: 1}, {id: 2}, {id: 3},
    ]);

    const executor = new QueryExecutor({
      messageRouter: createMockMessageRouter(),
      systemCache: createMockSystemCache(['p1']),
    });
    const infoCalls = collectInfoCalls(executor);

    const ast = parseSQL('SELECT * FROM users');
    await executor.executeSelect(ast, ['p1']);

    const metric = infoCalls.find(
      (c) => c.tag === METRICS_LOG_TAG.SELECT_DISTRIBUTED
    );
    t.ok(metric, 'metric emitted');
    t.equal(metric.data.partitionCount, 1);
    t.equal(metric.data.totalRows, 3);

    const requiredFields = [
      'partitionCount',
      'fanoutTotalLatencyMs',
      'fanoutMedianLatencyMs',
      'mergeDurationMs',
      'totalRows',
      'stragglerCount',
      'speculativeExecutions',
    ];
    for (const field of requiredFields) {
      t.ok(
        field in metric.data,
        `field ${field} present`
      );
    }

    mockPartitionData.clear();
  });
