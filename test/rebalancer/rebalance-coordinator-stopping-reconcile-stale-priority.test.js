import {buildDeliveryEnvelope} from '../../src/transport/transport-semantic-outcome.js';
import {initiatedDeliveryRouter, OperationType, PRIORITY_DRAIN_TEST_AUTHORITATIVE_SOURCE, PRIORITY_DRAIN_TEST_ENTITY_TYPE, PRIORITY_DRAIN_TEST_NO_COMPLETED_AT, PRIORITY_DRAIN_TEST_NO_ERROR_MESSAGE, PRIORITY_DRAIN_TEST_SOURCE_NODE_ID, PRIORITY_DRAIN_TEST_STALE_TARGET_NODE_ID, PRIORITY_DRAIN_TEST_TARGET_NODE_ID, PRIORITY_RECOVERY_COMPLETION_STATE, RAFT_ROLE, ReplicaOperationResponseStatus, ReplicaStatus, STOPPING_REPLICA_OBSERVATION_STATE, WORKFLOW_STEP, buildPriorityDrainOwnerUnavailableReadinessService, buildPriorityDrainReadinessService, buildPriorityDrainSupersededReadinessService, createTestCoordinator, test} from './rebalance-coordinator-stopping-reconcile-fixtures.js';

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
    messageRouter: initiatedDeliveryRouter(deliveries),
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
        return buildDeliveryEnvelope({acknowledged: true}, {
          status: ReplicaOperationResponseStatus.INITIATED,
        });
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
    messageRouter: initiatedDeliveryRouter(deliveries),
    controlPlaneReadinessService:
      buildPriorityDrainOwnerUnavailableReadinessService(
        TEST_PARTITION_ID,
        PRIORITY_DRAIN_TEST_SOURCE_NODE_ID,
      ),
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
          created_at: TEST_NOW_MS,
          state_entered_at: TEST_NOW_MS,
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
    messageRouter: initiatedDeliveryRouter(deliveries),
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
    messageRouter: initiatedDeliveryRouter(deliveries),
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

async function runPriorityAddAuthoritativeDrainProbe(options) {
  const partitionId = 'sql_transactions-p1';
  const replicaId = partitionId + '-r6';
  const operationId = 'priority-drain-add-auth-probe';
  const stepTimestampMs = Date.now() - PRIORITY_DRAIN_TEST_STALE_STEP_AGE_MS;
  const cachedActiveTarget = {
    service_id: replicaId,
    replica_id: replicaId,
    service_type: PRIORITY_DRAIN_TEST_ENTITY_TYPE,
    node_id: PRIORITY_DRAIN_TEST_TARGET_NODE_ID,
    partition_id: partitionId,
    status: ReplicaStatus.ACTIVE,
    raft_role: RAFT_ROLE.FOLLOWER,
    address: PRIORITY_DRAIN_TEST_TARGET_NODE_ID + '/partition/' + replicaId,
    created_at: stepTimestampMs,
    state_entered_at: stepTimestampMs,
  };
  const deliveries = [];
  const coordinator = createTestCoordinator({
    nodeId: options.localOwner ?
      PRIORITY_DRAIN_TEST_SOURCE_NODE_ID :
      PRIORITY_DRAIN_TEST_TARGET_NODE_ID,
    enableTimeouts: false,
    messageRouter: initiatedDeliveryRouter(deliveries),
    controlPlaneReadinessService: options.ownerUnavailable ?
      buildPriorityDrainOwnerUnavailableReadinessService(
        partitionId, PRIORITY_DRAIN_TEST_SOURCE_NODE_ID) :
      buildPriorityDrainReadinessService(partitionId),
    cacheData: {
      services: options.emptyCache ? [] : [cachedActiveTarget],
      replicaOperations: [{
        operation_id: operationId,
        type: OperationType.ADD,
        partition_id: partitionId,
        replica_id: replicaId,
        source_node_id: PRIORITY_DRAIN_TEST_SOURCE_NODE_ID,
        target_node_id: PRIORITY_DRAIN_TEST_TARGET_NODE_ID,
        status: ReplicaStatus.PENDING,
        workflow_step: WORKFLOW_STEP.SENDING,
        created_at: stepTimestampMs,
        updated_at: stepTimestampMs,
        completed_at: PRIORITY_DRAIN_TEST_NO_COMPLETED_AT,
        error_message: PRIORITY_DRAIN_TEST_NO_ERROR_MESSAGE,
        entity_type: PRIORITY_DRAIN_TEST_ENTITY_TYPE,
        entity_id: partitionId,
        steps_history: JSON.stringify([
          {step: WORKFLOW_STEP.PENDING, timestamp: stepTimestampMs},
          {
            step: WORKFLOW_STEP.SENDING,
            timestamp: stepTimestampMs,
            previousStep: WORKFLOW_STEP.PENDING,
          },
        ]),
      }],
    },
  });
  try {
    const completion = Object.freeze({state: options.completionState});
    coordinator.workflowOwner.buildPriorityRecoveryCompletionForOperation =
      () => completion;
    coordinator.workflowOwner.buildPriorityRecoveryAssessmentContextForOperation =
      () => Object.freeze({completion});
    if (options.stubObservation) {
      coordinator.repository.getActualReplicaObservation = async () =>
        options.stubObservation({cachedActiveTarget, replicaId, partitionId});
    } else if (options.stubObservedRow) {
      coordinator.repository.readAuthoritativeReplicaRowForObservation =
        async () => ({
          observedRow: options.stubObservedRow({
            cachedActiveTarget, replicaId, partitionId,
          }),
          authoritativeReadAttempted: true,
          authoritativeReadFailed: false,
        });
    } else {
      const baseRead = coordinator.controlPlaneSystemTableGateway
        .readAuthoritativeRows.bind(coordinator.controlPlaneSystemTableGateway);
      coordinator.controlPlaneSystemTableGateway.readAuthoritativeRows =
        async (tableName, sql, params) => {
          if (sql.includes('FROM services')) {
            return options.readServices({
              cachedActiveTarget, replicaId, partitionId,
            });
          }
          return baseRead(tableName, sql, params);
        };
    }
    const operation = await coordinator.getOperation(operationId);
    const decisionSnapshot = Object.freeze({completion});
    const snapshot = options.entrypoint === 'dispatch_pending' ?
      await coordinator.workflowOwner
        .buildPriorityRecoveryDispatchPendingDrainSnapshot(
          operation, decisionSnapshot) :
      await coordinator.workflowOwner
        .buildPriorityRecoveryOperationDrainSnapshot(operation);
    const settled = options.entrypoint === 'dispatch_pending' ?
      await coordinator.workflowOwner
        .reconcilePriorityRecoveryDispatchPendingDrain(
          operation, decisionSnapshot) :
      await coordinator.workflowOwner
        .reconcilePriorityRecoveryOperationDrain(operation, snapshot);
    const persisted = await coordinator.getOperation(operationId);
    return {snapshot, settled, persisted};
  } finally {
    await coordinator.shutdown();
  }
}

test('priority ADD drain refuses cache fallback across CONVERGED and dead-owner ' +
  'paths and completes only on authoritative exact-target ACTIVE under valid ownership',
async (t) => {
  const nonCompletingAuthoritativeCases = [
    {
      label: 'authoritative failure',
      readServices: async () => ({success: false, error: 'authority_unavailable'}),
    },
    {
      label: 'authoritative throw',
      readServices: async () => {
        throw new Error('services authority unreachable');
      },
    },
    {
      label: 'authoritative CREATING',
      readServices: async ({cachedActiveTarget}) => ({
        success: true,
        rows: [{...cachedActiveTarget, status: ReplicaStatus.CREATING}],
      }),
    },
    {
      label: 'authoritative ACTIVE on wrong node_id',
      readServices: async ({cachedActiveTarget}) => ({
        success: true,
        rows: [{...cachedActiveTarget, node_id: 'other-node-99'}],
      }),
    },
    {
      label: 'authoritative ACTIVE on wrong partition_id',
      readServices: async ({cachedActiveTarget}) => ({
        success: true,
        rows: [{...cachedActiveTarget, partition_id: 'other-partition-p1'}],
      }),
    },
    {
      label: 'authoritative ACTIVE on wrong replica_id',
      readServices: async ({cachedActiveTarget}) => ({
        success: true,
        rows: [{
          ...cachedActiveTarget,
          service_id: 'other-replica-r99',
          replica_id: 'other-replica-r99',
        }],
      }),
    },
  ];

  for (const completionState of [
    PRIORITY_RECOVERY_COMPLETION_STATE.CONVERGED,
    PRIORITY_RECOVERY_COMPLETION_STATE.BLOCKED,
  ]) {
    for (const testCase of nonCompletingAuthoritativeCases) {
      const out = await runPriorityAddAuthoritativeDrainProbe({
        completionState,
        localOwner: false,
        ownerUnavailable: true,
        readServices: testCase.readServices,
      });
      t.equal(out.settled, false,
        `${completionState} + ${testCase.label} must not settle off cached ACTIVE`);
      t.equal(out.persisted?.workflowStep, WORKFLOW_STEP.SENDING,
        `${completionState} + ${testCase.label} retains ADD in-flight`);
      t.equal(out.persisted?.completedAt, null,
        `${completionState} + ${testCase.label} neither completes nor fails ADD`);
    }
  }

  const exactActiveRead = async ({cachedActiveTarget}) => ({
    success: true,
    rows: [{...cachedActiveTarget}],
  });

  // Live remote owner refuses non-owner completion even with authoritative ACTIVE.
  for (const completionState of [
    PRIORITY_RECOVERY_COMPLETION_STATE.CONVERGED,
    PRIORITY_RECOVERY_COMPLETION_STATE.BLOCKED,
  ]) {
    const liveRemote = await runPriorityAddAuthoritativeDrainProbe({
      completionState,
      localOwner: false,
      ownerUnavailable: false,
      readServices: exactActiveRead,
    });
    t.equal(liveRemote.settled, false,
      `${completionState} with live remote owner must not complete on non-owner`);
    t.equal(liveRemote.persisted?.workflowStep, WORKFLOW_STEP.SENDING);
  }

  // Local owner completes when CONVERGED.
  const localConverged = await runPriorityAddAuthoritativeDrainProbe({
    completionState: PRIORITY_RECOVERY_COMPLETION_STATE.CONVERGED,
    localOwner: true,
    ownerUnavailable: false,
    readServices: exactActiveRead,
  });
  t.equal(localConverged.settled, true, 'local owner completes converged ADD');
  t.equal(localConverged.persisted?.workflowStep, WORKFLOW_STEP.ACTIVE);

  // Remote node completes when owner is unavailable across both paths.
  for (const completionState of [
    PRIORITY_RECOVERY_COMPLETION_STATE.CONVERGED,
    PRIORITY_RECOVERY_COMPLETION_STATE.BLOCKED,
  ]) {
    const deadOwner = await runPriorityAddAuthoritativeDrainProbe({
      completionState,
      localOwner: false,
      ownerUnavailable: true,
      readServices: exactActiveRead,
    });
    t.equal(deadOwner.settled, true,
      `${completionState} with unavailable owner completes on authoritative ACTIVE`);
    t.equal(deadOwner.persisted?.workflowStep, WORKFLOW_STEP.ACTIVE);
  }
});

async function assertAdversarialRowsRejected(
  t, entrypoint, completionState, adversarialRowBuilders,
) {
  for (const emptyCache of [false, true]) {
    for (const {label, buildRow} of adversarialRowBuilders) {
      const viaGateway = await runPriorityAddAuthoritativeDrainProbe({
        entrypoint,
        completionState,
        emptyCache,
        localOwner: false,
        ownerUnavailable: true,
        readServices: async (ctx) => ({success: true, rows: [buildRow(ctx)]}),
      });
      t.equal(viaGateway.settled, false,
        `${entrypoint}/${completionState} (emptyCache=${emptyCache}) rejects ${label}`);
      t.equal(viaGateway.persisted?.workflowStep, WORKFLOW_STEP.SENDING);
      t.equal(viaGateway.persisted?.completedAt, null);

      const viaRowStub = await runPriorityAddAuthoritativeDrainProbe({
        entrypoint,
        completionState,
        emptyCache,
        localOwner: false,
        ownerUnavailable: true,
        stubObservedRow: buildRow,
      });
      t.equal(viaRowStub.settled, false,
        `${entrypoint}/${completionState} precondition guard rejects ${label}`);
      t.equal(viaRowStub.persisted?.workflowStep, WORKFLOW_STEP.SENDING);
      t.equal(viaRowStub.persisted?.completedAt, null);
    }
  }
}

async function assertMalformedTargetIdentitiesRejected(
  t, entrypoint, completionState,
) {
  const malformedIdentities = [
    null,
    {},
    {
      replicaId: '',
      serviceId: '',
      partitionId: '',
      nodeId: '',
      serviceType: 'partition',
      status: ReplicaStatus.ACTIVE,
    },
  ];
  for (const malformedIdentity of malformedIdentities) {
    const malformed = await runPriorityAddAuthoritativeDrainProbe({
      entrypoint,
      completionState,
      localOwner: false,
      ownerUnavailable: true,
      stubObservation: () => Object.freeze({
        state: STOPPING_REPLICA_OBSERVATION_STATE.OBSERVED,
        source: PRIORITY_DRAIN_TEST_AUTHORITATIVE_SOURCE,
        lifecycleStatus: ReplicaStatus.ACTIVE,
        observedTargetIdentity: malformedIdentity,
        lifecyclePrecondition: Object.freeze({}),
      }),
    });
    t.equal(malformed.settled, false,
      `${entrypoint}/${completionState} rejects missing or empty target identity`);
    t.equal(malformed.persisted?.workflowStep, WORKFLOW_STEP.SENDING);
    t.equal(malformed.persisted?.completedAt, null);
  }
}

async function assertExactTargetOwnershipPolarity(
  t, entrypoint, completionState,
) {
  for (const stateEnteredAt of [null, 1700000000000]) {
    const exactRowRead = async ({cachedActiveTarget}) => ({
      success: true,
      rows: [{...cachedActiveTarget, state_entered_at: stateEnteredAt}],
    });
    const validDeadOwner = await runPriorityAddAuthoritativeDrainProbe({
      entrypoint,
      completionState,
      localOwner: false,
      ownerUnavailable: true,
      readServices: exactRowRead,
    });
    t.equal(validDeadOwner.settled, true,
      `${entrypoint}/${completionState} completes exact target ` +
      `(state_entered_at=${stateEnteredAt}) when owner is unavailable`);
    t.equal(validDeadOwner.persisted?.workflowStep, WORKFLOW_STEP.ACTIVE);

    const liveOwnerRefused = await runPriorityAddAuthoritativeDrainProbe({
      entrypoint,
      completionState,
      localOwner: false,
      ownerUnavailable: false,
      readServices: exactRowRead,
    });
    t.equal(liveOwnerRefused.settled, false,
      `${entrypoint}/${completionState} holds exact target when remote owner is live`);
    t.equal(liveOwnerRefused.persisted?.workflowStep, WORKFLOW_STEP.SENDING);
  }
}

test('priority ADD drain rejects null-precondition wildcard identity attacks on ' +
  'both sweep/CONVERGED and dispatch_pending/BLOCKED while accepting exact targets',
async (t) => {
  const entrypointPairs = [
    {
      entrypoint: 'sweep',
      completionState: PRIORITY_RECOVERY_COMPLETION_STATE.CONVERGED,
    },
    {
      entrypoint: 'dispatch_pending',
      completionState: PRIORITY_RECOVERY_COMPLETION_STATE.BLOCKED,
    },
  ];
  const adversarialRowBuilders = [
    {
      label: 'different replica_id with state_entered_at: null',
      buildRow: ({cachedActiveTarget}) => ({
        ...cachedActiveTarget,
        service_id: 'other-replica-r99',
        replica_id: 'other-replica-r99',
        state_entered_at: null,
      }),
    },
    {
      label: 'null replica_id with matching service_id and state_entered_at: null',
      buildRow: ({cachedActiveTarget}) => ({
        ...cachedActiveTarget,
        replica_id: null,
        state_entered_at: null,
      }),
    },
    {
      label: 'null partition_id with state_entered_at: null',
      buildRow: ({cachedActiveTarget}) => ({
        ...cachedActiveTarget,
        partition_id: null,
        state_entered_at: null,
      }),
    },
    {
      label: 'mismatched partition_id with state_entered_at: null',
      buildRow: ({cachedActiveTarget}) => ({
        ...cachedActiveTarget,
        partition_id: 'other-partition-p9',
        state_entered_at: null,
      }),
    },
    {
      label: 'different node_id with state_entered_at: null',
      buildRow: ({cachedActiveTarget}) => ({
        ...cachedActiveTarget,
        node_id: 'other-node-99',
        state_entered_at: null,
      }),
    },
  ];

  for (const {entrypoint, completionState} of entrypointPairs) {
    await assertAdversarialRowsRejected(
      t, entrypoint, completionState, adversarialRowBuilders);
    await assertMalformedTargetIdentitiesRejected(
      t, entrypoint, completionState);
    await assertExactTargetOwnershipPolarity(
      t, entrypoint, completionState);
  }
});
