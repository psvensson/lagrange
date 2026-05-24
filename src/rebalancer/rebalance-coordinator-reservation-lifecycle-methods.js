import {REBALANCE_COORDINATOR_SHARED} from './rebalance-coordinator-shared.js';

const LOCAL_STR_FUNCTION = 'function';

const RESERVATION_ORPHAN_RECONCILE_STATE = Object.freeze({
  ABSENT_OPERATION: 'absent_operation',
  DEFERRED_OPERATION_VISIBILITY: 'deferred_operation_visibility',
  NON_TERMINAL_OPERATION: 'non_terminal_operation',
  TERMINAL_OPERATION: 'terminal_operation',
});

const RESERVATION_ORPHAN_RECONCILE_ACTION = Object.freeze({
  KEEP_ACTIVE: 'keep_active',
  RELEASE_ACTIVE: 'release_active',
});

const RESERVATION_ORPHAN_RECONCILE_STATE_TABLE = Object.freeze([
  Object.freeze({
    state: RESERVATION_ORPHAN_RECONCILE_STATE.TERMINAL_OPERATION,
    matches: (evidence) =>
      evidence.operationVisible === true && evidence.operationTerminal === true,
  }),
  Object.freeze({
    state: RESERVATION_ORPHAN_RECONCILE_STATE.NON_TERMINAL_OPERATION,
    matches: (evidence) =>
      evidence.operationVisible === true && evidence.operationTerminal !== true,
  }),
  Object.freeze({
    state: RESERVATION_ORPHAN_RECONCILE_STATE.DEFERRED_OPERATION_VISIBILITY,
    matches: (evidence) => evidence.ownerReadDeferred === true,
  }),
  Object.freeze({
    state: RESERVATION_ORPHAN_RECONCILE_STATE.ABSENT_OPERATION,
    matches: () => true,
  }),
]);

const RESERVATION_ORPHAN_RECONCILE_ACTION_BY_STATE = Object.freeze(
  new Map([
    [
      RESERVATION_ORPHAN_RECONCILE_STATE.TERMINAL_OPERATION,
      RESERVATION_ORPHAN_RECONCILE_ACTION.RELEASE_ACTIVE,
    ],
    [
      RESERVATION_ORPHAN_RECONCILE_STATE.NON_TERMINAL_OPERATION,
      RESERVATION_ORPHAN_RECONCILE_ACTION.KEEP_ACTIVE,
    ],
    [
      RESERVATION_ORPHAN_RECONCILE_STATE.DEFERRED_OPERATION_VISIBILITY,
      RESERVATION_ORPHAN_RECONCILE_ACTION.KEEP_ACTIVE,
    ],
    [
      RESERVATION_ORPHAN_RECONCILE_STATE.ABSENT_OPERATION,
      RESERVATION_ORPHAN_RECONCILE_ACTION.RELEASE_ACTIVE,
    ],
  ]),
);

const {
  DEFAULT_AMPLIFICATION_FACTOR,
  NUM,
  OperationType,
  REBALANCE_COORDINATOR_ERROR_MSG,
  REBALANCE_COORDINATOR_EVENT,
  REBALANCE_COORDINATOR_LOG_MSG,
  RESERVATION_REASON,
  RESERVATION_STATUS,
  SERVICE_TYPE,
  SQL,
  STORAGE_RESERVATION_READ_QUERY_OPTIONS,
  SYSTEM_TABLE_NAME,
  assertCritical,
  readAuthoritativeControlPlaneRows,
} = REBALANCE_COORDINATOR_SHARED;

class RebalanceCoordinatorReservationLifecycleMethods {
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
   * Read the canonical visibility contract for one reservation-backed
   * operation before deciding whether the reservation is orphaned.
   *
   * @param {string|null} operationId
   * @return {Promise<Object>}
   * @private
   */
  async getReservationOperationVisibilityObservation(operationId) {
    if (
      typeof this.repository?.getOperationByIdVisibilityObservation ===
      LOCAL_STR_FUNCTION
    ) {
      return this.repository.getOperationByIdVisibilityObservation(
        operationId,
        {
          requireOwnerRpcRead: false,
          allowPriorityRecoveryDeferredVisibility: true,
        },
      );
    }
    const operation = operationId ?
      await this.queryOperationById(operationId) :
      null;
    return Object.freeze({
      operation,
      deferredOutcome: null,
    });
  }

  /**
   * @param {Object|null} visibilityObservation
   * @return {Object}
   * @private
   */
  buildReservationOrphanReconcileSnapshot(visibilityObservation) {
    const operation = visibilityObservation?.operation || null;
    const deferredOutcome =
      visibilityObservation?.deferredOutcome &&
      typeof visibilityObservation.deferredOutcome === 'object' ?
        visibilityObservation.deferredOutcome :
        null;
    const evidence = Object.freeze({
      operationVisible: operation !== null,
      operationTerminal: this.isOperationTerminal(operation),
      ownerReadDeferred: deferredOutcome !== null,
    });
    const state =
      RESERVATION_ORPHAN_RECONCILE_STATE_TABLE.find((candidate) =>
        candidate.matches(evidence),
      )?.state || RESERVATION_ORPHAN_RECONCILE_STATE.ABSENT_OPERATION;
    const action =
      RESERVATION_ORPHAN_RECONCILE_ACTION_BY_STATE.get(state) ||
      RESERVATION_ORPHAN_RECONCILE_ACTION.KEEP_ACTIVE;
    return Object.freeze({
      action,
      deferredOutcome,
      evidence,
      operation,
      state,
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

    const activeResult = await readAuthoritativeControlPlaneRows(
      this.controlPlaneSystemTableGateway,
      SYSTEM_TABLE_NAME.STORAGE_RESERVATIONS,
      SQL.SELECT_ACTIVE_RESERVATIONS,
      [RESERVATION_STATUS.ACTIVE],
      STORAGE_RESERVATION_READ_QUERY_OPTIONS,
    );

    if (activeResult.success && activeResult.rows) {
      for (const row of activeResult.rows) {
        const visibilityObservation =
          await this.getReservationOperationVisibilityObservation(
            row.operation_id,
          );
        const reconcileSnapshot =
          this.buildReservationOrphanReconcileSnapshot(visibilityObservation);
        if (
          reconcileSnapshot.action !==
          RESERVATION_ORPHAN_RECONCILE_ACTION.RELEASE_ACTIVE
        ) {
          continue;
        }
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
}

function applyRebalanceCoordinatorReservationLifecycleMethods(targetClass) {
  const sourcePrototype =
    RebalanceCoordinatorReservationLifecycleMethods.prototype;
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

export {applyRebalanceCoordinatorReservationLifecycleMethods};
