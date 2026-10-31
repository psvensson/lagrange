/**
 * Shared binding-route predicates over cache-projected rows: whether a
 * service definition is the ACTIVE compilation of a specific immutable
 * Binding, and whether a services row is a ready runtime Cell actual for
 * a service. Owner-neutral — the request and call Binding route
 * resolvers parameterize only the Binding source kind they route.
 */

import {
  SYSTEM_TABLE_NAME,
} from '../bootstrap/system-table-schemas-constants.js';
import {
  UNIFIED_SERVICE_TYPE,
} from '../constants/unified-service-lifecycle.js';
import {
  canonicalJson,
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

function filterGenerationalBindingCandidates(bindings, request, cache) {
  const byBindingId = new Map();
  for (const binding of bindings) {
    const list = byBindingId.get(binding.bindingId) || [];
    list.push(binding);
    byBindingId.set(binding.bindingId, list);
  }
  if (byBindingId.size > 1) {
    return {ambiguous: true, candidates: []};
  }
  let candidates = [...byBindingId.values()][0];
  candidates.sort((a, b) => b.generation - a.generation);

  if (request.bindingVersionId) {
    candidates = candidates.filter(
      (b) => b.bindingVersionId === request.bindingVersionId,
    );
  }
  if (request.callerServiceId) {
    const callerDef = cache.get(
      SYSTEM_TABLE_NAME.SERVICE_DEFINITIONS,
      request.callerServiceId,
    );
    if (callerDef) {
      const matchingCaller = candidates.filter(
        (b) =>
          b.declaration.target.package_id === callerDef.package_id &&
          b.declaration.target.manifest_digest === callerDef.manifest_digest,
      );
      if (matchingCaller.length > 0) {
        candidates = matchingCaller;
      }
    }
  }
  return {ambiguous: false, candidates};
}

function findActiveReadyBindingCandidate(candidates, cache, sourceKind) {
  for (const candidate of candidates) {
    const serviceId =
      deriveRequestServiceDefinitionId(candidate.bindingVersionId);
    const definition = cache.get(
      SYSTEM_TABLE_NAME.SERVICE_DEFINITIONS,
      serviceId,
    );
    const actuals =
      (cache.getAll(SYSTEM_TABLE_NAME.SERVICES) || [])
        .filter((actual) => isReadyRuntimeActual(actual, serviceId));
    if (
      isActiveDefinitionForBinding(definition, candidate, sourceKind) &&
      actuals.length > 0
    ) {
      return {
        chosenActuals: actuals,
        chosenBinding: candidate,
        chosenDefinition: definition,
        found: true,
        serviceId,
      };
    }
  }
  return {found: false};
}

function isActiveDefinitionForBinding(definition, binding, sourceKind) {
  if (
    definition?.status !== WASM_SERVICE_DEFINITION_STATUS.ACTIVE ||
    definition?.binding_version_id !== binding.bindingVersionId ||
    getBindingServiceDefinitionSourceKind(definition) !== sourceKind
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

export {
  filterGenerationalBindingCandidates,
  findActiveReadyBindingCandidate,
};
