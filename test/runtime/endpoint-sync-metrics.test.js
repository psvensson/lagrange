import {describe, it} from 'node:test';
import assert from 'node:assert/strict';

import {
  ENDPOINT_SYNC_METRIC,
} from '../../src/runtime/endpoint-sync-constants.js';
import {
  EndpointSyncMetrics,
  normalizeNonNegativeNumber,
} from '../../src/runtime/endpoint-sync-metrics.js';

describe('endpoint-sync-metrics', () => {
  it('normalizes invalid values to zero', () => {
    assert.equal(normalizeNonNegativeNumber(-1), 0);
    assert.equal(normalizeNonNegativeNumber(Number.NaN), 0);
    assert.equal(normalizeNonNegativeNumber('bad'), 0);
  });

  it('starts with zero values for all metrics', () => {
    const metrics = new EndpointSyncMetrics();
    const snapshot = metrics.snapshot();

    assert.equal(snapshot[ENDPOINT_SYNC_METRIC.RECONCILE_DURATION_MS], 0);
    assert.equal(snapshot[ENDPOINT_SYNC_METRIC.RECONCILE_FAILURES_TOTAL], 0);
    assert.equal(snapshot[ENDPOINT_SYNC_METRIC.EXPORTED_SERVICES], 0);
    assert.equal(snapshot[ENDPOINT_SYNC_METRIC.EXPORTED_ENDPOINTS], 0);
    assert.equal(snapshot[ENDPOINT_SYNC_METRIC.PORT_CONFLICT_TOTAL], 0);
  });

  it('records and exposes reconcile metrics', () => {
    const metrics = new EndpointSyncMetrics();
    metrics.recordReconcileDurationMs(12);
    metrics.incrementReconcileFailures();
    metrics.setExportedServices(3);
    metrics.setExportedEndpoints(8);
    metrics.incrementPortConflicts(2);

    const snapshot = metrics.snapshot();
    assert.equal(snapshot[ENDPOINT_SYNC_METRIC.RECONCILE_DURATION_MS], 12);
    assert.equal(snapshot[ENDPOINT_SYNC_METRIC.RECONCILE_FAILURES_TOTAL], 1);
    assert.equal(snapshot[ENDPOINT_SYNC_METRIC.EXPORTED_SERVICES], 3);
    assert.equal(snapshot[ENDPOINT_SYNC_METRIC.EXPORTED_ENDPOINTS], 8);
    assert.equal(snapshot[ENDPOINT_SYNC_METRIC.PORT_CONFLICT_TOTAL], 2);
  });
});
