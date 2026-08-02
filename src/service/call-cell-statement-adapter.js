import {createHash, randomUUID} from 'node:crypto';

import {
  SERVICE_MESSAGE_FIELD,
  UNIFIED_SERVICE_TYPE,
} from '../constants/unified-service-lifecycle.js';
import {TRANSPORT_EVENT} from '../constants/transport.js';
import {
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
} from './call-cell-routing-contract.js';
import {ServicePolicyViolationError} from
  './service-lifecycle-errors.js';

const DEFAULT_DEADLINE_MS = 5_000;
const DEFAULT_MAX_ATTEMPTS = 2;
const DEFAULT_MAX_IN_FLIGHT = 128;
const DEFAULT_MAX_IN_FLIGHT_PER_TARGET = 32;
const HASH_ALGORITHM = 'sha256';
const HASH_ENCODING = 'hex';
const BYTE_ENCODING = 'utf8';
const CALL_CELL_INVOKE_EXPORT_DEFAULT = 'run';
const CALL_STATEMENT_ADAPTER_MESSAGE = Object.freeze({
  DEADLINE_EXPIRED: 'Call Cell deadline expired',
  DISPATCH_FAILED: 'Call Cell dispatch failed',
  HANDLER_OUTCOME_MISSING:
    'Call Cell handler did not return a typed outcome',
  INGRESS_OVERLOADED:
    'Call Cell ingress is overloaded before dispatch',
  INVOCATION_FAILED: 'Call Cell invocation failed',
  REQUIRE_DISPATCHER:
    'CallCellStatementAdapter requires ServiceDispatcher',
  REQUIRE_RESOLVER:
    'CallCellStatementAdapter requires CallBindingRouteResolver',
  SECURITY_CONTEXT_INVALID:
    'Call Cell security context must be server-derived and frozen',
  SHUTTING_DOWN: 'Call Cell ingress is shutting down',
});

function positiveInteger(value, fallback) {
  return Number.isSafeInteger(value) && value > 0 ? value : fallback;
}

function sha256Hex(value) {
  return createHash(HASH_ALGORITHM)
    .update(value, BYTE_ENCODING)
    .digest(HASH_ENCODING);
}

function freezeCallSecurityContext(context) {
  const valid =
    Object.isFrozen(context) &&
    Object.isFrozen(context?.roles) &&
    typeof context?.tenantId === 'string' &&
    context.tenantId.length > 0 &&
    typeof context?.principal === 'string' &&
    context.principal.length > 0;
  if (!valid) {
    throw createCallRoutingFailure(
      CALL_CELL_ROUTE_ERROR_CODE.AUTHENTICATION_FAILED,
      CALL_STATEMENT_ADAPTER_MESSAGE.SECURITY_CONTEXT_INVALID,
    );
  }
  return context;
}

function buildEnvelope(fields) {
  return Object.freeze({
    [SERVICE_MESSAGE_FIELD.MESSAGE_ID]:
      `${fields.invocationId}:delivery:${fields.dispatchId}:` +
        `attempt:${fields.attempt}`,
    [SERVICE_MESSAGE_FIELD.SERVICE_ID]: fields.route.serviceId,
    [SERVICE_MESSAGE_FIELD.SERVICE_TYPE]:
      UNIFIED_SERVICE_TYPE.RUNTIME_SERVICE,
    [SERVICE_MESSAGE_FIELD.OPERATION]: CALL_CELL_ROUTE_OPERATION,
    [SERVICE_MESSAGE_FIELD.PAYLOAD]: Object.freeze({
      batch: fields.batch,
      call: Object.freeze({
        arguments: fields.callArguments,
        name: fields.name,
      }),
      invocation: Object.freeze({
        callCell: fields.callCell,
        deadlineMs: fields.deadlineMs,
        exportName: fields.exportName,
        id: fields.invocationId,
        intentDigest: fields.intentDigest,
      }),
      partials: fields.partials,
      route: fields.route,
      type: CALL_CELL_ROUTE_MESSAGE_TYPE,
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
  if (error instanceof CallCellRoutingError) return error;
  if (error instanceof ServicePolicyViolationError) {
    return createCallRoutingFailure(
      CALL_CELL_ROUTE_ERROR_CODE.AUTHORIZATION_FAILED,
      error.message,
      {cause: error},
    );
  }
  return createCallRoutingFailure(
    CALL_CELL_ROUTE_ERROR_CODE.HANDLER_FAILED,
    error?.message || CALL_STATEMENT_ADAPTER_MESSAGE.DISPATCH_FAILED,
    {
      cause: error,
      classification: CALL_CELL_ROUTE_CLASSIFICATION.AMBIGUOUS,
    },
  );
}

function createShutdownFailure(activeRequest = {}) {
  const invoked = activeRequest.dispatchStarted === true;
  return createCallRoutingFailure(
    CALL_CELL_ROUTE_ERROR_CODE.SHUTTING_DOWN,
    CALL_STATEMENT_ADAPTER_MESSAGE.SHUTTING_DOWN,
    {
      classification: invoked ?
        CALL_CELL_ROUTE_CLASSIFICATION.AMBIGUOUS :
        CALL_CELL_ROUTE_CLASSIFICATION.RETRYABLE,
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
    return createCallRoutingFailure(
      CALL_CELL_ROUTE_ERROR_CODE.ACK_ONLY,
      CALL_STATEMENT_ADAPTER_MESSAGE.HANDLER_OUTCOME_MISSING,
      {classification: CALL_CELL_ROUTE_CLASSIFICATION.AMBIGUOUS},
    );
  }
  return createCallRoutingFailure(
    outcome.code,
    outcome.message || CALL_STATEMENT_ADAPTER_MESSAGE.INVOCATION_FAILED,
    {
      classification:
        outcome.classification ||
        CALL_CELL_ROUTE_CLASSIFICATION.TERMINAL,
      invoked: outcome.invoked === true,
    },
  );
}

class CallCellDispatchAttemptOwner {
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

class CallCellStatementAdapter {
  constructor(options = {}) {
    if (!options.routeResolver ||
        typeof options.routeResolver.resolve !== 'function') {
      throw new TypeError(
        CALL_STATEMENT_ADAPTER_MESSAGE.REQUIRE_RESOLVER,
      );
    }
    if (!options.serviceDispatcher ||
        typeof options.serviceDispatcher.dispatch !== 'function') {
      throw new TypeError(
        CALL_STATEMENT_ADAPTER_MESSAGE.REQUIRE_DISPATCHER,
      );
    }
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
      new CallCellDispatchAttemptOwner(this._maxAttempts);
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
      throw createCallRoutingFailure(
        CALL_CELL_ROUTE_ERROR_CODE.ROUTE_UNAVAILABLE,
        CALL_STATEMENT_ADAPTER_MESSAGE.INGRESS_OVERLOADED,
        {classification: CALL_CELL_ROUTE_CLASSIFICATION.RETRYABLE},
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
        const delivery = result.delivery;
        return Object.freeze({
          componentResult: normalizeCallComponentResult(
            delivery.componentResult,
          ),
          partials: Array.isArray(delivery.partials) ?
            delivery.partials :
            [],
          replicaId: delivery.replicaId ?? fields.route.replicaId,
        });
      }
      throw failureFromDelivery(result.delivery);
    } finally {
      release();
    }
  }

  async invoke({
    name,
    argumentsJson,
    securityContext,
    deadlineMs,
    batch,
    partials,
    callCell,
    exportName = CALL_CELL_INVOKE_EXPORT_DEFAULT,
    invocationId: providedInvocationId,
  }) {
    if (this._shuttingDown) {
      throw createShutdownFailure();
    }
    const activeRequest = createActiveRequest();
    this._activeRequests.add(activeRequest);
    try {
      this._assertOpen(activeRequest);
      const frozenContext = freezeCallSecurityContext(securityContext);
      const callArguments = normalizeCallArguments(argumentsJson);
      const argumentsDigest = sha256Hex(callArguments);
      const invocationId = typeof providedInvocationId === 'string' &&
        providedInvocationId.length > 0 ?
        providedInvocationId :
        createCallInvocationIdentity().invocationId;
      const absoluteDeadlineMs = Number.isSafeInteger(deadlineMs) &&
        deadlineMs > Date.now() ?
        deadlineMs :
        Date.now() + this._deadlineMs;
      const dispatchId = randomUUID();
      return await this._attemptOwner.run(async (attempt) => {
        this._assertOpen(activeRequest);
        if (Date.now() >= absoluteDeadlineMs) {
          throw createCallRoutingFailure(
            CALL_CELL_ROUTE_ERROR_CODE.DEADLINE_EXHAUSTED,
            CALL_STATEMENT_ADAPTER_MESSAGE.DEADLINE_EXPIRED,
          );
        }
        const route = this._routeResolver.resolve({
          invocationId,
          name,
          securityContext: frozenContext,
        });
        const intentDigest = createCallInvocationIntentDigest({
          argumentsDigest,
          bindingVersionId: route.bindingVersionId,
          name,
          tenantId: frozenContext.tenantId,
        });
        return this._dispatchAttempt({
          activeRequest,
          attempt,
          batch,
          callArguments,
          callCell,
          deadlineMs: absoluteDeadlineMs,
          dispatchId,
          exportName,
          ingressNodeId: null,
          intentDigest,
          invocationId,
          name,
          partials,
          route,
          securityContext: frozenContext,
          traceId: invocationId,
        });
      });
    } finally {
      this._activeRequests.delete(activeRequest);
      activeRequest.resolveSettled();
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
  CallCellStatementAdapter,
};
