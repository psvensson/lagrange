import {
  runtimeServiceReplicaBelongsToEntity,
} from './runtime-service-replica-identity.js';
import {CONTROL_PLANE_READ_LEADER_MODE} from
  '../control-plane/control-plane-system-table-gateway-constants.js';

const LOCAL_STR_CONSTRUCTOR = 'constructor';

function assignReplicaOperationRepositoryEntityReadMethods(
  ReplicaOperationRepository,
  options = {},
) {
  const {
    ENTITY_OPERATION_VISIBILITY_OUTCOME_SOURCE,
    OperationType,
    REPLICA_OPERATION_REPOSITORY_LITERAL,
    REPLICA_OPERATION_STRICT_VISIBILITY_QUERY_OPTIONS,
    REPLICA_OPERATION_VISIBILITY_READ_MODE,
    SERVICE_TYPE,
    SQL,
    SYSTEM_TABLE_NAME,
    UNIFIED_SERVICE_TYPE,
    buildReplicaOperationVisibilityReadOptions,
    resolveReplicaOperationVisibilityReadMode,
  } = options;

  class ReplicaOperationRepositoryEntityReadMethods {
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
      const result = await this.executeReplicaOperationsRead(SQL.SELECT_ALL_OPERATIONS, []);
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
      );
      if (!result.success || !result.rows) {
        return [];
      }
      return result.rows.map((row) => this.rowToOperation(row));
    }

    /**
   * Get operations for an entity from the authoritative replica_operations
   * owner path without consulting the cache projection first.
   * @param {string} entityType
   * @param {string} entityId
   * @return {Promise<Array>}
   */
    async getOperationsByEntityAuthoritativeObservation(entityType, entityId) {
      const queryStartedAtMs = Date.now();
      const result = await this.executeReplicaOperationsRead(
        SQL.SELECT_OPERATIONS_BY_ENTITY,
        [entityType, entityId],
        {
          ...REPLICA_OPERATION_STRICT_VISIBILITY_QUERY_OPTIONS,
          leaderMode: CONTROL_PLANE_READ_LEADER_MODE.PREFERRED,
        },
      );
      const queryDurationMs = Date.now() - queryStartedAtMs;
      const planningSnapshot = this.resolvePriorityRecoveryPlanningSnapshotForOwnerRead();
      const cachedOperations = this.getEntityInFlightOperationRows({
        entityType,
        entityId,
      }).map((row) => this.rowToOperation(row));
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

      if (!result.success || !result.rows) {
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
            deferredOutcome,
          );
        }
        return this.buildEntityOperationVisibilityObservation([], null);
      }

      const operations =
        this.reconcileEntityOperationVisibilityWithPersistedTransitions(
          this.mergeIncompleteOperationVisibilityOperations(
            result.rows.map((row) => this.rowToOperation(row)),
            ownerPersistedFallbackOperations,
          ),
        );
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

      return this.buildEntityOperationVisibilityObservation(operations, null);
    }

    async getOperationsByEntityAuthoritative(entityType, entityId) {
      const observation = await this.getOperationsByEntityAuthoritativeObservation(
        entityType,
        entityId,
      );
      return Array.isArray(observation?.operations) ? observation.operations : [];
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
