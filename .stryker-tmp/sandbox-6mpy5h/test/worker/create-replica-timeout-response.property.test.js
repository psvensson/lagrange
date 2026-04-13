/**
 * Property test for CREATE_REPLICA Timeout Response (Property 8).
 *
 * **Feature: test-failure-fixes, Property 8: CREATE_REPLICA Timeout Response**
 *
 * For any CREATE_REPLICA request that times out, the system SHALL return an
 * error response object (not undefined) containing the timeout duration, and
 * SHALL clean up any partially created resources.
 *
 * **Validates: Requirements 7.1, 7.2, 7.3**
 *
 * @module test/worker/create-replica-timeout-response.property.test.js
 */
// @ts-nocheck


import {describe, it, beforeEach, afterEach, mock} from 'node:test';
import assert from 'node:assert';
import fc from 'fast-check';
import {
  ReplicaWorkerManager,
  MANAGER_ERROR_MSG,
} from '../../src/worker/replica-worker-manager.js';

describe('Property 8: CREATE_REPLICA Timeout Response', () => {
  let manager;
  let mockLogger;
  let mockPool;
  let mockMessageRouter;

  beforeEach(() => {
    mockLogger = {
      info: () => {},
      debug: () => {},
      warn: () => {},
      error: () => {},
    };

    // Mock pool that never resolves (simulates timeout)
    mockPool = {
      run: mock.fn(() => new Promise(() => {})),
      destroy: mock.fn(async () => {}),
      on: mock.fn(),
    };

    mockMessageRouter = {
      registerWorkerHandler: mock.fn(),
      unregisterWorkerHandler: mock.fn(),
      hasWorkerHandler: mock.fn(() => false),
    };
  });

  afterEach(async () => {
    if (manager) {
      if (manager.healthCheckTimer) {
        clearInterval(manager.healthCheckTimer);
        manager.healthCheckTimer = null;
      }
      if (manager.pool) {
        manager.pool = null;
      }
      manager.initialized = false;
    }
    manager = null;
  });

  /**
   * Create and initialize a manager with mock pool.
   * @param {string} nodeId - Node ID.
   * @return {ReplicaWorkerManager}
   */
  function createManager(nodeId) {
    const mgr = new ReplicaWorkerManager({
      nodeId,
      messageRouter: mockMessageRouter,
      logger: mockLogger,
    });
    mgr.pool = mockPool;
    mgr.initialized = true;
    return mgr;
  }

  /**
   * Arbitrary for valid timeout values (short for testing).
   */
  const timeoutArb = fc.integer({min: 10, max: 100});

  /**
   * Arbitrary for valid node IDs.
   */
  const nodeIdArb = fc.uuid();

  /**
   * Arbitrary for valid partition IDs.
   */
  const partitionIdArb = fc.uuid();

  /**
   * Arbitrary for valid replica IDs.
   */
  const replicaIdArb = fc.uuid();

  /**
   * Arbitrary for valid group IDs.
   */
  const groupIdArb = fc.uuid();

  describe('Partition Replica Timeout', () => {
    it('should return error object (not undefined) on partition replica timeout', async () => {
      /**
       * **Validates: Requirements 7.1**
       * WHEN a CREATE_REPLICA request times out, THE System SHALL return an
       * error response (not undefined)
       */
      await fc.assert(
        fc.asyncProperty(
          nodeIdArb,
          partitionIdArb,
          replicaIdArb,
          timeoutArb,
          async (nodeId, partitionId, replicaId, timeoutMs) => {
            manager = createManager(nodeId);

            const result = await manager.createPartitionReplica({
              partitionId,
              replicaId,
              timeoutMs,
            });

            // Requirement 7.1: Should return error object, not undefined
            assert.ok(
              result !== undefined,
              'Result should not be undefined on timeout',
            );
            assert.strictEqual(
              typeof result,
              'object',
              'Result should be an object',
            );
            assert.strictEqual(
              result.success,
              false,
              'Result should indicate failure',
            );
            assert.strictEqual(
              result.replicaId,
              replicaId,
              'Result should include replicaId',
            );
          },
        ),
        {numRuns: 10},
      );
    });

    it('should include timeout duration in error message for partition replica', async () => {
      /**
       * **Validates: Requirements 7.2**
       * WHEN handling CREATE_REPLICA ACK timeout, THE System SHALL include
       * the timeout duration in the error message
       */
      await fc.assert(
        fc.asyncProperty(
          nodeIdArb,
          partitionIdArb,
          replicaIdArb,
          timeoutArb,
          async (nodeId, partitionId, replicaId, timeoutMs) => {
            manager = createManager(nodeId);

            const result = await manager.createPartitionReplica({
              partitionId,
              replicaId,
              timeoutMs,
            });

            // Requirement 7.2: Error message should include timeout duration
            assert.ok(
              result.error,
              'Result should have an error message',
            );
            assert.ok(
              result.error.includes(`${timeoutMs}ms`),
              `Error message should include timeout duration ${timeoutMs}ms: ${result.error}`,
            );
            assert.ok(
              result.error.includes('CREATE_REPLICA'),
              `Error message should include CREATE_REPLICA: ${result.error}`,
            );
          },
        ),
        {numRuns: 10},
      );
    });

    it('should clean up partial resources on partition replica timeout', async () => {
      /**
       * **Validates: Requirements 7.3**
       * IF CREATE_REPLICA fails due to timeout, THEN THE System SHALL clean
       * up any partially created resources
       */
      await fc.assert(
        fc.asyncProperty(
          nodeIdArb,
          partitionIdArb,
          replicaIdArb,
          timeoutArb,
          async (nodeId, partitionId, replicaId, timeoutMs) => {
            manager = createManager(nodeId);

            await manager.createPartitionReplica({
              partitionId,
              replicaId,
              timeoutMs,
            });

            // Requirement 7.3: Workers map should be cleaned up
            assert.strictEqual(
              manager.workers.size,
              0,
              'Workers map should be empty after timeout cleanup',
            );

            // Requirement 7.3: Worker should not be retrievable
            assert.strictEqual(
              manager.getWorker(replicaId),
              undefined,
              'Worker should not exist after timeout cleanup',
            );

            // Requirement 7.3: Handler should not be registered
            assert.strictEqual(
              mockMessageRouter.registerWorkerHandler.mock.calls.length,
              0,
              'Handler should not be registered after timeout',
            );
          },
        ),
        {numRuns: 10},
      );
    });
  });

  describe('Message Group Replica Timeout', () => {
    it('should return error object (not undefined) on message group replica timeout', async () => {
      /**
       * **Validates: Requirements 7.1**
       * WHEN a CREATE_REPLICA request times out, THE System SHALL return an
       * error response (not undefined)
       */
      await fc.assert(
        fc.asyncProperty(
          nodeIdArb,
          groupIdArb,
          replicaIdArb,
          timeoutArb,
          async (nodeId, groupId, replicaId, timeoutMs) => {
            manager = createManager(nodeId);

            const result = await manager.createMessageGroupReplica({
              groupId,
              replicaId,
              timeoutMs,
            });

            // Requirement 7.1: Should return error object, not undefined
            assert.ok(
              result !== undefined,
              'Result should not be undefined on timeout',
            );
            assert.strictEqual(
              typeof result,
              'object',
              'Result should be an object',
            );
            assert.strictEqual(
              result.success,
              false,
              'Result should indicate failure',
            );
            assert.strictEqual(
              result.replicaId,
              replicaId,
              'Result should include replicaId',
            );
          },
        ),
        {numRuns: 10},
      );
    });

    it('should include timeout duration in error message for message group replica', async () => {
      /**
       * **Validates: Requirements 7.2**
       * WHEN handling CREATE_REPLICA ACK timeout, THE System SHALL include
       * the timeout duration in the error message
       */
      await fc.assert(
        fc.asyncProperty(
          nodeIdArb,
          groupIdArb,
          replicaIdArb,
          timeoutArb,
          async (nodeId, groupId, replicaId, timeoutMs) => {
            manager = createManager(nodeId);

            const result = await manager.createMessageGroupReplica({
              groupId,
              replicaId,
              timeoutMs,
            });

            // Requirement 7.2: Error message should include timeout duration
            assert.ok(
              result.error,
              'Result should have an error message',
            );
            assert.ok(
              result.error.includes(`${timeoutMs}ms`),
              `Error message should include timeout duration ${timeoutMs}ms: ${result.error}`,
            );
            assert.ok(
              result.error.includes('CREATE_REPLICA'),
              `Error message should include CREATE_REPLICA: ${result.error}`,
            );
          },
        ),
        {numRuns: 10},
      );
    });

    it('should clean up partial resources on message group replica timeout', async () => {
      /**
       * **Validates: Requirements 7.3**
       * IF CREATE_REPLICA fails due to timeout, THEN THE System SHALL clean
       * up any partially created resources
       */
      await fc.assert(
        fc.asyncProperty(
          nodeIdArb,
          groupIdArb,
          replicaIdArb,
          timeoutArb,
          async (nodeId, groupId, replicaId, timeoutMs) => {
            manager = createManager(nodeId);

            await manager.createMessageGroupReplica({
              groupId,
              replicaId,
              timeoutMs,
            });

            // Requirement 7.3: Workers map should be cleaned up
            assert.strictEqual(
              manager.workers.size,
              0,
              'Workers map should be empty after timeout cleanup',
            );

            // Requirement 7.3: Worker should not be retrievable
            assert.strictEqual(
              manager.getWorker(replicaId),
              undefined,
              'Worker should not exist after timeout cleanup',
            );

            // Requirement 7.3: Handler should not be registered
            assert.strictEqual(
              mockMessageRouter.registerWorkerHandler.mock.calls.length,
              0,
              'Handler should not be registered after timeout',
            );
          },
        ),
        {numRuns: 10},
      );
    });
  });

  describe('Error Message Format', () => {
    it('should use consistent error message format from MANAGER_ERROR_MSG', async () => {
      /**
       * **Validates: Requirements 7.1, 7.2**
       * Verifies the error message format matches the expected constant format.
       */
      await fc.assert(
        fc.asyncProperty(
          nodeIdArb,
          partitionIdArb,
          replicaIdArb,
          timeoutArb,
          async (nodeId, partitionId, replicaId, timeoutMs) => {
            manager = createManager(nodeId);

            const result = await manager.createPartitionReplica({
              partitionId,
              replicaId,
              timeoutMs,
            });

            // Verify error message matches expected format
            const expectedError = MANAGER_ERROR_MSG.createReplicaTimeout(timeoutMs);
            assert.strictEqual(
              result.error,
              expectedError,
              `Error message should match expected format: ${expectedError}`,
            );
          },
        ),
        {numRuns: 10},
      );
    });
  });

  describe('Health Status Cleanup', () => {
    it('should not leave stale health status entries after timeout', async () => {
      /**
       * **Validates: Requirements 7.3**
       * Verifies health status is properly cleaned up after timeout.
       */
      await fc.assert(
        fc.asyncProperty(
          nodeIdArb,
          partitionIdArb,
          replicaIdArb,
          timeoutArb,
          async (nodeId, partitionId, replicaId, timeoutMs) => {
            manager = createManager(nodeId);

            await manager.createPartitionReplica({
              partitionId,
              replicaId,
              timeoutMs,
            });

            // Verify health status is empty
            const healthStatus = manager.getHealthStatus();
            assert.strictEqual(
              healthStatus.size,
              0,
              'Health status should be empty after timeout cleanup',
            );
            assert.strictEqual(
              healthStatus.has(replicaId),
              false,
              'Health status should not contain timed out replica',
            );
          },
        ),
        {numRuns: 10},
      );
    });
  });

  describe('Worker Count Cleanup', () => {
    it('should maintain correct worker count after timeout', async () => {
      /**
       * **Validates: Requirements 7.3**
       * Verifies worker count is properly maintained after timeout.
       */
      await fc.assert(
        fc.asyncProperty(
          nodeIdArb,
          partitionIdArb,
          replicaIdArb,
          timeoutArb,
          async (nodeId, partitionId, replicaId, timeoutMs) => {
            manager = createManager(nodeId);

            const initialCount = manager.getWorkerCount();
            assert.strictEqual(initialCount, 0, 'Initial worker count should be 0');

            await manager.createPartitionReplica({
              partitionId,
              replicaId,
              timeoutMs,
            });

            const finalCount = manager.getWorkerCount();
            assert.strictEqual(
              finalCount,
              0,
              'Worker count should be 0 after timeout cleanup',
            );
          },
        ),
        {numRuns: 10},
      );
    });
  });
});
