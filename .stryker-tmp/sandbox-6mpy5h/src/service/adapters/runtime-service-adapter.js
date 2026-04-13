/**
 * Service-type adapter for runtime-backed userland services.
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
import { RUNTIME_FIELD, TYPEOF, UNIFIED_SERVICE_TYPE } from '../../constants/index.js';
import { validateRuntimeDescriptor } from '../../wasm-service/runtime-descriptor-validator.js';
import { ServiceTypeAdapter } from '../service-type-adapter.js';
const RUNTIME_ADAPTER_ERROR = Object.freeze(stryMutAct_9fa48("149836") ? {} : (stryCov_9fa48("149836"), {
  LIFECYCLE_REQUIRED: stryMutAct_9fa48("149837") ? "" : (stryCov_9fa48("149837"), 'runtime adapter requires serviceRuntimeLifecycle with prepare/start/stop/health')
}));
function hasRuntimeLifecycleContract(serviceRuntimeLifecycle) {
  if (stryMutAct_9fa48("149838")) {
    {}
  } else {
    stryCov_9fa48("149838");
    return stryMutAct_9fa48("149841") ? serviceRuntimeLifecycle && typeof serviceRuntimeLifecycle.prepare === TYPEOF.FUNCTION && typeof serviceRuntimeLifecycle.start === TYPEOF.FUNCTION && typeof serviceRuntimeLifecycle.stop === TYPEOF.FUNCTION || typeof serviceRuntimeLifecycle.health === TYPEOF.FUNCTION : stryMutAct_9fa48("149840") ? false : stryMutAct_9fa48("149839") ? true : (stryCov_9fa48("149839", "149840", "149841"), (stryMutAct_9fa48("149843") ? serviceRuntimeLifecycle && typeof serviceRuntimeLifecycle.prepare === TYPEOF.FUNCTION && typeof serviceRuntimeLifecycle.start === TYPEOF.FUNCTION || typeof serviceRuntimeLifecycle.stop === TYPEOF.FUNCTION : stryMutAct_9fa48("149842") ? true : (stryCov_9fa48("149842", "149843"), (stryMutAct_9fa48("149845") ? serviceRuntimeLifecycle && typeof serviceRuntimeLifecycle.prepare === TYPEOF.FUNCTION || typeof serviceRuntimeLifecycle.start === TYPEOF.FUNCTION : stryMutAct_9fa48("149844") ? true : (stryCov_9fa48("149844", "149845"), (stryMutAct_9fa48("149847") ? serviceRuntimeLifecycle || typeof serviceRuntimeLifecycle.prepare === TYPEOF.FUNCTION : stryMutAct_9fa48("149846") ? true : (stryCov_9fa48("149846", "149847"), serviceRuntimeLifecycle && (stryMutAct_9fa48("149849") ? typeof serviceRuntimeLifecycle.prepare !== TYPEOF.FUNCTION : stryMutAct_9fa48("149848") ? true : (stryCov_9fa48("149848", "149849"), typeof serviceRuntimeLifecycle.prepare === TYPEOF.FUNCTION)))) && (stryMutAct_9fa48("149851") ? typeof serviceRuntimeLifecycle.start !== TYPEOF.FUNCTION : stryMutAct_9fa48("149850") ? true : (stryCov_9fa48("149850", "149851"), typeof serviceRuntimeLifecycle.start === TYPEOF.FUNCTION)))) && (stryMutAct_9fa48("149853") ? typeof serviceRuntimeLifecycle.stop !== TYPEOF.FUNCTION : stryMutAct_9fa48("149852") ? true : (stryCov_9fa48("149852", "149853"), typeof serviceRuntimeLifecycle.stop === TYPEOF.FUNCTION)))) && (stryMutAct_9fa48("149855") ? typeof serviceRuntimeLifecycle.health !== TYPEOF.FUNCTION : stryMutAct_9fa48("149854") ? true : (stryCov_9fa48("149854", "149855"), typeof serviceRuntimeLifecycle.health === TYPEOF.FUNCTION)));
  }
}
class RuntimeServiceAdapter extends ServiceTypeAdapter {
  /**
   * @param {Object} options
   * @param {Object} options.serviceRuntimeLifecycle
   */
  constructor(options = {}) {
    if (stryMutAct_9fa48("149856")) {
      {}
    } else {
      stryCov_9fa48("149856");
      super(UNIFIED_SERVICE_TYPE.RUNTIME_SERVICE);
      if (stryMutAct_9fa48("149859") ? false : stryMutAct_9fa48("149858") ? true : stryMutAct_9fa48("149857") ? hasRuntimeLifecycleContract(options.serviceRuntimeLifecycle) : (stryCov_9fa48("149857", "149858", "149859"), !hasRuntimeLifecycleContract(options.serviceRuntimeLifecycle))) {
        if (stryMutAct_9fa48("149860")) {
          {}
        } else {
          stryCov_9fa48("149860");
          throw new TypeError(RUNTIME_ADAPTER_ERROR.LIFECYCLE_REQUIRED);
        }
      }
      this._serviceRuntimeLifecycle = options.serviceRuntimeLifecycle;
    }
  }

  /**
   * @param {Object} definition
   * @return {{valid: boolean, errors?: string[]}}
   */
  validateDefinition(definition) {
    if (stryMutAct_9fa48("149861")) {
      {}
    } else {
      stryCov_9fa48("149861");
      const validation = validateRuntimeDescriptor(stryMutAct_9fa48("149862") ? {} : (stryCov_9fa48("149862"), {
        runtimeKind: stryMutAct_9fa48("149863") ? definition[RUNTIME_FIELD.RUNTIME_KIND] : (stryCov_9fa48("149863"), definition?.[RUNTIME_FIELD.RUNTIME_KIND]),
        runtimeRef: stryMutAct_9fa48("149866") ? definition?.[RUNTIME_FIELD.RUNTIME_REF] && null : stryMutAct_9fa48("149865") ? false : stryMutAct_9fa48("149864") ? true : (stryCov_9fa48("149864", "149865", "149866"), (stryMutAct_9fa48("149867") ? definition[RUNTIME_FIELD.RUNTIME_REF] : (stryCov_9fa48("149867"), definition?.[RUNTIME_FIELD.RUNTIME_REF])) || null),
        runtimeConfig: stryMutAct_9fa48("149870") ? definition?.[RUNTIME_FIELD.RUNTIME_CONFIG] && null : stryMutAct_9fa48("149869") ? false : stryMutAct_9fa48("149868") ? true : (stryCov_9fa48("149868", "149869", "149870"), (stryMutAct_9fa48("149871") ? definition[RUNTIME_FIELD.RUNTIME_CONFIG] : (stryCov_9fa48("149871"), definition?.[RUNTIME_FIELD.RUNTIME_CONFIG])) || null)
      }));
      if (stryMutAct_9fa48("149874") ? false : stryMutAct_9fa48("149873") ? true : stryMutAct_9fa48("149872") ? validation.valid : (stryCov_9fa48("149872", "149873", "149874"), !validation.valid)) {
        if (stryMutAct_9fa48("149875")) {
          {}
        } else {
          stryCov_9fa48("149875");
          return stryMutAct_9fa48("149876") ? {} : (stryCov_9fa48("149876"), {
            valid: stryMutAct_9fa48("149877") ? true : (stryCov_9fa48("149877"), false),
            errors: validation.errors
          });
        }
      }
      return stryMutAct_9fa48("149878") ? {} : (stryCov_9fa48("149878"), {
        valid: stryMutAct_9fa48("149879") ? false : (stryCov_9fa48("149879"), true)
      });
    }
  }

  /**
   * Runtime create maps to runtime prepare.
   *
   * @param {Object} context
   * @return {Promise<Object>}
   */
  async createReplica(context) {
    if (stryMutAct_9fa48("149880")) {
      {}
    } else {
      stryCov_9fa48("149880");
      const definition = stryMutAct_9fa48("149883") ? context?.definition && context : stryMutAct_9fa48("149882") ? false : stryMutAct_9fa48("149881") ? true : (stryCov_9fa48("149881", "149882", "149883"), (stryMutAct_9fa48("149884") ? context.definition : (stryCov_9fa48("149884"), context?.definition)) || context);
      return this._serviceRuntimeLifecycle.prepare(definition, context);
    }
  }

  /**
   * @param {Object} replicaHandle
   * @param {Object} _context
   * @return {Promise<Object>}
   */
  async startReplica(replicaHandle, _context) {
    if (stryMutAct_9fa48("149885")) {
      {}
    } else {
      stryCov_9fa48("149885");
      return this._serviceRuntimeLifecycle.start(replicaHandle);
    }
  }

  /**
   * @param {Object} replicaHandle
   * @param {Object} _context
   * @return {Promise<Object>}
   */
  async stopReplica(replicaHandle, _context) {
    if (stryMutAct_9fa48("149886")) {
      {}
    } else {
      stryCov_9fa48("149886");
      return this._serviceRuntimeLifecycle.stop(replicaHandle);
    }
  }

  /**
   * @param {Object} replicaHandle
   * @param {Object} _context
   * @return {Promise<Object>}
   */
  async health(replicaHandle, _context) {
    if (stryMutAct_9fa48("149887")) {
      {}
    } else {
      stryCov_9fa48("149887");
      return this._serviceRuntimeLifecycle.health(replicaHandle);
    }
  }
}
export { RuntimeServiceAdapter };