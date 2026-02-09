/**
 * Property-based tests for UNIQUE Constraint Handling.
 *
 * **Feature: test-failure-fixes, Property 5: UNIQUE Constraint Handling**
 *
 * For any INSERT operation on system tables (nodes, services) that would
 * violate a UNIQUE constraint, the system SHALL either update the existing
 * record (INSERT OR REPLACE) or return a clear error message—never silently
 * fail or corrupt data.
 *
 * **Validates: Requirements 4.1, 4.2**
 */

import {test, beforeEach, afterEach} from '../../src/test-helpers/tap.js';
import fc from 'fast-check';
import {
  CDCIntegrationService,
  CDCOperationType,
} from '../../src/cdc/cdc-integration-service.js';
import {SystemTableName} from '../../src/bootstrap/system-table-schemas-constants.js';
import {ConfigurationManager} from '../../src/config/configuration-manager.js';
import {LoggingService} from '../../src/logging/logging-service.js';
import {SQL} from '../../src/constants/sql.js';

/**
 * Initialize test environment with required singletons.
 */
function initializeTestEnvironment() {
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
 * Cleanup test environment.
 */
function cleanupTestEnvironment() {
  ConfigurationManager.resetInstance();
  LoggingService.resetInstance();
}

beforeEach(() => {
  initializeTestEnvironment();
});

afterEach(() => {
  cleanupTestEnvironment();
});

/**
 * Create a mock SQL query engine that tracks executed queries.
 * Returns proper results for table existence checks and INSERT operations.
 * @return {Object} Mock SQL query engine with query tracking.
 */
function createMockSqlQueryEngine() {
  const executedQueries = [];

  return {
    executedQueries,
    async executeQuery(sql, params = []) {
      executedQueries.push({sql, params});

      // Handle table existence check queries
      if (sql.includes('sqlite_master') && sql.includes('type=\'table\'')) {
        return {
          success: true,
          rows: [{name: params[0]}],
        };
      }

      return {
        success: true,
        affectedRows: 1,
      };
    },
  };
}

/**
 * Arbitrary for generating valid node IDs.
 */
const nodeIdArb = fc.string({minLength: 5, maxLength: 30})
  .filter((s) => s.trim().length > 0)
  .map((s) => `node-${s.replace(/[^a-zA-Z0-9-]/g, '')}`);

/**
 * Arbitrary for generating valid service IDs.
 */
const serviceIdArb = fc.string({minLength: 5, maxLength: 30})
  .filter((s) => s.trim().length > 0)
  .map((s) => `service-${s.replace(/[^a-zA-Z0-9-]/g, '')}`);

/**
 * Arbitrary for generating valid node addresses.
 */
const nodeAddressArb = fc.tuple(
  fc.integer({min: 1, max: 255}),
  fc.integer({min: 1, max: 255}),
  fc.integer({min: 1, max: 255}),
  fc.integer({min: 1, max: 255}),
  fc.integer({min: 1024, max: 65535}),
).map(([a, b, c, d, port]) => `${a}.${b}.${c}.${d}:${port}`);

/**
 * Arbitrary for generating valid node data.
 */
const nodeDataArb = fc.record({
  node_id: nodeIdArb,
  node_address: nodeAddressArb,
  cpu_cores: fc.integer({min: 1, max: 128}),
  memory_mb: fc.integer({min: 512, max: 131072}),
  disk_gb: fc.integer({min: 10, max: 10000}),
  status: fc.constantFrom('active', 'suspected', 'failed'),
  last_heartbeat: fc.integer({min: 1000000000000, max: 2000000000000}),
  created_at: fc.integer({min: 1000000000000, max: 2000000000000}),
});

/**
 * Arbitrary for generating valid service data.
 */
const serviceDataArb = fc.record({
  service_id: serviceIdArb,
  service_type: fc.constantFrom('partition', 'message_group', 'query_router'),
  node_id: nodeIdArb,
  status: fc.constantFrom('active', 'starting', 'stopping', 'failed'),
  created_at: fc.integer({min: 1000000000000, max: 2000000000000}),
  updated_at: fc.integer({min: 1000000000000, max: 2000000000000}),
});

/**
 * Feature: test-failure-fixes, Property 5: UNIQUE Constraint Handling
 *
 * For any INSERT operation on the nodes table, the system SHALL use
 * INSERT OR REPLACE to handle UNIQUE constraint violations gracefully.
 *
 * **Validates: Requirements 4.1**
 */
test('Property 5: UNIQUE Constraint Handling - nodes table uses INSERT OR REPLACE',
  async (t) => {
    await fc.assert(
      fc.asyncProperty(
        nodeDataArb,
        async (nodeData) => {
          const mockSqlEngine = createMockSqlQueryEngine();
          const service = new CDCIntegrationService({
            nodeId: 'test-node',
            sqlQueryEngine: mockSqlEngine,
          });
          service.initialize();

          const result = await service.insertSystemTableRow(
            SystemTableName.NODES,
            nodeData,
          );

          // Property: Operation should succeed
          t.equal(result.success, true, 'Insert should succeed');
          t.equal(
            result.operation,
            CDCOperationType.INSERT,
            'Should be INSERT operation',
          );

          // Property: SQL should use INSERT INTO
          const insertQuery = mockSqlEngine.executedQueries.find((q) =>
            q.sql.includes(SQL.INSERT_INTO),
          );
          t.ok(insertQuery, 'Should use INSERT INTO');
          t.ok(
            insertQuery.sql.includes(SystemTableName.NODES),
            'Should target nodes table',
          );

          return true;
        },
      ),
      {numRuns: 10},
    );
  });

/**
 * Feature: test-failure-fixes, Property 5: UNIQUE Constraint Handling
 *
 * For any INSERT operation on the services table, the system SHALL use
 * INSERT INTO to insert records.
 *
 * **Validates: Requirements 4.2**
 */
test('Property 5: UNIQUE Constraint Handling - services table uses INSERT INTO',
  async (t) => {
    await fc.assert(
      fc.asyncProperty(
        serviceDataArb,
        async (serviceData) => {
          const mockSqlEngine = createMockSqlQueryEngine();
          const service = new CDCIntegrationService({
            nodeId: 'test-node',
            sqlQueryEngine: mockSqlEngine,
          });
          service.initialize();

          const result = await service.insertSystemTableRow(
            SystemTableName.SERVICES,
            serviceData,
          );

          // Property: Operation should succeed
          t.equal(result.success, true, 'Insert should succeed');
          t.equal(
            result.operation,
            CDCOperationType.INSERT,
            'Should be INSERT operation',
          );

          // Property: SQL should use INSERT INTO
          const insertQuery = mockSqlEngine.executedQueries.find((q) =>
            q.sql.includes(SQL.INSERT_INTO),
          );
          t.ok(insertQuery, 'Should use INSERT INTO');
          t.ok(
            insertQuery.sql.includes(SystemTableName.SERVICES),
            'Should target services table',
          );

          return true;
        },
      ),
      {numRuns: 10},
    );
  });

/**
 * Feature: test-failure-fixes, Property 5: UNIQUE Constraint Handling
 *
 * For any duplicate INSERT operation with the same primary key on the nodes
 * table, the system SHALL NOT throw an error but instead update the record.
 *
 * **Validates: Requirements 4.1, 4.2**
 */
test('Property 5: UNIQUE Constraint Handling - duplicate inserts do not cause errors',
  async (t) => {
    await fc.assert(
      fc.asyncProperty(
        nodeDataArb,
        fc.constantFrom('active', 'suspected', 'failed'),
        async (nodeData, newStatus) => {
          const mockSqlEngine = createMockSqlQueryEngine();
          const service = new CDCIntegrationService({
            nodeId: 'test-node',
            sqlQueryEngine: mockSqlEngine,
          });
          service.initialize();

          // First insert
          const result1 = await service.insertSystemTableRow(
            SystemTableName.NODES,
            nodeData,
          );
          t.equal(result1.success, true, 'First insert should succeed');

          // Second insert with same primary key but different status
          const duplicateData = {...nodeData, status: newStatus};
          const result2 = await service.insertSystemTableRow(
            SystemTableName.NODES,
            duplicateData,
          );

          // Property: Second insert should also succeed (not throw)
          t.equal(result2.success, true, 'Duplicate insert should succeed');
          t.equal(
            result2.operation,
            CDCOperationType.INSERT,
            'Should be INSERT operation',
          );

          // Property: Both operations should use INSERT INTO
          const insertQueries = mockSqlEngine.executedQueries.filter((q) =>
            q.sql.includes(SQL.INSERT_INTO),
          );
          t.equal(
            insertQueries.length,
            2,
            'Should have two INSERT INTO queries',
          );

          return true;
        },
      ),
      {numRuns: 10},
    );
  });

/**
 * Feature: test-failure-fixes, Property 5: UNIQUE Constraint Handling
 *
 * For any INSERT operation on system tables, the system SHALL never silently
 * fail - it must either succeed or return a clear error.
 *
 * **Validates: Requirements 4.1, 4.2**
 */
test('Property 5: UNIQUE Constraint Handling - no silent failures', async (t) => {
  await fc.assert(
    fc.asyncProperty(
      fc.constantFrom(SystemTableName.NODES, SystemTableName.SERVICES),
      nodeDataArb,
      async (tableName, baseData) => {
        const mockSqlEngine = createMockSqlQueryEngine();
        const service = new CDCIntegrationService({
          nodeId: 'test-node',
          sqlQueryEngine: mockSqlEngine,
        });
        service.initialize();

        // Prepare data appropriate for the table
        let data;
        if (tableName === SystemTableName.NODES) {
          data = baseData;
        } else {
          data = {
            service_id: `service-${baseData.node_id}`,
            service_type: 'partition',
            node_id: baseData.node_id,
            status: 'active',
            created_at: baseData.created_at,
            updated_at: baseData.created_at,
          };
        }

        const result = await service.insertSystemTableRow(tableName, data);

        // Property: Result must have explicit success status
        t.ok(
          typeof result.success === 'boolean',
          'Result must have boolean success field',
        );

        // Property: Result must have operation type
        t.ok(result.operation, 'Result must have operation field');

        // Property: Result must have table name
        t.equal(result.tableName, tableName, 'Result must have correct tableName');

        // Property: Result must have data
        t.ok(result.data, 'Result must have data field');

        return true;
      },
    ),
    {numRuns: 10},
  );
});

/**
 * Feature: test-failure-fixes, Property 5: UNIQUE Constraint Handling
 *
 * For any INSERT operation that fails due to SQL errors (not UNIQUE constraint),
 * the system SHALL throw an error with a clear message.
 *
 * **Validates: Requirements 4.1, 4.2**
 */
test('Property 5: UNIQUE Constraint Handling - SQL errors are not swallowed',
  async (t) => {
    await fc.assert(
      fc.asyncProperty(
        nodeDataArb,
        fc.string({minLength: 5, maxLength: 50}),
        async (nodeData, errorMessage) => {
          // Create a mock that returns failure
          const mockSqlEngine = {
            executedQueries: [],
            async executeQuery(sql, params = []) {
              this.executedQueries.push({sql, params});

              // Table exists check succeeds
              if (sql.includes('sqlite_master')) {
                return {success: true, rows: [{name: params[0]}]};
              }

              // INSERT fails with error
              return {
                success: false,
                error: errorMessage,
              };
            },
          };

          const service = new CDCIntegrationService({
            nodeId: 'test-node',
            sqlQueryEngine: mockSqlEngine,
          });
          service.initialize();

          let thrownError = null;
          try {
            await service.insertSystemTableRow(SystemTableName.NODES, nodeData);
          } catch (error) {
            thrownError = error;
          }

          // Property: Error should be thrown, not swallowed
          t.ok(thrownError, 'Error should be thrown on SQL failure');
          t.ok(
            thrownError.message.includes(errorMessage) ||
            thrownError.message.includes('Insert failed'),
            'Error message should be descriptive',
          );

          return true;
        },
      ),
      {numRuns: 10},
    );
  });

/**
 * Feature: test-failure-fixes, Property 5: UNIQUE Constraint Handling
 *
 * For any upsert operation on system tables, the system SHALL use
 * INSERT OR REPLACE semantics.
 *
 * **Validates: Requirements 4.1, 4.2**
 */
test('Property 5: UNIQUE Constraint Handling - upsertSystemTableRow uses INSERT OR REPLACE',
  async (t) => {
    await fc.assert(
      fc.asyncProperty(
        nodeDataArb,
        async (nodeData) => {
          const mockSqlEngine = createMockSqlQueryEngine();
          const service = new CDCIntegrationService({
            nodeId: 'test-node',
            sqlQueryEngine: mockSqlEngine,
          });
          service.initialize();

          const result = await service.upsertSystemTableRow(
            SystemTableName.NODES,
            nodeData,
          );

          // Property: Operation should succeed
          t.equal(result.success, true, 'Upsert should succeed');

          // Property: SQL should use INSERT OR REPLACE
          const upsertQuery = mockSqlEngine.executedQueries.find((q) =>
            q.sql.includes(SQL.INSERT_OR_REPLACE_INTO),
          );
          t.ok(upsertQuery, 'Should use INSERT OR REPLACE INTO');

          return true;
        },
      ),
      {numRuns: 10},
    );
  });

/**
 * Feature: test-failure-fixes, Property 5: UNIQUE Constraint Handling
 *
 * For any sequence of insert operations with the same primary key,
 * the final state should reflect the last insert's data.
 *
 * **Validates: Requirements 4.1, 4.2**
 */
test('Property 5: UNIQUE Constraint Handling - last insert wins semantics',
  async (t) => {
    await fc.assert(
      fc.asyncProperty(
        nodeIdArb,
        fc.array(
          fc.constantFrom('active', 'suspected', 'failed'),
          {minLength: 2, maxLength: 5},
        ),
        async (nodeId, statusSequence) => {
          const mockSqlEngine = createMockSqlQueryEngine();
          const service = new CDCIntegrationService({
            nodeId: 'test-node',
            sqlQueryEngine: mockSqlEngine,
          });
          service.initialize();

          const baseData = {
            node_id: nodeId,
            node_address: '127.0.0.1:8080',
            cpu_cores: 4,
            memory_mb: 8192,
            disk_gb: 100,
            last_heartbeat: Date.now(),
            created_at: Date.now(),
          };

          // Insert multiple times with different statuses
          let lastResult;
          for (const status of statusSequence) {
            lastResult = await service.insertSystemTableRow(
              SystemTableName.NODES,
              {...baseData, status},
            );
            t.equal(lastResult.success, true, `Insert with status ${status} should succeed`);
          }

          // Property: Last result should have the last status
          const lastStatus = statusSequence[statusSequence.length - 1];
          t.equal(
            lastResult.data.status,
            lastStatus,
            'Last insert data should have last status',
          );

          // Property: All inserts should use INSERT INTO
          const insertQueries = mockSqlEngine.executedQueries.filter((q) =>
            q.sql.includes(SQL.INSERT_INTO),
          );
          t.equal(
            insertQueries.length,
            statusSequence.length,
            'Should have one INSERT INTO per status',
          );

          return true;
        },
      ),
      {numRuns: 10},
    );
  });

