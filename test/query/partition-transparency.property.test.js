/**
 * Property-based test for Partition Transparency.
 * **Property 45: Partition Transparency**
 * **Validates: Requirements 20.10**
 *
 * Property: For any query result, partition details are never exposed
 * in user-facing results. Partition details are only available in
 * system tables for operators.
 */

import {test, beforeEach, afterEach} from 'tap';
import fc from 'fast-check';
import {TableCreationService} from '../../src/query/table-creation-service.js';
import {ConfigurationManager} from '../../src/config/configuration-manager.js';
import {LoggingService} from '../../src/logging/logging-service.js';

beforeEach(() => {
  ConfigurationManager.resetInstance();
  LoggingService.resetInstance();
  const config = ConfigurationManager.getInstance();
  config.initialize({node: {id: 'test-node'}});
  const logger = LoggingService.getInstance();
  logger.initialize({level: 'error'});
});

afterEach(() => {
  ConfigurationManager.resetInstance();
  LoggingService.resetInstance();
});

/**
 * Generate a random query result with partition details.
 */
const queryResultArbitrary = fc.record({
  success: fc.constant(true),
  rows: fc.array(
    fc.record({
      id: fc.integer({min: 1, max: 1000}),
      name: fc.string({minLength: 1, maxLength: 20}),
      value: fc.integer({min: 0, max: 10000}),
      _partition_id: fc.string({minLength: 5, maxLength: 20}),
      _partitionId: fc.string({minLength: 5, maxLength: 20}),
      _sourcePartition: fc.string({minLength: 5, maxLength: 20}),
    }),
    {minLength: 0, maxLength: 5},
  ),
  count: fc.integer({min: 0, max: 100}),
  sourcePartition: fc.string({minLength: 5, maxLength: 20}),
  partition_key_start: fc.oneof(fc.constant(null), fc.string()),
  partition_key_end: fc.oneof(fc.constant(null), fc.string()),
  partitions: fc.array(fc.string(), {minLength: 0, maxLength: 3}),
});

/**
 * Feature: distributed-database-system
 * Property 45: Partition Transparency
 *
 * For any query result, partition details are never exposed in user-facing
 * results. Internal partition fields are stripped from rows and top-level.
 */
test('Property 45: stripPartitionDetails removes internal partition fields', async (t) => {
  await fc.assert(
    fc.property(
      queryResultArbitrary,
      (result) => {
        const service = new TableCreationService();
        const stripped = service.stripPartitionDetails(result);

        // Top-level internal partition fields should be removed
        if ('sourcePartition' in stripped) {
          return false;
        }
        if ('partition_key_start' in stripped) {
          return false;
        }
        if ('partition_key_end' in stripped) {
          return false;
        }

        // 'partitions' array should be kept (useful metadata)
        // This is intentional - it shows which partitions were queried

        // Row-level internal partition fields should be removed
        for (const row of stripped.rows || []) {
          if ('_partition_id' in row) {
            return false;
          }
          if ('_partitionId' in row) {
            return false;
          }
          if ('_sourcePartition' in row) {
            return false;
          }
        }

        return true;
      },
    ),
    {numRuns: 10},
  );

  t.pass('stripPartitionDetails removes all internal partition fields');
});

/**
 * Property: User data fields are preserved after stripping.
 */
test('Property 45: User data fields preserved after stripping', async (t) => {
  await fc.assert(
    fc.property(
      queryResultArbitrary,
      (result) => {
        const service = new TableCreationService();
        const stripped = service.stripPartitionDetails(result);

        // User data fields should be preserved
        if (stripped.success !== result.success) {
          return false;
        }
        if (stripped.count !== result.count) {
          return false;
        }

        // Row count should be preserved
        if ((stripped.rows || []).length !== (result.rows || []).length) {
          return false;
        }

        // User data in rows should be preserved
        for (let i = 0; i < (result.rows || []).length; i++) {
          const originalRow = result.rows[i];
          const strippedRow = stripped.rows[i];

          if (strippedRow.id !== originalRow.id) {
            return false;
          }
          if (strippedRow.name !== originalRow.name) {
            return false;
          }
          if (strippedRow.value !== originalRow.value) {
            return false;
          }
        }

        return true;
      },
    ),
    {numRuns: 10},
  );

  t.pass('User data fields are preserved after stripping partition details');
});

/**
 * Property: isPartitionField correctly identifies partition-related fields.
 */
test('Property 45: isPartitionField identifies partition fields', async (t) => {
  const service = new TableCreationService();

  // Known partition fields
  const partitionFields = [
    'partition_id',
    'partitionId',
    '_partition_id',
    '_partitionId',
    'partition_key_start',
    'partition_key_end',
    'partitionKeyStart',
    'partitionKeyEnd',
    'sourcePartition',
  ];

  // Known non-partition fields
  const nonPartitionFields = [
    'id',
    'name',
    'value',
    'created_at',
    'updated_at',
    'user_id',
    'table_name',
  ];

  await fc.assert(
    fc.property(
      fc.constantFrom(...partitionFields),
      (fieldName) => {
        return service.isPartitionField(fieldName) === true;
      },
    ),
    {numRuns: 10},
  );

  await fc.assert(
    fc.property(
      fc.constantFrom(...nonPartitionFields),
      (fieldName) => {
        return service.isPartitionField(fieldName) === false;
      },
    ),
    {numRuns: 10},
  );

  t.pass('isPartitionField correctly identifies partition-related fields');
});

/**
 * Property: Null/undefined results are handled gracefully.
 */
test('Property 45: Null/undefined results handled gracefully', async (t) => {
  const service = new TableCreationService();

  // Null result
  const nullResult = service.stripPartitionDetails(null);
  t.equal(nullResult, null, 'Null result returns null');

  // Undefined result
  const undefinedResult = service.stripPartitionDetails(undefined);
  t.equal(undefinedResult, undefined, 'Undefined result returns undefined');

  // Empty object
  const emptyResult = service.stripPartitionDetails({});
  t.ok(typeof emptyResult === 'object', 'Empty object returns object');

  t.pass('Null/undefined results are handled gracefully');
});
