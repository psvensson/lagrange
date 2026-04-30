/**
 * Validation helpers for runtime descriptor envelopes.
 *
 * Validates that service definitions carry correct runtime
 * descriptors per runtime kind. Enforces fail-closed semantics:
 * unknown kinds or invalid descriptors produce explicit errors.
 *
 * Requirements: 5.4, 9.2
 */

import {ALLOWED_RUNTIME_KINDS, RUNTIME_KIND} from '../constants/runtime.js';
import {TYPEOF} from '../constants/types.js';
import {
  isPgwireRuntimeRef,
  validatePgwireRuntimeConfig,
} from '../runtime/pgwire-descriptor.js';

const LOCAL_NUM_ZERO = 0;

// --- Validation error message constants ---

const DESCRIPTOR_ERROR = Object.freeze({
  KIND_REQUIRED:
    'runtime_kind is required',
  KIND_NOT_STRING:
    'runtime_kind must be a string',
  KIND_UNKNOWN_PREFIX:
    'unknown runtime_kind',
  REF_REQUIRED:
    'runtime_ref is required for this runtime kind',
  REF_NOT_STRING:
    'runtime_ref must be a string',
  REF_EMPTY:
    'runtime_ref must be a non-empty string',
  REF_MISSING_DIGEST:
    'runtime_ref must contain a digest reference (@sha256:)',
  CONFIG_NOT_STRING:
    'runtime_config must be a string when provided',
  CONFIG_INVALID_JSON:
    'runtime_config must be valid JSON when provided',
});

const OCI_DIGEST_MARKER = '@sha256:';

/**
 * Build a diagnostic error message for an unknown runtime kind.
 *
 * @param {string} kind - The unknown kind value.
 * @return {string} Error message with the value and allowed kinds.
 */
function unknownKindMessage(kind) {
  const allowed = [...ALLOWED_RUNTIME_KINDS].join(', ');
  return `${DESCRIPTOR_ERROR.KIND_UNKNOWN_PREFIX} '${kind}'` +
    ` (allowed: ${allowed})`;
}

/**
 * Validate that runtime_kind is an allowed value.
 *
 * @param {*} kind - The runtime_kind value to validate.
 * @return {{valid: boolean, errors?: string[]}}
 */
function validateRuntimeKind(kind) {
  if (kind === null || kind === undefined) {
    return {valid: false, errors: [DESCRIPTOR_ERROR.KIND_REQUIRED]};
  }
  if (typeof kind !== TYPEOF.STRING) {
    return {valid: false, errors: [DESCRIPTOR_ERROR.KIND_NOT_STRING]};
  }
  if (!ALLOWED_RUNTIME_KINDS.has(kind)) {
    return {valid: false, errors: [unknownKindMessage(kind)]};
  }
  return {valid: true};
}

/**
 * Validate runtime_config if provided.
 * Must be null/undefined or a valid JSON string.
 *
 * @param {*} config - The runtime_config value.
 * @return {{valid: boolean, errors?: string[]}}
 */
function validateRuntimeConfig(config) {
  if (config === null || config === undefined) {
    return {valid: true};
  }
  if (typeof config !== TYPEOF.STRING) {
    return {valid: false, errors: [DESCRIPTOR_ERROR.CONFIG_NOT_STRING]};
  }
  try {
    JSON.parse(config);
  } catch (_e) {
    return {valid: false, errors: [DESCRIPTOR_ERROR.CONFIG_INVALID_JSON]};
  }
  return {valid: true};
}

/**
 * Validate runtime_ref for native_js kind.
 * runtime_ref is optional (can be null).
 *
 * @param {*} ref - The runtime_ref value.
 * @return {{valid: boolean, errors?: string[]}}
 */
function validateNativeJsRef(ref) {
  if (ref === null || ref === undefined) {
    return {valid: true};
  }
  if (typeof ref !== TYPEOF.STRING) {
    return {valid: false, errors: [DESCRIPTOR_ERROR.REF_NOT_STRING]};
  }
  return {valid: true};
}

/**
 * Validate runtime_ref for wasm_component kind.
 * runtime_ref must be a non-empty string.
 *
 * @param {*} ref - The runtime_ref value.
 * @return {{valid: boolean, errors?: string[]}}
 */
function validateWasmComponentRef(ref) {
  if (ref === null || ref === undefined) {
    return {valid: false, errors: [DESCRIPTOR_ERROR.REF_REQUIRED]};
  }
  if (typeof ref !== TYPEOF.STRING) {
    return {valid: false, errors: [DESCRIPTOR_ERROR.REF_NOT_STRING]};
  }
  if (ref.length === LOCAL_NUM_ZERO) {
    return {valid: false, errors: [DESCRIPTOR_ERROR.REF_EMPTY]};
  }
  return {valid: true};
}

/**
 * Validate runtime_ref for oci_container kind.
 * runtime_ref must be a non-empty string containing @sha256:.
 *
 * @param {*} ref - The runtime_ref value.
 * @return {{valid: boolean, errors?: string[]}}
 */
function validateOciContainerRef(ref) {
  if (ref === null || ref === undefined) {
    return {valid: false, errors: [DESCRIPTOR_ERROR.REF_REQUIRED]};
  }
  if (typeof ref !== TYPEOF.STRING) {
    return {valid: false, errors: [DESCRIPTOR_ERROR.REF_NOT_STRING]};
  }
  if (ref.length === LOCAL_NUM_ZERO) {
    return {valid: false, errors: [DESCRIPTOR_ERROR.REF_EMPTY]};
  }
  if (!ref.includes(OCI_DIGEST_MARKER)) {
    return {valid: false, errors: [DESCRIPTOR_ERROR.REF_MISSING_DIGEST]};
  }
  return {valid: true};
}

/**
 * Per-kind runtime_ref validators.
 * @type {Object<string, function(*): {valid: boolean, errors?: string[]}>}
 */
const REF_VALIDATORS = Object.freeze({
  [RUNTIME_KIND.NATIVE_JS]: validateNativeJsRef,
  [RUNTIME_KIND.WASM_COMPONENT]: validateWasmComponentRef,
  [RUNTIME_KIND.OCI_CONTAINER]: validateOciContainerRef,
});

/**
 * Validate a complete runtime descriptor envelope.
 *
 * Checks runtime_kind, runtime_ref (per-kind rules), and
 * runtime_config. Fail-closed: unknown kinds or missing
 * validators produce explicit errors.
 *
 * @param {{runtimeKind: *, runtimeRef: *, runtimeConfig: *}} descriptor
 * @return {{valid: boolean, errors?: string[]}}
 */
function validateRuntimeDescriptor(descriptor) {
  const errors = [];

  const kindResult = validateRuntimeKind(descriptor.runtimeKind);
  if (!kindResult.valid) {
    errors.push(...kindResult.errors);
    return {valid: false, errors};
  }

  const refValidator = REF_VALIDATORS[descriptor.runtimeKind];
  if (!refValidator) {
    errors.push(unknownKindMessage(descriptor.runtimeKind));
    return {valid: false, errors};
  }

  const refResult = refValidator(descriptor.runtimeRef);
  if (!refResult.valid) {
    errors.push(...refResult.errors);
  }

  const configResult = validateRuntimeConfig(descriptor.runtimeConfig);
  if (!configResult.valid) {
    errors.push(...configResult.errors);
  }

  // Per-ref config shape validation (fail-closed).
  if (configResult.valid &&
      isPgwireRuntimeRef(descriptor.runtimeRef)) {
    const pgResult = validatePgwireRuntimeConfig(
      descriptor.runtimeConfig,
    );
    if (!pgResult.valid) {
      errors.push(...pgResult.errors);
    }
  }

  if (errors.length > LOCAL_NUM_ZERO) {
    return {valid: false, errors};
  }
  return {valid: true};
}

export {
  validateRuntimeKind,
  validateRuntimeConfig,
  validateRuntimeDescriptor,
  unknownKindMessage,
  DESCRIPTOR_ERROR,
};
