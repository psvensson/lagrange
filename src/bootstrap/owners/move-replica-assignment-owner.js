import {v4 as uuidv4} from 'uuid';
import {
  COLUMN,
  HTTP_STATUS,
  NUM,
  SERVICE_STATUS,
  SERVICE_TYPE,
  STRING,
  TABLES,
  TYPEOF,
  WORKFLOW_STEP,
} from '../../constants/index.js';
import {isNodeRecordReady} from '../../node/node-readiness-policy.js';
import {
  BOOTSTRAP_API_ASSIGNMENT,
  BOOTSTRAP_API_DEFAULT,
  BOOTSTRAP_API_ERROR,
  BOOTSTRAP_API_HANDOFF_STATUS,
  BOOTSTRAP_API_LOG_MSG,
  BOOTSTRAP_API_MOVE_REPLICA_ASSIGNMENT_ERROR as
  MOVE_REPLICA_ASSIGNMENT_ERROR,
  BOOTSTRAP_API_MOVE_REPLICA_ASSIGNMENT_HISTORY_PHASE as
  MOVE_REPLICA_ASSIGNMENT_HISTORY_PHASE,
  BOOTSTRAP_API_MOVE_REPLICA_ASSIGNMENT_INVALIDATION_REASON as
  MOVE_REPLICA_ASSIGNMENT_INVALIDATION_REASON,
  BOOTSTRAP_API_REGISTER_SERVICE_ERROR_CODE,
  BOOTSTRAP_API_SQL,
} from '../bootstrap-api-constants.js';
import {
  isRetryableControlPlaneError,
  getControlPlaneRetryAfterMs,
} from '../../control-plane/control-plane-error-classification.js';
import {
  getSystemCachePrimaryKeyFieldOrFallback,
} from '../../cache/system-cache-key-descriptor.js';

const MOVE_REPLICA_ASSIGNMENT_SQL_RETRY_FLOOR_MS = 250;
const MOVE_REPLICA_ASSIGNMENT_SQL_RETRY_CEILING_MS = 5000;
const MOVE_REPLICA_ASSIGNMENT_ROW_FALLBACK_PRIMARY_KEY = 'id';

function normalizeMoveReplicaAssignmentObservedRowKey(value) {
  if (typeof value !== TYPEOF.STRING) {
    return null;
  }
  const normalized = value.trim();
  return normalized.length > NUM.ZERO ? normalized : null;
}

function readMoveReplicaAssignmentObservedRowKey(tableName, row) {
  const keyField = getSystemCachePrimaryKeyFieldOrFallback(
    tableName,
    MOVE_REPLICA_ASSIGNMENT_ROW_FALLBACK_PRIMARY_KEY,
  );
  return normalizeMoveReplicaAssignmentObservedRowKey(
    row?.[keyField] ?? row?.id ?? null,
  );
}

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

  async executeBootstrapControlPlaneQuery(sql, params) {
    return this.delegates.executeBootstrapControlPlaneQuery?.(sql, params);
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
    if (Number.isFinite(retryAfterMs) && retryAfterMs > NUM.ZERO) {
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
    this.nextReservationSqlRetryAtMs = NUM.ZERO;
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
      this.nextRenewalWriteRetryAtByAssignmentId.get(assignmentId) || NUM.ZERO;
    return retryAt <= now;
  }

  buildMoveReplicaAssignmentReplicaOperationRow(
    reservation,
    workflowStep,
    options = {},
  ) {
    return {
      operation_id: reservation.assignmentId,
      type: BOOTSTRAP_API_ASSIGNMENT.OPERATION_TYPE,
      partition_id: reservation.groupId || null,
      replica_id: reservation.replicaId,
      source_node_id: reservation.sourceNodeId || null,
      target_node_id: reservation.targetNodeId,
      status: reservation.status,
      workflow_step: workflowStep,
      created_at: Number.isFinite(options.createdAt) ?
        Math.floor(options.createdAt) :
        reservation.updatedAt,
      updated_at: reservation.updatedAt,
      completed_at: Number.isFinite(options.completedAt) ?
        Math.floor(options.completedAt) :
        null,
      lease_expires_at: Number.isFinite(reservation.leaseExpiresAt) ?
        Math.floor(reservation.leaseExpiresAt) :
        null,
      error_message: options.errorMessage || null,
      steps_history: JSON.stringify(reservation.stepsHistory || []),
      entity_type: SERVICE_TYPE.MESSAGE_GROUP,
      entity_id: reservation.groupId || null,
    };
  }

  buildMoveReplicaAssignmentReplicaOperationUpdateData(
    reservation,
    workflowStep,
    options = {},
  ) {
    return {
      status: reservation.status,
      workflow_step: workflowStep,
      updated_at: reservation.updatedAt,
      completed_at: Number.isFinite(options.completedAt) ?
        Math.floor(options.completedAt) :
        null,
      lease_expires_at: Number.isFinite(reservation.leaseExpiresAt) ?
        Math.floor(reservation.leaseExpiresAt) :
        null,
      error_message: options.errorMessage || null,
      steps_history: JSON.stringify(reservation.stepsHistory || []),
    };
  }

  getMoveReplicaAssignmentRowsFromCache() {
    const systemTableCache = this.getSystemTableCache();
    const isMoveReplicaAssignmentRow = (row) => {
      const type = row?.type || row?.operation_type || null;
      return type === BOOTSTRAP_API_ASSIGNMENT.OPERATION_TYPE;
    };

    if (typeof systemTableCache?.filter === TYPEOF.FUNCTION) {
      return systemTableCache.filter(
        TABLES.REPLICA_OPERATIONS,
        isMoveReplicaAssignmentRow,
      ) || [];
    }

    if (typeof systemTableCache?.getAll === TYPEOF.FUNCTION) {
      return (systemTableCache.getAll(TABLES.REPLICA_OPERATIONS) || [])
        .filter(isMoveReplicaAssignmentRow);
    }

    return null;
  }

  collectMoveReplicaAssignmentReservationsFromRows(rows, byAssignmentId) {
    const reservations = this.getMoveReplicaAssignmentReservations();
    for (const row of Array.isArray(rows) ? rows : []) {
      const normalized = this.normalizeMoveReplicaAssignmentReservationRow(row);
      if (!normalized) {
        continue;
      }
      byAssignmentId.set(normalized.assignmentId, normalized);
      reservations?.set(normalized.assignmentId, normalized);
    }
  }

  async collectMoveReplicaAssignmentReservations(options = {}) {
    const now = Number.isFinite(options.now) ?
      Math.floor(options.now) :
      Date.now();
    const byAssignmentId = new Map();
    const reservations = this.getMoveReplicaAssignmentReservations();

    for (const reservation of reservations?.values?.() || []) {
      const normalized = this.normalizeMoveReplicaAssignmentReservationRow(reservation);
      if (!normalized) {
        continue;
      }
      byAssignmentId.set(normalized.assignmentId, normalized);
    }

    const cacheRows = this.getMoveReplicaAssignmentRowsFromCache();
    if (Array.isArray(cacheRows) && cacheRows.length > NUM.ZERO) {
      this.collectMoveReplicaAssignmentReservationsFromRows(cacheRows, byAssignmentId);
      return [...byAssignmentId.values()];
    }
    if (byAssignmentId.size > NUM.ZERO) {
      return [...byAssignmentId.values()];
    }

    if (!this.getSqlQueryEngine() || !this.shouldAttemptReservationSqlRefresh(now)) {
      return [...byAssignmentId.values()];
    }

    let queryResult = null;
    try {
      queryResult = await this.executeBootstrapControlPlaneQuery(
        BOOTSTRAP_API_SQL.SELECT_MOVE_ASSIGNMENT_RESERVATIONS,
        [BOOTSTRAP_API_ASSIGNMENT.OPERATION_TYPE],
      );
    } catch (error) {
      if (this.isRetryableMoveReplicaAssignmentPersistenceFailure(error)) {
        this.armReservationSqlRetryBackoff(error, now);
      }
      return [...byAssignmentId.values()];
    }

    if (queryResult?.success === false) {
      if (this.isRetryableMoveReplicaAssignmentPersistenceFailure(queryResult)) {
        this.armReservationSqlRetryBackoff(queryResult, now);
      }
      return [...byAssignmentId.values()];
    }

    this.clearReservationSqlRetryBackoff();
    this.collectMoveReplicaAssignmentReservationsFromRows(queryResult?.rows, byAssignmentId);
    return [...byAssignmentId.values()];
  }

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
  }

  async getMoveReplicaAssignmentReservationById(assignmentId) {
    const reservations = this.getMoveReplicaAssignmentReservations();
    const cached = this.normalizeMoveReplicaAssignmentReservationRow(
      reservations?.get(assignmentId),
    );
    if (cached) {
      return {reservation: cached, lookupUnavailable: false, error: null};
    }

    const cachedRow = this.normalizeMoveReplicaAssignmentReservationRow(
      this.getSystemTableCache()?.get(TABLES.REPLICA_OPERATIONS, assignmentId),
    );
    if (cachedRow) {
      reservations?.set(assignmentId, cachedRow);
      return {reservation: cachedRow, lookupUnavailable: false, error: null};
    }

    if (!this.getSqlQueryEngine()) {
      return {reservation: null, lookupUnavailable: false, error: null};
    }

    let queryResult = null;
    try {
      queryResult = await this.executeBootstrapControlPlaneQuery(
        BOOTSTRAP_API_SQL.SELECT_REPLICA_OPERATION_BY_ID,
        [assignmentId],
      );
    } catch (error) {
      return {
        reservation: null,
        lookupUnavailable: true,
        error: error?.message || String(error),
      };
    }
    if (queryResult?.success === false) {
      return {
        reservation: null,
        lookupUnavailable: true,
        error:
          queryResult.error ||
          BOOTSTRAP_API_ERROR.ASSIGNMENT_TOKEN_LOOKUP_UNAVAILABLE,
      };
    }
    const row = Array.isArray(queryResult?.rows) ? queryResult.rows[NUM.ZERO] : null;
    if (!row) {
      return {reservation: null, lookupUnavailable: false, error: null};
    }
    const type = row.type || row.operation_type || null;
    if (type !== BOOTSTRAP_API_ASSIGNMENT.OPERATION_TYPE) {
      return {reservation: null, lookupUnavailable: false, error: null};
    }
    const normalized = this.normalizeMoveReplicaAssignmentReservationRow(row);
    if (!normalized) {
      return {reservation: null, lookupUnavailable: false, error: null};
    }
    reservations?.set(assignmentId, normalized);
    return {reservation: normalized, lookupUnavailable: false, error: null};
  }

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
  }

  shouldRenewMoveReplicaAssignmentReservation(reservation, now = Date.now()) {
    if (!Number.isFinite(reservation?.leaseExpiresAt)) {
      return false;
    }
    const renewalWindowMs = Math.max(
      NUM.ONE,
      Math.floor(this.getMoveReplicaAssignmentLeaseMs() / NUM.TWO),
    );
    return reservation.leaseExpiresAt - now <= renewalWindowMs;
  }

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
      if (!this.canReviveExpiredMoveReplicaAssignmentReservation(reservation)) {
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
                'failed to persist MOVE_REPLICA assignment lease renewal',
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

  isMoveReplicaAssignmentSourceReplicaPresentLocally(reservation) {
    if (!reservation?.replicaId) {
      return false;
    }
    if (reservation.sourceNodeId && reservation.sourceNodeId !== this.getSeedNodeId()) {
      return false;
    }
    return this.getMessageGroupServices()?.has?.(reservation.replicaId) === true;
  }

  resolveObservedMoveReplicaAssignmentTableRow(tableName, rowKey) {
    const normalizedRowKey =
      normalizeMoveReplicaAssignmentObservedRowKey(rowKey);
    if (!normalizedRowKey) {
      return null;
    }

    const authoritativeRows = this.getBootstrapAuthoritativeTableRows(tableName);
    const authoritativeRow =
      Array.isArray(authoritativeRows) && authoritativeRows.length > NUM.ZERO ?
        authoritativeRows.find((row) => {
          return readMoveReplicaAssignmentObservedRowKey(tableName, row) ===
            normalizedRowKey;
        }) || null :
        null;
    const cacheRow =
      this.getSystemTableCache()?.get?.(tableName, normalizedRowKey) || null;
    if (!authoritativeRow) {
      return cacheRow;
    }
    if (!cacheRow) {
      return authoritativeRow;
    }
    return this.isBootstrapAuthoritativeTableRowNewer(
      authoritativeRow,
      cacheRow,
    ) ?
      authoritativeRow :
      cacheRow;
  }

  evaluateMoveReplicaAssignmentReservationOwnership(
    reservation,
    now = Date.now(),
  ) {
    const existingServiceRow =
      this.resolveObservedMoveReplicaAssignmentTableRow(
        TABLES.SERVICES,
        reservation?.replicaId || null,
      );
    const existingStatus = String(
      existingServiceRow?.[COLUMN.STATUS] || STRING.UNKNOWN,
    ).toLowerCase();
    const existingNodeId = existingServiceRow?.[COLUMN.NODE_ID] || null;
    const sourceOwnsActiveReplica =
      existingStatus === SERVICE_STATUS.ACTIVE &&
      existingNodeId === (reservation?.sourceNodeId || null);
    const targetOwnsActiveReplica =
      existingStatus === SERVICE_STATUS.ACTIVE &&
      existingNodeId === (reservation?.targetNodeId || null);
    const sourceNodeRow = reservation?.sourceNodeId ?
      this.resolveObservedMoveReplicaAssignmentTableRow(
        TABLES.NODES,
        reservation.sourceNodeId,
      ) :
      null;
    const targetNodeRow = reservation?.targetNodeId ?
      this.resolveObservedMoveReplicaAssignmentTableRow(
        TABLES.NODES,
        reservation.targetNodeId,
      ) :
      null;
    const sourceNodeReady = !sourceNodeRow ||
      isNodeRecordReady(sourceNodeRow, {now});
    const targetNodeReady = !!targetNodeRow &&
      isNodeRecordReady(targetNodeRow, {now});
    const sourceReplicaPresentLocally =
      this.isMoveReplicaAssignmentSourceReplicaPresentLocally(reservation);

    return {
      existingRow: existingServiceRow,
      existingNodeId,
      existingStatus,
      sourceOwnsActiveReplica,
      targetOwnsActiveReplica,
      sourceNodeReady,
      targetNodeReady,
      sourceReplicaPresentLocally,
      hasActiveServiceOwner:
        existingStatus === SERVICE_STATUS.ACTIVE && typeof existingNodeId === TYPEOF.STRING,
      continuingTargetAdoption:
        targetOwnsActiveReplica &&
        sourceReplicaPresentLocally,
      observedCommitted:
        targetOwnsActiveReplica &&
        !sourceReplicaPresentLocally,
    };
  }

  canReviveExpiredMoveReplicaAssignmentReservation(
    reservation,
    now = Date.now(),
  ) {
    if (!reservation?.replicaId || !reservation?.targetNodeId) {
      return false;
    }
    if (BOOTSTRAP_API_ASSIGNMENT.TERMINAL_STATUSES.includes(reservation.status)) {
      return false;
    }
    const ownership =
      this.evaluateMoveReplicaAssignmentReservationOwnership(reservation);
    if (!ownership.hasActiveServiceOwner || ownership.observedCommitted) {
      return false;
    }
    if (!ownership.sourceOwnsActiveReplica &&
        !ownership.continuingTargetAdoption) {
      return false;
    }
    return this.hasViableMoveReplicaAssignmentSource(reservation, now);
  }

  shouldTolerateMoveReplicaAssignmentSourceUnavailable(
    reservation,
    now = Date.now(),
  ) {
    return Number.isFinite(reservation?.leaseExpiresAt) &&
      reservation.leaseExpiresAt > now;
  }

  hasViableMoveReplicaAssignmentSource(reservation, now = Date.now()) {
    if (!reservation?.replicaId) {
      return false;
    }
    const ownership =
      this.evaluateMoveReplicaAssignmentReservationOwnership(reservation, now);
    if (ownership.observedCommitted) {
      return false;
    }

    if (ownership.sourceReplicaPresentLocally &&
        ownership.sourceNodeReady) {
      return true;
    }
    if (!ownership.hasActiveServiceOwner) {
      return false;
    }
    if (!reservation.sourceNodeId) {
      return ownership.continuingTargetAdoption ||
        ownership.targetOwnsActiveReplica;
    }
    if (ownership.continuingTargetAdoption) {
      return true;
    }
    if (!ownership.sourceOwnsActiveReplica) {
      return false;
    }
    return ownership.sourceNodeReady;
  }

  getMoveReplicaAssignmentReservationInvalidationReason(
    reservation,
    now = Date.now(),
  ) {
    if (!reservation ||
        typeof reservation.assignmentId !== TYPEOF.STRING ||
        reservation.assignmentId.length === NUM.ZERO) {
      return MOVE_REPLICA_ASSIGNMENT_INVALIDATION_REASON.INVALID_RESERVATION;
    }
    if (!reservation.replicaId || !reservation.targetNodeId) {
      return MOVE_REPLICA_ASSIGNMENT_INVALIDATION_REASON.MISSING_ASSIGNMENT_FIELDS;
    }
    if (BOOTSTRAP_API_ASSIGNMENT.TERMINAL_STATUSES.includes(reservation.status)) {
      return MOVE_REPLICA_ASSIGNMENT_INVALIDATION_REASON.TERMINAL;
    }
    if (!BOOTSTRAP_API_ASSIGNMENT.ACTIVE_RESERVATION_STATUSES.includes(
      reservation.status,
    )) {
      return MOVE_REPLICA_ASSIGNMENT_INVALIDATION_REASON.INACTIVE_STATUS;
    }
    const ownership =
      this.evaluateMoveReplicaAssignmentReservationOwnership(reservation, now);
    if (ownership.observedCommitted) {
      return null;
    }
    if (!Number.isFinite(reservation.leaseExpiresAt)) {
      return MOVE_REPLICA_ASSIGNMENT_INVALIDATION_REASON.MISSING_LEASE;
    }
    if (reservation.leaseExpiresAt <= now) {
      return this.canReviveExpiredMoveReplicaAssignmentReservation(
        reservation,
        now,
      ) ?
        MOVE_REPLICA_ASSIGNMENT_INVALIDATION_REASON.LEASE_EXPIRED :
        MOVE_REPLICA_ASSIGNMENT_INVALIDATION_REASON.SOURCE_OWNER_UNAVAILABLE;
    }
    if (!this.hasViableMoveReplicaAssignmentSource(reservation, now) &&
        !this.shouldTolerateMoveReplicaAssignmentSourceUnavailable(
          reservation,
          now,
        )) {
      return MOVE_REPLICA_ASSIGNMENT_INVALIDATION_REASON.SOURCE_OWNER_UNAVAILABLE;
    }
    return null;
  }

  shouldReconcileMoveReplicaAssignmentReservationToCommitted(
    reservation,
    now = Date.now(),
  ) {
    if (!reservation ||
        BOOTSTRAP_API_ASSIGNMENT.TERMINAL_STATUSES.includes(reservation.status)) {
      return false;
    }
    return this.evaluateMoveReplicaAssignmentReservationOwnership(
      reservation,
      now,
    ).observedCommitted;
  }

  normalizeMoveReplicaAssignmentReservationRow(row) {
    if (!row || typeof row !== TYPEOF.OBJECT) {
      return null;
    }
    const assignmentId = row[COLUMN.OPERATION_ID] || row.operation_id || row.operationId;
    const normalizedAssignmentId = assignmentId || row.assignmentId || null;
    const replicaId = row[COLUMN.REPLICA_ID] || row.replica_id || row.replicaId || null;
    const targetNodeId =
      row[COLUMN.TARGET_NODE_ID] || row.target_node_id || row.targetNodeId || null;
    const sourceNodeId =
      row.source_node_id || row.sourceNodeId || row.sourceNode || row.sourceNodeId || null;
    const groupId = row[COLUMN.PARTITION_ID] || row.partition_id || row.partitionId || null;
    const status = String(row[COLUMN.STATUS] || row.status || STRING.UNKNOWN).toLowerCase();
    const leaseRaw =
      row.lease_expires_at ??
      row.leaseExpiresAt ??
      row.completed_at ??
      row.completedAt ??
      null;
    const leaseExpiresAt = Number.isFinite(Number(leaseRaw)) ?
      Math.floor(Number(leaseRaw)) :
      null;
    const updatedAtRaw = row[COLUMN.UPDATED_AT] ?? row.updated_at ?? row.updatedAt;
    const updatedAt = Number.isFinite(Number(updatedAtRaw)) ?
      Math.floor(Number(updatedAtRaw)) :
      Date.now();
    const stepsHistoryRaw = row.steps_history ?? row.stepsHistory ?? null;
    let stepsHistory = [];
    if (Array.isArray(stepsHistoryRaw)) {
      stepsHistory = stepsHistoryRaw;
    } else if (typeof stepsHistoryRaw === TYPEOF.STRING &&
        stepsHistoryRaw.length > NUM.ZERO) {
      try {
        const parsedStepsHistory = JSON.parse(stepsHistoryRaw);
        if (Array.isArray(parsedStepsHistory)) {
          stepsHistory = parsedStepsHistory;
        }
      } catch (_error) {
        stepsHistory = [];
      }
    }

    if (!normalizedAssignmentId || !replicaId || !targetNodeId) {
      return null;
    }

    return {
      assignmentId: normalizedAssignmentId,
      replicaId,
      sourceNodeId,
      targetNodeId,
      groupId,
      status,
      leaseExpiresAt,
      updatedAt,
      stepsHistory,
    };
  }

  async getActiveMoveReplicaAssignmentReservations() {
    const now = Date.now();
    const reservations =
      await this.collectMoveReplicaAssignmentReservations({now});
    return reservations.filter((reservation) =>
      this.isMoveReplicaAssignmentReservationActive(reservation, now),
    );
  }

  async getBlockingMoveReplicaBootstrapAdmissions(now = Date.now()) {
    const reservations = [];
    const byAssignmentId = new Map();
    const collectedReservations =
      await this.collectMoveReplicaAssignmentReservations({now});
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
  }

  async getMoveReplicaBootstrapExclusionReservations(now = Date.now()) {
    const reservations = [];
    const byAssignmentId = new Map();
    const collectedReservations =
      await this.collectMoveReplicaAssignmentReservations({now});
    for (const reservation of collectedReservations) {
      byAssignmentId.set(reservation.assignmentId, reservation);
    }

    for (const reservation of byAssignmentId.values()) {
      if (this.isMoveReplicaAssignmentReservationOpen(reservation, now) ||
          this.isCommittedMoveReplicaHandoffStabilizing(reservation, now)) {
        reservations.push(reservation);
      }
    }

    reservations.sort((left, right) => {
      const leftUpdatedAt = Number.isFinite(left?.updatedAt) ? left.updatedAt : NUM.ZERO;
      const rightUpdatedAt = Number.isFinite(right?.updatedAt) ? right.updatedAt : NUM.ZERO;
      return leftUpdatedAt - rightUpdatedAt;
    });
    return reservations;
  }

  isMoveReplicaBootstrapAdmissionBlocked(
    reservation,
    now = Date.now(),
  ) {
    return this.isMoveReplicaAssignmentReservationOpen(reservation, now) ||
      this.isCommittedMoveReplicaHandoffStabilizing(reservation, now);
  }

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
    const ownership =
      this.evaluateMoveReplicaAssignmentReservationOwnership(reservation, now);
    if (ownership.observedCommitted) {
      return false;
    }
    if (ownership.continuingTargetAdoption) {
      return true;
    }
    return this.hasViableMoveReplicaAssignmentSource(reservation, now);
  }

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
  }

  isMoveReplicaAssignmentTargetReady(
    reservation,
    now = Date.now(),
  ) {
    if (!reservation?.targetNodeId || !reservation?.replicaId) {
      return false;
    }

    const targetNodeRow =
      this.getSystemTableCache()?.get(TABLES.NODES, reservation.targetNodeId) || null;
    if (!targetNodeRow || !isNodeRecordReady(targetNodeRow, {now})) {
      return false;
    }

    const existingServiceRow =
      this.getSystemTableCache()?.get(TABLES.SERVICES, reservation.replicaId) || null;
    const existingNodeId = existingServiceRow?.[COLUMN.NODE_ID] || null;
    const existingStatus = String(
      existingServiceRow?.[COLUMN.STATUS] || STRING.UNKNOWN,
    ).toLowerCase();

    return existingNodeId === reservation.targetNodeId &&
      existingStatus === SERVICE_STATUS.ACTIVE;
  }

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
  }

  isMoveReplicaAssignmentReservationActive(reservation, now = Date.now()) {
    return this.getMoveReplicaAssignmentReservationInvalidationReason(
      reservation,
      now,
    ) === null;
  }

  async expireMoveReplicaAssignmentReservations() {
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
      await this.collectMoveReplicaAssignmentReservations({now});
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
      assignmentReservations?.set(reservation.assignmentId, reservation);
      await this.markMoveReplicaAssignmentReservationTerminal(
        reservation.assignmentId,
        BOOTSTRAP_API_HANDOFF_STATUS.FAILED,
        WORKFLOW_STEP.FAILED,
        invalidationReason ===
            MOVE_REPLICA_ASSIGNMENT_INVALIDATION_REASON.SOURCE_OWNER_UNAVAILABLE ?
          MOVE_REPLICA_ASSIGNMENT_ERROR.SOURCE_OWNER_UNAVAILABLE :
          MOVE_REPLICA_ASSIGNMENT_ERROR.RESERVATION_INVALID,
      );
      this.getLogger().info(BOOTSTRAP_API_LOG_MSG.MOVE_REPLICA_ASSIGNMENT_EXPIRED, {
        assignmentId: reservation.assignmentId,
        replicaId: reservation.replicaId,
        targetNodeId: reservation.targetNodeId,
        invalidationReason,
      });
    }
  }

  async reserveMoveReplicaAssignment(targetNodeId, assignment) {
    const replicaId = assignment?.replicaToMove;
    if (!replicaId) {
      throw new Error(
        MOVE_REPLICA_ASSIGNMENT_ERROR.RESERVATION_REPLICA_TO_MOVE_REQUIRED,
      );
    }

    const activeReservations = await this.getActiveMoveReplicaAssignmentReservations();
    const conflictingReservation = activeReservations.find((reservation) =>
      reservation.replicaId === replicaId,
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

    const now = Date.now();
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
        const persistResult = await this.executeBootstrapControlPlaneMutation({
          operation: 'insert',
          tableName: TABLES.REPLICA_OPERATIONS,
          row: this.buildMoveReplicaAssignmentReplicaOperationRow(
            reservation,
            WORKFLOW_STEP.PENDING,
            {createdAt: now},
          ),
        });
        if (persistResult?.success === false) {
          if (!this.isRetryableMoveReplicaAssignmentPersistenceFailure(
            persistResult,
          )) {
            reservations?.delete(assignmentId);
            throw this.buildBootstrapControlPlaneQueryError(
              persistResult,
              'Failed to persist MOVE_REPLICA assignment reservation',
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
                'failed to persist MOVE_REPLICA assignment reservation',
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
  }

  async markMoveReplicaAssignmentReservationTerminal(
    assignmentId,
    status,
    workflowStep,
    errorMessage = null,
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
      const updateResult = await this.executeBootstrapControlPlaneMutation({
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
      });
      if (updateResult?.success === false) {
        this.getLogger().warn(
          BOOTSTRAP_API_LOG_MSG.MOVE_REPLICA_ASSIGNMENT_VALIDATION_FAILED,
          {
            assignmentId,
            status,
            error:
              updateResult.error ||
              'failed to persist reservation terminal status',
          },
        );
      }
    }
  }

  async reconcileMoveReplicaAssignmentReservationToCommitted(
    reservation,
    now = Date.now(),
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
      const updateResult = await this.executeBootstrapControlPlaneMutation({
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
      });
      if (updateResult?.success === false) {
        this.getLogger().warn(
          BOOTSTRAP_API_LOG_MSG.MOVE_REPLICA_ASSIGNMENT_VALIDATION_FAILED,
          {
            assignmentId: reservation.assignmentId,
            status: BOOTSTRAP_API_HANDOFF_STATUS.COMMITTED,
            error:
              updateResult.error ||
              'failed to reconcile MOVE_REPLICA assignment to committed state',
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
  }
}

export {MoveReplicaAssignmentOwner};
