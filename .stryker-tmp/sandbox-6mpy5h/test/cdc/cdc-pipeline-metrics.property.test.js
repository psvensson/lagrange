/**
 * Property Tests: CDC Pipeline Metrics Accuracy
 *
 * Feature: bootstrap-lifecycle-hardening, Property 13: CDC metrics accuracy
 * **Validates: Requirements 6.4**
 *
 * *For any* sequence of CDC pipeline operations (event generation,
 * successful delivery, buffer drops, delivery failures), the
 * CDCPipelineMetrics snapshot SHALL accurately reflect the cumulative
 * counts: `eventsGenerated` equals total generate calls,
 * `eventsDelivered` equals total successful cache applications,
 * `eventsDropped` equals total buffer overflow drops, and
 * `deliveryFailures` equals total failed deliveries.
 */
// @ts-nocheck


import {test} from '../../src/test-helpers/tap.js';
import fc from 'fast-check';
import {CDCPipelineMetrics} from '../../src/cdc/cdc-pipeline-metrics.js';
import {
  CDC_PIPELINE_METRIC,
} from '../../src/constants/cdc-lifecycle-constants.js';

/**
 * Generates a valid CDC_PIPELINE_METRIC counter name.
 */
const metricKeyArb = fc.constantFrom(
  CDC_PIPELINE_METRIC.EVENTS_GENERATED,
  CDC_PIPELINE_METRIC.EVENTS_DELIVERED,
  CDC_PIPELINE_METRIC.EVENTS_BUFFERED,
  CDC_PIPELINE_METRIC.EVENTS_DROPPED,
  CDC_PIPELINE_METRIC.DELIVERY_FAILURES,
);

/**
 * Generates a sequence of increment operations as an array of
 * metric counter names. Each element represents one increment call.
 */
const operationSequenceArb = fc.array(metricKeyArb, {
  minLength: 0,
  maxLength: 50,
});

test(
  'Feature: bootstrap-lifecycle-hardening, ' +
  'Property 13: CDC metrics accuracy',
  async (t) => {
    /**
     * **Validates: Requirements 6.4**
     */
    t.test(
      'snapshot reflects cumulative counts for any operation sequence',
      async () => {
        await fc.assert(
          fc.property(
            operationSequenceArb,
            (operations) => {
              const metrics = new CDCPipelineMetrics();

              const expected = {
                [CDC_PIPELINE_METRIC.EVENTS_GENERATED]: 0,
                [CDC_PIPELINE_METRIC.EVENTS_DELIVERED]: 0,
                [CDC_PIPELINE_METRIC.EVENTS_BUFFERED]: 0,
                [CDC_PIPELINE_METRIC.EVENTS_DROPPED]: 0,
                [CDC_PIPELINE_METRIC.DELIVERY_FAILURES]: 0,
              };

              for (const op of operations) {
                metrics.increment(op);
                expected[op]++;
              }

              const snapshot = metrics.getSnapshot();

              return (
                snapshot[CDC_PIPELINE_METRIC.EVENTS_GENERATED] ===
                  expected[CDC_PIPELINE_METRIC.EVENTS_GENERATED] &&
                snapshot[CDC_PIPELINE_METRIC.EVENTS_DELIVERED] ===
                  expected[CDC_PIPELINE_METRIC.EVENTS_DELIVERED] &&
                snapshot[CDC_PIPELINE_METRIC.EVENTS_BUFFERED] ===
                  expected[CDC_PIPELINE_METRIC.EVENTS_BUFFERED] &&
                snapshot[CDC_PIPELINE_METRIC.EVENTS_DROPPED] ===
                  expected[CDC_PIPELINE_METRIC.EVENTS_DROPPED] &&
                snapshot[CDC_PIPELINE_METRIC.DELIVERY_FAILURES] ===
                  expected[CDC_PIPELINE_METRIC.DELIVERY_FAILURES]
              );
            },
          ),
          {numRuns: 10},
        );
      },
    );

    t.test(
      'reset then re-increment produces correct counts',
      async () => {
        await fc.assert(
          fc.property(
            operationSequenceArb,
            operationSequenceArb,
            (before, after) => {
              const metrics = new CDCPipelineMetrics();

              for (const op of before) {
                metrics.increment(op);
              }

              metrics.reset();

              const expected = {
                [CDC_PIPELINE_METRIC.EVENTS_GENERATED]: 0,
                [CDC_PIPELINE_METRIC.EVENTS_DELIVERED]: 0,
                [CDC_PIPELINE_METRIC.EVENTS_BUFFERED]: 0,
                [CDC_PIPELINE_METRIC.EVENTS_DROPPED]: 0,
                [CDC_PIPELINE_METRIC.DELIVERY_FAILURES]: 0,
              };

              for (const op of after) {
                metrics.increment(op);
                expected[op]++;
              }

              const snapshot = metrics.getSnapshot();

              return (
                snapshot[CDC_PIPELINE_METRIC.EVENTS_GENERATED] ===
                  expected[CDC_PIPELINE_METRIC.EVENTS_GENERATED] &&
                snapshot[CDC_PIPELINE_METRIC.EVENTS_DELIVERED] ===
                  expected[CDC_PIPELINE_METRIC.EVENTS_DELIVERED] &&
                snapshot[CDC_PIPELINE_METRIC.EVENTS_BUFFERED] ===
                  expected[CDC_PIPELINE_METRIC.EVENTS_BUFFERED] &&
                snapshot[CDC_PIPELINE_METRIC.EVENTS_DROPPED] ===
                  expected[CDC_PIPELINE_METRIC.EVENTS_DROPPED] &&
                snapshot[CDC_PIPELINE_METRIC.DELIVERY_FAILURES] ===
                  expected[CDC_PIPELINE_METRIC.DELIVERY_FAILURES]
              );
            },
          ),
          {numRuns: 10},
        );
      },
    );

    t.test(
      'unknown counters do not affect valid metric counts',
      async () => {
        await fc.assert(
          fc.property(
            operationSequenceArb,
            fc.array(fc.string(), {minLength: 1, maxLength: 5}),
            (validOps, invalidNames) => {
              const metrics = new CDCPipelineMetrics();

              const expected = {
                [CDC_PIPELINE_METRIC.EVENTS_GENERATED]: 0,
                [CDC_PIPELINE_METRIC.EVENTS_DELIVERED]: 0,
                [CDC_PIPELINE_METRIC.EVENTS_BUFFERED]: 0,
                [CDC_PIPELINE_METRIC.EVENTS_DROPPED]: 0,
                [CDC_PIPELINE_METRIC.DELIVERY_FAILURES]: 0,
              };

              for (const op of validOps) {
                metrics.increment(op);
                expected[op]++;
              }

              for (const name of invalidNames) {
                metrics.increment(name);
              }

              const snapshot = metrics.getSnapshot();

              return (
                snapshot[CDC_PIPELINE_METRIC.EVENTS_GENERATED] ===
                  expected[CDC_PIPELINE_METRIC.EVENTS_GENERATED] &&
                snapshot[CDC_PIPELINE_METRIC.EVENTS_DELIVERED] ===
                  expected[CDC_PIPELINE_METRIC.EVENTS_DELIVERED] &&
                snapshot[CDC_PIPELINE_METRIC.EVENTS_BUFFERED] ===
                  expected[CDC_PIPELINE_METRIC.EVENTS_BUFFERED] &&
                snapshot[CDC_PIPELINE_METRIC.EVENTS_DROPPED] ===
                  expected[CDC_PIPELINE_METRIC.EVENTS_DROPPED] &&
                snapshot[CDC_PIPELINE_METRIC.DELIVERY_FAILURES] ===
                  expected[CDC_PIPELINE_METRIC.DELIVERY_FAILURES]
              );
            },
          ),
          {numRuns: 10},
        );
      },
    );
  },
);
