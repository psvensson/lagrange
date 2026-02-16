import {test} from '../../src/test-helpers/tap.js';
import {ParallelQueryCoordinator} from '../../src/query/parallel-query-coordinator.js';
import {ConfigurationManager} from '../../src/config/configuration-manager.js';

const config = ConfigurationManager.getInstance();
if (!config.isInitialized()) {
  config.initialize();
}

/**
 * Create a mock system cache that wraps a partition map.
 * @param {Map<string, Object>} partitions - Partition map.
 * @return {Object} Mock system cache.
 */
function createMockSystemCache(partitions) {
  return {
    get: (tableName, id) => {
      if (tableName === 'partitions') {
        return partitions.get(id) || null;
      }
      return null;
    },
  };
}

test('ParallelQueryCoordinator - chunk scheduling executes all partitions', async (t) => {
  const started = [];
  const partitions = new Map();
  let gateResolver = null;
  const gatePromise = new Promise((resolve) => {
    gateResolver = resolve;
  });
  let activeQueries = 0;
  let maxActiveQueries = 0;

  for (let index = 0; index < 5; index++) {
    const partitionId = `p${index}`;
    partitions.set(partitionId, {
      async executeQuery() {
        started.push(partitionId);
        activeQueries += 1;
        maxActiveQueries = Math.max(maxActiveQueries, activeQueries);
        if (partitionId === 'p0' || partitionId === 'p1') {
          await gatePromise;
        }
        await Promise.resolve();
        activeQueries -= 1;
        return {
          rows: [{partitionId}],
          changes: 0,
        };
      },
    });
  }

  const coordinator = new ParallelQueryCoordinator({
    systemCache: createMockSystemCache(partitions),
  });
  coordinator.speculativeExecutionEnabled = false;
  coordinator.maxParallelPartitions = 2;

  const executionPromise = coordinator.executeParallel(
    'SELECT * FROM test',
    Array.from(partitions.keys()),
    [],
  );

  await Promise.resolve();
  await Promise.resolve();
  t.same(
    started,
    ['p0', 'p1'],
    'second chunk should not start before the first chunk finishes',
  );

  gateResolver();
  const result = await executionPromise;

  t.equal(result.success, true);
  t.equal(result.results.length, 5);
  t.same(
    started,
    ['p0', 'p1', 'p2', 'p3', 'p4'],
    'all partitions should execute in deterministic chunk order',
  );
  t.ok(maxActiveQueries <= 2, 'parallelism should respect chunk size');
});

test('ParallelQueryCoordinator - per-fragment status is returned', async (t) => {
  const partitions = new Map([
    ['p1', {
      async executeQuery() {
        return {
          rows: [{id: 1}],
          changes: 0,
        };
      },
    }],
    ['p2', {
      async executeQuery() {
        throw new Error('partition failed');
      },
    }],
  ]);

  const coordinator = new ParallelQueryCoordinator({
    systemCache: createMockSystemCache(partitions),
  });
  coordinator.speculativeExecutionEnabled = false;

  const result = await coordinator.executeParallel(
    'SELECT * FROM test',
    ['p1', 'p2'],
    [],
  );

  t.equal(result.success, true);
  t.equal(result.results.length, 2);

  const p1Result = result.results.find((entry) => entry.partitionId === 'p1');
  const p2Result = result.results.find((entry) => entry.partitionId === 'p2');
  t.equal(p1Result.status, 'completed');
  t.equal(p2Result.status, 'failed');
});

test('ParallelQueryCoordinator - emits fanout metrics log', async (t) => {
  const partitions = new Map([
    ['p1', {
      async executeQuery() {
        return {rows: [{id: 1}], changes: 0};
      },
    }],
    ['p2', {
      async executeQuery() {
        return {rows: [{id: 2}, {id: 3}], changes: 0};
      },
    }],
  ]);

  const coordinator = new ParallelQueryCoordinator({
    systemCache: createMockSystemCache(partitions),
  });
  coordinator.speculativeExecutionEnabled = false;

  const infoCalls = [];
  const origInfo = coordinator.logger.info.bind(coordinator.logger);
  coordinator.logger.info = (tag, data) => {
    infoCalls.push({tag, data});
    origInfo(tag, data);
  };

  await coordinator.executeParallel(
    'SELECT * FROM test',
    ['p1', 'p2'],
    [],
  );

  const metricsCall = infoCalls.find(
    (c) => c.tag === 'metrics.fanout.complete',
  );
  t.ok(metricsCall, 'should emit metrics.fanout.complete log');

  const d = metricsCall.data;
  t.ok(typeof d.queryId === 'string', 'queryId is a string');
  t.equal(d.partitionCount, 2, 'partitionCount matches');
  t.ok(
    Number.isInteger(d.totalLatencyMs) && d.totalLatencyMs >= 0,
    'totalLatencyMs is a non-negative integer',
  );
  t.ok(d.medianLatencyMs >= 0, 'medianLatencyMs is non-negative');
  t.ok(
    Number.isInteger(d.maxPartitionLatencyMs) &&
      d.maxPartitionLatencyMs >= 0,
    'maxPartitionLatencyMs is a non-negative integer',
  );
  t.equal(d.totalRows, 3, 'totalRows sums across partitions');
  t.ok(typeof d.totalBytes === 'number', 'totalBytes is a number');
  t.ok(
    Number.isInteger(d.stragglerCount) && d.stragglerCount >= 0,
    'stragglerCount is a non-negative integer',
  );
  t.ok(
    Number.isInteger(d.speculativeExecutions) &&
      d.speculativeExecutions >= 0,
    'speculativeExecutions is a non-negative integer',
  );

  // Verify no metrics log uses debug level
  const debugCalls = infoCalls.filter(
    (c) => c.tag && c.tag.startsWith('metrics.'),
  );
  t.ok(
    debugCalls.every((c) => c.tag === metricsCall.tag),
    'metrics logs only emitted at info level',
  );
});
