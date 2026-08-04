import {createHash} from 'node:crypto';

import {SYSTEM_TABLE_NAME} from
  '../bootstrap/system-table-schemas-constants.js';
import {
  DEPLOYMENT_BINDING_SCHEMA_VERSION_V3,
  DEPLOYMENT_BINDING_SOURCE_KIND,
  projectBinding,
} from '../control-plane/owners/deployment-binding-contract.js';
import {
  deriveRequestServiceDefinitionId,
} from
  '../control-plane/owners/request-binding-service-definition-contract.js';
import {
  isActiveDefinitionForBinding,
  isReadyRuntimeActual,
} from './binding-route-actuals.js';
import {
  CALL_CELL_ROUTE_CLASSIFICATION,
  CALL_CELL_ROUTE_ERROR_CODE,
  createCallRoutingFailure,
  parseCallInvocationIdentity,
} from './call-cell-routing-contract.js';

const HASH_ALGORITHM = 'sha256';
const HASH_ENCODING = 'hex';
const ROUTE_RESOLVER_ERROR = Object.freeze({
  CACHE_REQUIRED:
    'CallBindingRouteResolver requires a system table cache',
  CORRUPT_BINDING:
    'Matching call Binding is outside its immutable contract',
  NOT_INVOCABLE:
    'The matched call Binding declares no partition-local statement',
  ROUTE_AMBIGUOUS:
    'More than one immutable call Binding matches this tenant call',
  ROUTE_NOT_FOUND:
    'No immutable call Binding matches this tenant call',
  ROUTE_UNAVAILABLE:
    'The matched call Binding has no current ready Cell',
  HOST_CELL_UNAVAILABLE:
    'The matched call Binding has no ready Cell on the shard host node',
  TARGET_STALE:
    'The selected call Cell actual is stale, moved, or superseded',
});

// One invocation, many wire identities: the base identity hashes to the
// invocation's primary replica; slot-scoped identities offset from that
// primary by their slot ordinal, spreading shard runs deterministically
// across the ready replicas — every hop parsing the same wire identity
// (adapter selection, receiver re-assert) lands on the same replica.
function selectActual(actuals, invocationId) {
  const ordered = actuals.slice().sort(
    (left, right) =>
      String(left.service_id).localeCompare(String(right.service_id)),
  );
  const identity = parseCallInvocationIdentity(invocationId);
  const selectionHash = createHash(HASH_ALGORITHM)
    .update(identity.baseInvocationId)
    .digest(HASH_ENCODING);
  const selection = Number.parseInt(selectionHash.slice(0, 12), 16) +
    identity.slotOrdinal;
  return ordered[selection % ordered.length];
}

// The resolved route carries the bound operation id for v3 bindings
// (the generic-dispatch ABI's first argument); schema v2 keeps the
// pre-v3 invocation shape with no operation tag.
function resolvedHandlerId(binding) {
  return binding.declaration.schema_version ===
    DEPLOYMENT_BINDING_SCHEMA_VERSION_V3 ?
    binding.declaration.target.handler_id :
    null;
}

class CallBindingRouteResolver {
  constructor(options = {}) {
    this._systemTableCacheProvider =
      typeof options.systemTableCacheProvider === 'function' ?
        options.systemTableCacheProvider :
        () => options.systemTableCache || null;
  }

  _getCache() {
    const cache = this._systemTableCacheProvider();
    if (
      !cache ||
      typeof cache.get !== 'function' ||
      typeof cache.getAll !== 'function'
    ) {
      throw createCallRoutingFailure(
        CALL_CELL_ROUTE_ERROR_CODE.ROUTE_UNAVAILABLE,
        ROUTE_RESOLVER_ERROR.CACHE_REQUIRED,
        {classification: CALL_CELL_ROUTE_CLASSIFICATION.RETRYABLE},
      );
    }
    return cache;
  }

  _findMatchingBindings(cache, request) {
    const rows =
      cache.getAll(SYSTEM_TABLE_NAME.SERVICE_BINDINGS) || [];
    const matches = [];
    for (const row of rows) {
      if (
        row?.tenant_id !== request.securityContext.tenantId ||
        row?.source_kind !== DEPLOYMENT_BINDING_SOURCE_KIND.CALL
      ) {
        continue;
      }
      try {
        const binding = projectBinding(row);
        if (binding.declaration.source.name === request.name) {
          matches.push(binding);
        }
      } catch (cause) {
        throw createCallRoutingFailure(
          CALL_CELL_ROUTE_ERROR_CODE.ROUTE_UNAVAILABLE,
          ROUTE_RESOLVER_ERROR.CORRUPT_BINDING,
          {
            cause,
            classification: CALL_CELL_ROUTE_CLASSIFICATION.RETRYABLE,
          },
        );
      }
    }
    return matches;
  }

  resolve(request) {
    const cache = this._getCache();
    const bindings = this._findMatchingBindings(cache, request);
    if (bindings.length === 0) {
      throw createCallRoutingFailure(
        CALL_CELL_ROUTE_ERROR_CODE.ROUTE_NOT_FOUND,
        ROUTE_RESOLVER_ERROR.ROUTE_NOT_FOUND,
      );
    }
    if (bindings.length > 1) {
      throw createCallRoutingFailure(
        CALL_CELL_ROUTE_ERROR_CODE.ROUTE_AMBIGUOUS,
        ROUTE_RESOLVER_ERROR.ROUTE_AMBIGUOUS,
      );
    }

    const binding = bindings[0];
    const statement = binding.declaration.source.statement;
    if (typeof statement !== 'string' || statement.length === 0) {
      throw createCallRoutingFailure(
        CALL_CELL_ROUTE_ERROR_CODE.NOT_INVOCABLE,
        ROUTE_RESOLVER_ERROR.NOT_INVOCABLE,
      );
    }
    const serviceId =
      deriveRequestServiceDefinitionId(binding.bindingVersionId);
    const definition = cache.get(
      SYSTEM_TABLE_NAME.SERVICE_DEFINITIONS,
      serviceId,
    );
    const actuals =
      (cache.getAll(SYSTEM_TABLE_NAME.SERVICES) || [])
        .filter((actual) => isReadyRuntimeActual(actual, serviceId));
    if (
      !isActiveDefinitionForBinding(
        definition,
        binding,
        DEPLOYMENT_BINDING_SOURCE_KIND.CALL,
      ) ||
      actuals.length === 0
    ) {
      throw createCallRoutingFailure(
        CALL_CELL_ROUTE_ERROR_CODE.ROUTE_UNAVAILABLE,
        ROUTE_RESOLVER_ERROR.ROUTE_UNAVAILABLE,
        {classification: CALL_CELL_ROUTE_CLASSIFICATION.RETRYABLE},
      );
    }

    // Data-local selection: a dispatch that resolved its shard's host
    // node restricts selection to ready Cell actuals ON that node. The
    // distinct typed refusal (never plain ROUTE_UNAVAILABLE) is the
    // activation trigger — a co-located Cell can be activated, whereas a
    // Binding with no ready Cell anywhere cannot execute at all.
    const hostNodeId = typeof request.hostNodeId === 'string' &&
      request.hostNodeId.length > 0 ?
      request.hostNodeId :
      null;
    const selectable = hostNodeId ?
      actuals.filter((candidate) => candidate.node_id === hostNodeId) :
      actuals;
    if (selectable.length === 0) {
      throw createCallRoutingFailure(
        CALL_CELL_ROUTE_ERROR_CODE.HOST_CELL_UNAVAILABLE,
        `${ROUTE_RESOLVER_ERROR.HOST_CELL_UNAVAILABLE}: ${hostNodeId}`,
        {classification: CALL_CELL_ROUTE_CLASSIFICATION.RETRYABLE},
      );
    }
    const actual = selectActual(selectable, request.invocationId);
    return Object.freeze({
      bindingDigest: definition.binding_digest,
      bindingVersionId: binding.bindingVersionId,
      handlerId: resolvedHandlerId(binding),
      hostNodeId,
      name: request.name,
      nodeId: actual.node_id,
      replicaId: actual.service_id,
      serviceId,
      statement,
      targetAddress:
        `${actual.node_id}/service/runtime-service-handler`,
      targetNodeId: actual.node_id,
      tenantId: binding.tenantId,
    });
  }

  assertSelectedRoute(request, expectedRoute) {
    const current = this.resolve(request);
    const fields = [
      'bindingDigest',
      'bindingVersionId',
      'handlerId',
      'hostNodeId',
      'name',
      'nodeId',
      'replicaId',
      'serviceId',
      'statement',
      'targetAddress',
      'targetNodeId',
      'tenantId',
    ];
    if (fields.some((field) =>
      (current[field] ?? null) !== (expectedRoute?.[field] ?? null))) {
      throw createCallRoutingFailure(
        CALL_CELL_ROUTE_ERROR_CODE.TARGET_STALE,
        ROUTE_RESOLVER_ERROR.TARGET_STALE,
        {
          classification: CALL_CELL_ROUTE_CLASSIFICATION.RETRYABLE,
          preserveReplicaState: true,
        },
      );
    }
    return current;
  }
}

export {CallBindingRouteResolver};
