/**
 * Property test for Raft Packet Round-Trip Preservation.
 *
 * Property: For any valid Raft packet with fields (type, term, address,
 * state, leader, last, data), delivering through PartitionRaftNode.write()
 * and receiving on the other end SHALL preserve all packet fields exactly.
 *
 * Tests through PartitionRaftNode (the sole Raft transport mechanism)
 * instead of the removed RaftTransportAdapter.
 *
 * **Validates: Requirements 5.3**
 *
 * Feature: transport-architecture-improvements
 * Property: Raft Packet Round-Trip Preservation via PartitionRaftNode
 */
// @ts-nocheck


import {test} from '../../src/test-helpers/tap.js';
import fc from 'fast-check';
import {
  createPartitionRaftNodeClass,
} from '../../src/partition/partition-raft-node.js';
import {
  RAFT_PACKET_TYPE,
  resolveRaftTransportDeliveryOptions,
} from '../../src/raft/constants.js';
import {ENTITY_TYPE} from '../../src/constants/index.js';

// Valid Raft packet types from liferaft
const VALID_RAFT_PACKET_TYPES = [
  RAFT_PACKET_TYPE.VOTE,
  RAFT_PACKET_TYPE.VOTED,
  RAFT_PACKET_TYPE.APPEND,
  RAFT_PACKET_TYPE.APPENDED,
  RAFT_PACKET_TYPE.APPEND_FAIL,
  RAFT_PACKET_TYPE.APPEND_ACK,
];

/**
 * Arbitrary for generating valid node IDs (alphanumeric, 1-20 chars).
 */
const nodeIdArb = fc.stringMatching(/^[a-zA-Z][a-zA-Z0-9]{0,19}$/);

/**
 * Arbitrary for generating valid entity IDs (alphanumeric with hyphens).
 */
const entityIdArb = fc.stringMatching(/^[a-zA-Z][a-zA-Z0-9-]{0,19}$/);

/**
 * Arbitrary for generating valid Raft packet types.
 */
const packetTypeArb = fc.constantFrom(...VALID_RAFT_PACKET_TYPES);

/**
 * Arbitrary for generating valid Raft terms (non-negative integers).
 */
const termArb = fc.integer({min: 0, max: 10000});

/**
 * Arbitrary for generating valid Raft state values.
 */
const stateArb = fc.integer({min: 0, max: 3});

/**
 * Arbitrary for generating valid log index/term pairs.
 */
const lastArb = fc.record({
  index: fc.integer({min: 0, max: 10000}),
  term: fc.integer({min: 0, max: 10000}),
});

/**
 * Arbitrary for generating valid Raft packet data.
 */
const dataArb = fc.oneof(
  fc.constant(null),
  fc.record({granted: fc.boolean()}),
  fc.record({
    entries: fc.array(
      fc.record({cmd: fc.string({minLength: 0, maxLength: 50})}),
      {minLength: 0, maxLength: 5},
    ),
  }),
);

/**
 * Arbitrary for generating a complete valid Raft packet context.
 */
const raftPacketArb = fc.record({
  type: packetTypeArb,
  term: termArb,
  senderNodeId: nodeIdArb,
  senderEntityId: entityIdArb,
  destNodeId: nodeIdArb,
  destEntityId: entityIdArb,
  state: stateArb,
  leader: fc.option(entityIdArb, {nil: null}),
  last: lastArb,
  data: dataArb,
});

/**
 * Property: Raft packet round-trip preserves all fields via PartitionRaftNode.
 *
 * For any valid Raft packet, delivering through PartitionRaftNode.write()
 * SHALL preserve all packet fields exactly. The packet is passed unchanged
 * to transport.deliver() — no type conversion occurs.
 *
 * **Validates: Requirements 5.3**
 */
test('Property: Raft packet round-trip preserves all fields via PartitionRaftNode',
  async (t) => {
    await fc.assert(
      fc.asyncProperty(
        raftPacketArb,
        async (packetData) => {
          let receivedPayload = null;
          let receivedAddress = null;
          let receivedOptions = null;

          const entityType = ENTITY_TYPE.PARTITION;

          // Build unified addresses
          const senderAddress =
          `${packetData.senderNodeId}/${entityType}/${packetData.senderEntityId}`;
          const destAddress =
          `${packetData.destNodeId}/${entityType}/${packetData.destEntityId}`;

          // Mock transport that captures the delivered message
          const mockTransport = {
            deliver: async (address, payload, options) => {
              receivedAddress = address;
              receivedPayload = payload;
              receivedOptions = options;
              return {acknowledged: true};
            },
          };

          // buildPeerAddress returns the address as-is (already unified)
          const buildPeerAddress = (peerId) => peerId;

          // Silent logger
          const logger = {
            debug: () => {},
            info: () => {},
            error: () => {},
          };

          // Create the PartitionRaftNode class via factory
          const PartitionRaftNode = createPartitionRaftNodeClass({
            transport: mockTransport,
            buildPeerAddress,
            logger,
            deferElection: true,
            replicaId: packetData.senderEntityId,
            partitionId: 'test-partition',
          });

          // Create a peer node instance — liferaft calls write() on
          // the peer node, where this.address is the destination
          const peerNode = new PartitionRaftNode(destAddress, {
            'heartbeat': 30000,
            'election min': 30000,
            'election max': 60000,
          });

          // Build the original packet as liferaft would
          const originalPacket = {
            type: packetData.type,
            term: packetData.term,
            address: senderAddress,
            state: packetData.state,
            leader: packetData.leader,
            last: packetData.last,
            data: packetData.data,
          };

          // Deliver the packet through PartitionRaftNode.write()
          await new Promise((resolve, reject) => {
            peerNode.write(originalPacket, (err, result) => {
              if (err) reject(err);
              else resolve(result);
            });
          });

          // Clean up liferaft timers
          if (peerNode.timers) {
            peerNode.timers.clear();
          }
          peerNode.end();

          // Verify the message was delivered
          if (!receivedPayload || !receivedAddress) return false;

          // Verify destination address is preserved
          if (receivedAddress !== destAddress) return false;

          if (JSON.stringify(receivedOptions) !== JSON.stringify(
            resolveRaftTransportDeliveryOptions(originalPacket),
          )) {
            return false;
          }

          // Verify packet type is NOT converted — PartitionRaftNode
          // passes packets unchanged (unlike the removed adapter)
          if (receivedPayload.type !== packetData.type) return false;

          // Verify term is preserved exactly
          if (receivedPayload.term !== packetData.term) return false;

          // Verify sender address is preserved exactly
          if (receivedPayload.address !== senderAddress) return false;

          // Verify state is preserved exactly
          if (receivedPayload.state !== packetData.state) return false;

          // Verify leader is preserved exactly
          if (receivedPayload.leader !== packetData.leader) return false;

          // Verify last (log index/term) is preserved exactly
          if (receivedPayload.last.index !== packetData.last.index ||
            receivedPayload.last.term !== packetData.last.term) {
            return false;
          }

          // Verify data is preserved exactly (deep equality)
          if (JSON.stringify(receivedPayload.data) !==
            JSON.stringify(packetData.data)) {
            return false;
          }

          return true;
        },
      ),
      {numRuns: 10},
    );

    t.pass('Raft packet round-trip preserves all fields via PartitionRaftNode');
  });

/**
 * Property: PartitionRaftNode.write() does NOT convert packet types.
 *
 * Unlike the removed RaftTransportAdapter which mapped liferaft types
 * to RAFT_* message types, PartitionRaftNode passes packets unchanged.
 * This verifies the sole remaining transport mechanism preserves types.
 *
 * **Validates: Requirements 5.3**
 */
test('Property: PartitionRaftNode.write() preserves packet type unchanged',
  async (t) => {
    await fc.assert(
      fc.asyncProperty(
        packetTypeArb,
        termArb,
        async (packetType, term) => {
          let receivedPayload = null;
          let receivedOptions = null;

          const mockTransport = {
            deliver: async (_address, payload, options) => {
              receivedPayload = payload;
              receivedOptions = options;
              return {acknowledged: true};
            },
          };

          const buildPeerAddress = (peerId) => peerId;
          const logger = {debug: () => {}, info: () => {}, error: () => {}};

          const PartitionRaftNode = createPartitionRaftNodeClass({
            transport: mockTransport,
            buildPeerAddress,
            logger,
            deferElection: true,
            replicaId: 'sender-replica',
            partitionId: 'test-partition',
          });

          const destAddress = 'node-2/partition/replica-2';
          const peerNode = new PartitionRaftNode(destAddress, {
            'heartbeat': 30000,
            'election min': 30000,
            'election max': 60000,
          });

          const packet = {
            type: packetType,
            term,
            address: 'node-1/partition/sender-replica',
            state: 1,
            leader: null,
            last: {index: 0, term: 0},
            data: null,
          };

          await new Promise((resolve, reject) => {
            peerNode.write(packet, (err, result) => {
              if (err) reject(err);
              else resolve(result);
            });
          });

          if (peerNode.timers) peerNode.timers.clear();
          peerNode.end();

          // The type must be the original liferaft type, NOT a mapped type
          return receivedPayload !== null &&
          receivedPayload.type === packetType &&
          JSON.stringify(receivedOptions) === JSON.stringify(
            resolveRaftTransportDeliveryOptions(packet),
          );
        },
      ),
      {numRuns: 10},
    );

    t.pass('PartitionRaftNode.write() preserves packet type unchanged');
  });
