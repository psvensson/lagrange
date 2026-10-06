import {REBALANCE_COORDINATOR_SHARED} from './rebalance-coordinator-shared.js';
import {
  OPERATION_RESERVATION_ATTEMPT_OUTCOME,
} from './operation-reservation-attempt-outcome.js';
import {
  STORAGE_RESERVATION_AUTHORITY_ERROR,
  activeStorageReservationMatchesOperation,
  storageReservationOperationIdentityMatches,
} from './storage-reservation-authority.js';

const {
  CONTROL_PLANE_READ_LEADER_MODE,
  CONTROL_PLANE_AUTHORITATIVE_READ_MODE,
  DEFAULT_AMPLIFICATION_FACTOR,
  REBALANCE_COORDINATOR_LOG_MSG,
  RESERVATION_STATUS,
  SQL,
  STORAGE_RESERVATION_READ_QUERY_OPTIONS,
  SYSTEM_TABLE_NAME,
  readAuthoritativeControlPlaneRows,
} = REBALANCE_COORDINATOR_SHARED;

function buildFailedReservationAdoption(owner, operation, error) {
  const reservationId = `res-${operation.operationId}`;
  owner.logger.warn(
    REBALANCE_COORDINATOR_LOG_MSG.RESERVATION_CREATE_FAILED,
    {operationId: operation.operationId, reservationId, error},
  );
  return Object.freeze({
    outcome: OPERATION_RESERVATION_ATTEMPT_OUTCOME.FAILED,
    reservationId,
    error,
  });
}

function classifyOperationAdoptionError(owner, operation, observation) {
  if (observation?.deferredOutcome) {
    return STORAGE_RESERVATION_AUTHORITY_ERROR.OPERATION_AUTHORITY_UNAVAILABLE;
  }
  const authoritativeOperation = observation?.operation || null;
  if (!authoritativeOperation) {
    return STORAGE_RESERVATION_AUTHORITY_ERROR.OPERATION_ABSENT;
  }
  if (owner.isOperationTerminal(authoritativeOperation)) {
    return STORAGE_RESERVATION_AUTHORITY_ERROR.OPERATION_TERMINAL;
  }
  if (!storageReservationOperationIdentityMatches(
    operation,
    authoritativeOperation,
  )) {
    return STORAGE_RESERVATION_AUTHORITY_ERROR.OPERATION_MISMATCH;
  }
  return null;
}

async function observeAuthoritativeOperationForReservation(
  owner,
  operation,
  options = {},
) {
  const operationObservation =
    await owner.queryAuthoritativeOperationVisibilityObservation(
      operation.operationId,
      {
        authoritativeReadMode:
          CONTROL_PLANE_AUTHORITATIVE_READ_MODE.OWNER_RPC_REQUIRED,
        leaderMode: CONTROL_PLANE_READ_LEADER_MODE.PREFERRED,
        allowOwnerPersistedTransitionDeferredVisibility: false,
        requireAbsenceConfirmation: true,
        timeoutBudget: options.timeoutBudget,
      },
    );
  return classifyOperationAdoptionError(
    owner,
    operation,
    operationObservation,
  );
}

function buildReservationRowAdoption(owner, operation, rows, options) {
  const reservationId = `res-${operation.operationId}`;
  if (rows.length === 0 && options.allowConfirmedAbsentReservation === true) {
    return Object.freeze({
      outcome: OPERATION_RESERVATION_ATTEMPT_OUTCOME.FAILED,
      reservationId,
      error: STORAGE_RESERVATION_AUTHORITY_ERROR.RESERVATION_ABSENT,
      reservationAbsent: true,
    });
  }
  if (rows.length === 0) {
    return buildFailedReservationAdoption(
      owner,
      operation,
      STORAGE_RESERVATION_AUTHORITY_ERROR.RESERVATION_ABSENT,
    );
  }
  const rowMatches = rows.length === 1 &&
    activeStorageReservationMatchesOperation(rows[0], operation, {
      activeStatus: RESERVATION_STATUS.ACTIVE,
      amplificationFactor: DEFAULT_AMPLIFICATION_FACTOR,
      reasonCode: owner.getReservationReasonCode(operation.type),
      reservationId,
    });
  if (!rowMatches) {
    return buildFailedReservationAdoption(
      owner,
      operation,
      STORAGE_RESERVATION_AUTHORITY_ERROR.RESERVATION_MISMATCH,
    );
  }
  return Object.freeze({
    outcome: OPERATION_RESERVATION_ATTEMPT_OUTCOME.ALREADY_ACTIVE,
    reservationId,
  });
}

async function adoptAuthoritativeReservationForOperation(
  owner,
  operation,
  options = {},
) {
  const activeResult = await readAuthoritativeControlPlaneRows(
    owner.controlPlaneSystemTableGateway,
    SYSTEM_TABLE_NAME.STORAGE_RESERVATIONS,
    SQL.SELECT_ACTIVE_RESERVATIONS_BY_OPERATION,
    [operation.operationId, RESERVATION_STATUS.ACTIVE],
    {
      ...STORAGE_RESERVATION_READ_QUERY_OPTIONS,
      authoritativeReadMode:
        CONTROL_PLANE_AUTHORITATIVE_READ_MODE.OWNER_RPC_REQUIRED,
      leaderMode: CONTROL_PLANE_READ_LEADER_MODE.PREFERRED,
      timeoutBudget: options.timeoutBudget,
    },
  );
  if (!activeResult.success) {
    return buildFailedReservationAdoption(
      owner,
      operation,
      activeResult.error ||
        STORAGE_RESERVATION_AUTHORITY_ERROR.RESERVATION_AUTHORITY_UNAVAILABLE,
    );
  }
  const rows = Array.isArray(activeResult.rows) ? activeResult.rows : [];
  // Observe the operation after the awaited reservation read so a stale live
  // observation cannot authorize adoption after the operation has completed.
  const operationError = await observeAuthoritativeOperationForReservation(
    owner,
    operation,
    options,
  );
  if (operationError) {
    return buildFailedReservationAdoption(
      owner,
      operation,
      operationError,
    );
  }
  return buildReservationRowAdoption(owner, operation, rows, options);
}

export {
  adoptAuthoritativeReservationForOperation,
  buildFailedReservationAdoption,
  observeAuthoritativeOperationForReservation,
};
