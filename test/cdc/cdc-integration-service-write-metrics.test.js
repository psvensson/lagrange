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

test('insertSystemTableRow emits metrics.cdc.write on success',
  async (t) => {
    const service = createService();
    const infoCalls = collectInfoCalls(service);

    await service.insertSystemTableRow(
      SystemTableName.NODES, makeNodeData(),
    );

    const metric = infoCalls.find(
      (c) => c.tag === METRICS_LOG_TAG.CDC_WRITE,
    );
    t.ok(metric, 'metrics.cdc.write log emitted');
    t.equal(metric.data.tableName, SystemTableName.NODES);
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
      SystemTableName.NODES,
      {node_id: 'node-1'},
      {status: 'ready'},
    );

    const metric = infoCalls.find(
      (c) => c.tag === METRICS_LOG_TAG.CDC_WRITE,
    );
    t.ok(metric, 'metrics.cdc.write log emitted');
    t.equal(metric.data.tableName, SystemTableName.NODES);
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
      SystemTableName.NODES, makeNodeData(),
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
    SystemTableName.NODES, makeNodeData(),
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
      SystemTableName.NODES, makeNodeData(),
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
      SystemTableName.NODES,
      {node_id: 'node-1'},
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
      SystemTableName.NODES, makeNodeData(),
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
