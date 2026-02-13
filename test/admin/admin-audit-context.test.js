/**
 * Tests for admin-audit-context.
 * Requirements: 9.5
 */

import {describe, it} from 'node:test';
import assert from 'node:assert/strict';
import {
  AUDIT_CONTEXT_FIELD,
  AUDIT_CONTEXT_MSG,
  buildSecurityAuditDetails,
  createSecurityAuditRecord,
} from '../../src/admin/admin-audit-context.js';

const TEST_TENANT = 'tenant-1';
const TEST_PRINCIPAL = 'user-a';
const TEST_ROLES = ['admin'];
const TEST_ACTION = 'module.publish';
const TEST_DECISION = 'allowed';
const TEST_MESSAGE = AUDIT_CONTEXT_MSG.COMMAND_AUTHORIZED;

const TEST_CONTEXT = Object.freeze({
  tenantId: TEST_TENANT,
  principal: TEST_PRINCIPAL,
  roles: TEST_ROLES,
});

describe('admin-audit-context', () => {
  describe('buildSecurityAuditDetails', () => {
    it('returns frozen details with valid context', () => {
      const details = buildSecurityAuditDetails(
        TEST_CONTEXT, TEST_ACTION,
      );
      assert.ok(Object.isFrozen(details));
      assert.deepEqual(details.securityContext, {
        tenantId: TEST_TENANT,
        principal: TEST_PRINCIPAL,
        roles: TEST_ROLES,
      });
      assert.equal(details.action, TEST_ACTION);
    });

    it('returns null securityContext when context is null', () => {
      const details = buildSecurityAuditDetails(
        null, TEST_ACTION,
      );
      assert.ok(Object.isFrozen(details));
      assert.equal(details.securityContext, null);
      assert.equal(details.action, TEST_ACTION);
    });

    it('returns null securityContext when context is undefined', () => {
      const details = buildSecurityAuditDetails(
        undefined, TEST_ACTION,
      );
      assert.ok(Object.isFrozen(details));
      assert.equal(details.securityContext, null);
      assert.equal(details.action, TEST_ACTION);
    });
  });

  describe('createSecurityAuditRecord', () => {
    it('includes security context in record', () => {
      const record = createSecurityAuditRecord(
        TEST_MESSAGE, TEST_DECISION, TEST_CONTEXT, TEST_ACTION,
      );
      assert.deepEqual(record.securityContext, {
        tenantId: TEST_TENANT,
        principal: TEST_PRINCIPAL,
        roles: TEST_ROLES,
      });
    });

    it('includes action in record', () => {
      const record = createSecurityAuditRecord(
        TEST_MESSAGE, TEST_DECISION, TEST_CONTEXT, TEST_ACTION,
      );
      assert.equal(record.action, TEST_ACTION);
    });

    it('merges extra details', () => {
      const extra = {reason: 'policy match'};
      const record = createSecurityAuditRecord(
        TEST_MESSAGE, TEST_DECISION,
        TEST_CONTEXT, TEST_ACTION, extra,
      );
      assert.equal(record.reason, 'policy match');
      assert.equal(record.action, TEST_ACTION);
      assert.ok(record.securityContext);
    });

    it('returns frozen record', () => {
      const record = createSecurityAuditRecord(
        TEST_MESSAGE, TEST_DECISION, TEST_CONTEXT, TEST_ACTION,
      );
      assert.ok(Object.isFrozen(record));
    });

    it('includes timestamp and message from base record', () => {
      const record = createSecurityAuditRecord(
        TEST_MESSAGE, TEST_DECISION, TEST_CONTEXT, TEST_ACTION,
      );
      assert.equal(record.message, TEST_MESSAGE);
      assert.equal(record.decision, TEST_DECISION);
      assert.equal(typeof record.timestamp, 'number');
    });
  });

  describe('AUDIT_CONTEXT_MSG constants', () => {
    it('is frozen', () => {
      assert.ok(Object.isFrozen(AUDIT_CONTEXT_MSG));
    });

    it('has expected values', () => {
      assert.equal(
        AUDIT_CONTEXT_MSG.COMMAND_AUTHORIZED,
        'Command authorized',
      );
      assert.equal(
        AUDIT_CONTEXT_MSG.COMMAND_REJECTED,
        'Command authorization rejected',
      );
      assert.equal(
        AUDIT_CONTEXT_MSG.QUOTA_EXCEEDED,
        'Quota exceeded',
      );
    });
  });

  describe('AUDIT_CONTEXT_FIELD constants', () => {
    it('is frozen', () => {
      assert.ok(Object.isFrozen(AUDIT_CONTEXT_FIELD));
    });

    it('has expected field names', () => {
      assert.equal(AUDIT_CONTEXT_FIELD.TENANT_ID, 'tenantId');
      assert.equal(AUDIT_CONTEXT_FIELD.PRINCIPAL, 'principal');
      assert.equal(AUDIT_CONTEXT_FIELD.ROLES, 'roles');
      assert.equal(AUDIT_CONTEXT_FIELD.ACTION, 'action');
      assert.equal(
        AUDIT_CONTEXT_FIELD.SECURITY_CONTEXT,
        'securityContext',
      );
    });
  });
});
