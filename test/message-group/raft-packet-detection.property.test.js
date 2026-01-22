/**
 * Property-based test for Raft Packet Detection.
 * Property 2: For any message payload, the system SHALL correctly classify it
 * as a Raft packet if and only if it has a `type` field with value 'vote',
 * 'voted', 'append', or 'appended'.
 * Validates: Requirements 2.1, 2.2, 2.3, 2.4
 */

import {test} from 'tap';
import fc from 'fast-check';
import {
  isRaftPacket,
  RAFT_PACKET_TYPES,
} from '../../src/message-group/message-group-service.js';

/**
 * Feature: simplified-raft-transport
 * Property 2: Raft Packet Detection
 * For any payload with a valid Raft type, isRaftPacket SHALL return true.
 * Validates: Requirements 2.1, 2.4
 */
test('Property 2: Valid Raft packets are correctly detected', async (t) => {
  await fc.assert(
    fc.property(
      fc.constantFrom('vote', 'voted', 'append', 'appended'),
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

        // Property: Valid Raft packet types should be detected
        return isRaftPacket(packet) === true;
      },
    ),
    {numRuns: 10},
  );
  t.pass('Valid Raft packets correctly detected');
});

/**
 * Feature: simplified-raft-transport
 * Property 2: Raft Packet Detection
 * For any payload without a valid Raft type, isRaftPacket SHALL return false.
 * Validates: Requirements 2.3, 2.4
 */
test('Property 2: Non-Raft payloads are correctly rejected', async (t) => {
  // Generate strings that are NOT valid Raft types
  const nonRaftType = fc.string().filter((s) => !RAFT_PACKET_TYPES.has(s));

  await fc.assert(
    fc.property(
      nonRaftType,
      fc.anything(),
      (type, data) => {
        const payload = {type, data};

        // Property: Non-Raft types should not be detected as Raft packets
        return isRaftPacket(payload) === false;
      },
    ),
    {numRuns: 10},
  );
  t.pass('Non-Raft payloads correctly rejected');
});

/**
 * Feature: simplified-raft-transport
 * Property 2: Raft Packet Detection
 * Payloads without a type field should not be detected as Raft packets.
 * Validates: Requirements 2.3, 2.4
 */
test('Property 2: Payloads without type field are rejected', async (t) => {
  await fc.assert(
    fc.property(
      fc.record({
        term: fc.integer(),
        address: fc.string(),
        data: fc.anything(),
      }),
      (payload) => {
        // Property: Payloads without type field should not be Raft packets
        return isRaftPacket(payload) === false;
      },
    ),
    {numRuns: 10},
  );
  t.pass('Payloads without type field correctly rejected');
});

/**
 * Feature: simplified-raft-transport
 * Property 2: Raft Packet Detection
 * Null, undefined, and non-object payloads should not be detected as Raft packets.
 * Validates: Requirements 2.3, 2.4
 */
test('Property 2: Null/undefined/primitive payloads are rejected', async (t) => {
  await fc.assert(
    fc.property(
      fc.constantFrom(null, undefined, 42, 'string', true, false),
      (payload) => {
        // Property: Non-object payloads should not be Raft packets
        return isRaftPacket(payload) === false;
      },
    ),
    {numRuns: 10},
  );
  t.pass('Null/undefined/primitive payloads correctly rejected');
});

/**
 * Feature: simplified-raft-transport
 * Property 2: Raft Packet Detection
 * Payloads with non-string type field should not be detected as Raft packets.
 * Validates: Requirements 2.4
 */
test('Property 2: Payloads with non-string type are rejected', async (t) => {
  await fc.assert(
    fc.property(
      fc.constantFrom(1, true, null, undefined, {}, [], 123.45),
      fc.anything(),
      (type, data) => {
        const payload = {type, data};

        // Property: Non-string type fields should not match Raft packets
        return isRaftPacket(payload) === false;
      },
    ),
    {numRuns: 10},
  );
  t.pass('Payloads with non-string type correctly rejected');
});
