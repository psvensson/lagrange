import {PARTITION_SERVICE_SHARED} from './partition-service-shared.js';
import {
  classifySystemPartition,
} from '../bootstrap/system-partition-classification.js';
import {
  isCriticalLeaderPublication,
} from './partition-leader-publication-criticality.js';
import {CONTROL_PLANE_AUTHORITATIVE_READ_MODE} from
  '../control-plane/control-plane-system-table-gateway-constants.js';

const {
  AuthoritativeRowMutationHelper,
  COLUMN,
  PARTITION_SERVICE_ERROR_MSG,
  PARTITION_SERVICE_LITERAL,
  PRESSURE_WORK_CLASS,
  SYSTEM_TABLE_NAME,
  TABLES,
} = PARTITION_SERVICE_SHARED;

// Loudness terminal for the leader-row publication (quest
// partition-leader-row-publication-integrity): after this many scheduled
// retries (~2 minutes at the 1s..30s capped backoff — the exact horizon
// run user-table-leader-placement-spread-20260811T052645Z starved
// through silently) the typed budget-exhausted event fires once; retry
// ownership continues at the capped cadence.
const LEADER_PUBLICATION_RETRY_BUDGET_ATTEMPTS = 8;

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
    buildRoleMutationReadOptions(owner),
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
    buildLeaderNodeMutationReadOptions(owner),
  );
  if (readResult?.success !== true) {
    return {supported: true, available: false, row: null};
  }
  const row = Array.isArray(readResult.rows) ?
    readResult.rows[0] || null :
    null;
  return {supported: true, available: true, row};
}

function buildMetadataMutationReadOptions(owner, deliveryOptions = {}) {
  return {
    ...deliveryOptions,
    // A replacement leader commonly runs on a node that does not host the
    // services/partitions system-table group. Owner-local-only confirmation
    // can therefore retry forever without ever reaching the CAS write.
    authoritativeReadMode:
      CONTROL_PLANE_AUTHORITATIVE_READ_MODE.OWNER_RPC_PREFERRED,
    routingReadinessDimension:
      owner.getMetadataPublicationReadinessDimension(),
  };
}

function buildRoleMutationDeliveryOptions(owner) {
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
    routingReadinessDimension:
      owner.getMetadataPublicationReadinessDimension(),
  };
}

function buildRoleMutationReadOptions(owner) {
  return buildMetadataMutationReadOptions(
    owner,
    buildRoleMutationDeliveryOptions(owner),
  );
}

// The authoritative point read that gates the CAS write shares the fate
// of the write lane: a divergence-suspected publication whose read rides
// the shed BACKGROUND lane parks forever without ever attempting the
// write. The cached row is the only observation available before the
// read, so the criticality owner judges it.
function buildLeaderNodeMutationReadOptions(owner) {
  const cachedRow = owner.systemTableCache?.get?.(
    TABLES.PARTITIONS,
    owner.partitionId,
  ) || null;
  const critical = isCriticalLeaderPublication({
    observedLeaderNodeId: cachedRow?.[COLUMN.LEADER_NODE_ID] ?? null,
    partitionId: owner.partitionId,
    publishingNodeId: owner.nodeId,
  });
  return buildMetadataMutationReadOptions(owner, {
    deliveryPriority: critical ?
      PARTITION_SERVICE_LITERAL.CRITICAL :
      owner.getMetadataPublicationDeliveryPriority(),
    workClass: critical ?
      PRESSURE_WORK_CLASS.CRITICAL :
      owner.getMetadataPublicationWorkClass(),
  });
}

function buildLeaderNodeMutationDeliveryOptions(
  owner,
  context = {},
  publishingNodeId = null,
) {
  const observedRow = context.authoritativeRow || context.cachedRow;
  const critical = isCriticalLeaderPublication({
    observedLeaderNodeId: observedRow?.[COLUMN.LEADER_NODE_ID] ?? null,
    partitionId: owner.partitionId,
    publishingNodeId: publishingNodeId ?? owner.nodeId,
  });
  return {
    deliveryPriority: critical ?
      PARTITION_SERVICE_LITERAL.CRITICAL :
      owner.getMetadataPublicationDeliveryPriority(),
    workClass: critical ?
      PRESSURE_WORK_CLASS.CRITICAL :
      owner.getMetadataPublicationWorkClass(),
    routingReadinessDimension:
      owner.getMetadataPublicationReadinessDimension(),
  };
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
    buildUpdateOptions: () => buildRoleMutationDeliveryOptions(owner),
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
    buildUpdateOptions: (leaderNodeId, _updateData, context) =>
      buildLeaderNodeMutationDeliveryOptions(owner, context, leaderNodeId),
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
    // The canonical gateway owns route readiness and returns a typed retryable
    // outcome. Pre-gating here on the same missing partitions leader prevents
    // a newly elected user partition from publishing the ownership needed to
    // finish its own bootstrap.
    isWriteReady: () => true,
    systemTableCache: owner.systemTableCache,
    cdcIntegrationService: owner.cdcIntegrationService,
    controlPlaneSystemTableGateway: owner.controlPlaneSystemTableGateway,
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
    // Silent-drop and silent-defer paths become typed events; the budget
    // hook is the loud terminal while retry ownership continues (quest
    // partition-leader-row-publication-integrity).
    onPendingDropped: (context = {}) => {
      owner.logger.warn(
        PARTITION_SERVICE_ERROR_MSG.LEADER_PUBLICATION_PENDING_DROPPED,
        {
          partitionId: owner.partitionId,
          replicaId: owner.replicaId,
          leaderNodeId: context.value,
          reason: context.reason,
          retryAttemptCount: context.retryAttemptCount,
        },
      );
    },
    onAuthoritativeProbeDeferred: (context = {}) => {
      owner.logger.warn(
        PARTITION_SERVICE_ERROR_MSG.LEADER_PUBLICATION_PROBE_DEFERRED,
        {
          partitionId: owner.partitionId,
          replicaId: owner.replicaId,
          leaderNodeId: context.value,
          cause: context.cause,
          error: context.error?.message || null,
          retryAttemptCount: context.retryAttemptCount,
        },
      );
    },
    onRetryBudgetExhausted: (context = {}) => {
      owner.logger.error(
        PARTITION_SERVICE_ERROR_MSG.LEADER_PUBLICATION_RETRY_BUDGET_EXHAUSTED,
        {
          partitionId: owner.partitionId,
          replicaId: owner.replicaId,
          leaderNodeId: context.value,
          attempts: context.attempts,
          nextDelayMs: context.nextDelayMs,
        },
      );
    },
    retryBudgetAttempts: LEADER_PUBLICATION_RETRY_BUDGET_ATTEMPTS,
  });
}

export {
  LEADER_PUBLICATION_RETRY_BUDGET_ATTEMPTS,
  buildLeaderNodeMutationDeliveryOptions,
  createLeaderNodeMutationHelper,
  createRoleMutationHelper,
};
