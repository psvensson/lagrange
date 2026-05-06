/**
 * Unit tests for MessageRouter.
 * Tests local and remote message routing.
 * Requirements: 4.21, 4.22, 11.6, 11.7, 11.8, 11.9
 */

import {EventEmitter} from 'events';
import t from '../../src/test-helpers/tap.js';
import {MessageRouter, ConnectionState, RouterMessageType} from
  '../../src/transport/message-router.js';
import {ConfigurationManager} from '../../src/config/configuration-manager.js';
import {LoggingService} from '../../src/logging/logging-service.js';
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

t.test('MessageRouter unit tests chunk 1', async (t) => {
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
});
