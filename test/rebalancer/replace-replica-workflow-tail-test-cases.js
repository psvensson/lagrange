import {registerReplaceReplicaWorkflowTailMoreTests} from './replace-replica-workflow-tail-more-test-cases.js';

export async function registerReplaceReplicaWorkflowTailTests({
  t,
  WORKFLOW_STEP,
  OperationType,
  ReplicaStatus,
  ReplicaOperationField,
  ReplicaOperationMessageType,
  ReplicaOperationResponseStatus,
  SQLParser,
  MoveType,
  createTestCoordinator,
  createTestRebalancer,
  TEST_REPLACE_REMOVE_SAFETY_BLOCKED,
  TEST_PRIORITY_SPREAD_PENDING,
  TEST_VISIBILITY_OBSERVATION_STATE_PRESENT,
  TEST_AUTHORITATIVE_OPERATION_READ_DEFERRED,
}) {
  await t.test(
    'ADD create ALREADY_EXISTS re-arms observed progress instead of ' +
      'redispatching duplicate create work',
    async (t) => {
      const addPartitionId = 'widgets-p1';
      const addReplicaId = 'widgets-p1-r4';
      const addTargetNodeId = 'node-4';
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
        nodeId: 'seed-node',
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
              service_id: addReplicaId,
              replica_id: addReplicaId,
              service_type: 'partition',
              partition_id: addPartitionId,
              node_id: addTargetNodeId,
              status: 'active',
              raft_role: 'follower',
              address: `${addTargetNodeId}/partition/${addReplicaId}`,
            },
          ],
        },
      });
      const baseGetActualReplicaStatus =
        coordinator.workflowOwner.getActualReplicaStatus.bind(
          coordinator.workflowOwner,
        );
      coordinator.workflowOwner.getActualReplicaStatus =
        async (replicaId, partitionId, targetNodeId) => {
          if (replicaId === addReplicaId &&
              partitionId === addPartitionId &&
              targetNodeId === addTargetNodeId) {
            return ReplicaStatus.ACTIVE;
          }
          return baseGetActualReplicaStatus(
            replicaId,
            partitionId,
            targetNodeId,
          );
        };

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

      try {
        const operation = await coordinator.createOperation({
          type: OperationType.ADD,
          partitionId: addPartitionId,
          entityType: 'partition',
          entityId: addPartitionId,
          nodeId: addTargetNodeId,
          replicaId: addReplicaId,
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
          'the initial dispatch should be the add create',
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
          1,
          'observed progress should complete the add without a second create',
        );
        t.equal(
          persistedAfterRetry.workflowStep,
          WORKFLOW_STEP.ACTIVE,
          'the add should complete once observed progress resumes',
        );
        t.equal(
          persistedAfterRetry.status,
          ReplicaStatus.ACTIVE,
          'the durable row should reflect the active replica',
        );
      } finally {
        await coordinator.shutdown();
      }
    },
  );
  await t.test(
    'REMOVE not-found re-arms observed progress instead of ' +
      'redispatching duplicate remove work',
    async (t) => {
      const removePartitionId = 'widgets-p1';
      const removeReplicaId = 'widgets-p1-r4';
      const removeTargetNodeId = 'node-4';
      const deliveries = [];
      const deferredTimers = [];
      let failRemovedTransition = true;
      const messageRouter = {
        async deliver(target, payload, options) {
          deliveries.push({target, payload, options});
          if (payload?.type === ReplicaOperationMessageType.REMOVE_REPLICA) {
            return {
              acknowledged: true,
              status: ReplicaOperationResponseStatus.NOT_FOUND,
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
        setTimeoutFn(fn, delayMs) {
          const handle = {fn, delayMs};
          deferredTimers.push(handle);
          return handle;
        },
        clearTimeoutFn() {},
      });

      const basePersistOperationUpdate =
        coordinator.repository.persistOperationUpdate.bind(
          coordinator.repository,
        );
      coordinator.repository.persistOperationUpdate =
        async (nextOperation, options = {}) => {
          if (nextOperation?.workflowStep === WORKFLOW_STEP.REMOVED &&
              failRemovedTransition) {
            failRemovedTransition = false;
            const error = new Error('control_plane_pressure_degraded');
            error.retryAfterMs = 10;
            throw error;
          }
          return basePersistOperationUpdate(nextOperation, options);
        };

      try {
        const operation = await coordinator.createOperation({
          type: OperationType.REMOVE,
          partitionId: removePartitionId,
          entityType: 'partition',
          entityId: removePartitionId,
          nodeId: removeTargetNodeId,
          replicaId: removeReplicaId,
        });

        // The universal remove-safety floor (audit finding 1, strict plain
        // REMOVE) defers a removal that would drop the post-removal
        // voter-ready count below minReplicaCount (default 3) and fails
        // closed on an empty replica-row read. Seed three other voter-ready
        // replicas so removing this fourth replica stays above the floor.
        for (const [peerReplicaId, peerNodeId] of [
          ['widgets-p1-r1', 'node-1'],
          ['widgets-p1-r2', 'node-2'],
          ['widgets-p1-r3', 'node-3'],
        ]) {
          coordinator.systemTableCache.upsert('services', {
            service_id: peerReplicaId,
            replica_id: peerReplicaId,
            partition_id: removePartitionId,
            node_id: peerNodeId,
            service_type: 'partition',
            status: 'active',
            raft_role: peerReplicaId === 'widgets-p1-r1' ? 'leader' : 'follower',
            address: `${peerNodeId}/partition/${peerReplicaId}`,
          });
        }

        const firstAttempt = await coordinator.executeOperation(operation);

        t.equal(
          firstAttempt.reason,
          'deferred_retry_pending',
          'retryable REMOVED promotion failures should defer through observed progress',
        );
        t.equal(
          deliveries.length,
          1,
          'the first attempt should only send the remove phase once',
        );
        t.equal(
          deliveries[0]?.payload?.type,
          ReplicaOperationMessageType.REMOVE_REPLICA,
          'the initial dispatch should be the remove request',
        );
        t.equal(
          operation.workflowStep,
          WORKFLOW_STEP.STOPPING,
          'the satisfied remove should persist STOPPING before observed progress resumes terminal completion',
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
          1,
          'observed progress should complete the remove without a second dispatch',
        );
        t.equal(
          persistedAfterRetry.workflowStep,
          WORKFLOW_STEP.REMOVED,
          'the remove should complete once observed progress resumes',
        );
        t.equal(
          persistedAfterRetry.status,
          ReplicaStatus.REMOVED,
          'the durable row should reflect the removed replica',
        );
      } finally {
        await coordinator.shutdown();
      }
    },
  );

  await t.test(
    'REPLACE reconciliation dispatches source removal while owner key is already held',
    async (t) => {
      const deliveries = [];
      const messageRouter = {
        async deliver(target, payload, options) {
          deliveries.push({target, payload, options});
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
        sqlQueryResults: {
          'FROM services WHERE service_id = ?': {
            success: true,
            rows: [{node_id: 'node-2', status: ReplicaStatus.ACTIVE}],
            affectedRows: 1,
          },
        },
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

        operation.replicaId = 'users-p1-r2';
        operation.workflowStep = WORKFLOW_STEP.SYNCING;
        operation.status = ReplicaStatus.SYNCING;

        // The universal remove-safety floor (audit finding 1, lenient
        // REPLACE) evaluates the REPLACE source-removal against the
        // replacement replica holding quorum. Seed the target replica as
        // voter-ready so the lenient branch sees it; otherwise the floor
        // fails closed on an empty replica-row read.
        coordinator.systemTableCache.upsert('services', {
          service_id: operation.replicaId,
          replica_id: operation.replicaId,
          partition_id: 'users-p1',
          node_id: 'node-2',
          service_type: 'partition',
          status: 'active',
          raft_role: 'leader',
          address: `node-2/partition/${operation.replicaId}`,
        });

        const progressed =
          await coordinator.operationWorkflowRunExclusive(
            coordinator.getOperationOwnerSingleFlightKey(
              operation.operationId,
            ),
            () => coordinator.reconcileOperationProgress(operation),
          );

        t.equal(progressed, true,
          'reconciliation should progress a syncing REPLACE with active target');
        t.equal(deliveries.length, 1,
          'reconciliation should dispatch source-removal even with owner key held');
        t.equal(
          deliveries[0]?.payload?.type,
          ReplicaOperationMessageType.REMOVE_REPLICA,
          'reconcile path should dispatch source removal for REPLACE',
        );
        t.equal(
          operation.workflowStep,
          WORKFLOW_STEP.STOPPING,
          'reconcile path should advance REPLACE into STOPPING after remove dispatch',
        );
      } finally {
        await coordinator.shutdown();
      }
    },
  );

  await t.test(
    'REPLACE reconciliation skips duplicate source removal when ACTIVE transition is already committed',
    async (t) => {
      const deliveries = [];
      const messageRouter = {
        async deliver(target, payload, options) {
          deliveries.push({target, payload, options});
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
        sqlQueryResults: {
          'FROM services WHERE service_id = ?': {
            success: true,
            rows: [{node_id: 'node-2', status: ReplicaStatus.ACTIVE}],
            affectedRows: 1,
          },
        },
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

        operation.replicaId = 'users-p1-r2';
        operation.workflowStep = WORKFLOW_STEP.SYNCING;
        operation.status = ReplicaStatus.SYNCING;
        coordinator.operationWorkflowCoordinator
          .markTransitionCommitted(
            operation.operationId,
            WORKFLOW_STEP.ACTIVE,
          );

        const progressed =
          await coordinator.reconcileOperationProgress(operation);

        t.equal(progressed, true,
          'reconciliation should treat ACTIVE replay as observed progress');
        t.equal(deliveries.length, 0,
          'idempotent ACTIVE replays should not redispatch source removal');
      } finally {
        await coordinator.shutdown();
      }
    },
  );

  await t.test(
    'REPLACE reconciliation replays source removal from authoritative ACTIVE state when local sync row is stale',
    async (t) => {
      const deliveries = [];
      const messageRouter = {
        async deliver(target, payload, options) {
          deliveries.push({target, payload, options});
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
        sqlQueryResults: {
          'FROM services WHERE service_id = ?': {
            success: true,
            rows: [{node_id: 'node-2', status: ReplicaStatus.ACTIVE}],
            affectedRows: 1,
          },
        },
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

        operation.replicaId = 'users-p1-r2';
        operation.workflowStep = WORKFLOW_STEP.SYNCING;
        operation.status = ReplicaStatus.SYNCING;
        coordinator.operationWorkflowCoordinator
          .markTransitionCommitted(
            operation.operationId,
            WORKFLOW_STEP.ACTIVE,
          );

        // The universal remove-safety floor (audit finding 1, lenient
        // REPLACE) evaluates the REPLACE source-removal against the
        // replacement replica holding quorum. Seed the target replica as
        // voter-ready so the lenient branch sees it; otherwise the floor
        // fails closed on an empty replica-row read.
        coordinator.systemTableCache.upsert('services', {
          service_id: operation.replicaId,
          replica_id: operation.replicaId,
          partition_id: 'users-p1',
          node_id: 'node-2',
          service_type: 'partition',
          status: 'active',
          raft_role: 'leader',
          address: `node-2/partition/${operation.replicaId}`,
        });

        const authoritativeActiveOperation = {
          ...operation,
          workflowStep: WORKFLOW_STEP.ACTIVE,
          status: ReplicaStatus.ACTIVE,
        };
        coordinator.repository.queryAuthoritativeOperationById =
          async () => authoritativeActiveOperation;

        const progressed =
          await coordinator.reconcileOperationProgress(operation);

        t.equal(progressed, true,
          'reconciliation should treat stale syncing state as observed progress');
        t.equal(deliveries.length, 1,
          'authoritative ACTIVE replay should redispatch source removal');
        t.equal(
          deliveries[0]?.payload?.type,
          ReplicaOperationMessageType.REMOVE_REPLICA,
          'authoritative replay should issue source removal for REPLACE',
        );
        t.equal(
          operation.workflowStep,
          WORKFLOW_STEP.STOPPING,
          'authoritative ACTIVE replay should advance the durable row into STOPPING',
        );
      } finally {
        await coordinator.shutdown();
      }
    },
  );

  await t.test(
    'REPLACE reconciliation does not rewind a more advanced cached terminal state',
    async (t) => {
      const deliveries = [];
      const messageRouter = {
        async deliver(target, payload, options) {
          deliveries.push({target, payload, options});
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
        sqlQueryResults: {
          'FROM services WHERE service_id = ?': {
            success: true,
            rows: [{node_id: 'node-2', status: ReplicaStatus.ACTIVE}],
            affectedRows: 1,
          },
        },
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

        operation.replicaId = 'users-p1-r2';
        operation.workflowStep = WORKFLOW_STEP.SYNCING;
        operation.status = ReplicaStatus.SYNCING;

        coordinator.repository.getReplicaOperationRowFromCache =
          () => ({
            operation_id: operation.operationId,
            type: OperationType.REPLACE,
            partition_id: operation.partitionId,
            entity_type: operation.entityType,
            entity_id: operation.entityId,
            source_node_id: operation.sourceNodeId,
            target_node_id: operation.targetNodeId,
            replica_id: operation.replicaId,
            source_replica_id: 'users-p1-r1',
            status: ReplicaStatus.REMOVED,
            workflow_step: WORKFLOW_STEP.REMOVED,
            created_at: operation.createdAt,
            updated_at: operation.createdAt + 1000,
            completed_at: operation.createdAt + 1000,
            error_message: null,
            steps_history: JSON.stringify([
              ...(Array.isArray(operation.stepsHistory) ?
                operation.stepsHistory : []),
              {
                step: WORKFLOW_STEP.REMOVED,
                timestamp: operation.createdAt + 1000,
                previousStep: WORKFLOW_STEP.STOPPING,
                reason: 'operation_completed',
                ownerKey: operation.operationId,
              },
            ]),
          });
        coordinator.repository.queryAuthoritativeOperationById =
          async () => ({
            ...operation,
            sourceReplicaId: 'users-p1-r1',
            workflowStep: WORKFLOW_STEP.ACTIVE,
            status: ReplicaStatus.ACTIVE,
          });

        const progressed =
          await coordinator.reconcileOperationProgress(operation);

        t.equal(progressed, true,
          'reconciliation should accept observed terminal progress');
        t.equal(deliveries.length, 0,
          'terminal cached progress should not redispatch source removal');
        t.equal(
          operation.workflowStep,
          WORKFLOW_STEP.REMOVED,
          'reconciliation should keep the more advanced terminal step',
        );
        t.equal(
          operation.status,
          ReplicaStatus.REMOVED,
          'reconciliation should keep the more advanced terminal status',
        );
      } finally {
        await coordinator.shutdown();
      }
    },
  );

  await t.test(
    'REPLACE STOPPING reconciliation completes when the source replica is already failed',
    async (t) => {
      const deliveries = [];
      const messageRouter = {
        async deliver(target, payload, options) {
          deliveries.push({target, payload, options});
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
        sqlQueryResults: {
          'FROM services WHERE service_id = ?': {
            success: true,
            rows: [{node_id: 'node-2', status: ReplicaStatus.FAILED}],
            affectedRows: 1,
          },
        },
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

        operation.replicaId = 'users-p1-r2';
        operation.sourceReplicaId = 'users-p1-r1';
        operation.workflowStep = WORKFLOW_STEP.STOPPING;
        operation.status = ReplicaStatus.ACTIVE;

        const progressed =
          await coordinator.reconcileOperationProgress(operation);

        t.equal(progressed, true,
          'STOPPING reconciliation should treat a failed source replica as terminal progress for REPLACE');
        t.equal(
          deliveries.length,
          0,
          'terminal failed source state should not redispatch source removal',
        );
        t.equal(
          operation.workflowStep,
          WORKFLOW_STEP.REMOVED,
          'REPLACE should complete once the source replica is already non-serving',
        );
        t.equal(
          operation.status,
          ReplicaStatus.REMOVED,
          'completed REPLACE should persist the removed terminal status',
        );
      } finally {
        await coordinator.shutdown();
      }
    },
  );

  await t.test(
    'RebalanceCoordinator reconcileSyncingOperation advances REPLACE into source removal',
    async (t) => {
      const deliveries = [];
      const messageRouter = {
        async deliver(target, payload, options) {
          deliveries.push({target, payload, options});
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
        sqlQueryResults: {
          'FROM services WHERE service_id = ?': {
            success: true,
            rows: [{node_id: 'node-2', status: ReplicaStatus.ACTIVE}],
            affectedRows: 1,
          },
        },
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

        operation.replicaId = 'users-p1-r2';
        operation.workflowStep = WORKFLOW_STEP.SYNCING;
        operation.status = ReplicaStatus.SYNCING;

        // The universal remove-safety floor (audit finding 1, lenient
        // REPLACE) evaluates the REPLACE source-removal against the
        // replacement replica holding quorum. Seed the target replica as
        // voter-ready so the lenient branch sees it; otherwise the floor
        // fails closed on an empty replica-row read.
        coordinator.systemTableCache.upsert('services', {
          service_id: operation.replicaId,
          replica_id: operation.replicaId,
          partition_id: 'users-p1',
          node_id: 'node-2',
          service_type: 'partition',
          status: 'active',
          raft_role: 'leader',
          address: `node-2/partition/${operation.replicaId}`,
        });

        await coordinator.reconcileSyncingOperation(operation);

        t.equal(deliveries.length, 1,
          'syncing reconciliation should dispatch the source removal phase');
        t.equal(
          deliveries[0]?.payload?.type,
          ReplicaOperationMessageType.REMOVE_REPLICA,
          'syncing reconciliation should remove the source replica for REPLACE',
        );
        t.equal(
          operation.workflowStep,
          WORKFLOW_STEP.STOPPING,
          'syncing reconciliation should advance REPLACE into STOPPING',
        );
      } finally {
        await coordinator.shutdown();
      }
    },
  );

  await t.test('RebalanceCoordinator routes REPLACE creation through storage admission',
    async (t) => {
      const admissionCalls = [];
      const coordinator = createTestCoordinator({
        storageAdmissionService: {
          async checkReplace(options) {
            admissionCalls.push(options);
            return {
              allowed: true,
              decision: 'allow',
              decisionType: 'admitted',
            };
          },
        },
      });

      try {
        await coordinator.createOperation({
          type: OperationType.REPLACE,
          partitionId: 'nodes-p1',
          entityType: 'partition',
          entityId: 'nodes-p1',
          nodeId: 'node-2',
          sourceNodeId: 'seed-node',
          replicaId: 'nodes-p1-r1',
        });

        t.equal(admissionCalls.length, 1,
          'REPLACE creation should consult the admission owner once');
        t.same(admissionCalls[0], {
          sourceNodeId: 'seed-node',
          targetNodeId: 'node-2',
          estimatedBytes: 1,
          isCritical: true,
        }, 'REPLACE admission should use the canonical replace owner path');
      } finally {
        await coordinator.shutdown();
      }
    });

  await t.test(
    'observed REPLACE source removing progress advances ACTIVE rows to STOPPING',
    async (t) => {
      const TEST_SERVICES_TABLE = 'services';
      const TEST_CACHE_UPSERT = 'UPSERT';
      const TEST_OBSERVATION_OBSERVED = 'observed';
      const TEST_PARTITION_ENTITY_TYPE = 'partition';
      const TEST_PARTITION_ID = 'control_plane_publications-p1';
      const TEST_OPERATION_ID = 'replace-source-removing-observed';
      const TEST_SOURCE_NODE_ID = 'node-source';
      const TEST_TARGET_NODE_ID = 'node-target';
      const TEST_SOURCE_REPLICA_ID = TEST_PARTITION_ID + '-r1';
      const TEST_TARGET_REPLICA_ID = TEST_PARTITION_ID + '-r4';
      const nowMs = Date.now();
      const deliveries = [];
      const sourceServiceRow = {
        service_id: TEST_SOURCE_REPLICA_ID,
        replica_id: TEST_SOURCE_REPLICA_ID,
        service_type: TEST_PARTITION_ENTITY_TYPE,
        partition_id: TEST_PARTITION_ID,
        node_id: TEST_SOURCE_NODE_ID,
        status: ReplicaStatus.REMOVING,
        raft_role: 'follower',
        address: TEST_SOURCE_NODE_ID + '/partition/' + TEST_SOURCE_REPLICA_ID,
      };
      const operationRow = {
        operation_id: TEST_OPERATION_ID,
        type: OperationType.REPLACE,
        partition_id: TEST_PARTITION_ID,
        replica_id: TEST_TARGET_REPLICA_ID,
        source_node_id: TEST_SOURCE_NODE_ID,
        target_node_id: TEST_TARGET_NODE_ID,
        status: ReplicaStatus.ACTIVE,
        workflow_step: WORKFLOW_STEP.ACTIVE,
        created_at: nowMs,
        updated_at: nowMs,
        completed_at: null,
        error_message: null,
        entity_type: TEST_PARTITION_ENTITY_TYPE,
        entity_id: TEST_PARTITION_ID,
        steps_history: JSON.stringify([
          {
            step: WORKFLOW_STEP.PENDING,
            timestamp: nowMs,
            sourceReplicaId: TEST_SOURCE_REPLICA_ID,
          },
          {
            step: WORKFLOW_STEP.ACTIVE,
            timestamp: nowMs,
            previousStep: WORKFLOW_STEP.SYNCING,
          },
        ]),
      };
      const coordinator = createTestCoordinator({
        nodeId: TEST_TARGET_NODE_ID,
        enableTimeouts: false,
        cacheData: {
          services: [sourceServiceRow],
          replicaOperations: [operationRow],
        },
        messageRouter: {
          async deliver(target, payload, options) {
            deliveries.push({target, payload, options});
            return {
              acknowledged: true,
              status: ReplicaOperationResponseStatus.INITIATED,
            };
          },
        },
      });
      const baseGetActualReplicaObservation =
        coordinator.repository.getActualReplicaObservation.bind(
          coordinator.repository,
        );
      coordinator.repository.getActualReplicaObservation =
        async (replicaId, partitionId, targetNodeId, readOptions = {}) => {
          if (
            replicaId === TEST_SOURCE_REPLICA_ID &&
            partitionId === TEST_PARTITION_ID &&
            targetNodeId === TEST_SOURCE_NODE_ID
          ) {
            return Object.freeze({
              state: TEST_OBSERVATION_OBSERVED,
              lifecycleStatus: ReplicaStatus.REMOVING,
            });
          }
          return baseGetActualReplicaObservation(
            replicaId,
            partitionId,
            targetNodeId,
            readOptions,
          );
        };

      try {
        coordinator.handleObservedReplicaStateChange(
          TEST_SERVICES_TABLE,
          TEST_CACHE_UPSERT,
          sourceServiceRow,
        );
        await new Promise((resolve) => setImmediate(resolve));
        await new Promise((resolve) => setImmediate(resolve));

        const persistedOperation =
          await coordinator.queryOperationById(TEST_OPERATION_ID);
        t.equal(
          deliveries.length,
          0,
          'source-side observed progress should not redispatch removal',
        );
        t.equal(
          persistedOperation.workflowStep,
          WORKFLOW_STEP.STOPPING,
          'source-side removing evidence should advance the workflow step',
        );
        t.equal(
          persistedOperation.status,
          ReplicaStatus.REMOVING,
          'source-side removing evidence should persist the removing status',
        );
      } finally {
        await coordinator.shutdown();
      }
    },
  );

  await t.test(
    'observed REPLACE source deletion completes STOPPING rows without redispatch',
    async (t) => {
      const TEST_SERVICES_TABLE = 'services';
      const TEST_CACHE_DELETE = 'DELETE';
      const TEST_OBSERVATION_ABSENT = 'absent';
      const TEST_PARTITION_ENTITY_TYPE = 'partition';
      const TEST_PARTITION_ID = 'replica_operations-p1';
      const TEST_OPERATION_ID = 'replace-source-delete-observed';
      const TEST_SOURCE_NODE_ID = 'node-source';
      const TEST_TARGET_NODE_ID = 'node-target';
      const TEST_SOURCE_REPLICA_ID = TEST_PARTITION_ID + '-r1';
      const TEST_TARGET_REPLICA_ID = TEST_PARTITION_ID + '-r4';
      const nowMs = Date.now();
      const deliveries = [];
      const sourceServiceRow = {
        service_id: TEST_SOURCE_REPLICA_ID,
        replica_id: TEST_SOURCE_REPLICA_ID,
        service_type: TEST_PARTITION_ENTITY_TYPE,
        partition_id: TEST_PARTITION_ID,
        node_id: TEST_SOURCE_NODE_ID,
        status: ReplicaStatus.REMOVING,
        raft_role: 'follower',
        address: TEST_SOURCE_NODE_ID + '/partition/' + TEST_SOURCE_REPLICA_ID,
      };
      const operationRow = {
        operation_id: TEST_OPERATION_ID,
        type: OperationType.REPLACE,
        partition_id: TEST_PARTITION_ID,
        replica_id: TEST_TARGET_REPLICA_ID,
        source_node_id: TEST_SOURCE_NODE_ID,
        target_node_id: TEST_TARGET_NODE_ID,
        status: ReplicaStatus.REMOVING,
        workflow_step: WORKFLOW_STEP.STOPPING,
        created_at: nowMs,
        updated_at: nowMs,
        completed_at: null,
        error_message: null,
        entity_type: TEST_PARTITION_ENTITY_TYPE,
        entity_id: TEST_PARTITION_ID,
        steps_history: JSON.stringify([
          {
            step: WORKFLOW_STEP.PENDING,
            timestamp: nowMs,
            sourceReplicaId: TEST_SOURCE_REPLICA_ID,
          },
          {
            step: WORKFLOW_STEP.STOPPING,
            timestamp: nowMs,
            previousStep: WORKFLOW_STEP.ACTIVE,
          },
        ]),
      };
      const coordinator = createTestCoordinator({
        nodeId: TEST_TARGET_NODE_ID,
        enableTimeouts: false,
        cacheData: {
          services: [sourceServiceRow],
          replicaOperations: [operationRow],
        },
        messageRouter: {
          async deliver(target, payload, options) {
            deliveries.push({target, payload, options});
            return {
              acknowledged: true,
              status: ReplicaOperationResponseStatus.INITIATED,
            };
          },
        },
      });
      const baseGetActualReplicaObservation =
        coordinator.repository.getActualReplicaObservation.bind(
          coordinator.repository,
        );
      coordinator.repository.getActualReplicaObservation =
        async (replicaId, partitionId, targetNodeId, readOptions = {}) => {
          if (
            replicaId === TEST_SOURCE_REPLICA_ID &&
            partitionId === TEST_PARTITION_ID &&
            targetNodeId === TEST_SOURCE_NODE_ID
          ) {
            return Object.freeze({
              state: TEST_OBSERVATION_ABSENT,
            });
          }
          return baseGetActualReplicaObservation(
            replicaId,
            partitionId,
            targetNodeId,
            readOptions,
          );
        };

      try {
        coordinator.handleObservedReplicaStateChange(
          TEST_SERVICES_TABLE,
          TEST_CACHE_DELETE,
          sourceServiceRow,
        );
        await new Promise((resolve) => setImmediate(resolve));
        await new Promise((resolve) => setImmediate(resolve));

        const persistedOperation =
          await coordinator.queryOperationById(TEST_OPERATION_ID);
        t.equal(
          deliveries.length,
          0,
          'source-side deletion should not redispatch removal',
        );
        t.equal(
          persistedOperation.workflowStep,
          WORKFLOW_STEP.REMOVED,
          'source-side deletion should complete the replacement',
        );
        t.equal(
          persistedOperation.status,
          ReplicaStatus.REMOVED,
          'source-side deletion should persist the removed status',
        );
        t.ok(
          persistedOperation.completedAt !== null,
          'source-side deletion should record completion time',
        );
      } finally {
        await coordinator.shutdown();
      }
    },
  );

  await t.test(
    'observed target pending progress advances admitted REPLACE creates to CREATING',
    async (t) => {
      const TEST_SERVICES_TABLE = 'services';
      const TEST_CACHE_UPSERT = 'UPSERT';
      const TEST_OBSERVATION_OBSERVED = 'observed';
      const TEST_PARTITION_ENTITY_TYPE = 'partition';
      const TEST_PARTITION_ID = 'sql_transactions-p1';
      const TEST_OPERATION_ID = 'replace-target-pending-observed';
      const TEST_SOURCE_NODE_ID = 'node-source';
      const TEST_TARGET_NODE_ID = 'node-target';
      const TEST_SOURCE_REPLICA_ID = TEST_PARTITION_ID + '-r1';
      const TEST_TARGET_REPLICA_ID = TEST_PARTITION_ID + '-r5';
      const TEST_TARGET_ADDRESS =
        TEST_TARGET_NODE_ID + '/partition/' + TEST_TARGET_REPLICA_ID;
      const nowMs = Date.now();
      const deliveries = [];
      const targetServiceRow = {
        service_id: TEST_TARGET_REPLICA_ID,
        replica_id: TEST_TARGET_REPLICA_ID,
        service_type: TEST_PARTITION_ENTITY_TYPE,
        partition_id: TEST_PARTITION_ID,
        node_id: TEST_TARGET_NODE_ID,
        status: ReplicaStatus.PENDING,
        raft_role: null,
        address: TEST_TARGET_ADDRESS,
      };
      const operationRow = {
        operation_id: TEST_OPERATION_ID,
        type: OperationType.REPLACE,
        partition_id: TEST_PARTITION_ID,
        replica_id: TEST_TARGET_REPLICA_ID,
        source_node_id: TEST_SOURCE_NODE_ID,
        target_node_id: TEST_TARGET_NODE_ID,
        status: ReplicaStatus.PENDING,
        workflow_step: WORKFLOW_STEP.SENDING,
        created_at: nowMs,
        updated_at: nowMs,
        completed_at: null,
        error_message: null,
        entity_type: TEST_PARTITION_ENTITY_TYPE,
        entity_id: TEST_PARTITION_ID,
        steps_history: JSON.stringify([
          {
            step: WORKFLOW_STEP.PENDING,
            timestamp: nowMs,
            sourceReplicaId: TEST_SOURCE_REPLICA_ID,
          },
          {
            step: WORKFLOW_STEP.SENDING,
            timestamp: nowMs,
            previousStep: WORKFLOW_STEP.PENDING,
          },
        ]),
      };
      const coordinator = createTestCoordinator({
        nodeId: TEST_TARGET_NODE_ID,
        enableTimeouts: false,
        cacheData: {
          services: [targetServiceRow],
          replicaOperations: [operationRow],
        },
        messageRouter: {
          async deliver(target, payload, options) {
            deliveries.push({target, payload, options});
            return {
              acknowledged: true,
              status: ReplicaOperationResponseStatus.INITIATED,
            };
          },
        },
      });
      const baseGetActualReplicaObservation =
        coordinator.repository.getActualReplicaObservation.bind(
          coordinator.repository,
        );
      coordinator.repository.getActualReplicaObservation =
        async (replicaId, partitionId, targetNodeId, readOptions = {}) => {
          if (
            replicaId === TEST_TARGET_REPLICA_ID &&
            partitionId === TEST_PARTITION_ID &&
            targetNodeId === TEST_TARGET_NODE_ID
          ) {
            return Object.freeze({
              state: TEST_OBSERVATION_OBSERVED,
              lifecycleStatus: ReplicaStatus.PENDING,
            });
          }
          return baseGetActualReplicaObservation(
            replicaId,
            partitionId,
            targetNodeId,
            readOptions,
          );
        };

      try {
        coordinator.handleObservedReplicaStateChange(
          TEST_SERVICES_TABLE,
          TEST_CACHE_UPSERT,
          targetServiceRow,
        );
        await new Promise((resolve) => setImmediate(resolve));
        await new Promise((resolve) => setImmediate(resolve));

        const persistedOperation =
          await coordinator.queryOperationById(TEST_OPERATION_ID);
        t.equal(
          deliveries.length,
          0,
          'target admission evidence should not redispatch create',
        );
        t.equal(
          persistedOperation.workflowStep,
          WORKFLOW_STEP.CREATING,
          'target pending evidence should advance admitted create workflow',
        );
        t.equal(
          persistedOperation.status,
          ReplicaStatus.CREATING,
          'target pending evidence should persist create-admitted status',
        );
      } finally {
        await coordinator.shutdown();
      }
    },
  );

  await t.test(
    'observed target creating progress advances admitted REPLACE creates to CREATING',
    async (t) => {
      const TEST_SERVICES_TABLE = 'services';
      const TEST_CACHE_UPSERT = 'UPSERT';
      const TEST_OBSERVATION_OBSERVED = 'observed';
      const TEST_PARTITION_ENTITY_TYPE = 'partition';
      const TEST_PARTITION_ID = 'sql_write_operations-p1';
      const TEST_OPERATION_ID = 'replace-target-creating-observed';
      const TEST_SOURCE_NODE_ID = 'node-source';
      const TEST_TARGET_NODE_ID = 'node-target';
      const TEST_SOURCE_REPLICA_ID = TEST_PARTITION_ID + '-r1';
      const TEST_TARGET_REPLICA_ID = TEST_PARTITION_ID + '-r4';
      const TEST_TARGET_ADDRESS =
        TEST_TARGET_NODE_ID + '/partition/' + TEST_TARGET_REPLICA_ID;
      const nowMs = Date.now();
      const deliveries = [];
      const targetServiceRow = {
        service_id: TEST_TARGET_REPLICA_ID,
        replica_id: TEST_TARGET_REPLICA_ID,
        service_type: TEST_PARTITION_ENTITY_TYPE,
        partition_id: TEST_PARTITION_ID,
        node_id: TEST_TARGET_NODE_ID,
        status: ReplicaStatus.CREATING,
        raft_role: null,
        address: TEST_TARGET_ADDRESS,
      };
      const operationRow = {
        operation_id: TEST_OPERATION_ID,
        type: OperationType.REPLACE,
        partition_id: TEST_PARTITION_ID,
        replica_id: TEST_TARGET_REPLICA_ID,
        source_node_id: TEST_SOURCE_NODE_ID,
        target_node_id: TEST_TARGET_NODE_ID,
        status: ReplicaStatus.PENDING,
        workflow_step: WORKFLOW_STEP.SENDING,
        created_at: nowMs,
        updated_at: nowMs,
        completed_at: null,
        error_message: null,
        entity_type: TEST_PARTITION_ENTITY_TYPE,
        entity_id: TEST_PARTITION_ID,
        steps_history: JSON.stringify([
          {
            step: WORKFLOW_STEP.PENDING,
            timestamp: nowMs,
            sourceReplicaId: TEST_SOURCE_REPLICA_ID,
          },
          {
            step: WORKFLOW_STEP.SENDING,
            timestamp: nowMs,
            previousStep: WORKFLOW_STEP.PENDING,
          },
        ]),
      };
      const coordinator = createTestCoordinator({
        nodeId: TEST_TARGET_NODE_ID,
        enableTimeouts: false,
        cacheData: {
          services: [targetServiceRow],
          replicaOperations: [operationRow],
        },
        messageRouter: {
          async deliver(target, payload, options) {
            deliveries.push({target, payload, options});
            return {
              acknowledged: true,
              status: ReplicaOperationResponseStatus.INITIATED,
            };
          },
        },
      });
      const baseGetActualReplicaObservation =
        coordinator.repository.getActualReplicaObservation.bind(
          coordinator.repository,
        );
      coordinator.repository.getActualReplicaObservation =
        async (replicaId, partitionId, targetNodeId, readOptions = {}) => {
          if (
            replicaId === TEST_TARGET_REPLICA_ID &&
            partitionId === TEST_PARTITION_ID &&
            targetNodeId === TEST_TARGET_NODE_ID
          ) {
            return Object.freeze({
              state: TEST_OBSERVATION_OBSERVED,
              lifecycleStatus: ReplicaStatus.CREATING,
            });
          }
          return baseGetActualReplicaObservation(
            replicaId,
            partitionId,
            targetNodeId,
            readOptions,
          );
        };

      try {
        coordinator.handleObservedReplicaStateChange(
          TEST_SERVICES_TABLE,
          TEST_CACHE_UPSERT,
          targetServiceRow,
        );
        await new Promise((resolve) => setImmediate(resolve));
        await new Promise((resolve) => setImmediate(resolve));

        const persistedOperation =
          await coordinator.queryOperationById(TEST_OPERATION_ID);
        t.equal(
          deliveries.length,
          0,
          'target creating evidence should not redispatch create',
        );
        t.equal(
          persistedOperation.workflowStep,
          WORKFLOW_STEP.CREATING,
          'target creating evidence should advance admitted create workflow',
        );
        t.equal(
          persistedOperation.status,
          ReplicaStatus.CREATING,
          'target creating evidence should persist create-admitted status',
        );
      } finally {
        await coordinator.shutdown();
      }
    },
  );


  await registerReplaceReplicaWorkflowTailMoreTests({
    t,
    WORKFLOW_STEP,
    OperationType,
    ReplicaStatus,
    ReplicaOperationField,
    ReplicaOperationMessageType,
    ReplicaOperationResponseStatus,
    SQLParser,
    MoveType,
    createTestCoordinator,
    createTestRebalancer,
    TEST_REPLACE_REMOVE_SAFETY_BLOCKED,
    TEST_PRIORITY_SPREAD_PENDING,
    TEST_VISIBILITY_OBSERVATION_STATE_PRESENT,
    TEST_AUTHORITATIVE_OPERATION_READ_DEFERRED,
  });
}
