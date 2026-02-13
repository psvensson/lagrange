/**
 * Tests for admin-deprecation utilities.
 * Requirements: 11.4, 13.3
 */

import {describe, it} from 'node:test';
import assert from 'node:assert/strict';
import {
  DEPRECATION_WARNING,
  DEPRECATION_ERROR_MSG,
  buildDeprecationNotice,
  isDeprecatedPath,
} from '../../src/admin/admin-deprecation.js';
import {
  ADMIN_META_ACTION,
} from '../../src/admin/admin-meta-command-handlers.js';
import {WASM_META_ACTION} from '../../src/constants/index.js';

describe('admin-deprecation', () => {
  describe('DEPRECATION_WARNING constants', () => {
    it('are frozen strings', () => {
      assert.ok(Object.isFrozen(DEPRECATION_WARNING));
      for (const val of Object.values(DEPRECATION_WARNING)) {
        assert.equal(typeof val, 'string');
        assert.ok(val.length > 0);
      }
    });
  });

  describe('buildDeprecationNotice', () => {
    it('returns frozen object with correct fields', () => {
      const notice = buildDeprecationNotice(
        DEPRECATION_WARNING.DIRECT_MUTATION,
      );
      assert.ok(Object.isFrozen(notice));
      assert.equal(notice.deprecated, true);
      assert.equal(
        notice.warning,
        DEPRECATION_WARNING.DIRECT_MUTATION,
      );
      assert.equal(notice.context, null);
      assert.equal(typeof notice.timestamp, 'number');
    });

    it('includes context when provided', () => {
      const ctx = {action: 'legacyWrite', nodeId: 'n1'};
      const notice = buildDeprecationNotice(
        DEPRECATION_WARNING.DIRECT_CACHE_WRITE,
        ctx,
      );
      assert.deepEqual(notice.context, ctx);
      assert.equal(
        notice.warning,
        DEPRECATION_WARNING.DIRECT_CACHE_WRITE,
      );
    });

    it('defaults context to null when omitted', () => {
      const notice = buildDeprecationNotice(
        DEPRECATION_WARNING.LEGACY_ADMIN_HANDLER,
      );
      assert.equal(notice.context, null);
    });

    it('returns error when warningType is missing', () => {
      const result = buildDeprecationNotice(undefined);
      assert.equal(result.success, false);
      assert.equal(
        result.error,
        DEPRECATION_ERROR_MSG.WARNING_TYPE_REQUIRED,
      );
    });
  });

  describe('isDeprecatedPath', () => {
    it('returns false for ADMIN_META_ACTION values', () => {
      for (const action of Object.values(ADMIN_META_ACTION)) {
        assert.equal(
          isDeprecatedPath(action),
          false,
          `Expected ${action} to be non-deprecated`,
        );
      }
    });

    it('returns false for WASM_META_ACTION values', () => {
      for (const action of Object.values(WASM_META_ACTION)) {
        assert.equal(
          isDeprecatedPath(action),
          false,
          `Expected ${action} to be non-deprecated`,
        );
      }
    });

    it('returns true for unknown/legacy actions', () => {
      assert.equal(isDeprecatedPath('legacyWrite'), true);
      assert.equal(isDeprecatedPath('directMutate'), true);
      assert.equal(isDeprecatedPath(''), true);
    });
  });
});
