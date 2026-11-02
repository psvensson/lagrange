import {createHash} from 'node:crypto';

const HASH_ALGORITHM_SHA256 = 'sha256';
const HASH_ENCODING_HEX = 'hex';
const UTF8_ENCODING = 'utf8';
const NEWLINE_CHAR = '\n';
const CARRIAGE_RETURN_CHAR = '\r';
const MANIFEST_VERSION_V1 = 1;
const DEFAULT_MAX_EXCERPT_CHARS = 160;
const SQL_IDENTIFIER_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*$/u;
const BULK_LOAD_ERROR_NAME = 'BulkLoadError';
const FORMAT_NDJSON = 'ndjson';

const BULK_LOAD_ERROR_CODE = Object.freeze({
  INVALID_MANIFEST: 'INVALID_MANIFEST',
  MISSING_PRIMARY_KEY: 'MISSING_PRIMARY_KEY',
  INVALID_BATCH_BOUNDS: 'INVALID_BATCH_BOUNDS',
  SCHEMA_DRIFT: 'SCHEMA_DRIFT',
  SOURCE_TRUNCATED: 'SOURCE_TRUNCATED',
  OFFSET_REGRESSION: 'OFFSET_REGRESSION',
  BATCH_CHECKSUM_MISMATCH: 'BATCH_CHECKSUM_MISMATCH',
  DUPLICATE_CHECKPOINT_SEQ: 'DUPLICATE_CHECKPOINT_SEQ',
  RECONCILIATION_MISMATCH: 'RECONCILIATION_MISMATCH',
  WRITE_FAILED: 'WRITE_FAILED',
});

const BULK_LOAD_REJECT_REASON = Object.freeze({
  MALFORMED_JSON: 'MALFORMED_JSON',
  INVALID_RECORD_SHAPE: 'INVALID_RECORD_SHAPE',
  MISSING_PRIMARY_KEY: 'MISSING_PRIMARY_KEY',
  TYPE_MISMATCH: 'TYPE_MISMATCH',
  NULL_CONSTRAINT_VIOLATION: 'NULL_CONSTRAINT_VIOLATION',
  UNKNOWN_COLUMN: 'UNKNOWN_COLUMN',
});

const COLUMN_TYPE_GROUP = Object.freeze({
  INTEGER: 'INTEGER',
  INT: 'INT',
  BIGINT: 'BIGINT',
  REAL: 'REAL',
  FLOAT: 'FLOAT',
  DOUBLE: 'DOUBLE',
  NUMERIC: 'NUMERIC',
  TEXT: 'TEXT',
  VARCHAR: 'VARCHAR',
  STRING: 'STRING',
  BOOLEAN: 'BOOLEAN',
  BOOL: 'BOOL',
  JSON: 'JSON',
  JSONB: 'JSONB',
});

const INTEGER_TYPES = Object.freeze(new Set([
  COLUMN_TYPE_GROUP.INTEGER,
  COLUMN_TYPE_GROUP.INT,
  COLUMN_TYPE_GROUP.BIGINT,
]));

const REAL_TYPES = Object.freeze(new Set([
  COLUMN_TYPE_GROUP.REAL,
  COLUMN_TYPE_GROUP.FLOAT,
  COLUMN_TYPE_GROUP.DOUBLE,
  COLUMN_TYPE_GROUP.NUMERIC,
]));

const TEXT_TYPES = Object.freeze(new Set([
  COLUMN_TYPE_GROUP.TEXT,
  COLUMN_TYPE_GROUP.VARCHAR,
  COLUMN_TYPE_GROUP.STRING,
]));

const BOOLEAN_TYPES = Object.freeze(new Set([
  COLUMN_TYPE_GROUP.BOOLEAN,
  COLUMN_TYPE_GROUP.BOOL,
]));

const JSON_TYPES = Object.freeze(new Set([
  COLUMN_TYPE_GROUP.JSON,
  COLUMN_TYPE_GROUP.JSONB,
]));

const ERROR_MESSAGE = Object.freeze({
  MANIFEST_OBJECT_REQUIRED: 'Bulk-load manifest must be a plain object',
  MANIFEST_VERSION_INVALID: 'Bulk-load manifestVersion must equal 1',
  LOAD_ID_INVALID: 'Bulk-load manifest requires a non-empty loadId string',
  TABLE_NAME_INVALID: 'Bulk-load manifest requires a valid SQL tableName',
  SCHEMA_INVALID: 'Bulk-load manifest requires a valid schema definition',
  PRIMARY_KEY_REQUIRED: 'Bulk-load schema requires a declared primaryKey column',
  BATCH_BOUNDS_INVALID: 'Bulk-load batchBounds requires positive integer maxRows and maxBytes',
  SOURCE_DESCRIPTOR_INVALID: 'Bulk-load manifest requires a valid source descriptor',
  SCHEMA_DIGEST_INVALID: 'Bulk-load manifest schemaDigest does not match declared schema',
  OFFSET_NEGATIVE: 'Start offset byteOffset and recordIndex must be non-negative integers',
  OFFSET_BEYOND_EOF: 'Durable checkpoint offset exceeds source stream byte length',
  OFFSET_MISALIGNED: 'Start offset does not align with a canonical NDJSON record boundary',
});

class BulkLoadError extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.name = BULK_LOAD_ERROR_NAME;
    this.code = code;
    this.details = Object.freeze({...details});
  }
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function isNonEmptyString(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function sha256Hex(text) {
  return createHash(HASH_ALGORITHM_SHA256)
    .update(String(text), UTF8_ENCODING)
    .digest(HASH_ENCODING_HEX);
}

function normalizeColumnSpec(col) {
  if (!isPlainObject(col) || !isNonEmptyString(col.name) ||
      !SQL_IDENTIFIER_PATTERN.test(col.name) || !isNonEmptyString(col.type)) {
    throw new BulkLoadError(
      BULK_LOAD_ERROR_CODE.INVALID_MANIFEST,
      ERROR_MESSAGE.SCHEMA_INVALID,
    );
  }
  const normalizedType = col.type.trim().toUpperCase();
  if (!INTEGER_TYPES.has(normalizedType) &&
      !REAL_TYPES.has(normalizedType) &&
      !TEXT_TYPES.has(normalizedType) &&
      !BOOLEAN_TYPES.has(normalizedType) &&
      !JSON_TYPES.has(normalizedType)) {
    throw new BulkLoadError(
      BULK_LOAD_ERROR_CODE.INVALID_MANIFEST,
      ERROR_MESSAGE.SCHEMA_INVALID,
    );
  }
  return Object.freeze({
    name: col.name.trim(),
    type: normalizedType,
    nullable: col.nullable !== false,
  });
}

function normalizeSchema(schema) {
  if (!isPlainObject(schema) || !Array.isArray(schema.columns) ||
      schema.columns.length === 0) {
    throw new BulkLoadError(
      BULK_LOAD_ERROR_CODE.INVALID_MANIFEST,
      ERROR_MESSAGE.SCHEMA_INVALID,
    );
  }
  if (!isNonEmptyString(schema.primaryKey)) {
    throw new BulkLoadError(
      BULK_LOAD_ERROR_CODE.MISSING_PRIMARY_KEY,
      ERROR_MESSAGE.PRIMARY_KEY_REQUIRED,
    );
  }
  const primaryKey = schema.primaryKey.trim();
  const columns = schema.columns.map((col) => normalizeColumnSpec(col));
  const pkColumn = columns.find((col) => col.name === primaryKey);
  if (!pkColumn) {
    throw new BulkLoadError(
      BULK_LOAD_ERROR_CODE.MISSING_PRIMARY_KEY,
      ERROR_MESSAGE.PRIMARY_KEY_REQUIRED,
    );
  }
  return Object.freeze({
    primaryKey,
    columns: Object.freeze(columns.map((col) =>
      col.name === primaryKey ?
        Object.freeze({...col, nullable: false}) :
        col)),
  });
}

function computeSchemaDigest(schema) {
  const normalized = normalizeSchema(schema);
  const canonicalPayload = JSON.stringify({
    primaryKey: normalized.primaryKey,
    columns: normalized.columns.map((col) => ({
      name: col.name,
      type: col.type,
      nullable: col.nullable,
    })),
  });
  return sha256Hex(canonicalPayload);
}

function computeSourceDigest(sourceText) {
  return sha256Hex(String(sourceText ?? ''));
}

function computeBatchChecksum(rawLines) {
  const joined = Array.isArray(rawLines) ?
    rawLines.join(NEWLINE_CHAR) :
    String(rawLines ?? '');
  return sha256Hex(joined);
}

function validateBatchBounds(batchBounds) {
  if (!isPlainObject(batchBounds) ||
      !Number.isSafeInteger(batchBounds.maxRows) ||
      batchBounds.maxRows < 1 ||
      !Number.isSafeInteger(batchBounds.maxBytes) ||
      batchBounds.maxBytes < 1) {
    throw new BulkLoadError(
      BULK_LOAD_ERROR_CODE.INVALID_BATCH_BOUNDS,
      ERROR_MESSAGE.BATCH_BOUNDS_INVALID,
    );
  }
  return Object.freeze({
    maxRows: batchBounds.maxRows,
    maxBytes: batchBounds.maxBytes,
  });
}

function validateSourceDescriptor(source) {
  if (!isPlainObject(source)) {
    throw new BulkLoadError(
      BULK_LOAD_ERROR_CODE.INVALID_MANIFEST,
      ERROR_MESSAGE.SOURCE_DESCRIPTOR_INVALID,
    );
  }
  const sourceId = source.sourceId || source.path || source.streamId || '';
  if (!isNonEmptyString(sourceId)) {
    throw new BulkLoadError(
      BULK_LOAD_ERROR_CODE.INVALID_MANIFEST,
      ERROR_MESSAGE.SOURCE_DESCRIPTOR_INVALID,
    );
  }
  return Object.freeze({
    sourceId: sourceId.trim(),
    format: source.format || FORMAT_NDJSON,
    sourceDigest: isNonEmptyString(source.sourceDigest) ?
      source.sourceDigest.trim() :
      null,
  });
}

function validateLoadManifest(manifest) {
  if (!isPlainObject(manifest)) {
    throw new BulkLoadError(
      BULK_LOAD_ERROR_CODE.INVALID_MANIFEST,
      ERROR_MESSAGE.MANIFEST_OBJECT_REQUIRED,
    );
  }
  if (manifest.manifestVersion !== MANIFEST_VERSION_V1) {
    throw new BulkLoadError(
      BULK_LOAD_ERROR_CODE.INVALID_MANIFEST,
      ERROR_MESSAGE.MANIFEST_VERSION_INVALID,
    );
  }
  if (!isNonEmptyString(manifest.loadId)) {
    throw new BulkLoadError(
      BULK_LOAD_ERROR_CODE.INVALID_MANIFEST,
      ERROR_MESSAGE.LOAD_ID_INVALID,
    );
  }
  if (!isNonEmptyString(manifest.tableName) ||
      !SQL_IDENTIFIER_PATTERN.test(manifest.tableName.trim())) {
    throw new BulkLoadError(
      BULK_LOAD_ERROR_CODE.INVALID_MANIFEST,
      ERROR_MESSAGE.TABLE_NAME_INVALID,
    );
  }
  const normalizedSchema = normalizeSchema(manifest.schema);
  const expectedSchemaDigest = computeSchemaDigest(normalizedSchema);
  if (!isNonEmptyString(manifest.schemaDigest) ||
      manifest.schemaDigest.trim() !== expectedSchemaDigest) {
    throw new BulkLoadError(
      BULK_LOAD_ERROR_CODE.INVALID_MANIFEST,
      ERROR_MESSAGE.SCHEMA_DIGEST_INVALID,
    );
  }
  const batchBounds = validateBatchBounds(manifest.batchBounds);
  const source = validateSourceDescriptor(manifest.source);
  return Object.freeze({
    manifestVersion: MANIFEST_VERSION_V1,
    loadId: manifest.loadId.trim(),
    tableName: manifest.tableName.trim(),
    schema: normalizedSchema,
    schemaDigest: expectedSchemaDigest,
    source,
    batchBounds,
    keyRanges: Array.isArray(manifest.keyRanges) ? manifest.keyRanges : null,
    sampleKeys: Array.isArray(manifest.sampleKeys) ? manifest.sampleKeys : null,
  });
}

function isValueMatchingColumnType(value, columnType) {
  if (INTEGER_TYPES.has(columnType)) {
    return Number.isSafeInteger(value);
  }
  if (REAL_TYPES.has(columnType)) {
    return typeof value === 'number' && Number.isFinite(value);
  }
  if (TEXT_TYPES.has(columnType)) {
    return typeof value === 'string';
  }
  if (BOOLEAN_TYPES.has(columnType)) {
    return typeof value === 'boolean';
  }
  return JSON_TYPES.has(columnType);
}

function buildRejectRecord(recordIndex, code, rawLine) {
  return Object.freeze({
    recordIndex,
    reasonCode: code,
    excerpt: String(rawLine).slice(0, DEFAULT_MAX_EXCERPT_CHARS),
  });
}

function validateColumnsOfParsedRow(parsed, schema) {
  const columnMap = new Map(schema.columns.map((col) => [col.name, col]));
  for (const key of Object.keys(parsed)) {
    if (!columnMap.has(key)) {
      return {
        valid: false,
        rejectCode: BULK_LOAD_REJECT_REASON.UNKNOWN_COLUMN,
      };
    }
  }
  const pkValue = parsed[schema.primaryKey];
  if (pkValue === undefined || pkValue === null || pkValue === '') {
    return {
      valid: false,
      rejectCode: BULK_LOAD_REJECT_REASON.MISSING_PRIMARY_KEY,
    };
  }
  const normalizedRow = {};
  for (const col of schema.columns) {
    const val = parsed[col.name];
    if (val === undefined || val === null) {
      if (!col.nullable) {
        return {
          valid: false,
          rejectCode: BULK_LOAD_REJECT_REASON.NULL_CONSTRAINT_VIOLATION,
        };
      }
      normalizedRow[col.name] = null;
    } else if (!isValueMatchingColumnType(val, col.type)) {
      return {
        valid: false,
        rejectCode: BULK_LOAD_REJECT_REASON.TYPE_MISMATCH,
      };
    } else {
      normalizedRow[col.name] = val;
    }
  }
  return {
    valid: true,
    row: Object.freeze(normalizedRow),
  };
}

function classifyNdjsonLine(rawLine, recordIndex, schema) {
  let parsed;
  try {
    parsed = JSON.parse(rawLine);
  } catch {
    return {
      valid: false,
      rejected: buildRejectRecord(
        recordIndex,
        BULK_LOAD_REJECT_REASON.MALFORMED_JSON,
        rawLine,
      ),
    };
  }
  if (!isPlainObject(parsed)) {
    return {
      valid: false,
      rejected: buildRejectRecord(
        recordIndex,
        BULK_LOAD_REJECT_REASON.INVALID_RECORD_SHAPE,
        rawLine,
      ),
    };
  }
  const check = validateColumnsOfParsedRow(parsed, schema);
  if (!check.valid) {
    return {
      valid: false,
      rejected: buildRejectRecord(recordIndex, check.rejectCode, rawLine),
    };
  }
  return {
    valid: true,
    row: check.row,
  };
}

function splitStreamIntoIndexedLines(sourceText) {
  const text = String(sourceText ?? '');
  const totalBytes = Buffer.byteLength(text, UTF8_ENCODING);
  if (text.length === 0) {
    return {lines: [], totalBytes: 0};
  }
  const rawSegments = text.split(NEWLINE_CHAR);
  const lines = [];
  let cursorBytes = 0;
  let recordIndex = 0;
  for (let idx = 0; idx < rawSegments.length; idx += 1) {
    const isLastSegment = idx === rawSegments.length - 1;
    const segment = rawSegments[idx];
    const hasTrailingNewline = !isLastSegment;
    const segmentBytes = Buffer.byteLength(segment, UTF8_ENCODING) +
      (hasTrailingNewline ? 1 : 0);
    const cleanedLine = segment.endsWith(CARRIAGE_RETURN_CHAR) ?
      segment.slice(0, -1) :
      segment;
    if (cleanedLine.length === 0 && isLastSegment) {
      break;
    }
    lines.push({
      recordIndex,
      rawLine: cleanedLine,
      byteLength: segmentBytes,
      startByteOffset: cursorBytes,
      endByteOffset: cursorBytes + segmentBytes,
    });
    cursorBytes += segmentBytes;
    recordIndex += 1;
  }
  return {lines, totalBytes};
}

function isNonNegativeSafeInt(value) {
  return Number.isSafeInteger(value) && value >= 0;
}

function assertValidOffsetBounds(byteOffset, recordIndex, totalBytes) {
  if (!isNonNegativeSafeInt(byteOffset) || !isNonNegativeSafeInt(recordIndex)) {
    throw new BulkLoadError(
      BULK_LOAD_ERROR_CODE.OFFSET_REGRESSION,
      ERROR_MESSAGE.OFFSET_NEGATIVE,
      {byteOffset, recordIndex},
    );
  }
  if (byteOffset > totalBytes) {
    throw new BulkLoadError(
      BULK_LOAD_ERROR_CODE.SOURCE_TRUNCATED,
      ERROR_MESSAGE.OFFSET_BEYOND_EOF,
      {byteOffset, totalBytes},
    );
  }
}

function validateStartOffset(startOffset, lines, totalBytes) {
  const byteOffset = startOffset?.byteOffset ?? 0;
  const recordIndex = startOffset?.recordIndex ?? 0;
  assertValidOffsetBounds(byteOffset, recordIndex, totalBytes);
  if (byteOffset === 0 && recordIndex === 0) {
    return 0;
  }
  if (byteOffset === totalBytes && recordIndex === lines.length) {
    return lines.length;
  }
  const matchedIdx = lines.findIndex((entry) =>
    entry.startByteOffset === byteOffset && entry.recordIndex === recordIndex);
  if (matchedIdx === -1) {
    const code = recordIndex > lines.length ?
      BULK_LOAD_ERROR_CODE.SOURCE_TRUNCATED :
      BULK_LOAD_ERROR_CODE.OFFSET_REGRESSION;
    throw new BulkLoadError(
      code,
      ERROR_MESSAGE.OFFSET_MISALIGNED,
      {byteOffset, recordIndex, totalBytes},
    );
  }
  return matchedIdx;
}

function finalizeBatch(batchIndex, entries, schema) {
  const rawLines = entries.map((entry) => entry.rawLine);
  const validRows = [];
  const rejectedRows = [];
  let byteLength = 0;
  for (const entry of entries) {
    byteLength += entry.byteLength;
    const classified = classifyNdjsonLine(
      entry.rawLine,
      entry.recordIndex,
      schema,
    );
    if (classified.valid) {
      validRows.push(classified.row);
    } else {
      rejectedRows.push(classified.rejected);
    }
  }
  const firstEntry = entries[0];
  const lastEntry = entries[entries.length - 1];
  return Object.freeze({
    batchIndex,
    startOffset: Object.freeze({
      byteOffset: firstEntry.startByteOffset,
      recordIndex: firstEntry.recordIndex,
    }),
    endOffset: Object.freeze({
      byteOffset: lastEntry.endByteOffset,
      recordIndex: lastEntry.recordIndex + 1,
    }),
    rawLines: Object.freeze(rawLines),
    byteLength,
    batchChecksum: computeBatchChecksum(rawLines),
    validRows: Object.freeze(validRows),
    rejectedRows: Object.freeze(rejectedRows),
  });
}

function readBoundedNdjsonBatches(
  sourceText,
  manifest,
  startOffset = {byteOffset: 0, recordIndex: 0},
) {
  const normalizedManifest = validateLoadManifest(manifest);
  const {lines, totalBytes} = splitStreamIntoIndexedLines(sourceText);
  const startLineIdx = validateStartOffset(startOffset, lines, totalBytes);
  const {maxRows, maxBytes} = normalizedManifest.batchBounds;

  const batches = [];
  let currentEntries = [];
  let currentBytes = 0;

  for (let idx = startLineIdx; idx < lines.length; idx += 1) {
    const lineEntry = lines[idx];
    const wouldExceedRows = currentEntries.length >= maxRows;
    const wouldExceedBytes = currentEntries.length > 0 &&
      currentBytes + lineEntry.byteLength > maxBytes;
    if (wouldExceedRows || wouldExceedBytes) {
      batches.push(finalizeBatch(
        batches.length,
        currentEntries,
        normalizedManifest.schema,
      ));
      currentEntries = [];
      currentBytes = 0;
    }
    currentEntries.push(lineEntry);
    currentBytes += lineEntry.byteLength;
  }

  if (currentEntries.length > 0) {
    batches.push(finalizeBatch(
      batches.length,
      currentEntries,
      normalizedManifest.schema,
    ));
  }

  return Object.freeze(batches);
}

export {
  BULK_LOAD_ERROR_CODE,
  BULK_LOAD_REJECT_REASON,
  BulkLoadError,
  computeBatchChecksum,
  computeSchemaDigest,
  computeSourceDigest,
  readBoundedNdjsonBatches,
  validateLoadManifest,
};
