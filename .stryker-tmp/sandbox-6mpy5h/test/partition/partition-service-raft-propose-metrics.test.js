/**
 * PartitionService Raft Propose Metrics Tests
 * Verifies metrics.partition.raft_propose log emission from proposeWrite().
 * Requirements: 3.2, 3.3, 10.1, 10.3, 10.4, 11.1, 11.2, 11.3, 11.4
 */
// @ts-nocheck


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

test('proposeWrite emits metrics.partition.raft_propose as leader',
  async (t) => {
    const partition = createPartition('raft-propose-1');
    await partition.initialize();
    await Promise.resolve();

    const infoCalls = collectInfoCalls(partition);

    await partition.insertData('test_table', {id: 'r1', value: 'a'});

    const metric = infoCalls.find(
      (c) => c.tag === METRICS_LOG_TAG.PARTITION_RAFT_PROPOSE,
    );
    t.ok(metric, 'metrics.partition.raft_propose log emitted');
    t.equal(metric.data.partitionId, 'raft-propose-1');
    t.equal(typeof metric.data.durationMs, 'number');
    t.ok(metric.data.durationMs >= 0, 'durationMs non-negative');
    t.equal(metric.data.isLeader, true);
    t.equal(metric.data.forwarded, false);
    t.equal(typeof metric.data.operationId, 'string');
    t.ok(metric.data.operationId.length > 0, 'operationId is populated');
    t.equal(metric.data.acknowledged, true);
    t.equal(metric.data.error, null);
    t.equal(typeof metric.data.writePhaseTimingMs, 'object');
    t.equal(
      typeof metric.data.writePhaseTimingMs.totalMs,
      'number',
      'phase timing includes total',
    );
    t.ok(
      metric.data.writePhaseTimingMs.totalMs >= 0,
      'phase timing total is non-negative',
    );

    await partition.shutdown();
  });

test('proposeWrite raft_propose metric uses info level, not debug',
  async (t) => {
    const partition = createPartition('raft-propose-2');
    await partition.initialize();
    await Promise.resolve();

    const debugCalls = [];
    const originalDebug = partition.logger.debug.bind(partition.logger);
    partition.logger.debug = function(tag, data) {
      debugCalls.push({tag, data});
      return originalDebug(tag, data);
    };

    await partition.insertData('test_table', {id: 'r1', value: 'a'});

    const debugMetric = debugCalls.find(
      (c) => c.tag === METRICS_LOG_TAG.PARTITION_RAFT_PROPOSE,
    );
    t.notOk(debugMetric, 'no raft_propose metric at debug level');

    await partition.shutdown();
  });

test('proposeWrite raft_propose metric does not break write on logger failure',
  async (t) => {
    const partition = createPartition('raft-propose-3');
    await partition.initialize();
    await Promise.resolve();

    const originalInfo = partition.logger.info.bind(partition.logger);
    partition.logger.info = function(tag, ...args) {
      if (tag === METRICS_LOG_TAG.PARTITION_RAFT_PROPOSE) {
        throw new Error('logger broken');
      }
      return originalInfo(tag, ...args);
    };

    const result = await partition.insertData(
      'test_table', {id: 'r1', value: 'a'},
    );

    t.equal(result.success, true);

    await partition.shutdown();
  });

test('proposeWrite raft_propose metric has structured fields',
  async (t) => {
    const partition = createPartition('raft-propose-4');
    await partition.initialize();
    await Promise.resolve();

    const infoCalls = collectInfoCalls(partition);

    await partition.insertData('test_table', {id: 'r1', value: 'a'});

    const metric = infoCalls.find(
      (c) => c.tag === METRICS_LOG_TAG.PARTITION_RAFT_PROPOSE,
    );
    t.ok(metric, 'metric emitted');
    t.equal(typeof metric.data, 'object', 'data is structured object');
    t.ok('partitionId' in metric.data, 'has partitionId');
    t.ok('durationMs' in metric.data, 'has durationMs');
    t.ok('isLeader' in metric.data, 'has isLeader');
    t.ok('forwarded' in metric.data, 'has forwarded');
    t.ok('operationId' in metric.data, 'has operationId');
    t.ok('correlationId' in metric.data, 'has correlationId');
    t.ok('writePhaseTimingMs' in metric.data, 'has writePhaseTimingMs');
    t.equal(
      Number.isInteger(metric.data.durationMs), true,
      'durationMs is integer',
    );

    await partition.shutdown();
  });

test('proposeWrite includes forward phase timing when forwarded',
  async (t) => {
    const partition = createPartition('raft-propose-5');
    await partition.initialize();
    await Promise.resolve();

    partition.role = 'follower';
    partition.leaderId = 'leader-r1';
    partition.resolveLeaderAddress = () => 'leader-node/partition/test_table';
    partition.transport = {
      deliver: async () => ({acknowledged: true, request_id: 'req-1'}),
      unregister: () => {},
    };

    const infoCalls = collectInfoCalls(partition);
    await partition.proposeWrite({
      type: 'insert',
      sql: 'INSERT INTO test_table (id, value) VALUES (?, ?)',
      params: ['r1', 'a'],
      request_id: 'req-1',
    });

    const metric = infoCalls.find(
      (c) => c.tag === METRICS_LOG_TAG.PARTITION_RAFT_PROPOSE,
    );
    t.ok(metric, 'metric emitted');
    t.equal(metric.data.forwarded, true);
    t.equal(metric.data.requestId, 'req-1');
    t.ok(
      metric.data.writePhaseTimingMs.forwardDeliverMs >= 0,
      'forward phase timing is tracked',
    );

    await partition.shutdown();
  });
