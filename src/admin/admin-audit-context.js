/**
 * Enriches audit records with security context information.
 * Reuses createAuditRecord from module-audit-logger — no duplication.
 *
 * Requirements: 9.5
 * @module admin/admin-audit-context
 */

import {createAuditRecord} from
  '../wasm-service/module-audit-logger.js';

const AUDIT_CONTEXT_FIELD = Object.freeze({
  TENANT_ID: 'tenantId',
  PRINCIPAL: 'principal',
  ROLES: 'roles',
  ACTION: 'action',
  SECURITY_CONTEXT: 'securityContext',
});

const AUDIT_CONTEXT_MSG = Object.freeze({
  COMMAND_AUTHORIZED: 'Command authorized',
  COMMAND_REJECTED: 'Command authorization rejected',
  QUOTA_EXCEEDED: 'Quota exceeded',
});

/**
 * Build security audit details from a security context and action.
 *
 * @param {Object|null} securityContext - {tenantId, principal, roles}.
 * @param {string} action - The action being audited.
 * @return {Object} Frozen details with securityContext and action.
 */
function buildSecurityAuditDetails(securityContext, action) {
  if (!securityContext) {
    return Object.freeze({
      [AUDIT_CONTEXT_FIELD.SECURITY_CONTEXT]: null,
      [AUDIT_CONTEXT_FIELD.ACTION]: action,
    });
  }
  return Object.freeze({
    [AUDIT_CONTEXT_FIELD.SECURITY_CONTEXT]: Object.freeze({
      [AUDIT_CONTEXT_FIELD.TENANT_ID]:
        securityContext.tenantId,
      [AUDIT_CONTEXT_FIELD.PRINCIPAL]:
        securityContext.principal,
      [AUDIT_CONTEXT_FIELD.ROLES]:
        securityContext.roles,
    }),
    [AUDIT_CONTEXT_FIELD.ACTION]: action,
  });
}

/**
 * Create an audit record enriched with security context.
 *
 * @param {string} message - Audit message constant.
 * @param {string} decision - Resolution decision outcome.
 * @param {Object|null} securityContext - {tenantId, principal, roles}.
 * @param {string} action - The action being audited.
 * @param {Object} [extraDetails={}] - Additional context fields.
 * @return {Object} Frozen audit record with security context.
 */
function createSecurityAuditRecord(
  message, decision, securityContext, action, extraDetails = {},
) {
  const securityDetails =
    buildSecurityAuditDetails(securityContext, action);
  const combinedDetails = {
    ...securityDetails,
    ...extraDetails,
  };
  return createAuditRecord(message, decision, combinedDetails);
}

export {
  AUDIT_CONTEXT_FIELD,
  AUDIT_CONTEXT_MSG,
  buildSecurityAuditDetails,
  createSecurityAuditRecord,
};
