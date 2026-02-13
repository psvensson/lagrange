/**
 * Operation lifecycle manager for wasm_operations.
 * Creates, transitions, and builds SQL for persisting
 * async operation state. All writes go through SQL engine.
 *
 * Requirements: 8.1, 8.3
 */

import {v4 as uuidv4} from 'uuid';
import {NUM, SQL, TABLES, WASM_OPERATION_STATE} from '../constants/index.js';
import {validateWasmOperation} from './wasm-meta-models.js';
import {
  WASM_OPERATION_COL as WO_COL,
  WASM_OPERATION_FIELD as WO,
} from './wasm-meta-models-constants.js';

const OPERATION_LIFECYCLE_ERROR_MSG = Object.freeze({
  TENANT_ID_REQUIRED: 'Tenant ID is required',
  COMMAND_REQUIRED: 'Command is required',
  OPERATION_ID_REQUIRED: 'Operation ID is required',
  INVALID_TRANSITION: 'Invalid state transition',
  IDEMPOTENCY_KEY_REQUIRED:
    'Idempotency key is required for dedupe check',
});

const VALID_TRANSITIONS = Object.freeze({
  [WASM_OPERATION_STATE.PENDING]: [
    WASM_OPERATION_STATE.IN_PROGRESS,
    WASM_OPERATION_STATE.CANCELLED,
  ],
  [WASM_OPERATION_STATE.IN_PROGRESS]: [
    WASM_OPERATION_STATE.COMPLETED,
    WASM_OPERATION_STATE.FAILED,
    WASM_OPERATION_STATE.CANCELLED,
  ],
});

const INSERT_COLUMNS = [
  WO_COL.OPERATION_ID,
  WO_COL.TENANT_ID,
  WO_COL.COMMAND,
  WO_COL.IDEMPOTENCY_KEY,
  WO_COL.STATE,
  WO_COL.RESULT,
  WO_COL.ERROR,
  WO_COL.CREATED_AT,
  WO_COL.UPDATED_AT,
];

const TERMINAL_STATES = new Set([
  WASM_OPERATION_STATE.COMPLETED,
  WASM_OPERATION_STATE.FAILED,
  WASM_OPERATION_STATE.CANCELLED,
]);

/**
 * Create a new operation with PENDING state.
 * @param {string} tenantId - Tenant identifier.
 * @param {string} command - Command name.
 * @param {string|null} [idempotencyKey] - Optional idempotency key.
 * @return {{success: boolean, operation?: Object, sql?: string,
 *   params?: Array, errors?: string[]}}
 */
function createOperation(tenantId, command, idempotencyKey) {
  const errors = [];
  if (!tenantId) {
    errors.push(OPERATION_LIFECYCLE_ERROR_MSG.TENANT_ID_REQUIRED);
  }
  if (!command) {
    errors.push(OPERATION_LIFECYCLE_ERROR_MSG.COMMAND_REQUIRED);
  }
  if (errors.length > NUM.ZERO) {
    return {success: false, errors};
  }

  const now = Date.now();
  const operation = {
    [WO.OPERATION_ID]: uuidv4(),
    [WO.TENANT_ID]: tenantId,
    [WO.COMMAND]: command,
    [WO.IDEMPOTENCY_KEY]: idempotencyKey ?? null,
    [WO.STATE]: WASM_OPERATION_STATE.PENDING,
    [WO.RESULT]: null,
    [WO.ERROR]: null,
    createdAt: now,
    updatedAt: now,
  };

  const validation = validateWasmOperation(operation);
  if (!validation.valid) {
    return {success: false, errors: validation.errors};
  }

  const placeholders = INSERT_COLUMNS
    .map((_col, i) => `$${i + NUM.ONE}`)
    .join(', ');
  const sql = `${SQL.INSERT_INTO} ${TABLES.WASM_OPERATIONS}` +
    ` (${INSERT_COLUMNS.join(', ')})` +
    ` ${SQL.VALUES} (${placeholders})`;

  const params = [
    operation[WO.OPERATION_ID],
    operation[WO.TENANT_ID],
    operation[WO.COMMAND],
    operation[WO.IDEMPOTENCY_KEY],
    operation[WO.STATE],
    JSON.stringify(operation[WO.RESULT] || {}),
    JSON.stringify(operation[WO.ERROR] || {}),
    operation.createdAt,
    operation.updatedAt,
  ];

  return {success: true, operation, sql, params};
}

/**
 * Transition an operation between states.
 * @param {string} operationId - Operation identifier.
 * @param {string} fromState - Current state.
 * @param {string} toState - Target state.
 * @param {*} [resultOrError] - Result or error payload.
 * @return {{success: boolean, sql?: string, params?: Array,
 *   errors?: string[]}}
 */
function transitionOperation(
  operationId, fromState, toState, resultOrError,
) {
  const errors = [];
  if (!operationId) {
    errors.push(
      OPERATION_LIFECYCLE_ERROR_MSG.OPERATION_ID_REQUIRED,
    );
    return {success: false, errors};
  }

  const allowed = VALID_TRANSITIONS[fromState];
  if (!allowed || !allowed.includes(toState)) {
    errors.push(
      OPERATION_LIFECYCLE_ERROR_MSG.INVALID_TRANSITION,
    );
    return {success: false, errors};
  }

  const now = Date.now();
  const setClauses = [
    `${WO_COL.STATE} = $1`,
    `${WO_COL.UPDATED_AT} = $2`,
  ];
  const params = [toState, now];

  if (toState === WASM_OPERATION_STATE.COMPLETED) {
    setClauses.push(
      `${WO_COL.RESULT} = $${params.length + NUM.ONE}`,
    );
    params.push(JSON.stringify(resultOrError || {}));
  } else if (TERMINAL_STATES.has(toState) &&
    toState !== WASM_OPERATION_STATE.COMPLETED) {
    setClauses.push(
      `${WO_COL.ERROR} = $${params.length + NUM.ONE}`,
    );
    params.push(JSON.stringify(resultOrError || {}));
  }

  params.push(operationId, fromState);
  const idIdx = params.length - NUM.ONE;
  const stateIdx = params.length;

  const sql = `${SQL.UPDATE} ${TABLES.WASM_OPERATIONS}` +
    ` ${SQL.SET} ${setClauses.join(', ')}` +
    ` ${SQL.WHERE} ${WO_COL.OPERATION_ID} = $${idIdx}` +
    ` ${SQL.AND} ${WO_COL.STATE} = $${stateIdx}`;

  return {success: true, sql, params};
}

/**
 * Build SQL to fetch a single operation by ID.
 * @param {string} operationId - Operation identifier.
 * @return {{sql: string, params: Array}}
 */
function buildGetOperationSQL(operationId) {
  const sql = `${SQL.SELECT} * FROM ${TABLES.WASM_OPERATIONS}` +
    ` ${SQL.WHERE} ${WO_COL.OPERATION_ID} = $1`;
  return {sql, params: [operationId]};
}

/**
 * Build SQL to list operations with optional filters.
 * @param {string} [tenantId] - Optional tenant filter.
 * @param {string} [state] - Optional state filter.
 * @return {{sql: string, params: Array}}
 */
function buildListOperationsSQL(tenantId, state) {
  let sql =
    `${SQL.SELECT} * FROM ${TABLES.WASM_OPERATIONS}`;
  const conditions = [];
  const params = [];

  if (tenantId) {
    params.push(tenantId);
    conditions.push(
      `${WO_COL.TENANT_ID} = $${params.length}`,
    );
  }
  if (state) {
    params.push(state);
    conditions.push(
      `${WO_COL.STATE} = $${params.length}`,
    );
  }

  if (conditions.length > NUM.ZERO) {
    sql += ` ${SQL.WHERE} ${conditions.join(` ${SQL.AND} `)}`;
  }

  return {sql, params};
}

/**
 * Build SQL to check for an existing operation by idempotency key.
 * @param {string} tenantId - Tenant identifier.
 * @param {string} idempotencyKey - Idempotency key to check.
 * @return {{success: boolean, sql?: string, params?: Array,
 *   errors?: string[]}}
 */
function buildIdempotencyCheckSQL(tenantId, idempotencyKey) {
  const errors = [];
  if (!tenantId) {
    errors.push(
      OPERATION_LIFECYCLE_ERROR_MSG.TENANT_ID_REQUIRED,
    );
  }
  if (!idempotencyKey) {
    errors.push(
      OPERATION_LIFECYCLE_ERROR_MSG.IDEMPOTENCY_KEY_REQUIRED,
    );
  }
  if (errors.length > NUM.ZERO) {
    return {success: false, errors};
  }

  const sql = `${SQL.SELECT} * FROM ${TABLES.WASM_OPERATIONS}` +
    ` ${SQL.WHERE} ${WO_COL.TENANT_ID} = $1` +
    ` ${SQL.AND} ${WO_COL.IDEMPOTENCY_KEY} = $2`;

  return {success: true, sql, params: [tenantId, idempotencyKey]};
}

export {
  OPERATION_LIFECYCLE_ERROR_MSG,
  VALID_TRANSITIONS,
  createOperation,
  transitionOperation,
  buildGetOperationSQL,
  buildListOperationsSQL,
  buildIdempotencyCheckSQL,
};
