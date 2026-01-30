/**
 * Log Retention Service Tests
 * Requirements: 27.8
 */

import {test} from '../../src/test-helpers/tap.js';
import {
  LogRetentionService,
  DEFAULT_CONFIG,
} from '../../src/logging/log-retention-service.js';
import {ConfigurationManager} from '../../src/config/configuration-manager.js';

// Initialize configuration before tests
test('setup', async (t) => {
  ConfigurationManager.resetInstance();
  LogRetentionService.resetInstance();

  const config = ConfigurationManager.getInstance();
  config.initialize({node: {id: 'test-node'}});
  t.pass('configuration initialized');
});

test('LogRetentionService singleton', async (t) => {
  LogRetentionService.resetInstance();
  const instance1 = LogRetentionService.getInstance();
  const instance2 = LogRetentionService.getInstance();
  t.equal(instance1, instance2, 'should return the same instance');
  LogRetentionService.resetInstance();
});

test('LogRetentionService initialization', async (t) => {
  LogRetentionService.resetInstance();
  const service = LogRetentionService.getInstance();

  t.notOk(service.isInitialized(), 'should not be initialized before initialize()');

  service.initialize();

  t.ok(service.isInitialized(), 'should be initialized after initialize()');

  const stats = service.getStats();
  t.equal(stats.totalDeleted, 0, 'should have zero total deleted');
  t.equal(stats.cleanupCount, 0, 'should have zero cleanup count');
  t.notOk(stats.isRunning, 'should not be running');

  LogRetentionService.resetInstance();
});

test('LogRetentionService default config', async (t) => {
  t.equal(DEFAULT_CONFIG.retentionPeriodMs, 7 * 24 * 60 * 60 * 1000, 'should have 7 day retention');
  t.equal(DEFAULT_CONFIG.cleanupIntervalMs, 60 * 60 * 1000, 'should have 1 hour interval');
  t.equal(DEFAULT_CONFIG.batchSize, 1000, 'should have batch size');
  t.equal(DEFAULT_CONFIG.maxDeletesPerRun, 10000, 'should have max deletes per run');
});

test('LogRetentionService setRetentionPeriod', async (t) => {
  LogRetentionService.resetInstance();
  const service = LogRetentionService.getInstance();
  service.initialize();

  service.setRetentionPeriod(24 * 60 * 60 * 1000); // 1 day

  const stats = service.getStats();
  t.equal(stats.retentionPeriodMs, 24 * 60 * 60 * 1000, 'should update retention period');

  LogRetentionService.resetInstance();
});

test('LogRetentionService setRetentionPeriod rejects negative', async (t) => {
  LogRetentionService.resetInstance();
  const service = LogRetentionService.getInstance();
  service.initialize();

  t.throws(() => {
    service.setRetentionPeriod(-1000);
  }, 'should reject negative retention period');

  LogRetentionService.resetInstance();
});

test('LogRetentionService runCleanup without engine throws error', async (t) => {
  LogRetentionService.resetInstance();
  const service = LogRetentionService.getInstance();
  service.initialize();

  try {
    await service.runCleanup();
    t.fail('should throw error');
  } catch (error) {
    t.ok(error.message.includes('not available'), 'should have error message');
  }

  LogRetentionService.resetInstance();
});

test('LogRetentionService runCleanup with mock engine - no logs to delete', async (t) => {
  LogRetentionService.resetInstance();

  const mockEngine = {
    executeQuery: async (sql) => {
      if (sql.includes('SELECT')) {
        return {success: true, results: [], count: 0};
      }
      return {success: true, affectedRows: 0};
    },
  };

  const service = LogRetentionService.getInstance();
  service.initialize({sqlQueryEngine: mockEngine});

  const result = await service.runCleanup();

  t.ok(result.success, 'should succeed');
  t.equal(result.deleted, 0, 'should delete 0 entries');
  t.ok(result.cutoffTime, 'should have cutoff time');

  LogRetentionService.resetInstance();
});

test('LogRetentionService runCleanup with mock engine - deletes logs', async (t) => {
  LogRetentionService.resetInstance();

  const mockLogs = [
    {log_id: 'log-1'},
    {log_id: 'log-2'},
    {log_id: 'log-3'},
  ];

  let selectCalled = false;
  let deleteCalled = false;

  const mockEngine = {
    executeQuery: async (sql) => {
      if (sql.includes('SELECT')) {
        selectCalled = true;
        return {success: true, results: mockLogs, count: 3};
      }
      if (sql.includes('DELETE')) {
        deleteCalled = true;
        t.ok(sql.includes('\'log-1\''), 'should include log-1');
        t.ok(sql.includes('\'log-2\''), 'should include log-2');
        t.ok(sql.includes('\'log-3\''), 'should include log-3');
        return {success: true, affectedRows: 3};
      }
      return {success: true};
    },
  };

  const service = LogRetentionService.getInstance();
  service.initialize({sqlQueryEngine: mockEngine});

  const result = await service.runCleanup();

  t.ok(selectCalled, 'should call SELECT');
  t.ok(deleteCalled, 'should call DELETE');
  t.ok(result.success, 'should succeed');
  t.equal(result.deleted, 3, 'should delete 3 entries');

  const stats = service.getStats();
  t.equal(stats.totalDeleted, 3, 'should update total deleted');
  t.equal(stats.cleanupCount, 1, 'should update cleanup count');
  t.ok(stats.lastCleanupTime, 'should update last cleanup time');

  LogRetentionService.resetInstance();
});

test('LogRetentionService runCleanup prevents concurrent runs', async (t) => {
  LogRetentionService.resetInstance();

  let _queryCount = 0;
  const mockEngine = {
    executeQuery: async (_sql) => {
      _queryCount++;
      // Simulate slow query
      await new Promise((resolve) => setTimeout(resolve, 50));
      return {success: true, results: [], count: 0};
    },
  };

  const service = LogRetentionService.getInstance();
  service.initialize({sqlQueryEngine: mockEngine});

  // Start two cleanups concurrently
  const [result1, result2] = await Promise.all([
    service.runCleanup(),
    service.runCleanup(),
  ]);

  // One should succeed, one should fail
  const successes = [result1, result2].filter((r) => r.success);
  const failures = [result1, result2].filter((r) => !r.success);

  t.equal(successes.length, 1, 'one should succeed');
  t.equal(failures.length, 1, 'one should fail');
  t.ok(failures[0].error.includes('already in progress'), 'should indicate already running');

  LogRetentionService.resetInstance();
});

test('LogRetentionService runCleanup batches deletes', async (t) => {
  LogRetentionService.resetInstance();

  let selectCount = 0;
  let deleteCount = 0;

  const mockEngine = {
    executeQuery: async (sql) => {
      if (sql.includes('SELECT')) {
        selectCount++;
        // Return full batch first time, empty second time
        if (selectCount === 1) {
          return {
            success: true,
            results: Array(10).fill(null).map((_, i) => ({log_id: `log-${i}`})),
            count: 10,
          };
        }
        return {success: true, results: [], count: 0};
      }
      if (sql.includes('DELETE')) {
        deleteCount++;
        return {success: true, affectedRows: 10};
      }
      return {success: true};
    },
  };

  const service = new LogRetentionService({
    sqlQueryEngine: mockEngine,
    batchSize: 10,
  });
  service.initialize();

  const result = await service.runCleanup();

  t.ok(result.success, 'should succeed');
  t.equal(result.deleted, 10, 'should delete 10 entries');
  t.equal(selectCount, 2, 'should call SELECT twice (batch + check for more)');
  t.equal(deleteCount, 1, 'should call DELETE once');

  await service.shutdown();
});

test('LogRetentionService uses table policy retention period', async (t) => {
  LogRetentionService.resetInstance();

  const customRetentionMs = 24 * 60 * 60 * 1000; // 1 day
  let capturedCutoff = null;

  const mockEngine = {
    executeQuery: async (sql) => {
      if (sql.includes('SELECT') && sql.includes('timestamp <')) {
        // Extract cutoff time from SQL
        const match = sql.match(/timestamp < (\d+)/);
        if (match) {
          capturedCutoff = parseInt(match[1], 10);
        }
      }
      return {success: true, results: [], count: 0};
    },
  };

  const mockPolicyService = {
    getTablePolicy: (tableName) => {
      if (tableName === 'logs') {
        return {retentionPeriodMs: customRetentionMs};
      }
      return null;
    },
  };

  const service = LogRetentionService.getInstance();
  service.initialize({
    sqlQueryEngine: mockEngine,
    tablePolicyService: mockPolicyService,
  });

  const beforeCleanup = Date.now();
  await service.runCleanup();

  t.ok(capturedCutoff, 'should capture cutoff time');
  // Cutoff should be approximately now - 1 day
  const expectedCutoff = beforeCleanup - customRetentionMs;
  const tolerance = 1000; // 1 second tolerance
  t.ok(
    Math.abs(capturedCutoff - expectedCutoff) < tolerance,
    'should use policy retention period',
  );

  LogRetentionService.resetInstance();
});

test('LogRetentionService emits cleanup event', async (t) => {
  LogRetentionService.resetInstance();

  const mockEngine = {
    executeQuery: async () => ({success: true, results: [], count: 0}),
  };

  const service = LogRetentionService.getInstance();
  service.initialize({sqlQueryEngine: mockEngine});

  let eventReceived = false;
  service.on('cleanup', (data) => {
    eventReceived = true;
    t.ok(data.deleted !== undefined, 'should have deleted count');
    t.ok(data.duration !== undefined, 'should have duration');
    t.ok(data.cutoffTime !== undefined, 'should have cutoff time');
  });

  await service.runCleanup();

  t.ok(eventReceived, 'should emit cleanup event');

  LogRetentionService.resetInstance();
});

test('LogRetentionService shutdown', async (t) => {
  LogRetentionService.resetInstance();
  const service = LogRetentionService.getInstance();
  service.initialize();

  service.shutdown();

  t.notOk(service.isInitialized(), 'should not be initialized after shutdown');

  LogRetentionService.resetInstance();
});

test('cleanup', async (t) => {
  LogRetentionService.resetInstance();
  ConfigurationManager.resetInstance();
  t.pass('cleanup complete');
});
