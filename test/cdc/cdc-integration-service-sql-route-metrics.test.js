/**
 * CDCIntegrationService CDC SQL Route Metrics Tests
 * Verifies metrics.cdc.sql_route log emission for executeSQL().
 * Requirements: 5.3, 5.4, 10.1, 10.3, 10.4, 11.1, 11.2, 11.3, 11.4
 */

import {test, beforeEach, afterEach} from '../../src/test-helpers/tap.js';
import {
  CDCIntegrationService,
} from '../../src/cdc/cdc-integration-service.js';
import {SystemTableName} from
  '../../src/bootstrap/system-table-schemas-constants.js';
import {METRICS_LOG_TAG} from '../../src/constants/index.js';
import {ConfigurationManager} from '../../src/config/configuration-manager.js';
import {LoggingService} from '../../src/logging/logging-service.js';

beforeEach(() => {
  ConfigurationManager.resetInstance();
  LoggingService.resetInstance();
  const config = ConfigurationManager.getInstance();
  config.initialize({});
  const logger = LoggingService.getInstance();
  logger.initialize({level: 'error'});
});

afterEach(() => {
  ConfigurationManager.resetInstance();
  LoggingService.resetInstance();
});

function createMockSqlEngine(result) {
  return {
    async executeQuery() {
      return result || {success: true, affectedRows: 1};
    },
  };
}

function createService(sqlEngine) {
  const service = new CDCIntegrationService({
    nodeId: 'test-node',
    sqlQueryEngine: sqlEngine || createMockSqlEngine(),
  });
  service.initialize();
  return service;
}

function collectInfoCalls(service) {
  const calls = [];
  const originalInfo = service.logger.info.bind(service.logger);
  service.logger.info = function(tag, data) {
    calls.push({tag, data});
    return originalInfo(tag, data);
  };
  return calls;
}

test('executeSQL emits metrics.cdc.sql_route on success', async (t) => {
  const service = createService();
  const infoCalls = collectInfoCalls(service);

  const sql = `INSERT INTO ${SystemTableName.SERVICES} (service_id) VALUES (?)`;
  await service.executeSQL(sql, ['svc-1']);

  const metric = infoCalls.find(
    (c) => c.tag === METRICS_LOG_TAG.CDC_SQL_ROUTE,
  );
  t.ok(metric, 'metrics.cdc.sql_route log emitted');
  t.equal(metric.data.tableName, SystemTableName.SERVICES);
  t.equal(typeof metric.data.durationMs, 'number');
  t.ok(metric.data.durationMs >= 0, 'durationMs non-negative');
  t.equal(metric.data.attempt, 1);
  t.equal(typeof metric.data.maxAttempts, 'number');
  t.equal(metric.data.bootstrapMode, false);
  t.end();
});

test('executeSQL sql_route metric has correct structured fields',
  async (t) => {
    const service = createService();
    const infoCalls = collectInfoCalls(service);

    const sql = `UPDATE ${SystemTableName.SERVICES} SET status = ?`;
    await service.executeSQL(sql, ['active']);

    const metric = infoCalls.find(
      (c) => c.tag === METRICS_LOG_TAG.CDC_SQL_ROUTE,
    );
    t.ok(metric, 'metric emitted');
    t.equal(typeof metric.data, 'object', 'data is structured object');
    t.ok('durationMs' in metric.data, 'has durationMs');
    t.ok('attempt' in metric.data, 'has attempt');
    t.ok('maxAttempts' in metric.data, 'has maxAttempts');
    t.ok('bootstrapMode' in metric.data, 'has bootstrapMode');
    t.ok('tableName' in metric.data, 'has tableName');
    t.equal(
      Number.isInteger(metric.data.durationMs), true,
      'durationMs is integer',
    );
    t.end();
  });

test('executeSQL sql_route metric not emitted on failure', async (t) => {
  const engine = {
    async executeQuery() {
      throw new Error('permanent failure');
    },
  };
  const service = createService(engine);
  const infoCalls = collectInfoCalls(service);

  try {
    await service.executeSQL('INSERT INTO nodes (node_id) VALUES (?)',
      ['n1']);
  } catch (_err) {
    // expected
  }

  const metric = infoCalls.find(
    (c) => c.tag === METRICS_LOG_TAG.CDC_SQL_ROUTE,
  );
  t.notOk(metric, 'no sql_route metric on failure');
  t.end();
});

test('executeSQL sql_route metric uses info level, not debug',
  async (t) => {
    const service = createService();
    const debugCalls = [];
    const originalDebug = service.logger.debug.bind(service.logger);
    service.logger.debug = function(tag, data) {
      debugCalls.push({tag, data});
      return originalDebug(tag, data);
    };

    const sql = `INSERT INTO ${SystemTableName.SERVICES} (service_id) VALUES (?)`;
    await service.executeSQL(sql, ['svc-1']);

    const debugMetric = debugCalls.find(
      (c) => c.tag === METRICS_LOG_TAG.CDC_SQL_ROUTE,
    );
    t.notOk(debugMetric, 'no sql_route metric at debug level');
    t.end();
  });

test('executeSQL does not break on logger failure for sql_route',
  async (t) => {
    const service = createService();
    const originalInfo = service.logger.info.bind(service.logger);
    service.logger.info = function(...args) {
      if (args[0] === METRICS_LOG_TAG.CDC_SQL_ROUTE) {
        throw new Error('logger broken');
      }
      return originalInfo(...args);
    };

    const sql = `INSERT INTO ${SystemTableName.SERVICES} (service_id) VALUES (?)`;
    const result = await service.executeSQL(sql, ['svc-1']);
    t.ok(result.success, 'executeSQL succeeds despite logger failure');
    t.end();
  });

test('executeSQL sql_route metric reflects retry attempt on transient',
  async (t) => {
    let callCount = 0;
    const engine = {
      async executeQuery() {
        callCount++;
        if (callCount === 1) {
          return {
            success: false,
            error: 'No leader available for write operation',
          };
        }
        return {success: true, affectedRows: 1};
      },
    };
    const service = createService(engine);
    service.retryDelayMs = 1;
    const infoCalls = collectInfoCalls(service);

    const sql = `INSERT INTO ${SystemTableName.SERVICES} (service_id) VALUES (?)`;
    await service.executeSQL(sql, ['svc-1']);

    const metric = infoCalls.find(
      (c) => c.tag === METRICS_LOG_TAG.CDC_SQL_ROUTE,
    );
    t.ok(metric, 'metric emitted after retry');
    t.equal(metric.data.attempt, 2, 'attempt reflects retry count');
    t.end();
  });

test('executeSQL does not emit sql_route metric for logs table writes',
  async (t) => {
    const service = createService();
    const infoCalls = collectInfoCalls(service);

    const sql =
      `INSERT INTO ${SystemTableName.LOGS} ` +
      '(log_id, timestamp, level, node_id, message, created_at) ' +
      'VALUES (?, ?, ?, ?, ?, ?)';
    await service.executeSQL(sql, [
      'log-1',
      Date.now(),
      'INFO',
      'node-1',
      'message',
      Date.now(),
    ]);

    const metric = infoCalls.find(
      (c) => c.tag === METRICS_LOG_TAG.CDC_SQL_ROUTE,
    );
    t.notOk(metric, 'no sql_route metric for logs table writes');
    t.end();
  });

test('executeSQL does not emit sql_route metric for nodes table writes',
  async (t) => {
    const service = createService();
    const infoCalls = collectInfoCalls(service);

    const sql = `UPDATE ${SystemTableName.NODES} SET status = ? WHERE node_id = ?`;
    await service.executeSQL(sql, ['active', 'node-1']);

    const metric = infoCalls.find(
      (c) => c.tag === METRICS_LOG_TAG.CDC_SQL_ROUTE,
    );
    t.notOk(metric, 'no sql_route metric for nodes table writes');
    t.end();
  });

test('executeSQL does not emit sql_route metric for node_endpoints table writes',
  async (t) => {
    const service = createService();
    const infoCalls = collectInfoCalls(service);

    const sql =
      `INSERT OR REPLACE INTO ${SystemTableName.NODE_ENDPOINTS} ` +
      '(endpoint_id, node_id) VALUES (?, ?)';
    await service.executeSQL(sql, ['ep-1', 'node-1']);

    const metric = infoCalls.find(
      (c) => c.tag === METRICS_LOG_TAG.CDC_SQL_ROUTE,
    );
    t.notOk(metric, 'no sql_route metric for node_endpoints table writes');
    t.end();
  });
