// Raft snapshot bulk-transfer RECEIVER state machine (quest
// raft-snapshot-bulk-transfer, R2/S3): offer admission (version, geometry,
// descriptor, identity/epoch), durable transfer-staging append with per-chunk
// fsync and a canonical progress marker, restart resume ONLY from the
// re-digested verified boundary (mismatch restarts from zero, typed), the
// streamed whole-payload completion digest, and publication with S1
// publication-token semantics (payload rename + dir fsync first, descriptor
// last via writeAtomicDurable). The wire codec, sender, and socket driver
// loops live in snapshot-transfer.js.

import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';

import {
  canonicalJsonBytes,
  ensureDirectory,
  exactKeys,
  fsyncDirectory,
  readCanonicalJson,
  sha256Digest,
  writeAtomicDurable,
} from '../runtime/oci-host-agent-durable-files.js';

import {
  RAFT_CHECKPOINT_DESCRIPTOR_FILE,
  RAFT_CHECKPOINT_PAYLOAD_FILE,
  RAFT_CHECKPOINT_VALIDATION_OUTCOME,
} from './snapshot-checkpoint-constants.js';
import {
  matchCheckpointIdentity,
  validateCheckpointDescriptor,
} from './snapshot-checkpoint-format.js';
import {readCheckpoint} from './snapshot-checkpoint-store.js';
import {
  RAFT_SNAPSHOT_TRANSFER_ABORT_REASON,
  RAFT_SNAPSHOT_TRANSFER_ACCEPT_OUTCOME,
  RAFT_SNAPSHOT_TRANSFER_CHUNK_OUTCOME,
  RAFT_SNAPSHOT_TRANSFER_CHUNK_SIZE_BYTES,
  RAFT_SNAPSHOT_TRANSFER_DIRNAME,
  RAFT_SNAPSHOT_TRANSFER_MESSAGE_KIND,
  RAFT_SNAPSHOT_TRANSFER_OUTCOME,
  RAFT_SNAPSHOT_TRANSFER_PROGRESS_MARKER_FIELDS,
  RAFT_SNAPSHOT_TRANSFER_PROGRESS_MARKER_FILE,
  RAFT_SNAPSHOT_TRANSFER_PROTOCOL_NAME,
  RAFT_SNAPSHOT_TRANSFER_PROTOCOL_VERSION,
  RAFT_SNAPSHOT_TRANSFER_RESUME_MODE,
  RAFT_SNAPSHOT_TRANSFER_STAGING_FILE,
} from './snapshot-transfer-constants.js';

const KIND = RAFT_SNAPSHOT_TRANSFER_MESSAGE_KIND;
const ABORT = RAFT_SNAPSHOT_TRANSFER_ABORT_REASON;
const OUTCOME = RAFT_SNAPSHOT_TRANSFER_OUTCOME;
const ACCEPT_OUTCOME = RAFT_SNAPSHOT_TRANSFER_ACCEPT_OUTCOME;
const CHUNK_OUTCOME = RAFT_SNAPSHOT_TRANSFER_CHUNK_OUTCOME;
const RESUME = RAFT_SNAPSHOT_TRANSFER_RESUME_MODE;
const VALIDATION = RAFT_CHECKPOINT_VALIDATION_OUTCOME;

const HASH_ALGORITHM = 'sha256';
const DIGEST_PREFIX = 'sha256:';
const DIGEST_ENCODING = 'hex';
const READ_BLOCK_BYTES = 65536;
const MARKER_READ_ERROR = 'transfer_marker_unreadable';
const RECEIVER_TYPEOF = Object.freeze({
  STRING: 'string',
  FUNCTION: 'function',
});

// Receiver state machine (typed, no null-state).
const RECEIVER_STATE = Object.freeze({
  RECEIVING: 'receiving',
  COMPLETED: 'completed',
  ABORTED: 'aborted',
});

/**
 * Build a frozen typed transfer result ({outcome, ...extra}).
 * @param {string} outcome one of RAFT_SNAPSHOT_TRANSFER_OUTCOME
 * @param {Object} [extra] additional frozen fields
 * @return {Object} frozen result
 */
function snapshotTransferResult(outcome, extra = {}) {
  return Object.freeze({outcome, ...extra});
}

/**
 * Build a frozen typed ABORTED transfer result.
 * @param {string} reason one of RAFT_SNAPSHOT_TRANSFER_ABORT_REASON
 * @param {Object} [extra] additional frozen fields
 * @return {Object} frozen aborted result
 */
function snapshotTransferAborted(reason, extra = {}) {
  return snapshotTransferResult(OUTCOME.ABORTED, {reason, ...extra});
}

/**
 * Chunk count for one payload under a chunk geometry.
 * @param {number} payloadByteLength sealed payload byte length
 * @param {number} chunkSizeBytes chunk geometry
 * @return {number} ceil(payloadByteLength / chunkSizeBytes)
 */
function snapshotTransferChunkCount(payloadByteLength, chunkSizeBytes) {
  return Math.ceil(payloadByteLength / chunkSizeBytes);
}

/**
 * Byte length of the chunk at one index (the final chunk may be short).
 * @param {number} payloadByteLength sealed payload byte length
 * @param {number} chunkSizeBytes chunk geometry
 * @param {number} chunkIndex zero-based chunk index
 * @return {number} the chunk's byte length
 */
function snapshotTransferChunkByteLength(
  payloadByteLength, chunkSizeBytes, chunkIndex) {
  return Math.min(
    chunkSizeBytes, payloadByteLength - chunkIndex * chunkSizeBytes);
}

function normalizeIdentitySource(expectedIdentity) {
  return typeof expectedIdentity === RECEIVER_TYPEOF.FUNCTION ?
    expectedIdentity :
    () => expectedIdentity;
}

/**
 * Remove stale transfer staging under {checkpointsRoot}/transfer/, keeping at
 * most the directory named by options.keepDirname. Invoked at transfer accept
 * (S3 owns staging cleanup; the boot-time sweep wiring arrives with S4).
 * @param {string} checkpointsRoot durable checkpoint root
 * @param {Object} [options] {keepDirname}
 * @return {Object} frozen {removed: string[]}
 */
function cleanupStaleTransferStaging(checkpointsRoot, options = {}) {
  const keepDirname = typeof options.keepDirname === RECEIVER_TYPEOF.STRING ?
    options.keepDirname :
    '';
  const transferRoot = path.join(
    checkpointsRoot, RAFT_SNAPSHOT_TRANSFER_DIRNAME);
  if (!fs.existsSync(transferRoot)) {
    return Object.freeze({removed: Object.freeze([])});
  }
  const removed = [];
  for (const entry of fs.readdirSync(transferRoot, {withFileTypes: true})) {
    if (entry.name === keepDirname) {
      continue;
    }
    fs.rmSync(path.join(transferRoot, entry.name),
      {recursive: true, force: true});
    removed.push(entry.name);
  }
  return Object.freeze({removed: Object.freeze(removed)});
}

function digestPrefixIntoHash(fd, byteLength, hash) {
  const block = Buffer.alloc(READ_BLOCK_BYTES);
  let offset = 0;
  while (offset < byteLength) {
    const want = Math.min(READ_BLOCK_BYTES, byteLength - offset);
    const got = fs.readSync(fd, block, 0, want, offset);
    if (got !== want) {
      return false;
    }
    hash.update(block.subarray(0, got));
    offset += got;
  }
  return true;
}

function digestOfHash(hash) {
  return `${DIGEST_PREFIX}${hash.copy().digest(DIGEST_ENCODING)}`;
}

// The completion whole-payload digest is STREAMED (crypto hash over a read
// stream) — never an S1-style whole-file readFileSync.
function streamedFileDigest(filePath) {
  return new Promise((resolve, reject) => {
    const hash = createHash(HASH_ALGORITHM);
    const stream = fs.createReadStream(filePath);
    stream.on('data', (bytes) => hash.update(bytes));
    stream.on('error', reject);
    stream.on('end', () => {
      resolve(`${DIGEST_PREFIX}${hash.digest(DIGEST_ENCODING)}`);
    });
  });
}

function readProgressMarker(markerPath) {
  try {
    return {present: true, marker: readCanonicalJson(markerPath, MARKER_READ_ERROR)};
  } catch {
    return {present: false, marker: Object.freeze({})};
  }
}

// A staged marker is structurally resumable only when its identity fields
// match the offered descriptor and its byte accounting matches durable
// staging on disk.
function isStructurallyResumableMarker(read, stagingPath, context) {
  const {descriptor, descriptorDigest, chunkSizeBytes} = context;
  const marker = read.marker;
  return read.present &&
    exactKeys(marker, RAFT_SNAPSHOT_TRANSFER_PROGRESS_MARKER_FIELDS) &&
    marker.generationIndex === descriptor.lastIncludedIndex &&
    marker.descriptorDigest === descriptorDigest &&
    Number.isSafeInteger(marker.verifiedChunkCount) &&
    marker.verifiedChunkCount > 0 &&
    Number.isSafeInteger(marker.verifiedByteLength) &&
    marker.verifiedByteLength ===
      Math.min(marker.verifiedChunkCount * chunkSizeBytes,
        descriptor.payloadByteLength) &&
    fs.existsSync(stagingPath) &&
    fs.statSync(stagingPath).size >= marker.verifiedByteLength;
}

// Decide the resume boundary for an accepted offer against durable staging.
// Only a marker whose identity fields match the offered descriptor AND whose
// staged prefix re-digests to the recorded verifiedPrefixDigest resumes; any
// other staged state restarts from zero (typed).
function resolveResumeBoundary(context) {
  const {transferDir} = context;
  const stagingPath = path.join(
    transferDir, RAFT_SNAPSHOT_TRANSFER_STAGING_FILE);
  const markerPath = path.join(
    transferDir, RAFT_SNAPSHOT_TRANSFER_PROGRESS_MARKER_FILE);
  if (!fs.existsSync(stagingPath) && !fs.existsSync(markerPath)) {
    return Object.freeze({mode: RESUME.FRESH});
  }
  const read = readProgressMarker(markerPath);
  const marker = read.marker;
  if (!isStructurallyResumableMarker(read, stagingPath, context)) {
    return Object.freeze({mode: RESUME.RESTARTED_FROM_ZERO});
  }
  const hash = createHash(HASH_ALGORITHM);
  const fd = fs.openSync(stagingPath, 'r');
  let complete;
  try {
    complete = digestPrefixIntoHash(fd, marker.verifiedByteLength, hash);
  } finally {
    fs.closeSync(fd);
  }
  if (!complete || digestOfHash(hash) !== marker.verifiedPrefixDigest) {
    return Object.freeze({mode: RESUME.RESTARTED_FROM_ZERO});
  }
  return Object.freeze({
    mode: RESUME.RESUMED_FROM_BOUNDARY,
    verifiedChunkCount: marker.verifiedChunkCount,
    verifiedByteLength: marker.verifiedByteLength,
    prefixHash: hash,
  });
}

/**
 * Create the receiver for one offered transfer. The receiver validates the
 * offer (version, geometry, descriptor, identity/epoch), appends verified
 * chunks to durable transfer staging with a canonical progress marker,
 * re-checks identity and the streamed whole-payload digest at completion, and
 * publishes the generation with S1 publication-token semantics.
 * @param {Object} options receiver options
 * @param {string} options.checkpointsRoot durable checkpoint root
 * @param {Object|Function} options.expectedIdentity receiver identity value
 *   or provider function (re-read at accept and completion for epoch checks)
 * @param {number} [options.chunkSizeBytes] pinned chunk geometry
 * @return {Object} the receiver ({acceptOffer, receiveChunkFrame, complete,
 *   cancel, verifiedChunkCount})
 */
function createSnapshotTransferReceiver(options) {
  const {checkpointsRoot} = options;
  const identityOf = normalizeIdentitySource(options.expectedIdentity);
  const chunkSizeBytes =
    options.chunkSizeBytes || RAFT_SNAPSHOT_TRANSFER_CHUNK_SIZE_BYTES;
  const session = {
    state: RECEIVER_STATE.RECEIVING,
    accepted: false,
    transferId: '',
    descriptor: Object.freeze({}),
    descriptorDigest: '',
    chunkCount: 0,
    verifiedChunkCount: 0,
    verifiedByteLength: 0,
    fd: -1,
    prefixHash: createHash(HASH_ALGORITHM),
    transferDir: '',
  };

  const stagingPath = () =>
    path.join(session.transferDir, RAFT_SNAPSHOT_TRANSFER_STAGING_FILE);
  const markerPath = () =>
    path.join(session.transferDir, RAFT_SNAPSHOT_TRANSFER_PROGRESS_MARKER_FILE);

  const closeStagingFd = () => {
    if (session.fd >= 0) {
      fs.closeSync(session.fd);
      session.fd = -1;
    }
  };

  const discardStaging = () => {
    closeStagingFd();
    if (session.transferDir) {
      fs.rmSync(session.transferDir, {recursive: true, force: true});
    }
  };

  const rejectOffer = (reason, reasons = []) => Object.freeze({
    outcome: ACCEPT_OUTCOME.REJECTED,
    reason,
    reasons: Object.freeze([...reasons]),
  });

  const validateOfferShape = (offer) => {
    if (!offer || offer.kind !== KIND.OFFER ||
        offer.protocolName !== RAFT_SNAPSHOT_TRANSFER_PROTOCOL_NAME ||
        offer.protocolVersion !== RAFT_SNAPSHOT_TRANSFER_PROTOCOL_VERSION) {
      return rejectOffer(ABORT.VERSION_MISMATCH);
    }
    if (typeof offer.transferId !== RECEIVER_TYPEOF.STRING ||
        offer.transferId.length === 0) {
      return rejectOffer(ABORT.CHUNK_FRAME_INVALID, ['transferId']);
    }
    const structural = validateCheckpointDescriptor(offer.descriptor);
    if (structural.outcome !== VALIDATION.VALID) {
      return rejectOffer(ABORT.DESCRIPTOR_INVALID, structural.reasons);
    }
    if (offer.chunkSizeBytes !== chunkSizeBytes ||
        offer.chunkCount !== snapshotTransferChunkCount(
          offer.descriptor.payloadByteLength, chunkSizeBytes)) {
      return rejectOffer(ABORT.GEOMETRY_MISMATCH);
    }
    const identity = matchCheckpointIdentity(offer.descriptor, identityOf());
    if (identity.outcome === VALIDATION.STALE_EPOCH) {
      return rejectOffer(ABORT.STALE_EPOCH, identity.reasons);
    }
    if (identity.outcome !== VALIDATION.VALID) {
      return rejectOffer(ABORT.IDENTITY_MISMATCH, identity.reasons);
    }
    return Object.freeze({outcome: ACCEPT_OUTCOME.ACCEPTED});
  };

  const openStaging = (boundary) => {
    ensureDirectory(session.transferDir);
    if (boundary.mode === RESUME.RESUMED_FROM_BOUNDARY) {
      session.fd = fs.openSync(stagingPath(), 'r+');
      // Discard any unverified staged tail past the recorded boundary.
      fs.ftruncateSync(session.fd, boundary.verifiedByteLength);
      fs.fsyncSync(session.fd);
      session.verifiedChunkCount = boundary.verifiedChunkCount;
      session.verifiedByteLength = boundary.verifiedByteLength;
      session.prefixHash = boundary.prefixHash;
    } else {
      session.fd = fs.openSync(stagingPath(), 'w');
      fs.fsyncSync(session.fd);
      session.verifiedChunkCount = 0;
      session.verifiedByteLength = 0;
      session.prefixHash = createHash(HASH_ALGORITHM);
    }
    // Directory fsync at staging creation (durable dir entry for the staged
    // payload file before any chunk bytes are appended).
    fsyncDirectory(session.transferDir);
  };

  const writeProgressMarker = () => {
    writeAtomicDurable(markerPath(), {
      transferId: session.transferId,
      generationIndex: session.descriptor.lastIncludedIndex,
      descriptorDigest: session.descriptorDigest,
      verifiedChunkCount: session.verifiedChunkCount,
      verifiedByteLength: session.verifiedByteLength,
      verifiedPrefixDigest: digestOfHash(session.prefixHash),
    });
  };

  const refuseChunk = (reason) => {
    session.state = RECEIVER_STATE.ABORTED;
    closeStagingFd();
    return Object.freeze({outcome: CHUNK_OUTCOME.REFUSED, reason});
  };

  const completionAbort = (reason, reasons = []) => {
    session.state = RECEIVER_STATE.ABORTED;
    discardStaging();
    return snapshotTransferAborted(
      reason, {reasons: Object.freeze([...reasons])});
  };

  const publishGeneration = async () => {
    const generationDir = path.join(
      checkpointsRoot, String(session.descriptor.lastIncludedIndex));
    const staged = stagingPath();
    const stagedSize = fs.statSync(staged).size;
    if (stagedSize !== session.descriptor.payloadByteLength) {
      return completionAbort(ABORT.PAYLOAD_LENGTH_MISMATCH);
    }
    const wholeDigest = await streamedFileDigest(staged);
    if (wholeDigest !== session.descriptor.payloadDigest) {
      return completionAbort(ABORT.PAYLOAD_DIGEST_MISMATCH);
    }
    ensureDirectory(generationDir);
    fs.renameSync(
      staged, path.join(generationDir, RAFT_CHECKPOINT_PAYLOAD_FILE));
    fsyncDirectory(generationDir);
    writeAtomicDurable(
      path.join(generationDir, RAFT_CHECKPOINT_DESCRIPTOR_FILE),
      session.descriptor);
    const published = readCheckpoint(
      {checkpointDir: generationDir, expectedIdentity: identityOf()});
    if (published.outcome !== VALIDATION.VALID) {
      return completionAbort(ABORT.PUBLICATION_INVALID, published.reasons);
    }
    session.state = RECEIVER_STATE.COMPLETED;
    discardStaging();
    return snapshotTransferResult(OUTCOME.COMPLETED, {
      checkpointDir: generationDir,
      descriptor: published.descriptor,
    });
  };

  return Object.freeze({
    acceptOffer(offer) {
      const shape = validateOfferShape(offer);
      if (shape.outcome !== ACCEPT_OUTCOME.ACCEPTED) {
        session.state = RECEIVER_STATE.ABORTED;
        return shape;
      }
      session.transferId = offer.transferId;
      session.descriptor = offer.descriptor;
      session.descriptorDigest = sha256Digest(
        canonicalJsonBytes(offer.descriptor));
      session.chunkCount = offer.chunkCount;
      session.transferDir = path.join(
        checkpointsRoot,
        RAFT_SNAPSHOT_TRANSFER_DIRNAME,
        String(offer.descriptor.lastIncludedIndex));
      cleanupStaleTransferStaging(checkpointsRoot,
        {keepDirname: String(offer.descriptor.lastIncludedIndex)});
      const boundary = resolveResumeBoundary({
        transferDir: session.transferDir,
        descriptor: session.descriptor,
        descriptorDigest: session.descriptorDigest,
        chunkSizeBytes,
      });
      openStaging(boundary);
      session.accepted = true;
      return Object.freeze({
        outcome: ACCEPT_OUTCOME.ACCEPTED,
        resumeMode: boundary.mode,
        resumeChunkCount: session.verifiedChunkCount,
        chunkCount: session.chunkCount,
        accept: Object.freeze({
          kind: KIND.ACCEPT,
          transferId: session.transferId,
          resumeChunkCount: session.verifiedChunkCount,
          resumeMode: boundary.mode,
        }),
      });
    },
    receiveChunkFrame(header, bytes) {
      if (session.state !== RECEIVER_STATE.RECEIVING || !session.accepted) {
        return refuseChunk(ABORT.CHUNK_FRAME_INVALID);
      }
      const expectedByteLength = snapshotTransferChunkByteLength(
        session.descriptor.payloadByteLength, chunkSizeBytes,
        session.verifiedChunkCount);
      if (header.transferId !== session.transferId ||
          header.chunkIndex !== session.verifiedChunkCount ||
          header.byteLength !== expectedByteLength ||
          bytes.length !== expectedByteLength) {
        return refuseChunk(ABORT.CHUNK_FRAME_INVALID);
      }
      if (sha256Digest(bytes) !== header.chunkDigest) {
        return refuseChunk(ABORT.CHUNK_DIGEST_MISMATCH);
      }
      fs.writeSync(session.fd, bytes, 0, bytes.length,
        session.verifiedByteLength);
      fs.fsyncSync(session.fd);
      session.prefixHash.update(bytes);
      session.verifiedChunkCount += 1;
      session.verifiedByteLength += bytes.length;
      writeProgressMarker();
      return Object.freeze({
        outcome: CHUNK_OUTCOME.VERIFIED,
        verifiedChunkCount: session.verifiedChunkCount,
        transferComplete: session.verifiedChunkCount === session.chunkCount,
      });
    },
    async complete() {
      if (session.state !== RECEIVER_STATE.RECEIVING || !session.accepted ||
          session.verifiedChunkCount !== session.chunkCount) {
        return completionAbort(ABORT.PAYLOAD_LENGTH_MISMATCH);
      }
      // Membership-epoch re-check at completion: an epoch advance
      // mid-transfer is a typed stale_epoch abort.
      const identity = matchCheckpointIdentity(session.descriptor, identityOf());
      if (identity.outcome === VALIDATION.STALE_EPOCH) {
        return completionAbort(ABORT.STALE_EPOCH, identity.reasons);
      }
      if (identity.outcome !== VALIDATION.VALID) {
        return completionAbort(ABORT.IDENTITY_MISMATCH, identity.reasons);
      }
      closeStagingFd();
      return publishGeneration();
    },
    // Stop receiving WITHOUT discarding durable staging: the recorded
    // verified boundary stays resumable after restart (R2).
    cancel() {
      session.state = RECEIVER_STATE.ABORTED;
      closeStagingFd();
    },
    verifiedChunkCount: () => session.verifiedChunkCount,
  });
}

export {
  cleanupStaleTransferStaging,
  createSnapshotTransferReceiver,
  snapshotTransferAborted,
  snapshotTransferChunkByteLength,
  snapshotTransferChunkCount,
  snapshotTransferResult,
};
