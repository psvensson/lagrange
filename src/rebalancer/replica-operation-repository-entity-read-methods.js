const LOCAL_STR_CONSTRUCTOR = 'constructor';

function assignReplicaOperationRepositoryEntityReadMethods(
  ReplicaOperationRepository,
  options = {},
) {
  const {
    ENTITY_OPERATION_VISIBILITY_OUTCOME_SOURCE,
    NUM,
    OperationType,
    REPLICA_OPERATION_REPOSITORY_LITERAL,
    REPLICA_OPERATION_VISIBILITY_READ_MODE,
    REPLICA_OPERATION_VISIBILITY_READ_QUERY_OPTIONS,
    SERVICE_TYPE,
    SQL,
    SYSTEM_TABLE_NAME,
    TYPEOF,
    UNIFIED_SERVICE_TYPE,
    buildReplicaOperationVisibilityReadOptions,
    resolveReplicaOperationVisibilityReadMode,
  } = options;

  class ReplicaOperationRepositoryEntityReadMethods {
    /**
   * Get in-flight replica IDs for an entity.
   * @param {object} params
   * @param {string} params.partitionId
   * @param {string} params.entityType
   * @param {string} params.entityId
   * @return {Promise<Set<string>>}
   */
    async getEntityInFlightReplicaIds({partitionId, entityType, entityId}) {
      const replicaIds = new Set();
      const result = await this.executeReplicaOperationsRead(SQL.SELECT_OPERATIONS_BY_ENTITY, [
        entityType,
        entityId,
        entityId,
      ]);
      if (result.success && Array.isArray(result.rows)) {
        for (const row of result.rows) {
          const operation = this.rowToOperation(row);
          if (!operation || this.isOperationTerminal(operation)) {
            continue;
          }
          const replicaId = operation.replicaId;
          if (typeof replicaId === TYPEOF.STRING && replicaId.length > NUM.ZERO) {
            replicaIds.add(replicaId);
          }
        }
        return replicaIds;
      } // Fallback path for degraded SQL-read conditions.
      const cachedRows = this.filterReplicaOperationRowsFromCache((row) => {
        if (!row) {
          return false;
        }
        return (
          (row.entity_type === entityType && row.entity_id === entityId) ||
        ((row.entity_type === null || row.entity_type === undefined || row.entity_type === '') &&
          row.partition_id === partitionId)
        );
      });
      if (cachedRows === null) {
        return replicaIds;
      }
      for (const row of cachedRows) {
        const operation = this.rowToOperation(row);
        if (!operation || this.isOperationTerminal(operation)) {
          continue;
        }
        const replicaId = operation.replicaId;
        if (typeof replicaId === TYPEOF.STRING && replicaId.length > NUM.ZERO) {
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
            const leftCreatedAt = Number(left?.created_at) || NUM.ZERO;
            const rightCreatedAt = Number(right?.created_at) || NUM.ZERO;
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
        return (
          (row.entity_type === entityType && row.entity_id === entityId) ||
        ((row.entity_type === null || row.entity_type === undefined || row.entity_type === '') &&
          row.partition_id === entityId)
        );
      });
      if (cachedRows !== null) {
        return cachedRows.map((row) => this.rowToOperation(row));
      }
      const result = await this.executeReplicaOperationsRead(SQL.SELECT_OPERATIONS_BY_ENTITY, [
        entityType,
        entityId,
        entityId,
      ]);
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
        [entityType, entityId, entityId],
        REPLICA_OPERATION_VISIBILITY_READ_QUERY_OPTIONS,
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
          priorityRecoveryActive: this.shouldDeferIncompleteOperationReadFailure(
            result,
            planningSnapshot,
            {
              cachedOperations,
              fallbackOperations,
            },
          ),
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
          cachedCount > NUM.ZERO ||
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
        return NUM.ZERO;
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
      if (!this.systemTableCache || typeof this.systemTableCache.filter !== TYPEOF.FUNCTION) {
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
            return row.service_id === entityId;
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
      if (!this.systemTableCache || typeof this.systemTableCache.filter !== TYPEOF.FUNCTION) {
        return [];
      }
      return (
        this.systemTableCache.filter(SYSTEM_TABLE_NAME.REPLICA_OPERATIONS, (row) => {
          if (!row || this.isOperationTerminal(row)) {
            return false;
          }
          const rowEntityType = row.entity_type || SERVICE_TYPE.PARTITION;
          const rowEntityId = row.entity_id || row.partition_id;
          return rowEntityType === entityType && rowEntityId === entityId;
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
