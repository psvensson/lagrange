import {randomUUID} from 'node:crypto';

import {
  SERVICE_MESSAGE_FIELD,
  UNIFIED_SERVICE_TYPE,
} from '../constants/unified-service-lifecycle.js';
import {
  CellIngressAdapterBase,
  createActiveRequest,
  createRequestCancellationAwaiter,
} from './cell-ingress-transport.js';
import {
  REQUEST_CELL_ROUTE_CLASSIFICATION,
  REQUEST_CELL_ROUTE_ERROR_CODE,
  REQUEST_CELL_ROUTE_MESSAGE_TYPE,
  REQUEST_CELL_ROUTE_OPERATION,
  RequestCellRoutingError,
  createInvocationIdentity,
  createInvocationIntentDigest,
  createRequestDigest,
  createRoutingFailure,
  freezeSecurityContext,
} from './request-cell-routing-contract.js';
import {ServicePolicyViolationError} from
  './service-lifecycle-errors.js';

const IDEMPOTENCY_HEADER = 'idempotency-key';
const RESPONSE_CONTENT_TYPE = 'content-type';
const JSON_CONTENT_TYPE = 'application/json; charset=utf-8';
const REQUEST_CELL_URL_ORIGIN = 'http://request-cell.local';
const FORWARDED_REQUEST_HEADERS = Object.freeze([
  'accept',
  'content-type',
]);
const REQUEST_CELL_ADAPTER_MESSAGE = Object.freeze({
  DEADLINE_EXPIRED: 'Request Cell deadline expired',
  DISPATCH_FAILED: 'Request Cell dispatch failed',
  HANDLER_OUTCOME_MISSING:
    'Request Cell handler did not return a typed outcome',
  INGRESS_OVERLOADED:
    'Request Cell ingress is overloaded before dispatch',
  INVOCATION_FAILED: 'Request Cell invocation failed',
  REQUIRE_AUTHENTICATOR:
    'RequestCellHttpAdapter requires authenticateRequest',
  REQUIRE_DISPATCHER:
    'RequestCellHttpAdapter requires ServiceDispatcher',
  REQUIRE_RESOLVER:
    'RequestCellHttpAdapter requires RequestBindingRouteResolver',
  SHUTTING_DOWN: 'Request Cell ingress is shutting down',
});
const FORBIDDEN_AUTHORITY_HEADERS = Object.freeze([
  'x-binding-version-id',
  'x-principal',
  'x-replica-id',
  'x-service-id',
  'x-target-node-id',
  'x-tenant-id',
]);
const COMPONENT_FORBIDDEN_RESPONSE_HEADERS = new Set([
  'connection',
  'content-length',
  'keep-alive',
  'transfer-encoding',
  'upgrade',
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

function normalizeHttpRequest(request, method, path) {
  return Object.freeze({
    body: request.body ?? null,
    headers: Object.freeze(normalizedRequestHeaders(request.headers)),
    method,
    path,
    query: Object.freeze({...request.query}),
  });
}

function rejectAuthorityHeaders(headers = {}) {
  const forbidden = FORBIDDEN_AUTHORITY_HEADERS.find(
    (name) => headers[name] !== undefined,
  );
  if (forbidden) {
    throw createRoutingFailure(
      REQUEST_CELL_ROUTE_ERROR_CODE.AUTHORITY_FIELD_REJECTED,
      `Client authority header is forbidden: ${forbidden}`,
    );
  }
}

function buildEnvelope(fields) {
  return Object.freeze({
    [SERVICE_MESSAGE_FIELD.MESSAGE_ID]:
      `${fields.invocationId}:delivery:${fields.dispatchId}:` +
        `attempt:${fields.attempt}`,
    [SERVICE_MESSAGE_FIELD.SERVICE_ID]: fields.route.serviceId,
    [SERVICE_MESSAGE_FIELD.SERVICE_TYPE]:
      UNIFIED_SERVICE_TYPE.RUNTIME_SERVICE,
    [SERVICE_MESSAGE_FIELD.OPERATION]: REQUEST_CELL_ROUTE_OPERATION,
    [SERVICE_MESSAGE_FIELD.PAYLOAD]: Object.freeze({
      invocation: Object.freeze({
        deadlineMs: fields.deadlineMs,
        id: fields.invocationId,
        intentDigest: fields.intentDigest,
      }),
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
    {
      cause: error,
      classification: REQUEST_CELL_ROUTE_CLASSIFICATION.AMBIGUOUS,
    },
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
        outcome.classification ||
        REQUEST_CELL_ROUTE_CLASSIFICATION.TERMINAL,
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

class RequestCellHttpAdapter extends CellIngressAdapterBase {
  constructor(options = {}) {
    if (typeof options.authenticateRequest !== 'function') {
      throw new TypeError(
        REQUEST_CELL_ADAPTER_MESSAGE.REQUIRE_AUTHENTICATOR,
      );
    }
    if (!options.routeResolver ||
        typeof options.routeResolver.resolve !== 'function') {
      throw new TypeError(
        REQUEST_CELL_ADAPTER_MESSAGE.REQUIRE_RESOLVER,
      );
    }
    if (!options.serviceDispatcher ||
        typeof options.serviceDispatcher.dispatch !== 'function') {
      throw new TypeError(
        REQUEST_CELL_ADAPTER_MESSAGE.REQUIRE_DISPATCHER,
      );
    }
    super(options, REQUEST_CELL_INGRESS_KIT);
    this._authenticateRequest = options.authenticateRequest;
  }

  async invoke(request) {
    if (this._shuttingDown) {
      throw createShutdownFailure();
    }
    const activeRequest = createActiveRequest();
    this._activeRequests.add(activeRequest);
    try {
      this._assertOpen(activeRequest);
      rejectAuthorityHeaders(request.headers);
      const securityContext = freezeSecurityContext(
        await awaitWithRequestCancellation(
          this._authenticateRequest(request),
          activeRequest,
        ),
      );
      const method = String(request.method || '').toUpperCase();
      const path = requestPath(request);
      const normalizedRequest =
        normalizeHttpRequest(request, method, path);
      const requestDigest = createRequestDigest(normalizedRequest);
      const invocationId = createInvocationIdentity(
        securityContext.tenantId,
        request.headers?.[IDEMPOTENCY_HEADER],
      );
      const deadlineMs = Date.now() + this._deadlineMs;
      const dispatchId = randomUUID();
      return await this._attemptOwner.run(async (attempt) => {
        this._assertOpen(activeRequest);
        if (Date.now() >= deadlineMs) {
          throw createRoutingFailure(
            REQUEST_CELL_ROUTE_ERROR_CODE.DEADLINE_EXHAUSTED,
            REQUEST_CELL_ADAPTER_MESSAGE.DEADLINE_EXPIRED,
          );
        }
        const route = this._routeResolver.resolve({
          invocationId,
          method,
          path,
          securityContext,
        });
        const intentDigest = createInvocationIntentDigest({
          bindingVersionId: route.bindingVersionId,
          method,
          path,
          requestDigest,
          tenantId: securityContext.tenantId,
        });
        return this._dispatchAttempt({
          activeRequest,
          attempt,
          deadlineMs,
          dispatchId,
          ingressNodeId: request.server?.nodeId || null,
          intentDigest,
          invocationId,
          normalizedRequest,
          route,
          securityContext,
          traceId: request.id || invocationId,
        });
      });
    } finally {
      this._activeRequests.delete(activeRequest);
      activeRequest.resolveSettled();
    }
  }

  async handle(request, reply) {
    try {
      const response = await this.invoke(request);
      for (const [name, value] of response.headers) {
        if (!COMPONENT_FORBIDDEN_RESPONSE_HEADERS.has(name.toLowerCase())) {
          reply.header(name, value);
        }
      }
      reply.code(response.status);
      return response.body;
    } catch (error) {
      const failure = normalizeDispatchError(error);
      reply.code(failure.httpStatus);
      reply.header(RESPONSE_CONTENT_TYPE, JSON_CONTENT_TYPE);
      return {
        classification: failure.classification,
        code: failure.code,
        error: failure.message,
        invoked: failure.invoked,
      };
    }
  }
}

export {
  RequestCellHttpAdapter,
};
