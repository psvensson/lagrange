import {test} from '../../src/test-helpers/tap.js';
import {
  CONTROL_PLANE_READINESS_DIMENSION,
} from '../../src/control-plane/control-plane-readiness-constants.js';
import {
  EntityType,
  NodeStatus,
  UnifiedRebalancer,
} from '../../src/rebalancer/unified-rebalancer.js';
import {
  createMockCache,
  createMockCdcService,
  createMockMessageRouter,
  createMockPolicyService,
  createNodeEndpoint,
  createPostgresWireEndpoint,
  initializeTestEnvironment,
} from './unified-rebalancer-test-support.js';

const NODE_IDS = Object.freeze([
  'node-1',
  'node-2',
  'node-3',
  'node-4',
  'node-5',
]);
const RECOVERY_NODE_IDS = new Set(NODE_IDS.slice(0, 3));
const EXPIRED_LEASE = 1;

function nodeRows() {
  return NODE_IDS.map((nodeId) => ({
    node_id: nodeId,
    status: NodeStatus.ACTIVE,
    connection_state: 'ready',
    ready_lease_expires_at: EXPIRED_LEASE,
  }));
}

function concentratedServices() {
  return [
    {
      service_id: 'nodes-p1-r1',
      partition_id: 'nodes-p1',
      service_type: EntityType.PARTITION,
      node_id: 'node-1',
      status: 'active',
      raft_role: 'leader',
    },
    {
      service_id: 'nodes-p1-r2',
      partition_id: 'nodes-p1',
      service_type: EntityType.PARTITION,
      node_id: 'node-1',
      status: 'active',
      raft_role: 'follower',
    },
    {
      service_id: 'nodes-p1-r3',
      partition_id: 'nodes-p1',
      service_type: EntityType.PARTITION,
      node_id: 'node-1',
      status: 'active',
      raft_role: 'follower',
    },
  ];
}

function readinessService(options = {}) {
  const eligibleNodeIds =
    options.eligibleNodeIds instanceof Set ?
      options.eligibleNodeIds :
      RECOVERY_NODE_IDS;
  const omitRecoveryEligibility =
    options.omitRecoveryEligibility === true;
  const fallbackDimensionsSatisfied =
    options.fallbackDimensionsSatisfied === true;
  return {
    getNodeReadinessSync(nodeId) {
      const recoveryEligible = eligibleNodeIds.has(nodeId);
      const sourceNode = nodeId === 'node-1';
      const dimensions = {
        [CONTROL_PLANE_READINESS_DIMENSION.PROCESS_ALIVE]:
          recoveryEligible,
        [CONTROL_PLANE_READINESS_DIMENSION.CLUSTER_MEMBER_HEALTHY]:
          recoveryEligible,
        [CONTROL_PLANE_READINESS_DIMENSION.ROUTING_READY]:
          recoveryEligible,
        [CONTROL_PLANE_READINESS_DIMENSION.LOAD_READY]:
          recoveryEligible,
        [CONTROL_PLANE_READINESS_DIMENSION.PLACEMENT_ELIGIBLE]:
          recoveryEligible,
        [CONTROL_PLANE_READINESS_DIMENSION.CONTROL_PLANE_WRITABLE]:
          recoveryEligible,
        [CONTROL_PLANE_READINESS_DIMENSION
          .METADATA_PUBLICATION_HEALTHY]:
            fallbackDimensionsSatisfied ? recoveryEligible : sourceNode,
        [CONTROL_PLANE_READINESS_DIMENSION.REPAIR_ELIGIBLE]:
          fallbackDimensionsSatisfied ? recoveryEligible : sourceNode,
        [CONTROL_PLANE_READINESS_DIMENSION.SERVE_ELIGIBLE]:
          fallbackDimensionsSatisfied ? recoveryEligible : sourceNode,
      };
      if (!omitRecoveryEligibility) {
        dimensions[
          CONTROL_PLANE_READINESS_DIMENSION
            .CONTROL_PLANE_RECOVERY_ELIGIBLE
        ] = recoveryEligible;
      }
      return {
        nodeId,
        dimensions,
        reasons: recoveryEligible ? [] : [{code: 'ready_lease_expired'}],
      };
    },
  };
}

function createHarness(options = {}) {
  const nodes = nodeRows();
  const services = concentratedServices();
  const partitions = [{
    partition_id: 'nodes-p1',
    table_id: 'nodes',
    replica_count: 3,
    leader_node_id: 'node-1',
  }];
  const tables = [{
    table_id: 'nodes',
    table_policies: JSON.stringify({
      minReplicaCount: 3,
      targetReplicaCount: 3,
      maxReplicaCount: 5,
      placementConstraints: {spreadAcrossNodes: true},
    }),
  }];
  const replicaOperations = Array.isArray(options.replicaOperations) ?
    options.replicaOperations :
    [];
  const cache = createMockCache(
    nodes,
    services,
    partitions,
    tables,
    replicaOperations,
    [...RECOVERY_NODE_IDS].map(createNodeEndpoint),
    [...RECOVERY_NODE_IDS].map(createPostgresWireEndpoint),
  );
  const createdMoves = [];
  const coordinator = {
    getMoveSafetyError: () => null,
    canStartAddOperation: async () => true,
    canStartRemoveOperation: async () => true,
    createOperation: async (move) => {
      createdMoves.push({...move});
      return {
        operationId: `op-${createdMoves.length}`,
        type: move.type,
        partitionId: 'nodes-p1',
        targetNodeId: move.nodeId,
        status: 'pending',
        workflowStep: 'pending',
      };
    },
    executeOperation: async () => ({success: true}),
    getStats: () => ({
      operationsCreated: createdMoves.length,
      operationsCompleted: 0,
      operationsFailed: 0,
      operationsTimedOut: 0,
      inFlightOperations: 0,
      totalOperations: createdMoves.length,
    }),
    storageAccountingService: {
      estimateReplicaBytes: () => 1,
    },
    storageAdmissionService: {
      checkAdd: async () => ({decision: 'allow'}),
      checkReplace: async () => ({decision: 'allow'}),
    },
  };
  const disconnectedNodeIds =
    options.disconnectedNodeIds instanceof Set ?
      options.disconnectedNodeIds :
      new Set();
  const messageRouter = createMockMessageRouter();
  messageRouter.getConnectionState = (nodeId) =>
    disconnectedNodeIds.has(nodeId) ? 'disconnected' : 'connected';
  messageRouter.getConnectedNodes = () =>
    NODE_IDS.filter((nodeId) => !disconnectedNodeIds.has(nodeId));

  const rebalancer = new UnifiedRebalancer({
    entityId: 'nodes-p1',
    entityType: EntityType.PARTITION,
    nodeId: 'node-1',
    systemTableCache: cache,
    cdcIntegrationService: createMockCdcService(),
    tablePolicyService: createMockPolicyService(partitions, tables),
    messageRouter,
    rebalanceCoordinator: coordinator,
    controlPlaneReadinessService:
      options.controlPlaneReadinessService || readinessService(),
  });
  rebalancer.initialize();
  rebalancer.isLeader = options.isLeader !== false;
  rebalancer.isStabilized = () => true;
  rebalancer.scheduleNextCheck = () => {};
  rebalancer.getConfiguredRebalanceBudget = async () => 5;
  rebalancer.getGlobalInFlightOperationCount = async () => 0;
  if (options.inventoryUnavailable === true) {
    let captureCount = 0;
    rebalancer.movePlanner.captureReplicaInventorySourceState = () => {
      captureCount += 1;
      return {
        capturedAtMs: captureCount,
        committedRows: {
          revision: captureCount,
          lastAppliedAtMs: captureCount,
          causeId: `services-${captureCount}`,
        },
        inFlightOperations: {
          revision: 1,
          lastAppliedAtMs: 1,
          causeId: 'operations-1',
        },
      };
    };
  }
  return {createdMoves, rebalancer};
}

test('real checkRebalance emits one serial nodes-p1 formation move', async (t) => {
  initializeTestEnvironment();
  const {createdMoves, rebalancer} = createHarness();

  await rebalancer.checkRebalance();

  t.equal(createdMoves.length, 1, 'one executable move crosses the coordinator');
  t.equal(createdMoves[0].type, 'REPLACE', 'spread stays count-neutral');
  t.equal(
    rebalancer.isControlPlanePriorityPartition(),
    false,
    'the real path does not grant broad priority identity',
  );
  t.equal(
    rebalancer.isPriorityControlPlaneRecoveryActive(),
    false,
    'priority recovery scheduling remains closed',
  );
  t.equal(
    rebalancer.isEmergencyPriorityControlPlanePartition('nodes-p1'),
    false,
    'the partition does not enter the emergency budget lane',
  );
  t.end();
});

test('real checkRebalance fails closed on target and owner evidence gaps',
  async (t) => {
    initializeTestEnvironment();
    const cases = [
      {
        name: 'sub-quorum recovery eligibility',
        options: {
          controlPlaneReadinessService: readinessService({
            eligibleNodeIds: new Set(['node-1']),
          }),
        },
      },
      {
        name: 'missing recovery eligibility evidence',
        options: {
          controlPlaneReadinessService: readinessService({
            omitRecoveryEligibility: true,
            fallbackDimensionsSatisfied: true,
          }),
        },
      },
      {
        name: 'target transport unavailable',
        options: {
          disconnectedNodeIds: new Set(['node-2', 'node-3']),
        },
      },
      {
        name: 'replica inventory changes during capture',
        options: {inventoryUnavailable: true},
      },
      {
        name: 'source actual is unavailable despite an eligible quorum',
        options: {
          controlPlaneReadinessService: readinessService({
            eligibleNodeIds: new Set(['node-2', 'node-3', 'node-4']),
          }),
        },
      },
      {
        name: 'leader unavailable',
        options: {isLeader: false},
      },
      {
        name: 'existing transition unresolved',
        options: {
          replicaOperations: [{
            operation_id: 'existing-replace',
            partition_id: 'nodes-p1',
            entity_type: 'partition',
            entity_id: 'nodes-p1',
            operation_type: 'REPLACE',
            status: 'pending',
            workflow_step: 'creating',
            source_replica_id: 'nodes-p1-r2',
            source_node_id: 'node-1',
            target_node_id: 'node-2',
          }],
        },
      },
    ];

    for (const entry of cases) {
      const {createdMoves, rebalancer} = createHarness(entry.options);
      await rebalancer.checkRebalance();
      t.equal(createdMoves.length, 0, `${entry.name} emits no new move`);
    }
    t.end();
  });
