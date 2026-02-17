/**
 * Property Test: Raft Packet Delivery Path Determination
 * **Property 1: Raft packet delivery path determination**
 * **Validates: Requirements 1.1, 1.2**
 *
 * Feature: transport-architecture-improvements,
 * Property 1: Raft packet delivery path determination
 *
 * *For any* message payload, the RouterDeliveryManager SHALL deliver it
 * directly (bypassing the outbound queue) if and only if
 * `isRaftPacket(payload)` returns true; otherwise it SHALL enqueue the
 * message in the outbound queue.
 */

import {test} from '../../src/test-helpers/tap.js';
import fc from 'fast-check';
import {RouterDeliveryManager} from
  '../../src/transport/router-delivery-manager.js';
import {
  CONNECTION_STATE,
} from '../../src/constants/transport.js';
import {RAFT_PACKET_TYPE} from '../../src/raft/constants.js';
import {isRaftPacket} from '../../src/raft/raft-packet-utils.js';

const RAFT_TYPES = Object.values(RAFT_PACKET_TYPE);

/**
 * Create a minimal RouterDeliveryManager with test doubles that
 * track which delivery path was taken.
 * @return {Object} Manager and tracking state.
 */
function createTrackedManager() {
  const enqueuedCalls = [];
  const directCalls = [];
  const nodeConnections = new Map();
  const pendingMessages = new Map();
  const nodeId = 'test-node';
  const targetNodeId = 'remote-node';

  // Add a connected remote node
  nodeConnections.set(targetNodeId, {
    state: CONNECTION_STATE.CONNECTED,
    ws: {send: () => {}},
  });

  const manager = new RouterDeliveryManager({
    nodeId,
    logger: {debug: () => {}, warn: () => {}, error: () => {}},
    nodeConnections,
    pendingMessages,
    messageTimeoutMs: 50,
    sendRaw: (_ws, msg) => {
      directCalls.push(msg);
    },
    parseAddress: (addr) => {
      const parts = addr.split('/');
      return {
        nodeId: parts[0],
        entityType: parts[1],
        entityId: parts[2],
      };
    },
    isValidAddress: () => true,
    outboundQueue: {
      enqueueOutbound: (tgtNodeId, fn) => {
        enqueuedCalls.push({targetNodeId: tgtNodeId});
        const result = fn();
        if (result instanceof Promise) {
          const entry = Array.from(pendingMessages.values()).pop();
          if (entry) {
            clearTimeout(entry.timeout);
            entry.resolve({
              messageId: entry.messageId,
              acknowledged: true,
            });
          }
        }
        return Promise.resolve(result);
      },
    },
  });

  const targetAddress = `${targetNodeId}/partition/p1`;
  return {
    manager, enqueuedCalls, directCalls, targetNodeId, targetAddress,
  };
}

/**
 * Arbitrary for Raft packet payloads — picks a random Raft type
 * and attaches arbitrary data.
 */
const raftPayloadArb = fc.record({
  type: fc.constantFrom(...RAFT_TYPES),
  data: fc.string(),
});

/**
 * Arbitrary for non-Raft payloads — uses types that are NOT in
 * RAFT_PACKET_TYPE, plus edge cases like missing type or null.
 */
const nonRaftPayloadArb = fc.oneof(
  // Object with a non-Raft type string
  fc.record({
    type: fc.string().filter((s) => !RAFT_TYPES.includes(s)),
    data: fc.string(),
  }),
  // Object with no type property
  fc.record({data: fc.string()}),
  // Null payload
  fc.constant(null),
  // Undefined payload
  fc.constant(undefined),
);

test('Property 1: Raft packet delivery path determination',
  async (t) => {
    /**
     * Property: For any Raft payload, deliverRemote SHALL deliver
     * directly (result.direct === true) and NOT enqueue.
     */
    t.test('Raft payloads are delivered directly', async (t) => {
      await fc.assert(
        fc.asyncProperty(
          raftPayloadArb,
          async (payload) => {
            const {
              manager, enqueuedCalls, directCalls, targetNodeId,
              targetAddress,
            } = createTrackedManager();

            const msgId = 'msg-raft';
            const result = await manager.deliverRemote(
              targetAddress, msgId, payload, targetNodeId,
            );

            // isRaftPacket must agree this is a Raft packet
            if (!isRaftPacket(payload)) return false;

            // Must be delivered directly
            if (result.direct !== true) return false;
            if (result.acknowledged !== true) return false;

            // Must NOT have been enqueued
            if (enqueuedCalls.length !== 0) return false;

            // Must have sent exactly one raw message
            if (directCalls.length !== 1) return false;

            return true;
          },
        ),
        {numRuns: 10},
      );

      t.pass('Raft payloads are delivered directly');
    });

    /**
     * Property: For any non-Raft payload, deliverRemote SHALL enqueue
     * the message in the outbound queue and NOT deliver directly.
     */
    t.test('non-Raft payloads are enqueued', async (t) => {
      await fc.assert(
        fc.asyncProperty(
          nonRaftPayloadArb,
          async (payload) => {
            const {
              manager, enqueuedCalls, targetNodeId, targetAddress,
            } = createTrackedManager();

            const msgId = 'msg-non-raft';
            const result = await manager.deliverRemote(
              targetAddress, msgId, payload, targetNodeId,
            );

            // isRaftPacket must agree this is NOT a Raft packet
            if (isRaftPacket(payload)) return false;

            // Must have been enqueued
            if (enqueuedCalls.length !== 1) return false;

            // Must NOT have direct flag
            if (result.direct === true) return false;

            return true;
          },
        ),
        {numRuns: 10},
      );

      t.pass('non-Raft payloads are enqueued');
    });

    /**
     * Property: For any arbitrary payload (Raft or non-Raft), the
     * delivery path chosen by deliverRemote matches isRaftPacket.
     * This is the unified property that ties both paths together.
     */
    t.test('delivery path matches isRaftPacket for any payload',
      async (t) => {
        const anyPayloadArb = fc.oneof(raftPayloadArb, nonRaftPayloadArb);

        await fc.assert(
          fc.asyncProperty(
            anyPayloadArb,
            async (payload) => {
              const {
                manager, enqueuedCalls, targetNodeId, targetAddress,
              } = createTrackedManager();

              const msgId = 'msg-any';
              const result = await manager.deliverRemote(
                targetAddress, msgId, payload, targetNodeId,
              );

              const expectDirect = isRaftPacket(payload);

              if (expectDirect) {
                // Direct delivery: direct flag set, no enqueue
                return result.direct === true &&
                       enqueuedCalls.length === 0;
              }
              // Queue delivery: enqueued, no direct flag
              return result.direct !== true &&
                     enqueuedCalls.length === 1;
            },
          ),
          {numRuns: 10},
        );

        t.pass('delivery path matches isRaftPacket for any payload');
      });
  });
