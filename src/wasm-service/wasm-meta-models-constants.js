/**
 * Constants for WASM meta-service row models.
 *
 * Column names and field names for registry mappings,
 * registry overrides, dependency locks, and wasm operations.
 *
 * Requirements: 3.2, 5.2, 10.4
 */

// --- Registry mapping columns (package_registry_mappings) ---

const REGISTRY_MAPPING_COL = Object.freeze({
  NAMESPACE: 'namespace',
  REGISTRY_URL: 'registry_url',
  POLICY_METADATA: 'policy_metadata',
  CREATED_AT: 'created_at',
  UPDATED_AT: 'updated_at',
});

const REGISTRY_MAPPING_FIELD = Object.freeze({
  NAMESPACE: 'namespace',
  REGISTRY_URL: 'registryUrl',
  POLICY_METADATA: 'policyMetadata',
});

// --- Registry override columns (package_registry_overrides) ---

const REGISTRY_OVERRIDE_COL = Object.freeze({
  NAMESPACE: 'namespace',
  NAME: 'name',
  REGISTRY_URL: 'registry_url',
  POLICY_METADATA: 'policy_metadata',
  CREATED_AT: 'created_at',
  UPDATED_AT: 'updated_at',
});

const REGISTRY_OVERRIDE_FIELD = Object.freeze({
  NAMESPACE: 'namespace',
  NAME: 'name',
  REGISTRY_URL: 'registryUrl',
  POLICY_METADATA: 'policyMetadata',
});

// --- Dependency lock columns (module_dependency_locks) ---

const DEPENDENCY_LOCK_COL = Object.freeze({
  LOCK_ID: 'lock_id',
  TARGET_MODULE_NAMESPACE: 'target_module_namespace',
  TARGET_MODULE_NAME: 'target_module_name',
  TARGET_MODULE_VERSION: 'target_module_version',
  TARGET_SERVICE_ID: 'target_service_id',
  RESOLVED_DEPENDENCIES: 'resolved_dependencies',
  CREATED_AT: 'created_at',
});

const DEPENDENCY_LOCK_FIELD = Object.freeze({
  LOCK_ID: 'lockId',
  TARGET_MODULE_NAMESPACE: 'targetModuleNamespace',
  TARGET_MODULE_NAME: 'targetModuleName',
  TARGET_MODULE_VERSION: 'targetModuleVersion',
  TARGET_SERVICE_ID: 'targetServiceId',
  RESOLVED_DEPENDENCIES: 'resolvedDependencies',
});

// --- Wasm operation columns (wasm_operations) ---

const WASM_OPERATION_COL = Object.freeze({
  OPERATION_ID: 'operation_id',
  TENANT_ID: 'tenant_id',
  COMMAND: 'command',
  IDEMPOTENCY_KEY: 'idempotency_key',
  STATE: 'state',
  RESULT: 'result',
  ERROR: 'error',
  CREATED_AT: 'created_at',
  UPDATED_AT: 'updated_at',
});

const WASM_OPERATION_FIELD = Object.freeze({
  OPERATION_ID: 'operationId',
  TENANT_ID: 'tenantId',
  COMMAND: 'command',
  IDEMPOTENCY_KEY: 'idempotencyKey',
  STATE: 'state',
  RESULT: 'result',
  ERROR: 'error',
});

// --- Validation error messages ---

const REGISTRY_MAPPING_ERROR_MSG = Object.freeze({
  NAMESPACE_REQUIRED:
    'Registry mapping requires namespace',
  NAMESPACE_INVALID_FORMAT:
    'Namespace must be lowercase alphanumeric with hyphens',
  REGISTRY_URL_REQUIRED:
    'Registry mapping requires registry_url',
});

const REGISTRY_OVERRIDE_ERROR_MSG = Object.freeze({
  NAMESPACE_REQUIRED:
    'Registry override requires namespace',
  NAMESPACE_INVALID_FORMAT:
    'Namespace must be lowercase alphanumeric with hyphens',
  NAME_REQUIRED:
    'Registry override requires name',
  NAME_INVALID_FORMAT:
    'Name must be lowercase alphanumeric with hyphens',
  REGISTRY_URL_REQUIRED:
    'Registry override requires registry_url',
});

const DEPENDENCY_LOCK_ERROR_MSG = Object.freeze({
  LOCK_ID_REQUIRED:
    'Dependency lock requires lock_id',
  TARGET_NAMESPACE_REQUIRED:
    'Dependency lock requires target_module_namespace',
  TARGET_NAME_REQUIRED:
    'Dependency lock requires target_module_name',
  TARGET_VERSION_REQUIRED:
    'Dependency lock requires target_module_version',
  RESOLVED_DEPS_NOT_ARRAY:
    'resolved_dependencies must be an array',
});

const WASM_OPERATION_ERROR_MSG = Object.freeze({
  OPERATION_ID_REQUIRED:
    'Wasm operation requires operation_id',
  TENANT_ID_REQUIRED:
    'Wasm operation requires tenant_id',
  COMMAND_REQUIRED:
    'Wasm operation requires command',
  STATE_INVALID:
    'Wasm operation state must be a valid WASM_OPERATION_STATE',
});

/**
 * Namespace format pattern: lowercase alpha start, then
 * lowercase alphanumeric + hyphens, 1-128 chars.
 * @type {RegExp}
 */
const NAMESPACE_PATTERN = /^[a-z][a-z0-9-]{0,127}$/;

/**
 * Package name format pattern: lowercase alpha start, then
 * lowercase alphanumeric + hyphens, 1-128 chars.
 * @type {RegExp}
 */
const PACKAGE_NAME_PATTERN = /^[a-z][a-z0-9-]{0,127}$/;

export {
  REGISTRY_MAPPING_COL,
  REGISTRY_MAPPING_FIELD,
  REGISTRY_OVERRIDE_COL,
  REGISTRY_OVERRIDE_FIELD,
  DEPENDENCY_LOCK_COL,
  DEPENDENCY_LOCK_FIELD,
  WASM_OPERATION_COL,
  WASM_OPERATION_FIELD,
  REGISTRY_MAPPING_ERROR_MSG,
  REGISTRY_OVERRIDE_ERROR_MSG,
  DEPENDENCY_LOCK_ERROR_MSG,
  WASM_OPERATION_ERROR_MSG,
  NAMESPACE_PATTERN,
  PACKAGE_NAME_PATTERN,
};
