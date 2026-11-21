// The placement owner's committed command types at the partition boundary
// (quest replica-placement-admission-owner, design section 2.5). PLACEMENT_ADMIT
// is also the partition message type that routes a request to the
// replica_operations-p1 leader, as the coordinator settlement routes under
// its own type. Their outcome vocabulary is the owner's
// (rebalancer/replica-placement-owner-constants.js).
const PLACEMENT_ADMIT_TYPE = 'PLACEMENT_ADMIT';
const PLACEMENT_RELEASE_HOLD_TYPE = 'PLACEMENT_RELEASE_HOLD';
const PLACEMENT_COMMAND_TYPES = Object.freeze([PLACEMENT_ADMIT_TYPE,
  PLACEMENT_RELEASE_HOLD_TYPE]);
// The answer field a placement request answers its typed outcome under.
const PLACEMENT_RESULT_FIELD = 'placementResult';
// Host-only custody of the sent entry and its exact statement.
const RETAINED_PLACEMENT_ATTEMPT = Symbol('retainedPlacementAttempt');
const PLACEMENT_ADMISSION_ERROR = Object.freeze({
  ORIGIN: 'placement_admission_origin_refused',
  BYTES: 'placement_admission_bytes_invalid',
  REMOVE_INTENT_UNSCOPED: 'placement_remove_intent_unscoped',
  TARGET: 'placement_admission_target_invalid',
  RESULT: 'placement_admission_result_unavailable',
});

export {PLACEMENT_ADMISSION_ERROR, PLACEMENT_ADMIT_TYPE, PLACEMENT_COMMAND_TYPES,
  PLACEMENT_RELEASE_HOLD_TYPE, PLACEMENT_RESULT_FIELD, RETAINED_PLACEMENT_ATTEMPT};
