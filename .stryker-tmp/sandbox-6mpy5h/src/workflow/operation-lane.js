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
import { NUM, TYPEOF } from '../constants/index.js';
const OPERATION_LANE_ERROR_MSG = Object.freeze(stryMutAct_9fa48("166850") ? {} : (stryCov_9fa48("166850"), {
  EXECUTION_FACTORY_REQUIRED: stryMutAct_9fa48("166851") ? "" : (stryCov_9fa48("166851"), 'OperationLane requires an execution factory'),
  OWNER_KEY_REQUIRED: stryMutAct_9fa48("166852") ? "" : (stryCov_9fa48("166852"), 'OperationLane requires an owner key'),
  WORKFLOW_COORDINATOR_REQUIRED: stryMutAct_9fa48("166853") ? "" : (stryCov_9fa48("166853"), 'OperationLane requires a workflow coordinator with runExclusive()')
}));
class OperationLane {
  /**
   * @param {Object} options
   */
  constructor(options = {}) {
    if (stryMutAct_9fa48("166854")) {
      {}
    } else {
      stryCov_9fa48("166854");
      this.name = stryMutAct_9fa48("166857") ? options.name && 'operation-lane' : stryMutAct_9fa48("166856") ? false : stryMutAct_9fa48("166855") ? true : (stryCov_9fa48("166855", "166856", "166857"), options.name || (stryMutAct_9fa48("166858") ? "" : (stryCov_9fa48("166858"), 'operation-lane')));
      this.workflowCoordinator = stryMutAct_9fa48("166861") ? options.workflowCoordinator && null : stryMutAct_9fa48("166860") ? false : stryMutAct_9fa48("166859") ? true : (stryCov_9fa48("166859", "166860", "166861"), options.workflowCoordinator || null);
      if (stryMutAct_9fa48("166864") ? !this.workflowCoordinator && typeof this.workflowCoordinator.runExclusive !== TYPEOF.FUNCTION : stryMutAct_9fa48("166863") ? false : stryMutAct_9fa48("166862") ? true : (stryCov_9fa48("166862", "166863", "166864"), (stryMutAct_9fa48("166865") ? this.workflowCoordinator : (stryCov_9fa48("166865"), !this.workflowCoordinator)) || (stryMutAct_9fa48("166867") ? typeof this.workflowCoordinator.runExclusive === TYPEOF.FUNCTION : stryMutAct_9fa48("166866") ? false : (stryCov_9fa48("166866", "166867"), typeof this.workflowCoordinator.runExclusive !== TYPEOF.FUNCTION)))) {
        if (stryMutAct_9fa48("166868")) {
          {}
        } else {
          stryCov_9fa48("166868");
          throw new Error(OPERATION_LANE_ERROR_MSG.WORKFLOW_COORDINATOR_REQUIRED);
        }
      }
      this.timeoutPolicy = stryMutAct_9fa48("166871") ? options.timeoutPolicy && null : stryMutAct_9fa48("166870") ? false : stryMutAct_9fa48("166869") ? true : (stryCov_9fa48("166869", "166870", "166871"), options.timeoutPolicy || null);
      this.ownerKeyFactory = (stryMutAct_9fa48("166874") ? typeof options.ownerKeyFactory !== TYPEOF.FUNCTION : stryMutAct_9fa48("166873") ? false : stryMutAct_9fa48("166872") ? true : (stryCov_9fa48("166872", "166873", "166874"), typeof options.ownerKeyFactory === TYPEOF.FUNCTION)) ? options.ownerKeyFactory : null;
    }
  }

  /**
   * Resolve one owner key from a context object or string.
   * @param {Object|string} context
   * @return {string}
   */
  resolveOwnerKey(context = {}) {
    if (stryMutAct_9fa48("166875")) {
      {}
    } else {
      stryCov_9fa48("166875");
      if (stryMutAct_9fa48("166878") ? typeof context === TYPEOF.STRING || context.length > NUM.ZERO : stryMutAct_9fa48("166877") ? false : stryMutAct_9fa48("166876") ? true : (stryCov_9fa48("166876", "166877", "166878"), (stryMutAct_9fa48("166880") ? typeof context !== TYPEOF.STRING : stryMutAct_9fa48("166879") ? true : (stryCov_9fa48("166879", "166880"), typeof context === TYPEOF.STRING)) && (stryMutAct_9fa48("166883") ? context.length <= NUM.ZERO : stryMutAct_9fa48("166882") ? context.length >= NUM.ZERO : stryMutAct_9fa48("166881") ? true : (stryCov_9fa48("166881", "166882", "166883"), context.length > NUM.ZERO)))) {
        if (stryMutAct_9fa48("166884")) {
          {}
        } else {
          stryCov_9fa48("166884");
          return context;
        }
      }
      const explicitOwnerKey = String(stryMutAct_9fa48("166887") ? context?.ownerKey && '' : stryMutAct_9fa48("166886") ? false : stryMutAct_9fa48("166885") ? true : (stryCov_9fa48("166885", "166886", "166887"), (stryMutAct_9fa48("166888") ? context.ownerKey : (stryCov_9fa48("166888"), context?.ownerKey)) || (stryMutAct_9fa48("166889") ? "Stryker was here!" : (stryCov_9fa48("166889"), ''))));
      if (stryMutAct_9fa48("166893") ? explicitOwnerKey.length <= NUM.ZERO : stryMutAct_9fa48("166892") ? explicitOwnerKey.length >= NUM.ZERO : stryMutAct_9fa48("166891") ? false : stryMutAct_9fa48("166890") ? true : (stryCov_9fa48("166890", "166891", "166892", "166893"), explicitOwnerKey.length > NUM.ZERO)) {
        if (stryMutAct_9fa48("166894")) {
          {}
        } else {
          stryCov_9fa48("166894");
          return explicitOwnerKey;
        }
      }
      if (stryMutAct_9fa48("166896") ? false : stryMutAct_9fa48("166895") ? true : (stryCov_9fa48("166895", "166896"), this.ownerKeyFactory)) {
        if (stryMutAct_9fa48("166897")) {
          {}
        } else {
          stryCov_9fa48("166897");
          const derivedOwnerKey = String(stryMutAct_9fa48("166900") ? this.ownerKeyFactory(context) && '' : stryMutAct_9fa48("166899") ? false : stryMutAct_9fa48("166898") ? true : (stryCov_9fa48("166898", "166899", "166900"), this.ownerKeyFactory(context) || (stryMutAct_9fa48("166901") ? "Stryker was here!" : (stryCov_9fa48("166901"), ''))));
          if (stryMutAct_9fa48("166905") ? derivedOwnerKey.length <= NUM.ZERO : stryMutAct_9fa48("166904") ? derivedOwnerKey.length >= NUM.ZERO : stryMutAct_9fa48("166903") ? false : stryMutAct_9fa48("166902") ? true : (stryCov_9fa48("166902", "166903", "166904", "166905"), derivedOwnerKey.length > NUM.ZERO)) {
            if (stryMutAct_9fa48("166906")) {
              {}
            } else {
              stryCov_9fa48("166906");
              return derivedOwnerKey;
            }
          }
        }
      }
      for (const fallback of stryMutAct_9fa48("166907") ? [] : (stryCov_9fa48("166907"), [stryMutAct_9fa48("166908") ? context.workflowId : (stryCov_9fa48("166908"), context?.workflowId), stryMutAct_9fa48("166909") ? context.operationId : (stryCov_9fa48("166909"), context?.operationId), stryMutAct_9fa48("166910") ? context.partitionId : (stryCov_9fa48("166910"), context?.partitionId)])) {
        if (stryMutAct_9fa48("166911")) {
          {}
        } else {
          stryCov_9fa48("166911");
          const normalizedFallback = String(stryMutAct_9fa48("166914") ? fallback && '' : stryMutAct_9fa48("166913") ? false : stryMutAct_9fa48("166912") ? true : (stryCov_9fa48("166912", "166913", "166914"), fallback || (stryMutAct_9fa48("166915") ? "Stryker was here!" : (stryCov_9fa48("166915"), ''))));
          if (stryMutAct_9fa48("166919") ? normalizedFallback.length <= NUM.ZERO : stryMutAct_9fa48("166918") ? normalizedFallback.length >= NUM.ZERO : stryMutAct_9fa48("166917") ? false : stryMutAct_9fa48("166916") ? true : (stryCov_9fa48("166916", "166917", "166918", "166919"), normalizedFallback.length > NUM.ZERO)) {
            if (stryMutAct_9fa48("166920")) {
              {}
            } else {
              stryCov_9fa48("166920");
              return normalizedFallback;
            }
          }
        }
      }
      throw new Error(OPERATION_LANE_ERROR_MSG.OWNER_KEY_REQUIRED);
    }
  }

  /**
   * Run one owner-scoped execution through the shared single-flight gate.
   * @param {Object|string} context
   * @param {Function} executionFactory
   * @return {Promise<*>}
   */
  run(context, executionFactory) {
    if (stryMutAct_9fa48("166921")) {
      {}
    } else {
      stryCov_9fa48("166921");
      if (stryMutAct_9fa48("166924") ? typeof executionFactory === TYPEOF.FUNCTION : stryMutAct_9fa48("166923") ? false : stryMutAct_9fa48("166922") ? true : (stryCov_9fa48("166922", "166923", "166924"), typeof executionFactory !== TYPEOF.FUNCTION)) {
        if (stryMutAct_9fa48("166925")) {
          {}
        } else {
          stryCov_9fa48("166925");
          throw new Error(OPERATION_LANE_ERROR_MSG.EXECUTION_FACTORY_REQUIRED);
        }
      }
      const normalizedContext = (stryMutAct_9fa48("166928") ? typeof context !== TYPEOF.STRING : stryMutAct_9fa48("166927") ? false : stryMutAct_9fa48("166926") ? true : (stryCov_9fa48("166926", "166927", "166928"), typeof context === TYPEOF.STRING)) ? stryMutAct_9fa48("166929") ? {} : (stryCov_9fa48("166929"), {
        ownerKey: context
      }) : stryMutAct_9fa48("166932") ? context && {} : stryMutAct_9fa48("166931") ? false : stryMutAct_9fa48("166930") ? true : (stryCov_9fa48("166930", "166931", "166932"), context || {});
      const ownerKey = this.resolveOwnerKey(normalizedContext);
      return this.workflowCoordinator.runExclusive(ownerKey, async () => {
        if (stryMutAct_9fa48("166933")) {
          {}
        } else {
          stryCov_9fa48("166933");
          const timeoutBudget = this.timeoutPolicy ? this.timeoutPolicy.allocateOrThrow(normalizedContext) : stryMutAct_9fa48("166936") ? normalizedContext.timeoutBudget && null : stryMutAct_9fa48("166935") ? false : stryMutAct_9fa48("166934") ? true : (stryCov_9fa48("166934", "166935", "166936"), normalizedContext.timeoutBudget || null);
          return executionFactory(stryMutAct_9fa48("166937") ? {} : (stryCov_9fa48("166937"), {
            laneName: this.name,
            ownerKey,
            timeoutBudget,
            context: normalizedContext
          }));
        }
      });
    }
  }
}
export { OperationLane };