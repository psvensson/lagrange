/**
 * Budget enforcement tests for resource quota checks.
 * Requirements: 10.1, 10.3
 *
 * Verifies that resource budget failures produce typed over-budget
 * errors with correct codes and messages from the quota enforcer.
 */

import {describe, it} from 'node:test';
import assert from 'node:assert/strict';
import {
  QUOTA_LIMIT,
  QUOTA_ERROR_CODE,
  QUOTA_ERROR_MSG,
  checkModuleSize,
  checkPackageCount,
  checkConcurrentOperations,
} from '../../src/admin/admin-quota-enforcer.js';

describe('runtime budget enforcement', () => {
  describe('module size budget', () => {
    it('allows size within limit', () => {
      const result = checkModuleSize(1024);
      assert.equal(result.allowed, true);
    });

    it('rejects size exceeding limit', () => {
      const result = checkModuleSize(
        QUOTA_LIMIT.MAX_MODULE_SIZE_BYTES + 1,
      );
      assert.equal(result.allowed, false);
      assert.equal(
        result.code,
        QUOTA_ERROR_CODE.MODULE_SIZE_EXCEEDED,
      );
    });

    it('rejects size at exact limit boundary', () => {
      const atLimit = checkModuleSize(
        QUOTA_LIMIT.MAX_MODULE_SIZE_BYTES,
      );
      assert.equal(atLimit.allowed, true);

      const overLimit = checkModuleSize(
        QUOTA_LIMIT.MAX_MODULE_SIZE_BYTES + 1,
      );
      assert.equal(overLimit.allowed, false);
    });

    it('rejects null/undefined size', () => {
      const nullResult = checkModuleSize(null);
      assert.equal(nullResult.allowed, false);
      assert.equal(
        nullResult.error,
        QUOTA_ERROR_MSG.SIZE_REQUIRED,
      );

      const undefResult = checkModuleSize(undefined);
      assert.equal(undefResult.allowed, false);
      assert.equal(
        undefResult.error,
        QUOTA_ERROR_MSG.SIZE_REQUIRED,
      );
    });

    it('custom limit overrides default', () => {
      const result = checkModuleSize(500, 100);
      assert.equal(result.allowed, false);
      assert.equal(
        result.code,
        QUOTA_ERROR_CODE.MODULE_SIZE_EXCEEDED,
      );
    });
  });

  describe('package count budget', () => {
    it('allows count within limit', () => {
      const result = checkPackageCount(10);
      assert.equal(result.allowed, true);
    });

    it('rejects count at limit', () => {
      const result = checkPackageCount(
        QUOTA_LIMIT.MAX_PACKAGE_COUNT,
      );
      assert.equal(result.allowed, false);
      assert.equal(
        result.code,
        QUOTA_ERROR_CODE.PACKAGE_COUNT_EXCEEDED,
      );
    });

    it('rejects count exceeding limit', () => {
      const result = checkPackageCount(
        QUOTA_LIMIT.MAX_PACKAGE_COUNT + 1,
      );
      assert.equal(result.allowed, false);
      assert.equal(
        result.code,
        QUOTA_ERROR_CODE.PACKAGE_COUNT_EXCEEDED,
      );
    });

    it('rejects null/undefined count', () => {
      const nullResult = checkPackageCount(null);
      assert.equal(nullResult.allowed, false);
      assert.equal(
        nullResult.error,
        QUOTA_ERROR_MSG.COUNT_REQUIRED,
      );

      const undefResult = checkPackageCount(undefined);
      assert.equal(undefResult.allowed, false);
      assert.equal(
        undefResult.error,
        QUOTA_ERROR_MSG.COUNT_REQUIRED,
      );
    });

    it('custom limit overrides default', () => {
      const result = checkPackageCount(5, 5);
      assert.equal(result.allowed, false);
      assert.equal(
        result.code,
        QUOTA_ERROR_CODE.PACKAGE_COUNT_EXCEEDED,
      );
    });
  });

  describe('concurrent operations budget', () => {
    it('allows count within limit', () => {
      const result = checkConcurrentOperations(10);
      assert.equal(result.allowed, true);
    });

    it('rejects count at limit', () => {
      const result = checkConcurrentOperations(
        QUOTA_LIMIT.MAX_CONCURRENT_OPERATIONS,
      );
      assert.equal(result.allowed, false);
      assert.equal(
        result.code,
        QUOTA_ERROR_CODE.CONCURRENT_OPS_EXCEEDED,
      );
    });

    it('rejects count exceeding limit', () => {
      const result = checkConcurrentOperations(
        QUOTA_LIMIT.MAX_CONCURRENT_OPERATIONS + 1,
      );
      assert.equal(result.allowed, false);
      assert.equal(
        result.code,
        QUOTA_ERROR_CODE.CONCURRENT_OPS_EXCEEDED,
      );
    });

    it('rejects null/undefined count', () => {
      const nullResult = checkConcurrentOperations(null);
      assert.equal(nullResult.allowed, false);
      assert.equal(
        nullResult.error,
        QUOTA_ERROR_MSG.COUNT_REQUIRED,
      );

      const undefResult = checkConcurrentOperations(undefined);
      assert.equal(undefResult.allowed, false);
      assert.equal(
        undefResult.error,
        QUOTA_ERROR_MSG.COUNT_REQUIRED,
      );
    });

    it('custom limit overrides default', () => {
      const result = checkConcurrentOperations(3, 3);
      assert.equal(result.allowed, false);
      assert.equal(
        result.code,
        QUOTA_ERROR_CODE.CONCURRENT_OPS_EXCEEDED,
      );
    });
  });

  describe('cross-cutting', () => {
    it('all quota checks return typed error codes', () => {
      const sizeResult = checkModuleSize(
        QUOTA_LIMIT.MAX_MODULE_SIZE_BYTES + 1,
      );
      assert.equal(
        sizeResult.code,
        QUOTA_ERROR_CODE.MODULE_SIZE_EXCEEDED,
      );

      const pkgResult = checkPackageCount(
        QUOTA_LIMIT.MAX_PACKAGE_COUNT,
      );
      assert.equal(
        pkgResult.code,
        QUOTA_ERROR_CODE.PACKAGE_COUNT_EXCEEDED,
      );

      const opsResult = checkConcurrentOperations(
        QUOTA_LIMIT.MAX_CONCURRENT_OPERATIONS,
      );
      assert.equal(
        opsResult.code,
        QUOTA_ERROR_CODE.CONCURRENT_OPS_EXCEEDED,
      );
    });

    it('all quota checks return descriptive error messages', () => {
      const sizeResult = checkModuleSize(
        QUOTA_LIMIT.MAX_MODULE_SIZE_BYTES + 1,
      );
      assert.equal(
        sizeResult.error,
        QUOTA_ERROR_MSG.MODULE_SIZE_EXCEEDED,
      );

      const pkgResult = checkPackageCount(
        QUOTA_LIMIT.MAX_PACKAGE_COUNT,
      );
      assert.equal(
        pkgResult.error,
        QUOTA_ERROR_MSG.PACKAGE_COUNT_EXCEEDED,
      );

      const opsResult = checkConcurrentOperations(
        QUOTA_LIMIT.MAX_CONCURRENT_OPERATIONS,
      );
      assert.equal(
        opsResult.error,
        QUOTA_ERROR_MSG.CONCURRENT_OPS_EXCEEDED,
      );
    });

    it('allowed results are frozen', () => {
      const result = checkModuleSize(1024);
      assert.equal(Object.isFrozen(result), true);
    });
  });
});
