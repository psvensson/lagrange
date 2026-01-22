/**
 * Property-based test for Shared Raft Detection Consistency.
 * Property 5: For any message payload, the shared isRaftPacket() function
 * SHALL produce the same result when called from MessageGroupService or
 * directly from the shared module.
 * Validates: Requirements 9.1, 9.2, 9.3
 */

import {test} from 'tap';
import fc from 'fast-check';
import {
  isRaftPacket as sharedIsRaftPacket,
  RAFT_PACKET_TYPES as sharedRaftPacketTypes,
} from '../../src/raft/raft-packet-utils.js';
import {
  isRaftPacket as serviceIsRaftPacket,
  RAFT_PACKET_TYPES as serviceRaftPacketTypes,
} from '../../src/message-group/message-group-service.js';

/**
 * Feature: simplified-raft-transport
 * Property 5: Shared Raft Detection Consistency
 * The RAFT_PACKET_TYPES constant SHALL be identical between shared module
 * and MessageGroupService re-export.
 * Validates: Requirements 9.2
 */
test('Property 5: RAFT_PACKET_TYPES is identical between modules', async (t) => {
  // Verify both sets have the same size
  t.equal(
    sharedRaftPacketTypes.size,
    serviceRaftPacketTypes.size,
    'RAFT_PACKET_TYPES sets have same size',
  );

  // Verify all types in shared module are in service module
  for (const type of sharedRaftPacketTypes) {
    t.ok(
      serviceRaftPacketTypes.has(type),
      `Type '${type}' exists in both modules`,
    );
  }

  // Verify all types in service module are in shared module
  for (const type of serviceRaftPacketTypes) {
    t.ok(
      sharedRaftPacketTypes.has(type),
      `Type '${type}' exists in both modules`,
    );
  }

  t.pass('RAFT_PACKET_TYPES is identical between modules');
});

/**
 * Feature: simplified-raft-transport
 * Property 5: Shared Raft Detection Consistency
 * For any valid Raft packet, isRaftPacket() SHALL return true from both
 * the shared module and MessageGroupService.
 * Validates: Requirements 9.1, 9.3
 */
test('Property 5: Valid Raft packets detected consistently', async (t) => {
  fc.assert(
    fc.property(
      fc.constantFrom('vote', 'voted', 'append', 'appended', 'error'),
      fc.integer(),
      fc.string(),
      (type, term, address) => {
        const packet = {
          type,
          term,
          address,
          state: 1,
          leader: 'leader-1',
          last: {term: 0, index: 0},
        };

        const sharedResult = sharedIsRaftPacket(packet);
        const serviceResult = serviceIsRaftPacket(packet);

        // Property: Both functions should return the same result
        return sharedResult === serviceResult && sharedResult === true;
      },
    ),
    {numRuns: 10},
  );
  t.pass('Valid Raft packets detected consistently across modules');
});

/**
 * Feature: simplified-raft-transport
 * Property 5: Shared Raft Detection Consistency
 * For any non-Raft payload, isRaftPacket() SHALL return false from both
 * the shared module and MessageGroupService.
 * Validates: Requirements 9.1, 9.3
 */
test('Property 5: Non-Raft payloads rejected consistently', async (t) => {
  // Generate strings that are NOT valid Raft types
  const nonRaftType = fc.string().filter((s) => !sharedRaftPacketTypes.has(s));

  fc.assert(
    fc.property(
      nonRaftType,
      fc.anything(),
      (type, data) => {
        const payload = {type, data};

        const sharedResult = sharedIsRaftPacket(payload);
        const serviceResult = serviceIsRaftPacket(payload);

        // Property: Both functions should return the same result (false)
        return sharedResult === serviceResult && sharedResult === false;
      },
    ),
    {numRuns: 10},
  );
  t.pass('Non-Raft payloads rejected consistently across modules');
});

/**
 * Feature: simplified-raft-transport
 * Property 5: Shared Raft Detection Consistency
 * For any arbitrary payload (including edge cases), isRaftPacket() SHALL
 * produce identical results from both modules.
 * Validates: Requirements 9.1, 9.3
 */
test('Property 5: Arbitrary payloads handled consistently', async (t) => {
  fc.assert(
    fc.property(
      fc.anything(),
      (payload) => {
        const sharedResult = sharedIsRaftPacket(payload);
        const serviceResult = serviceIsRaftPacket(payload);

        // Property: Both functions should always return the same result
        return sharedResult === serviceResult;
      },
    ),
    {numRuns: 10},
  );
  t.pass('Arbitrary payloads handled consistently across modules');
});

/**
 * Feature: simplified-raft-transport
 * Property 5: Shared Raft Detection Consistency
 * The functions should be referentially equal (same function reference).
 * Validates: Requirements 9.1
 */
test('Property 5: Functions are referentially equal', async (t) => {
  // Since MessageGroupService re-exports from the shared module,
  // the functions should be the exact same reference
  t.equal(
    sharedIsRaftPacket,
    serviceIsRaftPacket,
    'isRaftPacket is the same function reference',
  );
  t.equal(
    sharedRaftPacketTypes,
    serviceRaftPacketTypes,
    'RAFT_PACKET_TYPES is the same Set reference',
  );
  t.pass('Functions are referentially equal');
});
