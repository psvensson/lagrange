/**
 * Typed error vocabulary of the WASI component Cell runtime and its
 * derivation owner: one error class and one closed code set for both.
 *
 * @module runtime/wasi-component-cell-errors
 */
const WASI_COMPONENT_CELL_ERROR_NAME = 'WasiComponentCellError';
const WASI_COMPONENT_CELL_ERROR_MESSAGE = Object.freeze({
  ALREADY_INVOKING: 'Component instance already has an active invocation',
  INVOCATION_FAILED: 'Component invocation failed',
  NOT_READY: 'Component instance is not ready',
  START_FAILED: 'Component startup failed',
  STOPPED: 'Component instance stopped',
});

const WASI_COMPONENT_CELL_ERROR_CODE = Object.freeze({
  BUDGET_EXHAUSTED: 'request_cell_budget_exhausted',
  COMPONENT_FAILED: 'request_cell_component_failed',
  COMPONENT_DERIVATION_EXHAUSTED:
    'request_cell_component_derivation_exhausted',
  COMPONENT_DERIVATION_FAILED: 'request_cell_component_derivation_failed',
  COMPONENT_UNAVAILABLE: 'request_cell_component_unavailable',
  CONCURRENT_INVOCATION: 'request_cell_concurrent_invocation',
  CONTEXT_BUDGET_EXCEEDED: 'request_cell_context_budget_exceeded',
  EMIT_BUFFER_OVERFLOW: 'request_cell_emit_buffer_overflow',
  RUNTIME_MEMORY_PRESSURE_EXCEEDED:
    'request_cell_runtime_memory_pressure_exceeded',
  START_FAILED: 'request_cell_start_failed',
});

class WasiComponentCellError extends Error {
  constructor(code, message, options = {}) {
    super(message, {cause: options.cause});
    this.name = WASI_COMPONENT_CELL_ERROR_NAME;
    this.code = code;
    if (options.preserveReplicaState === true) {
      this.preserveReplicaState = true;
    }
    Object.assign(this, options.detail);
  }
}

export {
  WASI_COMPONENT_CELL_ERROR_CODE,
  WASI_COMPONENT_CELL_ERROR_MESSAGE,
  WasiComponentCellError,
};
