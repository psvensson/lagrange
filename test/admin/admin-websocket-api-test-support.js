/**
 * Shared test support for Admin WebSocket API test suites.
 *
 * Extracted from the original admin-websocket-api.test.js monolith so the
 * parent suite and the re-enabled concern suites share one canonical copy of
 * these fixtures/helpers (bodies unchanged).
 */

import {SystemTableCache} from '../../src/cache/system-table-cache.js';
import {getSystemCachePrimaryKeyField} from
  '../../src/cache/system-cache-key-descriptor.js';
import {createInProcWebSocketPair} from '../../src/test-helpers/inproc-ws.js';
import {TABLES} from '../../src/constants/index.js';

export const AUTHORITATIVE_REPAIR_TABLES = Object.freeze([
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
export function createMockQueryEngine() {
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
export function createSystemTableRepairQueryEngine(rowsByTable = {}) {
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
export function getAuthoritativeRepairReadTables(statements = []) {
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
export function createAuthoritativeCacheGateway(writableCache, options = {}) {
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
        rowSetComplete: true,
        authoritativeObservation: {
          scope: 'complete_table',
          tableName,
          observedAtMs: Date.now(),
          causeId: readOptions?.sessionId ||
            `test-authoritative-read:${tableName}`,
          rowSetComplete: true,
        },
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
        authoritativeObservedAtMs:
          options?.authoritativeObservation?.observedAtMs || null,
      };
    },
  };
}

/**
 * Create a realistic system-table cache for authoritative discovery repair.
 * @param {string} [nodeId='test-node']
 * @return {SystemTableCache}
 */
export function createAuthoritativeRepairCache(nodeId = 'test-node') {
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
export function createAuthoritativeRepairPartitionServices(
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
export function createPopulatedCache() {
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
export function seedServiceDiscoveryRows(cache) {
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
export function seedRoutedTableDiscoveryRows(cache) {
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
export function seedTableDiscoveryRowsWithLocalLearner(cache) {
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
export function seedTableDiscoveryRowsWithLocalCandidate(cache) {
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
export function seedTableDiscoveryRowsWithLocalFollower(cache) {
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
 * Stage split-child partition metadata for benchmark_events without
 * advancing the table's active serving partition version.
 *
 * @param {SystemTableCache} cache
 * @param {Object} [options={}]
 * @param {number} [options.activePartitionVersion=1]
 * @param {number} [options.partitionCount=1]
 * @return {Object}
 */
export function stageFutureBenchmarkSplitChildren(
  cache, options = {},
) {
  const tableId = 'table-benchmark-events';
  const sourcePartitionId = 'partition-benchmark-events-1';
  const leftPartitionId = 'partition-benchmark-events-left';
  const rightPartitionId = 'partition-benchmark-events-right';
  const activePartitionVersion = Number.isInteger(
    options.activePartitionVersion,
  ) ?
    options.activePartitionVersion :
    1;
  const partitionCount = Number.isInteger(options.partitionCount) ?
    options.partitionCount :
    1;

  cache.applySystemTableChange(TABLES.TABLES, 'UPDATE', {
    id: tableId,
    table_id: tableId,
    name: 'benchmark_events',
    table_name: 'benchmark_events',
    active_partition_version: activePartitionVersion,
    partition_count: partitionCount,
    partition_transition_state: 'split_backfilling',
    partition_transition_metadata: JSON.stringify({
      workflowId: 'split-table-benchmark-events-v2',
      sourcePartitionId,
      targetPartitionVersion: 2,
      targetPartitionIds: [leftPartitionId, rightPartitionId],
    }),
  });
  cache.applySystemTableChange(TABLES.PARTITIONS, 'UPDATE', {
    id: sourcePartitionId,
    partition_id: sourcePartitionId,
    table_id: tableId,
    table_name: 'benchmark_events',
    partition_version: 1,
    state: 'NORMAL',
    leader_node_id: 'node-1',
  });
  cache.applySystemTableChange(TABLES.PARTITIONS, 'INSERT', {
    id: leftPartitionId,
    partition_id: leftPartitionId,
    table_id: tableId,
    table_name: 'benchmark_events',
    partition_version: 2,
    state: 'NORMAL',
    leader_node_id: null,
  });
  cache.applySystemTableChange(TABLES.PARTITIONS, 'INSERT', {
    id: rightPartitionId,
    partition_id: rightPartitionId,
    table_id: tableId,
    table_name: 'benchmark_events',
    partition_version: 2,
    state: 'NORMAL',
    leader_node_id: null,
  });

  return {
    sourcePartitionId,
    leftPartitionId,
    rightPartitionId,
  };
}

/**
 * Seed table-scoped discovery rows without a local TABLES row.
 * This verifies applied schema watermark fallback from partition metadata.
 *
 * @param {SystemTableCache} cache
 * @param {number} updatedAt
 */
export function seedPartitionScopedDiscoveryRowsWithoutTableRecord(cache, updatedAt) {
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
export function seedPartitionScopedDiscoveryRowsWithoutTableName(cache, updatedAt) {
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
export async function connectAndReceive(api, timeout = 2000, request = null) {
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
export function waitForMessage(ws, timeout = 2000) {
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
export function waitForNoMessage(ws, timeout = 50) {
  return new Promise((resolve, reject) => {
    let timer = null;
    const onMessage = () => {
      clearTimeout(timer);
      reject(new Error('Unexpected message received'));
    };
    timer = setTimeout(() => {
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
export function createMockTestRunService(overrides = {}) {
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
export function createMockDebugMetadataStore(overrides = {}) {
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

export const BACKGROUND_REPAIR_SETTLE_TURNS = 8;
export const BACKGROUND_REPAIR_SETTLE_DELAY_MS = 0;

/**
 * Await several event-loop turns so deferred background repair work settles.
 * @param {number} [turnCount=BACKGROUND_REPAIR_SETTLE_TURNS]
 * @return {Promise<void>}
 */
export async function waitForBackgroundRepairToSettle(
  turnCount = BACKGROUND_REPAIR_SETTLE_TURNS,
) {
  for (let index = 0; index < turnCount; index += 1) {
    await new Promise((resolve) => {
      setTimeout(resolve, BACKGROUND_REPAIR_SETTLE_DELAY_MS);
    });
  }
}
