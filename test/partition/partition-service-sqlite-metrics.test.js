/**
 * PartitionService SQLite Metrics Tests
 * Verifies metrics.partition.sqlite log emission from executeQuery().
 * Requirements: 3.1, 3.3, 3.4, 10.1, 10.3, 10.4, 11.1, 11.2, 11.3, 11.4
 */

import {test, beforeEach, afterEach} from '../../src/test-helpers/tap.js';
import {PartitionService} from '../../src/partition/partition-service.js';
import {METRICS_LOG_TAG} from '../../src/constants/index.js';
import {ConfigurationManager} from '../../src/config/configuration-manager.js';
import {LoggingService} from '../../src/logging/logging-service.js';

beforeEach(() => {
  ConfigurationManager.resetInstance();
  LoggingService.resetInstance();
  const config = ConfigurationManager.getInstance();
  config.initialize({node: {id: 'test-node'}});
  const logger = LoggingService.getInstance();
  logger.initialize({level: 'error'});
});

afterEach(() => {
  ConfigurationManager.resetInstance();
  LoggingService.resetInstance();
});

function createPartition(id) {
  return new PartitionService({
    partitionId: id,
    tableId: 'test_table',
    tableName: 'test_table',
    replicaId: `${id}-r1`,
    replicaIds: [`${id}-r1`],
    schema: {
      columns: [
        {name: 'id', type: 'TEXT', primaryKey: true},
        {name: 'value', type: 'TEXT'},
      ],
    },
    dbPath: ':memory:',
  });
}

function collectInfoCalls(partition) {
  const calls = [];
  const originalInfo = partition.logger.info.bind(partition.logger);
  partition.logger.info = function(tag, data) {
    calls.push({tag, data});
    return originalInfo(tag, data);
  };
  return calls;
}

test('executeQuery emits metrics.partition.sqlite on SELECT',
  async (t) => {
    const partition = createPartition('sqlite-metrics-1');
    await partition.initialize();
    await Promise.resolve();

    await partition.insertData('test_table', {id: 'r1', value: 'a'});
    await partition.insertData('test_table', {id: 'r2', value: 'b'});

    const infoCalls = collectInfoCalls(partition);

    await partition.executeQuery('SELECT * FROM test_table');

    const metric = infoCalls.find(
      (c) => c.tag === METRICS_LOG_TAG.PARTITION_SQLITE
    );
    t.ok(metric, 'metrics.partition.sqlite log emitted');
    t.equal(metric.data.partitionId, 'sqlite-metrics-1');
    t.equal(metric.data.operation, 'select');
    t.equal(typeof metric.data.durationMs, 'number');
    t.ok(metric.data.durationMs >= 0, 'durationMs non-negative');
    t.equal(metric.data.rowCount, 2);

    await partition.shutdown();
  });

test('executeQuery emits correct rowCount for empty result',
  async (t) => {
    const partition = createPartition('sqlite-metrics-2');
    await partition.initialize();
    await Promise.resolve();

    const infoCalls = collectInfoCalls(partition);

    await partition.executeQuery('SELECT * FROM test_table');

    const metric = infoCalls.find(
      (c) => c.tag === METRICS_LOG_TAG.PARTITION_SQLITE
    );
    t.ok(metric, 'metric emitted for empty result');
    t.equal(metric.data.rowCount, 0);
    t.equal(metric.data.operation, 'select');

    await partition.shutdown();
  });

test('executeQuery sqlite metric uses info level, not debug',
  async (t) => {
    const partition = createPartition('sqlite-metrics-3');
    await partition.initialize();
    await Promise.resolve();

    const debugCalls = [];
    const originalDebug = partition.logger.debug.bind(partition.logger);
    partition.logger.debug = function(tag, data) {
      debugCalls.push({tag, data});
      return originalDebug(tag, data);
    };

    await partition.executeQuery('SELECT * FROM test_table');

    const debugMetric = debugCalls.find(
      (c) => c.tag === METRICS_LOG_TAG.PARTITION_SQLITE
    );
    t.notOk(debugMetric, 'no sqlite metric at debug level');

    await partition.shutdown();
  });

test('executeQuery sqlite metric does not break query on logger failure',
  async (t) => {
    const partition = createPartition('sqlite-metrics-4');
    await partition.initialize();
    await Promise.resolve();

    await partition.insertData('test_table', {id: 'r1', value: 'a'});

    // Replace logger.info with a function that throws only for metrics
    const originalInfo = partition.logger.info.bind(partition.logger);
    partition.logger.info = function(tag) {
      if (tag === METRICS_LOG_TAG.PARTITION_SQLITE) {
        throw new Error('logger broken');
      }
      return originalInfo(...arguments);
    };

    const result = await partition.executeQuery(
      'SELECT * FROM test_table'
    );

    t.equal(result.success, true);
    t.equal(result.count, 1);
    t.equal(result.rows.length, 1);

    await partition.shutdown();
  });
