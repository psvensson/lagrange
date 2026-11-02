import {randomUUID} from 'node:crypto';

import {
  SERVICE_MESSAGE_FIELD,
  UNIFIED_SERVICE_TYPE,
} from '../constants/unified-service-lifecycle.js';
import {
  canonicalizeAdmittedRequestUrl,
} from '../control-plane/owners/deployment-binding-contract.js';
import {
  CellIngressAdapterBase,
  createActiveRequest,
  createRequestCancellationAwaiter,
} from './cell-ingress-transport.js';
import {
  BODY_FORBIDDEN_STATUSES,
  DEFAULT_INVOCATION_RETENTION_WINDOW_MS,
  REQUEST_CELL_ROUTE_CLASSIFICATION,
  REQUEST_CELL_ROUTE_ERROR_CODE,
  REQUEST_CELL_ROUTE_MESSAGE_TYPE,
  REQUEST_CELL_ROUTE_OPERATION,
  RequestCellRoutingError,
  createInvocationIdentity,
  createInvocationIntentDigest,
  createRequestDigest,
  createRoutingFailure,
  createSemanticInvocationIntentDigest,
  freezeSecurityContext,
} from './request-cell-routing-contract.js';
import {ServicePolicyViolationError} from
  './service-lifecycle-errors.js';

const IDEMPOTENCY_HEADER = 'idempotency-key';
const RESPONSE_CONTENT_TYPE = 'content-type';
const SET_COOKIE_HEADER = 'set-cookie';
const CONNECTION_HEADER = 'connection';
const JSON_CONTENT_TYPE = 'application/json; charset=utf-8';
const REQUEST_CELL_URL_ORIGIN = 'http://request-cell.local';
const FETCH_HANDLER_ID = 'fetch';
const FETCH_ENVELOPE_MODE = 'fetch';
const GET_METHOD = 'GET';
const HEAD_METHOD = 'HEAD';
const UTF8_ENCODING = 'utf8';
const BASE64_ENCODING = 'base64';
const HEADER_TOKEN_DELIMITER = ',';
const KEY_SCOPE_DELIMITER = ':';
const ABORT_EVENT = 'abort';
const BODY_BYTES_PROPERTY = 'bodyBytes';
const DEFAULT_MAX_REQUEST_INPUT_BYTES = 1048576;
const HTTP_STATUS_BAD_REQUEST = 400;
const HTTP_STATUS_CONFLICT = 409;
const HTTP_STATUS_GONE = 410;
const HTTP_STATUS_PAYLOAD_TOO_LARGE = 413;
const HTTP_STATUS_CLIENT_CLOSED_REQUEST = 499;
const HTTP_STATUS_SERVICE_UNAVAILABLE = 503;
const INVALID_JSON_BODY_MESSAGE = 'Request body must be a valid JSON object';
const NON_OBJECT_JSON_BODY_MESSAGE = 'Request body must be a JSON object';
const REQUEST_BODY_TOO_LARGE_MESSAGE =
  'Request body exceeds the configured input byte limit';
const FORWARDED_REQUEST_HEADERS = Object.freeze(['accept', 'content-type']);
const FORBIDDEN_HOP_HEADERS = Object.freeze([
  'connection', 'content-length', 'keep-alive', 'proxy-authenticate',
  'proxy-authorization', 'te', 'trailer', 'transfer-encoding', 'upgrade',
]);
const HOP_BY_HOP_REQUEST_HEADERS = Object.freeze(new Set(FORBIDDEN_HOP_HEADERS));
const CONSUMED_INGRESS_CREDENTIAL_HEADERS = Object.freeze(new Set([
  'authorization', 'x-lagrange-token',
]));
const COMPONENT_FORBIDDEN_RESPONSE_HEADERS = new Set(FORBIDDEN_HOP_HEADERS);
const REQUEST_CELL_ADAPTER_MESSAGE = Object.freeze({
  CANCELLED: 'Request Cell invocation was cancelled',
  DEADLINE_EXPIRED: 'Request Cell deadline expired',
  DISPATCH_FAILED: 'Request Cell dispatch failed',
  HANDLER_OUTCOME_MISSING: 'Request Cell handler did not return a typed outcome',
  INGRESS_OVERLOADED: 'Request Cell ingress is overloaded before dispatch',
  INTENT_CONFLICT:
    'Invocation identity is already bound to different request intent',
  INVOCATION_EXPIRED: 'Retained Request Cell invocation record has expired',
  INVOCATION_FAILED: 'Request Cell invocation failed',
  OUTCOME_AMBIGUOUS:
    'Invocation outcome is ambiguous; effects will not be repeated',
  REQUIRE_AUTHENTICATOR: 'RequestCellHttpAdapter requires authenticateRequest',
  REQUIRE_DISPATCHER: 'RequestCellHttpAdapter requires ServiceDispatcher',
  REQUIRE_RESOLVER:
    'RequestCellHttpAdapter requires RequestBindingRouteResolver',
  SHUTTING_DOWN: 'Request Cell ingress is shutting down',
});
const FORBIDDEN_AUTHORITY_HEADERS = Object.freeze([
  'x-binding-version-id', 'x-principal', 'x-replica-id',
  'x-service-id', 'x-target-node-id', 'x-tenant-id',
]);

function requestPath(request) {
  return new URL(request.url, REQUEST_CELL_URL_ORIGIN).pathname;
}

function normalizedRequestHeaders(headers = {}) {
  const selected = {};
  for (const name of FORWARDED_REQUEST_HEADERS) {
    if (typeof headers[name] === 'string') selected[name] = headers[name];
  }
  return selected;
}

function parseConnectionHeaderTokens(headers = {}) {
  const excluded = new Set();
  for (const [key, rawValue] of Object.entries(headers)) {
    if (key.toLowerCase() !== CONNECTION_HEADER || !rawValue) continue;
    const text = Array.isArray(rawValue) ?
      rawValue.join(HEADER_TOKEN_DELIMITER) : String(rawValue);
    for (const token of text.split(HEADER_TOKEN_DELIMITER)) {
      const normalized = token.trim().toLowerCase();
      if (normalized.length > 0) excluded.add(normalized);
    }
  }
  return excluded;
}

function isFilteredRequestHeader(lowerName, connectionTokens) {
  return HOP_BY_HOP_REQUEST_HEADERS.has(lowerName) ||
    CONSUMED_INGRESS_CREDENTIAL_HEADERS.has(lowerName) ||
    connectionTokens.has(lowerName);
}

function appendNormalizedHeaderEntries(entries, lowerName, rawValue) {
  if (rawValue === undefined || rawValue === null) return;
  if (Array.isArray(rawValue)) {
    for (const item of rawValue) {
      if (item !== undefined && item !== null) {
        entries.push(Object.freeze([lowerName, String(item)]));
      }
    }
    return;
  }
  entries.push(Object.freeze([lowerName, String(rawValue)]));
}

function normalizeFetchRequestHeaders(headers = {}) {
  const connectionTokens = parseConnectionHeaderTokens(headers);
  const sortedKeys = Object.keys(headers).sort((a, b) =>
    a.toLowerCase().localeCompare(b.toLowerCase()));
  const entries = [];
  for (const key of sortedKeys) {
    const lowerName = key.toLowerCase();
    if (!isFilteredRequestHeader(lowerName, connectionTokens)) {
      appendNormalizedHeaderEntries(entries, lowerName, headers[key]);
    }
  }
  return Object.freeze(entries);
}

function resolveRawRequestBodyBytes(request, method) {
  if (method === GET_METHOD || method === HEAD_METHOD) return null;
  const rawBody = request.rawBody !== undefined ? request.rawBody : request.body;
  if (rawBody === undefined || rawBody === null) return null;
  if (Buffer.isBuffer(rawBody) || rawBody instanceof Uint8Array) {
    return Buffer.from(rawBody);
  }
  if (typeof rawBody === 'string') return Buffer.from(rawBody, UTF8_ENCODING);
  return Buffer.from(JSON.stringify(rawBody), UTF8_ENCODING);
}

function resolveAdmittedFetchUrl(request, route) {
  if (typeof route?.admittedUrl === 'string') return route.admittedUrl;
  try {
    return canonicalizeAdmittedRequestUrl({
      headers: request.headers, url: request.url,
    }).url;
  } catch (cause) {
    throw createRoutingFailure(
      REQUEST_CELL_ROUTE_ERROR_CODE.INVALID_REQUEST,
      cause.message,
      {cause, httpStatus: HTTP_STATUS_BAD_REQUEST},
    );
  }
}

function normalizeFetchHttpRequest(
  request, method, path, route, maxInputBytes = DEFAULT_MAX_REQUEST_INPUT_BYTES,
) {
  const bodyBytes = resolveRawRequestBodyBytes(request, method);
  if (bodyBytes && bodyBytes.byteLength > maxInputBytes) {
    throw createRoutingFailure(
      REQUEST_CELL_ROUTE_ERROR_CODE.BUDGET_EXHAUSTED,
      REQUEST_BODY_TOO_LARGE_MESSAGE,
      {httpStatus: HTTP_STATUS_PAYLOAD_TOO_LARGE},
    );
  }
  const url = resolveAdmittedFetchUrl(request, route);
  return Object.freeze({
    body: bodyBytes ? bodyBytes.toString(UTF8_ENCODING) : null,
    bodyBase64: bodyBytes ? bodyBytes.toString(BASE64_ENCODING) : null,
    headers: normalizeFetchRequestHeaders(request.headers),
    method, path, url,
  });
}

function isFetchMountRoute(route) {
  return route?.handlerId === FETCH_HANDLER_ID ||
    typeof route?.mountPath === 'string';
}

function isPlainObject(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function normalizeHttpRequestBody(rawBody) {
  if (rawBody === undefined || rawBody === null) return null;
  if (typeof rawBody === 'string') {
    if (rawBody.trim().length === 0) return null;
    let parsed;
    try {
      parsed = JSON.parse(rawBody);
    } catch (cause) {
      throw createRoutingFailure(
        REQUEST_CELL_ROUTE_ERROR_CODE.INVALID_REQUEST,
        INVALID_JSON_BODY_MESSAGE,
        {cause, httpStatus: HTTP_STATUS_BAD_REQUEST},
      );
    }
    if (!isPlainObject(parsed)) {
      throw createRoutingFailure(
        REQUEST_CELL_ROUTE_ERROR_CODE.INVALID_REQUEST,
        NON_OBJECT_JSON_BODY_MESSAGE,
        {httpStatus: HTTP_STATUS_BAD_REQUEST},
      );
    }
    return parsed;
  }
  if (isPlainObject(rawBody)) return rawBody;
  throw createRoutingFailure(
    REQUEST_CELL_ROUTE_ERROR_CODE.INVALID_REQUEST,
    NON_OBJECT_JSON_BODY_MESSAGE,
    {httpStatus: HTTP_STATUS_BAD_REQUEST},
  );
}

function normalizeHttpRequest(request, method, path) {
  const body = normalizeHttpRequestBody(request.body);
  return Object.freeze({
    body: body ? Object.freeze({...body}) : null,
    headers: Object.freeze(normalizedRequestHeaders(request.headers)),
    method, path, query: Object.freeze({...request.query}),
  });
}

function rejectAuthorityHeaders(headers = {}) {
  const entries = Object.entries(headers);
  const forbidden = FORBIDDEN_AUTHORITY_HEADERS.find((name) =>
    entries.some(([k, v]) => k.toLowerCase() === name && v !== undefined));
  if (forbidden) {
    throw createRoutingFailure(
      REQUEST_CELL_ROUTE_ERROR_CODE.AUTHORITY_FIELD_REJECTED,
      `Client authority header is forbidden: ${forbidden}`,
    );
  }
}

function applyResponseMethodAndStatusRules(response, method) {
  if (method !== HEAD_METHOD && !BODY_FORBIDDEN_STATUSES.has(response.status)) {
    return response;
  }
  const stripped = {body: '', headers: response.headers, status: response.status};
  if (response.bodyBase64 !== undefined) stripped.bodyBase64 = '';
  Object.defineProperty(stripped, BODY_BYTES_PROPERTY, {
    configurable: false, enumerable: false, value: Buffer.alloc(0), writable: false,
  });
  return Object.freeze(stripped);
}

function applyResponseHeadersToReply(headers, reply) {
  const setCookieValues = [];
  for (const [name, value] of headers) {
    const lower = name.toLowerCase();
    if (COMPONENT_FORBIDDEN_RESPONSE_HEADERS.has(lower)) continue;
    if (lower === SET_COOKIE_HEADER) {
      setCookieValues.push(value);
      continue;
    }
    reply.header(name, value);
  }
  if (setCookieValues.length === 1) {
    reply.header(SET_COOKIE_HEADER, setCookieValues[0]);
  } else if (setCookieValues.length > 1) {
    reply.header(SET_COOKIE_HEADER, setCookieValues);
  }
}

function selectReplyBodyPayload(response) {
  const bytes = response.bodyBytes;
  if (Buffer.isBuffer(bytes) &&
      Buffer.from(response.body, UTF8_ENCODING).compare(bytes) !== 0) {
    return bytes;
  }
  return response.body;
}

function buildEnvelopeInvocationPayload(fields) {
  if (!fields.fetchMode) {
    return Object.freeze({
      deadlineMs: fields.deadlineMs,
      id: fields.invocationId,
      intentDigest: fields.intentDigest,
    });
  }
  return Object.freeze({
    deadlineMs: fields.deadlineMs,
    explicitBindingVersionId: fields.explicitBindingVersionId || null,
    id: fields.invocationId,
    intentDigest: fields.intentDigest,
    pinnedBindingVersionId: fields.pinnedBindingVersionId || null,
    retentionWindowMs: fields.retentionWindowMs,
    semanticIntentDigest: fields.semanticIntentDigest || null,
  });
}

function buildEnvelope(fields) {
  return Object.freeze({
    [SERVICE_MESSAGE_FIELD.MESSAGE_ID]:
      `${fields.invocationId}:delivery:${fields.dispatchId}:attempt:${fields.attempt}`,
    [SERVICE_MESSAGE_FIELD.SERVICE_ID]: fields.route.serviceId,
    [SERVICE_MESSAGE_FIELD.SERVICE_TYPE]: UNIFIED_SERVICE_TYPE.RUNTIME_SERVICE,
    [SERVICE_MESSAGE_FIELD.OPERATION]: REQUEST_CELL_ROUTE_OPERATION,
    [SERVICE_MESSAGE_FIELD.PAYLOAD]: Object.freeze({
      invocation: buildEnvelopeInvocationPayload(fields),
      request: fields.normalizedRequest,
      route: fields.route,
      type: REQUEST_CELL_ROUTE_MESSAGE_TYPE,
    }),
    [SERVICE_MESSAGE_FIELD.METADATA]: Object.freeze({
      roles: fields.securityContext.roles,
    }),
    [SERVICE_MESSAGE_FIELD.TENANT_ID]: fields.securityContext.tenantId,
    [SERVICE_MESSAGE_FIELD.PRINCIPAL]: fields.securityContext.principal,
    [SERVICE_MESSAGE_FIELD.TRACE_ID]: fields.traceId,
    [SERVICE_MESSAGE_FIELD.TIMESTAMP]: Date.now(),
  });
}

function normalizeDispatchError(error) {
  if (error instanceof RequestCellRoutingError) return error;
  if (error instanceof ServicePolicyViolationError) {
    return createRoutingFailure(
      REQUEST_CELL_ROUTE_ERROR_CODE.AUTHORIZATION_FAILED,
      error.message,
      {cause: error},
    );
  }
  return createRoutingFailure(
    REQUEST_CELL_ROUTE_ERROR_CODE.HANDLER_FAILED,
    error?.message || REQUEST_CELL_ADAPTER_MESSAGE.DISPATCH_FAILED,
    {cause: error, classification: REQUEST_CELL_ROUTE_CLASSIFICATION.AMBIGUOUS},
  );
}

function createShutdownFailure(activeRequest = {}) {
  const invoked = activeRequest.dispatchStarted === true;
  return createRoutingFailure(
    REQUEST_CELL_ROUTE_ERROR_CODE.SHUTTING_DOWN,
    REQUEST_CELL_ADAPTER_MESSAGE.SHUTTING_DOWN,
    {
      classification: invoked ?
        REQUEST_CELL_ROUTE_CLASSIFICATION.AMBIGUOUS :
        REQUEST_CELL_ROUTE_CLASSIFICATION.RETRYABLE,
      invoked,
    },
  );
}

function createCancelledFailure(activeRequest = {}) {
  const invoked = activeRequest.dispatchStarted === true;
  return createRoutingFailure(
    REQUEST_CELL_ROUTE_ERROR_CODE.CANCELLED,
    REQUEST_CELL_ADAPTER_MESSAGE.CANCELLED,
    {
      classification: invoked ?
        REQUEST_CELL_ROUTE_CLASSIFICATION.AMBIGUOUS :
        REQUEST_CELL_ROUTE_CLASSIFICATION.TERMINAL,
      httpStatus: HTTP_STATUS_CLIENT_CLOSED_REQUEST,
      invoked,
    },
  );
}

const awaitWithRequestCancellation =
  createRequestCancellationAwaiter(createShutdownFailure);

function failureFromDelivery(delivery) {
  const outcome = delivery?.invocationOutcome;
  if (!outcome || typeof outcome.code !== 'string') {
    return createRoutingFailure(
      REQUEST_CELL_ROUTE_ERROR_CODE.ACK_ONLY,
      REQUEST_CELL_ADAPTER_MESSAGE.HANDLER_OUTCOME_MISSING,
      {classification: REQUEST_CELL_ROUTE_CLASSIFICATION.AMBIGUOUS},
    );
  }
  return createRoutingFailure(
    outcome.code,
    outcome.message || REQUEST_CELL_ADAPTER_MESSAGE.INVOCATION_FAILED,
    {
      classification:
        outcome.classification || REQUEST_CELL_ROUTE_CLASSIFICATION.TERMINAL,
      invoked: outcome.invoked === true,
    },
  );
}

const REQUEST_CELL_INGRESS_KIT = Object.freeze({
  buildEnvelope,
  createOverloadFailure: () => createRoutingFailure(
    REQUEST_CELL_ROUTE_ERROR_CODE.OVERLOADED,
    REQUEST_CELL_ADAPTER_MESSAGE.INGRESS_OVERLOADED,
    {classification: REQUEST_CELL_ROUTE_CLASSIFICATION.RETRYABLE},
  ),
  createShutdownFailure,
  failureFromDelivery,
  mapProcessedDelivery: (delivery) => delivery.componentResponse,
  normalizeDispatchError,
});

function assertAdapterDependencies(options) {
  if (typeof options.authenticateRequest !== 'function') {
    throw new TypeError(REQUEST_CELL_ADAPTER_MESSAGE.REQUIRE_AUTHENTICATOR);
  }
  if (typeof options.routeResolver?.resolve !== 'function') {
    throw new TypeError(REQUEST_CELL_ADAPTER_MESSAGE.REQUIRE_RESOLVER);
  }
  if (typeof options.serviceDispatcher?.dispatch !== 'function') {
    throw new TypeError(REQUEST_CELL_ADAPTER_MESSAGE.REQUIRE_DISPATCHER);
  }
}

function resolvePositiveNumber(value, fallback) {
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

class RequestCellHttpAdapter extends CellIngressAdapterBase {
  constructor(options = {}) {
    assertAdapterDependencies(options);
    super(options, REQUEST_CELL_INGRESS_KIT);
    this._authenticateRequest = options.authenticateRequest;
    this._cancelRuntimeInvocation =
      typeof options.cancelRuntimeInvocation === 'function' ?
        options.cancelRuntimeInvocation : null;
    this._envelopeMode = options.envelopeMode || null;
    this._maxInputBytes = resolvePositiveNumber(
      options.maxInputBytes, DEFAULT_MAX_REQUEST_INPUT_BYTES,
    );
    this._retentionWindowMs = resolvePositiveNumber(
      options.retentionWindowMs, DEFAULT_INVOCATION_RETENTION_WINDOW_MS,
    );
    this._now = typeof options.now === 'function' ? options.now : Date.now;
    this._pinnedRevisionsByKeyScope = new Map();
    this._inFlightKeyedWaiters = new Map();
    this._primaryKeyScopeByTenantKey = new Map();
  }

  _normalizeRequestForRoute(request, method, path, route) {
    const fetchMode =
      this._envelopeMode === FETCH_ENVELOPE_MODE || isFetchMountRoute(route);
    const normalizedRequest = fetchMode ?
      normalizeFetchHttpRequest(request, method, path, route, this._maxInputBytes) :
      normalizeHttpRequest(request, method, path);
    const requestDigest = createRequestDigest(normalizedRequest);
    const intentPath = fetchMode ? normalizedRequest.url : path;
    const semanticIntentDigest = createSemanticInvocationIntentDigest({
      method, path: intentPath, requestDigest, tenantId: route.tenantId,
    });
    return {fetchMode, intentPath, normalizedRequest, requestDigest, semanticIntentDigest};
  }

  _resolveScopedInvocationId(securityContext, rawKey, bindingScope) {
    const baseId = createInvocationIdentity(securityContext.tenantId, rawKey);
    if (typeof rawKey !== 'string' || rawKey.length === 0) {
      return {invocationId: baseId, keyScope: null};
    }
    const tenantKey = [securityContext.tenantId, rawKey].join(KEY_SCOPE_DELIMITER);
    const keyScope = [
      securityContext.tenantId, securityContext.principal, bindingScope, rawKey,
    ].join(KEY_SCOPE_DELIMITER);
    const primaryScope = this._primaryKeyScopeByTenantKey.get(tenantKey);
    if (!primaryScope) {
      this._primaryKeyScopeByTenantKey.set(tenantKey, keyScope);
      return {invocationId: baseId, keyScope};
    }
    if (primaryScope === keyScope) return {invocationId: baseId, keyScope};
    return {
      invocationId: createInvocationIdentity(
        securityContext.tenantId, rawKey,
        {bindingId: bindingScope, principal: securityContext.principal},
      ),
      keyScope,
    };
  }

  _resolvePinnedRoute(request, method, path, securityContext, invocationId,
    initialRoute, pinned) {
    if (!pinned || initialRoute.bindingVersionId === pinned.bindingVersionId) {
      return initialRoute;
    }
    try {
      return this._routeResolver.resolve({
        bindingVersionId: pinned.bindingVersionId, headers: request.headers,
        invocationId, method, path, securityContext, url: request.url,
      });
    } catch {
      return initialRoute;
    }
  }

  _validateOrRecordPinnedKey(keyScope, route, semanticIntentDigest,
    explicitBindingVersionId, invocationId, tenantId) {
    if (!keyScope) return null;
    const nowMs = this._now();
    const existing = this._pinnedRevisionsByKeyScope.get(keyScope);
    if (!existing) {
      const record = {
        bindingId: route.bindingId || route.serviceId,
        bindingVersionId: route.bindingVersionId,
        invocationId, recordedAt: nowMs, semanticIntentDigest,
        tenantId, uncertainOutcome: false,
      };
      this._pinnedRevisionsByKeyScope.set(keyScope, record);
      return record;
    }
    if (nowMs - existing.recordedAt > this._retentionWindowMs) {
      throw createRoutingFailure(
        REQUEST_CELL_ROUTE_ERROR_CODE.INVOCATION_EXPIRED,
        REQUEST_CELL_ADAPTER_MESSAGE.INVOCATION_EXPIRED,
        {httpStatus: HTTP_STATUS_GONE},
      );
    }
    const versionConflict =
      typeof explicitBindingVersionId === 'string' &&
      explicitBindingVersionId.length > 0 &&
      explicitBindingVersionId !== existing.bindingVersionId;
    if (existing.semanticIntentDigest !== semanticIntentDigest || versionConflict) {
      throw createRoutingFailure(
        REQUEST_CELL_ROUTE_ERROR_CODE.INVOCATION_CONFLICT,
        REQUEST_CELL_ADAPTER_MESSAGE.INTENT_CONFLICT,
        {httpStatus: HTTP_STATUS_CONFLICT},
      );
    }
    if (existing.uncertainOutcome === true) {
      throw createRoutingFailure(
        REQUEST_CELL_ROUTE_ERROR_CODE.INVOCATION_AMBIGUOUS,
        REQUEST_CELL_ADAPTER_MESSAGE.OUTCOME_AMBIGUOUS,
        {
          classification: REQUEST_CELL_ROUTE_CLASSIFICATION.AMBIGUOUS,
          httpStatus: HTTP_STATUS_SERVICE_UNAVAILABLE,
          invoked: true,
        },
      );
    }
    return existing;
  }

  _prepareAttemptContext(request, method, path, securityContext, rawKey) {
    const baseInvocationId = createInvocationIdentity(securityContext.tenantId, rawKey);
    const probeRoute = this._routeResolver.resolve({
      headers: request.headers, invocationId: baseInvocationId,
      method, path, securityContext, url: request.url,
    });
    const bindingScope = probeRoute.bindingId || probeRoute.serviceId;
    const {invocationId, keyScope} = this._resolveScopedInvocationId(
      securityContext, rawKey, bindingScope,
    );
    const initialRoute = invocationId === baseInvocationId ?
      probeRoute :
      this._routeResolver.resolve({
        headers: request.headers, invocationId,
        method, path, securityContext, url: request.url,
      });
    const existingPin = keyScope ? this._pinnedRevisionsByKeyScope.get(keyScope) : null;
    const route = this._resolvePinnedRoute(
      request, method, path, securityContext, invocationId, initialRoute, existingPin,
    );
    const normalized = this._normalizeRequestForRoute(
      request, method, path, {...route, tenantId: securityContext.tenantId},
    );
    const pinnedRecord = this._validateOrRecordPinnedKey(
      keyScope, route, normalized.semanticIntentDigest,
      request.bindingVersionId, invocationId, securityContext.tenantId,
    );
    const effectiveBindingVersionId =
      pinnedRecord?.bindingVersionId || route.bindingVersionId;
    const intentDigest = createInvocationIntentDigest({
      bindingVersionId: effectiveBindingVersionId, method,
      path: normalized.intentPath, requestDigest: normalized.requestDigest,
      tenantId: securityContext.tenantId,
    });
    return {
      explicitBindingVersionId: request.bindingVersionId || null,
      fetchMode: normalized.fetchMode, intentDigest, invocationId, keyScope,
      normalizedRequest: normalized.normalizedRequest,
      pinnedBindingVersionId: effectiveBindingVersionId, pinnedRecord,
      route, semanticIntentDigest: normalized.semanticIntentDigest,
    };
  }

  _attachWaiterToKeyedEntry(entry, waiterSignal, waiterActiveRequest) {
    if (waiterSignal?.aborted) {
      return Promise.reject(createCancelledFailure(entry.invocationActiveRequest));
    }
    const waiter = {signal: waiterSignal || null};
    entry.waiters.add(waiter);
    const shutdownSignal = waiterActiveRequest?.abortController?.signal;
    return new Promise((resolve, reject) => {
      let finished = false;
      function onShutdownAbort() {
        if (!entry.settled) {
          entry.invocationActiveRequest.abortController.abort(
            createShutdownFailure(entry.invocationActiveRequest),
          );
        }
      }
      const self = this;
      function onAbort() {
        const cancelError = createCancelledFailure(entry.invocationActiveRequest);
        if (finished) return;
        finished = true;
        entry.waiters.delete(waiter);
        waiterSignal?.removeEventListener(ABORT_EVENT, onAbort);
        shutdownSignal?.removeEventListener(ABORT_EVENT, onShutdownAbort);
        if (entry.waiters.size === 0 && !entry.settled) {
          self._abortKeyedEntry(entry, cancelError);
        }
        reject(cancelError);
      }
      const settle = (fn, arg) => {
        if (finished) return;
        finished = true;
        entry.waiters.delete(waiter);
        waiterSignal?.removeEventListener(ABORT_EVENT, onAbort);
        shutdownSignal?.removeEventListener(ABORT_EVENT, onShutdownAbort);
        fn(arg);
      };
      waiterSignal?.addEventListener(ABORT_EVENT, onAbort, {once: true});
      shutdownSignal?.addEventListener(ABORT_EVENT, onShutdownAbort, {once: true});
      entry.promise.then((v) => settle(resolve, v), (e) => settle(reject, e));
    });
  }

  _abortKeyedEntry(entry, cancelError) {
    if (entry.settled) return;
    if (entry.invocationActiveRequest.dispatchStarted && entry.pinnedRecord) {
      entry.pinnedRecord.uncertainOutcome = true;
    }
    this._cancelRuntimeInvocation?.(entry.tenantId, entry.invocationId);
    entry.invocationActiveRequest.abortController.abort(cancelError);
  }

  cancelInvocation(options = {}) {
    for (const [keyScope, entry] of this._inFlightKeyedWaiters.entries()) {
      const matchesKey = options.invocationId === entry.invocationId ||
        (typeof options.idempotencyKey === 'string' &&
          keyScope.endsWith(`${KEY_SCOPE_DELIMITER}${options.idempotencyKey}`));
      const matchesTenant = !options.tenantId || options.tenantId === entry.tenantId;
      if (matchesKey && matchesTenant && !entry.settled) {
        this._abortKeyedEntry(entry, createCancelledFailure(entry.invocationActiveRequest));
        return true;
      }
    }
    return false;
  }

  _executeSingleAttemptLoop(request, method, path, securityContext, rawKey,
    deadlineMs, dispatchId, executionActiveRequest) {
    return this._attemptOwner.run(async (attempt) => {
      this._assertOpen(executionActiveRequest);
      if (this._now() >= deadlineMs) {
        throw createRoutingFailure(
          REQUEST_CELL_ROUTE_ERROR_CODE.DEADLINE_EXHAUSTED,
          REQUEST_CELL_ADAPTER_MESSAGE.DEADLINE_EXPIRED,
        );
      }
      const prepared = this._prepareAttemptContext(
        request, method, path, securityContext, rawKey,
      );
      return this._dispatchAttempt({
        activeRequest: executionActiveRequest, attempt, deadlineMs, dispatchId,
        explicitBindingVersionId: prepared.explicitBindingVersionId,
        fetchMode: prepared.fetchMode,
        ingressNodeId: request.server?.nodeId || null,
        intentDigest: prepared.intentDigest, invocationId: prepared.invocationId,
        normalizedRequest: prepared.normalizedRequest,
        pinnedBindingVersionId: prepared.pinnedBindingVersionId,
        retentionWindowMs: this._retentionWindowMs,
        route: prepared.route, securityContext,
        semanticIntentDigest: prepared.semanticIntentDigest,
        traceId: request.id || prepared.invocationId,
      });
    });
  }

  _invokeKeyedWithWaiters(request, method, path, securityContext, rawKey,
    deadlineMs, dispatchId, waiterActiveRequest) {
    const initialPrepared = this._prepareAttemptContext(
      request, method, path, securityContext, rawKey,
    );
    const {keyScope} = initialPrepared;
    const existing = this._inFlightKeyedWaiters.get(keyScope);
    if (existing) {
      return this._attachWaiterToKeyedEntry(existing, request.signal, waiterActiveRequest);
    }
    const invocationActiveRequest = createActiveRequest();
    const entry = {
      invocationActiveRequest, invocationId: initialPrepared.invocationId,
      keyScope, pinnedRecord: initialPrepared.pinnedRecord, promise: null,
      semanticIntentDigest: initialPrepared.semanticIntentDigest,
      settled: false, tenantId: securityContext.tenantId, waiters: new Set(),
    };
    entry.promise = this._executeSingleAttemptLoop(
      request, method, path, securityContext, rawKey,
      deadlineMs, dispatchId, invocationActiveRequest,
    ).finally(() => {
      entry.settled = true;
      if (this._inFlightKeyedWaiters.get(keyScope) === entry) {
        this._inFlightKeyedWaiters.delete(keyScope);
      }
      invocationActiveRequest.resolveSettled();
    });
    this._inFlightKeyedWaiters.set(keyScope, entry);
    return this._attachWaiterToKeyedEntry(entry, request.signal, waiterActiveRequest);
  }

  async invoke(request) {
    if (this._shuttingDown) throw createShutdownFailure();
    const activeRequest = createActiveRequest();
    this._activeRequests.add(activeRequest);
    const onRequestSignalAbort = () => {
      activeRequest.abortController.abort(createCancelledFailure(activeRequest));
    };
    try {
      this._assertOpen(activeRequest);
      rejectAuthorityHeaders(request.headers);
      const securityContext = freezeSecurityContext(
        await awaitWithRequestCancellation(this._authenticateRequest(request), activeRequest),
      );
      const method = String(request.method || '').toUpperCase();
      const path = requestPath(request);
      const rawKey = request.headers?.[IDEMPOTENCY_HEADER];
      const deadlineMs = this._now() + this._deadlineMs;
      const dispatchId = randomUUID();
      let response;
      if (typeof rawKey === 'string' && rawKey.length > 0) {
        response = await this._invokeKeyedWithWaiters(
          request, method, path, securityContext, rawKey,
          deadlineMs, dispatchId, activeRequest,
        );
      } else {
        if (request.signal?.aborted) throw createCancelledFailure(activeRequest);
        request.signal?.addEventListener(ABORT_EVENT, onRequestSignalAbort, {once: true});
        response = await this._executeSingleAttemptLoop(
          request, method, path, securityContext, rawKey,
          deadlineMs, dispatchId, activeRequest,
        );
      }
      return applyResponseMethodAndStatusRules(response, method);
    } finally {
      request.signal?.removeEventListener(ABORT_EVENT, onRequestSignalAbort);
      this._activeRequests.delete(activeRequest);
      activeRequest.resolveSettled();
    }
  }

  async handle(request, reply) {
    try {
      const response = await this.invoke(request);
      applyResponseHeadersToReply(response.headers, reply);
      reply.code(response.status);
      return selectReplyBodyPayload(response);
    } catch (error) {
      const failure = normalizeDispatchError(error);
      reply.code(failure.httpStatus);
      reply.header(RESPONSE_CONTENT_TYPE, JSON_CONTENT_TYPE);
      return {
        classification: failure.classification, code: failure.code,
        error: failure.message, invoked: failure.invoked,
      };
    }
  }
}

export {
  RequestCellHttpAdapter,
};
