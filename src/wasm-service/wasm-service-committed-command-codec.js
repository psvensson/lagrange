// How a WASM service command crosses its group's log (design R4 §2(b)): a
// proposed value travels as base64 text inside the JSON command, a committed
// command of an admitted type applies to the session KV store, and a
// proposal the port did not append is a typed refusal.

import {STRING} from '../constants/index.js';
import {
  WASM_SERVICE_COMMAND_TYPE,
  WASM_SERVICE_ERROR_MSG,
  WASM_SERVICE_VALUE_ENCODING,
} from './wasm-service-constants.js';

const LOCAL_STR_STRING = 'string';

/**
 * The bytes a command value commits: bytes as given, text as UTF-8,
 * anything else as its JSON text.
 * @param {*} value - The proposed value.
 * @return {Buffer} Its bytes.
 */
function committedValueBytes(value) {
  if (value instanceof Uint8Array) {
    return Buffer.from(value);
  }
  return Buffer.from(typeof value === LOCAL_STR_STRING ?
    value : JSON.stringify(value ?? null));
}

/**
 * The JSON command proposed for an entry: its value as base64 text.
 * @param {Object} entry - The admitted entry.
 * @return {Object} The command.
 */
function encodeCommittedCommand(entry) {
  if (entry.value === undefined) {
    return {...entry};
  }
  return {
    ...entry,
    value: committedValueBytes(entry.value)
      .toString(WASM_SERVICE_VALUE_ENCODING.BASE64),
    valueEncoding: WASM_SERVICE_VALUE_ENCODING.BASE64,
  };
}

/**
 * The bytes a committed command carries.
 * @param {Object} command - The committed command.
 * @return {Buffer} Its value bytes.
 */
function decodeCommittedValue(command) {
  return Buffer.from(
    typeof command.value === LOCAL_STR_STRING ? command.value : STRING.EMPTY,
    WASM_SERVICE_VALUE_ENCODING.BASE64);
}

// Every committed command type the admission owner admits, applied to the
// session KV store inside the port's applied-state transaction.
const COMMITTED_COMMAND_APPLICATION = Object.freeze({
  [WASM_SERVICE_COMMAND_TYPE.KV_SET]: (kvStore, command) => kvStore.applySet(
    command.sessionId, command.key, decodeCommittedValue(command)),
  [WASM_SERVICE_COMMAND_TYPE.KV_DELETE]: (kvStore, command) =>
    kvStore.applyDelete(command.sessionId, command.key),
  [WASM_SERVICE_COMMAND_TYPE.KV_DELETE_SESSION]: (kvStore, command) =>
    kvStore.applyDeleteSession(command.sessionId),
  [WASM_SERVICE_COMMAND_TYPE.TIMER_STATE]: (kvStore, command) =>
    kvStore.applySet(
      command.sessionId || command.key,
      command.key || command.sessionId,
      decodeCommittedValue(command)),
});

/**
 * Apply one committed record to the session KV store. A committed type the
 * admission owner never admits fails the application rather than being
 * skipped.
 * @param {Object} kvStore - The replica's session KV store.
 * @param {Object} committed - {command, index, term, effects}.
 * @return {*} The KV store's answer.
 */
function applyCommittedCommand(kvStore, committed) {
  const type = committed.command?.type;
  const apply = typeof type === LOCAL_STR_STRING &&
    Object.hasOwn(COMMITTED_COMMAND_APPLICATION, type) ?
    COMMITTED_COMMAND_APPLICATION[type] : null;
  if (!apply) {
    throw new Error(
      `${WASM_SERVICE_ERROR_MSG.UNKNOWN_COMMITTED_COMMAND}: ` +
      `${JSON.stringify(type ?? null)} at index ${committed.index}`);
  }
  return apply(kvStore, committed.command);
}

/**
 * The typed refusal of a proposal the port did not append.
 * @param {Object} answer - The port's answer.
 * @return {Error} The error, carrying the answer.
 */
function proposalRefusedError(answer) {
  const error = new Error(WASM_SERVICE_ERROR_MSG.PROPOSAL_REFUSED);
  error.consensus = answer ?? null;
  error.reason = answer?.reason ?? null;
  return error;
}

export {applyCommittedCommand, encodeCommittedCommand, proposalRefusedError};
