import {buildStorageAdmissionResult} from '../../src/rebalancer/storage-admission-result.js';
import {STORAGE_ADMISSION_DECISION_TYPE} from '../../src/rebalancer/storage-admission-constants.js';
import {projectNodeLivenessSemantics} from '../../src/control-plane/node-liveness-semantic-projection.js';
import {DEFAULT_TABLE_POLICY} from '../../src/policy/policy-constants.js';
/**
 * Shared test helpers for rebalancer tests.
 * Provides mock factories for all required dependencies.
 */

import {buildDeliveryEnvelope} from '../../src/transport/transport-semantic-outcome.js';
import {
  answerFixtureCommittedMembership,
  withFixtureCommittedMembership,
} from './committed-membership-fixture.js';
import {RebalanceCoordinator} from '../../src/rebalancer/rebalance-coordinator.js';
import {UnifiedRebalancer} from '../../src/rebalancer/unified-rebalancer.js';
import {readinessServiceFake} from '../helpers/readiness-service-fixture.js';
import {buildServeCohortAnswerFromNodeRows} from './priority-spread-release-condition-fixture.js';
import {WORKFLOW_STEP} from '../../src/constants/index.js';
import {SYSTEM_TABLE_NAME} from '../../src/bootstrap/system-table-schemas-constants.js';
import {
  CONTROL_PLANE_READINESS_DIMENSION,
} from '../../src/control-plane/control-plane-readiness-constants.js';
import {
  DistributedTransactionCoordinator,
} from '../../src/query/distributed/distributed-transaction-coordinator.js';
import {
  DEFAULT_MESSAGE_GROUP_POLICY,
  EntityType,
  MoveType,
  NodeStatus,
  ReplicaStatus,
} from '../../src/rebalancer/unified-rebalancer.js';
import {ConfigurationManager} from '../../src/config/configuration-manager.js';
import {LoggingService} from '../../src/logging/logging-service.js';
import {
  PARTITION_REPLICA_MEMBERSHIP_STATE,
} from '../../src/partition/partition-replica-membership-constants.js';
import {
  ReplicaOperationField,
  ReplicaOperationMessageType,
  ReplicaOperationResponseStatus,
} from '../../src/rebalancer/replica-operation-constants.js';
import {buildFailedCreateCleanupToken} from
  '../../src/rebalancer/failed-create-cleanup-token.js';

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
  const targetClaimKey =
    row.target_claim_key ?? row.targetClaimKey ?? null;
  const sourceNodeId = row.source_node_id ?? row.sourceNodeId ?? null;
  const targetNodeId = row.target_node_id ?? row.targetNodeId ?? row.nodeId ?? null;
  const workflowStep = row.workflow_step ?? row.workflowStep ?? null;
  const createdAt = row.created_at ?? row.createdAt ?? null;
  const updatedAt = row.updated_at ?? row.updatedAt ?? createdAt;
  const completedAt = row.completed_at ?? row.completedAt ?? null;
  const leaseExpiresAt =
    row.lease_expires_at ?? row.leaseExpiresAt ?? null;
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
  const membershipPublicationEpoch =
    row.membership_publication_epoch ?? row.membershipPublicationEpoch ?? null;

  normalized.operation_id = operationId;
  normalized.operationId = operationId;
  normalized.partition_id = partitionId;
  normalized.partitionId = partitionId;
  normalized.replica_id = replicaId;
  normalized.replicaId = replicaId;
  normalized.target_claim_key = targetClaimKey;
  normalized.targetClaimKey = targetClaimKey;
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
  normalized.lease_expires_at = leaseExpiresAt;
  normalized.leaseExpiresAt = leaseExpiresAt;
  normalized.error_message = errorMessage;
  normalized.errorMessage = errorMessage;
  normalized.steps_history = serializedStepsHistory;
  normalized.stepsHistory = stepsHistory;
  normalized.entity_type = entityType;
  normalized.entityType = entityType;
  normalized.entity_id = entityId;
  normalized.entityId = entityId;
  normalized.membership_publication_epoch = membershipPublicationEpoch;
  normalized.membershipPublicationEpoch = membershipPublicationEpoch;

  return normalized;
}

function isSuccessfulMutationResult(result) {
  return !result || result.success !== false;
}

function withSuccessfulStorageReservationInsert(executeQuery) {
  return async (sql, params = []) => {
    if (String(sql).includes(
      'INSERT OR IGNORE INTO storage_reservations',
    )) {
      return {success: true, affectedRows: 1, changes: 1};
    }
    return executeQuery(sql, params);
  };
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
    serviceDefinitions = [],
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
    message_groups: new Map(
      messageGroups.map((mg) => [mg.group_id ?? mg.message_group_id, mg]),
    ),
    service_definitions: new Map(
      serviceDefinitions.map((sd) => [sd.service_id, sd]),
    ),
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
    upsert: (tableName, rowOrKey, maybeRow) => {
      const row = typeof rowOrKey === 'object' && rowOrKey !== null ?
        rowOrKey :
        maybeRow;
      const table = getTable(tableName);
      if (!table || !row || typeof row !== 'object') {
        return null;
      }

      const normalizedRow = normalizeCacheRow(tableName, row);
      const keyField = getSystemTablePrimaryKeyField(tableName);
      const key =
        tableName === SYSTEM_TABLE_NAME.MESSAGE_GROUPS ?
          normalizedRow.group_id ?? normalizedRow.message_group_id :
          keyField ?
            normalizedRow[keyField] :
            null;
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

/**
 * Construct a controlled readiness port over one declared fixture world.
 * The node rows stand in for a committed reader; this does not execute consensus.
 * Explicit callbacks model scenario answers. Caller-owned ports are never adapted.
 */
function createMockControlPlaneReadinessService(options = {}) {
  const {
    systemTableCache = null,
    readNodeRows = () => systemTableCache?.getAll(SYSTEM_TABLE_NAME.NODES) ?? [],
    now = () => Date.now(),
    defaultRepairEligible = false,
    readinessByNodeId = {},
    livenessProjectionByNodeId = null,
    membershipPublicationPlanningSnapshot = null,
    callbacks = {},
  } = options;
  const project = (nodeRow) => projectNodeLivenessSemantics({nodeRow, nowMs: now()}).projection;
  const buildPlanningSnapshot = (nodeId, observedAt) =>
    typeof membershipPublicationPlanningSnapshot === 'function' ?
      membershipPublicationPlanningSnapshot(nodeId, observedAt) :
      membershipPublicationPlanningSnapshot;
  const port = {
    async readServeEligibility() {},
    answerCommittedNodes() {
      return {
        state: 'ready',
        epoch: {publicationEpoch: 1, publicationId: 'cluster_membership-1', readAtMs: now()},
        nodeRows: readNodeRows(),
      };
    },
    // The committed serve record's cohort answer, from the same node rows
    // and liveness projection as the rest of this mock.
    answerServeCohort: (nodeIds) => buildServeCohortAnswerFromNodeRows({
      nodeIds,
      nodeRows: readNodeRows(),
      isNodeRowEligible: (nodeRow) => project(nodeRow).readyNow === true,
      absentNodeEligible: defaultRepairEligible,
      readAtMs: now(),
    }),
    getNodeReadinessSync(nodeId) {
      if (readinessByNodeId[nodeId]) return readinessByNodeId[nodeId];
      const nodeRow = readNodeRows().find((row) => row.node_id === nodeId);
      const eligible = nodeRow ? project(nodeRow).readyNow : defaultRepairEligible;
      return {
        nodeId,
        dimensions: {
          ...Object.fromEntries(Object.values(CONTROL_PLANE_READINESS_DIMENSION)
            .map((dimension) => [dimension, eligible])),
          [CONTROL_PLANE_READINESS_DIMENSION.PROCESS_ALIVE]: Boolean(nodeRow),
        },
        reasons: [],
      };
    },
    async getNodeReadiness(nodeId, options) {
      return port.getNodeReadinessSync(nodeId, options);
    },
    projectNodeLiveness(nodeId) {
      if (livenessProjectionByNodeId) return livenessProjectionByNodeId[nodeId] ?? null;
      return project(readNodeRows().find((row) => row.node_id === nodeId));
    },
    getPriorityRecoveryPlanningAnswerSync(nodeId = null, observedAt = Date.now()) {
      return buildPlanningSnapshot(nodeId, observedAt);
    },
    async getPriorityRecoveryPlanningSnapshotBestEffort(nodeId = null, observedAt = Date.now()) {
      return this.getPriorityRecoveryPlanningAnswerSync(nodeId, observedAt);
    },
    ...callbacks,
  };
  // The one completer: an unstated consumer member answers as absent.
  return readinessServiceFake(port, now);
}

/**
 * Create a mock CDC integration service.
 * @return {Object} Mock CDC service.
 */
function createMockCdcService() {
  return {
    upsertSystemTableRow: async () => ({success: true}),
    updateSystemTableRow: async () => ({success: true}),
    refreshAuthoritativeCacheRow: async () => true,
  };
}

function withAuthoritativeReadDefaults(tableName, rawResult) {
  if (!rawResult || rawResult.success !== true || !Array.isArray(rawResult.rows)) {
    return rawResult;
  }
  const next = {...rawResult};
  if (next.rowSetComplete === undefined && next.partial !== true) {
    next.rowSetComplete = true;
  }
  if (next.readAuthorityWitness === undefined) {
    next.readAuthorityWitness = buildMockPolicyAuthorityWitness(
      `${tableName || SYSTEM_TABLE_NAME.SERVICES}-p1`,
    );
  }
  return next;
}

function createMockControlPlaneSystemTableGateway(sqlQueryEngine = null) {
  const gateway = {
    async executeQuery(sql, params = [], _queryOptions = {}) {
      if (sqlQueryEngine && typeof sqlQueryEngine.executeQuery === 'function') {
        return sqlQueryEngine.executeQuery(sql, params, _queryOptions);
      }
      return {success: true, rows: [], rowSetComplete: true};
    },
    async readAuthoritativeRows(tableName, sql, params = [], queryOptions = {}) {
      return withAuthoritativeReadDefaults(
        tableName,
        await gateway.executeQuery(sql, params, queryOptions),
      );
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

function buildMockPolicyAuthorityWitness(partitionId) {
  return Object.freeze({
    state: 'observed',
    partitionId,
    servingNodeId: 'test-node-1',
    servingReplicaId: `${partitionId}-r1`,
    role: 'leader',
    leaderNodeId: 'test-node-1',
    term: 1,
    commitIndex: 1,
    appliedIndex: 1,
    observedAtMs: 1_000_000,
  });
}

/**
 * Create a mock table policy service.
 * @param {Object} options - Policy options.
 * @return {Object} Mock policy service.
 */
function createMockPolicyService(options = {}) {
  const {
    partitions = [],
    tables = [],
    getPolicyForPartition = null,
    getMessageGroupPolicy = null,
  } = options;
  const resolvePartitionPolicy = typeof getPolicyForPartition === 'function' ?
    getPolicyForPartition :
    (partitionId) => {
      const partition = partitions.find((p) => p.partition_id === partitionId);
      if (!partition) return {...DEFAULT_TABLE_POLICY, targetReplicaCount: 3};
      const table = tables.find((t) => t.table_id === partition.table_id);
      if (!table || !table.table_policies) return {...DEFAULT_TABLE_POLICY, targetReplicaCount: 3};
      return {...DEFAULT_TABLE_POLICY, ...JSON.parse(table.table_policies),
        targetReplicaCount: partition.replica_count ?? 3};
    };
  const resolveMessageGroupPolicy = typeof getMessageGroupPolicy === 'function' ?
    getMessageGroupPolicy :
    () => ({...DEFAULT_MESSAGE_GROUP_POLICY});

  return {
    getPolicyForPartition: resolvePartitionPolicy,
    getMessageGroupPolicy: async (groupId) => resolveMessageGroupPolicy(groupId),
    resolvePartitionPolicyFact: async (partitionId) => {
      const policy = await resolvePartitionPolicy(partitionId);
      if (!policy || typeof policy !== 'object') {
        return Object.freeze({
          state: 'unavailable_or_stale',
          reason: 'policy_read_unavailable',
          partitionId: partitionId || null,
          tableId: null,
          policy: null,
          targetReplicaCount: null,
          minReplicaCount: null,
          maxReplicaCount: null,
          partitionReadAuthorityWitness: null,
          tableReadAuthorityWitness: null,
          readAuthorityWitness: null,
          rowSetComplete: false,
        });
      }
      const partitionWitness = buildMockPolicyAuthorityWitness('partitions-p1');
      const tableWitness = buildMockPolicyAuthorityWitness('tables-p1');
      return Object.freeze({
        state: 'authoritative_policy',
        reason: null,
        partitionId: partitionId || null,
        tableId: null,
        policy,
        targetReplicaCount: policy.targetReplicaCount,
        minReplicaCount: policy.minReplicaCount ?? policy.targetReplicaCount,
        maxReplicaCount: policy.maxReplicaCount ?? null,
        partitionReadAuthorityWitness: partitionWitness,
        tableReadAuthorityWitness: tableWitness,
        readAuthorityWitness: partitionWitness,
        rowSetComplete: true,
      });
    },
    resolveMessageGroupPolicyFact: async (groupId) => {
      const policy = await resolveMessageGroupPolicy(groupId);
      if (!policy || typeof policy !== 'object') {
        return Object.freeze({
          state: 'unavailable_or_stale',
          reason: 'policy_read_unavailable',
          groupId: groupId || null,
          policy: null,
          targetReplicaCount: null,
          minReplicaCount: null,
          maxReplicaCount: null,
          readAuthorityWitness: null,
          rowSetComplete: false,
        });
      }
      const witness = buildMockPolicyAuthorityWitness('message_groups-p1');
      return Object.freeze({
        state: 'authoritative_policy',
        reason: null,
        groupId: groupId || null,
        policy,
        targetReplicaCount: policy.targetReplicaCount,
        minReplicaCount: policy.minReplicaCount ?? policy.targetReplicaCount,
        maxReplicaCount: policy.maxReplicaCount ?? null,
        readAuthorityWitness: witness,
        rowSetComplete: true,
      });
    },
  };
}

/**
 * Create a mock message router.
 * @param {Object} options - Router options.
 * @return {Object} Mock router.
 */
function createMockMessageRouter(options = {}) {
  const {connectionState = 'connected', systemTableCache = null} = options;

  return {
    getConnectionState: () => connectionState,
    // A committed-membership read is answered by the fixture world (from
    // the given cache, when there is one); every other delivery succeeds.
    deliver: async (target, payload) =>
      answerFixtureCommittedMembership(systemTableCache, payload) ??
        buildDeliveryEnvelope({acknowledged: true}, {status: 'completed'}),
    pingNode: async () => true,
    isOutboundQueueAvailable: () => true,
  };
}

// The REPLACE witness replica's answers in the fixture world (quest
// replace-source-removal-owner): the target's committed configuration is
// modelled from the fixture's services rows - the source is a voter until
// its row is REMOVED or deleted (a REMOVING row is still a voter until its
// removal commits; the leader's row-driven peer reconciliation commits it
// when the row leaves; a row the fixture never had is still a voter) - and
// the leader from the
// partition row (or the row carrying raft_role leader). A test whose subject
// is the committed-membership contract itself passes its own witness double
// (replace-witness-fixture.js) instead.
const FIXTURE_RETIRING_ROW_STATUSES = Object.freeze(new Set([
  'removed',
]));
const FIXTURE_WITNESS_COMMIT_INDEX = 1;
const FIXTURE_WITNESS_TRANSFER_WINDOW_MS = 1000;

function fixturePartitionRows(cache, partitionId) {
  if (typeof cache?.filter !== 'function') {
    return [];
  }
  return cache.filter(SYSTEM_TABLE_NAME.SERVICES, (row) =>
    row?.partition_id === partitionId) || [];
}

// The leader the witness reports: the partition row's leader node, else the
// row the fixture marks leader, else (a fixture that names no leader) the
// replacement itself - leadership already off the source.
function fixtureWitnessLeader(cache, partitionId, rows, targetReplicaId) {
  const partitionRow = typeof cache?.get === 'function' ?
    cache.get(SYSTEM_TABLE_NAME.PARTITIONS, partitionId) : null;
  const leaderNodeId = partitionRow?.leader_node_id || null;
  const leaderRow = rows.find((row) =>
    (leaderNodeId && row?.node_id === leaderNodeId) ||
    (!leaderNodeId && String(row?.raft_role || '').toLowerCase() === 'leader'));
  return leaderRow?.replica_id || leaderRow?.service_id ||
    (leaderNodeId ? null : targetReplicaId);
}

// The services rows the fixture deleted: a deleted source row is the fixture
// world's committed removal; a row the fixture never had is not.
const FIXTURE_DELETED_SERVICE_IDS = new WeakMap();

function trackFixtureServiceDeletions(cache) {
  if (!cache || typeof cache.delete !== 'function' ||
      FIXTURE_DELETED_SERVICE_IDS.has(cache)) {
    return;
  }
  const deleted = new Set();
  FIXTURE_DELETED_SERVICE_IDS.set(cache, deleted);
  const baseDelete = cache.delete.bind(cache);
  cache.delete = (tableName, key, ...rest) => {
    if (tableName === SYSTEM_TABLE_NAME.SERVICES) {
      deleted.add(key);
    }
    return baseDelete(tableName, key, ...rest);
  };
  if (typeof cache.upsert === 'function') {
    const baseUpsert = cache.upsert.bind(cache);
    cache.upsert = (tableName, row, ...rest) => {
      if (tableName === SYSTEM_TABLE_NAME.SERVICES) {
        deleted.delete(row?.service_id);
        deleted.delete(row?.replica_id);
      }
      return baseUpsert(tableName, row, ...rest);
    };
  }
}

function findFixtureClaimOperation(cache, operationId) {
  const operations = typeof cache?.getAll === 'function' ?
    cache.getAll(SYSTEM_TABLE_NAME.REPLICA_OPERATIONS) : [];
  return operations.find((candidate) =>
    (candidate?.operation_id ?? candidate?.operationId) === operationId) || null;
}

function findFixtureClaimServiceRow(cache, replicaId, precondition) {
  const serviceRows = typeof cache?.getAll === 'function' ?
    cache.getAll(SYSTEM_TABLE_NAME.SERVICES) : [];
  return serviceRows.find((candidate) =>
    candidate?.service_id === replicaId ||
    candidate?.replica_id === replicaId ||
    candidate?.service_id === precondition?.service_id) || null;
}

function matchesFixtureClaimOperationTarget(operation, payload) {
  return Boolean(operation && payload) &&
    operation.type === payload[ReplicaOperationField.OPERATION_TYPE] &&
    operation.partition_id === payload[ReplicaOperationField.PARTITION_ID] &&
    operation.replica_id === payload[ReplicaOperationField.REPLICA_ID];
}

function isFixtureClaimOperationTerminalFailed(operation, payload, precondition) {
  if (!matchesFixtureClaimOperationTarget(operation, payload) || !precondition) {
    return false;
  }
  const hasCompletedTimestamp =
    operation.completed_at !== null && operation.completed_at !== undefined;
  return hasCompletedTimestamp &&
    String(operation.workflow_step || '').toUpperCase() ===
      WORKFLOW_STEP.FAILED &&
    String(operation.status || '').toLowerCase() === ReplicaStatus.FAILED &&
    operation.create_admission_attempt_token ===
      precondition.create_attempt_token;
}

function matchesFixtureClaimServicePrecondition(serviceRow, precondition) {
  return Boolean(serviceRow && precondition) &&
    serviceRow.status === ReplicaStatus.FAILED &&
    serviceRow.cleanup_token === null &&
    serviceRow.create_attempt_token === precondition.create_attempt_token &&
    serviceRow.created_at === precondition.created_at &&
    serviceRow.state_entered_at === precondition.state_entered_at;
}

function answerFixtureClaimFailedCreateCleanup(cache, payload) {
  const operationId = payload?.[ReplicaOperationField.OPERATION_ID];
  const replicaId = payload?.[ReplicaOperationField.REPLICA_ID];
  const precondition = payload?.[
    ReplicaOperationField.FAILED_CREATE_TARGET_LIFECYCLE_PRECONDITION
  ];
  const operation = findFixtureClaimOperation(cache, operationId);
  const serviceRow = findFixtureClaimServiceRow(cache, replicaId, precondition);
  if (!isFixtureClaimOperationTerminalFailed(operation, payload, precondition) ||
      !matchesFixtureClaimServicePrecondition(serviceRow, precondition)) {
    return {
      status: ReplicaOperationResponseStatus.ERROR,
      error: 'fixture failed-create cleanup claim precondition mismatch',
    };
  }
  serviceRow.cleanup_token = buildFailedCreateCleanupToken(operationId);
  serviceRow.state_entered_at = Number(serviceRow.state_entered_at) + 1;
  cache.upsert?.(SYSTEM_TABLE_NAME.SERVICES, replicaId, serviceRow);
  return {
    status: ReplicaOperationResponseStatus.COMPLETED,
    operationId,
    replicaId,
  };
}

function answerFixtureReplaceWitness(cache, payload) {
  const type = payload?.type;
  if (type === ReplicaOperationMessageType.CLAIM_FAILED_CREATE_CLEANUP) {
    return answerFixtureClaimFailedCreateCleanup(cache, payload);
  }
  if (type === ReplicaOperationMessageType.RETIRE_REPLICA_PEER) {
    return {
      status: ReplicaOperationResponseStatus.INITIATED,
      [ReplicaOperationField.PROPOSAL]: {outcome: 'PROPOSED'},
    };
  }
  if (type !== ReplicaOperationMessageType.READ_REPLICA_MEMBERSHIP) {
    return undefined;
  }
  const partitionId = payload[ReplicaOperationField.PARTITION_ID];
  const sourceReplicaId = payload[ReplicaOperationField.SOURCE_REPLICA_ID];
  const rows = fixturePartitionRows(cache, partitionId);
  const sourceRow = rows.find((row) =>
    row?.replica_id === sourceReplicaId || row?.service_id === sourceReplicaId);
  const deletedSource = FIXTURE_DELETED_SERVICE_IDS.get(cache)
    ?.has(sourceReplicaId) === true;
  const sourceVoter = !deletedSource &&
    !FIXTURE_RETIRING_ROW_STATUSES.has(
      String(sourceRow?.status || '').toLowerCase());
  const leader = fixtureWitnessLeader(cache, partitionId, rows,
    payload[ReplicaOperationField.REPLICA_ID]);

  return {
    status: ReplicaOperationResponseStatus.COMPLETED,
    [ReplicaOperationField.MEMBERSHIP]: {
      state: sourceVoter ?
        PARTITION_REPLICA_MEMBERSHIP_STATE.VOTER :
        PARTITION_REPLICA_MEMBERSHIP_STATE.ABSENT,
      replicaId: payload[ReplicaOperationField.REPLICA_ID],
      partitionId,
      term: 1,
      commitIndex: FIXTURE_WITNESS_COMMIT_INDEX,
      appliedIndex: FIXTURE_WITNESS_COMMIT_INDEX,
      // A fixture witness is a caught-up member: its gate is open (O1).
      gateOpen: true,
      leaderReplicaId: leader,
      // fix-f7: the fixture has no group, so its leader's configuration
      // names the leader alone and the leader corroborates itself; the
      // real-group harness is the corroboration witness.
      voterReplicaIds: leader ? [leader] : [],
      votersOutgoingReplicaIds: [],
      transferWindowMaxMs: FIXTURE_WITNESS_TRANSFER_WINDOW_MS,
    },
  };
}

/**
 * A router whose witness messages the fixture world answers; every other
 * message reaches the test's own router unchanged.
 * @param {Object} router
 * @param {Object} cache
 * @return {Object}
 */
function withFixtureReplaceWitness(router, cache) {
  if (!router || typeof router.deliver !== 'function') {
    return router;
  }
  const deliver = router.deliver.bind(router);
  router.deliver = async (target, payload, options) => {
    const answer = answerFixtureReplaceWitness(cache, payload);
    return answer === undefined ? deliver(target, payload, options) : buildDeliveryEnvelope(
      {acknowledged: true},
      {
        ...answer,
      });
  };
  return router;
}

/**
 * Create a mock SQL query engine.
 * @param {Object} options - Engine options.
 * @return {Object} Mock SQL engine.
 */
function createMockSqlQueryEngine(options = {}) {
  const {queryResults = {}} = options;

  // Default empty results
  const defaultResult = {success: true, rows: [], rowSetComplete: true};

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

function createMockStorageAdmissionService() {
  const admission = buildStorageAdmissionResult({
    allowed: true,
    decisionType: STORAGE_ADMISSION_DECISION_TYPE.ADMITTED,
  });
  return {
    checkAdd: async () => admission,
    checkReplace: async () => admission,
    checkSplit: async () => admission,
  };
}

/**
 * Create a mock rebalance coordinator.
 * @return {Object} Mock coordinator.
 */
function createMockCoordinator({controlPlaneReadinessService = null,
  readOperationsByEntity = async () => []} = {}) {
  const storageAccountingService = {
    estimateReplicaBytes: () => 1,
  };
  const storageAdmissionService = createMockStorageAdmissionService();
  return {
    // This controlled owner models an empty operation ledger unless the test
    // supplies its entity reader. It is not a cache fallback or a real read.
    getOperationsByEntity(entityType, entityId, options) {
      return readOperationsByEntity(entityType, entityId, options);
    },
    getMoveSafetyError: () => null,
    createOperation: async (move) => ({
      operationId: 'op-' + Date.now(),
      type: move.type,
      partitionId: move.partitionId,
      targetNodeId: move.nodeId,
      status: ReplicaStatus.PENDING,
      workflowStep: WORKFLOW_STEP.PENDING,
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
  trackFixtureServiceDeletions(mockCache);
  // The committed-membership read is always the fixture world's (owner
  // decision O1); the REPLACE witness double is opt-out.
  const witnessRouter = options.replaceWitness === false ?
    options.messageRouter || createMockMessageRouter() :
    withFixtureReplaceWitness(
      options.messageRouter || createMockMessageRouter(), mockCache);
  const mockMessageRouter = options.committedMembershipFixture === false ?
    witnessRouter :
    withFixtureCommittedMembership(witnessRouter, mockCache);

  // Track operations via SQL engine (not CDC)
  const trackedOperations = new Map();
  const trackedReservations = new Map();

  // CDC service (not used for persistence in new architecture)
  const mockCdcService = options.cdcIntegrationService || {
    insertSystemTableRow: async () => ({success: true}),
    updateSystemTableRow: async () => ({success: true}),
    refreshAuthoritativeCacheRow: async () => true,
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
      // Gateway whereClause null-sentinel: `{completed_at: null}` is the
      // terminal-transition CAS (`completed_at IS NULL`). A terminal winner
      // already in the tracked store makes the guarded write a zero-change
      // loss (first-terminal-wins; audit finding 6).
      if (
        Object.hasOwn(whereClause, 'completed_at') &&
        whereClause.completed_at === null &&
        operationId
      ) {
        const existingRow = trackedOperations.get(operationId);
        if (
          existingRow &&
          existingRow.completed_at !== null &&
          existingRow.completed_at !== undefined
        ) {
          return {success: true, partitionResult: {affectedRows: 0}};
        }
      }
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
      if (sql.includes('INSERT OR IGNORE INTO storage_reservations')) {
        const [
          reservationId, operationId, entityType, entityId,
          partitionId, targetNodeId, estimatedBytes, amplificationFactor,
          status, reasonCode, createdAt, updatedAt, expiresAt,
        ] = params;
        if (trackedReservations.has(reservationId)) {
          return {success: true, affectedRows: 0, changes: 0};
        }
        trackedReservations.set(reservationId, {
          reservation_id: reservationId,
          operation_id: operationId,
          entity_type: entityType,
          entity_id: entityId,
          partition_id: partitionId,
          target_node_id: targetNodeId,
          estimated_bytes: estimatedBytes,
          amplification_factor: amplificationFactor,
          status,
          reason_code: reasonCode,
          created_at: createdAt,
          updated_at: updatedAt,
          expires_at: expiresAt,
          released_at: null,
        });
        return {success: true, affectedRows: 1, changes: 1};
      }

      if (sql.includes('INSERT INTO replica_operations')) {
        const [
          operationId, type, partitionId, replicaId, targetClaimKey,
          sourceNodeId, targetNodeId,
          status, workflowStep, createdAt, updatedAt, completedAt, errorMessage,
          stepsHistory, entityType, entityId, membershipPublicationEpoch,
        ] = params;

        syncReplicaOperationRow({
          operation_id: operationId,
          type,
          partition_id: partitionId,
          replica_id: replicaId,
          target_claim_key: targetClaimKey,
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
          membership_publication_epoch: membershipPublicationEpoch,
        });
        return {success: true, affectedRows: 1, changes: 1};
      }

      if (sql.includes('UPDATE storage_reservations')) {
        const [status, updatedAt, releasedAt, reservationId, expectedStatus] =
          params;
        const existing = trackedReservations.get(reservationId);
        if (!existing || existing.status !== expectedStatus) {
          return {success: true, affectedRows: 0, changes: 0};
        }
        trackedReservations.set(reservationId, {
          ...existing,
          status,
          updated_at: updatedAt,
          released_at: releasedAt,
        });
        return {success: true, affectedRows: 1, changes: 1};
      }

      // Handle UPDATE operations. The terminal-transition statement guards on
      // `completed_at IS NULL` (first-terminal-wins; audit finding 6): when
      // the tracked row is already terminal, the write changes zero rows
      // instead of clobbering the winning terminal — honestly reported as
      // affectedRows: 0 so the loser-adopts-winner path is exercisable.
      if (sql.includes('UPDATE replica_operations')) {
        const [
          status, workflowStep, updatedAt, completedAt, errorMessage,
          stepsHistory, replicaId, operationId,
        ] = params;

        if (sql.includes('completed_at IS NULL')) {
          const existingRow = trackedOperations.get(operationId);
          if (
            existingRow &&
            existingRow.completed_at !== null &&
            existingRow.completed_at !== undefined
          ) {
            return {success: true, affectedRows: 0, changes: 0};
          }
        }

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

      if (sql.includes('FROM storage_reservations')) {
        let rows = Array.from(trackedReservations.values());
        let paramIndex = 0;
        if (sql.includes('operation_id = ?')) {
          const operationId = params[paramIndex++];
          rows = rows.filter((row) => row.operation_id === operationId);
        }
        if (sql.includes('status = ?')) {
          const status = params[paramIndex++];
          rows = rows.filter((row) => row.status === status);
        }
        if (sql.includes('expires_at <= ?')) {
          const expiresAt = params[paramIndex++];
          rows = rows.filter((row) => row.expires_at <= expiresAt);
        }
        return {success: true, rows, rowSetComplete: true};
      }

      // Handle SELECT queries for replica_operations
      if (sql.includes('replica_operations')) {
        const allOps = Array.from(trackedOperations.values());

        let filteredOps = allOps;
        const equalityFilters = [
          {pattern: 'operation_id = ?', field: 'operation_id'},
          {pattern: 'target_claim_key = ?', field: 'target_claim_key'},
          {pattern: 'partition_id = ?', field: 'partition_id'},
          {pattern: 'target_node_id = ?', field: 'target_node_id'},
          {pattern: 'source_node_id = ?', field: 'source_node_id'},
          {pattern: 'entity_type = ?', field: 'entity_type'},
          {pattern: 'entity_id = ?', field: 'entity_id'},
        ]
          .map((filter) => ({...filter, index: sql.indexOf(filter.pattern)}))
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

        return {success: true, rows: filteredOps, rowSetComplete: true};
      }

      if (sql.includes('FROM services')) {
        let serviceRows = typeof mockCache.getAll === 'function' ?
          mockCache.getAll(SYSTEM_TABLE_NAME.SERVICES) : [];
        let paramIndex = 0;
        if (sql.includes('service_id = ?')) {
          const serviceId = params[paramIndex++];
          serviceRows = serviceRows.filter((row) => row.service_id === serviceId);
        }
        if (sql.includes('service_type = ?')) {
          const serviceType = params[paramIndex++];
          serviceRows = serviceRows.filter((row) => row.service_type === serviceType);
        }
        if (sql.includes('partition_id = ?')) {
          const partitionId = params[paramIndex++];
          serviceRows = serviceRows.filter((row) => row.partition_id === partitionId);
        }
        if (sql.includes('group_id = ?')) {
          const groupId = params[paramIndex++];
          serviceRows = serviceRows.filter((row) => row.group_id === groupId);
        }
        if (sql.includes('service_id LIKE ?')) {
          const serviceIdPattern = String(params[paramIndex++] || '');
          const serviceIdPrefix = serviceIdPattern.endsWith('%') ?
            serviceIdPattern.slice(0, -1) : serviceIdPattern;
          serviceRows = serviceRows.filter((row) =>
            String(row.service_id || '').startsWith(serviceIdPrefix));
        }
        return {
          success: true,
          rows: serviceRows,
          rowSetComplete: true,
          readAuthorityWitness: buildMockPolicyAuthorityWitness('services-p1'),
        };
      }

      return {success: true, rows: [], rowSetComplete: true};
    },
  };
  const controlPlaneSystemTableGateway =
    options.controlPlaneSystemTableGateway || {
      readAuthoritativeRows: async (tableName, sql, params = []) =>
        withAuthoritativeReadDefaults(tableName, await mockSqlEngine.executeQuery(sql, params)),
      readRows: async (_tableName, sql, params = []) => mockSqlEngine.executeQuery(sql, params),
      executeQuery: async (sql, params = []) => mockSqlEngine.executeQuery(sql, params),
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
    // Named: completed by the one fixture completer (frozen ports kept).
    controlPlaneReadinessService: Object.hasOwn(options, 'controlPlaneReadinessService') ?
      (options.controlPlaneReadinessService ?
        readinessServiceFake(options.controlPlaneReadinessService) :
        options.controlPlaneReadinessService) :
      createMockControlPlaneReadinessService({
        ...options.readinessFixture,
        systemTableCache: mockCache,
      }),
    storageAdmissionService: options.storageAdmissionService || createMockStorageAdmissionService(),
    storageAccountingService: options.storageAccountingService || {
      estimateReplicaBytes: () => 1,
    },
    enableTimeouts,
    setTimeoutFn: options.setTimeoutFn,
    clearTimeoutFn: options.clearTimeoutFn,
    replicaOperationDispatchTimeoutMs:
      options.replicaOperationDispatchTimeoutMs,
  });

  if (options.enableFailedCreateCleanupReleaseRecovery !== true) {
    // Generic coordinator fixtures isolate the behavior under test from the
    // independent startup cleanup-release census. Dedicated recovery tests
    // opt in explicitly and exercise its authoritative read/retry owner.
    coordinator.workflowOwner.repository
      .queryTerminalFailedCreateCleanupOperations = async () => [];
  }
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
  // Named/coordinator-held: completed on the rebalancer's clock.
  const ownerClock = typeof options.nowFn === 'function' ? options.nowFn : undefined;
  const namedReadinessService = Object.hasOwn(options, 'controlPlaneReadinessService') ?
    options.controlPlaneReadinessService :
    options.rebalanceCoordinator?.controlPlaneReadinessService ?? null;
  const controlPlaneReadinessService = namedReadinessService ?
    readinessServiceFake(namedReadinessService, ownerClock) :
    createMockControlPlaneReadinessService({
      ...(ownerClock ? {now: ownerClock} : {}),
      ...options.readinessFixture,
      systemTableCache: mockCache,
    });
  const mockCoordinator = options.rebalanceCoordinator ||
    createMockCoordinator({controlPlaneReadinessService});
  const storageAdmissionService = options.storageAdmissionService ||
    mockCoordinator.storageAdmissionService || createMockStorageAdmissionService();
  const storageAccountingService = options.storageAccountingService ||
    mockCoordinator.storageAccountingService || {
    estimateReplicaBytes: () => 1,
  };
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
    nowFn: options.nowFn,
    // Timer seams: forwarded so a suite can hand the planner an explicit
    // clock. Omitted by default, which leaves the ambient late-bound pair.
    setTimeoutFn: options.setTimeoutFn,
    clearTimeoutFn: options.clearTimeoutFn,
  });
}

// Shared spread-restoration scenario helpers: the critical-spread stall-repro
// and cure-minting suites drive the same planner surface over different
// partitions, so the row builders and admission stubs live here once,
// parameterized by each suite's scenario constants.
function initializeSpreadTestEnvironment(nodeId) {
  ConfigurationManager.resetInstance();
  const config = ConfigurationManager.getInstance();
  if (!config.isInitialized()) {
    config.initialize({
      node: {id: nodeId},
      logging: {level: 'error'},
    });
  }

  const logging = LoggingService.getInstance();
  if (!logging.isInitialized()) {
    logging.initialize({level: 'error'});
  }
}

function buildSpreadScenarioHelpers({
  partitionId,
  serviceType,
  addressPrefix,
  freeNodeIds,
}) {
  return {
    createNodeRow(nodeId) {
      return {
        node_id: nodeId,
        status: NodeStatus.ACTIVE,
      };
    },
    createReplicaRow(replicaId, nodeId, raftRole) {
      return {
        service_id: replicaId,
        service_type: serviceType,
        node_id: nodeId,
        partition_id: partitionId,
        replica_id: replicaId,
        address: addressPrefix + replicaId,
        raft_role: raftRole,
        status: ReplicaStatus.ACTIVE,
      };
    },
    isSpreadRestoringOperationRow(operationRow) {
      const operationType = String(
        operationRow?.type || '',
      ).toLowerCase();
      const targetNodeId =
        operationRow?.target_node_id || operationRow?.targetNodeId || null;
      return (
        (operationType === MoveType.ADD ||
          operationType === MoveType.REPLACE) &&
        freeNodeIds.includes(targetNodeId)
      );
    },
  };
}

// The planner checks `result.decision === 'allow'` while coordinator-side
// callers check `allowed`/`decisionType`; provide both shapes so storage
// capacity never interferes.
function createAllowAllStorageAdmissionService() {
  const allow = async () => ({decision: 'allow', allowed: true, decisionType: 'admitted'});
  return {checkAdd: allow, checkReplace: allow, checkSplit: allow};
}

function isAddLikeMoveResult(moveResult) {
  return moveResult?.operation === MoveType.ADD || moveResult?.operation === MoveType.REPLACE;
}

function installActualReplicaObservationResolver(coordinator, resolver) {
  const repository = coordinator.repository;
  const originalObservation = repository.getActualReplicaObservation.bind(repository);
  const resolveStatus = typeof resolver === 'function' ? resolver : async () => resolver;
  repository.getActualReplicaObservation = async (...args) => {
    const lifecycleStatus = await resolveStatus(...args);
    if (lifecycleStatus === undefined) {
      return originalObservation(...args);
    }
    return lifecycleStatus === null ?
      Object.freeze({state: 'absent', source: 'authoritative'}) :
      Object.freeze({state: 'observed', source: 'authoritative', lifecycleStatus});
  };
}

export {
  buildMockPolicyAuthorityWitness, buildSpreadScenarioHelpers,
  createAllowAllStorageAdmissionService, createMockCache, createMockCdcService,
  createMockControlPlaneSystemTableGateway, createMockTransactionCoordinator,
  createMockPolicyService, createMockMessageRouter, createMockSqlQueryEngine,
  createMockControlPlaneReadinessService, createMockCoordinator, createMockReplicaHandler,
  createMockRpcClient, createTestCoordinator, createTestRebalancer,
  initializeSpreadTestEnvironment, installActualReplicaObservationResolver,
  isAddLikeMoveResult, withSuccessfulStorageReservationInsert, withFixtureReplaceWitness,
};
