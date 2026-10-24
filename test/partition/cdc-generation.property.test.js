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
import {SystemTableCache} from '../../src/cache/system-table-cache.js';
import {withFoundingStamp} from './partition-founding-stamp.js';
import {CDC_TABLE, resumeFixtureParticipantAdmission} from
  '../test-helpers/participant-transaction-fixture.js';
import {acknowledgingCdcSubscriber, settlePendingCdcDeliveries} from
  '../test-helpers/acknowledging-cdc-subscriber.js';

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
 * One single-replica partition for a property run.
 * @param {string} partitionId - Partition ID.
 * @param {string} tableName - Table name.
 * @return {PartitionService} The partition, not yet initialized.
 */
function createPropertyPartition(partitionId, tableName) {
  return new PartitionService(withFoundingStamp({
    partitionId,
    tableId: tableName,
    tableName,
    replicaId: `${partitionId}-r1`,
    replicaIds: [`${partitionId}-r1`],
    systemTableCache: new SystemTableCache(),
    dbPath: ':memory:',
    schema: {
      columns: [
        {name: 'id', type: 'INTEGER', primaryKey: true},
        {name: 'name', type: 'TEXT'},
        {name: 'value', type: 'INTEGER'},
      ],
    },
  }));
}

/**
 * Initialize, resume participant admission through the release owners, and
 * force the leader role for testing.
 * @param {PartitionService} partition - The partition.
 * @return {Promise<void>}
 */
async function startPropertyPartition(partition) {
  await partition.initialize();
  await resumeFixtureParticipantAdmission(partition);
  partition.role = 'leader';
  partition.isLeader = true;
}

/**
 * Generate a random partition ID.
 */
const partitionIdArbitrary = fc.string({minLength: 1, maxLength: 20})
  .filter((s) => /^[a-z0-9_-]+$/i.test(s))
  .map((s) => `partition-${s}`);

/**
 * The table: one whose committed writes owe CDC. The CDC policy owner records
 * an obligation only for the internally propagated system tables (owner
 * decision D2; a user table owes none, see partition-cdc-obligation O20), so
 * the generator properties run on the fixture's CDC-carrying table.
 */
const tableNameArbitrary = fc.constant(CDC_TABLE);

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
        // A durable CDC event is delivered only on the owner's committed receipt.
        const subscriber = acknowledgingCdcSubscriber();
        const cdcEvents = subscriber.events;

        const partition = createPropertyPartition(partitionId, tableName);

        try {
          await startPropertyPartition(partition);

          // Subscribe to CDC events
          partition.subscribeToCDC(subscriber);
          await settlePendingCdcDeliveries(partition);

          // Perform INSERT
          await partition.insertData(tableName, data);
          await settlePendingCdcDeliveries(partition);

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
        // A durable CDC event is delivered only on the owner's committed receipt.
        const subscriber = acknowledgingCdcSubscriber();
        const cdcEvents = subscriber.events;

        const partition = createPropertyPartition(partitionId, tableName);

        try {
          await startPropertyPartition(partition);

          // Insert initial data
          await partition.insertData(tableName, data);

          // Subscribe to CDC events after insert
          partition.subscribeToCDC(subscriber);
          // The owed INSERT reaches the new subscriber first; settle it.
          await settlePendingCdcDeliveries(partition);
          cdcEvents.length = 0;

          // Perform UPDATE
          await partition.updateData(tableName, {id: data.id}, {value: newValue});

          // Verify CDC event was generated
          await settlePendingCdcDeliveries(partition);
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
        // A durable CDC event is delivered only on the owner's committed receipt.
        const subscriber = acknowledgingCdcSubscriber();
        const cdcEvents = subscriber.events;

        const partition = createPropertyPartition(partitionId, tableName);

        try {
          await startPropertyPartition(partition);

          // Insert initial data
          await partition.insertData(tableName, data);

          // Subscribe to CDC events after insert
          partition.subscribeToCDC(subscriber);
          // The owed INSERT reaches the new subscriber first; settle it.
          await settlePendingCdcDeliveries(partition);
          cdcEvents.length = 0;

          // Perform DELETE
          await partition.deleteData(tableName, {id: data.id});

          // Verify CDC event was generated
          await settlePendingCdcDeliveries(partition);
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
        // Each subscriber answers the owner's committed receipt.
        const subscribers = [];
        for (let i = 0; i < subscriberCount; i++) {
          subscribers.push(acknowledgingCdcSubscriber());
        }
        const subscriberEvents = subscribers.map((subscriber) => subscriber.events);

        const partition = createPropertyPartition(partitionId, tableName);

        try {
          await startPropertyPartition(partition);

          // Subscribe multiple subscribers
          for (const subscriber of subscribers) {
            partition.subscribeToCDC(subscriber);
          }
          await settlePendingCdcDeliveries(partition);

          // Perform INSERT
          await partition.insertData(tableName, data);

          await settlePendingCdcDeliveries(partition);
          if (!subscriberEvents.every((events) => events.length >= 1)) {
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
