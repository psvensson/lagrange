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
import { NUM, TIME_MS } from '../constants/index.js';
import { RAFT_ROLE } from '../raft/constants.js';
const REPLICA_STATE_MACHINE_SUBSYSTEM = stryMutAct_9fa48("96292") ? "" : (stryCov_9fa48("96292"), 'replica-state-machine');
const REPLICA_STATE_MACHINE_STATE = Object.freeze(stryMutAct_9fa48("96293") ? {} : (stryCov_9fa48("96293"), {
  PENDING: stryMutAct_9fa48("96294") ? "" : (stryCov_9fa48("96294"), 'pending'),
  CREATING: stryMutAct_9fa48("96295") ? "" : (stryCov_9fa48("96295"), 'creating'),
  SYNCING: stryMutAct_9fa48("96296") ? "" : (stryCov_9fa48("96296"), 'syncing'),
  ACTIVE: stryMutAct_9fa48("96297") ? "" : (stryCov_9fa48("96297"), 'active'),
  REMOVING: stryMutAct_9fa48("96298") ? "" : (stryCov_9fa48("96298"), 'removing'),
  REMOVED: stryMutAct_9fa48("96299") ? "" : (stryCov_9fa48("96299"), 'removed'),
  FAILED: stryMutAct_9fa48("96300") ? "" : (stryCov_9fa48("96300"), 'failed')
}));
const REPLICA_STATE_MACHINE_VALID_TRANSITIONS = Object.freeze(stryMutAct_9fa48("96301") ? {} : (stryCov_9fa48("96301"), {
  [null]: stryMutAct_9fa48("96302") ? [] : (stryCov_9fa48("96302"), [REPLICA_STATE_MACHINE_STATE.PENDING]),
  [REPLICA_STATE_MACHINE_STATE.PENDING]: stryMutAct_9fa48("96303") ? [] : (stryCov_9fa48("96303"), [REPLICA_STATE_MACHINE_STATE.CREATING, REPLICA_STATE_MACHINE_STATE.FAILED]),
  [REPLICA_STATE_MACHINE_STATE.CREATING]: stryMutAct_9fa48("96304") ? [] : (stryCov_9fa48("96304"), [REPLICA_STATE_MACHINE_STATE.SYNCING, REPLICA_STATE_MACHINE_STATE.FAILED]),
  [REPLICA_STATE_MACHINE_STATE.SYNCING]: stryMutAct_9fa48("96305") ? [] : (stryCov_9fa48("96305"), [REPLICA_STATE_MACHINE_STATE.ACTIVE, REPLICA_STATE_MACHINE_STATE.FAILED]),
  [REPLICA_STATE_MACHINE_STATE.ACTIVE]: stryMutAct_9fa48("96306") ? [] : (stryCov_9fa48("96306"), [REPLICA_STATE_MACHINE_STATE.REMOVING, REPLICA_STATE_MACHINE_STATE.FAILED]),
  [REPLICA_STATE_MACHINE_STATE.REMOVING]: stryMutAct_9fa48("96307") ? [] : (stryCov_9fa48("96307"), [REPLICA_STATE_MACHINE_STATE.REMOVED, REPLICA_STATE_MACHINE_STATE.FAILED]),
  [REPLICA_STATE_MACHINE_STATE.FAILED]: stryMutAct_9fa48("96308") ? [] : (stryCov_9fa48("96308"), [REPLICA_STATE_MACHINE_STATE.REMOVED]),
  [REPLICA_STATE_MACHINE_STATE.REMOVED]: stryMutAct_9fa48("96309") ? ["Stryker was here"] : (stryCov_9fa48("96309"), [])
}));
const REPLICA_STATE_MACHINE_DEFAULT_TIMEOUTS = Object.freeze(stryMutAct_9fa48("96310") ? {} : (stryCov_9fa48("96310"), {
  [REPLICA_STATE_MACHINE_STATE.PENDING]: stryMutAct_9fa48("96311") ? TIME_MS.SECOND * NUM.TEN / NUM.THREE : (stryCov_9fa48("96311"), (stryMutAct_9fa48("96312") ? TIME_MS.SECOND / NUM.TEN : (stryCov_9fa48("96312"), TIME_MS.SECOND * NUM.TEN)) * NUM.THREE),
  [REPLICA_STATE_MACHINE_STATE.CREATING]: TIME_MS.MINUTE,
  [REPLICA_STATE_MACHINE_STATE.SYNCING]: stryMutAct_9fa48("96313") ? TIME_MS.MINUTE / NUM.FIVE : (stryCov_9fa48("96313"), TIME_MS.MINUTE * NUM.FIVE),
  [REPLICA_STATE_MACHINE_STATE.REMOVING]: TIME_MS.MINUTE
}));
const REPLICA_STATE_MACHINE_DEFAULT = Object.freeze(stryMutAct_9fa48("96314") ? {} : (stryCov_9fa48("96314"), {
  NODE_ID: stryMutAct_9fa48("96315") ? "" : (stryCov_9fa48("96315"), 'unknown'),
  TIMEOUT_CHECK_INTERVAL_MS: stryMutAct_9fa48("96316") ? TIME_MS.SECOND / NUM.FIVE : (stryCov_9fa48("96316"), TIME_MS.SECOND * NUM.FIVE),
  MAX_CONCURRENT_ADDS: NUM.FIVE,
  MAX_CONCURRENT_REMOVES: NUM.FIVE
}));
const REPLICA_STATE_MACHINE_NOW = stryMutAct_9fa48("96317") ? () => undefined : (stryCov_9fa48("96317"), (() => {
  const REPLICA_STATE_MACHINE_NOW = () => Date.now();
  return REPLICA_STATE_MACHINE_NOW;
})());
const REPLICA_STATE_MACHINE_OPERATION = Object.freeze(stryMutAct_9fa48("96318") ? {} : (stryCov_9fa48("96318"), {
  ADD: stryMutAct_9fa48("96319") ? "" : (stryCov_9fa48("96319"), 'add'),
  REMOVE: stryMutAct_9fa48("96320") ? "" : (stryCov_9fa48("96320"), 'remove')
}));
const REPLICA_STATE_MACHINE_TRANSITION = Object.freeze(stryMutAct_9fa48("96321") ? {} : (stryCov_9fa48("96321"), {
  SEPARATOR: stryMutAct_9fa48("96322") ? "" : (stryCov_9fa48("96322"), '->')
}));
const REPLICA_STATE_MACHINE_EVENT = Object.freeze(stryMutAct_9fa48("96323") ? {} : (stryCov_9fa48("96323"), {
  TRANSITION_ERROR: stryMutAct_9fa48("96324") ? "" : (stryCov_9fa48("96324"), 'transitionError'),
  STATE_TRANSITION: stryMutAct_9fa48("96325") ? "" : (stryCov_9fa48("96325"), 'stateTransition'),
  PERSISTENCE_ERROR: stryMutAct_9fa48("96326") ? "" : (stryCov_9fa48("96326"), 'persistenceError'),
  TIMEOUT: stryMutAct_9fa48("96327") ? "" : (stryCov_9fa48("96327"), 'timeout'),
  RECOVERY_COMPLETE: stryMutAct_9fa48("96328") ? "" : (stryCov_9fa48("96328"), 'recoveryComplete')
}));
const REPLICA_STATE_MACHINE_EVENT_TYPE = Object.freeze(stryMutAct_9fa48("96329") ? {} : (stryCov_9fa48("96329"), {
  REPLICA_STATE_TRANSITION: stryMutAct_9fa48("96330") ? "" : (stryCov_9fa48("96330"), 'replica_state_transition')
}));
const REPLICA_STATE_MACHINE_DIAGNOSTIC_CODE = Object.freeze(stryMutAct_9fa48("96331") ? {} : (stryCov_9fa48("96331"), {
  INVALID_TRANSITION: stryMutAct_9fa48("96332") ? "" : (stryCov_9fa48("96332"), 'replica_invalid_transition')
}));
const REPLICA_STATE_MACHINE_REASON = Object.freeze(stryMutAct_9fa48("96333") ? {} : (stryCov_9fa48("96333"), {
  UNKNOWN: stryMutAct_9fa48("96334") ? "" : (stryCov_9fa48("96334"), 'unknown'),
  RECOVERY_REGISTRATION: stryMutAct_9fa48("96335") ? "" : (stryCov_9fa48("96335"), 'recovery_registration'),
  RECOVERY_INCOMPLETE: stryMutAct_9fa48("96336") ? "" : (stryCov_9fa48("96336"), 'Node recovery - incomplete operation'),
  RECOVERY_COMPLETE_REMOVAL: stryMutAct_9fa48("96337") ? "" : (stryCov_9fa48("96337"), 'Node recovery - completing removal')
}));
const REPLICA_STATE_MACHINE_LOG_MSG = Object.freeze(stryMutAct_9fa48("96338") ? {} : (stryCov_9fa48("96338"), {
  INVALID_TRANSITION: stryMutAct_9fa48("96339") ? "" : (stryCov_9fa48("96339"), 'Invalid state transition attempted'),
  STATE_TRANSITION: stryMutAct_9fa48("96340") ? "" : (stryCov_9fa48("96340"), 'Replica state transition'),
  STATE_PERSISTED: stryMutAct_9fa48("96341") ? "" : (stryCov_9fa48("96341"), 'State persisted to CDC'),
  STATE_PERSIST_FAILED: stryMutAct_9fa48("96342") ? "" : (stryCov_9fa48("96342"), 'Failed to persist state to CDC'),
  CONCURRENT_ADD_LIMIT: stryMutAct_9fa48("96343") ? "" : (stryCov_9fa48("96343"), 'Concurrent ADD limit reached'),
  CONCURRENT_REMOVE_LIMIT: stryMutAct_9fa48("96344") ? "" : (stryCov_9fa48("96344"), 'Concurrent REMOVE limit reached'),
  UNKNOWN_OPERATION: stryMutAct_9fa48("96345") ? "" : (stryCov_9fa48("96345"), 'Unknown operation type for canStartOperation'),
  REMOVE_TRACKING_INVALID: stryMutAct_9fa48("96346") ? "" : (stryCov_9fa48("96346"), 'Cannot remove replica from tracking - not in REMOVED state'),
  REMOVE_TRACKING_SUCCESS: stryMutAct_9fa48("96347") ? "" : (stryCov_9fa48("96347"), 'Removed replica from tracking'),
  TIMEOUT_CHECKER_STARTED: stryMutAct_9fa48("96348") ? "" : (stryCov_9fa48("96348"), 'Timeout checker started'),
  TIMEOUT_CHECKER_STOPPED: stryMutAct_9fa48("96349") ? "" : (stryCov_9fa48("96349"), 'Timeout checker stopped'),
  OPERATION_TIMEOUT: stryMutAct_9fa48("96350") ? "" : (stryCov_9fa48("96350"), 'Replica operation timed out'),
  RECOVERY_START: stryMutAct_9fa48("96351") ? "" : (stryCov_9fa48("96351"), 'Handling node recovery in state machine'),
  RECOVERY_NO_CACHE: stryMutAct_9fa48("96352") ? "" : (stryCov_9fa48("96352"), 'No system table cache provided for recovery'),
  RECOVERY_QUERY_FAILED: stryMutAct_9fa48("96353") ? "" : (stryCov_9fa48("96353"), 'Failed to query services table for recovery'),
  RECOVERY_FOUND: stryMutAct_9fa48("96354") ? "" : (stryCov_9fa48("96354"), 'Found replicas in transitional states for recovery'),
  RECOVERY_PROCESSING: stryMutAct_9fa48("96355") ? "" : (stryCov_9fa48("96355"), 'Processing replica for recovery'),
  RECOVERY_FAILED: stryMutAct_9fa48("96356") ? "" : (stryCov_9fa48("96356"), 'Failed to process replica during recovery'),
  RECOVERY_TO_FAILED: stryMutAct_9fa48("96357") ? "" : (stryCov_9fa48("96357"), 'Transitioned replica to failed during recovery'),
  RECOVERY_REMOVED: stryMutAct_9fa48("96358") ? "" : (stryCov_9fa48("96358"), 'Completed replica removal during recovery'),
  RECOVERY_COMPLETE: stryMutAct_9fa48("96359") ? "" : (stryCov_9fa48("96359"), 'Node recovery complete in state machine'),
  RECOVERY_REGISTERED: stryMutAct_9fa48("96360") ? "" : (stryCov_9fa48("96360"), 'Registered replica for recovery')
}));
const REPLICA_STATE_MACHINE_ERROR_MSG = Object.freeze(stryMutAct_9fa48("96361") ? {} : (stryCov_9fa48("96361"), {
  MISSING_NODE_ID: stryMutAct_9fa48("96362") ? "" : (stryCov_9fa48("96362"), 'ReplicaStateMachine requires nodeId'),
  MISSING_CDC_SERVICE: stryMutAct_9fa48("96363") ? "" : (stryCov_9fa48("96363"), 'ReplicaStateMachine requires cdcIntegrationService'),
  MISSING_SYSTEM_TABLE_CACHE: stryMutAct_9fa48("96364") ? "" : (stryCov_9fa48("96364"), 'ReplicaStateMachine requires systemTableCache'),
  MISSING_UPSERT_SYSTEM_TABLE_ROW: stryMutAct_9fa48("96365") ? "" : (stryCov_9fa48("96365"), 'ReplicaStateMachine requires cdcIntegrationService.upsertSystemTableRow'),
  MISSING_UPDATE_SYSTEM_TABLE_ROW: stryMutAct_9fa48("96366") ? "" : (stryCov_9fa48("96366"), 'ReplicaStateMachine requires cdcIntegrationService.updateSystemTableRow'),
  timeoutReason: stryMutAct_9fa48("96367") ? () => undefined : (stryCov_9fa48("96367"), (state, elapsedMs) => stryMutAct_9fa48("96368") ? `` : (stryCov_9fa48("96368"), `Timeout in ${state} state after ${elapsedMs}ms`)),
  timeoutMessage: stryMutAct_9fa48("96369") ? () => undefined : (stryCov_9fa48("96369"), timeoutMs => stryMutAct_9fa48("96370") ? `` : (stryCov_9fa48("96370"), `Operation timed out after ${timeoutMs}ms`)),
  recoveryIncompleteOperation: stryMutAct_9fa48("96371") ? () => undefined : (stryCov_9fa48("96371"), status => stryMutAct_9fa48("96372") ? `` : (stryCov_9fa48("96372"), `Replica was in ${status} state during node failure`))
}));
const REPLICA_STATE_MACHINE_NUM = Object.freeze(stryMutAct_9fa48("96373") ? {} : (stryCov_9fa48("96373"), {
  ZERO: NUM.ZERO,
  ONE: NUM.ONE
}));
const REPLICA_STATE_MACHINE_LOAD_READY_STATES = Object.freeze(stryMutAct_9fa48("96374") ? [] : (stryCov_9fa48("96374"), [REPLICA_STATE_MACHINE_STATE.ACTIVE]));
const REPLICA_STATE_MACHINE_REPAIR_ONLY_STATES = Object.freeze(stryMutAct_9fa48("96375") ? [] : (stryCov_9fa48("96375"), [REPLICA_STATE_MACHINE_STATE.PENDING, REPLICA_STATE_MACHINE_STATE.CREATING, REPLICA_STATE_MACHINE_STATE.SYNCING, REPLICA_STATE_MACHINE_STATE.REMOVING, REPLICA_STATE_MACHINE_STATE.FAILED]));
const REPLICA_RAFT_ROLE_LOAD_READY_STATES = Object.freeze(stryMutAct_9fa48("96376") ? [] : (stryCov_9fa48("96376"), [RAFT_ROLE.LEADER, RAFT_ROLE.FOLLOWER]));
const REPLICA_RAFT_ROLE_REPAIR_ONLY_STATES = Object.freeze(stryMutAct_9fa48("96377") ? [] : (stryCov_9fa48("96377"), [RAFT_ROLE.CANDIDATE, RAFT_ROLE.LEARNER]));
function isLoadReadyReplicaRaftRole(role) {
  if (stryMutAct_9fa48("96378")) {
    {}
  } else {
    stryCov_9fa48("96378");
    return REPLICA_RAFT_ROLE_LOAD_READY_STATES.includes(stryMutAct_9fa48("96379") ? String(role || '').toUpperCase() : (stryCov_9fa48("96379"), String(stryMutAct_9fa48("96382") ? role && '' : stryMutAct_9fa48("96381") ? false : stryMutAct_9fa48("96380") ? true : (stryCov_9fa48("96380", "96381", "96382"), role || (stryMutAct_9fa48("96383") ? "Stryker was here!" : (stryCov_9fa48("96383"), '')))).toLowerCase()));
  }
}
function isRepairOnlyReplicaRaftRole(role) {
  if (stryMutAct_9fa48("96384")) {
    {}
  } else {
    stryCov_9fa48("96384");
    return REPLICA_RAFT_ROLE_REPAIR_ONLY_STATES.includes(stryMutAct_9fa48("96385") ? String(role || '').toUpperCase() : (stryCov_9fa48("96385"), String(stryMutAct_9fa48("96388") ? role && '' : stryMutAct_9fa48("96387") ? false : stryMutAct_9fa48("96386") ? true : (stryCov_9fa48("96386", "96387", "96388"), role || (stryMutAct_9fa48("96389") ? "Stryker was here!" : (stryCov_9fa48("96389"), '')))).toLowerCase()));
  }
}
export { REPLICA_STATE_MACHINE_DEFAULT, REPLICA_STATE_MACHINE_DEFAULT_TIMEOUTS, REPLICA_STATE_MACHINE_NOW, REPLICA_STATE_MACHINE_ERROR_MSG, REPLICA_STATE_MACHINE_EVENT, REPLICA_STATE_MACHINE_EVENT_TYPE, REPLICA_STATE_MACHINE_DIAGNOSTIC_CODE, REPLICA_STATE_MACHINE_LOG_MSG, REPLICA_STATE_MACHINE_NUM, REPLICA_STATE_MACHINE_OPERATION, REPLICA_STATE_MACHINE_REASON, REPLICA_RAFT_ROLE_LOAD_READY_STATES, REPLICA_RAFT_ROLE_REPAIR_ONLY_STATES, REPLICA_STATE_MACHINE_STATE, REPLICA_STATE_MACHINE_LOAD_READY_STATES, REPLICA_STATE_MACHINE_REPAIR_ONLY_STATES, REPLICA_STATE_MACHINE_SUBSYSTEM, REPLICA_STATE_MACHINE_TRANSITION, REPLICA_STATE_MACHINE_VALID_TRANSITIONS, isLoadReadyReplicaRaftRole, isRepairOnlyReplicaRaftRole };