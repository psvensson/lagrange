/**
 * Tests for admin-mutation-guard.
 * Requirements: 1.5, 12.2
 */

import {describe, it} from 'node:test';
import assert from 'node:assert/strict';
import {
  MUTATION_GUARD_MODE,
  MUTATION_GUARD_ERROR_MSG,
  MUTATION_GUARD_ERROR_CODE,
  guardMutation,
} from '../../src/admin/admin-mutation-guard.js';
import {ADMIN_META_ACTION} from
  '../../src/admin/admin-meta-command-handlers.js';
import {WASM_META_ACTION} from '../../src/constants/index.js';
import {DEPRECATION_WARNING} from
  '../../src/admin/admin-deprecation.js';

describe('admin-mutation-guard', () => {
  describe('guardMutation', () => {
    it('returns allowed for known admin action', () => {
      const result = guardMutation(
        ADMIN_META_ACTION.EXECUTE_QUERY,
        MUTATION_GUARD_MODE.REJECT,
      );
      assert.equal(result.allowed, true);
      assert.equal(result.warning, undefined);
      assert.equal(result.error, undefined);
    });

    it('returns allowed with warning for deprecated action' +
      ' in WARN mode', () => {
      const result = guardMutation(
        'legacyDirectWrite',
        MUTATION_GUARD_MODE.WARN,
      );
      assert.equal(result.allowed, true);
      assert.equal(
        result.warning,
        DEPRECATION_WARNING.DIRECT_MUTATION,
      );
    });

    it('returns not allowed with error for deprecated action' +
      ' in REJECT mode', () => {
      const result = guardMutation(
        'legacyDirectWrite',
        MUTATION_GUARD_MODE.REJECT,
      );
      assert.equal(result.allowed, false);
      assert.equal(
        result.error,
        MUTATION_GUARD_ERROR_MSG.BYPASS_REJECTED,
      );
      assert.equal(
        result.code,
        MUTATION_GUARD_ERROR_CODE.BYPASS_REJECTED,
      );
    });

    it('returns error when action is missing', () => {
      const result = guardMutation(
        undefined,
        MUTATION_GUARD_MODE.WARN,
      );
      assert.equal(result.allowed, false);
      assert.equal(
        result.error,
        MUTATION_GUARD_ERROR_MSG.ACTION_REQUIRED,
      );
    });

    it('returns error when mode is missing', () => {
      const result = guardMutation(
        ADMIN_META_ACTION.EXECUTE_QUERY,
        undefined,
      );
      assert.equal(result.allowed, false);
      assert.equal(
        result.error,
        MUTATION_GUARD_ERROR_MSG.MODE_REQUIRED,
      );
    });

    it('returns allowed for known WASM action', () => {
      const result = guardMutation(
        WASM_META_ACTION.PUBLISH_MODULE,
        MUTATION_GUARD_MODE.REJECT,
      );
      assert.equal(result.allowed, true);
      assert.equal(result.warning, undefined);
      assert.equal(result.error, undefined);
    });
  });

  describe('MUTATION_GUARD_MODE constants', () => {
    it('has correct WARN value', () => {
      assert.equal(MUTATION_GUARD_MODE.WARN, 'warn');
    });

    it('has correct REJECT value', () => {
      assert.equal(MUTATION_GUARD_MODE.REJECT, 'reject');
    });

    it('is frozen', () => {
      assert.ok(Object.isFrozen(MUTATION_GUARD_MODE));
    });
  });
});
