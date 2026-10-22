// The one owner of "may this command enter a WASM service group's consensus
// log" (design R4). A committed entry is applied on every replica and cannot
// be taken back, so a command the committed apply does not dispatch is
// refused here, before it is proposed, with a typed reason of
// WASM_SERVICE_COMMAND_REFUSAL.

import {
  WASM_SERVICE_COMMAND_REFUSAL,
  WASM_SERVICE_COMMAND_TYPE,
  WASM_SERVICE_ERROR_MSG,
} from './wasm-service-constants.js';

const COMMITTED_COMMAND_TYPES = Object.freeze(
  new Set(Object.values(WASM_SERVICE_COMMAND_TYPE)));
const ADMITTED = Object.freeze({admitted: true});

/**
 * Decide whether a command may be proposed.
 * @param {Object} command - The command about to be proposed.
 * @return {Object} Frozen {admitted: true}, or {admitted: false, reason,
 *   type} with a WASM_SERVICE_COMMAND_REFUSAL reason.
 */
function admitWasmServiceCommand(command) {
  if (COMMITTED_COMMAND_TYPES.has(command?.type)) {
    return ADMITTED;
  }
  return Object.freeze({
    admitted: false,
    reason: WASM_SERVICE_COMMAND_REFUSAL.UNKNOWN_TYPE,
    type: command?.type ?? null,
  });
}

/**
 * The typed error of a refused admission: never retried, nothing proposed.
 * @param {Object} admission - A refused admission.
 * @return {Error} The error, carrying the refusal's reason and type.
 */
function wasmServiceCommandRefusalError(admission) {
  const error = new Error(
    `${WASM_SERVICE_ERROR_MSG.COMMAND_TYPE_REFUSED}: ` +
    `${String(admission.type)}`);
  error.code = admission.reason;
  error.reason = admission.reason;
  error.retryable = false;
  return error;
}

export {
  WASM_SERVICE_COMMAND_REFUSAL,
  admitWasmServiceCommand,
  wasmServiceCommandRefusalError,
};
