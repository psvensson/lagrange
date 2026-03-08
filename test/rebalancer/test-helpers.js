/**
 * Shared test helpers for rebalancer tests.
 * Provides mock factories for all required dependencies.
 */

import {RebalanceCoordinator} from '../../src/rebalancer/rebalance-coordinator.js';
import {UnifiedRebalancer} from '../../src/rebalancer/unified-rebalancer.js';
import {WORKFLOW_STEP} from '../../src/constants/index.js';
import {SYSTEM_TABLE_NAME} from '../../src/bootstrap/system-table-schemas-constants.js';
import {
  CONTROL_PLANE_READINESS_DIMENSION,
} from '../../src/control-plane/control-plane-readiness-constants.js';
import {
  DistributedTransactionCoordinator,
} from '../../src/query/distributed/distributed-transaction-coordinator.js';
import {
  DEFAULT_TABLE_POLICY,
  DEFAULT_MESSAGE_GROUP_POLICY,
  EntityType,
} from '../../src/rebalancer/unified-rebalancer.js';

/**
 * Create a mock replica handler for testing.
 * @return {Object} Mock replica handler.
 */
function createMockReplicaHandler() {
  return {
    createReplica: async () => ({success: true, replicaId: 'mock-replica-id'}),
    removeReplica: async () => ({success: true}),
    getReplicaStatus: async () => 'active',
  };
}

/**
 * Create a mock RPC client for testing.
 * @return {Object} Mock RPC client.
 */
function createMockRpcClient() {
  return {
    call: async () => ({success: true}),
    syncData: async () => ({success: true}),
  };
}

/**
 * Create a mock system table cache.
 * @param {Object} options - Cache data options.
 * @return {Object} Mock cache.
 */
function createMockCache(options = {}) {
  const {
    nodes = [],
    services = [],
    partitions = [],
    tables = [],
    replicaOperations = [],
    messageGroups = [],
  } = options;

  const now = Date.now();
  const normalizedNodes = nodes.map((node) => ({
    connection_state: Object.hasOwn(node, 'connection_state') ?
      node.connection_state : 'ready',
    ready_lease_expires_at: Object.hasOwn(node, 'ready_lease_expires_at') ?
      node.ready_lease_expires_at : now + 10000,
    ...node,
  }));

  const cache = {
    nodes: new Map(normalizedNodes.map((node) => [node.node_id, node])),
    services: new Map(services.map((s) => [s.service_id, s])),
    partitions: new Map(partitions.map((p) => [p.partition_id, p])),
    tables: new Map(tables.map((t) => [t.table_id, t])),
    message_groups: new Map(messageGroups.map((mg) => [mg.message_group_id, mg])),
    replica_operations: new Map(replicaOperations.map((op) => [op.operation_id, op])),
  };

  return {
    get: (tableName, key) => cache[tableName]?.get(key),
    filter: (tableName, predicate) => {
      const table = cache[tableName];
      if (!table) return [];
      return Array.from(table.values()).filter(predicate);
    },
    getAll: (tableName) => {
      const table = cache[tableName];
      if (!table) return [];
      return Array.from(table.values());
    },
  };
}

function isNodeRepairEligible(node) {
  if (!node || typeof node !== 'object') {
    return false;
  }
  if (typeof node.repair_eligible === 'boolean') {
    return node.repair_eligible;
  }

  const status = typeof node.status === 'string' ?
    node.status.toLowerCase() : 'active';
  const connectionState = typeof node.connection_state === 'string' ?
    node.connection_state.toLowerCase() : 'ready';
  const readyLeaseExpiresAt = typeof node.ready_lease_expires_at === 'number' ?
    node.ready_lease_expires_at :
    Date.now() + 10000;

  if (status === 'failed' || status === 'stopped' || status === 'shutting_down') {
    return false;
  }
  if (connectionState !== 'ready') {
    return false;
  }
  return readyLeaseExpiresAt > Date.now();
}

function createMockControlPlaneReadinessService(options = {}) {
  const {
    systemTableCache = null,
    defaultRepairEligible = true,
    readinessByNodeId = {},
  } = options;

  return {
    getNodeReadinessSync(nodeId) {
      const explicit = readinessByNodeId[nodeId];
      if (explicit) {
        return explicit;
      }

      const nodeRow = systemTableCache &&
        typeof systemTableCache.get === 'function' ?
        systemTableCache.get(SYSTEM_TABLE_NAME.NODES, nodeId) :
        null;
      const repairEligible = nodeRow ?
        isNodeRepairEligible(nodeRow) :
        defaultRepairEligible;

      return {
        nodeId,
        dimensions: {
          [CONTROL_PLANE_READINESS_DIMENSION.REPAIR_ELIGIBLE]: repairEligible,
          [CONTROL_PLANE_READINESS_DIMENSION.SERVE_ELIGIBLE]: repairEligible,
        },
      };
    },
  };
}

/**
 * Create a mock CDC integration service.
 * @return {Object} Mock CDC service.
 */
function createMockCdcService() {
  return {
    upsertSystemTableRow: async () => ({success: true}),
    updateSystemTableRow: async () => ({success: true}),
  };
}

function createMockTransactionCoordinator() {
  return {
    begin: async () => ({success: true}),
    commit: async () => ({success: true}),
    rollback: async () => ({success: true}),
  };
}

/**
 * Create a mock table policy service.
 * @param {Object} options - Policy options.
 * @return {Object} Mock policy service.
 */
function createMockPolicyService(options = {}) {
  const {partitions = [], tables = []} = options;

  return {
    getPolicyForPartition: (partitionId) => {
      const partition = partitions.find((p) => p.partition_id === partitionId);
      if (!partition) return {...DEFAULT_TABLE_POLICY};
      const table = tables.find((t) => t.table_id === partition.table_id);
      if (!table || !table.table_policies) return {...DEFAULT_TABLE_POLICY};
      return {...DEFAULT_TABLE_POLICY, ...JSON.parse(table.table_policies)};
    },
    getMessageGroupPolicy: async () => ({...DEFAULT_MESSAGE_GROUP_POLICY}),
  };
}

/**
 * Create a mock message router.
 * @param {Object} options - Router options.
 * @return {Object} Mock router.
 */
function createMockMessageRouter(options = {}) {
  const {connectionState = 'connected'} = options;

  return {
    getConnectionState: () => connectionState,
    deliver: async () => ({acknowledged: true, status: 'completed'}),
    pingNode: async () => true,
    isOutboundQueueAvailable: () => true,
  };
}

/**
 * Create a mock SQL query engine.
 * @param {Object} options - Engine options.
 * @return {Object} Mock SQL engine.
 */
function createMockSqlQueryEngine(options = {}) {
  const {queryResults = {}} = options;

  // Default empty results
  const defaultResult = {success: true, rows: []};

  return {
    executeQuery: async (sql, _params) => {
      // Check if we have a specific result for this query
      for (const [pattern, result] of Object.entries(queryResults)) {
        if (sql.includes(pattern)) {
          return result;
        }
      }
      return defaultResult;
    },
  };
}

/**
 * Create a mock rebalance coordinator.
 * @return {Object} Mock coordinator.
 */
function createMockCoordinator() {
  const storageAccountingService = {
    estimateReplicaBytes: () => 1,
  };
  const storageAdmissionService = {
    checkAdd: async () => ({allowed: true, decisionType: 'admitted'}),
    checkReplace: async () => ({allowed: true, decisionType: 'admitted'}),
    checkSplit: async () => ({allowed: true, decisionType: 'admitted'}),
  };
  const controlPlaneReadinessService = createMockControlPlaneReadinessService();
  return {
    getMoveSafetyError: () => null,
    createOperation: async (move) => ({
      operationId: 'op-' + Date.now(),
      type: move.type,
      partitionId: move.partitionId,
      targetNodeId: move.nodeId,
      status: 'pending',
      workflowStep: 'pending',
    }),
    executeOperation: async () => ({success: true}),
    canStartAddOperation: async () => true,
    canStartRemoveOperation: async () => true,
    getStats: () => ({
      operationsCreated: 0,
      operationsCompleted: 0,
      operationsFailed: 0,
      operationsTimedOut: 0,
      inFlightOperations: 0,
      totalOperations: 0,
    }),
    storageAccountingService,
    storageAdmissionService,
    controlPlaneReadinessService,
  };
}

function isTrackedOperationInFlight(operation) {
  if (!operation) {
    return false;
  }

  const workflowStep = operation.workflow_step || operation.workflowStep || null;
  if (workflowStep === WORKFLOW_STEP.FAILED ||
      workflowStep === WORKFLOW_STEP.REMOVED) {
    return false;
  }

  return !(operation.type === 'ADD' && workflowStep === WORKFLOW_STEP.ACTIVE);
}

/**
 * Create a RebalanceCoordinator for testing with all required dependencies.
 * The SQL engine is configured to track operations via INSERT/UPDATE queries.
 * @param {Object} options - Options for the coordinator.
 * @return {RebalanceCoordinator} Coordinator instance.
 */
function createTestCoordinator(options = {}) {
  const {
    nodeId = 'test-node-1',
    enableTimeouts = false,
    cacheData = {},
    sqlQueryResults = {},
  } = options;

  const mockCache = options.systemTableCache || createMockCache(cacheData);
  const mockPolicyService = options.tablePolicyService ||
    createMockPolicyService(cacheData);
  const mockMessageRouter = options.messageRouter || createMockMessageRouter();

  // Track operations via SQL engine (not CDC)
  const trackedOperations = new Map();

  // CDC service (not used for persistence in new architecture)
  const mockCdcService = options.cdcIntegrationService || {
    insertSystemTableRow: async () => ({success: true}),
    updateSystemTableRow: async () => ({success: true}),
  };

  // SQL engine that tracks operations via INSERT/UPDATE queries
  const mockSqlEngine = options.sqlQueryEngine || {
    executeQuery: async (sql, params) => {
      // Check for custom query results first
      for (const [pattern, result] of Object.entries(sqlQueryResults)) {
        if (sql.includes(pattern)) {
          return result;
        }
      }

      // Handle INSERT operations
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

      // Handle UPDATE operations
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

      // Handle SELECT queries for replica_operations
      if (sql.includes('replica_operations')) {
        const allOps = Array.from(trackedOperations.values());

        if (sql.includes('WHERE operation_id = ?')) {
          const [operationId] = params;
          const operation = trackedOperations.get(operationId);
          return {
            success: true,
            rows: operation ? [operation] : [],
          };
        }

        // Handle deduplication query (partition_id AND target_node_id)
        if (sql.includes('partition_id = ?') && sql.includes('target_node_id = ?')) {
          const [partitionId, targetNodeId] = params;
          const matching = allOps.filter((op) =>
            op.partition_id === partitionId &&
            op.target_node_id === targetNodeId &&
            isTrackedOperationInFlight(op));
          return {success: true, rows: matching};
        }

        // Filter for non-terminal operations if query includes status filter
        // Matches both old NOT IN syntax and new <> syntax
        if (sql.includes('workflow_step') ||
            sql.includes('status <>') ||
            sql.includes('NOT IN')) {
          const incompleteOps = allOps.filter((op) =>
            isTrackedOperationInFlight(op));
          return {success: true, rows: incompleteOps};
        }

        return {success: true, rows: allOps};
      }

      return {success: true, rows: []};
    },
  };
  const transactionCoordinator =
    Object.prototype.hasOwnProperty.call(options, 'transactionCoordinator') ?
      options.transactionCoordinator :
      new DistributedTransactionCoordinator({
        beginParticipant: async () => {},
        prepareParticipant: async () => {},
        commitParticipant: async () => {},
        rollbackParticipant: async () => {},
        now: () => Date.now(),
      });

  const coordinator = new RebalanceCoordinator({
    nodeId,
    systemTableCache: mockCache,
    cdcIntegrationService: mockCdcService,
    tablePolicyService: mockPolicyService,
    messageRouter: mockMessageRouter,
    sqlQueryEngine: mockSqlEngine,
    transactionCoordinator,
    controlPlaneReadinessService:
      options.controlPlaneReadinessService ||
      createMockControlPlaneReadinessService({
        systemTableCache: mockCache,
        defaultRepairEligible: true,
      }),
    storageAdmissionService: options.storageAdmissionService || {
      checkAdd: async () => ({allowed: true, decisionType: 'admitted'}),
      checkReplace: async () => ({allowed: true, decisionType: 'admitted'}),
      checkSplit: async () => ({allowed: true, decisionType: 'admitted'}),
    },
    storageAccountingService: options.storageAccountingService || {
      estimateReplicaBytes: () => 1,
    },
    enableTimeouts,
  });

  coordinator.initialize();
  return coordinator;
}

/**
 * Create a UnifiedRebalancer for testing with all required dependencies.
 * @param {Object} options - Options for the rebalancer.
 * @return {UnifiedRebalancer} Rebalancer instance.
 */
function createTestRebalancer(options = {}) {
  const {
    entityId = 'partition-1',
    entityType = EntityType.PARTITION,
    nodeId = 'node-1',
    cacheData = {},
    connectionState = 'connected',
  } = options;

  // Merge provided cache data with defaults
  const mergedCacheData = {
    nodes: cacheData.nodes || [],
    services: cacheData.services || [],
    partitions: cacheData.partitions || [],
    tables: cacheData.tables || [],
    replicaOperations: cacheData.replicaOperations || [],
    messageGroups: cacheData.messageGroups || [],
  };

  const mockCache = options.systemTableCache || createMockCache(mergedCacheData);
  const mockCdcService = options.cdcIntegrationService || createMockCdcService();
  const mockPolicyService = options.tablePolicyService ||
    createMockPolicyService(mergedCacheData);
  const mockMessageRouter = options.messageRouter ||
    createMockMessageRouter({connectionState});
  const mockCoordinator = options.rebalanceCoordinator || createMockCoordinator();
  const storageAdmissionService = options.storageAdmissionService ||
    mockCoordinator.storageAdmissionService || {
      checkAdd: async () => ({allowed: true, decisionType: 'admitted'}),
      checkReplace: async () => ({allowed: true, decisionType: 'admitted'}),
      checkSplit: async () => ({allowed: true, decisionType: 'admitted'}),
    };
  const storageAccountingService = options.storageAccountingService ||
    mockCoordinator.storageAccountingService || {
      estimateReplicaBytes: () => 1,
    };
  const controlPlaneReadinessService = options.controlPlaneReadinessService ||
    mockCoordinator.controlPlaneReadinessService ||
    createMockControlPlaneReadinessService({
      systemTableCache: mockCache,
      defaultRepairEligible: true,
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
    controlPlaneReadinessService,
    storageAdmissionService,
    storageAccountingService,
  });
}

export {
  createMockCache,
  createMockCdcService,
  createMockTransactionCoordinator,
  createMockPolicyService,
  createMockMessageRouter,
  createMockSqlQueryEngine,
  createMockControlPlaneReadinessService,
  createMockCoordinator,
  createMockReplicaHandler,
  createMockRpcClient,
  createTestCoordinator,
  createTestRebalancer,
};
