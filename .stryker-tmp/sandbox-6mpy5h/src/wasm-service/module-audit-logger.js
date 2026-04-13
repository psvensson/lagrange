/**
 * Module Audit Logger — structured audit logging for WASM
 * module and capability resolution decisions.
 *
 * Produces structured audit records for:
 * - Manifest runtime validation (pass/fail)
 * - run_export verification
 * - Dependency resolution (resolved/rejected per dep)
 * - Capability policy enforcement (allowed/denied per cap)
 * - Module activation outcomes
 *
 * Requirements: 8.5
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
import { MODULE_AUDIT_MSG as MSG, RESOLUTION_DECISION as DECISION } from './module-manifest-constants.js';

/**
 * Create a structured audit record.
 *
 * @param {string} message - Audit message constant.
 * @param {string} decision - Resolution decision outcome.
 * @param {Object} details - Additional context fields.
 * @return {Object} Frozen audit record.
 */
function createAuditRecord(message, decision, details) {
  if (stryMutAct_9fa48("161556")) {
    {}
  } else {
    stryCov_9fa48("161556");
    return Object.freeze(stryMutAct_9fa48("161557") ? {} : (stryCov_9fa48("161557"), {
      timestamp: Date.now(),
      message,
      decision,
      ...details
    }));
  }
}

/**
 * Log a manifest runtime validation result.
 *
 * @param {string} moduleId - Module identifier.
 * @param {boolean} valid - Whether validation passed.
 * @param {string[]} errors - Validation error messages.
 * @param {Function|null} logger - Optional logger function.
 * @return {Object} Audit record.
 */
function auditManifestValidation(moduleId, valid, errors, logger) {
  if (stryMutAct_9fa48("161558")) {
    {}
  } else {
    stryCov_9fa48("161558");
    const message = valid ? MSG.MANIFEST_VALIDATION_PASSED : MSG.MANIFEST_VALIDATION_FAILED;
    const decision = valid ? DECISION.ALLOWED : DECISION.REJECTED;
    const record = createAuditRecord(message, decision, stryMutAct_9fa48("161559") ? {} : (stryCov_9fa48("161559"), {
      moduleId,
      valid,
      errors
    }));
    if (stryMutAct_9fa48("161562") ? typeof logger !== 'function' : stryMutAct_9fa48("161561") ? false : stryMutAct_9fa48("161560") ? true : (stryCov_9fa48("161560", "161561", "161562"), typeof logger === (stryMutAct_9fa48("161563") ? "" : (stryCov_9fa48("161563"), 'function')))) {
      if (stryMutAct_9fa48("161564")) {
        {}
      } else {
        stryCov_9fa48("161564");
        logger(record);
      }
    }
    return record;
  }
}

/**
 * Log a run_export verification result.
 *
 * @param {string} moduleId - Module identifier.
 * @param {string} runExport - The run_export name.
 * @param {boolean} found - Whether the export was found.
 * @param {Function|null} logger - Optional logger function.
 * @return {Object} Audit record.
 */
function auditRunExportVerification(moduleId, runExport, found, logger) {
  if (stryMutAct_9fa48("161565")) {
    {}
  } else {
    stryCov_9fa48("161565");
    const decision = found ? DECISION.RESOLVED : DECISION.REJECTED;
    const record = createAuditRecord(MSG.RUN_EXPORT_VERIFIED, decision, stryMutAct_9fa48("161566") ? {} : (stryCov_9fa48("161566"), {
      moduleId,
      runExport,
      found
    }));
    if (stryMutAct_9fa48("161569") ? typeof logger !== 'function' : stryMutAct_9fa48("161568") ? false : stryMutAct_9fa48("161567") ? true : (stryCov_9fa48("161567", "161568", "161569"), typeof logger === (stryMutAct_9fa48("161570") ? "" : (stryCov_9fa48("161570"), 'function')))) {
      if (stryMutAct_9fa48("161571")) {
        {}
      } else {
        stryCov_9fa48("161571");
        logger(record);
      }
    }
    return record;
  }
}

/**
 * Log a dependency resolution result for a single dependency.
 *
 * @param {string} moduleId - Parent module identifier.
 * @param {string} depModuleId - Dependency module identifier.
 * @param {boolean} resolved - Whether resolution succeeded.
 * @param {string[]} errors - Resolution error messages.
 * @param {Function|null} logger - Optional logger function.
 * @return {Object} Audit record.
 */
function auditDependencyResolution(moduleId, depModuleId, resolved, errors, logger) {
  if (stryMutAct_9fa48("161572")) {
    {}
  } else {
    stryCov_9fa48("161572");
    const message = resolved ? MSG.DEPENDENCY_RESOLVED : MSG.DEPENDENCY_REJECTED;
    const decision = resolved ? DECISION.RESOLVED : DECISION.REJECTED;
    const record = createAuditRecord(message, decision, stryMutAct_9fa48("161573") ? {} : (stryCov_9fa48("161573"), {
      moduleId,
      depModuleId,
      resolved,
      errors
    }));
    if (stryMutAct_9fa48("161576") ? typeof logger !== 'function' : stryMutAct_9fa48("161575") ? false : stryMutAct_9fa48("161574") ? true : (stryCov_9fa48("161574", "161575", "161576"), typeof logger === (stryMutAct_9fa48("161577") ? "" : (stryCov_9fa48("161577"), 'function')))) {
      if (stryMutAct_9fa48("161578")) {
        {}
      } else {
        stryCov_9fa48("161578");
        logger(record);
      }
    }
    return record;
  }
}

/**
 * Log a capability policy enforcement result for a single
 * capability.
 *
 * @param {string} moduleId - Module identifier.
 * @param {string} capability - Capability name.
 * @param {boolean} allowed - Whether capability was allowed.
 * @param {Function|null} logger - Optional logger function.
 * @return {Object} Audit record.
 */
function auditCapabilityDecision(moduleId, capability, allowed, logger) {
  if (stryMutAct_9fa48("161579")) {
    {}
  } else {
    stryCov_9fa48("161579");
    const message = allowed ? MSG.CAPABILITY_ALLOWED : MSG.CAPABILITY_DENIED;
    const decision = allowed ? DECISION.ALLOWED : DECISION.DENIED;
    const record = createAuditRecord(message, decision, stryMutAct_9fa48("161580") ? {} : (stryCov_9fa48("161580"), {
      moduleId,
      capability,
      allowed
    }));
    if (stryMutAct_9fa48("161583") ? typeof logger !== 'function' : stryMutAct_9fa48("161582") ? false : stryMutAct_9fa48("161581") ? true : (stryCov_9fa48("161581", "161582", "161583"), typeof logger === (stryMutAct_9fa48("161584") ? "" : (stryCov_9fa48("161584"), 'function')))) {
      if (stryMutAct_9fa48("161585")) {
        {}
      } else {
        stryCov_9fa48("161585");
        logger(record);
      }
    }
    return record;
  }
}

/**
 * Log a full module activation outcome.
 *
 * @param {string} moduleId - Module identifier.
 * @param {boolean} activated - Whether activation succeeded.
 * @param {string[]} errors - Activation error messages.
 * @param {Function|null} logger - Optional logger function.
 * @return {Object} Audit record.
 */
function auditModuleActivation(moduleId, activated, errors, logger) {
  if (stryMutAct_9fa48("161586")) {
    {}
  } else {
    stryCov_9fa48("161586");
    const message = activated ? MSG.MODULE_ACTIVATED : MSG.MODULE_ACTIVATION_REJECTED;
    const decision = activated ? DECISION.ALLOWED : DECISION.REJECTED;
    const record = createAuditRecord(message, decision, stryMutAct_9fa48("161587") ? {} : (stryCov_9fa48("161587"), {
      moduleId,
      activated,
      errors
    }));
    if (stryMutAct_9fa48("161590") ? typeof logger !== 'function' : stryMutAct_9fa48("161589") ? false : stryMutAct_9fa48("161588") ? true : (stryCov_9fa48("161588", "161589", "161590"), typeof logger === (stryMutAct_9fa48("161591") ? "" : (stryCov_9fa48("161591"), 'function')))) {
      if (stryMutAct_9fa48("161592")) {
        {}
      } else {
        stryCov_9fa48("161592");
        logger(record);
      }
    }
    return record;
  }
}
export { createAuditRecord, auditManifestValidation, auditRunExportVerification, auditDependencyResolution, auditCapabilityDecision, auditModuleActivation };