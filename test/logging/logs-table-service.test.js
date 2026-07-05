/**
 * Logs Table Service Tests
 * Requirements: 27.1, 27.3
 */

import {test} from '../../src/test-helpers/tap.js';
import {LogsTableService, LOGS_TABLE_DEFAULT} from '../../src/logging/logs-table-service.js';
import {LoggingService} from '../../src/logging/logging-service.js';
import {ConfigurationManager} from '../../src/config/configuration-manager.js';
import {WORK_CLASS} from '../../src/runtime/work-class-scheduler.js';
import {
  PRESSURE_GOVERNOR_ACTION,
  PRESSURE_WORK_CLASS,
} from '../../src/control-plane/pressure-governor.js';
import {
  CONTROL_PLANE_WORKLOAD_CLASS,
} from '../../src/control-plane/control-plane-workload-profile.js';

const SHARED_PRESSURE_RESOURCE_KEY = 'logs-table';
const SHARED_PRESSURE_RESOURCE_KEYS = Object.freeze([
  SHARED_PRESSURE_RESOURCE_KEY,
]);

function createLogsOwner(writeImpl = async () => ({success: true})) {
  return {
    async upsertLog(row, options) {
      return writeImpl(row, options);
    },
  };
}

// Initialize configuration before tests
test('setup', async (t) => {
  ConfigurationManager.resetInstance();
  LoggingService.resetInstance();
  LogsTableService.resetInstance();

  const config = ConfigurationManager.getInstance();
  config.initialize({node: {id: 'test-node'}});
  t.pass('configuration initialized');
});

test('LogsTableService singleton', async (t) => {
  LogsTableService.resetInstance();
  const instance1 = LogsTableService.getInstance();
  const instance2 = LogsTableService.getInstance();
  t.equal(instance1, instance2, 'should return the same instance');
  LogsTableService.resetInstance();
});

test('LogsTableService initialization', async (t) => {
  LogsTableService.resetInstance();
  const service = LogsTableService.getInstance();

  t.notOk(service.isInitialized(), 'should not be initialized before initialize()');

  service.initialize();

  t.ok(service.isInitialized(), 'should be initialized after initialize()');

  const stats = service.getStats();
  t.equal(stats.pendingWrites, 0, 'should have no pending writes');
  t.equal(stats.writeCount, 0, 'should have zero write count');
  t.equal(stats.errorCount, 0, 'should have zero error count');

  LogsTableService.resetInstance();
});

test('LogsTableService default config', async (t) => {
  t.equal(LOGS_TABLE_DEFAULT.BATCH_SIZE, 100, 'should have default batch size');
  t.equal(LOGS_TABLE_DEFAULT.FLUSH_INTERVAL_MS, 5000, 'should have default flush interval');
  t.equal(LOGS_TABLE_DEFAULT.MAX_RETRIES, 3, 'should have default max retries');
  t.equal(LOGS_TABLE_DEFAULT.RETRY_DELAY_MS, 1000, 'should have default retry delay');
});

test('LogsTableService flush routes write work through class C scheduler when configured',
  async (t) => {
    LogsTableService.resetInstance();
    const scheduledClasses = [];
    const scheduler = {
      enqueue: async (workClass, task) => {
        scheduledClasses.push(workClass);
        return task();
      },
    };
    const service = new LogsTableService({
      logsOwner: createLogsOwner(),
      workClassScheduler: scheduler,
      batchSize: 100,
    });
    service.initialize();

    await service.writeLogEntry({
      logId: 'log-scheduler',
      timestamp: Date.now(),
      level: 'INFO',
      nodeId: 'test-node',
      message: 'message',
      createdAt: Date.now(),
    });

    await service.flush();

    t.same(scheduledClasses, [WORK_CLASS.C],
      'flush should schedule execution under class C');
    await service.shutdown();
  });

test('LogsTableService writeLogEntry queues entries', async (t) => {
  LogsTableService.resetInstance();
  const service = LogsTableService.getInstance();
  service.initialize({logsOwner: createLogsOwner()});

  const entry = {
    logId: 'log-1',
    timestamp: Date.now(),
    level: 'INFO',
    nodeId: 'test-node',
    message: 'Test message',
    createdAt: Date.now(),
  };

  await service.writeLogEntry(entry);

  const stats = service.getStats();
  t.equal(stats.pendingWrites, 1, 'should queue the entry');

  await service.shutdown();
  LogsTableService.resetInstance();
});

test('LogsTableService bounds pending queue and drops overflow', async (t) => {
  LogsTableService.resetInstance();
  const service = new LogsTableService({
    logsOwner: createLogsOwner(),
    batchSize: 100,
    maxPendingWrites: 2,
  });
  service.initialize();

  await service.writeLogEntry({
    logId: 'log-1',
    timestamp: Date.now(),
    level: 'INFO',
    nodeId: 'test-node',
    message: 'Message 1',
    createdAt: Date.now(),
  });
  await service.writeLogEntry({
    logId: 'log-2',
    timestamp: Date.now(),
    level: 'INFO',
    nodeId: 'test-node',
    message: 'Message 2',
    createdAt: Date.now(),
  });
  await service.writeLogEntry({
    logId: 'log-3',
    timestamp: Date.now(),
    level: 'INFO',
    nodeId: 'test-node',
    message: 'Message 3',
    createdAt: Date.now(),
  });

  const stats = service.getStats();
  t.equal(stats.pendingWrites, 2, 'should cap pending writes to maxPendingWrites');
  t.equal(stats.droppedWrites, 1, 'should count dropped writes when queue overflows');

  await service.shutdown();
});

test('LogsTableService prioritizes non-metrics entries when queue is full',
  async (t) => {
    LogsTableService.resetInstance();
    const service = new LogsTableService({
      logsOwner: createLogsOwner(),
      batchSize: 100,
      maxPendingWrites: 2,
    });
    service.initialize();

    await service.writeLogEntry({
      logId: 'log-metric-1',
      timestamp: Date.now(),
      level: 'INFO',
      nodeId: 'test-node',
      message: 'metrics.transport.deliver',
      createdAt: Date.now(),
    });
    await service.writeLogEntry({
      logId: 'log-metric-2',
      timestamp: Date.now(),
      level: 'INFO',
      nodeId: 'test-node',
      message: 'metrics.transport.deliver',
      createdAt: Date.now(),
    });
    await service.writeLogEntry({
      logId: 'log-important',
      timestamp: Date.now(),
      level: 'WARN',
      nodeId: 'test-node',
      message: 'important.control_plane.event',
      createdAt: Date.now(),
    });

    const pendingMessages = service.pendingWrites.map((entry) => entry.message);
    t.equal(
      pendingMessages.includes('important.control_plane.event'),
      true,
      'should keep non-metrics entry under backpressure',
    );
    t.equal(service.getStats().pendingWrites, 2, 'should keep queue capped');
    t.equal(service.getStats().droppedWrites, 1, 'should drop one metrics entry');

    await service.shutdown();
  });

test('LogsTableService drops low-priority and duplicate entries while write ' +
  'pressure is active', async (t) => {
  LogsTableService.resetInstance();
  let currentNow = 1000;
  const service = new LogsTableService({
    logsOwner: createLogsOwner(),
    now: () => currentNow,
    maxPendingWrites: 10,
    pressureHighWatermark: 2,
  });
  service.initialize();

  await service.writeLogEntry({
    logId: 'warn-1',
    timestamp: Date.now(),
    level: 'WARN',
    nodeId: 'test-node',
    message: 'important warning',
    createdAt: Date.now(),
  });
  await service.writeLogEntry({
    logId: 'warn-2',
    timestamp: Date.now(),
    level: 'WARN',
    nodeId: 'test-node',
    message: 'another warning',
    createdAt: Date.now(),
  });

  t.equal(service.getStats().pendingWrites, 2, 'should queue initial warnings');

  currentNow = 1010;
  service.writeDeferredUntilMs = 2000;

  await service.writeLogEntry({
    logId: 'info-1',
    timestamp: Date.now(),
    level: 'INFO',
    nodeId: 'test-node',
    message: 'informational noise',
    createdAt: Date.now(),
  });
  await service.writeLogEntry({
    logId: 'warn-duplicate',
    timestamp: Date.now(),
    level: 'WARN',
    nodeId: 'test-node',
    message: 'important warning',
    createdAt: Date.now(),
  });

  const pendingMessages = service.pendingWrites
    .map((entry) => entry.message)
    .sort();
  t.same(
    pendingMessages,
    ['another warning', 'important warning'],
    'pressure mode should keep one exemplar and drop low-priority noise',
  );
  t.equal(service.getStats().droppedWrites, 2, 'should count pressure drops');

  currentNow = 2100;
  await service.shutdown();
});

test('LogsTableService collapses transient-family outage noise across nodes ' +
  'while write pressure is active', async (t) => {
  LogsTableService.resetInstance();
  let currentNow = 1000;
  const service = new LogsTableService({
    logsOwner: createLogsOwner(),
    now: () => currentNow,
    maxPendingWrites: 10,
    pressureHighWatermark: 10,
  });
  service.initialize();
  service.writeDeferredUntilMs = 2000;

  await service.writeLogEntry({
    logId: 'error-1',
    timestamp: currentNow,
    level: 'ERROR',
    nodeId: 'node-a',
    message: 'Query routing failed',
    createdAt: currentNow,
    metadata: {
      subsystem: 'query-executor',
      partitionId: 'logs-p1',
    },
  });
  await service.writeLogEntry({
    logId: 'error-2',
    timestamp: currentNow + 1,
    level: 'ERROR',
    nodeId: 'node-b',
    message: 'Query routing failed',
    createdAt: currentNow + 1,
    metadata: {
      subsystem: 'query-executor',
      partitionId: 'logs-p1',
    },
  });
  await service.writeLogEntry({
    logId: 'error-3',
    timestamp: currentNow + 2,
    level: 'ERROR',
    nodeId: 'node-c',
    message: 'Parallel query execution failed',
    createdAt: currentNow + 2,
    metadata: {
      subsystem: 'parallel-query-coordinator',
      partitionId: 'logs-p1',
    },
  });
  await service.writeLogEntry({
    logId: 'error-4',
    timestamp: currentNow + 3,
    level: 'ERROR',
    nodeId: 'node-d',
    message: 'Query execution failed',
    createdAt: currentNow + 3,
    metadata: {
      subsystem: 'sql-query-engine',
      partitionId: 'logs-p1',
    },
  });

  t.same(
    service.pendingWrites.map((entry) => entry.message).sort(),
    [
      'Parallel query execution failed',
      'Query execution failed',
      'Query routing failed',
    ],
    'pressure mode should keep one transient exemplar per subsystem/resource family instead of one per node',
  );
  t.equal(
    service.getStats().droppedWrites,
    1,
    'cross-node transient-family duplicates should be dropped under pressure',
  );

  currentNow = 2100;
  await service.shutdown();
});

test('LogsTableService admits higher-priority logs by evicting lower-priority ' +
  'queued entries', async (t) => {
  LogsTableService.resetInstance();
  const service = new LogsTableService({
    logsOwner: createLogsOwner(),
    maxPendingWrites: 2,
  });
  service.initialize();

  await service.writeLogEntry({
    logId: 'info-1',
    timestamp: Date.now(),
    level: 'INFO',
    nodeId: 'test-node',
    message: 'info 1',
    createdAt: Date.now(),
  });
  await service.writeLogEntry({
    logId: 'info-2',
    timestamp: Date.now(),
    level: 'INFO',
    nodeId: 'test-node',
    message: 'info 2',
    createdAt: Date.now(),
  });
  await service.writeLogEntry({
    logId: 'error-1',
    timestamp: Date.now(),
    level: 'ERROR',
    nodeId: 'test-node',
    message: 'important error',
    createdAt: Date.now(),
  });

  const pendingMessages = service.pendingWrites.map((entry) => entry.message);
  t.equal(
    pendingMessages.includes('important error'),
    true,
    'queue should admit the higher-priority error entry',
  );
  t.equal(service.getStats().pendingWrites, 2, 'queue should remain bounded');
  t.equal(service.getStats().droppedWrites, 1, 'should drop one lower-priority entry');

  await service.shutdown();
});

test('LogsTableService flush with mock logs owner', async (t) => {
  LogsTableService.resetInstance();

  const writtenRows = [];
  const service = LogsTableService.getInstance();
  service.initialize({
    logsOwner: createLogsOwner(async (row) => {
      writtenRows.push(row);
      return {success: true};
    }),
  });

  // Add entries
  const entry1 = {
    logId: 'log-1',
    timestamp: Date.now(),
    level: 'INFO',
    nodeId: 'test-node',
    message: 'Message 1',
    createdAt: Date.now(),
  };

  const entry2 = {
    logId: 'log-2',
    timestamp: Date.now(),
    level: 'ERROR',
    nodeId: 'test-node',
    message: 'Message 2',
    serviceId: 'svc-1',
    traceId: 'trace-123',
    metadata: {key: 'value'},
    createdAt: Date.now(),
  };

  await service.writeLogEntry(entry1);
  await service.writeLogEntry(entry2);

  // Flush
  const flushedCount = await service.flush();

  t.equal(flushedCount, 2, 'should flush 2 entries');
  t.equal(writtenRows.length, 2, 'should write 2 rows');
  t.equal(writtenRows[0].log_id, 'log-1', 'should have correct log_id');
  t.equal(writtenRows[1].service_id, 'svc-1', 'should include service_id');
  t.equal(writtenRows[1].trace_id, 'trace-123', 'should include trace_id');
  t.ok(writtenRows[1].metadata, 'should include metadata');

  const stats = service.getStats();
  t.equal(stats.pendingWrites, 0, 'should have no pending writes after flush');
  t.equal(stats.writeCount, 2, 'should update write count');

  LogsTableService.resetInstance();
});

test('LogsTableService writes logs via upsert for idempotency', async (t) => {
  LogsTableService.resetInstance();

  let upsertCalls = 0;
  const service = new LogsTableService({
    logsOwner: createLogsOwner(async () => {
      upsertCalls++;
      return {success: true};
    }),
  });
  service.initialize();

  await service.writeLogEntry({
    logId: 'log-duplicate-safe',
    timestamp: Date.now(),
    level: 'INFO',
    nodeId: 'test-node',
    message: 'Duplicate-safe write',
    createdAt: Date.now(),
  });

  const flushedCount = await service.flush();
  const stats = service.getStats();

  t.equal(flushedCount, 1, 'flush should succeed with one write');
  t.equal(upsertCalls, 1, 'should call owner upsert for log writes');
  t.equal(stats.errorCount, 0, 'should not record write error for duplicate-safe upsert');

  await service.shutdown();
  LogsTableService.resetInstance();
});

test('LogsTableService routes owner-backed log writes through background control-plane admission',
  async (t) => {
    LogsTableService.resetInstance();

    const writes = [];
    const service = new LogsTableService({
      logsOwner: createLogsOwner(async (row, options) => {
        writes.push({row, options});
        return {success: true};
      }),
      retryDelayMs: 250,
    });
    service.initialize();

    await service.writeLogEntry({
      logId: 'log-background-write',
      timestamp: Date.now(),
      level: 'WARN',
      nodeId: 'test-node',
      message: 'background.log.write',
      createdAt: Date.now(),
    });

    await service.flush();

    t.equal(writes.length, 1, 'should perform one owner-backed logs-table write');
    t.equal(writes[0].row.log_id, 'log-background-write',
      'owner-backed write should preserve log identity');
    t.equal(
      writes[0].options.workClass,
      PRESSURE_WORK_CLASS.BACKGROUND,
      'logs-table writes should use background pressure admission',
    );
    t.equal(
      writes[0].options.workloadClass,
      CONTROL_PLANE_WORKLOAD_CLASS.LOGS_TABLE_BACKGROUND_WRITE,
      'logs-table writes should use isolated background workload admission',
    );
    t.equal(
      writes[0].options.deliveryPriority,
      'background',
      'logs-table writes should stay off the critical transport lane',
    );
    t.equal(
      writes[0].options.allowPressureDefer,
      true,
      'logs-table writes should be deferrable under pressure',
    );
    t.equal(
      writes[0].options.pressureRetryAfterMs,
      250,
      'logs-table writes should pass through retry defer hints',
    );

    await service.shutdown();
    LogsTableService.resetInstance();
  });

test('LogsTableService uses injected logsOwner when the composition root supplies one',
  async (t) => {
    LogsTableService.resetInstance();

    const writes = [];
    const service = new LogsTableService({
      logsOwner: createLogsOwner(async (row, options) => {
        writes.push({row, options});
        return {success: true};
      }),
      retryDelayMs: 125,
    });
    service.initialize();

    await service.writeLogEntry({
      logId: 'log-owner-write',
      timestamp: Date.now(),
      level: 'INFO',
      nodeId: 'test-node',
      message: 'owner.log.write',
      createdAt: Date.now(),
    });
    await service.flush();

    t.equal(writes.length, 1, 'should perform one owner-backed write');
    t.equal(writes[0].row.log_id, 'log-owner-write',
      'owner-backed write should preserve the canonical row');
    t.equal(
      writes[0].options.workClass,
      PRESSURE_WORK_CLASS.BACKGROUND,
      'owner-backed log writes should preserve background pressure class',
    );
    t.equal(
      writes[0].options.allowPressureDefer,
      true,
      'owner-backed log writes should remain deferrable under pressure',
    );

    await service.shutdown();
    LogsTableService.resetInstance();
  });

test('LogsTableService requires the owner path and does not fall back to gateway or CDC',
  async (t) => {
    LogsTableService.resetInstance();

    let gatewayCalls = 0;
    let cdcCalls = 0;
    const service = new LogsTableService({
      controlPlaneSystemTableGateway: {
        async submitMutation() {
          gatewayCalls++;
          return {success: true};
        },
      },
      cdcIntegrationService: {
        async upsertSystemTableRow() {
          cdcCalls++;
          return {success: true};
        },
      },
      maxRetries: 1,
    });
    service.initialize();

    const entry = {
      logId: 'log-owner-required',
      timestamp: Date.now(),
      level: 'WARN',
      nodeId: 'test-node',
      message: 'owner.required',
      createdAt: Date.now(),
    };

    try {
      await service.writeEntryToTable(entry);
      t.fail(
        'missing owner should surface as a typed error instead of reconstructing a path',
      );
    } catch (error) {
      t.equal(error.code, 'SYSTEM_METADATA_OWNER_REQUIRED');
      t.equal(error.outcome, 'owner_not_ready');
    }
    t.equal(gatewayCalls, 0, 'gateway fallback should not run');
    t.equal(cdcCalls, 0, 'CDC fallback should not run');

    await service.shutdown();
    LogsTableService.resetInstance();
  });

test('LogsTableService never proposes a NULL message to the NOT NULL column',
  async (t) => {
    // Regression guard: a caller that logs with an undefined/null message
    // (mis-resolved message constant, err.message on an error without one)
    // must NOT produce a logs-table INSERT with message=NULL. Because logs are
    // raft-replicated, such a row commits and then throws
    // "NOT NULL constraint failed: logs.message" on apply at every replica — a
    // poison committed entry that wedges the partition apply loop. Observed
    // live in the service-data-affinity demo (run-29): 4992 apply failures /
    // unhandled rejections from a single bad entry retried forever.
    LogsTableService.resetInstance();

    const captured = [];
    const service = new LogsTableService({
      logsOwner: createLogsOwner(async (row) => {
        captured.push(row);
        return {success: true};
      }),
      maxRetries: 1,
    });
    service.initialize();

    for (const badMessage of [undefined, null]) {
      captured.length = 0;
      await service.writeEntryToTable({
        logId: `log-null-${String(badMessage)}`,
        timestamp: Date.now(),
        level: 'ERROR',
        nodeId: 'test-node',
        message: badMessage,
        metadata: {subsystem: 'poison-producer'},
        createdAt: Date.now(),
      });

      t.equal(captured.length, 1, 'the entry is written through the owner');
      const row = captured[0];
      t.equal(
        typeof row.message, 'string',
        `message coerced to a string for ${String(badMessage)} input`,
      );
      t.not(
        row.message, null,
        `message is never null (input ${String(badMessage)})`,
      );
    }

    await service.shutdown();
    LogsTableService.resetInstance();
  });

test('LogsTableService handles write errors', async (t) => {
  LogsTableService.resetInstance();

  let callCount = 0;
  const service = new LogsTableService({
    logsOwner: createLogsOwner(async () => {
      callCount++;
      throw new Error('Write failed');
    }),
    maxRetries: 2,
    retryDelayMs: 10,
  });
  service.initialize();

  const entry = {
    logId: 'log-1',
    timestamp: Date.now(),
    level: 'INFO',
    nodeId: 'test-node',
    message: 'Test message',
    createdAt: Date.now(),
  };

  await service.writeLogEntry(entry);
  await service.flush();

  t.equal(callCount, 2, 'should retry the configured number of times');

  const stats = service.getStats();
  t.equal(stats.errorCount, 1, 'should increment error count');

  await service.shutdown();
});

test('LogsTableService defers transient control-plane write failures instead ' +
  'of retrying every buffered entry inline', async (t) => {
  LogsTableService.resetInstance();

  const scheduledTimeouts = [];
  const warnCalls = [];
  const originalConsoleWarn = console.warn;
  let writeAttempts = 0;
  let currentNow = 1000;
  const transientError =
    new Error('Distributed operation failed due to participant failures');
  transientError.retryAfterMs = 75;
  const service = new LogsTableService({
    logsOwner: createLogsOwner(async () => {
      writeAttempts++;
      throw transientError;
    }),
    maxRetries: 3,
    retryDelayMs: 10,
    maxPendingWrites: 2,
    pressureHighWatermark: 2,
    pressureRetainedPendingWrites: 2,
    setTimeoutFn(callback, delayMs) {
      const handle = {callback, delayMs};
      scheduledTimeouts.push(handle);
      return handle;
    },
    clearTimeoutFn() {},
    setIntervalFn() {
      return {interval: true};
    },
    clearIntervalFn() {},
    now: () => currentNow,
  });
  service.initialize();
  console.warn = (...args) => {
    warnCalls.push(args);
  };
  t.teardown(() => {
    console.warn = originalConsoleWarn;
  });

  await service.writeLogEntry({
    logId: 'log-defer-1',
    timestamp: Date.now(),
    level: 'WARN',
    nodeId: 'test-node',
    message: 'deferred-1',
    createdAt: Date.now(),
  });
  await service.writeLogEntry({
    logId: 'log-defer-2',
    timestamp: Date.now(),
    level: 'WARN',
    nodeId: 'test-node',
    message: 'deferred-2',
    createdAt: Date.now(),
  });

  const flushedCount = await service.flush({
    scheduleThroughWorkClass: false,
    maxEntries: 2,
    yieldPending: true,
  });

  t.equal(flushedCount, 0, 'transient failures should not count as flushed');
  t.equal(
    writeAttempts,
    1,
    'transient failure should stop the batch instead of exhausting inline retries',
  );
  t.equal(
    service.getStats().pendingWrites,
    2,
    'remaining entries should be re-queued for a later flush',
  );
  t.equal(
    service.getStats().writeDeferredUntilMs,
    1075,
    'service should enter a defer window using retryAfterMs',
  );
  t.equal(
    scheduledTimeouts.length,
    1,
    'service should schedule one continuation flush',
  );
  t.equal(
    scheduledTimeouts[0].delayMs,
    75,
    'continuation flush should honor retryAfterMs',
  );
  t.equal(warnCalls.length, 1, 'should emit one bounded defer warning');
  t.equal(typeof warnCalls[0][1], 'object',
    'defer warning should include structured diagnostics');
  t.equal(warnCalls[0][1]?.pendingWrites, 2,
    'defer warning should include pending write count');
  t.equal(warnCalls[0][1]?.retainedPressureBacklogCap, 2,
    'defer warning should include retained backlog cap');
  t.equal(warnCalls[0][1]?.maxPendingWrites, service.maxPendingWrites,
    'defer warning should include max pending writes');
  t.equal(warnCalls[0][1]?.isWriting, false,
    'defer warning should include write-in-progress state');
  t.equal(warnCalls[0][1]?.requeuedEntries, 2,
    'defer warning should report how many entries were requeued');
  t.equal(warnCalls[0][1]?.droppedEntries, 0,
    'defer warning should report how many entries were dropped');
  t.equal(service.getStats().pendingWriteGrowthCount, 2,
    'stats should expose pending-write growth events');
  t.equal(service.getStats().retainedBacklogGrowthCount, 0,
    'stats should expose retained-backlog growth events');

  currentNow = 1100;
  service.logsOwner = createLogsOwner(async () => ({success: true}));
  service.setTimeoutFn = (callback) => {
    callback();
    return {immediate: true};
  };
  service.clearTimeoutFn = () => {};
  await service.shutdown();
});

test('LogsTableService escalates defer windows after repeated transient ' +
  'control-plane failures', async (t) => {
  LogsTableService.resetInstance();

  const scheduledTimeouts = [];
  let currentNow = 1000;
  const transientError =
    new Error('Distributed operation failed due to participant failures');
  transientError.retryAfterMs = 50;
  const service = new LogsTableService({
    logsOwner: createLogsOwner(async () => {
      throw transientError;
    }),
    maxRetries: 1,
    retryDelayMs: 10,
    pressureMaxRetryDelayMs: 1000,
    setTimeoutFn(callback, delayMs) {
      const handle = {callback, delayMs};
      scheduledTimeouts.push(handle);
      return handle;
    },
    clearTimeoutFn() {},
    setIntervalFn() {
      return {interval: true};
    },
    clearIntervalFn() {},
    now: () => currentNow,
  });
  service.initialize();

  await service.writeLogEntry({
    logId: 'log-escalate-1',
    timestamp: Date.now(),
    level: 'ERROR',
    nodeId: 'test-node',
    message: 'escalate-1',
    createdAt: Date.now(),
  });

  await service.flush({
    scheduleThroughWorkClass: false,
    maxEntries: 1,
    yieldPending: true,
  });

  t.equal(service.getStats().writeDeferredUntilMs, 1050,
    'first transient failure should use the base retryAfterMs');
  t.equal(service.getStats().consecutiveDeferredWriteFailures, 1,
    'first transient failure should increment deferred-failure tracking');

  currentNow = 1050;
  service.writeDeferredUntilMs = 0;

  await service.flush({
    scheduleThroughWorkClass: false,
    maxEntries: 1,
    yieldPending: true,
  });

  t.equal(service.getStats().writeDeferredUntilMs, 1150,
    'second consecutive transient failure should back off more aggressively');
  t.equal(service.getStats().consecutiveDeferredWriteFailures, 2,
    'consecutive defer tracking should continue across repeated failures');
  t.equal(scheduledTimeouts[0].delayMs, 50,
    'first defer should schedule continuation using the base retry window');

  currentNow = 1200;
  service.logsOwner = createLogsOwner(async () => ({success: true}));
  service.setTimeoutFn = (callback) => {
    callback();
    return {immediate: true};
  };
  service.clearTimeoutFn = () => {};
  await service.shutdown();
});

test('LogsTableService trims queued backlog to retained cap when deferred ' +
  'writes keep failing', async (t) => {
  LogsTableService.resetInstance();

  let currentNow = 1000;
  const transientError =
    new Error('Distributed operation failed due to participant failures');
  transientError.retryAfterMs = 25;
  const service = new LogsTableService({
    logsOwner: createLogsOwner(async () => {
      throw transientError;
    }),
    maxRetries: 1,
    batchSize: 100,
    pressureHighWatermark: 10,
    pressureRetainedPendingWrites: 3,
    now: () => currentNow,
    setTimeoutFn() {
      return {timeout: true};
    },
    clearTimeoutFn() {},
    setIntervalFn() {
      return {interval: true};
    },
    clearIntervalFn() {},
  });
  service.initialize();

  for (let index = 0; index < 5; index += 1) {
    await service.writeLogEntry({
      logId: `log-retain-${index}`,
      timestamp: Date.now(),
      level: 'WARN',
      nodeId: 'test-node',
      message: `retain-${index}`,
      createdAt: Date.now(),
    });
  }

  await service.flush({
    scheduleThroughWorkClass: false,
    maxEntries: 5,
    yieldPending: true,
  });

  t.equal(service.getStats().pendingWrites, 3,
    'deferred writer should trim queued backlog to retained cap');
  t.equal(service.getStats().droppedWrites, 2,
    'trimming deferred backlog should count dropped retained entries');
  t.equal(service.getStats().writeDeferredUntilMs, 1025,
    'writer should still enter the defer window');

  currentNow = 1100;
  service.logsOwner = createLogsOwner(async () => ({success: true}));
  await service.shutdown();
});

test('LogsTableService only admits unique error-level logs once the deferred ' +
  'backlog cap is reached', async (t) => {
  LogsTableService.resetInstance();

  let currentNow = 1000;
  const service = new LogsTableService({
    logsOwner: createLogsOwner(),
    maxPendingWrites: 10,
    pressureHighWatermark: 10,
    pressureRetainedPendingWrites: 4,
    now: () => currentNow,
  });
  service.initialize();

  for (let index = 0; index < 4; index += 1) {
    await service.writeLogEntry({
      logId: `log-warn-${index}`,
      timestamp: Date.now(),
      level: 'WARN',
      nodeId: 'test-node',
      message: `warn-${index}`,
      createdAt: Date.now(),
    });
  }

  service.writeDeferredUntilMs = 2000;

  await service.writeLogEntry({
    logId: 'log-warn-dropped',
    timestamp: Date.now(),
    level: 'WARN',
    nodeId: 'test-node',
    message: 'warn-dropped',
    createdAt: Date.now(),
  });
  await service.writeLogEntry({
    logId: 'log-error-admitted',
    timestamp: Date.now(),
    level: 'ERROR',
    nodeId: 'test-node',
    message: 'error-admitted',
    createdAt: Date.now(),
  });

  const pendingMessages = service.pendingWrites.map((entry) => entry.message);
  t.equal(service.getStats().pendingWrites, 4,
    'deferred pressure cap should keep retained backlog bounded');
  t.equal(pendingMessages.includes('warn-dropped'), false,
    'warn-level entries should be dropped once deferred cap is reached');
  t.equal(pendingMessages.includes('error-admitted'), true,
    'error-level entries should still displace lower-priority retained logs');
  t.equal(service.getStats().droppedWrites, 2,
    'one warn drop and one warning eviction should be counted');

  currentNow = 2100;
  await service.shutdown();
});

test('LogsTableService arms a shared-pressure defer window before the local ' +
  'queue saturates', async (t) => {
  LogsTableService.resetInstance();
  const currentNow = 5000;
  const evaluations = [];
  const pressureGovernor = {
    evaluate(request) {
      evaluations.push(request);
      t.equal(
        request.workClass,
        PRESSURE_WORK_CLASS.BACKGROUND,
        'logs persistence should evaluate as background work',
      );
      return {
        action: PRESSURE_GOVERNOR_ACTION.DEGRADE,
        retryAfterMs: 250,
        summary: {backpressured: true},
      };
    },
    isBackpressured() {
      return true;
    },
    configure() {},
  };
  const service = new LogsTableService({
    logsOwner: createLogsOwner(),
    now: () => currentNow,
    pressureGovernor,
    pressureHighWatermark: 10,
    pressureRetainedPendingWrites: 4,
  });
  service.initialize();

  await service.writeLogEntry({
    logId: 'pressure-info',
    timestamp: currentNow,
    level: 'INFO',
    nodeId: 'test-node',
    message: 'informational noise',
    createdAt: currentNow,
    metadata: {subsystem: 'query-executor'},
  });

  t.equal(
    service.getStats().pendingWrites,
    0,
    'shared pressure should drop low-priority log noise before queue saturation',
  );
  t.equal(
    service.writeDeferredUntilMs,
    5250,
    'shared pressure should arm a bounded defer window',
  );
  t.same(
    evaluations[0]?.resourceKeys,
    [
      'control-plane:logs-table:background-write',
      'control-plane:table:logs',
      'transport:logs-writer',
    ],
    'shared logs pressure should use the isolated background write resource key',
  );
  t.notOk(
    evaluations[0]?.resourceKeys?.includes('control-plane:write'),
    'shared logs pressure must not consume the control-plane write ingress key',
  );

  await service.shutdown();
});

test('LogsTableService evaluates shared pressure with explicit resource keys',
  async (t) => {
    LogsTableService.resetInstance();
    const pressureGovernor = {
      evaluate() {
        return {
          action: PRESSURE_GOVERNOR_ACTION.ADMIT,
        };
      },
      isBackpressured(request) {
        t.equal(
          request.workClass,
          PRESSURE_WORK_CLASS.BACKGROUND,
          'shared pressure checks should preserve the background work class',
        );
        return true;
      },
      configure() {},
    };
    const service = new LogsTableService({
      logsOwner: createLogsOwner(),
      pressureGovernor,
    });
    service.initialize();

    t.equal(
      service.isSharedPressureBackpressured(SHARED_PRESSURE_RESOURCE_KEYS),
      true,
      'resource-key shared pressure checks should return governor pressure',
    );

    await service.shutdown();
  });

test('LogsTableService collapses transient transport failures by family while ' +
  'shared pressure is active', async (t) => {
  LogsTableService.resetInstance();
  let currentNow = 1000;
  const pressureGovernor = {
    evaluate() {
      return {
        action: PRESSURE_GOVERNOR_ACTION.DEGRADE,
        retryAfterMs: 200,
        summary: {backpressured: true},
      };
    },
    isBackpressured() {
      return true;
    },
    configure() {},
  };
  const service = new LogsTableService({
    logsOwner: createLogsOwner(),
    now: () => currentNow,
    pressureGovernor,
    maxPendingWrites: 10,
    pressureHighWatermark: 10,
    pressureRetainedPendingWrites: 4,
  });
  service.initialize();

  await service.writeLogEntry({
    logId: 'error-1',
    timestamp: currentNow,
    level: 'ERROR',
    nodeId: 'test-node',
    message: 'Connection to node alpha closed',
    createdAt: currentNow,
    metadata: {
      subsystem: 'query-executor',
      partitionId: 'logs-p1',
    },
  });
  await service.writeLogEntry({
    logId: 'error-2',
    timestamp: currentNow + 1,
    level: 'ERROR',
    nodeId: 'test-node',
    message: 'Connection to node beta closed',
    createdAt: currentNow + 1,
    metadata: {
      subsystem: 'query-executor',
      partitionId: 'logs-p1',
    },
  });
  await service.writeLogEntry({
    logId: 'error-3',
    timestamp: currentNow + 2,
    level: 'ERROR',
    nodeId: 'test-node',
    message: 'Connection to node gamma closed',
    createdAt: currentNow + 2,
    metadata: {
      subsystem: 'query-executor',
      partitionId: 'nodes-p1',
    },
  });

  t.same(
    service.pendingWrites.map((entry) => entry.message).sort(),
    [
      'Connection to node alpha closed',
      'Connection to node gamma closed',
    ],
    'pressure mode should retain one exemplar per subsystem/resource family',
  );
  t.equal(
    service.getStats().droppedWrites,
    1,
    'duplicate transient-family entries should be dropped under shared pressure',
  );

  currentNow = 2000;
  await service.shutdown();
});

test('LogsTableService batch flush on size threshold', async (t) => {
  LogsTableService.resetInstance();

  const writtenRows = [];
  const service = new LogsTableService({
    logsOwner: createLogsOwner(async (row) => {
      writtenRows.push(row);
      return {success: true};
    }),
    batchSize: 3,
  });
  service.initialize();

  // Add entries up to batch size
  for (let i = 0; i < 3; i++) {
    await service.writeLogEntry({
      logId: `log-${i}`,
      timestamp: Date.now(),
      level: 'INFO',
      nodeId: 'test-node',
      message: `Message ${i}`,
      createdAt: Date.now(),
    });
  }

  const waitForDrainDeadline = Date.now() + 500;
  while (Date.now() < waitForDrainDeadline &&
    (writtenRows.length < 3 || service.getStats().pendingWrites > 0)) {
    await new Promise((resolve) => setTimeout(resolve, 10));
  }

  // Auto-flush may drain in chunks; assert eventual completion.
  t.equal(writtenRows.length, 3, 'should eventually flush all batched entries');

  const stats = service.getStats();
  t.equal(stats.pendingWrites, 0, 'should eventually drain pending writes');

  await service.shutdown();
});

test('LogsTableService connectToLoggingService flushes buffer', async (t) => {
  LogsTableService.resetInstance();
  LoggingService.resetInstance();

  const writtenRows = [];
  // Initialize logging service and buffer some entries
  const loggingService = LoggingService.getInstance();
  loggingService.initialize({nodeId: 'test-node'});

  loggingService.info('Buffered message 1');
  loggingService.info('Buffered message 2');

  t.equal(loggingService.getBufferSize(), 2, 'should have buffered entries');

  // Initialize logs table service and connect
  const service = LogsTableService.getInstance();
  service.initialize({
    logsOwner: createLogsOwner(async (row) => {
      writtenRows.push(row);
      return {success: true};
    }),
  });

  const flushedCount = await service.connectToLoggingService();

  t.equal(flushedCount, 2, 'should return flushed count');
  t.ok(loggingService.isLogsTableReady(), 'logs table should be marked ready');
  t.equal(loggingService.getBufferSize(), 0, 'buffer should be empty');

  // The entries are queued in the background flush callback.
  // Note: there's also a "Logs table ready" message that gets logged.
  let pendingObserved = 0;
  const waitDeadline = Date.now() + 200;
  while (Date.now() < waitDeadline) {
    pendingObserved = service.getStats().pendingWrites;
    if (pendingObserved >= 2) {
      break;
    }
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  t.ok(pendingObserved >= 2, 'should queue buffered entries via background flush');

  await service.flush();

  t.ok(writtenRows.length >= 2, 'should write buffered entries');

  await service.shutdown();
  LogsTableService.resetInstance();
  LoggingService.resetInstance();
});

test('LogsTableService connectToLoggingService throttles large startup buffer drains',
  async (t) => {
    LogsTableService.resetInstance();
    LoggingService.resetInstance();

    const loggingService = LoggingService.getInstance();
    loggingService.initialize({nodeId: 'test-node'});

    for (let index = 0; index <
      LOGS_TABLE_DEFAULT.STARTUP_THROTTLED_BACKGROUND_FLUSH_THRESHOLD;
      index += 1) {
      loggingService.info(`Buffered message ${index}`);
    }

    let capturedOptions = null;
    loggingService.onLogsTableReady = async (_writeCallback, options = {}) => {
      capturedOptions = {...options};
      return loggingService.getBufferSize();
    };

    const service = LogsTableService.getInstance();
    service.initialize();

    const flushedCount = await service.connectToLoggingService();

    t.equal(
      flushedCount,
      LOGS_TABLE_DEFAULT.STARTUP_THROTTLED_BACKGROUND_FLUSH_THRESHOLD,
      'should report the buffered startup drain size',
    );
    t.equal(
      capturedOptions.chunkSize,
      LOGS_TABLE_DEFAULT.STARTUP_THROTTLED_BACKGROUND_FLUSH_CHUNK_SIZE,
      'should reduce startup drain chunk size for large buffers',
    );
    t.equal(
      capturedOptions.yieldMs,
      LOGS_TABLE_DEFAULT.STARTUP_THROTTLED_BACKGROUND_FLUSH_YIELD_MS,
      'should increase startup drain yield for large buffers',
    );

    await service.shutdown();
    LogsTableService.resetInstance();
    LoggingService.resetInstance();
  });

test('LogsTableService shutdown flushes pending', async (t) => {
  LogsTableService.resetInstance();

  const writtenRows = [];
  const service = LogsTableService.getInstance();
  service.initialize({
    logsOwner: createLogsOwner(async (row) => {
      writtenRows.push(row);
      return {success: true};
    }),
  });

  await service.writeLogEntry({
    logId: 'log-1',
    timestamp: Date.now(),
    level: 'INFO',
    nodeId: 'test-node',
    message: 'Pending message',
    createdAt: Date.now(),
  });

  t.equal(service.getStats().pendingWrites, 1, 'should have pending write');

  await service.shutdown();

  t.equal(writtenRows.length, 1, 'should flush on shutdown');
  t.notOk(service.isInitialized(), 'should not be initialized after shutdown');

  LogsTableService.resetInstance();
});

test('LogsTableService shutdown drains queue while write is in-flight', async (t) => {
  LogsTableService.resetInstance();

  let resolveWrite;
  const writeBlocked = new Promise((resolve) => {
    resolveWrite = resolve;
  });
  const service = LogsTableService.getInstance();
  service.initialize({
    logsOwner: createLogsOwner(async () => {
      await writeBlocked;
      return {success: true};
    }),
    flushChunkSize: 1,
    flushYieldMs: 1,
  });

  await service.writeLogEntry({
    logId: 'log-inflight-1',
    timestamp: Date.now(),
    level: 'INFO',
    nodeId: 'test-node',
    message: 'inflight message 1',
    createdAt: Date.now(),
  });
  await service.writeLogEntry({
    logId: 'log-inflight-2',
    timestamp: Date.now(),
    level: 'INFO',
    nodeId: 'test-node',
    message: 'inflight message 2',
    createdAt: Date.now(),
  });

  // Start one direct flush to hold isWriting=true with one queued entry remaining.
  const inFlightFlush = service.flush({
    scheduleThroughWorkClass: false,
    maxEntries: 1,
  });

  await new Promise((resolve) => setTimeout(resolve, 0));
  t.equal(service.getStats().isWriting, true, 'write should be in-flight before shutdown');
  t.ok(
    service.getStats().pendingWrites >= 1,
    'queue should still contain pending entries while first write is blocked',
  );

  const shutdownPromise = service.shutdown();
  await new Promise((resolve) => setTimeout(resolve, 0));
  resolveWrite();

  await Promise.race([
    shutdownPromise,
    new Promise((_resolve, reject) => setTimeout(() => {
      reject(new Error('shutdown did not resolve while write was in-flight'));
    }, 1000)),
  ]);
  await inFlightFlush;

  t.equal(service.getStats().pendingWrites, 0, 'shutdown should drain pending writes');
  t.equal(service.getStats().isWriting, false, 'shutdown should finish with no in-flight writes');

  LogsTableService.resetInstance();
});

test('LogsTableService handles null entry', async (t) => {
  LogsTableService.resetInstance();
  const service = LogsTableService.getInstance();
  service.initialize();

  await service.writeLogEntry(null);

  const stats = service.getStats();
  t.equal(stats.pendingWrites, 0, 'should not queue null entry');

  LogsTableService.resetInstance();
});

test('LogsTableService drops logging-pipeline metrics to prevent recursion',
  async (t) => {
    LogsTableService.resetInstance();
    const writtenRows = [];
    const service = LogsTableService.getInstance();
    service.initialize({
      logsOwner: createLogsOwner(async (row) => {
        writtenRows.push(row);
        return {success: true};
      }),
    });

    await service.writeLogEntry({
      logId: 'log-loop-1',
      timestamp: Date.now(),
      level: 'INFO',
      nodeId: 'test-node',
      message: 'metrics.logs_table.flush',
      createdAt: Date.now(),
    });
    await service.flush();

    t.equal(
      service.getStats().selfLoopPreventedWrites,
      1,
      'should count dropped recursive pipeline metrics',
    );
    t.equal(
      writtenRows.length,
      0,
      'should not persist recursive pipeline metrics',
    );

    await service.shutdown();
    LogsTableService.resetInstance();
  });

test('LogsTableService drops logging-pipeline pressure metrics to prevent recursion',
  async (t) => {
    LogsTableService.resetInstance();
    const writtenRows = [];
    const service = LogsTableService.getInstance();
    service.initialize({
      logsOwner: createLogsOwner(async (row) => {
        writtenRows.push(row);
        return {success: true};
      }),
    });

    await service.writeLogEntry({
      logId: 'log-pressure-loop-1',
      timestamp: Date.now(),
      level: 'INFO',
      nodeId: 'test-node',
      message: 'metrics.pressure.policy',
      createdAt: Date.now(),
    });
    await service.flush();

    t.equal(
      service.getStats().selfLoopPreventedWrites,
      1,
      'should count dropped recursive pressure metrics',
    );
    t.equal(
      writtenRows.length,
      0,
      'should not persist recursive pressure metrics',
    );

    await service.shutdown();
    LogsTableService.resetInstance();
  });

test('LogsTableService resetInstance avoids async shutdown side effects', async (t) => {
  LogsTableService.resetInstance();

  const service = LogsTableService.getInstance();
  service.initialize();
  let shutdownCalls = 0;
  service.shutdown = async () => {
    shutdownCalls += 1;
    return new Promise(() => {});
  };

  LogsTableService.resetInstance();

  t.equal(shutdownCalls, 0, 'resetInstance should not start async shutdown work');
  t.equal(LogsTableService.instance, null, 'resetInstance should clear singleton');
});

test('LogsTableService drops writes once shutdown has started', async (t) => {
  LogsTableService.resetInstance();

  const service = LogsTableService.getInstance();
  service.initialize();

  service.isShuttingDown = true;
  await service.writeLogEntry({
    logId: 'log-after-shutdown-start',
    timestamp: Date.now(),
    level: 'INFO',
    nodeId: 'test-node',
    message: 'should not enqueue',
    createdAt: Date.now(),
  });

  t.equal(
    service.getStats().pendingWrites,
    0,
    'writeLogEntry should ignore writes after shutdown starts',
  );

  service.isShuttingDown = false;
  await service.shutdown();
  LogsTableService.resetInstance();
});

test('cleanup', async (t) => {
  LogsTableService.resetInstance();
  LoggingService.resetInstance();
  ConfigurationManager.resetInstance();
  t.pass('cleanup complete');
});
