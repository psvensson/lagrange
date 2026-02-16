/**
 * MessageRouter.deliverViaEndpoint() Transport Endpoint Metrics Tests
 * Verifies metrics.transport.endpoint log emission.
 * Requirements: 4.2, 4.3, 10.1, 10.3, 10.4, 11.1, 11.2, 11.3, 11.4
 */

import {test, beforeEach, afterEach} from '../../src/test-helpers/tap.js';
import {MessageRouter} from '../../src/transport/message-router.js';
import {METRICS_LOG_TAG, COLUMN} from '../../src/constants/index.js';
import {ConfigurationManager} from '../../src/config/configuration-manager.js';
import {LoggingService} from '../../src/logging/logging-service.js';

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

function makeEndpoint(overrides = {}) {
  return {
    [COLUMN.ENDPOINT_ID]: overrides.endpointId || 'ep-1',
    [COLUMN.TRANSPORT_TYPE]: overrides.transportType || 'ws',
    [COLUMN.PRIORITY]: overrides.priority || 1,
  };
}

function makeProvider(sendResult = {}) {
  return {
    send: async () => sendResult,
    isAvailable: () => true,
  };
}

function makeConnectionPool() {
  return {
    getConnection: async () => ({providerConnection: {}}),
    releaseConnection: () => {},
  };
}

test('deliverViaEndpoint emits metrics.transport.endpoint on success',
  async (t) => {
    const router = new MessageRouter({nodeId: 'node-1'});
    await router.initialize({startServer: false});
    router.connectionPool = makeConnectionPool();

    const infoCalls = collectInfoCalls(router);
    const endpoint = makeEndpoint();
    const provider = makeProvider();

    await router.deliverViaEndpoint(
      'node-2/partition/p1', 'msg-1', {type: 'test'},
      'node-2', endpoint, provider, 'corr-1',
    );

    const metric = infoCalls.find(
      (c) => c.tag === METRICS_LOG_TAG.TRANSPORT_ENDPOINT,
    );
    t.ok(metric, 'metrics.transport.endpoint log emitted');
    t.equal(metric.data.targetNodeId, 'node-2');
    t.equal(metric.data.transportType, 'ws');
    t.equal(metric.data.endpointId, 'ep-1');
    t.equal(typeof metric.data.durationMs, 'number');
    t.ok(metric.data.durationMs >= 0, 'durationMs non-negative');
    t.equal(metric.data.acknowledged, true);

    await router.shutdown();
  });

test('deliverViaEndpoint emits metric with acknowledged false on failure',
  async (t) => {
    const router = new MessageRouter({nodeId: 'node-1'});
    await router.initialize({startServer: false});
    router.connectionPool = {
      getConnection: async () => {
        throw new Error('connection failed');
      },
      releaseConnection: () => {},
    };

    const infoCalls = collectInfoCalls(router);
    const endpoint = makeEndpoint({
      endpointId: 'ep-fail',
      transportType: 'nats',
    });
    const provider = makeProvider();

    await router.deliverViaEndpoint(
      'node-3/partition/p1', 'msg-2', {type: 'test'},
      'node-3', endpoint, provider, 'corr-2',
    );

    const metric = infoCalls.find(
      (c) => c.tag === METRICS_LOG_TAG.TRANSPORT_ENDPOINT,
    );
    t.ok(metric, 'metric emitted on failure');
    t.equal(metric.data.targetNodeId, 'node-3');
    t.equal(metric.data.transportType, 'nats');
    t.equal(metric.data.endpointId, 'ep-fail');
    t.equal(metric.data.acknowledged, false);
    t.ok(metric.data.durationMs >= 0, 'durationMs non-negative');

    await router.shutdown();
  });

test('deliverViaEndpoint metric uses info level, not debug',
  async (t) => {
    const router = new MessageRouter({nodeId: 'node-1'});
    await router.initialize({startServer: false});
    router.connectionPool = makeConnectionPool();

    const debugCalls = [];
    const originalDebug = router.logger.debug.bind(router.logger);
    router.logger.debug = function(tag, data) {
      debugCalls.push({tag, data});
      return originalDebug(tag, data);
    };

    const endpoint = makeEndpoint();
    const provider = makeProvider();

    await router.deliverViaEndpoint(
      'node-2/partition/p1', 'msg-3', {type: 'test'},
      'node-2', endpoint, provider, 'corr-3',
    );

    const debugMetric = debugCalls.find(
      (c) => c.tag === METRICS_LOG_TAG.TRANSPORT_ENDPOINT,
    );
    t.notOk(debugMetric, 'no endpoint metric at debug level');

    await router.shutdown();
  });

test('deliverViaEndpoint metric does not break delivery on logger failure',
  async (t) => {
    const router = new MessageRouter({nodeId: 'node-1'});
    await router.initialize({startServer: false});
    router.connectionPool = makeConnectionPool();

    const originalInfo = router.logger.info.bind(router.logger);
    router.logger.info = function(...args) {
      if (args[0] === METRICS_LOG_TAG.TRANSPORT_ENDPOINT) {
        throw new Error('logger broken');
      }
      return originalInfo(...args);
    };

    const endpoint = makeEndpoint();
    const provider = makeProvider();

    const result = await router.deliverViaEndpoint(
      'node-2/partition/p1', 'msg-4', {type: 'test'},
      'node-2', endpoint, provider, 'corr-4',
    );
    t.ok(result, 'returns result despite logger failure');
    t.equal(result.acknowledged, true, 'delivery still succeeds');

    await router.shutdown();
  });

test('deliverViaEndpoint metric has structured fields with correct types',
  async (t) => {
    const router = new MessageRouter({nodeId: 'node-1'});
    await router.initialize({startServer: false});
    router.connectionPool = makeConnectionPool();

    const infoCalls = collectInfoCalls(router);
    const endpoint = makeEndpoint();
    const provider = makeProvider();

    await router.deliverViaEndpoint(
      'node-2/partition/p1', 'msg-5', {type: 'test'},
      'node-2', endpoint, provider, 'corr-5',
    );

    const metric = infoCalls.find(
      (c) => c.tag === METRICS_LOG_TAG.TRANSPORT_ENDPOINT,
    );
    t.ok(metric, 'metric emitted');
    t.equal(typeof metric.data, 'object', 'data is structured object');
    t.ok('targetNodeId' in metric.data, 'has targetNodeId');
    t.ok('transportType' in metric.data, 'has transportType');
    t.ok('endpointId' in metric.data, 'has endpointId');
    t.ok('durationMs' in metric.data, 'has durationMs');
    t.ok('acknowledged' in metric.data, 'has acknowledged');
    t.equal(
      Number.isInteger(metric.data.durationMs), true,
      'durationMs is integer',
    );

    await router.shutdown();
  });
