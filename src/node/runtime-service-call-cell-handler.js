import {HEALTH_STATUS} from '../runtime/runtime-driver.js';
import {ReplicaStatus} from '../rebalancer/replica-status.js';
import {
  CALL_CELL_ROUTE_CLASSIFICATION,
  CALL_CELL_ROUTE_ERROR_CODE,
  CallCellRoutingError,
  normalizeCallComponentResult,
} from '../service/call-cell-routing-contract.js';

const CALL_CELL_RUNTIME_MESSAGE = Object.freeze({
  ACTUAL_NOT_ACTIVE:
    'Call Cell actual is not active in the local runtime owner',
  ACTUAL_NOT_HEALTHY: 'Call Cell actual is not healthy',
  DEADLINE_EXPIRED:
    'Call Cell invocation deadline expired before execution',
  INVOCATION_FAILED: 'Call Cell invocation failed',
  OWNER_UNAVAILABLE:
    'Call Cell runtime invocation owner is unavailable',
  PAYLOAD_INVALID: 'Call Cell Service_Message payload is invalid',
  ROUTE_TENANT_MISMATCH:
    'Call Cell route tenant does not match authenticated tenant',
  SECURITY_CONTEXT_INVALID:
    'Call Cell Service_Message security context is invalid',
  TARGET_MOVED: 'Call Cell actual moved to another node',
});
const CALL_CELL_INVOCATION_EXPORT_NAME = Object.freeze({
  RUN: 'run',
  REDUCE: 'reduce',
});
const CALL_CELL_INVOCATION_EXPORT_DEFAULT = CALL_CELL_INVOCATION_EXPORT_NAME.RUN;

function valueOrFallback(value, fallback) {
  return value === undefined ? fallback : value;
}

function buildInvocationFailure(error, overrides = {}) {
  const routingError = error instanceof CallCellRoutingError ?
    error :
    {};
  return {
    handlerProcessed: true,
    invocationOutcome: {
      classification: valueOrFallback(
        overrides.classification,
        valueOrFallback(
          routingError.classification,
          CALL_CELL_ROUTE_CLASSIFICATION.TERMINAL,
        ),
      ),
      code: valueOrFallback(
        overrides.code,
        valueOrFallback(
          routingError.code,
          CALL_CELL_ROUTE_ERROR_CODE.COMPONENT_FAILED,
        ),
      ),
      invoked: valueOrFallback(
        overrides.invoked,
        valueOrFallback(routingError.invoked, false),
      ),
      message: valueOrFallback(
        error?.message,
        CALL_CELL_RUNTIME_MESSAGE.INVOCATION_FAILED,
      ),
    },
    partials: [],
    processed: false,
  };
}

function resolveInvocationFailureStarted(error, invocationStarted) {
  if (error instanceof CallCellRoutingError) return error.invoked;
  return invocationStarted;
}

function assertCallCellRuntimeOwner(serviceRuntimeLifecycle) {
  if (
    serviceRuntimeLifecycle &&
    typeof serviceRuntimeLifecycle.health === 'function' &&
    typeof serviceRuntimeLifecycle.invoke === 'function'
  ) {
    return;
  }
  throw new CallCellRoutingError(
    CALL_CELL_ROUTE_ERROR_CODE.ROUTE_UNAVAILABLE,
    CALL_CELL_RUNTIME_MESSAGE.OWNER_UNAVAILABLE,
    {classification: CALL_CELL_ROUTE_CLASSIFICATION.RETRYABLE},
  );
}

function resolveCallCellExportName(invocation) {
  const exportName = invocation?.exportName;
  if (exportName === undefined) return CALL_CELL_INVOCATION_EXPORT_DEFAULT;
  if (exportName === CALL_CELL_INVOCATION_EXPORT_NAME.RUN ||
      exportName === CALL_CELL_INVOCATION_EXPORT_NAME.REDUCE) {
    return exportName;
  }
  throw new CallCellRoutingError(
    CALL_CELL_ROUTE_ERROR_CODE.INVALID_ARGUMENTS,
    CALL_CELL_RUNTIME_MESSAGE.PAYLOAD_INVALID,
  );
}

function assertCallCellInvocationPayload(invocation, route, call, batch, partials) {
  const exportName = resolveCallCellExportName(invocation);
  const fields = [
    invocation?.id,
    invocation?.intentDigest,
    call?.name,
    call?.arguments,
    route?.replicaId,
  ];
  const inputValid = exportName === CALL_CELL_INVOCATION_EXPORT_NAME.REDUCE ?
    Array.isArray(partials) :
    Array.isArray(batch);
  if (fields.every((value) => typeof value === 'string') && inputValid) {
    return;
  }
  throw new CallCellRoutingError(
    CALL_CELL_ROUTE_ERROR_CODE.INVALID_ARGUMENTS,
    CALL_CELL_RUNTIME_MESSAGE.PAYLOAD_INVALID,
  );
}

function assertCallCellRouteTenant(route, securityContext) {
  if (route.tenantId === securityContext.tenantId) return;
  throw new CallCellRoutingError(
    CALL_CELL_ROUTE_ERROR_CODE.TARGET_STALE,
    CALL_CELL_RUNTIME_MESSAGE.ROUTE_TENANT_MISMATCH,
    {preserveReplicaState: true},
  );
}

function assertHealthyCallCellActual(health) {
  if (health?.status === HEALTH_STATUS.HEALTHY) return;
  throw new CallCellRoutingError(
    CALL_CELL_ROUTE_ERROR_CODE.ROUTE_UNAVAILABLE,
    CALL_CELL_RUNTIME_MESSAGE.ACTUAL_NOT_HEALTHY,
    {
      classification: CALL_CELL_ROUTE_CLASSIFICATION.RETRYABLE,
      preserveReplicaState: true,
    },
  );
}

function assertCurrentCallCellTarget(handler, call, route, invocation) {
  if (
    !Number.isFinite(invocation?.deadlineMs) ||
    Date.now() >= invocation.deadlineMs
  ) {
    throw new CallCellRoutingError(
      CALL_CELL_ROUTE_ERROR_CODE.DEADLINE_EXHAUSTED,
      CALL_CELL_RUNTIME_MESSAGE.DEADLINE_EXPIRED,
      {preserveReplicaState: true},
    );
  }
  const current = handler.callBindingRouteResolver.assertSelectedRoute({
    invocationId: invocation.id,
    name: call.name,
    securityContext: call.securityContext,
  }, route);
  if (current.nodeId !== handler.nodeId) {
    throw new CallCellRoutingError(
      CALL_CELL_ROUTE_ERROR_CODE.TARGET_STALE,
      CALL_CELL_RUNTIME_MESSAGE.TARGET_MOVED,
      {
        classification: CALL_CELL_ROUTE_CLASSIFICATION.RETRYABLE,
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
    throw new CallCellRoutingError(
      CALL_CELL_ROUTE_ERROR_CODE.TARGET_STALE,
      CALL_CELL_RUNTIME_MESSAGE.ACTUAL_NOT_ACTIVE,
      {
        classification: CALL_CELL_ROUTE_CLASSIFICATION.RETRYABLE,
        preserveReplicaState: true,
      },
    );
  }
  return localReplica;
}

function buildCallCellInvocation(
  handler,
  call,
  batch,
  partials,
  route,
  invocation,
  securityContext,
) {
  const exportName = resolveCallCellExportName(invocation);
  const input = exportName === CALL_CELL_INVOCATION_EXPORT_NAME.REDUCE ?
    partials :
    batch;
  return {
    args: [input, call.arguments],
    assertCurrentTarget: () =>
      assertCurrentCallCellTarget(handler, call, route, invocation),
    callCell: invocation.callCell,
    deadlineMs: invocation.deadlineMs,
    exportName,
    intentDigest: invocation.intentDigest,
    invocationId: invocation.id,
    invocationServiceId: route.serviceId,
    tenantId: securityContext.tenantId,
  };
}

function buildSuccessfulInvocationResponse(result) {
  const value = result?.journaled === true ? result.value : result;
  const componentResult =
    value && typeof value === 'object' && 'result' in value ?
      value :
      {partials: [], result: value};
  return {
    componentResult: normalizeCallComponentResult(componentResult.result),
    handlerProcessed: true,
    invocationOutcome: {
      classification: null,
      code: null,
      invoked: result?.replayed !== true,
      replayed: result?.replayed === true,
    },
    partials: componentResult.partials,
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
    throw new CallCellRoutingError(
      CALL_CELL_ROUTE_ERROR_CODE.AUTHENTICATION_FAILED,
      CALL_CELL_RUNTIME_MESSAGE.SECURITY_CONTEXT_INVALID,
    );
  }
  return Object.freeze({
    principal: envelope.principal,
    roles: Object.freeze([...roles]),
    tenantId: envelope.tenantId,
  });
}

async function handleCallCellInvocation(handler, envelope) {
  const payload = envelope?.payload;
  const invocation = payload?.invocation;
  const route = payload?.route;
  const call = payload?.call;
  const batch = payload?.batch;
  const partials = payload?.partials;
  let invocationStarted = false;
  try {
    assertCallCellRuntimeOwner(handler.serviceRuntimeLifecycle);
    assertCallCellInvocationPayload(invocation, route, call, batch, partials);
    const securityContext = resolveEnvelopeSecurityContext(envelope);
    assertCallCellRouteTenant(route, securityContext);
    const admittedCall = {
      ...call,
      securityContext,
    };
    let localReplica = assertCurrentCallCellTarget(
      handler,
      admittedCall,
      route,
      invocation,
    );
    const health = await handler.serviceRuntimeLifecycle.health(
      localReplica.replicaHandle,
    );
    assertHealthyCallCellActual(health);
    localReplica = assertCurrentCallCellTarget(
      handler,
      admittedCall,
      route,
      invocation,
    );
    invocationStarted = true;
    const result = await handler.serviceRuntimeLifecycle.invoke(
      localReplica.replicaHandle,
      buildCallCellInvocation(
        handler,
        admittedCall,
        batch,
        partials,
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
  assertCurrentCallCellTarget,
  handleCallCellInvocation,
};
