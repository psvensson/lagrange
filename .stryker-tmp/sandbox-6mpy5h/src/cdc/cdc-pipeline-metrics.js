/**
 * CDC Pipeline Metrics — simple counter object for CDC pipeline observability.
 *
 * Tracks cumulative counts of CDC events at each pipeline stage:
 * generation (PartitionService), buffering (CDCEventBuffer), and
 * delivery (CDCHandler).
 *
 * Requirements: 6.4
 *
 * @module cdc/cdc-pipeline-metrics
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
import { CDC_PIPELINE_METRIC } from '../constants/cdc-lifecycle-constants.js';

/**
 * CDCPipelineMetrics provides simple in-memory counters for CDC pipeline
 * observability. Counters are incremented at the generation site
 * (PartitionService), the buffer (CDCEventBuffer), and the delivery
 * site (CDCHandler).
 *
 * @example
 * const metrics = new CDCPipelineMetrics();
 * metrics.increment(CDC_PIPELINE_METRIC.EVENTS_GENERATED);
 * const snapshot = metrics.getSnapshot();
 */
class CDCPipelineMetrics {
  constructor() {
    if (stryMutAct_9fa48("39110")) {
      {}
    } else {
      stryCov_9fa48("39110");
      this[CDC_PIPELINE_METRIC.EVENTS_GENERATED] = 0;
      this[CDC_PIPELINE_METRIC.EVENTS_DELIVERED] = 0;
      this[CDC_PIPELINE_METRIC.EVENTS_BUFFERED] = 0;
      this[CDC_PIPELINE_METRIC.EVENTS_DROPPED] = 0;
      this[CDC_PIPELINE_METRIC.DELIVERY_FAILURES] = 0;
    }
  }

  /**
   * Increment a named counter by one.
   * @param {string} counter — one of the CDC_PIPELINE_METRIC values
   */
  increment(counter) {
    if (stryMutAct_9fa48("39111")) {
      {}
    } else {
      stryCov_9fa48("39111");
      if (stryMutAct_9fa48("39114") ? this[counter] !== undefined : stryMutAct_9fa48("39113") ? false : stryMutAct_9fa48("39112") ? true : (stryCov_9fa48("39112", "39113", "39114"), this[counter] === undefined)) {
        if (stryMutAct_9fa48("39115")) {
          {}
        } else {
          stryCov_9fa48("39115");
          return;
        }
      }
      stryMutAct_9fa48("39116") ? this[counter]-- : (stryCov_9fa48("39116"), this[counter]++);
    }
  }

  /**
   * Return a frozen snapshot of all counter values.
   * @return {Object} frozen object with counter fields
   */
  getSnapshot() {
    if (stryMutAct_9fa48("39117")) {
      {}
    } else {
      stryCov_9fa48("39117");
      return Object.freeze(stryMutAct_9fa48("39118") ? {} : (stryCov_9fa48("39118"), {
        [CDC_PIPELINE_METRIC.EVENTS_GENERATED]: this[CDC_PIPELINE_METRIC.EVENTS_GENERATED],
        [CDC_PIPELINE_METRIC.EVENTS_DELIVERED]: this[CDC_PIPELINE_METRIC.EVENTS_DELIVERED],
        [CDC_PIPELINE_METRIC.EVENTS_BUFFERED]: this[CDC_PIPELINE_METRIC.EVENTS_BUFFERED],
        [CDC_PIPELINE_METRIC.EVENTS_DROPPED]: this[CDC_PIPELINE_METRIC.EVENTS_DROPPED],
        [CDC_PIPELINE_METRIC.DELIVERY_FAILURES]: this[CDC_PIPELINE_METRIC.DELIVERY_FAILURES]
      }));
    }
  }

  /**
   * Reset all counters to zero.
   */
  reset() {
    if (stryMutAct_9fa48("39119")) {
      {}
    } else {
      stryCov_9fa48("39119");
      this[CDC_PIPELINE_METRIC.EVENTS_GENERATED] = 0;
      this[CDC_PIPELINE_METRIC.EVENTS_DELIVERED] = 0;
      this[CDC_PIPELINE_METRIC.EVENTS_BUFFERED] = 0;
      this[CDC_PIPELINE_METRIC.EVENTS_DROPPED] = 0;
      this[CDC_PIPELINE_METRIC.DELIVERY_FAILURES] = 0;
    }
  }
}
export { CDCPipelineMetrics };