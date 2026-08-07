import {REBALANCE_COORDINATOR_SHARED} from './rebalance-coordinator-shared.js';
import {
  OPERATION_RESERVATION_ATTEMPT_OUTCOME,
} from './operation-reservation-attempt-outcome.js';
import {
  trackStorageReservationReconcile,
} from '../diagnostics/raft-churn-sync-sections.js';

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
   * Whether this coordinator can establish storage reservations at all: the
   * accounting dependency is required to size a reservation insert. Reduced
   * harnesses constructed without the reservation subsystem report false so
   * the dispatch-time gate stays disengaged there; a production coordinator
   * always has the service (creation asserts it for storage-increasing
   * operations).
   * @return {boolean}
   * @private
   */
  hasStorageReservationSupport() {
    return (
      this.storageAccountingService &&
      typeof this.storageAccountingService.estimateReplicaBytes ===
        LOCAL_STR_FUNCTION
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
      changed: changeCount === null || changeCount > 0,
      changeCount,
    };
  }

  /**
   * Create the storage reservation backing an operation. The reservation is
   * written immediately AFTER operation persistence — not atomically with
   * it — so this method returns a typed disposition instead of silently
   * swallowing insert failures (audit finding 3): operation creation treats
   * a failure as fatal and the dispatch-time gate re-attempts through
   * ensureReservationForOperation before any storage-increasing dispatch.
   * Delegates size estimation to the accounting service, sizing on the
   * partition's REAL size_bytes: the caller that already resolved the
   * size at operation-creation time passes it via
   * options.resolvedEntitySizeBytes so the persisted reservation is the
   * same admission witness; repair paths resolve it from the cache.
   * Requirements: 4.1
   *
   * @param {Object} operation - The persisted operation record.
   * @param {Object} [options]
   * @param {number} [options.resolvedEntitySizeBytes] - Real size_bytes
   *   resolved before operation creation.
   * @return {Promise<Object>} {outcome, reservationId?, error?} — outcome is
   *   one of OPERATION_RESERVATION_ATTEMPT_OUTCOME; error is set on FAILED.
   * @private
   */
  async createReservationForOperation(operation, options = {}) {
    if (!this.isStorageIncreasingOperation(operation.type)) {
      return Object.freeze({
        outcome: OPERATION_RESERVATION_ATTEMPT_OUTCOME.NOT_REQUIRED,
      });
    }
    assertCritical(
      this.storageAccountingService &&
        typeof this.storageAccountingService.estimateReplicaBytes ===
          LOCAL_STR_FUNCTION,
      REBALANCE_COORDINATOR_ERROR_MSG.STORAGE_ACCOUNTING_REQUIRED,
    );

    const entityType = operation.entityType || SERVICE_TYPE.PARTITION;
    const entityId = operation.entityId || operation.partitionId;
    // Sizing (cache read) is isolated in the entity-size helper; this
    // method makes only the durable reservation SQL write decision.
    const estimatedBytes = this.estimateEntityAdmissionBytes({
      entityType,
      entityId,
      resolvedEntitySizeBytes: options.resolvedEntitySizeBytes,
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
      return Object.freeze({
        outcome: OPERATION_RESERVATION_ATTEMPT_OUTCOME.FAILED,
        reservationId,
        error: result.error || null,
      });
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

    return Object.freeze({
      outcome: OPERATION_RESERVATION_ATTEMPT_OUTCOME.CREATED,
      reservationId,
    });
  }

  /**
   * Repair the post-persist reservation side effect when a deterministic
   * operation collision reveals that the first creator did not finish its
   * local handoff, and gate storage-increasing dispatch on an ACTIVE
   * reservation (audit findings 3+11). The reservation primary key remains
   * operation-derived, so concurrent repair attempts converge on the same
   * row.
   * @param {Object} operation - Reused non-terminal operation.
   * @return {Promise<Object>} {outcome, reservationId?, error?} — CREATED
   *   when the deterministic insert landed, ALREADY_ACTIVE when an ACTIVE
   *   row already exists, NOT_REQUIRED for non-storage-increasing types,
   *   FAILED when no ACTIVE reservation could be established (or the
   *   authoritative read failed — absence of proof is not proof of
   *   presence).
   * @private
   */
  async ensureReservationForOperation(operation) {
    if (!this.isStorageIncreasingOperation(operation?.type)) {
      return Object.freeze({
        outcome: OPERATION_RESERVATION_ATTEMPT_OUTCOME.NOT_REQUIRED,
      });
    }
    const activeResult = await readAuthoritativeControlPlaneRows(
      this.controlPlaneSystemTableGateway,
      SYSTEM_TABLE_NAME.STORAGE_RESERVATIONS,
      SQL.SELECT_ACTIVE_RESERVATIONS_BY_OPERATION,
      [operation.operationId, RESERVATION_STATUS.ACTIVE],
      STORAGE_RESERVATION_READ_QUERY_OPTIONS,
    );
    if (activeResult.success && activeResult.rows?.length > 0) {
      return Object.freeze({
        outcome: OPERATION_RESERVATION_ATTEMPT_OUTCOME.ALREADY_ACTIVE,
        reservationId: `res-${operation.operationId}`,
      });
    }
    if (!activeResult.success) {
      this.logger.warn(
        REBALANCE_COORDINATOR_LOG_MSG.RESERVATION_CREATE_FAILED,
        {
          operationId: operation.operationId,
          reservationId: `res-${operation.operationId}`,
          error: activeResult.error,
        },
      );
      return Object.freeze({
        outcome: OPERATION_RESERVATION_ATTEMPT_OUTCOME.FAILED,
        reservationId: `res-${operation.operationId}`,
        error: activeResult.error || null,
      });
    }
    return this.createReservationForOperation(operation);
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
    let releasedCount = 0;
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
    if (releasedCount <= 0) {
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
      const preferredObservation =
        await this.repository.getOperationByIdVisibilityObservation(
          operationId,
          {
            requireOwnerRpcRead: false,
            allowPriorityRecoveryDeferredVisibility: true,
          },
        );
      if (
        preferredObservation?.operation ||
        preferredObservation?.deferredOutcome
      ) {
        return preferredObservation;
      }
      // A silent absent from the preferred read may be a transient lagging
      // local view. Releasing an active reservation requires the absence to
      // be disproven or confirmed by the owner-RPC-required authority read;
      // an escalated read that cannot confirm defers the decision.
      return this.repository.getOperationByIdVisibilityObservation(
        operationId,
        {
          requireOwnerRpcRead: true,
          preferOwnerRpcReadLeader: true,
          allowPriorityRecoveryDeferredVisibility: true,
          requireAbsenceConfirmation: true,
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
    // Sync-section attribution (instrumentation-only): this periodic sweep is
    // the dominant continuous churn candidate on the seed; tag it for the gap
    // watchdog. See raft-churn-sync-sections.js.
    return trackStorageReservationReconcile(
      () => this.runReservationReconcileSweep(),
    );
  }

  /**
   * @return {Promise<Object>} Reconciliation result counts.
   * @private
   */
  async runReservationReconcileSweep() {
    this.logger.info(REBALANCE_COORDINATOR_LOG_MSG.RESERVATION_RECONCILE_START);

    const now = Date.now();
    let expired = 0;
    let orphansReleased = 0;

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

    if (expired > 0) {
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
