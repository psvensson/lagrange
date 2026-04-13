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
import { RAFT_PROVIDER_CONTROL, RAFT_PROVIDER_ERROR_MSG } from './raft-provider-control-constants.js';
const SUPPORTED_RAFT_PROVIDERS = new Set(stryMutAct_9fa48("128044") ? [] : (stryCov_9fa48("128044"), [RAFT_PROVIDER_CONTROL.LIFERAFT, RAFT_PROVIDER_CONTROL.RAFT_LOGIC, RAFT_PROVIDER_CONTROL.RAFT_LOGIC_SPIKE]));
let processRaftProvider = null;

/**
 * Resolve configured raft provider from environment input.
 * @param {Object<string, string|undefined>} [env=process.env]
 * @return {string}
 */
function resolveRaftProvider(env = process.env) {
  if (stryMutAct_9fa48("128045")) {
    {}
  } else {
    stryCov_9fa48("128045");
    const rawValue = (stryMutAct_9fa48("128048") ? env || Object.prototype.hasOwnProperty.call(env, RAFT_PROVIDER_CONTROL.ENV_KEY) : stryMutAct_9fa48("128047") ? false : stryMutAct_9fa48("128046") ? true : (stryCov_9fa48("128046", "128047", "128048"), env && Object.prototype.hasOwnProperty.call(env, RAFT_PROVIDER_CONTROL.ENV_KEY))) ? env[RAFT_PROVIDER_CONTROL.ENV_KEY] : null;
    if (stryMutAct_9fa48("128051") ? false : stryMutAct_9fa48("128050") ? true : stryMutAct_9fa48("128049") ? rawValue : (stryCov_9fa48("128049", "128050", "128051"), !rawValue)) {
      if (stryMutAct_9fa48("128052")) {
        {}
      } else {
        stryCov_9fa48("128052");
        return RAFT_PROVIDER_CONTROL.LIFERAFT;
      }
    }
    const normalized = stryMutAct_9fa48("128054") ? String(rawValue).toLowerCase() : stryMutAct_9fa48("128053") ? String(rawValue).trim().toUpperCase() : (stryCov_9fa48("128053", "128054"), String(rawValue).trim().toLowerCase());
    if (stryMutAct_9fa48("128056") ? false : stryMutAct_9fa48("128055") ? true : (stryCov_9fa48("128055", "128056"), SUPPORTED_RAFT_PROVIDERS.has(normalized))) {
      if (stryMutAct_9fa48("128057")) {
        {}
      } else {
        stryCov_9fa48("128057");
        return normalized;
      }
    }
    throw new Error(RAFT_PROVIDER_ERROR_MSG.INVALID_PROVIDER);
  }
}

/**
 * Resolve and lock the raft provider selection for this process lifetime.
 * @param {Object<string, string|undefined>} [env=process.env]
 * @return {string}
 */
function getProcessRaftProvider(env = process.env) {
  if (stryMutAct_9fa48("128058")) {
    {}
  } else {
    stryCov_9fa48("128058");
    const requestedProvider = resolveRaftProvider(env);
    if (stryMutAct_9fa48("128061") ? false : stryMutAct_9fa48("128060") ? true : stryMutAct_9fa48("128059") ? processRaftProvider : (stryCov_9fa48("128059", "128060", "128061"), !processRaftProvider)) {
      if (stryMutAct_9fa48("128062")) {
        {}
      } else {
        stryCov_9fa48("128062");
        processRaftProvider = requestedProvider;
        return processRaftProvider;
      }
    }
    if (stryMutAct_9fa48("128065") ? processRaftProvider === requestedProvider : stryMutAct_9fa48("128064") ? false : stryMutAct_9fa48("128063") ? true : (stryCov_9fa48("128063", "128064", "128065"), processRaftProvider !== requestedProvider)) {
      if (stryMutAct_9fa48("128066")) {
        {}
      } else {
        stryCov_9fa48("128066");
        throw new Error(RAFT_PROVIDER_ERROR_MSG.processProviderLocked(processRaftProvider, requestedProvider));
      }
    }
    return processRaftProvider;
  }
}

/**
 * Ensure the active runtime path uses liferaft until cutover is complete.
 * @param {Object<string, string|undefined>} [env=process.env]
 * @return {string}
 */
function ensureLiferaftProviderForRuntime(env = process.env) {
  if (stryMutAct_9fa48("128067")) {
    {}
  } else {
    stryCov_9fa48("128067");
    const selectedProvider = getProcessRaftProvider(env);
    if (stryMutAct_9fa48("128070") ? selectedProvider === RAFT_PROVIDER_CONTROL.LIFERAFT : stryMutAct_9fa48("128069") ? false : stryMutAct_9fa48("128068") ? true : (stryCov_9fa48("128068", "128069", "128070"), selectedProvider !== RAFT_PROVIDER_CONTROL.LIFERAFT)) {
      if (stryMutAct_9fa48("128071")) {
        {}
      } else {
        stryCov_9fa48("128071");
        throw new Error(RAFT_PROVIDER_ERROR_MSG.runtimeProviderNotImplemented(selectedProvider));
      }
    }
    return selectedProvider;
  }
}

/**
 * Test helper: clear process provider lock.
 */
function resetProcessRaftProviderForTests() {
  if (stryMutAct_9fa48("128072")) {
    {}
  } else {
    stryCov_9fa48("128072");
    processRaftProvider = null;
  }
}
export { ensureLiferaftProviderForRuntime, getProcessRaftProvider, resetProcessRaftProviderForTests, resolveRaftProvider };