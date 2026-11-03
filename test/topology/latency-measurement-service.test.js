import {test} from '../../src/test-helpers/tap.js';
import assert from 'node:assert/strict';
import {COLUMN, TABLES} from '../../src/constants/index.js';
import {
  LATENCY_MEASUREMENT_REASON,
  LATENCY_MEASUREMENT_SAMPLE_QUALITY,
} from '../../src/topology/latency-measurement-constants.js';
import {
  LatencyMeasurementService,
} from '../../src/topology/latency-measurement-service.js';
import {
  setupLatencyTestConfig as setupConfig,
  teardownLatencyTestConfig as teardownConfig,
} from './latency-test-config.js';

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

// The committed authority behind the gateway (census site 5, lead decision
// 2026-11-02): conditional writes are decided against `rows`; the
// projection (`projection`) is paused - it never reflects a write - and
// every read of it is counted.
function createCommittedGateway(rows = {}) {
  const gateway = {
    rows: new Map(Object.entries(rows)),
    writes: [],
    committedReads: 0,
    readUnavailable: false,
    async readAuthoritativeRows(tableName, _sql, params) {
      gateway.committedReads += 1;
      if (gateway.readUnavailable) {
        return {success: false, error: 'authoritative_row_source_unavailable',
          retryAfterMs: 250};
      }
      const row = gateway.rows.get(params[0]);
      return {success: true, rows: row ? [{...row}] : [], tableName};
    },
    async submitMutation(mutation, options) {
      gateway.writes.push({mutation, options});
      if (mutation.operation === 'insert') {
        const key = mutation.row[COLUMN.LATENCY_EDGE_ID];
        if (gateway.rows.has(key) && options?.ignoreExisting === true) {
          return {success: true, partitionResult: {affectedRows: 0}};
        }
        gateway.rows.set(key, {...mutation.row});
        return {success: true, partitionResult: {affectedRows: 1}};
      }
      const key = mutation.whereClause[COLUMN.LATENCY_EDGE_ID];
      const current = gateway.rows.get(key);
      const matches = current && Object.entries(mutation.whereClause)
        .every(([column, value]) => current[column] === value);
      if (!matches) {
        return {success: true, partitionResult: {affectedRows: 0}};
      }
      gateway.rows.set(key, {...current, ...mutation.data});
      return {success: true, partitionResult: {affectedRows: 1}};
    },
  };
  return gateway;
}

function createPausedProjection() {
  const projection = {reads: 0};
  projection.get = () => {
    projection.reads += 1;
    return null;
  };
  return projection;
}

const SAMPLE = Object.freeze({
  sourceGroupId: 'g-a',
  targetGroupId: 'g-b',
  sourceNodeId: 'node-a',
  targetNodeId: 'node-b',
  rttMs: 70,
  timestamp: 5000,
  sampleQuality: LATENCY_MEASUREMENT_SAMPLE_QUALITY.GOOD,
});

function createRecordingService(gateway, projection) {
  const service = new LatencyMeasurementService({
    nodeId: 'node-a',
    messageRouter: createPingRouter([true]),
    systemTableCache: projection,
    cdcIntegrationService: createMockCdc(),
    controlPlaneSystemTableGateway: gateway,
    nowFn: createNowFn([5000]),
  });
  service.initialize();
  return service;
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

// Re-derived (census site 5): the smoothing base is the committed edge row
// (one committed read at an unknown position), never the projection.
test('recordInterGroupSample applies smoothing and increments sample_count',
  async (t) => {
    setupConfig({smoothingAlpha: 0.5});
    const gateway = createCommittedGateway({
      'g-a->g-b': {
        [COLUMN.LATENCY_EDGE_ID]: 'g-a->g-b',
        [COLUMN.LATENCY_MS]: 100,
        [COLUMN.SAMPLE_COUNT]: 4,
        [COLUMN.CREATED_AT]: 1234,
      },
    });
    const projection = createPausedProjection();
    const service = createRecordingService(gateway, projection);

    const result = await service.recordInterGroupSample({...SAMPLE});

    assert.equal(result.success, true);
    assert.equal(gateway.writes.length, 1);
    const [{mutation}] = gateway.writes;
    assert.equal(mutation.tableName, TABLES.INTER_GROUP_LATENCIES);
    assert.deepEqual(mutation.whereClause, {
      [COLUMN.LATENCY_EDGE_ID]: 'g-a->g-b',
      [COLUMN.SAMPLE_COUNT]: 4,
    }, 'the update is conditional on the committed sample_count');
    assert.equal(mutation.data[COLUMN.SAMPLE_COUNT], 5);
    assert.equal(mutation.data[COLUMN.LATENCY_MS], 85);
    assert.equal(projection.reads, 0, 'no projection read');
    teardownConfig();
    t.end();
  });

test('site 5: with the projection paused, consecutive samples keep the ' +
  'committed row as their base - one committed read, zero projection reads',
async (t) => {
  setupConfig({smoothingAlpha: 0.5});
  const gateway = createCommittedGateway();
  const projection = createPausedProjection();
  const service = createRecordingService(gateway, projection);

  const first = await service.recordInterGroupSample({...SAMPLE, rttMs: 10});
  const second = await service.recordInterGroupSample({...SAMPLE, rttMs: 30});

  assert.equal(first.success, true);
  assert.equal(second.success, true);
  assert.equal(gateway.committedReads, 1,
    'only the first sample (unknown position) reads the committed row');
  assert.equal(projection.reads, 0, 'no projection read');
  assert.equal(gateway.writes[0].mutation.operation, 'insert');
  assert.equal(gateway.writes[0].options.ignoreExisting, true,
    'the first write creates the edge only if no other writer has');
  assert.deepEqual(gateway.writes[1].mutation.whereClause, {
    [COLUMN.LATENCY_EDGE_ID]: 'g-a->g-b',
    [COLUMN.SAMPLE_COUNT]: 1,
  }, 'the second write is conditional on the kept sample_count');
  const committed = gateway.rows.get('g-a->g-b');
  assert.equal(committed[COLUMN.SAMPLE_COUNT], 2);
  assert.equal(committed[COLUMN.LATENCY_MS], 20);
  teardownConfig();
  t.end();
});

test('site 5: a second writer between samples answers a typed conflict, ' +
  'loses no update, and the next sample re-reads the committed row',
async (t) => {
  setupConfig({smoothingAlpha: 0.5});
  const gateway = createCommittedGateway();
  const projection = createPausedProjection();
  const service = createRecordingService(gateway, projection);

  await service.recordInterGroupSample({...SAMPLE, rttMs: 10});
  // Another node's sample lands on the same edge.
  const otherWriter = {...gateway.rows.get('g-a->g-b'),
    [COLUMN.SAMPLE_COUNT]: 2, [COLUMN.LATENCY_MS]: 50};
  gateway.rows.set('g-a->g-b', otherWriter);

  const conflicted = await service.recordInterGroupSample(
    {...SAMPLE, rttMs: 30});
  assert.equal(conflicted.success, false);
  assert.equal(conflicted.conflict, true);
  assert.equal(conflicted.reason, LATENCY_MEASUREMENT_REASON.EDGE_CONFLICT);
  assert.deepEqual(gateway.rows.get('g-a->g-b'), otherWriter,
    'the other writer\'s committed sample is not overwritten');

  const readsBefore = gateway.committedReads;
  const next = await service.recordInterGroupSample({...SAMPLE, rttMs: 30});
  assert.equal(next.success, true);
  assert.equal(gateway.committedReads, readsBefore + 1,
    'after a conflict the base is re-read from the committed authority');
  assert.equal(gateway.rows.get('g-a->g-b')[COLUMN.SAMPLE_COUNT], 3);
  assert.equal(gateway.rows.get('g-a->g-b')[COLUMN.LATENCY_MS], 40);
  assert.equal(projection.reads, 0, 'no projection read');
  teardownConfig();
  t.end();
});

test('site 5: an unavailable committed read answers typed and writes ' +
  'nothing', async (t) => {
  setupConfig();
  const gateway = createCommittedGateway();
  gateway.readUnavailable = true;
  const projection = createPausedProjection();
  const service = createRecordingService(gateway, projection);

  const result = await service.recordInterGroupSample({...SAMPLE});
  assert.equal(result.success, false);
  assert.equal(result.reason,
    LATENCY_MEASUREMENT_REASON.EDGE_BASE_UNAVAILABLE);
  assert.equal(result.retryAfterMs, 250);
  assert.equal(gateway.writes.length, 0, 'no write without a committed base');
  assert.equal(projection.reads, 0, 'no projection read');
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
  const gateway = createCommittedGateway();
  const service = new LatencyMeasurementService({
    nodeId: 'node-a',
    messageRouter: router,
    cdcIntegrationService: createMockCdc(),
    controlPlaneSystemTableGateway: gateway,
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
  assert.equal(gateway.writes.length, 1);
  assert.equal(gateway.writes[0].mutation.row[COLUMN.SAMPLE_COUNT], 1);
  assert.equal(gateway.writes[0].mutation.row[COLUMN.LATENCY_MS], 12);
  teardownConfig();
  t.end();
});
