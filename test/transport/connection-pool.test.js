/**
 * Unit tests for ConnectionPool.
 * Tests connection management, TTL lifecycle, and cleanup.
 * Requirements: 4.1, 4.2, 4.3, 4.4, 4.7
 */

import t from '../../src/test-helpers/tap.js';
import {ConnectionPool} from '../../src/transport/connection-pool.js';
import {TransportProvider} from '../../src/transport/transport-provider.js';
import {ConfigurationManager} from '../../src/config/configuration-manager.js';
import {LoggingService} from '../../src/logging/logging-service.js';
import {COLUMN, ENDPOINT_STATUS, TRANSPORT_TYPE} from '../../src/constants/index.js';
import {CONNECTION_STATE} from '../../src/constants/transport.js';

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

/**
 * Creates a mock TransportProvider for testing.
 * @param {Object} options - Mock options
 * @return {TransportProvider} A mock provider implementation
 */
function createMockProvider(options = {}) {
  const {
    transportType = TRANSPORT_TYPE.WEBSOCKET,
    available = true,
    connectDelay = 0,
    shouldFail = false,
  } = options;

  class MockProvider extends TransportProvider {
    constructor() {
      super();
      this.connectCalls = [];
      this.disconnectCalls = [];
    }

    getType() {
      return transportType;
    }

    isAvailable() {
      return available;
    }

    async connect(endpoint) {
      this.connectCalls.push(endpoint);
      if (connectDelay > 0) {
        await new Promise((resolve) => setTimeout(resolve, connectDelay));
      }
      if (shouldFail) {
        throw new Error('Connection failed');
      }
      return {
        connectionId: `mock-conn-${Date.now()}`,
        state: CONNECTION_STATE.CONNECTED,
        endpoint,
      };
    }

    async send(_connection, _message) {
      return {success: true};
    }

    async disconnect(connection) {
      this.disconnectCalls.push(connection);
    }

    getHealthStatus(_connection) {
      return {state: CONNECTION_STATE.CONNECTED, healthy: true};
    }

    async shutdown() {}
  }

  return new MockProvider();
}

/**
 * Creates a test endpoint record.
 * @param {Object} overrides - Fields to override
 * @return {Object} Endpoint record
 */
function createEndpoint(overrides = {}) {
  return {
    [COLUMN.ENDPOINT_ID]: overrides.endpointId || 'ep-1',
    [COLUMN.NODE_ID]: overrides.nodeId || 'node-1',
    [COLUMN.TRANSPORT_TYPE]: overrides.transportType || TRANSPORT_TYPE.WEBSOCKET,
    [COLUMN.ADDRESS]: overrides.address || 'ws://localhost:8080',
    [COLUMN.PRIORITY]: overrides.priority ?? 0,
    [COLUMN.METADATA]: overrides.metadata || '{}',
    [COLUMN.STATUS]: overrides.status || ENDPOINT_STATUS.ACTIVE,
    [COLUMN.CREATED_AT]: Date.now(),
    [COLUMN.UPDATED_AT]: Date.now(),
  };
}

t.test('ConnectionPool unit tests', async (t) => {
  t.beforeEach(() => {
    initializeTestEnvironment();
  });

  t.afterEach(() => {
    cleanupTestEnvironment();
  });

  t.test('constructor uses default TTL from config', async (t) => {
    const pool = new ConnectionPool();
    t.ok(pool.getTtlMs() > 0, 'should have positive TTL');
    t.equal(pool.getConnectionCount(), 0, 'should start with no connections');
    await pool.shutdown();
  });

  t.test('constructor accepts custom TTL', async (t) => {
    const customTtl = 60000;
    const pool = new ConnectionPool({ttlMs: customTtl});
    t.equal(pool.getTtlMs(), customTtl, 'should use custom TTL');
    await pool.shutdown();
  });

  t.test('getConnection throws without nodeId', async (t) => {
    const pool = new ConnectionPool();
    const endpoint = createEndpoint();
    const provider = createMockProvider();

    await t.rejects(
      pool.getConnection(null, endpoint, provider),
      /Node ID is required/,
      'should throw without nodeId',
    );

    await t.rejects(
      pool.getConnection('', endpoint, provider),
      /Node ID is required/,
      'should throw with empty nodeId',
    );

    await pool.shutdown();
  });

  t.test('getConnection throws without endpoint', async (t) => {
    const pool = new ConnectionPool();
    const provider = createMockProvider();

    await t.rejects(
      pool.getConnection('node-1', null, provider),
      /Endpoint is required/,
      'should throw without endpoint',
    );

    await pool.shutdown();
  });

  t.test('getConnection throws without provider', async (t) => {
    const pool = new ConnectionPool();
    const endpoint = createEndpoint();

    await t.rejects(
      pool.getConnection('node-1', endpoint, null),
      /Provider is required/,
      'should throw without provider',
    );

    await pool.shutdown();
  });

  t.test('getConnection creates new connection', async (t) => {
    const pool = new ConnectionPool({ttlMs: 60000});
    const endpoint = createEndpoint({nodeId: 'node-1'});
    const provider = createMockProvider();

    const connection = await pool.getConnection('node-1', endpoint, provider);

    t.ok(connection, 'should return connection');
    t.ok(connection.connectionId, 'should have connectionId');
    t.equal(connection.nodeId, 'node-1', 'should have correct nodeId');
    t.equal(connection.endpointId, 'ep-1', 'should have correct endpointId');
    t.equal(connection.transportType, TRANSPORT_TYPE.WEBSOCKET, 'should have transport type');
    t.equal(connection.state, CONNECTION_STATE.CONNECTED, 'should be connected');
    t.ok(connection.createdAt, 'should have createdAt');
    t.ok(connection.lastActivity, 'should have lastActivity');
    t.ok(connection.ttlExpiresAt, 'should have ttlExpiresAt');
    t.ok(connection.providerConnection, 'should have provider connection');

    t.equal(pool.getConnectionCount(), 1, 'should have one connection');
    t.ok(pool.hasConnection('node-1'), 'should have connection for node-1');

    await pool.shutdown();
  });

  t.test('getConnection reuses existing connection', async (t) => {
    const pool = new ConnectionPool({ttlMs: 60000});
    const endpoint = createEndpoint({nodeId: 'node-1'});
    const provider = createMockProvider();

    const conn1 = await pool.getConnection('node-1', endpoint, provider);
    const conn2 = await pool.getConnection('node-1', endpoint, provider);

    t.equal(conn1.connectionId, conn2.connectionId, 'should return same connection');
    t.equal(provider.connectCalls.length, 1, 'should only connect once');
    t.equal(pool.getConnectionCount(), 1, 'should still have one connection');

    await pool.shutdown();
  });

  t.test('getConnection resets TTL on reuse', async (t) => {
    const pool = new ConnectionPool({ttlMs: 60000});
    const endpoint = createEndpoint({nodeId: 'node-1'});
    const provider = createMockProvider();

    const conn1 = await pool.getConnection('node-1', endpoint, provider);
    const originalTtlExpires = conn1.ttlExpiresAt;

    // Small delay to ensure time difference
    await Promise.resolve();

    const conn2 = await pool.getConnection('node-1', endpoint, provider);

    t.ok(conn2.ttlExpiresAt >= originalTtlExpires, 'TTL should be reset or same');
    t.ok(conn2.lastActivity >= conn1.createdAt, 'lastActivity should be updated');

    await pool.shutdown();
  });

  t.test('releaseConnection throws without nodeId', async (t) => {
    const pool = new ConnectionPool();

    t.throws(
      () => pool.releaseConnection(null),
      /Node ID is required/,
      'should throw without nodeId',
    );

    t.throws(
      () => pool.releaseConnection(''),
      /Node ID is required/,
      'should throw with empty nodeId',
    );

    await pool.shutdown();
  });

  t.test('releaseConnection resets TTL', async (t) => {
    const pool = new ConnectionPool({ttlMs: 60000});
    const endpoint = createEndpoint({nodeId: 'node-1'});
    const provider = createMockProvider();

    const connection = await pool.getConnection('node-1', endpoint, provider);
    const originalTtlExpires = connection.ttlExpiresAt;

    // Small delay
    await Promise.resolve();

    pool.releaseConnection('node-1');

    const info = pool.getConnectionInfo('node-1');
    t.ok(info.ttlExpiresAt >= originalTtlExpires, 'TTL should be reset');

    await pool.shutdown();
  });

  t.test('releaseConnection handles unknown node gracefully', async (t) => {
    const pool = new ConnectionPool();

    // Should not throw
    pool.releaseConnection('unknown-node');
    t.pass('should handle unknown node gracefully');

    await pool.shutdown();
  });

  t.test('closeConnection throws without nodeId', async (t) => {
    const pool = new ConnectionPool();

    await t.rejects(
      pool.closeConnection(null),
      /Node ID is required/,
      'should throw without nodeId',
    );

    await pool.shutdown();
  });

  t.test('closeConnection closes and removes connection', async (t) => {
    const pool = new ConnectionPool({ttlMs: 60000});
    const endpoint = createEndpoint({nodeId: 'node-1'});
    const provider = createMockProvider();

    await pool.getConnection('node-1', endpoint, provider);
    t.equal(pool.getConnectionCount(), 1, 'should have one connection');

    const result = await pool.closeConnection('node-1', provider);

    t.equal(result, true, 'should return true');
    t.equal(pool.getConnectionCount(), 0, 'should have no connections');
    t.notOk(pool.hasConnection('node-1'), 'should not have connection');
    t.equal(provider.disconnectCalls.length, 1, 'should call disconnect');

    await pool.shutdown();
  });

  t.test('closeConnection returns false for unknown node', async (t) => {
    const pool = new ConnectionPool();

    const result = await pool.closeConnection('unknown-node');

    t.equal(result, false, 'should return false');

    await pool.shutdown();
  });

  t.test('closeConnection works without provider', async (t) => {
    const pool = new ConnectionPool({ttlMs: 60000});
    const endpoint = createEndpoint({nodeId: 'node-1'});
    const provider = createMockProvider();

    await pool.getConnection('node-1', endpoint, provider);

    const result = await pool.closeConnection('node-1');

    t.equal(result, true, 'should return true');
    t.equal(pool.getConnectionCount(), 0, 'should have no connections');

    await pool.shutdown();
  });

  t.test('closeIdleConnections closes expired connections', async (t) => {
    const pool = new ConnectionPool({ttlMs: 1}); // 1ms TTL for testing
    const endpoint = createEndpoint({nodeId: 'node-1'});
    const provider = createMockProvider();

    await pool.getConnection('node-1', endpoint, provider);
    t.equal(pool.getConnectionCount(), 1, 'should have one connection');

    // Wait for TTL to expire
    await new Promise((resolve) => setTimeout(resolve, 10));

    const closedCount = await pool.closeIdleConnections();

    t.equal(closedCount, 1, 'should close one connection');
    t.equal(pool.getConnectionCount(), 0, 'should have no connections');

    await pool.shutdown();
  });

  t.test('closeIdleConnections keeps active connections', async (t) => {
    const pool = new ConnectionPool({ttlMs: 60000}); // Long TTL
    const endpoint = createEndpoint({nodeId: 'node-1'});
    const provider = createMockProvider();

    await pool.getConnection('node-1', endpoint, provider);

    const closedCount = await pool.closeIdleConnections();

    t.equal(closedCount, 0, 'should not close any connections');
    t.equal(pool.getConnectionCount(), 1, 'should still have connection');

    await pool.shutdown();
  });

  t.test('shutdown closes all connections', async (t) => {
    const pool = new ConnectionPool({ttlMs: 60000});
    const provider = createMockProvider();

    await pool.getConnection('node-1', createEndpoint({nodeId: 'node-1'}), provider);
    await pool.getConnection('node-2', createEndpoint({nodeId: 'node-2'}), provider);
    await pool.getConnection('node-3', createEndpoint({nodeId: 'node-3'}), provider);

    t.equal(pool.getConnectionCount(), 3, 'should have three connections');

    await pool.shutdown();

    t.equal(pool.getConnectionCount(), 0, 'should have no connections');
  });

  t.test('getConnectionInfo returns connection details', async (t) => {
    const pool = new ConnectionPool({ttlMs: 60000});
    const endpoint = createEndpoint({nodeId: 'node-1', endpointId: 'ep-test'});
    const provider = createMockProvider();

    await pool.getConnection('node-1', endpoint, provider);

    const info = pool.getConnectionInfo('node-1');

    t.ok(info, 'should return info');
    t.ok(info.connectionId, 'should have connectionId');
    t.equal(info.nodeId, 'node-1', 'should have nodeId');
    t.equal(info.endpointId, 'ep-test', 'should have endpointId');
    t.equal(info.transportType, TRANSPORT_TYPE.WEBSOCKET, 'should have transportType');
    t.equal(info.state, CONNECTION_STATE.CONNECTED, 'should have state');
    t.ok(info.createdAt, 'should have createdAt');
    t.ok(info.lastActivity, 'should have lastActivity');
    t.ok(info.ttlExpiresAt, 'should have ttlExpiresAt');
    t.notOk(info.providerConnection, 'should not expose provider connection');

    await pool.shutdown();
  });

  t.test('getConnectionInfo returns null for unknown node', async (t) => {
    const pool = new ConnectionPool();

    const info = pool.getConnectionInfo('unknown-node');

    t.equal(info, null, 'should return null');

    await pool.shutdown();
  });

  t.test('hasConnection returns correct status', async (t) => {
    const pool = new ConnectionPool({ttlMs: 60000});
    const endpoint = createEndpoint({nodeId: 'node-1'});
    const provider = createMockProvider();

    t.notOk(pool.hasConnection('node-1'), 'should not have connection initially');

    await pool.getConnection('node-1', endpoint, provider);

    t.ok(pool.hasConnection('node-1'), 'should have connection after get');

    await pool.closeConnection('node-1');

    t.notOk(pool.hasConnection('node-1'), 'should not have connection after close');

    await pool.shutdown();
  });

  t.test('multiple nodes can have connections', async (t) => {
    const pool = new ConnectionPool({ttlMs: 60000});
    const provider = createMockProvider();

    const conn1 = await pool.getConnection(
      'node-1',
      createEndpoint({nodeId: 'node-1', endpointId: 'ep-1'}),
      provider,
    );
    const conn2 = await pool.getConnection(
      'node-2',
      createEndpoint({nodeId: 'node-2', endpointId: 'ep-2'}),
      provider,
    );

    t.equal(pool.getConnectionCount(), 2, 'should have two connections');
    t.ok(conn1.connectionId !== conn2.connectionId, 'should have different IDs');
    t.ok(pool.hasConnection('node-1'), 'should have node-1');
    t.ok(pool.hasConnection('node-2'), 'should have node-2');

    await pool.shutdown();
  });

  t.test('cleanup interval can be started and stopped', async (t) => {
    const pool = new ConnectionPool({
      ttlMs: 60000,
      cleanupIntervalMs: 100,
    });

    pool.startCleanupInterval();
    t.ok(pool.cleanupIntervalId, 'should have interval ID');

    pool.stopCleanupInterval();
    t.notOk(pool.cleanupIntervalId, 'should not have interval ID');

    await pool.shutdown();
  });

  t.test('shutdown stops cleanup interval', async (t) => {
    const pool = new ConnectionPool({
      ttlMs: 60000,
      cleanupIntervalMs: 100,
    });

    pool.startCleanupInterval();
    t.ok(pool.cleanupIntervalId, 'should have interval ID');

    await pool.shutdown();
    t.notOk(pool.cleanupIntervalId, 'should not have interval ID after shutdown');
  });

  t.test('closeIdleConnections does nothing during shutdown', async (t) => {
    const pool = new ConnectionPool({ttlMs: 1});
    const endpoint = createEndpoint({nodeId: 'node-1'});
    const provider = createMockProvider();

    await pool.getConnection('node-1', endpoint, provider);

    // Wait for TTL to expire
    await new Promise((resolve) => setTimeout(resolve, 10));

    // Start shutdown
    pool.isShuttingDown = true;

    const closedCount = await pool.closeIdleConnections();

    t.equal(closedCount, 0, 'should not close during shutdown');

    // Clean up
    pool.isShuttingDown = false;
    await pool.shutdown();
  });
});
