// Raft snapshot bulk-transfer vocabulary (quest raft-snapshot-bulk-transfer,
// spec solve/specs/raft-snapshot-transfer-install/bulk-transfer-design.md,
// R2/S3). Owns the transfer protocol version, message kinds, chunk geometry,
// binary chunk-frame layout, typed abort reasons, transfer outcomes, the
// durable progress-marker shape, and the transfer staging layout. Checkpoint
// creation/validation (S1) and install (S2) own their own vocabulary.

const RAFT_SNAPSHOT_TRANSFER_PROTOCOL_NAME = 'lagrange-snapshot-transfer-v1';
const RAFT_SNAPSHOT_TRANSFER_PROTOCOL_VERSION = 1;

// Chunk geometry: 1 MiB chunks; chunkCount = ceil(payloadByteLength /
// chunkSizeBytes). The bulk dial sets an explicit per-socket maxPayload and
// the receiver length-checks every frame before append; the frame budget
// allows the length-prefixed header on top of one full chunk.
const TRANSFER_KIB = 1024;
const RAFT_SNAPSHOT_TRANSFER_CHUNK_SIZE_BYTES = TRANSFER_KIB * TRANSFER_KIB;
// The transport-side bulk-channel MAX_PAYLOAD default mirrors chunk size +
// header overhead (src/constants/transport.js) to avoid a cross-owner import;
// the receiver length-checks every frame against the negotiated geometry.

// Control messages travel as JSON TEXT frames; the chunk itself is a BINARY
// frame (see the header layout below), so there is no chunk message kind.
const RAFT_SNAPSHOT_TRANSFER_MESSAGE_KIND = Object.freeze({
  OFFER: 'offer',
  ACCEPT: 'accept',
  CHUNK_REQUEST: 'chunk-request',
  COMPLETE: 'complete',
  ABORT: 'abort',
});

// Binary chunk-frame layout (OCI framing precedent): a 4-byte UInt32BE header
// length, then the JSON header binding transferId / chunkIndex / byteLength /
// `sha256:` chunk digest, then exactly byteLength chunk bytes.
const RAFT_SNAPSHOT_TRANSFER_CHUNK_HEADER_PREFIX_BYTES = 4;
const RAFT_SNAPSHOT_TRANSFER_CHUNK_HEADER_FIELDS = Object.freeze([
  'transferId',
  'chunkIndex',
  'byteLength',
  'chunkDigest',
]);

// Typed abort reasons (protocol `abort` frames and local typed results).
const RAFT_SNAPSHOT_TRANSFER_ABORT_REASON = Object.freeze({
  VERSION_MISMATCH: 'version_mismatch',
  GEOMETRY_MISMATCH: 'geometry_mismatch',
  DESCRIPTOR_INVALID: 'descriptor_invalid',
  IDENTITY_MISMATCH: 'identity_mismatch',
  STALE_EPOCH: 'stale_epoch',
  GENERATION_UNAVAILABLE: 'generation_unavailable',
  CHUNK_UNAVAILABLE: 'chunk_unavailable',
  CHUNK_FRAME_INVALID: 'chunk_frame_invalid',
  CHUNK_DIGEST_MISMATCH: 'chunk_digest_mismatch',
  PAYLOAD_LENGTH_MISMATCH: 'payload_length_mismatch',
  PAYLOAD_DIGEST_MISMATCH: 'payload_digest_mismatch',
  PUBLICATION_INVALID: 'publication_invalid',
  TRANSFER_CANCELLED: 'transfer_cancelled',
  CHANNEL_CLOSED: 'channel_closed',
});

// Terminal transfer outcomes for one sender/receiver run.
const RAFT_SNAPSHOT_TRANSFER_OUTCOME = Object.freeze({
  COMPLETED: 'completed',
  ABORTED: 'aborted',
});

// Typed accept outcomes (receiver offer admission).
const RAFT_SNAPSHOT_TRANSFER_ACCEPT_OUTCOME = Object.freeze({
  ACCEPTED: 'accepted',
  REJECTED: 'rejected',
});

// Typed per-chunk outcomes on the receiver.
const RAFT_SNAPSHOT_TRANSFER_CHUNK_OUTCOME = Object.freeze({
  VERIFIED: 'verified',
  REFUSED: 'refused',
});

// How an accepted transfer starts relative to durable staging: fresh, resumed
// from the re-digested verified boundary, or restarted from zero because the
// recorded boundary failed re-digest (typed, R2).
const RAFT_SNAPSHOT_TRANSFER_RESUME_MODE = Object.freeze({
  FRESH: 'fresh',
  RESUMED_FROM_BOUNDARY: 'resumed_from_boundary',
  RESTARTED_FROM_ZERO: 'restarted_from_zero',
});

// Transfer staging layout: {checkpointsRoot}/transfer/{bareDecimalIndex}/
// holding the staged payload bytes and the canonical-JSON progress marker.
// Non-`.db` file names inside a subdirectory keep staging invisible to the
// bootstrap rejoin-hints `*.db` scan, and the `transfer` dirname is not a
// bare-decimal generation name so listCheckpointGenerations ignores it.
const RAFT_SNAPSHOT_TRANSFER_DIRNAME = 'transfer';
const RAFT_SNAPSHOT_TRANSFER_STAGING_FILE = 'transfer-payload';
const RAFT_SNAPSHOT_TRANSFER_PROGRESS_MARKER_FILE = 'transfer-progress.json';

// Progress-marker exact-object shape. verifiedPrefixDigest is the sha256 of
// exactly the verified staged prefix, giving restart the reference digest the
// resume boundary is re-verified against (a boundary whose staged bytes fail
// this re-digest restarts from zero, typed).
const RAFT_SNAPSHOT_TRANSFER_PROGRESS_MARKER_FIELDS = Object.freeze([
  'transferId',
  'generationIndex',
  'descriptorDigest',
  'verifiedChunkCount',
  'verifiedByteLength',
  'verifiedPrefixDigest',
]);

export {
  RAFT_SNAPSHOT_TRANSFER_ABORT_REASON,
  RAFT_SNAPSHOT_TRANSFER_ACCEPT_OUTCOME,
  RAFT_SNAPSHOT_TRANSFER_CHUNK_HEADER_FIELDS,
  RAFT_SNAPSHOT_TRANSFER_CHUNK_HEADER_PREFIX_BYTES,
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
};
