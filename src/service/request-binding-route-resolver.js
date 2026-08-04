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
    // v3 handler-aware routing: the bound handler id travels with the
    // route so the request path can pass it to the fixed
    // handle-request export. v2 bindings carry no handler id (null).
    const handlerId =
      binding.declaration.schema_version === DEPLOYMENT_BINDING_SCHEMA_VERSION_V3 ?
        binding.declaration.target.handler_id :
        null;
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
        DEPLOYMENT_BINDING_SOURCE_KIND.REQUEST,
      ) ||
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
      handlerId,
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
      'handlerId',
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
