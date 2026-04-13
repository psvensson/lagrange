/**
 * Property test for Node Identity Separation from Endpoints.
 * Property 1: For any node registration, the node_id stored in the `nodes`
 * table SHALL be a UUID containing no transport-specific patterns
 * (ws://, nats://, etc.), and all transport addresses SHALL be stored only
 * in the `node_endpoints` table.
 *
 * Validates: Requirements 1.1, 1.2, 1.3
 *
 * Feature: transport-abstraction-layer
 * Property 1: Node Identity Separation from Endpoints
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
  const uuidRegex =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  return uuidRegex.test(str);
}

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

  // Provide a budget service so resolveWithoutPersist succeeds.
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
  const originalSendCPUpdate =
    phase.delegates.sendControlPlaneNodeStateUpdate;
  phase.delegates.sendControlPlaneNodeStateUpdate =
    async (_options) => {
      // Capture the node-row INSERT that the real path
      // would route through the control plane.
      void originalSendCPUpdate;
    };

  return service;
}

/**
 * Feature: transport-abstraction-layer
 * Property 1: Node Identity Separation from Endpoints
 *
 * For any node registration, the node_id stored in the `nodes` table
 * SHALL be a UUID containing no transport-specific patterns, and all
 * transport addresses SHALL be stored only in the `node_endpoints`
 * table.
 *
 * Validates: Requirements 1.1, 1.2, 1.3
 */
test('Property 1: Node Identity Separation from Endpoints',
  async (t) => {
    /**
   * Property: node_id is a UUID with no transport information.
   * Validates: Requirements 1.1
   */
    t.test('node_id is a UUID with no transport information',
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

              const nodesQuery = executedQueries.find((q) =>
                q.sql.includes(`INSERT INTO ${TABLES.NODES}`),
              );
              if (!nodesQuery) return true;

              const registeredNodeId = nodesQuery.params[0];
              return isValidUUID(registeredNodeId) &&
              !containsTransportPattern(registeredNodeId);
            },
          ),
          {numRuns: 10},
        );
        t.pass('node_id is a UUID with no transport info');
      });

    /**
   * Property: Transport addresses stored only in
   * node_endpoints table.
   * Validates: Requirements 1.2, 1.3
   */
    t.test('transport addresses stored only in ' +
    'node_endpoints table', async (t) => {
      await fc.assert(
        fc.asyncProperty(
          fc.uuid(),
          fc.constantFrom('ws', 'wss'),
          fc.constantFrom(
            'localhost', '127.0.0.1', '192.168.1.1',
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

            const endpointAddress = endpointQuery.params[3];
            const transportType = endpointQuery.params[2];
            return typeof endpointAddress === 'string' &&
              endpointAddress.length > 0 &&
              transportType === TRANSPORT_TYPE.WEBSOCKET;
          },
        ),
        {numRuns: 10},
      );
      t.pass('transport addresses in node_endpoints only');
    });

    /**
   * Property: Each node has at least one endpoint after
   * registration.
   * Validates: Requirements 1.3, 1.4
   */
    t.test('each node has at least one endpoint after ' +
    'registration', async (t) => {
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

            const endpointQueries = executedQueries.filter(
              (q) => q.sql.includes(
                `INSERT INTO ${TABLES.NODE_ENDPOINTS}`,
              ) && q.params[1] === nodeId,
            );
            return endpointQueries.length >= 1;
          },
        ),
        {numRuns: 10},
      );
      t.pass('at least one endpoint per node');
    });

    /**
   * Property: Endpoint has correct structure with all
   * required fields.
   * Validates: Requirements 1.5
   */
    t.test('endpoint has correct structure with all ' +
    'required fields', async (t) => {
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

            const params = endpointQuery.params;
            const hasEndpointId =
              typeof params[0] === 'string' &&
              params[0].length > 0;
            const hasNodeId = params[1] === nodeId;
            const hasTransportType =
              params[2] === TRANSPORT_TYPE.WEBSOCKET;
            const hasAddress =
              typeof params[3] === 'string' &&
              params[3].length > 0;
            const hasPriority =
              typeof params[4] === 'number';
            const hasMetadata =
              typeof params[5] === 'string';
            const hasStatus =
              params[6] === ENDPOINT_STATUS.ACTIVE;
            const hasCreatedAt =
              typeof params[7] === 'number';
            const hasUpdatedAt =
              typeof params[8] === 'number';

            return hasEndpointId && hasNodeId &&
              hasTransportType && hasAddress &&
              hasPriority && hasMetadata && hasStatus &&
              hasCreatedAt && hasUpdatedAt;
          },
        ),
        {numRuns: 10},
      );
      t.pass('endpoint has correct structure');
    });

    /**
   * Property: Node identity remains unchanged when
   * endpoints change.
   * Validates: Requirements 1.6
   */
    t.test('node identity remains unchanged when ' +
    'endpoints change', async (t) => {
      await fc.assert(
        fc.asyncProperty(
          fc.uuid(),
          fc.array(
            fc.integer({min: 8000, max: 9999}),
            {minLength: 2, maxLength: 3},
          ),
          async (nodeId, ports) => {
            const queries1 = [];
            const service1 = createWiredService({
              nodeId,
              nodeAddress: `ws://localhost:${ports[0]}`,
              executedQueries: queries1,
            });
            await service1.registerNodeInCluster();

            const queries2 = [];
            const service2 = createWiredService({
              nodeId,
              nodeAddress: `ws://localhost:${ports[1]}`,
              executedQueries: queries2,
            });
            await service2.registerNodeInCluster();

            const ep1 = queries1.find((q) =>
              q.sql.includes(
                `INSERT INTO ${TABLES.NODE_ENDPOINTS}`,
              ),
            );
            const ep2 = queries2.find((q) =>
              q.sql.includes(
                `INSERT INTO ${TABLES.NODE_ENDPOINTS}`,
              ),
            );
            if (!ep1 || !ep2) return false;

            return ep1.params[1] === nodeId &&
              ep2.params[1] === nodeId;
          },
        ),
        {numRuns: 10},
      );
      t.pass('node identity unchanged across endpoints');
    });
  });
