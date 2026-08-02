import {createHash, randomUUID} from 'node:crypto';

const CALL_CELL_ROUTE_OPERATION = 'call_cell.invoke';
const CALL_CELL_ROUTE_MESSAGE_TYPE = 'INVOKE_CALL_CELL';
const CALL_CELL_ROUTE_CLASSIFICATION = Object.freeze({
  AMBIGUOUS: 'ambiguous',
  RETRYABLE: 'retryable',
  TERMINAL: 'terminal',
});
const CALL_CELL_ROUTE_ERROR_CODE = Object.freeze({
  ACK_ONLY: 'call_cell_ack_only',
  AUTHENTICATION_FAILED: 'call_cell_authentication_failed',
  AUTHORIZATION_FAILED: 'call_cell_authorization_failed',
  BATCH_BOUND_EXCEEDED: 'call_cell_batch_bound_exceeded',
  COMPONENT_FAILED: 'call_cell_component_failed',
  DEADLINE_EXHAUSTED: 'call_cell_deadline_exhausted',
  HANDLER_FAILED: 'call_cell_handler_failed',
  INVALID_ARGUMENTS: 'call_cell_invalid_arguments',
  INVALID_COMPONENT_RESULT: 'call_cell_invalid_component_result',
  NOT_INVOCABLE: 'call_cell_not_invocable',
  REDUCE_INCOMPLETE: 'call_cell_reduce_incomplete',
  ROUTE_AMBIGUOUS: 'call_cell_route_ambiguous',
  ROUTE_NOT_FOUND: 'call_cell_route_not_found',
  ROUTE_UNAVAILABLE: 'call_cell_route_unavailable',
  SHUTTING_DOWN: 'call_cell_shutting_down',
  STATEMENT_INVALID: 'call_cell_statement_invalid',
  TARGET_STALE: 'call_cell_target_stale',
  TRANSPORT_FAILED: 'call_cell_transport_failed',
});
const CALL_CELL_ROUTE_ERROR_NAME = 'CallCellRoutingError';
const CALL_CELL_INVOCATION_ID_PREFIX = 'call-invocation-';
const HASH_ALGORITHM = 'sha256';
const HASH_ENCODING = 'hex';
const BYTE_ENCODING = 'utf8';
const CALL_CELL_CONTRACT_MESSAGE = Object.freeze({
  ARGUMENTS_JSON_INVALID:
    'Call Cell invocation arguments must be a JSON object string',
  ARGUMENTS_NOT_OBJECT: 'arguments must be a JSON object',
  COMPONENT_RESULT_JSON_INVALID:
    'Call Cell Component returned an invalid result JSON string',
  SECURITY_CONTEXT_INVALID:
    'Call authentication did not produce a canonical security context',
});

class CallCellRoutingError extends Error {
  constructor(code, message, options = {}) {
    super(message, {cause: options.cause});
    this.name = CALL_CELL_ROUTE_ERROR_NAME;
    this.code = code;
    this.classification =
      options.classification ||
      CALL_CELL_ROUTE_CLASSIFICATION.TERMINAL;
    this.retryable =
      this.classification === CALL_CELL_ROUTE_CLASSIFICATION.RETRYABLE;
    this.ambiguous =
      this.classification === CALL_CELL_ROUTE_CLASSIFICATION.AMBIGUOUS;
    this.invoked = options.invoked === true;
    this.preserveReplicaState = options.preserveReplicaState === true;
  }
}

function createCallRoutingFailure(code, message, options = {}) {
  return new CallCellRoutingError(code, message, options);
}

function createCallInvocationIdentity(idempotencyKey) {
  const invocationId = typeof idempotencyKey === 'string' &&
    idempotencyKey.length > 0 ?
    idempotencyKey :
    `${CALL_CELL_INVOCATION_ID_PREFIX}${randomUUID()}`;
  return Object.freeze({invocationId});
}

function createCallInvocationIntentDigest(fields) {
  return createHash(HASH_ALGORITHM)
    .update(JSON.stringify(fields), BYTE_ENCODING)
    .digest(HASH_ENCODING);
}

function normalizeCallComponentResult(value) {
  if (typeof value !== 'string') {
    throw createCallRoutingFailure(
      CALL_CELL_ROUTE_ERROR_CODE.INVALID_COMPONENT_RESULT,
      CALL_CELL_CONTRACT_MESSAGE.COMPONENT_RESULT_JSON_INVALID,
    );
  }
  try {
    JSON.parse(value);
  } catch (error) {
    throw createCallRoutingFailure(
      CALL_CELL_ROUTE_ERROR_CODE.INVALID_COMPONENT_RESULT,
      CALL_CELL_CONTRACT_MESSAGE.COMPONENT_RESULT_JSON_INVALID,
      {cause: error},
    );
  }
  return value;
}

const EMPTY_ARGUMENTS_JSON = '{}';

function normalizeCallArguments(value) {
  if (value === undefined) return EMPTY_ARGUMENTS_JSON;
  if (typeof value !== 'string') {
    throw createCallRoutingFailure(
      CALL_CELL_ROUTE_ERROR_CODE.INVALID_ARGUMENTS,
      CALL_CELL_CONTRACT_MESSAGE.ARGUMENTS_JSON_INVALID,
    );
  }
  try {
    const parsed = JSON.parse(value);
    if (parsed === null || typeof parsed !== 'object' ||
        Array.isArray(parsed)) {
      throw new TypeError(
        CALL_CELL_CONTRACT_MESSAGE.ARGUMENTS_NOT_OBJECT);
    }
  } catch (error) {
    throw createCallRoutingFailure(
      CALL_CELL_ROUTE_ERROR_CODE.INVALID_ARGUMENTS,
      CALL_CELL_CONTRACT_MESSAGE.ARGUMENTS_JSON_INVALID,
      {cause: error},
    );
  }
  return value;
}

export {
  CALL_CELL_INVOCATION_ID_PREFIX,
  CALL_CELL_ROUTE_CLASSIFICATION,
  CALL_CELL_ROUTE_ERROR_CODE,
  CALL_CELL_ROUTE_MESSAGE_TYPE,
  CALL_CELL_ROUTE_OPERATION,
  CallCellRoutingError,
  createCallInvocationIdentity,
  createCallInvocationIntentDigest,
  createCallRoutingFailure,
  normalizeCallArguments,
  normalizeCallComponentResult,
};
