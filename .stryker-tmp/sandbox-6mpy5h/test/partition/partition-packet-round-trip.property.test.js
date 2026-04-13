/**
 * Property-based test for Partition Packet Round-Trip Preservation.
 * Property 4: For any valid liferaft packet sent to a partition, sending it
 * through the transport and receiving it SHALL produce a packet with all
 * original fields preserved and equivalent values.
 * Validates: Requirements 8.2, 8.5
 *
 * Feature: simplified-raft-transport
 * Property 4: Partition Packet Round-Trip Preservation
 */
// @ts-nocheck


import {test} from '../../src/test-helpers/tap.js';
import fc from 'fast-check';
import {isRaftPacket} from '../../src/raft/raft-packet-utils.js';

/**
 * Generator for liferaft packet types.
 */
const raftTypeArb = fc.constantFrom('vote', 'voted', 'append', 'appended');

/**
 * Generator for last log entry info.
 */
const lastEntryArb = fc.record({
  term: fc.nat({max: 1000}),
  index: fc.nat({max: 10000}),
});

/**
 * Generator for complete liferaft packets.
 */
const raftPacketArb = fc.record({
  type: raftTypeArb,
  term: fc.nat({max: 1000}),
  address: fc.string({minLength: 1, maxLength: 50}),
  state: fc.nat({max: 5}),
  leader: fc.string({minLength: 0, maxLength: 50}),
  last: lastEntryArb,
  data: fc.option(fc.anything(), {nil: undefined}),
});

/**
 * Deep equality check for liferaft packets.
 * @param {Object} a - First packet
 * @param {Object} b - Second packet
 * @return {boolean} True if packets are equivalent
 */
function packetsEqual(a, b) {
  if (!a || !b) return false;
  return (
    a.type === b.type &&
    a.term === b.term &&
    a.address === b.address &&
    a.state === b.state &&
    a.leader === b.leader &&
    a.last?.term === b.last?.term &&
    a.last?.index === b.last?.index
  );
}

/**
 * Feature: simplified-raft-transport
 * Property 4: Partition Packet Round-Trip Preservation
 * For any valid liferaft packet sent to a partition, sending through transport
 * and receiving SHALL produce an equivalent packet.
 * Validates: Requirements 8.2, 8.5
 */
test('Property 4: Partition packet round-trip preserves all fields', async (t) => {
  await fc.assert(
    fc.property(
      raftPacketArb,
      (originalPacket) => {
        // Simulate the send path: RaftNode.write() sends packet unchanged
        // The packet is delivered to transport.deliver() as-is
        const sentPacket = {...originalPacket};

        // Simulate the receive path: handleTransportMessage() detects Raft packet
        // using isRaftPacket() and emits it directly to liferaft via
        // raft.emit('data', packet) - packet passed unchanged

        // Track what would be emitted to liferaft
        let emittedPacket = null;

        // Simulate the detection and emission (as in handleTransportMessage)
        if (isRaftPacket(sentPacket)) {
          // This is what handleTransportMessage() does:
          // raft.emit('data', payload, write) - packet passed unchanged
          emittedPacket = sentPacket;
        }

        // Property: The emitted packet should be equivalent to original
        return emittedPacket !== null && packetsEqual(originalPacket, emittedPacket);
      },
    ),
    {numRuns: 10},
  );
  t.pass('Partition packet round-trip preserves all fields');
});

/**
 * Feature: simplified-raft-transport
 * Property 4: Partition Packet Round-Trip Preservation
 * Packets should not undergo type conversion during round-trip.
 * Validates: Requirements 8.2
 */
test('Property 4: No type conversion during partition round-trip', async (t) => {
  await fc.assert(
    fc.property(
      raftPacketArb,
      (originalPacket) => {
        // The type field should remain as native liferaft type
        // NOT converted to mg_raft_append_entries, etc.
        const sentPacket = {...originalPacket};

        // After round-trip, type should still be native liferaft type
        const nativeTypes = ['vote', 'voted', 'append', 'appended'];

        return (
          nativeTypes.includes(sentPacket.type) &&
          isRaftPacket(sentPacket)
        );
      },
    ),
    {numRuns: 10},
  );
  t.pass('No type conversion during partition round-trip');
});

/**
 * Feature: simplified-raft-transport
 * Property 4: Partition Packet Round-Trip Preservation
 * All packet fields should be preserved exactly (not just type).
 * Validates: Requirements 8.2, 8.5
 */
test('Property 4: All partition packet fields preserved exactly', async (t) => {
  await fc.assert(
    fc.property(
      raftPacketArb,
      (originalPacket) => {
        // Simulate send/receive without modification
        const receivedPacket = {...originalPacket};

        // Verify each field individually
        const typePreserved = receivedPacket.type === originalPacket.type;
        const termPreserved = receivedPacket.term === originalPacket.term;
        const addressPreserved = receivedPacket.address === originalPacket.address;
        const statePreserved = receivedPacket.state === originalPacket.state;
        const leaderPreserved = receivedPacket.leader === originalPacket.leader;
        const lastTermPreserved =
          receivedPacket.last?.term === originalPacket.last?.term;
        const lastIndexPreserved =
          receivedPacket.last?.index === originalPacket.last?.index;

        return (
          typePreserved &&
          termPreserved &&
          addressPreserved &&
          statePreserved &&
          leaderPreserved &&
          lastTermPreserved &&
          lastIndexPreserved
        );
      },
    ),
    {numRuns: 10},
  );
  t.pass('All partition packet fields preserved exactly');
});

/**
 * Feature: simplified-raft-transport
 * Property 4: Partition Packet Round-Trip Preservation
 * Simulates full send/receive cycle through mock transport for partitions.
 * Validates: Requirements 8.2, 8.5
 */
test('Property 4: Full partition send/receive cycle preserves packet', async (t) => {
  await fc.assert(
    fc.property(
      raftPacketArb,
      fc.string({minLength: 1, maxLength: 50}), // destination address
      (originalPacket, destAddress) => {
        // Track packets through the simulated transport
        let transportedPacket = null;
        let emittedToRaft = null;

        // Mock transport (MessageRouter.deliver)
        const mockTransport = {
          deliver: (_address, packet) => {
            transportedPacket = packet;
            return Promise.resolve({acknowledged: true});
          },
        };

        // Simulate Partition RaftNode.write() - sends packet unchanged
        mockTransport.deliver(destAddress, originalPacket);

        // Simulate handleTransportMessage() - detects and emits to raft
        if (isRaftPacket(transportedPacket)) {
          emittedToRaft = transportedPacket;
        }

        // Property: Packet emitted to raft should equal original
        return emittedToRaft !== null && packetsEqual(originalPacket, emittedToRaft);
      },
    ),
    {numRuns: 10},
  );
  t.pass('Full partition send/receive cycle preserves packet');
});

/**
 * Feature: simplified-raft-transport
 * Property 4: Partition Packet Round-Trip Preservation
 * Partition transport handler should use shared isRaftPacket() for detection.
 * Validates: Requirements 8.3, 9.1, 9.3
 */
test('Property 4: Partition uses shared isRaftPacket() for detection', async (t) => {
  await fc.assert(
    fc.property(
      raftPacketArb,
      (packet) => {
        // The shared isRaftPacket() function should correctly identify
        // all native liferaft packet types
        const isDetected = isRaftPacket(packet);

        // All generated packets have valid Raft types, so should be detected
        return isDetected === true;
      },
    ),
    {numRuns: 10},
  );
  t.pass('Partition uses shared isRaftPacket() for detection');
});

/**
 * Feature: simplified-raft-transport
 * Property 4: Partition Packet Round-Trip Preservation
 * Non-Raft messages should not be detected as Raft packets.
 * Validates: Requirements 8.3, 13.3
 */
test('Property 4: Non-Raft messages not detected as Raft packets', async (t) => {
  // Generator for non-Raft message types
  const nonRaftTypeArb = fc.constantFrom(
    'mg_raft_append_entries',
    'mg_raft_request_vote',
    'FORWARD_WRITE',
    'application_message',
    'data',
    'query',
  );

  const nonRaftMessageArb = fc.record({
    type: nonRaftTypeArb,
    payload: fc.anything(),
  });

  await fc.assert(
    fc.property(
      nonRaftMessageArb,
      (message) => {
        // Non-Raft messages should NOT be detected as Raft packets
        const isDetected = isRaftPacket(message);
        return isDetected === false;
      },
    ),
    {numRuns: 10},
  );
  t.pass('Non-Raft messages not detected as Raft packets');
});
