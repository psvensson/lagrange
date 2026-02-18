/**
 * Logs Table Service Tests
 * Requirements: 27.1, 27.3
 */

import {test} from '../../src/test-helpers/tap.js';
import {LogsTableService, LOGS_TABLE_DEFAULT} from '../../src/logging/logs-table-service.js';
import {LoggingService} from '../../src/logging/logging-service.js';
import {ConfigurationManager} from '../../src/config/configuration-manager.js';

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

test('LogsTableService writeLogEntry queues entries', async (t) => {
  LogsTableService.resetInstance();
  const mockCdcService = {
    insertSystemTableRow: async () => {},
  };
  const service = LogsTableService.getInstance();
  service.initialize({cdcIntegrationService: mockCdcService});

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
  const mockCdcService = {
    insertSystemTableRow: async () => {},
  };
  const service = new LogsTableService({
    cdcIntegrationService: mockCdcService,
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
    const mockCdcService = {
      insertSystemTableRow: async () => {},
    };
    const service = new LogsTableService({
      cdcIntegrationService: mockCdcService,
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

test('LogsTableService flush with mock CDC service', async (t) => {
  LogsTableService.resetInstance();

  const writtenRows = [];
  const mockCdcService = {
    insertSystemTableRow: async (tableName, row) => {
      writtenRows.push({tableName, row});
    },
  };

  const service = LogsTableService.getInstance();
  service.initialize({cdcIntegrationService: mockCdcService});

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
  t.equal(writtenRows[0].tableName, 'logs', 'should write to logs table');
  t.equal(writtenRows[0].row.log_id, 'log-1', 'should have correct log_id');
  t.equal(writtenRows[1].row.service_id, 'svc-1', 'should include service_id');
  t.equal(writtenRows[1].row.trace_id, 'trace-123', 'should include trace_id');
  t.ok(writtenRows[1].row.metadata, 'should include metadata');

  const stats = service.getStats();
  t.equal(stats.pendingWrites, 0, 'should have no pending writes after flush');
  t.equal(stats.writeCount, 2, 'should update write count');

  LogsTableService.resetInstance();
});

test('LogsTableService handles write errors', async (t) => {
  LogsTableService.resetInstance();

  let callCount = 0;
  const mockCdcService = {
    insertSystemTableRow: async () => {
      callCount++;
      throw new Error('Write failed');
    },
  };

  const service = new LogsTableService({
    cdcIntegrationService: mockCdcService,
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

test('LogsTableService batch flush on size threshold', async (t) => {
  LogsTableService.resetInstance();

  const writtenRows = [];
  const mockCdcService = {
    insertSystemTableRow: async (tableName, row) => {
      writtenRows.push({tableName, row});
    },
  };

  const service = new LogsTableService({
    cdcIntegrationService: mockCdcService,
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

  // Should have auto-flushed
  t.equal(writtenRows.length, 3, 'should auto-flush when batch size reached');

  const stats = service.getStats();
  t.equal(stats.pendingWrites, 0, 'should have no pending writes');

  await service.shutdown();
});

test('LogsTableService connectToLoggingService flushes buffer', async (t) => {
  LogsTableService.resetInstance();
  LoggingService.resetInstance();

  const writtenRows = [];
  const mockCdcService = {
    insertSystemTableRow: async (tableName, row) => {
      writtenRows.push({tableName, row});
    },
  };

  // Initialize logging service and buffer some entries
  const loggingService = LoggingService.getInstance();
  loggingService.initialize({nodeId: 'test-node'});

  loggingService.info('Buffered message 1');
  loggingService.info('Buffered message 2');

  t.equal(loggingService.getBufferSize(), 2, 'should have buffered entries');

  // Initialize logs table service and connect
  const service = LogsTableService.getInstance();
  service.initialize({cdcIntegrationService: mockCdcService});

  const flushedCount = await service.connectToLoggingService();

  t.equal(flushedCount, 2, 'should return flushed count');
  t.ok(loggingService.isLogsTableReady(), 'logs table should be marked ready');
  t.equal(loggingService.getBufferSize(), 0, 'buffer should be empty');

  // The entries are queued during flush callback, need to flush them
  // Note: there's also a "Logs table ready" message that gets logged
  const stats = service.getStats();
  t.ok(stats.pendingWrites >= 2, 'should have pending writes queued');

  await service.flush();

  t.ok(writtenRows.length >= 2, 'should write buffered entries');

  await service.shutdown();
  LogsTableService.resetInstance();
  LoggingService.resetInstance();
});

test('LogsTableService shutdown flushes pending', async (t) => {
  LogsTableService.resetInstance();

  const writtenRows = [];
  const mockCdcService = {
    insertSystemTableRow: async (tableName, row) => {
      writtenRows.push({tableName, row});
    },
  };

  const service = LogsTableService.getInstance();
  service.initialize({cdcIntegrationService: mockCdcService});

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
    const mockCdcService = {
      insertSystemTableRow: async (tableName, row) => {
        writtenRows.push({tableName, row});
      },
    };

    const service = LogsTableService.getInstance();
    service.initialize({cdcIntegrationService: mockCdcService});

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

test('cleanup', async (t) => {
  LogsTableService.resetInstance();
  LoggingService.resetInstance();
  ConfigurationManager.resetInstance();
  t.pass('cleanup complete');
});
