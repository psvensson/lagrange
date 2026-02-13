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

import {
  MODULE_AUDIT_MSG as MSG,
  RESOLUTION_DECISION as DECISION,
} from './module-manifest-constants.js';

/**
 * Create a structured audit record.
 *
 * @param {string} message - Audit message constant.
 * @param {string} decision - Resolution decision outcome.
 * @param {Object} details - Additional context fields.
 * @return {Object} Frozen audit record.
 */
function createAuditRecord(message, decision, details) {
  return Object.freeze({
    timestamp: Date.now(),
    message,
    decision,
    ...details,
  });
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
  const message = valid ?
    MSG.MANIFEST_VALIDATION_PASSED :
    MSG.MANIFEST_VALIDATION_FAILED;
  const decision = valid ? DECISION.ALLOWED : DECISION.REJECTED;

  const record = createAuditRecord(message, decision, {
    moduleId,
    valid,
    errors,
  });

  if (typeof logger === 'function') {
    logger(record);
  }

  return record;
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
function auditRunExportVerification(
  moduleId, runExport, found, logger
) {
  const decision = found ? DECISION.RESOLVED : DECISION.REJECTED;

  const record = createAuditRecord(
    MSG.RUN_EXPORT_VERIFIED, decision, {
      moduleId,
      runExport,
      found,
    }
  );

  if (typeof logger === 'function') {
    logger(record);
  }

  return record;
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
function auditDependencyResolution(
  moduleId, depModuleId, resolved, errors, logger
) {
  const message = resolved ?
    MSG.DEPENDENCY_RESOLVED :
    MSG.DEPENDENCY_REJECTED;
  const decision = resolved ?
    DECISION.RESOLVED :
    DECISION.REJECTED;

  const record = createAuditRecord(message, decision, {
    moduleId,
    depModuleId,
    resolved,
    errors,
  });

  if (typeof logger === 'function') {
    logger(record);
  }

  return record;
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
function auditCapabilityDecision(
  moduleId, capability, allowed, logger
) {
  const message = allowed ?
    MSG.CAPABILITY_ALLOWED :
    MSG.CAPABILITY_DENIED;
  const decision = allowed ?
    DECISION.ALLOWED :
    DECISION.DENIED;

  const record = createAuditRecord(message, decision, {
    moduleId,
    capability,
    allowed,
  });

  if (typeof logger === 'function') {
    logger(record);
  }

  return record;
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
function auditModuleActivation(
  moduleId, activated, errors, logger
) {
  const message = activated ?
    MSG.MODULE_ACTIVATED :
    MSG.MODULE_ACTIVATION_REJECTED;
  const decision = activated ?
    DECISION.ALLOWED :
    DECISION.REJECTED;

  const record = createAuditRecord(message, decision, {
    moduleId,
    activated,
    errors,
  });

  if (typeof logger === 'function') {
    logger(record);
  }

  return record;
}

export {
  createAuditRecord,
  auditManifestValidation,
  auditRunExportVerification,
  auditDependencyResolution,
  auditCapabilityDecision,
  auditModuleActivation,
};
