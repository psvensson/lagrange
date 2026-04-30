/**
 * Replay runtime for deterministic snapshot debugging.
 */

import {NUM, TYPEOF} from '../constants/index.js';
import {
  deserializeSnapshotEnvelope,
} from './snapshot-recorder.js';
import {
  REPLAY_RUNTIME_DEFAULT as DEF,
  REPLAY_DRIFT_REASON as DRIFT,
  REPLAY_RUNTIME_ERROR_MSG as ERR,
} from './replay-runtime-constants.js';

const LOCAL_NUM_ONE = 1;
const LOCAL_STR_RUNNING = 'running';
const LOCAL_STR_PAUSED = 'paused';

/**
 * Replay runtime that serves state from captured snapshot artifacts.
 */
class ReplayRuntime {
  /**
   * @param {Object} [options]
   * @param {Function} [options.now] - Timestamp provider.
   */
  constructor(options = {}) {
    this.now = options.now || (() => Date.now());
    this.loaded = false;
    this.instanceHandle = null;
    this.manifest = null;
    this.snapshot = null;
    this.frameCursor = DEF.INITIAL_FRAME_CURSOR;
    this.hostCallCursor = DEF.INITIAL_HOST_CALL_CURSOR;
    this.consumedHostCalls = [];
    this.driftDiagnostics = [];
  }

  /**
   * Load replay state from snapshot+manifest objects.
   *
   * @param {Object} request
   * @param {Object} request.manifest
   * @param {Object} request.snapshot
   * @return {{instanceHandle: Object, frameCount: number, hostCallCount: number}}
   */
  loadSnapshot(request) {
    assertRequest(request);
    if (!request.manifest ||
      typeof request.manifest !== TYPEOF.OBJECT) {
      throw new Error(ERR.MANIFEST_REQUIRED);
    }
    if (!request.snapshot ||
      typeof request.snapshot !== TYPEOF.OBJECT) {
      throw new Error(ERR.SNAPSHOT_REQUIRED);
    }

    this.manifest = deepClone(request.manifest);
    this.snapshot = normalizeSnapshot(request.snapshot);
    this.loaded = true;
    this.frameCursor = DEF.INITIAL_FRAME_CURSOR;
    this.hostCallCursor = DEF.INITIAL_HOST_CALL_CURSOR;
    this.consumedHostCalls = [];
    this.driftDiagnostics = [];
    this.instanceHandle = {
      instanceId: `${DEF.INSTANCE_ID_PREFIX}${this.now()}`,
      moduleRef: this.snapshot.moduleRef,
    };

    return {
      instanceHandle: this.instanceHandle,
      frameCount: this.snapshot.inputFrames.length,
      hostCallCount: this.snapshot.hostCallLedger.length,
    };
  }

  /**
   * Load replay state from serialized envelope bytes.
   *
   * @param {Object} request
   * @param {Buffer|Uint8Array} request.envelope
   * @return {{instanceHandle: Object, frameCount: number, hostCallCount: number}}
   */
  loadEnvelope(request) {
    assertRequest(request);
    const {manifest, snapshot} = deserializeSnapshotEnvelope(request.envelope);
    return this.loadSnapshot({manifest, snapshot});
  }

  /**
   * Return runtime adapter interface for DAP managers.
   *
   * @return {{resume: Function, inspect: Function, suspend: Function}}
   */
  createRuntimeAdapter() {
    return {
      resume: async (request) => this.resume(request),
      inspect: async (request) => this.inspect(request),
      suspend: async (request) => this.suspend(request),
    };
  }

  /**
   * Advance replay cursor.
   *
   * @param {Object} request
   * @param {Object} request.instanceHandle
   * @return {Promise<{status: string, instanceHandle: Object}>}
   */
  async resume(request) {
    this._assertLoadedWithInstance(request);
    if (this.frameCursor < this.snapshot.inputFrames.length - LOCAL_NUM_ONE) {
      this.frameCursor += LOCAL_NUM_ONE;
    }
    return {
      status: LOCAL_STR_RUNNING,
      instanceHandle: request.instanceHandle,
    };
  }

  /**
   * Pause replay runtime.
   *
   * @param {Object} request
   * @param {Object} request.instanceHandle
   * @return {Promise<{status: string, instanceHandle: Object}>}
   */
  async suspend(request) {
    this._assertLoadedWithInstance(request);
    return {
      status: LOCAL_STR_PAUSED,
      instanceHandle: request.instanceHandle,
    };
  }

  /**
   * Inspect replay runtime state.
   *
   * @param {Object} request
   * @param {Object} request.instanceHandle
   * @return {Promise<Object>}
   */
  async inspect(request) {
    this._assertLoadedWithInstance(request);

    const frame = this._currentFrame();
    const memoryBoundary = this._currentMemoryBoundary();
    const memory = memoryBoundary ?
      Buffer.from(memoryBoundary.bytesBase64, 'base64') :
      Buffer.alloc(NUM.ZERO);

    return {
      state: LOCAL_STR_PAUSED,
      codeOffset: frame?.codeOffset || NUM.ZERO,
      stackFrames: [{
        frameId: NUM.ZERO,
        codeOffset: frame?.codeOffset || NUM.ZERO,
      }],
      localsByFrame: {
        0: Array.isArray(frame?.locals) ? frame.locals : [],
      },
      memory,
      replayCursor: this.frameCursor,
      consumedHostCallCount: this.hostCallCursor,
    };
  }

  /**
   * Replay one host call from captured ledger.
   *
   * @param {Object} request
   * @param {string} request.namespace
   * @param {string} request.functionName
   * @param {*} [request.args]
   * @return {{ok: boolean, result?: *, error?: string}}
   */
  replayHostCall(request) {
    assertRequest(request);
    if (!isNonEmptyString(request.namespace) ||
      !isNonEmptyString(request.functionName)) {
      throw new Error(ERR.HOST_CALL_REQUIRED);
    }

    this._assertLoaded();
    const expected = this.snapshot.hostCallLedger[this.hostCallCursor] || null;
    if (!expected) {
      const diagnostic = {
        reason: DRIFT.LEDGER_EXHAUSTED,
        actual: {
          namespace: request.namespace,
          functionName: request.functionName,
          args: request.args,
        },
      };
      this.driftDiagnostics.push(diagnostic);
      return {ok: false, error: DRIFT.LEDGER_EXHAUSTED};
    }

    if (expected.namespace !== request.namespace ||
      expected.functionName !== request.functionName) {
      this.driftDiagnostics.push({
        reason: DRIFT.HOST_CALL_MISMATCH,
        expected: {
          namespace: expected.namespace,
          functionName: expected.functionName,
        },
        actual: {
          namespace: request.namespace,
          functionName: request.functionName,
        },
      });
      return {ok: false, error: DRIFT.HOST_CALL_MISMATCH};
    }

    if (!deepEqualJson(expected.args, request.args)) {
      this.driftDiagnostics.push({
        reason: DRIFT.HOST_CALL_ARGS_MISMATCH,
        expectedArgs: expected.args,
        actualArgs: request.args,
      });
      return {ok: false, error: DRIFT.HOST_CALL_ARGS_MISMATCH};
    }

    this.hostCallCursor += LOCAL_NUM_ONE;
    this.consumedHostCalls.push({
      namespace: request.namespace,
      functionName: request.functionName,
      args: request.args,
    });

    if (expected.error) {
      return {ok: false, error: expected.error};
    }
    return {ok: true, result: expected.result};
  }

  /**
   * Verify deterministic replay status and drift diagnostics.
   *
   * @return {Object}
   */
  verifyDeterminism() {
    this._assertLoaded();

    const diagnostics = [...this.driftDiagnostics];
    if (this.hostCallCursor < this.snapshot.hostCallLedger.length) {
      diagnostics.push({
        reason: DRIFT.UNCONSUMED_LEDGER_ENTRIES,
        remaining: this.snapshot.hostCallLedger.length - this.hostCallCursor,
      });
    }

    return {
      deterministic: diagnostics.length === NUM.ZERO,
      expectedHostCallCount: this.snapshot.hostCallLedger.length,
      consumedHostCallCount: this.hostCallCursor,
      driftDiagnostics: diagnostics,
    };
  }

  /**
   * @return {Object}
   */
  getReplayState() {
    this._assertLoaded();
    return {
      instanceHandle: this.instanceHandle,
      frameCursor: this.frameCursor,
      hostCallCursor: this.hostCallCursor,
      frameCount: this.snapshot.inputFrames.length,
      hostCallCount: this.snapshot.hostCallLedger.length,
    };
  }

  /**
   * @return {Object|null}
   * @private
   */
  _currentFrame() {
    if (this.snapshot.inputFrames.length === NUM.ZERO) {
      return null;
    }
    return this.snapshot.inputFrames[this.frameCursor] || null;
  }

  /**
   * @return {Object|null}
   * @private
   */
  _currentMemoryBoundary() {
    if (this.snapshot.memoryBoundaries.length === NUM.ZERO) {
      return null;
    }
    const index = Math.min(
      this.frameCursor,
      this.snapshot.memoryBoundaries.length - 1,
    );
    return this.snapshot.memoryBoundaries[index] || null;
  }

  /**
   * @private
   */
  _assertLoaded() {
    if (!this.loaded || !this.snapshot || !this.instanceHandle) {
      throw new Error(ERR.INSTANCE_NOT_READY);
    }
  }

  /**
   * @param {Object} request
   * @private
   */
  _assertLoadedWithInstance(request) {
    this._assertLoaded();
    if (!request || typeof request !== TYPEOF.OBJECT ||
      !request.instanceHandle ||
      typeof request.instanceHandle !== TYPEOF.OBJECT) {
      throw new Error(ERR.INSTANCE_HANDLE_REQUIRED);
    }
  }
}

/**
 * @param {Object} snapshot
 * @return {Object}
 */
function normalizeSnapshot(snapshot) {
  return {
    snapshotId: snapshot.snapshotId || null,
    sessionId: snapshot.sessionId || null,
    moduleRef: snapshot.moduleRef || null,
    moduleDigest: snapshot.moduleDigest || null,
    inputFrames: Array.isArray(snapshot.inputFrames) ?
      deepClone(snapshot.inputFrames) :
      [],
    hostCallLedger: Array.isArray(snapshot.hostCallLedger) ?
      deepClone(snapshot.hostCallLedger) :
      [],
    memoryBoundaries: Array.isArray(snapshot.memoryBoundaries) ?
      deepClone(snapshot.memoryBoundaries) :
      [],
  };
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
 * @param {*} left
 * @param {*} right
 * @return {boolean}
 */
function deepEqualJson(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

/**
 * @param {*} value
 * @return {boolean}
 */
function isNonEmptyString(value) {
  return typeof value === TYPEOF.STRING &&
    value.trim().length > NUM.ZERO;
}

/**
 * @param {*} value
 * @return {*}
 */
function deepClone(value) {
  return JSON.parse(JSON.stringify(value));
}

export {
  ReplayRuntime,
};
