/**
 * Unit tests for TransportRegistry.
 * Tests provider registration, endpoint selection, and cache integration.
 * Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.7
 */
// @ts-nocheck


import t from '../../src/test-helpers/tap.js';
import {TransportRegistry} from '../../src/transport/transport-registry.js';
import {TransportProvider} from '../../src/transport/transport-provider.js';
import {SystemTableCache} from '../../src/cache/system-table-cache.js';
import {ConfigurationManager} from '../../src/config/configuration-manager.js';
import {LoggingService} from '../../src/logging/logging-service.js';
import {COLUMN, ENDPOINT_STATUS, TABLES, TRANSPORT_TYPE} from '../../src/constants/index.js';
import {CDC_OPERATION} from '../../src/constants/cdc.js';

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
 * @param {boolean} available - Whether the provider is available
 * @return {TransportProvider} A mock provider implementation
 */
function createMockProvider(transportType, available = true) {
  class MockProvider extends TransportProvider {
    getType() {
      return transportType;
    }

    isAvailable() {
      return available;
    }

    async connect(_endpoint) {
      return {connectionId: 'mock-conn', state: 'connected'};
    }

    async send(_connection, _message) {
      return {success: true};
    }

    async disconnect(_connection) {}

    getHealthStatus(_connection) {
      return {state: 'connected', healthy: true};
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

t.test('TransportRegistry unit tests', async (t) => {
  t.beforeEach(() => {
    initializeTestEnvironment();
  });

  t.afterEach(() => {
    cleanupTestEnvironment();
  });

  t.test('constructor requires SystemTableCache', async (t) => {
    t.throws(
      () => new TransportRegistry(),
      /SystemTableCache is required/,
      'should throw without cache',
    );

    t.throws(
      () => new TransportRegistry(null),
      /SystemTableCache is required/,
      'should throw with null cache',
    );

    const cache = new SystemTableCache();
    const registry = new TransportRegistry(cache);
    t.ok(registry, 'should create with valid cache');
  });

  t.test('registerProvider adds provider to registry', async (t) => {
    const cache = new SystemTableCache();
    const registry = new TransportRegistry(cache);
    const provider = createMockProvider(TRANSPORT_TYPE.WEBSOCKET);

    registry.registerProvider(provider);

    t.equal(registry.getProviderCount(), 1, 'should have one provider');
    t.ok(registry.hasProvider(TRANSPORT_TYPE.WEBSOCKET), 'should have ws provider');
    t.equal(registry.getProvider(TRANSPORT_TYPE.WEBSOCKET), provider, 'should return provider');
  });

  t.test('registerProvider throws without provider', async (t) => {
    const cache = new SystemTableCache();
    const registry = new TransportRegistry(cache);

    t.throws(
      () => registry.registerProvider(),
      /Provider is required/,
      'should throw without provider',
    );

    t.throws(
      () => registry.registerProvider(null),
      /Provider is required/,
      'should throw with null provider',
    );
  });

  t.test('registerProvider throws if provider lacks getType', async (t) => {
    const cache = new SystemTableCache();
    const registry = new TransportRegistry(cache);

    t.throws(
      () => registry.registerProvider({}),
      /must implement getType/,
      'should throw without getType method',
    );

    t.throws(
      () => registry.registerProvider({getType: 'not-a-function'}),
      /must implement getType/,
      'should throw if getType is not a function',
    );
  });

  t.test('registerProvider replaces existing provider of same type', async (t) => {
    const cache = new SystemTableCache();
    const registry = new TransportRegistry(cache);
    const provider1 = createMockProvider(TRANSPORT_TYPE.WEBSOCKET);
    const provider2 = createMockProvider(TRANSPORT_TYPE.WEBSOCKET);

    registry.registerProvider(provider1);
    registry.registerProvider(provider2);

    t.equal(registry.getProviderCount(), 1, 'should still have one provider');
    t.equal(registry.getProvider(TRANSPORT_TYPE.WEBSOCKET), provider2, 'should be new provider');
  });

  t.test('unregisterProvider removes provider from registry', async (t) => {
    const cache = new SystemTableCache();
    const registry = new TransportRegistry(cache);
    const provider = createMockProvider(TRANSPORT_TYPE.WEBSOCKET);

    registry.registerProvider(provider);
    t.equal(registry.getProviderCount(), 1, 'should have one provider');

    const result = registry.unregisterProvider(TRANSPORT_TYPE.WEBSOCKET);

    t.equal(result, true, 'should return true when removed');
    t.equal(registry.getProviderCount(), 0, 'should have no providers');
    t.notOk(registry.hasProvider(TRANSPORT_TYPE.WEBSOCKET), 'should not have ws provider');
  });

  t.test('unregisterProvider returns false for unknown type', async (t) => {
    const cache = new SystemTableCache();
    const registry = new TransportRegistry(cache);

    const result = registry.unregisterProvider(TRANSPORT_TYPE.NATS);

    t.equal(result, false, 'should return false for unknown type');
  });

  t.test('unregisterProvider throws without transport type', async (t) => {
    const cache = new SystemTableCache();
    const registry = new TransportRegistry(cache);

    t.throws(
      () => registry.unregisterProvider(),
      /Transport type is required/,
      'should throw without type',
    );

    t.throws(
      () => registry.unregisterProvider(''),
      /Transport type is required/,
      'should throw with empty string',
    );
  });

  t.test('getProvider returns null for unregistered type', async (t) => {
    const cache = new SystemTableCache();
    const registry = new TransportRegistry(cache);

    const result = registry.getProvider(TRANSPORT_TYPE.NATS);

    t.equal(result, null, 'should return null for unregistered type');
  });

  t.test('getRegisteredTypes returns all registered types', async (t) => {
    const cache = new SystemTableCache();
    const registry = new TransportRegistry(cache);

    registry.registerProvider(createMockProvider(TRANSPORT_TYPE.WEBSOCKET));
    registry.registerProvider(createMockProvider(TRANSPORT_TYPE.NATS));

    const types = registry.getRegisteredTypes();

    t.equal(types.length, 2, 'should have two types');
    t.ok(types.includes(TRANSPORT_TYPE.WEBSOCKET), 'should include ws');
    t.ok(types.includes(TRANSPORT_TYPE.NATS), 'should include nats');
  });

  t.test('selectEndpoint throws without nodeId', async (t) => {
    const cache = new SystemTableCache();
    const registry = new TransportRegistry(cache);

    t.throws(
      () => registry.selectEndpoint(),
      /Node ID is required/,
      'should throw without nodeId',
    );

    t.throws(
      () => registry.selectEndpoint(''),
      /Node ID is required/,
      'should throw with empty nodeId',
    );
  });

  t.test('selectEndpoint returns null when no endpoints exist', async (t) => {
    const cache = new SystemTableCache();
    const registry = new TransportRegistry(cache);
    registry.registerProvider(createMockProvider(TRANSPORT_TYPE.WEBSOCKET));

    const result = registry.selectEndpoint('unknown-node');

    t.equal(result, null, 'should return null for unknown node');
  });

  t.test('selectEndpoint returns endpoint with available provider', async (t) => {
    const cache = new SystemTableCache();
    const registry = new TransportRegistry(cache);
    registry.registerProvider(createMockProvider(TRANSPORT_TYPE.WEBSOCKET));

    const endpoint = createEndpoint({nodeId: 'node-1'});
    cache.applySystemTableChange(TABLES.NODE_ENDPOINTS, CDC_OPERATION.INSERT, endpoint);

    const result = registry.selectEndpoint('node-1');

    t.ok(result, 'should return endpoint');
    t.equal(result[COLUMN.NODE_ID], 'node-1', 'should have correct nodeId');
    t.equal(result[COLUMN.TRANSPORT_TYPE], TRANSPORT_TYPE.WEBSOCKET, 'should have correct type');
  });

  t.test('selectEndpoint returns null when provider not available', async (t) => {
    const cache = new SystemTableCache();
    const registry = new TransportRegistry(cache);
    registry.registerProvider(createMockProvider(TRANSPORT_TYPE.WEBSOCKET, false));

    const endpoint = createEndpoint({nodeId: 'node-1'});
    cache.applySystemTableChange(TABLES.NODE_ENDPOINTS, CDC_OPERATION.INSERT, endpoint);

    const result = registry.selectEndpoint('node-1');

    t.equal(result, null, 'should return null when provider unavailable');
  });

  t.test('selectEndpoint returns null when no provider registered', async (t) => {
    const cache = new SystemTableCache();
    const registry = new TransportRegistry(cache);
    // No provider registered

    const endpoint = createEndpoint({nodeId: 'node-1'});
    cache.applySystemTableChange(TABLES.NODE_ENDPOINTS, CDC_OPERATION.INSERT, endpoint);

    const result = registry.selectEndpoint('node-1');

    t.equal(result, null, 'should return null when no provider');
  });

  t.test('selectEndpoint selects lowest priority endpoint', async (t) => {
    const cache = new SystemTableCache();
    const registry = new TransportRegistry(cache);
    registry.registerProvider(createMockProvider(TRANSPORT_TYPE.WEBSOCKET));
    registry.registerProvider(createMockProvider(TRANSPORT_TYPE.NATS));

    // Add endpoints with different priorities
    cache.applySystemTableChange(TABLES.NODE_ENDPOINTS, CDC_OPERATION.INSERT, createEndpoint({
      endpointId: 'ep-high',
      nodeId: 'node-1',
      transportType: TRANSPORT_TYPE.NATS,
      priority: 10,
    }));
    cache.applySystemTableChange(TABLES.NODE_ENDPOINTS, CDC_OPERATION.INSERT, createEndpoint({
      endpointId: 'ep-low',
      nodeId: 'node-1',
      transportType: TRANSPORT_TYPE.WEBSOCKET,
      priority: 1,
    }));

    const result = registry.selectEndpoint('node-1');

    t.ok(result, 'should return endpoint');
    t.equal(result[COLUMN.ENDPOINT_ID], 'ep-low', 'should select lowest priority');
    t.equal(result[COLUMN.PRIORITY], 1, 'should have priority 1');
  });

  t.test('selectEndpoint skips unavailable providers', async (t) => {
    const cache = new SystemTableCache();
    const registry = new TransportRegistry(cache);
    registry.registerProvider(createMockProvider(TRANSPORT_TYPE.WEBSOCKET, false));
    registry.registerProvider(createMockProvider(TRANSPORT_TYPE.NATS, true));

    cache.applySystemTableChange(TABLES.NODE_ENDPOINTS, CDC_OPERATION.INSERT, createEndpoint({
      endpointId: 'ep-ws',
      nodeId: 'node-1',
      transportType: TRANSPORT_TYPE.WEBSOCKET,
      priority: 0,
    }));
    cache.applySystemTableChange(TABLES.NODE_ENDPOINTS, CDC_OPERATION.INSERT, createEndpoint({
      endpointId: 'ep-nats',
      nodeId: 'node-1',
      transportType: TRANSPORT_TYPE.NATS,
      priority: 10,
    }));

    const result = registry.selectEndpoint('node-1');

    t.ok(result, 'should return endpoint');
    t.equal(result[COLUMN.ENDPOINT_ID], 'ep-nats', 'should select available provider');
  });

  t.test('selectEndpoint ignores inactive endpoints', async (t) => {
    const cache = new SystemTableCache();
    const registry = new TransportRegistry(cache);
    registry.registerProvider(createMockProvider(TRANSPORT_TYPE.WEBSOCKET));

    cache.applySystemTableChange(TABLES.NODE_ENDPOINTS, CDC_OPERATION.INSERT, createEndpoint({
      endpointId: 'ep-inactive',
      nodeId: 'node-1',
      status: ENDPOINT_STATUS.INACTIVE,
      priority: 0,
    }));
    cache.applySystemTableChange(TABLES.NODE_ENDPOINTS, CDC_OPERATION.INSERT, createEndpoint({
      endpointId: 'ep-active',
      nodeId: 'node-1',
      status: ENDPOINT_STATUS.ACTIVE,
      priority: 10,
    }));

    const result = registry.selectEndpoint('node-1');

    t.ok(result, 'should return endpoint');
    t.equal(result[COLUMN.ENDPOINT_ID], 'ep-active', 'should select active endpoint');
  });

  t.test('getEndpointsForNode throws without nodeId', async (t) => {
    const cache = new SystemTableCache();
    const registry = new TransportRegistry(cache);

    t.throws(
      () => registry.getEndpointsForNode(),
      /Node ID is required/,
      'should throw without nodeId',
    );
  });

  t.test('getEndpointsForNode returns empty array for unknown node', async (t) => {
    const cache = new SystemTableCache();
    const registry = new TransportRegistry(cache);

    const result = registry.getEndpointsForNode('unknown-node');

    t.same(result, [], 'should return empty array');
  });

  t.test('getEndpointsForNode returns endpoints sorted by priority', async (t) => {
    const cache = new SystemTableCache();
    const registry = new TransportRegistry(cache);

    cache.applySystemTableChange(TABLES.NODE_ENDPOINTS, CDC_OPERATION.INSERT, createEndpoint({
      endpointId: 'ep-3',
      nodeId: 'node-1',
      priority: 30,
    }));
    cache.applySystemTableChange(TABLES.NODE_ENDPOINTS, CDC_OPERATION.INSERT, createEndpoint({
      endpointId: 'ep-1',
      nodeId: 'node-1',
      priority: 10,
    }));
    cache.applySystemTableChange(TABLES.NODE_ENDPOINTS, CDC_OPERATION.INSERT, createEndpoint({
      endpointId: 'ep-2',
      nodeId: 'node-1',
      priority: 20,
    }));

    const result = registry.getEndpointsForNode('node-1');

    t.equal(result.length, 3, 'should return three endpoints');
    t.equal(result[0][COLUMN.ENDPOINT_ID], 'ep-1', 'first should be lowest priority');
    t.equal(result[1][COLUMN.ENDPOINT_ID], 'ep-2', 'second should be middle priority');
    t.equal(result[2][COLUMN.ENDPOINT_ID], 'ep-3', 'third should be highest priority');
  });

  t.test('getEndpointsForNode filters by nodeId', async (t) => {
    const cache = new SystemTableCache();
    const registry = new TransportRegistry(cache);

    cache.applySystemTableChange(TABLES.NODE_ENDPOINTS, CDC_OPERATION.INSERT, createEndpoint({
      endpointId: 'ep-node1',
      nodeId: 'node-1',
    }));
    cache.applySystemTableChange(TABLES.NODE_ENDPOINTS, CDC_OPERATION.INSERT, createEndpoint({
      endpointId: 'ep-node2',
      nodeId: 'node-2',
    }));

    const result = registry.getEndpointsForNode('node-1');

    t.equal(result.length, 1, 'should return one endpoint');
    t.equal(result[0][COLUMN.ENDPOINT_ID], 'ep-node1', 'should be node-1 endpoint');
  });

  t.test('getEndpointsForNode filters out inactive endpoints', async (t) => {
    const cache = new SystemTableCache();
    const registry = new TransportRegistry(cache);

    cache.applySystemTableChange(TABLES.NODE_ENDPOINTS, CDC_OPERATION.INSERT, createEndpoint({
      endpointId: 'ep-active',
      nodeId: 'node-1',
      status: ENDPOINT_STATUS.ACTIVE,
    }));
    cache.applySystemTableChange(TABLES.NODE_ENDPOINTS, CDC_OPERATION.INSERT, createEndpoint({
      endpointId: 'ep-inactive',
      nodeId: 'node-1',
      status: ENDPOINT_STATUS.INACTIVE,
    }));

    const result = registry.getEndpointsForNode('node-1');

    t.equal(result.length, 1, 'should return one endpoint');
    t.equal(result[0][COLUMN.ENDPOINT_ID], 'ep-active', 'should be active endpoint');
  });

  t.test('registry does not cache endpoints (queries cache each time)', async (t) => {
    const cache = new SystemTableCache();
    const registry = new TransportRegistry(cache);
    registry.registerProvider(createMockProvider(TRANSPORT_TYPE.WEBSOCKET));

    // Initially no endpoints
    let result = registry.selectEndpoint('node-1');
    t.equal(result, null, 'should return null initially');

    // Add endpoint
    cache.applySystemTableChange(TABLES.NODE_ENDPOINTS, CDC_OPERATION.INSERT, createEndpoint({
      endpointId: 'ep-1',
      nodeId: 'node-1',
    }));

    // Should now find endpoint
    result = registry.selectEndpoint('node-1');
    t.ok(result, 'should find endpoint after insert');

    // Remove endpoint
    cache.applySystemTableChange(TABLES.NODE_ENDPOINTS, CDC_OPERATION.DELETE, createEndpoint({
      endpointId: 'ep-1',
      nodeId: 'node-1',
    }));

    // Should no longer find endpoint
    result = registry.selectEndpoint('node-1');
    t.equal(result, null, 'should return null after delete');
  });

  t.test('handles endpoints with null/undefined priority', async (t) => {
    const cache = new SystemTableCache();
    const registry = new TransportRegistry(cache);
    registry.registerProvider(createMockProvider(TRANSPORT_TYPE.WEBSOCKET));

    const endpointNoPriority = createEndpoint({
      endpointId: 'ep-no-priority',
      nodeId: 'node-1',
    });
    delete endpointNoPriority[COLUMN.PRIORITY];

    cache.applySystemTableChange(TABLES.NODE_ENDPOINTS, CDC_OPERATION.INSERT, endpointNoPriority);
    cache.applySystemTableChange(TABLES.NODE_ENDPOINTS, CDC_OPERATION.INSERT, createEndpoint({
      endpointId: 'ep-with-priority',
      nodeId: 'node-1',
      priority: 5,
    }));

    const result = registry.getEndpointsForNode('node-1');

    t.equal(result.length, 2, 'should return both endpoints');
    // Endpoint without priority should default to 0, so it comes first
    t.equal(result[0][COLUMN.ENDPOINT_ID], 'ep-no-priority', 'null priority defaults to 0');
  });
});
