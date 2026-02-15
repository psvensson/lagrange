/**
 * Runtime introspection for stack frames, locals, and memory.
 */

import {NUM, TYPEOF} from '../constants/index.js';
import {
  lookupSourceForOffset,
  lookupSymbolsForOffset,
} from './dwarf-index-builder.js';
import {
  RUNTIME_INTROSPECTOR_DEFAULT as DEF,
  RUNTIME_INTROSPECTOR_ERROR_MSG as ERR,
} from './runtime-introspector-constants.js';

/**
 * RuntimeIntrospector provides bounded inspect APIs.
 */
class RuntimeIntrospector {
  /**
   * @param {Object} [options]
   * @param {Object} [options.runtimeAdapter] - Runtime adapter.
   * @param {Function} [options.lookupSourceForOffset] - Source lookup fn.
   * @param {Function} [options.lookupSymbolsForOffset] - Symbol lookup fn.
   * @param {number} [options.maxMemoryReadBytes] - Max read length.
   * @param {number} [options.maxVariablesPerScope] - Max locals per request.
   * @param {number} [options.requestTimeoutMs] - Inspect timeout.
   * @param {Function} [options.setTimeoutFn] - Timeout fn.
   * @param {Function} [options.clearTimeoutFn] - Clear timeout fn.
   */
  constructor(options = {}) {
    this._runtimeAdapter = options.runtimeAdapter || null;
    this._lookupSourceForOffset =
      options.lookupSourceForOffset || lookupSourceForOffset;
    this._lookupSymbolsForOffset =
      options.lookupSymbolsForOffset || lookupSymbolsForOffset;
    this._maxMemoryReadBytes =
      options.maxMemoryReadBytes ?? DEF.MAX_MEMORY_READ_BYTES;
    this._maxVariablesPerScope =
      options.maxVariablesPerScope ?? DEF.MAX_VARIABLES_PER_SCOPE;
    this._requestTimeoutMs =
      options.requestTimeoutMs ?? DEF.REQUEST_TIMEOUT_MS;
    this._setTimeoutFn = options.setTimeoutFn || setTimeout;
    this._clearTimeoutFn = options.clearTimeoutFn || clearTimeout;
  }

  /**
   * List stack frames with DWARF source/symbol mappings.
   *
   * @param {Object} request
   * @param {Object} request.instanceHandle
   * @param {Object} request.index
   * @return {Promise<{frames: Array<Object>}>}
   */
  async listStackFrames(request) {
    validateBaseRequest(request);
    this._assertRuntimeAdapter();

    const inspectState = await this._inspectWithTimeout(
      request.instanceHandle,
    );
    const rawFrames = normalizeFrames(inspectState);

    const frames = rawFrames.map((rawFrame, index) => {
      const frameId = isNonNegativeInteger(rawFrame.frameId) ?
        rawFrame.frameId :
        index;
      const codeOffset = rawFrame.codeOffset;
      const source = this._lookupSourceForOffset(
        request.index,
        codeOffset,
      );
      return {
        frameId,
        codeOffset,
        source: source ? toSourceView(source) : null,
        symbols: this._lookupSymbolsForOffset(
          request.index,
          codeOffset,
        ),
      };
    });

    return {frames};
  }

  /**
   * List local variables for one frame with DWARF-mapped scope metadata.
   *
   * @param {Object} request
   * @param {Object} request.instanceHandle
   * @param {Object} request.index
   * @param {number} [request.frameId]
   * @param {number} [request.maxVariables]
   * @return {Promise<{frameId: number, variables: Array<Object>}>}
   */
  async listLocals(request) {
    validateBaseRequest(request);
    this._assertRuntimeAdapter();

    const frameId = request.frameId ?? DEF.DEFAULT_FRAME_ID;
    if (!isNonNegativeInteger(frameId)) {
      throw new Error(ERR.FRAME_ID_REQUIRED);
    }

    const requestedLimit = request.maxVariables ??
      this._maxVariablesPerScope;
    if (!isNonNegativeInteger(requestedLimit) ||
      requestedLimit > this._maxVariablesPerScope) {
      throw new Error(ERR.VARIABLES_LIMIT_EXCEEDED);
    }

    const inspectState = await this._inspectWithTimeout(
      request.instanceHandle,
    );
    const frame = findFrameById(inspectState, frameId);
    const frameSource = frame ? this._lookupSourceForOffset(
      request.index,
      frame.codeOffset,
    ) : null;

    const locals = getRawLocalsForFrame(inspectState, frameId);
    const limitedLocals = locals.slice(NUM.ZERO, requestedLimit);

    const variables = limitedLocals.map((local, index) => {
      const variable = normalizeLocalVariable(local, index);
      const variableSource = isNonNegativeInteger(
        variable.codeOffset,
      ) ?
        this._lookupSourceForOffset(
          request.index,
          variable.codeOffset,
        ) :
        frameSource;
      return {
        name: variable.name,
        value: variable.value,
        type: variable.type,
        source: variableSource ? toSourceView(variableSource) : null,
      };
    });

    return {
      frameId,
      variables,
    };
  }

  /**
   * Read bounded linear memory from runtime inspect state.
   *
   * @param {Object} request
   * @param {Object} request.instanceHandle
   * @param {number} request.offset
   * @param {number} request.length
   * @return {Promise<{offset: number, length: number, bytes: Uint8Array}>}
   */
  async readMemory(request) {
    validateMemoryRequest(request);
    this._assertRuntimeAdapter();

    if (request.length > this._maxMemoryReadBytes) {
      throw new Error(ERR.MEMORY_READ_LIMIT_EXCEEDED);
    }

    const inspectState = await this._inspectWithTimeout(
      request.instanceHandle,
    );
    const memoryBytes = extractMemoryBytes(inspectState);
    if (!memoryBytes) {
      throw new Error(ERR.MEMORY_UNAVAILABLE);
    }

    if (request.offset >= memoryBytes.byteLength) {
      return {
        offset: request.offset,
        length: NUM.ZERO,
        bytes: new Uint8Array(NUM.ZERO),
      };
    }

    const endOffset = Math.min(
      request.offset + request.length,
      memoryBytes.byteLength,
    );
    const bytes = memoryBytes.slice(request.offset, endOffset);

    return {
      offset: request.offset,
      length: bytes.byteLength,
      bytes,
    };
  }

  /**
   * @param {Object} instanceHandle
   * @return {Promise<Object>}
   * @private
   */
  async _inspectWithTimeout(instanceHandle) {
    let timeoutId;
    try {
      return await Promise.race([
        this._runtimeAdapter.inspect({instanceHandle}),
        new Promise((_resolve, reject) => {
          timeoutId = this._setTimeoutFn(() => {
            reject(new Error(ERR.INSPECT_TIMEOUT));
          }, this._requestTimeoutMs);
        }),
      ]);
    } finally {
      if (timeoutId !== undefined) {
        this._clearTimeoutFn(timeoutId);
      }
    }
  }

  /**
   * @private
   */
  _assertRuntimeAdapter() {
    if (!this._runtimeAdapter ||
      typeof this._runtimeAdapter.inspect !== TYPEOF.FUNCTION) {
      throw new Error(ERR.RUNTIME_ADAPTER_REQUIRED);
    }
  }
}

/**
 * @param {Object} request
 */
function validateBaseRequest(request) {
  if (!request || typeof request !== TYPEOF.OBJECT) {
    throw new Error(ERR.REQUEST_REQUIRED);
  }
  if (!request.instanceHandle ||
    typeof request.instanceHandle !== TYPEOF.OBJECT) {
    throw new Error(ERR.INSTANCE_HANDLE_REQUIRED);
  }
  if (!request.index || typeof request.index !== TYPEOF.OBJECT) {
    throw new Error(ERR.INDEX_REQUIRED);
  }
}

/**
 * @param {Object} request
 */
function validateMemoryRequest(request) {
  validateBaseRequest(request);
  if (!isNonNegativeInteger(request.offset)) {
    throw new Error(ERR.OFFSET_REQUIRED);
  }
  if (!isNonNegativeInteger(request.length)) {
    throw new Error(ERR.LENGTH_REQUIRED);
  }
}

/**
 * @param {Object} inspectState
 * @return {Array<Object>}
 */
function normalizeFrames(inspectState) {
  const rawFrames = inspectState?.stackFrames;
  if (Array.isArray(rawFrames) && rawFrames.length > NUM.ZERO) {
    return rawFrames
      .filter((frame) => isNonNegativeInteger(frame?.codeOffset))
      .map((frame, index) => ({
        frameId: isNonNegativeInteger(frame.frameId) ?
          frame.frameId :
          index,
        codeOffset: frame.codeOffset,
      }));
  }

  if (isNonNegativeInteger(inspectState?.codeOffset)) {
    return [{
      frameId: DEF.DEFAULT_FRAME_ID,
      codeOffset: inspectState.codeOffset,
    }];
  }

  return [];
}

/**
 * @param {Object} inspectState
 * @param {number} frameId
 * @return {Object|null}
 */
function findFrameById(inspectState, frameId) {
  const frames = normalizeFrames(inspectState);
  for (const frame of frames) {
    if (frame.frameId === frameId) {
      return frame;
    }
  }
  return null;
}

/**
 * @param {Object} inspectState
 * @param {number} frameId
 * @return {Array<Object>}
 */
function getRawLocalsForFrame(inspectState, frameId) {
  const localsByFrame = inspectState?.localsByFrame;
  if (localsByFrame &&
    typeof localsByFrame === TYPEOF.OBJECT &&
    Array.isArray(localsByFrame[frameId])) {
    return localsByFrame[frameId];
  }

  if (frameId === DEF.DEFAULT_FRAME_ID &&
    Array.isArray(inspectState?.locals)) {
    return inspectState.locals;
  }

  return [];
}

/**
 * @param {*} local
 * @param {number} index
 * @return {Object}
 */
function normalizeLocalVariable(local, index) {
  if (local && typeof local === TYPEOF.OBJECT) {
    return {
      name: isNonEmptyString(local.name) ? local.name : `local_${index}`,
      value: local.value,
      type: isNonEmptyString(local.type) ?
        local.type :
        typeof local.value,
      codeOffset: local.codeOffset,
    };
  }

  return {
    name: `local_${index}`,
    value: local,
    type: typeof local,
    codeOffset: null,
  };
}

/**
 * @param {Object} inspectState
 * @return {Uint8Array|null}
 */
function extractMemoryBytes(inspectState) {
  const memory = inspectState?.memory ?? inspectState?.linearMemory ?? null;
  if (Buffer.isBuffer(memory)) {
    return new Uint8Array(memory.buffer.slice(
      memory.byteOffset,
      memory.byteOffset + memory.byteLength,
    ));
  }
  if (memory instanceof Uint8Array) {
    return new Uint8Array(memory.buffer.slice(
      memory.byteOffset,
      memory.byteOffset + memory.byteLength,
    ));
  }
  if (memory instanceof ArrayBuffer) {
    return new Uint8Array(memory.slice(NUM.ZERO));
  }
  return null;
}

/**
 * @param {Object} source
 * @return {{sourceFileUrl: string, lineNumber: number, columnNumber: number}}
 */
function toSourceView(source) {
  return {
    sourceFileUrl: source.sourceFileUrl,
    lineNumber: source.lineNumber,
    columnNumber: source.columnNumber,
  };
}

/**
 * @param {*} value
 * @return {boolean}
 */
function isNonNegativeInteger(value) {
  return Number.isInteger(value) && value >= NUM.ZERO;
}

/**
 * @param {*} value
 * @return {boolean}
 */
function isNonEmptyString(value) {
  return typeof value === TYPEOF.STRING &&
    value.trim().length > NUM.ZERO;
}

export {
  RuntimeIntrospector,
};
