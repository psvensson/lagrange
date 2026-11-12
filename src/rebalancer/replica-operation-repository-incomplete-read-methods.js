import {
  PRIORITY_RECOVERY_INCOMPLETE_OPERATION_STEP_ORDER,
  PRIORITY_RECOVERY_INCOMPLETE_OPERATION_VISIBILITY_STEPS,
  isIncompleteOperationRowStep,
} from './replica-operation-step-policy.js';
import {
  REPLICA_OPERATION_OWNER_LEASE_ADOPTION,
  resolveOperationOwnerLeaseAdoption,
} from './replica-operation-owner-lease.js';
import {
  buildAnsweredIncompleteOperationListObservation,
  buildDeferredIncompleteOperationListObservation,
} from './incomplete-operation-list-observation.js';

const LOCAL_STR_CONSTRUCTOR = 'constructor';
const LOCAL_STR_STRING = 'string';

function assignReplicaOperationRepositoryIncompleteReadMethods(
  ReplicaOperationRepository,
  options = {},
) {
  const {
    INCOMPLETE_OPERATION_QUERY_ROW_WARN_THRESHOLD,
    INCOMPLETE_OPERATION_QUERY_SLOW_THRESHOLD_MS,
    INCOMPLETE_OPERATION_QUERY_WARN_THROTTLE_MS,
    INCOMPLETE_OPERATION_READ_OUTCOME_SOURCE,
    OperationType,
    REBALANCE_COORDINATOR_LOG_MSG,
    REPLICA_OPERATION_REPOSITORY_LITERAL,
    REPLICA_OPERATION_VISIBILITY_READ_MODE,
    SQL,
    WORKFLOW_STEP,
    buildControlPlaneFailurePayload,
    buildReplicaOperationVisibilityReadOptions,
    classifySystemPartition,
    isCoordinatorOwnedOperationType,
    isRetryableControlPlaneError,
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

  const VISIBILITY_STATE = INCOMPLETE_OPERATION_OWNER_VISIBILITY_STATE;
  const VISIBILITY_ACTION = INCOMPLETE_OPERATION_OWNER_VISIBILITY_ACTION;
  const INCOMPLETE_OPERATION_OWNER_VISIBILITY_ACTION_BY_STATE = Object.freeze(
    new Map([
      [VISIBILITY_STATE.LOCAL_OWNER, VISIBILITY_ACTION.INCLUDE],
      [VISIBILITY_STATE.PRIORITY_RECOVERY_DRAIN_CANDIDATE, VISIBILITY_ACTION.INCLUDE],
      [VISIBILITY_STATE.REMOTE_SYSTEM_REPLACE_HANDOFF_CANDIDATE, VISIBILITY_ACTION.INCLUDE],
      [VISIBILITY_STATE.REMOTE_OWNER, VISIBILITY_ACTION.SKIP],
      [VISIBILITY_STATE.NON_COORDINATOR_OPERATION, VISIBILITY_ACTION.SKIP],
      [VISIBILITY_STATE.TERMINAL_OPERATION, VISIBILITY_ACTION.SKIP],
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
          const leftUpdatedAt = Number(left?.updatedAt) || 0;
          const rightUpdatedAt = Number(right?.updatedAt) || 0;
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
      if (
        !operation ||
        !classifySystemPartition({partitionId: operation.partitionId})
          .priorityControlPlane
      ) {
        return false;
      }
      if (operation.type === OperationType.REPLACE) {
        return PRIORITY_RECOVERY_INCOMPLETE_OPERATION_VISIBILITY_STEPS.has(
          operation.workflowStep,
        );
      }
      return (
        operation.type === OperationType.REMOVE &&
        operation.workflowStep === WORKFLOW_STEP.STOPPING
      );
    }

    /**
   * Fenced orphan-adoption read (audit findings 5+14): the recovery sweep
   * surface. Returns incomplete ordinary-partition operations this node may
   * adopt as the fenced successor — unfenced rows OR rows whose
   * durable lease expired by `nowMs`. A live remote lease is never returned.
   * @param {number} [nowMs]
   * @return {Object[]}
   */
    queryOrphanAdoptableOperations(nowMs) {
      return this.queryCachedIncompleteOperations().filter((operation) => {
        const partitionClassification = classifySystemPartition({
          partitionId: operation?.partitionId,
        });
        if (
          partitionClassification.priorityControlPlane ||
          partitionClassification.systemTable ||
          this.isOperationLocallyOwned(operation)
        ) {
          return false;
        }
        return (
          resolveOperationOwnerLeaseAdoption(operation, this.nodeId, nowMs)
            .adoption ===
          REPLICA_OPERATION_OWNER_LEASE_ADOPTION.ADOPT_AS_FENCED_SUCCESSOR
        );
      });
    }

    /**
   * @param {Object} operation
   * @return {boolean}
   * @private
   */
    isRemoteSystemReplaceIncompleteOperationVisibilityCandidate(operation) {
      const sourceNodeId = String(operation?.sourceNodeId || '');
      return Boolean(
        operation &&
        operation.type === OperationType.REPLACE &&
        sourceNodeId.length > 0 &&
        sourceNodeId === this.nodeId &&
        classifySystemPartition({
          partitionId: operation.partitionId,
        }).systemTable &&
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
   * The cache projection of this node's incomplete operations: a hint, read
   * by name, never the owner's answer (that is queryIncompleteOperations).
   * @return {Object[]}
   */
    queryCachedIncompleteOperations() {
      const cachedRows = this.filterReplicaOperationRowsFromCache((row) =>
        Boolean(row) && isIncompleteOperationRowStep(row.type, row.workflow_step));
      if (cachedRows === null) {
        return [];
      }
      return this.mapAndSortIncompleteOperations(cachedRows);
    }

    /**
   * Cluster-wide authoritative census of live ledger writers (every
   * coordinator-owned non-terminal row, any source or target node), read
   * through the owner-RPC lane. The dispatch-time idle check of a ledger
   * self-move consumes it (operation-workflow-dispatch-ledger-self-move-gate.js);
   * a failed read throws so the caller parks fail-closed. No cache fallback,
   * no owner-visibility filtering: ownership is irrelevant to whether a row
   * still writes ledger progress.
   * @return {Promise<Array>}
   */
    async queryClusterWideIncompleteOperations() {
      const result = await this.executeReplicaOperationsRead(
        SQL.SELECT_INCOMPLETE_LEDGER_WRITER_OPERATIONS,
        [
          ...PRIORITY_RECOVERY_INCOMPLETE_OPERATION_STEP_ORDER,
          OperationType.REPLACE,
          OperationType.REMOVE,
        ],
        buildReplicaOperationVisibilityReadOptions(
          REPLICA_OPERATION_VISIBILITY_READ_MODE.OWNER_RPC_REQUIRED,
        ),
      );
      if (!result?.success || !Array.isArray(result.rows)) {
        const error = new Error(
          typeof result?.error === LOCAL_STR_STRING ?
            result.error :
            REPLICA_OPERATION_REPOSITORY_LITERAL.IN_FLIGHT_OPERATION_OWNER_QUERY_INDICATES +
              REPLICA_OPERATION_REPOSITORY_LITERAL.CONTROL_PLANE_PRESSURE,
        );
        error.retryAfterMs = this.getRetryableIncompleteOperationReadBackoffMs(
          result,
        );
        throw error;
      }
      return result.rows
        .map((row) => this.rowToOperation(row))
        .filter((operation) => operation && !this.isOperationTerminal(operation));
    }

    /**
     * This node's incomplete operations, read from the operation-ledger
     * owner. The answer is one named observation
     * (incomplete-operation-list-observation.js): PRESENT or a confirmed
     * EMPTY with the owner's complete list, or DEFERRED with no list and the
     * typed `deferredOutcome` (failed, backing off, priority-recovery
     * deferral). No cache row stands in for the owner; the cache projection
     * is queryCachedIncompleteOperations, read by name.
     * @param {Object} [options={}]
     * @param {string} [options.visibilityReadMode] - OWNER_RPC_REQUIRED or
     *   OWNER_RPC_SINGLE_ATTEMPT; otherwise the owner-preferred read, which
     *   honours the retryable-failure backoff.
     * @return {Promise<Object>}
     */
    async queryIncompleteOperations(options = {}) {
      const requestedMode = resolveReplicaOperationVisibilityReadMode(options);
      const strictOwnerRead =
        requestedMode === REPLICA_OPERATION_VISIBILITY_READ_MODE.OWNER_RPC_REQUIRED ||
        requestedMode === REPLICA_OPERATION_VISIBILITY_READ_MODE.OWNER_RPC_SINGLE_ATTEMPT;
      const nowMs = this.timeSource.now();
      if (!strictOwnerRead && this.nextIncompleteOperationSqlRetryAtMs > nowMs) {
        // Backing off after a failed owner read: nothing was read.
        return this.recordDeferredIncompleteOperationRead(
          this.buildIncompleteOperationReadUnavailableOutcome(null, {
            retryAfterMs: this.nextIncompleteOperationSqlRetryAtMs - nowMs,
            source: INCOMPLETE_OPERATION_READ_OUTCOME_SOURCE.AUTHORITATIVE_READ_BACKOFF,
          }));
      }
      // Evidence for the priority-recovery deferral label only; never answers.
      const cachedOperations = this.queryCachedIncompleteOperations();
      const queryStartedAtMs = this.timeSource.now();
      const result = await this.executeReplicaOperationsRead(
        SQL.SELECT_INCOMPLETE_OPERATIONS,
        [
          this.nodeId,
          this.nodeId,
          ...PRIORITY_RECOVERY_INCOMPLETE_OPERATION_STEP_ORDER,
          OperationType.REPLACE,
          OperationType.REMOVE,
        ],
        buildReplicaOperationVisibilityReadOptions(strictOwnerRead ?
          requestedMode :
          REPLICA_OPERATION_VISIBILITY_READ_MODE.CACHE_PREFERRED_SQL_FALLBACK),
      );
      const queryDurationMs = this.timeSource.now() - queryStartedAtMs;
      const rowCount = Array.isArray(result?.rows) ? result.rows.length : 0;
      const planningSnapshot = this.resolvePriorityRecoveryPlanningSnapshotForOwnerRead();

      if (!result.success || !result.rows) {
        const retryAfterMs = this.getRetryableIncompleteOperationReadBackoffMs(result);
        const deferredOutcome = this.buildDeferredIncompleteOperationReadOutcome({
          priorityRecoveryActive: this.shouldDeferIncompleteOperationReadFailure(
            result, planningSnapshot, {cachedOperations}),
          retryAfterMs,
          queryDurationMs,
          source: INCOMPLETE_OPERATION_READ_OUTCOME_SOURCE
            .PRIORITY_RECOVERY_AUTHORITATIVE_OPERATION_FAILURE,
        }) || this.buildIncompleteOperationReadUnavailableOutcome(result, {
          retryAfterMs,
          queryDurationMs,
          source: INCOMPLETE_OPERATION_READ_OUTCOME_SOURCE.AUTHORITATIVE_READ_FAILURE,
        });
        const logPayload = {
          ...buildControlPlaneFailurePayload(this.nodeId, result),
          completionState: deferredOutcome.completionState || null,
        };
        if (isRetryableControlPlaneError(result)) {
          this.nextIncompleteOperationSqlRetryAtMs = this.timeSource.now() + retryAfterMs;
          this.logger.warn(REBALANCE_COORDINATOR_LOG_MSG.QUERY_OPERATIONS_FAILED, logPayload);
        } else {
          this.logger.error(REBALANCE_COORDINATOR_LOG_MSG.QUERY_OPERATIONS_FAILED, logPayload);
        }
        return this.recordDeferredIncompleteOperationRead(deferredOutcome);
      }

      this.nextIncompleteOperationSqlRetryAtMs = 0;
      const deferEmptyRead = this.shouldDeferIncompleteOperationEmptyRead(
        result,
        queryDurationMs,
        cachedOperations,
        planningSnapshot,
      );
      const deferredOutcome = deferEmptyRead ?
        this.buildDeferredIncompleteOperationReadOutcome({
          priorityRecoveryActive: true,
          retryAfterMs: this.getRetryableIncompleteOperationReadBackoffMs(result),
          queryDurationMs,
          source: INCOMPLETE_OPERATION_READ_OUTCOME_SOURCE
            .PRIORITY_RECOVERY_AUTHORITATIVE_OPERATION_EMPTY_READ,
        }) :
        null;
      this.warnIncompleteOperationQueryPressure(queryDurationMs, rowCount, deferredOutcome);
      if (deferredOutcome) {
        return this.recordDeferredIncompleteOperationRead(deferredOutcome);
      }
      return this.recordAnsweredIncompleteOperationRead(
        this.mapAndSortIncompleteOperations(result.rows));
    }

    /**
     * The DEFERRED observation of a read the local router pressure governor
     * paused before it reached the owner.
     * @return {Object}
     */
    buildLocalRouterPressureIncompleteOperationObservation() {
      return buildDeferredIncompleteOperationListObservation(
        this.buildIncompleteOperationReadUnavailableOutcome(null, {
          source: INCOMPLETE_OPERATION_READ_OUTCOME_SOURCE.LOCAL_ROUTER_PRESSURE,
        }));
    }

    /**
     * @param {Object} deferredOutcome
     * @return {Object} The DEFERRED observation; no list.
     * @private
     */
    recordDeferredIncompleteOperationRead(deferredOutcome) {
      this.lastIncompleteOperationReadOutcome = deferredOutcome;
      this.lastIncompleteOperationReadComplete = false;
      return buildDeferredIncompleteOperationListObservation(deferredOutcome);
    }

    /**
     * @param {Array<Object>} operations - The owner's complete list.
     * @return {Object} PRESENT or a confirmed EMPTY.
     * @private
     */
    recordAnsweredIncompleteOperationRead(operations) {
      this.recordIncompleteOperationObservation(operations);
      this.clearIncompleteOperationReadOutcome();
      this.lastIncompleteOperationReadComplete = true;
      return buildAnsweredIncompleteOperationListObservation(operations);
    }

    /**
     * Throttled warning for a slow or large owner read.
     * @param {number} queryDurationMs
     * @param {number} rowCount
     * @param {Object|null} deferredOutcome
     * @return {void}
     * @private
     */
    warnIncompleteOperationQueryPressure(queryDurationMs, rowCount, deferredOutcome) {
      if (
        queryDurationMs < INCOMPLETE_OPERATION_QUERY_SLOW_THRESHOLD_MS &&
        rowCount < INCOMPLETE_OPERATION_QUERY_ROW_WARN_THRESHOLD
      ) {
        return;
      }
      const nowMs = this.timeSource.now();
      if (
        nowMs - this.lastIncompleteOperationQueryWarningAtMs <
        INCOMPLETE_OPERATION_QUERY_WARN_THROTTLE_MS
      ) {
        return;
      }
      this.lastIncompleteOperationQueryWarningAtMs = nowMs;
      this.logger.warn(
        REPLICA_OPERATION_REPOSITORY_LITERAL.IN_FLIGHT_OPERATION_OWNER_QUERY_INDICATES +
        REPLICA_OPERATION_REPOSITORY_LITERAL.CONTROL_PLANE_PRESSURE,
        {
          nodeId: this.nodeId,
          queryDurationMs,
          rowCount,
          ...(deferredOutcome ?
            {completionState: deferredOutcome.completionState || null} :
            {}),
        },
      );
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
