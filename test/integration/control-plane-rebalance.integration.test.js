/**
 * Integration test: control plane dispatch of replica operations.
 * Requirements: 5.2, 5.3, 5.4
 */

import {test} from '../../src/test-helpers/tap.js';
import {ControlPlaneService} from '../../src/control-plane/control-plane-service.js';
import {RebalanceCoordinator} from '../../src/rebalancer/rebalance-coordinator.js';
import {SystemTableCache} from '../../src/cache/system-table-cache.js';
import {SystemTableName} from '../../src/bootstrap/system-table-schemas-constants.js';
import {ReplicaOperationResponseStatus} from
  '../../src/rebalancer/replica-operation-constants.js';
import {ConfigurationManager} from '../../src/config/configuration-manager.js';
import {LoggingService} from '../../src/logging/logging-service.js';
import {DEFAULT_TABLE_POLICY} from '../../src/policy/policy-constants.js';

function createMockCDCService(cache) {
  const operations = [];

  return {
    operations,
    async insertSystemTableRow(tableName, data) {
      operations.push({type: 'insert', tableName, data});
      cache.applySystemTableChange(tableName, 'INSERT', data);
      return {success: true, operation: 'INSERT', tableName, data};
    },
    async upsertSystemTableRow(tableName, data) {
      operations.push({type: 'upsert', tableName, data});
      cache.applySystemTableChange(tableName, 'INSERT', data);
      return {success: true, operation: 'UPSERT', tableName, data};
    },
    async updateSystemTableRow(tableName, whereClause, data) {
      const merged = {...whereClause, ...data};
      operations.push({type: 'update', tableName, whereClause, data: merged});
      cache.applySystemTableChange(tableName, 'UPDATE', merged);
      return {success: true, operation: 'UPDATE', tableName, whereClause, data: merged};
    },
  };
}

function createMockTablePolicyService() {
  return {
    getPolicyForPartition() {
      return {...DEFAULT_TABLE_POLICY};
    },
    getDefaultPolicy() {
      return {...DEFAULT_TABLE_POLICY};
    },
  };
}

/**
 * Create a mock SQL engine that tracks operations.
 * @param {SystemTableCache} cache - System table cache.
 * @return {Object} Mock SQL engine.
 */
function createMockSqlQueryEngine(cache) {
  const trackedOperations = new Map();

  return {
    executeQuery: async (sql, params) => {
      // Handle INSERT operations
      if (sql.includes('INSERT INTO replica_operations')) {
        const [
          operationId, type, partitionId, replicaId, sourceNodeId, targetNodeId,
          status, workflowStep, createdAt, updatedAt, completedAt, errorMessage,
          stepsHistory,
        ] = params;

        const operation = {
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
        };

        trackedOperations.set(operationId, operation);
        cache.applySystemTableChange(SystemTableName.REPLICA_OPERATIONS, 'INSERT', operation);
        return {success: true};
      }

      // Handle UPDATE operations
      if (sql.includes('UPDATE replica_operations')) {
        const [
          status, workflowStep, updatedAt, completedAt, errorMessage,
          stepsHistory, replicaId, operationId,
        ] = params;

        const existing = trackedOperations.get(operationId);
        if (existing) {
          const updated = {
            ...existing,
            status,
            workflow_step: workflowStep,
            updated_at: updatedAt,
            completed_at: completedAt,
            error_message: errorMessage,
            steps_history: stepsHistory,
            replica_id: replicaId,
          };
          trackedOperations.set(operationId, updated);
          cache.applySystemTableChange(SystemTableName.REPLICA_OPERATIONS, 'UPDATE', updated);
        }
        return {success: true};
      }

      // Handle SELECT queries for deduplication
      if (sql.includes('replica_operations') && sql.includes('partition_id = ?')) {
        const [partitionId, targetNodeId] = params;
        const matching = Array.from(trackedOperations.values()).filter((op) =>
          op.partition_id === partitionId &&
          op.target_node_id === targetNodeId &&
          !['active', 'removed', 'failed'].includes(op.status));
        return {success: true, rows: matching};
      }

      // Handle SELECT for non-terminal operations (matches <> or NOT IN syntax)
      if (sql.includes('replica_operations') &&
          (sql.includes('status <>') || sql.includes('NOT IN'))) {
        const incompleteOps = Array.from(trackedOperations.values()).filter((op) =>
          !['active', 'removed', 'failed'].includes(op.status));
        return {success: true, rows: incompleteOps};
      }

      return {success: true, rows: []};
    },
  };
}

test('Control plane dispatch integration', async (t) => {
  ConfigurationManager.resetInstance();
  LoggingService.resetInstance();

  const config = ConfigurationManager.getInstance();
  config.initialize({
    logging: {level: 'error'},
    transport: {wsHost: '127.0.0.1'},
  });

  const logging = LoggingService.getInstance();
  logging.initialize({level: 'error'});

  const cache = new SystemTableCache();
  const cdc = createMockCDCService(cache);
  const tablePolicyService = createMockTablePolicyService();

  const deliveries = [];
  const messageRouter = {
    deliver: async (target, payload, options) => {
      deliveries.push({target, payload, options});
      return {
        acknowledged: true,
        status: ReplicaOperationResponseStatus.INITIATED,
      };
    },
    getConnectionState() {
      return 'connected';
    },
    isOutboundQueueAvailable() {
      return true;
    },
  };

  const mockSqlQueryEngine = createMockSqlQueryEngine(cache);

  const coordinator = new RebalanceCoordinator({
    nodeId: 'seed-node',
    systemTableCache: cache,
    cdcIntegrationService: cdc,
    messageRouter,
    tablePolicyService,
    sqlQueryEngine: mockSqlQueryEngine,
    enableTimeouts: false,
  });
  coordinator.initialize();

  const controlPlane = new ControlPlaneService({
    nodeId: 'seed-node',
    nodeAddress: 'ws://localhost:0',
    systemTableCache: cache,
    cdcIntegrationService: cdc,
    messageRouter,
    rebalanceCoordinator: coordinator,
  });
  controlPlane.initialize();

  const now = Date.now();
  cache.applySystemTableChange(SystemTableName.NODES, 'INSERT', {
    node_id: 'node-1',
    node_address: 'localhost:8082',
    status: 'active',
    ws_connection_state: 'ready',
    ready_lease_expires_at: now + 10000,
    last_heartbeat: now,
    created_at: now,
  });

  const operation = await coordinator.createOperation({
    type: 'ADD',
    partitionId: 'partition-1',
    nodeId: 'node-1',
    replicaId: 'replica-1',
  });

  const messageGroupService = {
    isLeaderReplica: () => true,
  };

  await controlPlane.handleCdcApplied(messageGroupService, {
    tableName: SystemTableName.REPLICA_OPERATIONS,
    data: cache.get(SystemTableName.REPLICA_OPERATIONS, operation.operationId),
  });

  t.equal(deliveries.length, 1, 'dispatches replica operation');
  t.equal(deliveries[0].target, 'node-1/service/replica-handler',
    'targets replica-handler');

  const updated = cache.get(SystemTableName.REPLICA_OPERATIONS, operation.operationId);
  t.equal(updated.workflow_step, 'CREATING', 'operation moves to CREATING');
});
