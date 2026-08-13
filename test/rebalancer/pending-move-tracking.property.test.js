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

import {test} from '../../src/test-helpers/tap.js';
import fc from 'fast-check';
import {EntityType} from '../../src/rebalancer/unified-rebalancer.js';
import {
  OperationType,
  ReplicaStatus,
} from '../../src/rebalancer/replica-status.js';
import {WORKFLOW_STEP} from '../../src/constants/index.js';
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
    sourceReplicaId: data.sourceReplicaId,
    target_node_id: data.targetNodeId,
    status: data.status,
    workflow_step: data.workflowStep || 'PENDING',
    completed_at: data.completedAt,
    stepsHistory: data.stepsHistory,
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
    const terminalRows = [
      {
        type: OperationType.ADD,
        status: ReplicaStatus.ACTIVE,
        workflowStep: WORKFLOW_STEP.ACTIVE,
      },
      {
        type: OperationType.ADD,
        status: ReplicaStatus.FAILED,
        workflowStep: WORKFLOW_STEP.FAILED,
      },
      {
        type: OperationType.REMOVE,
        status: ReplicaStatus.REMOVED,
        workflowStep: WORKFLOW_STEP.REMOVED,
      },
      {
        type: OperationType.REMOVE,
        status: ReplicaStatus.FAILED,
        workflowStep: WORKFLOW_STEP.FAILED,
      },
      {
        type: OperationType.REPLACE,
        status: ReplicaStatus.REMOVED,
        workflowStep: WORKFLOW_STEP.REMOVED,
      },
      {
        type: OperationType.REPLACE,
        status: ReplicaStatus.FAILED,
        workflowStep: WORKFLOW_STEP.FAILED,
      },
    ];

    await fc.assert(
      fc.asyncProperty(
        fc.uuid(),
        fc.uuid(),
        fc.constantFrom(...terminalRows),
        async (partitionId, replicaId, terminalRow) => {
          const operation = createOperation({
            operationId: 'op-1',
            type: terminalRow.type,
            partitionId,
            replicaId,
            status: terminalRow.status,
            workflowStep: terminalRow.workflowStep,
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

  t.test('hasPendingMove identifies the source side of in-flight REPLACE operations', async (t) => {
    const partitionId = 'partition-source-pending';
    const sourceReplicaId = 'partition-source-pending-r1';
    const targetReplicaId = 'partition-source-pending-r4';
    const targetNodeId = 'node-target';
    const operation = createOperation({
      operationId: 'operation-replace-active',
      type: OperationType.REPLACE,
      partitionId,
      replicaId: targetReplicaId,
      sourceReplicaId,
      targetNodeId,
      status: ReplicaStatus.ACTIVE,
      workflowStep: WORKFLOW_STEP.ACTIVE,
      stepsHistory: [
        {
          step: WORKFLOW_STEP.PENDING,
          sourceReplicaId,
        },
      ],
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
    const hasPending = rebalancer.hasPendingMove(sourceReplicaId);
    rebalancer.shutdown();

    t.equal(
      hasPending,
      true,
      'the retiring source replica should remain protected while REPLACE source removal is in flight',
    );
  });

  t.test('getCurrentReplicas projects out sources retired by terminal REPLACE operations', async (t) => {
    const partitionId = 'partition-retired-source';
    const sourceReplicaId = 'partition-retired-source-r1';
    const survivorReplicaId = 'partition-retired-source-r2';
    const targetReplicaId = 'partition-retired-source-r4';
    const sourceNodeId = 'node-source';
    const survivorNodeId = 'node-survivor';
    const targetNodeId = 'node-target';
    const completedAt = Date.now();
    const services = [
      {
        service_id: sourceReplicaId,
        replica_id: sourceReplicaId,
        service_type: EntityType.PARTITION,
        partition_id: partitionId,
        node_id: sourceNodeId,
        status: ReplicaStatus.ACTIVE,
      },
      {
        service_id: survivorReplicaId,
        replica_id: survivorReplicaId,
        service_type: EntityType.PARTITION,
        partition_id: partitionId,
        node_id: survivorNodeId,
        status: ReplicaStatus.ACTIVE,
      },
      {
        service_id: targetReplicaId,
        replica_id: targetReplicaId,
        service_type: EntityType.PARTITION,
        partition_id: partitionId,
        node_id: targetNodeId,
        status: ReplicaStatus.ACTIVE,
      },
    ];
    const operation = createOperation({
      operationId: 'operation-replace-removed',
      type: OperationType.REPLACE,
      partitionId,
      replicaId: targetReplicaId,
      sourceReplicaId,
      targetNodeId,
      status: ReplicaStatus.REMOVED,
      workflowStep: WORKFLOW_STEP.REMOVED,
      completedAt,
      stepsHistory: [
        {
          step: WORKFLOW_STEP.PENDING,
          sourceReplicaId,
        },
      ],
    });
    const mockCache = createMockCache({
      services,
      replicaOperations: [operation],
    });
    const rebalancer = createTestRebalancer({
      entityId: partitionId,
      entityType: EntityType.PARTITION,
      systemTableCache: mockCache,
      nodeId: 'test-node',
    });

    rebalancer.initialize();
    const currentReplicaIds = rebalancer
      .getCurrentReplicas()
      .map((replica) => replica.replica_id);
    rebalancer.shutdown();

    t.equal(
      currentReplicaIds.includes(sourceReplicaId),
      false,
      'a terminal REPLACE source must not be planned as a live current replica from stale service cache',
    );
    t.equal(
      currentReplicaIds.includes(survivorReplicaId),
      true,
      'unrelated current replicas should remain visible',
    );
    t.equal(
      currentReplicaIds.includes(targetReplicaId),
      true,
      'the replacement target should remain visible',
    );
  });

  t.test(
    'getCurrentReplicas projects a terminal priority REPLACE target as voter-ready',
    async (t) => {
      const partitionId = 'replica_operations-p1';
      const sourceReplicaId = 'replica_operations-p1-r1';
      const survivorReplicaId = 'replica_operations-p1-r2';
      const secondSurvivorReplicaId = 'replica_operations-p1-r3';
      const targetReplicaId = 'replace-replica-target';
      const targetNodeId = 'node-target';
      const services = [
        {
          service_id: sourceReplicaId,
          replica_id: sourceReplicaId,
          service_type: EntityType.PARTITION,
          partition_id: partitionId,
          node_id: 'node-source',
          status: ReplicaStatus.ACTIVE,
          raft_role: 'leader',
        },
        {
          service_id: survivorReplicaId,
          replica_id: survivorReplicaId,
          service_type: EntityType.PARTITION,
          partition_id: partitionId,
          node_id: 'node-source',
          status: ReplicaStatus.ACTIVE,
          raft_role: 'follower',
        },
        {
          service_id: secondSurvivorReplicaId,
          replica_id: secondSurvivorReplicaId,
          service_type: EntityType.PARTITION,
          partition_id: partitionId,
          node_id: 'node-source',
          status: ReplicaStatus.ACTIVE,
          raft_role: 'follower',
        },
        {
          service_id: targetReplicaId,
          replica_id: targetReplicaId,
          service_type: EntityType.PARTITION,
          partition_id: partitionId,
          node_id: targetNodeId,
          status: ReplicaStatus.SYNCING,
          raft_role: 'learner',
        },
      ];
      const operation = createOperation({
        operationId: 'operation-priority-replace-removed',
        type: OperationType.REPLACE,
        partitionId,
        replicaId: targetReplicaId,
        sourceReplicaId,
        targetNodeId,
        status: ReplicaStatus.REMOVED,
        workflowStep: WORKFLOW_STEP.REMOVED,
        completedAt: Date.now(),
        stepsHistory: [
          {
            step: WORKFLOW_STEP.PENDING,
            sourceReplicaId,
          },
        ],
      });
      const rebalancer = createTestRebalancer({
        entityId: partitionId,
        entityType: EntityType.PARTITION,
        systemTableCache: createMockCache({
          services,
          replicaOperations: [operation],
        }),
        nodeId: 'test-node',
      });

      rebalancer.initialize();
      const currentReplicas = rebalancer.getCurrentReplicas();
      const targetReplica = currentReplicas.find(
        (replica) => replica.replica_id === targetReplicaId,
      );
      const moves = rebalancer.calculateMoves(currentReplicas, {
        targetReplicaCount: 3,
        targetNodes: ['node-source', targetNodeId, 'node-spread'],
        degraded: false,
      });
      rebalancer.shutdown();

      t.equal(
        currentReplicas.some(
          (replica) => replica.replica_id === sourceReplicaId,
        ),
        false,
        'the terminal source is retired from planning',
      );
      t.match(
        targetReplica,
        {
          status: ReplicaStatus.ACTIVE,
          raft_role: 'follower',
        },
        'the completed target is projected through stale syncing/learner cache state',
      );
      t.matchOnly(
        moves,
        [{
          type: 'add',
          nodeId: 'node-spread',
          reason: 'spread_replicas',
        }],
        'the live-shaped 2-1 placement expands without another REPLACE',
      );
    },
  );

  t.test(
    'terminal priority REPLACE projection preserves explicit target removal',
    async (t) => {
      const partitionId = 'replica_operations-p1';
      const sourceReplicaId = 'replica_operations-p1-r1';
      const targetReplicaId = 'replace-replica-removed-target';
      const targetNodeId = 'node-target';
      const operation = createOperation({
        operationId: 'operation-priority-replace-explicit-target-removal',
        type: OperationType.REPLACE,
        partitionId,
        replicaId: targetReplicaId,
        sourceReplicaId,
        targetNodeId,
        status: ReplicaStatus.REMOVED,
        workflowStep: WORKFLOW_STEP.REMOVED,
        completedAt: Date.now(),
      });
      const rebalancer = createTestRebalancer({
        entityId: partitionId,
        entityType: EntityType.PARTITION,
        systemTableCache: createMockCache({
          services: [
            {
              service_id: sourceReplicaId,
              replica_id: sourceReplicaId,
              service_type: EntityType.PARTITION,
              partition_id: partitionId,
              node_id: 'node-source',
              status: ReplicaStatus.ACTIVE,
            },
            {
              service_id: targetReplicaId,
              replica_id: targetReplicaId,
              service_type: EntityType.PARTITION,
              partition_id: partitionId,
              node_id: targetNodeId,
              status: ReplicaStatus.REMOVED,
              raft_role: 'learner',
            },
          ],
          replicaOperations: [operation],
        }),
        nodeId: 'test-node',
      });

      rebalancer.initialize();
      const targetReplica = rebalancer.getCurrentReplicas().find(
        (replica) => replica.replica_id === targetReplicaId,
      );
      rebalancer.shutdown();

      t.match(
        targetReplica,
        {
          status: ReplicaStatus.REMOVED,
          raft_role: 'learner',
        },
        'explicit terminal target evidence is not promoted',
      );
    },
  );

  t.test(
    'getCurrentReplicas projects a terminal priority ADD target before drain planning',
    async (t) => {
      const partitionId = 'schema_operations-p1';
      const targetReplicaId = 'schema-operations-p1-r4';
      const targetNodeId = 'node-target';
      const services = [
        {
          service_id: 'schema-operations-p1-r1',
          replica_id: 'schema-operations-p1-r1',
          service_type: EntityType.PARTITION,
          partition_id: partitionId,
          node_id: 'node-source',
          status: ReplicaStatus.ACTIVE,
          raft_role: 'leader',
        },
        {
          service_id: 'schema-operations-p1-r2',
          replica_id: 'schema-operations-p1-r2',
          service_type: EntityType.PARTITION,
          partition_id: partitionId,
          node_id: 'node-source',
          status: ReplicaStatus.ACTIVE,
          raft_role: 'follower',
        },
        {
          service_id: 'schema-operations-p1-r3',
          replica_id: 'schema-operations-p1-r3',
          service_type: EntityType.PARTITION,
          partition_id: partitionId,
          node_id: 'node-spread',
          status: ReplicaStatus.ACTIVE,
          raft_role: 'follower',
        },
      ];
      const operation = createOperation({
        operationId: 'operation-priority-add-active',
        type: OperationType.ADD,
        partitionId,
        replicaId: targetReplicaId,
        targetNodeId,
        status: ReplicaStatus.ACTIVE,
        workflowStep: WORKFLOW_STEP.ACTIVE,
        completedAt: Date.now(),
      });
      const rebalancer = createTestRebalancer({
        entityId: partitionId,
        entityType: EntityType.PARTITION,
        systemTableCache: createMockCache({
          services,
          replicaOperations: [operation],
        }),
        nodeId: 'test-node',
      });

      rebalancer.initialize();
      const currentReplicas = rebalancer.getCurrentReplicas();
      const targetReplica = currentReplicas.find(
        (replica) => replica.replica_id === targetReplicaId,
      );
      const moves = rebalancer.calculateMoves(currentReplicas, {
        targetReplicaCount: 3,
        targetNodes: ['node-source', targetNodeId, 'node-spread'],
        degraded: false,
      });
      rebalancer.shutdown();

      t.match(
        targetReplica,
        {
          status: ReplicaStatus.ACTIVE,
          raft_role: 'follower',
          node_id: targetNodeId,
        },
        'the completed ADD target is current even while its service row lags',
      );
      t.equal(
        moves.length,
        1,
        'target-plus-one visibility should produce one drain move',
      );
      t.match(
        moves[0],
        {
          type: 'remove',
          nodeId: 'node-source',
          reason: 'spread_replicas',
        },
        'the completion wake should plan the monotonic surplus drain',
      );
    },
  );

  t.test(
    'terminal REMOVE prevents an older priority ADD from resurrecting its target',
    async (t) => {
      const partitionId = 'schema_operations-p1';
      const targetReplicaId = 'schema-operations-p1-r4';
      const targetNodeId = 'node-target';
      const completedAdd = createOperation({
        operationId: 'operation-priority-add-before-remove',
        type: OperationType.ADD,
        partitionId,
        replicaId: targetReplicaId,
        targetNodeId,
        status: ReplicaStatus.ACTIVE,
        workflowStep: WORKFLOW_STEP.ACTIVE,
        completedAt: Date.now() - 1,
      });
      const completedRemove = createOperation({
        operationId: 'operation-priority-remove-after-add',
        type: OperationType.REMOVE,
        partitionId,
        replicaId: targetReplicaId,
        targetNodeId,
        status: ReplicaStatus.REMOVED,
        workflowStep: WORKFLOW_STEP.REMOVED,
        completedAt: Date.now(),
      });
      const rebalancer = createTestRebalancer({
        entityId: partitionId,
        entityType: EntityType.PARTITION,
        systemTableCache: createMockCache({
          services: [],
          replicaOperations: [completedAdd, completedRemove],
        }),
        nodeId: 'test-node',
      });

      rebalancer.initialize();
      const currentReplicas = rebalancer.getCurrentReplicas();
      rebalancer.shutdown();

      t.equal(
        currentReplicas.some(
          (replica) => replica.replica_id === targetReplicaId,
        ),
        false,
        'later operation-owner retirement evidence wins over create history',
      );
    },
  );

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
