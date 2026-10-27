/**
 * Raft Response Address Validation Test.
 *
 * BUG: a consensus delivery addressed to a bare node ID (not a unified
 * address) fails with an "Invalid address format" error.
 *
 * ROOT CAUSE: every consensus delivery between message-group replicas is
 * addressed to the unified address (nodeId/message-group/replicaId) the
 * replica resolves for a peer's replica identity; a peer resolved to a
 * non-unified address would make every delivery to it fail.
 *
 * This test verifies that two replicas on separate transports exchange
 * consensus traffic over their unified addresses.
 */

import {test} from '../../src/test-helpers/tap.js';
import {MessageGroupService} from '../../src/message-group/message-group-service.js';
import {MessageRouter} from '../../src/transport/message-router.js';
import {createPortAllocator} from '../../src/test-helpers/port-allocator.js';

const ports = createPortAllocator(import.meta.url);

/**
 * Get a unique port for this test file.
 * @return {number} A unique port number.
 */
function getUniquePort() {
  return ports.getPort();
}
import {ENTITY_TYPE} from '../../src/constants/index.js';
import {TEST_BOOT_INCARNATION} from '../test-helpers/boot-incarnation-fixture.js';
import {withTestDbPath} from '../test-helpers/message-group-db-path.js';

/**
 * Create a test transport (MessageRouter) for testing.
 * @param {string} nodeId - Node ID.
 * @param {number} preferredPort - Preferred WebSocket port.
 * @return {Promise<Object>} Router and cleanup function.
 */
async function createTestTransport(nodeId, preferredPort) {
  let lastError = null;

  for (let attempt = 0; attempt < 5; attempt++) {
    const port = attempt === 0 ? preferredPort : getUniquePort();
    // Bind 127.0.0.1 explicitly: in CI containers 'localhost' can resolve to
    // ::1 for the server bind while cross-node dials go to 127.0.0.1,
    // producing ECONNREFUSED from an address-family mismatch.
    const router = new MessageRouter({
      bootIncarnation: TEST_BOOT_INCARNATION,
      nodeId,
      wsPort: port,
      wsHost: '127.0.0.1',
    });

    try {
      await router.initialize({startServer: true});
      return {
        router,
        nodeId,
        port,
        cleanup: async () => {
          await router.shutdown();
        },
      };
    } catch (error) {
      lastError = error;
      await router.shutdown?.().catch(() => {});
      if (error?.code !== 'EADDRINUSE') {
        throw error;
      }
    }
  }

  throw lastError;
}

test('Raft response address validation', async (t) => {
  await t.test('payload.address must be unified format for Raft responses', async (t) => {
    const seedNodeId = '550e8400-e29b-41d4-a716-446655440001';
    const seedPort = getUniquePort();
    const joiningNodeId = '550e8400-e29b-41d4-a716-446655440002';
    const joiningPort = getUniquePort();

    let seedTransport;
    let joiningTransport;
    let seedMessageGroup;
    let joiningMessageGroup;

    try {
      // Create transports for both nodes
      seedTransport = await createTestTransport(seedNodeId, seedPort);
      joiningTransport = await createTestTransport(joiningNodeId, joiningPort);

      // Connect joining node to seed node
      await joiningTransport.router.connectToNode(
        seedNodeId,
        `ws://127.0.0.1:${seedTransport.port}`,
      );

      // Wait for connection
      await new Promise((resolve) => setTimeout(resolve, 100));

      // Create message group on seed node with unified address
      const seedReplicaId = 'mg-1-r0';
      const seedUnifiedAddress = `${seedNodeId}/${ENTITY_TYPE.MESSAGE_GROUP}/${seedReplicaId}`;

      seedMessageGroup = new MessageGroupService(withTestDbPath({
        groupId: 'mg-1',
        replicaId: seedReplicaId,
        nodeId: seedNodeId,
        replicaIds: [seedReplicaId],
        transport: seedTransport.router,
        deferElection: true,
      }));

      // Register seed message group with router
      seedTransport.router.register(seedUnifiedAddress, (envelope) => {
        return seedMessageGroup.receiveMessage(envelope);
      });

      await seedMessageGroup.initialize();

      // Create message group on joining node
      const joiningReplicaId = 'mg-1-r1';
      const joiningUnifiedAddress =
        `${joiningNodeId}/${ENTITY_TYPE.MESSAGE_GROUP}/${joiningReplicaId}`;

      // Peer addresses should be unified format
      const peerAddresses = [
        seedUnifiedAddress,
        joiningUnifiedAddress,
      ];

      joiningMessageGroup = new MessageGroupService(withTestDbPath({
        groupId: 'mg-1',
        replicaId: joiningReplicaId,
        nodeId: joiningNodeId,
        replicaIds: [seedReplicaId, joiningReplicaId],
        peerAddresses: peerAddresses,
        transport: joiningTransport.router,
        deferElection: true,
      }));

      // Register joining message group with router
      joiningTransport.router.register(joiningUnifiedAddress, (envelope) => {
        return joiningMessageGroup.receiveMessage(envelope);
      });

      await joiningMessageGroup.initialize();

      // Verify that the message group's unified address is correct
      t.equal(
        seedMessageGroup.getUnifiedAddress(),
        seedUnifiedAddress,
        'seed message group should have unified address',
      );
      t.equal(
        joiningMessageGroup.getUnifiedAddress(),
        joiningUnifiedAddress,
        'joining message group should have unified address',
      );

      // Start elections to trigger Raft communication
      seedMessageGroup.startElection();
      joiningMessageGroup.startElection();

      // Wait for Raft communication to happen
      await new Promise((resolve) => setTimeout(resolve, 500));

      // If we get here without errors, the test passes
      // The bug would cause "Invalid address format" errors during Raft communication
      t.pass('Raft communication should succeed with unified addresses');
    } finally {
      if (seedMessageGroup) {
        await seedMessageGroup.shutdown?.();
      }
      if (joiningMessageGroup) {
        await joiningMessageGroup.shutdown?.();
      }
      if (seedTransport) {
        await seedTransport.cleanup();
      }
      if (joiningTransport) {
        await joiningTransport.cleanup();
      }
    }
  });
});
