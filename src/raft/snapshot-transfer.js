// Raft snapshot bulk transfer (quest raft-snapshot-bulk-transfer, R2/S3):
// versioned receiver-driven chunk protocol moving one sealed S1 checkpoint
// generation between nodes. Control messages are JSON text frames; chunks are
// length-prefixed binary frames binding transferId/chunkIndex/byteLength/
// sha256 chunk digest. This module owns the wire codec, the SENDER (serve
// chunks by index with on-demand digests and a token-bucket pacing hook), and
// the socket driver loops; the receiver's durable state machine (staging,
// resume boundary, streamed completion digest, publication) lives in
// snapshot-transfer-receiver.js. Channel ownership (sockets, pacing
// enforcement transport) lives in src/transport/bulk-transfer-channel.js;
// every loop here accepts any socket-like ({send, on, close}) so tests drive
// it over an in-process pair.

import fs from 'node:fs';
import path from 'node:path';

import {
  exactKeys,
  sha256Digest,
} from '../runtime/oci-host-agent-durable-files.js';

import {
  RAFT_CHECKPOINT_PAYLOAD_FILE,
  RAFT_CHECKPOINT_VALIDATION_OUTCOME,
} from './snapshot-checkpoint-constants.js';
import {readCheckpoint} from './snapshot-checkpoint-store.js';
import {
  createSnapshotTransferReceiver,
  snapshotTransferAborted,
  snapshotTransferChunkByteLength,
  snapshotTransferChunkCount,
  snapshotTransferResult,
} from './snapshot-transfer-receiver.js';
import {
  RAFT_SNAPSHOT_TRANSFER_ABORT_REASON,
  RAFT_SNAPSHOT_TRANSFER_ACCEPT_OUTCOME,
  RAFT_SNAPSHOT_TRANSFER_CHUNK_HEADER_FIELDS,
  RAFT_SNAPSHOT_TRANSFER_CHUNK_HEADER_PREFIX_BYTES,
  RAFT_SNAPSHOT_TRANSFER_CHUNK_OUTCOME,
  RAFT_SNAPSHOT_TRANSFER_CHUNK_SIZE_BYTES,
  RAFT_SNAPSHOT_TRANSFER_MESSAGE_KIND,
  RAFT_SNAPSHOT_TRANSFER_OUTCOME,
  RAFT_SNAPSHOT_TRANSFER_PROTOCOL_NAME,
  RAFT_SNAPSHOT_TRANSFER_PROTOCOL_VERSION,
} from './snapshot-transfer-constants.js';

const KIND = RAFT_SNAPSHOT_TRANSFER_MESSAGE_KIND;
const ABORT = RAFT_SNAPSHOT_TRANSFER_ABORT_REASON;
const OUTCOME = RAFT_SNAPSHOT_TRANSFER_OUTCOME;
const ACCEPT_OUTCOME = RAFT_SNAPSHOT_TRANSFER_ACCEPT_OUTCOME;
const CHUNK_OUTCOME = RAFT_SNAPSHOT_TRANSFER_CHUNK_OUTCOME;
const VALIDATION = RAFT_CHECKPOINT_VALIDATION_OUTCOME;
const HEADER_PREFIX_BYTES = RAFT_SNAPSHOT_TRANSFER_CHUNK_HEADER_PREFIX_BYTES;

const HEADER_ENCODING = 'utf8';
const TRANSFER_TYPEOF = Object.freeze({
  STRING: 'string',
});

// Inbox frame classification for the socket driver loops.
const FRAME = Object.freeze({
  CONTROL: 'control',
  CHUNK: 'chunk',
  INVALID: 'invalid',
  CLOSED: 'closed',
  CANCELLED: 'cancelled',
});

const SOCKET_EVENT = Object.freeze({
  MESSAGE: 'message',
  CLOSE: 'close',
});
const SIGNAL_ABORT_EVENT = 'abort';

// ---------------------------------------------------------------------------
// Frame codec: JSON text control frames + length-prefixed binary chunk frames.
// ---------------------------------------------------------------------------

function encodeControlFrame(message) {
  return JSON.stringify(message);
}

/**
 * Encode one binary chunk frame: [UInt32BE header length][JSON header binding
 * transferId/chunkIndex/byteLength/chunkDigest][chunk bytes].
 * @param {Object} header chunk header ({transferId, chunkIndex, byteLength,
 *   chunkDigest})
 * @param {Buffer} bytes chunk payload bytes
 * @return {Buffer} the encoded frame
 */
function encodeSnapshotChunkFrame(header, bytes) {
  const headerBytes = Buffer.from(JSON.stringify(header), HEADER_ENCODING);
  const prefix = Buffer.alloc(HEADER_PREFIX_BYTES);
  prefix.writeUInt32BE(headerBytes.length);
  return Buffer.concat([prefix, headerBytes, bytes]);
}

/**
 * Decode one binary chunk frame. Every structural failure is typed; the
 * caller length-checks against its own chunk geometry before appending.
 * @param {Buffer} frame the received binary frame
 * @return {Object} {valid: true, header, bytes} or {valid: false, reason}
 */
function decodeSnapshotChunkFrame(frame) {
  if (!Buffer.isBuffer(frame) || frame.length < HEADER_PREFIX_BYTES) {
    return Object.freeze({valid: false, reason: ABORT.CHUNK_FRAME_INVALID});
  }
  const headerLength = frame.readUInt32BE(0);
  const bodyOffset = HEADER_PREFIX_BYTES + headerLength;
  if (frame.length < bodyOffset) {
    return Object.freeze({valid: false, reason: ABORT.CHUNK_FRAME_INVALID});
  }
  let header;
  try {
    header = JSON.parse(
      frame.subarray(HEADER_PREFIX_BYTES, bodyOffset).toString(HEADER_ENCODING));
  } catch {
    return Object.freeze({valid: false, reason: ABORT.CHUNK_FRAME_INVALID});
  }
  if (!exactKeys(header, RAFT_SNAPSHOT_TRANSFER_CHUNK_HEADER_FIELDS)) {
    return Object.freeze({valid: false, reason: ABORT.CHUNK_FRAME_INVALID});
  }
  const bytes = frame.subarray(bodyOffset);
  if (bytes.length !== header.byteLength) {
    return Object.freeze({valid: false, reason: ABORT.CHUNK_FRAME_INVALID});
  }
  return Object.freeze({valid: true, header, bytes});
}

// Classify one inbound socket payload: control text vs binary chunk frame.
// ws@8 delivers text frames as Buffers with isBinary=false; in-process test
// sockets deliver the sent value unchanged (string control frames).
function classifyInboundFrame(data, isBinary) {
  const isText = typeof data === TRANSFER_TYPEOF.STRING || isBinary === false;
  if (isText) {
    try {
      return Object.freeze({
        kind: FRAME.CONTROL,
        message: JSON.parse(
          typeof data === TRANSFER_TYPEOF.STRING ?
            data :
            data.toString(HEADER_ENCODING)),
      });
    } catch {
      return Object.freeze({kind: FRAME.INVALID});
    }
  }
  const decoded = decodeSnapshotChunkFrame(data);
  return decoded.valid ?
    Object.freeze({kind: FRAME.CHUNK, header: decoded.header, bytes: decoded.bytes}) :
    Object.freeze({kind: FRAME.INVALID});
}

// A pull-based inbox over a socket-like: next() resolves with the next
// classified frame, a typed CLOSED frame on socket close, or a typed
// CANCELLED frame when the abort signal fires while waiting.
function createTransferFrameInbox(socket, signal) {
  const pending = [];
  const waiters = [];
  let closed = false;
  const push = (frame) => {
    const waiter = waiters.shift();
    if (waiter) {
      waiter(frame);
      return;
    }
    pending.push(frame);
  };
  socket.on(SOCKET_EVENT.MESSAGE, (data, isBinary) => {
    push(classifyInboundFrame(data, isBinary));
  });
  socket.on(SOCKET_EVENT.CLOSE, () => {
    closed = true;
    push(Object.freeze({kind: FRAME.CLOSED}));
  });
  if (signal) {
    signal.addEventListener(SIGNAL_ABORT_EVENT,
      () => push(Object.freeze({kind: FRAME.CANCELLED})), {once: true});
  }
  return Object.freeze({
    next() {
      if (signal?.aborted) {
        return Promise.resolve(Object.freeze({kind: FRAME.CANCELLED}));
      }
      if (pending.length > 0) {
        return Promise.resolve(pending.shift());
      }
      if (closed) {
        return Promise.resolve(Object.freeze({kind: FRAME.CLOSED}));
      }
      return new Promise((resolve) => waiters.push(resolve));
    },
  });
}

function sendControl(socket, message) {
  socket.send(encodeControlFrame(message));
}

function abortMessage(transferId, reason) {
  return {kind: KIND.ABORT, transferId, reason};
}

// ---------------------------------------------------------------------------
// Sender: serve chunks of one sealed generation by index, digests on demand.
// ---------------------------------------------------------------------------

/**
 * Open a sender over one sealed checkpoint generation. The generation is
 * re-validated from disk (typed refusal when partial/corrupt); chunks are
 * read and digested on demand by index.
 * @param {Object} options sender options
 * @param {string} options.checkpointsRoot durable checkpoint root
 * @param {number} options.generationIndex sealed generation to serve
 * @param {string} options.transferId caller-chosen transfer id
 * @param {number} [options.chunkSizeBytes] chunk geometry (default 1 MiB)
 * @return {Object} {opened: true, sender} or {opened: false, reason, reasons}
 */
function openSnapshotTransferSender(options) {
  const {checkpointsRoot, generationIndex, transferId} = options;
  const chunkSizeBytes =
    options.chunkSizeBytes || RAFT_SNAPSHOT_TRANSFER_CHUNK_SIZE_BYTES;
  const checkpointDir = path.join(checkpointsRoot, String(generationIndex));
  const read = readCheckpoint({checkpointDir});
  if (read.outcome !== VALIDATION.VALID) {
    return Object.freeze({
      opened: false,
      reason: ABORT.GENERATION_UNAVAILABLE,
      reasons: read.reasons,
    });
  }
  const descriptor = read.descriptor;
  const chunkCount = snapshotTransferChunkCount(
    descriptor.payloadByteLength, chunkSizeBytes);
  const payloadPath = path.join(checkpointDir, RAFT_CHECKPOINT_PAYLOAD_FILE);
  const fd = fs.openSync(payloadPath, 'r');
  let open = true;
  const sender = Object.freeze({
    descriptor,
    chunkCount,
    chunkSizeBytes,
    buildOffer() {
      return {
        kind: KIND.OFFER,
        protocolName: RAFT_SNAPSHOT_TRANSFER_PROTOCOL_NAME,
        protocolVersion: RAFT_SNAPSHOT_TRANSFER_PROTOCOL_VERSION,
        transferId,
        descriptor,
        chunkSizeBytes,
        chunkCount,
      };
    },
    readChunk(chunkIndex) {
      if (!open || !Number.isSafeInteger(chunkIndex) ||
          chunkIndex < 0 || chunkIndex >= chunkCount) {
        return Object.freeze({served: false, reason: ABORT.CHUNK_UNAVAILABLE});
      }
      const byteLength = snapshotTransferChunkByteLength(
        descriptor.payloadByteLength, chunkSizeBytes, chunkIndex);
      const bytes = Buffer.alloc(byteLength);
      const got = fs.readSync(
        fd, bytes, 0, byteLength, chunkIndex * chunkSizeBytes);
      if (got !== byteLength) {
        return Object.freeze({served: false, reason: ABORT.CHUNK_UNAVAILABLE});
      }
      const header = {
        transferId,
        chunkIndex,
        byteLength,
        chunkDigest: sha256Digest(bytes),
      };
      return Object.freeze({served: true, header, bytes});
    },
    close() {
      if (open) {
        open = false;
        fs.closeSync(fd);
      }
    },
  });
  return Object.freeze({opened: true, sender});
}

// ---------------------------------------------------------------------------
// Socket driver loops (receiver-driven flow over any socket-like).
// ---------------------------------------------------------------------------

/**
 * Serve one sealed generation over a socket: send the offer, answer each
 * chunk-request with a digested binary chunk frame (paced through the
 * optional sender-side token bucket), and finish on complete/abort/close.
 * @param {Object} options {socket, checkpointsRoot, generationIndex,
 *   transferId, chunkSizeBytes?, tokenBucket?, signal?}
 * @return {Promise<Object>} typed terminal result
 */
// Serve one requested chunk: read + frame it, pace the send through the
// optional token bucket, and send unless cancelled while waiting. Returns
// the typed terminal result on abort, or null when the chunk was sent.
async function serveRequestedChunk(context) {
  const {socket, sender, transferId, tokenBucket, signal, chunkIndex} = context;
  const chunk = sender.readChunk(chunkIndex);
  if (!chunk.served) {
    sendControl(socket, abortMessage(transferId, chunk.reason));
    return snapshotTransferAborted(chunk.reason);
  }
  const encoded = encodeSnapshotChunkFrame(chunk.header, chunk.bytes);
  if (tokenBucket) {
    // Signal-aware so an aborted serve loop cannot park forever on a
    // never-draining bucket (verifier non-blocking finding).
    await tokenBucket.acquire(encoded.length, {signal});
  }
  if (signal?.aborted) {
    sendControl(socket,
      abortMessage(transferId, ABORT.TRANSFER_CANCELLED));
    return snapshotTransferAborted(ABORT.TRANSFER_CANCELLED);
  }
  socket.send(encoded);
  return null;
}

async function serveSnapshotTransfer(options) {
  const {socket, transferId, tokenBucket, signal} = options;
  const opened = openSnapshotTransferSender(options);
  if (!opened.opened) {
    sendControl(socket, abortMessage(transferId, opened.reason));
    return snapshotTransferAborted(opened.reason, {reasons: opened.reasons});
  }
  const sender = opened.sender;
  const inbox = createTransferFrameInbox(socket, signal);
  try {
    sendControl(socket, sender.buildOffer());
    for (;;) {
      const frame = await inbox.next();
      if (frame.kind === FRAME.CANCELLED) {
        sendControl(socket, abortMessage(transferId, ABORT.TRANSFER_CANCELLED));
        return snapshotTransferAborted(ABORT.TRANSFER_CANCELLED);
      }
      if (frame.kind === FRAME.CLOSED) {
        return snapshotTransferAborted(ABORT.CHANNEL_CLOSED);
      }
      if (frame.kind !== FRAME.CONTROL) {
        continue;
      }
      const message = frame.message;
      if (message.kind === KIND.ABORT) {
        return snapshotTransferAborted(message.reason);
      }
      if (message.kind === KIND.COMPLETE) {
        return snapshotTransferResult(OUTCOME.COMPLETED, {transferId});
      }
      if (message.kind === KIND.CHUNK_REQUEST &&
          message.transferId === transferId) {
        const aborted = await serveRequestedChunk({
          socket, sender, transferId, tokenBucket, signal,
          chunkIndex: message.chunkIndex,
        });
        if (aborted) {
          return aborted;
        }
      }
    }
  } finally {
    sender.close();
  }
}

/**
 * Receive one transfer over a socket: await the offer, admit it (identity,
 * version, geometry, resume boundary), then drive the receiver-driven flow —
 * request one chunk at a time, verify + durably stage it, and complete with
 * the streamed whole-payload digest and S1 publication semantics.
 * @param {Object} options {socket, checkpointsRoot, expectedIdentity,
 *   chunkSizeBytes?, signal?, onChunkVerified?}
 * @return {Promise<Object>} typed terminal result ({outcome, ...})
 */
// Await the opening control frame: only a well-formed OFFER proceeds; any
// other first frame terminates the receive with a typed abort.
async function awaitTransferOffer(inbox) {
  const first = await inbox.next();
  if (first.kind === FRAME.CLOSED || first.kind === FRAME.CANCELLED) {
    return Object.freeze({aborted: snapshotTransferAborted(
      first.kind === FRAME.CLOSED ?
        ABORT.CHANNEL_CLOSED :
        ABORT.TRANSFER_CANCELLED)});
  }
  if (first.kind === FRAME.CONTROL && first.message.kind === KIND.ABORT) {
    return Object.freeze(
      {aborted: snapshotTransferAborted(first.message.reason)});
  }
  if (first.kind !== FRAME.CONTROL || first.message.kind !== KIND.OFFER) {
    return Object.freeze(
      {aborted: snapshotTransferAborted(ABORT.CHUNK_FRAME_INVALID)});
  }
  return Object.freeze({offer: first.message});
}

// Classify one frame awaited while a chunk request is outstanding: the chunk
// to verify, a retry (unrelated control frame), or a typed terminal abort.
function classifyAwaitedChunkFrame(context) {
  const {socket, receiver, transferId, frame, verified} = context;
  if (frame.kind === FRAME.CLOSED || frame.kind === FRAME.CANCELLED) {
    receiver.cancel();
    if (frame.kind === FRAME.CANCELLED) {
      sendControl(socket, abortMessage(transferId, ABORT.TRANSFER_CANCELLED));
    }
    return Object.freeze({aborted: snapshotTransferAborted(
      frame.kind === FRAME.CLOSED ?
        ABORT.CHANNEL_CLOSED :
        ABORT.TRANSFER_CANCELLED, {verifiedChunkCount: verified})});
  }
  if (frame.kind === FRAME.CONTROL) {
    if (frame.message.kind === KIND.ABORT) {
      receiver.cancel();
      return Object.freeze({aborted: snapshotTransferAborted(
        frame.message.reason, {verifiedChunkCount: verified})});
    }
    return Object.freeze({retry: true});
  }
  if (frame.kind !== FRAME.CHUNK) {
    sendControl(socket, abortMessage(transferId, ABORT.CHUNK_FRAME_INVALID));
    receiver.cancel();
    return Object.freeze({aborted: snapshotTransferAborted(
      ABORT.CHUNK_FRAME_INVALID, {verifiedChunkCount: verified})});
  }
  return Object.freeze({chunk: frame});
}

async function receiveSnapshotTransfer(options) {
  const {socket, signal, onChunkVerified} = options;
  const inbox = createTransferFrameInbox(socket, signal);
  const receiver = createSnapshotTransferReceiver(options);
  const opening = await awaitTransferOffer(inbox);
  if (opening.aborted) {
    return opening.aborted;
  }
  const offer = opening.offer;
  const admission = receiver.acceptOffer(offer);
  if (admission.outcome !== ACCEPT_OUTCOME.ACCEPTED) {
    sendControl(socket, abortMessage(offer.transferId, admission.reason));
    return snapshotTransferAborted(
      admission.reason, {reasons: admission.reasons});
  }
  sendControl(socket, admission.accept);
  let verified = admission.resumeChunkCount;
  while (verified < admission.chunkCount) {
    if (signal?.aborted) {
      sendControl(socket,
        abortMessage(offer.transferId, ABORT.TRANSFER_CANCELLED));
      receiver.cancel();
      return snapshotTransferAborted(ABORT.TRANSFER_CANCELLED,
        {verifiedChunkCount: verified});
    }
    sendControl(socket, {
      kind: KIND.CHUNK_REQUEST,
      transferId: offer.transferId,
      chunkIndex: verified,
    });
    const frame = await inbox.next();
    const awaited = classifyAwaitedChunkFrame(
      {socket, receiver, transferId: offer.transferId, frame, verified});
    if (awaited.aborted) {
      return awaited.aborted;
    }
    if (awaited.retry) {
      continue;
    }
    const applied = receiver.receiveChunkFrame(
      awaited.chunk.header, awaited.chunk.bytes);
    if (applied.outcome !== CHUNK_OUTCOME.VERIFIED) {
      sendControl(socket, abortMessage(offer.transferId, applied.reason));
      return snapshotTransferAborted(
        applied.reason, {verifiedChunkCount: verified});
    }
    verified = applied.verifiedChunkCount;
    onChunkVerified?.(Object.freeze({verifiedChunkCount: verified}));
  }
  const completion = await receiver.complete();
  if (completion.outcome !== OUTCOME.COMPLETED) {
    sendControl(socket, abortMessage(offer.transferId, completion.reason));
    return Object.freeze({
      ...completion,
      resumeMode: admission.resumeMode,
      resumeChunkCount: admission.resumeChunkCount,
    });
  }
  sendControl(socket, {kind: KIND.COMPLETE, transferId: offer.transferId});
  return Object.freeze({
    ...completion,
    resumeMode: admission.resumeMode,
    resumeChunkCount: admission.resumeChunkCount,
  });
}

export {
  receiveSnapshotTransfer,
  serveSnapshotTransfer,
};
