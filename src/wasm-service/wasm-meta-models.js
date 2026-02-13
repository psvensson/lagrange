/**
 * Row models for WASM meta-service tables.
 *
 * Serializers, deserializers, and validators for:
 * - package_registry_mappings
 * - package_registry_overrides
 * - module_dependency_locks
 * - wasm_operations
 *
 * Requirements: 3.2, 5.2, 10.4
 */

import {
  NUM, STRING, TYPEOF, WASM_OPERATION_STATE,
} from '../constants/index.js';
import {
  REGISTRY_MAPPING_COL as RM_COL,
  REGISTRY_MAPPING_FIELD as RM,
  REGISTRY_OVERRIDE_COL as RO_COL,
  REGISTRY_OVERRIDE_FIELD as RO,
  DEPENDENCY_LOCK_COL as DL_COL,
  DEPENDENCY_LOCK_FIELD as DL,
  WASM_OPERATION_COL as WO_COL,
  WASM_OPERATION_FIELD as WO,
  REGISTRY_MAPPING_ERROR_MSG as RM_ERR,
  REGISTRY_OVERRIDE_ERROR_MSG as RO_ERR,
  DEPENDENCY_LOCK_ERROR_MSG as DL_ERR,
  WASM_OPERATION_ERROR_MSG as WO_ERR,
  NAMESPACE_PATTERN,
  PACKAGE_NAME_PATTERN,
} from './wasm-meta-models-constants.js';

const VALID_OP_STATES = new Set(
  Object.values(WASM_OPERATION_STATE)
);

// ---- Registry Mapping ----

/**
 * Validate a registry mapping object.
 * @param {Object} mapping - Registry mapping to validate.
 * @return {{valid: boolean, errors: string[]}} Result.
 */
function validateRegistryMapping(mapping) {
  const errors = [];
  if (!mapping[RM.NAMESPACE]) {
    errors.push(RM_ERR.NAMESPACE_REQUIRED);
  } else if (!NAMESPACE_PATTERN.test(mapping[RM.NAMESPACE])) {
    errors.push(RM_ERR.NAMESPACE_INVALID_FORMAT);
  }
  if (!mapping[RM.REGISTRY_URL]) {
    errors.push(RM_ERR.REGISTRY_URL_REQUIRED);
  }
  return {valid: errors.length === NUM.ZERO, errors};
}

/**
 * Serialize a registry mapping to a table row.
 * @param {Object} mapping - Registry mapping object.
 * @return {Object} Table row with snake_case keys.
 */
function serializeRegistryMapping(mapping) {
  const now = Date.now();
  return {
    [RM_COL.NAMESPACE]: mapping[RM.NAMESPACE],
    [RM_COL.REGISTRY_URL]: mapping[RM.REGISTRY_URL],
    [RM_COL.POLICY_METADATA]: JSON.stringify(
      mapping[RM.POLICY_METADATA] || {}
    ),
    [RM_COL.CREATED_AT]: mapping.createdAt ?? now,
    [RM_COL.UPDATED_AT]: mapping.updatedAt ?? now,
  };
}

/**
 * Deserialize a table row to a registry mapping object.
 * @param {Object} row - Table row with snake_case keys.
 * @return {Object} Registry mapping with camelCase keys.
 */
function deserializeRegistryMapping(row) {
  return {
    [RM.NAMESPACE]: row[RM_COL.NAMESPACE],
    [RM.REGISTRY_URL]: row[RM_COL.REGISTRY_URL],
    [RM.POLICY_METADATA]: JSON.parse(
      row[RM_COL.POLICY_METADATA] || STRING.EMPTY_JSON_OBJECT
    ),
    createdAt: row[RM_COL.CREATED_AT] ?? NUM.ZERO,
    updatedAt: row[RM_COL.UPDATED_AT] ?? NUM.ZERO,
  };
}

// ---- Registry Override ----

/**
 * Validate a registry override object.
 * @param {Object} override - Registry override to validate.
 * @return {{valid: boolean, errors: string[]}} Result.
 */
function validateRegistryOverride(override) {
  const errors = [];
  if (!override[RO.NAMESPACE]) {
    errors.push(RO_ERR.NAMESPACE_REQUIRED);
  } else if (!NAMESPACE_PATTERN.test(override[RO.NAMESPACE])) {
    errors.push(RO_ERR.NAMESPACE_INVALID_FORMAT);
  }
  if (!override[RO.NAME]) {
    errors.push(RO_ERR.NAME_REQUIRED);
  } else if (!PACKAGE_NAME_PATTERN.test(override[RO.NAME])) {
    errors.push(RO_ERR.NAME_INVALID_FORMAT);
  }
  if (!override[RO.REGISTRY_URL]) {
    errors.push(RO_ERR.REGISTRY_URL_REQUIRED);
  }
  return {valid: errors.length === NUM.ZERO, errors};
}

/**
 * Serialize a registry override to a table row.
 * @param {Object} override - Registry override object.
 * @return {Object} Table row with snake_case keys.
 */
function serializeRegistryOverride(override) {
  const now = Date.now();
  return {
    [RO_COL.NAMESPACE]: override[RO.NAMESPACE],
    [RO_COL.NAME]: override[RO.NAME],
    [RO_COL.REGISTRY_URL]: override[RO.REGISTRY_URL],
    [RO_COL.POLICY_METADATA]: JSON.stringify(
      override[RO.POLICY_METADATA] || {}
    ),
    [RO_COL.CREATED_AT]: override.createdAt ?? now,
    [RO_COL.UPDATED_AT]: override.updatedAt ?? now,
  };
}

/**
 * Deserialize a table row to a registry override object.
 * @param {Object} row - Table row with snake_case keys.
 * @return {Object} Registry override with camelCase keys.
 */
function deserializeRegistryOverride(row) {
  return {
    [RO.NAMESPACE]: row[RO_COL.NAMESPACE],
    [RO.NAME]: row[RO_COL.NAME],
    [RO.REGISTRY_URL]: row[RO_COL.REGISTRY_URL],
    [RO.POLICY_METADATA]: JSON.parse(
      row[RO_COL.POLICY_METADATA] || STRING.EMPTY_JSON_OBJECT
    ),
    createdAt: row[RO_COL.CREATED_AT] ?? NUM.ZERO,
    updatedAt: row[RO_COL.UPDATED_AT] ?? NUM.ZERO,
  };
}

// ---- Dependency Lock ----

/**
 * Validate a dependency lock object.
 * @param {Object} lock - Dependency lock to validate.
 * @return {{valid: boolean, errors: string[]}} Result.
 */
function validateDependencyLock(lock) {
  const errors = [];
  if (!lock[DL.LOCK_ID]) {
    errors.push(DL_ERR.LOCK_ID_REQUIRED);
  }
  if (!lock[DL.TARGET_MODULE_NAMESPACE]) {
    errors.push(DL_ERR.TARGET_NAMESPACE_REQUIRED);
  }
  if (!lock[DL.TARGET_MODULE_NAME]) {
    errors.push(DL_ERR.TARGET_NAME_REQUIRED);
  }
  if (!lock[DL.TARGET_MODULE_VERSION]) {
    errors.push(DL_ERR.TARGET_VERSION_REQUIRED);
  }
  const deps = lock[DL.RESOLVED_DEPENDENCIES];
  if (deps !== undefined && deps !== null && !Array.isArray(deps)) {
    errors.push(DL_ERR.RESOLVED_DEPS_NOT_ARRAY);
  }
  return {valid: errors.length === NUM.ZERO, errors};
}

/**
 * Serialize a dependency lock to a table row.
 * @param {Object} lock - Dependency lock object.
 * @return {Object} Table row with snake_case keys.
 */
function serializeDependencyLock(lock) {
  const now = Date.now();
  return {
    [DL_COL.LOCK_ID]: lock[DL.LOCK_ID],
    [DL_COL.TARGET_MODULE_NAMESPACE]:
      lock[DL.TARGET_MODULE_NAMESPACE],
    [DL_COL.TARGET_MODULE_NAME]:
      lock[DL.TARGET_MODULE_NAME],
    [DL_COL.TARGET_MODULE_VERSION]:
      lock[DL.TARGET_MODULE_VERSION],
    [DL_COL.TARGET_SERVICE_ID]:
      lock[DL.TARGET_SERVICE_ID] ?? null,
    [DL_COL.RESOLVED_DEPENDENCIES]: JSON.stringify(
      lock[DL.RESOLVED_DEPENDENCIES] || []
    ),
    [DL_COL.CREATED_AT]: lock.createdAt ?? now,
  };
}

/**
 * Deserialize a table row to a dependency lock object.
 * @param {Object} row - Table row with snake_case keys.
 * @return {Object} Dependency lock with camelCase keys.
 */
function deserializeDependencyLock(row) {
  return {
    [DL.LOCK_ID]: row[DL_COL.LOCK_ID],
    [DL.TARGET_MODULE_NAMESPACE]:
      row[DL_COL.TARGET_MODULE_NAMESPACE],
    [DL.TARGET_MODULE_NAME]:
      row[DL_COL.TARGET_MODULE_NAME],
    [DL.TARGET_MODULE_VERSION]:
      row[DL_COL.TARGET_MODULE_VERSION],
    [DL.TARGET_SERVICE_ID]:
      row[DL_COL.TARGET_SERVICE_ID] ?? null,
    [DL.RESOLVED_DEPENDENCIES]: JSON.parse(
      row[DL_COL.RESOLVED_DEPENDENCIES] ||
        STRING.EMPTY_JSON_ARRAY
    ),
    createdAt: row[DL_COL.CREATED_AT] ?? NUM.ZERO,
  };
}

// ---- Wasm Operation ----

/**
 * Validate a wasm operation object.
 * @param {Object} operation - Wasm operation to validate.
 * @return {{valid: boolean, errors: string[]}} Result.
 */
function validateWasmOperation(operation) {
  const errors = [];
  if (!operation[WO.OPERATION_ID]) {
    errors.push(WO_ERR.OPERATION_ID_REQUIRED);
  }
  if (!operation[WO.TENANT_ID]) {
    errors.push(WO_ERR.TENANT_ID_REQUIRED);
  }
  if (!operation[WO.COMMAND]) {
    errors.push(WO_ERR.COMMAND_REQUIRED);
  }
  const state = operation[WO.STATE];
  if (state && !VALID_OP_STATES.has(state)) {
    errors.push(WO_ERR.STATE_INVALID);
  }
  return {valid: errors.length === NUM.ZERO, errors};
}

/**
 * Serialize a wasm operation to a table row.
 * @param {Object} operation - Wasm operation object.
 * @return {Object} Table row with snake_case keys.
 */
function serializeWasmOperation(operation) {
  const now = Date.now();
  return {
    [WO_COL.OPERATION_ID]: operation[WO.OPERATION_ID],
    [WO_COL.TENANT_ID]: operation[WO.TENANT_ID],
    [WO_COL.COMMAND]: operation[WO.COMMAND],
    [WO_COL.IDEMPOTENCY_KEY]:
      operation[WO.IDEMPOTENCY_KEY] ?? null,
    [WO_COL.STATE]:
      operation[WO.STATE] ?? WASM_OPERATION_STATE.PENDING,
    [WO_COL.RESULT]: JSON.stringify(
      operation[WO.RESULT] || {}
    ),
    [WO_COL.ERROR]: JSON.stringify(
      operation[WO.ERROR] || {}
    ),
    [WO_COL.CREATED_AT]: operation.createdAt ?? now,
    [WO_COL.UPDATED_AT]: operation.updatedAt ?? now,
  };
}

/**
 * Deserialize a table row to a wasm operation object.
 * @param {Object} row - Table row with snake_case keys.
 * @return {Object} Wasm operation with camelCase keys.
 */
function deserializeWasmOperation(row) {
  return {
    [WO.OPERATION_ID]: row[WO_COL.OPERATION_ID],
    [WO.TENANT_ID]: row[WO_COL.TENANT_ID],
    [WO.COMMAND]: row[WO_COL.COMMAND],
    [WO.IDEMPOTENCY_KEY]:
      row[WO_COL.IDEMPOTENCY_KEY] ?? null,
    [WO.STATE]:
      row[WO_COL.STATE] ?? WASM_OPERATION_STATE.PENDING,
    [WO.RESULT]: JSON.parse(
      row[WO_COL.RESULT] || STRING.EMPTY_JSON_OBJECT
    ),
    [WO.ERROR]: JSON.parse(
      row[WO_COL.ERROR] || STRING.EMPTY_JSON_OBJECT
    ),
    createdAt: row[WO_COL.CREATED_AT] ?? NUM.ZERO,
    updatedAt: row[WO_COL.UPDATED_AT] ?? NUM.ZERO,
  };
}

export {
  validateRegistryMapping,
  serializeRegistryMapping,
  deserializeRegistryMapping,
  validateRegistryOverride,
  serializeRegistryOverride,
  deserializeRegistryOverride,
  validateDependencyLock,
  serializeDependencyLock,
  deserializeDependencyLock,
  validateWasmOperation,
  serializeWasmOperation,
  deserializeWasmOperation,
};
