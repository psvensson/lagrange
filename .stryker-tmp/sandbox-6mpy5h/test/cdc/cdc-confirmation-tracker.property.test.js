/**
 * Property Tests: CDC Confirmation Tracker
 *
 * Feature: bootstrap-lifecycle-hardening
 * Property 1: CDC confirmation round-trip
 * Property 2: CDC confirmation timeout rejection
 * **Validates: Requirements 1.1, 1.3**
 *
 * Property 1: *For any* write to a CDC-propagated system table where
 * CDC confirmation is requested, the returned promise SHALL resolve
 * only after the written data is present in the SystemTableCache,
 * and the cache entry SHALL match the written data.
 *
 * Property 2: *For any* CDC confirmation request where the CDC
 * pipeline is blocked, the confirmation promise SHALL reject with a
 * timeout error after the configured timeout duration, and the error
 * SHALL be descriptive.
 */
// @ts-nocheck


import {test} from '../../src/test-helpers/tap.js';
import fc from 'fast-check';
import {CDCConfirmationTracker} from
  '../../src/cdc/cdc-confirmation-tracker.js';
import {
  CDC_CONFIRMATION_ERROR_TYPE,
} from '../../src/constants/cdc-lifecycle-constants.js';
import {
  getSystemCachePrimaryKeyFieldOrFallback,
} from '../../src/cache/system-cache-key-descriptor.js';

/**
 * Minimal SystemTableCache stub supporting onCacheChange/offCacheChange.
 * fire() simulates a cache-change notification.
 */
function createCacheStub() {
  const listeners = new Set();
  return {
    onCacheChange(listener) { listeners.add(listener); },
    offCacheChange(listener) { listeners.delete(listener); },
    fire(tableName, operation, record) {
      for (const l of listeners) l(tableName, operation, record);
    },
  };
}

/**
 * Known CDC-propagated tables with their primary key fields.
 * Used to build smart generators that produce valid table/pk pairs.
 */
const TABLE_PK_PAIRS = [
  {table: 'nodes', pkField: 'node_id'},
  {table: 'config', pkField: 'config_key'},
  {table: 'partitions', pkField: 'partition_id'},
  {table: 'services', pkField: 'service_id'},
];

/**
 * Generates a valid table name from known CDC-propagated tables.
 */
const tablePkPairArb = fc.constantFrom(...TABLE_PK_PAIRS);

/**
 * Generates a non-empty primary key value string.
 */
const pkValueArb = fc.stringOf(
  fc.constantFrom(
    'a', 'b', 'c', '1', '2', '3', '-', '_',
  ),
  {minLength: 1, maxLength: 20},
);

/**
 * Generates a CDC operation type.
 */
const operationArb = fc.constantFrom(
  'INSERT', 'UPDATE', 'UPSERT', 'DELETE',
);

test(
  'Feature: bootstrap-lifecycle-hardening, ' +
  'Property 1: CDC confirmation round-trip',
  async (t) => {
    /**
     * **Validates: Requirements 1.1**
     */
    t.test(
      'confirmation resolves when matching cache event fires',
      async () => {
        await fc.assert(
          fc.asyncProperty(
            tablePkPairArb,
            pkValueArb,
            operationArb,
            async (pair, pkValue, operation) => {
              const cache = createCacheStub();
              const tracker = new CDCConfirmationTracker({
                systemTableCache: cache,
                timeoutMs: 500,
              });

              try {
                const promise =
                  tracker.awaitConfirmation(pair.table, pkValue);

                // Verify the pk field resolution matches expectation.
                const resolvedPk =
                  getSystemCachePrimaryKeyFieldOrFallback(pair.table);
                if (resolvedPk !== pair.pkField) {
                  return false;
                }

                // Build a record with the correct pk field and value.
                const record = {[pair.pkField]: pkValue};

                // Fire the matching cache event.
                cache.fire(pair.table, operation, record);

                // The promise must resolve (not reject).
                await promise;
                return true;
              } finally {
                tracker.shutdown();
              }
            },
          ),
          {numRuns: 10},
        );
      },
    );
  },
);

test(
  'Feature: bootstrap-lifecycle-hardening, ' +
  'Property 2: CDC confirmation timeout rejection',
  async (t) => {
    /**
     * **Validates: Requirements 1.3**
     */
    t.test(
      'confirmation rejects with timeout when pipeline is blocked',
      async () => {
        await fc.assert(
          fc.asyncProperty(
            tablePkPairArb,
            pkValueArb,
            fc.integer({min: 10, max: 50}),
            async (pair, pkValue, timeoutMs) => {
              const cache = createCacheStub();
              const tracker = new CDCConfirmationTracker({
                systemTableCache: cache,
                timeoutMs: 5000,
              });

              try {
                // Request confirmation with a short timeout.
                // Do NOT fire any cache event — pipeline is blocked.
                await tracker.awaitConfirmation(
                  pair.table, pkValue, timeoutMs,
                );
                // Should not reach here.
                return false;
              } catch (err) {
                // Verify the error is descriptive.
                const hasCorrectName =
                  err.name === CDC_CONFIRMATION_ERROR_TYPE.TIMEOUT;
                const hasTableName = err.tableName === pair.table;
                const hasPrimaryKey = err.primaryKey === pkValue;
                const hasTimeoutMs = err.timeoutMs === timeoutMs;
                const hasDescriptiveMessage =
                  err.message.includes(pair.table) &&
                  err.message.includes(pkValue) &&
                  err.message.includes(`${timeoutMs}`);

                return hasCorrectName &&
                  hasTableName &&
                  hasPrimaryKey &&
                  hasTimeoutMs &&
                  hasDescriptiveMessage;
              } finally {
                tracker.shutdown();
              }
            },
          ),
          {numRuns: 10},
        );
      },
    );
  },
);
