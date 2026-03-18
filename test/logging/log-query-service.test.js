/**
 * Log Query Service Tests
 * Requirements: 27.6, 27.7
 */

import {test} from '../../src/test-helpers/tap.js';
import {
  LogQueryService,
  DEFAULT_CONFIG,
  LOG_LEVEL_ORDER,
} from '../../src/logging/log-query-service.js';
import {ConfigurationManager} from '../../src/config/configuration-manager.js';

// Initialize configuration before tests
test('setup', async (t) => {
  ConfigurationManager.resetInstance();
  LogQueryService.resetInstance();

  const config = ConfigurationManager.getInstance();
  config.initialize({node: {id: 'test-node'}});
  t.pass('configuration initialized');
});

test('LogQueryService singleton', async (t) => {
  LogQueryService.resetInstance();
  const instance1 = LogQueryService.getInstance();
  const instance2 = LogQueryService.getInstance();
  t.equal(instance1, instance2, 'should return the same instance');
  LogQueryService.resetInstance();
});

test('LogQueryService initialization', async (t) => {
  LogQueryService.resetInstance();
  const service = LogQueryService.getInstance();

  t.notOk(service.isInitialized(), 'should not be initialized before initialize()');

  service.initialize();

  t.ok(service.isInitialized(), 'should be initialized after initialize()');

  LogQueryService.resetInstance();
});

test('LogQueryService default config', async (t) => {
  t.equal(DEFAULT_CONFIG.defaultLimit, 100, 'should have default limit');
  t.equal(DEFAULT_CONFIG.maxLimit, 10000, 'should have max limit');
  t.equal(DEFAULT_CONFIG.defaultTimeRangeMs, 3600000, 'should have default time range');
});

test('LOG_LEVEL_ORDER', async (t) => {
  t.equal(LOG_LEVEL_ORDER.TRACE, 0, 'TRACE should be 0');
  t.equal(LOG_LEVEL_ORDER.DEBUG, 1, 'DEBUG should be 1');
  t.equal(LOG_LEVEL_ORDER.INFO, 2, 'INFO should be 2');
  t.equal(LOG_LEVEL_ORDER.WARN, 3, 'WARN should be 3');
  t.equal(LOG_LEVEL_ORDER.ERROR, 4, 'ERROR should be 4');
  t.equal(LOG_LEVEL_ORDER.FATAL, 5, 'FATAL should be 5');
});

test('LogQueryService buildQuerySQL basic', async (t) => {
  LogQueryService.resetInstance();
  const service = LogQueryService.getInstance();
  service.initialize();

  const sql = service.getQuerySQL({});

  t.ok(sql.includes('SELECT'), 'should have SELECT');
  t.ok(sql.includes('FROM logs'), 'should query logs table');
  t.ok(sql.includes('ORDER BY timestamp DESC'), 'should order by timestamp DESC');
  t.ok(sql.includes('LIMIT 100'), 'should have default limit');

  LogQueryService.resetInstance();
});

test('LogQueryService buildQuerySQL with level filter', async (t) => {
  LogQueryService.resetInstance();
  const service = LogQueryService.getInstance();
  service.initialize();

  const sql = service.getQuerySQL({level: 'WARN'});

  t.ok(sql.includes('WHERE'), 'should have WHERE clause');
  t.ok(
    sql.includes('level IN (\'WARN\', \'ERROR\', \'FATAL\')'),
    'should filter by level and above',
  );

  LogQueryService.resetInstance();
});

test('LogQueryService buildQuerySQL with node filter', async (t) => {
  LogQueryService.resetInstance();
  const service = LogQueryService.getInstance();
  service.initialize();

  const sql = service.getQuerySQL({nodeId: 'node-1'});

  t.ok(sql.includes('node_id = \'node-1\''), 'should filter by node_id');

  LogQueryService.resetInstance();
});

test('LogQueryService buildQuerySQL with service filter', async (t) => {
  LogQueryService.resetInstance();
  const service = LogQueryService.getInstance();
  service.initialize();

  const sql = service.getQuerySQL({serviceId: 'svc-1'});

  t.ok(sql.includes('service_id = \'svc-1\''), 'should filter by service_id');

  LogQueryService.resetInstance();
});

test('LogQueryService buildQuerySQL with time range', async (t) => {
  LogQueryService.resetInstance();
  const service = LogQueryService.getInstance();
  service.initialize();

  const startTime = 1000000;
  const endTime = 2000000;
  const sql = service.getQuerySQL({startTime, endTime});

  t.ok(sql.includes(`timestamp >= ${startTime}`), 'should filter by start time');
  t.ok(sql.includes(`timestamp < ${endTime}`), 'should filter by end time');

  LogQueryService.resetInstance();
});

test('LogQueryService buildQuerySQL with message pattern', async (t) => {
  LogQueryService.resetInstance();
  const service = LogQueryService.getInstance();
  service.initialize();

  const sql = service.getQuerySQL({messagePattern: '%error%'});

  t.ok(sql.includes('message LIKE \'%error%\''), 'should filter by message pattern');

  LogQueryService.resetInstance();
});

test('LogQueryService buildQuerySQL with trace filter', async (t) => {
  LogQueryService.resetInstance();
  const service = LogQueryService.getInstance();
  service.initialize();

  const sql = service.getQuerySQL({traceId: 'trace-123'});

  t.ok(sql.includes('trace_id = \'trace-123\''), 'should filter by trace_id');

  LogQueryService.resetInstance();
});

test('LogQueryService buildQuerySQL with pagination', async (t) => {
  LogQueryService.resetInstance();
  const service = LogQueryService.getInstance();
  service.initialize();

  const sql = service.getQuerySQL({limit: 50, offset: 100});

  t.ok(sql.includes('LIMIT 50'), 'should have custom limit');
  t.ok(sql.includes('OFFSET 100'), 'should have offset');

  LogQueryService.resetInstance();
});

test('LogQueryService buildQuerySQL with custom order', async (t) => {
  LogQueryService.resetInstance();
  const service = LogQueryService.getInstance();
  service.initialize();

  const sql = service.getQuerySQL({orderBy: 'level', orderDir: 'ASC'});

  t.ok(sql.includes('ORDER BY level ASC'), 'should have custom order');

  LogQueryService.resetInstance();
});

test('LogQueryService buildQuerySQL sanitizes order column', async (t) => {
  LogQueryService.resetInstance();
  const service = LogQueryService.getInstance();
  service.initialize();

  t.throws(
    () => service.getQuerySQL({orderBy: 'invalid_column'}),
    /Invalid orderBy column/,
    'should reject invalid orderBy column',
  );

  LogQueryService.resetInstance();
});

test('LogQueryService buildQuerySQL limits max results', async (t) => {
  LogQueryService.resetInstance();
  const service = LogQueryService.getInstance();
  service.initialize();

  const sql = service.getQuerySQL({limit: 100000});

  t.ok(sql.includes('LIMIT 10000'), 'should cap at max limit');

  LogQueryService.resetInstance();
});

test('LogQueryService buildQuerySQL escapes strings', async (t) => {
  LogQueryService.resetInstance();
  const service = LogQueryService.getInstance();
  service.initialize();

  const sql = service.getQuerySQL({nodeId: 'node\'1'});

  t.ok(sql.includes('node_id = \'node\'\'1\''), 'should escape single quotes');

  LogQueryService.resetInstance();
});

test('LogQueryService buildQuerySQL with multiple filters', async (t) => {
  LogQueryService.resetInstance();
  const service = LogQueryService.getInstance();
  service.initialize();

  const sql = service.getQuerySQL({
    level: 'ERROR',
    nodeId: 'node-1',
    serviceType: 'partition',
    startTime: 1000000,
    endTime: 2000000,
  });

  t.ok(sql.includes('WHERE'), 'should have WHERE clause');
  t.ok(sql.includes('AND'), 'should combine conditions with AND');
  t.ok(sql.includes('level IN (\'ERROR\', \'FATAL\')'), 'should filter by level');
  t.ok(sql.includes('node_id = \'node-1\''), 'should filter by node');
  t.ok(sql.includes('service_type = \'partition\''), 'should filter by service type');
  t.ok(sql.includes('timestamp >= 1000000'), 'should filter by start time');
  t.ok(sql.includes('timestamp < 2000000'), 'should filter by end time');

  LogQueryService.resetInstance();
});

test('LogQueryService queryLogs without engine returns error', async (t) => {
  LogQueryService.resetInstance();
  const service = LogQueryService.getInstance();
  service.initialize();

  const result = await service.queryLogs({});

  t.notOk(result.success, 'should fail without engine');
  t.equal(result.outcome, 'owner_not_ready', 'should expose typed outcome');
  t.equal(
    result.errorCode,
    'SYSTEM_METADATA_GATEWAY_REQUIRED',
    'should have typed gateway-required error code',
  );

  LogQueryService.resetInstance();
});

test('LogQueryService queryLogs with mock engine', async (t) => {
  LogQueryService.resetInstance();

  const mockResults = [
    {log_id: 'log-1', level: 'INFO', message: 'Test'},
  ];

  const mockEngine = {
    executeQuery: async (_sql) => ({
      success: true,
      results: mockResults,
      count: 1,
    }),
  };

  const service = LogQueryService.getInstance();
  service.initialize({sqlQueryEngine: mockEngine});

  const result = await service.queryLogs({level: 'INFO'});

  t.ok(result.success, 'should succeed with engine');
  t.equal(result.count, 1, 'should return count');
  t.same(result.results, mockResults, 'should return results');

  LogQueryService.resetInstance();
});

test('LogQueryService getRecentLogs', async (t) => {
  LogQueryService.resetInstance();

  let capturedSQL = null;
  const mockEngine = {
    executeQuery: async (sql) => {
      capturedSQL = sql;
      return {success: true, results: [], count: 0};
    },
  };

  const service = LogQueryService.getInstance();
  service.initialize({sqlQueryEngine: mockEngine});

  await service.getRecentLogs(30);

  t.ok(capturedSQL, 'should execute query');
  t.ok(capturedSQL.includes('timestamp >='), 'should have start time');
  t.ok(capturedSQL.includes('timestamp <'), 'should have end time');

  LogQueryService.resetInstance();
});

test('LogQueryService getErrorLogs', async (t) => {
  LogQueryService.resetInstance();

  let capturedSQL = null;
  const mockEngine = {
    executeQuery: async (sql) => {
      capturedSQL = sql;
      return {success: true, results: [], count: 0};
    },
  };

  const service = LogQueryService.getInstance();
  service.initialize({sqlQueryEngine: mockEngine});

  await service.getErrorLogs();

  t.ok(capturedSQL, 'should execute query');
  t.ok(capturedSQL.includes('level IN (\'ERROR\', \'FATAL\')'), 'should filter ERROR and above');

  LogQueryService.resetInstance();
});

test('LogQueryService getLogsByTrace orders ASC', async (t) => {
  LogQueryService.resetInstance();

  let capturedSQL = null;
  const mockEngine = {
    executeQuery: async (sql) => {
      capturedSQL = sql;
      return {success: true, results: [], count: 0};
    },
  };

  const service = LogQueryService.getInstance();
  service.initialize({sqlQueryEngine: mockEngine});

  await service.getLogsByTrace('trace-123');

  t.ok(capturedSQL, 'should execute query');
  t.ok(capturedSQL.includes('trace_id = \'trace-123\''), 'should filter by trace');
  t.ok(capturedSQL.includes('ORDER BY timestamp ASC'), 'should order ASC for traces');

  LogQueryService.resetInstance();
});

test('LogQueryService countByLevel', async (t) => {
  LogQueryService.resetInstance();

  let capturedSQL = null;
  const mockEngine = {
    executeQuery: async (sql) => {
      capturedSQL = sql;
      return {success: true, results: [], count: 0};
    },
  };

  const service = LogQueryService.getInstance();
  service.initialize({sqlQueryEngine: mockEngine});

  await service.countByLevel(1000000, 2000000);

  t.ok(capturedSQL, 'should execute query');
  t.ok(capturedSQL.includes('GROUP BY level'), 'should group by level');
  t.ok(capturedSQL.includes('COUNT(*)'), 'should count');

  LogQueryService.resetInstance();
});

test('LogQueryService getLogCountTimeSeries', async (t) => {
  LogQueryService.resetInstance();

  let capturedSQL = null;
  const mockEngine = {
    executeQuery: async (sql) => {
      capturedSQL = sql;
      return {success: true, results: [], count: 0};
    },
  };

  const service = LogQueryService.getInstance();
  service.initialize({sqlQueryEngine: mockEngine});

  await service.getLogCountTimeSeries(1000000, 2000000, 60000);

  t.ok(capturedSQL, 'should execute query');
  t.ok(capturedSQL.includes('time_bucket'), 'should have time bucket');
  t.ok(capturedSQL.includes('GROUP BY time_bucket'), 'should group by time bucket');
  t.ok(capturedSQL.includes('ORDER BY time_bucket ASC'), 'should order by time bucket');

  LogQueryService.resetInstance();
});

test('LogQueryService searchLogs', async (t) => {
  LogQueryService.resetInstance();

  let capturedSQL = null;
  const mockEngine = {
    executeQuery: async (sql) => {
      capturedSQL = sql;
      return {success: true, results: [], count: 0};
    },
  };

  const service = LogQueryService.getInstance();
  service.initialize({sqlQueryEngine: mockEngine});

  await service.searchLogs('error');

  t.ok(capturedSQL, 'should execute query');
  t.ok(capturedSQL.includes('message LIKE \'%error%\''), 'should search in message');

  LogQueryService.resetInstance();
});

test('LogQueryService shutdown', async (t) => {
  LogQueryService.resetInstance();
  const service = LogQueryService.getInstance();
  service.initialize();

  service.shutdown();

  t.notOk(service.isInitialized(), 'should not be initialized after shutdown');

  LogQueryService.resetInstance();
});

test('cleanup', async (t) => {
  LogQueryService.resetInstance();
  ConfigurationManager.resetInstance();
  t.pass('cleanup complete');
});
