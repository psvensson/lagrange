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

export {OPERATION_RESERVATION_ATTEMPT_OUTCOME};
