import {test} from '../../src/test-helpers/tap.js';
import {WORKFLOW_STEP} from '../../src/constants/index.js';
import {
  OperationType,
  ReplicaStatus,
} from '../../src/rebalancer/replica-status.js';
import {ReplicaOperationResponseStatus} from '../../src/rebalancer/replica-operation-constants.js';
import {createTestCoordinator} from './test-helpers.js';

const TEST_PARTITION_ID = 'replica_operations-p1';
const TEST_ENTITY_TYPE = 'partition';
const TEST_OPERATION_ID = 'priority-replace-exact-target-observation';
const TEST_SOURCE_NODE_ID = 'node-source';
const TEST_TARGET_NODE_ID = 'node-target';
const TEST_SOURCE_REPLICA_ID = TEST_PARTITION_ID + '-r2';
const TEST_SIBLING_REPLICA_ID = TEST_PARTITION_ID + '-r4';
const TEST_TARGET_REPLICA_ID = TEST_PARTITION_ID + '-r5';
const TEST_SOURCE_ADDRESS =
  TEST_SOURCE_NODE_ID + '/partition/' + TEST_SOURCE_REPLICA_ID;
const TEST_SIBLING_ADDRESS =
  TEST_TARGET_NODE_ID + '/partition/' + TEST_SIBLING_REPLICA_ID;
const TEST_OBSERVATION_STATE = 'observed';
const TEST_AUTHORITATIVE_SOURCE = 'authoritative';
const TEST_PRIORITY_RECOVERY_COMPLETION = Object.freeze({
  state: 'spread_satisfied_in_flight',
  blocked: false,
});

test(
  'RebalanceCoordinator does not promote SYNCING priority REPLACE from ' +
    'sibling partition-node visibility',
  async (t) => {
    const deliveries = [];
    const nowMs = Date.now();
    const coordinator = createTestCoordinator({
      nodeId: TEST_TARGET_NODE_ID,
      enableTimeouts: false,
      messageRouter: {
        async deliver(target, payload) {
          deliveries.push({target, payload});
          return {
            acknowledged: true,
            status: ReplicaOperationResponseStatus.INITIATED,
          };
        },
      },
      cacheData: {
        services: [
          {
            service_id: TEST_SOURCE_REPLICA_ID,
            replica_id: TEST_SOURCE_REPLICA_ID,
            service_type: TEST_ENTITY_TYPE,
            partition_id: TEST_PARTITION_ID,
            node_id: TEST_SOURCE_NODE_ID,
            status: ReplicaStatus.ACTIVE,
            raft_role: 'follower',
            address: TEST_SOURCE_ADDRESS,
          },
          {
            service_id: TEST_SIBLING_REPLICA_ID,
            replica_id: TEST_SIBLING_REPLICA_ID,
            service_type: TEST_ENTITY_TYPE,
            partition_id: TEST_PARTITION_ID,
            node_id: TEST_TARGET_NODE_ID,
            status: ReplicaStatus.ACTIVE,
            raft_role: 'follower',
            address: TEST_SIBLING_ADDRESS,
          },
        ],
        replicaOperations: [
          {
            operation_id: TEST_OPERATION_ID,
            type: OperationType.REPLACE,
            partition_id: TEST_PARTITION_ID,
            replica_id: TEST_TARGET_REPLICA_ID,
            source_node_id: TEST_SOURCE_NODE_ID,
            target_node_id: TEST_TARGET_NODE_ID,
            status: ReplicaStatus.SYNCING,
            workflow_step: WORKFLOW_STEP.SYNCING,
            created_at: nowMs,
            updated_at: nowMs,
            completed_at: null,
            error_message: null,
            entity_type: TEST_ENTITY_TYPE,
            entity_id: TEST_PARTITION_ID,
            steps_history: JSON.stringify([
              {
                step: WORKFLOW_STEP.PENDING,
                timestamp: nowMs,
                sourceReplicaId: TEST_SOURCE_REPLICA_ID,
              },
              {
                step: WORKFLOW_STEP.SYNCING,
                timestamp: nowMs,
                previousStep: WORKFLOW_STEP.CREATING,
              },
            ]),
          },
        ],
      },
    });

    const baseGetActualReplicaObservation =
      coordinator.repository.getActualReplicaObservation.bind(
        coordinator.repository,
      );
    coordinator.workflowOwner.buildPriorityRecoveryCompletionForOperation =
      () => TEST_PRIORITY_RECOVERY_COMPLETION;
    coordinator.repository.getActualReplicaObservation =
      async (replicaId, partitionId, targetNodeId, readOptions = {}) => {
        if (
          replicaId === TEST_SOURCE_REPLICA_ID &&
          partitionId === TEST_PARTITION_ID &&
          targetNodeId === TEST_SOURCE_NODE_ID
        ) {
          return Object.freeze({
            state: TEST_OBSERVATION_STATE,
            source: TEST_AUTHORITATIVE_SOURCE,
            lifecycleStatus: ReplicaStatus.ACTIVE,
          });
        }
        return baseGetActualReplicaObservation(
          replicaId,
          partitionId,
          targetNodeId,
          readOptions,
        );
      };

    try {
      const operation = await coordinator.getOperation(TEST_OPERATION_ID);
      const progressed =
        await coordinator.workflowOwner.reconcileOperationProgress(operation);
      const persistedOperation =
        await coordinator.getOperation(TEST_OPERATION_ID);

      t.equal(
        progressed,
        false,
        'sibling visibility should not count as target progress',
      );
      t.equal(
        deliveries.length,
        0,
        'exact-target absence should not dispatch source removal',
      );
      t.equal(
        persistedOperation?.workflowStep,
        WORKFLOW_STEP.SYNCING,
        'exact-target absence should keep the replacement in syncing',
      );
      t.equal(
        persistedOperation?.status,
        ReplicaStatus.SYNCING,
        'exact-target absence should preserve syncing status',
      );
    } finally {
      await coordinator.shutdown();
    }
  },
);
