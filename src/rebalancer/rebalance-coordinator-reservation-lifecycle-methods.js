import {assertOperationUpdateRecord, invalidOperationPersistenceOutcome} from
  './replica-operation-update-outcome.js';
import {REBALANCE_COORDINATOR_SHARED} from './rebalance-coordinator-shared.js';
import {
  controlPlaneWriteIdentity,
  isPendingInstanceApplied,
  releaseControlPlaneWriteIdentities,
} from '../control-plane/control-plane-write-identity.js';
import {
  OPERATION_RESERVATION_ATTEMPT_OUTCOME,
} from './operation-reservation-attempt-outcome.js';
import {
  trackStorageReservationReconcile,
} from '../diagnostics/raft-churn-sync-sections.js';
import {
  assertCanonicalRebalancerEntityIdentity,
} from './rebalancer-entity-identity.js';
import {
  adoptAuthoritativeReservationForOperation,
  buildFailedReservationAdoption,
  observeAuthoritativeOperationForReservation,
} from './rebalance-coordinator-reservation-adoption.js';
import {STORAGE_RESERVATION_AUTHORITY_ERROR} from
  './storage-reservation-authority.js';

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

const PROVEN_INVALID_CREATED_RESERVATION_ERRORS = Object.freeze(new Set([
  STORAGE_RESERVATION_AUTHORITY_ERROR.OPERATION_ABSENT,
  STORAGE_RESERVATION_AUTHORITY_ERROR.OPERATION_TERMINAL,
  STORAGE_RESERVATION_AUTHORITY_ERROR.OPERATION_MISMATCH,
]));

const RESERVATION_ORPHAN_RECONCILE_STATE_TABLE = Object.freeze([
  Object.freeze({
    state: RESERVATION_ORPHAN_RECONCILE_STATE.DEFERRED_OPERATION_VISIBILITY,
    matches: (evidence) => evidence.ownerReadDeferred === true,
  }),
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
  CONTROL_PLANE_READ_LEADER_MODE,
  CONTROL_PLANE_AUTHORITATIVE_READ_MODE,
  DEFAULT_AMPLIFICATION_FACTOR,
  OperationType,
  REBALANCE_COORDINATOR_ERROR_MSG,
  REBALANCE_COORDINATOR_EVENT,
  REBALANCE_COORDINATOR_LOG_MSG,
  RESERVATION_REASON,
  RESERVATION_STATUS,
  SQL,
  STORAGE_RESERVATION_READ_QUERY_OPTIONS,
  SYSTEM_TABLE_NAME,
  assertCritical,
  readAuthoritativeControlPlaneRows,
} = REBALANCE_COORDINATOR_SHARED;

const RESERVATION_BIRTH_VERB = 'birth';
const RESERVATION_RELEASE_READ_QUERY_OPTIONS = Object.freeze({
  ...STORAGE_RESERVATION_READ_QUERY_OPTIONS,
  authoritativeReadMode: CONTROL_PLANE_AUTHORITATIVE_READ_MODE.OWNER_RPC_REQUIRED,
});
const RESERVATION_RELEASE_UNCONFIRMED = 'RESERVATION_RELEASE_UNCONFIRMED';
const RESERVATION_RELEASE_WITNESS_SQL =
  'SELECT * FROM storage_reservations WHERE reservation_id = ?';

function reservationReleaseError(operation, reason) {
  const error = new Error(`Reservation release unresolved for ${operation.operationId}: ${reason}`);
  error.code = RESERVATION_RELEASE_UNCONFIRMED;
  return error;
}

function requireReservationReleaseRows(result, operation) {
  if (result?.success !== true || !Array.isArray(result.rows)) {
    throw reservationReleaseError(operation, result?.error || 'malformed authority response');
  }
  for (const row of result.rows) {
    if (!row || typeof row.reservation_id !== 'string' || row.reservation_id.length === 0 ||
        row.operation_id !== operation.operationId || row.entity_type !== operation.entityType ||
        row.entity_id !== operation.entityId || row.partition_id !== operation.partitionId ||
        row.target_node_id !== operation.targetNodeId) {
      throw reservationReleaseError(operation, 'reservation identity mismatch');
    }
  }
  return result.rows;
}


// The subject of a reservation's write identities.
function reservationWriteSubject(reservationId) {
  return [SYSTEM_TABLE_NAME.STORAGE_RESERVATIONS, reservationId];
}

function logReservationReconcileCompleted(logger, counts) {
  const logCompleted = counts.expired > 0 || counts.orphansReleased > 0 ?
    logger.info : logger.debug;
  logCompleted.call(logger,
    REBALANCE_COORDINATOR_LOG_MSG.RESERVATION_RECONCILE_COMPLETED, counts);
}

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
    // The reservation leaves ACTIVE: its birth is a finished logical write,
    // so an ensure after this transition is a new one, never answered from
    // the old birth's outcome.
    releaseControlPlaneWriteIdentities(
      ...reservationWriteSubject(reservationId));
    const result = await this.executeOperationMutationWithRetry(
      SQL.UPDATE_RESERVATION_STATUS_BY_ID,
      [nextStatus, now, now, reservationId, RESERVATION_STATUS.ACTIVE],
      {
        ownerId: options.ownerId || reservationId,
        sessionId: options.sessionId,
        timeoutBudget: options.timeoutBudget,
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
      changed: changeCount !== null && changeCount > 0,
      changeCount,
    };
  }

  async validateInsertedReservationOperation(
    operation,
    reservationId,
    timeoutBudget,
  ) {
    const insertedOperationError =
      await observeAuthoritativeOperationForReservation(
        this,
        operation,
        {timeoutBudget},
      );
    if (!insertedOperationError) return null;
    if (PROVEN_INVALID_CREATED_RESERVATION_ERRORS.has(
      insertedOperationError,
    )) {
      const cleanup = await this.transitionActiveReservationById(
        reservationId,
        RESERVATION_STATUS.RELEASED,
        this.nowFn(),
        {ownerId: operation.operationId, timeoutBudget},
      );
      if (!cleanup.success) {
        this.logger.warn(
          REBALANCE_COORDINATOR_LOG_MSG.RESERVATION_RELEASE_FAILED,
          {
            operationId: operation.operationId,
            reservationId,
            error: cleanup.error,
          },
        );
      }
    }
    return buildFailedReservationAdoption(
      this,
      operation,
      insertedOperationError,
    );
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
    const timeoutBudget = this.createOperationMutationTimeoutBudget(
      options.timeoutBudget,
    );

    const {entityType, entityId} =
      assertCanonicalRebalancerEntityIdentity(operation);
    // Sizing (cache read) is isolated in the entity-size helper; this
    // method makes only the durable reservation SQL write decision.
    const estimatedBytes = this.estimateEntityAdmissionBytes({
      entityType,
      entityId,
      resolvedEntitySizeBytes: options.resolvedEntitySizeBytes,
    });

    const now = this.nowFn();
    const reservationId = `res-${operation.operationId}`;
    const expiresAt = now + this.config.reservationTtlMs;

    const result = await this.executeOperationMutationWithRetry(
      SQL.INSERT_RESERVATION,
      [
        reservationId,
        operation.operationId,
        entityType,
        entityId,
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
        timeoutBudget,
        // The reservation's birth is one logical write: an ensure after its
        // answer was lost is the same entry (answered from its outcome row),
        // never a second INSERT of the deterministic id. Its instance ends
        // when the reservation leaves ACTIVE (transitionActiveReservation
        // ById).
        writeIdentity: controlPlaneWriteIdentity(
          ...reservationWriteSubject(reservationId), RESERVATION_BIRTH_VERB),
        // An applied earlier birth settles this one: the authority answers.
        pendingAppliedSettles: true,
      },
    );

    if (!result.success && isPendingInstanceApplied(result)) {
      // A prior attempt applied the same birth. Its ACTIVE row and the later
      // exact operation observation are the authority; the retry result is
      // never interpreted as a new insert failure.
      return adoptAuthoritativeReservationForOperation(
        this,
        operation,
        {timeoutBudget},
      );
    }
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

    const changeCount = this.extractMutationChangeCount(result);
    if (changeCount === null || changeCount <= 0) {
      return adoptAuthoritativeReservationForOperation(
        this, operation, {timeoutBudget});
    }

    // The operation can become terminal after the pre-insert live check.
    // Publish CREATED only after a fresh authoritative operation observation.
    // If terminal/absent/mismatched authority won, release this exact row now;
    // a terminal transition after this observation will see the row in
    // its ordinary release path.
    const invalidOperation = await this.validateInsertedReservationOperation(
      operation,
      reservationId,
      timeoutBudget,
    );
    if (invalidOperation) return invalidOperation;

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
  async ensureReservationForOperation(operation, options = {}) {
    if (!this.isStorageIncreasingOperation(operation?.type)) {
      return Object.freeze({
        outcome: OPERATION_RESERVATION_ATTEMPT_OUTCOME.NOT_REQUIRED,
      });
    }
    const timeoutBudget = this.createOperationMutationTimeoutBudget(
      options.timeoutBudget,
    );
    const adoption = await adoptAuthoritativeReservationForOperation(
      this,
      operation,
      {allowConfirmedAbsentReservation: true, timeoutBudget},
    );
    if (
      adoption.outcome ===
        OPERATION_RESERVATION_ATTEMPT_OUTCOME.ALREADY_ACTIVE ||
      adoption.reservationAbsent !== true ||
      options.allowCreate === false
    ) {
      return adoption;
    }
    return this.createReservationForOperation(operation, {timeoutBudget});
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
      RESERVATION_RELEASE_READ_QUERY_OPTIONS,
    );
    const rows = requireReservationReleaseRows(activeResult, operation);
    if (rows.some((row) => row.status !== RESERVATION_STATUS.ACTIVE || row.released_at !== null)) {
      throw reservationReleaseError(operation, 'invalid active reservation tuple');
    }

    const now = this.nowFn();
    let releasedCount = 0;
    for (const row of rows) {
      const transition = await this.transitionActiveReservationById(
        row.reservation_id,
        RESERVATION_STATUS.RELEASED,
        now,
      );
      if (!transition.success || transition.changeCount === null || transition.changeCount === 0) {
        const witness = await readAuthoritativeControlPlaneRows(
          this.controlPlaneSystemTableGateway, SYSTEM_TABLE_NAME.STORAGE_RESERVATIONS,
          RESERVATION_RELEASE_WITNESS_SQL, [row.reservation_id],
          RESERVATION_RELEASE_READ_QUERY_OPTIONS);
        const finalRows = requireReservationReleaseRows(witness, operation);
        const final = finalRows[0];
        if (finalRows.length !== 1 || final.reservation_id !== row.reservation_id ||
            ![RESERVATION_STATUS.RELEASED, RESERVATION_STATUS.EXPIRED].includes(final.status) ||
            !Number.isFinite(final.released_at)) {
          throw reservationReleaseError(operation, transition.error || 'conditional release unproved');
        }
      }
      if (transition.changeCount > 0) {
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
    return this.repository.getOperationByIdVisibilityObservation(operationId, {
      authoritativeReadMode: CONTROL_PLANE_AUTHORITATIVE_READ_MODE.OWNER_RPC_REQUIRED,
      leaderMode: CONTROL_PLANE_READ_LEADER_MODE.PREFERRED,
      allowPriorityRecoveryDeferredVisibility: false,
      allowOwnerPersistedTransitionDeferredVisibility: false,
      requireAbsenceConfirmation: true,
    });
  }

  /**
   * @param {Object|null} visibilityObservation
   * @return {Object}
   * @private
   */
  buildReservationOrphanReconcileSnapshot(visibilityObservation, operationId) {
    if (!visibilityObservation || !Object.hasOwn(visibilityObservation, 'operation') ||
        !Object.hasOwn(visibilityObservation, 'deferredOutcome')) {
      throw invalidOperationPersistenceOutcome('reservation operation authority is unavailable');
    }
    const operation = visibilityObservation.operation;
    const deferredOutcome =
      visibilityObservation?.deferredOutcome &&
      typeof visibilityObservation.deferredOutcome === 'object' ?
        visibilityObservation.deferredOutcome :
        null;
    if (!deferredOutcome && operation !== null) {
      assertOperationUpdateRecord(operation);
      if (operation.operationId !== operationId) {
        throw invalidOperationPersistenceOutcome('reservation operation identity differs');
      }
    }
    const evidence = Object.freeze({
      operationVisible: operation !== null,
      operationTerminal: !deferredOutcome && operation !== null && operation.completedAt !== null,
      ownerReadDeferred: deferredOutcome !== null,
    });
    const state =
      RESERVATION_ORPHAN_RECONCILE_STATE_TABLE.find((candidate) =>
        candidate.matches(evidence),
      ).state;
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
   * Decide whether a TTL-expired reservation may actually transition to
   * EXPIRED. Mirrors the orphan arm's operation-state consult (audit
   * finding 4): a non-terminal or not-authoritatively-absent operation
   * keeps its reservation ACTIVE even past expires_at, because nothing
   * ever renews expires_at and expiring a live operation's witness would
   * silently reopen its admitted capacity. RELEASE_ACTIVE only when the
   * operation is visible-and-terminal or confirmed-absent.
   * @param {string|null} operationId
   * @return {Promise<Object>} {action} — RELEASE_ACTIVE or KEEP_ACTIVE.
   * @private
   */
  async buildReservationExpirySnapshot(operationId) {
    const visibilityObservation =
      await this.getReservationOperationVisibilityObservation(operationId);
    const reconcileSnapshot =
      this.buildReservationOrphanReconcileSnapshot(visibilityObservation, operationId);
    return Object.freeze({
      action: reconcileSnapshot.action,
      state: reconcileSnapshot.state,
      operation: reconcileSnapshot.operation,
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
  async expireStaleActiveReservations(staleResult, now) {
    let expired = 0;
    if (staleResult.success && Array.isArray(staleResult.rows)) {
      for (const row of staleResult.rows) {
        const expirySnapshot = await this.buildReservationExpirySnapshot(
          row.operation_id);
        if (expirySnapshot.action !==
            RESERVATION_ORPHAN_RECONCILE_ACTION.RELEASE_ACTIVE) {
          continue;
        }
        if (expirySnapshot.operation) {
          requireReservationReleaseRows({success: true, rows: [row]}, expirySnapshot.operation);
        }
        const transition = await this.transitionActiveReservationById(
          row.reservation_id, RESERVATION_STATUS.EXPIRED, now);
        if (!transition.success) {
          this.logger.warn(
            REBALANCE_COORDINATOR_LOG_MSG.RESERVATION_RELEASE_FAILED,
            {operationId: row.operation_id, reservationId: row.reservation_id,
              error: transition.error});
          continue;
        }
        if (transition.changed) expired++;
      }
    } else if (!staleResult.success) {
      this.logger.warn(
        REBALANCE_COORDINATOR_LOG_MSG.RESERVATION_RELEASE_FAILED,
        {operationId: null, reservationId: null, error: staleResult.error});
    }
    if (expired > 0) {
      this.logger.info(
        REBALANCE_COORDINATOR_LOG_MSG.RESERVATION_RECONCILE_EXPIRED,
        {count: expired});
    }
    return expired;
  }

  async runReservationReconcileSweep() {
    this.logger.debug(REBALANCE_COORDINATOR_LOG_MSG.RESERVATION_RECONCILE_START);

    const now = this.nowFn();
    let orphansReleased = 0;

    const staleResult = await readAuthoritativeControlPlaneRows(
      this.controlPlaneSystemTableGateway,
      SYSTEM_TABLE_NAME.STORAGE_RESERVATIONS,
      SQL.SELECT_EXPIRED_ACTIVE_RESERVATIONS,
      [RESERVATION_STATUS.ACTIVE, now],
      STORAGE_RESERVATION_READ_QUERY_OPTIONS,
    );
    const expired = await this.expireStaleActiveReservations(staleResult, now);

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
          this.buildReservationOrphanReconcileSnapshot(visibilityObservation, row.operation_id);
        if (
          reconcileSnapshot.action !==
          RESERVATION_ORPHAN_RECONCILE_ACTION.RELEASE_ACTIVE
        ) {
          continue;
        }
        if (reconcileSnapshot.operation) {
          requireReservationReleaseRows({success: true, rows: [row]}, reconcileSnapshot.operation);
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

    logReservationReconcileCompleted(this.logger, {expired, orphansReleased});

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
