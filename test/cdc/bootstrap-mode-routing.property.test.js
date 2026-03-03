/**
 * Property Test: Bootstrap mode routing enforcement
 * Feature: system-architecture-consolidation,
 *   Property 6: Bootstrap mode routing enforcement
 *
 * **Validates: Requirements 3.5**
 *
 * *For any* write operation attempted when CDCIntegrationService
 * bootstrap mode is disabled, the write shall be routed through
 * the SQL engine and shall not execute directly on local partitions.
 */

import {test, beforeEach, afterEach} from '../../src/test-helpers/tap.js';
import fc from 'fast-check';
import {
  CDCIntegrationService,
} from '../../src/cdc/cdc-integration-service.js';
import {
  SYSTEM_TABLE_NAME,
} from '../../src/bootstrap/system-table-schemas-constants.js';
import {
  getSystemCachePrimaryKeyFieldOrFallback,
} from '../../src/cache/system-cache-key-descriptor.js';
import {ConfigurationManager} from '../../src/config/configuration-manager.js';
import {LoggingService} from '../../src/logging/logging-service.js';

/**
 * System table names that support write operations.
 * @type {string[]}
 */
const WRITABLE_TABLES = Object.values(SYSTEM_TABLE_NAME);

/**
 * Write operation types exercised by the property tests.
 * Each maps to a CDCIntegrationService method.
 * @type {string[]}
 */
const WRITE_OPERATIONS = ['insert', 'update', 'delete', 'upsert'];

/**
 * Create a mock SQL query engine that tracks all queries routed
 * through it. Returns success for table existence checks and writes.
 * @return {Object} Mock SQL query engine with executedQueries array.
 */
function createTrackingSqlEngine() {
  const executedQueries = [];
  return {
    executedQueries,
    async executeQuery(sql, params = []) {
      executedQueries.push({sql, params});
      if (sql.includes('sqlite_master')) {
        return {success: true, rows: [{name: params[0]}]};
      }
      return {success: true, affectedRows: 1};
    },
  };
}

/**
 * Create a mock partition service that tracks direct writes.
 * @param {string} partitionId - Partition identifier.
 * @param {string} tableName - Table this partition serves.
 * @return {Object} Mock partition service with directWrites array.
 */
function createMockPartitionService(partitionId, tableName) {
  const directWrites = [];
  return {
    partitionId,
    tableName,
    isLeader: true,
    directWrites,
    async executeLocalQuery(sql, params = []) {
      directWrites.push({sql, params});
      if (sql.includes('sqlite_master')) {
        return {success: true, rows: [{name: tableName}]};
      }
      return {success: true, affectedRows: 1};
    },
  };
}

/**
 * Build a partition services Map for bootstrap mode.
 * Creates one mock partition service per system table.
 * @return {Object} {partitionMap, partitionServices} where
 *   partitionServices is keyed by table name.
 */
function buildPartitionServicesMap() {
  const partitionMap = new Map();
  const partitionServices = {};
  for (const tableName of WRITABLE_TABLES) {
    const partitionId = `${tableName}-p1`;
    const service = createMockPartitionService(
      partitionId, tableName,
    );
    partitionMap.set(partitionId, service);
    partitionServices[tableName] = service;
  }
  return {partitionMap, partitionServices};
}

/**
 * Get a valid update column and value for a given system table.
 * Each table has different columns, so we pick one that exists.
 * @param {string} tableName - System table name.
 * @return {Object} A single-key object with a valid column and value.
 */
function getValidUpdateData(tableName) {
  // Use columns that actually exist on each table
  switch (tableName) {
  case SYSTEM_TABLE_NAME.NODES:
    return {status: 'active'};
  case SYSTEM_TABLE_NAME.LIVE_QUERIES:
    return {last_activity_at: Date.now()};
  case SYSTEM_TABLE_NAME.INDICES:
    return {created_at: Date.now()};
  case SYSTEM_TABLE_NAME.LOGS:
    return {created_at: Date.now()};
  case SYSTEM_TABLE_NAME.MODULE_MANIFESTS:
    return {digest: 'sha256:updated'};
  case SYSTEM_TABLE_NAME.PACKAGE_REGISTRY_OVERRIDES:
    return {registry_url: 'https://updated.example.com'};
  case SYSTEM_TABLE_NAME.MODULE_DEPENDENCY_LOCKS:
    return {target_service_id: 'svc-updated'};
  case SYSTEM_TABLE_NAME.DEBUG_SESSIONS:
    return {status: 'active'};
  case SYSTEM_TABLE_NAME.DEBUG_BREAKPOINTS:
    return {resolved: 1};
  case SYSTEM_TABLE_NAME.DEBUG_SNAPSHOTS:
    return {host_call_count: 2};
  default:
    return {updated_at: Date.now()};
  }
}

/**
 * Execute a write operation on the CDCIntegrationService.
 * @param {CDCIntegrationService} cdc - The service instance.
 * @param {string} operation - One of WRITE_OPERATIONS.
 * @param {string} tableName - Target system table.
 * @param {string} primaryKey - Primary key value for the row.
 * @return {Promise<Object>} Write result.
 */
async function executeWrite(cdc, operation, tableName, primaryKey) {
  const pkField = getSystemCachePrimaryKeyFieldOrFallback(tableName);
  const data = {[pkField]: primaryKey};

  if (tableName === SYSTEM_TABLE_NAME.NODES) {
    data.node_address = 'ws://localhost:8080';
    data.status = 'active';
  } else if (tableName === SYSTEM_TABLE_NAME.SERVICE_DEFINITIONS) {
    data.service_name = `svc-${primaryKey.slice(0, 8)}`;
    data.handler_function_id = 'handler-1';
  } else if (tableName === SYSTEM_TABLE_NAME.SERVICE_ENDPOINTS) {
    data.service_id = 'svc-1';
    data.node_id = 'node-1';
    data.protocol = 'websocket';
    data.address = 'ws://localhost:9090';
    data.port = 9090;
  } else if (tableName === SYSTEM_TABLE_NAME.SERVICE_TIMERS) {
    data.service_id = 'svc-1';
    data.delay_ms = 1000;
    data.fire_at = Date.now() + 1000;
  } else if (tableName === SYSTEM_TABLE_NAME.MODULE_MANIFESTS) {
    data.namespace = `ns-${primaryKey.slice(0, 8)}`;
    data.name = `mod-${primaryKey.slice(0, 8)}`;
    data.version = '1.0.0';
    data.digest = `sha256:${primaryKey.replace(/-/g, '')}`;
    data.run_export = 'run';
  } else if (tableName === SYSTEM_TABLE_NAME.PACKAGE_REGISTRY_MAPPINGS) {
    data.namespace = `ns-${primaryKey.slice(0, 8)}`;
    data.registry_url = 'https://registry.example.com';
  } else if (tableName === SYSTEM_TABLE_NAME.PACKAGE_REGISTRY_OVERRIDES) {
    data.namespace = `ns-${primaryKey.slice(0, 8)}`;
    data.name = `pkg-${primaryKey.slice(0, 8)}`;
    data.registry_url = 'https://override.example.com';
  } else if (tableName === SYSTEM_TABLE_NAME.MODULE_DEPENDENCY_LOCKS) {
    data.lock_id = primaryKey;
    data.target_module_namespace = 'ns';
    data.target_module_name = 'mod';
    data.target_module_version = '1.0.0';
  } else if (tableName === SYSTEM_TABLE_NAME.WASM_OPERATIONS) {
    data.operation_id = primaryKey;
    data.tenant_id = 'tenant-1';
    data.command = 'publishModule';
  } else if (tableName === SYSTEM_TABLE_NAME.DEBUG_SESSIONS) {
    data.session_id = primaryKey;
    data.tenant_id = 'tenant-1';
    data.service_name = 'svc-debug';
    data.status = 'active';
    data.created_at = Date.now();
    data.updated_at = Date.now();
  } else if (tableName === SYSTEM_TABLE_NAME.DEBUG_BREAKPOINTS) {
    data.breakpoint_id = primaryKey;
    data.session_id = 'session-1';
    data.tenant_id = 'tenant-1';
    data.module_ref = 'svc:debug-module@1.0.0';
    data.source_file_url = 'file:///src/service.ts';
    data.line_number = 10;
    data.column_number = 0;
    data.resolved = 1;
    data.created_at = Date.now();
    data.updated_at = Date.now();
  } else if (tableName === SYSTEM_TABLE_NAME.DEBUG_SNAPSHOTS) {
    data.snapshot_id = primaryKey;
    data.session_id = 'session-1';
    data.tenant_id = 'tenant-1';
    data.module_ref = 'svc:debug-module@1.0.0';
    data.module_digest = 'sha256:' + primaryKey.replace(/-/g, '');
    data.captured_at = Date.now();
    data.format_version = 1;
    data.snapshot_bytes_base64 = 'AQID';
    data.manifest_json = '{}';
    data.total_bytes = 3;
    data.frame_count = 1;
    data.host_call_count = 1;
    data.created_at = Date.now();
    data.updated_at = Date.now();
  }

  switch (operation) {
  case 'insert':
    return cdc.insertSystemTableRow(tableName, data);
  case 'update':
    return cdc.updateSystemTableRow(
      tableName,
      {[pkField]: primaryKey},
      getValidUpdateData(tableName),
    );
  case 'delete':
    return cdc.deleteSystemTableRow(
      tableName, {[pkField]: primaryKey},
    );
  case 'upsert':
    return cdc.upsertSystemTableRow(tableName, data);
  default:
    throw new Error(`Unknown operation: ${operation}`);
  }
}

beforeEach(() => {
  ConfigurationManager.resetInstance();
  LoggingService.resetInstance();
  const config = ConfigurationManager.getInstance();
  config.initialize({node: {id: 'property-test-node'}});
  const logger = LoggingService.getInstance();
  logger.initialize({level: 'error'});
});

afterEach(() => {
  ConfigurationManager.resetInstance();
  LoggingService.resetInstance();
});

test('Property 6: Bootstrap mode routing enforcement',
  async (t) => {
    /**
     * Property: For any write operation and any system table,
     * when bootstrap mode is disabled (default), the write is
     * routed through the SQL engine and no direct partition
     * writes occur.
     */
    t.test(
      'writes route through SQL engine when bootstrap disabled',
      async (t) => {
        await fc.assert(
          fc.asyncProperty(
            fc.constantFrom(...WRITABLE_TABLES),
            fc.constantFrom(...WRITE_OPERATIONS),
            fc.uuid(),
            async (tableName, operation, primaryKey) => {
              const sqlEngine = createTrackingSqlEngine();
              const {partitionMap: _partitionMap, partitionServices} =
                buildPartitionServicesMap();

              const cdc = new CDCIntegrationService({
                nodeId: 'prop-test',
                sqlQueryEngine: sqlEngine,
              });
              cdc.initialize();

              // Bootstrap mode is disabled by default
              await executeWrite(
                cdc, operation, tableName, primaryKey,
              );

              // SQL engine must have received queries
              const sqlUsed =
                sqlEngine.executedQueries.length > 0;

              // No partition service should have direct writes
              const noDirectWrites = Object.values(
                partitionServices,
              ).every((svc) => svc.directWrites.length === 0);

              return sqlUsed && noDirectWrites;
            },
          ),
          {numRuns: 10},
        );

        t.pass(
          'all writes route through SQL engine when ' +
          'bootstrap mode is disabled',
        );
      },
    );

    /**
     * Property: For any write operation and any system table,
     * when bootstrap mode is enabled, the write goes directly
     * to local partitions and does NOT route through SQL engine.
     */
    t.test(
      'writes go to local partitions when bootstrap enabled',
      async (t) => {
        await fc.assert(
          fc.asyncProperty(
            fc.constantFrom(...WRITABLE_TABLES),
            fc.constantFrom(...WRITE_OPERATIONS)
              .filter((op) => op !== 'update' && op !== 'delete'),
            fc.uuid(),
            async (tableName, operation, primaryKey) => {
              const sqlEngine = createTrackingSqlEngine();
              const {partitionMap: pMap, partitionServices} =
                buildPartitionServicesMap();

              const cdc = new CDCIntegrationService({
                nodeId: 'prop-test',
                sqlQueryEngine: sqlEngine,
              });
              cdc.initialize();

              // Enable bootstrap mode
              cdc.setBootstrapMode(true, pMap);

              await executeWrite(
                cdc, operation, tableName, primaryKey,
              );

              // SQL engine must NOT have been used
              const sqlNotUsed =
                sqlEngine.executedQueries.length === 0;

              // The target partition must have direct writes
              const targetSvc = partitionServices[tableName];
              const hasDirectWrites =
                targetSvc.directWrites.length > 0;

              return sqlNotUsed && hasDirectWrites;
            },
          ),
          {numRuns: 10},
        );

        t.pass(
          'all writes go directly to local partitions ' +
          'when bootstrap mode is enabled',
        );
      },
    );

    /**
     * Property: For any write operation, after clearBootstrapMode()
     * is called, writes are routed through the SQL engine again
     * and executeSQLDirectToLocalPartition throws.
     */
    t.test(
      'writes route through SQL after clearBootstrapMode',
      async (t) => {
        await fc.assert(
          fc.asyncProperty(
            fc.constantFrom(...WRITABLE_TABLES),
            fc.constantFrom(...WRITE_OPERATIONS),
            fc.uuid(),
            async (tableName, operation, primaryKey) => {
              const sqlEngine = createTrackingSqlEngine();
              const {partitionMap, partitionServices} =
                buildPartitionServicesMap();

              const cdc = new CDCIntegrationService({
                nodeId: 'prop-test',
                sqlQueryEngine: sqlEngine,
              });
              cdc.initialize();

              // Enable then disable bootstrap mode
              cdc.setBootstrapMode(true, partitionMap);
              cdc.clearBootstrapMode();

              await executeWrite(
                cdc, operation, tableName, primaryKey,
              );

              // SQL engine must have received queries
              const sqlUsed =
                sqlEngine.executedQueries.length > 0;

              // No partition service should have direct writes
              const noDirectWrites = Object.values(
                partitionServices,
              ).every((svc) => svc.directWrites.length === 0);

              return sqlUsed && noDirectWrites;
            },
          ),
          {numRuns: 10},
        );

        t.pass(
          'writes route through SQL engine after ' +
          'clearBootstrapMode is called',
        );
      },
    );

    /**
     * Property: For any SQL string, calling
     * executeSQLDirectToLocalPartition when bootstrap mode is
     * disabled throws an error indicating bootstrap mode is
     * required.
     */
    t.test(
      'direct partition write throws when bootstrap disabled',
      async (t) => {
        await fc.assert(
          fc.asyncProperty(
            fc.constantFrom(...WRITABLE_TABLES),
            async (tableName) => {
              const cdc = new CDCIntegrationService({
                nodeId: 'prop-test',
              });
              cdc.initialize();

              const sql =
                `INSERT INTO ${tableName} (id) VALUES (?)`;

              let threw = false;
              let correctMessage = false;
              try {
                await cdc.executeSQLDirectToLocalPartition(
                  sql, ['test-id'],
                );
              } catch (err) {
                threw = true;
                correctMessage = err.message.includes(
                  'bootstrap mode',
                );
              }

              return threw && correctMessage;
            },
          ),
          {numRuns: 10},
        );

        t.pass(
          'executeSQLDirectToLocalPartition throws when ' +
          'bootstrap mode is disabled',
        );
      },
    );
  });
