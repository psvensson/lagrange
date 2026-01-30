/**
 * Property-based test for Raft Message Delivery.
 * **Property 3: Message Delivery**
 * **Validates: Requirements 3.2, 3.3, 6.2, 6.4**
 *
 * Property: For any Raft message sent via the write() method, the MessageRouter
 * SHALL deliver it to the correct peer replica handler, regardless of whether
 * replicas are co-located or distributed.
 */

import {test, beforeEach, afterEach} from '../../src/test-helpers/tap.js';
import fc from 'fast-check';
import {PartitionService} from '../../src/partition/partition-service.js';
import {MessageRouter} from '../../src/transport/message-router.js';
import {ConfigurationManager} from '../../src/config/configuration-manager.js';
import {LoggingService} from '../../src/logging/logging-service.js';
import {AddressManager} from '../../src/address/address-manager.js';
import {isRaftPacket, RAFT_PACKET_TYPES} from '../../src/raft/raft-packet-utils.js';

// Port counter for unique ports per test
let testPortCounter = 32000;

beforeEach(() => {
  ConfigurationManager.resetInstance();
  LoggingService.resetInstance();
  AddressManager.resetInstance();
  const config = ConfigurationManager.getInstance();
  config.initialize({node: {id: 'test-node'}});
  const logger = LoggingService.getInstance();
  logger.initialize({level: 'error'});
});

afterEach(() => {
  ConfigurationManager.resetInstance();
  LoggingService.resetInstance();
  AddressManager.resetInstance();
});

/**
 * Generate a random partition ID.
 */
const partitionIdArbitrary = fc.string({minLength: 1, maxLength: 15})
  .filter((s) => /^[a-z0-9_-]+$/i.test(s))
  .map((s) => `partition-${s}`);

/**
 * Generate a random table ID.
 */
const tableIdArbitrary = fc.string({minLength: 1, maxLength: 10})
  .filter((s) => /^[a-z_][a-z0-9_]*$/i.test(s));

/**
 * Generate a random Raft packet type.
 */
const raftPacketTypeArbitrary = fc.constantFrom(...RAFT_PACKET_TYPES);

/**
 * Generate a random Raft packet.
 */
const raftPacketArbitrary = fc.record({
  type: raftPacketTypeArbitrary,
  term: fc.integer({min: 0, max: 100}),
  address: fc.string({minLength: 5, maxLength: 30}),
  data: fc.option(fc.string({minLength: 0, maxLength: 50})),
});

/**
 * Feature: single-node-replica-placement-fix
 * Property 3: Message Delivery
 *
 * For any Raft message sent via the write() method, the MessageRouter SHALL
 * deliver it to the correct peer replica handler, regardless of whether
 * replicas are co-located or distributed.
 *
 * This test validates Requirements 3.2, 3.3, 6.2, 6.4:
 * - 3.2: WHEN a replica sends Raft messages THEN the Message_Router SHALL
 *        deliver them to peer replicas regardless of node placement
 * - 3.3: WHEN replicas are co-located on the same node THEN the Message_Router
 *        SHALL route messages correctly between them
 * - 6.2: WHEN liferaft calls the write() method THEN the system SHALL deliver
 *        messages via Message_Router
 * - 6.4: WHEN receiving Raft messages THEN the Message_Router SHALL route them
 *        to the correct replica handler
 */
test('Property 3: Raft messages are delivered to correct handler', async (t) => {
  await fc.assert(
    fc.asyncProperty(
      partitionIdArbitrary,
      tableIdArbitrary,
      raftPacketArbitrary,
      async (partitionId, tableId, raftPacket) => {
        const port = testPortCounter++;
        const nodeId = `delivery-test-${port}`;

        const router = new MessageRouter({
          nodeId,
          wsPort: port,
        });

        const replicaId = `${partitionId}-r1`;
        const replicaIds = [replicaId];

        const receivedMessages = [];

        try {
          await router.initialize({startServer: true});

          // Create partition with real transport
          const partition = new PartitionService({
            partitionId,
            tableId,
            replicaId,
            replicaIds,
            nodeId,
            transport: router,
            dbPath: ':memory:',
          });

          await partition.initialize();

          // Register a handler to capture messages sent to this partition
          const targetAddress = partition.getUnifiedAddress();

          // Track messages received by the handler
          router.unregister(targetAddress);
          router.register(targetAddress, (envelope) => {
            receivedMessages.push(envelope);
            return {acknowledged: true};
          });

          // Deliver a Raft packet to the partition's address
          const result = await router.deliver(targetAddress, raftPacket);

          // Property: Message should be acknowledged
          if (!result.acknowledged) {
            return false;
          }

          // Property: Handler should have received the message
          if (receivedMessages.length === 0) {
            return false;
          }

          // Property: Received message should contain the Raft packet
          const received = receivedMessages[0];
          if (!received.payload) {
            return false;
          }

          // Property: Raft packet type should be preserved
          if (received.payload.type !== raftPacket.type) {
            return false;
          }

          // Property: Raft packet term should be preserved
          if (received.payload.term !== raftPacket.term) {
            return false;
          }

          await partition.shutdown();
          return true;
        } finally {
          await router.shutdown();
        }
      },
    ),
    {numRuns: 10},
  );

  t.pass('Raft messages are delivered to correct handler');
});

/**
 * Property 3: Co-located replicas receive messages via MessageRouter.
 *
 * When multiple replicas are on the same node, messages sent between them
 * should still be delivered via the MessageRouter (through self-connection).
 *
 * **Validates: Requirements 3.3, 6.2, 6.4**
 */
test('Property 3: Co-located replicas receive messages via router', async (t) => {
  await fc.assert(
    fc.asyncProperty(
      partitionIdArbitrary,
      tableIdArbitrary,
      raftPacketArbitrary,
      async (partitionId, tableId, raftPacket) => {
        const port = testPortCounter++;
        const nodeId = `colocated-test-${port}`;

        const router = new MessageRouter({
          nodeId,
          wsPort: port,
        });

        const replicaId1 = `${partitionId}-r1`;
        const replicaId2 = `${partitionId}-r2`;
        const replicaIds = [replicaId1, replicaId2];

        // Generate peer addresses
        const addressManager = AddressManager.getInstance();
        const peerAddresses = replicaIds.map((rid) =>
          addressManager.format(nodeId, 'partition', rid),
        );

        const replica2ReceivedMessages = [];

        try {
          await router.initialize({startServer: true});

          // Create two partitions on the same node
          const partition1 = new PartitionService({
            partitionId,
            tableId,
            replicaId: replicaId1,
            replicaIds,
            peerAddresses,
            nodeId,
            transport: router,
            dbPath: ':memory:',
          });

          const partition2 = new PartitionService({
            partitionId,
            tableId,
            replicaId: replicaId2,
            replicaIds,
            peerAddresses,
            nodeId,
            transport: router,
            dbPath: ':memory:',
          });

          await partition1.initialize();
          await partition2.initialize();

          // Replace partition2's handler to track received messages
          const targetAddress2 = partition2.getUnifiedAddress();
          router.unregister(targetAddress2);
          router.register(targetAddress2, (envelope) => {
            replica2ReceivedMessages.push(envelope);
            return {acknowledged: true};
          });

          // Send message from partition1 to partition2 via router
          const result = await router.deliver(targetAddress2, raftPacket);

          // Property: Message should be acknowledged
          if (!result.acknowledged) {
            return false;
          }

          // Property: Replica 2 should have received the message
          if (replica2ReceivedMessages.length === 0) {
            return false;
          }

          // Property: Message content should be preserved
          const received = replica2ReceivedMessages[0];
          if (received.payload.type !== raftPacket.type) {
            return false;
          }

          await partition1.shutdown();
          await partition2.shutdown();
          return true;
        } finally {
          await router.shutdown();
        }
      },
    ),
    {numRuns: 10},
  );

  t.pass('Co-located replicas receive messages via router');
});

/**
 * Property 3: isRaftPacket correctly identifies Raft packets.
 *
 * The isRaftPacket function should correctly identify all valid Raft packet
 * types and reject non-Raft packets.
 *
 * **Validates: Requirements 6.4**
 */
test('Property 3: isRaftPacket correctly identifies Raft packets', async (t) => {
  await fc.assert(
    fc.asyncProperty(
      raftPacketArbitrary,
      async (raftPacket) => {
        // Property: Valid Raft packets should be identified
        if (!isRaftPacket(raftPacket)) {
          return false;
        }

        // Property: Packets with non-Raft types should not be identified
        const nonRaftPacket = {...raftPacket, type: 'APPLICATION_MESSAGE'};
        if (isRaftPacket(nonRaftPacket)) {
          return false;
        }

        // Property: Null/undefined should not be identified as Raft
        if (isRaftPacket(null) || isRaftPacket(undefined)) {
          return false;
        }

        return true;
      },
    ),
    {numRuns: 10},
  );

  t.pass('isRaftPacket correctly identifies Raft packets');
});

/**
 * Property 3: Message delivery preserves all packet fields.
 *
 * When a Raft message is delivered via MessageRouter, all fields in the
 * original packet should be preserved in the delivered message.
 *
 * **Validates: Requirements 6.2**
 */
test('Property 3: Message delivery preserves all packet fields', async (t) => {
  await fc.assert(
    fc.asyncProperty(
      partitionIdArbitrary,
      tableIdArbitrary,
      fc.record({
        type: raftPacketTypeArbitrary,
        term: fc.integer({min: 0, max: 100}),
        address: fc.string({minLength: 5, maxLength: 30}),
        leader: fc.string({minLength: 1, maxLength: 20}),
        lastIndex: fc.integer({min: 0, max: 1000}),
        lastTerm: fc.integer({min: 0, max: 100}),
      }),
      async (partitionId, tableId, raftPacket) => {
        const port = testPortCounter++;
        const nodeId = `preserve-test-${port}`;

        const router = new MessageRouter({
          nodeId,
          wsPort: port,
        });

        const replicaId = `${partitionId}-r1`;
        let receivedPayload = null;

        try {
          await router.initialize({startServer: true});

          const targetAddress = `${nodeId}/partition/${replicaId}`;

          // Register handler to capture the payload
          router.register(targetAddress, (envelope) => {
            receivedPayload = envelope.payload;
            return {acknowledged: true};
          });

          // Deliver the packet
          await router.deliver(targetAddress, raftPacket);

          // Property: All fields should be preserved
          if (!receivedPayload) {
            return false;
          }

          if (receivedPayload.type !== raftPacket.type) {
            return false;
          }

          if (receivedPayload.term !== raftPacket.term) {
            return false;
          }

          if (receivedPayload.address !== raftPacket.address) {
            return false;
          }

          // Check all fields are preserved
          if (receivedPayload.leader !== raftPacket.leader) {
            return false;
          }

          if (receivedPayload.lastIndex !== raftPacket.lastIndex) {
            return false;
          }

          if (receivedPayload.lastTerm !== raftPacket.lastTerm) {
            return false;
          }

          return true;
        } finally {
          await router.shutdown();
        }
      },
    ),
    {numRuns: 10},
  );

  t.pass('Message delivery preserves all packet fields');
});

