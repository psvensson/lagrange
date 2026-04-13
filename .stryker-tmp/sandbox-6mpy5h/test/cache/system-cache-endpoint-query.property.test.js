/**
 * Property test for System Cache Endpoint Query.
 *
 * Property 8: For any node_id, the SystemTableCache SHALL provide a method
 * to retrieve all endpoints for that node from the `node_endpoints` table,
 * sorted by priority.
 *
 * **Validates: Requirements 6.6**
 *
 * **Feature: transport-abstraction-layer, Property 8: System Cache Endpoint Query**
 */
// @ts-nocheck


import {test} from '../../src/test-helpers/tap.js';
import fc from 'fast-check';
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
 * Creates an endpoint record for the node_endpoints table.
 * @param {string} nodeId - The node ID
 * @param {string} endpointId - Unique endpoint identifier
 * @param {string} transportType - The transport type
 * @param {number} priority - The endpoint priority (lower = higher preference)
 * @param {string} status - The endpoint status
 * @return {Object} Endpoint record
 */
function createEndpointRecord(nodeId, endpointId, transportType, priority, status) {
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
 * Property 8: System Cache Endpoint Query
 *
 * For any node_id, the SystemTableCache SHALL provide a method to retrieve
 * all endpoints for that node from the `node_endpoints` table, sorted by priority.
 */
test('Property 8: System Cache Endpoint Query', async (t) => {
  t.beforeEach(() => {
    initializeTestEnvironment();
  });

  t.afterEach(() => {
    cleanupTestEnvironment();
  });

  /**
   * Property: getEndpointsForNode returns only endpoints for the specified node.
   *
   * For any node_id with endpoints in the cache, getEndpointsForNode SHALL
   * return only endpoints where node_id matches the specified node.
   *
   * **Validates: Requirements 6.6**
   */
  t.test('returns only endpoints for specified node', async (t) => {
    fc.assert(
      fc.property(
        fc.uuid(),
        fc.uuid(),
        fc.array(
          fc.record({
            transportType: fc.constantFrom(...TRANSPORT_TYPES),
            priority: fc.integer({min: 0, max: 100}),
          }),
          {minLength: 1, maxLength: 5},
        ),
        fc.array(
          fc.record({
            transportType: fc.constantFrom(...TRANSPORT_TYPES),
            priority: fc.integer({min: 0, max: 100}),
          }),
          {minLength: 1, maxLength: 5},
        ),
        (nodeId1, nodeId2, node1Configs, node2Configs) => {
          // Ensure different node IDs
          if (nodeId1 === nodeId2) {
            return true; // Skip this case
          }

          const cache = new SystemTableCache();

          // Add endpoints for node1
          node1Configs.forEach((config, index) => {
            const endpoint = createEndpointRecord(
              nodeId1,
              `ep-${nodeId1}-${index}`,
              config.transportType,
              config.priority,
              ENDPOINT_STATUS.ACTIVE,
            );
            addEndpointToCache(cache, endpoint);
          });

          // Add endpoints for node2
          node2Configs.forEach((config, index) => {
            const endpoint = createEndpointRecord(
              nodeId2,
              `ep-${nodeId2}-${index}`,
              config.transportType,
              config.priority,
              ENDPOINT_STATUS.ACTIVE,
            );
            addEndpointToCache(cache, endpoint);
          });

          // Query endpoints for node1
          const endpoints = cache.getEndpointsForNode(nodeId1);

          // Verify all returned endpoints belong to node1
          const allBelongToNode1 = endpoints.every(
            (ep) => ep[COLUMN.NODE_ID] === nodeId1,
          );

          // Verify count matches expected
          const correctCount = endpoints.length === node1Configs.length;

          return allBelongToNode1 && correctCount;
        },
      ),
      {numRuns: 10},
    );

    t.pass('returns only endpoints for specified node');
  });

  /**
   * Property: getEndpointsForNode returns endpoints sorted by priority ascending.
   *
   * For any node with multiple endpoints, getEndpointsForNode SHALL return
   * endpoints sorted by priority in ascending order (lower value = higher preference).
   *
   * **Validates: Requirements 6.6**
   */
  t.test('returns endpoints sorted by priority ascending', async (t) => {
    fc.assert(
      fc.property(
        fc.uuid(),
        fc.array(
          fc.record({
            transportType: fc.constantFrom(...TRANSPORT_TYPES),
            priority: fc.integer({min: 0, max: 100}),
          }),
          {minLength: 2, maxLength: 10},
        ),
        (nodeId, endpointConfigs) => {
          const cache = new SystemTableCache();

          // Add endpoints in random order
          endpointConfigs.forEach((config, index) => {
            const endpoint = createEndpointRecord(
              nodeId,
              `ep-${nodeId}-${index}`,
              config.transportType,
              config.priority,
              ENDPOINT_STATUS.ACTIVE,
            );
            addEndpointToCache(cache, endpoint);
          });

          // Query endpoints
          const endpoints = cache.getEndpointsForNode(nodeId);

          // Verify sorted by priority ascending
          for (let i = 1; i < endpoints.length; i++) {
            const prevPriority = endpoints[i - 1][COLUMN.PRIORITY] ?? 0;
            const currPriority = endpoints[i][COLUMN.PRIORITY] ?? 0;
            if (prevPriority > currPriority) {
              return false;
            }
          }

          return true;
        },
      ),
      {numRuns: 10},
    );

    t.pass('returns endpoints sorted by priority ascending');
  });

  /**
   * Property: getEndpointsForNode returns empty array for non-existent node.
   *
   * For any node_id with no endpoints in the cache, getEndpointsForNode
   * SHALL return an empty array.
   *
   * **Validates: Requirements 6.6**
   */
  t.test('returns empty array for non-existent node', async (t) => {
    fc.assert(
      fc.property(
        fc.uuid(),
        fc.uuid(),
        fc.array(
          fc.record({
            transportType: fc.constantFrom(...TRANSPORT_TYPES),
            priority: fc.integer({min: 0, max: 100}),
          }),
          {minLength: 0, maxLength: 5},
        ),
        (queryNodeId, otherNodeId, otherNodeConfigs) => {
          // Ensure different node IDs
          if (queryNodeId === otherNodeId) {
            return true; // Skip this case
          }

          const cache = new SystemTableCache();

          // Add endpoints for a different node
          otherNodeConfigs.forEach((config, index) => {
            const endpoint = createEndpointRecord(
              otherNodeId,
              `ep-${otherNodeId}-${index}`,
              config.transportType,
              config.priority,
              ENDPOINT_STATUS.ACTIVE,
            );
            addEndpointToCache(cache, endpoint);
          });

          // Query endpoints for node that has no endpoints
          const endpoints = cache.getEndpointsForNode(queryNodeId);

          return Array.isArray(endpoints) && endpoints.length === 0;
        },
      ),
      {numRuns: 10},
    );

    t.pass('returns empty array for non-existent node');
  });

  /**
   * Property: getEndpointsForNode handles missing priority as zero.
   *
   * For any endpoint without a priority field, getEndpointsForNode SHALL
   * treat the missing priority as 0 for sorting purposes.
   *
   * **Validates: Requirements 6.6**
   */
  t.test('handles missing priority as zero', async (t) => {
    fc.assert(
      fc.property(
        fc.uuid(),
        fc.integer({min: 1, max: 100}),
        (nodeId, explicitPriority) => {
          const cache = new SystemTableCache();

          // Add endpoint with explicit priority
          const endpointWithPriority = createEndpointRecord(
            nodeId,
            `ep-${nodeId}-with-priority`,
            TRANSPORT_TYPE.WEBSOCKET,
            explicitPriority,
            ENDPOINT_STATUS.ACTIVE,
          );
          addEndpointToCache(cache, endpointWithPriority);

          // Add endpoint without priority field
          const endpointWithoutPriority = {
            [COLUMN.ENDPOINT_ID]: `ep-${nodeId}-no-priority`,
            [COLUMN.NODE_ID]: nodeId,
            [COLUMN.TRANSPORT_TYPE]: TRANSPORT_TYPE.NATS,
            [COLUMN.ADDRESS]: 'nats://test-address',
            [COLUMN.METADATA]: '{}',
            [COLUMN.STATUS]: ENDPOINT_STATUS.ACTIVE,
            [COLUMN.CREATED_AT]: Date.now(),
            [COLUMN.UPDATED_AT]: Date.now(),
          };
          addEndpointToCache(cache, endpointWithoutPriority);

          // Query endpoints
          const endpoints = cache.getEndpointsForNode(nodeId);

          // Endpoint without priority should come first (treated as 0)
          // since explicitPriority is >= 1
          return endpoints.length === 2 &&
                 endpoints[0][COLUMN.ENDPOINT_ID] === `ep-${nodeId}-no-priority`;
        },
      ),
      {numRuns: 10},
    );

    t.pass('handles missing priority as zero');
  });

  /**
   * Property: filterEndpointsByStatus correctly filters by status.
   *
   * For any array of endpoints with mixed statuses, filterEndpointsByStatus
   * SHALL return only endpoints matching the specified status.
   *
   * **Validates: Requirements 6.6**
   */
  t.test('filterEndpointsByStatus correctly filters by status', async (t) => {
    fc.assert(
      fc.property(
        fc.array(
          fc.record({
            endpointId: fc.uuid(),
            status: fc.constantFrom(ENDPOINT_STATUS.ACTIVE, ENDPOINT_STATUS.INACTIVE),
          }),
          {minLength: 1, maxLength: 10},
        ),
        fc.constantFrom(ENDPOINT_STATUS.ACTIVE, ENDPOINT_STATUS.INACTIVE),
        (endpointConfigs, filterStatus) => {
          const cache = new SystemTableCache();

          // Create endpoint objects
          const endpoints = endpointConfigs.map((config) => ({
            [COLUMN.ENDPOINT_ID]: config.endpointId,
            [COLUMN.STATUS]: config.status,
          }));

          // Filter endpoints
          const filtered = cache.filterEndpointsByStatus(endpoints, filterStatus);

          // Count expected matches
          const expectedCount = endpointConfigs.filter(
            (c) => c.status === filterStatus,
          ).length;

          // Verify all filtered endpoints have the correct status
          const allMatchStatus = filtered.every(
            (ep) => ep[COLUMN.STATUS] === filterStatus,
          );

          return filtered.length === expectedCount && allMatchStatus;
        },
      ),
      {numRuns: 10},
    );

    t.pass('filterEndpointsByStatus correctly filters by status');
  });

  /**
   * Property: filterEndpointsByStatus returns empty array for invalid input.
   *
   * For any non-array input, filterEndpointsByStatus SHALL return an empty array.
   *
   * **Validates: Requirements 6.6**
   */
  t.test('filterEndpointsByStatus returns empty for invalid input', async (t) => {
    fc.assert(
      fc.property(
        fc.oneof(
          fc.constant(null),
          fc.constant(undefined),
          fc.string(),
          fc.integer(),
          fc.object(),
        ),
        fc.constantFrom(ENDPOINT_STATUS.ACTIVE, ENDPOINT_STATUS.INACTIVE),
        (invalidInput, status) => {
          const cache = new SystemTableCache();

          const result = cache.filterEndpointsByStatus(invalidInput, status);

          return Array.isArray(result) && result.length === 0;
        },
      ),
      {numRuns: 10},
    );

    t.pass('filterEndpointsByStatus returns empty for invalid input');
  });

  /**
   * Property: getEndpointsForNode returns all endpoints regardless of status.
   *
   * For any node with endpoints of mixed statuses, getEndpointsForNode SHALL
   * return all endpoints (both active and inactive), sorted by priority.
   *
   * **Validates: Requirements 6.6**
   */
  t.test('returns all endpoints regardless of status', async (t) => {
    fc.assert(
      fc.property(
        fc.uuid(),
        fc.array(
          fc.record({
            transportType: fc.constantFrom(...TRANSPORT_TYPES),
            priority: fc.integer({min: 0, max: 100}),
            status: fc.constantFrom(ENDPOINT_STATUS.ACTIVE, ENDPOINT_STATUS.INACTIVE),
          }),
          {minLength: 2, maxLength: 8},
        ),
        (nodeId, endpointConfigs) => {
          const cache = new SystemTableCache();

          // Add endpoints with mixed statuses
          endpointConfigs.forEach((config, index) => {
            const endpoint = createEndpointRecord(
              nodeId,
              `ep-${nodeId}-${index}`,
              config.transportType,
              config.priority,
              config.status,
            );
            addEndpointToCache(cache, endpoint);
          });

          // Query endpoints
          const endpoints = cache.getEndpointsForNode(nodeId);

          // Should return all endpoints regardless of status
          return endpoints.length === endpointConfigs.length;
        },
      ),
      {numRuns: 10},
    );

    t.pass('returns all endpoints regardless of status');
  });

  /**
   * Property: Endpoint retrieval is consistent after CDC operations.
   *
   * For any sequence of INSERT operations, getEndpointsForNode SHALL
   * consistently return all inserted endpoints for the node.
   *
   * **Validates: Requirements 6.6**
   */
  t.test('endpoint retrieval consistent after CDC operations', async (t) => {
    fc.assert(
      fc.property(
        fc.uuid(),
        fc.array(
          fc.record({
            transportType: fc.constantFrom(...TRANSPORT_TYPES),
            priority: fc.integer({min: 0, max: 100}),
          }),
          {minLength: 1, maxLength: 6},
        ),
        (nodeId, endpointConfigs) => {
          const cache = new SystemTableCache();

          // Insert endpoints one by one
          endpointConfigs.forEach((config, index) => {
            const endpoint = createEndpointRecord(
              nodeId,
              `ep-${nodeId}-${index}`,
              config.transportType,
              config.priority,
              ENDPOINT_STATUS.ACTIVE,
            );
            addEndpointToCache(cache, endpoint);

            // Verify count after each insert
            const currentEndpoints = cache.getEndpointsForNode(nodeId);
            if (currentEndpoints.length !== index + 1) {
              return false;
            }
          });

          // Final verification
          const finalEndpoints = cache.getEndpointsForNode(nodeId);
          return finalEndpoints.length === endpointConfigs.length;
        },
      ),
      {numRuns: 10},
    );

    t.pass('endpoint retrieval consistent after CDC operations');
  });
});
