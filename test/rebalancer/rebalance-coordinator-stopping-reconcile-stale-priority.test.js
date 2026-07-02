import {OperationType, PRIORITY_DRAIN_TEST_AUTHORITATIVE_SOURCE, PRIORITY_DRAIN_TEST_ENTITY_TYPE, PRIORITY_DRAIN_TEST_NO_COMPLETED_AT, PRIORITY_DRAIN_TEST_NO_ERROR_MESSAGE, PRIORITY_DRAIN_TEST_SOURCE_NODE_ID, PRIORITY_DRAIN_TEST_STALE_TARGET_NODE_ID, PRIORITY_DRAIN_TEST_TARGET_NODE_ID, PRIORITY_RECOVERY_COMPLETION_STATE, RAFT_ROLE, ReplicaOperationResponseStatus, ReplicaStatus, STOPPING_REPLICA_OBSERVATION_STATE, WORKFLOW_STEP, buildPriorityDrainOwnerUnavailableReadinessService, buildPriorityDrainReadinessService, buildPriorityDrainSupersededReadinessService, createTestCoordinator, test} from './rebalance-coordinator-stopping-reconcile-fixtures.js';

const PRIORITY_DRAIN_TEST_STALE_STEP_AGE_MS = 10 * 60 * 1000;

function buildPriorityDrainReplaceOperationRow(options) {
  const stepTimestampMs = options.stepTimestampMs;
  const workflowStep = options.workflowStep || WORKFLOW_STEP.SENDING;
  const stepsHistory = [
    {
      step: WORKFLOW_STEP.PENDING,
      timestamp: stepTimestampMs,
      sourceReplicaId: options.sourceReplicaId,
    },
  ];
  if (workflowStep !== WORKFLOW_STEP.PENDING) {
    stepsHistory.push({
      step: workflowStep,
      timestamp: stepTimestampMs,
      previousStep: WORKFLOW_STEP.PENDING,
    });
  }
  return {
    operation_id: options.operationId,
    type: OperationType.REPLACE,
    partition_id: options.partitionId,
    replica_id: options.targetReplicaId,
    source_node_id: PRIORITY_DRAIN_TEST_SOURCE_NODE_ID,
    target_node_id: options.targetNodeId || PRIORITY_DRAIN_TEST_TARGET_NODE_ID,
    status: ReplicaStatus.PENDING,
    workflow_step: workflowStep,
    created_at: stepTimestampMs,
    updated_at: stepTimestampMs,
    completed_at: PRIORITY_DRAIN_TEST_NO_COMPLETED_AT,
    error_message: PRIORITY_DRAIN_TEST_NO_ERROR_MESSAGE,
    entity_type: PRIORITY_DRAIN_TEST_ENTITY_TYPE,
    entity_id: options.partitionId,
    steps_history: JSON.stringify(stepsHistory),
  };
}

test('RebalanceCoordinator holds a FRESH priority REPLACE SENDING with an ' +
  'unmaterialized target even when priority recovery placement is converged',
async (t) => {
  const TEST_PARTITION_ID = 'replica_operations-p1';
  const TEST_SOURCE_REPLICA_ID = TEST_PARTITION_ID + '-r2';
  const TEST_TARGET_REPLICA_ID = TEST_PARTITION_ID + '-r5';
  const TEST_OPERATION_ID = 'priority-drain-sending-converged-fresh';
  const TEST_NOW_MS = Date.now();
  const coordinator = createTestCoordinator({
    nodeId: PRIORITY_DRAIN_TEST_TARGET_NODE_ID,
    enableTimeouts: false,
    controlPlaneReadinessService:
      buildPriorityDrainReadinessService(TEST_PARTITION_ID),
    cacheData: {
      replicaOperations: [
        buildPriorityDrainReplaceOperationRow({
          operationId: TEST_OPERATION_ID,
          partitionId: TEST_PARTITION_ID,
          sourceReplicaId: TEST_SOURCE_REPLICA_ID,
          targetReplicaId: TEST_TARGET_REPLICA_ID,
          stepTimestampMs: TEST_NOW_MS,
        }),
      ],
    },
  });

  try {
    const operation = await coordinator.getOperation(TEST_OPERATION_ID);
    const reconciled =
      await coordinator.workflowOwner.reconcilePriorityRecoveryOperationDrain(
        operation,
      );
    const persistedOperation =
      await coordinator.getOperation(TEST_OPERATION_ID);

    t.equal(
      reconciled,
      false,
      'fresh unmaterialized-target replacement must be held, not settled',
    );
    t.equal(
      persistedOperation?.workflowStep,
      WORKFLOW_STEP.SENDING,
      'fresh SENDING priority replacement should preserve its in-flight step',
    );
  } finally {
    await coordinator.shutdown();
  }
});

test('RebalanceCoordinator fails (never completes) a STALE priority ' +
  'REPLACE SENDING with an unmaterialized target and a live source replica',
async (t) => {
  const TEST_PARTITION_ID = 'replica_operations-p1';
  const TEST_SOURCE_REPLICA_ID = TEST_PARTITION_ID + '-r2';
  const TEST_TARGET_REPLICA_ID = TEST_PARTITION_ID + '-r5';
  const TEST_OPERATION_ID = 'priority-drain-sending-converged-stale';
  const TEST_NOW_MS = Date.now();
  const TEST_STALE_TIMESTAMP_MS =
    TEST_NOW_MS - PRIORITY_DRAIN_TEST_STALE_STEP_AGE_MS;
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
          status: ReplicaStatus.ACTIVE,
          address: PRIORITY_DRAIN_TEST_SOURCE_NODE_ID + '/partition/' +
            TEST_SOURCE_REPLICA_ID,
        },
      ],
      replicaOperations: [
        buildPriorityDrainReplaceOperationRow({
          operationId: TEST_OPERATION_ID,
          partitionId: TEST_PARTITION_ID,
          sourceReplicaId: TEST_SOURCE_REPLICA_ID,
          targetReplicaId: TEST_TARGET_REPLICA_ID,
          stepTimestampMs: TEST_STALE_TIMESTAMP_MS,
        }),
      ],
    },
  });

  try {
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
      'stale unmaterialized-target replacement should settle',
    );
    t.equal(
      deliveries.length,
      0,
      'stale drain settle should not dispatch replica work',
    );
    t.not(
      persistedOperation?.workflowStep,
      WORKFLOW_STEP.REMOVED,
      'a REPLACE with a live source must never terminalize as REMOVED ' +
        'without retirement evidence',
    );
    t.equal(
      persistedOperation?.workflowStep,
      WORKFLOW_STEP.FAILED,
      'stale SENDING priority replacement should settle as FAILED',
    );
    t.equal(
      persistedOperation?.status,
      ReplicaStatus.FAILED,
      'stale SENDING priority replacement should persist failed status',
    );
  } finally {
    await coordinator.shutdown();
  }
});

test('RebalanceCoordinator never completes a priority REPLACE off ' +
  'authoritative source absence before a removal was dispatched', async (t) => {
  const TEST_PARTITION_ID = 'replica_operations-p1';
  const TEST_SOURCE_REPLICA_ID = TEST_PARTITION_ID + '-r2';
  const TEST_TARGET_REPLICA_ID = TEST_PARTITION_ID + '-r5';
  const TEST_OPERATION_ID = 'priority-drain-creating-source-absent';
  const TEST_NOW_MS = Date.now();
  const TEST_TARGET_ADDRESS =
    PRIORITY_DRAIN_TEST_TARGET_NODE_ID + '/partition/' +
    TEST_TARGET_REPLICA_ID;
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
          status: ReplicaStatus.CREATING,
          raft_role: RAFT_ROLE.FOLLOWER,
          address: TEST_TARGET_ADDRESS,
        },
      ],
      replicaOperations: [
        buildPriorityDrainReplaceOperationRow({
          operationId: TEST_OPERATION_ID,
          partitionId: TEST_PARTITION_ID,
          sourceReplicaId: TEST_SOURCE_REPLICA_ID,
          targetReplicaId: TEST_TARGET_REPLICA_ID,
          workflowStep: WORKFLOW_STEP.CREATING,
          stepTimestampMs: TEST_NOW_MS,
        }),
      ],
    },
  });

  try {
    coordinator.repository.getActualReplicaObservation = async () => ({
      state: STOPPING_REPLICA_OBSERVATION_STATE.ABSENT,
      source: PRIORITY_DRAIN_TEST_AUTHORITATIVE_SOURCE,
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
      false,
      'source absence before a dispatched removal is not retirement ' +
        'evidence and must not settle the drain',
    );
    t.equal(
      persistedOperation?.workflowStep,
      WORKFLOW_STEP.CREATING,
      'pre-removal priority replacement should preserve its in-flight step',
    );
  } finally {
    await coordinator.shutdown();
  }
});

function buildPriorityDrainPendingTargetAbsentCoordinator(options) {
  const partitionId = options.partitionId;
  const sourceReplicaId = options.sourceReplicaId;
  return createTestCoordinator({
    nodeId: PRIORITY_DRAIN_TEST_SOURCE_NODE_ID,
    enableTimeouts: false,
    messageRouter: {
      async deliver(target, payload) {
        options.deliveries.push({target, payload});
        return {
          acknowledged: true,
          status: ReplicaOperationResponseStatus.INITIATED,
        };
      },
    },
    controlPlaneReadinessService: options.controlPlaneReadinessService,
    cacheData: {
      services: [
        {
          service_id: sourceReplicaId,
          replica_id: sourceReplicaId,
          service_type: PRIORITY_DRAIN_TEST_ENTITY_TYPE,
          partition_id: partitionId,
          node_id: PRIORITY_DRAIN_TEST_SOURCE_NODE_ID,
          status: ReplicaStatus.ACTIVE,
          address: PRIORITY_DRAIN_TEST_SOURCE_NODE_ID + '/partition/' +
            sourceReplicaId,
        },
      ],
      replicaOperations: [
        buildPriorityDrainReplaceOperationRow({
          operationId: options.operationId,
          partitionId,
          sourceReplicaId,
          targetReplicaId: options.targetReplicaId,
          workflowStep: WORKFLOW_STEP.PENDING,
          stepTimestampMs: options.stepTimestampMs,
        }),
      ],
    },
  });
}

test('RebalanceCoordinator holds a FRESH remote-owned priority REPLACE ' +
  'PENDING with an unmaterialized target when spread is satisfied in flight',
async (t) => {
  const TEST_PARTITION_ID = 'replica_operations-p1';
  const TEST_SOURCE_REPLICA_ID = TEST_PARTITION_ID + '-r2';
  const TEST_TARGET_REPLICA_ID = TEST_PARTITION_ID + '-r7';
  const TEST_OPERATION_ID = 'priority-drain-remote-pending-fresh';
  const TEST_NOW_MS = Date.now();
  const deliveries = [];
  const coordinator = buildPriorityDrainPendingTargetAbsentCoordinator({
    partitionId: TEST_PARTITION_ID,
    sourceReplicaId: TEST_SOURCE_REPLICA_ID,
    targetReplicaId: TEST_TARGET_REPLICA_ID,
    operationId: TEST_OPERATION_ID,
    stepTimestampMs: TEST_NOW_MS,
    deliveries,
    controlPlaneReadinessService:
      buildPriorityDrainReadinessService(TEST_PARTITION_ID),
  });

  try {
    coordinator.workflowOwner.buildPriorityRecoveryCompletionForOperation =
      () => Object.freeze({
        state:
          PRIORITY_RECOVERY_COMPLETION_STATE.SPREAD_SATISFIED_IN_FLIGHT,
        blocked: false,
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
      false,
      'a fresh op whose own in-flight placement may satisfy spread must ' +
        'not be settled',
    );
    t.equal(
      persistedOperation?.workflowStep,
      WORKFLOW_STEP.PENDING,
      'fresh PENDING priority replacement should preserve its step',
    );
  } finally {
    await coordinator.shutdown();
  }
});

test('RebalanceCoordinator fails (never completes) a STALE remote-owned ' +
  'priority REPLACE PENDING with an unmaterialized target when the owner ' +
  'is unavailable', async (t) => {
  const TEST_PARTITION_ID = 'replica_operations-p1';
  const TEST_SOURCE_REPLICA_ID = TEST_PARTITION_ID + '-r2';
  const TEST_TARGET_REPLICA_ID = TEST_PARTITION_ID + '-r7';
  const TEST_OPERATION_ID = 'priority-drain-remote-pending-stale';
  const TEST_NOW_MS = Date.now();
  const TEST_STALE_TIMESTAMP_MS =
    TEST_NOW_MS - PRIORITY_DRAIN_TEST_STALE_STEP_AGE_MS;
  const deliveries = [];
  const coordinator = buildPriorityDrainPendingTargetAbsentCoordinator({
    partitionId: TEST_PARTITION_ID,
    sourceReplicaId: TEST_SOURCE_REPLICA_ID,
    targetReplicaId: TEST_TARGET_REPLICA_ID,
    operationId: TEST_OPERATION_ID,
    stepTimestampMs: TEST_STALE_TIMESTAMP_MS,
    deliveries,
    controlPlaneReadinessService:
      buildPriorityDrainOwnerUnavailableReadinessService(
        TEST_PARTITION_ID,
        PRIORITY_DRAIN_TEST_TARGET_NODE_ID,
      ),
  });

  try {
    coordinator.workflowOwner.buildPriorityRecoveryCompletionForOperation =
      () => Object.freeze({
        state:
          PRIORITY_RECOVERY_COMPLETION_STATE.SPREAD_SATISFIED_IN_FLIGHT,
        blocked: false,
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
      'stale undispatched replacement with an unavailable owner should settle',
    );
    t.equal(
      deliveries.length,
      0,
      'stale drain settle should not remove the source replica',
    );
    t.not(
      persistedOperation?.workflowStep,
      WORKFLOW_STEP.REMOVED,
      'a REPLACE with a live ACTIVE source must never terminalize as REMOVED',
    );
    t.equal(
      persistedOperation?.workflowStep,
      WORKFLOW_STEP.FAILED,
      'stale PENDING priority replacement should settle as FAILED',
    );
    t.equal(
      persistedOperation?.status,
      ReplicaStatus.FAILED,
      'stale PENDING priority replacement should persist failed status',
    );
  } finally {
    await coordinator.shutdown();
  }
});

test('RebalanceCoordinator does not remotely fail a STALE priority ' +
  'REPLACE PENDING while its owner is still available', async (t) => {
  const TEST_PARTITION_ID = 'replica_operations-p1';
  const TEST_SOURCE_REPLICA_ID = TEST_PARTITION_ID + '-r2';
  const TEST_TARGET_REPLICA_ID = TEST_PARTITION_ID + '-r7';
  const TEST_OPERATION_ID = 'priority-drain-remote-pending-stale-owner-alive';
  const TEST_NOW_MS = Date.now();
  const TEST_STALE_TIMESTAMP_MS =
    TEST_NOW_MS - PRIORITY_DRAIN_TEST_STALE_STEP_AGE_MS;
  const deliveries = [];
  const coordinator = buildPriorityDrainPendingTargetAbsentCoordinator({
    partitionId: TEST_PARTITION_ID,
    sourceReplicaId: TEST_SOURCE_REPLICA_ID,
    targetReplicaId: TEST_TARGET_REPLICA_ID,
    operationId: TEST_OPERATION_ID,
    stepTimestampMs: TEST_STALE_TIMESTAMP_MS,
    deliveries,
    controlPlaneReadinessService:
      buildPriorityDrainReadinessService(TEST_PARTITION_ID),
  });

  try {
    coordinator.workflowOwner.buildPriorityRecoveryCompletionForOperation =
      () => Object.freeze({
        state:
          PRIORITY_RECOVERY_COMPLETION_STATE.SPREAD_SATISFIED_IN_FLIGHT,
        blocked: false,
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
      false,
      'an available owner may hold deferred progress; the non-owner must ' +
        'wake it, not kill its work',
    );
    t.equal(
      persistedOperation?.workflowStep,
      WORKFLOW_STEP.PENDING,
      'stale PENDING replacement with a live owner should stay held here',
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
    const reconcileResult =
      await coordinator.workflowOwner.reconcileOperationProgress(operation);
    const persistedOperation =
      await coordinator.getOperation(TEST_OPERATION_ID);

    t.equal(
      reconcileResult,
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
    const reconcileResult =
      await coordinator.workflowOwner.reconcileOperationProgress(operation);
    const persistedOperation =
      await coordinator.getOperation(TEST_OPERATION_ID);

    t.equal(
      reconcileResult,
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
