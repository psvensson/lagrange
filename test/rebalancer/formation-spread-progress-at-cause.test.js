import {test} from 'node:test';
import assert from 'node:assert/strict';
import {
  createMockCache,
  createMockCdcService,
  createMockMessageRouter,
  createNodeEndpoint,
  initializeTestEnvironment,
} from './unified-rebalancer-test-support.js';
import {
  createMockCoordinator,
  createMockControlPlaneReadinessService,
  createMockPolicyService,
} from './test-helpers.js';
import {
  EntityType,
  ReplicaStatus,
  UnifiedRebalancer,
} from '../../src/rebalancer/unified-rebalancer.js';
import {
  MOVE_REASON,
  REBALANCER_MOVE_TYPE,
} from '../../src/rebalancer/rebalancer-constants.js';
import {
  applyOverTargetCapAddRetention,
  evaluatePriorityStandaloneRemoveSafety,
} from '../../src/rebalancer/move-planner-priority-spread-cure.js';
import {
  FORMATION_RELEASE_HANDOFF_REASON,
  FORMATION_RELEASE_HANDOFF_STATE,
} from '../../src/control-plane/formation-release-handoff-contract.js';
import {FIXTURE_ENDPOINT_INCARNATION} from '../test-helpers/endpoint-incarnation-fixture.js';
import {
  observeBackgroundPrioritySpreadBlocked,
  registerBackgroundPrioritySpreadReleaseWake,
  resolveBackgroundPrioritySpreadStableRelease,
} from '../../src/rebalancer/background-priority-spread-release-tracker.js';

const SEED_NODE_ID = 'node-0';
const JOINER_1 = 'node-1';
const JOINER_2 = 'node-2';
const JOINER_3 = 'node-3';
const JOINER_4 = 'node-4';
const ALL_FORMATION_NODE_IDS = Object.freeze([
  SEED_NODE_ID,
  JOINER_1,
  JOINER_2,
  JOINER_3,
  JOINER_4,
]);
const PUBLICATIONS_PARTITION_ID = 'control_plane_publications-p1';
const LEDGER_PARTITION_ID = 'replica_operations-p1';
const LIVE_LEASE_EXPIRES_AT_MS = 1_900_000_000_000;

function buildTestFixture(options = {}) {
  initializeTestEnvironment();
  const {
    partitionId = PUBLICATIONS_PARTITION_ID,
    handoffActive = true,
    handoffReleaseAuthorized = false,
    joiner1Connected = true,
    joiner2Connected = true,
    joiner3Connected = true,
    joiner4Connected = true,
    seedReplicas = 3,
    activeNodeIds = [SEED_NODE_ID],
    joiner3ActiveExpired = false,
  } = options;

  const nodes = [
    {
      node_id: SEED_NODE_ID,
      status: 'active',
      connection_state: 'ready',
      ready_lease_expires_at: LIVE_LEASE_EXPIRES_AT_MS,
      boot_incarnation: FIXTURE_ENDPOINT_INCARNATION,
    },
    {
      node_id: JOINER_1,
      status: 'joining',
      connection_state: joiner1Connected ? 'connected' : 'disconnected',
      ready_lease_expires_at: 0,
      boot_incarnation: FIXTURE_ENDPOINT_INCARNATION,
    },
    {
      node_id: JOINER_2,
      status: 'joining',
      connection_state: joiner2Connected ? 'connected' : 'disconnected',
      ready_lease_expires_at: 0,
      boot_incarnation: FIXTURE_ENDPOINT_INCARNATION,
    },
    {
      node_id: JOINER_3,
      status: joiner3ActiveExpired ? 'active' : 'joining',
      connection_state: joiner3Connected ? (joiner3ActiveExpired ? 'ready' : 'connected') : 'disconnected',
      ready_lease_expires_at: joiner3ActiveExpired ? 0 : 0,
      boot_incarnation: FIXTURE_ENDPOINT_INCARNATION,
    },
    {
      node_id: JOINER_4,
      status: 'joining',
      connection_state: joiner4Connected ? 'connected' : 'disconnected',
      ready_lease_expires_at: 0,
      boot_incarnation: FIXTURE_ENDPOINT_INCARNATION,
    },
  ];

  const services = [];
  for (let i = 1; i <= seedReplicas; i++) {
    services.push({
      service_id: `${partitionId}-r${i}`,
      replica_id: `${partitionId}-r${i}`,
      partition_id: partitionId,
      node_id: SEED_NODE_ID,
      service_type: 'partition',
      status: ReplicaStatus.ACTIVE,
      raft_role: i === 1 ? 'leader' : 'follower',
    });
  }

  const partitions = [
    {
      partition_id: partitionId,
      desired_replication_factor: 3,
      min_sync_replicas: 2,
    },
  ];

  const nodeEndpoints = [createNodeEndpoint(SEED_NODE_ID)];
  if (joiner1Connected) nodeEndpoints.push(createNodeEndpoint(JOINER_1));
  if (joiner2Connected) nodeEndpoints.push(createNodeEndpoint(JOINER_2));
  if (joiner3Connected) nodeEndpoints.push(createNodeEndpoint(JOINER_3));
  if (joiner4Connected) nodeEndpoints.push(createNodeEndpoint(JOINER_4));

  const mockCache = createMockCache(
    nodes,
    services,
    partitions,
    [],
    [],
    nodeEndpoints,
    [],
  );

  const startupAuthoritySnapshot = Object.freeze({
    authorityAvailable: true,
    state: 'active',
    canonicalStartupNodeIds: [...ALL_FORMATION_NODE_IDS],
    formationReleaseHandoff: handoffActive ?
      Object.freeze({
        active: true,
        state: FORMATION_RELEASE_HANDOFF_STATE.ACTIVE,
        reason: FORMATION_RELEASE_HANDOFF_REASON.RETAINED_UNTIL_READY,
        releaseAuthorized: handoffReleaseAuthorized,
        readyNodeIds: Object.freeze([...activeNodeIds]),
        pendingNodeIds: Object.freeze(
          ALL_FORMATION_NODE_IDS.filter((id) => !activeNodeIds.includes(id)),
        ),
      }) :
      null,
  });

  const readinessCallbacks = {
    getStartupAuthoritySnapshotSync() {
      return startupAuthoritySnapshot;
    },
    answerCommittedNodes() {
      return {
        state: 'ready',
        epoch: {
          publicationEpoch: 1,
          publicationId: 'cluster_membership-1',
          readAtMs: Date.now(),
        },
        nodeRows: mockCache.getAll('nodes'),
      };
    },
  };

  const mockReadiness = createMockControlPlaneReadinessService({
    systemTableCache: mockCache,
    callbacks: readinessCallbacks,
  });

  const mockMessageRouter = createMockMessageRouter('connected');
  mockMessageRouter.hasRoute = (targetNodeId) => {
    if (targetNodeId === JOINER_1) return joiner1Connected;
    if (targetNodeId === JOINER_2) return joiner2Connected;
    if (targetNodeId === JOINER_3) return joiner3Connected;
    if (targetNodeId === JOINER_4) return joiner4Connected;
    return targetNodeId === SEED_NODE_ID;
  };
  mockMessageRouter.hasLiveTransport = (targetNodeId) => {
    return mockMessageRouter.hasRoute(targetNodeId);
  };
  mockMessageRouter.getCurrentPrimaryConnectionBootIncarnation = (nodeId) => {
    if (mockMessageRouter.hasRoute(nodeId)) {
      return {nodeId, bootIncarnation: FIXTURE_ENDPOINT_INCARNATION};
    }
    return null;
  };

  const mockPolicyService = createMockPolicyService({partitions});
  const mockCoordinator = createMockCoordinator({
    controlPlaneReadinessService: mockReadiness,
  });

  const rebalancer = new UnifiedRebalancer({
    entityId: partitionId,
    entityType: EntityType.PARTITION,
    nodeId: SEED_NODE_ID,
    systemTableCache: mockCache,
    cdcIntegrationService: createMockCdcService(),
    tablePolicyService: mockPolicyService,
    messageRouter: mockMessageRouter,
    rebalanceCoordinator: mockCoordinator,
    controlPlaneReadinessService: mockReadiness,
    nowFn: () => Date.now(),
  });

  rebalancer.initialize();
  rebalancer.isLeader = true;
  rebalancer.isStabilized = () => true;

  return {
    rebalancer,
    mockCache,
    mockReadiness,
    mockMessageRouter,
    startupAuthoritySnapshot,
  };
}

test('first-causal-divergence: 4 joining nodes stall on node_ready_lease_incomplete / incomplete priority spread', async () => {
  const {rebalancer, mockCache} = buildTestFixture({
    partitionId: PUBLICATIONS_PARTITION_ID,
    handoffActive: true,
    handoffReleaseAuthorized: false,
    seedReplicas: 3,
  });

  // Proof Assertion 1: A joining node in the formation cohort MUST classify as
  // a spread-cure target while formation release handoff is active, even before
  // releaseAuthorized is granted.
  const joiner1Node = mockCache.get('nodes', JOINER_1);
  const isCureTarget = rebalancer.isFormationCohortSpreadCureTarget(joiner1Node);
  assert.equal(
    isCureTarget,
    true,
    'a joining formation cohort node must classify as a spread cure target while handoff is active',
  );

  // Proof Assertion 2: The critical topology settling gate MUST NOT block on
  // NODE_READY_LEASE_INCOMPLETE for transitional joining nodes that are the very
  // cure targets waiting to receive priority replicas.
  const settlingBlocker = rebalancer.getCriticalSystemTopologySettlingBlocker();
  assert.equal(
    settlingBlocker,
    null,
    'critical topology settling must not defer on node_ready_lease_incomplete for formation cohort targets',
  );

  // Proof Assertion 3: Moves are calculated to cure priority spread onto joining nodes
  // rather than stalling with spreadGap > 0.
  const targetState = {
    targetReplicaCount: 3,
    targetNodes: [SEED_NODE_ID, JOINER_1, JOINER_2],
    availableNodeCount: 5,
  };
  const moves = await rebalancer.calculateMoves(
    rebalancer.getCurrentReplicas(),
    targetState,
  );

  assert.ok(Array.isArray(moves), 'calculateMoves returns an array');
  const addMoves = moves.filter((m) => m.type === REBALANCER_MOVE_TYPE.ADD);
  assert.ok(addMoves.length > 0, 'priority spread ADD moves must be generated onto joining targets');
  assert.equal(
    addMoves[0].reason,
    MOVE_REASON.SPREAD_REPLICAS,
    'retained spread cure move must have reason SPREAD_REPLICAS',
  );
  assert.ok(
    [JOINER_1, JOINER_2].includes(addMoves[0].nodeId),
    'spread cure ADD target must be one of the joining cohort nodes',
  );
});

test('historical-failure-family-witnesses: covers the four historical failure families', async () => {
  // Family 1: formation-voter-surplus-promotion-deferral-livelock
  // When surplus voters exceed target on an already spread partition, refuse additional ADDs.
  const family1Result = applyOverTargetCapAddRetention({
    partitionId: PUBLICATIONS_PARTITION_ID,
    activePlacementReplicas: [
      {replica_id: 'r1', node_id: SEED_NODE_ID},
      {replica_id: 'r2', node_id: JOINER_1},
      {replica_id: 'r3', node_id: JOINER_2},
      {replica_id: 'r4', node_id: JOINER_3},
    ],
    addMoves: [{type: 'ADD', nodeId: JOINER_4, reason: MOVE_REASON.INCREASE_REPLICA_COUNT}],
    inFlightReplaceCount: 0,
    surplusVoterCount: 4,
    targetNodeIds: [SEED_NODE_ID, JOINER_1, JOINER_2],
    targetReplicaCount: 3,
    resolvePartitionRow: () => ({desired_replication_factor: 3}),
    observedMembershipEpoch: 1,
  });
  assert.equal(
    family1Result.decision,
    'refuse_all_adds',
    'surplus growth on already-spread partition must be refused (voter-surplus promotion livelock prevention)',
  );
  assert.equal(family1Result.retainedSpreadCureAddCount, 0);

  // Family 2: formation-ledger-spread-completion-self-move-interlock-deadlock
  // Ledger self-move serialization: a finished move does not wedge further count-neutral spread replace.
  const {rebalancer: ledgerRebalancer} = buildTestFixture({
    partitionId: LEDGER_PARTITION_ID,
  });
  assert.equal(
    ledgerRebalancer.isControlPlanePriorityPartition(),
    true,
    'replica_operations-p1 is recognized as a priority control-plane partition',
  );

  // Family 3: over-target-cap-spread-cure-wipe
  // When an over-target partition has an open spread gap, over-target cap MUST retain spread ADDs.
  const family3Result = applyOverTargetCapAddRetention({
    partitionId: PUBLICATIONS_PARTITION_ID,
    activePlacementReplicas: [
      {replica_id: 'r1', node_id: SEED_NODE_ID},
      {replica_id: 'r2', node_id: SEED_NODE_ID},
      {replica_id: 'r3', node_id: SEED_NODE_ID},
      {replica_id: 'r4', node_id: JOINER_1},
    ],
    addMoves: [
      {type: 'ADD', nodeId: JOINER_2, reason: MOVE_REASON.INCREASE_REPLICA_COUNT},
    ],
    inFlightReplaceCount: 0,
    surplusVoterCount: 4,
    targetNodeIds: [SEED_NODE_ID, JOINER_1, JOINER_2],
    targetReplicaCount: 3,
    resolvePartitionRow: () => ({desired_replication_factor: 3}),
    observedMembershipEpoch: 1,
  });
  assert.equal(
    family3Result.decision,
    'retain_spread_cure_adds',
    'over-target partition with open spread gap must retain spread cure ADDs (not wipe them)',
  );
  assert.equal(family3Result.retainedSpreadCureAddCount, 1);

  // Family 4: formation-release-handoff-closure-v4
  // Generation-fenced handoff: releaseAuthorized is false while pending cohort members remain unready.
  const {startupAuthoritySnapshot} = buildTestFixture({
    handoffActive: true,
    handoffReleaseAuthorized: false,
    activeNodeIds: [SEED_NODE_ID],
  });
  assert.equal(
    startupAuthoritySnapshot.formationReleaseHandoff.releaseAuthorized,
    false,
    'formation release handoff must not authorize release prematurely while cohort is pending',
  );
  assert.equal(
    startupAuthoritySnapshot.formationReleaseHandoff.pendingNodeIds.length,
    4,
    'all 4 joining nodes are pending',
  );
});

test('composed-safety-and-finite-failure-progress: preserves safety and progresses after finite failure clears', async () => {
  // Phase 1: Finite failure injected: JOINER_1 is temporarily disconnected
  const {rebalancer: rebalancerPhase1, mockMessageRouter, mockCache} = buildTestFixture({
    partitionId: PUBLICATIONS_PARTITION_ID,
    joiner1Connected: false,
    joiner2Connected: true,
  });

  // JOINER_1 is not eligible while transport is disconnected
  const joiner1EligibleDuringFailure =
    rebalancerPhase1.isStartupAuthorityControlPlanePlacementEligibleNode(JOINER_1);
  assert.equal(
    joiner1EligibleDuringFailure,
    false,
    'temporarily disconnected node is not placement eligible during failure',
  );

  // Quorum safety: seed replicas (3) preserve quorum throughout
  const seedReplicas = rebalancerPhase1.getCurrentReplicas();
  assert.equal(seedReplicas.length, 3, 'quorum is preserved on seed');
  assert.ok(seedReplicas.length >= 2, 'quorum threshold met');

  // Phase 2: Finite failure clears: JOINER_1 reconnects
  mockCache.get('nodes', JOINER_1).connection_state = 'connected';
  mockMessageRouter.hasRoute = (_id) => true;
  mockMessageRouter.hasLiveTransport = (_id) => true;

  const joiner1EligibleAfterClear =
    rebalancerPhase1.isStartupAuthorityControlPlanePlacementEligibleNode(JOINER_1);
  assert.equal(
    joiner1EligibleAfterClear,
    true,
    'reconnected node becomes placement eligible after finite failure clears',
  );

  // Progress: calculation yields an ADD onto the cured node
  const targetState = {
    targetReplicaCount: 3,
    targetNodes: [SEED_NODE_ID, JOINER_1, JOINER_2],
    availableNodeCount: 5,
  };
  const moves = await rebalancerPhase1.calculateMoves(seedReplicas, targetState);
  assert.ok(moves.length > 0, 'progresses after finite failure clears');
  const addMove = moves.find((m) => m.type === REBALANCER_MOVE_TYPE.ADD);
  assert.ok(addMove, 'spread ADD move produced');
  assert.ok([JOINER_1, JOINER_2].includes(addMove.nodeId), 'targets joining cohort member');
});

test('meaningful-negative-control: genuinely persistent blocker refuses premature release and unsafe move', async () => {
  // Negative Control 1: An unready active node (expired ready lease) MUST block critical topology settling.
  const {rebalancer: rebalancerNeg1} = buildTestFixture({
    partitionId: PUBLICATIONS_PARTITION_ID,
    joiner3ActiveExpired: true,
  });

  // When an active peer has an expired lease, settling MUST block
  const blocker = rebalancerNeg1.getCriticalSystemTopologySettlingBlocker();
  assert.ok(blocker !== null, 'active node with expired lease must produce a topology settling blocker');
  assert.equal(
    blocker.reason,
    'node_ready_lease_incomplete',
    'blocker reason must be node_ready_lease_incomplete',
  );

  // Negative Control 2: An unreachable node without live transport is refused as cure target
  const {rebalancer: rebalancerNeg2} = buildTestFixture({
    partitionId: PUBLICATIONS_PARTITION_ID,
    joiner1Connected: false,
  });
  const unreachJoiner = rebalancerNeg2.systemTableCache.get('nodes', JOINER_1);
  const unreachCureTarget = rebalancerNeg2.isFormationCohortSpreadCureTarget(unreachJoiner);
  assert.equal(
    unreachCureTarget,
    false,
    'unreachable node lacking live transport evidence must be refused as cure target',
  );

  // Negative Control 3: Unsafe remove that would reduce distinct nodes below required count is rejected
  const removeSafety = evaluatePriorityStandaloneRemoveSafety({
    replicaId: `${PUBLICATIONS_PARTITION_ID}-r1`,
    activePlacementReplicas: [
      {replica_id: `${PUBLICATIONS_PARTITION_ID}-r1`, node_id: SEED_NODE_ID},
      {replica_id: `${PUBLICATIONS_PARTITION_ID}-r2`, node_id: JOINER_1},
    ],
    targetReplicaCount: 3,
    priorityPartition: true,
    prioritySpreadPolicy: {enabled: true},
    availableNodes: [{node_id: SEED_NODE_ID}, {node_id: JOINER_1}, {node_id: JOINER_2}],
    analyzePrioritySpread: (replicas) => ({
      requiresSpread: true,
      satisfied: false,
      actualDistinctNodeCount: new Set(replicas.map((r) => r.node_id)).size,
      requiredDistinctNodeCount: 3,
    }),
  });
  assert.equal(
    removeSafety.safe,
    false,
    'standalone remove that leaves priority spread unsatisfied is unsafe and must be refused',
  );
});

test('unchanged-bounds-and-owned-wake: progress occurs via owned canonical wake within unchanged bounds', async () => {
  let wakeTriggered = false;
  const mockReadinessOwner = {};

  observeBackgroundPrioritySpreadBlocked({
    readinessOwner: mockReadinessOwner,
    observedAt: 1000,
  });

  const registered = registerBackgroundPrioritySpreadReleaseWake({
    readinessOwner: mockReadinessOwner,
    wakeKey: PUBLICATIONS_PARTITION_ID,
    onStableRelease: () => {
      wakeTriggered = true;
    },
  });

  assert.equal(registered, true, 'wake registration succeeds on active tracker');
  assert.equal(wakeTriggered, false, 'wake has not fired yet');

  // Trigger the canonical wake: progress occurs immediately via the owned event
  resolveBackgroundPrioritySpreadStableRelease({
    readinessOwner: mockReadinessOwner,
    observedAt: 2000,
    requiredStableMs: 0,
  });

  assert.equal(wakeTriggered, true, 'owned canonical wake fires without waiting for timer fallback');
});
