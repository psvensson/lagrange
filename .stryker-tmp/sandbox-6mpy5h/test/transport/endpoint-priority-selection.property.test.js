/**
 * Property test for Endpoint Priority Selection.
 *
 * Property 4: For any node with multiple endpoints in the `node_endpoints` table,
 * the TransportRegistry.selectEndpoint() SHALL return the endpoint with the
 * lowest priority value among those with available providers.
 *
 * **Validates: Requirements 3.5**
 *
 * **Feature: transport-abstraction-layer, Property 4: Endpoint Priority Selection**
 */
// @ts-nocheck


import {test} from '../../src/test-helpers/tap.js';
import fc from 'fast-check';
import {TransportRegistry} from '../../src/transport/transport-registry.js';
import {TransportProvider} from '../../src/transport/transport-provider.js';
import {SystemTableCache} from '../../src/cache/system-table-cache.js';
import {ConfigurationManager} from '../../src/config/configuration-manager.js';
import {LoggingService} from '../../src/logging/logging-service.js';
import {
  CDC_OPERATION,
  COLUMN,
  ENDPOINT_STATUS,
  TABLES,
  TRANSPORT_TYPE,
} from '../../src/constants/index.js';

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
 * Creates an endpoint record for the node_endpoints table.
 * @param {string} nodeId - The node ID
 * @param {string} transportType - The transport type
 * @param {number} priority - The endpoint priority (lower = higher preference)
 * @param {string} status - The endpoint status
 * @return {Object} Endpoint record
 */
function createEndpointRecord(nodeId, transportType, priority, status) {
  const endpointId = `ep-${nodeId}-${transportType}-${priority}`;
  return {
    [COLUMN.ENDPOINT_ID]: endpointId,
    [COLUMN.NODE_ID]: nodeId,
    [COLUMN.TRANSPORT_TYPE]: transportType,
    [COLUMN.ADDRESS]: `${transportType}://test-address:${priority}`,
    [COLUMN.PRIORITY]: priority,
    [COLUMN.METADATA]: '{}',
    [COLUMN.STATUS]: status,
    [COLUMN.CREATED_AT]: Date.now(),
    [COLUMN.UPDATED_AT]: Date.now(),
  };
}

/**
 * Adds an endpoint to the system table cache.
 * @param {SystemTableCache} cache - The cache instance
 * @param {Object} endpoint - The endpoint record
 */
function addEndpointToCache(cache, endpoint) {
  cache.applySystemTableChange(
    TABLES.NODE_ENDPOINTS,
    CDC_OPERATION.INSERT,
    endpoint,
  );
}

/**
 * Feature: transport-abstraction-layer
 * Property 4: Endpoint Priority Selection
 *
 * For any node with multiple endpoints in the `node_endpoints` table,
 * the TransportRegistry.selectEndpoint() SHALL return the endpoint with
 * the lowest priority value among those with available providers.
 */
test('Property 4: Endpoint Priority Selection', async (t) => {
  t.beforeEach(() => {
    initializeTestEnvironment();
  });

  t.afterEach(() => {
    cleanupTestEnvironment();
  });

  /**
   * Property: Lowest priority endpoint is selected when all providers available.
   *
   * For any node with multiple endpoints of different priorities, when all
   * transport providers are available, selectEndpoint SHALL return the
   * endpoint with the lowest priority value.
   *
   * **Validates: Requirements 3.5**
   */
  t.test('lowest priority endpoint selected when all providers available',
    async (t) => {
      // Generate unique priority values to ensure clear ordering
      const priorityArb = fc.uniqueArray(
        fc.integer({min: 0, max: 100}),
        {minLength: 2, maxLength: 5},
      );

      fc.assert(
        fc.property(
          fc.uuid(),
          priorityArb,
          (nodeId, priorities) => {
            const cache = new SystemTableCache();
            const registry = new TransportRegistry(cache);

            // Register all providers as available
            for (const transportType of TRANSPORT_TYPES) {
              registry.registerProvider(createMockProvider(transportType, true));
            }

            // Create endpoints with different priorities
            const endpoints = priorities.map((priority, index) => {
              const transportType = TRANSPORT_TYPES[index % TRANSPORT_TYPES.length];
              return createEndpointRecord(
                nodeId,
                transportType,
                priority,
                ENDPOINT_STATUS.ACTIVE,
              );
            });

            // Add all endpoints to cache
            for (const endpoint of endpoints) {
              addEndpointToCache(cache, endpoint);
            }

            // Select endpoint
            const selected = registry.selectEndpoint(nodeId);

            // Find the expected lowest priority
            const lowestPriority = Math.min(...priorities);

            // Verify the selected endpoint has the lowest priority
            return selected !== null &&
                   selected[COLUMN.PRIORITY] === lowestPriority;
          },
        ),
        {numRuns: 10},
      );

      t.pass('lowest priority endpoint selected when all providers available');
    });

  /**
   * Property: Lowest priority endpoint with available provider is selected.
   *
   * For any node with multiple endpoints where some providers are unavailable,
   * selectEndpoint SHALL return the endpoint with the lowest priority value
   * among those with available providers.
   *
   * **Validates: Requirements 3.5**
   */
  t.test('lowest priority endpoint with available provider selected',
    async (t) => {
      fc.assert(
        fc.property(
          fc.uuid(),
          fc.array(
            fc.record({
              transportType: fc.constantFrom(...TRANSPORT_TYPES),
              priority: fc.integer({min: 0, max: 100}),
              providerAvailable: fc.boolean(),
            }),
            {minLength: 2, maxLength: 6},
          ),
          (nodeId, endpointConfigs) => {
            const cache = new SystemTableCache();
            const registry = new TransportRegistry(cache);

            // Track which transport types have available providers
            const availableTypes = new Set();

            // Register providers based on config
            for (const config of endpointConfigs) {
              if (config.providerAvailable) {
                availableTypes.add(config.transportType);
              }
            }

            // Register providers
            for (const transportType of TRANSPORT_TYPES) {
              const available = availableTypes.has(transportType);
              registry.registerProvider(createMockProvider(transportType, available));
            }

            // Create and add endpoints with unique IDs
            const endpoints = endpointConfigs.map((config, _index) =>
              createEndpointRecord(
                nodeId,
                config.transportType,
                config.priority,
                ENDPOINT_STATUS.ACTIVE,
              ),
            );

            // Make endpoint IDs unique by adding index
            endpoints.forEach((ep, idx) => {
              ep[COLUMN.ENDPOINT_ID] = `${ep[COLUMN.ENDPOINT_ID]}-${idx}`;
            });

            for (const endpoint of endpoints) {
              addEndpointToCache(cache, endpoint);
            }

            // Select endpoint
            const selected = registry.selectEndpoint(nodeId);

            // Find endpoints with available providers
            const availableEndpoints = endpointConfigs.filter(
              (config) => availableTypes.has(config.transportType),
            );

            if (availableEndpoints.length === 0) {
              // No available providers, should return null
              return selected === null;
            }

            // Find the lowest priority among available endpoints
            const lowestAvailablePriority = Math.min(
              ...availableEndpoints.map((e) => e.priority),
            );

            // Verify selected endpoint has lowest priority among available
            return selected !== null &&
                   selected[COLUMN.PRIORITY] === lowestAvailablePriority &&
                   availableTypes.has(selected[COLUMN.TRANSPORT_TYPE]);
          },
        ),
        {numRuns: 10},
      );

      t.pass('lowest priority endpoint with available provider selected');
    });

  /**
   * Property: Inactive endpoints are not selected.
   *
   * For any node with both active and inactive endpoints, selectEndpoint
   * SHALL only consider active endpoints for selection.
   *
   * **Validates: Requirements 3.5**
   */
  t.test('inactive endpoints are not selected', async (t) => {
    fc.assert(
      fc.property(
        fc.uuid(),
        fc.array(
          fc.record({
            transportType: fc.constantFrom(...TRANSPORT_TYPES),
            priority: fc.integer({min: 0, max: 100}),
            status: fc.constantFrom(ENDPOINT_STATUS.ACTIVE, ENDPOINT_STATUS.INACTIVE),
          }),
          {minLength: 2, maxLength: 6},
        ),
        (nodeId, endpointConfigs) => {
          const cache = new SystemTableCache();
          const registry = new TransportRegistry(cache);

          // Register all providers as available
          for (const transportType of TRANSPORT_TYPES) {
            registry.registerProvider(createMockProvider(transportType, true));
          }

          // Create and add endpoints
          endpointConfigs.forEach((config, index) => {
            const endpoint = createEndpointRecord(
              nodeId,
              config.transportType,
              config.priority,
              config.status,
            );
            endpoint[COLUMN.ENDPOINT_ID] = `ep-${nodeId}-${index}`;
            addEndpointToCache(cache, endpoint);
          });

          // Select endpoint
          const selected = registry.selectEndpoint(nodeId);

          // Find active endpoints
          const activeEndpoints = endpointConfigs.filter(
            (config) => config.status === ENDPOINT_STATUS.ACTIVE,
          );

          if (activeEndpoints.length === 0) {
            // No active endpoints, should return null
            return selected === null;
          }

          // Find lowest priority among active endpoints
          const lowestActivePriority = Math.min(
            ...activeEndpoints.map((e) => e.priority),
          );

          // Verify selected endpoint is active and has lowest priority
          return selected !== null &&
                 selected[COLUMN.STATUS] === ENDPOINT_STATUS.ACTIVE &&
                 selected[COLUMN.PRIORITY] === lowestActivePriority;
        },
      ),
      {numRuns: 10},
    );

    t.pass('inactive endpoints are not selected');
  });

  /**
   * Property: Returns null when no endpoints exist for node.
   *
   * For any node with no endpoints in the cache, selectEndpoint SHALL
   * return null.
   *
   * **Validates: Requirements 3.5**
   */
  t.test('returns null when no endpoints exist for node', async (t) => {
    fc.assert(
      fc.property(
        fc.uuid(),
        (nodeId) => {
          const cache = new SystemTableCache();
          const registry = new TransportRegistry(cache);

          // Register all providers as available
          for (const transportType of TRANSPORT_TYPES) {
            registry.registerProvider(createMockProvider(transportType, true));
          }

          // Don't add any endpoints for this node
          const selected = registry.selectEndpoint(nodeId);

          return selected === null;
        },
      ),
      {numRuns: 10},
    );

    t.pass('returns null when no endpoints exist for node');
  });

  /**
   * Property: Returns null when no providers are available.
   *
   * For any node with endpoints but no available providers, selectEndpoint
   * SHALL return null.
   *
   * **Validates: Requirements 3.5**
   */
  t.test('returns null when no providers are available', async (t) => {
    fc.assert(
      fc.property(
        fc.uuid(),
        fc.array(
          fc.record({
            transportType: fc.constantFrom(...TRANSPORT_TYPES),
            priority: fc.integer({min: 0, max: 100}),
          }),
          {minLength: 1, maxLength: 5},
        ),
        (nodeId, endpointConfigs) => {
          const cache = new SystemTableCache();
          const registry = new TransportRegistry(cache);

          // Register all providers as unavailable
          for (const transportType of TRANSPORT_TYPES) {
            registry.registerProvider(createMockProvider(transportType, false));
          }

          // Create and add endpoints
          endpointConfigs.forEach((config, index) => {
            const endpoint = createEndpointRecord(
              nodeId,
              config.transportType,
              config.priority,
              ENDPOINT_STATUS.ACTIVE,
            );
            endpoint[COLUMN.ENDPOINT_ID] = `ep-${nodeId}-${index}`;
            addEndpointToCache(cache, endpoint);
          });

          // Select endpoint
          const selected = registry.selectEndpoint(nodeId);

          return selected === null;
        },
      ),
      {numRuns: 10},
    );

    t.pass('returns null when no providers are available');
  });

  /**
   * Property: Selection is deterministic for same priority values.
   *
   * For any node with multiple endpoints having the same lowest priority,
   * selectEndpoint SHALL consistently return one of them (deterministic).
   *
   * **Validates: Requirements 3.5**
   */
  t.test('selection is deterministic for same priority values', async (t) => {
    fc.assert(
      fc.property(
        fc.uuid(),
        fc.integer({min: 0, max: 100}),
        (nodeId, sharedPriority) => {
          const cache = new SystemTableCache();
          const registry = new TransportRegistry(cache);

          // Register all providers as available
          for (const transportType of TRANSPORT_TYPES) {
            registry.registerProvider(createMockProvider(transportType, true));
          }

          // Create multiple endpoints with the same priority
          TRANSPORT_TYPES.forEach((transportType, index) => {
            const endpoint = createEndpointRecord(
              nodeId,
              transportType,
              sharedPriority,
              ENDPOINT_STATUS.ACTIVE,
            );
            endpoint[COLUMN.ENDPOINT_ID] = `ep-${nodeId}-${index}`;
            addEndpointToCache(cache, endpoint);
          });

          // Select endpoint multiple times
          const selected1 = registry.selectEndpoint(nodeId);
          const selected2 = registry.selectEndpoint(nodeId);
          const selected3 = registry.selectEndpoint(nodeId);

          // All selections should return the same endpoint
          return selected1 !== null &&
                 selected1[COLUMN.ENDPOINT_ID] === selected2[COLUMN.ENDPOINT_ID] &&
                 selected2[COLUMN.ENDPOINT_ID] === selected3[COLUMN.ENDPOINT_ID] &&
                 selected1[COLUMN.PRIORITY] === sharedPriority;
        },
      ),
      {numRuns: 10},
    );

    t.pass('selection is deterministic for same priority values');
  });

  /**
   * Property: Only endpoints for the specified node are considered.
   *
   * For any two nodes with different endpoints, selectEndpoint for one node
   * SHALL NOT return endpoints belonging to the other node.
   *
   * **Validates: Requirements 3.5**
   */
  t.test('only endpoints for specified node are considered', async (t) => {
    fc.assert(
      fc.property(
        fc.uuid(),
        fc.uuid(),
        fc.integer({min: 0, max: 50}),
        fc.integer({min: 51, max: 100}),
        (nodeId1, nodeId2, priority1, priority2) => {
          // Ensure different node IDs
          if (nodeId1 === nodeId2) {
            return true; // Skip this case
          }

          const cache = new SystemTableCache();
          const registry = new TransportRegistry(cache);

          // Register all providers as available
          for (const transportType of TRANSPORT_TYPES) {
            registry.registerProvider(createMockProvider(transportType, true));
          }

          // Add endpoint for node1 with higher priority value (lower preference)
          const endpoint1 = createEndpointRecord(
            nodeId1,
            TRANSPORT_TYPE.WEBSOCKET,
            priority2, // Higher value = lower preference
            ENDPOINT_STATUS.ACTIVE,
          );
          addEndpointToCache(cache, endpoint1);

          // Add endpoint for node2 with lower priority value (higher preference)
          const endpoint2 = createEndpointRecord(
            nodeId2,
            TRANSPORT_TYPE.NATS,
            priority1, // Lower value = higher preference
            ENDPOINT_STATUS.ACTIVE,
          );
          addEndpointToCache(cache, endpoint2);

          // Select endpoint for node1
          const selected = registry.selectEndpoint(nodeId1);

          // Should return node1's endpoint, not node2's
          return selected !== null &&
                 selected[COLUMN.NODE_ID] === nodeId1 &&
                 selected[COLUMN.PRIORITY] === priority2;
        },
      ),
      {numRuns: 10},
    );

    t.pass('only endpoints for specified node are considered');
  });
});
