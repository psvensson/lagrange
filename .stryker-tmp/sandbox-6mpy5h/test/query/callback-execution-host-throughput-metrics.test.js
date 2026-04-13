/**
 * Callback Execution Host Throughput Metrics Tests
 * Verifies metrics.callback.throughput log emission for
 * CallbackExecutionHost.execute().
 * Requirements: 8.1, 8.2, 8.3, 10.1, 10.3, 10.4, 10.5, 11.1, 11.2, 11.3
 */
// @ts-nocheck


import {test} from '../../src/test-helpers/tap.js';
import {
  CallbackExecutionHost,
} from '../../src/query/callback/callback-execution-host.js';
import {CALLBACK_RUNTIME_KIND} from
  '../../src/query/sql-adapter-constants.js';
import {STAGE_STATE} from
  '../../src/query/callback/callback-stage-constants.js';
import {METRICS_LOG_TAG} from '../../src/constants/index.js';
import {createCallbackDriverRegistry} from
  '../../src/query/callback/callback-runtime-driver-registry.js';
import {createRuntimeStartupWiring} from
  '../../src/runtime/runtime-startup-wiring.js';

function makeDescriptor() {
  return {
    callbackModuleRef: 'mod-1',
    callbackExport: 'run_batch',
    runtimeKind: CALLBACK_RUNTIME_KIND.NATIVE_JS,
  };
}

function makeBatches(count) {
  const batches = [];
  for (let i = 0; i < count; i++) {
    batches.push({
      partitionId: `p${i}`,
      rows: [{id: i + 1}],
    });
  }
  return batches;
}

function makeRegistry() {
  const runtimeWiring = createRuntimeStartupWiring();
  return createCallbackDriverRegistry({
    runtimeDriverRegistry: runtimeWiring.runtimeDriverRegistry,
  });
}

function createSpyLogger() {
  const infoCalls = [];
  const errorCalls = [];
  return {
    calls: infoCalls,
    errors: errorCalls,
    info(tag, data) {
      infoCalls.push({tag, data});
    },
    debug() {},
    warn() {},
    error(tag, data) {
      errorCalls.push({tag, data});
    },
  };
}

// Override logger so we can spy on info calls
function makeHostWithSpy(opts = {}) {
  const logger = createSpyLogger();
  const host = new CallbackExecutionHost({
    runtimeDriverRegistry: makeRegistry(),
    ...opts,
  });
  host.logger = logger;
  return {host, logger};
}

// =============================================================
// metrics.callback.throughput emission
// =============================================================

test('execute emits metrics.callback.throughput with correct fields',
  async (t) => {
    const handler = (batch) => batch.rows;
    const {host, logger} = makeHostWithSpy();

    await host.execute(makeBatches(2), makeDescriptor(), {handler});

    const metric = logger.calls.find(
      (c) => c.tag === METRICS_LOG_TAG.CALLBACK_THROUGHPUT,
    );
    t.ok(metric, 'metrics.callback.throughput log emitted');
    t.equal(metric.data.batchCount, 2);
    t.equal(metric.data.totalRows, 2);
    t.equal(typeof metric.data.totalBytes, 'number');
    t.ok(metric.data.totalBytes >= 0, 'totalBytes non-negative');
    t.equal(typeof metric.data.totalDurationMs, 'number');
    t.ok(metric.data.totalDurationMs >= 0,
      'totalDurationMs non-negative');
    t.equal(typeof metric.data.rowsPerSecond, 'number');
    t.ok(metric.data.rowsPerSecond >= 0,
      'rowsPerSecond non-negative');
    t.equal(typeof metric.data.avgBatchDurationMs, 'number');
    t.ok(metric.data.avgBatchDurationMs >= 0,
      'avgBatchDurationMs non-negative');
    t.equal(metric.data.failedPartitions, 0);
    t.end();
  });

test('execute emits exactly one throughput metric per call',
  async (t) => {
    const handler = (batch) => batch.rows;
    const {host, logger} = makeHostWithSpy();

    await host.execute(makeBatches(3), makeDescriptor(), {handler});

    const metrics = logger.calls.filter(
      (c) => c.tag === METRICS_LOG_TAG.CALLBACK_THROUGHPUT,
    );
    t.equal(metrics.length, 1,
      'one aggregate metric, not per-batch');
    t.end();
  });

test('execute reports failedPartitions count in metric',
  async (t) => {
    let callCount = 0;
    const handler = () => {
      callCount++;
      if (callCount === 2) throw new Error('batch fail');
      return [{id: 1}];
    };
    const {host, logger} = makeHostWithSpy();

    await host.execute(makeBatches(3), makeDescriptor(), {handler});

    const metric = logger.calls.find(
      (c) => c.tag === METRICS_LOG_TAG.CALLBACK_THROUGHPUT,
    );
    t.ok(metric, 'metric emitted');
    t.equal(metric.data.failedPartitions, 1);
    t.equal(metric.data.batchCount, 3);
    t.end();
  });

test('execute reports zero rowsPerSecond when totalDurationMs is 0',
  async (t) => {
    const handler = () => [];
    const {host, logger} = makeHostWithSpy();

    await host.execute(makeBatches(1), makeDescriptor(), {handler});

    const metric = logger.calls.find(
      (c) => c.tag === METRICS_LOG_TAG.CALLBACK_THROUGHPUT,
    );
    t.ok(metric, 'metric emitted');
    if (metric.data.totalDurationMs === 0) {
      t.equal(metric.data.rowsPerSecond, 0,
        'rowsPerSecond is 0 when duration is 0');
    }
    t.end();
  });

test('execute uses info level not debug for throughput metric',
  async (t) => {
    const handler = (batch) => batch.rows;
    const debugCalls = [];
    const {host, logger} = makeHostWithSpy();
    logger.debug = (tag, data) => {
      debugCalls.push({tag, data});
    };

    await host.execute(makeBatches(1), makeDescriptor(), {handler});

    const infoMetric = logger.calls.find(
      (c) => c.tag === METRICS_LOG_TAG.CALLBACK_THROUGHPUT,
    );
    const debugMetric = debugCalls.find(
      (c) => c.tag === METRICS_LOG_TAG.CALLBACK_THROUGHPUT,
    );
    t.ok(infoMetric,
      'throughput metric emitted at info level');
    t.notOk(debugMetric,
      'throughput metric not emitted at debug level');
    t.end();
  });

test('execute metric does not propagate logger failure',
  async (t) => {
    const handler = (batch) => batch.rows;
    const {host, logger} = makeHostWithSpy();
    // Make logger.info throw for the throughput tag
    const origInfo = logger.info.bind(logger);
    logger.info = (tag, data) => {
      if (tag === METRICS_LOG_TAG.CALLBACK_THROUGHPUT) {
        throw new Error('logger broken');
      }
      origInfo(tag, data);
    };

    const result = await host.execute(
      makeBatches(1), makeDescriptor(), {handler},
    );

    t.equal(result.state, STAGE_STATE.COMPLETED,
      'execute still completes when metrics log throws');
    t.equal(result.totalRows, 1);
    t.end();
  });
