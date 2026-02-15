/**
 * WasmRuntimeAdapter contract and initial in-process backend.
 *
 * Track B foundation introduces a single runtime adapter owner
 * for instantiate/execute/suspend/inspect lifecycle.
 */

import {NUM, TYPEOF} from '../constants/index.js';
import {
  WASM_RUNTIME_ADAPTER_KIND,
  WASM_RUNTIME_OPERATION as OP,
  WASM_RUNTIME_ADAPTER_STATE as STATE,
  WASM_RUNTIME_DEFAULT,
  WASM_RUNTIME_ADAPTER_ERROR_MSG as ERR,
} from './debug-runtime-constants.js';

const DEFAULT_RUNTIME_OPTIONS = Object.freeze({
  timeoutMs: WASM_RUNTIME_DEFAULT.EXECUTION_TIMEOUT_MS,
});

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
    if (new.target === WasmRuntimeAdapter) {
      throw new Error(ERR.ABSTRACT_CLASS);
    }
    this.kind = kind || WASM_RUNTIME_ADAPTER_KIND.ABSTRACT;
    Object.defineProperty(this, 'kind', {writable: false, configurable: false});
  }

  /**
   * Throw a contract "not implemented" error for a method.
   *
   * @param {string} methodName - Method that must be implemented.
   * @throws {Error}
   * @protected
   */
  _notImplemented(methodName) {
    throw new Error(ERR.METHOD_NOT_IMPLEMENTED + methodName);
  }

  /**
   * @param {WasmRuntimeInstantiateRequest} _request
   * @return {Promise<{instanceHandle: WasmRuntimeInstanceHandle, createdAt: number}>}
   */
  async createInstance(_request) {
    this._notImplemented(OP.CREATE_INSTANCE);
  }

  /**
   * @param {WasmRuntimeExecuteRequest} _request
   * @return {Promise<WasmRuntimeExecuteResult>}
   */
  async execute(_request) {
    this._notImplemented(OP.EXECUTE);
  }

  /**
   * @param {{instanceHandle: WasmRuntimeInstanceHandle, reason?: string}} _request
   * @return {Promise<{status: string, instanceHandle: WasmRuntimeInstanceHandle}>}
   */
  async suspend(_request) {
    this._notImplemented(OP.SUSPEND);
  }

  /**
   * @param {{instanceHandle: WasmRuntimeInstanceHandle}} _request
   * @return {Promise<{status: string, instanceHandle: WasmRuntimeInstanceHandle}>}
   */
  async resume(_request) {
    this._notImplemented(OP.RESUME);
  }

  /**
   * @param {{instanceHandle: WasmRuntimeInstanceHandle}} _request
   * @return {Promise<Object>}
   */
  async inspect(_request) {
    this._notImplemented(OP.INSPECT);
  }

  /**
   * @param {WasmRuntimeInstanceHandle} _instanceHandle
   * @return {Promise<{destroyed: boolean, instanceHandle: WasmRuntimeInstanceHandle}>}
   */
  async destroyInstance(_instanceHandle) {
    this._notImplemented(OP.DESTROY_INSTANCE);
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
  if (!request || typeof request !== TYPEOF.OBJECT) {
    throw new Error(ERR.REQUEST_REQUIRED);
  }
  if (!request.instanceHandle ||
      typeof request.instanceHandle !== TYPEOF.OBJECT) {
    throw new Error(ERR.INSTANCE_HANDLE_REQUIRED);
  }
  const instanceId = request.instanceHandle.instanceId;
  if (!instanceId || typeof instanceId !== TYPEOF.STRING) {
    throw new Error(ERR.INSTANCE_ID_REQUIRED);
  }
  const record = instances.get(instanceId) || null;
  if (!record) {
    throw new Error(ERR.INSTANCE_NOT_FOUND + instanceId);
  }
  return record;
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
    super(WASM_RUNTIME_ADAPTER_KIND.IN_PROCESS);
    this._instances = new Map();
    this._nextInstanceId = NUM.ONE;
    this._now = options.now || (() => Date.now());
    this._setTimeoutFn = options.setTimeoutFn || setTimeout;
    this._clearTimeoutFn = options.clearTimeoutFn || clearTimeout;
    this._defaultExecutionTimeoutMs =
      options.defaultExecutionTimeoutMs ??
      DEFAULT_RUNTIME_OPTIONS.timeoutMs;
  }

  /**
   * @param {WasmRuntimeInstantiateRequest} request
   * @return {Promise<{instanceHandle: WasmRuntimeInstanceHandle, createdAt: number}>}
   */
  async createInstance(request) {
    if (!request || typeof request !== TYPEOF.OBJECT) {
      throw new Error(ERR.REQUEST_REQUIRED);
    }
    if (!request.moduleRef ||
        typeof request.moduleRef !== TYPEOF.STRING ||
        request.moduleRef.trim().length === NUM.ZERO) {
      throw new Error(ERR.MODULE_REF_REQUIRED);
    }
    if (!request.moduleEntry ||
        typeof request.moduleEntry !== TYPEOF.OBJECT) {
      throw new Error(ERR.MODULE_ENTRY_REQUIRED);
    }

    const instanceId = `wr-${this._nextInstanceId++}`;
    const createdAt = this._now();
    const record = {
      instanceId,
      moduleRef: request.moduleRef,
      moduleEntry: request.moduleEntry,
      imports: request.imports || {},
      createdAt,
      state: STATE.RUNNING,
      suspendReason: null,
    };
    this._instances.set(instanceId, record);
    return {
      instanceHandle: {
        instanceId,
        moduleRef: request.moduleRef,
      },
      createdAt,
    };
  }

  /**
   * @param {WasmRuntimeExecuteRequest} request
   * @return {Promise<WasmRuntimeExecuteResult>}
   */
  async execute(request) {
    const record = getInstanceRecord(this._instances, request);
    const manifest = request.manifest || record.moduleEntry.manifest;
    if (!manifest || typeof manifest !== TYPEOF.OBJECT) {
      throw new Error(ERR.MANIFEST_REQUIRED);
    }

    const runExport = request.runExport || manifest.runExport;
    if (!runExport || typeof runExport !== TYPEOF.STRING) {
      throw new Error(ERR.RUN_EXPORT_REQUIRED);
    }

    const moduleExports = record.moduleEntry.exports;
    if (!moduleExports || !(runExport in moduleExports)) {
      throw new Error(ERR.RUN_EXPORT_NOT_FOUND);
    }
    const handler = moduleExports[runExport];
    if (typeof handler !== TYPEOF.FUNCTION) {
      throw new Error(ERR.RUN_EXPORT_NOT_CALLABLE);
    }

    const timeoutMs = this._resolveTimeoutMs(request.options);
    const cancellationToken =
      request.options?.cancellationToken || null;

    if (cancellationToken &&
      typeof cancellationToken.throwIfCancelled === TYPEOF.FUNCTION) {
      cancellationToken.throwIfCancelled();
    }

    let timeoutId;
    let settled = false;
    const startTime = this._now();

    const executionPromise = Promise.resolve().then(() => {
      return handler(
        request.context || {},
        request.args || {},
        request.options?.runtimeOptions,
      );
    });

    const racers = [executionPromise];
    if (timeoutMs > NUM.ZERO) {
      racers.push(new Promise((_resolve, reject) => {
        timeoutId = this._setTimeoutFn(() => {
          reject(new Error(ERR.EXECUTION_TIMEOUT));
        }, timeoutMs);
      }));
    }

    if (cancellationToken &&
      typeof cancellationToken.onCancel === TYPEOF.FUNCTION) {
      racers.push(new Promise((_resolve, reject) => {
        cancellationToken.onCancel((reason) => {
          if (settled) {
            return;
          }
          reject(new Error(reason || ERR.EXECUTION_CANCELLED));
        });
      }));
    }

    try {
      const result = await Promise.race(racers);
      return {
        result,
        mutations: [],
        durationMs: this._now() - startTime,
        instanceHandle: request.instanceHandle,
      };
    } finally {
      settled = true;
      if (timeoutId !== undefined) {
        this._clearTimeoutFn(timeoutId);
      }
    }
  }

  /**
   * @param {{instanceHandle: WasmRuntimeInstanceHandle, reason?: string}} request
   * @return {Promise<{status: string, instanceHandle: WasmRuntimeInstanceHandle}>}
   */
  async suspend(request) {
    const record = getInstanceRecord(this._instances, request);
    record.state = STATE.PAUSED;
    record.suspendReason = request.reason || null;
    return {
      status: record.state,
      instanceHandle: request.instanceHandle,
    };
  }

  /**
   * @param {{instanceHandle: WasmRuntimeInstanceHandle}} request
   * @return {Promise<{status: string, instanceHandle: WasmRuntimeInstanceHandle}>}
   */
  async resume(request) {
    const record = getInstanceRecord(this._instances, request);
    record.state = STATE.RUNNING;
    record.suspendReason = null;
    return {
      status: record.state,
      instanceHandle: request.instanceHandle,
    };
  }

  /**
   * @param {{instanceHandle: WasmRuntimeInstanceHandle}} request
   * @return {Promise<Object>}
   */
  async inspect(request) {
    const record = getInstanceRecord(this._instances, request);
    return {
      instanceHandle: request.instanceHandle,
      state: record.state,
      moduleRef: record.moduleRef,
      createdAt: record.createdAt,
      suspendReason: record.suspendReason,
      exportNames: Object.keys(record.moduleEntry.exports || {}),
      hasManifest: Boolean(record.moduleEntry.manifest),
    };
  }

  /**
   * @param {WasmRuntimeInstanceHandle} instanceHandle
   * @return {Promise<{destroyed: boolean, instanceHandle: WasmRuntimeInstanceHandle}>}
   */
  async destroyInstance(instanceHandle) {
    if (!instanceHandle ||
      typeof instanceHandle !== TYPEOF.OBJECT) {
      throw new Error(ERR.INSTANCE_HANDLE_REQUIRED);
    }
    if (!instanceHandle.instanceId ||
      typeof instanceHandle.instanceId !== TYPEOF.STRING) {
      throw new Error(ERR.INSTANCE_ID_REQUIRED);
    }

    return {
      destroyed: this._instances.delete(instanceHandle.instanceId),
      instanceHandle,
    };
  }

  /**
   * @return {number} Number of tracked runtime instances.
   */
  getInstanceCount() {
    return this._instances.size;
  }

  /**
   * Resolve timeout from request options with bounded defaults.
   *
   * @param {Object} [options]
   * @return {number}
   * @private
   */
  _resolveTimeoutMs(options) {
    const timeoutMs = options?.timeoutMs;
    if (typeof timeoutMs === TYPEOF.NUMBER &&
      Number.isFinite(timeoutMs) &&
      timeoutMs > NUM.ZERO) {
      return timeoutMs;
    }
    return this._defaultExecutionTimeoutMs;
  }
}

export {
  WasmRuntimeAdapter,
  InProcessWasmRuntimeAdapter,
};
