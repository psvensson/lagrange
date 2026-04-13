/**
 * Seed startup pipeline plan.
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
import { BOOTSTRAP_PHASE as BootstrapPhase } from '../bootstrap-constants.js';
function createSeedStartupPlan(service) {
  if (stryMutAct_9fa48("27628")) {
    {}
  } else {
    stryCov_9fa48("27628");
    return stryMutAct_9fa48("27629") ? {} : (stryCov_9fa48("27629"), {
      phases: stryMutAct_9fa48("27630") ? [] : (stryCov_9fa48("27630"), [stryMutAct_9fa48("27631") ? {} : (stryCov_9fa48("27631"), {
        name: BootstrapPhase.INFRASTRUCTURE,
        run: stryMutAct_9fa48("27632") ? () => undefined : (stryCov_9fa48("27632"), () => service.executePhase(BootstrapPhase.INFRASTRUCTURE, stryMutAct_9fa48("27633") ? () => undefined : (stryCov_9fa48("27633"), () => service.seedPhaseOwners.infrastructure())))
      }), stryMutAct_9fa48("27634") ? {} : (stryCov_9fa48("27634"), {
        name: BootstrapPhase.MESSAGE_GROUPS,
        run: stryMutAct_9fa48("27635") ? () => undefined : (stryCov_9fa48("27635"), () => service.executePhase(BootstrapPhase.MESSAGE_GROUPS, stryMutAct_9fa48("27636") ? () => undefined : (stryCov_9fa48("27636"), () => service.seedPhaseOwners.messageGroups())))
      }), stryMutAct_9fa48("27637") ? {} : (stryCov_9fa48("27637"), {
        name: BootstrapPhase.PARTITIONS,
        run: stryMutAct_9fa48("27638") ? () => undefined : (stryCov_9fa48("27638"), () => service.executePhase(BootstrapPhase.PARTITIONS, stryMutAct_9fa48("27639") ? () => undefined : (stryCov_9fa48("27639"), () => service.seedPhaseOwners.partitions())))
      }), stryMutAct_9fa48("27640") ? {} : (stryCov_9fa48("27640"), {
        name: BootstrapPhase.REGISTRATION,
        run: stryMutAct_9fa48("27641") ? () => undefined : (stryCov_9fa48("27641"), () => service.executePhase(BootstrapPhase.REGISTRATION, stryMutAct_9fa48("27642") ? () => undefined : (stryCov_9fa48("27642"), () => service.seedPhaseOwners.registration())))
      }), stryMutAct_9fa48("27643") ? {} : (stryCov_9fa48("27643"), {
        name: BootstrapPhase.CACHE_HYDRATION,
        run: stryMutAct_9fa48("27644") ? () => undefined : (stryCov_9fa48("27644"), () => service.executePhase(BootstrapPhase.CACHE_HYDRATION, stryMutAct_9fa48("27645") ? () => undefined : (stryCov_9fa48("27645"), () => service.seedPhaseOwners.cacheHydration())))
      })])
    });
  }
}
export { createSeedStartupPlan };