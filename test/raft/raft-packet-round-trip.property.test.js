/**
 * Property tests for Raft Packet Round-Trip Preservation.
 *
 * Property A (delivery preservation): for any liferaft packet of any of the
 * six packet types, the production send helper a group hands its backend
 * (`deliverRaftPacketWithBackpressureMute`) SHALL reach the transport with
 * every packet field preserved and the type unmapped, at the destination
 * address it was given, with the delivery options
 * `resolveRaftTransportDeliveryOptions({...packet, targetAddress})`. This is
 * a pure helper property: no node is built.
 *
 * Property B (the seam's outbound send): the backend seam is what production
 * wires. The sender's group is built through `createPartitionPort` exactly as
 * the partition service builds it, and the one outbound send the frozen
 * operation port exposes (add a peer, then probe its progress) SHALL leave
 * through the handed-over SEND_TO_PEER capability, at the destination
 * resolved by RESOLVE_PEER_ADDRESS, as an unmapped append packet carrying
 * the sender's own address.
 *
 * The liferaft node, its write(), its timers and its end() are private
 * behind the seam; this file drives only the operation port.
 *
 * **Validates: Requirements 5.3**
 *
 * Feature: transport-architecture-improvements
 * Property: Raft Packet Round-Trip Preservation via the backend seam
 */

import assert from 'node:assert/strict';
import {test} from '../../src/test-helpers/tap.js';
import fc from 'fast-check';
import {LiferaftProvider} from '../../src/raft/liferaft-provider.js';
import {
  RAFT_PARTITION_NODE_REQUEST,
} from '../../src/raft/raft-provider-contract-constants.js';
import {
  RAFT_MEMBERSHIP_OPERATION,
  RAFT_OPERATION_OUTCOME,
} from '../../src/raft/raft-operation-port-constants.js';
import {
  deliverRaftPacketWithBackpressureMute,
} from '../../src/raft/raft-peer-backpressure-mute.js';
import {
  RAFT_PACKET_TYPE,
  resolveRaftTransportDeliveryOptions,
} from '../../src/raft/constants.js';
import {ENTITY_TYPE} from '../../src/constants/index.js';

const VALID_RAFT_PACKET_TYPES = [
  RAFT_PACKET_TYPE.VOTE,
  RAFT_PACKET_TYPE.VOTED,
  RAFT_PACKET_TYPE.APPEND,
  RAFT_PACKET_TYPE.APPENDED,
  RAFT_PACKET_TYPE.APPEND_FAIL,
  RAFT_PACKET_TYPE.APPEND_ACK,
];

// The single log entry the probe path sends, and the entry before it.
const PROBE_ENTRY_INDEX = 1;
const PROBE_PREVIOUS_ENTRY_INFO = Object.freeze({index: 0, term: 0});

// Timers long enough that no election runs during a property case.
const SEAM_TIMING = Object.freeze({
  heartbeatMs: 30000,
  electionMinMs: 30000,
  electionMaxMs: 60000,
});

const PARTITION_GROUP_ID = 'test-partition';

// The project's property-test default (test/README.local.md).
const PROPERTY_RANDOM_RUNS = 10;

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
 * Arbitrary for the sender group's term and the command its last log entry
 * carries. The seam only applies a positive initial term.
 */
const probeCaseArb = fc.record({
  term: fc.integer({min: 1, max: 10000}),
  command: fc.record({cmd: fc.string({minLength: 0, maxLength: 50})}),
  senderNodeId: nodeIdArb,
  senderEntityId: entityIdArb,
  destNodeId: nodeIdArb,
  destEntityId: entityIdArb,
});

/**
 * @param {string} nodeId
 * @param {string} entityId
 * @return {string} The unified partition replica address.
 */
function unifiedPartitionAddress(nodeId, entityId) {
  return `${nodeId}/${ENTITY_TYPE.PARTITION}/${entityId}`;
}

/**
 * A transport that records every delivery it is handed.
 * @param {*} deliverResult - What deliver() resolves with.
 * @return {{transport: Object, deliveries: Array<Object>}}
 */
function recordingTransport(deliverResult) {
  const deliveries = [];
  return {
    deliveries,
    transport: {
      deliver: async (address, payload, options) => {
        deliveries.push({address, payload, options});
        return deliverResult;
      },
    },
  };
}

// One packet context per packet type, so every liferaft packet type is
// delivered on every run rather than only when the random draw reaches it.
const EVERY_PACKET_TYPE_EXAMPLES = VALID_RAFT_PACKET_TYPES.map((type) => [{
  type,
  term: 1,
  senderNodeId: 'node1',
  senderEntityId: 'sender-replica',
  destNodeId: 'node2',
  destEntityId: 'replica-2',
  state: 1,
  leader: null,
  last: {index: 0, term: 0},
  data: null,
}]);

/**
 * Property A: the send helper preserves every packet field.
 *
 * For any valid Raft packet of any of the six liferaft packet types, the
 * production send helper delivers the packet unchanged - no type conversion -
 * at the given destination with the delivery options resolved from the
 * packet and that destination.
 *
 * **Validates: Requirements 5.3**
 */
test('Property: Raft packet delivery preserves every field for every packet type',
  async (t) => {
    await fc.assert(
      fc.asyncProperty(
        raftPacketArb,
        async (packetData) => {
          const {transport, deliveries} =
            recordingTransport({acknowledged: true});
          const senderAddress = unifiedPartitionAddress(
            packetData.senderNodeId, packetData.senderEntityId);
          const destAddress = unifiedPartitionAddress(
            packetData.destNodeId, packetData.destEntityId);

          // The packet as liferaft builds it.
          const originalPacket = {
            type: packetData.type,
            term: packetData.term,
            address: senderAddress,
            state: packetData.state,
            leader: packetData.leader,
            last: packetData.last,
            data: packetData.data,
          };
          const expectedPacket = structuredClone(originalPacket);

          const result = await deliverRaftPacketWithBackpressureMute(
            transport, destAddress, originalPacket);

          assert.deepEqual(result, {acknowledged: true});
          assert.equal(deliveries.length, 1);
          const [delivery] = deliveries;
          assert.equal(delivery.address, destAddress);
          // Every field preserved, the type unmapped.
          assert.deepEqual(delivery.payload, expectedPacket);
          assert.equal(delivery.payload.type, packetData.type);
          assert.deepEqual(
            delivery.options,
            resolveRaftTransportDeliveryOptions({
              ...expectedPacket,
              targetAddress: destAddress,
            }),
          );
        },
      ),
      // fast-check counts examples inside numRuns; keep the random draws.
      {
        numRuns: EVERY_PACKET_TYPE_EXAMPLES.length + PROPERTY_RANDOM_RUNS,
        examples: EVERY_PACKET_TYPE_EXAMPLES,
      },
    );

    t.pass('Raft packet delivery preserves every field for every packet type');
  });

/**
 * The durable log the sender group hands its backend. It answers exactly
 * what the port's progress probe asks of it: the last entry's info, that
 * entry, the entry info before it (liferaft's append packet), and end().
 * @param {{term: number, command: Object}} probeCase
 * @return {{log: Object, entry: Object}}
 */
function probePathLog({term, command}) {
  const entry = Object.freeze({index: PROBE_ENTRY_INDEX, term, command});
  return {
    entry,
    log: {
      getLastInfo: async () => ({
        index: PROBE_ENTRY_INDEX,
        term,
        committedIndex: 0,
      }),
      get: async (index) => (index === PROBE_ENTRY_INDEX ? entry : undefined),
      getEntryInfoBefore: async () => ({...PROBE_PREVIOUS_ENTRY_INFO}),
      end: () => undefined,
    },
  };
}

/**
 * The sender group's operation port, built the way production builds it:
 * the backend seam receives the group's requirements and returns the port.
 * The send capability is handed over explicitly.
 * @param {Object} options
 * @return {Object} The frozen Raft operation port.
 */
function buildSeamPort({
  peerId, peerAddress, initialTerm, durableLog, sendToPeer, buildPeerAddress,
}) {
  return new LiferaftProvider().createPartitionPort({
    [RAFT_PARTITION_NODE_REQUEST.GROUP_ID]: PARTITION_GROUP_ID,
    [RAFT_PARTITION_NODE_REQUEST.PEER_ID]: peerId,
    [RAFT_PARTITION_NODE_REQUEST.PEER_ADDRESS]: peerAddress,
    [RAFT_PARTITION_NODE_REQUEST.BOOTSTRAP_PEER_IDS]: [peerId],
    [RAFT_PARTITION_NODE_REQUEST.DURABLE_LOG]: durableLog,
    [RAFT_PARTITION_NODE_REQUEST.TIMING]: SEAM_TIMING,
    [RAFT_PARTITION_NODE_REQUEST.SUBSTRATE]: {},
    [RAFT_PARTITION_NODE_REQUEST.DEFER_ELECTION]: true,
    [RAFT_PARTITION_NODE_REQUEST.INITIAL_TERM]: initialTerm,
    [RAFT_PARTITION_NODE_REQUEST.SEND_TO_PEER]: sendToPeer,
    [RAFT_PARTITION_NODE_REQUEST.RESOLVE_PEER_ADDRESS]: buildPeerAddress,
    [RAFT_PARTITION_NODE_REQUEST.APPLY_COMMITTED_ENTRY]: () => undefined,
    [RAFT_PARTITION_NODE_REQUEST.SNAPSHOT_CATCHUP_NEEDED]: () => undefined,
    // Declared requirements are all required: the backend subscribes this
    // one on the node it builds, so a request that omits it never produces a
    // port at all. The send path under test never rolls an apply back.
    [RAFT_PARTITION_NODE_REQUEST.APPLY_TRANSACTION_ROLLED_BACK]: () =>
      undefined,
  });
}

/**
 * Property B: the seam's outbound send goes through the handed-over
 * capability.
 *
 * Adding a peer and probing its progress is the one outbound send the frozen
 * operation port exposes. The packet it produces SHALL reach SEND_TO_PEER
 * exactly once, as an unmapped append packet carrying the sender's own
 * address, at the address RESOLVE_PEER_ADDRESS resolves for the peer, and
 * the transport SHALL receive it with the delivery options resolved from it.
 *
 * **Validates: Requirements 5.3**
 */
test('Property: the seam port sends through the handed-over capability',
  async (t) => {
    await fc.assert(
      fc.asyncProperty(
        probeCaseArb,
        async (probeCase) => {
          const senderAddress = unifiedPartitionAddress(
            probeCase.senderNodeId, probeCase.senderEntityId);
          // The peer joins by its replica id; resolution to the unified
          // address is the seam's job, so it is observable here.
          const destPeerId = probeCase.destEntityId;
          const buildPeerAddress = (peerId) =>
            unifiedPartitionAddress(probeCase.destNodeId, peerId);
          const resolvedDestAddress = buildPeerAddress(destPeerId);

          // No reply is fed back into the sender: the property is the send.
          const {transport, deliveries} = recordingTransport(undefined);
          const sends = [];
          const {log, entry} = probePathLog(probeCase);
          const port = buildSeamPort({
            peerId: probeCase.senderEntityId,
            peerAddress: senderAddress,
            initialTerm: probeCase.term,
            durableLog: log,
            sendToPeer: (address, packet) => {
              sends.push({address, packet});
              return deliverRaftPacketWithBackpressureMute(
                transport, address, packet);
            },
            buildPeerAddress,
          });

          try {
            const joined = port.proposeConfChange({
              type: RAFT_MEMBERSHIP_OPERATION.ADD_PEER,
              peerAddress: destPeerId,
            });
            assert.equal(joined.outcome, RAFT_OPERATION_OUTCOME.CORE_OK);

            const probed = await port.probePeerProgress(destPeerId);
            assert.equal(probed.outcome, RAFT_OPERATION_OUTCOME.CORE_OK);
            // Let any send the probe scheduled settle before counting.
            await new Promise((resolve) => setImmediate(resolve));

            assert.equal(sends.length, 1);
            const [send] = sends;
            assert.equal(send.address, resolvedDestAddress);
            assert.equal(send.packet.type, RAFT_PACKET_TYPE.APPEND);
            assert.equal(send.packet.address, senderAddress);
            assert.equal(send.packet.term, probeCase.term);
            assert.deepEqual(send.packet.data, [entry]);
            assert.deepEqual(send.packet.last, PROBE_PREVIOUS_ENTRY_INFO);

            assert.equal(deliveries.length, 1);
            const [delivery] = deliveries;
            assert.equal(delivery.address, resolvedDestAddress);
            assert.equal(delivery.payload, send.packet);
            assert.equal(delivery.payload.type, RAFT_PACKET_TYPE.APPEND);
            assert.deepEqual(
              delivery.options,
              resolveRaftTransportDeliveryOptions({
                ...send.packet,
                targetAddress: delivery.address,
              }),
            );
          } finally {
            port.close();
          }
        },
      ),
      {numRuns: PROPERTY_RANDOM_RUNS},
    );

    t.pass('the seam port sends through the handed-over capability');
  });
