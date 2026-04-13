/**
 * Shared test helpers for rebalancer tests.
 * Provides mock factories for all required dependencies.
 */
// @ts-nocheck


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

const SYSTEM_TABLE_PRIMARY_KEY_FIELD = {
  [SYSTEM_TABLE_NAME.NODES]: 'node_id',
  [SYSTEM_TABLE_NAME.SERVICES]: 'service_id',
  [SYSTEM_TABLE_NAME.PARTITIONS]: 'partition_id',
  [SYSTEM_TABLE_NAME.TABLES]: 'table_id',
  [SYSTEM_TABLE_NAME.MESSAGE_GROUPS]: 'message_group_id',
  [SYSTEM_TABLE_NAME.REPLICA_OPERATIONS]: 'operation_id',
};

function getSystemTablePrimaryKeyField(tableName) {
  return SYSTEM_TABLE_PRIMARY_KEY_FIELD[tableName] || null;
}

function normalizeStepsHistory(stepsHistory) {
  if (Array.isArray(stepsHistory)) {
    return stepsHistory;
  }
  if (typeof stepsHistory !== 'string') {
    return [];
  }

  try {
    const parsed = JSON.parse(stepsHistory);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function normalizeReplicaOperationRow(row = {}) {
  const normalized = {...row};
  const operationId = row.operation_id ?? row.operationId ?? null;
  const partitionId = row.partition_id ?? row.partitionId ?? null;
  const replicaId = row.replica_id ?? row.replicaId ?? null;
  const sourceNodeId = row.source_node_id ?? row.sourceNodeId ?? null;
  const targetNodeId = row.target_node_id ?? row.targetNodeId ?? row.nodeId ?? null;
  const workflowStep = row.workflow_step ?? row.workflowStep ?? null;
  const createdAt = row.created_at ?? row.createdAt ?? null;
  const updatedAt = row.updated_at ?? row.updatedAt ?? createdAt;
  const completedAt = row.completed_at ?? row.completedAt ?? null;
  const errorMessage = row.error_message ?? row.errorMessage ?? null;
  const rawStepsHistory =
    row.steps_history ?? row.stepsHistory ?? [];
  const stepsHistory = normalizeStepsHistory(rawStepsHistory);
  const serializedStepsHistory =
    typeof row.steps_history === 'string' ?
      row.steps_history :
      typeof row.stepsHistory === 'string' ?
        row.stepsHistory :
        JSON.stringify(stepsHistory);
  const entityType = row.entity_type ?? row.entityType ?? null;
  const entityId = row.entity_id ?? row.entityId ?? null;

  normalized.operation_id = operationId;
  normalized.operationId = operationId;
  normalized.partition_id = partitionId;
  normalized.partitionId = partitionId;
  normalized.replica_id = replicaId;
  normalized.replicaId = replicaId;
  normalized.source_node_id = sourceNodeId;
  normalized.sourceNodeId = sourceNodeId;
  normalized.target_node_id = targetNodeId;
  normalized.targetNodeId = targetNodeId;
  normalized.workflow_step = workflowStep;
  normalized.workflowStep = workflowStep;
  normalized.created_at = createdAt;
  normalized.createdAt = createdAt;
  normalized.updated_at = updatedAt;
  normalized.updatedAt = updatedAt;
  normalized.completed_at = completedAt;
  normalized.completedAt = completedAt;
  normalized.error_message = errorMessage;
  normalized.errorMessage = errorMessage;
  normalized.steps_history = serializedStepsHistory;
  normalized.stepsHistory = stepsHistory;
  normalized.entity_type = entityType;
  normalized.entityType = entityType;
  normalized.entity_id = entityId;
  normalized.entityId = entityId;

  return normalized;
}

function isSuccessfulMutationResult(result) {
  return !result || result.success !== false;
}

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
  const normalizedReplicaOperations =
    replicaOperations.map((operation) => normalizeReplicaOperationRow(operation));

  const cache = {
    nodes: new Map(normalizedNodes.map((node) => [node.node_id, node])),
    services: new Map(services.map((s) => [s.service_id, s])),
    partitions: new Map(partitions.map((p) => [p.partition_id, p])),
    tables: new Map(tables.map((t) => [t.table_id, t])),
    message_groups: new Map(messageGroups.map((mg) => [mg.message_group_id, mg])),
    replica_operations: new Map(
      normalizedReplicaOperations
        .filter((operation) => operation.operation_id)
        .map((operation) => [operation.operation_id, operation]),
    ),
  };

  function getTable(tableName) {
    return cache[tableName] || null;
  }

  function normalizeCacheRow(tableName, row) {
    if (tableName === SYSTEM_TABLE_NAME.REPLICA_OPERATIONS) {
      return normalizeReplicaOperationRow(row);
    }
    return row;
  }

  return {
    get: (tableName, key) => getTable(tableName)?.get(key),
    filter: (tableName, predicate) => {
      const table = getTable(tableName);
      if (!table) return [];
      return Array.from(table.values()).filter(predicate);
    },
    getAll: (tableName) => {
      const table = getTable(tableName);
      if (!table) return [];
      return Array.from(table.values());
    },
    upsert: (tableName, row) => {
      const table = getTable(tableName);
      if (!table || !row || typeof row !== 'object') {
        return null;
      }

      const normalizedRow = normalizeCacheRow(tableName, row);
      const keyField = getSystemTablePrimaryKeyField(tableName);
      const key = keyField ? normalizedRow[keyField] : null;
      if (key === null || key === undefined) {
        return null;
      }

      table.set(key, normalizedRow);
      return normalizedRow;
    },
    merge: (tableName, key, patch = {}) => {
      const table = getTable(tableName);
      if (!table || key === null || key === undefined) {
        return null;
      }

      const existing = table.get(key) || {};
      const normalizedRow = normalizeCacheRow(tableName, {
        ...existing,
        ...patch,
      });
      table.set(key, normalizedRow);
      return normalizedRow;
    },
    delete: (tableName, key) => {
      const table = getTable(tableName);
      if (!table) {
        return false;
      }
      return table.delete(key);
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
    membershipPublicationPlanningSnapshot = null,
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
      const dimensions = {
        [CONTROL_PLANE_READINESS_DIMENSION.REPAIR_ELIGIBLE]: repairEligible,
        [CONTROL_PLANE_READINESS_DIMENSION.SERVE_ELIGIBLE]: repairEligible,
      };

      for (const dimensionName of Object.values(CONTROL_PLANE_READINESS_DIMENSION)) {
        if (typeof dimensionName === 'string' &&
            dimensionName.toLowerCase().endsWith('eligible') &&
            !Object.hasOwn(dimensions, dimensionName)) {
          dimensions[dimensionName] = repairEligible;
        }
      }

      return {
        nodeId,
        dimensions,
      };
    },
    getMembershipPublicationPlanningSnapshotSync(nodeId) {
      if (typeof membershipPublicationPlanningSnapshot === 'function') {
        return membershipPublicationPlanningSnapshot(nodeId);
      }
      if (membershipPublicationPlanningSnapshot &&
          typeof membershipPublicationPlanningSnapshot === 'object') {
        return membershipPublicationPlanningSnapshot;
      }

      const nodeRows = systemTableCache &&
        typeof systemTableCache.getAll === 'function' ?
        systemTableCache.getAll(SYSTEM_TABLE_NAME.NODES) :
        [];
      const publishedActiveNodeIds = nodeRows
        .filter((nodeRow) => isNodeRepairEligible(nodeRow))
        .map((nodeRow) => nodeRow.node_id)
        .filter((candidate) => typeof candidate === 'string');
      return {
        publishedActiveNodeIdsPresent: true,
        publishedActiveNodeIds,
        publishedMembershipIncludesTargetNode:
          typeof nodeId === 'string' ?
            publishedActiveNodeIds.includes(nodeId) :
            null,
        priorityPartitionSummary: {
          satisfied: true,
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

function createMockControlPlaneSystemTableGateway(sqlQueryEngine = null) {
  const gateway = {
    async executeQuery(sql, params = [], _queryOptions = {}) {
      if (sqlQueryEngine &&
          typeof sqlQueryEngine.executeQuery === 'function') {
        return sqlQueryEngine.executeQuery(sql, params);
      }
      return {success: true, rows: []};
    },
    async readAuthoritativeRows(_tableName, sql, params = [], queryOptions = {}) {
      return gateway.executeQuery(sql, params, queryOptions);
    },
    async readRows(_tableName, sql, params = [], queryOptions = {}) {
      return gateway.executeQuery(sql, params, queryOptions);
    },
  };
  return gateway;
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
    syncOwnerDependencies(options = {}) {
      if (Object.hasOwn(options, 'systemTableCache')) {
        this.systemTableCache = options.systemTableCache || null;
      }
      if (Object.hasOwn(options, 'cdcIntegrationService')) {
        this.cdcIntegrationService = options.cdcIntegrationService || null;
      }
      if (Object.hasOwn(options, 'tablePolicyService')) {
        this.tablePolicyService = options.tablePolicyService || null;
      }
      if (Object.hasOwn(options, 'messageRouter')) {
        this.messageRouter = options.messageRouter || null;
      }
      if (Object.hasOwn(options, 'sqlQueryEngine')) {
        this.sqlQueryEngine = options.sqlQueryEngine || null;
      }
    },
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
    autoProgressCreatedOperations = false,
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

  function syncReplicaOperationRow(row) {
    const normalized = normalizeReplicaOperationRow(row);
    if (!normalized.operation_id) {
      return null;
    }

    trackedOperations.set(normalized.operation_id, normalized);
    if (typeof mockCache.upsert === 'function') {
      mockCache.upsert(SYSTEM_TABLE_NAME.REPLICA_OPERATIONS, normalized);
    }
    return normalized;
  }

  function mergeReplicaOperationRow(operationId, patch = {}) {
    const existing = trackedOperations.get(operationId) || {operation_id: operationId};
    return syncReplicaOperationRow({
      ...existing,
      ...patch,
      operation_id: operationId,
      operationId,
    });
  }

  function deleteReplicaOperationRow(operationId) {
    trackedOperations.delete(operationId);
    if (typeof mockCache.delete === 'function') {
      mockCache.delete(SYSTEM_TABLE_NAME.REPLICA_OPERATIONS, operationId);
    }
  }

  function seedReplicaOperationsFromCache() {
    if (typeof mockCache.getAll !== 'function') {
      return;
    }

    const existingOperations = mockCache.getAll(SYSTEM_TABLE_NAME.REPLICA_OPERATIONS);
    for (const operation of existingOperations) {
      syncReplicaOperationRow(operation);
    }
  }

  async function submitReplicaOperationMutation(mutation) {
    switch (mutation?.operation) {
      case 'insert': {
        const result = typeof mockCdcService.insertSystemTableRow === 'function' ?
          await mockCdcService.insertSystemTableRow(
            mutation.tableName,
            mutation.row,
          ) :
          {success: true, partitionResult: {affectedRows: 1}};
        if (isSuccessfulMutationResult(result)) {
          syncReplicaOperationRow(mutation.row);
        }
        return result;
      }
      case 'update': {
        const whereClause = mutation.whereClause || mutation.where || {};
        const operationId = whereClause.operation_id ?? whereClause.operationId ??
          mutation.data?.operation_id ?? mutation.data?.operationId ?? null;
        const result = typeof mockCdcService.updateSystemTableRow === 'function' ?
          await mockCdcService.updateSystemTableRow(
            mutation.tableName,
            whereClause,
            mutation.data,
          ) :
          {success: true, partitionResult: {affectedRows: 1}};
        if (isSuccessfulMutationResult(result) && operationId) {
          mergeReplicaOperationRow(operationId, mutation.data);
        }
        return result;
      }
      case 'delete': {
        const whereClause = mutation.whereClause || mutation.where || {};
        const operationId = whereClause.operation_id ?? whereClause.operationId ?? null;
        deleteReplicaOperationRow(operationId);
        return {success: true, partitionResult: {affectedRows: 1}};
      }
      default:
        return {success: true, partitionResult: {affectedRows: 1}};
    }
  }

  seedReplicaOperationsFromCache();

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
          stepsHistory, entityType, entityId,
        ] = params;

        syncReplicaOperationRow({
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
          entity_type: entityType,
          entity_id: entityId,
        });
        return {success: true};
      }

      // Handle UPDATE operations
      if (sql.includes('UPDATE replica_operations')) {
        const [
          status, workflowStep, updatedAt, completedAt, errorMessage,
          stepsHistory, replicaId, operationId,
        ] = params;

        mergeReplicaOperationRow(operationId, {
          status,
          workflow_step: workflowStep,
          updated_at: updatedAt,
          completed_at: completedAt,
          error_message: errorMessage,
          steps_history: stepsHistory,
          replica_id: replicaId,
        });
        return {success: true};
      }

      // Handle SELECT queries for replica_operations
      if (sql.includes('replica_operations')) {
        const allOps = Array.from(trackedOperations.values());

        let filteredOps = allOps;
        const equalityFilters = [
          {pattern: 'operation_id = ?', field: 'operation_id'},
          {pattern: 'partition_id = ?', field: 'partition_id'},
          {pattern: 'target_node_id = ?', field: 'target_node_id'},
          {pattern: 'source_node_id = ?', field: 'source_node_id'},
          {pattern: 'entity_type = ?', field: 'entity_type'},
          {pattern: 'entity_id = ?', field: 'entity_id'},
        ]
          .map((filter) => ({
            ...filter,
            index: sql.indexOf(filter.pattern),
          }))
          .filter((filter) => filter.index !== -1)
          .sort((left, right) => left.index - right.index);

        let paramIndex = 0;
        for (const filter of equalityFilters) {
          const value = params[paramIndex++];
          filteredOps = filteredOps.filter((operation) =>
            operation[filter.field] === value);
        }

        // Filter for non-terminal operations if query includes status filter
        // Matches both old NOT IN syntax and new <> syntax
        if (sql.includes('workflow_step') ||
            sql.includes('status <>') ||
            sql.includes('NOT IN')) {
          filteredOps = filteredOps.filter((op) =>
            isTrackedOperationInFlight(op));
        }

        return {success: true, rows: filteredOps};
      }

      return {success: true, rows: []};
    },
  };
  const controlPlaneSystemTableGateway =
    options.controlPlaneSystemTableGateway || {
      readAuthoritativeRows: async (_tableName, sql, params = []) => {
        return mockSqlEngine.executeQuery(sql, params);
      },
      readRows: async (_tableName, sql, params = []) => {
        return mockSqlEngine.executeQuery(sql, params);
      },
      executeQuery: async (sql, params = []) => {
        return mockSqlEngine.executeQuery(sql, params);
      },
      async submitMutation(mutation) {
        if (mutation?.tableName === SYSTEM_TABLE_NAME.REPLICA_OPERATIONS) {
          return submitReplicaOperationMutation(mutation);
        }

        switch (mutation?.operation) {
          case 'insert':
            return mockCdcService.insertSystemTableRow(
              mutation.tableName,
              mutation.row,
            );
          case 'update':
            return mockCdcService.updateSystemTableRow(
              mutation.tableName,
              mutation.whereClause,
              mutation.data,
            );
          default:
            return {success: true, partitionResult: {affectedRows: 1}};
        }
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
    controlPlaneSystemTableGateway,
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
    setTimeoutFn: options.setTimeoutFn,
    clearTimeoutFn: options.clearTimeoutFn,
  });

  coordinator.initialize();
  if (!autoProgressCreatedOperations) {
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
  }
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
  createMockControlPlaneSystemTableGateway,
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
