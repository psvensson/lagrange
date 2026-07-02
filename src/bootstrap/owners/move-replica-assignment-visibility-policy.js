import {
  COLUMN,
  NUM,
  SERVICE_STATUS,
  STATE,
  STRING,
  TABLES,
  TYPEOF,
} from '../../constants/index.js';
import {
  isNodeReadyLeaseExplicitlyCleared,
  isNodeRecordReady,
  wasNodeRecordReadyWhenWritten,
} from '../../node/node-readiness-policy.js';
import {
  BOOTSTRAP_API_ASSIGNMENT,
  BOOTSTRAP_API_MOVE_REPLICA_ASSIGNMENT_INVALIDATION_REASON as
  MOVE_REPLICA_ASSIGNMENT_INVALIDATION_REASON,
} from '../bootstrap-api-constants.js';
import {
  getSystemCachePrimaryKeyFieldOrFallback,
} from '../../cache/system-cache-key-descriptor.js';

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

const moveReplicaAssignmentVisibilityPolicyMethods = {
  isMoveReplicaAssignmentSourceReplicaPresentLocally(reservation) {
    if (!reservation?.replicaId) {
      return false;
    }
    if (reservation.sourceNodeId && reservation.sourceNodeId !== this.getSeedNodeId()) {
      return false;
    }
    return this.getMessageGroupServices()?.has?.(reservation.replicaId) === true;
  },

  resolveObservedMoveReplicaAssignmentTableRow(tableName, rowKey) {
    const normalizedRowKey =
      normalizeMoveReplicaAssignmentObservedRowKey(rowKey);
    if (!normalizedRowKey) {
      return null;
    }

    const authoritativeRows = this.getBootstrapAuthoritativeTableRows(tableName);
    const hasAuthoritativeRows =
      Array.isArray(authoritativeRows) && authoritativeRows.length > NUM.ZERO;
    const authoritativeRow =
      hasAuthoritativeRows ?
        authoritativeRows.find((row) => {
          return readMoveReplicaAssignmentObservedRowKey(tableName, row) ===
            normalizedRowKey;
        }) || null :
        null;
    const cacheRow =
      this.getSystemTableCache()?.get?.(tableName, normalizedRowKey) || null;
    if (hasAuthoritativeRows && !authoritativeRow) {
      return null;
    }
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
  },

  evaluateMoveReplicaAssignmentSourceNodeVisibility(
    sourceNodeRow,
    now = Date.now(),
  ) {
    if (!sourceNodeRow) {
      return {
        ready: true,
        recoverableVisibilityGap: true,
      };
    }

    const connectionState = typeof sourceNodeRow[COLUMN.CONNECTION_STATE] ===
      TYPEOF.STRING ?
      sourceNodeRow[COLUMN.CONNECTION_STATE].toLowerCase() :
      null;
    const explicitlyDisconnected = connectionState === STATE.DISCONNECTED;
    const activeStatus = sourceNodeRow[COLUMN.STATUS] === SERVICE_STATUS.ACTIVE;
    const ready = isNodeRecordReady(sourceNodeRow, {now});
    const encodedReadyHeartbeat =
      wasNodeRecordReadyWhenWritten(sourceNodeRow, {now});
    const transportConnected =
      connectionState === STATE.READY ||
      connectionState === STATE.CONNECTED;
    const explicitReadyLeaseClear =
      isNodeReadyLeaseExplicitlyCleared(sourceNodeRow);

    return {
      ready,
      recoverableVisibilityGap:
        activeStatus &&
        !explicitlyDisconnected &&
        !explicitReadyLeaseClear &&
        (encodedReadyHeartbeat || transportConnected),
    };
  },

  evaluateMoveReplicaAssignmentTargetNodeVisibility(
    targetNodeRow,
    now = Date.now(),
  ) {
    if (!targetNodeRow) {
      return {
        ready: false,
        recoverableAdoption: false,
      };
    }

    const connectionState = typeof targetNodeRow[COLUMN.CONNECTION_STATE] ===
      TYPEOF.STRING ?
      targetNodeRow[COLUMN.CONNECTION_STATE].toLowerCase() :
      null;
    const activeStatus = targetNodeRow[COLUMN.STATUS] === SERVICE_STATUS.ACTIVE;
    const transportConnected =
      connectionState === STATE.READY ||
      connectionState === STATE.CONNECTED;

    return {
      ready: isNodeRecordReady(targetNodeRow, {now}),
      recoverableAdoption: activeStatus && transportConnected,
    };
  },

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
    const sourceNodeVisibility =
      this.evaluateMoveReplicaAssignmentSourceNodeVisibility(
        sourceNodeRow,
        now,
      );
    const targetNodeVisibility =
      this.evaluateMoveReplicaAssignmentTargetNodeVisibility(
        targetNodeRow,
        now,
      );
    const sourceReplicaPresentLocally =
      this.isMoveReplicaAssignmentSourceReplicaPresentLocally(reservation);

    return {
      existingRow: existingServiceRow,
      existingNodeId,
      existingStatus,
      sourceOwnsActiveReplica,
      targetOwnsActiveReplica,
      sourceNodeReady: sourceNodeVisibility.ready,
      sourceNodeRecoverableVisibilityGap:
        sourceNodeVisibility.recoverableVisibilityGap,
      targetNodeReady: targetNodeVisibility.ready,
      targetNodeRecoverableAdoption:
        targetNodeVisibility.recoverableAdoption,
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
  },

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
      this.evaluateMoveReplicaAssignmentReservationOwnership(reservation, now);
    if (ownership.observedCommitted) {
      return false;
    }
    const localSourceReplicaIsViable =
      ownership.sourceReplicaPresentLocally &&
      ownership.sourceNodeReady;
    if (!ownership.hasActiveServiceOwner) {
      return localSourceReplicaIsViable ||
        ownership.sourceNodeReady ||
        ownership.sourceNodeRecoverableVisibilityGap ||
        ownership.targetNodeRecoverableAdoption;
    }
    if (ownership.sourceOwnsActiveReplica &&
        ownership.sourceNodeRecoverableVisibilityGap) {
      return true;
    }
    if (!ownership.sourceOwnsActiveReplica &&
        !ownership.continuingTargetAdoption) {
      return false;
    }
    return this.hasViableMoveReplicaAssignmentSource(reservation, now);
  },

  shouldTolerateMoveReplicaAssignmentSourceUnavailable(
    reservation,
    now = Date.now(),
  ) {
    return Number.isFinite(reservation?.leaseExpiresAt) &&
      reservation.leaseExpiresAt > now;
  },

  isRemoteSourceMoveReplicaAssignmentReservation(reservation) {
    return typeof reservation?.sourceNodeId === TYPEOF.STRING &&
      reservation.sourceNodeId.length > NUM.ZERO &&
      reservation.sourceNodeId !== this.getSeedNodeId();
  },

  shouldDeferMoveReplicaAssignmentInvalidationToSourceOwner(
    reservation,
    invalidationReason,
  ) {
    return invalidationReason ===
      MOVE_REPLICA_ASSIGNMENT_INVALIDATION_REASON.SOURCE_OWNER_UNAVAILABLE &&
      this.isRemoteSourceMoveReplicaAssignmentReservation(reservation);
  },

  shouldPreserveMoveReplicaAssignmentSweepSourceVisibilityGap(
    reservation,
    invalidationReason,
    now = Date.now(),
  ) {
    if (invalidationReason !==
        MOVE_REPLICA_ASSIGNMENT_INVALIDATION_REASON.SOURCE_OWNER_UNAVAILABLE) {
      return false;
    }
    if (!Number.isFinite(reservation?.leaseExpiresAt) ||
        reservation.leaseExpiresAt > now) {
      return false;
    }
    const ownership =
      this.evaluateMoveReplicaAssignmentReservationOwnership(reservation, now);
    if (!ownership.hasActiveServiceOwner) {
      return ownership.sourceNodeReady ||
        ownership.sourceNodeRecoverableVisibilityGap ||
        ownership.targetNodeRecoverableAdoption;
    }
    if (ownership.continuingTargetAdoption ||
        ownership.observedCommitted) {
      return false;
    }
    return ownership.sourceNodeReady ||
      ownership.sourceNodeRecoverableVisibilityGap;
  },

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
    return ownership.sourceNodeReady ||
      ownership.sourceNodeRecoverableVisibilityGap;
  },

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
  },

  isExpiredMoveReplicaAssignmentTargetProgressVisible(
    reservation,
    now = Date.now(),
  ) {
    if (this.getMoveReplicaAssignmentReservationInvalidationReason(
      reservation,
      now,
    ) !== MOVE_REPLICA_ASSIGNMENT_INVALIDATION_REASON.LEASE_EXPIRED) {
      return false;
    }

    const ownership =
      this.evaluateMoveReplicaAssignmentReservationOwnership(reservation, now);
    if (ownership.observedCommitted) {
      return false;
    }
    return ownership.continuingTargetAdoption ||
      ownership.targetNodeReady ||
      ownership.targetNodeRecoverableAdoption;
  },

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
  },
};

export {moveReplicaAssignmentVisibilityPolicyMethods};
