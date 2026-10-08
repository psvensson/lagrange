// Typed outcome of a reservation create/repair attempt (audit findings
// 3+11): the reservation insert used to be warn-logged and swallowed,
// stranding under-reserved operations; createReservationForOperation and
// ensureReservationForOperation now return one of these dispositions and
// callers decide whether the attempt may proceed (operation creation fails
// closed; the dispatch gate skips only on FAILED). Leaf module shared by
// the coordinator reservation lifecycle and the workflow-owner dispatch
// gate so neither side imports the other's class hierarchy.
const OPERATION_RESERVATION_ATTEMPT_OUTCOME = Object.freeze({
  CREATED: 'created',
  ALREADY_ACTIVE: 'already_active',
  NOT_REQUIRED: 'not_required',
  FAILED: 'failed',
});

const OPERATION_RESERVATION_RECOVERY_OUTCOME = Object.freeze({
  NOT_APPLICABLE: 'not_applicable',
  LIFECYCLE_RECONCILED: 'lifecycle_reconciled',
  RESERVATION_BACKED_PENDING_REDRIVEN:
    'reservation_backed_pending_redriven',
});

function buildReservationAuthorityUnavailableError(message) {
  const error = new Error(message);
  error.deferRetry = true;
  error.reservationAuthorityUnavailable = true;
  return error;
}

export {
  OPERATION_RESERVATION_ATTEMPT_OUTCOME,
  OPERATION_RESERVATION_RECOVERY_OUTCOME,
  buildReservationAuthorityUnavailableError,
};
