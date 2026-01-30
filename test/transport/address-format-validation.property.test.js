/**
 * Property test for Address Format and Parsing.
 * Property 1: For any valid address string, parsing SHALL extract the correct
 * nodeId, entityType, and entityId components, and the address SHALL match
 * the format ${nodeId}/${entityType}/${entityId} where entityType is one of
 * the valid types.
 *
 * Validates: Requirements 1.1, 1.2, 1.3, 9.1, 10.1, 10.3
 *
 * Feature: unified-remote-transport
 * Property 1: Address Format and Parsing
 */

import {test} from '../../src/test-helpers/tap.js';
import fc from 'fast-check';
import {MessageRouter} from '../../src/transport/message-router.js';
import {ConfigurationManager} from '../../src/config/configuration-manager.js';
import {LoggingService} from '../../src/logging/logging-service.js';

// Initialize configuration and logging for tests (module level)
ConfigurationManager.resetInstance();
LoggingService.resetInstance();
const config = ConfigurationManager.getInstance();
config.initialize({node: {id: 'test-node'}});
const logger = LoggingService.getInstance();
logger.initialize({level: 'error'});

// Valid entity types as defined in the design
const VALID_ENTITY_TYPES = ['message-group', 'partition', 'lifecycle', 'service'];

/**
 * Feature: unified-remote-transport
 * Property 1: Address Format and Parsing
 *
 * For any valid address string, parsing SHALL extract the correct nodeId,
 * entityType, and entityId components, and the address SHALL match the format
 * ${nodeId}/${entityType}/${entityId} where entityType is one of the valid types.
 */
test('Property 1: Address Format and Parsing', async (t) => {
  /**
   * Property: parseAddress correctly extracts components from valid addresses.
   *
   * For any valid unified address (nodeId/entityType/entityId), parseAddress
   * should return an object with the correct nodeId, entityType, and entityId.
   */
  t.test('parseAddress extracts correct components from valid addresses', async (t) => {
    await fc.assert(
      fc.asyncProperty(
        // Generate valid address components (no slashes allowed in components)
        fc.string({minLength: 1, maxLength: 20}).filter((s) => !s.includes('/')),
        fc.constantFrom(...VALID_ENTITY_TYPES),
        fc.string({minLength: 1, maxLength: 30}).filter((s) => !s.includes('/')),
        async (nodeId, entityType, entityId) => {
          const router = new MessageRouter({nodeId: 'test-node'});

          const address = `${nodeId}/${entityType}/${entityId}`;
          const parsed = router.parseAddress(address);

          await router.shutdown();

          // Verify all components are correctly extracted
          return parsed.nodeId === nodeId &&
                 parsed.entityType === entityType &&
                 parsed.entityId === entityId;
        },
      ),
      {numRuns: 10},
    );

    t.pass('parseAddress extracts correct components from valid addresses');
  });

  /**
   * Property: parseAddress handles malformed addresses gracefully.
   *
   * For any malformed address (wrong number of segments, empty, null),
   * parseAddress should return null values without throwing.
   */
  t.test('parseAddress handles malformed addresses gracefully', async (t) => {
    await fc.assert(
      fc.asyncProperty(
        // Generate malformed addresses
        fc.oneof(
          // Empty or null-like
          fc.constant(''),
          fc.constant(null),
          fc.constant(undefined),
          // Single segment (no slashes)
          fc.string({minLength: 1, maxLength: 20}).filter((s) => !s.includes('/')),
          // Two segments (missing entityId)
          fc.tuple(
            fc.string({minLength: 1, maxLength: 10}).filter((s) => !s.includes('/')),
            fc.string({minLength: 1, maxLength: 10}).filter((s) => !s.includes('/')),
          ).map(([a, b]) => `${a}/${b}`),
          // Four or more segments
          fc.tuple(
            fc.string({minLength: 1, maxLength: 10}).filter((s) => !s.includes('/')),
            fc.string({minLength: 1, maxLength: 10}).filter((s) => !s.includes('/')),
            fc.string({minLength: 1, maxLength: 10}).filter((s) => !s.includes('/')),
            fc.string({minLength: 1, maxLength: 10}).filter((s) => !s.includes('/')),
          ).map(([a, b, c, d]) => `${a}/${b}/${c}/${d}`),
        ),
        async (malformedAddress) => {
          const router = new MessageRouter({nodeId: 'test-node'});

          let parsed;
          let didThrow = false;
          try {
            parsed = router.parseAddress(malformedAddress);
          } catch (_e) {
            didThrow = true;
          }

          await router.shutdown();

          // Should not throw and should return object with null values for
          // missing components
          if (didThrow) return false;

          // For null/undefined/empty, all should be null
          if (!malformedAddress) {
            return parsed.nodeId === null &&
                   parsed.entityType === null &&
                   parsed.entityId === null;
          }

          // For other malformed, at least returns an object
          return typeof parsed === 'object' && parsed !== null;
        },
      ),
      {numRuns: 10},
    );

    t.pass('parseAddress handles malformed addresses gracefully');
  });

  /**
   * Property: isValidAddress accepts only valid unified addresses.
   *
   * For any address with exactly 3 segments where entityType is one of the
   * valid types, isValidAddress should return true.
   */
  t.test('isValidAddress accepts valid unified addresses', async (t) => {
    await fc.assert(
      fc.asyncProperty(
        // Generate valid address components
        fc.string({minLength: 1, maxLength: 20}).filter((s) => !s.includes('/')),
        fc.constantFrom(...VALID_ENTITY_TYPES),
        fc.string({minLength: 1, maxLength: 30}).filter((s) => !s.includes('/')),
        async (nodeId, entityType, entityId) => {
          const router = new MessageRouter({nodeId: 'test-node'});

          const address = `${nodeId}/${entityType}/${entityId}`;
          const isValid = router.isValidAddress(address);

          await router.shutdown();

          return isValid === true;
        },
      ),
      {numRuns: 10},
    );

    t.pass('isValidAddress accepts valid unified addresses');
  });

  /**
   * Property: isValidAddress rejects addresses with invalid entity types.
   *
   * For any address with an entityType not in the valid list, isValidAddress
   * should return false.
   */
  t.test('isValidAddress rejects invalid entity types', async (t) => {
    await fc.assert(
      fc.asyncProperty(
        // Generate address with invalid entity type
        fc.string({minLength: 1, maxLength: 20}).filter((s) => !s.includes('/')),
        fc.string({minLength: 1, maxLength: 20}).filter(
          (s) => !s.includes('/') && !VALID_ENTITY_TYPES.includes(s),
        ),
        fc.string({minLength: 1, maxLength: 30}).filter((s) => !s.includes('/')),
        async (nodeId, invalidEntityType, entityId) => {
          const router = new MessageRouter({nodeId: 'test-node'});

          const address = `${nodeId}/${invalidEntityType}/${entityId}`;
          const isValid = router.isValidAddress(address);

          await router.shutdown();

          return isValid === false;
        },
      ),
      {numRuns: 10},
    );

    t.pass('isValidAddress rejects invalid entity types');
  });

  /**
   * Property: isValidAddress rejects addresses with wrong segment count.
   *
   * For any address that doesn't have exactly 3 segments, isValidAddress
   * should return false.
   */
  t.test('isValidAddress rejects wrong segment count', async (t) => {
    await fc.assert(
      fc.asyncProperty(
        fc.oneof(
          // Single segment
          fc.string({minLength: 1, maxLength: 20}).filter((s) => !s.includes('/')),
          // Two segments
          fc.tuple(
            fc.string({minLength: 1, maxLength: 10}).filter((s) => !s.includes('/')),
            fc.constantFrom(...VALID_ENTITY_TYPES),
          ).map(([a, b]) => `${a}/${b}`),
          // Four segments
          fc.tuple(
            fc.string({minLength: 1, maxLength: 10}).filter((s) => !s.includes('/')),
            fc.constantFrom(...VALID_ENTITY_TYPES),
            fc.string({minLength: 1, maxLength: 10}).filter((s) => !s.includes('/')),
            fc.string({minLength: 1, maxLength: 10}).filter((s) => !s.includes('/')),
          ).map(([a, b, c, d]) => `${a}/${b}/${c}/${d}`),
        ),
        async (wrongSegmentAddress) => {
          const router = new MessageRouter({nodeId: 'test-node'});

          const isValid = router.isValidAddress(wrongSegmentAddress);

          await router.shutdown();

          return isValid === false;
        },
      ),
      {numRuns: 10},
    );

    t.pass('isValidAddress rejects wrong segment count');
  });

  /**
   * Property: isValidAddress rejects addresses with empty segments.
   *
   * For any address with empty nodeId, entityType, or entityId, isValidAddress
   * should return false.
   */
  t.test('isValidAddress rejects empty segments', async (t) => {
    await fc.assert(
      fc.asyncProperty(
        fc.oneof(
          // Empty nodeId
          fc.tuple(
            fc.constantFrom(...VALID_ENTITY_TYPES),
            fc.string({minLength: 1, maxLength: 20}).filter((s) => !s.includes('/')),
          ).map(([entityType, entityId]) => `/${entityType}/${entityId}`),
          // Empty entityType
          fc.tuple(
            fc.string({minLength: 1, maxLength: 20}).filter((s) => !s.includes('/')),
            fc.string({minLength: 1, maxLength: 20}).filter((s) => !s.includes('/')),
          ).map(([nodeId, entityId]) => `${nodeId}//${entityId}`),
          // Empty entityId
          fc.tuple(
            fc.string({minLength: 1, maxLength: 20}).filter((s) => !s.includes('/')),
            fc.constantFrom(...VALID_ENTITY_TYPES),
          ).map(([nodeId, entityType]) => `${nodeId}/${entityType}/`),
        ),
        async (emptySegmentAddress) => {
          const router = new MessageRouter({nodeId: 'test-node'});

          const isValid = router.isValidAddress(emptySegmentAddress);

          await router.shutdown();

          return isValid === false;
        },
      ),
      {numRuns: 10},
    );

    t.pass('isValidAddress rejects empty segments');
  });

  /**
   * Property: register throws for invalid addresses.
   *
   * For any invalid address, register should throw an error with a
   * descriptive message.
   */
  t.test('register throws for invalid addresses', async (t) => {
    await fc.assert(
      fc.asyncProperty(
        // Generate invalid addresses
        fc.oneof(
          // Single segment (no slashes)
          fc.string({minLength: 1, maxLength: 20}).filter((s) => !s.includes('/')),
          // Invalid entity type
          fc.tuple(
            fc.string({minLength: 1, maxLength: 10}).filter((s) => !s.includes('/')),
            fc.string({minLength: 1, maxLength: 10}).filter(
              (s) => !s.includes('/') && !VALID_ENTITY_TYPES.includes(s),
            ),
            fc.string({minLength: 1, maxLength: 10}).filter((s) => !s.includes('/')),
          ).map(([a, b, c]) => `${a}/${b}/${c}`),
        ),
        async (invalidAddress) => {
          const router = new MessageRouter({nodeId: 'test-node'});
          await router.initialize();

          let threwError = false;
          let errorMessage = '';
          try {
            router.register(invalidAddress, () => ({}));
          } catch (e) {
            threwError = true;
            errorMessage = e.message;
          }

          await router.shutdown();

          // Should throw with descriptive error
          return threwError && errorMessage.includes('Invalid address format');
        },
      ),
      {numRuns: 10},
    );

    t.pass('register throws for invalid addresses');
  });

  /**
   * Property: register accepts valid addresses.
   *
   * For any valid unified address, register should succeed without throwing.
   */
  t.test('register accepts valid addresses', async (t) => {
    await fc.assert(
      fc.asyncProperty(
        // Generate valid address components
        fc.string({minLength: 1, maxLength: 20}).filter((s) => !s.includes('/')),
        fc.constantFrom(...VALID_ENTITY_TYPES),
        fc.string({minLength: 1, maxLength: 30}).filter((s) => !s.includes('/')),
        async (nodeId, entityType, entityId) => {
          const router = new MessageRouter({nodeId: 'test-node'});
          await router.initialize();

          const address = `${nodeId}/${entityType}/${entityId}`;
          let threwError = false;
          try {
            router.register(address, () => ({}));
          } catch (_e) {
            threwError = true;
          }

          const isRegistered = router.isRegistered(address);

          await router.shutdown();

          return !threwError && isRegistered;
        },
      ),
      {numRuns: 10},
    );

    t.pass('register accepts valid addresses');
  });

  /**
   * Property: parseAddress and address construction are inverses.
   *
   * For any valid components, constructing an address and parsing it should
   * return the original components (round-trip property).
   */
  t.test('parseAddress round-trip preserves components', async (t) => {
    await fc.assert(
      fc.asyncProperty(
        // Generate valid address components
        fc.string({minLength: 1, maxLength: 20}).filter((s) => !s.includes('/')),
        fc.constantFrom(...VALID_ENTITY_TYPES),
        fc.string({minLength: 1, maxLength: 30}).filter((s) => !s.includes('/')),
        async (nodeId, entityType, entityId) => {
          const router = new MessageRouter({nodeId: 'test-node'});

          // Construct address
          const address = `${nodeId}/${entityType}/${entityId}`;

          // Parse it back
          const parsed = router.parseAddress(address);

          // Reconstruct from parsed
          const reconstructed =
            `${parsed.nodeId}/${parsed.entityType}/${parsed.entityId}`;

          await router.shutdown();

          // Round-trip should preserve the address
          return address === reconstructed;
        },
      ),
      {numRuns: 10},
    );

    t.pass('parseAddress round-trip preserves components');
  });
});
