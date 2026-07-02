import {
  isRetryableControlPlaneError,
  getControlPlaneRetryAfterMs,
} from '../../control-plane/control-plane-error-classification.js';
import {
  moveReplicaAssignmentAdmissionBlockingMethods,
} from './move-replica-assignment-admission-blocking.js';
import {
  moveReplicaAssignmentLeaseValidationMethods,
} from './move-replica-assignment-lease-validation.js';
import {
  moveReplicaAssignmentReservationLifecycleMethods,
} from './move-replica-assignment-reservation-lifecycle.js';
import {
  moveReplicaAssignmentReservationPersistenceMethods,
} from './move-replica-assignment-reservation-persistence.js';
import {
  moveReplicaAssignmentVisibilityPolicyMethods,
} from './move-replica-assignment-visibility-policy.js';

const MOVE_REPLICA_ASSIGNMENT_SQL_RETRY_FLOOR_MS = 250;
const MOVE_REPLICA_ASSIGNMENT_SQL_RETRY_CEILING_MS = 5000;

class MoveReplicaAssignmentOwner {
  constructor(options = {}) {
    this.delegates = options.delegates || {};
    this.nextReservationSqlRetryAtMs = 0;
    this.nextRenewalWriteRetryAtByAssignmentId = new Map();
  }

  getSeedNodeId() {
    return this.delegates.getSeedNodeId?.() || null;
  }

  getSystemTableCache() {
    return this.delegates.getSystemTableCache?.() || null;
  }

  getBootstrapAuthoritativeTableRows(tableName) {
    return this.delegates.getBootstrapAuthoritativeTableRows?.(tableName) || [];
  }

  isBootstrapAuthoritativeTableRowNewer(candidate, existing) {
    return this.delegates.isBootstrapAuthoritativeTableRowNewer?.(
      candidate,
      existing,
    ) === true;
  }

  getMessageGroupServices() {
    return this.delegates.getMessageGroupServices?.() || null;
  }

  getSqlQueryEngine() {
    return this.delegates.getSqlQueryEngine?.() || null;
  }

  getLogger() {
    return this.delegates.getLogger?.() || console;
  }

  getMoveReplicaAssignmentReservations() {
    return this.delegates.getMoveReplicaAssignmentReservations?.() || null;
  }

  getMoveReplicaAssignmentLeaseMs() {
    return this.delegates.getMoveReplicaAssignmentLeaseMs?.() || 0;
  }

  getMoveReplicaAssignmentSweepIntervalMs() {
    return this.delegates.getMoveReplicaAssignmentSweepIntervalMs?.() || 0;
  }

  getBootstrapAdmissionRetryAfterMs() {
    return this.delegates.getBootstrapAdmissionRetryAfterMs?.() || 0;
  }

  async executeBootstrapControlPlaneQuery(sql, params, options = {}) {
    return this.delegates.executeBootstrapControlPlaneQuery?.(
      sql,
      params,
      options,
    );
  }

  async executeBootstrapControlPlaneMutation(mutation, options) {
    return this.delegates.executeBootstrapControlPlaneMutation?.(
      mutation,
      options,
    );
  }

  buildBootstrapControlPlaneQueryError(result, message) {
    return this.delegates.buildBootstrapControlPlaneQueryError?.(result, message) ||
      new Error(message);
  }

  buildRegisterServiceValidationError(statusCode, message, code, options) {
    return this.delegates.buildRegisterServiceValidationError?.(
      statusCode,
      message,
      code,
      options,
    ) || new Error(message);
  }

  isRetryableMoveReplicaAssignmentPersistenceFailure(value) {
    return isRetryableControlPlaneError(value);
  }

  getRetryableMoveReplicaAssignmentBackoffMs(value) {
    const retryAfterMs = getControlPlaneRetryAfterMs(value);
    if (Number.isFinite(retryAfterMs) && retryAfterMs > 0) {
      return Math.min(
        MOVE_REPLICA_ASSIGNMENT_SQL_RETRY_CEILING_MS,
        Math.max(
          MOVE_REPLICA_ASSIGNMENT_SQL_RETRY_FLOOR_MS,
          Math.floor(retryAfterMs),
        ),
      );
    }
    return MOVE_REPLICA_ASSIGNMENT_SQL_RETRY_FLOOR_MS;
  }

  armReservationSqlRetryBackoff(value, now = Date.now()) {
    this.nextReservationSqlRetryAtMs = now +
      this.getRetryableMoveReplicaAssignmentBackoffMs(value);
  }

  clearReservationSqlRetryBackoff() {
    this.nextReservationSqlRetryAtMs = 0;
  }

  shouldAttemptReservationSqlRefresh(now = Date.now()) {
    return this.nextReservationSqlRetryAtMs <= now;
  }

  armRenewalWriteRetryBackoff(assignmentId, value, now = Date.now()) {
    if (!assignmentId) {
      return;
    }
    this.nextRenewalWriteRetryAtByAssignmentId.set(
      assignmentId,
      now + this.getRetryableMoveReplicaAssignmentBackoffMs(value),
    );
  }

  clearRenewalWriteRetryBackoff(assignmentId) {
    if (!assignmentId) {
      return;
    }
    this.nextRenewalWriteRetryAtByAssignmentId.delete(assignmentId);
  }

  shouldAttemptRenewalWrite(assignmentId, now = Date.now()) {
    if (!assignmentId) {
      return true;
    }
    const retryAt =
      this.nextRenewalWriteRetryAtByAssignmentId.get(assignmentId) || 0;
    return retryAt <= now;
  }
}

const MOVE_REPLICA_ASSIGNMENT_OWNER_METHOD_GROUPS = Object.freeze([
  moveReplicaAssignmentReservationPersistenceMethods,
  moveReplicaAssignmentLeaseValidationMethods,
  moveReplicaAssignmentVisibilityPolicyMethods,
  moveReplicaAssignmentAdmissionBlockingMethods,
  moveReplicaAssignmentReservationLifecycleMethods,
]);

for (const methodGroup of MOVE_REPLICA_ASSIGNMENT_OWNER_METHOD_GROUPS) {
  for (const [methodName, method] of Object.entries(methodGroup)) {
    Object.defineProperty(MoveReplicaAssignmentOwner.prototype, methodName, {
      value: method,
      configurable: true,
      writable: true,
    });
  }
}

export {MoveReplicaAssignmentOwner};
