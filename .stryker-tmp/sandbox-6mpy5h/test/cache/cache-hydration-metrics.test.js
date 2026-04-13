/**
 * Cache Hydration Metrics Tests
 * Verifies metrics.hydration.table and metrics.hydration.complete
 * log emission for CacheHydrationService.
 * Requirements: 7.1, 7.2, 7.3, 10.1, 10.3, 10.4, 10.5, 11.1, 11.2, 11.3
 */
// @ts-nocheck


import {test} from '../../src/test-helpers/tap.js';
import {
  createBootstrapCacheHydrationApplier,
} from '../../src/bootstrap/bootstrap-cache-hydration-applier.js';
import {
  CacheHydrationService, SYSTEM_TABLES_TO_HYDRATE,
} from '../../src/cache/cache-hydration-service.js';
import {METRICS_LOG_TAG} from '../../src/constants/index.js';

function createMockQueryEngine(rowsByTable = {}) {
  return {
    executeQuery(sql) {
      const match = sql.match(/FROM\s+(\S+)/i);
      const table = match ? match[1] : '';
      const rows = rowsByTable[table] || [];
      return Promise.resolve({success: true, rows});
    },
  };
}

function createMockCache() {
  return {
    applySystemTableChange() {},
  };
}

function createSpyLogger() {
  const infoCalls = [];
  const errorCalls = [];
  return {
    calls: infoCalls,
    errorCalls,
    info(tag, data) {
      infoCalls.push({tag, data});
    },
    error(tag, data) {
      errorCalls.push({tag, data});
    },
    debug() {},
  };
}

function createHydrationOptions(cache, options = {}) {
  return {
    ...options,
    cdcEventApplier: createBootstrapCacheHydrationApplier(cache),
  };
}

// =============================================================
// hydrateTable — per-table metrics
// =============================================================

test('hydrateTable emits metrics.hydration.table with correct fields',
  async (t) => {
    const rows = [{id: 1}, {id: 2}, {id: 3}];
    const engine = createMockQueryEngine({nodes: rows});
    const cache = createMockCache();
    const logger = createSpyLogger();

    const service = new CacheHydrationService(
      engine, cache, createHydrationOptions(cache, {logger}),
    );
    await service.hydrateTable('nodes');

    const metric = logger.calls.find(
      (c) => c.tag === METRICS_LOG_TAG.HYDRATION_TABLE,
    );
    t.ok(metric, 'metrics.hydration.table log emitted');
    t.equal(metric.data.tableName, 'nodes');
    t.equal(metric.data.rowCount, 3);
    t.equal(typeof metric.data.durationMs, 'number');
    t.ok(metric.data.durationMs >= 0, 'durationMs non-negative');
    t.equal(typeof metric.data.rowsPerSecond, 'number');
    t.ok(metric.data.rowsPerSecond >= 0, 'rowsPerSecond non-negative');
    t.end();
  });

test('hydrateTable reports zero rowsPerSecond when durationMs is 0',
  async (t) => {
    const engine = createMockQueryEngine({nodes: [{id: 1}]});
    const cache = createMockCache();
    const logger = createSpyLogger();

    const service = new CacheHydrationService(
      engine, cache, createHydrationOptions(cache, {logger}),
    );
    await service.hydrateTable('nodes');

    const metric = logger.calls.find(
      (c) => c.tag === METRICS_LOG_TAG.HYDRATION_TABLE,
    );
    t.ok(metric, 'metric emitted');
    // durationMs may be 0 for fast in-memory ops; rowsPerSecond should be 0
    if (metric.data.durationMs === 0) {
      t.equal(metric.data.rowsPerSecond, 0,
        'rowsPerSecond is 0 when durationMs is 0');
    }
    t.end();
  });

test('hydrateTable emits metric with rowCount 0 for empty table',
  async (t) => {
    const engine = createMockQueryEngine({config: []});
    const cache = createMockCache();
    const logger = createSpyLogger();

    const service = new CacheHydrationService(
      engine, cache, createHydrationOptions(cache, {logger}),
    );
    await service.hydrateTable('config');

    const metric = logger.calls.find(
      (c) => c.tag === METRICS_LOG_TAG.HYDRATION_TABLE,
    );
    t.ok(metric, 'metric emitted for empty table');
    t.equal(metric.data.rowCount, 0);
    t.equal(metric.data.rowsPerSecond, 0);
    t.end();
  });

// =============================================================
// hydrateCache — total hydration metrics
// =============================================================

test('hydrateCache emits metrics.hydration.complete with correct fields',
  async (t) => {
    const rowsByTable = {};
    for (const table of SYSTEM_TABLES_TO_HYDRATE) {
      rowsByTable[table] = [{id: 1}, {id: 2}];
    }
    const engine = createMockQueryEngine(rowsByTable);
    const cache = createMockCache();
    const logger = createSpyLogger();

    const service = new CacheHydrationService(
      engine, cache, createHydrationOptions(cache, {logger}),
    );
    await service.hydrateCache();

    const metric = logger.calls.find(
      (c) => c.tag === METRICS_LOG_TAG.HYDRATION_COMPLETE,
    );
    t.ok(metric, 'metrics.hydration.complete log emitted');
    t.equal(metric.data.tableCount, SYSTEM_TABLES_TO_HYDRATE.length);
    t.equal(typeof metric.data.totalDurationMs, 'number');
    t.ok(metric.data.totalDurationMs >= 0, 'totalDurationMs non-negative');
    t.equal(metric.data.totalRows,
      SYSTEM_TABLES_TO_HYDRATE.length * 2);
    t.end();
  });

test('hydrateCache emits per-table metrics for each table',
  async (t) => {
    const rowsByTable = {};
    for (const table of SYSTEM_TABLES_TO_HYDRATE) {
      rowsByTable[table] = [{id: 1}];
    }
    const engine = createMockQueryEngine(rowsByTable);
    const cache = createMockCache();
    const logger = createSpyLogger();

    const service = new CacheHydrationService(
      engine, cache, createHydrationOptions(cache, {logger}),
    );
    await service.hydrateCache();

    const tableMetrics = logger.calls.filter(
      (c) => c.tag === METRICS_LOG_TAG.HYDRATION_TABLE,
    );
    t.equal(tableMetrics.length, SYSTEM_TABLES_TO_HYDRATE.length,
      'one per-table metric per hydrated table');
    t.end();
  });

test('hydrateCache uses info level not debug for metrics',
  async (t) => {
    const rowsByTable = {};
    for (const table of SYSTEM_TABLES_TO_HYDRATE) {
      rowsByTable[table] = [];
    }
    const engine = createMockQueryEngine(rowsByTable);
    const cache = createMockCache();

    const debugCalls = [];
    const logger = createSpyLogger();
    logger.debug = (tag, data) => {
      debugCalls.push({tag, data});
    };

    const service = new CacheHydrationService(
      engine, cache, createHydrationOptions(cache, {logger}),
    );
    await service.hydrateCache();

    const infoComplete = logger.calls.find(
      (c) => c.tag === METRICS_LOG_TAG.HYDRATION_COMPLETE,
    );
    const debugComplete = debugCalls.find(
      (c) => c.tag === METRICS_LOG_TAG.HYDRATION_COMPLETE,
    );
    t.ok(infoComplete, 'complete metric emitted at info level');
    t.notOk(debugComplete, 'complete metric not emitted at debug level');

    const infoTable = logger.calls.find(
      (c) => c.tag === METRICS_LOG_TAG.HYDRATION_TABLE,
    );
    const debugTable = debugCalls.find(
      (c) => c.tag === METRICS_LOG_TAG.HYDRATION_TABLE,
    );
    t.ok(infoTable, 'table metric emitted at info level');
    t.notOk(debugTable, 'table metric not emitted at debug level');
    t.end();
  });

test('hydrateCache still completes when table query fails',
  async (t) => {
    const engine = {
      executeQuery() {
        return Promise.resolve({success: false, error: 'query failed'});
      },
    };
    const cache = createMockCache();
    const logger = createSpyLogger();

    const service = new CacheHydrationService(
      engine, cache, createHydrationOptions(cache, {logger}),
    );
    const result = await service.hydrateCache();

    t.equal(result.success, false);
    const metric = logger.calls.find(
      (c) => c.tag === METRICS_LOG_TAG.HYDRATION_COMPLETE,
    );
    t.ok(metric, 'complete metric still emitted on partial failure');
    t.equal(metric.data.totalRows, 0);
    t.end();
  });
