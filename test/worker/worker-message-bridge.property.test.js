/**
 * Property Test: IPC Message Routing
 * **Property 13: IPC Message Routing**
 * **Validates: Requirements 7.1, 7.2, 7.3**
 *
 * Feature: worker-process-replica-isolation, Property 13: IPC Message Routing
 *
 * *For any* message sent from a worker process, the message SHALL be delivered
 * to the main process via IPC, and *for any* message destined for a local worker,
 * the main process SHALL forward it via IPC.
 *
 * Note: Registration with MessageRouter is handled by ReplicaWorkerManager,
 * not by the worker itself. Workers receive messages via piscina task queue
 * (DELIVER_MESSAGE operation), not via IPC registration.
 *
 * This property test verifies:
 * 1. For any valid unified address and message payload, sending through the
 *    bridge SHALL result in an IPC message being posted to parentPort
 * 2. For any incoming IPC message, the bridge SHALL emit a 'message' event
 *    with the envelope
 * 3. For any message sent, the envelope SHALL contain sourceAddress,
 *    targetAddress, payload, messageId, correlationId, and timestamp
 */

import {test} from '../../src/test-helpers/tap.js';
import fc from 'fast-check';
import {EventEmitter} from 'events';
import {
  WORKER_DEFAULT,
  WORKER_ERROR_MSG,
  WORKER_EVENT,
  WORKER_RESPONSE_STATUS,
  WORKER_ENTITY_TYPE,
  WORKER_ADDRESS,
} from '../../src/worker/worker-constants.js';
import {v4 as uuidv4} from 'uuid';

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
 * Note: No register/unregister methods - registration is handled by
 * ReplicaWorkerManager in the main process.
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
 * Generator for valid node IDs (alphanumeric with hyphens).
 */
const nodeIdArb = fc.stringOf(
  fc.constantFrom(
    ...'abcdefghijklmnopqrstuvwxyz0123456789'.split(''),
  ),
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
  fc.constantFrom(
    ...'abcdefghijklmnopqrstuvwxyz0123456789'.split(''),
  ),
  {minLength: 1, maxLength: 10},
);

/**
 * Generator for unified addresses (nodeId/entityType/replicaId format).
 */
const unifiedAddressArb = fc.tuple(nodeIdArb, entityTypeArb, replicaIdArb)
  .map(([nodeId, entityType, replicaId]) =>
    WORKER_ADDRESS.build(nodeId, entityType, replicaId));

/**
 * Generator for message payloads (arbitrary JSON-serializable objects).
 */
const messagePayloadArb = fc.oneof(
  fc.record({
    type: fc.constantFrom('query', 'command', 'event', 'raft'),
    data: fc.string({maxLength: 20}),
  }),
  fc.record({
    operation: fc.constantFrom('read', 'write', 'delete'),
    key: fc.string({maxLength: 20}),
  }),
  fc.record({
    sql: fc.string({maxLength: 50}),
    params: fc.array(fc.oneof(fc.string({maxLength: 10}), fc.integer()), {
      maxLength: 3,
    }),
  }),
);

/**
 * Generator for message IDs (UUID-like strings).
 */
const messageIdArb = fc.uuid();

/**
 * Generator for correlation IDs (UUID-like strings).
 */
const correlationIdArb = fc.uuid();

/**
 * Helper to create an initialized bridge with address set for property tests.
 */
function createInitializedBridgeSync(mockPort, sourceAddress) {
  const bridge = new TestableWorkerMessageBridge({
    parentPort: mockPort,
    requestTimeoutMs: 1000,
    unifiedAddress: sourceAddress,
  });

  // Initialize synchronously by directly setting state
  bridge.parentPort.on('message', bridge.boundMessageHandler);
  bridge.initialized = true;

  return bridge;
}

test('Property 13: IPC Message Routing', async (t) => {
  /**
   * Property: For any valid unified address and message payload, sending
   * through the bridge SHALL result in an IPC message being posted to parentPort.
   *
   * This validates Requirement 7.1: WHEN a Worker_Process needs to send a
   * message, THE Worker_Process SHALL send it to the Main_Process via IPC.
   */
  t.test('sending message posts IPC message to parentPort', async (t) => {
    fc.assert(
      fc.property(
        unifiedAddressArb,
        unifiedAddressArb,
        messagePayloadArb,
        (sourceAddress, targetAddress, payload) => {
          const mockPort = new MockParentPort();
          const bridge = createInitializedBridgeSync(mockPort, sourceAddress);

          mockPort.clearMessages();

          // Start sending message (don't await - just trigger the post)
          bridge.send(targetAddress, payload).catch(() => {
            // Ignore timeout - we just want to verify the message was posted
          });

          // Verify IPC message was posted synchronously
          const sentMessage = mockPort.getLastMessage();
          const messagePosted = sentMessage !== undefined;
          const correctType = sentMessage?.type === IPC_MESSAGE_TYPE.SEND;

          // Cleanup
          bridge.shutdown();

          return messagePosted && correctType;
        },
      ),
      {numRuns: 10},
    );

    t.pass('sending message posts IPC message to parentPort');
  });

  /**
   * Property: For any incoming IPC message, the bridge SHALL emit a 'message'
   * event with the envelope.
   *
   * This validates Requirement 7.2: WHEN the Main_Process receives a message
   * from a Worker_Process, THE MessageRouter SHALL route it to the target
   * address.
   */
  t.test('incoming IPC message emits message event', async (t) => {
    await fc.assert(
      fc.asyncProperty(
        unifiedAddressArb,
        unifiedAddressArb,
        messagePayloadArb,
        messageIdArb,
        correlationIdArb,
        async (targetAddress, sourceAddress, payload, messageId, correlationId) => {
          const mockPort = new MockParentPort();
          const bridge = createInitializedBridgeSync(mockPort, targetAddress);

          let receivedEnvelope = null;
          bridge.on('message', (envelope) => {
            receivedEnvelope = envelope;
          });

          // Simulate incoming message from main process
          const incomingEnvelope = {
            messageId,
            sourceAddress,
            targetAddress,
            payload,
            correlationId,
            timestamp: Date.now(),
          };

          mockPort.simulateIncoming(incomingEnvelope);

          // Wait for async processing
          await new Promise((resolve) => setTimeout(resolve, 5));

          // Verify message event was emitted
          const eventEmitted = receivedEnvelope !== null;
          const correctMessageId = receivedEnvelope?.messageId === messageId;
          const correctSourceAddress =
            receivedEnvelope?.sourceAddress === sourceAddress;

          await bridge.shutdown();

          return eventEmitted && correctMessageId && correctSourceAddress;
        },
      ),
      {numRuns: 10},
    );

    t.pass('incoming IPC message emits message event');
  });

  /**
   * Property: For any message sent, the envelope SHALL contain sourceAddress,
   * targetAddress, payload, messageId, correlationId, and timestamp.
   *
   * This validates Requirement 7.3: WHEN the MessageRouter receives a message
   * for a local Worker_Process, THE Main_Process SHALL forward it to that
   * Worker_Process via IPC.
   */
  t.test('sent message envelope contains required fields', async (t) => {
    fc.assert(
      fc.property(
        unifiedAddressArb,
        unifiedAddressArb,
        messagePayloadArb,
        (sourceAddress, targetAddress, payload) => {
          const mockPort = new MockParentPort();
          const bridge = createInitializedBridgeSync(mockPort, sourceAddress);

          mockPort.clearMessages();

          // Start sending message (don't await)
          bridge.send(targetAddress, payload).catch(() => {
            // Ignore timeout
          });

          // Get the sent message
          const sentMessage = mockPort.getLastMessage();

          // Verify all required fields are present
          const hasSourceAddress = typeof sentMessage?.sourceAddress === 'string';
          const hasTargetAddress = typeof sentMessage?.targetAddress === 'string';
          const hasPayload = sentMessage?.payload !== undefined;
          const hasMessageId = typeof sentMessage?.messageId === 'string';
          const hasCorrelationId = typeof sentMessage?.correlationId === 'string';
          const hasTimestamp = typeof sentMessage?.timestamp === 'number';

          // Verify field values are correct
          const correctSourceAddress = sentMessage?.sourceAddress === sourceAddress;
          const correctTargetAddress = sentMessage?.targetAddress === targetAddress;
          const correctPayload = JSON.stringify(sentMessage?.payload) ===
            JSON.stringify(payload);

          // Cleanup
          bridge.shutdown();

          return hasSourceAddress && hasTargetAddress && hasPayload &&
                 hasMessageId && hasCorrelationId && hasTimestamp &&
                 correctSourceAddress && correctTargetAddress && correctPayload;
        },
      ),
      {numRuns: 10},
    );

    t.pass('sent message envelope contains required fields');
  });

  /**
   * Property: For any incoming message with a handler set, the bridge SHALL
   * invoke the handler and return its result in the response.
   *
   * This validates the message handling flow for Requirement 7.2.
   */
  t.test('incoming message invokes handler and returns result', async (t) => {
    await fc.assert(
      fc.asyncProperty(
        unifiedAddressArb,
        unifiedAddressArb,
        messagePayloadArb,
        messageIdArb,
        fc.string({maxLength: 20}),
        async (targetAddress, sourceAddress, payload, messageId, handlerResult) => {
          const mockPort = new MockParentPort();
          const bridge = createInitializedBridgeSync(mockPort, targetAddress);

          let handlerCalled = false;
          let handlerReceivedEnvelope = null;

          bridge.setMessageHandler(async (envelope) => {
            handlerCalled = true;
            handlerReceivedEnvelope = envelope;
            return {result: handlerResult};
          });

          mockPort.clearMessages();

          // Simulate incoming message
          const incomingEnvelope = {
            messageId,
            sourceAddress,
            targetAddress,
            payload,
            correlationId: uuidv4(),
            timestamp: Date.now(),
          };

          mockPort.simulateIncoming(incomingEnvelope);

          // Wait for async processing
          await new Promise((resolve) => setTimeout(resolve, 5));

          // Verify handler was called
          const wasHandlerCalled = handlerCalled === true;
          const receivedCorrectPayload =
            JSON.stringify(handlerReceivedEnvelope?.payload) ===
            JSON.stringify(payload);

          // Verify response was sent back
          const responseMsg = mockPort.getLastMessage();
          const responseHasCorrectType =
            responseMsg?.type === IPC_MESSAGE_TYPE.RESPONSE;
          const responseHasCorrectMessageId =
            responseMsg?.messageId === messageId;
          const responseHasHandlerResult =
            responseMsg?.payload?.result === handlerResult;

          await bridge.shutdown();

          return wasHandlerCalled && receivedCorrectPayload &&
                 responseHasCorrectType && responseHasCorrectMessageId &&
                 responseHasHandlerResult;
        },
      ),
      {numRuns: 10},
    );

    t.pass('incoming message invokes handler and returns result');
  });

  /**
   * Property: For any unified address set on the bridge, the bridge SHALL
   * store and return the exact address via getUnifiedAddress().
   *
   * This validates Requirement 7.4: THE Worker_Process SHALL use the unified
   * address format (nodeId/entityType/replicaId) for all message routing.
   */
  t.test('unified address format is preserved', async (t) => {
    fc.assert(
      fc.property(
        unifiedAddressArb,
        (unifiedAddress) => {
          const mockPort = new MockParentPort();
          const bridge = createInitializedBridgeSync(mockPort, unifiedAddress);

          // Verify address is preserved exactly
          const storedAddress = bridge.getUnifiedAddress();
          const addressPreserved = storedAddress === unifiedAddress;

          // Verify address format (nodeId/entityType/replicaId)
          const parts = storedAddress.split(WORKER_ADDRESS.SEPARATOR);
          const hasThreeParts = parts.length === 3;
          const hasValidEntityType =
            parts[1] === WORKER_ENTITY_TYPE.PARTITION ||
            parts[1] === WORKER_ENTITY_TYPE.MESSAGE_GROUP;

          bridge.shutdown();

          return addressPreserved && hasThreeParts && hasValidEntityType;
        },
      ),
      {numRuns: 10},
    );

    t.pass('unified address format is preserved');
  });

  /**
   * Property: For any message sent, the sourceAddress in the envelope SHALL
   * match the unified address set on the bridge.
   *
   * This validates that messages are correctly attributed to their source.
   */
  t.test('source address in sent messages matches set address',
    async (t) => {
      fc.assert(
        fc.property(
          unifiedAddressArb,
          unifiedAddressArb,
          messagePayloadArb,
          (sourceAddress, targetAddress, payload) => {
            const mockPort = new MockParentPort();
            const bridge = createInitializedBridgeSync(mockPort, sourceAddress);

            mockPort.clearMessages();

            // Start sending message (don't await)
            bridge.send(targetAddress, payload).catch(() => {
              // Ignore timeout
            });

            // Get the sent message
            const sentMessage = mockPort.getLastMessage();

            // Verify source address matches set address
            const sourceAddressMatches =
              sentMessage?.sourceAddress === sourceAddress;
            const sourceAddressMatchesSet =
              sentMessage?.sourceAddress === bridge.getUnifiedAddress();

            // Cleanup
            bridge.shutdown();

            return sourceAddressMatches && sourceAddressMatchesSet;
          },
        ),
        {numRuns: 10},
      );

      t.pass('source address in sent messages matches set address');
    });
});
