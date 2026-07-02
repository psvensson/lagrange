import {REBALANCE_COORDINATOR_SHARED} from './rebalance-coordinator-shared.js';

const {
  OperationType,
  REBALANCER_SKIP_REASON,
  REBALANCE_COORDINATOR_ERROR_MSG,
  TOPOLOGY_GUARD_ERROR_MSG,
} = REBALANCE_COORDINATOR_SHARED;

class RebalanceCoordinatorConcurrentBudgetGate {
  async ensureConcurrentOperationBudgetAllowed(
    normalizedMoveType,
    options = {},
  ) {
    const bypassEmptyQueryDelay = this.shouldBypassConcurrentBudgetEmptyBackoff(
      normalizedMoveType,
      options,
    );
    const concurrentBudgetReadMode = this.resolveConcurrentBudgetReadMode(
      normalizedMoveType,
      options,
    );
    if (
      normalizedMoveType === OperationType.ADD ||
      normalizedMoveType === OperationType.REPLACE
    ) {
      const usePriorityConcurrentAddLane =
        this.shouldUsePriorityConcurrentAddLane(normalizedMoveType, options);
      const concurrentAddLimit = usePriorityConcurrentAddLane ?
        this.getPriorityConcurrentAddBudgetLimit(options) :
        this.getConcurrentAddBudgetLimit(options);
      const canStart = usePriorityConcurrentAddLane ?
        await this.canStartPriorityAddOperation({
          bypassEmptyQueryDelay,
          concurrentBudgetReadMode,
          partitionId: options.partitionId,
        }) :
        await this.canStartAddOperation({
          bypassEmptyQueryDelay,
          concurrentBudgetReadMode,
          partitionId: options.partitionId,
        });
      if (canStart) {
        return;
      }
      throw this.createConcurrentOperationBudgetError(
        normalizedMoveType,
        concurrentAddLimit,
      );
    }

    if (normalizedMoveType === OperationType.REMOVE) {
      const canStart = await this.canStartRemoveOperation({
        bypassEmptyQueryDelay,
        concurrentBudgetReadMode,
        partitionId: options.partitionId,
      });
      if (canStart) {
        return;
      }
      throw this.createConcurrentOperationBudgetError(
        normalizedMoveType,
        this.config.maxConcurrentRemoves,
      );
    }
  }

  /**
   * Build a typed concurrent-budget error for rebalancer callers.
   * @param {string|null} normalizedMoveType
   * @param {number} limit
   * @return {Error}
   * @private
   */
  createConcurrentOperationBudgetError(
    normalizedMoveType,
    limit,
    options = {},
  ) {
    const error = new Error(
      options.message ||
        `Concurrent ${String(normalizedMoveType || 'operation').toLowerCase()} ` +
          `budget exceeded at limit ${limit}`,
    );
    error.rebalanceSkipReason = REBALANCER_SKIP_REASON.BUDGET_EXCEEDED;
    error.operationType = normalizedMoveType || null;
    error.limit = limit;
    if (options.conflictingOperationId) {
      error.conflictingOperationId = options.conflictingOperationId;
    }
    return error;
  }

  /**
   * Build one typed deferred-visibility error for planner callers when the
   * authoritative replica_operations owner path cannot yet prove emptiness.
   * @param {string|null} normalizedMoveType
   * @param {Object|null} observation
   * @param {Object} [options={}]
   * @return {Error}
   * @private
   */
  createDeferredOperationVisibilityError(
    normalizedMoveType,
    observation,
    options = {},
  ) {
    const entityType = String(options?.entityType || 'entity');
    const entityId = String(
      options?.entityId ||
        options?.partitionId ||
        options?.replicaId ||
        'unknown',
    );
    const deferredOutcome =
      observation?.deferredOutcome &&
      typeof observation.deferredOutcome === 'object' ?
        observation.deferredOutcome :
        null;
    const reasonCode =
      typeof deferredOutcome?.reasonCode === 'string' ?
        deferredOutcome.reasonCode :
        'authoritative_operation_visibility_deferred';
    const error = new Error(
      'Authoritative operation visibility deferred for ' +
        entityType +
        ':' +
        entityId +
        ' (' +
        reasonCode +
        ')',
    );
    error.rebalanceSkipReason = REBALANCER_SKIP_REASON.DEFERRED_RETRY_PENDING;
    error.operationType = normalizedMoveType || null;
    error.entityType = entityType;
    error.entityId = entityId;
    error.partitionId = options?.partitionId || null;
    error.replicaId = options?.replicaId || null;
    error.operationVisibilityState = observation?.state || null;
    error.completionState = deferredOutcome?.completionState || null;
    error.reasonCode = reasonCode;
    error.retryAfterMs = Number.isFinite(deferredOutcome?.retryAfterMs) ?
      deferredOutcome.retryAfterMs :
      null;
    return error;
  }

  /**
   * Build a typed conflict error for overlapping operation lifecycles.
   * @param {string|null} normalizedMoveType
   * @param {string} replicaId
   * @param {Object} conflictingOperation
   * @return {Error}
   * @private
   */
  createConflictingOperationInFlightError(
    normalizedMoveType,
    replicaId,
    conflictingOperation,
  ) {
    const operationTypeText = String(
      normalizedMoveType || 'operation',
    ).toLowerCase();
    const error = new Error(
      `${REBALANCE_COORDINATOR_ERROR_MSG.CONFLICTING_OPERATION_IN_FLIGHT} ` +
        `${replicaId}: ${operationTypeText} conflicts with ` +
        `${String(conflictingOperation?.type || 'unknown')} ` +
        `${String(conflictingOperation?.operationId || 'unknown')}`,
    );
    error.rebalanceSkipReason =
      REBALANCER_SKIP_REASON.CONFLICTING_OPERATION_IN_FLIGHT;
    error.operationType = normalizedMoveType || null;
    error.replicaId = replicaId;
    error.conflictingOperationId = conflictingOperation?.operationId || null;
    return error;
  }

  /**
   * Build a typed conflict error when one entity already owns a live
   * REPLACE source-removal phase workflow and callers try to admit another
   * add-like lifecycle for that same entity.
   * @param {string|null} normalizedMoveType
   * @param {string|null} entityId
   * @param {Object} conflictingOperation
   * @return {Error}
   * @private
   */
  createEntityConflictingOperationInFlightError(
    normalizedMoveType,
    entityId,
    conflictingOperation,
  ) {
    const operationTypeText = String(
      normalizedMoveType || 'operation',
    ).toLowerCase();
    const error = new Error(
      `${REBALANCE_COORDINATOR_ERROR_MSG.CONFLICTING_OPERATION_IN_FLIGHT} ` +
        `${String(entityId || 'unknown')}: ${operationTypeText} conflicts with ` +
        `${String(conflictingOperation?.type || 'unknown')} ` +
        `${String(conflictingOperation?.operationId || 'unknown')}`,
    );
    error.rebalanceSkipReason =
      REBALANCER_SKIP_REASON.CONFLICTING_OPERATION_IN_FLIGHT;
    error.operationType = normalizedMoveType || null;
    error.entityId = entityId || null;
    error.conflictingOperationId = conflictingOperation?.operationId || null;
    return error;
  }

  /**
   * Build a typed topology-guard error for coordinator callers so stale
   * planner views are reported through the existing admission/skipped-move
   * channel.
   * @param {Object} move
   * @param {Object} admissionResult
   * @return {Error}
   * @private
   */
  createTopologyGuardAdmissionError(move, admissionResult) {
    const blockingReason =
      Array.isArray(admissionResult?.blockingReasons) &&
      admissionResult.blockingReasons.length > 0 ?
        String(admissionResult.blockingReasons[0] || '') :
        String(admissionResult?.reason || '');
    const error = new Error(
      TOPOLOGY_GUARD_ERROR_MSG.BLOCKED_PREFIX +
        ' ' +
        'for ' +
        String(move?.type || 'operation') +
        ' on ' +
        String(move?.nodeId || 'unknown') +
        (blockingReason ? ': ' + blockingReason : ''),
    );
    error.admissionResult = admissionResult;
    return error;
  }
}

function applyRebalanceCoordinatorConcurrentBudgetGateMethods(targetClass) {
  const sourcePrototype = RebalanceCoordinatorConcurrentBudgetGate.prototype;
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

export {applyRebalanceCoordinatorConcurrentBudgetGateMethods};
