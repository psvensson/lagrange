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
  BUDGET_EXHAUSTED: 'request_cell_budget_exhausted',
  CANCELLED: 'request_cell_cancelled',
  COMPONENT_FAILED: 'request_cell_component_failed',
  DEADLINE_EXHAUSTED: 'request_cell_deadline_exhausted',
  HANDLER_FAILED: 'request_cell_handler_failed',
  INVOCATION_AMBIGUOUS: 'request_cell_invocation_ambiguous',
  INVOCATION_CONFLICT: 'request_cell_invocation_conflict',
  INVOCATION_EXPIRED: 'request_cell_invocation_expired',
  INVALID_COMPONENT_RESPONSE: 'request_cell_invalid_component_response',
  INVALID_REQUEST: 'request_cell_invalid_request',
  OVERLOADED: 'request_cell_overloaded',
  ROUTE_AMBIGUOUS: 'request_cell_route_ambiguous',
  ROUTE_NOT_FOUND: 'request_cell_route_not_found',
  ROUTE_UNAVAILABLE: 'request_cell_route_unavailable',
  SHUTTING_DOWN: 'request_cell_shutting_down',
  TARGET_STALE: 'request_cell_target_stale',
  TRANSPORT_FAILED: 'request_cell_transport_failed',
  UNFINISHED_CHILD_WORK: 'unfinished_child_work',
});
const REQUEST_CELL_ROUTE_HTTP_STATUS = Object.freeze({
  [REQUEST_CELL_ROUTE_ERROR_CODE.ACK_ONLY]: 502,
  [REQUEST_CELL_ROUTE_ERROR_CODE.AUTHENTICATION_FAILED]: 401,
  [REQUEST_CELL_ROUTE_ERROR_CODE.AUTHENTICATION_UNAVAILABLE]: 503,
  [REQUEST_CELL_ROUTE_ERROR_CODE.AUTHORITY_FIELD_REJECTED]: 400,
  [REQUEST_CELL_ROUTE_ERROR_CODE.AUTHORIZATION_FAILED]: 403,
  [REQUEST_CELL_ROUTE_ERROR_CODE.BUDGET_EXHAUSTED]: 413,
  [REQUEST_CELL_ROUTE_ERROR_CODE.CANCELLED]: 499,
  [REQUEST_CELL_ROUTE_ERROR_CODE.COMPONENT_FAILED]: 502,
  [REQUEST_CELL_ROUTE_ERROR_CODE.DEADLINE_EXHAUSTED]: 504,
  [REQUEST_CELL_ROUTE_ERROR_CODE.HANDLER_FAILED]: 502,
  [REQUEST_CELL_ROUTE_ERROR_CODE.INVOCATION_AMBIGUOUS]: 503,
  [REQUEST_CELL_ROUTE_ERROR_CODE.INVOCATION_CONFLICT]: 409,
  [REQUEST_CELL_ROUTE_ERROR_CODE.INVOCATION_EXPIRED]: 410,
  [REQUEST_CELL_ROUTE_ERROR_CODE.INVALID_COMPONENT_RESPONSE]: 502,
  [REQUEST_CELL_ROUTE_ERROR_CODE.INVALID_REQUEST]: 400,
  [REQUEST_CELL_ROUTE_ERROR_CODE.OVERLOADED]: 429,
  [REQUEST_CELL_ROUTE_ERROR_CODE.ROUTE_AMBIGUOUS]: 409,
  [REQUEST_CELL_ROUTE_ERROR_CODE.ROUTE_NOT_FOUND]: 404,
  [REQUEST_CELL_ROUTE_ERROR_CODE.ROUTE_UNAVAILABLE]: 503,
  [REQUEST_CELL_ROUTE_ERROR_CODE.SHUTTING_DOWN]: 503,
  [REQUEST_CELL_ROUTE_ERROR_CODE.TARGET_STALE]: 503,
  [REQUEST_CELL_ROUTE_ERROR_CODE.TRANSPORT_FAILED]: 502,
  [REQUEST_CELL_ROUTE_ERROR_CODE.UNFINISHED_CHILD_WORK]: 502,
});
const REQUEST_CELL_ROUTE_ERROR_NAME = 'RequestCellRoutingError';
const REQUEST_CELL_INVOCATION_ID_PREFIX = 'request-invocation-';
const HASH_ALGORITHM = 'sha256';
const HASH_ENCODING = 'hex';
const BYTE_ENCODING = 'utf8';
const BASE64_ENCODING = 'base64';
const BODY_BYTES_PROPERTY = 'bodyBytes';
const IDEMPOTENCY_KEY_MAX_BYTES = 256;
const DEFAULT_MAX_COMPONENT_OUTPUT_BYTES = 1048576;
const DEFAULT_INVOCATION_RETENTION_WINDOW_MS = 86400000;
const DEFAULT_INVOCATION_RETENTION_MAX_BYTES = 1048576;
const HEADER_PAIR_LENGTH = 2;
const HTTP_STATUS_INFORMATIONAL_MINIMUM = 100;
const HTTP_STATUS_SWITCHING_PROTOCOLS = 101;
const HTTP_STATUS_NO_CONTENT = 204;
const HTTP_STATUS_RESET_CONTENT = 205;
const HTTP_STATUS_NOT_MODIFIED = 304;
const HTTP_STATUS_BAD_GATEWAY = 502;
const HTTP_STATUS_SERVER_ERROR_MAXIMUM = 599;
const HTTP_STATUS_INTERNAL_SERVER_ERROR = 500;
const BODY_FORBIDDEN_STATUSES = Object.freeze(new Set([
  HTTP_STATUS_SWITCHING_PROTOCOLS,
  HTTP_STATUS_NO_CONTENT,
  HTTP_STATUS_RESET_CONTENT,
  HTTP_STATUS_NOT_MODIFIED,
]));
const REQUEST_CELL_CONTRACT_MESSAGE = Object.freeze({
  COMPONENT_RESPONSE_INVALID:
    'Request Cell Component response must contain status, headers, and body',
  COMPONENT_RESPONSE_JSON_INVALID:
    'Request Cell Component returned invalid response JSON',
  COMPONENT_RESPONSE_TOO_LARGE:
    'Request Cell Component response exceeds output byte budget',
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

function createInvocationIdentity(tenantId, idempotencyKey, scope = null) {
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
  const hasScope =
    typeof scope?.principal === 'string' ||
    typeof scope?.bindingId === 'string';
  const payload = hasScope ?
    {
      bindingId: scope.bindingId || null,
      principal: scope.principal || null,
      requestKey,
      tenantId,
    } :
    {requestKey, tenantId};
  return `${REQUEST_CELL_INVOCATION_ID_PREFIX}${sha256(
    canonicalJson(payload),
  )}`;
}

function createScopedInvocationKey(fields) {
  return `${REQUEST_CELL_INVOCATION_ID_PREFIX}${sha256(
    canonicalJson({
      bindingId: fields.bindingId || null,
      invocationId: fields.invocationId,
      principal: fields.principal || null,
      tenantId: fields.tenantId,
    }),
  )}`;
}

function createSemanticInvocationIntentDigest(fields) {
  return `sha256:${sha256(canonicalJson({
    method: fields.method,
    path: fields.path,
    requestDigest: fields.requestDigest,
    tenantId: fields.tenantId,
  }))}`;
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

function parseComponentResponseInput(value) {
  if (typeof value !== 'string') return value;
  try {
    return JSON.parse(value);
  } catch (cause) {
    throw new RequestCellRoutingError(
      REQUEST_CELL_ROUTE_ERROR_CODE.INVALID_COMPONENT_RESPONSE,
      REQUEST_CELL_CONTRACT_MESSAGE.COMPONENT_RESPONSE_JSON_INVALID,
      {cause, invoked: true},
    );
  }
}

function isValidComponentResponseShape(response) {
  const headersValid =
    Array.isArray(response?.headers) &&
    response.headers.every(
      (entry) =>
        Array.isArray(entry) &&
        entry.length === HEADER_PAIR_LENGTH &&
        entry.every((part) => typeof part === 'string'),
    );
  const statusValid =
    Number.isInteger(response?.status) &&
    response.status >= HTTP_STATUS_INFORMATIONAL_MINIMUM &&
    response.status <= HTTP_STATUS_SERVER_ERROR_MAXIMUM;
  const bodyValid =
    typeof response?.body === 'string' ||
    typeof response?.bodyBase64 === 'string';
  return headersValid && statusValid && bodyValid;
}

function resolveResponseBodyPayload(response, maxOutputBytes) {
  const hasBase64 = typeof response.bodyBase64 === 'string';
  const rawBytes = hasBase64 ?
    Buffer.from(response.bodyBase64, BASE64_ENCODING) :
    Buffer.from(response.body, BYTE_ENCODING);
  if (rawBytes.byteLength > maxOutputBytes) {
    throw new RequestCellRoutingError(
      REQUEST_CELL_ROUTE_ERROR_CODE.BUDGET_EXHAUSTED,
      REQUEST_CELL_CONTRACT_MESSAGE.COMPONENT_RESPONSE_TOO_LARGE,
      {httpStatus: HTTP_STATUS_BAD_GATEWAY, invoked: true},
    );
  }
  if (BODY_FORBIDDEN_STATUSES.has(response.status)) {
    return {
      body: '',
      bodyBase64: hasBase64 ? '' : undefined,
      bodyBytes: Buffer.alloc(0),
    };
  }
  return {
    body: typeof response.body === 'string' ?
      response.body :
      rawBytes.toString(BYTE_ENCODING),
    bodyBase64: hasBase64 ? response.bodyBase64 : undefined,
    bodyBytes: rawBytes,
  };
}

function normalizeComponentResponse(value, options = {}) {
  const response = parseComponentResponseInput(value);
  if (!isValidComponentResponseShape(response)) {
    throw new RequestCellRoutingError(
      REQUEST_CELL_ROUTE_ERROR_CODE.INVALID_COMPONENT_RESPONSE,
      REQUEST_CELL_CONTRACT_MESSAGE.COMPONENT_RESPONSE_INVALID,
      {invoked: true},
    );
  }
  const maxOutputBytes =
    Number.isSafeInteger(options.maxOutputBytes) && options.maxOutputBytes > 0 ?
      options.maxOutputBytes :
      DEFAULT_MAX_COMPONENT_OUTPUT_BYTES;
  const payload = resolveResponseBodyPayload(response, maxOutputBytes);
  const normalized = {
    body: payload.body,
    headers: Object.freeze(
      response.headers.map((entry) => Object.freeze([...entry])),
    ),
    status: response.status,
  };
  if (payload.bodyBase64 !== undefined) {
    normalized.bodyBase64 = payload.bodyBase64;
  }
  Object.defineProperty(normalized, BODY_BYTES_PROPERTY, {
    configurable: false,
    enumerable: false,
    value: payload.bodyBytes,
    writable: false,
  });
  return Object.freeze(normalized);
}

function createRoutingFailure(code, message, options = {}) {
  return new RequestCellRoutingError(code, message, options);
}

export {
  BODY_FORBIDDEN_STATUSES,
  DEFAULT_INVOCATION_RETENTION_MAX_BYTES,
  DEFAULT_INVOCATION_RETENTION_WINDOW_MS,
  DEFAULT_MAX_COMPONENT_OUTPUT_BYTES,
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
  createScopedInvocationKey,
  createSemanticInvocationIntentDigest,
  freezeSecurityContext,
  normalizeComponentResponse,
};
