/**
 * Unit tests for MessageRouter.
 * Tests local and remote message routing.
 * Requirements: 4.21, 4.22, 11.6, 11.7, 11.8, 11.9
 */

import net from 'net';
import {EventEmitter} from 'events';
import t from '../../src/test-helpers/tap.js';
import {MessageRouter, ConnectionState, RouterMessageType} from
  '../../src/transport/message-router.js';
import {ConfigurationManager} from '../../src/config/configuration-manager.js';
import {LoggingService} from '../../src/logging/logging-service.js';
import {resolveRaftTransportDeliveryOptions} from
  '../../src/raft/constants.js';
import {registerMessageRouterTailTests} from './message-router-tail-test-cases.js';

/**
 * Initialize test environment.
 */
function initializeTestEnvironment() {
  ConfigurationManager.resetInstance();
  LoggingService.resetInstance();

  const config = ConfigurationManager.getInstance();
  config.initialize({
    node: {id: 'test-node'},
    logging: {level: 'error'},
  });

  const logging = LoggingService.getInstance();
  logging.initialize({level: 'error'});
}

/**
 * Clean up test environment.
 */
function cleanupTestEnvironment() {
  ConfigurationManager.resetInstance();
  LoggingService.resetInstance();
}

t.test('MessageRouter unit tests', async (t) => {
  t.beforeEach(() => {
    initializeTestEnvironment();
  });

  t.afterEach(() => {
    cleanupTestEnvironment();
  });

  t.test('should create router with default options', async (t) => {
    const router = new MessageRouter();

    t.ok(router.routerId, 'should have router ID');
    t.ok(router.nodeId, 'should have node ID');
    t.equal(router.initialized, false, 'should not be initialized');
    t.equal(router.handlers.size, 0, 'should have no handlers');
    t.equal(router.nodeConnections.size, 0, 'should have no connections');

    await router.shutdown();
  });

  t.test('should create router with custom options', async (t) => {
    const router = new MessageRouter({
      nodeId: 'custom-node-id',
      nodeAddress: 'ws://localhost:9999',
      wsPort: 9999,
    });

    t.equal(router.nodeId, 'custom-node-id', 'should use custom node ID');
    t.equal(router.nodeAddress, 'ws://localhost:9999', 'should use custom address');
    t.equal(router.wsPort, 9999, 'should use custom port');

    await router.shutdown();
  });

  t.test('should initialize without starting server', async (t) => {
    const router = new MessageRouter({nodeId: 'test-node'});

    await router.initialize({startServer: false});

    t.equal(router.initialized, true, 'should be initialized');
    t.equal(router.server, null, 'should not have server');

    await router.shutdown();
  });

  t.test('should register and unregister local handlers', async (t) => {
    const router = new MessageRouter({nodeId: 'test-node'});
    await router.initialize();

    const handler = () => ({acknowledged: true});

    router.register('test-node/service/service-1', handler);
    t.equal(router.handlers.size, 1, 'should have one handler');
    t.ok(router.isRegistered('test-node/service/service-1'), 'should be registered');

    router.register('test-node/service/service-2', handler);
    t.equal(router.handlers.size, 2, 'should have two handlers');

    router.unregister('test-node/service/service-1');
    t.equal(router.handlers.size, 1, 'should have one handler after unregister');
    t.notOk(router.isRegistered('test-node/service/service-1'), 'should not be registered');

    await router.shutdown();
  });

  t.test('should throw when registering non-function handler', async (t) => {
    const router = new MessageRouter({nodeId: 'test-node'});
    await router.initialize();

    t.throws(
      () => router.register('test-node/service/service-1', 'not-a-function'),
      /Handler must be a function/,
      'should throw for non-function handler',
    );

    await router.shutdown();
  });

  t.test('should throw when registering with invalid address format', async (t) => {
    const router = new MessageRouter({nodeId: 'test-node'});
    await router.initialize();

    const handler = () => ({acknowledged: true});

    t.throws(
      () => router.register('invalid-address', handler),
      /Invalid address format/,
      'should throw for invalid address format',
    );

    t.throws(
      () => router.register('node/invalid-type/id', handler),
      /Invalid address format/,
      'should throw for invalid entity type',
    );

    t.throws(
      () => router.register('node/service', handler),
      /Invalid address format/,
      'should throw for missing entity id',
    );

    await router.shutdown();
  });

  t.test('should reject non-unified addresses', async (t) => {
    const router = new MessageRouter({nodeId: 'test-node'});
    await router.initialize();

    const handler = () => ({acknowledged: true});

    t.throws(
      () => router.register('legacy-address', handler),
      /Invalid address format/,
      'should reject non-unified address formats',
    );

    await router.shutdown();
  });

  t.test('should deliver locally without connection via deliverLocal', async (t) => {
    // Local delivery bypasses WebSocket — no self-connection needed.
    const router = new MessageRouter({nodeId: 'test-node'});
    await router.initialize();

    const receivedMessages = [];
    router.register('test-node/service/local-service', (envelope) => {
      receivedMessages.push(envelope);
      return {acknowledged: true, data: 'response'};
    });

    const result = await router.deliver('test-node/service/local-service', {
      type: 'TEST_MESSAGE',
      data: 'hello',
    });

    t.ok(result.messageId, 'should have message ID');
    t.equal(result.acknowledged, true, 'should be acknowledged');
    t.equal(result.data, 'response', 'should include handler data');
    t.equal(receivedMessages.length, 1, 'should invoke handler');

    await router.shutdown();
  });

  t.test('should route QUERY messages via message-group transport', async (t) => {
    const router = new MessageRouter({nodeId: 'test-node'});
    await router.initialize();

    let localHandlerCalls = 0;
    router.register('test-node/partition/p1', () => {
      localHandlerCalls++;
      return {acknowledged: true, success: true, rows: [{id: 'local'}]};
    });

    let queryTransportCalls = 0;
    router.setQueryMessageGroupServiceResolver(() => ({
      sendMessage: async (targetAddress, message) => {
        queryTransportCalls++;
        return {
          acknowledged: true,
          success: true,
          routedVia: 'message-group',
          targetAddress,
          sql: message.sql,
          rows: [{id: 'mg'}],
        };
      },
    }));

    const result = await router.deliver('test-node/partition/p1', {
      type: 'QUERY',
      sql: 'SELECT 1',
      params: [],
    });

    t.equal(queryTransportCalls, 1, 'should use message-group transport once');
    t.equal(localHandlerCalls, 0, 'should not use direct local handler path');
    t.equal(result.acknowledged, true, 'should acknowledge query delivery');
    t.equal(result.routedVia, 'message-group', 'should report message-group routing');

    await router.shutdown();
  });

  t.test('should defer QUERY messages when resolver returns no transport',
    async (t) => {
      const router = new MessageRouter({nodeId: 'test-node'});
      await router.initialize();

      router.setQueryMessageGroupServiceResolver(() => null);

      const result = await router.deliver('test-node/partition/p1', {
        type: 'QUERY',
        sql: 'SELECT 1',
        params: [],
      });

      t.equal(result.acknowledged, false,
        'should fail closed when query transport is unavailable');
      t.equal(result.deferRetry, true,
        'should return typed defer semantics instead of falling back');
      t.equal(result.errorCode, 'ROUTER_QUERY_TRANSPORT_NOT_READY',
        'should surface a stable transport-not-ready error code');
      t.ok(result.retryAfterMs > 0,
        'should expose a retry hint for the canonical query transport path');

      await router.shutdown();
    });

  t.test('should fail QUERY messages when message-group transport is missing', async (t) => {
    const router = new MessageRouter({nodeId: 'test-node'});
    await router.initialize();

    const result = await router.deliver('test-node/partition/p1', {
      type: 'QUERY',
      sql: 'SELECT 1',
      params: [],
    });

    t.equal(result.acknowledged, false,
      'should fail closed when query transport resolver is missing');
    t.equal(result.deferRetry, true,
      'missing query transport should surface typed defer semantics');
    t.equal(result.errorCode, 'ROUTER_QUERY_TRANSPORT_NOT_READY',
      'missing resolver should expose a stable error code');
    t.match(
      result.error,
      /message-group transport is not configured/i,
      'missing resolver should preserve the canonical reason',
    );

    await router.shutdown();
  });

  t.test('should preserve typed query transport retry hints from resolver selections',
    async (t) => {
      const router = new MessageRouter({nodeId: 'test-node'});
      await router.initialize();

      router.setQueryMessageGroupServiceResolver(() => ({
        service: null,
        reason: 'query ingress owner not ready',
        retryAfterMs: 321,
      }));

      const result = await router.deliver('test-node/partition/p1', {
        type: 'QUERY',
        sql: 'SELECT 1',
        params: [],
      });

      t.equal(result.acknowledged, false,
        'should fail closed while query transport owner is unavailable');
      t.equal(result.deferRetry, true,
        'typed selection misses should preserve defer semantics');
      t.equal(result.retryAfterMs, 321,
        'typed selection misses should preserve retryAfterMs');
      t.equal(result.error, 'query ingress owner not ready',
        'typed selection misses should preserve the owner reason');

      await router.shutdown();
    });

  t.test('should expose canonical query transport readiness from resolver selections',
    async (t) => {
      const router = new MessageRouter({nodeId: 'test-node'});
      await router.initialize();

      router.setQueryMessageGroupServiceResolver(() => ({
        service: null,
        reason: 'query ingress owner not ready',
        retryAfterMs: 321,
      }));

      const readiness = router.getQueryDataPlaneTransportReadiness();

      t.equal(readiness.ready, false,
        'readiness should report the query transport as unavailable');
      t.equal(readiness.state, 'deferred',
        'readiness should expose the typed transport-deferred state');
      t.equal(readiness.reasonCode, 'query_transport_not_ready',
        'readiness should preserve the typed transport reason code');
      t.equal(readiness.errorCode, 'ROUTER_QUERY_TRANSPORT_NOT_READY',
        'readiness should preserve the stable transport error code');
      t.equal(readiness.reason, 'query ingress owner not ready',
        'readiness should preserve the canonical owner reason');
      t.equal(readiness.retryAfterMs, 321,
        'readiness should preserve the typed retry hint');

      await router.shutdown();
    });

  t.test('should defer QUERY messages when query transport throws while target reconnects',
    async (t) => {
      const router = new MessageRouter({nodeId: 'test-node'});
      await router.initialize();

      router.nodeConnections.set('node-2', {
        state: ConnectionState.RECONNECTING,
        reconnectDueAt: Date.now() + 175,
        reconnectTimeout: {},
      });
      router.setQueryMessageGroupServiceResolver(() => ({
        async sendMessage() {
          throw new Error('Connection to node node-2 closed');
        },
      }));

      const result = await router.deliver('node-2/partition/p1', {
        type: 'QUERY',
        sql: 'SELECT 1',
        params: [],
      });

      t.equal(result.acknowledged, false,
        'query transport connection closure should fail closed');
      t.equal(result.deferRetry, true,
        'query transport connection closure should defer while reconnect is armed');
      t.equal(result.errorCode, 'ROUTER_CONNECTION_CLOSED',
        'query transport closure should normalize to the canonical router error code');
      t.ok(result.retryAfterMs > 0,
        'query transport closure should preserve a bounded retry hint');

      await router.shutdown();
    });

  t.test('should preserve explicit deferred retry metadata from query transport failures',
    async (t) => {
      const router = new MessageRouter({nodeId: 'test-node'});
      await router.initialize();

      router.setQueryMessageGroupServiceResolver(() => ({
        async sendMessage() {
          const error = new Error('query ingress backpressure');
          error.code = 'QUERY_INGRESS_BACKPRESSURE';
          error.deferRetry = true;
          error.retryAfterMs = 222;
          throw error;
        },
      }));

      const result = await router.deliver('node-2/partition/p1', {
        type: 'QUERY',
        sql: 'SELECT 1',
        params: [],
      });

      t.equal(result.acknowledged, false,
        'explicit query transport deferrals should fail closed');
      t.equal(result.deferRetry, true,
        'explicit query transport deferrals should preserve defer semantics');
      t.equal(result.errorCode, 'QUERY_INGRESS_BACKPRESSURE',
        'explicit query transport deferrals should preserve the error code');
      t.equal(result.retryAfterMs, 222,
        'explicit query transport deferrals should preserve retryAfterMs');
      t.equal(result.error, 'query ingress backpressure',
        'explicit query transport deferrals should preserve the error message');

      await router.shutdown();
    });

  t.test('should expose reconnect-before-delivery pressure in the outbound summary',
    async (t) => {
      const router = new MessageRouter({nodeId: 'test-node'});
      await router.initialize();

      router.pendingNodeConnections.set('node-2', Promise.resolve(null));
      router.recordPendingNodeConnectionSnapshot();
      router.transportPressureMetrics.reconnectBeforeDeliveryFailureCount = 3;

      const summary = router.getOutboundPressureSummary();

      t.equal(summary.pendingNodeConnectionCount, 1,
        'the outbound pressure summary should include pending reconnect ownership');
      t.equal(summary.reconnectBeforeDeliveryFailureCount, 3,
        'the outbound pressure summary should include reconnect-before-delivery failures');
      t.equal(summary.maxObservedPendingNodeConnectionCount, 1,
        'the outbound pressure summary should keep the max pending reconnect count');

      await router.shutdown();
    });

  t.test('should forward router delivery options to query transport sends',
    async (t) => {
      const QUERY_TRANSPORT_DELIVERY_SOURCE =
        'control-plane:read:control_plane_publications';
      const router = new MessageRouter({nodeId: 'test-node'});
      await router.initialize();

      let capturedOptions = null;
      router.setQueryMessageGroupServiceResolver(() => ({
        async sendMessage(_targetService, _message, options = {}) {
          capturedOptions = options;
          return {
            acknowledged: true,
            success: true,
            rows: [],
          };
        },
      }));

      const result = await router.deliver('node-2/partition/p1', {
        type: 'QUERY',
        sql: 'SELECT 1',
        params: [],
      }, {
        timeoutMs: 1234,
        deliveryPriority: 'critical',
        deliverySource: QUERY_TRANSPORT_DELIVERY_SOURCE,
      });

      t.equal(result.acknowledged, true,
        'query transport send should still succeed');
      t.equal(capturedOptions?.transportDeliveryOptions?.timeoutMs, 1234,
        'query transport sends should inherit timeoutMs from router delivery');
      t.equal(capturedOptions?.transportDeliveryOptions?.deliveryPriority,
        'critical',
        'query transport sends should inherit delivery priority from router ' +
          'delivery');
      t.equal(
        capturedOptions?.transportDeliveryOptions?.deliverySource,
        QUERY_TRANSPORT_DELIVERY_SOURCE,
        'query transport sends should preserve explicit delivery-source ownership',
      );

      await router.shutdown();
    });

  t.test('should deliver locally for async handler without connection', async (t) => {
    const router = new MessageRouter({nodeId: 'test-node'});
    await router.initialize();

    router.register('test-node/service/async-service', async (envelope) => {
      await Promise.resolve();
      return {acknowledged: true, processed: envelope.payload.data};
    });

    const result = await router.deliver(
      'test-node/service/async-service', {data: 'async-test'},
    );

    t.equal(result.acknowledged, true, 'should be acknowledged');
    t.equal(result.processed, 'async-test', 'should include handler result');

    await router.shutdown();
  });

  t.test('should return error for handler error without connection', async (t) => {
    // In the unified transport architecture, all messages go through WebSocket
    const router = new MessageRouter({nodeId: 'test-node'});
    await router.initialize();

    router.register('test-node/service/error-service', () => {
      throw new Error('Handler error');
    });

    // Without self-connection, delivery should fail (connection error, not handler error)
    const result = await router.deliver('test-node/service/error-service', {data: 'test'});

    t.equal(result.acknowledged, false, 'should not be acknowledged');
    t.ok(result.error, 'should have error message');

    await router.shutdown();
  });

  t.test('should return error for unknown service without connection', async (t) => {
    const router = new MessageRouter({nodeId: 'test-node'});
    await router.initialize();

    const result = await router.deliver('test-node/service/unknown-service', {data: 'test'});

    t.equal(result.acknowledged, false, 'should not be acknowledged');
    t.ok(result.error, 'should include error message');

    await router.shutdown();
  });

  t.test('should set service node resolver', async (t) => {
    const router = new MessageRouter({nodeId: 'test-node'});
    await router.initialize();

    const resolver = (address) => {
      if (address.startsWith('remote-')) {
        return 'remote-node-id';
      }
      return null;
    };

    router.setServiceNodeResolver(resolver);
    t.equal(router.resolveServiceNode, resolver, 'should set resolver');

    await router.shutdown();
  });

  t.test('should recover a missing remote node connection from the node address resolver',
    async (t) => {
      const router = new MessageRouter({nodeId: 'test-node'});
      await router.initialize();

      const connectCalls = [];
      router.setNodeAddressResolver((nodeId) => {
        return nodeId === 'remote-node' ? 'ws://remote-node:9999' : null;
      });
      router.connectToNode = async (nodeId, address) => {
        connectCalls.push({nodeId, address});
        router.nodeConnections.set(nodeId, {
          nodeId,
          address,
          state: ConnectionState.CONNECTED,
          ws: {},
          isIncoming: false,
        });
      };
      router.sendMessage = async (
        _connection,
        _targetAddress,
        messageId,
        _payload,
        targetNodeId,
        correlationId,
      ) => {
        return {
          messageId,
          correlationId,
          acknowledged: true,
          targetNodeId,
          recovered: true,
        };
      };

      const result = await router.deliver(
        'remote-node/service/remote-service',
        {type: 'TEST_MESSAGE'},
      );

      t.equal(connectCalls.length, 1, 'should attempt one on-demand reconnect');
      t.same(connectCalls[0], {
        nodeId: 'remote-node',
        address: 'ws://remote-node:9999',
      }, 'should reconnect using the resolved node address');
      t.equal(result.acknowledged, true, 'should deliver after recovering the node connection');
      t.equal(result.recovered, true, 'should preserve the delivery result from the retry');

      await router.shutdown();
    });

  t.test('should surface defer-retry hints when delivery recovery cannot reconnect a target',
    async (t) => {
      const router = new MessageRouter({nodeId: 'test-node'});
      await router.initialize({startServer: false});
      t.teardown(async () => {
        await router.shutdown().catch(() => {});
      });

      router.setNodeAddressResolver((nodeId) => {
        return nodeId === 'remote-node' ? 'ws://remote-node:9999' : null;
      });
      router.connectToNode = async () => {
        throw new Error('connect ECONNREFUSED remote-node:9999');
      };

      const result = await router.deliver(
        'remote-node/service/remote-service',
        {type: 'TEST_MESSAGE'},
      );

      t.equal(result.acknowledged, false,
        'delivery should fail when reconnect recovery cannot restore the peer');
      t.equal(result.deferRetry, true,
        'failed recovery should ask upstream owners to defer immediate retries');
      t.ok(result.retryAfterMs > 0 &&
        result.retryAfterMs <= router.reconnectIntervalMs,
      'failed recovery should expose the active reconnect cooldown');
      t.equal(result.errorCode, 'ROUTER_CONNECTION_CLOSED',
        'failed recovery should surface the reconnect-in-progress error code');
      t.equal(
        router.nodeConnections.get('remote-node')?.state,
        ConnectionState.RECONNECTING,
        'failed cold recovery should arm one reconnect owner for the peer',
      );
    });

  t.test('failed cold dials should not stampede repeated reconnect attempts',
    async (t) => {
      const router = new MessageRouter({nodeId: 'test-node'});
      await router.initialize({startServer: false});
      t.teardown(async () => {
        await router.shutdown().catch(() => {});
      });

      router.setNodeAddressResolver((nodeId) => {
        return nodeId === 'remote-node' ? 'ws://remote-node:9999' : null;
      });

      let connectCalls = 0;
      router.connectToNode = async () => {
        connectCalls += 1;
        throw new Error('connect ECONNREFUSED remote-node:9999');
      };

      const firstResult = await router.deliver(
        'remote-node/service/remote-service',
        {type: 'TEST_MESSAGE'},
      );
      const secondResult = await router.deliver(
        'remote-node/service/remote-service',
        {type: 'TEST_MESSAGE'},
      );

      t.equal(connectCalls, 1,
        'subsequent deliveries should defer behind the armed reconnect owner');
      t.equal(firstResult.deferRetry, true,
        'first failed cold dial should ask callers to defer');
      t.equal(secondResult.deferRetry, true,
        'second delivery should also defer while reconnect remains scheduled');
      t.equal(secondResult.errorCode, 'ROUTER_CONNECTION_CLOSED',
        'second delivery should reuse the reconnect-in-progress failure');
    });

  t.test('should defer to an armed reconnect instead of starting a second recovery dial',
    async (t) => {
      const router = new MessageRouter({nodeId: 'test-node'});
      await router.initialize({startServer: false});
      t.teardown(async () => {
        await router.shutdown().catch(() => {});
      });

      const reconnectTimeout = setTimeout(() => {}, 1000);
      t.teardown(() => {
        clearTimeout(reconnectTimeout);
      });

      router.nodeConnections.set('remote-node', {
        nodeId: 'remote-node',
        address: 'ws://remote-node:9999',
        configuredAddress: 'ws://remote-node:9999',
        observedAddress: null,
        connectionId: 'remote-node-reconnecting',
        ws: null,
        state: ConnectionState.RECONNECTING,
        reconnectAttempts: 1,
        reconnectTimeout,
        reconnectDueAt: Date.now() + 250,
        pingInterval: null,
        isIncoming: false,
        isSelfConnection: false,
      });

      let connectCalls = 0;
      router.connectToNode = async () => {
        connectCalls += 1;
      };

      const result = await router.deliver(
        'remote-node/service/remote-service',
        {type: 'TEST_MESSAGE'},
      );

      t.equal(connectCalls, 0,
        'delivery should not bypass an already armed reconnect timer');
      t.equal(result.acknowledged, false,
        'delivery should fail closed while reconnect remains in progress');
      t.equal(result.deferRetry, true,
        'delivery should return a deferred retry hint');
      t.equal(result.errorCode, 'ROUTER_CONNECTION_CLOSED',
        'delivery should surface a stable closed-connection error code');
      t.ok(result.retryAfterMs > 0 && result.retryAfterMs <= 250,
        'delivery should expose the remaining reconnect delay');
    });

  t.test('should fail fast when one remote outbound queue is already saturated',
    async (t) => {
      const router = new MessageRouter({
        nodeId: 'test-node',
        outboundQueueMaxConcurrent: 1,
        outboundQueueMaxPending: 1,
      });
      await router.initialize();

      let sendCallCount = 0;
      let releaseFirstSend = null;
      const firstSendPromise = new Promise((resolve) => {
        releaseFirstSend = () => {
          resolve({
            acknowledged: false,
            error: 'first-send-released',
          });
        };
      });

      router.registerPendingResponse = () => new Promise(() => {});
      router.nodeConnections.set('remote-node', {
        nodeId: 'remote-node',
        address: 'ws://remote-node:9999',
        configuredAddress: 'ws://remote-node:9999',
        observedAddress: null,
        state: ConnectionState.CONNECTED,
        ws: {},
        isIncoming: false,
      });
      router.sendMessage = async () => {
        sendCallCount += 1;
        if (sendCallCount === 1) {
          return firstSendPromise;
        }
        return {
          acknowledged: false,
          error: 'queued-send-released',
        };
      };

      const firstDelivery = router.deliver(
        'remote-node/service/remote-service',
        {type: 'TEST_MESSAGE', messageId: 'msg-1'},
      );
      await Promise.resolve();

      const secondDelivery = router.deliver(
        'remote-node/service/remote-service',
        {type: 'TEST_MESSAGE', messageId: 'msg-2'},
      );
      await Promise.resolve();

      const thirdAttempt = router.deliver(
        'remote-node/service/remote-service',
        {type: 'TEST_MESSAGE', messageId: 'msg-3'},
      );
      const thirdOutcome = await Promise.race([
        thirdAttempt,
        new Promise((resolve) => setImmediate(() => resolve('pending'))),
      ]);

      t.not(thirdOutcome, 'pending',
        'queue-saturated delivery should fail fast instead of joining backlog');
      t.equal(thirdOutcome.acknowledged, false,
        'saturated delivery should return a failed-delivery envelope');
      t.match(thirdOutcome.error, /queue/i,
        'saturated delivery should expose queue backpressure');
      t.equal(thirdOutcome.deferRetry, true,
        'saturated delivery should ask upstream owners to defer retries');
      t.equal(thirdOutcome.retryAfterMs, router.reconnectIntervalMs,
        'saturated delivery should surface a retry-after hint');
      t.equal(
        router.getOutboundQueue('remote-node').pending.length,
        1,
        'only one waiting delivery should remain queued behind the in-flight send',
      );

      releaseFirstSend();
      await firstDelivery;
      await secondDelivery;
      await router.shutdown();
    });

  t.test('should deliver live Raft packets directly without queueing',
    async (t) => {
      const router = new MessageRouter({nodeId: 'test-node'});
      await router.initialize();

      const sentMessages = [];
      let pendingResponseRegistered = false;
      let enqueueOutboundCalled = false;
      router.registerPendingResponse = () => {
        pendingResponseRegistered = true;
        return new Promise(() => {});
      };
      router.enqueueOutbound = async () => {
        enqueueOutboundCalled = true;
        return {acknowledged: false, error: 'should-not-queue'};
      };
      const ws = new EventEmitter();
      ws.readyState = 1;
      ws.send = (frame) => sentMessages.push(JSON.parse(frame));
      ws.terminate = () => {
        ws.readyState = 3;
        ws.emit('close');
      };
      router.nodeConnections.set('remote-node', {
        nodeId: 'remote-node',
        address: 'ws://remote-node:9999',
        configuredAddress: 'ws://remote-node:9999',
        observedAddress: null,
        state: ConnectionState.CONNECTED,
        ws,
        isIncoming: false,
      });

      const result = await router.deliver(
        'remote-node/message-group/mg-1-r1',
        {
          type: 'append',
          messageId: 'msg-raft-direct',
          data: [{command: {type: 'CDC_BATCH'}}],
        },
      );

      t.equal(result.acknowledged, true,
        'Raft delivery should be acknowledged immediately');
      t.equal(result.direct, true,
        'Raft delivery should report the direct path');
      t.equal(enqueueOutboundCalled, false,
        'direct Raft delivery should bypass the outbound queue');
      t.equal(pendingResponseRegistered, false,
        'direct Raft delivery should not register a service response waiter');
      t.equal(router.pendingMessages.size, 0,
        'direct Raft delivery should not await a transport ACK');
      t.equal(router.pendingResponses.size, 0,
        'direct Raft delivery should not await a service response');
      t.equal(sentMessages.length, 1, 'direct delivery should send one frame');
      t.equal(sentMessages[0].type, RouterMessageType.SERVICE_MESSAGE,
        'direct delivery should still use a service envelope');
      t.equal(sentMessages[0].payload.type, 'append',
        'direct delivery should preserve the Raft payload');

      await router.shutdown();
    });

  t.test('should fall back to queued delivery when Raft socket is not live',
    async (t) => {
      const router = new MessageRouter({nodeId: 'test-node'});
      await router.initialize();

      let enqueueOutboundCalled = false;
      let pendingResponseRegistered = false;
      router.registerPendingResponse = () => {
        pendingResponseRegistered = true;
        return new Promise(() => {});
      };
      router.enqueueOutbound = async () => {
        enqueueOutboundCalled = true;
        return {acknowledged: false, error: 'queued-fallback'};
      };
      const ws = new EventEmitter();
      ws.readyState = 0;
      ws.send = () => {
        throw new Error('should-not-send-directly');
      };
      ws.terminate = () => {
        ws.readyState = 3;
        ws.emit('close');
      };
      router.nodeConnections.set('remote-node', {
        nodeId: 'remote-node',
        address: 'ws://remote-node:9999',
        configuredAddress: 'ws://remote-node:9999',
        observedAddress: null,
        state: ConnectionState.CONNECTED,
        ws,
        isIncoming: false,
      });

      const result = await router.deliver(
        'remote-node/message-group/mg-1-r1',
        {
          type: 'append',
          messageId: 'msg-raft-fallback',
          data: [{command: {type: 'CDC_BATCH'}}],
        },
      );

      t.equal(enqueueOutboundCalled, true,
        'Raft delivery should fall back to the queue when no live socket exists');
      t.equal(pendingResponseRegistered, true,
        'queued fallback should preserve the normal response registration path');
      t.equal(result.acknowledged, false,
        'fallback result should come from the queued path');
      t.equal(result.error, 'queued-fallback',
        'fallback result should preserve the queued delivery outcome');

      await router.shutdown();
    });

  t.test('should reserve pending capacity for critical outbound deliveries',
    async (t) => {
      const router = new MessageRouter({
        nodeId: 'test-node',
        outboundQueueMaxConcurrent: 1,
        outboundQueueMaxPending: 4,
        outboundQueueCriticalReserve: 3,
      });
      await router.initialize();

      let sendCallCount = 0;
      let releaseFirstSend = null;
      router.registerPendingResponse = () => new Promise(() => {});
      router.nodeConnections.set('remote-node', {
        nodeId: 'remote-node',
        address: 'ws://remote-node:9999',
        configuredAddress: 'ws://remote-node:9999',
        observedAddress: null,
        state: ConnectionState.CONNECTED,
        ws: {},
        isIncoming: false,
      });
      router.sendMessage = async () => {
        sendCallCount += 1;
        if (sendCallCount === 1) {
          await new Promise((resolve) => {
            releaseFirstSend = resolve;
          });
        }
        return {
          acknowledged: false,
          error: 'released-send',
        };
      };

      const inFlightDelivery = router.deliver(
        'remote-node/service/remote-service',
        {type: 'TEST_MESSAGE', messageId: 'msg-1'},
        {deliveryPriority: 'background'},
      );
      await Promise.resolve();

      const backgroundQueued = router.deliver(
        'remote-node/service/remote-service',
        {type: 'TEST_MESSAGE', messageId: 'msg-2'},
        {deliveryPriority: 'background'},
      );
      await Promise.resolve();

      const backgroundRejectedAttempt = router.deliver(
        'remote-node/service/remote-service',
        {type: 'TEST_MESSAGE', messageId: 'msg-3'},
        {deliveryPriority: 'background'},
      );
      const backgroundRejected = await Promise.race([
        backgroundRejectedAttempt,
        new Promise((resolve) => setImmediate(() => resolve('pending'))),
      ]);
      t.equal(
        backgroundRejected !== 'pending',
        true,
        'background rejection should fail fast instead of waiting in the queue',
      );
      t.equal(
        backgroundRejected.acknowledged,
        false,
        'background delivery should be rejected once non-reserved capacity is full',
      );
      t.match(
        backgroundRejected.error,
        /queue/i,
        'background rejection should surface queue pressure',
      );

      const criticalQueued = router.deliver(
        'remote-node/service/remote-service',
        {type: 'TEST_MESSAGE', messageId: 'msg-4'},
        {deliveryPriority: 'critical'},
      );
      await Promise.resolve();

      const queue = router.getOutboundQueue('remote-node');
      t.equal(
        queue.pending.length,
        2,
        'one background and one critical delivery should remain queued',
      );

      releaseFirstSend();
      await inFlightDelivery;
      await backgroundQueued;
      await criticalQueued;
      await router.shutdown();
    });

  t.test('should reserve in-flight dispatch capacity for critical outbound deliveries',
    async (t) => {
      const router = new MessageRouter({
        nodeId: 'test-node',
        outboundQueueMaxConcurrent: 2,
        outboundQueueMaxPending: 4,
        outboundQueueCriticalReserve: 1,
      });
      await router.initialize();

      let releaseFirstBackground = null;
      let releaseSecondBackground = null;
      const startedDeliveries = [];
      const firstBackground = router.enqueueOutbound(
        'remote-node',
        () => new Promise((resolve) => {
          startedDeliveries.push('background-1');
          releaseFirstBackground = () => resolve({acknowledged: true});
        }),
        {deliveryPriority: 'background'},
      );
      await Promise.resolve();

      const secondBackground = router.enqueueOutbound(
        'remote-node',
        () => new Promise((resolve) => {
          startedDeliveries.push('background-2');
          releaseSecondBackground = () => resolve({acknowledged: true});
        }),
        {deliveryPriority: 'background'},
      );
      await Promise.resolve();

      let criticalStarted = false;
      let releaseCritical = null;
      const criticalDelivery = router.enqueueOutbound(
        'remote-node',
        () => new Promise((resolve) => {
          criticalStarted = true;
          startedDeliveries.push('critical');
          releaseCritical = () => resolve({acknowledged: true});
        }),
        {deliveryPriority: 'critical'},
      );
      await Promise.resolve();

      const queue = router.getOutboundQueue('remote-node');
      t.equal(
        queue.inFlight,
        2,
        'one background and one critical delivery should occupy the dispatch slots',
      );
      t.equal(
        queue.pending.length,
        1,
        'second background delivery should remain queued behind the reserved critical slot',
      );
      t.equal(
        criticalStarted,
        true,
        'critical delivery should start without waiting for the queued background work',
      );
      t.same(
        startedDeliveries,
        ['background-1', 'critical'],
        'router should dispatch the critical delivery before the second background delivery',
      );

      releaseFirstBackground();
      await firstBackground;
      await Promise.resolve();

      t.same(
        startedDeliveries,
        ['background-1', 'critical', 'background-2'],
        'queued background delivery should resume once dispatch capacity is available',
      );

      releaseCritical();
      await criticalDelivery;
      releaseSecondBackground();
      await secondBackground;
      await router.shutdown();
    });

  t.test('should attribute saturated queue warnings to delivery sources',
    async (t) => {
      const router = new MessageRouter({
        nodeId: 'test-node',
        outboundQueueMaxConcurrent: 1,
        outboundQueueMaxPending: 1,
        outboundQueueCriticalReserve: 0,
      });
      await router.initialize();

      const warnEntries = [];
      const originalWarn = router.logger.warn.bind(router.logger);
      router.logger.warn = (message, context) => {
        warnEntries.push({message, context});
        return originalWarn(message, context);
      };

      let releaseFirstSend = null;
      const blockingDeliverFn = async () => {
        await new Promise((resolve) => {
          releaseFirstSend = resolve;
        });
        return {acknowledged: true};
      };

      const firstDelivery = router.enqueueOutbound(
        'remote-node',
        blockingDeliverFn,
        {deliveryPriority: 'critical'},
      );
      await Promise.resolve();

      const secondDelivery = router.enqueueOutbound(
        'remote-node',
        async () => ({acknowledged: true}),
        {
          deliveryPriority: 'critical',
          targetAddress: 'remote-node/partition/services-p1-r1',
          message: {
            type: 'QUERY',
            messageId: 'msg-2',
            sql: 'UPDATE services SET raft_role = ? WHERE service_id = ?',
            params: ['leader', 'svc-1'],
          },
        },
      );
      await Promise.resolve();

      let rejectionError = null;
      try {
        await router.enqueueOutbound(
          'remote-node',
          async () => ({acknowledged: true}),
          {
            deliveryPriority: 'critical',
            targetAddress: 'remote-node/service/control-plane',
            message: {type: 'NODE_STATE_UPDATE', messageId: 'msg-3'},
            deliverySource: 'join:node_state_update',
          },
        );
      } catch (error) {
        rejectionError = error;
      }

      t.ok(rejectionError, 'saturated delivery should fail');
      t.equal(
        rejectionError?.code,
        'ROUTER_OUTBOUND_QUEUE_BACKPRESSURED',
        'rejected delivery should surface queue backpressure',
      );
      const saturationEntry = warnEntries.find((entry) =>
        entry.message === 'Outbound queue saturated for node delivery');
      t.ok(saturationEntry, 'router should emit one saturation warning');
      t.equal(
        saturationEntry.context.localNodeId,
        'test-node',
        'warning should retain the local node id',
      );
      t.equal(
        saturationEntry.context.targetNodeId,
        'remote-node',
        'warning should report the target node id',
      );
      t.equal(
        saturationEntry.context.attemptedDeliverySource,
        'join:node_state_update',
        'warning should attribute the rejected source',
      );
      t.same(
        saturationEntry.context.pendingSourceSummary,
        [
          {source: 'query:update:services', count: 1},
        ],
        'warning should summarize the queued source mix',
      );

      releaseFirstSend();
      await firstDelivery;
      await secondDelivery;
      await router.shutdown();
    });

  t.test('should attribute Raft append saturation to underlying command types',
    async (t) => {
      const router = new MessageRouter({
        nodeId: 'test-node',
        outboundQueueMaxConcurrent: 1,
        outboundQueueMaxPending: 1,
        outboundQueueCriticalReserve: 0,
      });
      await router.initialize();

      const warnEntries = [];
      const originalWarn = router.logger.warn.bind(router.logger);
      router.logger.warn = (message, context) => {
        warnEntries.push({message, context});
        return originalWarn(message, context);
      };

      let releaseFirstSend = null;
      const blockingDeliverFn = async () => {
        await new Promise((resolve) => {
          releaseFirstSend = resolve;
        });
        return {acknowledged: true};
      };

      const firstDelivery = router.enqueueOutbound(
        'remote-node',
        blockingDeliverFn,
        {deliveryPriority: 'critical'},
      );
      await Promise.resolve();

      const secondDelivery = router.enqueueOutbound(
        'remote-node',
        async () => ({acknowledged: true}),
        {
          deliveryPriority: 'critical',
          targetAddress: 'remote-node/message-group/mg-1-r2',
          message: {
            type: 'append',
            data: [
              {
                command: {
                  type: 'CDC_BATCH',
                  events: [
                    {
                      tableName: 'services',
                      operation: 'UPDATE',
                      data: {service_id: 'svc-1'},
                    },
                    {
                      tableName: 'services',
                      operation: 'UPDATE',
                      data: {service_id: 'svc-2'},
                    },
                  ],
                },
              },
            ],
          },
        },
      );
      await Promise.resolve();

      await t.rejects(
        router.enqueueOutbound(
          'remote-node',
          async () => ({acknowledged: true}),
          {
            deliveryPriority: 'critical',
            targetAddress: 'remote-node/message-group/mg-1-r3',
            message: {
              type: 'append',
              data: [
                {
                  command: {
                    type: 'MESSAGE',
                    message: {
                      payload: {
                        type: 'NODE_STATE_UPDATE',
                      },
                    },
                  },
                },
              ],
            },
          },
        ),
        /queue/i,
        'third delivery should surface queue saturation',
      );

      const saturationEntry = warnEntries.find((entry) =>
        entry.message === 'Outbound queue saturated for node delivery');
      t.ok(saturationEntry, 'router should emit one saturation warning');
      t.equal(
        saturationEntry.context.attemptedDeliverySource,
        'raft:append:message:node_state_update',
        'warning should attribute rejected raft append by logical command type',
      );
      t.same(
        saturationEntry.context.pendingSourceSummary,
        [
          {source: 'raft:append:cdc_batch:services:2', count: 1},
        ],
        'warning should summarize queued raft append command types',
      );

      releaseFirstSend();
      await firstDelivery;
      await secondDelivery;
      await router.shutdown();
    });

  t.test(
    'should keep one background delivery source from monopolizing the pending queue',
    async (t) => {
      const router = new MessageRouter({
        nodeId: 'test-node',
        outboundQueueMaxConcurrent: 1,
        outboundQueueMaxPending: 8,
        outboundQueueCriticalReserve: 0,
      });
      await router.initialize();

      const warnEntries = [];
      const originalWarn = router.logger.warn.bind(router.logger);
      router.logger.warn = (message, context) => {
        warnEntries.push({message, context});
        return originalWarn(message, context);
      };

      let releaseFirstSend = null;
      const firstDelivery = router.enqueueOutbound(
        'remote-node',
        () => new Promise((resolve) => {
          releaseFirstSend = () => resolve({acknowledged: true});
        }),
        {deliveryPriority: 'critical'},
      );
      await Promise.resolve();

      const hotTargetAddress =
        'remote-node/partition/sql_transaction_participants-p1-r4';
      const hotSourceDeliveries = [];
      for (let index = 0; index < 4; index++) {
        hotSourceDeliveries.push(
          router.enqueueOutbound(
            'remote-node',
            async () => ({acknowledged: true, hotIndex: index}),
            {
              deliveryPriority: 'background',
              targetAddress: hotTargetAddress,
              message: {},
            },
          ),
        );
        await Promise.resolve();
      }

      const unrelatedDelivery = router.enqueueOutbound(
        'remote-node',
        async () => ({acknowledged: true, controlPlane: true}),
        {
          deliveryPriority: 'critical',
          targetAddress: 'remote-node/service/control-plane',
          message: {
            type: 'NODE_STATE_UPDATE',
            node_id: 'remote-node',
            heartbeat_only: true,
          },
        },
      );
      await Promise.resolve();

      await t.rejects(
        router.enqueueOutbound(
          'remote-node',
          async () => ({acknowledged: true}),
          {
            deliveryPriority: 'background',
            targetAddress: hotTargetAddress,
            message: {},
          },
        ),
        /queue/i,
        'same-source saturation should reject additional deliveries before the node queue is full',
      );

      const saturationEntry = warnEntries.find((entry) =>
        entry.message === 'Outbound queue saturated for node delivery' &&
        entry.context?.backpressureScope === 'delivery_source');
      t.ok(
        saturationEntry,
        'router should emit one delivery-source saturation warning',
      );
      t.equal(
        saturationEntry?.context?.attemptedDeliverySource,
        `target:${hotTargetAddress}`,
        'warning should attribute the saturated delivery source',
      );
      t.equal(
        saturationEntry?.context?.pendingForSource,
        4,
        'warning should report the queued count for the saturated source',
      );
      t.equal(
        saturationEntry?.context?.pendingSourceLimit,
        4,
        'warning should report the bounded queued limit for one source',
      );

      const queue = router.getOutboundQueue('remote-node');
      t.equal(
        queue.pending.length,
        5,
        'unrelated traffic should still keep one slot when a hot source reaches its cap',
      );

      releaseFirstSend();
      await firstDelivery;
      await Promise.all(hotSourceDeliveries);
      await unrelatedDelivery;
      await router.shutdown();
    },
  );

  t.test(
    'should keep one critical recovery source from monopolizing the pending queue',
    async (t) => {
      const router = new MessageRouter({
        nodeId: 'local-node',
        nodeAddress: 'ws://local-node:7000',
        startServer: false,
        outboundQueueMaxConcurrent: 1,
        outboundQueueMaxPending: 8,
        outboundQueueCriticalReserve: 4,
      });
      await router.initialize();

      const warnEntries = [];
      const originalWarn = router.logger.warn.bind(router.logger);
      router.logger.warn = (message, context) => {
        warnEntries.push({message, context});
        return originalWarn(message, context);
      };

      let releaseFirstSend = null;
      const firstDelivery = router.enqueueOutbound(
        'remote-node',
        () => new Promise((resolve) => {
          releaseFirstSend = () => resolve({acknowledged: true});
        }),
        {deliveryPriority: 'critical'},
      );
      await Promise.resolve();

      const hotRecoveryTargetAddress =
        'remote-node/partition/control_plane_publications-p1-r4';
      const criticalSourceDeliveries = [];
      for (let index = 0; index < 4; index++) {
        criticalSourceDeliveries.push(
          router.enqueueOutbound(
            'remote-node',
            async () => ({acknowledged: true, criticalIndex: index}),
            {
              deliveryPriority: 'critical',
              targetAddress: hotRecoveryTargetAddress,
              message: {},
            },
          ),
        );
        await Promise.resolve();
      }

      const unrelatedCriticalDelivery = router.enqueueOutbound(
        'remote-node',
        async () => ({acknowledged: true, unrelated: true}),
        {
          deliveryPriority: 'critical',
          targetAddress: 'remote-node/service/control-plane',
          message: {
            type: 'NODE_STATE_UPDATE',
            node_id: 'remote-node',
            heartbeat_only: true,
          },
        },
      );
      await Promise.resolve();

      await t.rejects(
        router.enqueueOutbound(
          'remote-node',
          async () => ({acknowledged: true, overflow: true}),
          {
            deliveryPriority: 'critical',
            targetAddress: hotRecoveryTargetAddress,
            message: {},
          },
        ),
        /queue/i,
        'same-source critical recovery traffic should be rejected before it fills the node queue',
      );

      const saturationEntry = warnEntries.find((entry) =>
        entry.message === 'Outbound queue saturated for node delivery' &&
        entry.context?.backpressureScope === 'delivery_source');
      t.ok(
        saturationEntry,
        'router should emit one delivery-source saturation warning for critical recovery traffic',
      );
      t.equal(
        saturationEntry?.context?.attemptedDeliverySource,
        `target:${hotRecoveryTargetAddress}`,
        'warning should attribute the saturated critical recovery source',
      );
      t.equal(
        saturationEntry?.context?.pendingForSource,
        4,
        'warning should report the queued count for the saturated critical source',
      );
      t.equal(
        saturationEntry?.context?.pendingSourceLimit,
        4,
        'warning should report the bounded queued limit for one critical source',
      );
      t.equal(
        saturationEntry?.context?.sourceLimitApplied,
        true,
        'critical recovery traffic should participate in the delivery-source cap',
      );

      const queue = router.getOutboundQueue('remote-node');
      t.equal(
        queue.pending.length,
        5,
        'unrelated critical traffic should still keep one slot when a hot critical source reaches its cap',
      );
      t.equal(
        queue.pending.filter((item) =>
          item?.deliverySource === `target:${hotRecoveryTargetAddress}`).length,
        4,
        'hot critical recovery traffic should stop at the bounded source cap',
      );

      releaseFirstSend();
      await firstDelivery;
      await Promise.all(criticalSourceDeliveries);
      await unrelatedCriticalDelivery;
      await router.shutdown();
    },
  );

  t.test(
    'should let critical recovery sources use non-reserved pending capacity',
    async (t) => {
      const TEST_LOCAL_NODE_ID = 'local-node';
      const TEST_REMOTE_NODE_ID = 'remote-node';
      const TEST_NODE_ADDRESS = 'ws://local-node:7000';
      const TEST_MAX_CONCURRENT = 1;
      const TEST_MAX_PENDING = 64;
      const TEST_CRITICAL_RESERVE = 16;
      const TEST_ALLOWED_HOT_SOURCE_DELIVERIES = 17;
      const TEST_HOT_RECOVERY_TARGET_ADDRESS =
        'remote-node/partition/sql_transactions-p1-r4';
      const TEST_CONTROL_PLANE_TARGET_ADDRESS =
        'remote-node/service/control-plane';
      const router = new MessageRouter({
        nodeId: TEST_LOCAL_NODE_ID,
        nodeAddress: TEST_NODE_ADDRESS,
        startServer: false,
        outboundQueueMaxConcurrent: TEST_MAX_CONCURRENT,
        outboundQueueMaxPending: TEST_MAX_PENDING,
        outboundQueueCriticalReserve: TEST_CRITICAL_RESERVE,
      });
      await router.initialize();

      const warnEntries = [];
      const originalWarn = router.logger.warn.bind(router.logger);
      router.logger.warn = (message, context) => {
        warnEntries.push({message, context});
        return originalWarn(message, context);
      };

      let releaseFirstSend = null;
      const firstDelivery = router.enqueueOutbound(
        TEST_REMOTE_NODE_ID,
        () => new Promise((resolve) => {
          releaseFirstSend = () => resolve({acknowledged: true});
        }),
        {deliveryPriority: 'critical'},
      );
      await Promise.resolve();

      const criticalSourceDeliveries = [];
      for (
        let index = 0;
        index < TEST_ALLOWED_HOT_SOURCE_DELIVERIES;
        index++
      ) {
        criticalSourceDeliveries.push(
          router.enqueueOutbound(
            TEST_REMOTE_NODE_ID,
            async () => ({acknowledged: true, criticalIndex: index}),
            {
              deliveryPriority: 'critical',
              targetAddress: TEST_HOT_RECOVERY_TARGET_ADDRESS,
              message: {},
            },
          ),
        );
        await Promise.resolve();
      }

      const unrelatedCriticalDelivery = router.enqueueOutbound(
        TEST_REMOTE_NODE_ID,
        async () => ({acknowledged: true, unrelated: true}),
        {
          deliveryPriority: 'critical',
          targetAddress: TEST_CONTROL_PLANE_TARGET_ADDRESS,
          message: {
            type: 'NODE_STATE_UPDATE',
            node_id: TEST_REMOTE_NODE_ID,
            heartbeat_only: true,
          },
        },
      );
      await Promise.resolve();

      const queue = router.getOutboundQueue(TEST_REMOTE_NODE_ID);
      t.equal(
        queue.pending.filter((item) =>
          item?.deliverySource ===
          `target:${TEST_HOT_RECOVERY_TARGET_ADDRESS}`).length,
        TEST_ALLOWED_HOT_SOURCE_DELIVERIES,
        'critical recovery source should exceed the proportional source cap',
      );
      t.equal(
        queue.pending.length,
        TEST_ALLOWED_HOT_SOURCE_DELIVERIES + TEST_MAX_CONCURRENT,
        'critical recovery source should still leave reserved pending capacity',
      );
      t.equal(
        warnEntries.some((entry) =>
          entry.message === 'Outbound queue saturated for node delivery' &&
          entry.context?.backpressureScope === 'delivery_source'),
        false,
        'critical recovery source should not trip the proportional source cap',
      );

      releaseFirstSend();
      await firstDelivery;
      await Promise.all(criticalSourceDeliveries);
      await unrelatedCriticalDelivery;
      await router.shutdown();
    },
  );

  t.test(
    'should let large critical recovery sources use full pending source capacity',
    async (t) => {
      const TEST_LOCAL_NODE_ID = 'local-node';
      const TEST_REMOTE_NODE_ID = 'remote-node';
      const TEST_NODE_ADDRESS = 'ws://local-node:7000';
      const TEST_MAX_CONCURRENT = 1;
      const TEST_MAX_PENDING = 64;
      const TEST_CRITICAL_RESERVE = 16;
      const TEST_ALLOWED_HOT_SOURCE_DELIVERIES = 49;
      const TEST_UNRELATED_PENDING_DELIVERIES = 1;
      const TEST_HOT_RECOVERY_TARGET_ADDRESS =
        'remote-node/partition/control_plane_publications-p1-r1';
      const TEST_CONTROL_PLANE_TARGET_ADDRESS =
        'remote-node/service/control-plane';
      const router = new MessageRouter({
        nodeId: TEST_LOCAL_NODE_ID,
        nodeAddress: TEST_NODE_ADDRESS,
        startServer: false,
        outboundQueueMaxConcurrent: TEST_MAX_CONCURRENT,
        outboundQueueMaxPending: TEST_MAX_PENDING,
        outboundQueueCriticalReserve: TEST_CRITICAL_RESERVE,
      });
      await router.initialize();

      const warnEntries = [];
      const originalWarn = router.logger.warn.bind(router.logger);
      router.logger.warn = (message, context) => {
        warnEntries.push({message, context});
        return originalWarn(message, context);
      };

      let releaseFirstSend = null;
      const firstDelivery = router.enqueueOutbound(
        TEST_REMOTE_NODE_ID,
        () => new Promise((resolve) => {
          releaseFirstSend = () => resolve({acknowledged: true});
        }),
        {deliveryPriority: 'critical'},
      );
      await Promise.resolve();

      const criticalSourceDeliveries = [];
      for (
        let index = 0;
        index < TEST_ALLOWED_HOT_SOURCE_DELIVERIES;
        index++
      ) {
        criticalSourceDeliveries.push(
          router.enqueueOutbound(
            TEST_REMOTE_NODE_ID,
            async () => ({acknowledged: true, criticalIndex: index}),
            {
              deliveryPriority: 'critical',
              targetAddress: TEST_HOT_RECOVERY_TARGET_ADDRESS,
              message: {},
            },
          ),
        );
        await Promise.resolve();
      }

      const unrelatedCriticalDelivery = router.enqueueOutbound(
        TEST_REMOTE_NODE_ID,
        async () => ({acknowledged: true, unrelated: true}),
        {
          deliveryPriority: 'critical',
          targetAddress: TEST_CONTROL_PLANE_TARGET_ADDRESS,
          message: {
            type: 'NODE_STATE_UPDATE',
            node_id: TEST_REMOTE_NODE_ID,
            heartbeat_only: true,
          },
        },
      );
      await Promise.resolve();

      const queue = router.getOutboundQueue(TEST_REMOTE_NODE_ID);
      t.equal(
        queue.pending.filter((item) =>
          item?.deliverySource ===
          `target:${TEST_HOT_RECOVERY_TARGET_ADDRESS}`).length,
        TEST_ALLOWED_HOT_SOURCE_DELIVERIES,
        'critical recovery source should exceed the reserve-protected source cap',
      );
      t.equal(
        queue.pending.length,
        TEST_ALLOWED_HOT_SOURCE_DELIVERIES +
          TEST_UNRELATED_PENDING_DELIVERIES,
        'critical recovery traffic should stop being source-capped before the node queue is full',
      );
      t.equal(
        warnEntries.some((entry) =>
          entry.message === 'Outbound queue saturated for node delivery' &&
          entry.context?.backpressureScope === 'delivery_source'),
        false,
        'large critical recovery source should not trip the reserve-protected source cap',
      );

      releaseFirstSend();
      await firstDelivery;
      await Promise.all(criticalSourceDeliveries);
      await unrelatedCriticalDelivery;
      await router.shutdown();
    },
  );

  t.test(
    'should classify wrapped query payloads by nested payload semantics',
    async (t) => {
      const WRAPPED_QUERY_TARGET_ADDRESS =
        'remote-node/partition/control_plane_publications-p1-r4';
      const WRAPPED_QUERY_DELIVERY_SOURCE =
        'query:insert:control_plane_publications';
      const WRAPPED_QUERY_MESSAGE = {
        payload: {
          type: 'QUERY',
          sql:
            'INSERT INTO control_plane_publications ' +
            '(publication_id) VALUES (?)',
          params: ['pub-1'],
        },
      };
      const router = new MessageRouter({
        nodeId: 'test-node',
        outboundQueueMaxConcurrent: 1,
        outboundQueueMaxPending: 4,
        outboundQueueCriticalReserve: 0,
      });
      await router.initialize();

      let releaseFirstSend = null;
      const firstDelivery = router.enqueueOutbound(
        'remote-node',
        () => new Promise((resolve) => {
          releaseFirstSend = () => resolve({acknowledged: true});
        }),
        {deliveryPriority: 'critical'},
      );
      await Promise.resolve();

      const wrappedQueryDelivery = router.enqueueOutbound(
        'remote-node',
        async () => ({acknowledged: true}),
        {
          deliveryPriority: 'critical',
          targetAddress: WRAPPED_QUERY_TARGET_ADDRESS,
          message: WRAPPED_QUERY_MESSAGE,
        },
      );
      await Promise.resolve();

      const queue = router.getOutboundQueue('remote-node');
      t.equal(
        queue.pending[0]?.deliverySource,
        WRAPPED_QUERY_DELIVERY_SOURCE,
        'wrapped query payloads should classify by the nested query payload ' +
          'instead of the raw target address',
      );

      releaseFirstSend();
      await firstDelivery;
      await wrappedQueryDelivery;
      await router.shutdown();
    },
  );

  t.test(
    'should classify typeless CDC payloads by table and operation semantics',
    async (t) => {
      const TYPELESS_CDC_TARGET_ADDRESS =
        'remote-node/partition/sql_transactions-p1-r4';
      const TYPELESS_CDC_DELIVERY_SOURCE = 'cdc:upsert:sql_transactions';
      const TYPELESS_CDC_MESSAGE = {
        tableName: 'sql_transactions',
        operation: 'UPSERT',
        data: {transaction_id: 'txn-1'},
      };
      const router = new MessageRouter({
        nodeId: 'test-node',
        outboundQueueMaxConcurrent: 1,
        outboundQueueMaxPending: 4,
        outboundQueueCriticalReserve: 0,
      });
      await router.initialize();

      let releaseFirstSend = null;
      const firstDelivery = router.enqueueOutbound(
        'remote-node',
        () => new Promise((resolve) => {
          releaseFirstSend = () => resolve({acknowledged: true});
        }),
        {deliveryPriority: 'critical'},
      );
      await Promise.resolve();

      const typelessCdcDelivery = router.enqueueOutbound(
        'remote-node',
        async () => ({acknowledged: true}),
        {
          deliveryPriority: 'critical',
          targetAddress: TYPELESS_CDC_TARGET_ADDRESS,
          message: TYPELESS_CDC_MESSAGE,
        },
      );
      await Promise.resolve();

      const queue = router.getOutboundQueue('remote-node');
      t.equal(
        queue.pending[0]?.deliverySource,
        TYPELESS_CDC_DELIVERY_SOURCE,
        'typeless CDC payloads should classify by table and operation ' +
          'instead of collapsing to the replica target address',
      );

      releaseFirstSend();
      await firstDelivery;
      await typelessCdcDelivery;
      await router.shutdown();
    },
  );

  t.test(
    'should preserve explicit heartbeat queue semantics from raft transport ' +
      'options when the queued payload is typeless',
    async (t) => {
      const HEARTBEAT_TARGET_ADDRESS =
        'remote-node/partition/sql_transactions-p1-r4';
      const HEARTBEAT_TRANSPORT_OPTIONS = resolveRaftTransportDeliveryOptions({
        type: 'append',
        data: [],
        targetAddress: HEARTBEAT_TARGET_ADDRESS,
      });
      const router = new MessageRouter({
        nodeId: 'test-node',
        outboundQueueMaxConcurrent: 1,
        outboundQueueMaxPending: 4,
        outboundQueueCriticalReserve: 0,
      });
      await router.initialize();

      let releaseFirstSend = null;
      const deliveredHeartbeatIds = [];
      const firstDelivery = router.enqueueOutbound(
        'remote-node',
        () => new Promise((resolve) => {
          releaseFirstSend = () => resolve({acknowledged: true});
        }),
        {deliveryPriority: 'critical'},
      );
      await Promise.resolve();

      const secondDelivery = router.enqueueOutbound(
        'remote-node',
        async () => {
          deliveredHeartbeatIds.push('second');
          return {acknowledged: true, heartbeatId: 'second'};
        },
        {
          ...HEARTBEAT_TRANSPORT_OPTIONS,
          targetAddress: HEARTBEAT_TARGET_ADDRESS,
          message: {},
        },
      );
      const thirdDelivery = router.enqueueOutbound(
        'remote-node',
        async () => {
          deliveredHeartbeatIds.push('third');
          return {acknowledged: true, heartbeatId: 'third'};
        },
        {
          ...HEARTBEAT_TRANSPORT_OPTIONS,
          targetAddress: HEARTBEAT_TARGET_ADDRESS,
          message: {},
        },
      );
      await Promise.resolve();

      const supersededResult = await secondDelivery;
      t.equal(
        supersededResult?.result?.acknowledged,
        true,
        'superseded heartbeat should still resolve successfully',
      );
      t.equal(
        supersededResult?.result?.replacedPending,
        true,
        'explicit heartbeat replace keys should coalesce typeless queued work',
      );

      const queue = router.getOutboundQueue('remote-node');
      t.equal(
        queue.pending.length,
        1,
        'helper-owned heartbeat semantics should keep only one pending heartbeat',
      );
      t.equal(
        queue.pending[0]?.deliverySource,
        'raft:append:heartbeat',
        'queued heartbeat should keep the canonical heartbeat delivery source',
      );

      releaseFirstSend();
      await firstDelivery;
      const finalHeartbeatResult = await thirdDelivery;

      t.same(
        deliveredHeartbeatIds,
        ['third'],
        'only the latest queued heartbeat should drain after coalescing',
      );
      t.equal(
        finalHeartbeatResult?.result?.heartbeatId,
        'third',
        'the latest queued heartbeat should be the delivered result',
      );

      await router.shutdown();
    },
  );

  await registerMessageRouterTailTests({
    t,
    net,
    EventEmitter,
    MessageRouter,
    ConnectionState,
    RouterMessageType,
    ConfigurationManager,
    LoggingService,
    initializeTestEnvironment,
    cleanupTestEnvironment,
  });
});
