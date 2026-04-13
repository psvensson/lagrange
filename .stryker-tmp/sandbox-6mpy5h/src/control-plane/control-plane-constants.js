/**
 * Control plane message types and defaults.
 */
// @ts-nocheck
function stryNS_9fa48() {
  var g = typeof globalThis === 'object' && globalThis && globalThis.Math === Math && globalThis || new Function("return this")();
  var ns = g.__stryker__ || (g.__stryker__ = {});
  if (ns.activeMutant === undefined && g.process && g.process.env && g.process.env.__STRYKER_ACTIVE_MUTANT__) {
    ns.activeMutant = g.process.env.__STRYKER_ACTIVE_MUTANT__;
  }
  function retrieveNS() {
    return ns;
  }
  stryNS_9fa48 = retrieveNS;
  return retrieveNS();
}
stryNS_9fa48();
function stryCov_9fa48() {
  var ns = stryNS_9fa48();
  var cov = ns.mutantCoverage || (ns.mutantCoverage = {
    static: {},
    perTest: {}
  });
  function cover() {
    var c = cov.static;
    if (ns.currentTestId) {
      c = cov.perTest[ns.currentTestId] = cov.perTest[ns.currentTestId] || {};
    }
    var a = arguments;
    for (var i = 0; i < a.length; i++) {
      c[a[i]] = (c[a[i]] || 0) + 1;
    }
  }
  stryCov_9fa48 = cover;
  cover.apply(null, arguments);
}
function stryMutAct_9fa48(id) {
  var ns = stryNS_9fa48();
  function isActive(id) {
    if (ns.activeMutant === id) {
      if (ns.hitCount !== void 0 && ++ns.hitCount > ns.hitLimit) {
        throw new Error('Stryker: Hit count limit reached (' + ns.hitCount + ')');
      }
      return true;
    }
    return false;
  }
  stryMutAct_9fa48 = isActive;
  return isActive(id);
}
import { FIELD, MESSAGE_TYPE, NODE_CAPABILITY, STATE, TABLES, TIME_MS } from '../constants/index.js';
import { CONFIG_KEY } from '../config/config-constants.js';
const ControlPlaneMessageType = Object.freeze(stryMutAct_9fa48("57350") ? {} : (stryCov_9fa48("57350"), {
  NODE_STATE_UPDATE: MESSAGE_TYPE.NODE_STATE_UPDATE,
  REPLICA_OPERATION_DISPATCH: MESSAGE_TYPE.REPLICA_OPERATION_DISPATCH
}));
const CONTROL_PLANE_MESSAGE_REQUIRED_TABLES = Object.freeze(stryMutAct_9fa48("57351") ? {} : (stryCov_9fa48("57351"), {
  [ControlPlaneMessageType.NODE_STATE_UPDATE]: Object.freeze(stryMutAct_9fa48("57352") ? [] : (stryCov_9fa48("57352"), [TABLES.NODES])),
  [ControlPlaneMessageType.REPLICA_OPERATION_DISPATCH]: Object.freeze(stryMutAct_9fa48("57353") ? ["Stryker was here"] : (stryCov_9fa48("57353"), []))
}));
const ControlPlaneField = Object.freeze(stryMutAct_9fa48("57354") ? {} : (stryCov_9fa48("57354"), {
  TYPE: FIELD.TYPE,
  NODE_ID: FIELD.NODE_ID,
  NODE_ADDRESS: FIELD.NODE_ADDRESS,
  STATE: FIELD.STATE,
  CAPABILITIES: FIELD.CAPABILITIES,
  HEARTBEAT_AT: FIELD.HEARTBEAT_AT,
  READY_LEASE_EXPIRES_AT: FIELD.READY_LEASE_EXPIRES_AT,
  HEARTBEAT_ONLY: FIELD.HEARTBEAT_ONLY,
  NODE_ROW: FIELD.NODE_ROW,
  OPERATION_ID: FIELD.OPERATION_ID,
  OPERATION_ROW: FIELD.OPERATION_ROW,
  PARTITION_ID: FIELD.PARTITION_ID,
  REPLICA_ID: FIELD.REPLICA_ID,
  TARGET_NODE_ID: FIELD.TARGET_NODE_ID,
  FORWARDED_BY: FIELD.FORWARDED_BY
}));
const DEFAULT_READY_LEASE_MS = TIME_MS.CONTROL_PLANE_READY_LEASE;
const DEFAULT_HEARTBEAT_INTERVAL_MS = TIME_MS.CONTROL_PLANE_HEARTBEAT_INTERVAL;
const DEFAULT_LEASE_SWEEP_INTERVAL_MS = TIME_MS.CONTROL_PLANE_LEASE_SWEEP_INTERVAL;
const DEFAULT_NODE_CAPABILITIES = Object.freeze(stryMutAct_9fa48("57355") ? [] : (stryCov_9fa48("57355"), [NODE_CAPABILITY.PARTITION_REPLICA, NODE_CAPABILITY.MESSAGE_GROUP_REPLICA]));
const CONTROL_PLANE_SUBSYSTEM = stryMutAct_9fa48("57356") ? "" : (stryCov_9fa48("57356"), 'control-plane');
const CONTROL_PLANE_CONFIG_KEY = Object.freeze(stryMutAct_9fa48("57357") ? {} : (stryCov_9fa48("57357"), {
  READY_LEASE_MS: CONFIG_KEY.CONTROL_PLANE_READY_LEASE_MS,
  HEARTBEAT_INTERVAL_MS: CONFIG_KEY.CONTROL_PLANE_HEARTBEAT_INTERVAL_MS,
  LEASE_SWEEP_INTERVAL_MS: CONFIG_KEY.CONTROL_PLANE_LEASE_SWEEP_INTERVAL_MS
}));
const CONTROL_PLANE_EVENT = Object.freeze(stryMutAct_9fa48("57358") ? {} : (stryCov_9fa48("57358"), {
  MESSAGE_RECEIVED: stryMutAct_9fa48("57359") ? "" : (stryCov_9fa48("57359"), 'messageReceived'),
  CDC_APPLIED: stryMutAct_9fa48("57360") ? "" : (stryCov_9fa48("57360"), 'cdcApplied')
}));
const CONTROL_PLANE_LOG_MSG = Object.freeze(stryMutAct_9fa48("57361") ? {} : (stryCov_9fa48("57361"), {
  INITIALIZED: stryMutAct_9fa48("57362") ? "" : (stryCov_9fa48("57362"), 'Control plane service initialized'),
  MESSAGE_HANDLING_FAILED: stryMutAct_9fa48("57363") ? "" : (stryCov_9fa48("57363"), 'Control plane message handling failed'),
  CDC_HANDLING_FAILED: stryMutAct_9fa48("57364") ? "" : (stryCov_9fa48("57364"), 'Control plane CDC handling failed'),
  ATTACHED_MESSAGE_GROUP: stryMutAct_9fa48("57365") ? "" : (stryCov_9fa48("57365"), 'Attached control plane to message group service'),
  LEASE_SWEEP_FAILED: stryMutAct_9fa48("57366") ? "" : (stryCov_9fa48("57366"), 'Lease sweep failed'),
  LOCAL_HEARTBEAT_FAILED: stryMutAct_9fa48("57367") ? "" : (stryCov_9fa48("57367"), 'Control plane local heartbeat failed'),
  LOCAL_HEARTBEAT_CONSECUTIVE_FAILURES: stryMutAct_9fa48("57368") ? "" : (stryCov_9fa48("57368"), 'Control plane heartbeat failing repeatedly'),
  LOCAL_HEARTBEAT_RECOVERED: stryMutAct_9fa48("57369") ? "" : (stryCov_9fa48("57369"), 'Control plane heartbeat recovered after failures'),
  SHUTDOWN: stryMutAct_9fa48("57370") ? "" : (stryCov_9fa48("57370"), 'Control plane service shutdown'),
  IGNORE_UNKNOWN_NODE_STATE: stryMutAct_9fa48("57371") ? "" : (stryCov_9fa48("57371"), 'Ignoring unknown node state update')
}));

// Number of consecutive heartbeat failures before logging at warn level
const HEARTBEAT_FAILURE_WARN_THRESHOLD = 3;
const CONTROL_PLANE_ERROR_MSG = Object.freeze(stryMutAct_9fa48("57372") ? {} : (stryCov_9fa48("57372"), {
  MISSING_NODE_ID: stryMutAct_9fa48("57373") ? "" : (stryCov_9fa48("57373"), 'ControlPlaneService requires nodeId'),
  MISSING_NODE_ADDRESS: stryMutAct_9fa48("57374") ? "" : (stryCov_9fa48("57374"), 'ControlPlaneService requires nodeAddress'),
  MISSING_ROUTER: stryMutAct_9fa48("57375") ? "" : (stryCov_9fa48("57375"), 'ControlPlaneService requires messageRouter'),
  MISSING_CACHE: stryMutAct_9fa48("57376") ? "" : (stryCov_9fa48("57376"), 'ControlPlaneService requires systemTableCache'),
  MISSING_CDC: stryMutAct_9fa48("57377") ? "" : (stryCov_9fa48("57377"), 'ControlPlaneService requires cdcIntegrationService'),
  MISSING_COORDINATOR: stryMutAct_9fa48("57378") ? "" : (stryCov_9fa48("57378"), 'ControlPlaneService requires rebalanceCoordinator'),
  MISSING_MESSAGE_GROUP_SERVICE: stryMutAct_9fa48("57379") ? "" : (stryCov_9fa48("57379"), 'MessageGroupService is required')
}));
const CONTROL_PLANE_ALLOWED_STATES = Object.freeze(stryMutAct_9fa48("57380") ? [] : (stryCov_9fa48("57380"), [STATE.CONNECTED, STATE.READY, STATE.DISCONNECTED]));
function getControlPlaneMessageRequiredTables(messageType) {
  if (stryMutAct_9fa48("57381")) {
    {}
  } else {
    stryCov_9fa48("57381");
    const requiredTables = CONTROL_PLANE_MESSAGE_REQUIRED_TABLES[messageType];
    return Array.isArray(requiredTables) ? stryMutAct_9fa48("57382") ? [] : (stryCov_9fa48("57382"), [...requiredTables]) : stryMutAct_9fa48("57383") ? ["Stryker was here"] : (stryCov_9fa48("57383"), []);
  }
}
export { ControlPlaneMessageType, CONTROL_PLANE_MESSAGE_REQUIRED_TABLES, ControlPlaneField, DEFAULT_READY_LEASE_MS, DEFAULT_HEARTBEAT_INTERVAL_MS, DEFAULT_LEASE_SWEEP_INTERVAL_MS, DEFAULT_NODE_CAPABILITIES, CONTROL_PLANE_SUBSYSTEM, CONTROL_PLANE_CONFIG_KEY, CONTROL_PLANE_EVENT, CONTROL_PLANE_LOG_MSG, CONTROL_PLANE_ERROR_MSG, CONTROL_PLANE_ALLOWED_STATES, HEARTBEAT_FAILURE_WARN_THRESHOLD, getControlPlaneMessageRequiredTables };