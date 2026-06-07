import {ControlPlaneField, ControlPlaneMessageType, OPERATION_WORKFLOW_OWNER_SHARED, OperationType, PRIORITY_DRAIN_TEST_ACTIVE_OPERATION_STILL_BLOCKS_REASON, PRIORITY_DRAIN_TEST_AUTHORITATIVE_SOURCE, PRIORITY_DRAIN_TEST_BLOCKED_PARTITION_COUNT, PRIORITY_DRAIN_TEST_COMPLETION_BLOCKED_STATE, PRIORITY_DRAIN_TEST_ENTITY_TYPE, PRIORITY_DRAIN_TEST_FOLLOWER_ELECTION_DISPATCH_ASSERTION, PRIORITY_DRAIN_TEST_FOLLOWER_ELECTION_OPERATION_ID, PRIORITY_DRAIN_TEST_FOLLOWER_ELECTION_STEP_ASSERTION, PRIORITY_DRAIN_TEST_NO_COMPLETED_AT, PRIORITY_DRAIN_TEST_NO_ERROR_MESSAGE, PRIORITY_DRAIN_TEST_PUBLICATION_STATUS, PRIORITY_DRAIN_TEST_READY_DISTINCT_NODE_COUNT, PRIORITY_DRAIN_TEST_READY_NODE_IDS, PRIORITY_DRAIN_TEST_RECOVERY_ELIGIBLE_EXCLUDED_REASON, PRIORITY_DRAIN_TEST_REMOTE_RELEASE_NO_DELIVERY_ASSERTION, PRIORITY_DRAIN_TEST_REMOTE_RELEASE_OPERATION_ID, PRIORITY_DRAIN_TEST_REMOTE_RELEASE_PARTITION_ID, PRIORITY_DRAIN_TEST_REMOTE_RELEASE_SERVICE_TYPE, PRIORITY_DRAIN_TEST_REMOTE_RELEASE_SOURCE_ACTIVE_ASSERTION, PRIORITY_DRAIN_TEST_REMOTE_RELEASE_SOURCE_STOPPING_ASSERTION, PRIORITY_DRAIN_TEST_REMOTE_RELEASE_STOPPING_ASSERTION, PRIORITY_DRAIN_TEST_REMOTE_RELEASE_STOPPING_OPERATION_ID, PRIORITY_DRAIN_TEST_REMOTE_RELEASE_SYNCING_ASSERTION, PRIORITY_DRAIN_TEST_REMOTE_RELEASE_SYNCING_OPERATION_ID, PRIORITY_DRAIN_TEST_REMOTE_RELEASE_TERMINAL_ASSERTION, PRIORITY_DRAIN_TEST_REMOTE_RELEASE_VOTER_ROLE, PRIORITY_DRAIN_TEST_REQUIRED_DISTINCT_NODE_COUNT, PRIORITY_DRAIN_TEST_SOURCE_NODE_ID, PRIORITY_DRAIN_TEST_SPREAD_GAP, PRIORITY_DRAIN_TEST_STALE_TARGET_NODE_ID, PRIORITY_DRAIN_TEST_TARGET_NODE_ID, PRIORITY_DRAIN_TEST_TERMINAL_GUARD_OPERATION_ID, PRIORITY_DRAIN_TEST_TERMINAL_GUARD_STATUS_ASSERTION, PRIORITY_DRAIN_TEST_TERMINAL_GUARD_STEP_ASSERTION, PRIORITY_DRAIN_TEST_TERMINAL_GUARD_TRANSITION_ASSERTION, PRIORITY_DRAIN_TEST_TOTAL_SPREAD_GAP, PRIORITY_DRAIN_TEST_UNAVAILABLE_TARGET_NODE_ID, PRIORITY_RECOVERY_COMPLETION_STATE, RAFT_ROLE, ReplicaOperationMessageType, ReplicaOperationResponseStatus, ReplicaStatus, STOPPING_REPLICA_OBSERVATION_STATE, SYSTEM_TABLE_NAME, WORKFLOW_STEP, buildPriorityDrainConvergedPlanningSnapshot, buildPriorityDrainOwnerUnavailableReadinessService, buildPriorityDrainReadinessService, buildPriorityDrainSupersededPlanningSnapshot, buildPriorityDrainSupersededReadinessService, createTestCoordinator, test} from './rebalance-coordinator-stopping-reconcile-fixtures.js';

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
    const reconcileResult =
      await coordinator.workflowOwner.reconcileOperationProgress(operation);
    const persistedOperation =
      await coordinator.getOperation(TEST_OPERATION_ID);

    t.equal(
      reconcileResult,
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
