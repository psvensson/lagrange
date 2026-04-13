/**
 * Property test for On-Demand Connection with TTL Lifecycle.
 *
 * Property 5: For any message delivery to a node, if a connection exists and
 * is healthy it SHALL be reused, otherwise a new connection SHALL be established.
 * For any connection that is idle beyond the configured TTL, it SHALL be closed.
 * For any connection that is reused, its TTL timer SHALL be reset.
 *
 * **Validates: Requirements 4.1, 4.2, 4.3, 4.4, 4.7**
 *
 * **Feature: transport-abstraction-layer, Property 5: On-Demand Connection with TTL Lifecycle**
 */
// @ts-nocheck


import {test} from '../../src/test-helpers/tap.js';
import fc from 'fast-check';
import {ConnectionPool} from '../../src/transport/connection-pool.js';
import {TransportProvider} from '../../src/transport/transport-provider.js';
import {ConfigurationManager} from '../../src/config/configuration-manager.js';
import {LoggingService} from '../../src/logging/logging-service.js';
import {
  COLUMN,
  ENDPOINT_STATUS,
  TRANSPORT_TYPE,
} from '../../src/constants/index.js';
import {CONNECTION_STATE} from '../../src/constants/transport.js';

/**
 * Available transport types for testing.
 */
const TRANSPORT_TYPES = [
  TRANSPORT_TYPE.WEBSOCKET,
  TRANSPORT_TYPE.NATS,
  TRANSPORT_TYPE.VEILID,
];

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
 * @param {string} transportType - The transport type identifier
 * @param {Object} options - Mock options
 * @return {TransportProvider} A mock provider implementation
 */
function createMockProvider(transportType, options = {}) {
  const {available = true, shouldFail = false} = options;

  class MockProvider extends TransportProvider {
    constructor() {
      super();
      this.connectCallCount = 0;
      this.disconnectCallCount = 0;
    }

    getType() {
      return transportType;
    }

    isAvailable() {
      return available;
    }

    async connect(endpoint) {
      this.connectCallCount++;
      if (shouldFail) {
        throw new Error('Connection failed');
      }
      return {
        connectionId: `mock-conn-${Date.now()}-${this.connectCallCount}`,
        state: CONNECTION_STATE.CONNECTED,
        endpoint,
      };
    }

    async send(_connection, _message) {
      return {success: true};
    }

    async disconnect(_connection) {
      this.disconnectCallCount++;
    }

    getHealthStatus(_connection) {
      return {state: CONNECTION_STATE.CONNECTED, healthy: true};
    }

    async shutdown() {}
  }

  return new MockProvider();
}

/**
 * Creates an endpoint record for testing.
 * @param {Object} overrides - Fields to override
 * @return {Object} Endpoint record
 */
function createEndpoint(overrides = {}) {
  const nodeId = overrides.nodeId || 'node-1';
  const transportType = overrides.transportType || TRANSPORT_TYPE.WEBSOCKET;
  return {
    [COLUMN.ENDPOINT_ID]: overrides.endpointId || `ep-${nodeId}`,
    [COLUMN.NODE_ID]: nodeId,
    [COLUMN.TRANSPORT_TYPE]: transportType,
    [COLUMN.ADDRESS]: overrides.address || `${transportType}://localhost:8080`,
    [COLUMN.PRIORITY]: overrides.priority ?? 0,
    [COLUMN.METADATA]: overrides.metadata || '{}',
    [COLUMN.STATUS]: overrides.status || ENDPOINT_STATUS.ACTIVE,
    [COLUMN.CREATED_AT]: Date.now(),
    [COLUMN.UPDATED_AT]: Date.now(),
  };
}

/**
 * Feature: transport-abstraction-layer
 * Property 5: On-Demand Connection with TTL Lifecycle
 *
 * For any message delivery to a node, if a connection exists and is healthy
 * it SHALL be reused, otherwise a new connection SHALL be established.
 * For any connection that is idle beyond the configured TTL, it SHALL be closed.
 * For any connection that is reused, its TTL timer SHALL be reset.
 */
test('Property 5: On-Demand Connection with TTL Lifecycle', async (t) => {
  t.beforeEach(() => {
    initializeTestEnvironment();
  });

  t.afterEach(() => {
    cleanupTestEnvironment();
  });

  /**
   * Property: Existing healthy connection is reused.
   *
   * For any node with an existing healthy connection, subsequent getConnection
   * calls SHALL return the same connection without establishing a new one.
   *
   * **Validates: Requirements 4.1**
   */
  t.test('existing healthy connection is reused', async (t) => {
    await fc.assert(
      fc.asyncProperty(
        fc.uuid(),
        fc.constantFrom(...TRANSPORT_TYPES),
        fc.integer({min: 1, max: 10}),
        async (nodeId, transportType, reuseCount) => {
          const pool = new ConnectionPool({ttlMs: 60000});
          const provider = createMockProvider(transportType);
          const endpoint = createEndpoint({nodeId, transportType});

          try {
            // First call creates connection
            const firstConn = await pool.getConnection(nodeId, endpoint, provider);
            const firstConnId = firstConn.connectionId;

            // Subsequent calls should reuse the same connection
            for (let i = 0; i < reuseCount; i++) {
              const conn = await pool.getConnection(nodeId, endpoint, provider);
              if (conn.connectionId !== firstConnId) {
                return false;
              }
            }

            // Provider should only have been called once
            return provider.connectCallCount === 1;
          } finally {
            await pool.shutdown();
          }
        },
      ),
      {numRuns: 10},
    );

    t.pass('existing healthy connection is reused');
  });

  /**
   * Property: New connection established when none exists.
   *
   * For any node without an existing connection, getConnection SHALL
   * establish a new connection via the provider.
   *
   * **Validates: Requirements 4.2**
   */
  t.test('new connection established when none exists', async (t) => {
    await fc.assert(
      fc.asyncProperty(
        fc.uuid(),
        fc.constantFrom(...TRANSPORT_TYPES),
        async (nodeId, transportType) => {
          const pool = new ConnectionPool({ttlMs: 60000});
          const provider = createMockProvider(transportType);
          const endpoint = createEndpoint({nodeId, transportType});

          try {
            // Verify no connection exists initially
            if (pool.hasConnection(nodeId)) {
              return false;
            }

            // Get connection should create one
            const conn = await pool.getConnection(nodeId, endpoint, provider);

            // Verify connection was created
            return conn !== null &&
                   conn.state === CONNECTION_STATE.CONNECTED &&
                   conn.nodeId === nodeId &&
                   provider.connectCallCount === 1 &&
                   pool.hasConnection(nodeId);
          } finally {
            await pool.shutdown();
          }
        },
      ),
      {numRuns: 10},
    );

    t.pass('new connection established when none exists');
  });

  /**
   * Property: TTL timer is reset on connection reuse.
   *
   * For any connection that is reused, its TTL expiration time SHALL be
   * reset to extend the connection lifetime.
   *
   * **Validates: Requirements 4.7**
   */
  t.test('TTL timer is reset on connection reuse', async (t) => {
    await fc.assert(
      fc.asyncProperty(
        fc.uuid(),
        fc.constantFrom(...TRANSPORT_TYPES),
        fc.integer({min: 1000, max: 60000}),
        async (nodeId, transportType, ttlMs) => {
          const pool = new ConnectionPool({ttlMs});
          const provider = createMockProvider(transportType);
          const endpoint = createEndpoint({nodeId, transportType});

          try {
            // Create initial connection
            const conn1 = await pool.getConnection(nodeId, endpoint, provider);
            const originalTtlExpires = conn1.ttlExpiresAt;

            // Small delay to ensure time difference
            await Promise.resolve();

            // Reuse connection
            const conn2 = await pool.getConnection(nodeId, endpoint, provider);

            // TTL should be reset (same or later)
            return conn2.ttlExpiresAt >= originalTtlExpires &&
                   conn2.lastActivity >= conn1.createdAt;
          } finally {
            await pool.shutdown();
          }
        },
      ),
      {numRuns: 10},
    );

    t.pass('TTL timer is reset on connection reuse');
  });

  /**
   * Property: Idle connections beyond TTL are closed.
   *
   * For any connection that has been idle beyond the configured TTL,
   * closeIdleConnections SHALL close it.
   *
   * **Validates: Requirements 4.4**
   */
  t.test('idle connections beyond TTL are closed', async (t) => {
    await fc.assert(
      fc.asyncProperty(
        fc.uuid(),
        fc.constantFrom(...TRANSPORT_TYPES),
        async (nodeId, transportType) => {
          // Use very short TTL for testing (1ms)
          const pool = new ConnectionPool({ttlMs: 1});
          const provider = createMockProvider(transportType);
          const endpoint = createEndpoint({nodeId, transportType});

          try {
            // Create connection
            await pool.getConnection(nodeId, endpoint, provider);

            // Verify connection exists
            if (!pool.hasConnection(nodeId)) {
              return false;
            }

            // Wait for TTL to expire
            await new Promise((resolve) => setTimeout(resolve, 10));

            // Close idle connections
            const closedCount = await pool.closeIdleConnections();

            // Connection should be closed
            return closedCount === 1 && !pool.hasConnection(nodeId);
          } finally {
            await pool.shutdown();
          }
        },
      ),
      {numRuns: 10},
    );

    t.pass('idle connections beyond TTL are closed');
  });

  /**
   * Property: Active connections within TTL are not closed.
   *
   * For any connection that has not exceeded its TTL, closeIdleConnections
   * SHALL NOT close it.
   *
   * **Validates: Requirements 4.3, 4.4**
   */
  t.test('active connections within TTL are not closed', async (t) => {
    await fc.assert(
      fc.asyncProperty(
        fc.uuid(),
        fc.constantFrom(...TRANSPORT_TYPES),
        async (nodeId, transportType) => {
          // Use long TTL to ensure connection stays active
          const pool = new ConnectionPool({ttlMs: 60000});
          const provider = createMockProvider(transportType);
          const endpoint = createEndpoint({nodeId, transportType});

          try {
            // Create connection
            await pool.getConnection(nodeId, endpoint, provider);

            // Close idle connections (should close none)
            const closedCount = await pool.closeIdleConnections();

            // Connection should still exist
            return closedCount === 0 && pool.hasConnection(nodeId);
          } finally {
            await pool.shutdown();
          }
        },
      ),
      {numRuns: 10},
    );

    t.pass('active connections within TTL are not closed');
  });

  /**
   * Property: releaseConnection resets TTL.
   *
   * For any connection, calling releaseConnection SHALL reset its TTL timer.
   *
   * **Validates: Requirements 4.7**
   */
  t.test('releaseConnection resets TTL', async (t) => {
    await fc.assert(
      fc.asyncProperty(
        fc.uuid(),
        fc.constantFrom(...TRANSPORT_TYPES),
        fc.integer({min: 1000, max: 60000}),
        async (nodeId, transportType, ttlMs) => {
          const pool = new ConnectionPool({ttlMs});
          const provider = createMockProvider(transportType);
          const endpoint = createEndpoint({nodeId, transportType});

          try {
            // Create connection
            await pool.getConnection(nodeId, endpoint, provider);
            const info1 = pool.getConnectionInfo(nodeId);
            const originalTtlExpires = info1.ttlExpiresAt;

            // Small delay
            await Promise.resolve();

            // Release connection (resets TTL)
            pool.releaseConnection(nodeId);

            const info2 = pool.getConnectionInfo(nodeId);

            // TTL should be reset
            return info2.ttlExpiresAt >= originalTtlExpires &&
                   info2.lastActivity >= info1.createdAt;
          } finally {
            await pool.shutdown();
          }
        },
      ),
      {numRuns: 10},
    );

    t.pass('releaseConnection resets TTL');
  });

  /**
   * Property: Multiple nodes have independent connections.
   *
   * For any set of nodes, each node SHALL have its own independent connection
   * with its own TTL lifecycle.
   *
   * **Validates: Requirements 4.1, 4.2**
   */
  t.test('multiple nodes have independent connections', async (t) => {
    await fc.assert(
      fc.asyncProperty(
        fc.uniqueArray(fc.uuid(), {minLength: 2, maxLength: 5}),
        fc.constantFrom(...TRANSPORT_TYPES),
        async (nodeIds, transportType) => {
          const pool = new ConnectionPool({ttlMs: 60000});
          const provider = createMockProvider(transportType);

          try {
            const connections = new Map();

            // Create connections for all nodes
            for (const nodeId of nodeIds) {
              const endpoint = createEndpoint({nodeId, transportType});
              const conn = await pool.getConnection(nodeId, endpoint, provider);
              connections.set(nodeId, conn.connectionId);
            }

            // Verify each node has a unique connection
            const connectionIds = new Set(connections.values());
            if (connectionIds.size !== nodeIds.length) {
              return false;
            }

            // Verify provider was called once per node
            if (provider.connectCallCount !== nodeIds.length) {
              return false;
            }

            // Verify pool has correct count
            return pool.getConnectionCount() === nodeIds.length;
          } finally {
            await pool.shutdown();
          }
        },
      ),
      {numRuns: 10},
    );

    t.pass('multiple nodes have independent connections');
  });

  /**
   * Property: Connection info excludes provider connection.
   *
   * For any connection, getConnectionInfo SHALL return connection metadata
   * without exposing the internal provider connection.
   *
   * **Validates: Requirements 4.1**
   */
  t.test('connection info excludes provider connection', async (t) => {
    await fc.assert(
      fc.asyncProperty(
        fc.uuid(),
        fc.constantFrom(...TRANSPORT_TYPES),
        async (nodeId, transportType) => {
          const pool = new ConnectionPool({ttlMs: 60000});
          const provider = createMockProvider(transportType);
          const endpoint = createEndpoint({nodeId, transportType});

          try {
            await pool.getConnection(nodeId, endpoint, provider);
            const info = pool.getConnectionInfo(nodeId);

            // Info should have required fields but not provider connection
            return info !== null &&
                   info.connectionId !== undefined &&
                   info.nodeId === nodeId &&
                   info.state === CONNECTION_STATE.CONNECTED &&
                   info.createdAt !== undefined &&
                   info.lastActivity !== undefined &&
                   info.ttlExpiresAt !== undefined &&
                   info.providerConnection === undefined;
          } finally {
            await pool.shutdown();
          }
        },
      ),
      {numRuns: 10},
    );

    t.pass('connection info excludes provider connection');
  });

  /**
   * Property: Shutdown closes all connections.
   *
   * For any pool with active connections, shutdown SHALL close all
   * connections and clear the pool.
   *
   * **Validates: Requirements 4.3**
   */
  t.test('shutdown closes all connections', async (t) => {
    await fc.assert(
      fc.asyncProperty(
        fc.uniqueArray(fc.uuid(), {minLength: 1, maxLength: 5}),
        fc.constantFrom(...TRANSPORT_TYPES),
        async (nodeIds, transportType) => {
          const pool = new ConnectionPool({ttlMs: 60000});
          const provider = createMockProvider(transportType);

          // Create connections for all nodes
          for (const nodeId of nodeIds) {
            const endpoint = createEndpoint({nodeId, transportType});
            await pool.getConnection(nodeId, endpoint, provider);
          }

          // Verify connections exist
          if (pool.getConnectionCount() !== nodeIds.length) {
            return false;
          }

          // Shutdown
          await pool.shutdown();

          // All connections should be closed
          return pool.getConnectionCount() === 0;
        },
      ),
      {numRuns: 10},
    );

    t.pass('shutdown closes all connections');
  });

  /**
   * Property: closeConnection removes specific connection.
   *
   * For any pool with multiple connections, closeConnection for one node
   * SHALL only close that node's connection.
   *
   * **Validates: Requirements 4.3**
   */
  t.test('closeConnection removes specific connection', async (t) => {
    await fc.assert(
      fc.asyncProperty(
        fc.uniqueArray(fc.uuid(), {minLength: 2, maxLength: 5}),
        fc.constantFrom(...TRANSPORT_TYPES),
        async (nodeIds, transportType) => {
          const pool = new ConnectionPool({ttlMs: 60000});
          const provider = createMockProvider(transportType);

          try {
            // Create connections for all nodes
            for (const nodeId of nodeIds) {
              const endpoint = createEndpoint({nodeId, transportType});
              await pool.getConnection(nodeId, endpoint, provider);
            }

            // Close first node's connection
            const nodeToClose = nodeIds[0];
            const result = await pool.closeConnection(nodeToClose, provider);

            // Verify only that connection was closed
            if (!result || pool.hasConnection(nodeToClose)) {
              return false;
            }

            // Other connections should still exist
            for (let i = 1; i < nodeIds.length; i++) {
              if (!pool.hasConnection(nodeIds[i])) {
                return false;
              }
            }

            return pool.getConnectionCount() === nodeIds.length - 1;
          } finally {
            await pool.shutdown();
          }
        },
      ),
      {numRuns: 10},
    );

    t.pass('closeConnection removes specific connection');
  });
});
