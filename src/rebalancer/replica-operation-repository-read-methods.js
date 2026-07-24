import {
  assignReplicaOperationRepositoryEntityReadMethods,
} from './replica-operation-repository-entity-read-methods.js';
import {
  assignReplicaOperationRepositoryIncompleteReadMethods,
} from './replica-operation-repository-incomplete-read-methods.js';

const LOCAL_STR_CONSTRUCTOR = 'constructor';
const REPLICA_OPERATION_READ_COALESCING_KEY_SEPARATOR = ':';
const REPLICA_OPERATION_READ_BY_ID_COALESCING_KEY_PREFIX =
  'replica-operation';
const REPLICA_OPERATION_OWNER_READ_COALESCING_KEY_PREFIX =
  'replica-operation-owner';
const REPLICA_OPERATION_ENTITY_READ_COALESCING_KEY_PREFIX =
  'replica-operation-entity';
const REPLICA_OPERATION_ENTITY_NODE_READ_COALESCING_KEY_PREFIX =
  'replica-operation-entity-node';
const REPLICA_OPERATION_READ_DELIVERY_SOURCE_PREFIX = 'control-plane:read';

function assignReplicaOperationRepositoryReadMethods(ReplicaOperationRepository, options = {}) {
  const {
    CONTROL_PLANE_AUTHORITATIVE_READ_MODE,
    CONTROL_PLANE_PARTICIPATION_KIND,
    INITIAL_PARTITION_IDS,
    REPLICA_OPERATION_LOCAL_VISIBILITY_READ_QUERY_OPTIONS,
    REPLICA_OPERATION_LOCAL_OWNER_READ_QUERY_OPTIONS,
    REPLICA_OPERATION_READ_RETRY_TIMEOUT_MS,
    REPLICA_OPERATION_READINESS_DIMENSION,
    REPLICA_OPERATION_REPOSITORY_LITERAL,
    REPLICA_OPERATION_STRICT_VISIBILITY_QUERY_OPTIONS,
    REPLICA_OPERATION_VISIBILITY_OUTCOME_SOURCE,
    REPLICA_OPERATION_VISIBILITY_READ_QUERY_OPTIONS,
    SQL,
    SYSTEM_TABLE_NAME,
    getControlPlaneRetryAfterMs,
    isCoordinatorOwnedOperationType,
    isRetryableControlPlaneError,
    readAuthoritativeControlPlaneRows,
    resolveAuthoritativeReadModeContract,
    shouldDeferReplicaOperationOwnerRead,
  } = options;

  class ReplicaOperationRepositoryReadMethods {
  /**
   * Execute a read query against the replica_operations table.
   * @param {string} sql
   * @param {Array} params
   * @return {Promise<object>}
   */
    async executeReplicaOperationsRead(sql, params = [], readOptions = null) {
      const participationFailure = this.buildReplicaOperationReadParticipationFailure();
      if (participationFailure) {
        return participationFailure;
      }

      const retryOnRetryableFailure = Boolean(
        readOptions &&
      typeof readOptions === 'object' &&
      readOptions.retryOnRetryableFailure === true,
      );
      const queryOptions =
      readOptions && typeof readOptions === 'object' ?
        {
          ...REPLICA_OPERATION_LOCAL_OWNER_READ_QUERY_OPTIONS,
          ...readOptions,
        } :
        {
          ...REPLICA_OPERATION_LOCAL_OWNER_READ_QUERY_OPTIONS,
        };
      const coalescingKey =
        this.resolveReplicaOperationReadCoalescingKey(sql, params);
      if (
        !queryOptions.coalescingKey &&
        typeof coalescingKey === 'string' &&
        coalescingKey.length > 0
      ) {
        queryOptions.coalescingKey = coalescingKey;
      }
      if (
        !queryOptions.deliverySource &&
        typeof queryOptions.coalescingKey === 'string' &&
        queryOptions.coalescingKey.length > 0
      ) {
        queryOptions.deliverySource =
          this.buildReplicaOperationReadDeliverySource(
            queryOptions.coalescingKey,
          );
      }

      delete queryOptions.retryOnRetryableFailure;

      const executeRead = async () => {
        return readAuthoritativeControlPlaneRows(
          this.controlPlaneSystemTableGateway,
          SYSTEM_TABLE_NAME.REPLICA_OPERATIONS,
          sql,
          params,
          queryOptions,
        );
      };

      if (!retryOnRetryableFailure) {
        return executeRead();
      }

      const deadlineAtMs = Date.now() + REPLICA_OPERATION_READ_RETRY_TIMEOUT_MS;
      while (true) {
        const result = await executeRead();
        if (result?.success !== false || !isRetryableControlPlaneError(result)) {
          return result;
        }

        const remainingMs = deadlineAtMs - Date.now();
        if (remainingMs <= 0) {
          return result;
        }
        // Stop re-arming the backoff once the owning coordinator is shutting
        // down (otherwise this retry timer keeps the event loop alive).
        if (typeof this.isShuttingDownRequested === 'function' &&
            this.isShuttingDownRequested()) {
          return result;
        }

        await this.waitForReplicaOperationReadRetry(
          Math.min(this.getRetryableReplicaOperationReadRetryDelayMs(result), remainingMs),
        );
      }
    }

    /**
   * Return a bounded deferred result when the canonical readiness owner says
   * the local replica_operations owner path should not issue a routed read yet.
   * @return {Object|null}
   * @private
   */
    buildReplicaOperationReadParticipationFailure() {
      if (
        !this.controlPlaneReadinessService ||
      typeof this.controlPlaneReadinessService.getControlPlaneParticipationSync !== 'function'
      ) {
        return null;
      }

      const participation = this.controlPlaneReadinessService.getControlPlaneParticipationSync(
        this.nodeId,
        {
          participationKind: CONTROL_PLANE_PARTICIPATION_KIND.REPLICA_OPERATION_OWNER_READ,
          decisionDimension: REPLICA_OPERATION_READINESS_DIMENSION,
          tableName: SYSTEM_TABLE_NAME.REPLICA_OPERATIONS,
          partitionId: INITIAL_PARTITION_IDS[SYSTEM_TABLE_NAME.REPLICA_OPERATIONS] || null,
        },
      );
      if (!participation || participation.eligible === true) {
        return null;
      }
      if (participation.localExecutionAllowed === true) {
        return null;
      }
      if (!shouldDeferReplicaOperationOwnerRead(participation)) {
        return null;
      }
      return {
        success: false,
        tableName: SYSTEM_TABLE_NAME.REPLICA_OPERATIONS,
        error:
        participation.error ||
        REPLICA_OPERATION_REPOSITORY_LITERAL
          .CONTROL_PLANE_PARTICIPATION_DEFERRED_BY_CANONICAL_READINESS,
        errorCode: participation.errorCode || null,
        code: participation.errorCode || null,
        reasonCode: participation.reasonCode || null,
        participationKind: participation.participationKind || null,
        retryAfterMs: getControlPlaneRetryAfterMs(participation) || null,
        deferRetry: participation.deferRetry === true,
        rows: [],
      };
    }

    /**
   * Resolve a fairness key for replica_operations reads from the declared
   * repository query shape.
   * @param {string} sql
   * @param {Array} params
   * @return {string|null}
   * @private
   */
    resolveReplicaOperationReadCoalescingKey(sql, params = []) {
      if (sql === SQL.SELECT_OPERATION_BY_ID) {
        return this.buildReplicaOperationReadCoalescingKey(
          REPLICA_OPERATION_READ_BY_ID_COALESCING_KEY_PREFIX,
          params[0],
        );
      }
      if (sql === SQL.SELECT_INCOMPLETE_OPERATIONS) {
        return this.buildReplicaOperationReadCoalescingKey(
          REPLICA_OPERATION_OWNER_READ_COALESCING_KEY_PREFIX,
          this.nodeId,
        );
      }
      if (sql === SQL.SELECT_OPERATIONS_BY_ENTITY) {
        return this.buildReplicaOperationReadCoalescingKey(
          REPLICA_OPERATION_ENTITY_READ_COALESCING_KEY_PREFIX,
          params[1],
        );
      }
      if (sql === SQL.SELECT_IN_FLIGHT_FOR_ENTITY_NODE) {
        return this.buildReplicaOperationReadCoalescingKey(
          REPLICA_OPERATION_ENTITY_NODE_READ_COALESCING_KEY_PREFIX,
          params[0],
          params[1],
        );
      }
      return null;
    }

    /**
   * @param {string} prefix
   * @param {...string} values
   * @return {string|null}
   * @private
   */
    buildReplicaOperationReadCoalescingKey(prefix, ...values) {
      const normalizedValues = values.filter((value) => {
        return typeof value === 'string' && value.length > 0;
      });
      if (
        typeof prefix !== 'string' ||
        prefix.length === 0 ||
        normalizedValues.length === 0
      ) {
        return null;
      }
      return [
        prefix,
        ...normalizedValues,
      ].join(REPLICA_OPERATION_READ_COALESCING_KEY_SEPARATOR);
    }

    /**
   * @param {string} coalescingKey
   * @return {string}
   * @private
   */
    buildReplicaOperationReadDeliverySource(coalescingKey) {
      return [
        REPLICA_OPERATION_READ_DELIVERY_SOURCE_PREFIX,
        SYSTEM_TABLE_NAME.REPLICA_OPERATIONS,
        coalescingKey,
      ].join(REPLICA_OPERATION_READ_COALESCING_KEY_SEPARATOR);
    }

    /**
   * Query a single operation by ID (cache-first, SQL fallback).
   * @param {string} operationId
   * @return {Promise<object|null>}
   */
    async queryOperationById(operationId) {
      const cachedRow = this.getReplicaOperationRowFromCache(operationId);
      if (cachedRow) {
        return this.rowToOperation(cachedRow);
      }

      const result = await this.executeReplicaOperationsRead(
        SQL.SELECT_OPERATION_BY_ID,
        [operationId],
      );
      if (!result.success || !result.rows || result.rows.length === 0) {
        return null;
      }

      const operation = this.rowToOperation(result.rows[0]);
      return isCoordinatorOwnedOperationType(operation?.type) ?
        operation :
        null;
    }

    /**
   * Query a single operation by ID from the authoritative owner path only.
   * @param {string} operationId
   * @param {object} [options]
   * @param {boolean} [options.requireOwnerRpcRead]
   * @return {Promise<object|null>}
   */
    async queryAuthoritativeOperationVisibilityObservation(operationId, options = {}) {
      const allowPriorityRecoveryDeferredVisibility =
      options?.allowPriorityRecoveryDeferredVisibility === true;
      const allowOwnerPersistedTransitionDeferredVisibility =
      options?.allowOwnerPersistedTransitionDeferredVisibility === true;
      const expectedOperation =
      options?.expectedOperation ||
      (allowOwnerPersistedTransitionDeferredVisibility ?
        this.getOwnerPersistedTransitionVisibilityFallbackOperation(operationId) :
        null);
      const ownerPersistedTransitionWitness = allowOwnerPersistedTransitionDeferredVisibility ?
        this.getOwnerPersistedTransitionVisibilityWitness(
          operationId,
          expectedOperation,
        ) :
        null;
      let readQueryOptions = REPLICA_OPERATION_VISIBILITY_READ_QUERY_OPTIONS;
      if (
        options?.authoritativeReadMode ===
        CONTROL_PLANE_AUTHORITATIVE_READ_MODE.OWNER_LOCAL_ONLY
      ) {
        readQueryOptions = REPLICA_OPERATION_LOCAL_VISIBILITY_READ_QUERY_OPTIONS;
      } else if (
        options?.requireOwnerRpcRead === true ||
      options?.authoritativeReadMode === CONTROL_PLANE_AUTHORITATIVE_READ_MODE.OWNER_RPC_REQUIRED
      ) {
        readQueryOptions = REPLICA_OPERATION_STRICT_VISIBILITY_QUERY_OPTIONS;
      }
      const queryStartedAtMs = Date.now();
      const result = await this.executeReplicaOperationsRead(
        SQL.SELECT_OPERATION_BY_ID,
        [operationId],
        {
          ...readQueryOptions,
          ...(options?.preferOwnerRpcReadLeader === true ?
            {preferOwnerRpcReadLeader: true} :
            {}),
          retryOnRetryableFailure: true,
        },
      );
      const queryDurationMs = Date.now() - queryStartedAtMs;

      if (!result.success || !Array.isArray(result.rows) || result.rows.length === 0) {
        const isEmptyRead =
        result.success === true && Array.isArray(result.rows) && result.rows.length === 0;
        const isRetryableAuthoritativeFailure =
          result.success === false && isRetryableControlPlaneError(result);
        let deferredOutcome = null;
        if (ownerPersistedTransitionWitness && (isEmptyRead || isRetryableAuthoritativeFailure)) {
          deferredOutcome = this.buildOwnerPersistedTransitionDeferredVisibilityOutcome({
            retryAfterMs:
              isEmptyRead ?
                this.replicaOperationAuthoritativeVisibilityRetryDelayMs :
                this.getRetryableReplicaOperationReadRetryDelayMs(result),
            queryDurationMs,
            operationId,
            source:
              isEmptyRead ?
                REPLICA_OPERATION_VISIBILITY_OUTCOME_SOURCE
                  .OWNER_PERSISTED_TRANSITION_EMPTY_READ :
                REPLICA_OPERATION_VISIBILITY_OUTCOME_SOURCE
                  .OWNER_PERSISTED_TRANSITION_RETRYABLE_FAILURE,
          });
        }
        if (!deferredOutcome) {
          const planningSnapshot = allowPriorityRecoveryDeferredVisibility ?
            this.resolvePriorityRecoveryPlanningSnapshotForOwnerRead() :
            null;
          const priorityRecoveryActive = !result.success ?
            this.shouldDeferIncompleteOperationReadFailure(result, planningSnapshot) :
            this.isPriorityRecoveryOwnerReadActive(planningSnapshot);
          const source = !result.success ?
            REPLICA_OPERATION_VISIBILITY_OUTCOME_SOURCE
              .PRIORITY_RECOVERY_AUTHORITATIVE_OPERATION_FAILURE :
            REPLICA_OPERATION_VISIBILITY_OUTCOME_SOURCE
              .PRIORITY_RECOVERY_AUTHORITATIVE_OPERATION_EMPTY_READ;
          deferredOutcome = this.buildDeferredAuthoritativeOperationVisibilityOutcome({
            priorityRecoveryActive,
            retryAfterMs: this.getRetryableReplicaOperationReadRetryDelayMs(result),
            queryDurationMs,
            operationId,
            source,
          });
        }

        return Object.freeze({
          operation: null,
          deferredOutcome,
        });
      }

      const matchingRow =
      result.rows.find((row) => {
        return row?.operation_id === operationId;
      }) || result.rows[0];
      const operation = this.rowToOperation(matchingRow);
      if (
        allowOwnerPersistedTransitionDeferredVisibility &&
      ownerPersistedTransitionWitness &&
      this.isOwnerPersistedTransitionVisibilityLagCandidate(
        expectedOperation,
        operation,
        ownerPersistedTransitionWitness,
      )
      ) {
        return Object.freeze({
          operation: null,
          deferredOutcome: this.buildOwnerPersistedTransitionDeferredVisibilityOutcome({
            retryAfterMs: this.replicaOperationAuthoritativeVisibilityRetryDelayMs,
            queryDurationMs,
            operationId,
            source:
            REPLICA_OPERATION_VISIBILITY_OUTCOME_SOURCE
              .OWNER_PERSISTED_TRANSITION_STALE_READ,
          }),
        });
      }
      if (
        ownerPersistedTransitionWitness &&
      this.isReplicaOperationVisibilitySatisfied(
        ownerPersistedTransitionWitness.operation,
        operation,
      )
      ) {
        this.clearOwnerPersistedTransitionVisibilityWitness(operationId);
      }
      return Object.freeze({
        operation: isCoordinatorOwnedOperationType(operation?.type) ? operation : null,
        deferredOutcome: null,
      });
    }

    async queryAuthoritativeOperationById(operationId, options = {}) {
      const observation = await this.queryAuthoritativeOperationVisibilityObservation(operationId, {
        authoritativeReadMode: options?.authoritativeReadMode,
        requireOwnerRpcRead: options?.requireOwnerRpcRead === true,
        preferOwnerRpcReadLeader:
          options?.preferOwnerRpcReadLeader === true,
        allowPriorityRecoveryDeferredVisibility: false,
      });
      return observation.operation;
    }

    /**
     * Query the authoritative operation holding one durable runtime target
     * identity claim.
     * @param {string} targetClaimKey
     * @return {Promise<object|null>}
     */
    async queryAuthoritativeOperationByTargetClaimKey(targetClaimKey) {
      if (
        typeof targetClaimKey !== 'string' ||
        targetClaimKey.length === 0
      ) {
        return null;
      }
      const result = await this.executeReplicaOperationsRead(
        SQL.SELECT_OPERATION_BY_TARGET_CLAIM,
        [targetClaimKey],
        {
          ...REPLICA_OPERATION_STRICT_VISIBILITY_QUERY_OPTIONS,
          preferOwnerRpcReadLeader: true,
          retryOnRetryableFailure: true,
        },
      );
      if (
        result?.success !== true ||
        !Array.isArray(result.rows) ||
        result.rows.length === 0
      ) {
        return null;
      }
      const operation = this.rowToOperation(result.rows[0]);
      return isCoordinatorOwnedOperationType(operation?.type) ?
        operation :
        null;
    }

    async getOperationByIdVisibilityObservation(operationId, options = {}) {
      const authoritativeObservation = await this.queryAuthoritativeOperationVisibilityObservation(
        operationId,
        {
          authoritativeReadMode: options?.authoritativeReadMode,
          requireOwnerRpcRead: options?.requireOwnerRpcRead === true,
          preferOwnerRpcReadLeader:
          options?.preferOwnerRpcReadLeader === true,
          allowPriorityRecoveryDeferredVisibility:
          options?.allowPriorityRecoveryDeferredVisibility === true,
          allowOwnerPersistedTransitionDeferredVisibility:
          options?.allowOwnerPersistedTransitionDeferredVisibility !== false,
        },
      );
      if (authoritativeObservation?.operation) {
        return this.buildOperationVisibilityObservation(authoritativeObservation.operation, null);
      }
      const ownerPersistedFallbackOperation =
      options?.allowOwnerPersistedTransitionDeferredVisibility === false ?
        null :
        this.getOwnerPersistedTransitionVisibilityFallbackOperation(operationId);
      const cacheFallbackOperation = await this.queryOperationById(operationId);
      const fallbackOperation =
      ownerPersistedFallbackOperation || cacheFallbackOperation;
      return this.buildOperationVisibilityObservation(
        fallbackOperation,
        authoritativeObservation?.deferredOutcome || null,
      );
    }

    /**
   * Query for an existing in-flight operation matching a move intent.
   * @param {string} partitionId
   * @param {string} targetNodeId
   * @param {string} entityType
   * @param {string} entityId
   * @param {object} move
   * @param {Function} operationMatchesMoveIntent
   * @return {Promise<object|null>}
   */
    async queryExistingInFlightOperation(
      partitionId,
      targetNodeId,
      entityType,
      entityId,
      move,
      operationMatchesMoveIntent,
      options = {},
    ) {
      const readOptions =
      options?.readOptions && typeof options.readOptions === 'object' ? options.readOptions : null;
      const authoritativeReadContract = resolveAuthoritativeReadModeContract(readOptions || {});
      const allowCacheFallbackOnReadFailure =
      options?.allowCacheFallbackOnReadFailure === false ?
        false :
        authoritativeReadContract.authoritativeReadMode !==
          CONTROL_PLANE_AUTHORITATIVE_READ_MODE.OWNER_RPC_REQUIRED;
      const result = await this.executeReplicaOperationsRead(
        SQL.SELECT_IN_FLIGHT_FOR_ENTITY_NODE,
        [partitionId, targetNodeId, entityType, entityId],
        readOptions,
      );
      if (result.success && Array.isArray(result.rows)) {
        if (result.rows.length === 0) {
          return null;
        }
        const operations = result.rows.map((row) => this.rowToOperation(row));
        return (
          operations.find((operation) => {
            return (
              !this.isOperationTerminal(operation) &&
            operationMatchesMoveIntent(operation, move, entityType, entityId)
            );
          }) || null
        );
      }
      if (!allowCacheFallbackOnReadFailure) {
        return null;
      } // Fallback path for degraded SQL-read conditions.
      const cachedRows = this.filterReplicaOperationRowsFromCache((row) => {
        if (!row || row.partition_id !== partitionId || row.target_node_id !== targetNodeId) {
          return false;
        }
        return (
          (row.entity_type === entityType && row.entity_id === entityId) ||
        row.entity_type === null ||
        row.entity_type === undefined ||
        row.entity_type === ''
        );
      });
      if (cachedRows === null) {
        return null;
      }
      const cachedOperations = cachedRows.map((row) => this.rowToOperation(row));
      return (
        cachedOperations.find((operation) => {
          return (
            !this.isOperationTerminal(operation) &&
          operationMatchesMoveIntent(operation, move, entityType, entityId)
          );
        }) || null
      );
    }
  }

  for (
    const methodName of Object.getOwnPropertyNames(
      ReplicaOperationRepositoryReadMethods.prototype,
    )
  ) {
    if (methodName === LOCAL_STR_CONSTRUCTOR) {
      continue;
    }
    Object.defineProperty(
      ReplicaOperationRepository.prototype,
      methodName,
      Object.getOwnPropertyDescriptor(ReplicaOperationRepositoryReadMethods.prototype, methodName),
    );
  }
  assignReplicaOperationRepositoryIncompleteReadMethods(
    ReplicaOperationRepository,
    options,
  );
  assignReplicaOperationRepositoryEntityReadMethods(
    ReplicaOperationRepository,
    options,
  );
}

export {assignReplicaOperationRepositoryReadMethods};
