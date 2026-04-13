/**
 * Verifies shared authn/authz checks apply to all management
 * commands independent of runtime kind. The same
 * validateSecurityContext and authorizeAction functions guard
 * native_js, wasm_component, and oci_container commands
 * identically — no per-kind auth branching exists.
 *
 * Requirements: 9.1, 9.5
 */
// @ts-nocheck


import {describe, it} from 'node:test';
import assert from 'node:assert/strict';
import {
  AUTH_ERROR_CODE,
  AUTH_ERROR_MSG,
  WILDCARD_POLICY,
  validateSecurityContext,
  authorizeAction,
} from '../../src/admin/admin-auth-middleware.js';
import {RUNTIME_KIND} from '../../src/constants/runtime.js';

// --- Helpers ---

const VALID_CONTEXT = Object.freeze({
  tenantId: 'tenant-1',
  principal: 'admin@example.com',
  roles: ['admin'],
});

const MANAGEMENT_ACTIONS = Object.freeze([
  'publishModule',
  'createService',
  'updateService',
  'scaleService',
  'rolloutService',
  'deleteService',
]);

// --- validateSecurityContext ---

describe('validateSecurityContext', () => {
  it('rejects null context', () => {
    const result = validateSecurityContext(null);
    assert.equal(result.valid, false);
    assert.equal(result.code, AUTH_ERROR_CODE.INVALID_CONTEXT);
    assert.equal(result.error, AUTH_ERROR_MSG.CONTEXT_REQUIRED);
  });

  it('rejects missing tenantId', () => {
    const result = validateSecurityContext({
      principal: 'user@example.com',
    });
    assert.equal(result.valid, false);
    assert.equal(result.code, AUTH_ERROR_CODE.UNAUTHENTICATED);
    assert.equal(result.error, AUTH_ERROR_MSG.TENANT_ID_REQUIRED);
  });

  it('rejects missing principal', () => {
    const result = validateSecurityContext({
      tenantId: 'tenant-1',
    });
    assert.equal(result.valid, false);
    assert.equal(result.code, AUTH_ERROR_CODE.UNAUTHENTICATED);
    assert.equal(result.error, AUTH_ERROR_MSG.PRINCIPAL_REQUIRED);
  });

  it('accepts valid context', () => {
    const result = validateSecurityContext(VALID_CONTEXT);
    assert.equal(result.valid, true);
    assert.equal(result.tenantId, VALID_CONTEXT.tenantId);
    assert.equal(result.principal, VALID_CONTEXT.principal);
    assert.deepEqual(result.roles, VALID_CONTEXT.roles);
  });
});

// --- authorizeAction ---

describe('authorizeAction', () => {
  it('wildcard policy allows any action', () => {
    const result = authorizeAction(
      VALID_CONTEXT, 'anyAction', WILDCARD_POLICY,
    );
    assert.equal(result.authorized, true);
  });

  it('specific policy allows listed action', () => {
    const policy = {
      allowedActions: new Set(['publishModule']),
    };
    const result = authorizeAction(
      VALID_CONTEXT, 'publishModule', policy,
    );
    assert.equal(result.authorized, true);
  });

  it('specific policy rejects unlisted action', () => {
    const policy = {
      allowedActions: new Set(['publishModule']),
    };
    const result = authorizeAction(
      VALID_CONTEXT, 'deleteService', policy,
    );
    assert.equal(result.authorized, false);
    assert.equal(result.code, AUTH_ERROR_CODE.UNAUTHORIZED);
    assert.equal(
      result.error, AUTH_ERROR_MSG.ACTION_NOT_PERMITTED,
    );
  });

  it('fails for unauthenticated context before checking policy',
    () => {
      const result = authorizeAction(
        {principal: 'user@example.com'},
        'publishModule',
        WILDCARD_POLICY,
      );
      assert.equal(result.authorized, false);
      assert.equal(result.code, AUTH_ERROR_CODE.UNAUTHENTICATED);
    },
  );

  it('policy with multiple allowed actions', () => {
    const policy = {
      allowedActions: new Set(['create', 'update', 'delete']),
    };
    assert.equal(
      authorizeAction(VALID_CONTEXT, 'create', policy).authorized,
      true,
    );
    assert.equal(
      authorizeAction(VALID_CONTEXT, 'update', policy).authorized,
      true,
    );
    assert.equal(
      authorizeAction(VALID_CONTEXT, 'delete', policy).authorized,
      true,
    );
    assert.equal(
      authorizeAction(VALID_CONTEXT, 'drop', policy).authorized,
      false,
    );
  });

  it('empty allowedActions set rejects everything', () => {
    const policy = {allowedActions: new Set()};
    for (const action of MANAGEMENT_ACTIONS) {
      const result = authorizeAction(
        VALID_CONTEXT, action, policy,
      );
      assert.equal(result.authorized, false);
      assert.equal(result.code, AUTH_ERROR_CODE.UNAUTHORIZED);
    }
  });
});

// --- Runtime-kind-independent auth ---

describe('auth checks are runtime-kind-independent', () => {
  const runtimeKinds = Object.values(RUNTIME_KIND);

  it('auth checks apply identically for native_js commands',
    () => {
      const ctx = {
        ...VALID_CONTEXT,
        runtimeKind: RUNTIME_KIND.NATIVE_JS,
      };
      const valid = validateSecurityContext(ctx);
      assert.equal(valid.valid, true);
      const auth = authorizeAction(
        ctx, 'createService', WILDCARD_POLICY,
      );
      assert.equal(auth.authorized, true);
    },
  );

  it('auth checks apply identically for wasm_component commands',
    () => {
      const ctx = {
        ...VALID_CONTEXT,
        runtimeKind: RUNTIME_KIND.WASM_COMPONENT,
      };
      const valid = validateSecurityContext(ctx);
      assert.equal(valid.valid, true);
      const auth = authorizeAction(
        ctx, 'publishModule', WILDCARD_POLICY,
      );
      assert.equal(auth.authorized, true);
    },
  );

  it('auth checks apply identically for oci_container commands',
    () => {
      const ctx = {
        ...VALID_CONTEXT,
        runtimeKind: RUNTIME_KIND.OCI_CONTAINER,
      };
      const valid = validateSecurityContext(ctx);
      assert.equal(valid.valid, true);
      const auth = authorizeAction(
        ctx, 'rolloutService', WILDCARD_POLICY,
      );
      assert.equal(auth.authorized, true);
    },
  );

  it('auth rejection is runtime-kind-agnostic', () => {
    const restrictivePolicy = {
      allowedActions: new Set(['publishModule']),
    };
    const results = runtimeKinds.map((kind) => {
      const ctx = {
        ...VALID_CONTEXT,
        runtimeKind: kind,
      };
      return authorizeAction(
        ctx, 'deleteService', restrictivePolicy,
      );
    });
    for (const result of results) {
      assert.equal(result.authorized, false);
      assert.equal(result.code, AUTH_ERROR_CODE.UNAUTHORIZED);
      assert.equal(
        result.error, AUTH_ERROR_MSG.ACTION_NOT_PERMITTED,
      );
    }
    // All results are structurally identical
    assert.deepEqual(results[0], results[1]);
    assert.deepEqual(results[1], results[2]);
  });

  it('all three runtime kinds share the same auth code path',
    () => {
      // The same function references are used for every kind.
      // Prove by running identical inputs and asserting identical
      // outputs across all runtime kinds.
      for (const action of MANAGEMENT_ACTIONS) {
        const outcomes = runtimeKinds.map((kind) => {
          const ctx = {
            ...VALID_CONTEXT,
            runtimeKind: kind,
          };
          return authorizeAction(ctx, action, WILDCARD_POLICY);
        });
        // Every runtime kind produces the same result
        assert.deepEqual(outcomes[0], outcomes[1]);
        assert.deepEqual(outcomes[1], outcomes[2]);
        assert.equal(outcomes[0].authorized, true);
      }
    },
  );
});
