import {HEALTH_STATUS} from '../runtime/runtime-driver.js';
import {SYSTEM_TABLE_NAME} from
  '../bootstrap/system-table-schemas-constants.js';
import {
  isLocalPartitionServiceUsable,
  resolveLocalPartitionServicesForPartition,
} from '../cdc/cdc-integration-service-local-system-table-routing.js';
import {QUERY_RESULT_BUDGET_ERROR_CODE} from
  '../query/query-result-budget.js';
import {ReplicaStatus} from '../rebalancer/replica-status.js';
import {
  CallCellValueError,
  toCellBatch,
} from '../runtime/call-cell-value-mapping.js';
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
  LOCAL_BATCH_BOUND_INVALID:
    'Call Cell data-local dispatch carries no positive batch row bound',
  LOCAL_ENGINE_UNAVAILABLE:
    'Call Cell data-local dispatch found no local SQL engine to render ' +
    'the declared statement',
  LOCAL_PARTITION_UNAVAILABLE:
    'Call Cell shard partition has no usable local replica on this node',
  LOCAL_STATEMENT_INVALID:
    'Call Cell declared statement is not a partition-local SELECT',
  LOCAL_SHARD_READ_FAILED:
    'Call Cell shard partition read failed on the local replica',
  PARTITION_FENCE_STALE:
    'Call Cell shard partition ownership or topology epoch moved after ' +
    'dispatch',
  OWNER_UNAVAILABLE:
    'Call Cell runtime invocation owner is unavailable',
  PAYLOAD_INVALID: 'Call Cell Service_Message payload is invalid',
  ROUTE_TENANT_MISMATCH:
    'Call Cell route tenant does not match authenticated tenant',
  SECURITY_CONTEXT_INVALID:
    'Call Cell Service_Message security context is invalid',
  TARGET_MOVED: 'Call Cell actual moved to another node',
});
const AST_TYPE_SELECT = 'SELECT';
const PARTITION_STATE_NORMAL = 'NORMAL';
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

function assertCallCellInvocationPayload(
  invocation, route, call, batch, partials, partitionId,
) {
  const exportName = resolveCallCellExportName(invocation);
  const fields = [
    invocation?.id,
    invocation?.intentDigest,
    call?.name,
    call?.arguments,
    route?.replicaId,
  ];
  // A run dispatch carries EITHER a pre-built batch or a shard partition
  // for the data-local build on this node — never neither.
  const inputValid = exportName === CALL_CELL_INVOCATION_EXPORT_NAME.REDUCE ?
    Array.isArray(partials) :
    (Array.isArray(batch) ||
      (typeof partitionId === 'string' && partitionId.length > 0 &&
        batch === undefined));
  if (fields.every((value) => typeof value === 'string') && inputValid) {
    return;
  }
  throw new CallCellRoutingError(
    CALL_CELL_ROUTE_ERROR_CODE.INVALID_ARGUMENTS,
    CALL_CELL_RUNTIME_MESSAGE.PAYLOAD_INVALID,
  );
}

// Topology fence re-assert: the dispatch carried the CDC-visible tokens
// the invoker resolved from the canonical routing snapshot; THIS node
// re-reads its own cache rows and refuses typed TARGET_STALE (retryable,
// nothing invoked) when partition ownership or the topology epoch moved
// after dispatch — the same predicate shape the partition write guard
// and the descriptor-epoch contract apply. Absent fence = a non-data-
// local dispatch; nothing to re-assert.
function assertPartitionFenceCurrent(handler, payload) {
  const fence = payload?.partitionFence;
  if (!fence || typeof fence !== 'object') return;
  const cache = handler.systemTableCache;
  const partitionRow = cache?.get?.(
    SYSTEM_TABLE_NAME.PARTITIONS, payload.partitionId) || null;
  const tableRow = partitionRow?.table_name ?
    cache?.get?.(SYSTEM_TABLE_NAME.TABLES, partitionRow.table_name) ||
      cache?.get?.(SYSTEM_TABLE_NAME.TABLES, partitionRow.table_id) :
    null;
  const activeVersion = Number(
    tableRow?.active_partition_version ?? fence.activePartitionVersion ?? 1);
  const current = {
    activePartitionVersion: activeVersion,
    hostNodeId: partitionRow?.leader_node_id ?? null,
    partitionState: partitionRow?.state ?? PARTITION_STATE_NORMAL,
    partitionVersion: Number(partitionRow?.partition_version ?? 1),
  };
  const stale =
    !partitionRow ||
    current.hostNodeId !== fence.hostNodeId ||
    fence.hostNodeId !== handler.nodeId ||
    current.partitionState !== PARTITION_STATE_NORMAL ||
    current.partitionVersion !== Number(fence.partitionVersion ?? 1) ||
    current.activePartitionVersion !==
      Number(fence.activePartitionVersion ?? 1);
  if (stale) {
    throw new CallCellRoutingError(
      CALL_CELL_ROUTE_ERROR_CODE.TARGET_STALE,
      `${CALL_CELL_RUNTIME_MESSAGE.PARTITION_FENCE_STALE}: ` +
        `${payload.partitionId}`,
      {
        classification: CALL_CELL_ROUTE_CLASSIFICATION.RETRYABLE,
        preserveReplicaState: true,
      },
    );
  }
}

// Data-local shard batch: execute the (re-verified) Binding-declared
// statement against THIS node's replica of the shard partition and build
// the typed batch here — raw shard rows never cross the network. Bounded
// by the dispatched batchRowBound through the partition read budget and
// again through toCellBatch; every refusal is typed and invoked=false.
async function buildLocalShardBatch(handler, payload, route, invocation) {
  const services = handler.partitionServicesProvider?.() || null;
  const localServices =
    resolveLocalPartitionServicesForPartition(services, payload.partitionId);
  const partitionService = (localServices || [])
    .find((candidate) => isLocalPartitionServiceUsable(candidate));
  if (!partitionService) {
    throw new CallCellRoutingError(
      CALL_CELL_ROUTE_ERROR_CODE.ROUTE_UNAVAILABLE,
      `${CALL_CELL_RUNTIME_MESSAGE.LOCAL_PARTITION_UNAVAILABLE}: ` +
        `${payload.partitionId}`,
      {classification: CALL_CELL_ROUTE_CLASSIFICATION.RETRYABLE},
    );
  }
  const engine = handler.cdcIntegrationService?.sqlQueryEngine || null;
  if (typeof engine?.parse !== 'function' ||
      typeof engine?.queryExecutor?.buildSelectSQL !== 'function') {
    throw new CallCellRoutingError(
      CALL_CELL_ROUTE_ERROR_CODE.ROUTE_UNAVAILABLE,
      CALL_CELL_RUNTIME_MESSAGE.LOCAL_ENGINE_UNAVAILABLE,
      {classification: CALL_CELL_ROUTE_CLASSIFICATION.RETRYABLE},
    );
  }
  let ast = null;
  try {
    ast = engine.parse(route.statement);
  } catch {
    ast = null;
  }
  if (String(ast?.type || '').toUpperCase() !== AST_TYPE_SELECT ||
      !ast?.from?.name) {
    throw new CallCellRoutingError(
      CALL_CELL_ROUTE_ERROR_CODE.STATEMENT_INVALID,
      CALL_CELL_RUNTIME_MESSAGE.LOCAL_STATEMENT_INVALID,
    );
  }
  const batchRowBound = invocation?.callCell?.batchRowBound;
  if (!Number.isSafeInteger(batchRowBound) || batchRowBound <= 0) {
    throw new CallCellRoutingError(
      CALL_CELL_ROUTE_ERROR_CODE.INVALID_ARGUMENTS,
      CALL_CELL_RUNTIME_MESSAGE.LOCAL_BATCH_BOUND_INVALID,
    );
  }
  const sql = engine.queryExecutor.buildSelectSQL(ast);
  let result = null;
  try {
    result = await partitionService.executeQuery(sql, [], {
      resultDeadlineMs: invocation.deadlineMs,
      resultMaxRows: batchRowBound,
    });
  } catch (error) {
    if (error?.code === QUERY_RESULT_BUDGET_ERROR_CODE.ROWS_EXHAUSTED ||
        error?.code === QUERY_RESULT_BUDGET_ERROR_CODE.BYTES_EXHAUSTED) {
      throw new CallCellRoutingError(
        CALL_CELL_ROUTE_ERROR_CODE.BATCH_BOUND_EXCEEDED,
        error.message,
        {cause: error},
      );
    }
    if (error?.code === QUERY_RESULT_BUDGET_ERROR_CODE.WALL_TIME_EXHAUSTED) {
      throw new CallCellRoutingError(
        CALL_CELL_ROUTE_ERROR_CODE.DEADLINE_EXHAUSTED,
        error.message,
        {cause: error},
      );
    }
    throw new CallCellRoutingError(
      CALL_CELL_ROUTE_ERROR_CODE.ROUTE_UNAVAILABLE,
      `${CALL_CELL_RUNTIME_MESSAGE.LOCAL_SHARD_READ_FAILED}: ` +
        `${error?.message}`,
      {
        cause: error,
        classification: CALL_CELL_ROUTE_CLASSIFICATION.RETRYABLE,
      },
    );
  }
  if (result?.success === false) {
    throw new CallCellRoutingError(
      CALL_CELL_ROUTE_ERROR_CODE.ROUTE_UNAVAILABLE,
      `${CALL_CELL_RUNTIME_MESSAGE.LOCAL_SHARD_READ_FAILED}: ` +
        `${result?.error || payload.partitionId}`,
      {classification: CALL_CELL_ROUTE_CLASSIFICATION.RETRYABLE},
    );
  }
  try {
    return toCellBatch(result?.rows || [], batchRowBound);
  } catch (error) {
    if (error instanceof CallCellValueError) {
      throw new CallCellRoutingError(
        CALL_CELL_ROUTE_ERROR_CODE.BATCH_BOUND_EXCEEDED,
        error.message,
        {cause: error},
      );
    }
    throw error;
  }
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
    hostNodeId: route.hostNodeId ?? null,
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
  const partials = payload?.partials;
  let invocationStarted = false;
  try {
    assertCallCellRuntimeOwner(handler.serviceRuntimeLifecycle);
    assertCallCellInvocationPayload(
      invocation, route, call, payload?.batch, partials,
      payload?.partitionId,
    );
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
    assertPartitionFenceCurrent(handler, payload);
    // Data-local branch: a run dispatch without a pre-built batch names
    // its shard partition; this node builds the typed batch from its own
    // partition replica AFTER route/target admission and BEFORE the
    // component is touched (every refusal above and inside stays
    // invoked=false).
    const batch = payload?.batch === undefined &&
      typeof payload?.partitionId === 'string' &&
      resolveCallCellExportName(invocation) ===
        CALL_CELL_INVOCATION_EXPORT_NAME.RUN ?
      await buildLocalShardBatch(handler, payload, route, invocation) :
      payload?.batch;
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
