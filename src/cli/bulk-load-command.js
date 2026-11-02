import {createHash} from 'node:crypto';
import {
  BULK_LOAD_ERROR_CODE,
  BulkLoadError,
  computeBatchChecksum,
  computeSchemaDigest,
  computeSourceDigest,
  readBoundedNdjsonBatches,
  validateLoadManifest,
} from './bulk-load-manifest-contract.js';

const HASH_ALGORITHM_SHA256 = 'sha256';
const HASH_ENCODING_HEX = 'hex';
const UTF8_ENCODING = 'utf8';
const NEWLINE_CHAR = '\n';
const CARRIAGE_RETURN_CHAR = '\r';
const COMMA_SPACE = ', ';
const FALSE_TEXT = 'false';
const DIALECT_POSTGRESQL = 'postgresql';
const KEY_SEP = ':';
const BATCH_TAG = 'batch';
const PK_TAG = 'pk';
const PROBE_LOAD_ID = '__probe__';
const FAULT_STAGE_AFTER_ROW_WRITE = 'after_row_write';
const FAULT_STAGE_AFTER_BATCH_TARGET_WRITE = 'after_batch_target_write';
const FAULT_STAGE_AFTER_CHECKPOINT_WRITE = 'after_checkpoint_write';
const BOOLEAN_TYPE_SET = Object.freeze(new Set(['BOOLEAN', 'BOOL']));
const INTEGER_TYPE_SET = Object.freeze(new Set(['INTEGER', 'INT', 'BIGINT']));
const REAL_TYPE_SET = Object.freeze(new Set(['REAL', 'FLOAT', 'DOUBLE', 'NUMERIC']));

const BULK_LOAD_TABLES = Object.freeze({
  CHECKPOINTS: '_bulk_load_checkpoints',
  REJECTS: '_bulk_load_rejects',
});

const SQL_STATEMENTS = Object.freeze({
  CREATE_CHECKPOINTS:
    `CREATE TABLE IF NOT EXISTS ${BULK_LOAD_TABLES.CHECKPOINTS} (` +
    'checkpoint_id TEXT PRIMARY KEY, load_id TEXT NOT NULL, ' +
    'checkpoint_seq INTEGER NOT NULL, byte_offset INTEGER NOT NULL, ' +
    'record_index INTEGER NOT NULL, batch_byte_offset INTEGER NOT NULL, ' +
    'batch_record_index INTEGER NOT NULL, rows_applied INTEGER NOT NULL, ' +
    'rows_rejected INTEGER NOT NULL, batch_checksum TEXT NOT NULL, ' +
    'schema_digest TEXT NOT NULL)',
  CREATE_REJECTS:
    `CREATE TABLE IF NOT EXISTS ${BULK_LOAD_TABLES.REJECTS} (` +
    'reject_id TEXT PRIMARY KEY, load_id TEXT NOT NULL, ' +
    'record_index INTEGER NOT NULL, checkpoint_seq INTEGER NOT NULL, ' +
    'reason_code TEXT NOT NULL, excerpt TEXT NOT NULL)',
  PROBE_CHECKPOINTS:
    `SELECT checkpoint_id FROM ${BULK_LOAD_TABLES.CHECKPOINTS} WHERE load_id = $1`,
  PROBE_REJECTS:
    `SELECT reject_id FROM ${BULK_LOAD_TABLES.REJECTS} WHERE load_id = $1`,
  SELECT_CHECKPOINTS:
    'SELECT checkpoint_id, load_id, checkpoint_seq, byte_offset, ' +
    'record_index, batch_byte_offset, batch_record_index, rows_applied, ' +
    'rows_rejected, batch_checksum, schema_digest ' +
    `FROM ${BULK_LOAD_TABLES.CHECKPOINTS} WHERE load_id = $1 ORDER BY checkpoint_seq ASC`,
  INSERT_CHECKPOINT:
    `INSERT INTO ${BULK_LOAD_TABLES.CHECKPOINTS} (` +
    'checkpoint_id, load_id, checkpoint_seq, byte_offset, record_index, ' +
    'batch_byte_offset, batch_record_index, rows_applied, rows_rejected, ' +
    'batch_checksum, schema_digest) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)',
  INSERT_REJECT:
    `INSERT INTO ${BULK_LOAD_TABLES.REJECTS} (` +
    'reject_id, load_id, record_index, checkpoint_seq, reason_code, excerpt' +
    ') VALUES ($1, $2, $3, $4, $5, $6) ON CONFLICT (reject_id) DO NOTHING',
  SELECT_REJECTS:
    'SELECT reject_id, load_id, record_index, checkpoint_seq, reason_code, ' +
    `excerpt FROM ${BULK_LOAD_TABLES.REJECTS} WHERE load_id = $1 ORDER BY record_index ASC`,
});

const COMMAND_ERROR_MESSAGE = Object.freeze({
  SQL_CLIENT_REQUIRED: 'Bulk load requires a valid sqlClient with execute or query',
  SCHEMA_DRIFT_TARGET: 'Target table schema digest does not match manifest schemaDigest',
  SCHEMA_DRIFT_CHECKPOINT: 'Checkpoint chain schemaDigest does not match manifest schemaDigest',
  CHECKPOINT_SEQ_GAPLESS: 'Checkpoint chain must have gapless 0-based checkpointSeq values',
  CHECKPOINT_OFFSET_REGRESSION: 'Checkpoint chain sourceOffset regressed or violated monotonic order',
  SOURCE_SHORTER_THAN_CHECKPOINT: 'Source stream is shorter than the highest durable checkpoint byteOffset',
  BATCH_CHECKSUM_MISMATCH: 'Source bytes for a previously checkpointed batch do not match checksum',
  RECONCILIATION_COUNT_MISMATCH: 'Target row count does not match independent source oracle',
  RECONCILIATION_RANGE_MISMATCH: 'Target key-range digest does not match independent source oracle',
  RECONCILIATION_SAMPLE_MISMATCH: 'Sampled target row does not match independent source oracle',
  RECONCILIATION_CHECKPOINT_MISSING: 'Durable checkpoint chain is missing for applied bulk load rows',
  SQL_WRITE_FAILED: 'Canonical SQL write failed during bulk load',
});

function sha256Hex(payload) {
  return createHash(HASH_ALGORITHM_SHA256)
    .update(String(payload), UTF8_ENCODING)
    .digest(HASH_ENCODING_HEX);
}

function isValidSqlClient(sqlClient) {
  return Boolean(sqlClient) && (
    typeof sqlClient.execute === 'function' ||
    typeof sqlClient.executeQuery === 'function' ||
    typeof sqlClient.query === 'function'
  );
}

async function dispatchSqlClientCall(sqlClient, statement, params, mergedOptions) {
  if (typeof sqlClient.execute === 'function') {
    return sqlClient.execute(statement, params, mergedOptions);
  }
  if (typeof sqlClient.executeQuery === 'function') {
    return sqlClient.executeQuery(statement, params, mergedOptions);
  }
  return sqlClient.query(statement, params);
}

async function executeCanonicalSql(sqlClient, statement, params = [], opts = {}) {
  if (!isValidSqlClient(sqlClient)) {
    throw new BulkLoadError(
      BULK_LOAD_ERROR_CODE.WRITE_FAILED,
      COMMAND_ERROR_MESSAGE.SQL_CLIENT_REQUIRED,
    );
  }
  const mergedOptions = {dialect: DIALECT_POSTGRESQL, ...opts};
  let result;
  try {
    result = await dispatchSqlClientCall(sqlClient, statement, params, mergedOptions);
  } catch (error) {
    if (error instanceof BulkLoadError) {
      throw error;
    }
    throw new BulkLoadError(
      BULK_LOAD_ERROR_CODE.WRITE_FAILED,
      `${COMMAND_ERROR_MESSAGE.SQL_WRITE_FAILED}: ${error.message}`,
      {cause: error.message},
    );
  }
  if (result?.success === false) {
    throw new BulkLoadError(
      BULK_LOAD_ERROR_CODE.WRITE_FAILED,
      result.error || COMMAND_ERROR_MESSAGE.SQL_WRITE_FAILED,
    );
  }
  return {rows: Array.isArray(result?.rows) ? result.rows : []};
}

async function ensureSingleSystemTable(sqlClient, createSql, probeSql) {
  try {
    await executeCanonicalSql(sqlClient, createSql, []);
  } catch {
    await executeCanonicalSql(sqlClient, probeSql, [PROBE_LOAD_ID]);
  }
}

async function ensureBulkLoadTables(sqlClient) {
  await ensureSingleSystemTable(
    sqlClient,
    SQL_STATEMENTS.CREATE_CHECKPOINTS,
    SQL_STATEMENTS.PROBE_CHECKPOINTS,
  );
  await ensureSingleSystemTable(
    sqlClient,
    SQL_STATEMENTS.CREATE_REJECTS,
    SQL_STATEMENTS.PROBE_REJECTS,
  );
}

function normalizeCheckpointRow(row) {
  return Object.freeze({
    checkpointId: String(row.checkpoint_id),
    loadId: String(row.load_id),
    checkpointSeq: Number(row.checkpoint_seq),
    sourceOffset: Object.freeze({
      byteOffset: Number(row.byte_offset),
      recordIndex: Number(row.record_index),
    }),
    batchStartOffset: Object.freeze({
      byteOffset: Number(row.batch_byte_offset),
      recordIndex: Number(row.batch_record_index),
    }),
    rowsApplied: Number(row.rows_applied),
    rowsRejected: Number(row.rows_rejected),
    batchChecksum: String(row.batch_checksum),
    schemaDigest: String(row.schema_digest),
  });
}

function assertValidCheckpointOffsetStep(cp, prevByteOffset, prevRecordIndex) {
  const {byteOffset, recordIndex} = cp.sourceOffset;
  const startByte = cp.batchStartOffset.byteOffset;
  const startRec = cp.batchStartOffset.recordIndex;
  if (startByte !== prevByteOffset || startRec !== prevRecordIndex ||
      byteOffset < startByte || recordIndex < startRec) {
    throw new BulkLoadError(
      BULK_LOAD_ERROR_CODE.OFFSET_REGRESSION,
      COMMAND_ERROR_MESSAGE.CHECKPOINT_OFFSET_REGRESSION,
      {checkpointSeq: cp.checkpointSeq, byteOffset, prevByteOffset},
    );
  }
}

function validateCheckpointSequence(checkpoints, expectedSchemaDigest) {
  let prevByteOffset = 0;
  let prevRecordIndex = 0;
  const baselineDigest = expectedSchemaDigest || (checkpoints[0]?.schemaDigest ?? '');

  for (let idx = 0; idx < checkpoints.length; idx += 1) {
    const cp = checkpoints[idx];
    if (cp.checkpointSeq !== idx) {
      throw new BulkLoadError(
        BULK_LOAD_ERROR_CODE.DUPLICATE_CHECKPOINT_SEQ,
        COMMAND_ERROR_MESSAGE.CHECKPOINT_SEQ_GAPLESS,
        {expectedSeq: idx, actualSeq: cp.checkpointSeq},
      );
    }
    if (cp.schemaDigest !== baselineDigest) {
      throw new BulkLoadError(
        BULK_LOAD_ERROR_CODE.SCHEMA_DRIFT,
        COMMAND_ERROR_MESSAGE.SCHEMA_DRIFT_CHECKPOINT,
        {expectedSchemaDigest: baselineDigest, actual: cp.schemaDigest},
      );
    }
    assertValidCheckpointOffsetStep(cp, prevByteOffset, prevRecordIndex);
    prevByteOffset = cp.sourceOffset.byteOffset;
    prevRecordIndex = cp.sourceOffset.recordIndex;
  }
}

async function readCheckpointChain(sqlClient, loadId, expectedSchemaDigest) {
  const {rows} = await executeCanonicalSql(sqlClient, SQL_STATEMENTS.SELECT_CHECKPOINTS, [loadId]);
  const checkpoints = rows
    .map((row) => normalizeCheckpointRow(row))
    .sort((left, right) => left.checkpointSeq - right.checkpointSeq);
  validateCheckpointSequence(checkpoints, expectedSchemaDigest);
  return Object.freeze(checkpoints);
}

async function readRejectedRows(sqlClient, loadId) {
  const {rows} = await executeCanonicalSql(sqlClient, SQL_STATEMENTS.SELECT_REJECTS, [loadId]);
  return Object.freeze(rows.map((row) => Object.freeze({
    rejectId: String(row.reject_id),
    loadId: String(row.load_id),
    recordIndex: Number(row.record_index),
    checkpointSeq: Number(row.checkpoint_seq),
    reasonCode: String(row.reason_code),
    excerpt: String(row.excerpt),
  })));
}

function extractRawLinesFromByteSlice(sourceBuffer, startByte, endByte) {
  const sliceText = sourceBuffer.subarray(startByte, endByte).toString(UTF8_ENCODING);
  const rawSegments = sliceText.split(NEWLINE_CHAR);
  if (rawSegments.length > 0 && rawSegments[rawSegments.length - 1].length === 0) {
    rawSegments.pop();
  }
  return rawSegments.map((seg) => seg.endsWith(CARRIAGE_RETURN_CHAR) ? seg.slice(0, -1) : seg);
}

function verifyPriorCheckpointsAgainstSource(checkpoints, sourceText, manifest) {
  if (checkpoints.length === 0) {
    return;
  }
  const sourceBuffer = Buffer.from(String(sourceText ?? ''), UTF8_ENCODING);
  const head = checkpoints[checkpoints.length - 1];
  if (sourceBuffer.length < head.sourceOffset.byteOffset) {
    throw new BulkLoadError(
      BULK_LOAD_ERROR_CODE.SOURCE_TRUNCATED,
      COMMAND_ERROR_MESSAGE.SOURCE_SHORTER_THAN_CHECKPOINT,
      {streamBytes: sourceBuffer.length, checkpointBytes: head.sourceOffset.byteOffset},
    );
  }
  for (const cp of checkpoints) {
    const rawLines = extractRawLinesFromByteSlice(
      sourceBuffer,
      cp.batchStartOffset.byteOffset,
      cp.sourceOffset.byteOffset,
    );
    const recomputedChecksum = computeBatchChecksum(rawLines);
    if (recomputedChecksum !== cp.batchChecksum) {
      throw new BulkLoadError(
        BULK_LOAD_ERROR_CODE.BATCH_CHECKSUM_MISMATCH,
        COMMAND_ERROR_MESSAGE.BATCH_CHECKSUM_MISMATCH,
        {
          checkpointSeq: cp.checkpointSeq,
          expectedChecksum: cp.batchChecksum,
          actualChecksum: recomputedChecksum,
        },
      );
    }
  }
  readBoundedNdjsonBatches(sourceText, manifest, head.sourceOffset);
}

const FAULT_METHOD_BY_STAGE = Object.freeze({
  [FAULT_STAGE_AFTER_ROW_WRITE]: 'onAfterRowWrite',
  [FAULT_STAGE_AFTER_BATCH_TARGET_WRITE]: 'onAfterBatchTargetWrite',
  [FAULT_STAGE_AFTER_CHECKPOINT_WRITE]: 'onAfterCheckpointWrite',
});

async function notifyFaultInjector(faultInjector, stage, payload) {
  if (!faultInjector) {
    return;
  }
  if (typeof faultInjector === 'function') {
    await faultInjector({stage, ...payload});
    return;
  }
  const methodName = FAULT_METHOD_BY_STAGE[stage];
  if (methodName && typeof faultInjector[methodName] === 'function') {
    await faultInjector[methodName](payload);
  }
}

function buildRowInsertStatement(tableName, schema, skipIdempotentReplay) {
  const columnNames = schema.columns.map((col) => col.name);
  const placeholders = columnNames.map((_, idx) => `$${idx + 1}`);
  const conflictClause = skipIdempotentReplay ?
    '' :
    ` ON CONFLICT (${schema.primaryKey}) DO NOTHING`;
  return `INSERT INTO ${tableName} (${columnNames.join(COMMA_SPACE)}) ` +
    `VALUES (${placeholders.join(COMMA_SPACE)})${conflictClause}`;
}

async function applyBatchValidRows({
  sqlClient,
  manifest,
  batch,
  checkpointSeq,
  skipIdempotentReplay,
  faultInjector,
}) {
  const {tableName, schema, loadId} = manifest;
  const insertSql = buildRowInsertStatement(tableName, schema, skipIdempotentReplay);
  const rowsToApply = skipIdempotentReplay && batch.validRows.length > 0 ?
    batch.validRows.slice(0, -1) :
    batch.validRows;

  for (const row of rowsToApply) {
    const params = schema.columns.map((col) => row[col.name]);
    const pkValue = row[schema.primaryKey];
    const idempotencyKey = [
      loadId,
      BATCH_TAG,
      String(checkpointSeq),
      PK_TAG,
      String(pkValue),
    ].join(KEY_SEP);
    await executeCanonicalSql(sqlClient, insertSql, params, {idempotencyKey});
    await notifyFaultInjector(faultInjector, FAULT_STAGE_AFTER_ROW_WRITE, {
      loadId,
      checkpointSeq,
      row,
      batch,
    });
  }
}

async function persistBatchRejects(sqlClient, loadId, checkpointSeq, rejects) {
  for (const rej of rejects) {
    const rejectId = `${loadId}${KEY_SEP}${rej.recordIndex}`;
    await executeCanonicalSql(
      sqlClient,
      SQL_STATEMENTS.INSERT_REJECT,
      [rejectId, loadId, rej.recordIndex, checkpointSeq, rej.reasonCode, rej.excerpt],
      {idempotencyKey: rejectId},
    );
  }
}

async function persistBatchCheckpoint(
  sqlClient,
  manifest,
  checkpointSeq,
  batch,
  rowsApplied,
  rowsRejected,
) {
  const checkpointId = `${manifest.loadId}${KEY_SEP}${checkpointSeq}`;
  await executeCanonicalSql(
    sqlClient,
    SQL_STATEMENTS.INSERT_CHECKPOINT,
    [
      checkpointId,
      manifest.loadId,
      checkpointSeq,
      batch.endOffset.byteOffset,
      batch.endOffset.recordIndex,
      batch.startOffset.byteOffset,
      batch.startOffset.recordIndex,
      rowsApplied,
      rowsRejected,
      batch.batchChecksum,
      manifest.schemaDigest,
    ],
    {idempotencyKey: checkpointId},
  );
}

function coerceTargetColumnValue(rawValue, columnType) {
  if (rawValue === null || rawValue === undefined) {
    return null;
  }
  if (BOOLEAN_TYPE_SET.has(columnType)) {
    return typeof rawValue === 'boolean' ?
      rawValue :
      (Number(rawValue) !== 0 && rawValue !== FALSE_TEXT);
  }
  if (INTEGER_TYPE_SET.has(columnType) || REAL_TYPE_SET.has(columnType)) {
    return Number(rawValue);
  }
  return String(rawValue);
}

function normalizeTargetRow(rawRow, schema) {
  const normalized = {};
  for (const col of schema.columns) {
    normalized[col.name] = coerceTargetColumnValue(rawRow[col.name], col.type);
  }
  return Object.freeze(normalized);
}

function comparePrimaryKeys(left, right) {
  if (typeof left === 'number' && typeof right === 'number') {
    return left - right;
  }
  return String(left).localeCompare(String(right));
}

function buildExpectedSourceOracle(sourceText, manifest) {
  const allBatches = readBoundedNdjsonBatches(
    sourceText,
    manifest,
    {byteOffset: 0, recordIndex: 0},
  );
  const pkName = manifest.schema.primaryKey;
  const rowsByPk = new Map();
  for (const batch of allBatches) {
    for (const row of batch.validRows) {
      const pkVal = row[pkName];
      if (!rowsByPk.has(pkVal)) {
        rowsByPk.set(pkVal, row);
      }
    }
  }
  const sortedKeys = [...rowsByPk.keys()].sort(comparePrimaryKeys);
  const sortedRows = sortedKeys.map((key) => rowsByPk.get(key));
  return {rowsByPk, sortedKeys, sortedRows};
}

function deriveEffectiveKeyRanges(sortedKeys, explicitKeyRanges) {
  if (Array.isArray(explicitKeyRanges) && explicitKeyRanges.length > 0) {
    return explicitKeyRanges;
  }
  if (sortedKeys.length === 0) {
    return [];
  }
  const midIdx = Math.max(1, Math.floor(sortedKeys.length / 2));
  const firstKey = sortedKeys[0];
  const midKey = sortedKeys[midIdx];
  if (sortedKeys.length === 1 || firstKey === midKey) {
    return [{startKey: firstKey, endKey: null}];
  }
  return [
    {startKey: firstKey, endKey: midKey},
    {startKey: midKey, endKey: null},
  ];
}

function deriveEffectiveSampleKeys(sortedKeys, explicitSampleKeys) {
  if (Array.isArray(explicitSampleKeys) && explicitSampleKeys.length > 0) {
    return explicitSampleKeys;
  }
  if (sortedKeys.length === 0) {
    return [];
  }
  const midIdx = Math.floor(sortedKeys.length / 2);
  return [...new Set([sortedKeys[0], sortedKeys[midIdx], sortedKeys[sortedKeys.length - 1]])];
}

function isKeyWithinRange(key, startKey, endKey) {
  const geStart = comparePrimaryKeys(key, startKey) >= 0;
  const ltEnd = endKey === null || endKey === undefined || comparePrimaryKeys(key, endKey) < 0;
  return geStart && ltEnd;
}

async function queryTargetRangeRows(externalReadClient, tableName, schema, range) {
  const colList = schema.columns.map((col) => col.name).join(COMMA_SPACE);
  const pk = schema.primaryKey;
  const hasEnd = range.endKey !== null && range.endKey !== undefined;
  const sql = hasEnd ?
    `SELECT ${colList} FROM ${tableName} WHERE ${pk} >= $1 AND ${pk} < $2 ORDER BY ${pk} ASC` :
    `SELECT ${colList} FROM ${tableName} WHERE ${pk} >= $1 ORDER BY ${pk} ASC`;
  const params = hasEnd ? [range.startKey, range.endKey] : [range.startKey];
  const {rows} = await executeCanonicalSql(externalReadClient, sql, params);
  return rows
    .map((row) => normalizeTargetRow(row, schema))
    .sort((left, right) => comparePrimaryKeys(left[pk], right[pk]));
}

async function verifyKeyRangesMatch(
  externalReadClient,
  tableName,
  schema,
  oracle,
  effectiveRanges,
) {
  const pk = schema.primaryKey;
  const rangeDigests = [];
  for (const range of effectiveRanges) {
    const expectedInRange = oracle.sortedRows.filter((row) =>
      isKeyWithinRange(row[pk], range.startKey, range.endKey));
    const targetInRange = await queryTargetRangeRows(externalReadClient, tableName, schema, range);
    const sourceDigest = sha256Hex(JSON.stringify(expectedInRange));
    const targetDigest = sha256Hex(JSON.stringify(targetInRange));
    if (sourceDigest !== targetDigest || expectedInRange.length !== targetInRange.length) {
      throw new BulkLoadError(
        BULK_LOAD_ERROR_CODE.RECONCILIATION_MISMATCH,
        COMMAND_ERROR_MESSAGE.RECONCILIATION_RANGE_MISMATCH,
        {range, sourceDigest, targetDigest},
      );
    }
    rangeDigests.push(Object.freeze({
      startKey: range.startKey,
      endKey: range.endKey ?? null,
      rowCount: expectedInRange.length,
      digest: sourceDigest,
    }));
  }
  return rangeDigests;
}

async function verifySampleKeysMatch(
  externalReadClient,
  tableName,
  schema,
  oracle,
  effectiveSampleKeys,
) {
  const colList = schema.columns.map((col) => col.name).join(COMMA_SPACE);
  const pk = schema.primaryKey;
  for (const sampleKey of effectiveSampleKeys) {
    const expectedRow = oracle.rowsByPk.get(sampleKey);
    const {rows} = await executeCanonicalSql(
      externalReadClient,
      `SELECT ${colList} FROM ${tableName} WHERE ${pk} = $1`,
      [sampleKey],
    );
    const actualRow = rows.length === 1 ? normalizeTargetRow(rows[0], schema) : null;
    if (!actualRow || JSON.stringify(actualRow) !== JSON.stringify(expectedRow)) {
      throw new BulkLoadError(
        BULK_LOAD_ERROR_CODE.RECONCILIATION_MISMATCH,
        COMMAND_ERROR_MESSAGE.RECONCILIATION_SAMPLE_MISMATCH,
        {sampleKey, expectedRow, actualRow},
      );
    }
  }
}

async function verifyBulkLoadCompleteness({
  manifest,
  sourceText,
  externalReadClient,
  keyRanges,
  sampleKeys,
}) {
  const normalizedManifest = validateLoadManifest(manifest);
  const {tableName, schema} = normalizedManifest;
  const pk = schema.primaryKey;
  const oracle = buildExpectedSourceOracle(sourceText, normalizedManifest);

  const colList = schema.columns.map((col) => col.name).join(COMMA_SPACE);
  const allTargetResult = await executeCanonicalSql(
    externalReadClient,
    `SELECT ${colList} FROM ${tableName} ORDER BY ${pk} ASC`,
    [],
  );
  const allTargetRows = allTargetResult.rows
    .map((row) => normalizeTargetRow(row, schema))
    .sort((left, right) => comparePrimaryKeys(left[pk], right[pk]));

  if (allTargetRows.length !== oracle.sortedRows.length) {
    throw new BulkLoadError(
      BULK_LOAD_ERROR_CODE.RECONCILIATION_MISMATCH,
      COMMAND_ERROR_MESSAGE.RECONCILIATION_COUNT_MISMATCH,
      {expectedCount: oracle.sortedRows.length, actualCount: allTargetRows.length},
    );
  }

  const effectiveRanges = deriveEffectiveKeyRanges(
    oracle.sortedKeys,
    keyRanges || normalizedManifest.keyRanges,
  );
  const rangeDigests = await verifyKeyRangesMatch(
    externalReadClient,
    tableName,
    schema,
    oracle,
    effectiveRanges,
  );

  const effectiveSampleKeys = deriveEffectiveSampleKeys(
    oracle.sortedKeys,
    sampleKeys || normalizedManifest.sampleKeys,
  );
  await verifySampleKeysMatch(
    externalReadClient,
    tableName,
    schema,
    oracle,
    effectiveSampleKeys,
  );

  return Object.freeze({
    verified: true,
    totalExpectedRows: oracle.sortedRows.length,
    totalTargetRows: allTargetRows.length,
    overallDigest: sha256Hex(JSON.stringify(oracle.sortedRows)),
    rangeDigests: Object.freeze(rangeDigests),
    sampledKeyCount: effectiveSampleKeys.length,
  });
}

function assertTargetSchemaMatchesManifest(targetTableSchema, normalizedManifest) {
  if (!targetTableSchema) {
    return;
  }
  const targetDigest = computeSchemaDigest(targetTableSchema);
  if (targetDigest !== normalizedManifest.schemaDigest) {
    throw new BulkLoadError(
      BULK_LOAD_ERROR_CODE.SCHEMA_DRIFT,
      COMMAND_ERROR_MESSAGE.SCHEMA_DRIFT_TARGET,
      {expectedSchemaDigest: normalizedManifest.schemaDigest, targetSchemaDigest: targetDigest},
    );
  }
}

function resolveResumeCursor(existingCheckpoints, skipCheckpointPersistence) {
  const hasExisting = existingCheckpoints.length > 0 && !skipCheckpointPersistence;
  const head = hasExisting ? existingCheckpoints[existingCheckpoints.length - 1] : null;
  return {
    resumeOffset: head ? head.sourceOffset : {byteOffset: 0, recordIndex: 0},
    cumulativeApplied: head ? head.rowsApplied : 0,
    cumulativeRejected: head ? head.rowsRejected : 0,
    nextSeq: head ? head.checkpointSeq + 1 : 0,
  };
}

async function executeRemainingBatches({
  remainingBatches,
  cursor,
  sqlClient,
  normalizedManifest,
  skipIdempotentReplay,
  skipCheckpointPersistence,
  faultInjector,
}) {
  let {cumulativeApplied, cumulativeRejected, nextSeq} = cursor;
  for (const batch of remainingBatches) {
    await applyBatchValidRows({
      sqlClient,
      manifest: normalizedManifest,
      batch,
      checkpointSeq: nextSeq,
      skipIdempotentReplay,
      faultInjector,
    });
    await persistBatchRejects(sqlClient, normalizedManifest.loadId, nextSeq, batch.rejectedRows);
    await notifyFaultInjector(faultInjector, FAULT_STAGE_AFTER_BATCH_TARGET_WRITE, {
      loadId: normalizedManifest.loadId,
      checkpointSeq: nextSeq,
      batch,
    });
    cumulativeApplied += batch.validRows.length;
    cumulativeRejected += batch.rejectedRows.length;
    if (!skipCheckpointPersistence) {
      await persistBatchCheckpoint(
        sqlClient,
        normalizedManifest,
        nextSeq,
        batch,
        cumulativeApplied,
        cumulativeRejected,
      );
    }
    await notifyFaultInjector(faultInjector, FAULT_STAGE_AFTER_CHECKPOINT_WRITE, {
      loadId: normalizedManifest.loadId,
      checkpointSeq: nextSeq,
      batch,
    });
    nextSeq += 1;
    if (skipCheckpointPersistence) {
      break;
    }
  }
  return {cumulativeApplied, cumulativeRejected};
}

async function runBulkLoad({
  manifest,
  sourceText,
  targetTableSchema,
  sqlClient,
  externalReadClient,
  faultInjector,
  skipIdempotentReplay = false,
  skipCheckpointPersistence = false,
}) {
  const normalizedManifest = validateLoadManifest(manifest);
  assertTargetSchemaMatchesManifest(targetTableSchema, normalizedManifest);
  await ensureBulkLoadTables(sqlClient);

  const existingCheckpoints = await readCheckpointChain(
    sqlClient,
    normalizedManifest.loadId,
    normalizedManifest.schemaDigest,
  );
  verifyPriorCheckpointsAgainstSource(existingCheckpoints, sourceText, normalizedManifest);

  const cursor = resolveResumeCursor(existingCheckpoints, skipCheckpointPersistence);
  const remainingBatches = readBoundedNdjsonBatches(
    sourceText,
    normalizedManifest,
    cursor.resumeOffset,
  );

  const {cumulativeApplied, cumulativeRejected} = await executeRemainingBatches({
    remainingBatches,
    cursor,
    sqlClient,
    normalizedManifest,
    skipIdempotentReplay,
    skipCheckpointPersistence,
    faultInjector,
  });

  const finalCheckpoints = await readCheckpointChain(
    sqlClient,
    normalizedManifest.loadId,
    normalizedManifest.schemaDigest,
  );
  const rejectedRows = await readRejectedRows(sqlClient, normalizedManifest.loadId);
  const reconciliation = await verifyBulkLoadCompleteness({
    manifest: normalizedManifest,
    sourceText,
    externalReadClient: externalReadClient || sqlClient,
    keyRanges: normalizedManifest.keyRanges,
    sampleKeys: normalizedManifest.sampleKeys,
  });

  if (reconciliation.totalExpectedRows > 0 && finalCheckpoints.length === 0) {
    throw new BulkLoadError(
      BULK_LOAD_ERROR_CODE.RECONCILIATION_MISMATCH,
      COMMAND_ERROR_MESSAGE.RECONCILIATION_CHECKPOINT_MISSING,
      {loadId: normalizedManifest.loadId},
    );
  }

  const finalHead = finalCheckpoints.length > 0 ?
    finalCheckpoints[finalCheckpoints.length - 1] :
    null;

  return Object.freeze({
    loadId: normalizedManifest.loadId,
    tableName: normalizedManifest.tableName,
    schemaDigest: normalizedManifest.schemaDigest,
    sourceDigest: computeSourceDigest(sourceText),
    rowsApplied: cumulativeApplied,
    rowsRejected: cumulativeRejected,
    rejectedRows,
    checkpoints: finalCheckpoints,
    reconciliation,
    highWaterOffset: finalHead ?
      finalHead.sourceOffset :
      Object.freeze({byteOffset: 0, recordIndex: 0}),
  });
}

export {
  BULK_LOAD_TABLES,
  ensureBulkLoadTables,
  readCheckpointChain,
  runBulkLoad,
  verifyBulkLoadCompleteness,
};
