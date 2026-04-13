/**
 * Seed phase owner registry.
 *
 * Canonical owner call path for seed-bootstrap phases (D2.3).
 * The BootstrapService orchestration boundary executes through this
 * registry, which routes directly to extracted phase owner modules.
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
import { assertCritical } from '../../utils/assert.js';
const SEED_PHASE_OWNER = Object.freeze(stryMutAct_9fa48("23191") ? {} : (stryCov_9fa48("23191"), {
  INFRASTRUCTURE: stryMutAct_9fa48("23192") ? "" : (stryCov_9fa48("23192"), 'infrastructure'),
  MESSAGE_GROUPS: stryMutAct_9fa48("23193") ? "" : (stryCov_9fa48("23193"), 'messageGroups'),
  PARTITIONS: stryMutAct_9fa48("23194") ? "" : (stryCov_9fa48("23194"), 'partitions'),
  REGISTRATION: stryMutAct_9fa48("23195") ? "" : (stryCov_9fa48("23195"), 'registration'),
  CACHE_HYDRATION: stryMutAct_9fa48("23196") ? "" : (stryCov_9fa48("23196"), 'cacheHydration')
}));
const PHASE_OWNER_FIELD = Object.freeze(stryMutAct_9fa48("23197") ? {} : (stryCov_9fa48("23197"), {
  [SEED_PHASE_OWNER.INFRASTRUCTURE]: stryMutAct_9fa48("23198") ? "" : (stryCov_9fa48("23198"), 'seedInfrastructurePhase'),
  [SEED_PHASE_OWNER.MESSAGE_GROUPS]: stryMutAct_9fa48("23199") ? "" : (stryCov_9fa48("23199"), 'seedMessageGroupsPhase'),
  [SEED_PHASE_OWNER.PARTITIONS]: stryMutAct_9fa48("23200") ? "" : (stryCov_9fa48("23200"), 'seedPartitionsPhase'),
  [SEED_PHASE_OWNER.REGISTRATION]: stryMutAct_9fa48("23201") ? "" : (stryCov_9fa48("23201"), 'seedRegistrationPhase'),
  [SEED_PHASE_OWNER.CACHE_HYDRATION]: stryMutAct_9fa48("23202") ? "" : (stryCov_9fa48("23202"), 'seedCacheHydrationPhase')
}));
const PHASE_METHOD = Object.freeze(stryMutAct_9fa48("23203") ? {} : (stryCov_9fa48("23203"), {
  [SEED_PHASE_OWNER.INFRASTRUCTURE]: stryMutAct_9fa48("23204") ? "" : (stryCov_9fa48("23204"), 'phaseInfrastructure'),
  [SEED_PHASE_OWNER.MESSAGE_GROUPS]: stryMutAct_9fa48("23205") ? "" : (stryCov_9fa48("23205"), 'phaseMessageGroups'),
  [SEED_PHASE_OWNER.PARTITIONS]: stryMutAct_9fa48("23206") ? "" : (stryCov_9fa48("23206"), 'phasePartitions'),
  [SEED_PHASE_OWNER.REGISTRATION]: stryMutAct_9fa48("23207") ? "" : (stryCov_9fa48("23207"), 'phaseRegistration'),
  [SEED_PHASE_OWNER.CACHE_HYDRATION]: stryMutAct_9fa48("23208") ? "" : (stryCov_9fa48("23208"), 'phaseCacheHydration')
}));
const OWNER_ERROR_MSG = Object.freeze(stryMutAct_9fa48("23209") ? {} : (stryCov_9fa48("23209"), {
  missingPhaseOwner: stryMutAct_9fa48("23210") ? () => undefined : (stryCov_9fa48("23210"), ownerField => stryMutAct_9fa48("23211") ? `` : (stryCov_9fa48("23211"), `Phase owner not initialized: ${ownerField}`))
}));

/**
 * Create direct phase-owner invoker (D2.3).
 * Routes through the extracted phase owner module, not through
 * wrapper methods on BootstrapService.
 * @param {Object} service - Bootstrap service instance.
 * @param {string} ownerField - Phase owner field name on service.
 * @param {string} methodName - Phase method name on the owner.
 * @return {Function} Owner invoker.
 * @private
 */
function createPhaseInvoker(service, ownerField, methodName) {
  if (stryMutAct_9fa48("23212")) {
    {}
  } else {
    stryCov_9fa48("23212");
    return async (...args) => {
      if (stryMutAct_9fa48("23213")) {
        {}
      } else {
        stryCov_9fa48("23213");
        const owner = service[ownerField];
        assertCritical(owner, OWNER_ERROR_MSG.missingPhaseOwner(ownerField));
        return owner[methodName](...args);
      }
    };
  }
}

/**
 * Create canonical seed phase owners.
 * @param {Object} service - Bootstrap service.
 * @return {Object<string, Function>} Seed phase owner registry.
 */
function createSeedPhaseOwners(service) {
  if (stryMutAct_9fa48("23214")) {
    {}
  } else {
    stryCov_9fa48("23214");
    assertCritical(service, stryMutAct_9fa48("23215") ? "" : (stryCov_9fa48("23215"), 'BootstrapService is required for seed phase owners'));
    const owners = {};
    for (const key of Object.values(SEED_PHASE_OWNER)) {
      if (stryMutAct_9fa48("23216")) {
        {}
      } else {
        stryCov_9fa48("23216");
        owners[key] = createPhaseInvoker(service, PHASE_OWNER_FIELD[key], PHASE_METHOD[key]);
      }
    }
    return Object.freeze(owners);
  }
}
export { SEED_PHASE_OWNER, createSeedPhaseOwners };