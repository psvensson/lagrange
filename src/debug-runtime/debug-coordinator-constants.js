/**
 * Constants for distributed debug endpoint coordination.
 */

const DEBUG_COORDINATOR_DEFAULT = Object.freeze({
  MIN_STAGE_ID: 0,
});

const DEBUG_COORDINATOR_EVENT = Object.freeze({
  HANDOFF: 'handoff',
});

const DEBUG_COORDINATOR_ERROR_MSG = Object.freeze({
  REQUEST_REQUIRED: 'Debug coordinator request is required',
  LINEAGE_ID_REQUIRED:
    'Debug coordinator requires non-empty lineageId',
  STAGE_ID_REQUIRED:
    'Debug coordinator requires non-negative integer stageId',
  ENDPOINT_REQUIRED:
    'Debug coordinator requires non-empty endpoint',
  LISTENER_REQUIRED:
    'Debug coordinator listener must be a function',
});

export {
  DEBUG_COORDINATOR_DEFAULT,
  DEBUG_COORDINATOR_EVENT,
  DEBUG_COORDINATOR_ERROR_MSG,
};
