/**
 * Endpoint sync reconcile metrics.
 *
 * Stores controller metric values in-memory for diagnostics and
 * external scraping adapters.
 *
 * @module runtime/endpoint-sync-metrics
 */

import {ENDPOINT_SYNC_METRIC} from './endpoint-sync-constants.js';

/**
 * Normalize metric values to non-negative numbers.
 *
 * @param {*} value - Candidate metric value.
 * @return {number}
 */
function normalizeNonNegativeNumber(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) {
    return 0;
  }
  return parsed;
}

/**
 * Controller metric storage for endpoint-sync.
 */
class EndpointSyncMetrics {
  constructor() {
    this._metrics = {
      [ENDPOINT_SYNC_METRIC.RECONCILE_DURATION_MS]: 0,
      [ENDPOINT_SYNC_METRIC.RECONCILE_FAILURES_TOTAL]: 0,
      [ENDPOINT_SYNC_METRIC.EXPORTED_SERVICES]: 0,
      [ENDPOINT_SYNC_METRIC.EXPORTED_ENDPOINTS]: 0,
      [ENDPOINT_SYNC_METRIC.PORT_CONFLICT_TOTAL]: 0,
    };
  }

  /**
   * Record reconcile duration metric.
   *
   * @param {number} durationMs - Reconcile duration.
   */
  recordReconcileDurationMs(durationMs) {
    this._metrics[ENDPOINT_SYNC_METRIC.RECONCILE_DURATION_MS] =
      normalizeNonNegativeNumber(durationMs);
  }

  /**
   * Increment reconcile failure counter.
   *
   * @param {number} [count=1] - Counter increment.
   */
  incrementReconcileFailures(count = 1) {
    this._metrics[ENDPOINT_SYNC_METRIC.RECONCILE_FAILURES_TOTAL] +=
      normalizeNonNegativeNumber(count);
  }

  /**
   * Set exported services gauge.
   *
   * @param {number} count - Exported service count.
   */
  setExportedServices(count) {
    this._metrics[ENDPOINT_SYNC_METRIC.EXPORTED_SERVICES] =
      normalizeNonNegativeNumber(count);
  }

  /**
   * Set exported endpoints gauge.
   *
   * @param {number} count - Exported endpoint count.
   */
  setExportedEndpoints(count) {
    this._metrics[ENDPOINT_SYNC_METRIC.EXPORTED_ENDPOINTS] =
      normalizeNonNegativeNumber(count);
  }

  /**
   * Increment strict-port conflict counter.
   *
   * @param {number} [count=1] - Counter increment.
   */
  incrementPortConflicts(count = 1) {
    this._metrics[ENDPOINT_SYNC_METRIC.PORT_CONFLICT_TOTAL] +=
      normalizeNonNegativeNumber(count);
  }

  /**
   * Return immutable metrics snapshot.
   *
   * @return {Readonly<Object>}
   */
  snapshot() {
    return Object.freeze({
      ...this._metrics,
    });
  }
}

export {
  normalizeNonNegativeNumber,
  EndpointSyncMetrics,
};
