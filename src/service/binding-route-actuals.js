/**
 * Shared binding-route predicates over cache-projected rows: whether a
 * service definition is the ACTIVE compilation of a specific immutable
 * Binding, and whether a services row is a ready runtime Cell actual for
 * a service. Owner-neutral — the request and call Binding route
 * resolvers parameterize only the Binding source kind they route.
 */

import {
  UNIFIED_SERVICE_TYPE,
} from '../constants/unified-service-lifecycle.js';
import {
  canonicalJson,
} from '../control-plane/owners/deployment-binding-contract.js';
import {
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
  isActiveDefinitionForBinding,
  isReadyRuntimeActual,
};
