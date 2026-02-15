/**
 * Constants for WASM module manifest validation and storage.
 */

const MODULE_MANIFEST_FIELD = Object.freeze({
  NAMESPACE: 'namespace',
  NAME: 'name',
  VERSION: 'version',
  DIGEST: 'digest',
  RUN_EXPORT: 'runExport',
  EXPORTS: 'exports',
  DEPENDENCIES: 'dependencies',
  CAPABILITIES: 'capabilities',
  DEBUG_ARTIFACT: 'debugArtifact',
  SOURCE_REFERENCE: 'sourceReference',
  ARTIFACT_POINTER: 'artifactPointer',
});

const DEBUG_ARTIFACT_FIELD = Object.freeze({
  MODE: 'mode',
  SIDECAR_URI: 'sidecarUri',
  EMBEDDED_SECTION: 'embeddedSection',
});

const DEBUG_ARTIFACT_MODE = Object.freeze({
  EMBEDDED: 'embedded',
  SIDECAR: 'sidecar',
});

const MODULE_DEPENDENCY_FIELD = Object.freeze({
  MODULE_ID: 'moduleId',
  DIGEST: 'digest',
});

const MODULE_MANIFEST_COL = Object.freeze({
  NAMESPACE: 'namespace',
  NAME: 'name',
  VERSION: 'version',
  DIGEST: 'digest',
  RUN_EXPORT: 'run_export',
  EXPORTS: 'exports',
  DEPENDENCIES: 'dependencies',
  CAPABILITIES: 'capabilities',
  SOURCE_REFERENCE: 'source_reference',
  ARTIFACT_POINTER: 'artifact_pointer',
  CREATED_AT: 'created_at',
});

const DIGEST_PREFIX = 'sha256:';
const DIGEST_HEX_LENGTH = 64;

const MODULE_MANIFEST_ERROR_MSG = Object.freeze({
  NAMESPACE_REQUIRED: 'Module manifest requires namespace',
  NAME_REQUIRED: 'Module manifest requires name',
  NAMESPACE_INVALID_FORMAT:
    'Namespace must be lowercase alphanumeric with hyphens',
  NAME_INVALID_FORMAT:
    'Name must be lowercase alphanumeric with hyphens',
  VERSION_REQUIRED: 'Module manifest requires version',
  DIGEST_REQUIRED: 'Module manifest requires digest',
  DIGEST_INVALID_FORMAT:
    'Module digest must start with sha256: followed by 64 hex chars',
  RUN_EXPORT_REQUIRED: 'Module manifest requires run_export',
  RUN_EXPORT_NOT_IN_EXPORTS:
    'run_export must reference a declared export',
  EXPORTS_REQUIRED:
    'Module manifest requires at least one declared export',
  EXPORTS_NOT_ARRAY: 'Module exports must be an array of strings',
  DEPENDENCIES_NOT_ARRAY:
    'Module dependencies must be an array',
  DEPENDENCY_MODULE_ID_REQUIRED:
    'Each dependency requires module_id',
  DEPENDENCY_DIGEST_REQUIRED:
    'Each dependency requires a pinned digest',
  DEPENDENCY_DIGEST_INVALID_FORMAT:
    'Dependency digest must start with sha256: followed by 64 hex chars',
  CAPABILITIES_NOT_ARRAY:
    'Module capabilities must be an array of strings',
  DEBUG_ARTIFACT_INVALID:
    'debugArtifact must be an object when declared',
  DEBUG_ARTIFACT_MODE_INVALID:
    'debugArtifact.mode must be one of: embedded, sidecar',
  DEBUG_ARTIFACT_SIDECAR_URI_REQUIRED:
    'debugArtifact.sidecarUri or artifactPointer is required for sidecar mode',
  DEBUG_ARTIFACT_EMBEDDED_SECTION_INVALID:
    'debugArtifact.embeddedSection must be a non-empty string when provided',
  UNDECLARED_CAPABILITY:
    'Module declares capability not in tenant allowlist',
  RUN_EXPORT_MISSING_IN_MODULE:
    'run_export not found in WASM module instance exports',
  RUN_EXPORT_NOT_FUNCTION:
    'run_export must resolve to a function in the module',
  RUN_EXPORT_SIGNATURE_MISMATCH:
    'run_export signature does not match required runtime contract',
  MANIFEST_REQUIRED:
    'Module manifest is required for runtime validation',
  MODULE_INSTANCE_REQUIRED:
    'WASM module instance is required for runtime validation',
  UNDECLARED_IMPORT:
    'Module uses undeclared import not listed in dependencies',
  DEPENDENCY_DIGEST_MISMATCH:
    'Resolved dependency digest does not match pinned manifest digest',
  DEPENDENCY_NOT_FOUND:
    'Dependency module not found in approved sources',
  DEPENDENCY_VERSION_MUTABLE:
    'Dependency version changed without explicit rollout',
  CAPABILITY_NOT_ALLOWED:
    'Capability not permitted by tenant/service policy',
  CAPABILITY_NOT_DECLARED:
    'Capability module not declared in manifest',
  POLICY_REQUIRED:
    'Capability policy is required for enforcement',
});

/**
 * Audit log message templates for module/capability resolution.
 * @enum {string}
 */
const MODULE_AUDIT_MSG = Object.freeze({
  MANIFEST_VALIDATION_PASSED:
    'Manifest runtime validation passed',
  MANIFEST_VALIDATION_FAILED:
    'Manifest runtime validation failed',
  RUN_EXPORT_VERIFIED:
    'run_export verified in module instance',
  DEPENDENCY_RESOLVED:
    'Dependency resolved by pinned digest',
  DEPENDENCY_REJECTED:
    'Dependency rejected during resolution',
  CAPABILITY_ALLOWED:
    'Capability allowed by tenant/service policy',
  CAPABILITY_DENIED:
    'Capability denied by tenant/service policy',
  MODULE_ACTIVATED:
    'Module activation completed',
  MODULE_ACTIVATION_REJECTED:
    'Module activation rejected',
});

/**
 * Resolution decision outcome values for audit records.
 * @enum {string}
 */
const RESOLUTION_DECISION = Object.freeze({
  ALLOWED: 'allowed',
  DENIED: 'denied',
  RESOLVED: 'resolved',
  REJECTED: 'rejected',
});

/**
 * Minimum parameter count for run_export runtime contract.
 * The run_export must accept at least (context, batch).
 * @type {number}
 */
const RUN_EXPORT_MIN_PARAMS = 2;

/**
 * Maximum parameter count for run_export runtime contract.
 * The run_export may accept (context, batch, options).
 * @type {number}
 */
const RUN_EXPORT_MAX_PARAMS = 3;

export {
  MODULE_MANIFEST_FIELD,
  MODULE_DEPENDENCY_FIELD,
  MODULE_MANIFEST_COL,
  DEBUG_ARTIFACT_FIELD,
  DEBUG_ARTIFACT_MODE,
  DIGEST_PREFIX,
  DIGEST_HEX_LENGTH,
  MODULE_MANIFEST_ERROR_MSG,
  MODULE_AUDIT_MSG,
  RESOLUTION_DECISION,
  RUN_EXPORT_MIN_PARAMS,
  RUN_EXPORT_MAX_PARAMS,
};
