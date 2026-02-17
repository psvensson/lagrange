import {NODE_STATE, NUM, STRING, TIME_MS} from '../constants/index.js';
import {CONFIG_KEY} from '../config/config-constants.js';

const NODE_LIFECYCLE_SUBSYSTEM = 'node-lifecycle-state-machine';

const NODE_LIFECYCLE_EVENT = Object.freeze({
  STATE_CHANGE: 'stateChange',
  SUB_PHASE_CHANGE: 'subPhaseChange',
});

const NODE_SERVICE_SUBSYSTEM = 'node-service';

const NODE_SERVICE_EVENT = Object.freeze({
  LIFECYCLE_STATE_CHANGE: 'lifecycleStateChange',
  CDC_NODE_STATE_CHANGE: 'cdcNodeStateChange',
  SERVICE_STARTED: 'serviceStarted',
  SERVICE_STOPPED: 'serviceStopped',
  SHUTDOWN: 'shutdown',
});

const NODE_SERVICE_LOG_MSG = Object.freeze({
  INITIALIZED: 'Node service initialized',
  LIFECYCLE_STATE_CHANGED: 'Node lifecycle state changed',
  STARTING_SERVICE: 'Starting service',
  SERVICE_STARTED: 'Service started',
  SERVICE_START_FAILED: 'Failed to start service',
  STOPPING_SERVICE: 'Stopping service',
  SERVICE_STOPPED: 'Service stopped',
  SERVICE_STOP_FAILED: 'Failed to stop service',
  SYSTEM_TABLE_CACHE_CREATED: 'System table cache created',
  SHUTTING_DOWN: 'Shutting down node service',
  SHUTDOWN_SERVICE_STOP_FAILED: 'Error stopping service during shutdown',
  SHUTDOWN_COMPLETE: 'Node service shutdown complete',
});

const NODE_LIFECYCLE_SERVICE_SUBSYSTEM = 'node-lifecycle';

const NODE_LIFECYCLE_SERVICE_EVENT = Object.freeze({
  NODE_REGISTERED: 'nodeRegistered',
  HEARTBEAT_UPDATED: 'heartbeatUpdated',
  NODE_STATUS_CHANGED: 'nodeStatusChanged',
  NODE_FAILED: 'nodeFailed',
  NODE_SUSPECTED: 'nodeSuspected',
  NODE_ACTIVE: 'nodeActive',
  NODE_REMOVED: 'nodeRemoved',
});

const NODE_LIFECYCLE_SERVICE_LOG_MSG = Object.freeze({
  INITIALIZED: 'Node lifecycle service initialized',
  REGISTERING_NODE: 'Registering node via CDC',
  REGISTER_NODE_FAILED: 'Failed to register node via CDC',
  UPDATING_HEARTBEAT: 'Updating node heartbeat via CDC',
  UPDATE_HEARTBEAT_FAILED: 'Failed to update heartbeat via CDC',
  MARKING_NODE_FAILED: 'Marking node as failed via CDC',
  MARK_NODE_FAILED_FAILED: 'Failed to mark node as failed via CDC',
  MARKING_NODE_SUSPECTED: 'Marking node as suspected via CDC',
  MARK_NODE_SUSPECTED_FAILED: 'Failed to mark node as suspected via CDC',
  MARKING_NODE_ACTIVE: 'Marking node as active via CDC',
  MARK_NODE_ACTIVE_FAILED: 'Failed to mark node as active via CDC',
  REMOVING_NODE: 'Removing node via CDC',
  REMOVE_NODE_FAILED: 'Failed to remove node via CDC',
  STARTING_HEARTBEAT: 'Starting heartbeat timer',
  HEARTBEAT_FAILED: 'Heartbeat update failed',
  STOPPED_HEARTBEAT: 'Stopped heartbeat timer',
  STARTING_FAILURE_DETECTION: 'Starting failure detection',
  FAILURE_DETECTION_ERROR: 'Failure detection error',
  STOPPED_FAILURE_DETECTION: 'Stopped failure detection',
  HEARTBEAT_TIMEOUT_FAILED: 'Node heartbeat timeout, marking as failed',
  HEARTBEAT_DELAYED_SUSPECTED: 'Node heartbeat delayed, marking as suspected',
  SERVICE_NOT_INITIALIZED: 'NodeLifecycleService not initialized',
  SHUTDOWN: 'Node lifecycle service shutdown',
});

const NODE_LIFECYCLE_SERVICE_ERROR_MSG = Object.freeze({
  MISSING_CDC: 'NodeLifecycleService requires cdcIntegrationService',
  MISSING_NODE_ID: 'NodeLifecycleService requires nodeId',
  NOT_INITIALIZED: 'NodeLifecycleService not initialized',
  INVALID_NODES_CACHE: 'NodeLifecycleService requires a valid nodes cache array',
});

const NODE_STATUS = NODE_STATE;

const NODE_SERVICE_ERROR_MSG = Object.freeze({
  NOT_INITIALIZED: 'NodeService not initialized',
  SERVICE_EXISTS: 'Service already exists',
  SERVICE_NOT_FOUND: 'Service not found',
  SERVICE_NOT_RUNNING: 'Service not running',
});

const NODE_SERVICE_DEFAULT = Object.freeze({
  HEARTBEAT_INTERVAL_MS: TIME_MS.SECOND * NUM.FIVE,
  STATS_COLLECTION_INTERVAL_MS: TIME_MS.SECOND * NUM.TEN,
  SERVICE_TYPE_CUSTOM: 'custom',
  MESSAGE_GROUP_TYPE: 'messageGroup',
  OPERATION_HANDLER: 'handleMessage',
});

const NODE_SERVICE_HEALTH_STATUS = Object.freeze({
  HEALTHY: 'healthy',
  UNHEALTHY: 'unhealthy',
});

const NODE_LIFECYCLE_LOG_MSG = Object.freeze({
  INVALID_TRANSITION_ATTEMPT: 'Invalid state transition attempted',
  STATE_TRANSITION: 'Node state transition',
});

const NODE_LIFECYCLE_ERROR_NAME = Object.freeze({
  INVALID_TRANSITION: 'InvalidTransitionError',
});

const NODE_LIFECYCLE_ERROR_MSG = Object.freeze({
  invalidTransition: (currentState, attemptedState, validTransitions) => {
    const validStr = validTransitions.length > NUM.ZERO ?
      validTransitions.join(', ') : STRING.NONE;
    return `Invalid state transition from '${currentState}' to '${attemptedState}'. ` +
      `Valid transitions from '${currentState}': ${validStr}`;
  },
});

const NODE_CONFIG_KEY = Object.freeze({
  ID: CONFIG_KEY.NODE_ID,
  REST_API_PORT: CONFIG_KEY.NODE_REST_API_PORT,
  HEARTBEAT_INTERVAL_MS: CONFIG_KEY.NODE_HEARTBEAT_INTERVAL_MS,
  HEARTBEAT_TIMEOUT_MS: CONFIG_KEY.NODE_HEARTBEAT_TIMEOUT_MS,
  STATS_COLLECTION_INTERVAL_MS: CONFIG_KEY.NODE_STATS_COLLECTION_INTERVAL_MS,
  MAX_SERVICES_PER_NODE: CONFIG_KEY.NODE_MAX_SERVICES_PER_NODE,
  FAILURE_DETECTION_INTERVAL_MS: CONFIG_KEY.NODE_FAILURE_DETECTION_INTERVAL_MS,
});

const NODE_LIFECYCLE_DEFAULT = Object.freeze({
  HEARTBEAT_INTERVAL_MS: TIME_MS.SECOND * NUM.FIVE,
  HEARTBEAT_TIMEOUT_MS: TIME_MS.SECOND * (NUM.TEN + NUM.FIVE),
  FAILURE_DETECTION_INTERVAL_MS: TIME_MS.SECOND * NUM.TEN,
});

const NODE_LIFECYCLE_REASON = Object.freeze({
  HEARTBEAT_TIMEOUT: 'heartbeat_timeout',
});

const NODE_DEFAULT = Object.freeze({
  REST_API_PORT: 8080,
});

const FAILURE_DETECTOR_SUBSYSTEM = 'failure-detector';

const FAILURE_DETECTOR_EVENT = Object.freeze({
  NODE_SUSPECTED: 'nodeSuspected',
  NODE_FAILURE: 'nodeFailure',
  NODE_RECOVERY: 'nodeRecovery',
  REPLICA_FAILED: 'replicaFailed',
});

const FAILURE_DETECTOR_REPLICA_TYPE = Object.freeze({
  PARTITION: 'partition',
  MESSAGE_GROUP: 'message_group',
});

const FAILURE_DETECTOR_LOG_MSG = Object.freeze({
  INITIALIZED: 'Failure detector initialized',
  STARTING: 'Starting failure detection',
  CHECK_ERROR: 'Error during failure detection check',
  STOPPED: 'Stopped failure detection',
  NODE_SUSPECTED: 'Node suspected of failure',
  NODE_FAILURE_DETECTED: 'Node failure detected',
  NODE_RECOVERY_DETECTED: 'Node recovery detected',
  MARKED_REPLICAS_FAILED: 'Marked replicas as failed',
  MARK_PARTITION_REPLICA_FAILED: 'Marked partition replica as failed',
  MARK_MESSAGE_GROUP_REPLICA_FAILED: 'Marked message group replica as failed',
  MARK_NODE_SUSPECTED_FAILED: 'Failed to mark node as suspected',
  MARK_NODE_FAILED_FAILED: 'Failed to mark node as failed',
  MARK_NODE_RECOVERING_FAILED: 'Failed to mark node as recovering',
  MARK_PARTITION_REPLICA_FAILED_FAILED: 'Failed to mark partition replica as failed',
  MARK_MESSAGE_GROUP_REPLICA_FAILED_FAILED: 'Failed to mark message group replica as failed',
  NODE_FLAPPING_DETECTED: 'Node flapping detected',
  RESET_ADAPTIVE_THRESHOLD: 'Reset adaptive threshold for stable node',
  SHUTDOWN: 'Failure detector shutdown',
});

const FAILURE_DETECTOR_ACTION = Object.freeze({
  ADAPTIVE_THRESHOLD_INCREASE: 'Increasing failure threshold adaptively',
});

const FAILURE_DETECTOR_ERROR_MSG = Object.freeze({
  MISSING_NODE_ID: 'FailureDetector requires nodeId',
  MISSING_SYSTEM_TABLE_CACHE: 'FailureDetector requires systemTableCache',
  MISSING_SQL_QUERY_ENGINE: 'FailureDetector requires sqlQueryEngine',
  MISSING_CDC_SERVICE: 'FailureDetector requires cdcIntegrationService',
  NOT_INITIALIZED: 'FailureDetector not initialized',
});

const FAILURE_DETECTOR_SQL = Object.freeze({
  SELECT_ALL_NODES: 'SELECT * FROM nodes',
  SELECT_SERVICES_BY_NODE_AND_TYPE:
    'SELECT * FROM services WHERE node_id = ? AND service_type = ?',
});

const FAILURE_DETECTOR_DEFAULT = Object.freeze({
  CHECK_INTERVAL_MS: TIME_MS.SECOND * NUM.FIVE,
  SUSPICION_THRESHOLD_MS: TIME_MS.SECOND * NUM.TEN,
  FAILURE_THRESHOLD_MS: TIME_MS.SECOND * (NUM.TEN + NUM.FIVE),
  FLAPPING_WINDOW_MS: TIME_MS.SECOND * (NUM.THREE * NUM.TEN),
  FLAPPING_THRESHOLD: NUM.THREE,
  ADAPTIVE_MAX_THRESHOLD_MS: TIME_MS.MINUTE,
  STABILITY_PERIOD_MS: TIME_MS.MINUTE * NUM.FIVE,
  ADAPTIVE_RESET_INTERVAL_MS: TIME_MS.MINUTE,
  ADAPTIVE_MULTIPLIER: 1.5,
});

const NODE_REINTEGRATION_SUBSYSTEM = 'node-reintegration';

const NODE_REINTEGRATION_STATUS = Object.freeze({
  PENDING: 'pending',
  IN_PROGRESS: 'in_progress',
  COMPLETED: 'completed',
  FAILED: 'failed',
});

const NODE_REINTEGRATION_EVENT = Object.freeze({
  NODE_REINTEGRATED: 'nodeReintegrated',
  TRIGGER_REBALANCING: 'triggerRebalancing',
  REINTEGRATION_FAILED: 'reintegrationFailed',
});

const NODE_REINTEGRATION_REASON = Object.freeze({
  HEALTH_CHECK_FAILED: 'health_check_failed',
  NODE_REINTEGRATION: 'node_reintegration',
});

const NODE_REINTEGRATION_LOG_MSG = Object.freeze({
  INITIALIZED: 'Node reintegration service initialized',
  STARTING_MONITORING: 'Starting node reintegration monitoring',
  CHECK_ERROR: 'Error during node reintegration check',
  STOPPED_MONITORING: 'Stopped node reintegration monitoring',
  STARTING_REINTEGRATION: 'Starting node reintegration',
  NODE_NOT_FOUND: 'Node not found during health check',
  HEALTH_CHECK_PASSED: 'Node health check passed',
  HEALTH_CHECK_FAILED: 'Node health check failed',
  COMPLETING_REINTEGRATION: 'Completing node reintegration',
  MARK_NODE_ACTIVE_FAILED: 'Failed to mark node as active',
  REINTEGRATION_COMPLETED: 'Node reintegration completed',
  REINTEGRATION_FAILED: 'Node reintegration failed',
  MARK_NODE_FAILED_FAILED: 'Failed to mark node as failed',
  REBALANCER_NOTICE: 'Rebalancer will gradually restore replicas to this node',
  SHUTDOWN: 'Node reintegration service shutdown',
});

const NODE_REINTEGRATION_ERROR_MSG = Object.freeze({
  MISSING_NODE_ID: 'NodeReintegrationService requires nodeId',
  MISSING_SYSTEM_TABLE_CACHE: 'NodeReintegrationService requires systemTableCache',
  MISSING_CDC_SERVICE: 'NodeReintegrationService requires cdcIntegrationService',
  NOT_INITIALIZED: 'NodeReintegrationService not initialized',
});

const NODE_REINTEGRATION_DEFAULT = Object.freeze({
  CHECK_INTERVAL_MS: TIME_MS.SECOND * NUM.TEN,
  IDLE_BACKOFF_MULTIPLIER: NUM.TWO,
  MAX_CHECK_INTERVAL_MS: TIME_MS.MINUTE,
  REINTEGRATION_DELAY_MS: TIME_MS.SECOND * NUM.FIVE,
  HEALTH_CHECK_COUNT: NUM.THREE,
  HEALTH_CHECK_INTERVAL_MS: TIME_MS.SECOND * NUM.TWO,
  HEALTHY_HEARTBEAT_WINDOW_MS: TIME_MS.SECOND * NUM.TEN,
  CLEANUP_DELAY_MS: TIME_MS.MINUTE,
});

const BOOTSTRAP_SUB_PHASE = Object.freeze({
  INFRASTRUCTURE: 'INFRASTRUCTURE',
  MESSAGE_GROUPS: 'MESSAGE_GROUPS',
  PARTITIONS: 'PARTITIONS',
  REGISTRATION: 'REGISTRATION',
  CACHE_HYDRATION: 'CACHE_HYDRATION',
});

const JOINING_SUB_PHASE = Object.freeze({
  CONTACTING_SEED: 'CONTACTING_SEED',
  CONNECTING_WEBSOCKET: 'CONNECTING_WEBSOCKET',
  CREATING_MESSAGE_GROUP: 'CREATING_MESSAGE_GROUP',
  JOINING_MESSAGE_GROUP: 'JOINING_MESSAGE_GROUP',
  WAITING_LEADERSHIP: 'WAITING_LEADERSHIP',
  QUERYING_STATE: 'QUERYING_STATE',
});

export {
  NODE_LIFECYCLE_SUBSYSTEM,
  NODE_LIFECYCLE_EVENT,
  NODE_LIFECYCLE_LOG_MSG,
  NODE_LIFECYCLE_ERROR_NAME,
  NODE_LIFECYCLE_ERROR_MSG,
  NODE_SERVICE_SUBSYSTEM,
  NODE_SERVICE_EVENT,
  NODE_SERVICE_LOG_MSG,
  NODE_SERVICE_ERROR_MSG,
  NODE_LIFECYCLE_SERVICE_SUBSYSTEM,
  NODE_LIFECYCLE_SERVICE_EVENT,
  NODE_LIFECYCLE_SERVICE_LOG_MSG,
  NODE_LIFECYCLE_SERVICE_ERROR_MSG,
  NODE_STATUS,
  NODE_CONFIG_KEY,
  NODE_LIFECYCLE_DEFAULT,
  NODE_LIFECYCLE_REASON,
  NODE_DEFAULT,
  NODE_SERVICE_DEFAULT,
  NODE_SERVICE_HEALTH_STATUS,
  FAILURE_DETECTOR_SUBSYSTEM,
  FAILURE_DETECTOR_EVENT,
  FAILURE_DETECTOR_REPLICA_TYPE,
  FAILURE_DETECTOR_LOG_MSG,
  FAILURE_DETECTOR_ACTION,
  FAILURE_DETECTOR_ERROR_MSG,
  FAILURE_DETECTOR_SQL,
  FAILURE_DETECTOR_DEFAULT,
  NODE_REINTEGRATION_SUBSYSTEM,
  NODE_REINTEGRATION_STATUS,
  NODE_REINTEGRATION_EVENT,
  NODE_REINTEGRATION_REASON,
  NODE_REINTEGRATION_LOG_MSG,
  NODE_REINTEGRATION_ERROR_MSG,
  NODE_REINTEGRATION_DEFAULT,
  BOOTSTRAP_SUB_PHASE,
  JOINING_SUB_PHASE,
};
