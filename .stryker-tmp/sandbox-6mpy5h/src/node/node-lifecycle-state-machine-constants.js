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
import { NODE_STATE } from '../constants/index.js';
import { BOOTSTRAP_SUB_PHASE, JOINING_SUB_PHASE } from './node-constants.js';
const NODE_LIFECYCLE_STATE = NODE_STATE;
const NODE_LIFECYCLE_DEFAULT_OPTIONS = Object.freeze({});
const NODE_LIFECYCLE_NO_SUB_PHASE = null;
const NODE_LIFECYCLE_SUB_PHASE_ROOT = stryMutAct_9fa48("92860") ? "" : (stryCov_9fa48("92860"), 'null');
const NODE_LIFECYCLE_NOW = stryMutAct_9fa48("92861") ? () => undefined : (stryCov_9fa48("92861"), (() => {
  const NODE_LIFECYCLE_NOW = () => Date.now();
  return NODE_LIFECYCLE_NOW;
})());
const NODE_LIFECYCLE_VALID_TRANSITIONS = Object.freeze(stryMutAct_9fa48("92862") ? {} : (stryCov_9fa48("92862"), {
  [NODE_LIFECYCLE_STATE.STARTING]: Object.freeze(stryMutAct_9fa48("92863") ? [] : (stryCov_9fa48("92863"), [NODE_LIFECYCLE_STATE.CONNECTING, NODE_LIFECYCLE_STATE.STOPPED])),
  [NODE_LIFECYCLE_STATE.CONNECTING]: Object.freeze(stryMutAct_9fa48("92864") ? [] : (stryCov_9fa48("92864"), [NODE_LIFECYCLE_STATE.DISCOVERING, NODE_LIFECYCLE_STATE.STOPPED])),
  [NODE_LIFECYCLE_STATE.DISCOVERING]: Object.freeze(stryMutAct_9fa48("92865") ? [] : (stryCov_9fa48("92865"), [NODE_LIFECYCLE_STATE.JOINING, NODE_LIFECYCLE_STATE.STOPPED])),
  [NODE_LIFECYCLE_STATE.JOINING]: Object.freeze(stryMutAct_9fa48("92866") ? [] : (stryCov_9fa48("92866"), [NODE_LIFECYCLE_STATE.SYNCING, NODE_LIFECYCLE_STATE.READY, NODE_LIFECYCLE_STATE.STOPPED])),
  [NODE_LIFECYCLE_STATE.SYNCING]: Object.freeze(stryMutAct_9fa48("92867") ? [] : (stryCov_9fa48("92867"), [NODE_LIFECYCLE_STATE.READY, NODE_LIFECYCLE_STATE.STOPPED])),
  [NODE_LIFECYCLE_STATE.READY]: Object.freeze(stryMutAct_9fa48("92868") ? [] : (stryCov_9fa48("92868"), [NODE_LIFECYCLE_STATE.DRAINING])),
  [NODE_LIFECYCLE_STATE.DRAINING]: Object.freeze(stryMutAct_9fa48("92869") ? [] : (stryCov_9fa48("92869"), [NODE_LIFECYCLE_STATE.STOPPED])),
  [NODE_LIFECYCLE_STATE.STOPPED]: Object.freeze(stryMutAct_9fa48("92870") ? ["Stryker was here"] : (stryCov_9fa48("92870"), []))
}));
const NODE_LIFECYCLE_VALID_SUB_PHASES = Object.freeze(stryMutAct_9fa48("92871") ? {} : (stryCov_9fa48("92871"), {
  [NODE_LIFECYCLE_STATE.STARTING]: Object.freeze(stryMutAct_9fa48("92872") ? [] : (stryCov_9fa48("92872"), [BOOTSTRAP_SUB_PHASE.INFRASTRUCTURE, BOOTSTRAP_SUB_PHASE.MESSAGE_GROUPS, BOOTSTRAP_SUB_PHASE.PARTITIONS, BOOTSTRAP_SUB_PHASE.REGISTRATION, BOOTSTRAP_SUB_PHASE.CACHE_HYDRATION])),
  [NODE_LIFECYCLE_STATE.JOINING]: Object.freeze(stryMutAct_9fa48("92873") ? [] : (stryCov_9fa48("92873"), [JOINING_SUB_PHASE.CONTACTING_SEED, JOINING_SUB_PHASE.CONNECTING_WEBSOCKET, JOINING_SUB_PHASE.CREATING_MESSAGE_GROUP, JOINING_SUB_PHASE.JOINING_MESSAGE_GROUP, JOINING_SUB_PHASE.WAITING_LEADERSHIP, JOINING_SUB_PHASE.QUERYING_STATE]))
}));
const NODE_LIFECYCLE_VALID_SUB_PHASE_TRANSITIONS = Object.freeze(stryMutAct_9fa48("92874") ? {} : (stryCov_9fa48("92874"), {
  null: Object.freeze(stryMutAct_9fa48("92875") ? [] : (stryCov_9fa48("92875"), [BOOTSTRAP_SUB_PHASE.INFRASTRUCTURE, JOINING_SUB_PHASE.CONTACTING_SEED])),
  [BOOTSTRAP_SUB_PHASE.INFRASTRUCTURE]: Object.freeze(stryMutAct_9fa48("92876") ? [] : (stryCov_9fa48("92876"), [BOOTSTRAP_SUB_PHASE.MESSAGE_GROUPS])),
  [BOOTSTRAP_SUB_PHASE.MESSAGE_GROUPS]: Object.freeze(stryMutAct_9fa48("92877") ? [] : (stryCov_9fa48("92877"), [BOOTSTRAP_SUB_PHASE.PARTITIONS])),
  [BOOTSTRAP_SUB_PHASE.PARTITIONS]: Object.freeze(stryMutAct_9fa48("92878") ? [] : (stryCov_9fa48("92878"), [BOOTSTRAP_SUB_PHASE.REGISTRATION])),
  [BOOTSTRAP_SUB_PHASE.REGISTRATION]: Object.freeze(stryMutAct_9fa48("92879") ? [] : (stryCov_9fa48("92879"), [BOOTSTRAP_SUB_PHASE.CACHE_HYDRATION])),
  [BOOTSTRAP_SUB_PHASE.CACHE_HYDRATION]: Object.freeze(stryMutAct_9fa48("92880") ? ["Stryker was here"] : (stryCov_9fa48("92880"), [])),
  [JOINING_SUB_PHASE.CONTACTING_SEED]: Object.freeze(stryMutAct_9fa48("92881") ? [] : (stryCov_9fa48("92881"), [JOINING_SUB_PHASE.CONNECTING_WEBSOCKET])),
  [JOINING_SUB_PHASE.CONNECTING_WEBSOCKET]: Object.freeze(stryMutAct_9fa48("92882") ? [] : (stryCov_9fa48("92882"), [JOINING_SUB_PHASE.CREATING_MESSAGE_GROUP, JOINING_SUB_PHASE.JOINING_MESSAGE_GROUP])),
  [JOINING_SUB_PHASE.CREATING_MESSAGE_GROUP]: Object.freeze(stryMutAct_9fa48("92883") ? [] : (stryCov_9fa48("92883"), [JOINING_SUB_PHASE.WAITING_LEADERSHIP])),
  [JOINING_SUB_PHASE.JOINING_MESSAGE_GROUP]: Object.freeze(stryMutAct_9fa48("92884") ? [] : (stryCov_9fa48("92884"), [JOINING_SUB_PHASE.WAITING_LEADERSHIP])),
  [JOINING_SUB_PHASE.WAITING_LEADERSHIP]: Object.freeze(stryMutAct_9fa48("92885") ? [] : (stryCov_9fa48("92885"), [JOINING_SUB_PHASE.QUERYING_STATE])),
  [JOINING_SUB_PHASE.QUERYING_STATE]: Object.freeze(stryMutAct_9fa48("92886") ? ["Stryker was here"] : (stryCov_9fa48("92886"), []))
}));
const NODE_LIFECYCLE_TERMINAL_SUB_PHASE_ADVANCE = Object.freeze(stryMutAct_9fa48("92887") ? {} : (stryCov_9fa48("92887"), {
  [BOOTSTRAP_SUB_PHASE.CACHE_HYDRATION]: NODE_LIFECYCLE_STATE.CONNECTING,
  [JOINING_SUB_PHASE.QUERYING_STATE]: NODE_LIFECYCLE_STATE.READY
}));
const NODE_LIFECYCLE_LOAD_READY_STATES = Object.freeze(stryMutAct_9fa48("92888") ? [] : (stryCov_9fa48("92888"), [NODE_LIFECYCLE_STATE.READY, NODE_LIFECYCLE_STATE.ACTIVE]));
const NODE_LIFECYCLE_REPAIR_ONLY_STATES = Object.freeze(stryMutAct_9fa48("92889") ? [] : (stryCov_9fa48("92889"), [NODE_LIFECYCLE_STATE.INITIALIZING, NODE_LIFECYCLE_STATE.STARTING, NODE_LIFECYCLE_STATE.CONNECTING, NODE_LIFECYCLE_STATE.DISCOVERING, NODE_LIFECYCLE_STATE.JOINING, NODE_LIFECYCLE_STATE.SYNCING, NODE_LIFECYCLE_STATE.SUSPECTED, NODE_LIFECYCLE_STATE.FAILED, NODE_LIFECYCLE_STATE.RECOVERING, NODE_LIFECYCLE_STATE.DRAINING, NODE_LIFECYCLE_STATE.SHUTTING_DOWN]));
function isLoadReadyNodeLifecycleState(state) {
  if (stryMutAct_9fa48("92890")) {
    {}
  } else {
    stryCov_9fa48("92890");
    return NODE_LIFECYCLE_LOAD_READY_STATES.includes(String(stryMutAct_9fa48("92893") ? state && '' : stryMutAct_9fa48("92892") ? false : stryMutAct_9fa48("92891") ? true : (stryCov_9fa48("92891", "92892", "92893"), state || (stryMutAct_9fa48("92894") ? "Stryker was here!" : (stryCov_9fa48("92894"), '')))));
  }
}
function isRepairOnlyNodeLifecycleState(state) {
  if (stryMutAct_9fa48("92895")) {
    {}
  } else {
    stryCov_9fa48("92895");
    return NODE_LIFECYCLE_REPAIR_ONLY_STATES.includes(String(stryMutAct_9fa48("92898") ? state && '' : stryMutAct_9fa48("92897") ? false : stryMutAct_9fa48("92896") ? true : (stryCov_9fa48("92896", "92897", "92898"), state || (stryMutAct_9fa48("92899") ? "Stryker was here!" : (stryCov_9fa48("92899"), '')))));
  }
}
export { NODE_LIFECYCLE_DEFAULT_OPTIONS, NODE_LIFECYCLE_LOAD_READY_STATES, NODE_LIFECYCLE_NO_SUB_PHASE, NODE_LIFECYCLE_NOW, NODE_LIFECYCLE_REPAIR_ONLY_STATES, NODE_LIFECYCLE_STATE, NODE_LIFECYCLE_SUB_PHASE_ROOT, NODE_LIFECYCLE_TERMINAL_SUB_PHASE_ADVANCE, NODE_LIFECYCLE_VALID_SUB_PHASES, NODE_LIFECYCLE_VALID_SUB_PHASE_TRANSITIONS, NODE_LIFECYCLE_VALID_TRANSITIONS, isLoadReadyNodeLifecycleState, isRepairOnlyNodeLifecycleState };