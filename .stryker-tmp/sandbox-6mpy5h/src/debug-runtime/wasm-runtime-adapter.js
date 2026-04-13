/**
 * WasmRuntimeAdapter contract and initial in-process backend.
 *
 * Track B foundation introduces a single runtime adapter owner
 * for instantiate/execute/suspend/inspect lifecycle.
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
import { NUM, TYPEOF } from '../constants/index.js';
import { WASM_RUNTIME_ADAPTER_KIND, WASM_RUNTIME_OPERATION as OP, WASM_RUNTIME_ADAPTER_STATE as STATE, WASM_RUNTIME_DEFAULT, WASM_RUNTIME_ADAPTER_ERROR_MSG as ERR } from './debug-runtime-constants.js';
const DEFAULT_RUNTIME_OPTIONS = Object.freeze(stryMutAct_9fa48("78587") ? {} : (stryCov_9fa48("78587"), {
  timeoutMs: WASM_RUNTIME_DEFAULT.EXECUTION_TIMEOUT_MS
}));

/**
 * @typedef {Object} WasmRuntimeInstantiateRequest
 * @property {string} moduleRef - Stable module reference.
 * @property {Object} moduleEntry - Module payload with manifest/exports.
 * @property {Object<string, Object>} [imports] - Host import modules.
 * @property {Object} [options] - Adapter-specific options.
 */

/**
 * @typedef {Object} WasmRuntimeInstanceHandle
 * @property {string} instanceId - Adapter-local instance identifier.
 * @property {string} moduleRef - Module reference tied to the instance.
 */

/**
 * @typedef {Object} WasmRuntimeExecuteRequest
 * @property {WasmRuntimeInstanceHandle} instanceHandle - Target runtime instance.
 * @property {Object} manifest - Module manifest.
 * @property {string} [runExport] - Override run export name.
 * @property {Object} [context] - Execution context.
 * @property {Object} [args] - Invocation args.
 * @property {Object} [options] - Execution options.
 * @property {number} [options.timeoutMs] - Timeout override in milliseconds.
 * @property {Object} [options.cancellationToken] - Cancellation token.
 * @property {Object} [options.runtimeOptions] - Third-parameter options to run_export.
 */

/**
 * @typedef {Object} WasmRuntimeExecuteResult
 * @property {*} result - Handler return value.
 * @property {Array} mutations - Reserved mutation output.
 * @property {number} durationMs - Execution duration.
 * @property {WasmRuntimeInstanceHandle} instanceHandle - Instance handle.
 */

/**
 * Abstract runtime adapter contract.
 */
class WasmRuntimeAdapter {
  /**
   * @param {string} kind - Adapter kind identifier.
   */
  constructor(kind) {
    if (stryMutAct_9fa48("78588")) {
      {}
    } else {
      stryCov_9fa48("78588");
      if (stryMutAct_9fa48("78591") ? new.target !== WasmRuntimeAdapter : stryMutAct_9fa48("78590") ? false : stryMutAct_9fa48("78589") ? true : (stryCov_9fa48("78589", "78590", "78591"), new.target === WasmRuntimeAdapter)) {
        if (stryMutAct_9fa48("78592")) {
          {}
        } else {
          stryCov_9fa48("78592");
          throw new Error(ERR.ABSTRACT_CLASS);
        }
      }
      this.kind = stryMutAct_9fa48("78595") ? kind && WASM_RUNTIME_ADAPTER_KIND.ABSTRACT : stryMutAct_9fa48("78594") ? false : stryMutAct_9fa48("78593") ? true : (stryCov_9fa48("78593", "78594", "78595"), kind || WASM_RUNTIME_ADAPTER_KIND.ABSTRACT);
      Object.defineProperty(this, stryMutAct_9fa48("78596") ? "" : (stryCov_9fa48("78596"), 'kind'), stryMutAct_9fa48("78597") ? {} : (stryCov_9fa48("78597"), {
        writable: stryMutAct_9fa48("78598") ? true : (stryCov_9fa48("78598"), false),
        configurable: stryMutAct_9fa48("78599") ? true : (stryCov_9fa48("78599"), false)
      }));
    }
  }

  /**
   * Throw a contract "not implemented" error for a method.
   *
   * @param {string} methodName - Method that must be implemented.
   * @throws {Error}
   * @protected
   */
  _notImplemented(methodName) {
    if (stryMutAct_9fa48("78600")) {
      {}
    } else {
      stryCov_9fa48("78600");
      throw new Error(stryMutAct_9fa48("78601") ? ERR.METHOD_NOT_IMPLEMENTED - methodName : (stryCov_9fa48("78601"), ERR.METHOD_NOT_IMPLEMENTED + methodName));
    }
  }

  /**
   * @param {WasmRuntimeInstantiateRequest} _request
   * @return {Promise<{instanceHandle: WasmRuntimeInstanceHandle, createdAt: number}>}
   */
  async createInstance(_request) {
    if (stryMutAct_9fa48("78602")) {
      {}
    } else {
      stryCov_9fa48("78602");
      this._notImplemented(OP.CREATE_INSTANCE);
    }
  }

  /**
   * @param {WasmRuntimeExecuteRequest} _request
   * @return {Promise<WasmRuntimeExecuteResult>}
   */
  async execute(_request) {
    if (stryMutAct_9fa48("78603")) {
      {}
    } else {
      stryCov_9fa48("78603");
      this._notImplemented(OP.EXECUTE);
    }
  }

  /**
   * @param {{instanceHandle: WasmRuntimeInstanceHandle, reason?: string}} _request
   * @return {Promise<{status: string, instanceHandle: WasmRuntimeInstanceHandle}>}
   */
  async suspend(_request) {
    if (stryMutAct_9fa48("78604")) {
      {}
    } else {
      stryCov_9fa48("78604");
      this._notImplemented(OP.SUSPEND);
    }
  }

  /**
   * @param {{instanceHandle: WasmRuntimeInstanceHandle}} _request
   * @return {Promise<{status: string, instanceHandle: WasmRuntimeInstanceHandle}>}
   */
  async resume(_request) {
    if (stryMutAct_9fa48("78605")) {
      {}
    } else {
      stryCov_9fa48("78605");
      this._notImplemented(OP.RESUME);
    }
  }

  /**
   * @param {{instanceHandle: WasmRuntimeInstanceHandle}} _request
   * @return {Promise<Object>}
   */
  async inspect(_request) {
    if (stryMutAct_9fa48("78606")) {
      {}
    } else {
      stryCov_9fa48("78606");
      this._notImplemented(OP.INSPECT);
    }
  }

  /**
   * @param {WasmRuntimeInstanceHandle} _instanceHandle
   * @return {Promise<{destroyed: boolean, instanceHandle: WasmRuntimeInstanceHandle}>}
   */
  async destroyInstance(_instanceHandle) {
    if (stryMutAct_9fa48("78607")) {
      {}
    } else {
      stryCov_9fa48("78607");
      this._notImplemented(OP.DESTROY_INSTANCE);
    }
  }
}

/**
 * Resolve and validate instance handle from a request.
 *
 * @param {Map<string, Object>} instances - Instance map.
 * @param {{instanceHandle?: WasmRuntimeInstanceHandle}} request
 * @return {Object} Instance record.
 */
function getInstanceRecord(instances, request) {
  if (stryMutAct_9fa48("78608")) {
    {}
  } else {
    stryCov_9fa48("78608");
    if (stryMutAct_9fa48("78611") ? !request && typeof request !== TYPEOF.OBJECT : stryMutAct_9fa48("78610") ? false : stryMutAct_9fa48("78609") ? true : (stryCov_9fa48("78609", "78610", "78611"), (stryMutAct_9fa48("78612") ? request : (stryCov_9fa48("78612"), !request)) || (stryMutAct_9fa48("78614") ? typeof request === TYPEOF.OBJECT : stryMutAct_9fa48("78613") ? false : (stryCov_9fa48("78613", "78614"), typeof request !== TYPEOF.OBJECT)))) {
      if (stryMutAct_9fa48("78615")) {
        {}
      } else {
        stryCov_9fa48("78615");
        throw new Error(ERR.REQUEST_REQUIRED);
      }
    }
    if (stryMutAct_9fa48("78618") ? !request.instanceHandle && typeof request.instanceHandle !== TYPEOF.OBJECT : stryMutAct_9fa48("78617") ? false : stryMutAct_9fa48("78616") ? true : (stryCov_9fa48("78616", "78617", "78618"), (stryMutAct_9fa48("78619") ? request.instanceHandle : (stryCov_9fa48("78619"), !request.instanceHandle)) || (stryMutAct_9fa48("78621") ? typeof request.instanceHandle === TYPEOF.OBJECT : stryMutAct_9fa48("78620") ? false : (stryCov_9fa48("78620", "78621"), typeof request.instanceHandle !== TYPEOF.OBJECT)))) {
      if (stryMutAct_9fa48("78622")) {
        {}
      } else {
        stryCov_9fa48("78622");
        throw new Error(ERR.INSTANCE_HANDLE_REQUIRED);
      }
    }
    const instanceId = request.instanceHandle.instanceId;
    if (stryMutAct_9fa48("78625") ? !instanceId && typeof instanceId !== TYPEOF.STRING : stryMutAct_9fa48("78624") ? false : stryMutAct_9fa48("78623") ? true : (stryCov_9fa48("78623", "78624", "78625"), (stryMutAct_9fa48("78626") ? instanceId : (stryCov_9fa48("78626"), !instanceId)) || (stryMutAct_9fa48("78628") ? typeof instanceId === TYPEOF.STRING : stryMutAct_9fa48("78627") ? false : (stryCov_9fa48("78627", "78628"), typeof instanceId !== TYPEOF.STRING)))) {
      if (stryMutAct_9fa48("78629")) {
        {}
      } else {
        stryCov_9fa48("78629");
        throw new Error(ERR.INSTANCE_ID_REQUIRED);
      }
    }
    const record = stryMutAct_9fa48("78632") ? instances.get(instanceId) && null : stryMutAct_9fa48("78631") ? false : stryMutAct_9fa48("78630") ? true : (stryCov_9fa48("78630", "78631", "78632"), instances.get(instanceId) || null);
    if (stryMutAct_9fa48("78635") ? false : stryMutAct_9fa48("78634") ? true : stryMutAct_9fa48("78633") ? record : (stryCov_9fa48("78633", "78634", "78635"), !record)) {
      if (stryMutAct_9fa48("78636")) {
        {}
      } else {
        stryCov_9fa48("78636");
        throw new Error(stryMutAct_9fa48("78637") ? ERR.INSTANCE_NOT_FOUND - instanceId : (stryCov_9fa48("78637"), ERR.INSTANCE_NOT_FOUND + instanceId));
      }
    }
    return record;
  }
}

/**
 * In-process runtime adapter that executes run_export directly
 * from moduleEntry.exports while conforming to the runtime
 * adapter contract.
 */
class InProcessWasmRuntimeAdapter extends WasmRuntimeAdapter {
  /**
   * @param {Object} [options]
   * @param {Function} [options.now] - Clock provider.
   * @param {Function} [options.setTimeoutFn] - Timeout function.
   * @param {Function} [options.clearTimeoutFn] - Timeout cleanup function.
   * @param {number} [options.defaultExecutionTimeoutMs] - Default timeout.
   */
  constructor(options = {}) {
    if (stryMutAct_9fa48("78638")) {
      {}
    } else {
      stryCov_9fa48("78638");
      super(WASM_RUNTIME_ADAPTER_KIND.IN_PROCESS);
      this._instances = new Map();
      this._nextInstanceId = NUM.ONE;
      this._now = stryMutAct_9fa48("78641") ? options.now && (() => Date.now()) : stryMutAct_9fa48("78640") ? false : stryMutAct_9fa48("78639") ? true : (stryCov_9fa48("78639", "78640", "78641"), options.now || (stryMutAct_9fa48("78642") ? () => undefined : (stryCov_9fa48("78642"), () => Date.now())));
      this._setTimeoutFn = stryMutAct_9fa48("78645") ? options.setTimeoutFn && setTimeout : stryMutAct_9fa48("78644") ? false : stryMutAct_9fa48("78643") ? true : (stryCov_9fa48("78643", "78644", "78645"), options.setTimeoutFn || setTimeout);
      this._clearTimeoutFn = stryMutAct_9fa48("78648") ? options.clearTimeoutFn && clearTimeout : stryMutAct_9fa48("78647") ? false : stryMutAct_9fa48("78646") ? true : (stryCov_9fa48("78646", "78647", "78648"), options.clearTimeoutFn || clearTimeout);
      this._defaultExecutionTimeoutMs = stryMutAct_9fa48("78649") ? options.defaultExecutionTimeoutMs && DEFAULT_RUNTIME_OPTIONS.timeoutMs : (stryCov_9fa48("78649"), options.defaultExecutionTimeoutMs ?? DEFAULT_RUNTIME_OPTIONS.timeoutMs);
    }
  }

  /**
   * @param {WasmRuntimeInstantiateRequest} request
   * @return {Promise<{instanceHandle: WasmRuntimeInstanceHandle, createdAt: number}>}
   */
  async createInstance(request) {
    if (stryMutAct_9fa48("78650")) {
      {}
    } else {
      stryCov_9fa48("78650");
      if (stryMutAct_9fa48("78653") ? !request && typeof request !== TYPEOF.OBJECT : stryMutAct_9fa48("78652") ? false : stryMutAct_9fa48("78651") ? true : (stryCov_9fa48("78651", "78652", "78653"), (stryMutAct_9fa48("78654") ? request : (stryCov_9fa48("78654"), !request)) || (stryMutAct_9fa48("78656") ? typeof request === TYPEOF.OBJECT : stryMutAct_9fa48("78655") ? false : (stryCov_9fa48("78655", "78656"), typeof request !== TYPEOF.OBJECT)))) {
        if (stryMutAct_9fa48("78657")) {
          {}
        } else {
          stryCov_9fa48("78657");
          throw new Error(ERR.REQUEST_REQUIRED);
        }
      }
      if (stryMutAct_9fa48("78660") ? (!request.moduleRef || typeof request.moduleRef !== TYPEOF.STRING) && request.moduleRef.trim().length === NUM.ZERO : stryMutAct_9fa48("78659") ? false : stryMutAct_9fa48("78658") ? true : (stryCov_9fa48("78658", "78659", "78660"), (stryMutAct_9fa48("78662") ? !request.moduleRef && typeof request.moduleRef !== TYPEOF.STRING : stryMutAct_9fa48("78661") ? false : (stryCov_9fa48("78661", "78662"), (stryMutAct_9fa48("78663") ? request.moduleRef : (stryCov_9fa48("78663"), !request.moduleRef)) || (stryMutAct_9fa48("78665") ? typeof request.moduleRef === TYPEOF.STRING : stryMutAct_9fa48("78664") ? false : (stryCov_9fa48("78664", "78665"), typeof request.moduleRef !== TYPEOF.STRING)))) || (stryMutAct_9fa48("78667") ? request.moduleRef.trim().length !== NUM.ZERO : stryMutAct_9fa48("78666") ? false : (stryCov_9fa48("78666", "78667"), (stryMutAct_9fa48("78668") ? request.moduleRef.length : (stryCov_9fa48("78668"), request.moduleRef.trim().length)) === NUM.ZERO)))) {
        if (stryMutAct_9fa48("78669")) {
          {}
        } else {
          stryCov_9fa48("78669");
          throw new Error(ERR.MODULE_REF_REQUIRED);
        }
      }
      if (stryMutAct_9fa48("78672") ? !request.moduleEntry && typeof request.moduleEntry !== TYPEOF.OBJECT : stryMutAct_9fa48("78671") ? false : stryMutAct_9fa48("78670") ? true : (stryCov_9fa48("78670", "78671", "78672"), (stryMutAct_9fa48("78673") ? request.moduleEntry : (stryCov_9fa48("78673"), !request.moduleEntry)) || (stryMutAct_9fa48("78675") ? typeof request.moduleEntry === TYPEOF.OBJECT : stryMutAct_9fa48("78674") ? false : (stryCov_9fa48("78674", "78675"), typeof request.moduleEntry !== TYPEOF.OBJECT)))) {
        if (stryMutAct_9fa48("78676")) {
          {}
        } else {
          stryCov_9fa48("78676");
          throw new Error(ERR.MODULE_ENTRY_REQUIRED);
        }
      }
      const instanceId = stryMutAct_9fa48("78677") ? `` : (stryCov_9fa48("78677"), `wr-${stryMutAct_9fa48("78678") ? this._nextInstanceId-- : (stryCov_9fa48("78678"), this._nextInstanceId++)}`);
      const createdAt = this._now();
      const record = stryMutAct_9fa48("78679") ? {} : (stryCov_9fa48("78679"), {
        instanceId,
        moduleRef: request.moduleRef,
        moduleEntry: request.moduleEntry,
        imports: stryMutAct_9fa48("78682") ? request.imports && {} : stryMutAct_9fa48("78681") ? false : stryMutAct_9fa48("78680") ? true : (stryCov_9fa48("78680", "78681", "78682"), request.imports || {}),
        createdAt,
        state: STATE.RUNNING,
        suspendReason: null
      });
      this._instances.set(instanceId, record);
      return stryMutAct_9fa48("78683") ? {} : (stryCov_9fa48("78683"), {
        instanceHandle: stryMutAct_9fa48("78684") ? {} : (stryCov_9fa48("78684"), {
          instanceId,
          moduleRef: request.moduleRef
        }),
        createdAt
      });
    }
  }

  /**
   * @param {WasmRuntimeExecuteRequest} request
   * @return {Promise<WasmRuntimeExecuteResult>}
   */
  async execute(request) {
    if (stryMutAct_9fa48("78685")) {
      {}
    } else {
      stryCov_9fa48("78685");
      const record = getInstanceRecord(this._instances, request);
      const manifest = stryMutAct_9fa48("78688") ? request.manifest && record.moduleEntry.manifest : stryMutAct_9fa48("78687") ? false : stryMutAct_9fa48("78686") ? true : (stryCov_9fa48("78686", "78687", "78688"), request.manifest || record.moduleEntry.manifest);
      if (stryMutAct_9fa48("78691") ? !manifest && typeof manifest !== TYPEOF.OBJECT : stryMutAct_9fa48("78690") ? false : stryMutAct_9fa48("78689") ? true : (stryCov_9fa48("78689", "78690", "78691"), (stryMutAct_9fa48("78692") ? manifest : (stryCov_9fa48("78692"), !manifest)) || (stryMutAct_9fa48("78694") ? typeof manifest === TYPEOF.OBJECT : stryMutAct_9fa48("78693") ? false : (stryCov_9fa48("78693", "78694"), typeof manifest !== TYPEOF.OBJECT)))) {
        if (stryMutAct_9fa48("78695")) {
          {}
        } else {
          stryCov_9fa48("78695");
          throw new Error(ERR.MANIFEST_REQUIRED);
        }
      }
      const runExport = stryMutAct_9fa48("78698") ? request.runExport && manifest.runExport : stryMutAct_9fa48("78697") ? false : stryMutAct_9fa48("78696") ? true : (stryCov_9fa48("78696", "78697", "78698"), request.runExport || manifest.runExport);
      if (stryMutAct_9fa48("78701") ? !runExport && typeof runExport !== TYPEOF.STRING : stryMutAct_9fa48("78700") ? false : stryMutAct_9fa48("78699") ? true : (stryCov_9fa48("78699", "78700", "78701"), (stryMutAct_9fa48("78702") ? runExport : (stryCov_9fa48("78702"), !runExport)) || (stryMutAct_9fa48("78704") ? typeof runExport === TYPEOF.STRING : stryMutAct_9fa48("78703") ? false : (stryCov_9fa48("78703", "78704"), typeof runExport !== TYPEOF.STRING)))) {
        if (stryMutAct_9fa48("78705")) {
          {}
        } else {
          stryCov_9fa48("78705");
          throw new Error(ERR.RUN_EXPORT_REQUIRED);
        }
      }
      const moduleExports = record.moduleEntry.exports;
      if (stryMutAct_9fa48("78708") ? !moduleExports && !(runExport in moduleExports) : stryMutAct_9fa48("78707") ? false : stryMutAct_9fa48("78706") ? true : (stryCov_9fa48("78706", "78707", "78708"), (stryMutAct_9fa48("78709") ? moduleExports : (stryCov_9fa48("78709"), !moduleExports)) || (stryMutAct_9fa48("78710") ? runExport in moduleExports : (stryCov_9fa48("78710"), !(runExport in moduleExports))))) {
        if (stryMutAct_9fa48("78711")) {
          {}
        } else {
          stryCov_9fa48("78711");
          throw new Error(ERR.RUN_EXPORT_NOT_FOUND);
        }
      }
      const handler = moduleExports[runExport];
      if (stryMutAct_9fa48("78714") ? typeof handler === TYPEOF.FUNCTION : stryMutAct_9fa48("78713") ? false : stryMutAct_9fa48("78712") ? true : (stryCov_9fa48("78712", "78713", "78714"), typeof handler !== TYPEOF.FUNCTION)) {
        if (stryMutAct_9fa48("78715")) {
          {}
        } else {
          stryCov_9fa48("78715");
          throw new Error(ERR.RUN_EXPORT_NOT_CALLABLE);
        }
      }
      const timeoutMs = this._resolveTimeoutMs(request.options);
      const cancellationToken = stryMutAct_9fa48("78718") ? request.options?.cancellationToken && null : stryMutAct_9fa48("78717") ? false : stryMutAct_9fa48("78716") ? true : (stryCov_9fa48("78716", "78717", "78718"), (stryMutAct_9fa48("78719") ? request.options.cancellationToken : (stryCov_9fa48("78719"), request.options?.cancellationToken)) || null);
      if (stryMutAct_9fa48("78722") ? cancellationToken || typeof cancellationToken.throwIfCancelled === TYPEOF.FUNCTION : stryMutAct_9fa48("78721") ? false : stryMutAct_9fa48("78720") ? true : (stryCov_9fa48("78720", "78721", "78722"), cancellationToken && (stryMutAct_9fa48("78724") ? typeof cancellationToken.throwIfCancelled !== TYPEOF.FUNCTION : stryMutAct_9fa48("78723") ? true : (stryCov_9fa48("78723", "78724"), typeof cancellationToken.throwIfCancelled === TYPEOF.FUNCTION)))) {
        if (stryMutAct_9fa48("78725")) {
          {}
        } else {
          stryCov_9fa48("78725");
          cancellationToken.throwIfCancelled();
        }
      }
      let timeoutId;
      let settled = stryMutAct_9fa48("78726") ? true : (stryCov_9fa48("78726"), false);
      const startTime = this._now();
      const executionPromise = Promise.resolve().then(() => {
        if (stryMutAct_9fa48("78727")) {
          {}
        } else {
          stryCov_9fa48("78727");
          return handler(stryMutAct_9fa48("78730") ? request.context && {} : stryMutAct_9fa48("78729") ? false : stryMutAct_9fa48("78728") ? true : (stryCov_9fa48("78728", "78729", "78730"), request.context || {}), stryMutAct_9fa48("78733") ? request.args && {} : stryMutAct_9fa48("78732") ? false : stryMutAct_9fa48("78731") ? true : (stryCov_9fa48("78731", "78732", "78733"), request.args || {}), stryMutAct_9fa48("78734") ? request.options.runtimeOptions : (stryCov_9fa48("78734"), request.options?.runtimeOptions));
        }
      });
      const racers = stryMutAct_9fa48("78735") ? [] : (stryCov_9fa48("78735"), [executionPromise]);
      if (stryMutAct_9fa48("78739") ? timeoutMs <= NUM.ZERO : stryMutAct_9fa48("78738") ? timeoutMs >= NUM.ZERO : stryMutAct_9fa48("78737") ? false : stryMutAct_9fa48("78736") ? true : (stryCov_9fa48("78736", "78737", "78738", "78739"), timeoutMs > NUM.ZERO)) {
        if (stryMutAct_9fa48("78740")) {
          {}
        } else {
          stryCov_9fa48("78740");
          racers.push(new Promise((_resolve, reject) => {
            if (stryMutAct_9fa48("78741")) {
              {}
            } else {
              stryCov_9fa48("78741");
              timeoutId = this._setTimeoutFn(() => {
                if (stryMutAct_9fa48("78742")) {
                  {}
                } else {
                  stryCov_9fa48("78742");
                  reject(new Error(ERR.EXECUTION_TIMEOUT));
                }
              }, timeoutMs);
            }
          }));
        }
      }
      if (stryMutAct_9fa48("78745") ? cancellationToken || typeof cancellationToken.onCancel === TYPEOF.FUNCTION : stryMutAct_9fa48("78744") ? false : stryMutAct_9fa48("78743") ? true : (stryCov_9fa48("78743", "78744", "78745"), cancellationToken && (stryMutAct_9fa48("78747") ? typeof cancellationToken.onCancel !== TYPEOF.FUNCTION : stryMutAct_9fa48("78746") ? true : (stryCov_9fa48("78746", "78747"), typeof cancellationToken.onCancel === TYPEOF.FUNCTION)))) {
        if (stryMutAct_9fa48("78748")) {
          {}
        } else {
          stryCov_9fa48("78748");
          racers.push(new Promise((_resolve, reject) => {
            if (stryMutAct_9fa48("78749")) {
              {}
            } else {
              stryCov_9fa48("78749");
              cancellationToken.onCancel(reason => {
                if (stryMutAct_9fa48("78750")) {
                  {}
                } else {
                  stryCov_9fa48("78750");
                  if (stryMutAct_9fa48("78752") ? false : stryMutAct_9fa48("78751") ? true : (stryCov_9fa48("78751", "78752"), settled)) {
                    if (stryMutAct_9fa48("78753")) {
                      {}
                    } else {
                      stryCov_9fa48("78753");
                      return;
                    }
                  }
                  reject(new Error(stryMutAct_9fa48("78756") ? reason && ERR.EXECUTION_CANCELLED : stryMutAct_9fa48("78755") ? false : stryMutAct_9fa48("78754") ? true : (stryCov_9fa48("78754", "78755", "78756"), reason || ERR.EXECUTION_CANCELLED)));
                }
              });
            }
          }));
        }
      }
      try {
        if (stryMutAct_9fa48("78757")) {
          {}
        } else {
          stryCov_9fa48("78757");
          const result = await Promise.race(racers);
          return stryMutAct_9fa48("78758") ? {} : (stryCov_9fa48("78758"), {
            result,
            mutations: stryMutAct_9fa48("78759") ? ["Stryker was here"] : (stryCov_9fa48("78759"), []),
            durationMs: stryMutAct_9fa48("78760") ? this._now() + startTime : (stryCov_9fa48("78760"), this._now() - startTime),
            instanceHandle: request.instanceHandle
          });
        }
      } finally {
        if (stryMutAct_9fa48("78761")) {
          {}
        } else {
          stryCov_9fa48("78761");
          settled = stryMutAct_9fa48("78762") ? false : (stryCov_9fa48("78762"), true);
          if (stryMutAct_9fa48("78765") ? timeoutId === undefined : stryMutAct_9fa48("78764") ? false : stryMutAct_9fa48("78763") ? true : (stryCov_9fa48("78763", "78764", "78765"), timeoutId !== undefined)) {
            if (stryMutAct_9fa48("78766")) {
              {}
            } else {
              stryCov_9fa48("78766");
              this._clearTimeoutFn(timeoutId);
            }
          }
        }
      }
    }
  }

  /**
   * @param {{instanceHandle: WasmRuntimeInstanceHandle, reason?: string}} request
   * @return {Promise<{status: string, instanceHandle: WasmRuntimeInstanceHandle}>}
   */
  async suspend(request) {
    if (stryMutAct_9fa48("78767")) {
      {}
    } else {
      stryCov_9fa48("78767");
      const record = getInstanceRecord(this._instances, request);
      record.state = STATE.PAUSED;
      record.suspendReason = stryMutAct_9fa48("78770") ? request.reason && null : stryMutAct_9fa48("78769") ? false : stryMutAct_9fa48("78768") ? true : (stryCov_9fa48("78768", "78769", "78770"), request.reason || null);
      return stryMutAct_9fa48("78771") ? {} : (stryCov_9fa48("78771"), {
        status: record.state,
        instanceHandle: request.instanceHandle
      });
    }
  }

  /**
   * @param {{instanceHandle: WasmRuntimeInstanceHandle}} request
   * @return {Promise<{status: string, instanceHandle: WasmRuntimeInstanceHandle}>}
   */
  async resume(request) {
    if (stryMutAct_9fa48("78772")) {
      {}
    } else {
      stryCov_9fa48("78772");
      const record = getInstanceRecord(this._instances, request);
      record.state = STATE.RUNNING;
      record.suspendReason = null;
      return stryMutAct_9fa48("78773") ? {} : (stryCov_9fa48("78773"), {
        status: record.state,
        instanceHandle: request.instanceHandle
      });
    }
  }

  /**
   * @param {{instanceHandle: WasmRuntimeInstanceHandle}} request
   * @return {Promise<Object>}
   */
  async inspect(request) {
    if (stryMutAct_9fa48("78774")) {
      {}
    } else {
      stryCov_9fa48("78774");
      const record = getInstanceRecord(this._instances, request);
      return stryMutAct_9fa48("78775") ? {} : (stryCov_9fa48("78775"), {
        instanceHandle: request.instanceHandle,
        state: record.state,
        moduleRef: record.moduleRef,
        createdAt: record.createdAt,
        suspendReason: record.suspendReason,
        exportNames: Object.keys(stryMutAct_9fa48("78778") ? record.moduleEntry.exports && {} : stryMutAct_9fa48("78777") ? false : stryMutAct_9fa48("78776") ? true : (stryCov_9fa48("78776", "78777", "78778"), record.moduleEntry.exports || {})),
        hasManifest: Boolean(record.moduleEntry.manifest)
      });
    }
  }

  /**
   * @param {WasmRuntimeInstanceHandle} instanceHandle
   * @return {Promise<{destroyed: boolean, instanceHandle: WasmRuntimeInstanceHandle}>}
   */
  async destroyInstance(instanceHandle) {
    if (stryMutAct_9fa48("78779")) {
      {}
    } else {
      stryCov_9fa48("78779");
      if (stryMutAct_9fa48("78782") ? !instanceHandle && typeof instanceHandle !== TYPEOF.OBJECT : stryMutAct_9fa48("78781") ? false : stryMutAct_9fa48("78780") ? true : (stryCov_9fa48("78780", "78781", "78782"), (stryMutAct_9fa48("78783") ? instanceHandle : (stryCov_9fa48("78783"), !instanceHandle)) || (stryMutAct_9fa48("78785") ? typeof instanceHandle === TYPEOF.OBJECT : stryMutAct_9fa48("78784") ? false : (stryCov_9fa48("78784", "78785"), typeof instanceHandle !== TYPEOF.OBJECT)))) {
        if (stryMutAct_9fa48("78786")) {
          {}
        } else {
          stryCov_9fa48("78786");
          throw new Error(ERR.INSTANCE_HANDLE_REQUIRED);
        }
      }
      if (stryMutAct_9fa48("78789") ? !instanceHandle.instanceId && typeof instanceHandle.instanceId !== TYPEOF.STRING : stryMutAct_9fa48("78788") ? false : stryMutAct_9fa48("78787") ? true : (stryCov_9fa48("78787", "78788", "78789"), (stryMutAct_9fa48("78790") ? instanceHandle.instanceId : (stryCov_9fa48("78790"), !instanceHandle.instanceId)) || (stryMutAct_9fa48("78792") ? typeof instanceHandle.instanceId === TYPEOF.STRING : stryMutAct_9fa48("78791") ? false : (stryCov_9fa48("78791", "78792"), typeof instanceHandle.instanceId !== TYPEOF.STRING)))) {
        if (stryMutAct_9fa48("78793")) {
          {}
        } else {
          stryCov_9fa48("78793");
          throw new Error(ERR.INSTANCE_ID_REQUIRED);
        }
      }
      return stryMutAct_9fa48("78794") ? {} : (stryCov_9fa48("78794"), {
        destroyed: this._instances.delete(instanceHandle.instanceId),
        instanceHandle
      });
    }
  }

  /**
   * @return {number} Number of tracked runtime instances.
   */
  getInstanceCount() {
    if (stryMutAct_9fa48("78795")) {
      {}
    } else {
      stryCov_9fa48("78795");
      return this._instances.size;
    }
  }

  /**
   * Resolve timeout from request options with bounded defaults.
   *
   * @param {Object} [options]
   * @return {number}
   * @private
   */
  _resolveTimeoutMs(options) {
    if (stryMutAct_9fa48("78796")) {
      {}
    } else {
      stryCov_9fa48("78796");
      const timeoutMs = stryMutAct_9fa48("78797") ? options.timeoutMs : (stryCov_9fa48("78797"), options?.timeoutMs);
      if (stryMutAct_9fa48("78800") ? typeof timeoutMs === TYPEOF.NUMBER && Number.isFinite(timeoutMs) || timeoutMs > NUM.ZERO : stryMutAct_9fa48("78799") ? false : stryMutAct_9fa48("78798") ? true : (stryCov_9fa48("78798", "78799", "78800"), (stryMutAct_9fa48("78802") ? typeof timeoutMs === TYPEOF.NUMBER || Number.isFinite(timeoutMs) : stryMutAct_9fa48("78801") ? true : (stryCov_9fa48("78801", "78802"), (stryMutAct_9fa48("78804") ? typeof timeoutMs !== TYPEOF.NUMBER : stryMutAct_9fa48("78803") ? true : (stryCov_9fa48("78803", "78804"), typeof timeoutMs === TYPEOF.NUMBER)) && Number.isFinite(timeoutMs))) && (stryMutAct_9fa48("78807") ? timeoutMs <= NUM.ZERO : stryMutAct_9fa48("78806") ? timeoutMs >= NUM.ZERO : stryMutAct_9fa48("78805") ? true : (stryCov_9fa48("78805", "78806", "78807"), timeoutMs > NUM.ZERO)))) {
        if (stryMutAct_9fa48("78808")) {
          {}
        } else {
          stryCov_9fa48("78808");
          return timeoutMs;
        }
      }
      return this._defaultExecutionTimeoutMs;
    }
  }
}
export { WasmRuntimeAdapter, InProcessWasmRuntimeAdapter };