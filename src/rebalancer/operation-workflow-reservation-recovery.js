import {
  OPERATION_RESERVATION_ATTEMPT_OUTCOME,
  OPERATION_RESERVATION_RECOVERY_OUTCOME,
  buildReservationAuthorityUnavailableError,
} from './operation-reservation-attempt-outcome.js';
import {isDispatchReservationGateEngaged} from
  './operation-workflow-dispatch-reservation-gate.js';
import {OPERATION_WORKFLOW_OWNER_SHARED} from
  './operation-workflow-owner-shared.js';

const {WORKFLOW_STEP} = OPERATION_WORKFLOW_OWNER_SHARED;
const STORAGE_RESERVATION_AUTHORITY_UNAVAILABLE_RECOVERY_MESSAGE =
  'storage reservation authority unavailable during recovery';

async function reconcileReservationBackedPendingOperation(
  owner,
  operation,
) {
  if (
    operation?.workflowStep !== WORKFLOW_STEP.PENDING ||
    !isDispatchReservationGateEngaged(owner)
  ) {
    return OPERATION_RESERVATION_RECOVERY_OUTCOME.NOT_APPLICABLE;
  }
  const reservationAttempt = await owner.ensureReservationForOperation(
    operation,
    {allowCreate: false},
  );
  if (
    reservationAttempt?.outcome ===
    OPERATION_RESERVATION_ATTEMPT_OUTCOME.ALREADY_ACTIVE
  ) {
    await owner.dispatchOperationInternal(operation);
    return OPERATION_RESERVATION_RECOVERY_OUTCOME
      .RESERVATION_BACKED_PENDING_REDRIVEN;
  }
  if (reservationAttempt?.authorityUnavailable === true) {
    throw buildReservationAuthorityUnavailableError(
      reservationAttempt.error ||
        STORAGE_RESERVATION_AUTHORITY_UNAVAILABLE_RECOVERY_MESSAGE,
    );
  }
  return OPERATION_RESERVATION_RECOVERY_OUTCOME.NOT_APPLICABLE;
}

export {reconcileReservationBackedPendingOperation};
