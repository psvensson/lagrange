/**
 * Property-based test for CDC Generation.
 * **Property 6: Change Data Capture Generation**
 * **Validates: Requirements 3.5, 4.4**
 *
 * Property: For any data modification (INSERT, UPDATE, DELETE),
 * a CDC event should be generated and delivered to subscribers.
 */

import {test, beforeEach, afterEach} from '../../src/test-helpers/tap.js';
import fc from 'fast-check';
import {PartitionService} from '../../src/partition/partition-service.js';
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
 * Wait for CDC event fan-out to reach all subscribers.
 * @param {Array<Array<Object>>} subscriberEvents - Per-subscriber event buffers.
 * @param {number} expectedCount - Expected events per subscriber.
 * @return {Promise<boolean>} True when all subscribers have the expected events.
 */
async function waitForSubscriberDelivery(subscriberEvents, expectedCount) {
  for (let i = 0; i < 20; i++) {
    const delivered = subscriberEvents
      .every((events) => events.length >= expectedCount);
    if (delivered) {
      return true;
    }
    await new Promise((resolve) => setImmediate(resolve));
  }
  return subscriberEvents.every((events) => events.length >= expectedCount);
}

/**
 * Generate a random partition ID.
 */
const partitionIdArbitrary = fc.string({minLength: 1, maxLength: 20})
  .filter((s) => /^[a-z0-9_-]+$/i.test(s))
  .map((s) => `partition-${s}`);

/**
 * SQL reserved keywords to avoid in table names.
 */
const SQL_RESERVED_KEYWORDS = new Set([
  'add', 'all', 'alter', 'and', 'as', 'asc', 'between', 'by', 'case', 'check',
  'column', 'constraint', 'create', 'cross', 'current', 'default', 'delete',
  'desc', 'distinct', 'drop', 'else', 'end', 'escape', 'except', 'exists',
  'for', 'foreign', 'from', 'full', 'group', 'having', 'if', 'in', 'index',
  'inner', 'insert', 'intersect', 'into', 'is', 'join', 'key', 'left', 'like',
  'limit', 'not', 'null', 'on', 'or', 'order', 'outer', 'primary', 'references',
  'right', 'select', 'set', 'table', 'then', 'to', 'union', 'unique', 'update',
  'using', 'values', 'when', 'where', 'with',
]);

/**
 * Generate a random table name.
 */
const tableNameArbitrary = fc.string({minLength: 1, maxLength: 15})
  .filter((s) => /^[a-z_][a-z0-9_]*$/i.test(s))
  .filter((s) => !SQL_RESERVED_KEYWORDS.has(s.toLowerCase()));

/**
 * Generate random data for insert/update operations.
 */
const dataArbitrary = fc.record({
  id: fc.integer({min: 1, max: 10000}),
  name: fc.string({minLength: 1, maxLength: 50}).filter((s) => !s.includes('\'')),
  value: fc.integer({min: 0, max: 1000000}),
});

/**
 * Feature: distributed-database-system
 * Property 6: CDC Generation for INSERT operations
 *
 * For any INSERT operation, a CDC event with operation type INSERT
 * should be generated and delivered to subscribers.
 */
test('Property 6: CDC event generated for INSERT operations', async (t) => {
  await fc.assert(
    fc.asyncProperty(
      partitionIdArbitrary,
      tableNameArbitrary,
      dataArbitrary,
      async (partitionId, tableName, data) => {
        const cdcEvents = [];

        const partition = new PartitionService({
          partitionId,
          tableId: tableName,
          tableName,
          replicaId: `${partitionId}-r1`,
          replicaIds: [`${partitionId}-r1`],
          dbPath: ':memory:',
          schema: {
            columns: [
              {name: 'id', type: 'INTEGER', primaryKey: true},
              {name: 'name', type: 'TEXT'},
              {name: 'value', type: 'INTEGER'},
            ],
          },
        });

        try {
          await partition.initialize();

          // Subscribe to CDC events
          partition.subscribeToCDC((event) => {
            cdcEvents.push(event);
          });

          // Force leader role for testing
          partition.role = 'leader';
          partition.isLeader = true;

          // Perform INSERT
          await partition.insertData(tableName, data);

          // Verify CDC event was generated
          if (cdcEvents.length !== 1) {
            return false;
          }

          const event = cdcEvents[0];

          // Verify event properties
          if (event.operation !== 'INSERT') {
            return false;
          }
          if (event.tableName !== tableName) {
            return false;
          }
          if (event.sourcePartition !== partitionId) {
            return false;
          }
          if (!event.timestamp) {
            return false;
          }

          return true;
        } finally {
          await partition.shutdown();
        }
      },
    ),
    {numRuns: 10},
  );

  t.pass('CDC event generated for INSERT operations');
});

/**
 * Property 6: CDC event generated for UPDATE operations
 */
test('Property 6: CDC event generated for UPDATE operations', async (t) => {
  await fc.assert(
    fc.asyncProperty(
      partitionIdArbitrary,
      tableNameArbitrary,
      dataArbitrary,
      fc.integer({min: 1, max: 1000000}),
      async (partitionId, tableName, data, newValue) => {
        const cdcEvents = [];

        const partition = new PartitionService({
          partitionId,
          tableId: tableName,
          tableName,
          replicaId: `${partitionId}-r1`,
          replicaIds: [`${partitionId}-r1`],
          dbPath: ':memory:',
          schema: {
            columns: [
              {name: 'id', type: 'INTEGER', primaryKey: true},
              {name: 'name', type: 'TEXT'},
              {name: 'value', type: 'INTEGER'},
            ],
          },
        });

        try {
          await partition.initialize();

          // Force leader role for testing
          partition.role = 'leader';
          partition.isLeader = true;

          // Insert initial data
          await partition.insertData(tableName, data);

          // Subscribe to CDC events after insert
          partition.subscribeToCDC((event) => {
            cdcEvents.push(event);
          });
          // Wait for buffered INSERT replay to drain before validating UPDATE fan-out.
          await waitForSubscriberDelivery([cdcEvents], 1);
          cdcEvents.length = 0;

          // Perform UPDATE
          await partition.updateData(tableName, {id: data.id}, {value: newValue});

          // Verify CDC event was generated
          await waitForSubscriberDelivery([cdcEvents], 1);
          if (cdcEvents.length < 1) {
            return false;
          }

          const event = cdcEvents[cdcEvents.length - 1];

          // Verify event properties
          if (event.operation !== 'UPDATE') {
            return false;
          }
          if (event.tableName !== tableName) {
            return false;
          }
          if (event.sourcePartition !== partitionId) {
            return false;
          }

          return true;
        } finally {
          await partition.shutdown();
        }
      },
    ),
    {numRuns: 10},
  );

  t.pass('CDC event generated for UPDATE operations');
});

/**
 * Property 6: CDC event generated for DELETE operations
 */
test('Property 6: CDC event generated for DELETE operations', async (t) => {
  await fc.assert(
    fc.asyncProperty(
      partitionIdArbitrary,
      tableNameArbitrary,
      dataArbitrary,
      async (partitionId, tableName, data) => {
        const cdcEvents = [];

        const partition = new PartitionService({
          partitionId,
          tableId: tableName,
          tableName,
          replicaId: `${partitionId}-r1`,
          replicaIds: [`${partitionId}-r1`],
          dbPath: ':memory:',
          schema: {
            columns: [
              {name: 'id', type: 'INTEGER', primaryKey: true},
              {name: 'name', type: 'TEXT'},
              {name: 'value', type: 'INTEGER'},
            ],
          },
        });

        try {
          await partition.initialize();

          // Force leader role for testing
          partition.role = 'leader';
          partition.isLeader = true;

          // Insert initial data
          await partition.insertData(tableName, data);

          // Subscribe to CDC events after insert
          partition.subscribeToCDC((event) => {
            cdcEvents.push(event);
          });
          // Wait for buffered INSERT replay to drain before validating DELETE fan-out.
          await waitForSubscriberDelivery([cdcEvents], 1);
          cdcEvents.length = 0;

          // Perform DELETE
          await partition.deleteData(tableName, {id: data.id});

          // Verify CDC event was generated
          await waitForSubscriberDelivery([cdcEvents], 1);
          if (cdcEvents.length < 1) {
            return false;
          }

          const event = cdcEvents[cdcEvents.length - 1];

          // Verify event properties
          if (event.operation !== 'DELETE') {
            return false;
          }
          if (event.tableName !== tableName) {
            return false;
          }
          if (event.sourcePartition !== partitionId) {
            return false;
          }

          return true;
        } finally {
          await partition.shutdown();
        }
      },
    ),
    {numRuns: 10},
  );

  t.pass('CDC event generated for DELETE operations');
});

/**
 * Property 6: CDC events delivered to multiple subscribers
 */
test('Property 6: CDC events delivered to multiple subscribers', async (t) => {
  await fc.assert(
    fc.asyncProperty(
      partitionIdArbitrary,
      tableNameArbitrary,
      dataArbitrary,
      fc.integer({min: 2, max: 5}),
      async (partitionId, tableName, data, subscriberCount) => {
        const subscriberEvents = [];
        for (let i = 0; i < subscriberCount; i++) {
          subscriberEvents.push([]);
        }

        const partition = new PartitionService({
          partitionId,
          tableId: tableName,
          tableName,
          replicaId: `${partitionId}-r1`,
          replicaIds: [`${partitionId}-r1`],
          dbPath: ':memory:',
          schema: {
            columns: [
              {name: 'id', type: 'INTEGER', primaryKey: true},
              {name: 'name', type: 'TEXT'},
              {name: 'value', type: 'INTEGER'},
            ],
          },
        });

        try {
          await partition.initialize();

          // Subscribe multiple subscribers
          for (let i = 0; i < subscriberCount; i++) {
            const idx = i;
            partition.subscribeToCDC((event) => {
              subscriberEvents[idx].push(event);
            });
          }

          // Force leader role for testing
          partition.role = 'leader';
          partition.isLeader = true;

          // Perform INSERT
          await partition.insertData(tableName, data);

          const delivered = await waitForSubscriberDelivery(subscriberEvents, 1);
          if (!delivered) {
            return false;
          }

          // Verify all subscribers received the event
          for (let i = 0; i < subscriberCount; i++) {
            if (subscriberEvents[i].length !== 1) {
              return false;
            }
            if (subscriberEvents[i][0].operation !== 'INSERT') {
              return false;
            }
          }

          return true;
        } finally {
          await partition.shutdown();
        }
      },
    ),
    {numRuns: 10},
  );

  t.pass('CDC events delivered to multiple subscribers');
});
