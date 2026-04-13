/**
 * Tests for fail-closed behavior across policy and budget checks.
 *
 * When inputs are ambiguous, missing, or malformed, access MUST be
 * denied — never silently allowed.
 *
 * Validates: Requirements 9.5, 10.3, 14.2
 */
// @ts-nocheck


import {describe, it} from 'node:test';
import assert from 'node:assert/strict';
import {
  validateSecurityContext,
  authorizeAction,
  AUTH_ERROR_CODE,
} from '../../src/admin/admin-auth-middleware.js';
import {
  checkModuleSize,
  checkPackageCount,
  checkConcurrentOperations,
  QUOTA_ERROR_MSG,
} from '../../src/admin/admin-quota-enforcer.js';
import {
  enforceImagePolicy,
  checkRegistryAllowed,
  OCI_POLICY_DECISION,
  OCI_POLICY_ERROR,
} from '../../src/runtime/oci-registry-policy.js';
import {RuntimeDriverRegistry} from
  '../../src/runtime/runtime-driver-registry.js';
import {RuntimeDriver} from
  '../../src/runtime/runtime-driver.js';
import {UnknownRuntimeKindError} from
  '../../src/runtime/runtime-driver-errors.js';
import {RUNTIME_KIND} from '../../src/constants/runtime.js';

// --- Minimal concrete driver for registry tests ---

class StubDriver extends RuntimeDriver {
  constructor() {
    super(RUNTIME_KIND.NATIVE_JS);
  }
}

// --- Auth fail-closed ---

describe('Auth fail-closed', () => {
  it('null security context is denied', () => {
    const result = validateSecurityContext(null);
    assert.equal(result.valid, false);
    assert.equal(result.code, AUTH_ERROR_CODE.INVALID_CONTEXT);
    assert.ok(result.error);
  });

  it('undefined security context is denied', () => {
    const result = validateSecurityContext(undefined);
    assert.equal(result.valid, false);
    assert.equal(result.code, AUTH_ERROR_CODE.INVALID_CONTEXT);
    assert.ok(result.error);
  });

  it('empty object security context is denied', () => {
    const result = validateSecurityContext({});
    assert.equal(result.valid, false);
    assert.equal(result.code, AUTH_ERROR_CODE.UNAUTHENTICATED);
    assert.ok(result.error);
  });

  it('action not in policy is denied', () => {
    const context = {tenantId: 't1', principal: 'p1'};
    const policy = {allowedActions: new Set(['read'])};
    const result = authorizeAction(context, 'delete', policy);
    assert.equal(result.authorized, false);
    assert.equal(result.code, AUTH_ERROR_CODE.UNAUTHORIZED);
    assert.ok(result.error);
  });

  it('empty allowedActions set denies all', () => {
    const context = {tenantId: 't1', principal: 'p1'};
    const policy = {allowedActions: new Set()};
    const result = authorizeAction(context, 'read', policy);
    assert.equal(result.authorized, false);
    assert.equal(result.code, AUTH_ERROR_CODE.UNAUTHORIZED);
  });
});

// --- Quota fail-closed ---

describe('Quota fail-closed', () => {
  it('null module size is denied', () => {
    const result = checkModuleSize(null);
    assert.equal(result.allowed, false);
    assert.equal(result.error, QUOTA_ERROR_MSG.SIZE_REQUIRED);
  });

  it('null package count is denied', () => {
    const result = checkPackageCount(null);
    assert.equal(result.allowed, false);
    assert.equal(result.error, QUOTA_ERROR_MSG.COUNT_REQUIRED);
  });

  it('null concurrent ops count is denied', () => {
    const result = checkConcurrentOperations(null);
    assert.equal(result.allowed, false);
    assert.equal(result.error, QUOTA_ERROR_MSG.COUNT_REQUIRED);
  });

  it('zero limit denies everything', () => {
    const result = checkModuleSize(1, 0);
    assert.equal(result.allowed, false);
    assert.ok(result.error);
  });
});

// --- OCI policy fail-closed ---

describe('OCI policy fail-closed', () => {
  const validPolicy = {allowedRegistries: ['ghcr.io']};

  it('null policy denies image', () => {
    const result = enforceImagePolicy('ghcr.io/repo', null);
    assert.equal(result.allowed, false);
    assert.equal(result.decision, OCI_POLICY_DECISION.DENIED);
    assert.ok(result.errors.includes(OCI_POLICY_ERROR.DENY_BY_DEFAULT));
  });

  it('empty string ref is denied', () => {
    const result = enforceImagePolicy('', validPolicy);
    assert.equal(result.allowed, false);
    assert.equal(result.decision, OCI_POLICY_DECISION.DENIED);
    assert.ok(result.errors.includes(OCI_POLICY_ERROR.REF_REQUIRED));
  });

  it('non-string ref is denied', () => {
    const result = enforceImagePolicy(123, validPolicy);
    assert.equal(result.allowed, false);
    assert.equal(result.decision, OCI_POLICY_DECISION.DENIED);
    assert.ok(result.errors.includes(OCI_POLICY_ERROR.REF_REQUIRED));
  });

  it('null registry policy denies', () => {
    const result = checkRegistryAllowed('ghcr.io', null);
    assert.equal(result.decision, OCI_POLICY_DECISION.DENIED);
    assert.equal(result.reason, OCI_POLICY_ERROR.DENY_BY_DEFAULT);
  });
});

// --- Registry fail-closed ---

describe('Registry fail-closed', () => {
  it('unknown runtime kind throws UnknownRuntimeKindError', () => {
    const registry = new RuntimeDriverRegistry();
    registry.register(new StubDriver());
    registry.freeze();
    assert.throws(
      () => registry.getDriver('unknown_kind'),
      (err) => {
        assert.ok(err instanceof UnknownRuntimeKindError);
        assert.equal(err.kind, 'unknown_kind');
        return true;
      },
    );
  });

  it('null runtime kind throws', () => {
    const registry = new RuntimeDriverRegistry();
    registry.register(new StubDriver());
    registry.freeze();
    assert.throws(
      () => registry.getDriver(null),
      (err) => {
        assert.ok(err instanceof UnknownRuntimeKindError);
        return true;
      },
    );
  });

  it('empty string runtime kind throws', () => {
    const registry = new RuntimeDriverRegistry();
    registry.register(new StubDriver());
    registry.freeze();
    assert.throws(
      () => registry.getDriver(''),
      (err) => {
        assert.ok(err instanceof UnknownRuntimeKindError);
        return true;
      },
    );
  });
});

// --- Combined fail-closed contract ---

describe('Combined fail-closed contract', () => {
  it('all fail-closed checks produce actionable error info', () => {
    // Auth denials include error message and code
    const authResult = validateSecurityContext(null);
    assert.equal(typeof authResult.error, 'string');
    assert.ok(authResult.error.length > 0);
    assert.equal(typeof authResult.code, 'string');

    // Quota denials include error message
    const quotaResult = checkModuleSize(null);
    assert.equal(typeof quotaResult.error, 'string');
    assert.ok(quotaResult.error.length > 0);

    // OCI denials include errors array
    const ociResult = enforceImagePolicy('ghcr.io/repo', null);
    assert.ok(Array.isArray(ociResult.errors));
    assert.ok(ociResult.errors.length > 0);
    assert.ok(ociResult.errors.every((e) => typeof e === 'string'));

    // Registry denial includes typed error with message
    const registry = new RuntimeDriverRegistry();
    registry.register(new StubDriver());
    registry.freeze();
    try {
      registry.getDriver('bad_kind');
      assert.fail('expected UnknownRuntimeKindError');
    } catch (err) {
      assert.ok(err instanceof UnknownRuntimeKindError);
      assert.equal(typeof err.message, 'string');
      assert.ok(err.message.length > 0);
      assert.equal(err.kind, 'bad_kind');
      assert.ok(Array.isArray(err.availableKinds));
    }
  });
});
