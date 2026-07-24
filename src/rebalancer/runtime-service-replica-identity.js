/**
 * Canonical identity matching for runtime-service rows.
 *
 * Direct lifecycle use may project the bare entity id. Dispatched replicas
 * use `${entityId}-rN`, where N is a positive canonical decimal ordinal.
 */

const RUNTIME_SERVICE_REPLICA_ID_SEPARATOR = '-r';
const POSITIVE_DECIMAL_REPLICA_ORDINAL_PATTERN = /^[1-9]\d*$/;
const RUNTIME_SERVICE_TARGET_CLAIM_VERSION = 'runtime-service-target-v1';

/**
 * Decide whether a services-row id belongs to one runtime-service entity.
 * @param {unknown} serviceId
 * @param {unknown} entityId
 * @return {boolean}
 */
function runtimeServiceReplicaBelongsToEntity(serviceId, entityId) {
  if (
    typeof serviceId !== 'string' ||
    typeof entityId !== 'string' ||
    serviceId.length === 0 ||
    entityId.length === 0
  ) {
    return false;
  }
  if (serviceId === entityId) {
    return true;
  }

  const canonicalPrefix =
    `${entityId}${RUNTIME_SERVICE_REPLICA_ID_SEPARATOR}`;
  if (!serviceId.startsWith(canonicalPrefix)) {
    return false;
  }
  return POSITIVE_DECIMAL_REPLICA_ORDINAL_PATTERN.test(
    serviceId.slice(canonicalPrefix.length),
  );
}

/**
 * Decide whether an operation-dispatched runtime replica has canonical
 * entity-qualified ordinal identity. Direct lifecycle use may still use the
 * bare entity id, but distributed CREATE_REPLICA may not.
 * @param {unknown} serviceId
 * @param {unknown} entityId
 * @return {boolean}
 */
function runtimeServiceDispatchedReplicaBelongsToEntity(
  serviceId,
  entityId,
) {
  return (
    serviceId !== entityId &&
    runtimeServiceReplicaBelongsToEntity(serviceId, entityId)
  );
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
  if (!runtimeServiceDispatchedReplicaBelongsToEntity(serviceId, entityId)) {
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
  runtimeServiceDispatchedReplicaBelongsToEntity,
  runtimeServiceReplicaBelongsToEntity,
};
