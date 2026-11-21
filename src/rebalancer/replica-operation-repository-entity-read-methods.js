import {assertOperationUpdateRecord, assertOperationUpdateSubject} from './replica-operation-update-outcome.js';
import {
  runtimeServiceReplicaBelongsToEntity,
} from './runtime-service-replica-identity.js';
import {isSameStrandedRemovePreimage} from './operation-workflow-stranded-remove-repair.js';
import {assertCanonicalRebalancerEntityIdentity} from './rebalancer-entity-identity.js';
import {isScopedPlacementLearnerRetirement} from
  './operation-workflow-placement-learner-retirement.js';
import {CONTROL_PLANE_READ_LEADER_MODE} from
  '../control-plane/control-plane-system-table-gateway-constants.js';
import {REPLICA_OPERATION_REPOSITORY_ERROR_CODE, REPLICA_OPERATION_REPOSITORY_ERROR_MSG} from
  './replica-operation-repository-constants.js';

const LOCAL_STR_CONSTRUCTOR = 'constructor';

function malformedEntityOperationRead() {
  return Object.assign(new TypeError(
    REPLICA_OPERATION_REPOSITORY_ERROR_MSG.ENTITY_OPERATION_OBSERVATION_MALFORMED,
  ), {reasonCode: REPLICA_OPERATION_REPOSITORY_ERROR_CODE.ENTITY_OPERATION_OBSERVATION_MALFORMED});
}

function incompleteEntityOperationRead(cause) {
  return Object.assign(new Error(
    REPLICA_OPERATION_REPOSITORY_ERROR_MSG.ENTITY_OPERATION_OBSERVATION_INCOMPLETE,
    {cause},
  ), {
    reasonCode: REPLICA_OPERATION_REPOSITORY_ERROR_CODE.ENTITY_OPERATION_OBSERVATION_INCOMPLETE,
  });
}

function assertRemoveArbitrationSubject(requested, durable) {
  assertOperationUpdateSubject(requested, durable);
  if (!Number.isFinite(durable.createdAt) || durable.createdAt !== requested.createdAt ||
      durable.replicaId !== requested.replicaId ||
      durable.workflowStep !== requested.workflowStep || durable.completedAt !== null) {
    throw malformedEntityOperationRead();
  }
  if (!isSameStrandedRemovePreimage(requested, durable)) assertOperationUpdateRecord(durable);
}

function assertEntityOperationRows(rows, entityType, entityId) {
  if (!Array.isArray(rows)) throw malformedEntityOperationRead();
  for (const [index, row] of rows.entries()) {
    if (!Object.hasOwn(rows, index) || !row || typeof row !== 'object' || Array.isArray(row) ||
        typeof row.operation_id !== 'string' || row.operation_id.trim().length === 0 ||
        row.entity_type !== entityType || row.entity_id !== entityId) {
      throw malformedEntityOperationRead();
    }
  }
}

const OWNER_TRANSITION_SUBJECT = Object.freeze({
  MATCHED: 'matched',
  NOT_APPLICABLE: 'not_applicable',
  MISMATCHED: 'mismatched',
});

function observeOwnerTransitionSubject(operation, transition) {
  if (!transition || operation === transition ||
      operation.completedAt !== null ||
      operation.createdAt !== transition.createdAt) {
    return {state: OWNER_TRANSITION_SUBJECT.NOT_APPLICABLE};
  }
  try {
    assertOperationUpdateSubject(operation, transition);
    return {state: OWNER_TRANSITION_SUBJECT.MATCHED};
  } catch (cause) {
    return Object.freeze({state: OWNER_TRANSITION_SUBJECT.MISMATCHED, cause});
  }
}

function describeTerminalCleanupReadFailure(result) {
  if (result?.error) return result.error;
  return REPLICA_OPERATION_REPOSITORY_ERROR_MSG
    .TERMINAL_FAILED_CREATE_CLEANUP_RECOVERY_READ_UNAVAILABLE;
}

function assignReplicaOperationRepositoryEntityReadMethods(
  ReplicaOperationRepository,
  options = {},
) {
  const {
    ENTITY_OPERATION_VISIBILITY_OUTCOME_SOURCE,
    OperationType,
    ReplicaStatus,
    ReplicaOperationField,
    REPLICA_OPERATION_OWNER_PREFERRED_READ_QUERY_OPTIONS,
    REPLICA_OPERATION_REPOSITORY_LITERAL,
    REPLICA_OPERATION_STRICT_VISIBILITY_QUERY_OPTIONS,
    REPLICA_OPERATION_VISIBILITY_READ_MODE,
    SERVICE_TYPE,
    SQL,
    SYSTEM_TABLE_NAME,
    UNIFIED_SERVICE_TYPE,
    WORKFLOW_STEP,
    buildReplicaOperationVisibilityReadOptions,
    resolveReplicaOperationVisibilityReadMode,
  } = options;
  const LOCAL_PREFERRED_AUTHORITATIVE_READ_OPTIONS = Object.freeze({
    ...REPLICA_OPERATION_STRICT_VISIBILITY_QUERY_OPTIONS,
    authoritativeReadMode: undefined,
    leaderMode: CONTROL_PLANE_READ_LEADER_MODE.PREFERRED,
    retryOnRetryableFailure: true,
  });

  class ReplicaOperationRepositoryEntityReadMethods {
    async queryTerminalReplicaCleanupOperations() {
      const result = await this.executeReplicaOperationsRead(
        SQL.SELECT_ALL_OPERATIONS,
        [],
        LOCAL_PREFERRED_AUTHORITATIVE_READ_OPTIONS,
      );
      if (!result.success || !Array.isArray(result.rows)) {
        throw new Error(describeTerminalCleanupReadFailure(result));
      }
      return result.rows.map((row) => this.rowToOperation(row))
        .filter((operation) => operation?.type === OperationType.REMOVE &&
          operation.workflowStep === WORKFLOW_STEP.REMOVED &&
          operation.status === ReplicaStatus.REMOVED &&
          (operation[ReplicaOperationField.FAILED_CREATE_TARGET_LIFECYCLE_PRECONDITION] ||
            isScopedPlacementLearnerRetirement(operation)));
    }
    /**
   * Get in-flight replica IDs for an entity.
   * @param {object} params
   * @param {string} params.entityType
   * @param {string} params.entityId
   * @return {Promise<Set<string>>}
   */
    async getEntityInFlightReplicaIds({entityType, entityId}) {
      const replicaIds = new Set();
      const result = await this.executeReplicaOperationsRead(
        SQL.SELECT_OPERATIONS_BY_ENTITY,
        [entityType, entityId],
        LOCAL_PREFERRED_AUTHORITATIVE_READ_OPTIONS,
      );
      if (!result.success || !Array.isArray(result.rows)) {
        throw new Error(
          result?.error || REPLICA_OPERATION_REPOSITORY_LITERAL
            .ENTITY_IN_FLIGHT_OPERATION_READ_UNAVAILABLE,
        );
      }
      for (const row of result.rows) {
        const operation = this.rowToOperation(row);
        if (!operation || this.isOperationTerminal(operation)) {
          continue;
        }
        const replicaId = operation.replicaId;
        if (typeof replicaId === 'string' && replicaId.length > 0) {
          replicaIds.add(replicaId);
        }
      }
      return replicaIds;
    }
    /**
   * Get all operations (cache-first, SQL fallback).
   * @return {Promise<Array>}
   */
    async getAllOperations() {
      const cachedRows = this.filterReplicaOperationRowsFromCache(() => true);
      if (cachedRows !== null) {
        return [...cachedRows]
          .sort((left, right) => {
            const leftCreatedAt = Number(left?.created_at) || 0;
            const rightCreatedAt = Number(right?.created_at) || 0;
            if (leftCreatedAt !== rightCreatedAt) {
              return rightCreatedAt - leftCreatedAt;
            }
            return String(
              right?.operation_id || REPLICA_OPERATION_REPOSITORY_LITERAL.VALUE,
            ).localeCompare(
              String(left?.operation_id || REPLICA_OPERATION_REPOSITORY_LITERAL.VALUE),
            );
          })
          .map((row) => this.rowToOperation(row));
      }
      const result = await this.executeReplicaOperationsRead(
        SQL.SELECT_ALL_OPERATIONS,
        [],
        REPLICA_OPERATION_OWNER_PREFERRED_READ_QUERY_OPTIONS,
      );
      if (!result.success || !result.rows) {
        return [];
      }
      return result.rows.map((row) => this.rowToOperation(row));
    }
    /**
   * Get operations for an entity (cache-first, SQL fallback).
   * @param {string} entityType
   * @param {string} entityId
   * @return {Promise<Array>}
   */
    async getOperationsByEntity(entityType, entityId) {
      const cachedRows = this.filterReplicaOperationRowsFromCache((row) => {
        if (!row) {
          return false;
        }
        return row.entity_type === entityType && row.entity_id === entityId;
      });
      if (cachedRows !== null) {
        return cachedRows.map((row) => this.rowToOperation(row));
      }
      const result = await this.executeReplicaOperationsRead(
        SQL.SELECT_OPERATIONS_BY_ENTITY,
        [entityType, entityId],
        REPLICA_OPERATION_OWNER_PREFERRED_READ_QUERY_OPTIONS,
      );
      if (!result.success || !result.rows) {
        return [];
      }
      return result.rows.map((row) => this.rowToOperation(row));
    }

    async readEntityOperationOwnerResult(entityType, entityId, leaderMode) {
      const result = await this.executeReplicaOperationsRead(
        SQL.SELECT_OPERATIONS_BY_ENTITY, [entityType, entityId],
        {...REPLICA_OPERATION_STRICT_VISIBILITY_QUERY_OPTIONS, leaderMode},
      );
      if (!result || typeof result.success !== 'boolean') throw malformedEntityOperationRead();
      if (result.success) assertEntityOperationRows(result.rows, entityType, entityId);
      return result;
    }

    // Effect arbitration requires a complete leader census, independent of
    // the separate projection policy below for planning and recovery.
    async readRequiredEntityOperationRows(entityType, entityId) {
      const result = await this.readEntityOperationOwnerResult(
        entityType, entityId, CONTROL_PLANE_READ_LEADER_MODE.REQUIRED,
      );
      if (!result.success || result.rowSetComplete !== true) {
        throw incompleteEntityOperationRead(result.error);
      }
      const ids = new Set(result.rows.map((row) => row.operation_id));
      if (ids.size !== result.rows.length) throw malformedEntityOperationRead();
      return result.rows;
    }

    async getRequiredOperationsByEntity(entityType, entityId) {
      const rows = await this.readRequiredEntityOperationRows(entityType, entityId);
      return rows.map((row) => assertOperationUpdateRecord(this.rowToOperation(row)));
    }

    // Prove the subject and evaluate all its competitors from the same
    // complete leader snapshot. The historical stranded REMOVE is a repair
    // preimage, never a valid operation result or a competing holder.
    async getRequiredRemoveArbitrationCompetitors(operation) {
      const {entityType, entityId} = assertCanonicalRebalancerEntityIdentity(operation);
      const rows = await this.readRequiredEntityOperationRows(entityType, entityId);
      const own = rows.find((row) => row.operation_id === operation.operationId);
      if (!own) throw incompleteEntityOperationRead();
      assertRemoveArbitrationSubject(operation, this.rowToOperation(own));
      return rows.filter((row) => row !== own)
        .map((row) => assertOperationUpdateRecord(this.rowToOperation(row)));
    }

    /**
   * Get operations for an entity from the authoritative replica_operations
   * owner path without consulting the cache projection first.
   * @param {string} entityType
   * @param {string} entityId
   * @return {Promise<Object>}
   */
    async getOperationsByEntityAuthoritativeObservation(entityType, entityId) {
      const queryStartedAtMs = this.timeSource.now();
      const result = await this.readEntityOperationOwnerResult(
        entityType, entityId, CONTROL_PLANE_READ_LEADER_MODE.PREFERRED,
      );
      const completeRead = result.success && result.rowSetComplete === true;
      const queryDurationMs = this.timeSource.now() - queryStartedAtMs;
      const planningSnapshot = this.resolvePriorityRecoveryPlanningSnapshotForOwnerRead();
      const cachedRows = this.getEntityInFlightOperationRows({
        entityType,
        entityId,
      });
      assertEntityOperationRows(cachedRows, entityType, entityId);
      const cachedOperations = cachedRows.map((row) => this.rowToOperation(row));
      const ownerPersistedFallbackOperations =
      this.getOwnerPersistedTransitionVisibilityFallbackOperationsForEntity(
        entityType,
        entityId,
      );
      const fallbackOperations =
        this.reconcileEntityOperationVisibilityWithPersistedTransitions(
          this.mergeIncompleteOperationVisibilityOperations(
            cachedOperations,
            ownerPersistedFallbackOperations,
          ),
        );

      if (!completeRead) {
        const deferredOutcome = this.buildDeferredEntityOperationVisibilityOutcome({
          // This boundary requires the operation-ledger owner. An unavailable
          // owner cannot prove that the entity has no operation, even when a
          // readiness snapshot reports no active priority-recovery gap.
          priorityRecoveryActive: true,
          retryAfterMs: this.getRetryableReplicaOperationReadRetryDelayMs(result),
          cachedOperations: fallbackOperations,
          fallbackOperations,
          queryDurationMs,
          entityType,
          entityId,
          source:
          ENTITY_OPERATION_VISIBILITY_OUTCOME_SOURCE
            .PRIORITY_RECOVERY_AUTHORITATIVE_OPERATION_FAILURE,
        });
        if (deferredOutcome) {
          return this.buildEntityOperationVisibilityObservation(
            fallbackOperations,
            result.success ? {
              ...deferredOutcome,
              reasonCode: REPLICA_OPERATION_REPOSITORY_ERROR_CODE
                .ENTITY_OPERATION_OBSERVATION_INCOMPLETE,
            } : deferredOutcome,
          );
        }
        return this.buildEntityOperationVisibilityObservation([], null);
      }

      const operations = result.rows.map((row) => this.rowToOperation(row));
      if (this.shouldDeferEntityOperationEmptyRead(result, queryDurationMs, planningSnapshot)) {
        const deferredOutcome = this.buildDeferredEntityOperationVisibilityOutcome({
          priorityRecoveryActive: true,
          retryAfterMs: this.getRetryableReplicaOperationReadRetryDelayMs(result),
          cachedOperations: fallbackOperations,
          fallbackOperations,
          queryDurationMs,
          entityType,
          entityId,
          source:
          ENTITY_OPERATION_VISIBILITY_OUTCOME_SOURCE
            .PRIORITY_RECOVERY_AUTHORITATIVE_OPERATION_EMPTY_READ,
        });
        if (deferredOutcome) {
          return this.buildEntityOperationVisibilityObservation(
            fallbackOperations,
            deferredOutcome,
          );
        }
      }

      const observation = this.buildEntityOperationVisibilityObservation(operations, null);
      const ownerTransitionOperations = operations
        .map((operation) => this.resolveEntityOperationVisibilityWithPersistedTransition(operation))
        .filter((transition, index) =>
          observeOwnerTransitionSubject(operations[index], transition).state ===
            OWNER_TRANSITION_SUBJECT.MATCHED);
      // Local post-commit progress is tied to a row returned by this census.
      // It remains owner progress, separate from the census membership.
      return Object.freeze({...observation, ownerTransitionOperations});
    }

    /**
   * Get count of non-terminal REMOVE operations.
   * @param {object} [options={}]
   * @return {Promise<number>}
   */
    async getConcurrentRemoveCount(options = {}) {
      const visibilityReadMode = resolveReplicaOperationVisibilityReadMode(options);
      if (visibilityReadMode !== REPLICA_OPERATION_VISIBILITY_READ_MODE.OWNER_RPC_REQUIRED) {
        const cachedCount = this.queryCachedIncompleteOperations().filter(
          (operation) => operation?.type === OperationType.REMOVE,
        ).length;
        if (
          cachedCount > 0 ||
        visibilityReadMode === REPLICA_OPERATION_VISIBILITY_READ_MODE.CACHE_ONLY
        ) {
          return cachedCount;
        }
      }

      const result = await this.executeReplicaOperationsRead(
        SQL.SELECT_IN_FLIGHT_BY_TYPE,
        [OperationType.REMOVE],
        buildReplicaOperationVisibilityReadOptions(visibilityReadMode),
      );
      if (!result.success || !result.rows) {
        return 0;
      }

      return result.rows
        .map((row) => this.rowToOperation(row))
        .filter((op) => !this.isOperationTerminal(op)).length;
    }

    /**
   * Get service rows for an entity from cache.
   * @param {object} params
   * @param {string} params.partitionId
   * @param {string} params.entityType
   * @param {string} params.entityId
   * @return {Array}
   */
    getEntityServiceRows({partitionId, entityType, entityId}) {
      if (!this.systemTableCache || typeof this.systemTableCache.filter !== 'function') {
        return [];
      }
      return (
        this.systemTableCache.filter(SYSTEM_TABLE_NAME.SERVICES, (row) => {
          if (!row || row.service_type !== entityType) {
            return false;
          }
          if (entityType === SERVICE_TYPE.MESSAGE_GROUP) {
            return row.group_id === entityId;
          }
          if (entityType === UNIFIED_SERVICE_TYPE.RUNTIME_SERVICE) {
            return runtimeServiceReplicaBelongsToEntity(
              row.service_id,
              entityId,
            );
          }
          return row.partition_id === partitionId;
        }) || []
      );
    }

    /**
   * Get in-flight operation rows for an entity from cache.
   * @param {object} params
   * @param {string} params.entityType
   * @param {string} params.entityId
   * @return {Array}
   */
    getEntityInFlightOperationRows({entityType, entityId}) {
      if (!this.systemTableCache || typeof this.systemTableCache.filter !== 'function') {
        return [];
      }
      return (
        this.systemTableCache.filter(SYSTEM_TABLE_NAME.REPLICA_OPERATIONS, (row) => {
          if (!row || this.isOperationTerminal(row)) {
            return false;
          }
          return row.entity_type === entityType && row.entity_id === entityId;
        }) || []
      );
    }
  }

  for (
    const methodName of Object.getOwnPropertyNames(
      ReplicaOperationRepositoryEntityReadMethods.prototype,
    )
  ) {
    if (methodName === LOCAL_STR_CONSTRUCTOR) {
      continue;
    }
    Object.defineProperty(
      ReplicaOperationRepository.prototype,
      methodName,
      Object.getOwnPropertyDescriptor(
        ReplicaOperationRepositoryEntityReadMethods.prototype,
        methodName,
      ),
    );
  }
}

export {assignReplicaOperationRepositoryEntityReadMethods};
