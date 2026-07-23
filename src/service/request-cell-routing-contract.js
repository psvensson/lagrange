import {createHash, randomUUID} from 'node:crypto';

const REQUEST_CELL_ROUTE_OPERATION = 'request_cell.invoke';
const REQUEST_CELL_ROUTE_MESSAGE_TYPE = 'INVOKE_REQUEST_CELL';
const REQUEST_CELL_ROUTE_CLASSIFICATION = Object.freeze({
  AMBIGUOUS: 'ambiguous',
  RETRYABLE: 'retryable',
  TERMINAL: 'terminal',
});
const REQUEST_CELL_ROUTE_ERROR_CODE = Object.freeze({
  ACK_ONLY: 'request_cell_ack_only',
  AUTHENTICATION_FAILED: 'request_cell_authentication_failed',
  AUTHENTICATION_UNAVAILABLE: 'request_cell_authentication_unavailable',
  AUTHORITY_FIELD_REJECTED: 'request_cell_authority_field_rejected',
  AUTHORIZATION_FAILED: 'request_cell_authorization_failed',
  COMPONENT_FAILED: 'request_cell_component_failed',
  DEADLINE_EXHAUSTED: 'request_cell_deadline_exhausted',
  HANDLER_FAILED: 'request_cell_handler_failed',
  INVOCATION_AMBIGUOUS: 'request_cell_invocation_ambiguous',
  INVOCATION_CONFLICT: 'request_cell_invocation_conflict',
  INVALID_COMPONENT_RESPONSE: 'request_cell_invalid_component_response',
  INVALID_REQUEST: 'request_cell_invalid_request',
  OVERLOADED: 'request_cell_overloaded',
  ROUTE_AMBIGUOUS: 'request_cell_route_ambiguous',
  ROUTE_NOT_FOUND: 'request_cell_route_not_found',
  ROUTE_UNAVAILABLE: 'request_cell_route_unavailable',
  SHUTTING_DOWN: 'request_cell_shutting_down',
  TARGET_STALE: 'request_cell_target_stale',
  TRANSPORT_FAILED: 'request_cell_transport_failed',
});
const REQUEST_CELL_ROUTE_HTTP_STATUS = Object.freeze({
  [REQUEST_CELL_ROUTE_ERROR_CODE.ACK_ONLY]: 502,
  [REQUEST_CELL_ROUTE_ERROR_CODE.AUTHENTICATION_FAILED]: 401,
  [REQUEST_CELL_ROUTE_ERROR_CODE.AUTHENTICATION_UNAVAILABLE]: 503,
  [REQUEST_CELL_ROUTE_ERROR_CODE.AUTHORITY_FIELD_REJECTED]: 400,
  [REQUEST_CELL_ROUTE_ERROR_CODE.AUTHORIZATION_FAILED]: 403,
  [REQUEST_CELL_ROUTE_ERROR_CODE.COMPONENT_FAILED]: 502,
  [REQUEST_CELL_ROUTE_ERROR_CODE.DEADLINE_EXHAUSTED]: 504,
  [REQUEST_CELL_ROUTE_ERROR_CODE.HANDLER_FAILED]: 502,
  [REQUEST_CELL_ROUTE_ERROR_CODE.INVOCATION_AMBIGUOUS]: 503,
  [REQUEST_CELL_ROUTE_ERROR_CODE.INVOCATION_CONFLICT]: 409,
  [REQUEST_CELL_ROUTE_ERROR_CODE.INVALID_COMPONENT_RESPONSE]: 502,
  [REQUEST_CELL_ROUTE_ERROR_CODE.INVALID_REQUEST]: 400,
  [REQUEST_CELL_ROUTE_ERROR_CODE.OVERLOADED]: 429,
  [REQUEST_CELL_ROUTE_ERROR_CODE.ROUTE_AMBIGUOUS]: 409,
  [REQUEST_CELL_ROUTE_ERROR_CODE.ROUTE_NOT_FOUND]: 404,
  [REQUEST_CELL_ROUTE_ERROR_CODE.ROUTE_UNAVAILABLE]: 503,
  [REQUEST_CELL_ROUTE_ERROR_CODE.SHUTTING_DOWN]: 503,
  [REQUEST_CELL_ROUTE_ERROR_CODE.TARGET_STALE]: 503,
  [REQUEST_CELL_ROUTE_ERROR_CODE.TRANSPORT_FAILED]: 502,
});
const REQUEST_CELL_ROUTE_ERROR_NAME = 'RequestCellRoutingError';
const REQUEST_CELL_INVOCATION_ID_PREFIX = 'request-invocation-';
const HASH_ALGORITHM = 'sha256';
const HASH_ENCODING = 'hex';
const BYTE_ENCODING = 'utf8';
const IDEMPOTENCY_KEY_MAX_BYTES = 256;
const HTTP_STATUS_INFORMATIONAL_MINIMUM = 100;
const HTTP_STATUS_SERVER_ERROR_MAXIMUM = 599;
const HTTP_STATUS_INTERNAL_SERVER_ERROR = 500;
const REQUEST_CELL_CONTRACT_MESSAGE = Object.freeze({
  COMPONENT_RESPONSE_INVALID:
    'Request Cell Component response must contain status, headers, and body',
  COMPONENT_RESPONSE_JSON_INVALID:
    'Request Cell Component returned invalid response JSON',
  IDEMPOTENCY_KEY_TOO_LARGE:
    'Idempotency-Key exceeds the request Cell limit',
  SECURITY_CONTEXT_INVALID:
    'Request authentication did not produce a canonical security context',
});

class RequestCellRoutingError extends Error {
  constructor(code, message, options = {}) {
    super(message, {cause: options.cause});
    this.name = REQUEST_CELL_ROUTE_ERROR_NAME;
    this.code = code;
    this.classification =
      options.classification ||
      REQUEST_CELL_ROUTE_CLASSIFICATION.TERMINAL;
    this.httpStatus =
      options.httpStatus ||
      REQUEST_CELL_ROUTE_HTTP_STATUS[code] ||
      HTTP_STATUS_INTERNAL_SERVER_ERROR;
    this.invoked = options.invoked === true;
    this.retryable =
      this.classification === REQUEST_CELL_ROUTE_CLASSIFICATION.RETRYABLE;
    this.ambiguous =
      this.classification === REQUEST_CELL_ROUTE_CLASSIFICATION.AMBIGUOUS;
    this.preserveReplicaState = options.preserveReplicaState === true;
  }
}

function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (!value || typeof value !== 'object') return value;
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) return value;
  return Object.fromEntries(
    Object.keys(value).sort().map(
      (key) => [key, canonicalize(value[key])],
    ),
  );
}

function canonicalJson(value) {
  return JSON.stringify(canonicalize(value));
}

function sha256(value) {
  return createHash(HASH_ALGORITHM)
    .update(value)
    .digest(HASH_ENCODING);
}

function createRequestDigest(request) {
  return `sha256:${sha256(canonicalJson(request))}`;
}

function createInvocationIdentity(tenantId, idempotencyKey) {
  const requestKey =
    typeof idempotencyKey === 'string' && idempotencyKey.length > 0 ?
      idempotencyKey :
      randomUUID();
  if (Buffer.byteLength(requestKey, BYTE_ENCODING) >
      IDEMPOTENCY_KEY_MAX_BYTES) {
    throw new RequestCellRoutingError(
      REQUEST_CELL_ROUTE_ERROR_CODE.INVALID_REQUEST,
      REQUEST_CELL_CONTRACT_MESSAGE.IDEMPOTENCY_KEY_TOO_LARGE,
    );
  }
  return `${REQUEST_CELL_INVOCATION_ID_PREFIX}${sha256(
    canonicalJson({requestKey, tenantId}),
  )}`;
}

function createInvocationIntentDigest(fields) {
  return `sha256:${sha256(canonicalJson({
    bindingVersionId: fields.bindingVersionId,
    method: fields.method,
    path: fields.path,
    requestDigest: fields.requestDigest,
    tenantId: fields.tenantId,
  }))}`;
}

function freezeSecurityContext(context) {
  const valid =
    typeof context?.tenantId === 'string' &&
    context.tenantId.length > 0 &&
    typeof context?.principal === 'string' &&
    context.principal.length > 0 &&
    Array.isArray(context?.roles) &&
    context.roles.every(
      (role) => typeof role === 'string' && role.length > 0,
    );
  if (!valid) {
    throw new RequestCellRoutingError(
      REQUEST_CELL_ROUTE_ERROR_CODE.AUTHENTICATION_FAILED,
      REQUEST_CELL_CONTRACT_MESSAGE.SECURITY_CONTEXT_INVALID,
    );
  }
  return Object.freeze({
    principal: context.principal,
    roles: Object.freeze([...new Set(context.roles)].sort()),
    tenantId: context.tenantId,
  });
}

function normalizeComponentResponse(value) {
  let response = value;
  if (typeof value === 'string') {
    try {
      response = JSON.parse(value);
    } catch (cause) {
      throw new RequestCellRoutingError(
        REQUEST_CELL_ROUTE_ERROR_CODE.INVALID_COMPONENT_RESPONSE,
        REQUEST_CELL_CONTRACT_MESSAGE.COMPONENT_RESPONSE_JSON_INVALID,
        {cause, invoked: true},
      );
    }
  }
  const headersValid =
    Array.isArray(response?.headers) &&
    response.headers.every(
      (entry) =>
        Array.isArray(entry) &&
        entry.length === 2 &&
        entry.every((part) => typeof part === 'string'),
    );
  if (
    !Number.isInteger(response?.status) ||
    response.status < HTTP_STATUS_INFORMATIONAL_MINIMUM ||
    response.status > HTTP_STATUS_SERVER_ERROR_MAXIMUM ||
    !headersValid ||
    typeof response?.body !== 'string'
  ) {
    throw new RequestCellRoutingError(
      REQUEST_CELL_ROUTE_ERROR_CODE.INVALID_COMPONENT_RESPONSE,
      REQUEST_CELL_CONTRACT_MESSAGE.COMPONENT_RESPONSE_INVALID,
      {invoked: true},
    );
  }
  return Object.freeze({
    body: response.body,
    headers: Object.freeze(
      response.headers.map((entry) => Object.freeze([...entry])),
    ),
    status: response.status,
  });
}

function createRoutingFailure(code, message, options = {}) {
  return new RequestCellRoutingError(code, message, options);
}

export {
  REQUEST_CELL_ROUTE_CLASSIFICATION,
  REQUEST_CELL_ROUTE_ERROR_CODE,
  REQUEST_CELL_ROUTE_MESSAGE_TYPE,
  REQUEST_CELL_ROUTE_OPERATION,
  RequestCellRoutingError,
  canonicalJson,
  createInvocationIdentity,
  createInvocationIntentDigest,
  createRequestDigest,
  createRoutingFailure,
  freezeSecurityContext,
  normalizeComponentResponse,
};
