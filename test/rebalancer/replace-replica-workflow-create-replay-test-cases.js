import {WORKFLOW_STEP} from '../../src/constants/index.js';
import {OPERATION_RECONCILE_OUTCOME} from '../../src/rebalancer/operation-workflow-reconcile-outcome.js';
import {
  ReplicaOperationMessageType,
  ReplicaOperationResponseStatus,
} from '../../src/rebalancer/replica-operation-constants.js';
import {REPLICA_OPERATION_UPDATE_DISPOSITION} from '../../src/rebalancer/replica-operation-update-disposition.js';
import {OperationType, ReplicaStatus} from '../../src/rebalancer/replica-status.js';
import {buildDeliveryEnvelope} from '../../src/transport/transport-semantic-outcome.js';
import {
  createTestCoordinator,
  installActualReplicaObservationResolver,
} from './test-helpers.js';

export async function registerReplaceReplicaWorkflowCreateReplayTests(t) {
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
            return buildDeliveryEnvelope({acknowledged: true}, {
              status: createDispatchCount === 1 ?
                ReplicaOperationResponseStatus.INITIATED :
                ReplicaOperationResponseStatus.COMPLETED,
            });
          }
          return buildDeliveryEnvelope({acknowledged: true}, {
            status: ReplicaOperationResponseStatus.INITIATED,
          });
        },
        getConnectionState: () => 'connected',
        pingNode: async () => true,
        isOutboundQueueAvailable: () => true,
      };

      const coordinator = createTestCoordinator({
        nodeId: TARGET_NODE_ID,
        enableTimeouts: false,
        messageRouter,
        cacheData: {
          nodes: [SOURCE_NODE_ID, 'node-b', 'node-c', TARGET_NODE_ID].map(
            (nodeId) => ({
              node_id: nodeId,
              status: 'active',
              connection_state: 'ready',
              ready_lease_expires_at: Date.now() + 60_000,
            }),
          ),
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
      installActualReplicaObservationResolver(coordinator, null);

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

        const persistedBeforeReconcile = await coordinator.repository
          .queryReplicaOperationPersistenceAuthorityOperation(operation);
        t.equal(persistedBeforeReconcile.workflowStep, WORKFLOW_STEP.CREATING,
          'the authoritative preimage is still CREATING');
        const writes = [];
        const persist = coordinator.repository.persistOperationUpdate
          .bind(coordinator.repository);
        coordinator.repository.persistOperationUpdate = async (candidate, options) => {
          const outcome = await persist(candidate, options);
          if (candidate.operationId === operation.operationId &&
              outcome.disposition === REPLICA_OPERATION_UPDATE_DISPOSITION.UPDATED) {
            writes.push({
              expectedStep: options?.expectedWorkflowStep,
              committedStep: outcome.operation.workflowStep,
            });
          }
          return outcome;
        };

        const progressed =
          await coordinator.reconcileOperationLifecycle(operation);
        const persistedAfterReconcile = await coordinator.repository
          .queryReplicaOperationPersistenceAuthorityOperation(operation);

        t.same(writes, [
          {expectedStep: WORKFLOW_STEP.CREATING, committedStep: WORKFLOW_STEP.ACTIVE},
          {expectedStep: WORKFLOW_STEP.ACTIVE, committedStep: WORKFLOW_STEP.STOPPING},
        ], 'the reconcile attempt committed both exact workflow CAS updates');
        t.equal(
          progressed,
          OPERATION_RECONCILE_OUTCOME.ADVANCED,
          'reconciliation reports its committed progress while source retirement remains pending',
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
          persistedAfterReconcile.workflowStep,
          WORKFLOW_STEP.STOPPING,
          'replayed create completion should durably leave REPLACE in STOPPING',
        );
      } finally {
        await coordinator.shutdown();
      }
    },
  );

  await t.test(
    'RebalanceCoordinator keeps critical REPLACE create ownership in ' +
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
            return buildDeliveryEnvelope({acknowledged: true}, {
              status: createDispatchCount === 1 ?
                ReplicaOperationResponseStatus.INITIATED :
                ReplicaOperationResponseStatus.COMPLETED,
            });
          }
          return buildDeliveryEnvelope({acknowledged: true}, {
            status: ReplicaOperationResponseStatus.INITIATED,
          });
        },
        getConnectionState: () => 'connected',
        pingNode: async () => true,
        isOutboundQueueAvailable: () => true,
      };

      const coordinator = createTestCoordinator({
        nodeId: TARGET_NODE_ID,
        enableTimeouts: false,
        messageRouter,
        cacheData: {
          nodes: [SOURCE_NODE_ID, 'node-b', 'node-c', TARGET_NODE_ID].map(
            (nodeId) => ({
              node_id: nodeId,
              status: 'active',
              connection_state: 'ready',
              ready_lease_expires_at: Date.now() + 60_000,
            }),
          ),
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
      installActualReplicaObservationResolver(
        coordinator,
        ReplicaStatus.CREATING,
      );

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
          await coordinator.reconcileOperationLifecycle(operation);

        t.equal(
          progressed,
          OPERATION_RECONCILE_OUTCOME.WAITING,
          'visible creating status should keep the owner waiting instead of replaying create dispatch',
        );
        t.equal(
          deliveries.length,
          1,
          'no second create dispatch should be sent once target visibility is already creating',
        );
        t.equal(
          deliveries[1]?.payload?.type,
          undefined,
          'reconciliation should not replay the replacement create phase',
        );
        t.equal(
          deliveries[1]?.payload?.replicaId,
          undefined,
          'no replayed create should be emitted while target visibility already exists',
        );
        t.equal(
          deliveries[2]?.payload?.type,
          undefined,
          'source removal should not be dispatched before target progress advances beyond creating',
        );
        t.equal(
          deliveries[2]?.payload?.replicaId,
          undefined,
          'no retiring-source dispatch should be emitted from a same-step creating replay',
        );
        t.equal(
          operation.workflowStep,
          WORKFLOW_STEP.CREATING,
          'the operation should remain in CREATING while the visible target keeps creating',
        );
      } finally {
        await coordinator.shutdown();
      }
    },
  );

  await t.test(
    'RebalanceCoordinator keeps critical REPLACE create ownership in ' +
      'CREATING when observed target status remains pending',
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
            return buildDeliveryEnvelope({acknowledged: true}, {
              status: createDispatchCount === 1 ?
                ReplicaOperationResponseStatus.INITIATED :
                ReplicaOperationResponseStatus.COMPLETED,
            });
          }
          return buildDeliveryEnvelope({acknowledged: true}, {
            status: ReplicaOperationResponseStatus.INITIATED,
          });
        },
        getConnectionState: () => 'connected',
        pingNode: async () => true,
        isOutboundQueueAvailable: () => true,
      };

      const coordinator = createTestCoordinator({
        nodeId: TARGET_NODE_ID,
        enableTimeouts: false,
        messageRouter,
        cacheData: {
          nodes: [SOURCE_NODE_ID, 'node-b', 'node-c', TARGET_NODE_ID].map(
            (nodeId) => ({
              node_id: nodeId,
              status: 'active',
              connection_state: 'ready',
              ready_lease_expires_at: Date.now() + 60_000,
            }),
          ),
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
      installActualReplicaObservationResolver(
        coordinator,
        ReplicaStatus.PENDING,
      );

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
          await coordinator.reconcileOperationLifecycle(operation);

        t.equal(
          progressed,
          OPERATION_RECONCILE_OUTCOME.WAITING,
          'visible pending status should keep the owner waiting instead of replaying create dispatch',
        );
        t.equal(
          deliveries.length,
          1,
          'no second create dispatch should be sent once target visibility is already pending',
        );
        t.equal(
          deliveries[1]?.payload?.type,
          undefined,
          'reconciliation should not replay the replacement create phase from visible pending target state',
        );
        t.equal(
          operation.workflowStep,
          WORKFLOW_STEP.CREATING,
          'the operation should remain in CREATING while the visible target stays pending',
        );
      } finally {
        await coordinator.shutdown();
      }
    },
  );
}
