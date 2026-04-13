/**
 * Property Test: Pending Move Tracking
 * **Property 80: Pending Move Tracking**
 * **Validates: Requirements 10.23, 10.24**
 *
 * *For any* replica move operation, the system should:
 * 1. Track in-flight moves in replica_operations
 * 2. Exclude terminal moves from in-flight tracking
 * 3. Identify pending moves per replica and per node
 */
// @ts-nocheck


import {test} from '../../src/test-helpers/tap.js';
import fc from 'fast-check';
import {EntityType} from '../../src/rebalancer/unified-rebalancer.js';
import {ReplicaStatus} from '../../src/rebalancer/replica-status.js';
import {ConfigurationManager} from '../../src/config/configuration-manager.js';
import {LoggingService} from '../../src/logging/logging-service.js';
import {createTestRebalancer, createMockCache} from './test-helpers.js';

/**
 * Build a replica operation row.
 * @param {Object} data - Operation data.
 * @return {Object} Operation row.
 */
function createOperation(data) {
  return {
    operation_id: data.operationId,
    type: data.type || 'ADD',
    partition_id: data.partitionId,
    replica_id: data.replicaId,
    target_node_id: data.targetNodeId,
    status: data.status,
    workflow_step: data.workflowStep || 'PENDING',
  };
}

test('Property 80: Pending Move Tracking', async (t) => {
  t.beforeEach(() => {
    ConfigurationManager.resetInstance();
    LoggingService.resetInstance();

    const config = ConfigurationManager.getInstance();
    config.initialize({});

    const logging = LoggingService.getInstance();
    logging.initialize({level: 'error'});
  });

  t.afterEach(() => {
    ConfigurationManager.resetInstance();
    LoggingService.resetInstance();
  });

  t.test('in-flight operations are returned for non-terminal statuses', async (t) => {
    const inFlightStatuses = [
      ReplicaStatus.PENDING,
      ReplicaStatus.CREATING,
      ReplicaStatus.SYNCING,
      ReplicaStatus.REMOVING,
    ];

    await fc.assert(
      fc.asyncProperty(
        fc.uuid(),
        fc.uuid(),
        fc.constantFrom(...inFlightStatuses),
        async (partitionId, replicaId, status) => {
          const operation = createOperation({
            operationId: 'op-1',
            partitionId,
            replicaId,
            status,
          });

          const mockCache = createMockCache({
            replicaOperations: [operation],
          });

          const rebalancer = createTestRebalancer({
            entityId: partitionId,
            entityType: EntityType.PARTITION,
            systemTableCache: mockCache,
            nodeId: 'test-node',
          });

          rebalancer.initialize();
          const inFlight = rebalancer.getInFlightOperations();
          rebalancer.shutdown();

          return inFlight.length === 1 &&
            inFlight[0].operation_id === operation.operation_id;
        },
      ),
      {numRuns: 10},
    );

    t.pass('in-flight operations are returned');
  });

  t.test('terminal statuses are excluded from in-flight operations', async (t) => {
    const terminalStatuses = [
      ReplicaStatus.ACTIVE,
      ReplicaStatus.REMOVED,
      ReplicaStatus.FAILED,
    ];

    await fc.assert(
      fc.asyncProperty(
        fc.uuid(),
        fc.uuid(),
        fc.constantFrom(...terminalStatuses),
        async (partitionId, replicaId, status) => {
          const operation = createOperation({
            operationId: 'op-1',
            partitionId,
            replicaId,
            status,
          });

          const mockCache = createMockCache({
            replicaOperations: [operation],
          });

          const rebalancer = createTestRebalancer({
            entityId: partitionId,
            entityType: EntityType.PARTITION,
            systemTableCache: mockCache,
            nodeId: 'test-node',
          });

          rebalancer.initialize();
          const inFlight = rebalancer.getInFlightOperations();
          rebalancer.shutdown();

          return inFlight.length === 0;
        },
      ),
      {numRuns: 10},
    );

    t.pass('terminal statuses are excluded');
  });

  t.test('hasPendingMove identifies in-flight replica operations', async (t) => {
    await fc.assert(
      fc.asyncProperty(
        fc.uuid(),
        fc.uuid(),
        async (partitionId, replicaId) => {
          const operation = createOperation({
            operationId: 'op-1',
            partitionId,
            replicaId,
            status: ReplicaStatus.PENDING,
          });

          const mockCache = createMockCache({
            replicaOperations: [operation],
          });

          const rebalancer = createTestRebalancer({
            entityId: partitionId,
            entityType: EntityType.PARTITION,
            systemTableCache: mockCache,
            nodeId: 'test-node',
          });

          rebalancer.initialize();
          const hasPending = rebalancer.hasPendingMove(replicaId);
          rebalancer.shutdown();

          return hasPending;
        },
      ),
      {numRuns: 10},
    );

    t.pass('hasPendingMove identifies in-flight operations');
  });

  t.test('hasPendingAddForNode identifies pending ADD operations', async (t) => {
    await fc.assert(
      fc.asyncProperty(
        fc.uuid(),
        fc.uuid(),
        async (partitionId, nodeId) => {
          const operation = createOperation({
            operationId: 'op-1',
            partitionId,
            replicaId: 'replica-1',
            targetNodeId: nodeId,
            status: ReplicaStatus.PENDING,
            type: 'ADD',
          });

          const mockCache = createMockCache({
            replicaOperations: [operation],
          });

          const rebalancer = createTestRebalancer({
            entityId: partitionId,
            entityType: EntityType.PARTITION,
            systemTableCache: mockCache,
            nodeId: 'test-node',
          });

          rebalancer.initialize();
          const hasPending = rebalancer.hasPendingAddForNode(nodeId);
          rebalancer.shutdown();

          return hasPending;
        },
      ),
      {numRuns: 10},
    );

    t.pass('hasPendingAddForNode identifies pending ADD operations');
  });
});
