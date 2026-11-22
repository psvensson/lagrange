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
import {TEST_BOOT_INCARNATION} from '../test-helpers/boot-incarnation-fixture.js';
import {
  TRANSPORT_DELIVERY_OUTCOME_REASON_CODE,
  buildDeliveryEnvelope,
  deliveryTransportOf,
  isDeliveredTransportDeliveryOutcome,
} from '../../src/transport/transport-semantic-outcome.js';
import {acknowledgeThenRespond} from '../test-helpers/message-router-remote-answer.js';
import {
  RAFT_RS_MESSAGE_TYPE,
  RAFT_RS_TRANSPORT_PROTOCOL,
} from '../../src/raft/raft-rs-ingress-constants.js';

// The one active consensus wire shape: a semantic raft-rs envelope addressed
// to a message-group replica.
function buildMessageGroupRaftRsEnvelope() {
  return {
    protocol: RAFT_RS_TRANSPORT_PROTOCOL,
    groupId: 'mg-1',
    from: 'mg-1-r2',
    to: 'mg-1-r1',
    message: {msgType: RAFT_RS_MESSAGE_TYPE.APPEND, entries: []},
  };
}
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
    const router = new MessageRouter({bootIncarnation: TEST_BOOT_INCARNATION});

    t.ok(router.routerId, 'should have router ID');
    t.ok(router.nodeId, 'should have node ID');
    t.equal(router.initialized, false, 'should not be initialized');
    t.equal(router.handlers.size, 0, 'should have no handlers');
    t.equal(router.nodeConnections.size, 0, 'should have no connections');

    await router.shutdown();
  });

  t.test('should create router with custom options', async (t) => {
    const router = new MessageRouter({
      bootIncarnation: TEST_BOOT_INCARNATION,
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
    const router = new MessageRouter({bootIncarnation: TEST_BOOT_INCARNATION, nodeId: 'test-node'});

    await router.initialize({startServer: false});

    t.equal(router.initialized, true, 'should be initialized');
    t.equal(router.server, null, 'should not have server');

    await router.shutdown();
  });

  t.test('should register and unregister local handlers', async (t) => {
    const router = new MessageRouter({bootIncarnation: TEST_BOOT_INCARNATION, nodeId: 'test-node'});
    await router.initialize();

    const handler = () => (null);

    router.register('test-node/service/service-1', handler);
    t.equal(router.handlers.size, 1, 'should have one handler');
    t.ok(router.isRegistered('test-node/service/service-1'), 'should be registered');

    router.register('test-node/service/service-2', handler);
    t.equal(router.handlers.size, 2, 'should have two handlers');

    t.equal(router.unregisterExact('test-node/service/service-1', handler), true,
      'the exact handler is removed');
    t.equal(router.handlers.size, 1, 'should have one handler after unregister');
    t.notOk(router.isRegistered('test-node/service/service-1'), 'should not be registered');

    await router.shutdown();
  });

  t.test('should throw when registering non-function handler', async (t) => {
    const router = new MessageRouter({bootIncarnation: TEST_BOOT_INCARNATION, nodeId: 'test-node'});
    await router.initialize();

    t.throws(
      () => router.register('test-node/service/service-1', 'not-a-function'),
      /Handler must be a function/,
      'should throw for non-function handler',
    );

    await router.shutdown();
  });

  t.test('should throw when registering with invalid address format', async (t) => {
    const router = new MessageRouter({bootIncarnation: TEST_BOOT_INCARNATION, nodeId: 'test-node'});
    await router.initialize();

    const handler = () => (null);

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
    const router = new MessageRouter({bootIncarnation: TEST_BOOT_INCARNATION, nodeId: 'test-node'});
    await router.initialize();

    const handler = () => (null);

    t.throws(
      () => router.register('legacy-address', handler),
      /Invalid address format/,
      'should reject non-unified address formats',
    );

    await router.shutdown();
  });

  t.test('should deliver locally without connection via deliverLocal', async (t) => {
    // Local delivery bypasses WebSocket — no self-connection needed.
    const router = new MessageRouter({bootIncarnation: TEST_BOOT_INCARNATION, nodeId: 'test-node'});
    await router.initialize();

    const receivedMessages = [];
    router.register('test-node/service/local-service', (envelope) => {
      receivedMessages.push(envelope);
      return {data: 'response'};
    });

    const result = await router.deliver('test-node/service/local-service', {
      type: 'TEST_MESSAGE',
      data: 'hello',
    });

    t.ok(result.transport.messageId, 'should have message ID');
    t.equal(isDeliveredTransportDeliveryOutcome(deliveryTransportOf(result)), true, 'should be acknowledged');
    t.equal(result.answer.data, 'response', 'should include handler data');
    t.equal(receivedMessages.length, 1, 'should invoke handler');

    await router.shutdown();
  });

  t.test('should route QUERY messages via message-group transport', async (t) => {
    const router = new MessageRouter({bootIncarnation: TEST_BOOT_INCARNATION, nodeId: 'test-node'});
    await router.initialize();

    let localHandlerCalls = 0;
    router.register('test-node/partition/p1', () => {
      localHandlerCalls++;
      return {success: true, rows: [{id: 'local'}]};
    });

    let queryTransportCalls = 0;
    router.setQueryMessageGroupServiceResolver(() => ({
      sendMessage: async (targetAddress, message) => {
        queryTransportCalls++;
        // The message group's record carries the inner delivery envelope.
        return {delivery: buildDeliveryEnvelope({acknowledged: true}, {
          success: true,
          routedVia: 'message-group',
          targetAddress,
          sql: message.sql,
          rows: [{id: 'mg'}],
        })};
      },
    }));

    const result = await router.deliver('test-node/partition/p1', {
      type: 'QUERY',
      sql: 'SELECT 1',
      params: [],
    });

    t.equal(queryTransportCalls, 1, 'should use message-group transport once');
    t.equal(localHandlerCalls, 0, 'should not use direct local handler path');
    t.equal(isDeliveredTransportDeliveryOutcome(deliveryTransportOf(result)), true, 'should acknowledge query delivery');
    t.equal(result.answer.routedVia, 'message-group', 'should report message-group routing');

    await router.shutdown();
  });

  t.test('should defer QUERY messages when resolver returns no transport',
    async (t) => {
      const router = new MessageRouter({
        bootIncarnation: TEST_BOOT_INCARNATION,
        nodeId: 'test-node'});
      await router.initialize();

      router.setQueryMessageGroupServiceResolver(() => null);

      const result = await router.deliver('test-node/partition/p1', {
        type: 'QUERY',
        sql: 'SELECT 1',
        params: [],
      });

      t.equal(isDeliveredTransportDeliveryOutcome(deliveryTransportOf(result)), false,
        'should fail closed when query transport is unavailable');
      t.equal(result.transport.deferRetry, true,
        'should return typed defer semantics instead of falling back');
      t.equal(result.transport.errorCode, 'ROUTER_QUERY_TRANSPORT_NOT_READY',
        'should surface a stable transport-not-ready error code');
      t.ok(result.transport.retryAfterMs > 0,
        'should expose a retry hint for the canonical query transport path');

      await router.shutdown();
    });

  t.test('should fail QUERY messages when message-group transport is missing', async (t) => {
    const router = new MessageRouter({bootIncarnation: TEST_BOOT_INCARNATION, nodeId: 'test-node'});
    await router.initialize();

    const result = await router.deliver('test-node/partition/p1', {
      type: 'QUERY',
      sql: 'SELECT 1',
      params: [],
    });

    t.equal(isDeliveredTransportDeliveryOutcome(deliveryTransportOf(result)), false,
      'should fail closed when query transport resolver is missing');
    t.equal(result.transport.deferRetry, true,
      'missing query transport should surface typed defer semantics');
    t.equal(result.transport.errorCode, 'ROUTER_QUERY_TRANSPORT_NOT_READY',
      'missing resolver should expose a stable error code');
    t.match(
      result.transport.error,
      /message-group transport is not configured/i,
      'missing resolver should preserve the canonical reason',
    );

    await router.shutdown();
  });

  t.test('should preserve typed query transport retry hints from resolver selections',
    async (t) => {
      const router = new MessageRouter({
        bootIncarnation: TEST_BOOT_INCARNATION,
        nodeId: 'test-node'});
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

      t.equal(isDeliveredTransportDeliveryOutcome(deliveryTransportOf(result)), false,
        'should fail closed while query transport owner is unavailable');
      t.equal(result.transport.deferRetry, true,
        'typed selection misses should preserve defer semantics');
      t.equal(result.transport.retryAfterMs, 321,
        'typed selection misses should preserve retryAfterMs');
      t.equal(result.transport.error, 'query ingress owner not ready',
        'typed selection misses should preserve the owner reason');

      await router.shutdown();
    });

  t.test('should expose canonical query transport readiness from resolver selections',
    async (t) => {
      const router = new MessageRouter({
        bootIncarnation: TEST_BOOT_INCARNATION,
        nodeId: 'test-node'});
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
      const router = new MessageRouter({
        bootIncarnation: TEST_BOOT_INCARNATION,
        nodeId: 'test-node'});
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

      t.equal(isDeliveredTransportDeliveryOutcome(deliveryTransportOf(result)), false,
        'query transport connection closure should fail closed');
      t.equal(result.transport.deferRetry, true,
        'query transport connection closure should defer while reconnect is armed');
      t.equal(result.transport.errorCode, 'ROUTER_CONNECTION_CLOSED',
        'query transport closure should normalize to the canonical router error code');
      t.ok(result.transport.retryAfterMs > 0,
        'query transport closure should preserve a bounded retry hint');

      await router.shutdown();
    });

  t.test('should preserve explicit deferred retry metadata from query transport failures',
    async (t) => {
      const router = new MessageRouter({
        bootIncarnation: TEST_BOOT_INCARNATION,
        nodeId: 'test-node'});
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

      t.equal(isDeliveredTransportDeliveryOutcome(deliveryTransportOf(result)), false,
        'explicit query transport deferrals should fail closed');
      t.equal(result.transport.deferRetry, true,
        'explicit query transport deferrals should preserve defer semantics');
      t.equal(result.transport.errorCode, 'QUERY_INGRESS_BACKPRESSURE',
        'explicit query transport deferrals should preserve the error code');
      t.equal(result.transport.retryAfterMs, 222,
        'explicit query transport deferrals should preserve retryAfterMs');
      t.equal(result.transport.error, 'query ingress backpressure',
        'explicit query transport deferrals should preserve the error message');

      await router.shutdown();
    });

  t.test('should expose reconnect-before-delivery pressure in the outbound summary',
    async (t) => {
      const router = new MessageRouter({
        bootIncarnation: TEST_BOOT_INCARNATION,
        nodeId: 'test-node'});
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
      const router = new MessageRouter({
        bootIncarnation: TEST_BOOT_INCARNATION,
        nodeId: 'test-node'});
      await router.initialize();

      let capturedOptions = null;
      let remainingMs = null;
      router.setQueryMessageGroupServiceResolver(() => ({
        async sendMessage(_targetService, _message, options = {}) {
          capturedOptions = options.transportDeliveryOptions;
          remainingMs = capturedOptions.deliveryLifetime.remainingMs();
          return {delivery: buildDeliveryEnvelope({acknowledged: true},
            {success: true, rows: []})};
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

      t.equal(isDeliveredTransportDeliveryOutcome(deliveryTransportOf(result)), true,
        'query transport send should still succeed');
      t.ok(remainingMs > 0 && remainingMs <= 1234,
        'query transport sends observe the remaining grant from router delivery');
      t.equal(capturedOptions.signal, capturedOptions.deliveryLifetime.signal,
        'the transport receives the original grant and its abort signal together');
      t.notOk(Object.hasOwn(capturedOptions, 'timeoutMs'), 'no replacement duration is supplied');
      t.equal(capturedOptions?.deliveryPriority,
        'critical',
        'query transport sends should inherit delivery priority from router ' +
          'delivery');
      t.equal(
        capturedOptions?.deliverySource,
        QUERY_TRANSPORT_DELIVERY_SOURCE,
        'query transport sends should preserve explicit delivery-source ownership',
      );

      await router.shutdown();
    });

  t.test('should deliver locally for async handler without connection', async (t) => {
    const router = new MessageRouter({bootIncarnation: TEST_BOOT_INCARNATION, nodeId: 'test-node'});
    await router.initialize();

    router.register('test-node/service/async-service', async (envelope) => {
      await Promise.resolve();
      return {processed: envelope.payload.data};
    });

    const result = await router.deliver(
      'test-node/service/async-service', {data: 'async-test'},
    );

    t.equal(isDeliveredTransportDeliveryOutcome(deliveryTransportOf(result)), true, 'should be acknowledged');
    t.equal(result.answer.processed, 'async-test', 'should include handler result');

    await router.shutdown();
  });

  t.test('should return error for handler error without connection', async (t) => {
    // In the unified transport architecture, all messages go through WebSocket
    const router = new MessageRouter({bootIncarnation: TEST_BOOT_INCARNATION, nodeId: 'test-node'});
    await router.initialize();

    router.register('test-node/service/error-service', () => {
      throw new Error('Handler error');
    });

    // Without self-connection, delivery should fail (connection error, not handler error)
    const result = await router.deliver('test-node/service/error-service', {data: 'test'});

    t.equal(isDeliveredTransportDeliveryOutcome(deliveryTransportOf(result)), false, 'should not be acknowledged');
    t.ok(result.transport.error, 'should have error message');

    await router.shutdown();
  });

  t.test('should return error for unknown service without connection', async (t) => {
    const router = new MessageRouter({bootIncarnation: TEST_BOOT_INCARNATION, nodeId: 'test-node'});
    await router.initialize();

    const result = await router.deliver('test-node/service/unknown-service', {data: 'test'});

    t.equal(isDeliveredTransportDeliveryOutcome(deliveryTransportOf(result)), false, 'should not be acknowledged');
    t.ok(result.transport.error, 'should include error message');

    await router.shutdown();
  });

  t.test('should set service node resolver', async (t) => {
    const router = new MessageRouter({bootIncarnation: TEST_BOOT_INCARNATION, nodeId: 'test-node'});
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
      const router = new MessageRouter({
        bootIncarnation: TEST_BOOT_INCARNATION,
        nodeId: 'test-node'});
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
        return acknowledgeThenRespond(router, {messageId, correlationId,
          result: {targetNodeId, recovered: true}});
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
      t.equal(isDeliveredTransportDeliveryOutcome(deliveryTransportOf(result)), true, 'should deliver after recovering the node connection');
      t.equal(result.answer.recovered, true, 'should preserve the delivery result from the retry');

      await router.shutdown();
    });

  t.test('should surface defer-retry hints when delivery recovery cannot reconnect a target',
    async (t) => {
      const router = new MessageRouter({
        bootIncarnation: TEST_BOOT_INCARNATION,
        nodeId: 'test-node'});
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

      t.equal(isDeliveredTransportDeliveryOutcome(deliveryTransportOf(result)), false,
        'delivery should fail when reconnect recovery cannot restore the peer');
      t.equal(result.transport.deferRetry, true,
        'failed recovery should ask upstream owners to defer immediate retries');
      t.ok(result.transport.retryAfterMs > 0 &&
        result.transport.retryAfterMs <= router.reconnectIntervalMs,
      'failed recovery should expose the active reconnect cooldown');
      t.equal(result.transport.errorCode, 'ROUTER_CONNECTION_CLOSED',
        'failed recovery should surface the reconnect-in-progress error code');
      t.equal(
        router.nodeConnections.get('remote-node')?.state,
        ConnectionState.RECONNECTING,
        'failed cold recovery should arm one reconnect owner for the peer',
      );
    });

  t.test('failed cold dials should not stampede repeated reconnect attempts',
    async (t) => {
      const router = new MessageRouter({
        bootIncarnation: TEST_BOOT_INCARNATION,
        nodeId: 'test-node'});
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
      t.equal(firstResult.transport.deferRetry, true,
        'first failed cold dial should ask callers to defer');
      t.equal(secondResult.transport.deferRetry, true,
        'second delivery should also defer while reconnect remains scheduled');
      t.equal(secondResult.transport.errorCode, 'ROUTER_CONNECTION_CLOSED',
        'second delivery should reuse the reconnect-in-progress failure');
    });

  t.test('should defer to an armed reconnect instead of starting a second recovery dial',
    async (t) => {
      const router = new MessageRouter({
        bootIncarnation: TEST_BOOT_INCARNATION,
        nodeId: 'test-node'});
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
      t.equal(isDeliveredTransportDeliveryOutcome(deliveryTransportOf(result)), false,
        'delivery should fail closed while reconnect remains in progress');
      t.equal(result.transport.deferRetry, true,
        'delivery should return a deferred retry hint');
      t.equal(result.transport.errorCode, 'ROUTER_CONNECTION_CLOSED',
        'delivery should surface a stable closed-connection error code');
      t.ok(result.transport.retryAfterMs > 0 && result.transport.retryAfterMs <= 250,
        'delivery should expose the remaining reconnect delay');
    });

  t.test('should fail fast when one remote outbound queue is already saturated',
    async (t) => {
      const router = new MessageRouter({
        bootIncarnation: TEST_BOOT_INCARNATION,
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
      t.equal(isDeliveredTransportDeliveryOutcome(deliveryTransportOf(thirdOutcome)), false,
        'saturated delivery should return a failed-delivery envelope');
      t.match(thirdOutcome.transport.error, /queue/i,
        'saturated delivery should expose queue backpressure');
      t.equal(thirdOutcome.transport.deferRetry, true,
        'saturated delivery should ask upstream owners to defer retries');
      t.equal(thirdOutcome.transport.retryAfterMs, router.reconnectIntervalMs,
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

  t.test('should write a raft-rs envelope as one consensus frame, answered by nothing',
    async (t) => {
      const router = new MessageRouter({
        bootIncarnation: TEST_BOOT_INCARNATION,
        nodeId: 'test-node'});
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
          ...buildMessageGroupRaftRsEnvelope(),
          messageId: 'msg-raft-direct',
        },
      );

      t.equal(isDeliveredTransportDeliveryOutcome(deliveryTransportOf(result)), true,
        'a written consensus envelope is delivered at once');
      t.equal(result.answer, null,
        'the consensus class carries no answer');
      t.equal(enqueueOutboundCalled, false,
        'the consensus class never enters the outbound queue');
      t.equal(pendingResponseRegistered, false,
        'the consensus class registers no service response waiter');
      t.equal(router.pendingMessages.size, 0,
        'the consensus class awaits no transport ACK');
      t.equal(router.pendingResponses.size, 0,
        'the consensus class awaits no service response');
      t.equal(sentMessages.length, 1, 'one frame is written');
      t.equal(sentMessages[0].type, RouterMessageType.CONSENSUS_ENVELOPE,
        'the sender declares the consensus delivery class on the frame');
      t.same(sentMessages[0].envelopes, [{
        targetAddress: 'remote-node/message-group/mg-1-r1',
        payload: {
          ...buildMessageGroupRaftRsEnvelope(),
          messageId: 'msg-raft-direct',
        },
      }],
      'the raft-rs envelope travels unchanged');

      await router.shutdown();
    });

  t.test('should fail a raft-rs envelope at once when no live socket exists',
    async (t) => {
      const router = new MessageRouter({
        bootIncarnation: TEST_BOOT_INCARNATION,
        nodeId: 'test-node'});
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
          ...buildMessageGroupRaftRsEnvelope(),
          messageId: 'msg-raft-fallback',
        },
      );

      t.equal(enqueueOutboundCalled, false,
        'no queued fallback exists for the consensus class');
      t.equal(pendingResponseRegistered, false,
        'no response waiter is registered for the consensus class');
      t.equal(isDeliveredTransportDeliveryOutcome(deliveryTransportOf(result)), false,
        'an envelope with no live socket is not delivered');
      t.equal(deliveryTransportOf(result).reasonCode,
        TRANSPORT_DELIVERY_OUTCOME_REASON_CODE.NO_CONNECTION,
        'the router names why: no connection to the peer');
      t.equal(router.pendingNodeConnections.size, 0,
        'the envelope started no reconnect');

      await router.shutdown();
    });
});
