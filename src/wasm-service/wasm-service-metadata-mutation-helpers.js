// How a WASM service replica publishes its role and its group's leader node
// to its services row: each value flows through an authoritative row
// mutation helper whose transport is the replica's own owner writer.

import {AuthoritativeRowMutationHelper} from
  '../raft/authoritative-row-mutation-helper.js';
import {COLUMN, TABLES} from '../constants/index.js';
import {SYSTEM_TABLE_NAME} from '../bootstrap/system-table-schemas-constants.js';

const LOCAL_STR_STRING = 'string';

const METADATA_FLUSH_RETRY_DELAY_MS = 250;

const FLUSH_REASON_NOT_OWNER = 'not-owner';
const FLUSH_REASON_READY = 'ready';

const METADATA_FLUSH_LOG_MSG = Object.freeze({
  ROLE_RETRY_FAILED: 'WASM role update retry failed',
  LEADER_RETRY_FAILED: 'WASM leader-node update retry failed',
});

/**
 * The replica's services row as cached.
 * @param {Object} replica - The WASM service replica.
 * @param {Object} systemTableCache - The system table cache.
 * @return {Object|null} The row.
 */
function cachedServiceRow(replica, systemTableCache) {
  return systemTableCache?.get?.(TABLES.SERVICES, replica.replicaId) || null;
}

/**
 * The compare-and-set guard of a services-row update: the row's identity
 * plus the cached column value and update time it replaces.
 * @param {Object} replica - The WASM service replica.
 * @param {string} column - The published column.
 * @param {Object} cachedRow - The cached row, if any.
 * @return {Object} The where clause.
 */
function serviceRowWhereClause(replica, column, cachedRow) {
  const whereClause = {[COLUMN.SERVICE_ID]: replica.replicaId};
  if (typeof cachedRow?.[column] === LOCAL_STR_STRING &&
    cachedRow[column].length > 0) {
    whereClause[column] = cachedRow[column];
  }
  if (Number.isFinite(cachedRow?.[COLUMN.UPDATED_AT])) {
    whereClause[COLUMN.UPDATED_AT] = cachedRow[COLUMN.UPDATED_AT];
  }
  return whereClause;
}

/**
 * The helper that publishes the replica's raft role.
 * @param {Object} replica - The WASM service replica.
 * @return {AuthoritativeRowMutationHelper} The helper.
 */
function createWasmServiceRoleMutationHelper(replica) {
  return new AuthoritativeRowMutationHelper({
    tableName: SYSTEM_TABLE_NAME.SERVICES,
    buildWhereClause: (_role, context = {}) =>
      serviceRowWhereClause(replica, COLUMN.RAFT_ROLE, context.cachedRow),
    buildUpdateData: (role, updatedAt) => ({
      [COLUMN.RAFT_ROLE]: role,
      [COLUMN.UPDATED_AT]: updatedAt,
    }),
    buildExpectedCacheFields: (role) => ({[COLUMN.RAFT_ROLE]: role}),
    readRowFromCache: (systemTableCache) =>
      cachedServiceRow(replica, systemTableCache),
    readValueFromCache: (systemTableCache) =>
      cachedServiceRow(replica, systemTableCache)?.[COLUMN.RAFT_ROLE] || null,
    isWriteReady: () => replica.isServicesLeaderAvailable(),
    retryDelayMs: METADATA_FLUSH_RETRY_DELAY_MS,
    systemTableCache: replica.systemTableCache,
    cdcIntegrationService: {
      updateSystemTableRow: async (_tableName, _whereClause, data,
        options = {}) => replica.writeRoleUpdate(
        data?.[COLUMN.RAFT_ROLE], data?.[COLUMN.UPDATED_AT], options),
    },
    onAsyncError: (error, context = {}) => {
      replica.logger.warn(METADATA_FLUSH_LOG_MSG.ROLE_RETRY_FAILED, {
        replicaId: replica.replicaId,
        role: context.value ?? replica.pendingRoleUpdate,
        error: error.message,
      });
    },
  });
}

/**
 * The helper that publishes this node as the group's leader node; only the
 * leading replica flushes it.
 * @param {Object} replica - The WASM service replica.
 * @return {AuthoritativeRowMutationHelper} The helper.
 */
function createWasmServiceLeaderNodeMutationHelper(replica) {
  return new AuthoritativeRowMutationHelper({
    tableName: SYSTEM_TABLE_NAME.SERVICES,
    buildWhereClause: (_leaderNodeId, context = {}) =>
      serviceRowWhereClause(replica, COLUMN.NODE_ID, context.cachedRow),
    buildUpdateData: (leaderNodeId, updatedAt) => ({
      [COLUMN.NODE_ID]: leaderNodeId,
      [COLUMN.RAFT_ROLE]: replica.role,
      [COLUMN.UPDATED_AT]: updatedAt,
    }),
    buildExpectedCacheFields: (leaderNodeId) => ({
      [COLUMN.NODE_ID]: leaderNodeId,
      [COLUMN.RAFT_ROLE]: replica.role,
    }),
    readRowFromCache: (systemTableCache) =>
      cachedServiceRow(replica, systemTableCache),
    readValueFromCache: (systemTableCache) =>
      cachedServiceRow(replica, systemTableCache)?.[COLUMN.NODE_ID] || null,
    prepareFlush: () => ({
      skip: !replica.isLeader,
      clearPending: !replica.isLeader,
      reason: replica.isLeader ? FLUSH_REASON_READY : FLUSH_REASON_NOT_OWNER,
    }),
    isWriteReady: () => replica.isServicesLeaderAvailable(),
    retryDelayMs: METADATA_FLUSH_RETRY_DELAY_MS,
    systemTableCache: replica.systemTableCache,
    cdcIntegrationService: {
      updateSystemTableRow: async (_tableName, _whereClause, data,
        options = {}) => replica.writeLeaderNodeUpdate(
        data?.[COLUMN.NODE_ID], data?.[COLUMN.UPDATED_AT],
        data?.[COLUMN.RAFT_ROLE], options),
    },
    onAsyncError: (error, context = {}) => {
      replica.logger.warn(METADATA_FLUSH_LOG_MSG.LEADER_RETRY_FAILED, {
        replicaId: replica.replicaId,
        leaderNodeId: context.value ?? replica.pendingLeaderNodeUpdate,
        error: error.message,
      });
    },
  });
}

export {
  createWasmServiceLeaderNodeMutationHelper,
  createWasmServiceRoleMutationHelper,
};
