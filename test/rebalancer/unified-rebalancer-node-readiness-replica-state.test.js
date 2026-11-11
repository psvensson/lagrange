import {createMockCoordinator} from './test-helpers.js';
import {DEFAULT_TABLE_POLICY} from '../../src/policy/policy-constants.js';
/**
 * Unit tests for UnifiedRebalancer.
 * Tests the core rebalancing logic for partitions and message groups.
 * Requirements: 8.1, 8.2, 8.3
 */

import {test} from '../../src/test-helpers/tap.js';
import {
} from '../../src/cdc/cdc-integration-service.js';
import {
} from '../../src/control-plane/control-plane-system-table-gateway.js';
import {
} from '../../src/rebalancer/replica-operation-repository.js';
import {
  UnifiedRebalancer,
  EntityType,
  TriggerType,
  MoveType,
  ReplicaStatus,
  NodeStatus,
  DEFAULT_MESSAGE_GROUP_POLICY,
} from '../../src/rebalancer/unified-rebalancer.js';
import {
} from '../../src/rebalancer/replica-status.js';
import {
  REBALANCER_SKIP_REASON,
} from '../../src/rebalancer/rebalancer-constants.js';
import {SERVICE_TYPE} from '../../src/constants/service.js';
import {
} from '../../src/control-plane/control-plane-workload-profile.js';
import {
} from '../../src/bootstrap/lifecycle-controller-constants.js';
import {
} from '../../src/rebalancer/storage-capacity-constants.js';
import {
} from '../../src/bootstrap/system-table-schemas-constants.js';
import {
} from '../../src/constants/index.js';

import {
  createMockCache,
  createMockCdcService,
  createMockMembershipPublicationService,
  createMockMessageRouter,
  createMockPolicyService,
  createMockControlPlaneReadinessService,
  initializeTestEnvironment,
} from './unified-rebalancer-test-support.js';
import {withNodeReadinessService} from '../helpers/readiness-service-fixture.js';
import {readinessServiceFake} from '../helpers/readiness-service-fixture.js';
import {stubAvailableNodes} from './available-node-plan-stub.js';
import {answeredPriorityClassCounts} from './incomplete-operations-read-stub.js';
import {
  CACHE_PROJECTION,
  OWNER_READ,
  createDurableStepWorld,
} from './durable-step-authority-fixture.js';
import {RECONCILE_REASON} from '../../src/workflow/reconcile-queue-constants.js';

// Initialize test environment
// Create a mock system table cache
// Create mock CDC integration service
// Create mock table policy service
// Create mock message router
// Create mock rebalance coordinator
// Create a fully configured rebalancer for testing
function createTestRebalancer(options = {}) {
  const {
    entityId = 'partition-1',
    entityType = EntityType.PARTITION,
    nodeId = 'node-1',
    nodes = [],
    services = [],
    partitions = [],
    tables = [],
    replicaOperations = [],
    nodeEndpoints = [],
    serviceEndpoints = [],
    connectionState = 'connected',
    sqlQueryEngine = null,
    controlPlaneSystemTableGateway = null,
    cdcIntegrationService = null,
    messageRouter = null,
    rebalanceCoordinator = null,
    controlPlaneReadinessService = null,
    bootstrapReadinessState = null,
    nowFn = null,
    priorityRecoveryActivityStaleGraceMs = null,
  } = options;

  const mockCache = createMockCache(
    nodes,
    services,
    partitions,
    tables,
    replicaOperations,
    nodeEndpoints,
    serviceEndpoints,
  );
  const mockCdcService = cdcIntegrationService || createMockCdcService();
  const mockPolicyService = createMockPolicyService({partitions: partitions, tables: tables});
  const mockMessageRouter = messageRouter ||
    createMockMessageRouter(connectionState);
  const mockSqlQueryEngine = sqlQueryEngine || {
    async executeQuery() {
      return {success: true, rows: []};
    },
  };
  // A named hand fake is completed by the one fixture completer.
  const mockReadinessService = controlPlaneReadinessService ?
    readinessServiceFake(controlPlaneReadinessService, nowFn || undefined) :
    createMockControlPlaneReadinessService({
      systemTableCache: mockCache,
      ...(nowFn ? {now: nowFn} : {}),
    });
  const mockCoordinator = rebalanceCoordinator || createMockCoordinator({
    controlPlaneReadinessService: mockReadinessService,
  });

  return new UnifiedRebalancer({
    entityId,
    entityType,
    nodeId,
    systemTableCache: mockCache,
    cdcIntegrationService: mockCdcService,
    tablePolicyService: mockPolicyService,
    messageRouter: mockMessageRouter,
    rebalanceCoordinator: mockCoordinator,
    sqlQueryEngine: mockSqlQueryEngine,
    controlPlaneSystemTableGateway,
    controlPlaneReadinessService: mockReadinessService,
    bootstrapReadinessState,
    nowFn,
    priorityRecoveryActivityStaleGraceMs,
  });
}

test('UnifiedRebalancer serializes ordinary priority recovery moves while another ordinary priority move is already in flight',
  async (t) => {
    initializeTestEnvironment();

    const rebalancer = createTestRebalancer({
      entityId: 'sql_transactions-p1',
      entityType: EntityType.PARTITION,
      nodeId: 'node-1',
      nodes: [
        {node_id: 'node-1', status: NodeStatus.ACTIVE},
        {node_id: 'node-2', status: NodeStatus.ACTIVE},
      ],
    });
    rebalancer.controlPlaneReadinessService.membershipPublicationService =
      createMockMembershipPublicationService(
        ['node-1', 'node-2'],
        1,
        {
          priorityPartitionSummary: {
            satisfied: false,
            blockedPartitions: [{
              partitionId: 'sql_transactions-p1',
              spreadGap: 1,
            }],
          },
        },
      );
    rebalancer.rebalanceCoordinator.getConcurrentAddCountByPriorityClass =
      async () => answeredPriorityClassCounts({
        priorityCount: 1,
        ordinaryPriorityCount: 1,
        emergencyPriorityCount: 0,
        nonPriorityCount: 0,
      });

    rebalancer.setLeader(true);
    rebalancer.getCurrentReplicas = () => [];
    stubAvailableNodes(rebalancer, () => ([
      {node_id: 'node-1'},
      {node_id: 'node-2'},
    ]));
    rebalancer.movePlanner.calculateTargetState = async () => ({
      targetReplicaCount: 2,
    });
    rebalancer.movePlanner.calculateMoves = () => ([
      {
        type: MoveType.ADD,
        nodeId: 'node-2',
        replicaId: 'sql-transactions-r2',
      },
    ]);
    rebalancer.movePlanner.applyPressureGating = async (moves) => moves;
    rebalancer.movePlanner.isCriticalState = () => true;
    rebalancer.getConfiguredRebalanceBudget = async () => 5;
    rebalancer.getGlobalInFlightOperationCount = async () => 0;
    rebalancer.executeRebalancingMoves = async () => {
      t.fail(
        'ordinary priority recovery should not launch another move while one ordinary priority add is already in flight',
      );
    };

    const result = await rebalancer.rebalance(
      TriggerType.PERIODIC,
      {targetReplicaCount: 2, placementConstraints: {}},
    );

    t.equal(
      result.success,
      true,
      'serial ordinary priority gating should remain a clean skip',
    );
    t.equal(
      result.skipped,
      true,
      'ordinary priority recovery should defer while another ordinary priority move is in flight',
    );
    t.equal(
      result.reason,
      REBALANCER_SKIP_REASON.BUDGET_EXCEEDED,
      'serial ordinary priority gating should surface through the existing budget skip reason',
    );
    t.equal(
      result.ordinaryPriorityRecoverySerialGate?.ordinaryPriorityInFlightCount,
      1,
      'serial priority gating should expose the blocking in-flight ordinary priority count',
    );

    rebalancer.shutdown();
  });

// Paired witness, gate 1: the planner's ordinary-priority serial gate counts
// in-flight ADDs from the owner's replica_operations list read. A read the
// owner did not answer is an unknown count: the gate HOLDS (and arms the
// named wait that re-asks), and it admits once the owner answers. The
// failure is injected at the read port of a real coordinator.
test('Ordinary priority serial gate holds on an unanswered list read and admits once the owner answers',
  async (t) => {
    initializeTestEnvironment();
    const world = createDurableStepWorld({partitionId: 'sql_transactions-p1'});
    world.cacheProjection = CACHE_PROJECTION.EMPTY;
    world.ownerRead = OWNER_READ.UNAVAILABLE;
    const rebalancer = createTestRebalancer({
      entityId: 'sql_transactions-p1',
      entityType: EntityType.PARTITION,
      nodeId: 'node-1',
      nodes: [
        {node_id: 'node-1', status: NodeStatus.ACTIVE},
        {node_id: 'node-2', status: NodeStatus.ACTIVE},
      ],
    });
    rebalancer.controlPlaneReadinessService.membershipPublicationService =
      createMockMembershipPublicationService(['node-1', 'node-2'], 1, {
        priorityPartitionSummary: {
          satisfied: false,
          blockedPartitions: [{partitionId: 'sql_transactions-p1', spreadGap: 1}],
        },
      });
    rebalancer.rebalanceCoordinator.getConcurrentAddCountByPriorityClass =
      (options) => world.coordinator.getConcurrentAddCountByPriorityClass(options);
    const cacheListeners = new Set();
    rebalancer.systemTableCache.onCacheChange = (listener) =>
      cacheListeners.add(listener);
    rebalancer.systemTableCache.offCacheChange = (listener) =>
      cacheListeners.delete(listener);
    const enqueuedReasons = [];
    rebalancer.enqueueRebalanceCheck = (reason) => {
      enqueuedReasons.push(reason);
      return true;
    };
    rebalancer.setLeader(true);
    rebalancer.getCurrentReplicas = () => [];
    stubAvailableNodes(rebalancer, () => ([{node_id: 'node-1'}, {node_id: 'node-2'}]));
    rebalancer.movePlanner.calculateTargetState = async () => ({targetReplicaCount: 2});
    rebalancer.movePlanner.calculateMoves = () => ([
      {type: MoveType.ADD, nodeId: 'node-2', replicaId: 'sql-transactions-r2'},
    ]);
    rebalancer.movePlanner.applyPressureGating = async (moves) => moves;
    rebalancer.movePlanner.isCriticalState = () => true;
    rebalancer.getConfiguredRebalanceBudget = async () => 5;
    rebalancer.getGlobalInFlightOperationCount = async () => 0;
    const executedMoves = [];
    rebalancer.executeRebalancingMoves = async (moves) => {
      executedMoves.push(...moves);
      return moves.map((move) => ({success: true, skipped: false, nodeId: move.nodeId}));
    };
    const policy = {targetReplicaCount: 2, placementConstraints: {}};

    const held = await rebalancer.rebalance(TriggerType.PERIODIC, policy);
    t.ok(world.unavailableOwnerReads > 0, 'the owner list read failed at the port');
    t.equal(executedMoves.length, 0,
      'no ordinary-priority ADD is admitted on an unknown in-flight count');
    t.equal(held.skipped, true, 'the pass is a clean skip');
    t.equal(held.ordinaryPriorityRecoverySerialGate?.countState, 'unanswered',
      'the gate names the unanswered count');
    t.equal(held.ordinaryPriorityRecoverySerialGate?.ordinaryPriorityInFlightCount,
      null, 'an unanswered count is not zero');
    t.equal(cacheListeners.size, 1, 'the named wait is armed while the gate holds');

    enqueuedReasons.length = 0;
    for (const listener of [...cacheListeners]) listener('services');
    t.same(enqueuedReasons,
      [RECONCILE_REASON.OPERATION_LIST_READ_SOURCE_CHANGED],
      'a change of an owner-route source table re-asks once');
    t.equal(cacheListeners.size, 0, 'the wait disarms when it fires');

    world.ownerRead = OWNER_READ.ABSENT;
    const admitted = await rebalancer.rebalance(TriggerType.PERIODIC, policy);
    t.equal(executedMoves.length, 1, 'the ADD is admitted once the owner answers');
    t.equal(admitted.success, true);
    t.equal(cacheListeners.size, 0, 'an answered count leaves no wait armed');
    rebalancer.shutdown();
  });

// Paired witness, item C: the global move budget is charged with the
// cluster-wide in-flight count. A count read that does not answer holds an
// ordinary entity's pass (budget query failure, named wait armed) instead of
// opening the whole budget; the emergency lane is not held - the
// coordinator's emergency admission decides through the priority bypass.
async function runGlobalCountWitnessPass({entityId, countAnswers, priorityAdmits}) {
  const port = {countAnswers, countReads: 0};
  const gateway = {
    async readAuthoritativeRows(tableName) {
      if (tableName !== 'replica_operations') return {success: true, rows: []};
      port.countReads += 1;
      return port.countAnswers ?
        {success: true, rows: [{total_count: 0}]} :
        {success: false, errorCode: 'ROUTER_NO_CONNECTION', rows: []};
    },
  };
  const rebalancer = createTestRebalancer({
    entityId,
    entityType: EntityType.PARTITION,
    nodeId: 'node-1',
    nodes: [
      {node_id: 'node-1', status: NodeStatus.ACTIVE},
      {node_id: 'node-2', status: NodeStatus.ACTIVE},
    ],
    controlPlaneSystemTableGateway: gateway,
  });
  const cacheListeners = new Set();
  rebalancer.systemTableCache.onCacheChange = (listener) => cacheListeners.add(listener);
  rebalancer.systemTableCache.offCacheChange = (listener) => cacheListeners.delete(listener);
  rebalancer.rebalanceCoordinator.canStartPriorityAddOperation = async () => priorityAdmits;
  rebalancer.getOrdinaryPriorityRecoverySerialGateSnapshot = async () => null;
  rebalancer.setLeader(true);
  rebalancer.getCurrentReplicas = () => [];
  stubAvailableNodes(rebalancer, () => ([{node_id: 'node-1'}, {node_id: 'node-2'}]));
  rebalancer.movePlanner.calculateTargetState = async () => ({targetReplicaCount: 2});
  rebalancer.movePlanner.calculateMoves = () => ([
    {type: MoveType.ADD, nodeId: 'node-2', replicaId: `${entityId}-r2`},
  ]);
  rebalancer.movePlanner.applyPressureGating = async (moves) => moves;
  rebalancer.movePlanner.isCriticalState = () => false;
  const executedMoves = [];
  rebalancer.executeRebalancingMoves = async (moves) => {
    executedMoves.push(...moves);
    return moves.map((move) => ({success: true, skipped: false, nodeId: move.nodeId}));
  };
  const result = await rebalancer.rebalance(TriggerType.PERIODIC,
    {targetReplicaCount: 2, placementConstraints: {}});
  const armedWaits = cacheListeners.size;
  rebalancer.shutdown();
  return {result, executedMoves, port, armedWaits};
}

test('An unanswered global in-flight count holds ordinary planning and leaves the emergency lane to its admission',
  async (t) => {
    initializeTestEnvironment();
    const held = await runGlobalCountWitnessPass({
      entityId: 'user_orders-p1', countAnswers: false, priorityAdmits: true});
    t.ok(held.port.countReads > 0, 'the count read failed at the port');
    t.equal(held.executedMoves.length, 0, 'no move on an unknown in-flight count');
    t.equal(held.result.reason, REBALANCER_SKIP_REASON.BUDGET_QUERY_FAILED,
      'the pass names the failed budget read');
    t.equal(held.armedWaits, 1, 'the list-read wait is armed to re-ask');

    const answered = await runGlobalCountWitnessPass({
      entityId: 'user_orders-p1', countAnswers: true, priorityAdmits: true});
    t.equal(answered.executedMoves.length, 1, 'the move runs once the count answers');

    const emergency = await runGlobalCountWitnessPass({
      entityId: 'replica_operations-p1', countAnswers: false, priorityAdmits: true});
    t.equal(emergency.executedMoves.length, 1,
      'the emergency lane is not held by the unanswered count');
    const emergencyRefused = await runGlobalCountWitnessPass({
      entityId: 'replica_operations-p1', countAnswers: false, priorityAdmits: false});
    t.equal(emergencyRefused.executedMoves.length, 0,
      'an unknown count is no free budget: emergency admission decides');
  });

test('UnifiedRebalancer keeps emergency priority recovery eligible while ordinary priority work is already in flight',
  async (t) => {
    initializeTestEnvironment();

    const rebalancer = createTestRebalancer({
      entityId: 'control_plane_publications-p1',
      entityType: EntityType.PARTITION,
      nodeId: 'node-1',
      nodes: [
        {node_id: 'node-1', status: NodeStatus.ACTIVE},
        {node_id: 'node-2', status: NodeStatus.ACTIVE},
      ],
    });
    rebalancer.controlPlaneReadinessService.membershipPublicationService =
      createMockMembershipPublicationService(
        ['node-1', 'node-2'],
        1,
        {
          priorityPartitionSummary: {
            satisfied: false,
            blockedPartitions: [{
              partitionId: 'control_plane_publications-p1',
              spreadGap: 1,
            }],
          },
        },
      );
    rebalancer.rebalanceCoordinator.getConcurrentAddCountByPriorityClass =
      async () => answeredPriorityClassCounts({
        priorityCount: 1,
        ordinaryPriorityCount: 1,
        emergencyPriorityCount: 0,
        nonPriorityCount: 0,
      });

    rebalancer.setLeader(true);
    rebalancer.getCurrentReplicas = () => [];
    stubAvailableNodes(rebalancer, () => ([
      {node_id: 'node-1'},
      {node_id: 'node-2'},
    ]));
    rebalancer.movePlanner.calculateTargetState = async () => ({
      targetReplicaCount: 2,
    });
    rebalancer.movePlanner.calculateMoves = () => ([
      {
        type: MoveType.ADD,
        nodeId: 'node-2',
        replicaId: 'control-plane-publications-r2',
      },
    ]);
    rebalancer.movePlanner.applyPressureGating = async (moves) => moves;
    rebalancer.movePlanner.isCriticalState = () => true;
    rebalancer.getConfiguredRebalanceBudget = async () => 5;
    rebalancer.getGlobalInFlightOperationCount = async () => 0;
    rebalancer.executeRebalancingMoves = async (moves) => moves.map((move) => ({
      success: true,
      skipped: false,
      operation: move.type,
      nodeId: move.nodeId,
      replicaId: move.replicaId,
    }));

    const result = await rebalancer.rebalance(
      TriggerType.PERIODIC,
      {targetReplicaCount: 2, placementConstraints: {}},
    );

    t.equal(
      result.success,
      true,
      'emergency priority recovery should still schedule work',
    );
    t.equal(
      result.moves.length,
      1,
      'emergency priority recovery should keep its bounded overflow lane',
    );
    t.equal(
      result.ordinaryPriorityRecoverySerialGate,
      undefined,
      'emergency partitions should not be blocked by the ordinary-priority serial gate',
    );

    rebalancer.shutdown();
  });

test('UnifiedRebalancer uses the canonical emergency priority classification for transport-critical recovery',
  async (t) => {
    initializeTestEnvironment();

    const rebalancer = createTestRebalancer({
      entityId: 'control_plane_publications-p1',
      entityType: EntityType.PARTITION,
      nodeId: 'node-1',
      nodes: [
        {node_id: 'node-1', status: NodeStatus.ACTIVE},
        {node_id: 'node-2', status: NodeStatus.ACTIVE},
      ],
    });
    rebalancer.controlPlaneReadinessService.membershipPublicationService =
      createMockMembershipPublicationService(
        ['node-1', 'node-2'],
        1,
        {
          priorityPartitionSummary: {
            satisfied: false,
            blockedPartitions: [{
              partitionId: 'control_plane_publications-p1',
              spreadGap: 1,
            }],
          },
        },
      );

    t.equal(
      rebalancer.getPriorityRecoveryAdmissionPlan().emergencyRecoveryActive,
      true,
      'transport-critical publication partitions should activate the emergency recovery classification',
    );

    rebalancer.shutdown();
  });

test('UnifiedRebalancer keeps reserved priority move capacity during transient publication-summary gaps',
  async (t) => {
    initializeTestEnvironment();

    let nowMs = 10_000;
    let publicationRow = {
      status: 'PUBLISHED',
      priorityPartitionSummary: {
        satisfied: false,
      },
    };
    const rebalancer = createTestRebalancer({
      entityId: 'tables-p1',
      entityType: EntityType.PARTITION,
      nodeId: 'node-1',
      nowFn: () => nowMs,
      priorityRecoveryActivityStaleGraceMs: 15_000,
      nodes: [
        {node_id: 'node-1', status: NodeStatus.ACTIVE},
        {node_id: 'node-2', status: NodeStatus.ACTIVE},
      ],
    });
    rebalancer.controlPlaneReadinessService.membershipPublicationService = {
      getLatestClusterPublicationSync() {
        return publicationRow;
      },
    };

    t.equal(
      rebalancer.getReservedPriorityRecoveryMoveSlots(),
      1,
      'active priority recovery should reserve one global move slot',
    );

    publicationRow = null;
    nowMs += 5_000;

    t.equal(
      rebalancer.getReservedPriorityRecoveryMoveSlots(),
      1,
      'transient publication read gaps should reuse the last active recovery plan within stale grace',
    );

    nowMs += 20_000;

    t.equal(
      rebalancer.getReservedPriorityRecoveryMoveSlots(),
      0,
      'once stale grace expires the reserved move slot should clear',
    );

    rebalancer.shutdown();
  });


test('UnifiedRebalancer - Policy Management', async (t) => {
  initializeTestEnvironment();

  await t.test('returns the explicit policy-owner fixture declaration', async (t) => {
    const rebalancer = createTestRebalancer({
      entityId: 'partition-1',
      entityType: EntityType.PARTITION,
      nodeId: 'node-1',
    });

    const policy = await rebalancer.getPolicy();

    t.equal(policy.targetReplicaCount, 3);
    t.equal(policy.minReplicaCount, DEFAULT_TABLE_POLICY.minReplicaCount);
    t.equal(policy.maxReplicaCount, DEFAULT_TABLE_POLICY.maxReplicaCount);
  });

  await t.test('returns default message group policy', async (t) => {
    const rebalancer = createTestRebalancer({
      entityId: 'mg-1',
      entityType: EntityType.MESSAGE_GROUP,
      nodeId: 'node-1',
    });

    const policy = await rebalancer.getPolicy();

    t.equal(policy.targetReplicaCount, DEFAULT_MESSAGE_GROUP_POLICY.targetReplicaCount);
    t.equal(policy.ensureLocalAccess, DEFAULT_MESSAGE_GROUP_POLICY.ensureLocalAccess);
  });

  await t.test('returns table policy from cache', async (t) => {
    const rebalancer = createTestRebalancer({
      entityId: 'partition-1',
      entityType: EntityType.PARTITION,
      nodeId: 'node-1',
      partitions: [{partition_id: 'partition-1', table_id: 'table-1', replica_count: 5}],
      tables: [{
        table_id: 'table-1',
        table_policies: JSON.stringify({minReplicaCount: 3}),
      }],
    });

    const policy = await rebalancer.getPolicy();

    t.equal(policy.targetReplicaCount, 5);
    t.equal(policy.minReplicaCount, 3);
  });

  await t.test(
    'message-group local access is satisfied by any local message-group replica',
    async (t) => {
      const rebalancer = createTestRebalancer({
        entityId: 'mg-1',
        entityType: EntityType.MESSAGE_GROUP,
        nodeId: 'node-1',
        nodes: [
          {node_id: 'node-1', status: NodeStatus.ACTIVE},
          {node_id: 'node-2', status: NodeStatus.ACTIVE},
          {node_id: 'node-3', status: NodeStatus.ACTIVE},
          {node_id: 'node-4', status: NodeStatus.ACTIVE},
        ],
        services: [
          {
            service_id: 'mg-1-r1',
            group_id: 'mg-1',
            node_id: 'node-1',
            service_type: SERVICE_TYPE.MESSAGE_GROUP,
            status: ReplicaStatus.ACTIVE,
          },
          {
            service_id: 'mg-1-r2',
            group_id: 'mg-1',
            node_id: 'node-2',
            service_type: SERVICE_TYPE.MESSAGE_GROUP,
            status: ReplicaStatus.ACTIVE,
          },
          {
            service_id: 'mg-self-hosted-3-r0',
            group_id: 'mg-self-hosted-3',
            node_id: 'node-3',
            service_type: SERVICE_TYPE.MESSAGE_GROUP,
            status: ReplicaStatus.ACTIVE,
          },
          {
            service_id: 'mg-self-hosted-4-r0',
            group_id: 'mg-self-hosted-4',
            node_id: 'node-4',
            service_type: SERVICE_TYPE.MESSAGE_GROUP,
            status: ReplicaStatus.ACTIVE,
          },
        ],
      });

      const nodesWithoutReplica = rebalancer.getNodesWithoutLocalReplica(
        rebalancer.getCurrentReplicas(),
      );

      t.same(
        nodesWithoutReplica,
        [],
        'other local message-group replicas should satisfy local access',
      );
    },
  );
});

test('UnifiedRebalancer - Node Management', async (t) => {
  initializeTestEnvironment();

  await t.test('gets available nodes from cache', async (t) => {
    const rebalancer = createTestRebalancer({
      entityId: 'partition-1',
      entityType: EntityType.PARTITION,
      nodeId: 'node-1',
      nodes: [
        {node_id: 'node-1', status: NodeStatus.ACTIVE},
        {node_id: 'node-2', status: NodeStatus.ACTIVE},
        {node_id: 'node-3', status: NodeStatus.FAILED},
      ],
    });

    const nodes = rebalancer.getAvailableNodes();

    t.equal(nodes.length, 2);
    t.ok(nodes.some((n) => n.node_id === 'node-1'));
    t.ok(nodes.some((n) => n.node_id === 'node-2'));
    t.notOk(nodes.some((n) => n.node_id === 'node-3'));
  });

  await t.test('uses published membership as steady-state topology truth',
    async (t) => {
      const readinessService = {
        ...createMockControlPlaneReadinessService({systemTableCache: createMockCache([
          {node_id: 'node-1', status: NodeStatus.ACTIVE},
          {node_id: 'node-2', status: NodeStatus.ACTIVE},
          {node_id: 'node-3', status: NodeStatus.ACTIVE},
        ])}),
        membershipPublicationService: createMockMembershipPublicationService([
          'node-1',
          'node-3',
        ]),
      };

      const rebalancer = createTestRebalancer({
        entityId: 'partition-1',
        entityType: EntityType.PARTITION,
        nodeId: 'node-1',
        nodes: [
          {node_id: 'node-1', status: NodeStatus.ACTIVE},
          {node_id: 'node-2', status: NodeStatus.ACTIVE},
          {node_id: 'node-3', status: NodeStatus.ACTIVE},
        ],
        controlPlaneReadinessService: readinessService,
      });

      const nodes = rebalancer.getAvailableNodes();

      t.same(
        nodes.map((node) => node.node_id).sort(),
        ['node-1', 'node-3'],
        'only published active nodes should be available for steady-state placement',
      );
    });

  await t.test(
    'allows priority control-plane recovery to use recovery-eligible nodes before publication spread converges',
    async (t) => {
      const readinessService = {
        ...createMockControlPlaneReadinessService({systemTableCache: createMockCache([
          {node_id: 'node-1', status: NodeStatus.ACTIVE},
          {node_id: 'node-2', status: NodeStatus.ACTIVE},
          {node_id: 'node-3', status: NodeStatus.ACTIVE},
        ])}),
        membershipPublicationService: createMockMembershipPublicationService(
          ['node-1', 'node-2'],
          3,
          {
            priorityPartitionSummary: {
              satisfied: false,
            },
          },
        ),
      };

      const rebalancer = createTestRebalancer({
        entityId: 'sql_write_operations-p1',
        entityType: EntityType.PARTITION,
        nodeId: 'node-1',
        nodes: [
          {node_id: 'node-1', status: NodeStatus.ACTIVE},
          {node_id: 'node-2', status: NodeStatus.ACTIVE},
          {node_id: 'node-3', status: NodeStatus.ACTIVE},
        ],
        partitions: [
          {
            partition_id: 'sql_write_operations-p1',
            table_id: 'sql_write_operations',
            replica_count: 3,
          },
        ],
        controlPlaneReadinessService: readinessService,
      });

      const nodes = rebalancer.getAvailableNodes();

      t.same(
        nodes.map((node) => node.node_id).sort(),
        ['node-1', 'node-2', 'node-3'],
        'priority recovery should not deadlock by filtering candidates to only published active nodes',
      );
    },
  );

  await t.test(
    'retains the latest published membership when a newer publication is still open',
    async (t) => {
      const readinessService = {
        ...createMockControlPlaneReadinessService({systemTableCache: createMockCache([
          {node_id: 'node-1', status: NodeStatus.ACTIVE},
          {node_id: 'node-2', status: NodeStatus.ACTIVE},
          {node_id: 'node-3', status: NodeStatus.ACTIVE},
          {node_id: 'node-4', status: NodeStatus.ACTIVE},
        ])}),
        membershipPublicationService: {
          getLatestClusterPublicationSync() {
            return {
              status: 'OPEN',
              publicationEpoch: 8,
              publishedActiveNodeIds: ['node-1', 'node-2', 'node-3', 'node-4'],
            };
          },
          getLatestPublishedClusterPublicationSync() {
            return {
              status: 'PUBLISHED',
              publicationEpoch: 7,
              publishedActiveNodeIds: ['node-1', 'node-3'],
            };
          },
        },
      };

      const rebalancer = createTestRebalancer({
        entityId: 'partition-1',
        entityType: EntityType.PARTITION,
        nodeId: 'node-1',
        nodes: [
          {node_id: 'node-1', status: NodeStatus.ACTIVE},
          {node_id: 'node-2', status: NodeStatus.ACTIVE},
          {node_id: 'node-3', status: NodeStatus.ACTIVE},
          {node_id: 'node-4', status: NodeStatus.ACTIVE},
        ],
        controlPlaneReadinessService: readinessService,
      });

      const nodes = rebalancer.getAvailableNodes();

      t.same(
        nodes.map((node) => node.node_id).sort(),
        ['node-1', 'node-3'],
        'steady-state availability should keep the last published membership while a newer publication remains open',
      );
    });

  await t.test('requires canonical readiness for steady-state availability',
    async (t) => {
      const rebalancer = createTestRebalancer({
        entityId: 'partition-1',
        entityType: EntityType.PARTITION,
        nodeId: 'node-1',
        nodes: [
          {node_id: 'node-1', status: NodeStatus.ACTIVE},
          {node_id: 'node-2', status: NodeStatus.ACTIVE},
        ],
        controlPlaneReadinessService: {
          getNodeReadinessSync() {
            return null;
          },
        },
      });

      const nodes = rebalancer.getAvailableNodes();

      t.same(
        nodes,
        [],
        'steady-state placement must not fall back to cache rows when canonical readiness is unavailable',
      );
    });

  await t.test('sorts nodes by load', async (t) => {
    const rebalancer = createTestRebalancer({
      entityId: 'partition-1',
      entityType: EntityType.PARTITION,
      nodeId: 'node-1',
      nodes: [
        {node_id: 'node-1', status: NodeStatus.ACTIVE, cpu_usage_percent: 80},
        {node_id: 'node-2', status: NodeStatus.ACTIVE, cpu_usage_percent: 20},
        {node_id: 'node-3', status: NodeStatus.ACTIVE, cpu_usage_percent: 50},
      ],
    });

    const nodes = rebalancer.getAvailableNodes();
    const sorted = rebalancer.sortNodesByLoad(nodes);

    t.equal(sorted[0].node_id, 'node-2'); // Lowest load
    t.equal(sorted[1].node_id, 'node-3');
    t.equal(sorted[2].node_id, 'node-1'); // Highest load
  });
});

test('UnifiedRebalancer - Readiness Checks', async (t) => {
  initializeTestEnvironment();

  await t.test('returns true when node is ready and connected', async (t) => {
    const rebalancer = createTestRebalancer({
      entityId: 'partition-1',
      entityType: EntityType.PARTITION,
      nodeId: 'node-0',
      nodes: [
        {node_id: 'node-1', status: NodeStatus.ACTIVE, connection_state: 'ready'},
      ],
      connectionState: 'connected',
    });

    const ready = await rebalancer.isNodeReady('node-1');
    t.equal(ready, true);

    rebalancer.shutdown();
  });

  await t.test('returns false when node is disconnected', async (t) => {
    const rebalancer = createTestRebalancer({
      entityId: 'partition-1',
      entityType: EntityType.PARTITION,
      nodeId: 'node-0',
      nodes: [
        {node_id: 'node-1', status: NodeStatus.ACTIVE, connection_state: 'ready'},
      ],
      connectionState: 'disconnected',
    });

    const ready = await rebalancer.isNodeReady('node-1');
    t.equal(ready, false);

    rebalancer.shutdown();
  });

  await t.test('returns false when readiness ping fails', async (t) => {
    const mockCache = createMockCache([
      {node_id: 'node-1', status: NodeStatus.ACTIVE, connection_state: 'ready'},
    ]);
    const mockCdcService = createMockCdcService();
    const mockPolicyService = createMockPolicyService();
    const mockCoordinator = createMockCoordinator();
    const messageRouter = {
      getConnectionState: () => 'connected',
      pingNode: async () => false,
      isOutboundQueueAvailable: () => true,
    };

    const rebalancer = new UnifiedRebalancer(withNodeReadinessService('UnifiedRebalancer', {
      entityId: 'partition-1',
      entityType: EntityType.PARTITION,
      nodeId: 'node-0',
      systemTableCache: mockCache,
      cdcIntegrationService: mockCdcService,
      tablePolicyService: mockPolicyService,
      messageRouter,
      rebalanceCoordinator: mockCoordinator,
    }));
    rebalancer.enableReadinessPing = true;

    const ready = await rebalancer.isNodeReady('node-1');
    t.equal(ready, false);

    rebalancer.shutdown();
  });
});

test('UnifiedRebalancer - Replica State', async (t) => {
  initializeTestEnvironment();

  await t.test('gets healthy replicas only', async (t) => {
    const replicas = [
      {replica_id: 'r1', node_id: 'node-1', status: ReplicaStatus.ACTIVE},
      {replica_id: 'r2', node_id: 'node-2', status: ReplicaStatus.FAILED},
      {replica_id: 'r3', node_id: 'node-3', status: ReplicaStatus.ACTIVE},
    ];

    const rebalancer = createTestRebalancer({
      entityId: 'partition-1',
      entityType: EntityType.PARTITION,
      nodeId: 'node-1',
    });

    const healthy = rebalancer.getHealthyReplicas(replicas);

    t.equal(healthy.length, 2);
    t.ok(healthy.some((r) => r.replica_id === 'r1'));
    t.ok(healthy.some((r) => r.replica_id === 'r3'));
  });

  await t.test('detects multiple replicas on same node', async (t) => {
    const rebalancer = createTestRebalancer({
      entityId: 'partition-1',
      entityType: EntityType.PARTITION,
      nodeId: 'node-1',
    });

    const duplicates = [
      {replica_id: 'r1', node_id: 'node-1'},
      {replica_id: 'r2', node_id: 'node-1'},
      {replica_id: 'r3', node_id: 'node-2'},
    ];

    const noDuplicates = [
      {replica_id: 'r1', node_id: 'node-1'},
      {replica_id: 'r2', node_id: 'node-2'},
      {replica_id: 'r3', node_id: 'node-3'},
    ];

    t.equal(rebalancer.hasMultipleReplicasOnSameNode(duplicates), true);
    t.equal(rebalancer.hasMultipleReplicasOnSameNode(noDuplicates), false);
  });
});
