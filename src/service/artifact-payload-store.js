/**
 * Cluster-owned artifact payload store (brief
 * docs/development/cluster-owned-artifacts-parallel-dispatch-brief.md §1):
 * the sole chunked write / seal / verified-read owner for the internal
 * `artifact_payloads` + `artifact_payload_chunks` system tables.
 *
 * All persistence goes through the injected `executeInternal(sql, params)`
 * executor on the NORMAL replicated write path — no filesystem, no CDC or
 * system-table-cache reads, no separate blob store. Chunk bytes ride as
 * base64 TEXT because Raft log entries are JSON-serialized and raw binary
 * SQL parameters do not survive replication; every digest is computed
 * over the DECODED bytes.
 *
 * Write discipline (mirrors call-activation-lease-owner and the reduce
 * coordinator): a duplicate-key INSERT on a replicated table surfaces as
 * an opaque participant failure, never a clean constraint error, so no
 * caught INSERT error is ever trusted to mean "already exists" — the row
 * is re-read and compared instead. Sealing is a guarded single-row UPDATE
 * (state UPLOADING -> SEALED) verified by re-read, so byte-identical
 * retries converge to SEALED from any interruption point while a
 * conflicting retry (same digest, different identity or chunk layout)
 * fails closed with a typed error.
 */

import {createHash} from 'node:crypto';

import {SYSTEM_TABLE_NAME} from
  '../bootstrap/system-table-schemas-constants.js';
import {ARTIFACT_PAYLOAD_STATE} from
  '../bootstrap/system-table-artifact-schema-definitions.js';

// One fixed chunking policy constant (brief §1 "Chunk Payloads"): 1 MiB,
// matching the Raft snapshot bulk-transfer chunk geometry
// (src/raft/snapshot-transfer-constants.js).
const ARTIFACT_PAYLOAD_KIB = 1024;
const ARTIFACT_PAYLOAD_CHUNK_SIZE_BYTES =
  ARTIFACT_PAYLOAD_KIB * ARTIFACT_PAYLOAD_KIB;
// Default payload bound, matching DEFAULT_MAX_COMPONENT_BYTES in
// src/service/installable-service-artifact-resolver.js (256 MiB).
const ARTIFACT_PAYLOAD_DEFAULT_MAX_BYTES =
  256 * ARTIFACT_PAYLOAD_KIB * ARTIFACT_PAYLOAD_KIB;

// Digest grammar shared with the installable-service artifact resolver:
// `sha256:<64 lowercase hex>`, computed over the raw payload bytes.
const ARTIFACT_PAYLOAD_DIGEST_PATTERN = /^sha256:[0-9a-f]{64}$/;
const ARTIFACT_PAYLOAD_HASH_ALGORITHM = 'sha256';
const ARTIFACT_PAYLOAD_DIGEST_PREFIX = 'sha256:';
const ARTIFACT_PAYLOAD_HEX_ENCODING = 'hex';
const ARTIFACT_PAYLOAD_BASE64_ENCODING = 'base64';

const ARTIFACT_PAYLOAD_STORE_ERROR_NAME = 'ArtifactPayloadStoreError';

const ARTIFACT_PAYLOAD_ERROR_CODE = Object.freeze({
  CHUNK_DIGEST_MISMATCH: 'artifact_payload_chunk_digest_mismatch',
  CHUNK_MISSING: 'artifact_payload_chunk_missing',
  CHUNK_SIZE_MISMATCH: 'artifact_payload_chunk_size_mismatch',
  CONFLICTING_PAYLOAD: 'artifact_payload_conflicting_payload',
  DIGEST_FORMAT_INVALID: 'artifact_payload_digest_format_invalid',
  INVALID_ARGUMENT: 'artifact_payload_invalid_argument',
  PAYLOAD_DIGEST_MISMATCH: 'artifact_payload_digest_mismatch',
  PAYLOAD_MISSING: 'artifact_payload_missing',
  PAYLOAD_OVERSIZED: 'artifact_payload_oversized',
  PAYLOAD_SIZE_MISMATCH: 'artifact_payload_size_mismatch',
  PAYLOAD_UNSEALED: 'artifact_payload_unsealed',
  QUERY_FAILED: 'artifact_payload_query_failed',
  SEAL_FAILED: 'artifact_payload_seal_failed',
});

const ARTIFACT_PAYLOAD_MESSAGE = Object.freeze({
  BYTES_REQUIRED:
    'putPayload requires bytes as a Buffer or Uint8Array',
  CHUNK_CONFLICT:
    'an existing chunk row conflicts with the payload chunk layout',
  CHUNK_DIGEST_MISMATCH:
    'a stored chunk fails digest verification over its decoded bytes',
  CHUNK_MISSING: 'a payload chunk row is missing',
  CHUNK_SIZE_MISMATCH:
    'a stored chunk decoded size differs from its recorded chunk size',
  CONSTRUCTOR_REQUIRES:
    'createArtifactPayloadStore requires an executeInternal function',
  DIGEST_FORMAT_INVALID:
    'digest must use the sha256:<64 lowercase hex> format',
  INPUT_DIGEST_MISMATCH:
    'the provided bytes do not hash to the claimed payload digest',
  MEDIA_TYPE_REQUIRED: 'putPayload requires a non-empty media type',
  PAYLOAD_CONFLICT:
    'an existing payload row conflicts with the requested identity',
  PAYLOAD_DIGEST_MISMATCH:
    'the reassembled payload fails digest verification',
  PAYLOAD_MISSING: 'no payload row exists for the requested digest',
  PAYLOAD_OVERSIZED: 'the payload exceeds the configured byte bound',
  PAYLOAD_ROW_UNREADABLE:
    'the payload row is unreadable after a verified write',
  PAYLOAD_SIZE_MISMATCH:
    'the stored payload size differs from the sealed metadata',
  PAYLOAD_UNSEALED: 'the payload row exists but is not SEALED',
  QUERY_FAILED: 'artifact payload store query failed',
  SEALED_LOG: 'artifact payload sealed',
  SEAL_UNVERIFIED:
    'the payload row did not verify as SEALED after the guarded seal',
});

const PAYLOAD_TABLE = SYSTEM_TABLE_NAME.ARTIFACT_PAYLOADS;
const CHUNK_TABLE = SYSTEM_TABLE_NAME.ARTIFACT_PAYLOAD_CHUNKS;
const PAYLOAD_COLUMN_LIST =
  'payload_digest, artifact_digest, media_type, total_size, ' +
  'chunk_count, state, created_at, sealed_at';
const CHUNK_COLUMN_LIST =
  'payload_digest, chunk_number, chunk_digest, chunk_size, ' +
  'chunk_bytes_base64';

const SELECT_PAYLOAD_SQL =
  `SELECT ${PAYLOAD_COLUMN_LIST} FROM ${PAYLOAD_TABLE} ` +
  'WHERE payload_digest = $1';
const SELECT_PAYLOADS_BY_ARTIFACT_SQL =
  `SELECT ${PAYLOAD_COLUMN_LIST} FROM ${PAYLOAD_TABLE} ` +
  'WHERE artifact_digest = $1';
const INSERT_PAYLOAD_SQL =
  `INSERT INTO ${PAYLOAD_TABLE} (${PAYLOAD_COLUMN_LIST}) ` +
  'VALUES ($1, $2, $3, $4, $5, $6, $7, $8)';
const SEAL_PAYLOAD_SQL =
  `UPDATE ${PAYLOAD_TABLE} SET state = $1, sealed_at = $2 ` +
  'WHERE payload_digest = $3 AND state = $4';
const SELECT_CHUNK_SQL =
  `SELECT ${CHUNK_COLUMN_LIST} FROM ${CHUNK_TABLE} ` +
  'WHERE payload_digest = $1 AND chunk_number = $2';
// The multi-row chunk read DELIBERATELY does not project payload_digest:
// the engine serves single-table system-table selects whose projection
// includes the table's primary-key field from the node-local
// authoritative view, which merges rows keyed by that single field - and
// that would collapse every chunk row into one per payload. Omitting the
// key (the caller already holds it) keeps this read on the normal
// partition read path that returns every row. The reduce coordinator's
// slot read omits invocation_id for the same reason.
const SELECT_CHUNKS_SQL =
  'SELECT chunk_number, chunk_digest, chunk_size, chunk_bytes_base64 ' +
  `FROM ${CHUNK_TABLE} ` +
  'WHERE payload_digest = $1 ORDER BY chunk_number';
const INSERT_CHUNK_SQL =
  `INSERT INTO ${CHUNK_TABLE} (${CHUNK_COLUMN_LIST}) ` +
  'VALUES ($1, $2, $3, $4, $5)';

/**
 * Typed error surface of the artifact payload store. `code` is always a
 * value of ARTIFACT_PAYLOAD_ERROR_CODE; `details` carries the failing
 * identity (payload digest, chunk number) for corruption diagnosis.
 */
class ArtifactPayloadStoreError extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.name = ARTIFACT_PAYLOAD_STORE_ERROR_NAME;
    this.code = code;
    this.details = Object.freeze({...details});
  }
}

function failTyped(code, message, details) {
  throw new ArtifactPayloadStoreError(code, message, details);
}

const ARTIFACT_PAYLOAD_SQL_QUOTE_ESCAPE = '\'\'';

function sqlLiteral(value) {
  return typeof value === 'number' && Number.isFinite(value) ?
    String(value) :
    `'${String(value).replace(/'/g, ARTIFACT_PAYLOAD_SQL_QUOTE_ESCAPE)}'`;
}

function sha256DigestOf(bytes) {
  return ARTIFACT_PAYLOAD_DIGEST_PREFIX +
    createHash(ARTIFACT_PAYLOAD_HASH_ALGORITHM)
      .update(bytes)
      .digest(ARTIFACT_PAYLOAD_HEX_ENCODING);
}

function isDigestString(value) {
  return typeof value === 'string' &&
    ARTIFACT_PAYLOAD_DIGEST_PATTERN.test(value);
}

function toPayloadBuffer(bytes) {
  if (Buffer.isBuffer(bytes)) {
    return bytes;
  }
  if (bytes instanceof Uint8Array) {
    return Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  }
  return null;
}

function resultRows(result) {
  return result?.results || result?.rows || [];
}

// Deterministic bounded chunk layout: zero-based chunk numbers, each
// chunk digest computed over exactly its raw byte slice.
function buildChunkLayout(buffer, chunkSizeBytes) {
  const chunkCount = Math.ceil(buffer.length / chunkSizeBytes);
  const chunks = [];
  for (let index = 0; index < chunkCount; index += 1) {
    const chunkBytes = buffer.subarray(
      index * chunkSizeBytes,
      Math.min((index + 1) * chunkSizeBytes, buffer.length),
    );
    chunks.push({
      chunkBytes,
      chunkDigest: sha256DigestOf(chunkBytes),
      chunkNumber: index,
      chunkSize: chunkBytes.length,
    });
  }
  return chunks;
}

function payloadIdentityConflicts(row, identity) {
  return row.artifact_digest !== identity.artifactDigest ||
    row.media_type !== identity.mediaType ||
    Number(row.total_size) !== identity.totalSize ||
    Number(row.chunk_count) !== identity.chunkCount;
}

function newestSealedFirst(left, right) {
  return (Number(right.sealed_at) - Number(left.sealed_at)) ||
    (Number(right.created_at) - Number(left.created_at)) ||
    (left.payload_digest < right.payload_digest ? 1 : -1);
}

/**
 * Create the artifact payload store owner.
 *
 * @param {object} options {executeInternal (required), nowProvider,
 *   chunkSizeBytes, maxPayloadBytes, logger}
 * @return {object} frozen {putPayload, getSealedPayload,
 *   findSealedPayloadByArtifactDigest}
 */
function createArtifactPayloadStore(options = {}) {
  const executeInternal = options.executeInternal;
  if (typeof executeInternal !== 'function') {
    throw new TypeError(ARTIFACT_PAYLOAD_MESSAGE.CONSTRUCTOR_REQUIRES);
  }
  const nowProvider = typeof options.nowProvider === 'function' ?
    options.nowProvider :
    Date.now;
  const chunkSizeBytes =
    Number.isInteger(options.chunkSizeBytes) && options.chunkSizeBytes > 0 ?
      options.chunkSizeBytes :
      ARTIFACT_PAYLOAD_CHUNK_SIZE_BYTES;
  const maxPayloadBytes =
    Number.isInteger(options.maxPayloadBytes) && options.maxPayloadBytes > 0 ?
      options.maxPayloadBytes :
      ARTIFACT_PAYLOAD_DEFAULT_MAX_BYTES;
  const logger = options.logger || null;

  // The engine's internal path executes inline-literal SQL on the
  // default dialect, exactly like the sibling call-cell owners: the
  // $n-parameterized postgresql path resolves multi-row-per-key reads
  // through a keyed local lookup that collapses the chunk set to one
  // row per payload_digest (observed live), while the inline path's
  // multi-row reads are production-proven by the reduce coordinator.
  // The $n templates above stay as templates; parameters are rendered
  // into them as escaped literals here, at the single dispatch seam.
  function renderParamsInline(sql, params) {
    let rendered = sql;
    for (let index = params.length; index >= 1; index -= 1) {
      rendered = rendered
        .split(`$${index}`)
        .join(sqlLiteral(params[index - 1]));
    }
    return rendered;
  }

  async function runQuery(sql, params) {
    const result = await executeInternal(
      renderParamsInline(sql, params), []);
    if (result?.success === false) {
      failTyped(
        ARTIFACT_PAYLOAD_ERROR_CODE.QUERY_FAILED,
        result?.error || ARTIFACT_PAYLOAD_MESSAGE.QUERY_FAILED,
      );
    }
    return result;
  }

  async function readPayloadRow(payloadDigest) {
    const result = await runQuery(SELECT_PAYLOAD_SQL, [payloadDigest]);
    return resultRows(result)[0] || null;
  }

  async function readChunkRow(payloadDigest, chunkNumber) {
    const result = await runQuery(
      SELECT_CHUNK_SQL, [payloadDigest, chunkNumber],
    );
    return resultRows(result)[0] || null;
  }

  function requireIdentityMatch(row, identity) {
    if (payloadIdentityConflicts(row, identity)) {
      failTyped(
        ARTIFACT_PAYLOAD_ERROR_CODE.CONFLICTING_PAYLOAD,
        ARTIFACT_PAYLOAD_MESSAGE.PAYLOAD_CONFLICT,
        {payloadDigest: identity.payloadDigest},
      );
    }
    return row;
  }

  // Insert-or-adopt the UPLOADING payload row. A caught INSERT error is
  // never trusted: the row is re-read, and only a present row with the
  // identical identity (a benign concurrent winner or an earlier
  // interrupted attempt) is adopted — anything else fails closed.
  async function adoptOrInsertPayloadRow(identity) {
    const existing = await readPayloadRow(identity.payloadDigest);
    if (existing) {
      return requireIdentityMatch(existing, identity);
    }
    try {
      await runQuery(INSERT_PAYLOAD_SQL, [
        identity.payloadDigest,
        identity.artifactDigest,
        identity.mediaType,
        identity.totalSize,
        identity.chunkCount,
        ARTIFACT_PAYLOAD_STATE.UPLOADING,
        Number(nowProvider()),
        0,
      ]);
    } catch (insertError) {
      const concurrent = await readPayloadRow(identity.payloadDigest);
      if (!concurrent) {
        throw insertError;
      }
      return requireIdentityMatch(concurrent, identity);
    }
    const written = await readPayloadRow(identity.payloadDigest);
    if (!written) {
      failTyped(
        ARTIFACT_PAYLOAD_ERROR_CODE.QUERY_FAILED,
        ARTIFACT_PAYLOAD_MESSAGE.PAYLOAD_ROW_UNREADABLE,
        {payloadDigest: identity.payloadDigest},
      );
    }
    return requireIdentityMatch(written, identity);
  }

  // Idempotent chunk write: INSERT, and on any failure re-read the chunk
  // row — identical chunk_digest + chunk_size is a benign duplicate
  // (interrupted-retry or concurrent writer), anything else is a
  // conflicting chunk layout and fails closed.
  async function writeChunkIdempotently(payloadDigest, chunk) {
    try {
      await runQuery(INSERT_CHUNK_SQL, [
        payloadDigest,
        chunk.chunkNumber,
        chunk.chunkDigest,
        chunk.chunkSize,
        chunk.chunkBytes.toString(ARTIFACT_PAYLOAD_BASE64_ENCODING),
      ]);
      return;
    } catch (insertError) {
      const existing = await readChunkRow(payloadDigest, chunk.chunkNumber);
      if (!existing) {
        throw insertError;
      }
      if (existing.chunk_digest !== chunk.chunkDigest ||
          Number(existing.chunk_size) !== chunk.chunkSize) {
        failTyped(
          ARTIFACT_PAYLOAD_ERROR_CODE.CONFLICTING_PAYLOAD,
          ARTIFACT_PAYLOAD_MESSAGE.CHUNK_CONFLICT,
          {chunkNumber: chunk.chunkNumber, payloadDigest},
        );
      }
    }
  }

  function requireVerifiedChunkBytes(chunkRow, chunkNumber, payloadDigest) {
    if (!chunkRow || Number(chunkRow.chunk_number) !== chunkNumber) {
      failTyped(
        ARTIFACT_PAYLOAD_ERROR_CODE.CHUNK_MISSING,
        ARTIFACT_PAYLOAD_MESSAGE.CHUNK_MISSING,
        {chunkNumber, payloadDigest},
      );
    }
    const decoded = Buffer.from(
      String(chunkRow.chunk_bytes_base64),
      ARTIFACT_PAYLOAD_BASE64_ENCODING,
    );
    if (decoded.length !== Number(chunkRow.chunk_size)) {
      failTyped(
        ARTIFACT_PAYLOAD_ERROR_CODE.CHUNK_SIZE_MISMATCH,
        ARTIFACT_PAYLOAD_MESSAGE.CHUNK_SIZE_MISMATCH,
        {chunkNumber, payloadDigest},
      );
    }
    if (sha256DigestOf(decoded) !== chunkRow.chunk_digest) {
      failTyped(
        ARTIFACT_PAYLOAD_ERROR_CODE.CHUNK_DIGEST_MISMATCH,
        ARTIFACT_PAYLOAD_MESSAGE.CHUNK_DIGEST_MISMATCH,
        {chunkNumber, payloadDigest},
      );
    }
    return decoded;
  }

  // Re-read every chunk row in chunk-number order and verify the count,
  // each chunk digest over its DECODED bytes, each chunk size, the total
  // size, and the reassembled full-payload digest. Any mismatch is a
  // typed corruption error naming the failing chunk.
  async function readVerifiedPayloadBytes(payloadRow) {
    const payloadDigest = payloadRow.payload_digest;
    const expectedChunkCount = Number(payloadRow.chunk_count);
    const result = await runQuery(SELECT_CHUNKS_SQL, [payloadDigest]);
    // The distributed read layer's ORDER BY compares as strings (a
    // recorded engine limitation: 10 sorts before 2), so the verified
    // ordering the chunk contract depends on is re-established here
    // numerically rather than trusted from the wire.
    const chunkRows = resultRows(result).slice().sort(
      (left, right) => Number(left.chunk_number) - Number(right.chunk_number));
    if (chunkRows.length > expectedChunkCount) {
      failTyped(
        ARTIFACT_PAYLOAD_ERROR_CODE.PAYLOAD_SIZE_MISMATCH,
        ARTIFACT_PAYLOAD_MESSAGE.PAYLOAD_SIZE_MISMATCH,
        {
          actualChunkCount: chunkRows.length,
          expectedChunkCount,
          payloadDigest,
        },
      );
    }
    const decodedChunks = [];
    for (let index = 0; index < expectedChunkCount; index += 1) {
      decodedChunks.push(requireVerifiedChunkBytes(
        chunkRows[index], index, payloadDigest,
      ));
    }
    const assembled = Buffer.concat(decodedChunks);
    if (assembled.length !== Number(payloadRow.total_size)) {
      failTyped(
        ARTIFACT_PAYLOAD_ERROR_CODE.PAYLOAD_SIZE_MISMATCH,
        ARTIFACT_PAYLOAD_MESSAGE.PAYLOAD_SIZE_MISMATCH,
        {payloadDigest},
      );
    }
    if (sha256DigestOf(assembled) !== payloadDigest) {
      failTyped(
        ARTIFACT_PAYLOAD_ERROR_CODE.PAYLOAD_DIGEST_MISMATCH,
        ARTIFACT_PAYLOAD_MESSAGE.PAYLOAD_DIGEST_MISMATCH,
        {payloadDigest},
      );
    }
    return assembled;
  }

  // Atomic seal: a guarded single-row UPDATE biting only on UPLOADING,
  // verified by re-read. A concurrent sealer winning the race leaves the
  // row SEALED, which the re-read accepts as benign success.
  async function sealPayload(payloadDigest) {
    await runQuery(SEAL_PAYLOAD_SQL, [
      ARTIFACT_PAYLOAD_STATE.SEALED,
      Number(nowProvider()),
      payloadDigest,
      ARTIFACT_PAYLOAD_STATE.UPLOADING,
    ]);
    const sealed = await readPayloadRow(payloadDigest);
    if (!sealed || sealed.state !== ARTIFACT_PAYLOAD_STATE.SEALED) {
      failTyped(
        ARTIFACT_PAYLOAD_ERROR_CODE.SEAL_FAILED,
        ARTIFACT_PAYLOAD_MESSAGE.SEAL_UNVERIFIED,
        {payloadDigest},
      );
    }
    return sealed;
  }

  function requireValidPutRequest(request) {
    if (!isDigestString(request.payloadDigest) ||
        !isDigestString(request.artifactDigest)) {
      failTyped(
        ARTIFACT_PAYLOAD_ERROR_CODE.DIGEST_FORMAT_INVALID,
        ARTIFACT_PAYLOAD_MESSAGE.DIGEST_FORMAT_INVALID,
      );
    }
    if (typeof request.mediaType !== 'string' ||
        request.mediaType.length === 0) {
      failTyped(
        ARTIFACT_PAYLOAD_ERROR_CODE.INVALID_ARGUMENT,
        ARTIFACT_PAYLOAD_MESSAGE.MEDIA_TYPE_REQUIRED,
      );
    }
    const buffer = toPayloadBuffer(request.bytes);
    if (!buffer) {
      failTyped(
        ARTIFACT_PAYLOAD_ERROR_CODE.INVALID_ARGUMENT,
        ARTIFACT_PAYLOAD_MESSAGE.BYTES_REQUIRED,
      );
    }
    const computedDigest = sha256DigestOf(buffer);
    if (computedDigest !== request.payloadDigest) {
      failTyped(
        ARTIFACT_PAYLOAD_ERROR_CODE.PAYLOAD_DIGEST_MISMATCH,
        ARTIFACT_PAYLOAD_MESSAGE.INPUT_DIGEST_MISMATCH,
        {computedDigest, payloadDigest: request.payloadDigest},
      );
    }
    if (buffer.length > maxPayloadBytes) {
      failTyped(
        ARTIFACT_PAYLOAD_ERROR_CODE.PAYLOAD_OVERSIZED,
        ARTIFACT_PAYLOAD_MESSAGE.PAYLOAD_OVERSIZED,
        {maxPayloadBytes, totalSize: buffer.length},
      );
    }
    return buffer;
  }

  /**
   * Durably store one immutable payload: verify the input digest, write
   * the UPLOADING row and every chunk idempotently, re-verify the whole
   * stored payload, then atomically seal. Byte-identical retries at any
   * interruption point converge to SEALED; conflicting retries fail
   * closed typed.
   *
   * @param {object} request {payloadDigest, artifactDigest, mediaType,
   *   bytes}
   * @return {Promise<object>} frozen {alreadySealed, chunkCount,
   *   payloadDigest, sealedAt, totalSize}
   */
  async function putPayload(request = {}) {
    const buffer = requireValidPutRequest(request);
    const chunks = buildChunkLayout(buffer, chunkSizeBytes);
    const identity = {
      artifactDigest: request.artifactDigest,
      chunkCount: chunks.length,
      mediaType: request.mediaType,
      payloadDigest: request.payloadDigest,
      totalSize: buffer.length,
    };
    const payloadRow = await adoptOrInsertPayloadRow(identity);
    if (payloadRow.state === ARTIFACT_PAYLOAD_STATE.SEALED) {
      return Object.freeze({
        alreadySealed: true,
        chunkCount: identity.chunkCount,
        payloadDigest: identity.payloadDigest,
        sealedAt: Number(payloadRow.sealed_at),
        totalSize: identity.totalSize,
      });
    }
    for (const chunk of chunks) {
      await writeChunkIdempotently(identity.payloadDigest, chunk);
    }
    await readVerifiedPayloadBytes(payloadRow);
    const sealedRow = await sealPayload(identity.payloadDigest);
    logger?.info?.(ARTIFACT_PAYLOAD_MESSAGE.SEALED_LOG, {
      chunkCount: identity.chunkCount,
      payloadDigest: identity.payloadDigest,
      totalSize: identity.totalSize,
    });
    return Object.freeze({
      alreadySealed: false,
      chunkCount: identity.chunkCount,
      payloadDigest: identity.payloadDigest,
      sealedAt: Number(sealedRow.sealed_at),
      totalSize: identity.totalSize,
    });
  }

  /**
   * Read one SEALED payload with full verification: every chunk digest
   * over decoded bytes, chunk count, total size, and the reassembled
   * payload digest. Absent or unsealed payloads and any corruption
   * refuse typed.
   *
   * @param {string} payloadDigest sha256:<hex> payload identity
   * @return {Promise<object>} frozen {artifactDigest, bytes, mediaType,
   *   totalSize}
   */
  async function getSealedPayload(payloadDigest) {
    if (!isDigestString(payloadDigest)) {
      failTyped(
        ARTIFACT_PAYLOAD_ERROR_CODE.DIGEST_FORMAT_INVALID,
        ARTIFACT_PAYLOAD_MESSAGE.DIGEST_FORMAT_INVALID,
      );
    }
    const payloadRow = await readPayloadRow(payloadDigest);
    if (!payloadRow) {
      failTyped(
        ARTIFACT_PAYLOAD_ERROR_CODE.PAYLOAD_MISSING,
        ARTIFACT_PAYLOAD_MESSAGE.PAYLOAD_MISSING,
        {payloadDigest},
      );
    }
    if (payloadRow.state !== ARTIFACT_PAYLOAD_STATE.SEALED) {
      failTyped(
        ARTIFACT_PAYLOAD_ERROR_CODE.PAYLOAD_UNSEALED,
        ARTIFACT_PAYLOAD_MESSAGE.PAYLOAD_UNSEALED,
        {payloadDigest, state: payloadRow.state},
      );
    }
    const bytes = await readVerifiedPayloadBytes(payloadRow);
    return Object.freeze({
      artifactDigest: payloadRow.artifact_digest,
      bytes,
      mediaType: payloadRow.media_type,
      totalSize: Number(payloadRow.total_size),
    });
  }

  /**
   * Metadata-only lookup (no chunk reads): the newest SEALED payload row
   * for an artifact digest, as an explicit variant — never a null.
   *
   * @param {string} artifactDigest sha256:<hex> artifact identity
   * @return {Promise<object>} frozen {found: false} or {found: true,
   *   payload: {payloadDigest, artifactDigest, mediaType, totalSize,
   *   chunkCount, createdAt, sealedAt}}
   */
  async function findSealedPayloadByArtifactDigest(artifactDigest) {
    if (!isDigestString(artifactDigest)) {
      failTyped(
        ARTIFACT_PAYLOAD_ERROR_CODE.DIGEST_FORMAT_INVALID,
        ARTIFACT_PAYLOAD_MESSAGE.DIGEST_FORMAT_INVALID,
      );
    }
    const result = await runQuery(
      SELECT_PAYLOADS_BY_ARTIFACT_SQL, [artifactDigest],
    );
    const sealedRows = resultRows(result)
      .filter((row) => row.state === ARTIFACT_PAYLOAD_STATE.SEALED)
      .sort(newestSealedFirst);
    if (sealedRows.length === 0) {
      return Object.freeze({found: false});
    }
    const newest = sealedRows[0];
    return Object.freeze({
      found: true,
      payload: Object.freeze({
        artifactDigest: newest.artifact_digest,
        chunkCount: Number(newest.chunk_count),
        createdAt: Number(newest.created_at),
        mediaType: newest.media_type,
        payloadDigest: newest.payload_digest,
        sealedAt: Number(newest.sealed_at),
        totalSize: Number(newest.total_size),
      }),
    });
  }

  return Object.freeze({
    findSealedPayloadByArtifactDigest,
    getSealedPayload,
    putPayload,
  });
}

export {
  ARTIFACT_PAYLOAD_CHUNK_SIZE_BYTES,
  ARTIFACT_PAYLOAD_ERROR_CODE,
  ArtifactPayloadStoreError,
  createArtifactPayloadStore,
};
