import {
  COLUMN,
  SERVICE_TYPE,
  STRING,
  TABLES,
} from '../../constants/index.js';
import {
  BOOTSTRAP_API_ASSIGNMENT,
  BOOTSTRAP_API_ERROR,
  BOOTSTRAP_API_SQL,
} from '../bootstrap-api-constants.js';

const moveReplicaAssignmentReservationPersistenceMethods = {
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
  },

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
  },

  getMoveReplicaAssignmentRowsFromCache() {
    const systemTableCache = this.getSystemTableCache();
    const isMoveReplicaAssignmentRow = (row) => {
      const type = row?.type || row?.operation_type || null;
      return type === BOOTSTRAP_API_ASSIGNMENT.OPERATION_TYPE;
    };

    if (typeof systemTableCache?.filter === 'function') {
      return systemTableCache.filter(
        TABLES.REPLICA_OPERATIONS,
        isMoveReplicaAssignmentRow,
      ) || [];
    }

    if (typeof systemTableCache?.getAll === 'function') {
      return (systemTableCache.getAll(TABLES.REPLICA_OPERATIONS) || [])
        .filter(isMoveReplicaAssignmentRow);
    }

    return null;
  },

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
  },

  async collectMoveReplicaAssignmentReservations(options = {}) {
    const now = Number.isFinite(options.now) ?
      Math.floor(options.now) :
      Date.now();
    const byAssignmentId = new Map();
    const localReservationIds = new Set();
    const reservations = this.getMoveReplicaAssignmentReservations();

    for (const reservation of reservations?.values?.() || []) {
      const normalized = this.normalizeMoveReplicaAssignmentReservationRow(reservation);
      if (!normalized) {
        continue;
      }
      byAssignmentId.set(normalized.assignmentId, normalized);
      localReservationIds.add(normalized.assignmentId);
    }

    const cacheRows = this.getMoveReplicaAssignmentRowsFromCache();
    const cacheCoveredAssignmentIds = new Set();
    if (Array.isArray(cacheRows) && cacheRows.length > 0) {
      for (const row of cacheRows) {
        const normalized = this.normalizeMoveReplicaAssignmentReservationRow(row);
        if (!normalized) {
          continue;
        }
        cacheCoveredAssignmentIds.add(normalized.assignmentId);
        byAssignmentId.set(normalized.assignmentId, normalized);
        reservations?.set(normalized.assignmentId, normalized);
      }
      const hasLocallyUnconfirmedReservations =
        [...localReservationIds].some((assignmentId) =>
          cacheCoveredAssignmentIds.has(assignmentId) !== true,
        );
      if (!hasLocallyUnconfirmedReservations) {
        return [...byAssignmentId.values()];
      }
    }

    if (!this.getSqlQueryEngine() || !this.shouldAttemptReservationSqlRefresh(now)) {
      return [...byAssignmentId.values()];
    }

    let queryResult = null;
    try {
      queryResult = await this.executeBootstrapControlPlaneQuery(
        BOOTSTRAP_API_SQL.SELECT_MOVE_ASSIGNMENT_RESERVATIONS,
        [BOOTSTRAP_API_ASSIGNMENT.OPERATION_TYPE],
        {
          timeoutBudget: options.timeoutBudget || null,
        },
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
  },

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
    const row = Array.isArray(queryResult?.rows) ? queryResult.rows[0] : null;
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
  },

  normalizeMoveReplicaAssignmentReservationRow(row) {
    if (!row || typeof row !== 'object') {
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
    } else if (typeof stepsHistoryRaw === 'string' &&
        stepsHistoryRaw.length > 0) {
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
  },
};

export {moveReplicaAssignmentReservationPersistenceMethods};
