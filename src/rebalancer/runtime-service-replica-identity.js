/**
 * Canonical identity matching for runtime-service rows.
 *
 * Runtime identity has one classifier and two distinct semantic kinds:
 * the bare entity id is a direct lifecycle row, while `${entityId}-rN` is a
 * dispatched replica. Callers must ask for the kind they actually own.
 */

const RUNTIME_SERVICE_REPLICA_ID_SEPARATOR = '-r';
const POSITIVE_DECIMAL_REPLICA_ORDINAL_PATTERN = /^[1-9]\d*$/;
const RUNTIME_SERVICE_TARGET_CLAIM_VERSION = 'runtime-service-target-v1';
const RUNTIME_SERVICE_IDENTITY_KIND = Object.freeze({
  DIRECT_LIFECYCLE: 'direct_lifecycle',
  DISPATCHED_REPLICA: 'dispatched_replica',
  INVALID: 'invalid',
});

function classifyRuntimeServiceIdentity(serviceId, entityId) {
  if (
    typeof serviceId !== 'string' ||
    typeof entityId !== 'string' ||
    serviceId.length === 0 ||
    entityId.length === 0
  ) {
    return RUNTIME_SERVICE_IDENTITY_KIND.INVALID;
  }
  if (serviceId === entityId) {
    return RUNTIME_SERVICE_IDENTITY_KIND.DIRECT_LIFECYCLE;
  }
  const canonicalPrefix =
    `${entityId}${RUNTIME_SERVICE_REPLICA_ID_SEPARATOR}`;
  return serviceId.startsWith(canonicalPrefix) &&
    POSITIVE_DECIMAL_REPLICA_ORDINAL_PATTERN.test(
      serviceId.slice(canonicalPrefix.length),
    ) ?
    RUNTIME_SERVICE_IDENTITY_KIND.DISPATCHED_REPLICA :
    RUNTIME_SERVICE_IDENTITY_KIND.INVALID;
}

/**
 * Decide whether a services-row id belongs to one runtime-service entity.
 * @param {unknown} serviceId
 * @param {unknown} entityId
 * @return {boolean}
 */
function runtimeServiceReplicaBelongsToEntity(serviceId, entityId) {
  return classifyRuntimeServiceIdentity(serviceId, entityId) !==
    RUNTIME_SERVICE_IDENTITY_KIND.INVALID;
}

/**
 * Build the durable uniqueness claim persisted with an add-like runtime
 * operation. The operation ledger owns this claim; lifecycle and routing only
 * consume the resulting replica id.
 * @param {unknown} serviceId
 * @param {unknown} entityId
 * @return {string|null}
 */
function buildRuntimeServiceTargetClaimKey(serviceId, entityId) {
  if (classifyRuntimeServiceIdentity(serviceId, entityId) !==
    RUNTIME_SERVICE_IDENTITY_KIND.DISPATCHED_REPLICA) {
    return null;
  }
  return JSON.stringify([
    RUNTIME_SERVICE_TARGET_CLAIM_VERSION,
    entityId,
    serviceId,
  ]);
}

export {
  buildRuntimeServiceTargetClaimKey,
  runtimeServiceReplicaBelongsToEntity,
};
