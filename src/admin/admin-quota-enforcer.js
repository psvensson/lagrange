/**
 * Quota enforcement for WASM module operations.
 * Requirements: 9.3, 9.4
 */

import {NUM} from '../constants/index.js';

const BYTES_PER_MIB_100 = NUM.BYTES_PER_MIB * NUM.HUNDRED;
const DEFAULT_MAX_PACKAGE_COUNT = NUM.THOUSAND;
const DEFAULT_MAX_CONCURRENT_OPS = 50;

const QUOTA_LIMIT = Object.freeze({
  MAX_MODULE_SIZE_BYTES: BYTES_PER_MIB_100,
  MAX_PACKAGE_COUNT: DEFAULT_MAX_PACKAGE_COUNT,
  MAX_CONCURRENT_OPERATIONS: DEFAULT_MAX_CONCURRENT_OPS,
});

const QUOTA_ERROR_CODE = Object.freeze({
  MODULE_SIZE_EXCEEDED: 'MODULE_SIZE_EXCEEDED',
  PACKAGE_COUNT_EXCEEDED: 'PACKAGE_COUNT_EXCEEDED',
  CONCURRENT_OPS_EXCEEDED: 'CONCURRENT_OPS_EXCEEDED',
});

const QUOTA_ERROR_MSG = Object.freeze({
  MODULE_SIZE_EXCEEDED: 'Module size exceeds maximum allowed',
  PACKAGE_COUNT_EXCEEDED: 'Package count exceeds maximum allowed',
  CONCURRENT_OPS_EXCEEDED:
    'Concurrent operations exceed maximum allowed',
  SIZE_REQUIRED: 'Module size is required',
  COUNT_REQUIRED: 'Current count is required',
});

const ALLOWED_RESULT = Object.freeze({allowed: true});

/**
 * Check if module size is within quota.
 * @param {number|null|undefined} sizeBytes
 * @param {number} [limit]
 * @returns {{allowed: boolean, error?: string, code?: string}}
 */
function checkModuleSize(
  sizeBytes,
  limit = QUOTA_LIMIT.MAX_MODULE_SIZE_BYTES,
) {
  if (sizeBytes == null) {
    return {allowed: false, error: QUOTA_ERROR_MSG.SIZE_REQUIRED};
  }
  if (sizeBytes > limit) {
    return {
      allowed: false,
      error: QUOTA_ERROR_MSG.MODULE_SIZE_EXCEEDED,
      code: QUOTA_ERROR_CODE.MODULE_SIZE_EXCEEDED,
    };
  }
  return ALLOWED_RESULT;
}

/**
 * Check if package count is within quota.
 * @param {number|null|undefined} currentCount
 * @param {number} [limit]
 * @returns {{allowed: boolean, error?: string, code?: string}}
 */
function checkPackageCount(
  currentCount,
  limit = QUOTA_LIMIT.MAX_PACKAGE_COUNT,
) {
  if (currentCount == null) {
    return {allowed: false, error: QUOTA_ERROR_MSG.COUNT_REQUIRED};
  }
  if (currentCount >= limit) {
    return {
      allowed: false,
      error: QUOTA_ERROR_MSG.PACKAGE_COUNT_EXCEEDED,
      code: QUOTA_ERROR_CODE.PACKAGE_COUNT_EXCEEDED,
    };
  }
  return ALLOWED_RESULT;
}

/**
 * Check if concurrent operations are within quota.
 * @param {number|null|undefined} currentCount
 * @param {number} [limit]
 * @returns {{allowed: boolean, error?: string, code?: string}}
 */
function checkConcurrentOperations(
  currentCount,
  limit = QUOTA_LIMIT.MAX_CONCURRENT_OPERATIONS,
) {
  if (currentCount == null) {
    return {allowed: false, error: QUOTA_ERROR_MSG.COUNT_REQUIRED};
  }
  if (currentCount >= limit) {
    return {
      allowed: false,
      error: QUOTA_ERROR_MSG.CONCURRENT_OPS_EXCEEDED,
      code: QUOTA_ERROR_CODE.CONCURRENT_OPS_EXCEEDED,
    };
  }
  return ALLOWED_RESULT;
}

export {
  QUOTA_LIMIT,
  QUOTA_ERROR_CODE,
  QUOTA_ERROR_MSG,
  checkModuleSize,
  checkPackageCount,
  checkConcurrentOperations,
};
