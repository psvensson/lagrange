/**
 * Deterministic snapshot capture and replay serialization.
 */

import crypto from 'node:crypto';
import {NUM, TYPEOF} from '../constants/index.js';
import {
  SNAPSHOT_RECORDER_DEFAULT as DEF,
  SNAPSHOT_RECORDER_ERROR_MSG as ERR,
} from './snapshot-recorder-constants.js';

/**
 * Snapshot recorder with bounded capture and versioned serialization.
 */
class SnapshotRecorder {
  /**
   * @param {Object} [options]
   * @param {number} [options.maxBytesPerSnapshot]
   * @param {number} [options.maxFramesPerSession]
   * @param {number} [options.maxHostCallsPerSession]
   * @param {number} [options.captureTimeoutMs]
   * @param {Function} [options.now]
   * @param {Function} [options.setTimeoutFn]
   * @param {Function} [options.clearTimeoutFn]
   */
  constructor(options = {}) {
    this.maxBytesPerSnapshot = options.maxBytesPerSnapshot ??
      DEF.MAX_BYTES_PER_SNAPSHOT;
    this.maxFramesPerSession = options.maxFramesPerSession ??
      DEF.MAX_FRAMES_PER_SESSION;
    this.maxHostCallsPerSession = options.maxHostCallsPerSession ??
      DEF.MAX_HOST_CALLS_PER_SESSION;
    this.captureTimeoutMs = options.captureTimeoutMs ??
      DEF.CAPTURE_TIMEOUT_MS;
    this.now = options.now || (() => Date.now());
    this.setTimeoutFn = options.setTimeoutFn || setTimeout;
    this.clearTimeoutFn = options.clearTimeoutFn || clearTimeout;

    this.snapshots = new Map();
  }

  /**
   * Start a capture session.
   *
   * @param {Object} request
   * @param {string} request.sessionId
   * @param {string} request.moduleRef
   * @param {string} request.moduleDigest
   * @param {string} [request.lineageId]
   * @param {number} [request.stageId]
   * @param {string} [request.tenantId]
   * @param {string} [request.serviceName]
   * @return {Promise<Object>} Snapshot summary.
   */
  async startSessionCapture(request) {
    return await this._runWithTimeout(async () => {
      assertRequest(request);
      assertSessionId(request.sessionId);
      assertNonEmptyString(request.moduleRef, ERR.MODULE_REF_REQUIRED);
      assertNonEmptyString(request.moduleDigest, ERR.MODULE_DIGEST_REQUIRED);

      if (this.snapshots.has(request.sessionId)) {
        throw new Error(ERR.SNAPSHOT_ALREADY_EXISTS);
      }

      const startedAt = this.now();
      const snapshot = {
        snapshotId: buildSnapshotId(),
        sessionId: request.sessionId,
        moduleRef: request.moduleRef,
        moduleDigest: request.moduleDigest,
        lineageId: request.lineageId || null,
        stageId: isNonNegativeInteger(request.stageId) ?
          request.stageId :
          null,
        tenantId: request.tenantId || null,
        serviceName: request.serviceName || null,
        inputFrames: [],
        hostCallLedger: [],
        memoryBoundaries: [],
        capturedAt: startedAt,
        updatedAt: startedAt,
        totalBytes: NUM.ZERO,
        formatVersion: DEF.FORMAT_VERSION,
      };

      this.snapshots.set(request.sessionId, snapshot);
      return buildSnapshotSummary(snapshot);
    });
  }

  /**
   * Capture one input frame.
   *
   * @param {Object} request
   * @param {string} request.sessionId
   * @param {Object} request.frame
   * @return {Promise<Object>} Updated snapshot summary.
   */
  async captureInputFrame(request) {
    return await this._runWithTimeout(async () => {
      assertRequest(request);
      assertSessionId(request.sessionId);
      if (!request.frame || typeof request.frame !== TYPEOF.OBJECT) {
        throw new Error(ERR.FRAME_REQUIRED);
      }

      const snapshot = this._getSnapshotOrThrow(request.sessionId);
      if (snapshot.inputFrames.length >= this.maxFramesPerSession) {
        throw new Error(ERR.SNAPSHOT_FRAME_LIMIT_EXCEEDED);
      }

      snapshot.inputFrames.push({
        ...request.frame,
        capturedAt: this.now(),
      });
      this._refreshSnapshotBudget(snapshot);
      return buildSnapshotSummary(snapshot);
    });
  }

  /**
   * Capture one host call ledger entry.
   *
   * @param {Object} request
   * @param {string} request.sessionId
   * @param {Object} request.hostCall
   * @return {Promise<Object>} Updated snapshot summary.
   */
  async captureHostCall(request) {
    return await this._runWithTimeout(async () => {
      assertRequest(request);
      assertSessionId(request.sessionId);
      if (!request.hostCall || typeof request.hostCall !== TYPEOF.OBJECT) {
        throw new Error(ERR.HOST_CALL_REQUIRED);
      }

      const snapshot = this._getSnapshotOrThrow(request.sessionId);
      if (snapshot.hostCallLedger.length >= this.maxHostCallsPerSession) {
        throw new Error(ERR.SNAPSHOT_HOST_CALL_LIMIT_EXCEEDED);
      }

      snapshot.hostCallLedger.push({
        ...request.hostCall,
        capturedAt: this.now(),
      });
      this._refreshSnapshotBudget(snapshot);
      return buildSnapshotSummary(snapshot);
    });
  }

  /**
   * Capture one memory boundary snapshot.
   *
   * @param {Object} request
   * @param {string} request.sessionId
   * @param {string} request.label
   * @param {Buffer|Uint8Array|ArrayBuffer} request.memoryBytes
   * @param {number} [request.offset]
   * @param {number} [request.length]
   * @return {Promise<Object>} Updated snapshot summary.
   */
  async captureMemoryBoundary(request) {
    return await this._runWithTimeout(async () => {
      assertRequest(request);
      assertSessionId(request.sessionId);
      assertNonEmptyString(request.label, ERR.MEMORY_LABEL_REQUIRED);
      if (!isSupportedMemoryBytes(request.memoryBytes)) {
        throw new Error(ERR.MEMORY_BYTES_REQUIRED);
      }

      const snapshot = this._getSnapshotOrThrow(request.sessionId);
      const bytes = normalizeMemoryBytes(request.memoryBytes);
      const offset = isNonNegativeInteger(request.offset) ?
        request.offset :
        NUM.ZERO;
      const length = isNonNegativeInteger(request.length) ?
        request.length :
        bytes.byteLength;

      snapshot.memoryBoundaries.push({
        label: request.label,
        offset,
        length,
        bytesBase64: Buffer.from(bytes).toString('base64'),
        capturedAt: this.now(),
      });

      this._refreshSnapshotBudget(snapshot);
      return buildSnapshotSummary(snapshot);
    });
  }

  /**
   * Finalize a capture session and return serialized artifact.
   *
   * @param {Object} request
   * @param {string} request.sessionId
   * @param {boolean} [request.keepInMemory]
   * @return {Promise<{manifest: Object, envelope: Buffer, snapshot: Object}>}
   */
  async finalizeSnapshot(request) {
    return await this._runWithTimeout(async () => {
      assertRequest(request);
      assertSessionId(request.sessionId);
      const snapshot = this._getSnapshotOrThrow(request.sessionId);

      this._refreshSnapshotBudget(snapshot);
      const manifest = buildSnapshotManifest(snapshot);
      const envelope = serializeSnapshotEnvelope(snapshot, manifest);

      if (request.keepInMemory !== true) {
        this.snapshots.delete(request.sessionId);
      }

      return {
        manifest,
        envelope,
        snapshot: cloneSnapshot(snapshot),
      };
    });
  }

  /**
   * Deserialize a snapshot envelope.
   *
   * @param {Buffer|Uint8Array} buffer
   * @return {{manifest: Object, snapshot: Object}}
   */
  deserializeSnapshot(buffer) {
    return deserializeSnapshotEnvelope(buffer);
  }

  /**
   * Get an active snapshot summary for a session.
   *
   * @param {Object} request
   * @param {string} request.sessionId
   * @return {Object|null}
   */
  getSessionSnapshot(request) {
    assertRequest(request);
    assertSessionId(request.sessionId);
    const snapshot = this.snapshots.get(request.sessionId) || null;
    return snapshot ? buildSnapshotSummary(snapshot) : null;
  }

  /**
   * @param {Object} snapshot
   * @private
   */
  _refreshSnapshotBudget(snapshot) {
    snapshot.updatedAt = this.now();
    snapshot.totalBytes = estimateSnapshotBytes(snapshot);
    if (snapshot.totalBytes > this.maxBytesPerSnapshot) {
      throw new Error(ERR.SNAPSHOT_BYTES_LIMIT_EXCEEDED);
    }
  }

  /**
   * @param {string} sessionId
   * @return {Object}
   * @private
   */
  _getSnapshotOrThrow(sessionId) {
    const snapshot = this.snapshots.get(sessionId) || null;
    if (!snapshot) {
      throw new Error(ERR.SNAPSHOT_NOT_FOUND);
    }
    return snapshot;
  }

  /**
   * Run operation with timeout bound.
   *
   * @param {Function} operation
   * @return {Promise<*>}
   * @private
   */
  async _runWithTimeout(operation) {
    let timeoutId;
    try {
      return await Promise.race([
        Promise.resolve().then(() => operation()),
        new Promise((_resolve, reject) => {
          timeoutId = this.setTimeoutFn(() => {
            reject(new Error(ERR.SNAPSHOT_CAPTURE_TIMEOUT));
          }, this.captureTimeoutMs);
        }),
      ]);
    } finally {
      if (timeoutId !== undefined) {
        this.clearTimeoutFn(timeoutId);
      }
    }
  }
}

/**
 * Serialize snapshot into versioned binary envelope.
 *
 * Envelope format:
 * - 4 bytes magic ("DSNP")
 * - 1 byte version
 * - 4 bytes manifest length (uint32 BE)
 * - 4 bytes payload length (uint32 BE)
 * - manifest JSON bytes
 * - payload JSON bytes
 *
 * @param {Object} snapshot
 * @param {Object} manifest
 * @return {Buffer}
 */
function serializeSnapshotEnvelope(snapshot, manifest) {
  const manifestJson = JSON.stringify(manifest);
  const payloadJson = JSON.stringify(serializeSnapshotPayload(snapshot));
  const manifestBytes = Buffer.from(manifestJson, 'utf8');
  const payloadBytes = Buffer.from(payloadJson, 'utf8');

  const header = Buffer.alloc(DEF.HEADER_SIZE_BYTES);
  header.write(DEF.FORMAT_MAGIC, NUM.ZERO, 4, 'ascii');
  header.writeUInt8(DEF.FORMAT_VERSION, 4);
  header.writeUInt32BE(manifestBytes.length, 5);
  header.writeUInt32BE(payloadBytes.length, 9);

  return Buffer.concat([header, manifestBytes, payloadBytes]);
}

/**
 * Deserialize versioned snapshot envelope.
 *
 * @param {Buffer|Uint8Array} buffer
 * @return {{manifest: Object, snapshot: Object}}
 */
function deserializeSnapshotEnvelope(buffer) {
  if (!Buffer.isBuffer(buffer) && !(buffer instanceof Uint8Array)) {
    throw new Error(ERR.SNAPSHOT_BUFFER_REQUIRED);
  }
  const bytes = Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer);
  if (bytes.length < DEF.HEADER_SIZE_BYTES) {
    throw new Error(ERR.SNAPSHOT_BUFFER_TRUNCATED);
  }

  const magic = bytes.toString('ascii', NUM.ZERO, 4);
  if (magic !== DEF.FORMAT_MAGIC) {
    throw new Error(ERR.SNAPSHOT_FORMAT_MAGIC_INVALID);
  }

  const version = bytes.readUInt8(4);
  if (version !== DEF.FORMAT_VERSION) {
    throw new Error(ERR.SNAPSHOT_FORMAT_VERSION_UNSUPPORTED);
  }

  const manifestLength = bytes.readUInt32BE(5);
  const payloadLength = bytes.readUInt32BE(9);
  const totalLength = DEF.HEADER_SIZE_BYTES + manifestLength + payloadLength;
  if (bytes.length < totalLength) {
    throw new Error(ERR.SNAPSHOT_BUFFER_TRUNCATED);
  }

  const manifestStart = DEF.HEADER_SIZE_BYTES;
  const manifestEnd = manifestStart + manifestLength;
  const payloadEnd = manifestEnd + payloadLength;

  let manifest;
  let payload;
  try {
    manifest = JSON.parse(
      bytes.toString('utf8', manifestStart, manifestEnd),
    );
  } catch (_err) {
    throw new Error(ERR.SNAPSHOT_MANIFEST_INVALID);
  }

  try {
    payload = JSON.parse(bytes.toString('utf8', manifestEnd, payloadEnd));
  } catch (_err) {
    throw new Error(ERR.SNAPSHOT_PAYLOAD_INVALID);
  }

  const snapshot = deserializeSnapshotPayload(payload);
  return {manifest, snapshot};
}

/**
 * @param {Object} snapshot
 * @return {Object}
 */
function serializeSnapshotPayload(snapshot) {
  return {
    snapshotId: snapshot.snapshotId,
    sessionId: snapshot.sessionId,
    moduleRef: snapshot.moduleRef,
    moduleDigest: snapshot.moduleDigest,
    lineageId: snapshot.lineageId,
    stageId: snapshot.stageId,
    tenantId: snapshot.tenantId,
    serviceName: snapshot.serviceName,
    formatVersion: snapshot.formatVersion,
    capturedAt: snapshot.capturedAt,
    updatedAt: snapshot.updatedAt,
    totalBytes: snapshot.totalBytes,
    inputFrames: snapshot.inputFrames,
    hostCallLedger: snapshot.hostCallLedger,
    memoryBoundaries: snapshot.memoryBoundaries,
  };
}

/**
 * @param {Object} payload
 * @return {Object}
 */
function deserializeSnapshotPayload(payload) {
  if (!payload || typeof payload !== TYPEOF.OBJECT) {
    throw new Error(ERR.SNAPSHOT_PAYLOAD_INVALID);
  }
  return {
    snapshotId: payload.snapshotId,
    sessionId: payload.sessionId,
    moduleRef: payload.moduleRef,
    moduleDigest: payload.moduleDigest,
    lineageId: payload.lineageId || null,
    stageId: isNonNegativeInteger(payload.stageId) ? payload.stageId : null,
    tenantId: payload.tenantId || null,
    serviceName: payload.serviceName || null,
    formatVersion: payload.formatVersion || DEF.FORMAT_VERSION,
    capturedAt: payload.capturedAt,
    updatedAt: payload.updatedAt,
    totalBytes: payload.totalBytes || NUM.ZERO,
    inputFrames: Array.isArray(payload.inputFrames) ? payload.inputFrames : [],
    hostCallLedger:
      Array.isArray(payload.hostCallLedger) ? payload.hostCallLedger : [],
    memoryBoundaries:
      Array.isArray(payload.memoryBoundaries) ? payload.memoryBoundaries : [],
  };
}

/**
 * @param {Object} snapshot
 * @return {Object}
 */
function buildSnapshotManifest(snapshot) {
  return {
    snapshotId: snapshot.snapshotId,
    sessionId: snapshot.sessionId,
    moduleRef: snapshot.moduleRef,
    moduleDigest: snapshot.moduleDigest,
    lineageId: snapshot.lineageId,
    stageId: snapshot.stageId,
    tenantId: snapshot.tenantId,
    serviceName: snapshot.serviceName,
    capturedAt: snapshot.capturedAt,
    updatedAt: snapshot.updatedAt,
    formatVersion: snapshot.formatVersion,
    totalBytes: snapshot.totalBytes,
    frameCount: snapshot.inputFrames.length,
    hostCallCount: snapshot.hostCallLedger.length,
    memoryBoundaryCount: snapshot.memoryBoundaries.length,
  };
}

/**
 * @param {Object} snapshot
 * @return {Object}
 */
function buildSnapshotSummary(snapshot) {
  return {
    snapshotId: snapshot.snapshotId,
    sessionId: snapshot.sessionId,
    moduleRef: snapshot.moduleRef,
    moduleDigest: snapshot.moduleDigest,
    lineageId: snapshot.lineageId,
    stageId: snapshot.stageId,
    capturedAt: snapshot.capturedAt,
    updatedAt: snapshot.updatedAt,
    totalBytes: snapshot.totalBytes,
    frameCount: snapshot.inputFrames.length,
    hostCallCount: snapshot.hostCallLedger.length,
    memoryBoundaryCount: snapshot.memoryBoundaries.length,
    formatVersion: snapshot.formatVersion,
  };
}

/**
 * @param {Object} snapshot
 * @return {Object}
 */
function cloneSnapshot(snapshot) {
  return JSON.parse(JSON.stringify(snapshot));
}

/**
 * @param {Object} snapshot
 * @return {number}
 */
function estimateSnapshotBytes(snapshot) {
  const payload = serializeSnapshotPayload(snapshot);
  return Buffer.byteLength(JSON.stringify(payload), 'utf8');
}

/**
 * @param {*} value
 * @return {boolean}
 */
function isSupportedMemoryBytes(value) {
  return Buffer.isBuffer(value) ||
    value instanceof Uint8Array ||
    value instanceof ArrayBuffer;
}

/**
 * @param {Buffer|Uint8Array|ArrayBuffer} value
 * @return {Uint8Array}
 */
function normalizeMemoryBytes(value) {
  if (Buffer.isBuffer(value)) {
    return new Uint8Array(value.buffer.slice(
      value.byteOffset,
      value.byteOffset + value.byteLength,
    ));
  }
  if (value instanceof Uint8Array) {
    return new Uint8Array(value.buffer.slice(
      value.byteOffset,
      value.byteOffset + value.byteLength,
    ));
  }
  return new Uint8Array(value.slice(NUM.ZERO));
}

/**
 * @param {Object} request
 */
function assertRequest(request) {
  if (!request || typeof request !== TYPEOF.OBJECT) {
    throw new Error(ERR.REQUEST_REQUIRED);
  }
}

/**
 * @param {string} sessionId
 */
function assertSessionId(sessionId) {
  assertNonEmptyString(sessionId, ERR.SESSION_ID_REQUIRED);
}

/**
 * @param {*} value
 * @param {string} errorMessage
 */
function assertNonEmptyString(value, errorMessage) {
  if (typeof value !== TYPEOF.STRING ||
    value.trim().length === NUM.ZERO) {
    throw new Error(errorMessage);
  }
}

/**
 * @param {*} value
 * @return {boolean}
 */
function isNonNegativeInteger(value) {
  return Number.isInteger(value) && value >= NUM.ZERO;
}

/**
 * @return {string}
 */
function buildSnapshotId() {
  return crypto.randomUUID();
}

export {
  SnapshotRecorder,
  serializeSnapshotEnvelope,
  deserializeSnapshotEnvelope,
  buildSnapshotManifest,
};
