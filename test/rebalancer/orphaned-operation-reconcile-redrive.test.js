/**
 * Falsifier: the periodic, leadership-independent orphan-reconcile sweep must
 * re-drive an orphaned-but-completed SYNCING operation to ACTIVE.
 *
 * Churn root (census run2 rank1 "qof-phantom-syncing-inflight"): the normal
 * SYNCING->ACTIVE advance is driven by an in-memory executor-outcome event on
 * the operation's owner. When owner/leadership churn drops that event the row
 * is orphaned at SYNCING forever — the harness quiescence oracle counts it as
 * effectiveInFlight forever and the recovery barrier never closes. handleRecovery
 * (the SYNCING reconcile) is never wired post-startup, so nothing re-drives it.
 *
 * This test seeds exactly that orphaned state — an owned SYNCING row whose target
 * replica has genuinely reached ACTIVE — and asserts the periodic reconcile advances it.
 * RED on revert of reconcileCompletedSyncingOperations() (the row stays SYNCING).
 */
import {test} from '../../src/test-helpers/tap.js';
import {RebalanceCoordinator} from '../../src/rebalancer/rebalance-coordinator.js';
import {OperationType, ReplicaStatus} from '../../src/rebalancer/replica-status.js';
import {
  createMockCache,
  createMockControlPlaneSystemTableGateway,
  createMockPolicyService,
  createMockMessageRouter,
} from './test-helpers.js';

function buildCoordinator({operationRow, serviceRow}) {
  const trackedOperations = new Map();
  trackedOperations.set(operationRow.operation_id, {...operationRow});
  const trackedServices = new Map();
  if (serviceRow) {
    trackedServices.set(serviceRow.service_id, {...serviceRow});
  }
  const cdcService = {
    insertSystemTableRow: async () => ({success: true}),
    updateSystemTableRow: async () => ({success: true}),
    refreshAuthoritativeCacheRow: async () => true,
  };
  const sqlEngine = {
    executeQuery: async (sql, params) => {
      if (sql.includes('UPDATE replica_operations')) {
        const [status, workflowStep, updatedAt, completedAt, errorMessage,
          stepsHistory, replicaId, operationId] = params;
        const existing = trackedOperations.get(operationId);
        if (existing) {
          trackedOperations.set(operationId, {
            ...existing, status, workflow_step: workflowStep,
            updated_at: updatedAt, completed_at: completedAt,
            error_message: errorMessage, steps_history: stepsHistory,
            replica_id: replicaId,
          });
        }
        return {success: true};
      }
      // status may be a function to model a status that diverges between reads.
      const resolveStatus = (s) =>
        (typeof s.status === 'function' ? s.status() : s.status);
      if (sql.includes('services') && sql.includes('service_id = ?')) {
        const [serviceId] = params;
        const service = trackedServices.get(serviceId);
        return {success: true,
          rows: service ? [{...service, status: resolveStatus(service)}] : []};
      }
      if (sql.includes('services') && sql.includes('partition_id = ?')) {
        const [partitionId, nodeId] = params;
        const matching = Array.from(trackedServices.values()).filter((s) =>
          s.partition_id === partitionId && s.node_id === nodeId);
        return {success: true, rows: matching.length ?
          [{...matching[0], status: resolveStatus(matching[0])}] : []};
      }
      if (sql.includes('replica_operations')) {
        const allOps = Array.from(trackedOperations.values());
        if (sql.includes('operation_id = ?')) {
          const [operationId] = params;
          const op = trackedOperations.get(operationId);
          return {success: true, rows: op ? [op] : []};
        }
        if (sql.includes('partition_id = ?') && sql.includes('target_node_id = ?')) {
          const [partitionId, targetNodeId] = params;
          return {success: true, rows: allOps.filter((op) =>
            op.partition_id === partitionId && op.target_node_id === targetNodeId &&
            !['active', 'removed', 'failed'].includes(op.status))};
        }
        if (sql.includes('NOT IN')) {
          return {success: true, rows: allOps.filter((op) =>
            !['active', 'removed', 'failed'].includes(op.status))};
        }
        return {success: true, rows: allOps};
      }
      return {success: true, rows: []};
    },
  };
  const coordinator = new RebalanceCoordinator({
    nodeId: 'test-node-1',
    systemTableCache: createMockCache(),
    cdcIntegrationService: cdcService,
    tablePolicyService: createMockPolicyService(),
    messageRouter: createMockMessageRouter(),
    sqlQueryEngine: sqlEngine,
    controlPlaneSystemTableGateway: createMockControlPlaneSystemTableGateway(sqlEngine),
    transactionCoordinator: {
      begin: async () => ({success: true}),
      commit: async () => ({success: true}),
      rollback: async () => ({success: true}),
    },
    storageAdmissionService: {
      checkAdd: async () => ({allowed: true, decisionType: 'admitted'}),
      checkReplace: async () => ({allowed: true, decisionType: 'admitted'}),
    },
    storageAccountingService: {estimateReplicaBytes: () => 1},
    enableTimeouts: false,
  });
  return {coordinator, getOp: (id) => trackedOperations.get(id) || null};
}

test('orphan-reconcile re-drives an orphaned completed SYNCING op to ACTIVE', async (t) => {
  const now = Date.now();
  const operationRow = {
    operation_id: 'op-orphan-1',
    type: OperationType.ADD,
    partition_id: 'latency_groups-p1',
    replica_id: 'replica-orphan-1',
    source_node_id: 'test-node-1',
    target_node_id: 'test-node-1',
    status: ReplicaStatus.SYNCING,
    workflow_step: 'SYNCING',
    // Fresh — NOT past the syncing step timeout. The orphaning is the lost
    // advance event, not a timeout; the timeout path must not be relied on.
    created_at: now,
    updated_at: now,
    completed_at: null,
    error_message: null,
    steps_history: JSON.stringify([{step: 'SYNCING', timestamp: now}]),
  };
  const serviceRow = {
    service_id: 'replica-orphan-1',
    replica_id: 'replica-orphan-1',
    partition_id: 'latency_groups-p1',
    node_id: 'test-node-1',
    status: ReplicaStatus.ACTIVE, // replica creation genuinely completed
  };
  const {coordinator, getOp} = buildCoordinator({operationRow, serviceRow});
  coordinator.initialize();
  try {
    await coordinator.reconcileOrphanedOperations();
    const after = getOp('op-orphan-1');
    t.equal(after.status, ReplicaStatus.ACTIVE,
      'orphaned SYNCING op is advanced to ACTIVE by the periodic sweep');
    t.equal(after.workflow_step, 'ACTIVE',
      'workflow step advanced to ACTIVE');
  } finally {
    await coordinator.shutdown();
  }
});

test('orphan-reconcile leaves a still-syncing op untouched (no premature advance)', async (t) => {
  const now = Date.now();
  const operationRow = {
    operation_id: 'op-inprogress-1',
    type: OperationType.ADD,
    partition_id: 'latency_groups-p1',
    replica_id: 'replica-inprogress-1',
    source_node_id: 'test-node-1',
    target_node_id: 'test-node-1',
    status: ReplicaStatus.SYNCING,
    workflow_step: 'SYNCING',
    created_at: now,
    updated_at: now,
    completed_at: null,
    error_message: null,
    steps_history: JSON.stringify([{step: 'SYNCING', timestamp: now}]),
  };
  const serviceRow = {
    service_id: 'replica-inprogress-1',
    replica_id: 'replica-inprogress-1',
    partition_id: 'latency_groups-p1',
    node_id: 'test-node-1',
    status: ReplicaStatus.SYNCING, // replica genuinely still syncing
  };
  const {coordinator, getOp} = buildCoordinator({operationRow, serviceRow});
  coordinator.initialize();
  try {
    await coordinator.reconcileOrphanedOperations();
    const after = getOp('op-inprogress-1');
    t.equal(after.status, ReplicaStatus.SYNCING,
      'a genuinely in-progress SYNCING op is NOT advanced (non-destructive)');
  } finally {
    await coordinator.shutdown();
  }
});

test('orphan-reconcile retires a SYNCING op whose replica diverged to FAILED under the lock', async (t) => {
  // The advance-only gate reads ACTIVE, but the authoritative re-read inside the
  // single-flight reconcile finds the replica has since FAILED. The standard
  // recovery lifecycle must retire the row (fail it) — the correct outcome for a
  // failed replica, not a wedge. (Subagent-flagged divergence path.)
  const now = Date.now();
  const operationRow = {
    operation_id: 'op-diverge-1',
    type: OperationType.ADD,
    partition_id: 'latency_groups-p1',
    replica_id: 'replica-diverge-1',
    source_node_id: 'test-node-1',
    target_node_id: 'test-node-1',
    status: ReplicaStatus.SYNCING,
    workflow_step: 'SYNCING',
    created_at: now,
    updated_at: now,
    completed_at: null,
    error_message: null,
    steps_history: JSON.stringify([{step: 'SYNCING', timestamp: now}]),
  };
  let statusReads = 0;
  const serviceRow = {
    service_id: 'replica-diverge-1',
    replica_id: 'replica-diverge-1',
    partition_id: 'latency_groups-p1',
    node_id: 'test-node-1',
    // First read (the gate) sees ACTIVE; the under-lock re-read sees FAILED.
    status: () => (++statusReads <= 1 ? ReplicaStatus.ACTIVE : ReplicaStatus.FAILED),
  };
  const {coordinator, getOp} = buildCoordinator({operationRow, serviceRow});
  coordinator.initialize();
  try {
    await coordinator.reconcileOrphanedOperations();
    const after = getOp('op-diverge-1');
    t.ok(statusReads >= 2, 'both the gate read and the under-lock re-read fired');
    t.equal(after.status, ReplicaStatus.FAILED,
      'a replica that diverged to FAILED is retired (FAILED), not advanced to ' +
      'ACTIVE — the standard recovery lifecycle outcome');
  } finally {
    await coordinator.shutdown();
  }
});

// ---- Gate unit tests: shouldReconcileOrphanedOperation decides what the
// level-triggered reconciler acts on. This is the falsifier for generalizing
// beyond SYNCING (the rank1 stuck-drain shape) WITHOUT racing healthy work. ----

test('gate: reconciler ACTS on an op whose replica reached actionable truth (ACTIVE)', async (t) => {
  const now = Date.now();
  const {coordinator} = buildCoordinator({
    operationRow: {
      operation_id: 'g1', type: OperationType.ADD, partition_id: 'latency_groups-p1',
      replica_id: 'g1r', source_node_id: 'test-node-1', target_node_id: 'test-node-1',
      status: ReplicaStatus.SYNCING, workflow_step: 'SYNCING',
      created_at: now, updated_at: now, completed_at: null, error_message: null,
      steps_history: JSON.stringify([{step: 'SYNCING', timestamp: now}]),
    },
    serviceRow: {
      service_id: 'g1r', replica_id: 'g1r', partition_id: 'latency_groups-p1',
      node_id: 'test-node-1', status: ReplicaStatus.ACTIVE,
    },
  });
  coordinator.initialize();
  try {
    const op = {operationId: 'g1', replicaId: 'g1r', partitionId: 'latency_groups-p1',
      targetNodeId: 'test-node-1', workflowStep: 'SYNCING',
      stepsHistory: [{step: 'SYNCING', timestamp: now}]};
    t.equal(await coordinator.workflowOwner.shouldReconcileOrphanedOperation(op, now), true,
      'replica ACTIVE but row still SYNCING -> act (prompt advance-to-truth)');
  } finally {
    await coordinator.shutdown();
  }
});

test('gate: reconciler ACTS on a STALE never-dispatched surplus REMOVE (rank1 shape)', async (t) => {
  const now = Date.now();
  const stepStart = now - (10 * 60 * 1000); // 10 min ago >> pendingTimeoutMs (30s)
  const {coordinator} = buildCoordinator({
    operationRow: {
      operation_id: 'g2', type: OperationType.REMOVE, partition_id: 'latency_groups-p1',
      replica_id: 'g2r', source_node_id: 'test-node-1', target_node_id: 'test-node-1',
      status: ReplicaStatus.PENDING, workflow_step: 'PENDING',
      created_at: stepStart, updated_at: now, completed_at: null, error_message: null,
      steps_history: JSON.stringify([{step: 'PENDING', timestamp: stepStart}]),
    },
    serviceRow: null, // replica never dispatched -> no service row -> non-actionable status
  });
  coordinator.initialize();
  try {
    const op = {operationId: 'g2', type: OperationType.REMOVE, replicaId: 'g2r',
      partitionId: 'latency_groups-p1', targetNodeId: 'test-node-1', workflowStep: 'PENDING',
      stepsHistory: [{step: 'PENDING', timestamp: stepStart}]};
    t.equal(await coordinator.workflowOwner.shouldReconcileOrphanedOperation(op, now), true,
      'a REMOVE stuck PENDING past its step timeout is re-driven (the orphaned-drain class)');
  } finally {
    await coordinator.shutdown();
  }
});

test('gate: reconciler SKIPS a genuinely in-flight op still within its step budget (safety)', async (t) => {
  const now = Date.now();
  const {coordinator} = buildCoordinator({
    operationRow: {
      operation_id: 'g3', type: OperationType.ADD, partition_id: 'latency_groups-p1',
      replica_id: 'g3r', source_node_id: 'test-node-1', target_node_id: 'test-node-1',
      status: ReplicaStatus.CREATING, workflow_step: 'CREATING',
      created_at: now, updated_at: now, completed_at: null, error_message: null,
      steps_history: JSON.stringify([{step: 'CREATING', timestamp: now}]),
    },
    serviceRow: {
      service_id: 'g3r', replica_id: 'g3r', partition_id: 'latency_groups-p1',
      node_id: 'test-node-1', status: ReplicaStatus.CREATING, // still progressing
    },
  });
  coordinator.initialize();
  try {
    const op = {operationId: 'g3', type: OperationType.ADD, replicaId: 'g3r',
      partitionId: 'latency_groups-p1', targetNodeId: 'test-node-1', workflowStep: 'CREATING',
      stepsHistory: [{step: 'CREATING', timestamp: now}]};
    t.equal(await coordinator.workflowOwner.shouldReconcileOrphanedOperation(op, now), false,
      'a fresh CREATING op with a still-creating replica is NOT touched (no race with edge path)');
  } finally {
    await coordinator.shutdown();
  }
});
