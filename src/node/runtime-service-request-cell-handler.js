import {HEALTH_STATUS} from '../runtime/runtime-driver.js';
import {ReplicaStatus} from '../rebalancer/replica-status.js';
import {
  REQUEST_CELL_ROUTE_CLASSIFICATION,
  REQUEST_CELL_ROUTE_ERROR_CODE,
  RequestCellRoutingError,
  canonicalJson,
  normalizeComponentResponse,
} from '../service/request-cell-routing-contract.js';

const REQUEST_CELL_RUNTIME_MESSAGE = Object.freeze({
  ACTUAL_NOT_ACTIVE:
    'Request Cell actual is not active in the local runtime owner',
  ACTUAL_NOT_HEALTHY: 'Request Cell actual is not healthy',
  DEADLINE_EXPIRED:
    'Request Cell invocation deadline expired before execution',
  INVOCATION_FAILED: 'Request Cell invocation failed',
  OWNER_UNAVAILABLE:
    'Request Cell runtime invocation owner is unavailable',
  PAYLOAD_INVALID: 'Request Cell Service_Message payload is invalid',
  ROUTE_TENANT_MISMATCH:
    'Request Cell route tenant does not match authenticated tenant',
  SECURITY_CONTEXT_INVALID:
    'Request Cell Service_Message security context is invalid',
  TARGET_MOVED: 'Request Cell actual moved to another node',
});

function valueOrFallback(value, fallback) {
  return value === undefined ? fallback : value;
}

function buildInvocationFailure(error, overrides = {}) {
  const routingError = error instanceof RequestCellRoutingError ?
    error :
    {};
  return {
    handlerProcessed: true,
    invocationOutcome: {
      classification: valueOrFallback(
        overrides.classification,
        valueOrFallback(
          routingError.classification,
          REQUEST_CELL_ROUTE_CLASSIFICATION.TERMINAL,
        ),
      ),
      code: valueOrFallback(
        overrides.code,
        valueOrFallback(
          routingError.code,
          REQUEST_CELL_ROUTE_ERROR_CODE.COMPONENT_FAILED,
        ),
      ),
      invoked: valueOrFallback(
        overrides.invoked,
        valueOrFallback(routingError.invoked, false),
      ),
      message: valueOrFallback(
        error?.message,
        REQUEST_CELL_RUNTIME_MESSAGE.INVOCATION_FAILED,
      ),
    },
    processed: false,
  };
}

function resolveInvocationFailureStarted(error, invocationStarted) {
  if (error instanceof RequestCellRoutingError) return error.invoked;
  return invocationStarted;
}

function assertRequestCellRuntimeOwner(serviceRuntimeLifecycle) {
  if (
    serviceRuntimeLifecycle &&
    typeof serviceRuntimeLifecycle.health === 'function' &&
    typeof serviceRuntimeLifecycle.invoke === 'function'
  ) {
    return;
  }
  throw new RequestCellRoutingError(
    REQUEST_CELL_ROUTE_ERROR_CODE.ROUTE_UNAVAILABLE,
    REQUEST_CELL_RUNTIME_MESSAGE.OWNER_UNAVAILABLE,
    {classification: REQUEST_CELL_ROUTE_CLASSIFICATION.RETRYABLE},
  );
}

function assertRequestCellInvocationPayload(invocation, route, request) {
  const fields = [
    invocation?.id,
    invocation?.intentDigest,
    request?.method,
    request?.path,
    route?.replicaId,
  ];
  if (fields.every((value) => typeof value === 'string')) return;
  throw new RequestCellRoutingError(
    REQUEST_CELL_ROUTE_ERROR_CODE.INVALID_REQUEST,
    REQUEST_CELL_RUNTIME_MESSAGE.PAYLOAD_INVALID,
  );
}

function assertRequestCellRouteTenant(route, securityContext) {
  if (route.tenantId === securityContext.tenantId) return;
  throw new RequestCellRoutingError(
    REQUEST_CELL_ROUTE_ERROR_CODE.TARGET_STALE,
    REQUEST_CELL_RUNTIME_MESSAGE.ROUTE_TENANT_MISMATCH,
    {preserveReplicaState: true},
  );
}

function assertHealthyRequestCellActual(health) {
  if (health?.status === HEALTH_STATUS.HEALTHY) return;
  throw new RequestCellRoutingError(
    REQUEST_CELL_ROUTE_ERROR_CODE.ROUTE_UNAVAILABLE,
    REQUEST_CELL_RUNTIME_MESSAGE.ACTUAL_NOT_HEALTHY,
    {
      classification: REQUEST_CELL_ROUTE_CLASSIFICATION.RETRYABLE,
      preserveReplicaState: true,
    },
  );
}

function assertCurrentRequestCellTarget(
  handler,
  request,
  route,
  invocation,
) {
  if (
    !Number.isFinite(invocation?.deadlineMs) ||
    Date.now() >= invocation.deadlineMs
  ) {
    throw new RequestCellRoutingError(
      REQUEST_CELL_ROUTE_ERROR_CODE.DEADLINE_EXHAUSTED,
      REQUEST_CELL_RUNTIME_MESSAGE.DEADLINE_EXPIRED,
      {preserveReplicaState: true},
    );
  }
  const current = handler.requestBindingRouteResolver.assertSelectedRoute({
    invocationId: invocation.id,
    method: request.method,
    path: request.path,
    securityContext: request.securityContext,
  }, route);
  if (current.nodeId !== handler.nodeId) {
    throw new RequestCellRoutingError(
      REQUEST_CELL_ROUTE_ERROR_CODE.TARGET_STALE,
      REQUEST_CELL_RUNTIME_MESSAGE.TARGET_MOVED,
      {
        classification: REQUEST_CELL_ROUTE_CLASSIFICATION.RETRYABLE,
        preserveReplicaState: true,
      },
    );
  }
  const localReplica = handler.localReplicas.get(route.replicaId);
  if (
    localReplica?.status !== ReplicaStatus.ACTIVE ||
    localReplica?.entityId !== route.serviceId ||
    !localReplica.replicaHandle
  ) {
    throw new RequestCellRoutingError(
      REQUEST_CELL_ROUTE_ERROR_CODE.TARGET_STALE,
      REQUEST_CELL_RUNTIME_MESSAGE.ACTUAL_NOT_ACTIVE,
      {
        classification: REQUEST_CELL_ROUTE_CLASSIFICATION.RETRYABLE,
        preserveReplicaState: true,
      },
    );
  }
  return localReplica;
}

function buildRequestCellInvocation(
  handler,
  request,
  admittedRequest,
  route,
  invocation,
  securityContext,
) {
  return {
    args: [canonicalJson(request)],
    assertCurrentTarget: () =>
      assertCurrentRequestCellTarget(
        handler,
        admittedRequest,
        route,
        invocation,
      ),
    deadlineMs: invocation.deadlineMs,
    intentDigest: invocation.intentDigest,
    invocationId: invocation.id,
    invocationServiceId: route.serviceId,
    tenantId: securityContext.tenantId,
  };
}

function buildSuccessfulInvocationResponse(result) {
  const value = result?.journaled === true ? result.value : result;
  return {
    componentResponse: normalizeComponentResponse(value),
    handlerProcessed: true,
    invocationOutcome: {
      classification: null,
      code: null,
      invoked: result?.replayed !== true,
      replayed: result?.replayed === true,
    },
    processed: true,
  };
}

function resolveEnvelopeSecurityContext(envelope) {
  const roles = envelope?.metadata?.roles;
  if (
    typeof envelope?.tenantId !== 'string' ||
    envelope.tenantId.length === 0 ||
    typeof envelope?.principal !== 'string' ||
    envelope.principal.length === 0 ||
    !Array.isArray(roles) ||
    roles.some((role) => typeof role !== 'string')
  ) {
    throw new RequestCellRoutingError(
      REQUEST_CELL_ROUTE_ERROR_CODE.AUTHENTICATION_FAILED,
      REQUEST_CELL_RUNTIME_MESSAGE.SECURITY_CONTEXT_INVALID,
    );
  }
  return Object.freeze({
    principal: envelope.principal,
    roles: Object.freeze([...roles]),
    tenantId: envelope.tenantId,
  });
}

async function handleRequestCellInvocation(handler, envelope) {
  const payload = envelope?.payload;
  const invocation = payload?.invocation;
  const route = payload?.route;
  const request = payload?.request;
  let invocationStarted = false;
  try {
    assertRequestCellRuntimeOwner(handler.serviceRuntimeLifecycle);
    assertRequestCellInvocationPayload(invocation, route, request);
    const securityContext = resolveEnvelopeSecurityContext(envelope);
    assertRequestCellRouteTenant(route, securityContext);
    const admittedRequest = {
      ...request,
      securityContext,
    };
    let localReplica = assertCurrentRequestCellTarget(
      handler,
      admittedRequest,
      route,
      invocation,
    );
    const health = await handler.serviceRuntimeLifecycle.health(
      localReplica.replicaHandle,
    );
    assertHealthyRequestCellActual(health);
    localReplica = assertCurrentRequestCellTarget(
      handler,
      admittedRequest,
      route,
      invocation,
    );
    invocationStarted = true;
    const result = await handler.serviceRuntimeLifecycle.invoke(
      localReplica.replicaHandle,
      buildRequestCellInvocation(
        handler,
        request,
        admittedRequest,
        route,
        invocation,
        securityContext,
      ),
    );
    return buildSuccessfulInvocationResponse(result);
  } catch (error) {
    return buildInvocationFailure(error, {
      invoked: resolveInvocationFailureStarted(
        error,
        invocationStarted,
      ),
    });
  }
}

export {
  assertCurrentRequestCellTarget,
  handleRequestCellInvocation,
};
