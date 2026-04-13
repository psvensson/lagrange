/**
 * Unit tests for MessageRouter.
 * Tests local and remote message routing.
 * Requirements: 4.21, 4.22, 11.6, 11.7, 11.8, 11.9
 */
// @ts-nocheck


import net from 'net';
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
      t.equal(readiness.reason, 'query ingress owner not ready',
        'readiness should preserve the canonical owner reason');
      t.equal(readiness.retryAfterMs, 321,
        'readiness should preserve the typed retry hint');

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

  t.test('should replace superseded Raft heartbeat appends in the pending queue',
    async (t) => {
      const router = new MessageRouter({
        nodeId: 'test-node',
        outboundQueueMaxConcurrent: 1,
        outboundQueueMaxPending: 2,
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
          deliveryPriority: 'critical',
          targetAddress: 'remote-node/message-group/mg-1-r2',
          message: {type: 'append', data: []},
        },
      );
      await Promise.resolve();

      const thirdDelivery = router.enqueueOutbound(
        'remote-node',
        async () => {
          deliveredHeartbeatIds.push('third');
          return {acknowledged: true, heartbeatId: 'third'};
        },
        {
          deliveryPriority: 'critical',
          targetAddress: 'remote-node/message-group/mg-1-r2',
          message: {type: 'append'},
        },
      );

      const supersededResult = await secondDelivery;
      t.equal(
        supersededResult?.result?.acknowledged,
        true,
        'superseded heartbeat should resolve without surfacing an error',
      );
      t.equal(
        supersededResult?.result?.replacedPending,
        true,
        'superseded heartbeat should be marked as replaced pending work',
      );

      const queue = router.getOutboundQueue('remote-node');
      t.equal(
        queue.pending.length,
        1,
        'heartbeat replacement should keep only one pending heartbeat',
      );
      t.equal(
        queue.pending[0].deliverySource,
        'raft:append:heartbeat',
        'pending heartbeat should use the explicit heartbeat delivery source',
      );

      releaseFirstSend();
      await firstDelivery;
      const finalHeartbeatResult = await thirdDelivery;

      t.same(
        deliveredHeartbeatIds,
        ['third'],
        'only the latest queued heartbeat should be delivered',
      );
      t.equal(
        finalHeartbeatResult?.result?.heartbeatId,
        'third',
        'latest heartbeat should be the one that actually drains',
      );

      await router.shutdown();
    });

  t.test('should drain critical deliveries ahead of background backlog',
    async (t) => {
      const router = new MessageRouter({
        nodeId: 'test-node',
        outboundQueueMaxConcurrent: 1,
        outboundQueueMaxPending: 4,
        outboundQueueCriticalReserve: 1,
      });
      await router.initialize();

      const executionOrder = [];
      let releaseFirstSend = null;

      const firstDelivery = router.enqueueOutbound(
        'node-1',
        async () => {
          executionOrder.push('first');
          await new Promise((resolve) => {
            releaseFirstSend = resolve;
          });
          return {acknowledged: true};
        },
        {deliveryPriority: 'background'},
      );
      await Promise.resolve();

      const backgroundQueued = router.enqueueOutbound(
        'node-1',
        async () => {
          executionOrder.push('background');
          return {acknowledged: true};
        },
        {deliveryPriority: 'background'},
      );
      const criticalQueued = router.enqueueOutbound(
        'node-1',
        async () => {
          executionOrder.push('critical');
          return {acknowledged: true};
        },
        {deliveryPriority: 'critical'},
      );

      releaseFirstSend();
      await firstDelivery;
      await criticalQueued;
      await backgroundQueued;

      t.same(
        executionOrder,
        ['first', 'critical', 'background'],
        'critical queue lane should drain before background backlog',
      );

      await router.shutdown();
    });

  t.test('should get registered addresses', async (t) => {
    const router = new MessageRouter({nodeId: 'test-node'});
    await router.initialize();

    router.register('test-node/service/service-a', () => ({}));
    router.register('test-node/service/service-b', () => ({}));
    router.register('test-node/service/service-c', () => ({}));

    const addresses = router.getRegisteredAddresses();

    t.equal(addresses.length, 3, 'should have three addresses');
    t.ok(addresses.includes('test-node/service/service-a'), 'should include service-a');
    t.ok(addresses.includes('test-node/service/service-b'), 'should include service-b');
    t.ok(addresses.includes('test-node/service/service-c'), 'should include service-c');

    await router.shutdown();
  });

  t.test('should get stats', async (t) => {
    const router = new MessageRouter({
      nodeId: 'stats-test-node',
      nodeAddress: 'ws://localhost:8080',
    });
    await router.initialize();

    router.register('stats-test-node/service/service-1', () => ({}));
    router.register('stats-test-node/service/service-2', () => ({}));

    const stats = router.getStats();

    t.equal(stats.nodeId, 'stats-test-node', 'should have node ID');
    t.equal(stats.nodeAddress, 'ws://localhost:8080', 'should have node address');
    t.equal(stats.initialized, true, 'should be initialized');
    t.equal(stats.handlers, 2, 'should have two handlers');
    t.equal(stats.messageCount, 0, 'should have zero messages');
    t.equal(stats.pendingMessages, 0, 'should have zero pending');
    t.equal(stats.connectedNodes, 0, 'should have zero connections');

    await router.shutdown();
  });

  t.test('should increment message count on deliver attempt', async (t) => {
    // Message count increments even when delivery fails (no connection)
    const router = new MessageRouter({nodeId: 'test-node'});
    await router.initialize();

    router.register('test-node/service/counter-service', () => ({acknowledged: true}));

    // These will fail without connection but still increment counter
    await router.deliver('test-node/service/counter-service', {data: '1'});
    await router.deliver('test-node/service/counter-service', {data: '2'});
    await router.deliver('test-node/service/counter-service', {data: '3'});

    const stats = router.getStats();
    t.equal(stats.messageCount, 3, 'should count three messages');

    await router.shutdown();
  });

  t.test('should export ConnectionState enum', async (t) => {
    t.equal(ConnectionState.DISCONNECTED, 'disconnected');
    t.equal(ConnectionState.CONNECTING, 'connecting');
    t.equal(ConnectionState.CONNECTED, 'connected');
    t.equal(ConnectionState.RECONNECTING, 'reconnecting');
    t.equal(ConnectionState.CLOSED, 'closed');
  });

  t.test('should export RouterMessageType enum', async (t) => {
    t.equal(RouterMessageType.SERVICE_MESSAGE, 'service_message');
    t.equal(RouterMessageType.ACK, 'ack');
    t.equal(RouterMessageType.IDENTIFY, 'identify');
    t.equal(RouterMessageType.PING, 'ping');
    t.equal(RouterMessageType.PONG, 'pong');
  });

  t.test('connectToSelf uses bound server address', async (t) => {
    const router = new MessageRouter({
      nodeId: 'self-bound-host-test',
      wsPort: 9882,
    });

    router.server = {
      address: () => ({address: '::1', family: 'IPv6', port: 9882}),
    };

    const calls = [];
    router.connectToNode = async (nodeId, address, options) => {
      calls.push({nodeId, address, options});
    };

    await router.connectToSelf();

    t.equal(calls.length, 1, 'should make one self-connect attempt');
    t.equal(calls[0].nodeId, 'self-bound-host-test', 'should target local node ID');
    t.equal(calls[0].address, 'ws://[::1]:9882', 'should use bound IPv6 host');
    t.same(
      calls[0].options,
      {isSelfConnection: true},
      'should mark connection as self-connection',
    );
  });

  t.test('connectToNode enforces websocket handshake timeouts', async (t) => {
    cleanupTestEnvironment();
    const config = ConfigurationManager.getInstance();
    config.initialize({
      node: {id: 'test-node'},
      logging: {level: 'error'},
      transport: {messageTimeoutMs: 5000},
      timeout: {websocketConnectMs: 1000},
    });
    const logging = LoggingService.getInstance();
    logging.initialize({level: 'error'});

    const slowServer = net.createServer((socket) => {
      socket.on('data', () => {});
    });
    await new Promise((resolve) => slowServer.listen(0, '127.0.0.1', resolve));
    t.teardown(async () => {
      await new Promise((resolve) => slowServer.close(resolve));
    });

    const address = slowServer.address();
    const port = typeof address === 'object' && address ? address.port : null;
    const router = new MessageRouter({nodeId: 'timeout-test-node'});
    await router.initialize({startServer: false});
    t.teardown(async () => {
      await router.shutdown();
    });

    const outcome = await Promise.race([
      router.connectToNode('slow-node', `ws://127.0.0.1:${port}`)
        .then(() => 'connected')
        .catch((error) => error),
      new Promise((resolve) => setTimeout(() => resolve('timed_out'), 1100)),
    ]);

    t.type(outcome, Error, 'should reject stalled handshakes');
    t.match(outcome.message, /timeout/i, 'should surface a timeout error');
    t.equal(
      router.getConnectionState('slow-node'),
      ConnectionState.DISCONNECTED,
      'should mark timed out connections as disconnected',
    );
  });

  t.test('scheduleReconnect retries failed reconnects without unhandled rejections',
    async (t) => {
      const router = new MessageRouter({nodeId: 'reconnect-retry-node'});
      await router.initialize({startServer: false});
      t.teardown(async () => {
        await router.shutdown();
      });

      router.reconnectIntervalMs = 5;
      router.reconnectBackoffMultiplier = 1;
      router.reconnectMaxAttempts = 4;

      const connectionInfo = {
        connectionId: 'reconnect-1',
        nodeId: 'remote-node',
        address: 'ws://remote-node:8082',
        ws: null,
        state: ConnectionState.DISCONNECTED,
        reconnectAttempts: 0,
        reconnectTimeout: null,
        isIncoming: false,
        isSelfConnection: false,
        createdAt: Date.now(),
      };
      router.nodeConnections.set(connectionInfo.nodeId, connectionInfo);

      let attempts = 0;
      router.establishConnection = async (connection) => {
        attempts++;
        if (attempts < 3) {
          connection.state = ConnectionState.DISCONNECTED;
          throw new Error(`dial failed ${attempts}`);
        }
        connection.state = ConnectionState.CONNECTED;
        connection.reconnectAttempts = 0;
        connection.ws = {};
      };

      const unhandledRejections = [];
      const onUnhandledRejection = (error) => {
        unhandledRejections.push(error);
      };
      process.on('unhandledRejection', onUnhandledRejection);
      t.teardown(() => {
        process.off('unhandledRejection', onUnhandledRejection);
      });

      router.scheduleReconnect(connectionInfo);
      await new Promise((resolve) => setTimeout(resolve, 50));

      t.equal(attempts, 3, 'should keep retrying until a reconnect succeeds');
      t.equal(
        connectionInfo.state,
        ConnectionState.CONNECTED,
        'should mark the connection connected after a successful retry',
      );
      t.equal(
        connectionInfo.reconnectTimeout,
        null,
        'should clear the reconnect timer after callback execution',
      );
      t.same(
        unhandledRejections,
        [],
        'should not surface reconnect failures as unhandled rejections',
      );
    });

  t.test('scheduleReconnect closes after max failed attempts without throwing',
    async (t) => {
      const router = new MessageRouter({nodeId: 'reconnect-max-node'});
      await router.initialize({startServer: false});
      t.teardown(async () => {
        await router.shutdown();
      });

      router.reconnectIntervalMs = 5;
      router.reconnectBackoffMultiplier = 1;
      router.reconnectMaxAttempts = 2;

      const connectionInfo = {
        connectionId: 'reconnect-2',
        nodeId: 'remote-node',
        address: 'ws://remote-node:8082',
        ws: null,
        state: ConnectionState.DISCONNECTED,
        reconnectAttempts: 0,
        reconnectTimeout: null,
        isIncoming: false,
        isSelfConnection: false,
        createdAt: Date.now(),
      };
      router.nodeConnections.set(connectionInfo.nodeId, connectionInfo);

      let attempts = 0;
      router.establishConnection = async (connection) => {
        attempts++;
        connection.state = ConnectionState.DISCONNECTED;
        throw new Error('dial failed');
      };

      const unhandledRejections = [];
      const onUnhandledRejection = (error) => {
        unhandledRejections.push(error);
      };
      process.on('unhandledRejection', onUnhandledRejection);
      t.teardown(() => {
        process.off('unhandledRejection', onUnhandledRejection);
      });

      router.scheduleReconnect(connectionInfo);
      await new Promise((resolve) => setTimeout(resolve, 40));

      t.equal(attempts, 2, 'should stop after the configured max reconnect attempts');
      t.equal(
        connectionInfo.state,
        ConnectionState.CLOSED,
        'should close the connection after exhausting retries',
      );
      t.equal(
        connectionInfo.reconnectTimeout,
        null,
        'should not leave a reconnect timer armed after exhaustion',
      );
      t.same(
        unhandledRejections,
        [],
        'should not crash the process when retries are exhausted',
      );
    });

  t.test('scheduleReconnect suppresses a stale timer after the peer connection is superseded',
    async (t) => {
      const router = new MessageRouter({nodeId: 'reconnect-superseded-node'});
      await router.initialize({startServer: false});
      t.teardown(async () => {
        await router.shutdown();
      });

      router.reconnectIntervalMs = 5;
      router.reconnectBackoffMultiplier = 1;
      router.reconnectMaxAttempts = 2;

      const staleConnection = {
        connectionId: 'reconnect-stale',
        nodeId: 'remote-node',
        address: 'ws://remote-node:8082',
        ws: null,
        state: ConnectionState.DISCONNECTED,
        reconnectAttempts: 0,
        reconnectTimeout: null,
        isIncoming: false,
        isSelfConnection: false,
        retired: false,
        createdAt: Date.now(),
      };
      router.nodeConnections.set(staleConnection.nodeId, staleConnection);

      let attempts = 0;
      router.establishConnection = async () => {
        attempts++;
      };

      router.scheduleReconnect(staleConnection);
      router.nodeConnections.set(staleConnection.nodeId, {
        connectionId: 'incoming-current',
        nodeId: 'remote-node',
        address: 'ws://remote-node:8082',
        ws: {},
        state: ConnectionState.CONNECTED,
        reconnectAttempts: 0,
        reconnectTimeout: null,
        isIncoming: true,
        isSelfConnection: false,
        retired: false,
        createdAt: Date.now(),
      });

      await new Promise((resolve) => setTimeout(resolve, 20));

      t.equal(attempts, 0, 'superseded reconnect timer should not redial');
      t.equal(
        staleConnection.state,
        ConnectionState.CLOSED,
        'superseded connection should be marked closed',
      );
      t.equal(
        staleConnection.reconnectTimeout,
        null,
        'superseded reconnect timer should be cleared after the callback runs',
      );
      t.equal(
        staleConnection.retired,
        true,
        'superseded connection should be retired once the timer is suppressed',
      );
    });

  t.test('connectToNode retires a replaced reconnecting entry before dialing a new connection',
    async (t) => {
      const router = new MessageRouter({nodeId: 'replace-reconnecting-node'});
      await router.initialize({startServer: false});
      t.teardown(async () => {
        await router.shutdown();
      });

      let staleReconnectTimerFired = false;
      const staleReconnectTimeout = setTimeout(() => {
        staleReconnectTimerFired = true;
      }, 15);
      t.teardown(() => {
        clearTimeout(staleReconnectTimeout);
      });

      const stalePingInterval = setInterval(() => {}, 1000);
      t.teardown(() => {
        clearInterval(stalePingInterval);
      });

      const staleConnection = {
        connectionId: 'stale-reconnecting',
        nodeId: 'remote-node',
        address: 'ws://stale-node:8082',
        configuredAddress: 'ws://stale-node:8082',
        observedAddress: null,
        ws: null,
        state: ConnectionState.RECONNECTING,
        reconnectAttempts: 1,
        reconnectTimeout: staleReconnectTimeout,
        pingInterval: stalePingInterval,
        isIncoming: false,
        isSelfConnection: false,
        retired: false,
        createdAt: Date.now(),
      };
      router.nodeConnections.set(staleConnection.nodeId, staleConnection);

      router.establishConnection = async (connection) => {
        connection.state = ConnectionState.CONNECTED;
        connection.ws = {};
      };

      await router.connectToNode('remote-node', 'ws://fresh-node:8082');
      await new Promise((resolve) => setTimeout(resolve, 20));

      t.equal(
        staleReconnectTimerFired,
        false,
        'replaced reconnect timer should be cleared before it can fire',
      );
      t.equal(
        staleConnection.retired,
        true,
        'replaced reconnecting entry should be retired',
      );
      t.equal(
        staleConnection.reconnectTimeout,
        null,
        'replaced reconnecting entry should clear its timer',
      );
      t.equal(
        staleConnection.pingInterval,
        null,
        'replaced reconnecting entry should clear its heartbeat interval',
      );
      t.not(
        router.nodeConnections.get('remote-node')?.connectionId,
        staleConnection.connectionId,
        'active peer entry should no longer point at the stale reconnecting object',
      );
    });

  t.test('should emit nodeConnected on identification', async (t) => {
    const router = new MessageRouter({nodeId: 'local-node'});
    await router.initialize({startServer: false});

    const connectionId = 'incoming-connection';
    router.nodeConnections.set(connectionId, {
      connectionId,
      nodeId: null,
      nodeAddress: null,
      ws: {},
      state: ConnectionState.CONNECTED,
      reconnectAttempts: 0,
      isIncoming: true,
      isSelfConnection: false,
      createdAt: Date.now(),
    });

    let eventPayload = null;
    router.on('nodeConnected', (payload) => {
      eventPayload = payload;
    });

    router.handleIdentification(connectionId, {}, {
      type: RouterMessageType.IDENTIFY,
      nodeId: 'remote-node',
      nodeAddress: 'ws://remote-node:9999',
    });

    t.ok(eventPayload, 'should emit nodeConnected');
    t.equal(eventPayload.nodeId, 'remote-node', 'should include nodeId');
    t.equal(eventPayload.nodeAddress, 'ws://remote-node:9999', 'should include nodeAddress');
    t.equal(eventPayload.connectionId, connectionId, 'should include connectionId');
    t.ok(router.nodeConnections.has('remote-node'), 'should re-key connection by nodeId');
    t.notOk(router.nodeConnections.has(connectionId), 'should remove old connection key');

    await router.shutdown();
  });

  t.test('should normalize bare host:port to ws:// at ' +
    'identification storage time ' +
    '(uses normalizeToWebSocketAddress)', async (t) => {
    const router = new MessageRouter({nodeId: 'local-node'});
    await router.initialize({startServer: false});
    t.teardown(async () => {
      await router.shutdown().catch(() => {});
    });

    const connectionId = 'conn-bare-id';
    router.nodeConnections.set(connectionId, {
      connectionId,
      nodeId: null,
      nodeAddress: null,
      ws: {},
      state: ConnectionState.CONNECTED,
      reconnectAttempts: 0,
      isIncoming: true,
      isSelfConnection: false,
      createdAt: Date.now(),
      configuredAddress: null,
      observedAddress: null,
    });

    router.handleIdentification(connectionId, {}, {
      type: RouterMessageType.IDENTIFY,
      nodeId: 'remote-bare',
      nodeAddress: 'ddb-test-node-3:8080',
    });

    const conn = router.nodeConnections.get('remote-bare');
    t.ok(conn, 'connection should be re-keyed by nodeId');
    t.equal(conn.nodeAddress, 'ws://ddb-test-node-3:8082',
      'nodeAddress should be normalized to ws:// with ' +
      'WS port offset');
    t.equal(conn.configuredAddress,
      'ws://ddb-test-node-3:8082',
      'configuredAddress should be normalized to ws:// ' +
      'with WS port offset');
  });

  t.test('should preserve an existing preferred incoming connection on duplicate identification',
    async (t) => {
      const router = new MessageRouter({nodeId: 'z-local-node'});
      await router.initialize({startServer: false});

      const existingWs = {
        terminateCalled: false,
        terminate() {
          this.terminateCalled = true;
        },
      };
      router.nodeConnections.set('a-remote-node', {
        connectionId: 'existing-preferred-incoming',
        nodeId: 'a-remote-node',
        nodeAddress: 'ws://remote-node:9999',
        ws: existingWs,
        state: ConnectionState.CONNECTED,
        reconnectAttempts: 0,
        isIncoming: true,
        isSelfConnection: false,
        createdAt: Date.now(),
      });

      const duplicateWs = {
        terminateCalled: false,
        terminate() {
          this.terminateCalled = true;
        },
      };
      router.nodeConnections.set('incoming-duplicate', {
        connectionId: 'incoming-duplicate',
        nodeId: null,
        nodeAddress: null,
        ws: duplicateWs,
        state: ConnectionState.CONNECTED,
        reconnectAttempts: 0,
        isIncoming: true,
        isSelfConnection: false,
        createdAt: Date.now(),
      });

      router.handleIdentification('incoming-duplicate', duplicateWs, {
        type: RouterMessageType.IDENTIFY,
        nodeId: 'a-remote-node',
        nodeAddress: 'ws://remote-node:9999',
      });

      t.equal(
        router.nodeConnections.get('a-remote-node')?.connectionId,
        'existing-preferred-incoming',
        'router should keep the already-connected preferred incoming link',
      );
      t.equal(
        existingWs.terminateCalled,
        false,
        'router should not terminate the stable preferred incoming socket',
      );
      t.equal(
        duplicateWs.terminateCalled,
        true,
        'router should terminate the duplicate incoming socket',
      );
      t.notOk(
        router.nodeConnections.has('incoming-duplicate'),
        'duplicate connection key should be removed after identification',
      );

      await router.shutdown();
    });

  t.test('should mark a rekeyed incoming connection disconnected when its socket closes',
    async (t) => {
      const router = new MessageRouter({nodeId: 'z-local-node'});
      await router.initialize({startServer: false});

      const ws = new EventEmitter();
      ws.readyState = 1;
      ws.terminate = () => {
        ws.readyState = 3;
      };

      const closedEvents = [];
      router.on('connectionClosed', (event) => {
        closedEvents.push(event);
      });

      router.handleIncomingConnection(ws, null);
      const incomingConnectionId = Array.from(router.nodeConnections.keys())[0];

      router.handleIdentification(incomingConnectionId, ws, {
        type: RouterMessageType.IDENTIFY,
        nodeId: 'a-remote-node',
        nodeAddress: 'ws://remote-node:9999',
      });

      t.equal(
        router.nodeConnections.get('a-remote-node')?.state,
        ConnectionState.CONNECTED,
        'identified incoming connection should be tracked under the remote node ID',
      );

      ws.emit('close');

      t.equal(
        router.nodeConnections.get('a-remote-node')?.state,
        ConnectionState.DISCONNECTED,
        'closing a rekeyed incoming socket should update the live node entry',
      );
      t.same(
        closedEvents,
        [{nodeId: 'a-remote-node'}],
        'connectionClosed should be emitted for the identified remote node',
      );

      await router.shutdown();
    });

  t.test('should emit initialized event', async (t) => {
    const router = new MessageRouter({nodeId: 'event-test-node'});

    const events = [];
    router.on('initialized', (data) => events.push(data));

    await router.initialize();

    t.equal(events.length, 1, 'should emit one event');
    t.equal(events[0].nodeId, 'event-test-node', 'should have node ID');
    t.ok(events[0].routerId, 'should have router ID');

    await router.shutdown();
  });

  t.test('should emit shutdown event', async (t) => {
    const router = new MessageRouter({nodeId: 'shutdown-test'});
    await router.initialize();

    const events = [];
    router.on('shutdown', (data) => events.push(data));

    await router.shutdown();

    t.equal(events.length, 1, 'should emit one event');
    t.ok(events[0].routerId, 'should have router ID');
  });

  t.test('should clear all state on shutdown', async (t) => {
    const router = new MessageRouter({nodeId: 'cleanup-test'});
    await router.initialize();

    router.register('cleanup-test/service/service-1', () => ({}));
    router.register('cleanup-test/service/service-2', () => ({}));

    await router.shutdown();

    t.equal(router.initialized, false, 'should not be initialized');
    t.equal(router.handlers.size, 0, 'should clear handlers');
    t.equal(router.nodeConnections.size, 0, 'should clear connections');
    t.equal(router.pendingMessages.size, 0, 'should clear pending messages');
  });

  t.test('should not surface pending response shutdown races as unhandled rejections',
    async (t) => {
      const router = new MessageRouter({nodeId: 'shutdown-race-test'});
      await router.initialize({startServer: false});

      const unhandledRejections = [];
      const onUnhandledRejection = (error) => {
        unhandledRejections.push(error);
      };
      process.on('unhandledRejection', onUnhandledRejection);
      t.teardown(() => {
        process.off('unhandledRejection', onUnhandledRejection);
      });

      const ws = new EventEmitter();
      ws.readyState = 1;
      ws.send = () => {};
      ws.terminate = () => {
        ws.readyState = 3;
        queueMicrotask(() => ws.emit('close'));
      };
      router.nodeConnections.set('remote-node', {
        nodeId: 'remote-node',
        state: ConnectionState.CONNECTED,
        ws,
        isIncoming: false,
        isSelfConnection: false,
      });

      const deliveryPromise = router.deliver(
        'remote-node/service/test-service',
        {type: 'TEST', data: 'shutdown-race'},
      );

      await Promise.resolve();
      await router.shutdown();

      const result = await deliveryPromise;
      await Promise.resolve();

      t.equal(result.acknowledged, false, 'should report failed ACK on shutdown');
      t.equal(result.error, 'Router shutdown', 'should surface shutdown as delivery error');
      t.equal(router.pendingResponses.size, 0, 'should clear pending responses');
      t.same(
        unhandledRejections,
        [],
        'should not emit unhandled rejections when shutdown beats ACK',
      );
    });

  t.test('should rate-limit unmatched service response warnings', async (t) => {
    let nowMs = 1000;
    const router = new MessageRouter({
      nodeId: 'service-response-throttle-test',
      nowFn: () => nowMs,
      unmatchedServiceResponseWarnIntervalMs: 5000,
    });
    await router.initialize({startServer: false});

    const warns = [];
    const debugs = [];
    router.logger = {
      info() {},
      error() {},
      warn(message, context) {
        warns.push({message, context});
      },
      debug(message, context) {
        debugs.push({message, context});
      },
    };

    router.handleServiceResponse({
      messageId: 'orphan-response-1',
      result: {ok: true},
    });
    nowMs = 2000;
    router.handleServiceResponse({
      messageId: 'orphan-response-2',
      result: {ok: true},
    });
    nowMs = 7000;
    router.handleServiceResponse({
      messageId: 'orphan-response-3',
      result: {ok: true},
    });

    t.equal(warns.length, 2, 'should only warn once per throttle window');
    t.equal(debugs.length, 4,
      'should keep debug visibility for receive events and suppressed warnings');
    t.equal(
      warns[0].message,
      'No pending service response request',
      'should preserve the warning message',
    );
    t.equal(
      warns[1].context.suppressedSinceLastWarn,
      1,
      'later warnings should summarize suppressed duplicates',
    );
    t.ok(
      debugs.some((entry) => entry.context.suppressedByRateLimit === true),
      'suppressed duplicate warnings should degrade to debug',
    );

    await router.shutdown();
  });

  t.test('should absorb one late service response for a retired pending waiter',
    async (t) => {
      let nowMs = 1000;
      const router = new MessageRouter({
        nodeId: 'retired-service-response-test',
        nowFn: () => nowMs,
        unmatchedServiceResponseWarnIntervalMs: 5000,
      });
      await router.initialize({startServer: false});

      const warns = [];
      const debugs = [];
      router.logger = {
        info() {},
        error() {},
        warn(message, context) {
          warns.push({message, context});
        },
        debug(message, context) {
          debugs.push({message, context});
        },
      };

      router.registerPendingResponse('retired-response-1', 'node-remote');
      router.cancelPendingResponse('retired-response-1', {
        ignoreLateResponse: true,
      });

      nowMs = 1500;
      router.handleServiceResponse({
        messageId: 'retired-response-1',
        result: {ok: true},
      });
      router.handleServiceResponse({
        messageId: 'orphan-response-after-retired',
        result: {ok: true},
      });

      t.equal(
        warns.length,
        1,
        'retired late responses should be absorbed while true orphaned responses still warn',
      );
      t.equal(
        warns[0]?.context?.messageId,
        'orphan-response-after-retired',
        'only the genuinely orphaned response should emit a warning',
      );
      t.ok(
        debugs.some((entry) => entry.context?.ignoredRetiredPending === true),
        'router should mark absorbed late responses explicitly in debug logs',
      );

      await router.shutdown();
    });

  t.test('should handle multiple initializations idempotently', async (t) => {
    const router = new MessageRouter({nodeId: 'idempotent-test'});

    const events = [];
    router.on('initialized', () => events.push('init'));

    await router.initialize();
    await router.initialize();
    await router.initialize();

    t.equal(events.length, 1, 'should only emit once');
    t.equal(router.initialized, true, 'should be initialized');

    await router.shutdown();
  });

  t.test('should return null connection state for unknown node', async (t) => {
    const router = new MessageRouter({nodeId: 'test-node'});
    await router.initialize();

    const state = router.getConnectionState('unknown-node');
    t.equal(state, null, 'should return null for unknown node');

    await router.shutdown();
  });

  t.test('should return empty array for connected nodes when none connected', async (t) => {
    const router = new MessageRouter({nodeId: 'test-node'});
    await router.initialize();

    const connected = router.getConnectedNodes();
    t.same(connected, [], 'should return empty array');

    await router.shutdown();
  });

  // Self-connection tests (Requirements: 2.1, 2.2)
  t.test('should establish self-connection when starting server', async (t) => {
    const router = new MessageRouter({
      nodeId: 'self-connect-test',
      wsPort: 9876,
    });

    await router.initialize({startServer: true});

    // Verify self-connection exists
    t.ok(router.hasSelfConnection(), 'should have self-connection');
    t.equal(
      router.getConnectionState('self-connect-test'),
      ConnectionState.CONNECTED,
      'self-connection should be connected',
    );

    // Verify self is in connected nodes
    const connected = router.getConnectedNodes();
    t.ok(connected.includes('self-connect-test'), 'should include self in connected nodes');

    await router.shutdown();
  });

  t.test('should deliver messages to self via WebSocket', async (t) => {
    const router = new MessageRouter({
      nodeId: 'self-delivery-test',
      wsPort: 9877,
    });

    await router.initialize({startServer: true});

    const receivedMessages = [];
    router.register('self-delivery-test/service/test-service', (envelope) => {
      receivedMessages.push(envelope);
      return {acknowledged: true, data: 'response-from-self'};
    });

    // Deliver message to self
    const result = await router.deliver(
      'self-delivery-test/service/test-service',
      {type: 'TEST', data: 'hello-self'},
    );

    t.equal(result.acknowledged, true, 'should be acknowledged');
    t.equal(result.data, 'response-from-self', 'should have response data');
    t.equal(receivedMessages.length, 1, 'should receive one message');
    t.equal(receivedMessages[0].payload.data, 'hello-self', 'should have correct payload');

    await router.shutdown();
  });

  t.test('should preserve no-handler error details on acknowledged self delivery', async (t) => {
    const router = new MessageRouter({
      nodeId: 'self-no-handler-test',
      wsPort: 9887,
    });

    await router.initialize({startServer: true});

    const result = await router.deliver(
      'self-no-handler-test/service/missing-handler',
      {type: 'TEST', data: 'missing'},
    );

    t.equal(result.acknowledged, true, 'should acknowledge delivery');
    t.equal(result.noHandler, true, 'should surface noHandler flag');
    t.match(
      result.error,
      /No handler registered for address self-no-handler-test\/service\/missing-handler/,
      'should preserve no-handler error text on acknowledged ACK',
    );

    await router.shutdown();
  });

  t.test('should preserve handler-provided error details on acknowledged self delivery', async (t) => {
    const router = new MessageRouter({
      nodeId: 'self-error-detail-test',
      wsPort: 9888,
    });

    await router.initialize({startServer: true});

    router.register('self-error-detail-test/service/erroring-service', () => {
      return {
        acknowledged: true,
        status: 'error',
        error: 'replica assignment rejected',
      };
    });

    const result = await router.deliver(
      'self-error-detail-test/service/erroring-service',
      {type: 'TEST', data: 'bad'},
    );

    t.equal(result.acknowledged, true, 'should acknowledge delivery');
    t.equal(result.status, 'error', 'should preserve handler status');
    t.equal(
      result.error,
      'replica assignment rejected',
      'should preserve handler error text on acknowledged ACK',
    );

    await router.shutdown();
  });

  t.test('should emit selfDisconnect event when self-connection is lost', async (t) => {
    const router = new MessageRouter({
      nodeId: 'self-disconnect-test',
      wsPort: 9878,
    });

    await router.initialize({startServer: true});

    // Get the self-connection and verify it's marked correctly
    const selfConnection = router.nodeConnections.get('self-disconnect-test');
    t.ok(selfConnection, 'should have self-connection');
    t.ok(selfConnection.isSelfConnection, 'should be marked as self-connection');

    // Verify that self-connection is outgoing (not incoming)
    // This means it won't trigger reconnection attempts
    t.equal(selfConnection.isIncoming, false, 'self-connection should be outgoing');

    // Verify the connection state
    t.equal(selfConnection.state, ConnectionState.CONNECTED, 'should be connected');

    await router.shutdown();
  });

  t.test('should mark self-connection as isSelfConnection', async (t) => {
    const router = new MessageRouter({
      nodeId: 'self-mark-test',
      wsPort: 9881,
    });

    await router.initialize({startServer: true});

    const selfConnection = router.nodeConnections.get('self-mark-test');
    t.ok(selfConnection, 'should have self-connection');
    t.ok(selfConnection.isSelfConnection, 'should be marked as self-connection');

    // Regular connections should not be marked as self-connection
    // (we can't easily test this without another node, but we verify the flag exists)
    t.equal(
      typeof selfConnection.isSelfConnection,
      'boolean',
      'isSelfConnection should be boolean',
    );

    await router.shutdown();
  });

  t.test('should not have self-connection without starting server', async (t) => {
    const router = new MessageRouter({
      nodeId: 'no-server-test',
      wsPort: 9879,
    });

    await router.initialize({startServer: false});

    t.notOk(router.hasSelfConnection(), 'should not have self-connection');
    t.equal(router.server, null, 'should not have server');

    await router.shutdown();
  });

  t.test('should fail initialization if self-connection fails', async (t) => {
    // Use a port that's already in use to cause server start failure
    const router1 = new MessageRouter({
      nodeId: 'port-holder',
      wsPort: 9890,
    });
    await router1.initialize({startServer: true});

    const router2 = new MessageRouter({
      nodeId: 'fail-connect-test',
      wsPort: 9890, // Same port - will fail
    });

    try {
      await router2.initialize({startServer: true});
      t.fail('should have thrown error');
    } catch (error) {
      t.ok(error.message, 'should have error message');
    }

    await router1.shutdown();
    // router2 doesn't need shutdown since it failed to initialize
  });

  t.test('should fall back to deliverRemote when no handler registered',
    async (t) => {
      const router = new MessageRouter({nodeId: 'test-node'});
      await router.initialize({startServer: false});

      let deliverRemoteCalled = false;
      let capturedArgs = null;
      const originalDeliverRemote = router.deliverRemote.bind(router);
      router.deliverRemote = async (...args) => {
        deliverRemoteCalled = true;
        capturedArgs = args;
        return originalDeliverRemote(...args);
      };

      // No handler registered for this address
      const result = await router.deliver(
        'test-node/service/unregistered', {data: 'test'},
      );

      t.ok(deliverRemoteCalled, 'should call deliverRemote as fallback');
      t.equal(
        capturedArgs[0], 'test-node/service/unregistered',
        'should pass target address to deliverRemote',
      );
      t.equal(result.acknowledged, false, 'should not be acknowledged');

      await router.shutdown();
    });

  t.test('should log metrics for local delivery', async (t) => {
    const router = new MessageRouter({nodeId: 'metrics-local-node'});
    await router.initialize({startServer: false});

    const loggedEntries = [];
    const originalInfo = router.logger.info.bind(router.logger);
    router.logger.info = (tag, data) => {
      loggedEntries.push({tag, data});
      return originalInfo(tag, data);
    };

    router.register(
      'metrics-local-node/service/svc', () => ({acknowledged: true}),
    );

    // Deliver enough messages to trigger a fault metric (first fault fires)
    // A failed delivery triggers FAULT on the 1st occurrence
    router.register(
      'metrics-local-node/service/fail-svc', () => {
        throw new Error('fail');
      },
    );

    await router.deliver(
      'metrics-local-node/service/fail-svc', {data: 'trigger-metric'},
    );

    const metricsLogs = loggedEntries.filter(
      (e) => e.tag === 'metrics.transport.deliver',
    );
    t.ok(metricsLogs.length > 0, 'should emit transport deliver metric');
    t.equal(
      metricsLogs[0].data.targetNodeId, 'metrics-local-node',
      'metric should target local node',
    );
    t.equal(
      metricsLogs[0].data.acknowledged, false,
      'metric should reflect acknowledged status',
    );

    await router.shutdown();
  });

  t.test('outbound queue enforces per-node concurrency', async (t) => {
    const router = new MessageRouter({nodeId: 'test-node'});
    await router.initialize({startServer: false});
    router.outboundQueueMaxConcurrent = 1;

    let inFlight = 0;
    let maxInFlight = 0;
    const deliveries = [];

    for (let i = 0; i < 3; i++) {
      deliveries.push(router.enqueueOutbound('node-1', async () => {
        inFlight += 1;
        maxInFlight = Math.max(maxInFlight, inFlight);
        await Promise.resolve();
        inFlight -= 1;
        return {acknowledged: true};
      }));
    }

    await Promise.all(deliveries);
    t.equal(maxInFlight, 1, 'limits in-flight per node');

    await router.shutdown();
  });

  t.test('failOutboundQueue rejects pending deliveries', async (t) => {
    const router = new MessageRouter({nodeId: 'test-node'});
    await router.initialize({startServer: false});
    router.outboundQueueMaxConcurrent = 1;

    let releaseFirst = null;
    const firstPromise = router.enqueueOutbound('node-1', () => {
      return new Promise((resolve) => {
        releaseFirst = resolve;
      });
    });

    const secondPromise = router.enqueueOutbound('node-1', async () => {
      return {acknowledged: true};
    });

    router.failOutboundQueue('node-1', new Error('disconnect'));

    await t.rejects(secondPromise, /disconnect/, 'pending delivery rejected');

    releaseFirst({acknowledged: true});
    await firstPromise;

    await router.shutdown();
  });

  t.test('default outbound concurrency allows parallel writes', async (t) => {
    const router = new MessageRouter({nodeId: 'test-node'});
    await router.initialize({startServer: false});

    const parallelCount = 8;
    let inFlight = 0;
    let maxInFlight = 0;
    const arrivedResolvers = [];
    let gateResolve;
    const gate = new Promise((resolve) => {
      gateResolve = resolve;
    });
    const deliveries = [];

    for (let i = 0; i < parallelCount; i++) {
      deliveries.push(router.enqueueOutbound('node-1', () => {
        inFlight += 1;
        maxInFlight = Math.max(maxInFlight, inFlight);
        return new Promise((resolve) => {
          arrivedResolvers.push(resolve);
          if (arrivedResolvers.length >= parallelCount) {
            gateResolve();
          }
        });
      }));
    }

    await gate;
    t.equal(
      maxInFlight, parallelCount,
      `default concurrency should allow ${parallelCount} parallel ` +
      `deliveries but only ${maxInFlight} were in-flight`,
    );

    for (const resolve of arrivedResolvers) {
      resolve({acknowledged: true});
    }
    await Promise.all(deliveries);

    await router.shutdown();
  });

  t.test('remote slow handler does not block queued deliveries waiting for ACK',
    async (t) => {
      cleanupTestEnvironment();
      const config = ConfigurationManager.getInstance();
      config.initialize({
        node: {id: 'node-a'},
        logging: {level: 'error'},
        transport: {
          messageTimeoutMs: 180,
        },
      });
      const logging = LoggingService.getInstance();
      logging.initialize({level: 'error'});

      const routerA = new MessageRouter({
        nodeId: 'node-a',
        wsPort: 12901,
        inProcess: true,
      });
      const routerB = new MessageRouter({
        nodeId: 'node-b',
        wsPort: 12902,
        inProcess: true,
      });

      await routerA.initialize({startServer: true});
      await routerB.initialize({startServer: true});
      t.teardown(async () => {
        await routerA.shutdown().catch(() => {});
        await routerB.shutdown().catch(() => {});
      });

      routerA.outboundQueueMaxConcurrent = 1;

      let firstCallResolver = null;
      let invocationCount = 0;
      routerB.register('node-b/service/slow-ack-test', async (envelope) => {
        invocationCount += 1;
        if (invocationCount === 1) {
          return await new Promise((resolve) => {
            firstCallResolver = resolve;
          });
        }
        return {
          acknowledged: true,
          id: envelope.payload?.id,
        };
      });

      await routerA.connectToNode('node-b', 'ws://localhost:12902');

      const firstPromise = routerA.deliver(
        'node-b/service/slow-ack-test',
        {type: 'TEST', id: 1},
      );
      await new Promise((resolve) => setTimeout(resolve, 15));

      const secondStartMs = Date.now();
      const secondResult = await routerA.deliver(
        'node-b/service/slow-ack-test',
        {type: 'TEST', id: 2},
      );
      const secondDurationMs = Date.now() - secondStartMs;

      if (firstCallResolver) {
        firstCallResolver({
          acknowledged: true,
          id: 1,
        });
      }
      await firstPromise;

      t.equal(secondResult.acknowledged, true, 'second delivery should be acknowledged');
      t.equal(secondResult.id, 2, 'second delivery should preserve handler payload');
      t.ok(
        secondDurationMs < 80,
        `second delivery should not be blocked by first ACK wait ` +
        `(took ${secondDurationMs}ms)`,
      );
    });

  t.test('simultaneous cross-connect keeps bidirectional node routing connected',
    async (t) => {
      cleanupTestEnvironment();
      const config = ConfigurationManager.getInstance();
      config.initialize({
        node: {id: 'node-a'},
        logging: {level: 'error'},
        transport: {
          messageTimeoutMs: 200,
          reconnectIntervalMs: 100,
          reconnectMaxAttempts: 3,
        },
      });
      const logging = LoggingService.getInstance();
      logging.initialize({level: 'error'});

      const routerA = new MessageRouter({
        nodeId: 'node-a',
        wsPort: 12903,
        inProcess: true,
      });
      const routerB = new MessageRouter({
        nodeId: 'node-b',
        wsPort: 12904,
        inProcess: true,
      });

      await routerA.initialize({startServer: true});
      await routerB.initialize({startServer: true});
      t.teardown(async () => {
        await routerA.shutdown().catch(() => {});
        await routerB.shutdown().catch(() => {});
      });

      await Promise.all([
        routerA.connectToNode('node-b', 'ws://localhost:12904'),
        routerB.connectToNode('node-a', 'ws://localhost:12903'),
      ]);

      await new Promise((resolve) => setTimeout(resolve, 25));

      t.equal(
        routerA.getConnectionState('node-b'),
        ConnectionState.CONNECTED,
        'routerA should keep routable connection keyed by node-b',
      );
      t.equal(
        routerB.getConnectionState('node-a'),
        ConnectionState.CONNECTED,
        'routerB should keep routable connection keyed by node-a',
      );
    });

  t.test('ack timeout does not emit unhandled pending response rejection',
    async (t) => {
      cleanupTestEnvironment();
      const config = ConfigurationManager.getInstance();
      config.initialize({
        node: {id: 'node-a'},
        logging: {level: 'error'},
        transport: {
          messageTimeoutMs: 100,
        },
      });
      const logging = LoggingService.getInstance();
      logging.initialize({level: 'error'});

      const router = new MessageRouter({
        nodeId: 'node-a',
      });
      await router.initialize({startServer: false});
      t.teardown(async () => {
        await router.shutdown().catch(() => {});
      });

      // Simulate a connected peer socket that silently drops outbound writes.
      router.nodeConnections.set('node-b', {
        nodeId: 'node-b',
        nodeAddress: 'ws://node-b:9999',
        connectionId: 'node-b',
        ws: {
          readyState: 1,
          send: () => {},
        },
        state: ConnectionState.CONNECTED,
        isIncoming: false,
        reconnectAttempts: 0,
        reconnectTimeout: null,
        pingInterval: null,
        address: 'ws://node-b:9999',
        isSelfConnection: false,
      });

      const unhandled = [];
      const onUnhandled = (error) => {
        unhandled.push(error);
      };
      process.on('unhandledRejection', onUnhandled);
      t.teardown(() => {
        process.off('unhandledRejection', onUnhandled);
      });

      const result = await router.deliver(
        'node-b/service/no-ack',
        {type: 'TEST'},
      );

      t.equal(result.acknowledged, false, 'delivery should fail when ACK times out');
      t.match(result.error, /Message timeout/i, 'should surface ACK timeout error');
      t.equal(result.deferRetry, true,
        'ACK timeout should ask callers to defer immediate retries');
      t.equal(result.errorCode, 'ROUTER_MESSAGE_TIMEOUT',
        'ACK timeout should surface a stable deferred-timeout error code');

      await new Promise((resolve) => setTimeout(resolve, 150));
      t.equal(
        unhandled.length,
        0,
        'pending SERVICE_RESPONSE timeout should not surface as unhandled rejection',
      );
    });

  t.test('closed socket before send returns a deferred failure and arms reconnect',
    async (t) => {
      const router = new MessageRouter({
        nodeId: 'node-a',
        reconnectIntervalMs: 250,
      });
      await router.initialize({startServer: false});
      t.teardown(async () => {
        await router.shutdown().catch(() => {});
      });

      const closedWs = {
        readyState: 3,
        send: () => {
          throw new Error('socket should not send while closed');
        },
        terminateCalled: false,
        terminate() {
          this.terminateCalled = true;
        },
      };
      router.nodeConnections.set('node-b', {
        nodeId: 'node-b',
        nodeAddress: 'ws://node-b:9999',
        connectionId: 'node-b-closed-before-send',
        ws: closedWs,
        state: ConnectionState.CONNECTED,
        isIncoming: false,
        reconnectAttempts: 0,
        reconnectTimeout: null,
        reconnectDueAt: null,
        pingInterval: null,
        address: 'ws://node-b:9999',
        configuredAddress: 'ws://node-b:9999',
        observedAddress: null,
        isSelfConnection: false,
      });

      const result = await router.deliver(
        'node-b/service/closed-before-send',
        {type: 'TEST'},
      );

      t.equal(result.acknowledged, false,
        'delivery should fail closed when the socket is already closed');
      t.equal(result.deferRetry, true,
        'delivery should ask callers to defer immediate retries');
      t.equal(result.errorCode, 'ROUTER_CONNECTION_CLOSED',
        'delivery should surface a stable closed-connection error code');
      t.equal(
        router.nodeConnections.get('node-b')?.state,
        ConnectionState.RECONNECTING,
        'the peer should transition into reconnecting after the closed send',
      );
      t.ok(
        router.nodeConnections.get('node-b')?.reconnectTimeout,
        'the peer should arm one reconnect timer after the closed send',
      );
      t.equal(
        closedWs.terminateCalled,
        true,
        'the stale socket should be terminated before recovery',
      );
    });

  t.test('first ACK timeout stays on the current socket until the quarantine threshold is reached',
    async (t) => {
      cleanupTestEnvironment();
      const config = ConfigurationManager.getInstance();
      config.initialize({
        node: {id: 'node-a'},
        logging: {level: 'error'},
        transport: {
          messageTimeoutMs: 100,
          reconnectIntervalMs: 100,
          ackTimeoutQuarantineThreshold: 2,
        },
      });
      const logging = LoggingService.getInstance();
      logging.initialize({level: 'error'});

      const router = new MessageRouter({
        nodeId: 'node-a',
      });
      await router.initialize({startServer: false});
      t.teardown(async () => {
        await router.shutdown().catch(() => {});
      });

      router.nodeConnections.set('node-b', {
        nodeId: 'node-b',
        nodeAddress: 'ws://node-b:9999',
        connectionId: 'node-b-stale',
        ws: {
          readyState: 1,
          send: () => {},
        },
        state: ConnectionState.CONNECTED,
        isIncoming: false,
        reconnectAttempts: 0,
        reconnectTimeout: null,
        pingInterval: null,
        address: 'ws://node-b:9999',
        isSelfConnection: false,
        ackTimeoutStreak: 0,
        lastAckAt: null,
        lastAckTimeoutAt: null,
      });

      const result = await router.deliver(
        'node-b/service/no-ack',
        {type: 'TEST'},
      );

      t.equal(result.acknowledged, false,
        'delivery should still fail when the ACK times out');
      t.equal(result.errorCode, 'ROUTER_MESSAGE_TIMEOUT',
        'timeout should still surface the deferred timeout error');
      t.equal(
        router.nodeConnections.get('node-b')?.state,
        ConnectionState.CONNECTED,
        'the first timeout should keep the current socket when below threshold',
      );
      t.equal(
        router.nodeConnections.get('node-b')?.ackTimeoutStreak,
        1,
        'the timeout streak should increment for the active connection',
      );
    });

  t.test('delivery timeout override bounds ACK waits per call', async (t) => {
    cleanupTestEnvironment();
    const config = ConfigurationManager.getInstance();
    config.initialize({
      node: {id: 'node-a'},
      logging: {level: 'error'},
      transport: {
        messageTimeoutMs: 100,
        reconnectIntervalMs: 100,
      },
    });
    const logging = LoggingService.getInstance();
    logging.initialize({level: 'error'});

    const router = new MessageRouter({nodeId: 'node-a'});
    await router.initialize({startServer: false});
    t.teardown(async () => {
      await router.shutdown().catch(() => {});
    });

    router.nodeConnections.set('node-b', {
      nodeId: 'node-b',
      nodeAddress: 'ws://node-b:9999',
      connectionId: 'node-b-timeout-override',
      ws: {
        readyState: 1,
        send: () => {},
      },
      state: ConnectionState.CONNECTED,
      isIncoming: false,
      reconnectAttempts: 0,
      reconnectTimeout: null,
      pingInterval: null,
      address: 'ws://node-b:9999',
      isSelfConnection: false,
      ackTimeoutStreak: 0,
      lastAckAt: null,
      lastAckTimeoutAt: null,
    });

    const startMs = Date.now();
    const result = await router.deliver(
      'node-b/service/no-ack',
      {type: 'TEST'},
      {timeoutMs: 20},
    );
    const elapsedMs = Date.now() - startMs;

    t.equal(result.acknowledged, false,
      'delivery should still fail when the ACK times out');
    t.equal(result.errorCode, 'ROUTER_MESSAGE_TIMEOUT',
      'timeout override should preserve the deferred timeout error code');
    t.ok(elapsedMs < 80,
      'delivery should honor the per-call timeout override instead of the router default');
  });

  t.test('ack timeout quarantines stale remote connection so the next delivery can reconnect',
    async (t) => {
      cleanupTestEnvironment();
      const config = ConfigurationManager.getInstance();
      config.initialize({
        node: {id: 'node-a'},
        logging: {level: 'error'},
        transport: {
          messageTimeoutMs: 100,
          reconnectIntervalMs: 100,
          ackTimeoutQuarantineThreshold: 1,
        },
      });
      const logging = LoggingService.getInstance();
      logging.initialize({level: 'error'});

      const router = new MessageRouter({
        nodeId: 'node-a',
      });
      await router.initialize({startServer: false});
      t.teardown(async () => {
        await router.shutdown().catch(() => {});
      });

      const staleWs = {
        readyState: 1,
        send: () => {},
        terminateCalled: false,
        terminate() {
          this.terminateCalled = true;
        },
      };
      router.nodeConnections.set('node-b', {
        nodeId: 'node-b',
        nodeAddress: 'ws://node-b:9999',
        connectionId: 'node-b-stale',
        ws: staleWs,
        state: ConnectionState.CONNECTED,
        isIncoming: false,
        reconnectAttempts: 0,
        reconnectTimeout: null,
        pingInterval: null,
        address: 'ws://node-b:9999',
        isSelfConnection: false,
        ackTimeoutStreak: 0,
        lastAckAt: null,
        lastAckTimeoutAt: null,
      });

      const firstResult = await router.deliver(
        'node-b/service/no-ack',
        {type: 'TEST'},
      );

      t.equal(
        firstResult.acknowledged,
        false,
        'first delivery should fail when ACK times out',
      );
      t.match(
        firstResult.error,
        /Message timeout/i,
        'first delivery should surface the ACK timeout',
      );
      t.equal(
        firstResult.deferRetry,
        true,
        'first delivery should ask callers to defer while recovery is pending',
      );
      t.equal(
        firstResult.errorCode,
        'ROUTER_MESSAGE_TIMEOUT',
        'first delivery should surface the deferred-timeout error code',
      );
      t.equal(
        router.nodeConnections.get('node-b')?.state,
        ConnectionState.RECONNECTING,
        'timed-out connection should enter reconnecting state',
      );
      t.equal(
        staleWs.terminateCalled,
        false,
        'timed-out connection should not hard-close the stale socket immediately',
      );

      const connectCalls = [];
      router.establishConnection = async (connectionInfo) => {
        connectCalls.push({
          nodeId: connectionInfo.nodeId,
          address: connectionInfo.address,
        });
        connectionInfo.ws = {
          readyState: 1,
          send: () => {},
        };
        connectionInfo.state = ConnectionState.CONNECTED;
        connectionInfo.reconnectAttempts = 0;
        connectionInfo.reconnectTimeout = null;
        connectionInfo.reconnectDueAt = null;
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

      const secondResult = await router.deliver(
        'node-b/service/no-ack',
        {type: 'TEST'},
      );

      t.same(connectCalls, [],
        'next delivery should respect the armed reconnect owner');
      t.equal(
        secondResult.acknowledged,
        false,
        'next delivery should still fail closed while reconnect is pending',
      );
      t.equal(
        secondResult.deferRetry,
        true,
        'next delivery should ask callers to defer while reconnect is pending',
      );
      t.equal(
        secondResult.errorCode,
        'ROUTER_CONNECTION_CLOSED',
        'next delivery should surface the reconnect-in-progress error code',
      );

      await new Promise((resolve) => setTimeout(resolve, 140));

      const thirdResult = await router.deliver(
        'node-b/service/no-ack',
        {type: 'TEST'},
      );

      t.same(
        connectCalls,
        [{nodeId: 'node-b', address: 'ws://node-b:9999'}],
        'scheduled reconnect should eventually redial exactly once',
      );
      t.equal(
        thirdResult.acknowledged,
        true,
        'delivery should succeed after the scheduled reconnect completes',
      );
      t.equal(
        thirdResult.recovered,
        true,
        'delivery should use the recovered connection after reconnect completes',
      );
    });

  t.test('should fall back from observed reconnect address to configured resolver address',
    async (t) => {
      const router = new MessageRouter({
        nodeId: 'node-a',
      });
      await router.initialize({startServer: false});
      t.teardown(async () => {
        await router.shutdown().catch(() => {});
      });

      router.setServiceNodeResolver((address) => {
        const match = address.match(/^([^/]+)\//);
        return match ? match[1] : null;
      });
      router.setNodeAddressResolver((nodeId) => {
        return nodeId === 'node-b' ? 'ws://node-b:9999' : null;
      });

      router.nodeConnections.set('node-b', {
        nodeId: 'node-b',
        nodeAddress: 'ws://node-b:9999',
        connectionId: 'node-b-stale-ip',
        ws: null,
        state: ConnectionState.DISCONNECTED,
        isIncoming: false,
        reconnectAttempts: 0,
        reconnectTimeout: null,
        pingInterval: null,
        address: 'ws://172.19.0.8:9999',
        configuredAddress: 'ws://node-b:9999',
        observedAddress: 'ws://172.19.0.8:9999',
        isSelfConnection: false,
      });

      const connectCalls = [];
      router.connectToNode = async (nodeId, address) => {
        connectCalls.push({nodeId, address});
        if (address === 'ws://172.19.0.8:9999') {
          throw new Error('connect ECONNREFUSED 172.19.0.8:9999');
        }
        router.nodeConnections.set(nodeId, {
          nodeId,
          nodeAddress: address,
          connectionId: 'node-b-fresh-fallback',
          ws: {
            readyState: 1,
            send: () => {},
          },
          state: ConnectionState.CONNECTED,
          isIncoming: false,
          reconnectAttempts: 0,
          reconnectTimeout: null,
          pingInterval: null,
          address,
          configuredAddress: 'ws://node-b:9999',
          observedAddress: null,
          isSelfConnection: false,
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
        'node-b/service/fallback-reconnect',
        {type: 'TEST'},
      );

      t.same(
        connectCalls,
        [
          {nodeId: 'node-b', address: 'ws://172.19.0.8:9999'},
          {nodeId: 'node-b', address: 'ws://node-b:9999'},
        ],
        'delivery recovery should retry the configured resolver address after an observed-address failure',
      );
      t.equal(
        result.acknowledged,
        true,
        'delivery should succeed after reconnecting via the configured address',
      );
      t.equal(
        result.recovered,
        true,
        'delivery should use the recovered connection after fallback',
      );
    });

  t.test('should prefer the preserved observed reconnect address even after the active address regresses to the resolver hostname',
    async (t) => {
      const router = new MessageRouter({
        nodeId: 'node-a',
      });
      await router.initialize({startServer: false});
      t.teardown(async () => {
        await router.shutdown().catch(() => {});
      });

      router.setServiceNodeResolver((address) => {
        const match = address.match(/^([^/]+)\//);
        return match ? match[1] : null;
      });
      router.setNodeAddressResolver((nodeId) => {
        return nodeId === 'node-b' ? 'ws://node-b:9999' : null;
      });

      router.nodeConnections.set('node-b', {
        nodeId: 'node-b',
        nodeAddress: 'ws://node-b:9999',
        connectionId: 'node-b-regressed-address',
        ws: null,
        state: ConnectionState.DISCONNECTED,
        isIncoming: false,
        reconnectAttempts: 0,
        reconnectTimeout: null,
        pingInterval: null,
        address: 'ws://node-b:9999',
        configuredAddress: 'ws://node-b:9999',
        observedAddress: 'ws://172.19.0.8:9999',
        isSelfConnection: false,
      });

      const connectCalls = [];
      router.connectToNode = async (nodeId, address) => {
        connectCalls.push({nodeId, address});
        router.nodeConnections.set(nodeId, {
          nodeId,
          nodeAddress: address,
          connectionId: 'node-b-fresh-observed',
          ws: {
            readyState: 1,
            send: () => {},
          },
          state: ConnectionState.CONNECTED,
          isIncoming: false,
          reconnectAttempts: 0,
          reconnectTimeout: null,
          pingInterval: null,
          address,
          configuredAddress: 'ws://node-b:9999',
          observedAddress: 'ws://172.19.0.8:9999',
          isSelfConnection: false,
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
        'node-b/service/prefer-observed-reconnect',
        {type: 'TEST'},
      );

      t.same(
        connectCalls,
        [{nodeId: 'node-b', address: 'ws://172.19.0.8:9999'}],
        'delivery recovery should use the preserved direct address before retrying the resolver hostname',
      );
      t.equal(
        result.acknowledged,
        true,
        'delivery should succeed after reconnecting via the preserved observed address',
      );
      t.equal(
        result.recovered,
        true,
        'delivery should use the recovered connection after the observed-address reconnect',
      );
    });

  t.test('should suppress a stale reconnect address across deliveries after ENOTFOUND',
    async (t) => {
      const router = new MessageRouter({
        nodeId: 'node-a',
      });
      await router.initialize({startServer: false});
      t.teardown(async () => {
        await router.shutdown().catch(() => {});
      });

      router.setServiceNodeResolver((address) => {
        const match = address.match(/^([^/]+)\//);
        return match ? match[1] : null;
      });
      router.setNodeAddressResolver((nodeId) => {
        return nodeId === 'node-b' ? 'ws://node-b-fresh:9999' : null;
      });

      router.nodeConnections.set('node-b', {
        nodeId: 'node-b',
        nodeAddress: 'ws://node-b-stale:9999',
        connectionId: 'node-b-stale-dns',
        ws: null,
        state: ConnectionState.DISCONNECTED,
        isIncoming: false,
        reconnectAttempts: 0,
        reconnectTimeout: null,
        pingInterval: null,
        address: 'ws://node-b-stale:9999',
        configuredAddress: 'ws://node-b-stale:9999',
        observedAddress: 'ws://node-b-stale:9999',
        isSelfConnection: false,
      });

      const connectCalls = [];
      router.establishConnection = async (connectionInfo) => {
        connectCalls.push(connectionInfo.address);
        if (connectionInfo.address === 'ws://node-b-stale:9999') {
          throw new Error('getaddrinfo ENOTFOUND node-b-stale');
        }
        connectionInfo.ws = {
          readyState: 1,
          send: () => {},
        };
        connectionInfo.state = ConnectionState.CONNECTED;
        connectionInfo.reconnectAttempts = 0;
        router.rememberReconnectAddress(
          connectionInfo,
          null,
          connectionInfo.configuredAddress || connectionInfo.address,
        );
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

      const firstResult = await router.deliver(
        'node-b/service/stale-reconnect-suppression',
        {type: 'TEST'},
      );
      t.equal(
        firstResult.acknowledged,
        true,
        'first delivery should recover through the fresh resolver-owned address',
      );

      const activeConnection = router.nodeConnections.get('node-b');
      activeConnection.state = ConnectionState.DISCONNECTED;
      activeConnection.ws = null;

      const secondResult = await router.deliver(
        'node-b/service/stale-reconnect-suppression',
        {type: 'TEST'},
      );
      t.equal(
        secondResult.acknowledged,
        true,
        'second delivery should also recover',
      );
      t.same(
        connectCalls,
        [
          'ws://node-b-stale:9999',
          'ws://node-b-fresh:9999',
          'ws://node-b-fresh:9999',
        ],
        'after ENOTFOUND, later deliveries should not start from the stale reconnect address again',
      );
    });

  t.test('should replace a stale configured reconnect address with the current authoritative resolver address',
    async (t) => {
      const router = new MessageRouter({
        nodeId: 'node-a',
      });
      await router.initialize({startServer: false});
      t.teardown(async () => {
        await router.shutdown().catch(() => {});
      });

      router.setServiceNodeResolver((address) => {
        const match = address.match(/^([^/]+)\//);
        return match ? match[1] : null;
      });
      router.setNodeAddressResolver((nodeId) => {
        return nodeId === 'node-b' ? 'ws://172.20.0.2:8082' : null;
      });

      router.nodeConnections.set('node-b', {
        nodeId: 'node-b',
        nodeAddress: 'ws://ddb-test-reuse-5-1:8082',
        connectionId: 'node-b-stale-configured-address',
        ws: null,
        state: ConnectionState.DISCONNECTED,
        isIncoming: false,
        reconnectAttempts: 0,
        reconnectTimeout: null,
        pingInterval: null,
        address: 'ws://ddb-test-reuse-5-1:8082',
        configuredAddress: 'ws://ddb-test-reuse-5-1:8082',
        observedAddress: null,
        isSelfConnection: false,
      });

      const connectCalls = [];
      router.connectToNode = async (nodeId, address) => {
        connectCalls.push({nodeId, address});
        router.nodeConnections.set(nodeId, {
          nodeId,
          nodeAddress: address,
          connectionId: 'node-b-authoritative-address',
          ws: {
            readyState: 1,
            send: () => {},
          },
          state: ConnectionState.CONNECTED,
          isIncoming: false,
          reconnectAttempts: 0,
          reconnectTimeout: null,
          pingInterval: null,
          address,
          configuredAddress: address,
          observedAddress: null,
          isSelfConnection: false,
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
        'node-b/service/authoritative-reconnect-address',
        {type: 'TEST'},
      );

      t.same(
        connectCalls,
        [{nodeId: 'node-b', address: 'ws://172.20.0.2:8082'}],
        'delivery recovery should dial the authoritative resolver address instead of the stale configured hostname',
      );
      t.equal(
        result.acknowledged,
        true,
        'delivery should recover through the authoritative address',
      );
    });

  t.test('scheduled reconnect should refresh to the current authoritative resolver address before redialing',
    async (t) => {
      const router = new MessageRouter({nodeId: 'node-a'});
      await router.initialize({startServer: false});
      t.teardown(async () => {
        await router.shutdown().catch(() => {});
      });

      router.reconnectIntervalMs = 5;
      router.reconnectBackoffMultiplier = 1;
      router.reconnectMaxAttempts = 2;
      router.setNodeAddressResolver((nodeId) => {
        return nodeId === 'node-b' ? 'ws://172.20.0.2:8082' : null;
      });

      const connectionInfo = {
        nodeId: 'node-b',
        nodeAddress: 'ws://ddb-test-reuse-5-1:8082',
        connectionId: 'node-b-refresh-scheduled-reconnect',
        ws: null,
        state: ConnectionState.DISCONNECTED,
        isIncoming: false,
        reconnectAttempts: 0,
        reconnectTimeout: null,
        reconnectDueAt: null,
        pingInterval: null,
        address: 'ws://ddb-test-reuse-5-1:8082',
        configuredAddress: 'ws://ddb-test-reuse-5-1:8082',
        observedAddress: null,
        isSelfConnection: false,
        retired: false,
      };
      router.nodeConnections.set('node-b', connectionInfo);

      const dialedAddresses = [];
      router.establishConnection = async (connection) => {
        dialedAddresses.push(connection.address);
        connection.ws = {
          readyState: 1,
          send: () => {},
        };
        connection.state = ConnectionState.CONNECTED;
        connection.reconnectAttempts = 0;
      };

      router.scheduleReconnect(connectionInfo);
      await new Promise((resolve) => setTimeout(resolve, 25));

      t.same(
        dialedAddresses,
        ['ws://172.20.0.2:8082'],
        'scheduled reconnect should redial the authoritative resolver address instead of the stale configured hostname',
      );
      t.equal(
        connectionInfo.configuredAddress,
        'ws://172.20.0.2:8082',
        'scheduled reconnect should refresh the stored configured address to the authoritative value',
      );
    });

  t.test('should normalize bare host:port addresses to ws:// in ' +
    'reconnect candidates (uses normalizeToWebSocketAddress)',
  async (t) => {
    const router = new MessageRouter({
      nodeId: 'node-a',
    });
    await router.initialize({startServer: false});
    t.teardown(async () => {
      await router.shutdown().catch(() => {});
    });

    router.setServiceNodeResolver((address) => {
      const match = address.match(/^([^/]+)\//);
      return match ? match[1] : null;
    });
    router.setNodeAddressResolver(() => null);

    // Simulate a connection whose configuredAddress is a bare REST
    // address (no ws:// prefix) — this happens when the IDENTIFY
    // message carries the node's REST API address.
    router.nodeConnections.set('node-b', {
      nodeId: 'node-b',
      nodeAddress: 'ddb-test-node-5:8080',
      connectionId: 'node-b-bare-addr',
      ws: null,
      state: ConnectionState.DISCONNECTED,
      isIncoming: false,
      reconnectAttempts: 0,
      reconnectTimeout: null,
      pingInterval: null,
      address: 'ddb-test-node-5:8080',
      configuredAddress: 'ddb-test-node-5:8080',
      observedAddress: null,
      isSelfConnection: false,
    });

    const connectCalls = [];
    router.connectToNode = async (nodeId, address) => {
      connectCalls.push({nodeId, address});
      router.nodeConnections.set(nodeId, {
        nodeId,
        nodeAddress: address,
        connectionId: 'node-b-recovered',
        ws: {readyState: 1, send: () => {}},
        state: ConnectionState.CONNECTED,
        isIncoming: false,
        reconnectAttempts: 0,
        reconnectTimeout: null,
        pingInterval: null,
        address,
        configuredAddress: address,
        observedAddress: null,
        isSelfConnection: false,
      });
    };
    router.sendMessage = async (
      _connection, _targetAddress, messageId,
      _payload, targetNodeId, correlationId,
    ) => ({
      messageId, correlationId,
      acknowledged: true, targetNodeId,
      recovered: true,
    });

    const result = await router.deliver(
      'node-b/service/bare-address-test',
      {type: 'TEST'},
    );

    t.equal(result.acknowledged, true,
      'delivery should succeed after normalizing the bare address');
    t.equal(connectCalls.length, 1,
      'should attempt exactly one reconnect');
    t.equal(connectCalls[0].address, 'ws://ddb-test-node-5:8082',
      'bare host:port should be normalized to ws:// with WS port offset');
  });
});
