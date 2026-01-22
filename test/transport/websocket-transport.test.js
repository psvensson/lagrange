/**
 * Unit tests for WebSocketTransport.
 * Tests inter-node communication using WebSocket.
 */

import {test} from 'tap';
import {
  WebSocketTransport,
  ConnectionState,
  WSMessageType,
} from '../../src/transport/websocket-transport.js';
import {ConfigurationManager} from '../../src/config/configuration-manager.js';
import {LoggingService} from '../../src/logging/logging-service.js';

// Initialize configuration and logging for tests (module level)
ConfigurationManager.resetInstance();
LoggingService.resetInstance();
const config = ConfigurationManager.getInstance();
config.initialize({node: {id: 'test-node'}});
const logger = LoggingService.getInstance();
logger.initialize({level: 'error'});

test('WebSocketTransport', async (t) => {
  t.test('constructor creates transport with default options', async (t) => {
    const transport = new WebSocketTransport();

    t.ok(transport.transportId, 'should have transport ID');
    t.ok(transport.localNodeId, 'should have local node ID');
    t.ok(transport.localAddress, 'should have local address');
    t.equal(transport.initialized, false, 'should not be initialized');
  });

  t.test('constructor accepts custom options', async (t) => {
    const transport = new WebSocketTransport({
      localNodeId: 'node-1',
      localAddress: 'ws://localhost:8080',
    });

    t.equal(transport.localNodeId, 'node-1', 'should use custom node ID');
    t.equal(transport.localAddress, 'ws://localhost:8080', 'should use custom address');
  });

  t.test('initialize sets initialized flag', async (t) => {
    const transport = new WebSocketTransport();

    await transport.initialize();

    t.equal(transport.initialized, true, 'should be initialized');

    await transport.shutdown();
  });

  t.test('initialize is idempotent', async (t) => {
    const transport = new WebSocketTransport();

    await transport.initialize();
    await transport.initialize();

    t.equal(transport.initialized, true, 'should remain initialized');

    await transport.shutdown();
  });

  t.test('register adds message handler', async (t) => {
    const transport = new WebSocketTransport();
    const handler = () => ({acknowledged: true});

    transport.register('service-1', handler);

    t.ok(transport.messageHandlers.has('service-1'), 'should have handler');

    await transport.shutdown();
  });

  t.test('register throws for non-function handler', async (t) => {
    const transport = new WebSocketTransport();

    t.throws(() => {
      transport.register('service-1', 'not-a-function');
    }, /Handler must be a function/, 'should throw for invalid handler');
  });

  t.test('unregister removes message handler', async (t) => {
    const transport = new WebSocketTransport();
    const handler = () => ({acknowledged: true});

    transport.register('service-1', handler);
    transport.unregister('service-1');

    t.notOk(transport.messageHandlers.has('service-1'), 'should not have handler');
  });

  t.test('getConnectionState returns null for unknown node', async (t) => {
    const transport = new WebSocketTransport();

    const state = transport.getConnectionState('unknown-node');

    t.equal(state, null, 'should return null');
  });

  t.test('getConnectedNodes returns empty array initially', async (t) => {
    const transport = new WebSocketTransport();

    const nodes = transport.getConnectedNodes();

    t.same(nodes, [], 'should return empty array');
  });

  t.test('getStats returns transport statistics', async (t) => {
    const transport = new WebSocketTransport({
      localNodeId: 'test-node',
      localAddress: 'test-address',
    });

    const stats = transport.getStats();

    t.ok(stats.transportId, 'should have transport ID');
    t.equal(stats.localNodeId, 'test-node', 'should have local node ID');
    t.equal(stats.localAddress, 'test-address', 'should have local address');
    t.equal(stats.initialized, false, 'should not be initialized');
    t.equal(stats.messageCount, 0, 'should have zero messages');
    t.equal(stats.connectedNodes, 0, 'should have zero connected nodes');
  });

  t.test('deliver returns error when no connection', async (t) => {
    const transport = new WebSocketTransport();
    await transport.initialize();

    const result = await transport.deliver('target-service', {
      type: 'test',
      data: 'hello',
    });

    t.notOk(result.acknowledged, 'should not be acknowledged');
    t.ok(result.error, 'should have error');

    await transport.shutdown();
  });

  t.test('shutdown clears all state', async (t) => {
    const transport = new WebSocketTransport();
    transport.register('service', () => ({}));
    await transport.initialize();

    await transport.shutdown();

    t.equal(transport.initialized, false, 'should not be initialized');
    t.equal(transport.messageHandlers.size, 0, 'should have no handlers');
    t.equal(transport.connections.size, 0, 'should have no connections');
  });

  t.test('emits initialized event', async (t) => {
    const transport = new WebSocketTransport();
    let eventData = null;

    transport.on('initialized', (data) => {
      eventData = data;
    });

    await transport.initialize();

    t.ok(eventData, 'should emit event');
    t.ok(eventData.transportId, 'should have transport ID');
    t.ok(eventData.localNodeId, 'should have local node ID');

    await transport.shutdown();
  });

  t.test('emits shutdown event', async (t) => {
    const transport = new WebSocketTransport();
    let eventData = null;

    transport.on('shutdown', (data) => {
      eventData = data;
    });

    await transport.shutdown();

    t.ok(eventData, 'should emit event');
    t.ok(eventData.transportId, 'should have transport ID');
  });

  t.test('ConnectionState enum has expected values', async (t) => {
    t.equal(ConnectionState.DISCONNECTED, 'disconnected');
    t.equal(ConnectionState.CONNECTING, 'connecting');
    t.equal(ConnectionState.CONNECTED, 'connected');
    t.equal(ConnectionState.RECONNECTING, 'reconnecting');
    t.equal(ConnectionState.CLOSED, 'closed');
  });

  t.test('WSMessageType enum has expected values', async (t) => {
    t.equal(WSMessageType.RAFT_MESSAGE, 'raft_message');
    t.equal(WSMessageType.SERVICE_MESSAGE, 'service_message');
    t.equal(WSMessageType.PING, 'ping');
    t.equal(WSMessageType.PONG, 'pong');
    t.equal(WSMessageType.ACK, 'ack');
  });

  t.test('server and client communication', async (t) => {
    // Create server transport
    const serverTransport = new WebSocketTransport({
      localNodeId: 'server-node',
      localAddress: 'ws://localhost:9876',
    });

    let receivedMessage = null;
    serverTransport.register('test-service', (msg) => {
      receivedMessage = msg;
      return {acknowledged: true, data: 'response'};
    });

    // Start server
    await serverTransport.startServer(9876);
    await serverTransport.initialize();

    // Create client transport
    const clientTransport = new WebSocketTransport({
      localNodeId: 'client-node',
      localAddress: 'ws://localhost:9877',
    });

    // Connect to server
    await clientTransport.initialize({
      peerNodes: [{
        nodeId: 'server-node',
        address: 'ws://localhost:9876',
      }],
    });

    // Wait for connection
    await new Promise((resolve) => setTimeout(resolve, 100));

    // Send message
    const result = await clientTransport.deliver('test-service', {
      type: 'test',
      data: 'hello',
    }, {targetNodeId: 'server-node'});

    t.ok(result.acknowledged, 'should be acknowledged');
    t.ok(receivedMessage, 'server should receive message');
    t.equal(receivedMessage.payload.data, 'hello', 'should have correct data');

    // Cleanup
    await clientTransport.shutdown();
    await serverTransport.shutdown();
  });

  t.test('async handler returns resolved value in ACK', async (t) => {
    // This test ensures async handlers are properly awaited before sending ACK
    // Previously, async handlers would return Promise objects instead of resolved values
    const serverTransport = new WebSocketTransport({
      localNodeId: 'server-async',
      localAddress: 'ws://localhost:9878',
    });

    // Register an ASYNC handler that returns a promise
    serverTransport.register('async-service', async (msg) => {
      // Simulate async work (like handleCreateReplica does)
      await new Promise((resolve) => setTimeout(resolve, 10));
      return {
        acknowledged: true,
        request_id: msg.payload.request_id,
        status: 'initiated',
        replica_id: 'test-replica',
      };
    });

    await serverTransport.startServer(9878);
    await serverTransport.initialize();

    const clientTransport = new WebSocketTransport({
      localNodeId: 'client-async',
      localAddress: 'ws://localhost:9879',
    });

    await clientTransport.initialize({
      peerNodes: [{
        nodeId: 'server-async',
        address: 'ws://localhost:9878',
      }],
    });

    await new Promise((resolve) => setTimeout(resolve, 100));

    const result = await clientTransport.deliver('async-service', {
      type: 'CREATE_REPLICA',
      request_id: 'test-request-123',
    }, {targetNodeId: 'server-async'});

    // ACK structure is flat - handler result fields are spread directly into result
    t.ok(result.acknowledged, 'should be acknowledged');
    t.equal(result.request_id, 'test-request-123', 'should have request_id');
    t.equal(result.status, 'initiated', 'should have status');
    t.equal(result.replica_id, 'test-replica', 'should have replica_id');

    // Verify result is not a Promise object
    t.notOk(result instanceof Promise, 'result should not be a Promise');
    t.notOk(result.then, 'result should not have .then method');

    await clientTransport.shutdown();
    await serverTransport.shutdown();
  });
});
