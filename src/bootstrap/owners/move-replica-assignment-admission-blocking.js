import {NUM, TYPEOF} from '../../constants/index.js';
import {
  BOOTSTRAP_API_ASSIGNMENT,
  BOOTSTRAP_API_DEFAULT,
  BOOTSTRAP_API_HANDOFF_STATUS,
} from '../bootstrap-api-constants.js';

const moveReplicaAssignmentAdmissionBlockingMethods = {
  async getActiveMoveReplicaAssignmentReservations(options = {}) {
    const now = Date.now();
    const reservations =
      await this.collectMoveReplicaAssignmentReservations({
        now,
        timeoutBudget: options.timeoutBudget || null,
      });
    return reservations.filter((reservation) =>
      this.isMoveReplicaAssignmentReservationActive(reservation, now),
    );
  },

  async getBlockingMoveReplicaBootstrapAdmissions(
    now = Date.now(),
    options = {},
  ) {
    const reservations = [];
    const byAssignmentId = new Map();
    const collectedReservations =
      await this.collectMoveReplicaAssignmentReservations({
        now,
        timeoutBudget: options.timeoutBudget || null,
      });
    for (const reservation of collectedReservations) {
      byAssignmentId.set(reservation.assignmentId, reservation);
    }

    for (const reservation of byAssignmentId.values()) {
      if (this.isMoveReplicaBootstrapAdmissionGloballyBlocked(
        reservation,
        now,
      )) {
        reservations.push(reservation);
      }
    }

    reservations.sort((left, right) => {
      const leftUpdatedAt = Number.isFinite(left?.updatedAt) ? left.updatedAt : NUM.ZERO;
      const rightUpdatedAt = Number.isFinite(right?.updatedAt) ? right.updatedAt : NUM.ZERO;
      return leftUpdatedAt - rightUpdatedAt;
    });

    return reservations;
  },

  async getMoveReplicaBootstrapExclusionReservations(
    now = Date.now(),
    options = {},
  ) {
    const reservations = [];
    const byAssignmentId = new Map();
    const collectedReservations =
      await this.collectMoveReplicaAssignmentReservations({
        now,
        timeoutBudget: options.timeoutBudget || null,
      });
    for (const reservation of collectedReservations) {
      byAssignmentId.set(reservation.assignmentId, reservation);
    }

    for (const reservation of byAssignmentId.values()) {
      if (this.isMoveReplicaBootstrapAdmissionBlocked(reservation, now)) {
        reservations.push(reservation);
      }
    }

    reservations.sort((left, right) => {
      const leftUpdatedAt = Number.isFinite(left?.updatedAt) ? left.updatedAt : NUM.ZERO;
      const rightUpdatedAt = Number.isFinite(right?.updatedAt) ? right.updatedAt : NUM.ZERO;
      return leftUpdatedAt - rightUpdatedAt;
    });
    return reservations;
  },

  isMoveReplicaBootstrapAdmissionBlocked(
    reservation,
    now = Date.now(),
  ) {
    return this.isMoveReplicaAssignmentReservationOpen(reservation, now) ||
      this.isExpiredMoveReplicaAssignmentTargetProgressVisible(
        reservation,
        now,
      ) ||
      this.isCommittedMoveReplicaHandoffStabilizing(reservation, now);
  },

  isMoveReplicaBootstrapAdmissionGloballyBlocked(
    _reservation,
    _now = Date.now(),
  ) {
    return false;
  },

  isMoveReplicaAssignmentReservationOpen(
    reservation,
    now = Date.now(),
  ) {
    if (!reservation ||
        typeof reservation.assignmentId !== TYPEOF.STRING ||
        reservation.assignmentId.length === NUM.ZERO) {
      return false;
    }
    if (!reservation.replicaId || !reservation.targetNodeId) {
      return false;
    }
    if (BOOTSTRAP_API_ASSIGNMENT.TERMINAL_STATUSES.includes(reservation.status)) {
      return false;
    }
    if (!BOOTSTRAP_API_ASSIGNMENT.ACTIVE_RESERVATION_STATUSES.includes(
      reservation.status,
    )) {
      return false;
    }
    if (this.getMoveReplicaAssignmentReservationInvalidationReason(
      reservation,
      now,
    ) !== null) {
      return false;
    }
    const ownership =
      this.evaluateMoveReplicaAssignmentReservationOwnership(reservation, now);
    if (ownership.observedCommitted) {
      return false;
    }
    if (ownership.continuingTargetAdoption) {
      return true;
    }
    return this.hasViableMoveReplicaAssignmentSource(reservation, now);
  },

  isCommittedMoveReplicaHandoffStabilizing(
    reservation,
    now = Date.now(),
  ) {
    if (!reservation) {
      return false;
    }
    const observedOwnership =
      this.evaluateMoveReplicaAssignmentReservationOwnership(reservation, now);
    const logicallyCommitted =
      reservation.status === BOOTSTRAP_API_HANDOFF_STATUS.COMMITTED ||
      observedOwnership.observedCommitted;
    if (!logicallyCommitted) {
      return false;
    }

    const stabilizationExpiresAt = Number.isFinite(reservation.updatedAt) ?
      reservation.updatedAt + this.getMoveReplicaAssignmentLeaseMs() :
      null;
    if (!Number.isFinite(stabilizationExpiresAt) || stabilizationExpiresAt <= now) {
      return false;
    }

    return !this.isMoveReplicaAssignmentTargetReady(reservation, now);
  },

  isMoveReplicaAssignmentTargetReady(
    reservation,
    now = Date.now(),
  ) {
    if (!reservation?.targetNodeId || !reservation?.replicaId) {
      return false;
    }
    const ownership =
      this.evaluateMoveReplicaAssignmentReservationOwnership(reservation, now);
    return ownership.targetOwnsActiveReplica && ownership.targetNodeReady;
  },

  resolveMoveReplicaBootstrapAdmissionRetryAfterMs(
    reservation,
    now = Date.now(),
  ) {
    const admissionFloor = Number.isFinite(this.getBootstrapAdmissionRetryAfterMs()) &&
      this.getBootstrapAdmissionRetryAfterMs() > NUM.ZERO ?
      this.getBootstrapAdmissionRetryAfterMs() :
      BOOTSTRAP_API_DEFAULT.BOOTSTRAP_ADMISSION_RETRY_AFTER_MS;
    const sweepInterval = Number.isFinite(this.getMoveReplicaAssignmentSweepIntervalMs()) &&
      this.getMoveReplicaAssignmentSweepIntervalMs() > NUM.ZERO ?
      this.getMoveReplicaAssignmentSweepIntervalMs() :
      admissionFloor;

    if (!reservation) {
      return admissionFloor;
    }

    const blockingUntilMs =
      reservation.status === BOOTSTRAP_API_HANDOFF_STATUS.COMMITTED &&
        Number.isFinite(reservation.updatedAt) ?
        reservation.updatedAt + this.getMoveReplicaAssignmentLeaseMs() :
        reservation.leaseExpiresAt;
    if (!Number.isFinite(blockingUntilMs)) {
      return Math.max(admissionFloor, sweepInterval);
    }

    const remainingMs = Math.max(NUM.ZERO, blockingUntilMs - now);
    if (remainingMs === NUM.ZERO) {
      return admissionFloor;
    }

    return Math.max(admissionFloor, Math.min(sweepInterval, remainingMs));
  },

  isMoveReplicaAssignmentReservationActive(reservation, now = Date.now()) {
    return this.getMoveReplicaAssignmentReservationInvalidationReason(
      reservation,
      now,
    ) === null;
  }
};

export {moveReplicaAssignmentAdmissionBlockingMethods};
