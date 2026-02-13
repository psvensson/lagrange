/**
 * OCI container descriptor model and digest-only validation.
 *
 * Defines the descriptor schema for oci_container runtime kind
 * and enforces immutable digest references for activation.
 * Reuses existing OCI reference validation from
 * src/wasm-service/oci-reference.js — no duplicate parsing.
 *
 * Requirements: 4.1, 4.2, 9.3
 *
 * @module runtime/oci-container-descriptor
 */

import {TYPEOF} from '../constants/types.js';
import {validateDigestPin} from '../wasm-service/oci-reference.js';

// --- OCI descriptor field names ---

const OCI_DESCRIPTOR_FIELD = Object.freeze({
  IMAGE_REF: 'imageRef',
  DIGEST: 'digest',
  REGISTRY: 'registry',
  REPOSITORY: 'repository',
  TAG: 'tag',
});

// --- OCI runtime config field names ---

const OCI_CONFIG_FIELD = Object.freeze({
  MEMORY_LIMIT_MB: 'memoryLimitMb',
  CPU_LIMIT: 'cpuLimit',
  NETWORK_POLICY: 'networkPolicy',
  ENV_VARS: 'envVars',
  HEALTH_CHECK_PATH: 'healthCheckPath',
  HEALTH_CHECK_INTERVAL_MS: 'healthCheckIntervalMs',
});

// --- OCI network policy values ---

const OCI_NETWORK_POLICY = Object.freeze({
  NONE: 'none',
  HOST: 'host',
  ISOLATED: 'isolated',
});

// --- Allowed network policy set ---

const ALLOWED_NETWORK_POLICIES = Object.freeze(
  new Set(Object.values(OCI_NETWORK_POLICY)),
);

// --- OCI descriptor error messages ---

const OCI_DESCRIPTOR_ERROR = Object.freeze({
  REF_REQUIRED: 'runtime_ref is required for oci_container',
  REF_NOT_STRING: 'runtime_ref must be a string',
  REF_EMPTY: 'runtime_ref must not be empty',
  DIGEST_REQUIRED:
    'oci_container requires immutable digest pin in runtime_ref',
  DIGEST_INVALID: 'runtime_ref digest is invalid',
  CONFIG_NOT_STRING:
    'runtime_config must be a string when provided',
  CONFIG_INVALID_JSON: 'runtime_config must be valid JSON',
  MEMORY_LIMIT_INVALID:
    'memoryLimitMb must be a positive number',
  CPU_LIMIT_INVALID: 'cpuLimit must be a positive number',
  NETWORK_POLICY_INVALID:
    'networkPolicy must be one of: none, host, isolated',
  HEALTH_CHECK_INTERVAL_INVALID:
    'healthCheckIntervalMs must be a positive integer',
  FEATURE_GATE_DISABLED:
    'oci_container runtime is feature-gated and currently disabled',
});

// --- Feature gate constants ---

const OCI_FEATURE_GATE = Object.freeze({
  KEY: 'oci_container_enabled',
  DEFAULT: false,
});

// --- Validation functions ---

/**
 * Validate that runtime_ref contains an immutable digest pin.
 * Delegates to validateDigestPin from oci-reference.js.
 *
 * @param {*} ref - The runtime_ref value to validate.
 * @return {{valid: boolean, errors?: string[], parsed?: Object}}
 */
function validateOciDescriptorRef(ref) {
  if (ref === undefined || ref === null) {
    return {valid: false, errors: [OCI_DESCRIPTOR_ERROR.REF_REQUIRED]};
  }
  if (typeof ref !== TYPEOF.STRING) {
    return {valid: false, errors: [OCI_DESCRIPTOR_ERROR.REF_NOT_STRING]};
  }
  if (ref.trim().length === 0) {
    return {valid: false, errors: [OCI_DESCRIPTOR_ERROR.REF_EMPTY]};
  }
  const pinResult = validateDigestPin(ref);
  if (!pinResult.valid) {
    const errors = pinResult.errors.map((e) => {
      if (e.includes('digest pin')) {
        return OCI_DESCRIPTOR_ERROR.DIGEST_REQUIRED;
      }
      return OCI_DESCRIPTOR_ERROR.DIGEST_INVALID;
    });
    const unique = [...new Set(errors)];
    return {valid: false, errors: unique};
  }
  return {valid: true, parsed: {digest: pinResult.digest}};
}

/**
 * Validate optional runtime_config JSON string for OCI containers.
 *
 * @param {*} configStr - The runtime_config value (string or null).
 * @return {{valid: boolean, errors?: string[], config?: Object}}
 */
function validateOciRuntimeConfig(configStr) {
  if (configStr === undefined || configStr === null) {
    return {valid: true};
  }
  if (typeof configStr !== TYPEOF.STRING) {
    return {
      valid: false,
      errors: [OCI_DESCRIPTOR_ERROR.CONFIG_NOT_STRING],
    };
  }
  let parsed;
  try {
    parsed = JSON.parse(configStr);
  } catch (_e) {
    return {
      valid: false,
      errors: [OCI_DESCRIPTOR_ERROR.CONFIG_INVALID_JSON],
    };
  }
  const errors = [];
  if (OCI_CONFIG_FIELD.MEMORY_LIMIT_MB in parsed) {
    const val = parsed[OCI_CONFIG_FIELD.MEMORY_LIMIT_MB];
    if (typeof val !== TYPEOF.NUMBER || val <= 0) {
      errors.push(OCI_DESCRIPTOR_ERROR.MEMORY_LIMIT_INVALID);
    }
  }
  if (OCI_CONFIG_FIELD.CPU_LIMIT in parsed) {
    const val = parsed[OCI_CONFIG_FIELD.CPU_LIMIT];
    if (typeof val !== TYPEOF.NUMBER || val <= 0) {
      errors.push(OCI_DESCRIPTOR_ERROR.CPU_LIMIT_INVALID);
    }
  }
  if (OCI_CONFIG_FIELD.NETWORK_POLICY in parsed) {
    const val = parsed[OCI_CONFIG_FIELD.NETWORK_POLICY];
    if (!ALLOWED_NETWORK_POLICIES.has(val)) {
      errors.push(OCI_DESCRIPTOR_ERROR.NETWORK_POLICY_INVALID);
    }
  }
  if (OCI_CONFIG_FIELD.HEALTH_CHECK_INTERVAL_MS in parsed) {
    const val = parsed[OCI_CONFIG_FIELD.HEALTH_CHECK_INTERVAL_MS];
    if (typeof val !== TYPEOF.NUMBER ||
        val <= 0 || !Number.isInteger(val)) {
      errors.push(
        OCI_DESCRIPTOR_ERROR.HEALTH_CHECK_INTERVAL_INVALID,
      );
    }
  }
  if (errors.length > 0) {
    return {valid: false, errors};
  }
  return {valid: true, config: parsed};
}

/**
 * Full descriptor validation for oci_container runtime kind.
 * Validates both runtime_ref and runtime_config.
 *
 * @param {{runtime_ref: *, runtime_config?: *}} descriptor
 * @return {{valid: boolean, errors?: string[]}}
 */
function validateOciDescriptor(descriptor) {
  const errors = [];
  const refResult = validateOciDescriptorRef(
    descriptor && descriptor.runtime_ref,
  );
  if (!refResult.valid) {
    errors.push(...refResult.errors);
  }
  const configResult = validateOciRuntimeConfig(
    descriptor && descriptor.runtime_config,
  );
  if (!configResult.valid) {
    errors.push(...configResult.errors);
  }
  if (errors.length > 0) {
    return {valid: false, errors};
  }
  return {valid: true};
}

/**
 * Check whether the OCI container feature gate is enabled.
 *
 * @param {Object|null} configMap - Configuration map (or null).
 * @return {boolean} True only if explicitly enabled.
 */
function isOciFeatureGateEnabled(configMap) {
  if (!configMap) {
    return OCI_FEATURE_GATE.DEFAULT;
  }
  return configMap[OCI_FEATURE_GATE.KEY] === true;
}

export {
  OCI_DESCRIPTOR_FIELD,
  OCI_CONFIG_FIELD,
  OCI_NETWORK_POLICY,
  ALLOWED_NETWORK_POLICIES,
  OCI_DESCRIPTOR_ERROR,
  OCI_FEATURE_GATE,
  validateOciDescriptorRef,
  validateOciRuntimeConfig,
  validateOciDescriptor,
  isOciFeatureGateEnabled,
};
