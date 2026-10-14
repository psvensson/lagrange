// One exact byte envelope for the original participant-release TAP observer.
// A complete 45-partition trace is >2 MiB. Emitting one JSON line exceeding
// run-test-files' 1 MiB analysis bound would make green tests unjudgeable.
// Never weaken the runner or drop payload bytes: chunk, hash, and reassemble.
import {Buffer} from 'node:buffer';
import {createHash} from 'node:crypto';

const TRACE_SCHEMA = 'participant-release-delivery-trace/1';
const MANIFEST_SCHEMA = 'participant-release-delivery-trace-manifest/1';
const CHUNK_SCHEMA = 'participant-release-delivery-trace-chunk/1';
const CHUNK_BYTE_MAX = 224 * 1024;
const SHA256_PATTERN = /^[a-f0-9]{64}$/u;

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

function emitCompleteParticipantReleaseTrace(source, emit) {
  if (typeof source !== 'string' || typeof emit !== 'function') {
    throw new TypeError('participant release trace emitter needs JSON bytes and line owner');
  }
  const bytes = Buffer.from(source, 'utf8');
  const parsed = JSON.parse(source);
  if (parsed?.schema !== TRACE_SCHEMA) {
    throw new Error('cannot emit an unrelated trace as participant-release evidence');
  }
  const count = Math.max(1, Math.ceil(bytes.length / CHUNK_BYTE_MAX));
  const digest = sha256(bytes);
  emit(JSON.stringify({schema: MANIFEST_SCHEMA, rawBytes: bytes.length,
    rawSha256: digest, totalChunks: count, maxChunkBytes: CHUNK_BYTE_MAX}));
  for (let ordinal = 0; ordinal < count; ordinal += 1) {
    const chunk = bytes.subarray(ordinal * CHUNK_BYTE_MAX,
      Math.min(bytes.length, (ordinal + 1) * CHUNK_BYTE_MAX));
    emit(JSON.stringify({schema: CHUNK_SCHEMA, ordinal, totalChunks: count,
      rawSha256: digest, chunkBytes: chunk.length,
      base64: chunk.toString('base64')}));
  }
  return {rawBytes: bytes.length, rawSha256: digest, totalChunks: count};
}

function recordsOf(tap, schema) {
  const marker = `{"schema":"${schema}"`;
  const lines = tap.toString('utf8').split('\n').filter((line) =>
    line.includes(marker));
  return lines.map((line) => JSON.parse(line.slice(line.indexOf(marker))));
}

function parseCompleteParticipantReleaseTrace(tap) {
  const original = recordsOf(tap, TRACE_SCHEMA);
  const manifests = recordsOf(tap, MANIFEST_SCHEMA);
  const chunks = recordsOf(tap, CHUNK_SCHEMA);
  if (original.length === 1 && manifests.length === 0 && chunks.length === 0) {
    return {report: original[0], encoding: 'original-unbounded',
      rawSha256: null, rawBytes: null};
  }
  if (original.length !== 0 || manifests.length !== 1) {
    throw new Error('expected exactly one complete participant release trace manifest');
  }
  const manifest = manifests[0];
  if (!Number.isSafeInteger(manifest.totalChunks) || manifest.totalChunks < 1 ||
      !Number.isSafeInteger(manifest.rawBytes) || manifest.rawBytes < 1 ||
      manifest.totalChunks !== chunks.length ||
      manifest.maxChunkBytes !== CHUNK_BYTE_MAX ||
      typeof manifest.rawSha256 !== 'string' ||
      !SHA256_PATTERN.test(manifest.rawSha256)) {
    throw new Error('release trace manifest incomplete or invalid');
  }
  const ordered = Array(manifest.totalChunks);
  for (const chunk of chunks) {
    if (!Number.isSafeInteger(chunk.ordinal) || chunk.ordinal < 0 ||
        chunk.ordinal >= manifest.totalChunks || ordered[chunk.ordinal] !== undefined ||
        chunk.totalChunks !== manifest.totalChunks ||
        chunk.rawSha256 !== manifest.rawSha256 ||
        typeof chunk.base64 !== 'string') {
      throw new Error('release trace has duplicate, foreign or missing chunk identity');
    }
    const bytes = Buffer.from(chunk.base64, 'base64');
    if (bytes.length !== chunk.chunkBytes || bytes.length > CHUNK_BYTE_MAX ||
        bytes.toString('base64') !== chunk.base64) {
      throw new Error('release trace chunk has corrupted or overlong base64 bytes');
    }
    ordered[chunk.ordinal] = bytes;
  }
  if (ordered.some((part) => part === undefined)) {
    throw new Error('release trace is missing at least one ordered chunk');
  }
  const reconstructed = Buffer.concat(ordered);
  if (reconstructed.length !== manifest.rawBytes ||
      sha256(reconstructed) !== manifest.rawSha256) {
    throw new Error('release trace total bytes/hash differ from original manifest');
  }
  const report = JSON.parse(reconstructed.toString('utf8'));
  if (report?.schema !== TRACE_SCHEMA) {
    throw new Error('reassembled release trace has wrong original schema');
  }
  return {report, encoding: 'verified-bounded-chunks',
    rawBytes: reconstructed.length, rawSha256: manifest.rawSha256};
}

export {emitCompleteParticipantReleaseTrace, parseCompleteParticipantReleaseTrace,
  CHUNK_BYTE_MAX, CHUNK_SCHEMA, MANIFEST_SCHEMA, TRACE_SCHEMA};
