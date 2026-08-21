import {
  installActualReplicaObservationResolver,
} from './test-helpers.js';

export async function registerReplaceReplicaWorkflowCreateSatisfactionTests({
  t,
  WORKFLOW_STEP,
  OperationType,
  ReplicaStatus,
  ReplicaOperationMessageType,
  ReplicaOperationResponseStatus,
  createTestCoordinator,
  TEST_REPLACE_REMOVE_SAFETY_BLOCKED,
  TEST_PRIORITY_SPREAD_PENDING,
}) {
  await t.test(
    'REPLACE create ALREADY_EXISTS re-arms observed progress instead of ' +
      'redispatching duplicate create work',
    async (t) => {
      const deliveries = [];
      const deferredTimers = [];
      let failActiveTransition = true;
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
      };

      const coordinator = createTestCoordinator({
        nodeId: 'node-2',
        enableTimeouts: false,
        messageRouter,
        setTimeoutFn(fn, delayMs) {
          const handle = {fn, delayMs};
          deferredTimers.push(handle);
          return handle;
        },
        clearTimeoutFn() {},
        cacheData: {
          services: [
            {
              service_id: 'nodes-p1-r1',
              replica_id: 'nodes-p1-r1',
              service_type: 'partition',
              partition_id: 'nodes-p1',
              node_id: 'seed-node',
              status: 'active',
              address: 'seed-node/partition/nodes-p1-r1',
            },
            {
              service_id: 'nodes-p1-r2',
              replica_id: 'nodes-p1-r2',
              service_type: 'partition',
              partition_id: 'nodes-p1',
              node_id: 'seed-node',
              status: 'active',
              address: 'seed-node/partition/nodes-p1-r2',
            },
            {
              service_id: 'nodes-p1-r3',
              replica_id: 'nodes-p1-r3',
              service_type: 'partition',
              partition_id: 'nodes-p1',
              node_id: 'seed-node',
              status: 'active',
              address: 'seed-node/partition/nodes-p1-r3',
            },
          ],
        },
      });

      const basePersistOperationUpdate =
        coordinator.repository.persistOperationUpdate.bind(
          coordinator.repository,
        );
      coordinator.repository.persistOperationUpdate =
        async (nextOperation, options = {}) => {
          if (nextOperation?.workflowStep === WORKFLOW_STEP.ACTIVE &&
              failActiveTransition) {
            failActiveTransition = false;
            const error = new Error('control_plane_pressure_degraded');
            error.retryAfterMs = 10;
            throw error;
          }
          return basePersistOperationUpdate(nextOperation, options);
        };
      installActualReplicaObservationResolver(
        coordinator,
        async (_replicaId, partitionId, targetNodeId) => {
          if (partitionId === 'nodes-p1' && targetNodeId === 'node-2') {
            return ReplicaStatus.ACTIVE;
          }
          return undefined;
        },
      );

      try {
        const operation = await coordinator.createOperation({
          type: OperationType.REPLACE,
          partitionId: 'nodes-p1',
          entityType: 'partition',
          entityId: 'nodes-p1',
          nodeId: 'node-2',
          sourceNodeId: 'seed-node',
          replicaId: 'nodes-p1-r1',
        });

        const firstAttempt = await coordinator.executeOperation(operation);

        t.equal(
          firstAttempt.reason,
          'deferred_retry_pending',
          'retryable ACTIVE promotion failures should defer through observed progress',
        );
        t.equal(
          deliveries.length,
          1,
          'the first attempt should only send the create phase once',
        );
        t.equal(
          deliveries[0]?.payload?.type,
          ReplicaOperationMessageType.CREATE_REPLICA,
          'the initial dispatch should be the replacement create',
        );
        t.equal(
          operation.workflowStep,
          WORKFLOW_STEP.SENDING,
          'the operation should stay dispatchable until observed progress resumes it',
        );
        t.equal(
          deferredTimers.length,
          1,
          'a bounded observed-progress retry should be armed',
        );

        await deferredTimers[0].fn();
        for (let attempt = 0; attempt < 10 && deliveries.length < 2; attempt++) {
          await new Promise((resolve) => setImmediate(resolve));
        }

        const persistedAfterRetry =
          await coordinator.queryOperationById(operation.operationId);
        t.equal(
          deliveries.length,
          2,
          'the retry should continue with source removal, not a second create',
        );
        t.equal(
          deliveries[1]?.payload?.type,
          ReplicaOperationMessageType.REMOVE_REPLICA,
          'observed progress should advance directly into source removal',
        );
        t.equal(
          persistedAfterRetry.workflowStep,
          WORKFLOW_STEP.STOPPING,
          'the replacement should advance once observed progress resumes',
        );
        t.equal(
          persistedAfterRetry.status,
          ReplicaStatus.REMOVING,
          'the durable row should reflect source removal in progress',
        );
      } finally {
        await coordinator.shutdown();
      }
    },
  );

  await t.test(
    'REPLACE create ALREADY_EXISTS resumes source removal when ACTIVE is ' +
      'already committed but authoritative reread is empty',
    async (t) => {
      const deliveries = [];
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
      };

      const coordinator = createTestCoordinator({
        nodeId: 'seed-node',
        enableTimeouts: false,
        messageRouter,
      });

      try {
        const operation = await coordinator.createOperation({
          type: OperationType.REPLACE,
          partitionId: 'users-p1',
          entityType: 'partition',
          entityId: 'users-p1',
          nodeId: 'node-2',
          sourceNodeId: 'seed-node',
          replicaId: 'users-p1-r1',
        });

        // The universal remove-safety floor (audit finding 1, lenient REPLACE)
        // evaluates a REPLACE source-removal against the replacement replica
        // holding quorum. Seed the minted target replica as voter-ready so the
        // lenient branch sees it; otherwise the floor fails closed on an empty
        // replica-row read.
        coordinator.systemTableCache.upsert('services', {
          service_id: operation.replicaId,
          replica_id: operation.replicaId,
          partition_id: 'users-p1',
          node_id: 'node-2',
          service_type: 'partition',
          status: 'active',
          raft_role: 'leader',
        });

        coordinator.operationWorkflowCoordinator
          .markTransitionCommitted(
            operation.operationId,
            WORKFLOW_STEP.ACTIVE,
          );
        coordinator.repository.queryAuthoritativeOperationById =
          async () => null;

        const result = await coordinator.executeOperation(operation);

        t.equal(
          result?.status,
          ReplicaOperationResponseStatus.ALREADY_EXISTS,
          'the create-side response should still surface as already exists',
        );
        t.equal(
          deliveries.length,
          2,
          'the owner should still resume source removal from the local ACTIVE row',
        );
        t.equal(
          deliveries[0]?.payload?.type,
          ReplicaOperationMessageType.CREATE_REPLICA,
          'the first dispatch should be the replacement create',
        );
        t.equal(
          deliveries[1]?.payload?.type,
          ReplicaOperationMessageType.REMOVE_REPLICA,
          'the second dispatch should retire the source replica',
        );
        t.equal(
          operation.workflowStep,
          WORKFLOW_STEP.STOPPING,
          'the replacement should advance into source removal even without an authoritative reread',
        );
      } finally {
        await coordinator.shutdown();
      }
    },
  );

  await t.test(
    'critical REPLACE create ALREADY_EXISTS resumes source removal after ' +
      'deferred safety opens',
    async (t) => {
      const deliveries = [];
      const deferredTimers = [];
      let sourceRemovalBlocked = true;
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
          'the deferred retry should continue with source removal',
        );
        t.equal(
          deliveries[1]?.payload?.type,
          ReplicaOperationMessageType.REMOVE_REPLICA,
          'the replayed ACTIVE row should dispatch source removal',
        );
        t.equal(
          persistedAfterRetry?.workflowStep,
          WORKFLOW_STEP.STOPPING,
          'the durable row should advance into source removal after the retry',
        );
        t.equal(
          persistedAfterRetry?.status,
          ReplicaStatus.REMOVING,
          'the durable row should reflect source removal in progress after the retry',
        );
      } finally {
        await coordinator.shutdown();
      }
    },
  );

  await t.test(
    'critical REPLACE create ALREADY_EXISTS rearms dispatch retry when ' +
      'inline source removal leaves the row parked at ACTIVE',
    async (t) => {
      const deliveries = [];
      const deferredTimers = [];
      let suppressInlineSourceRemoval = true;
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
              service_id: 'sql_transaction_participants-p1-r1',
              replica_id: 'sql_transaction_participants-p1-r1',
              service_type: 'partition',
              partition_id: 'sql_transaction_participants-p1',
              node_id: 'node-a',
              status: ReplicaStatus.ACTIVE,
              raft_role: 'leader',
              address: 'node-a/partition/sql_transaction_participants-p1-r1',
            },
            {
              service_id: 'sql_transaction_participants-p1-r2',
              replica_id: 'sql_transaction_participants-p1-r2',
              service_type: 'partition',
              partition_id: 'sql_transaction_participants-p1',
              node_id: 'node-b',
              status: ReplicaStatus.ACTIVE,
              raft_role: 'follower',
              address: 'node-b/partition/sql_transaction_participants-p1-r2',
            },
            {
              service_id: 'sql_transaction_participants-p1-r3',
              replica_id: 'sql_transaction_participants-p1-r3',
              service_type: 'partition',
              partition_id: 'sql_transaction_participants-p1',
              node_id: 'node-c',
              status: ReplicaStatus.ACTIVE,
              raft_role: 'follower',
              address: 'node-c/partition/sql_transaction_participants-p1-r3',
            },
            {
              service_id: 'sql_transaction_participants-p1-r4',
              replica_id: 'sql_transaction_participants-p1-r4',
              service_type: 'partition',
              partition_id: 'sql_transaction_participants-p1',
              node_id: 'node-d',
              status: ReplicaStatus.ACTIVE,
              raft_role: 'follower',
              address: 'node-d/partition/sql_transaction_participants-p1-r4',
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

      const originalExecuteOperationFromReconcilePath =
        coordinator.workflowOwner.executeOperationFromReconcilePath.bind(
          coordinator.workflowOwner,
        );
      coordinator.workflowOwner.executeOperationFromReconcilePath =
        async (operation) => {
          if (suppressInlineSourceRemoval &&
              operation?.type === OperationType.REPLACE &&
              operation?.workflowStep === WORKFLOW_STEP.ACTIVE) {
            suppressInlineSourceRemoval = false;
            const testDeferredRetryReason = 'deferred_retry_pending';
            return coordinator.workflowOwner.buildSkippedOperationResult(
              testDeferredRetryReason,
              operation.operationId,
            );
          }
          return originalExecuteOperationFromReconcilePath(operation);
        };

      try {
        const operation = await coordinator.createOperation({
          type: OperationType.REPLACE,
          partitionId: 'sql_transaction_participants-p1',
          entityType: 'partition',
          entityId: 'sql_transaction_participants-p1',
          nodeId: 'node-d',
          sourceNodeId: 'node-a',
          replicaId: 'sql_transaction_participants-p1-r1',
        });

        const firstAttempt = await coordinator.executeOperation(operation);

        t.equal(
          firstAttempt?.status,
          ReplicaOperationResponseStatus.ALREADY_EXISTS,
          'the create-side satisfied response should still surface as already exists',
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
          'the replacement should remain at ACTIVE when inline source removal does not advance it',
        );
        t.equal(
          deferredTimers.length,
          1,
          'the owner should arm the bounded dispatch retry lane instead of leaving the row stranded',
        );

        await deferredTimers[0].fn();
        for (let attempt = 0; attempt < 10 && deliveries.length < 2; attempt++) {
          await new Promise((resolve) => setImmediate(resolve));
        }

        const persistedAfterRetry =
          await coordinator.queryOperationById(operation.operationId);
        t.equal(
          deliveries.length,
          2,
          'the deferred retry should continue with source removal',
        );
        t.equal(
          deliveries[1]?.payload?.type,
          ReplicaOperationMessageType.REMOVE_REPLICA,
          'the retried ACTIVE row should dispatch source removal',
        );
        t.equal(
          persistedAfterRetry?.workflowStep,
          WORKFLOW_STEP.STOPPING,
          'the durable row should advance into source removal after the retry',
        );
        t.equal(
          persistedAfterRetry?.status,
          ReplicaStatus.REMOVING,
          'the durable row should reflect source removal in progress after the retry',
        );
      } finally {
        await coordinator.shutdown();
      }
    },
  );
}
