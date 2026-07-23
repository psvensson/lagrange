import {createHash} from 'node:crypto';

import {SYSTEM_TABLE_NAME} from
  '../bootstrap/system-table-schemas-constants.js';
import {
  UNIFIED_SERVICE_TYPE,
} from '../constants/unified-service-lifecycle.js';
import {
  DEPLOYMENT_BINDING_SOURCE_KIND,
  canonicalJson,
  projectBinding,
} from '../control-plane/owners/deployment-binding-contract.js';
import {
  deriveRequestServiceDefinitionId,
  getBindingServiceDefinitionSourceKind,
} from
  '../control-plane/owners/request-binding-service-definition-contract.js';
import {
  runtimeServiceReplicaBelongsToEntity,
} from '../rebalancer/runtime-service-replica-identity.js';
import {ReplicaStatus} from '../rebalancer/replica-status.js';
import {
  WASM_SERVICE_DEFINITION_STATUS,
} from '../wasm-service/wasm-service-constants.js';
import {
  REQUEST_CELL_ROUTE_CLASSIFICATION,
  REQUEST_CELL_ROUTE_ERROR_CODE,
  createRoutingFailure,
} from './request-cell-routing-contract.js';

const HASH_ALGORITHM = 'sha256';
const HASH_ENCODING = 'hex';
const ROUTE_RESOLVER_ERROR = Object.freeze({
  CACHE_REQUIRED:
    'RequestBindingRouteResolver requires a system table cache',
  CORRUPT_BINDING:
    'Matching request Binding is outside its immutable contract',
  ROUTE_AMBIGUOUS:
    'More than one immutable request Binding matches this tenant route',
  ROUTE_NOT_FOUND:
    'No immutable request Binding matches this tenant route',
  ROUTE_UNAVAILABLE:
    'The matched request Binding has no current ready Cell',
  TARGET_STALE:
    'The selected request Cell actual is stale, moved, or superseded',
});

function isActiveDefinitionForBinding(definition, binding) {
  if (
    definition?.status !== WASM_SERVICE_DEFINITION_STATUS.ACTIVE ||
    definition?.binding_version_id !== binding.bindingVersionId ||
    getBindingServiceDefinitionSourceKind(definition) !==
      DEPLOYMENT_BINDING_SOURCE_KIND.REQUEST
  ) {
    return false;
  }
  try {
    const projection = JSON.parse(definition.binding_projection);
    return projection.binding_version_id === binding.bindingVersionId &&
      projection.tenant_id === binding.tenantId &&
      canonicalJson(projection.declaration) ===
        canonicalJson(binding.declaration);
  } catch {
    return false;
  }
}

function isReadyRuntimeActual(actual, serviceId) {
  return actual?.service_type === UNIFIED_SERVICE_TYPE.RUNTIME_SERVICE &&
    actual?.status === ReplicaStatus.ACTIVE &&
    typeof actual?.node_id === 'string' &&
    actual.node_id.length > 0 &&
    runtimeServiceReplicaBelongsToEntity(actual?.service_id, serviceId);
}

function selectActual(actuals, invocationId) {
  const ordered = actuals.slice().sort(
    (left, right) =>
      String(left.service_id).localeCompare(String(right.service_id)),
  );
  const selectionHash = createHash(HASH_ALGORITHM)
    .update(invocationId)
    .digest(HASH_ENCODING);
  const selection = Number.parseInt(selectionHash.slice(0, 12), 16);
  return ordered[selection % ordered.length];
}

class RequestBindingRouteResolver {
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
      throw createRoutingFailure(
        REQUEST_CELL_ROUTE_ERROR_CODE.ROUTE_UNAVAILABLE,
        ROUTE_RESOLVER_ERROR.CACHE_REQUIRED,
        {classification: REQUEST_CELL_ROUTE_CLASSIFICATION.RETRYABLE},
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
        row?.source_kind !== DEPLOYMENT_BINDING_SOURCE_KIND.REQUEST
      ) {
        continue;
      }
      try {
        const binding = projectBinding(row);
        if (
          binding.declaration.source.method === request.method &&
          binding.declaration.source.path === request.path
        ) {
          matches.push(binding);
        }
      } catch (cause) {
        throw createRoutingFailure(
          REQUEST_CELL_ROUTE_ERROR_CODE.ROUTE_UNAVAILABLE,
          ROUTE_RESOLVER_ERROR.CORRUPT_BINDING,
          {
            cause,
            classification: REQUEST_CELL_ROUTE_CLASSIFICATION.RETRYABLE,
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
      throw createRoutingFailure(
        REQUEST_CELL_ROUTE_ERROR_CODE.ROUTE_NOT_FOUND,
        ROUTE_RESOLVER_ERROR.ROUTE_NOT_FOUND,
      );
    }
    if (bindings.length > 1) {
      throw createRoutingFailure(
        REQUEST_CELL_ROUTE_ERROR_CODE.ROUTE_AMBIGUOUS,
        ROUTE_RESOLVER_ERROR.ROUTE_AMBIGUOUS,
      );
    }

    const binding = bindings[0];
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
      !isActiveDefinitionForBinding(definition, binding) ||
      actuals.length === 0
    ) {
      throw createRoutingFailure(
        REQUEST_CELL_ROUTE_ERROR_CODE.ROUTE_UNAVAILABLE,
        ROUTE_RESOLVER_ERROR.ROUTE_UNAVAILABLE,
        {classification: REQUEST_CELL_ROUTE_CLASSIFICATION.RETRYABLE},
      );
    }

    const actual = selectActual(actuals, request.invocationId);
    return Object.freeze({
      bindingDigest: definition.binding_digest,
      bindingVersionId: binding.bindingVersionId,
      method: request.method,
      nodeId: actual.node_id,
      path: request.path,
      replicaId: actual.service_id,
      serviceId,
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
      'method',
      'nodeId',
      'path',
      'replicaId',
      'serviceId',
      'targetAddress',
      'targetNodeId',
      'tenantId',
    ];
    if (fields.some((field) =>
      current[field] !== expectedRoute?.[field])) {
      throw createRoutingFailure(
        REQUEST_CELL_ROUTE_ERROR_CODE.TARGET_STALE,
        ROUTE_RESOLVER_ERROR.TARGET_STALE,
        {
          classification: REQUEST_CELL_ROUTE_CLASSIFICATION.RETRYABLE,
          preserveReplicaState: true,
        },
      );
    }
    return current;
  }
}

export {RequestBindingRouteResolver};
