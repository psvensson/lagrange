/**
 * Constants for WASM meta-service management.
 *
 * Covers package identity parsing, async operation states,
 * command/action names, and service identifiers for
 * sys-wasm-meta and sys-admin-meta.
 *
 * Requirements: 2.1, 3.1, 8.1
 */

// --- Package identity (namespace:name@version) ---

const PACKAGE_ID_SEPARATOR = ':';
const PACKAGE_VERSION_SEPARATOR = '@';

const PACKAGE_ID_MAX_LENGTH = Object.freeze({
  NAMESPACE: 128,
  NAME: 128,
  VERSION: 64,
});

/**
 * Regex for canonical package identity: namespace:name@version
 *
 * namespace — lowercase alphanumeric + hyphens, 1-128 chars
 * name      — lowercase alphanumeric + hyphens, 1-128 chars
 * version   — semver-like (digits, dots, hyphens, plus), 1-64 chars
 */
const PACKAGE_ID_PATTERN =
  /^([a-z][a-z0-9-]{0,127}):([a-z][a-z0-9-]{0,127})@([0-9][0-9a-zA-Z.+-]{0,63})$/;

// --- Async operation states (wasm_operations table) ---

const WASM_OPERATION_STATE = Object.freeze({
  PENDING: 'pending',
  IN_PROGRESS: 'in_progress',
  COMPLETED: 'completed',
  FAILED: 'failed',
  CANCELLED: 'cancelled',
});

// --- sys-wasm-meta command / action names ---

const WASM_META_ACTION = Object.freeze({
  PUBLISH_MODULE: 'publishModule',
  GET_MODULE: 'getModule',
  LIST_MODULES: 'listModules',
  CREATE_SERVICE: 'createService',
  UPDATE_SERVICE: 'updateService',
  SCALE_SERVICE: 'scaleService',
  ROLLOUT_SERVICE: 'rolloutService',
  DELETE_SERVICE: 'deleteService',
  GET_OPERATION: 'getOperation',
  STREAM_OPERATIONS: 'streamOperations',
});

// --- Service identifiers ---

const META_SERVICE_ID = Object.freeze({
  WASM_META: 'sys-wasm-meta',
  ADMIN_META: 'sys-admin-meta',
  POSTGRES_WIRE: 'sys-postgres-wire',
});

// --- Runtime references for built-in meta services ---

const META_SERVICE_RUNTIME_REF = Object.freeze({
  ADMIN_META: 'admin-meta-command-handlers',
  WASM_META: 'wasm-meta-command-handlers',
  POSTGRES_WIRE: 'postgres-wire-runtime',
});

export {
  PACKAGE_ID_SEPARATOR,
  PACKAGE_VERSION_SEPARATOR,
  PACKAGE_ID_MAX_LENGTH,
  PACKAGE_ID_PATTERN,
  WASM_OPERATION_STATE,
  WASM_META_ACTION,
  META_SERVICE_ID,
  META_SERVICE_RUNTIME_REF,
};
