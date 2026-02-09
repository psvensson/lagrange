/**
 * Property Test: Correlation ID Presence
 * **Property 10: Correlation ID Presence**
 * **Validates: Requirements 8.1, 8.2, 8.3**
 *
 * Feature: code-clarity-maintainability, Property 10: Correlation ID Presence
 *
 * *For any* message sent through MessageRouter, the resulting message SHALL
 * contain a correlationId field that is either the original correlationId
 * (if present) or a newly generated UUID.
 *
 * This property test verifies:
 * 1. All messages get a correlationId (new or preserved)
 * 2. Existing correlationIds are preserved
 * 3. New correlationIds are valid UUIDs
 */

import {test} from '../../src/test-helpers/tap.js';
import fc from 'fast-check';
import {
  generateCorrelationId,
  getOrCreateCorrelationId,
  withCorrelationId,
} from '../../src/utils/correlation.js';

/**
 * UUID v4 format regex for validation.
 */
const UUID_V4_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * Generator for arbitrary message objects without correlationId.
 */
const messageWithoutCorrelationIdArb = fc.record({
  type: fc.string({minLength: 1, maxLength: 50}),
  payload: fc.anything(),
  timestamp: fc.integer({min: 0}),
});

/**
 * Generator for valid UUID v4 correlation IDs.
 */
const validCorrelationIdArb = fc.uuid();

/**
 * Generator for arbitrary message objects with correlationId.
 */
const messageWithCorrelationIdArb = fc.record({
  type: fc.string({minLength: 1, maxLength: 50}),
  payload: fc.anything(),
  timestamp: fc.integer({min: 0}),
  correlationId: validCorrelationIdArb,
});

test('Property 10: Correlation ID Presence', async (t) => {
  /**
   * Property: For any message without a correlationId, getOrCreateCorrelationId
   * SHALL return a newly generated valid UUID.
   *
   * Validates: Requirement 8.2 - IF a message has no correlationId THEN the
   * system SHALL generate a new UUID.
   */
  t.test('messages without correlationId get a new valid UUID', async (t) => {
    fc.assert(
      fc.property(
        messageWithoutCorrelationIdArb,
        (message) => {
          const correlationId = getOrCreateCorrelationId(message);

          // Must return a non-empty string
          if (!correlationId || typeof correlationId !== 'string') {
            return false;
          }

          // Must be a valid UUID v4 format
          return UUID_V4_REGEX.test(correlationId);
        },
      ),
      {numRuns: 10},
    );

    t.pass('messages without correlationId get a new valid UUID');
  });

  /**
   * Property: For any message with an existing correlationId, getOrCreateCorrelationId
   * SHALL preserve and return the original correlationId.
   *
   * Validates: Requirement 8.3 - IF a message has a correlationId THEN the
   * system SHALL preserve it through the request chain.
   */
  t.test('existing correlationIds are preserved', async (t) => {
    fc.assert(
      fc.property(
        messageWithCorrelationIdArb,
        (message) => {
          const originalCorrelationId = message.correlationId;
          const result = getOrCreateCorrelationId(message);

          // Must return the exact same correlationId
          return result === originalCorrelationId;
        },
      ),
      {numRuns: 10},
    );

    t.pass('existing correlationIds are preserved');
  });

  /**
   * Property: For any message, withCorrelationId SHALL return a new message
   * object that contains a correlationId field.
   *
   * Validates: Requirement 8.1 - ALL messages sent through MessageRouter
   * SHALL include a correlationId field.
   */
  t.test('withCorrelationId always adds correlationId to message', async (t) => {
    fc.assert(
      fc.property(
        messageWithoutCorrelationIdArb,
        (message) => {
          const result = withCorrelationId(message);

          // Must have a correlationId field
          if (!result.correlationId) {
            return false;
          }

          // correlationId must be a valid UUID
          return UUID_V4_REGEX.test(result.correlationId);
        },
      ),
      {numRuns: 10},
    );

    t.pass('withCorrelationId always adds correlationId to message');
  });

  /**
   * Property: For any message and provided correlationId, withCorrelationId
   * SHALL use the provided correlationId in the resulting message.
   *
   * Validates: Requirement 8.3 - IF a message has a correlationId THEN the
   * system SHALL preserve it through the request chain.
   */
  t.test('withCorrelationId uses provided correlationId', async (t) => {
    fc.assert(
      fc.property(
        messageWithoutCorrelationIdArb,
        validCorrelationIdArb,
        (message, providedCorrelationId) => {
          const result = withCorrelationId(message, providedCorrelationId);

          // Must use the provided correlationId
          return result.correlationId === providedCorrelationId;
        },
      ),
      {numRuns: 10},
    );

    t.pass('withCorrelationId uses provided correlationId');
  });

  /**
   * Property: For any message, withCorrelationId SHALL preserve all original
   * message properties in addition to adding correlationId.
   *
   * Validates: Requirement 8.1 - Messages must include correlationId while
   * preserving their original content.
   */
  t.test('withCorrelationId preserves original message properties', async (t) => {
    fc.assert(
      fc.property(
        messageWithoutCorrelationIdArb,
        (message) => {
          const result = withCorrelationId(message);

          // All original properties must be preserved
          for (const key of Object.keys(message)) {
            if (result[key] !== message[key]) {
              return false;
            }
          }

          // Must have correlationId added
          return result.correlationId !== undefined;
        },
      ),
      {numRuns: 10},
    );

    t.pass('withCorrelationId preserves original message properties');
  });

  /**
   * Property: generateCorrelationId SHALL always produce unique valid UUIDs.
   *
   * Validates: Requirement 8.2 - The system SHALL generate a new UUID for
   * messages without correlationId.
   */
  t.test('generateCorrelationId produces unique valid UUIDs', async (t) => {
    fc.assert(
      fc.property(
        fc.integer({min: 2, max: 10}),
        (count) => {
          const ids = new Set();

          for (let i = 0; i < count; i++) {
            const id = generateCorrelationId();

            // Must be a valid UUID v4
            if (!UUID_V4_REGEX.test(id)) {
              return false;
            }

            // Must be unique
            if (ids.has(id)) {
              return false;
            }

            ids.add(id);
          }

          return true;
        },
      ),
      {numRuns: 10},
    );

    t.pass('generateCorrelationId produces unique valid UUIDs');
  });

  /**
   * Property: For any message with falsy correlationId (null, undefined, empty),
   * getOrCreateCorrelationId SHALL generate a new valid UUID.
   *
   * Validates: Requirement 8.2 - IF a message has no correlationId THEN the
   * system SHALL generate a new UUID.
   */
  t.test('falsy correlationIds trigger new UUID generation', async (t) => {
    fc.assert(
      fc.property(
        fc.record({
          type: fc.string({minLength: 1, maxLength: 50}),
          payload: fc.anything(),
          correlationId: fc.constantFrom(null, undefined, '', 0, false),
        }),
        (message) => {
          const result = getOrCreateCorrelationId(message);

          // Must return a valid UUID (not the falsy value)
          return UUID_V4_REGEX.test(result);
        },
      ),
      {numRuns: 10},
    );

    t.pass('falsy correlationIds trigger new UUID generation');
  });
});
