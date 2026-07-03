import t from 'tap';
import {
  buildPlacementOwnerDecision,
} from '../../src/rebalancer/placement-owner-decision.js';
import {
  PLACEMENT_OWNER_DATA_AFFINITY_SCORE,
  PLACEMENT_OWNER_POLICY,
  PLACEMENT_OWNER_SCORE_DIMENSION,
  PLACEMENT_OWNER_SCORE_PROFILE,
} from '../../src/rebalancer/placement-owner-constants.js';
import {MovePlanner} from '../../src/rebalancer/move-planner.js';
import {
  REBALANCER_ENTITY_TYPE,
} from '../../src/rebalancer/rebalancer-constants.js';
import {ReplicaStatus} from '../../src/rebalancer/replica-status.js';

// ---------------------------------------------------------------------------
// Tier 1b of the service↔data affinity placement epic
// (solve/epics/service-data-affinity-placement.md, quest
// placement-data-affinity-tier1b): the REAL placement kernel scores a
// DATA_AFFINITY dimension fed by accessed-data latency-group weights on
// the policy, with an in-score incumbent movement-cost (hysteresis)
// margin, and its effect is proven through the REAL MovePlanner —
// calculateTargetState + calculateMoves with a stubbed
// moveStateProvider, per the Tier-1a sim findings:
//   (a) an affinity gradient above the retention margin moves a service
//       replica toward its data's latency group (rank change becomes a
//       real move);
//   (b) a gradient below the margin is damped: the incumbent is
//       retained and calculateMoves emits ZERO moves (the sim's
//       limit-cycle/churn finding, encoded in-score);
//   (c) with no affinity constraint or no affinity evidence, kernel
//       output is unchanged (the dimension family is fully gated).
// ---------------------------------------------------------------------------

function node(nodeId, cpu, latencyGroupId) {
  return {
    node_id: nodeId,
    status: ReplicaStatus.ACTIVE,
    cpu_usage_percent: cpu,
    memory_usage_percent: 0,
    disk_usage_percent: 0,
    latency_group_id: latencyGroupId,
  };
}

function replica(replicaId, nodeId) {
  return {replica_id: replicaId, node_id: nodeId, status: ReplicaStatus.ACTIVE};
}

// One service replica sits on s1 (G2); its accessed data lives in G1
// where the equally-loaded d1 is available. Load cannot distinguish the
// two nodes — only the affinity evidence can. Each test picks the node
// ORDER so the equal-score ordinal fallback favors the outcome the
// feature must overturn: test (a) lists the incumbent first (ordinal
// alone would keep s1 — affinity must move to d1), test (b) lists the
// challenger first (ordinal alone would pick d1 — the retention margin
// must keep s1). Neither MovePlanner assertion can pass with the
// dimension family dead.
const NODES_INCUMBENT_FIRST = [node('s1', 30, 'G2'), node('d1', 30, 'G1')];
const NODES_CHALLENGER_FIRST = [node('d1', 30, 'G1'), node('s1', 30, 'G2')];
const CURRENT_REPLICAS = [replica('r1', 's1')];

function kernelScenario(candidateNodes, policy) {
  return {
    candidateNodes,
    currentReplicas: CURRENT_REPLICAS,
    targetCount: 1,
    policy,
    placementPolicy: PLACEMENT_OWNER_POLICY.RUNTIME_SERVICE_SPREAD,
    scoreProfile: PLACEMENT_OWNER_SCORE_PROFILE.SUITABILITY,
  };
}

function buildServicePlanner(candidateNodes) {
  return new MovePlanner({
    entityId: 'svc-tier1b',
    entityType: REBALANCER_ENTITY_TYPE.RUNTIME_SERVICE,
    moveStateProvider: {
      getAvailableNodes: () => candidateNodes,
      getCurrentReplicas: () => CURRENT_REPLICAS,
      getHealthyReplicas: (replicas) =>
        replicas.filter((r) => r.status === ReplicaStatus.ACTIVE),
      getInFlightOperations: () => [],
      getGlobalTopologyBlockingInFlightOperations: () => [],
      getPartitionDescriptorEpochEvidence: () => null,
      hasPendingMove: () => false,
      hasPendingAddForNode: () => false,
    },
  });
}

function dimensionOf(decision, nodeId, dimension) {
  return decision.scoreResult.scoreVector
    .find((entry) => entry.nodeId === nodeId)
    ?.dimensions.find((d) => d.dimension === dimension) || null;
}

t.test('(a) an affinity gradient above the retention margin moves the ' +
  'service toward its data through the REAL MovePlanner', async (t) => {
  const policy = {
    targetReplicaCount: 1,
    placementConstraints: {preferDataAffinity: true},
    dataAffinity: {groupWeights: {G1: 1}},
  };

  const decision = buildPlacementOwnerDecision(
    kernelScenario(NODES_INCUMBENT_FIRST, policy),
  );
  const d1Affinity = dimensionOf(
    decision, 'd1', PLACEMENT_OWNER_SCORE_DIMENSION.DATA_AFFINITY,
  );
  t.ok(d1Affinity, 'd1 (data group) is scored on the DATA_AFFINITY dimension');
  t.equal(
    d1Affinity.value,
    -PLACEMENT_OWNER_DATA_AFFINITY_SCORE.AFFINITY_WEIGHT,
    'full data weight scores the full affinity bonus',
  );
  const s1Retention = dimensionOf(
    decision, 's1',
    PLACEMENT_OWNER_SCORE_DIMENSION.DATA_AFFINITY_INCUMBENT_RETENTION,
  );
  t.equal(
    s1Retention?.value,
    -PLACEMENT_OWNER_DATA_AFFINITY_SCORE.INCUMBENT_MOVEMENT_COST,
    'the incumbent carries the in-score movement-cost bonus',
  );
  t.same(decision.intent.targetNodeIds, ['d1'],
    'the gradient (10) beats the retention margin (4): intent moves to d1');

  const planner = buildServicePlanner(NODES_INCUMBENT_FIRST);
  const targetState = await planner.calculateTargetState(
    CURRENT_REPLICAS, policy,
  );
  t.same(targetState.targetNodes, ['d1'],
    'REAL MovePlanner target state lands on the data group node ' +
      '(ordinal fallback alone would keep the incumbent-first order)');
  const moves = planner.calculateMoves(CURRENT_REPLICAS, targetState);
  t.ok(moves.length > 0,
    `the rank change becomes real movement (${moves.map((m) => m.type)})`);
  const touchedNodes = new Set(moves.flatMap((m) =>
    [m.targetNodeId, m.sourceNodeId, m.nodeId].filter(Boolean)));
  t.ok(touchedNodes.has('d1'),
    'movement targets the data-group node');
});

t.test('(b) a gradient below the retention margin is damped: incumbent ' +
  'retained, ZERO moves', async (t) => {
  const policy = {
    targetReplicaCount: 1,
    placementConstraints: {preferDataAffinity: true},
    dataAffinity: {groupWeights: {G1: 0.55, G2: 0.45}},
  };

  const decision = buildPlacementOwnerDecision(
    kernelScenario(NODES_CHALLENGER_FIRST, policy),
  );
  const d1Affinity = dimensionOf(
    decision, 'd1', PLACEMENT_OWNER_SCORE_DIMENSION.DATA_AFFINITY,
  );
  const s1Affinity = dimensionOf(
    decision, 's1', PLACEMENT_OWNER_SCORE_DIMENSION.DATA_AFFINITY,
  );
  t.ok(d1Affinity.value < s1Affinity.value,
    'affinity ALONE still prefers the data-heavy group (it is the ' +
      'movement cost that damps, not a missing gradient)');
  t.same(decision.intent.targetNodeIds, ['s1'],
    'the sub-margin gradient (1 point) loses to the retention margin (4)');

  const planner = buildServicePlanner(NODES_CHALLENGER_FIRST);
  const targetState = await planner.calculateTargetState(
    CURRENT_REPLICAS, policy,
  );
  t.same(targetState.targetNodes, ['s1'],
    'REAL MovePlanner target state keeps the incumbent (ordinal ' +
      'fallback alone would pick the challenger-first order)');
  const moves = planner.calculateMoves(CURRENT_REPLICAS, targetState);
  t.same(moves, [],
    'no churn: calculateMoves emits ZERO moves below the margin');
});

t.test('(c) without the constraint or without evidence, kernel output is ' +
  'unchanged', async (t) => {
  const baseline = buildPlacementOwnerDecision(kernelScenario(
    NODES_CHALLENGER_FIRST,
    {targetReplicaCount: 1, placementConstraints: {}},
  ));
  const constraintWithoutEvidence = buildPlacementOwnerDecision(
    kernelScenario(NODES_CHALLENGER_FIRST, {
      targetReplicaCount: 1,
      placementConstraints: {preferDataAffinity: true},
    }),
  );
  const evidenceWithoutConstraint = buildPlacementOwnerDecision(
    kernelScenario(NODES_CHALLENGER_FIRST, {
      targetReplicaCount: 1,
      placementConstraints: {},
      dataAffinity: {groupWeights: {G1: 1}},
    }),
  );
  const zeroWeightsOnly = buildPlacementOwnerDecision(
    kernelScenario(NODES_CHALLENGER_FIRST, {
      targetReplicaCount: 1,
      placementConstraints: {preferDataAffinity: true},
      dataAffinity: {groupWeights: {G1: 0, G2: 0}},
    }),
  );

  for (const [label, decision] of [
    ['baseline', baseline],
    ['constraint without evidence', constraintWithoutEvidence],
    ['evidence without constraint', evidenceWithoutConstraint],
    ['zero-weight-only evidence', zeroWeightsOnly],
  ]) {
    const dimensionNames = new Set(decision.scoreResult.scoreVector
      .flatMap((entry) => entry.dimensions.map((d) => d.dimension)));
    t.notOk(
      dimensionNames.has(PLACEMENT_OWNER_SCORE_DIMENSION.DATA_AFFINITY),
      `${label}: no data_affinity dimension`,
    );
    t.notOk(
      dimensionNames.has(
        PLACEMENT_OWNER_SCORE_DIMENSION.DATA_AFFINITY_INCUMBENT_RETENTION,
      ),
      `${label}: no incumbent-retention dimension`,
    );
  }
  t.same(
    constraintWithoutEvidence.scoreResult.rankedNodeIds,
    baseline.scoreResult.rankedNodeIds,
    'constraint without evidence ranks identically to baseline',
  );
  t.same(
    evidenceWithoutConstraint.scoreResult.rankedNodeIds,
    baseline.scoreResult.rankedNodeIds,
    'evidence without constraint ranks identically to baseline',
  );
  t.same(
    constraintWithoutEvidence.intent.targetNodeIds,
    baseline.intent.targetNodeIds,
    'intent is unchanged when the dimension family is gated off',
  );
  t.same(
    zeroWeightsOnly.intent.targetNodeIds,
    baseline.intent.targetNodeIds,
    'a map of only zero weights carries no evidence: no retention, ' +
      'intent unchanged',
  );
});

t.test('affinity evidence normalization drops invalid entries', async (t) => {
  const decision = buildPlacementOwnerDecision(
    kernelScenario(NODES_CHALLENGER_FIRST, {
      targetReplicaCount: 1,
      placementConstraints: {preferDataAffinity: true},
      dataAffinity: {groupWeights: {
        'G1': 2.5, // clamped to 1
        'G2': -1, // dropped
        '': 0.9, // dropped (empty group id)
        'G3': Number.NaN, // dropped
        'G4': 0, // dropped (zero carries no affinity evidence)
      }},
    }),
  );
  const weights = decision.evidence.dataAffinityContext.groupWeights;
  t.equal(weights.get('G1'), 1, 'over-unit weight clamps to 1');
  t.notOk(weights.has('G2'), 'negative weight dropped');
  t.notOk(weights.has(''), 'empty group id dropped');
  t.notOk(weights.has('G3'), 'non-finite weight dropped');
  t.notOk(weights.has('G4'), 'zero weight dropped');

  const arrayWeights = buildPlacementOwnerDecision(
    kernelScenario(NODES_CHALLENGER_FIRST, {
      targetReplicaCount: 1,
      placementConstraints: {preferDataAffinity: true},
      dataAffinity: {groupWeights: [0.5, 0.3]},
    }),
  );
  t.equal(
    arrayWeights.evidence.dataAffinityContext.groupWeights.size,
    0,
    'array-typed groupWeights is rejected (no phantom index groups)',
  );
});
