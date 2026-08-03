/**
 * Host import object for `lagrange:cell/call-context` (sole owner).
 *
 * Implements the sealed call-context imports for the WASI worker:
 *   emit(key, partial)        — bounded publish of one partial
 *   call-bounded(name, arg)   — bounded nested invocation of a declared export
 *
 * Both return WIT `result<_, deny-code>`: on refusal they throw an Error
 * whose `payload` is the typed deny-code (the jco convention proven by
 * test/wasm-service/call-cell-world-abi.test.js).
 */

const DENY_CODE = Object.freeze({
  UNDECLARED_CAPABILITY: 'undeclared-capability',
  BUDGET_EXHAUSTED: 'budget-exhausted',
  INVALID_ARGUMENT: 'invalid-argument',
});

function deny(code) {
  const error = new Error(code);
  error.payload = code;
  return error;
}

/**
 * @param {object} options
 * @param {number} options.emitBudget max emits per invocation (Binding-declared)
 * @param {number} options.nestedCallBudget max call-bounded depth/fan-out
 * @param {(key: string, partial: string) => void} options.onEmit host sink
 * @param {(exportName: string, argument: string) => string} [options.onCallBounded]
 *   host nested-invocation handler; absent → all nested calls undeclared
 */
function createCallContextHost(options) {
  const emits = [];
  let nestedCalls = 0;
  return {
    emits,
    host: Object.freeze({
      emit(key, partial) {
        if (emits.length >= options.emitBudget) {
          throw deny(DENY_CODE.BUDGET_EXHAUSTED);
        }
        emits.push([key, partial]);
        options.onEmit?.(key, partial);
      },
      callBounded(exportName, argument) {
        nestedCalls += 1;
        if (nestedCalls > options.nestedCallBudget) {
          throw deny(DENY_CODE.BUDGET_EXHAUSTED);
        }
        if (typeof options.onCallBounded !== 'function') {
          throw deny(DENY_CODE.UNDECLARED_CAPABILITY);
        }
        return options.onCallBounded(exportName, argument);
      },
    }),
  };
}

export {createCallContextHost};
