/**
 * Unit tests for CDCPipelineMetrics.
 * Tests simple counter object for CDC pipeline observability.
 * Requirements: 6.4
 */
// @ts-nocheck


import {test} from '../../src/test-helpers/tap.js';
import {CDCPipelineMetrics} from '../../src/cdc/cdc-pipeline-metrics.js';
import {
  CDC_PIPELINE_METRIC,
} from '../../src/constants/cdc-lifecycle-constants.js';

test('CDCPipelineMetrics — all counters start at zero', (t) => {
  const metrics = new CDCPipelineMetrics();
  const snapshot = metrics.getSnapshot();
  t.equal(snapshot.eventsGenerated, 0);
  t.equal(snapshot.eventsDelivered, 0);
  t.equal(snapshot.eventsBuffered, 0);
  t.equal(snapshot.eventsDropped, 0);
  t.equal(snapshot.deliveryFailures, 0);
  t.end();
});

test('CDCPipelineMetrics — increment increases the named counter', (t) => {
  const metrics = new CDCPipelineMetrics();
  metrics.increment(CDC_PIPELINE_METRIC.EVENTS_GENERATED);
  metrics.increment(CDC_PIPELINE_METRIC.EVENTS_GENERATED);
  metrics.increment(CDC_PIPELINE_METRIC.DELIVERY_FAILURES);
  const snapshot = metrics.getSnapshot();
  t.equal(snapshot.eventsGenerated, 2);
  t.equal(snapshot.deliveryFailures, 1);
  t.equal(snapshot.eventsDelivered, 0);
  t.end();
});

test('CDCPipelineMetrics — increment ignores unknown counter', (t) => {
  const metrics = new CDCPipelineMetrics();
  metrics.increment('nonExistentCounter');
  const snapshot = metrics.getSnapshot();
  t.equal(snapshot.eventsGenerated, 0);
  t.equal(snapshot.eventsDelivered, 0);
  t.equal(snapshot.eventsBuffered, 0);
  t.equal(snapshot.eventsDropped, 0);
  t.equal(snapshot.deliveryFailures, 0);
  t.end();
});

test('CDCPipelineMetrics — getSnapshot returns frozen object', (t) => {
  const metrics = new CDCPipelineMetrics();
  metrics.increment(CDC_PIPELINE_METRIC.EVENTS_GENERATED);
  const snapshot = metrics.getSnapshot();
  t.throws(() => {
    snapshot.eventsGenerated = 999;
  }, 'snapshot should be frozen');
  t.end();
});

test('CDCPipelineMetrics — reset sets all counters to zero', (t) => {
  const metrics = new CDCPipelineMetrics();
  metrics.increment(CDC_PIPELINE_METRIC.EVENTS_GENERATED);
  metrics.increment(CDC_PIPELINE_METRIC.EVENTS_DELIVERED);
  metrics.increment(CDC_PIPELINE_METRIC.EVENTS_BUFFERED);
  metrics.increment(CDC_PIPELINE_METRIC.EVENTS_DROPPED);
  metrics.increment(CDC_PIPELINE_METRIC.DELIVERY_FAILURES);
  metrics.reset();
  const snapshot = metrics.getSnapshot();
  t.equal(snapshot.eventsGenerated, 0);
  t.equal(snapshot.eventsDelivered, 0);
  t.equal(snapshot.eventsBuffered, 0);
  t.equal(snapshot.eventsDropped, 0);
  t.equal(snapshot.deliveryFailures, 0);
  t.end();
});

test('CDCPipelineMetrics — snapshot is independent of later changes', (t) => {
  const metrics = new CDCPipelineMetrics();
  metrics.increment(CDC_PIPELINE_METRIC.EVENTS_GENERATED);
  const snap1 = metrics.getSnapshot();
  metrics.increment(CDC_PIPELINE_METRIC.EVENTS_GENERATED);
  const snap2 = metrics.getSnapshot();
  t.equal(snap1.eventsGenerated, 1, 'first snapshot unchanged');
  t.equal(snap2.eventsGenerated, 2, 'second snapshot reflects new state');
  t.end();
});
