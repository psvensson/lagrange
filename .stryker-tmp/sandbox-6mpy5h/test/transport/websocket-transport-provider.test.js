/**
 * Unit tests for WebSocketTransportProvider.
 * Tests the WebSocket implementation of the TransportProvider interface.
 *
 * Requirements: 7.1, 7.2, 7.4, 7.5
 */
// @ts-nocheck


import {test} from '../../src/test-helpers/tap.js';
import {
  WebSocketTransportProvider,
  WS_PROVIDER_SUBSYSTEM,
  WS_PROVIDER_LOG_MSG,
  WS_PROVIDER_ERROR_MSG,
} from '../../src/transport/websocket-transport-provider.js';
import {TRANSPORT_TYPE} from '../../src/constants/transport-types.js';
import {CONNECTION_STATE, TRANSPORT_EVENT} from '../../src/constants/transport.js';
import {ConfigurationManager} from '../../src/config/configuration-manager.js';
import {LoggingService} from '../../src/logging/logging-service.js';
import {WebSocketServer} from 'ws';

// Initialize configuration and logging for tests (module level)
ConfigurationManager.resetInstance();
LoggingService.resetInstance();
const config = ConfigurationManager.getInstance();
config.initialize({node: {id: 'test-node'}});
const logger = LoggingService.getInstance();
logger.initialize({level: 'error'});

test('WebSocketTransportProvider', async (t) => {
  t.test('constructor creates provider with default options', async (t) => {
    const provider = new WebSocketTransportProvider();

    t.ok(provider.localNodeId, 'should have local node ID');
    t.equal(provider.isAvailable(), true, 'should be available');
    t.equal(provider.getConnectionCount(), 0, 'should have no connections');

    await provider.shutdown();
  });

  t.test('constructor accepts custom options', async (t) => {
    const provider = new WebSocketTransportProvider({
      localNodeId: 'custom-node-id',
      localAddress: 'custom-address',
    });

    t.equal(provider.localNodeId, 'custom-node-id', 'should use custom node ID');
    t.equal(provider.localAddress, 'custom-address', 'should use custom address');

    await provider.shutdown();
  });

  t.test('getType returns WEBSOCKET transport type', async (t) => {
    const provider = new WebSocketTransportProvider();

    t.equal(provider.getType(), TRANSPORT_TYPE.WEBSOCKET, 'should return ws');
    t.equal(provider.getType(), 'ws', 'should return ws string');

    await provider.shutdown();
  });

  t.test('isAvailable returns true when not shutting down', async (t) => {
    const provider = new WebSocketTransportProvider();

    t.equal(provider.isAvailable(), true, 'should be available');

    await provider.shutdown();
  });

  t.test('isAvailable returns false after shutdown', async (t) => {
    const provider = new WebSocketTransportProvider();

    await provider.shutdown();

    t.equal(provider.isAvailable(), false, 'should not be available after shutdown');
  });

  t.test('implements TransportProvider interface methods', async (t) => {
    const provider = new WebSocketTransportProvider();

    t.equal(typeof provider.getType, 'function', 'should have getType method');
    t.equal(typeof provider.isAvailable, 'function', 'should have isAvailable method');
    t.equal(typeof provider.connect, 'function', 'should have connect method');
    t.equal(typeof provider.send, 'function', 'should have send method');
    t.equal(typeof provider.disconnect, 'function', 'should have disconnect method');
    t.equal(typeof provider.getHealthStatus, 'function', 'should have getHealthStatus method');
    t.equal(typeof provider.shutdown, 'function', 'should have shutdown method');

    await provider.shutdown();
  });

  t.test('getHealthStatus returns closed state for unknown connection', async (t) => {
    const provider = new WebSocketTransportProvider();

    const status = provider.getHealthStatus({connectionId: 'unknown'});

    t.equal(status.state, CONNECTION_STATE.CLOSED, 'should return closed state');
    t.equal(status.healthy, false, 'should not be healthy');
    t.equal(status.latency, null, 'should have null latency');

    await provider.shutdown();
  });

  t.test('disconnect handles unknown connection gracefully', async (t) => {
    const provider = new WebSocketTransportProvider();

    // Should not throw
    await provider.disconnect({connectionId: 'unknown'});

    t.pass('should handle unknown connection');

    await provider.shutdown();
  });

  t.test('shutdown clears all state', async (t) => {
    const provider = new WebSocketTransportProvider();

    await provider.shutdown();

    t.equal(provider.isAvailable(), false, 'should not be available');
    t.equal(provider.getConnectionCount(), 0, 'should have no connections');
  });

  t.test('emits shutdown event', async (t) => {
    const provider = new WebSocketTransportProvider();
    let eventData = null;

    provider.getEventEmitter().on(TRANSPORT_EVENT.SHUTDOWN, (data) => {
      eventData = data;
    });

    await provider.shutdown();

    t.ok(eventData, 'should emit shutdown event');
    t.equal(eventData.transportType, TRANSPORT_TYPE.WEBSOCKET, 'should have transport type');
  });

  t.test('setLocalNodeId updates node ID', async (t) => {
    const provider = new WebSocketTransportProvider();

    provider.setLocalNodeId('new-node-id');

    t.equal(provider.localNodeId, 'new-node-id', 'should update node ID');

    await provider.shutdown();
  });

  t.test('setLocalAddress updates address', async (t) => {
    const provider = new WebSocketTransportProvider();

    provider.setLocalAddress('new-address');

    t.equal(provider.localAddress, 'new-address', 'should update address');

    await provider.shutdown();
  });

  t.test('exported constants are defined', async (t) => {
    t.ok(WS_PROVIDER_SUBSYSTEM, 'should export subsystem constant');
    t.ok(WS_PROVIDER_LOG_MSG, 'should export log messages');
    t.ok(WS_PROVIDER_ERROR_MSG, 'should export error messages');
  });

  t.test('connect throws when provider is unavailable', async (t) => {
    const provider = new WebSocketTransportProvider();
    await provider.shutdown();

    const endpoint = {
      endpoint_id: 'ep-1',
      node_id: 'node-1',
      transport_type: 'ws',
      address: 'ws://localhost:9999',
      priority: 0,
      metadata: null,
      status: 'active',
    };

    try {
      await provider.connect(endpoint);
      t.fail('should throw error');
    } catch (error) {
      t.equal(error.code, WS_PROVIDER_ERROR_MSG.PROVIDER_UNAVAILABLE,
        'should have correct error code');
      t.equal(error.transportType, TRANSPORT_TYPE.WEBSOCKET,
        'should have transport type');
    }
  });

  t.test('send returns error for unknown connection', async (t) => {
    const provider = new WebSocketTransportProvider();

    const result = await provider.send(
      {connectionId: 'unknown'},
      {type: 'test', data: 'hello'},
    );

    t.equal(result.success, false, 'should not succeed');
    t.equal(result.error, WS_PROVIDER_ERROR_MSG.CONNECTION_CLOSED,
      'should have connection closed error');

    await provider.shutdown();
  });

  t.test('connect and communicate with WebSocket server', async (t) => {
    // Create a simple WebSocket server for testing
    let server;
    let serverReceivedMessage = null;
    const serverPort = 9890;

    try {
      server = new WebSocketServer({port: serverPort, host: '127.0.0.1'});
    } catch (error) {
      if (error?.code === 'EPERM' || /EPERM/i.test(error?.message || '')) {
        t.pass(`socket listen not permitted in this environment: ${error.message}`);
        return;
      }
      throw error;
    }

    // Wait for server to start (some sandboxes reject socket binds asynchronously).
    let listenError = null;
    await new Promise((resolve) => {
      server.on('listening', resolve);
      server.on('error', (error) => {
        listenError = error;
        resolve();
      });
    });
    if (listenError) {
      if (listenError?.code === 'EPERM' || listenError?.code === 'EACCES') {
        t.pass(`socket listen not permitted in this environment: ${listenError.message}`);
        return;
      }
      throw listenError;
    }

    // Handle incoming connections
    server.on('connection', (ws) => {
      ws.on('message', (data) => {
        const message = JSON.parse(data.toString());
        serverReceivedMessage = message;

        // Send ACK for service messages
        if (message.type === 'service_message') {
          ws.send(JSON.stringify({
            type: 'ack',
            messageId: message.messageId,
            acknowledged: true,
            responseData: 'server-response',
          }));
        }
      });
    });

    const provider = new WebSocketTransportProvider({
      localNodeId: 'test-client',
      localAddress: 'test-client-address',
    });

    const endpoint = {
      endpoint_id: 'ep-test',
      node_id: 'server-node',
      transport_type: 'ws',
      address: `ws://127.0.0.1:${serverPort}`,
      priority: 0,
      metadata: null,
      status: 'active',
    };

    // Connect to server
    const connection = await provider.connect(endpoint);

    t.ok(connection.connectionId, 'should have connection ID');
    t.equal(connection.nodeId, 'server-node', 'should have node ID');
    t.equal(connection.transportType, 'ws', 'should have transport type');
    t.equal(connection.state, CONNECTION_STATE.CONNECTED, 'should be connected');

    // Wait for identification message
    await new Promise((resolve) => setTimeout(resolve, 50));

    t.ok(serverReceivedMessage, 'server should receive identification');
    t.equal(serverReceivedMessage.type, 'identify', 'should be identify message');
    t.equal(serverReceivedMessage.nodeId, 'test-client', 'should have client node ID');

    // Send a message
    const sendResult = await provider.send(connection, {
      targetAddress: 'test-service',
      payload: {action: 'test'},
    });

    t.equal(sendResult.success, true, 'should succeed');
    t.equal(sendResult.acknowledged, true, 'should be acknowledged');
    t.equal(sendResult.responseData, 'server-response', 'should have response data');

    // Check health status
    const health = provider.getHealthStatus(connection);
    t.equal(health.state, CONNECTION_STATE.CONNECTED, 'should be connected');
    t.ok(health.lastActivity, 'should have last activity');

    // Disconnect
    await provider.disconnect(connection);

    const healthAfterDisconnect = provider.getHealthStatus(connection);
    t.equal(healthAfterDisconnect.state, CONNECTION_STATE.CLOSED,
      'should be closed after disconnect');

    // Cleanup
    await provider.shutdown();
    await new Promise((resolve) => server.close(resolve));
  });

  t.test('emits connection established event', async (t) => {
    let server;
    const serverPort = 9891;

    try {
      server = new WebSocketServer({port: serverPort, host: '127.0.0.1'});
    } catch (error) {
      if (error?.code === 'EPERM' || /EPERM/i.test(error?.message || '')) {
        t.pass(`socket listen not permitted in this environment: ${error.message}`);
        return;
      }
      throw error;
    }

    let listenError = null;
    await new Promise((resolve) => {
      server.on('listening', resolve);
      server.on('error', (error) => {
        listenError = error;
        resolve();
      });
    });
    if (listenError) {
      if (listenError?.code === 'EPERM' || listenError?.code === 'EACCES') {
        t.pass(`socket listen not permitted in this environment: ${listenError.message}`);
        return;
      }
      throw listenError;
    }

    const provider = new WebSocketTransportProvider();
    let eventData = null;

    provider.getEventEmitter().on(TRANSPORT_EVENT.CONNECTION_ESTABLISHED, (data) => {
      eventData = data;
    });

    const endpoint = {
      endpoint_id: 'ep-event-test',
      node_id: 'event-server',
      transport_type: 'ws',
      address: `ws://127.0.0.1:${serverPort}`,
      priority: 0,
      metadata: null,
      status: 'active',
    };

    await provider.connect(endpoint);

    t.ok(eventData, 'should emit connection established event');
    t.ok(eventData.connectionId, 'should have connection ID');
    t.equal(eventData.nodeId, 'event-server', 'should have node ID');

    await provider.shutdown();
    await new Promise((resolve) => server.close(resolve));
  });

  t.test('handles connection failure gracefully', async (t) => {
    const provider = new WebSocketTransportProvider();

    const endpoint = {
      endpoint_id: 'ep-fail',
      node_id: 'nonexistent-node',
      transport_type: 'ws',
      address: 'ws://127.0.0.1:59999', // Non-existent port
      priority: 0,
      metadata: null,
      status: 'active',
    };

    try {
      await provider.connect(endpoint);
      t.fail('should throw error');
    } catch (error) {
      t.equal(error.code, WS_PROVIDER_ERROR_MSG.CONNECTION_FAILED,
        'should have connection failed error code');
      t.equal(error.transportType, TRANSPORT_TYPE.WEBSOCKET,
        'should have transport type');
    }

    await provider.shutdown();
  });

  t.test('parseMetadata handles various input types', async (t) => {
    const provider = new WebSocketTransportProvider();

    // Test with null
    const result1 = provider.parseMetadata(null);
    t.same(result1, {}, 'should return empty object for null');

    // Test with undefined
    const result2 = provider.parseMetadata(undefined);
    t.same(result2, {}, 'should return empty object for undefined');

    // Test with valid JSON string
    const result3 = provider.parseMetadata('{"tls": true}');
    t.same(result3, {tls: true}, 'should parse JSON string');

    // Test with invalid JSON string
    const result4 = provider.parseMetadata('invalid-json');
    t.same(result4, {}, 'should return empty object for invalid JSON');

    // Test with object
    const result5 = provider.parseMetadata({key: 'value'});
    t.same(result5, {key: 'value'}, 'should return object as-is');

    await provider.shutdown();
  });
});
