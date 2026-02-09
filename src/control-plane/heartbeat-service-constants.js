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
  HEARTBEAT_FAILED: 'Heartbeat failed',
  HEARTBEAT_CONSECUTIVE_FAILURES: 'Heartbeat failing repeatedly',
  HEARTBEAT_RECOVERED: 'Heartbeat recovered after failures',
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
});

export {
  HEARTBEAT_SUBSYSTEM,
  HEARTBEAT_CONFIG_KEY,
  HEARTBEAT_DEFAULT,
  HEARTBEAT_FAILURE_WARN_THRESHOLD,
  HEARTBEAT_STATE,
  HEARTBEAT_LOG_MSG,
  HEARTBEAT_ERROR_MSG,
  HEARTBEAT_EVENT,
};
