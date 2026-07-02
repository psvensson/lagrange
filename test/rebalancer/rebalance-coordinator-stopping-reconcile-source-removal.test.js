import {
  OPERATION_WORKFLOW_OWNER_SHARED,
  OperationType,
  PRIORITY_DRAIN_TEST_ENTITY_TYPE,
  PRIORITY_DRAIN_TEST_NO_COMPLETED_AT,
  PRIORITY_DRAIN_TEST_NO_ERROR_MESSAGE,
  ReplicaOperationMessageType,
  ReplicaOperationResponseStatus,
  ReplicaStatus,
  STOPPING_REPLICA_OBSERVATION_STATE,
  SYSTEM_TABLE_NAME,
  WORKFLOW_STEP,
  createTestCoordinator,
  test,
} from './rebalance-coordinator-stopping-reconcile-fixtures.js';

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

      const reconcileResult =
        await coordinator.workflowOwner.reconcileOperationProgress(operation);
      const persistedOperation =
        await coordinator.getOperation(operation.operationId);

      t.equal(
        reconcileResult,
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
    const reconcileResult =
      await coordinator.workflowOwner.reconcileOperationProgress(operation);
    const persistedOperation =
      await coordinator.getOperation(TEST_OPERATION_ID);

    t.equal(
      reconcileResult,
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
    const reconcileResult =
      await coordinator.workflowOwner.reconcileOperationProgress(operation);
    const persistedOperation =
      await coordinator.getOperation(TEST_OPERATION_ID);

    t.equal(
      reconcileResult,
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
