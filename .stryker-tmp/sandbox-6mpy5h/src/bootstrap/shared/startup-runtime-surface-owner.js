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
class StartupRuntimeSurfaceOwner {
  constructor(options = {}) {
    if (stryMutAct_9fa48("30812")) {
      {}
    } else {
      stryCov_9fa48("30812");
      this.delegates = stryMutAct_9fa48("30815") ? options.delegates && {} : stryMutAct_9fa48("30814") ? false : stryMutAct_9fa48("30813") ? true : (stryCov_9fa48("30813", "30814", "30815"), options.delegates || {});
    }
  }
  bindControlPlaneServices() {
    if (stryMutAct_9fa48("30816")) {
      {}
    } else {
      stryCov_9fa48("30816");
      const tablePolicyService = stryMutAct_9fa48("30819") ? this.delegates.getTablePolicyService?.() && null : stryMutAct_9fa48("30818") ? false : stryMutAct_9fa48("30817") ? true : (stryCov_9fa48("30817", "30818", "30819"), (stryMutAct_9fa48("30820") ? this.delegates.getTablePolicyService() : (stryCov_9fa48("30820"), this.delegates.getTablePolicyService?.())) || null);
      const rebalanceCoordinator = stryMutAct_9fa48("30823") ? this.delegates.getRebalanceCoordinator?.() && null : stryMutAct_9fa48("30822") ? false : stryMutAct_9fa48("30821") ? true : (stryCov_9fa48("30821", "30822", "30823"), (stryMutAct_9fa48("30824") ? this.delegates.getRebalanceCoordinator() : (stryCov_9fa48("30824"), this.delegates.getRebalanceCoordinator?.())) || null);
      for (const messageGroupService of stryMutAct_9fa48("30827") ? this.delegates.getMessageGroupServices?.()?.values?.() && [] : stryMutAct_9fa48("30826") ? false : stryMutAct_9fa48("30825") ? true : (stryCov_9fa48("30825", "30826", "30827"), (stryMutAct_9fa48("30830") ? this.delegates.getMessageGroupServices()?.values?.() : stryMutAct_9fa48("30829") ? this.delegates.getMessageGroupServices?.().values?.() : stryMutAct_9fa48("30828") ? this.delegates.getMessageGroupServices?.()?.values() : (stryCov_9fa48("30828", "30829", "30830"), this.delegates.getMessageGroupServices?.()?.values?.())) || (stryMutAct_9fa48("30831") ? ["Stryker was here"] : (stryCov_9fa48("30831"), [])))) {
        if (stryMutAct_9fa48("30832")) {
          {}
        } else {
          stryCov_9fa48("30832");
          if (stryMutAct_9fa48("30835") ? tablePolicyService || typeof messageGroupService?.setTablePolicyService === 'function' : stryMutAct_9fa48("30834") ? false : stryMutAct_9fa48("30833") ? true : (stryCov_9fa48("30833", "30834", "30835"), tablePolicyService && (stryMutAct_9fa48("30837") ? typeof messageGroupService?.setTablePolicyService !== 'function' : stryMutAct_9fa48("30836") ? true : (stryCov_9fa48("30836", "30837"), typeof (stryMutAct_9fa48("30838") ? messageGroupService.setTablePolicyService : (stryCov_9fa48("30838"), messageGroupService?.setTablePolicyService)) === (stryMutAct_9fa48("30839") ? "" : (stryCov_9fa48("30839"), 'function')))))) {
            if (stryMutAct_9fa48("30840")) {
              {}
            } else {
              stryCov_9fa48("30840");
              messageGroupService.setTablePolicyService(tablePolicyService);
            }
          }
          if (stryMutAct_9fa48("30843") ? rebalanceCoordinator || typeof messageGroupService?.setRebalanceCoordinator === 'function' : stryMutAct_9fa48("30842") ? false : stryMutAct_9fa48("30841") ? true : (stryCov_9fa48("30841", "30842", "30843"), rebalanceCoordinator && (stryMutAct_9fa48("30845") ? typeof messageGroupService?.setRebalanceCoordinator !== 'function' : stryMutAct_9fa48("30844") ? true : (stryCov_9fa48("30844", "30845"), typeof (stryMutAct_9fa48("30846") ? messageGroupService.setRebalanceCoordinator : (stryCov_9fa48("30846"), messageGroupService?.setRebalanceCoordinator)) === (stryMutAct_9fa48("30847") ? "" : (stryCov_9fa48("30847"), 'function')))))) {
            if (stryMutAct_9fa48("30848")) {
              {}
            } else {
              stryCov_9fa48("30848");
              messageGroupService.setRebalanceCoordinator(rebalanceCoordinator);
            }
          }
        }
      }
      for (const partitionService of stryMutAct_9fa48("30851") ? this.delegates.getPartitionServices?.()?.values?.() && [] : stryMutAct_9fa48("30850") ? false : stryMutAct_9fa48("30849") ? true : (stryCov_9fa48("30849", "30850", "30851"), (stryMutAct_9fa48("30854") ? this.delegates.getPartitionServices()?.values?.() : stryMutAct_9fa48("30853") ? this.delegates.getPartitionServices?.().values?.() : stryMutAct_9fa48("30852") ? this.delegates.getPartitionServices?.()?.values() : (stryCov_9fa48("30852", "30853", "30854"), this.delegates.getPartitionServices?.()?.values?.())) || (stryMutAct_9fa48("30855") ? ["Stryker was here"] : (stryCov_9fa48("30855"), [])))) {
        if (stryMutAct_9fa48("30856")) {
          {}
        } else {
          stryCov_9fa48("30856");
          if (stryMutAct_9fa48("30859") ? tablePolicyService || typeof partitionService?.setTablePolicyService === 'function' : stryMutAct_9fa48("30858") ? false : stryMutAct_9fa48("30857") ? true : (stryCov_9fa48("30857", "30858", "30859"), tablePolicyService && (stryMutAct_9fa48("30861") ? typeof partitionService?.setTablePolicyService !== 'function' : stryMutAct_9fa48("30860") ? true : (stryCov_9fa48("30860", "30861"), typeof (stryMutAct_9fa48("30862") ? partitionService.setTablePolicyService : (stryCov_9fa48("30862"), partitionService?.setTablePolicyService)) === (stryMutAct_9fa48("30863") ? "" : (stryCov_9fa48("30863"), 'function')))))) {
            if (stryMutAct_9fa48("30864")) {
              {}
            } else {
              stryCov_9fa48("30864");
              partitionService.setTablePolicyService(tablePolicyService);
            }
          }
          if (stryMutAct_9fa48("30867") ? rebalanceCoordinator || typeof partitionService?.setRebalanceCoordinator === 'function' : stryMutAct_9fa48("30866") ? false : stryMutAct_9fa48("30865") ? true : (stryCov_9fa48("30865", "30866", "30867"), rebalanceCoordinator && (stryMutAct_9fa48("30869") ? typeof partitionService?.setRebalanceCoordinator !== 'function' : stryMutAct_9fa48("30868") ? true : (stryCov_9fa48("30868", "30869"), typeof (stryMutAct_9fa48("30870") ? partitionService.setRebalanceCoordinator : (stryCov_9fa48("30870"), partitionService?.setRebalanceCoordinator)) === (stryMutAct_9fa48("30871") ? "" : (stryCov_9fa48("30871"), 'function')))))) {
            if (stryMutAct_9fa48("30872")) {
              {}
            } else {
              stryCov_9fa48("30872");
              partitionService.setRebalanceCoordinator(rebalanceCoordinator);
            }
          }
        }
      }
    }
  }
  async notifyLocalAdminRuntimeReady() {
    if (stryMutAct_9fa48("30873")) {
      {}
    } else {
      stryCov_9fa48("30873");
      if (stryMutAct_9fa48("30876") ? this.delegates.getLocalAdminRuntimeReadyNotified?.() !== true : stryMutAct_9fa48("30875") ? false : stryMutAct_9fa48("30874") ? true : (stryCov_9fa48("30874", "30875", "30876"), (stryMutAct_9fa48("30877") ? this.delegates.getLocalAdminRuntimeReadyNotified() : (stryCov_9fa48("30877"), this.delegates.getLocalAdminRuntimeReadyNotified?.())) === (stryMutAct_9fa48("30878") ? false : (stryCov_9fa48("30878"), true)))) {
        if (stryMutAct_9fa48("30879")) {
          {}
        } else {
          stryCov_9fa48("30879");
          return;
        }
      }
      const onLocalAdminRuntimeReady = stryMutAct_9fa48("30882") ? this.delegates.getOnLocalAdminRuntimeReady?.() && null : stryMutAct_9fa48("30881") ? false : stryMutAct_9fa48("30880") ? true : (stryCov_9fa48("30880", "30881", "30882"), (stryMutAct_9fa48("30883") ? this.delegates.getOnLocalAdminRuntimeReady() : (stryCov_9fa48("30883"), this.delegates.getOnLocalAdminRuntimeReady?.())) || null);
      if (stryMutAct_9fa48("30886") ? typeof onLocalAdminRuntimeReady === 'function' : stryMutAct_9fa48("30885") ? false : stryMutAct_9fa48("30884") ? true : (stryCov_9fa48("30884", "30885", "30886"), typeof onLocalAdminRuntimeReady !== (stryMutAct_9fa48("30887") ? "" : (stryCov_9fa48("30887"), 'function')))) {
        if (stryMutAct_9fa48("30888")) {
          {}
        } else {
          stryCov_9fa48("30888");
          return;
        }
      }
      stryMutAct_9fa48("30889") ? this.delegates.setLocalAdminRuntimeReadyNotified(true) : (stryCov_9fa48("30889"), this.delegates.setLocalAdminRuntimeReadyNotified?.(stryMutAct_9fa48("30890") ? false : (stryCov_9fa48("30890"), true)));
      await onLocalAdminRuntimeReady(stryMutAct_9fa48("30891") ? {} : (stryCov_9fa48("30891"), {
        nodeId: stryMutAct_9fa48("30894") ? this.delegates.getNodeId?.() && null : stryMutAct_9fa48("30893") ? false : stryMutAct_9fa48("30892") ? true : (stryCov_9fa48("30892", "30893", "30894"), (stryMutAct_9fa48("30895") ? this.delegates.getNodeId() : (stryCov_9fa48("30895"), this.delegates.getNodeId?.())) || null),
        systemTableCache: stryMutAct_9fa48("30898") ? this.delegates.getSystemTableCache?.() && null : stryMutAct_9fa48("30897") ? false : stryMutAct_9fa48("30896") ? true : (stryCov_9fa48("30896", "30897", "30898"), (stryMutAct_9fa48("30899") ? this.delegates.getSystemTableCache() : (stryCov_9fa48("30899"), this.delegates.getSystemTableCache?.())) || null),
        cacheMutationTarget: stryMutAct_9fa48("30902") ? this.delegates.getCacheMutationTarget?.() && null : stryMutAct_9fa48("30901") ? false : stryMutAct_9fa48("30900") ? true : (stryCov_9fa48("30900", "30901", "30902"), (stryMutAct_9fa48("30903") ? this.delegates.getCacheMutationTarget() : (stryCov_9fa48("30903"), this.delegates.getCacheMutationTarget?.())) || null),
        messageRouter: stryMutAct_9fa48("30906") ? this.delegates.getMessageRouter?.() && null : stryMutAct_9fa48("30905") ? false : stryMutAct_9fa48("30904") ? true : (stryCov_9fa48("30904", "30905", "30906"), (stryMutAct_9fa48("30907") ? this.delegates.getMessageRouter() : (stryCov_9fa48("30907"), this.delegates.getMessageRouter?.())) || null),
        partitionServices: stryMutAct_9fa48("30910") ? this.delegates.getPartitionServices?.() && null : stryMutAct_9fa48("30909") ? false : stryMutAct_9fa48("30908") ? true : (stryCov_9fa48("30908", "30909", "30910"), (stryMutAct_9fa48("30911") ? this.delegates.getPartitionServices() : (stryCov_9fa48("30911"), this.delegates.getPartitionServices?.())) || null),
        owner: stryMutAct_9fa48("30914") ? this.delegates.getOwner?.() && null : stryMutAct_9fa48("30913") ? false : stryMutAct_9fa48("30912") ? true : (stryCov_9fa48("30912", "30913", "30914"), (stryMutAct_9fa48("30915") ? this.delegates.getOwner() : (stryCov_9fa48("30915"), this.delegates.getOwner?.())) || null)
      }));
    }
  }
}
export { StartupRuntimeSurfaceOwner };