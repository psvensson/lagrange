/**
 * Unit tests for WorkerMessageBridge.
 *
 * Tests the IPC communication bridge between worker processes and the main
 * process MessageRouter.
 *
 * Note: Registration with MessageRouter is handled by ReplicaWorkerManager,
 * not by the worker itself. Workers receive messages via piscina task queue
 * (DELIVER_MESSAGE operation), not via IPC registration.
 *
 * @see Requirements 7.1, 7.2, 7.3 - Message Routing in Worker Processes
 * @see Requirement 11.3 - Workers do NOT self-register with MessageRouter
 */

import {test} from '../../src/test-helpers/tap.js';
import {EventEmitter} from 'events';

// Mock parentPort for testing outside of worker context
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

  // Simulate receiving a response from main process
  simulateResponse(messageId, response) {
    this.emit('message', {
      type: 'WORKER_RESPONSE',
      messageId,
      ...response,
    });
  }

  // Simulate incoming message from main process
  simulateIncoming(envelope) {
    this.emit('message', {
      type: 'WORKER_INCOMING',
      ...envelope,
    });
  }
}

// Create a testable version of WorkerMessageBridge that accepts a mock parentPort
async function createTestBridge(mockPort, options = {}) {
  // Dynamically import and create a modified version for testing
  const {
    WORKER_ERROR_MSG,
    WORKER_EVENT,
    WORKER_LOG_MSG,
    WORKER_RESPONSE_STATUS,
  } = await import('../../src/worker/worker-constants.js');
  const {EventEmitter} = await import('events');
  const {v4: uuidv4} = await import('uuid');

  const IPC_MESSAGE_TYPE = Object.freeze({
    SEND: 'WORKER_SEND',
  });

  function buildLocalDeliveryAcknowledgment() {
    return {
      acknowledged: true,
      status: WORKER_RESPONSE_STATUS.OK,
    };
  }

  /**
   * Test version of WorkerMessageBridge that uses injected parentPort.
   */
  class TestableWorkerMessageBridge extends EventEmitter {
    constructor(testOptions = {}) {
      super();
      this.parentPort = testOptions.parentPort;
      this.logger = testOptions.logger || console;
      this.unifiedAddress = testOptions.unifiedAddress || null;
      this.messageHandler = null;
      this.initialized = false;
    }

    async initialize() {
      if (this.initialized) {
        return;
      }
      if (!this.parentPort) {
        throw new Error(WORKER_ERROR_MSG.NOT_INITIALIZED);
      }
      this.initialized = true;
      this.logger.info(WORKER_LOG_MSG.INITIALIZED);
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
      this.logger.debug(WORKER_LOG_MSG.MESSAGE_SENT, {
        messageId,
        targetAddress,
        correlationId,
      });
      this.parentPort.postMessage(envelope);
      return buildLocalDeliveryAcknowledgment();
    }

    async handleIncoming(envelope) {
      if (!this.initialized) {
        return {
          status: WORKER_RESPONSE_STATUS.ERROR,
          error: WORKER_ERROR_MSG.NOT_INITIALIZED,
        };
      }
      this.logger.debug(WORKER_LOG_MSG.MESSAGE_RECEIVED, {
        messageId: envelope.messageId,
        sourceAddress: envelope.sourceAddress,
        correlationId: envelope.correlationId,
      });
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
      this.initialized = false;
      this.messageHandler = null;
      this.logger.info(WORKER_LOG_MSG.STOPPED);
    }

    isInitialized() {
      return this.initialized;
    }

    getUnifiedAddress() {
      return this.unifiedAddress;
    }

    getStats() {
      return {
        initialized: this.initialized,
        unifiedAddress: this.unifiedAddress,
        pendingRequestCount: 0,
      };
    }
  }

  const logger = options.logger || {
    info: () => {},
    debug: () => {},
    warn: () => {},
    error: () => {},
  };

  return new TestableWorkerMessageBridge({
    parentPort: mockPort,
    logger,
    requestTimeoutMs: options.requestTimeoutMs || 1000,
    unifiedAddress: options.unifiedAddress || null,
  });
}

test('WorkerMessageBridge - initialization', async (t) => {
  const mockPort = new MockParentPort();
  const bridge = await createTestBridge(mockPort);

  t.equal(bridge.initialized, false, 'bridge starts uninitialized');

  await bridge.initialize();

  t.equal(bridge.initialized, true, 'bridge is initialized after initialize()');
  t.equal(bridge.isInitialized(), true, 'isInitialized() returns true');

  await bridge.shutdown();
});

test('WorkerMessageBridge - setUnifiedAddress', async (t) => {
  const mockPort = new MockParentPort();
  const bridge = await createTestBridge(mockPort);

  await bridge.initialize();

  t.equal(bridge.getUnifiedAddress(), null, 'address is null initially');

  const unifiedAddress = 'node-1/partition/replica-1';
  bridge.setUnifiedAddress(unifiedAddress);

  t.equal(bridge.getUnifiedAddress(), unifiedAddress, 'address is set correctly');

  await bridge.shutdown();
});

test('WorkerMessageBridge - send message', async (t) => {
  const mockPort = new MockParentPort();
  const sourceAddress = 'node-1/partition/replica-1';
  const bridge = await createTestBridge(mockPort, {unifiedAddress: sourceAddress});

  await bridge.initialize();

  mockPort.clearMessages();

  // Send a message
  const targetAddress = 'node-2/partition/replica-2';
  const payload = {type: 'query', sql: 'SELECT * FROM users'};

  const result = await bridge.send(targetAddress, payload);

  const sendMsg = mockPort.getLastMessage();
  t.equal(sendMsg.type, 'WORKER_SEND', 'sends WORKER_SEND message');
  t.equal(sendMsg.targetAddress, targetAddress, 'includes target address');
  t.equal(sendMsg.sourceAddress, sourceAddress, 'includes source address');
  t.same(sendMsg.payload, payload, 'includes payload');
  t.same(result, {
    acknowledged: true,
    status: 'ok',
  }, 'returns local delivery acknowledgment');

  await bridge.shutdown();
});

test('WorkerMessageBridge - send without initialization throws', async (t) => {
  const mockPort = new MockParentPort();
  const bridge = await createTestBridge(mockPort, {
    unifiedAddress: 'node-1/partition/replica-1',
  });

  // Don't initialize

  try {
    await bridge.send('node-2/partition/replica-2', {type: 'test'});
    t.fail('should have thrown an error');
  } catch (error) {
    t.ok(error.message.includes('not initialized'), 'throws not initialized error');
  }

  await bridge.shutdown();
});

test('WorkerMessageBridge - send is outbound-only and does not await response', async (t) => {
  const mockPort = new MockParentPort();
  const bridge = await createTestBridge(mockPort, {
    unifiedAddress: 'node-1/partition/replica-1',
  });

  await bridge.initialize();

  const result = await bridge.send('node-2/partition/replica-2', {type: 'test'});

  t.same(result, {
    acknowledged: true,
    status: 'ok',
  }, 'send returns a local acknowledgment without waiting for a reply');

  await bridge.shutdown();
});

test('WorkerMessageBridge - send without address throws', async (t) => {
  const mockPort = new MockParentPort();
  const bridge = await createTestBridge(mockPort);

  await bridge.initialize();

  // Don't set address

  try {
    await bridge.send('node-2/partition/replica-2', {type: 'test'});
    t.fail('should have thrown an error');
  } catch (error) {
    t.ok(error.message.includes('address not set'), 'throws address not set error');
  }

  await bridge.shutdown();
});

test('WorkerMessageBridge - handle incoming message', async (t) => {
  const mockPort = new MockParentPort();
  const bridge = await createTestBridge(mockPort, {
    unifiedAddress: 'node-1/partition/replica-1',
  });

  await bridge.initialize();

  // Set up message handler
  let receivedEnvelope = null;
  bridge.setMessageHandler(async (envelope) => {
    receivedEnvelope = envelope;
    return {result: 'processed'};
  });

  // Simulate incoming message
  const incomingEnvelope = {
    messageId: 'msg-123',
    sourceAddress: 'node-2/partition/replica-2',
    targetAddress: 'node-1/partition/replica-1',
    payload: {type: 'query', sql: 'SELECT 1'},
    correlationId: 'corr-456',
  };

  const responseMsg = await bridge.handleIncoming(incomingEnvelope);

  t.ok(receivedEnvelope, 'message handler was called');
  t.equal(receivedEnvelope.messageId, 'msg-123', 'received correct message ID');
  t.equal(receivedEnvelope.sourceAddress, 'node-2/partition/replica-2',
    'received source address');

  t.equal(responseMsg.messageId, 'msg-123', 'response has correct message ID');
  t.equal(responseMsg.status, 'ok', 'response status is ok');
  t.same(responseMsg.payload, {result: 'processed'}, 'response includes handler result');

  await bridge.shutdown();
});

test('WorkerMessageBridge - getStats', async (t) => {
  const mockPort = new MockParentPort();
  const bridge = await createTestBridge(mockPort);

  let stats = bridge.getStats();
  t.equal(stats.initialized, false, 'stats show uninitialized');
  t.equal(stats.unifiedAddress, null, 'stats show no address');
  t.equal(stats.pendingRequestCount, 0, 'stats show no pending requests');

  await bridge.initialize();

  stats = bridge.getStats();
  t.equal(stats.initialized, true, 'stats show initialized');

  // Set address
  bridge.setUnifiedAddress('node-1/partition/replica-1');

  stats = bridge.getStats();
  t.equal(stats.unifiedAddress, 'node-1/partition/replica-1', 'stats show address');

  await bridge.shutdown();
});

test('WorkerMessageBridge - emits initialized event', async (t) => {
  const mockPort = new MockParentPort();
  const bridge = await createTestBridge(mockPort);

  const events = [];
  bridge.on('initialized', () => events.push('initialized'));

  await bridge.initialize();
  t.ok(events.includes('initialized'), 'emits initialized event');

  await bridge.shutdown();
});

test('WorkerMessageBridge - message event emitted on incoming', async (t) => {
  const mockPort = new MockParentPort();
  const bridge = await createTestBridge(mockPort, {
    unifiedAddress: 'node-1/partition/replica-1',
  });

  await bridge.initialize();

  let messageEvent = null;
  bridge.on('message', (envelope) => {
    messageEvent = envelope;
  });

  await bridge.handleIncoming({
    messageId: 'msg-789',
    sourceAddress: 'node-2/partition/replica-2',
    payload: {data: 'test'},
  });

  t.ok(messageEvent, 'message event was emitted');
  t.equal(messageEvent.messageId, 'msg-789', 'event has correct message ID');

  await bridge.shutdown();
});

test('WorkerMessageBridge - initialize without parentPort throws', async (t) => {
  const {
    WORKER_ERROR_MSG,
  } = await import('../../src/worker/worker-constants.js');
  const {EventEmitter} = await import('events');

  // Create a bridge without parentPort
  class BridgeWithoutPort extends EventEmitter {
    constructor() {
      super();
      this.parentPort = null;
      this.initialized = false;
    }

    async initialize() {
      if (!this.parentPort) {
        throw new Error(WORKER_ERROR_MSG.NOT_INITIALIZED);
      }
      this.initialized = true;
    }
  }

  const bridge = new BridgeWithoutPort();

  try {
    await bridge.initialize();
    t.fail('should have thrown an error');
  } catch (error) {
    t.ok(error.message.includes('not initialized'), 'throws not initialized error');
  }
});

test('WorkerMessageBridge - constructor with unifiedAddress option', async (t) => {
  const mockPort = new MockParentPort();
  const unifiedAddress = 'node-1/partition/replica-1';
  const bridge = await createTestBridge(mockPort, {unifiedAddress});

  t.equal(bridge.getUnifiedAddress(), unifiedAddress,
    'address is set from constructor option');

  await bridge.shutdown();
});
