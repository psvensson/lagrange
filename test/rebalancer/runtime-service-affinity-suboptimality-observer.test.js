/**
 * Discriminator for quest runtime-service-affinity-suboptimality-observer
 * (theory: placement-affinity-suboptimality-is-never-observed-by-the-planning-
 * gate). Live forensics 2026-07-20T12:37: a runtime service at target count
 * with spread satisfied sat on the two non-data nodes for 300s while fresh
 * attribution taught that the data lives elsewhere — no planning round ever
 * ran because isSuboptimalState tests only count and spread. The observer must
 * flag that state as suboptimal using the canonical placement-owner affinity
 * score constants (challenger must beat an incumbent by more than the
 * incumbent movement-cost margin), and must change nothing for entities
 * without preferDataAffinity.
 */

import {test} from '../../src/test-helpers/tap.js';
import {MovePlanner} from '../../src/rebalancer/move-planner.js';
import {REBALANCER_ENTITY_TYPE}
  from '../../src/rebalancer/rebalancer-constants.js';
import {ReplicaStatus} from '../../src/rebalancer/replica-status.js';
import {PLACEMENT_OWNER_DATA_AFFINITY_SCORE}
  from '../../src/rebalancer/placement-owner-constants.js';
import {isDataAffinityPlacementSuboptimal}
  from '../../src/rebalancer/placement-owner-decision.js';

const SERVICE_ID = 'svc-movielens-topn';

function node(nodeId) {
  return {node_id: nodeId, status: 'active'};
}

function replica(replicaId, nodeId) {
  return {
    service_id: replicaId,
    replica_id: replicaId,
    node_id: nodeId,
    status: ReplicaStatus.ACTIVE,
  };
}

function createMoveStateProvider(nodes, currentReplicas) {
  return {
    isLeader: true,
    nodeId: 'node-0',
    replicaId: `${SERVICE_ID}-r1`,
    getAvailableNodes: () => nodes,
    getCurrentReplicas: () => currentReplicas,
    getHealthyReplicas: (replicas) =>
      replicas.filter((row) => row.status === ReplicaStatus.ACTIVE),
    getInFlightOperations: () => [],
    getGlobalTopologyBlockingInFlightOperations: () => [],
    getPartitionDescriptorEpochEvidence: () => null,
    hasPendingMove: () => false,
    hasPendingAddForNode: () => false,
  };
}

function createRuntimeServicePlanner(nodes, currentReplicas) {
  return new MovePlanner({
    entityId: SERVICE_ID,
    entityType: REBALANCER_ENTITY_TYPE.RUNTIME_SERVICE,
    moveStateProvider: createMoveStateProvider(nodes, currentReplicas),
  });
}

function affinityPolicy(nodeWeights, overrides = {}) {
  return {
    targetReplicaCount: 2,
    placementConstraints: {
      spreadAcrossNodes: true,
      preferDataAffinity: true,
      ...(overrides.placementConstraints || {}),
    },
    dataAffinity: {nodeWeights, groupWeights: {}},
    ...overrides.policy,
  };
}

// The exact live stall shape: replicas on node-1/node-2, data (and dominant
// fresh attribution weight) on node-0/node-3/node-4.
const STALL_NODES = ['node-0', 'node-1', 'node-2', 'node-3', 'node-4']
  .map(node);
const STALL_REPLICAS = [
  replica(`${SERVICE_ID}-r1`, 'node-2'),
  replica(`${SERVICE_ID}-r2`, 'node-1'),
];
const STALL_WEIGHTS = {'node-0': 3, 'node-3': 2, 'node-4': 2};

test('the live stall shape is observed as suboptimal by the planner gate',
  (t) => {
    const planner = createRuntimeServicePlanner(STALL_NODES, STALL_REPLICAS);
    const policy = affinityPolicy(STALL_WEIGHTS);
    t.equal(
      planner.isSuboptimalState(STALL_REPLICAS, policy, STALL_NODES),
      true,
      'count-correct, spread-correct placement off its data must trigger ' +
      'a planning round',
    );
    const assessment = planner.assessState(
      STALL_REPLICAS, policy, STALL_NODES,
    );
    t.equal(assessment.critical, false,
      'the stall shape is suboptimal, not critical');
    t.equal(assessment.suboptimal, true,
      'assessState carries the affinity observation to evaluateState');
    t.end();
  });

test('gradients below the incumbent movement-cost margin never trigger',
  (t) => {
    const planner = createRuntimeServicePlanner(STALL_NODES, STALL_REPLICAS);
    // Challenger advantage of exactly the retention margin: incumbent
    // node-1 has weight w, challenger has w + margin/NODE_AFFINITY_WEIGHT,
    // so challengerScore == incumbentScore + retention - retention == tie.
    const margin =
      PLACEMENT_OWNER_DATA_AFFINITY_SCORE.INCUMBENT_MOVEMENT_COST /
      PLACEMENT_OWNER_DATA_AFFINITY_SCORE.NODE_AFFINITY_WEIGHT;
    const policy = affinityPolicy({
      'node-1': 1,
      'node-2': 1,
      'node-0': 1 + margin,
    });
    t.equal(
      planner.isSuboptimalState(STALL_REPLICAS, policy, STALL_NODES),
      false,
      'a challenger that does not strictly beat the retention margin is ' +
      'hysteresis-retained, preventing churn',
    );
    t.end();
  });

test('entities without preferDataAffinity evaluate byte-identically', (t) => {
  const planner = createRuntimeServicePlanner(STALL_NODES, STALL_REPLICAS);
  const policy = affinityPolicy(STALL_WEIGHTS, {
    placementConstraints: {preferDataAffinity: false},
  });
  t.equal(
    planner.isSuboptimalState(STALL_REPLICAS, policy, STALL_NODES),
    false,
    'without the constraint the observer is inert',
  );
  t.equal(
    planner.isSuboptimalState(
      STALL_REPLICAS,
      {targetReplicaCount: 2, placementConstraints: {spreadAcrossNodes: true}},
      STALL_NODES,
    ),
    false,
    'a policy with no affinity surface at all stays exactly as before',
  );
  t.end();
});

test('incumbents already on the dominant data nodes stay put', (t) => {
  const placedReplicas = [
    replica(`${SERVICE_ID}-r1`, 'node-0'),
    replica(`${SERVICE_ID}-r2`, 'node-3'),
  ];
  const planner = createRuntimeServicePlanner(STALL_NODES, placedReplicas);
  t.equal(
    planner.isSuboptimalState(
      placedReplicas, affinityPolicy(STALL_WEIGHTS), STALL_NODES,
    ),
    false,
    'converged placement is not re-triggered',
  );
  t.end();
});

test('observer helper edge cases fail closed', (t) => {
  t.equal(
    isDataAffinityPlacementSuboptimal(
      affinityPolicy({}), STALL_REPLICAS, STALL_NODES,
    ),
    false,
    'empty weights never trigger',
  );
  t.equal(
    isDataAffinityPlacementSuboptimal(
      affinityPolicy(STALL_WEIGHTS), [], STALL_NODES,
    ),
    false,
    'no incumbents means initial placement owns the decision, not the ' +
    'observer',
  );
  t.equal(
    isDataAffinityPlacementSuboptimal(
      affinityPolicy(STALL_WEIGHTS), STALL_REPLICAS, [],
    ),
    false,
    'no ready challengers never triggers',
  );
  t.equal(
    isDataAffinityPlacementSuboptimal(
      affinityPolicy(STALL_WEIGHTS),
      STALL_REPLICAS,
      STALL_REPLICAS.map((row) => node(row.node_id)),
    ),
    false,
    'ready set covering only incumbent nodes never triggers',
  );
  t.end();
});
