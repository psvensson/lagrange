/**
 * Tests for Admin WebSocket API.
 * Requirements: 32.1-32.39
 */

import {test} from '../../src/test-helpers/tap.js';
import {AdminWebSocketAPI, MessageType, ErrorCode} from
  '../../src/admin/admin-websocket-api.js';
import {
  ADMIN_CONTROL_SNAPSHOT,
  ADMIN_ERROR_MESSAGE,
  ADMIN_OPERATIONAL_DIAGNOSTICS,
  ADMIN_ROUTE,
  CONSISTENCY_MISMATCH_KIND,
} from '../../src/admin/admin-constants.js';
import {SystemTableCache} from '../../src/cache/system-table-cache.js';
import {createReadOnlyCache} from '../../src/cache/read-only-system-table-cache.js';
import {getSystemCachePrimaryKeyField} from
  '../../src/cache/system-cache-key-descriptor.js';
import {ConfigurationManager} from '../../src/config/configuration-manager.js';
import {LoggingService} from '../../src/logging/logging-service.js';
import {LogsTableService} from '../../src/logging/logs-table-service.js';
import {createSqlRequest} from '../../src/query/sql-request.js';
import {createInProcWebSocketPair} from '../../src/test-helpers/inproc-ws.js';
import {TraceCollector} from '../../src/debug/trace-collector.js';
import {COLUMN, TABLES, SERVICE_TYPE} from '../../src/constants/index.js';
import {
  CONTROL_PLANE_READINESS_DIMENSION,
  READINESS_SNAPSHOT_KEY,
  RUNTIME_AUTHORITY_STATE,
  RUNTIME_AUTHORITY_VISIBILITY_STATE,
} from '../../src/control-plane/control-plane-readiness-constants.js';
import {
  CONTROL_PLANE_SNAPSHOT_OBSERVATION_STATE,
  CONTROL_PLANE_SNAPSHOT_REFRESH_STATE,
} from '../../src/control-plane/control-plane-snapshot-owner.js';

// Initialize services for tests
ConfigurationManager.getInstance().initialize();
LoggingService.getInstance().initialize({level: 'error'});

const AUTHORITATIVE_REPAIR_TABLES = Object.freeze([
  TABLES.NODES,
  TABLES.PARTITIONS,
  TABLES.SERVICES,
  TABLES.TABLES,
  TABLES.NODE_ENDPOINTS,
  TABLES.SERVICE_DEFINITIONS,
  TABLES.SERVICE_ENDPOINTS,
  TABLES.REPLICA_OPERATIONS,
]);
const ERROR_UNEXPECTED_AUTHORITATIVE_PUBLISHED_MEMBERSHIP_READ =
  'unexpected_authoritative_published_membership_read';
const TEST_LOCAL_SYSTEM_OBSERVATION_QUERY_ID =
  'q-snapshot-local-services-observation';
const TEST_LOCAL_SYSTEM_OBSERVATION_SQL =
  'SELECT * FROM services WHERE service_type = \'partition\'';
const TEST_LOCAL_SYSTEM_OBSERVATION_GAP_SERVICE_ID =
  'svc-gap-partition-node-2';
const TEST_LOCAL_SYSTEM_OBSERVATION_GAP_NODE_ID =
  'node-gap-partition-2';
const TEST_LOCAL_SYSTEM_OBSERVATION_LOCAL_NODE_ID =
  'node-1';
const TEST_LOCAL_SYSTEM_OBSERVATION_GAP_PARTITION_ID =
  'partition-1';
const TEST_LOCAL_SYSTEM_OBSERVATION_GAP_REPLICA_ID =
  'partition-gap-r1';
const TEST_LOCAL_SYSTEM_OBSERVATION_GAP_ADDRESS =
  'node-gap-partition-2/partition/partition-1-r4';
const TEST_LOCAL_SYSTEM_OBSERVATION_ACTIVE_STATUS =
  'active';
const TEST_LOCAL_SYSTEM_OBSERVATION_LANE =
  'snapshot';
const BACKGROUND_REPAIR_SETTLE_TURNS = 8;
const BACKGROUND_REPAIR_SETTLE_DELAY_MS = 0;
const BACKGROUND_REPAIR_WAIT_ATTEMPTS = 40;

async function waitForBackgroundRepairToSettle(
  turnCount = BACKGROUND_REPAIR_SETTLE_TURNS,
)
{
  for (let index = 0; index < turnCount; index += 1) {
    await new Promise((resolve) => {
      setTimeout(resolve, BACKGROUND_REPAIR_SETTLE_DELAY_MS);
    });
  }
}

async function waitForBackgroundRepairCondition(
  conditionFn,
  attemptCount = BACKGROUND_REPAIR_WAIT_ATTEMPTS,
)
{
  for (let index = 0; index < attemptCount; index += 1) {
    if (conditionFn()) {
      return true;
    }
    await waitForBackgroundRepairToSettle(1);
  }
  return conditionFn();
}

/**
 * Create a mock SQL query engine.
 * @return {Object} Mock query engine.
 */
function createMockQueryEngine() {
  return {
    executeRequest: async (request) => {
      const sqlLower = request.statement.toLowerCase().trim();

      // Check for error conditions first (before checking statement type)
      if (sqlLower.includes('invalid_table')) {
        return {
          success: false,
          error: 'Table not found: invalid_table',
          errorCode: 'TABLE_NOT_FOUND',
        };
      } else if (sqlLower.includes('syntax_error')) {
        throw new Error('Parse error: syntax error near syntax_error');
      } else if (sqlLower.startsWith('select')) {
        return {
          success: true,
          rows: [{id: '1', name: 'test'}],
          count: 1,
          partitions: ['partition-1'],
          tableName: 'test_table',
        };
      } else if (sqlLower.startsWith('insert')) {
        return {
          success: true,
          operation: 'INSERT',
          affectedRows: 1,
          partitions: ['partition-1'],
          tableName: 'test_table',
        };
      } else if (sqlLower.startsWith('update')) {
        return {
          success: true,
          operation: 'UPDATE',
          affectedRows: 2,
          partitions: ['partition-1'],
          tableName: 'test_table',
        };
      } else if (sqlLower.startsWith('delete')) {
        return {
          success: true,
          operation: 'DELETE',
          affectedRows: 1,
          partitions: ['partition-1'],
          tableName: 'test_table',
        };
      }

      return {success: true, rows: [], count: 0};
    },
  };
}

/**
 * Create a mock query engine that returns authoritative rows per system table.
 * @param {Object<string, Array<Object>|Function>} rowsByTable
 * @return {Object}
 */
function createSystemTableRepairQueryEngine(rowsByTable = {}) {
  const fallback = createMockQueryEngine();
  const executeRequestCalls = [];
  return {
    executeRequestCalls,
    async executeRequest(request) {
      const statement = String(request?.statement || '').trim();
      executeRequestCalls.push(statement);
      const match = statement.match(/^select \* from ([a-z_]+)$/i);
      if (!match) {
        return fallback.executeRequest(request);
      }
      const tableName = match[1].toLowerCase();
      const value = rowsByTable[tableName];
      const rows = typeof value === 'function' ? value(tableName) : value;
      return {
        success: true,
        rows: Array.isArray(rows) ? rows.map((row) => ({...row})) : [],
        count: Array.isArray(rows) ? rows.length : 0,
        partitions: [`partition-${tableName}`],
        tableName,
      };
    },
  };
}

test('live query subscribe routes to liveQueryManager', async (t) => {
  const registrations = [];
  const mockLiveQueryManager = {
    initialized: true,
    isInitialized: () => true,
    registerLiveQuery: async (parsedQuery, client) => {
      registrations.push({parsedQuery, clientId: client.id});
      return {
        queryId: 'lq-test-1',
        expiresAt: Date.now() + 30000,
        renewBefore: Date.now() + 21000,
        partitions: ['partition-1'],
      };
    },
    sendSnapshotToClient: async () => {},
    unregisterLiveQuery: () => {},
    handleClientDisconnection: () => {},
  };

  const api = new AdminWebSocketAPI({
    systemTableCache: createPopulatedCache(),
    sqlQueryEngine: createMockQueryEngine(),
    nodeId: 'test-node',
    liveQueryManager: mockLiveQueryManager,
  });
  await api.initialize(0, {listen: false});

  const {ws} = await connectAndReceive(api);

  // Send live query subscribe message
  ws.send(JSON.stringify({
    type: MessageType.LIVE_QUERY_SUBSCRIBE,
    subscriptionId: 'sub-1',
    sql: 'LIVE SELECT * FROM logs',
  }));

  // Wait for the registration to be processed
  const response = await waitForMessage(ws);
  t.equal(response.type, MessageType.LIVE_QUERY_EVENT,
    'should respond with live_query_event');
  t.equal(response.subscriptionId, 'sub-1',
    'should include subscriptionId');
  t.equal(registrations.length, 1,
    'should register with live query manager');
  t.ok(registrations[0].parsedQuery,
    'should pass parsed query to manager');

  ws.close();
  await api.shutdown();
});

test('live query subscribe rejects missing subscriptionId', async (t) => {
  const api = new AdminWebSocketAPI({
    systemTableCache: createPopulatedCache(),
    sqlQueryEngine: createMockQueryEngine(),
    nodeId: 'test-node',
    liveQueryManager: {
      initialized: true,
      isInitialized: () => true,
      handleClientDisconnection: () => {},
    },
  });
  await api.initialize(0, {listen: false});

  const {ws} = await connectAndReceive(api);

  ws.send(JSON.stringify({
    type: MessageType.LIVE_QUERY_SUBSCRIBE,
    sql: 'LIVE SELECT * FROM logs',
  }));

  const response = await waitForMessage(ws);
  t.equal(response.type, MessageType.ERROR,
    'should respond with error');
  t.ok(response.error, 'should include error message');

  ws.close();
  await api.shutdown();
});

test('live query unsubscribe routes to liveQueryManager', async (t) => {
  const unregistrations = [];
  const mockLiveQueryManager = {
    initialized: true,
    isInitialized: () => true,
    registerLiveQuery: async () => ({
      queryId: 'lq-test-2',
      expiresAt: Date.now() + 30000,
      renewBefore: Date.now() + 21000,
      partitions: [],
    }),
    sendSnapshotToClient: async () => {},
    unregisterLiveQuery: (queryId, clientId) => {
      unregistrations.push({queryId, clientId});
    },
    handleClientDisconnection: () => {},
  };

  const api = new AdminWebSocketAPI({
    systemTableCache: createPopulatedCache(),
    sqlQueryEngine: createMockQueryEngine(),
    nodeId: 'test-node',
    liveQueryManager: mockLiveQueryManager,
  });
  await api.initialize(0, {listen: false});

  const {ws} = await connectAndReceive(api);

  // Subscribe first
  ws.send(JSON.stringify({
    type: MessageType.LIVE_QUERY_SUBSCRIBE,
    subscriptionId: 'sub-2',
    sql: 'LIVE SELECT * FROM logs',
  }));
  await waitForMessage(ws);

  // Now unsubscribe
  ws.send(JSON.stringify({
    type: MessageType.LIVE_QUERY_UNSUBSCRIBE,
    subscriptionId: 'sub-2',
  }));

  // Give time for async processing
  await new Promise((resolve) => setTimeout(resolve, 50));

  t.equal(unregistrations.length, 1,
    'should unregister from live query manager');

  ws.close();
  await api.shutdown();
});

test('live query client disconnect cleans up subscriptions', async (t) => {
  const disconnections = [];
  const mockLiveQueryManager = {
    initialized: true,
    isInitialized: () => true,
    handleClientDisconnection: (clientId) => {
      disconnections.push(clientId);
    },
  };

  const api = new AdminWebSocketAPI({
    systemTableCache: createPopulatedCache(),
    sqlQueryEngine: createMockQueryEngine(),
    nodeId: 'test-node',
    liveQueryManager: mockLiveQueryManager,
  });
  await api.initialize(0, {listen: false});

  const {ws} = await connectAndReceive(api);
  ws.close();

  // Give time for disconnect handler
  await new Promise((resolve) => setTimeout(resolve, 50));

  t.equal(disconnections.length, 1,
    'should notify live query manager of disconnection');

  await api.shutdown();
});

test('AdminWebSocketAPI - local system-table observation query avoids routed SQL',
  async (t) => {
    let executeRequestCalls = 0;
    const api = new AdminWebSocketAPI({
      nodeId: 'test-node',
      systemTableCache: createPopulatedCache(),
      sqlQueryEngine: {
        async executeRequest() {
          executeRequestCalls++;
          throw new Error('routed SQL should not run');
        },
      },
    });

    const result = await api.executeLocalQueryEnvelope({
      queryId: 'q-local-system-observation',
      sql: 'SELECT * FROM nodes WHERE status = ?',
      params: ['active'],
    });

    t.equal(result.success, true, 'local cache observation query should succeed');
    t.equal(result.tableName, TABLES.NODES, 'query should identify the system table');
    t.same(
      result.rows.map((row) => row.id),
      ['node-1'],
      'local cache observation query should return cache-backed rows',
    );
    t.equal(executeRequestCalls, 0, 'local cache observation query should bypass routed SQL');
  },
);

test('AdminWebSocketAPI - local system-table observation query keeps the ' +
  'local cache view when shared metadata node coverage is inconsistent',
  async (t) => {
    let executeRequestCalls = 0;
    const cache = createPopulatedCache();
    cache.applySystemTableChange(TABLES.SERVICES, 'INSERT', {
      service_id: 'service-2',
      service_type: 'partition',
      node_id: 'node-2',
      status: 'active',
      partition_id: 'partition-2',
      replica_id: 'partition-2-r1',
      address: 'node-2/partition/partition-2-r1',
    });
    cache.applySystemTableChange(TABLES.NODE_ENDPOINTS, 'INSERT', {
      endpoint_id: 'endpoint-node-2',
      node_id: 'node-2',
      transport_type: 'ws',
      address: 'ws://node-2:8082',
      status: 'active',
    });

    const api = new AdminWebSocketAPI({
      nodeId: 'test-node',
      systemTableCache: cache,
      sqlQueryEngine: {
        async executeRequest(request) {
          executeRequestCalls++;
          t.match(
            String(request?.statement || ''),
            /select \* from nodes/i,
            'raw observation queries should no longer reopen authoritative reads',
          );
          return {
            success: true,
            rows: [
              {id: 'node-1', node_id: 'node-1', status: 'active'},
              {id: 'node-2', node_id: 'node-2', status: 'active'},
            ],
            count: 2,
            partitions: ['nodes-p1'],
            tableName: TABLES.NODES,
          };
        },
      },
    });

    const result = await api.executeLocalQueryEnvelope({
      queryId: 'q-node-coverage-gap',
      sql: 'SELECT * FROM nodes WHERE status = ?',
      params: ['active'],
    });

    t.equal(result.success, true, 'local observation query should still succeed');
    t.same(
      result.rows.map((row) => row.node_id || row.id).sort(),
      ['node-1'],
      'raw observation should preserve the incomplete local cache view',
    );
    t.equal(
      executeRequestCalls,
      0,
      'coverage-gap observation query should stay observational and avoid routed SQL',
    );
  },
);

test('AdminWebSocketAPI - local system-table observation supports projection ordering and limit',
  async (t) => {
    let executeRequestCalls = 0;
    const cache = createPopulatedCache();
    cache.applySystemTableChange(TABLES.NODE_ENDPOINTS, 'INSERT', {
      endpoint_id: 'ep-node-1-older',
      node_id: 'node-1',
      transport_type: 'ws',
      address: 'ws://node-1:8082',
      priority: 1,
      status: 'active',
      updated_at: 100,
    });
    cache.applySystemTableChange(TABLES.NODE_ENDPOINTS, 'INSERT', {
      endpoint_id: 'ep-node-1-newer',
      node_id: 'node-1',
      transport_type: 'ws',
      address: 'ws://node-1:8083',
      priority: 0,
      status: 'active',
      updated_at: 200,
    });

    const api = new AdminWebSocketAPI({
      nodeId: 'test-node',
      systemTableCache: cache,
      sqlQueryEngine: {
        async executeRequest() {
          executeRequestCalls++;
          throw new Error('routed SQL should not run');
        },
      },
    });

    const result = await api.executeLocalQueryEnvelope({
      queryId: 'q-local-endpoint-projection',
      sql: 'SELECT endpoint_id, node_id FROM node_endpoints ' +
        'WHERE node_id = ? ORDER BY updated_at DESC LIMIT 1',
      params: ['node-1'],
    });

    t.equal(result.success, true, 'projected local cache observation query should succeed');
    t.same(
      result.rows,
      [{endpoint_id: 'ep-node-1-newer', node_id: 'node-1'}],
      'local cache observation query should honor projection, ordering, and limit',
    );
    t.equal(executeRequestCalls, 0, 'projected cache observation query should bypass routed SQL');
  },
);
