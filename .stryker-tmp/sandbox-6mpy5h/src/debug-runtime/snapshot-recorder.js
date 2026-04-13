/**
 * Deterministic snapshot capture and replay serialization.
 */
// @ts-nocheck
function stryNS_9fa48() {
  var g = typeof globalThis === 'object' && globalThis && globalThis.Math === Math && globalThis || new Function("return this")();
  var ns = g.__stryker__ || (g.__stryker__ = {});
  if (ns.activeMutant === undefined && g.process && g.process.env && g.process.env.__STRYKER_ACTIVE_MUTANT__) {
    ns.activeMutant = g.process.env.__STRYKER_ACTIVE_MUTANT__;
  }
  function retrieveNS() {
    return ns;
  }
  stryNS_9fa48 = retrieveNS;
  return retrieveNS();
}
stryNS_9fa48();
function stryCov_9fa48() {
  var ns = stryNS_9fa48();
  var cov = ns.mutantCoverage || (ns.mutantCoverage = {
    static: {},
    perTest: {}
  });
  function cover() {
    var c = cov.static;
    if (ns.currentTestId) {
      c = cov.perTest[ns.currentTestId] = cov.perTest[ns.currentTestId] || {};
    }
    var a = arguments;
    for (var i = 0; i < a.length; i++) {
      c[a[i]] = (c[a[i]] || 0) + 1;
    }
  }
  stryCov_9fa48 = cover;
  cover.apply(null, arguments);
}
function stryMutAct_9fa48(id) {
  var ns = stryNS_9fa48();
  function isActive(id) {
    if (ns.activeMutant === id) {
      if (ns.hitCount !== void 0 && ++ns.hitCount > ns.hitLimit) {
        throw new Error('Stryker: Hit count limit reached (' + ns.hitCount + ')');
      }
      return true;
    }
    return false;
  }
  stryMutAct_9fa48 = isActive;
  return isActive(id);
}
import crypto from 'node:crypto';
import { NUM, TYPEOF } from '../constants/index.js';
import { SNAPSHOT_RECORDER_DEFAULT as DEF, SNAPSHOT_RECORDER_ERROR_MSG as ERR } from './snapshot-recorder-constants.js';

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
    if (stryMutAct_9fa48("78131")) {
      {}
    } else {
      stryCov_9fa48("78131");
      this.maxBytesPerSnapshot = stryMutAct_9fa48("78132") ? options.maxBytesPerSnapshot && DEF.MAX_BYTES_PER_SNAPSHOT : (stryCov_9fa48("78132"), options.maxBytesPerSnapshot ?? DEF.MAX_BYTES_PER_SNAPSHOT);
      this.maxFramesPerSession = stryMutAct_9fa48("78133") ? options.maxFramesPerSession && DEF.MAX_FRAMES_PER_SESSION : (stryCov_9fa48("78133"), options.maxFramesPerSession ?? DEF.MAX_FRAMES_PER_SESSION);
      this.maxHostCallsPerSession = stryMutAct_9fa48("78134") ? options.maxHostCallsPerSession && DEF.MAX_HOST_CALLS_PER_SESSION : (stryCov_9fa48("78134"), options.maxHostCallsPerSession ?? DEF.MAX_HOST_CALLS_PER_SESSION);
      this.captureTimeoutMs = stryMutAct_9fa48("78135") ? options.captureTimeoutMs && DEF.CAPTURE_TIMEOUT_MS : (stryCov_9fa48("78135"), options.captureTimeoutMs ?? DEF.CAPTURE_TIMEOUT_MS);
      this.now = stryMutAct_9fa48("78138") ? options.now && (() => Date.now()) : stryMutAct_9fa48("78137") ? false : stryMutAct_9fa48("78136") ? true : (stryCov_9fa48("78136", "78137", "78138"), options.now || (stryMutAct_9fa48("78139") ? () => undefined : (stryCov_9fa48("78139"), () => Date.now())));
      this.setTimeoutFn = stryMutAct_9fa48("78142") ? options.setTimeoutFn && setTimeout : stryMutAct_9fa48("78141") ? false : stryMutAct_9fa48("78140") ? true : (stryCov_9fa48("78140", "78141", "78142"), options.setTimeoutFn || setTimeout);
      this.clearTimeoutFn = stryMutAct_9fa48("78145") ? options.clearTimeoutFn && clearTimeout : stryMutAct_9fa48("78144") ? false : stryMutAct_9fa48("78143") ? true : (stryCov_9fa48("78143", "78144", "78145"), options.clearTimeoutFn || clearTimeout);
      this.snapshots = new Map();
    }
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
    if (stryMutAct_9fa48("78146")) {
      {}
    } else {
      stryCov_9fa48("78146");
      return await this._runWithTimeout(async () => {
        if (stryMutAct_9fa48("78147")) {
          {}
        } else {
          stryCov_9fa48("78147");
          assertRequest(request);
          assertSessionId(request.sessionId);
          assertNonEmptyString(request.moduleRef, ERR.MODULE_REF_REQUIRED);
          assertNonEmptyString(request.moduleDigest, ERR.MODULE_DIGEST_REQUIRED);
          if (stryMutAct_9fa48("78149") ? false : stryMutAct_9fa48("78148") ? true : (stryCov_9fa48("78148", "78149"), this.snapshots.has(request.sessionId))) {
            if (stryMutAct_9fa48("78150")) {
              {}
            } else {
              stryCov_9fa48("78150");
              throw new Error(ERR.SNAPSHOT_ALREADY_EXISTS);
            }
          }
          const startedAt = this.now();
          const snapshot = stryMutAct_9fa48("78151") ? {} : (stryCov_9fa48("78151"), {
            snapshotId: buildSnapshotId(),
            sessionId: request.sessionId,
            moduleRef: request.moduleRef,
            moduleDigest: request.moduleDigest,
            lineageId: stryMutAct_9fa48("78154") ? request.lineageId && null : stryMutAct_9fa48("78153") ? false : stryMutAct_9fa48("78152") ? true : (stryCov_9fa48("78152", "78153", "78154"), request.lineageId || null),
            stageId: isNonNegativeInteger(request.stageId) ? request.stageId : null,
            tenantId: stryMutAct_9fa48("78157") ? request.tenantId && null : stryMutAct_9fa48("78156") ? false : stryMutAct_9fa48("78155") ? true : (stryCov_9fa48("78155", "78156", "78157"), request.tenantId || null),
            serviceName: stryMutAct_9fa48("78160") ? request.serviceName && null : stryMutAct_9fa48("78159") ? false : stryMutAct_9fa48("78158") ? true : (stryCov_9fa48("78158", "78159", "78160"), request.serviceName || null),
            inputFrames: stryMutAct_9fa48("78161") ? ["Stryker was here"] : (stryCov_9fa48("78161"), []),
            hostCallLedger: stryMutAct_9fa48("78162") ? ["Stryker was here"] : (stryCov_9fa48("78162"), []),
            memoryBoundaries: stryMutAct_9fa48("78163") ? ["Stryker was here"] : (stryCov_9fa48("78163"), []),
            capturedAt: startedAt,
            updatedAt: startedAt,
            totalBytes: NUM.ZERO,
            formatVersion: DEF.FORMAT_VERSION
          });
          this.snapshots.set(request.sessionId, snapshot);
          return buildSnapshotSummary(snapshot);
        }
      });
    }
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
    if (stryMutAct_9fa48("78164")) {
      {}
    } else {
      stryCov_9fa48("78164");
      return await this._runWithTimeout(async () => {
        if (stryMutAct_9fa48("78165")) {
          {}
        } else {
          stryCov_9fa48("78165");
          assertRequest(request);
          assertSessionId(request.sessionId);
          if (stryMutAct_9fa48("78168") ? !request.frame && typeof request.frame !== TYPEOF.OBJECT : stryMutAct_9fa48("78167") ? false : stryMutAct_9fa48("78166") ? true : (stryCov_9fa48("78166", "78167", "78168"), (stryMutAct_9fa48("78169") ? request.frame : (stryCov_9fa48("78169"), !request.frame)) || (stryMutAct_9fa48("78171") ? typeof request.frame === TYPEOF.OBJECT : stryMutAct_9fa48("78170") ? false : (stryCov_9fa48("78170", "78171"), typeof request.frame !== TYPEOF.OBJECT)))) {
            if (stryMutAct_9fa48("78172")) {
              {}
            } else {
              stryCov_9fa48("78172");
              throw new Error(ERR.FRAME_REQUIRED);
            }
          }
          const snapshot = this._getSnapshotOrThrow(request.sessionId);
          if (stryMutAct_9fa48("78176") ? snapshot.inputFrames.length < this.maxFramesPerSession : stryMutAct_9fa48("78175") ? snapshot.inputFrames.length > this.maxFramesPerSession : stryMutAct_9fa48("78174") ? false : stryMutAct_9fa48("78173") ? true : (stryCov_9fa48("78173", "78174", "78175", "78176"), snapshot.inputFrames.length >= this.maxFramesPerSession)) {
            if (stryMutAct_9fa48("78177")) {
              {}
            } else {
              stryCov_9fa48("78177");
              throw new Error(ERR.SNAPSHOT_FRAME_LIMIT_EXCEEDED);
            }
          }
          snapshot.inputFrames.push(stryMutAct_9fa48("78178") ? {} : (stryCov_9fa48("78178"), {
            ...request.frame,
            capturedAt: this.now()
          }));
          this._refreshSnapshotBudget(snapshot);
          return buildSnapshotSummary(snapshot);
        }
      });
    }
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
    if (stryMutAct_9fa48("78179")) {
      {}
    } else {
      stryCov_9fa48("78179");
      return await this._runWithTimeout(async () => {
        if (stryMutAct_9fa48("78180")) {
          {}
        } else {
          stryCov_9fa48("78180");
          assertRequest(request);
          assertSessionId(request.sessionId);
          if (stryMutAct_9fa48("78183") ? !request.hostCall && typeof request.hostCall !== TYPEOF.OBJECT : stryMutAct_9fa48("78182") ? false : stryMutAct_9fa48("78181") ? true : (stryCov_9fa48("78181", "78182", "78183"), (stryMutAct_9fa48("78184") ? request.hostCall : (stryCov_9fa48("78184"), !request.hostCall)) || (stryMutAct_9fa48("78186") ? typeof request.hostCall === TYPEOF.OBJECT : stryMutAct_9fa48("78185") ? false : (stryCov_9fa48("78185", "78186"), typeof request.hostCall !== TYPEOF.OBJECT)))) {
            if (stryMutAct_9fa48("78187")) {
              {}
            } else {
              stryCov_9fa48("78187");
              throw new Error(ERR.HOST_CALL_REQUIRED);
            }
          }
          const snapshot = this._getSnapshotOrThrow(request.sessionId);
          if (stryMutAct_9fa48("78191") ? snapshot.hostCallLedger.length < this.maxHostCallsPerSession : stryMutAct_9fa48("78190") ? snapshot.hostCallLedger.length > this.maxHostCallsPerSession : stryMutAct_9fa48("78189") ? false : stryMutAct_9fa48("78188") ? true : (stryCov_9fa48("78188", "78189", "78190", "78191"), snapshot.hostCallLedger.length >= this.maxHostCallsPerSession)) {
            if (stryMutAct_9fa48("78192")) {
              {}
            } else {
              stryCov_9fa48("78192");
              throw new Error(ERR.SNAPSHOT_HOST_CALL_LIMIT_EXCEEDED);
            }
          }
          snapshot.hostCallLedger.push(stryMutAct_9fa48("78193") ? {} : (stryCov_9fa48("78193"), {
            ...request.hostCall,
            capturedAt: this.now()
          }));
          this._refreshSnapshotBudget(snapshot);
          return buildSnapshotSummary(snapshot);
        }
      });
    }
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
    if (stryMutAct_9fa48("78194")) {
      {}
    } else {
      stryCov_9fa48("78194");
      return await this._runWithTimeout(async () => {
        if (stryMutAct_9fa48("78195")) {
          {}
        } else {
          stryCov_9fa48("78195");
          assertRequest(request);
          assertSessionId(request.sessionId);
          assertNonEmptyString(request.label, ERR.MEMORY_LABEL_REQUIRED);
          if (stryMutAct_9fa48("78198") ? false : stryMutAct_9fa48("78197") ? true : stryMutAct_9fa48("78196") ? isSupportedMemoryBytes(request.memoryBytes) : (stryCov_9fa48("78196", "78197", "78198"), !isSupportedMemoryBytes(request.memoryBytes))) {
            if (stryMutAct_9fa48("78199")) {
              {}
            } else {
              stryCov_9fa48("78199");
              throw new Error(ERR.MEMORY_BYTES_REQUIRED);
            }
          }
          const snapshot = this._getSnapshotOrThrow(request.sessionId);
          const bytes = normalizeMemoryBytes(request.memoryBytes);
          const offset = isNonNegativeInteger(request.offset) ? request.offset : NUM.ZERO;
          const length = isNonNegativeInteger(request.length) ? request.length : bytes.byteLength;
          snapshot.memoryBoundaries.push(stryMutAct_9fa48("78200") ? {} : (stryCov_9fa48("78200"), {
            label: request.label,
            offset,
            length,
            bytesBase64: Buffer.from(bytes).toString(stryMutAct_9fa48("78201") ? "" : (stryCov_9fa48("78201"), 'base64')),
            capturedAt: this.now()
          }));
          this._refreshSnapshotBudget(snapshot);
          return buildSnapshotSummary(snapshot);
        }
      });
    }
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
    if (stryMutAct_9fa48("78202")) {
      {}
    } else {
      stryCov_9fa48("78202");
      return await this._runWithTimeout(async () => {
        if (stryMutAct_9fa48("78203")) {
          {}
        } else {
          stryCov_9fa48("78203");
          assertRequest(request);
          assertSessionId(request.sessionId);
          const snapshot = this._getSnapshotOrThrow(request.sessionId);
          this._refreshSnapshotBudget(snapshot);
          const manifest = buildSnapshotManifest(snapshot);
          const envelope = serializeSnapshotEnvelope(snapshot, manifest);
          if (stryMutAct_9fa48("78206") ? request.keepInMemory === true : stryMutAct_9fa48("78205") ? false : stryMutAct_9fa48("78204") ? true : (stryCov_9fa48("78204", "78205", "78206"), request.keepInMemory !== (stryMutAct_9fa48("78207") ? false : (stryCov_9fa48("78207"), true)))) {
            if (stryMutAct_9fa48("78208")) {
              {}
            } else {
              stryCov_9fa48("78208");
              this.snapshots.delete(request.sessionId);
            }
          }
          return stryMutAct_9fa48("78209") ? {} : (stryCov_9fa48("78209"), {
            manifest,
            envelope,
            snapshot: cloneSnapshot(snapshot)
          });
        }
      });
    }
  }

  /**
   * Deserialize a snapshot envelope.
   *
   * @param {Buffer|Uint8Array} buffer
   * @return {{manifest: Object, snapshot: Object}}
   */
  deserializeSnapshot(buffer) {
    if (stryMutAct_9fa48("78210")) {
      {}
    } else {
      stryCov_9fa48("78210");
      return deserializeSnapshotEnvelope(buffer);
    }
  }

  /**
   * Get an active snapshot summary for a session.
   *
   * @param {Object} request
   * @param {string} request.sessionId
   * @return {Object|null}
   */
  getSessionSnapshot(request) {
    if (stryMutAct_9fa48("78211")) {
      {}
    } else {
      stryCov_9fa48("78211");
      assertRequest(request);
      assertSessionId(request.sessionId);
      const snapshot = stryMutAct_9fa48("78214") ? this.snapshots.get(request.sessionId) && null : stryMutAct_9fa48("78213") ? false : stryMutAct_9fa48("78212") ? true : (stryCov_9fa48("78212", "78213", "78214"), this.snapshots.get(request.sessionId) || null);
      return snapshot ? buildSnapshotSummary(snapshot) : null;
    }
  }

  /**
   * @param {Object} snapshot
   * @private
   */
  _refreshSnapshotBudget(snapshot) {
    if (stryMutAct_9fa48("78215")) {
      {}
    } else {
      stryCov_9fa48("78215");
      snapshot.updatedAt = this.now();
      snapshot.totalBytes = estimateSnapshotBytes(snapshot);
      if (stryMutAct_9fa48("78219") ? snapshot.totalBytes <= this.maxBytesPerSnapshot : stryMutAct_9fa48("78218") ? snapshot.totalBytes >= this.maxBytesPerSnapshot : stryMutAct_9fa48("78217") ? false : stryMutAct_9fa48("78216") ? true : (stryCov_9fa48("78216", "78217", "78218", "78219"), snapshot.totalBytes > this.maxBytesPerSnapshot)) {
        if (stryMutAct_9fa48("78220")) {
          {}
        } else {
          stryCov_9fa48("78220");
          throw new Error(ERR.SNAPSHOT_BYTES_LIMIT_EXCEEDED);
        }
      }
    }
  }

  /**
   * @param {string} sessionId
   * @return {Object}
   * @private
   */
  _getSnapshotOrThrow(sessionId) {
    if (stryMutAct_9fa48("78221")) {
      {}
    } else {
      stryCov_9fa48("78221");
      const snapshot = stryMutAct_9fa48("78224") ? this.snapshots.get(sessionId) && null : stryMutAct_9fa48("78223") ? false : stryMutAct_9fa48("78222") ? true : (stryCov_9fa48("78222", "78223", "78224"), this.snapshots.get(sessionId) || null);
      if (stryMutAct_9fa48("78227") ? false : stryMutAct_9fa48("78226") ? true : stryMutAct_9fa48("78225") ? snapshot : (stryCov_9fa48("78225", "78226", "78227"), !snapshot)) {
        if (stryMutAct_9fa48("78228")) {
          {}
        } else {
          stryCov_9fa48("78228");
          throw new Error(ERR.SNAPSHOT_NOT_FOUND);
        }
      }
      return snapshot;
    }
  }

  /**
   * Run operation with timeout bound.
   *
   * @param {Function} operation
   * @return {Promise<*>}
   * @private
   */
  async _runWithTimeout(operation) {
    if (stryMutAct_9fa48("78229")) {
      {}
    } else {
      stryCov_9fa48("78229");
      let timeoutId;
      try {
        if (stryMutAct_9fa48("78230")) {
          {}
        } else {
          stryCov_9fa48("78230");
          return await Promise.race(stryMutAct_9fa48("78231") ? [] : (stryCov_9fa48("78231"), [Promise.resolve().then(stryMutAct_9fa48("78232") ? () => undefined : (stryCov_9fa48("78232"), () => operation())), new Promise((_resolve, reject) => {
            if (stryMutAct_9fa48("78233")) {
              {}
            } else {
              stryCov_9fa48("78233");
              timeoutId = this.setTimeoutFn(() => {
                if (stryMutAct_9fa48("78234")) {
                  {}
                } else {
                  stryCov_9fa48("78234");
                  reject(new Error(ERR.SNAPSHOT_CAPTURE_TIMEOUT));
                }
              }, this.captureTimeoutMs);
            }
          })]));
        }
      } finally {
        if (stryMutAct_9fa48("78235")) {
          {}
        } else {
          stryCov_9fa48("78235");
          if (stryMutAct_9fa48("78238") ? timeoutId === undefined : stryMutAct_9fa48("78237") ? false : stryMutAct_9fa48("78236") ? true : (stryCov_9fa48("78236", "78237", "78238"), timeoutId !== undefined)) {
            if (stryMutAct_9fa48("78239")) {
              {}
            } else {
              stryCov_9fa48("78239");
              this.clearTimeoutFn(timeoutId);
            }
          }
        }
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
  if (stryMutAct_9fa48("78240")) {
    {}
  } else {
    stryCov_9fa48("78240");
    const manifestJson = JSON.stringify(manifest);
    const payloadJson = JSON.stringify(serializeSnapshotPayload(snapshot));
    const manifestBytes = Buffer.from(manifestJson, stryMutAct_9fa48("78241") ? "" : (stryCov_9fa48("78241"), 'utf8'));
    const payloadBytes = Buffer.from(payloadJson, stryMutAct_9fa48("78242") ? "" : (stryCov_9fa48("78242"), 'utf8'));
    const header = Buffer.alloc(DEF.HEADER_SIZE_BYTES);
    header.write(DEF.FORMAT_MAGIC, NUM.ZERO, 4, stryMutAct_9fa48("78243") ? "" : (stryCov_9fa48("78243"), 'ascii'));
    header.writeUInt8(DEF.FORMAT_VERSION, 4);
    header.writeUInt32BE(manifestBytes.length, 5);
    header.writeUInt32BE(payloadBytes.length, 9);
    return Buffer.concat(stryMutAct_9fa48("78244") ? [] : (stryCov_9fa48("78244"), [header, manifestBytes, payloadBytes]));
  }
}

/**
 * Deserialize versioned snapshot envelope.
 *
 * @param {Buffer|Uint8Array} buffer
 * @return {{manifest: Object, snapshot: Object}}
 */
function deserializeSnapshotEnvelope(buffer) {
  if (stryMutAct_9fa48("78245")) {
    {}
  } else {
    stryCov_9fa48("78245");
    if (stryMutAct_9fa48("78248") ? !Buffer.isBuffer(buffer) || !(buffer instanceof Uint8Array) : stryMutAct_9fa48("78247") ? false : stryMutAct_9fa48("78246") ? true : (stryCov_9fa48("78246", "78247", "78248"), (stryMutAct_9fa48("78249") ? Buffer.isBuffer(buffer) : (stryCov_9fa48("78249"), !Buffer.isBuffer(buffer))) && (stryMutAct_9fa48("78250") ? buffer instanceof Uint8Array : (stryCov_9fa48("78250"), !(buffer instanceof Uint8Array))))) {
      if (stryMutAct_9fa48("78251")) {
        {}
      } else {
        stryCov_9fa48("78251");
        throw new Error(ERR.SNAPSHOT_BUFFER_REQUIRED);
      }
    }
    const bytes = Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer);
    if (stryMutAct_9fa48("78255") ? bytes.length >= DEF.HEADER_SIZE_BYTES : stryMutAct_9fa48("78254") ? bytes.length <= DEF.HEADER_SIZE_BYTES : stryMutAct_9fa48("78253") ? false : stryMutAct_9fa48("78252") ? true : (stryCov_9fa48("78252", "78253", "78254", "78255"), bytes.length < DEF.HEADER_SIZE_BYTES)) {
      if (stryMutAct_9fa48("78256")) {
        {}
      } else {
        stryCov_9fa48("78256");
        throw new Error(ERR.SNAPSHOT_BUFFER_TRUNCATED);
      }
    }
    const magic = bytes.toString(stryMutAct_9fa48("78257") ? "" : (stryCov_9fa48("78257"), 'ascii'), NUM.ZERO, 4);
    if (stryMutAct_9fa48("78260") ? magic === DEF.FORMAT_MAGIC : stryMutAct_9fa48("78259") ? false : stryMutAct_9fa48("78258") ? true : (stryCov_9fa48("78258", "78259", "78260"), magic !== DEF.FORMAT_MAGIC)) {
      if (stryMutAct_9fa48("78261")) {
        {}
      } else {
        stryCov_9fa48("78261");
        throw new Error(ERR.SNAPSHOT_FORMAT_MAGIC_INVALID);
      }
    }
    const version = bytes.readUInt8(4);
    if (stryMutAct_9fa48("78264") ? version === DEF.FORMAT_VERSION : stryMutAct_9fa48("78263") ? false : stryMutAct_9fa48("78262") ? true : (stryCov_9fa48("78262", "78263", "78264"), version !== DEF.FORMAT_VERSION)) {
      if (stryMutAct_9fa48("78265")) {
        {}
      } else {
        stryCov_9fa48("78265");
        throw new Error(ERR.SNAPSHOT_FORMAT_VERSION_UNSUPPORTED);
      }
    }
    const manifestLength = bytes.readUInt32BE(5);
    const payloadLength = bytes.readUInt32BE(9);
    const totalLength = stryMutAct_9fa48("78266") ? DEF.HEADER_SIZE_BYTES + manifestLength - payloadLength : (stryCov_9fa48("78266"), (stryMutAct_9fa48("78267") ? DEF.HEADER_SIZE_BYTES - manifestLength : (stryCov_9fa48("78267"), DEF.HEADER_SIZE_BYTES + manifestLength)) + payloadLength);
    if (stryMutAct_9fa48("78271") ? bytes.length >= totalLength : stryMutAct_9fa48("78270") ? bytes.length <= totalLength : stryMutAct_9fa48("78269") ? false : stryMutAct_9fa48("78268") ? true : (stryCov_9fa48("78268", "78269", "78270", "78271"), bytes.length < totalLength)) {
      if (stryMutAct_9fa48("78272")) {
        {}
      } else {
        stryCov_9fa48("78272");
        throw new Error(ERR.SNAPSHOT_BUFFER_TRUNCATED);
      }
    }
    const manifestStart = DEF.HEADER_SIZE_BYTES;
    const manifestEnd = stryMutAct_9fa48("78273") ? manifestStart - manifestLength : (stryCov_9fa48("78273"), manifestStart + manifestLength);
    const payloadEnd = stryMutAct_9fa48("78274") ? manifestEnd - payloadLength : (stryCov_9fa48("78274"), manifestEnd + payloadLength);
    let manifest;
    let payload;
    try {
      if (stryMutAct_9fa48("78275")) {
        {}
      } else {
        stryCov_9fa48("78275");
        manifest = JSON.parse(bytes.toString(stryMutAct_9fa48("78276") ? "" : (stryCov_9fa48("78276"), 'utf8'), manifestStart, manifestEnd));
      }
    } catch (_err) {
      if (stryMutAct_9fa48("78277")) {
        {}
      } else {
        stryCov_9fa48("78277");
        throw new Error(ERR.SNAPSHOT_MANIFEST_INVALID);
      }
    }
    try {
      if (stryMutAct_9fa48("78278")) {
        {}
      } else {
        stryCov_9fa48("78278");
        payload = JSON.parse(bytes.toString(stryMutAct_9fa48("78279") ? "" : (stryCov_9fa48("78279"), 'utf8'), manifestEnd, payloadEnd));
      }
    } catch (_err) {
      if (stryMutAct_9fa48("78280")) {
        {}
      } else {
        stryCov_9fa48("78280");
        throw new Error(ERR.SNAPSHOT_PAYLOAD_INVALID);
      }
    }
    const snapshot = deserializeSnapshotPayload(payload);
    return stryMutAct_9fa48("78281") ? {} : (stryCov_9fa48("78281"), {
      manifest,
      snapshot
    });
  }
}

/**
 * @param {Object} snapshot
 * @return {Object}
 */
function serializeSnapshotPayload(snapshot) {
  if (stryMutAct_9fa48("78282")) {
    {}
  } else {
    stryCov_9fa48("78282");
    return stryMutAct_9fa48("78283") ? {} : (stryCov_9fa48("78283"), {
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
      memoryBoundaries: snapshot.memoryBoundaries
    });
  }
}

/**
 * @param {Object} payload
 * @return {Object}
 */
function deserializeSnapshotPayload(payload) {
  if (stryMutAct_9fa48("78284")) {
    {}
  } else {
    stryCov_9fa48("78284");
    if (stryMutAct_9fa48("78287") ? !payload && typeof payload !== TYPEOF.OBJECT : stryMutAct_9fa48("78286") ? false : stryMutAct_9fa48("78285") ? true : (stryCov_9fa48("78285", "78286", "78287"), (stryMutAct_9fa48("78288") ? payload : (stryCov_9fa48("78288"), !payload)) || (stryMutAct_9fa48("78290") ? typeof payload === TYPEOF.OBJECT : stryMutAct_9fa48("78289") ? false : (stryCov_9fa48("78289", "78290"), typeof payload !== TYPEOF.OBJECT)))) {
      if (stryMutAct_9fa48("78291")) {
        {}
      } else {
        stryCov_9fa48("78291");
        throw new Error(ERR.SNAPSHOT_PAYLOAD_INVALID);
      }
    }
    return stryMutAct_9fa48("78292") ? {} : (stryCov_9fa48("78292"), {
      snapshotId: payload.snapshotId,
      sessionId: payload.sessionId,
      moduleRef: payload.moduleRef,
      moduleDigest: payload.moduleDigest,
      lineageId: stryMutAct_9fa48("78295") ? payload.lineageId && null : stryMutAct_9fa48("78294") ? false : stryMutAct_9fa48("78293") ? true : (stryCov_9fa48("78293", "78294", "78295"), payload.lineageId || null),
      stageId: isNonNegativeInteger(payload.stageId) ? payload.stageId : null,
      tenantId: stryMutAct_9fa48("78298") ? payload.tenantId && null : stryMutAct_9fa48("78297") ? false : stryMutAct_9fa48("78296") ? true : (stryCov_9fa48("78296", "78297", "78298"), payload.tenantId || null),
      serviceName: stryMutAct_9fa48("78301") ? payload.serviceName && null : stryMutAct_9fa48("78300") ? false : stryMutAct_9fa48("78299") ? true : (stryCov_9fa48("78299", "78300", "78301"), payload.serviceName || null),
      formatVersion: stryMutAct_9fa48("78304") ? payload.formatVersion && DEF.FORMAT_VERSION : stryMutAct_9fa48("78303") ? false : stryMutAct_9fa48("78302") ? true : (stryCov_9fa48("78302", "78303", "78304"), payload.formatVersion || DEF.FORMAT_VERSION),
      capturedAt: payload.capturedAt,
      updatedAt: payload.updatedAt,
      totalBytes: stryMutAct_9fa48("78307") ? payload.totalBytes && NUM.ZERO : stryMutAct_9fa48("78306") ? false : stryMutAct_9fa48("78305") ? true : (stryCov_9fa48("78305", "78306", "78307"), payload.totalBytes || NUM.ZERO),
      inputFrames: Array.isArray(payload.inputFrames) ? payload.inputFrames : stryMutAct_9fa48("78308") ? ["Stryker was here"] : (stryCov_9fa48("78308"), []),
      hostCallLedger: Array.isArray(payload.hostCallLedger) ? payload.hostCallLedger : stryMutAct_9fa48("78309") ? ["Stryker was here"] : (stryCov_9fa48("78309"), []),
      memoryBoundaries: Array.isArray(payload.memoryBoundaries) ? payload.memoryBoundaries : stryMutAct_9fa48("78310") ? ["Stryker was here"] : (stryCov_9fa48("78310"), [])
    });
  }
}

/**
 * @param {Object} snapshot
 * @return {Object}
 */
function buildSnapshotManifest(snapshot) {
  if (stryMutAct_9fa48("78311")) {
    {}
  } else {
    stryCov_9fa48("78311");
    return stryMutAct_9fa48("78312") ? {} : (stryCov_9fa48("78312"), {
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
      memoryBoundaryCount: snapshot.memoryBoundaries.length
    });
  }
}

/**
 * @param {Object} snapshot
 * @return {Object}
 */
function buildSnapshotSummary(snapshot) {
  if (stryMutAct_9fa48("78313")) {
    {}
  } else {
    stryCov_9fa48("78313");
    return stryMutAct_9fa48("78314") ? {} : (stryCov_9fa48("78314"), {
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
      formatVersion: snapshot.formatVersion
    });
  }
}

/**
 * @param {Object} snapshot
 * @return {Object}
 */
function cloneSnapshot(snapshot) {
  if (stryMutAct_9fa48("78315")) {
    {}
  } else {
    stryCov_9fa48("78315");
    return JSON.parse(JSON.stringify(snapshot));
  }
}

/**
 * @param {Object} snapshot
 * @return {number}
 */
function estimateSnapshotBytes(snapshot) {
  if (stryMutAct_9fa48("78316")) {
    {}
  } else {
    stryCov_9fa48("78316");
    const payload = serializeSnapshotPayload(snapshot);
    return Buffer.byteLength(JSON.stringify(payload), stryMutAct_9fa48("78317") ? "" : (stryCov_9fa48("78317"), 'utf8'));
  }
}

/**
 * @param {*} value
 * @return {boolean}
 */
function isSupportedMemoryBytes(value) {
  if (stryMutAct_9fa48("78318")) {
    {}
  } else {
    stryCov_9fa48("78318");
    return stryMutAct_9fa48("78321") ? (Buffer.isBuffer(value) || value instanceof Uint8Array) && value instanceof ArrayBuffer : stryMutAct_9fa48("78320") ? false : stryMutAct_9fa48("78319") ? true : (stryCov_9fa48("78319", "78320", "78321"), (stryMutAct_9fa48("78323") ? Buffer.isBuffer(value) && value instanceof Uint8Array : stryMutAct_9fa48("78322") ? false : (stryCov_9fa48("78322", "78323"), Buffer.isBuffer(value) || value instanceof Uint8Array)) || value instanceof ArrayBuffer);
  }
}

/**
 * @param {Buffer|Uint8Array|ArrayBuffer} value
 * @return {Uint8Array}
 */
function normalizeMemoryBytes(value) {
  if (stryMutAct_9fa48("78324")) {
    {}
  } else {
    stryCov_9fa48("78324");
    if (stryMutAct_9fa48("78326") ? false : stryMutAct_9fa48("78325") ? true : (stryCov_9fa48("78325", "78326"), Buffer.isBuffer(value))) {
      if (stryMutAct_9fa48("78327")) {
        {}
      } else {
        stryCov_9fa48("78327");
        return new Uint8Array(stryMutAct_9fa48("78328") ? value.buffer : (stryCov_9fa48("78328"), value.buffer.slice(value.byteOffset, stryMutAct_9fa48("78329") ? value.byteOffset - value.byteLength : (stryCov_9fa48("78329"), value.byteOffset + value.byteLength))));
      }
    }
    if (stryMutAct_9fa48("78331") ? false : stryMutAct_9fa48("78330") ? true : (stryCov_9fa48("78330", "78331"), value instanceof Uint8Array)) {
      if (stryMutAct_9fa48("78332")) {
        {}
      } else {
        stryCov_9fa48("78332");
        return new Uint8Array(stryMutAct_9fa48("78333") ? value.buffer : (stryCov_9fa48("78333"), value.buffer.slice(value.byteOffset, stryMutAct_9fa48("78334") ? value.byteOffset - value.byteLength : (stryCov_9fa48("78334"), value.byteOffset + value.byteLength))));
      }
    }
    return new Uint8Array(stryMutAct_9fa48("78335") ? value : (stryCov_9fa48("78335"), value.slice(NUM.ZERO)));
  }
}

/**
 * @param {Object} request
 */
function assertRequest(request) {
  if (stryMutAct_9fa48("78336")) {
    {}
  } else {
    stryCov_9fa48("78336");
    if (stryMutAct_9fa48("78339") ? !request && typeof request !== TYPEOF.OBJECT : stryMutAct_9fa48("78338") ? false : stryMutAct_9fa48("78337") ? true : (stryCov_9fa48("78337", "78338", "78339"), (stryMutAct_9fa48("78340") ? request : (stryCov_9fa48("78340"), !request)) || (stryMutAct_9fa48("78342") ? typeof request === TYPEOF.OBJECT : stryMutAct_9fa48("78341") ? false : (stryCov_9fa48("78341", "78342"), typeof request !== TYPEOF.OBJECT)))) {
      if (stryMutAct_9fa48("78343")) {
        {}
      } else {
        stryCov_9fa48("78343");
        throw new Error(ERR.REQUEST_REQUIRED);
      }
    }
  }
}

/**
 * @param {string} sessionId
 */
function assertSessionId(sessionId) {
  if (stryMutAct_9fa48("78344")) {
    {}
  } else {
    stryCov_9fa48("78344");
    assertNonEmptyString(sessionId, ERR.SESSION_ID_REQUIRED);
  }
}

/**
 * @param {*} value
 * @param {string} errorMessage
 */
function assertNonEmptyString(value, errorMessage) {
  if (stryMutAct_9fa48("78345")) {
    {}
  } else {
    stryCov_9fa48("78345");
    if (stryMutAct_9fa48("78348") ? typeof value !== TYPEOF.STRING && value.trim().length === NUM.ZERO : stryMutAct_9fa48("78347") ? false : stryMutAct_9fa48("78346") ? true : (stryCov_9fa48("78346", "78347", "78348"), (stryMutAct_9fa48("78350") ? typeof value === TYPEOF.STRING : stryMutAct_9fa48("78349") ? false : (stryCov_9fa48("78349", "78350"), typeof value !== TYPEOF.STRING)) || (stryMutAct_9fa48("78352") ? value.trim().length !== NUM.ZERO : stryMutAct_9fa48("78351") ? false : (stryCov_9fa48("78351", "78352"), (stryMutAct_9fa48("78353") ? value.length : (stryCov_9fa48("78353"), value.trim().length)) === NUM.ZERO)))) {
      if (stryMutAct_9fa48("78354")) {
        {}
      } else {
        stryCov_9fa48("78354");
        throw new Error(errorMessage);
      }
    }
  }
}

/**
 * @param {*} value
 * @return {boolean}
 */
function isNonNegativeInteger(value) {
  if (stryMutAct_9fa48("78355")) {
    {}
  } else {
    stryCov_9fa48("78355");
    return stryMutAct_9fa48("78358") ? Number.isInteger(value) || value >= NUM.ZERO : stryMutAct_9fa48("78357") ? false : stryMutAct_9fa48("78356") ? true : (stryCov_9fa48("78356", "78357", "78358"), Number.isInteger(value) && (stryMutAct_9fa48("78361") ? value < NUM.ZERO : stryMutAct_9fa48("78360") ? value > NUM.ZERO : stryMutAct_9fa48("78359") ? true : (stryCov_9fa48("78359", "78360", "78361"), value >= NUM.ZERO)));
  }
}

/**
 * @return {string}
 */
function buildSnapshotId() {
  if (stryMutAct_9fa48("78362")) {
    {}
  } else {
    stryCov_9fa48("78362");
    return crypto.randomUUID();
  }
}
export { SnapshotRecorder, serializeSnapshotEnvelope, deserializeSnapshotEnvelope, buildSnapshotManifest };