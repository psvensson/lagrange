/**
 * MessageRouter.deliver() Transport Metrics Tests
 * Verifies metrics.transport.deliver log emission.
 * Requirements: 4.1, 4.3, 4.4, 10.1, 10.3, 10.4, 11.1, 11.2, 11.3, 11.4
 */

import {test, beforeEach, afterEach} from '../../src/test-helpers/tap.js';
import {MessageRouter} from '../../src/transport/message-router.js';
import {METRICS_LOG_TAG} from '../../src/constants/index.js';
import {ConfigurationManager} from '../../src/config/configuration-manager.js';
import {LoggingService} from '../../src/logging/logging-service.js';
import {TRANSPORT_METRIC} from '../../src/constants/transport.js';

beforeEach(() => {
  ConfigurationManager.resetInstance();
  LoggingService.resetInstance();
  const config = ConfigurationManager.getInstance();
  config.initialize({node: {id: 'test-node'}});
  const logger = LoggingService.getInstance();
  logger.initialize({level: 'error'});
});

afterEach(() => {
  ConfigurationManager.resetInstance();
  LoggingService.resetInstance();
});

function collectInfoCalls(router) {
  const calls = [];
  const originalInfo = router.logger.info.bind(router.logger);
  router.logger.info = function(tag, data) {
    calls.push({tag, data});
    return originalInfo(tag, data);
  };
  return calls;
}

test('deliver emits metrics.transport.deliver with expected fields',
  async (t) => {
    const router = new MessageRouter({nodeId: 'node-1'});
    await router.initialize({startServer: false});

    const infoCalls = collectInfoCalls(router);

    // Deliver to self without self-connection — returns not-acknowledged
    // but metrics should still be emitted.
    const address = 'node-1/partition/p1';
    await router.deliver(address, {type: 'test'});

    const metric = infoCalls.find(
      (c) => c.tag === METRICS_LOG_TAG.TRANSPORT_DELIVER,
    );
    t.ok(metric, 'metrics.transport.deliver log emitted');
    t.equal(metric.data.targetNodeId, 'node-1');
    t.equal(typeof metric.data.durationMs, 'number');
    t.ok(metric.data.durationMs >= 0, 'durationMs non-negative');
    t.equal(typeof metric.data.messageCount, 'number');
    t.ok(metric.data.messageCount >= 1, 'messageCount at least 1');
    t.equal(typeof metric.data.queueDepth, 'number');
    t.ok(metric.data.queueDepth >= 0, 'queueDepth non-negative');

    await router.shutdown();
  });

test('deliver metric does not treat queueDepth=1 as backpressure',
  async (t) => {
    const router = new MessageRouter({nodeId: 'node-threshold'});
    await router.initialize({startServer: false});

    const trigger = router.getDeliverMetricTrigger(
      'remote-node',
      1,
      1,
      true,
    );

    t.equal(
      trigger,
      null,
      'queue depth of one should not emit backpressure metrics',
    );

    await router.shutdown();
  });

test('deliver samples successful metrics instead of logging every success',
  async (t) => {
    const router = new MessageRouter({nodeId: 'node-sampled'});
    await router.initialize({startServer: false});

    const infoCalls = collectInfoCalls(router);
    router.deliverRemote = async () => ({acknowledged: true});

    for (let i = 0; i < TRANSPORT_METRIC.DELIVER_SUCCESS_SAMPLE_EVERY; i++) {
      await router.deliver(
        'remote-node/partition/p1',
        {type: 'test'},
        {targetNodeId: 'remote-node'},
      );
    }

    const deliverMetrics = infoCalls.filter(
      (c) => c.tag === METRICS_LOG_TAG.TRANSPORT_DELIVER,
    );
    t.equal(
      deliverMetrics.length,
      1,
      'should emit a sampled metric for successful deliveries',
    );
    t.equal(deliverMetrics[0].data.acknowledged, true);
    t.equal(deliverMetrics[0].data.trigger, 'sample');

    await router.shutdown();
  });

test('deliver metric uses info level, not debug', async (t) => {
  const router = new MessageRouter({nodeId: 'node-2'});
  await router.initialize({startServer: false});

  const debugCalls = [];
  const originalDebug = router.logger.debug.bind(router.logger);
  router.logger.debug = function(tag, data) {
    debugCalls.push({tag, data});
    return originalDebug(tag, data);
  };

  await router.deliver('node-2/partition/p1', {type: 'test'});

  const debugMetric = debugCalls.find(
    (c) => c.tag === METRICS_LOG_TAG.TRANSPORT_DELIVER,
  );
  t.notOk(debugMetric, 'no transport deliver metric at debug level');

  await router.shutdown();
});

test('deliver metric does not break delivery on logger failure',
  async (t) => {
    const router = new MessageRouter({nodeId: 'node-3'});
    await router.initialize({startServer: false});

    const originalInfo = router.logger.info.bind(router.logger);
    router.logger.info = function(...args) {
      const tag = args[0];
      if (tag === METRICS_LOG_TAG.TRANSPORT_DELIVER) {
        throw new Error('logger broken');
      }
      return originalInfo(...args);
    };

    // Should not throw despite logger failure
    const result = await router.deliver(
      'node-3/partition/p1', {type: 'test'},
    );
    t.ok(result, 'deliver returns result despite logger failure');

    await router.shutdown();
  });

test('deliver samples repeated fault metrics per target',
  async (t) => {
    const router = new MessageRouter({nodeId: 'node-faults'});
    await router.initialize({startServer: false});

    const infoCalls = collectInfoCalls(router);
    router.deliverRemote = async () => ({
      acknowledged: false,
      error: 'simulated-fault',
    });

    for (let i = 0; i < 5; i++) {
      await router.deliver(
        'remote-node/partition/p1',
        {type: 'test'},
        {targetNodeId: 'remote-node'},
      );
    }

    const deliverMetrics = infoCalls.filter(
      (c) => c.tag === METRICS_LOG_TAG.TRANSPORT_DELIVER,
    );
    t.equal(
      deliverMetrics.length,
      1,
      'should emit first fault metric and sample subsequent repeated faults',
    );
    t.equal(deliverMetrics[0].data.trigger, 'fault');

    await router.shutdown();
  });

test('deliver metric has structured fields with correct types',
  async (t) => {
    const router = new MessageRouter({nodeId: 'node-4'});
    await router.initialize({startServer: false});

    const infoCalls = collectInfoCalls(router);

    await router.deliver('node-4/partition/p1', {type: 'test'});

    const metric = infoCalls.find(
      (c) => c.tag === METRICS_LOG_TAG.TRANSPORT_DELIVER,
    );
    t.ok(metric, 'metric emitted');
    t.equal(typeof metric.data, 'object', 'data is structured object');
    t.ok('targetNodeId' in metric.data, 'has targetNodeId');
    t.ok('durationMs' in metric.data, 'has durationMs');
    t.ok('messageCount' in metric.data, 'has messageCount');
    t.ok('queueDepth' in metric.data, 'has queueDepth');
    t.equal(
      Number.isInteger(metric.data.durationMs), true,
      'durationMs is integer',
    );

    await router.shutdown();
  });

test('deliver metric extracts targetNodeId from address',
  async (t) => {
    const router = new MessageRouter({nodeId: 'sender-node'});
    await router.initialize({startServer: false});

    const infoCalls = collectInfoCalls(router);

    // Use a remote address that will fail delivery but still emit metrics
    try {
      await router.deliver(
        'remote-node/partition/p1', {type: 'test'},
      );
    } catch (_e) {
      // Expected — no connection to remote-node
    }

    const metric = infoCalls.find(
      (c) => c.tag === METRICS_LOG_TAG.TRANSPORT_DELIVER,
    );
    t.ok(metric, 'metric emitted for remote delivery attempt');
    t.equal(
      metric.data.targetNodeId, 'remote-node',
      'targetNodeId extracted from address',
    );

    await router.shutdown();
  });
