/**
 * Property-based test for CDC Event Broadcast Completeness.
 * **Property 4: CDC Event Broadcast Completeness**
 * **Validates: Requirements 2.1, 2.3, 2.4**
 *
 * Property: For any CDC event applied to the SystemTableCache, all connected
 * listeners SHALL receive a notification containing the table name, operation,
 * record data, and the notification should be delivered asynchronously.
 */

import {test, beforeEach, afterEach} from '../../src/test-helpers/tap.js';
import fc from 'fast-check';
import {
  SystemTableCache,
  SYSTEM_TABLES,
  CDC_OPERATIONS,
} from '../../src/cache/system-table-cache.js';
import {LoggingService} from '../../src/logging/logging-service.js';
import {ConfigurationManager} from '../../src/config/configuration-manager.js';
import {getSystemCachePrimaryKeyField} from
  '../../src/cache/system-cache-key-descriptor.js';
import {systemTableRow} from '../test-helpers/system-table-row-fixture.js';

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
 * The complete stored row of a system table for a generated key.
 * @param {string} tableName - System table.
 * @param {string} key - Primary key value.
 * @return {Object} The stored row.
 */
function storedRow(tableName, key) {
  return systemTableRow(tableName, {
    [getSystemCachePrimaryKeyField(tableName)]: key,
  });
}

/**
 * The primary key value of a row of a system table.
 * @param {string} tableName - System table.
 * @param {Object} row - Stored row.
 * @return {string} The key.
 */
function rowKey(tableName, row) {
  return row[getSystemCachePrimaryKeyField(tableName)];
}

/**
 * Generate a random CDC event carrying the complete stored row of its table.
 */
const cdcEventArbitrary = fc.record({
  tableName: fc.constantFrom(...SYSTEM_TABLES),
  operation: fc.constantFrom(
    CDC_OPERATIONS.INSERT,
    CDC_OPERATIONS.UPDATE,
    CDC_OPERATIONS.DELETE,
  ),
  key: fc.uuid(),
}).map(({tableName, operation, key}) => ({
  tableName,
  operation,
  data: storedRow(tableName, key),
}));

/**
 * Generate a sequence of CDC events.
 */
const cdcEventSequenceArbitrary = fc.array(cdcEventArbitrary, {
  minLength: 1,
  maxLength: 10,
});

/**
 * Feature: admin-cli-cache-hydration
 * Property 4: CDC Event Broadcast Completeness
 *
 * For any CDC event applied to the SystemTableCache, all registered listeners
 * SHALL receive a notification containing the table name, operation, and
 * record data.
 */
test('Property 4: All listeners receive CDC events with correct data', async (t) => {
  await fc.assert(
    fc.asyncProperty(
      cdcEventSequenceArbitrary,
      fc.integer({min: 1, max: 5}), // Number of listeners
      async (events, numListeners) => {
        const cache = new SystemTableCache();
        const receivedEvents = [];

        // Register multiple listeners
        for (let i = 0; i < numListeners; i++) {
          const listenerEvents = [];
          receivedEvents.push(listenerEvents);
          cache.onCacheChange((tableName, operation, record) => {
            listenerEvents.push({tableName, operation, record});
          });
        }

        // Apply CDC events
        for (const event of events) {
          // For UPDATE/DELETE, ensure the record exists first
          if (event.operation !== CDC_OPERATIONS.INSERT) {
            if (!cache.has(event.tableName, rowKey(event.tableName, event.data))) {
              cache.applySystemTableChange(
                event.tableName,
                CDC_OPERATIONS.INSERT,
                event.data,
              );
            }
          }

          cache.applySystemTableChange(
            event.tableName,
            event.operation,
            event.data,
          );
        }

        // Wait for all setImmediate callbacks to fire
        await new Promise((resolve) => setImmediate(resolve));

        // Verify all listeners received the same events
        const firstListenerEvents = receivedEvents[0];
        for (let i = 1; i < numListeners; i++) {
          if (receivedEvents[i].length !== firstListenerEvents.length) {
            return false;
          }

          for (let j = 0; j < firstListenerEvents.length; j++) {
            const e1 = firstListenerEvents[j];
            const e2 = receivedEvents[i][j];

            if (e1.tableName !== e2.tableName ||
                e1.operation !== e2.operation ||
                JSON.stringify(e1.record) !== JSON.stringify(e2.record)) {
              return false;
            }
          }
        }

        // Verify each event has required fields
        for (const listenerEvents of receivedEvents) {
          for (const event of listenerEvents) {
            if (!event.tableName || !event.operation || !event.record) {
              return false;
            }
            if (!SYSTEM_TABLES.includes(event.tableName)) {
              return false;
            }
            if (!Object.values(CDC_OPERATIONS).includes(event.operation)) {
              return false;
            }
          }
        }

        return true;
      },
    ),
    {numRuns: 10},
  );

  t.pass('All listeners receive CDC events with correct data');
});

/**
 * Property: CDC notifications are delivered asynchronously (non-blocking).
 */
test('Property 4: CDC notifications are non-blocking', async (t) => {
  await fc.assert(
    fc.asyncProperty(
      cdcEventArbitrary,
      async (event) => {
        const cache = new SystemTableCache();
        let listenerCalled = false;

        cache.onCacheChange(() => {
          listenerCalled = true;
        });

        // Ensure record exists for UPDATE/DELETE
        if (event.operation !== CDC_OPERATIONS.INSERT) {
          cache.applySystemTableChange(
            event.tableName,
            CDC_OPERATIONS.INSERT,
            event.data,
          );
          // Wait for the INSERT notification
          await new Promise((resolve) => setImmediate(resolve));
          listenerCalled = false;
        }

        cache.applySystemTableChange(
          event.tableName,
          event.operation,
          event.data,
        );

        // Listener should NOT be called synchronously
        if (listenerCalled) {
          return false;
        }

        // Wait for setImmediate
        await new Promise((resolve) => setImmediate(resolve));

        // Now listener should have been called
        return listenerCalled;
      },
    ),
    {numRuns: 10},
  );

  t.pass('CDC notifications are non-blocking');
});

/**
 * Property: Listener errors do not prevent other listeners from receiving events.
 */
test('Property 4: Listener errors are isolated', async (t) => {
  await fc.assert(
    fc.asyncProperty(
      cdcEventArbitrary,
      async (event) => {
        const cache = new SystemTableCache();
        const receivedEvents = [];

        // First listener throws an error
        cache.onCacheChange(() => {
          throw new Error('Intentional test error');
        });

        // Second listener should still receive events
        cache.onCacheChange((tableName, operation, record) => {
          receivedEvents.push({tableName, operation, record});
        });

        // Third listener should also receive events
        cache.onCacheChange((tableName, operation, record) => {
          receivedEvents.push({tableName, operation, record});
        });

        cache.applySystemTableChange(
          event.tableName,
          CDC_OPERATIONS.INSERT,
          event.data,
        );

        await new Promise((resolve) => setImmediate(resolve));

        // Both non-throwing listeners should have received the event
        return receivedEvents.length === 2;
      },
    ),
    {numRuns: 10},
  );

  t.pass('Listener errors are isolated');
});

/**
 * Property: Notification record data matches the applied change.
 */
test('Property 4: Notification record matches applied change', async (t) => {
  await fc.assert(
    fc.asyncProperty(
      fc.record({
        tableName: fc.constantFrom(...SYSTEM_TABLES),
        key: fc.uuid(),
      }).map(({tableName, key}) => ({tableName, data: storedRow(tableName, key)})),
      async ({tableName, data}) => {
        const cache = new SystemTableCache();
        let receivedRecord = null;

        cache.onCacheChange((_tableName, _operation, record) => {
          receivedRecord = record;
        });

        cache.applySystemTableChange(tableName, CDC_OPERATIONS.INSERT, data);

        await new Promise((resolve) => setImmediate(resolve));

        // Verify the received record is the complete inserted row
        if (!receivedRecord) {
          return false;
        }

        return JSON.stringify(receivedRecord) === JSON.stringify(data);
      },
    ),
    {numRuns: 10},
  );

  t.pass('Notification record matches applied change');
});
