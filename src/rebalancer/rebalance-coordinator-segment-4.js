import {REBALANCE_COORDINATOR_SHARED} from './rebalance-coordinator-shared.js';
import {RebalanceCoordinatorSegment3} from './rebalance-coordinator-segment-3.js';

const LOCAL_STR_FUNCTION = 'function';

const {
  CONTROL_PLANE_READINESS_DIMENSION,
  DEFAULT_AMPLIFICATION_FACTOR,
  NUM,
  OperationType,
  REBALANCER_SKIP_REASON,
  REBALANCE_COORDINATOR_ERROR_MSG,
  REBALANCE_COORDINATOR_EVENT,
  REBALANCE_COORDINATOR_LOG_MSG,
  RESERVATION_REASON,
  RESERVATION_STATUS,
  SERVICE_TYPE,
  SQL,
  STORAGE_RESERVATION_READ_QUERY_OPTIONS,
  SYSTEM_TABLE_NAME,
  TOPOLOGY_GUARD_ERROR_MSG,
  assertCritical,
  isPriorityControlPlanePartitionTable,
  readAuthoritativeControlPlaneRows,
} = REBALANCE_COORDINATOR_SHARED;

class RebalanceCoordinatorSegment4 extends RebalanceCoordinatorSegment3 {
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
   * Ensure storage admission approves one storage-increasing workflow.
   * @param {Object} context
   * @return {Promise<void>}
   * @private
   */
  async ensureProvisioningAdmissionAllowed(context) {
    return this.provisioningAdmissionPolicy.ensureProvisioningAdmissionAllowed(
      context,
    );
  }

  /**
   * Evaluate storage admission for one storage-increasing move.
   * @param {Object} context
   * @return {Promise<Object>} Normalized evaluation output.
   * @private
   */
  async evaluateProvisioningAdmission(context) {
    return this.provisioningAdmissionPolicy.evaluateProvisioningAdmission(
      context,
    );
  }

  /**
   * Estimate replica bytes for admission decisions.
   * @param {string} entityType
   * @return {number}
   * @private
   */
  estimateProvisioningAdmissionBytes(entityType) {
    return this.provisioningAdmissionPolicy.estimateProvisioningAdmissionBytes(
      entityType,
    );
  }

  /**
   * Verify admission and accounting owners are available for storage-increasing moves.
   * @param {string} moveType
   * @return {void}
   * @private
   */
  assertProvisioningAdmissionDependencies(moveType) {
    return this.provisioningAdmissionPolicy.assertProvisioningAdmissionDependencies(
      moveType,
    );
  }

  /**
   * Build a typed admission-denied error for coordinator callers.
   * @param {Object} move
   * @param {Object} admissionResult
   * @return {Error}
   * @private
   */
  createProvisioningAdmissionError(move, admissionResult) {
    return this.provisioningAdmissionPolicy.createProvisioningAdmissionError(
      move,
      admissionResult,
    );
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
      admissionResult.blockingReasons.length > NUM.ZERO ?
        String(admissionResult.blockingReasons[NUM.ZERO] || '') :
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

  /**
   * Persist a new operation via SQL engine.
   *
   * OWNERSHIP BOUNDARY: RebalanceCoordinator is the sole writer for
   * steady-state replica_operations rows (ADD/REMOVE/REPLACE).
   * BootstrapAPI owns a separate domain for MOVE_REPLICA handoff
   * and MOVE_ASSIGNMENT reservation rows created during node join.
   * The two domains are distinguished by operation type and creation
   * context. See BootstrapAPI.insertMoveReplicaHandoffOperation for
   * the bootstrap-side boundary contract.
   *
   * @readModel COORDINATOR_OPERATION_PERSIST —
   *   READ_MODEL_SOURCE.AUTHORITATIVE_SQL
   * @param {Object} operation - Operation to persist.
   * @return {Promise<boolean>} True when row inserted, false when ignored.
   * @private
   */
  async persistNewOperation(operation) {
    return this.repository.persistNewOperation(operation);
  }

  /**
   * Update an existing operation via SQL engine.
   * @param {Object} operation - Operation to update.
   * @return {Promise<void>}
   * @private
   */
  async persistOperationUpdate(operation, options = {}) {
    return this.runReplicaOperationTransitionExclusive(
      () => this.repository.persistOperationUpdate(operation, options),
      {operation},
    );
  }

  /**
   * Wait for replica_operations cache visibility after SQL persistence.
   * @param {Object} operation
   * @return {Promise<void>}
   * @private
   */
  async waitForReplicaOperationCacheVisibility(operation) {
    return this.repository.waitForReplicaOperationCacheVisibility(operation);
  }

  /**
   * Execute operation mutation SQL with retry for transient leader gaps.
   * @param {string} sql - SQL statement.
   * @param {Array<*>} params - Statement parameters.
   * @return {Promise<Object>} SQL query result.
   * @private
   */
  async executeOperationMutationWithRetry(sql, params, options = {}) {
    return this.repository.executeOperationMutationWithRetry(
      sql,
      params,
      options,
    );
  }

  /**
   * Check whether operation persist error is transient and retryable.
   * @param {string} errorMessage - SQL error message.
   * @return {boolean} True when retry should be attempted.
   * @private
   */
  isRetryableOperationPersistError(errorMessage) {
    return this.repository.isRetryableOperationPersistError(errorMessage);
  }

  /**
   * Delay helper for operation mutation retry loop.
   * @param {number} delayMs - Delay duration in milliseconds.
   * @return {Promise<void>}
   * @private
   */
  async waitForOperationPersistRetry(delayMs) {
    return this.repository.waitForOperationPersistRetry(delayMs);
  }

  /**
   * Build query options for one owner-managed mutation.
   * Coordinator writes must not inherit the default SQL session.
   * @param {Object} [options={}] - Mutation routing options.
   * @return {Object}
   * @private
   */
  buildOperationMutationQueryOptions(options = {}) {
    return this.repository.buildOperationMutationQueryOptions(options);
  }

  /**
   * Resolve the SQL session for one owner-managed mutation.
   * @param {Object} [options={}] - Mutation routing options.
   * @return {string}
   * @private
   */
  resolveOperationMutationSessionId(options = {}) {
    return this.repository.resolveOperationMutationSessionId(options);
  }

  // --- Reservation lifecycle (Req 4.1, 4.2, 4.3, 4.4, 4.5) ---

  /**
   * Check whether an operation type increases storage on the target node.
   * Only ADD and REPLACE operations require reservations.
   * @param {string} operationType - Operation type.
   * @return {boolean}
   * @private
   */
  isStorageIncreasingOperation(operationType) {
    return (
      operationType === OperationType.ADD ||
      operationType === OperationType.REPLACE
    );
  }

  /**
   * Map operation type to reservation reason code.
   * @param {string} operationType - Operation type.
   * @return {string} Reservation reason code.
   * @private
   */
  getReservationReasonCode(operationType) {
    if (operationType === OperationType.REPLACE) {
      return RESERVATION_REASON.REPLACE_REPLICA;
    }
    return RESERVATION_REASON.ADD_REPLICA;
  }

  /**
   * Resolve mutation change counts from SQL-engine responses.
   * @param {Object} result - SQL query result.
   * @return {number|null} Number of changed rows, or null when unavailable.
   * @private
   */
  extractMutationChangeCount(result) {
    return this.repository.extractMutationChangeCount(result);
  }

  /**
   * Transition one active reservation row by its canonical primary key.
   * @param {string} reservationId - Reservation primary key.
   * @param {string} nextStatus - Target reservation status.
   * @param {number} now - Transition timestamp.
   * @return {Promise<Object>} Transition result.
   * @private
   */
  async transitionActiveReservationById(
    reservationId,
    nextStatus,
    now,
    options = {},
  ) {
    const result = await this.executeOperationMutationWithRetry(
      SQL.UPDATE_RESERVATION_STATUS_BY_ID,
      [nextStatus, now, now, reservationId, RESERVATION_STATUS.ACTIVE],
      {
        ownerId: options.ownerId || reservationId,
        sessionId: options.sessionId,
      },
    );
    if (!result.success) {
      return {
        success: false,
        changed: false,
        error: result.error || null,
      };
    }

    const changeCount = this.extractMutationChangeCount(result);
    return {
      success: true,
      changed: changeCount === null || changeCount > NUM.ZERO,
      changeCount,
    };
  }

  /**
   * Create a storage reservation atomically with operation creation.
   * Delegates size estimation to the accounting service.
   * Requirements: 4.1
   *
   * @param {Object} operation - The persisted operation record.
   * @return {Promise<void>}
   * @private
   */
  async createReservationForOperation(operation, options = {}) {
    if (!this.isStorageIncreasingOperation(operation.type)) {
      return;
    }
    assertCritical(
      this.storageAccountingService &&
        typeof this.storageAccountingService.estimateReplicaBytes ===
          LOCAL_STR_FUNCTION,
      REBALANCE_COORDINATOR_ERROR_MSG.STORAGE_ACCOUNTING_REQUIRED,
    );

    const estimatedBytes = this.storageAccountingService.estimateReplicaBytes({
      entityType: operation.entityType || SERVICE_TYPE.PARTITION,
      sizeBytes: NUM.ZERO,
    });

    const now = Date.now();
    const reservationId = `res-${operation.operationId}`;
    const expiresAt = now + this.config.reservationTtlMs;

    const result = await this.executeOperationMutationWithRetry(
      SQL.INSERT_RESERVATION,
      [
        reservationId,
        operation.operationId,
        operation.entityType || SERVICE_TYPE.PARTITION,
        operation.entityId || operation.partitionId,
        operation.partitionId,
        operation.targetNodeId,
        estimatedBytes,
        DEFAULT_AMPLIFICATION_FACTOR,
        RESERVATION_STATUS.ACTIVE,
        this.getReservationReasonCode(operation.type),
        now,
        now,
        expiresAt,
      ],
      {
        ownerId: operation.operationId,
        sessionId: options.sessionId,
      },
    );

    if (!result.success) {
      this.logger.warn(
        REBALANCE_COORDINATOR_LOG_MSG.RESERVATION_CREATE_FAILED,
        {
          operationId: operation.operationId,
          reservationId,
          error: result.error,
        },
      );
      return;
    }

    this.stats.reservationsCreated++;

    this.logger.info(REBALANCE_COORDINATOR_LOG_MSG.RESERVATION_CREATED, {
      reservationId,
      operationId: operation.operationId,
      targetNodeId: operation.targetNodeId,
      estimatedBytes,
      expiresAt,
    });

    this.emit(REBALANCE_COORDINATOR_EVENT.RESERVATION_CREATED, {
      reservationId,
      operationId: operation.operationId,
      targetNodeId: operation.targetNodeId,
      estimatedBytes,
    });
  }

  /**
   * Release the storage reservation tied to an operation.
   * Called on terminal outcomes (completed, failed, cancelled).
   * Requirements: 4.3
   *
   * @param {Object} operation - The terminal operation record.
   * @return {Promise<void>}
   * @private
   */
  async releaseReservationForOperation(operation) {
    if (!this.isStorageIncreasingOperation(operation.type)) {
      return;
    }

    const activeResult = await readAuthoritativeControlPlaneRows(
      this.controlPlaneSystemTableGateway,
      SYSTEM_TABLE_NAME.STORAGE_RESERVATIONS,
      SQL.SELECT_ACTIVE_RESERVATIONS_BY_OPERATION,
      [operation.operationId, RESERVATION_STATUS.ACTIVE],
      STORAGE_RESERVATION_READ_QUERY_OPTIONS,
    );
    if (!activeResult.success) {
      this.logger.warn(
        REBALANCE_COORDINATOR_LOG_MSG.RESERVATION_RELEASE_FAILED,
        {
          operationId: operation.operationId,
          error: activeResult.error,
        },
      );
      return;
    }

    const now = Date.now();
    let releasedCount = NUM.ZERO;
    const rows = Array.isArray(activeResult.rows) ? activeResult.rows : [];
    for (const row of rows) {
      const transition = await this.transitionActiveReservationById(
        row.reservation_id,
        RESERVATION_STATUS.RELEASED,
        now,
      );
      if (!transition.success) {
        this.logger.warn(
          REBALANCE_COORDINATOR_LOG_MSG.RESERVATION_RELEASE_FAILED,
          {
            operationId: operation.operationId,
            reservationId: row.reservation_id,
            error: transition.error,
          },
        );
        continue;
      }
      if (transition.changed) {
        releasedCount++;
      }
    }
    if (releasedCount <= NUM.ZERO) {
      return;
    }

    this.stats.reservationsReleased += releasedCount;

    this.logger.info(REBALANCE_COORDINATOR_LOG_MSG.RESERVATION_RELEASED, {
      operationId: operation.operationId,
      releasedCount,
    });

    this.emit(REBALANCE_COORDINATOR_EVENT.RESERVATION_RELEASED, {
      operationId: operation.operationId,
    });
  }

  /**
   * Reconcile stale and orphan reservations.
   * - Expire active reservations past their TTL.
   * - Release active reservations whose operations are terminal.
   * Called during startup recovery and periodically.
   * Requirements: 4.4, 12.3
   *
   * @return {Promise<Object>} Reconciliation result counts.
   */
  async reconcileReservations() {
    this.logger.info(REBALANCE_COORDINATOR_LOG_MSG.RESERVATION_RECONCILE_START);

    const now = Date.now();
    let expired = NUM.ZERO;
    let orphansReleased = NUM.ZERO;

    // 1. Expire reservations past TTL, keyed by reservation_id.
    const staleResult = await readAuthoritativeControlPlaneRows(
      this.controlPlaneSystemTableGateway,
      SYSTEM_TABLE_NAME.STORAGE_RESERVATIONS,
      SQL.SELECT_EXPIRED_ACTIVE_RESERVATIONS,
      [RESERVATION_STATUS.ACTIVE, now],
      STORAGE_RESERVATION_READ_QUERY_OPTIONS,
    );
    if (staleResult.success && Array.isArray(staleResult.rows)) {
      for (const row of staleResult.rows) {
        const transition = await this.transitionActiveReservationById(
          row.reservation_id,
          RESERVATION_STATUS.EXPIRED,
          now,
        );
        if (!transition.success) {
          this.logger.warn(
            REBALANCE_COORDINATOR_LOG_MSG.RESERVATION_RELEASE_FAILED,
            {
              operationId: row.operation_id,
              reservationId: row.reservation_id,
              error: transition.error,
            },
          );
          continue;
        }
        if (transition.changed) {
          expired++;
        }
      }
    } else if (!staleResult.success) {
      this.logger.warn(
        REBALANCE_COORDINATOR_LOG_MSG.RESERVATION_RELEASE_FAILED,
        {
          operationId: null,
          reservationId: null,
          error: staleResult.error,
        },
      );
    }

    if (expired > NUM.ZERO) {
      this.logger.info(
        REBALANCE_COORDINATOR_LOG_MSG.RESERVATION_RECONCILE_EXPIRED,
        {count: expired},
      );
    }

    // 2. Release orphan reservations (operation is terminal)
    const activeResult = await readAuthoritativeControlPlaneRows(
      this.controlPlaneSystemTableGateway,
      SYSTEM_TABLE_NAME.STORAGE_RESERVATIONS,
      SQL.SELECT_ACTIVE_RESERVATIONS,
      [RESERVATION_STATUS.ACTIVE],
      STORAGE_RESERVATION_READ_QUERY_OPTIONS,
    );

    if (activeResult.success && activeResult.rows) {
      for (const row of activeResult.rows) {
        const op = await this.queryOperationById(row.operation_id);
        const isTerminal = !op || this.isOperationTerminal(op);
        if (isTerminal) {
          const transition = await this.transitionActiveReservationById(
            row.reservation_id,
            RESERVATION_STATUS.RELEASED,
            now,
          );
          if (!transition.success) {
            this.logger.warn(
              REBALANCE_COORDINATOR_LOG_MSG.RESERVATION_RELEASE_FAILED,
              {
                operationId: row.operation_id,
                reservationId: row.reservation_id,
                error: transition.error,
              },
            );
            continue;
          }
          if (transition.changed) {
            orphansReleased++;
            this.logger.info(
              REBALANCE_COORDINATOR_LOG_MSG.RESERVATION_RECONCILE_ORPHAN,
              {
                reservationId: row.reservation_id,
                operationId: row.operation_id,
              },
            );
          }
        }
      }
    }

    this.stats.reservationsReconciled += expired + orphansReleased;

    this.logger.info(
      REBALANCE_COORDINATOR_LOG_MSG.RESERVATION_RECONCILE_COMPLETED,
      {expired, orphansReleased},
    );

    this.emit(REBALANCE_COORDINATOR_EVENT.RESERVATION_RECONCILED, {
      expired,
      orphansReleased,
    });

    return {expired, orphansReleased};
  }

  /**
   * Execute an operation (ADD or REMOVE).
   * Uses MessageRouter delivery to the target node.
   * Requirements: 2.1
   *
   * @param {Object} operation - Operation to execute.
   * @return {Promise<Object>} Execution result.
   */
  async executeOperation(operation) {
    return this.workflowOwner.executeOperation(operation);
  }

  /**
   * Resolve an operation id from one supported caller payload.
   * @param {string|Object} operationInput - Operation id, row, or payload.
   * @return {string|null}
   * @private
   */
  getOperationIdFromInput(operationInput) {
    return this.workflowOwner.getOperationIdFromInput(operationInput);
  }

  /**
   * Normalize one dispatch input to a canonical operation object.
   * @param {string|Object} operationInput - Operation id, row, or payload.
   * @return {Promise<Object|null>}
   * @private
   */
  async resolveDispatchOperation(operationInput) {
    return this.workflowOwner.resolveDispatchOperation(operationInput);
  }

  /**
   * Execute one dispatch attempt after ownership serialization.
   * Delegates to workflow owner (D7.1).
   * @param {string|Object} operationInput
   * @return {Promise<Object>}
   * @private
   */
  async dispatchOperationInternal(operationInput) {
    return this.workflowOwner.dispatchOperationInternal(operationInput);
  }

  /**
   * Execute operation body once per operation ID.
   * Delegates to workflow owner (D7.1).
   * @param {Object} operation
   * @return {Promise<Object>}
   * @private
   */
  async executeOperationInternal(operation) {
    return this.workflowOwner.executeOperationInternal(operation);
  }

  /**
   * Execute a step transition atomically.
   * Delegates to workflow owner (D7.1).
   * @param {Object} operation
   * @param {string} step
   * @param {string} reason
   * @param {Function} persistFn
   * @return {Promise<void>}
   * @private
   */
  async executeAtomicTransition(operation, step, reason, persistFn) {
    return this.workflowOwner.executeAtomicTransition(
      operation,
      step,
      reason,
      persistFn,
    );
  }

  /**
   * Serialize replica_operations step transitions.
   * @param {Function} executionFactory
   * @return {Promise<*>}
   * @private
   */
  runReplicaOperationTransitionExclusive(executionFactory, options = {}) {
    return this.repository.runReplicaOperationTransitionExclusive(
      executionFactory,
      options,
    );
  }

  /**
   * Update operation workflow step.
   * Requirements: 4.3
   *
   * @param {Object} operation - Operation to update.
   * @param {string} step - New workflow step.
   * @return {Promise<void>}
   */
  async updateStep(operation, step, reason) {
    return this.workflowOwner.updateStep(operation, step, reason);
  }

  /**
   * Complete an operation successfully.
   * Delegates to workflow owner (D7.1).
   * @param {Object} operation
   * @return {Promise<void>}
   */
  async completeOperation(operation) {
    return this.workflowOwner.completeOperation(operation);
  }

  /**
   * Get safety validation error for REMOVE operations, if any.
   * Critical system partition removes are blocked until a replacement
   * replica is voter-ready and routable.
   * @readModel COORDINATOR_SAFETY_CHECK —
   *   READ_MODEL_SOURCE.SYSTEM_TABLE_CACHE
   * @param {Object} operation - Operation to validate.
   * @return {Promise<string|null>} Error message or null when safe.
   * @private
   */
  async getRemoveSafetyError(operation) {
    return this.workflowOwner.getRemoveSafetyError(operation);
  }

  /**
   * Evaluate safety error for a move intent.
   * Delegates to workflow owner (D7.1).
   * @param {Object} move
   * @return {Promise<string|null>}
   */
  async getMoveSafetyError(move) {
    return this.workflowOwner.getMoveSafetyError(move);
  }

  /**
   * @param {string} partitionId
   * @return {boolean}
   * @private
   */
  isCriticalSystemPartition(partitionId) {
    return this.workflowOwner.isCriticalSystemPartition(partitionId);
  }

  /**
   * @param {string} partitionId
   * @return {boolean}
   * @private
   */
  isPriorityControlPlanePartition(partitionId) {
    return isPriorityControlPlanePartitionTable({
      partitionId,
    });
  }

  /**
   * Resolve the readiness dimension used for operation-scoped snapshots.
   * Critical system partition recovery paths must remain routable while
   * publication is converging; ordinary entities keep strict repair gating.
   *
   * @param {string|null} partitionId
   * @return {string}
   * @private
   */
  resolveOperationReadinessDecisionDimension(partitionId = null) {
    if (this.isCriticalSystemPartition(partitionId)) {
      return CONTROL_PLANE_READINESS_DIMENSION.CONTROL_PLANE_RECOVERY_ELIGIBLE;
    }
    return CONTROL_PLANE_READINESS_DIMENSION.REPAIR_ELIGIBLE;
  }

  /**
   * @param {Object} replicaRow
   * @return {boolean}
   * @private
   */
  isVoterReadyRoutableReplica(replicaRow) {
    return this.workflowOwner.isVoterReadyRoutableReplica(replicaRow);
  }

  /**
   * @param {Object} replicaRow
   * @param {Object} operation
   * @return {boolean}
   * @private
   */
  isOperationReplicaRow(replicaRow, operation) {
    return this.workflowOwner.isOperationReplicaRow(replicaRow, operation);
  }

  /**
   * @param {string} partitionId
   * @return {Promise<number>}
   * @private
   */
  async getCriticalMinReplicaCount(partitionId) {
    return this.workflowOwner.getCriticalMinReplicaCount(partitionId);
  }

  /**
   * @param {string} nodeId
   * @return {boolean}
   * @private
   */
  isNodeReadyForRouting(nodeId) {
    return this.workflowOwner.isNodeReadyForRouting(nodeId);
  }

  /**
   * Fail an operation.
   * Requirements: 6.2
   *
   * @param {Object} operation - Operation to fail.
   * @param {string} errorMessage - Error message.
   * @param {Object} [options] - Failure logging options.
   * @param {string} [options.logLevel] - Log level for failure event.
   * @param {string} [options.logMessage] - Log message override.
   * @param {Object} [options.stepMetadata] - FAILED step metadata.
   * @return {Promise<void>}
   */
  async failOperation(operation, errorMessage, options = {}) {
    return this.workflowOwner.failOperation(operation, errorMessage, options);
  }

  /**
   * Delegates to workflow owner (D7.1).
   * @param {Object} operation
   * @private
   */
  ensureOperationWorkflow(operation) {
    return this.workflowOwner.ensureOperationWorkflow(operation);
  }

  /**
   * Delegates to workflow owner (D7.1).
   * @param {string} previousStep
   * @param {string} nextStep
   * @return {string}
   * @private
   */
  resolveTransitionReason(previousStep, nextStep) {
    return this.workflowOwner.resolveTransitionReason(previousStep, nextStep);
  }

  /**
   * @param {string} errorMessage
   * @return {boolean}
   * @private
   */
  isSafetyPolicyFailure(errorMessage) {
    return this.workflowOwner.isSafetyPolicyFailure(errorMessage);
  }

  /**
   * @param {*} errorLike
   * @param {string} fallbackMessage
   * @return {string}
   * @private
   */
  normalizeErrorMessage(errorLike, fallbackMessage) {
    return this.workflowOwner.normalizeErrorMessage(errorLike, fallbackMessage);
  }

  /**
   * Check for timed out operations.
   * Queries operations via SQL engine (no in-memory cache).
   * Requirements: 6.2
   * @private
   */
}

export {RebalanceCoordinatorSegment4};
