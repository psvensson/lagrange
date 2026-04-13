/**
 * DWARF parser integration backed by @vscode/dwarf-debugging.
 *
 * This adapter owns direct worker protocol calls so the rest of
 * the debug runtime can rely on a stable parse result contract.
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
import { spawn as spawnDwarfDebugWorker } from '@vscode/dwarf-debugging';
import { NUM, TYPEOF } from '../constants/index.js';
import { DWARF_INDEX_DEFAULT as DEF, DWARF_INDEX_VALUE as VALUE, DWARF_INDEX_ERROR_MSG as ERR, DWARF_INDEX_FIELD as FIELD } from './dwarf-index-constants.js';
const WORKER_METHOD = Object.freeze(stryMutAct_9fa48("78363") ? {} : (stryCov_9fa48("78363"), {
  HELLO: stryMutAct_9fa48("78364") ? "" : (stryCov_9fa48("78364"), 'hello'),
  ADD_RAW_MODULE: stryMutAct_9fa48("78365") ? "" : (stryCov_9fa48("78365"), 'addRawModule'),
  GET_MAPPED_LINES: stryMutAct_9fa48("78366") ? "" : (stryCov_9fa48("78366"), 'getMappedLines'),
  SOURCE_TO_RAW: stryMutAct_9fa48("78367") ? "" : (stryCov_9fa48("78367"), 'sourceLocationToRawLocation'),
  GET_FUNCTION_INFO: stryMutAct_9fa48("78368") ? "" : (stryCov_9fa48("78368"), 'getFunctionInfo')
}));
const EMPTY_MODULE_CONFIGURATIONS = Object.freeze(stryMutAct_9fa48("78369") ? ["Stryker was here"] : (stryCov_9fa48("78369"), []));
const EMPTY_SOURCE_MAPPINGS = Object.freeze(stryMutAct_9fa48("78370") ? ["Stryker was here"] : (stryCov_9fa48("78370"), []));
const EMPTY_SYMBOL_MAPPINGS = Object.freeze(stryMutAct_9fa48("78371") ? ["Stryker was here"] : (stryCov_9fa48("78371"), []));
const FALLBACK_WASM_VALUE = Object.freeze(stryMutAct_9fa48("78372") ? {} : (stryCov_9fa48("78372"), {
  type: VALUE.WASM_VALUE_I32,
  value: NUM.ZERO
}));

/**
 * Validate common module parse request fields.
 *
 * @param {Object} request - Parse request payload.
 * @throws {Error} On invalid request shape.
 */
function validateDwarfModuleRequest(request) {
  if (stryMutAct_9fa48("78373")) {
    {}
  } else {
    stryCov_9fa48("78373");
    if (stryMutAct_9fa48("78376") ? !request && typeof request !== TYPEOF.OBJECT : stryMutAct_9fa48("78375") ? false : stryMutAct_9fa48("78374") ? true : (stryCov_9fa48("78374", "78375", "78376"), (stryMutAct_9fa48("78377") ? request : (stryCov_9fa48("78377"), !request)) || (stryMutAct_9fa48("78379") ? typeof request === TYPEOF.OBJECT : stryMutAct_9fa48("78378") ? false : (stryCov_9fa48("78378", "78379"), typeof request !== TYPEOF.OBJECT)))) {
      if (stryMutAct_9fa48("78380")) {
        {}
      } else {
        stryCov_9fa48("78380");
        throw new Error(ERR.REQUEST_REQUIRED);
      }
    }
    if (stryMutAct_9fa48("78383") ? false : stryMutAct_9fa48("78382") ? true : stryMutAct_9fa48("78381") ? isNonEmptyString(request.moduleRef) : (stryCov_9fa48("78381", "78382", "78383"), !isNonEmptyString(request.moduleRef))) {
      if (stryMutAct_9fa48("78384")) {
        {}
      } else {
        stryCov_9fa48("78384");
        throw new Error(ERR.MODULE_REF_REQUIRED);
      }
    }
    if (stryMutAct_9fa48("78387") ? false : stryMutAct_9fa48("78386") ? true : stryMutAct_9fa48("78385") ? isNonEmptyString(request.moduleDigest) : (stryCov_9fa48("78385", "78386", "78387"), !isNonEmptyString(request.moduleDigest))) {
      if (stryMutAct_9fa48("78388")) {
        {}
      } else {
        stryCov_9fa48("78388");
        throw new Error(ERR.MODULE_DIGEST_REQUIRED);
      }
    }
    if (stryMutAct_9fa48("78391") ? false : stryMutAct_9fa48("78390") ? true : stryMutAct_9fa48("78389") ? isSupportedWasmBytes(request.wasmBytes) : (stryCov_9fa48("78389", "78390", "78391"), !isSupportedWasmBytes(request.wasmBytes))) {
      if (stryMutAct_9fa48("78392")) {
        {}
      } else {
        stryCov_9fa48("78392");
        throw new Error(ERR.WASM_BYTES_REQUIRED);
      }
    }
    if (stryMutAct_9fa48("78395") ? request.moduleUrl !== undefined || !isNonEmptyString(request.moduleUrl) : stryMutAct_9fa48("78394") ? false : stryMutAct_9fa48("78393") ? true : (stryCov_9fa48("78393", "78394", "78395"), (stryMutAct_9fa48("78397") ? request.moduleUrl === undefined : stryMutAct_9fa48("78396") ? true : (stryCov_9fa48("78396", "78397"), request.moduleUrl !== undefined)) && (stryMutAct_9fa48("78398") ? isNonEmptyString(request.moduleUrl) : (stryCov_9fa48("78398"), !isNonEmptyString(request.moduleUrl))))) {
      if (stryMutAct_9fa48("78399")) {
        {}
      } else {
        stryCov_9fa48("78399");
        throw new Error(ERR.MODULE_URL_REQUIRED);
      }
    }
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
    if (stryMutAct_9fa48("78400")) {
      {}
    } else {
      stryCov_9fa48("78400");
      this._spawnWorker = stryMutAct_9fa48("78403") ? options.spawnWorker && spawnDwarfDebugWorker : stryMutAct_9fa48("78402") ? false : stryMutAct_9fa48("78401") ? true : (stryCov_9fa48("78401", "78402", "78403"), options.spawnWorker || spawnDwarfDebugWorker);
      this._moduleConfigurations = stryMutAct_9fa48("78406") ? options.moduleConfigurations && EMPTY_MODULE_CONFIGURATIONS : stryMutAct_9fa48("78405") ? false : stryMutAct_9fa48("78404") ? true : (stryCov_9fa48("78404", "78405", "78406"), options.moduleConfigurations || EMPTY_MODULE_CONFIGURATIONS);
      this._logPluginApiCalls = stryMutAct_9fa48("78409") ? options.logPluginApiCalls !== true : stryMutAct_9fa48("78408") ? false : stryMutAct_9fa48("78407") ? true : (stryCov_9fa48("78407", "78408", "78409"), options.logPluginApiCalls === (stryMutAct_9fa48("78410") ? false : (stryCov_9fa48("78410"), true)));
    }
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
    if (stryMutAct_9fa48("78411")) {
      {}
    } else {
      stryCov_9fa48("78411");
      validateDwarfModuleRequest(request);
      const moduleRef = request.moduleRef;
      const moduleDigest = request.moduleDigest;
      const moduleUrl = stryMutAct_9fa48("78414") ? request.moduleUrl && `file:///${moduleRef}.wasm` : stryMutAct_9fa48("78413") ? false : stryMutAct_9fa48("78412") ? true : (stryCov_9fa48("78412", "78413", "78414"), request.moduleUrl || (stryMutAct_9fa48("78415") ? `` : (stryCov_9fa48("78415"), `file:///${moduleRef}.wasm`)));
      const rawModuleId = stryMutAct_9fa48("78418") ? request.rawModuleId && moduleDigest : stryMutAct_9fa48("78417") ? false : stryMutAct_9fa48("78416") ? true : (stryCov_9fa48("78416", "78417", "78418"), request.rawModuleId || moduleDigest);
      const moduleCode = normalizeWasmBytesToArrayBuffer(request.wasmBytes);
      const worker = this._spawnWorker(createNoopHostInterface());
      try {
        if (stryMutAct_9fa48("78419")) {
          {}
        } else {
          stryCov_9fa48("78419");
          const rpc = worker.rpc;
          await rpc.sendMessage(WORKER_METHOD.HELLO, this._moduleConfigurations, this._logPluginApiCalls);
          const addRawResult = await rpc.sendMessage(WORKER_METHOD.ADD_RAW_MODULE, rawModuleId, undefined, stryMutAct_9fa48("78420") ? {} : (stryCov_9fa48("78420"), {
            url: moduleUrl,
            code: moduleCode
          }));
          const sourceFiles = normalizeSourceFiles(addRawResult);
          if (stryMutAct_9fa48("78423") ? sourceFiles.length !== NUM.ZERO : stryMutAct_9fa48("78422") ? false : stryMutAct_9fa48("78421") ? true : (stryCov_9fa48("78421", "78422", "78423"), sourceFiles.length === NUM.ZERO)) {
            if (stryMutAct_9fa48("78424")) {
              {}
            } else {
              stryCov_9fa48("78424");
              return stryMutAct_9fa48("78425") ? {} : (stryCov_9fa48("78425"), {
                moduleRef,
                moduleDigest,
                rawModuleId,
                sourceFiles,
                sourceMappings: EMPTY_SOURCE_MAPPINGS,
                symbolMappings: EMPTY_SYMBOL_MAPPINGS
              });
            }
          }
          const {
            sourceMappings,
            symbolMappings
          } = await buildSourceAndSymbolMappings(rpc, rawModuleId, sourceFiles);
          return stryMutAct_9fa48("78426") ? {} : (stryCov_9fa48("78426"), {
            moduleRef,
            moduleDigest,
            rawModuleId,
            sourceFiles,
            sourceMappings,
            symbolMappings
          });
        }
      } finally {
        if (stryMutAct_9fa48("78427")) {
          {}
        } else {
          stryCov_9fa48("78427");
          await worker.dispose();
        }
      }
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
  if (stryMutAct_9fa48("78428")) {
    {}
  } else {
    stryCov_9fa48("78428");
    const sourceMappings = stryMutAct_9fa48("78429") ? ["Stryker was here"] : (stryCov_9fa48("78429"), []);
    const symbolMappings = stryMutAct_9fa48("78430") ? ["Stryker was here"] : (stryCov_9fa48("78430"), []);
    const sourceMappingSeen = new Set();
    const symbolMappingSeen = new Set();
    const symbolCache = new Map();
    for (const sourceFileUrl of sourceFiles) {
      if (stryMutAct_9fa48("78431")) {
        {}
      } else {
        stryCov_9fa48("78431");
        const mappedLinesResult = await rpc.sendMessage(WORKER_METHOD.GET_MAPPED_LINES, rawModuleId, sourceFileUrl);
        const mappedLines = normalizeMappedLines(mappedLinesResult);
        for (const lineNumber of mappedLines) {
          if (stryMutAct_9fa48("78432")) {
            {}
          } else {
            stryCov_9fa48("78432");
            const rawRangesResult = await rpc.sendMessage(WORKER_METHOD.SOURCE_TO_RAW, stryMutAct_9fa48("78433") ? {} : (stryCov_9fa48("78433"), {
              rawModuleId,
              sourceFileURL: sourceFileUrl,
              lineNumber,
              columnNumber: DEF.LINE_COLUMN_ZERO
            }));
            const rawRanges = Array.isArray(rawRangesResult) ? rawRangesResult : stryMutAct_9fa48("78434") ? ["Stryker was here"] : (stryCov_9fa48("78434"), []);
            for (const rawRange of rawRanges) {
              if (stryMutAct_9fa48("78435")) {
                {}
              } else {
                stryCov_9fa48("78435");
                if (stryMutAct_9fa48("78438") ? false : stryMutAct_9fa48("78437") ? true : stryMutAct_9fa48("78436") ? isValidOffsetRange(rawRange) : (stryCov_9fa48("78436", "78437", "78438"), !isValidOffsetRange(rawRange))) {
                  if (stryMutAct_9fa48("78439")) {
                    {}
                  } else {
                    stryCov_9fa48("78439");
                    continue;
                  }
                }
                const startOffset = rawRange.startOffset;
                const endOffset = rawRange.endOffset;
                const mappingKey = (stryMutAct_9fa48("78440") ? [] : (stryCov_9fa48("78440"), [sourceFileUrl, lineNumber, startOffset, endOffset])).join(stryMutAct_9fa48("78441") ? "" : (stryCov_9fa48("78441"), ':'));
                if (stryMutAct_9fa48("78444") ? false : stryMutAct_9fa48("78443") ? true : stryMutAct_9fa48("78442") ? sourceMappingSeen.has(mappingKey) : (stryCov_9fa48("78442", "78443", "78444"), !sourceMappingSeen.has(mappingKey))) {
                  if (stryMutAct_9fa48("78445")) {
                    {}
                  } else {
                    stryCov_9fa48("78445");
                    sourceMappings.push(stryMutAct_9fa48("78446") ? {} : (stryCov_9fa48("78446"), {
                      sourceFileUrl,
                      lineNumber,
                      columnNumber: DEF.LINE_COLUMN_ZERO,
                      startOffset,
                      endOffset
                    }));
                    sourceMappingSeen.add(mappingKey);
                  }
                }
                const symbolRangeKey = stryMutAct_9fa48("78447") ? `` : (stryCov_9fa48("78447"), `${startOffset}:${endOffset}`);
                if (stryMutAct_9fa48("78450") ? false : stryMutAct_9fa48("78449") ? true : stryMutAct_9fa48("78448") ? symbolCache.has(symbolRangeKey) : (stryCov_9fa48("78448", "78449", "78450"), !symbolCache.has(symbolRangeKey))) {
                  if (stryMutAct_9fa48("78451")) {
                    {}
                  } else {
                    stryCov_9fa48("78451");
                    symbolCache.set(symbolRangeKey, resolvePrimarySymbolName(rpc, rawModuleId, startOffset));
                  }
                }
                const symbolName = await symbolCache.get(symbolRangeKey);
                if (stryMutAct_9fa48("78454") ? false : stryMutAct_9fa48("78453") ? true : stryMutAct_9fa48("78452") ? isNonEmptyString(symbolName) : (stryCov_9fa48("78452", "78453", "78454"), !isNonEmptyString(symbolName))) {
                  if (stryMutAct_9fa48("78455")) {
                    {}
                  } else {
                    stryCov_9fa48("78455");
                    continue;
                  }
                }
                const symbolMappingKey = stryMutAct_9fa48("78456") ? `` : (stryCov_9fa48("78456"), `${symbolRangeKey}:${symbolName}`);
                if (stryMutAct_9fa48("78458") ? false : stryMutAct_9fa48("78457") ? true : (stryCov_9fa48("78457", "78458"), symbolMappingSeen.has(symbolMappingKey))) {
                  if (stryMutAct_9fa48("78459")) {
                    {}
                  } else {
                    stryCov_9fa48("78459");
                    continue;
                  }
                }
                symbolMappings.push(stryMutAct_9fa48("78460") ? {} : (stryCov_9fa48("78460"), {
                  symbolName,
                  startOffset,
                  endOffset
                }));
                symbolMappingSeen.add(symbolMappingKey);
              }
            }
          }
        }
      }
    }
    return stryMutAct_9fa48("78461") ? {} : (stryCov_9fa48("78461"), {
      sourceMappings,
      symbolMappings
    });
  }
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
  if (stryMutAct_9fa48("78462")) {
    {}
  } else {
    stryCov_9fa48("78462");
    const functionInfo = await rpc.sendMessage(WORKER_METHOD.GET_FUNCTION_INFO, stryMutAct_9fa48("78463") ? {} : (stryCov_9fa48("78463"), {
      rawModuleId,
      codeOffset,
      inlineFrameIndex: DEF.INLINE_FRAME_INDEX_ZERO
    }));
    if (stryMutAct_9fa48("78466") ? functionInfo && typeof functionInfo === TYPEOF.OBJECT || Array.isArray(functionInfo[FIELD.MISSING_SYMBOL_FILES]) : stryMutAct_9fa48("78465") ? false : stryMutAct_9fa48("78464") ? true : (stryCov_9fa48("78464", "78465", "78466"), (stryMutAct_9fa48("78468") ? functionInfo || typeof functionInfo === TYPEOF.OBJECT : stryMutAct_9fa48("78467") ? true : (stryCov_9fa48("78467", "78468"), functionInfo && (stryMutAct_9fa48("78470") ? typeof functionInfo !== TYPEOF.OBJECT : stryMutAct_9fa48("78469") ? true : (stryCov_9fa48("78469", "78470"), typeof functionInfo === TYPEOF.OBJECT)))) && Array.isArray(functionInfo[FIELD.MISSING_SYMBOL_FILES]))) {
      if (stryMutAct_9fa48("78471")) {
        {}
      } else {
        stryCov_9fa48("78471");
        const detail = functionInfo[FIELD.MISSING_SYMBOL_FILES].join(stryMutAct_9fa48("78472") ? "" : (stryCov_9fa48("78472"), ', '));
        throw new Error(stryMutAct_9fa48("78473") ? `` : (stryCov_9fa48("78473"), `${ERR.PARSER_MISSING_SYMBOLS}: ${detail}`));
      }
    }
    const frames = stryMutAct_9fa48("78474") ? functionInfo[FIELD.FRAMES] : (stryCov_9fa48("78474"), functionInfo?.[FIELD.FRAMES]);
    if (stryMutAct_9fa48("78477") ? !Array.isArray(frames) && frames.length === NUM.ZERO : stryMutAct_9fa48("78476") ? false : stryMutAct_9fa48("78475") ? true : (stryCov_9fa48("78475", "78476", "78477"), (stryMutAct_9fa48("78478") ? Array.isArray(frames) : (stryCov_9fa48("78478"), !Array.isArray(frames))) || (stryMutAct_9fa48("78480") ? frames.length !== NUM.ZERO : stryMutAct_9fa48("78479") ? false : (stryCov_9fa48("78479", "78480"), frames.length === NUM.ZERO)))) {
      if (stryMutAct_9fa48("78481")) {
        {}
      } else {
        stryCov_9fa48("78481");
        return null;
      }
    }
    const firstName = stryMutAct_9fa48("78482") ? frames[NUM.ZERO][FIELD.NAME] : (stryCov_9fa48("78482"), frames[NUM.ZERO]?.[FIELD.NAME]);
    return isNonEmptyString(firstName) ? firstName : null;
  }
}

/**
 * Normalize source file list returned by addRawModule.
 *
 * @param {Array<string>|Object} addRawResult - Worker response.
 * @return {string[]} Unique, non-empty source URLs.
 */
function normalizeSourceFiles(addRawResult) {
  if (stryMutAct_9fa48("78483")) {
    {}
  } else {
    stryCov_9fa48("78483");
    if (stryMutAct_9fa48("78485") ? false : stryMutAct_9fa48("78484") ? true : (stryCov_9fa48("78484", "78485"), Array.isArray(addRawResult))) {
      if (stryMutAct_9fa48("78486")) {
        {}
      } else {
        stryCov_9fa48("78486");
        const unique = new Set();
        for (const sourceFileUrl of addRawResult) {
          if (stryMutAct_9fa48("78487")) {
            {}
          } else {
            stryCov_9fa48("78487");
            if (stryMutAct_9fa48("78490") ? false : stryMutAct_9fa48("78489") ? true : stryMutAct_9fa48("78488") ? isNonEmptyString(sourceFileUrl) : (stryCov_9fa48("78488", "78489", "78490"), !isNonEmptyString(sourceFileUrl))) {
              if (stryMutAct_9fa48("78491")) {
                {}
              } else {
                stryCov_9fa48("78491");
                continue;
              }
            }
            unique.add(sourceFileUrl);
          }
        }
        return stryMutAct_9fa48("78492") ? [] : (stryCov_9fa48("78492"), [...unique]);
      }
    }
    if (stryMutAct_9fa48("78495") ? addRawResult && typeof addRawResult === TYPEOF.OBJECT || Array.isArray(addRawResult[FIELD.MISSING_SYMBOL_FILES]) : stryMutAct_9fa48("78494") ? false : stryMutAct_9fa48("78493") ? true : (stryCov_9fa48("78493", "78494", "78495"), (stryMutAct_9fa48("78497") ? addRawResult || typeof addRawResult === TYPEOF.OBJECT : stryMutAct_9fa48("78496") ? true : (stryCov_9fa48("78496", "78497"), addRawResult && (stryMutAct_9fa48("78499") ? typeof addRawResult !== TYPEOF.OBJECT : stryMutAct_9fa48("78498") ? true : (stryCov_9fa48("78498", "78499"), typeof addRawResult === TYPEOF.OBJECT)))) && Array.isArray(addRawResult[FIELD.MISSING_SYMBOL_FILES]))) {
      if (stryMutAct_9fa48("78500")) {
        {}
      } else {
        stryCov_9fa48("78500");
        const detail = addRawResult[FIELD.MISSING_SYMBOL_FILES].join(stryMutAct_9fa48("78501") ? "" : (stryCov_9fa48("78501"), ', '));
        throw new Error(stryMutAct_9fa48("78502") ? `` : (stryCov_9fa48("78502"), `${ERR.PARSER_MISSING_SYMBOLS}: ${detail}`));
      }
    }
    throw new Error(ERR.PARSER_RESPONSE_INVALID);
  }
}

/**
 * Normalize mapped line results and cap fan-out per source file.
 *
 * @param {Array<number>|undefined} mappedLinesResult - Worker response.
 * @return {number[]} Deduped non-negative integer lines.
 */
function normalizeMappedLines(mappedLinesResult) {
  if (stryMutAct_9fa48("78503")) {
    {}
  } else {
    stryCov_9fa48("78503");
    if (stryMutAct_9fa48("78506") ? false : stryMutAct_9fa48("78505") ? true : stryMutAct_9fa48("78504") ? Array.isArray(mappedLinesResult) : (stryCov_9fa48("78504", "78505", "78506"), !Array.isArray(mappedLinesResult))) {
      if (stryMutAct_9fa48("78507")) {
        {}
      } else {
        stryCov_9fa48("78507");
        return stryMutAct_9fa48("78508") ? ["Stryker was here"] : (stryCov_9fa48("78508"), []);
      }
    }
    const unique = new Set();
    for (const lineNumber of mappedLinesResult) {
      if (stryMutAct_9fa48("78509")) {
        {}
      } else {
        stryCov_9fa48("78509");
        if (stryMutAct_9fa48("78512") ? false : stryMutAct_9fa48("78511") ? true : stryMutAct_9fa48("78510") ? isNonNegativeInteger(lineNumber) : (stryCov_9fa48("78510", "78511", "78512"), !isNonNegativeInteger(lineNumber))) {
          if (stryMutAct_9fa48("78513")) {
            {}
          } else {
            stryCov_9fa48("78513");
            continue;
          }
        }
        unique.add(lineNumber);
        if (stryMutAct_9fa48("78517") ? unique.size < DEF.MAX_MAPPED_LINES_PER_SOURCE : stryMutAct_9fa48("78516") ? unique.size > DEF.MAX_MAPPED_LINES_PER_SOURCE : stryMutAct_9fa48("78515") ? false : stryMutAct_9fa48("78514") ? true : (stryCov_9fa48("78514", "78515", "78516", "78517"), unique.size >= DEF.MAX_MAPPED_LINES_PER_SOURCE)) {
          if (stryMutAct_9fa48("78518")) {
            {}
          } else {
            stryCov_9fa48("78518");
            break;
          }
        }
      }
    }
    return stryMutAct_9fa48("78519") ? [] : (stryCov_9fa48("78519"), [...unique]);
  }
}

/**
 * Convert supported byte containers into a detached ArrayBuffer view.
 *
 * @param {Buffer|Uint8Array|ArrayBuffer} wasmBytes - Input bytes.
 * @return {ArrayBuffer} ArrayBuffer ready for worker transport.
 */
function normalizeWasmBytesToArrayBuffer(wasmBytes) {
  if (stryMutAct_9fa48("78520")) {
    {}
  } else {
    stryCov_9fa48("78520");
    if (stryMutAct_9fa48("78522") ? false : stryMutAct_9fa48("78521") ? true : (stryCov_9fa48("78521", "78522"), Buffer.isBuffer(wasmBytes))) {
      if (stryMutAct_9fa48("78523")) {
        {}
      } else {
        stryCov_9fa48("78523");
        return stryMutAct_9fa48("78524") ? wasmBytes.buffer : (stryCov_9fa48("78524"), wasmBytes.buffer.slice(wasmBytes.byteOffset, stryMutAct_9fa48("78525") ? wasmBytes.byteOffset - wasmBytes.byteLength : (stryCov_9fa48("78525"), wasmBytes.byteOffset + wasmBytes.byteLength)));
      }
    }
    if (stryMutAct_9fa48("78527") ? false : stryMutAct_9fa48("78526") ? true : (stryCov_9fa48("78526", "78527"), wasmBytes instanceof Uint8Array)) {
      if (stryMutAct_9fa48("78528")) {
        {}
      } else {
        stryCov_9fa48("78528");
        return stryMutAct_9fa48("78529") ? wasmBytes.buffer : (stryCov_9fa48("78529"), wasmBytes.buffer.slice(wasmBytes.byteOffset, stryMutAct_9fa48("78530") ? wasmBytes.byteOffset - wasmBytes.byteLength : (stryCov_9fa48("78530"), wasmBytes.byteOffset + wasmBytes.byteLength)));
      }
    }
    return wasmBytes;
  }
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
  if (stryMutAct_9fa48("78531")) {
    {}
  } else {
    stryCov_9fa48("78531");
    return stryMutAct_9fa48("78532") ? {} : (stryCov_9fa48("78532"), {
      async getWasmLinearMemory(_offset, length, _stopId) {
        if (stryMutAct_9fa48("78533")) {
          {}
        } else {
          stryCov_9fa48("78533");
          if (stryMutAct_9fa48("78536") ? false : stryMutAct_9fa48("78535") ? true : stryMutAct_9fa48("78534") ? isNonNegativeInteger(length) : (stryCov_9fa48("78534", "78535", "78536"), !isNonNegativeInteger(length))) {
            if (stryMutAct_9fa48("78537")) {
              {}
            } else {
              stryCov_9fa48("78537");
              return new ArrayBuffer(NUM.ZERO);
            }
          }
          return new ArrayBuffer(length);
        }
      },
      async getWasmLocal(_local, _stopId) {
        if (stryMutAct_9fa48("78538")) {
          {}
        } else {
          stryCov_9fa48("78538");
          return FALLBACK_WASM_VALUE;
        }
      },
      async getWasmGlobal(_global, _stopId) {
        if (stryMutAct_9fa48("78539")) {
          {}
        } else {
          stryCov_9fa48("78539");
          return FALLBACK_WASM_VALUE;
        }
      },
      async getWasmOp(_op, _stopId) {
        if (stryMutAct_9fa48("78540")) {
          {}
        } else {
          stryCov_9fa48("78540");
          return FALLBACK_WASM_VALUE;
        }
      }
    });
  }
}

/**
 * Determine whether a range object has usable offset bounds.
 *
 * @param {Object} rawRange - Candidate range.
 * @return {boolean} True when offsets are valid.
 */
function isValidOffsetRange(rawRange) {
  if (stryMutAct_9fa48("78541")) {
    {}
  } else {
    stryCov_9fa48("78541");
    if (stryMutAct_9fa48("78544") ? !rawRange && typeof rawRange !== TYPEOF.OBJECT : stryMutAct_9fa48("78543") ? false : stryMutAct_9fa48("78542") ? true : (stryCov_9fa48("78542", "78543", "78544"), (stryMutAct_9fa48("78545") ? rawRange : (stryCov_9fa48("78545"), !rawRange)) || (stryMutAct_9fa48("78547") ? typeof rawRange === TYPEOF.OBJECT : stryMutAct_9fa48("78546") ? false : (stryCov_9fa48("78546", "78547"), typeof rawRange !== TYPEOF.OBJECT)))) {
      if (stryMutAct_9fa48("78548")) {
        {}
      } else {
        stryCov_9fa48("78548");
        return stryMutAct_9fa48("78549") ? true : (stryCov_9fa48("78549"), false);
      }
    }
    if (stryMutAct_9fa48("78552") ? false : stryMutAct_9fa48("78551") ? true : stryMutAct_9fa48("78550") ? isNonNegativeInteger(rawRange.startOffset) : (stryCov_9fa48("78550", "78551", "78552"), !isNonNegativeInteger(rawRange.startOffset))) {
      if (stryMutAct_9fa48("78553")) {
        {}
      } else {
        stryCov_9fa48("78553");
        return stryMutAct_9fa48("78554") ? true : (stryCov_9fa48("78554"), false);
      }
    }
    if (stryMutAct_9fa48("78557") ? false : stryMutAct_9fa48("78556") ? true : stryMutAct_9fa48("78555") ? isNonNegativeInteger(rawRange.endOffset) : (stryCov_9fa48("78555", "78556", "78557"), !isNonNegativeInteger(rawRange.endOffset))) {
      if (stryMutAct_9fa48("78558")) {
        {}
      } else {
        stryCov_9fa48("78558");
        return stryMutAct_9fa48("78559") ? true : (stryCov_9fa48("78559"), false);
      }
    }
    return stryMutAct_9fa48("78563") ? rawRange.endOffset < rawRange.startOffset : stryMutAct_9fa48("78562") ? rawRange.endOffset > rawRange.startOffset : stryMutAct_9fa48("78561") ? false : stryMutAct_9fa48("78560") ? true : (stryCov_9fa48("78560", "78561", "78562", "78563"), rawRange.endOffset >= rawRange.startOffset);
  }
}

/**
 * Check whether wasm bytes are in a supported container type.
 *
 * @param {*} wasmBytes - Candidate bytes input.
 * @return {boolean} True for supported types.
 */
function isSupportedWasmBytes(wasmBytes) {
  if (stryMutAct_9fa48("78564")) {
    {}
  } else {
    stryCov_9fa48("78564");
    return stryMutAct_9fa48("78567") ? (Buffer.isBuffer(wasmBytes) || wasmBytes instanceof Uint8Array) && wasmBytes instanceof ArrayBuffer : stryMutAct_9fa48("78566") ? false : stryMutAct_9fa48("78565") ? true : (stryCov_9fa48("78565", "78566", "78567"), (stryMutAct_9fa48("78569") ? Buffer.isBuffer(wasmBytes) && wasmBytes instanceof Uint8Array : stryMutAct_9fa48("78568") ? false : (stryCov_9fa48("78568", "78569"), Buffer.isBuffer(wasmBytes) || wasmBytes instanceof Uint8Array)) || wasmBytes instanceof ArrayBuffer);
  }
}

/**
 * @param {*} value
 * @return {boolean}
 */
function isNonNegativeInteger(value) {
  if (stryMutAct_9fa48("78570")) {
    {}
  } else {
    stryCov_9fa48("78570");
    return stryMutAct_9fa48("78573") ? Number.isInteger(value) || value >= NUM.ZERO : stryMutAct_9fa48("78572") ? false : stryMutAct_9fa48("78571") ? true : (stryCov_9fa48("78571", "78572", "78573"), Number.isInteger(value) && (stryMutAct_9fa48("78576") ? value < NUM.ZERO : stryMutAct_9fa48("78575") ? value > NUM.ZERO : stryMutAct_9fa48("78574") ? true : (stryCov_9fa48("78574", "78575", "78576"), value >= NUM.ZERO)));
  }
}

/**
 * @param {*} value
 * @return {boolean}
 */
function isNonEmptyString(value) {
  if (stryMutAct_9fa48("78577")) {
    {}
  } else {
    stryCov_9fa48("78577");
    return stryMutAct_9fa48("78580") ? typeof value === TYPEOF.STRING || value.trim().length > NUM.ZERO : stryMutAct_9fa48("78579") ? false : stryMutAct_9fa48("78578") ? true : (stryCov_9fa48("78578", "78579", "78580"), (stryMutAct_9fa48("78582") ? typeof value !== TYPEOF.STRING : stryMutAct_9fa48("78581") ? true : (stryCov_9fa48("78581", "78582"), typeof value === TYPEOF.STRING)) && (stryMutAct_9fa48("78585") ? value.trim().length <= NUM.ZERO : stryMutAct_9fa48("78584") ? value.trim().length >= NUM.ZERO : stryMutAct_9fa48("78583") ? true : (stryCov_9fa48("78583", "78584", "78585"), (stryMutAct_9fa48("78586") ? value.length : (stryCov_9fa48("78586"), value.trim().length)) > NUM.ZERO)));
  }
}
export { VscodeDwarfParserBackend, validateDwarfModuleRequest, normalizeWasmBytesToArrayBuffer, normalizeSourceFiles, normalizeMappedLines };