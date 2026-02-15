/**
 * Property test for Node Identity Separation from Endpoints.
 * Property 1: For any node registration, the node_id stored in the `nodes` table
 * SHALL be a UUID containing no transport-specific patterns (ws://, nats://, etc.),
 * and all transport addresses SHALL be stored only in the `node_endpoints` table.
 *
 * Validates: Requirements 1.1, 1.2, 1.3
 *
 * Feature: transport-abstraction-layer
 * Property 1: Node Identity Separation from Endpoints
 */

import {test} from '../../src/test-helpers/tap.js';
import fc from 'fast-check';
import {NodeJoiningService} from '../../src/bootstrap/node-joining-service.js';
import {ConfigurationManager} from '../../src/config/configuration-manager.js';
import {LoggingService} from '../../src/logging/logging-service.js';
import {
  TABLES,
  TRANSPORT_TYPE,
  ENDPOINT_STATUS,
} from '../../src/constants/index.js';

// Initialize once at module level
ConfigurationManager.resetInstance();
LoggingService.resetInstance();
const config = ConfigurationManager.getInstance();
config.initialize({node: {id: 'test-node'}, logging: {level: 'error'}});
const logging = LoggingService.getInstance();
logging.initialize({level: 'error'});

/**
 * Create a CDC mock that supports both SQL execution and
 * table upsert calls used by node storage budget setup.
 * @param {Object} mockQueryEngine
 * @return {Object}
 */
function createMockCDCService(mockQueryEngine) {
  return {
    sqlQueryEngine: mockQueryEngine,
    async upsertSystemTableRow(tableName, rowData) {
      const columns = Object.keys(rowData);
      const placeholders = columns.map(() => '?').join(', ');
      const sql = `INSERT INTO ${tableName} (${columns.join(', ')})` +
        ` VALUES (${placeholders})`;
      const params = columns.map((column) => rowData[column]);
      return mockQueryEngine.executeQuery(sql, params);
    },
  };
}

// Transport-specific patterns that should NOT appear in node_id
const TRANSPORT_PATTERNS = [
  /^ws:\/\//i,
  /^wss:\/\//i,
  /^nats:\/\//i,
  /^veilid:\/\//i,
  /^http:\/\//i,
  /^https:\/\//i,
  /:\d+$/, // Port number at end
  /\d+\.\d+\.\d+\.\d+/, // IP address
];

/**
 * Check if a string contains transport-specific patterns.
 * @param {string} str - String to check.
 * @return {boolean} True if contains transport patterns.
 */
function containsTransportPattern(str) {
  if (!str || typeof str !== 'string') {
    return false;
  }
  return TRANSPORT_PATTERNS.some((pattern) => pattern.test(str));
}

/**
 * Check if a string is a valid UUID format.
 * @param {string} str - String to check.
 * @return {boolean} True if valid UUID format.
 */
function isValidUUID(str) {
  if (!str || typeof str !== 'string') {
    return false;
  }
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  return uuidRegex.test(str);
}

/**
 * Feature: transport-abstraction-layer
 * Property 1: Node Identity Separation from Endpoints
 *
 * For any node registration, the node_id stored in the `nodes` table SHALL be
 * a UUID containing no transport-specific patterns (ws://, nats://, etc.),
 * and all transport addresses SHALL be stored only in the `node_endpoints` table.
 *
 * **Validates: Requirements 1.1, 1.2, 1.3**
 */
test('Property 1: Node Identity Separation from Endpoints', async (t) => {
  /**
   * Property: node_id is a UUID with no transport information.
   * **Validates: Requirements 1.1**
   */
  t.test('node_id is a UUID with no transport information', async (t) => {
    await fc.assert(
      fc.asyncProperty(
        fc.uuid(),
        fc.integer({min: 8000, max: 9999}),
        async (nodeId, port) => {
          const nodeAddress = `ws://localhost:${port}`;
          const executedQueries = [];

          const mockQueryEngine = {
            executeQuery: async (sql, params) => {
              executedQueries.push({sql, params});
              return {success: true};
            },
          };

          const mockCDCService = createMockCDCService(mockQueryEngine);

          const service = new NodeJoiningService({
            nodeId,
            nodeAddress,
            seedNodeAddress: 'ws://seed:8000',
          });
          service.cdcIntegrationService = mockCDCService;

          await service.registerNodeInCluster();

          // Find the nodes table INSERT
          const nodesQuery = executedQueries.find((q) =>
            q.sql.includes('INSERT INTO nodes'),
          );

          // node_id should be a valid UUID
          const registeredNodeId = nodesQuery.params[0];
          const isUUID = isValidUUID(registeredNodeId);

          // node_id should NOT contain transport patterns
          const hasTransportPattern = containsTransportPattern(registeredNodeId);

          return isUUID && !hasTransportPattern;
        },
      ),
      {numRuns: 10},
    );

    t.pass('node_id is a UUID with no transport information');
  });

  /**
   * Property: Transport addresses are stored only in node_endpoints table.
   * **Validates: Requirements 1.2, 1.3**
   */
  t.test('transport addresses stored only in node_endpoints table', async (t) => {
    await fc.assert(
      fc.asyncProperty(
        fc.uuid(),
        fc.constantFrom('ws', 'wss'),
        fc.constantFrom('localhost', '127.0.0.1', '192.168.1.1'),
        fc.integer({min: 8000, max: 9999}),
        async (nodeId, protocol, host, port) => {
          const nodeAddress = `${protocol}://${host}:${port}`;
          const executedQueries = [];

          const mockQueryEngine = {
            executeQuery: async (sql, params) => {
              executedQueries.push({sql, params});
              return {success: true};
            },
          };

          const mockCDCService = createMockCDCService(mockQueryEngine);

          const service = new NodeJoiningService({
            nodeId,
            nodeAddress,
            seedNodeAddress: 'ws://seed:8000',
          });
          service.cdcIntegrationService = mockCDCService;

          await service.registerNodeInCluster();

          // Find the node_endpoints table INSERT
          const endpointQuery = executedQueries.find((q) =>
            q.sql.includes(`INSERT INTO ${TABLES.NODE_ENDPOINTS}`),
          );

          // Endpoint should exist
          if (!endpointQuery) {
            return false;
          }

          // Address should be in node_endpoints table
          const endpointAddress = endpointQuery.params[3];
          const addressMatches = endpointAddress === nodeAddress;

          // Transport type should be set
          const transportType = endpointQuery.params[2];
          const hasTransportType = transportType === TRANSPORT_TYPE.WEBSOCKET;

          return addressMatches && hasTransportType;
        },
      ),
      {numRuns: 10},
    );

    t.pass('transport addresses stored only in node_endpoints table');
  });

  /**
   * Property: Each node has at least one endpoint after registration.
   * **Validates: Requirements 1.3, 1.4**
   */
  t.test('each node has at least one endpoint after registration', async (t) => {
    await fc.assert(
      fc.asyncProperty(
        fc.uuid(),
        fc.integer({min: 8000, max: 9999}),
        async (nodeId, port) => {
          const nodeAddress = `ws://localhost:${port}`;
          const executedQueries = [];

          const mockQueryEngine = {
            executeQuery: async (sql, params) => {
              executedQueries.push({sql, params});
              return {success: true};
            },
          };

          const mockCDCService = createMockCDCService(mockQueryEngine);

          const service = new NodeJoiningService({
            nodeId,
            nodeAddress,
            seedNodeAddress: 'ws://seed:8000',
          });
          service.cdcIntegrationService = mockCDCService;

          await service.registerNodeInCluster();

          // Count endpoint INSERTs for this node
          const endpointQueries = executedQueries.filter((q) =>
            q.sql.includes(`INSERT INTO ${TABLES.NODE_ENDPOINTS}`) &&
            q.params[1] === nodeId,
          );

          // Should have at least one endpoint
          return endpointQueries.length >= 1;
        },
      ),
      {numRuns: 10},
    );

    t.pass('each node has at least one endpoint after registration');
  });

  /**
   * Property: Endpoint has correct structure with all required fields.
   * **Validates: Requirements 1.5**
   */
  t.test('endpoint has correct structure with all required fields', async (t) => {
    await fc.assert(
      fc.asyncProperty(
        fc.uuid(),
        fc.integer({min: 8000, max: 9999}),
        async (nodeId, port) => {
          const nodeAddress = `ws://localhost:${port}`;
          const executedQueries = [];

          const mockQueryEngine = {
            executeQuery: async (sql, params) => {
              executedQueries.push({sql, params});
              return {success: true};
            },
          };

          const mockCDCService = createMockCDCService(mockQueryEngine);

          const service = new NodeJoiningService({
            nodeId,
            nodeAddress,
            seedNodeAddress: 'ws://seed:8000',
          });
          service.cdcIntegrationService = mockCDCService;

          await service.registerNodeInCluster();

          // Find the node_endpoints table INSERT
          const endpointQuery = executedQueries.find((q) =>
            q.sql.includes(`INSERT INTO ${TABLES.NODE_ENDPOINTS}`),
          );

          if (!endpointQuery) {
            return false;
          }

          const params = endpointQuery.params;

          // Check all required fields are present
          const hasEndpointId = typeof params[0] === 'string' && params[0].length > 0;
          const hasNodeId = params[1] === nodeId;
          const hasTransportType = params[2] === TRANSPORT_TYPE.WEBSOCKET;
          const hasAddress = params[3] === nodeAddress;
          const hasPriority = typeof params[4] === 'number';
          const hasMetadata = typeof params[5] === 'string';
          const hasStatus = params[6] === ENDPOINT_STATUS.ACTIVE;
          const hasCreatedAt = typeof params[7] === 'number';
          const hasUpdatedAt = typeof params[8] === 'number';

          return hasEndpointId && hasNodeId && hasTransportType && hasAddress &&
                 hasPriority && hasMetadata && hasStatus && hasCreatedAt && hasUpdatedAt;
        },
      ),
      {numRuns: 10},
    );

    t.pass('endpoint has correct structure with all required fields');
  });

  /**
   * Property: Node identity remains unchanged when endpoints change.
   * **Validates: Requirements 1.6**
   */
  t.test('node identity remains unchanged when endpoints change', async (t) => {
    await fc.assert(
      fc.asyncProperty(
        fc.uuid(),
        fc.array(fc.integer({min: 8000, max: 9999}), {minLength: 2, maxLength: 3}),
        async (nodeId, ports) => {
          const executedQueries = [];

          const mockQueryEngine = {
            executeQuery: async (sql, params) => {
              executedQueries.push({sql, params});
              return {success: true};
            },
          };

          const mockCDCService = createMockCDCService(mockQueryEngine);

          // Register node with first address
          const service1 = new NodeJoiningService({
            nodeId,
            nodeAddress: `ws://localhost:${ports[0]}`,
            seedNodeAddress: 'ws://seed:8000',
          });
          service1.cdcIntegrationService = mockCDCService;
          await service1.registerNodeInCluster();

          // Get the node_id from first registration
          const firstNodesQuery = executedQueries.find((q) =>
            q.sql.includes('INSERT INTO nodes'),
          );
          const firstNodeId = firstNodesQuery.params[0];

          // Register node with second address (simulating endpoint change)
          const service2 = new NodeJoiningService({
            nodeId,
            nodeAddress: `ws://localhost:${ports[1]}`,
            seedNodeAddress: 'ws://seed:8000',
          });
          service2.cdcIntegrationService = mockCDCService;
          await service2.registerNodeInCluster();

          // Get the node_id from second registration
          const secondNodesQuery = executedQueries.filter((q) =>
            q.sql.includes('INSERT INTO nodes'),
          )[1];
          const secondNodeId = secondNodesQuery.params[0];

          // Node ID should remain the same
          return firstNodeId === secondNodeId && firstNodeId === nodeId;
        },
      ),
      {numRuns: 10},
    );

    t.pass('node identity remains unchanged when endpoints change');
  });
});
