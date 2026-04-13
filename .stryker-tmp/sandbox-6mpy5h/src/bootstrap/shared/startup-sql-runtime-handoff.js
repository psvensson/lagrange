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
import { CDCIntegrationSetup } from './cdc-integration-setup.js';

/**
 * Attach the final runtime SQL engine to the canonical startup owner.
 *
 * This consolidates the bootstrap-to-runtime handoff boundary for both seed
 * and join paths so the owner, CDC integration service, and deferred
 * transaction recovery all switch to the same runtime engine together.
 *
 * @param {Object} options
 * @param {Object} options.owner
 * @param {Object} options.sqlQueryEngine
 * @param {Object} options.systemTableCache
 * @param {Object|null} [options.cacheMutationTarget]
 * @param {Object|null} [options.messageRouter]
 * @param {Function|null} [options.partitionServicesProvider]
 * @return {void}
 */
function attachSqlRuntimeToStartupOwner(options) {
  if (stryMutAct_9fa48("30967")) {
    {}
  } else {
    stryCov_9fa48("30967");
    const owner = stryMutAct_9fa48("30970") ? options.owner && null : stryMutAct_9fa48("30969") ? false : stryMutAct_9fa48("30968") ? true : (stryCov_9fa48("30968", "30969", "30970"), options.owner || null);
    const sqlQueryEngine = stryMutAct_9fa48("30973") ? options.sqlQueryEngine && null : stryMutAct_9fa48("30972") ? false : stryMutAct_9fa48("30971") ? true : (stryCov_9fa48("30971", "30972", "30973"), options.sqlQueryEngine || null);
    if (stryMutAct_9fa48("30976") ? !owner && !sqlQueryEngine : stryMutAct_9fa48("30975") ? false : stryMutAct_9fa48("30974") ? true : (stryCov_9fa48("30974", "30975", "30976"), (stryMutAct_9fa48("30977") ? owner : (stryCov_9fa48("30977"), !owner)) || (stryMutAct_9fa48("30978") ? sqlQueryEngine : (stryCov_9fa48("30978"), !sqlQueryEngine)))) {
      if (stryMutAct_9fa48("30979")) {
        {}
      } else {
        stryCov_9fa48("30979");
        return;
      }
    }
    owner.sqlQueryEngine = sqlQueryEngine;
    const cdcIntegrationService = stryMutAct_9fa48("30982") ? owner.cdcIntegrationService && null : stryMutAct_9fa48("30981") ? false : stryMutAct_9fa48("30980") ? true : (stryCov_9fa48("30980", "30981", "30982"), owner.cdcIntegrationService || null);
    if (stryMutAct_9fa48("30984") ? false : stryMutAct_9fa48("30983") ? true : (stryCov_9fa48("30983", "30984"), cdcIntegrationService)) {
      if (stryMutAct_9fa48("30985")) {
        {}
      } else {
        stryCov_9fa48("30985");
        CDCIntegrationSetup.upgrade(stryMutAct_9fa48("30986") ? {} : (stryCov_9fa48("30986"), {
          cdcIntegrationService,
          sqlQueryEngine,
          systemTableCache: options.systemTableCache,
          messageRouter: stryMutAct_9fa48("30989") ? options.messageRouter && null : stryMutAct_9fa48("30988") ? false : stryMutAct_9fa48("30987") ? true : (stryCov_9fa48("30987", "30988", "30989"), options.messageRouter || null),
          cacheMutationTarget: stryMutAct_9fa48("30992") ? options.cacheMutationTarget && null : stryMutAct_9fa48("30991") ? false : stryMutAct_9fa48("30990") ? true : (stryCov_9fa48("30990", "30991", "30992"), options.cacheMutationTarget || null),
          partitionServicesProvider: (stryMutAct_9fa48("30995") ? typeof options.partitionServicesProvider !== 'function' : stryMutAct_9fa48("30994") ? false : stryMutAct_9fa48("30993") ? true : (stryCov_9fa48("30993", "30994", "30995"), typeof options.partitionServicesProvider === (stryMutAct_9fa48("30996") ? "" : (stryCov_9fa48("30996"), 'function')))) ? options.partitionServicesProvider : null
        }));
        if (stryMutAct_9fa48("30999") ? typeof sqlQueryEngine.setCDCIntegrationService !== 'function' : stryMutAct_9fa48("30998") ? false : stryMutAct_9fa48("30997") ? true : (stryCov_9fa48("30997", "30998", "30999"), typeof sqlQueryEngine.setCDCIntegrationService === (stryMutAct_9fa48("31000") ? "" : (stryCov_9fa48("31000"), 'function')))) {
          if (stryMutAct_9fa48("31001")) {
            {}
          } else {
            stryCov_9fa48("31001");
            sqlQueryEngine.setCDCIntegrationService(cdcIntegrationService);
          }
        }
      }
    }
    const backgroundWritersActive = stryMutAct_9fa48("31004") ? typeof owner.hasActiveControlPlaneBackgroundWriters === 'function' || owner.hasActiveControlPlaneBackgroundWriters() === true : stryMutAct_9fa48("31003") ? false : stryMutAct_9fa48("31002") ? true : (stryCov_9fa48("31002", "31003", "31004"), (stryMutAct_9fa48("31006") ? typeof owner.hasActiveControlPlaneBackgroundWriters !== 'function' : stryMutAct_9fa48("31005") ? true : (stryCov_9fa48("31005", "31006"), typeof owner.hasActiveControlPlaneBackgroundWriters === (stryMutAct_9fa48("31007") ? "" : (stryCov_9fa48("31007"), 'function')))) && (stryMutAct_9fa48("31009") ? owner.hasActiveControlPlaneBackgroundWriters() !== true : stryMutAct_9fa48("31008") ? true : (stryCov_9fa48("31008", "31009"), owner.hasActiveControlPlaneBackgroundWriters() === (stryMutAct_9fa48("31010") ? false : (stryCov_9fa48("31010"), true)))));
    if (stryMutAct_9fa48("31013") ? backgroundWritersActive === true || typeof owner.activateDistributedTransactionRecovery === 'function' : stryMutAct_9fa48("31012") ? false : stryMutAct_9fa48("31011") ? true : (stryCov_9fa48("31011", "31012", "31013"), (stryMutAct_9fa48("31015") ? backgroundWritersActive !== true : stryMutAct_9fa48("31014") ? true : (stryCov_9fa48("31014", "31015"), backgroundWritersActive === (stryMutAct_9fa48("31016") ? false : (stryCov_9fa48("31016"), true)))) && (stryMutAct_9fa48("31018") ? typeof owner.activateDistributedTransactionRecovery !== 'function' : stryMutAct_9fa48("31017") ? true : (stryCov_9fa48("31017", "31018"), typeof owner.activateDistributedTransactionRecovery === (stryMutAct_9fa48("31019") ? "" : (stryCov_9fa48("31019"), 'function')))))) {
      if (stryMutAct_9fa48("31020")) {
        {}
      } else {
        stryCov_9fa48("31020");
        owner.activateDistributedTransactionRecovery();
      }
    }
  }
}

/**
 * Trigger steady-state runtime activation through the shared startup handoff
 * boundary instead of having bootstrap/join services wire each runtime concern
 * inline at phase completion.
 *
 * @param {Object} options
 * @param {Object} options.owner
 * @param {boolean} [options.activateControlPlaneBackgroundWriters]
 * @param {boolean} [options.activateDistributedTransactionRecovery]
 * @param {boolean} [options.flushDeferredCreateSelfHostedMetadata]
 * @param {boolean} [options.startLatencyTopologyLifecycle]
 * @return {void}
 */
function activateSteadyStateRuntimeHandoff(options) {
  if (stryMutAct_9fa48("31021")) {
    {}
  } else {
    stryCov_9fa48("31021");
    const owner = stryMutAct_9fa48("31024") ? options?.owner && null : stryMutAct_9fa48("31023") ? false : stryMutAct_9fa48("31022") ? true : (stryCov_9fa48("31022", "31023", "31024"), (stryMutAct_9fa48("31025") ? options.owner : (stryCov_9fa48("31025"), options?.owner)) || null);
    if (stryMutAct_9fa48("31028") ? false : stryMutAct_9fa48("31027") ? true : stryMutAct_9fa48("31026") ? owner : (stryCov_9fa48("31026", "31027", "31028"), !owner)) {
      if (stryMutAct_9fa48("31029")) {
        {}
      } else {
        stryCov_9fa48("31029");
        return;
      }
    }
    if (stryMutAct_9fa48("31032") ? options.activateControlPlaneBackgroundWriters === true || typeof owner.activateControlPlaneBackgroundWriters === 'function' : stryMutAct_9fa48("31031") ? false : stryMutAct_9fa48("31030") ? true : (stryCov_9fa48("31030", "31031", "31032"), (stryMutAct_9fa48("31034") ? options.activateControlPlaneBackgroundWriters !== true : stryMutAct_9fa48("31033") ? true : (stryCov_9fa48("31033", "31034"), options.activateControlPlaneBackgroundWriters === (stryMutAct_9fa48("31035") ? false : (stryCov_9fa48("31035"), true)))) && (stryMutAct_9fa48("31037") ? typeof owner.activateControlPlaneBackgroundWriters !== 'function' : stryMutAct_9fa48("31036") ? true : (stryCov_9fa48("31036", "31037"), typeof owner.activateControlPlaneBackgroundWriters === (stryMutAct_9fa48("31038") ? "" : (stryCov_9fa48("31038"), 'function')))))) {
      if (stryMutAct_9fa48("31039")) {
        {}
      } else {
        stryCov_9fa48("31039");
        void owner.activateControlPlaneBackgroundWriters();
      }
    }
    if (stryMutAct_9fa48("31042") ? options.flushDeferredCreateSelfHostedMetadata === true || typeof owner.flushDeferredCreateSelfHostedMetadata === 'function' : stryMutAct_9fa48("31041") ? false : stryMutAct_9fa48("31040") ? true : (stryCov_9fa48("31040", "31041", "31042"), (stryMutAct_9fa48("31044") ? options.flushDeferredCreateSelfHostedMetadata !== true : stryMutAct_9fa48("31043") ? true : (stryCov_9fa48("31043", "31044"), options.flushDeferredCreateSelfHostedMetadata === (stryMutAct_9fa48("31045") ? false : (stryCov_9fa48("31045"), true)))) && (stryMutAct_9fa48("31047") ? typeof owner.flushDeferredCreateSelfHostedMetadata !== 'function' : stryMutAct_9fa48("31046") ? true : (stryCov_9fa48("31046", "31047"), typeof owner.flushDeferredCreateSelfHostedMetadata === (stryMutAct_9fa48("31048") ? "" : (stryCov_9fa48("31048"), 'function')))))) {
      if (stryMutAct_9fa48("31049")) {
        {}
      } else {
        stryCov_9fa48("31049");
        owner.flushDeferredCreateSelfHostedMetadata();
      }
    }
    if (stryMutAct_9fa48("31052") ? options.activateDistributedTransactionRecovery === true || typeof owner.activateDistributedTransactionRecovery === 'function' : stryMutAct_9fa48("31051") ? false : stryMutAct_9fa48("31050") ? true : (stryCov_9fa48("31050", "31051", "31052"), (stryMutAct_9fa48("31054") ? options.activateDistributedTransactionRecovery !== true : stryMutAct_9fa48("31053") ? true : (stryCov_9fa48("31053", "31054"), options.activateDistributedTransactionRecovery === (stryMutAct_9fa48("31055") ? false : (stryCov_9fa48("31055"), true)))) && (stryMutAct_9fa48("31057") ? typeof owner.activateDistributedTransactionRecovery !== 'function' : stryMutAct_9fa48("31056") ? true : (stryCov_9fa48("31056", "31057"), typeof owner.activateDistributedTransactionRecovery === (stryMutAct_9fa48("31058") ? "" : (stryCov_9fa48("31058"), 'function')))))) {
      if (stryMutAct_9fa48("31059")) {
        {}
      } else {
        stryCov_9fa48("31059");
        owner.activateDistributedTransactionRecovery();
      }
    }
    if (stryMutAct_9fa48("31062") ? options.startLatencyTopologyLifecycle === true || typeof owner.startLatencyTopologyLifecycle === 'function' : stryMutAct_9fa48("31061") ? false : stryMutAct_9fa48("31060") ? true : (stryCov_9fa48("31060", "31061", "31062"), (stryMutAct_9fa48("31064") ? options.startLatencyTopologyLifecycle !== true : stryMutAct_9fa48("31063") ? true : (stryCov_9fa48("31063", "31064"), options.startLatencyTopologyLifecycle === (stryMutAct_9fa48("31065") ? false : (stryCov_9fa48("31065"), true)))) && (stryMutAct_9fa48("31067") ? typeof owner.startLatencyTopologyLifecycle !== 'function' : stryMutAct_9fa48("31066") ? true : (stryCov_9fa48("31066", "31067"), typeof owner.startLatencyTopologyLifecycle === (stryMutAct_9fa48("31068") ? "" : (stryCov_9fa48("31068"), 'function')))))) {
      if (stryMutAct_9fa48("31069")) {
        {}
      } else {
        stryCov_9fa48("31069");
        owner.startLatencyTopologyLifecycle();
      }
    }
  }
}
export { activateSteadyStateRuntimeHandoff, attachSqlRuntimeToStartupOwner };