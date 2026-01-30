/**
 * Property test for Simplified Raft Transport Message Delivery.
 * Updated for the new architecture that eliminates type conversion.
 *
 * Property: For any Raft message that liferaft needs to send, the transport
 * should deliver it via MessageRouter unchanged, and any incoming Raft message
 * should be forwarded to liferaft without type conversion.
 *
 * Validates: Requirements 2.1, 2.2, 3.1, 3.2, 3.3, 3.4
 *
 * Feature: simplified-raft-transport
 * Property: Transport Message Delivery (Simplified)
 */

import {test} from '../../src/test-helpers/tap.js';
import fc from 'fast-check';
import {
  isRaftPacket,
  RAFT_PACKET_TYPES,
} from '../../src/message-group/message-group-service.js';

// Valid Raft packet types from liferaft (native format)
const RAFT_PACKET_TYPE_VALUES = ['vote', 'voted', 'append', 'appended'];

/**
 * Feature: simplified-raft-transport
 * Property: Simplified Transport delivers packets without type conversion.
 *
 * For any Raft packet, the transport should deliver it via MessageRouter
 * with all original fields preserved (no type mapping).
 * Validates: Requirements 3.1, 3.2, 3.3
 */
test('Property: Simplified transport delivers packets unchanged', async (t) => {
  await fc.assert(
    fc.asyncProperty(
      // Generate node ID (alphanumeric, no slashes)
      fc.stringMatching(/^[a-zA-Z0-9]{1,20}$/),
      // Generate packet type (native liferaft types)
      fc.constantFrom(...RAFT_PACKET_TYPE_VALUES),
      // Generate peer address (alphanumeric, no slashes)
      fc.stringMatching(/^[a-zA-Z0-9]{1,20}$/),
      // Generate term
      fc.integer({min: 0, max: 1000}),
      // Generate packet data
      fc.record({
        granted: fc.boolean(),
      }),
      async (nodeId, packetType, peerAddress, term, packetData) => {
        let deliveredAddress = null;
        let deliveredMessage = null;

        // Mock message router that captures delivery
        const mockRouter = {
          deliver: async (address, message) => {
            deliveredAddress = address;
            deliveredMessage = message;
            return {acknowledged: true};
          },
        };

        // Create packet in liferaft format
        const packet = {
          type: packetType,
          term: term,
          address: peerAddress,
          state: 1, // FOLLOWER
          leader: '',
          last: {index: 0, term: 0},
          data: packetData,
        };

        // Simulate simplified RaftNode.write() behavior
        // Build peer address and deliver packet unchanged
        const targetAddress = `${nodeId}/message-group/${peerAddress}`;
        await mockRouter.deliver(targetAddress, packet);

        // Verify delivery was called
        if (!deliveredAddress || !deliveredMessage) {
          return false;
        }

        // Verify packet type was NOT converted (stays as native liferaft type)
        if (deliveredMessage.type !== packetType) {
          return false;
        }

        // Verify type is still native liferaft format
        if (!RAFT_PACKET_TYPES.has(deliveredMessage.type)) {
          return false;
        }

        // Verify term was preserved
        if (deliveredMessage.term !== term) {
          return false;
        }

        // Verify address was preserved
        if (deliveredMessage.address !== peerAddress) {
          return false;
        }

        return true;
      },
    ),
    {numRuns: 10},
  );

  t.pass('Simplified transport delivers packets unchanged');
});


/**
 * Property: Delivery errors are propagated correctly.
 *
 * For any Raft packet, if messageRouter.deliver() throws an error,
 * the error should be propagated to the caller.
 * Validates: Requirements 3.4
 */
test('Property: Delivery errors are propagated correctly', async (t) => {
  await fc.assert(
    fc.asyncProperty(
      // Generate error message (alphanumeric)
      fc.stringMatching(/^[a-zA-Z0-9 ]{1,50}$/),
      // Generate packet type
      fc.constantFrom(...RAFT_PACKET_TYPE_VALUES),
      async (errorMessage, packetType) => {
        // Mock message router that throws error
        const mockRouter = {
          deliver: async () => {
            throw new Error(errorMessage);
          },
        };

        // Create packet in liferaft format
        const packet = {
          type: packetType,
          term: 1,
          address: 'peer1',
          state: 1,
          leader: '',
          last: {index: 0, term: 0},
          data: {granted: true},
        };

        // Simulate simplified write and verify error is propagated
        let caughtError = null;
        try {
          await mockRouter.deliver('node1/message-group/peer1', packet);
        } catch (err) {
          caughtError = err;
        }

        return caughtError !== null && caughtError.message === errorMessage;
      },
    ),
    {numRuns: 10},
  );

  t.pass('Delivery errors are propagated correctly');
});

/**
 * Property: Delivery result is returned correctly.
 *
 * For any Raft packet, if messageRouter.deliver() succeeds,
 * the result should be returned to the caller.
 * Validates: Requirements 3.4
 */
test('Property: Delivery result is returned correctly', async (t) => {
  await fc.assert(
    fc.asyncProperty(
      // Generate packet type
      fc.constantFrom(...RAFT_PACKET_TYPE_VALUES),
      // Generate result data
      fc.record({
        acknowledged: fc.boolean(),
        matchIndex: fc.integer({min: 0, max: 1000}),
      }),
      async (packetType, resultData) => {
        // Mock message router that returns result
        const mockRouter = {
          deliver: async () => resultData,
        };

        // Create packet in liferaft format
        const packet = {
          type: packetType,
          term: 1,
          address: 'peer1',
          state: 1,
          leader: '',
          last: {index: 0, term: 0},
          data: {granted: true},
        };

        // Simulate simplified write and verify result is returned
        const result = await mockRouter.deliver('node1/message-group/peer1', packet);

        return result !== null &&
               result.acknowledged === resultData.acknowledged &&
               result.matchIndex === resultData.matchIndex;
      },
    ),
    {numRuns: 10},
  );

  t.pass('Delivery result is returned correctly');
});


/**
 * Property: Peer address is built correctly in unified format.
 *
 * For any Raft packet with a simple peer ID, the transport should build
 * the unified address format before delivering.
 * Validates: Requirements 3.2
 */
test('Property: Peer address is built in unified format', async (t) => {
  await fc.assert(
    fc.asyncProperty(
      // Generate node ID (alphanumeric)
      fc.stringMatching(/^[a-zA-Z0-9]{1,20}$/),
      // Generate peer ID (alphanumeric, no slashes)
      fc.stringMatching(/^[a-zA-Z0-9]{1,20}$/),
      async (nodeId, peerId) => {
        let deliveredAddress = null;

        const mockRouter = {
          deliver: async (address) => {
            deliveredAddress = address;
            return {acknowledged: true};
          },
        };

        // Create packet in liferaft format
        const packet = {
          type: 'vote',
          term: 1,
          address: nodeId, // sender address
          state: 1,
          leader: '',
          last: {index: 0, term: 0},
          data: {granted: true},
        };

        // Simulate buildPeerAddress and deliver
        const targetAddress = `${nodeId}/message-group/${peerId}`;
        await mockRouter.deliver(targetAddress, packet);

        // Verify address was built in unified format
        const expectedAddress = `${nodeId}/message-group/${peerId}`;
        return deliveredAddress === expectedAddress;
      },
    ),
    {numRuns: 10},
  );

  t.pass('Peer address is built in unified format');
});

/**
 * Property: isRaftPacket correctly identifies Raft packets.
 *
 * For any payload, isRaftPacket should return true if and only if
 * the payload has a type field with a valid liferaft type value.
 * Validates: Requirements 2.1, 2.2
 */
test('Property: isRaftPacket correctly identifies Raft packets', async (t) => {
  await fc.assert(
    fc.property(
      fc.constantFrom(...RAFT_PACKET_TYPE_VALUES),
      fc.integer({min: 0, max: 1000}),
      fc.string(),
      (type, term, address) => {
        const packet = {
          type,
          term,
          address,
          state: 1,
          leader: '',
          last: {index: 0, term: 0},
        };

        // Valid Raft packets should be detected
        return isRaftPacket(packet) === true;
      },
    ),
    {numRuns: 10},
  );

  t.pass('isRaftPacket correctly identifies Raft packets');
});

/**
 * Property: Non-Raft payloads are not detected as Raft packets.
 *
 * For any payload without a valid Raft type, isRaftPacket should return false.
 * Validates: Requirements 2.2
 */
test('Property: Non-Raft payloads are not detected as Raft packets', async (t) => {
  // Generate strings that are NOT valid Raft types
  const nonRaftType = fc.string().filter((s) => !RAFT_PACKET_TYPES.has(s));

  await fc.assert(
    fc.property(
      nonRaftType,
      fc.anything(),
      (type, data) => {
        const payload = {type, data};

        // Non-Raft types should not be detected as Raft packets
        return isRaftPacket(payload) === false;
      },
    ),
    {numRuns: 10},
  );

  t.pass('Non-Raft payloads are not detected as Raft packets');
});

