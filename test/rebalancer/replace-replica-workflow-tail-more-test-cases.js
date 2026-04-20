export async function registerReplaceReplicaWorkflowTailMoreTests({
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
  await t.test('RebalanceCoordinator reconciles REPLACE creating phase from actual state',
    async (t) => {
      const deliveries = [];
      const messageRouter = {
        async deliver(target, payload) {
          deliveries.push({target, payload});
          return {
            acknowledged: true,
            status: deliveries.length === 1 ? 'initiated' : 'completed',
          };
        },
      };

      const coordinator = createTestCoordinator({
        nodeId: 'seed-node',
        enableTimeouts: false,
        messageRouter,
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
            {
              service_id: 'mg-1-r3',
              replica_id: 'mg-1-r3',
              service_type: 'message_group',
              group_id: 'mg-1',
              node_id: 'node-3',
              status: 'active',
              address: 'node-3/message-group/mg-1-r3',
            },
          ],
        },
      });
      coordinator.initialize();
      coordinator.getActualReplicaStatus = async () => ReplicaStatus.ACTIVE;

      try {
        const operation = await coordinator.createOperation({
          type: OperationType.REPLACE,
          partitionId: 'mg-1',
          entityType: 'message_group',
          entityId: 'mg-1',
          nodeId: 'node-4',
          sourceNodeId: 'seed-node',
          replicaId: 'mg-1-r1',
        });

        await coordinator.executeOperation(operation);
        coordinator.workflowOwner.incompleteOperationQueryEmptyBackoffMs = 0;
        await coordinator.checkTimeouts();
        await coordinator.checkTimeouts();
        const persistedOperation =
          await coordinator.getOperation(operation.operationId);

        t.equal(deliveries.length, 2, 'reconcile should dispatch source removal');
        t.equal(
          deliveries[1]?.payload?.type,
          ReplicaOperationMessageType.REMOVE_REPLICA,
          'active replacement should advance REPLACE into remove phase',
        );
        t.equal(
          persistedOperation?.workflowStep,
          WORKFLOW_STEP.REMOVED,
          'completed remove phase should finish the REPLACE workflow',
        );
      } finally {
        await coordinator.shutdown();
      }
    });

  await t.test(
    'RebalanceCoordinator re-arms critical REPLACE create dispatch from ' +
      'CREATING when visibility stays empty',
    async (t) => {
      const PARTITION_ID = 'nodes-p1';
      const SOURCE_NODE_ID = 'node-a';
      const TARGET_NODE_ID = 'node-d';
      const SOURCE_REPLICA_ID = `${PARTITION_ID}-r1`;
      const deliveries = [];
      let createDispatchCount = 0;
      const messageRouter = {
        async deliver(target, payload) {
          deliveries.push({target, payload});
          if (payload?.type ===
              ReplicaOperationMessageType.CREATE_REPLICA) {
            createDispatchCount += 1;
            return {
              acknowledged: true,
              status: createDispatchCount === 1 ?
                ReplicaOperationResponseStatus.INITIATED :
                ReplicaOperationResponseStatus.COMPLETED,
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
        nodeId: SOURCE_NODE_ID,
        enableTimeouts: false,
        messageRouter,
        cacheData: {
          services: [
            {
              service_id: SOURCE_REPLICA_ID,
              replica_id: SOURCE_REPLICA_ID,
              service_type: 'partition',
              partition_id: PARTITION_ID,
              node_id: SOURCE_NODE_ID,
              status: 'active',
              address: `${SOURCE_NODE_ID}/partition/${SOURCE_REPLICA_ID}`,
            },
            {
              service_id: `${PARTITION_ID}-r2`,
              replica_id: `${PARTITION_ID}-r2`,
              service_type: 'partition',
              partition_id: PARTITION_ID,
              node_id: 'node-b',
              status: 'active',
              raft_role: 'follower',
              address: `node-b/partition/${PARTITION_ID}-r2`,
            },
            {
              service_id: `${PARTITION_ID}-r3`,
              replica_id: `${PARTITION_ID}-r3`,
              service_type: 'partition',
              partition_id: PARTITION_ID,
              node_id: 'node-c',
              status: 'active',
              raft_role: 'follower',
              address: `node-c/partition/${PARTITION_ID}-r3`,
            },
          ],
        },
      });
      coordinator.initialize();
      coordinator.getActualReplicaStatus = async () => null;

      try {
        const operation = await coordinator.createOperation({
          type: OperationType.REPLACE,
          partitionId: PARTITION_ID,
          entityType: 'partition',
          entityId: PARTITION_ID,
          nodeId: TARGET_NODE_ID,
          sourceNodeId: SOURCE_NODE_ID,
          replicaId: SOURCE_REPLICA_ID,
        });

        await coordinator.executeOperation(operation);

        t.equal(
          operation.workflowStep,
          WORKFLOW_STEP.CREATING,
          'initial replacement dispatch should move the operation into CREATING',
        );

        const progressed =
          await coordinator.reconcileOperationProgress(operation);

        t.equal(
          progressed,
          true,
          'empty visibility should re-arm critical create dispatch through reconciliation',
        );
        t.equal(
          deliveries.length,
          3,
          're-armed create dispatch should continue into source removal',
        );
        t.equal(
          deliveries[1]?.payload?.type,
          ReplicaOperationMessageType.CREATE_REPLICA,
          'reconciliation should replay the replacement create phase',
        );
        t.equal(
          deliveries[1]?.payload?.replicaId,
          operation.replicaId,
          'the replayed create should preserve the canonical target replica id',
        );
        t.equal(
          deliveries[2]?.payload?.type,
          ReplicaOperationMessageType.REMOVE_REPLICA,
          'completed replayed create should advance directly into source removal',
        );
        t.equal(
          deliveries[2]?.payload?.replicaId,
          SOURCE_REPLICA_ID,
          'source removal should still target the retiring replica',
        );
        t.equal(
          operation.workflowStep,
          WORKFLOW_STEP.STOPPING,
          'replayed create completion should leave REPLACE in STOPPING',
        );
      } finally {
        await coordinator.shutdown();
      }
    },
  );

  await t.test(
    'RebalanceCoordinator re-arms critical REPLACE create dispatch from ' +
      'CREATING when observed target status remains creating',
    async (t) => {
      const PARTITION_ID = 'nodes-p1';
      const SOURCE_NODE_ID = 'node-a';
      const TARGET_NODE_ID = 'node-d';
      const SOURCE_REPLICA_ID = `${PARTITION_ID}-r1`;
      const deliveries = [];
      let createDispatchCount = 0;
      const messageRouter = {
        async deliver(target, payload) {
          deliveries.push({target, payload});
          if (payload?.type ===
              ReplicaOperationMessageType.CREATE_REPLICA) {
            createDispatchCount += 1;
            return {
              acknowledged: true,
              status: createDispatchCount === 1 ?
                ReplicaOperationResponseStatus.INITIATED :
                ReplicaOperationResponseStatus.COMPLETED,
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
        nodeId: SOURCE_NODE_ID,
        enableTimeouts: false,
        messageRouter,
        cacheData: {
          services: [
            {
              service_id: SOURCE_REPLICA_ID,
              replica_id: SOURCE_REPLICA_ID,
              service_type: 'partition',
              partition_id: PARTITION_ID,
              node_id: SOURCE_NODE_ID,
              status: 'active',
              address: `${SOURCE_NODE_ID}/partition/${SOURCE_REPLICA_ID}`,
            },
            {
              service_id: `${PARTITION_ID}-r2`,
              replica_id: `${PARTITION_ID}-r2`,
              service_type: 'partition',
              partition_id: PARTITION_ID,
              node_id: 'node-b',
              status: 'active',
              raft_role: 'follower',
              address: `node-b/partition/${PARTITION_ID}-r2`,
            },
            {
              service_id: `${PARTITION_ID}-r3`,
              replica_id: `${PARTITION_ID}-r3`,
              service_type: 'partition',
              partition_id: PARTITION_ID,
              node_id: 'node-c',
              status: 'active',
              raft_role: 'follower',
              address: `node-c/partition/${PARTITION_ID}-r3`,
            },
          ],
        },
      });
      coordinator.initialize();
      coordinator.getActualReplicaStatus = async () => ReplicaStatus.CREATING;

      try {
        const operation = await coordinator.createOperation({
          type: OperationType.REPLACE,
          partitionId: PARTITION_ID,
          entityType: 'partition',
          entityId: PARTITION_ID,
          nodeId: TARGET_NODE_ID,
          sourceNodeId: SOURCE_NODE_ID,
          replicaId: SOURCE_REPLICA_ID,
        });

        await coordinator.executeOperation(operation);

        t.equal(
          operation.workflowStep,
          WORKFLOW_STEP.CREATING,
          'initial replacement dispatch should move the operation into CREATING',
        );

        const progressed =
          await coordinator.reconcileOperationProgress(operation);

        t.equal(
          progressed,
          true,
          'observed creating status should still re-arm critical create dispatch through reconciliation',
        );
        t.equal(
          deliveries.length,
          3,
          're-armed create dispatch should continue into source removal',
        );
        t.equal(
          deliveries[1]?.payload?.type,
          ReplicaOperationMessageType.CREATE_REPLICA,
          'reconciliation should replay the replacement create phase',
        );
        t.equal(
          deliveries[1]?.payload?.replicaId,
          operation.replicaId,
          'the replayed create should preserve the canonical target replica id',
        );
        t.equal(
          deliveries[2]?.payload?.type,
          ReplicaOperationMessageType.REMOVE_REPLICA,
          'completed replayed create should advance directly into source removal',
        );
        t.equal(
          deliveries[2]?.payload?.replicaId,
          SOURCE_REPLICA_ID,
          'source removal should still target the retiring replica',
        );
        t.equal(
          operation.workflowStep,
          WORKFLOW_STEP.STOPPING,
          'replayed create completion should leave REPLACE in STOPPING',
        );
      } finally {
        await coordinator.shutdown();
      }
    },
  );

  await t.test('RebalanceCoordinator treats REPLACE ACTIVE as in-flight during timeout checks',
    async (t) => {
      const deliveries = [];
      const messageRouter = {
        async deliver(target, payload) {
          deliveries.push({target, payload});
          return {
            acknowledged: true,
            status: deliveries.length === 1 ? 'initiated' : 'completed',
          };
        },
      };

      const coordinator = createTestCoordinator({
        nodeId: 'seed-node',
        enableTimeouts: false,
        messageRouter,
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
            {
              service_id: 'mg-1-r3',
              replica_id: 'mg-1-r3',
              service_type: 'message_group',
              group_id: 'mg-1',
              node_id: 'node-3',
              status: 'active',
              address: 'node-3/message-group/mg-1-r3',
            },
          ],
        },
      });
      coordinator.initialize();

      try {
        const operation = await coordinator.createOperation({
          type: OperationType.REPLACE,
          partitionId: 'mg-1',
          entityType: 'message_group',
          entityId: 'mg-1',
          nodeId: 'node-4',
          sourceNodeId: 'seed-node',
          replicaId: 'mg-1-r1',
        });

        await coordinator.executeOperation(operation);
        await coordinator.updateStep(operation, WORKFLOW_STEP.ACTIVE);
        coordinator.workflowOwner.incompleteOperationQueryEmptyBackoffMs = 0;
        await coordinator.checkTimeouts();
        const persistedOperation =
          await coordinator.getOperation(operation.operationId);

        t.equal(deliveries.length, 2, 'ACTIVE replace should remain visible to timeout checks');
        t.equal(
          deliveries[1]?.payload?.type,
          ReplicaOperationMessageType.REMOVE_REPLICA,
          'timeout checks should continue the REPLACE remove phase',
        );
        t.equal(
          persistedOperation?.workflowStep,
          WORKFLOW_STEP.REMOVED,
          'remove phase completion should terminate the REPLACE operation',
        );
      } finally {
        await coordinator.shutdown();
      }
    });

  await t.test(
    'RebalanceCoordinator keeps critical REPLACE in syncing while the authoritative replacement remains learner',
    async (t) => {
      const deliveries = [];
      const messageRouter = {
        async deliver(target, payload) {
          deliveries.push({target, payload});
          return {
            acknowledged: true,
            status: deliveries.length === 1 ? 'initiated' : 'completed',
          };
        },
        getConnectionState: () => 'connected',
        pingNode: async () => true,
        isOutboundQueueAvailable: () => true,
      };
      const authoritativeLearnerRow = {
        service_id: 'nodes-p1-r4',
        replica_id: 'nodes-p1-r4',
        service_type: 'partition',
        partition_id: 'nodes-p1',
        node_id: 'node-d',
        status: ReplicaStatus.ACTIVE,
        raft_role: 'learner',
        address: 'node-d/partition/nodes-p1-r4',
      };
      const coordinator = createTestCoordinator({
        nodeId: 'node-a',
        enableTimeouts: false,
        messageRouter,
        sqlQueryResults: {
          'FROM services WHERE service_id = ?': {
            success: true,
            rows: [{...authoritativeLearnerRow}],
            affectedRows: 1,
          },
        },
        cacheData: {
          services: [
            {
              service_id: 'nodes-p1-r1',
              replica_id: 'nodes-p1-r1',
              service_type: 'partition',
              partition_id: 'nodes-p1',
              node_id: 'node-a',
              status: ReplicaStatus.ACTIVE,
              raft_role: 'leader',
              address: 'node-a/partition/nodes-p1-r1',
            },
            {
              service_id: 'nodes-p1-r2',
              replica_id: 'nodes-p1-r2',
              service_type: 'partition',
              partition_id: 'nodes-p1',
              node_id: 'node-b',
              status: ReplicaStatus.ACTIVE,
              raft_role: 'follower',
              address: 'node-b/partition/nodes-p1-r2',
            },
            {
              service_id: 'nodes-p1-r3',
              replica_id: 'nodes-p1-r3',
              service_type: 'partition',
              partition_id: 'nodes-p1',
              node_id: 'node-c',
              status: ReplicaStatus.ACTIVE,
              raft_role: 'follower',
              address: 'node-c/partition/nodes-p1-r3',
            },
          ],
        },
      });

      try {
        const operation = await coordinator.createOperation({
          type: OperationType.REPLACE,
          partitionId: 'nodes-p1',
          entityType: 'partition',
          entityId: 'nodes-p1',
          nodeId: 'node-d',
          sourceNodeId: 'node-a',
          replicaId: 'nodes-p1-r1',
        });

        await coordinator.executeOperation(operation);
        await coordinator.reconcileOperationProgress(operation);
        const persistedOperation =
          await coordinator.getOperation(operation.operationId);

        t.equal(
          deliveries.length,
          1,
          'critical REPLACE should not dispatch source removal while the target is still learner-only',
        );
        t.equal(
          persistedOperation?.workflowStep,
          WORKFLOW_STEP.SYNCING,
          'critical REPLACE should remain in syncing until the replacement becomes voter-ready',
        );
        t.equal(
          persistedOperation?.status,
          ReplicaStatus.SYNCING,
          'critical REPLACE should keep the operation in syncing while learner promotion is pending',
        );
        t.equal(
          persistedOperation?.errorMessage ||
            persistedOperation?.error_message ||
            null,
          null,
          'critical REPLACE should not fail on the expected learner promotion window',
        );
      } finally {
        await coordinator.shutdown();
      }
    });

  await t.test(
    'critical REPLACE keeps ACTIVE ownership on the target while source removal remains deferred',
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

        operation.replicaId = 'control_plane_publications-p1-r4';
        await coordinator.workflowOwner.updateStep(
          operation,
          WORKFLOW_STEP.ACTIVE,
        );

        const progressed =
          await coordinator.reconcileOperationProgress(operation);

        t.equal(
          progressed,
          true,
          'critical ACTIVE REPLACE should continue from the target owner',
        );
        t.equal(
          deliveries.length,
          0,
          'target owner should keep source removal deferred without dispatching immediately',
        );
        t.equal(
          deliveries[0]?.target,
          undefined,
          'no retiring-source dispatch should be emitted while deferred',
        );
        t.equal(
          deliveries[0]?.payload?.type,
          undefined,
          'no remove-source payload should be emitted while deferred',
        );
        t.equal(
          deliveries[0]?.payload?.replicaId,
          undefined,
          'the original replica is not retired until source removal dispatch actually proceeds',
        );
        t.equal(
          operation.workflowStep,
          WORKFLOW_STEP.ACTIVE,
          'critical ACTIVE REPLACE remains on the ACTIVE phase while source removal is deferred',
        );
      } finally {
        await coordinator.shutdown();
      }
    });

  await t.test(
    'critical ACTIVE REPLACE reconcile re-arms deferred retry when source ' +
      'removal stays deferred',
    async (t) => {
      const deliveries = [];
      const deferredTimers = [];
      let sourceRemovalBlocked = true;
      const messageRouter = {
        async deliver(target, payload, options) {
          deliveries.push({target, payload, options});
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

        operation.replicaId = 'control_plane_publications-p1-r4';
        operation.workflowStep = WORKFLOW_STEP.ACTIVE;
        operation.status = ReplicaStatus.ACTIVE;
        operation.updatedAt = Date.now();
        operation.stepsHistory.push({
          step: WORKFLOW_STEP.ACTIVE,
          timestamp: operation.updatedAt,
          previousStep: WORKFLOW_STEP.SYNCING,
        });

        const progressed =
          await coordinator.reconcileOperationProgress(operation);

        t.equal(
          progressed,
          true,
          'reconciliation should still treat deferred ACTIVE REPLACE as progress',
        );
        t.equal(
          deliveries.length,
          0,
          'reconcile should not dispatch source removal before the defer opens',
        );
        t.equal(
          deferredTimers.length,
          1,
          'reconcile should re-arm one deferred retry while ACTIVE remains deferred',
        );
      } finally {
        await coordinator.shutdown();
      }
    });

  await t.test(
    'critical REPLACE preserves canonical replace identities when observed ' +
      'state drops source-replica metadata',
    async (t) => {
      const coordinator = createTestCoordinator({
        nodeId: 'node-d',
        enableTimeouts: false,
      });

      try {
        const operation = {
          operationId: 'op-observed-replace-active',
          type: OperationType.REPLACE,
          partitionId: 'control_plane_publications-p1',
          replicaId: 'control_plane_publications-p1-r4',
          sourceReplicaId: 'control_plane_publications-p1-r1',
          sourceNodeId: 'node-a',
          targetNodeId: 'node-d',
          workflowStep: WORKFLOW_STEP.SYNCING,
          status: ReplicaStatus.SYNCING,
          createdAt: 1000,
          updatedAt: 1000,
          completedAt: null,
          errorMessage: null,
          stepsHistory: [{
            step: WORKFLOW_STEP.PENDING,
            timestamp: 1000,
            sourceReplicaId: 'control_plane_publications-p1-r1',
          }],
        };
        const observedOperation = {
          operationId: 'op-observed-replace-active',
          type: OperationType.REPLACE,
          partitionId: 'control_plane_publications-p1',
          replicaId: 'control_plane_publications-p1-r1',
          sourceNodeId: 'node-a',
          targetNodeId: 'node-d',
          workflowStep: WORKFLOW_STEP.ACTIVE,
          status: ReplicaStatus.ACTIVE,
          createdAt: 1000,
          updatedAt: 2000,
          completedAt: null,
          errorMessage: null,
          stepsHistory: [{
            step: WORKFLOW_STEP.ACTIVE,
            timestamp: 2000,
            previousStep: WORKFLOW_STEP.SYNCING,
          }],
        };

        coordinator.workflowOwner.applyObservedOperationState(
          operation,
          observedOperation,
        );

        t.equal(
          operation.replicaId,
          'control_plane_publications-p1-r4',
          'observed-state adoption should keep the canonical replacement replica id',
        );
        t.equal(
          operation.sourceReplicaId,
          'control_plane_publications-p1-r1',
          'observed-state adoption should keep the canonical retiring source replica id',
        );
        t.equal(
          operation.workflowStep,
          WORKFLOW_STEP.ACTIVE,
          'observed-state adoption should still advance workflow state',
        );
      } finally {
        await coordinator.shutdown();
      }
    });

  await t.test(
    'RebalanceCoordinator in-flight queries stay parser-compatible ' +
      'while filtering terminal workflow states',
    async (t) => {
      const rows = [
        {
          operation_id: 'replace-active',
          type: OperationType.REPLACE,
          partition_id: 'users-p1',
          source_node_id: 'test-node-1',
          target_node_id: 'node-2',
          status: 'active',
          workflow_step: WORKFLOW_STEP.ACTIVE,
        },
        {
          operation_id: 'remove-pending',
          type: OperationType.REMOVE,
          partition_id: 'users-p1',
          source_node_id: 'test-node-1',
          target_node_id: 'node-3',
          status: 'pending',
          workflow_step: WORKFLOW_STEP.PENDING,
        },
        {
          operation_id: 'remove-removed',
          type: OperationType.REMOVE,
          partition_id: 'users-p1',
          source_node_id: 'test-node-1',
          target_node_id: 'node-4',
          status: 'removed',
          workflow_step: WORKFLOW_STEP.REMOVED,
        },
        {
          operation_id: 'add-active',
          type: OperationType.ADD,
          partition_id: 'users-p1',
          source_node_id: 'test-node-1',
          target_node_id: 'node-5',
          status: 'active',
          workflow_step: WORKFLOW_STEP.ACTIVE,
        },
        {
          operation_id: 'add-failed',
          type: OperationType.ADD,
          partition_id: 'users-p1',
          source_node_id: 'test-node-1',
          target_node_id: 'node-6',
          status: 'failed',
          workflow_step: WORKFLOW_STEP.FAILED,
        },
      ];
      const parsedSql = [];
      const sqlQueryEngine = {
        async executeQuery(sql, params) {
          parsedSql.push(sql);
          new SQLParser(sql).parse();
          if (sql.includes('WHERE type = ?')) {
            const [operationType] = params;
            return {
              success: true,
              rows: rows.filter((row) => row.type === operationType),
            };
          }
          return {success: true, rows};
        },
      };

      const coordinator = createTestCoordinator({
        enableTimeouts: false,
        cacheData: {
          replicaOperations: rows,
        },
        sqlQueryEngine,
      });

      try {
        const inFlight = await coordinator.getInFlightOperations();
        const removeCount = await coordinator.getConcurrentRemoveCount();

        t.same(
          inFlight.map((operation) => operation.operationId).sort(),
          ['remove-pending', 'replace-active'],
          'coordinator should keep workflow-active REPLACE and exclude terminal rows in code',
        );
        t.equal(
          removeCount,
          1,
          'concurrent remove count should ignore removed workflow-terminal operations',
        );
        const ownerScopedSql = parsedSql.find((sql) => {
          return sql.includes('FROM replica_operations') &&
            sql.includes('source_node_id = ?');
        });
        if (ownerScopedSql) {
          t.notMatch(
            ownerScopedSql,
            /source_node_id IS NULL OR source_node_id = ''/,
            'owner-scoped in-flight SQL should remain parser-safe when used',
          );
        } else {
          t.pass(
            'cache fast-path satisfied in-flight query without issuing SQL',
          );
        }
      } finally {
        await coordinator.shutdown();
      }
    },
  );

  await t.test('RebalanceCoordinator allocates canonical replica IDs for ADD',
    async (t) => {
      const coordinator = createTestCoordinator({
        nodeId: 'seed-node',
        enableTimeouts: false,
        cacheData: {
          services: [
            {
              service_id: 'nodes-p1-r1',
              replica_id: 'nodes-p1-r1',
              service_type: 'partition',
              partition_id: 'nodes-p1',
              node_id: 'node-1',
              status: 'active',
              address: 'node-1/partition/nodes-p1-r1',
            },
            {
              service_id: 'nodes-p1-r2',
              replica_id: 'nodes-p1-r2',
              service_type: 'partition',
              partition_id: 'nodes-p1',
              node_id: 'node-2',
              status: 'active',
              address: 'node-2/partition/nodes-p1-r2',
            },
            {
              service_id: 'nodes-p1-r3',
              replica_id: 'nodes-p1-r3',
              service_type: 'partition',
              partition_id: 'nodes-p1',
              node_id: 'node-3',
              status: 'active',
              address: 'node-3/partition/nodes-p1-r3',
            },
          ],
        },
      });

      coordinator.initialize();
      try {
        const operation = await coordinator.createOperation({
          type: OperationType.ADD,
          partitionId: 'nodes-p1',
          entityType: 'partition',
          entityId: 'nodes-p1',
          nodeId: 'node-4',
        });

        t.equal(
          operation.replicaId,
          'nodes-p1-r4',
          'ADD should allocate next canonical replica id instead of UUID',
        );
      } finally {
        await coordinator.shutdown();
      }
    });

  await t.test('UnifiedRebalancer skips ADD scheduling when storage admission blocks it',
    async (t) => {
      const admissionCalls = [];
      const coordinator = createTestCoordinator({
        storageAdmissionService: {
          async checkAdd(options) {
            admissionCalls.push(options);
            return {
              allowed: false,
              decision: 'deny',
              decisionType: 'blocked',
              blockingReasons: [{
                code: 'insufficient_placement_eligible_nodes',
              }],
            };
          },
        },
      });
      const rebalancer = createTestRebalancer({
        entityId: 'nodes-p1',
        rebalanceCoordinator: coordinator,
        cacheData: {
          nodes: [
            {node_id: 'node-1', status: 'active'},
            {node_id: 'node-2', status: 'active'},
          ],
        },
      });

      try {
        coordinator.workflowOwner.incompleteOperationQueryEmptyBackoffMs = 0;
        const result = await rebalancer.executeMove({
          type: MoveType.ADD,
          nodeId: 'node-2',
          reason: 'spread_replicas',
        });

        t.equal(admissionCalls.length, 1,
          'ADD scheduling should consult the admission owner once');
        t.same(admissionCalls[0], {
          targetNodeId: 'node-2',
          estimatedBytes: 1,
          isCritical: true,
        }, 'ADD admission should use the canonical add owner path');
        t.equal(result.skipped, true,
          'blocked admission should skip scheduling instead of throwing');
        t.equal(result.reason, 'blocked');
        t.equal(
          result.admission.blockingReasons[0].code,
          'insufficient_placement_eligible_nodes',
        );
      } finally {
        await coordinator.shutdown();
      }
    });

  await t.test(
    'RebalanceCoordinator forwards explicit bootstrap topology on CREATE_REPLICA',
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
      });
      coordinator.initialize();

      try {
        const operation = await coordinator.createOperation({
          type: OperationType.ADD,
          partitionId: 'users-p1',
          entityType: 'partition',
          entityId: 'users-p1',
          nodeId: 'node-2',
        });
        const bootstrapReplicaIds = ['users-p1-r1', 'users-p1-r2', 'users-p1-r3'];
        const bootstrapPeerAddresses = [
          'node-1/partition/users-p1-r1',
          'node-2/partition/users-p1-r2',
          'node-3/partition/users-p1-r3',
        ];
        operation[ReplicaOperationField.REPLICA_IDS] = bootstrapReplicaIds;
        operation[ReplicaOperationField.PEER_ADDRESSES] =
          bootstrapPeerAddresses;

        await coordinator.executeOperation(operation);

        t.equal(
          deliveries[0]?.payload?.[ReplicaOperationField.OPERATION_TYPE],
          OperationType.ADD,
          'CREATE_REPLICA payloads should carry ADD intent explicitly when the target is bootstrapping a new voter',
        );
        t.same(
          deliveries[0]?.payload?.[ReplicaOperationField.REPLICA_IDS],
          bootstrapReplicaIds,
          'bootstrap replica ids should be preserved on the CREATE_REPLICA payload',
        );
        t.same(
          deliveries[0]?.payload?.[ReplicaOperationField.PEER_ADDRESSES],
          bootstrapPeerAddresses,
          'bootstrap peer addresses should be preserved on the CREATE_REPLICA payload',
        );
      } finally {
        await coordinator.shutdown();
      }
    },
  );

  await t.test(
    'RebalanceCoordinator derives canonical topology for message-group CREATE_REPLICA',
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
            {
              service_id: 'mg-1-r3',
              replica_id: 'mg-1-r3',
              service_type: 'message_group',
              group_id: 'mg-1',
              node_id: 'node-3',
              status: 'active',
              address: 'node-3/message-group/mg-1-r3',
            },
          ],
        },
      });
      coordinator.initialize();

      try {
        const operation = await coordinator.createOperation({
          type: OperationType.ADD,
          partitionId: 'mg-1',
          entityType: 'message_group',
          entityId: 'mg-1',
          nodeId: 'node-4',
          replicaId: 'mg-1-r4',
        });

        await coordinator.executeOperation(operation);

        t.same(
          deliveries[0]?.payload?.[ReplicaOperationField.REPLICA_IDS],
          ['mg-1-r1', 'mg-1-r2', 'mg-1-r3', 'mg-1-r4'],
          'message-group create payload should include canonical replica ids',
        );
        t.same(
          deliveries[0]?.payload?.[ReplicaOperationField.PEER_ADDRESSES],
          [
            'seed-node/message-group/mg-1-r1',
            'node-2/message-group/mg-1-r2',
            'node-3/message-group/mg-1-r3',
            'node-4/message-group/mg-1-r4',
          ],
          'message-group create payload should include canonical peer addresses',
        );
      } finally {
        await coordinator.shutdown();
      }
    },
  );
}
