// Shared fixture: a real RebalanceCoordinator backed by an in-memory SQL engine (a Map of
// replica_operations rows), used to exercise the real timeout -> FAILED transition. Extracted from
// timeout-triggers-failure.property.test.js so the DT6 convergence harness can reuse it to drive the
// real reconcileTimeoutOperation -> failOperation mutation on a virtual clock (options.timeSource).
//
// options.timeSource (DT6): injected TimeSource threaded into the coordinator (default RealTimeSource
// = the platform clock, byte-identical), so checkTimeouts reads virtual time via the step-9/11 seam.

import {RebalanceCoordinator} from '../../src/rebalancer/rebalance-coordinator.js';
import {
  createMockCache,
  createMockPolicyService,
  createMockMessageRouter,
  createMockControlPlaneReadinessService,
  createMockTransactionCoordinator,
} from './test-helpers.js';

function createTimeoutTestCoordinator(options = {}) {
  const {services = []} = options;
  const trackedOperations = new Map();

  // Mock CDC service (not used for persistence in the current architecture).
  const cdcService = {
    insertSystemTableRow: async () => ({success: true}),
    updateSystemTableRow: async () => ({success: true}),
  };

  // SQL engine that tracks operations via INSERT/UPDATE queries.
  const sqlEngine = {
    executeQuery: async (sql, params) => {
      if (sql.includes('INSERT INTO replica_operations')) {
        const [
          operationId, type, partitionId, replicaId, sourceNodeId, targetNodeId,
          status, workflowStep, createdAt, updatedAt, completedAt, errorMessage,
          stepsHistory,
        ] = params;

        trackedOperations.set(operationId, {
          operation_id: operationId,
          type,
          partition_id: partitionId,
          replica_id: replicaId,
          source_node_id: sourceNodeId,
          target_node_id: targetNodeId,
          status,
          workflow_step: workflowStep,
          created_at: createdAt,
          updated_at: updatedAt,
          completed_at: completedAt,
          error_message: errorMessage,
          steps_history: stepsHistory,
        });
        return {success: true};
      }

      if (sql.includes('UPDATE replica_operations')) {
        const [
          status, workflowStep, updatedAt, completedAt, errorMessage,
          stepsHistory, replicaId, operationId,
        ] = params;

        const existing = trackedOperations.get(operationId);
        if (existing) {
          trackedOperations.set(operationId, {
            ...existing,
            status,
            workflow_step: workflowStep,
            updated_at: updatedAt,
            completed_at: completedAt,
            error_message: errorMessage,
            steps_history: stepsHistory,
            replica_id: replicaId,
          });
        }
        return {success: true};
      }

      if (sql.includes('FROM services') && sql.includes('service_id = ?')) {
        const [serviceId] = params;
        const service = services.find((row) =>
          row.service_id === serviceId || row.replica_id === serviceId);
        return {success: true, rows: service ? [{status: service.status}] : []};
      }

      if (sql.includes('FROM services') &&
          sql.includes('partition_id = ?') &&
          sql.includes('node_id = ?')) {
        const [partitionId, nodeId] = params;
        const service = services.find((row) =>
          row.partition_id === partitionId && row.node_id === nodeId);
        return {success: true, rows: service ? [{status: service.status}] : []};
      }

      if (sql.includes('replica_operations')) {
        const allOps = Array.from(trackedOperations.values());

        if (sql.includes('partition_id = ?') && sql.includes('target_node_id = ?')) {
          const [partitionId, targetNodeId] = params;
          const matching = allOps.filter((op) =>
            op.partition_id === partitionId &&
            op.target_node_id === targetNodeId &&
            !['active', 'removed', 'failed'].includes(op.status));
          return {success: true, rows: matching};
        }

        if (sql.includes('SELECT * FROM replica_operations') &&
            sql.includes('WHERE type = ?')) {
          const [type] = params;
          return {
            success: true,
            rows: allOps.filter((op) => op.type === type),
          };
        }

        if (sql.includes('source_node_id = ?') &&
            sql.includes('workflow_step IN')) {
          const [
            sourceNodeId,
            pendingStep,
            sendingStep,
            creatingStep,
            syncingStep,
            stoppingStep,
            activeStep,
            replaceType,
          ] = params;
          const inFlightSteps = new Set([
            pendingStep,
            sendingStep,
            creatingStep,
            syncingStep,
            stoppingStep,
          ]);
          const incompleteOps = allOps.filter((op) => {
            if (op.source_node_id !== sourceNodeId) {
              return false;
            }
            if (inFlightSteps.has(op.workflow_step)) {
              return true;
            }
            return op.workflow_step === activeStep && op.type === replaceType;
          });
          return {success: true, rows: incompleteOps};
        }

        return {success: true, rows: allOps};
      }

      return {success: true, rows: []};
    },
  };

  const coordinator = new RebalanceCoordinator({
    nodeId: options.nodeId || 'test-node-1',
    systemTableCache: createMockCache(),
    cdcIntegrationService: cdcService,
    controlPlaneSystemTableGateway: {
      readAuthoritativeRows: async (_tableName, sql, params = [], queryOptions = {}) =>
        sqlEngine.executeQuery(sql, params, queryOptions),
      readRows: async (_tableName, sql, params = [], queryOptions = {}) =>
        sqlEngine.executeQuery(sql, params, queryOptions),
      executeQuery: async (sql, params = [], queryOptions = {}) =>
        sqlEngine.executeQuery(sql, params, queryOptions),
    },
    tablePolicyService: createMockPolicyService(),
    messageRouter: createMockMessageRouter(),
    sqlQueryEngine: sqlEngine,
    transactionCoordinator: createMockTransactionCoordinator(),
    controlPlaneReadinessService: createMockControlPlaneReadinessService(),
    storageAdmissionService: {
      checkAdd: async () => ({allowed: true, decisionType: 'admitted'}),
      checkReplace: async () => ({allowed: true, decisionType: 'admitted'}),
    },
    storageAccountingService: {
      estimateReplicaBytes: () => 1,
    },
    enableTimeouts: false,
    // DT6 seam: inject a TimeSource so checkTimeouts can run on a virtual clock (default undefined ->
    // resolveTimeSource -> RealTimeSource, byte-identical to the prior behavior).
    timeSource: options.timeSource,
  });

  coordinator.initialize();
  const baseCreateOperation = coordinator.createOperation.bind(coordinator);
  coordinator.createOperation = async (move = {}) => {
    const normalizedMove = Object.hasOwn(move, 'emitOperationCreated') ?
      move :
      {
        ...move,
        emitOperationCreated: false,
      };
    return baseCreateOperation(normalizedMove);
  };
  coordinator.workflowOwner.incompleteOperationQueryEmptyBackoffMs = 0;
  coordinator.config.pendingTimeoutMs = options.pendingTimeoutMs || 10;
  coordinator.config.creatingTimeoutMs = options.creatingTimeoutMs || 10;
  coordinator.config.syncingTimeoutMs = options.syncingTimeoutMs || 10;
  coordinator.config.removingTimeoutMs = options.removingTimeoutMs || 10;

  // Backdate an operation's updated_at relative to wall time (wall-clock fixtures).
  const backdateOperation = (operationId, msAgo) => {
    const op = trackedOperations.get(operationId);
    if (op) {
      op.updated_at = Date.now() - msAgo;
    }
  };

  // Set an operation's updated_at to an ABSOLUTE value (DT6 virtual-clock fixtures).
  const setOperationUpdatedAt = (operationId, updatedAtMs) => {
    const op = trackedOperations.get(operationId);
    if (op) {
      op.updated_at = updatedAtMs;
    }
  };

  const getTrackedOperation = (operationId) => {
    return trackedOperations.get(operationId) || null;
  };

  return {
    coordinator,
    backdateOperation,
    setOperationUpdatedAt,
    getTrackedOperation,
    trackedOperations,
  };
}

export {createTimeoutTestCoordinator};
