import {test} from '../../src/test-helpers/tap.js';
import {WORKFLOW_STEP} from '../../src/constants/index.js';
import {
  SYSTEM_TABLE_NAME,
} from '../../src/bootstrap/system-table-schemas-constants.js';
import {
  ControlPlaneField,
  ControlPlaneMessageType,
} from '../../src/control-plane/control-plane-constants.js';
import {
  PRIORITY_RECOVERY_COMPLETION_STATE,
} from '../../src/control-plane/priority-recovery-completion.js';
import {
  OperationType,
  ReplicaStatus,
} from '../../src/rebalancer/replica-status.js';
import {
  OPERATION_WORKFLOW_OWNER_SHARED,
} from '../../src/rebalancer/operation-workflow-owner-shared.js';
import {
  ReplicaOperationMessageType,
  ReplicaOperationResponseStatus,
} from '../../src/rebalancer/replica-operation-constants.js';
import {RAFT_ROLE} from '../../src/raft/constants.js';
import {createTestCoordinator} from './test-helpers.js';

const STOPPING_REPLICA_OBSERVATION_STATE = Object.freeze({
  OBSERVED: 'observed',
  ABSENT: 'absent',
  UNAVAILABLE: 'unavailable',
});

const PRIORITY_DRAIN_TEST_PUBLICATION_STATUS = 'PUBLISHED';
const PRIORITY_DRAIN_TEST_ENTITY_TYPE = 'partition';
const PRIORITY_DRAIN_TEST_SOURCE_NODE_ID = 'node-source';
const PRIORITY_DRAIN_TEST_TARGET_NODE_ID = 'node-target';
const PRIORITY_DRAIN_TEST_READY_NODE_IDS = Object.freeze([
  PRIORITY_DRAIN_TEST_SOURCE_NODE_ID,
  PRIORITY_DRAIN_TEST_TARGET_NODE_ID,
  'node-peer',
]);
const PRIORITY_DRAIN_TEST_REQUIRED_DISTINCT_NODE_COUNT = 3;
const PRIORITY_DRAIN_TEST_NO_COMPLETED_AT = null;
const PRIORITY_DRAIN_TEST_NO_ERROR_MESSAGE = null;
const PRIORITY_DRAIN_TEST_BLOCKED_PARTITION_COUNT = 1;
const PRIORITY_DRAIN_TEST_SPREAD_GAP = 1;
const PRIORITY_DRAIN_TEST_READY_DISTINCT_NODE_COUNT = 2;
const PRIORITY_DRAIN_TEST_TOTAL_SPREAD_GAP = 1;
const PRIORITY_DRAIN_TEST_RECOVERY_ELIGIBLE_EXCLUDED_REASON =
  'publication_recovery_eligible_but_coordinator_excludes_node';
const PRIORITY_DRAIN_TEST_COMPLETION_BLOCKED_STATE = 'blocked';
const PRIORITY_DRAIN_TEST_ACTIVE_OPERATION_STILL_BLOCKS_REASON =
  'active_operation_still_blocks_spread';
const PRIORITY_DRAIN_TEST_STALE_TARGET_NODE_ID = 'node-stale-target';
const PRIORITY_DRAIN_TEST_AUTHORITATIVE_SOURCE = 'authoritative';
const PRIORITY_DRAIN_TEST_UNAVAILABLE_TARGET_NODE_ID =
  'node-unavailable-target';
const PRIORITY_DRAIN_TEST_REMOTE_RELEASE_OPERATION_ID =
  'priority-drain-remote-owner-unavailable-active';
const PRIORITY_DRAIN_TEST_REMOTE_RELEASE_SYNCING_OPERATION_ID =
  'priority-drain-remote-owner-unavailable-syncing';
const PRIORITY_DRAIN_TEST_REMOTE_RELEASE_STOPPING_OPERATION_ID =
  'priority-drain-remote-owner-unavailable-stopping';
const PRIORITY_DRAIN_TEST_TERMINAL_GUARD_OPERATION_ID =
  'priority-drain-terminal-guard';
const PRIORITY_DRAIN_TEST_FOLLOWER_ELECTION_OPERATION_ID =
  'priority-drain-follower-election-safe';
const PRIORITY_DRAIN_TEST_REMOTE_RELEASE_PARTITION_ID =
  'sql_write_operations-p1';
const PRIORITY_DRAIN_TEST_REMOTE_RELEASE_SERVICE_TYPE = 'partition';
const PRIORITY_DRAIN_TEST_REMOTE_RELEASE_VOTER_ROLE = 'follower';
const PRIORITY_DRAIN_TEST_REMOTE_RELEASE_SOURCE_ACTIVE_ASSERTION =
  'remote owner unavailable priority drain should settle without dispatch';
const PRIORITY_DRAIN_TEST_REMOTE_RELEASE_SOURCE_STOPPING_ASSERTION =
  'remote owner unavailable source-removal drain should settle without dispatch';
const PRIORITY_DRAIN_TEST_REMOTE_RELEASE_TERMINAL_ASSERTION =
  'remote owner unavailable ACTIVE replacement should become terminal';
const PRIORITY_DRAIN_TEST_REMOTE_RELEASE_SYNCING_ASSERTION =
  'remote owner unavailable SYNCING replacement should become terminal';
const PRIORITY_DRAIN_TEST_REMOTE_RELEASE_STOPPING_ASSERTION =
  'remote owner unavailable STOPPING replacement should become terminal';
const PRIORITY_DRAIN_TEST_REMOTE_RELEASE_NO_DELIVERY_ASSERTION =
  'remote owner unavailable priority drain should not replay source removal';
const PRIORITY_DRAIN_TEST_FOLLOWER_ELECTION_DISPATCH_ASSERTION =
  'fresh replacement election evidence should dispatch source removal';
const PRIORITY_DRAIN_TEST_FOLLOWER_ELECTION_STEP_ASSERTION =
  'fresh replacement election evidence should advance source removal';
const PRIORITY_DRAIN_TEST_TERMINAL_GUARD_TRANSITION_ASSERTION =
  'stale direct priority transition should not commit';
const PRIORITY_DRAIN_TEST_TERMINAL_GUARD_STEP_ASSERTION =
  'stale direct priority transition should not overwrite terminal step';
const PRIORITY_DRAIN_TEST_TERMINAL_GUARD_STATUS_ASSERTION =
  'stale direct priority transition should not overwrite terminal status';

function buildPriorityDrainConvergedPlanningSnapshot(partitionId) {
  return Object.freeze({
    publicationStatus: PRIORITY_DRAIN_TEST_PUBLICATION_STATUS,
    publishedActiveNodeIdsPresent: true,
    publishedActiveNodeIds: PRIORITY_DRAIN_TEST_READY_NODE_IDS,
    recoveryActiveNodeIds: PRIORITY_DRAIN_TEST_READY_NODE_IDS,
    projectedServingNodeIds: PRIORITY_DRAIN_TEST_READY_NODE_IDS,
    locallyEligibleNodeIds: PRIORITY_DRAIN_TEST_READY_NODE_IDS,
    priorityPartitionSummary: Object.freeze({
      satisfied: true,
      requiredDistinctNodeCount:
        PRIORITY_DRAIN_TEST_REQUIRED_DISTINCT_NODE_COUNT,
      missingPartitionIds: Object.freeze([]),
      blockedPartitions: Object.freeze([]),
      blockedPartitionCount: 0,
      largestSpreadGap: 0,
      totalSpreadGap: 0,
      totalPriorityPartitionCount: 1,
      witnessPartitionIds: Object.freeze([partitionId]),
    }),
  });
}

function buildPriorityDrainSupersededPlanningSnapshot(
  partitionId,
  operationId,
) {
  return Object.freeze({
    publicationStatus: PRIORITY_DRAIN_TEST_PUBLICATION_STATUS,
    publishedActiveNodeIdsPresent: true,
    publishedActiveNodeIds: PRIORITY_DRAIN_TEST_READY_NODE_IDS,
    recoveryActiveNodeIds: PRIORITY_DRAIN_TEST_READY_NODE_IDS,
    projectedServingNodeIds: PRIORITY_DRAIN_TEST_READY_NODE_IDS,
    locallyEligibleNodeIds: PRIORITY_DRAIN_TEST_READY_NODE_IDS,
    priorityPartitionSummary: Object.freeze({
      satisfied: false,
      requiredDistinctNodeCount:
        PRIORITY_DRAIN_TEST_REQUIRED_DISTINCT_NODE_COUNT,
      missingPartitionIds: Object.freeze([partitionId]),
      blockedPartitions: Object.freeze([Object.freeze({
        partitionId,
        requiredDistinctNodeCount:
          PRIORITY_DRAIN_TEST_REQUIRED_DISTINCT_NODE_COUNT,
        readyDistinctNodeCount:
          PRIORITY_DRAIN_TEST_READY_DISTINCT_NODE_COUNT,
        spreadGap: PRIORITY_DRAIN_TEST_SPREAD_GAP,
      })]),
      blockedPartitionCount: PRIORITY_DRAIN_TEST_BLOCKED_PARTITION_COUNT,
      largestSpreadGap: PRIORITY_DRAIN_TEST_SPREAD_GAP,
      totalSpreadGap: PRIORITY_DRAIN_TEST_TOTAL_SPREAD_GAP,
      totalPriorityPartitionCount: PRIORITY_DRAIN_TEST_BLOCKED_PARTITION_COUNT,
      witnessPartitionIds: Object.freeze([partitionId]),
    }),
    priorityRecoveryDecisionSnapshots: Object.freeze({
      snapshots: Object.freeze([Object.freeze({
        partitionId,
        operationId,
        operationIds: Object.freeze([operationId]),
        blockerReasons: Object.freeze([
          PRIORITY_DRAIN_TEST_RECOVERY_ELIGIBLE_EXCLUDED_REASON,
        ]),
        admission: Object.freeze({
          effectiveEligibleNodeIds: PRIORITY_DRAIN_TEST_READY_NODE_IDS,
          effectiveEligibleNodeCount: PRIORITY_DRAIN_TEST_READY_NODE_IDS.length,
        }),
        completion: Object.freeze({
          state: PRIORITY_DRAIN_TEST_COMPLETION_BLOCKED_STATE,
          reasonCode: PRIORITY_DRAIN_TEST_ACTIVE_OPERATION_STILL_BLOCKS_REASON,
          blocked: true,
        }),
        spreadCompletion: Object.freeze({
          satisfied: false,
          reasonCode: PRIORITY_DRAIN_TEST_ACTIVE_OPERATION_STILL_BLOCKS_REASON,
          blockingOperationIds: Object.freeze([operationId]),
          blockingOperationCount: PRIORITY_DRAIN_TEST_BLOCKED_PARTITION_COUNT,
        }),
      })]),
    }),
  });
}

function buildPriorityDrainReadinessService(partitionId) {
  const planningSnapshot =
    buildPriorityDrainConvergedPlanningSnapshot(partitionId);
  return Object.freeze({
    getNodeReadinessSync(nodeId) {
      return {
        nodeId,
        dimensions: {
          controlPlaneRecoveryEligible: true,
          repairEligible: true,
          serveEligible: true,
        },
      };
    },
    getPriorityRecoveryPlanningSnapshotBestEffort() {
      return planningSnapshot;
    },
  });
}

function buildPriorityDrainOwnerUnavailableReadinessService(
  partitionId,
  unavailableNodeId,
) {
  const planningSnapshot =
    buildPriorityDrainConvergedPlanningSnapshot(partitionId);
  return Object.freeze({
    getNodeReadinessSync(nodeId) {
      const unavailable = nodeId === unavailableNodeId;
      return {
        nodeId,
        dimensions: {
          processAlive: !unavailable,
          clusterMemberHealthy: !unavailable,
          controlPlaneWritable: !unavailable,
          controlPlanePublished: true,
          controlPlaneRecoveryEligible: !unavailable,
          repairEligible: !unavailable,
          serveEligible: !unavailable,
        },
      };
    },
    getPriorityRecoveryPlanningSnapshotBestEffort() {
      return planningSnapshot;
    },
  });
}

function buildPriorityDrainSupersededReadinessService(
  partitionId,
  operationId,
) {
  const planningSnapshot =
    buildPriorityDrainSupersededPlanningSnapshot(partitionId, operationId);
  return Object.freeze({
    getNodeReadinessSync(nodeId) {
      return {
        nodeId,
        dimensions: {
          controlPlaneRecoveryEligible: true,
          repairEligible: true,
          serveEligible: true,
        },
      };
    },
    getPriorityRecoveryPlanningSnapshotBestEffort() {
      return planningSnapshot;
    },
  });
}

export function registerRebalanceCoordinatorStoppingReconcileTests() {

test('RebalanceCoordinator reconciles REPLACE STOPPING when source ' +
  'replica is already removed and completion outcome is missing',
async (t) => {
  const deliveries = [];
  const messageRouter = {
    async deliver(target, payload) {
      deliveries.push({target, payload});
      return {
        acknowledged: true,
        status: 'initiated',
      };
    },
  };
  const coordinator = createTestCoordinator({
    nodeId: 'seed-node',
    enableTimeouts: false,
    messageRouter,
    storageAdmissionService: {
      async checkReplace() {
        return {
          allowed: true,
          decision: 'allow',
          decisionType: 'admitted',
        };
      },
    },
    storageAccountingService: {
      estimateReplicaBytes() {
        return 0;
      },
    },
    cacheData: {
      services: [
        {
          service_id: 'mg-1-r1',
          replica_id: 'mg-1-r1',
          service_type: 'message_group',
          group_id: 'mg-1',
          node_id: 'seed-node',
          status: 'active',
          address: 'seed-node/message-group/mg-1-r1',
        },
        {
          service_id: 'mg-1-r2',
          replica_id: 'mg-1-r2',
          service_type: 'message_group',
          group_id: 'mg-1',
          node_id: 'node-2',
          status: 'active',
          address: 'node-2/message-group/mg-1-r2',
        },
      ],
    },
  });

  try {
    const operation = await coordinator.createOperation({
      type: OperationType.REPLACE,
      partitionId: 'mg-1',
      entityType: 'message_group',
      entityId: 'mg-1',
      nodeId: 'node-3',
      sourceNodeId: 'seed-node',
      replicaId: 'mg-1-r1',
    });

    await coordinator.executeOperation(operation);
    await coordinator.updateStep(operation, WORKFLOW_STEP.ACTIVE);
    await coordinator.executeOperation(operation);

    t.equal(
      operation.workflowStep,
      WORKFLOW_STEP.STOPPING,
      'remove dispatch should place REPLACE in STOPPING',
    );

    coordinator.repository.getActualReplicaObservation = async (replicaId) => {
      if (replicaId === 'mg-1-r1') {
        return {
          state: STOPPING_REPLICA_OBSERVATION_STATE.ABSENT,
          source: 'authoritative',
        };
      }
      return {
        state: STOPPING_REPLICA_OBSERVATION_STATE.OBSERVED,
        source: 'authoritative',
        lifecycleStatus: ReplicaStatus.ACTIVE,
      };
    };

    coordinator.workflowOwner.incompleteOperationQueryEmptyBackoffMs = 0;
    await coordinator.checkTimeouts();
    const persistedOperation =
      await coordinator.getOperation(operation.operationId);

    t.equal(
      deliveries.length,
      2,
      'REPLACE should dispatch create and remove once',
    );
    t.equal(
      persistedOperation?.workflowStep,
      WORKFLOW_STEP.REMOVED,
      'timeout reconciliation should complete STOPPING when source replica is already removed',
    );
  } finally {
    await coordinator.shutdown();
  }
});

test('RebalanceCoordinator completes ACTIVE REPLACE when source removal is already visible',
  async (t) => {
    const deliveries = [];
    const messageRouter = {
      async deliver(target, payload) {
        deliveries.push({target, payload});
        return {
          acknowledged: true,
          status: 'initiated',
        };
      },
    };
    const coordinator = createTestCoordinator({
      nodeId: 'seed-node',
      enableTimeouts: false,
      messageRouter,
      storageAdmissionService: {
        async checkReplace() {
          return {
            allowed: true,
            decision: 'allow',
            decisionType: 'admitted',
          };
        },
      },
      storageAccountingService: {
        estimateReplicaBytes() {
          return 0;
        },
      },
      cacheData: {
        services: [
          {
            service_id: 'mg-1-r1',
            replica_id: 'mg-1-r1',
            service_type: 'message_group',
            group_id: 'mg-1',
            node_id: 'seed-node',
            status: 'active',
            address: 'seed-node/message-group/mg-1-r1',
          },
          {
            service_id: 'mg-1-r2',
            replica_id: 'mg-1-r2',
            service_type: 'message_group',
            group_id: 'mg-1',
            node_id: 'node-2',
            status: 'active',
            address: 'node-2/message-group/mg-1-r2',
          },
        ],
      },
    });

    try {
      const operation = await coordinator.createOperation({
        type: OperationType.REPLACE,
        partitionId: 'mg-1',
        entityType: 'message_group',
        entityId: 'mg-1',
        nodeId: 'node-3',
        sourceNodeId: 'seed-node',
        replicaId: 'mg-1-r1',
      });

      await coordinator.executeOperation(operation);
      await coordinator.updateStep(operation, WORKFLOW_STEP.ACTIVE);
      coordinator.systemTableCache.delete(SYSTEM_TABLE_NAME.SERVICES, 'mg-1-r1');

      coordinator.repository.getActualReplicaObservation = async (replicaId) => {
        if (replicaId === 'mg-1-r1') {
          return {
            state: STOPPING_REPLICA_OBSERVATION_STATE.ABSENT,
            source: 'authoritative',
          };
        }
        return {
          state: STOPPING_REPLICA_OBSERVATION_STATE.OBSERVED,
          source: 'authoritative',
          lifecycleStatus: ReplicaStatus.ACTIVE,
        };
      };

      const reconciled =
        await coordinator.workflowOwner.reconcileOperationProgress(operation);
      const persistedOperation =
        await coordinator.getOperation(operation.operationId);

      t.equal(
        reconciled,
        true,
        'ACTIVE replace reconciliation should consume already-visible source removal',
      );
      t.equal(
        deliveries.length,
        1,
        'ACTIVE replace reconciliation should not redispatch source removal after source absence is already visible',
      );
      t.equal(
        persistedOperation?.workflowStep,
        WORKFLOW_STEP.REMOVED,
        'ACTIVE replace reconciliation should complete once the source replica is absent',
      );
    } finally {
      await coordinator.shutdown();
    }
  });

test('RebalanceCoordinator completes non-ADD target REMOVED status during ' +
  'reconciliation', async (t) => {
  const TEST_PARTITION_ID = 'mg-2';
  const TEST_TARGET_REPLICA_ID = TEST_PARTITION_ID + '-r2';
  const TEST_OPERATION_ID = 'reconcile-removal-completes-replace';
  const TEST_NOW_MS = Date.now();
  const coordinator = createTestCoordinator({
    nodeId: 'seed-node',
    enableTimeouts: false,
    cacheData: {
      replicaOperations: [
        {
          operation_id: TEST_OPERATION_ID,
          type: OperationType.REPLACE,
          partition_id: TEST_PARTITION_ID,
          replica_id: TEST_TARGET_REPLICA_ID,
          source_node_id: 'seed-node',
          target_node_id: 'node-target',
          status: ReplicaStatus.CREATING,
          workflow_step: WORKFLOW_STEP.CREATING,
          created_at: TEST_NOW_MS,
          updated_at: TEST_NOW_MS,
          completed_at: PRIORITY_DRAIN_TEST_NO_COMPLETED_AT,
          error_message: PRIORITY_DRAIN_TEST_NO_ERROR_MESSAGE,
          entity_type: PRIORITY_DRAIN_TEST_ENTITY_TYPE,
          entity_id: TEST_PARTITION_ID,
          steps_history: JSON.stringify([
            {
              step: WORKFLOW_STEP.PENDING,
              timestamp: TEST_NOW_MS,
            },
            {
              step: WORKFLOW_STEP.CREATING,
              timestamp: TEST_NOW_MS,
              previousStep: WORKFLOW_STEP.PENDING,
            },
          ]),
        },
      ],
    },
  });

  try {
    coordinator.repository.getActualReplicaStatus = async () => ReplicaStatus.REMOVED;

    const operation = await coordinator.getOperation(TEST_OPERATION_ID);
    const reconciled =
      await coordinator.workflowOwner.reconcileOperationProgress(operation);
    const persistedOperation =
      await coordinator.getOperation(TEST_OPERATION_ID);

    t.equal(
      reconciled,
      true,
      'reconcileOperationProgress should consume authoritative REMOVED state for REPLACE',
    );
    t.equal(
      persistedOperation?.workflowStep,
      WORKFLOW_STEP.REMOVED,
      'reconcileOperationProgress should complete non-ADD operations on REMOVED status',
    );
    t.equal(
      persistedOperation?.status,
      ReplicaStatus.REMOVED,
      'reconciled REMOVED status should be terminal for non-ADD operations',
    );
  } finally {
    await coordinator.shutdown();
  }
});

test('RebalanceCoordinator fails ADD target REMOVED status during ' +
  'reconciliation', async (t) => {
  const TEST_PARTITION_ID = 'mg-3';
  const TEST_TARGET_REPLICA_ID = TEST_PARTITION_ID + '-r2';
  const TEST_OPERATION_ID = 'reconcile-removed-add-fails';
  const TEST_NOW_MS = Date.now();
  const coordinator = createTestCoordinator({
    nodeId: 'seed-node',
    enableTimeouts: false,
    cacheData: {
      replicaOperations: [
        {
          operation_id: TEST_OPERATION_ID,
          type: OperationType.ADD,
          partition_id: TEST_PARTITION_ID,
          replica_id: TEST_TARGET_REPLICA_ID,
          source_node_id: 'seed-node',
          target_node_id: 'node-target',
          status: ReplicaStatus.CREATING,
          workflow_step: WORKFLOW_STEP.CREATING,
          created_at: TEST_NOW_MS,
          updated_at: TEST_NOW_MS,
          completed_at: PRIORITY_DRAIN_TEST_NO_COMPLETED_AT,
          error_message: PRIORITY_DRAIN_TEST_NO_ERROR_MESSAGE,
          entity_type: PRIORITY_DRAIN_TEST_ENTITY_TYPE,
          entity_id: TEST_PARTITION_ID,
          steps_history: JSON.stringify([
            {
              step: WORKFLOW_STEP.PENDING,
              timestamp: TEST_NOW_MS,
            },
            {
              step: WORKFLOW_STEP.CREATING,
              timestamp: TEST_NOW_MS,
              previousStep: WORKFLOW_STEP.PENDING,
            },
          ]),
        },
      ],
    },
  });

  try {
    coordinator.repository.getActualReplicaStatus = async () => ReplicaStatus.REMOVED;

    const operation = await coordinator.getOperation(TEST_OPERATION_ID);
    const reconciled =
      await coordinator.workflowOwner.reconcileOperationProgress(operation);
    const persistedOperation =
      await coordinator.getOperation(TEST_OPERATION_ID);

    t.equal(
      reconciled,
      true,
      'reconcileOperationProgress should fail ADD on authoritative REMOVED status',
    );
    t.equal(
      persistedOperation?.workflowStep,
      WORKFLOW_STEP.FAILED,
      'reconcileOperationProgress should persist ADD failure as workflow FAILED',
    );
    t.equal(
      persistedOperation?.status,
      ReplicaStatus.FAILED,
      'failed operation status should be FAILED for ADD target REMOVED',
    );
    t.match(
      persistedOperation?.errorMessage,
      OPERATION_WORKFLOW_OWNER_SHARED
        .OPERATION_WORKFLOW_OWNER_LITERAL
        .REPLICA_FAILED_DURING_OPERATION_RECONCILIATION,
      'failure reason should route through operation reconciliation',
    );
  } finally {
    await coordinator.shutdown();
  }
});

test('RebalanceCoordinator keeps REPLACE STOPPING in progress when replayed ' +
  'remove completes while source replica remains active', async (t) => {
  const deliveries = [];
  const messageRouter = {
    async deliver(target, payload) {
      deliveries.push({target, payload});
      if (payload.type === ReplicaOperationMessageType.CREATE_REPLICA) {
        return {
          acknowledged: true,
          status: ReplicaOperationResponseStatus.INITIATED,
        };
      }
      if (payload.type === ReplicaOperationMessageType.REMOVE_REPLICA) {
        const removeDispatchCount = deliveries.filter((entry) =>
          entry.payload.type ===
            ReplicaOperationMessageType.REMOVE_REPLICA,
        ).length;
        return {
          acknowledged: true,
          status: removeDispatchCount >= 2 ?
            ReplicaOperationResponseStatus.COMPLETED :
            ReplicaOperationResponseStatus.INITIATED,
        };
      }
      return {
        acknowledged: true,
        status: ReplicaOperationResponseStatus.IN_PROGRESS,
      };
    },
  };
  const coordinator = createTestCoordinator({
    nodeId: 'seed-node',
    enableTimeouts: false,
    messageRouter,
    storageAdmissionService: {
      async checkReplace() {
        return {
          allowed: true,
          decision: 'allow',
          decisionType: 'admitted',
        };
      },
    },
    storageAccountingService: {
      estimateReplicaBytes() {
        return 0;
      },
    },
    cacheData: {
      services: [
        {
          service_id: 'mg-1-r1',
          replica_id: 'mg-1-r1',
          service_type: 'message_group',
          group_id: 'mg-1',
          node_id: 'seed-node',
          status: 'active',
          address: 'seed-node/message-group/mg-1-r1',
        },
        {
          service_id: 'mg-1-r2',
          replica_id: 'mg-1-r2',
          service_type: 'message_group',
          group_id: 'mg-1',
          node_id: 'node-2',
          status: 'active',
          address: 'node-2/message-group/mg-1-r2',
        },
      ],
    },
  });

  try {
    const operation = await coordinator.createOperation({
      type: OperationType.REPLACE,
      partitionId: 'mg-1',
      entityType: 'message_group',
      entityId: 'mg-1',
      nodeId: 'node-3',
      sourceNodeId: 'seed-node',
      replicaId: 'mg-1-r1',
    });

    await coordinator.executeOperation(operation);
    await coordinator.updateStep(operation, WORKFLOW_STEP.ACTIVE);
    await coordinator.executeOperation(operation);

    t.equal(
      operation.workflowStep,
      WORKFLOW_STEP.STOPPING,
      'remove dispatch should place REPLACE in STOPPING',
    );

    coordinator.repository.getActualReplicaObservation = async (replicaId) => {
      if (replicaId === 'mg-1-r1') {
        return {
          state: STOPPING_REPLICA_OBSERVATION_STATE.OBSERVED,
          source: 'authoritative',
          lifecycleStatus: ReplicaStatus.ACTIVE,
        };
      }
      return {
        state: STOPPING_REPLICA_OBSERVATION_STATE.OBSERVED,
        source: 'authoritative',
        lifecycleStatus: ReplicaStatus.ACTIVE,
      };
    };

    coordinator.workflowOwner.incompleteOperationQueryEmptyBackoffMs = 0;
    await coordinator.checkTimeouts();

    const persistedOperation =
      await coordinator.getOperation(operation.operationId);

    t.equal(
      deliveries.length,
      3,
      'coordinator should replay remove dispatch when STOPPING remains active',
    );
    t.equal(
      persistedOperation?.workflowStep,
      WORKFLOW_STEP.STOPPING,
      'STOPPING reconciliation should wait for source visibility after completed replay',
    );
  } finally {
    await coordinator.shutdown();
  }
});

test('RebalanceCoordinator retires stale priority REPLACE SENDING when ' +
  'priority recovery placement is converged', async (t) => {
  const TEST_PARTITION_ID = 'replica_operations-p1';
  const TEST_SOURCE_REPLICA_ID = TEST_PARTITION_ID + '-r2';
  const TEST_TARGET_REPLICA_ID = TEST_PARTITION_ID + '-r5';
  const TEST_OPERATION_ID = 'priority-drain-sending-converged';
  const TEST_NOW_MS = Date.now();
  const deliveries = [];
  const coordinator = createTestCoordinator({
    nodeId: PRIORITY_DRAIN_TEST_TARGET_NODE_ID,
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
    controlPlaneReadinessService:
      buildPriorityDrainReadinessService(TEST_PARTITION_ID),
    cacheData: {
      replicaOperations: [
        {
          operation_id: TEST_OPERATION_ID,
          type: OperationType.REPLACE,
          partition_id: TEST_PARTITION_ID,
          replica_id: TEST_TARGET_REPLICA_ID,
          source_node_id: PRIORITY_DRAIN_TEST_SOURCE_NODE_ID,
          target_node_id: PRIORITY_DRAIN_TEST_TARGET_NODE_ID,
          status: ReplicaStatus.PENDING,
          workflow_step: WORKFLOW_STEP.SENDING,
          created_at: TEST_NOW_MS,
          updated_at: TEST_NOW_MS,
          completed_at: PRIORITY_DRAIN_TEST_NO_COMPLETED_AT,
          error_message: PRIORITY_DRAIN_TEST_NO_ERROR_MESSAGE,
          entity_type: PRIORITY_DRAIN_TEST_ENTITY_TYPE,
          entity_id: TEST_PARTITION_ID,
          steps_history: JSON.stringify([
            {
              step: WORKFLOW_STEP.PENDING,
              timestamp: TEST_NOW_MS,
              sourceReplicaId: TEST_SOURCE_REPLICA_ID,
            },
            {
              step: WORKFLOW_STEP.SENDING,
              timestamp: TEST_NOW_MS,
              previousStep: WORKFLOW_STEP.PENDING,
            },
          ]),
        },
      ],
    },
  });

  try {
    coordinator.repository.getActualReplicaObservation = async () => ({
      state: STOPPING_REPLICA_OBSERVATION_STATE.ABSENT,
      source: PRIORITY_DRAIN_TEST_AUTHORITATIVE_SOURCE,
    });

    const operation = await coordinator.getOperation(TEST_OPERATION_ID);
    const progressed =
      await coordinator.workflowOwner.reconcileOperationProgress(operation);
    const persistedOperation =
      await coordinator.getOperation(TEST_OPERATION_ID);

    t.equal(
      progressed,
      true,
      'converged priority recovery evidence should retire the stale accepted row',
    );
    t.equal(
      deliveries.length,
      0,
      'operation drain should not redispatch a placement-converged stale row',
    );
    t.equal(
      persistedOperation?.workflowStep,
      WORKFLOW_STEP.REMOVED,
      'stale SENDING priority replacement should become terminal',
    );
    t.equal(
      persistedOperation?.status,
      ReplicaStatus.REMOVED,
      'stale SENDING priority replacement should persist removed status',
    );
  } finally {
    await coordinator.shutdown();
  }
});

test('RebalanceCoordinator retires remote-owned stale priority REPLACE ' +
  'SENDING when priority recovery placement is converged', async (t) => {
  const TEST_PARTITION_ID = 'replica_operations-p1';
  const TEST_SOURCE_REPLICA_ID = TEST_PARTITION_ID + '-r2';
  const TEST_TARGET_REPLICA_ID = TEST_PARTITION_ID + '-r5';
  const TEST_OPERATION_ID = 'priority-drain-remote-sending-converged';
  const TEST_NOW_MS = Date.now();
  const deliveries = [];
  const coordinator = createTestCoordinator({
    nodeId: PRIORITY_DRAIN_TEST_SOURCE_NODE_ID,
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
    controlPlaneReadinessService:
      buildPriorityDrainReadinessService(TEST_PARTITION_ID),
    cacheData: {
      replicaOperations: [
        {
          operation_id: TEST_OPERATION_ID,
          type: OperationType.REPLACE,
          partition_id: TEST_PARTITION_ID,
          replica_id: TEST_TARGET_REPLICA_ID,
          source_node_id: PRIORITY_DRAIN_TEST_SOURCE_NODE_ID,
          target_node_id: PRIORITY_DRAIN_TEST_TARGET_NODE_ID,
          status: ReplicaStatus.PENDING,
          workflow_step: WORKFLOW_STEP.SENDING,
          created_at: TEST_NOW_MS,
          updated_at: TEST_NOW_MS,
          completed_at: PRIORITY_DRAIN_TEST_NO_COMPLETED_AT,
          error_message: PRIORITY_DRAIN_TEST_NO_ERROR_MESSAGE,
          entity_type: PRIORITY_DRAIN_TEST_ENTITY_TYPE,
          entity_id: TEST_PARTITION_ID,
          steps_history: JSON.stringify([
            {
              step: WORKFLOW_STEP.PENDING,
              timestamp: TEST_NOW_MS,
              sourceReplicaId: TEST_SOURCE_REPLICA_ID,
            },
            {
              step: WORKFLOW_STEP.SENDING,
              timestamp: TEST_NOW_MS,
              previousStep: WORKFLOW_STEP.PENDING,
            },
          ]),
        },
      ],
    },
  });

  try {
    coordinator.repository.getActualReplicaObservation = async () => ({
      state: STOPPING_REPLICA_OBSERVATION_STATE.ABSENT,
      source: 'authoritative',
    });

    coordinator.workflowOwner.incompleteOperationQueryEmptyBackoffMs = 0;
    await coordinator.checkTimeouts();
    const persistedOperation =
      await coordinator.getOperation(TEST_OPERATION_ID);

    t.equal(
      deliveries.length,
      0,
      'remote converged priority recovery drain should not dispatch work',
    );
    t.equal(
      persistedOperation?.workflowStep,
      WORKFLOW_STEP.REMOVED,
      'remote-owned stale SENDING priority replacement should become terminal',
    );
    t.equal(
      persistedOperation?.status,
      ReplicaStatus.REMOVED,
      'remote-owned stale SENDING priority replacement should persist removed status',
    );
  } finally {
    await coordinator.shutdown();
  }
});

test('RebalanceCoordinator retires remote-owned stale priority REPLACE ' +
  'PENDING when target never materialized and spread is satisfied in flight',
async (t) => {
  const TEST_PARTITION_ID = 'replica_operations-p1';
  const TEST_SOURCE_REPLICA_ID = TEST_PARTITION_ID + '-r2';
  const TEST_TARGET_REPLICA_ID = TEST_PARTITION_ID + '-r7';
  const TEST_OPERATION_ID = 'priority-drain-remote-pending-target-absent';
  const TEST_NOW_MS = Date.now();
  const deliveries = [];
  const coordinator = createTestCoordinator({
    nodeId: PRIORITY_DRAIN_TEST_SOURCE_NODE_ID,
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
    controlPlaneReadinessService:
      buildPriorityDrainReadinessService(TEST_PARTITION_ID),
    cacheData: {
      services: [
        {
          service_id: TEST_SOURCE_REPLICA_ID,
          replica_id: TEST_SOURCE_REPLICA_ID,
          service_type: PRIORITY_DRAIN_TEST_ENTITY_TYPE,
          partition_id: TEST_PARTITION_ID,
          node_id: PRIORITY_DRAIN_TEST_SOURCE_NODE_ID,
          status: ReplicaStatus.ACTIVE,
          address: PRIORITY_DRAIN_TEST_SOURCE_NODE_ID + '/partition/' +
            TEST_SOURCE_REPLICA_ID,
        },
      ],
      replicaOperations: [
        {
          operation_id: TEST_OPERATION_ID,
          type: OperationType.REPLACE,
          partition_id: TEST_PARTITION_ID,
          replica_id: TEST_TARGET_REPLICA_ID,
          source_node_id: PRIORITY_DRAIN_TEST_SOURCE_NODE_ID,
          target_node_id: PRIORITY_DRAIN_TEST_TARGET_NODE_ID,
          status: ReplicaStatus.PENDING,
          workflow_step: WORKFLOW_STEP.PENDING,
          created_at: TEST_NOW_MS,
          updated_at: TEST_NOW_MS,
          completed_at: PRIORITY_DRAIN_TEST_NO_COMPLETED_AT,
          error_message: PRIORITY_DRAIN_TEST_NO_ERROR_MESSAGE,
          entity_type: PRIORITY_DRAIN_TEST_ENTITY_TYPE,
          entity_id: TEST_PARTITION_ID,
          steps_history: JSON.stringify([
            {
              step: WORKFLOW_STEP.PENDING,
              timestamp: TEST_NOW_MS,
              sourceReplicaId: TEST_SOURCE_REPLICA_ID,
            },
          ]),
        },
      ],
    },
  });

  try {
    coordinator.workflowOwner.buildPriorityRecoveryCompletionForOperation =
      () => Object.freeze({
        state:
          PRIORITY_RECOVERY_COMPLETION_STATE.SPREAD_SATISFIED_IN_FLIGHT,
        blocked: false,
      });
    coordinator.repository.getActualReplicaObservation = async () => ({
      state: STOPPING_REPLICA_OBSERVATION_STATE.OBSERVED,
      source: PRIORITY_DRAIN_TEST_AUTHORITATIVE_SOURCE,
      lifecycleStatus: ReplicaStatus.ACTIVE,
    });

    const operation = await coordinator.getOperation(TEST_OPERATION_ID);
    const reconciled =
      await coordinator.workflowOwner.reconcilePriorityRecoveryOperationDrain(
        operation,
      );
    const persistedOperation =
      await coordinator.getOperation(TEST_OPERATION_ID);

    t.equal(
      reconciled,
      true,
      'target-absent spread-satisfied priority replacement should drain',
    );
    t.equal(
      deliveries.length,
      0,
      'target-absent priority drain should not remove the source replica',
    );
    t.equal(
      persistedOperation?.workflowStep,
      WORKFLOW_STEP.REMOVED,
      'target-absent priority replacement should become terminal',
    );
    t.equal(
      persistedOperation?.status,
      ReplicaStatus.REMOVED,
      'target-absent priority replacement should persist removed status',
    );
  } finally {
    await coordinator.shutdown();
  }
});

test('RebalanceCoordinator retires remote-owned stale priority ADD ' +
  'SENDING when priority recovery placement is converged', async (t) => {
  const TEST_PARTITION_ID = 'sql_transactions-p1';
  const TEST_TARGET_REPLICA_ID = TEST_PARTITION_ID + '-r6';
  const TEST_OPERATION_ID = 'priority-drain-remote-add-sending-converged';
  const TEST_TARGET_REPLICA_ADDRESS =
    PRIORITY_DRAIN_TEST_TARGET_NODE_ID + '/partition/' +
    TEST_TARGET_REPLICA_ID;
  const TEST_NOW_MS = Date.now();
  const deliveries = [];
  const coordinator = createTestCoordinator({
    nodeId: PRIORITY_DRAIN_TEST_TARGET_NODE_ID,
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
    controlPlaneReadinessService:
      buildPriorityDrainReadinessService(TEST_PARTITION_ID),
    cacheData: {
      services: [
        {
          service_id: TEST_TARGET_REPLICA_ID,
          replica_id: TEST_TARGET_REPLICA_ID,
          service_type: PRIORITY_DRAIN_TEST_ENTITY_TYPE,
          node_id: PRIORITY_DRAIN_TEST_TARGET_NODE_ID,
          partition_id: TEST_PARTITION_ID,
          status: ReplicaStatus.ACTIVE,
          raft_role: RAFT_ROLE.FOLLOWER,
          address: TEST_TARGET_REPLICA_ADDRESS,
        },
      ],
      replicaOperations: [
        {
          operation_id: TEST_OPERATION_ID,
          type: OperationType.ADD,
          partition_id: TEST_PARTITION_ID,
          replica_id: TEST_TARGET_REPLICA_ID,
          source_node_id: PRIORITY_DRAIN_TEST_SOURCE_NODE_ID,
          target_node_id: PRIORITY_DRAIN_TEST_TARGET_NODE_ID,
          status: ReplicaStatus.PENDING,
          workflow_step: WORKFLOW_STEP.SENDING,
          created_at: TEST_NOW_MS,
          updated_at: TEST_NOW_MS,
          completed_at: PRIORITY_DRAIN_TEST_NO_COMPLETED_AT,
          error_message: PRIORITY_DRAIN_TEST_NO_ERROR_MESSAGE,
          entity_type: PRIORITY_DRAIN_TEST_ENTITY_TYPE,
          entity_id: TEST_PARTITION_ID,
          steps_history: JSON.stringify([
            {
              step: WORKFLOW_STEP.PENDING,
              timestamp: TEST_NOW_MS,
            },
            {
              step: WORKFLOW_STEP.SENDING,
              timestamp: TEST_NOW_MS,
              previousStep: WORKFLOW_STEP.PENDING,
            },
          ]),
        },
      ],
    },
  });

  try {
    const operation = await coordinator.getOperation(TEST_OPERATION_ID);
    const progressed =
      await coordinator.workflowOwner.reconcilePriorityRecoveryOperationDrain(
        operation,
      );
    const persistedOperation =
      await coordinator.getOperation(TEST_OPERATION_ID);

    t.equal(
      progressed,
      true,
      'remote converged priority ADD drain should reconcile',
    );
    t.equal(
      deliveries.length,
      0,
      'remote converged priority ADD drain should not dispatch work',
    );
    t.equal(
      persistedOperation?.workflowStep,
      WORKFLOW_STEP.ACTIVE,
      'remote-owned stale SENDING priority ADD should become terminal active',
    );
    t.equal(
      persistedOperation?.status,
      ReplicaStatus.ACTIVE,
      'remote-owned stale SENDING priority ADD should persist active status',
    );
  } finally {
    await coordinator.shutdown();
  }
});

test('RebalanceCoordinator fails remote-owned stale priority REPLACE ' +
  'SENDING when the target leaves the recovery cohort', async (t) => {
  const TEST_PARTITION_ID = 'sql_write_operations-p1';
  const TEST_SOURCE_REPLICA_ID = TEST_PARTITION_ID + '-r2';
  const TEST_TARGET_REPLICA_ID = TEST_PARTITION_ID + '-r5';
  const TEST_OPERATION_ID = 'priority-drain-remote-superseded-sending';
  const TEST_NOW_MS = Date.now();
  const deliveries = [];
  const coordinator = createTestCoordinator({
    nodeId: PRIORITY_DRAIN_TEST_SOURCE_NODE_ID,
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
    controlPlaneReadinessService:
      buildPriorityDrainSupersededReadinessService(
        TEST_PARTITION_ID,
        TEST_OPERATION_ID,
      ),
    cacheData: {
      replicaOperations: [
        {
          operation_id: TEST_OPERATION_ID,
          type: OperationType.REPLACE,
          partition_id: TEST_PARTITION_ID,
          replica_id: TEST_TARGET_REPLICA_ID,
          source_node_id: PRIORITY_DRAIN_TEST_SOURCE_NODE_ID,
          target_node_id: PRIORITY_DRAIN_TEST_STALE_TARGET_NODE_ID,
          status: ReplicaStatus.PENDING,
          workflow_step: WORKFLOW_STEP.SENDING,
          created_at: TEST_NOW_MS,
          updated_at: TEST_NOW_MS,
          completed_at: PRIORITY_DRAIN_TEST_NO_COMPLETED_AT,
          error_message: PRIORITY_DRAIN_TEST_NO_ERROR_MESSAGE,
          entity_type: PRIORITY_DRAIN_TEST_ENTITY_TYPE,
          entity_id: TEST_PARTITION_ID,
          steps_history: JSON.stringify([
            {
              step: WORKFLOW_STEP.PENDING,
              timestamp: TEST_NOW_MS,
              sourceReplicaId: TEST_SOURCE_REPLICA_ID,
            },
            {
              step: WORKFLOW_STEP.SENDING,
              timestamp: TEST_NOW_MS,
              previousStep: WORKFLOW_STEP.PENDING,
            },
          ]),
        },
      ],
    },
  });

  try {
    const operation = await coordinator.getOperation(TEST_OPERATION_ID);
    const progressed =
      await coordinator.workflowOwner.reconcileOperationProgress(operation);
    const persistedOperation =
      await coordinator.getOperation(TEST_OPERATION_ID);

    t.equal(
      progressed,
      true,
      'remote superseded priority recovery row should reconcile',
    );
    t.equal(
      deliveries.length,
      0,
      'remote superseded target should not dispatch replica work',
    );
    t.equal(
      persistedOperation?.workflowStep,
      WORKFLOW_STEP.FAILED,
      'remote-owned superseded SENDING priority replacement should fail',
    );
    t.equal(
      persistedOperation?.status,
      ReplicaStatus.FAILED,
      'remote-owned superseded SENDING priority replacement should persist failed status',
    );
    t.match(
      String(persistedOperation?.errorMessage || ''),
      /eligible cohort/i,
      'failure should explain the eligible recovery cohort mismatch',
    );
  } finally {
    await coordinator.shutdown();
  }
});

test('RebalanceCoordinator superseded-target gate preserves local ' +
  'priority REPLACE progress when the out-of-cohort target is already ' +
  'creating', async (t) => {
  const TEST_PARTITION_ID = 'sql_transactions-p1';
  const TEST_SOURCE_REPLICA_ID = TEST_PARTITION_ID + '-r2';
  const TEST_TARGET_REPLICA_ID = TEST_PARTITION_ID + '-r4';
  const TEST_OPERATION_ID = 'priority-drain-local-materialized-creating';
  const TEST_TARGET_ADDRESS =
    PRIORITY_DRAIN_TEST_STALE_TARGET_NODE_ID + '/partition/' +
    TEST_TARGET_REPLICA_ID;
  const TEST_NOW_MS = Date.now();
  const coordinator = createTestCoordinator({
    nodeId: PRIORITY_DRAIN_TEST_STALE_TARGET_NODE_ID,
    enableTimeouts: false,
    controlPlaneReadinessService:
      buildPriorityDrainSupersededReadinessService(
        TEST_PARTITION_ID,
        TEST_OPERATION_ID,
      ),
    cacheData: {
      services: [
        {
          service_id: TEST_TARGET_REPLICA_ID,
          replica_id: TEST_TARGET_REPLICA_ID,
          service_type: PRIORITY_DRAIN_TEST_ENTITY_TYPE,
          partition_id: TEST_PARTITION_ID,
          node_id: PRIORITY_DRAIN_TEST_STALE_TARGET_NODE_ID,
          status: ReplicaStatus.CREATING,
          raft_role: RAFT_ROLE.FOLLOWER,
          address: TEST_TARGET_ADDRESS,
        },
      ],
      replicaOperations: [
        {
          operation_id: TEST_OPERATION_ID,
          type: OperationType.REPLACE,
          partition_id: TEST_PARTITION_ID,
          replica_id: TEST_TARGET_REPLICA_ID,
          source_node_id: PRIORITY_DRAIN_TEST_SOURCE_NODE_ID,
          target_node_id: PRIORITY_DRAIN_TEST_STALE_TARGET_NODE_ID,
          status: ReplicaStatus.PENDING,
          workflow_step: WORKFLOW_STEP.SENDING,
          created_at: TEST_NOW_MS,
          updated_at: TEST_NOW_MS,
          completed_at: PRIORITY_DRAIN_TEST_NO_COMPLETED_AT,
          error_message: PRIORITY_DRAIN_TEST_NO_ERROR_MESSAGE,
          entity_type: PRIORITY_DRAIN_TEST_ENTITY_TYPE,
          entity_id: TEST_PARTITION_ID,
          steps_history: JSON.stringify([
            {
              step: WORKFLOW_STEP.PENDING,
              timestamp: TEST_NOW_MS,
              sourceReplicaId: TEST_SOURCE_REPLICA_ID,
            },
            {
              step: WORKFLOW_STEP.SENDING,
              timestamp: TEST_NOW_MS,
              previousStep: WORKFLOW_STEP.PENDING,
            },
          ]),
        },
      ],
    },
  });

  try {
    const operation = await coordinator.getOperation(TEST_OPERATION_ID);
    const supersededTargetError =
      await coordinator.workflowOwner
        .getPriorityRecoverySupersededTargetError(operation);

    t.equal(
      supersededTargetError,
      null,
      'materialized local priority replacement targets should defer superseded eligible-cohort failure',
    );
  } finally {
    await coordinator.shutdown();
  }
});

test('RebalanceCoordinator preserves pre-sync priority REPLACE progress ' +
  'when an out-of-cohort target is already creating', async (t) => {
  const TEST_PARTITION_ID = 'sql_transactions-p1';
  const TEST_SOURCE_REPLICA_ID = TEST_PARTITION_ID + '-r2';
  const TEST_TARGET_REPLICA_ID = TEST_PARTITION_ID + '-r4';
  const TEST_OPERATION_ID = 'priority-drain-remote-materialized-creating';
  const TEST_NOW_MS = Date.now();
  const TEST_TARGET_ADDRESS =
    PRIORITY_DRAIN_TEST_STALE_TARGET_NODE_ID + '/partition/' +
    TEST_TARGET_REPLICA_ID;
  const deliveries = [];
  const coordinator = createTestCoordinator({
    nodeId: PRIORITY_DRAIN_TEST_SOURCE_NODE_ID,
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
    controlPlaneReadinessService:
      buildPriorityDrainSupersededReadinessService(
        TEST_PARTITION_ID,
        TEST_OPERATION_ID,
      ),
    cacheData: {
      services: [
        {
          service_id: TEST_TARGET_REPLICA_ID,
          replica_id: TEST_TARGET_REPLICA_ID,
          service_type: PRIORITY_DRAIN_TEST_ENTITY_TYPE,
          partition_id: TEST_PARTITION_ID,
          node_id: PRIORITY_DRAIN_TEST_STALE_TARGET_NODE_ID,
          status: ReplicaStatus.CREATING,
          raft_role: RAFT_ROLE.FOLLOWER,
          address: TEST_TARGET_ADDRESS,
        },
      ],
      replicaOperations: [
        {
          operation_id: TEST_OPERATION_ID,
          type: OperationType.REPLACE,
          partition_id: TEST_PARTITION_ID,
          replica_id: TEST_TARGET_REPLICA_ID,
          source_node_id: PRIORITY_DRAIN_TEST_SOURCE_NODE_ID,
          target_node_id: PRIORITY_DRAIN_TEST_STALE_TARGET_NODE_ID,
          status: ReplicaStatus.PENDING,
          workflow_step: WORKFLOW_STEP.SENDING,
          created_at: TEST_NOW_MS,
          updated_at: TEST_NOW_MS,
          completed_at: PRIORITY_DRAIN_TEST_NO_COMPLETED_AT,
          error_message: PRIORITY_DRAIN_TEST_NO_ERROR_MESSAGE,
          entity_type: PRIORITY_DRAIN_TEST_ENTITY_TYPE,
          entity_id: TEST_PARTITION_ID,
          steps_history: JSON.stringify([
            {
              step: WORKFLOW_STEP.PENDING,
              timestamp: TEST_NOW_MS,
              sourceReplicaId: TEST_SOURCE_REPLICA_ID,
            },
            {
              step: WORKFLOW_STEP.SENDING,
              timestamp: TEST_NOW_MS,
              previousStep: WORKFLOW_STEP.PENDING,
            },
          ]),
        },
      ],
    },
  });

  try {
    const operation = await coordinator.getOperation(TEST_OPERATION_ID);
    const progressed =
      await coordinator.workflowOwner.reconcileOperationProgress(operation);
    const persistedOperation =
      await coordinator.getOperation(TEST_OPERATION_ID);

    t.equal(
      progressed,
      false,
      'materialized superseded target should remain in pre-sync progress rather than fail terminally',
    );
    t.equal(
      deliveries.length,
      0,
      'materialized target progress should not redispatch replica work',
    );
    t.equal(
      persistedOperation?.workflowStep,
      WORKFLOW_STEP.SENDING,
      'materialized superseded target should preserve the in-flight pre-sync step',
    );
    t.equal(
      persistedOperation?.status,
      ReplicaStatus.PENDING,
      'materialized superseded target should preserve pending status while the target is still materialized',
    );
    t.equal(
      persistedOperation?.errorMessage,
      PRIORITY_DRAIN_TEST_NO_ERROR_MESSAGE,
      'materialized superseded target should not persist an eligible-cohort failure',
    );
  } finally {
    await coordinator.shutdown();
  }
});

test('RebalanceCoordinator dispatches source handoff instead of draining a ' +
  'priority REPLACE while the source replica is still active', async (t) => {
  const TEST_PARTITION_ID = 'control_plane_publications-p1';
  const TEST_SOURCE_REPLICA_ID = TEST_PARTITION_ID + '-r1';
  const TEST_TARGET_REPLICA_ID = TEST_PARTITION_ID + '-r4';
  const TEST_OPERATION_ID = 'priority-drain-source-active';
  const TEST_NOW_MS = Date.now();
  const TEST_SERVICE_TYPE = 'partition';
  const TEST_VOTER_RAFT_ROLE = 'follower';
  const TEST_SOURCE_ADDRESS =
    PRIORITY_DRAIN_TEST_SOURCE_NODE_ID + '/partition/' +
    TEST_SOURCE_REPLICA_ID;
  const TEST_TARGET_ADDRESS =
    PRIORITY_DRAIN_TEST_TARGET_NODE_ID + '/partition/' +
    TEST_TARGET_REPLICA_ID;
  const deliveries = [];
  const coordinator = createTestCoordinator({
    nodeId: PRIORITY_DRAIN_TEST_TARGET_NODE_ID,
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
    controlPlaneReadinessService:
      buildPriorityDrainReadinessService(TEST_PARTITION_ID),
    cacheData: {
      services: [
        {
          service_id: TEST_SOURCE_REPLICA_ID,
          replica_id: TEST_SOURCE_REPLICA_ID,
          service_type: TEST_SERVICE_TYPE,
          partition_id: TEST_PARTITION_ID,
          node_id: PRIORITY_DRAIN_TEST_SOURCE_NODE_ID,
          raft_role: TEST_VOTER_RAFT_ROLE,
          status: ReplicaStatus.ACTIVE,
          address: TEST_SOURCE_ADDRESS,
        },
        {
          service_id: TEST_TARGET_REPLICA_ID,
          replica_id: TEST_TARGET_REPLICA_ID,
          service_type: TEST_SERVICE_TYPE,
          partition_id: TEST_PARTITION_ID,
          node_id: PRIORITY_DRAIN_TEST_TARGET_NODE_ID,
          raft_role: TEST_VOTER_RAFT_ROLE,
          status: ReplicaStatus.ACTIVE,
          address: TEST_TARGET_ADDRESS,
        },
      ],
      replicaOperations: [
        {
          operation_id: TEST_OPERATION_ID,
          type: OperationType.REPLACE,
          partition_id: TEST_PARTITION_ID,
          replica_id: TEST_TARGET_REPLICA_ID,
          source_node_id: PRIORITY_DRAIN_TEST_SOURCE_NODE_ID,
          target_node_id: PRIORITY_DRAIN_TEST_TARGET_NODE_ID,
          status: ReplicaStatus.CREATING,
          workflow_step: WORKFLOW_STEP.CREATING,
          created_at: TEST_NOW_MS,
          updated_at: TEST_NOW_MS,
          completed_at: PRIORITY_DRAIN_TEST_NO_COMPLETED_AT,
          error_message: PRIORITY_DRAIN_TEST_NO_ERROR_MESSAGE,
          entity_type: PRIORITY_DRAIN_TEST_ENTITY_TYPE,
          entity_id: TEST_PARTITION_ID,
          steps_history: JSON.stringify([
            {
              step: WORKFLOW_STEP.PENDING,
              timestamp: TEST_NOW_MS,
              sourceReplicaId: TEST_SOURCE_REPLICA_ID,
            },
            {
              step: WORKFLOW_STEP.CREATING,
              timestamp: TEST_NOW_MS,
              previousStep: WORKFLOW_STEP.SENDING,
            },
          ]),
        },
      ],
    },
  });

  try {
    coordinator.repository.getActualReplicaObservation = async (replicaId) => {
      if (
        replicaId === TEST_SOURCE_REPLICA_ID ||
        replicaId === TEST_TARGET_REPLICA_ID
      ) {
        return {
          state: STOPPING_REPLICA_OBSERVATION_STATE.OBSERVED,
          source: 'authoritative',
          lifecycleStatus: ReplicaStatus.ACTIVE,
        };
      }
      return {
        state: STOPPING_REPLICA_OBSERVATION_STATE.UNAVAILABLE,
        source: STOPPING_REPLICA_OBSERVATION_STATE.UNAVAILABLE,
      };
    };

    const operation = await coordinator.getOperation(TEST_OPERATION_ID);
    const progressed =
      await coordinator.workflowOwner.reconcileOperationProgress(operation);
    const persistedOperation =
      await coordinator.getOperation(TEST_OPERATION_ID);

    t.equal(
      progressed,
      true,
      'source-present priority recovery drain should continue lifecycle work',
    );
    t.equal(
      deliveries.length,
      1,
      'source-present priority recovery drain should dispatch source handoff',
    );
    t.equal(
      deliveries[0]?.payload?.type,
      ReplicaOperationMessageType.STEP_DOWN_REPLICA,
      'source-present priority recovery drain should honor source handoff safety',
    );
    t.equal(
      persistedOperation?.workflowStep,
      WORKFLOW_STEP.ACTIVE,
      'source-present priority replacement should remain active during handoff',
    );
    t.equal(
      persistedOperation?.status,
      ReplicaStatus.ACTIVE,
      'source-present priority replacement should keep active status during handoff',
    );
    t.equal(
      coordinator.workflowOwner.safetyDeferredRetryTimerByOperationId.size,
      1,
      'source-present priority replacement should arm a safety retry',
    );
  } finally {
    await coordinator.shutdown();
  }
});

test('RebalanceCoordinator uses observed active target cache state to ' +
  'advance a priority REPLACE SENDING source removal', async (t) => {
  const TEST_PARTITION_ID = 'sql_transactions-p1';
  const TEST_SOURCE_REPLICA_ID = TEST_PARTITION_ID + '-r2';
  const TEST_TARGET_REPLICA_ID = TEST_PARTITION_ID + '-r6';
  const TEST_OPERATION_ID = 'priority-drain-sending-target-cache-active';
  const TEST_NOW_MS = Date.now();
  const TEST_SERVICE_TYPE = 'partition';
  const TEST_VOTER_RAFT_ROLE = 'follower';
  const TEST_SOURCE_ADDRESS =
    PRIORITY_DRAIN_TEST_SOURCE_NODE_ID + '/partition/' +
    TEST_SOURCE_REPLICA_ID;
  const TEST_TARGET_ADDRESS =
    PRIORITY_DRAIN_TEST_TARGET_NODE_ID + '/partition/' +
    TEST_TARGET_REPLICA_ID;
  const deliveries = [];
  const coordinator = createTestCoordinator({
    nodeId: PRIORITY_DRAIN_TEST_TARGET_NODE_ID,
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
    controlPlaneReadinessService:
      buildPriorityDrainReadinessService(TEST_PARTITION_ID),
    cacheData: {
      services: [
        {
          service_id: TEST_SOURCE_REPLICA_ID,
          replica_id: TEST_SOURCE_REPLICA_ID,
          service_type: TEST_SERVICE_TYPE,
          partition_id: TEST_PARTITION_ID,
          node_id: PRIORITY_DRAIN_TEST_SOURCE_NODE_ID,
          raft_role: TEST_VOTER_RAFT_ROLE,
          status: ReplicaStatus.ACTIVE,
          address: TEST_SOURCE_ADDRESS,
        },
        {
          service_id: TEST_TARGET_REPLICA_ID,
          replica_id: TEST_TARGET_REPLICA_ID,
          service_type: TEST_SERVICE_TYPE,
          partition_id: TEST_PARTITION_ID,
          node_id: PRIORITY_DRAIN_TEST_TARGET_NODE_ID,
          raft_role: TEST_VOTER_RAFT_ROLE,
          status: ReplicaStatus.ACTIVE,
          address: TEST_TARGET_ADDRESS,
        },
      ],
      replicaOperations: [
        {
          operation_id: TEST_OPERATION_ID,
          type: OperationType.REPLACE,
          partition_id: TEST_PARTITION_ID,
          replica_id: TEST_TARGET_REPLICA_ID,
          source_node_id: PRIORITY_DRAIN_TEST_SOURCE_NODE_ID,
          target_node_id: PRIORITY_DRAIN_TEST_TARGET_NODE_ID,
          status: ReplicaStatus.PENDING,
          workflow_step: WORKFLOW_STEP.SENDING,
          created_at: TEST_NOW_MS,
          updated_at: TEST_NOW_MS,
          completed_at: PRIORITY_DRAIN_TEST_NO_COMPLETED_AT,
          error_message: PRIORITY_DRAIN_TEST_NO_ERROR_MESSAGE,
          entity_type: PRIORITY_DRAIN_TEST_ENTITY_TYPE,
          entity_id: TEST_PARTITION_ID,
          steps_history: JSON.stringify([
            {
              step: WORKFLOW_STEP.PENDING,
              timestamp: TEST_NOW_MS,
              sourceReplicaId: TEST_SOURCE_REPLICA_ID,
            },
            {
              step: WORKFLOW_STEP.SENDING,
              timestamp: TEST_NOW_MS,
              previousStep: WORKFLOW_STEP.PENDING,
            },
          ]),
        },
      ],
    },
  });

  try {
    coordinator.repository.getActualReplicaObservation = async (replicaId) => {
      if (replicaId === TEST_SOURCE_REPLICA_ID) {
        return {
          state: STOPPING_REPLICA_OBSERVATION_STATE.OBSERVED,
          source: PRIORITY_DRAIN_TEST_AUTHORITATIVE_SOURCE,
          lifecycleStatus: ReplicaStatus.ACTIVE,
        };
      }
      return {
        state: STOPPING_REPLICA_OBSERVATION_STATE.ABSENT,
        source: PRIORITY_DRAIN_TEST_AUTHORITATIVE_SOURCE,
      };
    };

    const operation = await coordinator.getOperation(TEST_OPERATION_ID);
    const progressed =
      await coordinator.workflowOwner.reconcileOperationProgress(operation);
    const persistedOperation =
      await coordinator.getOperation(TEST_OPERATION_ID);

    t.equal(
      progressed,
      true,
      'observed active target cache state should continue source removal',
    );
    t.equal(
      deliveries.length,
      1,
      'observed active target should dispatch source removal once',
    );
    t.equal(
      deliveries[0]?.payload?.type,
      ReplicaOperationMessageType.REMOVE_REPLICA,
      'observed active target should dispatch safe source removal',
    );
    t.equal(
      persistedOperation?.workflowStep,
      WORKFLOW_STEP.STOPPING,
      'observed active target should advance the replacement to STOPPING',
    );
    t.equal(
      persistedOperation?.status,
      ReplicaStatus.REMOVING,
      'observed active target should persist removing status',
    );
  } finally {
    await coordinator.shutdown();
  }
});

test('RebalanceCoordinator prefers observed active target cache over stale ' +
  'authoritative CREATING target during priority REPLACE drain', async (t) => {
  const TEST_PARTITION_ID = 'sql_write_operations-p1';
  const TEST_SOURCE_REPLICA_ID = TEST_PARTITION_ID + '-r2';
  const TEST_TARGET_REPLICA_ID = TEST_PARTITION_ID + '-r6';
  const TEST_OPERATION_ID = 'priority-drain-creating-target-cache-active';
  const TEST_NOW_MS = Date.now();
  const TEST_SOURCE_ADDRESS =
    PRIORITY_DRAIN_TEST_SOURCE_NODE_ID + '/partition/' +
    TEST_SOURCE_REPLICA_ID;
  const TEST_TARGET_ADDRESS =
    PRIORITY_DRAIN_TEST_TARGET_NODE_ID + '/partition/' +
    TEST_TARGET_REPLICA_ID;
  const TEST_AUTHORITATIVE_OBSERVED_SOURCE = Object.freeze({
    state: STOPPING_REPLICA_OBSERVATION_STATE.OBSERVED,
    source: PRIORITY_DRAIN_TEST_AUTHORITATIVE_SOURCE,
    lifecycleStatus: ReplicaStatus.ACTIVE,
  });
  const TEST_AUTHORITATIVE_STALE_TARGET = Object.freeze({
    state: STOPPING_REPLICA_OBSERVATION_STATE.OBSERVED,
    source: PRIORITY_DRAIN_TEST_AUTHORITATIVE_SOURCE,
    lifecycleStatus: ReplicaStatus.CREATING,
  });
  const TEST_AUTHORITATIVE_ABSENT_REPLICA = Object.freeze({
    state: STOPPING_REPLICA_OBSERVATION_STATE.ABSENT,
    source: PRIORITY_DRAIN_TEST_AUTHORITATIVE_SOURCE,
  });
  const TEST_AUTHORITATIVE_OBSERVATIONS_BY_REPLICA_ID = Object.freeze(new Map([
    [TEST_SOURCE_REPLICA_ID, TEST_AUTHORITATIVE_OBSERVED_SOURCE],
    [TEST_TARGET_REPLICA_ID, TEST_AUTHORITATIVE_STALE_TARGET],
  ]));
  const deliveries = [];
  const coordinator = createTestCoordinator({
    nodeId: PRIORITY_DRAIN_TEST_TARGET_NODE_ID,
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
    controlPlaneReadinessService:
      buildPriorityDrainReadinessService(TEST_PARTITION_ID),
    cacheData: {
      services: [
        {
          service_id: TEST_SOURCE_REPLICA_ID,
          replica_id: TEST_SOURCE_REPLICA_ID,
          service_type: PRIORITY_DRAIN_TEST_ENTITY_TYPE,
          partition_id: TEST_PARTITION_ID,
          node_id: PRIORITY_DRAIN_TEST_SOURCE_NODE_ID,
          raft_role: RAFT_ROLE.FOLLOWER,
          status: ReplicaStatus.ACTIVE,
          address: TEST_SOURCE_ADDRESS,
        },
        {
          service_id: TEST_TARGET_REPLICA_ID,
          replica_id: TEST_TARGET_REPLICA_ID,
          service_type: PRIORITY_DRAIN_TEST_ENTITY_TYPE,
          partition_id: TEST_PARTITION_ID,
          node_id: PRIORITY_DRAIN_TEST_TARGET_NODE_ID,
          raft_role: RAFT_ROLE.FOLLOWER,
          status: ReplicaStatus.ACTIVE,
          address: TEST_TARGET_ADDRESS,
        },
      ],
      replicaOperations: [
        {
          operation_id: TEST_OPERATION_ID,
          type: OperationType.REPLACE,
          partition_id: TEST_PARTITION_ID,
          replica_id: TEST_TARGET_REPLICA_ID,
          source_node_id: PRIORITY_DRAIN_TEST_SOURCE_NODE_ID,
          target_node_id: PRIORITY_DRAIN_TEST_TARGET_NODE_ID,
          status: ReplicaStatus.CREATING,
          workflow_step: WORKFLOW_STEP.CREATING,
          created_at: TEST_NOW_MS,
          updated_at: TEST_NOW_MS,
          completed_at: PRIORITY_DRAIN_TEST_NO_COMPLETED_AT,
          error_message: PRIORITY_DRAIN_TEST_NO_ERROR_MESSAGE,
          entity_type: PRIORITY_DRAIN_TEST_ENTITY_TYPE,
          entity_id: TEST_PARTITION_ID,
          steps_history: JSON.stringify([
            {
              step: WORKFLOW_STEP.PENDING,
              timestamp: TEST_NOW_MS,
              sourceReplicaId: TEST_SOURCE_REPLICA_ID,
            },
            {
              step: WORKFLOW_STEP.SENDING,
              timestamp: TEST_NOW_MS,
              previousStep: WORKFLOW_STEP.PENDING,
            },
            {
              step: WORKFLOW_STEP.CREATING,
              timestamp: TEST_NOW_MS,
              previousStep: WORKFLOW_STEP.SENDING,
            },
          ]),
        },
      ],
    },
  });

  try {
    coordinator.repository.getActualReplicaObservation = async (replicaId) =>
      TEST_AUTHORITATIVE_OBSERVATIONS_BY_REPLICA_ID.get(replicaId) ||
      TEST_AUTHORITATIVE_ABSENT_REPLICA;

    const operation = await coordinator.getOperation(TEST_OPERATION_ID);
    const progressed =
      await coordinator.workflowOwner.reconcileOperationProgress(operation);
    const persistedOperation =
      await coordinator.getOperation(TEST_OPERATION_ID);

    t.equal(
      progressed,
      true,
      'stale authoritative target state should still continue source removal',
    );
    t.equal(
      deliveries.length,
      1,
      'stale authoritative target state should dispatch source removal once',
    );
    t.equal(
      deliveries[0]?.payload?.type,
      ReplicaOperationMessageType.REMOVE_REPLICA,
      'stale authoritative target state should dispatch safe source removal',
    );
    t.equal(
      persistedOperation?.workflowStep,
      WORKFLOW_STEP.STOPPING,
      'stale authoritative target state should advance to STOPPING',
    );
    t.equal(
      persistedOperation?.status,
      ReplicaStatus.REMOVING,
      'stale authoritative target state should persist removing status',
    );
  } finally {
    await coordinator.shutdown();
  }
});

test('RebalanceCoordinator forwards remote observed active target progress ' +
  'to the operation owner', async (t) => {
  const TEST_PARTITION_ID = 'sql_transactions-p1';
  const TEST_SOURCE_REPLICA_ID = TEST_PARTITION_ID + '-r2';
  const TEST_TARGET_REPLICA_ID = TEST_PARTITION_ID + '-r6';
  const TEST_OPERATION_ID = 'priority-drain-remote-target-cache-active';
  const TEST_OBSERVER_NODE_ID = 'node-observer';
  const TEST_CACHE_OPERATION_UPSERT = 'UPSERT';
  const TEST_DISPATCH_INGRESS = '/service/replica-dispatch';
  const TEST_TARGET_ADDRESS =
    PRIORITY_DRAIN_TEST_TARGET_NODE_ID + '/partition/' +
    TEST_TARGET_REPLICA_ID;
  const TEST_NOW_MS = Date.now();
  const deliveries = [];
  const targetServiceRow = {
    service_id: TEST_TARGET_REPLICA_ID,
    replica_id: TEST_TARGET_REPLICA_ID,
    service_type: PRIORITY_DRAIN_TEST_ENTITY_TYPE,
    partition_id: TEST_PARTITION_ID,
    node_id: PRIORITY_DRAIN_TEST_TARGET_NODE_ID,
    raft_role: RAFT_ROLE.FOLLOWER,
    status: ReplicaStatus.ACTIVE,
    address: TEST_TARGET_ADDRESS,
  };
  const coordinator = createTestCoordinator({
    nodeId: TEST_OBSERVER_NODE_ID,
    enableTimeouts: false,
    messageRouter: {
      async deliver(target, payload, options) {
        deliveries.push({target, payload, options});
        return {
          acknowledged: true,
          status: ReplicaOperationResponseStatus.INITIATED,
        };
      },
    },
    cacheData: {
      services: [targetServiceRow],
      replicaOperations: [
        {
          operation_id: TEST_OPERATION_ID,
          type: OperationType.REPLACE,
          partition_id: TEST_PARTITION_ID,
          replica_id: TEST_TARGET_REPLICA_ID,
          source_node_id: PRIORITY_DRAIN_TEST_SOURCE_NODE_ID,
          target_node_id: PRIORITY_DRAIN_TEST_TARGET_NODE_ID,
          status: ReplicaStatus.CREATING,
          workflow_step: WORKFLOW_STEP.CREATING,
          created_at: TEST_NOW_MS,
          updated_at: TEST_NOW_MS,
          completed_at: PRIORITY_DRAIN_TEST_NO_COMPLETED_AT,
          error_message: PRIORITY_DRAIN_TEST_NO_ERROR_MESSAGE,
          entity_type: PRIORITY_DRAIN_TEST_ENTITY_TYPE,
          entity_id: TEST_PARTITION_ID,
          steps_history: JSON.stringify([
            {
              step: WORKFLOW_STEP.PENDING,
              timestamp: TEST_NOW_MS,
              sourceReplicaId: TEST_SOURCE_REPLICA_ID,
            },
            {
              step: WORKFLOW_STEP.SENDING,
              timestamp: TEST_NOW_MS,
              previousStep: WORKFLOW_STEP.PENDING,
            },
            {
              step: WORKFLOW_STEP.CREATING,
              timestamp: TEST_NOW_MS,
              previousStep: WORKFLOW_STEP.SENDING,
            },
          ]),
        },
      ],
    },
  });

  try {
    coordinator.handleObservedReplicaStateChange(
      SYSTEM_TABLE_NAME.SERVICES,
      TEST_CACHE_OPERATION_UPSERT,
      targetServiceRow,
    );
    await new Promise((resolve) => setImmediate(resolve));
    await new Promise((resolve) => setImmediate(resolve));

    t.equal(
      deliveries.length,
      1,
      'remote observed target progress should wake the operation owner once',
    );
    t.equal(
      deliveries[0]?.target,
      PRIORITY_DRAIN_TEST_TARGET_NODE_ID + TEST_DISPATCH_INGRESS,
      'remote observed target progress should target replica-dispatch owner ingress',
    );
    t.equal(
      deliveries[0]?.payload?.type,
      ControlPlaneMessageType.REPLICA_OPERATION_DISPATCH,
      'remote observed target progress should use dispatch owner wakeup',
    );
    t.equal(
      deliveries[0]?.payload?.[ControlPlaneField.OPERATION_ID],
      TEST_OPERATION_ID,
      'remote observed target progress should include the operation id',
    );
    t.equal(
      deliveries[0]?.payload?.[ControlPlaneField.OPERATION_ROW]
        ?.workflow_step,
      WORKFLOW_STEP.CREATING,
      'remote observed target progress should include the visible operation row',
    );
    t.equal(
      deliveries[0]?.options?.targetNodeId,
      PRIORITY_DRAIN_TEST_TARGET_NODE_ID,
      'remote observed target progress should route to the target owner node',
    );
  } finally {
    await coordinator.shutdown();
  }
});

test('RebalanceCoordinator reconciles non-dispatchable CREATING progress ' +
  'from an owner dispatch wakeup', async (t) => {
  const TEST_PARTITION_ID = 'sql_write_operations-p1';
  const TEST_SOURCE_REPLICA_ID = TEST_PARTITION_ID + '-r2';
  const TEST_TARGET_REPLICA_ID = TEST_PARTITION_ID + '-r6';
  const TEST_OPERATION_ID = 'priority-drain-dispatch-wake-creating-active';
  const TEST_NOW_MS = Date.now();
  const TEST_SOURCE_ADDRESS =
    PRIORITY_DRAIN_TEST_SOURCE_NODE_ID + '/partition/' +
    TEST_SOURCE_REPLICA_ID;
  const TEST_TARGET_ADDRESS =
    PRIORITY_DRAIN_TEST_TARGET_NODE_ID + '/partition/' +
    TEST_TARGET_REPLICA_ID;
  const TEST_AUTHORITATIVE_OBSERVED_SOURCE = Object.freeze({
    state: STOPPING_REPLICA_OBSERVATION_STATE.OBSERVED,
    source: PRIORITY_DRAIN_TEST_AUTHORITATIVE_SOURCE,
    lifecycleStatus: ReplicaStatus.ACTIVE,
  });
  const TEST_AUTHORITATIVE_STALE_TARGET = Object.freeze({
    state: STOPPING_REPLICA_OBSERVATION_STATE.OBSERVED,
    source: PRIORITY_DRAIN_TEST_AUTHORITATIVE_SOURCE,
    lifecycleStatus: ReplicaStatus.CREATING,
  });
  const TEST_AUTHORITATIVE_ABSENT_REPLICA = Object.freeze({
    state: STOPPING_REPLICA_OBSERVATION_STATE.ABSENT,
    source: PRIORITY_DRAIN_TEST_AUTHORITATIVE_SOURCE,
  });
  const TEST_AUTHORITATIVE_OBSERVATIONS_BY_REPLICA_ID = Object.freeze(new Map([
    [TEST_SOURCE_REPLICA_ID, TEST_AUTHORITATIVE_OBSERVED_SOURCE],
    [TEST_TARGET_REPLICA_ID, TEST_AUTHORITATIVE_STALE_TARGET],
  ]));
  const operationRow = {
    operation_id: TEST_OPERATION_ID,
    type: OperationType.REPLACE,
    partition_id: TEST_PARTITION_ID,
    replica_id: TEST_TARGET_REPLICA_ID,
    source_node_id: PRIORITY_DRAIN_TEST_SOURCE_NODE_ID,
    target_node_id: PRIORITY_DRAIN_TEST_TARGET_NODE_ID,
    status: ReplicaStatus.CREATING,
    workflow_step: WORKFLOW_STEP.CREATING,
    created_at: TEST_NOW_MS,
    updated_at: TEST_NOW_MS,
    completed_at: PRIORITY_DRAIN_TEST_NO_COMPLETED_AT,
    error_message: PRIORITY_DRAIN_TEST_NO_ERROR_MESSAGE,
    entity_type: PRIORITY_DRAIN_TEST_ENTITY_TYPE,
    entity_id: TEST_PARTITION_ID,
    steps_history: JSON.stringify([
      {
        step: WORKFLOW_STEP.PENDING,
        timestamp: TEST_NOW_MS,
        sourceReplicaId: TEST_SOURCE_REPLICA_ID,
      },
      {
        step: WORKFLOW_STEP.SENDING,
        timestamp: TEST_NOW_MS,
        previousStep: WORKFLOW_STEP.PENDING,
      },
      {
        step: WORKFLOW_STEP.CREATING,
        timestamp: TEST_NOW_MS,
        previousStep: WORKFLOW_STEP.SENDING,
      },
    ]),
  };
  const deliveries = [];
  const coordinator = createTestCoordinator({
    nodeId: PRIORITY_DRAIN_TEST_TARGET_NODE_ID,
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
    controlPlaneReadinessService:
      buildPriorityDrainReadinessService(TEST_PARTITION_ID),
    cacheData: {
      services: [
        {
          service_id: TEST_SOURCE_REPLICA_ID,
          replica_id: TEST_SOURCE_REPLICA_ID,
          service_type: PRIORITY_DRAIN_TEST_ENTITY_TYPE,
          partition_id: TEST_PARTITION_ID,
          node_id: PRIORITY_DRAIN_TEST_SOURCE_NODE_ID,
          raft_role: RAFT_ROLE.FOLLOWER,
          status: ReplicaStatus.ACTIVE,
          address: TEST_SOURCE_ADDRESS,
        },
        {
          service_id: TEST_TARGET_REPLICA_ID,
          replica_id: TEST_TARGET_REPLICA_ID,
          service_type: PRIORITY_DRAIN_TEST_ENTITY_TYPE,
          partition_id: TEST_PARTITION_ID,
          node_id: PRIORITY_DRAIN_TEST_TARGET_NODE_ID,
          raft_role: RAFT_ROLE.FOLLOWER,
          status: ReplicaStatus.ACTIVE,
          address: TEST_TARGET_ADDRESS,
        },
      ],
      replicaOperations: [operationRow],
    },
  });

  try {
    coordinator.repository.getActualReplicaObservation = async (replicaId) =>
      TEST_AUTHORITATIVE_OBSERVATIONS_BY_REPLICA_ID.get(replicaId) ||
      TEST_AUTHORITATIVE_ABSENT_REPLICA;

    const dispatchResult = await coordinator.dispatchOperation(operationRow);
    const persistedOperation =
      await coordinator.getOperation(TEST_OPERATION_ID);

    t.equal(
      dispatchResult?.success,
      true,
      'dispatch wake should reconcile already-materialized target progress',
    );
    t.equal(
      deliveries.length,
      1,
      'dispatch wake should continue source removal once',
    );
    t.equal(
      deliveries[0]?.payload?.type,
      ReplicaOperationMessageType.REMOVE_REPLICA,
      'dispatch wake should dispatch safe source removal',
    );
    t.equal(
      persistedOperation?.workflowStep,
      WORKFLOW_STEP.STOPPING,
      'dispatch wake should advance stale CREATING replacement to STOPPING',
    );
    t.equal(
      persistedOperation?.status,
      ReplicaStatus.REMOVING,
      'dispatch wake should persist source-removal progress',
    );
  } finally {
    await coordinator.shutdown();
  }
});

test('RebalanceCoordinator does not let stale failed target cache override ' +
  'authoritative ACTIVE target during priority REPLACE drain', async (t) => {
  const TEST_PARTITION_ID = 'sql_write_operations-p1';
  const TEST_SOURCE_REPLICA_ID = TEST_PARTITION_ID + '-r2';
  const TEST_TARGET_REPLICA_ID = TEST_PARTITION_ID + '-r6';
  const TEST_OPERATION_ID = 'priority-drain-active-target-cache-failed';
  const TEST_NOW_MS = Date.now();
  const coordinator = createTestCoordinator({
    nodeId: PRIORITY_DRAIN_TEST_TARGET_NODE_ID,
    enableTimeouts: false,
    controlPlaneReadinessService:
      buildPriorityDrainReadinessService(TEST_PARTITION_ID),
    cacheData: {
      services: [
        {
          service_id: TEST_TARGET_REPLICA_ID,
          replica_id: TEST_TARGET_REPLICA_ID,
          service_type: PRIORITY_DRAIN_TEST_ENTITY_TYPE,
          partition_id: TEST_PARTITION_ID,
          node_id: PRIORITY_DRAIN_TEST_TARGET_NODE_ID,
          raft_role: RAFT_ROLE.FOLLOWER,
          status: ReplicaStatus.FAILED,
        },
      ],
      replicaOperations: [
        {
          operation_id: TEST_OPERATION_ID,
          type: OperationType.REPLACE,
          partition_id: TEST_PARTITION_ID,
          replica_id: TEST_TARGET_REPLICA_ID,
          source_node_id: PRIORITY_DRAIN_TEST_SOURCE_NODE_ID,
          target_node_id: PRIORITY_DRAIN_TEST_TARGET_NODE_ID,
          status: ReplicaStatus.CREATING,
          workflow_step: WORKFLOW_STEP.CREATING,
          created_at: TEST_NOW_MS,
          updated_at: TEST_NOW_MS,
          completed_at: PRIORITY_DRAIN_TEST_NO_COMPLETED_AT,
          error_message: PRIORITY_DRAIN_TEST_NO_ERROR_MESSAGE,
          entity_type: PRIORITY_DRAIN_TEST_ENTITY_TYPE,
          entity_id: TEST_PARTITION_ID,
          steps_history: JSON.stringify([
            {
              step: WORKFLOW_STEP.PENDING,
              timestamp: TEST_NOW_MS,
              sourceReplicaId: TEST_SOURCE_REPLICA_ID,
            },
            {
              step: WORKFLOW_STEP.SENDING,
              timestamp: TEST_NOW_MS,
              previousStep: WORKFLOW_STEP.PENDING,
            },
            {
              step: WORKFLOW_STEP.CREATING,
              timestamp: TEST_NOW_MS,
              previousStep: WORKFLOW_STEP.SENDING,
            },
          ]),
        },
      ],
    },
  });

  try {
    const operation = await coordinator.getOperation(TEST_OPERATION_ID);
    const reconciledStatus =
      coordinator.workflowOwner.resolveReconciledReplicaStatus(
        operation,
        ReplicaStatus.ACTIVE,
      );

    t.equal(
      reconciledStatus,
      ReplicaStatus.ACTIVE,
      'authoritative ACTIVE target status should outrank stale failed cache',
    );
  } finally {
    await coordinator.shutdown();
  }
});

test('RebalanceCoordinator does not let stale active target cache override ' +
  'authoritative FAILED target during priority REPLACE drain', async (t) => {
  const TEST_PARTITION_ID = 'sql_write_operations-p1';
  const TEST_SOURCE_REPLICA_ID = TEST_PARTITION_ID + '-r2';
  const TEST_TARGET_REPLICA_ID = TEST_PARTITION_ID + '-r6';
  const TEST_OPERATION_ID = 'priority-drain-failed-target-cache-active';
  const TEST_NOW_MS = Date.now();
  const coordinator = createTestCoordinator({
    nodeId: PRIORITY_DRAIN_TEST_TARGET_NODE_ID,
    enableTimeouts: false,
    controlPlaneReadinessService:
      buildPriorityDrainReadinessService(TEST_PARTITION_ID),
    cacheData: {
      services: [
        {
          service_id: TEST_TARGET_REPLICA_ID,
          replica_id: TEST_TARGET_REPLICA_ID,
          service_type: PRIORITY_DRAIN_TEST_ENTITY_TYPE,
          partition_id: TEST_PARTITION_ID,
          node_id: PRIORITY_DRAIN_TEST_TARGET_NODE_ID,
          raft_role: RAFT_ROLE.FOLLOWER,
          status: ReplicaStatus.ACTIVE,
        },
      ],
      replicaOperations: [
        {
          operation_id: TEST_OPERATION_ID,
          type: OperationType.REPLACE,
          partition_id: TEST_PARTITION_ID,
          replica_id: TEST_TARGET_REPLICA_ID,
          source_node_id: PRIORITY_DRAIN_TEST_SOURCE_NODE_ID,
          target_node_id: PRIORITY_DRAIN_TEST_TARGET_NODE_ID,
          status: ReplicaStatus.CREATING,
          workflow_step: WORKFLOW_STEP.CREATING,
          created_at: TEST_NOW_MS,
          updated_at: TEST_NOW_MS,
          completed_at: PRIORITY_DRAIN_TEST_NO_COMPLETED_AT,
          error_message: PRIORITY_DRAIN_TEST_NO_ERROR_MESSAGE,
          entity_type: PRIORITY_DRAIN_TEST_ENTITY_TYPE,
          entity_id: TEST_PARTITION_ID,
          steps_history: JSON.stringify([
            {
              step: WORKFLOW_STEP.PENDING,
              timestamp: TEST_NOW_MS,
              sourceReplicaId: TEST_SOURCE_REPLICA_ID,
            },
            {
              step: WORKFLOW_STEP.SENDING,
              timestamp: TEST_NOW_MS,
              previousStep: WORKFLOW_STEP.PENDING,
            },
            {
              step: WORKFLOW_STEP.CREATING,
              timestamp: TEST_NOW_MS,
              previousStep: WORKFLOW_STEP.SENDING,
            },
          ]),
        },
      ],
    },
  });

  try {
    const operation = await coordinator.getOperation(TEST_OPERATION_ID);
    const reconciledStatus =
      coordinator.workflowOwner.resolveReconciledReplicaStatus(
        operation,
        ReplicaStatus.FAILED,
      );

    t.equal(
      reconciledStatus,
      ReplicaStatus.FAILED,
      'authoritative FAILED target status should outrank stale active cache',
    );
  } finally {
    await coordinator.shutdown();
  }
});

test('RebalanceCoordinator does not let stale active target cache override ' +
  'authoritative REMOVED target during priority REPLACE drain', async (t) => {
  const TEST_PARTITION_ID = 'sql_write_operations-p1';
  const TEST_SOURCE_REPLICA_ID = TEST_PARTITION_ID + '-r2';
  const TEST_TARGET_REPLICA_ID = TEST_PARTITION_ID + '-r6';
  const TEST_OPERATION_ID = 'priority-drain-removed-target-cache-active';
  const TEST_NOW_MS = Date.now();
  const coordinator = createTestCoordinator({
    nodeId: PRIORITY_DRAIN_TEST_TARGET_NODE_ID,
    enableTimeouts: false,
    controlPlaneReadinessService:
      buildPriorityDrainReadinessService(TEST_PARTITION_ID),
    cacheData: {
      services: [
        {
          service_id: TEST_TARGET_REPLICA_ID,
          replica_id: TEST_TARGET_REPLICA_ID,
          service_type: PRIORITY_DRAIN_TEST_ENTITY_TYPE,
          partition_id: TEST_PARTITION_ID,
          node_id: PRIORITY_DRAIN_TEST_TARGET_NODE_ID,
          raft_role: RAFT_ROLE.FOLLOWER,
          status: ReplicaStatus.ACTIVE,
        },
      ],
      replicaOperations: [
        {
          operation_id: TEST_OPERATION_ID,
          type: OperationType.REPLACE,
          partition_id: TEST_PARTITION_ID,
          replica_id: TEST_TARGET_REPLICA_ID,
          source_node_id: PRIORITY_DRAIN_TEST_SOURCE_NODE_ID,
          target_node_id: PRIORITY_DRAIN_TEST_TARGET_NODE_ID,
          status: ReplicaStatus.CREATING,
          workflow_step: WORKFLOW_STEP.CREATING,
          created_at: TEST_NOW_MS,
          updated_at: TEST_NOW_MS,
          completed_at: PRIORITY_DRAIN_TEST_NO_COMPLETED_AT,
          error_message: PRIORITY_DRAIN_TEST_NO_ERROR_MESSAGE,
          entity_type: PRIORITY_DRAIN_TEST_ENTITY_TYPE,
          entity_id: TEST_PARTITION_ID,
          steps_history: JSON.stringify([
            {
              step: WORKFLOW_STEP.PENDING,
              timestamp: TEST_NOW_MS,
              sourceReplicaId: TEST_SOURCE_REPLICA_ID,
            },
            {
              step: WORKFLOW_STEP.SENDING,
              timestamp: TEST_NOW_MS,
              previousStep: WORKFLOW_STEP.PENDING,
            },
            {
              step: WORKFLOW_STEP.CREATING,
              timestamp: TEST_NOW_MS,
              previousStep: WORKFLOW_STEP.SENDING,
            },
          ]),
        },
      ],
    },
  });

  try {
    const operation = await coordinator.getOperation(TEST_OPERATION_ID);
    const reconciledStatus =
      coordinator.workflowOwner.resolveReconciledReplicaStatus(
        operation,
        ReplicaStatus.REMOVED,
      );

    t.equal(
      reconciledStatus,
      ReplicaStatus.REMOVED,
      'authoritative REMOVED target status should outrank stale active cache',
    );
  } finally {
    await coordinator.shutdown();
  }
});

test('RebalanceCoordinator releases remote-owned ACTIVE priority REPLACE ' +
  'when the canonical owner is no longer repair-eligible and spread is ' +
  'satisfied', async (t) => {
  const TEST_PARTITION_ID = PRIORITY_DRAIN_TEST_REMOTE_RELEASE_PARTITION_ID;
  const TEST_SOURCE_REPLICA_ID = TEST_PARTITION_ID + '-r1';
  const TEST_TARGET_REPLICA_ID = TEST_PARTITION_ID + '-r4';
  const TEST_OPERATION_ID = PRIORITY_DRAIN_TEST_REMOTE_RELEASE_OPERATION_ID;
  const TEST_NOW_MS = Date.now();
  const TEST_SOURCE_ADDRESS =
    PRIORITY_DRAIN_TEST_SOURCE_NODE_ID + '/partition/' +
    TEST_SOURCE_REPLICA_ID;
  const TEST_TARGET_ADDRESS =
    PRIORITY_DRAIN_TEST_UNAVAILABLE_TARGET_NODE_ID + '/partition/' +
    TEST_TARGET_REPLICA_ID;
  const deliveries = [];
  const coordinator = createTestCoordinator({
    nodeId: PRIORITY_DRAIN_TEST_SOURCE_NODE_ID,
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
    controlPlaneReadinessService:
      buildPriorityDrainOwnerUnavailableReadinessService(
        TEST_PARTITION_ID,
        PRIORITY_DRAIN_TEST_UNAVAILABLE_TARGET_NODE_ID,
      ),
    cacheData: {
      services: [
        {
          service_id: TEST_SOURCE_REPLICA_ID,
          replica_id: TEST_SOURCE_REPLICA_ID,
          service_type: PRIORITY_DRAIN_TEST_REMOTE_RELEASE_SERVICE_TYPE,
          partition_id: TEST_PARTITION_ID,
          node_id: PRIORITY_DRAIN_TEST_SOURCE_NODE_ID,
          raft_role: PRIORITY_DRAIN_TEST_REMOTE_RELEASE_VOTER_ROLE,
          status: ReplicaStatus.ACTIVE,
          address: TEST_SOURCE_ADDRESS,
        },
        {
          service_id: TEST_TARGET_REPLICA_ID,
          replica_id: TEST_TARGET_REPLICA_ID,
          service_type: PRIORITY_DRAIN_TEST_REMOTE_RELEASE_SERVICE_TYPE,
          partition_id: TEST_PARTITION_ID,
          node_id: PRIORITY_DRAIN_TEST_UNAVAILABLE_TARGET_NODE_ID,
          raft_role: PRIORITY_DRAIN_TEST_REMOTE_RELEASE_VOTER_ROLE,
          status: ReplicaStatus.ACTIVE,
          address: TEST_TARGET_ADDRESS,
        },
      ],
      replicaOperations: [
        {
          operation_id: TEST_OPERATION_ID,
          type: OperationType.REPLACE,
          partition_id: TEST_PARTITION_ID,
          replica_id: TEST_TARGET_REPLICA_ID,
          source_node_id: PRIORITY_DRAIN_TEST_SOURCE_NODE_ID,
          target_node_id: PRIORITY_DRAIN_TEST_UNAVAILABLE_TARGET_NODE_ID,
          status: ReplicaStatus.ACTIVE,
          workflow_step: WORKFLOW_STEP.ACTIVE,
          created_at: TEST_NOW_MS,
          updated_at: TEST_NOW_MS,
          completed_at: PRIORITY_DRAIN_TEST_NO_COMPLETED_AT,
          error_message: PRIORITY_DRAIN_TEST_NO_ERROR_MESSAGE,
          entity_type: PRIORITY_DRAIN_TEST_ENTITY_TYPE,
          entity_id: TEST_PARTITION_ID,
          steps_history: JSON.stringify([
            {
              step: WORKFLOW_STEP.PENDING,
              timestamp: TEST_NOW_MS,
              sourceReplicaId: TEST_SOURCE_REPLICA_ID,
            },
            {
              step: WORKFLOW_STEP.ACTIVE,
              timestamp: TEST_NOW_MS,
              previousStep: WORKFLOW_STEP.SYNCING,
            },
          ]),
        },
      ],
    },
  });

  try {
    coordinator.repository.getActualReplicaObservation = async () => ({
      state: STOPPING_REPLICA_OBSERVATION_STATE.OBSERVED,
      source: PRIORITY_DRAIN_TEST_AUTHORITATIVE_SOURCE,
      lifecycleStatus: ReplicaStatus.ACTIVE,
    });

    const operation = await coordinator.getOperation(TEST_OPERATION_ID);
    const reconciled =
      await coordinator.workflowOwner.reconcilePriorityRecoveryOperationDrain(
        operation,
      );
    const persistedOperation =
      await coordinator.getOperation(TEST_OPERATION_ID);

    t.equal(
      reconciled,
      true,
      PRIORITY_DRAIN_TEST_REMOTE_RELEASE_SOURCE_ACTIVE_ASSERTION,
    );
    t.equal(
      deliveries.length,
      0,
      PRIORITY_DRAIN_TEST_REMOTE_RELEASE_NO_DELIVERY_ASSERTION,
    );
    t.equal(
      persistedOperation?.workflowStep,
      WORKFLOW_STEP.REMOVED,
      PRIORITY_DRAIN_TEST_REMOTE_RELEASE_TERMINAL_ASSERTION,
    );
  } finally {
    await coordinator.shutdown();
  }
});

test('RebalanceCoordinator releases remote-owned SYNCING priority REPLACE ' +
  'when the target is active and canonical owner is no longer repair-eligible',
async (t) => {
  const TEST_PARTITION_ID = PRIORITY_DRAIN_TEST_REMOTE_RELEASE_PARTITION_ID;
  const TEST_SOURCE_REPLICA_ID = TEST_PARTITION_ID + '-r1';
  const TEST_TARGET_REPLICA_ID = TEST_PARTITION_ID + '-r4';
  const TEST_OPERATION_ID =
    PRIORITY_DRAIN_TEST_REMOTE_RELEASE_SYNCING_OPERATION_ID;
  const TEST_NOW_MS = Date.now();
  const TEST_SOURCE_ADDRESS =
    PRIORITY_DRAIN_TEST_SOURCE_NODE_ID + '/partition/' +
    TEST_SOURCE_REPLICA_ID;
  const TEST_TARGET_ADDRESS =
    PRIORITY_DRAIN_TEST_UNAVAILABLE_TARGET_NODE_ID + '/partition/' +
    TEST_TARGET_REPLICA_ID;
  const deliveries = [];
  const coordinator = createTestCoordinator({
    nodeId: PRIORITY_DRAIN_TEST_SOURCE_NODE_ID,
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
    controlPlaneReadinessService:
      buildPriorityDrainOwnerUnavailableReadinessService(
        TEST_PARTITION_ID,
        PRIORITY_DRAIN_TEST_UNAVAILABLE_TARGET_NODE_ID,
      ),
    cacheData: {
      services: [
        {
          service_id: TEST_SOURCE_REPLICA_ID,
          replica_id: TEST_SOURCE_REPLICA_ID,
          service_type: PRIORITY_DRAIN_TEST_REMOTE_RELEASE_SERVICE_TYPE,
          partition_id: TEST_PARTITION_ID,
          node_id: PRIORITY_DRAIN_TEST_SOURCE_NODE_ID,
          raft_role: PRIORITY_DRAIN_TEST_REMOTE_RELEASE_VOTER_ROLE,
          status: ReplicaStatus.ACTIVE,
          address: TEST_SOURCE_ADDRESS,
        },
        {
          service_id: TEST_TARGET_REPLICA_ID,
          replica_id: TEST_TARGET_REPLICA_ID,
          service_type: PRIORITY_DRAIN_TEST_REMOTE_RELEASE_SERVICE_TYPE,
          partition_id: TEST_PARTITION_ID,
          node_id: PRIORITY_DRAIN_TEST_UNAVAILABLE_TARGET_NODE_ID,
          raft_role: PRIORITY_DRAIN_TEST_REMOTE_RELEASE_VOTER_ROLE,
          status: ReplicaStatus.ACTIVE,
          address: TEST_TARGET_ADDRESS,
        },
      ],
      replicaOperations: [
        {
          operation_id: TEST_OPERATION_ID,
          type: OperationType.REPLACE,
          partition_id: TEST_PARTITION_ID,
          replica_id: TEST_TARGET_REPLICA_ID,
          source_node_id: PRIORITY_DRAIN_TEST_SOURCE_NODE_ID,
          target_node_id: PRIORITY_DRAIN_TEST_UNAVAILABLE_TARGET_NODE_ID,
          status: ReplicaStatus.SYNCING,
          workflow_step: WORKFLOW_STEP.SYNCING,
          created_at: TEST_NOW_MS,
          updated_at: TEST_NOW_MS,
          completed_at: PRIORITY_DRAIN_TEST_NO_COMPLETED_AT,
          error_message: PRIORITY_DRAIN_TEST_NO_ERROR_MESSAGE,
          entity_type: PRIORITY_DRAIN_TEST_ENTITY_TYPE,
          entity_id: TEST_PARTITION_ID,
          steps_history: JSON.stringify([
            {
              step: WORKFLOW_STEP.PENDING,
              timestamp: TEST_NOW_MS,
              sourceReplicaId: TEST_SOURCE_REPLICA_ID,
            },
            {
              step: WORKFLOW_STEP.SYNCING,
              timestamp: TEST_NOW_MS,
              previousStep: WORKFLOW_STEP.CREATING,
            },
          ]),
        },
      ],
    },
  });

  try {
    coordinator.repository.getActualReplicaObservation = async () => ({
      state: STOPPING_REPLICA_OBSERVATION_STATE.OBSERVED,
      source: PRIORITY_DRAIN_TEST_AUTHORITATIVE_SOURCE,
      lifecycleStatus: ReplicaStatus.ACTIVE,
    });

    const operation = await coordinator.getOperation(TEST_OPERATION_ID);
    const reconciled =
      await coordinator.workflowOwner.reconcilePriorityRecoveryOperationDrain(
        operation,
      );
    const persistedOperation =
      await coordinator.getOperation(TEST_OPERATION_ID);

    t.equal(
      reconciled,
      true,
      PRIORITY_DRAIN_TEST_REMOTE_RELEASE_SOURCE_ACTIVE_ASSERTION,
    );
    t.equal(
      deliveries.length,
      0,
      PRIORITY_DRAIN_TEST_REMOTE_RELEASE_NO_DELIVERY_ASSERTION,
    );
    t.equal(
      persistedOperation?.workflowStep,
      WORKFLOW_STEP.REMOVED,
      PRIORITY_DRAIN_TEST_REMOTE_RELEASE_SYNCING_ASSERTION,
    );
  } finally {
    await coordinator.shutdown();
  }
});

test('RebalanceCoordinator releases remote-owned STOPPING priority REPLACE ' +
  'when the canonical owner is no longer repair-eligible and source removal ' +
  'is in flight', async (t) => {
  const TEST_PARTITION_ID = PRIORITY_DRAIN_TEST_REMOTE_RELEASE_PARTITION_ID;
  const TEST_SOURCE_REPLICA_ID = TEST_PARTITION_ID + '-r1';
  const TEST_TARGET_REPLICA_ID = TEST_PARTITION_ID + '-r4';
  const TEST_OPERATION_ID =
    PRIORITY_DRAIN_TEST_REMOTE_RELEASE_STOPPING_OPERATION_ID;
  const TEST_NOW_MS = Date.now();
  const TEST_SOURCE_ADDRESS =
    PRIORITY_DRAIN_TEST_SOURCE_NODE_ID + '/partition/' +
    TEST_SOURCE_REPLICA_ID;
  const TEST_TARGET_ADDRESS =
    PRIORITY_DRAIN_TEST_UNAVAILABLE_TARGET_NODE_ID + '/partition/' +
    TEST_TARGET_REPLICA_ID;
  const deliveries = [];
  const coordinator = createTestCoordinator({
    nodeId: PRIORITY_DRAIN_TEST_SOURCE_NODE_ID,
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
    controlPlaneReadinessService:
      buildPriorityDrainOwnerUnavailableReadinessService(
        TEST_PARTITION_ID,
        PRIORITY_DRAIN_TEST_UNAVAILABLE_TARGET_NODE_ID,
      ),
    cacheData: {
      services: [
        {
          service_id: TEST_SOURCE_REPLICA_ID,
          replica_id: TEST_SOURCE_REPLICA_ID,
          service_type: PRIORITY_DRAIN_TEST_REMOTE_RELEASE_SERVICE_TYPE,
          partition_id: TEST_PARTITION_ID,
          node_id: PRIORITY_DRAIN_TEST_SOURCE_NODE_ID,
          raft_role: PRIORITY_DRAIN_TEST_REMOTE_RELEASE_VOTER_ROLE,
          status: ReplicaStatus.REMOVING,
          address: TEST_SOURCE_ADDRESS,
        },
        {
          service_id: TEST_TARGET_REPLICA_ID,
          replica_id: TEST_TARGET_REPLICA_ID,
          service_type: PRIORITY_DRAIN_TEST_REMOTE_RELEASE_SERVICE_TYPE,
          partition_id: TEST_PARTITION_ID,
          node_id: PRIORITY_DRAIN_TEST_UNAVAILABLE_TARGET_NODE_ID,
          raft_role: PRIORITY_DRAIN_TEST_REMOTE_RELEASE_VOTER_ROLE,
          status: ReplicaStatus.ACTIVE,
          address: TEST_TARGET_ADDRESS,
        },
      ],
      replicaOperations: [
        {
          operation_id: TEST_OPERATION_ID,
          type: OperationType.REPLACE,
          partition_id: TEST_PARTITION_ID,
          replica_id: TEST_TARGET_REPLICA_ID,
          source_node_id: PRIORITY_DRAIN_TEST_SOURCE_NODE_ID,
          target_node_id: PRIORITY_DRAIN_TEST_UNAVAILABLE_TARGET_NODE_ID,
          status: ReplicaStatus.REMOVING,
          workflow_step: WORKFLOW_STEP.STOPPING,
          created_at: TEST_NOW_MS,
          updated_at: TEST_NOW_MS,
          completed_at: PRIORITY_DRAIN_TEST_NO_COMPLETED_AT,
          error_message: PRIORITY_DRAIN_TEST_NO_ERROR_MESSAGE,
          entity_type: PRIORITY_DRAIN_TEST_ENTITY_TYPE,
          entity_id: TEST_PARTITION_ID,
          steps_history: JSON.stringify([
            {
              step: WORKFLOW_STEP.PENDING,
              timestamp: TEST_NOW_MS,
              sourceReplicaId: TEST_SOURCE_REPLICA_ID,
            },
            {
              step: WORKFLOW_STEP.STOPPING,
              timestamp: TEST_NOW_MS,
              previousStep: WORKFLOW_STEP.ACTIVE,
            },
          ]),
        },
      ],
    },
  });

  try {
    coordinator.repository.getActualReplicaObservation = async () => ({
      state: STOPPING_REPLICA_OBSERVATION_STATE.OBSERVED,
      source: PRIORITY_DRAIN_TEST_AUTHORITATIVE_SOURCE,
      lifecycleStatus: ReplicaStatus.REMOVING,
    });

    const operation = await coordinator.getOperation(TEST_OPERATION_ID);
    const reconciled =
      await coordinator.workflowOwner.reconcilePriorityRecoveryOperationDrain(
        operation,
      );
    const persistedOperation =
      await coordinator.getOperation(TEST_OPERATION_ID);

    t.equal(
      reconciled,
      true,
      PRIORITY_DRAIN_TEST_REMOTE_RELEASE_SOURCE_STOPPING_ASSERTION,
    );
    t.equal(
      deliveries.length,
      0,
      PRIORITY_DRAIN_TEST_REMOTE_RELEASE_NO_DELIVERY_ASSERTION,
    );
    t.equal(
      persistedOperation?.workflowStep,
      WORKFLOW_STEP.REMOVED,
      PRIORITY_DRAIN_TEST_REMOTE_RELEASE_STOPPING_ASSERTION,
    );
  } finally {
    await coordinator.shutdown();
  }
});

test('RebalanceCoordinator guards terminal priority REPLACE rows from stale ' +
  'direct nonterminal transitions', async (t) => {
  const TEST_PARTITION_ID = 'sql_transactions-p1';
  const TEST_SOURCE_REPLICA_ID = TEST_PARTITION_ID + '-r1';
  const TEST_TARGET_REPLICA_ID = TEST_PARTITION_ID + '-r4';
  const TEST_OPERATION_ID = PRIORITY_DRAIN_TEST_TERMINAL_GUARD_OPERATION_ID;
  const TEST_NOW_MS = Date.now();
  const TEST_SOURCE_NODE_ID = PRIORITY_DRAIN_TEST_SOURCE_NODE_ID;
  const TEST_TARGET_NODE_ID = PRIORITY_DRAIN_TEST_TARGET_NODE_ID;
  const TEST_STALE_OPERATION = {
    operationId: TEST_OPERATION_ID,
    type: OperationType.REPLACE,
    partitionId: TEST_PARTITION_ID,
    replicaId: TEST_TARGET_REPLICA_ID,
    sourceNodeId: TEST_SOURCE_NODE_ID,
    targetNodeId: TEST_TARGET_NODE_ID,
    status: ReplicaStatus.ACTIVE,
    workflowStep: WORKFLOW_STEP.ACTIVE,
    createdAt: TEST_NOW_MS,
    updatedAt: TEST_NOW_MS,
    completedAt: PRIORITY_DRAIN_TEST_NO_COMPLETED_AT,
    errorMessage: PRIORITY_DRAIN_TEST_NO_ERROR_MESSAGE,
    entityType: PRIORITY_DRAIN_TEST_ENTITY_TYPE,
    entityId: TEST_PARTITION_ID,
    stepsHistory: [
      {
        step: WORKFLOW_STEP.PENDING,
        timestamp: TEST_NOW_MS,
        sourceReplicaId: TEST_SOURCE_REPLICA_ID,
      },
      {
        step: WORKFLOW_STEP.ACTIVE,
        timestamp: TEST_NOW_MS,
        previousStep: WORKFLOW_STEP.CREATING,
      },
    ],
  };
  const coordinator = createTestCoordinator({
    nodeId: TEST_TARGET_NODE_ID,
    enableTimeouts: false,
    controlPlaneReadinessService:
      buildPriorityDrainReadinessService(TEST_PARTITION_ID),
    cacheData: {
      replicaOperations: [
        {
          operation_id: TEST_OPERATION_ID,
          type: OperationType.REPLACE,
          partition_id: TEST_PARTITION_ID,
          replica_id: TEST_TARGET_REPLICA_ID,
          source_node_id: TEST_SOURCE_NODE_ID,
          target_node_id: TEST_TARGET_NODE_ID,
          status: ReplicaStatus.REMOVED,
          workflow_step: WORKFLOW_STEP.REMOVED,
          created_at: TEST_NOW_MS,
          updated_at: TEST_NOW_MS,
          completed_at: TEST_NOW_MS,
          error_message: PRIORITY_DRAIN_TEST_NO_ERROR_MESSAGE,
          entity_type: PRIORITY_DRAIN_TEST_ENTITY_TYPE,
          entity_id: TEST_PARTITION_ID,
          steps_history: JSON.stringify([
            ...TEST_STALE_OPERATION.stepsHistory,
            {
              step: WORKFLOW_STEP.REMOVED,
              timestamp: TEST_NOW_MS,
              previousStep: WORKFLOW_STEP.STOPPING,
            },
          ]),
        },
      ],
    },
  });

  try {
    const transitionCommitted = await coordinator.workflowOwner.updateStep(
      TEST_STALE_OPERATION,
      WORKFLOW_STEP.STOPPING,
    );
    const persistedOperation =
      await coordinator.getOperation(TEST_OPERATION_ID);

    t.equal(
      transitionCommitted,
      false,
      PRIORITY_DRAIN_TEST_TERMINAL_GUARD_TRANSITION_ASSERTION,
    );
    t.equal(
      persistedOperation?.workflowStep,
      WORKFLOW_STEP.REMOVED,
      PRIORITY_DRAIN_TEST_TERMINAL_GUARD_STEP_ASSERTION,
    );
    t.equal(
      persistedOperation?.status,
      ReplicaStatus.REMOVED,
      PRIORITY_DRAIN_TEST_TERMINAL_GUARD_STATUS_ASSERTION,
    );
  } finally {
    await coordinator.shutdown();
  }
});

test('RebalanceCoordinator removes a priority REPLACE source follower after ' +
  'fresh replacement election evidence and safe recovery completion',
async (t) => {
  const TEST_PARTITION_ID = 'sql_transactions-p1';
  const TEST_SOURCE_REPLICA_ID = TEST_PARTITION_ID + '-r1';
  const TEST_TARGET_REPLICA_ID = TEST_PARTITION_ID + '-r5';
  const TEST_OPERATION_ID = PRIORITY_DRAIN_TEST_FOLLOWER_ELECTION_OPERATION_ID;
  const TEST_NOW_MS = Date.now();
  const TEST_SOURCE_ADDRESS =
    PRIORITY_DRAIN_TEST_SOURCE_NODE_ID + '/partition/' +
    TEST_SOURCE_REPLICA_ID;
  const TEST_TARGET_ADDRESS =
    PRIORITY_DRAIN_TEST_TARGET_NODE_ID + '/partition/' +
    TEST_TARGET_REPLICA_ID;
  const deliveries = [];
  const coordinator = createTestCoordinator({
    nodeId: PRIORITY_DRAIN_TEST_TARGET_NODE_ID,
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
    controlPlaneReadinessService:
      buildPriorityDrainReadinessService(TEST_PARTITION_ID),
    cacheData: {
      services: [
        {
          service_id: TEST_SOURCE_REPLICA_ID,
          replica_id: TEST_SOURCE_REPLICA_ID,
          service_type: PRIORITY_DRAIN_TEST_REMOTE_RELEASE_SERVICE_TYPE,
          partition_id: TEST_PARTITION_ID,
          node_id: PRIORITY_DRAIN_TEST_SOURCE_NODE_ID,
          raft_role: PRIORITY_DRAIN_TEST_REMOTE_RELEASE_VOTER_ROLE,
          status: ReplicaStatus.ACTIVE,
          address: TEST_SOURCE_ADDRESS,
        },
        {
          service_id: TEST_TARGET_REPLICA_ID,
          replica_id: TEST_TARGET_REPLICA_ID,
          service_type: PRIORITY_DRAIN_TEST_REMOTE_RELEASE_SERVICE_TYPE,
          partition_id: TEST_PARTITION_ID,
          node_id: PRIORITY_DRAIN_TEST_TARGET_NODE_ID,
          raft_role: PRIORITY_DRAIN_TEST_REMOTE_RELEASE_VOTER_ROLE,
          status: ReplicaStatus.ACTIVE,
          address: TEST_TARGET_ADDRESS,
        },
      ],
      replicaOperations: [
        {
          operation_id: TEST_OPERATION_ID,
          type: OperationType.REPLACE,
          partition_id: TEST_PARTITION_ID,
          replica_id: TEST_TARGET_REPLICA_ID,
          source_node_id: PRIORITY_DRAIN_TEST_SOURCE_NODE_ID,
          target_node_id: PRIORITY_DRAIN_TEST_TARGET_NODE_ID,
          status: ReplicaStatus.ACTIVE,
          workflow_step: WORKFLOW_STEP.ACTIVE,
          created_at: TEST_NOW_MS,
          updated_at: TEST_NOW_MS,
          completed_at: PRIORITY_DRAIN_TEST_NO_COMPLETED_AT,
          error_message: PRIORITY_DRAIN_TEST_NO_ERROR_MESSAGE,
          entity_type: PRIORITY_DRAIN_TEST_ENTITY_TYPE,
          entity_id: TEST_PARTITION_ID,
          steps_history: JSON.stringify([
            {
              step: WORKFLOW_STEP.PENDING,
              timestamp: TEST_NOW_MS,
              sourceReplicaId: TEST_SOURCE_REPLICA_ID,
            },
            {
              step: WORKFLOW_STEP.ACTIVE,
              timestamp: TEST_NOW_MS,
              previousStep: WORKFLOW_STEP.SYNCING,
            },
          ]),
        },
      ],
    },
  });

  try {
    coordinator.workflowOwner
      .getPriorityPublicationReplacementLeaderElectionEvidenceMap()
      .set(
        TEST_OPERATION_ID,
        Object.freeze({
          completedReplicaIds: Object.freeze([TEST_TARGET_REPLICA_ID]),
          notFoundReplicaIds: Object.freeze([]),
          observedAt: TEST_NOW_MS,
          replacementReplicaId: TEST_TARGET_REPLICA_ID,
          responseStatus: ReplicaOperationResponseStatus.COMPLETED,
        }),
      );

    const operation = await coordinator.getOperation(TEST_OPERATION_ID);
    const result = await coordinator.executeOperation(operation);
    const persistedOperation =
      await coordinator.getOperation(TEST_OPERATION_ID);

    t.equal(
      result.success,
      true,
      PRIORITY_DRAIN_TEST_FOLLOWER_ELECTION_DISPATCH_ASSERTION,
    );
    t.equal(
      deliveries[0]?.payload?.type,
      ReplicaOperationMessageType.REMOVE_REPLICA,
      PRIORITY_DRAIN_TEST_FOLLOWER_ELECTION_DISPATCH_ASSERTION,
    );
    t.equal(
      persistedOperation?.workflowStep,
      WORKFLOW_STEP.STOPPING,
      PRIORITY_DRAIN_TEST_FOLLOWER_ELECTION_STEP_ASSERTION,
    );
  } finally {
    await coordinator.shutdown();
  }
});

test('RebalanceCoordinator removes a non-publication priority REPLACE ' +
  'source follower once recovery is safe and the target is voter-ready',
async (t) => {
  const TEST_PARTITION_ID = 'replica_operations-p1';
  const TEST_SOURCE_REPLICA_ID = TEST_PARTITION_ID + '-r4';
  const TEST_TARGET_REPLICA_ID = TEST_PARTITION_ID + '-r6';
  const TEST_OPERATION_ID = 'priority-drain-follower-source-safe';
  const TEST_NOW_MS = Date.now();
  const TEST_SOURCE_ADDRESS =
    PRIORITY_DRAIN_TEST_SOURCE_NODE_ID + '/partition/' +
    TEST_SOURCE_REPLICA_ID;
  const TEST_TARGET_ADDRESS =
    PRIORITY_DRAIN_TEST_TARGET_NODE_ID + '/partition/' +
    TEST_TARGET_REPLICA_ID;
  const deliveries = [];
  const coordinator = createTestCoordinator({
    nodeId: PRIORITY_DRAIN_TEST_TARGET_NODE_ID,
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
    controlPlaneReadinessService:
      buildPriorityDrainReadinessService(TEST_PARTITION_ID),
    cacheData: {
      services: [
        {
          service_id: TEST_SOURCE_REPLICA_ID,
          replica_id: TEST_SOURCE_REPLICA_ID,
          service_type: PRIORITY_DRAIN_TEST_REMOTE_RELEASE_SERVICE_TYPE,
          partition_id: TEST_PARTITION_ID,
          node_id: PRIORITY_DRAIN_TEST_SOURCE_NODE_ID,
          raft_role: PRIORITY_DRAIN_TEST_REMOTE_RELEASE_VOTER_ROLE,
          status: ReplicaStatus.ACTIVE,
          address: TEST_SOURCE_ADDRESS,
        },
        {
          service_id: TEST_TARGET_REPLICA_ID,
          replica_id: TEST_TARGET_REPLICA_ID,
          service_type: PRIORITY_DRAIN_TEST_REMOTE_RELEASE_SERVICE_TYPE,
          partition_id: TEST_PARTITION_ID,
          node_id: PRIORITY_DRAIN_TEST_TARGET_NODE_ID,
          raft_role: PRIORITY_DRAIN_TEST_REMOTE_RELEASE_VOTER_ROLE,
          status: ReplicaStatus.ACTIVE,
          address: TEST_TARGET_ADDRESS,
        },
      ],
      replicaOperations: [
        {
          operation_id: TEST_OPERATION_ID,
          type: OperationType.REPLACE,
          partition_id: TEST_PARTITION_ID,
          replica_id: TEST_TARGET_REPLICA_ID,
          source_node_id: PRIORITY_DRAIN_TEST_SOURCE_NODE_ID,
          target_node_id: PRIORITY_DRAIN_TEST_TARGET_NODE_ID,
          status: ReplicaStatus.ACTIVE,
          workflow_step: WORKFLOW_STEP.ACTIVE,
          created_at: TEST_NOW_MS,
          updated_at: TEST_NOW_MS,
          completed_at: PRIORITY_DRAIN_TEST_NO_COMPLETED_AT,
          error_message: PRIORITY_DRAIN_TEST_NO_ERROR_MESSAGE,
          entity_type: PRIORITY_DRAIN_TEST_ENTITY_TYPE,
          entity_id: TEST_PARTITION_ID,
          steps_history: JSON.stringify([
            {
              step: WORKFLOW_STEP.PENDING,
              timestamp: TEST_NOW_MS,
              sourceReplicaId: TEST_SOURCE_REPLICA_ID,
            },
            {
              step: WORKFLOW_STEP.ACTIVE,
              timestamp: TEST_NOW_MS,
              previousStep: WORKFLOW_STEP.SYNCING,
            },
          ]),
        },
      ],
    },
  });

  try {
    const operation = await coordinator.getOperation(TEST_OPERATION_ID);
    const result = await coordinator.executeOperation(operation);
    const persistedOperation =
      await coordinator.getOperation(TEST_OPERATION_ID);

    t.equal(
      result.success,
      true,
      'safe priority follower source removal should dispatch',
    );
    t.equal(
      deliveries[0]?.payload?.type,
      ReplicaOperationMessageType.REMOVE_REPLICA,
      'safe priority follower source removal should not require target election',
    );
    t.equal(
      persistedOperation?.workflowStep,
      WORKFLOW_STEP.STOPPING,
      'safe priority follower source removal should advance to STOPPING',
    );
  } finally {
    await coordinator.shutdown();
  }
});

test('RebalanceCoordinator retires stale priority REPLACE STOPPING when ' +
  'priority recovery placement is converged and source removal is confirmed',
async (t) => {
  const TEST_PARTITION_ID = 'sql_transaction_participants-p1';
  const TEST_SOURCE_REPLICA_ID = TEST_PARTITION_ID + '-r3';
  const TEST_TARGET_REPLICA_ID = TEST_PARTITION_ID + '-r5';
  const TEST_OPERATION_ID = 'priority-drain-stopping-converged';
  const TEST_NOW_MS = Date.now();
  const deliveries = [];
  const coordinator = createTestCoordinator({
    nodeId: PRIORITY_DRAIN_TEST_TARGET_NODE_ID,
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
    controlPlaneReadinessService:
      buildPriorityDrainReadinessService(TEST_PARTITION_ID),
    cacheData: {
      replicaOperations: [
        {
          operation_id: TEST_OPERATION_ID,
          type: OperationType.REPLACE,
          partition_id: TEST_PARTITION_ID,
          replica_id: TEST_TARGET_REPLICA_ID,
          source_node_id: PRIORITY_DRAIN_TEST_SOURCE_NODE_ID,
          target_node_id: PRIORITY_DRAIN_TEST_TARGET_NODE_ID,
          status: ReplicaStatus.REMOVING,
          workflow_step: WORKFLOW_STEP.STOPPING,
          created_at: TEST_NOW_MS,
          updated_at: TEST_NOW_MS,
          completed_at: null,
          error_message: null,
          entity_type: PRIORITY_DRAIN_TEST_ENTITY_TYPE,
          entity_id: TEST_PARTITION_ID,
          steps_history: JSON.stringify([
            {
              step: WORKFLOW_STEP.PENDING,
              timestamp: TEST_NOW_MS,
              sourceReplicaId: TEST_SOURCE_REPLICA_ID,
            },
            {
              step: WORKFLOW_STEP.STOPPING,
              timestamp: TEST_NOW_MS,
              previousStep: WORKFLOW_STEP.ACTIVE,
            },
          ]),
        },
      ],
    },
  });

  try {
    coordinator.repository.getActualReplicaObservation = async () => ({
      state: STOPPING_REPLICA_OBSERVATION_STATE.ABSENT,
      source: 'authoritative',
    });

    coordinator.workflowOwner.incompleteOperationQueryEmptyBackoffMs = 0;
    await coordinator.checkTimeouts();
    const persistedOperation =
      await coordinator.getOperation(TEST_OPERATION_ID);

    t.equal(
      deliveries.length,
      0,
      'converged priority recovery drain should not replay source removal',
    );
    t.equal(
      persistedOperation?.workflowStep,
      WORKFLOW_STEP.REMOVED,
      'stale STOPPING priority replacement should become terminal',
    );
    t.equal(
      coordinator.workflowOwner.hasActiveTransitionRetryGrace(
        TEST_OPERATION_ID,
      ),
      false,
      'converged priority recovery drain should not leave retry grace armed',
    );
  } finally {
    await coordinator.shutdown();
  }
});

test('RebalanceCoordinator retires stale priority REPLACE STOPPING when ' +
  'spread is satisfied in flight and source removal is confirmed',
async (t) => {
  const TEST_PARTITION_ID = 'sql_transactions-p1';
  const TEST_SOURCE_REPLICA_ID = TEST_PARTITION_ID + '-r1';
  const TEST_TARGET_REPLICA_ID = TEST_PARTITION_ID + '-r4';
  const TEST_OPERATION_ID = 'priority-drain-stopping-spread-satisfied';
  const TEST_NOW_MS = Date.now();
  const deliveries = [];
  const coordinator = createTestCoordinator({
    nodeId: PRIORITY_DRAIN_TEST_TARGET_NODE_ID,
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
    controlPlaneReadinessService:
      buildPriorityDrainReadinessService(TEST_PARTITION_ID),
    cacheData: {
      replicaOperations: [
        {
          operation_id: TEST_OPERATION_ID,
          type: OperationType.REPLACE,
          partition_id: TEST_PARTITION_ID,
          replica_id: TEST_TARGET_REPLICA_ID,
          source_node_id: PRIORITY_DRAIN_TEST_SOURCE_NODE_ID,
          target_node_id: PRIORITY_DRAIN_TEST_TARGET_NODE_ID,
          status: ReplicaStatus.REMOVING,
          workflow_step: WORKFLOW_STEP.STOPPING,
          created_at: TEST_NOW_MS,
          updated_at: TEST_NOW_MS,
          completed_at: null,
          error_message: null,
          entity_type: PRIORITY_DRAIN_TEST_ENTITY_TYPE,
          entity_id: TEST_PARTITION_ID,
          steps_history: JSON.stringify([
            {
              step: WORKFLOW_STEP.PENDING,
              timestamp: TEST_NOW_MS,
              sourceReplicaId: TEST_SOURCE_REPLICA_ID,
            },
            {
              step: WORKFLOW_STEP.STOPPING,
              timestamp: TEST_NOW_MS,
              previousStep: WORKFLOW_STEP.ACTIVE,
            },
          ]),
        },
      ],
    },
  });

  try {
    coordinator.workflowOwner.buildPriorityRecoveryCompletionForOperation =
      () => Object.freeze({
        state:
          PRIORITY_RECOVERY_COMPLETION_STATE.SPREAD_SATISFIED_IN_FLIGHT,
        blocked: false,
      });
    coordinator.repository.getActualReplicaObservation = async () => ({
      state: STOPPING_REPLICA_OBSERVATION_STATE.ABSENT,
      source: 'authoritative',
    });

    coordinator.workflowOwner.incompleteOperationQueryEmptyBackoffMs = 0;
    await coordinator.checkTimeouts();
    const persistedOperation =
      await coordinator.getOperation(TEST_OPERATION_ID);

    t.equal(
      deliveries.length,
      0,
      'spread-satisfied priority recovery drain should not replay source removal',
    );
    t.equal(
      persistedOperation?.workflowStep,
      WORKFLOW_STEP.REMOVED,
      'source-confirmed STOPPING replacement should become terminal',
    );
  } finally {
    await coordinator.shutdown();
  }
});

test('RebalanceCoordinator keeps REPLACE STOPPING in progress when source ' +
  'removal visibility is unavailable', async (t) => {
  const deliveries = [];
  const messageRouter = {
    async deliver(target, payload) {
      deliveries.push({target, payload});
      if (payload.type === ReplicaOperationMessageType.CREATE_REPLICA) {
        return {
          acknowledged: true,
          status: ReplicaOperationResponseStatus.INITIATED,
        };
      }
      if (payload.type === ReplicaOperationMessageType.REMOVE_REPLICA) {
        return {
          acknowledged: true,
          status: ReplicaOperationResponseStatus.INITIATED,
        };
      }
      return {
        acknowledged: true,
        status: ReplicaOperationResponseStatus.IN_PROGRESS,
      };
    },
  };
  const coordinator = createTestCoordinator({
    nodeId: 'seed-node',
    enableTimeouts: false,
    messageRouter,
    storageAdmissionService: {
      async checkReplace() {
        return {
          allowed: true,
          decision: 'allow',
          decisionType: 'admitted',
        };
      },
    },
    storageAccountingService: {
      estimateReplicaBytes() {
        return 0;
      },
    },
    cacheData: {
      services: [
        {
          service_id: 'mg-1-r1',
          replica_id: 'mg-1-r1',
          service_type: 'message_group',
          group_id: 'mg-1',
          node_id: 'seed-node',
          status: 'active',
          address: 'seed-node/message-group/mg-1-r1',
        },
        {
          service_id: 'mg-1-r2',
          replica_id: 'mg-1-r2',
          service_type: 'message_group',
          group_id: 'mg-1',
          node_id: 'node-2',
          status: 'active',
          address: 'node-2/message-group/mg-1-r2',
        },
      ],
    },
  });

  try {
    const operation = await coordinator.createOperation({
      type: OperationType.REPLACE,
      partitionId: 'mg-1',
      entityType: 'message_group',
      entityId: 'mg-1',
      nodeId: 'node-3',
      sourceNodeId: 'seed-node',
      replicaId: 'mg-1-r1',
    });

    await coordinator.executeOperation(operation);
    await coordinator.updateStep(operation, WORKFLOW_STEP.ACTIVE);
    await coordinator.executeOperation(operation);

    t.equal(
      operation.workflowStep,
      WORKFLOW_STEP.STOPPING,
      'remove dispatch should place REPLACE in STOPPING',
    );

    coordinator.repository.getActualReplicaObservation = async (replicaId) => {
      if (replicaId === 'mg-1-r1') {
        return {
          state: STOPPING_REPLICA_OBSERVATION_STATE.UNAVAILABLE,
          source: 'unavailable',
        };
      }
      return {
        state: STOPPING_REPLICA_OBSERVATION_STATE.OBSERVED,
        source: 'authoritative',
        lifecycleStatus: ReplicaStatus.ACTIVE,
      };
    };

    coordinator.workflowOwner.incompleteOperationQueryEmptyBackoffMs = 0;
    await coordinator.checkTimeouts();
    const persistedOperation =
      await coordinator.getOperation(operation.operationId);

    t.equal(
      deliveries.length,
      2,
      'owner should not invent a completion or replay another remove while visibility is unresolved',
    );
    t.equal(
      persistedOperation?.workflowStep,
      WORKFLOW_STEP.STOPPING,
      'timeout reconciliation should preserve STOPPING when source-removal visibility is unavailable',
    );
  } finally {
    await coordinator.shutdown();
  }
});

test('RebalanceCoordinator defers critical REPLACE STOPPING timeout when ' +
  'source-removal visibility is unavailable', async (t) => {
  const TEST_PARTITION_ID = 'replica_operations-p1';
  const TEST_ENTITY_TYPE = 'partition';
  const TEST_SOURCE_NODE_ID = 'seed-node';
  const TEST_TARGET_NODE_ID = 'node-2';
  const TEST_REPLACEMENT_NODE_ID = 'node-3';
  const TEST_SOURCE_REPLICA_ID = TEST_PARTITION_ID + '-r1';
  const TEST_EXISTING_REPLICA_ID = TEST_PARTITION_ID + '-r2';
  const TEST_TARGET_REPLICA_ID = TEST_PARTITION_ID + '-r4';
  const TEST_OPERATION_ID = 'critical-stopping-visibility-deferred';
  const TEST_ADDRESS_PREFIX = '/partition/';
  const TEST_TIMEOUT_MS = 0;
  const TEST_NOW_MS = Date.now();
  const deliveries = [];
  const messageRouter = {
    async deliver(target, payload) {
      deliveries.push({target, payload});
      if (payload.type === ReplicaOperationMessageType.CREATE_REPLICA) {
        return {
          acknowledged: true,
          status: ReplicaOperationResponseStatus.INITIATED,
        };
      }
      if (payload.type === ReplicaOperationMessageType.REMOVE_REPLICA) {
        return {
          acknowledged: true,
          status: ReplicaOperationResponseStatus.INITIATED,
        };
      }
      return {
        acknowledged: true,
        status: ReplicaOperationResponseStatus.IN_PROGRESS,
      };
    },
  };
  const coordinator = createTestCoordinator({
    nodeId: TEST_REPLACEMENT_NODE_ID,
    enableTimeouts: false,
    messageRouter,
    storageAdmissionService: {
      async checkReplace() {
        return {
          allowed: true,
          decision: 'allow',
          decisionType: 'admitted',
        };
      },
    },
    storageAccountingService: {
      estimateReplicaBytes() {
        return TEST_TIMEOUT_MS;
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
          address: TEST_SOURCE_NODE_ID + TEST_ADDRESS_PREFIX +
            TEST_SOURCE_REPLICA_ID,
        },
        {
          service_id: TEST_EXISTING_REPLICA_ID,
          replica_id: TEST_EXISTING_REPLICA_ID,
          service_type: TEST_ENTITY_TYPE,
          partition_id: TEST_PARTITION_ID,
          node_id: TEST_TARGET_NODE_ID,
          status: ReplicaStatus.ACTIVE,
          address: TEST_TARGET_NODE_ID + TEST_ADDRESS_PREFIX +
            TEST_EXISTING_REPLICA_ID,
        },
      ],
      replicaOperations: [
        {
          operation_id: TEST_OPERATION_ID,
          type: OperationType.REPLACE,
          partition_id: TEST_PARTITION_ID,
          replica_id: TEST_TARGET_REPLICA_ID,
          source_node_id: TEST_SOURCE_NODE_ID,
          target_node_id: TEST_REPLACEMENT_NODE_ID,
          status: ReplicaStatus.REMOVING,
          workflow_step: WORKFLOW_STEP.STOPPING,
          created_at: TEST_NOW_MS,
          updated_at: TEST_NOW_MS,
          completed_at: null,
          error_message: null,
          entity_type: TEST_ENTITY_TYPE,
          entity_id: TEST_PARTITION_ID,
          steps_history: JSON.stringify([
            {
              step: WORKFLOW_STEP.PENDING,
              timestamp: TEST_NOW_MS,
              sourceReplicaId: TEST_SOURCE_REPLICA_ID,
            },
            {
              step: WORKFLOW_STEP.STOPPING,
              timestamp: TEST_NOW_MS,
              previousStep: WORKFLOW_STEP.ACTIVE,
            },
          ]),
        },
      ],
    },
  });

  try {
    coordinator.config.removingTimeoutMs = TEST_TIMEOUT_MS;
    coordinator.repository.getActualReplicaObservation = async (replicaId) => {
      if (replicaId === TEST_SOURCE_REPLICA_ID) {
        return {
          state: STOPPING_REPLICA_OBSERVATION_STATE.UNAVAILABLE,
          source: STOPPING_REPLICA_OBSERVATION_STATE.UNAVAILABLE,
        };
      }
      return {
        state: STOPPING_REPLICA_OBSERVATION_STATE.OBSERVED,
        source: 'authoritative',
        lifecycleStatus: ReplicaStatus.ACTIVE,
      };
    };

    coordinator.workflowOwner.incompleteOperationQueryEmptyBackoffMs =
      TEST_TIMEOUT_MS;
    await coordinator.checkTimeouts();
    const persistedOperation =
      await coordinator.getOperation(TEST_OPERATION_ID);

    t.equal(
      deliveries.length,
      0,
      'unavailable visibility should not redispatch before retry wakes',
    );
    t.equal(
      persistedOperation?.workflowStep,
      WORKFLOW_STEP.STOPPING,
      'timeout reconciliation should preserve STOPPING during retryable visibility pressure',
    );
    t.equal(
      persistedOperation?.status,
      ReplicaStatus.REMOVING,
      'timeout reconciliation should not fail a critical STOPPING row under visibility pressure',
    );
    t.equal(
      coordinator.workflowOwner.hasActiveTransitionRetryGrace(
        TEST_OPERATION_ID,
      ),
      true,
      'critical STOPPING visibility pressure should arm transition retry grace',
    );
  } finally {
    await coordinator.shutdown();
  }
});
}
