/**
 * WasmExecutor — implements the FunctionRegistry executor
 * interface for WASM service handler functions. Uses
 * ModuleMirror for module loading and enforces ResourceBudget
 * CPU/memory limits per invocation.
 *
 * Invokes the module's declared `run_export` function from
 * the loaded module exports with (context, args) parameters.
 *
 * Requirements: 6.1, 6.3, 6.4, 6.5, 12.5
 * @module wasm-service/wasm-executor
 */

import {
  WASM_SERVICE_EXECUTOR_TYPE,
  WASM_SERVICE_ERROR_MSG,
  DEFAULT_RESOURCE_BUDGET,
} from './wasm-service-constants.js';
import {
  MODULE_MANIFEST_FIELD,
  RUN_EXPORT_MIN_PARAMS,
  RUN_EXPORT_MAX_PARAMS,
} from './module-manifest-constants.js';
import {
  RUNTIME_KIND,
} from '../constants/index.js';
import {
  InProcessWasmRuntimeAdapter,
} from '../debug-runtime/wasm-runtime-adapter.js';
import {DebugEmitter} from '../debug/debug-emitter.js';
import {DEBUG_CAPABILITY, DEBUG_TRACE_SOURCE} from '../debug/debug-constants.js';

const LOCAL_STR_FUNCTION = 'function';

const UNKNOWN_FUNCTION_REF = 'unknown-function';

/**
 * Resolves the function identifier from a func object.
 * Checks `function_id` first, then `handler_function_id`.
 *
 * @param {Object} func - Function definition object.
 * @return {string|undefined} The resolved function ID.
 */
function resolveFunctionId(func) {
  return func.function_id || func.handler_function_id;
}

/**
 * WasmExecutor registers with FunctionRegistry as the
 * `wasm_service` executor type and handles WASM module
 * instantiation with resource budget enforcement.
 */
class WasmExecutor {
  /**
   * @param {Object} options - Configuration options.
   * @param {Object} [options.resourceBudget] - Resource limits
   *   for handler invocations. Defaults to DEFAULT_RESOURCE_BUDGET.
   * @param {Object} [options.moduleMirror] - ModuleMirror
   *   instance for loading WASM modules.
   * @param {Object} [options.runtimeAdapter] - Runtime adapter used
   *   for instantiate/execute lifecycle.
   */
  constructor(options = {}) {
    this.resourceBudget = options.resourceBudget ||
      DEFAULT_RESOURCE_BUDGET;
    this.moduleMirror = options.moduleMirror || null;
    this.runtimeAdapter = options.runtimeAdapter ||
      new InProcessWasmRuntimeAdapter();
    this.debugSessionResolver = options.debugSessionResolver || null;
    this.traceCollector = options.traceCollector || null;
    this.now = options.now || (() => Date.now());
    this.nodeId = options.nodeId || null;
    this.serviceDefinitionId = options.serviceDefinitionId || null;
    this.replicaId = options.replicaId || null;
    this.runtimeKind = options.runtimeKind || RUNTIME_KIND.WASM_COMPONENT;
  }

  /**
   * Register this executor with a FunctionRegistry instance.
   *
   * @param {Object} functionRegistry - The FunctionRegistry
   *   to register with.
   */
  register(functionRegistry) {
    functionRegistry.registerExecutor(
      WASM_SERVICE_EXECUTOR_TYPE, this,
    );
  }

  /**
   * Execute a WASM handler function with context injection
   * and resource budget enforcement.
   *
   * 1. Resolve the WASM module from the ModuleMirror cache.
   * 2. Enforce memory limit from the resource budget.
   * 3. Run the handler with a CPU time limit guard.
   * 4. Return the result and any context mutations.
   *
   * @param {Object} func - Function definition from the code
   *   table, containing function_id or handler_function_id.
   * @param {Object} context - Session context injected into
   *   the handler.
   * @param {Object} args - Arguments passed to the handler.
   * @param {Object} [options] - Optional execution options.
   * @return {Promise<Object>} Execution result with `result`
   *   and `mutations` fields.
   * @throws {Error} MODULE_NOT_AVAILABLE if the module is not
   *   in the mirror cache.
   * @throws {Error} MEMORY_LIMIT_EXCEEDED if the module
   *   exceeds the memory budget.
   * @throws {Error} CPU_TIME_LIMIT_EXCEEDED if execution
   *   exceeds the CPU time budget.
   */
  async execute(func, context, args, options = {}) {
    const functionId = resolveFunctionId(func);
    const mod = this.moduleMirror ?
      this.moduleMirror.getModule(functionId) :
      null;

    if (!mod) {
      throw new Error(WASM_SERVICE_ERROR_MSG.MODULE_NOT_AVAILABLE);
    }

    const memoryLimit = this.resourceBudget.memoryLimitBytes ||
      this.resourceBudget.MEMORY_LIMIT_BYTES ||
      DEFAULT_RESOURCE_BUDGET.MEMORY_LIMIT_BYTES;

    if (mod.wasmBytes && mod.wasmBytes.length > memoryLimit) {
      throw new Error(WASM_SERVICE_ERROR_MSG.MEMORY_LIMIT_EXCEEDED);
    }

    const cpuTimeLimit = this.resourceBudget.cpuTimeLimitMs ||
      this.resourceBudget.CPU_TIME_LIMIT_MS ||
      DEFAULT_RESOURCE_BUDGET.CPU_TIME_LIMIT_MS;

    const result = await this._executeWithTimeout(
      mod, functionId, context, args, cpuTimeLimit, options,
    );

    return result;
  }

  /**
   * Run the handler function with a CPU time limit guard.
   * Uses a setTimeout-based timeout to enforce the limit.
   *
   * @param {Object} mod - Resolved module from ModuleMirror.
   * @param {string} functionId - Function identifier.
   * @param {Object} context - Session context.
   * @param {Object} args - Handler arguments.
   * @param {number} cpuTimeLimitMs - Maximum execution time
   *   in milliseconds.
   * @param {Object} options - Optional execution options.
   * @return {Promise<Object>} Execution result.
   * @throws {Error} CPU_TIME_LIMIT_EXCEEDED on timeout.
   * @private
   */
  async _executeWithTimeout(
    mod, functionId, context, args, cpuTimeLimitMs, options,
  ) {
    let timeoutId;
    try {
      const timeoutPromise = new Promise((_resolve, reject) => {
        timeoutId = setTimeout(() => {
          reject(new Error(
            WASM_SERVICE_ERROR_MSG.CPU_TIME_LIMIT_EXCEEDED,
          ));
        }, cpuTimeLimitMs);
      });

      const executionPromise = this._invokeHandler(
        mod, functionId, context, args, options,
      );

      return await Promise.race([
        executionPromise,
        timeoutPromise,
      ]);
    } finally {
      clearTimeout(timeoutId);
    }
  }

  /**
   * Invoke the module's declared run_export function with
   * the provided context and arguments.
   *
   * @param {Object} mod - Resolved module with manifest and
   *   exports.
   * @param {string} functionId - Function identifier.
   * @param {Object} context - Session context injected into
   *   the handler.
   * @param {Object} args - Arguments passed to the handler.
   * @param {Object} options - Optional execution options.
   * @return {Promise<Object>} Object with `result` and
   *   `mutations` fields.
   * @throws {Error} RUN_EXPORT_NOT_FOUND if the export name
   *   is not present in module exports.
   * @throws {Error} RUN_EXPORT_NOT_CALLABLE if the export is
   *   not a function.
   * @throws {Error} HANDLER_INVOCATION_FAILED if the export
   *   throws during execution.
   * @private
   */
  async _invokeHandler(mod, functionId, context, args, options) {
    const manifest = mod.manifest;
    const exports = mod.exports;
    const runExportName =
      manifest[MODULE_MANIFEST_FIELD.RUN_EXPORT];

    if (!exports || !(runExportName in exports)) {
      throw new Error(
        WASM_SERVICE_ERROR_MSG.RUN_EXPORT_NOT_FOUND,
      );
    }

    const handler = exports[runExportName];

    if (typeof handler !== LOCAL_STR_FUNCTION) {
      throw new Error(
        WASM_SERVICE_ERROR_MSG.RUN_EXPORT_NOT_CALLABLE,
      );
    }

    if (handler.length < RUN_EXPORT_MIN_PARAMS ||
        handler.length > RUN_EXPORT_MAX_PARAMS) {
      throw new Error(
        WASM_SERVICE_ERROR_MSG.RUN_EXPORT_SIGNATURE_MISMATCH,
      );
    }

    let result;
    let instanceHandle = null;
    let pendingError = null;
    const executionContext = this.attachDebugTraceContext(
      mod,
      functionId,
      context,
      options,
    );
    try {
      const instanceResult = await this.runtimeAdapter.createInstance({
        moduleRef: functionId || UNKNOWN_FUNCTION_REF,
        moduleEntry: mod,
      });
      instanceHandle = instanceResult.instanceHandle;
      const inspectResult = await this.runtimeAdapter.inspect({
        instanceHandle,
      });
      const runtimeExportNames = Array.isArray(
        inspectResult?.exportNames,
      ) ? inspectResult.exportNames : [];
      if (!runtimeExportNames.includes(runExportName)) {
        throw new Error(
          WASM_SERVICE_ERROR_MSG.RUN_EXPORT_NOT_FOUND,
        );
      }
      const executeResult = await this.runtimeAdapter.execute({
        instanceHandle,
        manifest,
        runExport: runExportName,
        context: executionContext,
        args,
        options: {
          runtimeOptions: options?.runtimeOptions,
          cancellationToken: options?.cancellationToken,
        },
      });
      result = executeResult.result;
    } catch (cause) {
      const invocationErr = new Error(
        WASM_SERVICE_ERROR_MSG.HANDLER_INVOCATION_FAILED,
      );
      invocationErr.cause = cause;
      pendingError = invocationErr;
    } finally {
      if (instanceHandle) {
        try {
          await this.runtimeAdapter.destroyInstance(
            instanceHandle,
          );
        } catch (destroyCause) {
          if (!pendingError) {
            pendingError = destroyCause;
          }
        }
      }
    }

    if (pendingError) {
      throw pendingError;
    }

    return {result, mutations: []};
  }

  /**
   * Attach `context.debug.trace` only when trace session is active.
   * @param {Object} mod
   * @param {string} functionId
   * @param {Object} context
   * @param {Object} options
   * @return {Object}
   * @private
   */
  attachDebugTraceContext(mod, functionId, context, options) {
    const targetContext = context && typeof context === 'object' ?
      context :
      {};
    if (!this.debugSessionResolver || !this.traceCollector) {
      return targetContext;
    }
    if (!moduleHasTraceCapability(mod.manifest)) {
      return targetContext;
    }
    const existingTraceFn = targetContext.debug &&
      typeof targetContext.debug.trace === 'function';
    if (existingTraceFn) {
      return targetContext;
    }

    const debugScope = this.resolveDebugScope(
      functionId,
      targetContext,
      options,
    );
    const emitter = new DebugEmitter({
      sessionResolver: this.debugSessionResolver,
      traceCollector: this.traceCollector,
      now: this.now,
      nodeId: debugScope.nodeId || null,
      serviceDefinitionId: debugScope.serviceDefinitionId || null,
      replicaId: debugScope.replicaId || null,
      runtimeKind: debugScope.runtimeKind || this.runtimeKind,
      source: debugScope.source || DEBUG_TRACE_SOURCE.SERVICE,
    });
    if (!emitter.isTraceActive(debugScope)) {
      return targetContext;
    }

    const traceApi = emitter.createTraceApi(debugScope, {
      serviceDefinitionId: debugScope.serviceDefinitionId || null,
      nodeId: debugScope.nodeId || null,
      replicaId: debugScope.replicaId || null,
      runtimeKind: debugScope.runtimeKind || this.runtimeKind,
      source: debugScope.source || DEBUG_TRACE_SOURCE.SERVICE,
    });
    const existingDebug = targetContext.debug &&
      typeof targetContext.debug === 'object' ?
      targetContext.debug :
      {};
    targetContext.debug = Object.freeze({
      ...existingDebug,
      trace: traceApi.trace,
    });
    return targetContext;
  }

  /**
   * Resolve debug scope from invocation context + options.
   * @param {string} functionId
   * @param {Object} context
   * @param {Object} options
   * @return {Object}
   * @private
   */
  resolveDebugScope(functionId, context, options) {
    const optionScope = options?.debugScope || {};
    const contextScope = context?.debugScope || {};
    const lineageId = pickFirstNonEmptyString(
      optionScope.lineageId,
      contextScope.lineageId,
      context.lineageId,
    );
    const source = pickFirstNonEmptyString(
      optionScope.source,
      contextScope.source,
    ) || (lineageId ? DEBUG_TRACE_SOURCE.PARTITION_CALLBACK :
      DEBUG_TRACE_SOURCE.SERVICE);

    return {
      source,
      serviceDefinitionId: pickFirstNonEmptyString(
        optionScope.serviceDefinitionId,
        contextScope.serviceDefinitionId,
        context.serviceDefinitionId,
        context.serviceId,
        this.serviceDefinitionId,
        functionId,
      ),
      lineageId,
      stageId: pickFirstInteger(
        optionScope.stageId,
        contextScope.stageId,
        context.stageId,
      ),
      partitionId: pickFirstNonEmptyString(
        optionScope.partitionId,
        contextScope.partitionId,
        context.partitionId,
      ),
      nodeId: pickFirstNonEmptyString(
        optionScope.nodeId,
        contextScope.nodeId,
        context.nodeId,
        this.nodeId,
      ),
      replicaId: pickFirstNonEmptyString(
        optionScope.replicaId,
        contextScope.replicaId,
        context.replicaId,
        this.replicaId,
      ),
      runtimeKind: pickFirstNonEmptyString(
        optionScope.runtimeKind,
        contextScope.runtimeKind,
        this.runtimeKind,
      ),
    };
  }
}

/**
 * @param {Object} manifest
 * @return {boolean}
 */
function moduleHasTraceCapability(manifest) {
  const capabilities = Array.isArray(manifest?.capabilities) ?
    manifest.capabilities :
    [];
  return capabilities.includes(DEBUG_CAPABILITY.TRACE);
}

/**
 * @param {...*} values
 * @return {string|null}
 */
function pickFirstNonEmptyString(...values) {
  for (const value of values) {
    if (typeof value === 'string' &&
      value.length > 0) {
      return value;
    }
  }
  return null;
}

/**
 * @param {...*} values
 * @return {number|null}
 */
function pickFirstInteger(...values) {
  for (const value of values) {
    if (value === null || value === undefined) {
      continue;
    }
    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      return Math.trunc(parsed);
    }
  }
  return null;
}

export {WasmExecutor};
