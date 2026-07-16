import {PARTITION_SERVICE_SHARED} from './partition-service-shared.js';
import {
  classifySystemPartition,
} from '../bootstrap/system-partition-classification.js';

const {
  AuthoritativeRowMutationHelper,
  COLUMN,
  PARTITION_SERVICE_ERROR_MSG,
  PARTITION_SERVICE_LITERAL,
  PRESSURE_WORK_CLASS,
  SYSTEM_TABLE_NAME,
  TABLES,
} = PARTITION_SERVICE_SHARED;

function hasAuthoritativeReadOwner(gateway) {
  if (
    typeof gateway.resolveCdcIntegrationService !==
      PARTITION_SERVICE_LITERAL.FUNCTION ||
    typeof gateway.resolveSqlQueryEngine !==
      PARTITION_SERVICE_LITERAL.FUNCTION
  ) {
    return true;
  }
  const cdcIntegrationService = gateway.resolveCdcIntegrationService();
  const sqlQueryEngine = gateway.resolveSqlQueryEngine();
  return typeof cdcIntegrationService?.executeAuthoritativeSystemTableRead ===
    PARTITION_SERVICE_LITERAL.FUNCTION ||
    typeof sqlQueryEngine?.executeQuery === PARTITION_SERVICE_LITERAL.FUNCTION;
}

async function readAuthoritativeRoleRow(owner) {
  const gateway = owner.controlPlaneSystemTableGateway;
  if (
    typeof gateway?.readAuthoritativeRows !==
    PARTITION_SERVICE_LITERAL.FUNCTION
  ) {
    return {supported: false, available: false, row: null};
  }
  if (!hasAuthoritativeReadOwner(gateway)) {
    return {supported: false, available: false, row: null};
  }
  const readResult = await gateway.readAuthoritativeRows(
    SYSTEM_TABLE_NAME.SERVICES,
    PARTITION_SERVICE_LITERAL.SERVICES_ROW_POINT_READ_SQL,
    [owner.replicaId],
    {
      routingReadinessDimension:
        owner.getMetadataPublicationReadinessDimension(),
    },
  );
  if (readResult?.success !== true) {
    return {supported: true, available: false, row: null};
  }
  const row = Array.isArray(readResult.rows) ?
    readResult.rows[0] || null :
    null;
  return {supported: true, available: true, row};
}

async function readAuthoritativeLeaderRow(owner) {
  const gateway = owner.controlPlaneSystemTableGateway;
  if (
    typeof gateway?.readAuthoritativeRows !==
      PARTITION_SERVICE_LITERAL.FUNCTION
  ) {
    return {supported: false, available: false, row: null};
  }
  if (!hasAuthoritativeReadOwner(gateway)) {
    return {supported: false, available: false, row: null};
  }
  const readResult = await gateway.readAuthoritativeRows(
    SYSTEM_TABLE_NAME.PARTITIONS,
    PARTITION_SERVICE_LITERAL.PARTITIONS_ROW_POINT_READ_SQL,
    [owner.partitionId],
    {
      routingReadinessDimension:
        owner.getMetadataPublicationReadinessDimension(),
    },
  );
  if (readResult?.success !== true) {
    return {supported: true, available: false, row: null};
  }
  const row = Array.isArray(readResult.rows) ?
    readResult.rows[0] || null :
    null;
  return {supported: true, available: true, row};
}

function createRoleMutationHelper(owner) {
  return new AuthoritativeRowMutationHelper({
    tableName: SYSTEM_TABLE_NAME.SERVICES,
    buildWhereClause: (_role, context = {}) => {
      const whereClause = {service_id: owner.replicaId};
      // The merged cache may carry a newer local voter-ready seed, so prefer
      // the authoritative observation when building the durable CAS guard.
      const guardRow = context.authoritativeRow || context.cachedRow;
      if (
        typeof guardRow?.raft_role === 'string' &&
        guardRow.raft_role.length > 0
      ) {
        whereClause.raft_role = guardRow.raft_role;
      }
      if (Number.isFinite(guardRow?.updated_at)) {
        whereClause.updated_at = guardRow.updated_at;
      }
      return whereClause;
    },
    buildUpdateData: (role, updatedAt) => ({
      raft_role: role,
      updated_at: updatedAt,
    }),
    buildUpdateOptions: () => {
      const priorityPartition = classifySystemPartition({
        partitionId: owner.partitionId,
      }).priorityControlPlane;
      return {
        deliveryPriority: priorityPartition ?
          PARTITION_SERVICE_LITERAL.CRITICAL :
          PARTITION_SERVICE_LITERAL.BACKGROUND,
        workClass: priorityPartition ?
          PRESSURE_WORK_CLASS.CRITICAL :
          PRESSURE_WORK_CLASS.BACKGROUND,
        allowPressureDefer: !priorityPartition,
        routingReadinessDimension:
          owner.getMetadataPublicationReadinessDimension(),
      };
    },
    buildExpectedCacheFields: (role) => ({raft_role: role}),
    prepareFlush: () => ({
      skip: false,
      clearPending: false,
      reason: PARTITION_SERVICE_LITERAL.READY,
    }),
    readRowFromCache: (systemTableCache) =>
      systemTableCache?.get?.(TABLES.SERVICES, owner.replicaId) || null,
    readValueFromCache: (systemTableCache) => {
      const cached = systemTableCache?.get?.(
        TABLES.SERVICES,
        owner.replicaId,
      );
      return cached?.raft_role || null;
    },
    isWriteReady: () => owner.isServicesLeaderAvailable(),
    systemTableCache: owner.systemTableCache,
    cdcIntegrationService: owner.cdcIntegrationService,
    refreshObservedRow: () =>
      owner.refreshMetadataPublicationGuardRow(
        SYSTEM_TABLE_NAME.SERVICES,
        owner.replicaId,
      ),
    readAuthoritativeRow: () => readAuthoritativeRoleRow(owner),
    onObservedStateChanged: (context = {}) => {
      owner.logger.warn(
        PARTITION_SERVICE_ERROR_MSG.METADATA_PUBLICATION_GUARD_STALE,
        {
          tableName: SYSTEM_TABLE_NAME.SERVICES,
          partitionId: owner.partitionId,
          replicaId: owner.replicaId,
          role: context.value ?? owner.pendingRoleUpdate,
          retryAttemptCount: context.retryAttemptCount,
        },
      );
    },
    onAsyncError: (error, context = {}) => {
      owner.logger.warn(
        PARTITION_SERVICE_ERROR_MSG.PERSIST_RAFT_ROLE_FAILED,
        {
          partitionId: owner.partitionId,
          replicaId: owner.replicaId,
          role: context.value ?? owner.pendingRoleUpdate,
          error: error.message,
        },
      );
    },
  });
}

function createLeaderNodeMutationHelper(owner) {
  return new AuthoritativeRowMutationHelper({
    tableName: SYSTEM_TABLE_NAME.PARTITIONS,
    buildWhereClause: (_leaderNodeId, context = {}) => {
      const whereClause = {[COLUMN.PARTITION_ID]: owner.partitionId};
      // A locally won election can seed the merged cache before the durable
      // write lands.  That seed is visibility, not storage proof, so the CAS
      // must guard on the authoritative row when that read is available.
      const guardRow = context.authoritativeRow || context.cachedRow;
      if (
        typeof guardRow?.[COLUMN.LEADER_NODE_ID] === 'string' &&
        guardRow[COLUMN.LEADER_NODE_ID].length > 0
      ) {
        whereClause[COLUMN.LEADER_NODE_ID] = guardRow[COLUMN.LEADER_NODE_ID];
      }
      if (Number.isFinite(guardRow?.[COLUMN.UPDATED_AT])) {
        whereClause[COLUMN.UPDATED_AT] = guardRow[COLUMN.UPDATED_AT];
      }
      return whereClause;
    },
    buildUpdateData: (leaderNodeId, updatedAt) => ({
      [COLUMN.LEADER_NODE_ID]: leaderNodeId,
      [COLUMN.UPDATED_AT]: updatedAt,
    }),
    buildUpdateOptions: () => ({
      deliveryPriority: owner.getMetadataPublicationDeliveryPriority(),
      workClass: owner.getMetadataPublicationWorkClass(),
      allowPressureDefer: owner.shouldMetadataPublicationAllowPressureDefer(),
      routingReadinessDimension:
        owner.getMetadataPublicationReadinessDimension(),
    }),
    buildExpectedCacheFields: (leaderNodeId) => ({
      [COLUMN.LEADER_NODE_ID]: leaderNodeId,
    }),
    readRowFromCache: (systemTableCache) =>
      systemTableCache?.get?.(TABLES.PARTITIONS, owner.partitionId) || null,
    readValueFromCache: (systemTableCache) => {
      const cached = systemTableCache?.get?.(
        TABLES.PARTITIONS,
        owner.partitionId,
      );
      return cached?.[COLUMN.LEADER_NODE_ID] || null;
    },
    prepareFlush: () => ({
      skip: !owner.isLeader,
      clearPending: !owner.isLeader,
      reason: !owner.isLeader ?
        PARTITION_SERVICE_LITERAL.NOT_OWNER :
        PARTITION_SERVICE_LITERAL.READY,
    }),
    isWriteReady: () => owner.isPartitionsLeaderAvailable(),
    systemTableCache: owner.systemTableCache,
    cdcIntegrationService: owner.cdcIntegrationService,
    refreshObservedRow: () =>
      owner.refreshMetadataPublicationGuardRow(
        SYSTEM_TABLE_NAME.PARTITIONS,
        owner.partitionId,
      ),
    readAuthoritativeRow: () => readAuthoritativeLeaderRow(owner),
    onObservedStateChanged: (context = {}) => {
      owner.logger.warn(
        PARTITION_SERVICE_ERROR_MSG.METADATA_PUBLICATION_GUARD_STALE,
        {
          tableName: SYSTEM_TABLE_NAME.PARTITIONS,
          partitionId: owner.partitionId,
          replicaId: owner.replicaId,
          leaderNodeId: context.value ?? owner.pendingLeaderNodeUpdate,
          retryAttemptCount: context.retryAttemptCount,
        },
      );
    },
    onAsyncError: (error, context = {}) => {
      owner.logger.warn(
        PARTITION_SERVICE_ERROR_MSG.PERSIST_PARTITION_LEADER_FAILED,
        {
          partitionId: owner.partitionId,
          replicaId: owner.replicaId,
          leaderNodeId: context.value ?? owner.pendingLeaderNodeUpdate,
          error: error.message,
        },
      );
    },
  });
}

export {createLeaderNodeMutationHelper, createRoleMutationHelper};
