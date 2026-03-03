/**
 * Shared CDC propagation filter for bootstrap paths.
 *
 * Used by both seed bootstrap and node joining to determine
 * whether a partition's table should have CDC propagation attached.
 */

import {
  CACHE_HYDRATION_TABLES,
} from '../../cache/cache-constants.js';

const CACHE_HYDRATION_TABLE_SET = new Set(CACHE_HYDRATION_TABLES);

/**
 * Returns true if the given table should have CDC propagation
 * attached during bootstrap/join partition creation.
 * @param {string} tableName - The table name to check.
 * @return {boolean} Whether CDC propagation should be attached.
 */
export function shouldAttachPartitionCdcPropagation(tableName) {
  return CACHE_HYDRATION_TABLE_SET.has(tableName);
}
