/**
 * Unit tests for replica-worker.js entry point.
 *
 * Tests the piscina worker entry point that handles operation dispatch
 * for partition and message group replicas.
 *
 * Since WorkerMessageBridge requires parentPort (worker_threads),
 * these tests create services directly with mock bridges and register
 * them in the replicas map, then test dispatch and lifecycle operations.
 *
 * @see Requirements 5.4, 5.5 - Worker Process Lifecycle
 */

import {describe, it, afterEach, mock} from 'node:test';
import assert from 'node:assert';
import workerEntryPoint, {
  replicas,
  createPartitionReplica,
  createMessageGroupReplica,
  stopReplica,
  deliverMessage,
  healthCheck,
} from '../../src/worker/replica-worker.js';
import {
  WORKER_OPERATION,
  WORKER_ERROR_MSG,
  WORKER_STATUS,
} from '../../src/worker/worker-constants.js';
import {
  MessageGroupWorkerService,
} from '../../src/worker/message-group-worker-service.js';
import {
  PartitionWorkerService,
} from '../../src/worker/partition-worker-service.js';

/**
 * Create a mock message bridge for tests that call onInitialize
 * directly. In production, ReplicaWorkerBase.initialize() creates
 * the real bridge via parentPort.
 * @return {Object} Mock message bridge.
 */
function createMockMessageBridge() {
  return {
    deliver: async () => ({status: 'ok'}),
    send: async () => ({status: 'ok'}),
    initialize: async () => {},
    shutdown: async () => {},
    setMessageHandler: () => {},
    getStats: () => ({}),
  };
}

const mockLogger = {
  info: () => {},
  debug: () => {},
  warn: () => {},
  error: () => {},
  trace: () => {},
};

const TEST_PARTITION_REPLICA_ID = 'created-partition-replica-1';
const TEST_MESSAGE_GROUP_REPLICA_ID = 'created-message-group-replica-1';
const TEST_STATS_ERROR_REPLICA_ID = 'stats-error-replica-1';
const TEST_NOT_READY_REPLICA_ID = 'not-ready-replica-1';
const TEST_STATS_COLLECTION_FAILED = 'stats collection failed';

/**
 * Create and register a message group replica in the replicas map.
 * Bypasses WorkerMessageBridge (which requires parentPort) by
 * injecting a mock bridge before calling onInitialize().
 * @param {Object} options - Service options.
 * @return {Promise<MessageGroupWorkerService>} Initialized service.
 */
async function createAndRegisterMessageGroup(options) {
  const service = new MessageGroupWorkerService({
    nodeId: options.nodeId,
    groupId: options.groupId,
    replicaId: options.replicaId,
    replicaIds: options.replicaIds,
    peerAddresses: options.peerAddresses,
    logger: mockLogger,
  });
  service.messageBridge = createMockMessageBridge();
  await service.onInitialize();
  service.initialized = true;
  service.started = true;
  service.status = WORKER_STATUS.RUNNING;
  replicas.set(options.replicaId, service);
  return service;
}

/**
 * Create and register a partition replica in the replicas map.
 * Bypasses WorkerMessageBridge by injecting a mock bridge.
 * @param {Object} options - Service options.
 * @return {Promise<PartitionWorkerService>} Initialized service.
 */
async function createAndRegisterPartition(options) {
  const service = new PartitionWorkerService({
    nodeId: options.nodeId,
    partitionId: options.partitionId,
    replicaId: options.replicaId,
    tableId: options.tableId,
    tableName: options.tableName,
    logger: mockLogger,
  });
  service.messageBridge = createMockMessageBridge();
  await service.onInitialize();
  service.initialized = true;
  service.started = true;
  service.status = WORKER_STATUS.RUNNING;
  replicas.set(options.replicaId, service);
  return service;
}

describe('replica-worker entry point', () => {
  afterEach(async () => {
    for (const [replicaId, service] of replicas) {
      try {
        if (typeof service.stop === 'function') {
          await service.stop();
        } else if (typeof service.onStop === 'function') {
          await service.onStop();
        }
      } catch (_e) {
        // Ignore cleanup errors
      }
      replicas.delete(replicaId);
    }
    mock.restoreAll();
  });

  describe('workerEntryPoint', () => {
    it('should dispatch STOP_REPLICA operation', async () => {
      await createAndRegisterMessageGroup({
        nodeId: 'node-1',
        groupId: 'group-1',
        replicaId: 'replica-3',
      });

      const result = await workerEntryPoint({
        operation: WORKER_OPERATION.STOP_REPLICA,
        replicaId: 'replica-3',
      });

      assert.strictEqual(result.status, 'stopped');
      assert.strictEqual(replicas.has('replica-3'), false);
    });

    it('should dispatch HEALTH_CHECK operation', async () => {
      await createAndRegisterMessageGroup({
        nodeId: 'node-1',
        groupId: 'group-1',
        replicaId: 'replica-4',
      });

      const result = await workerEntryPoint({
        operation: WORKER_OPERATION.HEALTH_CHECK,
        replicaId: 'replica-4',
      });

      assert.strictEqual(result.healthy, true);
      assert.strictEqual(result.replicaId, 'replica-4');
    });

    it('should throw error for unknown operation', async () => {
      await assert.rejects(
        async () => workerEntryPoint({
          operation: 'UNKNOWN_OPERATION',
          replicaId: 'replica-1',
        }),
        {
          message: /Unknown worker operation/i,
        },
      );
    });
  });

  describe('create replica lifecycle', () => {
    it('should initialize and start partition replica before registration',
      async () => {
        mock.method(
          PartitionWorkerService.prototype,
          'initialize',
          async function initializeMock() {
            this.initialized = true;
          },
        );
        const startMock = mock.method(
          PartitionWorkerService.prototype,
          'start',
          async function startMockMethod() {
            this.started = true;
            this.status = WORKER_STATUS.RUNNING;
          },
        );
        mock.method(
          PartitionWorkerService.prototype,
          'stop',
          async function stopMock() {
            this.started = false;
            this.initialized = false;
            this.status = WORKER_STATUS.STOPPED;
          },
        );

        const result = await createPartitionReplica({
          nodeId: 'node-1',
          partitionId: 'partition-1',
          replicaId: TEST_PARTITION_REPLICA_ID,
          tableId: 'table-1',
          tableName: 'test_table',
        });

        assert.strictEqual(result.status, 'created');
        assert.strictEqual(startMock.mock.calls.length, 1);
        assert.strictEqual(
          replicas.get(TEST_PARTITION_REPLICA_ID).started,
          true,
        );
      });

    it('should initialize and start message group replica before registration',
      async () => {
        mock.method(
          MessageGroupWorkerService.prototype,
          'initialize',
          async function initializeMock() {
            this.initialized = true;
          },
        );
        const startMock = mock.method(
          MessageGroupWorkerService.prototype,
          'start',
          async function startMockMethod() {
            this.started = true;
            this.status = WORKER_STATUS.RUNNING;
          },
        );
        mock.method(
          MessageGroupWorkerService.prototype,
          'stop',
          async function stopMock() {
            this.started = false;
            this.initialized = false;
            this.status = WORKER_STATUS.STOPPED;
          },
        );

        const result = await createMessageGroupReplica({
          nodeId: 'node-1',
          groupId: 'group-1',
          replicaId: TEST_MESSAGE_GROUP_REPLICA_ID,
        });

        assert.strictEqual(result.status, 'created');
        assert.strictEqual(startMock.mock.calls.length, 1);
        assert.strictEqual(
          replicas.get(TEST_MESSAGE_GROUP_REPLICA_ID).started,
          true,
        );
      });
  });

  describe('stopReplica', () => {
    it('should stop replica', async () => {
      await createAndRegisterMessageGroup({
        nodeId: 'node-1',
        groupId: 'group-1',
        replicaId: 'stop-replica-1',
      });

      const result = await stopReplica('stop-replica-1');

      assert.strictEqual(result.status, 'stopped');
      assert.strictEqual(
        replicas.has('stop-replica-1'), false,
      );
    });

    it('should throw error if replica not found', async () => {
      await assert.rejects(
        async () => stopReplica('non-existent'),
        {
          message: WORKER_ERROR_MSG.REPLICA_NOT_FOUND,
        },
      );
    });
  });

  describe('deliverMessage', () => {
    it('should deliver message to replica', async () => {
      await createAndRegisterMessageGroup({
        nodeId: 'node-1',
        groupId: 'group-1',
        replicaId: 'deliver-replica-1',
      });

      const result = await deliverMessage(
        'deliver-replica-1',
        {type: 'test', data: 'hello'},
      );

      assert.ok(result);
      assert.strictEqual(result.status, 'ok');
    });

    it('should throw error if replica not found', async () => {
      await assert.rejects(
        async () => deliverMessage(
          'non-existent', {type: 'test'},
        ),
        {
          message: WORKER_ERROR_MSG.REPLICA_NOT_FOUND,
        },
      );
    });
  });

  describe('healthCheck', () => {
    it('should return healthy for initialized replica',
      async () => {
        await createAndRegisterMessageGroup({
          nodeId: 'node-1',
          groupId: 'group-1',
          replicaId: 'health-replica-1',
        });

        const result = await healthCheck('health-replica-1');

        assert.strictEqual(result.healthy, true);
        assert.strictEqual(
          result.replicaId, 'health-replica-1',
        );
        assert.ok(result.stats);
      });

    it('should return unhealthy when replica is not started',
      async () => {
        replicas.set(TEST_NOT_READY_REPLICA_ID, {
          initialized: true,
          started: false,
        });

        const result = await healthCheck(TEST_NOT_READY_REPLICA_ID);

        assert.strictEqual(result.healthy, false);
        assert.strictEqual(
          result.replicaId,
          TEST_NOT_READY_REPLICA_ID,
        );
        assert.match(result.error, /not ready/i);
      });

    it('should return unhealthy when stats collection fails',
      async () => {
        replicas.set(TEST_STATS_ERROR_REPLICA_ID, {
          initialized: true,
          started: true,
          getStats() {
            throw new Error(TEST_STATS_COLLECTION_FAILED);
          },
        });

        const result = await healthCheck(TEST_STATS_ERROR_REPLICA_ID);

        assert.strictEqual(result.healthy, false);
        assert.strictEqual(
          result.replicaId,
          TEST_STATS_ERROR_REPLICA_ID,
        );
        assert.strictEqual(
          result.error,
          TEST_STATS_COLLECTION_FAILED,
        );
        assert.deepStrictEqual(result.stats, {});
      });

    it('should return unhealthy for non-existent replica',
      async () => {
        const result = await healthCheck('non-existent');

        assert.strictEqual(result.healthy, false);
        assert.strictEqual(
          result.error, WORKER_ERROR_MSG.REPLICA_NOT_FOUND,
        );
      });
  });

  describe('replicas map management', () => {
    it('should register message group replica', async () => {
      await createAndRegisterMessageGroup({
        nodeId: 'node-1',
        groupId: 'group-1',
        replicaId: 'msggroup-replica-1',
      });

      assert.ok(replicas.has('msggroup-replica-1'));
      const service = replicas.get('msggroup-replica-1');
      assert.ok(service instanceof MessageGroupWorkerService);
    });

    it('should register partition replica', async () => {
      await createAndRegisterPartition({
        nodeId: 'node-1',
        partitionId: 'partition-1',
        replicaId: 'partition-replica-1',
        tableId: 'table-1',
        tableName: 'test_table',
      });

      assert.ok(replicas.has('partition-replica-1'));
      const service = replicas.get('partition-replica-1');
      assert.ok(service instanceof PartitionWorkerService);
    });

    it('should remove replica on stop', async () => {
      await createAndRegisterMessageGroup({
        nodeId: 'node-1',
        groupId: 'group-1',
        replicaId: 'remove-replica-1',
      });

      assert.ok(replicas.has('remove-replica-1'));

      await stopReplica('remove-replica-1');

      assert.strictEqual(
        replicas.has('remove-replica-1'), false,
      );
    });
  });
});
