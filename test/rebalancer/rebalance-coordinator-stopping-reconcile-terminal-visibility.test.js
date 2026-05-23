import {ControlPlaneField, ControlPlaneMessageType, OPERATION_WORKFLOW_OWNER_SHARED, OperationType, PRIORITY_DRAIN_TEST_ACTIVE_OPERATION_STILL_BLOCKS_REASON, PRIORITY_DRAIN_TEST_AUTHORITATIVE_SOURCE, PRIORITY_DRAIN_TEST_BLOCKED_PARTITION_COUNT, PRIORITY_DRAIN_TEST_COMPLETION_BLOCKED_STATE, PRIORITY_DRAIN_TEST_ENTITY_TYPE, PRIORITY_DRAIN_TEST_FOLLOWER_ELECTION_DISPATCH_ASSERTION, PRIORITY_DRAIN_TEST_FOLLOWER_ELECTION_OPERATION_ID, PRIORITY_DRAIN_TEST_FOLLOWER_ELECTION_STEP_ASSERTION, PRIORITY_DRAIN_TEST_NO_COMPLETED_AT, PRIORITY_DRAIN_TEST_NO_ERROR_MESSAGE, PRIORITY_DRAIN_TEST_PUBLICATION_STATUS, PRIORITY_DRAIN_TEST_READY_DISTINCT_NODE_COUNT, PRIORITY_DRAIN_TEST_READY_NODE_IDS, PRIORITY_DRAIN_TEST_RECOVERY_ELIGIBLE_EXCLUDED_REASON, PRIORITY_DRAIN_TEST_REMOTE_RELEASE_NO_DELIVERY_ASSERTION, PRIORITY_DRAIN_TEST_REMOTE_RELEASE_OPERATION_ID, PRIORITY_DRAIN_TEST_REMOTE_RELEASE_PARTITION_ID, PRIORITY_DRAIN_TEST_REMOTE_RELEASE_SERVICE_TYPE, PRIORITY_DRAIN_TEST_REMOTE_RELEASE_SOURCE_ACTIVE_ASSERTION, PRIORITY_DRAIN_TEST_REMOTE_RELEASE_SOURCE_STOPPING_ASSERTION, PRIORITY_DRAIN_TEST_REMOTE_RELEASE_STOPPING_ASSERTION, PRIORITY_DRAIN_TEST_REMOTE_RELEASE_STOPPING_OPERATION_ID, PRIORITY_DRAIN_TEST_REMOTE_RELEASE_SYNCING_ASSERTION, PRIORITY_DRAIN_TEST_REMOTE_RELEASE_SYNCING_OPERATION_ID, PRIORITY_DRAIN_TEST_REMOTE_RELEASE_TERMINAL_ASSERTION, PRIORITY_DRAIN_TEST_REMOTE_RELEASE_VOTER_ROLE, PRIORITY_DRAIN_TEST_REQUIRED_DISTINCT_NODE_COUNT, PRIORITY_DRAIN_TEST_SOURCE_NODE_ID, PRIORITY_DRAIN_TEST_SPREAD_GAP, PRIORITY_DRAIN_TEST_STALE_TARGET_NODE_ID, PRIORITY_DRAIN_TEST_TARGET_NODE_ID, PRIORITY_DRAIN_TEST_TERMINAL_GUARD_OPERATION_ID, PRIORITY_DRAIN_TEST_TERMINAL_GUARD_STATUS_ASSERTION, PRIORITY_DRAIN_TEST_TERMINAL_GUARD_STEP_ASSERTION, PRIORITY_DRAIN_TEST_TERMINAL_GUARD_TRANSITION_ASSERTION, PRIORITY_DRAIN_TEST_TOTAL_SPREAD_GAP, PRIORITY_DRAIN_TEST_UNAVAILABLE_TARGET_NODE_ID, PRIORITY_RECOVERY_COMPLETION_STATE, RAFT_ROLE, ReplicaOperationMessageType, ReplicaOperationResponseStatus, ReplicaStatus, STOPPING_REPLICA_OBSERVATION_STATE, SYSTEM_TABLE_NAME, WORKFLOW_STEP, buildPriorityDrainConvergedPlanningSnapshot, buildPriorityDrainOwnerUnavailableReadinessService, buildPriorityDrainReadinessService, buildPriorityDrainSupersededPlanningSnapshot, buildPriorityDrainSupersededReadinessService, createTestCoordinator, test} from './rebalance-coordinator-stopping-reconcile-fixtures.js';

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
