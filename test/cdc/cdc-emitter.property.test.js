/**
 * Property-based tests for CDCEmitter.
 * Validates that CDC events contain all required fields for every
 * valid write operation.
 *
 * Feature: raft-architecture-consolidation
 */

import {test} from '../../src/test-helpers/tap.js';
import fc from 'fast-check';
import {CDCEmitter} from '../../src/cdc/cdc-emitter.js';
import {
  CDC_EMITTER_FIELD,
  CDC_EMITTER_OPERATION,
} from '../../src/cdc/cdc-emitter-constants.js';

/**
 * All valid CDC operation types.
 */
const VALID_OPERATIONS = [
  CDC_EMITTER_OPERATION.INSERT,
  CDC_EMITTER_OPERATION.UPDATE,
  CDC_EMITTER_OPERATION.DELETE,
];

/**
 * Create a silent logger for tests.
 * @return {Object} Logger with no-op methods.
 */
function createSilentLogger() {
  return {
    debug: () => {},
    info: () => {},
    warn: () => {},
    error: () => {},
  };
}

/**
 * Arbitrary for generating a valid CDC operation type.
 */
const operationArb = fc.constantFrom(...VALID_OPERATIONS);

/**
 * Arbitrary for generating non-empty data objects.
 * Uses a record with at least one key to ensure data is non-empty.
 */
const nonEmptyDataArb = fc.dictionary(
  fc.stringMatching(/^[a-zA-Z][a-zA-Z0-9]{0,19}$/),
  fc.oneof(fc.string(), fc.integer(), fc.boolean()),
  {minKeys: 1, maxKeys: 5},
);

/**
 * Arbitrary for generating valid CDCEmitter constructor options.
 */
const emitterOptionsArb = fc.record({
  partitionId: fc.stringMatching(/^[a-zA-Z][a-zA-Z0-9-]{0,19}$/),
  replicaId: fc.stringMatching(/^[a-zA-Z][a-zA-Z0-9-]{0,19}$/),
  tableName: fc.stringMatching(/^[a-zA-Z][a-zA-Z0-9_]{0,19}$/),
});

// Feature: raft-architecture-consolidation, Property 10:
//   CDCEmitter generates complete events for all write operations
/**
 * Property 10: CDCEmitter generates complete events for all
 * write operations
 *
 * For any write operation with a valid operation type (INSERT,
 * UPDATE, or DELETE) and non-empty data, the CDC event delivered
 * to subscribers should contain non-null values for tableName,
 * operation, data, timestamp, sourcePartition, and sourceReplica
 * fields.
 *
 * **Validates: Requirements 5.5**
 */
test('Property 10: CDCEmitter generates complete events ' +
  'for all write operations', async (t) => {
  await fc.assert(
    fc.asyncProperty(
      emitterOptionsArb,
      operationArb,
      nonEmptyDataArb,
      async (opts, operation, data) => {
        const mockTimestamp = `hlc-${Date.now()}`;
        const hlcClock = {now: () => mockTimestamp};

        const emitter = new CDCEmitter({
          partitionId: opts.partitionId,
          replicaId: opts.replicaId,
          tableName: opts.tableName,
          hlcClock,
          logger: createSilentLogger(),
        });

        let capturedEvent = null;
        emitter.subscribe((event) => {
          capturedEvent = event;
        });

        await emitter.emit(operation, data);

        // All six required fields must be non-null
        t.ok(
          capturedEvent[CDC_EMITTER_FIELD.TABLE_NAME] != null,
          'tableName must be non-null',
        );
        t.ok(
          capturedEvent[CDC_EMITTER_FIELD.OPERATION] != null,
          'operation must be non-null',
        );
        t.ok(
          capturedEvent[CDC_EMITTER_FIELD.DATA] != null,
          'data must be non-null',
        );
        t.ok(
          capturedEvent[CDC_EMITTER_FIELD.TIMESTAMP] != null,
          'timestamp must be non-null',
        );
        t.ok(
          capturedEvent[CDC_EMITTER_FIELD.SOURCE_PARTITION] != null,
          'sourcePartition must be non-null',
        );
        t.ok(
          capturedEvent[CDC_EMITTER_FIELD.SOURCE_REPLICA] != null,
          'sourceReplica must be non-null',
        );

        // Verify field values match inputs
        t.equal(
          capturedEvent[CDC_EMITTER_FIELD.TABLE_NAME],
          opts.tableName,
          'tableName should match constructor option',
        );
        t.equal(
          capturedEvent[CDC_EMITTER_FIELD.OPERATION],
          operation,
          'operation should match emitted operation',
        );
        t.same(
          capturedEvent[CDC_EMITTER_FIELD.DATA],
          data,
          'data should match emitted data',
        );
        t.equal(
          capturedEvent[CDC_EMITTER_FIELD.TIMESTAMP],
          mockTimestamp,
          'timestamp should come from hlcClock',
        );
        t.equal(
          capturedEvent[CDC_EMITTER_FIELD.SOURCE_PARTITION],
          opts.partitionId,
          'sourcePartition should match constructor option',
        );
        t.equal(
          capturedEvent[CDC_EMITTER_FIELD.SOURCE_REPLICA],
          opts.replicaId,
          'sourceReplica should match constructor option',
        );

        emitter.shutdown();

        return true;
      },
    ),
    {numRuns: 10},
  );
});
