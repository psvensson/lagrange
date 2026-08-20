import {NUM, TIME_MS} from '../constants/index.js';
import {
  isLoadRoutableRaftRole,
  isRepairOnlyRaftRole,
} from '../raft/replica-voter-readiness.js';


const REPLICA_STATE_MACHINE_SUBSYSTEM = 'replica-state-machine';

const REPLICA_STATE_MACHINE_STATE = Object.freeze({
  PENDING: 'pending',
  CREATING: 'creating',
  SYNCING: 'syncing',
  ACTIVE: 'active',
  REMOVING: 'removing',
  REMOVED: 'removed',
  FAILED: 'failed',
});

const REPLICA_STATE_MACHINE_VALID_TRANSITIONS = Object.freeze({
  [null]: [REPLICA_STATE_MACHINE_STATE.PENDING],
  [REPLICA_STATE_MACHINE_STATE.PENDING]: [
    REPLICA_STATE_MACHINE_STATE.CREATING,
    REPLICA_STATE_MACHINE_STATE.FAILED,
  ],
  [REPLICA_STATE_MACHINE_STATE.CREATING]: [
    REPLICA_STATE_MACHINE_STATE.REMOVING,
    REPLICA_STATE_MACHINE_STATE.SYNCING,
    REPLICA_STATE_MACHINE_STATE.FAILED,
  ],
  [REPLICA_STATE_MACHINE_STATE.SYNCING]: [
    REPLICA_STATE_MACHINE_STATE.ACTIVE,
    REPLICA_STATE_MACHINE_STATE.FAILED,
  ],
  [REPLICA_STATE_MACHINE_STATE.ACTIVE]: [
    REPLICA_STATE_MACHINE_STATE.REMOVING,
    REPLICA_STATE_MACHINE_STATE.FAILED,
  ],
  [REPLICA_STATE_MACHINE_STATE.REMOVING]: [
    REPLICA_STATE_MACHINE_STATE.REMOVED,
    REPLICA_STATE_MACHINE_STATE.FAILED,
  ],
  [REPLICA_STATE_MACHINE_STATE.FAILED]: [REPLICA_STATE_MACHINE_STATE.REMOVED],
  [REPLICA_STATE_MACHINE_STATE.REMOVED]: [],
});

const REPLICA_STATE_MACHINE_DEFAULT_TIMEOUTS = Object.freeze({
  [REPLICA_STATE_MACHINE_STATE.PENDING]: TIME_MS.SECOND * NUM.TEN * NUM.THREE,
  [REPLICA_STATE_MACHINE_STATE.CREATING]: TIME_MS.MINUTE,
  [REPLICA_STATE_MACHINE_STATE.SYNCING]: TIME_MS.MINUTE * NUM.FIVE,
  [REPLICA_STATE_MACHINE_STATE.REMOVING]: TIME_MS.MINUTE,
});

const REPLICA_STATE_MACHINE_DEFAULT = Object.freeze({
  NODE_ID: 'unknown',
  TIMEOUT_CHECK_INTERVAL_MS: TIME_MS.SECOND * NUM.FIVE,
  MAX_CONCURRENT_ADDS: NUM.FIVE,
  MAX_CONCURRENT_REMOVES: NUM.FIVE,
});

const REPLICA_STATE_MACHINE_NOW = () => Date.now();

const REPLICA_STATE_MACHINE_OPERATION = Object.freeze({
  ADD: 'add',
  REMOVE: 'remove',
});

const REPLICA_STATE_MACHINE_TRANSITION = Object.freeze({
  SEPARATOR: '->',
});

const REPLICA_STATE_MACHINE_EVENT = Object.freeze({
  TRANSITION_ERROR: 'transitionError',
  STATE_TRANSITION: 'stateTransition',
  PERSISTENCE_ERROR: 'persistenceError',
  TIMEOUT: 'timeout',
  RECOVERY_COMPLETE: 'recoveryComplete',
});

const REPLICA_STATE_MACHINE_EVENT_TYPE = Object.freeze({
  REPLICA_STATE_TRANSITION: 'replica_state_transition',
});

const REPLICA_STATE_MACHINE_DIAGNOSTIC_CODE = Object.freeze({
  INVALID_TRANSITION: 'replica_invalid_transition',
});

const REPLICA_STATE_MACHINE_REASON = Object.freeze({
  UNKNOWN: 'unknown',
  CREATE_REDRIVE: 'authoritative_create_redrive',
  RECOVERY_REGISTRATION: 'recovery_registration',
  RECOVERY_INCOMPLETE: 'Node recovery - incomplete operation',
  RECOVERY_COMPLETE_REMOVAL: 'Node recovery - completing removal',
});

const REPLICA_STATE_MACHINE_LOG_MSG = Object.freeze({
  INVALID_TRANSITION: 'Invalid state transition attempted',
  STATE_TRANSITION: 'Replica state transition',
  STATE_PERSISTED: 'State persisted to CDC',
  STATE_PERSIST_FAILED: 'Failed to persist state to CDC',
  CONCURRENT_ADD_LIMIT: 'Concurrent ADD limit reached',
  CONCURRENT_REMOVE_LIMIT: 'Concurrent REMOVE limit reached',
  UNKNOWN_OPERATION: 'Unknown operation type for canStartOperation',
  REMOVE_TRACKING_INVALID: 'Cannot remove replica from tracking - not in REMOVED state',
  REMOVE_TRACKING_SUCCESS: 'Removed replica from tracking',
  TIMEOUT_CHECKER_STARTED: 'Timeout checker started',
  TIMEOUT_CHECKER_STOPPED: 'Timeout checker stopped',
  LOCAL_ONLY_ROW_CONVERGED:
    'Deferred durable services row converged after control-plane recovery',
  OPERATION_TIMEOUT: 'Replica operation timed out',
  RECOVERY_START: 'Handling node recovery in state machine',
  RECOVERY_NO_CACHE: 'No system table cache provided for recovery',
  RECOVERY_QUERY_FAILED: 'Failed to query services table for recovery',
  RECOVERY_FOUND: 'Found replicas in transitional states for recovery',
  RECOVERY_PROCESSING: 'Processing replica for recovery',
  RECOVERY_FAILED: 'Failed to process replica during recovery',
  RECOVERY_TO_FAILED: 'Transitioned replica to failed during recovery',
  RECOVERY_REMOVED: 'Completed replica removal during recovery',
  RECOVERY_COMPLETE: 'Node recovery complete in state machine',
  RECOVERY_REGISTERED: 'Registered replica for recovery',
});

const REPLICA_STATE_MACHINE_ERROR_MSG = Object.freeze({
  MISSING_NODE_ID: 'ReplicaStateMachine requires nodeId',
  MISSING_CDC_SERVICE: 'ReplicaStateMachine requires cdcIntegrationService',
  MISSING_SYSTEM_TABLE_CACHE: 'ReplicaStateMachine requires systemTableCache',
  MISSING_UPSERT_SYSTEM_TABLE_ROW:
    'ReplicaStateMachine requires cdcIntegrationService.upsertSystemTableRow',
  MISSING_UPDATE_SYSTEM_TABLE_ROW:
    'ReplicaStateMachine requires cdcIntegrationService.updateSystemTableRow',
  timeoutReason: (state, elapsedMs) =>
    `Timeout in ${state} state after ${elapsedMs}ms`,
  timeoutMessage: (timeoutMs) =>
    `Operation timed out after ${timeoutMs}ms`,
  recoveryIncompleteOperation: (status) =>
    `Replica was in ${status} state during node failure`,
});

const REPLICA_STATE_MACHINE_NUM = Object.freeze({
  ZERO: 0,
  ONE: 1,
  TWO: 2,
});

// CL-021: backoff ceiling for re-attempting deferred durable services-row
// writes (local-only rows) on the timeout-checker tick.
const REPLICA_STATE_MACHINE_LOCAL_ONLY_ROW_RETRY_MAX_DELAY_MS =
  TIME_MS.MINUTE;

const REPLICA_STATE_MACHINE_LOAD_READY_STATES = Object.freeze([
  REPLICA_STATE_MACHINE_STATE.ACTIVE,
]);

const REPLICA_STATE_MACHINE_REPAIR_ONLY_STATES = Object.freeze([
  REPLICA_STATE_MACHINE_STATE.PENDING,
  REPLICA_STATE_MACHINE_STATE.CREATING,
  REPLICA_STATE_MACHINE_STATE.SYNCING,
  REPLICA_STATE_MACHINE_STATE.REMOVING,
  REPLICA_STATE_MACHINE_STATE.FAILED,
]);

function isLoadReadyReplicaRaftRole(role) {
  return isLoadRoutableRaftRole(role);
}

function isRepairOnlyReplicaRaftRole(role) {
  return isRepairOnlyRaftRole(role);
}

export {
  REPLICA_STATE_MACHINE_DEFAULT,
  REPLICA_STATE_MACHINE_DEFAULT_TIMEOUTS,
  REPLICA_STATE_MACHINE_NOW,
  REPLICA_STATE_MACHINE_ERROR_MSG,
  REPLICA_STATE_MACHINE_EVENT,
  REPLICA_STATE_MACHINE_EVENT_TYPE,
  REPLICA_STATE_MACHINE_DIAGNOSTIC_CODE,
  REPLICA_STATE_MACHINE_LOCAL_ONLY_ROW_RETRY_MAX_DELAY_MS,
  REPLICA_STATE_MACHINE_LOG_MSG,
  REPLICA_STATE_MACHINE_NUM,
  REPLICA_STATE_MACHINE_OPERATION,
  REPLICA_STATE_MACHINE_REASON,
  REPLICA_STATE_MACHINE_STATE,
  REPLICA_STATE_MACHINE_LOAD_READY_STATES,
  REPLICA_STATE_MACHINE_REPAIR_ONLY_STATES,
  REPLICA_STATE_MACHINE_SUBSYSTEM,
  REPLICA_STATE_MACHINE_TRANSITION,
  REPLICA_STATE_MACHINE_VALID_TRANSITIONS,
  isLoadReadyReplicaRaftRole,
  isRepairOnlyReplicaRaftRole,
};
