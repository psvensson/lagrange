import t from 'tap';
import {
  buildPlacementOwnerDecision,
} from '../../src/rebalancer/placement-owner-decision.js';
import {
  PLACEMENT_OWNER_POLICY,
  PLACEMENT_OWNER_RESERVATION_REASON,
  PLACEMENT_OWNER_SCORE_DIMENSION,
  PLACEMENT_OWNER_SCORE_PROFILE,
} from '../../src/rebalancer/placement-owner-constants.js';
import {MovePlanner} from '../../src/rebalancer/move-planner.js';
import {
  REBALANCER_ENTITY_TYPE,
} from '../../src/rebalancer/rebalancer-constants.js';
import {ReplicaStatus} from '../../src/rebalancer/replica-status.js';
import {
  ROUTING_MODEL,
  SIM_VERDICT,
  makeAffinityWorld,
  runPlacementSim,
} from './placement-affinity-sim.js';

// ---------------------------------------------------------------------------
// REAL-KERNEL fidelity harness for the service↔data affinity placement line
// (epic: solve/epics/service-data-affinity-placement.md) — the bridge between
// the Tier-1a simulator (placement-affinity-sim.js, a stand-in scorer) and
// Tier 1b (a DATA_AFFINITY dimension in the real kernel). NO src/ changes:
// buildPlacementOwnerDecision is pure and synchronous, and MovePlanner only
// needs a moveStateProvider stub (recipe from
// test/rebalancer/move-planner-placement-owner-kernel.test.js).
//
// It turns the epic's surveyed ground-truth claims into executable facts, so
// they go red the day the kernel changes underneath the epic:
//   1. Latency-group affinity scoring is DORMANT by default: the production
//      rebalancer constraint shape yields NO topology score dimension.
//   2. The dormant lever WORKS when enabled — same world, constraint on, the
//      same_latency_group dimension appears and flips the ranking. (Tier 1b's
//      insertion point is real, and its semantics are OWN-replica dominant
//      group — there is no input through which accessed-DATA location could
//      be expressed; that edge is the feature gap.)
//   3. retainHealthyIncumbents (the only in-kernel hysteresis lever) WORKS
//      when passed directly — and is UNREACHABLE through MovePlanner, whose
//      bridge does not forward it: the wired path churns on a marginal
//      challenger. This is the churn seam the sim's hysteresis findings map
//      onto (load-self-shadow limit cycle / pursuit oscillation).
//   4. Sim↔kernel correspondence: on a strict load ordering, the Tier-1a
//      planner and the real kernel choose the same node set — the sim's
//      load dimension is a faithful stand-in for the kernel's.
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

// Two replicas sit on loaded G1 nodes (the entity's dominant group). Fresh
// candidates: a1 in G1 (cpu 30) vs b1 in G2 (cpu 27) — load alone prefers b1;
// the same-group bonus (−5) outweighs the 3-point load gap and prefers a1.
function dominantGroupScenario() {
  return {
    candidateNodes: [
      node('a1', 30, 'G1'),
      node('b1', 27, 'G2'),
      node('a2', 80, 'G1'),
      node('a3', 80, 'G1'),
    ],
    currentReplicas: [replica('r1', 'a2'), replica('r2', 'a3')],
    targetCount: 3,
    placementPolicy: PLACEMENT_OWNER_POLICY.PARTITION_SPREAD,
    scoreProfile: PLACEMENT_OWNER_SCORE_PROFILE.SUITABILITY,
  };
}

t.test('claim 1 — latency-group affinity is DORMANT under the production ' +
  'constraint shape', async (t) => {
  // The rebalancer-side policies set load/disk/spread constraints only
  // (rebalancer-constants.js / policy-constants.js); preferSameLatencyGroup is
  // never set on the placement path (it lives in the query read-routing path).
  const decision = buildPlacementOwnerDecision({
    ...dominantGroupScenario(),
    policy: {placementConstraints: {considerCpuLoad: true, considerMemoryLoad: true}},
  });
  const dimensionNames = new Set(decision.scoreResult.scoreVector
    .flatMap((entry) => entry.dimensions.map((d) => d.dimension)));
  t.notOk(dimensionNames.has(PLACEMENT_OWNER_SCORE_DIMENSION.SAME_LATENCY_GROUP),
    'no same_latency_group dimension is scored under production constraints');
  t.notOk(dimensionNames.has(PLACEMENT_OWNER_SCORE_DIMENSION.LATENCY_GROUP_DIVERSITY),
    'no latency_group_diversity dimension either');
  t.same(decision.scoreResult.rankedNodeIds.slice(0, 2), ['b1', 'a1'],
    'ranking is pure load: the off-group low-cpu node wins — nearness plays ' +
      'no role in placement today');
});

t.test('claim 2 — the dormant lever works when enabled, with OWN-replica ' +
  'dominant-group semantics (the data edge is missing)', async (t) => {
  const decision = buildPlacementOwnerDecision({
    ...dominantGroupScenario(),
    policy: {placementConstraints: {considerCpuLoad: true, preferSameLatencyGroup: true}},
  });
  const a1 = decision.scoreResult.scoreVector.find((entry) => entry.nodeId === 'a1');
  const sameGroupDim = a1.dimensions
    .find((d) => d.dimension === PLACEMENT_OWNER_SCORE_DIMENSION.SAME_LATENCY_GROUP);
  t.ok(sameGroupDim && sameGroupDim.value < 0,
    `a1 (dominant group G1) receives the same-group bonus (${sameGroupDim?.value})`);
  t.same(decision.scoreResult.rankedNodeIds.slice(0, 2), ['a1', 'b1'],
    'the bonus overcomes the 3-point load gap: ranking flips toward the ' +
      'entity\'s OWN dominant group — Tier 1b\'s insertion point is live');
  // The semantic gap: the "group to be near" is derived ONLY from the entity's
  // own currentReplicas (buildLatencyGroupContext). There is no evidence input
  // for the location of DATA the entity accesses — that edge (A[s][p] + data
  // replica groups) is exactly what a DATA_AFFINITY dimension must add.
  t.ok(decision.evidence.latencyGroupContext,
    'the only nearness context the kernel has is the own-replica group context');
});

t.test('claim 3 — retainHealthyIncumbents is a working hysteresis lever that ' +
  'production cannot reach (the churn seam)', async (t) => {
  const scenario = {
    candidateNodes: [node('n1', 40, 'G1'), node('n2', 35, 'G2')],
    currentReplicas: [replica('r1', 'n1')],
    targetCount: 1,
    policy: {placementConstraints: {considerCpuLoad: true}},
    placementPolicy: PLACEMENT_OWNER_POLICY.PARTITION_SPREAD,
    scoreProfile: PLACEMENT_OWNER_SCORE_PROFILE.SUITABILITY,
  };

  const churny = buildPlacementOwnerDecision(scenario);
  t.same(churny.intent.targetNodeIds, ['n2'],
    'default: a 5-cpu-point challenger displaces a healthy incumbent (zero damping)');

  const retained = buildPlacementOwnerDecision({...scenario, retainHealthyIncumbents: true});
  t.same(retained.intent.targetNodeIds, ['n1'],
    'retainHealthyIncumbents keeps the incumbent — the hysteresis lever works');
  t.ok(retained.reservationResult.reasons
    .includes(PLACEMENT_OWNER_RESERVATION_REASON.INCUMBENT_RETENTION),
  'via an incumbent_retention reservation');

  // The wired path: MovePlanner's bridge (move-planner-placement-tail-methods
  // buildPlacementOwnerPolicyDecision) forwards policy but NOT
  // retainHealthyIncumbents — even a policy smuggling the flag still churns.
  const nodes = scenario.candidateNodes;
  const currentReplicas = scenario.currentReplicas;
  const planner = new MovePlanner({
    entityId: 'p-fidelity',
    entityType: REBALANCER_ENTITY_TYPE.PARTITION,
    moveStateProvider: {
      getAvailableNodes: () => nodes,
      getCurrentReplicas: () => currentReplicas,
      getHealthyReplicas: (replicas) =>
        replicas.filter((r) => r.status === ReplicaStatus.ACTIVE),
      getInFlightOperations: () => [],
      getGlobalTopologyBlockingInFlightOperations: () => [],
      getPartitionDescriptorEpochEvidence: () => null,
      hasPendingMove: () => false,
      hasPendingAddForNode: () => false,
    },
  });
  const targetState = await planner.calculateTargetState(currentReplicas, {
    targetReplicaCount: 1,
    placementConstraints: {considerCpuLoad: true},
    retainHealthyIncumbents: true,
  });
  t.same(targetState.targetNodes, ['n2'],
    'through MovePlanner the flag is inert: the marginal challenger still wins');
  const moves = planner.calculateMoves(currentReplicas, targetState);
  t.ok(moves.length > 0,
    `and the rank change becomes real movement (${moves.map((m) => m.type)}) — ` +
      'the rank-churn→migration seam the sim\'s hysteresis findings target');
});

t.test('claim 4 — sim planner and real kernel agree on a strict load ordering',
  async (t) => {
    // Sim side: four one-group nodes carry pinned loader pairs with volumes
    // 40/30/20/10 (each loader's compute + its data landing double on its own
    // node), and a volume-less free service (2 replicas) starts on the two
    // most loaded nodes. wLoad-only planning must migrate it to the two least
    // loaded nodes.
    const loaders = [1, 2, 3, 4].map((i) => ({
      service: {id: `loader-s${i}`, replicaCount: 1, nodes: [`G1-n${i}`], pinned: true},
      partition: {
        id: `loader-p${i}`, replicaCount: 1, nodes: [`G1-n${i}`],
        leaderNode: `G1-n${i}`, pinned: true,
      },
      access: {
        serviceId: `loader-s${i}`, partitionId: `loader-p${i}`,
        reads: [40, 30, 20, 10][i - 1], writes: 0,
      },
    }));
    const world = makeAffinityWorld({
      seed: 1,
      groups: [{id: 'G1', nodeCount: 4}],
      partitions: loaders.map((l) => l.partition),
      services: loaders.map((l) => l.service)
        .concat([{id: 's-free', replicaCount: 2, nodes: ['G1-n1', 'G1-n2']}]),
      access: loaders.map((l) => l.access),
    });
    const result = runPlacementSim(world, {
      routing: ROUTING_MODEL.LOCALITY,
      weights: {affinity: 0, load: 1, spread: 0},
    });
    t.equal(result.verdict, SIM_VERDICT.FIXPOINT, 'sim reaches a fixpoint');
    t.same(result.finalPlacement.services['s-free'], ['G1-n3', 'G1-n4'],
      'sim planner picks the two least-loaded nodes');

    // Kernel side: the same world expressed as cpu percentages (loads 80/60/
    // 40/20 in the sim's own units, scaled to cpu%).
    const decision = buildPlacementOwnerDecision({
      candidateNodes: [
        node('G1-n1', 80, 'G1'),
        node('G1-n2', 60, 'G1'),
        node('G1-n3', 40, 'G1'),
        node('G1-n4', 20, 'G1'),
      ],
      currentReplicas: [],
      targetCount: 2,
      policy: {placementConstraints: {considerCpuLoad: true}},
      placementPolicy: PLACEMENT_OWNER_POLICY.RUNTIME_SERVICE_SPREAD,
      scoreProfile: PLACEMENT_OWNER_SCORE_PROFILE.SUITABILITY,
    });
    t.same([...decision.intent.targetNodeIds].sort(),
      result.finalPlacement.services['s-free'],
      'real kernel chooses the SAME node set — the sim\'s load dimension is ' +
          'a faithful stand-in');
  });
