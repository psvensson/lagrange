/**
 * Capability Policy Enforcement — enforces tenant/service
 * capability allowlists during WASM module load.
 *
 * Responsibilities:
 * 1. Enforce tenant/service capability allowlists.
 * 2. Inject only declared capability modules into runtime.
 * 3. Reject capabilities not in the policy allowlist.
 * 4. Reject capability modules not declared in manifest.
 *
 * Requirements: 8.2, 8.3
 */

import {
  MODULE_MANIFEST_FIELD as MF,
  MODULE_MANIFEST_ERROR_MSG as ERR,
} from './module-manifest-constants.js';

/**
 * Check whether a single capability is allowed by the
 * tenant/service policy.
 *
 * @param {string} capability - Capability name (e.g. "sql.read").
 * @param {string[]} allowlist - Allowed capabilities for the
 *   tenant/service.
 * @return {boolean} True if capability is in the allowlist.
 */
function isCapabilityAllowed(capability, allowlist) {
  if (!Array.isArray(allowlist)) return false;
  return allowlist.includes(capability);
}

/**
 * Enforce capability policy for all capabilities declared in
 * a module manifest against a tenant/service allowlist.
 *
 * @param {Object} manifest - Module manifest object.
 * @param {Object} policy - Capability policy object.
 * @param {string[]} policy.allowedCapabilities - Allowed
 *   capability names for the tenant/service.
 * @return {{valid: boolean, errors: string[],
 *   allowed: string[], denied: string[]}} Result.
 */
function enforceCapabilityPolicy(manifest, policy) {
  const errors = [];
  const allowed = [];
  const denied = [];

  if (!manifest) {
    errors.push(ERR.MANIFEST_REQUIRED);
    return {valid: false, errors, allowed, denied};
  }

  if (!policy) {
    errors.push(ERR.POLICY_REQUIRED);
    return {valid: false, errors, allowed, denied};
  }

  const caps = manifest[MF.CAPABILITIES] || [];
  const allowlist = policy.allowedCapabilities || [];

  for (const cap of caps) {
    if (isCapabilityAllowed(cap, allowlist)) {
      allowed.push(cap);
    } else {
      denied.push(cap);
      errors.push(ERR.CAPABILITY_NOT_ALLOWED);
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    allowed,
    denied,
  };
}

/**
 * Filter the set of capability modules to inject into the
 * WASM runtime imports. Only capabilities declared in the
 * manifest AND allowed by policy are injected.
 *
 * @param {Object} manifest - Module manifest object.
 * @param {Object} policy - Capability policy object.
 * @param {Object} availableModules - Map of capability name
 *   to module implementation.
 * @return {{imports: Object, errors: string[]}} Filtered
 *   imports map and any errors.
 */
function buildCapabilityImports(manifest, policy, availableModules) {
  const errors = [];
  const imports = {};

  if (!manifest) {
    errors.push(ERR.MANIFEST_REQUIRED);
    return {imports, errors};
  }

  if (!policy) {
    errors.push(ERR.POLICY_REQUIRED);
    return {imports, errors};
  }

  const caps = manifest[MF.CAPABILITIES] || [];
  const allowlist = policy.allowedCapabilities || [];
  const modules = availableModules || {};

  for (const cap of caps) {
    if (!isCapabilityAllowed(cap, allowlist)) {
      errors.push(ERR.CAPABILITY_NOT_ALLOWED);
      continue;
    }
    if (modules[cap] !== undefined) {
      imports[cap] = modules[cap];
    }
  }

  return {imports, errors};
}

/**
 * Check that requested capability modules are declared in
 * the manifest. Rejects undeclared capability requests.
 *
 * @param {string[]} requestedCapabilities - Capabilities
 *   requested at runtime.
 * @param {Object} manifest - Module manifest object.
 * @return {{valid: boolean, errors: string[],
 *   undeclared: string[]}} Result.
 */
function checkUndeclaredCapabilities(
  requestedCapabilities, manifest,
) {
  const errors = [];
  const undeclared = [];

  if (!manifest) {
    errors.push(ERR.MANIFEST_REQUIRED);
    return {valid: false, errors, undeclared};
  }

  const declaredCaps = new Set(manifest[MF.CAPABILITIES] || []);

  for (const cap of requestedCapabilities) {
    if (!declaredCaps.has(cap)) {
      undeclared.push(cap);
      errors.push(ERR.CAPABILITY_NOT_DECLARED);
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    undeclared,
  };
}

export {
  isCapabilityAllowed,
  enforceCapabilityPolicy,
  buildCapabilityImports,
  checkUndeclaredCapabilities,
};
