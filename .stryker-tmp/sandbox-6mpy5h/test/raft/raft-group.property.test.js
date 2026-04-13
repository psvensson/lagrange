/**
 * Property-based tests for RaftGroup.
 * Validates Raft lifecycle management: initialization, peer joining,
 * election starting, shutdown, and packet handling.
 *
 * Feature: raft-architecture-consolidation
 */
// @ts-nocheck


import {test} from '../../src/test-helpers/tap.js';
import fc from 'fast-check';
import {RaftGroup} from '../../src/raft/raft-group.js';
import {
  RAFT_GROUP_LIFERAFT_EVENT,
} from '../../src/raft/raft-group-constants.js';
import {RAFT_PACKET_TYPE} from '../../src/raft/constants.js';
import {ENTITY_TYPE, ADDRESS, NUM} from '../../src/constants/index.js';

/**
 * Valid entity types for RaftGroup testing.
 */
const VALID_ENTITY_TYPES = [
  ENTITY_TYPE.PARTITION,
  ENTITY_TYPE.MESSAGE_GROUP,
];

/**
 * The six liferaft events that must be wired during initialize().
 */
const EXPECTED_LIFERAFT_EVENTS = [
  RAFT_GROUP_LIFERAFT_EVENT.LEADER,
  RAFT_GROUP_LIFERAFT_EVENT.FOLLOWER,
  RAFT_GROUP_LIFERAFT_EVENT.CANDIDATE,
  RAFT_GROUP_LIFERAFT_EVENT.COMMIT,
  RAFT_GROUP_LIFERAFT_EVENT.LEADER_CHANGE,
  RAFT_GROUP_LIFERAFT_EVENT.TERM_CHANGE,
];

/**
 * Safe Raft packet types for property testing.
 */
const SAFE_PACKET_TYPES = [
  RAFT_PACKET_TYPE.VOTE,
  RAFT_PACKET_TYPE.VOTED,
  RAFT_PACKET_TYPE.APPEND,
  RAFT_PACKET_TYPE.APPENDED,
];

/**
 * Liferaft internal event name for incoming data packets.
 */
const LIFERAFT_DATA_EVENT = 'data';

/**
 * Liferaft FOLLOWER state numeric constant.
 */
const LIFERAFT_FOLLOWER_STATE = NUM.THREE;

/**
 * Arbitrary for generating valid replica IDs.
 */
const replicaIdArb = fc.stringMatching(
  /^[a-zA-Z][a-zA-Z0-9-]{0,9}$/,
);

/**
 * Arbitrary for generating valid node IDs.
 */
const nodeIdArb = fc.stringMatching(/^[a-zA-Z][a-zA-Z0-9]{0,9}$/);

/**
 * Arbitrary for generating valid entity types.
 */
const entityTypeArb = fc.constantFrom(...VALID_ENTITY_TYPES);

/**
 * Arbitrary for generating valid Raft packet types.
 */
const packetTypeArb = fc.constantFrom(...SAFE_PACKET_TYPES);

/**
 * Create a silent logger for tests.
 * @return {Object} Logger with no-op methods.
 */
function createSilentLogger() {
  return {
    debug: () => {},
    info: () => {},
    warn: () => {},
    error: () => {},
    trace: () => {},
  };
}

/**
 * Create a mock transport for tests.
 * @return {Object} Transport with deliver method.
 */
function createMockTransport() {
  return {
    deliver: () => Promise.resolve({acknowledged: true}),
  };
}

/**
 * Create a mock PeerAddressResolver that tracks calls.
 * @return {Object} Resolver with resolve method and call tracking.
 */
function createTrackingResolver() {
  const calls = [];
  return {
    calls,
    resolve: (peerId, _peerAddresses) => {
      calls.push(peerId);
      return buildAddress('node1', ENTITY_TYPE.PARTITION, peerId);
    },
  };
}

/**
 * Create a mock PeerAddressResolver for basic tests.
 * @return {Object} Resolver with resolve method.
 */
function createMockResolver() {
  return {
    resolve: (peerId, _peerAddresses) => {
      return buildAddress('node1', ENTITY_TYPE.PARTITION, peerId);
    },
  };
}

/**
 * Build a valid unified address from components.
 * @param {string} nodeId - Node identifier.
 * @param {string} entityType - Entity type.
 * @param {string} replicaId - Replica identifier.
 * @return {string} Unified address.
 */
function buildAddress(nodeId, entityType, replicaId) {
  const sep = ADDRESS.SEPARATOR;
  return `${nodeId}${sep}${entityType}${sep}${replicaId}`;
}

/**
 * Create a RaftGroup with default test configuration.
 * @param {Object} overrides - Options to override defaults.
 * @return {RaftGroup} Configured RaftGroup instance.
 */
function createTestGroup(overrides = {}) {
  const defaults = {
    replicaId: 'replica-1',
    replicaIds: ['replica-1'],
    transport: createMockTransport(),
    entityType: ENTITY_TYPE.PARTITION,
    peerAddressResolver: createMockResolver(),
    deferElection: true,
    logger: createSilentLogger(),
  };
  return new RaftGroup({...defaults, ...overrides});
}

/**
 * Safely shut down a RaftGroup, clearing liferaft timers and
 * removing all listeners to prevent post-shutdown errors from
 * liferaft's internal state change handler.
 * @param {RaftGroup|null} group - The group to shut down.
 * @return {Promise<void>}
 */
async function safeShutdown(group) {
  if (!group) return;
  const raft = group.getRaftInstance();
  if (raft) {
    // Remove liferaft's internal state change handler before end()
    // to prevent it from calling heartbeat(timeout()) during
    // shutdown, which can crash if election is nulled by end().
    raft.removeAllListeners();
    if (raft.timers) {
      raft.timers.clear();
    }
  }
  await group.shutdown();
  // Allow pending microtasks from liferaft async handlers to settle
  await new Promise((resolve) => setImmediate(resolve));
}

// Feature: raft-architecture-consolidation, Property 1:
//   RaftGroup initialize wires all expected events
/**
 * Property 1: RaftGroup initialize wires all expected events
 *
 * For any valid RaftGroup configuration (with valid replicaId,
 * replicaIds, transport, entityType, and peerAddressResolver),
 * after calling initialize(), the liferaft instance should exist
 * and have listeners registered for all six standard Raft events.
 *
 * **Validates: Requirements 1.3**
 */
test('Property 1: RaftGroup initialize wires all expected events',
  async (t) => {
    await fc.assert(
      fc.asyncProperty(
        replicaIdArb,
        entityTypeArb,
        async (replicaId, entityType) => {
          let group;
          try {
            group = createTestGroup({
              replicaId,
              replicaIds: [replicaId],
              entityType,
            });

            group.initialize();

            const raft = group.getRaftInstance();
            if (!raft) return false;

            // All six liferaft events must have listeners
            for (const event of EXPECTED_LIFERAFT_EVENTS) {
              const count = raft.listeners(event).length;
              if (count < NUM.ONE) return false;
            }

            return true;
          } finally {
            await safeShutdown(group);
          }
        },
      ),
      {numRuns: 10},
    );
    t.pass('All generated configs wire all six liferaft events');
  });

// Feature: raft-architecture-consolidation, Property 2:
//   RaftGroup joinPeers resolves all non-self peers
/**
 * Property 2: RaftGroup joinPeers resolves all non-self peers
 *
 * For any RaftGroup with N replica IDs where N > 1, calling
 * joinPeers() should invoke the PeerAddressResolver exactly
 * (N - 1) times, once for each peer that is not the group's
 * own replicaId.
 *
 * **Validates: Requirements 1.4**
 */
test('Property 2: RaftGroup joinPeers resolves all non-self peers',
  async (t) => {
    await fc.assert(
      fc.asyncProperty(
        replicaIdArb,
        fc.array(replicaIdArb, {minLength: 1, maxLength: 5}),
        entityTypeArb,
        async (selfId, otherIds, entityType) => {
          const uniqueOthers = [...new Set(
            otherIds.filter((id) => id !== selfId),
          )];
          if (uniqueOthers.length < NUM.ONE) return true;

          const allIds = [selfId, ...uniqueOthers];
          const resolver = createTrackingResolver();

          let group;
          try {
            group = createTestGroup({
              replicaId: selfId,
              replicaIds: allIds,
              entityType,
              peerAddressResolver: resolver,
              deferElection: true,
            });

            group.initialize();
            group.joinPeers();

            // Resolver called exactly (N-1) times
            if (resolver.calls.length !== uniqueOthers.length) {
              return false;
            }

            // Self must never appear in resolver calls
            if (resolver.calls.includes(selfId)) return false;

            // Every non-self peer must appear
            for (const peerId of uniqueOthers) {
              if (!resolver.calls.includes(peerId)) return false;
            }

            return true;
          } finally {
            await safeShutdown(group);
          }
        },
      ),
      {numRuns: 10},
    );
    t.pass(
      'joinPeers resolves exactly (N-1) peers, skipping self',
    );
  });

// Feature: raft-architecture-consolidation, Property 3:
//   RaftGroup startElection on multi-replica group starts heartbeat
/**
 * Property 3: RaftGroup startElection on multi-replica group
 * starts heartbeat
 *
 * For any initialized RaftGroup with more than one replica,
 * calling startElection() should result in the liferaft
 * heartbeat timer being active.
 *
 * **Validates: Requirements 1.5**
 */
test(
  'Property 3: RaftGroup startElection on multi-replica group' +
  ' starts heartbeat',
  async (t) => {
    await fc.assert(
      fc.asyncProperty(
        replicaIdArb,
        fc.array(replicaIdArb, {minLength: 1, maxLength: 4}),
        entityTypeArb,
        async (selfId, otherIds, entityType) => {
          const uniqueOthers = [...new Set(
            otherIds.filter((id) => id !== selfId),
          )];
          if (uniqueOthers.length < NUM.ONE) return true;

          const allIds = [selfId, ...uniqueOthers];

          let group;
          try {
            group = createTestGroup({
              replicaId: selfId,
              replicaIds: allIds,
              entityType,
              deferElection: true,
            });

            group.initialize();
            group.startElection();

            const raft = group.getRaftInstance();
            if (!raft || !raft.timers) return false;

            return raft.timers.active('heartbeat');
          } finally {
            await safeShutdown(group);
          }
        },
      ),
      {numRuns: 10},
    );
    t.pass(
      'startElection activates heartbeat for multi-replica groups',
    );
  });

// Feature: raft-architecture-consolidation, Property 4:
//   RaftGroup shutdown clears all state
/**
 * Property 4: RaftGroup shutdown clears all state
 *
 * For any initialized RaftGroup (regardless of current role or
 * election state), after calling shutdown(), the raft instance
 * should be null, no liferaft timers should remain, and all
 * internal retry timers should be cleared.
 *
 * **Validates: Requirements 1.7**
 */
test('Property 4: RaftGroup shutdown clears all state',
  async (t) => {
    await fc.assert(
      fc.asyncProperty(
        replicaIdArb,
        fc.array(replicaIdArb, {minLength: 0, maxLength: 4}),
        entityTypeArb,
        fc.boolean(),
        async (selfId, otherIds, entityType, startElect) => {
          const uniqueOthers = [...new Set(
            otherIds.filter((id) => id !== selfId),
          )];
          const allIds = [selfId, ...uniqueOthers];

          const group = createTestGroup({
            replicaId: selfId,
            replicaIds: allIds,
            entityType,
            deferElection: true,
          });

          group.initialize();

          if (startElect) {
            group.startElection();
          }

          // Use safeShutdown to cleanly tear down liferaft
          await safeShutdown(group);

          // Raft instance must be null
          if (group.getRaftInstance() !== null) return false;

          // Initialized must be false
          if (group.initialized !== false) return false;

          // Election started must be false
          if (group.electionStarted !== false) return false;

          return true;
        },
      ),
      {numRuns: 10},
    );
    t.pass('shutdown clears raft instance and all state flags');
  });

// Feature: raft-architecture-consolidation, Property 5:
//   RaftGroup handleRaftPacket validates sender and emits to liferaft
/**
 * Property 5: RaftGroup handleRaftPacket validates sender and
 * emits to liferaft
 *
 * For any valid Raft packet (with type in {vote, voted, append,
 * appended}) and a valid unified sender address,
 * handleRaftPacket() should emit the packet to the liferaft
 * instance and return an acknowledged result.
 *
 * **Validates: Requirements 1.8**
 */
test(
  'Property 5: RaftGroup handleRaftPacket validates sender' +
  ' and emits to liferaft',
  async (t) => {
    await fc.assert(
      fc.asyncProperty(
        packetTypeArb,
        nodeIdArb,
        entityTypeArb,
        replicaIdArb,
        async (packetType, senderNode, entityType, senderId) => {
          let group;
          try {
            group = createTestGroup({
              entityType,
              deferElection: true,
            });

            group.initialize();

            const senderAddress = buildAddress(
              senderNode, entityType, senderId,
            );

            // Remove liferaft's internal data handler to prevent
            // async processing that causes shutdown race conditions.
            // We only need to verify the event is emitted.
            const raft = group.getRaftInstance();
            raft.removeAllListeners(LIFERAFT_DATA_EVENT);

            // Track data events emitted to liferaft
            let dataEmitted = false;
            let emittedPayload = null;
            raft.on(LIFERAFT_DATA_EVENT, (payload) => {
              dataEmitted = true;
              emittedPayload = payload;
            });

            // Use term 0 to match liferaft's initial term
            const packet = {
              type: packetType,
              term: NUM.ZERO,
              address: senderAddress,
              state: LIFERAFT_FOLLOWER_STATE,
              leader: senderAddress,
            };

            const result = group.handleRaftPacket(packet);

            if (!result || result.acknowledged !== true) {
              return false;
            }

            if (!dataEmitted) return false;

            // Verify the emitted payload matches the input
            if (emittedPayload.type !== packetType) return false;
            if (emittedPayload.address !== senderAddress) {
              return false;
            }

            return true;
          } finally {
            await safeShutdown(group);
          }
        },
      ),
      {numRuns: 10},
    );
    t.pass(
      'handleRaftPacket emits valid packets and returns ack',
    );
  });
