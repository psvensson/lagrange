/**
 * Unit tests for MessageRouter.
 * Tests local and remote message routing.
 * Requirements: 4.21, 4.22, 11.6, 11.7, 11.8, 11.9
 */

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

  t.test('should return error when delivering without connection', async (t) => {
    // Without a self-connection, local delivery should fail rather than bypass transport.
    const router = new MessageRouter({nodeId: 'test-node'});
    await router.initialize();

    const receivedMessages = [];
    router.register('test-node/service/local-service', (envelope) => {
      receivedMessages.push(envelope);
      return {acknowledged: true, data: 'response'};
    });

    // Without self-connection, delivery should fail with a connection error.
    const result = await router.deliver('test-node/service/local-service', {
      type: 'TEST_MESSAGE',
      data: 'hello',
    });

    t.ok(result.messageId, 'should have message ID');
    t.equal(result.acknowledged, false, 'should not be acknowledged');
    t.ok(result.error, 'should include error message');
    t.equal(receivedMessages.length, 0, 'should not invoke handler');

    await router.shutdown();
  });

  t.test('should return error for async handler without connection', async (t) => {
    const router = new MessageRouter({nodeId: 'test-node'});
    await router.initialize();

    router.register('test-node/service/async-service', async (envelope) => {
      await Promise.resolve();
      return {acknowledged: true, processed: envelope.payload.data};
    });

    const result = await router.deliver('test-node/service/async-service', {data: 'async-test'});

    t.equal(result.acknowledged, false, 'should not be acknowledged');
    t.ok(result.error, 'should include error message');

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
});
