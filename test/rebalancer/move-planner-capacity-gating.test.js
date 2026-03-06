/**
 * Tests for MovePlanner capacity gating integration (Task 7).
 *
 * Validates:
 * - Req 5.1: Filter out nodes that fail storage feasibility checks
 * - Req 5.2: Storage-aware ordering among feasible nodes
 * - Req 5.3: Distinguish insufficient_capacity from insufficient_nodes
 * - Req 5.4: Placement diagnostics include capacity rejection counts
 * - Req 5.5: Existing correctness constraints remain dominant
 * - Req 11.3: MovePlanner consumes admission APIs, no duplication
 */

import {test} from '../../src/test-helpers/tap.js';
import {ConfigurationManager} from '../../src/config/configuration-manager.js';
import {LoggingService} from '../../src/logging/logging-service.js';
import {MovePlanner} from '../../src/rebalancer/move-planner.js';
import {NUM} from '../../src/constants/index.js';
import {
  PLACEMENT_DEGRADED_REASON,
  REBALANCER_ENTITY_TYPE,
} from '../../src/rebalancer/rebalancer-constants.js';
import {
  ADMISSION_DECISION,
  ADMISSION_REASON,
} from '../../src/rebalancer/storage-capacity-constants.js';

function initEnv() {
  ConfigurationManager.resetInstance();
  LoggingService.resetInstance();
  const config = ConfigurationManager.getInstance();
  config.initialize({});
  const logging = LoggingService.getInstance();
  logging.initialize({level: 'error'});
}

function makeMoveStateProvider(nodes, currentReplicas = []) {
  return {
    getAvailableNodes: () => nodes,
    getCurrentReplicas: () => currentReplicas,
    getHealthyReplicas: (r) => r.filter(
      (rep) => rep.status === 'active',
    ),
    getInFlightOperations: () => [],
    hasPendingMove: () => false,
    hasPendingAddForNode: () => false,
  };
}

/**
 * Build a mock admission service.
 * @param {Object} decisions - Map of nodeId to admission result
 * @return {Object}
 */
function makeAdmissionService(decisions) {
  return {
    checkAdd: async ({targetNodeId}) => {
      const result = decisions[targetNodeId];
      if (result) return result;
      return {
        decision: ADMISSION_DECISION.ALLOW,
        reason: ADMISSION_REASON.CAPACITY_AVAILABLE,
        projectedUtilization: {},
      };
    },
  };
}

function makeAccountingService(estimatedBytes) {
  return {
    estimateReplicaBytes: () => estimatedBytes,
  };
}

function allowResult() {
  return {
    decision: ADMISSION_DECISION.ALLOW,
    reason: ADMISSION_REASON.CAPACITY_AVAILABLE,
    projectedUtilization: {},
  };
}

function denyResult(reason) {
  return {
    decision: ADMISSION_DECISION.DENY,
    reason: reason || ADMISSION_REASON.BUDGET_EXCEEDED,
    projectedUtilization: {
      projectedUtilizationPercent: 95,
      projectedAvailableBytes: NUM.ZERO,
    },
  };
}

test('MovePlanner capacity gating', async (t) => {
  t.beforeEach(initEnv);
  t.afterEach(() => {
    ConfigurationManager.resetInstance();
    LoggingService.resetInstance();
  });

  // --- Req 5.1: Filter infeasible nodes ---

  await t.test('filters out nodes denied by admission service',
    async (t) => {
      const nodes = [
        {node_id: 'n1', cpu_usage_percent: 10},
        {node_id: 'n2', cpu_usage_percent: 20},
        {node_id: 'n3', cpu_usage_percent: 30},
      ];

      const decisions = {
        n1: allowResult(),
        n2: denyResult(ADMISSION_REASON.BUDGET_EXCEEDED),
        n3: allowResult(),
      };

      const planner = new MovePlanner({
        entityId: 'p1',
        entityType: REBALANCER_ENTITY_TYPE.PARTITION,
        moveStateProvider: makeMoveStateProvider(nodes),
        storageAdmissionService: makeAdmissionService(decisions),
        accountingService: makeAccountingService(NUM.BYTES_PER_MIB),
      });

      const policy = {
        targetReplicaCount: NUM.THREE,
        placementConstraints: {considerCpuLoad: true},
      };

      const result = await planner.calculateTargetState([], policy);

      t.equal(result.targetNodes.length, NUM.TWO,
        'should only place on feasible nodes');
      t.ok(result.targetNodes.includes('n1'), 'n1 should be included');
      t.ok(result.targetNodes.includes('n3'), 'n3 should be included');
      t.ok(!result.targetNodes.includes('n2'), 'n2 should be excluded');
    });

  // --- Req 5.1: All nodes pass when no admission service ---

  await t.test('passes all nodes when admission service absent',
    async (t) => {
      const nodes = [
        {node_id: 'n1', cpu_usage_percent: 10},
        {node_id: 'n2', cpu_usage_percent: 20},
        {node_id: 'n3', cpu_usage_percent: 30},
      ];

      const planner = new MovePlanner({
        entityId: 'p1',
        entityType: REBALANCER_ENTITY_TYPE.PARTITION,
        moveStateProvider: makeMoveStateProvider(nodes),
      });

      const policy = {
        targetReplicaCount: NUM.THREE,
        placementConstraints: {considerCpuLoad: true},
      };

      const result = await planner.calculateTargetState([], policy);

      t.equal(result.targetNodes.length, NUM.THREE,
        'all nodes should be placed');
      t.equal(result.degraded, false, 'should not be degraded');
    });

  // --- Req 5.3: insufficient_capacity vs insufficient_nodes ---

  await t.test('degradedReason is insufficient_capacity when capacity ' +
    'filtering causes shortfall', async (t) => {
    const nodes = [
      {node_id: 'n1', cpu_usage_percent: 10},
      {node_id: 'n2', cpu_usage_percent: 20},
      {node_id: 'n3', cpu_usage_percent: 30},
    ];

    const decisions = {
      n1: allowResult(),
      n2: denyResult(ADMISSION_REASON.HARD_PRESSURE_EXCEEDED),
      n3: denyResult(ADMISSION_REASON.BUDGET_EXCEEDED),
    };

    const planner = new MovePlanner({
      entityId: 'p1',
      entityType: REBALANCER_ENTITY_TYPE.PARTITION,
      moveStateProvider: makeMoveStateProvider(nodes),
      storageAdmissionService: makeAdmissionService(decisions),
      accountingService: makeAccountingService(NUM.BYTES_PER_MIB),
    });

    const policy = {
      targetReplicaCount: NUM.THREE,
      placementConstraints: {considerCpuLoad: true},
    };

    const result = await planner.calculateTargetState([], policy);

    t.equal(result.degraded, true, 'should be degraded');
    t.equal(result.degradedReason,
      PLACEMENT_DEGRADED_REASON.INSUFFICIENT_CAPACITY,
      'reason should be insufficient_capacity');
  });

  await t.test('degradedReason is insufficient_nodes when not enough ' +
    'ready nodes regardless of capacity', async (t) => {
    const nodes = [
      {node_id: 'n1', cpu_usage_percent: 10},
      {node_id: 'n2', cpu_usage_percent: 20},
    ];

    const planner = new MovePlanner({
      entityId: 'p1',
      entityType: REBALANCER_ENTITY_TYPE.PARTITION,
      moveStateProvider: makeMoveStateProvider(nodes),
      storageAdmissionService: makeAdmissionService({}),
      accountingService: makeAccountingService(NUM.BYTES_PER_MIB),
    });

    const policy = {
      targetReplicaCount: NUM.THREE,
      placementConstraints: {considerCpuLoad: true},
    };

    const result = await planner.calculateTargetState([], policy);

    t.equal(result.degraded, true, 'should be degraded');
    t.equal(result.degradedReason,
      PLACEMENT_DEGRADED_REASON.INSUFFICIENT_NODES,
      'reason should be insufficient_nodes');
  });

  await t.test('degradedReason is null when placement is not degraded',
    async (t) => {
      const nodes = [
        {node_id: 'n1', cpu_usage_percent: 10},
        {node_id: 'n2', cpu_usage_percent: 20},
        {node_id: 'n3', cpu_usage_percent: 30},
      ];

      const planner = new MovePlanner({
        entityId: 'p1',
        entityType: REBALANCER_ENTITY_TYPE.PARTITION,
        moveStateProvider: makeMoveStateProvider(nodes),
        storageAdmissionService: makeAdmissionService({}),
        accountingService: makeAccountingService(NUM.BYTES_PER_MIB),
      });

      const policy = {
        targetReplicaCount: NUM.THREE,
        placementConstraints: {considerCpuLoad: true},
      };

      const result = await planner.calculateTargetState([], policy);

      t.equal(result.degraded, false, 'should not be degraded');
      t.equal(result.degradedReason, null, 'reason should be null');
    });

  // --- Req 5.4: Diagnostics include capacity rejection counts ---

  await t.test('capacityDiagnostics includes rejection counts by reason',
    async (t) => {
      const nodes = [
        {node_id: 'n1', cpu_usage_percent: 10},
        {node_id: 'n2', cpu_usage_percent: 20},
        {node_id: 'n3', cpu_usage_percent: 30},
        {node_id: 'n4', cpu_usage_percent: 40},
      ];

      const decisions = {
        n1: allowResult(),
        n2: denyResult(ADMISSION_REASON.BUDGET_EXCEEDED),
        n3: denyResult(ADMISSION_REASON.HARD_PRESSURE_EXCEEDED),
        n4: denyResult(ADMISSION_REASON.BUDGET_EXCEEDED),
      };

      const planner = new MovePlanner({
        entityId: 'p1',
        entityType: REBALANCER_ENTITY_TYPE.PARTITION,
        moveStateProvider: makeMoveStateProvider(nodes),
        storageAdmissionService: makeAdmissionService(decisions),
        accountingService: makeAccountingService(NUM.BYTES_PER_MIB),
      });

      const policy = {
        targetReplicaCount: NUM.THREE,
        placementConstraints: {considerCpuLoad: true},
      };

      const result = await planner.calculateTargetState([], policy);
      const diag = result.capacityDiagnostics;

      t.ok(diag, 'diagnostics should be present');
      t.equal(diag.capacityFilterApplied, true,
        'filter should be marked as applied');
      t.equal(diag.totalCandidates, NUM.FOUR,
        'total candidates should be 4');
      t.equal(diag.feasibleCount, NUM.ONE,
        'feasible count should be 1');
      t.equal(diag.rejectedCount, NUM.THREE,
        'rejected count should be 3');
      t.equal(
        diag.rejectionsByReason[ADMISSION_REASON.BUDGET_EXCEEDED],
        NUM.TWO,
        'budget_exceeded rejections should be 2');
      t.equal(
        diag.rejectionsByReason[
          ADMISSION_REASON.HARD_PRESSURE_EXCEEDED],
        NUM.ONE,
        'hard_pressure_exceeded rejections should be 1');
    });

  await t.test('capacityDiagnostics shows filter not applied when ' +
    'no admission service', async (t) => {
    const nodes = [
      {node_id: 'n1', cpu_usage_percent: 10},
    ];

    const planner = new MovePlanner({
      entityId: 'p1',
      entityType: REBALANCER_ENTITY_TYPE.PARTITION,
      moveStateProvider: makeMoveStateProvider(nodes),
    });

    const policy = {targetReplicaCount: NUM.ONE};

    const result = await planner.calculateTargetState([], policy);
    const diag = result.capacityDiagnostics;

    t.ok(diag, 'diagnostics should be present');
    t.equal(diag.capacityFilterApplied, false,
      'filter should not be applied');
    t.equal(diag.rejectedCount, NUM.ZERO,
      'no rejections');
  });

  // --- Req 5.5: Existing correctness constraints remain dominant ---

  await t.test('quorum/odd replica count preserved despite capacity ' +
    'filtering', async (t) => {
    const nodes = [
      {node_id: 'n1', cpu_usage_percent: 10},
      {node_id: 'n2', cpu_usage_percent: 20},
      {node_id: 'n3', cpu_usage_percent: 30},
    ];

    // All nodes pass capacity
    const planner = new MovePlanner({
      entityId: 'p1',
      entityType: REBALANCER_ENTITY_TYPE.PARTITION,
      moveStateProvider: makeMoveStateProvider(nodes),
      storageAdmissionService: makeAdmissionService({}),
      accountingService: makeAccountingService(NUM.BYTES_PER_MIB),
    });

    const policy = {
      targetReplicaCount: NUM.THREE,
      minReplicaCount: NUM.THREE,
      maxReplicaCount: NUM.SEVEN,
      placementConstraints: {considerCpuLoad: true},
    };

    const result = await planner.calculateTargetState([], policy);

    t.equal(result.targetReplicaCount, NUM.THREE,
      'target replica count preserved');
    t.equal(result.minReplicaCount, NUM.THREE,
      'min replica count preserved');
    t.equal(result.maxReplicaCount, NUM.SEVEN,
      'max replica count preserved');
  });

  // --- Req 5.2: Storage-aware ordering among feasible nodes ---

  await t.test('sortNodesBySuitability uses disk as tie-breaker',
    async (t) => {
      const nodes = [
        {node_id: 'n1', cpu_usage_percent: 50,
          disk_usage_percent: 80},
        {node_id: 'n2', cpu_usage_percent: 50,
          disk_usage_percent: 20},
      ];

      const planner = new MovePlanner({
        entityId: 'p1',
        entityType: REBALANCER_ENTITY_TYPE.PARTITION,
        moveStateProvider: makeMoveStateProvider(nodes),
      });

      const policy = {
        placementConstraints: {considerCpuLoad: true},
      };

      const sorted = planner.sortNodesBySuitability(nodes, policy);

      t.equal(sorted[0].node_id, 'n2',
        'node with lower disk usage should rank first on tie');
    });

  // --- Req 11.3: Consumes admission API, no duplication ---

  await t.test('admission error on a node rejects it instead of fail-open',
    async (t) => {
      const nodes = [
        {node_id: 'n1', cpu_usage_percent: 10},
        {node_id: 'n2', cpu_usage_percent: 20},
      ];

      const errorAdmission = {
        checkAdd: async ({targetNodeId}) => {
          if (targetNodeId === 'n2') {
            throw new Error('transient failure');
          }
          return allowResult();
        },
      };

      const planner = new MovePlanner({
        entityId: 'p1',
        entityType: REBALANCER_ENTITY_TYPE.PARTITION,
        moveStateProvider: makeMoveStateProvider(nodes),
        storageAdmissionService: errorAdmission,
        accountingService: makeAccountingService(NUM.BYTES_PER_MIB),
      });

      const policy = {targetReplicaCount: NUM.TWO};

      const result = await planner.calculateTargetState([], policy);

      t.equal(result.targetNodes.length, NUM.ONE,
        'node with admission error should be excluded');
      t.equal(result.targetNodes[NUM.ZERO], 'n1',
        'only successful admission target should remain');
      t.equal(result.degraded, true,
        'should degrade when capacity checks fail');
      t.equal(
        result.capacityDiagnostics.rejectionsByReason.admission_error,
        NUM.ONE,
        'diagnostics should include admission_error rejection count',
      );
    });

  // --- Message group capacity gating ---

  await t.test('message group placement filters by capacity',
    async (t) => {
      const nodes = [
        {node_id: 'n1', cpu_usage_percent: 10},
        {node_id: 'n2', cpu_usage_percent: 20},
        {node_id: 'n3', cpu_usage_percent: 30},
      ];

      const decisions = {
        n1: allowResult(),
        n2: denyResult(ADMISSION_REASON.BUDGET_EXCEEDED),
        n3: allowResult(),
      };

      const planner = new MovePlanner({
        entityId: 'mg1',
        entityType: REBALANCER_ENTITY_TYPE.MESSAGE_GROUP,
        moveStateProvider: makeMoveStateProvider(nodes),
        storageAdmissionService: makeAdmissionService(decisions),
        accountingService: makeAccountingService(NUM.BYTES_PER_MIB),
      });

      const policy = {
        targetReplicaCount: NUM.THREE,
        ensureLocalAccess: true,
        placementConstraints: {spreadAcrossNodes: true},
      };

      const result = await planner.calculateTargetState([], policy);

      t.equal(result.targetNodes.length, NUM.TWO,
        'should only place on feasible nodes');
      t.equal(result.degraded, true, 'should be degraded');
      t.equal(result.degradedReason,
        PLACEMENT_DEGRADED_REASON.INSUFFICIENT_CAPACITY,
        'reason should be insufficient_capacity');
    });

  await t.test('same-group preference biases placement toward dominant group',
    async (t) => {
      const nodes = [
        {node_id: 'n1', latency_group_id: 'g-1'},
        {node_id: 'n2', latency_group_id: 'g-1'},
        {node_id: 'n3', latency_group_id: 'g-2'},
      ];
      const currentReplicas = [
        {replica_id: 'r1', node_id: 'n1', status: 'active'},
      ];

      const planner = new MovePlanner({
        entityId: 'p1',
        entityType: REBALANCER_ENTITY_TYPE.PARTITION,
        moveStateProvider: makeMoveStateProvider(nodes, currentReplicas),
      });

      const policy = {
        targetReplicaCount: NUM.TWO,
        placementConstraints: {preferSameLatencyGroup: true},
      };

      const result = await planner.calculateTargetState(currentReplicas, policy);

      t.same(result.targetNodes, ['n1', 'n2'],
        'dominant latency group should be preferred');
    });

  await t.test('latency-group diversity preference prioritizes unseen groups',
    async (t) => {
      const nodes = [
        {node_id: 'n1', latency_group_id: 'g-1'},
        {node_id: 'n2', latency_group_id: 'g-1'},
        {node_id: 'n3', latency_group_id: 'g-2'},
      ];
      const currentReplicas = [
        {replica_id: 'r1', node_id: 'n1', status: 'active'},
      ];

      const planner = new MovePlanner({
        entityId: 'p1',
        entityType: REBALANCER_ENTITY_TYPE.PARTITION,
        moveStateProvider: makeMoveStateProvider(nodes, currentReplicas),
      });

      const policy = {
        targetReplicaCount: NUM.TWO,
        placementConstraints: {preferLatencyGroupDiversity: true},
      };

      const result = await planner.calculateTargetState(currentReplicas, policy);

      t.equal(result.targetNodes.length, NUM.TWO, 'should place two replicas');
      t.ok(result.targetNodes.includes('n3'),
        'placement should include a node from a new latency group');
    });

  // --- All nodes denied ---

  await t.test('all nodes denied produces empty placement with ' +
    'insufficient_capacity', async (t) => {
    const nodes = [
      {node_id: 'n1', cpu_usage_percent: 10},
      {node_id: 'n2', cpu_usage_percent: 20},
    ];

    const decisions = {
      n1: denyResult(ADMISSION_REASON.EXHAUSTED),
      n2: denyResult(ADMISSION_REASON.EXHAUSTED),
    };

    const planner = new MovePlanner({
      entityId: 'p1',
      entityType: REBALANCER_ENTITY_TYPE.PARTITION,
      moveStateProvider: makeMoveStateProvider(nodes),
      storageAdmissionService: makeAdmissionService(decisions),
      accountingService: makeAccountingService(NUM.BYTES_PER_MIB),
    });

    const policy = {targetReplicaCount: NUM.THREE};

    const result = await planner.calculateTargetState([], policy);

    t.equal(result.targetNodes.length, NUM.ZERO,
      'no nodes should be placed');
    t.equal(result.degraded, true, 'should be degraded');
    t.equal(result.degradedReason,
      PLACEMENT_DEGRADED_REASON.INSUFFICIENT_CAPACITY,
      'reason should be insufficient_capacity');
  });
});
