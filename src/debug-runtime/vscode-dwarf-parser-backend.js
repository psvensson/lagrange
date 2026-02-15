/**
 * DWARF parser integration backed by @vscode/dwarf-debugging.
 *
 * This adapter owns direct worker protocol calls so the rest of
 * the debug runtime can rely on a stable parse result contract.
 */

import {spawn as spawnDwarfDebugWorker} from '@vscode/dwarf-debugging';
import {NUM, TYPEOF} from '../constants/index.js';
import {
  DWARF_INDEX_DEFAULT as DEF,
  DWARF_INDEX_VALUE as VALUE,
  DWARF_INDEX_ERROR_MSG as ERR,
  DWARF_INDEX_FIELD as FIELD,
} from './dwarf-index-constants.js';

const WORKER_METHOD = Object.freeze({
  HELLO: 'hello',
  ADD_RAW_MODULE: 'addRawModule',
  GET_MAPPED_LINES: 'getMappedLines',
  SOURCE_TO_RAW: 'sourceLocationToRawLocation',
  GET_FUNCTION_INFO: 'getFunctionInfo',
});

const EMPTY_MODULE_CONFIGURATIONS = Object.freeze([]);
const EMPTY_SOURCE_MAPPINGS = Object.freeze([]);
const EMPTY_SYMBOL_MAPPINGS = Object.freeze([]);

const FALLBACK_WASM_VALUE = Object.freeze({
  type: VALUE.WASM_VALUE_I32,
  value: NUM.ZERO,
});

/**
 * Validate common module parse request fields.
 *
 * @param {Object} request - Parse request payload.
 * @throws {Error} On invalid request shape.
 */
function validateDwarfModuleRequest(request) {
  if (!request || typeof request !== TYPEOF.OBJECT) {
    throw new Error(ERR.REQUEST_REQUIRED);
  }
  if (!isNonEmptyString(request.moduleRef)) {
    throw new Error(ERR.MODULE_REF_REQUIRED);
  }
  if (!isNonEmptyString(request.moduleDigest)) {
    throw new Error(ERR.MODULE_DIGEST_REQUIRED);
  }
  if (!isSupportedWasmBytes(request.wasmBytes)) {
    throw new Error(ERR.WASM_BYTES_REQUIRED);
  }
  if (request.moduleUrl !== undefined &&
    !isNonEmptyString(request.moduleUrl)) {
    throw new Error(ERR.MODULE_URL_REQUIRED);
  }
}

/**
 * Parse DWARF metadata using @vscode/dwarf-debugging worker API.
 */
class VscodeDwarfParserBackend {
  /**
   * @param {Object} [options] - Backend options.
   * @param {Function} [options.spawnWorker] - Worker factory.
   * @param {Array<Object>} [options.moduleConfigurations]
   * @param {boolean} [options.logPluginApiCalls]
   */
  constructor(options = {}) {
    this._spawnWorker = options.spawnWorker || spawnDwarfDebugWorker;
    this._moduleConfigurations =
      options.moduleConfigurations || EMPTY_MODULE_CONFIGURATIONS;
    this._logPluginApiCalls = options.logPluginApiCalls === true;
  }

  /**
   * Parse a wasm module and return normalized source/symbol mappings.
   *
   * @param {Object} request - Parse request.
   * @param {string} request.moduleRef - Stable module reference.
   * @param {string} request.moduleDigest - Stable module digest.
   * @param {Buffer|Uint8Array|ArrayBuffer} request.wasmBytes - Wasm bytes.
   * @param {string} [request.moduleUrl] - Optional module URL.
   * @param {string} [request.rawModuleId] - Optional worker module id.
   * @return {Promise<Object>} Normalized parse output.
   */
  async parseModule(request) {
    validateDwarfModuleRequest(request);

    const moduleRef = request.moduleRef;
    const moduleDigest = request.moduleDigest;
    const moduleUrl = request.moduleUrl ||
      `file:///${moduleRef}.wasm`;
    const rawModuleId = request.rawModuleId || moduleDigest;
    const moduleCode = normalizeWasmBytesToArrayBuffer(
      request.wasmBytes,
    );

    const worker = this._spawnWorker(createNoopHostInterface());
    try {
      const rpc = worker.rpc;
      await rpc.sendMessage(
        WORKER_METHOD.HELLO,
        this._moduleConfigurations,
        this._logPluginApiCalls,
      );

      const addRawResult = await rpc.sendMessage(
        WORKER_METHOD.ADD_RAW_MODULE,
        rawModuleId,
        undefined,
        {
          url: moduleUrl,
          code: moduleCode,
        },
      );

      const sourceFiles = normalizeSourceFiles(addRawResult);
      if (sourceFiles.length === NUM.ZERO) {
        return {
          moduleRef,
          moduleDigest,
          rawModuleId,
          sourceFiles,
          sourceMappings: EMPTY_SOURCE_MAPPINGS,
          symbolMappings: EMPTY_SYMBOL_MAPPINGS,
        };
      }

      const {
        sourceMappings,
        symbolMappings,
      } = await buildSourceAndSymbolMappings(
        rpc,
        rawModuleId,
        sourceFiles,
      );

      return {
        moduleRef,
        moduleDigest,
        rawModuleId,
        sourceFiles,
        sourceMappings,
        symbolMappings,
      };
    } finally {
      await worker.dispose();
    }
  }
}

/**
 * Build normalized mapping arrays from worker API responses.
 *
 * @param {Object} rpc - Worker RPC instance.
 * @param {string} rawModuleId - Module id used by worker.
 * @param {string[]} sourceFiles - Source files present in module.
 * @return {Promise<{sourceMappings: Array, symbolMappings: Array}>}
 */
async function buildSourceAndSymbolMappings(rpc, rawModuleId, sourceFiles) {
  const sourceMappings = [];
  const symbolMappings = [];
  const sourceMappingSeen = new Set();
  const symbolMappingSeen = new Set();
  const symbolCache = new Map();

  for (const sourceFileUrl of sourceFiles) {
    const mappedLinesResult = await rpc.sendMessage(
      WORKER_METHOD.GET_MAPPED_LINES,
      rawModuleId,
      sourceFileUrl,
    );
    const mappedLines = normalizeMappedLines(mappedLinesResult);

    for (const lineNumber of mappedLines) {
      const rawRangesResult = await rpc.sendMessage(
        WORKER_METHOD.SOURCE_TO_RAW,
        {
          rawModuleId,
          sourceFileURL: sourceFileUrl,
          lineNumber,
          columnNumber: DEF.LINE_COLUMN_ZERO,
        },
      );
      const rawRanges = Array.isArray(rawRangesResult) ?
        rawRangesResult :
        [];

      for (const rawRange of rawRanges) {
        if (!isValidOffsetRange(rawRange)) {
          continue;
        }

        const startOffset = rawRange.startOffset;
        const endOffset = rawRange.endOffset;
        const mappingKey = [
          sourceFileUrl,
          lineNumber,
          startOffset,
          endOffset,
        ].join(':');

        if (!sourceMappingSeen.has(mappingKey)) {
          sourceMappings.push({
            sourceFileUrl,
            lineNumber,
            columnNumber: DEF.LINE_COLUMN_ZERO,
            startOffset,
            endOffset,
          });
          sourceMappingSeen.add(mappingKey);
        }

        const symbolRangeKey = `${startOffset}:${endOffset}`;
        if (!symbolCache.has(symbolRangeKey)) {
          symbolCache.set(
            symbolRangeKey,
            resolvePrimarySymbolName(rpc, rawModuleId, startOffset),
          );
        }

        const symbolName = await symbolCache.get(symbolRangeKey);
        if (!isNonEmptyString(symbolName)) {
          continue;
        }

        const symbolMappingKey = `${symbolRangeKey}:${symbolName}`;
        if (symbolMappingSeen.has(symbolMappingKey)) {
          continue;
        }

        symbolMappings.push({
          symbolName,
          startOffset,
          endOffset,
        });
        symbolMappingSeen.add(symbolMappingKey);
      }
    }
  }

  return {
    sourceMappings,
    symbolMappings,
  };
}

/**
 * Resolve the primary symbol name for a code offset.
 *
 * @param {Object} rpc - Worker RPC instance.
 * @param {string} rawModuleId - Module id.
 * @param {number} codeOffset - Offset within module code.
 * @return {Promise<string|null>} Primary symbol or null.
 */
async function resolvePrimarySymbolName(rpc, rawModuleId, codeOffset) {
  const functionInfo = await rpc.sendMessage(
    WORKER_METHOD.GET_FUNCTION_INFO,
    {
      rawModuleId,
      codeOffset,
      inlineFrameIndex: DEF.INLINE_FRAME_INDEX_ZERO,
    },
  );

  if (functionInfo &&
    typeof functionInfo === TYPEOF.OBJECT &&
    Array.isArray(functionInfo[FIELD.MISSING_SYMBOL_FILES])) {
    const detail = functionInfo[FIELD.MISSING_SYMBOL_FILES].join(', ');
    throw new Error(`${ERR.PARSER_MISSING_SYMBOLS}: ${detail}`);
  }

  const frames = functionInfo?.[FIELD.FRAMES];
  if (!Array.isArray(frames) || frames.length === NUM.ZERO) {
    return null;
  }

  const firstName = frames[NUM.ZERO]?.[FIELD.NAME];
  return isNonEmptyString(firstName) ? firstName : null;
}

/**
 * Normalize source file list returned by addRawModule.
 *
 * @param {Array<string>|Object} addRawResult - Worker response.
 * @return {string[]} Unique, non-empty source URLs.
 */
function normalizeSourceFiles(addRawResult) {
  if (Array.isArray(addRawResult)) {
    const unique = new Set();
    for (const sourceFileUrl of addRawResult) {
      if (!isNonEmptyString(sourceFileUrl)) {
        continue;
      }
      unique.add(sourceFileUrl);
    }
    return [...unique];
  }

  if (addRawResult &&
    typeof addRawResult === TYPEOF.OBJECT &&
    Array.isArray(addRawResult[FIELD.MISSING_SYMBOL_FILES])) {
    const detail = addRawResult[FIELD.MISSING_SYMBOL_FILES].join(', ');
    throw new Error(`${ERR.PARSER_MISSING_SYMBOLS}: ${detail}`);
  }

  throw new Error(ERR.PARSER_RESPONSE_INVALID);
}

/**
 * Normalize mapped line results and cap fan-out per source file.
 *
 * @param {Array<number>|undefined} mappedLinesResult - Worker response.
 * @return {number[]} Deduped non-negative integer lines.
 */
function normalizeMappedLines(mappedLinesResult) {
  if (!Array.isArray(mappedLinesResult)) {
    return [];
  }

  const unique = new Set();
  for (const lineNumber of mappedLinesResult) {
    if (!isNonNegativeInteger(lineNumber)) {
      continue;
    }
    unique.add(lineNumber);
    if (unique.size >= DEF.MAX_MAPPED_LINES_PER_SOURCE) {
      break;
    }
  }
  return [...unique];
}

/**
 * Convert supported byte containers into a detached ArrayBuffer view.
 *
 * @param {Buffer|Uint8Array|ArrayBuffer} wasmBytes - Input bytes.
 * @return {ArrayBuffer} ArrayBuffer ready for worker transport.
 */
function normalizeWasmBytesToArrayBuffer(wasmBytes) {
  if (Buffer.isBuffer(wasmBytes)) {
    return wasmBytes.buffer.slice(
      wasmBytes.byteOffset,
      wasmBytes.byteOffset + wasmBytes.byteLength,
    );
  }
  if (wasmBytes instanceof Uint8Array) {
    return wasmBytes.buffer.slice(
      wasmBytes.byteOffset,
      wasmBytes.byteOffset + wasmBytes.byteLength,
    );
  }
  return wasmBytes;
}

/**
 * Build a minimal host interface required by the worker runtime.
 *
 * The parser-only flow does not read locals/globals/memory, but
 * these methods must exist for interface completeness.
 *
 * @return {Object} Async host interface.
 */
function createNoopHostInterface() {
  return {
    async getWasmLinearMemory(_offset, length, _stopId) {
      if (!isNonNegativeInteger(length)) {
        return new ArrayBuffer(NUM.ZERO);
      }
      return new ArrayBuffer(length);
    },
    async getWasmLocal(_local, _stopId) {
      return FALLBACK_WASM_VALUE;
    },
    async getWasmGlobal(_global, _stopId) {
      return FALLBACK_WASM_VALUE;
    },
    async getWasmOp(_op, _stopId) {
      return FALLBACK_WASM_VALUE;
    },
  };
}

/**
 * Determine whether a range object has usable offset bounds.
 *
 * @param {Object} rawRange - Candidate range.
 * @return {boolean} True when offsets are valid.
 */
function isValidOffsetRange(rawRange) {
  if (!rawRange || typeof rawRange !== TYPEOF.OBJECT) {
    return false;
  }
  if (!isNonNegativeInteger(rawRange.startOffset)) {
    return false;
  }
  if (!isNonNegativeInteger(rawRange.endOffset)) {
    return false;
  }
  return rawRange.endOffset >= rawRange.startOffset;
}

/**
 * Check whether wasm bytes are in a supported container type.
 *
 * @param {*} wasmBytes - Candidate bytes input.
 * @return {boolean} True for supported types.
 */
function isSupportedWasmBytes(wasmBytes) {
  return Buffer.isBuffer(wasmBytes) ||
    wasmBytes instanceof Uint8Array ||
    wasmBytes instanceof ArrayBuffer;
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
  VscodeDwarfParserBackend,
  validateDwarfModuleRequest,
  normalizeWasmBytesToArrayBuffer,
  normalizeSourceFiles,
  normalizeMappedLines,
};
