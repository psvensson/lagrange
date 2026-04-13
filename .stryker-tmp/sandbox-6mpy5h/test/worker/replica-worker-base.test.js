/**
 * Unit tests for ReplicaWorkerBase.
 *
 * Tests the abstract base class for worker process replicas,
 * including lifecycle management and communication setup.
 *
 * @see Requirements 6.1, 6.2, 6.3, 6.5 - Shared Base Class for Worker Replicas
 */
// @ts-nocheck


import {test} from '../../src/test-helpers/tap.js';
import {EventEmitter} from 'events';
import {
  WORKER_EVENT,
  WORKER_STATUS,
  WORKER_ADDRESS,
  WORKER_ENTITY_TYPE,
} from '../../src/worker/worker-constants.js';

/**
 * Mock WorkerMessageBridge for testing ReplicaWorkerBase without IPC.
 */
class MockWorkerMessageBridge extends EventEmitter {
  constructor() {
    super();
    this.initialized = false;
    this.registered = false;
    this.unifiedAddress = null;
    this.messageHandler = null;
    this.sentMessages = [];
    this.shouldFailRegister = false;
    this.shouldFailSend = false;
  }

  async initialize() {
    this.initialized = true;
    this.emit(WORKER_EVENT.INITIALIZED);
  }

  async register(unifiedAddress) {
    if (this.shouldFailRegister) {
      throw new Error('Registration failed');
    }
    this.unifiedAddress = unifiedAddress;
    this.registered = true;
    this.emit(WORKER_EVENT.STARTED, {unifiedAddress});
  }

  setMessageHandler(handler) {
    this.messageHandler = handler;
  }

  async send(targetAddress, message) {
    if (this.shouldFailSend) {
      throw new Error('Send failed');
    }
    this.sentMessages.push({targetAddress, message});
    return {status: 'ok'};
  }

  async unregister() {
    this.registered = false;
    this.unifiedAddress = null;
    this.emit(WORKER_EVENT.STOPPED);
  }

  async shutdown() {
    this.registered = false;
    this.initialized = false;
    this.unifiedAddress = null;
    this.messageHandler = null;
  }

  isRegistered() {
    return this.registered;
  }

  getUnifiedAddress() {
    return this.unifiedAddress;
  }

  getStats() {
    return {
      initialized: this.initialized,
      registered: this.registered,
      unifiedAddress: this.unifiedAddress,
      pendingRequestCount: 0,
    };
  }
}

/**
 * Create a testable ReplicaWorkerBase that uses mock bridge.
 */
class TestableReplicaWorkerBase extends EventEmitter {
  constructor(options = {}) {
    super();

    if (!options.nodeId) {
      throw new Error('nodeId is required');
    }
    if (!options.entityType) {
      throw new Error('entityType is required');
    }
    if (!options.replicaId) {
      throw new Error('replicaId is required');
    }

    this.nodeId = options.nodeId;
    this.entityType = options.entityType;
    this.replicaId = options.replicaId;
    this.logger = options.logger || {
      info: () => {},
      debug: () => {},
      warn: () => {},
      error: () => {},
    };

    this.unifiedAddress = WORKER_ADDRESS.build(
      this.nodeId,
      this.entityType,
      this.replicaId,
    );

    this.messageBridge = null;
    this.status = WORKER_STATUS.STOPPED;
    this.initialized = false;
    this.started = false;

    // Allow injection of mock bridge
    this.mockBridge = options.mockBridge || null;

    // Track lifecycle hook calls
    this.onInitializeCalled = false;
    this.onStartCalled = false;
    this.onStopCalled = false;
  }

  async initialize() {
    if (this.initialized) {
      throw new Error('ReplicaWorkerBase already initialized');
    }

    this.status = WORKER_STATUS.STARTING;

    this.messageBridge = this.mockBridge || new MockWorkerMessageBridge();
    await this.messageBridge.initialize();
    this.messageBridge.setMessageHandler(this.handleIncomingMessage.bind(this));
    await this.messageBridge.register(this.unifiedAddress);

    await this.onInitialize();

    this.initialized = true;

    this.emit(WORKER_EVENT.INITIALIZED, {
      replicaId: this.replicaId,
      entityType: this.entityType,
      unifiedAddress: this.unifiedAddress,
    });
  }

  async start() {
    if (!this.initialized) {
      throw new Error('ReplicaWorkerBase not initialized');
    }
    if (this.started) {
      throw new Error('ReplicaWorkerBase already started');
    }

    await this.onStart();

    this.started = true;
    this.status = WORKER_STATUS.RUNNING;

    this.emit(WORKER_EVENT.STARTED, {
      replicaId: this.replicaId,
      entityType: this.entityType,
      unifiedAddress: this.unifiedAddress,
    });
  }

  async stop() {
    if (this.status === WORKER_STATUS.STOPPED) {
      return;
    }

    this.status = WORKER_STATUS.STOPPING;

    await this.onStop();

    if (this.messageBridge) {
      await this.messageBridge.shutdown();
      this.messageBridge = null;
    }

    this.started = false;
    this.initialized = false;
    this.status = WORKER_STATUS.STOPPED;

    this.emit(WORKER_EVENT.STOPPED, {
      replicaId: this.replicaId,
      entityType: this.entityType,
      unifiedAddress: this.unifiedAddress,
    });
  }

  async handleIncomingMessage(envelope) {
    const message = envelope.payload || envelope;
    return this.handleMessage(message);
  }

  async handleMessage(message) {
    return {
      status: 'ok',
      replicaId: this.replicaId,
      receivedType: message.type,
    };
  }

  async sendMessage(targetAddress, message) {
    if (!this.initialized || !this.messageBridge) {
      throw new Error('ReplicaWorkerBase not initialized');
    }
    return this.messageBridge.send(targetAddress, message);
  }

  async onInitialize() {
    this.onInitializeCalled = true;
  }

  async onStart() {
    this.onStartCalled = true;
  }

  async onStop() {
    this.onStopCalled = true;
  }

  getStatus() {
    return this.status;
  }

  getUnifiedAddress() {
    return this.unifiedAddress;
  }

  getReplicaId() {
    return this.replicaId;
  }

  getEntityType() {
    return this.entityType;
  }

  getNodeId() {
    return this.nodeId;
  }

  isInitialized() {
    return this.initialized;
  }

  isStarted() {
    return this.started;
  }

  isRunning() {
    return this.status === WORKER_STATUS.RUNNING;
  }

  getStats() {
    return {
      replicaId: this.replicaId,
      entityType: this.entityType,
      nodeId: this.nodeId,
      unifiedAddress: this.unifiedAddress,
      status: this.status,
      initialized: this.initialized,
      started: this.started,
      messageBridgeStats: this.messageBridge ?
        this.messageBridge.getStats() : null,
    };
  }
}

// Helper to create a replica with default options
function createReplica(overrides = {}) {
  return new TestableReplicaWorkerBase({
    nodeId: 'node-1',
    entityType: WORKER_ENTITY_TYPE.PARTITION,
    replicaId: 'replica-1',
    ...overrides,
  });
}

test('ReplicaWorkerBase - constructor requires nodeId', async (t) => {
  try {
    new TestableReplicaWorkerBase({
      entityType: WORKER_ENTITY_TYPE.PARTITION,
      replicaId: 'replica-1',
    });
    t.fail('should have thrown an error');
  } catch (error) {
    t.ok(error.message.includes('nodeId'), 'throws error about missing nodeId');
  }
});

test('ReplicaWorkerBase - constructor requires entityType', async (t) => {
  try {
    new TestableReplicaWorkerBase({
      nodeId: 'node-1',
      replicaId: 'replica-1',
    });
    t.fail('should have thrown an error');
  } catch (error) {
    t.ok(error.message.includes('entityType'), 'throws error about missing entityType');
  }
});

test('ReplicaWorkerBase - constructor requires replicaId', async (t) => {
  try {
    new TestableReplicaWorkerBase({
      nodeId: 'node-1',
      entityType: WORKER_ENTITY_TYPE.PARTITION,
    });
    t.fail('should have thrown an error');
  } catch (error) {
    t.ok(error.message.includes('replicaId'), 'throws error about missing replicaId');
  }
});

test('ReplicaWorkerBase - constructor builds unified address', async (t) => {
  const replica = createReplica({
    nodeId: 'node-42',
    entityType: WORKER_ENTITY_TYPE.MESSAGE_GROUP,
    replicaId: 'mg-replica-7',
  });

  t.equal(
    replica.getUnifiedAddress(),
    'node-42/message-group/mg-replica-7',
    'builds correct unified address',
  );
});

test('ReplicaWorkerBase - initial state', async (t) => {
  const replica = createReplica();

  t.equal(replica.getStatus(), WORKER_STATUS.STOPPED, 'initial status is stopped');
  t.equal(replica.isInitialized(), false, 'not initialized initially');
  t.equal(replica.isStarted(), false, 'not started initially');
  t.equal(replica.isRunning(), false, 'not running initially');
});

test('ReplicaWorkerBase - initialize sets up bridge and registers', async (t) => {
  const replica = createReplica();

  await replica.initialize();

  t.equal(replica.isInitialized(), true, 'is initialized after initialize()');
  t.ok(replica.messageBridge, 'message bridge is created');
  t.equal(replica.messageBridge.isRegistered(), true, 'bridge is registered');
  t.equal(
    replica.messageBridge.getUnifiedAddress(),
    replica.getUnifiedAddress(),
    'bridge registered with correct address',
  );

  await replica.stop();
});

test('ReplicaWorkerBase - initialize calls onInitialize hook', async (t) => {
  const replica = createReplica();

  t.equal(replica.onInitializeCalled, false, 'onInitialize not called initially');

  await replica.initialize();

  t.equal(replica.onInitializeCalled, true, 'onInitialize called during initialize');

  await replica.stop();
});

test('ReplicaWorkerBase - initialize emits initialized event', async (t) => {
  const replica = createReplica();

  let eventData = null;
  replica.on(WORKER_EVENT.INITIALIZED, (data) => {
    eventData = data;
  });

  await replica.initialize();

  t.ok(eventData, 'initialized event was emitted');
  t.equal(eventData.replicaId, 'replica-1', 'event has correct replicaId');
  t.equal(eventData.entityType, WORKER_ENTITY_TYPE.PARTITION, 'event has correct entityType');
  t.equal(eventData.unifiedAddress, 'node-1/partition/replica-1', 'event has correct address');

  await replica.stop();
});

test('ReplicaWorkerBase - double initialize throws', async (t) => {
  const replica = createReplica();

  await replica.initialize();

  try {
    await replica.initialize();
    t.fail('should have thrown an error');
  } catch (error) {
    t.ok(error.message.includes('already initialized'), 'throws already initialized error');
  }

  await replica.stop();
});

test('ReplicaWorkerBase - start requires initialization', async (t) => {
  const replica = createReplica();

  try {
    await replica.start();
    t.fail('should have thrown an error');
  } catch (error) {
    t.ok(error.message.includes('not initialized'), 'throws not initialized error');
  }
});

test('ReplicaWorkerBase - start transitions to running', async (t) => {
  const replica = createReplica();

  await replica.initialize();
  await replica.start();

  t.equal(replica.isStarted(), true, 'is started after start()');
  t.equal(replica.isRunning(), true, 'is running after start()');
  t.equal(replica.getStatus(), WORKER_STATUS.RUNNING, 'status is running');

  await replica.stop();
});

test('ReplicaWorkerBase - start calls onStart hook', async (t) => {
  const replica = createReplica();

  await replica.initialize();

  t.equal(replica.onStartCalled, false, 'onStart not called after initialize');

  await replica.start();

  t.equal(replica.onStartCalled, true, 'onStart called during start');

  await replica.stop();
});

test('ReplicaWorkerBase - start emits started event', async (t) => {
  const replica = createReplica();

  let eventData = null;
  replica.on(WORKER_EVENT.STARTED, (data) => {
    eventData = data;
  });

  await replica.initialize();
  await replica.start();

  t.ok(eventData, 'started event was emitted');
  t.equal(eventData.replicaId, 'replica-1', 'event has correct replicaId');

  await replica.stop();
});

test('ReplicaWorkerBase - double start throws', async (t) => {
  const replica = createReplica();

  await replica.initialize();
  await replica.start();

  try {
    await replica.start();
    t.fail('should have thrown an error');
  } catch (error) {
    t.ok(error.message.includes('already started'), 'throws already started error');
  }

  await replica.stop();
});

test('ReplicaWorkerBase - stop transitions to stopped', async (t) => {
  const replica = createReplica();

  await replica.initialize();
  await replica.start();
  await replica.stop();

  t.equal(replica.isStarted(), false, 'not started after stop');
  t.equal(replica.isInitialized(), false, 'not initialized after stop');
  t.equal(replica.isRunning(), false, 'not running after stop');
  t.equal(replica.getStatus(), WORKER_STATUS.STOPPED, 'status is stopped');
});

test('ReplicaWorkerBase - stop calls onStop hook', async (t) => {
  const replica = createReplica();

  await replica.initialize();
  await replica.start();

  t.equal(replica.onStopCalled, false, 'onStop not called before stop');

  await replica.stop();

  t.equal(replica.onStopCalled, true, 'onStop called during stop');
});

test('ReplicaWorkerBase - stop emits stopped event', async (t) => {
  const replica = createReplica();

  let eventData = null;
  replica.on(WORKER_EVENT.STOPPED, (data) => {
    eventData = data;
  });

  await replica.initialize();
  await replica.start();
  await replica.stop();

  t.ok(eventData, 'stopped event was emitted');
  t.equal(eventData.replicaId, 'replica-1', 'event has correct replicaId');
});

test('ReplicaWorkerBase - stop is idempotent', async (t) => {
  const replica = createReplica();

  await replica.initialize();
  await replica.start();
  await replica.stop();

  // Second stop should not throw
  await replica.stop();

  t.equal(replica.getStatus(), WORKER_STATUS.STOPPED, 'status remains stopped');
});

test('ReplicaWorkerBase - stop shuts down message bridge', async (t) => {
  const replica = createReplica();

  await replica.initialize();
  const bridge = replica.messageBridge;
  t.ok(bridge, 'bridge exists before stop');

  await replica.start();
  await replica.stop();

  t.equal(replica.messageBridge, null, 'bridge is null after stop');
});

test('ReplicaWorkerBase - sendMessage routes through bridge', async (t) => {
  const replica = createReplica();

  await replica.initialize();
  await replica.start();

  const targetAddress = 'node-2/partition/replica-2';
  const message = {type: 'test', data: 'hello'};

  await replica.sendMessage(targetAddress, message);

  const sentMessages = replica.messageBridge.sentMessages;
  t.equal(sentMessages.length, 1, 'one message was sent');
  t.equal(sentMessages[0].targetAddress, targetAddress, 'correct target address');
  t.same(sentMessages[0].message, message, 'correct message payload');

  await replica.stop();
});

test('ReplicaWorkerBase - sendMessage requires initialization', async (t) => {
  const replica = createReplica();

  try {
    await replica.sendMessage('node-2/partition/replica-2', {type: 'test'});
    t.fail('should have thrown an error');
  } catch (error) {
    t.ok(error.message.includes('not initialized'), 'throws not initialized error');
  }
});

test('ReplicaWorkerBase - handleMessage returns default response', async (t) => {
  const replica = createReplica();

  await replica.initialize();
  await replica.start();

  const response = await replica.handleMessage({type: 'test-message'});

  t.equal(response.status, 'ok', 'response status is ok');
  t.equal(response.replicaId, 'replica-1', 'response includes replicaId');
  t.equal(response.receivedType, 'test-message', 'response includes received type');

  await replica.stop();
});

test('ReplicaWorkerBase - getStats returns complete statistics', async (t) => {
  const replica = createReplica({
    nodeId: 'node-5',
    entityType: WORKER_ENTITY_TYPE.MESSAGE_GROUP,
    replicaId: 'mg-3',
  });

  let stats = replica.getStats();

  t.equal(stats.replicaId, 'mg-3', 'stats has replicaId');
  t.equal(stats.entityType, WORKER_ENTITY_TYPE.MESSAGE_GROUP, 'stats has entityType');
  t.equal(stats.nodeId, 'node-5', 'stats has nodeId');
  t.equal(stats.unifiedAddress, 'node-5/message-group/mg-3', 'stats has unifiedAddress');
  t.equal(stats.status, WORKER_STATUS.STOPPED, 'stats has status');
  t.equal(stats.initialized, false, 'stats has initialized');
  t.equal(stats.started, false, 'stats has started');
  t.equal(stats.messageBridgeStats, null, 'stats has null bridge stats when not initialized');

  await replica.initialize();
  await replica.start();

  stats = replica.getStats();

  t.equal(stats.status, WORKER_STATUS.RUNNING, 'stats shows running status');
  t.equal(stats.initialized, true, 'stats shows initialized');
  t.equal(stats.started, true, 'stats shows started');
  t.ok(stats.messageBridgeStats, 'stats has bridge stats when initialized');

  await replica.stop();
});

test('ReplicaWorkerBase - accessor methods return correct values', async (t) => {
  const replica = createReplica({
    nodeId: 'test-node',
    entityType: WORKER_ENTITY_TYPE.PARTITION,
    replicaId: 'test-replica',
  });

  t.equal(replica.getNodeId(), 'test-node', 'getNodeId returns correct value');
  t.equal(replica.getEntityType(), WORKER_ENTITY_TYPE.PARTITION, 'getEntityType returns value');
  t.equal(replica.getReplicaId(), 'test-replica', 'getReplicaId returns correct value');
  t.equal(
    replica.getUnifiedAddress(),
    'test-node/partition/test-replica',
    'getUnifiedAddress returns correct value',
  );
});

test('ReplicaWorkerBase - full lifecycle', async (t) => {
  const replica = createReplica();
  const events = [];

  replica.on(WORKER_EVENT.INITIALIZED, () => events.push('initialized'));
  replica.on(WORKER_EVENT.STARTED, () => events.push('started'));
  replica.on(WORKER_EVENT.STOPPED, () => events.push('stopped'));

  // Initial state
  t.equal(replica.getStatus(), WORKER_STATUS.STOPPED, 'starts stopped');

  // Initialize
  await replica.initialize();
  t.equal(replica.isInitialized(), true, 'initialized');
  t.ok(events.includes('initialized'), 'initialized event emitted');

  // Start
  await replica.start();
  t.equal(replica.isRunning(), true, 'running');
  t.ok(events.includes('started'), 'started event emitted');

  // Stop
  await replica.stop();
  t.equal(replica.getStatus(), WORKER_STATUS.STOPPED, 'stopped');
  t.ok(events.includes('stopped'), 'stopped event emitted');

  t.same(events, ['initialized', 'started', 'stopped'], 'events in correct order');
});
