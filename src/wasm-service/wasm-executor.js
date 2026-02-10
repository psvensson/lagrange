/**
 * WasmExecutor — implements the FunctionRegistry executor
 * interface for WASM service handler functions. Uses
 * ModuleMirror for module loading and enforces ResourceBudget
 * CPU/memory limits per invocation.
 *
 * The actual WASM runtime instantiation is stubbed until a
 * real WASM runtime is integrated. The structure for module
 * loading, resource enforcement, and context injection is
 * fully in place.
 *
 * Requirements: 6.1, 6.3, 6.4, 6.5
 * @module wasm-service/wasm-executor
 */

import {
  WASM_SERVICE_EXECUTOR_TYPE,
  WASM_SERVICE_ERROR_MSG,
  DEFAULT_RESOURCE_BUDGET,
} from './wasm-service-constants.js';

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
   */
  constructor(options = {}) {
    this.resourceBudget = options.resourceBudget ||
      DEFAULT_RESOURCE_BUDGET;
    this.moduleMirror = options.moduleMirror || null;
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
   * @return {Promise<Object>} Execution result with `result`
   *   and `mutations` fields.
   * @throws {Error} MODULE_NOT_AVAILABLE if the module is not
   *   in the mirror cache.
   * @throws {Error} MEMORY_LIMIT_EXCEEDED if the module
   *   exceeds the memory budget.
   * @throws {Error} CPU_TIME_LIMIT_EXCEEDED if execution
   *   exceeds the CPU time budget.
   */
  async execute(func, context, args) {
    const functionId = resolveFunctionId(func);
    const mod = this.moduleMirror
      ? this.moduleMirror.getModule(functionId)
      : null;

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
      func, context, args, cpuTimeLimit,
    );

    return result;
  }

  /**
   * Run the handler function with a CPU time limit guard.
   * Uses a setTimeout-based timeout to enforce the limit.
   *
   * @param {Object} func - Function definition.
   * @param {Object} context - Session context.
   * @param {Object} args - Handler arguments.
   * @param {number} cpuTimeLimitMs - Maximum execution time
   *   in milliseconds.
   * @return {Promise<Object>} Execution result.
   * @throws {Error} CPU_TIME_LIMIT_EXCEEDED on timeout.
   * @private
   */
  async _executeWithTimeout(func, context, args, cpuTimeLimitMs) {
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
        func, context, args,
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
   * Stub handler invocation. Returns the args as the result
   * with an empty mutations array. This will be replaced with
   * real WASM instantiation once a runtime is integrated.
   *
   * @param {Object} _func - Function definition (unused in stub).
   * @param {Object} _context - Session context (unused in stub).
   * @param {Object} args - Handler arguments returned as result.
   * @return {Promise<Object>} Object with `result` and
   *   `mutations` fields.
   * @private
   */
  async _invokeHandler(_func, _context, args) {
    return {result: args, mutations: []};
  }
}

export {WasmExecutor};
