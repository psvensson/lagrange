import {REBALANCE_COORDINATOR_SHARED} from './rebalance-coordinator-shared.js';
import {
  shouldLeaseRecentCompletedLedgerSelfMove,
} from './operation-ledger-hold-policy.js';

const {
  OperationType,
  PRIORITY_RECENT_INTENT_TTL_MS,
  ReplicaStatus,
  REPLICA_ID_SEPARATOR,
  REPLICA_ID_START_INDEX,
  SERVICE_TYPE,
  WORKFLOW_STEP,
  classifySystemPartition,
} = REBALANCE_COORDINATOR_SHARED;

const LOCAL_STR_STRING = 'string';
const LOCAL_STR_FUNCTION = 'function';
const CANONICAL_REPLICA_ID_DECIMAL_RADIX = 10;
const RETIRED_REPLACE_SOURCE_OPERATION_STATUSES = new Set([
  ReplicaStatus.REMOVED,
]);
const RETIRED_REPLACE_SOURCE_WORKFLOW_STEPS = new Set([
  WORKFLOW_STEP.REMOVED,
]);
const RELEASED_RECENT_REPLACE_TARGET_CACHE_STATUSES = new Set([
  ReplicaStatus.FAILED,
  ReplicaStatus.REMOVED,
]);
const TERMINAL_RECENT_REPLACE_TARGET_OWNER_STATUSES = new Set([
  ReplicaStatus.FAILED,
  ReplicaStatus.REMOVED,
]);
const REPLACE_SOURCE_RETIREMENT_SAFETY_STATE = Object.freeze({
  NOT_REPLACE: 'not_replace',
  SOURCE_UNAVAILABLE: 'source_unavailable',
  ENTITY_UNAVAILABLE: 'entity_unavailable',
  SOURCE_ACTIVE: 'source_active',
  SOURCE_RECENT_LEDGER_SELF_MOVE_LEASED:
    'source_recent_ledger_self_move_leased',
  SOURCE_RECENT_TARGET_LEASED: 'source_recent_target_leased',
  SOURCE_RETIRED: 'source_retired',
});
const REPLACE_SOURCE_RETIREMENT_SAFETY_ERROR_BY_STATE = Object.freeze({
  [REPLACE_SOURCE_RETIREMENT_SAFETY_STATE.SOURCE_RECENT_TARGET_LEASED]:
    'replace source replica is protected by a recent completed-target placement lease',
  [REPLACE_SOURCE_RETIREMENT_SAFETY_STATE
    .SOURCE_RECENT_LEDGER_SELF_MOVE_LEASED]:
    'operation-ledger REPLACE is protected by a recent completed self-move lease',
  [REPLACE_SOURCE_RETIREMENT_SAFETY_STATE.SOURCE_RETIRED]:
    'replace source replica already retired by completed operation',
});

function extractCanonicalReplicaIndex(replicaId, canonicalPrefix) {
  if (
    typeof replicaId !== LOCAL_STR_STRING ||
    replicaId.length === 0 ||
    typeof canonicalPrefix !== LOCAL_STR_STRING ||
    canonicalPrefix.length === 0 ||
    !replicaId.startsWith(canonicalPrefix)
  ) {
    return null;
  }
  const rawIndex = replicaId.slice(canonicalPrefix.length);
  if (rawIndex.length === 0) {
    return null;
  }
  const parsedIndex = Number.parseInt(
    rawIndex,
    CANONICAL_REPLICA_ID_DECIMAL_RADIX,
  );
  return Number.isInteger(parsedIndex) &&
    parsedIndex >= REPLICA_ID_START_INDEX ?
    parsedIndex :
    null;
}

function hasReplicaWithLifecycleStatus(
  serviceRows,
  sourceReplicaId,
  settledStatuses,
) {
  return serviceRows.some((row) => {
    const replicaId = String(
      row?.replica_id ||
      row?.replicaId ||
      row?.service_id ||
      row?.serviceId ||
      '',
    ).trim();
    const status = String(row?.status || '').trim().toLowerCase();
    return replicaId === sourceReplicaId && settledStatuses.has(status);
  });
}

function shouldLeaseRecentPriorityReplaceTarget({
  entityType,
  entityId,
  sourceReplicaId,
  recentCompletedTargetReplicaIds,
  placementLeaseReleased,
}) {
  return (
    entityType === SERVICE_TYPE.PARTITION &&
    classifySystemPartition({partitionId: entityId}).priorityControlPlane &&
    recentCompletedTargetReplicaIds.has(sourceReplicaId) &&
    placementLeaseReleased !== true
  );
}

class RebalanceCoordinatorReplicaIdentityMethods {
  async getEntityAllocatedOperationReplicaIds({entityType, entityId}) {
    const replicaIds = new Set();
    const authoritativeOperations =
      typeof this.repository?.getOperationsByEntityAuthoritative ===
      LOCAL_STR_FUNCTION ?
        await this.repository.getOperationsByEntityAuthoritative(
          entityType,
          entityId,
        ) :
        [];
    const cacheVisibleOperations =
      typeof this.repository?.getOperationsByEntity === LOCAL_STR_FUNCTION ?
        await this.repository.getOperationsByEntity(entityType, entityId) :
        [];
    for (const operations of [
      authoritativeOperations,
      cacheVisibleOperations,
    ]) {
      if (!Array.isArray(operations)) {
        continue;
      }
      for (const operation of operations) {
        this.addAllocatedOperationReplicaIds(replicaIds, operation);
      }
    }
    return replicaIds;
  }

  addAllocatedOperationReplicaIds(replicaIds, operation) {
    if (!operation) {
      return;
    }
    const operationReplicaId = operation.replicaId;
    if (
      typeof operationReplicaId === LOCAL_STR_STRING &&
      operationReplicaId.length > 0
    ) {
      replicaIds.add(operationReplicaId);
    }
    const sourceReplicaId =
      typeof this.getReplaceSourceReplicaId === LOCAL_STR_FUNCTION ?
        this.getReplaceSourceReplicaId(operation) :
        operation.sourceReplicaId;
    if (
      typeof sourceReplicaId === LOCAL_STR_STRING &&
      sourceReplicaId.length > 0
    ) {
      replicaIds.add(sourceReplicaId);
    }
  }

  async getEntityRetiredReplaceSourceReplicaIds({
    entityType,
    entityId,
    recentCompletedTargetReplicaIds = null,
  }) {
    const retiredSourceReplicaIds = new Set();
    const observedAtMs = this.nowFn();
    const authoritativeOperations =
      typeof this.repository?.getOperationsByEntityAuthoritative ===
      LOCAL_STR_FUNCTION ?
        await this.repository.getOperationsByEntityAuthoritative(
          entityType,
          entityId,
        ) :
        [];
    const cacheVisibleOperations =
      typeof this.repository?.getOperationsByEntity === LOCAL_STR_FUNCTION ?
        await this.repository.getOperationsByEntity(entityType, entityId) :
        [];
    for (const operations of [
      authoritativeOperations,
      cacheVisibleOperations,
    ]) {
      if (!Array.isArray(operations)) {
        continue;
      }
      for (const operation of operations) {
        this.addRetiredReplaceSourceReplicaId(
          retiredSourceReplicaIds,
          operation,
        );
        this.addRecentCompletedReplaceTargetReplicaId(
          recentCompletedTargetReplicaIds,
          operation,
          observedAtMs,
        );
      }
    }
    return retiredSourceReplicaIds;
  }

  addRetiredReplaceSourceReplicaId(retiredSourceReplicaIds, operation) {
    if (!this.isRetiredReplaceSourceOperation(operation)) {
      return;
    }
    const sourceReplicaId =
      typeof this.getReplaceSourceReplicaId === LOCAL_STR_FUNCTION ?
        this.getReplaceSourceReplicaId(operation) :
        operation.sourceReplicaId;
    if (
      typeof sourceReplicaId === LOCAL_STR_STRING &&
      sourceReplicaId.length > 0
    ) {
      retiredSourceReplicaIds.add(sourceReplicaId);
    }
  }

  isRetiredReplaceSourceOperation(operation) {
    if (!operation) {
      return false;
    }
    const operationType = this.normalizeMoveType(
      operation.type || operation.operation_type || operation.operationType,
    );
    const workflowStep =
      operation.workflowStep ?? operation.workflow_step ?? null;
    return (
      operationType === OperationType.REPLACE &&
      (
        RETIRED_REPLACE_SOURCE_OPERATION_STATUSES.has(operation.status) ||
        RETIRED_REPLACE_SOURCE_WORKFLOW_STEPS.has(workflowStep)
      )
    );
  }

  addRecentCompletedReplaceTargetReplicaId(
    recentTargetReplicaIds,
    operation,
    observedAtMs,
  ) {
    if (
      !(recentTargetReplicaIds instanceof Set) ||
      !this.isRetiredReplaceSourceOperation(operation)
    ) {
      return;
    }
    const completedAtMs = Number(
      operation.completedAt ??
      operation.completed_at ??
      operation.updatedAt ??
      operation.updated_at,
    );
    const completionAgeMs = observedAtMs - completedAtMs;
    const targetReplicaId = String(operation.replicaId || '').trim();
    if (
      targetReplicaId.length > 0 &&
      Number.isFinite(completedAtMs) &&
      completionAgeMs >= 0 &&
      completionAgeMs <= PRIORITY_RECENT_INTENT_TTL_MS
    ) {
      recentTargetReplicaIds.add(targetReplicaId);
    }
  }

  isRecentReplaceTargetPlacementLeaseReleased(
    cacheServiceRows,
    authoritativeServiceRows,
    sourceReplicaId,
  ) {
    return (
      hasReplicaWithLifecycleStatus(
        cacheServiceRows,
        sourceReplicaId,
        RELEASED_RECENT_REPLACE_TARGET_CACHE_STATUSES,
      ) ||
      hasReplicaWithLifecycleStatus(
        authoritativeServiceRows,
        sourceReplicaId,
        TERMINAL_RECENT_REPLACE_TARGET_OWNER_STATUSES,
      )
    );
  }

  buildReplaceSourceRetirementEvidence(move, context = {}) {
    return {
      moveType: this.normalizeMoveType(move?.type),
      sourceReplicaId:
        typeof move?.replicaId === LOCAL_STR_STRING ?
          move.replicaId.trim() :
          '',
      entityType:
        context.entityType || move?.entityType || SERVICE_TYPE.PARTITION,
      entityId:
        context.entityId || move?.entityId || move?.partitionId ||
        '',
    };
  }

  resolveReplaceSourceRetirementSafetyState(
    evidence,
    retiredSourceReplicaIds,
    recentCompletedTargetReplicaIds = new Set(),
    cacheServiceRows = [],
    authoritativeServiceRows = [],
  ) {
    if (evidence.moveType !== OperationType.REPLACE) {
      return REPLACE_SOURCE_RETIREMENT_SAFETY_STATE.NOT_REPLACE;
    }
    if (evidence.sourceReplicaId.length === 0) {
      return REPLACE_SOURCE_RETIREMENT_SAFETY_STATE.SOURCE_UNAVAILABLE;
    }
    if (
      typeof evidence.entityId !== LOCAL_STR_STRING ||
      evidence.entityId.length === 0
    ) {
      return REPLACE_SOURCE_RETIREMENT_SAFETY_STATE.ENTITY_UNAVAILABLE;
    }
    if (retiredSourceReplicaIds.has(evidence.sourceReplicaId)) {
      return REPLACE_SOURCE_RETIREMENT_SAFETY_STATE.SOURCE_RETIRED;
    }
    if (
      shouldLeaseRecentCompletedLedgerSelfMove({
        partitionId: evidence.entityId,
        recentCompletedReplaceCount: recentCompletedTargetReplicaIds.size,
      })
    ) {
      return REPLACE_SOURCE_RETIREMENT_SAFETY_STATE
        .SOURCE_RECENT_LEDGER_SELF_MOVE_LEASED;
    }
    if (
      shouldLeaseRecentPriorityReplaceTarget({
        entityType: evidence.entityType,
        entityId: evidence.entityId,
        sourceReplicaId: evidence.sourceReplicaId,
        recentCompletedTargetReplicaIds,
        placementLeaseReleased:
          this.isRecentReplaceTargetPlacementLeaseReleased(
            cacheServiceRows,
            authoritativeServiceRows,
            evidence.sourceReplicaId,
          ),
      })
    ) {
      return REPLACE_SOURCE_RETIREMENT_SAFETY_STATE
        .SOURCE_RECENT_TARGET_LEASED;
    }
    return REPLACE_SOURCE_RETIREMENT_SAFETY_STATE.SOURCE_ACTIVE;
  }

  async getRetiredReplaceSourceMoveSafetyError(move, context = {}) {
    const evidence = this.buildReplaceSourceRetirementEvidence(move, context);
    const shouldReadRetirementEvidence =
      evidence.moveType === OperationType.REPLACE &&
      evidence.sourceReplicaId.length > 0 &&
      typeof evidence.entityId === LOCAL_STR_STRING &&
      evidence.entityId.length > 0;
    const recentCompletedTargetReplicaIds = new Set();
    const retiredSourceReplicaIds = shouldReadRetirementEvidence ?
      await this.getEntityRetiredReplaceSourceReplicaIds({
        entityType: evidence.entityType,
        entityId: evidence.entityId,
        recentCompletedTargetReplicaIds,
      }) :
      new Set();
    const shouldReadRecentTargetServiceRows =
      evidence.entityType === SERVICE_TYPE.PARTITION &&
      classifySystemPartition({partitionId: evidence.entityId})
        .priorityControlPlane &&
      recentCompletedTargetReplicaIds.has(evidence.sourceReplicaId);
    let cacheServiceRows = [];
    let authoritativeServiceRows = [];
    if (shouldReadRecentTargetServiceRows) {
      cacheServiceRows = this.getEntityServiceRows({
        partitionId: evidence.entityId,
        entityType: evidence.entityType,
        entityId: evidence.entityId,
      });
      const authoritativeObservation =
        await this.getAuthoritativeEntityServiceRowsObservation({
          partitionId: evidence.entityId,
          entityType: evidence.entityType,
          entityId: evidence.entityId,
        });
      authoritativeServiceRows = authoritativeObservation.rows;
    }
    const safetyState = this.resolveReplaceSourceRetirementSafetyState(
      evidence,
      retiredSourceReplicaIds,
      recentCompletedTargetReplicaIds,
      cacheServiceRows,
      authoritativeServiceRows,
    );
    return REPLACE_SOURCE_RETIREMENT_SAFETY_ERROR_BY_STATE[safetyState] ||
      null;
  }

  async allocateCanonicalReplicaId({
    partitionId,
    entityType,
    entityId,
    excludeReplicaIds = [],
  }) {
    const usedReplicaIds = new Set();
    const serviceRows = this.getEntityServiceRows({
      partitionId,
      entityType,
      entityId,
    });
    const authoritativeServiceRows =
      await this.getAuthoritativeEntityServiceRows({
        partitionId,
        entityType,
        entityId,
      });
    const inFlightReplicaIds = await this.getEntityInFlightReplicaIds({
      partitionId,
      entityType,
      entityId,
    });
    const allocatedOperationReplicaIds =
      await this.getEntityAllocatedOperationReplicaIds({
        entityType,
        entityId,
      });
    for (const rows of [serviceRows, authoritativeServiceRows]) {
      for (const row of rows) {
        const replicaId = row?.service_id || row?.replica_id;
        if (
          typeof replicaId === LOCAL_STR_STRING &&
          replicaId.length > 0
        ) {
          usedReplicaIds.add(replicaId);
        }
      }
    }
    for (const replicaId of [
      ...inFlightReplicaIds,
      ...allocatedOperationReplicaIds,
      ...excludeReplicaIds,
    ]) {
      if (
        typeof replicaId === LOCAL_STR_STRING &&
        replicaId.length > 0
      ) {
        usedReplicaIds.add(replicaId);
      }
    }
    const canonicalPrefix = `${entityId}${REPLICA_ID_SEPARATOR}`;
    let highestObservedReplicaIndex = REPLICA_ID_START_INDEX - 1;
    for (const replicaId of usedReplicaIds) {
      const replicaIndex = extractCanonicalReplicaIndex(
        replicaId,
        canonicalPrefix,
      );
      if (
        Number.isInteger(replicaIndex) &&
        replicaIndex > highestObservedReplicaIndex
      ) {
        highestObservedReplicaIndex = replicaIndex;
      }
    }
    return `${canonicalPrefix}${highestObservedReplicaIndex + 1}`;
  }
}

function applyRebalanceCoordinatorReplicaIdentityMethods(targetClass) {
  const sourcePrototype =
    RebalanceCoordinatorReplicaIdentityMethods.prototype;
  for (const methodName of Object.getOwnPropertyNames(sourcePrototype)) {
    if (methodName === 'constructor') {
      continue;
    }
    const descriptor = Object.getOwnPropertyDescriptor(
      sourcePrototype,
      methodName,
    );
    Object.defineProperty(targetClass.prototype, methodName, descriptor);
  }
}

export {applyRebalanceCoordinatorReplicaIdentityMethods};
