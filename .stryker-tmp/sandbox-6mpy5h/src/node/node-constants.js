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
import { NODE_STATE, NUM, STRING, TIME_MS } from '../constants/index.js';
import { CONFIG_KEY } from '../config/config-constants.js';
const NODE_LIFECYCLE_SUBSYSTEM = stryMutAct_9fa48("92517") ? "" : (stryCov_9fa48("92517"), 'node-lifecycle-state-machine');
const NODE_LIFECYCLE_EVENT = Object.freeze(stryMutAct_9fa48("92518") ? {} : (stryCov_9fa48("92518"), {
  STATE_CHANGE: stryMutAct_9fa48("92519") ? "" : (stryCov_9fa48("92519"), 'stateChange'),
  SUB_PHASE_CHANGE: stryMutAct_9fa48("92520") ? "" : (stryCov_9fa48("92520"), 'subPhaseChange'),
  TRANSITION_ERROR: stryMutAct_9fa48("92521") ? "" : (stryCov_9fa48("92521"), 'transitionError')
}));
const NODE_LIFECYCLE_DIAGNOSTIC_CODE = Object.freeze(stryMutAct_9fa48("92522") ? {} : (stryCov_9fa48("92522"), {
  INVALID_TRANSITION: stryMutAct_9fa48("92523") ? "" : (stryCov_9fa48("92523"), 'node_invalid_transition')
}));
const NODE_SERVICE_SUBSYSTEM = stryMutAct_9fa48("92524") ? "" : (stryCov_9fa48("92524"), 'node-service');
const NODE_SERVICE_EVENT = Object.freeze(stryMutAct_9fa48("92525") ? {} : (stryCov_9fa48("92525"), {
  LIFECYCLE_STATE_CHANGE: stryMutAct_9fa48("92526") ? "" : (stryCov_9fa48("92526"), 'lifecycleStateChange'),
  CDC_NODE_STATE_CHANGE: stryMutAct_9fa48("92527") ? "" : (stryCov_9fa48("92527"), 'cdcNodeStateChange'),
  SERVICE_STARTED: stryMutAct_9fa48("92528") ? "" : (stryCov_9fa48("92528"), 'serviceStarted'),
  SERVICE_STOPPED: stryMutAct_9fa48("92529") ? "" : (stryCov_9fa48("92529"), 'serviceStopped'),
  SHUTDOWN: stryMutAct_9fa48("92530") ? "" : (stryCov_9fa48("92530"), 'shutdown')
}));
const NODE_SERVICE_LOG_MSG = Object.freeze(stryMutAct_9fa48("92531") ? {} : (stryCov_9fa48("92531"), {
  INITIALIZED: stryMutAct_9fa48("92532") ? "" : (stryCov_9fa48("92532"), 'Node service initialized'),
  LIFECYCLE_STATE_CHANGED: stryMutAct_9fa48("92533") ? "" : (stryCov_9fa48("92533"), 'Node lifecycle state changed'),
  STARTING_SERVICE: stryMutAct_9fa48("92534") ? "" : (stryCov_9fa48("92534"), 'Starting service'),
  SERVICE_STARTED: stryMutAct_9fa48("92535") ? "" : (stryCov_9fa48("92535"), 'Service started'),
  SERVICE_START_FAILED: stryMutAct_9fa48("92536") ? "" : (stryCov_9fa48("92536"), 'Failed to start service'),
  STOPPING_SERVICE: stryMutAct_9fa48("92537") ? "" : (stryCov_9fa48("92537"), 'Stopping service'),
  SERVICE_STOPPED: stryMutAct_9fa48("92538") ? "" : (stryCov_9fa48("92538"), 'Service stopped'),
  SERVICE_STOP_FAILED: stryMutAct_9fa48("92539") ? "" : (stryCov_9fa48("92539"), 'Failed to stop service'),
  SYSTEM_TABLE_CACHE_CREATED: stryMutAct_9fa48("92540") ? "" : (stryCov_9fa48("92540"), 'System table cache created'),
  SHUTTING_DOWN: stryMutAct_9fa48("92541") ? "" : (stryCov_9fa48("92541"), 'Shutting down node service'),
  SHUTDOWN_SERVICE_STOP_FAILED: stryMutAct_9fa48("92542") ? "" : (stryCov_9fa48("92542"), 'Error stopping service during shutdown'),
  SHUTDOWN_COMPLETE: stryMutAct_9fa48("92543") ? "" : (stryCov_9fa48("92543"), 'Node service shutdown complete')
}));
const NODE_LIFECYCLE_SERVICE_SUBSYSTEM = stryMutAct_9fa48("92544") ? "" : (stryCov_9fa48("92544"), 'node-lifecycle');
const NODE_LIFECYCLE_SERVICE_EVENT = Object.freeze(stryMutAct_9fa48("92545") ? {} : (stryCov_9fa48("92545"), {
  NODE_REGISTERED: stryMutAct_9fa48("92546") ? "" : (stryCov_9fa48("92546"), 'nodeRegistered'),
  HEARTBEAT_UPDATED: stryMutAct_9fa48("92547") ? "" : (stryCov_9fa48("92547"), 'heartbeatUpdated'),
  HEARTBEAT_ERROR: stryMutAct_9fa48("92548") ? "" : (stryCov_9fa48("92548"), 'heartbeatError'),
  NODE_STATUS_CHANGED: stryMutAct_9fa48("92549") ? "" : (stryCov_9fa48("92549"), 'nodeStatusChanged'),
  NODE_FAILED: stryMutAct_9fa48("92550") ? "" : (stryCov_9fa48("92550"), 'nodeFailed'),
  NODE_SUSPECTED: stryMutAct_9fa48("92551") ? "" : (stryCov_9fa48("92551"), 'nodeSuspected'),
  NODE_ACTIVE: stryMutAct_9fa48("92552") ? "" : (stryCov_9fa48("92552"), 'nodeActive'),
  NODE_REMOVED: stryMutAct_9fa48("92553") ? "" : (stryCov_9fa48("92553"), 'nodeRemoved')
}));
const NODE_LIFECYCLE_SERVICE_LOG_MSG = Object.freeze(stryMutAct_9fa48("92554") ? {} : (stryCov_9fa48("92554"), {
  INITIALIZED: stryMutAct_9fa48("92555") ? "" : (stryCov_9fa48("92555"), 'Node lifecycle service initialized'),
  REGISTERING_NODE: stryMutAct_9fa48("92556") ? "" : (stryCov_9fa48("92556"), 'Registering node via CDC'),
  REGISTER_NODE_FAILED: stryMutAct_9fa48("92557") ? "" : (stryCov_9fa48("92557"), 'Failed to register node via CDC'),
  UPDATING_HEARTBEAT: stryMutAct_9fa48("92558") ? "" : (stryCov_9fa48("92558"), 'Updating node heartbeat via CDC'),
  UPDATE_HEARTBEAT_FAILED: stryMutAct_9fa48("92559") ? "" : (stryCov_9fa48("92559"), 'Failed to update heartbeat via CDC'),
  MARKING_NODE_FAILED: stryMutAct_9fa48("92560") ? "" : (stryCov_9fa48("92560"), 'Marking node as failed via CDC'),
  MARK_NODE_FAILED_FAILED: stryMutAct_9fa48("92561") ? "" : (stryCov_9fa48("92561"), 'Failed to mark node as failed via CDC'),
  MARKING_NODE_SUSPECTED: stryMutAct_9fa48("92562") ? "" : (stryCov_9fa48("92562"), 'Marking node as suspected via CDC'),
  MARK_NODE_SUSPECTED_FAILED: stryMutAct_9fa48("92563") ? "" : (stryCov_9fa48("92563"), 'Failed to mark node as suspected via CDC'),
  MARKING_NODE_ACTIVE: stryMutAct_9fa48("92564") ? "" : (stryCov_9fa48("92564"), 'Marking node as active via CDC'),
  MARK_NODE_ACTIVE_FAILED: stryMutAct_9fa48("92565") ? "" : (stryCov_9fa48("92565"), 'Failed to mark node as active via CDC'),
  REMOVING_NODE: stryMutAct_9fa48("92566") ? "" : (stryCov_9fa48("92566"), 'Removing node via CDC'),
  REMOVE_NODE_FAILED: stryMutAct_9fa48("92567") ? "" : (stryCov_9fa48("92567"), 'Failed to remove node via CDC'),
  STARTING_HEARTBEAT: stryMutAct_9fa48("92568") ? "" : (stryCov_9fa48("92568"), 'Starting heartbeat timer'),
  HEARTBEAT_FAILED: stryMutAct_9fa48("92569") ? "" : (stryCov_9fa48("92569"), 'Heartbeat update failed'),
  STOPPED_HEARTBEAT: stryMutAct_9fa48("92570") ? "" : (stryCov_9fa48("92570"), 'Stopped heartbeat timer'),
  STARTING_FAILURE_DETECTION: stryMutAct_9fa48("92571") ? "" : (stryCov_9fa48("92571"), 'Starting failure detection'),
  FAILURE_DETECTION_ERROR: stryMutAct_9fa48("92572") ? "" : (stryCov_9fa48("92572"), 'Failure detection error'),
  STOPPED_FAILURE_DETECTION: stryMutAct_9fa48("92573") ? "" : (stryCov_9fa48("92573"), 'Stopped failure detection'),
  HEARTBEAT_TIMEOUT_FAILED: stryMutAct_9fa48("92574") ? "" : (stryCov_9fa48("92574"), 'Node heartbeat timeout, marking as failed'),
  HEARTBEAT_DELAYED_SUSPECTED: stryMutAct_9fa48("92575") ? "" : (stryCov_9fa48("92575"), 'Node heartbeat delayed, marking as suspected'),
  SERVICE_NOT_INITIALIZED: stryMutAct_9fa48("92576") ? "" : (stryCov_9fa48("92576"), 'NodeLifecycleService not initialized'),
  SHUTDOWN: stryMutAct_9fa48("92577") ? "" : (stryCov_9fa48("92577"), 'Node lifecycle service shutdown')
}));
const NODE_LIFECYCLE_SERVICE_ERROR_MSG = Object.freeze(stryMutAct_9fa48("92578") ? {} : (stryCov_9fa48("92578"), {
  MISSING_CDC: stryMutAct_9fa48("92579") ? "" : (stryCov_9fa48("92579"), 'NodeLifecycleService requires cdcIntegrationService or controlPlaneSystemTableGateway'),
  MISSING_NODE_ID: stryMutAct_9fa48("92580") ? "" : (stryCov_9fa48("92580"), 'NodeLifecycleService requires nodeId'),
  NOT_INITIALIZED: stryMutAct_9fa48("92581") ? "" : (stryCov_9fa48("92581"), 'NodeLifecycleService not initialized'),
  INVALID_NODES_CACHE: stryMutAct_9fa48("92582") ? "" : (stryCov_9fa48("92582"), 'NodeLifecycleService requires a valid nodes cache array')
}));
const NODE_STATUS = NODE_STATE;
const NODE_SERVICE_ERROR_MSG = Object.freeze(stryMutAct_9fa48("92583") ? {} : (stryCov_9fa48("92583"), {
  NOT_INITIALIZED: stryMutAct_9fa48("92584") ? "" : (stryCov_9fa48("92584"), 'NodeService not initialized'),
  SERVICE_EXISTS: stryMutAct_9fa48("92585") ? "" : (stryCov_9fa48("92585"), 'Service already exists'),
  SERVICE_NOT_FOUND: stryMutAct_9fa48("92586") ? "" : (stryCov_9fa48("92586"), 'Service not found'),
  SERVICE_NOT_RUNNING: stryMutAct_9fa48("92587") ? "" : (stryCov_9fa48("92587"), 'Service not running')
}));
const NODE_SERVICE_DEFAULT = Object.freeze(stryMutAct_9fa48("92588") ? {} : (stryCov_9fa48("92588"), {
  HEARTBEAT_INTERVAL_MS: stryMutAct_9fa48("92589") ? TIME_MS.SECOND / NUM.FIVE : (stryCov_9fa48("92589"), TIME_MS.SECOND * NUM.FIVE),
  STATS_COLLECTION_INTERVAL_MS: stryMutAct_9fa48("92590") ? TIME_MS.SECOND / NUM.TEN : (stryCov_9fa48("92590"), TIME_MS.SECOND * NUM.TEN),
  SERVICE_TYPE_CUSTOM: stryMutAct_9fa48("92591") ? "" : (stryCov_9fa48("92591"), 'custom'),
  MESSAGE_GROUP_TYPE: stryMutAct_9fa48("92592") ? "" : (stryCov_9fa48("92592"), 'messageGroup'),
  OPERATION_HANDLER: stryMutAct_9fa48("92593") ? "" : (stryCov_9fa48("92593"), 'handleMessage')
}));
const NODE_SERVICE_HEALTH_STATUS = Object.freeze(stryMutAct_9fa48("92594") ? {} : (stryCov_9fa48("92594"), {
  HEALTHY: stryMutAct_9fa48("92595") ? "" : (stryCov_9fa48("92595"), 'healthy'),
  UNHEALTHY: stryMutAct_9fa48("92596") ? "" : (stryCov_9fa48("92596"), 'unhealthy')
}));
const NODE_LIFECYCLE_LOG_MSG = Object.freeze(stryMutAct_9fa48("92597") ? {} : (stryCov_9fa48("92597"), {
  INVALID_TRANSITION_ATTEMPT: stryMutAct_9fa48("92598") ? "" : (stryCov_9fa48("92598"), 'Invalid state transition attempted'),
  STATE_TRANSITION: stryMutAct_9fa48("92599") ? "" : (stryCov_9fa48("92599"), 'Node state transition')
}));
const NODE_LIFECYCLE_ERROR_NAME = Object.freeze(stryMutAct_9fa48("92600") ? {} : (stryCov_9fa48("92600"), {
  INVALID_TRANSITION: stryMutAct_9fa48("92601") ? "" : (stryCov_9fa48("92601"), 'InvalidTransitionError')
}));
const NODE_LIFECYCLE_ERROR_MSG = Object.freeze(stryMutAct_9fa48("92602") ? {} : (stryCov_9fa48("92602"), {
  invalidTransition: (currentState, attemptedState, validTransitions) => {
    if (stryMutAct_9fa48("92603")) {
      {}
    } else {
      stryCov_9fa48("92603");
      const validStr = (stryMutAct_9fa48("92607") ? validTransitions.length <= NUM.ZERO : stryMutAct_9fa48("92606") ? validTransitions.length >= NUM.ZERO : stryMutAct_9fa48("92605") ? false : stryMutAct_9fa48("92604") ? true : (stryCov_9fa48("92604", "92605", "92606", "92607"), validTransitions.length > NUM.ZERO)) ? validTransitions.join(stryMutAct_9fa48("92608") ? "" : (stryCov_9fa48("92608"), ', ')) : STRING.NONE;
      return (stryMutAct_9fa48("92609") ? `` : (stryCov_9fa48("92609"), `Invalid state transition from '${currentState}' to '${attemptedState}'. `)) + (stryMutAct_9fa48("92610") ? `` : (stryCov_9fa48("92610"), `Valid transitions from '${currentState}': ${validStr}`));
    }
  }
}));
const NODE_CONFIG_KEY = Object.freeze(stryMutAct_9fa48("92611") ? {} : (stryCov_9fa48("92611"), {
  ID: CONFIG_KEY.NODE_ID,
  REST_API_PORT: CONFIG_KEY.NODE_REST_API_PORT,
  HEARTBEAT_INTERVAL_MS: CONFIG_KEY.NODE_HEARTBEAT_INTERVAL_MS,
  HEARTBEAT_TIMEOUT_MS: CONFIG_KEY.NODE_HEARTBEAT_TIMEOUT_MS,
  STATS_COLLECTION_INTERVAL_MS: CONFIG_KEY.NODE_STATS_COLLECTION_INTERVAL_MS,
  MAX_SERVICES_PER_NODE: CONFIG_KEY.NODE_MAX_SERVICES_PER_NODE,
  FAILURE_DETECTION_INTERVAL_MS: CONFIG_KEY.NODE_FAILURE_DETECTION_INTERVAL_MS
}));
const NODE_LIFECYCLE_DEFAULT = Object.freeze(stryMutAct_9fa48("92612") ? {} : (stryCov_9fa48("92612"), {
  HEARTBEAT_INTERVAL_MS: stryMutAct_9fa48("92613") ? TIME_MS.SECOND / NUM.FIVE : (stryCov_9fa48("92613"), TIME_MS.SECOND * NUM.FIVE),
  HEARTBEAT_TIMEOUT_MS: stryMutAct_9fa48("92614") ? TIME_MS.SECOND / (NUM.TEN + NUM.FIVE) : (stryCov_9fa48("92614"), TIME_MS.SECOND * (stryMutAct_9fa48("92615") ? NUM.TEN - NUM.FIVE : (stryCov_9fa48("92615"), NUM.TEN + NUM.FIVE))),
  FAILURE_DETECTION_INTERVAL_MS: stryMutAct_9fa48("92616") ? TIME_MS.SECOND / NUM.TEN : (stryCov_9fa48("92616"), TIME_MS.SECOND * NUM.TEN)
}));
const NODE_LIFECYCLE_REASON = Object.freeze(stryMutAct_9fa48("92617") ? {} : (stryCov_9fa48("92617"), {
  HEARTBEAT_TIMEOUT: stryMutAct_9fa48("92618") ? "" : (stryCov_9fa48("92618"), 'heartbeat_timeout')
}));
const NODE_DEFAULT = Object.freeze(stryMutAct_9fa48("92619") ? {} : (stryCov_9fa48("92619"), {
  REST_API_PORT: 8080
}));
const FAILURE_DETECTOR_SUBSYSTEM = stryMutAct_9fa48("92620") ? "" : (stryCov_9fa48("92620"), 'failure-detector');
const FAILURE_DETECTOR_EVENT = Object.freeze(stryMutAct_9fa48("92621") ? {} : (stryCov_9fa48("92621"), {
  NODE_SUSPECTED: stryMutAct_9fa48("92622") ? "" : (stryCov_9fa48("92622"), 'nodeSuspected'),
  NODE_FAILURE: stryMutAct_9fa48("92623") ? "" : (stryCov_9fa48("92623"), 'nodeFailure'),
  NODE_RECOVERY: stryMutAct_9fa48("92624") ? "" : (stryCov_9fa48("92624"), 'nodeRecovery'),
  REPLICA_FAILED: stryMutAct_9fa48("92625") ? "" : (stryCov_9fa48("92625"), 'replicaFailed')
}));
const FAILURE_DETECTOR_REPLICA_TYPE = Object.freeze(stryMutAct_9fa48("92626") ? {} : (stryCov_9fa48("92626"), {
  PARTITION: stryMutAct_9fa48("92627") ? "" : (stryCov_9fa48("92627"), 'partition'),
  MESSAGE_GROUP: stryMutAct_9fa48("92628") ? "" : (stryCov_9fa48("92628"), 'message_group')
}));
const FAILURE_DETECTOR_LOG_MSG = Object.freeze(stryMutAct_9fa48("92629") ? {} : (stryCov_9fa48("92629"), {
  INITIALIZED: stryMutAct_9fa48("92630") ? "" : (stryCov_9fa48("92630"), 'Failure detector initialized'),
  STARTING: stryMutAct_9fa48("92631") ? "" : (stryCov_9fa48("92631"), 'Starting failure detection'),
  CHECK_ERROR: stryMutAct_9fa48("92632") ? "" : (stryCov_9fa48("92632"), 'Error during failure detection check'),
  STOPPED: stryMutAct_9fa48("92633") ? "" : (stryCov_9fa48("92633"), 'Stopped failure detection'),
  NODE_SUSPECTED: stryMutAct_9fa48("92634") ? "" : (stryCov_9fa48("92634"), 'Node suspected of failure'),
  NODE_FAILURE_DETECTED: stryMutAct_9fa48("92635") ? "" : (stryCov_9fa48("92635"), 'Node failure detected'),
  NODE_RECOVERY_DETECTED: stryMutAct_9fa48("92636") ? "" : (stryCov_9fa48("92636"), 'Node recovery detected'),
  MARKED_REPLICAS_FAILED: stryMutAct_9fa48("92637") ? "" : (stryCov_9fa48("92637"), 'Marked replicas as failed'),
  MARK_PARTITION_REPLICA_FAILED: stryMutAct_9fa48("92638") ? "" : (stryCov_9fa48("92638"), 'Marked partition replica as failed'),
  MARK_MESSAGE_GROUP_REPLICA_FAILED: stryMutAct_9fa48("92639") ? "" : (stryCov_9fa48("92639"), 'Marked message group replica as failed'),
  MARK_NODE_SUSPECTED_FAILED: stryMutAct_9fa48("92640") ? "" : (stryCov_9fa48("92640"), 'Failed to mark node as suspected'),
  MARK_NODE_FAILED_FAILED: stryMutAct_9fa48("92641") ? "" : (stryCov_9fa48("92641"), 'Failed to mark node as failed'),
  MARK_NODE_RECOVERING_FAILED: stryMutAct_9fa48("92642") ? "" : (stryCov_9fa48("92642"), 'Failed to mark node as recovering'),
  MARK_PARTITION_REPLICA_FAILED_FAILED: stryMutAct_9fa48("92643") ? "" : (stryCov_9fa48("92643"), 'Failed to mark partition replica as failed'),
  MARK_MESSAGE_GROUP_REPLICA_FAILED_FAILED: stryMutAct_9fa48("92644") ? "" : (stryCov_9fa48("92644"), 'Failed to mark message group replica as failed'),
  STALE_NODE_SUSPICION_UPDATE: stryMutAct_9fa48("92645") ? "" : (stryCov_9fa48("92645"), 'Skipped stale node suspicion update'),
  STALE_NODE_FAILURE_UPDATE: stryMutAct_9fa48("92646") ? "" : (stryCov_9fa48("92646"), 'Skipped stale node failure update'),
  STALE_NODE_RECOVERY_UPDATE: stryMutAct_9fa48("92647") ? "" : (stryCov_9fa48("92647"), 'Skipped stale node recovery update'),
  STALE_PARTITION_REPLICA_FAILURE_UPDATE: stryMutAct_9fa48("92648") ? "" : (stryCov_9fa48("92648"), 'Skipped stale partition replica failure update'),
  STALE_MESSAGE_GROUP_REPLICA_FAILURE_UPDATE: stryMutAct_9fa48("92649") ? "" : (stryCov_9fa48("92649"), 'Skipped stale message-group replica failure update'),
  NODE_FLAPPING_DETECTED: stryMutAct_9fa48("92650") ? "" : (stryCov_9fa48("92650"), 'Node flapping detected'),
  RESET_ADAPTIVE_THRESHOLD: stryMutAct_9fa48("92651") ? "" : (stryCov_9fa48("92651"), 'Reset adaptive threshold for stable node'),
  SHUTDOWN: stryMutAct_9fa48("92652") ? "" : (stryCov_9fa48("92652"), 'Failure detector shutdown')
}));
const FAILURE_DETECTOR_ACTION = Object.freeze(stryMutAct_9fa48("92653") ? {} : (stryCov_9fa48("92653"), {
  ADAPTIVE_THRESHOLD_INCREASE: stryMutAct_9fa48("92654") ? "" : (stryCov_9fa48("92654"), 'Increasing failure threshold adaptively')
}));
const FAILURE_DETECTOR_ERROR_MSG = Object.freeze(stryMutAct_9fa48("92655") ? {} : (stryCov_9fa48("92655"), {
  MISSING_NODE_ID: stryMutAct_9fa48("92656") ? "" : (stryCov_9fa48("92656"), 'FailureDetector requires nodeId'),
  MISSING_SYSTEM_TABLE_CACHE: stryMutAct_9fa48("92657") ? "" : (stryCov_9fa48("92657"), 'FailureDetector requires systemTableCache'),
  MISSING_SQL_QUERY_ENGINE: stryMutAct_9fa48("92658") ? "" : (stryCov_9fa48("92658"), 'FailureDetector requires sqlQueryEngine'),
  MISSING_CDC_SERVICE: stryMutAct_9fa48("92659") ? "" : (stryCov_9fa48("92659"), 'FailureDetector requires cdcIntegrationService or controlPlaneSystemTableGateway'),
  NOT_INITIALIZED: stryMutAct_9fa48("92660") ? "" : (stryCov_9fa48("92660"), 'FailureDetector not initialized')
}));
const FAILURE_DETECTOR_SQL = Object.freeze(stryMutAct_9fa48("92661") ? {} : (stryCov_9fa48("92661"), {
  SELECT_ALL_NODES: stryMutAct_9fa48("92662") ? "" : (stryCov_9fa48("92662"), 'SELECT * FROM nodes'),
  SELECT_SERVICES_BY_NODE_AND_TYPE: stryMutAct_9fa48("92663") ? "" : (stryCov_9fa48("92663"), 'SELECT * FROM services WHERE node_id = ? AND service_type = ?')
}));
const FAILURE_DETECTOR_DEFAULT = Object.freeze(stryMutAct_9fa48("92664") ? {} : (stryCov_9fa48("92664"), {
  CHECK_INTERVAL_MS: stryMutAct_9fa48("92665") ? TIME_MS.SECOND / NUM.FIVE : (stryCov_9fa48("92665"), TIME_MS.SECOND * NUM.FIVE),
  SUSPICION_THRESHOLD_MS: stryMutAct_9fa48("92666") ? TIME_MS.SECOND / NUM.TEN : (stryCov_9fa48("92666"), TIME_MS.SECOND * NUM.TEN),
  FAILURE_THRESHOLD_MS: stryMutAct_9fa48("92667") ? TIME_MS.SECOND / (NUM.TEN + NUM.FIVE) : (stryCov_9fa48("92667"), TIME_MS.SECOND * (stryMutAct_9fa48("92668") ? NUM.TEN - NUM.FIVE : (stryCov_9fa48("92668"), NUM.TEN + NUM.FIVE))),
  FLAPPING_WINDOW_MS: stryMutAct_9fa48("92669") ? TIME_MS.SECOND / (NUM.THREE * NUM.TEN) : (stryCov_9fa48("92669"), TIME_MS.SECOND * (stryMutAct_9fa48("92670") ? NUM.THREE / NUM.TEN : (stryCov_9fa48("92670"), NUM.THREE * NUM.TEN))),
  FLAPPING_THRESHOLD: NUM.THREE,
  ADAPTIVE_MAX_THRESHOLD_MS: TIME_MS.MINUTE,
  STABILITY_PERIOD_MS: stryMutAct_9fa48("92671") ? TIME_MS.MINUTE / NUM.FIVE : (stryCov_9fa48("92671"), TIME_MS.MINUTE * NUM.FIVE),
  ADAPTIVE_RESET_INTERVAL_MS: TIME_MS.MINUTE,
  ADAPTIVE_MULTIPLIER: 1.5
}));
const NODE_REINTEGRATION_SUBSYSTEM = stryMutAct_9fa48("92672") ? "" : (stryCov_9fa48("92672"), 'node-reintegration');
const NODE_REINTEGRATION_STATUS = Object.freeze(stryMutAct_9fa48("92673") ? {} : (stryCov_9fa48("92673"), {
  PENDING: stryMutAct_9fa48("92674") ? "" : (stryCov_9fa48("92674"), 'pending'),
  IN_PROGRESS: stryMutAct_9fa48("92675") ? "" : (stryCov_9fa48("92675"), 'in_progress'),
  COMPLETED: stryMutAct_9fa48("92676") ? "" : (stryCov_9fa48("92676"), 'completed'),
  FAILED: stryMutAct_9fa48("92677") ? "" : (stryCov_9fa48("92677"), 'failed')
}));
const NODE_REINTEGRATION_EVENT = Object.freeze(stryMutAct_9fa48("92678") ? {} : (stryCov_9fa48("92678"), {
  NODE_REINTEGRATED: stryMutAct_9fa48("92679") ? "" : (stryCov_9fa48("92679"), 'nodeReintegrated'),
  TRIGGER_REBALANCING: stryMutAct_9fa48("92680") ? "" : (stryCov_9fa48("92680"), 'triggerRebalancing'),
  REINTEGRATION_FAILED: stryMutAct_9fa48("92681") ? "" : (stryCov_9fa48("92681"), 'reintegrationFailed')
}));
const NODE_REINTEGRATION_REASON = Object.freeze(stryMutAct_9fa48("92682") ? {} : (stryCov_9fa48("92682"), {
  HEALTH_CHECK_FAILED: stryMutAct_9fa48("92683") ? "" : (stryCov_9fa48("92683"), 'health_check_failed'),
  NODE_REINTEGRATION: stryMutAct_9fa48("92684") ? "" : (stryCov_9fa48("92684"), 'node_reintegration')
}));
const NODE_REINTEGRATION_LOG_MSG = Object.freeze(stryMutAct_9fa48("92685") ? {} : (stryCov_9fa48("92685"), {
  INITIALIZED: stryMutAct_9fa48("92686") ? "" : (stryCov_9fa48("92686"), 'Node reintegration service initialized'),
  STARTING_MONITORING: stryMutAct_9fa48("92687") ? "" : (stryCov_9fa48("92687"), 'Starting node reintegration monitoring'),
  CHECK_ERROR: stryMutAct_9fa48("92688") ? "" : (stryCov_9fa48("92688"), 'Error during node reintegration check'),
  STOPPED_MONITORING: stryMutAct_9fa48("92689") ? "" : (stryCov_9fa48("92689"), 'Stopped node reintegration monitoring'),
  STARTING_REINTEGRATION: stryMutAct_9fa48("92690") ? "" : (stryCov_9fa48("92690"), 'Starting node reintegration'),
  NODE_NOT_FOUND: stryMutAct_9fa48("92691") ? "" : (stryCov_9fa48("92691"), 'Node not found during health check'),
  HEALTH_CHECK_PASSED: stryMutAct_9fa48("92692") ? "" : (stryCov_9fa48("92692"), 'Node health check passed'),
  HEALTH_CHECK_FAILED: stryMutAct_9fa48("92693") ? "" : (stryCov_9fa48("92693"), 'Node health check failed'),
  COMPLETING_REINTEGRATION: stryMutAct_9fa48("92694") ? "" : (stryCov_9fa48("92694"), 'Completing node reintegration'),
  MARK_NODE_ACTIVE_FAILED: stryMutAct_9fa48("92695") ? "" : (stryCov_9fa48("92695"), 'Failed to mark node as active'),
  REINTEGRATION_COMPLETED: stryMutAct_9fa48("92696") ? "" : (stryCov_9fa48("92696"), 'Node reintegration completed'),
  REINTEGRATION_FAILED: stryMutAct_9fa48("92697") ? "" : (stryCov_9fa48("92697"), 'Node reintegration failed'),
  MARK_NODE_FAILED_FAILED: stryMutAct_9fa48("92698") ? "" : (stryCov_9fa48("92698"), 'Failed to mark node as failed'),
  STALE_COMPLETION_UPDATE: stryMutAct_9fa48("92699") ? "" : (stryCov_9fa48("92699"), 'Skipped stale node reintegration completion update'),
  STALE_FAILURE_UPDATE: stryMutAct_9fa48("92700") ? "" : (stryCov_9fa48("92700"), 'Skipped stale node reintegration failure update'),
  REBALANCER_NOTICE: stryMutAct_9fa48("92701") ? "" : (stryCov_9fa48("92701"), 'Rebalancer will gradually restore replicas to this node'),
  SHUTDOWN: stryMutAct_9fa48("92702") ? "" : (stryCov_9fa48("92702"), 'Node reintegration service shutdown')
}));
const NODE_REINTEGRATION_ERROR_MSG = Object.freeze(stryMutAct_9fa48("92703") ? {} : (stryCov_9fa48("92703"), {
  MISSING_NODE_ID: stryMutAct_9fa48("92704") ? "" : (stryCov_9fa48("92704"), 'NodeReintegrationService requires nodeId'),
  MISSING_SYSTEM_TABLE_CACHE: stryMutAct_9fa48("92705") ? "" : (stryCov_9fa48("92705"), 'NodeReintegrationService requires systemTableCache'),
  MISSING_CDC_SERVICE: stryMutAct_9fa48("92706") ? "" : (stryCov_9fa48("92706"), 'NodeReintegrationService requires cdcIntegrationService or controlPlaneSystemTableGateway'),
  NOT_INITIALIZED: stryMutAct_9fa48("92707") ? "" : (stryCov_9fa48("92707"), 'NodeReintegrationService not initialized')
}));
const NODE_REINTEGRATION_DEFAULT = Object.freeze(stryMutAct_9fa48("92708") ? {} : (stryCov_9fa48("92708"), {
  CHECK_INTERVAL_MS: stryMutAct_9fa48("92709") ? TIME_MS.SECOND / NUM.TEN : (stryCov_9fa48("92709"), TIME_MS.SECOND * NUM.TEN),
  IDLE_BACKOFF_MULTIPLIER: NUM.TWO,
  MAX_CHECK_INTERVAL_MS: TIME_MS.MINUTE,
  REINTEGRATION_DELAY_MS: stryMutAct_9fa48("92710") ? TIME_MS.SECOND / NUM.FIVE : (stryCov_9fa48("92710"), TIME_MS.SECOND * NUM.FIVE),
  HEALTH_CHECK_COUNT: NUM.THREE,
  HEALTH_CHECK_INTERVAL_MS: stryMutAct_9fa48("92711") ? TIME_MS.SECOND / NUM.TWO : (stryCov_9fa48("92711"), TIME_MS.SECOND * NUM.TWO),
  HEALTHY_HEARTBEAT_WINDOW_MS: stryMutAct_9fa48("92712") ? TIME_MS.SECOND / NUM.TEN : (stryCov_9fa48("92712"), TIME_MS.SECOND * NUM.TEN),
  CLEANUP_DELAY_MS: TIME_MS.MINUTE
}));
const BOOTSTRAP_SUB_PHASE = Object.freeze(stryMutAct_9fa48("92713") ? {} : (stryCov_9fa48("92713"), {
  INFRASTRUCTURE: stryMutAct_9fa48("92714") ? "" : (stryCov_9fa48("92714"), 'INFRASTRUCTURE'),
  MESSAGE_GROUPS: stryMutAct_9fa48("92715") ? "" : (stryCov_9fa48("92715"), 'MESSAGE_GROUPS'),
  PARTITIONS: stryMutAct_9fa48("92716") ? "" : (stryCov_9fa48("92716"), 'PARTITIONS'),
  REGISTRATION: stryMutAct_9fa48("92717") ? "" : (stryCov_9fa48("92717"), 'REGISTRATION'),
  CACHE_HYDRATION: stryMutAct_9fa48("92718") ? "" : (stryCov_9fa48("92718"), 'CACHE_HYDRATION')
}));
const JOINING_SUB_PHASE = Object.freeze(stryMutAct_9fa48("92719") ? {} : (stryCov_9fa48("92719"), {
  CONTACTING_SEED: stryMutAct_9fa48("92720") ? "" : (stryCov_9fa48("92720"), 'CONTACTING_SEED'),
  CONNECTING_WEBSOCKET: stryMutAct_9fa48("92721") ? "" : (stryCov_9fa48("92721"), 'CONNECTING_WEBSOCKET'),
  CREATING_MESSAGE_GROUP: stryMutAct_9fa48("92722") ? "" : (stryCov_9fa48("92722"), 'CREATING_MESSAGE_GROUP'),
  JOINING_MESSAGE_GROUP: stryMutAct_9fa48("92723") ? "" : (stryCov_9fa48("92723"), 'JOINING_MESSAGE_GROUP'),
  WAITING_LEADERSHIP: stryMutAct_9fa48("92724") ? "" : (stryCov_9fa48("92724"), 'WAITING_LEADERSHIP'),
  QUERYING_STATE: stryMutAct_9fa48("92725") ? "" : (stryCov_9fa48("92725"), 'QUERYING_STATE')
}));
export { NODE_LIFECYCLE_SUBSYSTEM, NODE_LIFECYCLE_EVENT, NODE_LIFECYCLE_DIAGNOSTIC_CODE, NODE_LIFECYCLE_LOG_MSG, NODE_LIFECYCLE_ERROR_NAME, NODE_LIFECYCLE_ERROR_MSG, NODE_SERVICE_SUBSYSTEM, NODE_SERVICE_EVENT, NODE_SERVICE_LOG_MSG, NODE_SERVICE_ERROR_MSG, NODE_LIFECYCLE_SERVICE_SUBSYSTEM, NODE_LIFECYCLE_SERVICE_EVENT, NODE_LIFECYCLE_SERVICE_LOG_MSG, NODE_LIFECYCLE_SERVICE_ERROR_MSG, NODE_STATUS, NODE_CONFIG_KEY, NODE_LIFECYCLE_DEFAULT, NODE_LIFECYCLE_REASON, NODE_DEFAULT, NODE_SERVICE_DEFAULT, NODE_SERVICE_HEALTH_STATUS, FAILURE_DETECTOR_SUBSYSTEM, FAILURE_DETECTOR_EVENT, FAILURE_DETECTOR_REPLICA_TYPE, FAILURE_DETECTOR_LOG_MSG, FAILURE_DETECTOR_ACTION, FAILURE_DETECTOR_ERROR_MSG, FAILURE_DETECTOR_SQL, FAILURE_DETECTOR_DEFAULT, NODE_REINTEGRATION_SUBSYSTEM, NODE_REINTEGRATION_STATUS, NODE_REINTEGRATION_EVENT, NODE_REINTEGRATION_REASON, NODE_REINTEGRATION_LOG_MSG, NODE_REINTEGRATION_ERROR_MSG, NODE_REINTEGRATION_DEFAULT, BOOTSTRAP_SUB_PHASE, JOINING_SUB_PHASE };