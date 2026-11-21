import {readOriginalCreateBootstrapMembership} from '../../src/rebalancer/replica-status.js';
import {createMockCache} from './test-helpers.js';
import {buildDeliveryEnvelope} from '../../src/transport/transport-semantic-outcome.js';
export async function registerReplaceReplicaWorkflowAddTopologyTests({
  t,
  OperationType,
  ReplicaOperationField,
  MoveType,
  createTestCoordinator,
  createTestRebalancer,
}) {
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
      const cache = createMockCache({nodes: [
        {node_id: 'node-1', status: 'active'},
        {node_id: 'node-2', status: 'active'},
      ]});
      const coordinator = createTestCoordinator({
        systemTableCache: cache,
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
        systemTableCache: cache,
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
    'RebalanceCoordinator forwards the committed bootstrap topology on CREATE_REPLICA',
    async (t) => {
      const deliveries = [];
      const messageRouter = {
        async deliver(target, payload) {
          deliveries.push({target, payload});
          return buildDeliveryEnvelope({acknowledged: true}, {status: 'initiated'});
        },
      };

      const coordinator = createTestCoordinator({
        nodeId: 'seed-node',
        enableTimeouts: false,
        messageRouter,
        cacheData: {
          services: [
            {service_id: 'users-p1-r1', replica_id: 'users-p1-r1',
              service_type: 'partition', partition_id: 'users-p1',
              node_id: 'node-1', status: 'active', raft_role: 'leader',
              address: 'node-1/partition/users-p1-r1'},
            {service_id: 'users-p1-r2', replica_id: 'users-p1-r2',
              service_type: 'partition', partition_id: 'users-p1',
              node_id: 'node-2', status: 'active', raft_role: 'follower',
              address: 'node-2/partition/users-p1-r2'},
          ],
        },
      });
      coordinator.initialize();

      try {
        const operation = await coordinator.createOperation({
          type: OperationType.ADD,
          partitionId: 'users-p1',
          entityType: 'partition',
          entityId: 'users-p1',
          nodeId: 'node-3',
        });
        operation[ReplicaOperationField.REPLICA_IDS] = ['users-p1-r99'];

        await coordinator.executeOperation(operation);

        const persisted = await coordinator.queryOperationById(operation.operationId);
        const stamp = readOriginalCreateBootstrapMembership(persisted.stepsHistory);
        t.ok(stamp, 'the repository persisted the original bootstrap stamp');
        t.same(
          deliveries[0]?.payload?.[ReplicaOperationField.BOOTSTRAP_MEMBERSHIP],
          stamp,
          'the target receives the original durable membership stamp',
        );

        t.equal(
          deliveries[0]?.payload?.[ReplicaOperationField.OPERATION_TYPE],
          OperationType.ADD,
          'CREATE_REPLICA payloads should carry ADD intent explicitly when the target is bootstrapping a new voter',
        );
        t.same(
          deliveries[0]?.payload?.[ReplicaOperationField.REPLICA_IDS]?.toSorted(),
          ['users-p1-r1', 'users-p1-r2', 'users-p1-r3'],
          'the committed voters and joining replica define the wire topology',
        );
        t.equal(
          deliveries[0]?.payload?.[ReplicaOperationField.PEER_ADDRESSES],
          undefined,
          'the CREATE_REPLICA payload carries no peer-address hint list',
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
          return buildDeliveryEnvelope({acknowledged: true}, {status: 'initiated'});
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
        t.equal(
          deliveries[0]?.payload?.[ReplicaOperationField.PEER_ADDRESSES],
          undefined,
          'the message-group create payload carries no peer-address hint list',
        );
      } finally {
        await coordinator.shutdown();
      }
    },
  );
}
