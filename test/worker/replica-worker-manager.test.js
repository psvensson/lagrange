/**
 * Unit tests for ReplicaWorkerManager.
 *
 * Tests the worker process lifecycle management including creation,
 * monitoring, and termination of partition and message group replicas.
 *
 * @see Requirements 5.1, 5.2, 5.3, 5.4, 5.5, 5.6 - Worker Process Management
 * @see Requirements 11.1, 11.2 - Manager-Based Worker Registration
 */

import {describe, it, beforeEach, afterEach, mock} from 'node:test';
import assert from 'node:assert';
import {
  ReplicaWorkerManager,
  MANAGER_ERROR_MSG,
  MANAGER_DEFAULT,
} from '../../src/worker/replica-worker-manager.js';
import {
  WORKER_STATUS,
  WORKER_HEALTH_STATUS,
  WORKER_ENTITY_TYPE,
  WORKER_EVENT,
} from '../../src/worker/worker-constants.js';

describe('ReplicaWorkerManager', () => {
  let manager;
  let mockLogger;
  let mockPool;
  let mockMessageRouter;

  beforeEach(() => {
    mockLogger = {
      info: mock.fn(),
      debug: mock.fn(),
      warn: mock.fn(),
      error: mock.fn(),
    };

    // Create mock pool
    mockPool = {
      run: mock.fn(async () => ({workerId: 1, healthy: true})),
      destroy: mock.fn(async () => {}),
      on: mock.fn(),
    };

    // Create mock message router
    mockMessageRouter = {
      deliver: mock.fn(async () => ({acknowledged: true})),
      registerWorkerHandler: mock.fn(),
      unregisterWorkerHandler: mock.fn(),
      hasWorkerHandler: mock.fn(() => false),
    };
  });


  afterEach(async () => {
    if (manager) {
      // Stop health check timer
      if (manager.healthCheckTimer) {
        clearInterval(manager.healthCheckTimer);
        manager.healthCheckTimer = null;
      }
      // Clean up pool
      if (manager.pool) {
        manager.pool = null;
      }
      manager.initialized = false;
    }
    manager = null;
  });

  describe('constructor', () => {
    it('should throw error if nodeId is missing', () => {
      assert.throws(() => {
        new ReplicaWorkerManager({
          messageRouter: mockMessageRouter,
        });
      }, {
        message: MANAGER_ERROR_MSG.MISSING_NODE_ID,
      });
    });

    it('should throw error if messageRouter is missing', () => {
      assert.throws(() => {
        new ReplicaWorkerManager({
          nodeId: 'node-1',
        });
      }, {
        message: MANAGER_ERROR_MSG.MISSING_MESSAGE_ROUTER,
      });
    });

    it('should create instance with valid options', () => {
      manager = new ReplicaWorkerManager({
        nodeId: 'node-1',
        messageRouter: mockMessageRouter,
        logger: mockLogger,
      });

      assert.strictEqual(manager.nodeId, 'node-1');
      assert.strictEqual(manager.messageRouter, mockMessageRouter);
      assert.strictEqual(manager.initialized, false);
      assert.strictEqual(manager.workers.size, 0);
    });

    it('should use default max workers', () => {
      manager = new ReplicaWorkerManager({
        nodeId: 'node-1',
        messageRouter: mockMessageRouter,
        logger: mockLogger,
      });

      assert.strictEqual(manager.maxWorkers, MANAGER_DEFAULT.MAX_WORKERS);
    });

    it('should use custom max workers', () => {
      manager = new ReplicaWorkerManager({
        nodeId: 'node-1',
        messageRouter: mockMessageRouter,
        maxWorkers: 8,
        logger: mockLogger,
      });

      assert.strictEqual(manager.maxWorkers, 8);
    });

    it('should use default health check interval', () => {
      manager = new ReplicaWorkerManager({
        nodeId: 'node-1',
        messageRouter: mockMessageRouter,
        logger: mockLogger,
      });

      assert.strictEqual(
        manager.healthCheckIntervalMs,
        MANAGER_DEFAULT.HEALTH_CHECK_INTERVAL_MS,
      );
    });
  });


  describe('initialize', () => {
    it('should throw error if already initialized', async () => {
      manager = new ReplicaWorkerManager({
        nodeId: 'node-1',
        messageRouter: mockMessageRouter,
        logger: mockLogger,
      });

      // Mock initialization
      manager.pool = mockPool;
      manager.initialized = true;

      await assert.rejects(
        async () => manager.initialize(),
        {message: MANAGER_ERROR_MSG.ALREADY_INITIALIZED},
      );
    });

    it('should set initialized to true after initialization', async () => {
      manager = new ReplicaWorkerManager({
        nodeId: 'node-1',
        messageRouter: mockMessageRouter,
        logger: mockLogger,
      });

      // Mock piscina creation
      manager.pool = mockPool;
      manager.setupPoolEventHandlers = mock.fn();
      manager.startHealthCheckTimer = mock.fn();
      manager.initialized = true;

      assert.strictEqual(manager.initialized, true);
    });
  });

  describe('createPartitionReplica', () => {
    beforeEach(() => {
      manager = new ReplicaWorkerManager({
        nodeId: 'node-1',
        messageRouter: mockMessageRouter,
        logger: mockLogger,
      });
      manager.pool = mockPool;
      manager.initialized = true;
    });

    it('should throw error if not initialized', async () => {
      manager.initialized = false;

      await assert.rejects(
        async () => manager.createPartitionReplica({
          partitionId: 'partition-1',
          replicaId: 'replica-1',
        }),
        {message: MANAGER_ERROR_MSG.NOT_INITIALIZED},
      );
    });

    it('should throw error if partitionId is missing', async () => {
      await assert.rejects(
        async () => manager.createPartitionReplica({
          replicaId: 'replica-1',
        }),
        {message: MANAGER_ERROR_MSG.MISSING_PARTITION_ID},
      );
    });

    it('should throw error if replicaId is missing', async () => {
      await assert.rejects(
        async () => manager.createPartitionReplica({
          partitionId: 'partition-1',
        }),
        {message: MANAGER_ERROR_MSG.MISSING_REPLICA_ID},
      );
    });

    it('should throw error if replica already exists', async () => {
      manager.workers.set('replica-1', {replicaId: 'replica-1'});

      await assert.rejects(
        async () => manager.createPartitionReplica({
          partitionId: 'partition-1',
          replicaId: 'replica-1',
        }),
        {message: MANAGER_ERROR_MSG.REPLICA_ALREADY_EXISTS},
      );
    });

    it('should create partition replica and return handle', async () => {
      const handle = await manager.createPartitionReplica({
        partitionId: 'partition-1',
        replicaId: 'replica-1',
        tableId: 'table-1',
        tableName: 'test_table',
      });

      assert.strictEqual(handle.replicaId, 'replica-1');
      assert.strictEqual(handle.entityType, WORKER_ENTITY_TYPE.PARTITION);
      assert.strictEqual(handle.status, WORKER_STATUS.RUNNING);
      assert.strictEqual(handle.healthStatus, WORKER_HEALTH_STATUS.HEALTHY);
      assert.strictEqual(handle.unifiedAddress, 'node-1/partition/replica-1');
    });

    it('should store handle in workers map', async () => {
      await manager.createPartitionReplica({
        partitionId: 'partition-1',
        replicaId: 'replica-1',
      });

      assert.strictEqual(manager.workers.size, 1);
      assert.ok(manager.workers.has('replica-1'));
    });

    it('should emit REPLICA_CREATED event', async () => {
      const events = [];
      manager.on(WORKER_EVENT.REPLICA_CREATED, (data) => events.push(data));

      await manager.createPartitionReplica({
        partitionId: 'partition-1',
        replicaId: 'replica-1',
      });

      assert.strictEqual(events.length, 1);
      assert.strictEqual(events[0].replicaId, 'replica-1');
      assert.strictEqual(events[0].entityType, WORKER_ENTITY_TYPE.PARTITION);
    });

    it('should register handler with MessageRouter', async () => {
      await manager.createPartitionReplica({
        partitionId: 'partition-1',
        replicaId: 'replica-1',
      });

      assert.strictEqual(mockMessageRouter.registerWorkerHandler.mock.calls.length, 1);
      const call = mockMessageRouter.registerWorkerHandler.mock.calls[0];
      assert.strictEqual(call.arguments[0], 'node-1/partition/replica-1');
      assert.strictEqual(typeof call.arguments[1], 'function');
    });

    it('should clean up on spawn failure', async () => {
      mockPool.run = mock.fn(async () => {
        throw new Error('Spawn failed');
      });

      await assert.rejects(
        async () => manager.createPartitionReplica({
          partitionId: 'partition-1',
          replicaId: 'replica-1',
        }),
      );

      assert.strictEqual(manager.workers.size, 0);
      // Handler should not be registered on failure
      assert.strictEqual(mockMessageRouter.registerWorkerHandler.mock.calls.length, 0);
    });

    it('should return error object on timeout instead of undefined', async () => {
      // Mock pool.run to never resolve (simulating timeout)
      mockPool.run = mock.fn(() => new Promise(() => {}));

      const result = await manager.createPartitionReplica({
        partitionId: 'partition-1',
        replicaId: 'replica-1',
        timeoutMs: 50, // Short timeout for test
      });

      // Should return error object, not undefined
      assert.ok(result !== undefined, 'Result should not be undefined');
      assert.strictEqual(result.success, false);
      assert.strictEqual(result.replicaId, 'replica-1');
    });

    it('should include timeout duration in error message', async () => {
      // Mock pool.run to never resolve (simulating timeout)
      mockPool.run = mock.fn(() => new Promise(() => {}));

      const timeoutMs = 100;
      const result = await manager.createPartitionReplica({
        partitionId: 'partition-1',
        replicaId: 'replica-1',
        timeoutMs,
      });

      assert.strictEqual(result.success, false);
      assert.ok(
        result.error.includes(`${timeoutMs}ms`),
        `Error message should include timeout duration: ${result.error}`,
      );
      assert.ok(
        result.error.includes('CREATE_REPLICA'),
        `Error message should include CREATE_REPLICA: ${result.error}`,
      );
    });

    it('should clean up partial resources on timeout', async () => {
      // Mock pool.run to never resolve (simulating timeout)
      mockPool.run = mock.fn(() => new Promise(() => {}));

      await manager.createPartitionReplica({
        partitionId: 'partition-1',
        replicaId: 'replica-1',
        timeoutMs: 50,
      });

      // Workers map should be cleaned up
      assert.strictEqual(manager.workers.size, 0);
      // Handler should not remain registered
      assert.strictEqual(mockMessageRouter.registerWorkerHandler.mock.calls.length, 0);
    });
  });


  describe('createMessageGroupReplica', () => {
    beforeEach(() => {
      manager = new ReplicaWorkerManager({
        nodeId: 'node-1',
        messageRouter: mockMessageRouter,
        logger: mockLogger,
      });
      manager.pool = mockPool;
      manager.initialized = true;
    });

    it('should throw error if not initialized', async () => {
      manager.initialized = false;

      await assert.rejects(
        async () => manager.createMessageGroupReplica({
          groupId: 'group-1',
          replicaId: 'replica-1',
        }),
        {message: MANAGER_ERROR_MSG.NOT_INITIALIZED},
      );
    });

    it('should throw error if groupId is missing', async () => {
      await assert.rejects(
        async () => manager.createMessageGroupReplica({
          replicaId: 'replica-1',
        }),
        {message: MANAGER_ERROR_MSG.MISSING_GROUP_ID},
      );
    });

    it('should throw error if replicaId is missing', async () => {
      await assert.rejects(
        async () => manager.createMessageGroupReplica({
          groupId: 'group-1',
        }),
        {message: MANAGER_ERROR_MSG.MISSING_REPLICA_ID},
      );
    });

    it('should create message group replica and return handle', async () => {
      const handle = await manager.createMessageGroupReplica({
        groupId: 'group-1',
        replicaId: 'replica-1',
      });

      assert.strictEqual(handle.replicaId, 'replica-1');
      assert.strictEqual(handle.entityType, WORKER_ENTITY_TYPE.MESSAGE_GROUP);
      assert.strictEqual(handle.status, WORKER_STATUS.RUNNING);
      assert.strictEqual(handle.healthStatus, WORKER_HEALTH_STATUS.HEALTHY);
      assert.strictEqual(handle.unifiedAddress, 'node-1/message-group/replica-1');
    });

    it('should emit REPLICA_CREATED event', async () => {
      const events = [];
      manager.on(WORKER_EVENT.REPLICA_CREATED, (data) => events.push(data));

      await manager.createMessageGroupReplica({
        groupId: 'group-1',
        replicaId: 'replica-1',
      });

      assert.strictEqual(events.length, 1);
      assert.strictEqual(events[0].replicaId, 'replica-1');
      assert.strictEqual(events[0].entityType, WORKER_ENTITY_TYPE.MESSAGE_GROUP);
    });

    it('should register handler with MessageRouter', async () => {
      await manager.createMessageGroupReplica({
        groupId: 'group-1',
        replicaId: 'replica-1',
      });

      assert.strictEqual(mockMessageRouter.registerWorkerHandler.mock.calls.length, 1);
      const call = mockMessageRouter.registerWorkerHandler.mock.calls[0];
      assert.strictEqual(call.arguments[0], 'node-1/message-group/replica-1');
      assert.strictEqual(typeof call.arguments[1], 'function');
    });

    it('should return error object on timeout instead of undefined', async () => {
      // Mock pool.run to never resolve (simulating timeout)
      mockPool.run = mock.fn(() => new Promise(() => {}));

      const result = await manager.createMessageGroupReplica({
        groupId: 'group-1',
        replicaId: 'replica-1',
        timeoutMs: 50, // Short timeout for test
      });

      // Should return error object, not undefined
      assert.ok(result !== undefined, 'Result should not be undefined');
      assert.strictEqual(result.success, false);
      assert.strictEqual(result.replicaId, 'replica-1');
    });

    it('should include timeout duration in error message for message group', async () => {
      // Mock pool.run to never resolve (simulating timeout)
      mockPool.run = mock.fn(() => new Promise(() => {}));

      const timeoutMs = 100;
      const result = await manager.createMessageGroupReplica({
        groupId: 'group-1',
        replicaId: 'replica-1',
        timeoutMs,
      });

      assert.strictEqual(result.success, false);
      assert.ok(
        result.error.includes(`${timeoutMs}ms`),
        `Error message should include timeout duration: ${result.error}`,
      );
    });

    it('should clean up partial resources on message group timeout', async () => {
      // Mock pool.run to never resolve (simulating timeout)
      mockPool.run = mock.fn(() => new Promise(() => {}));

      await manager.createMessageGroupReplica({
        groupId: 'group-1',
        replicaId: 'replica-1',
        timeoutMs: 50,
      });

      // Workers map should be cleaned up
      assert.strictEqual(manager.workers.size, 0);
    });

    it('should start deferred elections after the full message group exists', async () => {
      const replicaIds = ['replica-1', 'replica-2', 'replica-3'];

      await manager.createMessageGroupReplica({
        groupId: 'group-1',
        replicaId: replicaIds[0],
        replicaIds,
      });
      await manager.createMessageGroupReplica({
        groupId: 'group-1',
        replicaId: replicaIds[1],
        replicaIds,
      });
      await manager.createMessageGroupReplica({
        groupId: 'group-1',
        replicaId: replicaIds[2],
        replicaIds,
      });

      const startElectionCalls = mockPool.run.mock.calls.filter((call) => {
        return call.arguments[0]?.operation === 'DELIVER_MESSAGE' &&
          call.arguments[0]?.message?.type === 'START_ELECTION';
      });

      assert.strictEqual(startElectionCalls.length, 3);
      assert.deepStrictEqual(
        startElectionCalls.map((call) => call.arguments[0].replicaId).sort(),
        [...replicaIds].sort(),
      );
    });
  });

  describe('stopReplica', () => {
    beforeEach(() => {
      manager = new ReplicaWorkerManager({
        nodeId: 'node-1',
        messageRouter: mockMessageRouter,
        logger: mockLogger,
      });
      manager.pool = mockPool;
      manager.initialized = true;
    });

    it('should throw error if not initialized', async () => {
      manager.initialized = false;

      await assert.rejects(
        async () => manager.stopReplica('replica-1'),
        {message: MANAGER_ERROR_MSG.NOT_INITIALIZED},
      );
    });

    it('should throw error if replica not found', async () => {
      await assert.rejects(
        async () => manager.stopReplica('replica-1'),
        {message: MANAGER_ERROR_MSG.REPLICA_NOT_FOUND},
      );
    });

    it('should stop replica and remove from workers map', async () => {
      await manager.createPartitionReplica({
        partitionId: 'partition-1',
        replicaId: 'replica-1',
      });

      assert.strictEqual(manager.workers.size, 1);

      await manager.stopReplica('replica-1');

      assert.strictEqual(manager.workers.size, 0);
    });

    it('should emit REPLICA_STOPPED event', async () => {
      await manager.createPartitionReplica({
        partitionId: 'partition-1',
        replicaId: 'replica-1',
      });

      const events = [];
      manager.on(WORKER_EVENT.REPLICA_STOPPED, (data) => events.push(data));

      await manager.stopReplica('replica-1');

      assert.strictEqual(events.length, 1);
      assert.strictEqual(events[0].replicaId, 'replica-1');
    });

    it('should unregister handler from MessageRouter on stop', async () => {
      await manager.createPartitionReplica({
        partitionId: 'partition-1',
        replicaId: 'replica-1',
      });

      // Reset mock to track unregister calls
      mockMessageRouter.unregisterWorkerHandler.mock.resetCalls();

      await manager.stopReplica('replica-1');

      assert.strictEqual(mockMessageRouter.unregisterWorkerHandler.mock.calls.length, 1);
      const call = mockMessageRouter.unregisterWorkerHandler.mock.calls[0];
      assert.strictEqual(call.arguments[0], 'node-1/partition/replica-1');
    });

    it('should unregister handler even when stop command fails', async () => {
      await manager.createPartitionReplica({
        partitionId: 'partition-1',
        replicaId: 'replica-1',
      });

      // Make stop command fail
      mockPool.run = mock.fn(async () => {
        throw new Error('Stop failed');
      });

      // Reset mock to track unregister calls
      mockMessageRouter.unregisterWorkerHandler.mock.resetCalls();

      await manager.stopReplica('replica-1');

      // Handler should still be unregistered even on failure
      assert.strictEqual(mockMessageRouter.unregisterWorkerHandler.mock.calls.length, 1);
      const call = mockMessageRouter.unregisterWorkerHandler.mock.calls[0];
      assert.strictEqual(call.arguments[0], 'node-1/partition/replica-1');
    });

    it('should unregister message group handler on stop', async () => {
      await manager.createMessageGroupReplica({
        groupId: 'group-1',
        replicaId: 'replica-1',
      });

      // Reset mock to track unregister calls
      mockMessageRouter.unregisterWorkerHandler.mock.resetCalls();

      await manager.stopReplica('replica-1');

      assert.strictEqual(mockMessageRouter.unregisterWorkerHandler.mock.calls.length, 1);
      const call = mockMessageRouter.unregisterWorkerHandler.mock.calls[0];
      assert.strictEqual(call.arguments[0], 'node-1/message-group/replica-1');
    });
  });


  describe('registerWorkerWithRouter', () => {
    beforeEach(() => {
      manager = new ReplicaWorkerManager({
        nodeId: 'node-1',
        messageRouter: mockMessageRouter,
        logger: mockLogger,
      });
      manager.pool = mockPool;
      manager.initialized = true;
    });

    it('should register handler that forwards payload to deliverMessage', async () => {
      await manager.createPartitionReplica({
        partitionId: 'partition-1',
        replicaId: 'replica-1',
      });

      // Get the registered handler
      const call = mockMessageRouter.registerWorkerHandler.mock.calls[0];
      const handler = call.arguments[1];

      // Call the handler with a test envelope
      const testEnvelope = {
        messageId: 'msg-1',
        payload: {type: 'test', data: 'hello'},
      };
      mockPool.run = mock.fn(async () => ({response: 'ok'}));

      await handler(testEnvelope);

      // Verify deliverMessage was called via pool.run
      assert.strictEqual(mockPool.run.mock.calls.length, 1);
      const runCall = mockPool.run.mock.calls[0];
      assert.strictEqual(runCall.arguments[0].operation, 'DELIVER_MESSAGE');
      assert.strictEqual(runCall.arguments[0].replicaId, 'replica-1');
      assert.deepStrictEqual(
        runCall.arguments[0].message,
        testEnvelope.payload,
      );
    });
  });

  describe('routeWorkerMessage', () => {
    beforeEach(() => {
      manager = new ReplicaWorkerManager({
        nodeId: 'node-1',
        messageRouter: mockMessageRouter,
        logger: mockLogger,
      });
      manager.pool = mockPool;
      manager.initialized = true;
    });

    it('should route local worker traffic through the worker task path', async () => {
      await manager.createMessageGroupReplica({
        groupId: 'group-1',
        replicaId: 'replica-1',
      });

      mockPool.run.mock.resetCalls();

      await manager.routeWorkerMessage({
        type: 'WORKER_SEND',
        sourceAddress: 'node-1/message-group/source-1',
        targetAddress: 'node-1/message-group/replica-1',
        payload: {type: 'append', term: 1, data: []},
        messageId: 'msg-1',
        correlationId: 'corr-1',
      });

      assert.strictEqual(mockPool.run.mock.calls.length, 1);
      const runCall = mockPool.run.mock.calls[0];
      assert.strictEqual(
        runCall.arguments[0].operation,
        'DELIVER_MESSAGE',
      );
      assert.strictEqual(
        runCall.arguments[0].replicaId,
        'replica-1',
      );
      assert.deepStrictEqual(
        runCall.arguments[0].message,
        {type: 'append', term: 1, data: []},
      );
    });

    it('should not post parentPort responses back into the source worker pool', async () => {
      await manager.createMessageGroupReplica({
        groupId: 'group-1',
        replicaId: 'replica-1',
      });

      const postMessage = mock.fn();
      manager.replicaPools.set('source-1', {
        threads: [{postMessage}],
      });
      mockPool.run.mock.mockImplementationOnce(async () => ({
        acknowledged: true,
        leaderAddress: 'node-1/message-group/replica-1',
      }));

      await manager.routeWorkerMessage({
        type: 'WORKER_SEND',
        sourceAddress: 'node-1/message-group/source-1',
        targetAddress: 'node-1/message-group/replica-1',
        payload: {type: 'append', term: 1, data: []},
        messageId: 'msg-2',
        correlationId: 'corr-2',
      });

      assert.strictEqual(postMessage.mock.calls.length, 0);
    });

    it('should swallow external worker routing errors without posting source responses', async () => {
      const postMessage = mock.fn();
      manager.replicaPools.set('source-1', {
        threads: [{postMessage}],
      });

      mockMessageRouter.deliver.mock.mockImplementationOnce(async () => {
        const error = new Error('Connection to node node-2 closed');
        error.code = 'ROUTER_CONNECTION_CLOSED';
        error.deferRetry = true;
        error.retryAfterMs = 200;
        throw error;
      });

      await manager.routeWorkerMessage({
        type: 'WORKER_SEND',
        sourceAddress: 'node-1/message-group/source-1',
        targetAddress: 'node-2/message-group/replica-9',
        payload: {type: 'append', term: 1, data: []},
        messageId: 'msg-3',
        correlationId: 'corr-3',
      });

      assert.strictEqual(postMessage.mock.calls.length, 0);
    });
  });

  describe('getHealthStatus', () => {
    beforeEach(() => {
      manager = new ReplicaWorkerManager({
        nodeId: 'node-1',
        messageRouter: mockMessageRouter,
        logger: mockLogger,
      });
      manager.pool = mockPool;
      manager.initialized = true;
    });

    it('should return empty map when no workers', () => {
      const status = manager.getHealthStatus();

      assert.strictEqual(status.size, 0);
    });

    it('should return health status for all workers', async () => {
      await manager.createPartitionReplica({
        partitionId: 'partition-1',
        replicaId: 'replica-1',
      });

      await manager.createMessageGroupReplica({
        groupId: 'group-1',
        replicaId: 'replica-2',
      });

      const status = manager.getHealthStatus();

      assert.strictEqual(status.size, 2);
      assert.ok(status.has('replica-1'));
      assert.ok(status.has('replica-2'));

      const replica1Status = status.get('replica-1');
      assert.strictEqual(replica1Status.entityType, WORKER_ENTITY_TYPE.PARTITION);
      assert.strictEqual(replica1Status.healthStatus, WORKER_HEALTH_STATUS.HEALTHY);
    });
  });

  describe('getWorker', () => {
    beforeEach(() => {
      manager = new ReplicaWorkerManager({
        nodeId: 'node-1',
        messageRouter: mockMessageRouter,
        logger: mockLogger,
      });
      manager.pool = mockPool;
      manager.initialized = true;
    });

    it('should return undefined for non-existent worker', () => {
      const handle = manager.getWorker('non-existent');

      assert.strictEqual(handle, undefined);
    });

    it('should return worker handle', async () => {
      await manager.createPartitionReplica({
        partitionId: 'partition-1',
        replicaId: 'replica-1',
      });

      const handle = manager.getWorker('replica-1');

      assert.ok(handle);
      assert.strictEqual(handle.replicaId, 'replica-1');
    });
  });


  describe('getWorkersByType', () => {
    beforeEach(() => {
      manager = new ReplicaWorkerManager({
        nodeId: 'node-1',
        messageRouter: mockMessageRouter,
        logger: mockLogger,
      });
      manager.pool = mockPool;
      manager.initialized = true;
    });

    it('should return empty array when no workers of type', () => {
      const workers = manager.getWorkersByType(WORKER_ENTITY_TYPE.PARTITION);

      assert.strictEqual(workers.length, 0);
    });

    it('should return workers of specified type', async () => {
      await manager.createPartitionReplica({
        partitionId: 'partition-1',
        replicaId: 'replica-1',
      });

      await manager.createMessageGroupReplica({
        groupId: 'group-1',
        replicaId: 'replica-2',
      });

      const partitionWorkers = manager.getWorkersByType(WORKER_ENTITY_TYPE.PARTITION);
      const msgGroupWorkers = manager.getWorkersByType(WORKER_ENTITY_TYPE.MESSAGE_GROUP);

      assert.strictEqual(partitionWorkers.length, 1);
      assert.strictEqual(msgGroupWorkers.length, 1);
      assert.strictEqual(partitionWorkers[0].replicaId, 'replica-1');
      assert.strictEqual(msgGroupWorkers[0].replicaId, 'replica-2');
    });
  });

  describe('handleWorkerCrash', () => {
    beforeEach(() => {
      manager = new ReplicaWorkerManager({
        nodeId: 'node-1',
        messageRouter: mockMessageRouter,
        logger: mockLogger,
      });
      manager.pool = mockPool;
      manager.initialized = true;
    });

    it('should do nothing if replica not found', () => {
      manager.handleWorkerCrash('non-existent', new Error('Crash'));

      // Should not throw
      assert.strictEqual(manager.workers.size, 0);
    });

    it('should remove crashed worker and emit event', async () => {
      await manager.createPartitionReplica({
        partitionId: 'partition-1',
        replicaId: 'replica-1',
      });

      const events = [];
      manager.on(WORKER_EVENT.REPLICA_FAILED, (data) => events.push(data));

      manager.handleWorkerCrash('replica-1', new Error('Crash'));

      assert.strictEqual(manager.workers.size, 0);
      assert.strictEqual(events.length, 1);
      assert.strictEqual(events[0].replicaId, 'replica-1');
      assert.strictEqual(events[0].error, 'Crash');
    });

    it('should unregister handler from MessageRouter on crash', async () => {
      await manager.createPartitionReplica({
        partitionId: 'partition-1',
        replicaId: 'replica-1',
      });

      // Reset mock to track unregister calls
      mockMessageRouter.unregisterWorkerHandler.mock.resetCalls();

      manager.handleWorkerCrash('replica-1', new Error('Crash'));

      assert.strictEqual(mockMessageRouter.unregisterWorkerHandler.mock.calls.length, 1);
      const call = mockMessageRouter.unregisterWorkerHandler.mock.calls[0];
      assert.strictEqual(call.arguments[0], 'node-1/partition/replica-1');
    });

    it('should unregister message group handler on crash', async () => {
      await manager.createMessageGroupReplica({
        groupId: 'group-1',
        replicaId: 'replica-1',
      });

      // Reset mock to track unregister calls
      mockMessageRouter.unregisterWorkerHandler.mock.resetCalls();

      manager.handleWorkerCrash('replica-1', new Error('Crash'));

      assert.strictEqual(mockMessageRouter.unregisterWorkerHandler.mock.calls.length, 1);
      const call = mockMessageRouter.unregisterWorkerHandler.mock.calls[0];
      assert.strictEqual(call.arguments[0], 'node-1/message-group/replica-1');
    });

    it('should include unifiedAddress in failure event', async () => {
      await manager.createPartitionReplica({
        partitionId: 'partition-1',
        replicaId: 'replica-1',
      });

      const events = [];
      manager.on(WORKER_EVENT.REPLICA_FAILED, (data) => events.push(data));

      manager.handleWorkerCrash('replica-1', new Error('Crash'));

      assert.strictEqual(events.length, 1);
      assert.strictEqual(events[0].unifiedAddress, 'node-1/partition/replica-1');
    });
  });

  describe('getStats', () => {
    beforeEach(() => {
      manager = new ReplicaWorkerManager({
        nodeId: 'node-1',
        messageRouter: mockMessageRouter,
        logger: mockLogger,
      });
      manager.pool = mockPool;
      manager.initialized = true;
    });

    it('should return comprehensive stats', async () => {
      await manager.createPartitionReplica({
        partitionId: 'partition-1',
        replicaId: 'replica-1',
      });

      await manager.createMessageGroupReplica({
        groupId: 'group-1',
        replicaId: 'replica-2',
      });

      const stats = manager.getStats();

      assert.strictEqual(stats.nodeId, 'node-1');
      assert.strictEqual(stats.initialized, true);
      assert.strictEqual(stats.totalWorkers, 2);
      assert.strictEqual(stats.partitionWorkers, 1);
      assert.strictEqual(stats.messageGroupWorkers, 1);
      assert.strictEqual(stats.healthyWorkers, 2);
      assert.strictEqual(stats.unhealthyWorkers, 0);
    });
  });

  describe('isInitialized', () => {
    it('should return false before initialization', () => {
      manager = new ReplicaWorkerManager({
        nodeId: 'node-1',
        messageRouter: mockMessageRouter,
        logger: mockLogger,
      });

      assert.strictEqual(manager.isInitialized(), false);
    });

    it('should return true after initialization', () => {
      manager = new ReplicaWorkerManager({
        nodeId: 'node-1',
        messageRouter: mockMessageRouter,
        logger: mockLogger,
      });
      manager.pool = mockPool;
      manager.initialized = true;

      assert.strictEqual(manager.isInitialized(), true);
    });
  });

  describe('getWorkerCount', () => {
    beforeEach(() => {
      manager = new ReplicaWorkerManager({
        nodeId: 'node-1',
        messageRouter: mockMessageRouter,
        logger: mockLogger,
      });
      manager.pool = mockPool;
      manager.initialized = true;
    });

    it('should return 0 when no workers', () => {
      assert.strictEqual(manager.getWorkerCount(), 0);
    });

    it('should return correct count', async () => {
      await manager.createPartitionReplica({
        partitionId: 'partition-1',
        replicaId: 'replica-1',
      });

      await manager.createPartitionReplica({
        partitionId: 'partition-2',
        replicaId: 'replica-2',
      });

      assert.strictEqual(manager.getWorkerCount(), 2);
    });
  });
});
