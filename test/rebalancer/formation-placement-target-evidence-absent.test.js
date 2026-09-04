/**
 * Formation placement-target eligibility under evidence-absent readiness.
 *
 * Cold-formation spread of a formation-liveness-dependency ledger partition
 * needs a placement target on a barrier-held joiner, but joiner readiness
 * denies with evidence-absent reasons until the barrier the spread releases
 * grants its READY lease. The available-nodes filter must keep such joiners
 * placement-eligible for formation-liveness partitions ONLY; substantive
 * denials and ordinary partitions keep the strict readiness filter.
 * Pinned from the natural five-node GCP run archived as
 * movielens-lagrange-service-affinity-live-2026-08-15T13-12-43-108Z
 * (joiners held by the formation barrier with voters 3 distinct 1).
 */
import {test} from '../../src/test-helpers/tap.js';
import {
  CONTROL_PLANE_READINESS_DIMENSION,
  CONTROL_PLANE_READINESS_REASON,
} from '../../src/control-plane/control-plane-readiness-constants.js';
import {EntityType} from '../../src/rebalancer/unified-rebalancer.js';
import {
  createMockCache,
  createMockControlPlaneReadinessService,
  createTestCoordinator,
  createTestRebalancer,
} from './test-helpers.js';

const SEED_NODE_ID = 'node-seed-placement';
const JOINER_NODE_ID = 'node-joiner-placement';
const SICK_NODE_ID = 'node-sick-placement';
const LEDGER_PARTITION_ID = 'replica_operations-p1';
const USER_PARTITION_ID = 'p-user-placement-1';

function createNodeRow(nodeId) {
  return {
    node_id: nodeId,
    status: 'active',
    connection_state: 'ready',
    last_heartbeat: Date.now(),
    ready_lease_expires_at: Date.now() + 60000,
  };
}

function eligibleReadiness(nodeId) {
  const dimensions = {};
  for (const dimension of Object.values(CONTROL_PLANE_READINESS_DIMENSION)) {
    dimensions[dimension] = true;
  }
  return {nodeId, dimensions, reasons: [], reasonCodes: []};
}

function deniedReadiness(nodeId, reasonCodes) {
  const dimensions = {};
  for (const dimension of Object.values(CONTROL_PLANE_READINESS_DIMENSION)) {
    dimensions[dimension] = false;
  }
  return {
    nodeId,
    dimensions,
    reasons: reasonCodes.map((code) => ({code})),
    reasonCodes: [...reasonCodes],
  };
}

function shutdownPlacementStack(stack) {
  stack.rebalancer.shutdown();
  if (typeof stack.coordinator.shutdown === 'function') {
    stack.coordinator.shutdown();
  }
}

function createPlacementStack(
  partitionId,
  readinessByNodeId,
  livenessProjectionByNodeId = null,
) {
  const cache = createMockCache({
    nodes: [
      createNodeRow(SEED_NODE_ID),
      createNodeRow(JOINER_NODE_ID),
      createNodeRow(SICK_NODE_ID),
    ],
    services: [],
    partitions: [{partition_id: partitionId, table_id: partitionId
      .replace(/-p[0-9]+$/, '')}],
    replicaOperations: [],
  });
  const readinessService = createMockControlPlaneReadinessService({
    systemTableCache: cache,
    readinessByNodeId,
    livenessProjectionByNodeId,
  });
  const coordinator = createTestCoordinator({
    nodeId: SEED_NODE_ID,
    systemTableCache: cache,
    controlPlaneReadinessService: readinessService,
  });
  const rebalancer = createTestRebalancer({
    entityId: partitionId,
    entityType: EntityType.PARTITION,
    nodeId: SEED_NODE_ID,
    systemTableCache: cache,
    rebalanceCoordinator: coordinator,
    controlPlaneReadinessService: readinessService,
  });
  rebalancer.setLeader(true);
  return {rebalancer, coordinator};
}

const EVIDENCE_ABSENT_CODES = [
  CONTROL_PLANE_READINESS_REASON.PLANNING_SNAPSHOT_REFRESH_PENDING,
  'owner_evidence_missing',
];

test('a formation-liveness ledger partition keeps evidence-absent joiners ' +
  'placement-eligible while substantive denials stay excluded', async (t) => {
  const stack = createPlacementStack(LEDGER_PARTITION_ID, {
    [SEED_NODE_ID]: eligibleReadiness(SEED_NODE_ID),
    [JOINER_NODE_ID]:
      deniedReadiness(JOINER_NODE_ID, EVIDENCE_ABSENT_CODES),
    [SICK_NODE_ID]: deniedReadiness(SICK_NODE_ID, [
      'cluster_member_unhealthy',
      ...EVIDENCE_ABSENT_CODES,
    ]),
  });
  t.teardown(() => shutdownPlacementStack(stack));
  const availableNodeIds = stack.rebalancer.getAvailableNodes()
    .map((node) => node.node_id);
  t.ok(availableNodeIds.includes(SEED_NODE_ID),
    'the ready seed is placement-eligible');
  t.ok(availableNodeIds.includes(JOINER_NODE_ID),
    'an evidence-absent barrier-held joiner stays placement-eligible for ' +
      'the formation-liveness ledger partition');
  t.notOk(availableNodeIds.includes(SICK_NODE_ID),
    'a substantively denied node is never placement-eligible');
  t.end();
});

test('an ordinary partition keeps the strict readiness placement filter',
  async (t) => {
    const stack = createPlacementStack(USER_PARTITION_ID, {
      [SEED_NODE_ID]: eligibleReadiness(SEED_NODE_ID),
      [JOINER_NODE_ID]:
        deniedReadiness(JOINER_NODE_ID, EVIDENCE_ABSENT_CODES),
    }, {
      [SEED_NODE_ID]: Object.freeze({readyNow: true}),
      [JOINER_NODE_ID]: Object.freeze({readyNow: false}),
    });
    t.teardown(() => shutdownPlacementStack(stack));
    const availableNodeIds = stack.rebalancer.getAvailableNodes()
      .map((node) => node.node_id);
    t.ok(availableNodeIds.includes(SEED_NODE_ID),
      'the ready seed is placement-eligible');
    t.notOk(availableNodeIds.includes(JOINER_NODE_ID),
      'evidence-absent denial never widens ordinary-partition placement');
    t.end();
  });

test('an empty denial reason list fails closed for placement', async (t) => {
  const stack = createPlacementStack(LEDGER_PARTITION_ID, {
    [SEED_NODE_ID]: eligibleReadiness(SEED_NODE_ID),
    [JOINER_NODE_ID]: deniedReadiness(JOINER_NODE_ID, []),
  });
  t.teardown(() => shutdownPlacementStack(stack));
  const availableNodeIds = stack.rebalancer.getAvailableNodes()
    .map((node) => node.node_id);
  t.notOk(availableNodeIds.includes(JOINER_NODE_ID),
    'an ambiguous empty-reason denial stays excluded');
  t.end();
});
