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
import { ControlPlaneSystemTableGateway } from './control-plane-system-table-gateway.js';
function resolveProviderValue(options, fieldName, providerName) {
  if (stryMutAct_9fa48("61745")) {
    {}
  } else {
    stryCov_9fa48("61745");
    if (stryMutAct_9fa48("61748") ? typeof options?.[providerName] !== 'function' : stryMutAct_9fa48("61747") ? false : stryMutAct_9fa48("61746") ? true : (stryCov_9fa48("61746", "61747", "61748"), typeof (stryMutAct_9fa48("61749") ? options[providerName] : (stryCov_9fa48("61749"), options?.[providerName])) === (stryMutAct_9fa48("61750") ? "" : (stryCov_9fa48("61750"), 'function')))) {
      if (stryMutAct_9fa48("61751")) {
        {}
      } else {
        stryCov_9fa48("61751");
        return stryMutAct_9fa48("61754") ? options[providerName]() && null : stryMutAct_9fa48("61753") ? false : stryMutAct_9fa48("61752") ? true : (stryCov_9fa48("61752", "61753", "61754"), options[providerName]() || null);
      }
    }
    return stryMutAct_9fa48("61757") ? options?.[fieldName] && null : stryMutAct_9fa48("61756") ? false : stryMutAct_9fa48("61755") ? true : (stryCov_9fa48("61755", "61756", "61757"), (stryMutAct_9fa48("61758") ? options[fieldName] : (stryCov_9fa48("61758"), options?.[fieldName])) || null);
  }
}
function createControlPlaneRuntimeBundle(options = {}) {
  if (stryMutAct_9fa48("61759")) {
    {}
  } else {
    stryCov_9fa48("61759");
    const cdcIntegrationService = resolveProviderValue(options, stryMutAct_9fa48("61760") ? "" : (stryCov_9fa48("61760"), 'cdcIntegrationService'), stryMutAct_9fa48("61761") ? "" : (stryCov_9fa48("61761"), 'getCdcIntegrationService'));
    const systemTableCache = resolveProviderValue(options, stryMutAct_9fa48("61762") ? "" : (stryCov_9fa48("61762"), 'systemTableCache'), stryMutAct_9fa48("61763") ? "" : (stryCov_9fa48("61763"), 'getSystemTableCache'));
    const messageRouter = resolveProviderValue(options, stryMutAct_9fa48("61764") ? "" : (stryCov_9fa48("61764"), 'messageRouter'), stryMutAct_9fa48("61765") ? "" : (stryCov_9fa48("61765"), 'getMessageRouter'));
    const sqlQueryEngine = stryMutAct_9fa48("61768") ? (resolveProviderValue(options, 'sqlQueryEngine', 'getSqlQueryEngine') || cdcIntegrationService?.sqlQueryEngine) && null : stryMutAct_9fa48("61767") ? false : stryMutAct_9fa48("61766") ? true : (stryCov_9fa48("61766", "61767", "61768"), (stryMutAct_9fa48("61770") ? resolveProviderValue(options, 'sqlQueryEngine', 'getSqlQueryEngine') && cdcIntegrationService?.sqlQueryEngine : stryMutAct_9fa48("61769") ? false : (stryCov_9fa48("61769", "61770"), resolveProviderValue(options, stryMutAct_9fa48("61771") ? "" : (stryCov_9fa48("61771"), 'sqlQueryEngine'), stryMutAct_9fa48("61772") ? "" : (stryCov_9fa48("61772"), 'getSqlQueryEngine')) || (stryMutAct_9fa48("61773") ? cdcIntegrationService.sqlQueryEngine : (stryCov_9fa48("61773"), cdcIntegrationService?.sqlQueryEngine)))) || null);
    const controlPlaneSystemTableGateway = stryMutAct_9fa48("61776") ? options.controlPlaneSystemTableGateway && new ControlPlaneSystemTableGateway({
      nodeId: options.nodeId || null,
      sqlQueryEngine,
      cdcIntegrationService,
      systemTableCache,
      messageRouter,
      getSqlQueryEngine: options.getSqlQueryEngine,
      getCdcIntegrationService: options.getCdcIntegrationService,
      getSystemTableCache: options.getSystemTableCache,
      getMessageRouter: options.getMessageRouter,
      logger: options.logger || null,
      now: options.now
    }) : stryMutAct_9fa48("61775") ? false : stryMutAct_9fa48("61774") ? true : (stryCov_9fa48("61774", "61775", "61776"), options.controlPlaneSystemTableGateway || new ControlPlaneSystemTableGateway(stryMutAct_9fa48("61777") ? {} : (stryCov_9fa48("61777"), {
      nodeId: stryMutAct_9fa48("61780") ? options.nodeId && null : stryMutAct_9fa48("61779") ? false : stryMutAct_9fa48("61778") ? true : (stryCov_9fa48("61778", "61779", "61780"), options.nodeId || null),
      sqlQueryEngine,
      cdcIntegrationService,
      systemTableCache,
      messageRouter,
      getSqlQueryEngine: options.getSqlQueryEngine,
      getCdcIntegrationService: options.getCdcIntegrationService,
      getSystemTableCache: options.getSystemTableCache,
      getMessageRouter: options.getMessageRouter,
      logger: stryMutAct_9fa48("61783") ? options.logger && null : stryMutAct_9fa48("61782") ? false : stryMutAct_9fa48("61781") ? true : (stryCov_9fa48("61781", "61782", "61783"), options.logger || null),
      now: options.now
    })));
    return Object.freeze(stryMutAct_9fa48("61784") ? {} : (stryCov_9fa48("61784"), {
      nodeId: stryMutAct_9fa48("61787") ? options.nodeId && null : stryMutAct_9fa48("61786") ? false : stryMutAct_9fa48("61785") ? true : (stryCov_9fa48("61785", "61786", "61787"), options.nodeId || null),
      sqlQueryEngine,
      cdcIntegrationService,
      systemTableCache,
      messageRouter,
      controlPlaneSystemTableGateway
    }));
  }
}
export { createControlPlaneRuntimeBundle };