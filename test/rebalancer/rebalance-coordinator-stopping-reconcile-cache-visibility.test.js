import {ControlPlaneField, ControlPlaneMessageType, OPERATION_WORKFLOW_OWNER_SHARED, OperationType, PRIORITY_DRAIN_TEST_ACTIVE_OPERATION_STILL_BLOCKS_REASON, PRIORITY_DRAIN_TEST_AUTHORITATIVE_SOURCE, PRIORITY_DRAIN_TEST_BLOCKED_PARTITION_COUNT, PRIORITY_DRAIN_TEST_COMPLETION_BLOCKED_STATE, PRIORITY_DRAIN_TEST_ENTITY_TYPE, PRIORITY_DRAIN_TEST_FOLLOWER_ELECTION_DISPATCH_ASSERTION, PRIORITY_DRAIN_TEST_FOLLOWER_ELECTION_OPERATION_ID, PRIORITY_DRAIN_TEST_FOLLOWER_ELECTION_STEP_ASSERTION, PRIORITY_DRAIN_TEST_NO_COMPLETED_AT, PRIORITY_DRAIN_TEST_NO_ERROR_MESSAGE, PRIORITY_DRAIN_TEST_PUBLICATION_STATUS, PRIORITY_DRAIN_TEST_READY_DISTINCT_NODE_COUNT, PRIORITY_DRAIN_TEST_READY_NODE_IDS, PRIORITY_DRAIN_TEST_RECOVERY_ELIGIBLE_EXCLUDED_REASON, PRIORITY_DRAIN_TEST_REMOTE_RELEASE_NO_DELIVERY_ASSERTION, PRIORITY_DRAIN_TEST_REMOTE_RELEASE_OPERATION_ID, PRIORITY_DRAIN_TEST_REMOTE_RELEASE_PARTITION_ID, PRIORITY_DRAIN_TEST_REMOTE_RELEASE_SERVICE_TYPE, PRIORITY_DRAIN_TEST_REMOTE_RELEASE_SOURCE_ACTIVE_ASSERTION, PRIORITY_DRAIN_TEST_REMOTE_RELEASE_SOURCE_STOPPING_ASSERTION, PRIORITY_DRAIN_TEST_REMOTE_RELEASE_STOPPING_ASSERTION, PRIORITY_DRAIN_TEST_REMOTE_RELEASE_STOPPING_OPERATION_ID, PRIORITY_DRAIN_TEST_REMOTE_RELEASE_SYNCING_ASSERTION, PRIORITY_DRAIN_TEST_REMOTE_RELEASE_SYNCING_OPERATION_ID, PRIORITY_DRAIN_TEST_REMOTE_RELEASE_TERMINAL_ASSERTION, PRIORITY_DRAIN_TEST_REMOTE_RELEASE_VOTER_ROLE, PRIORITY_DRAIN_TEST_REQUIRED_DISTINCT_NODE_COUNT, PRIORITY_DRAIN_TEST_SOURCE_NODE_ID, PRIORITY_DRAIN_TEST_SPREAD_GAP, PRIORITY_DRAIN_TEST_STALE_TARGET_NODE_ID, PRIORITY_DRAIN_TEST_TARGET_NODE_ID, PRIORITY_DRAIN_TEST_TERMINAL_GUARD_OPERATION_ID, PRIORITY_DRAIN_TEST_TERMINAL_GUARD_STATUS_ASSERTION, PRIORITY_DRAIN_TEST_TERMINAL_GUARD_STEP_ASSERTION, PRIORITY_DRAIN_TEST_TERMINAL_GUARD_TRANSITION_ASSERTION, PRIORITY_DRAIN_TEST_TOTAL_SPREAD_GAP, PRIORITY_DRAIN_TEST_UNAVAILABLE_TARGET_NODE_ID, PRIORITY_RECOVERY_COMPLETION_STATE, RAFT_ROLE, ReplicaOperationMessageType, ReplicaOperationResponseStatus, ReplicaStatus, STOPPING_REPLICA_OBSERVATION_STATE, SYSTEM_TABLE_NAME, WORKFLOW_STEP, buildPriorityDrainConvergedPlanningSnapshot, buildPriorityDrainOwnerUnavailableReadinessService, buildPriorityDrainReadinessService, buildPriorityDrainSupersededPlanningSnapshot, buildPriorityDrainSupersededReadinessService, createTestCoordinator, test} from './rebalance-coordinator-stopping-reconcile-fixtures.js';

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
