/**
 * Property-based test for EndpointService registration round-trip.
 *
 * Property 15: Endpoint registration round-trip
 * For any valid endpoint data, registering the endpoint and then
 * querying for it shall return the same endpoint data.
 *
 * **Validates: Requirements 8.4**
 */

import {test} from '../../src/test-helpers/tap.js';
import fc from 'fast-check';
import {EndpointService} from
  '../../src/control-plane/endpoint-service.js';
import {ConfigurationManager} from
  '../../src/config/configuration-manager.js';
import {LoggingService} from '../../src/logging/logging-service.js';
import {COLUMN, ENDPOINT_STATUS, TRANSPORT_TYPE} from
  '../../src/constants/index.js';

/**
 * Initialize test singletons.
 */
function initEnv() {
  ConfigurationManager.resetInstance();
  LoggingService.resetInstance();
  const config = ConfigurationManager.getInstance();
  if (!config.isInitialized()) {
    config.initialize({});
  }
  const logging = LoggingService.getInstance();
  if (!logging.isInitialized()) {
    logging.initialize({level: 'error'});
  }
}

/**
 * Arbitrary for generating valid endpoint data.
 */
const endpointArb = fc.record({
  endpointId: fc.string({minLength: 3, maxLength: 20})
    .map((s) => `ep-${s.replace(/[^a-zA-Z0-9-]/g, 'x')}`),
  nodeId: fc.string({minLength: 3, maxLength: 15})
    .map((s) => `node-${s.replace(/[^a-zA-Z0-9-]/g, 'x')}`),
  address: fc.tuple(
    fc.integer({min: 1, max: 255}),
    fc.integer({min: 1, max: 255}),
    fc.integer({min: 1, max: 255}),
    fc.integer({min: 1, max: 255}),
    fc.integer({min: 1024, max: 65535}),
  ).map(([a, b, c, d, port]) =>
    `ws://${a}.${b}.${c}.${d}:${port}`),
  transportType: fc.constantFrom(
    TRANSPORT_TYPE.WEBSOCKET,
  ),
  priority: fc.integer({min: 0, max: 10}),
});

test('Property 15: Endpoint registration round-trip',
  async (t) => {
    await fc.assert(
      fc.asyncProperty(
        endpointArb,
        async (epData) => {
          initEnv();

          const store = new Map();

          const mockCache = {
            get: (_table, id) => store.get(id) || null,
          };

          const mockCdc = {
            insertSystemTableRow: async (_table, row) => {
              store.set(row[COLUMN.ENDPOINT_ID], {...row});
              return {success: true};
            },
            upsertSystemTableRow: async (_table, row) => {
              store.set(row[COLUMN.ENDPOINT_ID], {...row});
              return {success: true};
            },
          };

          const mockSqlQueryEngine = {
            executeQuery: async (_sql, params) => {
              const id = params?.[0];
              const row = store.get(id) || null;
              return {
                success: true,
                rows: row ? [row] : [],
              };
            },
          };

          const service = new EndpointService({
            nodeId: 'local-node',
            cdcIntegrationService: mockCdc,
            systemTableCache: mockCache,
            sqlQueryEngine: mockSqlQueryEngine,
          });
          service.initialize();

          // Register endpoint
          await service.registerEndpoint(epData);

          // Query it back (async via SQL engine)
          const retrieved =
            await service.getEndpoint(epData.endpointId);

          // Verify round-trip
          t.ok(retrieved, 'endpoint should be retrievable');
          t.equal(
            retrieved[COLUMN.ENDPOINT_ID], epData.endpointId,
            'endpoint ID should match',
          );
          t.equal(
            retrieved[COLUMN.NODE_ID], epData.nodeId,
            'node ID should match',
          );
          t.equal(
            retrieved[COLUMN.ADDRESS], epData.address,
            'address should match',
          );
          t.equal(
            retrieved[COLUMN.TRANSPORT_TYPE], epData.transportType,
            'transport type should match',
          );
          t.equal(
            retrieved[COLUMN.PRIORITY], epData.priority,
            'priority should match',
          );
          t.equal(
            retrieved[COLUMN.STATUS], ENDPOINT_STATUS.ACTIVE,
            'status should be active',
          );

          service.stop();
          return true;
        },
      ),
      {numRuns: 10},
    );
  });

test('EndpointService uses injected control-plane system-table gateway ' +
  'for reads and writes', async (t) => {
  initEnv();

  const calls = [];
  const rows = new Map();
  const gateway = {
    async readRows(tableName, _sql, params) {
      calls.push({kind: 'read', tableName, params});
      const row = rows.get(params?.[0]) || null;
      return {
        success: true,
        rows: row ? [row] : [],
      };
    },
    async insertSystemTableRow(tableName, row) {
      calls.push({kind: 'insert', tableName, row});
      rows.set(row[COLUMN.ENDPOINT_ID], {...row});
      return {success: true};
    },
    async deleteSystemTableRow(tableName, whereClause) {
      calls.push({kind: 'delete', tableName, whereClause});
      rows.delete(whereClause[COLUMN.ENDPOINT_ID]);
      return {success: true};
    },
  };

  const service = new EndpointService({
    nodeId: 'local-node',
    controlPlaneSystemTableGateway: gateway,
    cdcIntegrationService: {
      async insertSystemTableRow() {
        throw new Error('raw CDC path should not be used');
      },
      async deleteSystemTableRow() {
        throw new Error('raw CDC path should not be used');
      },
    },
    systemTableCache: {
      get: () => null,
    },
    sqlQueryEngine: {
      async executeQuery() {
        throw new Error('raw SQL path should not be used');
      },
    },
  });
  service.initialize();

  await service.registerEndpoint({
    endpointId: 'ep-gateway',
    nodeId: 'node-gateway',
    address: 'ws://127.0.0.1:8081',
    transportType: TRANSPORT_TYPE.WEBSOCKET,
    priority: 1,
  });
  const endpoint = await service.getEndpoint('ep-gateway');
  await service.removeEndpoint('ep-gateway');

  t.ok(endpoint, 'registered endpoint should be readable');
  t.same(
    calls.map((entry) => entry.kind),
    ['read', 'insert', 'read', 'delete'],
    'endpoint owner should use the shared gateway for control-plane access',
  );
  service.stop();
});
