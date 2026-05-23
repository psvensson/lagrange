import {ControlPlaneField, ControlPlaneMessageType, OPERATION_WORKFLOW_OWNER_SHARED, OperationType, PRIORITY_DRAIN_TEST_ACTIVE_OPERATION_STILL_BLOCKS_REASON, PRIORITY_DRAIN_TEST_AUTHORITATIVE_SOURCE, PRIORITY_DRAIN_TEST_BLOCKED_PARTITION_COUNT, PRIORITY_DRAIN_TEST_COMPLETION_BLOCKED_STATE, PRIORITY_DRAIN_TEST_ENTITY_TYPE, PRIORITY_DRAIN_TEST_FOLLOWER_ELECTION_DISPATCH_ASSERTION, PRIORITY_DRAIN_TEST_FOLLOWER_ELECTION_OPERATION_ID, PRIORITY_DRAIN_TEST_FOLLOWER_ELECTION_STEP_ASSERTION, PRIORITY_DRAIN_TEST_NO_COMPLETED_AT, PRIORITY_DRAIN_TEST_NO_ERROR_MESSAGE, PRIORITY_DRAIN_TEST_PUBLICATION_STATUS, PRIORITY_DRAIN_TEST_READY_DISTINCT_NODE_COUNT, PRIORITY_DRAIN_TEST_READY_NODE_IDS, PRIORITY_DRAIN_TEST_RECOVERY_ELIGIBLE_EXCLUDED_REASON, PRIORITY_DRAIN_TEST_REMOTE_RELEASE_NO_DELIVERY_ASSERTION, PRIORITY_DRAIN_TEST_REMOTE_RELEASE_OPERATION_ID, PRIORITY_DRAIN_TEST_REMOTE_RELEASE_PARTITION_ID, PRIORITY_DRAIN_TEST_REMOTE_RELEASE_SERVICE_TYPE, PRIORITY_DRAIN_TEST_REMOTE_RELEASE_SOURCE_ACTIVE_ASSERTION, PRIORITY_DRAIN_TEST_REMOTE_RELEASE_SOURCE_STOPPING_ASSERTION, PRIORITY_DRAIN_TEST_REMOTE_RELEASE_STOPPING_ASSERTION, PRIORITY_DRAIN_TEST_REMOTE_RELEASE_STOPPING_OPERATION_ID, PRIORITY_DRAIN_TEST_REMOTE_RELEASE_SYNCING_ASSERTION, PRIORITY_DRAIN_TEST_REMOTE_RELEASE_SYNCING_OPERATION_ID, PRIORITY_DRAIN_TEST_REMOTE_RELEASE_TERMINAL_ASSERTION, PRIORITY_DRAIN_TEST_REMOTE_RELEASE_VOTER_ROLE, PRIORITY_DRAIN_TEST_REQUIRED_DISTINCT_NODE_COUNT, PRIORITY_DRAIN_TEST_SOURCE_NODE_ID, PRIORITY_DRAIN_TEST_SPREAD_GAP, PRIORITY_DRAIN_TEST_STALE_TARGET_NODE_ID, PRIORITY_DRAIN_TEST_TARGET_NODE_ID, PRIORITY_DRAIN_TEST_TERMINAL_GUARD_OPERATION_ID, PRIORITY_DRAIN_TEST_TERMINAL_GUARD_STATUS_ASSERTION, PRIORITY_DRAIN_TEST_TERMINAL_GUARD_STEP_ASSERTION, PRIORITY_DRAIN_TEST_TERMINAL_GUARD_TRANSITION_ASSERTION, PRIORITY_DRAIN_TEST_TOTAL_SPREAD_GAP, PRIORITY_DRAIN_TEST_UNAVAILABLE_TARGET_NODE_ID, PRIORITY_RECOVERY_COMPLETION_STATE, RAFT_ROLE, ReplicaOperationMessageType, ReplicaOperationResponseStatus, ReplicaStatus, STOPPING_REPLICA_OBSERVATION_STATE, SYSTEM_TABLE_NAME, WORKFLOW_STEP, buildPriorityDrainConvergedPlanningSnapshot, buildPriorityDrainOwnerUnavailableReadinessService, buildPriorityDrainReadinessService, buildPriorityDrainSupersededPlanningSnapshot, buildPriorityDrainSupersededReadinessService, createTestCoordinator, test} from './rebalance-coordinator-stopping-reconcile-fixtures.js';

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
    const reconcileResult =
      await coordinator.workflowOwner.reconcileOperationProgress(operation);
    const persistedOperation =
      await coordinator.getOperation(TEST_OPERATION_ID);

    t.equal(
      reconcileResult?.applied,
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
    const reconcileResult =
      await coordinator.workflowOwner.reconcileOperationProgress(operation);
    const persistedOperation =
      await coordinator.getOperation(TEST_OPERATION_ID);

    t.equal(
      reconcileResult?.applied,
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
    const reconcileResult =
      await coordinator.workflowOwner.reconcileOperationProgress(operation);
    const persistedOperation =
      await coordinator.getOperation(TEST_OPERATION_ID);

    t.equal(
      reconcileResult?.applied,
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
