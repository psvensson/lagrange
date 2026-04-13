/**
 * Tests for admin-quota-enforcer.
 * Requirements: 9.3, 9.4
 */
// @ts-nocheck


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

describe('admin-quota-enforcer', () => {
  describe('checkModuleSize', () => {
    it('returns allowed when size is within limit', () => {
      const result = checkModuleSize(QUOTA_LIMIT.MAX_MODULE_SIZE_BYTES - 1);
      assert.equal(result.allowed, true);
    });

    it('returns error when size exceeds limit', () => {
      const result = checkModuleSize(
        QUOTA_LIMIT.MAX_MODULE_SIZE_BYTES + 1,
      );
      assert.equal(result.allowed, false);
      assert.equal(
        result.error,
        QUOTA_ERROR_MSG.MODULE_SIZE_EXCEEDED,
      );
      assert.equal(
        result.code,
        QUOTA_ERROR_CODE.MODULE_SIZE_EXCEEDED,
      );
    });

    it('respects custom limit', () => {
      const customLimit = 500;
      const allowed = checkModuleSize(customLimit - 1, customLimit);
      assert.equal(allowed.allowed, true);

      const denied = checkModuleSize(customLimit + 1, customLimit);
      assert.equal(denied.allowed, false);
      assert.equal(
        denied.code,
        QUOTA_ERROR_CODE.MODULE_SIZE_EXCEEDED,
      );
    });

    it('returns error when size is null', () => {
      const result = checkModuleSize(null);
      assert.equal(result.allowed, false);
      assert.equal(result.error, QUOTA_ERROR_MSG.SIZE_REQUIRED);
    });

    it('returns error when size is undefined', () => {
      const result = checkModuleSize(undefined);
      assert.equal(result.allowed, false);
      assert.equal(result.error, QUOTA_ERROR_MSG.SIZE_REQUIRED);
    });
  });

  describe('checkPackageCount', () => {
    it('returns allowed when count is within limit', () => {
      const result = checkPackageCount(
        QUOTA_LIMIT.MAX_PACKAGE_COUNT - 1,
      );
      assert.equal(result.allowed, true);
    });

    it('returns error when count meets or exceeds limit', () => {
      const result = checkPackageCount(QUOTA_LIMIT.MAX_PACKAGE_COUNT);
      assert.equal(result.allowed, false);
      assert.equal(
        result.error,
        QUOTA_ERROR_MSG.PACKAGE_COUNT_EXCEEDED,
      );
      assert.equal(
        result.code,
        QUOTA_ERROR_CODE.PACKAGE_COUNT_EXCEEDED,
      );
    });

    it('respects custom limit', () => {
      const customLimit = 10;
      const allowed = checkPackageCount(customLimit - 1, customLimit);
      assert.equal(allowed.allowed, true);

      const denied = checkPackageCount(customLimit, customLimit);
      assert.equal(denied.allowed, false);
      assert.equal(
        denied.code,
        QUOTA_ERROR_CODE.PACKAGE_COUNT_EXCEEDED,
      );
    });
  });

  describe('checkConcurrentOperations', () => {
    it('returns allowed when count is within limit', () => {
      const result = checkConcurrentOperations(
        QUOTA_LIMIT.MAX_CONCURRENT_OPERATIONS - 1,
      );
      assert.equal(result.allowed, true);
    });

    it('returns error when count meets or exceeds limit', () => {
      const result = checkConcurrentOperations(
        QUOTA_LIMIT.MAX_CONCURRENT_OPERATIONS,
      );
      assert.equal(result.allowed, false);
      assert.equal(
        result.error,
        QUOTA_ERROR_MSG.CONCURRENT_OPS_EXCEEDED,
      );
      assert.equal(
        result.code,
        QUOTA_ERROR_CODE.CONCURRENT_OPS_EXCEEDED,
      );
    });
  });

  describe('QUOTA_LIMIT constants', () => {
    it('is frozen', () => {
      assert.ok(Object.isFrozen(QUOTA_LIMIT));
    });

    it('has expected default values', () => {
      assert.equal(
        QUOTA_LIMIT.MAX_MODULE_SIZE_BYTES,
        104857600,
      );
      assert.equal(QUOTA_LIMIT.MAX_PACKAGE_COUNT, 1000);
      assert.equal(QUOTA_LIMIT.MAX_CONCURRENT_OPERATIONS, 50);
    });
  });

  describe('QUOTA_ERROR_CODE constants', () => {
    it('is frozen', () => {
      assert.ok(Object.isFrozen(QUOTA_ERROR_CODE));
    });
  });

  describe('QUOTA_ERROR_MSG constants', () => {
    it('is frozen', () => {
      assert.ok(Object.isFrozen(QUOTA_ERROR_MSG));
    });
  });
});
