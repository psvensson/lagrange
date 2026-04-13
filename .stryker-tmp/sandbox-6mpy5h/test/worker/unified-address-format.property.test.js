/**
 * Property Test: Unified Address Format Compliance
 * **Property 14: Unified Address Format Compliance**
 * **Validates: Requirements 7.4**
 *
 * Feature: worker-process-replica-isolation, Property 14: Unified Address Format Compliance
 *
 * *For any* address used in worker process message routing, the address SHALL
 * conform to the unified format (nodeId/entityType/replicaId).
 *
 * This property test verifies:
 * 1. For any nodeId, entityType, and replicaId, WORKER_ADDRESS.build() SHALL
 *    produce an address with exactly 3 parts separated by '/'
 * 2. For any built address, splitting by '/' SHALL return the original
 *    components in order
 * 3. For any built address, the entityType part SHALL be either 'partition'
 *    or 'message-group'
 * 4. For any built address, the address SHALL be parseable back to its
 *    original components
 */
// @ts-nocheck


import {test} from '../../src/test-helpers/tap.js';
import fc from 'fast-check';
import {
  WORKER_ADDRESS,
  WORKER_ENTITY_TYPE,
} from '../../src/worker/worker-constants.js';

/**
 * Generator for valid node IDs.
 * Node IDs are alphanumeric strings with hyphens allowed.
 */
const nodeIdArb = fc.string({minLength: 1, maxLength: 20}).filter((s) => {
  // Filter out strings containing the separator to avoid ambiguity
  return s.length > 0 && !s.includes(WORKER_ADDRESS.SEPARATOR);
});

/**
 * Generator for entity types.
 * Only valid entity types are 'partition' and 'message-group'.
 */
const entityTypeArb = fc.constantFrom(
  WORKER_ENTITY_TYPE.PARTITION,
  WORKER_ENTITY_TYPE.MESSAGE_GROUP,
);

/**
 * Generator for replica IDs.
 * Replica IDs are alphanumeric strings.
 */
const replicaIdArb = fc.string({minLength: 1, maxLength: 20}).filter((s) => {
  // Filter out strings containing the separator to avoid ambiguity
  return s.length > 0 && !s.includes(WORKER_ADDRESS.SEPARATOR);
});

/**
 * Generator for complete address components.
 */
const addressComponentsArb = fc.record({
  nodeId: nodeIdArb,
  entityType: entityTypeArb,
  replicaId: replicaIdArb,
});

/**
 * Helper to parse a unified address back to its components.
 * @param {string} address - The unified address to parse
 * @return {Object} The parsed components {nodeId, entityType, replicaId}
 */
function parseUnifiedAddress(address) {
  const parts = address.split(WORKER_ADDRESS.SEPARATOR);
  return {
    nodeId: parts[0],
    entityType: parts[1],
    replicaId: parts[2],
    partCount: parts.length,
  };
}

test('Property 14: Unified Address Format Compliance', async (t) => {
  /**
   * Property: For any nodeId, entityType, and replicaId, WORKER_ADDRESS.build()
   * SHALL produce an address with exactly 3 parts separated by '/'.
   *
   * This validates Requirement 7.4: THE Worker_Process SHALL use the unified
   * address format (nodeId/entityType/replicaId) for all message routing.
   */
  t.test('build() produces address with exactly 3 parts', async (t) => {
    await fc.assert(
      fc.asyncProperty(
        addressComponentsArb,
        async (components) => {
          const address = WORKER_ADDRESS.build(
            components.nodeId,
            components.entityType,
            components.replicaId,
          );

          const parts = address.split(WORKER_ADDRESS.SEPARATOR);

          // Verify exactly 3 parts
          return parts.length === 3;
        },
      ),
      {numRuns: 10},
    );

    t.pass('build() produces address with exactly 3 parts');
  });

  /**
   * Property: For any built address, splitting by '/' SHALL return the
   * original components in order.
   *
   * This validates that the address format is reversible and preserves
   * the original component values.
   */
  t.test('splitting address returns original components in order',
    async (t) => {
      await fc.assert(
        fc.asyncProperty(
          addressComponentsArb,
          async (components) => {
            const address = WORKER_ADDRESS.build(
              components.nodeId,
              components.entityType,
              components.replicaId,
            );

            const parts = address.split(WORKER_ADDRESS.SEPARATOR);

            // Verify components are in correct order
            const nodeIdMatches = parts[0] === components.nodeId;
            const entityTypeMatches = parts[1] === components.entityType;
            const replicaIdMatches = parts[2] === components.replicaId;

            return nodeIdMatches && entityTypeMatches && replicaIdMatches;
          },
        ),
        {numRuns: 10},
      );

      t.pass('splitting address returns original components in order');
    });

  /**
   * Property: For any built address, the entityType part SHALL be either
   * 'partition' or 'message-group'.
   *
   * This validates that only valid entity types are used in addresses.
   */
  t.test('entityType part is valid entity type', async (t) => {
    await fc.assert(
      fc.asyncProperty(
        addressComponentsArb,
        async (components) => {
          const address = WORKER_ADDRESS.build(
            components.nodeId,
            components.entityType,
            components.replicaId,
          );

          const parsed = parseUnifiedAddress(address);

          // Verify entityType is one of the valid types
          const isValidEntityType =
            parsed.entityType === WORKER_ENTITY_TYPE.PARTITION ||
            parsed.entityType === WORKER_ENTITY_TYPE.MESSAGE_GROUP;

          return isValidEntityType;
        },
      ),
      {numRuns: 10},
    );

    t.pass('entityType part is valid entity type');
  });

  /**
   * Property: For any built address, the address SHALL be parseable back
   * to its original components.
   *
   * This validates the round-trip property: build -> parse -> original values.
   */
  t.test('address is parseable back to original components', async (t) => {
    await fc.assert(
      fc.asyncProperty(
        addressComponentsArb,
        async (components) => {
          const address = WORKER_ADDRESS.build(
            components.nodeId,
            components.entityType,
            components.replicaId,
          );

          const parsed = parseUnifiedAddress(address);

          // Verify round-trip preserves all components
          const nodeIdPreserved = parsed.nodeId === components.nodeId;
          const entityTypePreserved =
            parsed.entityType === components.entityType;
          const replicaIdPreserved = parsed.replicaId === components.replicaId;
          const correctPartCount = parsed.partCount === 3;

          return nodeIdPreserved && entityTypePreserved &&
                 replicaIdPreserved && correctPartCount;
        },
      ),
      {numRuns: 10},
    );

    t.pass('address is parseable back to original components');
  });

  /**
   * Property: The WORKER_ADDRESS.SEPARATOR constant SHALL be '/'.
   *
   * This validates the separator is the expected value for unified addresses.
   */
  t.test('SEPARATOR constant is forward slash', async (t) => {
    const expectedSeparator = '/';
    const actualSeparator = WORKER_ADDRESS.SEPARATOR;

    t.equal(
      actualSeparator,
      expectedSeparator,
      'SEPARATOR should be forward slash',
    );
  });

  /**
   * Property: For any address components, the built address SHALL contain
   * exactly 2 separator characters.
   *
   * This validates the structure of the unified address format.
   */
  t.test('built address contains exactly 2 separators', async (t) => {
    await fc.assert(
      fc.asyncProperty(
        addressComponentsArb,
        async (components) => {
          const address = WORKER_ADDRESS.build(
            components.nodeId,
            components.entityType,
            components.replicaId,
          );

          // Count separator occurrences
          const separatorCount = (
            address.match(new RegExp(WORKER_ADDRESS.SEPARATOR, 'g')) || []
          ).length;

          return separatorCount === 2;
        },
      ),
      {numRuns: 10},
    );

    t.pass('built address contains exactly 2 separators');
  });

  /**
   * Property: For any address components, the built address SHALL be
   * a non-empty string.
   *
   * This validates that build() always produces a valid string output.
   */
  t.test('built address is non-empty string', async (t) => {
    await fc.assert(
      fc.asyncProperty(
        addressComponentsArb,
        async (components) => {
          const address = WORKER_ADDRESS.build(
            components.nodeId,
            components.entityType,
            components.replicaId,
          );

          const isString = typeof address === 'string';
          const isNonEmpty = address.length > 0;

          return isString && isNonEmpty;
        },
      ),
      {numRuns: 10},
    );

    t.pass('built address is non-empty string');
  });

  /**
   * Property: For any two different address component sets, the built
   * addresses SHALL be different (uniqueness).
   *
   * This validates that different inputs produce different addresses.
   */
  t.test('different components produce different addresses', async (t) => {
    await fc.assert(
      fc.asyncProperty(
        addressComponentsArb,
        addressComponentsArb,
        async (components1, components2) => {
          // Skip if components are identical
          const sameNodeId = components1.nodeId === components2.nodeId;
          const sameEntityType =
            components1.entityType === components2.entityType;
          const sameReplicaId = components1.replicaId === components2.replicaId;

          if (sameNodeId && sameEntityType && sameReplicaId) {
            // Same components should produce same address
            const address1 = WORKER_ADDRESS.build(
              components1.nodeId,
              components1.entityType,
              components1.replicaId,
            );
            const address2 = WORKER_ADDRESS.build(
              components2.nodeId,
              components2.entityType,
              components2.replicaId,
            );
            return address1 === address2;
          }

          // Different components should produce different addresses
          const address1 = WORKER_ADDRESS.build(
            components1.nodeId,
            components1.entityType,
            components1.replicaId,
          );
          const address2 = WORKER_ADDRESS.build(
            components2.nodeId,
            components2.entityType,
            components2.replicaId,
          );

          return address1 !== address2;
        },
      ),
      {numRuns: 10},
    );

    t.pass('different components produce different addresses');
  });

  /**
   * Property: For partition entity type, the address SHALL contain
   * 'partition' as the second component.
   *
   * This validates partition addresses specifically.
   */
  t.test('partition addresses contain partition entity type', async (t) => {
    await fc.assert(
      fc.asyncProperty(
        nodeIdArb,
        replicaIdArb,
        async (nodeId, replicaId) => {
          const address = WORKER_ADDRESS.build(
            nodeId,
            WORKER_ENTITY_TYPE.PARTITION,
            replicaId,
          );

          const parsed = parseUnifiedAddress(address);

          return parsed.entityType === WORKER_ENTITY_TYPE.PARTITION;
        },
      ),
      {numRuns: 10},
    );

    t.pass('partition addresses contain partition entity type');
  });

  /**
   * Property: For message-group entity type, the address SHALL contain
   * 'message-group' as the second component.
   *
   * This validates message-group addresses specifically.
   */
  t.test('message-group addresses contain message-group entity type',
    async (t) => {
      await fc.assert(
        fc.asyncProperty(
          nodeIdArb,
          replicaIdArb,
          async (nodeId, replicaId) => {
            const address = WORKER_ADDRESS.build(
              nodeId,
              WORKER_ENTITY_TYPE.MESSAGE_GROUP,
              replicaId,
            );

            const parsed = parseUnifiedAddress(address);

            return parsed.entityType === WORKER_ENTITY_TYPE.MESSAGE_GROUP;
          },
        ),
        {numRuns: 10},
      );

      t.pass('message-group addresses contain message-group entity type');
    });
});
