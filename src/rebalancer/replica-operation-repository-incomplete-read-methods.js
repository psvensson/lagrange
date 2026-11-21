import {GROWTH_PROMOTION_COHORT_UNRESOLVED} from './growth-promotion-subject.js';
import {memoizedParseStepsHistoryString} from './steps-history-parse-memo.js';
import {isGenesisFoundingCreateOperation, ReplicaOperationField} from
  './replica-operation-constants.js';
import {getOperationMetadataObject, OPERATION_METADATA_KEY} from './replica-status.js';
import {assertCanonicalRebalancerEntityIdentity} from './rebalancer-entity-identity.js';
import {
  PRIORITY_RECOVERY_INCOMPLETE_OPERATION_STEP_ORDER,
  PRIORITY_RECOVERY_INCOMPLETE_OPERATION_VISIBILITY_STEPS,
  isIncompleteOperationRowStep,
} from './replica-operation-step-policy.js';
import {
  REPLICA_OPERATION_OWNER_LEASE_ADOPTION,
  resolveOperationOwnerLeaseAdoption,
} from './replica-operation-owner-lease.js';

const LOCAL_STR_CONSTRUCTOR = 'constructor';
const LOCAL_STR_STRING = 'string';

const INCOMPLETE_ROW_DISPOSITION = Object.freeze({
  EXECUTABLE: 'executable',
  UNRESOLVED_GROWTH: 'unresolved_growth',
});

// Occupancy requires the real ledger coordinates and lifecycle timestamps,
// but grants no promotion permission and does not decode a promotion cohort.
function readOperationOccupancy(row) {
  const {entityType, entityId} = assertCanonicalRebalancerEntityIdentity({
    entityType: row.entity_type, entityId: row.entity_id,
  });
  const stepsHistory = memoizedParseStepsHistoryString(row.steps_history);
  const founder = isGenesisFoundingCreateOperation({
    type: row.type,
    [ReplicaOperationField.BOOTSTRAP_MEMBERSHIP]:
      getOperationMetadataObject(stepsHistory, OPERATION_METADATA_KEY.BOOTSTRAP_MEMBERSHIP),
  });
  return Object.freeze({
    operationId: row.operation_id,
    type: row.type,
    partitionId: row.partition_id,
    entityType,
    entityId,
    sourceNodeId: row.source_node_id,
    targetNodeId: row.target_node_id,
    replicaId: row.replica_id,
    sourceReplicaId: row.source_replica_id,
    status: row.status,
    workflowStep: row.workflow_step,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    completedAt: row.completed_at,
    stepsHistory,
    founder,
  });
}

function observeIncompleteOperationRow(repository, row) {
  try {
    return Object.freeze({
      disposition: INCOMPLETE_ROW_DISPOSITION.EXECUTABLE,
      operation: repository.rowToOperation(row),
    });
  } catch (error) {
    if (error?.reasonCode !== GROWTH_PROMOTION_COHORT_UNRESOLVED) throw error;
    return Object.freeze({
      disposition: INCOMPLETE_ROW_DISPOSITION.UNRESOLVED_GROWTH,
      reasonCode: error.reasonCode,
      occupancy: readOperationOccupancy(row),
    });
  }
}

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

  class ReplicaOperationRepositoryIncompleteReadMethods {
    /**
   * Normalize incomplete-operation rows into the canonical owner view.
   * @param {Object[]} rows
   * @return {Object[]}
   * @private
   */
    mapAndSortIncompleteOperations(rows = []) {
      return rows
        .filter((row) => isIncompleteOperationRowStep(row.type, row.workflow_step))
        .map((row) => observeIncompleteOperationRow(this, row))
        .flatMap((outcome) => {
          if (outcome.disposition === INCOMPLETE_ROW_DISPOSITION.EXECUTABLE) {
            return [outcome.operation];
          }
          const {operationId, partitionId} = outcome.occupancy;
          this.logger.warn(outcome.reasonCode, {operationId, partitionId});
          return [];
        })
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
      const sourceNodeId = String(
        operation?.sourceNodeId || operation?.source_node_id || '',
      );
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
        return isIncompleteOperationRowStep(row.type, row.workflow_step);
      });
      if (cachedRows === null) {
        return [];
      }
      return this.mapAndSortIncompleteOperations(cachedRows);
    }

    /**
   * Query all incomplete (in-flight) operations owned by this node.
   * @param {object} [options={}]
   * @param {string} [options.visibilityReadMode]
   * @return {Promise<Array>}
   */
    /**
   * Cluster-wide authoritative occupancy of live ledger writers (every
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
      return result.rows.map(readOperationOccupancy)
        .filter((occupancy) => !this.isOperationTerminal(occupancy));
    }

    async queryIncompleteOperations(options = {}) {
      const visibilityReadMode = resolveReplicaOperationVisibilityReadMode(options);
      const requireAuthoritativeOutcome =
        options.requireAuthoritativeOutcome === true;
      const authoritativeReadOptions =
        buildReplicaOperationVisibilityReadOptions(visibilityReadMode);
      const cachedOperations = this.queryCachedIncompleteOperations();

      if (
        visibilityReadMode !==
          REPLICA_OPERATION_VISIBILITY_READ_MODE.OWNER_RPC_REQUIRED &&
        visibilityReadMode !==
          REPLICA_OPERATION_VISIBILITY_READ_MODE.OWNER_RPC_SINGLE_ATTEMPT
      ) {
        if (
          cachedOperations.length === 0 &&
        this.nextIncompleteOperationSqlRetryAtMs > this.timeSource.now()
        ) {
          return this.resolveDeferredIncompleteOperationReadFallback(cachedOperations);
        }
        if (
          cachedOperations.length > 0 ||
        visibilityReadMode === REPLICA_OPERATION_VISIBILITY_READ_MODE.CACHE_ONLY
        ) {
          this.recordIncompleteOperationObservation(cachedOperations);
          this.clearIncompleteOperationReadOutcome();
          return cachedOperations;
        }
      }

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
        authoritativeReadOptions,
      );
      const queryDurationMs = this.timeSource.now() - queryStartedAtMs;
      const rowCount = Array.isArray(result?.rows) ? result.rows.length : 0;
      const planningSnapshot = this.resolvePriorityRecoveryPlanningSnapshotForOwnerRead();

      if (!result.success || !result.rows) {
        const fallbackOperations =
        this.resolveDeferredIncompleteOperationReadFallback(cachedOperations);
        const deferredOutcome = this.buildDeferredIncompleteOperationReadOutcome({
          priorityRecoveryActive:
            requireAuthoritativeOutcome ||
            this.shouldDeferIncompleteOperationReadFailure(
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
          this.timeSource.now() + this.getRetryableIncompleteOperationReadBackoffMs(result);
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

      this.nextIncompleteOperationSqlRetryAtMs = 0;

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
          const nowMs = this.timeSource.now();
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
        const nowMs = this.timeSource.now();
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
