/**
 * Endpoint sync reconcile metrics.
 *
 * Stores controller metric values in-memory for diagnostics and
 * external scraping adapters.
 *
 * @module runtime/endpoint-sync-metrics
 */
// @ts-nocheck
function stryNS_9fa48() {
  var g = typeof globalThis === 'object' && globalThis && globalThis.Math === Math && globalThis || new Function("return this")();
  var ns = g.__stryker__ || (g.__stryker__ = {});
  if (ns.activeMutant === undefined && g.process && g.process.env && g.process.env.__STRYKER_ACTIVE_MUTANT__) {
    ns.activeMutant = g.process.env.__STRYKER_ACTIVE_MUTANT__;
  }
  function retrieveNS() {
    return ns;
  }
  stryNS_9fa48 = retrieveNS;
  return retrieveNS();
}
stryNS_9fa48();
function stryCov_9fa48() {
  var ns = stryNS_9fa48();
  var cov = ns.mutantCoverage || (ns.mutantCoverage = {
    static: {},
    perTest: {}
  });
  function cover() {
    var c = cov.static;
    if (ns.currentTestId) {
      c = cov.perTest[ns.currentTestId] = cov.perTest[ns.currentTestId] || {};
    }
    var a = arguments;
    for (var i = 0; i < a.length; i++) {
      c[a[i]] = (c[a[i]] || 0) + 1;
    }
  }
  stryCov_9fa48 = cover;
  cover.apply(null, arguments);
}
function stryMutAct_9fa48(id) {
  var ns = stryNS_9fa48();
  function isActive(id) {
    if (ns.activeMutant === id) {
      if (ns.hitCount !== void 0 && ++ns.hitCount > ns.hitLimit) {
        throw new Error('Stryker: Hit count limit reached (' + ns.hitCount + ')');
      }
      return true;
    }
    return false;
  }
  stryMutAct_9fa48 = isActive;
  return isActive(id);
}
import { NUM } from '../constants/index.js';
import { ENDPOINT_SYNC_METRIC } from './endpoint-sync-constants.js';

/**
 * Normalize metric values to non-negative numbers.
 *
 * @param {*} value - Candidate metric value.
 * @return {number}
 */
function normalizeNonNegativeNumber(value) {
  if (stryMutAct_9fa48("145974")) {
    {}
  } else {
    stryCov_9fa48("145974");
    const parsed = Number(value);
    if (stryMutAct_9fa48("145977") ? !Number.isFinite(parsed) && parsed < NUM.ZERO : stryMutAct_9fa48("145976") ? false : stryMutAct_9fa48("145975") ? true : (stryCov_9fa48("145975", "145976", "145977"), (stryMutAct_9fa48("145978") ? Number.isFinite(parsed) : (stryCov_9fa48("145978"), !Number.isFinite(parsed))) || (stryMutAct_9fa48("145981") ? parsed >= NUM.ZERO : stryMutAct_9fa48("145980") ? parsed <= NUM.ZERO : stryMutAct_9fa48("145979") ? false : (stryCov_9fa48("145979", "145980", "145981"), parsed < NUM.ZERO)))) {
      if (stryMutAct_9fa48("145982")) {
        {}
      } else {
        stryCov_9fa48("145982");
        return NUM.ZERO;
      }
    }
    return parsed;
  }
}

/**
 * Controller metric storage for endpoint-sync.
 */
class EndpointSyncMetrics {
  constructor() {
    if (stryMutAct_9fa48("145983")) {
      {}
    } else {
      stryCov_9fa48("145983");
      this._metrics = stryMutAct_9fa48("145984") ? {} : (stryCov_9fa48("145984"), {
        [ENDPOINT_SYNC_METRIC.RECONCILE_DURATION_MS]: NUM.ZERO,
        [ENDPOINT_SYNC_METRIC.RECONCILE_FAILURES_TOTAL]: NUM.ZERO,
        [ENDPOINT_SYNC_METRIC.EXPORTED_SERVICES]: NUM.ZERO,
        [ENDPOINT_SYNC_METRIC.EXPORTED_ENDPOINTS]: NUM.ZERO,
        [ENDPOINT_SYNC_METRIC.PORT_CONFLICT_TOTAL]: NUM.ZERO
      });
    }
  }

  /**
   * Record reconcile duration metric.
   *
   * @param {number} durationMs - Reconcile duration.
   */
  recordReconcileDurationMs(durationMs) {
    if (stryMutAct_9fa48("145985")) {
      {}
    } else {
      stryCov_9fa48("145985");
      this._metrics[ENDPOINT_SYNC_METRIC.RECONCILE_DURATION_MS] = normalizeNonNegativeNumber(durationMs);
    }
  }

  /**
   * Increment reconcile failure counter.
   *
   * @param {number} [count=1] - Counter increment.
   */
  incrementReconcileFailures(count = NUM.ONE) {
    if (stryMutAct_9fa48("145986")) {
      {}
    } else {
      stryCov_9fa48("145986");
      stryMutAct_9fa48("145987") ? this._metrics[ENDPOINT_SYNC_METRIC.RECONCILE_FAILURES_TOTAL] -= normalizeNonNegativeNumber(count) : (stryCov_9fa48("145987"), this._metrics[ENDPOINT_SYNC_METRIC.RECONCILE_FAILURES_TOTAL] += normalizeNonNegativeNumber(count));
    }
  }

  /**
   * Set exported services gauge.
   *
   * @param {number} count - Exported service count.
   */
  setExportedServices(count) {
    if (stryMutAct_9fa48("145988")) {
      {}
    } else {
      stryCov_9fa48("145988");
      this._metrics[ENDPOINT_SYNC_METRIC.EXPORTED_SERVICES] = normalizeNonNegativeNumber(count);
    }
  }

  /**
   * Set exported endpoints gauge.
   *
   * @param {number} count - Exported endpoint count.
   */
  setExportedEndpoints(count) {
    if (stryMutAct_9fa48("145989")) {
      {}
    } else {
      stryCov_9fa48("145989");
      this._metrics[ENDPOINT_SYNC_METRIC.EXPORTED_ENDPOINTS] = normalizeNonNegativeNumber(count);
    }
  }

  /**
   * Increment strict-port conflict counter.
   *
   * @param {number} [count=1] - Counter increment.
   */
  incrementPortConflicts(count = NUM.ONE) {
    if (stryMutAct_9fa48("145990")) {
      {}
    } else {
      stryCov_9fa48("145990");
      stryMutAct_9fa48("145991") ? this._metrics[ENDPOINT_SYNC_METRIC.PORT_CONFLICT_TOTAL] -= normalizeNonNegativeNumber(count) : (stryCov_9fa48("145991"), this._metrics[ENDPOINT_SYNC_METRIC.PORT_CONFLICT_TOTAL] += normalizeNonNegativeNumber(count));
    }
  }

  /**
   * Return immutable metrics snapshot.
   *
   * @return {Readonly<Object>}
   */
  snapshot() {
    if (stryMutAct_9fa48("145992")) {
      {}
    } else {
      stryCov_9fa48("145992");
      return Object.freeze(stryMutAct_9fa48("145993") ? {} : (stryCov_9fa48("145993"), {
        ...this._metrics
      }));
    }
  }
}
export { normalizeNonNegativeNumber, EndpointSyncMetrics };