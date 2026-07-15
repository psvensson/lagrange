/**
 * Canonical identity matching for runtime-service rows.
 *
 * Direct lifecycle use may project the bare entity id. Dispatched replicas
 * use `${entityId}-rN`, where N is a positive canonical decimal ordinal.
 */

const RUNTIME_SERVICE_REPLICA_ID_SEPARATOR = '-r';
const POSITIVE_DECIMAL_REPLICA_ORDINAL_PATTERN = /^[1-9]\d*$/;

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

export {runtimeServiceReplicaBelongsToEntity};
