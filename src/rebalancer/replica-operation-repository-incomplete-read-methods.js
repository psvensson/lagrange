const LOCAL_STR_CONSTRUCTOR = 'constructor';

function assignReplicaOperationRepositoryIncompleteReadMethods(
  ReplicaOperationRepository,
  options = {},
) {
  const {
    INCOMPLETE_OPERATION_QUERY_ROW_WARN_THRESHOLD,
    INCOMPLETE_OPERATION_QUERY_SLOW_THRESHOLD_MS,
    INCOMPLETE_OPERATION_QUERY_WARN_THROTTLE_MS,
    INCOMPLETE_OPERATION_READ_OUTCOME_SOURCE,
    NUM,
    OperationType,
    REBALANCE_COORDINATOR_LOG_MSG,
    REPLICA_OPERATION_REPOSITORY_LITERAL,
    REPLICA_OPERATION_VISIBILITY_READ_MODE,
    SQL,
    WORKFLOW_STEP,
    buildControlPlaneFailurePayload,
    buildReplicaOperationVisibilityReadOptions,
    isCoordinatorOwnedOperationType,
    isPriorityControlPlanePartition,
    isRetryableControlPlaneError,
    isSystemTablePartition,
    resolveReplicaOperationVisibilityReadMode,
  } = options;

  const INCOMPLETE_OPERATION_OWNER_VISIBILITY_STATE = Object.freeze({
    LOCAL_OWNER: 'local_owner',
    PRIORITY_RECOVERY_DRAIN_CANDIDATE: 'priority_recovery_drain_candidate',
    REMOTE_SYSTEM_REPLACE_HANDOFF_CANDIDATE:
      'remote_system_replace_handoff_candidate',
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
        INCOMPLETE_OPERATION_OWNER_VISIBILITY_STATE
          .REMOTE_SYSTEM_REPLACE_HANDOFF_CANDIDATE,
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

  class ReplicaOperationRepositoryIncompleteReadMethods {
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
      const remoteSystemReplaceHandoffCandidate =
        this.isRemoteSystemReplaceIncompleteOperationVisibilityCandidate(
          operation,
        );
      const evidence = Object.freeze({
        coordinatorOwned,
        terminal,
        localOwner,
        priorityRecoveryDrainCandidate,
        remoteSystemReplaceHandoffCandidate,
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
      if (evidence.remoteSystemReplaceHandoffCandidate) {
        return (
          INCOMPLETE_OPERATION_OWNER_VISIBILITY_STATE
            .REMOTE_SYSTEM_REPLACE_HANDOFF_CANDIDATE
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
    isRemoteSystemReplaceIncompleteOperationVisibilityCandidate(operation) {
      const sourceNodeId = String(
        operation?.sourceNodeId || operation?.source_node_id || '',
      );
      return Boolean(
        operation &&
        operation.type === OperationType.REPLACE &&
        sourceNodeId.length > NUM.ZERO &&
        sourceNodeId === this.nodeId &&
        isSystemTablePartition({
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
            {
              cachedOperations,
              fallbackOperations,
            },
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
  }

  for (
    const methodName of Object.getOwnPropertyNames(
      ReplicaOperationRepositoryIncompleteReadMethods.prototype,
    )
  ) {
    if (methodName === LOCAL_STR_CONSTRUCTOR) {
      continue;
    }
    Object.defineProperty(
      ReplicaOperationRepository.prototype,
      methodName,
      Object.getOwnPropertyDescriptor(
        ReplicaOperationRepositoryIncompleteReadMethods.prototype,
        methodName,
      ),
    );
  }
}

export {assignReplicaOperationRepositoryIncompleteReadMethods};
