/**
 * Tests for observe (warn) and enforce (reject) migration modes
 * of the mutation guard and deprecation utilities.
 *
 * Validates: Requirements 13.1, 13.5
 */
// @ts-nocheck


import {describe, it} from 'node:test';
import assert from 'node:assert/strict';
import {
  MUTATION_GUARD_MODE,
  MUTATION_GUARD_ERROR_MSG,
  MUTATION_GUARD_ERROR_CODE,
  guardMutation,
} from '../../src/admin/admin-mutation-guard.js';
import {
  DEPRECATION_WARNING,
  DEPRECATION_ERROR_MSG,
  buildDeprecationNotice,
  isDeprecatedPath,
} from '../../src/admin/admin-deprecation.js';
import {ADMIN_META_ACTION} from
  '../../src/admin/admin-meta-command-handlers.js';

// --- Observe mode (warn) ---

describe('guardMutation observe mode (warn)', () => {
  it('known action in warn mode is allowed without warning', () => {
    const result = guardMutation(
      ADMIN_META_ACTION.GET_CACHE_DUMP,
      MUTATION_GUARD_MODE.WARN,
    );
    assert.equal(result.allowed, true);
    assert.equal(result.warning, undefined);
    assert.equal(result.error, undefined);
  });

  it('deprecated action in warn mode is allowed with warning', () => {
    const result = guardMutation(
      'directWrite',
      MUTATION_GUARD_MODE.WARN,
    );
    assert.equal(result.allowed, true);
    assert.equal(
      result.warning,
      DEPRECATION_WARNING.DIRECT_MUTATION,
    );
  });

  it('warn mode never rejects', () => {
    const result = guardMutation(
      'unknownBypassAction',
      MUTATION_GUARD_MODE.WARN,
    );
    assert.equal(result.allowed, true);
    assert.equal(result.error, undefined);
    assert.equal(result.code, undefined);
  });
});

// --- Enforce mode (reject) ---

describe('guardMutation enforce mode (reject)', () => {
  it('known action in reject mode is allowed', () => {
    const result = guardMutation(
      ADMIN_META_ACTION.GET_CACHE_DUMP,
      MUTATION_GUARD_MODE.REJECT,
    );
    assert.equal(result.allowed, true);
    assert.equal(result.error, undefined);
  });

  it('deprecated action in reject mode is rejected', () => {
    const result = guardMutation(
      'directWrite',
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

  it('reject mode hard-fails deprecated paths', () => {
    const result = guardMutation(
      'legacyBypass',
      MUTATION_GUARD_MODE.REJECT,
    );
    assert.equal(result.allowed, false);
    assert.equal(result.warning, undefined);
    assert.equal(
      result.error,
      MUTATION_GUARD_ERROR_MSG.BYPASS_REJECTED,
    );
  });
});

// --- Guard validation ---

describe('guardMutation validation', () => {
  it('missing action returns error', () => {
    const result = guardMutation(
      null,
      MUTATION_GUARD_MODE.WARN,
    );
    assert.equal(result.allowed, false);
    assert.equal(
      result.error,
      MUTATION_GUARD_ERROR_MSG.ACTION_REQUIRED,
    );
  });

  it('missing mode returns error', () => {
    const result = guardMutation('someAction', null);
    assert.equal(result.allowed, false);
    assert.equal(
      result.error,
      MUTATION_GUARD_ERROR_MSG.MODE_REQUIRED,
    );
  });

  it('invalid mode returns error', () => {
    const result = guardMutation('someAction', 'invalid');
    assert.equal(result.allowed, false);
    assert.equal(
      result.error,
      MUTATION_GUARD_ERROR_MSG.MODE_REQUIRED,
    );
  });
});

// --- Deprecation utilities ---

describe('deprecation utilities', () => {
  it('isDeprecatedPath returns false for known actions', () => {
    assert.equal(
      isDeprecatedPath(ADMIN_META_ACTION.GET_CACHE_DUMP),
      false,
    );
    assert.equal(
      isDeprecatedPath(ADMIN_META_ACTION.EXECUTE_QUERY),
      false,
    );
    assert.equal(
      isDeprecatedPath(ADMIN_META_ACTION.LIST_SERVICES),
      false,
    );
  });

  it('isDeprecatedPath returns true for unknown actions', () => {
    assert.equal(isDeprecatedPath('directWrite'), true);
    assert.equal(isDeprecatedPath('legacyCacheWrite'), true);
    assert.equal(isDeprecatedPath('bypassMutation'), true);
  });

  it('buildDeprecationNotice returns frozen notice', () => {
    const notice = buildDeprecationNotice(
      DEPRECATION_WARNING.DIRECT_MUTATION,
    );
    assert.equal(notice.deprecated, true);
    assert.equal(
      notice.warning,
      DEPRECATION_WARNING.DIRECT_MUTATION,
    );
    assert.equal(typeof notice.timestamp, 'number');
    assert.ok(Object.isFrozen(notice));
  });

  it('buildDeprecationNotice requires warningType', () => {
    const result = buildDeprecationNotice(null);
    assert.equal(result.success, false);
    assert.equal(
      result.error,
      DEPRECATION_ERROR_MSG.WARNING_TYPE_REQUIRED,
    );
  });

  it('buildDeprecationNotice includes context when provided', () => {
    const ctx = {action: 'directWrite', source: 'admin-api'};
    const notice = buildDeprecationNotice(
      DEPRECATION_WARNING.DIRECT_CACHE_WRITE,
      ctx,
    );
    assert.equal(notice.deprecated, true);
    assert.equal(
      notice.warning,
      DEPRECATION_WARNING.DIRECT_CACHE_WRITE,
    );
    assert.deepStrictEqual(notice.context, ctx);
  });
});

// --- Mode transition ---

describe('mode transition behavior', () => {
  it('same action transitions from allowed-with-warning to rejected',
    () => {
      const action = 'directWrite';

      const warnResult = guardMutation(
        action,
        MUTATION_GUARD_MODE.WARN,
      );
      assert.equal(warnResult.allowed, true);
      assert.equal(
        warnResult.warning,
        DEPRECATION_WARNING.DIRECT_MUTATION,
      );

      const rejectResult = guardMutation(
        action,
        MUTATION_GUARD_MODE.REJECT,
      );
      assert.equal(rejectResult.allowed, false);
      assert.equal(
        rejectResult.error,
        MUTATION_GUARD_ERROR_MSG.BYPASS_REJECTED,
      );
      assert.equal(
        rejectResult.code,
        MUTATION_GUARD_ERROR_CODE.BYPASS_REJECTED,
      );
    });

  it('non-deprecated actions are unaffected by mode', () => {
    const action = ADMIN_META_ACTION.GET_NODE_STATUS;

    const warnResult = guardMutation(
      action,
      MUTATION_GUARD_MODE.WARN,
    );
    assert.equal(warnResult.allowed, true);
    assert.equal(warnResult.warning, undefined);
    assert.equal(warnResult.error, undefined);

    const rejectResult = guardMutation(
      action,
      MUTATION_GUARD_MODE.REJECT,
    );
    assert.equal(rejectResult.allowed, true);
    assert.equal(rejectResult.warning, undefined);
    assert.equal(rejectResult.error, undefined);
  });
});
