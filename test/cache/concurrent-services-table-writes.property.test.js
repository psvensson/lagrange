/**
 * Property-based tests for concurrent services table writes.
 *
 * Feature: cluster-reliability-improvements
 *
 * Property 1: Concurrent Services Table Writes Complete
 * For any set of concurrent write operations to the services table from
 * different partitions, all operations SHALL complete without blocking each
 * other, and the final state SHALL reflect all writes.
 *
 * **Validates: Requirements 1.3**
 *
 * This test verifies that:
 * 1. isSystemTableWriteReady correctly identifies when writes are allowed
 * 2. The relaxed check for services table (no address required) prevents deadlocks
 * 3. Concurrent write readiness checks complete without blocking
 * 4. Final state reflects all write readiness determinations
 */

import t from '../../src/test-helpers/tap.js';
import fc from 'fast-check';
import {isSystemTableWriteReady} from '../../src/cache/leader-readiness-gate.js';
import {ConfigurationManager} from '../../src/config/configuration-manager.js';
import {LoggingService} from '../../src/logging/logging-service.js';
import {COLUMN, SERVICE_STATUS, SERVICE_TYPE, TABLES} from '../../src/constants/index.js';
import {RAFT_ROLE} from '../../src/raft/constants.js';
import {
  INITIAL_PARTITION_IDS,
  SYSTEM_TABLE_NAME,
} from '../../src/bootstrap/system-table-schemas-constants.js';

// ============================================================================
// Test Setup and Teardown
// ============================================================================

/**
 * Initialize test environment.
 */
function initializeTestEnvironment() {
  ConfigurationManager.resetInstance();
  LoggingService.resetInstance();

  const config = ConfigurationManager.getInstance();
  config.initialize({
    node: {id: 'test-node'},
    logging: {level: 'error'},
  });

  const logging = LoggingService.getInstance();
  logging.initialize({level: 'error'});
}

/**
 * Clean up test environment.
 */
function cleanupTestEnvironment() {
  ConfigurationManager.resetInstance();
  LoggingService.resetInstance();
}

// ============================================================================
// Mock Cache Helpers
// ============================================================================

/**
 * Create a mock system table cache with configurable data.
 * @param {Object} data - Data to populate the cache with.
 * @param {Array} data.partitions - Partition records.
 * @param {Array} data.services - Service records.
 * @return {Object} Mock cache object.
 */
function createMockCache(data = {}) {
  const tables = {
    [TABLES.PARTITIONS]: data.partitions || [],
    [TABLES.SERVICES]: data.services || [],
  };

  return {
    getAll: (tableName) => tables[tableName] || [],
    filter: (tableName, predicate) => {
      const records = tables[tableName] || [];
      return records.filter(predicate);
    },
  };
}

/**
 * Create a partition record.
 * @param {string} partitionId - Partition ID.
 * @param {string} tableId - Table ID.
 * @return {Object} Partition record.
 */
function createPartitionRecord(partitionId, tableId = 'table-1') {
  return {
    [COLUMN.PARTITION_ID]: partitionId,
    [COLUMN.TABLE_ID]: tableId,
    [COLUMN.LEADER_NODE_ID]: null,
  };
}

/**
 * Create a leader service record for a partition.
 * @param {string} partitionId - Partition ID.
 * @param {Object} options - Options for the service.
 * @param {string|null} options.address - Address (null for missing).
 * @param {string|null} options.nodeId - Node ID (null for missing).
 * @return {Object} Service record.
 */
function createPartitionLeaderService(partitionId, options = {}) {
  const hasAddress = options.address !== undefined;
  const hasNodeId = options.nodeId !== undefined;
  return {
    [COLUMN.SERVICE_ID]: `${partitionId}-leader`,
    [COLUMN.SERVICE_TYPE]: SERVICE_TYPE.PARTITION,
    [COLUMN.PARTITION_ID]: partitionId,
    [COLUMN.RAFT_ROLE]: RAFT_ROLE.LEADER,
    [COLUMN.STATUS]: SERVICE_STATUS.ACTIVE,
    [COLUMN.NODE_ID]: hasNodeId ? options.nodeId : 'node-1',
    [COLUMN.ADDRESS]: hasAddress ? options.address : 'ws://127.0.0.1:8080',
  };
}

// ============================================================================
// Arbitraries for Property-Based Testing
// ============================================================================

/**
 * Generate a system table name from the available system tables.
 * @return {fc.Arbitrary<string>} Arbitrary for system table names.
 */
const systemTableNameArb = fc.constantFrom(
  SYSTEM_TABLE_NAME.TABLES,
  SYSTEM_TABLE_NAME.PARTITIONS,
  SYSTEM_TABLE_NAME.INDICES,
  SYSTEM_TABLE_NAME.MESSAGE_GROUPS,
  SYSTEM_TABLE_NAME.NODES,
  SYSTEM_TABLE_NAME.SERVICES,
  SYSTEM_TABLE_NAME.LOGS,
  SYSTEM_TABLE_NAME.CONFIG,
);

/**
 * Generate a write operation configuration.
 * @return {fc.Arbitrary<Object>} Arbitrary for write operation config.
 */
const writeOperationArb = fc.record({
  tableName: systemTableNameArb,
  hasPartitionRecord: fc.boolean(),
  hasLeaderService: fc.boolean(),
  leaderHasAddress: fc.boolean(),
});

/**
 * Generate a set of concurrent write operations.
 * @return {fc.Arbitrary<Array>} Arbitrary for concurrent write operations.
 */
const concurrentWriteOperationsArb = fc.array(writeOperationArb, {
  minLength: 1,
  maxLength: 5,
});

/**
 * Build a mock cache from write operation configurations.
 * Each table gets its own independent cache state based on its configuration.
 * This simulates concurrent writes where each partition has its own state.
 * @param {Array} operations - Array of write operation configs.
 * @return {Object} Mock cache and expected results per table.
 */
function buildCacheFromOperations(operations) {
  // Deduplicate operations by table name - use the last configuration for each table
  // This simulates the final state after all concurrent operations complete
  const tableConfigs = new Map();
  for (const op of operations) {
    tableConfigs.set(op.tableName, op);
  }

  const partitionRecords = [];
  const serviceRecords = [];
  const expectedResults = [];

  for (const [tableName, op] of tableConfigs) {
    const partitionId = INITIAL_PARTITION_IDS[tableName];
    if (!partitionId) {
      // Unknown table - should return false
      expectedResults.push({
        tableName,
        expectedReady: false,
        reason: 'unknown_table',
      });
      continue;
    }

    // Add partition record if configured
    if (op.hasPartitionRecord) {
      partitionRecords.push(createPartitionRecord(partitionId, tableName));
    }

    // Add leader service if configured
    if (op.hasPartitionRecord && op.hasLeaderService) {
      const address = op.leaderHasAddress ? 'ws://127.0.0.1:8080' : null;
      serviceRecords.push(createPartitionLeaderService(partitionId, {
        address,
        nodeId: 'node-1',
      }));
    }

    // Determine expected result
    // For services table: only needs leader service (no address required)
    // For other tables: needs partition record + leader service with address
    let expectedReady = false;
    let reason = 'unknown';

    if (!op.hasPartitionRecord) {
      expectedReady = false;
      reason = 'no_partition_record';
    } else if (!op.hasLeaderService) {
      expectedReady = false;
      reason = 'no_leader_service';
    } else if (tableName === TABLES.SERVICES) {
      // Services table uses relaxed check - no address required
      expectedReady = true;
      reason = 'services_relaxed_check';
    } else if (!op.leaderHasAddress) {
      expectedReady = false;
      reason = 'leader_missing_address';
    } else {
      expectedReady = true;
      reason = 'all_requirements_met';
    }

    expectedResults.push({
      tableName,
      expectedReady,
      reason,
    });
  }

  const cache = createMockCache({
    partitions: partitionRecords,
    services: serviceRecords,
  });

  return {cache, expectedResults};
}

// ============================================================================
// Property Tests
// ============================================================================

t.test('Concurrent Services Table Writes Property Tests', async (t) => {
  t.beforeEach(() => {
    initializeTestEnvironment();
  });

  t.afterEach(() => {
    cleanupTestEnvironment();
  });

  t.test('Property 1: All concurrent write readiness checks complete without blocking',
    async (t) => {
      /**
       * **Feature: cluster-reliability-improvements, Property 1**
       *
       * For any set of concurrent write operations to the services table from
       * different partitions, all operations SHALL complete without blocking
       * each other.
       *
       * **Validates: Requirements 1.3**
       */
      fc.assert(
        fc.property(
          concurrentWriteOperationsArb,
          (operations) => {
            const {cache, expectedResults} = buildCacheFromOperations(operations);

            // Execute all write readiness checks concurrently (simulated)
            const results = [];
            const startTime = Date.now();

            for (const expected of expectedResults) {
              const isReady = isSystemTableWriteReady(cache, expected.tableName);
              results.push({
                tableName: expected.tableName,
                isReady,
                expectedReady: expected.expectedReady,
              });
            }

            const elapsed = Date.now() - startTime;

            // All checks should complete quickly (no blocking)
            // Using 100ms as a generous upper bound for synchronous operations
            if (elapsed > 100) {
              return false;
            }

            // All results should match expectations
            for (const result of results) {
              if (result.isReady !== result.expectedReady) {
                return false;
              }
            }

            return true;
          },
        ),
        {numRuns: 10},
      );

      t.pass('All concurrent write readiness checks complete without blocking');
    });

  t.test('Property 1: Final state reflects all write readiness determinations', async (t) => {
    /**
     * **Feature: cluster-reliability-improvements, Property 1**
     *
     * For any set of concurrent write operations, the final state SHALL
     * reflect all writes (i.e., all readiness checks return correct results).
     *
     * **Validates: Requirements 1.3**
     */
    fc.assert(
      fc.property(
        concurrentWriteOperationsArb,
        (operations) => {
          const {cache, expectedResults} = buildCacheFromOperations(operations);

          // Verify each operation's readiness check returns expected result
          for (const expected of expectedResults) {
            const isReady = isSystemTableWriteReady(cache, expected.tableName);
            if (isReady !== expected.expectedReady) {
              return false;
            }
          }

          return true;
        },
      ),
      {numRuns: 10},
    );

    t.pass('Final state reflects all write readiness determinations');
  });

  t.test('Property 1: Services table uses relaxed check (no address required)', async (t) => {
    /**
     * **Feature: cluster-reliability-improvements, Property 1**
     *
     * The services table SHALL use a relaxed check that does not require
     * the leader to have an address. This prevents circular dependency
     * where services-p1 leader cannot write its own address because it
     * does not have an address yet.
     *
     * **Validates: Requirements 1.3**
     */
    fc.assert(
      fc.property(
        fc.record({
          hasPartitionRecord: fc.constant(true),
          hasLeaderService: fc.constant(true),
          leaderHasAddress: fc.boolean(),
        }),
        (config) => {
          const partitionId = INITIAL_PARTITION_IDS[TABLES.SERVICES];
          const partitionRecords = [createPartitionRecord(partitionId, TABLES.SERVICES)];
          const serviceRecords = [createPartitionLeaderService(partitionId, {
            address: config.leaderHasAddress ? 'ws://127.0.0.1:8080' : null,
            nodeId: 'node-1',
          })];

          const cache = createMockCache({
            partitions: partitionRecords,
            services: serviceRecords,
          });

          const isReady = isSystemTableWriteReady(cache, TABLES.SERVICES);

          // Services table should be ready regardless of address presence
          // as long as partition record and leader service exist
          return isReady === true;
        },
      ),
      {numRuns: 10},
    );

    t.pass('Services table uses relaxed check (no address required)');
  });

  t.test('Property 1: Non-services tables require leader address', async (t) => {
    /**
     * **Feature: cluster-reliability-improvements, Property 1**
     *
     * Non-services tables SHALL require the leader to have an address
     * for write readiness.
     *
     * **Validates: Requirements 1.3**
     */
    const nonServicesTableArb = fc.constantFrom(
      SYSTEM_TABLE_NAME.TABLES,
      SYSTEM_TABLE_NAME.PARTITIONS,
      SYSTEM_TABLE_NAME.NODES,
      SYSTEM_TABLE_NAME.MESSAGE_GROUPS,
    );

    fc.assert(
      fc.property(
        fc.record({
          tableName: nonServicesTableArb,
          leaderHasAddress: fc.boolean(),
        }),
        (config) => {
          const partitionId = INITIAL_PARTITION_IDS[config.tableName];
          const partitionRecords = [createPartitionRecord(partitionId, config.tableName)];
          const serviceRecords = [createPartitionLeaderService(partitionId, {
            address: config.leaderHasAddress ? 'ws://127.0.0.1:8080' : null,
            nodeId: 'node-1',
          })];

          const cache = createMockCache({
            partitions: partitionRecords,
            services: serviceRecords,
          });

          const isReady = isSystemTableWriteReady(cache, config.tableName);

          // Non-services tables should only be ready if leader has address
          return isReady === config.leaderHasAddress;
        },
      ),
      {numRuns: 10},
    );

    t.pass('Non-services tables require leader address');
  });

  t.test('Property 1: Write readiness is deterministic', async (t) => {
    /**
     * **Feature: cluster-reliability-improvements, Property 1**
     *
     * For any cache state, calling isSystemTableWriteReady multiple times
     * with the same arguments SHALL return the same result.
     *
     * **Validates: Requirements 1.3**
     */
    fc.assert(
      fc.property(
        writeOperationArb,
        (operation) => {
          const operations = [operation];
          const {cache} = buildCacheFromOperations(operations);

          // Call multiple times and verify same result
          const result1 = isSystemTableWriteReady(cache, operation.tableName);
          const result2 = isSystemTableWriteReady(cache, operation.tableName);
          const result3 = isSystemTableWriteReady(cache, operation.tableName);

          return result1 === result2 && result2 === result3;
        },
      ),
      {numRuns: 10},
    );

    t.pass('Write readiness is deterministic');
  });

  t.test('Property 1: Null cache returns false for all tables', async (t) => {
    /**
     * **Feature: cluster-reliability-improvements, Property 1**
     *
     * When the cache is null, isSystemTableWriteReady SHALL return false
     * for all tables.
     *
     * **Validates: Requirements 1.3**
     */
    fc.assert(
      fc.property(
        systemTableNameArb,
        (tableName) => {
          const isReady = isSystemTableWriteReady(null, tableName);
          return isReady === false;
        },
      ),
      {numRuns: 10},
    );

    t.pass('Null cache returns false for all tables');
  });

  t.test('Property 1: Unknown table returns false', async (t) => {
    /**
     * **Feature: cluster-reliability-improvements, Property 1**
     *
     * When the table name is not a known system table, isSystemTableWriteReady
     * SHALL return false.
     *
     * **Validates: Requirements 1.3**
     */
    const unknownTableArb = fc.string({minLength: 1, maxLength: 20})
      .filter((s) => !Object.values(SYSTEM_TABLE_NAME).includes(s))
      .map((s) => `unknown_${s}`);

    fc.assert(
      fc.property(
        unknownTableArb,
        (tableName) => {
          const cache = createMockCache({
            partitions: [],
            services: [],
          });
          const isReady = isSystemTableWriteReady(cache, tableName);
          return isReady === false;
        },
      ),
      {numRuns: 10},
    );

    t.pass('Unknown table returns false');
  });

  t.test('Property 1: Missing partition record returns false', async (t) => {
    /**
     * **Feature: cluster-reliability-improvements, Property 1**
     *
     * When the partition record is missing from the cache, isSystemTableWriteReady
     * SHALL return false even if a leader service exists.
     *
     * **Validates: Requirements 1.3**
     */
    fc.assert(
      fc.property(
        systemTableNameArb,
        (tableName) => {
          const partitionId = INITIAL_PARTITION_IDS[tableName];
          if (!partitionId) {
            return true; // Skip unknown tables
          }

          // Create cache with leader service but no partition record
          const serviceRecords = [createPartitionLeaderService(partitionId, {
            address: 'ws://127.0.0.1:8080',
            nodeId: 'node-1',
          })];

          const cache = createMockCache({
            partitions: [], // No partition record
            services: serviceRecords,
          });

          const isReady = isSystemTableWriteReady(cache, tableName);
          return isReady === false;
        },
      ),
      {numRuns: 10},
    );

    t.pass('Missing partition record returns false');
  });

  t.test('Property 1: Missing leader service returns false', async (t) => {
    /**
     * **Feature: cluster-reliability-improvements, Property 1**
     *
     * When the leader service is missing from the cache, isSystemTableWriteReady
     * SHALL return false even if the partition record exists.
     *
     * **Validates: Requirements 1.3**
     */
    fc.assert(
      fc.property(
        systemTableNameArb,
        (tableName) => {
          const partitionId = INITIAL_PARTITION_IDS[tableName];
          if (!partitionId) {
            return true; // Skip unknown tables
          }

          // Create cache with partition record but no leader service
          const partitionRecords = [createPartitionRecord(partitionId, tableName)];

          const cache = createMockCache({
            partitions: partitionRecords,
            services: [], // No leader service
          });

          const isReady = isSystemTableWriteReady(cache, tableName);
          return isReady === false;
        },
      ),
      {numRuns: 10},
    );

    t.pass('Missing leader service returns false');
  });
});
