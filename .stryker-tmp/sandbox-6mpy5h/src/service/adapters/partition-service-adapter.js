/**
 * Service-type adapter for partition replicas.
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
import { SERVICE_LIFECYCLE_STATE, TYPEOF, UNIFIED_SERVICE_TYPE } from '../../constants/index.js';
import { ServiceTypeAdapter } from '../service-type-adapter.js';
const PARTITION_ADAPTER_ERROR = Object.freeze(stryMutAct_9fa48("149796") ? {} : (stryCov_9fa48("149796"), {
  CREATE_REQUIRED: stryMutAct_9fa48("149797") ? "" : (stryCov_9fa48("149797"), 'partition adapter requires createReplica hook'),
  START_REQUIRED: stryMutAct_9fa48("149798") ? "" : (stryCov_9fa48("149798"), 'partition adapter requires startReplica hook'),
  STOP_REQUIRED: stryMutAct_9fa48("149799") ? "" : (stryCov_9fa48("149799"), 'partition adapter requires stopReplica hook'),
  HOOK_MUST_BE_FUNCTION: stryMutAct_9fa48("149800") ? "" : (stryCov_9fa48("149800"), 'adapter hook must be a function')
}));
function assertFunctionHook(value, errorMessage) {
  if (stryMutAct_9fa48("149801")) {
    {}
  } else {
    stryCov_9fa48("149801");
    if (stryMutAct_9fa48("149804") ? typeof value === TYPEOF.FUNCTION : stryMutAct_9fa48("149803") ? false : stryMutAct_9fa48("149802") ? true : (stryCov_9fa48("149802", "149803", "149804"), typeof value !== TYPEOF.FUNCTION)) {
      if (stryMutAct_9fa48("149805")) {
        {}
      } else {
        stryCov_9fa48("149805");
        throw new TypeError(errorMessage);
      }
    }
  }
}
class PartitionServiceAdapter extends ServiceTypeAdapter {
  /**
   * @param {Object} hooks
   * @param {Function} hooks.createReplica
   * @param {Function} hooks.startReplica
   * @param {Function} hooks.stopReplica
   * @param {Function} [hooks.validateDefinition]
   * @param {Function} [hooks.health]
   */
  constructor(hooks = {}) {
    if (stryMutAct_9fa48("149806")) {
      {}
    } else {
      stryCov_9fa48("149806");
      super(UNIFIED_SERVICE_TYPE.PARTITION);
      assertFunctionHook(hooks.createReplica, PARTITION_ADAPTER_ERROR.CREATE_REQUIRED);
      assertFunctionHook(hooks.startReplica, PARTITION_ADAPTER_ERROR.START_REQUIRED);
      assertFunctionHook(hooks.stopReplica, PARTITION_ADAPTER_ERROR.STOP_REQUIRED);
      if (stryMutAct_9fa48("149809") ? hooks.validateDefinition || typeof hooks.validateDefinition !== TYPEOF.FUNCTION : stryMutAct_9fa48("149808") ? false : stryMutAct_9fa48("149807") ? true : (stryCov_9fa48("149807", "149808", "149809"), hooks.validateDefinition && (stryMutAct_9fa48("149811") ? typeof hooks.validateDefinition === TYPEOF.FUNCTION : stryMutAct_9fa48("149810") ? true : (stryCov_9fa48("149810", "149811"), typeof hooks.validateDefinition !== TYPEOF.FUNCTION)))) {
        if (stryMutAct_9fa48("149812")) {
          {}
        } else {
          stryCov_9fa48("149812");
          throw new TypeError(PARTITION_ADAPTER_ERROR.HOOK_MUST_BE_FUNCTION);
        }
      }
      if (stryMutAct_9fa48("149815") ? hooks.health || typeof hooks.health !== TYPEOF.FUNCTION : stryMutAct_9fa48("149814") ? false : stryMutAct_9fa48("149813") ? true : (stryCov_9fa48("149813", "149814", "149815"), hooks.health && (stryMutAct_9fa48("149817") ? typeof hooks.health === TYPEOF.FUNCTION : stryMutAct_9fa48("149816") ? true : (stryCov_9fa48("149816", "149817"), typeof hooks.health !== TYPEOF.FUNCTION)))) {
        if (stryMutAct_9fa48("149818")) {
          {}
        } else {
          stryCov_9fa48("149818");
          throw new TypeError(PARTITION_ADAPTER_ERROR.HOOK_MUST_BE_FUNCTION);
        }
      }
      this._hooks = stryMutAct_9fa48("149819") ? {} : (stryCov_9fa48("149819"), {
        validateDefinition: stryMutAct_9fa48("149822") ? hooks.validateDefinition && (_definition => ({
          valid: true
        })) : stryMutAct_9fa48("149821") ? false : stryMutAct_9fa48("149820") ? true : (stryCov_9fa48("149820", "149821", "149822"), hooks.validateDefinition || (stryMutAct_9fa48("149823") ? () => undefined : (stryCov_9fa48("149823"), _definition => stryMutAct_9fa48("149824") ? {} : (stryCov_9fa48("149824"), {
          valid: stryMutAct_9fa48("149825") ? false : (stryCov_9fa48("149825"), true)
        })))),
        createReplica: hooks.createReplica,
        startReplica: hooks.startReplica,
        stopReplica: hooks.stopReplica,
        health: stryMutAct_9fa48("149828") ? hooks.health && (async (_replicaHandle, _context) => ({
          status: SERVICE_LIFECYCLE_STATE.RUNNING
        })) : stryMutAct_9fa48("149827") ? false : stryMutAct_9fa48("149826") ? true : (stryCov_9fa48("149826", "149827", "149828"), hooks.health || (stryMutAct_9fa48("149829") ? () => undefined : (stryCov_9fa48("149829"), async (_replicaHandle, _context) => stryMutAct_9fa48("149830") ? {} : (stryCov_9fa48("149830"), {
          status: SERVICE_LIFECYCLE_STATE.RUNNING
        }))))
      });
    }
  }

  /**
   * @param {Object} definition
   * @return {{valid: boolean, errors?: string[]}}
   */
  validateDefinition(definition) {
    if (stryMutAct_9fa48("149831")) {
      {}
    } else {
      stryCov_9fa48("149831");
      return this._hooks.validateDefinition(definition);
    }
  }

  /**
   * @param {Object} context
   * @return {Promise<Object>}
   */
  async createReplica(context) {
    if (stryMutAct_9fa48("149832")) {
      {}
    } else {
      stryCov_9fa48("149832");
      return this._hooks.createReplica(context);
    }
  }

  /**
   * @param {Object} replicaHandle
   * @param {Object} context
   * @return {Promise<Object>}
   */
  async startReplica(replicaHandle, context) {
    if (stryMutAct_9fa48("149833")) {
      {}
    } else {
      stryCov_9fa48("149833");
      return this._hooks.startReplica(replicaHandle, context);
    }
  }

  /**
   * @param {Object} replicaHandle
   * @param {Object} context
   * @return {Promise<Object>}
   */
  async stopReplica(replicaHandle, context) {
    if (stryMutAct_9fa48("149834")) {
      {}
    } else {
      stryCov_9fa48("149834");
      return this._hooks.stopReplica(replicaHandle, context);
    }
  }

  /**
   * @param {Object} replicaHandle
   * @param {Object} context
   * @return {Promise<Object>}
   */
  async health(replicaHandle, context) {
    if (stryMutAct_9fa48("149835")) {
      {}
    } else {
      stryCov_9fa48("149835");
      return this._hooks.health(replicaHandle, context);
    }
  }
}
export { PartitionServiceAdapter };