/**
 * Tests for admin-auth-middleware.
 * Requirements: 9.1, 9.2
 */

import {describe, it} from 'node:test';
import assert from 'node:assert/strict';
import {
  AUTH_ERROR_CODE,
  AUTH_ERROR_MSG,
  WILDCARD_POLICY,
  validateSecurityContext,
  authorizeAction,
} from '../../src/admin/admin-auth-middleware.js';

describe('admin-auth-middleware', () => {
  describe('validateSecurityContext', () => {
    it('returns valid for complete context', () => {
      const result = validateSecurityContext({
        tenantId: 'tenant-1',
        principal: 'user-a',
        roles: ['admin'],
      });
      assert.equal(result.valid, true);
      assert.equal(result.tenantId, 'tenant-1');
      assert.equal(result.principal, 'user-a');
      assert.deepEqual(result.roles, ['admin']);
    });

    it('returns error when tenantId is missing', () => {
      const result = validateSecurityContext({
        principal: 'user-a',
      });
      assert.equal(result.valid, false);
      assert.equal(
        result.error,
        AUTH_ERROR_MSG.TENANT_ID_REQUIRED,
      );
      assert.equal(
        result.code,
        AUTH_ERROR_CODE.UNAUTHENTICATED,
      );
    });

    it('returns error when principal is missing', () => {
      const result = validateSecurityContext({
        tenantId: 'tenant-1',
      });
      assert.equal(result.valid, false);
      assert.equal(
        result.error,
        AUTH_ERROR_MSG.PRINCIPAL_REQUIRED,
      );
      assert.equal(
        result.code,
        AUTH_ERROR_CODE.UNAUTHENTICATED,
      );
    });

    it('returns error when context is null', () => {
      const result = validateSecurityContext(null);
      assert.equal(result.valid, false);
      assert.equal(
        result.error,
        AUTH_ERROR_MSG.CONTEXT_REQUIRED,
      );
      assert.equal(
        result.code,
        AUTH_ERROR_CODE.INVALID_CONTEXT,
      );
    });
  });

  describe('authorizeAction', () => {
    const validContext = {
      tenantId: 'tenant-1',
      principal: 'user-a',
      roles: ['admin'],
    };

    it('returns authorized with wildcard policy', () => {
      const result = authorizeAction(
        validContext,
        'anyAction',
        WILDCARD_POLICY,
      );
      assert.equal(result.authorized, true);
    });

    it('returns authorized when action is in allowedActions', () => {
      const policy = {
        allowedActions: new Set(['readData', 'writeData']),
      };
      const result = authorizeAction(
        validContext,
        'readData',
        policy,
      );
      assert.equal(result.authorized, true);
    });

    it('returns unauthorized for non-matching action', () => {
      const policy = {
        allowedActions: new Set(['readData']),
      };
      const result = authorizeAction(
        validContext,
        'deleteData',
        policy,
      );
      assert.equal(result.authorized, false);
      assert.equal(
        result.error,
        AUTH_ERROR_MSG.ACTION_NOT_PERMITTED,
      );
      assert.equal(
        result.code,
        AUTH_ERROR_CODE.UNAUTHORIZED,
      );
    });

    it('returns unauthenticated for invalid context', () => {
      const result = authorizeAction(
        {tenantId: 'tenant-1'},
        'readData',
        WILDCARD_POLICY,
      );
      assert.equal(result.authorized, false);
      assert.equal(
        result.error,
        AUTH_ERROR_MSG.PRINCIPAL_REQUIRED,
      );
      assert.equal(
        result.code,
        AUTH_ERROR_CODE.UNAUTHENTICATED,
      );
    });
  });

  describe('WILDCARD_POLICY', () => {
    it('is frozen', () => {
      assert.ok(Object.isFrozen(WILDCARD_POLICY));
    });
  });
});
