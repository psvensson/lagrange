import {test} from '../../src/test-helpers/tap.js';
import {WORKFLOW_STEP} from '../../src/constants/index.js';
import {
  SYSTEM_TABLE_NAME,
} from '../../src/bootstrap/system-table-schemas-constants.js';
import {
  OperationType,
  ReplicaStatus,
} from '../../src/rebalancer/replica-status.js';
import {
  ReplicaOperationMessageType,
  ReplicaOperationResponseStatus,
} from '../../src/rebalancer/replica-operation-constants.js';
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
    getPriorityRecoveryPlanningAnswerBestEffort() {
      return planningSnapshot;
    },
  });
}

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

test('RebalanceCoordinator re-dispatches REPLACE STOPPING remove phase ' +
  'while source replica remains active', async (t) => {
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
      WORKFLOW_STEP.REMOVED,
      'STOPPING reconciliation should complete when replayed remove returns completed',
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

test('RebalanceCoordinator dispatches source removal instead of draining a ' +
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
      'source-present priority recovery drain should dispatch source removal',
    );
    t.equal(
      deliveries[0]?.payload?.type,
      ReplicaOperationMessageType.REMOVE_REPLICA,
      'source-present priority recovery drain should dispatch remove work',
    );
    t.equal(
      persistedOperation?.workflowStep,
      WORKFLOW_STEP.STOPPING,
      'source-present priority replacement should advance to stopping',
    );
    t.equal(
      persistedOperation?.status,
      ReplicaStatus.REMOVING,
      'source-present priority replacement should persist removing status',
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
