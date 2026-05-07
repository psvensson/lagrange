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
    ENTITY_OPERATION_VISIBILITY_OUTCOME_SOURCE,
    INITIAL_PARTITION_IDS,
    INCOMPLETE_OPERATION_QUERY_ROW_WARN_THRESHOLD,
    INCOMPLETE_OPERATION_QUERY_SLOW_THRESHOLD_MS,
    INCOMPLETE_OPERATION_QUERY_WARN_THROTTLE_MS,
    INCOMPLETE_OPERATION_READ_OUTCOME_SOURCE,
    NUM,
    OperationType,
    REBALANCE_COORDINATOR_LOG_MSG,
    REPLICA_OPERATION_LOCAL_VISIBILITY_READ_QUERY_OPTIONS,
    REPLICA_OPERATION_LOCAL_OWNER_READ_QUERY_OPTIONS,
    REPLICA_OPERATION_READ_RETRY_TIMEOUT_MS,
    REPLICA_OPERATION_READINESS_DIMENSION,
    REPLICA_OPERATION_REPOSITORY_LITERAL,
    REPLICA_OPERATION_STRICT_VISIBILITY_QUERY_OPTIONS,
    REPLICA_OPERATION_VISIBILITY_OUTCOME_SOURCE,
    REPLICA_OPERATION_VISIBILITY_READ_MODE,
    REPLICA_OPERATION_VISIBILITY_READ_QUERY_OPTIONS,
    SERVICE_TYPE,
    SQL,
    SYSTEM_TABLE_NAME,
    TYPEOF,
    UNIFIED_SERVICE_TYPE,
    buildControlPlaneFailurePayload,
    buildReplicaOperationVisibilityReadOptions,
    getControlPlaneRetryAfterMs,
    isPriorityControlPlanePartition,
    isCoordinatorOwnedOperationType,
    isRetryableControlPlaneError,
    readAuthoritativeControlPlaneRows,
    resolveAuthoritativeReadModeContract,
    resolveReplicaOperationVisibilityReadMode,
    shouldDeferReplicaOperationOwnerRead,
    WORKFLOW_STEP,
  } = options;

  const INCOMPLETE_OPERATION_OWNER_VISIBILITY_STATE = Object.freeze({
    LOCAL_OWNER: 'local_owner',
    PRIORITY_RECOVERY_DRAIN_CANDIDATE: 'priority_recovery_drain_candidate',
    REMOTE_OWNER: 'remote_owner',
    NON_COORDINATOR_OPERATION: 'non_coordinator_operation',
    TERMINAL_OPERATION: 'terminal_operation',
  });

  const INCOMPLETE_OPERATION_OWNER_VISIBILITY_ACTION = Object.freeze({
    INCLUDE: 'include',
    SKIP: 'skip',
  });

  const INCOMPLETE_OPERATION_OWNER_VISIBILITY_ACTION_BY_STATE = Object.freeze(
    new Map([
      [
        INCOMPLETE_OPERATION_OWNER_VISIBILITY_STATE.LOCAL_OWNER,
        INCOMPLETE_OPERATION_OWNER_VISIBILITY_ACTION.INCLUDE,
      ],
      [
        INCOMPLETE_OPERATION_OWNER_VISIBILITY_STATE
          .PRIORITY_RECOVERY_DRAIN_CANDIDATE,
        INCOMPLETE_OPERATION_OWNER_VISIBILITY_ACTION.INCLUDE,
      ],
      [
        INCOMPLETE_OPERATION_OWNER_VISIBILITY_STATE.REMOTE_OWNER,
        INCOMPLETE_OPERATION_OWNER_VISIBILITY_ACTION.SKIP,
      ],
      [
        INCOMPLETE_OPERATION_OWNER_VISIBILITY_STATE.NON_COORDINATOR_OPERATION,
        INCOMPLETE_OPERATION_OWNER_VISIBILITY_ACTION.SKIP,
      ],
      [
        INCOMPLETE_OPERATION_OWNER_VISIBILITY_STATE.TERMINAL_OPERATION,
        INCOMPLETE_OPERATION_OWNER_VISIBILITY_ACTION.SKIP,
      ],
    ]),
  );

  const PRIORITY_RECOVERY_INCOMPLETE_OPERATION_VISIBILITY_STEPS =
    Object.freeze(
      new Set([
        WORKFLOW_STEP.PENDING,
        WORKFLOW_STEP.SENDING,
        WORKFLOW_STEP.CREATING,
        WORKFLOW_STEP.SYNCING,
        WORKFLOW_STEP.ACTIVE,
        WORKFLOW_STEP.STOPPING,
      ]),
    );

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
        typeof coalescingKey === TYPEOF.STRING &&
        coalescingKey.length > NUM.ZERO
      ) {
        queryOptions.coalescingKey = coalescingKey;
      }
      if (
        !queryOptions.deliverySource &&
        typeof queryOptions.coalescingKey === TYPEOF.STRING &&
        queryOptions.coalescingKey.length > NUM.ZERO
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
        if (remainingMs <= NUM.ZERO) {
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
      typeof this.controlPlaneReadinessService.getControlPlaneParticipationSync !== TYPEOF.FUNCTION
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
          params[NUM.ZERO],
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
          params[NUM.ONE],
        );
      }
      if (sql === SQL.SELECT_IN_FLIGHT_FOR_ENTITY_NODE) {
        return this.buildReplicaOperationReadCoalescingKey(
          REPLICA_OPERATION_ENTITY_NODE_READ_COALESCING_KEY_PREFIX,
          params[NUM.ZERO],
          params[NUM.ONE],
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
        return typeof value === TYPEOF.STRING && value.length > NUM.ZERO;
      });
      if (
        typeof prefix !== TYPEOF.STRING ||
        prefix.length === NUM.ZERO ||
        normalizedValues.length === NUM.ZERO
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
      if (!result.success || !result.rows || result.rows.length === NUM.ZERO) {
        return null;
      }

      const operation = this.rowToOperation(result.rows[NUM.ZERO]);
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
          retryOnRetryableFailure: true,
        },
      );
      const queryDurationMs = Date.now() - queryStartedAtMs;

      if (!result.success || !Array.isArray(result.rows) || result.rows.length === NUM.ZERO) {
        const isEmptyRead =
        result.success === true && Array.isArray(result.rows) && result.rows.length === NUM.ZERO;
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
      }) || result.rows[NUM.ZERO];
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
        allowPriorityRecoveryDeferredVisibility: false,
      });
      return observation.operation;
    }

    async getOperationByIdVisibilityObservation(operationId, options = {}) {
      const authoritativeObservation = await this.queryAuthoritativeOperationVisibilityObservation(
        operationId,
        {
          authoritativeReadMode: options?.authoritativeReadMode,
          requireOwnerRpcRead: options?.requireOwnerRpcRead === true,
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
      const cacheFallbackOperation =
      options?.allowFallbackQuery === false ? null : await this.queryOperationById(operationId);
      const fallbackOperation =
      ownerPersistedFallbackOperation || cacheFallbackOperation;
      return this.buildOperationVisibilityObservation(
        fallbackOperation,
        authoritativeObservation?.deferredOutcome || null,
      );
    }

    /**
   * Normalize incomplete-operation rows into the canonical owner view.
   * @param {Object[]} rows
   * @return {Object[]}
   * @private
   */
    mapAndSortIncompleteOperations(rows = []) {
      return rows
        .map((row) => this.rowToOperation(row))
        .filter((operation) =>
          this.shouldExposeIncompleteOperationToOwnerRead(operation))
        .sort((left, right) => {
          const leftUpdatedAt = Number(left?.updatedAt) || NUM.ZERO;
          const rightUpdatedAt = Number(right?.updatedAt) || NUM.ZERO;
          if (leftUpdatedAt !== rightUpdatedAt) {
            return leftUpdatedAt - rightUpdatedAt;
          }
          return String(
            left?.operationId || REPLICA_OPERATION_REPOSITORY_LITERAL.VALUE,
          ).localeCompare(String(right?.operationId || REPLICA_OPERATION_REPOSITORY_LITERAL.VALUE));
        });
    }

    /**
   * Resolve whether an incomplete operation should be exposed to owner-read
   * callers.
   *
   * @param {Object} operation
   * @return {Object}
   * @private
   */
    buildIncompleteOperationOwnerVisibilitySnapshot(operation) {
      const coordinatorOwned =
        isCoordinatorOwnedOperationType(operation?.type);
      const terminal = this.isOperationTerminal(operation);
      const localOwner = this.isOperationLocallyOwned(operation);
      const priorityRecoveryDrainCandidate =
        this.isPriorityRecoveryIncompleteOperationVisibilityCandidate(
          operation,
        );
      const evidence = Object.freeze({
        coordinatorOwned,
        terminal,
        localOwner,
        priorityRecoveryDrainCandidate,
      });
      const state =
        this.resolveIncompleteOperationOwnerVisibilityState(evidence);
      const action =
        INCOMPLETE_OPERATION_OWNER_VISIBILITY_ACTION_BY_STATE.get(state) ||
        INCOMPLETE_OPERATION_OWNER_VISIBILITY_ACTION.SKIP;

      return Object.freeze({
        evidence,
        state,
        action,
      });
    }

    /**
   * @param {Object} evidence
   * @return {string}
   * @private
   */
    resolveIncompleteOperationOwnerVisibilityState(evidence) {
      if (!evidence?.coordinatorOwned) {
        return (
          INCOMPLETE_OPERATION_OWNER_VISIBILITY_STATE
            .NON_COORDINATOR_OPERATION
        );
      }
      if (evidence.terminal) {
        return INCOMPLETE_OPERATION_OWNER_VISIBILITY_STATE.TERMINAL_OPERATION;
      }
      if (evidence.localOwner) {
        return INCOMPLETE_OPERATION_OWNER_VISIBILITY_STATE.LOCAL_OWNER;
      }
      if (evidence.priorityRecoveryDrainCandidate) {
        return (
          INCOMPLETE_OPERATION_OWNER_VISIBILITY_STATE
            .PRIORITY_RECOVERY_DRAIN_CANDIDATE
        );
      }
      return INCOMPLETE_OPERATION_OWNER_VISIBILITY_STATE.REMOTE_OWNER;
    }

    /**
   * @param {Object} operation
   * @return {boolean}
   * @private
   */
    isPriorityRecoveryIncompleteOperationVisibilityCandidate(operation) {
      return Boolean(
        operation &&
        operation.type === OperationType.REPLACE &&
        isPriorityControlPlanePartition({
          partitionId: operation.partitionId,
        }) &&
        PRIORITY_RECOVERY_INCOMPLETE_OPERATION_VISIBILITY_STEPS.has(
          operation.workflowStep,
        ),
      );
    }

    /**
   * @param {Object} operation
   * @return {boolean}
   * @private
   */
    shouldExposeIncompleteOperationToOwnerRead(operation) {
      const snapshot =
        this.buildIncompleteOperationOwnerVisibilitySnapshot(operation);
      return (
        snapshot.action ===
        INCOMPLETE_OPERATION_OWNER_VISIBILITY_ACTION.INCLUDE
      );
    }
    /**
   * Return only the cache-visible incomplete operations.
   * Callers that specifically need the cache observation boundary should use
   * this surface instead of tuning fallback behavior on the general read API.
   *
   * @return {Object[]}
   */
    queryCachedIncompleteOperations() {
      const cachedRows = this.filterReplicaOperationRowsFromCache((row) => {
        if (!row) {
          return false;
        }
        return (
          row.workflow_step === WORKFLOW_STEP.PENDING ||
        row.workflow_step === WORKFLOW_STEP.SENDING ||
        row.workflow_step === WORKFLOW_STEP.CREATING ||
        row.workflow_step === WORKFLOW_STEP.SYNCING ||
        row.workflow_step === WORKFLOW_STEP.STOPPING ||
        (row.workflow_step === WORKFLOW_STEP.ACTIVE && row.type === OperationType.REPLACE)
        );
      });
      if (cachedRows === null) {
        return [];
      }
      return this.mapAndSortIncompleteOperations(cachedRows);
    }

    /**
   * Query all incomplete (in-flight) operations owned by this node.
   * @param {object} [options={}]
   * @param {boolean} [options.preferAuthoritativeRead]
   * @return {Promise<Array>}
   */
    async queryIncompleteOperations(options = {}) {
      const visibilityReadMode = resolveReplicaOperationVisibilityReadMode(options);
      const authoritativeReadOptions =
        buildReplicaOperationVisibilityReadOptions(visibilityReadMode);
      const cachedOperations = this.queryCachedIncompleteOperations();

      if (visibilityReadMode !== REPLICA_OPERATION_VISIBILITY_READ_MODE.OWNER_RPC_REQUIRED) {
        if (
          cachedOperations.length === NUM.ZERO &&
        this.nextIncompleteOperationSqlRetryAtMs > Date.now()
        ) {
          return this.resolveDeferredIncompleteOperationReadFallback(cachedOperations);
        }
        if (
          cachedOperations.length > NUM.ZERO ||
        visibilityReadMode === REPLICA_OPERATION_VISIBILITY_READ_MODE.CACHE_ONLY
        ) {
          this.recordIncompleteOperationObservation(cachedOperations);
          this.clearIncompleteOperationReadOutcome();
          return cachedOperations;
        }
      }

      const queryStartedAtMs = Date.now();
      const result = await this.executeReplicaOperationsRead(
        SQL.SELECT_INCOMPLETE_OPERATIONS,
        [
          this.nodeId,
          this.nodeId,
          WORKFLOW_STEP.PENDING,
          WORKFLOW_STEP.SENDING,
          WORKFLOW_STEP.CREATING,
          WORKFLOW_STEP.SYNCING,
          WORKFLOW_STEP.STOPPING,
          WORKFLOW_STEP.ACTIVE,
          OperationType.REPLACE,
        ],
        authoritativeReadOptions,
      );
      const queryDurationMs = Date.now() - queryStartedAtMs;
      const rowCount = Array.isArray(result?.rows) ? result.rows.length : NUM.ZERO;
      const planningSnapshot = this.resolvePriorityRecoveryPlanningSnapshotForOwnerRead();

      if (!result.success || !result.rows) {
        const fallbackOperations =
        this.resolveDeferredIncompleteOperationReadFallback(cachedOperations);
        const deferredOutcome = this.buildDeferredIncompleteOperationReadOutcome({
          priorityRecoveryActive: this.shouldDeferIncompleteOperationReadFailure(
            result,
            planningSnapshot,
          ),
          retryAfterMs: this.getRetryableIncompleteOperationReadBackoffMs(result),
          cachedOperations,
          fallbackOperations,
          queryDurationMs,
          source:
          INCOMPLETE_OPERATION_READ_OUTCOME_SOURCE
            .PRIORITY_RECOVERY_AUTHORITATIVE_OPERATION_FAILURE,
        });
        const logPayload = {
          ...buildControlPlaneFailurePayload(this.nodeId, result),
          completionState: deferredOutcome?.completionState || null,
        };

        if (isRetryableControlPlaneError(result)) {
          this.nextIncompleteOperationSqlRetryAtMs =
          Date.now() + this.getRetryableIncompleteOperationReadBackoffMs(result);
          this.logger.warn(REBALANCE_COORDINATOR_LOG_MSG.QUERY_OPERATIONS_FAILED, logPayload);
        } else {
          this.logger.error(REBALANCE_COORDINATOR_LOG_MSG.QUERY_OPERATIONS_FAILED, logPayload);
        }

        if (deferredOutcome) {
          this.lastIncompleteOperationReadOutcome = deferredOutcome;
          return fallbackOperations;
        }
        return [];
      }

      this.nextIncompleteOperationSqlRetryAtMs = NUM.ZERO;

      const shouldWarnOnQueryPressure =
      queryDurationMs >= INCOMPLETE_OPERATION_QUERY_SLOW_THRESHOLD_MS ||
      rowCount >= INCOMPLETE_OPERATION_QUERY_ROW_WARN_THRESHOLD;
      if (
        this.shouldDeferIncompleteOperationEmptyRead(
          result,
          queryDurationMs,
          cachedOperations,
          planningSnapshot,
        )
      ) {
        const fallbackOperations =
        this.resolveDeferredIncompleteOperationReadFallback(cachedOperations);
        const deferredOutcome = this.buildDeferredIncompleteOperationReadOutcome({
          priorityRecoveryActive: true,
          retryAfterMs: this.getRetryableIncompleteOperationReadBackoffMs(result),
          cachedOperations,
          fallbackOperations,
          queryDurationMs,
          source:
          INCOMPLETE_OPERATION_READ_OUTCOME_SOURCE
            .PRIORITY_RECOVERY_AUTHORITATIVE_OPERATION_EMPTY_READ,
        });
        this.lastIncompleteOperationReadOutcome = deferredOutcome;

        if (shouldWarnOnQueryPressure) {
          const nowMs = Date.now();
          if (
            nowMs - this.lastIncompleteOperationQueryWarningAtMs >=
          INCOMPLETE_OPERATION_QUERY_WARN_THROTTLE_MS
          ) {
            this.lastIncompleteOperationQueryWarningAtMs = nowMs;
            this.logger.warn(
              REPLICA_OPERATION_REPOSITORY_LITERAL.IN_FLIGHT_OPERATION_OWNER_QUERY_INDICATES +
              REPLICA_OPERATION_REPOSITORY_LITERAL.CONTROL_PLANE_PRESSURE,
              {
                nodeId: this.nodeId,
                queryDurationMs,
                rowCount,
                completionState: deferredOutcome?.completionState || null,
              },
            );
          }
        }

        return fallbackOperations;
      }

      this.clearIncompleteOperationReadOutcome();
      if (shouldWarnOnQueryPressure) {
        const nowMs = Date.now();
        if (
          nowMs - this.lastIncompleteOperationQueryWarningAtMs >=
        INCOMPLETE_OPERATION_QUERY_WARN_THROTTLE_MS
        ) {
          this.lastIncompleteOperationQueryWarningAtMs = nowMs;
          this.logger.warn(
            REPLICA_OPERATION_REPOSITORY_LITERAL.IN_FLIGHT_OPERATION_OWNER_QUERY_INDICATES +
            REPLICA_OPERATION_REPOSITORY_LITERAL.CONTROL_PLANE_PRESSURE,
            {
              nodeId: this.nodeId,
              queryDurationMs,
              rowCount,
            },
          );
        }
      }

      const operations = this.mapAndSortIncompleteOperations(result.rows);
      this.recordIncompleteOperationObservation(operations);
      return operations;
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
        if (result.rows.length === NUM.ZERO) {
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
}

export {assignReplicaOperationRepositoryReadMethods};
