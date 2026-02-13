/**
 * Command handlers for sys-wasm-meta service.
 * Each handler validates input and returns SQL statements
 * for the caller to execute. No direct SQL execution.
 *
 * Requirements: 2.1, 3.1, 3.5
 */

import {SQL, TABLES, NUM, SERVICE_PROFILE} from '../constants/index.js';
import {
  MODULE_MANIFEST_COL as COL,
} from './module-manifest-constants.js';
import {
  validateModuleManifest,
  serializeModuleManifest,
} from './module-manifest-models.js';
import {
  SD_COL,
  SERVICE_DEFINITION_COLUMN_LIST,
  serializeServiceDefinition,
} from './wasm-service-models.js';
import {
  WASM_SERVICE_DEFINITION_STATUS,
} from './wasm-service-constants.js';
import {
  buildGetOperationSQL,
  buildListOperationsSQL,
} from './operation-lifecycle.js';
import {
  WASM_OPERATION_COL as WO_COL,
} from './wasm-meta-models-constants.js';
import {
  validateRuntimeDescriptor,
} from './runtime-descriptor-validator.js';

const META_COMMAND_ERROR_MSG = Object.freeze({
  MANIFEST_REQUIRED: 'Manifest is required for publish',
  NAMESPACE_REQUIRED: 'Namespace is required',
  NAME_REQUIRED: 'Name is required',
  VERSION_REQUIRED: 'Version is required',
  SERVICE_ID_REQUIRED: 'Service ID is required',
  SERVICE_NAME_REQUIRED: 'Service name is required',
  HANDLER_FUNCTION_REQUIRED: 'Handler function ID is required',
  REPLICA_COUNT_ODD: 'Replica count must be an odd number >= 3',
  RUNTIME_DESCRIPTOR_INVALID: 'Runtime descriptor is invalid',
  RUNTIME_KIND_REQUIRED_FOR_UPDATE:
    'runtimeKind is required when updating runtime descriptor fields',
  NO_FIELDS_TO_UPDATE: 'No fields provided to update',
  REPLICA_COUNT_REQUIRED: 'Replica count is required for scale',
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
  .map((_c, i) => `?${i + NUM.ONE}`)
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
  if (errors.length > NUM.ZERO) {
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
  if (filters.length > NUM.ZERO) {
    sql += ` ${SQL.WHERE} ${filters.join(` ${SQL.AND} `)}`;
  }

  return {success: true, sql, params: sqlParams};
}

const SD_INSERT_COLUMNS = SERVICE_DEFINITION_COLUMN_LIST.join(', ');
const SD_INSERT_PLACEHOLDERS = SERVICE_DEFINITION_COLUMN_LIST
  .map((_c, i) => `?${i + NUM.ONE}`)
  .join(', ');

/**
 * Validate that replicaCount is an odd number >= 3.
 * @param {number} count - Replica count to validate.
 * @return {boolean} True if valid.
 */
function isValidReplicaCount(count) {
  return Number.isInteger(count) &&
    count >= NUM.THREE &&
    count % NUM.TWO !== NUM.ZERO;
}

/**
 * Handle create service command.
 * Validates params and produces INSERT SQL for service_definitions.
 * @param {Object} params - Service definition params.
 * @return {Object} Result with sql/params or errors.
 */
function handleCreateService(params) {
  const errors = [];
  if (!params || !params.serviceId) {
    errors.push(META_COMMAND_ERROR_MSG.SERVICE_ID_REQUIRED);
  }
  if (!params || !params.serviceName) {
    errors.push(META_COMMAND_ERROR_MSG.SERVICE_NAME_REQUIRED);
  }
  const isSqlEngine = params &&
    params.serviceProfile === SERVICE_PROFILE.SQL_ENGINE;
  if (!isSqlEngine && (!params || !params.handlerFunctionId)) {
    errors.push(META_COMMAND_ERROR_MSG.HANDLER_FUNCTION_REQUIRED);
  }
  if (params && params.replicaCount !== undefined &&
      !isValidReplicaCount(params.replicaCount)) {
    errors.push(META_COMMAND_ERROR_MSG.REPLICA_COUNT_ODD);
  }
  if (errors.length > NUM.ZERO) {
    return {success: false, errors};
  }

  const row = serializeServiceDefinition(params);
  const descriptorResult = validateRuntimeDescriptor({
    runtimeKind: row[SD_COL.RUNTIME_KIND],
    runtimeRef: row[SD_COL.RUNTIME_REF],
    runtimeConfig: row[SD_COL.RUNTIME_CONFIG],
  });
  if (!descriptorResult.valid) {
    return {
      success: false,
      errors: [
        META_COMMAND_ERROR_MSG.RUNTIME_DESCRIPTOR_INVALID,
        ...descriptorResult.errors,
      ],
    };
  }
  const sqlParams = SERVICE_DEFINITION_COLUMN_LIST
    .map((col) => row[col]);

  const sql = `${SQL.INSERT_INTO} ${TABLES.SERVICE_DEFINITIONS}` +
    ` (${SD_INSERT_COLUMNS})` +
    ` ${SQL.VALUES} (${SD_INSERT_PLACEHOLDERS})`;

  return {
    success: true,
    sql,
    params: sqlParams,
    serviceId: params.serviceId,
  };
}

/** Updatable fields mapping from param name to column name. */
const UPDATABLE_FIELDS = Object.freeze({
  serviceProfile: SD_COL.SERVICE_PROFILE,
  handlerFunctionId: SD_COL.HANDLER_FUNCTION_ID,
  runtimeKind: SD_COL.RUNTIME_KIND,
  runtimeRef: SD_COL.RUNTIME_REF,
  runtimeConfig: SD_COL.RUNTIME_CONFIG,
  readConsistency: SD_COL.READ_CONSISTENCY,
  writeConsistency: SD_COL.WRITE_CONSISTENCY,
  resourceBudget: SD_COL.RESOURCE_BUDGET,
  safetyIntervalMs: SD_COL.SAFETY_INTERVAL_MS,
});

/**
 * Handle update service command.
 * Validates params and produces UPDATE SQL for service_definitions.
 * @param {Object} params - Fields to update plus serviceId.
 * @return {Object} Result with sql/params or errors.
 */
function handleUpdateService(params) {
  if (!params || !params.serviceId) {
    return {
      success: false,
      errors: [META_COMMAND_ERROR_MSG.SERVICE_ID_REQUIRED],
    };
  }

  const hasRuntimeField =
    params.runtimeKind !== undefined ||
    params.runtimeRef !== undefined ||
    params.runtimeConfig !== undefined;
  if (hasRuntimeField && params.runtimeKind === undefined) {
    return {
      success: false,
      errors: [META_COMMAND_ERROR_MSG.RUNTIME_KIND_REQUIRED_FOR_UPDATE],
    };
  }
  if (hasRuntimeField) {
    const runtimeConfig = typeof params.runtimeConfig === 'object' &&
      params.runtimeConfig !== null ?
      JSON.stringify(params.runtimeConfig) :
      params.runtimeConfig;
    const descriptorResult = validateRuntimeDescriptor({
      runtimeKind: params.runtimeKind,
      runtimeRef: params.runtimeRef ?? null,
      runtimeConfig: runtimeConfig ?? null,
    });
    if (!descriptorResult.valid) {
      return {
        success: false,
        errors: [
          META_COMMAND_ERROR_MSG.RUNTIME_DESCRIPTOR_INVALID,
          ...descriptorResult.errors,
        ],
      };
    }
  }

  const setClauses = [];
  const sqlParams = [];

  const fieldKeys = Object.keys(UPDATABLE_FIELDS);
  for (let i = NUM.ZERO; i < fieldKeys.length; i++) {
    const key = fieldKeys[i];
    if (params[key] !== undefined) {
      const value = key === 'resourceBudget' ?
        JSON.stringify(params[key]) :
        key === 'runtimeConfig' &&
            typeof params[key] === 'object' &&
            params[key] !== null ?
              JSON.stringify(params[key]) :
              params[key];
      sqlParams.push(value);
      setClauses.push(
        `${UPDATABLE_FIELDS[key]} = ?${sqlParams.length}`,
      );
    }
  }

  if (setClauses.length === NUM.ZERO) {
    return {
      success: false,
      errors: [META_COMMAND_ERROR_MSG.NO_FIELDS_TO_UPDATE],
    };
  }

  sqlParams.push(Date.now());
  setClauses.push(
    `${SD_COL.UPDATED_AT} = ?${sqlParams.length}`,
  );

  sqlParams.push(params.serviceId);
  const whereIdx = sqlParams.length;

  const sql = `${SQL.UPDATE} ${TABLES.SERVICE_DEFINITIONS}` +
    ` ${SQL.SET} ${setClauses.join(', ')}` +
    ` ${SQL.WHERE} ${SD_COL.SERVICE_ID} = ?${whereIdx}`;

  return {
    success: true,
    sql,
    params: sqlParams,
    serviceId: params.serviceId,
  };
}

/**
 * Handle scale service command.
 * Validates params and produces UPDATE SQL for replica_count.
 * @param {Object} params - serviceId and replicaCount.
 * @return {Object} Result with sql/params or errors.
 */
function handleScaleService(params) {
  const errors = [];
  if (!params || !params.serviceId) {
    errors.push(META_COMMAND_ERROR_MSG.SERVICE_ID_REQUIRED);
  }
  if (!params || params.replicaCount === undefined) {
    errors.push(META_COMMAND_ERROR_MSG.REPLICA_COUNT_REQUIRED);
  } else if (!isValidReplicaCount(params.replicaCount)) {
    errors.push(META_COMMAND_ERROR_MSG.REPLICA_COUNT_ODD);
  }
  if (errors.length > NUM.ZERO) {
    return {success: false, errors};
  }

  const now = Date.now();
  const sqlParams = [params.replicaCount, now, params.serviceId];

  const sql = `${SQL.UPDATE} ${TABLES.SERVICE_DEFINITIONS}` +
    ` ${SQL.SET} ${SD_COL.REPLICA_COUNT} = ?1,` +
    ` ${SD_COL.UPDATED_AT} = ?2` +
    ` ${SQL.WHERE} ${SD_COL.SERVICE_ID} = ?3`;

  return {
    success: true,
    sql,
    params: sqlParams,
    serviceId: params.serviceId,
  };
}

/**
 * Handle delete service command (soft delete).
 * Sets status to inactive.
 * @param {Object} params - serviceId.
 * @return {Object} Result with sql/params or errors.
 */
function handleDeleteService(params) {
  if (!params || !params.serviceId) {
    return {
      success: false,
      errors: [META_COMMAND_ERROR_MSG.SERVICE_ID_REQUIRED],
    };
  }

  const now = Date.now();
  const sqlParams = [
    WASM_SERVICE_DEFINITION_STATUS.INACTIVE,
    now,
    params.serviceId,
  ];

  const sql = `${SQL.UPDATE} ${TABLES.SERVICE_DEFINITIONS}` +
    ` ${SQL.SET} ${SD_COL.STATUS} = ?1,` +
    ` ${SD_COL.UPDATED_AT} = ?2` +
    ` ${SQL.WHERE} ${SD_COL.SERVICE_ID} = ?3`;

  return {
    success: true,
    sql,
    params: sqlParams,
    serviceId: params.serviceId,
  };
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
  if (errors.length > NUM.ZERO) {
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
  handleCreateService,
  handleUpdateService,
  handleScaleService,
  handleDeleteService,
  handleGetOperation,
  handleListOperations,
  buildOperationResponse,
  buildMutationResponse,
};
