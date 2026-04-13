/**
 * Enriches audit records with security context information.
 * Reuses createAuditRecord from module-audit-logger — no duplication.
 *
 * Requirements: 9.5
 * @module admin/admin-audit-context
 */
// @ts-nocheck
function stryNS_9fa48() {
  var g = typeof globalThis === 'object' && globalThis && globalThis.Math === Math && globalThis || new Function("return this")();
  var ns = g.__stryker__ || (g.__stryker__ = {});
  if (ns.activeMutant === undefined && g.process && g.process.env && g.process.env.__STRYKER_ACTIVE_MUTANT__) {
    ns.activeMutant = g.process.env.__STRYKER_ACTIVE_MUTANT__;
  }
  function retrieveNS() {
    return ns;
  }
  stryNS_9fa48 = retrieveNS;
  return retrieveNS();
}
stryNS_9fa48();
function stryCov_9fa48() {
  var ns = stryNS_9fa48();
  var cov = ns.mutantCoverage || (ns.mutantCoverage = {
    static: {},
    perTest: {}
  });
  function cover() {
    var c = cov.static;
    if (ns.currentTestId) {
      c = cov.perTest[ns.currentTestId] = cov.perTest[ns.currentTestId] || {};
    }
    var a = arguments;
    for (var i = 0; i < a.length; i++) {
      c[a[i]] = (c[a[i]] || 0) + 1;
    }
  }
  stryCov_9fa48 = cover;
  cover.apply(null, arguments);
}
function stryMutAct_9fa48(id) {
  var ns = stryNS_9fa48();
  function isActive(id) {
    if (ns.activeMutant === id) {
      if (ns.hitCount !== void 0 && ++ns.hitCount > ns.hitLimit) {
        throw new Error('Stryker: Hit count limit reached (' + ns.hitCount + ')');
      }
      return true;
    }
    return false;
  }
  stryMutAct_9fa48 = isActive;
  return isActive(id);
}
import { createAuditRecord } from '../wasm-service/module-audit-logger.js';
const AUDIT_CONTEXT_FIELD = Object.freeze(stryMutAct_9fa48("236") ? {} : (stryCov_9fa48("236"), {
  TENANT_ID: stryMutAct_9fa48("237") ? "" : (stryCov_9fa48("237"), 'tenantId'),
  PRINCIPAL: stryMutAct_9fa48("238") ? "" : (stryCov_9fa48("238"), 'principal'),
  ROLES: stryMutAct_9fa48("239") ? "" : (stryCov_9fa48("239"), 'roles'),
  ACTION: stryMutAct_9fa48("240") ? "" : (stryCov_9fa48("240"), 'action'),
  SECURITY_CONTEXT: stryMutAct_9fa48("241") ? "" : (stryCov_9fa48("241"), 'securityContext')
}));
const AUDIT_CONTEXT_MSG = Object.freeze(stryMutAct_9fa48("242") ? {} : (stryCov_9fa48("242"), {
  COMMAND_AUTHORIZED: stryMutAct_9fa48("243") ? "" : (stryCov_9fa48("243"), 'Command authorized'),
  COMMAND_REJECTED: stryMutAct_9fa48("244") ? "" : (stryCov_9fa48("244"), 'Command authorization rejected'),
  QUOTA_EXCEEDED: stryMutAct_9fa48("245") ? "" : (stryCov_9fa48("245"), 'Quota exceeded')
}));

/**
 * Build security audit details from a security context and action.
 *
 * @param {Object|null} securityContext - {tenantId, principal, roles}.
 * @param {string} action - The action being audited.
 * @return {Object} Frozen details with securityContext and action.
 */
function buildSecurityAuditDetails(securityContext, action) {
  if (stryMutAct_9fa48("246")) {
    {}
  } else {
    stryCov_9fa48("246");
    if (stryMutAct_9fa48("249") ? false : stryMutAct_9fa48("248") ? true : stryMutAct_9fa48("247") ? securityContext : (stryCov_9fa48("247", "248", "249"), !securityContext)) {
      if (stryMutAct_9fa48("250")) {
        {}
      } else {
        stryCov_9fa48("250");
        return Object.freeze(stryMutAct_9fa48("251") ? {} : (stryCov_9fa48("251"), {
          [AUDIT_CONTEXT_FIELD.SECURITY_CONTEXT]: null,
          [AUDIT_CONTEXT_FIELD.ACTION]: action
        }));
      }
    }
    return Object.freeze(stryMutAct_9fa48("252") ? {} : (stryCov_9fa48("252"), {
      [AUDIT_CONTEXT_FIELD.SECURITY_CONTEXT]: Object.freeze(stryMutAct_9fa48("253") ? {} : (stryCov_9fa48("253"), {
        [AUDIT_CONTEXT_FIELD.TENANT_ID]: securityContext.tenantId,
        [AUDIT_CONTEXT_FIELD.PRINCIPAL]: securityContext.principal,
        [AUDIT_CONTEXT_FIELD.ROLES]: securityContext.roles
      })),
      [AUDIT_CONTEXT_FIELD.ACTION]: action
    }));
  }
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
function createSecurityAuditRecord(message, decision, securityContext, action, extraDetails = {}) {
  if (stryMutAct_9fa48("254")) {
    {}
  } else {
    stryCov_9fa48("254");
    const securityDetails = buildSecurityAuditDetails(securityContext, action);
    const combinedDetails = stryMutAct_9fa48("255") ? {} : (stryCov_9fa48("255"), {
      ...securityDetails,
      ...extraDetails
    });
    return createAuditRecord(message, decision, combinedDetails);
  }
}
export { AUDIT_CONTEXT_FIELD, AUDIT_CONTEXT_MSG, buildSecurityAuditDetails, createSecurityAuditRecord };