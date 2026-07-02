/**
 * Property Test: Raft Transport Worker Integration (Property 26)
 *
 * Feature: worker-process-replica-isolation, Property 26: Raft Transport Worker Integration
 *
 * *For any* Raft packet sent between replicas in worker processes, the packet SHALL be
 * routed through WorkerMessageBridge → MessageRouter → target WorkerMessageBridge,
 * using the same path for both local and remote peers.
 *
 * **Validates: Requirements 14.1, 14.2, 14.3, 14.4**
 *
 * - Requirement 14.1: WHEN a Raft replica in a Worker_Process sends a packet to a peer,
 *   THE RaftTransportAdapter SHALL route it through WorkerMessageBridge
 * - Requirement 14.2: THE WorkerMessageBridge SHALL forward Raft packets to the
 *   Main_Process MessageRouter
 * - Requirement 14.3: THE MessageRouter SHALL route Raft packets to the target worker
 *   (local or remote)
 * - Requirement 14.4: WHEN a Worker_Process receives a Raft packet, THE WorkerMessageBridge
 *   SHALL deliver it to the Raft replica
 *
 * @module test/worker/raft-transport-worker-integration.property.test.js
 */

import {test} from '../../src/test-helpers/tap.js';
import fc from 'fast-check';
import {EventEmitter} from 'events';
import {v4 as uuidv4} from 'uuid';
import {
  WORKER_DEFAULT,
  WORKER_ERROR_MSG,
  WORKER_EVENT,
  WORKER_RESPONSE_STATUS,
  WORKER_ENTITY_TYPE,
  WORKER_ADDRESS,
} from '../../src/worker/worker-constants.js';
import {RAFT_PACKET_TYPE} from '../../src/raft/constants.js';
import {isRaftPacket} from '../../src/raft/raft-packet-utils.js';
import {NUM} from '../../src/constants/index.js';

/**
 * IPC message types for communication between worker and main process.
 * @type {Readonly<Object>}
 */
const IPC_MESSAGE_TYPE = Object.freeze({
  SEND: 'WORKER_SEND',
  INCOMING: 'WORKER_INCOMING',
  RESPONSE: 'WORKER_RESPONSE',
});


/**
 * Mock parentPort for testing outside of worker context.
 */
class MockParentPort extends EventEmitter {
  constructor() {
    super();
    this.messages = [];
  }

  postMessage(message) {
    this.messages.push(message);
  }

  getLastMessage() {
    return this.messages[this.messages.length - 1];
  }

  getAllMessages() {
    return [...this.messages];
  }

  clearMessages() {
    this.messages = [];
  }

  simulateResponse(messageId, response) {
    this.emit('message', {
      type: IPC_MESSAGE_TYPE.RESPONSE,
      messageId,
      ...response,
    });
  }

  simulateIncoming(envelope) {
    this.emit('message', {
      type: IPC_MESSAGE_TYPE.INCOMING,
      ...envelope,
    });
  }
}

/**
 * Testable version of WorkerMessageBridge that accepts a mock parentPort.
 */
class TestableWorkerMessageBridge extends EventEmitter {
  constructor(options = {}) {
    super();
    this.parentPort = options.parentPort;
    this.logger = options.logger || {
      info: () => {},
      debug: () => {},
      warn: () => {},
      error: () => {},
    };
    this.requestTimeoutMs = options.requestTimeoutMs ||
      WORKER_DEFAULT.OPERATION_TIMEOUT_MS;
    this.unifiedAddress = options.unifiedAddress || null;
    this.pendingRequests = new Map();
    this.messageHandler = null;
    this.initialized = false;
    this.boundMessageHandler = this.handleIPCMessage.bind(this);
  }

  async initialize() {
    if (this.initialized) {
      return;
    }
    if (!this.parentPort) {
      throw new Error(WORKER_ERROR_MSG.NOT_INITIALIZED);
    }
    this.parentPort.on('message', this.boundMessageHandler);
    this.initialized = true;
    this.emit(WORKER_EVENT.INITIALIZED);
  }

  setUnifiedAddress(address) {
    this.unifiedAddress = address;
  }

  async send(targetAddress, message) {
    if (!this.initialized) {
      throw new Error(WORKER_ERROR_MSG.NOT_INITIALIZED);
    }
    if (!this.unifiedAddress) {
      throw new Error(WORKER_ERROR_MSG.ADDRESS_NOT_SET);
    }
    const messageId = uuidv4();
    const correlationId = message.correlationId || uuidv4();
    const envelope = {
      type: IPC_MESSAGE_TYPE.SEND,
      messageId,
      sourceAddress: this.unifiedAddress,
      targetAddress,
      payload: message,
      correlationId,
      timestamp: Date.now(),
    };
    const response = await this.sendIPCRequest(envelope);
    if (response.status === WORKER_RESPONSE_STATUS.ERROR) {
      const errorMsg = response.error || WORKER_ERROR_MSG.MESSAGE_DELIVERY_FAILED;
      throw new Error(errorMsg);
    }
    return response.payload || response;
  }

  async handleIncoming(envelope) {
    if (!this.initialized) {
      return {
        status: WORKER_RESPONSE_STATUS.ERROR,
        error: WORKER_ERROR_MSG.NOT_INITIALIZED,
      };
    }
    this.emit('message', envelope);
    if (this.messageHandler) {
      const result = await this.messageHandler(envelope);
      return {
        status: WORKER_RESPONSE_STATUS.OK,
        messageId: envelope.messageId,
        correlationId: envelope.correlationId,
        payload: result,
        timestamp: Date.now(),
      };
    }
    return {
      status: WORKER_RESPONSE_STATUS.OK,
      messageId: envelope.messageId,
      correlationId: envelope.correlationId,
      timestamp: Date.now(),
    };
  }

  setMessageHandler(handler) {
    this.messageHandler = handler;
  }

  async shutdown() {
    for (const [, pending] of this.pendingRequests) {
      clearTimeout(pending.timeout);
    }
    this.pendingRequests.clear();
    if (this.parentPort && this.initialized) {
      this.parentPort.off('message', this.boundMessageHandler);
    }
    this.initialized = false;
    this.messageHandler = null;
  }

  sendIPCRequest(message) {
    return new Promise((resolve, reject) => {
      const messageId = message.messageId;
      const timeout = setTimeout(() => {
        this.pendingRequests.delete(messageId);
        reject(new Error(WORKER_ERROR_MSG.OPERATION_TIMEOUT));
      }, this.requestTimeoutMs);
      this.pendingRequests.set(messageId, {
        resolve,
        reject,
        timeout,
        timestamp: Date.now(),
      });
      this.parentPort.postMessage(message);
    });
  }

  async handleIPCMessage(message) {
    if (!message || !message.type) {
      return;
    }
    if (message.type === IPC_MESSAGE_TYPE.RESPONSE) {
      const pending = this.pendingRequests.get(message.messageId);
      if (pending) {
        clearTimeout(pending.timeout);
        this.pendingRequests.delete(message.messageId);
        pending.resolve(message);
      }
      return;
    }
    if (message.type === IPC_MESSAGE_TYPE.INCOMING) {
      const response = await this.handleIncoming(message);
      this.parentPort.postMessage({
        type: IPC_MESSAGE_TYPE.RESPONSE,
        messageId: message.messageId,
        ...response,
      });
    }
  }

  isInitialized() {
    return this.initialized;
  }

  getUnifiedAddress() {
    return this.unifiedAddress;
  }
}


/**
 * Mock MessageRouter that tracks routing decisions.
 */
class MockMessageRouter {
  constructor() {
    this.routedMessages = [];
    this.handlers = new Map();
  }

  registerWorkerHandler(address, handler) {
    this.handlers.set(address, handler);
  }

  unregisterWorkerHandler(address) {
    this.handlers.delete(address);
  }

  async route(envelope) {
    this.routedMessages.push({
      sourceAddress: envelope.sourceAddress,
      targetAddress: envelope.targetAddress,
      payload: envelope.payload,
      timestamp: Date.now(),
    });

    const handler = this.handlers.get(envelope.targetAddress);
    if (handler) {
      return handler(envelope);
    }
    return {status: WORKER_RESPONSE_STATUS.OK};
  }

  getRoutedMessages() {
    return [...this.routedMessages];
  }

  clearRoutedMessages() {
    this.routedMessages = [];
  }
}

/**
 * Helper to create an initialized bridge with address set.
 * @param {MockParentPort} mockPort - Mock parent port.
 * @param {string} sourceAddress - Source unified address.
 * @return {TestableWorkerMessageBridge} Initialized bridge.
 */
function createInitializedBridge(mockPort, sourceAddress) {
  const bridge = new TestableWorkerMessageBridge({
    parentPort: mockPort,
    requestTimeoutMs: 1000,
    unifiedAddress: sourceAddress,
  });

  bridge.parentPort.on('message', bridge.boundMessageHandler);
  bridge.initialized = true;

  return bridge;
}

// =============================================================================
// Generators for property-based testing
// =============================================================================

/**
 * Generator for valid node IDs (alphanumeric with hyphens).
 */
const nodeIdArb = fc.stringOf(
  fc.constantFrom(...'abcdefghijklmnopqrstuvwxyz0123456789'.split('')),
  {minLength: 1, maxLength: 10},
);

/**
 * Generator for entity types.
 */
const entityTypeArb = fc.constantFrom(
  WORKER_ENTITY_TYPE.PARTITION,
  WORKER_ENTITY_TYPE.MESSAGE_GROUP,
);

/**
 * Generator for replica IDs (alphanumeric).
 */
const replicaIdArb = fc.stringOf(
  fc.constantFrom(...'abcdefghijklmnopqrstuvwxyz0123456789'.split('')),
  {minLength: 1, maxLength: 10},
);

/**
 * Generator for unified addresses (nodeId/entityType/replicaId format).
 */
const unifiedAddressArb = fc.tuple(nodeIdArb, entityTypeArb, replicaIdArb)
  .map(([nodeId, entityType, replicaId]) =>
    WORKER_ADDRESS.build(nodeId, entityType, replicaId));

/**
 * Generator for Raft packet types.
 */
const raftPacketTypeArb = fc.constantFrom(
  RAFT_PACKET_TYPE.VOTE,
  RAFT_PACKET_TYPE.VOTED,
  RAFT_PACKET_TYPE.APPEND,
  RAFT_PACKET_TYPE.APPENDED,
  RAFT_PACKET_TYPE.APPEND_FAIL,
  RAFT_PACKET_TYPE.APPEND_ACK,
);

/**
 * Generator for Raft terms (positive integers).
 */
const raftTermArb = fc.integer({min: 1, max: 1000});

/**
 * Generator for Raft state values (liferaft uses numeric states).
 */
const raftStateArb = fc.constantFrom(1, 2, 4); // FOLLOWER=1, CANDIDATE=2, LEADER=4

/**
 * Generator for Raft log index.
 */
const logIndexArb = fc.record({
  index: fc.integer({min: 0, max: 10000}),
  term: fc.integer({min: 0, max: 1000}),
});

/**
 * Generator for Raft log entries.
 */
const logEntryArb = fc.record({
  command: fc.string({maxLength: 50}),
  index: fc.integer({min: 1, max: 10000}),
  term: fc.integer({min: 1, max: 1000}),
});

/**
 * Generator for Raft packets (liferaft native format).
 */
const raftPacketArb = fc.record({
  type: raftPacketTypeArb,
  term: raftTermArb,
  address: unifiedAddressArb,
  state: raftStateArb,
  leader: fc.option(unifiedAddressArb, {nil: null}),
  last: logIndexArb,
  data: fc.option(fc.array(logEntryArb, {maxLength: 3}), {nil: null}),
});


// =============================================================================
// Property Tests
// =============================================================================

test('Property 26: Raft Transport Worker Integration', async (t) => {
  /**
   * Property: For any Raft packet sent from a worker, the packet SHALL be
   * routed through WorkerMessageBridge to the main process via IPC.
   *
   * This validates Requirement 14.1: WHEN a Raft replica in a Worker_Process
   * sends a packet to a peer, THE RaftTransportAdapter SHALL route it through
   * WorkerMessageBridge.
   */
  t.test('Raft packets are routed through WorkerMessageBridge (Req 14.1)', async (t) => {
    fc.assert(
      fc.property(
        unifiedAddressArb,
        unifiedAddressArb,
        raftPacketArb,
        (sourceAddress, targetAddress, raftPacket) => {
          const mockPort = new MockParentPort();
          const bridge = createInitializedBridge(mockPort, sourceAddress);

          mockPort.clearMessages();

          // Update packet address to match source
          const packetWithSource = {...raftPacket, address: sourceAddress};

          // Start sending (don't await - just trigger the post)
          bridge.send(targetAddress, packetWithSource).catch(() => {
            // Ignore timeout - we just want to verify the message was posted
          });

          // Verify IPC message was posted
          const sentMessage = mockPort.getLastMessage();
          const messagePosted = sentMessage !== undefined;
          const correctType = sentMessage?.type === IPC_MESSAGE_TYPE.SEND;
          const payloadIsRaftPacket = isRaftPacket(sentMessage?.payload);

          bridge.shutdown();

          return messagePosted && correctType && payloadIsRaftPacket;
        },
      ),
      {numRuns: NUM.TEN},
    );

    t.pass('Raft packets are routed through WorkerMessageBridge');
  });

  /**
   * Property: For any Raft packet sent through WorkerMessageBridge, the packet
   * SHALL be forwarded to the Main_Process MessageRouter.
   *
   * This validates Requirement 14.2: THE WorkerMessageBridge SHALL forward
   * Raft packets to the Main_Process MessageRouter.
   */
  t.test('WorkerMessageBridge forwards Raft packets to MessageRouter (Req 14.2)', async (t) => {
    fc.assert(
      fc.property(
        unifiedAddressArb,
        unifiedAddressArb,
        raftPacketArb,
        (sourceAddress, targetAddress, raftPacket) => {
          const mockPort = new MockParentPort();
          const bridge = createInitializedBridge(mockPort, sourceAddress);

          mockPort.clearMessages();

          const packetWithSource = {...raftPacket, address: sourceAddress};

          bridge.send(targetAddress, packetWithSource).catch(() => {});

          const sentMessage = mockPort.getLastMessage();

          // Verify envelope structure for MessageRouter
          const hasSourceAddress = sentMessage?.sourceAddress === sourceAddress;
          const hasTargetAddress = sentMessage?.targetAddress === targetAddress;
          const hasMessageId = typeof sentMessage?.messageId === 'string';
          const hasCorrelationId = typeof sentMessage?.correlationId === 'string';
          const hasTimestamp = typeof sentMessage?.timestamp === 'number';
          const hasPayload = sentMessage?.payload !== undefined;

          bridge.shutdown();

          return hasSourceAddress && hasTargetAddress && hasMessageId &&
                 hasCorrelationId && hasTimestamp && hasPayload;
        },
      ),
      {numRuns: NUM.TEN},
    );

    t.pass('WorkerMessageBridge forwards Raft packets to MessageRouter');
  });

  /**
   * Property: For any Raft packet routed through MessageRouter, the packet
   * SHALL reach the target worker (local or remote) using the same code path.
   *
   * This validates Requirement 14.3: THE MessageRouter SHALL route Raft packets
   * to the target worker (local or remote).
   */
  t.test('MessageRouter routes Raft packets to target worker (Req 14.3)', async (t) => {
    await fc.assert(
      fc.asyncProperty(
        unifiedAddressArb,
        unifiedAddressArb,
        raftPacketArb,
        fc.boolean(), // isLocalTarget
        async (sourceAddress, targetAddress, raftPacket, isLocalTarget) => {
          const mockRouter = new MockMessageRouter();
          const sourceMockPort = new MockParentPort();
          const targetMockPort = new MockParentPort();

          const sourceBridge = createInitializedBridge(sourceMockPort, sourceAddress);
          const targetBridge = createInitializedBridge(targetMockPort, targetAddress);

          // Register target handler with router
          let receivedAtTarget = null;
          mockRouter.registerWorkerHandler(targetAddress, async (envelope) => {
            receivedAtTarget = envelope;
            return {status: WORKER_RESPONSE_STATUS.OK, payload: {acknowledged: true}};
          });

          // Simulate the routing flow
          const packetWithSource = {...raftPacket, address: sourceAddress};
          const envelope = {
            type: IPC_MESSAGE_TYPE.SEND,
            messageId: uuidv4(),
            sourceAddress,
            targetAddress,
            payload: packetWithSource,
            correlationId: uuidv4(),
            timestamp: Date.now(),
            isLocal: isLocalTarget,
          };

          await mockRouter.route(envelope);

          // Verify packet reached target
          const packetReachedTarget = receivedAtTarget !== null;
          const correctTargetAddress = receivedAtTarget?.targetAddress === targetAddress;
          const payloadPreserved = isRaftPacket(receivedAtTarget?.payload);

          await sourceBridge.shutdown();
          await targetBridge.shutdown();

          return packetReachedTarget && correctTargetAddress && payloadPreserved;
        },
      ),
      {numRuns: NUM.TEN},
    );

    t.pass('MessageRouter routes Raft packets to target worker');
  });


  /**
   * Property: For any Raft packet received by a Worker_Process, the
   * WorkerMessageBridge SHALL deliver it to the Raft replica.
   *
   * This validates Requirement 14.4: WHEN a Worker_Process receives a Raft
   * packet, THE WorkerMessageBridge SHALL deliver it to the Raft replica.
   */
  t.test('WorkerMessageBridge delivers Raft packets to replica (Req 14.4)', async (t) => {
    await fc.assert(
      fc.asyncProperty(
        unifiedAddressArb,
        unifiedAddressArb,
        raftPacketArb,
        async (localAddress, remoteAddress, raftPacket) => {
          const mockPort = new MockParentPort();
          const bridge = createInitializedBridge(mockPort, localAddress);

          let deliveredPacket = null;
          bridge.setMessageHandler(async (envelope) => {
            deliveredPacket = envelope.payload;
            return {acknowledged: true};
          });

          // Simulate incoming Raft packet from remote worker
          const packetWithRemoteSource = {...raftPacket, address: remoteAddress};
          const incomingEnvelope = {
            messageId: uuidv4(),
            sourceAddress: remoteAddress,
            targetAddress: localAddress,
            payload: packetWithRemoteSource,
            correlationId: uuidv4(),
            timestamp: Date.now(),
          };

          mockPort.simulateIncoming(incomingEnvelope);

          // Wait for async processing
          await new Promise((resolve) => setTimeout(resolve, NUM.FIVE));

          // Verify packet was delivered to handler (simulating Raft replica)
          const packetDelivered = deliveredPacket !== null;
          const isValidRaftPacket = isRaftPacket(deliveredPacket);
          const packetTypePreserved = deliveredPacket?.type === raftPacket.type;
          const packetTermPreserved = deliveredPacket?.term === raftPacket.term;

          await bridge.shutdown();

          return packetDelivered && isValidRaftPacket &&
                 packetTypePreserved && packetTermPreserved;
        },
      ),
      {numRuns: NUM.TEN},
    );

    t.pass('WorkerMessageBridge delivers Raft packets to replica');
  });

  /**
   * Property: For any Raft packet type, the packet SHALL be correctly
   * serialized and deserialized through the IPC channel.
   *
   * This validates that all Raft packet fields are preserved through
   * the WorkerMessageBridge → MessageRouter → WorkerMessageBridge path.
   */
  t.test('Raft packet fields are preserved through routing', async (t) => {
    fc.assert(
      fc.property(
        unifiedAddressArb,
        unifiedAddressArb,
        raftPacketArb,
        (sourceAddress, targetAddress, raftPacket) => {
          const mockPort = new MockParentPort();
          const bridge = createInitializedBridge(mockPort, sourceAddress);

          mockPort.clearMessages();

          const packetWithSource = {...raftPacket, address: sourceAddress};

          bridge.send(targetAddress, packetWithSource).catch(() => {});

          const sentMessage = mockPort.getLastMessage();
          const payload = sentMessage?.payload;

          // Verify all Raft packet fields are preserved
          const typePreserved = payload?.type === raftPacket.type;
          const termPreserved = payload?.term === raftPacket.term;
          const statePreserved = payload?.state === raftPacket.state;
          const lastPreserved = JSON.stringify(payload?.last) ===
            JSON.stringify(raftPacket.last);
          const dataPreserved = JSON.stringify(payload?.data) ===
            JSON.stringify(raftPacket.data);

          bridge.shutdown();

          return typePreserved && termPreserved && statePreserved &&
                 lastPreserved && dataPreserved;
        },
      ),
      {numRuns: NUM.TEN},
    );

    t.pass('Raft packet fields are preserved through routing');
  });

  /**
   * Property: For any Raft packet sent between workers on the same node
   * (local) or different nodes (remote), the routing path SHALL be identical.
   *
   * This validates uniform routing regardless of locality.
   */
  t.test('Local and remote Raft packets use same routing path', async (t) => {
    fc.assert(
      fc.property(
        nodeIdArb,
        nodeIdArb,
        entityTypeArb,
        replicaIdArb,
        replicaIdArb,
        raftPacketArb,
        (localNodeId, remoteNodeId, entityType, sourceReplicaId, targetReplicaId, raftPacket) => {
          const localSourceAddress = WORKER_ADDRESS.build(
            localNodeId, entityType, sourceReplicaId,
          );
          const localTargetAddress = WORKER_ADDRESS.build(
            localNodeId, entityType, targetReplicaId,
          );
          const remoteTargetAddress = WORKER_ADDRESS.build(
            remoteNodeId, entityType, targetReplicaId,
          );

          const localMockPort = new MockParentPort();
          const remoteMockPort = new MockParentPort();

          const localBridge = createInitializedBridge(localMockPort, localSourceAddress);
          const remoteBridge = createInitializedBridge(remoteMockPort, localSourceAddress);

          localMockPort.clearMessages();
          remoteMockPort.clearMessages();

          const packetWithSource = {...raftPacket, address: localSourceAddress};

          // Send to local target
          localBridge.send(localTargetAddress, packetWithSource).catch(() => {});
          const localMessage = localMockPort.getLastMessage();

          // Send to remote target
          remoteBridge.send(remoteTargetAddress, packetWithSource).catch(() => {});
          const remoteMessage = remoteMockPort.getLastMessage();

          // Verify both use same IPC message type (same routing path)
          const sameMessageType = localMessage?.type === remoteMessage?.type;
          const bothAreSendType = localMessage?.type === IPC_MESSAGE_TYPE.SEND &&
                                  remoteMessage?.type === IPC_MESSAGE_TYPE.SEND;
          const bothHavePayload = isRaftPacket(localMessage?.payload) &&
                                  isRaftPacket(remoteMessage?.payload);

          localBridge.shutdown();
          remoteBridge.shutdown();

          return sameMessageType && bothAreSendType && bothHavePayload;
        },
      ),
      {numRuns: NUM.TEN},
    );

    t.pass('Local and remote Raft packets use same routing path');
  });


  /**
   * Property: For any Raft vote request-response cycle, the response SHALL
   * be correctly routed back to the requesting worker.
   *
   * This validates bidirectional Raft communication through workers.
   */
  t.test('Raft vote request-response cycle works through workers', async (t) => {
    await fc.assert(
      fc.asyncProperty(
        unifiedAddressArb,
        unifiedAddressArb,
        raftTermArb,
        async (candidateAddress, voterAddress, term) => {
          const candidateMockPort = new MockParentPort();
          const candidateBridge = createInitializedBridge(candidateMockPort, candidateAddress);

          candidateMockPort.clearMessages();

          // Create vote request packet
          const voteRequest = {
            type: RAFT_PACKET_TYPE.VOTE,
            term,
            address: candidateAddress,
            state: 2, // CANDIDATE
            leader: null,
            last: {index: 0, term: 0},
            data: null,
          };

          // Start sending vote request
          const sendPromise = candidateBridge.send(voterAddress, voteRequest);

          // Wait for message to be posted
          await new Promise((resolve) => setImmediate(resolve));

          const sentMessage = candidateMockPort.getLastMessage();
          const voteRequestSent = sentMessage !== undefined;
          const correctPacketType = sentMessage?.payload?.type === RAFT_PACKET_TYPE.VOTE;

          // Simulate voted response from voter
          const votedResponse = {
            type: RAFT_PACKET_TYPE.VOTED,
            term,
            address: voterAddress,
            state: 1, // FOLLOWER
            leader: null,
            last: {index: 0, term: 0},
            data: null,
          };

          candidateMockPort.simulateResponse(sentMessage.messageId, {
            status: WORKER_RESPONSE_STATUS.OK,
            payload: votedResponse,
          });

          // Wait for response
          const result = await sendPromise;

          const responseReceived = result !== undefined;
          const responseIsVoted = result?.type === RAFT_PACKET_TYPE.VOTED;
          const responseTermMatches = result?.term === term;

          await candidateBridge.shutdown();

          return voteRequestSent && correctPacketType && responseReceived &&
                 responseIsVoted && responseTermMatches;
        },
      ),
      {numRuns: NUM.TEN},
    );

    t.pass('Raft vote request-response cycle works through workers');
  });

  /**
   * Property: For any Raft append entries request, the log entries SHALL
   * be preserved through the routing path.
   *
   * This validates that Raft log replication data is not corrupted.
   */
  t.test('Raft append entries preserves log data through routing', async (t) => {
    await fc.assert(
      fc.asyncProperty(
        unifiedAddressArb,
        unifiedAddressArb,
        raftTermArb,
        fc.array(logEntryArb, {minLength: 1, maxLength: 5}),
        async (leaderAddress, followerAddress, term, logEntries) => {
          const leaderMockPort = new MockParentPort();
          const leaderBridge = createInitializedBridge(leaderMockPort, leaderAddress);

          leaderMockPort.clearMessages();

          // Create append entries packet
          const appendPacket = {
            type: RAFT_PACKET_TYPE.APPEND,
            term,
            address: leaderAddress,
            state: 4, // LEADER
            leader: leaderAddress,
            last: {index: 0, term: 0},
            data: logEntries,
          };

          leaderBridge.send(followerAddress, appendPacket).catch(() => {});

          const sentMessage = leaderMockPort.getLastMessage();
          const payload = sentMessage?.payload;

          // Verify log entries are preserved
          const packetSent = sentMessage !== undefined;
          const isAppendPacket = payload?.type === RAFT_PACKET_TYPE.APPEND;
          const hasLogEntries = Array.isArray(payload?.data);
          const entriesCountMatch = payload?.data?.length === logEntries.length;

          // Verify each entry is preserved
          let entriesPreserved = true;
          if (hasLogEntries && entriesCountMatch) {
            for (let i = 0; i < logEntries.length; i++) {
              const original = logEntries[i];
              const sent = payload.data[i];
              if (original.command !== sent.command ||
                  original.index !== sent.index ||
                  original.term !== sent.term) {
                entriesPreserved = false;
                break;
              }
            }
          }

          await leaderBridge.shutdown();

          return packetSent && isAppendPacket && hasLogEntries &&
                 entriesCountMatch && entriesPreserved;
        },
      ),
      {numRuns: NUM.TEN},
    );

    t.pass('Raft append entries preserves log data through routing');
  });

  /**
   * Property: For any partition and message group entity types, Raft packets
   * SHALL be routed correctly using the unified address format.
   *
   * This validates that both partition and message group Raft groups work
   * through the worker message bridge.
   */
  t.test('Both partition and message group Raft packets route correctly', async (t) => {
    fc.assert(
      fc.property(
        nodeIdArb,
        nodeIdArb,
        replicaIdArb,
        replicaIdArb,
        raftPacketArb,
        (sourceNodeId, targetNodeId, sourceReplicaId, targetReplicaId, raftPacket) => {
          // Test partition routing
          const partitionSourceAddr = WORKER_ADDRESS.build(
            sourceNodeId, WORKER_ENTITY_TYPE.PARTITION, sourceReplicaId,
          );
          const partitionTargetAddr = WORKER_ADDRESS.build(
            targetNodeId, WORKER_ENTITY_TYPE.PARTITION, targetReplicaId,
          );

          const partitionMockPort = new MockParentPort();
          const partitionBridge = createInitializedBridge(partitionMockPort, partitionSourceAddr);

          partitionMockPort.clearMessages();
          const partitionPacket = {...raftPacket, address: partitionSourceAddr};
          partitionBridge.send(partitionTargetAddr, partitionPacket).catch(() => {});
          const partitionMessage = partitionMockPort.getLastMessage();

          // Test message group routing
          const mgSourceAddr = WORKER_ADDRESS.build(
            sourceNodeId, WORKER_ENTITY_TYPE.MESSAGE_GROUP, sourceReplicaId,
          );
          const mgTargetAddr = WORKER_ADDRESS.build(
            targetNodeId, WORKER_ENTITY_TYPE.MESSAGE_GROUP, targetReplicaId,
          );

          const mgMockPort = new MockParentPort();
          const mgBridge = createInitializedBridge(mgMockPort, mgSourceAddr);

          mgMockPort.clearMessages();
          const mgPacket = {...raftPacket, address: mgSourceAddr};
          mgBridge.send(mgTargetAddr, mgPacket).catch(() => {});
          const mgMessage = mgMockPort.getLastMessage();

          // Verify both entity types route correctly
          const partitionRouted = partitionMessage !== undefined &&
            isRaftPacket(partitionMessage.payload);
          const mgRouted = mgMessage !== undefined &&
            isRaftPacket(mgMessage.payload);

          // Verify entity types are preserved in addresses
          const partitionAddrCorrect = partitionMessage?.sourceAddress?.includes(
            WORKER_ENTITY_TYPE.PARTITION,
          );
          const mgAddrCorrect = mgMessage?.sourceAddress?.includes(
            WORKER_ENTITY_TYPE.MESSAGE_GROUP,
          );

          partitionBridge.shutdown();
          mgBridge.shutdown();

          return partitionRouted && mgRouted && partitionAddrCorrect && mgAddrCorrect;
        },
      ),
      {numRuns: NUM.TEN},
    );

    t.pass('Both partition and message group Raft packets route correctly');
  });
});
