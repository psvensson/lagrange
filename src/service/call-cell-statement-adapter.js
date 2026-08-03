import {createHash, randomUUID} from 'node:crypto';

import {
  SERVICE_MESSAGE_FIELD,
  UNIFIED_SERVICE_TYPE,
} from '../constants/unified-service-lifecycle.js';
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
import {
  CellIngressAdapterBase,
  createActiveRequest,
} from './cell-ingress-transport.js';
import {ServicePolicyViolationError} from
  './service-lifecycle-errors.js';

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
      partitionFence: fields.partitionFence,
      partitionId: fields.partitionId,
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

const CALL_CELL_INGRESS_KIT = Object.freeze({
  buildEnvelope,
  createOverloadFailure: () => createCallRoutingFailure(
    CALL_CELL_ROUTE_ERROR_CODE.ROUTE_UNAVAILABLE,
    CALL_STATEMENT_ADAPTER_MESSAGE.INGRESS_OVERLOADED,
    {classification: CALL_CELL_ROUTE_CLASSIFICATION.RETRYABLE},
  ),
  createShutdownFailure,
  failureFromDelivery,
  mapProcessedDelivery: (delivery, fields) => Object.freeze({
    componentResult: normalizeCallComponentResult(
      delivery.componentResult,
    ),
    partials: Array.isArray(delivery.partials) ?
      delivery.partials :
      [],
    replicaId: delivery.replicaId ?? fields.route.replicaId,
  }),
  normalizeDispatchError,
});

class CallCellStatementAdapter extends CellIngressAdapterBase {
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
    super(options, CALL_CELL_INGRESS_KIT);
  }

  async invoke({
    name,
    argumentsJson,
    securityContext,
    deadlineMs,
    batch,
    partials,
    callCell,
    partitionId,
    partitionFence,
    hostNodeId,
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
          hostNodeId,
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
          partitionFence,
          partitionId,
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
}

export {
  CallCellStatementAdapter,
};
