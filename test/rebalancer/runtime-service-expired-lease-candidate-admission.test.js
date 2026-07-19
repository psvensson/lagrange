import {test} from '../../src/test-helpers/tap.js';
import {
  EntityType,
  TriggerType,
  UnifiedRebalancer,
} from '../../src/rebalancer/unified-rebalancer.js';
import {
  CONTROL_PLANE_READINESS_DIMENSION,
} from '../../src/control-plane/control-plane-readiness-constants.js';
import {
  createMockCache,
  createMockCdcService,
  createMockCoordinator,
  createMockMessageRouter,
  createMockPolicyService,
  initializeTestEnvironment,
} from './unified-rebalancer-test-support.js';

const SERVICE_ID = 'svc-expired-lease-candidate';
const OWNER_NODE_ID = 'owner-node';
const EXPIRED_NODE_ID = 'expired-preferred-node';
const HEALTHY_NODE_ID = 'healthy-alternative-node';

function createRepairEligibleReadinessService(nodeIds) {
  const publishedRow = Object.freeze({
    status: 'PUBLISHED',
    publicationEpoch: 7,
    publishedActiveNodeIds: [...nodeIds],
    priorityPartitionSummary: {satisfied: true},
  });
  const dimensions = Object.freeze({
    [CONTROL_PLANE_READINESS_DIMENSION.PROCESS_ALIVE]: true,
    [CONTROL_PLANE_READINESS_DIMENSION.CLUSTER_MEMBER_HEALTHY]: true,
    [CONTROL_PLANE_READINESS_DIMENSION.ROUTING_READY]: true,
    [CONTROL_PLANE_READINESS_DIMENSION.LOAD_READY]: true,
    [CONTROL_PLANE_READINESS_DIMENSION.PLACEMENT_ELIGIBLE]: true,
    [CONTROL_PLANE_READINESS_DIMENSION.CONTROL_PLANE_WRITABLE]: true,
    [CONTROL_PLANE_READINESS_DIMENSION.CONTROL_PLANE_PUBLISHED]: true,
    [CONTROL_PLANE_READINESS_DIMENSION
      .CONTROL_PLANE_RECOVERY_ELIGIBLE]: true,
    [CONTROL_PLANE_READINESS_DIMENSION
      .METADATA_PUBLICATION_HEALTHY]: true,
    [CONTROL_PLANE_READINESS_DIMENSION.REPAIR_ELIGIBLE]: true,
    [CONTROL_PLANE_READINESS_DIMENSION.SERVE_ELIGIBLE]: true,
  });
  return {
    membershipPublicationService: {
      getLatestClusterPublicationSync() {
        return publishedRow;
      },
      getLatestPublishedClusterPublicationSync() {
        return publishedRow;
      },
    },
    getNodeReadinessSync(nodeId) {
      return nodeIds.includes(nodeId) ?
        {nodeId, dimensions, reasons: []} :
        null;
    },
  };
}

test('ordinary runtime-service placement excludes an expired-lease ' +
  'repairEligible candidate before planning', async (t) => {
  initializeTestEnvironment();

  const now = Date.now();
  const nodes = [
    {
      node_id: OWNER_NODE_ID,
      status: 'active',
      cpu_usage_percent: 50,
      ready_lease_expires_at: now + 60_000,
    },
    {
      node_id: EXPIRED_NODE_ID,
      status: 'active',
      cpu_usage_percent: 1,
      ready_lease_expires_at: now - 1,
    },
    {
      node_id: HEALTHY_NODE_ID,
      status: 'active',
      cpu_usage_percent: 90,
      ready_lease_expires_at: now + 60_000,
    },
  ];
  const services = [{
    service_id: `${SERVICE_ID}-r1`,
    replica_id: `${SERVICE_ID}-r1`,
    service_type: EntityType.RUNTIME_SERVICE,
    node_id: OWNER_NODE_ID,
    status: 'active',
  }];
  const systemTableCache = createMockCache(nodes, services);
  const readinessService = createRepairEligibleReadinessService(
    nodes.map((node) => node.node_id),
  );
  const createdOperations = [];
  const rebalanceCoordinator = createMockCoordinator();
  rebalanceCoordinator.createOperation = async (operation) => {
    createdOperations.push(operation);
    return {
      operationId: `op-${createdOperations.length}`,
      replicaId: `${SERVICE_ID}-r2`,
      ...operation,
    };
  };
  const rebalancer = new UnifiedRebalancer({
    entityId: SERVICE_ID,
    entityType: EntityType.RUNTIME_SERVICE,
    nodeId: OWNER_NODE_ID,
    systemTableCache,
    cdcIntegrationService: createMockCdcService(),
    tablePolicyService: createMockPolicyService(),
    messageRouter: createMockMessageRouter(),
    rebalanceCoordinator,
    controlPlaneReadinessService: readinessService,
  });
  t.teardown(() => rebalancer.shutdown());
  rebalancer.initialize();
  rebalancer.setLeader(true);
  rebalancer.getConfiguredRebalanceBudget = async () => 5;
  rebalancer.getGlobalInFlightOperationCount = async () => 0;

  t.same(
    rebalancer.getAvailableNodes().map((node) => node.node_id).sort(),
    [HEALTHY_NODE_ID, OWNER_NODE_ID].sort(),
    'candidate discovery removes the expired lease despite repairEligible=true',
  );

  const result = await rebalancer.rebalance(TriggerType.PERIODIC, {
    targetReplicaCount: 2,
    minReplicaCount: 1,
    maxReplicaCount: 3,
    placementConstraints: {
      spreadAcrossNodes: true,
      considerCpuLoad: true,
    },
  });

  t.equal(result.success, true, 'the real rebalance path schedules the deficit');
  t.equal(createdOperations.length, 1, 'exactly one ADD is created');
  t.equal(
    createdOperations[0]?.nodeId,
    HEALTHY_NODE_ID,
    'the current-lease alternative receives the ADD',
  );
  t.not(
    createdOperations[0]?.nodeId,
    EXPIRED_NODE_ID,
    'the expired preferred target is not retried',
  );
});
