const TEST_PENDING_RESPONSE_REPLACE_TEST_NAME =
  'critical REPLACE source-removal pending response timeout stays retryable';
const TEST_PENDING_RESPONSE_PARTITION_ID =
  'sql_transaction_participants-p1';
const TEST_PENDING_RESPONSE_SOURCE_NODE_ID = 'node-pr-timeout-a';
const TEST_PENDING_RESPONSE_SECONDARY_NODE_ID = 'node-pr-timeout-b';
const TEST_PENDING_RESPONSE_TERTIARY_NODE_ID = 'node-pr-timeout-c';
const TEST_PENDING_RESPONSE_TARGET_NODE_ID = 'node-pr-timeout-d';
const TEST_PENDING_RESPONSE_SOURCE_REPLICA_ID =
  'sql_transaction_participants-p1-r1';
const TEST_PENDING_RESPONSE_SECONDARY_REPLICA_ID =
  'sql_transaction_participants-p1-r2';
const TEST_PENDING_RESPONSE_TERTIARY_REPLICA_ID =
  'sql_transaction_participants-p1-r3';
const TEST_PENDING_RESPONSE_TARGET_REPLICA_ID =
  'sql_transaction_participants-p1-r4';
const TEST_PENDING_RESPONSE_SERVICE_TYPE = 'partition';
const TEST_PENDING_RESPONSE_CONNECTION_READY = 'ready';
const TEST_PENDING_RESPONSE_LEADER_ROLE = 'leader';
const TEST_PENDING_RESPONSE_FOLLOWER_ROLE = 'follower';
const TEST_PENDING_RESPONSE_READY_LEASE_EXTENSION_MS = 60000;
const TEST_PENDING_RESPONSE_RETRY_POLL_LIMIT = 10;
export async function registerReplaceReplicaWorkflowSourceRemovalRetryTests({
  t,
  WORKFLOW_STEP,
  OperationType,
  ReplicaStatus,
  ReplicaOperationMessageType,
  ReplicaOperationResponseStatus,
  ROUTER_ERROR_MSG,
  createTestCoordinator,
  TEST_REPLACE_REMOVE_SAFETY_BLOCKED,
  TEST_PRIORITY_SPREAD_PENDING,
  TEST_VISIBILITY_OBSERVATION_STATE_PRESENT,
  TEST_AUTHORITATIVE_OPERATION_READ_DEFERRED,
}) {
  await t.test(TEST_PENDING_RESPONSE_REPLACE_TEST_NAME, async (t) => {
    const deliveries = [];
    const deferredTimers = [];
    let sourceRemovalTimeoutPending = true;
    const buildReadyNode = (nodeId) => ({
      node_id: nodeId,
      status: ReplicaStatus.ACTIVE,
      connection_state: TEST_PENDING_RESPONSE_CONNECTION_READY,
      ready_lease_expires_at:
        Date.now() + TEST_PENDING_RESPONSE_READY_LEASE_EXTENSION_MS,
    });
    const buildService = (replicaId, nodeId, raftRole) => ({
      service_id: replicaId,
      replica_id: replicaId,
      service_type: TEST_PENDING_RESPONSE_SERVICE_TYPE,
      partition_id: TEST_PENDING_RESPONSE_PARTITION_ID,
      node_id: nodeId,
      status: ReplicaStatus.ACTIVE,
      raft_role: raftRole,
      address:
        nodeId +
        '/' +
        TEST_PENDING_RESPONSE_SERVICE_TYPE +
        '/' +
        replicaId,
    });
    const messageRouter = {
      async deliver(target, payload, options) {
        deliveries.push({target, payload, options});
        if (payload?.type === ReplicaOperationMessageType.CREATE_REPLICA) {
          return {
            acknowledged: true,
            status: ReplicaOperationResponseStatus.ALREADY_EXISTS,
          };
        }
        if (sourceRemovalTimeoutPending) {
          sourceRemovalTimeoutPending = false;
          throw new Error(ROUTER_ERROR_MSG.PENDING_RESPONSE_TIMEOUT);
        }
        return {
          acknowledged: true,
          status: ReplicaOperationResponseStatus.INITIATED,
        };
      },
    };

    const coordinator = createTestCoordinator({
      nodeId: TEST_PENDING_RESPONSE_TARGET_NODE_ID,
      enableTimeouts: false,
      messageRouter,
      setTimeoutFn(fn, delayMs) {
        const handle = {fn, delayMs};
        deferredTimers.push(handle);
        return handle;
      },
      clearTimeoutFn() {},
      cacheData: {
        nodes: [
          buildReadyNode(TEST_PENDING_RESPONSE_SOURCE_NODE_ID),
          buildReadyNode(TEST_PENDING_RESPONSE_SECONDARY_NODE_ID),
          buildReadyNode(TEST_PENDING_RESPONSE_TERTIARY_NODE_ID),
          buildReadyNode(TEST_PENDING_RESPONSE_TARGET_NODE_ID),
        ],
        services: [
          buildService(
            TEST_PENDING_RESPONSE_SOURCE_REPLICA_ID,
            TEST_PENDING_RESPONSE_SOURCE_NODE_ID,
            TEST_PENDING_RESPONSE_LEADER_ROLE,
          ),
          buildService(
            TEST_PENDING_RESPONSE_SECONDARY_REPLICA_ID,
            TEST_PENDING_RESPONSE_SECONDARY_NODE_ID,
            TEST_PENDING_RESPONSE_FOLLOWER_ROLE,
          ),
          buildService(
            TEST_PENDING_RESPONSE_TERTIARY_REPLICA_ID,
            TEST_PENDING_RESPONSE_TERTIARY_NODE_ID,
            TEST_PENDING_RESPONSE_FOLLOWER_ROLE,
          ),
          buildService(
            TEST_PENDING_RESPONSE_TARGET_REPLICA_ID,
            TEST_PENDING_RESPONSE_TARGET_NODE_ID,
            TEST_PENDING_RESPONSE_FOLLOWER_ROLE,
          ),
        ],
      },
    });

    const originalEvaluateRemoveSafety =
      coordinator.workflowOwner.evaluateRemoveSafety.bind(
        coordinator.workflowOwner,
      );
    coordinator.workflowOwner.evaluateRemoveSafety =
      async (operation) => {
        if (
          operation?.type === OperationType.REPLACE &&
          operation?.workflowStep === WORKFLOW_STEP.ACTIVE
        ) {
          return coordinator.workflowOwner.buildSafeRemoveSafetyEvaluation();
        }
        return originalEvaluateRemoveSafety(operation);
      };

    try {
      const operation = await coordinator.createOperation({
        type: OperationType.REPLACE,
        partitionId: TEST_PENDING_RESPONSE_PARTITION_ID,
        entityType: TEST_PENDING_RESPONSE_SERVICE_TYPE,
        entityId: TEST_PENDING_RESPONSE_PARTITION_ID,
        nodeId: TEST_PENDING_RESPONSE_TARGET_NODE_ID,
        sourceNodeId: TEST_PENDING_RESPONSE_SOURCE_NODE_ID,
        replicaId: TEST_PENDING_RESPONSE_SOURCE_REPLICA_ID,
      });

      const firstAttempt = await coordinator.executeOperation(operation);

      t.equal(
        firstAttempt?.status,
        ReplicaOperationResponseStatus.ALREADY_EXISTS,
        'create-side satisfaction should remain successful',
      );
      t.equal(
        deliveries.length,
        2,
        'the inline remove dispatch should be attempted after create satisfaction',
      );
      t.equal(
        deliveries[1]?.payload?.type,
        ReplicaOperationMessageType.REMOVE_REPLICA,
        'the second dispatch should be source removal',
      );
      t.equal(
        operation.workflowStep,
        WORKFLOW_STEP.ACTIVE,
        'the operation should stay at ACTIVE while retryable source removal is pending',
      );
      t.equal(
        deferredTimers.length,
        1,
        'pending response timeout should arm one dispatch retry',
      );

      const persistedBeforeRetry =
        await coordinator.queryOperationById(operation.operationId);
      t.equal(
        persistedBeforeRetry?.workflowStep,
        WORKFLOW_STEP.ACTIVE,
        'the durable row should not be failed after a retryable timeout',
      );
      t.equal(
        persistedBeforeRetry?.status,
        ReplicaStatus.ACTIVE,
        'the durable row should keep the target-ready status before retry',
      );

      await deferredTimers[0].fn();
      for (
        let attempt = 0;
        attempt < TEST_PENDING_RESPONSE_RETRY_POLL_LIMIT &&
          deliveries.length < 3;
        attempt++
      ) {
        await new Promise((resolve) => setImmediate(resolve));
      }

      const persistedAfterRetry =
        await coordinator.queryOperationById(operation.operationId);
      t.equal(
        deliveries.length,
        3,
        'the deferred retry should replay source removal',
      );
      t.equal(
        persistedAfterRetry?.workflowStep,
        WORKFLOW_STEP.STOPPING,
        'the retry should advance the same operation into source removal',
      );
      t.equal(
        persistedAfterRetry?.status,
        ReplicaStatus.REMOVING,
        'the durable row should reflect source removal after retry',
      );
    } finally {
      await coordinator.shutdown();
    }
  });

  await t.test(
    'critical REPLACE deferred safety retry uses its operation snapshot when ' +
      'priority visibility defers',
    async (t) => {
      const deliveries = [];
      const deferredTimers = [];
      let sourceRemovalBlocked = true;
      let deferredSafetyRetryRead = true;
      const messageRouter = {
        async deliver(target, payload, options) {
          deliveries.push({target, payload, options});
          if (payload?.type === ReplicaOperationMessageType.CREATE_REPLICA) {
            return {
              acknowledged: true,
              status: ReplicaOperationResponseStatus.ALREADY_EXISTS,
            };
          }
          return {
            acknowledged: true,
            status: ReplicaOperationResponseStatus.INITIATED,
          };
        },
        getConnectionState: () => 'connected',
        pingNode: async () => true,
        isOutboundQueueAvailable: () => true,
      };

      const coordinator = createTestCoordinator({
        nodeId: 'node-d',
        enableTimeouts: false,
        messageRouter,
        setTimeoutFn(fn, delayMs) {
          const handle = {fn, delayMs};
          deferredTimers.push(handle);
          return handle;
        },
        clearTimeoutFn() {},
        cacheData: {
          nodes: [
            {
              node_id: 'node-a',
              status: 'active',
              connection_state: 'ready',
              ready_lease_expires_at: Date.now() + 60000,
            },
            {
              node_id: 'node-b',
              status: 'active',
              connection_state: 'ready',
              ready_lease_expires_at: Date.now() + 60000,
            },
            {
              node_id: 'node-c',
              status: 'active',
              connection_state: 'ready',
              ready_lease_expires_at: Date.now() + 60000,
            },
            {
              node_id: 'node-d',
              status: 'active',
              connection_state: 'ready',
              ready_lease_expires_at: Date.now() + 60000,
            },
          ],
          services: [
            {
              service_id: 'control_plane_publications-p1-r1',
              replica_id: 'control_plane_publications-p1-r1',
              service_type: 'partition',
              partition_id: 'control_plane_publications-p1',
              node_id: 'node-a',
              status: ReplicaStatus.ACTIVE,
              raft_role: 'leader',
              address: 'node-a/partition/control_plane_publications-p1-r1',
            },
            {
              service_id: 'control_plane_publications-p1-r2',
              replica_id: 'control_plane_publications-p1-r2',
              service_type: 'partition',
              partition_id: 'control_plane_publications-p1',
              node_id: 'node-b',
              status: ReplicaStatus.ACTIVE,
              raft_role: 'follower',
              address: 'node-b/partition/control_plane_publications-p1-r2',
            },
            {
              service_id: 'control_plane_publications-p1-r3',
              replica_id: 'control_plane_publications-p1-r3',
              service_type: 'partition',
              partition_id: 'control_plane_publications-p1',
              node_id: 'node-c',
              status: ReplicaStatus.ACTIVE,
              raft_role: 'follower',
              address: 'node-c/partition/control_plane_publications-p1-r3',
            },
            {
              service_id: 'control_plane_publications-p1-r4',
              replica_id: 'control_plane_publications-p1-r4',
              service_type: 'partition',
              partition_id: 'control_plane_publications-p1',
              node_id: 'node-d',
              status: ReplicaStatus.ACTIVE,
              raft_role: 'follower',
              address: 'node-d/partition/control_plane_publications-p1-r4',
            },
          ],
        },
      });

      const originalEvaluateRemoveSafety =
        coordinator.workflowOwner.evaluateRemoveSafety.bind(
          coordinator.workflowOwner,
        );
      coordinator.workflowOwner.evaluateRemoveSafety =
        async (operation) => {
          if (operation?.type === OperationType.REPLACE &&
              operation?.workflowStep === WORKFLOW_STEP.ACTIVE) {
            if (sourceRemovalBlocked) {
              return coordinator.workflowOwner
                .buildDeferredRemoveSafetyEvaluation(
                  TEST_PRIORITY_SPREAD_PENDING,
                  TEST_REPLACE_REMOVE_SAFETY_BLOCKED,
                );
            }
            return coordinator.workflowOwner
              .buildSafeRemoveSafetyEvaluation();
          }
          return originalEvaluateRemoveSafety(operation);
        };

      try {
        const operation = await coordinator.createOperation({
          type: OperationType.REPLACE,
          partitionId: 'control_plane_publications-p1',
          entityType: 'partition',
          entityId: 'control_plane_publications-p1',
          nodeId: 'node-d',
          sourceNodeId: 'node-a',
          replicaId: 'control_plane_publications-p1-r1',
        });
        const baseGetOperationByIdVisibilityObservation =
          coordinator.repository.getOperationByIdVisibilityObservation.bind(
            coordinator.repository,
          );
        coordinator.repository.getOperationByIdVisibilityObservation =
          async (operationId, options = {}) => {
            if (deferredSafetyRetryRead &&
                operationId === operation.operationId) {
              deferredSafetyRetryRead = false;
              return {
                operation: null,
                deferredOutcome: {
                  completionState: TEST_AUTHORITATIVE_OPERATION_READ_DEFERRED,
                },
              };
            }
            return baseGetOperationByIdVisibilityObservation(
              operationId,
              options,
            );
          };

        const firstAttempt = await coordinator.executeOperation(operation);

        t.equal(
          firstAttempt?.status,
          ReplicaOperationResponseStatus.ALREADY_EXISTS,
          'the create-side satisfied response should surface as already exists',
        );
        t.equal(
          deliveries.length,
          1,
          'the first attempt should only dispatch the replacement create',
        );
        t.equal(
          deliveries[0]?.payload?.type,
          ReplicaOperationMessageType.CREATE_REPLICA,
          'the first dispatch should be the replacement create',
        );
        t.equal(
          operation.workflowStep,
          WORKFLOW_STEP.ACTIVE,
          'the replacement should remain at ACTIVE while source removal is deferred',
        );
        t.equal(
          deferredTimers.length,
          1,
          'the deferred safety lane should arm one retry',
        );

        sourceRemovalBlocked = false;
        await deferredTimers[0].fn();
        for (let attempt = 0; attempt < 10 && deliveries.length < 2; attempt++) {
          await new Promise((resolve) => setImmediate(resolve));
        }

        const persistedAfterRetry =
          await coordinator.queryOperationById(operation.operationId);
        t.equal(
          deliveries.length,
          2,
          'the deferred retry should recover from deferred empty visibility and continue with source removal',
        );
        t.equal(
          deliveries[1]?.payload?.type,
          ReplicaOperationMessageType.REMOVE_REPLICA,
          'the recovered retry should dispatch source removal',
        );
        t.equal(
          persistedAfterRetry?.workflowStep,
          WORKFLOW_STEP.STOPPING,
          'the durable row should advance into source removal after the recovered retry',
        );
        t.equal(
          persistedAfterRetry?.status,
          ReplicaStatus.REMOVING,
          'the durable row should reflect source removal in progress after the recovered retry',
        );
      } finally {
        await coordinator.shutdown();
      }
    },
  );

  await t.test(
    'critical REPLACE create-rearm ALREADY_EXISTS resumes source removal ' +
      'from CREATING on transition-retry resume',
    async (t) => {
      const deliveries = [];
      let createResponseStatus =
        ReplicaOperationResponseStatus.INITIATED;
      const messageRouter = {
        async deliver(target, payload, options) {
          deliveries.push({target, payload, options});
          if (payload?.type === ReplicaOperationMessageType.CREATE_REPLICA) {
            return {
              acknowledged: true,
              status: createResponseStatus,
            };
          }
          return {
            acknowledged: true,
            status: ReplicaOperationResponseStatus.INITIATED,
          };
        },
        getConnectionState: () => 'connected',
        pingNode: async () => true,
        isOutboundQueueAvailable: () => true,
      };

      const coordinator = createTestCoordinator({
        nodeId: 'node-d',
        enableTimeouts: false,
        messageRouter,
        cacheData: {
          nodes: [
            {
              node_id: 'node-a',
              status: 'active',
              connection_state: 'ready',
              ready_lease_expires_at: Date.now() + 60000,
            },
            {
              node_id: 'node-b',
              status: 'active',
              connection_state: 'ready',
              ready_lease_expires_at: Date.now() + 60000,
            },
            {
              node_id: 'node-c',
              status: 'active',
              connection_state: 'ready',
              ready_lease_expires_at: Date.now() + 60000,
            },
            {
              node_id: 'node-d',
              status: 'active',
              connection_state: 'ready',
              ready_lease_expires_at: Date.now() + 60000,
            },
          ],
          services: [
            {
              service_id: 'control_plane_publications-p1-r1',
              replica_id: 'control_plane_publications-p1-r1',
              service_type: 'partition',
              partition_id: 'control_plane_publications-p1',
              node_id: 'node-a',
              status: ReplicaStatus.ACTIVE,
              raft_role: 'leader',
              address: 'node-a/partition/control_plane_publications-p1-r1',
            },
            {
              service_id: 'control_plane_publications-p1-r2',
              replica_id: 'control_plane_publications-p1-r2',
              service_type: 'partition',
              partition_id: 'control_plane_publications-p1',
              node_id: 'node-b',
              status: ReplicaStatus.ACTIVE,
              raft_role: 'follower',
              address: 'node-b/partition/control_plane_publications-p1-r2',
            },
            {
              service_id: 'control_plane_publications-p1-r3',
              replica_id: 'control_plane_publications-p1-r3',
              service_type: 'partition',
              partition_id: 'control_plane_publications-p1',
              node_id: 'node-c',
              status: ReplicaStatus.ACTIVE,
              raft_role: 'follower',
              address: 'node-c/partition/control_plane_publications-p1-r3',
            },
            {
              service_id: 'control_plane_publications-p1-r4',
              replica_id: 'control_plane_publications-p1-r4',
              service_type: 'partition',
              partition_id: 'control_plane_publications-p1',
              node_id: 'node-d',
              status: ReplicaStatus.ACTIVE,
              raft_role: 'follower',
              address: 'node-d/partition/control_plane_publications-p1-r4',
            },
          ],
        },
      });

      const originalEvaluateRemoveSafety =
        coordinator.workflowOwner.evaluateRemoveSafety.bind(
          coordinator.workflowOwner,
        );
      coordinator.workflowOwner.evaluateRemoveSafety =
        async (operation) => {
          if (operation?.type === OperationType.REPLACE &&
              operation?.workflowStep === WORKFLOW_STEP.ACTIVE) {
            return coordinator.workflowOwner
              .buildSafeRemoveSafetyEvaluation();
          }
          return originalEvaluateRemoveSafety(operation);
        };

      try {
        const operation = await coordinator.createOperation({
          type: OperationType.REPLACE,
          partitionId: 'control_plane_publications-p1',
          entityType: 'partition',
          entityId: 'control_plane_publications-p1',
          nodeId: 'node-d',
          sourceNodeId: 'node-a',
          replicaId: 'control_plane_publications-p1-r1',
        });

        const initialAttempt = await coordinator.executeOperation(operation);

        t.equal(
          initialAttempt?.status,
          'in_progress',
        );
        t.equal(
          operation.workflowStep,
          WORKFLOW_STEP.CREATING,
        );
        t.equal(
          deliveries.length,
          1,
        );
        t.equal(
          deliveries[0]?.payload?.type,
          ReplicaOperationMessageType.CREATE_REPLICA,
        );

        createResponseStatus =
          ReplicaOperationResponseStatus.ALREADY_EXISTS;

        const visibilityObservationCalls = [];
        coordinator.repository.getOperationByIdVisibilityObservation =
          async (operationId, options = {}) => {
            visibilityObservationCalls.push({
              operationId,
              options: {...options},
            });
            return {
              state: TEST_VISIBILITY_OBSERVATION_STATE_PRESENT,
              operation: {
                ...operation,
              },
              deferredOutcome: {
                completionState: TEST_AUTHORITATIVE_OPERATION_READ_DEFERRED,
                retryAfterMs: 25,
              },
              retryAfterMs: 25,
            };
          };

        await coordinator.workflowOwner
          .resumeDeferredTransitionOperation(operation.operationId);
        const persistedAfterRetry =
          await coordinator.queryOperationById(operation.operationId);

        t.equal(
          deliveries.length,
          3,
        );
        t.equal(
          deliveries[1]?.payload?.type,
          ReplicaOperationMessageType.CREATE_REPLICA,
        );
        t.equal(
          deliveries[2]?.payload?.type,
          ReplicaOperationMessageType.REMOVE_REPLICA,
        );
        t.equal(
          persistedAfterRetry?.workflowStep,
          WORKFLOW_STEP.STOPPING,
        );
        t.same(
          visibilityObservationCalls,
          [{
            operationId: operation.operationId,
            options: {
              requireOwnerRpcRead: false,
              allowPriorityRecoveryDeferredVisibility: true,
            },
          }],
          'transition resume should load operation visibility through the repository-owned observation contract',
        );
      } finally {
        await coordinator.shutdown();
      }
    },
  );
}
