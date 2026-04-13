// @ts-nocheck
import {test} from '../../src/test-helpers/tap.js';
import assert from 'node:assert/strict';
import {ConfigurationManager} from '../../src/config/configuration-manager.js';
import {LoggingService} from '../../src/logging/logging-service.js';
import {COLUMN, NUM, TABLES} from '../../src/constants/index.js';
import {
  LATENCY_MEASUREMENT_SAMPLE_QUALITY,
} from '../../src/topology/latency-measurement-constants.js';
import {
  LatencyMeasurementService,
} from '../../src/topology/latency-measurement-service.js';

function setupConfig(overrides = {}) {
  ConfigurationManager.resetInstance();
  LoggingService.resetInstance();
  const config = ConfigurationManager.getInstance();
  config.initialize({
    node: {id: 'node-a'},
    logging: {level: 'error'},
    latency: {
      groupThresholdMs: 100,
      recalcIntervalMs: 1000,
      recalcJitterRatio: 0.1,
      pingTimeoutMs: 50,
      pingRetryCount: 2,
      smoothingAlpha: 0.5,
      propagationMode: 'safe',
      ...overrides,
    },
  });
  const logging = LoggingService.getInstance();
  logging.initialize({level: 'error'});
}

function teardownConfig() {
  ConfigurationManager.resetInstance();
  LoggingService.resetInstance();
}

function createNowFn(sequence) {
  let index = 0;
  return () => {
    const value = sequence[Math.min(index, sequence.length - 1)];
    index += 1;
    return value;
  };
}

function createPingRouter(pingResults) {
  const state = {calls: 0};
  return {
    state,
    pingNode: async () => {
      const next = pingResults[Math.min(state.calls, pingResults.length - 1)];
      state.calls += 1;
      if (next instanceof Error) {
        throw next;
      }
      return next;
    },
  };
}

function createMockCdc() {
  const calls = [];
  return {
    calls,
    upsertSystemTableRow: async (tableName, row) => {
      calls.push({tableName, row});
      return {success: true};
    },
  };
}

function createMockCache(rowByKey = {}) {
  return {
    get: (_tableName, key) => rowByKey[key] || null,
  };
}

test('measureNodeLatency retries ping until success', async (t) => {
  setupConfig();
  const router = createPingRouter([false, false, true]);
  const cdc = createMockCdc();
  const service = new LatencyMeasurementService({
    nodeId: 'node-a',
    messageRouter: router,
    cdcIntegrationService: cdc,
    nowFn: createNowFn([1000, 1008, 2000, 2009, 3000, 3017]),
  });
  service.initialize();

  const result = await service.measureNodeLatency('node-b');
  assert.ok(result);
  assert.equal(result.attempt, 2);
  assert.equal(result.rttMs, 17);
  assert.equal(router.state.calls, 3);
  teardownConfig();
  t.end();
});

test('measureInterGroupLatency marks retry sample quality', async (t) => {
  setupConfig();
  const router = createPingRouter([false, true]);
  const cdc = createMockCdc();
  const service = new LatencyMeasurementService({
    nodeId: 'node-a',
    messageRouter: router,
    cdcIntegrationService: cdc,
    nowFn: createNowFn([100, 110, 200, 213, 220]),
  });
  service.initialize();

  const sample = await service.measureInterGroupLatency({
    sourceGroupId: 'g-a',
    targetGroupId: 'g-b',
    targetRepresentativeNodeId: 'node-b',
  });

  assert.ok(sample);
  assert.equal(sample.sourceGroupId, 'g-a');
  assert.equal(sample.targetGroupId, 'g-b');
  assert.equal(sample.sourceNodeId, 'node-a');
  assert.equal(sample.targetNodeId, 'node-b');
  assert.equal(sample.rttMs, 13);
  assert.equal(
    sample.sampleQuality,
    LATENCY_MEASUREMENT_SAMPLE_QUALITY.RETRY,
  );
  teardownConfig();
  t.end();
});

test('recordInterGroupSample applies smoothing and increments sample_count',
  async (t) => {
    setupConfig({smoothingAlpha: 0.5});
    const router = createPingRouter([true]);
    const cdc = createMockCdc();
    const cache = createMockCache({
      'g-a->g-b': {
        [COLUMN.LATENCY_EDGE_ID]: 'g-a->g-b',
        [COLUMN.LATENCY_MS]: 100,
        [COLUMN.SAMPLE_COUNT]: 4,
        [COLUMN.CREATED_AT]: 1234,
      },
    });
    const service = new LatencyMeasurementService({
      nodeId: 'node-a',
      messageRouter: router,
      systemTableCache: cache,
      cdcIntegrationService: cdc,
      nowFn: createNowFn([5000]),
    });
    service.initialize();

    const result = await service.recordInterGroupSample({
      sourceGroupId: 'g-a',
      targetGroupId: 'g-b',
      sourceNodeId: 'node-a',
      targetNodeId: 'node-b',
      rttMs: 70,
      timestamp: 5000,
      sampleQuality: LATENCY_MEASUREMENT_SAMPLE_QUALITY.GOOD,
    });

    assert.equal(result.success, true);
    assert.equal(cdc.calls.length, 1);
    assert.equal(cdc.calls[0].tableName, TABLES.INTER_GROUP_LATENCIES);
    assert.equal(cdc.calls[0].row[COLUMN.LATENCY_EDGE_ID], 'g-a->g-b');
    assert.equal(cdc.calls[0].row[COLUMN.SAMPLE_COUNT], 5);
    assert.equal(cdc.calls[0].row[COLUMN.LATENCY_MS], 85);
    teardownConfig();
    t.end();
  });

test('recordInterGroupSample ignores stale sample with diagnostics', async (t) => {
  setupConfig({recalcIntervalMs: 1000});
  const router = createPingRouter([true]);
  const cdc = createMockCdc();
  const ignoredEvents = [];
  const service = new LatencyMeasurementService({
    nodeId: 'node-a',
    messageRouter: router,
    cdcIntegrationService: cdc,
    nowFn: createNowFn([10000]),
  });
  service.initialize();
  service.on('sampleIgnored', (payload) => ignoredEvents.push(payload));

  const result = await service.recordInterGroupSample({
    sourceGroupId: 'g-a',
    targetGroupId: 'g-b',
    sourceNodeId: 'node-a',
    targetNodeId: 'node-b',
    rttMs: 10,
    timestamp: 1000,
    sampleQuality: LATENCY_MEASUREMENT_SAMPLE_QUALITY.GOOD,
  });

  assert.equal(result.success, false);
  assert.equal(result.ignored, true);
  assert.equal(cdc.calls.length, 0);
  assert.equal(ignoredEvents.length, 1);
  assert.equal(ignoredEvents[0].reason, 'stale_sample');
  teardownConfig();
  t.end();
});

test('measureAndRecordInterGroupLatency persists sample via CDC', async (t) => {
  setupConfig();
  const router = createPingRouter([true]);
  const cdc = createMockCdc();
  const service = new LatencyMeasurementService({
    nodeId: 'node-a',
    messageRouter: router,
    cdcIntegrationService: cdc,
    nowFn: createNowFn([100, 112, 120]),
  });
  service.initialize();

  const result = await service.measureAndRecordInterGroupLatency({
    sourceGroupId: 'g-a',
    targetGroupId: 'g-b',
    targetRepresentativeNodeId: 'node-b',
  });

  assert.equal(result.success, true);
  assert.ok(result.sample);
  assert.equal(cdc.calls.length, 1);
  assert.equal(cdc.calls[0].row[COLUMN.SAMPLE_COUNT], NUM.ONE);
  assert.equal(cdc.calls[0].row[COLUMN.LATENCY_MS], 12);
  teardownConfig();
  t.end();
});
