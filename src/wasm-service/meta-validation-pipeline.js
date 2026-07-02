/**
 * Validation pipeline for sys-wasm-meta publish commands.
 * Composes existing validators without duplicating logic.
 * Each validator is called by reference, not reimplemented.
 *
 * Requirements: 6.1, 6.2, 12.4
 */

import {
  validateModuleManifest,
} from './module-manifest-models.js';
import {
  enforceCapabilityPolicy,
} from './capability-policy.js';
import {
  MODULE_MANIFEST_FIELD as MF,
  MODULE_DEPENDENCY_FIELD as DF,
} from './module-manifest-constants.js';
import {
  DEBUG_CAPABILITY,
} from '../debug-runtime/debug-runtime-constants.js';

/**
 * Validation step name constants.
 * @enum {string}
 */
const VALIDATION_STEP = Object.freeze({
  MANIFEST: 'manifest',
  CAPABILITIES: 'capabilities',
  DEBUG_ARTIFACTS: 'debugArtifacts',
  DEPENDENCIES: 'dependencies',
});

/**
 * Error message constants for pipeline validation failures.
 * @enum {string}
 */
const VALIDATION_PIPELINE_ERROR_MSG = Object.freeze({
  MANIFEST_INVALID: 'Manifest validation failed',
  CAPABILITIES_DENIED: 'Capability enforcement failed',
  DEBUG_ARTIFACT_REQUIRED:
    'Debug artifact metadata required for debug capabilities',
  DEPENDENCIES_INVALID: 'Dependency validation failed',
});

/**
 * Validate capabilities against a capability policy.
 * Thin wrapper that delegates to enforceCapabilityPolicy.
 * Returns valid if no capabilities declared or no policy.
 *
 * @param {Object} manifest - Module manifest object.
 * @param {Object|null} capabilityPolicy - Policy object with
 *   allowedCapabilities, or null to skip enforcement.
 * @param {string[]} tenantAllowlist - Allowed capabilities
 *   for the tenant/service.
 * @return {{valid: boolean, errors: string[]}} Result.
 */
function validateCapabilities(
  manifest, capabilityPolicy, tenantAllowlist,
) {
  const caps = manifest ? manifest[MF.CAPABILITIES] : null;
  if (!caps || !Array.isArray(caps) ||
      caps.length === 0) {
    return {valid: true, errors: []};
  }

  if (!capabilityPolicy) {
    return {valid: true, errors: []};
  }

  const policy = {
    allowedCapabilities: tenantAllowlist || [],
  };
  const result = enforceCapabilityPolicy(manifest, policy);
  if (!result.valid) {
    return {
      valid: false,
      errors: [VALIDATION_PIPELINE_ERROR_MSG.CAPABILITIES_DENIED],
    };
  }
  return {valid: true, errors: []};
}

/**
 * Validate resolved dependencies have required fields.
 * Each dependency must have moduleId and digest.
 *
 * @param {Array<Object>|null} resolvedDependencies - Array of
 *   resolved dependency objects.
 * @return {{valid: boolean, errors: string[]}} Result.
 */
function validateResolvedDependencies(resolvedDependencies) {
  if (!resolvedDependencies ||
      !Array.isArray(resolvedDependencies) ||
      resolvedDependencies.length === 0) {
    return {valid: true, errors: []};
  }

  const errors = [];
  for (const dep of resolvedDependencies) {
    if (!dep[DF.MODULE_ID] || !dep[DF.DIGEST]) {
      errors.push(
        VALIDATION_PIPELINE_ERROR_MSG.DEPENDENCIES_INVALID,
      );
      break;
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Validate debug artifact availability policy for debug capabilities.
 *
 * By default, debug capabilities require either:
 * - `manifest.debugArtifact`, or
 * - legacy `manifest.artifactPointer` declaration.
 *
 * Policy hook:
 * - `capabilityPolicy.requireDebugArtifacts === false` downgrades
 *   enforcement for transitional rollouts.
 *
 * @param {Object} manifest - Module manifest object.
 * @param {Object|null} capabilityPolicy - Capability policy options.
 * @return {{valid: boolean, errors: string[]}} Result.
 */
function validateDebugArtifactPolicy(manifest, capabilityPolicy) {
  const caps = manifest ? manifest[MF.CAPABILITIES] : null;
  if (!caps || !Array.isArray(caps) ||
      caps.length === 0) {
    return {valid: true, errors: []};
  }

  const debugRequested = caps.includes(
    DEBUG_CAPABILITY.BREAKPOINT,
  ) || caps.includes(DEBUG_CAPABILITY.SNAPSHOT);
  if (!debugRequested) {
    return {valid: true, errors: []};
  }

  const requireDebugArtifacts =
    capabilityPolicy?.requireDebugArtifacts !== false;
  if (!requireDebugArtifacts) {
    return {valid: true, errors: []};
  }

  const hasDebugArtifact = Boolean(manifest[MF.DEBUG_ARTIFACT]) ||
    Boolean(manifest[MF.ARTIFACT_POINTER]);
  if (!hasDebugArtifact) {
    return {
      valid: false,
      errors: [VALIDATION_PIPELINE_ERROR_MSG.DEBUG_ARTIFACT_REQUIRED],
    };
  }

  return {valid: true, errors: []};
}

/**
 * Build a declarative validation chain for publish commands.
 * Returns an array of step descriptors the caller iterates
 * and stops on first failure.
 *
 * @return {Array<{name: string, validate: Function}>} Steps.
 */
function buildPublishValidationChain() {
  return [
    {
      name: VALIDATION_STEP.MANIFEST,
      validate: (params) => {
        const result = validateModuleManifest(params.manifest);
        if (!result.valid) {
          return {
            valid: false,
            errors: [
              VALIDATION_PIPELINE_ERROR_MSG.MANIFEST_INVALID,
              ...result.errors,
            ],
          };
        }
        return {valid: true, errors: []};
      },
    },
    {
      name: VALIDATION_STEP.CAPABILITIES,
      validate: (params) => validateCapabilities(
        params.manifest,
        params.capabilityPolicy || null,
        params.tenantAllowlist || [],
      ),
    },
    {
      name: VALIDATION_STEP.DEBUG_ARTIFACTS,
      validate: (params) => validateDebugArtifactPolicy(
        params.manifest,
        params.capabilityPolicy || null,
      ),
    },
    {
      name: VALIDATION_STEP.DEPENDENCIES,
      validate: (params) => validateResolvedDependencies(
        params.resolvedDependencies || null,
      ),
    },
  ];
}

/**
 * Run the full publish validation pipeline.
 * Executes each step in order and stops on first failure.
 *
 * @param {Object} params - Pipeline parameters.
 * @param {Object} params.manifest - Module manifest object.
 * @param {Object} [params.capabilityPolicy] - CapabilityPolicy
 *   instance or null.
 * @param {string[]} [params.tenantAllowlist] - Tenant allowed
 *   capabilities.
 * @param {Array<Object>} [params.resolvedDependencies] -
 *   Pre-resolved dependency objects.
 * @return {{valid: boolean, errors: string[]}} Result.
 */
function validatePublishPipeline(params) {
  const chain = buildPublishValidationChain();
  for (const step of chain) {
    const result = step.validate(params);
    if (!result.valid) {
      return {valid: false, errors: result.errors};
    }
  }
  return {valid: true, errors: []};
}

export {
  VALIDATION_STEP,
  VALIDATION_PIPELINE_ERROR_MSG,
  validateCapabilities,
  validateDebugArtifactPolicy,
  validateResolvedDependencies,
  buildPublishValidationChain,
  validatePublishPipeline,
};
