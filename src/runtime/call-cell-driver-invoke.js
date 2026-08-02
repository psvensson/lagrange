/**
 * Call-cell invocation path for the WasmComponentDriver (extracted to keep
 * the driver under the file-size cap). Owns: call-cell identification, the
 * call-context host wiring, bounded emit partial collection, and the
 * component invoke for call/pushdown lineage cells.
 */

import {
  DEPLOYMENT_BINDING_SOURCE_KIND,
} from '../control-plane/owners/deployment-binding-contract.js';
import {createCallContextHost} from './call-cell-context-host.js';

const CALL_CELL_PARTIAL_KEY_PREFIX = 'partial:';
const CALL_CELL_EMIT_TUPLE_LENGTH = 2;
const CALL_CELL_INVOKE_OPTION_DEFAULTS = Object.freeze({
  EMIT_BUDGET: 0,
  NESTED_CALL_BUDGET: 0,
});
const CALL_CELL_RESULT_FIELD = Object.freeze({
  VALUE: 'value',
  PARTIALS: 'partials',
});
const CALL_CELL_DRIVER_MESSAGE = Object.freeze({
  PARTIALS_INVALID:
    'Call Cell component returned partials outside the emit tuple contract',
});

class CallCellDriverError extends Error {
  constructor(message, options = {}) {
    super(message, {cause: options.cause});
    this.name = 'CallCellDriverError';
    this.code = 'call_cell_driver_invoke_failed';
  }
}

function isCallCell(cell) {
  return cell?.sourceKind === DEPLOYMENT_BINDING_SOURCE_KIND.CALL ||
    cell?.sourceKind === DEPLOYMENT_BINDING_SOURCE_KIND.PUSHDOWN;
}

function isCallCellComponentResult(result) {
  return result !== null &&
    typeof result === 'object' &&
    CALL_CELL_RESULT_FIELD.VALUE in result &&
    CALL_CELL_RESULT_FIELD.PARTIALS in result;
}

function assertCallCellPartials(partials) {
  const valid = Array.isArray(partials) && partials.every(
    (entry) => Array.isArray(entry) &&
      entry.length === CALL_CELL_EMIT_TUPLE_LENGTH &&
      typeof entry[0] === 'string' &&
      typeof entry[1] === 'string',
  );
  if (!valid) {
    throw new CallCellDriverError(CALL_CELL_DRIVER_MESSAGE.PARTIALS_INVALID);
  }
}

function callCellInvokeOptions(invocation) {
  const options = invocation.callCell || {};
  return Object.freeze({
    emitBudget: Number.isSafeInteger(options.emitBudget) ?
      options.emitBudget :
      CALL_CELL_INVOKE_OPTION_DEFAULTS.EMIT_BUDGET,
    nestedCallBudget: Number.isSafeInteger(options.nestedCallBudget) ?
      options.nestedCallBudget :
      CALL_CELL_INVOKE_OPTION_DEFAULTS.NESTED_CALL_BUDGET,
    onCallBounded: options.onCallBounded,
  });
}

function readCallCellNoopContexts() {
  return [];
}

function writeCallCellNoopEffects() {}

/**
 * Invoke a call/pushdown cell's run or reduce export, collecting bounded
 * emitted partials. The component runtime and lifecycle-error mapping are
 * injected by the driver so this module stays free of driver internals.
 *
 * @param {object} deps
 * @param {(serviceId, args, read, write, cancel, options) => Promise}
 *   deps.invokeComponent the component runtime invoke bound by the driver
 * @param {(serviceId) => Promise} deps.stopComponent stop on failure
 * @param {(cause) => never} deps.failLifecycle map a cause to a lifecycle error
 */
async function invokeCallCell(deps, invocation, serviceId) {
  const budgets = callCellInvokeOptions(invocation);
  const {emits, host} = createCallContextHost({
    emitBudget: budgets.emitBudget,
    nestedCallBudget: budgets.nestedCallBudget,
    onCallBounded: budgets.onCallBounded,
  });
  let result;
  try {
    result = await deps.invokeComponent(
      serviceId,
      invocation.args || [],
      readCallCellNoopContexts,
      writeCallCellNoopEffects,
      {
        beforeComponentInvoke: invocation.assertCurrentTarget,
        callContext: {
          emitBudget: budgets.emitBudget,
          nestedCallBudget: budgets.nestedCallBudget,
          onCallBounded: typeof budgets.onCallBounded === 'function',
        },
        deadlineMs: invocation.deadlineMs,
        exportName: invocation.exportName,
        tables: [],
      },
    );
  } catch (cause) {
    if (cause?.preserveReplicaState === true) throw cause;
    await deps.stopComponent(serviceId);
    deps.failLifecycle(cause);
  }
  const rawPartials = isCallCellComponentResult(result) ?
    result.partials :
    [];
  for (const [key, partial] of rawPartials) {
    host.emit(key, partial);
  }
  const partials = emits;
  assertCallCellPartials(partials);
  return {
    partials: partials.map(([key, partial]) => Object.freeze({
      key: `${CALL_CELL_PARTIAL_KEY_PREFIX}${key}`,
      partial,
    })),
    result: isCallCellComponentResult(result) ? result.value : result,
  };
}

export {invokeCallCell, isCallCell};
