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
import { WASM_SERVICE_EXECUTOR_TYPE, WASM_SERVICE_ERROR_MSG, DEFAULT_RESOURCE_BUDGET } from './wasm-service-constants.js';
import { MODULE_MANIFEST_FIELD, RUN_EXPORT_MIN_PARAMS, RUN_EXPORT_MAX_PARAMS } from './module-manifest-constants.js';
import { NUM, RUNTIME_KIND, TYPEOF } from '../constants/index.js';
import { InProcessWasmRuntimeAdapter } from '../debug-runtime/wasm-runtime-adapter.js';
import { DebugEmitter } from '../debug/debug-emitter.js';
import { DEBUG_CAPABILITY, DEBUG_TRACE_SOURCE } from '../debug/debug-constants.js';
const UNKNOWN_FUNCTION_REF = stryMutAct_9fa48("163291") ? "" : (stryCov_9fa48("163291"), 'unknown-function');

/**
 * Resolves the function identifier from a func object.
 * Checks `function_id` first, then `handler_function_id`.
 *
 * @param {Object} func - Function definition object.
 * @return {string|undefined} The resolved function ID.
 */
function resolveFunctionId(func) {
  if (stryMutAct_9fa48("163292")) {
    {}
  } else {
    stryCov_9fa48("163292");
    return stryMutAct_9fa48("163295") ? func.function_id && func.handler_function_id : stryMutAct_9fa48("163294") ? false : stryMutAct_9fa48("163293") ? true : (stryCov_9fa48("163293", "163294", "163295"), func.function_id || func.handler_function_id);
  }
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
    if (stryMutAct_9fa48("163296")) {
      {}
    } else {
      stryCov_9fa48("163296");
      this.resourceBudget = stryMutAct_9fa48("163299") ? options.resourceBudget && DEFAULT_RESOURCE_BUDGET : stryMutAct_9fa48("163298") ? false : stryMutAct_9fa48("163297") ? true : (stryCov_9fa48("163297", "163298", "163299"), options.resourceBudget || DEFAULT_RESOURCE_BUDGET);
      this.moduleMirror = stryMutAct_9fa48("163302") ? options.moduleMirror && null : stryMutAct_9fa48("163301") ? false : stryMutAct_9fa48("163300") ? true : (stryCov_9fa48("163300", "163301", "163302"), options.moduleMirror || null);
      this.runtimeAdapter = stryMutAct_9fa48("163305") ? options.runtimeAdapter && new InProcessWasmRuntimeAdapter() : stryMutAct_9fa48("163304") ? false : stryMutAct_9fa48("163303") ? true : (stryCov_9fa48("163303", "163304", "163305"), options.runtimeAdapter || new InProcessWasmRuntimeAdapter());
      this.debugSessionResolver = stryMutAct_9fa48("163308") ? options.debugSessionResolver && null : stryMutAct_9fa48("163307") ? false : stryMutAct_9fa48("163306") ? true : (stryCov_9fa48("163306", "163307", "163308"), options.debugSessionResolver || null);
      this.traceCollector = stryMutAct_9fa48("163311") ? options.traceCollector && null : stryMutAct_9fa48("163310") ? false : stryMutAct_9fa48("163309") ? true : (stryCov_9fa48("163309", "163310", "163311"), options.traceCollector || null);
      this.now = stryMutAct_9fa48("163314") ? options.now && (() => Date.now()) : stryMutAct_9fa48("163313") ? false : stryMutAct_9fa48("163312") ? true : (stryCov_9fa48("163312", "163313", "163314"), options.now || (stryMutAct_9fa48("163315") ? () => undefined : (stryCov_9fa48("163315"), () => Date.now())));
      this.nodeId = stryMutAct_9fa48("163318") ? options.nodeId && null : stryMutAct_9fa48("163317") ? false : stryMutAct_9fa48("163316") ? true : (stryCov_9fa48("163316", "163317", "163318"), options.nodeId || null);
      this.serviceDefinitionId = stryMutAct_9fa48("163321") ? options.serviceDefinitionId && null : stryMutAct_9fa48("163320") ? false : stryMutAct_9fa48("163319") ? true : (stryCov_9fa48("163319", "163320", "163321"), options.serviceDefinitionId || null);
      this.replicaId = stryMutAct_9fa48("163324") ? options.replicaId && null : stryMutAct_9fa48("163323") ? false : stryMutAct_9fa48("163322") ? true : (stryCov_9fa48("163322", "163323", "163324"), options.replicaId || null);
      this.runtimeKind = stryMutAct_9fa48("163327") ? options.runtimeKind && RUNTIME_KIND.WASM_COMPONENT : stryMutAct_9fa48("163326") ? false : stryMutAct_9fa48("163325") ? true : (stryCov_9fa48("163325", "163326", "163327"), options.runtimeKind || RUNTIME_KIND.WASM_COMPONENT);
    }
  }

  /**
   * Register this executor with a FunctionRegistry instance.
   *
   * @param {Object} functionRegistry - The FunctionRegistry
   *   to register with.
   */
  register(functionRegistry) {
    if (stryMutAct_9fa48("163328")) {
      {}
    } else {
      stryCov_9fa48("163328");
      functionRegistry.registerExecutor(WASM_SERVICE_EXECUTOR_TYPE, this);
    }
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
    if (stryMutAct_9fa48("163329")) {
      {}
    } else {
      stryCov_9fa48("163329");
      const functionId = resolveFunctionId(func);
      const mod = this.moduleMirror ? this.moduleMirror.getModule(functionId) : null;
      if (stryMutAct_9fa48("163332") ? false : stryMutAct_9fa48("163331") ? true : stryMutAct_9fa48("163330") ? mod : (stryCov_9fa48("163330", "163331", "163332"), !mod)) {
        if (stryMutAct_9fa48("163333")) {
          {}
        } else {
          stryCov_9fa48("163333");
          throw new Error(WASM_SERVICE_ERROR_MSG.MODULE_NOT_AVAILABLE);
        }
      }
      const memoryLimit = stryMutAct_9fa48("163336") ? (this.resourceBudget.memoryLimitBytes || this.resourceBudget.MEMORY_LIMIT_BYTES) && DEFAULT_RESOURCE_BUDGET.MEMORY_LIMIT_BYTES : stryMutAct_9fa48("163335") ? false : stryMutAct_9fa48("163334") ? true : (stryCov_9fa48("163334", "163335", "163336"), (stryMutAct_9fa48("163338") ? this.resourceBudget.memoryLimitBytes && this.resourceBudget.MEMORY_LIMIT_BYTES : stryMutAct_9fa48("163337") ? false : (stryCov_9fa48("163337", "163338"), this.resourceBudget.memoryLimitBytes || this.resourceBudget.MEMORY_LIMIT_BYTES)) || DEFAULT_RESOURCE_BUDGET.MEMORY_LIMIT_BYTES);
      if (stryMutAct_9fa48("163341") ? mod.wasmBytes || mod.wasmBytes.length > memoryLimit : stryMutAct_9fa48("163340") ? false : stryMutAct_9fa48("163339") ? true : (stryCov_9fa48("163339", "163340", "163341"), mod.wasmBytes && (stryMutAct_9fa48("163344") ? mod.wasmBytes.length <= memoryLimit : stryMutAct_9fa48("163343") ? mod.wasmBytes.length >= memoryLimit : stryMutAct_9fa48("163342") ? true : (stryCov_9fa48("163342", "163343", "163344"), mod.wasmBytes.length > memoryLimit)))) {
        if (stryMutAct_9fa48("163345")) {
          {}
        } else {
          stryCov_9fa48("163345");
          throw new Error(WASM_SERVICE_ERROR_MSG.MEMORY_LIMIT_EXCEEDED);
        }
      }
      const cpuTimeLimit = stryMutAct_9fa48("163348") ? (this.resourceBudget.cpuTimeLimitMs || this.resourceBudget.CPU_TIME_LIMIT_MS) && DEFAULT_RESOURCE_BUDGET.CPU_TIME_LIMIT_MS : stryMutAct_9fa48("163347") ? false : stryMutAct_9fa48("163346") ? true : (stryCov_9fa48("163346", "163347", "163348"), (stryMutAct_9fa48("163350") ? this.resourceBudget.cpuTimeLimitMs && this.resourceBudget.CPU_TIME_LIMIT_MS : stryMutAct_9fa48("163349") ? false : (stryCov_9fa48("163349", "163350"), this.resourceBudget.cpuTimeLimitMs || this.resourceBudget.CPU_TIME_LIMIT_MS)) || DEFAULT_RESOURCE_BUDGET.CPU_TIME_LIMIT_MS);
      const result = await this._executeWithTimeout(mod, functionId, context, args, cpuTimeLimit, options);
      return result;
    }
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
  async _executeWithTimeout(mod, functionId, context, args, cpuTimeLimitMs, options) {
    if (stryMutAct_9fa48("163351")) {
      {}
    } else {
      stryCov_9fa48("163351");
      let timeoutId;
      try {
        if (stryMutAct_9fa48("163352")) {
          {}
        } else {
          stryCov_9fa48("163352");
          const timeoutPromise = new Promise((_resolve, reject) => {
            if (stryMutAct_9fa48("163353")) {
              {}
            } else {
              stryCov_9fa48("163353");
              timeoutId = setTimeout(() => {
                if (stryMutAct_9fa48("163354")) {
                  {}
                } else {
                  stryCov_9fa48("163354");
                  reject(new Error(WASM_SERVICE_ERROR_MSG.CPU_TIME_LIMIT_EXCEEDED));
                }
              }, cpuTimeLimitMs);
            }
          });
          const executionPromise = this._invokeHandler(mod, functionId, context, args, options);
          return await Promise.race(stryMutAct_9fa48("163355") ? [] : (stryCov_9fa48("163355"), [executionPromise, timeoutPromise]));
        }
      } finally {
        if (stryMutAct_9fa48("163356")) {
          {}
        } else {
          stryCov_9fa48("163356");
          clearTimeout(timeoutId);
        }
      }
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
    if (stryMutAct_9fa48("163357")) {
      {}
    } else {
      stryCov_9fa48("163357");
      const manifest = mod.manifest;
      const exports = mod.exports;
      const runExportName = manifest[MODULE_MANIFEST_FIELD.RUN_EXPORT];
      if (stryMutAct_9fa48("163360") ? !exports && !(runExportName in exports) : stryMutAct_9fa48("163359") ? false : stryMutAct_9fa48("163358") ? true : (stryCov_9fa48("163358", "163359", "163360"), (stryMutAct_9fa48("163361") ? exports : (stryCov_9fa48("163361"), !exports)) || (stryMutAct_9fa48("163362") ? runExportName in exports : (stryCov_9fa48("163362"), !(runExportName in exports))))) {
        if (stryMutAct_9fa48("163363")) {
          {}
        } else {
          stryCov_9fa48("163363");
          throw new Error(WASM_SERVICE_ERROR_MSG.RUN_EXPORT_NOT_FOUND);
        }
      }
      const handler = exports[runExportName];
      if (stryMutAct_9fa48("163366") ? typeof handler === 'function' : stryMutAct_9fa48("163365") ? false : stryMutAct_9fa48("163364") ? true : (stryCov_9fa48("163364", "163365", "163366"), typeof handler !== (stryMutAct_9fa48("163367") ? "" : (stryCov_9fa48("163367"), 'function')))) {
        if (stryMutAct_9fa48("163368")) {
          {}
        } else {
          stryCov_9fa48("163368");
          throw new Error(WASM_SERVICE_ERROR_MSG.RUN_EXPORT_NOT_CALLABLE);
        }
      }
      if (stryMutAct_9fa48("163371") ? handler.length < RUN_EXPORT_MIN_PARAMS && handler.length > RUN_EXPORT_MAX_PARAMS : stryMutAct_9fa48("163370") ? false : stryMutAct_9fa48("163369") ? true : (stryCov_9fa48("163369", "163370", "163371"), (stryMutAct_9fa48("163374") ? handler.length >= RUN_EXPORT_MIN_PARAMS : stryMutAct_9fa48("163373") ? handler.length <= RUN_EXPORT_MIN_PARAMS : stryMutAct_9fa48("163372") ? false : (stryCov_9fa48("163372", "163373", "163374"), handler.length < RUN_EXPORT_MIN_PARAMS)) || (stryMutAct_9fa48("163377") ? handler.length <= RUN_EXPORT_MAX_PARAMS : stryMutAct_9fa48("163376") ? handler.length >= RUN_EXPORT_MAX_PARAMS : stryMutAct_9fa48("163375") ? false : (stryCov_9fa48("163375", "163376", "163377"), handler.length > RUN_EXPORT_MAX_PARAMS)))) {
        if (stryMutAct_9fa48("163378")) {
          {}
        } else {
          stryCov_9fa48("163378");
          throw new Error(WASM_SERVICE_ERROR_MSG.RUN_EXPORT_SIGNATURE_MISMATCH);
        }
      }
      let result;
      let instanceHandle = null;
      let pendingError = null;
      const executionContext = this.attachDebugTraceContext(mod, functionId, context, options);
      try {
        if (stryMutAct_9fa48("163379")) {
          {}
        } else {
          stryCov_9fa48("163379");
          const instanceResult = await this.runtimeAdapter.createInstance(stryMutAct_9fa48("163380") ? {} : (stryCov_9fa48("163380"), {
            moduleRef: stryMutAct_9fa48("163383") ? functionId && UNKNOWN_FUNCTION_REF : stryMutAct_9fa48("163382") ? false : stryMutAct_9fa48("163381") ? true : (stryCov_9fa48("163381", "163382", "163383"), functionId || UNKNOWN_FUNCTION_REF),
            moduleEntry: mod
          }));
          instanceHandle = instanceResult.instanceHandle;
          const inspectResult = await this.runtimeAdapter.inspect(stryMutAct_9fa48("163384") ? {} : (stryCov_9fa48("163384"), {
            instanceHandle
          }));
          const runtimeExportNames = Array.isArray(stryMutAct_9fa48("163385") ? inspectResult.exportNames : (stryCov_9fa48("163385"), inspectResult?.exportNames)) ? inspectResult.exportNames : stryMutAct_9fa48("163386") ? ["Stryker was here"] : (stryCov_9fa48("163386"), []);
          if (stryMutAct_9fa48("163389") ? false : stryMutAct_9fa48("163388") ? true : stryMutAct_9fa48("163387") ? runtimeExportNames.includes(runExportName) : (stryCov_9fa48("163387", "163388", "163389"), !runtimeExportNames.includes(runExportName))) {
            if (stryMutAct_9fa48("163390")) {
              {}
            } else {
              stryCov_9fa48("163390");
              throw new Error(WASM_SERVICE_ERROR_MSG.RUN_EXPORT_NOT_FOUND);
            }
          }
          const executeResult = await this.runtimeAdapter.execute(stryMutAct_9fa48("163391") ? {} : (stryCov_9fa48("163391"), {
            instanceHandle,
            manifest,
            runExport: runExportName,
            context: executionContext,
            args,
            options: stryMutAct_9fa48("163392") ? {} : (stryCov_9fa48("163392"), {
              runtimeOptions: stryMutAct_9fa48("163393") ? options.runtimeOptions : (stryCov_9fa48("163393"), options?.runtimeOptions),
              cancellationToken: stryMutAct_9fa48("163394") ? options.cancellationToken : (stryCov_9fa48("163394"), options?.cancellationToken)
            })
          }));
          result = executeResult.result;
        }
      } catch (cause) {
        if (stryMutAct_9fa48("163395")) {
          {}
        } else {
          stryCov_9fa48("163395");
          const invocationErr = new Error(WASM_SERVICE_ERROR_MSG.HANDLER_INVOCATION_FAILED);
          invocationErr.cause = cause;
          pendingError = invocationErr;
        }
      } finally {
        if (stryMutAct_9fa48("163396")) {
          {}
        } else {
          stryCov_9fa48("163396");
          if (stryMutAct_9fa48("163398") ? false : stryMutAct_9fa48("163397") ? true : (stryCov_9fa48("163397", "163398"), instanceHandle)) {
            if (stryMutAct_9fa48("163399")) {
              {}
            } else {
              stryCov_9fa48("163399");
              try {
                if (stryMutAct_9fa48("163400")) {
                  {}
                } else {
                  stryCov_9fa48("163400");
                  await this.runtimeAdapter.destroyInstance(instanceHandle);
                }
              } catch (destroyCause) {
                if (stryMutAct_9fa48("163401")) {
                  {}
                } else {
                  stryCov_9fa48("163401");
                  if (stryMutAct_9fa48("163404") ? false : stryMutAct_9fa48("163403") ? true : stryMutAct_9fa48("163402") ? pendingError : (stryCov_9fa48("163402", "163403", "163404"), !pendingError)) {
                    if (stryMutAct_9fa48("163405")) {
                      {}
                    } else {
                      stryCov_9fa48("163405");
                      pendingError = destroyCause;
                    }
                  }
                }
              }
            }
          }
        }
      }
      if (stryMutAct_9fa48("163407") ? false : stryMutAct_9fa48("163406") ? true : (stryCov_9fa48("163406", "163407"), pendingError)) {
        if (stryMutAct_9fa48("163408")) {
          {}
        } else {
          stryCov_9fa48("163408");
          throw pendingError;
        }
      }
      return stryMutAct_9fa48("163409") ? {} : (stryCov_9fa48("163409"), {
        result,
        mutations: stryMutAct_9fa48("163410") ? ["Stryker was here"] : (stryCov_9fa48("163410"), [])
      });
    }
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
    if (stryMutAct_9fa48("163411")) {
      {}
    } else {
      stryCov_9fa48("163411");
      const targetContext = (stryMutAct_9fa48("163414") ? context || typeof context === TYPEOF.OBJECT : stryMutAct_9fa48("163413") ? false : stryMutAct_9fa48("163412") ? true : (stryCov_9fa48("163412", "163413", "163414"), context && (stryMutAct_9fa48("163416") ? typeof context !== TYPEOF.OBJECT : stryMutAct_9fa48("163415") ? true : (stryCov_9fa48("163415", "163416"), typeof context === TYPEOF.OBJECT)))) ? context : {};
      if (stryMutAct_9fa48("163419") ? !this.debugSessionResolver && !this.traceCollector : stryMutAct_9fa48("163418") ? false : stryMutAct_9fa48("163417") ? true : (stryCov_9fa48("163417", "163418", "163419"), (stryMutAct_9fa48("163420") ? this.debugSessionResolver : (stryCov_9fa48("163420"), !this.debugSessionResolver)) || (stryMutAct_9fa48("163421") ? this.traceCollector : (stryCov_9fa48("163421"), !this.traceCollector)))) {
        if (stryMutAct_9fa48("163422")) {
          {}
        } else {
          stryCov_9fa48("163422");
          return targetContext;
        }
      }
      if (stryMutAct_9fa48("163425") ? false : stryMutAct_9fa48("163424") ? true : stryMutAct_9fa48("163423") ? moduleHasTraceCapability(mod.manifest) : (stryCov_9fa48("163423", "163424", "163425"), !moduleHasTraceCapability(mod.manifest))) {
        if (stryMutAct_9fa48("163426")) {
          {}
        } else {
          stryCov_9fa48("163426");
          return targetContext;
        }
      }
      const existingTraceFn = stryMutAct_9fa48("163429") ? targetContext.debug || typeof targetContext.debug.trace === TYPEOF.FUNCTION : stryMutAct_9fa48("163428") ? false : stryMutAct_9fa48("163427") ? true : (stryCov_9fa48("163427", "163428", "163429"), targetContext.debug && (stryMutAct_9fa48("163431") ? typeof targetContext.debug.trace !== TYPEOF.FUNCTION : stryMutAct_9fa48("163430") ? true : (stryCov_9fa48("163430", "163431"), typeof targetContext.debug.trace === TYPEOF.FUNCTION)));
      if (stryMutAct_9fa48("163433") ? false : stryMutAct_9fa48("163432") ? true : (stryCov_9fa48("163432", "163433"), existingTraceFn)) {
        if (stryMutAct_9fa48("163434")) {
          {}
        } else {
          stryCov_9fa48("163434");
          return targetContext;
        }
      }
      const debugScope = this.resolveDebugScope(functionId, targetContext, options);
      const emitter = new DebugEmitter(stryMutAct_9fa48("163435") ? {} : (stryCov_9fa48("163435"), {
        sessionResolver: this.debugSessionResolver,
        traceCollector: this.traceCollector,
        now: this.now,
        nodeId: stryMutAct_9fa48("163438") ? debugScope.nodeId && null : stryMutAct_9fa48("163437") ? false : stryMutAct_9fa48("163436") ? true : (stryCov_9fa48("163436", "163437", "163438"), debugScope.nodeId || null),
        serviceDefinitionId: stryMutAct_9fa48("163441") ? debugScope.serviceDefinitionId && null : stryMutAct_9fa48("163440") ? false : stryMutAct_9fa48("163439") ? true : (stryCov_9fa48("163439", "163440", "163441"), debugScope.serviceDefinitionId || null),
        replicaId: stryMutAct_9fa48("163444") ? debugScope.replicaId && null : stryMutAct_9fa48("163443") ? false : stryMutAct_9fa48("163442") ? true : (stryCov_9fa48("163442", "163443", "163444"), debugScope.replicaId || null),
        runtimeKind: stryMutAct_9fa48("163447") ? debugScope.runtimeKind && this.runtimeKind : stryMutAct_9fa48("163446") ? false : stryMutAct_9fa48("163445") ? true : (stryCov_9fa48("163445", "163446", "163447"), debugScope.runtimeKind || this.runtimeKind),
        source: stryMutAct_9fa48("163450") ? debugScope.source && DEBUG_TRACE_SOURCE.SERVICE : stryMutAct_9fa48("163449") ? false : stryMutAct_9fa48("163448") ? true : (stryCov_9fa48("163448", "163449", "163450"), debugScope.source || DEBUG_TRACE_SOURCE.SERVICE)
      }));
      if (stryMutAct_9fa48("163453") ? false : stryMutAct_9fa48("163452") ? true : stryMutAct_9fa48("163451") ? emitter.isTraceActive(debugScope) : (stryCov_9fa48("163451", "163452", "163453"), !emitter.isTraceActive(debugScope))) {
        if (stryMutAct_9fa48("163454")) {
          {}
        } else {
          stryCov_9fa48("163454");
          return targetContext;
        }
      }
      const traceApi = emitter.createTraceApi(debugScope, stryMutAct_9fa48("163455") ? {} : (stryCov_9fa48("163455"), {
        serviceDefinitionId: stryMutAct_9fa48("163458") ? debugScope.serviceDefinitionId && null : stryMutAct_9fa48("163457") ? false : stryMutAct_9fa48("163456") ? true : (stryCov_9fa48("163456", "163457", "163458"), debugScope.serviceDefinitionId || null),
        nodeId: stryMutAct_9fa48("163461") ? debugScope.nodeId && null : stryMutAct_9fa48("163460") ? false : stryMutAct_9fa48("163459") ? true : (stryCov_9fa48("163459", "163460", "163461"), debugScope.nodeId || null),
        replicaId: stryMutAct_9fa48("163464") ? debugScope.replicaId && null : stryMutAct_9fa48("163463") ? false : stryMutAct_9fa48("163462") ? true : (stryCov_9fa48("163462", "163463", "163464"), debugScope.replicaId || null),
        runtimeKind: stryMutAct_9fa48("163467") ? debugScope.runtimeKind && this.runtimeKind : stryMutAct_9fa48("163466") ? false : stryMutAct_9fa48("163465") ? true : (stryCov_9fa48("163465", "163466", "163467"), debugScope.runtimeKind || this.runtimeKind),
        source: stryMutAct_9fa48("163470") ? debugScope.source && DEBUG_TRACE_SOURCE.SERVICE : stryMutAct_9fa48("163469") ? false : stryMutAct_9fa48("163468") ? true : (stryCov_9fa48("163468", "163469", "163470"), debugScope.source || DEBUG_TRACE_SOURCE.SERVICE)
      }));
      const existingDebug = (stryMutAct_9fa48("163473") ? targetContext.debug || typeof targetContext.debug === TYPEOF.OBJECT : stryMutAct_9fa48("163472") ? false : stryMutAct_9fa48("163471") ? true : (stryCov_9fa48("163471", "163472", "163473"), targetContext.debug && (stryMutAct_9fa48("163475") ? typeof targetContext.debug !== TYPEOF.OBJECT : stryMutAct_9fa48("163474") ? true : (stryCov_9fa48("163474", "163475"), typeof targetContext.debug === TYPEOF.OBJECT)))) ? targetContext.debug : {};
      targetContext.debug = Object.freeze(stryMutAct_9fa48("163476") ? {} : (stryCov_9fa48("163476"), {
        ...existingDebug,
        trace: traceApi.trace
      }));
      return targetContext;
    }
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
    if (stryMutAct_9fa48("163477")) {
      {}
    } else {
      stryCov_9fa48("163477");
      const optionScope = stryMutAct_9fa48("163480") ? options?.debugScope && {} : stryMutAct_9fa48("163479") ? false : stryMutAct_9fa48("163478") ? true : (stryCov_9fa48("163478", "163479", "163480"), (stryMutAct_9fa48("163481") ? options.debugScope : (stryCov_9fa48("163481"), options?.debugScope)) || {});
      const contextScope = stryMutAct_9fa48("163484") ? context?.debugScope && {} : stryMutAct_9fa48("163483") ? false : stryMutAct_9fa48("163482") ? true : (stryCov_9fa48("163482", "163483", "163484"), (stryMutAct_9fa48("163485") ? context.debugScope : (stryCov_9fa48("163485"), context?.debugScope)) || {});
      const lineageId = pickFirstNonEmptyString(optionScope.lineageId, contextScope.lineageId, context.lineageId);
      const source = stryMutAct_9fa48("163488") ? pickFirstNonEmptyString(optionScope.source, contextScope.source) && (lineageId ? DEBUG_TRACE_SOURCE.PARTITION_CALLBACK : DEBUG_TRACE_SOURCE.SERVICE) : stryMutAct_9fa48("163487") ? false : stryMutAct_9fa48("163486") ? true : (stryCov_9fa48("163486", "163487", "163488"), pickFirstNonEmptyString(optionScope.source, contextScope.source) || (lineageId ? DEBUG_TRACE_SOURCE.PARTITION_CALLBACK : DEBUG_TRACE_SOURCE.SERVICE));
      return stryMutAct_9fa48("163489") ? {} : (stryCov_9fa48("163489"), {
        source,
        serviceDefinitionId: pickFirstNonEmptyString(optionScope.serviceDefinitionId, contextScope.serviceDefinitionId, context.serviceDefinitionId, context.serviceId, this.serviceDefinitionId, functionId),
        lineageId,
        stageId: pickFirstInteger(optionScope.stageId, contextScope.stageId, context.stageId),
        partitionId: pickFirstNonEmptyString(optionScope.partitionId, contextScope.partitionId, context.partitionId),
        nodeId: pickFirstNonEmptyString(optionScope.nodeId, contextScope.nodeId, context.nodeId, this.nodeId),
        replicaId: pickFirstNonEmptyString(optionScope.replicaId, contextScope.replicaId, context.replicaId, this.replicaId),
        runtimeKind: pickFirstNonEmptyString(optionScope.runtimeKind, contextScope.runtimeKind, this.runtimeKind)
      });
    }
  }
}

/**
 * @param {Object} manifest
 * @return {boolean}
 */
function moduleHasTraceCapability(manifest) {
  if (stryMutAct_9fa48("163490")) {
    {}
  } else {
    stryCov_9fa48("163490");
    const capabilities = Array.isArray(stryMutAct_9fa48("163491") ? manifest.capabilities : (stryCov_9fa48("163491"), manifest?.capabilities)) ? manifest.capabilities : stryMutAct_9fa48("163492") ? ["Stryker was here"] : (stryCov_9fa48("163492"), []);
    return capabilities.includes(DEBUG_CAPABILITY.TRACE);
  }
}

/**
 * @param {...*} values
 * @return {string|null}
 */
function pickFirstNonEmptyString(...values) {
  if (stryMutAct_9fa48("163493")) {
    {}
  } else {
    stryCov_9fa48("163493");
    for (const value of values) {
      if (stryMutAct_9fa48("163494")) {
        {}
      } else {
        stryCov_9fa48("163494");
        if (stryMutAct_9fa48("163497") ? typeof value === TYPEOF.STRING || value.length > NUM.ZERO : stryMutAct_9fa48("163496") ? false : stryMutAct_9fa48("163495") ? true : (stryCov_9fa48("163495", "163496", "163497"), (stryMutAct_9fa48("163499") ? typeof value !== TYPEOF.STRING : stryMutAct_9fa48("163498") ? true : (stryCov_9fa48("163498", "163499"), typeof value === TYPEOF.STRING)) && (stryMutAct_9fa48("163502") ? value.length <= NUM.ZERO : stryMutAct_9fa48("163501") ? value.length >= NUM.ZERO : stryMutAct_9fa48("163500") ? true : (stryCov_9fa48("163500", "163501", "163502"), value.length > NUM.ZERO)))) {
          if (stryMutAct_9fa48("163503")) {
            {}
          } else {
            stryCov_9fa48("163503");
            return value;
          }
        }
      }
    }
    return null;
  }
}

/**
 * @param {...*} values
 * @return {number|null}
 */
function pickFirstInteger(...values) {
  if (stryMutAct_9fa48("163504")) {
    {}
  } else {
    stryCov_9fa48("163504");
    for (const value of values) {
      if (stryMutAct_9fa48("163505")) {
        {}
      } else {
        stryCov_9fa48("163505");
        if (stryMutAct_9fa48("163508") ? value === null && value === undefined : stryMutAct_9fa48("163507") ? false : stryMutAct_9fa48("163506") ? true : (stryCov_9fa48("163506", "163507", "163508"), (stryMutAct_9fa48("163510") ? value !== null : stryMutAct_9fa48("163509") ? false : (stryCov_9fa48("163509", "163510"), value === null)) || (stryMutAct_9fa48("163512") ? value !== undefined : stryMutAct_9fa48("163511") ? false : (stryCov_9fa48("163511", "163512"), value === undefined)))) {
          if (stryMutAct_9fa48("163513")) {
            {}
          } else {
            stryCov_9fa48("163513");
            continue;
          }
        }
        const parsed = Number(value);
        if (stryMutAct_9fa48("163515") ? false : stryMutAct_9fa48("163514") ? true : (stryCov_9fa48("163514", "163515"), Number.isFinite(parsed))) {
          if (stryMutAct_9fa48("163516")) {
            {}
          } else {
            stryCov_9fa48("163516");
            return Math.trunc(parsed);
          }
        }
      }
    }
    return null;
  }
}
export { WasmExecutor };