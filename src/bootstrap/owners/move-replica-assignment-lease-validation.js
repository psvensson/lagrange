import {
  COLUMN,
  HTTP_STATUS,
  NUM,
  SERVICE_TYPE,
  TABLES,
  TYPEOF,
  WORKFLOW_STEP,
} from '../../constants/index.js';
import {
  BOOTSTRAP_API_ASSIGNMENT,
  BOOTSTRAP_API_ERROR,
  BOOTSTRAP_API_HANDOFF_STATUS,
  BOOTSTRAP_API_LOG_MSG,
  BOOTSTRAP_API_MOVE_REPLICA_ASSIGNMENT_ERROR as
  MOVE_REPLICA_ASSIGNMENT_ERROR,
  BOOTSTRAP_API_MOVE_REPLICA_ASSIGNMENT_HISTORY_PHASE as
  MOVE_REPLICA_ASSIGNMENT_HISTORY_PHASE,
  BOOTSTRAP_API_REGISTER_SERVICE_ERROR_CODE,
} from '../bootstrap-api-constants.js';

const LOCAL_STR_1IOIF = 'failed to persist MOVE_REPLICA assignment lease renewal';

const moveReplicaAssignmentLeaseValidationMethods = {
  isMoveReplicaHandoffRequest(serviceData) {
    const serviceId = serviceData?.[COLUMN.SERVICE_ID];
    const serviceType = serviceData?.[COLUMN.SERVICE_TYPE];
    const targetNodeId = serviceData?.[COLUMN.NODE_ID];
    const assignmentId = serviceData?.[BOOTSTRAP_API_ASSIGNMENT.FIELD_ID];

    if (!serviceId || !targetNodeId) {
      return false;
    }
    if (serviceType !== SERVICE_TYPE.MESSAGE_GROUP) {
      return false;
    }
    if (targetNodeId === this.getSeedNodeId()) {
      return false;
    }
    if (typeof assignmentId === TYPEOF.STRING && assignmentId.length > NUM.ZERO) {
      return true;
    }
    return this.getMessageGroupServices()?.has?.(serviceId) === true;
  },

  async validateMoveReplicaAssignmentToken(serviceData) {
    if (!this.isMoveReplicaHandoffRequest(serviceData)) {
      return null;
    }

    const assignmentId = serviceData[BOOTSTRAP_API_ASSIGNMENT.FIELD_ID];
    if (typeof assignmentId !== TYPEOF.STRING || assignmentId.length === NUM.ZERO) {
      throw this.buildRegisterServiceValidationError(
        HTTP_STATUS.BAD_REQUEST,
        BOOTSTRAP_API_ERROR.ASSIGNMENT_TOKEN_REQUIRED,
        BOOTSTRAP_API_REGISTER_SERVICE_ERROR_CODE.ASSIGNMENT_TOKEN_REQUIRED,
      );
    }

    const reservationLookup =
      await this.getMoveReplicaAssignmentReservationById(assignmentId);
    if (reservationLookup.lookupUnavailable) {
      throw this.buildRegisterServiceValidationError(
        HTTP_STATUS.SERVICE_UNAVAILABLE,
        BOOTSTRAP_API_ERROR.ASSIGNMENT_TOKEN_LOOKUP_UNAVAILABLE,
        BOOTSTRAP_API_REGISTER_SERVICE_ERROR_CODE
          .ASSIGNMENT_TOKEN_LOOKUP_UNAVAILABLE,
        {
          retryAfterMs: this.getMoveReplicaAssignmentSweepIntervalMs(),
          details: {
            assignmentId,
            cause:
              reservationLookup.error ||
              BOOTSTRAP_API_ERROR.ASSIGNMENT_TOKEN_LOOKUP_UNAVAILABLE,
          },
        },
      );
    }

    const reservation = reservationLookup.reservation;
    if (!reservation ||
        BOOTSTRAP_API_ASSIGNMENT.TERMINAL_STATUSES.includes(reservation.status)) {
      throw this.buildRegisterServiceValidationError(
        HTTP_STATUS.CONFLICT,
        BOOTSTRAP_API_ERROR.ASSIGNMENT_TOKEN_UNKNOWN,
        BOOTSTRAP_API_REGISTER_SERVICE_ERROR_CODE.ASSIGNMENT_TOKEN_UNKNOWN,
      );
    }

    const requestedReplicaId = serviceData[COLUMN.REPLICA_ID] || serviceData[COLUMN.SERVICE_ID];
    const requestedNodeId = serviceData[COLUMN.NODE_ID];
    if (reservation.replicaId !== requestedReplicaId ||
        reservation.targetNodeId !== requestedNodeId ||
        (reservation.groupId && serviceData[COLUMN.GROUP_ID] &&
          reservation.groupId !== serviceData[COLUMN.GROUP_ID])) {
      throw this.buildRegisterServiceValidationError(
        HTTP_STATUS.CONFLICT,
        BOOTSTRAP_API_ERROR.ASSIGNMENT_TOKEN_MISMATCH,
        BOOTSTRAP_API_REGISTER_SERVICE_ERROR_CODE.ASSIGNMENT_TOKEN_MISMATCH,
      );
    }

    const now = Date.now();
    if (!Number.isFinite(reservation.leaseExpiresAt) || reservation.leaseExpiresAt <= now) {
      const renewedReservation = await this.renewMoveReplicaAssignmentReservation(
        reservation,
        {
          now,
          force: true,
          phase: MOVE_REPLICA_ASSIGNMENT_HISTORY_PHASE.LEASE_RENEWED,
        },
      );
      if (renewedReservation) {
        return renewedReservation;
      }
      await this.markMoveReplicaAssignmentReservationTerminal(
        assignmentId,
        BOOTSTRAP_API_HANDOFF_STATUS.FAILED,
        WORKFLOW_STEP.FAILED,
        MOVE_REPLICA_ASSIGNMENT_ERROR.ASSIGNMENT_TOKEN_EXPIRED,
      );
      throw this.buildRegisterServiceValidationError(
        HTTP_STATUS.CONFLICT,
        BOOTSTRAP_API_ERROR.ASSIGNMENT_TOKEN_EXPIRED,
        BOOTSTRAP_API_REGISTER_SERVICE_ERROR_CODE.ASSIGNMENT_TOKEN_EXPIRED,
      );
    }

    return this.renewMoveReplicaAssignmentReservation(
      reservation,
      {
        now,
        force: false,
        phase: MOVE_REPLICA_ASSIGNMENT_HISTORY_PHASE.VALIDATED,
      },
    );
  },

  shouldRenewMoveReplicaAssignmentReservation(reservation, now = Date.now()) {
    if (!Number.isFinite(reservation?.leaseExpiresAt)) {
      return false;
    }
    const renewalWindowMs = Math.max(
      NUM.ONE,
      Math.floor(this.getMoveReplicaAssignmentLeaseMs() / NUM.TWO),
    );
    return reservation.leaseExpiresAt - now <= renewalWindowMs;
  },

  async renewMoveReplicaAssignmentReservation(
    reservation,
    options = {},
  ) {
    if (!reservation?.assignmentId) {
      return null;
    }

    const now = Number.isFinite(options.now) ? Math.floor(options.now) : Date.now();
    const force = options.force === true;
    const phase = typeof options.phase === TYPEOF.STRING &&
      options.phase.length > NUM.ZERO ?
      options.phase :
      MOVE_REPLICA_ASSIGNMENT_HISTORY_PHASE.LEASE_RENEWED;
    if (force) {
      if (!this.canReviveExpiredMoveReplicaAssignmentReservation(
        reservation,
        now,
      )) {
        return null;
      }
    } else if (!this.shouldRenewMoveReplicaAssignmentReservation(
      reservation,
      now,
    )) {
      return reservation;
    }

    const status = reservation.status || BOOTSTRAP_API_HANDOFF_STATUS.PREPARING;
    const step = WORKFLOW_STEP.PENDING;
    const leaseExpiresAt = now + this.getMoveReplicaAssignmentLeaseMs();
    const existingStepsHistory = Array.isArray(reservation.stepsHistory) ?
      reservation.stepsHistory : [];
    const stepsHistory = [
      ...existingStepsHistory,
      {
        phase,
        step,
        status,
        timestamp: now,
        leaseExpiresAt,
      },
    ];
    const renewedReservation = {
      ...reservation,
      status,
      updatedAt: now,
      leaseExpiresAt,
      stepsHistory,
    };

    const reservations = this.getMoveReplicaAssignmentReservations();
    reservations?.set(renewedReservation.assignmentId, renewedReservation);

    if (this.getSqlQueryEngine() &&
        this.shouldAttemptRenewalWrite(renewedReservation.assignmentId, now)) {
      try {
        const updateResult = await this.executeBootstrapControlPlaneMutation({
          operation: 'update',
          tableName: TABLES.REPLICA_OPERATIONS,
          whereClause: {
            operation_id: renewedReservation.assignmentId,
          },
          data: this.buildMoveReplicaAssignmentReplicaOperationUpdateData(
            renewedReservation,
            step,
            {
              completedAt: null,
            },
          ),
        });
        if (updateResult?.success === false) {
          if (this.isRetryableMoveReplicaAssignmentPersistenceFailure(
            updateResult,
          )) {
            this.armRenewalWriteRetryBackoff(
              renewedReservation.assignmentId,
              updateResult,
              now,
            );
            return force ? null : reservation;
          }
          this.getLogger().warn(
            BOOTSTRAP_API_LOG_MSG.MOVE_REPLICA_ASSIGNMENT_VALIDATION_FAILED,
            {
              assignmentId: renewedReservation.assignmentId,
              status,
              error:
                updateResult.error ||
                LOCAL_STR_1IOIF,
            },
          );
          return force ? null : reservation;
        }
        this.clearRenewalWriteRetryBackoff(renewedReservation.assignmentId);
      } catch (error) {
        if (this.isRetryableMoveReplicaAssignmentPersistenceFailure(error)) {
          this.armRenewalWriteRetryBackoff(
            renewedReservation.assignmentId,
            error,
            now,
          );
          return force ? null : reservation;
        }
        this.getLogger().warn(
          BOOTSTRAP_API_LOG_MSG.MOVE_REPLICA_ASSIGNMENT_RENEWAL_WRITE_FAILED,
          {
            assignmentId: renewedReservation.assignmentId,
            status,
            error: error?.message || String(error),
          },
        );
      }
    }

    this.getLogger().info(BOOTSTRAP_API_LOG_MSG.MOVE_REPLICA_ASSIGNMENT_RENEWED, {
      assignmentId: renewedReservation.assignmentId,
      replicaId: renewedReservation.replicaId,
      targetNodeId: renewedReservation.targetNodeId,
      sourceNodeId: renewedReservation.sourceNodeId,
      phase,
      leaseExpiresAt,
    });
    return renewedReservation;
  }
};

export {moveReplicaAssignmentLeaseValidationMethods};
