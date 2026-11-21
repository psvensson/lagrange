import {registerReplaceReplicaWorkflowCreateReplayTests} from './replace-replica-workflow-create-replay-test-cases.js';
import {OPERATION_RECONCILE_OUTCOME} from '../../src/rebalancer/operation-workflow-reconcile-outcome.js';
import {buildDeliveryEnvelope} from '../../src/transport/transport-semantic-outcome.js';
import {registerReplaceReplicaWorkflowAddTopologyTests} from './replace-replica-workflow-add-topology-test-cases.js';

const PARTITION_ENTITY_TYPE = 'partition';

import {
  installActualReplicaObservationResolver,
} from './test-helpers.js';

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
}) {
  await t.test('RebalanceCoordinator reconciles REPLACE creating phase from actual state',
    async (t) => {
      const deliveries = [];
      const messageRouter = {
        async deliver(target, payload) {
          deliveries.push({target, payload});
          return buildDeliveryEnvelope({acknowledged: true}, {
            status: deliveries.length === 1 ? 'initiated' : 'completed',
          });
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
        installActualReplicaObservationResolver(
          coordinator,
          (replicaId, _partitionId, targetNodeId) =>
            replicaId === operation.replicaId && targetNodeId === 'node-4' ?
              ReplicaStatus.ACTIVE :
              undefined,
        );

        // The universal remove-safety floor (audit finding 1, lenient
        // REPLACE) evaluates the REPLACE source-removal against the
        // replacement replica holding quorum. Seed the minted target replica
        // as voter-ready so the lenient branch sees it; otherwise the floor
        // fails closed on an empty replica-row read.
        coordinator.systemTableCache.upsert('services', {
          service_id: operation.replicaId,
          replica_id: operation.replicaId,
          group_id: 'mg-1',
          node_id: 'node-4',
          service_type: 'message_group',
          status: 'active',
          raft_role: 'leader',
          address: `node-4/message-group/${operation.replicaId}`,
        });

        await coordinator.executeOperation(operation);
        coordinator.workflowOwner.incompleteOperationQueryEmptyBackoffMs = 0;
        await coordinator.checkTimeouts();
        coordinator.systemTableCache.delete('services', 'mg-1-r1');
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

  await registerReplaceReplicaWorkflowCreateReplayTests(t);

  await t.test('RebalanceCoordinator treats REPLACE ACTIVE as in-flight during timeout checks',
    async (t) => {
      const deliveries = [];
      const messageRouter = {
        async deliver(target, payload) {
          deliveries.push({target, payload});
          return buildDeliveryEnvelope({acknowledged: true}, {
            status: deliveries.length === 1 ? 'initiated' : 'completed',
          });
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

        // The universal remove-safety floor (audit finding 1, lenient
        // REPLACE) evaluates the REPLACE source-removal against the
        // replacement replica holding quorum. Seed the minted target replica
        // as voter-ready so the lenient branch sees it; otherwise the floor
        // fails closed on an empty replica-row read.
        coordinator.systemTableCache.upsert('services', {
          service_id: operation.replicaId,
          replica_id: operation.replicaId,
          group_id: 'mg-1',
          node_id: 'node-4',
          service_type: 'message_group',
          status: 'active',
          raft_role: 'leader',
          address: `node-4/message-group/${operation.replicaId}`,
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
          WORKFLOW_STEP.STOPPING,
          'remove phase completion should wait for source visibility before terminal removal',
        );
      } finally {
        await coordinator.shutdown();
      }
    });

  await t.test(
    'RebalanceCoordinator timeout scan wakes target owner for system REPLACE source-removal rows',
    async (t) => {
      const deliveries = [];
      const messageRouter = {
        async deliver(target, payload, options) {
          deliveries.push({target, payload, options});
          return buildDeliveryEnvelope({acknowledged: true}, {
            status: ReplicaOperationResponseStatus.INITIATED,
          });
        },
      };

      const coordinator = createTestCoordinator({
        nodeId: 'node-system-source',
        enableTimeouts: false,
        messageRouter,
        cacheData: {
          nodes: [
            {
              node_id: 'node-system-source',
              status: ReplicaStatus.ACTIVE,
              connection_state: 'ready',
              ready_lease_expires_at: Date.now() + 60000,
            },
            {
              node_id: 'node-system-target',
              status: ReplicaStatus.ACTIVE,
              connection_state: 'ready',
              ready_lease_expires_at: Date.now() + 60000,
            },
          ],
          services: [
            {
              service_id: 'contexts-p1-r1',
              replica_id: 'contexts-p1-r1',
              service_type: 'partition',
              partition_id: 'contexts-p1',
              node_id: 'node-system-source',
              status: ReplicaStatus.ACTIVE,
              raft_role: 'leader',
              address: 'node-system-source/partition/contexts-p1-r1',
            },
            {
              service_id: 'contexts-p1-r2',
              replica_id: 'contexts-p1-r2',
              service_type: 'partition',
              partition_id: 'contexts-p1',
              node_id: 'node-system-source',
              status: ReplicaStatus.ACTIVE,
              raft_role: 'follower',
              address: 'node-system-source/partition/contexts-p1-r2',
            },
            {
              service_id: 'contexts-p1-r3',
              replica_id: 'contexts-p1-r3',
              service_type: 'partition',
              partition_id: 'contexts-p1',
              node_id: 'node-system-source',
              status: ReplicaStatus.ACTIVE,
              raft_role: 'follower',
              address: 'node-system-source/partition/contexts-p1-r3',
            },
            {
              service_id: 'contexts-p1-r4',
              replica_id: 'contexts-p1-r4',
              service_type: 'partition',
              partition_id: 'contexts-p1',
              node_id: 'node-system-target',
              status: ReplicaStatus.ACTIVE,
              raft_role: 'follower',
              address: 'node-system-target/partition/contexts-p1-r4',
            },
          ],
        },
      });
      coordinator.initialize();

      try {
        const operation = await coordinator.createOperation({
          type: OperationType.REPLACE,
          partitionId: 'contexts-p1',
          entityType: 'partition',
          entityId: 'contexts-p1',
          nodeId: 'node-system-target',
          sourceNodeId: 'node-system-source',
          replicaId: 'contexts-p1-r1',
        });

        operation.replicaId = 'contexts-p1-r4';
        await coordinator.workflowOwner.updateStep(
          operation,
          WORKFLOW_STEP.ACTIVE,
        );
        coordinator.workflowOwner.incompleteOperationQueryEmptyBackoffMs = 0;

        await coordinator.checkTimeouts();

        t.equal(
          deliveries.length,
          1,
          'source timeout scan should wake the target operation owner',
        );
        t.equal(
          deliveries[0]?.options?.targetNodeId,
          'node-system-target',
          'handoff should target the semantic operation owner',
        );
        t.equal(
          deliveries[0]?.options?.deliverySource,
          'coordinator_created_remote_handoff',
          'handoff should use the bounded remote owner path',
        );
        t.equal(
          deliveries[0]?.payload?.operationId,
          operation.operationId,
          'handoff payload should identify the ACTIVE replace operation',
        );
        t.equal(
          deliveries[0]?.payload?.operationRow?.workflow_step,
          WORKFLOW_STEP.ACTIVE,
          'handoff should preserve the ACTIVE source-removal row',
        );
      } finally {
        await coordinator.shutdown();
      }
    },
  );

  await t.test(
    'RebalanceCoordinator keeps system REPLACE handoff rows hidden from third-node cache scans',
    async (t) => {
      const coordinator = createTestCoordinator({
        nodeId: 'node-system-observer',
        enableTimeouts: false,
        cacheData: {
          nodes: [
            {
              node_id: 'node-system-source',
              status: ReplicaStatus.ACTIVE,
              connection_state: 'ready',
              ready_lease_expires_at: Date.now() + 60000,
            },
            {
              node_id: 'node-system-target',
              status: ReplicaStatus.ACTIVE,
              connection_state: 'ready',
              ready_lease_expires_at: Date.now() + 60000,
            },
            {
              node_id: 'node-system-observer',
              status: ReplicaStatus.ACTIVE,
              connection_state: 'ready',
              ready_lease_expires_at: Date.now() + 60000,
            },
          ],
          services: [
            {
              service_id: 'contexts-p1-r1',
              replica_id: 'contexts-p1-r1',
              service_type: 'partition',
              partition_id: 'contexts-p1',
              node_id: 'node-system-source',
              status: ReplicaStatus.ACTIVE,
              raft_role: 'leader',
              address: 'node-system-source/partition/contexts-p1-r1',
            },
            {
              service_id: 'contexts-p1-r2',
              replica_id: 'contexts-p1-r2',
              service_type: 'partition',
              partition_id: 'contexts-p1',
              node_id: 'node-system-source',
              status: ReplicaStatus.ACTIVE,
              raft_role: 'follower',
              address: 'node-system-source/partition/contexts-p1-r2',
            },
            {
              service_id: 'contexts-p1-r3',
              replica_id: 'contexts-p1-r3',
              service_type: 'partition',
              partition_id: 'contexts-p1',
              node_id: 'node-system-source',
              status: ReplicaStatus.ACTIVE,
              raft_role: 'follower',
              address: 'node-system-source/partition/contexts-p1-r3',
            },
            {
              service_id: 'contexts-p1-r4',
              replica_id: 'contexts-p1-r4',
              service_type: 'partition',
              partition_id: 'contexts-p1',
              node_id: 'node-system-target',
              status: ReplicaStatus.ACTIVE,
              raft_role: 'follower',
              address: 'node-system-target/partition/contexts-p1-r4',
            },
          ],
        },
      });
      coordinator.initialize();

      try {
        const operation = await coordinator.createOperation({
          type: OperationType.REPLACE,
          partitionId: 'contexts-p1',
          entityType: 'partition',
          entityId: 'contexts-p1',
          nodeId: 'node-system-target',
          sourceNodeId: 'node-system-source',
          replicaId: 'contexts-p1-r1',
        });

        operation.replicaId = 'contexts-p1-r4';
        await coordinator.workflowOwner.updateStep(
          operation,
          WORKFLOW_STEP.ACTIVE,
        );

        const cachedIncompleteOperations =
          coordinator.repository.queryCachedIncompleteOperations();

        t.equal(
          cachedIncompleteOperations.length,
          0,
          'third-node cache scans should not expose remote system REPLACE rows',
        );
      } finally {
        await coordinator.shutdown();
      }
    },
  );

  await t.test(
    'RebalanceCoordinator replays system REPLACE source removal for the exact recorded source',
    async (t) => {
      const SOURCE_NODE_ID = 'node-system-source';
      const TARGET_NODE_ID = 'node-system-target';
      const PARTITION_ID = 'contexts-p1';
      const SOURCE_REPLICA_ID = `${PARTITION_ID}-r1`;
      const STABLE_REPLICA_ID = `${PARTITION_ID}-r3`;
      const TARGET_REPLICA_ID = `${PARTITION_ID}-r4`;
      const deliveries = [];
      const messageRouter = {
        async deliver(target, payload, options) {
          deliveries.push({target, payload, options});
          return buildDeliveryEnvelope({acknowledged: true}, {
            status: ReplicaOperationResponseStatus.INITIATED,
            operationId: payload.operationId,
            replicaId: payload.replicaId,
            nodeId: SOURCE_NODE_ID,
          });
        },
      };

      const coordinator = createTestCoordinator({
        nodeId: TARGET_NODE_ID,
        enableTimeouts: false,
        messageRouter,
        cacheData: {
          nodes: [
            {
              node_id: SOURCE_NODE_ID,
              status: ReplicaStatus.ACTIVE,
              connection_state: 'ready',
              ready_lease_expires_at: Date.now() + 60000,
            },
            {
              node_id: TARGET_NODE_ID,
              status: ReplicaStatus.ACTIVE,
              connection_state: 'ready',
              ready_lease_expires_at: Date.now() + 60000,
            },
          ],
          services: [
            {
              service_id: SOURCE_REPLICA_ID,
              replica_id: SOURCE_REPLICA_ID,
              service_type: 'partition',
              partition_id: PARTITION_ID,
              node_id: SOURCE_NODE_ID,
              status: ReplicaStatus.ACTIVE,
              raft_role: 'leader',
              address: `${SOURCE_NODE_ID}/partition/${SOURCE_REPLICA_ID}`,
            },
            {
              service_id: STABLE_REPLICA_ID,
              replica_id: STABLE_REPLICA_ID,
              service_type: 'partition',
              partition_id: PARTITION_ID,
              node_id: SOURCE_NODE_ID,
              status: ReplicaStatus.ACTIVE,
              raft_role: 'follower',
              address: `${SOURCE_NODE_ID}/partition/${STABLE_REPLICA_ID}`,
            },
            {
              service_id: TARGET_REPLICA_ID,
              replica_id: TARGET_REPLICA_ID,
              service_type: 'partition',
              partition_id: PARTITION_ID,
              node_id: TARGET_NODE_ID,
              status: ReplicaStatus.ACTIVE,
              raft_role: 'follower',
              address: `${TARGET_NODE_ID}/partition/${TARGET_REPLICA_ID}`,
            },
          ],
        },
      });
      coordinator.initialize();
      installActualReplicaObservationResolver(
        coordinator,
        ReplicaStatus.ACTIVE,
      );
      const originalEvaluateRemoveSafety =
        coordinator.workflowOwner.evaluateRemoveSafety.bind(
          coordinator.workflowOwner,
        );
      coordinator.workflowOwner.evaluateRemoveSafety = async (operation) => {
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
          partitionId: PARTITION_ID,
          entityType: 'partition',
          entityId: PARTITION_ID,
          nodeId: TARGET_NODE_ID,
          sourceNodeId: SOURCE_NODE_ID,
          replicaId: SOURCE_REPLICA_ID,
        });

        operation.replicaId = TARGET_REPLICA_ID;
        operation.sourceReplicaId = SOURCE_REPLICA_ID;
        await coordinator.workflowOwner.updateStep(
          operation,
          WORKFLOW_STEP.ACTIVE,
        );

        const progressed =
          await coordinator.workflowOwner.reconcileOperationLifecycle(operation);
        const persistedOperation =
          await coordinator.getOperation(operation.operationId);

        t.equal(
          progressed,
          OPERATION_RECONCILE_OUTCOME.ADVANCED,
          'ACTIVE system REPLACE should continue source removal',
        );
        t.equal(
          deliveries.length,
          1,
          'ACTIVE system REPLACE should dispatch source removal once',
        );
        t.equal(
          deliveries[0]?.target,
          `${SOURCE_NODE_ID}/service/replica-handler`,
          'source removal should dispatch to the recorded source node',
        );
        t.equal(
          deliveries[0]?.payload?.type,
          ReplicaOperationMessageType.REMOVE_REPLICA,
          'ACTIVE system REPLACE should dispatch a remove request',
        );
        t.equal(
          deliveries[0]?.payload?.replicaId,
          SOURCE_REPLICA_ID,
          'source removal should target the exact recorded source replica',
        );
        t.not(
          deliveries[0]?.payload?.replicaId,
          `${PARTITION_ID}-r2`,
          'source removal must not treat an unrelated removed sibling as completion',
        );
        t.equal(
          persistedOperation?.workflowStep,
          WORKFLOW_STEP.STOPPING,
          'REPLACE should remain in source-removal progress rather than completing from missing sibling evidence',
        );
      } finally {
        await coordinator.shutdown();
      }
    },
  );

  await t.test(
    'RebalanceCoordinator keeps critical REPLACE in syncing while the authoritative replacement remains learner',
    async (t) => {
      const deliveries = [];
      const messageRouter = {
        async deliver(target, payload) {
          deliveries.push({target, payload});
          return buildDeliveryEnvelope({acknowledged: true}, {
            status: deliveries.length === 1 ? 'initiated' : 'completed',
          });
        },
        getConnectionState: () => 'connected',
        pingNode: async () => true,
        isOutboundQueueAvailable: () => true,
      };
      const authoritativeLearnerRow = {
        service_id: 'nodes-p1-r4', replica_id: 'nodes-p1-r4',
        service_type: 'partition', partition_id: 'nodes-p1', node_id: 'node-d',
        status: ReplicaStatus.ACTIVE, raft_role: 'learner',
        address: 'node-d/partition/nodes-p1-r4', created_at: 1, state_entered_at: 1,
      };
      const coordinator = createTestCoordinator({
        nodeId: 'node-d',
        enableTimeouts: false,
        messageRouter,
        sqlQueryResults: {
          'FROM services WHERE service_id = ?': {
            success: true,
            rows: [authoritativeLearnerRow],
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
        authoritativeLearnerRow.service_id = operation.replicaId;
        authoritativeLearnerRow.replica_id = operation.replicaId;

        await coordinator.executeOperation(operation);
        await coordinator.reconcileOperationLifecycle(operation);
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
    'critical ACTIVE REPLACE dispatches source removal when replacement is a syncing voter',
    async (t) => {
      const PARTITION_ID = 'nodes-p1';
      const SOURCE_NODE_ID = 'node-a';
      const SECOND_NODE_ID = 'node-b';
      const THIRD_NODE_ID = 'node-c';
      const TARGET_NODE_ID = 'node-d';
      const SOURCE_REPLICA_ID = `${PARTITION_ID}-r1`;
      const SECOND_REPLICA_ID = `${PARTITION_ID}-r2`;
      const THIRD_REPLICA_ID = `${PARTITION_ID}-r3`;
      const TARGET_REPLICA_ID = `${PARTITION_ID}-r4`;
      const SERVICE_TYPE_PARTITION = 'partition';
      const NODE_STATUS_ACTIVE = 'active';
      const CONNECTION_STATE_READY = 'ready';
      const RAFT_ROLE_FOLLOWER = 'follower';
      const READY_LEASE_EXTENSION_MS = 60000;
      const readyLeaseExpiresAt = Date.now() + READY_LEASE_EXTENSION_MS;
      const deliveries = [];
      const messageRouter = {
        async deliver(target, payload, options) {
          deliveries.push({target, payload, options});
          return buildDeliveryEnvelope({acknowledged: true}, {
            status: ReplicaOperationResponseStatus.INITIATED,
            operationId: payload.operationId,
            replicaId: payload.replicaId,
            nodeId: SOURCE_NODE_ID,
          });
        },
        getConnectionState: () => 'connected',
        pingNode: async () => true,
        isOutboundQueueAvailable: () => true,
      };
      const buildNodeRow = (nodeId) => ({
        node_id: nodeId,
        status: NODE_STATUS_ACTIVE,
        connection_state: CONNECTION_STATE_READY,
        ready_lease_expires_at: readyLeaseExpiresAt,
      });
      const buildReplicaRow = (replicaId, nodeId, status) => ({
        service_id: replicaId,
        replica_id: replicaId,
        service_type: SERVICE_TYPE_PARTITION,
        partition_id: PARTITION_ID,
        node_id: nodeId,
        status,
        raft_role: RAFT_ROLE_FOLLOWER,
        address: `${nodeId}/partition/${replicaId}`,
      });
      const coordinator = createTestCoordinator({
        nodeId: TARGET_NODE_ID,
        enableTimeouts: false,
        messageRouter,
        cacheData: {
          nodes: [
            buildNodeRow(SOURCE_NODE_ID),
            buildNodeRow(SECOND_NODE_ID),
            buildNodeRow(THIRD_NODE_ID),
            buildNodeRow(TARGET_NODE_ID),
          ],
          services: [
            buildReplicaRow(
              SOURCE_REPLICA_ID,
              SOURCE_NODE_ID,
              ReplicaStatus.ACTIVE,
            ),
            buildReplicaRow(
              SECOND_REPLICA_ID,
              SECOND_NODE_ID,
              ReplicaStatus.ACTIVE,
            ),
            buildReplicaRow(
              THIRD_REPLICA_ID,
              THIRD_NODE_ID,
              ReplicaStatus.ACTIVE,
            ),
            buildReplicaRow(
              TARGET_REPLICA_ID,
              TARGET_NODE_ID,
              ReplicaStatus.SYNCING,
            ),
          ],
        },
      });

      try {
        const operation = await coordinator.createOperation({
          type: OperationType.REPLACE,
          partitionId: PARTITION_ID,
          entityType: SERVICE_TYPE_PARTITION,
          entityId: PARTITION_ID,
          nodeId: TARGET_NODE_ID,
          sourceNodeId: SOURCE_NODE_ID,
          replicaId: SOURCE_REPLICA_ID,
        });
        operation.replicaId = TARGET_REPLICA_ID;
        await coordinator.workflowOwner.updateStep(
          operation,
          WORKFLOW_STEP.ACTIVE,
        );

        const progressed =
          await coordinator.reconcileOperationLifecycle(operation);
        const persistedOperation =
          await coordinator.getOperation(operation.operationId);

        t.equal(
          progressed,
          OPERATION_RECONCILE_OUTCOME.ADVANCED,
          'ACTIVE REPLACE should continue once replacement has voter topology',
        );
        t.equal(
          deliveries.length,
          1,
          'source removal should dispatch from syncing follower replacement evidence',
        );
        t.equal(
          deliveries[0]?.payload?.type,
          ReplicaOperationMessageType.REMOVE_REPLICA,
          'source removal should send a remove request',
        );
        t.equal(
          deliveries[0]?.payload?.replicaId,
          SOURCE_REPLICA_ID,
          'source removal should retire the original source replica',
        );
        t.equal(
          persistedOperation?.workflowStep,
          WORKFLOW_STEP.STOPPING,
          'source removal dispatch should advance the workflow to STOPPING',
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
          return buildDeliveryEnvelope({acknowledged: true}, {status: 'initiated'});
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
          entityType: PARTITION_ENTITY_TYPE,
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
          await coordinator.reconcileOperationLifecycle(operation);

        t.equal(
          progressed,
          OPERATION_RECONCILE_OUTCOME.WAITING,
          'critical REPLACE should keep the owner waiting while source removal is deferred',
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
      const sourceRemovalBlocked = true;
      const messageRouter = {
        async deliver(target, payload, options) {
          deliveries.push({target, payload, options});
          return buildDeliveryEnvelope({acknowledged: true}, {
            status: ReplicaOperationResponseStatus.INITIATED,
          });
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
          entityType: PARTITION_ENTITY_TYPE,
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
          await coordinator.reconcileOperationLifecycle(operation);

        t.equal(
          progressed,
          OPERATION_RECONCILE_OUTCOME.WAITING,
          'source removal remains parked with an ACTIVE retry owner',
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
    'critical ACTIVE REPLACE lifecycle re-arms retry when resume dispatch skips',
    async (t) => {
      const TEST_PARTITION_ID = 'control_plane_publications-p1';
      const TEST_ENTITY_TYPE = 'partition';
      const TEST_SOURCE_NODE_ID = 'node-a';
      const TEST_TARGET_NODE_ID = 'node-d';
      const TEST_SOURCE_REPLICA_ID = 'control_plane_publications-p1-r1';
      const TEST_TARGET_REPLICA_ID = 'control_plane_publications-p1-r4';
      const TEST_SKIPPED_RESUME_RESULT = Object.freeze({skipped: true});
      let rearmCount = 0;

      const coordinator = createTestCoordinator({
        nodeId: TEST_TARGET_NODE_ID,
        enableTimeouts: false,
      });

      try {
        const operation = await coordinator.createOperation({
          type: OperationType.REPLACE,
          partitionId: TEST_PARTITION_ID,
          entityType: TEST_ENTITY_TYPE,
          entityId: TEST_PARTITION_ID,
          nodeId: TEST_TARGET_NODE_ID,
          sourceNodeId: TEST_SOURCE_NODE_ID,
          replicaId: TEST_SOURCE_REPLICA_ID,
        });

        operation.replicaId = TEST_TARGET_REPLICA_ID;
        operation.workflowStep = WORKFLOW_STEP.ACTIVE;
        operation.status = ReplicaStatus.ACTIVE;

        coordinator.workflowOwner.reconcileActiveReplaceSourceRemovalProgress =
          async () => false;
        coordinator.workflowOwner.executeOperationFromReconcilePath =
          async () => TEST_SKIPPED_RESUME_RESULT;
        coordinator.workflowOwner.ensurePriorityActiveReplaceRetryArmed =
          (retryOperation) => {
            rearmCount += 1;
            t.equal(
              retryOperation.operationId,
              operation.operationId,
              'retry should be armed for the skipped ACTIVE REPLACE operation',
            );
          };

        const progressed =
          await coordinator.reconcileOperationLifecycle(operation);

        t.equal(
          progressed,
          OPERATION_RECONCILE_OUTCOME.WAITING,
          'skipped ACTIVE REPLACE resume should wait with an armed retry',
        );
        t.equal(
          rearmCount,
          1,
          'skipped ACTIVE REPLACE resume should arm one retry',
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
          entityType: PARTITION_ENTITY_TYPE,
          entityId: 'control_plane_publications-p1',
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
          entityType: PARTITION_ENTITY_TYPE,
          entityId: 'control_plane_publications-p1',
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
          operation.stepsHistory[0]?.sourceReplicaId,
          'control_plane_publications-p1-r1',
          'observed-state adoption should preserve source-replica metadata in persisted step history',
        );
        const persistedObservedRow =
          coordinator.repository.buildReplicaOperationRow(operation);
        const persistedStepsHistory = JSON.parse(
          persistedObservedRow.steps_history,
        );
        t.equal(
          persistedStepsHistory[0]?.sourceReplicaId,
          'control_plane_publications-p1-r1',
          'persisted replica-operation rows should retain the canonical retiring source replica id after observed-state adoption',
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
          entity_type: PARTITION_ENTITY_TYPE,
          entity_id: 'users-p1',
          source_node_id: 'test-node-1',
          target_node_id: 'node-2',
          status: 'active',
          workflow_step: WORKFLOW_STEP.ACTIVE,
        },
        {
          operation_id: 'remove-pending',
          type: OperationType.REMOVE,
          partition_id: 'users-p1',
          entity_type: PARTITION_ENTITY_TYPE,
          entity_id: 'users-p1',
          source_node_id: 'test-node-1',
          target_node_id: 'node-3',
          status: 'pending',
          workflow_step: WORKFLOW_STEP.PENDING,
        },
        {
          operation_id: 'remove-removed',
          type: OperationType.REMOVE,
          partition_id: 'users-p1',
          entity_type: PARTITION_ENTITY_TYPE,
          entity_id: 'users-p1',
          source_node_id: 'test-node-1',
          target_node_id: 'node-4',
          status: 'removed',
          workflow_step: WORKFLOW_STEP.REMOVED,
        },
        {
          operation_id: 'add-active',
          type: OperationType.ADD,
          partition_id: 'users-p1',
          entity_type: PARTITION_ENTITY_TYPE,
          entity_id: 'users-p1',
          source_node_id: 'test-node-1',
          target_node_id: 'node-5',
          status: 'active',
          workflow_step: WORKFLOW_STEP.ACTIVE,
        },
        {
          operation_id: 'add-failed',
          type: OperationType.ADD,
          partition_id: 'users-p1',
          entity_type: PARTITION_ENTITY_TYPE,
          entity_id: 'users-p1',
          source_node_id: 'test-node-1',
          target_node_id: 'node-6',
          status: 'failed',
          workflow_step: WORKFLOW_STEP.FAILED,
        },
      ].map((row) => ({...row, created_at: Date.now(), updated_at: Date.now()}));
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

  await registerReplaceReplicaWorkflowAddTopologyTests({
    t,
    OperationType,
    ReplicaOperationField,
    MoveType,
    createTestCoordinator,
    createTestRebalancer,
  });
}
