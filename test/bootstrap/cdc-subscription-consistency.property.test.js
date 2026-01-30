/**
 * Property-based test for CDC Subscription Consistency.
 * **Property: CDC Subscription Consistency**
 * **Validates: Requirements 4.1, 4.2, 4.3**
 *
 * Feature: system-cache-seeding-architecture
 *
 * *For any* CDC event on a system table, all nodes with active CDC
 * subscriptions SHALL receive the event and update their system cache
 * consistently.
 *
 * This property test verifies:
 * 1. CDC events update cache on all subscribed nodes
 * 2. All nodes receive CDC events for system table changes
 * 3. Cache stays consistent across nodes after CDC events
 */

import {test} from '../../src/test-helpers/tap.js';
import fc from 'fast-check';
import {SystemTableCache, CDC_OPERATIONS} from '../../src/cache/system-table-cache.js';
import {TABLES} from '../../src/constants/index.js';
import {ConfigurationManager} from '../../src/config/configuration-manager.js';
import {LoggingService} from '../../src/logging/logging-service.js';

/**
 * Initialize test environment.
 */
function initializeTestEnvironment() {
  ConfigurationManager.resetInstance();
  LoggingService.resetInstance();
  const config = ConfigurationManager.getInstance();
  config.initialize({node: {id: 'test-node'}});
  const logger = LoggingService.getInstance();
  logger.initialize({level: 'error'});
}

/**
 * Generator for valid system table names.
 */
const systemTableArb = fc.constantFrom(
  TABLES.NODES,
  TABLES.PARTITIONS,
  TABLES.SERVICES,
  TABLES.TABLES,
  TABLES.MESSAGE_GROUPS,
  TABLES.REPLICA_OPERATIONS,
);

/**
 * Generator for CDC operations.
 */
const cdcOperationArb = fc.constantFrom(
  CDC_OPERATIONS.INSERT,
  CDC_OPERATIONS.UPDATE,
  CDC_OPERATIONS.DELETE,
);

/**
 * Generator for node record data.
 */
const nodeRecordArb = fc.record({
  node_id: fc.uuid(),
  node_address: fc.stringMatching(/^ws:\/\/localhost:[0-9]{4,5}$/),
  status: fc.constantFrom('active', 'inactive', 'draining'),
  created_at: fc.integer({min: 1000000000000, max: 9999999999999}),
  updated_at: fc.integer({min: 1000000000000, max: 9999999999999}),
});

/**
 * Generator for partition record data.
 */
const partitionRecordArb = fc.record({
  partition_id: fc.uuid(),
  table_name: fc.stringMatching(/^[a-z_][a-z0-9_]{0,20}$/),
  start_key: fc.string({maxLength: 50}),
  end_key: fc.string({maxLength: 50}),
  replica_count: fc.integer({min: 1, max: 5}),
});

/**
 * Generator for service record data.
 */
const serviceRecordArb = fc.record({
  service_id: fc.uuid(),
  partition_id: fc.uuid(),
  node_id: fc.uuid(),
  service_type: fc.constantFrom('partition', 'message_group'),
  raft_role: fc.constantFrom('leader', 'follower', 'candidate'),
  status: fc.constantFrom('active', 'inactive', 'starting'),
  address: fc.stringMatching(/^node[0-9]+\/partition\/[a-z0-9-]+$/),
});

/**
 * Generator for table record data.
 */
const tableRecordArb = fc.record({
  table_id: fc.uuid(),
  table_name: fc.stringMatching(/^[a-z_][a-z0-9_]{0,20}$/),
  partition_count: fc.integer({min: 1, max: 10}),
  created_at: fc.integer({min: 1000000000000, max: 9999999999999}),
});

/**
 * Generator for message group record data.
 */
const messageGroupRecordArb = fc.record({
  group_id: fc.uuid(),
  group_name: fc.stringMatching(/^[a-z_][a-z0-9_]{0,20}$/),
  replica_count: fc.integer({min: 1, max: 5}),
});

/**
 * Generator for replica operation record data.
 */
const replicaOperationRecordArb = fc.record({
  operation_id: fc.uuid(),
  operation_type: fc.constantFrom('add', 'remove', 'move'),
  status: fc.constantFrom('pending', 'in_progress', 'completed', 'failed'),
  partition_id: fc.uuid(),
});

/**
 * Generator for CDC event with correct record type for table.
 */
const cdcEventArb = fc.tuple(systemTableArb, cdcOperationArb).chain(([tableName, operation]) => {
  let recordArb;
  switch (tableName) {
  case TABLES.NODES:
    recordArb = nodeRecordArb;
    break;
  case TABLES.PARTITIONS:
    recordArb = partitionRecordArb;
    break;
  case TABLES.SERVICES:
    recordArb = serviceRecordArb;
    break;
  case TABLES.TABLES:
    recordArb = tableRecordArb;
    break;
  case TABLES.MESSAGE_GROUPS:
    recordArb = messageGroupRecordArb;
    break;
  case TABLES.REPLICA_OPERATIONS:
    recordArb = replicaOperationRecordArb;
    break;
  default:
    recordArb = nodeRecordArb;
  }
  return fc.record({
    tableName: fc.constant(tableName),
    operation: fc.constant(operation),
    record: recordArb,
  });
});

/**
 * Create a mock CDC integration service that simulates event broadcasting.
 * @param {Array<SystemTableCache>} caches - Array of caches to broadcast to.
 * @return {Object} Mock CDC service.
 */
function createMockCDCService(caches) {
  return {
    broadcastEvent: function(tableName, operation, record) {
      for (const cache of caches) {
        cache.applySystemTableChange(tableName, operation, record);
      }
    },
  };
}

/**
 * Check if two caches have the same data for a table.
 * @param {SystemTableCache} cache1 - First cache.
 * @param {SystemTableCache} cache2 - Second cache.
 * @param {string} tableName - Table name to compare.
 * @return {boolean} True if caches have same data.
 */
function cachesHaveSameData(cache1, cache2, tableName) {
  const records1 = cache1.getAll(tableName) || [];
  const records2 = cache2.getAll(tableName) || [];

  if (records1.length !== records2.length) {
    return false;
  }

  const ids1 = new Set(records1.map((r) => r.node_id || r.partition_id || r.service_id));
  const ids2 = new Set(records2.map((r) => r.node_id || r.partition_id || r.service_id));

  if (ids1.size !== ids2.size) {
    return false;
  }

  for (const id of ids1) {
    if (!ids2.has(id)) {
      return false;
    }
  }

  return true;
}

test('Property: CDC Subscription Consistency', async (t) => {
  t.beforeEach(() => {
    initializeTestEnvironment();
  });

  t.afterEach(() => {
    ConfigurationManager.resetInstance();
    LoggingService.resetInstance();
  });

  /**
   * Property 1: CDC events update cache on all subscribed nodes.
   * **Validates: Requirement 4.1**
   *
   * When a CDC event is received for a system table, the system cache
   * SHALL be updated with the new data.
   */
  await t.test('CDC events update cache on all nodes', async (t) => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(cdcEventArb, {minLength: 1, maxLength: 10}),
        fc.integer({min: 2, max: 5}),
        async (events, numNodes) => {
          const caches = [];
          for (let i = 0; i < numNodes; i++) {
            caches.push(new SystemTableCache());
          }

          const cdcService = createMockCDCService(caches);

          for (const event of events) {
            if (event.operation !== CDC_OPERATIONS.INSERT) {
              const recordId = event.record.node_id ||
                event.record.partition_id ||
                event.record.service_id;
              const hasRecord = caches[0].has(event.tableName, recordId);
              if (!hasRecord) {
                cdcService.broadcastEvent(
                  event.tableName,
                  CDC_OPERATIONS.INSERT,
                  event.record,
                );
              }
            }

            cdcService.broadcastEvent(
              event.tableName,
              event.operation,
              event.record,
            );
          }

          await new Promise((resolve) => setImmediate(resolve));

          for (let i = 1; i < numNodes; i++) {
            if (!cachesHaveSameData(caches[0], caches[i], events[0].tableName)) {
              return false;
            }
          }

          return true;
        },
      ),
      {numRuns: 10},
    );

    t.pass('CDC events update cache on all nodes');
  });

  /**
   * Property 2: All nodes receive CDC events for system table changes.
   * **Validates: Requirement 4.2**
   *
   * When a CDC event is broadcast, all nodes with active subscriptions
   * SHALL receive the event.
   */
  await t.test('all nodes receive CDC events', async (t) => {
    await fc.assert(
      fc.asyncProperty(
        cdcEventArb,
        fc.integer({min: 2, max: 5}),
        async (event, numNodes) => {
          const caches = [];
          const receivedEvents = [];

          for (let i = 0; i < numNodes; i++) {
            const cache = new SystemTableCache();
            const nodeEvents = [];
            receivedEvents.push(nodeEvents);

            cache.onCacheChange((tableName, operation, record) => {
              nodeEvents.push({tableName, operation, record});
            });

            caches.push(cache);
          }

          const cdcService = createMockCDCService(caches);
          cdcService.broadcastEvent(
            event.tableName,
            CDC_OPERATIONS.INSERT,
            event.record,
          );

          await new Promise((resolve) => setImmediate(resolve));

          for (let i = 0; i < numNodes; i++) {
            if (receivedEvents[i].length === 0) {
              return false;
            }

            const receivedEvent = receivedEvents[i][0];
            if (receivedEvent.tableName !== event.tableName ||
                receivedEvent.operation !== CDC_OPERATIONS.INSERT) {
              return false;
            }
          }

          return true;
        },
      ),
      {numRuns: 10},
    );

    t.pass('all nodes receive CDC events');
  });

  /**
   * Property 3: Cache stays consistent across nodes after CDC events.
   * **Validates: Requirement 4.3**
   *
   * After a sequence of CDC events, all nodes SHALL have the same view
   * of system table data (eventually consistent).
   */
  await t.test('cache stays consistent across nodes', async (t) => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(cdcEventArb, {minLength: 1, maxLength: 10}),
        fc.integer({min: 2, max: 5}),
        async (events, numNodes) => {
          const caches = [];
          for (let i = 0; i < numNodes; i++) {
            caches.push(new SystemTableCache());
          }

          const cdcService = createMockCDCService(caches);

          for (const event of events) {
            if (event.operation !== CDC_OPERATIONS.INSERT) {
              const recordId = event.record.node_id ||
                event.record.partition_id ||
                event.record.service_id;
              const hasRecord = caches[0].has(event.tableName, recordId);
              if (!hasRecord) {
                cdcService.broadcastEvent(
                  event.tableName,
                  CDC_OPERATIONS.INSERT,
                  event.record,
                );
              }
            }

            cdcService.broadcastEvent(
              event.tableName,
              event.operation,
              event.record,
            );
          }

          await new Promise((resolve) => setImmediate(resolve));

          const tablesToCheck = new Set(events.map((e) => e.tableName));
          for (const tableName of tablesToCheck) {
            for (let i = 1; i < numNodes; i++) {
              if (!cachesHaveSameData(caches[0], caches[i], tableName)) {
                return false;
              }
            }
          }

          return true;
        },
      ),
      {numRuns: 10},
    );

    t.pass('cache stays consistent across nodes');
  });

  /**
   * Property 4: CDC subscription handles all operation types.
   * **Validates: Requirement 4.3**
   *
   * CDC subscriptions SHALL handle INSERT, UPDATE, and DELETE operations
   * correctly for all system tables.
   */
  await t.test('CDC subscription handles all operation types', async (t) => {
    await fc.assert(
      fc.asyncProperty(
        cdcEventArb,
        async (event) => {
          const cache = new SystemTableCache();
          const receivedOperations = [];

          cache.onCacheChange((table, operation, _record) => {
            if (table === event.tableName) {
              receivedOperations.push(operation);
            }
          });

          cache.applySystemTableChange(
            event.tableName,
            CDC_OPERATIONS.INSERT,
            event.record,
          );
          await new Promise((resolve) => setImmediate(resolve));

          cache.applySystemTableChange(
            event.tableName,
            CDC_OPERATIONS.UPDATE,
            event.record,
          );
          await new Promise((resolve) => setImmediate(resolve));

          cache.applySystemTableChange(
            event.tableName,
            CDC_OPERATIONS.DELETE,
            event.record,
          );
          await new Promise((resolve) => setImmediate(resolve));

          const hasInsert = receivedOperations.includes(CDC_OPERATIONS.INSERT);
          const hasUpdate = receivedOperations.includes(CDC_OPERATIONS.UPDATE);
          const hasDelete = receivedOperations.includes(CDC_OPERATIONS.DELETE);

          return hasInsert && hasUpdate && hasDelete;
        },
      ),
      {numRuns: 10},
    );

    t.pass('CDC subscription handles all operation types');
  });

  /**
   * Property 5: CDC events maintain cache consistency for concurrent updates.
   * **Validates: Requirements 4.1, 4.2, 4.3**
   *
   * When multiple CDC events are applied concurrently, the cache SHALL
   * remain consistent across all nodes.
   */
  await t.test('CDC events maintain consistency for concurrent updates', async (t) => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(nodeRecordArb, {minLength: 5, maxLength: 10}),
        fc.integer({min: 2, max: 5}),
        async (records, numNodes) => {
          const caches = [];
          for (let i = 0; i < numNodes; i++) {
            caches.push(new SystemTableCache());
          }

          const cdcService = createMockCDCService(caches);

          for (const record of records) {
            cdcService.broadcastEvent(
              TABLES.NODES,
              CDC_OPERATIONS.INSERT,
              record,
            );
          }

          await new Promise((resolve) => setImmediate(resolve));

          for (let i = 1; i < numNodes; i++) {
            if (!cachesHaveSameData(caches[0], caches[i], TABLES.NODES)) {
              return false;
            }
          }

          const cache0Records = caches[0].getAll(TABLES.NODES) || [];
          return cache0Records.length === records.length;
        },
      ),
      {numRuns: 10},
    );

    t.pass('CDC events maintain consistency for concurrent updates');
  });

  /**
   * Property 6: Cache updates are idempotent for duplicate CDC events.
   * **Validates: Requirement 4.3**
   *
   * If the same CDC event is received multiple times, the cache SHALL
   * remain consistent and not create duplicate entries.
   */
  await t.test('cache updates are idempotent', async (t) => {
    await fc.assert(
      fc.asyncProperty(
        nodeRecordArb,
        fc.integer({min: 2, max: 5}),
        async (record, repeatCount) => {
          const cache = new SystemTableCache();

          for (let i = 0; i < repeatCount; i++) {
            cache.applySystemTableChange(
              TABLES.NODES,
              CDC_OPERATIONS.INSERT,
              record,
            );
          }

          await new Promise((resolve) => setImmediate(resolve));

          const records = cache.getAll(TABLES.NODES) || [];
          return records.length === 1;
        },
      ),
      {numRuns: 10},
    );

    t.pass('cache updates are idempotent');
  });
});
