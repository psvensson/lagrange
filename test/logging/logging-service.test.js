/**
 * Logging Service Tests
 */

import {test} from '../../src/test-helpers/tap.js';
import {LoggingService, LOG_LEVELS} from '../../src/logging/logging-service.js';
import {ConfigurationManager} from '../../src/config/configuration-manager.js';

// Initialize configuration before tests
test('setup', async (t) => {
  ConfigurationManager.resetInstance();
  const config = ConfigurationManager.getInstance();
  config.initialize({node: {id: 'test-node'}});
  t.pass('configuration initialized');
});

test('LoggingService singleton', async (t) => {
  LoggingService.resetInstance();
  const instance1 = LoggingService.getInstance();
  const instance2 = LoggingService.getInstance();
  t.equal(instance1, instance2, 'should return the same instance');
  LoggingService.resetInstance();
});

test('LoggingService initialization', async (t) => {
  LoggingService.resetInstance();
  const logger = LoggingService.getInstance();

  t.notOk(logger.isInitialized(), 'should not be initialized before initialize()');

  logger.initialize({nodeId: 'test-node-123', level: 'debug'});

  t.ok(logger.isInitialized(), 'should be initialized after initialize()');
  t.equal(logger.getNodeId(), 'test-node-123', 'should set node ID');

  LoggingService.resetInstance();
});

test('LoggingService log levels', async (t) => {
  t.ok(LOG_LEVELS.includes('trace'), 'should have trace level');
  t.ok(LOG_LEVELS.includes('debug'), 'should have debug level');
  t.ok(LOG_LEVELS.includes('info'), 'should have info level');
  t.ok(LOG_LEVELS.includes('warn'), 'should have warn level');
  t.ok(LOG_LEVELS.includes('error'), 'should have error level');
  t.ok(LOG_LEVELS.includes('fatal'), 'should have fatal level');
});

test('LoggingService buffering during bootstrap', async (t) => {
  LoggingService.resetInstance();
  const logger = LoggingService.getInstance();
  logger.initialize({nodeId: 'test-node'});

  t.notOk(logger.isLogsTableReady(), 'logs table should not be ready initially');

  logger.info('Test message 1');
  logger.info('Test message 2');
  logger.info('Test message 3');

  t.equal(logger.getBufferSize(), 3, 'should buffer log entries');

  LoggingService.resetInstance();
});

test('LoggingService flush on logs table ready', async (t) => {
  LoggingService.resetInstance();
  const logger = LoggingService.getInstance();
  logger.initialize({nodeId: 'test-node'});

  logger.info('Buffered message 1');
  logger.info('Buffered message 2');

  const initialBufferSize = logger.getBufferSize();
  t.equal(initialBufferSize, 2, 'should have 2 buffered entries');

  const flushedEntries = [];
  const flushedCount = await logger.onLogsTableReady((entry) => {
    flushedEntries.push(entry);
  });

  t.equal(flushedCount, 2, 'should return flushed count');
  t.ok(logger.isLogsTableReady(), 'logs table should be ready');
  t.equal(logger.getBufferSize(), 0, 'buffer should be empty after flush');

  LoggingService.resetInstance();
});

test('LoggingService can flush buffered logs in background chunks', async (t) => {
  LoggingService.resetInstance();
  const logger = LoggingService.getInstance();
  logger.initialize({nodeId: 'test-node'});

  for (let i = 0; i < 5; i++) {
    logger.info(`buffered-bg-${i}`);
  }

  const seenMessages = [];
  const flushedCount = await logger.onLogsTableReady(async (entry) => {
    if (entry?.message?.startsWith('buffered-bg-')) {
      seenMessages.push(entry.message);
    }
    await new Promise((resolve) => setTimeout(resolve, 1));
  }, {
    flushMode: 'background',
    chunkSize: 1,
    yieldMs: 1,
  });

  t.equal(flushedCount, 5, 'should report buffered entries immediately');
  t.equal(
    seenMessages.length,
    0,
    'should not synchronously drain buffered entries in background mode',
  );

  const waitForFlushDeadline = Date.now() + 250;
  while (Date.now() < waitForFlushDeadline && seenMessages.length < 5) {
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  t.equal(seenMessages.length, 5, 'should flush all buffered entries asynchronously');

  LoggingService.resetInstance();
});

test('LoggingService child logger', async (t) => {
  LoggingService.resetInstance();
  const logger = LoggingService.getInstance();
  logger.initialize({nodeId: 'test-node'});

  const childLogger = logger.child({serviceId: 'partition-1'});

  childLogger.info('Child message');

  t.equal(logger.getBufferSize(), 1, 'child logger should use parent buffer');

  const entry = logger.buffer[0];
  t.equal(entry.metadata.serviceId, 'partition-1', 'should include child bindings');

  LoggingService.resetInstance();
});

test('LoggingService forSubsystem creates subsystem logger', async (t) => {
  LoggingService.resetInstance();
  const logger = LoggingService.getInstance();
  logger.initialize({nodeId: 'test-node'});

  const hlcLogger = logger.forSubsystem('hlc');
  const raftLogger = logger.forSubsystem('raft');

  hlcLogger.info('HLC message');
  raftLogger.info('Raft message');

  t.equal(logger.getBufferSize(), 2, 'should buffer both messages');

  const hlcEntry = logger.buffer[0];
  const raftEntry = logger.buffer[1];

  t.equal(hlcEntry.subsystem, 'hlc', 'should have hlc subsystem');
  t.equal(hlcEntry.metadata.subsystem, 'hlc', 'should include subsystem in metadata');
  t.equal(raftEntry.subsystem, 'raft', 'should have raft subsystem');
  t.equal(raftEntry.metadata.subsystem, 'raft', 'should include subsystem in metadata');

  LoggingService.resetInstance();
});

test('LoggingService buffer size limit', async (t) => {
  LoggingService.resetInstance();
  const logger = LoggingService.getInstance();
  logger.initialize({nodeId: 'test-node', bufferSize: 5});

  // Log more than buffer size
  for (let i = 0; i < 10; i++) {
    logger.info(`Message ${i}`);
  }

  t.equal(logger.getBufferSize(), 5, 'should limit buffer size');

  LoggingService.resetInstance();
});

test('LoggingService log entry structure', async (t) => {
  LoggingService.resetInstance();
  const logger = LoggingService.getInstance();
  logger.initialize({nodeId: 'test-node'});

  logger.info('Test message', {
    subsystem: 'test-subsystem',
    serviceId: 'svc-1',
    serviceType: 'partition',
    traceId: 'trace-123',
  });

  const entry = logger.buffer[0];

  t.ok(entry.logId, 'should have log ID');
  t.ok(entry.timestamp, 'should have timestamp');
  t.equal(entry.level, 'INFO', 'should have uppercase level');
  t.equal(entry.nodeId, 'test-node', 'should have node ID');
  t.equal(entry.subsystem, 'test-subsystem', 'should have subsystem');
  t.equal(entry.serviceId, 'svc-1', 'should have service ID');
  t.equal(entry.serviceType, 'partition', 'should have service type');
  t.equal(entry.message, 'Test message', 'should have message');
  t.equal(entry.traceId, 'trace-123', 'should have trace ID');
  t.ok(entry.createdAt, 'should have created at');

  LoggingService.resetInstance();
});

test('LoggingService all log methods', async (t) => {
  LoggingService.resetInstance();
  const logger = LoggingService.getInstance();
  logger.initialize({nodeId: 'test-node', level: 'trace'});

  logger.trace('Trace message');
  logger.debug('Debug message');
  logger.info('Info message');
  logger.warn('Warn message');
  logger.error('Error message');
  logger.fatal('Fatal message');

  t.equal(logger.getBufferSize(), 6, 'should log all levels');

  const levels = logger.buffer.map((e) => e.level);
  t.same(
    levels,
    ['TRACE', 'DEBUG', 'INFO', 'WARN', 'ERROR', 'FATAL'],
    'should have correct levels',
  );

  LoggingService.resetInstance();
});

test('LoggingService does not persist logs below configured level', async (t) => {
  LoggingService.resetInstance();
  const logger = LoggingService.getInstance();
  logger.initialize({nodeId: 'test-node', level: 'info'});

  const flushedEntries = [];
  await logger.onLogsTableReady((entry) => {
    flushedEntries.push(entry);
  });
  const flushedBeforeDebug = flushedEntries.length;

  logger.debug('debug-no-persist', {subsystem: 'message-router'});

  t.equal(logger.getBufferSize(), 0, 'should not buffer debug log at info level');
  t.equal(
    flushedEntries.length,
    flushedBeforeDebug,
    'should not persist debug log at info level',
  );
  const diagnostics = logger.getDiagnosticsStats();
  t.equal(
    diagnostics.logsSuppressedByLevel,
    1,
    'should expose level-suppressed log count',
  );

  LoggingService.resetInstance();
});

test('LoggingService suppresses metrics logs from default console sink',
  async (t) => {
    LoggingService.resetInstance();
    const logger = LoggingService.getInstance();
    logger.initialize({nodeId: 'test-node', level: 'info'});

    const sinkCalls = [];
    logger.logger = {
      trace: (...args) => sinkCalls.push({level: 'trace', args}),
      debug: (...args) => sinkCalls.push({level: 'debug', args}),
      info: (...args) => sinkCalls.push({level: 'info', args}),
      warn: (...args) => sinkCalls.push({level: 'warn', args}),
      error: (...args) => sinkCalls.push({level: 'error', args}),
      fatal: (...args) => sinkCalls.push({level: 'fatal', args}),
    };

    logger.info('metrics.transport.deliver', {
      durationMs: 1,
      messageCount: 10,
    });

    t.equal(sinkCalls.length, 0, 'should not write metrics to console sink');
    t.equal(
      logger.getBufferSize(),
      0,
      'should not persist metrics with default persistence settings',
    );

    LoggingService.resetInstance();
  });

test('LoggingService default metrics policy is low-overhead and non-persistent',
  async (t) => {
    LoggingService.resetInstance();
    const logger = LoggingService.getInstance();
    logger.initialize({nodeId: 'test-node', level: 'info'});

    const diagnostics = logger.getDiagnosticsStats();
    t.equal(
      diagnostics.persistMetricsLogs,
      false,
      'metrics persistence should be disabled by default',
    );
    t.equal(
      diagnostics.metricsDetailedWindowEnabled,
      false,
      'detailed metrics window should be disabled by default',
    );
    t.equal(
      diagnostics.metricsDefaultResolutionMs,
      30000,
      'default metrics resolution should be 30s',
    );

    LoggingService.resetInstance();
  });

test('LoggingService allows metrics logs when override is enabled',
  async (t) => {
    LoggingService.resetInstance();
    const logger = LoggingService.getInstance();
    logger.initialize({
      nodeId: 'test-node',
      level: 'info',
      showMetricsInConsole: true,
    });

    const sinkCalls = [];
    logger.logger = {
      trace: (...args) => sinkCalls.push({level: 'trace', args}),
      debug: (...args) => sinkCalls.push({level: 'debug', args}),
      info: (...args) => sinkCalls.push({level: 'info', args}),
      warn: (...args) => sinkCalls.push({level: 'warn', args}),
      error: (...args) => sinkCalls.push({level: 'error', args}),
      fatal: (...args) => sinkCalls.push({level: 'fatal', args}),
    };

    logger.info('metrics.transport.deliver', {durationMs: 1});

    t.equal(sinkCalls.length, 1, 'should write metrics to console sink');
    t.equal(sinkCalls[0].level, 'info');

    LoggingService.resetInstance();
  });

test('LoggingService can suppress metrics logs from persistence', async (t) => {
  LoggingService.resetInstance();
  const logger = LoggingService.getInstance();
  logger.initialize({
    nodeId: 'test-node',
    level: 'info',
    persistMetricsLogs: false,
  });

  logger.info('metrics.transport.deliver', {
    durationMs: 1,
  });

  t.equal(logger.getBufferSize(), 0, 'should not buffer metrics when persistence is disabled');
  const diagnostics = logger.getDiagnosticsStats();
  t.equal(diagnostics.metricsLogs, 1, 'should count metrics log invocation');
  t.equal(
    diagnostics.metricsSuppressedFromPersistence,
    1,
    'should count suppressed metrics persistence',
  );
  t.equal(diagnostics.persistMetricsLogs, false, 'should expose persistence setting');

  LoggingService.resetInstance();
});

test('LoggingService can update metrics persistence at runtime', async (t) => {
  LoggingService.resetInstance();
  const logger = LoggingService.getInstance();
  logger.initialize({
    nodeId: 'test-node',
    level: 'info',
    persistMetricsLogs: true,
  });

  logger.setPersistMetricsLogs(false);

  logger.info('metrics.transport.deliver', {
    durationMs: 1,
  });

  t.equal(
    logger.getBufferSize(),
    0,
    'should stop buffering metrics after runtime disable',
  );
  t.equal(
    logger.getDiagnosticsStats().persistMetricsLogs,
    false,
    'diagnostics should reflect runtime toggle',
  );

  LoggingService.resetInstance();
});

test('LoggingService applies per-tag metrics resolution throttling', async (t) => {
  LoggingService.resetInstance();
  const logger = LoggingService.getInstance();
  logger.initialize({
    nodeId: 'test-node',
    level: 'info',
    persistMetricsLogs: true,
    metricsDefaultResolutionMs: 60000,
  });

  logger.info('metrics.transport.deliver', {durationMs: 1});
  logger.info('metrics.transport.deliver', {durationMs: 2});
  logger.info('metrics.query.dispatch', {durationMs: 3});

  t.equal(
    logger.getBufferSize(),
    2,
    'should keep one metrics sample per tag inside resolution window',
  );

  const diagnostics = logger.getDiagnosticsStats();
  t.equal(
    diagnostics.metricsSuppressedByResolution,
    1,
    'should count metrics suppressed by resolution',
  );

  LoggingService.resetInstance();
});

test('LoggingService gates detailed metrics behind debug window', async (t) => {
  LoggingService.resetInstance();
  const logger = LoggingService.getInstance();
  const originalNow = Date.now;
  let nowMs = 1000;
  Date.now = () => nowMs;

  try {
    logger.initialize({
      nodeId: 'test-node',
      level: 'info',
      persistMetricsLogs: true,
      metricsDefaultResolutionMs: 0,
      metricsDetailedWindowTtlMs: 2000,
      metricsDetailedWindowEnabled: false,
    });

    logger.info('metrics.query.dispatch', {
      metricsDetailLevel: 'detailed',
      durationMs: 5,
    });

    t.equal(
      logger.getBufferSize(),
      0,
      'should suppress detailed metrics when window is disabled',
    );

    logger.setMetricsDetailedWindowEnabled(true);
    nowMs += 1000;

    logger.info('metrics.query.dispatch', {
      metricsDetailLevel: 'detailed',
      durationMs: 6,
    });

    t.equal(
      logger.getBufferSize(),
      1,
      'should emit detailed metrics while debug window is active',
    );

    nowMs += 3000;
    logger.info('metrics.query.dispatch', {
      metricsDetailLevel: 'detailed',
      durationMs: 7,
    });

    t.equal(
      logger.getBufferSize(),
      1,
      'should stop emitting detailed metrics after window expiry',
    );

    const diagnostics = logger.getDiagnosticsStats();
    t.equal(
      diagnostics.metricsSuppressedByDetailedWindow,
      2,
      'should count detailed metrics suppressed outside debug window',
    );
    t.equal(
      diagnostics.metricsDetailedWindowEnabled,
      false,
      'window should auto-disable after TTL expiry',
    );
  } finally {
    Date.now = originalNow;
    LoggingService.resetInstance();
  }
});

test('LoggingService exposes subsystem and metric-tag diagnostics', async (t) => {
  LoggingService.resetInstance();
  const logger = LoggingService.getInstance();
  logger.initialize({nodeId: 'test-node', level: 'info'});

  const queryLogger = logger.forSubsystem('query-executor');
  queryLogger.info('metrics.query.dispatch', {durationMs: 1});
  queryLogger.info('regular.log.message');

  const diagnostics = logger.getDiagnosticsStats();
  t.equal(diagnostics.totalLogs, 2, 'should track total logs');
  t.equal(diagnostics.metricsLogs, 1, 'should track metrics logs');
  t.equal(diagnostics.nonMetricsLogs, 1, 'should track non-metrics logs');
  t.equal(diagnostics.topMetricTags[0].tag, 'metrics.query.dispatch');
  t.equal(diagnostics.topSubsystems[0].subsystem, 'query-executor');

  LoggingService.resetInstance();
});

test('cleanup', async (t) => {
  LoggingService.resetInstance();
  ConfigurationManager.resetInstance();
  t.pass('cleanup complete');
});
