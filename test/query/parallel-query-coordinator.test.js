import {test} from '../../src/test-helpers/tap.js';
import {ParallelQueryCoordinator} from '../../src/query/distributed/parallel-query-coordinator.js';
import {QueryExecutionMetrics} from '../../src/query/distributed/parallel-query-execution-metrics.js';
import {ConfigurationManager} from '../../src/config/configuration-manager.js';
import {CancellationToken} from '../../src/query/cancellation-token.js';

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

test('ParallelQueryCoordinator - preserves bounded participant failure diagnostics',
  async (t) => {
    const coordinator = new ParallelQueryCoordinator({
      partitionQueryExecutor: async (_sql, partitionId) => {
        if (partitionId === 'p1') {
          return {
            success: true,
            rows: [{id: 1}],
            changes: 0,
          };
        }
        return {
          success: false,
          error: 'Distributed operation failed due to participant failures',
          errorCode: 'DISTRIBUTED_PARTICIPANT_FAILURE',
          retryAfterMs: 250,
          deferRetry: true,
          participantNodeId: 'node-pressure',
          participantAddress: 'ws://node-pressure:7001',
          backpressured: true,
          failedTable: 'replica_operations',
        };
      },
    });
    coordinator.speculativeExecutionEnabled = false;

    const result = await coordinator.executeParallel(
      'SELECT * FROM replica_operations',
      ['p1', 'p2'],
      [],
    );

    const failedResult = result.results.find((entry) => entry.partitionId === 'p2');
    t.equal(failedResult?.errorCode, 'DISTRIBUTED_PARTICIPANT_FAILURE',
      'failed partition should preserve error code');
    t.equal(failedResult?.retryAfterMs, 250,
      'failed partition should preserve retry-after metadata');
    t.equal(failedResult?.participantNodeId, 'node-pressure',
      'failed partition should preserve participant node id');
    t.equal(failedResult?.participantAddress, 'ws://node-pressure:7001',
      'failed partition should preserve participant address');
    t.equal(failedResult?.backpressured, true,
      'failed partition should preserve backpressure state');
    t.equal(failedResult?.failedTable, 'replica_operations',
      'failed partition should preserve the failed table name');
    t.equal(
      result.metrics?.firstFailedParticipant?.participantNodeId,
      'node-pressure',
      'fanout metrics should expose the first failed participant summary',
    );
    t.equal(
      result.metrics?.firstFailedParticipant?.failedTable,
      'replica_operations',
      'fanout metrics should expose the failed table name',
    );
    t.equal(
      result.metrics?.firstFailedParticipant?.durationMs >= 0,
      true,
      'fanout metrics should preserve per-participant duration',
    );
  });

test('ParallelQueryCoordinator - missing service returns retryable partition miss',
  async (t) => {
    const coordinator = new ParallelQueryCoordinator();
    coordinator.speculativeExecutionEnabled = false;

    await t.rejects(
      coordinator.executeQueryOnService(
        null,
        'SELECT * FROM replica_operations',
        [],
        'replica_operations-p1',
      ),
      /Partition service not found/,
      'null services should not crash before CDC retry classification',
    );
  });

test('ParallelQueryCoordinator - failed speculative replica cannot win result',
  async (t) => {
    const coordinator = new ParallelQueryCoordinator({
      replicaRegistry: new Map([
        ['p1', [{
          replicaId: 'replica-alt',
          status: 'active',
          async executeQuery() {
            return {
              success: false,
              error: 'Partition service not found',
              rows: [],
            };
          },
        }]],
      ]),
    });

    const metrics = new QueryExecutionMetrics('q-speculative-test', 1);
    const speculativePromises = new Map();
    const results = new Map();
    const pendingPartitions = new Set(['p1']);

    coordinator.startSpeculativeExecution(
      'p1',
      'SELECT * FROM replica_operations',
      [],
      metrics,
      speculativePromises,
      results,
      pendingPartitions,
    );

    const speculative = speculativePromises.get('p1');
    t.ok(speculative?.promise, 'speculative execution should be registered');

    const result = await speculative.promise;
    t.equal(result.success, false, 'speculative failure should be reported');
    t.equal(
      result.error,
      'Partition service not found',
      'speculative failure preserves retryable error',
    );
    t.equal(
      results.has('p1'),
      false,
      'failed speculative result should not complete the partition',
    );
    t.equal(
      pendingPartitions.has('p1'),
      true,
      'primary execution should remain pending after speculative failure',
    );
    t.equal(metrics.speculativeExecutions, 1);
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

test('ParallelQueryCoordinator - per-query timeout override controls chunk timeout',
  async (t) => {
    const originalSetTimeout = globalThis.setTimeout;
    const originalClearTimeout = globalThis.clearTimeout;
    const scheduledTimeouts = [];

    globalThis.setTimeout = (callback, timeoutMs) => {
      scheduledTimeouts.push(timeoutMs);
      globalThis.queueMicrotask(callback);
      return 1;
    };
    globalThis.clearTimeout = () => {};

    const partitions = new Map([
      ['p1', {
        async executeQuery() {
          return new Promise(() => {});
        },
      }],
    ]);

    const coordinator = new ParallelQueryCoordinator({
      systemCache: createMockSystemCache(partitions),
    });
    coordinator.speculativeExecutionEnabled = false;

    try {
      await t.rejects(
        coordinator.executeParallel(
          'SELECT * FROM test',
          ['p1'],
          [],
          {timeoutMs: 4321},
        ),
        /Query timeout after 4321ms/,
      );
      t.ok(
        scheduledTimeouts.includes(4321),
        'coordinator should schedule timeout using per-query override',
      );
    } finally {
      globalThis.setTimeout = originalSetTimeout;
      globalThis.clearTimeout = originalClearTimeout;
    }
  });

test('ParallelQueryCoordinator - cooperative cancellation aborts fanout', async (t) => {
  const originalSetTimeout = globalThis.setTimeout;
  const originalClearTimeout = globalThis.clearTimeout;

  globalThis.setTimeout = (callback, _timeoutMs) => {
    globalThis.queueMicrotask(callback);
    return 1;
  };
  globalThis.clearTimeout = () => {};

  const partitions = new Map([
    ['p1', {
      async executeQuery() {
        return new Promise(() => {});
      },
    }],
  ]);

  const coordinator = new ParallelQueryCoordinator({
    systemCache: createMockSystemCache(partitions),
  });
  coordinator.speculativeExecutionEnabled = false;

  const cancellationToken = new CancellationToken();
  cancellationToken.cancel('cancelled-by-test');

  try {
    await t.rejects(
      coordinator.executeParallel(
        'SELECT * FROM test',
        ['p1'],
        [],
        {
          timeoutMs: 5000,
          cancellationToken,
        },
      ),
      /cancelled-by-test/,
      'cancelled token should abort parallel fanout before timeout',
    );
  } finally {
    globalThis.setTimeout = originalSetTimeout;
    globalThis.clearTimeout = originalClearTimeout;
  }
});
