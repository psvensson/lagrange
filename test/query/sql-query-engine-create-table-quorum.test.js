import {buildDeliveryEnvelope} from '../../src/transport/transport-semantic-outcome.js';
import {test} from '../../src/test-helpers/tap.js';
import {SQLQueryEngine} from '../../src/query/sql-query-engine.js';
import {TABLES} from '../../src/constants/index.js';
import {ConfigurationManager} from '../../src/config/configuration-manager.js';
import {createProvisioningReadyService} from './sql-query-engine-test-support.js';
const config = ConfigurationManager.getInstance();
config.initialize();

function createMockMessageRouter() {
  return {
    deliver: async () => (buildDeliveryEnvelope({acknowledged: true}, {success: true})),
  };
}

test('SQLQueryEngine - default CREATE TABLE quorum does not fall back ' +
  'below sealed quorum minimum', async (t) => {
  const partitionId = 'tbl-default-quorum-recovery-p1';
  const localNodeId = 'node-a';
  const checkedTargetNodeIds = [];
  const createdTargetNodeIds = [];
  const executedTargetNodeIds = [];
  const services = [];
  const nodes = [
    {node_id: localNodeId, status: 'active', connection_state: 'ready'},
    {node_id: 'node-b', status: 'active', connection_state: 'ready'},
    {node_id: 'node-c', status: 'active', connection_state: 'ready'},
  ];

  const cache = {
    filter(type, predicate) {
      if (type === TABLES.NODES) {
        return nodes.filter(predicate);
      }
      if (type === TABLES.SERVICES) {
        return services.filter(predicate);
      }
      return [];
    },
    getAll(type) {
      if (type === TABLES.NODES) {
        return nodes;
      }
      if (type === TABLES.SERVICES) {
        return services;
      }
      return [];
    },
  };

  const buildDeniedAdmission = (nodeId) => ({
    allowed: false,
    decisionType: 'blocked',
    blockingReasons: [
      'insufficient_placement_eligible_nodes',
      'control_plane_write_unhealthy',
    ],
    ineligibleNodes: [{
      nodeId,
      failedDimensions: ['controlPlaneWritable'],
      reasonCodes: [
        'control_plane_write_unhealthy',
        'cluster_member_unhealthy',
      ],
    }],
  });
  const rebalanceCoordinator = {
    async checkProvisioningAdmission(move) {
      checkedTargetNodeIds.push(move.nodeId);
      if (move.nodeId === localNodeId) {
        return {allowed: true};
      }
      return {
        allowed: false,
        decisionType: 'blocked',
        admissionResult: buildDeniedAdmission(move.nodeId),
      };
    },
    async createOperation(move) {
      createdTargetNodeIds.push(move.nodeId);
      return {
        ...move,
        operationId: `op-${move.nodeId}`,
        replicaId: `${partitionId}-r${createdTargetNodeIds.length}`,
        createdAt: Date.now(),
        stepsHistory: [{}],
      };
    },
    async executeOperation(operation) {
      const targetNodeId = operation.targetNodeId || operation.nodeId;
      executedTargetNodeIds.push(targetNodeId);
      services.push({
        replica_id: operation.replicaId || operation.replica_id,
        partition_id: operation.partitionId,
        service_type: 'partition',
        status: 'active',
        node_id: targetNodeId,
        raft_role: 'leader',
        address: `${targetNodeId}/partition/${operation.partitionId}`,
      });
      return {success: true};
    },
  };

  const engine = new SQLQueryEngine({
    nodeId: localNodeId,
    systemCache: cache,
    messageRouter: createMockMessageRouter(),
    rebalanceCoordinator,
    controlPlaneReadinessService: createProvisioningReadyService(cache),
    tablePartitionProvisioningTimeoutMs: 10,
    tablePartitionProvisioningPollIntervalMs: 1,
    tablePartitionTargetNodeConvergenceTimeoutMs: 1,
  });
  engine.waitForRoutablePartitionServiceCount = async () => {};
  engine.waitForPartitionLeaderService = async () => {};

  await t.rejects(
    engine.provisionInitialTablePartition({
      partitionId,
      replicaCount: 3,
      minimumRoutableReplicaCount: 2,
      minimumRoutableReplicaCountWasDefaulted: true,
    }),
    /insufficient/i,
    'provisioning below quorum is rejected without lowering the quorum minimum',
  );
});
