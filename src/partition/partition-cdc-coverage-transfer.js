import {createHash, randomUUID} from 'node:crypto';
import {resolveSystemCacheRowKey as resolveCoverageRowKey} from
  '../cache/system-cache-key-descriptor.js';
import {digest} from '../utils/canonical-json-data.js';
import {
  CDC_COVERAGE_TRANSFER_DEFAULT,
  readCdcCoverageTransfer,
  releaseCdcCoverageTransfer,
  reserveCdcCoverageTransfer,
  setCdcCoverageTransferValue,
} from '../cdc/cdc-coverage-transfer-owner.js';
import {cdcCoverageCellId, validCdcCoverageKey, validCdcCoverageRow} from
  '../cdc/cdc-coverage-domain.js';
import {CDC_COVERAGE_REQUEST_MODE, CDC_COVERAGE_RESPONSE_STATE} from
  '../cdc/cdc-coverage-protocol.js';
import {RAFT_OPERATION_OUTCOME} from '../raft/raft-operation-port-constants.js';
import {RAFT_ROLE} from '../raft/constants.js';

const CDC_COVERAGE_TRANSFER_REFUSAL = Object.freeze({
  CAPACITY_UNAVAILABLE: 'cdc_coverage_capacity_unavailable',
  DIGEST_INVALID: 'cdc_coverage_digest_invalid',
  IDENTITY_INVALID: 'cdc_coverage_identity_invalid',
  SESSION_MISSING: 'cdc_coverage_transfer_session_missing',
});
const SOURCE_PEAK_ENCODED_COPIES = 2;
const SOURCE_PEAK_RAW_COPIES = 2;
const SOURCE_PEAK_CHUNK_COPIES = 3;
const CONSUMER_PEAK_PAYLOAD_COPIES = 6;
const CONSUMER_PEAK_CHUNK_COPIES = 3;
const ROW_FRAME_BYTES = 256;
const COLUMN_FRAME_BYTES = 64;
const BINARY_VALUE_FRAME_BYTES = 5;
const CDC_COVERAGE_DIGEST = Object.freeze({
  ALGORITHM: 'sha256',
  ENCODING: 'hex',
});
const CDC_COVERAGE_CODEC = Object.freeze({
  BASE64: 'base64',
  HEADER: Buffer.from('CDC1'),
  NULL_TAG: 0,
  TEXT_TAG: 1,
  INTEGER_TAG: 2,
  REAL_TAG: 3,
  UTF8: 'utf8',
});
const CDC_COVERAGE_SQL = Object.freeze({
  IDENTIFIER_QUOTE: '"',
  IDENTIFIER_QUOTE_ESCAPED: '""',
  SELECT_SEPARATOR: ', ',
});
const CDC_COVERAGE_SQLITE_STORAGE = Object.freeze([
  'null', 'text', 'integer', 'real',
]);
const CDC_COVERAGE_COLUMN_TYPE = Object.freeze({
  INTEGER: 'INTEGER',
  TEXT: 'TEXT',
});
const CDC_COVERAGE_BINDING_DEADLINE = 'deadlineMs';

function sha256Hex(bytes) {
  return createHash(CDC_COVERAGE_DIGEST.ALGORITHM).update(bytes)
    .digest(CDC_COVERAGE_DIGEST.ENCODING);
}

function quoteIdentifier(value) {
  const quoted = String(value).replaceAll(
    CDC_COVERAGE_SQL.IDENTIFIER_QUOTE,
    CDC_COVERAGE_SQL.IDENTIFIER_QUOTE_ESCAPED);
  return `${CDC_COVERAGE_SQL.IDENTIFIER_QUOTE}${quoted}` +
    CDC_COVERAGE_SQL.IDENTIFIER_QUOTE;
}

function boundedSum(values) {
  let total = 0;
  for (const value of values) {
    if (!Number.isSafeInteger(value) || value < 0 ||
        total > Number.MAX_SAFE_INTEGER - value) return null;
    total += value;
  }
  return total;
}

function probeSelect(domain) {
  return domain.columns.flatMap((column, index) => {
    const name = quoteIdentifier(column.name);
    return [`typeof(${name}) AS _cdc_type_${index}`,
      `coalesce(length(CAST(${name} AS BLOB)), 0) AS _cdc_bytes_${index}`];
  }).join(CDC_COVERAGE_SQL.SELECT_SEPARATOR);
}

function orderedWhere(domain, pageStart) {
  const key = quoteIdentifier(domain.primaryKeyField);
  return {key, clause: pageStart === null ? '' :
    ` WHERE ${key} COLLATE BINARY >= ?`,
  params: pageStart === null ? [] : [pageStart]};
}

function probeRow(service, scope, domain, pageStart, offset) {
  const ordered = orderedWhere(domain, pageStart);
  const sql = `SELECT ${probeSelect(domain)} FROM ` +
    `${quoteIdentifier(scope.tableName)}${ordered.clause} ` +
    `ORDER BY ${ordered.key} COLLATE BINARY LIMIT 1 OFFSET ?`;
  return service.db.prepare(sql).get(...ordered.params, offset) ?? null;
}

function materializeRow(service, scope, domain, pageStart, offset) {
  const ordered = orderedWhere(domain, pageStart);
  const sql = `SELECT * FROM ${quoteIdentifier(scope.tableName)}` +
    `${ordered.clause} ORDER BY ${ordered.key} COLLATE BINARY ` +
    'LIMIT 1 OFFSET ?';
  return service.db.prepare(sql).get(...ordered.params, offset) ?? null;
}

function materializeKey(service, scope, domain, pageStart, offset) {
  const ordered = orderedWhere(domain, pageStart);
  const sql = `SELECT ${ordered.key} AS _cdc_key FROM ` +
    `${quoteIdentifier(scope.tableName)}${ordered.clause} ` +
    `ORDER BY ${ordered.key} COLLATE BINARY LIMIT 1 OFFSET ?`;
  return service.db.prepare(sql).get(...ordered.params, offset)?._cdc_key ?? null;
}

function probeKeyBytes(service, scope, domain, pageStart, offset) {
  const ordered = orderedWhere(domain, pageStart);
  const sql = `SELECT typeof(${ordered.key}) AS _cdc_key_type, ` +
    `coalesce(length(CAST(${ordered.key} AS BLOB)), 0) AS _cdc_key_bytes ` +
    `FROM ${quoteIdentifier(scope.tableName)}${ordered.clause} ` +
    `ORDER BY ${ordered.key} COLLATE BINARY LIMIT 1 OFFSET ?`;
  const probe = service.db.prepare(sql).get(...ordered.params, offset);
  if (probe === undefined) return 0;
  return probe?._cdc_key_type === CDC_COVERAGE_SQLITE_STORAGE[1] &&
    Number.isSafeInteger(probe._cdc_key_bytes) && probe._cdc_key_bytes >= 0 ?
    probe._cdc_key_bytes : null;
}

function encodeCoverageRow(domain, row) {
  if (!validCdcCoverageRow(domain, row)) return null;
  const values = domain.columns.map((column) => {
    const value = row[column.name];
    if (value === null) {
      return {tag: CDC_COVERAGE_CODEC.NULL_TAG, bytes: Buffer.alloc(0)};
    }
    const tag = column.type === CDC_COVERAGE_COLUMN_TYPE.TEXT ?
      CDC_COVERAGE_CODEC.TEXT_TAG :
      column.type === 'INTEGER' ? CDC_COVERAGE_CODEC.INTEGER_TAG :
        CDC_COVERAGE_CODEC.REAL_TAG;
    return {tag, bytes: Buffer.from(String(value), CDC_COVERAGE_CODEC.UTF8)};
  });
  const total = boundedSum([CDC_COVERAGE_CODEC.HEADER.length,
    ...values.map((value) => BINARY_VALUE_FRAME_BYTES + value.bytes.length)]);
  if (total === null) return null;
  const encoded = Buffer.allocUnsafe(total);
  CDC_COVERAGE_CODEC.HEADER.copy(encoded, 0);
  let offset = CDC_COVERAGE_CODEC.HEADER.length;
  for (const value of values) {
    encoded[offset] = value.tag;
    encoded.writeUInt32BE(value.bytes.length, offset + 1);
    value.bytes.copy(encoded, offset + BINARY_VALUE_FRAME_BYTES);
    offset += BINARY_VALUE_FRAME_BYTES + value.bytes.length;
  }
  return encoded;
}

function decodeCoverageRow(domain, bytes) {
  const payload = Buffer.from(bytes);
  if (payload.length < CDC_COVERAGE_CODEC.HEADER.length ||
      !payload.subarray(0, CDC_COVERAGE_CODEC.HEADER.length)
        .equals(CDC_COVERAGE_CODEC.HEADER)) {
    return null;
  }
  const row = {};
  let offset = CDC_COVERAGE_CODEC.HEADER.length;
  for (let index = 0; index < domain.columns.length; index += 1) {
    const column = domain.columns[index];
    if (offset + BINARY_VALUE_FRAME_BYTES > payload.length) return null;
    const tag = payload[offset];
    const length = payload.readUInt32BE(offset + 1);
    offset += BINARY_VALUE_FRAME_BYTES;
    if (offset + length > payload.length) return null;
    const encoded = payload.subarray(offset, offset + length);
    offset += length;
    let value = null;
    if (tag !== CDC_COVERAGE_CODEC.NULL_TAG) {
      const expectedTag = column.type === CDC_COVERAGE_COLUMN_TYPE.TEXT ?
        CDC_COVERAGE_CODEC.TEXT_TAG :
        column.type === CDC_COVERAGE_COLUMN_TYPE.INTEGER ?
          CDC_COVERAGE_CODEC.INTEGER_TAG :
          CDC_COVERAGE_CODEC.REAL_TAG;
      if (tag !== expectedTag) return null;
      const text = encoded.toString(CDC_COVERAGE_CODEC.UTF8);
      value = column.type === CDC_COVERAGE_COLUMN_TYPE.TEXT ? text : Number(text);
    } else if (length !== 0) return null;
    row[column.name] = value;
  }
  return offset === payload.length && validCdcCoverageRow(domain, row) ?
    row : null;
}

function probeRawBytes(domain, probe) {
  if (!probe || typeof probe !== 'object') return null;
  const lengths = [];
  for (let index = 0; index < domain.columns.length; index += 1) {
    const storageType = probe[`_cdc_type_${index}`];
    const bytes = probe[`_cdc_bytes_${index}`];
    if (!CDC_COVERAGE_SQLITE_STORAGE.includes(storageType) ||
        !Number.isSafeInteger(bytes) || bytes < 0) return null;
    lengths.push(bytes);
  }
  return boundedSum(lengths);
}

function peakReservation(rawBytes, columnCount) {
  const maxEncodedBytes = ROW_FRAME_BYTES + columnCount * COLUMN_FRAME_BYTES +
    rawBytes;
  const retainedBytes = boundedSum([
    rawBytes * SOURCE_PEAK_RAW_COPIES,
    maxEncodedBytes * SOURCE_PEAK_ENCODED_COPIES,
    CDC_COVERAGE_TRANSFER_DEFAULT.CHUNK_BYTES * SOURCE_PEAK_CHUNK_COPIES,
  ]);
  return retainedBytes === null ? null : {maxEncodedBytes, retainedBytes};
}

function ordinaryCoverageRowByteBound(rawBytes, columnCount) {
  if (!Number.isSafeInteger(rawBytes) || rawBytes < 0 ||
      !Number.isSafeInteger(columnCount) || columnCount < 0 ||
      rawBytes > Math.floor((Number.MAX_SAFE_INTEGER - ROW_FRAME_BYTES -
        columnCount * COLUMN_FRAME_BYTES) / 6)) return null;
  return ROW_FRAME_BYTES + columnCount * COLUMN_FRAME_BYTES + rawBytes * 6;
}

function sourcePageReservationBytes(rawBytes, maxEncodedBytes) {
  if (!Number.isSafeInteger(rawBytes) || rawBytes < 0 ||
      !Number.isSafeInteger(maxEncodedBytes) || maxEncodedBytes < 0) return null;
  return boundedSum([
    rawBytes * SOURCE_PEAK_RAW_COPIES,
    maxEncodedBytes * SOURCE_PEAK_ENCODED_COPIES,
    CDC_COVERAGE_TRANSFER_DEFAULT.CHUNK_BYTES * SOURCE_PEAK_CHUNK_COPIES,
  ]);
}

function consumerTransferReservationBytes(totalBytes, publicationBytes = 0) {
  if (!Number.isSafeInteger(totalBytes) || totalBytes <= 0) return null;
  if (!Number.isSafeInteger(publicationBytes) || publicationBytes < 0) {
    return null;
  }
  return boundedSum([
    totalBytes * CONSUMER_PEAK_PAYLOAD_COPIES,
    CDC_COVERAGE_TRANSFER_DEFAULT.CHUNK_BYTES * CONSUMER_PEAK_CHUNK_COPIES,
    publicationBytes,
  ]);
}

function requestBinding(options) {
  const fields = ['requestId', 'targetNodeId', 'targetLifecycleId',
    'reconcileGenerationId'];
  if (!fields.every((field) => typeof options[field] === 'string' &&
      options[field].length > 0) || !Number.isSafeInteger(options.deadlineMs) ||
      options.deadlineMs <= 0) {
    return null;
  }
  return Object.freeze(Object.fromEntries(fields.map(
    (field) => [field, options[field]]).concat([
    [CDC_COVERAGE_BINDING_DEADLINE, options.deadlineMs],
  ])));
}

function exactBinding(left, right) {
  return left && right && left.requestId === right.requestId &&
    left.targetNodeId === right.targetNodeId &&
    left.targetLifecycleId === right.targetLifecycleId &&
    left.reconcileGenerationId === right.reconcileGenerationId &&
    left.deadlineMs === right.deadlineMs;
}

function sourceSessionIsCurrent(service, value) {
  const status = service?.raft?.readStatus?.();
  return status?.outcome === RAFT_OPERATION_OUTCOME.CORE_OK &&
    status.role === RAFT_ROLE.LEADER &&
    status.lifecycleIncarnation ===
      value?.sourceLifecycle?.lifecycleIncarnation &&
    service.cdcSourceScopeEvidence?.scopeId === value?.sourceScope?.scopeId;
}

function refusal(reason, deferRetry) {
  return Object.freeze({state: CDC_COVERAGE_RESPONSE_STATE.REFUSED,
    reason, deferRetry});
}

function observationForOffer(scope, domain, pageStart, nextKey, appliedIndex,
  sourceLifecycle, row, rowKey) {
  const logicalCoverage = Object.freeze({scopeId: scope.scopeId,
    tableName: scope.tableName, domainDigest: domain.domainDigest,
    lower: pageStart, upper: nextKey,
    coverageId: cdcCoverageCellId({scopeId: scope.scopeId,
      domainDigest: domain.domainDigest, lower: pageStart, upper: nextKey})});
  const sourcePrefix = Object.freeze({partitionId: scope.partitionId,
    scopeId: scope.scopeId, appliedIndex});
  const rowDigest = digest({key: rowKey, row});
  const observationDigest = digest({sourceScope: scope, logicalCoverage,
    sourcePrefix, sourceLifecycle, rows: [{key: rowKey, rowDigest}]});
  return {logicalCoverage, sourcePrefix, observationDigest};
}

function invalidCapturedKeys(rowKey, nextKey) {
  return !validCdcCoverageKey(rowKey) ||
    nextKey !== null && !validCdcCoverageKey(nextKey);
}

function captureReservedRow(service, options, binding, reservation, transferId) {
  const {scope, domain, pageStart, appliedIndex, sourceLifecycle} = options;
  const row = materializeRow(service, scope, domain, pageStart, 0);
  if (!validCdcCoverageRow(domain, row)) {
    return refusal(CDC_COVERAGE_TRANSFER_REFUSAL.IDENTITY_INVALID, false);
  }
  const rowKey = resolveCoverageRowKey(scope.tableName, row);
  const nextKey = materializeKey(service, scope, domain, pageStart, 1);
  if (invalidCapturedKeys(rowKey, nextKey)) {
    return refusal(CDC_COVERAGE_TRANSFER_REFUSAL.IDENTITY_INVALID, false);
  }
  const payload = encodeCoverageRow(domain, row);
  if (payload === null || payload.length > reservation.maxEncodedBytes) {
    return refusal(CDC_COVERAGE_TRANSFER_REFUSAL.IDENTITY_INVALID, false);
  }
  const captured = observationForOffer(scope, domain, pageStart, nextKey,
    appliedIndex, sourceLifecycle, row, rowKey);
  const chunkBytes = CDC_COVERAGE_TRANSFER_DEFAULT.CHUNK_BYTES;
  const value = Object.freeze({binding, payload, payloadDigest: sha256Hex(payload),
    chunkBytes, chunkCount: Math.ceil(payload.length / chunkBytes), rowKey,
    nextPageStart: nextKey, sourceScope: scope, domain,
    sourcePrefix: captured.sourcePrefix, sourceLifecycle,
    logicalCoverage: captured.logicalCoverage,
    observationDigest: captured.observationDigest});
  if (!setCdcCoverageTransferValue(service, transferId, value)) {
    return refusal(CDC_COVERAGE_TRANSFER_REFUSAL.SESSION_MISSING, true);
  }
  return Object.freeze({state: CDC_COVERAGE_RESPONSE_STATE.OFFER,
    transferId, ...binding, totalBytes: payload.length,
    chunkBytes, chunkCount: value.chunkCount,
    payloadDigest: value.payloadDigest, rowKey,
    nextPageStart: nextKey, sourceScope: scope, domain,
    sourcePrefix: captured.sourcePrefix, sourceLifecycle,
    logicalCoverage: captured.logicalCoverage,
    observationDigest: captured.observationDigest});
}

function captureLargeCoverageRow(service, options) {
  const {scope, domain, pageStart} = options;
  const binding = requestBinding(options);
  const now = service?.timeSource?.now?.();
  if (binding === null || Number.isFinite(now) && now >= binding.deadlineMs) {
    return refusal(CDC_COVERAGE_TRANSFER_REFUSAL.IDENTITY_INVALID, false);
  }
  const probe = probeRow(service, scope, domain, pageStart, 0);
  const rawBytes = probeRawBytes(domain, probe);
  const nextKeyBytes = probeKeyBytes(service, scope, domain, pageStart, 1);
  const reservedRawBytes = rawBytes === null || nextKeyBytes === null ? null :
    boundedSum([rawBytes, nextKeyBytes]);
  const reservation = reservedRawBytes === null ? null :
    peakReservation(reservedRawBytes, domain.columns.length + 1);
  if (reservation === null) {
    return refusal(CDC_COVERAGE_TRANSFER_REFUSAL.IDENTITY_INVALID, false);
  }
  const transferId = randomUUID();
  const reservationNow = service?.timeSource?.now?.();
  if (Number.isFinite(reservationNow) &&
      reservationNow >= binding.deadlineMs) {
    return refusal(CDC_COVERAGE_TRANSFER_REFUSAL.IDENTITY_INVALID, false);
  }
  const ttlMs = Number.isFinite(reservationNow) ? Math.max(1, Math.min(
    CDC_COVERAGE_TRANSFER_DEFAULT.SESSION_TTL_MS,
    Math.floor(binding.deadlineMs - reservationNow))) :
    CDC_COVERAGE_TRANSFER_DEFAULT.SESSION_TTL_MS;
  const session = reserveCdcCoverageTransfer(service, {transferId,
    retainedBytes: reservation.retainedBytes, category: 'source', ttlMs});
  if (session === null) {
    return refusal(CDC_COVERAGE_TRANSFER_REFUSAL.CAPACITY_UNAVAILABLE, true);
  }
  try {
    return captureReservedRow(
      service, options, binding, reservation, transferId);
  } finally {
    if (session.value === null) releaseCdcCoverageTransfer(service, transferId);
  }
}

function readCoverageTransferChunk(service, options) {
  const binding = requestBinding(options);
  const session = typeof options.transferId === 'string' ?
    readCdcCoverageTransfer(service, options.transferId) : null;
  if (!session?.value || !exactBinding(session.value.binding, binding)) {
    return refusal(CDC_COVERAGE_TRANSFER_REFUSAL.SESSION_MISSING, true);
  }
  if (!sourceSessionIsCurrent(service, session.value) ||
      service.timeSource?.now?.() >= session.value.binding.deadlineMs) {
    releaseCdcCoverageTransfer(service, options.transferId);
    return refusal(CDC_COVERAGE_TRANSFER_REFUSAL.SESSION_MISSING, true);
  }
  const ordinal = options.chunkOrdinal;
  if (!Number.isSafeInteger(ordinal) || ordinal < 0 ||
      ordinal >= session.value.chunkCount) {
    return refusal(CDC_COVERAGE_TRANSFER_REFUSAL.IDENTITY_INVALID, false);
  }
  const start = ordinal * session.value.chunkBytes;
  const end = Math.min(session.value.payload.length,
    start + session.value.chunkBytes);
  const chunk = session.value.payload.subarray(start, end);
  const result = Object.freeze({state: CDC_COVERAGE_RESPONSE_STATE.CHUNK,
    transferId: options.transferId, ...binding, chunkOrdinal: ordinal,
    chunkBytes: chunk.length, chunkDigest: sha256Hex(chunk),
    dataBase64: chunk.toString(CDC_COVERAGE_CODEC.BASE64)});
  return result;
}

function cancelCoverageTransfer(service, options) {
  const binding = requestBinding(options);
  const session = typeof options.transferId === 'string' ?
    readCdcCoverageTransfer(service, options.transferId) : null;
  if (!session?.value || !exactBinding(session.value.binding, binding)) {
    return refusal(CDC_COVERAGE_TRANSFER_REFUSAL.SESSION_MISSING, true);
  }
  releaseCdcCoverageTransfer(service, options.transferId);
  return Object.freeze({state: CDC_COVERAGE_RESPONSE_STATE.CANCELLED,
    transferId: options.transferId, ...binding});
}

function handleCoverageTransferRequest(service, options) {
  if (options.mode === CDC_COVERAGE_REQUEST_MODE.CHUNK) {
    return readCoverageTransferChunk(service, options);
  }
  if (options.mode === CDC_COVERAGE_REQUEST_MODE.CANCEL) {
    return cancelCoverageTransfer(service, options);
  }
  return null;
}

export {
  CDC_COVERAGE_TRANSFER_REFUSAL,
  captureLargeCoverageRow,
  consumerTransferReservationBytes,
  decodeCoverageRow,
  encodeCoverageRow,
  handleCoverageTransferRequest,
  materializeKey as materializeCoverageKey,
  materializeRow as materializeCoverageRow,
  ordinaryCoverageRowByteBound,
  peakReservation,
  probeKeyBytes as probeCoverageKeyBytes,
  probeRow as probeCoverageRow,
  probeRawBytes,
  requestBinding,
  sourcePageReservationBytes,
};
