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
import { BOOTSTRAP_PHASE, BOOTSTRAP_SUBSYSTEM } from './bootstrap-constants.js';
import { STRING } from '../constants/index.js';
const BOOTSTRAP_TRACKER_SUBSYSTEM = BOOTSTRAP_SUBSYSTEM.TRACKER;
const BOOTSTRAP_TRACKER_EVENT = Object.freeze(stryMutAct_9fa48("13482") ? {} : (stryCov_9fa48("13482"), {
  TRACKING_STARTED: stryMutAct_9fa48("13483") ? "" : (stryCov_9fa48("13483"), 'trackingStarted'),
  PHASE_TRANSITION: stryMutAct_9fa48("13484") ? "" : (stryCov_9fa48("13484"), 'phaseTransition'),
  SERVICE_CREATED: stryMutAct_9fa48("13485") ? "" : (stryCov_9fa48("13485"), 'serviceCreated'),
  ERROR: stryMutAct_9fa48("13486") ? "" : (stryCov_9fa48("13486"), 'error'),
  TRACKING_COMPLETE: stryMutAct_9fa48("13487") ? "" : (stryCov_9fa48("13487"), 'trackingComplete'),
  RAFT_STATE_CHANGE: stryMutAct_9fa48("13488") ? "" : (stryCov_9fa48("13488"), 'raftStateChange')
}));
const BOOTSTRAP_TRACKER_LOG_MSG = Object.freeze(stryMutAct_9fa48("13489") ? {} : (stryCov_9fa48("13489"), {
  TRACKING_STARTED: stryMutAct_9fa48("13490") ? "" : (stryCov_9fa48("13490"), 'Bootstrap tracking started'),
  PHASE_TRANSITION: stryMutAct_9fa48("13491") ? "" : (stryCov_9fa48("13491"), 'Bootstrap phase transition'),
  RAFT_STATE_CHANGE: stryMutAct_9fa48("13492") ? "" : (stryCov_9fa48("13492"), 'Raft state change'),
  SERVICE_CREATED: stryMutAct_9fa48("13493") ? "" : (stryCov_9fa48("13493"), 'Service created during bootstrap'),
  ERROR: stryMutAct_9fa48("13494") ? "" : (stryCov_9fa48("13494"), 'Bootstrap error'),
  TRACKING_COMPLETE: stryMutAct_9fa48("13495") ? "" : (stryCov_9fa48("13495"), 'Bootstrap completed successfully'),
  TRACKING_FAILED: stryMutAct_9fa48("13496") ? "" : (stryCov_9fa48("13496"), 'Bootstrap failed')
}));
const BOOTSTRAP_TRACKER_PHASE_DESCRIPTION = Object.freeze(stryMutAct_9fa48("13497") ? {} : (stryCov_9fa48("13497"), {
  [BOOTSTRAP_PHASE.NOT_STARTED]: stryMutAct_9fa48("13498") ? "" : (stryCov_9fa48("13498"), 'Bootstrap not started'),
  [BOOTSTRAP_PHASE.INFRASTRUCTURE]: stryMutAct_9fa48("13499") ? "" : (stryCov_9fa48("13499"), 'Setting up infrastructure (config, transport)'),
  [BOOTSTRAP_PHASE.MESSAGE_GROUPS]: stryMutAct_9fa48("13500") ? "" : (stryCov_9fa48("13500"), 'Creating message group replicas'),
  [BOOTSTRAP_PHASE.PARTITIONS]: stryMutAct_9fa48("13501") ? "" : (stryCov_9fa48("13501"), 'Creating system table partitions'),
  [BOOTSTRAP_PHASE.REGISTRATION]: stryMutAct_9fa48("13502") ? "" : (stryCov_9fa48("13502"), 'Registering services in system tables'),
  [BOOTSTRAP_PHASE.COMPLETE]: stryMutAct_9fa48("13503") ? "" : (stryCov_9fa48("13503"), 'Bootstrap completed successfully'),
  [BOOTSTRAP_PHASE.FAILED]: stryMutAct_9fa48("13504") ? "" : (stryCov_9fa48("13504"), 'Bootstrap failed')
}));
const BOOTSTRAP_TRACKER_ERROR_MSG = Object.freeze(stryMutAct_9fa48("13505") ? {} : (stryCov_9fa48("13505"), {
  LOGGER_UNAVAILABLE: stryMutAct_9fa48("13506") ? "" : (stryCov_9fa48("13506"), 'Logging not available'),
  UNKNOWN_NODE_ID: STRING.UNKNOWN
}));
export { BOOTSTRAP_TRACKER_SUBSYSTEM, BOOTSTRAP_TRACKER_EVENT, BOOTSTRAP_TRACKER_LOG_MSG, BOOTSTRAP_TRACKER_PHASE_DESCRIPTION, BOOTSTRAP_TRACKER_ERROR_MSG };