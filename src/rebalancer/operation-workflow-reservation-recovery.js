import {
  OPERATION_RESERVATION_ATTEMPT_OUTCOME,
  OPERATION_RESERVATION_RECOVERY_OUTCOME,
  buildReservationAuthorityUnavailableError,
} from './operation-reservation-attempt-outcome.js';
import {OPERATION_WORKFLOW_OWNER_SHARED} from
  './operation-workflow-owner-shared.js';

const {WORKFLOW_STEP} = OPERATION_WORKFLOW_OWNER_SHARED;

async function reconcileReservationBackedPendingOperation(
  owner,
  operation,
) {
  if (
    operation?.workflowStep !== WORKFLOW_STEP.PENDING ||
    typeof owner.ensureReservationForOperation !== 'function'
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
        'storage reservation authority unavailable during recovery',
    );
  }
  return OPERATION_RESERVATION_RECOVERY_OUTCOME.NOT_APPLICABLE;
}

export {reconcileReservationBackedPendingOperation};
