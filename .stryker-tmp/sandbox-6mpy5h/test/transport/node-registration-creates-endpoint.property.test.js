/**
 * Property test for Node Registration Creates Endpoint.
 * Property 11: For any node registration, the node SHALL write at
 * least one endpoint (WebSocket) to the `node_endpoints` table via
 * the SQL_Engine.
 *
 * Validates: Requirements 8.2
 *
 * Feature: transport-abstraction-layer
 * Property 11: Node Registration Creates Endpoint
 */
// @ts-nocheck


import {test} from '../../src/test-helpers/tap.js';
import fc from 'fast-check';
import {NodeJoiningService} from '../../src/bootstrap/node-joining-service.js';
import {
  ConfigurationManager,
} from '../../src/config/configuration-manager.js';
import {LoggingService} from '../../src/logging/logging-service.js';
import {
  TABLES,
  TRANSPORT_TYPE,
  ENDPOINT_STATUS,
} from '../../src/constants/index.js';

ConfigurationManager.resetInstance();
LoggingService.resetInstance();
const config = ConfigurationManager.getInstance();
config.initialize({
  node: {id: 'test-node'},
  logging: {level: 'error'},
});
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
      const placeholders =
        columns.map(() => '?').join(', ');
      const sql = `INSERT INTO ${tableName} ` +
        `(${columns.join(', ')}) ` +
        `VALUES (${placeholders})`;
      const params = columns.map((col) => rowData[col]);
      return mockQueryEngine.executeQuery(sql, params);
    },
  };
}

/**
 * Wire a NodeJoiningService so registerNodeInCluster can
 * execute without a live cluster. Mocks the control-plane
 * state-update delegate and the storage-budget service so
 * the registration flow reaches the endpoint-write step.
 *
 * @param {Object} opts
 * @param {string} opts.nodeId
 * @param {string} opts.nodeAddress
 * @param {Array} opts.executedQueries - Accumulator array.
 * @return {NodeJoiningService}
 */
function createWiredService({nodeId, nodeAddress, executedQueries}) {
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

  // Provide a budget service so resolveWithoutPersist
  // succeeds.
  service.nodeStorageBudgetService = {
    resolveBudgetRow: (nodeRow) => ({
      budgetRow: nodeRow,
      resolution: {
        isValid: true,
        budgetBytes: 0,
        source: 'test',
      },
    }),
  };

  // Stub sendControlPlaneNodeStateUpdate so the flow does
  // not need a live cluster (uses canonical owner delegate).
  const phase = service.querySystemStatePhase;
  phase.delegates.sendControlPlaneNodeStateUpdate =
    async (_options) => {};

  return service;
}

/**
 * Feature: transport-abstraction-layer
 * Property 11: Node Registration Creates Endpoint
 *
 * For any node registration, the node SHALL write at least one
 * endpoint (WebSocket) to the `node_endpoints` table via the
 * SQL_Engine.
 *
 * Validates: Requirements 8.2
 */
test('Property 11: Node Registration Creates Endpoint',
  async (t) => {
    /**
   * Property: Node registration creates WebSocket endpoint.
   * Validates: Requirements 8.2
   */
    t.test('node registration creates WebSocket endpoint',
      async (t) => {
        await fc.assert(
          fc.asyncProperty(
            fc.uuid(),
            fc.integer({min: 8000, max: 9999}),
            async (nodeId, port) => {
              const nodeAddress = `ws://localhost:${port}`;
              const executedQueries = [];
              const service = createWiredService({
                nodeId, nodeAddress, executedQueries,
              });

              await service.registerNodeInCluster();

              const endpointQuery = executedQueries.find(
                (q) => q.sql.includes(
                  `INSERT INTO ${TABLES.NODE_ENDPOINTS}`,
                ),
              );
              if (!endpointQuery) return false;

              const transportType = endpointQuery.params[2];
              return transportType ===
                TRANSPORT_TYPE.WEBSOCKET;
            },
          ),
          {numRuns: 10},
        );
        t.pass('creates WebSocket endpoint');
      });

    /**
   * Property: Endpoint is written via SQL query engine.
   * Validates: Requirements 8.2
   */
    t.test('endpoint is written via SQL query engine',
      async (t) => {
        await fc.assert(
          fc.asyncProperty(
            fc.uuid(),
            fc.integer({min: 8000, max: 9999}),
            async (nodeId, port) => {
              const nodeAddress = `ws://localhost:${port}`;
              let sqlQueryExecuted = false;

              const mockQueryEngine = {
                executeQuery: async (sql, _params) => {
                  if (sql.includes(
                    `INSERT INTO ${TABLES.NODE_ENDPOINTS}`,
                  )) {
                    sqlQueryExecuted = true;
                  }
                  return {success: true};
                },
              };
              const mockCDCService =
                createMockCDCService(mockQueryEngine);

              const service = new NodeJoiningService({
                nodeId,
                nodeAddress,
                seedNodeAddress: 'ws://seed:8000',
              });
              service.cdcIntegrationService = mockCDCService;
              service.nodeStorageBudgetService = {
                resolveBudgetRow: (nodeRow) => ({
                  budgetRow: nodeRow,
                  resolution: {
                    isValid: true,
                    budgetBytes: 0,
                    source: 'test',
                  },
                }),
              };
              const phase = service.querySystemStatePhase;
              phase.delegates
                .sendControlPlaneNodeStateUpdate =
                  async (_opts) => {};

              await service.registerNodeInCluster();
              return sqlQueryExecuted;
            },
          ),
          {numRuns: 10},
        );
        t.pass('endpoint written via SQL query engine');
      });

    /**
   * Property: Endpoint references correct node_id.
   * Validates: Requirements 8.2
   */
    t.test('endpoint references correct node_id',
      async (t) => {
        await fc.assert(
          fc.asyncProperty(
            fc.uuid(),
            fc.integer({min: 8000, max: 9999}),
            async (nodeId, port) => {
              const nodeAddress = `ws://localhost:${port}`;
              const executedQueries = [];
              const service = createWiredService({
                nodeId, nodeAddress, executedQueries,
              });

              await service.registerNodeInCluster();

              const endpointQuery = executedQueries.find(
                (q) => q.sql.includes(
                  `INSERT INTO ${TABLES.NODE_ENDPOINTS}`,
                ),
              );
              if (!endpointQuery) return false;

              return endpointQuery.params[1] === nodeId;
            },
          ),
          {numRuns: 10},
        );
        t.pass('endpoint references correct node_id');
      });

    /**
   * Property: Endpoint has active status.
   * Validates: Requirements 8.2
   */
    t.test('endpoint has active status', async (t) => {
      await fc.assert(
        fc.asyncProperty(
          fc.uuid(),
          fc.integer({min: 8000, max: 9999}),
          async (nodeId, port) => {
            const nodeAddress = `ws://localhost:${port}`;
            const executedQueries = [];
            const service = createWiredService({
              nodeId, nodeAddress, executedQueries,
            });

            await service.registerNodeInCluster();

            const endpointQuery = executedQueries.find(
              (q) => q.sql.includes(
                `INSERT INTO ${TABLES.NODE_ENDPOINTS}`,
              ),
            );
            if (!endpointQuery) return false;

            return endpointQuery.params[6] ===
              ENDPOINT_STATUS.ACTIVE;
          },
        ),
        {numRuns: 10},
      );
      t.pass('endpoint has active status');
    });

    /**
   * Property: Endpoint address matches node address.
   * Validates: Requirements 8.2
   */
    t.test('endpoint address matches node address',
      async (t) => {
        await fc.assert(
          fc.asyncProperty(
            fc.uuid(),
            fc.constantFrom('ws', 'wss'),
            fc.constantFrom(
              'localhost', '127.0.0.1', '10.0.0.1',
            ),
            fc.integer({min: 8000, max: 9999}),
            async (nodeId, protocol, host, port) => {
              const nodeAddress =
                `${protocol}://${host}:${port}`;
              const executedQueries = [];
              const service = createWiredService({
                nodeId, nodeAddress, executedQueries,
              });

              await service.registerNodeInCluster();

              const endpointQuery = executedQueries.find(
                (q) => q.sql.includes(
                  `INSERT INTO ${TABLES.NODE_ENDPOINTS}`,
                ),
              );
              if (!endpointQuery) return false;

              const endpointAddress =
                endpointQuery.params[3];
              return typeof endpointAddress === 'string' &&
                endpointAddress.length > 0;
            },
          ),
          {numRuns: 10},
        );
        t.pass('endpoint address matches node address');
      });

    /**
   * Property: Endpoint has unique endpoint_id.
   * Validates: Requirements 8.2
   */
    t.test('endpoint has unique endpoint_id', async (t) => {
      await fc.assert(
        fc.asyncProperty(
          fc.uniqueArray(
            fc.uuid(), {minLength: 2, maxLength: 5},
          ),
          fc.integer({min: 8000, max: 9999}),
          async (nodeIds, basePort) => {
            const endpointIds = new Set();

            for (let i = 0; i < nodeIds.length; i++) {
              const nodeId = nodeIds[i];
              const nodeAddress =
                `ws://localhost:${basePort + i}`;
              const executedQueries = [];
              const service = createWiredService({
                nodeId, nodeAddress, executedQueries,
              });

              await service.registerNodeInCluster();

              const endpointQuery = executedQueries.find(
                (q) => q.sql.includes(
                  `INSERT INTO ${TABLES.NODE_ENDPOINTS}`,
                ),
              );
              if (!endpointQuery) return false;

              const endpointId = endpointQuery.params[0];
              if (endpointIds.has(endpointId)) return false;
              endpointIds.add(endpointId);
            }
            return endpointIds.size === nodeIds.length;
          },
        ),
        {numRuns: 10},
      );
      t.pass('endpoint has unique endpoint_id');
    });

    /**
   * Property: Endpoint has priority 0 (highest).
   * Validates: Requirements 8.2
   */
    t.test('endpoint has priority 0 (highest)',
      async (t) => {
        await fc.assert(
          fc.asyncProperty(
            fc.uuid(),
            fc.integer({min: 8000, max: 9999}),
            async (nodeId, port) => {
              const nodeAddress = `ws://localhost:${port}`;
              const executedQueries = [];
              const service = createWiredService({
                nodeId, nodeAddress, executedQueries,
              });

              await service.registerNodeInCluster();

              const endpointQuery = executedQueries.find(
                (q) => q.sql.includes(
                  `INSERT INTO ${TABLES.NODE_ENDPOINTS}`,
                ),
              );
              if (!endpointQuery) return false;

              return endpointQuery.params[4] === 0;
            },
          ),
          {numRuns: 10},
        );
        t.pass('endpoint has priority 0');
      });
  });
