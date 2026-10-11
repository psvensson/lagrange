import {createHash} from 'node:crypto';
import {resolveSystemCacheRowKey as resolveCoverageRowKey} from
  '../cache/system-cache-key-descriptor.js';
import {
  resolveCdcCoverageDomain,
  validCdcCoverageRow,
} from './cdc-coverage-domain.js';
import {
  CDC_COVERAGE_TRANSFER_DEFAULT,
  readCdcCoverageTransfer,
  releaseCdcCoverageTransfer,
  releaseCdcCoverageTransferSession,
  reserveCdcCoverageTransfer,
  setCdcCoverageTransferValue,
} from './cdc-coverage-transfer-owner.js';
import {
  consumerTransferReservationBytes,
  decodeCoverageRow,
} from '../partition/partition-cdc-coverage-transfer.js';
import {CDC_COVERAGE_RESPONSE_STATE} from './cdc-coverage-protocol.js';
import {RAFT_ROLE} from '../raft/constants.js';

const CDC_COVERAGE_FRAGMENT_REASON = Object.freeze({
  CAPACITY_UNAVAILABLE: 'cdc_coverage_capacity_unavailable',
  CHUNK_INVALID: 'cdc_coverage_chunk_ordinal_invalid',
  DIGEST_INVALID: 'cdc_coverage_digest_invalid',
  IDENTITY_INVALID: 'cdc_coverage_identity_invalid',
  SESSION_MISSING: 'cdc_coverage_transfer_session_missing',
});
const CDC_COVERAGE_DIGEST = Object.freeze({
  ALGORITHM: 'sha256',
  ENCODING: 'hex',
});
const CDC_COVERAGE_CHUNK_ENCODING = 'base64';
const CDC_COVERAGE_LIFECYCLE_STALE =
  'cdc_coverage_reconcile_lifecycle_stale';

function sha256Hex(bytes) {
  return createHash(CDC_COVERAGE_DIGEST.ALGORITHM).update(bytes)
    .digest(CDC_COVERAGE_DIGEST.ENCODING);
}

function deferred(reasonCode) {
  return Object.freeze({success: false, deferRetry: true, reasonCode});
}

function failed(reasonCode) {
  return Object.freeze({success: false, deferRetry: false, reasonCode});
}

function exactBinding(value, binding) {
  return value?.requestId === binding.requestId &&
    value?.targetNodeId === binding.targetNodeId &&
    value?.targetLifecycleId === binding.targetLifecycleId &&
    value?.reconcileGenerationId === binding.reconcileGenerationId &&
    value?.deadlineMs === binding.deadlineMs;
}

function validateOffer(offer, binding, scope, pageStart) {
  const domain = resolveCdcCoverageDomain(scope.tableName);
  if (offer?.state !== CDC_COVERAGE_RESPONSE_STATE.OFFER ||
      offer.success !== true || !exactBinding(offer, binding) ||
      typeof offer.transferId !== 'string' || offer.transferId.length === 0 ||
      offer.sourceScope?.scopeId !== scope.scopeId ||
      offer.domain?.domainDigest !== domain?.domainDigest ||
      offer.logicalCoverage?.lower !== pageStart ||
      offer.logicalCoverage?.upper !== offer.nextPageStart ||
      offer.logicalCoverage?.scopeId !== scope.scopeId ||
      typeof offer.sourceLifecycle?.lifecycleIncarnation !== 'string' ||
      offer.sourceLifecycle.role !== RAFT_ROLE.LEADER ||
      typeof offer.rowKey !== 'string' || offer.rowKey.length === 0 ||
      !Number.isSafeInteger(offer.totalBytes) || offer.totalBytes <= 0 ||
      offer.chunkBytes !== CDC_COVERAGE_TRANSFER_DEFAULT.CHUNK_BYTES ||
      !Number.isSafeInteger(offer.chunkCount) || offer.chunkCount <= 0 ||
      offer.chunkCount !== Math.ceil(offer.totalBytes / offer.chunkBytes) ||
      typeof offer.payloadDigest !== 'string' ||
      !/^[0-9a-f]{64}$/u.test(offer.payloadDigest)) {
    return null;
  }
  return domain;
}

function decodeChunk(chunkResult, offer, binding, ordinal) {
  if (chunkResult?.success !== true ||
      chunkResult.state !== CDC_COVERAGE_RESPONSE_STATE.CHUNK ||
      chunkResult.transferId !== offer.transferId ||
      !exactBinding(chunkResult, binding) ||
      chunkResult.chunkOrdinal !== ordinal ||
      typeof chunkResult.dataBase64 !== 'string' ||
      typeof chunkResult.chunkDigest !== 'string') return null;
  const expectedBytes = Math.min(offer.chunkBytes,
    offer.totalBytes - ordinal * offer.chunkBytes);
  // A base64 decoder sizes its output from the supplied string.  Check the
  // one canonical encoded length before asking it to allocate, so a peer
  // cannot turn an admitted 512 KiB chunk into an unaccounted allocation.
  const expectedEncodedBytes = 4 * Math.ceil(expectedBytes / 3);
  if (!Number.isSafeInteger(expectedEncodedBytes) ||
      chunkResult.dataBase64.length !== expectedEncodedBytes) return null;
  const bytes = Buffer.from(chunkResult.dataBase64,
    CDC_COVERAGE_CHUNK_ENCODING);
  return bytes.length === expectedBytes &&
    chunkResult.chunkBytes === expectedBytes &&
    bytes.toString(CDC_COVERAGE_CHUNK_ENCODING) === chunkResult.dataBase64 &&
    sha256Hex(bytes) === chunkResult.chunkDigest ? bytes : null;
}

async function consumeCdcCoverageOffer(service, options) {
  const {binding, context, offer, pageStart, publicationBytes = 0,
    readChunk, scope} = options;
  if (!context.isCurrent()) {
    return deferred(CDC_COVERAGE_LIFECYCLE_STALE);
  }
  const domain = validateOffer(offer, binding, scope, pageStart);
  if (domain === null) {
    return failed(CDC_COVERAGE_FRAGMENT_REASON.IDENTITY_INVALID);
  }
  const reservationBytes = consumerTransferReservationBytes(
    offer.totalBytes, publicationBytes);
  const remainingMs = Math.floor(context.remainingMs());
  const session = reservationBytes === null ? null :
    reserveCdcCoverageTransfer(service, {
      transferId: offer.transferId,
      retainedBytes: reservationBytes,
      category: 'consumer',
      ttlMs: Math.max(1, remainingMs),
    });
  if (session === null) {
    return deferred(CDC_COVERAGE_FRAGMENT_REASON.CAPACITY_UNAVAILABLE);
  }
  const chunks = [];
  if (!setCdcCoverageTransferValue(service, offer.transferId,
    Object.freeze({binding, offer, chunks}))) {
    releaseCdcCoverageTransfer(service, offer.transferId);
    return deferred(CDC_COVERAGE_FRAGMENT_REASON.SESSION_MISSING);
  }
  try {
    for (let ordinal = 0; ordinal < offer.chunkCount; ordinal += 1) {
      if (!context.isCurrent() || context.remainingMs() <= 0 ||
          readCdcCoverageTransfer(service, offer.transferId) !== session) {
        return deferred(CDC_COVERAGE_FRAGMENT_REASON.SESSION_MISSING);
      }
      const chunkResult = await readChunk(ordinal);
      if (chunkResult?.success !== true) {
        return chunkResult;
      }
      const bytes = decodeChunk(chunkResult, offer, binding, ordinal);
      if (bytes === null) {
        return failed(CDC_COVERAGE_FRAGMENT_REASON.CHUNK_INVALID);
      }
      chunks.push(bytes);
    }
    if (!context.isCurrent()) {
      return deferred(CDC_COVERAGE_LIFECYCLE_STALE);
    }
    const payload = Buffer.concat(chunks, offer.totalBytes);
    if (payload.length !== offer.totalBytes ||
        sha256Hex(payload) !== offer.payloadDigest) {
      return failed(CDC_COVERAGE_FRAGMENT_REASON.DIGEST_INVALID);
    }
    const row = decodeCoverageRow(domain, payload);
    if (!validCdcCoverageRow(domain, row) ||
        resolveCoverageRowKey(scope.tableName, row) !== offer.rowKey) {
      return failed(CDC_COVERAGE_FRAGMENT_REASON.IDENTITY_INVALID);
    }
    return Object.freeze({success: true, page: Object.freeze({
      ...offer,
      state: CDC_COVERAGE_RESPONSE_STATE.COMPLETE,
      rows: Object.freeze([Object.freeze(row)]),
    })});
  } finally {
    releaseCdcCoverageTransferSession(service, offer.transferId, session);
  }
}

export {
  CDC_COVERAGE_FRAGMENT_REASON,
  consumeCdcCoverageOffer,
  decodeChunk,
};
