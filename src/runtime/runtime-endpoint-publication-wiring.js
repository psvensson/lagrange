import {SYSTEM_TABLE_NAME} from
  '../bootstrap/system-table-schemas-constants.js';
import {ServiceEndpointsOwner} from
  '../control-plane/owners/service-endpoints-owner.js';
import {
  runtimeServiceReplicaBelongsToEntity,
} from '../rebalancer/runtime-service-replica-identity.js';
import {
  buildRuntimeEndpointRow,
  deriveEndpointId,
} from './runtime-endpoint-writer.js';

const LOGICAL_SERVICE_ID_LIST_SEPARATOR = ', ';

const RUNTIME_ENDPOINT_PUBLICATION_ERROR = Object.freeze({
  LIFECYCLE_REQUIRED:
    'Runtime endpoint publication requires ServiceRuntimeLifecycle',
  OWNER_REQUIRED:
    'Runtime endpoint publication requires ServiceEndpointsOwner',
  CACHE_REQUIRED:
    'Runtime endpoint publication requires system table cache',
  NODE_ID_REQUIRED:
    'Runtime endpoint publication requires nodeId',
  LOGICAL_SERVICE_NOT_FOUND:
    'Runtime endpoint publication could not resolve logical service',
  LOGICAL_SERVICE_AMBIGUOUS:
    'Runtime endpoint publication resolved multiple logical services',
});

function assertRuntimeEndpointPublicationOptions(options = {}) {
  if (!options.serviceRuntimeLifecycle ||
      typeof options.serviceRuntimeLifecycle.setEndpointWriter !== 'function' ||
      typeof options.serviceRuntimeLifecycle.setEndpointRemover !== 'function') {
    throw new TypeError(RUNTIME_ENDPOINT_PUBLICATION_ERROR.LIFECYCLE_REQUIRED);
  }
  if (!(options.serviceEndpointsOwner instanceof ServiceEndpointsOwner)) {
    throw new TypeError(RUNTIME_ENDPOINT_PUBLICATION_ERROR.OWNER_REQUIRED);
  }
  if (!options.systemTableCache ||
      typeof options.systemTableCache.getAll !== 'function') {
    throw new TypeError(RUNTIME_ENDPOINT_PUBLICATION_ERROR.CACHE_REQUIRED);
  }
  if (typeof options.nodeId !== 'string' || options.nodeId.length === 0) {
    throw new TypeError(RUNTIME_ENDPOINT_PUBLICATION_ERROR.NODE_ID_REQUIRED);
  }
}

function resolveLogicalServiceId(systemTableCache, replicaId) {
  const definitions = systemTableCache.getAll(
    SYSTEM_TABLE_NAME.SERVICE_DEFINITIONS,
  ) || [];
  const matchingServiceIds = definitions
    .map((row) => row?.service_id ?? row?.serviceId ?? null)
    .filter((serviceId) =>
      typeof serviceId === 'string' &&
      runtimeServiceReplicaBelongsToEntity(replicaId, serviceId));
  if (matchingServiceIds.length === 0) {
    throw new Error(
      `${RUNTIME_ENDPOINT_PUBLICATION_ERROR.LOGICAL_SERVICE_NOT_FOUND}: ` +
      String(replicaId),
    );
  }
  if (matchingServiceIds.length > 1) {
    throw new Error(
      `${RUNTIME_ENDPOINT_PUBLICATION_ERROR.LOGICAL_SERVICE_AMBIGUOUS}: ` +
      `${String(replicaId)} -> ` +
      matchingServiceIds.join(LOGICAL_SERVICE_ID_LIST_SEPARATOR),
    );
  }
  return matchingServiceIds[0];
}

function wireRuntimeEndpointPublication(options = {}) {
  assertRuntimeEndpointPublicationOptions(options);
  const {
    nodeId,
    serviceEndpointsOwner,
    serviceRuntimeLifecycle,
    systemTableCache,
  } = options;

  // Both directions resolve the replica's logical service from the desired
  // state the runtime-service rebalancer placed it for: one owner, one path.
  serviceRuntimeLifecycle.setEndpointWriter(async (
    replicaId,
    _runtimeKind,
    endpointIntent,
    mutationContext = {},
  ) => {
    const logicalServiceId = resolveLogicalServiceId(
      systemTableCache,
      replicaId,
    );
    const endpointRow = buildRuntimeEndpointRow(
      logicalServiceId,
      nodeId,
      endpointIntent,
    );
    return serviceEndpointsOwner.upsertEndpoint(endpointRow, mutationContext);
  });

  serviceRuntimeLifecycle.setEndpointRemover(async (
    replicaId,
    _runtimeNodeId,
    mutationContext = {},
  ) => {
    const logicalServiceId = resolveLogicalServiceId(
      systemTableCache,
      replicaId,
    );
    return serviceEndpointsOwner.removeEndpoint(
      deriveEndpointId(logicalServiceId, nodeId),
      mutationContext,
    );
  });

  return Object.freeze({
    nodeId,
    serviceEndpointsOwner,
  });
}

export {wireRuntimeEndpointPublication};
