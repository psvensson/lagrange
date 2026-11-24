/**
 * Tests for rollback procedures and deprecated bypass path removal.
 *
 * Validates: Requirements 13.3, 13.4, 13.5
 */

import {describe, it} from 'node:test';
import assert from 'node:assert/strict';
import {
  MUTATION_GUARD_MODE,
  guardMutation,
} from '../../src/admin/admin-mutation-guard.js';
import {
  DEPRECATION_WARNING,
  isDeprecatedPath,
} from '../../src/admin/admin-deprecation.js';
import {ADMIN_META_ACTION} from
  '../../src/admin/admin-meta-command-handlers.js';

// --- Rollback procedure tests ---

describe('Rollback procedure (reject -> warn mode)', () => {
  it('switching from reject to warn re-allows deprecated paths',
    () => {
      const rejected = guardMutation(
        'directWrite', MUTATION_GUARD_MODE.REJECT,
      );
      assert.equal(rejected.allowed, false);
      assert.ok(rejected.error);

      const warned = guardMutation(
        'directWrite', MUTATION_GUARD_MODE.WARN,
      );
      assert.equal(warned.allowed, true);
      assert.equal(warned.warning, DEPRECATION_WARNING.DIRECT_MUTATION);
    });

  it('known actions work in both modes', () => {
    const action = ADMIN_META_ACTION.EXECUTE_QUERY;

    const warnResult = guardMutation(
      action, MUTATION_GUARD_MODE.WARN,
    );
    assert.equal(warnResult.allowed, true);
    assert.equal(warnResult.warning, undefined);

    const rejectResult = guardMutation(
      action, MUTATION_GUARD_MODE.REJECT,
    );
    assert.equal(rejectResult.allowed, true);
    assert.equal(rejectResult.error, undefined);
  });
});

// --- Deprecated bypass removal tests ---

describe('Deprecated bypass path removal', () => {
  it('isDeprecatedPath identifies bypass actions', () => {
    assert.equal(isDeprecatedPath('directWrite'), true);
    assert.equal(isDeprecatedPath('legacyCacheWrite'), true);
    assert.equal(isDeprecatedPath('unknownAction'), true);
  });

  it('isDeprecatedPath identifies known meta-service actions', () => {
    for (const action of Object.values(ADMIN_META_ACTION)) {
      assert.equal(
        isDeprecatedPath(action), false,
        `${action} should not be deprecated`,
      );
    }
  });

  it('reject mode blocks all deprecated paths', () => {
    const deprecated = [
      'directWrite', 'legacyCacheWrite', 'bypassMutation',
    ];
    for (const action of deprecated) {
      const result = guardMutation(
        action, MUTATION_GUARD_MODE.REJECT,
      );
      assert.equal(
        result.allowed, false,
        `${action} should be rejected`,
      );
      assert.ok(result.error);
      assert.ok(result.code);
    }
  });

  it('warn mode warns on all deprecated paths', () => {
    const deprecated = [
      'directWrite', 'legacyCacheWrite', 'bypassMutation',
    ];
    for (const action of deprecated) {
      const result = guardMutation(
        action, MUTATION_GUARD_MODE.WARN,
      );
      assert.equal(
        result.allowed, true,
        `${action} should be allowed with warning`,
      );
      assert.equal(
        result.warning, DEPRECATION_WARNING.DIRECT_MUTATION,
      );
    }
  });
});
