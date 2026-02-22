/**
 * CDCIntegrationService CDC Write Metrics Tests
 * Verifies metrics.cdc.write log emission for insert and update.
 * Requirements: 5.1, 5.2, 5.4, 5.5, 10.1, 10.3, 10.4, 11.1, 11.2, 11.3, 11.4
 */

import {test, beforeEach, afterEach} from '../../src/test-helpers/tap.js';
import {
  CDCIntegrationService,
} from '../../src/cdc/cdc-integration-service.js';
import {SystemTableName} from
  '../../src/bootstrap/system-table-schemas-constants.js';
import {
  CDC_OPERATION, METRICS_LOG_TAG,
} from '../../src/constants/index.js';
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

function createMockSqlEngine() {
  return {
    async executeQuery() {
      return {success: true, affectedRows: 1};
    },
  };
}

function createFailingSqlEngine() {
  return {
    async executeQuery() {
      return {success: false, error: 'forced write failure'};
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

function collectErrorCalls(service) {
  const calls = [];
  const originalError = service.logger.error.bind(service.logger);
  service.logger.error = function(tag, data) {
    calls.push({tag, data});
    return originalError(tag, data);
  };
  return calls;
}

function makeNodeData() {
  return {
    node_id: 'node-1',
    node_address: 'localhost:8080',
    cpu_cores: 4,
    memory_mb: 8192,
    disk_gb: 100,
    status: 'active',
    last_heartbeat: Date.now(),
    created_at: Date.now(),
  };
}

function makeServiceData() {
  return {
    service_id: 'svc-1',
    service_type: 'partition',
    node_id: 'node-1',
    status: 'active',
    created_at: Date.now(),
    updated_at: Date.now(),
  };
}

function makeLogData() {
  return {
    log_id: 'log-1',
    timestamp: Date.now(),
    level: 'INFO',
    node_id: 'node-1',
    message: 'test log',
    created_at: Date.now(),
  };
}

test('insertSystemTableRow emits metrics.cdc.write on success',
  async (t) => {
    const service = createService();
    const infoCalls = collectInfoCalls(service);

    await service.insertSystemTableRow(
      SystemTableName.SERVICES, makeServiceData(),
    );

    const metric = infoCalls.find(
      (c) => c.tag === METRICS_LOG_TAG.CDC_WRITE,
    );
    t.ok(metric, 'metrics.cdc.write log emitted');
    t.equal(metric.data.tableName, SystemTableName.SERVICES);
    t.equal(metric.data.operation, CDC_OPERATION.INSERT);
    t.equal(typeof metric.data.sqlDurationMs, 'number');
    t.ok(metric.data.sqlDurationMs >= 0, 'sqlDurationMs non-negative');
    t.equal(typeof metric.data.cacheWaitDurationMs, 'number');
    t.ok(
      metric.data.cacheWaitDurationMs >= 0,
      'cacheWaitDurationMs non-negative',
    );
    t.equal(typeof metric.data.totalDurationMs, 'number');
    t.ok(metric.data.totalDurationMs >= 0, 'totalDurationMs non-negative');
    t.end();
  });

test('updateSystemTableRow emits metrics.cdc.write on success',
  async (t) => {
    const service = createService();
    const infoCalls = collectInfoCalls(service);

    await service.updateSystemTableRow(
      SystemTableName.SERVICES,
      {service_id: 'svc-1'},
      {status: 'ready'},
    );

    const metric = infoCalls.find(
      (c) => c.tag === METRICS_LOG_TAG.CDC_WRITE,
    );
    t.ok(metric, 'metrics.cdc.write log emitted');
    t.equal(metric.data.tableName, SystemTableName.SERVICES);
    t.equal(metric.data.operation, CDC_OPERATION.UPDATE);
    t.equal(typeof metric.data.sqlDurationMs, 'number');
    t.ok(metric.data.sqlDurationMs >= 0, 'sqlDurationMs non-negative');
    t.equal(typeof metric.data.cacheWaitDurationMs, 'number');
    t.ok(
      metric.data.cacheWaitDurationMs >= 0,
      'cacheWaitDurationMs non-negative',
    );
    t.equal(typeof metric.data.totalDurationMs, 'number');
    t.ok(metric.data.totalDurationMs >= 0, 'totalDurationMs non-negative');
    t.end();
  });

test('CDC write metric totalDurationMs equals sql + cacheWait',
  async (t) => {
    const service = createService();
    const infoCalls = collectInfoCalls(service);

    await service.insertSystemTableRow(
      SystemTableName.SERVICES, makeServiceData(),
    );

    const metric = infoCalls.find(
      (c) => c.tag === METRICS_LOG_TAG.CDC_WRITE,
    );
    t.equal(
      metric.data.totalDurationMs,
      metric.data.sqlDurationMs + metric.data.cacheWaitDurationMs,
      'totalDurationMs is sum of sql and cacheWait',
    );
    t.end();
  });

test('CDC write metric uses info level, not debug', async (t) => {
  const service = createService();
  const debugCalls = [];
  const originalDebug = service.logger.debug.bind(service.logger);
  service.logger.debug = function(tag, data) {
    debugCalls.push({tag, data});
    return originalDebug(tag, data);
  };

  await service.insertSystemTableRow(
    SystemTableName.SERVICES, makeServiceData(),
  );

  const debugMetric = debugCalls.find(
    (c) => c.tag === METRICS_LOG_TAG.CDC_WRITE,
  );
  t.notOk(debugMetric, 'no CDC write metric at debug level');
  t.end();
});

test('CDC write metric does not break insert on logger failure',
  async (t) => {
    const service = createService();
    const originalInfo = service.logger.info.bind(service.logger);
    service.logger.info = function(...args) {
      if (args[0] === METRICS_LOG_TAG.CDC_WRITE) {
        throw new Error('logger broken');
      }
      return originalInfo(...args);
    };

    const result = await service.insertSystemTableRow(
      SystemTableName.SERVICES, makeServiceData(),
    );
    t.ok(result.success, 'insert succeeds despite logger failure');
    t.end();
  });

test('CDC write metric does not break update on logger failure',
  async (t) => {
    const service = createService();
    const originalInfo = service.logger.info.bind(service.logger);
    service.logger.info = function(...args) {
      if (args[0] === METRICS_LOG_TAG.CDC_WRITE) {
        throw new Error('logger broken');
      }
      return originalInfo(...args);
    };

    const result = await service.updateSystemTableRow(
      SystemTableName.SERVICES,
      {service_id: 'svc-1'},
      {status: 'ready'},
    );
    t.ok(result.success, 'update succeeds despite logger failure');
    t.end();
  });

test('CDC write metric has structured fields with correct types',
  async (t) => {
    const service = createService();
    const infoCalls = collectInfoCalls(service);

    await service.insertSystemTableRow(
      SystemTableName.SERVICES, makeServiceData(),
    );

    const metric = infoCalls.find(
      (c) => c.tag === METRICS_LOG_TAG.CDC_WRITE,
    );
    t.ok(metric, 'metric emitted');
    t.equal(typeof metric.data, 'object', 'data is structured object');
    t.ok('tableName' in metric.data, 'has tableName');
    t.ok('operation' in metric.data, 'has operation');
    t.ok('sqlDurationMs' in metric.data, 'has sqlDurationMs');
    t.ok('cacheWaitDurationMs' in metric.data, 'has cacheWaitDurationMs');
    t.ok('totalDurationMs' in metric.data, 'has totalDurationMs');
    t.equal(
      Number.isInteger(metric.data.sqlDurationMs), true,
      'sqlDurationMs is integer',
    );
    t.equal(
      Number.isInteger(metric.data.cacheWaitDurationMs), true,
      'cacheWaitDurationMs is integer',
    );
    t.equal(
      Number.isInteger(metric.data.totalDurationMs), true,
      'totalDurationMs is integer',
    );
    t.end();
  });

test('insertSystemTableRow does not emit metrics.cdc.write for logs table',
  async (t) => {
    const service = createService();
    const infoCalls = collectInfoCalls(service);

    await service.insertSystemTableRow(
      SystemTableName.LOGS, makeLogData(),
    );

    const metric = infoCalls.find(
      (c) => c.tag === METRICS_LOG_TAG.CDC_WRITE,
    );
    t.notOk(metric, 'no metrics.cdc.write for logs table inserts');
    t.end();
  });

test('insertSystemTableRow suppresses error logs for logs table write failures',
  async (t) => {
    const service = createService(createFailingSqlEngine());
    const errorCalls = collectErrorCalls(service);

    try {
      await service.insertSystemTableRow(
        SystemTableName.LOGS, makeLogData(),
      );
      t.fail('insert should fail when SQL engine reports failure');
    } catch (error) {
      t.match(error.message, /forced write failure/,
        'should surface underlying write failure');
    }

    t.equal(errorCalls.length, 0,
      'should not emit logger error for logs table write failures');
    t.end();
  });

test('insertSystemTableRow logs errors for non-logs table write failures',
  async (t) => {
    const service = createService(createFailingSqlEngine());
    const errorCalls = collectErrorCalls(service);

    try {
      await service.insertSystemTableRow(
        SystemTableName.SERVICES, makeServiceData(),
      );
      t.fail('insert should fail when SQL engine reports failure');
    } catch (error) {
      t.match(error.message, /forced write failure/,
        'should surface underlying write failure');
    }

    t.ok(errorCalls.length > 0, 'should emit logger error for non-logs tables');
    t.match(errorCalls[0].tag, /Failed to insert/,
      'should emit standard insert failure log message');
    t.end();
  });

test('updateSystemTableRow does not emit metrics.cdc.write for logs table',
  async (t) => {
    const service = createService();
    const infoCalls = collectInfoCalls(service);

    await service.updateSystemTableRow(
      SystemTableName.LOGS,
      {log_id: 'log-1'},
      {message: 'updated'},
    );

    const metric = infoCalls.find(
      (c) => c.tag === METRICS_LOG_TAG.CDC_WRITE,
    );
    t.notOk(metric, 'no metrics.cdc.write for logs table updates');
    t.end();
  });

test('insertSystemTableRow does not emit metrics.cdc.write for nodes table',
  async (t) => {
    const service = createService();
    const infoCalls = collectInfoCalls(service);

    await service.insertSystemTableRow(
      SystemTableName.NODES, makeNodeData(),
    );

    const metric = infoCalls.find(
      (c) => c.tag === METRICS_LOG_TAG.CDC_WRITE,
    );
    t.notOk(metric, 'no metrics.cdc.write for nodes table inserts');
    t.end();
  });

test('updateSystemTableRow does not emit metrics.cdc.write for nodes table',
  async (t) => {
    const service = createService();
    const infoCalls = collectInfoCalls(service);

    await service.updateSystemTableRow(
      SystemTableName.NODES,
      {node_id: 'node-1'},
      {status: 'ready'},
    );

    const metric = infoCalls.find(
      (c) => c.tag === METRICS_LOG_TAG.CDC_WRITE,
    );
    t.notOk(metric, 'no metrics.cdc.write for nodes table updates');
    t.end();
  });
