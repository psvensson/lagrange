/**
 * Discriminator for quest runtime-service-affinity-observer-intent-parity.
 * Live forensics 2026-07-21T15:06:54 (report movielens-lagrange-service-
 * affinity-live-2026-07-21T15-10-38-912Z): the affinity suboptimality
 * observer fired for svc-movielens-topn (healthy 2 of desired 2 across 5
 * nodes — only the affinity term can fire there), rebalance() ran, and zero
 * moves were minted; weightedLocality stayed 0.000 for 300s. The periodic
 * cycle evaluates and cures with two SEPARATE policy fetches
 * (evaluateState fetches its own policy; advanceCheckCadence calls
 * rebalance(PERIODIC) with no policy, which re-fetches), so under the
 * CL-017/CL-029 divergence the re-fetch can lose the fresh attribution
 * weights (empty authoritative read) and the cure silently evaluates a
 * policy WITHOUT preferDataAffinity: detection latches, no REPLACE is ever
 * planned. The sealed result: one planning cycle uses ONE policy evidence —
 * whenever the observer's policy says suboptimal, the same policy reaches
 * the move planner.
 */

import {test} from '../../src/test-helpers/tap.js';
import {
  REBALANCER_ENTITY_TYPE,
  REBALANCER_MOVE_TYPE,
} from '../../src/rebalancer/rebalancer-constants.js';
import {ReplicaStatus} from '../../src/rebalancer/replica-status.js';
import {CONTROL_PLANE_READINESS_DIMENSION}
  from '../../src/control-plane/control-plane-readiness-constants.js';
import {PLACEMENT_OWNER_DATA_AFFINITY_SCORE}
  from '../../src/rebalancer/placement-owner-constants.js';
import {
  createAllowAllStorageAdmissionService,
  createMockControlPlaneReadinessService,
  createTestRebalancer,
  initializeSpreadTestEnvironment,
} from './test-helpers.js';

const SERVICE_ID = 'svc-movielens-topn';
const NODE_IDS = ['node-0', 'node-1', 'node-2', 'node-3', 'node-4'];
// Incumbents are named to win the plain suitability tie-break so a planning
// round WITHOUT affinity evidence is genuinely inert (the live zero-move
// state); only affinity evidence can justify moving off them.
const INCUMBENT_NODE_IDS = ['node-0', 'node-1'];
const DATA_NODE_IDS = ['node-2', 'node-3', 'node-4'];
const STALL_WEIGHTS = {'node-2': 3, 'node-3': 2, 'node-4': 2};

function buildAffinityPolicy(nodeWeights) {
  return {
    targetReplicaCount: 2,
    minReplicaCount: 2,
    maxReplicaCount: 2,
    placementConstraints: {
      spreadAcrossNodes: true,
      preferDataAffinity: true,
    },
    dataAffinity: {nodeWeights, groupWeights: {}},
  };
}

function buildPlainPolicy() {
  return {
    targetReplicaCount: 2,
    minReplicaCount: 2,
    maxReplicaCount: 2,
    placementConstraints: {spreadAcrossNodes: true},
  };
}

/**
 * Build the live stall topology: five active nodes, two ACTIVE service
 * replicas sitting on the two nodes that hold none of the accessed data.
 */
function buildStallScenario({policyByFetch}) {
  const nodes = NODE_IDS.map((nodeId) => ({
    node_id: nodeId,
    status: 'active',
  }));
  const services = INCUMBENT_NODE_IDS.map((nodeId, index) => ({
    service_id: `${SERVICE_ID}-r${index + 1}`,
    replica_id: `${SERVICE_ID}-r${index + 1}`,
    partition_id: SERVICE_ID,
    node_id: nodeId,
    service_type: 'runtime_service',
    status: ReplicaStatus.ACTIVE,
  }));
  // Give every non-incumbent node one unrelated resident replica so the
  // plain load/spread gradient is flat (the live cluster's nodes were
  // evenly occupied): without affinity evidence there is nothing to move,
  // exactly the observed zero-move live state.
  for (const nodeId of DATA_NODE_IDS) {
    services.push({
      service_id: `svc-unrelated-${nodeId}`,
      replica_id: `svc-unrelated-${nodeId}`,
      partition_id: 'svc-unrelated',
      node_id: nodeId,
      service_type: 'runtime_service',
      status: ReplicaStatus.ACTIVE,
    });
  }
  const rebalancer = createTestRebalancer({
    entityId: SERVICE_ID,
    entityType: REBALANCER_ENTITY_TYPE.RUNTIME_SERVICE,
    nodeId: 'node-0',
    cacheData: {nodes, services},
  });
  rebalancer.isLeader = true;
  // The coordinator-dependency sync can override the admission service with
  // the mock coordinator's stale-shaped stub ({allowed} instead of
  // {decision}); the scenario models capacity-admitted nodes, so install the
  // canonical allow-all admission on both references.
  const storageAdmission = createAllowAllStorageAdmissionService();
  rebalancer.storageAdmissionService = storageAdmission;
  rebalancer.movePlanner.storageAdmissionService = storageAdmission;
  // The planning gate holds a post-state-change stabilization window
  // anchored on lastStateChangeTime; the scenario models a long-settled
  // topology, so no stabilization wait applies.
  rebalancer.lastStateChangeTime = 0;
  // The constructor may swap in the coordinator's readiness service; the
  // scenario models a locally mutation-ready node, so install a readiness
  // view with every dimension satisfied after construction.
  rebalancer.controlPlaneReadinessService =
    createMockControlPlaneReadinessService({
      defaultRepairEligible: true,
      readinessByNodeId: {
        'node-0': {
          nodeId: 'node-0',
          dimensions: Object.fromEntries(
            Object.values(CONTROL_PLANE_READINESS_DIMENSION)
              .filter((name) => typeof name === 'string')
              .map((name) => [name, true]),
          ),
        },
      },
    });
  const policyFetches = [];
  rebalancer.getPolicy = async () => {
    const policy = policyByFetch(policyFetches.length);
    policyFetches.push(policy);
    return policy;
  };
  const rebalanceResults = [];
  const originalRebalance = rebalancer.rebalance.bind(rebalancer);
  rebalancer.rebalance = async (...args) => {
    const result = await originalRebalance(...args);
    rebalanceResults.push(result);
    return result;
  };
  return {rebalancer, policyFetches, rebalanceResults};
}

function collectExecutedReplaceMoves(rebalanceResults) {
  // rebalance() reports executed-move records: {operation, nodeId,
  // replicaId, operationId, status, success}.
  return rebalanceResults.flatMap((result) =>
    (result?.moves || [])
      .filter((move) => move.operation === REBALANCER_MOVE_TYPE.REPLACE)
      .map((move) => ({
        operation: move.operation,
        nodeId: move.nodeId || null,
      })),
  );
}

/**
 * Drive one real periodic planning cycle through checkRebalance — the
 * production entrypoint that evaluates and then cures — capturing the
 * evaluation verdict via a transparent wrapper.
 */
async function runOnePlanningCycle(rebalancer) {
  let observedNeedsRebalance = null;
  const originalEvaluateState = rebalancer.evaluateState.bind(rebalancer);
  rebalancer.evaluateState = async (...args) => {
    observedNeedsRebalance = await originalEvaluateState(...args);
    return observedNeedsRebalance;
  };
  rebalancer.scheduleNextCheck = () => {};
  await rebalancer.checkRebalance();
  return observedNeedsRebalance;
}

test(
  'an affinity-suboptimal observation cures with the same policy evidence ' +
  'even when a policy re-fetch would lose the attribution weights',
  async (t) => {
    initializeSpreadTestEnvironment('node-0');

    // Fetch 0 (evaluation) carries fresh affinity weights; every later
    // fetch models the diverged authoritative re-read returning no fresh
    // service_partition_access rows, i.e. a policy without
    // preferDataAffinity — the live 15:06:54 shape.
    const {rebalancer, rebalanceResults} = buildStallScenario({
      policyByFetch: (fetchIndex) =>
        fetchIndex === 0 ?
          buildAffinityPolicy(STALL_WEIGHTS) :
          buildPlainPolicy(),
    });

    const needsRebalance = await runOnePlanningCycle(rebalancer);

    t.equal(
      needsRebalance,
      true,
      'the off-data placement with fresh weights must be observed as ' +
      'suboptimal',
    );
    const replaceMoves = collectExecutedReplaceMoves(rebalanceResults);
    t.ok(
      replaceMoves.length > 0,
      'the planning cycle that observed affinity suboptimality must mint ' +
      'REPLACE moves from the SAME policy evidence instead of silently ' +
      'keeping the incumbents after an evidence-losing re-fetch',
    );
    t.ok(
      replaceMoves.some((move) => DATA_NODE_IDS.includes(move.nodeId)),
      'a minted REPLACE must steer toward the affinity-preferred data nodes',
    );
  },
);

test(
  'a gradient below the incumbent movement-cost margin plans no move even ' +
  'with stable policy evidence',
  async (t) => {
    initializeSpreadTestEnvironment('node-0');

    const margin =
      PLACEMENT_OWNER_DATA_AFFINITY_SCORE.INCUMBENT_MOVEMENT_COST /
      PLACEMENT_OWNER_DATA_AFFINITY_SCORE.NODE_AFFINITY_WEIGHT;
    const subMarginWeights = {
      'node-0': 1,
      'node-1': 1,
      'node-2': 1 + margin,
    };
    const {rebalancer, rebalanceResults} = buildStallScenario({
      policyByFetch: () => buildAffinityPolicy(subMarginWeights),
    });

    const needsRebalance = await runOnePlanningCycle(rebalancer);

    t.equal(
      needsRebalance,
      false,
      'a sub-margin gradient must not be observed as suboptimal',
    );
    t.equal(
      collectExecutedReplaceMoves(rebalanceResults).length,
      0,
      'no churn below the retention margin',
    );
  },
);

test(
  'an entity without preferDataAffinity plans no move at satisfied count ' +
  'and spread regardless of fetch stability',
  async (t) => {
    initializeSpreadTestEnvironment('node-0');

    const {rebalancer, rebalanceResults} = buildStallScenario({
      policyByFetch: () => buildPlainPolicy(),
    });

    const needsRebalance = await runOnePlanningCycle(rebalancer);

    t.equal(
      needsRebalance,
      false,
      'count-satisfied spread-satisfied placement without affinity policy ' +
      'is not suboptimal',
    );
    t.equal(
      collectExecutedReplaceMoves(rebalanceResults).length,
      0,
      'behavior for non-affinity entities is unchanged',
    );
  },
);
