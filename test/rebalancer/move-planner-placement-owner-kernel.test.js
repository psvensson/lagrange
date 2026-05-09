import {test} from '../../src/test-helpers/tap.js';
import {NUM} from '../../src/constants/index.js';
import {MovePlanner} from '../../src/rebalancer/move-planner.js';
import {
  MOVE_REASON,
  REBALANCER_ENTITY_TYPE,
  REBALANCER_MOVE_TYPE,
} from '../../src/rebalancer/rebalancer-constants.js';
import {ReplicaStatus} from '../../src/rebalancer/replica-status.js';
import {
  ADMISSION_DECISION,
  ADMISSION_REASON,
} from '../../src/rebalancer/storage-capacity-constants.js';
import {
  PLACEMENT_OWNER_FILTER_STATE,
  PLACEMENT_OWNER_INTENT_STATE,
  PLACEMENT_OWNER_POLICY,
  PLACEMENT_OWNER_RESERVATION_STATE,
  PLACEMENT_OWNER_SCORE_DIMENSION,
  PLACEMENT_OWNER_SCORE_PROFILE,
  PLACEMENT_OWNER_SCORE_STATE,
} from '../../src/rebalancer/placement-owner-constants.js';
import {
  buildPlacementOwnerDecision,
} from '../../src/rebalancer/placement-owner-decision.js';

const PARTITION_ID = 'placement-kernel-partition';
const NODE_1 = 'node-1';
const NODE_2 = 'node-2';
const NODE_3 = 'node-3';
const NODE_4 = 'node-4';
const TARGET_THREE = NUM.THREE;
const TARGET_TWO = NUM.TWO;
const TARGET_ZERO = NUM.ZERO;
const ESTIMATED_BYTES = NUM.BYTES_PER_MIB;
const CPU_MEDIUM = 50;
const CPU_HIGH = 90;

function createNode(nodeId, overrides = {}) {
  return {
    node_id: nodeId,
    status: ReplicaStatus.ACTIVE,
    cpu_usage_percent: overrides.cpu || NUM.ZERO,
    memory_usage_percent: overrides.memory || NUM.ZERO,
    disk_usage_percent: overrides.disk || NUM.ZERO,
    latency_group_id: overrides.latencyGroupId,
  };
}

function createReplica(replicaId, nodeId) {
  return {
    replica_id: replicaId,
    node_id: nodeId,
    status: ReplicaStatus.ACTIVE,
  };
}

function createMoveStateProvider(options = {}) {
  const nodes = options.nodes || [];
  const currentReplicas = options.currentReplicas || [];
  const inFlightOperations = options.inFlightOperations || [];
  return {
    getAvailableNodes: () => nodes,
    getCurrentReplicas: () => currentReplicas,
    getHealthyReplicas: (replicas) =>
      replicas.filter((replica) => replica.status === ReplicaStatus.ACTIVE),
    getInFlightOperations: () => inFlightOperations,
    getGlobalTopologyBlockingInFlightOperations: () => inFlightOperations,
    hasPendingMove: () => false,
    hasPendingAddForNode: () => false,
  };
}

function createPlanner(options = {}) {
  return new MovePlanner({
    entityId: PARTITION_ID,
    entityType: REBALANCER_ENTITY_TYPE.PARTITION,
    moveStateProvider: createMoveStateProvider(options),
    storageAdmissionService: options.storageAdmissionService,
    accountingService: options.accountingService,
  });
}

function allowAdmissionResult() {
  return {
    decision: ADMISSION_DECISION.ALLOW,
    reason: ADMISSION_REASON.CAPACITY_AVAILABLE,
    projectedUtilization: {},
  };
}

function denyAdmissionResult() {
  return {
    decision: ADMISSION_DECISION.DENY,
    reason: ADMISSION_REASON.BUDGET_EXCEEDED,
    projectedUtilization: {},
  };
}

function createAdmissionService(decisions) {
  return {
    async checkAdd(options = {}) {
      return decisions[options.targetNodeId] || allowAdmissionResult();
    },
  };
}

function createAccountingService() {
  return {
    estimateReplicaBytes: () => ESTIMATED_BYTES,
  };
}

test('placement owner kernel exposes explicit policy phases', async (t) => {
  await t.test('under-replicated placement emits selected-target intent',
    async (t) => {
      const nodes = [
        createNode(NODE_1),
        createNode(NODE_2),
        createNode(NODE_3),
      ];
      const currentReplicas = [createReplica('replica-1', NODE_1)];
      const planner = createPlanner({nodes, currentReplicas});

      const result = await planner.calculateTargetState(currentReplicas, {
        targetReplicaCount: TARGET_THREE,
        placementConstraints: {spreadAcrossNodes: true},
      });

      t.equal(
        result.placementOwnerDecision.filterResult.state,
        PLACEMENT_OWNER_FILTER_STATE.CANDIDATES_ACCEPTED,
      );
      t.equal(
        result.placementOwnerDecision.scoreResult.state,
        PLACEMENT_OWNER_SCORE_STATE.RANKED_CANDIDATES,
      );
      t.equal(
        result.placementOwnerDecision.intent.state,
        PLACEMENT_OWNER_INTENT_STATE.TARGETS_SELECTED,
      );
      t.same(result.targetNodes, [NODE_1, NODE_2, NODE_3]);
    });

  await t.test('over target placement keeps target cohort and removes extra node',
    async (t) => {
      const nodes = [
        createNode(NODE_1, {cpu: NUM.ONE}),
        createNode(NODE_2, {cpu: NUM.TWO}),
        createNode(NODE_3, {cpu: NUM.THREE}),
      ];
      const currentReplicas = [
        createReplica('replica-1', NODE_1),
        createReplica('replica-2', NODE_2),
        createReplica('replica-3', NODE_3),
      ];
      const planner = createPlanner({nodes, currentReplicas});
      const targetState = await planner.calculateTargetState(currentReplicas, {
        targetReplicaCount: TARGET_TWO,
        minReplicaCount: NUM.ONE,
        maxReplicaCount: TARGET_THREE,
        placementConstraints: {considerCpuLoad: true},
      });
      const moves = planner.calculateMoves(currentReplicas, targetState);

      t.same(targetState.targetNodes, [NODE_1, NODE_2]);
      t.equal(moves.length, NUM.ONE);
      t.equal(moves[NUM.ZERO].type, REBALANCER_MOVE_TYPE.REMOVE);
      t.equal(moves[NUM.ZERO].nodeId, NODE_3);
      t.equal(moves[NUM.ZERO].reason, MOVE_REASON.NODE_NOT_IN_TARGET);
    });

  await t.test('capacity-denied candidates remain filter diagnostics',
    async (t) => {
      const nodes = [
        createNode(NODE_1),
        createNode(NODE_2),
        createNode(NODE_3),
      ];
      const planner = createPlanner({
        nodes,
        storageAdmissionService: createAdmissionService({
          [NODE_2]: denyAdmissionResult(),
        }),
        accountingService: createAccountingService(),
      });

      const result = await planner.calculateTargetState([], {
        targetReplicaCount: TARGET_THREE,
      });

      t.equal(
        result.placementOwnerDecision.filterResult.state,
        PLACEMENT_OWNER_FILTER_STATE.CAPACITY_CONSTRAINED,
      );
      t.equal(
        result.placementOwnerDecision.filterResult.capacityDiagnostics
          .rejectionsByReason[ADMISSION_REASON.BUDGET_EXCEEDED],
        NUM.ONE,
      );
      t.same(result.targetNodes, [NODE_1, NODE_3]);
    });

  await t.test('overloaded candidates rank behind lower load candidates',
    async (t) => {
      const decision = buildPlacementOwnerDecision({
        candidateNodes: [
          createNode(NODE_1, {cpu: CPU_HIGH, memory: NUM.TEN}),
          createNode(NODE_2, {cpu: NUM.TEN, memory: NUM.TEN}),
          createNode(NODE_3, {cpu: CPU_MEDIUM, memory: NUM.TEN}),
        ],
        currentReplicas: [],
        targetCount: TARGET_TWO,
        policy: {
          placementConstraints: {
            considerCpuLoad: true,
            considerMemoryLoad: true,
          },
        },
        placementPolicy: PLACEMENT_OWNER_POLICY.PARTITION_SPREAD,
        scoreProfile: PLACEMENT_OWNER_SCORE_PROFILE.SUITABILITY,
      });
      const firstScore = decision.scoreResult.scoreVector.find(
        (entry) => entry.nodeId === NODE_2,
      );

      t.same(decision.scoreResult.rankedNodeIds, [NODE_2, NODE_3, NODE_1]);
      t.ok(
        firstScore.dimensions.some(
          (entry) =>
            entry.dimension === PLACEMENT_OWNER_SCORE_DIMENSION.CPU_LOAD,
        ),
      );
    });

  await t.test('transition reservations and deferrals shape the intent',
    async (t) => {
      const decision = buildPlacementOwnerDecision({
        candidateNodes: [
          createNode(NODE_1, {cpu: NUM.ONE}),
          createNode(NODE_2, {cpu: NUM.TWO}),
          createNode(NODE_3, {cpu: NUM.THREE}),
          createNode(NODE_4, {cpu: NUM.FOUR}),
        ],
        currentReplicas: [],
        targetCount: TARGET_TWO,
        policy: {
          placementConstraints: {considerCpuLoad: true},
        },
        transitionSnapshot: {
          nodesWithEntityAddTransitional: new Set([NODE_2]),
          nodesWithGlobalSystemAddTransitional: new Set([NODE_1]),
        },
        includeGlobalSystemDeferral: true,
        placementPolicy: PLACEMENT_OWNER_POLICY.PARTITION_SPREAD,
        scoreProfile: PLACEMENT_OWNER_SCORE_PROFILE.SUITABILITY,
      });

      t.equal(
        decision.reservationResult.state,
        PLACEMENT_OWNER_RESERVATION_STATE.RESERVATIONS_APPLIED,
      );
      t.same(decision.intent.targetNodeIds, [NODE_2, NODE_3]);
      t.same(decision.intent.deferredNodeIds, [NODE_1]);
      t.same(decision.intent.reservedNodeIds, [NODE_2]);
    });

  await t.test('no target and no candidates produce explicit no-op reasons',
    async (t) => {
      const noTargetDecision = buildPlacementOwnerDecision({
        candidateNodes: [createNode(NODE_1)],
        currentReplicas: [],
        targetCount: TARGET_ZERO,
        policy: {},
      });
      const noCandidateDecision = buildPlacementOwnerDecision({
        candidateNodes: [],
        currentReplicas: [],
        targetCount: TARGET_TWO,
        policy: {},
      });

      t.equal(
        noTargetDecision.intent.state,
        PLACEMENT_OWNER_INTENT_STATE.NO_TARGET_REQUESTED,
      );
      t.same(noTargetDecision.intent.targetNodeIds, []);
      t.equal(
        noCandidateDecision.intent.state,
        PLACEMENT_OWNER_INTENT_STATE.NO_CANDIDATES,
      );
      t.same(noCandidateDecision.intent.targetNodeIds, []);
    });
});
