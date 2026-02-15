/**
 * Property test for Node Registration Creates Endpoint.
 * Property 11: For any node registration, the node SHALL write at least one
 * endpoint (WebSocket) to the `node_endpoints` table via the SQL_Engine.
 *
 * Validates: Requirements 8.2
 *
 * Feature: transport-abstraction-layer
 * Property 11: Node Registration Creates Endpoint
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

/**
 * Feature: transport-abstraction-layer
 * Property 11: Node Registration Creates Endpoint
 *
 * For any node registration, the node SHALL write at least one endpoint
 * (WebSocket) to the `node_endpoints` table via the SQL_Engine.
 *
 * **Validates: Requirements 8.2**
 */
test('Property 11: Node Registration Creates Endpoint', async (t) => {
  /**
   * Property: Node registration creates WebSocket endpoint.
   * **Validates: Requirements 8.2**
   */
  t.test('node registration creates WebSocket endpoint', async (t) => {
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

          // Endpoint query should exist
          if (!endpointQuery) {
            return false;
          }

          // Transport type should be WebSocket
          const transportType = endpointQuery.params[2];
          return transportType === TRANSPORT_TYPE.WEBSOCKET;
        },
      ),
      {numRuns: 10},
    );

    t.pass('node registration creates WebSocket endpoint');
  });

  /**
   * Property: Endpoint is written via SQL query engine.
   * **Validates: Requirements 8.2**
   */
  t.test('endpoint is written via SQL query engine', async (t) => {
    await fc.assert(
      fc.asyncProperty(
        fc.uuid(),
        fc.integer({min: 8000, max: 9999}),
        async (nodeId, port) => {
          const nodeAddress = `ws://localhost:${port}`;
          let sqlQueryExecuted = false;

          const mockQueryEngine = {
            executeQuery: async (sql, _params) => {
              if (sql.includes(`INSERT INTO ${TABLES.NODE_ENDPOINTS}`)) {
                sqlQueryExecuted = true;
              }
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

          // SQL query should have been executed for endpoint
          return sqlQueryExecuted;
        },
      ),
      {numRuns: 10},
    );

    t.pass('endpoint is written via SQL query engine');
  });

  /**
   * Property: Endpoint references correct node_id.
   * **Validates: Requirements 8.2**
   */
  t.test('endpoint references correct node_id', async (t) => {
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

          // node_id in endpoint should match the registered node
          const endpointNodeId = endpointQuery.params[1];
          return endpointNodeId === nodeId;
        },
      ),
      {numRuns: 10},
    );

    t.pass('endpoint references correct node_id');
  });

  /**
   * Property: Endpoint has active status.
   * **Validates: Requirements 8.2**
   */
  t.test('endpoint has active status', async (t) => {
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

          // Status should be active
          const status = endpointQuery.params[6];
          return status === ENDPOINT_STATUS.ACTIVE;
        },
      ),
      {numRuns: 10},
    );

    t.pass('endpoint has active status');
  });

  /**
   * Property: Endpoint address matches node address.
   * **Validates: Requirements 8.2**
   */
  t.test('endpoint address matches node address', async (t) => {
    await fc.assert(
      fc.asyncProperty(
        fc.uuid(),
        fc.constantFrom('ws', 'wss'),
        fc.constantFrom('localhost', '127.0.0.1', '10.0.0.1'),
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

          if (!endpointQuery) {
            return false;
          }

          // Address should match node address
          const endpointAddress = endpointQuery.params[3];
          return endpointAddress === nodeAddress;
        },
      ),
      {numRuns: 10},
    );

    t.pass('endpoint address matches node address');
  });

  /**
   * Property: Endpoint has unique endpoint_id.
   * **Validates: Requirements 8.2**
   */
  t.test('endpoint has unique endpoint_id', async (t) => {
    await fc.assert(
      fc.asyncProperty(
        fc.uniqueArray(fc.uuid(), {minLength: 2, maxLength: 5}),
        fc.integer({min: 8000, max: 9999}),
        async (nodeIds, basePort) => {
          const endpointIds = new Set();

          for (let i = 0; i < nodeIds.length; i++) {
            const nodeId = nodeIds[i];
            const nodeAddress = `ws://localhost:${basePort + i}`;
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

            const endpointId = endpointQuery.params[0];

            // Check for uniqueness
            if (endpointIds.has(endpointId)) {
              return false;
            }
            endpointIds.add(endpointId);
          }

          // All endpoint IDs should be unique
          return endpointIds.size === nodeIds.length;
        },
      ),
      {numRuns: 10},
    );

    t.pass('endpoint has unique endpoint_id');
  });

  /**
   * Property: Endpoint has priority 0 (highest).
   * **Validates: Requirements 8.2**
   */
  t.test('endpoint has priority 0 (highest)', async (t) => {
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

          // Priority should be 0 (highest)
          const priority = endpointQuery.params[4];
          return priority === 0;
        },
      ),
      {numRuns: 10},
    );

    t.pass('endpoint has priority 0 (highest)');
  });
});
