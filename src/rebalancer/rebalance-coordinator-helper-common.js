import {REBALANCE_COORDINATOR_SHARED} from './rebalance-coordinator-shared.js';

const {
  NUM,
} = REBALANCE_COORDINATOR_SHARED;

const REBALANCE_COORDINATOR_OPERATION_FIELD = Object.freeze({
  CREATED_AT: 'createdAt',
  CREATED_AT_SNAKE: 'created_at',
  ENTITY_ID: 'entityId',
  ENTITY_ID_SNAKE: 'entity_id',
  PARTITION_ID: 'partitionId',
  PARTITION_ID_SNAKE: 'partition_id',
  UPDATED_AT: 'updatedAt',
  UPDATED_AT_SNAKE: 'updated_at',
  WORKFLOW_STEP: 'workflowStep',
  WORKFLOW_STEP_SNAKE: 'workflow_step',
});

const PRIORITY_RECOVERY_ADMISSION_PLAN_FIELD = Object.freeze({
  BLOCKED_PARTITION_DETAIL_UNAVAILABLE: 'blockedPartitionDetailUnavailable',
  HAS_BLOCKED_PARTITION: 'hasBlockedPartition',
  PARTITION_ID: 'partitionId',
  RECOVERY_ACTIVE: 'recoveryActive',
});

const REBALANCE_COORDINATOR_TYPE = Object.freeze({
  FUNCTION: 'function',
  OBJECT: 'object',
});

const REBALANCE_COORDINATOR_SEGMENT_5_LITERAL = Object.freeze({
  EMPTY_STRING: '',
  PRESSURE_ACTION_UNAVAILABLE: 'pressure_action_unavailable',
});

const PRIORITY_ADD_ADMISSION_PRESSURE_STATE = Object.freeze({
  CLEAR: 'clear',
  PRIORITY_RECOVERY_ACTIVE: 'priority_recovery_active',
  PRESSURE_PAUSE: 'pressure_pause',
});

const PRIORITY_ADD_ADMISSION_PRESSURE_ACTION = Object.freeze({
  ALLOW_READ: 'allow_read',
  PAUSE_READ: 'pause_read',
});

const PRIORITY_ADD_ADMISSION_PRESSURE_STATE_TABLE = Object.freeze([
  Object.freeze({
    state: PRIORITY_ADD_ADMISSION_PRESSURE_STATE.PRIORITY_RECOVERY_ACTIVE,
    matches: (evidence) => evidence.priorityRecoveryPartitionActive === true,
  }),
  Object.freeze({
    state: PRIORITY_ADD_ADMISSION_PRESSURE_STATE.CLEAR,
    matches: (evidence) => evidence.pressureBlocked !== true,
  }),
  Object.freeze({
    state: PRIORITY_ADD_ADMISSION_PRESSURE_STATE.PRESSURE_PAUSE,
    matches: () => true,
  }),
]);

const PRIORITY_ADD_ADMISSION_PRESSURE_ACTION_BY_STATE = Object.freeze({
  [PRIORITY_ADD_ADMISSION_PRESSURE_STATE.CLEAR]:
    PRIORITY_ADD_ADMISSION_PRESSURE_ACTION.ALLOW_READ,
  [PRIORITY_ADD_ADMISSION_PRESSURE_STATE.PRIORITY_RECOVERY_ACTIVE]:
    PRIORITY_ADD_ADMISSION_PRESSURE_ACTION.ALLOW_READ,
  [PRIORITY_ADD_ADMISSION_PRESSURE_STATE.PRESSURE_PAUSE]:
    PRIORITY_ADD_ADMISSION_PRESSURE_ACTION.PAUSE_READ,
});

const PRIORITY_DEFERRED_OBSERVATION_PRESSURE_STATE = Object.freeze({
  PRIORITY_RECOVERY_ACTIVE: 'priority_recovery_active',
  EMERGENCY_VISIBILITY_RECOVERY: 'emergency_visibility_recovery',
  BLOCKED: 'blocked',
});

const PRIORITY_DEFERRED_OBSERVATION_PRESSURE_STATE_TABLE = Object.freeze([
  Object.freeze({
    state: PRIORITY_DEFERRED_OBSERVATION_PRESSURE_STATE.PRIORITY_RECOVERY_ACTIVE,
    matches: (evidence) =>
      evidence.priorityRecoveryPartitionActive === true &&
      evidence.backpressured === true,
  }),
  Object.freeze({
    state: PRIORITY_DEFERRED_OBSERVATION_PRESSURE_STATE
      .EMERGENCY_VISIBILITY_RECOVERY,
    matches: (evidence) =>
      evidence.emergencyPriorityPartition === true &&
      evidence.backpressured === true,
  }),
  Object.freeze({
    state: PRIORITY_DEFERRED_OBSERVATION_PRESSURE_STATE.BLOCKED,
    matches: () => true,
  }),
]);

const PRIORITY_DEFERRED_OBSERVATION_PRESSURE_ALLOWED_STATES = new Set([
  PRIORITY_DEFERRED_OBSERVATION_PRESSURE_STATE.PRIORITY_RECOVERY_ACTIVE,
  PRIORITY_DEFERRED_OBSERVATION_PRESSURE_STATE.EMERGENCY_VISIBILITY_RECOVERY,
]);

function resolvePriorityAddAdmissionPressureState(evidence) {
  return (
    PRIORITY_ADD_ADMISSION_PRESSURE_STATE_TABLE.find((entry) =>
      entry.matches(evidence),
    )?.state || PRIORITY_ADD_ADMISSION_PRESSURE_STATE.PRESSURE_PAUSE
  );
}

function resolvePriorityDeferredObservationPressureState(evidence) {
  return (
    PRIORITY_DEFERRED_OBSERVATION_PRESSURE_STATE_TABLE.find((entry) =>
      entry.matches(evidence),
    )?.state || PRIORITY_DEFERRED_OBSERVATION_PRESSURE_STATE.BLOCKED
  );
}

export {
  NUM,
  REBALANCE_COORDINATOR_OPERATION_FIELD,
  PRIORITY_RECOVERY_ADMISSION_PLAN_FIELD,
  REBALANCE_COORDINATOR_TYPE,
  REBALANCE_COORDINATOR_SEGMENT_5_LITERAL,
  PRIORITY_ADD_ADMISSION_PRESSURE_STATE,
  PRIORITY_ADD_ADMISSION_PRESSURE_ACTION,
  PRIORITY_ADD_ADMISSION_PRESSURE_ACTION_BY_STATE,
  PRIORITY_DEFERRED_OBSERVATION_PRESSURE_STATE,
  PRIORITY_DEFERRED_OBSERVATION_PRESSURE_ALLOWED_STATES,
  resolvePriorityAddAdmissionPressureState,
  resolvePriorityDeferredObservationPressureState,
};
