/**
 * Property test for Message Delivery with Transport Fallback.
 * Property 6: For any message delivery where the primary transport fails,
 * the Message_Router SHALL attempt delivery via the next priority endpoint.
 * The delivery result SHALL include which transport was used or details of
 * all failed attempts.
 *
 * Validates: Requirements 5.3, 5.4, 5.5
 *
 * Feature: transport-abstraction-layer
 * Property 6: Message Delivery with Transport Fallback
 */

import {test} from '../../src/test-helpers/tap.js';
import fc from 'fast-check';
import {MessageRouter} from '../../src/transport/message-router.js';
import {TransportRegistry} from '../../src/transport/transport-registry.js';
import {ConnectionPool} from '../../src/transport/connection-pool.js';
import {TransportProvider} from '../../src/transport/transport-provider.js';
import {ConfigurationManager} from '../../src/config/configuration-manager.js';
import {LoggingService} from '../../src/logging/logging-service.js';
import {
  COLUMN,
  ENDPOINT_STATUS,
  TRANSPORT_TYPE,
} from '../../src/constants/index.js';
import {
  ROUTER_ERROR_MSG,
} from '../../src/constants/transport.js';

// Initialize once at module level
ConfigurationManager.resetInstance();
LoggingService.resetInstance();
const config = ConfigurationManager.getInstance();
config.initialize({node: {id: 'test-node'}, logging: {level: 'error'}});
const logging = LoggingService.getInstance();
logging.initialize({level: 'error'});

// Valid entity types for address generation
const VALID_ENTITY_TYPES = ['message-group', 'partition', 'lifecycle', 'service'];

/**
 * Mock SystemTableCache for testing endpoint lookups.
 */
class MockSystemTableCache {
  constructor() {
    this.endpoints = new Map();
  }

  setEndpoints(nodeId, endpoints) {
    this.endpoints.set(nodeId, endpoints);
  }

  filter(tableName, filterFn) {
    if (tableName !== 'node_endpoints') {
      return [];
    }
    const allEndpoints = [];
    for (const endpoints of this.endpoints.values()) {
      allEndpoints.push(...endpoints);
    }
    return allEndpoints.filter(filterFn);
  }
}

/**
 * Mock TransportProvider that can be configured to succeed or fail.
 */
class MockTransportProvider extends TransportProvider {
  constructor(type, options = {}) {
    super();
    this.type = type;
    this.available = options.available !== false;
    this.shouldFail = options.shouldFail || false;
    this.failureMessage = options.failureMessage || 'Connection failed';
  }

  getType() {
    return this.type;
  }

  isAvailable() {
    return this.available;
  }

  async connect(endpoint) {
    if (this.shouldFail) {
      throw new Error(this.failureMessage);
    }
    return {
      connectionId: `conn-${endpoint[COLUMN.ENDPOINT_ID]}`,
      endpoint,
    };
  }

  async send(_connection, _message) {
    if (this.shouldFail) {
      throw new Error(this.failureMessage);
    }
    return {success: true, latency: 10};
  }

  async disconnect(_connection) {}

  getHealthStatus(_connection) {
    return {
      state: 'connected',
      latency: 10,
      lastActivity: Date.now(),
      healthy: !this.shouldFail,
    };
  }

  async shutdown() {}
}

/**
 * Create a mock endpoint record.
 */
function createEndpoint(nodeId, transportType, priority, endpointId) {
  return {
    [COLUMN.ENDPOINT_ID]: endpointId || `ep-${nodeId}-${transportType}-${priority}`,
    [COLUMN.NODE_ID]: nodeId,
    [COLUMN.TRANSPORT_TYPE]: transportType,
    [COLUMN.ADDRESS]: `${transportType}://localhost:${8080 + priority}`,
    [COLUMN.PRIORITY]: priority,
    [COLUMN.METADATA]: '{}',
    [COLUMN.STATUS]: ENDPOINT_STATUS.ACTIVE,
    [COLUMN.CREATED_AT]: Date.now(),
    [COLUMN.UPDATED_AT]: Date.now(),
  };
}

/**
 * Feature: transport-abstraction-layer
 * Property 6: Message Delivery with Transport Fallback
 *
 * For any message delivery where the primary transport fails, the Message_Router
 * SHALL attempt delivery via the next priority endpoint. The delivery result
 * SHALL include which transport was used or details of all failed attempts.
 *
 * **Validates: Requirements 5.3, 5.4, 5.5**
 */
test('Property 6: Message Delivery with Transport Fallback', async (t) => {
  /**
   * Property: When primary endpoint succeeds, result includes transportUsed.
   * **Validates: Requirements 5.4**
   */
  t.test('successful delivery includes transportUsed in result', async (t) => {
    await fc.assert(
      fc.asyncProperty(
        fc.uuid(),
        fc.constantFrom(...VALID_ENTITY_TYPES),
        fc.uuid(),
        async (targetNodeId, entityType, entityId) => {
          const cache = new MockSystemTableCache();
          const registry = new TransportRegistry(cache);
          const pool = new ConnectionPool({ttlMs: 60000});

          try {
            const wsProvider = new MockTransportProvider(TRANSPORT_TYPE.WEBSOCKET);
            registry.registerProvider(wsProvider);

            const endpoint = createEndpoint(targetNodeId, TRANSPORT_TYPE.WEBSOCKET, 0);
            cache.setEndpoints(targetNodeId, [endpoint]);

            const router = new MessageRouter({
              nodeId: 'local-node',
              transportRegistry: registry,
              connectionPool: pool,
            });
            router.initialized = true;

            const targetAddress = `${targetNodeId}/${entityType}/${entityId}`;
            const result = await router.deliver(targetAddress, {data: 'test'});

            return result.transportUsed !== undefined &&
                   result.transportUsed.endpointId === endpoint[COLUMN.ENDPOINT_ID] &&
                   result.transportUsed.transportType === TRANSPORT_TYPE.WEBSOCKET &&
                   result.acknowledged === true;
          } finally {
            await pool.shutdown();
          }
        },
      ),
      {numRuns: 10},
    );

    t.pass('successful delivery includes transportUsed in result');
  });

  /**
   * Property: When primary transport fails, fallback to next priority is attempted.
   * **Validates: Requirements 5.3**
   */
  t.test('fallback to next priority endpoint when primary fails', async (t) => {
    await fc.assert(
      fc.asyncProperty(
        fc.uuid(),
        fc.constantFrom(...VALID_ENTITY_TYPES),
        fc.uuid(),
        async (targetNodeId, entityType, entityId) => {
          const cache = new MockSystemTableCache();
          const registry = new TransportRegistry(cache);
          const pool = new ConnectionPool({ttlMs: 60000});

          try {
            const wsProvider = new MockTransportProvider(TRANSPORT_TYPE.WEBSOCKET, {
              shouldFail: true,
              failureMessage: 'Primary transport failed',
            });
            const natsProvider = new MockTransportProvider(TRANSPORT_TYPE.NATS, {
              shouldFail: false,
            });

            registry.registerProvider(wsProvider);
            registry.registerProvider(natsProvider);

            const primaryEndpoint = createEndpoint(
              targetNodeId, TRANSPORT_TYPE.WEBSOCKET, 0, `ep-${targetNodeId}-ws-primary`,
            );
            const fallbackEndpoint = createEndpoint(
              targetNodeId, TRANSPORT_TYPE.NATS, 1, `ep-${targetNodeId}-nats-fallback`,
            );
            cache.setEndpoints(targetNodeId, [primaryEndpoint, fallbackEndpoint]);

            const router = new MessageRouter({
              nodeId: 'local-node',
              transportRegistry: registry,
              connectionPool: pool,
            });
            router.initialized = true;

            const targetAddress = `${targetNodeId}/${entityType}/${entityId}`;
            const result = await router.deliver(targetAddress, {data: 'test'});

            return result.transportUsed?.transportType === TRANSPORT_TYPE.NATS &&
                   result.transportUsed?.endpointId === fallbackEndpoint[COLUMN.ENDPOINT_ID] &&
                   result.acknowledged === true;
          } finally {
            await pool.shutdown();
          }
        },
      ),
      {numRuns: 10},
    );

    t.pass('fallback to next priority endpoint when primary fails');
  });

  /**
   * Property: When all transports fail, error includes details of all attempts.
   * **Validates: Requirements 5.5**
   */
  t.test('all transports fail returns error with attempt details', async (t) => {
    await fc.assert(
      fc.asyncProperty(
        fc.uuid(),
        fc.constantFrom(...VALID_ENTITY_TYPES),
        fc.uuid(),
        async (targetNodeId, entityType, entityId) => {
          const cache = new MockSystemTableCache();
          const registry = new TransportRegistry(cache);
          const pool = new ConnectionPool({ttlMs: 60000});

          try {
            const wsProvider = new MockTransportProvider(TRANSPORT_TYPE.WEBSOCKET, {
              shouldFail: true,
              failureMessage: 'ws transport failed',
            });
            const natsProvider = new MockTransportProvider(TRANSPORT_TYPE.NATS, {
              shouldFail: true,
              failureMessage: 'nats transport failed',
            });

            registry.registerProvider(wsProvider);
            registry.registerProvider(natsProvider);

            const wsEndpoint = createEndpoint(
              targetNodeId, TRANSPORT_TYPE.WEBSOCKET, 0, `ep-${targetNodeId}-ws-0`,
            );
            const natsEndpoint = createEndpoint(
              targetNodeId, TRANSPORT_TYPE.NATS, 1, `ep-${targetNodeId}-nats-1`,
            );
            cache.setEndpoints(targetNodeId, [wsEndpoint, natsEndpoint]);

            const router = new MessageRouter({
              nodeId: 'local-node',
              transportRegistry: registry,
              connectionPool: pool,
            });
            router.initialized = true;

            const targetAddress = `${targetNodeId}/${entityType}/${entityId}`;
            const result = await router.deliver(targetAddress, {data: 'test'});

            return result.acknowledged === false &&
                   result.error === ROUTER_ERROR_MSG.ALL_TRANSPORTS_FAILED &&
                   Array.isArray(result.attempts) &&
                   result.attempts.length === 2 &&
                   result.attempts.every((a) =>
                     a.endpoint !== undefined &&
                     a.error !== undefined &&
                     a.endpoint.endpointId !== undefined &&
                     a.error.code !== undefined,
                   );
          } finally {
            await pool.shutdown();
          }
        },
      ),
      {numRuns: 10},
    );

    t.pass('all transports fail returns error with attempt details');
  });

  /**
   * Property: Endpoints are tried in priority order during fallback.
   * **Validates: Requirements 5.3**
   */
  t.test('endpoints tried in priority order during fallback', async (t) => {
    await fc.assert(
      fc.asyncProperty(
        fc.uuid(),
        fc.constantFrom(...VALID_ENTITY_TYPES),
        fc.uuid(),
        fc.uniqueArray(fc.integer({min: 0, max: 100}), {minLength: 2, maxLength: 4}),
        async (targetNodeId, entityType, entityId, priorities) => {
          const cache = new MockSystemTableCache();
          const registry = new TransportRegistry(cache);
          const pool = new ConnectionPool({ttlMs: 60000});
          const attemptOrder = [];

          try {
            class TrackingProvider extends TransportProvider {
              getType() {
                return TRANSPORT_TYPE.WEBSOCKET;
              }
              isAvailable() {
                return true;
              }
              async connect(endpoint) {
                attemptOrder.push(endpoint[COLUMN.PRIORITY]);
                throw new Error('Intentional failure for tracking');
              }
              async send(_c, _m) {
                throw new Error('Should not reach send');
              }
              async disconnect(_c) {}
              getHealthStatus(_c) {
                return {state: 'connected', healthy: true};
              }
              async shutdown() {}
            }

            registry.registerProvider(new TrackingProvider());

            const endpoints = priorities.map((priority, index) =>
              createEndpoint(targetNodeId, TRANSPORT_TYPE.WEBSOCKET, priority,
                `ep-${targetNodeId}-ws-${index}`),
            );
            cache.setEndpoints(targetNodeId, endpoints);

            const router = new MessageRouter({
              nodeId: 'local-node',
              transportRegistry: registry,
              connectionPool: pool,
            });
            router.initialized = true;

            const targetAddress = `${targetNodeId}/${entityType}/${entityId}`;
            await router.deliver(targetAddress, {data: 'test'});

            const sortedPriorities = [...priorities].sort((a, b) => a - b);
            return attemptOrder.length === priorities.length &&
                   attemptOrder.every((p, i) => p === sortedPriorities[i]);
          } finally {
            await pool.shutdown();
          }
        },
      ),
      {numRuns: 10},
    );

    t.pass('endpoints tried in priority order during fallback');
  });

  /**
   * Property: Unavailable providers are skipped during fallback.
   * **Validates: Requirements 5.3, 5.5**
   */
  t.test('unavailable providers are skipped', async (t) => {
    await fc.assert(
      fc.asyncProperty(
        fc.uuid(),
        fc.constantFrom(...VALID_ENTITY_TYPES),
        fc.uuid(),
        async (targetNodeId, entityType, entityId) => {
          const cache = new MockSystemTableCache();
          const registry = new TransportRegistry(cache);
          const pool = new ConnectionPool({ttlMs: 60000});

          try {
            const wsProvider = new MockTransportProvider(TRANSPORT_TYPE.WEBSOCKET, {
              available: false,
            });
            const natsProvider = new MockTransportProvider(TRANSPORT_TYPE.NATS, {
              available: true,
              shouldFail: false,
            });

            registry.registerProvider(wsProvider);
            registry.registerProvider(natsProvider);

            const unavailableEndpoint = createEndpoint(
              targetNodeId, TRANSPORT_TYPE.WEBSOCKET, 0, `ep-${targetNodeId}-ws-unavailable`,
            );
            const availableEndpoint = createEndpoint(
              targetNodeId, TRANSPORT_TYPE.NATS, 1, `ep-${targetNodeId}-nats-available`,
            );
            cache.setEndpoints(targetNodeId, [unavailableEndpoint, availableEndpoint]);

            const router = new MessageRouter({
              nodeId: 'local-node',
              transportRegistry: registry,
              connectionPool: pool,
            });
            router.initialized = true;

            const targetAddress = `${targetNodeId}/${entityType}/${entityId}`;
            const result = await router.deliver(targetAddress, {data: 'test'});

            return result.acknowledged === true &&
                   result.transportUsed?.transportType === TRANSPORT_TYPE.NATS;
          } finally {
            await pool.shutdown();
          }
        },
      ),
      {numRuns: 10},
    );

    t.pass('unavailable providers are skipped');
  });

  /**
   * Property: No endpoints returns appropriate error.
   * **Validates: Requirements 5.5**
   */
  t.test('no endpoints returns appropriate error', async (t) => {
    await fc.assert(
      fc.asyncProperty(
        fc.uuid(),
        fc.constantFrom(...VALID_ENTITY_TYPES),
        fc.uuid(),
        async (targetNodeId, entityType, entityId) => {
          const cache = new MockSystemTableCache();
          const registry = new TransportRegistry(cache);
          const pool = new ConnectionPool({ttlMs: 60000});

          try {
            const wsProvider = new MockTransportProvider(TRANSPORT_TYPE.WEBSOCKET);
            registry.registerProvider(wsProvider);

            cache.setEndpoints(targetNodeId, []);

            const router = new MessageRouter({
              nodeId: 'local-node',
              transportRegistry: registry,
              connectionPool: pool,
            });
            router.initialized = true;

            const targetAddress = `${targetNodeId}/${entityType}/${entityId}`;
            const result = await router.deliver(targetAddress, {data: 'test'});

            return result.acknowledged === false &&
                   result.error === ROUTER_ERROR_MSG.NO_ENDPOINTS_FOR_NODE;
          } finally {
            await pool.shutdown();
          }
        },
      ),
      {numRuns: 10},
    );

    t.pass('no endpoints returns appropriate error');
  });

  /**
   * Property: Delivery result success field matches acknowledged field.
   * **Validates: Requirements 5.4**
   */
  t.test('delivery result success matches acknowledged', async (t) => {
    await fc.assert(
      fc.asyncProperty(
        fc.uuid(),
        fc.constantFrom(...VALID_ENTITY_TYPES),
        fc.uuid(),
        fc.boolean(),
        async (targetNodeId, entityType, entityId, shouldSucceed) => {
          const cache = new MockSystemTableCache();
          const registry = new TransportRegistry(cache);
          const pool = new ConnectionPool({ttlMs: 60000});

          try {
            const wsProvider = new MockTransportProvider(TRANSPORT_TYPE.WEBSOCKET, {
              shouldFail: !shouldSucceed,
              failureMessage: 'Configured to fail',
            });
            registry.registerProvider(wsProvider);

            const endpoint = createEndpoint(targetNodeId, TRANSPORT_TYPE.WEBSOCKET, 0);
            cache.setEndpoints(targetNodeId, [endpoint]);

            const router = new MessageRouter({
              nodeId: 'local-node',
              transportRegistry: registry,
              connectionPool: pool,
            });
            router.initialized = true;

            const targetAddress = `${targetNodeId}/${entityType}/${entityId}`;
            const result = await router.deliver(targetAddress, {data: 'test'});

            if (shouldSucceed) {
              return result.acknowledged === true && result.success === true;
            } else {
              return result.acknowledged === false && result.success === false;
            }
          } finally {
            await pool.shutdown();
          }
        },
      ),
      {numRuns: 10},
    );

    t.pass('delivery result success matches acknowledged');
  });
});
