/**
 * Dependency resolution for WASM module manifests.
 *
 * Resolves all dependencies declared in a module manifest to
 * immutable digests before activation. Rejects undeclared
 * imports and digest mismatches.
 *
 * Requirements: 5.1, 5.3
 */

import {NUM} from '../constants/index.js';
import {isValidDigest} from './module-manifest-models.js';
import {
  MODULE_DEPENDENCY_FIELD as DF,
  MODULE_MANIFEST_FIELD as MF,
  MODULE_MANIFEST_ERROR_MSG as ERR,
  MODULE_AUDIT_MSG as AUDIT,
  RESOLUTION_DECISION,
} from './module-manifest-constants.js';

/**
 * Resolve all dependencies declared in a module manifest
 * to immutable digests.
 *
 * For each dependency in manifest.dependencies:
 * - Look up the dependency module in availableModules
 * - Verify the resolved module's digest matches the pinned
 *   digest in the dependency declaration
 * - Reject undeclared imports (Req 5.3)
 *
 * @param {Object} manifest - Module manifest with dependencies.
 * @param {Map<string, Object>} availableModules - Map of
 *   moduleId to module objects with at least a `digest` field.
 * @param {Object} [_registryContext] - Reserved for future
 *   registry-aware resolution.
 * @return {{resolved: boolean,
 *   resolvedDependencies?: Array<Object>,
 *   auditLog?: Array<Object>,
 *   errors?: string[]}}
 */
function resolveDependencies(
  manifest, availableModules, _registryContext,
) {
  const deps = manifest[MF.DEPENDENCIES];
  const auditLog = [];

  if (!deps || !Array.isArray(deps) ||
      deps.length === NUM.ZERO) {
    return {resolved: true, resolvedDependencies: [], auditLog};
  }

  const errors = [];
  const resolvedDependencies = [];

  for (const dep of deps) {
    const moduleId = dep[DF.MODULE_ID];
    const pinnedDigest = dep[DF.DIGEST];

    // Validate pinned digest format
    if (!pinnedDigest || !isValidDigest(pinnedDigest)) {
      errors.push(
        `${ERR.DEPENDENCY_DIGEST_MISMATCH}: ${moduleId}`,
      );
      auditLog.push({
        moduleId,
        decision: RESOLUTION_DECISION.REJECTED,
        reason: AUDIT.DEPENDENCY_REJECTED,
      });
      continue;
    }

    // Look up module in available sources
    const resolved = availableModules instanceof Map ?
      availableModules.get(moduleId) :
      null;

    if (!resolved) {
      errors.push(
        `${ERR.DEPENDENCY_NOT_FOUND}: ${moduleId}`,
      );
      auditLog.push({
        moduleId,
        decision: RESOLUTION_DECISION.REJECTED,
        reason: AUDIT.DEPENDENCY_REJECTED,
      });
      continue;
    }

    // Verify digest match
    const resolvedDigest = resolved[DF.DIGEST] ??
      resolved.digest;
    if (resolvedDigest !== pinnedDigest) {
      errors.push(
        `${ERR.DEPENDENCY_DIGEST_MISMATCH}: ${moduleId}`,
      );
      auditLog.push({
        moduleId,
        pinnedDigest,
        resolvedDigest,
        decision: RESOLUTION_DECISION.REJECTED,
        reason: AUDIT.DEPENDENCY_REJECTED,
      });
      continue;
    }

    resolvedDependencies.push({
      moduleId,
      digest: pinnedDigest,
    });
    auditLog.push({
      moduleId,
      digest: pinnedDigest,
      decision: RESOLUTION_DECISION.RESOLVED,
      reason: AUDIT.DEPENDENCY_RESOLVED,
    });
  }

  if (errors.length > NUM.ZERO) {
    return {resolved: false, errors, auditLog};
  }

  return {resolved: true, resolvedDependencies, auditLog};
}

/**
 * Validate that all dependency digests match available modules.
 *
 * @param {Array<Object>} dependencies - Array of dependency
 *   objects with moduleId and digest fields.
 * @param {Map<string, Object>} availableModules - Map of
 *   moduleId to module objects with at least a `digest` field.
 * @return {{valid: boolean, errors?: string[]}}
 */
function validateDependencyDigests(
  dependencies, availableModules,
) {
  if (!dependencies || !Array.isArray(dependencies) ||
      dependencies.length === NUM.ZERO) {
    return {valid: true};
  }

  const errors = [];

  for (const dep of dependencies) {
    const moduleId = dep[DF.MODULE_ID];
    const pinnedDigest = dep[DF.DIGEST];

    if (!pinnedDigest || !isValidDigest(pinnedDigest)) {
      errors.push(
        `${ERR.DEPENDENCY_DIGEST_MISMATCH}: ${moduleId}`,
      );
      continue;
    }

    const resolved = availableModules instanceof Map ?
      availableModules.get(moduleId) :
      null;

    if (!resolved) {
      errors.push(
        `${ERR.DEPENDENCY_NOT_FOUND}: ${moduleId}`,
      );
      continue;
    }

    const resolvedDigest = resolved[DF.DIGEST] ??
      resolved.digest;
    if (resolvedDigest !== pinnedDigest) {
      errors.push(
        `${ERR.DEPENDENCY_DIGEST_MISMATCH}: ${moduleId}`,
      );
    }
  }

  if (errors.length > NUM.ZERO) {
    return {valid: false, errors};
  }

  return {valid: true};
}

/**
 * Detect undeclared imports by comparing a module's actual
 * imports against its declared dependencies.
 *
 * @param {string[]} actualImports - Module IDs the module
 *   actually imports at runtime.
 * @param {Array<Object>} declaredDependencies - Dependencies
 *   declared in the manifest.
 * @return {{valid: boolean, errors?: string[]}}
 */
function detectUndeclaredImports(
  actualImports, declaredDependencies,
) {
  if (!actualImports || !Array.isArray(actualImports) ||
      actualImports.length === NUM.ZERO) {
    return {valid: true};
  }

  const declaredIds = new Set(
    (declaredDependencies || []).map((d) => d[DF.MODULE_ID]),
  );

  const errors = [];
  for (const imp of actualImports) {
    if (!declaredIds.has(imp)) {
      errors.push(`${ERR.UNDECLARED_IMPORT}: ${imp}`);
    }
  }

  if (errors.length > NUM.ZERO) {
    return {valid: false, errors};
  }

  return {valid: true};
}

export {
  resolveDependencies,
  validateDependencyDigests,
  detectUndeclaredImports,
};
