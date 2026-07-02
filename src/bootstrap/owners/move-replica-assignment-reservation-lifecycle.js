import {v4 as uuidv4} from 'uuid';
import {NUM, TABLES, WORKFLOW_STEP} from '../../constants/index.js';
import {
  BOOTSTRAP_API_HANDOFF_STATUS,
  BOOTSTRAP_API_LOG_MSG,
  BOOTSTRAP_API_MOVE_REPLICA_ASSIGNMENT_ERROR as
  MOVE_REPLICA_ASSIGNMENT_ERROR,
  BOOTSTRAP_API_MOVE_REPLICA_ASSIGNMENT_HISTORY_PHASE as
  MOVE_REPLICA_ASSIGNMENT_HISTORY_PHASE,
  BOOTSTRAP_API_MOVE_REPLICA_ASSIGNMENT_INVALIDATION_REASON as
  MOVE_REPLICA_ASSIGNMENT_INVALIDATION_REASON,
} from '../bootstrap-api-constants.js';

const LOCAL_STR_1GQG6 = 'Failed to persist MOVE_REPLICA assignment reservation';
const LOCAL_STR_6LKDQ = 'failed to persist MOVE_REPLICA assignment reservation';
const LOCAL_STR_GVGHU = 'failed to persist reservation terminal status';
const LOCAL_STR_MC3LT = 'failed to reconcile MOVE_REPLICA assignment to committed state';

const moveReplicaAssignmentReservationLifecycleMethods = {
  async expireMoveReplicaAssignmentReservations(options = {}) {
    const now = Date.now();
    const reservations = [];
    const seenAssignmentIds = new Set();
    const assignmentReservations = this.getMoveReplicaAssignmentReservations();
    const pushReservation = (reservation) => {
      const normalized = this.normalizeMoveReplicaAssignmentReservationRow(reservation);
      if (!normalized || seenAssignmentIds.has(normalized.assignmentId)) {
        return;
      }
      seenAssignmentIds.add(normalized.assignmentId);
      reservations.push(normalized);
    };

    for (const reservation of assignmentReservations?.values?.() || []) {
      pushReservation(reservation);
    }

    const cacheOrSqlReservations =
      await this.collectMoveReplicaAssignmentReservations({
        now,
        timeoutBudget: options.timeoutBudget || null,
      });
    for (const reservation of cacheOrSqlReservations) {
      pushReservation(reservation);
    }

    for (const reservation of reservations) {
      if (this.shouldReconcileMoveReplicaAssignmentReservationToCommitted(
        reservation,
        now,
      )) {
        await this.reconcileMoveReplicaAssignmentReservationToCommitted(
          reservation,
          now,
          options,
        );
        continue;
      }
      const invalidationReason =
        this.getMoveReplicaAssignmentReservationInvalidationReason(
          reservation,
          now,
        );
      if (invalidationReason === null) {
        continue;
      }
      if (invalidationReason ===
            MOVE_REPLICA_ASSIGNMENT_INVALIDATION_REASON.TERMINAL ||
          invalidationReason ===
            MOVE_REPLICA_ASSIGNMENT_INVALIDATION_REASON.INACTIVE_STATUS ||
          invalidationReason ===
            MOVE_REPLICA_ASSIGNMENT_INVALIDATION_REASON.INVALID_RESERVATION) {
        assignmentReservations?.delete(reservation.assignmentId);
        continue;
      }
      if (invalidationReason ===
          MOVE_REPLICA_ASSIGNMENT_INVALIDATION_REASON.LEASE_EXPIRED) {
        assignmentReservations?.set(reservation.assignmentId, reservation);
        continue;
      }
      if (this.shouldDeferMoveReplicaAssignmentInvalidationToSourceOwner(
        reservation,
        invalidationReason,
      )) {
        assignmentReservations?.set(reservation.assignmentId, reservation);
        continue;
      }
      if (this.shouldPreserveMoveReplicaAssignmentSweepSourceVisibilityGap(
        reservation,
        invalidationReason,
        now,
      )) {
        assignmentReservations?.set(reservation.assignmentId, reservation);
        continue;
      }
      assignmentReservations?.set(reservation.assignmentId, reservation);
      await this.markMoveReplicaAssignmentReservationTerminal(
        reservation.assignmentId,
        BOOTSTRAP_API_HANDOFF_STATUS.FAILED,
        WORKFLOW_STEP.FAILED,
        invalidationReason ===
            MOVE_REPLICA_ASSIGNMENT_INVALIDATION_REASON.SOURCE_OWNER_UNAVAILABLE ?
          MOVE_REPLICA_ASSIGNMENT_ERROR.SOURCE_OWNER_UNAVAILABLE :
          MOVE_REPLICA_ASSIGNMENT_ERROR.RESERVATION_INVALID,
        options,
      );
      this.getLogger().info(BOOTSTRAP_API_LOG_MSG.MOVE_REPLICA_ASSIGNMENT_EXPIRED, {
        assignmentId: reservation.assignmentId,
        replicaId: reservation.replicaId,
        targetNodeId: reservation.targetNodeId,
        invalidationReason,
      });
    }
  },

  async reserveMoveReplicaAssignment(targetNodeId, assignment, options = {}) {
    const replicaId = assignment?.replicaToMove;
    if (!replicaId) {
      throw new Error(
        MOVE_REPLICA_ASSIGNMENT_ERROR.RESERVATION_REPLICA_TO_MOVE_REQUIRED,
      );
    }

    const now = Date.now();
    const existingReservations =
      await this.collectMoveReplicaAssignmentReservations({
        now,
        timeoutBudget: options.timeoutBudget || null,
      });
    const conflictingReservation = existingReservations.find((reservation) =>
      reservation.replicaId === replicaId &&
        (this.isMoveReplicaAssignmentReservationActive(reservation, now) ||
          this.isExpiredMoveReplicaAssignmentTargetProgressVisible(
            reservation,
            now,
          )),
    );
    if (conflictingReservation) {
      this.getLogger().warn(BOOTSTRAP_API_LOG_MSG.MOVE_REPLICA_ASSIGNMENT_CONFLICT, {
        requestedNodeId: targetNodeId,
        replicaId,
        conflictingAssignmentId: conflictingReservation.assignmentId,
        conflictingTargetNodeId: conflictingReservation.targetNodeId,
      });
      throw new Error(MOVE_REPLICA_ASSIGNMENT_ERROR.RESERVATION_CONFLICT);
    }

    const assignmentId = uuidv4();
    const leaseExpiresAt = now + this.getMoveReplicaAssignmentLeaseMs();
    const stepsHistory = [{
      phase: MOVE_REPLICA_ASSIGNMENT_HISTORY_PHASE.RESERVED,
      step: WORKFLOW_STEP.PENDING,
      status: BOOTSTRAP_API_HANDOFF_STATUS.PREPARING,
      timestamp: now,
      leaseExpiresAt,
    }];
    const reservation = {
      assignmentId,
      replicaId,
      sourceNodeId: assignment.sourceNodeId || null,
      targetNodeId,
      groupId: assignment.groupId || null,
      status: BOOTSTRAP_API_HANDOFF_STATUS.PREPARING,
      leaseExpiresAt,
      updatedAt: now,
      stepsHistory,
    };

    const reservations = this.getMoveReplicaAssignmentReservations();
    reservations?.set(assignmentId, reservation);

    if (this.getSqlQueryEngine()) {
      try {
        const persistResult = await this.executeBootstrapControlPlaneMutation(
          {
            operation: 'insert',
            tableName: TABLES.REPLICA_OPERATIONS,
            row: this.buildMoveReplicaAssignmentReplicaOperationRow(
              reservation,
              WORKFLOW_STEP.PENDING,
              {createdAt: now},
            ),
          },
          {
            timeoutBudget: options.timeoutBudget || null,
          },
        );
        if (persistResult?.success === false) {
          if (!this.isRetryableMoveReplicaAssignmentPersistenceFailure(
            persistResult,
          )) {
            reservations?.delete(assignmentId);
            throw this.buildBootstrapControlPlaneQueryError(
              persistResult,
              LOCAL_STR_1GQG6,
            );
          }
          this.getLogger().warn(
            BOOTSTRAP_API_LOG_MSG.MOVE_REPLICA_ASSIGNMENT_RESERVATION_WRITE_FAILED,
            {
              assignmentId,
              replicaId,
              targetNodeId,
              sourceNodeId: reservation.sourceNodeId,
              retryAfterMs: persistResult?.retryAfterMs || null,
              error:
                persistResult?.error ||
                LOCAL_STR_6LKDQ,
            },
          );
        }
      } catch (error) {
        if (!this.isRetryableMoveReplicaAssignmentPersistenceFailure(error)) {
          reservations?.delete(assignmentId);
          throw error;
        }
        this.getLogger().warn(
          BOOTSTRAP_API_LOG_MSG.MOVE_REPLICA_ASSIGNMENT_RESERVATION_WRITE_FAILED,
          {
            assignmentId,
            replicaId,
            targetNodeId,
            sourceNodeId: reservation.sourceNodeId,
            retryAfterMs: error?.retryAfterMs || null,
            error: error?.message || String(error),
          },
        );
      }
    }

    this.getLogger().info(BOOTSTRAP_API_LOG_MSG.MOVE_REPLICA_ASSIGNMENT_RESERVED, {
      assignmentId,
      replicaId,
      targetNodeId,
      sourceNodeId: reservation.sourceNodeId,
      leaseExpiresAt,
    });
    return reservation;
  },

  async markMoveReplicaAssignmentReservationTerminal(
    assignmentId,
    status,
    workflowStep,
    errorMessage = null,
    options = {},
  ) {
    const reservations = this.getMoveReplicaAssignmentReservations();
    const existing = reservations?.get(assignmentId);
    const now = Date.now();
    const nextReservation = {
      ...(existing || {}),
      assignmentId,
      status,
      updatedAt: now,
      leaseExpiresAt: now,
    };
    reservations?.set(assignmentId, nextReservation);

    if (this.getSqlQueryEngine()) {
      const updateResult = await this.executeBootstrapControlPlaneMutation(
        {
          operation: 'update',
          tableName: TABLES.REPLICA_OPERATIONS,
          whereClause: {
            operation_id: assignmentId,
          },
          data: this.buildMoveReplicaAssignmentReplicaOperationUpdateData(
            nextReservation,
            workflowStep,
            {
              completedAt: now,
              errorMessage,
            },
          ),
        },
        {
          timeoutBudget: options.timeoutBudget || null,
        },
      );
      if (updateResult?.success === false) {
        this.getLogger().warn(
          BOOTSTRAP_API_LOG_MSG.MOVE_REPLICA_ASSIGNMENT_VALIDATION_FAILED,
          {
            assignmentId,
            status,
            error:
              updateResult.error ||
              LOCAL_STR_GVGHU,
          },
        );
      }
    }
  },

  async reconcileMoveReplicaAssignmentReservationToCommitted(
    reservation,
    now = Date.now(),
    options = {},
  ) {
    if (!reservation?.assignmentId) {
      return;
    }

    const existingStepsHistory = Array.isArray(reservation.stepsHistory) ?
      reservation.stepsHistory : [];
    const lastStep = existingStepsHistory[existingStepsHistory.length - 1] || null;
    const stepsHistory = lastStep?.phase === 'observed_committed' &&
      lastStep?.step === WORKFLOW_STEP.ACTIVE &&
      lastStep?.status === BOOTSTRAP_API_HANDOFF_STATUS.COMMITTED ?
      existingStepsHistory :
      [
        ...existingStepsHistory,
        {
          phase: 'observed_committed',
          step: WORKFLOW_STEP.ACTIVE,
          status: BOOTSTRAP_API_HANDOFF_STATUS.COMMITTED,
          timestamp: now,
        },
      ];

    const nextReservation = {
      ...reservation,
      status: BOOTSTRAP_API_HANDOFF_STATUS.COMMITTED,
      leaseExpiresAt: now,
      updatedAt: now,
      stepsHistory,
    };
    this.getMoveReplicaAssignmentReservations()?.set(
      reservation.assignmentId,
      nextReservation,
    );

    if (this.getSqlQueryEngine()) {
      const updateResult = await this.executeBootstrapControlPlaneMutation(
        {
          operation: 'update',
          tableName: TABLES.REPLICA_OPERATIONS,
          whereClause: {
            operation_id: reservation.assignmentId,
          },
          data: this.buildMoveReplicaAssignmentReplicaOperationUpdateData(
            nextReservation,
            WORKFLOW_STEP.ACTIVE,
            {
              completedAt: now,
            },
          ),
        },
        {
          timeoutBudget: options.timeoutBudget || null,
        },
      );
      if (updateResult?.success === false) {
        this.getLogger().warn(
          BOOTSTRAP_API_LOG_MSG.MOVE_REPLICA_ASSIGNMENT_VALIDATION_FAILED,
          {
            assignmentId: reservation.assignmentId,
            status: BOOTSTRAP_API_HANDOFF_STATUS.COMMITTED,
            error:
              updateResult.error ||
              LOCAL_STR_MC3LT,
          },
        );
        return;
      }
    }

    this.getLogger().info(BOOTSTRAP_API_LOG_MSG.MOVE_REPLICA_ASSIGNMENT_RECONCILED, {
      assignmentId: reservation.assignmentId,
      replicaId: reservation.replicaId,
      targetNodeId: reservation.targetNodeId,
      sourceNodeId: reservation.sourceNodeId || null,
    });
  },
};

export {moveReplicaAssignmentReservationLifecycleMethods};
