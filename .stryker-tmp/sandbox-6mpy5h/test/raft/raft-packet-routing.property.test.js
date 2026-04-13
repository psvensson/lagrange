/**
 * Property test for Raft Packet Routing Correctness.
 *
 * Property 7: For any valid Raft packet received by handleRaftPacket,
 * if the sender address is in valid unified format, the packet SHALL be
 * routed to liferaft and a response SHALL be sent via transport.
 *
 * **Validates: Requirements 1.4**
 *
 * Feature: test-coverage-improvements
 * Property: Raft Packet Routing Correctness
 */
// @ts-nocheck


import {test} from '../../src/test-helpers/tap.js';
import fc from 'fast-check';
import {RaftReplicaBase} from '../../src/raft/raft-replica-base.js';
import {ENTITY_TYPE} from '../../src/constants/index.js';
import {RAFT_PACKET_TYPE} from '../../src/raft/constants.js';

/**
 * Create a mock addressManager for testing.
 * @return {Object} Mock addressManager
 */
function createMockAddressManager() {
  return {
    format: (nodeId, entityType, serviceId) =>
      `${nodeId}/${entityType}/${serviceId}`,
    validate: (address) => {
      const parts = address.split('/');
      if (parts.length === 3 && parts[0] && parts[1] && parts[2]) {
        return {valid: true};
      }
      return {valid: false, error: 'Invalid format'};
    },
    parse: (address) => {
      const [nodeId, serviceType, serviceId] = address.split('/');
      return {nodeId, serviceType, serviceId};
    },
  };
}

/**
 * Create a mock systemTableCache for testing.
 * @return {Object} Mock systemTableCache
 */
function createMockSystemTableCache() {
  return {
    get: () => null,
  };
}

/**
 * Create a mock logger for testing.
 * @return {Object} Mock logger
 */
function createMockLogger() {
  return {
    trace: () => {},
    debug: () => {},
    info: () => {},
    warn: () => {},
    error: () => {},
    fatal: () => {},
  };
}

/**
 * Concrete implementation for testing abstract base class.
 * All dependencies are injected explicitly — no singletons.
 */
class TestRaftReplica extends RaftReplicaBase {
  constructor(options) {
    super({
      entityType: ENTITY_TYPE.MESSAGE_GROUP,
      subsystemName: 'test-replica',
      addressManager: createMockAddressManager(),
      systemTableCache: createMockSystemTableCache(),
      logger: createMockLogger(),
      ...options,
    });
  }

  async flushRoleUpdate() {
    // No-op for testing
  }

  async flushLeaderNodeUpdate() {
    // No-op for testing
  }
}

/**
 * Create a mock log adapter for testing.
 * @return {Object} Mock log adapter
 */
function createMockLogAdapter() {
  return {
    entries: [],
    append: function(entry, callback) {
      this.entries.push(entry);
      if (callback) callback(null);
    },
    get: function(index, callback) {
      if (callback) callback(null, this.entries[index] || null);
    },
    last: function(callback) {
      const lastEntry = this.entries[this.entries.length - 1] || null;
      if (callback) callback(null, lastEntry);
    },
    getLastInfo: async function() {
      const lastIndex = this.entries.length > 0 ? this.entries.length - 1 : 0;
      const lastEntry = this.entries[lastIndex];
      return {
        index: lastIndex,
        term: lastEntry ? lastEntry.term || 0 : 0,
      };
    },
    has: async function(index) {
      return index >= 0 && index < this.entries.length;
    },
    end: function() {
      // Cleanup method required by liferaft
    },
  };
}

// Valid Raft packet types that don't require special data handling
// vote and voted are safe - they don't require data.index like append ack/fail
const SAFE_RAFT_PACKET_TYPES = [
  RAFT_PACKET_TYPE.VOTE,
  RAFT_PACKET_TYPE.VOTED,
];

// Valid entity types for addresses
const VALID_ENTITY_TYPES = [
  ENTITY_TYPE.PARTITION,
  ENTITY_TYPE.MESSAGE_GROUP,
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
 * Arbitrary for generating valid Raft packet types (safe types only).
 */
const packetTypeArb = fc.constantFrom(...SAFE_RAFT_PACKET_TYPES);

/**
 * Arbitrary for generating valid entity types.
 */
const entityTypeArb = fc.constantFrom(...VALID_ENTITY_TYPES);

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
  fc.record({
    granted: fc.boolean(),
  }),
);

/**
 * Arbitrary for generating a valid unified sender address.
 */
const validSenderAddressArb = fc.record({
  nodeId: nodeIdArb,
  entityType: entityTypeArb,
  entityId: entityIdArb,
}).map(({nodeId, entityType, entityId}) => `${nodeId}/${entityType}/${entityId}`);

/**
 * Arbitrary for generating a complete valid Raft packet with valid sender address.
 */
const validRaftPacketArb = fc.record({
  type: packetTypeArb,
  term: termArb,
  address: validSenderAddressArb,
  state: stateArb,
  leader: fc.option(entityIdArb, {nil: null}),
  last: lastArb,
  data: dataArb,
});

/**
 * Property 7: Raft Packet Routing Correctness
 *
 * For any valid Raft packet received by handleRaftPacket, if the sender
 * address is in valid unified format, the packet SHALL be routed to
 * liferaft and a response SHALL be sent via transport.
 *
 * **Validates: Requirements 1.4**
 */
test('Property: Valid Raft packets are routed to liferaft', async (t) => {
  let replica = null;

  try {
    await fc.assert(
      fc.asyncProperty(
        validRaftPacketArb,
        async (packet) => {
          let dataEventReceived = false;
          let receivedPacket = null;

          // Create mock transport that tracks delivered messages
          const deliveredMessages = [];
          const mockTransport = {
            deliver: async (address, message) => {
              deliveredMessages.push({address, message});
              return {acknowledged: true};
            },
          };

          // Create replica instance
          replica = new TestRaftReplica({
            replicaId: 'replica-1',
            nodeId: 'node-1',
            replicaIds: ['replica-1', 'replica-2'],
            transport: mockTransport,
          });

          const mockLogAdapter = createMockLogAdapter();
          replica.createRaftInstance(mockLogAdapter);

          // Track data events emitted to liferaft
          replica.raft.on('data', (pkt, _write) => {
            dataEventReceived = true;
            receivedPacket = pkt;
          });

          // Handle the Raft packet
          const result = replica.handleRaftPacket(packet);

          // Allow async liferaft operations to settle before shutdown
          await new Promise((resolve) => setTimeout(resolve, 5));

          // Cleanup
          await replica.shutdown();
          replica = null;

          // Verify the packet was acknowledged
          if (!result || !result.acknowledged) {
            return false;
          }

          // Verify the packet was routed to liferaft (data event emitted)
          if (!dataEventReceived) {
            return false;
          }

          // Verify the packet fields were preserved
          if (receivedPacket.type !== packet.type) {
            return false;
          }
          if (receivedPacket.term !== packet.term) {
            return false;
          }
          if (receivedPacket.address !== packet.address) {
            return false;
          }
          if (receivedPacket.state !== packet.state) {
            return false;
          }

          return true;
        },
      ),
      {numRuns: 10},
    );

    t.pass('Valid Raft packets are routed to liferaft');
  } finally {
    if (replica) {
      await replica.shutdown();
    }
  }
});

/**
 * Property: Raft packet routing preserves packet fields.
 *
 * For any valid Raft packet, handleRaftPacket SHALL preserve all packet
 * fields when routing to liferaft.
 *
 * **Validates: Requirements 1.4**
 */
test('Property: Raft packet routing preserves all packet fields', async (t) => {
  let replica = null;

  try {
    await fc.assert(
      fc.asyncProperty(
        validRaftPacketArb,
        async (packet) => {
          let receivedPacket = null;

          const mockTransport = {
            deliver: async () => ({acknowledged: true}),
          };

          replica = new TestRaftReplica({
            replicaId: 'replica-1',
            nodeId: 'node-1',
            replicaIds: ['replica-1', 'replica-2'],
            transport: mockTransport,
          });

          const mockLogAdapter = createMockLogAdapter();
          replica.createRaftInstance(mockLogAdapter);

          replica.raft.on('data', (pkt, _write) => {
            receivedPacket = pkt;
          });

          replica.handleRaftPacket(packet);

          // Allow async liferaft operations to settle
          await new Promise((resolve) => setTimeout(resolve, 5));

          await replica.shutdown();
          replica = null;

          // Verify all fields are preserved
          if (!receivedPacket) {
            return false;
          }

          if (receivedPacket.type !== packet.type) {
            return false;
          }
          if (receivedPacket.term !== packet.term) {
            return false;
          }
          if (receivedPacket.address !== packet.address) {
            return false;
          }
          if (receivedPacket.state !== packet.state) {
            return false;
          }
          if (receivedPacket.leader !== packet.leader) {
            return false;
          }
          if (receivedPacket.last.index !== packet.last.index ||
              receivedPacket.last.term !== packet.last.term) {
            return false;
          }
          if (JSON.stringify(receivedPacket.data) !==
              JSON.stringify(packet.data)) {
            return false;
          }

          return true;
        },
      ),
      {numRuns: 10},
    );

    t.pass('Raft packet routing preserves all packet fields');
  } finally {
    if (replica) {
      await replica.shutdown();
    }
  }
});

/**
 * Property: Response is sent via transport for valid sender addresses.
 *
 * For any valid Raft packet with a valid unified sender address, when
 * liferaft generates a response, it SHALL be sent via the transport.
 *
 * **Validates: Requirements 1.4**
 */
test('Property: Response sent via transport for valid sender address',
  async (t) => {
    try {
      await fc.assert(
        fc.asyncProperty(
          validRaftPacketArb,
          async (packet) => {
            const deliveredMessages = [];
            const mockTransport = {
              deliver: async (address, message) => {
                deliveredMessages.push({address, message});
                return {acknowledged: true};
              },
            };

            const replica = new TestRaftReplica({
              replicaId: 'replica-1',
              nodeId: 'node-1',
              replicaIds: ['replica-1', 'replica-2'],
              transport: mockTransport,
            });

            const mockLogAdapter = createMockLogAdapter();
            replica.createRaftInstance(mockLogAdapter);

            // Simulate liferaft generating a response
            replica.raft.on('data', (_pkt, write) => {
              const responsePacket = {
                type: RAFT_PACKET_TYPE.VOTED,
                term: packet.term,
                address: replica.getUnifiedAddress(),
                state: 0,
                leader: null,
                last: {index: 0, term: 0},
                data: {granted: true},
              };
              write(responsePacket);
            });

            replica.handleRaftPacket(packet);

            // Allow async liferaft operations to settle
            await new Promise((resolve) =>
              setTimeout(resolve, 5));

            await replica.shutdown();

            if (deliveredMessages.length === 0) {
              return false;
            }

            const lastDelivery =
              deliveredMessages[deliveredMessages.length - 1];
            if (lastDelivery.address !== packet.address) {
              return false;
            }

            return true;
          },
        ),
        {numRuns: 10},
      );

      t.pass(
        'Response sent via transport for valid sender address',
      );
    } finally {
      // No singleton cleanup needed
    }
  });

/**
 * Property: Invalid sender addresses skip response sending.
 *
 * For any Raft packet with an invalid sender address (not unified),
 * handleRaftPacket SHALL still route to liferaft but skip response.
 *
 * **Validates: Requirements 1.4, 1.5**
 */
test('Property: Invalid sender addresses skip response sending',
  async (t) => {
    // Arbitrary for invalid sender addresses (missing separator)
    const invalidSenderAddressArb = fc.oneof(
      fc.constant('invalid-address'),
      fc.constant('no-separator'),
      nodeIdArb, // Just a node ID without separator
      fc.constant(''),
    );

    const invalidPacketArb = fc.record({
      type: packetTypeArb,
      term: termArb,
      address: invalidSenderAddressArb,
      state: stateArb,
      leader: fc.option(entityIdArb, {nil: null}),
      last: lastArb,
      data: dataArb,
    });

    try {
      await fc.assert(
        fc.asyncProperty(
          invalidPacketArb,
          async (packet) => {
            const deliveredMessages = [];
            const mockTransport = {
              deliver: async (address, message) => {
                deliveredMessages.push({address, message});
                return {acknowledged: true};
              },
            };

            const replica = new TestRaftReplica({
              replicaId: 'replica-1',
              nodeId: 'node-1',
              replicaIds: ['replica-1', 'replica-2'],
              transport: mockTransport,
            });

            const mockLogAdapter = createMockLogAdapter();
            replica.createRaftInstance(mockLogAdapter);

            let dataEventReceived = false;

            // Simulate liferaft generating a response
            replica.raft.on('data', (_pkt, write) => {
              dataEventReceived = true;
              const responsePacket = {
                type: RAFT_PACKET_TYPE.VOTED,
                term: packet.term,
                address: replica.getUnifiedAddress(),
                state: 0,
                leader: null,
                last: {index: 0, term: 0},
                data: {granted: true},
              };
              write(responsePacket);
            });

            replica.handleRaftPacket(packet);

            // Allow async liferaft operations to settle
            await new Promise((resolve) =>
              setTimeout(resolve, 5));

            await replica.shutdown();

            // Packet should still be routed to liferaft
            if (!dataEventReceived) {
              return false;
            }

            // Response should NOT be sent for invalid address
            if (deliveredMessages.length > 0) {
              return false;
            }

            return true;
          },
        ),
        {numRuns: 10},
      );

      t.pass('Invalid sender addresses skip response sending');
    } finally {
      // No singleton cleanup needed
    }
  });

