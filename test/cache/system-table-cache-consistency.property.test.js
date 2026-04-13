/**
 * Property-based test for System Table Cache in Message Group Replicas.
 * **Property 21: System Table Cache in Message Group Replicas**
 * **Validates: Requirements 4.4, 4.5, 4.8**
 *
 * Property: For any message group replica in the system, it should maintain
 * its own System_Table_Cache that is identical to all other message group
 * replicas (eventually consistent via CDC).
 */

import {test, beforeEach, afterEach} from '../../src/test-helpers/tap.js';
import fc from 'fast-check';
import {
  SystemTableCache,
  SYSTEM_TABLES,
  CDC_OPERATIONS,
} from '../../src/cache/system-table-cache.js';
import {
  getSystemCachePrimaryKeyField,
} from '../../src/cache/system-cache-key-descriptor.js';
import {LoggingService} from '../../src/logging/logging-service.js';
import {ConfigurationManager} from '../../src/config/configuration-manager.js';

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
 * Generate a random CDC event.
 */
function mapPublicationStatus(status) {
  if (status === 'active') {
    return 'PUBLISHED';
  }
  if (status === 'inactive') {
    return 'ACK_PENDING';
  }
  return 'OPEN';
}

function buildCdcRow(tableName, key, name, status, timestamp) {
  const primaryKeyField = getSystemCachePrimaryKeyField(tableName);
  const row = {
    [primaryKeyField]: key,
    created_at: timestamp,
    updated_at: timestamp,
  };

  if (tableName === 'control_plane_publications') {
    return {
      ...row,
      publication_kind: 'cluster_membership',
      publication_epoch: 1,
      publisher_node_id: 'node-a',
      published_active_node_ids: [],
      required_ack_node_ids: [],
      acknowledged_node_ids: [],
      reason_code: '',
      transition_history: [],
      status: mapPublicationStatus(status),
    };
  }

  return {
    ...row,
    name,
    status,
    timestamp,
  };
}

function getCacheRecordKey(tableName, record) {
  const primaryKeyField = getSystemCachePrimaryKeyField(tableName);
  return String(
    record?.[primaryKeyField] ??
      record?.id ??
      '',
  );
}

const cdcEventArbitrary = fc.record({
  tableName: fc.constantFrom(...SYSTEM_TABLES),
  operation: fc.constantFrom(
    CDC_OPERATIONS.INSERT,
    CDC_OPERATIONS.UPDATE,
    CDC_OPERATIONS.DELETE,
  ),
  key: fc.uuid(),
  name: fc.string({minLength: 1, maxLength: 50}),
  status: fc.constantFrom('active', 'inactive', 'pending'),
  timestamp: fc.integer({min: 1, max: Date.now()}),
}).map(({tableName, operation, key, name, status, timestamp}) => ({
  tableName,
  operation,
  data: buildCdcRow(tableName, key, name, status, timestamp),
}));

/**
 * Generate a sequence of CDC events.
 */
const cdcEventSequenceArbitrary = fc.array(cdcEventArbitrary, {
  minLength: 1,
  maxLength: 20,
});

/**
 * Helper to compare two caches for equality.
 * @param {SystemTableCache} cache1 - First cache.
 * @param {SystemTableCache} cache2 - Second cache.
 * @return {boolean} True if caches are identical.
 */
function cachesAreEqual(cache1, cache2) {
  for (const tableName of SYSTEM_TABLES) {
    const records1 = cache1.getAll(tableName);
    const records2 = cache2.getAll(tableName);

    if (records1.length !== records2.length) {
      return false;
    }

    // Sort by id for comparison
    records1.sort((a, b) =>
      getCacheRecordKey(tableName, a).localeCompare(
        getCacheRecordKey(tableName, b),
      ));
    records2.sort((a, b) =>
      getCacheRecordKey(tableName, a).localeCompare(
        getCacheRecordKey(tableName, b),
      ));

    for (let i = 0; i < records1.length; i++) {
      if (JSON.stringify(records1[i]) !== JSON.stringify(records2[i])) {
        return false;
      }
    }
  }
  return true;
}

/**
 * Feature: distributed-database-system
 * Property 21: System Table Cache in Message Group Replicas
 *
 * For any sequence of CDC events applied to multiple message group replica
 * caches, all caches should be identical after applying the same events
 * in the same order.
 */
test('Property 21: CDC events produce identical caches across replicas', async (t) => {
  await fc.assert(
    fc.property(
      cdcEventSequenceArbitrary,
      fc.integer({min: 2, max: 5}), // Number of replicas
      (events, numReplicas) => {
        // Create multiple caches simulating message group replicas
        const caches = [];
        for (let i = 0; i < numReplicas; i++) {
          caches.push(new SystemTableCache());
        }

        // Apply the same CDC events to all caches in the same order
        for (const event of events) {
          const recordKey = getCacheRecordKey(event.tableName, event.data);

          // For UPDATE/DELETE, ensure the record exists first
          if (event.operation !== CDC_OPERATIONS.INSERT) {
            // Insert the record first if it doesn't exist
            for (const cache of caches) {
              if (!cache.has(event.tableName, recordKey)) {
                cache.applySystemTableChange(
                  event.tableName,
                  CDC_OPERATIONS.INSERT,
                  event.data,
                );
              }
            }
          }

          // Apply the event to all caches
          for (const cache of caches) {
            cache.applySystemTableChange(
              event.tableName,
              event.operation,
              event.data,
            );
          }
        }

        // Verify all caches are identical
        for (let i = 1; i < caches.length; i++) {
          if (!cachesAreEqual(caches[0], caches[i])) {
            return false;
          }
        }

        return true;
      },
    ),
    {numRuns: 10},
  );

  t.pass('All replicas maintain identical caches via CDC');
});

/**
 * Property: CDC events applied in the same order produce deterministic results.
 */
test('Property 21: CDC event ordering produces deterministic cache state', async (t) => {
  await fc.assert(
    fc.property(
      cdcEventSequenceArbitrary,
      (events) => {
        // Create two caches
        const cache1 = new SystemTableCache();
        const cache2 = new SystemTableCache();

        // Apply events to both caches
        for (const event of events) {
          const recordKey = getCacheRecordKey(event.tableName, event.data);

          // Ensure record exists for UPDATE/DELETE
          if (event.operation !== CDC_OPERATIONS.INSERT) {
            if (!cache1.has(event.tableName, recordKey)) {
              cache1.applySystemTableChange(
                event.tableName,
                CDC_OPERATIONS.INSERT,
                event.data,
              );
            }
            if (!cache2.has(event.tableName, recordKey)) {
              cache2.applySystemTableChange(
                event.tableName,
                CDC_OPERATIONS.INSERT,
                event.data,
              );
            }
          }

          cache1.applySystemTableChange(
            event.tableName,
            event.operation,
            event.data,
          );
          cache2.applySystemTableChange(
            event.tableName,
            event.operation,
            event.data,
          );
        }

        // Caches should be identical
        return cachesAreEqual(cache1, cache2);
      },
    ),
    {numRuns: 10},
  );

  t.pass('CDC events produce deterministic cache state');
});

/**
 * Property: Each cache maintains queryable system information (Req 4.8).
 */
test('Property 21: Caches provide queryable system information', async (t) => {
  await fc.assert(
    fc.property(
      cdcEventSequenceArbitrary,
      (events) => {
        const cache = new SystemTableCache();

        // Track what we've inserted
        const insertedRecords = new Map();

        for (const event of events) {
          const recordKey = getCacheRecordKey(event.tableName, event.data);
          if (event.operation === CDC_OPERATIONS.INSERT) {
            cache.applySystemTableChange(
              event.tableName,
              event.operation,
              event.data,
            );
            insertedRecords.set(
              `${event.tableName}:${recordKey}`,
              {
                tableName: event.tableName,
                id: recordKey,
              },
            );
          }
        }

        // Verify all inserted records are queryable
        for (const {tableName, id} of insertedRecords.values()) {
          const record = cache.get(tableName, id);

          // Record should exist and have correct primary key
          if (!record || getCacheRecordKey(tableName, record) !== id) {
            return false;
          }

          // Should be findable via predicate
          const found = cache.find(
            tableName,
            (recordEntry) => getCacheRecordKey(tableName, recordEntry) === id,
          );
          if (!found || getCacheRecordKey(tableName, found) !== id) {
            return false;
          }

          // Should be in getAll results
          const all = cache.getAll(tableName);
          if (!all.some((recordEntry) =>
            getCacheRecordKey(tableName, recordEntry) === id)) {
            return false;
          }
        }

        return true;
      },
    ),
    {numRuns: 10},
  );

  t.pass('Caches provide queryable system information');
});

/**
 * Property: Cache updates only via CDC maintain consistency (Req 4.4, 4.5).
 */
test('Property 21: Cache updates via CDC maintain data integrity', async (t) => {
  await fc.assert(
    fc.property(
      fc.array(
        fc.record({
          node_id: fc.uuid(),
          name: fc.string({minLength: 1, maxLength: 20}),
          value: fc.integer({min: 0, max: 1000}),
          created_at: fc.integer({min: 1, max: Date.now()}),
          updated_at: fc.integer({min: 1, max: Date.now()}),
        }),
        {minLength: 1, maxLength: 10},
      ),
      (records) => {
        const cache = new SystemTableCache();

        // Insert all records
        for (const record of records) {
          cache.applySystemTableChange('nodes', CDC_OPERATIONS.INSERT, record);
        }

        // Verify count matches
        if (cache.count('nodes') !== records.length) {
          return false;
        }

        // Update all records
        for (const record of records) {
          cache.applySystemTableChange('nodes', CDC_OPERATIONS.UPDATE, {
            node_id: record.node_id,
            value: record.value + 100,
          });
        }

        // Verify updates applied
        for (const record of records) {
          const updated = cache.get('nodes', record.node_id);
          if (!updated || updated.value !== record.value + 100) {
            return false;
          }
        }

        // Delete half the records
        const toDelete = records.slice(0, Math.floor(records.length / 2));
        for (const record of toDelete) {
          cache.applySystemTableChange('nodes', CDC_OPERATIONS.DELETE, {
            node_id: record.node_id,
          });
        }

        // Verify deletions
        const expectedCount = records.length - toDelete.length;
        if (cache.count('nodes') !== expectedCount) {
          return false;
        }

        for (const record of toDelete) {
          if (cache.has('nodes', record.node_id)) {
            return false;
          }
        }

        return true;
      },
    ),
    {numRuns: 10},
  );

  t.pass('Cache updates via CDC maintain data integrity');
});
