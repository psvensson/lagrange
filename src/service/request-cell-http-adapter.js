import {randomUUID} from 'node:crypto';

import {
  SERVICE_MESSAGE_FIELD,
  UNIFIED_SERVICE_TYPE,
} from '../constants/unified-service-lifecycle.js';
import {TRANSPORT_EVENT} from '../constants/transport.js';
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

const DEFAULT_DEADLINE_MS = 5_000;
const DEFAULT_MAX_ATTEMPTS = 2;
const DEFAULT_MAX_IN_FLIGHT = 128;
const DEFAULT_MAX_IN_FLIGHT_PER_TARGET = 32;
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

function positiveInteger(value, fallback) {
  return Number.isSafeInteger(value) && value > 0 ? value : fallback;
}

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

function createActiveRequest() {
  let resolveSettled;
  const settled = new Promise((resolve) => {
    resolveSettled = resolve;
  });
  return {
    abortController: new AbortController(),
    dispatchStarted: false,
    resolveSettled,
    settled,
  };
}

function awaitWithRequestCancellation(promise, activeRequest) {
  const signal = activeRequest.abortController.signal;
  if (signal.aborted) {
    return Promise.reject(
      signal.reason instanceof Error ?
        signal.reason :
        createShutdownFailure(activeRequest),
    );
  }
  return new Promise((resolve, reject) => {
    let settled = false;
    const complete = (settle, value) => {
      if (settled) return;
      settled = true;
      signal.removeEventListener(TRANSPORT_EVENT.ABORT, onAbort);
      settle(value);
    };
    const onAbort = () => {
      complete(
        reject,
        signal.reason instanceof Error ?
          signal.reason :
          createShutdownFailure(activeRequest),
      );
    };
    signal.addEventListener(
      TRANSPORT_EVENT.ABORT,
      onAbort,
      {once: true},
    );
    Promise.resolve(promise).then(
      (value) => complete(resolve, value),
      (error) => complete(reject, error),
    );
  });
}

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

class RequestCellDispatchAttemptOwner {
  constructor(maxAttempts) {
    this._maxAttempts = maxAttempts;
  }

  async run(executeAttempt) {
    return this._runAttempt(executeAttempt, 1);
  }

  async _runAttempt(executeAttempt, attempt) {
    try {
      return await executeAttempt(attempt);
    } catch (error) {
      const failure = normalizeDispatchError(error);
      if (
        !failure.retryable ||
        failure.invoked ||
        attempt >= this._maxAttempts
      ) {
        throw failure;
      }
      return this._runAttempt(executeAttempt, attempt + 1);
    }
  }
}

class RequestCellHttpAdapter {
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
    this._authenticateRequest = options.authenticateRequest;
    this._routeResolver = options.routeResolver;
    this._serviceDispatcher = options.serviceDispatcher;
    this._deadlineMs = positiveInteger(
      options.deadlineMs,
      DEFAULT_DEADLINE_MS,
    );
    this._maxAttempts = positiveInteger(
      options.maxAttempts,
      DEFAULT_MAX_ATTEMPTS,
    );
    this._attemptOwner =
      new RequestCellDispatchAttemptOwner(this._maxAttempts);
    this._maxInFlight = positiveInteger(
      options.maxInFlight,
      DEFAULT_MAX_IN_FLIGHT,
    );
    this._maxInFlightPerTarget = positiveInteger(
      options.maxInFlightPerTarget,
      DEFAULT_MAX_IN_FLIGHT_PER_TARGET,
    );
    this._inFlight = 0;
    this._inFlightByTarget = new Map();
    this._activeRequests = new Set();
    this._shuttingDown = false;
    this._shutdownPromise = null;
  }

  _acquire(targetNodeId) {
    const targetCount = this._inFlightByTarget.get(targetNodeId) || 0;
    if (
      this._inFlight >= this._maxInFlight ||
      targetCount >= this._maxInFlightPerTarget
    ) {
      throw createRoutingFailure(
        REQUEST_CELL_ROUTE_ERROR_CODE.OVERLOADED,
        REQUEST_CELL_ADAPTER_MESSAGE.INGRESS_OVERLOADED,
        {classification: REQUEST_CELL_ROUTE_CLASSIFICATION.RETRYABLE},
      );
    }
    this._inFlight += 1;
    this._inFlightByTarget.set(targetNodeId, targetCount + 1);
    return () => {
      this._inFlight = Math.max(0, this._inFlight - 1);
      const nextTargetCount =
        (this._inFlightByTarget.get(targetNodeId) || 1) - 1;
      if (nextTargetCount <= 0) {
        this._inFlightByTarget.delete(targetNodeId);
      } else {
        this._inFlightByTarget.set(targetNodeId, nextTargetCount);
      }
    };
  }

  _assertOpen(activeRequest) {
    if (
      this._shuttingDown ||
      activeRequest.abortController.signal.aborted
    ) {
      throw activeRequest.abortController.signal.reason instanceof Error ?
        activeRequest.abortController.signal.reason :
        createShutdownFailure(activeRequest);
    }
  }

  async _dispatchAttempt(fields) {
    const release = this._acquire(fields.route.targetNodeId);
    try {
      const envelope = buildEnvelope(fields);
      fields.activeRequest.dispatchStarted = true;
      const result = await awaitWithRequestCancellation(
        this._serviceDispatcher.dispatch(envelope, {
          deadlineMs: fields.deadlineMs,
          nodeId: fields.ingressNodeId,
          requireProcessedResponse: true,
          responseContext: {
            invocationId: fields.invocationId,
            replicaId: fields.route.replicaId,
          },
          securityContext: fields.securityContext,
          selectedRoute: fields.route,
          signal: fields.activeRequest.abortController.signal,
          traceId: fields.traceId,
        }),
        fields.activeRequest,
      );
      if (result.delivery?.processed === true) {
        return result.delivery.componentResponse;
      }
      throw failureFromDelivery(result.delivery);
    } finally {
      release();
    }
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

  async shutdown() {
    if (this._shutdownPromise) return this._shutdownPromise;
    this._shuttingDown = true;
    const activeRequests = [...this._activeRequests];
    for (const request of activeRequests) {
      request.abortController.abort(createShutdownFailure(request));
    }
    this._shutdownPromise = Promise.allSettled(
      activeRequests.map((request) => request.settled),
    ).then(() => undefined);
    return this._shutdownPromise;
  }

  getDiagnostics() {
    return {
      activeRequests: this._activeRequests.size,
      inFlight: this._inFlight,
      inFlightByTarget:
        Object.fromEntries(this._inFlightByTarget.entries()),
      shuttingDown: this._shuttingDown,
    };
  }
}

export {
  RequestCellHttpAdapter,
};
