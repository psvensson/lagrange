// The rebalancer fixtures' system table cache double (createMockCache): the
// tables a coordinator fixture reads, keyed as SystemTableCache keys them, and
// SystemTableCache's apply-time change channel over the double's own writes.
import {SYSTEM_TABLE_NAME} from '../../src/bootstrap/system-table-schemas-constants.js';
import {CACHE_ERROR_MSG, CACHE_LOG_MSG} from '../../src/cache/cache-constants.js';
import {CDC_OPERATION} from '../../src/constants/index.js';
import {LoggingService} from '../../src/logging/logging-service.js';
import {normalizeCauseId} from '../../src/utils/cause-id.js';

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

  // The apply-time change channel of SystemTableCache
  // (system-table-cache-observation-methods.js onCacheApplyChange,
  // offCacheApplyChange, notifyApplyListeners; system-table-cache.js
  // applySystemTableChange): after an accepted change, in the same turn, every
  // registered listener is called with (tableName, operation, a clone of the
  // row, frozen {causeId, tableMutationRevision, originHlc}); the row is the
  // stored row, or the removed row for a DELETE; a delete of a missing key
  // notifies nothing; a throwing listener is logged and the others still run.
  // This mock's rows change only through upsert (UPSERT), merge (UPDATE) and
  // delete (DELETE), so those are its notifications. A test that replaces a
  // reader (get, getAll, filter) changes what is read without a change: no
  // listener is told, and an owner listening here sees it only when it reads
  // again on its own. The deferred channel (onCacheChange, next turn) is not
  // modeled.
  const applyListeners = new Set();
  const tableMutationRevisions = new Map();
  function notifyApplyListeners(tableName, operation, row) {
    const tableMutationRevision = (tableMutationRevisions.get(tableName) ?? 0) + 1;
    tableMutationRevisions.set(tableName, tableMutationRevision);
    if (applyListeners.size === 0) return;
    const record = structuredClone(row);
    const metadata = Object.freeze({causeId: normalizeCauseId(null), tableMutationRevision,
      originHlc: row?.updated_at_hlc || row?.updatedAtHlc || null});
    for (const listener of applyListeners) {
      try {
        listener(tableName, operation, record, metadata);
      } catch (error) {
        LoggingService.getInstance().warn(CACHE_LOG_MSG.CACHE_LISTENER_ERROR,
          {error: error.message});
      }
    }
  }

  return {
    onCacheApplyChange(listener) {
      if (typeof listener !== 'function') {
        throw new Error(CACHE_ERROR_MSG.LISTENER_REQUIRED);
      }
      applyListeners.add(listener);
    },
    offCacheApplyChange: (listener) => applyListeners.delete(listener),
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
      notifyApplyListeners(tableName, CDC_OPERATION.UPSERT, normalizedRow);
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
      notifyApplyListeners(tableName, CDC_OPERATION.UPDATE, normalizedRow);
      return normalizedRow;
    },
    delete: (tableName, key) => {
      const table = getTable(tableName);
      if (!table || !table.has(key)) {
        return false;
      }
      const removed = table.get(key);
      table.delete(key);
      notifyApplyListeners(tableName, CDC_OPERATION.DELETE, removed);
      return true;
    },
  };
}

export {createMockCache, normalizeReplicaOperationRow};
