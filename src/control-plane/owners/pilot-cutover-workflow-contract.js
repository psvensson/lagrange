import {createHash} from 'node:crypto';

const HASH_ALGORITHM_SHA256 = 'sha256';
const HASH_ENCODING_HEX = 'hex';
const UTF8_ENCODING = 'utf8';
const COMMA_SPACE = ', ';
const EMPTY_JSON_OBJECT = '{}';
const EMPTY_JSON_ARRAY = '[]';
const PLAN_VERSION_V1 = 1;
const DEFAULT_SAMPLE_RATE = 1;
const DEFAULT_CHECKSUM_METHOD = 'sha256';
const DEFAULT_MAX_REORDER_WINDOW = 0;
const PILOT_CUTOVER_ERROR_NAME = 'PilotCutoverError';
const SQL_IDENTIFIER_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*$/u;
const OP_INSERT = 'INSERT';
const OP_UPDATE = 'UPDATE';
const OP_DELETE = 'DELETE';
const DIVERGENCE_MISSING = 'missing_in_target';
const DIVERGENCE_EXTRA = 'extra_in_target';
const DIVERGENCE_MISMATCH = 'value_mismatch';
const DIALECT_POSTGRESQL = 'postgresql';
const PROBE_ID = '__probe__';
const TIMEOUT_MARKER = 'CUTOVER_SWITCH_TIMED_OUT';

const CUTOVER_TABLES = Object.freeze({
  PLANS: '_pilot_cutover_plans',
  RECEIPTS: '_pilot_cutover_receipts',
  APPLIED_CHANGES: '_pilot_cutover_applied_changes',
  POST_WRITES: '_pilot_cutover_post_writes',
});

const CUTOVER_SQL = Object.freeze({
  CREATE_PLANS:
    `CREATE TABLE IF NOT EXISTS ${CUTOVER_TABLES.PLANS} (` +
    'plan_id TEXT PRIMARY KEY, plan_version INTEGER NOT NULL, ' +
    'plan_json TEXT NOT NULL, sealed_at TEXT NOT NULL)',
  CREATE_RECEIPTS:
    `CREATE TABLE IF NOT EXISTS ${CUTOVER_TABLES.RECEIPTS} (` +
    'receipt_id TEXT PRIMARY KEY, plan_id TEXT NOT NULL, ' +
    'receipt_seq INTEGER NOT NULL, step TEXT NOT NULL, ' +
    'workflow_state TEXT NOT NULL, source_position INTEGER NOT NULL, ' +
    'target_state_digest TEXT NOT NULL, divergence_count INTEGER NOT NULL, ' +
    'divergence_samples_json TEXT NOT NULL, decision TEXT NOT NULL, ' +
    'detail_json TEXT NOT NULL, actor TEXT NOT NULL, created_at TEXT NOT NULL)',
  CREATE_APPLIED_CHANGES:
    `CREATE TABLE IF NOT EXISTS ${CUTOVER_TABLES.APPLIED_CHANGES} (` +
    'dedup_id TEXT PRIMARY KEY, plan_id TEXT NOT NULL, ' +
    'change_id TEXT NOT NULL, source_position INTEGER NOT NULL)',
  CREATE_POST_WRITES:
    `CREATE TABLE IF NOT EXISTS ${CUTOVER_TABLES.POST_WRITES} (` +
    'write_id TEXT PRIMARY KEY, plan_id TEXT NOT NULL, ' +
    'write_seq INTEGER NOT NULL, table_name TEXT NOT NULL, ' +
    'primary_key_value TEXT NOT NULL, operation TEXT NOT NULL, ' +
    'row_json TEXT NOT NULL, recorded_at TEXT NOT NULL)',
  PROBE_PLANS: `SELECT plan_id FROM ${CUTOVER_TABLES.PLANS} WHERE plan_id = $1`,
  PROBE_RECEIPTS: `SELECT receipt_id FROM ${CUTOVER_TABLES.RECEIPTS} WHERE plan_id = $1`,
  PROBE_APPLIED_CHANGES:
    `SELECT dedup_id FROM ${CUTOVER_TABLES.APPLIED_CHANGES} WHERE plan_id = $1`,
  PROBE_POST_WRITES: `SELECT write_id FROM ${CUTOVER_TABLES.POST_WRITES} WHERE plan_id = $1`,
  SELECT_PLAN:
    'SELECT plan_id, plan_version, plan_json, sealed_at ' +
    `FROM ${CUTOVER_TABLES.PLANS} WHERE plan_id = $1`,
  INSERT_PLAN:
    `INSERT INTO ${CUTOVER_TABLES.PLANS} ` +
    '(plan_id, plan_version, plan_json, sealed_at) VALUES ($1, $2, $3, $4)',
  SELECT_RECEIPTS:
    'SELECT receipt_id, plan_id, receipt_seq, step, workflow_state, ' +
    'source_position, target_state_digest, divergence_count, ' +
    'divergence_samples_json, decision, detail_json, actor, created_at ' +
    `FROM ${CUTOVER_TABLES.RECEIPTS} WHERE plan_id = $1 ORDER BY receipt_seq ASC`,
  INSERT_RECEIPT:
    `INSERT INTO ${CUTOVER_TABLES.RECEIPTS} (` +
    'receipt_id, plan_id, receipt_seq, step, workflow_state, ' +
    'source_position, target_state_digest, divergence_count, ' +
    'divergence_samples_json, decision, detail_json, actor, created_at' +
    ') VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)',
  SELECT_APPLIED_CHANGES:
    'SELECT dedup_id, plan_id, change_id, source_position ' +
    `FROM ${CUTOVER_TABLES.APPLIED_CHANGES} WHERE plan_id = $1`,
  INSERT_APPLIED_CHANGE:
    `INSERT INTO ${CUTOVER_TABLES.APPLIED_CHANGES} ` +
    '(dedup_id, plan_id, change_id, source_position) ' +
    'VALUES ($1, $2, $3, $4) ON CONFLICT (dedup_id) DO NOTHING',
  SELECT_POST_WRITES:
    'SELECT write_id, plan_id, write_seq, table_name, primary_key_value, ' +
    'operation, row_json, recorded_at ' +
    `FROM ${CUTOVER_TABLES.POST_WRITES} WHERE plan_id = $1 ORDER BY write_seq ASC`,
  INSERT_POST_WRITE:
    `INSERT INTO ${CUTOVER_TABLES.POST_WRITES} (` +
    'write_id, plan_id, write_seq, table_name, primary_key_value, ' +
    'operation, row_json, recorded_at) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)',
});

const CUTOVER_WORKFLOW_STATE = Object.freeze({
  DRAFT: 'draft',
  LOADING: 'loading',
  SYNCING: 'syncing',
  PARITY: 'parity',
  CUTOVER_PENDING: 'cutover_pending',
  CUTOVER: 'cutover',
  COMPLETE: 'complete',
  ROLLED_BACK: 'rolled_back',
  HALTED: 'halted',
});

const CUTOVER_RECEIPT_STEP = Object.freeze({
  PLAN_SEALED: 'plan_sealed',
  INITIAL_LOAD: 'initial_load',
  CHANGE_FEED: 'change_feed',
  PARITY: 'parity',
  CUTOVER: 'cutover',
  ROLLBACK: 'rollback',
  HALT: 'halt',
});

const CUTOVER_DECISION_VERDICT = Object.freeze({
  SEALED: 'SEALED',
  LOAD_COMPLETED: 'LOAD_COMPLETED',
  SYNC_PROGRESS: 'SYNC_PROGRESS',
  HIGH_WATER_REACHED: 'HIGH_WATER_REACHED',
  PARITY_PASSED: 'PARITY_PASSED',
  PARITY_FAILED: 'PARITY_FAILED',
  SLICE_SWITCHED: 'SLICE_SWITCHED',
  CUTOVER_COMPLETED: 'CUTOVER_COMPLETED',
  CUTOVER_TIMED_OUT: 'CUTOVER_TIMED_OUT',
  ROLLED_BACK: 'ROLLED_BACK',
  HALTED: 'HALTED',
});

const CUTOVER_ERROR_CODE = Object.freeze({
  INVALID_PLAN: 'INVALID_PLAN',
  PLAN_NOT_FOUND: 'PLAN_NOT_FOUND',
  PLAN_IMMUTABLE: 'PLAN_IMMUTABLE',
  ILLEGAL_STATE_TRANSITION: 'ILLEGAL_STATE_TRANSITION',
  INITIAL_LOAD_INCOMPLETE: 'INITIAL_LOAD_INCOMPLETE',
  INVALID_CHANGE_RECORD: 'INVALID_CHANGE_RECORD',
  POSITION_REGRESSION: 'POSITION_REGRESSION',
  OUT_OF_ORDER_CHANGE: 'OUT_OF_ORDER_CHANGE',
  SCHEMA_DRIFT: 'SCHEMA_DRIFT',
  TARGET_OUTAGE: 'TARGET_OUTAGE',
  PARITY_MISMATCH: 'PARITY_MISMATCH',
  PARITY_RECEIPT_REQUIRED: 'PARITY_RECEIPT_REQUIRED',
  CUTOVER_TIMEOUT: 'CUTOVER_TIMEOUT',
  UNKNOWN_TRAFFIC_SLICE: 'UNKNOWN_TRAFFIC_SLICE',
  RECEIPT_DURABILITY_REQUIRED: 'RECEIPT_DURABILITY_REQUIRED',
  DIVERGENCE_ACCOUNTING_REQUIRED: 'DIVERGENCE_ACCOUNTING_REQUIRED',
});

const ALLOWED_CUTOVER_TRANSITIONS = Object.freeze({
  [CUTOVER_WORKFLOW_STATE.DRAFT]: Object.freeze([
    CUTOVER_WORKFLOW_STATE.LOADING,
    CUTOVER_WORKFLOW_STATE.SYNCING,
    CUTOVER_WORKFLOW_STATE.HALTED,
  ]),
  [CUTOVER_WORKFLOW_STATE.LOADING]: Object.freeze([
    CUTOVER_WORKFLOW_STATE.SYNCING,
    CUTOVER_WORKFLOW_STATE.HALTED,
  ]),
  [CUTOVER_WORKFLOW_STATE.SYNCING]: Object.freeze([
    CUTOVER_WORKFLOW_STATE.SYNCING,
    CUTOVER_WORKFLOW_STATE.PARITY,
    CUTOVER_WORKFLOW_STATE.HALTED,
  ]),
  [CUTOVER_WORKFLOW_STATE.PARITY]: Object.freeze([
    CUTOVER_WORKFLOW_STATE.PARITY,
    CUTOVER_WORKFLOW_STATE.CUTOVER_PENDING,
    CUTOVER_WORKFLOW_STATE.HALTED,
  ]),
  [CUTOVER_WORKFLOW_STATE.CUTOVER_PENDING]: Object.freeze([
    CUTOVER_WORKFLOW_STATE.CUTOVER_PENDING,
    CUTOVER_WORKFLOW_STATE.CUTOVER,
    CUTOVER_WORKFLOW_STATE.COMPLETE,
    CUTOVER_WORKFLOW_STATE.ROLLED_BACK,
    CUTOVER_WORKFLOW_STATE.HALTED,
  ]),
  [CUTOVER_WORKFLOW_STATE.CUTOVER]: Object.freeze([
    CUTOVER_WORKFLOW_STATE.CUTOVER,
    CUTOVER_WORKFLOW_STATE.COMPLETE,
    CUTOVER_WORKFLOW_STATE.CUTOVER_PENDING,
    CUTOVER_WORKFLOW_STATE.ROLLED_BACK,
    CUTOVER_WORKFLOW_STATE.HALTED,
  ]),
  [CUTOVER_WORKFLOW_STATE.COMPLETE]: Object.freeze([
    CUTOVER_WORKFLOW_STATE.ROLLED_BACK,
    CUTOVER_WORKFLOW_STATE.HALTED,
  ]),
  [CUTOVER_WORKFLOW_STATE.ROLLED_BACK]: Object.freeze([
    CUTOVER_WORKFLOW_STATE.HALTED,
  ]),
  [CUTOVER_WORKFLOW_STATE.HALTED]: Object.freeze([]),
});

const CHANGE_OPERATION_SET = Object.freeze(new Set([
  OP_INSERT,
  OP_UPDATE,
  OP_DELETE,
]));

const CONTRACT_MESSAGE = Object.freeze({
  PLAN_OBJECT_REQUIRED: 'Migration plan must be a plain object',
  PLAN_VERSION_INVALID: 'Migration planVersion must equal 1',
  PLAN_ID_INVALID: 'Migration plan requires a non-empty planId',
  ENDPOINT_DESCRIPTOR_INVALID:
    'Migration plan requires valid source and target descriptors',
  TABLES_INVALID: 'Migration plan requires at least one valid table spec',
  PARITY_SPEC_INVALID: 'Migration plan requires a valid paritySpec',
  CUTOVER_CRITERIA_INVALID:
    'Migration plan requires valid cutoverCriteria with maxDivergence and highWaterMark',
  ROLLBACK_CRITERIA_INVALID: 'Migration plan requires valid rollbackCriteria',
  TRAFFIC_SLICES_INVALID: 'Migration plan requires non-empty trafficSlices',
  CHANGE_RECORD_INVALID: 'Change-feed record is malformed or incomplete',
  ILLEGAL_TRANSITION_PREFIX: 'Illegal cutover workflow transition',
  SQL_CLIENT_REQUIRED: 'PilotCutoverWorkflowOwner requires a valid sqlClient',
  TARGET_OUTAGE: 'Target write failed after exhausting bounded outage attempts',
});

class PilotCutoverError extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.name = PILOT_CUTOVER_ERROR_NAME;
    this.code = code;
    this.details = Object.freeze({...details});
    if (details.receipt) {
      this.receipt = details.receipt;
    }
    if (details.outstandingDivergence) {
      this.outstandingDivergence = details.outstandingDivergence;
    }
    if (details.activeSlices) {
      this.activeSlices = details.activeSlices;
    }
  }
}

function sha256Hex(payload) {
  return createHash(HASH_ALGORITHM_SHA256)
    .update(String(payload), UTF8_ENCODING)
    .digest(HASH_ENCODING_HEX);
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function isNonEmptyString(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function isNonNegativeSafeInt(value) {
  return Number.isSafeInteger(value) && value >= 0;
}

function assertLegalCutoverTransition(currentStepState, targetStepState) {
  const allowedList = ALLOWED_CUTOVER_TRANSITIONS[currentStepState];
  if (!Array.isArray(allowedList) || !allowedList.includes(targetStepState)) {
    throw new PilotCutoverError(
      CUTOVER_ERROR_CODE.ILLEGAL_STATE_TRANSITION,
      `${CONTRACT_MESSAGE.ILLEGAL_TRANSITION_PREFIX}: ` +
        `${String(currentStepState)} -> ${String(targetStepState)}`,
      {from: currentStepState, to: targetStepState},
    );
  }
}

function normalizeEndpointDescriptor(descriptor, idKey) {
  if (!isPlainObject(descriptor)) {
    throw new PilotCutoverError(
      CUTOVER_ERROR_CODE.INVALID_PLAN,
      CONTRACT_MESSAGE.ENDPOINT_DESCRIPTOR_INVALID,
    );
  }
  const idVal = descriptor[idKey] || descriptor.id || '';
  if (!isNonEmptyString(idVal)) {
    throw new PilotCutoverError(
      CUTOVER_ERROR_CODE.INVALID_PLAN,
      CONTRACT_MESSAGE.ENDPOINT_DESCRIPTOR_INVALID,
    );
  }
  return Object.freeze({[idKey]: idVal.trim()});
}

function isValidTableEntryShape(entry) {
  return isPlainObject(entry) &&
    isNonEmptyString(entry.tableName) &&
    SQL_IDENTIFIER_PATTERN.test(entry.tableName.trim()) &&
    isNonEmptyString(entry.primaryKey) &&
    Array.isArray(entry.columns) &&
    entry.columns.length > 0 &&
    isNonEmptyString(entry.schemaDigest);
}

function normalizeTableDescriptor(entry) {
  if (!isValidTableEntryShape(entry)) {
    throw new PilotCutoverError(
      CUTOVER_ERROR_CODE.INVALID_PLAN,
      CONTRACT_MESSAGE.TABLES_INVALID,
    );
  }
  return Object.freeze({
    tableName: entry.tableName.trim(),
    primaryKey: entry.primaryKey.trim(),
    columns: Object.freeze(entry.columns.map((col) =>
      typeof col === 'string' ? col.trim() : String(col.name).trim())),
    schemaDigest: entry.schemaDigest.trim(),
  });
}

function normalizeParitySpec(paritySpec) {
  if (!isPlainObject(paritySpec) ||
      !Array.isArray(paritySpec.keyRanges) ||
      paritySpec.keyRanges.length === 0) {
    throw new PilotCutoverError(
      CUTOVER_ERROR_CODE.INVALID_PLAN,
      CONTRACT_MESSAGE.PARITY_SPEC_INVALID,
    );
  }
  const keyRanges = paritySpec.keyRanges.map((range) => {
    if (!isPlainObject(range) || range.startKey === undefined || range.startKey === null) {
      throw new PilotCutoverError(
        CUTOVER_ERROR_CODE.INVALID_PLAN,
        CONTRACT_MESSAGE.PARITY_SPEC_INVALID,
      );
    }
    return Object.freeze({startKey: range.startKey, endKey: range.endKey ?? null});
  });
  return Object.freeze({
    keyRanges: Object.freeze(keyRanges),
    sampleRate: typeof paritySpec.sampleRate === 'number' ?
      paritySpec.sampleRate :
      DEFAULT_SAMPLE_RATE,
    checksumMethod: isNonEmptyString(paritySpec.checksumMethod) ?
      paritySpec.checksumMethod.trim() :
      DEFAULT_CHECKSUM_METHOD,
  });
}

function normalizeCutoverCriteria(criteria) {
  if (!isPlainObject(criteria) ||
      !isNonNegativeSafeInt(criteria.maxDivergence) ||
      !isNonNegativeSafeInt(criteria.highWaterMark)) {
    throw new PilotCutoverError(
      CUTOVER_ERROR_CODE.INVALID_PLAN,
      CONTRACT_MESSAGE.CUTOVER_CRITERIA_INVALID,
    );
  }
  return Object.freeze({
    maxDivergence: criteria.maxDivergence,
    highWaterMark: criteria.highWaterMark,
  });
}

function normalizeTrafficSlices(slices) {
  if (!Array.isArray(slices) || slices.length === 0) {
    throw new PilotCutoverError(
      CUTOVER_ERROR_CODE.INVALID_PLAN,
      CONTRACT_MESSAGE.TRAFFIC_SLICES_INVALID,
    );
  }
  const normalized = slices.map((item) => {
    const sliceId = typeof item === 'string' ? item : item?.sliceId;
    if (!isNonEmptyString(sliceId)) {
      throw new PilotCutoverError(
        CUTOVER_ERROR_CODE.INVALID_PLAN,
        CONTRACT_MESSAGE.TRAFFIC_SLICES_INVALID,
      );
    }
    return Object.freeze({
      sliceId: sliceId.trim(),
      description: isPlainObject(item) && isNonEmptyString(item.description) ?
        item.description.trim() :
        sliceId.trim(),
    });
  });
  return Object.freeze(normalized);
}

function validatePlanHeader(plan) {
  if (!isPlainObject(plan)) {
    throw new PilotCutoverError(
      CUTOVER_ERROR_CODE.INVALID_PLAN,
      CONTRACT_MESSAGE.PLAN_OBJECT_REQUIRED,
    );
  }
  if (plan.planVersion !== PLAN_VERSION_V1) {
    throw new PilotCutoverError(
      CUTOVER_ERROR_CODE.INVALID_PLAN,
      CONTRACT_MESSAGE.PLAN_VERSION_INVALID,
    );
  }
  if (!isNonEmptyString(plan.planId)) {
    throw new PilotCutoverError(
      CUTOVER_ERROR_CODE.INVALID_PLAN,
      CONTRACT_MESSAGE.PLAN_ID_INVALID,
    );
  }
  if (!Array.isArray(plan.tables) || plan.tables.length === 0) {
    throw new PilotCutoverError(
      CUTOVER_ERROR_CODE.INVALID_PLAN,
      CONTRACT_MESSAGE.TABLES_INVALID,
    );
  }
}

function validateMigrationPlan(plan) {
  validatePlanHeader(plan);
  const sourceDescriptor = normalizeEndpointDescriptor(
    plan.sourceDescriptor || plan.source,
    'sourceId',
  );
  const targetDescriptor = normalizeEndpointDescriptor(
    plan.targetDescriptor || plan.target,
    'targetId',
  );
  const tables = Object.freeze(plan.tables.map((entry) => normalizeTableDescriptor(entry)));
  const paritySpec = normalizeParitySpec(plan.paritySpec);
  const cutoverCriteria = normalizeCutoverCriteria(plan.cutoverCriteria);
  const rollbackCriteria = isPlainObject(plan.rollbackCriteria) ?
    Object.freeze({...plan.rollbackCriteria}) :
    Object.freeze({});
  const trafficSlices = normalizeTrafficSlices(plan.trafficSlices);
  const maxReorderWindow = isNonNegativeSafeInt(plan.maxReorderWindow) ?
    plan.maxReorderWindow :
    DEFAULT_MAX_REORDER_WINDOW;

  return Object.freeze({
    planId: plan.planId.trim(),
    planVersion: PLAN_VERSION_V1,
    sourceDescriptor,
    targetDescriptor,
    tables,
    paritySpec,
    cutoverCriteria,
    rollbackCriteria,
    trafficSlices,
    maxReorderWindow,
  });
}

function validateChangeFeedRecord(record) {
  if (!isPlainObject(record) ||
      !isNonEmptyString(record.changeId) ||
      !isNonNegativeSafeInt(record.sourcePosition) ||
      !isNonEmptyString(record.table)) {
    throw new PilotCutoverError(
      CUTOVER_ERROR_CODE.INVALID_CHANGE_RECORD,
      CONTRACT_MESSAGE.CHANGE_RECORD_INVALID,
    );
  }
  const operation = isNonEmptyString(record.operation) ?
    record.operation.trim().toUpperCase() :
    '';
  const rowPayload = record.row || record.rowImage;
  if (!CHANGE_OPERATION_SET.has(operation) || !isPlainObject(rowPayload)) {
    throw new PilotCutoverError(
      CUTOVER_ERROR_CODE.INVALID_CHANGE_RECORD,
      CONTRACT_MESSAGE.CHANGE_RECORD_INVALID,
    );
  }
  return Object.freeze({
    changeId: record.changeId.trim(),
    sourcePosition: record.sourcePosition,
    table: record.table.trim(),
    operation,
    row: Object.freeze({...rowPayload}),
    schemaDigest: isNonEmptyString(record.schemaDigest) ?
      record.schemaDigest.trim() :
      null,
    outOfOrder: Boolean(record.outOfOrder),
  });
}

function normalizeReceiptRow(row) {
  const sampleRefs = JSON.parse(String(row.divergence_samples_json || EMPTY_JSON_ARRAY));
  const detail = JSON.parse(String(row.detail_json || EMPTY_JSON_OBJECT));
  return Object.freeze({
    receiptId: String(row.receipt_id),
    planId: String(row.plan_id),
    receiptSeq: Number(row.receipt_seq),
    step: String(row.step),
    workflowState: String(row.workflow_state),
    sourcePosition: Number(row.source_position),
    targetStateDigest: String(row.target_state_digest),
    outstandingDivergence: Object.freeze({
      count: Number(row.divergence_count),
      sampleRefs: Object.freeze(sampleRefs),
    }),
    decision: String(row.decision),
    detail: Object.freeze(detail),
    actor: String(row.actor),
    timestamp: String(row.created_at),
  });
}

function normalizePostWriteRow(row) {
  return Object.freeze({
    writeId: String(row.write_id),
    planId: String(row.plan_id),
    writeSeq: Number(row.write_seq),
    tableName: String(row.table_name),
    primaryKeyValue: String(row.primary_key_value),
    operation: String(row.operation),
    row: Object.freeze(JSON.parse(String(row.row_json || EMPTY_JSON_OBJECT))),
    recordedAt: String(row.recorded_at),
  });
}

function buildDmlForChangeRecord(tableSpec, record) {
  const {tableName, primaryKey, columns} = tableSpec;
  const row = record.row;
  if (record.operation === OP_DELETE) {
    return {
      sql: `DELETE FROM ${tableName} WHERE ${primaryKey} = $1`,
      params: [row[primaryKey]],
    };
  }
  if (record.operation === OP_UPDATE) {
    const updateCols = columns.filter((col) => col !== primaryKey && Object.hasOwn(row, col));
    const assignments = updateCols.map((col, idx) => `${col} = $${idx + 1}`);
    const params = updateCols.map((col) => row[col]);
    params.push(row[primaryKey]);
    return {
      sql: `UPDATE ${tableName} SET ${assignments.join(COMMA_SPACE)} WHERE ${primaryKey} = $${params.length}`,
      params,
    };
  }
  const insertCols = columns.filter((col) => Object.hasOwn(row, col));
  const placeholders = insertCols.map((_, idx) => `$${idx + 1}`);
  const params = insertCols.map((col) => row[col]);
  return {
    sql: `INSERT INTO ${tableName} (${insertCols.join(COMMA_SPACE)}) ` +
      `VALUES (${placeholders.join(COMMA_SPACE)}) ON CONFLICT (${primaryKey}) DO NOTHING`,
    params,
  };
}

function compareKeys(left, right) {
  const leftNum = Number(left);
  const rightNum = Number(right);
  if (Number.isFinite(leftNum) && Number.isFinite(rightNum)) {
    return leftNum - rightNum;
  }
  return String(left).localeCompare(String(right));
}

function canonicalizeRowByColumns(rawRow, columns) {
  const obj = {};
  for (const col of columns) {
    const val = rawRow[col];
    obj[col] = val === undefined ? null : val;
  }
  return obj;
}

function classifySingleKeyDivergence(tableName, range, key, sVal, tVal) {
  if (sVal && !tVal) {
    return Object.freeze({
      table: tableName,
      range: Object.freeze({...range}),
      key,
      mismatchType: DIVERGENCE_MISSING,
    });
  }
  if (!sVal && tVal) {
    return Object.freeze({
      table: tableName,
      range: Object.freeze({...range}),
      key,
      mismatchType: DIVERGENCE_EXTRA,
    });
  }
  if (JSON.stringify(sVal) !== JSON.stringify(tVal)) {
    return Object.freeze({
      table: tableName,
      range: Object.freeze({...range}),
      key,
      mismatchType: DIVERGENCE_MISMATCH,
    });
  }
  return null;
}

function diffRangeRows(tableSpec, range, sourceRows, targetRows) {
  const pk = tableSpec.primaryKey;
  const cols = tableSpec.columns;
  const sourceByPk = new Map(
    sourceRows.map((r) => [String(r[pk]), canonicalizeRowByColumns(r, cols)]),
  );
  const targetByPk = new Map(
    targetRows.map((r) => [String(r[pk]), canonicalizeRowByColumns(r, cols)]),
  );
  const allKeys = [...new Set([...sourceByPk.keys(), ...targetByPk.keys()])].sort(compareKeys);
  const divergences = [];

  for (const key of allKeys) {
    const div = classifySingleKeyDivergence(
      tableSpec.tableName,
      range,
      key,
      sourceByPk.get(key),
      targetByPk.get(key),
    );
    if (div) {
      divergences.push(div);
    }
  }
  const targetOrderedRows = allKeys.map((k) => targetByPk.get(k)).filter(Boolean);
  return {
    divergences,
    targetRangeDigest: sha256Hex(JSON.stringify(targetOrderedRows)),
  };
}

function isValidSqlClient(sqlClient) {
  return Boolean(sqlClient) && (
    typeof sqlClient.execute === 'function' ||
    typeof sqlClient.executeQuery === 'function' ||
    typeof sqlClient.query === 'function'
  );
}

async function dispatchSqlCall(sqlClient, sql, params, execOpts) {
  if (typeof sqlClient.execute === 'function') {
    return sqlClient.execute(sql, params, execOpts);
  }
  if (typeof sqlClient.executeQuery === 'function') {
    return sqlClient.executeQuery(sql, params, execOpts);
  }
  return sqlClient.query(sql, params);
}

async function runSql(sqlClient, sql, params = [], options = {}) {
  if (!isValidSqlClient(sqlClient)) {
    throw new PilotCutoverError(
      CUTOVER_ERROR_CODE.TARGET_OUTAGE,
      CONTRACT_MESSAGE.SQL_CLIENT_REQUIRED,
    );
  }
  const execOpts = {dialect: DIALECT_POSTGRESQL, ...options};
  const res = await dispatchSqlCall(sqlClient, sql, params, execOpts);
  if (res?.success === false) {
    throw new Error(res.error || CONTRACT_MESSAGE.TARGET_OUTAGE);
  }
  return {rows: Array.isArray(res?.rows) ? res.rows : []};
}

async function ensureSingleTable(sqlClient, createSql, probeSql) {
  try {
    await runSql(sqlClient, createSql, []);
  } catch {
    await runSql(sqlClient, probeSql, [PROBE_ID]);
  }
}

async function ensureCutoverWorkflowTables(sqlClient) {
  await ensureSingleTable(sqlClient, CUTOVER_SQL.CREATE_PLANS, CUTOVER_SQL.PROBE_PLANS);
  await ensureSingleTable(sqlClient, CUTOVER_SQL.CREATE_RECEIPTS, CUTOVER_SQL.PROBE_RECEIPTS);
  await ensureSingleTable(
    sqlClient,
    CUTOVER_SQL.CREATE_APPLIED_CHANGES,
    CUTOVER_SQL.PROBE_APPLIED_CHANGES,
  );
  await ensureSingleTable(sqlClient, CUTOVER_SQL.CREATE_POST_WRITES, CUTOVER_SQL.PROBE_POST_WRITES);
}

function deriveActiveSlicesFromReceipts(receipts) {
  let active = [];
  for (const receipt of receipts) {
    if (Array.isArray(receipt.detail?.activeSlices)) {
      active = [...receipt.detail.activeSlices];
    }
  }
  return Object.freeze(active);
}

function findLatestParityReceipt(receipts) {
  for (let idx = receipts.length - 1; idx >= 0; idx -= 1) {
    if (receipts[idx].step === CUTOVER_RECEIPT_STEP.PARITY) {
      return receipts[idx];
    }
  }
  return null;
}

async function queryRangeRows(client, tableSpec, range) {
  const colList = tableSpec.columns.join(COMMA_SPACE);
  const pk = tableSpec.primaryKey;
  const hasEnd = range.endKey !== null && range.endKey !== undefined;
  const sql = hasEnd ?
    `SELECT ${colList} FROM ${tableSpec.tableName} ` +
      `WHERE ${pk} >= $1 AND ${pk} < $2 ORDER BY ${pk} ASC` :
    `SELECT ${colList} FROM ${tableSpec.tableName} WHERE ${pk} >= $1 ORDER BY ${pk} ASC`;
  const params = hasEnd ? [range.startKey, range.endKey] : [range.startKey];
  const {rows} = await runSql(client, sql, params);
  return rows;
}

async function invokeSwitchWithLimit(switchTraffic, payload, limitMs) {
  if (typeof switchTraffic !== 'function') {
    return {timedOut: false};
  }
  let timerHandle = null;
  const timerPromise = new Promise((_, reject) => {
    timerHandle = setTimeout(() => reject(new Error(TIMEOUT_MARKER)), limitMs);
  });
  try {
    const outcome = await Promise.race([Promise.resolve(switchTraffic(payload)), timerPromise]);
    return {timedOut: outcome?.timedOut === true};
  } catch (err) {
    if (err?.message === TIMEOUT_MARKER || err?.code === TIMEOUT_MARKER) {
      return {timedOut: true};
    }
    throw err;
  } finally {
    if (timerHandle !== null) {
      clearTimeout(timerHandle);
    }
  }
}

export {
  ALLOWED_CUTOVER_TRANSITIONS,
  CUTOVER_DECISION_VERDICT,
  CUTOVER_ERROR_CODE,
  CUTOVER_RECEIPT_STEP,
  CUTOVER_SQL,
  CUTOVER_TABLES,
  CUTOVER_WORKFLOW_STATE,
  PilotCutoverError,
  assertLegalCutoverTransition,
  buildDmlForChangeRecord,
  deriveActiveSlicesFromReceipts,
  diffRangeRows,
  ensureCutoverWorkflowTables,
  findLatestParityReceipt,
  invokeSwitchWithLimit,
  normalizePostWriteRow,
  normalizeReceiptRow,
  queryRangeRows,
  runSql,
  sha256Hex,
  validateChangeFeedRecord,
  validateMigrationPlan,
};
