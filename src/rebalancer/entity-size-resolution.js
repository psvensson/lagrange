/**
 * Entity size resolution for storage admission sizing.
 *
 * Admission and reservation sizing must use the partition's REAL
 * size_bytes (leader-maintained column on the partitions system table)
 * rather than a zero placeholder. The size is resolved once, normalized
 * the same way as the split/merge path
 * (sql-query-engine-provisioning-methods.js estimateSplitAdmissionBytes:
 * non-finite or non-positive values fall back to 0, which keeps
 * brand-new partitions on the minimum-replica floor), and threaded into
 * estimateReplicaBytes at every call site.
 *
 * @module rebalancer/entity-size-resolution
 */

import {SERVICE_TYPE} from '../constants/service.js';
import {SYSTEM_TABLE_NAME} from '../bootstrap/system-table-schemas-constants.js';

const LOCAL_STR_FUNCTION = 'function';

/**
 * Normalize one raw size_bytes value (0 for non-finite or non-positive,
 * mirroring the split path's normalization).
 * @param {*} rawSizeBytes
 * @return {number}
 */
function normalizeEntitySizeBytes(rawSizeBytes) {
  const sizeBytes = Number(rawSizeBytes);
  return Number.isFinite(sizeBytes) && sizeBytes > 0 ? sizeBytes : 0;
}

/**
 * Resolve the real size_bytes for one entity. Only partition entities
 * carry a leader-maintained size; every other entity type resolves to 0
 * (the estimate then falls back to the minimum-replica floor).
 * @param {Object} options
 * @param {string} options.entityType
 * @param {string} options.entityId
 * @param {Object|null} options.systemTableCache
 * @return {number}
 */
function resolveEntitySizeBytes(options = {}) {
  const entityType = options.entityType || SERVICE_TYPE.PARTITION;
  if (entityType !== SERVICE_TYPE.PARTITION) {
    return 0;
  }
  const systemTableCache = options.systemTableCache || null;
  if (
    !systemTableCache ||
    typeof systemTableCache.get !== LOCAL_STR_FUNCTION
  ) {
    return 0;
  }
  const partitionRow = systemTableCache.get(
    SYSTEM_TABLE_NAME.PARTITIONS,
    options.entityId,
  );
  return normalizeEntitySizeBytes(
    partitionRow?.size_bytes ?? partitionRow?.sizeBytes,
  );
}

export {normalizeEntitySizeBytes, resolveEntitySizeBytes};
