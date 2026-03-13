/**
 * Constants for HeartbeatService.
 */

import {TIME_MS} from '../constants/index.js';
import {CONFIG_KEY} from '../config/config-constants.js';

const HEARTBEAT_SUBSYSTEM = 'heartbeat-service';

const HEARTBEAT_CONFIG_KEY = Object.freeze({
  INTERVAL_MS: CONFIG_KEY.CONTROL_PLANE_HEARTBEAT_INTERVAL_MS,
  READY_LEASE_MS: CONFIG_KEY.CONTROL_PLANE_READY_LEASE_MS,
});

const HEARTBEAT_DEFAULT = Object.freeze({
  INTERVAL_MS: TIME_MS.CONTROL_PLANE_HEARTBEAT_INTERVAL,
  READY_LEASE_MS: TIME_MS.CONTROL_PLANE_READY_LEASE,
  ATTEMPT_TIMEOUT_SAFETY_MARGIN_MS: TIME_MS.SECOND,
  ENDPOINT_REFRESH_INTERVAL_MS: 300000,
  NODE_METADATA_MIN_UPDATE_INTERVAL_MS: 500,
  NODE_METADATA_MAX_STALENESS_MS: 5000,
});

const HEARTBEAT_MEMORY_TREND = Object.freeze({
  WINDOW_MS: 300000,
  MIN_SAMPLES: 5,
  SLOPE_PERCENT_PER_MIN: 0.5,
  WARNING_PERCENT: 85,
  WARNING_COOLDOWN_MS: 300000,
});

const HEARTBEAT_FAILURE_WARN_THRESHOLD = 3;

const HEARTBEAT_STATE = Object.freeze({
  CREATED: 'created',
  INITIALIZED: 'initialized',
  RUNNING: 'running',
  STOPPED: 'stopped',
});

const HEARTBEAT_LOG_MSG = Object.freeze({
  INITIALIZED: 'HeartbeatService initialized',
  STARTED: 'HeartbeatService started',
  STOPPED: 'HeartbeatService stopped',
  SHUTDOWN_STATUS_PUBLISHED: 'HeartbeatService published shutdown status',
  SHUTDOWN_STATUS_SKIPPED: 'HeartbeatService skipped shutdown status publication',
  HEARTBEAT_FAILED: 'Heartbeat failed',
  HEARTBEAT_CONSECUTIVE_FAILURES: 'Heartbeat failing repeatedly',
  HEARTBEAT_RECOVERED: 'Heartbeat recovered after failures',
  LEASE_EXPIRY_DISCONNECT_FAILED:
    'Failed to disconnect node after lease expiry',
  MEMORY_TREND_WARNING: 'Heartbeat memory trend warning',
});

const HEARTBEAT_ERROR_MSG = Object.freeze({
  MISSING_NODE_ID: 'HeartbeatService requires nodeId',
  MISSING_NODE_ADDRESS: 'HeartbeatService requires nodeAddress',
  MISSING_CDC: 'HeartbeatService requires cdcIntegrationService',
  MISSING_CACHE: 'HeartbeatService requires systemTableCache',
  NOT_INITIALIZED: 'HeartbeatService must be initialized before start',
  ALREADY_RUNNING: 'HeartbeatService is already running',
});

const HEARTBEAT_EVENT = Object.freeze({
  HEARTBEAT_SENT: 'heartbeatSent',
  HEARTBEAT_FAILED: 'heartbeatFailed',
  MEMORY_TREND_WARNING: 'heartbeatMemoryTrendWarning',
});

const HEARTBEAT_QUIET_MODE_BYPASS_REASON = Object.freeze({
  NODE_HEARTBEAT_INITIAL_WRITE: 'node_heartbeat_initial_write',
  NODE_HEARTBEAT_MAX_STALENESS: 'node_heartbeat_max_staleness',
});

export {
  HEARTBEAT_SUBSYSTEM,
  HEARTBEAT_CONFIG_KEY,
  HEARTBEAT_DEFAULT,
  HEARTBEAT_MEMORY_TREND,
  HEARTBEAT_FAILURE_WARN_THRESHOLD,
  HEARTBEAT_STATE,
  HEARTBEAT_LOG_MSG,
  HEARTBEAT_ERROR_MSG,
  HEARTBEAT_EVENT,
  HEARTBEAT_QUIET_MODE_BYPASS_REASON,
};
