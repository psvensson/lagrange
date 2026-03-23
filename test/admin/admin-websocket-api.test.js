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
import {createInProcWebSocketPair} from '../../src/test-helpers/inproc-ws.js';
import {TraceCollector} from '../../src/debug/trace-collector.js';
import {COLUMN, TABLES, SERVICE_TYPE} from '../../src/constants/index.js';
import {
  CONTROL_PLANE_READINESS_DIMENSION,
} from '../../src/control-plane/control-plane-readiness-constants.js';

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

/**
 * Extract authoritative repair table names from executed SQL statements.
 * @param {string[]} statements
 * @return {string[]}
 */
function getAuthoritativeRepairReadTables(statements = []) {
  return [...new Set((Array.isArray(statements) ? statements : [])
    .map((statement) => {
      const match = String(statement || '').match(/^SELECT \* FROM ([a-z_]+)$/i);
      return match ? match[1].toLowerCase() : null;
    })
    .filter(Boolean))]
    .sort();
}

/**
 * Create a deterministic authoritative-cache reconcile gateway for tests.
 * @param {SystemTableCache} writableCache
 * @param {Object} [options={}]
 * @param {Object|null} [options.queryEngine]
 * @param {Object<string, Array<Object>|Function>} [options.readRowsByTable]
 * @return {Object}
 */
function createAuthoritativeCacheGateway(writableCache, options = {}) {
  const queryEngine = options.queryEngine || null;
  const readRowsByTable = options.readRowsByTable || {};
  const executeReadCalls = [];
  const cloneRows = (rows) => Array.isArray(rows) ? rows.map((row) => ({...row})) : [];
  const resolveAuthoritativeRows = async (tableName, readIntent = {}) => {
    const tableOverride = readRowsByTable[tableName];
    if (typeof tableOverride === 'function') {
      return cloneRows(await tableOverride(tableName, readIntent));
    }
    if (Array.isArray(tableOverride)) {
      return cloneRows(tableOverride);
    }

    if (queryEngine && typeof queryEngine.executeRequest === 'function') {
      const queryResult = await queryEngine.executeRequest({
        statement: readIntent?.sql || `SELECT * FROM ${tableName}`,
        params: Array.isArray(readIntent?.params) ? readIntent.params : [],
      });
      if (queryResult?.success !== true) {
        return null;
      }
      return cloneRows(queryResult?.rows);
    }

    return cloneRows(writableCache?.getAll(tableName));
  };

  return {
    executeReadCalls,
    async executeRead(readIntent = {}, readOptions = {}) {
      const statement = String(readIntent?.sql || '').trim();
      const statementMatch = statement.match(/^select \* from ([a-z_]+)$/i);
      const tableName = String(
        readIntent?.tableName ||
          statementMatch?.[1] ||
          '',
      )
        .trim()
        .toLowerCase();
      executeReadCalls.push({
        tableName,
        sql: statement,
        strategy: readIntent?.strategy || null,
        owner: readIntent?.owner || null,
        options: {...readOptions},
      });
      if (tableName.length === 0) {
        return {
          success: false,
          tableName: null,
          rows: [],
          error: 'table_name_required',
        };
      }
      const rows = await resolveAuthoritativeRows(tableName, readIntent);
      if (!rows) {
        return {
          success: false,
          tableName,
          rows: [],
          error: 'authoritative_query_failed',
        };
      }
      return {
        success: true,
        tableName,
        rows,
      };
    },
    async reconcileAuthoritativeCacheRows(
      tableName,
      authoritativeRows,
      options = {},
    ) {
      const cacheTarget = options.cacheMutationTarget || writableCache;
      const keyField =
        options.primaryKeyField || getSystemCachePrimaryKeyField(tableName);
      const cachedRows = Array.isArray(options.cachedRows) ?
        options.cachedRows :
        cacheTarget.getAll(tableName);
      const cachedByKey = new Map(
        cachedRows
          .map((row) => [String(row?.[keyField] || ''), row])
          .filter(([key]) => key.length > 0),
      );
      const authoritativeByKey = new Map(
        (Array.isArray(authoritativeRows) ? authoritativeRows : [])
          .map((row) => [String(row?.[keyField] || ''), row])
          .filter(([key]) => key.length > 0),
      );
      let mutationCount = 0;

      for (const [key, row] of authoritativeByKey.entries()) {
        cacheTarget.applySystemTableChange(
          tableName,
          cachedByKey.has(key) ? 'UPDATE' : 'INSERT',
          {...row},
        );
        mutationCount += 1;
      }

      for (const [key, row] of cachedByKey.entries()) {
        if (authoritativeByKey.has(key)) {
          continue;
        }
        cacheTarget.applySystemTableChange(tableName, 'DELETE', {...row});
        mutationCount += 1;
      }

      return {
        success: true,
        mutationCount,
      };
    },
  };
}

/**
 * Create a realistic system-table cache for authoritative discovery repair.
 * @param {string} [nodeId='test-node']
 * @return {SystemTableCache}
 */
function createAuthoritativeRepairCache(nodeId = 'test-node') {
  const cache = new SystemTableCache();

  cache.applySystemTableChange(TABLES.NODES, 'INSERT', {
    id: nodeId,
    node_id: nodeId,
    address: 'localhost:8080',
    status: 'active',
  });

  for (const tableName of AUTHORITATIVE_REPAIR_TABLES) {
    cache.applySystemTableChange(TABLES.TABLES, 'INSERT', {
      id: tableName,
      table_id: tableName,
      name: tableName,
      table_name: tableName,
    });
    cache.applySystemTableChange(TABLES.PARTITIONS, 'INSERT', {
      id: `${tableName}-p1`,
      partition_id: `${tableName}-p1`,
      table_id: tableName,
      table_name: tableName,
      partition_version: 1,
      state: 'NORMAL',
    });
    cache.applySystemTableChange(TABLES.SERVICES, 'INSERT', {
      service_id: `${tableName}-p1-r1`,
      service_type: 'partition',
      node_id: nodeId,
      partition_id: `${tableName}-p1`,
      replica_id: `${tableName}-p1-r1`,
      raft_role: 'leader',
      status: 'active',
      address: `${nodeId}/partition/${tableName}-p1-r1`,
    });
  }

  return cache;
}

/**
 * Create local partition-service replicas that answer direct table reads.
 * @param {SystemTableCache} cache
 * @param {Object<string, Array<Object>>} [overrides={}]
 * @return {Map<string, Object>}
 */
function createAuthoritativeRepairPartitionServices(
  cache, overrides = {},
) {
  const services = new Map();
  for (const tableName of AUTHORITATIVE_REPAIR_TABLES) {
    const rows = Array.isArray(overrides[tableName]) ?
      overrides[tableName] :
      cache.getAll(tableName);
    const partitionId = `${tableName}-p1`;
    services.set(partitionId, {
      partitionId,
      replicaId: `${partitionId}-r1`,
      initialized: true,
      db: {
        prepare(sql) {
          const statement = String(sql || '').trim();
          return {
            all() {
              const match = statement.match(/^SELECT \* FROM ([a-z_]+)$/i);
              if (!match) {
                throw new Error(`Unsupported local authoritative query: ${statement}`);
              }
              if (match[1].toLowerCase() !== tableName) {
                return [];
              }
              return rows.map((row) => ({...row}));
            },
          };
        },
      },
    });
  }
  return services;
}

/**
 * Create a populated system table cache.
 * @return {SystemTableCache} Populated cache.
 */
function createPopulatedCache() {
  const cache = new SystemTableCache();

  cache.applySystemTableChange('nodes', 'INSERT', {
    id: 'node-1',
    address: 'localhost:8080',
    status: 'active',
  });

  cache.applySystemTableChange('services', 'INSERT', {
    id: 'service-1',
    nodeId: 'node-1',
    type: 'partition',
  });

  cache.applySystemTableChange('partitions', 'INSERT', {
    id: 'partition-1',
    tableId: 'table-1',
    keyStart: null,
    keyEnd: null,
  });

  cache.applySystemTableChange('tables', 'INSERT', {
    id: 'table-1',
    name: 'test_table',
  });

  cache.applySystemTableChange('message_groups', 'INSERT', {
    id: 'mg-1',
    replicaCount: 3,
  });

  cache.applySystemTableChange('indices', 'INSERT', {
    id: 'index-1',
    tableId: 'table-1',
    column: 'name',
  });

  return cache;
}

/**
 * Add runtime service-definition and service-endpoint rows for discovery tests.
 * @param {SystemTableCache} cache
 */
function seedServiceDiscoveryRows(cache) {
  cache.applySystemTableChange(TABLES.SERVICE_DEFINITIONS, 'INSERT', {
    service_id: 'sys-postgres-wire',
    service_name: 'sys-postgres-wire',
    replica_count: 3,
    runtime_kind: 'native_js',
  });

  cache.applySystemTableChange(TABLES.SERVICE_ENDPOINTS, 'INSERT', {
    endpoint_id: 'sys-postgres-wire-ep-node-1',
    service_id: 'sys-postgres-wire',
    node_id: 'node-1',
    protocol: 'postgresql',
    address: '10.0.0.1',
    port: 5432,
    health_status: 'healthy',
    metadata: JSON.stringify({
      service_name: 'sys-postgres-wire',
      protocol: 'postgresql',
      version: '1.0.0',
    }),
    updated_at: Date.now(),
  });

  cache.applySystemTableChange(TABLES.SERVICE_ENDPOINTS, 'INSERT', {
    endpoint_id: 'sys-postgres-wire-ep-node-2',
    service_id: 'sys-postgres-wire',
    node_id: 'node-2',
    protocol: 'postgresql',
    address: '10.0.0.2',
    port: 5432,
    health_status: 'unhealthy',
    metadata: JSON.stringify({
      service_name: 'sys-postgres-wire',
      protocol: 'postgresql',
      version: '1.0.0',
    }),
    updated_at: Date.now(),
  });
}

/**
 * Seed table-scoped discovery rows where only one node hosts partition replicas.
 * This models routed queryability: all active postgres-wire nodes should remain
 * schema-ready when table metadata is available cluster-wide.
 *
 * @param {SystemTableCache} cache
 */
function seedRoutedTableDiscoveryRows(cache) {
  const updatedAt = Date.now();

  cache.applySystemTableChange(TABLES.NODES, 'INSERT', {
    id: 'node-2',
    address: 'localhost:8081',
    status: 'active',
  });

  cache.applySystemTableChange(TABLES.SERVICE_DEFINITIONS, 'INSERT', {
    service_id: 'sys-postgres-wire',
    service_name: 'sys-postgres-wire',
    replica_count: 2,
    runtime_kind: 'native_js',
  });

  cache.applySystemTableChange(TABLES.SERVICE_ENDPOINTS, 'INSERT', {
    endpoint_id: 'sys-postgres-wire-ep-node-1',
    service_id: 'sys-postgres-wire',
    node_id: 'node-1',
    protocol: 'postgresql',
    address: '10.0.0.1',
    port: 5432,
    health_status: 'healthy',
    metadata: JSON.stringify({
      service_name: 'sys-postgres-wire',
      protocol: 'postgresql',
      version: '1.0.0',
    }),
    updated_at: updatedAt,
  });

  cache.applySystemTableChange(TABLES.SERVICE_ENDPOINTS, 'INSERT', {
    endpoint_id: 'sys-postgres-wire-ep-node-2',
    service_id: 'sys-postgres-wire',
    node_id: 'node-2',
    protocol: 'postgresql',
    address: '10.0.0.2',
    port: 5432,
    health_status: 'healthy',
    metadata: JSON.stringify({
      service_name: 'sys-postgres-wire',
      protocol: 'postgresql',
      version: '1.0.0',
    }),
    updated_at: updatedAt,
  });

  cache.applySystemTableChange(TABLES.TABLES, 'INSERT', {
    id: 'table-benchmark-events',
    table_id: 'table-benchmark-events',
    name: 'benchmark_events',
    table_name: 'benchmark_events',
  });

  cache.applySystemTableChange(TABLES.PARTITIONS, 'INSERT', {
    id: 'partition-benchmark-events-1',
    partition_id: 'partition-benchmark-events-1',
    table_id: 'table-benchmark-events',
    table_name: 'benchmark_events',
    keyStart: null,
    keyEnd: null,
  });

  cache.applySystemTableChange(TABLES.SERVICES, 'INSERT', {
    id: 'service-benchmark-events-node-1',
    service_type: 'partition',
    partition_id: 'partition-benchmark-events-1',
    node_id: 'node-1',
    status: 'active',
    raft_role: 'leader',
    address: '10.0.0.1:7001',
  });
}

/**
 * Seed table-scoped discovery rows where a second node hosts a local learner
 * replica for the benchmark partition. The node remains routable for service
 * discovery, but benchmark admission must fail closed until the local replica
 * becomes voter-ready.
 *
 * @param {SystemTableCache} cache
 */
function seedTableDiscoveryRowsWithLocalLearner(cache) {
  seedRoutedTableDiscoveryRows(cache);

  cache.applySystemTableChange(TABLES.SERVICES, 'INSERT', {
    id: 'service-benchmark-events-node-2',
    service_type: 'partition',
    partition_id: 'partition-benchmark-events-1',
    node_id: 'node-2',
    status: 'active',
    raft_role: 'learner',
    address: '10.0.0.2:7001',
  });
}

/**
 * Seed table-scoped discovery rows where a second node hosts a local candidate
 * replica for the benchmark partition. The node remains routable for service
 * discovery, but benchmark admission must fail closed until the local replica
 * converges to a stable voter role.
 *
 * @param {SystemTableCache} cache
 */
function seedTableDiscoveryRowsWithLocalCandidate(cache) {
  seedRoutedTableDiscoveryRows(cache);

  cache.applySystemTableChange(TABLES.SERVICES, 'INSERT', {
    id: 'service-benchmark-events-node-2',
    service_type: 'partition',
    partition_id: 'partition-benchmark-events-1',
    node_id: 'node-2',
    status: 'active',
    raft_role: 'candidate',
    address: '10.0.0.2:7001',
  });
}

/**
 * Seed table-scoped discovery rows where a second node hosts a stable local
 * follower replica for the benchmark partition.
 *
 * @param {SystemTableCache} cache
 */
function seedTableDiscoveryRowsWithLocalFollower(cache) {
  seedRoutedTableDiscoveryRows(cache);

  cache.applySystemTableChange(TABLES.SERVICES, 'INSERT', {
    id: 'service-benchmark-events-node-2',
    service_type: 'partition',
    partition_id: 'partition-benchmark-events-1',
    node_id: 'node-2',
    status: 'active',
    raft_role: 'follower',
    address: '10.0.0.2:7001',
  });
}

/**
 * Seed table-scoped discovery rows without a local TABLES row.
 * This verifies applied schema watermark fallback from partition metadata.
 *
 * @param {SystemTableCache} cache
 * @param {number} updatedAt
 */
function seedPartitionScopedDiscoveryRowsWithoutTableRecord(cache, updatedAt) {
  cache.applySystemTableChange(TABLES.SERVICE_DEFINITIONS, 'INSERT', {
    service_id: 'sys-postgres-wire',
    service_name: 'sys-postgres-wire',
    replica_count: 1,
    runtime_kind: 'native_js',
  });

  cache.applySystemTableChange(TABLES.SERVICE_ENDPOINTS, 'INSERT', {
    endpoint_id: 'sys-postgres-wire-ep-node-1',
    service_id: 'sys-postgres-wire',
    node_id: 'node-1',
    protocol: 'postgresql',
    address: '10.0.0.1',
    port: 5432,
    health_status: 'healthy',
    metadata: JSON.stringify({
      service_name: 'sys-postgres-wire',
      protocol: 'postgresql',
      version: '1.0.0',
    }),
    updated_at: updatedAt,
  });

  cache.applySystemTableChange(TABLES.PARTITIONS, 'INSERT', {
    id: 'partition-benchmark-events-1',
    partition_id: 'partition-benchmark-events-1',
    table_id: 'table-benchmark-events',
    table_name: 'benchmark_events',
    keyStart: null,
    keyEnd: null,
    updated_at: updatedAt,
  });

  cache.applySystemTableChange(TABLES.SERVICES, 'INSERT', {
    id: 'service-benchmark-events-node-1',
    service_type: 'partition',
    partition_id: 'partition-benchmark-events-1',
    node_id: 'node-1',
    status: 'active',
    raft_role: 'leader',
    address: '10.0.0.1:7001',
  });
}

/**
 * Seed table-scoped discovery rows without local TABLES row and without
 * partition table_name metadata. Partition matching must rely on table_id.
 *
 * @param {SystemTableCache} cache
 * @param {number} updatedAt
 */
function seedPartitionScopedDiscoveryRowsWithoutTableName(cache, updatedAt) {
  cache.applySystemTableChange(TABLES.SERVICE_DEFINITIONS, 'INSERT', {
    service_id: 'sys-postgres-wire',
    service_name: 'sys-postgres-wire',
    replica_count: 1,
    runtime_kind: 'native_js',
  });

  cache.applySystemTableChange(TABLES.SERVICE_ENDPOINTS, 'INSERT', {
    endpoint_id: 'sys-postgres-wire-ep-node-1',
    service_id: 'sys-postgres-wire',
    node_id: 'node-1',
    protocol: 'postgresql',
    address: '10.0.0.1',
    port: 5432,
    health_status: 'healthy',
    metadata: JSON.stringify({
      service_name: 'sys-postgres-wire',
      protocol: 'postgresql',
      version: '1.0.0',
    }),
    updated_at: updatedAt,
  });

  cache.applySystemTableChange(TABLES.PARTITIONS, 'INSERT', {
    id: 'partition-benchmark-events-1',
    partition_id: 'partition-benchmark-events-1',
    table_id: 'table-benchmark-events',
    keyStart: null,
    keyEnd: null,
    updated_at: updatedAt,
  });

  cache.applySystemTableChange(TABLES.SERVICES, 'INSERT', {
    id: 'service-benchmark-events-node-1',
    service_type: 'partition',
    partition_id: 'partition-benchmark-events-1',
    node_id: 'node-1',
    status: 'active',
    raft_role: 'leader',
    address: '10.0.0.1:7001',
  });
}

/**
 * Connect to AdminWebSocketAPI in-process and wait for first message.
 * Avoids binding TCP ports (not permitted in some test sandboxes).
 * @param {AdminWebSocketAPI} api - Admin API instance.
 * @param {number} timeout - Timeout in ms.
 * @param {Object|null} [request] - Optional synthetic request.
 * @return {Promise<{ws: Object, message: Object}>}
 */
async function connectAndReceive(api, timeout = 2000, request = null) {
  const {clientSocket, serverSocket} = createInProcWebSocketPair();
  api.handleConnection(serverSocket, request);
  const message = await waitForMessage(clientSocket, timeout);
  return {ws: clientSocket, message};
}

/**
 * Wait for next message from WebSocket.
 * @param {WebSocket} ws - WebSocket instance.
 * @param {number} timeout - Timeout in ms.
 * @return {Promise<Object>} Parsed message.
 */
function waitForMessage(ws, timeout = 2000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error('Timeout waiting for message'));
    }, timeout);

    ws.once('message', (data) => {
      clearTimeout(timer);
      try {
        resolve(JSON.parse(data.toString()));
      } catch (e) {
        reject(e);
      }
    });
  });
}

/**
 * Assert no additional message arrives within timeout.
 * @param {Object} ws
 * @param {number} timeout
 * @return {Promise<void>}
 */
function waitForNoMessage(ws, timeout = 50) {
  return new Promise((resolve, reject) => {
    const onMessage = () => {
      clearTimeout(timer);
      reject(new Error('Unexpected message received'));
    };
    const timer = setTimeout(() => {
      ws.off('message', onMessage);
      resolve();
    }, timeout);
    ws.once('message', onMessage);
  });
}

/**
 * Create a mock test-run service for HTTP route tests.
 * @param {Object} [overrides]
 * @return {Object}
 */
function createMockTestRunService(overrides = {}) {
  return {
    readDashboardPage: async () => '<html><body>dashboard</body></html>',
    readPlaybackViewer: async () => '<html><body>viewer</body></html>',
    listAvailableTests: async () => [],
    listAvailableConfigs: async () => [],
    listSavedRuns: async () => [],
    getRun: async (_runId) => null,
    startRun: async (_payload) => {
      throw new Error('startRun not mocked');
    },
    stopRun: async (_runId) => {
      throw new Error('stopRun not mocked');
    },
    deleteRun: async (_runId) => {
      throw new Error('deleteRun not mocked');
    },
    subscribeToRun: (_runId, _listener) => null,
    readOutputAsset: async (_path) => null,
    ...overrides,
  };
}

/**
 * Create a mock debug metadata store for debug ingress route tests.
 * @param {Object} [overrides]
 * @return {Object}
 */
function createMockDebugMetadataStore(overrides = {}) {
  return {
    createSession: async (request) => ({
      sessionId: request.sessionId || 'session-1',
      tenantId: request.securityContext.tenantId,
      serviceName: request.serviceName || 'svc-debug',
      status: 'active',
      createdAt: Date.now(),
      updatedAt: Date.now(),
    }),
    getSession: async (request) => ({
      sessionId: request.sessionId,
      tenantId: request.securityContext.tenantId,
      serviceName: 'svc-debug',
      status: 'active',
      createdAt: Date.now(),
      updatedAt: Date.now(),
    }),
    attachSession: async (request) => ({
      sessionId: request.sessionId,
      tenantId: request.securityContext.tenantId,
      serviceName: 'svc-debug',
      status: 'active',
      createdAt: Date.now(),
      updatedAt: Date.now(),
    }),
    updateSession: async (request) => ({
      sessionId: request.sessionId,
      tenantId: request.securityContext.tenantId,
      serviceName: request.serviceName || 'svc-debug',
      lineageId: request.lineageId || null,
      stageId: request.stageId || null,
      endpoint: request.endpoint || null,
      nodeId: request.nodeId || null,
      status: request.status || 'active',
      createdAt: Date.now(),
      updatedAt: Date.now(),
    }),
    detachSession: async (request) => ({
      sessionId: request.sessionId,
      tenantId: request.securityContext.tenantId,
      serviceName: 'svc-debug',
      lineageId: null,
      stageId: null,
      endpoint: null,
      nodeId: null,
      status: 'detached',
      createdAt: Date.now(),
      updatedAt: Date.now(),
    }),
    writeBreakpoints: async (_request) => ([
      {
        breakpointId: 'bp-1',
        lineNumber: 10,
        resolved: true,
      },
    ]),
    listBreakpoints: async (_request) => ([
      {
        breakpointId: 'bp-1',
        lineNumber: 10,
        resolved: true,
      },
    ]),
    writeSnapshot: async (_request) => ({
      snapshotId: 'snapshot-1',
      sessionId: 'session-1',
      frameCount: 2,
      hostCallCount: 1,
      envelope: Buffer.from([1, 2, 3]),
    }),
    listSnapshots: async (_request) => ([
      {
        snapshotId: 'snapshot-1',
        sessionId: 'session-1',
        frameCount: 2,
        hostCallCount: 1,
      },
    ]),
    getSnapshot: async (_request) => ({
      snapshotId: 'snapshot-1',
      sessionId: 'session-1',
      frameCount: 2,
      hostCallCount: 1,
      envelope: Buffer.from([1, 2, 3]),
    }),
    ...overrides,
  };
}

test('AdminWebSocketAPI - initialization', async (t) => {
  const api = new AdminWebSocketAPI({nodeId: 'test-node'});

  t.equal(api.isInitialized(), false, 'should not be initialized initially');

  await api.initialize(0, {listen: false});

  t.equal(api.isInitialized(), true, 'should be initialized after init');
  t.equal(api.getClientCount(), 0, 'should have no clients initially');

  await api.shutdown();
  t.equal(api.isInitialized(), false, 'should not be initialized after shutdown');
});

test('AdminWebSocketAPI - cache dump on connection', async (t) => {
  const cache = createPopulatedCache();
  const api = new AdminWebSocketAPI({
    nodeId: 'test-node',
    systemTableCache: cache,
  });

  await api.initialize(0, {listen: false});
  const {ws, message} = await connectAndReceive(api);

  t.equal(message.type, MessageType.CACHE_DUMP, 'should receive cache_dump');
  t.ok(message.timestamp, 'should have timestamp');
  t.ok(message.data, 'should have data');
  t.ok(Array.isArray(message.data.nodes), 'should have nodes array');
  t.ok(Array.isArray(message.data.services), 'should have services array');
  t.ok(Array.isArray(message.data.partitions), 'should have partitions array');
  t.ok(Array.isArray(message.data.tables), 'should have tables array');
  t.ok(Array.isArray(message.data.message_groups), 'should have message_groups');
  t.ok(Array.isArray(message.data.indices), 'should have indices array');
  t.ok(Array.isArray(message.data.service_definitions),
    'should have service_definitions array');
  t.ok(Array.isArray(message.data.service_endpoints),
    'should have service_endpoints array');
  t.ok(Array.isArray(message.data.latency_groups),
    'should include latency_groups in cache dump');
  t.ok(Array.isArray(message.data.inter_group_latencies),
    'should include inter_group_latencies in cache dump');
  t.equal(message.data.nodes.length, 1, 'should have 1 node');
  t.equal(message.data.nodes[0].id, 'node-1', 'should have correct node');

  ws.close();
  await api.shutdown();
});

test('AdminWebSocketAPI - multiple concurrent connections', async (t) => {
  const api = new AdminWebSocketAPI({
    nodeId: 'test-node',
    systemTableCache: createPopulatedCache(),
  });

  await api.initialize(0, {listen: false});

  const [conn1, conn2, conn3] = await Promise.all([
    connectAndReceive(api),
    connectAndReceive(api),
    connectAndReceive(api),
  ]);

  t.equal(api.getClientCount(), 3, 'should have 3 connected clients');

  conn1.ws.close();
  await new Promise((resolve) => setTimeout(resolve, 50));

  t.equal(api.getClientCount(), 2, 'should have 2 clients after disconnect');

  conn2.ws.close();
  conn3.ws.close();
  await api.shutdown();
});

test('AdminWebSocketAPI - query execution SELECT', async (t) => {
  const api = new AdminWebSocketAPI({
    nodeId: 'test-node',
    systemTableCache: createPopulatedCache(),
    sqlQueryEngine: createMockQueryEngine(),
  });

  await api.initialize(0, {listen: false});
  const {ws} = await connectAndReceive(api);

  ws.send(JSON.stringify({
    type: MessageType.QUERY,
    queryId: 'q1',
    sql: 'SELECT * FROM test_table',
  }));

  const result = await waitForMessage(ws);

  t.equal(result.type, MessageType.QUERY_RESULT, 'should receive query_result');
  t.equal(result.queryId, 'q1', 'should have correct queryId');
  t.ok(Array.isArray(result.results), 'should have results array');
  t.equal(result.count, 1, 'should have count');
  t.ok(Array.isArray(result.partitions), 'should have partitions array');
  t.equal(result.tableName, 'test_table', 'should have tableName');

  ws.close();
  await api.shutdown();
});

test('AdminWebSocketAPI - load lane sheds queries when routing is not ready',
  async (t) => {
    let executedQueryCount = 0;
    const api = new AdminWebSocketAPI({
      nodeId: 'test-node',
      systemTableCache: createPopulatedCache(),
      sqlQueryEngine: {
        executeRequest: async () => {
          executedQueryCount += 1;
          return {
            success: true,
            rows: [{id: '1'}],
            count: 1,
          };
        },
      },
      controlPlaneReadinessService: {
        getNodeReadinessSync: () => ({
          nodeId: 'test-node',
          dimensions: {
            routingReady: false,
            clusterMemberHealthy: false,
            serveEligible: false,
          },
          reasons: [
            {code: 'routing_not_ready'},
            {code: 'cluster_member_unhealthy'},
          ],
        }),
      },
    });

    await api.initialize(0, {listen: false});
    const {ws} = await connectAndReceive(api, 2000, {
      query: {lane: 'load'},
    });

    ws.send(JSON.stringify({
      type: MessageType.QUERY,
      queryId: 'q-load-lane-shed',
      sql: 'SELECT 1',
    }));

    const result = await waitForMessage(ws);
    t.equal(result.type, MessageType.QUERY_RESULT,
      'should return query_result envelope');
    t.equal(result.queryId, 'q-load-lane-shed',
      'should preserve query id');
    t.equal(result.errorCode, ErrorCode.INTERNAL_ERROR,
      'shed result should surface as a typed admin error');
    t.match(
      String(result.error || ''),
      /serve not ready/i,
      'shed result should expose serve-not-ready reason',
    );
    t.equal(executedQueryCount, 0,
      'load-lane admission should reject before SQL execution');

    ws.close();
    await api.shutdown();
  });

test('AdminWebSocketAPI - load lane uses serveEligible instead of ' +
  'repair-only readiness', async (t) => {
  let executedQueryCount = 0;
  const api = new AdminWebSocketAPI({
    nodeId: 'test-node',
    systemTableCache: createPopulatedCache(),
    sqlQueryEngine: {
      executeRequest: async () => {
        executedQueryCount += 1;
        return {
          success: true,
          rows: [{id: '1'}],
          count: 1,
        };
      },
    },
    controlPlaneReadinessService: {
      getNodeReadinessSync: () => ({
        nodeId: 'test-node',
        dimensions: {
          routingReady: true,
          clusterMemberHealthy: true,
          repairEligible: true,
          serveEligible: false,
          loadReady: false,
        },
        reasons: [
          {code: 'load_not_ready'},
        ],
      }),
    },
  });

  await api.initialize(0, {listen: false});
  const {ws} = await connectAndReceive(api, 2000, {
    query: {lane: 'load'},
  });

  ws.send(JSON.stringify({
    type: MessageType.QUERY,
    queryId: 'q-load-lane-serve-gate',
    sql: 'SELECT 1',
  }));

  const result = await waitForMessage(ws);
  t.equal(result.type, MessageType.QUERY_RESULT,
    'should return query_result envelope');
  t.equal(result.queryId, 'q-load-lane-serve-gate',
    'should preserve query id');
  t.equal(result.errorCode, ErrorCode.INTERNAL_ERROR,
    'serve-only readiness rejection should surface as a typed admin error');
  t.match(
    String(result.error || ''),
    /serve not ready/i,
    'load-lane admission must be keyed off serveEligible',
  );
  t.equal(executedQueryCount, 0,
    'load-lane admission should reject before SQL execution');

  ws.close();
  await api.shutdown();
});

test('AdminWebSocketAPI - query_result preserves retry metadata for deferred failures',
  async (t) => {
    const api = new AdminWebSocketAPI({
      nodeId: 'test-node',
      systemTableCache: createPopulatedCache(),
      sqlQueryEngine: {
        executeRequest: async () => ({
          success: false,
          error: 'Distributed operation failed due to participant failures',
          errorCode: ErrorCode.INTERNAL_ERROR,
          deferRetry: true,
          retryAfterMs: 275,
        }),
      },
    });

    await api.initialize(0, {listen: false});
    const {ws} = await connectAndReceive(api, 2000);

    ws.send(JSON.stringify({
      type: MessageType.QUERY,
      queryId: 'q-retry-metadata',
      sql: 'SELECT 1',
    }));

    const result = await waitForMessage(ws);
    t.equal(result.type, MessageType.QUERY_RESULT,
      'should return query_result envelope');
    t.equal(result.queryId, 'q-retry-metadata',
      'should preserve query id');
    t.equal(result.errorCode, ErrorCode.INTERNAL_ERROR,
      'should preserve error code');
    t.equal(result.deferRetry, true,
      'should preserve deferRetry on failed query results');
    t.equal(result.retryAfterMs, 275,
      'should preserve retryAfterMs on failed query results');

    ws.close();
    await api.shutdown();
  });

test('AdminWebSocketAPI - load lane prefers async readiness when available',
  async (t) => {
    let executedQueryCount = 0;
    const api = new AdminWebSocketAPI({
      nodeId: 'test-node',
      systemTableCache: createPopulatedCache(),
      sqlQueryEngine: {
        executeRequest: async () => {
          executedQueryCount += 1;
          return {
            success: true,
            rows: [{id: '1'}],
            count: 1,
          };
        },
      },
      controlPlaneReadinessService: {
        getNodeReadinessSync: () => ({
          nodeId: 'test-node',
          dimensions: {
            serveEligible: false,
          },
          reasons: [
            {code: 'storage_budget_unavailable'},
          ],
        }),
        async getNodeReadiness() {
          return {
            nodeId: 'test-node',
            dimensions: {
              routingReady: true,
              clusterMemberHealthy: true,
              repairEligible: true,
              serveEligible: true,
              loadReady: true,
            },
            reasons: [],
          };
        },
      },
    });

    await api.initialize(0, {listen: false});
    const {ws} = await connectAndReceive(api, 2000, {
      query: {lane: 'load'},
    });

    ws.send(JSON.stringify({
      type: MessageType.QUERY,
      queryId: 'q-load-lane-async-readiness',
      sql: 'SELECT 1',
    }));

    const result = await waitForMessage(ws);
    t.equal(result.type, MessageType.QUERY_RESULT,
      'should return query_result envelope');
    t.equal(result.error, undefined,
      'async readiness should admit the load-lane query');
    t.equal(executedQueryCount, 1,
      'async readiness should allow SQL execution');

    ws.close();
    await api.shutdown();
  });

test('AdminWebSocketAPI - load lane requests authoritative readiness refresh',
  async (t) => {
    let executedQueryCount = 0;
    const readinessCalls = [];
    const api = new AdminWebSocketAPI({
      nodeId: 'test-node',
      systemTableCache: createPopulatedCache(),
      sqlQueryEngine: {
        executeRequest: async () => {
          executedQueryCount += 1;
          return {
            success: true,
            rows: [{id: '1'}],
            count: 1,
          };
        },
      },
      controlPlaneReadinessService: {
        async getNodeReadiness(nodeId, options) {
          readinessCalls.push({nodeId, options});
          return {
            nodeId,
            dimensions: {
              routingReady: true,
              clusterMemberHealthy: true,
              repairEligible: true,
              serveEligible: true,
              loadReady: true,
            },
            reasons: [],
          };
        },
      },
    });

    await api.initialize(0, {listen: false});
    const {ws} = await connectAndReceive(api, 2000, {
      query: {lane: 'load'},
    });

    ws.send(JSON.stringify({
      type: MessageType.QUERY,
      queryId: 'q-load-lane-authoritative-refresh',
      sql: 'SELECT 1',
    }));

    const result = await waitForMessage(ws);
    t.equal(result.type, MessageType.QUERY_RESULT,
      'should return query_result envelope');
    t.equal(result.error, undefined,
      'authoritative readiness refresh should admit the load-lane query');
    t.equal(executedQueryCount, 1,
      'admitted load-lane query should execute once');
    t.same(
      readinessCalls,
      [{
        nodeId: 'test-node',
        options: {
          allowAuthoritativeRefresh: true,
          preferBackgroundRefreshOnIneligible: true,
          decisionDimension: 'serveEligible',
          maxCachedAgeMs: 5000,
        },
      }],
      'load-lane admission should request cached authoritative readiness',
    );

    ws.close();
    await api.shutdown();
  });

test('AdminWebSocketAPI - repeated load lane requests reuse cached readiness',
  async (t) => {
    let executedQueryCount = 0;
    const readinessCalls = [];
    const api = new AdminWebSocketAPI({
      nodeId: 'test-node',
      systemTableCache: createPopulatedCache(),
      sqlQueryEngine: {
        executeRequest: async () => {
          executedQueryCount += 1;
          return {
            success: true,
            rows: [{id: String(executedQueryCount)}],
            count: 1,
          };
        },
      },
      controlPlaneReadinessService: {
        async getNodeReadiness(nodeId, options) {
          readinessCalls.push({nodeId, options});
          return {
            nodeId,
            dimensions: {
              routingReady: true,
              clusterMemberHealthy: true,
              repairEligible: true,
              serveEligible: true,
              loadReady: true,
            },
            reasons: [],
          };
        },
      },
    });

    await api.initialize(0, {listen: false});
    const {ws} = await connectAndReceive(api, 2000, {
      query: {lane: 'load'},
    });

    ws.send(JSON.stringify({
      type: MessageType.QUERY,
      queryId: 'q-load-lane-cached-readiness-1',
      sql: 'SELECT 1',
    }));
    const firstResult = await waitForMessage(ws);
    t.equal(firstResult.type, MessageType.QUERY_RESULT);

    ws.send(JSON.stringify({
      type: MessageType.QUERY,
      queryId: 'q-load-lane-cached-readiness-2',
      sql: 'SELECT 2',
    }));
    const secondResult = await waitForMessage(ws);
    t.equal(secondResult.type, MessageType.QUERY_RESULT);

    t.equal(executedQueryCount, 2, 'both load queries should execute');
    t.same(
      readinessCalls,
      [{
        nodeId: 'test-node',
        options: {
          allowAuthoritativeRefresh: true,
          preferBackgroundRefreshOnIneligible: true,
          decisionDimension: 'serveEligible',
          maxCachedAgeMs: 5000,
        },
      }, {
        nodeId: 'test-node',
        options: {
          allowAuthoritativeRefresh: true,
          preferBackgroundRefreshOnIneligible: true,
          decisionDimension: 'serveEligible',
          maxCachedAgeMs: 5000,
        },
      }],
      'load-lane readiness should consistently request the ' +
        'cached snapshot window',
    );

    ws.close();
    await api.shutdown();
  });

test('AdminWebSocketAPI - query execution INSERT', async (t) => {
  const api = new AdminWebSocketAPI({
    nodeId: 'test-node',
    systemTableCache: createPopulatedCache(),
    sqlQueryEngine: createMockQueryEngine(),
  });

  await api.initialize(0, {listen: false});
  const {ws} = await connectAndReceive(api);

  ws.send(JSON.stringify({
    type: MessageType.QUERY,
    queryId: 'q2',
    sql: 'INSERT INTO test_table (id, name) VALUES (1, "test")',
  }));

  const result = await waitForMessage(ws);

  t.equal(result.type, MessageType.QUERY_RESULT, 'should receive query_result');
  t.equal(result.queryId, 'q2', 'should have correct queryId');
  t.equal(result.operation, 'INSERT', 'should have operation');
  t.equal(result.affectedRows, 1, 'should have affectedRows');
  t.ok(Array.isArray(result.partitions), 'should have partitions');
  t.equal(result.tableName, 'test_table', 'should have tableName');

  ws.close();
  await api.shutdown();
});

test('AdminWebSocketAPI - query execution UPDATE', async (t) => {
  const api = new AdminWebSocketAPI({
    nodeId: 'test-node',
    systemTableCache: createPopulatedCache(),
    sqlQueryEngine: createMockQueryEngine(),
  });

  await api.initialize(0, {listen: false});
  const {ws} = await connectAndReceive(api);

  ws.send(JSON.stringify({
    type: MessageType.QUERY,
    queryId: 'q3',
    sql: 'UPDATE test_table SET name = "updated"',
  }));

  const result = await waitForMessage(ws);

  t.equal(result.operation, 'UPDATE', 'should have UPDATE operation');
  t.equal(result.affectedRows, 2, 'should have affectedRows');

  ws.close();
  await api.shutdown();
});

test('AdminWebSocketAPI - query execution DELETE', async (t) => {
  const api = new AdminWebSocketAPI({
    nodeId: 'test-node',
    systemTableCache: createPopulatedCache(),
    sqlQueryEngine: createMockQueryEngine(),
  });

  await api.initialize(0, {listen: false});
  const {ws} = await connectAndReceive(api);

  ws.send(JSON.stringify({
    type: MessageType.QUERY,
    queryId: 'q4',
    sql: 'DELETE FROM test_table WHERE id = 1',
  }));

  const result = await waitForMessage(ws);

  t.equal(result.operation, 'DELETE', 'should have DELETE operation');
  t.equal(result.affectedRows, 1, 'should have affectedRows');

  ws.close();
  await api.shutdown();
});

test('AdminWebSocketAPI - partition callback execution route', async (t) => {
  let capturedRequest = null;
  const api = new AdminWebSocketAPI({
    nodeId: 'test-node',
    systemTableCache: createPopulatedCache(),
    sqlQueryEngine: {
      executeRequest: async (request) => {
        capturedRequest = request;
        return {
          success: true,
          executionMode: request.executionMode,
          callbackModuleRef: request.callbackModuleRef,
          callbackExport: request.callbackExport,
          results: [],
          hostResult: {
            state: 'completed',
            processedPartitions: 2,
            failedPartitions: 0,
            totalRows: 4,
          },
        };
      },
    },
  });

  await api.initialize(0, {listen: false});
  const {ws} = await connectAndReceive(api);

  ws.send(JSON.stringify({
    type: MessageType.PARTITION_CALLBACK,
    queryId: 'cb1',
    statement: 'SELECT * FROM test_table',
    parameters: [],
    callbackModuleRef: 'mod-1',
    callbackExport: 'run',
    runtimeKind: 'wasm_component',
  }));

  const result = await waitForMessage(ws);

  t.equal(result.type, MessageType.QUERY_RESULT, 'should receive query_result');
  t.equal(result.queryId, 'cb1', 'should include callback queryId');
  t.equal(result.operation, 'partition_callback',
    'should label operation as partition_callback');
  t.same(result.hostResult, {
    state: 'completed',
    processedPartitions: 2,
    failedPartitions: 0,
    totalRows: 4,
  }, 'should include structured host result');
  t.equal(capturedRequest.executionMode, 'partition_callback',
    'should route request through partition_callback mode');
  t.equal(capturedRequest.callbackModuleRef, 'mod-1',
    'should pass callbackModuleRef to SqlRequest');
  t.equal(capturedRequest.callbackExport, 'run',
    'should pass callbackExport to SqlRequest');
  t.equal(capturedRequest.runtimeKind, 'wasm_component',
    'should pass runtimeKind to SqlRequest');

  ws.close();
  await api.shutdown();
});

test('AdminWebSocketAPI - partition callback validation requires callback fields',
  async (t) => {
    const api = new AdminWebSocketAPI({
      nodeId: 'test-node',
      systemTableCache: createPopulatedCache(),
      sqlQueryEngine: createMockQueryEngine(),
    });

    await api.initialize(0, {listen: false});
    const {ws} = await connectAndReceive(api);

    ws.send(JSON.stringify({
      type: MessageType.PARTITION_CALLBACK,
      queryId: 'cb-invalid',
      statement: 'SELECT * FROM test_table',
      callbackExport: 'run',
      runtimeKind: 'wasm_component',
    }));

    const result = await waitForMessage(ws);
    t.equal(result.type, MessageType.QUERY_RESULT, 'should return query_result envelope');
    t.equal(result.queryId, 'cb-invalid', 'should preserve query id');
    t.equal(result.errorCode, ErrorCode.MALFORMED_JSON,
      'should return malformed error for missing module ref');
    t.ok(result.error, 'should include validation error');

    ws.close();
    await api.shutdown();
  });

test('AdminWebSocketAPI - error handling TABLE_NOT_FOUND', async (t) => {
  const api = new AdminWebSocketAPI({
    nodeId: 'test-node',
    systemTableCache: createPopulatedCache(),
    sqlQueryEngine: createMockQueryEngine(),
  });

  await api.initialize(0, {listen: false});
  const {ws} = await connectAndReceive(api);

  ws.send(JSON.stringify({
    type: MessageType.QUERY,
    queryId: 'q5',
    sql: 'SELECT * FROM invalid_table',
  }));

  const result = await waitForMessage(ws);

  t.equal(result.type, MessageType.QUERY_RESULT, 'should receive query_result');
  t.equal(result.queryId, 'q5', 'should have correct queryId');
  t.ok(result.error, 'should have error');
  t.equal(result.errorCode, ErrorCode.TABLE_NOT_FOUND, 'should have error code');

  ws.close();
  await api.shutdown();
});

test('AdminWebSocketAPI - error handling SYNTAX_ERROR', async (t) => {
  const api = new AdminWebSocketAPI({
    nodeId: 'test-node',
    systemTableCache: createPopulatedCache(),
    sqlQueryEngine: createMockQueryEngine(),
  });

  await api.initialize(0, {listen: false});
  const {ws} = await connectAndReceive(api);

  ws.send(JSON.stringify({
    type: MessageType.QUERY,
    queryId: 'q6',
    sql: 'syntax_error',
  }));

  const result = await waitForMessage(ws);

  t.equal(result.errorCode, ErrorCode.SYNTAX_ERROR, 'should have SYNTAX_ERROR');

  ws.close();
  await api.shutdown();
});

test('AdminWebSocketAPI - malformed JSON handling', async (t) => {
  const api = new AdminWebSocketAPI({
    nodeId: 'test-node',
    systemTableCache: createPopulatedCache(),
  });

  await api.initialize(0, {listen: false});
  const {ws} = await connectAndReceive(api);

  ws.send('not valid json');

  const result = await waitForMessage(ws);

  t.equal(result.errorCode, ErrorCode.MALFORMED_JSON, 'should have error code');
  t.ok(result.error, 'should have error message');
  t.ok(result.hint, 'should have hint');

  ws.close();
  await api.shutdown();
});

test('AdminWebSocketAPI - unknown message type ignored', async (t) => {
  const api = new AdminWebSocketAPI({
    nodeId: 'test-node',
    systemTableCache: createPopulatedCache(),
    sqlQueryEngine: createMockQueryEngine(),
  });

  await api.initialize(0, {listen: false});
  const {ws} = await connectAndReceive(api);

  // Send unknown message type (should be ignored)
  ws.send(JSON.stringify({type: 'unknown_type', data: 'test'}));

  // Send a valid query
  ws.send(JSON.stringify({
    type: MessageType.QUERY,
    queryId: 'q7',
    sql: 'SELECT 1',
  }));

  const result = await waitForMessage(ws);

  t.equal(result.type, MessageType.QUERY_RESULT, 'should receive query result');
  t.equal(result.queryId, 'q7', 'should have correct queryId');

  ws.close();
  await api.shutdown();
});

test('AdminWebSocketAPI - refresh message', async (t) => {
  const api = new AdminWebSocketAPI({
    nodeId: 'test-node',
    systemTableCache: createPopulatedCache(),
  });

  await api.initialize(0, {listen: false});
  const {ws, message: firstDump} = await connectAndReceive(api);

  t.equal(firstDump.type, MessageType.CACHE_DUMP, 'should receive initial dump');

  ws.send(JSON.stringify({type: MessageType.REFRESH}));

  const secondDump = await waitForMessage(ws);
  t.equal(secondDump.type, MessageType.CACHE_DUMP, 'should receive refresh dump');

  ws.close();
  await api.shutdown();
});

test('AdminWebSocketAPI - CDC event broadcasting', async (t) => {
  const api = new AdminWebSocketAPI({
    nodeId: 'test-node',
    systemTableCache: createPopulatedCache(),
  });

  await api.initialize(0, {listen: false});

  const [conn1, conn2] = await Promise.all([
    connectAndReceive(api),
    connectAndReceive(api),
  ]);

  // Broadcast CDC event
  api.broadcastCDCEvent('nodes', 'INSERT', {
    id: 'node-2',
    address: 'localhost:8081',
    status: 'active',
  });

  const [event1, event2] = await Promise.all([
    waitForMessage(conn1.ws),
    waitForMessage(conn2.ws),
  ]);

  t.equal(event1.type, MessageType.CDC_EVENT, 'client 1 should receive event');
  t.equal(event1.table, 'nodes', 'should have correct table');
  t.equal(event1.operation, 'insert', 'should have correct operation');
  t.equal(event1.record.id, 'node-2', 'should have correct record');

  t.equal(event2.type, MessageType.CDC_EVENT, 'client 2 should receive event');

  conn1.ws.close();
  conn2.ws.close();
  await api.shutdown();
});

test('AdminWebSocketAPI - health endpoint', async (t) => {
  const api = new AdminWebSocketAPI({
    nodeId: 'test-node',
    systemTableCache: createPopulatedCache(),
  });

  await api.initialize(0, {listen: false});
  await connectAndReceive(api);

  const response = await api.getFastify().inject({method: 'GET', url: '/health'});
  const health = response.json();

  t.equal(response.statusCode, 200, 'should return 200');
  t.equal(health.status, 'healthy', 'should be healthy');
  t.equal(health.nodeId, 'test-node', 'should have nodeId');
  t.equal(health.connectedClients, 1, 'should have 1 connected client');

  await api.shutdown();
});

test('AdminWebSocketAPI - local CDC diagnostics endpoint shape and readiness',
  async (t) => {
    const cache = createPopulatedCache();
    cache.applySystemTableChange(TABLES.PARTITIONS, 'INSERT', {
      id: 'partition-2',
      partition_id: 'partition-2',
      table_id: 'table-1',
      state: 'NORMAL',
    });
    const partitionServices = new Map([
      ['partition-1', {
        partitionId: 'partition-1',
        getCDCSubscriptionDiagnostics: () => ({
          subscriberCount: 1,
          bufferedEvents: 0,
          bufferReplayInFlight: false,
        }),
      }],
      ['partition-2', {
        partitionId: 'partition-2',
        getCDCSubscriptionDiagnostics: () => ({
          subscriberCount: 0,
          bufferedEvents: 3,
          bufferReplayInFlight: true,
        }),
      }],
    ]);
    const api = new AdminWebSocketAPI({
      nodeId: 'test-node',
      systemTableCache: cache,
      partitionServices,
      cdcIntegrationService: {
        getAuthoritativeFallbackDiagnostics: () => ({
          schemaVersion: 1,
          nodeId: 'test-node',
          windowMs: 60000,
          totalCount: 7,
          windowCount: 2,
          windowRatePerMinute: 2,
          phases: {
            bootstrap: {windowCount: 0, totalCount: 0},
            recovery: {windowCount: 0, totalCount: 0},
            steady_state: {windowCount: 2, totalCount: 7},
          },
          outcomes: {
            recovered: {windowCount: 2, totalCount: 7},
            failed: {windowCount: 0, totalCount: 0},
          },
          byTable: {},
          recentEvents: [],
        }),
      },
    });

    await api.initialize(0, {listen: false});
    const response = await api.getFastify().inject({
      method: 'GET',
      url: ADMIN_ROUTE.CDC_DIAGNOSTICS,
    });
    const payload = response.json();

    t.equal(response.statusCode, 200, 'should return 200');
    t.equal(
      payload.schemaVersion,
      ADMIN_OPERATIONAL_DIAGNOSTICS.CDC_SCHEMA_VERSION,
      'should expose CDC diagnostics schema version',
    );
    t.equal(payload.localPartitionCount, 2, 'should include local partition count');
    t.equal(payload.diagnosticsAvailablePartitionCount, 2,
      'should count available diagnostics');
    t.equal(payload.readyLocalPartitionCount, 1,
      'should count local partitions that are CDC-ready');
    t.same(payload.noSubscriberPartitionIds, ['partition-2'],
      'should flag partitions without subscribers');
    t.same(payload.bufferedPartitionIds, ['partition-2'],
      'should flag partitions with buffered CDC backlog');
    t.equal(payload.telemetry.subscriberCount, 1,
      'telemetry should aggregate local subscriber counts');
    t.equal(payload.telemetry.bufferedEvents, 3,
      'telemetry should aggregate buffered event backlog');
    t.equal(payload.telemetry.authoritativeFallback.totalCount, 7,
      'telemetry should include authoritative fallback diagnostics');

    await api.shutdown();
  });

test('AdminWebSocketAPI - local partition diagnostics endpoint exposes leader and replica state',
  async (t) => {
    const cache = new SystemTableCache();
    cache.applySystemTableChange(TABLES.PARTITIONS, 'INSERT', {
      partition_id: 'partition-1',
      table_id: 'table-1',
      table_name: 'events',
      state: 'NORMAL',
      leader_node_id: 'node-1',
    });
    cache.applySystemTableChange(TABLES.SERVICES, 'INSERT', {
      service_id: 'partition-1-r1',
      service_type: 'partition',
      partition_id: 'partition-1',
      replica_id: 'partition-1-r1',
      node_id: 'node-1',
      raft_role: 'leader',
      status: 'active',
      address: 'node-1/partition/partition-1-r1',
    });
    cache.applySystemTableChange(TABLES.SERVICES, 'INSERT', {
      service_id: 'partition-1-r2',
      service_type: 'partition',
      partition_id: 'partition-1',
      replica_id: 'partition-1-r2',
      node_id: 'node-2',
      raft_role: 'follower',
      status: 'active',
      address: 'node-2/partition/partition-1-r2',
    });
    cache.applySystemTableChange(TABLES.REPLICA_OPERATIONS, 'INSERT', {
      operation_id: 'op-1',
      partition_id: 'partition-1',
      status: 'creating',
    });
    const api = new AdminWebSocketAPI({
      nodeId: 'test-node',
      systemTableCache: cache,
    });

    await api.initialize(0, {listen: false});
    const response = await api.getFastify().inject({
      method: 'GET',
      url: ADMIN_ROUTE.PARTITION_DIAGNOSTICS,
    });
    const payload = response.json();

    t.equal(response.statusCode, 200, 'should return 200');
    t.equal(
      payload.schemaVersion,
      ADMIN_OPERATIONAL_DIAGNOSTICS.PARTITION_SCHEMA_VERSION,
      'should expose partition diagnostics schema version',
    );
    t.equal(payload.partitionCount, 1, 'should include partition count');
    t.equal(payload.leaders['partition-1'], 'node-1',
      'should include canonical partition leader');
    t.equal(payload.replicaOperations.inFlightCount, 1,
      'should include in-flight replica operation count');
    t.equal(payload.partitionsById['partition-1'].voterCount, 2,
      'should include per-partition voter count');
    t.equal(payload.partitionsById['partition-1'].replicaCount, 2,
      'should include per-partition replica count');
    t.equal(payload.partitionsById['partition-1'].activeReplicaCount, 2,
      'should include per-partition active replica count');
    t.equal(
      payload.partitionsById['partition-1'].replicaRoleDiagnostics
        .inconsistentReplicaRoles,
      false,
      'should expose replica-role consistency status',
    );

    await api.shutdown();
  });

test('AdminWebSocketAPI - local SQL diagnostics endpoint exposes coordinator metrics',
  async (t) => {
    const cache = createPopulatedCache();
    const api = new AdminWebSocketAPI({
      nodeId: 'test-node',
      systemTableCache: cache,
      sqlQueryEngine: {
        executeRequest: async () => ({success: true, rows: []}),
        queryTimeoutMs: 1234,
        queryExecutor: {
          getLastCoordinatorMetrics: () => ({
            totalLatencyMs: 42,
            medianLatencyMs: 21,
            stragglers: [],
          }),
        },
        resolveProvisionTargetNodeIdsWithDiagnostics: () => ({
          nodeIds: ['node-1'],
          diagnostics: {
            selectedNodeIds: ['node-1'],
            resolvedNodeIds: ['node-1'],
            usedDegradedFallback: false,
          },
        }),
        lastTransactionRecoveryReplayResult: {
          totalRecovered: 2,
          resumed: 2,
          failed: 0,
          results: [],
        },
        lastWriteSplitEvaluationByTable: new Map([
          ['table-1', {evaluated: true}],
        ]),
        partitionSplitMergeManager: {
          getEvaluationDiagnostics: () => ({
            state: 'IDLE',
          }),
        },
      },
    });

    await api.initialize(0, {listen: false});
    const response = await api.getFastify().inject({
      method: 'GET',
      url: ADMIN_ROUTE.SQL_DIAGNOSTICS,
    });
    const payload = response.json();

    t.equal(response.statusCode, 200, 'should return 200');
    t.equal(
      payload.schemaVersion,
      ADMIN_OPERATIONAL_DIAGNOSTICS.SQL_SCHEMA_VERSION,
      'should expose SQL diagnostics schema version',
    );
    t.equal(payload.queryEngineAvailable, true,
      'should report SQL query engine availability');
    t.equal(payload.queryEngine.timeoutMs, 1234,
      'should expose SQL query timeout budget');
    t.equal(payload.queryEngine.fanoutMetricsAvailable, true,
      'should indicate fanout coordinator metrics availability');
    t.equal(payload.queryEngine.lastCoordinatorMetrics.totalLatencyMs, 42,
      'should expose last coordinator total latency');
    t.same(payload.queryEngine.provisionTargetDiagnostics.selectedNodeIds, ['node-1'],
      'should include provision-target diagnostics');
    t.equal(payload.queryEngine.trackedWriteSplitEvaluations, 1,
      'should expose tracked write split evaluations');
    t.equal(payload.splitEvaluation.state, 'IDLE',
      'should expose split-evaluation diagnostics from SQL owner');

    await api.shutdown();
  });

test('AdminWebSocketAPI - operational diagnostics routes fail closed without cache',
  async (t) => {
    const api = new AdminWebSocketAPI({
      nodeId: 'test-node',
      enableAdminStream: false,
    });

    await api.initialize(0, {listen: false});
    const cdcResponse = await api.getFastify().inject({
      method: 'GET',
      url: ADMIN_ROUTE.CDC_DIAGNOSTICS,
    });
    const partitionResponse = await api.getFastify().inject({
      method: 'GET',
      url: ADMIN_ROUTE.PARTITION_DIAGNOSTICS,
    });
    const sqlResponse = await api.getFastify().inject({
      method: 'GET',
      url: ADMIN_ROUTE.SQL_DIAGNOSTICS,
    });

    t.equal(cdcResponse.statusCode, 503,
      'CDC diagnostics should fail closed without system cache');
    t.equal(cdcResponse.json().error, ADMIN_ERROR_MESSAGE.CDC_DIAGNOSTICS_UNAVAILABLE,
      'CDC diagnostics should return unavailable error message');
    t.equal(partitionResponse.statusCode, 503,
      'partition diagnostics should fail closed without system cache');
    t.equal(
      partitionResponse.json().error,
      ADMIN_ERROR_MESSAGE.PARTITION_DIAGNOSTICS_UNAVAILABLE,
      'partition diagnostics should return unavailable error message',
    );
    t.equal(sqlResponse.statusCode, 503,
      'SQL diagnostics should fail closed without system cache');
    t.equal(sqlResponse.json().error, ADMIN_ERROR_MESSAGE.SQL_DIAGNOSTICS_UNAVAILABLE,
      'SQL diagnostics should return unavailable error message');

    await api.shutdown();
  });

test('AdminWebSocketAPI - local control snapshot endpoint shape and non-mutation',
  async (t) => {
    let executeRequestCalls = 0;
    const cache = createPopulatedCache();
    cache.applySystemTableChange('replica_operations', 'INSERT', {
      operation_id: 'op-1',
      status: 'creating',
    });
    cache.applySystemTableChange('replica_operations', 'INSERT', {
      operation_id: 'op-2',
      status: 'active',
    });
    const beforeCounts = {
      nodes: cache.count(TABLES.NODES),
      partitions: cache.count(TABLES.PARTITIONS),
      services: cache.count(TABLES.SERVICES),
      replicaOperations: cache.count(TABLES.REPLICA_OPERATIONS),
    };
    const api = new AdminWebSocketAPI({
      nodeId: 'test-node',
      systemTableCache: cache,
      sqlQueryEngine: {
        executeRequest: async () => {
          executeRequestCalls++;
          return {success: true, rows: []};
        },
      },
    });

    await api.initialize(0, {listen: false});

    const startedAt = Date.now();
    const response = await api.getFastify().inject({
      method: 'GET',
      url: '/api/admin/control-snapshot?scope=local',
    });
    const elapsedMs = Date.now() - startedAt;
    const payload = response.json();

    t.equal(response.statusCode, 200, 'should return 200 for local snapshot');
    t.equal(elapsedMs < 100, true, 'should respond within local snapshot bound');
    t.equal(payload.schemaVersion, 1, 'should expose schema version');
    t.equal(payload.nodeId, 'test-node', 'should include current node id');
    t.equal(Array.isArray(payload.nodes), true, 'should include nodes array');
    t.equal(Array.isArray(payload.partitions), true, 'should include partitions array');
    t.equal(typeof payload.leaders, 'object', 'should include leaders map');
    t.equal(typeof payload.replicaRoles, 'object', 'should include replica-role detail');
    t.equal(typeof payload.replicaRoleDiagnostics, 'object',
      'should include replica-role diagnostics');
    t.equal(typeof payload.voterCounts, 'object', 'should include voter-count map');
    t.equal(typeof payload.cdcTelemetry, 'object', 'should include cdc telemetry');
    t.equal(typeof payload.cdcTelemetry.authoritativeFallback, 'object',
      'should include authoritative fallback telemetry');
    t.equal(typeof payload.replicaOperations, 'object',
      'should include replica operation summary');
    t.equal(
      Number.isInteger(payload.replicaOperations.inFlightCount),
      true,
      'should include in-flight operation count',
    );
    t.equal(
      typeof payload.replicaOperations.statusHistogram,
      'object',
      'should include status histogram',
    );
    t.equal(
      typeof payload.replicaOperations.partitionGroupInFlight,
      'object',
      'should include partition-group in-flight summary',
    );
    t.equal(
      payload.replicaOperations.partitionGroupInFlight.unknown,
      1,
      'creating operation without explicit partition id should be grouped',
    );
    t.equal(executeRequestCalls, 0,
      'local snapshot endpoint should not execute SQL query engine requests');

    t.equal(cache.count(TABLES.NODES), beforeCounts.nodes, 'should not mutate nodes table');
    t.equal(cache.count(TABLES.PARTITIONS), beforeCounts.partitions,
      'should not mutate partitions table');
    t.equal(cache.count(TABLES.SERVICES), beforeCounts.services,
      'should not mutate services table');
    t.equal(cache.count(TABLES.REPLICA_OPERATIONS), beforeCounts.replicaOperations,
      'should not mutate replica operations table');

    await api.shutdown();
  });

test('AdminWebSocketAPI - local control snapshot exports authoritative fallback telemetry',
  async (t) => {
    const cache = createPopulatedCache();
    const api = new AdminWebSocketAPI({
      nodeId: 'test-node',
      systemTableCache: cache,
      cdcIntegrationService: {
        getAuthoritativeFallbackDiagnostics: () => ({
          schemaVersion: 1,
          nodeId: 'test-node',
          windowMs: 60000,
          totalCount: 3,
          windowCount: 2,
          windowRatePerMinute: 2,
          phases: {
            bootstrap: {windowCount: 0, totalCount: 0},
            recovery: {windowCount: 0, totalCount: 0},
            steady_state: {windowCount: 2, totalCount: 3},
          },
          outcomes: {
            recovered: {windowCount: 2, totalCount: 3},
            failed: {windowCount: 0, totalCount: 0},
          },
          byTable: {
            nodes: {windowCount: 2, totalCount: 3, lastRecordedAt: Date.now()},
          },
          recentEvents: [],
        }),
      },
    });

    await api.initialize(0, {listen: false});

    const response = await api.getFastify().inject({
      method: 'GET',
      url: '/api/admin/control-snapshot?scope=local',
    });
    const payload = response.json();

    t.equal(response.statusCode, 200, 'should return 200 for local snapshot');
    t.equal(payload.cdcTelemetry.authoritativeFallback.totalCount, 3,
      'should export fallback totals');
    t.equal(payload.cdcTelemetry.authoritativeFallback.phases.steady_state.windowCount, 2,
      'should export steady-state fallback window counts');

    await api.shutdown();
  });

test('AdminWebSocketAPI - local control snapshot derives canonical leaders ' +
  'from partition owner rows', async (t) => {
    const cache = new SystemTableCache();
    cache.applySystemTableChange(TABLES.PARTITIONS, 'INSERT', {
      [COLUMN.PARTITION_ID]: 'partition-1',
      [COLUMN.TABLE_ID]: 'table-1',
      [COLUMN.LEADER_NODE_ID]: 'node-owner',
    });
    cache.applySystemTableChange(TABLES.SERVICES, 'INSERT', {
      [COLUMN.SERVICE_ID]: 'partition-1-r1',
      [COLUMN.SERVICE_TYPE]: 'partition',
      [COLUMN.PARTITION_ID]: 'partition-1',
      [COLUMN.REPLICA_ID]: 'partition-1-r1',
      [COLUMN.NODE_ID]: 'node-stale-a',
      [COLUMN.RAFT_ROLE]: 'leader',
      [COLUMN.STATUS]: 'active',
      [COLUMN.ADDRESS]: 'node-stale-a/partition/partition-1-r1',
    });
    cache.applySystemTableChange(TABLES.SERVICES, 'INSERT', {
      [COLUMN.SERVICE_ID]: 'partition-1-r2',
      [COLUMN.SERVICE_TYPE]: 'partition',
      [COLUMN.PARTITION_ID]: 'partition-1',
      [COLUMN.REPLICA_ID]: 'partition-1-r2',
      [COLUMN.NODE_ID]: 'node-stale-b',
      [COLUMN.RAFT_ROLE]: 'leader',
      [COLUMN.STATUS]: 'active',
      [COLUMN.ADDRESS]: 'node-stale-b/partition/partition-1-r2',
    });

    const api = new AdminWebSocketAPI({
      nodeId: 'test-node',
      systemTableCache: cache,
      sqlQueryEngine: {
        executeRequest: async () => ({success: true, rows: []}),
      },
    });

    await api.initialize(0, {listen: false});

    const response = await api.getFastify().inject({
      method: 'GET',
      url: '/api/admin/control-snapshot?scope=local',
    });
    const payload = response.json();

    t.equal(payload.leaders['partition-1'], 'node-owner',
      'canonical leader should come from partitions.leader_node_id');
    t.same(payload.replicaRoles['partition-1'], {
      'partition-1-r1': 'leader',
      'partition-1-r2': 'leader',
    }, 'replica-role detail should remain available separately');
    t.same(payload.replicaRoleDiagnostics['partition-1'], {
      canonicalLeaderNodeId: 'node-owner',
      source: 'partitions',
      inconsistentReplicaRoles: true,
      replicaLeaderNodeIds: ['node-stale-a', 'node-stale-b'],
      issues: [CONSISTENCY_MISMATCH_KIND.REPLICA_ROLE],
    }, 'snapshot should surface replica-role inconsistency without changing canonical leader');

    await api.shutdown();
  });

test(
  'AdminWebSocketAPI - local control snapshot ignores stale ADD rows once exact target replica services are active',
  async (t) => {
    const cache = createPopulatedCache();
    cache.applySystemTableChange(TABLES.PARTITIONS, 'INSERT', {
      partition_id: 'partition-1',
      table_id: 'table-1',
      table_name: 'events',
      state: 'NORMAL',
      leader_node_id: 'node-1',
    });
    cache.applySystemTableChange(TABLES.SERVICES, 'INSERT', {
      service_id: 'partition-1-r1',
      service_type: 'partition',
      partition_id: 'partition-1',
      replica_id: 'partition-1-r1',
      node_id: 'node-1',
      raft_role: 'leader',
      status: 'active',
      address: 'node-1/partition/partition-1-r1',
    });
    cache.applySystemTableChange(TABLES.SERVICES, 'INSERT', {
      service_id: 'partition-1-r2',
      service_type: 'partition',
      partition_id: 'partition-1',
      replica_id: 'partition-1-r2',
      node_id: 'node-2',
      raft_role: 'follower',
      status: 'active',
      address: 'node-2/partition/partition-1-r2',
    });
    cache.applySystemTableChange(TABLES.REPLICA_OPERATIONS, 'INSERT', {
      operation_id: 'op-add-stale-active-replica',
      type: 'ADD',
      partition_id: 'partition-1',
      entity_type: 'partition',
      entity_id: 'partition-1',
      source_node_id: 'node-1',
      target_node_id: 'node-2',
      replica_id: 'partition-1-r2',
      status: 'creating',
      workflow_step: 'CREATING',
      created_at: 1741000000000,
      updated_at: 1741000001000,
    });
    const api = new AdminWebSocketAPI({
      nodeId: 'test-node',
      systemTableCache: cache,
      sqlQueryEngine: createMockQueryEngine(),
    });

    const result = await api.buildControlSnapshotQueryResult();
    const payload = result?.rows?.[0] || null;
    const timeline =
      payload?.replicaOperations?.operationTimelineById
        ?.['op-add-stale-active-replica'] || [];
    const currentStateEntry = timeline[timeline.length - 1] || null;

    t.equal(
      payload?.replicaOperations?.inFlightCount,
      0,
      'control snapshot should not count stale ADD rows once the exact target replica is active',
    );
    t.equal(
      currentStateEntry?.inFlight,
      false,
      'replica-operation timeline should mark the current state as non-blocking after observed service convergence',
    );
  },
);

test('AdminWebSocketAPI - local control snapshot exposes structured control-plane diagnostics',
  async (t) => {
    const workflowId = 'split-table-1-partition-1-v2';
    const readinessRequests = [];
    const splitEvaluationDiagnostics = {
      state: 'IDLE',
      evaluationIntervalMs: 60000,
      reactiveEvaluationDebounceMs: 1000,
      inFlight: false,
      requestedEvaluationPending: false,
      requestedAtMs: 1709510460100,
      requestedReasonCodes: ['write_activity'],
      requestedPartitionIds: ['table-1-p1'],
      lastStartedAtMs: 1709510460200,
      lastCompletedAtMs: 1709510460300,
      lastDurationMs: 100,
      lastError: null,
      lastSummary: {
        evaluated: true,
        partitionsEvaluated: 3,
        splitCandidateCount: 2,
        executedSplitCount: 1,
        splitDeferredCount: 1,
        splitErrorCount: 0,
        mergeCandidateCount: 0,
      },
    };
    const cache = createPopulatedCache();
    const originalLogsTableInstance = LogsTableService.instance;
    LogsTableService.instance = {
      getStats() {
        return {
          pendingWrites: 4,
          pendingWriteGrowthCount: 2,
          retainedBacklogGrowthCount: 1,
          retainedPressureBacklogCap: 16,
          maxPendingWrites: 32,
          isWriting: true,
          consecutiveDeferredWriteFailures: 3,
          sharedPressureBackpressured: true,
        };
      },
    };
    t.teardown(() => {
      LogsTableService.instance = originalLogsTableInstance;
    });
    cache.applySystemTableChange(TABLES.TABLES, 'UPDATE', {
      id: 'table-1',
      partition_transition_state: 'failed',
      partition_transition_metadata: JSON.stringify({
        workflowId,
        sourcePartitionId: 'partition-1',
        targetPartitionIds: ['partition-1-left', 'partition-1-right'],
        admission: {
          decisionType: 'blocked',
          blockingReasons: [{
            code: 'metadata_publication_degraded',
          }],
        },
        failure: {
          classification: 'split_execution_failure',
          timeoutClassification: {
            classification: 'cache_visibility_timeout',
            boundaryHit: true,
            nestedOperation: 'table_partition_metadata_wait',
          },
        },
      }),
    });

    const api = new AdminWebSocketAPI({
      nodeId: 'node-1',
      systemTableCache: cache,
      controlPlaneReadinessService: {
        async getAllNodeReadiness(options = {}) {
          readinessRequests.push(options);
          return [{
            nodeId: 'node-1',
            nodeEvidence: {
              lastHeartbeat: 1000,
              heartbeatAgeMs: 25,
              readyLeaseExpiresAt: 1200,
              readyLeaseAgeMs: -175,
            },
            dimensions: {
              processAlive: true,
              clusterMemberHealthy: true,
              routingReady: true,
              loadReady: true,
              placementEligible: false,
              controlPlaneWritable: false,
              metadataPublicationHealthy: false,
            },
            reasons: [{
              code: 'metadata_publication_degraded',
            }],
            publication: {
              currentMode: 'conservative_fanout',
              reasonCode: 'grouped_delivery_failed',
              enteredAt: '2026-03-04T00:00:00.000Z',
              recentTransitions: [{
                mode: 'conservative_fanout',
                reasonCode: 'grouped_delivery_failed',
              }],
            },
          }];
        },
        getReadinessTransitionHistoryByNodeId() {
          return {
            'node-1': [{
              nodeId: 'node-1',
              observedAt: '2026-03-04T00:01:00.000Z',
              observedAtMs: 1709510460000,
              previousServeEligible: true,
              serveEligible: false,
              previousRepairEligible: true,
              repairEligible: false,
              reasonCodes: ['metadata_publication_degraded'],
              flippedDimensions: ['serveEligible', 'repairEligible'],
              rawInputs: {
                heartbeatAgeMs: 25,
                readyLeaseLagMs: -175,
              },
            }],
          };
        },
      },
      heartbeatService: {
        getHeartbeatPublicationDiagnostics() {
          return {
            publicationPath: 'node_state_reporter',
            targetAddress: 'seed-1/message-group/mg-1',
            targetNodeId: 'seed-1',
            targetServiceType: 'message-group',
            targetServiceId: 'mg-1',
            lastAttemptAt: '2026-03-04T00:02:00.000Z',
            lastSuccessAt: '2026-03-04T00:02:00.100Z',
            lastFailureAt: null,
            lastFailureStage: null,
            lastFailureReason: null,
            consecutiveFailures: 0,
          };
        },
      },
      sqlQueryEngine: {
        executeRequest: async () => ({success: true, rows: []}),
        partitionSplitMergeManager: {
          getEvaluationDiagnostics() {
            return splitEvaluationDiagnostics;
          },
        },
      },
    });

    await api.initialize(0, {listen: false});
    api.controlSnapshot.resolveLocalPartitionServices = () => new Map([
      ['partition-1', {
        getStats() {
          return {
            partitionId: 'partition-1',
            cdcReplay: {
              bufferedEvents: 7,
              replayBufferGrowthCount: 3,
              replayRetryDepth: 2,
              replayInFlight: true,
            },
          };
        },
      }],
    ]);

    const response = await api.getFastify().inject({
      method: 'GET',
      url: '/api/admin/control-snapshot?scope=local',
    });
    const payload = response.json();
    const diagnostics = payload.controlPlaneDiagnostics;

    t.equal(response.statusCode, 200, 'should return 200 for local snapshot');
    t.equal(
      diagnostics.publicationMode.currentMode,
      'conservative_fanout',
      'snapshot should expose canonical publication mode',
    );
    t.equal(
      diagnostics.readinessByNodeId['node-1'].dimensions.placementEligible,
      false,
      'snapshot should expose per-node readiness dimensions',
    );
    t.same(
      diagnostics.placementEligibilityByNodeId['node-1'].reasonCodes,
      ['metadata_publication_degraded'],
      'snapshot should expose placement-eligibility reason codes',
    );
    t.equal(
      diagnostics.workflowAdmissionsByWorkflowId[workflowId].blockingReasons[0].code,
      'metadata_publication_degraded',
      'snapshot should expose persisted workflow admission reasons',
    );
    t.equal(
      diagnostics.heartbeatPublication.targetAddress,
      'seed-1/message-group/mg-1',
      'snapshot should expose heartbeat publication target diagnostics',
    );
    t.equal(
      diagnostics.nodeLivenessByNodeId['node-1'].heartbeatAgeMs,
      25,
      'snapshot should expose node heartbeat age for current readiness',
    );
    t.equal(
      diagnostics.readinessTransitionsByNodeId['node-1'][0].serveEligible,
      false,
      'snapshot should expose recent readiness eligibility flips',
    );
    t.ok(readinessRequests.length >= 1,
      'control snapshot should request readiness at least once');
    t.same(
      readinessRequests[0],
      {
        allowAuthoritativeRefresh: true,
        allowStaleOnCacheChange: true,
        maxCachedAgeMs: 5000,
      },
      'control snapshot should request cached authoritative refresh',
    );
    t.equal(
      diagnostics.timeoutClassifications[0].timeoutClassification.classification,
      'cache_visibility_timeout',
      'snapshot should expose persisted timeout classifications',
    );
    t.equal(
      diagnostics.splitEvaluation.lastSummary.splitCandidateCount,
      2,
      'snapshot should expose split-evaluation candidate count from owner',
    );
    t.same(
      diagnostics.splitEvaluation.requestedReasonCodes,
      ['write_activity'],
      'snapshot should expose pending split-evaluation request reasons',
    );
    t.equal(
      diagnostics.logsTable.pendingWriteGrowthCount,
      2,
      'snapshot should expose logs-table retained-object growth diagnostics',
    );
    t.equal(
      diagnostics.cdcReplay.bufferedEvents,
      7,
      'snapshot should expose aggregated CDC replay backlog diagnostics',
    );
    t.equal(
      diagnostics.cdcReplayByPartitionId['partition-1'].replayRetryDepth,
      2,
      'snapshot should expose bounded per-partition CDC replay diagnostics',
    );

    const preflightResult =
      await api.buildPreflightCriticalPathSnapshotQueryResult();
    t.equal(
      preflightResult.rows[0].controlPlaneDiagnostics.publicationMode.currentMode,
      'conservative_fanout',
      'preflight snapshot should carry the same control-plane diagnostics block',
    );

    await api.shutdown();
  });

test('AdminWebSocketAPI - local control snapshot derives active nodes from readiness and canonical websocket endpoints',
  async (t) => {
    const cache = createPopulatedCache();
    cache.applySystemTableChange(TABLES.NODES, 'UPDATE', {
      id: 'node-1',
      node_id: 'node-1',
      status: 'active',
      connection_state: 'ready',
      last_heartbeat: 1000,
      ready_lease_expires_at: 2000,
    });
    cache.applySystemTableChange(TABLES.NODES, 'INSERT', {
      id: 'node-2',
      node_id: 'node-2',
      status: 'active',
      connection_state: 'ready',
      last_heartbeat: 1000,
      ready_lease_expires_at: 2000,
    });
    cache.applySystemTableChange(TABLES.NODES, 'INSERT', {
      id: 'node-3',
      node_id: 'node-3',
      status: 'active',
      connection_state: 'ready',
      last_heartbeat: 1000,
      ready_lease_expires_at: 2000,
    });
    cache.applySystemTableChange(TABLES.NODE_ENDPOINTS, 'INSERT', {
      endpoint_id: 'node-1-ws',
      node_id: 'node-1',
      transport_type: 'ws',
      status: 'active',
      address: 'ws://node-1:8082',
    });
    cache.applySystemTableChange(TABLES.NODE_ENDPOINTS, 'INSERT', {
      endpoint_id: 'node-2-ws',
      node_id: 'node-2',
      transport_type: 'ws',
      status: 'active',
      address: 'ws://node-2:8082',
    });

    const api = new AdminWebSocketAPI({
      nodeId: 'node-1',
      systemTableCache: cache,
      controlPlaneReadinessService: {
        async getAllNodeReadiness() {
          return [{
            nodeId: 'node-1',
            dimensions: {
              [CONTROL_PLANE_READINESS_DIMENSION.CLUSTER_MEMBER_HEALTHY]: true,
            },
          }, {
            nodeId: 'node-2',
            dimensions: {
              [CONTROL_PLANE_READINESS_DIMENSION.CLUSTER_MEMBER_HEALTHY]: false,
            },
          }, {
            nodeId: 'node-3',
            dimensions: {
              [CONTROL_PLANE_READINESS_DIMENSION.CLUSTER_MEMBER_HEALTHY]: true,
            },
          }];
        },
      },
    });

    await api.initialize(0, {listen: false});
    t.teardown(async () => {
      await api.shutdown();
    });

    const response = await api.getFastify().inject({
      method: 'GET',
      url: '/api/admin/control-snapshot?scope=local',
    });

    t.equal(response.statusCode, 200, 'should return 200 for local snapshot');
    t.same(
      response.json().nodes,
      ['node-1'],
      'snapshot should publish only readiness-healthy nodes with canonical websocket endpoints',
    );
  });

test('AdminWebSocketAPI - local control snapshot keeps readiness-healthy service-visible nodes when node rows lag the cache',
  async (t) => {
    const cache = createPopulatedCache();
    cache.applySystemTableChange(TABLES.NODES, 'UPDATE', {
      id: 'node-1',
      node_id: 'node-1',
      status: 'active',
      connection_state: 'ready',
      last_heartbeat: 1000,
      ready_lease_expires_at: 2000,
    });
    cache.applySystemTableChange(TABLES.SERVICES, 'INSERT', {
      service_id: 'svc-node-1',
      service_type: SERVICE_TYPE.MESSAGE_GROUP,
      node_id: 'node-1',
      status: 'active',
      address: 'node-1/message-group/svc-node-1',
      group_id: 'mg-node-1',
      replica_id: 'svc-node-1',
    });
    cache.applySystemTableChange(TABLES.SERVICES, 'INSERT', {
      service_id: 'svc-node-2',
      service_type: SERVICE_TYPE.MESSAGE_GROUP,
      node_id: 'node-2',
      status: 'active',
      address: 'node-2/message-group/svc-node-2',
      group_id: 'mg-node-2',
      replica_id: 'svc-node-2',
    });
    cache.applySystemTableChange(TABLES.NODE_ENDPOINTS, 'INSERT', {
      endpoint_id: 'node-1-ws',
      node_id: 'node-1',
      transport_type: 'ws',
      status: 'active',
      address: 'ws://node-1:8082',
    });
    cache.applySystemTableChange(TABLES.NODE_ENDPOINTS, 'INSERT', {
      endpoint_id: 'node-2-ws',
      node_id: 'node-2',
      transport_type: 'ws',
      status: 'active',
      address: 'ws://node-2:8082',
    });

    const api = new AdminWebSocketAPI({
      nodeId: 'node-1',
      systemTableCache: cache,
      controlPlaneReadinessService: {
        async getAllNodeReadiness() {
          return [{
            nodeId: 'node-1',
            dimensions: {
              [CONTROL_PLANE_READINESS_DIMENSION.CLUSTER_MEMBER_HEALTHY]: true,
            },
          }, {
            nodeId: 'node-2',
            dimensions: {
              [CONTROL_PLANE_READINESS_DIMENSION.CLUSTER_MEMBER_HEALTHY]: true,
            },
          }];
        },
      },
    });

    await api.initialize(0, {listen: false});
    t.teardown(async () => {
      await api.shutdown();
    });

    const response = await api.getFastify().inject({
      method: 'GET',
      url: '/api/admin/control-snapshot?scope=local',
    });

    t.equal(response.statusCode, 200, 'should return 200 for local snapshot');
    t.same(
      response.json().nodes,
      ['node-1', 'node-2'],
      'snapshot should keep readiness-healthy peers visible when their node row lags behind active service and endpoint evidence',
    );
  });

test('AdminWebSocketAPI - local control snapshot keeps readiness-healthy peers when node_endpoints lag repaired service rows',
  async (t) => {
    const cache = createPopulatedCache();
    cache.applySystemTableChange(TABLES.NODES, 'UPDATE', {
      id: 'node-1',
      node_id: 'node-1',
      status: 'active',
      connection_state: 'ready',
      last_heartbeat: 1000,
      ready_lease_expires_at: 2000,
    });
    cache.applySystemTableChange(TABLES.NODES, 'INSERT', {
      id: 'node-2',
      node_id: 'node-2',
      status: 'active',
      connection_state: 'ready',
      last_heartbeat: 1000,
      ready_lease_expires_at: 2000,
    });
    cache.applySystemTableChange(TABLES.SERVICES, 'INSERT', {
      service_id: 'svc-node-1',
      service_type: SERVICE_TYPE.MESSAGE_GROUP,
      node_id: 'node-1',
      status: 'active',
      address: 'node-1/message-group/svc-node-1',
      group_id: 'mg-node-1',
      replica_id: 'svc-node-1',
    });
    cache.applySystemTableChange(TABLES.SERVICES, 'INSERT', {
      service_id: 'svc-node-2',
      service_type: SERVICE_TYPE.MESSAGE_GROUP,
      node_id: 'node-2',
      status: 'active',
      address: 'node-2/message-group/svc-node-2',
      group_id: 'mg-node-2',
      replica_id: 'svc-node-2',
    });
    cache.applySystemTableChange(TABLES.NODE_ENDPOINTS, 'INSERT', {
      endpoint_id: 'node-1-ws',
      node_id: 'node-1',
      transport_type: 'ws',
      status: 'active',
      address: 'ws://node-1:8082',
    });

    const api = new AdminWebSocketAPI({
      nodeId: 'node-1',
      systemTableCache: cache,
      controlPlaneReadinessService: {
        async getAllNodeReadiness() {
          return [{
            nodeId: 'node-1',
            dimensions: {
              [CONTROL_PLANE_READINESS_DIMENSION.CLUSTER_MEMBER_HEALTHY]: true,
            },
          }, {
            nodeId: 'node-2',
            dimensions: {
              [CONTROL_PLANE_READINESS_DIMENSION.CLUSTER_MEMBER_HEALTHY]: true,
            },
          }];
        },
      },
    });

    await api.initialize(0, {listen: false});
    t.teardown(async () => {
      await api.shutdown();
    });

    const response = await api.getFastify().inject({
      method: 'GET',
      url: '/api/admin/control-snapshot?scope=local',
    });

    t.equal(response.statusCode, 200, 'should return 200 for local snapshot');
    t.same(
      response.json().nodes,
      ['node-1', 'node-2'],
      'snapshot should keep healthy peers visible when service rows are repaired before endpoint rows',
    );
  });

test('AdminWebSocketAPI - local control snapshot query avoids distributed fanout',
  async (t) => {
    let executeRequestCalls = 0;
    const api = new AdminWebSocketAPI({
      nodeId: 'test-node',
      systemTableCache: createPopulatedCache(),
      sqlQueryEngine: {
        executeRequest: async () => {
          executeRequestCalls++;
          return {success: true, rows: [{id: 'unexpected'}]};
        },
      },
    });

    await api.initialize(0, {listen: false});
    const {ws} = await connectAndReceive(api);

    const startedAt = Date.now();
    ws.send(JSON.stringify({
      type: MessageType.QUERY,
      queryId: 'q-control-snapshot',
      sql: 'SELECT * FROM control_snapshot_local()',
    }));

    const response = await waitForMessage(ws);
    const elapsedMs = Date.now() - startedAt;

    t.equal(response.type, MessageType.QUERY_RESULT, 'should return query_result');
    t.equal(response.queryId, 'q-control-snapshot', 'should preserve query id');
    t.equal(elapsedMs < 100, true, 'query should complete within local bound');
    t.equal(Array.isArray(response.results), true, 'query result should include rows');
    t.equal(response.results.length, 1, 'query should return one snapshot row');
    t.equal(response.results[0].schemaVersion, 1, 'query should expose snapshot schema');
    t.equal(typeof response.results[0].voterCounts, 'object',
      'query result should include voter-count map');
    t.equal(executeRequestCalls, 0,
      'local control snapshot query should not execute distributed SQL requests');

    ws.close();
    await api.shutdown();
  });

test(
  'AdminWebSocketAPI - snapshot lane control snapshot query stays local ' +
    'under stale cache conditions',
  async (t) => {
    const nowMs = 1740589945123;
    const staleHeartbeatMs = nowMs - 45000;
    const writableCache = createAuthoritativeRepairCache('node-local');
    writableCache.applySystemTableChange(TABLES.NODES, 'UPDATE', {
      id: 'node-local',
      node_id: 'node-local',
      address: 'localhost:8080',
      node_address: 'localhost:8080',
      status: 'active',
      connection_state: 'ready',
      last_heartbeat: staleHeartbeatMs,
      ready_lease_expires_at: staleHeartbeatMs + 15000,
    });

    const repairEngine = createSystemTableRepairQueryEngine({
      [TABLES.NODES]: writableCache.getAll(TABLES.NODES),
      [TABLES.PARTITIONS]: writableCache.getAll(TABLES.PARTITIONS),
      [TABLES.SERVICES]: writableCache.getAll(TABLES.SERVICES),
      [TABLES.TABLES]: writableCache.getAll(TABLES.TABLES),
      [TABLES.NODE_ENDPOINTS]: writableCache.getAll(TABLES.NODE_ENDPOINTS),
      [TABLES.SERVICE_DEFINITIONS]:
        writableCache.getAll(TABLES.SERVICE_DEFINITIONS),
      [TABLES.SERVICE_ENDPOINTS]:
        writableCache.getAll(TABLES.SERVICE_ENDPOINTS),
      [TABLES.REPLICA_OPERATIONS]:
        writableCache.getAll(TABLES.REPLICA_OPERATIONS),
    });
    const readinessCalls = [];
    const api = new AdminWebSocketAPI({
      nodeId: 'node-local',
      systemTableCache: createReadOnlyCache(writableCache),
      cacheMutationTarget: writableCache,
      sqlQueryEngine: repairEngine,
      controlPlaneReadinessService: {
        async getAllNodeReadiness(options) {
          readinessCalls.push(options);
          return [];
        },
      },
      nowFn: () => nowMs,
    });

    const result = await api.executeLocalQueryEnvelope(
      {
        queryId: 'q-snapshot-local-only',
        sql: 'SELECT * FROM control_snapshot_local()',
        params: [],
      },
      {
        clientInfo: {
          lane: 'snapshot',
        },
      },
    );

    t.equal(result.success, true, 'snapshot lane query should succeed');
    t.equal(
      repairEngine.executeRequestCalls.length,
      0,
      'snapshot lane query should not trigger authoritative repair reads',
    );
    t.same(
      readinessCalls,
      [{
        allowAuthoritativeRefresh: false,
        allowStaleOnCacheChange: true,
        maxCachedAgeMs: 5000,
      }],
      'snapshot lane query should keep readiness diagnostics local',
    );
  },
);

test('AdminWebSocketAPI - forced control snapshot query routes through ' +
  'authoritative repair path', async (t) => {
  const writableCache = createPopulatedCache();
  const repairEngine = createSystemTableRepairQueryEngine({
    [TABLES.NODES]: writableCache.getAll(TABLES.NODES),
    [TABLES.PARTITIONS]: writableCache.getAll(TABLES.PARTITIONS),
    [TABLES.SERVICES]: writableCache.getAll(TABLES.SERVICES),
    [TABLES.TABLES]: writableCache.getAll(TABLES.TABLES),
    [TABLES.NODE_ENDPOINTS]: writableCache.getAll(TABLES.NODE_ENDPOINTS),
    [TABLES.SERVICE_DEFINITIONS]:
      writableCache.getAll(TABLES.SERVICE_DEFINITIONS),
    [TABLES.SERVICE_ENDPOINTS]:
      writableCache.getAll(TABLES.SERVICE_ENDPOINTS),
    [TABLES.REPLICA_OPERATIONS]:
      writableCache.getAll(TABLES.REPLICA_OPERATIONS),
  });
  const api = new AdminWebSocketAPI({
    nodeId: 'test-node',
    systemTableCache: createReadOnlyCache(writableCache),
    cacheMutationTarget: writableCache,
    controlPlaneSystemTableGateway: createAuthoritativeCacheGateway(writableCache, {
      queryEngine: repairEngine,
    }),
    sqlQueryEngine: repairEngine,
  });

  const result = await api.executeLocalQueryEnvelope({
    queryId: 'q-force-control-snapshot',
    sql: ADMIN_CONTROL_SNAPSHOT.QUERY_SQL_FORCE_REPAIR,
    params: [],
  });
  t.equal(result.success, true, 'forced control snapshot query should succeed');
  t.equal(Array.isArray(result.rows), true, 'forced query should return one snapshot row');
  t.equal(
    repairEngine.executeRequestCalls.includes(`SELECT * FROM ${TABLES.PARTITIONS}`),
    true,
    'forced control snapshot query should run authoritative repair reads',
  );
});

test(
  'AdminWebSocketAPI - forced control snapshot query fails when authoritative repair cannot apply',
  async (t) => {
    const writableCache = createPopulatedCache();
    const authoritativeGateway = createAuthoritativeCacheGateway(writableCache, {
      readRowsByTable: {
        [TABLES.PARTITIONS]: async () => {
          throw new Error('authoritative_partitions_unavailable');
        },
      },
    });
    const api = new AdminWebSocketAPI({
      nodeId: 'test-node',
      systemTableCache: createReadOnlyCache(writableCache),
      cacheMutationTarget: writableCache,
      controlPlaneSystemTableGateway: authoritativeGateway,
      sqlQueryEngine: createMockQueryEngine(),
    });

    await t.rejects(
      api.buildControlSnapshotQueryResult({
        forceAuthoritativeRepair: true,
      }),
      /authoritative control snapshot repair failed/i,
      'forced control snapshot should fail closed when authoritative repair cannot complete',
    );
  },
);

test(
  'AdminWebSocketAPI - control snapshot builder stays local unless force repair is explicit',
  async (t) => {
    const nowMs = 1740589945123;
    const staleHeartbeatMs = nowMs - 45000;
    const writableCache = createAuthoritativeRepairCache('node-local');
    writableCache.applySystemTableChange(TABLES.NODES, 'UPDATE', {
      id: 'node-local',
      node_id: 'node-local',
      address: 'localhost:8080',
      node_address: 'localhost:8080',
      status: 'active',
      connection_state: 'ready',
      last_heartbeat: staleHeartbeatMs,
      ready_lease_expires_at: staleHeartbeatMs + 15000,
    });

    const authoritativeNodes = [
      {
        ...writableCache.get(TABLES.NODES, 'node-local'),
        last_heartbeat: nowMs - 1000,
      },
    ];
    const repairEngine = createSystemTableRepairQueryEngine({
      [TABLES.NODES]: authoritativeNodes,
      [TABLES.PARTITIONS]: writableCache.getAll(TABLES.PARTITIONS),
      [TABLES.SERVICES]: writableCache.getAll(TABLES.SERVICES),
      [TABLES.TABLES]: writableCache.getAll(TABLES.TABLES),
      [TABLES.NODE_ENDPOINTS]: writableCache.getAll(TABLES.NODE_ENDPOINTS),
      [TABLES.SERVICE_DEFINITIONS]:
        writableCache.getAll(TABLES.SERVICE_DEFINITIONS),
      [TABLES.SERVICE_ENDPOINTS]:
        writableCache.getAll(TABLES.SERVICE_ENDPOINTS),
      [TABLES.REPLICA_OPERATIONS]:
        writableCache.getAll(TABLES.REPLICA_OPERATIONS),
    });

    const api = new AdminWebSocketAPI({
      nodeId: 'node-local',
      systemTableCache: createReadOnlyCache(writableCache),
      cacheMutationTarget: writableCache,
      sqlQueryEngine: repairEngine,
      nowFn: () => nowMs,
    });

    const result = await api.buildControlSnapshotQueryResult();

    t.equal(result.success, true, 'local control snapshot should still succeed');
    t.equal(
      repairEngine.executeRequestCalls.length,
      0,
      'non-forced control snapshot builder should not trigger authoritative reads',
    );
    t.equal(
      writableCache.get(TABLES.NODES, 'node-local')?.last_heartbeat,
      staleHeartbeatMs,
      'non-forced control snapshot builder should preserve local cache state',
    );
  },
);

test(
  'AdminWebSocketAPI - forced control snapshot repairs partition topology gaps',
  async (t) => {
    const tableId = 'table-benchmark-events';
    const sourcePartitionId = 'partition-benchmark-events-v1';
    const leftPartitionId = 'partition-benchmark-events-left';
    const rightPartitionId = 'partition-benchmark-events-right';

    const writableCache = createPopulatedCache();
    writableCache.applySystemTableChange(TABLES.TABLES, 'INSERT', {
      id: tableId,
      table_id: tableId,
      name: 'benchmark_events',
      table_name: 'benchmark_events',
      active_partition_version: 2,
      partition_count: 2,
      partition_transition_state: 'split_cutover_active',
      partition_transition_metadata: JSON.stringify({
        workflowId: 'split-table-benchmark-events-v2',
        sourcePartitionId,
        targetPartitionVersion: 2,
        targetPartitionIds: [leftPartitionId, rightPartitionId],
      }),
    });
    writableCache.applySystemTableChange(TABLES.PARTITIONS, 'INSERT', {
      id: sourcePartitionId,
      partition_id: sourcePartitionId,
      table_id: tableId,
      table_name: 'benchmark_events',
      partition_version: 1,
      state: 'NORMAL',
    });

    const authoritativePartitions = [
      ...writableCache.getAll(TABLES.PARTITIONS),
      {
        id: leftPartitionId,
        partition_id: leftPartitionId,
        table_id: tableId,
        table_name: 'benchmark_events',
        partition_version: 2,
        state: 'NORMAL',
      },
      {
        id: rightPartitionId,
        partition_id: rightPartitionId,
        table_id: tableId,
        table_name: 'benchmark_events',
        partition_version: 2,
        state: 'NORMAL',
      },
    ];

    const repairEngine = createSystemTableRepairQueryEngine({
      [TABLES.NODES]: writableCache.getAll(TABLES.NODES),
      [TABLES.PARTITIONS]: authoritativePartitions,
      [TABLES.SERVICES]: writableCache.getAll(TABLES.SERVICES),
      [TABLES.TABLES]: writableCache.getAll(TABLES.TABLES),
      [TABLES.NODE_ENDPOINTS]: writableCache.getAll(TABLES.NODE_ENDPOINTS),
      [TABLES.SERVICE_DEFINITIONS]: writableCache.getAll(TABLES.SERVICE_DEFINITIONS),
      [TABLES.SERVICE_ENDPOINTS]: writableCache.getAll(TABLES.SERVICE_ENDPOINTS),
      [TABLES.REPLICA_OPERATIONS]: writableCache.getAll(TABLES.REPLICA_OPERATIONS),
    });

    const api = new AdminWebSocketAPI({
      nodeId: 'test-node',
      systemTableCache: createReadOnlyCache(writableCache),
      cacheMutationTarget: writableCache,
      controlPlaneSystemTableGateway: createAuthoritativeCacheGateway(writableCache, {
        queryEngine: repairEngine,
      }),
      sqlQueryEngine: repairEngine,
    });

    const result = await api.buildControlSnapshotQueryResult({
      forceAuthoritativeRepair: true,
    });
    const snapshot = result?.rows?.[0] || null;
    const partitionIds = Array.isArray(snapshot?.partitions) ?
      snapshot.partitions :
      [];

    t.equal(
      partitionIds.includes(leftPartitionId),
      true,
      'control snapshot should include repaired left child partition',
    );
    t.equal(
      partitionIds.includes(rightPartitionId),
      true,
      'control snapshot should include repaired right child partition',
    );
    t.equal(
      repairEngine.executeRequestCalls.includes(`SELECT * FROM ${TABLES.PARTITIONS}`),
      true,
      'control snapshot repair should query authoritative partitions rows',
    );
  },
);

test(
  'AdminWebSocketAPI - forced control snapshot repairs stale replica operations without full discovery fanout',
  async (t) => {
    const nowMs = 1740589945123;
    const writableCache = createAuthoritativeRepairCache('node-local');
    writableCache.applySystemTableChange(TABLES.REPLICA_OPERATIONS, 'INSERT', {
      operation_id: 'op-stale-replace',
      partition_id: `${TABLES.NODES}-p1`,
      entity_id: `${TABLES.NODES}-p1`,
      source_node_id: 'node-local',
      target_node_id: 'node-peer',
      type: 'REPLACE',
      status: 'creating',
      workflow_step: 'CREATING',
      created_at: nowMs - 180000,
      updated_at: nowMs - 180000,
    });

    const repairEngine = createSystemTableRepairQueryEngine({
      [TABLES.NODES]: writableCache.getAll(TABLES.NODES),
      [TABLES.PARTITIONS]: writableCache.getAll(TABLES.PARTITIONS),
      [TABLES.SERVICES]: writableCache.getAll(TABLES.SERVICES),
      [TABLES.TABLES]: writableCache.getAll(TABLES.TABLES),
      [TABLES.NODE_ENDPOINTS]: writableCache.getAll(TABLES.NODE_ENDPOINTS),
      [TABLES.SERVICE_DEFINITIONS]:
        writableCache.getAll(TABLES.SERVICE_DEFINITIONS),
      [TABLES.SERVICE_ENDPOINTS]:
        writableCache.getAll(TABLES.SERVICE_ENDPOINTS),
      [TABLES.REPLICA_OPERATIONS]: [],
    });

    const api = new AdminWebSocketAPI({
      nodeId: 'node-local',
      systemTableCache: createReadOnlyCache(writableCache),
      cacheMutationTarget: writableCache,
      controlPlaneSystemTableGateway: createAuthoritativeCacheGateway(writableCache, {
        queryEngine: repairEngine,
      }),
      sqlQueryEngine: repairEngine,
      nowFn: () => nowMs,
    });

    const result = await api.buildControlSnapshotQueryResult({
      forceAuthoritativeRepair: true,
    });

    t.equal(
      result?.rows?.[0]?.replicaOperations?.staleInFlightCount,
      0,
      'repair should refresh stale replica-operation liveness from the authoritative rows',
    );
    t.same(
      getAuthoritativeRepairReadTables(repairEngine.executeRequestCalls),
      [TABLES.REPLICA_OPERATIONS].sort(),
      'stale replica-operation repair should read only replica_operations',
    );
  },
);

test(
  'AdminWebSocketAPI - forced control snapshot degrades when stale replica-operation repair fails',
  async (t) => {
    const nowMs = 1740589945123;
    const writableCache = createAuthoritativeRepairCache('node-local');

    writableCache.applySystemTableChange(TABLES.NODES, 'UPDATE', {
      id: 'node-local',
      node_id: 'node-local',
      address: 'localhost:8080',
      node_address: 'localhost:8080',
      status: 'active',
      connection_state: 'ready',
      last_heartbeat: nowMs - 1000,
      ready_lease_expires_at: nowMs + 15000,
    });
    writableCache.applySystemTableChange(TABLES.REPLICA_OPERATIONS, 'INSERT', {
      operation_id: 'op-stale-local',
      partition_id: `${TABLES.NODES}-p1`,
      entity_type: 'partition',
      entity_id: `${TABLES.NODES}-p1`,
      operation_type: 'ADD',
      status: 'creating',
      target_node_id: 'node-peer',
      workflow_step: 'CREATING',
      created_at: nowMs - 180000,
      updated_at: nowMs - 180000,
    });

    const failingReplicaOpEngine = {
      executeRequestCalls: [],
      async executeRequest(request) {
        const statement = String(request?.statement || '').trim();
        this.executeRequestCalls.push(statement);
        if (/^select \* from replica_operations$/i.test(statement)) {
          return {
            success: false,
            rows: [],
            count: 0,
            error: 'replica_operations_timeout',
          };
        }
        return {success: true, rows: [], count: 0};
      },
    };

    const api = new AdminWebSocketAPI({
      nodeId: 'node-local',
      systemTableCache: createReadOnlyCache(writableCache),
      cacheMutationTarget: writableCache,
      controlPlaneSystemTableGateway: createAuthoritativeCacheGateway(
        writableCache,
        {
          queryEngine: failingReplicaOpEngine,
        },
      ),
      sqlQueryEngine: failingReplicaOpEngine,
      nowFn: () => nowMs,
    });

    const result = await api.buildControlSnapshotQueryResult({
      forceAuthoritativeRepair: true,
    });

    t.equal(
      result?.success,
      true,
      'forced control snapshot should still succeed when only replica-operation repair fails',
    );
    t.equal(
      result?.rows?.[0]?.replicaOperations?.staleInFlightCount,
      1,
      'local snapshot should fall back to the local stale replica-operation view when advisory repair fails',
    );
    t.same(
      getAuthoritativeRepairReadTables(failingReplicaOpEngine.executeRequestCalls),
      [TABLES.REPLICA_OPERATIONS].sort(),
      'degraded local snapshot should attempt only the scoped replica_operations repair',
    );
  },
);

test(
  'AdminWebSocketAPI - forced control snapshot fails closed when replica-operation repair leaves active projection undercovered',
  async (t) => {
    const nowMs = 1740589945123;
    const writableCache = createAuthoritativeRepairCache('node-local');

    writableCache.applySystemTableChange(TABLES.NODES, 'UPDATE', {
      id: 'node-local',
      node_id: 'node-local',
      address: 'localhost:8080',
      node_address: 'localhost:8080',
      status: 'active',
      connection_state: 'ready',
      last_heartbeat: nowMs - 1000,
      ready_lease_expires_at: nowMs + 15000,
    });
    writableCache.applySystemTableChange(TABLES.NODES, 'INSERT', {
      id: 'node-peer',
      node_id: 'node-peer',
      address: 'localhost:8081',
      node_address: 'localhost:8081',
      status: 'active',
      connection_state: 'ready',
      last_heartbeat: nowMs - 60000,
      ready_lease_expires_at: nowMs - 1000,
    });
    writableCache.applySystemTableChange(TABLES.REPLICA_OPERATIONS, 'INSERT', {
      operation_id: 'op-stale-local',
      partition_id: `${TABLES.NODES}-p1`,
      entity_type: 'partition',
      entity_id: `${TABLES.NODES}-p1`,
      operation_type: 'ADD',
      status: 'creating',
      target_node_id: 'node-peer',
      workflow_step: 'CREATING',
      created_at: nowMs - 180000,
      updated_at: nowMs - 180000,
    });

    const failingReplicaOpEngine = {
      executeRequestCalls: [],
      async executeRequest(request) {
        const statement = String(request?.statement || '').trim();
        this.executeRequestCalls.push(statement);
        if (/^select \* from replica_operations$/i.test(statement)) {
          return {
            success: false,
            rows: [],
            count: 0,
            error: 'replica_operations_timeout',
          };
        }
        return {success: true, rows: [], count: 0};
      },
    };

    const api = new AdminWebSocketAPI({
      nodeId: 'node-local',
      systemTableCache: createReadOnlyCache(writableCache),
      cacheMutationTarget: writableCache,
      controlPlaneSystemTableGateway: createAuthoritativeCacheGateway(
        writableCache,
        {
          queryEngine: failingReplicaOpEngine,
        },
      ),
      sqlQueryEngine: failingReplicaOpEngine,
      messageRouter: {
        getConnectedNodes() {
          return ['node-peer'];
        },
      },
      nowFn: () => nowMs,
    });

    await t.rejects(
      api.buildControlSnapshotQueryResult({
        forceAuthoritativeRepair: true,
      }),
      /authoritative control snapshot repair failed/i,
      'forced control snapshot should fail closed when active coverage still requires discovery repair',
    );
    t.ok(
      getAuthoritativeRepairReadTables(failingReplicaOpEngine.executeRequestCalls)
        .includes(TABLES.NODES),
      'active projection coverage gaps should widen repair scope beyond replica_operations',
    );
  },
);

test(
  'AdminWebSocketAPI - forced control snapshot repairs stale active node heartbeat rows',
  async (t) => {
    const nowMs = 1740589945123;
    const staleHeartbeatMs = nowMs - 45000;
    const freshHeartbeatMs = nowMs - 1000;
    const writableCache = createAuthoritativeRepairCache('node-local');

    writableCache.applySystemTableChange(TABLES.NODES, 'UPDATE', {
      id: 'node-local',
      node_id: 'node-local',
      address: 'localhost:8080',
      node_address: 'localhost:8080',
      status: 'active',
      connection_state: 'ready',
      last_heartbeat: staleHeartbeatMs,
      ready_lease_expires_at: staleHeartbeatMs + 15000,
    });
    writableCache.applySystemTableChange(TABLES.NODES, 'INSERT', {
      id: 'node-peer',
      node_id: 'node-peer',
      address: 'localhost:8081',
      node_address: 'localhost:8081',
      status: 'active',
      connection_state: 'ready',
      last_heartbeat: staleHeartbeatMs,
      ready_lease_expires_at: staleHeartbeatMs + 15000,
    });

    const authoritativeNodes = [
      {
        ...writableCache.get(TABLES.NODES, 'node-local'),
        last_heartbeat: freshHeartbeatMs,
        ready_lease_expires_at: freshHeartbeatMs + 15000,
      },
      {
        ...writableCache.get(TABLES.NODES, 'node-peer'),
        last_heartbeat: freshHeartbeatMs,
        ready_lease_expires_at: freshHeartbeatMs + 15000,
      },
    ];
    const repairEngine = createSystemTableRepairQueryEngine({
      [TABLES.NODES]: authoritativeNodes,
      [TABLES.PARTITIONS]: writableCache.getAll(TABLES.PARTITIONS),
      [TABLES.SERVICES]: writableCache.getAll(TABLES.SERVICES),
      [TABLES.TABLES]: writableCache.getAll(TABLES.TABLES),
      [TABLES.NODE_ENDPOINTS]: writableCache.getAll(TABLES.NODE_ENDPOINTS),
      [TABLES.SERVICE_DEFINITIONS]:
        writableCache.getAll(TABLES.SERVICE_DEFINITIONS),
      [TABLES.SERVICE_ENDPOINTS]:
        writableCache.getAll(TABLES.SERVICE_ENDPOINTS),
      [TABLES.REPLICA_OPERATIONS]:
        writableCache.getAll(TABLES.REPLICA_OPERATIONS),
    });

    const api = new AdminWebSocketAPI({
      nodeId: 'node-local',
      systemTableCache: createReadOnlyCache(writableCache),
      cacheMutationTarget: writableCache,
      controlPlaneSystemTableGateway: createAuthoritativeCacheGateway(writableCache, {
        queryEngine: repairEngine,
      }),
      sqlQueryEngine: repairEngine,
      nowFn: () => nowMs,
    });

    await api.buildControlSnapshotQueryResult({
      forceAuthoritativeRepair: true,
    });

    t.equal(
      repairEngine.executeRequestCalls.includes(`SELECT * FROM ${TABLES.NODES}`),
      true,
      'control snapshot repair should query authoritative nodes rows when active heartbeats are stale',
    );
    t.equal(
      writableCache.get(TABLES.NODES, 'node-local')?.last_heartbeat,
      freshHeartbeatMs,
      'local node heartbeat should be refreshed from the authoritative repair rows',
    );
    t.equal(
      writableCache.get(TABLES.NODES, 'node-peer')?.last_heartbeat,
      freshHeartbeatMs,
      'peer node heartbeat should be refreshed from the authoritative repair rows',
    );
  },
);

test(
  'AdminWebSocketAPI - local control snapshot repairs shared metadata node coverage gaps',
  async (t) => {
    const writableCache = createAuthoritativeRepairCache('node-local');
    const now = Date.now();
    writableCache.applySystemTableChange(TABLES.NODES, 'UPDATE', {
      id: 'node-local',
      node_id: 'node-local',
      address: 'localhost:8080',
      node_address: 'localhost:8080',
      status: 'active',
      connection_state: 'ready',
      last_heartbeat: now,
      ready_lease_expires_at: now + 10000,
    });
    writableCache.applySystemTableChange(TABLES.SERVICES, 'INSERT', {
      service_id: 'peer-service-r1',
      service_type: 'partition',
      node_id: 'node-peer',
      partition_id: 'peer-table-p1',
      replica_id: 'peer-table-p1-r1',
      raft_role: 'leader',
      status: 'active',
      address: 'node-peer/partition/peer-table-p1-r1',
    });
    writableCache.applySystemTableChange(TABLES.NODE_ENDPOINTS, 'INSERT', {
      endpoint_id: 'endpoint-node-local',
      node_id: 'node-local',
      transport_type: 'ws',
      address: 'ws://node-local:8082',
      status: 'active',
    });
    writableCache.applySystemTableChange(TABLES.NODE_ENDPOINTS, 'INSERT', {
      endpoint_id: 'endpoint-node-peer',
      node_id: 'node-peer',
      transport_type: 'ws',
      address: 'ws://node-peer:8082',
      status: 'active',
    });

    const authoritativeNodes = [
      ...writableCache.getAll(TABLES.NODES),
      {
        id: 'node-peer',
        node_id: 'node-peer',
        address: 'localhost:8081',
        node_address: 'localhost:8081',
        status: 'active',
        connection_state: 'ready',
        last_heartbeat: now,
        ready_lease_expires_at: now + 10000,
      },
    ];
    const repairEngine = createSystemTableRepairQueryEngine({
      [TABLES.NODES]: authoritativeNodes,
      [TABLES.PARTITIONS]: writableCache.getAll(TABLES.PARTITIONS),
      [TABLES.SERVICES]: writableCache.getAll(TABLES.SERVICES),
      [TABLES.TABLES]: writableCache.getAll(TABLES.TABLES),
      [TABLES.NODE_ENDPOINTS]: writableCache.getAll(TABLES.NODE_ENDPOINTS),
      [TABLES.SERVICE_DEFINITIONS]:
        writableCache.getAll(TABLES.SERVICE_DEFINITIONS),
      [TABLES.SERVICE_ENDPOINTS]:
        writableCache.getAll(TABLES.SERVICE_ENDPOINTS),
      [TABLES.REPLICA_OPERATIONS]:
        writableCache.getAll(TABLES.REPLICA_OPERATIONS),
    });

    const api = new AdminWebSocketAPI({
      nodeId: 'node-local',
      systemTableCache: createReadOnlyCache(writableCache),
      cacheMutationTarget: writableCache,
      controlPlaneSystemTableGateway: createAuthoritativeCacheGateway(writableCache, {
        queryEngine: repairEngine,
      }),
      sqlQueryEngine: repairEngine,
    });

    const result = await api.buildControlSnapshotQueryResult();

    t.equal(result.success, true, 'control snapshot should succeed');
    t.same(
      result.rows[0].nodes.sort(),
      ['node-local', 'node-peer'],
      'control snapshot should publish repaired node coverage',
    );
    t.equal(
      writableCache.get(TABLES.NODES, 'node-peer')?.node_id,
      'node-peer',
      'authoritative repair should hydrate the missing peer node row',
    );
    t.equal(
      repairEngine.executeRequestCalls.includes(`SELECT * FROM ${TABLES.NODES}`),
      true,
      'coverage-gap repair should query authoritative nodes rows',
    );
  },
);

test(
  'AdminWebSocketAPI - local control snapshot repairs transport-connected peer coverage gaps',
  async (t) => {
    const writableCache = createAuthoritativeRepairCache('node-local');
    const nowMs = 1740589945123;
    const authoritativeNodeRows = [
      ...writableCache.getAll(TABLES.NODES),
      {
        id: 'node-peer',
        node_id: 'node-peer',
        address: 'localhost:8081',
        node_address: 'localhost:8081',
        status: 'active',
        connection_state: 'ready',
        last_heartbeat: nowMs - 1000,
        ready_lease_expires_at: nowMs + 15000,
      },
    ];
    const repairEngine = createSystemTableRepairQueryEngine({
      [TABLES.NODES]: authoritativeNodeRows,
      [TABLES.PARTITIONS]: writableCache.getAll(TABLES.PARTITIONS),
      [TABLES.SERVICES]: writableCache.getAll(TABLES.SERVICES),
      [TABLES.TABLES]: writableCache.getAll(TABLES.TABLES),
      [TABLES.NODE_ENDPOINTS]: writableCache.getAll(TABLES.NODE_ENDPOINTS),
      [TABLES.SERVICE_DEFINITIONS]:
        writableCache.getAll(TABLES.SERVICE_DEFINITIONS),
      [TABLES.SERVICE_ENDPOINTS]:
        writableCache.getAll(TABLES.SERVICE_ENDPOINTS),
      [TABLES.REPLICA_OPERATIONS]:
        writableCache.getAll(TABLES.REPLICA_OPERATIONS),
    });

    const api = new AdminWebSocketAPI({
      nodeId: 'node-local',
      systemTableCache: createReadOnlyCache(writableCache),
      cacheMutationTarget: writableCache,
      controlPlaneSystemTableGateway: createAuthoritativeCacheGateway(
        writableCache,
        {
          queryEngine: repairEngine,
        },
      ),
      sqlQueryEngine: repairEngine,
      messageRouter: {
        getConnectedNodes() {
          return ['node-peer'];
        },
      },
      nowFn: () => nowMs,
    });

    await api.buildControlSnapshotQueryResult();

    t.equal(
      repairEngine.executeRequestCalls.includes(`SELECT * FROM ${TABLES.NODES}`),
      true,
      'transport-connected peers missing from node rows should trigger authoritative nodes repair',
    );
    t.equal(
      writableCache.get(TABLES.NODES, 'node-peer')?.node_id,
      'node-peer',
      'transport-connected peer repair should hydrate the missing peer node row',
    );
  },
);

test(
  'AdminWebSocketAPI - explicit control snapshot repair reuses recent authoritative discovery repairs unless forced',
  async (t) => {
    let nowMs = 1740589945123;
    const writableCache = createPopulatedCache();
    writableCache.applySystemTableChange(TABLES.REPLICA_OPERATIONS, 'INSERT', {
      operation_id: 'op-stale-create',
      partition_id: 'partition-user-1',
      entity_id: 'partition-user-1',
      status: 'creating',
      workflow_step: 'CREATING',
      created_at: nowMs - 180000,
      updated_at: nowMs - 180000,
    });

    const repairEngine = createSystemTableRepairQueryEngine({
      [TABLES.NODES]: writableCache.getAll(TABLES.NODES),
      [TABLES.PARTITIONS]: writableCache.getAll(TABLES.PARTITIONS),
      [TABLES.SERVICES]: writableCache.getAll(TABLES.SERVICES),
      [TABLES.TABLES]: writableCache.getAll(TABLES.TABLES),
      [TABLES.NODE_ENDPOINTS]: writableCache.getAll(TABLES.NODE_ENDPOINTS),
      [TABLES.SERVICE_DEFINITIONS]:
        writableCache.getAll(TABLES.SERVICE_DEFINITIONS),
      [TABLES.SERVICE_ENDPOINTS]:
        writableCache.getAll(TABLES.SERVICE_ENDPOINTS),
      [TABLES.REPLICA_OPERATIONS]:
        writableCache.getAll(TABLES.REPLICA_OPERATIONS),
    });
    const api = new AdminWebSocketAPI({
      nodeId: 'test-node',
      systemTableCache: createReadOnlyCache(writableCache),
      cacheMutationTarget: writableCache,
      controlPlaneSystemTableGateway: createAuthoritativeCacheGateway(writableCache, {
        queryEngine: repairEngine,
      }),
      sqlQueryEngine: repairEngine,
      nowFn: () => nowMs,
    });

    const firstResult = await api.buildControlSnapshotQueryResult({
      allowAuthoritativeRepair: true,
    });
    t.equal(
      firstResult?.rows?.[0]?.replicaOperations?.staleInFlightCount,
      1,
      'first snapshot should expose the persistent stale replica operation',
    );
    t.equal(
      repairEngine.executeRequestCalls.length,
      1,
      'first snapshot should perform one authoritative repair pass',
    );

    nowMs += 2000;
    const secondResult = await api.buildControlSnapshotQueryResult({
      allowAuthoritativeRepair: true,
    });
    t.equal(
      secondResult?.rows?.[0]?.replicaOperations?.staleInFlightCount,
      1,
      'second snapshot should still reflect the persistent stale replica operation',
    );
    t.equal(
      repairEngine.executeRequestCalls.length,
      1,
      'second snapshot within the reuse window should not repeat the repair pass',
    );

    nowMs += 1000;
    await api.buildControlSnapshotQueryResult({
      forceAuthoritativeRepair: true,
    });
    t.equal(
      repairEngine.executeRequestCalls.length,
      2,
      'forced control snapshot should bypass reuse and rerun authoritative repair',
    );
  },
);

test(
  'AdminWebSocketAPI - local control snapshot query stays local ' +
    'when outbound transport is backpressured',
  async (t) => {
    const nowMs = 1740589945123;
    const staleHeartbeatMs = nowMs - 45000;
    const writableCache = createAuthoritativeRepairCache('node-local');
    writableCache.applySystemTableChange(TABLES.NODES, 'UPDATE', {
      id: 'node-local',
      node_id: 'node-local',
      address: 'localhost:8080',
      node_address: 'localhost:8080',
      status: 'active',
      connection_state: 'ready',
      last_heartbeat: staleHeartbeatMs,
      ready_lease_expires_at: staleHeartbeatMs + 15000,
    });

    const repairEngine = createSystemTableRepairQueryEngine({
      [TABLES.NODES]: writableCache.getAll(TABLES.NODES),
      [TABLES.PARTITIONS]: writableCache.getAll(TABLES.PARTITIONS),
      [TABLES.SERVICES]: writableCache.getAll(TABLES.SERVICES),
      [TABLES.TABLES]: writableCache.getAll(TABLES.TABLES),
      [TABLES.NODE_ENDPOINTS]: writableCache.getAll(TABLES.NODE_ENDPOINTS),
      [TABLES.SERVICE_DEFINITIONS]:
        writableCache.getAll(TABLES.SERVICE_DEFINITIONS),
      [TABLES.SERVICE_ENDPOINTS]:
        writableCache.getAll(TABLES.SERVICE_ENDPOINTS),
      [TABLES.REPLICA_OPERATIONS]:
        writableCache.getAll(TABLES.REPLICA_OPERATIONS),
    });
    const api = new AdminWebSocketAPI({
      nodeId: 'node-local',
      systemTableCache: createReadOnlyCache(writableCache),
      cacheMutationTarget: writableCache,
      controlPlaneSystemTableGateway: createAuthoritativeCacheGateway(writableCache, {
        queryEngine: repairEngine,
      }),
      sqlQueryEngine: repairEngine,
      messageRouter: {
        getOutboundPressureSummary() {
          return {
            backpressured: true,
            saturatedNodeCount: 1,
            totalPending: 96,
            maxPendingUtilization: 1,
          };
        },
      },
      nowFn: () => nowMs,
    });

    const result = await api.executeLocalQueryEnvelope({
      queryId: 'q-pressure-local-only',
      sql: 'SELECT * FROM control_snapshot_local()',
      params: [],
    });

    t.equal(result.success, true, 'backpressured local query should succeed');
    t.equal(
      repairEngine.executeRequestCalls.length,
      0,
      'backpressured local query should stay on local observation data',
    );
  },
);

test(
  'AdminWebSocketAPI - forced control snapshot repair uses local partition replicas ' +
    'before routed SQL',
  async (t) => {
    const nodeId = 'test-node';
    const tableId = 'table-benchmark-events';
    const sourcePartitionId = 'partition-benchmark-events-v1';
    const leftPartitionId = 'partition-benchmark-events-left';
    const rightPartitionId = 'partition-benchmark-events-right';

    const writableCache = createAuthoritativeRepairCache(nodeId);
    writableCache.applySystemTableChange(TABLES.TABLES, 'INSERT', {
      id: tableId,
      table_id: tableId,
      name: 'benchmark_events',
      table_name: 'benchmark_events',
      active_partition_version: 2,
      partition_count: 2,
      partition_transition_state: 'split_cutover_active',
      partition_transition_metadata: JSON.stringify({
        workflowId: 'split-table-benchmark-events-v2',
        sourcePartitionId,
        targetPartitionVersion: 2,
        targetPartitionIds: [leftPartitionId, rightPartitionId],
      }),
    });
    writableCache.applySystemTableChange(TABLES.PARTITIONS, 'INSERT', {
      id: sourcePartitionId,
      partition_id: sourcePartitionId,
      table_id: tableId,
      table_name: 'benchmark_events',
      partition_version: 1,
      state: 'NORMAL',
    });

    const authoritativePartitions = [
      ...writableCache.getAll(TABLES.PARTITIONS),
      {
        id: leftPartitionId,
        partition_id: leftPartitionId,
        table_id: tableId,
        table_name: 'benchmark_events',
        partition_version: 2,
        state: 'NORMAL',
      },
      {
        id: rightPartitionId,
        partition_id: rightPartitionId,
        table_id: tableId,
        table_name: 'benchmark_events',
        partition_version: 2,
        state: 'NORMAL',
      },
    ];

    let executeRequestCalls = 0;
    const api = new AdminWebSocketAPI({
      nodeId,
      systemTableCache: createReadOnlyCache(writableCache),
      cacheMutationTarget: writableCache,
      controlPlaneSystemTableGateway: createAuthoritativeCacheGateway(writableCache, {
        readRowsByTable: {
          [TABLES.PARTITIONS]: authoritativePartitions,
        },
      }),
      partitionServices: createAuthoritativeRepairPartitionServices(
        writableCache,
        {
          [TABLES.PARTITIONS]: authoritativePartitions,
        },
      ),
      sqlQueryEngine: {
        async executeRequest() {
          executeRequestCalls++;
          throw new Error('routed SQL should not run');
        },
      },
    });

    const result = await api.executeLocalQueryEnvelope({
      queryId: 'q-force-control-snapshot-local',
      sql: ADMIN_CONTROL_SNAPSHOT.QUERY_SQL_FORCE_REPAIR,
      params: [],
    });
    const snapshot = result?.rows?.[0] || null;
    const partitionIds = Array.isArray(snapshot?.partitions) ?
      snapshot.partitions :
      [];

    t.equal(
      partitionIds.includes(leftPartitionId),
      true,
      'forced control snapshot should repair the left child partition from local replicas',
    );
    t.equal(
      partitionIds.includes(rightPartitionId),
      true,
      'forced control snapshot should repair the right child partition from local replicas',
    );
    t.equal(
      executeRequestCalls,
      0,
      'forced control snapshot should not fall back to routed SQL when local replicas are available',
    );
  },
);

test('AdminWebSocketAPI - local service discovery endpoint shape and filtering',
  async (t) => {
    let executeRequestCalls = 0;
    const cache = createPopulatedCache();
    seedServiceDiscoveryRows(cache);
    const beforeCounts = {
      serviceDefinitions: cache.count(TABLES.SERVICE_DEFINITIONS),
      serviceEndpoints: cache.count(TABLES.SERVICE_ENDPOINTS),
    };
    const api = new AdminWebSocketAPI({
      nodeId: 'test-node',
      systemTableCache: cache,
      sqlQueryEngine: {
        executeRequest: async () => {
          executeRequestCalls++;
          return {success: true, rows: []};
        },
      },
    });

    await api.initialize(0, {listen: false});

    const response = await api.getFastify().inject({
      method: 'GET',
      url: '/api/admin/discovery/services?' +
        'serviceId=sys-postgres-wire&protocol=postgresql&nodeId=node-1&healthyOnly=true',
    });
    const payload = response.json();

    t.equal(response.statusCode, 200, 'should return 200');
    t.equal(payload.schemaVersion, 2, 'should expose schema version');
    t.equal(payload.nodeId, 'test-node', 'should include current node id');
    t.equal(payload.serviceCount, 1, 'should return one logical discovery group');
    t.equal(payload.replicaCount, 1, 'should include filtered replica count');
    t.equal(Array.isArray(payload.services), true, 'should include services array');
    t.equal(payload.services.length, 1, 'should include one service row');
    t.equal(payload.services[0].serviceKey,
      'sys-postgres-wire|postgresql', 'should expose endpoint-sync service key');
    t.equal(payload.services[0].observedReplicaCount, 1,
      'should honor discovery filters');
    t.equal(payload.services[0].desiredReplicaCount, 3,
      'should include desired replica count from definitions');
    t.equal(payload.services[0].replicas.length, 1,
      'should include filtered replica rows');
    t.equal(payload.services[0].replicas[0].nodeId, 'node-1',
      'should keep only requested node replica');
    t.equal(
      payload.services[0].replicas[0].readiness.workloadReady,
      true,
      'should include canonical workload readiness',
    );
    t.equal(
      payload.services[0].replicas[0].readiness.topologyReady,
      true,
      'should include canonical topology readiness',
    );
    t.equal(
      payload.services[0].replicas[0].readiness.benchmarkReady,
      true,
      'should include canonical benchmark readiness',
    );
    t.equal(
      payload.services[0].replicas[0].readiness.schemaReady,
      true,
      'default discovery scope should mark schema readiness true',
    );
    t.equal(executeRequestCalls, 0,
      'service discovery endpoint should not execute distributed SQL requests');

    t.equal(cache.count(TABLES.SERVICE_DEFINITIONS),
      beforeCounts.serviceDefinitions,
      'should not mutate service definitions table');
    t.equal(cache.count(TABLES.SERVICE_ENDPOINTS), beforeCounts.serviceEndpoints,
      'should not mutate service endpoints table');

    await api.shutdown();
  });

test('AdminWebSocketAPI - local service discovery query avoids distributed fanout',
  async (t) => {
    let executeRequestCalls = 0;
    const cache = createPopulatedCache();
    seedServiceDiscoveryRows(cache);
    const api = new AdminWebSocketAPI({
      nodeId: 'test-node',
      systemTableCache: cache,
      sqlQueryEngine: {
        executeRequest: async () => {
          executeRequestCalls++;
          return {success: true, rows: [{id: 'unexpected'}]};
        },
      },
    });

    await api.initialize(0, {listen: false});
    const {ws} = await connectAndReceive(api);

    ws.send(JSON.stringify({
      type: MessageType.QUERY,
      queryId: 'q-service-discovery',
      sql: 'SELECT * FROM service_discovery_local()',
    }));

    const response = await waitForMessage(ws);

    t.equal(response.type, MessageType.QUERY_RESULT, 'should return query_result');
    t.equal(response.queryId, 'q-service-discovery', 'should preserve query id');
    t.equal(Array.isArray(response.results), true, 'query result should include rows');
    t.equal(response.results.length, 1, 'query should return one snapshot row');
    t.equal(response.results[0].schemaVersion, 2,
      'query should expose discovery schema version');
    t.equal(Array.isArray(response.results[0].services), true,
      'query snapshot should include services array');
    t.equal(response.results[0].serviceCount, 1,
      'query snapshot should include grouped service count');
    t.equal(
      response.results[0].services[0].replicas[0].readiness.workloadReady,
      true,
      'query snapshot should include readiness block',
    );
    t.equal(
      response.results[0].services[0].replicas[0].readiness.topologyReady,
      true,
      'query snapshot should include topology readiness',
    );
    t.equal(
      response.results[0].services[0].replicas[0].readiness.benchmarkReady,
      true,
      'query snapshot should include benchmark readiness',
    );
    t.equal(executeRequestCalls, 0,
      'local service discovery query should not execute distributed SQL requests');

    ws.close();
    await api.shutdown();
  });

test(
  'AdminWebSocketAPI - stale discovery leadership repairs from authoritative system tables',
  async (t) => {
    const staleAppliedAtMs = Date.now() - 10000;
    const writableCache = createPopulatedCache();
    seedRoutedTableDiscoveryRows(writableCache);

    writableCache.applySystemTableChange(TABLES.SERVICES, 'UPDATE', {
      id: 'service-benchmark-events-node-1',
      service_id: 'service-benchmark-events-node-1',
      service_type: 'partition',
      partition_id: 'partition-benchmark-events-1',
      node_id: 'node-1',
      status: 'active',
      raft_role: 'follower',
      address: '10.0.0.1:7001',
    });
    writableCache.lastAppliedAtMsByTableName.set(
      TABLES.SERVICE_ENDPOINTS,
      staleAppliedAtMs,
    );
    const cache = createReadOnlyCache(writableCache);

    const repairEngine = createSystemTableRepairQueryEngine({
      [TABLES.NODES]: writableCache.getAll(TABLES.NODES),
      [TABLES.PARTITIONS]: writableCache.getAll(TABLES.PARTITIONS),
      [TABLES.TABLES]: writableCache.getAll(TABLES.TABLES),
      [TABLES.NODE_ENDPOINTS]: writableCache.getAll(TABLES.NODE_ENDPOINTS),
      [TABLES.SERVICE_DEFINITIONS]: writableCache.getAll(TABLES.SERVICE_DEFINITIONS),
      [TABLES.SERVICE_ENDPOINTS]: writableCache.getAll(TABLES.SERVICE_ENDPOINTS),
      [TABLES.REPLICA_OPERATIONS]: writableCache.getAll(TABLES.REPLICA_OPERATIONS),
      [TABLES.SERVICES]: [
        {
          id: 'service-1',
          service_id: 'service-1',
          node_id: 'node-1',
          service_type: 'partition',
          partition_id: 'partition-1',
          status: 'active',
          raft_role: 'leader',
          address: 'localhost:7000',
        },
        {
          id: 'service-benchmark-events-node-1',
          service_id: 'service-benchmark-events-node-1',
          service_type: 'partition',
          partition_id: 'partition-benchmark-events-1',
          node_id: 'node-1',
          status: 'active',
          raft_role: 'leader',
          address: '10.0.0.1:7001',
        },
      ],
    });
    const api = new AdminWebSocketAPI({
      nodeId: 'test-node',
      systemTableCache: cache,
      cacheMutationTarget: writableCache,
      controlPlaneSystemTableGateway: createAuthoritativeCacheGateway(writableCache, {
        queryEngine: repairEngine,
      }),
      sqlQueryEngine: repairEngine,
    });

    const result = await api.buildServiceDiscoveryQueryResult({
      tableName: 'benchmark_events',
      allowAuthoritativeRepair: true,
    });
    const replicas = result?.rows?.[0]?.services?.[0]?.replicas || [];

    t.equal(
      replicas.every((replica) => replica?.readiness?.benchmarkReady === true),
      true,
      'repair should restore benchmark readiness for all discovery replicas',
    );
    t.equal(
      writableCache.getAll(TABLES.SERVICES).some((row) =>
        row?.partition_id === 'partition-benchmark-events-1' &&
        row?.raft_role === 'leader'),
      true,
      'repair should update cached services rows from authoritative state',
    );
    t.equal(
      repairEngine.executeRequestCalls.includes(`SELECT * FROM ${TABLES.SERVICES}`),
      true,
      'repair should query authoritative services rows',
    );
  },
);

test(
  'AdminWebSocketAPI - service discovery builder stays local unless repair is explicit',
  async (t) => {
    const writableCache = createPopulatedCache();
    writableCache.applySystemTableChange(TABLES.NODES, 'INSERT', {
      id: 'node-2',
      address: 'localhost:8081',
      status: 'active',
    });
    writableCache.applySystemTableChange(TABLES.TABLES, 'INSERT', {
      id: 'table-benchmark-events',
      table_id: 'table-benchmark-events',
      name: 'benchmark_events',
      table_name: 'benchmark_events',
    });
    writableCache.applySystemTableChange(TABLES.PARTITIONS, 'INSERT', {
      id: 'partition-benchmark-events-1',
      partition_id: 'partition-benchmark-events-1',
      table_id: 'table-benchmark-events',
      table_name: 'benchmark_events',
      keyStart: null,
      keyEnd: null,
    });

    const authoritativeCache = createPopulatedCache();
    seedRoutedTableDiscoveryRows(authoritativeCache);
    const repairEngine = createSystemTableRepairQueryEngine({
      [TABLES.NODES]: authoritativeCache.getAll(TABLES.NODES),
      [TABLES.PARTITIONS]: authoritativeCache.getAll(TABLES.PARTITIONS),
      [TABLES.TABLES]: authoritativeCache.getAll(TABLES.TABLES),
      [TABLES.NODE_ENDPOINTS]: authoritativeCache.getAll(TABLES.NODE_ENDPOINTS),
      [TABLES.SERVICE_DEFINITIONS]:
        authoritativeCache.getAll(TABLES.SERVICE_DEFINITIONS),
      [TABLES.SERVICE_ENDPOINTS]:
        authoritativeCache.getAll(TABLES.SERVICE_ENDPOINTS),
      [TABLES.REPLICA_OPERATIONS]:
        authoritativeCache.getAll(TABLES.REPLICA_OPERATIONS),
      [TABLES.SERVICES]: authoritativeCache.getAll(TABLES.SERVICES),
    });
    const api = new AdminWebSocketAPI({
      nodeId: 'test-node',
      systemTableCache: createReadOnlyCache(writableCache),
      cacheMutationTarget: writableCache,
      controlPlaneSystemTableGateway: createAuthoritativeCacheGateway(writableCache, {
        queryEngine: repairEngine,
      }),
      sqlQueryEngine: repairEngine,
    });

    const result = await api.buildServiceDiscoveryQueryResult({
      tableName: 'benchmark_events',
      tableId: 'table-benchmark-events',
    });
    const snapshot = result?.rows?.[0] || null;

    t.equal(result.success, true, 'local service discovery should still succeed');
    t.equal(
      snapshot?.serviceCount,
      0,
      'non-repair service discovery builder should return the local incomplete snapshot',
    );
    t.equal(
      repairEngine.executeRequestCalls.length,
      0,
      'non-repair service discovery builder should not trigger authoritative reads',
    );
  },
);

test(
  'AdminWebSocketAPI - probe lane service discovery query stays local ' +
    'when scoped cache is incomplete',
  async (t) => {
    const writableCache = createPopulatedCache();
    writableCache.applySystemTableChange(TABLES.NODES, 'INSERT', {
      id: 'node-2',
      address: 'localhost:8081',
      status: 'active',
    });
    writableCache.applySystemTableChange(TABLES.TABLES, 'INSERT', {
      id: 'table-benchmark-events',
      table_id: 'table-benchmark-events',
      name: 'benchmark_events',
      table_name: 'benchmark_events',
    });
    writableCache.applySystemTableChange(TABLES.PARTITIONS, 'INSERT', {
      id: 'partition-benchmark-events-1',
      partition_id: 'partition-benchmark-events-1',
      table_id: 'table-benchmark-events',
      table_name: 'benchmark_events',
      keyStart: null,
      keyEnd: null,
    });
    writableCache.applySystemTableChange(TABLES.SERVICES, 'INSERT', {
      id: 'service-benchmark-events-node-1',
      service_type: 'partition',
      partition_id: 'partition-benchmark-events-1',
      node_id: 'node-1',
      status: 'active',
      raft_role: 'leader',
      address: '10.0.0.1:7001',
    });
    writableCache.lastAppliedAtMsByTableName.set(
      TABLES.SERVICE_ENDPOINTS,
      Date.now(),
    );
    writableCache.lastAppliedAtMsByTableName.set(
      TABLES.SERVICE_DEFINITIONS,
      Date.now(),
    );

    const authoritativeCache = createPopulatedCache();
    seedRoutedTableDiscoveryRows(authoritativeCache);
    const repairEngine = createSystemTableRepairQueryEngine({
      [TABLES.NODES]: authoritativeCache.getAll(TABLES.NODES),
      [TABLES.PARTITIONS]: authoritativeCache.getAll(TABLES.PARTITIONS),
      [TABLES.TABLES]: authoritativeCache.getAll(TABLES.TABLES),
      [TABLES.NODE_ENDPOINTS]: authoritativeCache.getAll(TABLES.NODE_ENDPOINTS),
      [TABLES.SERVICE_DEFINITIONS]:
        authoritativeCache.getAll(TABLES.SERVICE_DEFINITIONS),
      [TABLES.SERVICE_ENDPOINTS]:
        authoritativeCache.getAll(TABLES.SERVICE_ENDPOINTS),
      [TABLES.REPLICA_OPERATIONS]:
        authoritativeCache.getAll(TABLES.REPLICA_OPERATIONS),
      [TABLES.SERVICES]: authoritativeCache.getAll(TABLES.SERVICES),
    });
    const api = new AdminWebSocketAPI({
      nodeId: 'test-node',
      systemTableCache: createReadOnlyCache(writableCache),
      cacheMutationTarget: writableCache,
      controlPlaneSystemTableGateway: createAuthoritativeCacheGateway(writableCache, {
        queryEngine: repairEngine,
      }),
      sqlQueryEngine: repairEngine,
    });

    const result = await api.executeLocalQueryEnvelope(
      {
        queryId: 'q-probe-discovery-local-only',
        sql: 'SELECT * FROM service_discovery_local(\'benchmark_events\')',
        params: [],
      },
      {
        clientInfo: {
          lane: 'probe',
        },
      },
    );
    const snapshot = result?.rows?.[0] || null;

    t.equal(result.success, true, 'probe lane query should succeed');
    t.equal(
      snapshot?.serviceCount,
      0,
      'probe lane query should return the local incomplete snapshot without repair',
    );
    t.equal(
      repairEngine.executeRequestCalls.length,
      0,
      'probe lane query should not trigger authoritative discovery repair',
    );
  },
);

test(
  'AdminWebSocketAPI - table-scoped discovery repairs empty fresh cache from authoritative system tables',
  async (t) => {
    const writableCache = createPopulatedCache();
    writableCache.applySystemTableChange(TABLES.NODES, 'INSERT', {
      id: 'node-2',
      address: 'localhost:8081',
      status: 'active',
    });
    writableCache.applySystemTableChange(TABLES.TABLES, 'INSERT', {
      id: 'table-benchmark-events',
      table_id: 'table-benchmark-events',
      name: 'benchmark_events',
      table_name: 'benchmark_events',
    });
    writableCache.applySystemTableChange(TABLES.PARTITIONS, 'INSERT', {
      id: 'partition-benchmark-events-1',
      partition_id: 'partition-benchmark-events-1',
      table_id: 'table-benchmark-events',
      table_name: 'benchmark_events',
      keyStart: null,
      keyEnd: null,
    });
    writableCache.applySystemTableChange(TABLES.SERVICES, 'INSERT', {
      id: 'service-benchmark-events-node-1',
      service_type: 'partition',
      partition_id: 'partition-benchmark-events-1',
      node_id: 'node-1',
      status: 'active',
      raft_role: 'leader',
      address: '10.0.0.1:7001',
    });
    writableCache.lastAppliedAtMsByTableName.set(
      TABLES.SERVICE_ENDPOINTS,
      Date.now(),
    );
    writableCache.lastAppliedAtMsByTableName.set(
      TABLES.SERVICE_DEFINITIONS,
      Date.now(),
    );

    const authoritativeCache = createPopulatedCache();
    seedRoutedTableDiscoveryRows(authoritativeCache);
    const repairEngine = createSystemTableRepairQueryEngine({
      [TABLES.NODES]: authoritativeCache.getAll(TABLES.NODES),
      [TABLES.PARTITIONS]: authoritativeCache.getAll(TABLES.PARTITIONS),
      [TABLES.TABLES]: authoritativeCache.getAll(TABLES.TABLES),
      [TABLES.NODE_ENDPOINTS]: authoritativeCache.getAll(TABLES.NODE_ENDPOINTS),
      [TABLES.SERVICE_DEFINITIONS]: authoritativeCache.getAll(TABLES.SERVICE_DEFINITIONS),
      [TABLES.SERVICE_ENDPOINTS]: authoritativeCache.getAll(TABLES.SERVICE_ENDPOINTS),
      [TABLES.REPLICA_OPERATIONS]: authoritativeCache.getAll(TABLES.REPLICA_OPERATIONS),
      [TABLES.SERVICES]: authoritativeCache.getAll(TABLES.SERVICES),
    });
    const api = new AdminWebSocketAPI({
      nodeId: 'test-node',
      systemTableCache: createReadOnlyCache(writableCache),
      cacheMutationTarget: writableCache,
      controlPlaneSystemTableGateway: createAuthoritativeCacheGateway(writableCache, {
        queryEngine: repairEngine,
      }),
      sqlQueryEngine: repairEngine,
    });

    const result = await api.buildServiceDiscoveryQueryResult({
      tableName: 'benchmark_events',
      tableId: 'table-benchmark-events',
      allowAuthoritativeRepair: true,
    });
    const snapshot = result?.rows?.[0] || null;
    const replicas = snapshot?.services?.[0]?.replicas || [];

    t.equal(
      snapshot?.serviceCount,
      1,
      'table-scoped discovery should repair an empty fresh cache before responding',
    );
    t.equal(
      replicas.length,
      2,
      'repaired discovery snapshot should include authoritative postgres-wire replicas',
    );
    t.same(
      getAuthoritativeRepairReadTables(repairEngine.executeRequestCalls),
      [
        TABLES.NODES,
        TABLES.PARTITIONS,
        TABLES.SERVICES,
        TABLES.TABLES,
        TABLES.SERVICE_DEFINITIONS,
        TABLES.SERVICE_ENDPOINTS,
      ].sort(),
      'table-scoped discovery repair should read only scoped topology/discovery tables',
    );
  },
);

test(
  'AdminWebSocketAPI - table-scoped discovery repair uses control-plane ' +
    'gateway authoritative reads before routed SQL',
  async (t) => {
    const writableCache = createPopulatedCache();
    writableCache.applySystemTableChange(TABLES.NODES, 'INSERT', {
      id: 'node-2',
      address: 'localhost:8081',
      status: 'active',
    });
    writableCache.applySystemTableChange(TABLES.TABLES, 'INSERT', {
      id: 'table-benchmark-events',
      table_id: 'table-benchmark-events',
      name: 'benchmark_events',
      table_name: 'benchmark_events',
    });
    writableCache.applySystemTableChange(TABLES.PARTITIONS, 'INSERT', {
      id: 'partition-benchmark-events-1',
      partition_id: 'partition-benchmark-events-1',
      table_id: 'table-benchmark-events',
      table_name: 'benchmark_events',
      keyStart: null,
      keyEnd: null,
    });
    writableCache.applySystemTableChange(TABLES.SERVICES, 'INSERT', {
      id: 'service-benchmark-events-node-1',
      service_type: 'partition',
      partition_id: 'partition-benchmark-events-1',
      node_id: 'node-1',
      status: 'active',
      raft_role: 'leader',
      address: '10.0.0.1:7001',
    });
    writableCache.lastAppliedAtMsByTableName.set(
      TABLES.SERVICE_ENDPOINTS,
      Date.now(),
    );
    writableCache.lastAppliedAtMsByTableName.set(
      TABLES.SERVICE_DEFINITIONS,
      Date.now(),
    );

    const authoritativeCache = createPopulatedCache();
    seedRoutedTableDiscoveryRows(authoritativeCache);
    const authoritativeGateway = createAuthoritativeCacheGateway(writableCache, {
      readRowsByTable: {
        [TABLES.NODES]: authoritativeCache.getAll(TABLES.NODES),
        [TABLES.PARTITIONS]: authoritativeCache.getAll(TABLES.PARTITIONS),
        [TABLES.TABLES]: authoritativeCache.getAll(TABLES.TABLES),
        [TABLES.NODE_ENDPOINTS]: authoritativeCache.getAll(TABLES.NODE_ENDPOINTS),
        [TABLES.SERVICE_DEFINITIONS]:
          authoritativeCache.getAll(TABLES.SERVICE_DEFINITIONS),
        [TABLES.SERVICE_ENDPOINTS]:
          authoritativeCache.getAll(TABLES.SERVICE_ENDPOINTS),
        [TABLES.REPLICA_OPERATIONS]:
          authoritativeCache.getAll(TABLES.REPLICA_OPERATIONS),
        [TABLES.SERVICES]: authoritativeCache.getAll(TABLES.SERVICES),
      },
    });
    const sqlCalls = [];
    const api = new AdminWebSocketAPI({
      nodeId: 'test-node',
      systemTableCache: createReadOnlyCache(writableCache),
      cacheMutationTarget: writableCache,
      controlPlaneSystemTableGateway: authoritativeGateway,
      sqlQueryEngine: {
        async executeRequest(request) {
          sqlCalls.push(String(request?.statement || ''));
          return {
            success: false,
            error: 'routed_sql_should_not_be_used',
          };
        },
      },
    });

    const result = await api.buildServiceDiscoveryQueryResult({
      tableName: 'benchmark_events',
      tableId: 'table-benchmark-events',
      allowAuthoritativeRepair: true,
    });
    const snapshot = result?.rows?.[0] || null;
    const replicas = snapshot?.services?.[0]?.replicas || [];

    t.equal(
      snapshot?.serviceCount,
      1,
      'table-scoped discovery should repair the cache through the injected authoritative owner',
    );
    t.equal(
      replicas.length,
      2,
      'authoritative gateway repair should restore both postgres-wire replicas',
    );
    t.same(
      [...new Set(authoritativeGateway.executeReadCalls
        .map((call) => call.tableName))]
        .sort(),
      [
        TABLES.NODES,
        TABLES.PARTITIONS,
        TABLES.SERVICES,
        TABLES.TABLES,
        TABLES.SERVICE_DEFINITIONS,
        TABLES.SERVICE_ENDPOINTS,
      ].sort(),
      'repair should read only the scoped authoritative discovery tables through control-plane gateway',
    );
    t.equal(
      authoritativeGateway.executeReadCalls.every((call) => {
        return call?.options?.routingReadinessDimension ===
          CONTROL_PLANE_READINESS_DIMENSION.REPAIR_ELIGIBLE;
      }),
      true,
      'authoritative gateway repair should request repairEligible routing',
    );
    t.equal(
      authoritativeGateway.executeReadCalls.every((call) => {
        return call?.options?.allowSqlFallback === true;
      }),
      true,
      'authoritative gateway repair should opt into routed authoritative reads',
    );
    t.equal(
      sqlCalls.length,
      0,
      'repair must not bypass the authoritative gateway with routed SQL',
    );
  },
);

test(
  'AdminWebSocketAPI - table-scoped discovery does not repair learner readiness gaps',
  async (t) => {
    const staleAppliedAtMs = Date.now() - 10000;
    const writableCache = createPopulatedCache();
    seedTableDiscoveryRowsWithLocalCandidate(writableCache);
    writableCache.lastAppliedAtMsByTableName.set(
      TABLES.SERVICE_ENDPOINTS,
      staleAppliedAtMs,
    );
    writableCache.lastAppliedAtMsByTableName.set(
      TABLES.SERVICE_DEFINITIONS,
      staleAppliedAtMs,
    );

    const repairEngine = createSystemTableRepairQueryEngine({
      [TABLES.NODES]: writableCache.getAll(TABLES.NODES),
      [TABLES.PARTITIONS]: writableCache.getAll(TABLES.PARTITIONS),
      [TABLES.TABLES]: writableCache.getAll(TABLES.TABLES),
      [TABLES.NODE_ENDPOINTS]: writableCache.getAll(TABLES.NODE_ENDPOINTS),
      [TABLES.SERVICE_DEFINITIONS]: writableCache.getAll(TABLES.SERVICE_DEFINITIONS),
      [TABLES.SERVICE_ENDPOINTS]: writableCache.getAll(TABLES.SERVICE_ENDPOINTS),
      [TABLES.REPLICA_OPERATIONS]: writableCache.getAll(TABLES.REPLICA_OPERATIONS),
      [TABLES.SERVICES]: writableCache.getAll(TABLES.SERVICES),
    });
    const api = new AdminWebSocketAPI({
      nodeId: 'test-node',
      systemTableCache: createReadOnlyCache(writableCache),
      cacheMutationTarget: writableCache,
      controlPlaneSystemTableGateway: createAuthoritativeCacheGateway(writableCache, {
        queryEngine: repairEngine,
      }),
      sqlQueryEngine: repairEngine,
    });

    const result = await api.buildServiceDiscoveryQueryResult({
      tableName: 'benchmark_events',
      tableId: 'table-benchmark-events',
    });
    const replicas = result?.rows?.[0]?.services?.[0]?.replicas || [];
    const candidateReplica = replicas.find((replica) => replica?.nodeId === 'node-2');

    t.equal(
      candidateReplica?.readiness?.benchmarkReady,
      false,
      'candidate readiness should remain blocked without forcing repair',
    );
    t.same(
      repairEngine.executeRequestCalls,
      [],
      'non-cache-gap readiness blockers should not trigger authoritative repair',
    );
  },
);

test('AdminWebSocketAPI - table-scoped discovery readiness marks missing schema',
  async (t) => {
    const cache = createPopulatedCache();
    seedServiceDiscoveryRows(cache);
    const api = new AdminWebSocketAPI({
      nodeId: 'test-node',
      systemTableCache: cache,
      sqlQueryEngine: createMockQueryEngine(),
    });

    await api.initialize(0, {listen: false});
    const response = await api.getFastify().inject({
      method: 'GET',
      url: '/api/admin/discovery/services?' +
        'serviceId=sys-postgres-wire&protocol=postgresql&tableName=benchmark_events',
    });
    const payload = response.json();

    t.equal(response.statusCode, 200, 'should return 200');
    const readiness = payload.services[0].replicas[0].readiness;
    t.equal(readiness.schemaReady, false, 'missing table should mark schema not ready');
    t.equal(readiness.workloadReady, false, 'missing table should block workload readiness');
    t.equal(readiness.topologyReady, true, 'topology can still be ready when schema is missing');
    t.equal(
      readiness.benchmarkReady,
      false,
      'benchmark readiness should fail when schema is missing',
    );
    t.equal(
      readiness.reasons.some((reason) => reason.code === 'schema_table_missing'),
      true,
      'readiness reasons should include schema_table_missing',
    );

    await api.shutdown();
  });

test(
  'AdminWebSocketAPI - table-scoped discovery keeps routed replicas schema ready',
  async (t) => {
    const cache = createPopulatedCache();
    seedRoutedTableDiscoveryRows(cache);
    const api = new AdminWebSocketAPI({
      nodeId: 'test-node',
      systemTableCache: cache,
      sqlQueryEngine: createMockQueryEngine(),
    });

    await api.initialize(0, {listen: false});
    const response = await api.getFastify().inject({
      method: 'GET',
      url: '/api/admin/discovery/services?' +
        'serviceId=sys-postgres-wire&protocol=postgresql&tableName=benchmark_events',
    });
    const payload = response.json();

    t.equal(response.statusCode, 200, 'should return 200');
    const replicas = Array.isArray(payload?.services?.[0]?.replicas) ?
      payload.services[0].replicas :
      [];
    const readinessByNodeId = new Map(replicas.map((replica) => [
      String(replica?.nodeId || ''),
      replica?.readiness || null,
    ]));

    t.equal(
      readinessByNodeId.get('node-1')?.schemaReady,
      true,
      'node-1 should remain schema ready',
    );
    t.equal(
      readinessByNodeId.get('node-2')?.routingReady,
      true,
      'node-2 should remain routing ready',
    );
    t.equal(
      readinessByNodeId.get('node-2')?.schemaReady,
      true,
      'node-2 should remain schema ready via routed partition ownership',
    );
    t.equal(
      readinessByNodeId.get('node-2')?.reasons?.some((reason) =>
        reason.code === 'schema_partition_unavailable'),
      false,
      'node-2 should not be excluded for lacking local partition replica',
    );

    await api.shutdown();
  },
);

test(
  'AdminWebSocketAPI - table-scoped discovery excludes local learner replicas from benchmark readiness',
  async (t) => {
    const cache = createPopulatedCache();
    seedTableDiscoveryRowsWithLocalLearner(cache);
    const api = new AdminWebSocketAPI({
      nodeId: 'test-node',
      systemTableCache: cache,
      sqlQueryEngine: createMockQueryEngine(),
    });

    await api.initialize(0, {listen: false});
    const response = await api.getFastify().inject({
      method: 'GET',
      url: '/api/admin/discovery/services?' +
        'serviceId=sys-postgres-wire&protocol=postgresql&tableName=benchmark_events',
    });
    const payload = response.json();

    t.equal(response.statusCode, 200, 'should return 200');
    const replicas = Array.isArray(payload?.services?.[0]?.replicas) ?
      payload.services[0].replicas :
      [];
    const readinessByNodeId = new Map(replicas.map((replica) => [
      String(replica?.nodeId || ''),
      replica?.readiness || null,
    ]));

    t.equal(
      readinessByNodeId.get('node-1')?.benchmarkReady,
      true,
      'leader-hosting node should remain benchmark ready',
    );
    t.equal(
      readinessByNodeId.get('node-2')?.routingReady,
      true,
      'learner-hosting node should remain routing ready',
    );
    t.equal(
      readinessByNodeId.get('node-2')?.schemaReady,
      true,
      'learner-hosting node should remain schema ready via cluster routing',
    );
    t.equal(
      readinessByNodeId.get('node-2')?.topologyReady,
      false,
      'local learner replica should block topology readiness',
    );
    t.equal(
      readinessByNodeId.get('node-2')?.benchmarkReady,
      false,
      'local learner replica should block benchmark readiness',
    );
    t.equal(
      readinessByNodeId.get('node-2')?.reasons?.some((reason) =>
        reason.code === 'local_replica_not_voter_ready'),
      true,
      'readiness reasons should expose the local learner exclusion',
    );

    await api.shutdown();
  },
);

test(
  'AdminWebSocketAPI - table-scoped discovery excludes local candidate replicas from benchmark readiness',
  async (t) => {
    const cache = createPopulatedCache();
    seedTableDiscoveryRowsWithLocalCandidate(cache);
    const api = new AdminWebSocketAPI({
      nodeId: 'test-node',
      systemTableCache: cache,
      sqlQueryEngine: createMockQueryEngine(),
    });

    await api.initialize(0, {listen: false});
    const response = await api.getFastify().inject({
      method: 'GET',
      url: '/api/admin/discovery/services?' +
        'serviceId=sys-postgres-wire&protocol=postgresql&tableName=benchmark_events',
    });
    const payload = response.json();

    t.equal(response.statusCode, 200, 'should return 200');
    const replicas = Array.isArray(payload?.services?.[0]?.replicas) ?
      payload.services[0].replicas :
      [];
    const readinessByNodeId = new Map(replicas.map((replica) => [
      String(replica?.nodeId || ''),
      replica?.readiness || null,
    ]));

    t.equal(
      readinessByNodeId.get('node-1')?.benchmarkReady,
      true,
      'leader-hosting node should remain benchmark ready',
    );
    t.equal(
      readinessByNodeId.get('node-2')?.routingReady,
      true,
      'candidate-hosting node should remain routing ready',
    );
    t.equal(
      readinessByNodeId.get('node-2')?.schemaReady,
      true,
      'candidate-hosting node should remain schema ready via cluster routing',
    );
    t.equal(
      readinessByNodeId.get('node-2')?.topologyReady,
      false,
      'local candidate replica should block topology readiness',
    );
    t.equal(
      readinessByNodeId.get('node-2')?.benchmarkReady,
      false,
      'local candidate replica should block benchmark readiness',
    );
    t.equal(
      readinessByNodeId.get('node-2')?.reasons?.some((reason) =>
        reason.code === 'local_replica_not_voter_ready'),
      true,
      'readiness reasons should expose the local candidate exclusion',
    );
    t.equal(
      replicas.find((replica) => replica?.nodeId === 'node-2')?.benchmarkAdmission?.state,
      'blocked',
      'candidate-hosting node should publish blocked benchmark admission state',
    );
    t.equal(
      replicas.find((replica) => replica?.nodeId === 'node-2')
        ?.benchmarkAdmission?.reasons?.some((reason) =>
          reason.code === 'local_replica_not_voter_ready'),
      true,
      'benchmark admission should expose stable local replica blocker reasons',
    );

    await api.shutdown();
  },
);

test(
  'AdminWebSocketAPI - table-scoped discovery degrades failed replace movements with operation ids',
  async (t) => {
    const cache = createPopulatedCache();
    seedTableDiscoveryRowsWithLocalFollower(cache);
    cache.applySystemTableChange(TABLES.REPLICA_OPERATIONS, 'INSERT', {
      operation_id: 'op-replace-failed',
      type: 'REPLACE',
      partition_id: 'partition-benchmark-events-1',
      entity_type: 'partition',
      entity_id: 'partition-benchmark-events-1',
      source_node_id: 'node-1',
      target_node_id: 'node-2',
      status: 'failed',
      workflow_step: 'FAILED',
      error_message: 'replica.moved failed',
    });
    const api = new AdminWebSocketAPI({
      nodeId: 'test-node',
      systemTableCache: cache,
      sqlQueryEngine: createMockQueryEngine(),
    });

    await api.initialize(0, {listen: false});
    const response = await api.getFastify().inject({
      method: 'GET',
      url: '/api/admin/discovery/services?' +
        'serviceId=sys-postgres-wire&protocol=postgresql&tableName=benchmark_events',
    });
    const payload = response.json();

    t.equal(response.statusCode, 200, 'should return 200');
    const replicas = Array.isArray(payload?.services?.[0]?.replicas) ?
      payload.services[0].replicas :
      [];
    const admissionByNodeId = new Map(replicas.map((replica) => [
      String(replica?.nodeId || ''),
      replica?.benchmarkAdmission || null,
    ]));

    t.equal(
      admissionByNodeId.get('node-2')?.state,
      'blocked',
      'failed replace target should be blocked for benchmark admission',
    );
    t.equal(
      admissionByNodeId.get('node-2')?.degradationState,
      'move_failed',
      'failed replace should classify benchmark admission as move_failed',
    );
    t.same(
      admissionByNodeId.get('node-2')?.degradedByOperationIds,
      ['op-replace-failed'],
      'failed replace should expose owning operation id',
    );
    t.equal(
      admissionByNodeId.get('node-2')?.reasons?.some((reason) =>
        reason.code === 'replica_operation_failed'),
      true,
      'failed replace should surface replica_operation_failed reason',
    );

    await api.shutdown();
  },
);

test(
  'AdminWebSocketAPI - table-scoped discovery degrades pending promotion outcomes',
  async (t) => {
    const cache = createPopulatedCache();
    seedTableDiscoveryRowsWithLocalFollower(cache);
    cache.applySystemTableChange(TABLES.REPLICA_OPERATIONS, 'INSERT', {
      operation_id: 'op-add-pending',
      type: 'ADD',
      partition_id: 'partition-benchmark-events-1',
      entity_type: 'partition',
      entity_id: 'partition-benchmark-events-1',
      source_node_id: 'node-1',
      target_node_id: 'node-2',
      status: 'creating',
      workflow_step: 'CREATING',
    });
    const api = new AdminWebSocketAPI({
      nodeId: 'test-node',
      systemTableCache: cache,
      sqlQueryEngine: createMockQueryEngine(),
    });

    await api.initialize(0, {listen: false});
    const response = await api.getFastify().inject({
      method: 'GET',
      url: '/api/admin/discovery/services?' +
        'serviceId=sys-postgres-wire&protocol=postgresql&tableName=benchmark_events',
    });
    const payload = response.json();

    t.equal(response.statusCode, 200, 'should return 200');
    const replicas = Array.isArray(payload?.services?.[0]?.replicas) ?
      payload.services[0].replicas :
      [];
    const readinessByNodeId = new Map(replicas.map((replica) => [
      String(replica?.nodeId || ''),
      replica?.readiness || null,
    ]));
    const admissionByNodeId = new Map(replicas.map((replica) => [
      String(replica?.nodeId || ''),
      replica?.benchmarkAdmission || null,
    ]));

    t.equal(
      admissionByNodeId.get('node-2')?.state,
      'blocked',
      'pending promotion target should be blocked for benchmark admission',
    );
    t.equal(
      admissionByNodeId.get('node-2')?.degradationState,
      'promotion_pending',
      'ADD creating should classify benchmark admission as promotion_pending',
    );
    t.same(
      admissionByNodeId.get('node-2')?.degradedByOperationIds,
      ['op-add-pending'],
      'pending promotion should expose owning operation id',
    );
    t.equal(
      admissionByNodeId.get('node-2')?.reasons?.some((reason) =>
        reason.code === 'replica_operation_in_flight'),
      true,
      'pending promotion should surface in-flight replica operation reason',
    );
    t.equal(
      readinessByNodeId.get('node-1')?.topologyReady,
      true,
      'unaffected source replica should remain topology ready',
    );
    t.equal(
      readinessByNodeId.get('node-1')?.benchmarkReady,
      true,
      'unaffected source replica should remain benchmark ready',
    );
    t.equal(
      readinessByNodeId.get('node-1')?.reasons?.some((reason) =>
        reason.code === 'replica_operations_in_flight'),
      false,
      'unaffected source replica should not inherit global replica-op blockers',
    );
    t.equal(
      admissionByNodeId.get('node-1')?.state,
      'ready',
      'pending promotion source should stay admitted when it is route-safe',
    );
    t.equal(
      admissionByNodeId.get('node-1')?.degradationState,
      'healthy',
      'pending promotion source should not inherit target degradation',
    );
    t.same(
      admissionByNodeId.get('node-1')?.degradedByOperationIds,
      [],
      'pending promotion source should not expose target operation ids',
    );

    await api.shutdown();
  },
);

test(
  'AdminWebSocketAPI - table-scoped discovery blocks failed promotion target without degrading source',
  async (t) => {
    const cache = createPopulatedCache();
    seedTableDiscoveryRowsWithLocalFollower(cache);
    cache.applySystemTableChange(TABLES.REPLICA_OPERATIONS, 'INSERT', {
      operation_id: 'op-add-failed',
      type: 'ADD',
      partition_id: 'partition-benchmark-events-1',
      entity_type: 'partition',
      entity_id: 'partition-benchmark-events-1',
      source_node_id: 'node-1',
      target_node_id: 'node-2',
      status: 'failed',
      workflow_step: 'FAILED',
    });
    const api = new AdminWebSocketAPI({
      nodeId: 'test-node',
      systemTableCache: cache,
      sqlQueryEngine: createMockQueryEngine(),
    });

    await api.initialize(0, {listen: false});
    const response = await api.getFastify().inject({
      method: 'GET',
      url: '/api/admin/discovery/services?' +
        'serviceId=sys-postgres-wire&protocol=postgresql&tableName=benchmark_events',
    });
    const payload = response.json();

    t.equal(response.statusCode, 200, 'should return 200');
    const replicas = Array.isArray(payload?.services?.[0]?.replicas) ?
      payload.services[0].replicas :
      [];
    const admissionByNodeId = new Map(replicas.map((replica) => [
      String(replica?.nodeId || ''),
      replica?.benchmarkAdmission || null,
    ]));

    t.equal(
      admissionByNodeId.get('node-2')?.state,
      'blocked',
      'failed promotion target should be blocked for benchmark admission',
    );
    t.equal(
      admissionByNodeId.get('node-2')?.degradationState,
      'promotion_failed',
      'failed ADD should classify benchmark admission as promotion_failed',
    );
    t.same(
      admissionByNodeId.get('node-2')?.degradedByOperationIds,
      ['op-add-failed'],
      'failed promotion target should expose owning operation id',
    );
    t.equal(
      admissionByNodeId.get('node-2')?.reasons?.some((reason) =>
        reason.code === 'replica_operation_failed'),
      true,
      'failed promotion target should surface failure reason',
    );
    t.equal(
      admissionByNodeId.get('node-1')?.state,
      'ready',
      'failed promotion source should remain benchmark-ready',
    );
    t.equal(
      admissionByNodeId.get('node-1')?.degradationState,
      'healthy',
      'failed promotion source should not inherit target degradation',
    );
    t.same(
      admissionByNodeId.get('node-1')?.degradedByOperationIds,
      [],
      'failed promotion source should not expose target operation ids',
    );
    t.equal(
      admissionByNodeId.get('node-1')?.reasons?.some((reason) =>
        reason.code === 'replica_operation_failed'),
      false,
      'failed promotion source should not surface failure reason',
    );

    await api.shutdown();
  },
);

test(
  'AdminWebSocketAPI - table-scoped discovery ignores completed promotion rows',
  async (t) => {
    const cache = createPopulatedCache();
    seedTableDiscoveryRowsWithLocalFollower(cache);
    cache.applySystemTableChange(TABLES.REPLICA_OPERATIONS, 'INSERT', {
      operation_id: 'op-add-complete',
      type: 'ADD',
      partition_id: 'partition-benchmark-events-1',
      entity_type: 'partition',
      entity_id: 'partition-benchmark-events-1',
      target_node_id: 'node-2',
      status: 'active',
      workflow_step: 'ACTIVE',
      completed_at: 1741000000000,
    });
    const api = new AdminWebSocketAPI({
      nodeId: 'test-node',
      systemTableCache: cache,
      sqlQueryEngine: createMockQueryEngine(),
    });

    await api.initialize(0, {listen: false});
    const response = await api.getFastify().inject({
      method: 'GET',
      url: '/api/admin/discovery/services?' +
        'serviceId=sys-postgres-wire&protocol=postgresql&tableName=benchmark_events',
    });
    const payload = response.json();

    t.equal(response.statusCode, 200, 'should return 200');
    const replicas = Array.isArray(payload?.services?.[0]?.replicas) ?
      payload.services[0].replicas :
      [];
    const admissionByNodeId = new Map(replicas.map((replica) => [
      String(replica?.nodeId || ''),
      replica?.benchmarkAdmission || null,
    ]));

    t.equal(
      admissionByNodeId.get('node-2')?.state,
      'ready',
      'completed promotion target should not stay blocked for benchmark admission',
    );
    t.equal(
      admissionByNodeId.get('node-2')?.degradationState,
      'healthy',
      'completed ADD rows should not classify benchmark admission as promotion_pending',
    );
    t.same(
      admissionByNodeId.get('node-2')?.degradedByOperationIds,
      [],
      'completed promotion should not expose stale operation ids',
    );
    t.equal(
      admissionByNodeId.get('node-2')?.reasons?.some((reason) =>
        reason.code === 'replica_operation_in_flight'),
      false,
      'completed promotion should not surface in-flight replica operation reason',
    );

    await api.shutdown();
  },
);

test(
  'AdminWebSocketAPI - table-scoped discovery clears degradation only when blocking operation rows disappear',
  async (t) => {
    const cache = createPopulatedCache();
    seedTableDiscoveryRowsWithLocalFollower(cache);
    const failedOperationRow = {
      operation_id: 'op-replace-failed',
      type: 'REPLACE',
      partition_id: 'partition-benchmark-events-1',
      entity_type: 'partition',
      entity_id: 'partition-benchmark-events-1',
      source_node_id: 'node-1',
      target_node_id: 'node-2',
      status: 'failed',
      workflow_step: 'FAILED',
    };
    cache.applySystemTableChange(
      TABLES.REPLICA_OPERATIONS,
      'INSERT',
      failedOperationRow,
    );
    const api = new AdminWebSocketAPI({
      nodeId: 'test-node',
      systemTableCache: cache,
      sqlQueryEngine: createMockQueryEngine(),
    });

    await api.initialize(0, {listen: false});
    const firstResponse = await api.getFastify().inject({
      method: 'GET',
      url: '/api/admin/discovery/services?' +
        'serviceId=sys-postgres-wire&protocol=postgresql&tableName=benchmark_events',
    });
    const firstReplicas = firstResponse.json().services[0].replicas;
    const blockedAdmission = firstReplicas.find((replica) =>
      replica?.nodeId === 'node-2')?.benchmarkAdmission;
    t.equal(blockedAdmission?.state, 'blocked', 'failed operation should block initially');

    cache.applySystemTableChange(
      TABLES.REPLICA_OPERATIONS,
      'DELETE',
      {operation_id: 'op-replace-failed'},
    );
    cache.applySystemTableChange(TABLES.REPLICA_OPERATIONS, 'INSERT', {
      operation_id: 'op-unrelated-failed',
      type: 'REPLACE',
      partition_id: 'partition-unrelated-1',
      entity_type: 'partition',
      entity_id: 'partition-unrelated-1',
      source_node_id: 'node-3',
      target_node_id: 'node-4',
      status: 'failed',
      workflow_step: 'FAILED',
    });

    const secondResponse = await api.getFastify().inject({
      method: 'GET',
      url: '/api/admin/discovery/services?' +
        'serviceId=sys-postgres-wire&protocol=postgresql&tableName=benchmark_events',
    });
    const secondReplicas = secondResponse.json().services[0].replicas;
    const clearedAdmission = secondReplicas.find((replica) =>
      replica?.nodeId === 'node-2')?.benchmarkAdmission;

    t.equal(
      clearedAdmission?.state,
      'ready',
      'degradation should clear once the blocking node operation disappears',
    );
    t.equal(
      clearedAdmission?.degradationState,
      'healthy',
      'cleared admission should return to healthy degradation state',
    );
    t.same(
      clearedAdmission?.degradedByOperationIds,
      [],
      'unrelated failed operations should not keep stale degradation ids',
    );

    await api.shutdown();
  },
);

test(
  'AdminWebSocketAPI - table-scoped discovery ignores unrelated failed operations on same node',
  async (t) => {
    const cache = createPopulatedCache();
    seedTableDiscoveryRowsWithLocalFollower(cache);
    cache.applySystemTableChange(TABLES.REPLICA_OPERATIONS, 'INSERT', {
      operation_id: 'op-unrelated-failed',
      type: 'REPLACE',
      partition_id: 'partition-unrelated-1',
      entity_type: 'message_group',
      entity_id: 'partition-unrelated-1',
      source_node_id: 'node-1',
      target_node_id: 'node-2',
      status: 'failed',
      workflow_step: 'FAILED',
    });
    const api = new AdminWebSocketAPI({
      nodeId: 'test-node',
      systemTableCache: cache,
      sqlQueryEngine: createMockQueryEngine(),
    });

    await api.initialize(0, {listen: false});
    const response = await api.getFastify().inject({
      method: 'GET',
      url: '/api/admin/discovery/services?' +
        'serviceId=sys-postgres-wire&protocol=postgresql&tableName=benchmark_events',
    });
    const payload = response.json();

    t.equal(response.statusCode, 200, 'should return 200');
    const replicas = Array.isArray(payload?.services?.[0]?.replicas) ?
      payload.services[0].replicas :
      [];
    const admission = replicas.find((replica) =>
      replica?.nodeId === 'node-2')?.benchmarkAdmission || null;

    t.equal(
      admission?.state,
      'ready',
      'unrelated failed operations should not block benchmark admission',
    );
    t.equal(
      admission?.degradationState,
      'healthy',
      'unrelated failed operations should not set move_failed',
    );
    t.same(
      admission?.degradedByOperationIds,
      [],
      'unrelated failed operations should not leak operation ids',
    );
    t.equal(
      admission?.reasons?.some((reason) =>
        reason.code === 'replica_operation_failed'),
      false,
      'unrelated failed operations should not add replica-operation failure reasons',
    );

    await api.shutdown();
  },
);

test(
  'AdminWebSocketAPI - local discovery does not require CDC subscribers for user tables',
  async (t) => {
    const cache = createPopulatedCache();
    seedTableDiscoveryRowsWithLocalFollower(cache);
    const api = new AdminWebSocketAPI({
      nodeId: 'node-2',
      systemTableCache: cache,
      sqlQueryEngine: createMockQueryEngine(),
      partitionServices: new Map([
        ['partition-benchmark-events-1', {
          partitionId: 'partition-benchmark-events-1',
          getCDCSubscriptionDiagnostics() {
            return {
              subscriberCount: 0,
              bufferedEvents: 0,
              bufferReplayInFlight: false,
            };
          },
        }],
      ]),
    });

    await api.initialize(0, {listen: false});
    const {ws} = await connectAndReceive(api);

    ws.send(JSON.stringify({
      type: MessageType.QUERY,
      queryId: 'q-local-cdc-subscriber-missing',
      sql: 'SELECT * FROM service_discovery_local(\'benchmark_events\')',
    }));
    const response = await waitForMessage(ws);

    t.equal(response.type, MessageType.QUERY_RESULT, 'should return query_result');
    const replicas = Array.isArray(response?.results?.[0]?.services?.[0]?.replicas) ?
      response.results[0].services[0].replicas :
      [];
    const readinessByNodeId = new Map(replicas.map((replica) => [
      String(replica?.nodeId || ''),
      replica?.readiness || null,
    ]));

    t.equal(
      readinessByNodeId.get('node-1')?.benchmarkReady,
      true,
      'remote leader should remain benchmark ready',
    );
    t.equal(
      readinessByNodeId.get('node-2')?.routingReady,
      true,
      'local follower should remain routing ready',
    );
    t.equal(
      readinessByNodeId.get('node-2')?.schemaReady,
      true,
      'local follower should remain schema ready',
    );
    t.equal(
      readinessByNodeId.get('node-2')?.topologyReady,
      true,
      'user-table local followers should remain topology ready without system CDC subscribers',
    );
    t.equal(
      readinessByNodeId.get('node-2')?.benchmarkReady,
      true,
      'user-table local followers should remain benchmark ready without system CDC subscribers',
    );
    t.equal(
      readinessByNodeId.get('node-2')?.reasons?.some((reason) =>
        reason.code === 'local_cdc_subscriber_missing'),
      false,
      'user-table readiness should not report missing system CDC subscribers',
    );

    ws.close();
    await api.shutdown();
  },
);

test(
  'AdminWebSocketAPI - table-scoped discovery ignores stale ADD rows once exact target replica services are active',
  async (t) => {
    const cache = createPopulatedCache();
    seedRoutedTableDiscoveryRows(cache);
    cache.applySystemTableChange(TABLES.SERVICES, 'INSERT', {
      id: 'partition-benchmark-events-1-r2',
      service_id: 'partition-benchmark-events-1-r2',
      service_type: 'partition',
      partition_id: 'partition-benchmark-events-1',
      replica_id: 'partition-benchmark-events-1-r2',
      node_id: 'node-2',
      status: 'active',
      raft_role: 'follower',
      address: '10.0.0.2:7001',
    });
    cache.applySystemTableChange(TABLES.REPLICA_OPERATIONS, 'INSERT', {
      operation_id: 'op-add-stale-active-replica',
      type: 'ADD',
      partition_id: 'partition-benchmark-events-1',
      entity_type: 'partition',
      entity_id: 'partition-benchmark-events-1',
      source_node_id: 'node-1',
      target_node_id: 'node-2',
      replica_id: 'partition-benchmark-events-1-r2',
      status: 'creating',
      workflow_step: 'CREATING',
    });
    const api = new AdminWebSocketAPI({
      nodeId: 'test-node',
      systemTableCache: cache,
      sqlQueryEngine: createMockQueryEngine(),
    });

    const result = await api.buildServiceDiscoveryQueryResult({
      tableName: 'benchmark_events',
    });
    const snapshot = result?.rows?.[0] || null;
    const replicas = snapshot?.services?.[0]?.replicas || [];
    const targetReplica = replicas.find((replica) =>
      replica?.nodeId === 'node-2');

    t.equal(
      snapshot?.replicaOperations?.inFlightCount,
      0,
      'discovery summary should not count stale ADD rows once the exact target replica is active',
    );
    t.equal(
      targetReplica?.readiness?.benchmarkReady,
      true,
      'target replica should stay benchmark ready once canonical services show the ADD completed',
    );
    t.equal(
      targetReplica?.readiness?.reasons?.some((reason) =>
        reason.code === 'replica_operation_in_flight'),
      false,
      'target replica should not surface stale in-flight replica-operation reasons',
    );
    t.equal(
      targetReplica?.benchmarkAdmission?.state,
      'ready',
      'benchmark admission should not keep blocking on a stale ADD row after the target replica is active',
    );
  },
);

test(
  'AdminWebSocketAPI - local discovery ignores buffered CDC state for user tables',
  async (t) => {
    const cache = createPopulatedCache();
    seedTableDiscoveryRowsWithLocalFollower(cache);
    const api = new AdminWebSocketAPI({
      nodeId: 'node-2',
      systemTableCache: cache,
      sqlQueryEngine: createMockQueryEngine(),
      partitionServices: new Map([
        ['partition-benchmark-events-1', {
          partitionId: 'partition-benchmark-events-1',
          getCDCSubscriptionDiagnostics() {
            return {
              subscriberCount: 1,
              bufferedEvents: 3,
              bufferReplayInFlight: true,
            };
          },
        }],
      ]),
    });

    await api.initialize(0, {listen: false});
    const {ws} = await connectAndReceive(api);

    ws.send(JSON.stringify({
      type: MessageType.QUERY,
      queryId: 'q-local-cdc-buffered',
      sql: 'SELECT * FROM service_discovery_local(\'benchmark_events\')',
    }));
    const response = await waitForMessage(ws);

    t.equal(response.type, MessageType.QUERY_RESULT, 'should return query_result');
    const replicas = Array.isArray(response?.results?.[0]?.services?.[0]?.replicas) ?
      response.results[0].services[0].replicas :
      [];
    const readinessByNodeId = new Map(replicas.map((replica) => [
      String(replica?.nodeId || ''),
      replica?.readiness || null,
    ]));

    t.equal(
      readinessByNodeId.get('node-2')?.topologyReady,
      true,
      'user-table local followers should ignore system CDC buffer state',
    );
    t.equal(
      readinessByNodeId.get('node-2')?.benchmarkReady,
      true,
      'user-table local followers should remain benchmark ready despite system CDC buffer state',
    );
    t.equal(
      readinessByNodeId.get('node-2')?.reasons?.some((reason) =>
        reason.code === 'local_cdc_buffer_not_drained'),
      false,
      'user-table readiness should not report system CDC buffer state',
    );
    t.equal(
      replicas.find((replica) => replica?.nodeId === 'node-2')?.benchmarkAdmission?.state,
      'ready',
      'user-table local follower should publish ready benchmark admission state',
    );
    t.same(
      replicas.find((replica) => replica?.nodeId === 'node-2')?.benchmarkAdmission?.reasons,
      [],
      'ready benchmark admission should not carry blocker reasons',
    );

    ws.close();
    await api.shutdown();
  },
);

test(
  'AdminWebSocketAPI - table-scoped discovery ignores unrelated replica operations',
  async (t) => {
    const cache = createPopulatedCache();
    seedRoutedTableDiscoveryRows(cache);
    cache.applySystemTableChange(TABLES.REPLICA_OPERATIONS, 'INSERT', {
      operation_id: 'op-unrelated',
      partition_id: 'partition-unrelated-1',
      entity_id: 'partition-unrelated-1',
      status: 'creating',
    });
    const api = new AdminWebSocketAPI({
      nodeId: 'test-node',
      systemTableCache: cache,
      sqlQueryEngine: createMockQueryEngine(),
    });

    await api.initialize(0, {listen: false});
    const response = await api.getFastify().inject({
      method: 'GET',
      url: '/api/admin/discovery/services?' +
        'serviceId=sys-postgres-wire&protocol=postgresql&tableName=benchmark_events',
    });
    const payload = response.json();

    t.equal(response.statusCode, 200, 'should return 200');
    const replicas = Array.isArray(payload?.services?.[0]?.replicas) ?
      payload.services[0].replicas :
      [];
    const readinessByNodeId = new Map(replicas.map((replica) => [
      String(replica?.nodeId || ''),
      replica?.readiness || null,
    ]));

    t.equal(
      readinessByNodeId.get('node-1')?.topologyReady,
      true,
      'unrelated replica operations should not block target-partition topology',
    );
    t.equal(
      readinessByNodeId.get('node-1')?.benchmarkReady,
      true,
      'leader-hosting node should stay benchmark ready when only unrelated ops exist',
    );
    t.equal(
      readinessByNodeId.get('node-2')?.benchmarkReady,
      true,
      'routed peer should stay benchmark ready when unrelated ops are in flight',
    );
    t.equal(
      readinessByNodeId.get('node-1')?.reasons?.some((reason) =>
        reason.code === 'replica_operations_in_flight'),
      false,
      'readiness should not report unrelated replica operation pressure',
    );

    await api.shutdown();
  },
);

test(
  'AdminWebSocketAPI - table-scoped discovery falls back to partition schema watermark',
  async (t) => {
    const expectedSchemaVersion = 1740589945999;
    const cache = createPopulatedCache();
    seedPartitionScopedDiscoveryRowsWithoutTableRecord(cache, expectedSchemaVersion);
    const api = new AdminWebSocketAPI({
      nodeId: 'test-node',
      systemTableCache: cache,
      sqlQueryEngine: createMockQueryEngine(),
    });

    await api.initialize(0, {listen: false});
    const response = await api.getFastify().inject({
      method: 'GET',
      url: '/api/admin/discovery/services?' +
        'serviceId=sys-postgres-wire&protocol=postgresql&tableName=benchmark_events',
    });
    const payload = response.json();

    t.equal(response.statusCode, 200, 'should return 200');
    const readiness = payload.services[0].replicas[0].readiness;
    t.equal(
      readiness.schemaReady,
      true,
      'partition coverage should keep schema readiness true',
    );
    t.equal(
      readiness.appliedSchemaVersion,
      String(expectedSchemaVersion),
      'readiness should expose partition-derived schema watermark',
    );
    t.equal(
      readiness.benchmarkReady,
      true,
      'benchmark readiness should remain true when partition watermark is available',
    );

    await api.shutdown();
  },
);

test(
  'AdminWebSocketAPI - local discovery query supports table-id hints',
  async (t) => {
    const expectedSchemaVersion = 1740589946999;
    const cache = createPopulatedCache();
    seedPartitionScopedDiscoveryRowsWithoutTableName(cache, expectedSchemaVersion);
    const api = new AdminWebSocketAPI({
      nodeId: 'test-node',
      systemTableCache: cache,
      sqlQueryEngine: createMockQueryEngine(),
    });

    await api.initialize(0, {listen: false});
    const {ws} = await connectAndReceive(api);

    ws.send(JSON.stringify({
      type: MessageType.QUERY,
      queryId: 'q-table-id-hint',
      sql: 'SELECT * FROM service_discovery_local(' +
        '\'benchmark_events\', \'table-benchmark-events\')',
    }));
    const response = await waitForMessage(ws);

    t.equal(response.type, MessageType.QUERY_RESULT, 'should return query_result');
    t.equal(response.queryId, 'q-table-id-hint', 'should preserve query id');
    t.equal(Array.isArray(response.results), true, 'should include one snapshot row');
    t.equal(response.results.length, 1, 'should return one discovery snapshot');

    const readiness =
      response.results[0]?.services?.[0]?.replicas?.[0]?.readiness || null;
    t.equal(
      readiness?.schemaReady,
      true,
      'table-id hint should resolve partition-scoped schema readiness',
    );
    t.equal(
      readiness?.appliedSchemaVersion,
      String(expectedSchemaVersion),
      'table-id hint should expose partition-derived schema watermark',
    );

    ws.close();
    await api.shutdown();
  },
);

test(
  'AdminWebSocketAPI - preflight cache freshness keeps unknown watermark as null',
  async (t) => {
    const api = new AdminWebSocketAPI({
      nodeId: 'test-node',
      systemTableCache: {
        getAll() {
          return [];
        },
        count() {
          return 0;
        },
        getLastAppliedAtMs() {
          return null;
        },
        getLastAppliedCauseId() {
          return null;
        },
        getAppliedSchemaVersion() {
          return null;
        },
      },
    });

    const cacheFreshness = api.buildPreflightCacheFreshnessSummary({
      capturedAtMs: 12345,
    });

    t.equal(
      cacheFreshness.lastAppliedAtMs,
      null,
      'unknown watermark must remain null in snapshot output',
    );
    t.equal(
      cacheFreshness.stalenessMs,
      null,
      'unknown watermark must not coerce staleness to a synthetic value',
    );
  },
);

test(
  'AdminWebSocketAPI - preflight snapshot repairs stale cache watermark',
  async (t) => {
    const writableCache = createPopulatedCache();
    seedServiceDiscoveryRows(writableCache);
    writableCache.lastAppliedAtMsByTableName.set(
      TABLES.SERVICE_ENDPOINTS,
      Date.now() - 10000,
    );
    const cache = createReadOnlyCache(writableCache);

    const repairEngine = createSystemTableRepairQueryEngine({
      [TABLES.NODES]: writableCache.getAll(TABLES.NODES),
      [TABLES.PARTITIONS]: writableCache.getAll(TABLES.PARTITIONS),
      [TABLES.SERVICES]: writableCache.getAll(TABLES.SERVICES),
      [TABLES.TABLES]: writableCache.getAll(TABLES.TABLES),
      [TABLES.NODE_ENDPOINTS]: writableCache.getAll(TABLES.NODE_ENDPOINTS),
      [TABLES.SERVICE_DEFINITIONS]: writableCache.getAll(TABLES.SERVICE_DEFINITIONS),
      [TABLES.SERVICE_ENDPOINTS]: writableCache.getAll(TABLES.SERVICE_ENDPOINTS),
      [TABLES.REPLICA_OPERATIONS]: writableCache.getAll(TABLES.REPLICA_OPERATIONS),
    });
    const api = new AdminWebSocketAPI({
      nodeId: 'test-node',
      systemTableCache: cache,
      cacheMutationTarget: writableCache,
      controlPlaneSystemTableGateway: createAuthoritativeCacheGateway(writableCache, {
        queryEngine: repairEngine,
      }),
      sqlQueryEngine: repairEngine,
    });

    const result = await api.buildPreflightCriticalPathSnapshotQueryResult();
    const snapshot = result?.rows?.[0] || null;
    const stalenessMs = Number(snapshot?.cacheFreshness?.stalenessMs);

    t.equal(
      Number.isFinite(stalenessMs) && stalenessMs < 5000,
      true,
      'preflight repair should refresh stale cache watermark before responding',
    );
    t.equal(
      repairEngine.executeRequestCalls.includes(
        `SELECT * FROM ${TABLES.SERVICE_ENDPOINTS}`,
      ),
      true,
      'preflight repair should query authoritative service endpoints',
    );
  },
);

test(
  'AdminWebSocketAPI - preflight snapshot does not block on slow authoritative repair',
  async (t) => {
    const writableCache = createPopulatedCache();
    seedServiceDiscoveryRows(writableCache);
    writableCache.lastAppliedAtMsByTableName.set(
      TABLES.SERVICE_ENDPOINTS,
      Date.now() - 10000,
    );
    const api = new AdminWebSocketAPI({
      nodeId: 'test-node',
      systemTableCache: createReadOnlyCache(writableCache),
      cacheMutationTarget: writableCache,
      sqlQueryEngine: createMockQueryEngine(),
    });

    let repairAttempts = 0;
    api.preflightSnapshot.authoritativeRepairWaitBudgetMs = 10;
    api.preflightSnapshot.ensureAuthoritativeDiscoveryCacheRepair = async () => {
      repairAttempts++;
      await new Promise((resolve) => setTimeout(resolve, 50));
      return {applied: true, skipped: false, tableCount: 1};
    };

    const outcome = await Promise.race([
      api.buildPreflightCriticalPathSnapshotQueryResult(),
      new Promise((resolve) => setTimeout(() => resolve('timed_out'), 25)),
    ]);

    t.not(
      outcome,
      'timed_out',
      'preflight snapshot should return without waiting for slow repair',
    );
    t.equal(
      repairAttempts,
      1,
      'preflight snapshot should still trigger authoritative repair once',
    );
  },
);

test('AdminWebSocketAPI - cleanup on disconnect', async (t) => {
  const api = new AdminWebSocketAPI({
    nodeId: 'test-node',
    systemTableCache: createPopulatedCache(),
  });

  await api.initialize(0, {listen: false});
  const {ws} = await connectAndReceive(api);

  t.equal(api.getClientCount(), 1, 'should have 1 client');

  ws.close();
  await new Promise((resolve) => setTimeout(resolve, 50));

  t.equal(api.getClientCount(), 0, 'should have 0 clients after disconnect');

  await api.shutdown();
});

test('AdminWebSocketAPI - query without queryId', async (t) => {
  const api = new AdminWebSocketAPI({
    nodeId: 'test-node',
    systemTableCache: createPopulatedCache(),
    sqlQueryEngine: createMockQueryEngine(),
  });

  await api.initialize(0, {listen: false});
  const {ws} = await connectAndReceive(api);

  ws.send(JSON.stringify({type: MessageType.QUERY, sql: 'SELECT 1'}));

  const result = await waitForMessage(ws);

  t.ok(result.error, 'should have error');
  t.equal(result.errorCode, ErrorCode.MALFORMED_JSON, 'should have error code');

  ws.close();
  await api.shutdown();
});

test('AdminWebSocketAPI - query without sql', async (t) => {
  const api = new AdminWebSocketAPI({
    nodeId: 'test-node',
    systemTableCache: createPopulatedCache(),
    sqlQueryEngine: createMockQueryEngine(),
  });

  await api.initialize(0, {listen: false});
  const {ws} = await connectAndReceive(api);

  ws.send(JSON.stringify({type: MessageType.QUERY, queryId: 'q8'}));

  const result = await waitForMessage(ws);

  t.equal(result.queryId, 'q8', 'should have queryId');
  t.ok(result.error, 'should have error');
  t.equal(result.errorCode, ErrorCode.SYNTAX_ERROR, 'should have error code');

  ws.close();
  await api.shutdown();
});

test('AdminWebSocketAPI - dashboard landing page', async (t) => {
  const api = new AdminWebSocketAPI({
    nodeId: 'test-node',
    testRunService: createMockTestRunService({
      readDashboardPage: async () => '<html><body>landing-page</body></html>',
    }),
  });

  await api.initialize(0, {listen: false});

  const response = await api.getFastify().inject({method: 'GET', url: '/'});
  t.equal(response.statusCode, 200, 'should return 200');
  t.equal(
    response.headers['content-type'],
    'text/html; charset=utf-8',
    'should return html content type',
  );
  t.equal(
    response.headers['cache-control'],
    'no-store',
    'should disable dashboard page caching',
  );
  t.match(response.body, /landing-page/, 'should return dashboard html');

  await api.shutdown();
});

test('AdminWebSocketAPI - test catalog endpoint', async (t) => {
  const api = new AdminWebSocketAPI({
    nodeId: 'test-node',
    testRunService: createMockTestRunService({
      listAvailableTests: async () => [
        {id: 'alpha', file: 'test/distributed/scenarios/alpha.js'},
      ],
      listAvailableConfigs: async () => [
        {id: 'local.json', file: 'test/distributed/config/local.json'},
      ],
    }),
  });

  await api.initialize(0, {listen: false});

  const response = await api.getFastify().inject({
    method: 'GET',
    url: '/api/admin/tests',
  });
  const payload = response.json();
  t.equal(response.statusCode, 200, 'should return 200');
  t.equal(payload.tests.length, 1, 'should include test entries');
  t.equal(payload.tests[0].id, 'alpha', 'should return scenario id');
  t.equal(payload.configs.length, 1, 'should include config entries');
  t.equal(payload.defaultConfig, 'local.json',
    'should publish default config for UI selection');

  await api.shutdown();
});

test('AdminWebSocketAPI - start/stop test run endpoints', async (t) => {
  const run = {
    runId: 'run-1',
    scenario: 'alpha',
    status: 'running',
  };
  const api = new AdminWebSocketAPI({
    nodeId: 'test-node',
    testRunService: createMockTestRunService({
      startRun: async (_payload) => run,
      stopRun: async (_runId) => ({...run, status: 'stopping'}),
    }),
  });

  await api.initialize(0, {listen: false});

  const startResponse = await api.getFastify().inject({
    method: 'POST',
    url: '/api/admin/test-runs',
    payload: {scenario: 'alpha', config: 'local.json'},
  });
  t.equal(startResponse.statusCode, 200, 'should start run');
  t.equal(startResponse.json().run.runId, 'run-1', 'should return run id');

  const stopResponse = await api.getFastify().inject({
    method: 'POST',
    url: '/api/admin/test-runs/run-1/stop',
  });
  t.equal(stopResponse.statusCode, 200, 'should stop run');
  t.equal(stopResponse.json().run.status, 'stopping', 'should return stop status');

  await api.shutdown();
});

test('AdminWebSocketAPI - delete test run endpoint', async (t) => {
  const api = new AdminWebSocketAPI({
    nodeId: 'test-node',
    testRunService: createMockTestRunService({
      deleteRun: async (runId) => ({
        runId,
        deleted: true,
        removed: {metadata: true, report: true},
      }),
    }),
  });

  await api.initialize(0, {listen: false});

  const response = await api.getFastify().inject({
    method: 'DELETE',
    url: '/api/admin/test-runs/run-to-delete',
  });
  const payload = response.json();
  t.equal(response.statusCode, 200, 'should delete run');
  t.equal(payload.deleted, true, 'should return deleted flag');
  t.equal(payload.runId, 'run-to-delete', 'should return deleted run id');

  await api.shutdown();
});

test('AdminWebSocketAPI - output asset endpoint', async (t) => {
  const api = new AdminWebSocketAPI({
    nodeId: 'test-node',
    testRunService: createMockTestRunService({
      readOutputAsset: async (_path) => ({
        contentType: 'application/json; charset=utf-8',
        body: Buffer.from('{"ok":true}', 'utf8'),
      }),
    }),
  });

  await api.initialize(0, {listen: false});

  const response = await api.getFastify().inject({
    method: 'GET',
    url: '/ui/test-output/alpha/report.json',
  });
  t.equal(response.statusCode, 200, 'should return output file');
  t.equal(response.headers['content-type'], 'application/json; charset=utf-8');
  t.same(response.json(), {ok: true}, 'should return requested payload');

  await api.shutdown();
});

test('AdminWebSocketAPI - stream endpoint returns 404 for unknown run', async (t) => {
  const api = new AdminWebSocketAPI({
    nodeId: 'test-node',
    testRunService: createMockTestRunService({
      getRun: async (_runId) => null,
    }),
  });

  await api.initialize(0, {listen: false});
  const response = await api.getFastify().inject({
    method: 'GET',
    url: '/api/admin/test-runs/missing/stream',
  });
  t.equal(response.statusCode, 404, 'should return not found');
  t.equal(response.json().error, 'Test run not found');

  await api.shutdown();
});

test('AdminWebSocketAPI - stream endpoint serves archived run backlog', async (t) => {
  const archivedRun = {
    runId: 'archive-run',
    scenario: 'alpha',
    status: 'passed',
    logs: [{
      timestamp: '2026-02-14T12:00:00.000Z',
      stream: 'archive',
      line: 'archived line',
    }],
  };
  const api = new AdminWebSocketAPI({
    nodeId: 'test-node',
    testRunService: createMockTestRunService({
      getRun: async (_runId) => archivedRun,
      subscribeToRun: (_runId, _listener) => null,
    }),
  });

  await api.initialize(0, {listen: false});
  const response = await api.getFastify().inject({
    method: 'GET',
    url: '/api/admin/test-runs/archive-run/stream',
  });

  t.equal(response.statusCode, 200, 'should return stream response for archived run');
  t.match(response.body, /"type":"status"/, 'should include status frame');
  t.match(response.body, /"type":"log"/, 'should include archived log frame');
  t.match(response.body, /archived line/, 'should include archived log content');

  await api.shutdown();
});

test('AdminWebSocketAPI - debug routes require security headers', async (t) => {
  const api = new AdminWebSocketAPI({
    nodeId: 'test-node',
    debugMetadataStore: createMockDebugMetadataStore(),
  });

  await api.initialize(0, {listen: false});
  const response = await api.getFastify().inject({
    method: 'POST',
    url: '/api/admin/debug/sessions',
    payload: {sessionId: 'session-1', serviceName: 'svc-debug'},
  });

  t.equal(response.statusCode, 401, 'should reject missing security context');
  t.match(response.json().error, /requires tenant and principal headers/);

  await api.shutdown();
});

test('AdminWebSocketAPI - debug session create/get/attach routes', async (t) => {
  const calls = [];
  const api = new AdminWebSocketAPI({
    nodeId: 'test-node',
    debugMetadataStore: createMockDebugMetadataStore({
      createSession: async (request) => {
        calls.push({method: 'createSession', request});
        return {
          sessionId: request.sessionId,
          tenantId: request.securityContext.tenantId,
          serviceName: request.serviceName,
          status: 'active',
          createdAt: Date.now(),
          updatedAt: Date.now(),
        };
      },
      getSession: async (request) => {
        calls.push({method: 'getSession', request});
        return {
          sessionId: request.sessionId,
          tenantId: request.securityContext.tenantId,
          serviceName: 'svc-debug',
          status: 'active',
          createdAt: Date.now(),
          updatedAt: Date.now(),
        };
      },
      attachSession: async (request) => {
        calls.push({method: 'attachSession', request});
        return {
          sessionId: request.sessionId,
          tenantId: request.securityContext.tenantId,
          serviceName: 'svc-debug',
          status: 'active',
          createdAt: Date.now(),
          updatedAt: Date.now(),
        };
      },
    }),
  });

  await api.initialize(0, {listen: false});
  const headers = {
    'x-tenant-id': 'tenant-a',
    'x-principal': 'debug-user',
    'x-roles': 'debug_write,debug_read,debug_attach',
  };

  const createResponse = await api.getFastify().inject({
    method: 'POST',
    url: '/api/admin/debug/sessions',
    headers,
    payload: {
      sessionId: 'session-2',
      serviceName: 'svc-debug',
      lineageId: 'lineage-2',
      endpoint: 'ws://node-a/debug',
    },
  });
  t.equal(createResponse.statusCode, 200, 'should create debug session');
  t.equal(createResponse.json().session.sessionId, 'session-2');

  const getResponse = await api.getFastify().inject({
    method: 'GET',
    url: '/api/admin/debug/sessions/session-2',
    headers,
  });
  t.equal(getResponse.statusCode, 200, 'should fetch debug session');
  t.equal(getResponse.json().session.tenantId, 'tenant-a');

  const attachResponse = await api.getFastify().inject({
    method: 'POST',
    url: '/api/admin/debug/sessions/session-2/attach',
    headers,
  });
  t.equal(attachResponse.statusCode, 200, 'should attach debug session');
  t.equal(attachResponse.json().session.sessionId, 'session-2');

  t.equal(calls.length, 3, 'should route to metadata store methods');
  t.equal(calls[0].request.securityContext.tenantId, 'tenant-a');

  await api.shutdown();
});

test('AdminWebSocketAPI - debug session update/detach routes', async (t) => {
  const calls = [];
  const api = new AdminWebSocketAPI({
    nodeId: 'test-node',
    debugMetadataStore: createMockDebugMetadataStore({
      updateSession: async (request) => {
        calls.push({method: 'updateSession', request});
        return {
          sessionId: request.sessionId,
          tenantId: request.securityContext.tenantId,
          serviceName: request.serviceName || 'svc-debug',
          lineageId: request.lineageId || null,
          stageId: request.stageId || null,
          endpoint: request.endpoint || null,
          nodeId: request.nodeId || null,
          status: request.status || 'active',
          createdAt: Date.now(),
          updatedAt: Date.now(),
        };
      },
      detachSession: async (request) => {
        calls.push({method: 'detachSession', request});
        return {
          sessionId: request.sessionId,
          tenantId: request.securityContext.tenantId,
          serviceName: 'svc-debug',
          lineageId: null,
          stageId: null,
          endpoint: null,
          nodeId: null,
          status: 'detached',
          createdAt: Date.now(),
          updatedAt: Date.now(),
        };
      },
    }),
  });

  await api.initialize(0, {listen: false});
  const headers = {
    'x-tenant-id': 'tenant-a',
    'x-principal': 'debug-user',
    'x-roles': 'debug_write,debug_read,debug_attach',
  };

  const updateResponse = await api.getFastify().inject({
    method: 'PATCH',
    url: '/api/admin/debug/sessions/session-2',
    headers,
    payload: {
      endpoint: 'ws://node-b/debug',
      nodeId: 'node-b',
      lineageId: 'lineage-2',
      stageId: 2,
    },
  });
  t.equal(updateResponse.statusCode, 200, 'should update debug session');
  t.equal(updateResponse.json().session.endpoint, 'ws://node-b/debug');
  t.equal(updateResponse.json().session.nodeId, 'node-b');

  const detachResponse = await api.getFastify().inject({
    method: 'PATCH',
    url: '/api/admin/debug/sessions/session-2',
    headers,
    payload: {
      detach: true,
    },
  });
  t.equal(detachResponse.statusCode, 200, 'should detach debug session');
  t.equal(detachResponse.json().session.status, 'detached');
  t.equal(detachResponse.json().session.endpoint, null);

  t.equal(calls.length, 2, 'should route to update/detach metadata methods');
  t.equal(calls[0].method, 'updateSession');
  t.equal(calls[1].method, 'detachSession');

  await api.shutdown();
});

test('AdminWebSocketAPI - debug breakpoints/snapshots and DAP routes', async (t) => {
  const calls = [];
  const api = new AdminWebSocketAPI({
    nodeId: 'test-node',
    debugMetadataStore: createMockDebugMetadataStore({
      writeBreakpoints: async (request) => {
        calls.push({method: 'writeBreakpoints', request});
        return [{breakpointId: 'bp-1', lineNumber: 10, resolved: true}];
      },
      listBreakpoints: async (request) => {
        calls.push({method: 'listBreakpoints', request});
        return [{breakpointId: 'bp-1', lineNumber: 10, resolved: true}];
      },
      writeSnapshot: async (request) => {
        calls.push({method: 'writeSnapshot', request});
        return {
          snapshotId: 'snapshot-1',
          sessionId: request.sessionId,
          frameCount: 2,
          hostCallCount: 1,
          envelope: Buffer.from([1, 2, 3]),
        };
      },
      getSnapshot: async (request) => {
        calls.push({method: 'getSnapshot', request});
        return {
          snapshotId: request.snapshotId,
          sessionId: request.sessionId || 'session-3',
          frameCount: 2,
          hostCallCount: 1,
          envelope: Buffer.from([1, 2, 3]),
        };
      },
      listSnapshots: async (request) => {
        calls.push({method: 'listSnapshots', request});
        return [{
          snapshotId: 'snapshot-1',
          sessionId: request.sessionId,
          frameCount: 2,
          hostCallCount: 1,
        }];
      },
    }),
    debugDapRouter: {
      async handleRequest(request) {
        calls.push({method: 'dap', request});
        return {ok: true, sessionId: request.sessionId};
      },
    },
  });

  await api.initialize(0, {listen: false});
  const headers = {
    'x-tenant-id': 'tenant-a',
    'x-principal': 'debug-user',
    'x-roles': 'debug_write,debug_read,debug_attach',
  };

  const writeBreakpoints = await api.getFastify().inject({
    method: 'POST',
    url: '/api/admin/debug/sessions/session-3/breakpoints',
    headers,
    payload: {
      moduleRef: 'svc:debug@1.0.0',
      sourceFileUrl: 'file:///src/service.ts',
      breakpoints: [{lineNumber: 10}],
    },
  });
  t.equal(writeBreakpoints.statusCode, 200, 'should write breakpoints');
  t.equal(writeBreakpoints.json().breakpoints.length, 1);

  const listBreakpoints = await api.getFastify().inject({
    method: 'GET',
    url: '/api/admin/debug/sessions/session-3/breakpoints',
    headers,
  });
  t.equal(listBreakpoints.statusCode, 200, 'should list breakpoints');
  t.equal(listBreakpoints.json().breakpoints[0].breakpointId, 'bp-1');

  const writeSnapshot = await api.getFastify().inject({
    method: 'POST',
    url: '/api/admin/debug/sessions/session-3/snapshots',
    headers,
    payload: {
      snapshotArtifact: {
        manifest: {
          snapshotId: 'snapshot-1',
          moduleRef: 'svc:debug@1.0.0',
          moduleDigest: 'sha256:' + 'b'.repeat(64),
        },
        snapshot: {
          moduleRef: 'svc:debug@1.0.0',
          moduleDigest: 'sha256:' + 'b'.repeat(64),
        },
        envelope: [1, 2, 3],
      },
    },
  });
  t.equal(writeSnapshot.statusCode, 200, 'should write snapshot metadata');
  t.equal(writeSnapshot.json().snapshot.envelopeBase64, 'AQID');

  const listSnapshots = await api.getFastify().inject({
    method: 'GET',
    url: '/api/admin/debug/sessions/session-3/snapshots',
    headers,
  });
  t.equal(listSnapshots.statusCode, 200, 'should list snapshots');
  t.equal(listSnapshots.json().snapshots.length, 1);

  const getSnapshot = await api.getFastify().inject({
    method: 'GET',
    url: '/api/admin/debug/snapshots/snapshot-1?sessionId=session-3',
    headers,
  });
  t.equal(getSnapshot.statusCode, 200, 'should fetch snapshot by id');
  t.equal(getSnapshot.json().snapshot.envelopeBase64, 'AQID');

  const dapResponse = await api.getFastify().inject({
    method: 'POST',
    url: '/api/admin/debug/dap/request',
    headers,
    payload: {
      sessionId: 'session-3',
      request: {seq: 1, command: 'threads'},
    },
  });
  t.equal(dapResponse.statusCode, 200, 'should route DAP request');
  t.equal(dapResponse.json().response.ok, true);
  t.equal(calls.some((entry) => entry.method === 'dap'), true);

  await api.shutdown();
});

test('AdminWebSocketAPI - debug trace stream route wiring and filtering', async (t) => {
  const traceCollector = new TraceCollector();
  const api = new AdminWebSocketAPI({
    nodeId: 'test-node',
    traceCollector,
  });

  await api.initialize(0, {listen: false});
  const routes = api.getFastify().printRoutes();
  t.match(routes, /trace \(GET, HEAD\)/,
    'should register debug trace websocket route');

  const {clientSocket, serverSocket} = createInProcWebSocketPair();
  api.debugHandlers.handleDebugTraceConnection(serverSocket, {
    query: {lineagePrefix: 'lineage-allow'},
  });

  traceCollector.emit({
    level: 'info',
    message: 'allowed',
    lineageId: 'lineage-allow-1',
    source: 'service',
  });
  traceCollector.emit({
    level: 'info',
    message: 'blocked',
    lineageId: 'lineage-deny-1',
    source: 'service',
  });

  const first = await waitForMessage(clientSocket);
  t.equal(first.message, 'allowed', 'should receive matching lineage event');
  await waitForNoMessage(clientSocket, 80);

  t.equal(traceCollector.getSubscriberCount(), 1);
  clientSocket.close();
  await new Promise((resolve) => setTimeout(resolve, 20));
  t.equal(traceCollector.getSubscriberCount(), 0,
    'should cleanup subscription on disconnect');

  await api.shutdown();
});

// ============================================================================
// Live Query Wiring Tests
// ============================================================================

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

test('AdminWebSocketAPI - local system-table observation query routes through ' +
  'authoritative read when shared metadata node coverage is inconsistent',
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
            'authoritative path should execute the nodes query',
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

    t.equal(result.success, true, 'authoritative nodes query should succeed');
    t.same(
      result.rows.map((row) => row.node_id || row.id).sort(),
      ['node-1', 'node-2'],
      'authoritative path should surface all referenced nodes',
    );
    t.equal(
      executeRequestCalls,
      1,
      'coverage-gap observation query should bypass the incomplete local cache',
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
