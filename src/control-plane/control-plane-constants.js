/**
 * Control plane message types and defaults.
 */

import {
  FIELD,
  MESSAGE_TYPE,
  NODE_CAPABILITY,
  STATE,
  TABLES,
  TIME_MS,
} from '../constants/index.js';
import {CONFIG_KEY} from '../config/config-constants.js';
import {
  buildControlPlaneWorkloadProfile,
  CONTROL_PLANE_WORKLOAD_CLASS,
} from './control-plane-workload-profile.js';

const ControlPlaneMessageType = Object.freeze({
  NODE_STATE_UPDATE: MESSAGE_TYPE.NODE_STATE_UPDATE,
  REPLICA_OPERATION_DISPATCH: MESSAGE_TYPE.REPLICA_OPERATION_DISPATCH,
});

const CONTROL_PLANE_MESSAGE_REQUIRED_TABLES = Object.freeze({
  [ControlPlaneMessageType.NODE_STATE_UPDATE]: Object.freeze([
    TABLES.NODES,
  ]),
  [ControlPlaneMessageType.REPLICA_OPERATION_DISPATCH]: Object.freeze([]),
});

const ControlPlaneField = Object.freeze({
  TYPE: FIELD.TYPE,
  NODE_ID: FIELD.NODE_ID,
  NODE_ADDRESS: FIELD.NODE_ADDRESS,
  STATE: FIELD.STATE,
  CAPABILITIES: FIELD.CAPABILITIES,
  HEARTBEAT_AT: FIELD.HEARTBEAT_AT,
  READY_LEASE_EXPIRES_AT: FIELD.READY_LEASE_EXPIRES_AT,
  HEARTBEAT_ONLY: FIELD.HEARTBEAT_ONLY,
  NODE_STATE_PUBLICATION_MODE: FIELD.NODE_STATE_PUBLICATION_MODE,
  NODE_ROW: FIELD.NODE_ROW,
  OPERATION_ID: FIELD.OPERATION_ID,
  OPERATION_ROW: FIELD.OPERATION_ROW,
  PARTITION_ID: FIELD.PARTITION_ID,
  REPLICA_ID: FIELD.REPLICA_ID,
  TARGET_NODE_ID: FIELD.TARGET_NODE_ID,
  FORWARDED_BY: FIELD.FORWARDED_BY,
});

const CONTROL_PLANE_DELIVERY_PRIORITY = Object.freeze({
  BACKGROUND: 'background',
  CRITICAL: 'critical',
  READINESS: 'readiness',
});

const CONTROL_PLANE_NODE_STATE_PUBLICATION_MODE = Object.freeze({
  HEARTBEAT_STEADY: 'heartbeat_steady',
  HEARTBEAT_MAINTENANCE: 'heartbeat_maintenance',
  HEARTBEAT_RECOVERY: 'heartbeat_recovery',
  READY_TRANSITION: 'ready_transition',
  LIFECYCLE_BACKGROUND: 'lifecycle_background',
});

const CONTROL_PLANE_NODE_STATE_PUBLICATION_ALLOW_PRESSURE_DEFER =
  Object.freeze({
    HEARTBEAT_STEADY: true,
    HEARTBEAT_MAINTENANCE: true,
    HEARTBEAT_RECOVERY: false,
    READY_TRANSITION: false,
    LIFECYCLE_BACKGROUND: true,
  });

const CONTROL_PLANE_NODE_STATE_REPLAY_CONTEXT = Object.freeze({
  FRESH: 'fresh',
  DEFERRED_PENDING: 'deferred_pending',
});

function buildNodeStatePublicationProfile(
  mode,
  workloadClass,
  deliveryPriority,
  allowPressureDefer,
) {
  const workloadProfile = buildControlPlaneWorkloadProfile(workloadClass, {
    allowPressureDefer,
  });
  return Object.freeze({
    mode,
    workloadClass: workloadProfile.workloadClass,
    allowPressureDefer: workloadProfile.allowPressureDefer,
    deliveryPriority,
    workClass: workloadProfile.workClass,
  });
}

const CONTROL_PLANE_NODE_STATE_PUBLICATION_PROFILE = Object.freeze({
  [CONTROL_PLANE_NODE_STATE_PUBLICATION_MODE.HEARTBEAT_STEADY]:
    buildNodeStatePublicationProfile(
      CONTROL_PLANE_NODE_STATE_PUBLICATION_MODE.HEARTBEAT_STEADY,
      CONTROL_PLANE_WORKLOAD_CLASS.NODE_STATE_PUBLICATION_BACKGROUND,
      CONTROL_PLANE_DELIVERY_PRIORITY.BACKGROUND,
      CONTROL_PLANE_NODE_STATE_PUBLICATION_ALLOW_PRESSURE_DEFER
        .HEARTBEAT_STEADY,
    ),
  [CONTROL_PLANE_NODE_STATE_PUBLICATION_MODE.HEARTBEAT_MAINTENANCE]:
    buildNodeStatePublicationProfile(
      CONTROL_PLANE_NODE_STATE_PUBLICATION_MODE.HEARTBEAT_MAINTENANCE,
      CONTROL_PLANE_WORKLOAD_CLASS.NODE_STATE_PUBLICATION_BACKGROUND,
      CONTROL_PLANE_DELIVERY_PRIORITY.BACKGROUND,
      CONTROL_PLANE_NODE_STATE_PUBLICATION_ALLOW_PRESSURE_DEFER
        .HEARTBEAT_MAINTENANCE,
    ),
  [CONTROL_PLANE_NODE_STATE_PUBLICATION_MODE.HEARTBEAT_RECOVERY]:
    buildNodeStatePublicationProfile(
      CONTROL_PLANE_NODE_STATE_PUBLICATION_MODE.HEARTBEAT_RECOVERY,
      CONTROL_PLANE_WORKLOAD_CLASS.NODE_STATE_PUBLICATION_CRITICAL,
      CONTROL_PLANE_DELIVERY_PRIORITY.CRITICAL,
      CONTROL_PLANE_NODE_STATE_PUBLICATION_ALLOW_PRESSURE_DEFER
        .HEARTBEAT_RECOVERY,
    ),
  [CONTROL_PLANE_NODE_STATE_PUBLICATION_MODE.READY_TRANSITION]:
    buildNodeStatePublicationProfile(
      CONTROL_PLANE_NODE_STATE_PUBLICATION_MODE.READY_TRANSITION,
      CONTROL_PLANE_WORKLOAD_CLASS.NODE_STATE_PUBLICATION_CRITICAL,
      CONTROL_PLANE_DELIVERY_PRIORITY.CRITICAL,
      CONTROL_PLANE_NODE_STATE_PUBLICATION_ALLOW_PRESSURE_DEFER
        .READY_TRANSITION,
    ),
  [CONTROL_PLANE_NODE_STATE_PUBLICATION_MODE.LIFECYCLE_BACKGROUND]:
    buildNodeStatePublicationProfile(
      CONTROL_PLANE_NODE_STATE_PUBLICATION_MODE.LIFECYCLE_BACKGROUND,
      CONTROL_PLANE_WORKLOAD_CLASS.NODE_STATE_PUBLICATION_BACKGROUND,
      CONTROL_PLANE_DELIVERY_PRIORITY.BACKGROUND,
      CONTROL_PLANE_NODE_STATE_PUBLICATION_ALLOW_PRESSURE_DEFER
        .LIFECYCLE_BACKGROUND,
    ),
});

const DEFAULT_READY_LEASE_MS = TIME_MS.CONTROL_PLANE_READY_LEASE;
const DEFAULT_HEARTBEAT_INTERVAL_MS = TIME_MS.CONTROL_PLANE_HEARTBEAT_INTERVAL;
const DEFAULT_LEASE_SWEEP_INTERVAL_MS = TIME_MS.CONTROL_PLANE_LEASE_SWEEP_INTERVAL;
const DEFAULT_NODE_CAPABILITIES = Object.freeze([
  NODE_CAPABILITY.PARTITION_REPLICA,
  NODE_CAPABILITY.MESSAGE_GROUP_REPLICA,
]);

const CONTROL_PLANE_SUBSYSTEM = 'control-plane';

const CONTROL_PLANE_CONFIG_KEY = Object.freeze({
  READY_LEASE_MS: CONFIG_KEY.CONTROL_PLANE_READY_LEASE_MS,
  HEARTBEAT_INTERVAL_MS: CONFIG_KEY.CONTROL_PLANE_HEARTBEAT_INTERVAL_MS,
  LEASE_SWEEP_INTERVAL_MS: CONFIG_KEY.CONTROL_PLANE_LEASE_SWEEP_INTERVAL_MS,
});

const CONTROL_PLANE_EVENT = Object.freeze({
  MESSAGE_RECEIVED: 'messageReceived',
  CDC_APPLIED: 'cdcApplied',
});

const CONTROL_PLANE_LOG_MSG = Object.freeze({
  INITIALIZED: 'Control plane service initialized',
  MESSAGE_HANDLING_FAILED: 'Control plane message handling failed',
  CDC_HANDLING_FAILED: 'Control plane CDC handling failed',
  ATTACHED_MESSAGE_GROUP: 'Attached control plane to message group service',
  LEASE_SWEEP_FAILED: 'Lease sweep failed',
  LOCAL_HEARTBEAT_FAILED: 'Control plane local heartbeat failed',
  LOCAL_HEARTBEAT_CONSECUTIVE_FAILURES: 'Control plane heartbeat failing repeatedly',
  LOCAL_HEARTBEAT_RECOVERED: 'Control plane heartbeat recovered after failures',
  SHUTDOWN: 'Control plane service shutdown',
  IGNORE_UNKNOWN_NODE_STATE: 'Ignoring unknown node state update',
});

// Number of consecutive heartbeat failures before logging at warn level
const HEARTBEAT_FAILURE_WARN_THRESHOLD = 3;

const CONTROL_PLANE_ERROR_MSG = Object.freeze({
  MISSING_NODE_ID: 'ControlPlaneService requires nodeId',
  MISSING_NODE_ADDRESS: 'ControlPlaneService requires nodeAddress',
  MISSING_ROUTER: 'ControlPlaneService requires messageRouter',
  MISSING_CACHE: 'ControlPlaneService requires systemTableCache',
  MISSING_CDC: 'ControlPlaneService requires cdcIntegrationService',
  MISSING_COORDINATOR: 'ControlPlaneService requires rebalanceCoordinator',
  MISSING_MESSAGE_GROUP_SERVICE: 'MessageGroupService is required',
});

const CONTROL_PLANE_ALLOWED_STATES = Object.freeze([
  STATE.CONNECTED,
  STATE.READY,
  STATE.DISCONNECTED,
]);

function getControlPlaneMessageRequiredTables(messageType) {
  const requiredTables =
    CONTROL_PLANE_MESSAGE_REQUIRED_TABLES[messageType];
  return Array.isArray(requiredTables) ? [...requiredTables] : [];
}

function normalizeControlPlaneNodeStatePublicationMode(mode) {
  if (mode === CONTROL_PLANE_NODE_STATE_PUBLICATION_MODE.HEARTBEAT_STEADY) {
    return CONTROL_PLANE_NODE_STATE_PUBLICATION_MODE.HEARTBEAT_STEADY;
  }
  if (mode ===
      CONTROL_PLANE_NODE_STATE_PUBLICATION_MODE.HEARTBEAT_MAINTENANCE) {
    return CONTROL_PLANE_NODE_STATE_PUBLICATION_MODE.HEARTBEAT_MAINTENANCE;
  }
  if (mode === CONTROL_PLANE_NODE_STATE_PUBLICATION_MODE.HEARTBEAT_RECOVERY) {
    return CONTROL_PLANE_NODE_STATE_PUBLICATION_MODE.HEARTBEAT_RECOVERY;
  }
  if (mode === CONTROL_PLANE_NODE_STATE_PUBLICATION_MODE.READY_TRANSITION) {
    return CONTROL_PLANE_NODE_STATE_PUBLICATION_MODE.READY_TRANSITION;
  }
  if (mode === CONTROL_PLANE_NODE_STATE_PUBLICATION_MODE.LIFECYCLE_BACKGROUND) {
    return CONTROL_PLANE_NODE_STATE_PUBLICATION_MODE.LIFECYCLE_BACKGROUND;
  }
  return null;
}

function resolveControlPlaneNodeStatePublicationMode(options = {}) {
  const normalizedMode = normalizeControlPlaneNodeStatePublicationMode(
    options?.publicationMode,
  );
  if (normalizedMode) {
    return normalizedMode;
  }
  if (options?.heartbeatOnly === true) {
    return CONTROL_PLANE_NODE_STATE_PUBLICATION_MODE.HEARTBEAT_STEADY;
  }
  if (options?.state === STATE.READY) {
    return CONTROL_PLANE_NODE_STATE_PUBLICATION_MODE.READY_TRANSITION;
  }
  return CONTROL_PLANE_NODE_STATE_PUBLICATION_MODE.LIFECYCLE_BACKGROUND;
}

function resolveReplayControlPlaneNodeStatePublicationMode(options = {}) {
  const publicationMode = resolveControlPlaneNodeStatePublicationMode(options);
  const replayContext =
    options?.replayContext ===
      CONTROL_PLANE_NODE_STATE_REPLAY_CONTEXT.DEFERRED_PENDING ?
      CONTROL_PLANE_NODE_STATE_REPLAY_CONTEXT.DEFERRED_PENDING :
      CONTROL_PLANE_NODE_STATE_REPLAY_CONTEXT.FRESH;
  if (replayContext ===
      CONTROL_PLANE_NODE_STATE_REPLAY_CONTEXT.DEFERRED_PENDING &&
      options?.heartbeatOnly === true &&
      publicationMode ===
        CONTROL_PLANE_NODE_STATE_PUBLICATION_MODE.HEARTBEAT_RECOVERY) {
    return CONTROL_PLANE_NODE_STATE_PUBLICATION_MODE.HEARTBEAT_MAINTENANCE;
  }
  return publicationMode;
}

function getControlPlaneNodeStatePublicationProfile(options = {}) {
  const mode = resolveControlPlaneNodeStatePublicationMode(options);
  return CONTROL_PLANE_NODE_STATE_PUBLICATION_PROFILE[mode];
}

function isHeartbeatEscalatedControlPlaneNodeStatePublicationMode(mode) {
  return mode === CONTROL_PLANE_NODE_STATE_PUBLICATION_MODE.HEARTBEAT_RECOVERY ||
    mode === CONTROL_PLANE_NODE_STATE_PUBLICATION_MODE.HEARTBEAT_MAINTENANCE;
}

export {
  ControlPlaneMessageType,
  CONTROL_PLANE_MESSAGE_REQUIRED_TABLES,
  ControlPlaneField,
  CONTROL_PLANE_DELIVERY_PRIORITY,
  CONTROL_PLANE_NODE_STATE_PUBLICATION_MODE,
  CONTROL_PLANE_NODE_STATE_REPLAY_CONTEXT,
  DEFAULT_READY_LEASE_MS,
  DEFAULT_HEARTBEAT_INTERVAL_MS,
  DEFAULT_LEASE_SWEEP_INTERVAL_MS,
  DEFAULT_NODE_CAPABILITIES,
  CONTROL_PLANE_SUBSYSTEM,
  CONTROL_PLANE_CONFIG_KEY,
  CONTROL_PLANE_EVENT,
  CONTROL_PLANE_LOG_MSG,
  CONTROL_PLANE_ERROR_MSG,
  CONTROL_PLANE_ALLOWED_STATES,
  HEARTBEAT_FAILURE_WARN_THRESHOLD,
  getControlPlaneMessageRequiredTables,
  getControlPlaneNodeStatePublicationProfile,
  isHeartbeatEscalatedControlPlaneNodeStatePublicationMode,
  resolveReplayControlPlaneNodeStatePublicationMode,
  normalizeControlPlaneNodeStatePublicationMode,
  resolveControlPlaneNodeStatePublicationMode,
};
