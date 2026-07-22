/**
 * Command handlers for sys-wasm-meta service.
 * Each handler validates input and returns SQL statements
 * for the caller to execute. No direct SQL execution.
 *
 * Requirements: 2.1, 3.1, 3.5
 */

import {
  SQL,
  TABLES,
} from '../constants/index.js';
import {
  MODULE_MANIFEST_COL as COL,
} from './module-manifest-constants.js';
import {
  validateModuleManifest,
  serializeModuleManifest,
} from './module-manifest-models.js';
import {
  buildGetOperationSQL,
  buildListOperationsSQL,
} from './operation-lifecycle.js';
import {
  WASM_OPERATION_COL as WO_COL,
} from './wasm-meta-models-constants.js';

const META_COMMAND_ERROR_MSG = Object.freeze({
  MANIFEST_REQUIRED: 'Manifest is required for publish',
  NAMESPACE_REQUIRED: 'Namespace is required',
  NAME_REQUIRED: 'Name is required',
  VERSION_REQUIRED: 'Version is required',
  OPERATION_ID_REQUIRED: 'Operation ID is required',
  REQUEST_ID_REQUIRED: 'Request ID is required',
});

const COLUMN_LIST = [
  COL.NAMESPACE,
  COL.NAME,
  COL.VERSION,
  COL.DIGEST,
  COL.RUN_EXPORT,
  COL.EXPORTS,
  COL.DEPENDENCIES,
  COL.CAPABILITIES,
  COL.SOURCE_REFERENCE,
  COL.ARTIFACT_POINTER,
  COL.CREATED_AT,
];

const COLUMN_COUNT = COLUMN_LIST.length;

const INSERT_COLUMNS = COLUMN_LIST.join(', ');
const INSERT_PLACEHOLDERS = COLUMN_LIST
  .map((_c, i) => `?${i + 1}`)
  .join(', ');

const SELECT_ALL = `${SQL.SELECT} * FROM ${TABLES.MODULE_MANIFESTS}`;

/**
 * Handle module publish command.
 * Validates manifest and produces INSERT SQL.
 * @param {Object} params - Command params with manifest.
 * @return {Object} Result with sql/params or errors.
 */
function handlePublishModule(params) {
  if (!params || !params.manifest) {
    return {
      success: false,
      errors: [META_COMMAND_ERROR_MSG.MANIFEST_REQUIRED],
    };
  }

  const validation = validateModuleManifest(params.manifest);
  if (!validation.valid) {
    return {success: false, errors: validation.errors};
  }

  const row = serializeModuleManifest(params.manifest);
  const sqlParams = COLUMN_LIST.map((col) => row[col]);

  const sql = `${SQL.INSERT_INTO} ${TABLES.MODULE_MANIFESTS}` +
    ` (${INSERT_COLUMNS})` +
    ` ${SQL.VALUES} (${INSERT_PLACEHOLDERS})`;

  return {
    success: true,
    sql,
    params: sqlParams,
    manifest: params.manifest,
  };
}

/**
 * Handle get module command.
 * Validates params and produces SELECT SQL by composite key.
 * @param {Object} params - namespace, name, version.
 * @return {Object} Result with sql/params or errors.
 */
function handleGetModule(params) {
  const errors = [];
  if (!params || !params.namespace) {
    errors.push(META_COMMAND_ERROR_MSG.NAMESPACE_REQUIRED);
  }
  if (!params || !params.name) {
    errors.push(META_COMMAND_ERROR_MSG.NAME_REQUIRED);
  }
  if (!params || !params.version) {
    errors.push(META_COMMAND_ERROR_MSG.VERSION_REQUIRED);
  }
  if (errors.length > 0) {
    return {success: false, errors};
  }

  const sql = `${SELECT_ALL}` +
    ` ${SQL.WHERE} ${COL.NAMESPACE} = ?1` +
    ` ${SQL.AND} ${COL.NAME} = ?2` +
    ` ${SQL.AND} ${COL.VERSION} = ?3`;

  return {
    success: true,
    sql,
    params: [params.namespace, params.name, params.version],
  };
}

/**
 * Handle list modules command.
 * Builds SELECT with optional namespace/name filters.
 * @param {Object} params - Optional namespace, name filters.
 * @return {Object} Result with sql/params.
 */
function handleListModules(params) {
  const filters = [];
  const sqlParams = [];

  if (params && params.namespace) {
    sqlParams.push(params.namespace);
    filters.push(
      `${COL.NAMESPACE} = ?${sqlParams.length}`,
    );
  }
  if (params && params.name) {
    sqlParams.push(params.name);
    filters.push(`${COL.NAME} = ?${sqlParams.length}`);
  }

  let sql = SELECT_ALL;
  if (filters.length > 0) {
    sql += ` ${SQL.WHERE} ${filters.join(` ${SQL.AND} `)}`;
  }

  return {success: true, sql, params: sqlParams};
}

/**
 * Handle get operation command.
 * Validates operationId and returns SQL to fetch a single operation.
 * @param {Object} params - Command params with operationId.
 * @return {Object} Result with sql/params or errors.
 */
function handleGetOperation(params) {
  if (!params || !params.operationId) {
    return {
      success: false,
      errors: [META_COMMAND_ERROR_MSG.OPERATION_ID_REQUIRED],
    };
  }

  const {sql, params: sqlParams} =
    buildGetOperationSQL(params.operationId);
  return {success: true, sql, params: sqlParams};
}

/**
 * Handle list operations command.
 * Returns SQL to list operations with optional filters.
 * @param {Object} params - Optional tenantId and state filters.
 * @return {Object} Result with sql/params.
 */
function handleListOperations(params) {
  const tenantId =
    params && params.tenantId ? params.tenantId : undefined;
  const state =
    params && params.state ? params.state : undefined;
  const {sql, params: sqlParams} =
    buildListOperationsSQL(tenantId, state);
  return {success: true, sql, params: sqlParams};
}

/**
 * Build a standard response envelope for an operation result.
 * @param {Object} operation - Operation row from the database.
 * @param {string} requestId - Caller-supplied request identifier.
 * @return {Object} Frozen response envelope or error result.
 */
function buildOperationResponse(operation, requestId) {
  if (!requestId) {
    return {
      success: false,
      errors: [META_COMMAND_ERROR_MSG.REQUEST_ID_REQUIRED],
    };
  }

  return Object.freeze({
    requestId,
    operationId: operation[WO_COL.OPERATION_ID],
    state: operation[WO_COL.STATE],
    result: operation[WO_COL.RESULT] ?? null,
    error: operation[WO_COL.ERROR] ?? null,
    createdAt: operation[WO_COL.CREATED_AT],
    updatedAt: operation[WO_COL.UPDATED_AT],
  });
}

/**
 * Build a minimal response for async mutation commands.
 * @param {string} operationId - The created operation identifier.
 * @param {string} requestId - Caller-supplied request identifier.
 * @return {Object} Frozen minimal response or error result.
 */
function buildMutationResponse(operationId, requestId) {
  const errors = [];
  if (!operationId) {
    errors.push(META_COMMAND_ERROR_MSG.OPERATION_ID_REQUIRED);
  }
  if (!requestId) {
    errors.push(META_COMMAND_ERROR_MSG.REQUEST_ID_REQUIRED);
  }
  if (errors.length > 0) {
    return {success: false, errors};
  }

  return Object.freeze({
    operationId,
    requestId,
  });
}

export {
  META_COMMAND_ERROR_MSG,
  COLUMN_COUNT,
  handlePublishModule,
  handleGetModule,
  handleListModules,
  handleGetOperation,
  handleListOperations,
  buildOperationResponse,
  buildMutationResponse,
};
