/**
 * Tests for CLI/API compatibility envelopes, rollback procedures,
 * and deprecated bypass path removal.
 *
 * Validates: Requirements 13.2, 13.3, 13.4, 13.5
 */

import {describe, it} from 'node:test';
import assert from 'node:assert/strict';
import {
  CLI_COMPAT_ERROR_MSG,
  CLI_MESSAGE_CONTRACT,
  validateIncomingMessage,
  validateOutgoingMessage,
} from '../../src/admin/admin-cli-compat.js';
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

const missingField = CLI_COMPAT_ERROR_MSG.MISSING_REQUIRED_FIELD;

// --- CLI compatibility envelope tests ---

describe('CLI compatibility envelope validation', () => {
  it('valid query message passes validation', () => {
    const result = validateIncomingMessage({
      type: 'query', queryId: 'q1', sql: 'SELECT 1',
    });
    assert.equal(result.valid, true);
    assert.equal(result.messageType, 'query');
  });

  it('valid refresh message passes validation', () => {
    const result = validateIncomingMessage({type: 'refresh'});
    assert.equal(result.valid, true);
    assert.equal(result.messageType, 'refresh');
  });

  it('missing type field is rejected', () => {
    const result = validateIncomingMessage({});
    assert.equal(result.valid, false);
    assert.ok(result.errors.includes(
      CLI_COMPAT_ERROR_MSG.MISSING_TYPE_FIELD,
    ));
  });

  it('unknown message type is rejected', () => {
    const result = validateIncomingMessage({type: 'unknown'});
    assert.equal(result.valid, false);
    assert.ok(result.errors.includes(
      CLI_COMPAT_ERROR_MSG.UNKNOWN_MESSAGE_TYPE,
    ));
  });

  it('missing required field is rejected', () => {
    const result = validateIncomingMessage({
      type: 'query', queryId: 'q1',
    });
    const expectedError = missingField('sql');
    assert.equal(result.valid, false);
    assert.ok(result.errors.some((e) => e === expectedError));
  });

  it('valid queryResult outgoing message passes', () => {
    const result = validateOutgoingMessage({
      type: 'query_result', queryId: 'q1', timestamp: 123,
    });
    assert.equal(result.valid, true);
    assert.equal(result.messageType, 'query_result');
  });

  it('valid error outgoing message passes', () => {
    const result = validateOutgoingMessage({
      type: 'error', timestamp: 123, error: 'msg', errorCode: 'ERR',
    });
    assert.equal(result.valid, true);
    assert.equal(result.messageType, 'error');
  });

  it('missing outgoing required field is rejected', () => {
    const result = validateOutgoingMessage({
      type: 'query_result', queryId: 'q1',
    });
    const expectedError = missingField('timestamp');
    assert.equal(result.valid, false);
    assert.ok(result.errors.some((e) => e === expectedError));
  });
});

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

  it('CLI message contract is frozen', () => {
    assert.ok(Object.isFrozen(CLI_MESSAGE_CONTRACT));
    for (const entry of Object.values(CLI_MESSAGE_CONTRACT)) {
      assert.ok(Object.isFrozen(entry));
    }
  });

  it('CLI message contract covers all expected types', () => {
    const expected = [
      'QUERY', 'REFRESH', 'QUERY_RESULT',
      'CACHE_DUMP', 'CDC_EVENT', 'ERROR',
    ];
    for (const key of expected) {
      assert.ok(
        CLI_MESSAGE_CONTRACT[key],
        `${key} should be defined in contract`,
      );
      assert.ok(CLI_MESSAGE_CONTRACT[key].type);
      assert.ok(Array.isArray(CLI_MESSAGE_CONTRACT[key].requiredFields));
      assert.ok(Array.isArray(CLI_MESSAGE_CONTRACT[key].optionalFields));
    }
  });
});
