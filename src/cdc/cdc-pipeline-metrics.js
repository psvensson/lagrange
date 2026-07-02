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

import {CDC_PIPELINE_METRIC} from '../constants/cdc-lifecycle-constants.js';


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
    this[CDC_PIPELINE_METRIC.EVENTS_GENERATED] = 0;
    this[CDC_PIPELINE_METRIC.EVENTS_DELIVERED] = 0;
    this[CDC_PIPELINE_METRIC.EVENTS_BUFFERED] = 0;
    this[CDC_PIPELINE_METRIC.EVENTS_DROPPED] = 0;
    this[CDC_PIPELINE_METRIC.DELIVERY_FAILURES] = 0;
  }

  /**
   * Increment a named counter by one.
   * @param {string} counter — one of the CDC_PIPELINE_METRIC values
   */
  increment(counter) {
    if (this[counter] === undefined) {
      return;
    }
    this[counter]++;
  }

  /**
   * Return a frozen snapshot of all counter values.
   * @return {Object} frozen object with counter fields
   */
  getSnapshot() {
    return Object.freeze({
      [CDC_PIPELINE_METRIC.EVENTS_GENERATED]:
        this[CDC_PIPELINE_METRIC.EVENTS_GENERATED],
      [CDC_PIPELINE_METRIC.EVENTS_DELIVERED]:
        this[CDC_PIPELINE_METRIC.EVENTS_DELIVERED],
      [CDC_PIPELINE_METRIC.EVENTS_BUFFERED]:
        this[CDC_PIPELINE_METRIC.EVENTS_BUFFERED],
      [CDC_PIPELINE_METRIC.EVENTS_DROPPED]:
        this[CDC_PIPELINE_METRIC.EVENTS_DROPPED],
      [CDC_PIPELINE_METRIC.DELIVERY_FAILURES]:
        this[CDC_PIPELINE_METRIC.DELIVERY_FAILURES],
    });
  }

  /**
   * Reset all counters to zero.
   */
  reset() {
    this[CDC_PIPELINE_METRIC.EVENTS_GENERATED] = 0;
    this[CDC_PIPELINE_METRIC.EVENTS_DELIVERED] = 0;
    this[CDC_PIPELINE_METRIC.EVENTS_BUFFERED] = 0;
    this[CDC_PIPELINE_METRIC.EVENTS_DROPPED] = 0;
    this[CDC_PIPELINE_METRIC.DELIVERY_FAILURES] = 0;
  }
}

export {CDCPipelineMetrics};
