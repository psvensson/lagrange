/**
 * Constants for raft-logic contained spike implementation.
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
import { RAFT_PROVIDER_CONTROL } from '../raft-provider-control-constants.js';
const RAFT_LOGIC_SPIKE_ROLE = Object.freeze(stryMutAct_9fa48("129248") ? {} : (stryCov_9fa48("129248"), {
  LEADER: stryMutAct_9fa48("129249") ? "" : (stryCov_9fa48("129249"), 'leader'),
  FOLLOWER: stryMutAct_9fa48("129250") ? "" : (stryCov_9fa48("129250"), 'follower'),
  CANDIDATE: stryMutAct_9fa48("129251") ? "" : (stryCov_9fa48("129251"), 'candidate')
}));
const RAFT_LOGIC_SPIKE_EVENT = Object.freeze(stryMutAct_9fa48("129252") ? {} : (stryCov_9fa48("129252"), {
  LEADER: stryMutAct_9fa48("129253") ? "" : (stryCov_9fa48("129253"), 'leader'),
  FOLLOWER: stryMutAct_9fa48("129254") ? "" : (stryCov_9fa48("129254"), 'follower'),
  CANDIDATE: stryMutAct_9fa48("129255") ? "" : (stryCov_9fa48("129255"), 'candidate'),
  COMMIT: stryMutAct_9fa48("129256") ? "" : (stryCov_9fa48("129256"), 'commit'),
  LEADER_CHANGE: stryMutAct_9fa48("129257") ? "" : (stryCov_9fa48("129257"), 'leader change'),
  TERM_CHANGE: stryMutAct_9fa48("129258") ? "" : (stryCov_9fa48("129258"), 'term change')
}));
const RAFT_LOGIC_SPIKE_DEFAULT = Object.freeze(stryMutAct_9fa48("129259") ? {} : (stryCov_9fa48("129259"), {
  ELECTION_TICK: 10,
  HEARTBEAT_TICK: 1,
  TICK_INTERVAL_MS: 20,
  WAIT_FOR_LEADER_TIMEOUT_MS: 5000,
  WAIT_FOR_COMMIT_TIMEOUT_MS: 5000,
  CLIENT_REQUEST_TIMEOUT_MS: 5000,
  LEADER_STABILIZE_WAIT_MS: 200,
  RESTART_WAIT_MS: 150,
  MIN_INTERNAL_NODE_ID: 1,
  CLUSTER_NODE_ID_STEP: 1
}));
const RAFT_LOGIC_SPIKE_TIME = Object.freeze(stryMutAct_9fa48("129260") ? {} : (stryCov_9fa48("129260"), {
  SECOND_MS: 1000,
  MINUTE_MS: stryMutAct_9fa48("129261") ? 60 / 1000 : (stryCov_9fa48("129261"), 60 * 1000)
}));
const RAFT_LOGIC_SPIKE_ERROR = Object.freeze(stryMutAct_9fa48("129262") ? {} : (stryCov_9fa48("129262"), {
  INVALID_REPLICA_IDS: stryMutAct_9fa48("129263") ? "" : (stryCov_9fa48("129263"), 'replicaIds must be a non-empty array'),
  MISSING_REPLICA_ID: stryMutAct_9fa48("129264") ? "" : (stryCov_9fa48("129264"), 'replicaId must be a non-empty string'),
  REPLICA_ID_NOT_IN_CLUSTER: stryMutAct_9fa48("129265") ? "" : (stryCov_9fa48("129265"), 'replicaId must exist in replicaIds'),
  ADAPTER_NOT_STARTED: stryMutAct_9fa48("129266") ? "" : (stryCov_9fa48("129266"), 'raft-logic spike adapter is not started')
}));
const RAFT_LOGIC_SPIKE_LOG_MSG = Object.freeze(stryMutAct_9fa48("129267") ? {} : (stryCov_9fa48("129267"), {
  STARTING: stryMutAct_9fa48("129268") ? "" : (stryCov_9fa48("129268"), 'Starting raft-logic spike adapter'),
  STARTED: stryMutAct_9fa48("129269") ? "" : (stryCov_9fa48("129269"), 'Started raft-logic spike adapter'),
  STOPPING: stryMutAct_9fa48("129270") ? "" : (stryCov_9fa48("129270"), 'Stopping raft-logic spike adapter'),
  STOPPED: stryMutAct_9fa48("129271") ? "" : (stryCov_9fa48("129271"), 'Stopped raft-logic spike adapter'),
  COMMAND_REJECTED: stryMutAct_9fa48("129272") ? "" : (stryCov_9fa48("129272"), 'raft-logic spike command rejected'),
  ROLE_CHANGED: stryMutAct_9fa48("129273") ? "" : (stryCov_9fa48("129273"), 'raft-logic spike role changed'),
  LEADER_CHANGED: stryMutAct_9fa48("129274") ? "" : (stryCov_9fa48("129274"), 'raft-logic spike leader changed')
}));
const RAFT_LOGIC_SPIKE_JSON = Object.freeze(stryMutAct_9fa48("129275") ? {} : (stryCov_9fa48("129275"), {
  EMPTY_OBJECT: stryMutAct_9fa48("129276") ? "" : (stryCov_9fa48("129276"), '{}')
}));
export { RAFT_PROVIDER_CONTROL, RAFT_LOGIC_SPIKE_DEFAULT, RAFT_LOGIC_SPIKE_ERROR, RAFT_LOGIC_SPIKE_EVENT, RAFT_LOGIC_SPIKE_JSON, RAFT_LOGIC_SPIKE_LOG_MSG, RAFT_LOGIC_SPIKE_ROLE, RAFT_LOGIC_SPIKE_TIME };