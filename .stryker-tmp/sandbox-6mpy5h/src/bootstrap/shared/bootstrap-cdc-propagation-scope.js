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
import { TYPEOF } from '../../constants/index.js';
function isBootstrapOwnedCdcPropagationActive(currentPhase, completePhase) {
  if (stryMutAct_9fa48("28161")) {
    {}
  } else {
    stryCov_9fa48("28161");
    return stryMutAct_9fa48("28164") ? currentPhase === completePhase : stryMutAct_9fa48("28163") ? false : stryMutAct_9fa48("28162") ? true : (stryCov_9fa48("28162", "28163", "28164"), currentPhase !== completePhase);
  }
}
function detachBootstrapOwnedCdcSubscriber(options = {}) {
  if (stryMutAct_9fa48("28165")) {
    {}
  } else {
    stryCov_9fa48("28165");
    const partition = stryMutAct_9fa48("28168") ? options.partition && null : stryMutAct_9fa48("28167") ? false : stryMutAct_9fa48("28166") ? true : (stryCov_9fa48("28166", "28167", "28168"), options.partition || null);
    const subscriber = stryMutAct_9fa48("28171") ? options.subscriber && null : stryMutAct_9fa48("28170") ? false : stryMutAct_9fa48("28169") ? true : (stryCov_9fa48("28169", "28170", "28171"), options.subscriber || null);
    if (stryMutAct_9fa48("28174") ? (!partition || typeof partition.unsubscribeFromCDC !== TYPEOF.FUNCTION) && !subscriber : stryMutAct_9fa48("28173") ? false : stryMutAct_9fa48("28172") ? true : (stryCov_9fa48("28172", "28173", "28174"), (stryMutAct_9fa48("28176") ? !partition && typeof partition.unsubscribeFromCDC !== TYPEOF.FUNCTION : stryMutAct_9fa48("28175") ? false : (stryCov_9fa48("28175", "28176"), (stryMutAct_9fa48("28177") ? partition : (stryCov_9fa48("28177"), !partition)) || (stryMutAct_9fa48("28179") ? typeof partition.unsubscribeFromCDC === TYPEOF.FUNCTION : stryMutAct_9fa48("28178") ? false : (stryCov_9fa48("28178", "28179"), typeof partition.unsubscribeFromCDC !== TYPEOF.FUNCTION)))) || (stryMutAct_9fa48("28180") ? subscriber : (stryCov_9fa48("28180"), !subscriber)))) {
      if (stryMutAct_9fa48("28181")) {
        {}
      } else {
        stryCov_9fa48("28181");
        return stryMutAct_9fa48("28182") ? true : (stryCov_9fa48("28182"), false);
      }
    }
    partition.unsubscribeFromCDC(subscriber);
    if (stryMutAct_9fa48("28185") ? typeof options.logger?.debug !== TYPEOF.FUNCTION : stryMutAct_9fa48("28184") ? false : stryMutAct_9fa48("28183") ? true : (stryCov_9fa48("28183", "28184", "28185"), typeof (stryMutAct_9fa48("28186") ? options.logger.debug : (stryCov_9fa48("28186"), options.logger?.debug)) === TYPEOF.FUNCTION)) {
      if (stryMutAct_9fa48("28187")) {
        {}
      } else {
        stryCov_9fa48("28187");
        options.logger.debug(stryMutAct_9fa48("28190") ? options.logMessage && 'Detached bootstrap-owned CDC propagation subscriber' : stryMutAct_9fa48("28189") ? false : stryMutAct_9fa48("28188") ? true : (stryCov_9fa48("28188", "28189", "28190"), options.logMessage || (stryMutAct_9fa48("28191") ? "" : (stryCov_9fa48("28191"), 'Detached bootstrap-owned CDC propagation subscriber'))), stryMutAct_9fa48("28192") ? {} : (stryCov_9fa48("28192"), {
          nodeId: stryMutAct_9fa48("28195") ? options.nodeId && null : stryMutAct_9fa48("28194") ? false : stryMutAct_9fa48("28193") ? true : (stryCov_9fa48("28193", "28194", "28195"), options.nodeId || null),
          tableName: stryMutAct_9fa48("28198") ? options.tableName && null : stryMutAct_9fa48("28197") ? false : stryMutAct_9fa48("28196") ? true : (stryCov_9fa48("28196", "28197", "28198"), options.tableName || null),
          partitionId: stryMutAct_9fa48("28201") ? options.partitionId && null : stryMutAct_9fa48("28200") ? false : stryMutAct_9fa48("28199") ? true : (stryCov_9fa48("28199", "28200", "28201"), options.partitionId || null),
          replicaId: stryMutAct_9fa48("28204") ? options.replicaId && null : stryMutAct_9fa48("28203") ? false : stryMutAct_9fa48("28202") ? true : (stryCov_9fa48("28202", "28203", "28204"), options.replicaId || null),
          lifecyclePhase: stryMutAct_9fa48("28207") ? options.lifecyclePhase && null : stryMutAct_9fa48("28206") ? false : stryMutAct_9fa48("28205") ? true : (stryCov_9fa48("28205", "28206", "28207"), options.lifecyclePhase || null)
        }));
      }
    }
    return stryMutAct_9fa48("28208") ? false : (stryCov_9fa48("28208"), true);
  }
}
export { detachBootstrapOwnedCdcSubscriber, isBootstrapOwnedCdcPropagationActive };