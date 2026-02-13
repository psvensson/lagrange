/**
 * Constants for LatencyGroupManager.
 */

const LATENCY_GROUP_MANAGER_SUBSYSTEM = 'latency-group-manager';

const LATENCY_GROUP_MANAGER_STATE = Object.freeze({
  CREATED: 'created',
  INITIALIZED: 'initialized',
  RUNNING: 'running',
  STOPPED: 'stopped',
});

const LATENCY_GROUP_MANAGER_TRIGGER = Object.freeze({
  INITIAL: 'initial',
  PERIODIC: 'periodic',
  MANUAL: 'manual',
});

const LATENCY_GROUP_MANAGER_EVENT = Object.freeze({
  ASSIGNMENT_CHANGED: 'latencyAssignmentChanged',
  ASSIGNMENT_UNCHANGED: 'latencyAssignmentUnchanged',
  GROUP_CREATED: 'latencyGroupCreated',
  CYCLE_FAILED: 'latencyAssignmentCycleFailed',
});

const LATENCY_GROUP_MANAGER_REASON = Object.freeze({
  MISSING_LOCAL_NODE: 'missing_local_node',
  KEEP_CURRENT_GROUP: 'keep_current_group',
  JOIN_NEAREST_GROUP: 'join_nearest_group',
  REASSIGN_TO_BETTER_GROUP: 'reassign_to_better_group',
  CREATE_NEW_GROUP: 'create_new_group',
  CYCLE_IN_FLIGHT: 'cycle_in_flight',
});

const LATENCY_GROUP_MANAGER_LOG_MSG = Object.freeze({
  INITIALIZED: 'LatencyGroupManager initialized',
  STARTED: 'LatencyGroupManager started',
  STOPPED: 'LatencyGroupManager stopped',
  GROUP_CREATED: 'Latency group created',
  ASSIGNMENT_CHANGED: 'Latency assignment changed',
  ASSIGNMENT_UNCHANGED: 'Latency assignment unchanged',
  CYCLE_FAILED: 'Latency assignment cycle failed',
});

const LATENCY_GROUP_MANAGER_ERROR_MSG = Object.freeze({
  MISSING_NODE_ID: 'LatencyGroupManager requires nodeId',
  MISSING_CACHE: 'LatencyGroupManager requires systemTableCache',
  MISSING_CDC: 'LatencyGroupManager requires cdcIntegrationService',
  MISSING_MEASUREMENT_SERVICE:
    'LatencyGroupManager requires latencyMeasurementService',
  MISSING_SELECTION_SERVICE:
    'LatencyGroupManager requires groupSelectionService',
  NOT_INITIALIZED: 'LatencyGroupManager must be initialized first',
});

const LATENCY_GROUP_MANAGER_DEFAULT = Object.freeze({
  MIN_GROUP_THRESHOLD_MS: 1,
  MIN_RECALC_INTERVAL_MS: 1000,
  MIN_RECALC_JITTER_RATIO: 0,
  MAX_RECALC_JITTER_RATIO: 1,
  RANDOM_CENTER: 0.5,
  MIN_DELAY_MS: 1,
  GROUP_ID_PREFIX: 'lg-',
  GROUP_ID_SEPARATOR: '-',
  GROUP_ID_RETRY_MARKER: 'retry',
});

export {
  LATENCY_GROUP_MANAGER_DEFAULT,
  LATENCY_GROUP_MANAGER_ERROR_MSG,
  LATENCY_GROUP_MANAGER_EVENT,
  LATENCY_GROUP_MANAGER_LOG_MSG,
  LATENCY_GROUP_MANAGER_REASON,
  LATENCY_GROUP_MANAGER_STATE,
  LATENCY_GROUP_MANAGER_SUBSYSTEM,
  LATENCY_GROUP_MANAGER_TRIGGER,
};
