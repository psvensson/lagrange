/**
 * Constants for deterministic snapshot capture and serialization.
 */

const SNAPSHOT_RECORDER_DEFAULT = Object.freeze({
  FORMAT_MAGIC: 'DSNP',
  FORMAT_VERSION: 1,
  MAX_BYTES_PER_SNAPSHOT: 1048576,
  MAX_FRAMES_PER_SESSION: 512,
  MAX_HOST_CALLS_PER_SESSION: 1024,
  CAPTURE_TIMEOUT_MS: 250,
  HEADER_SIZE_BYTES: 13,
});

const SNAPSHOT_RECORDER_ERROR_MSG = Object.freeze({
  REQUEST_REQUIRED: 'Snapshot request is required',
  SESSION_ID_REQUIRED: 'Snapshot request requires non-empty sessionId',
  MODULE_REF_REQUIRED: 'Snapshot request requires non-empty moduleRef',
  MODULE_DIGEST_REQUIRED:
    'Snapshot request requires non-empty moduleDigest',
  FRAME_REQUIRED: 'Snapshot capture requires frame object',
  HOST_CALL_REQUIRED: 'Snapshot capture requires hostCall object',
  MEMORY_LABEL_REQUIRED:
    'Snapshot capture requires non-empty memory boundary label',
  MEMORY_BYTES_REQUIRED:
    'Snapshot capture requires memory bytes as Buffer, Uint8Array, or ArrayBuffer',
  SNAPSHOT_NOT_FOUND:
    'Snapshot capture session not found',
  SNAPSHOT_ALREADY_EXISTS:
    'Snapshot capture session already exists',
  SNAPSHOT_BYTES_LIMIT_EXCEEDED:
    'Snapshot bytes exceed max bytes per snapshot',
  SNAPSHOT_FRAME_LIMIT_EXCEEDED:
    'Snapshot frame count exceeds max frames per session',
  SNAPSHOT_HOST_CALL_LIMIT_EXCEEDED:
    'Snapshot host call count exceeds max host calls per session',
  SNAPSHOT_CAPTURE_TIMEOUT:
    'Snapshot capture operation timed out',
  SNAPSHOT_BUFFER_REQUIRED:
    'Snapshot deserialize requires Buffer or Uint8Array',
  SNAPSHOT_FORMAT_MAGIC_INVALID:
    'Snapshot envelope magic is invalid',
  SNAPSHOT_FORMAT_VERSION_UNSUPPORTED:
    'Snapshot envelope version is unsupported',
  SNAPSHOT_BUFFER_TRUNCATED:
    'Snapshot envelope is truncated',
  SNAPSHOT_MANIFEST_INVALID:
    'Snapshot manifest payload is invalid',
  SNAPSHOT_PAYLOAD_INVALID:
    'Snapshot payload is invalid',
});

export {
  SNAPSHOT_RECORDER_DEFAULT,
  SNAPSHOT_RECORDER_ERROR_MSG,
};
