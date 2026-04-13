/**
 * Runtime introspection for stack frames, locals, and memory.
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
import { NUM, TYPEOF } from '../constants/index.js';
import { lookupSourceForOffset, lookupSymbolsForOffset } from './dwarf-index-builder.js';
import { RUNTIME_INTROSPECTOR_DEFAULT as DEF, RUNTIME_INTROSPECTOR_ERROR_MSG as ERR } from './runtime-introspector-constants.js';

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
    if (stryMutAct_9fa48("77902")) {
      {}
    } else {
      stryCov_9fa48("77902");
      this._runtimeAdapter = stryMutAct_9fa48("77905") ? options.runtimeAdapter && null : stryMutAct_9fa48("77904") ? false : stryMutAct_9fa48("77903") ? true : (stryCov_9fa48("77903", "77904", "77905"), options.runtimeAdapter || null);
      this._lookupSourceForOffset = stryMutAct_9fa48("77908") ? options.lookupSourceForOffset && lookupSourceForOffset : stryMutAct_9fa48("77907") ? false : stryMutAct_9fa48("77906") ? true : (stryCov_9fa48("77906", "77907", "77908"), options.lookupSourceForOffset || lookupSourceForOffset);
      this._lookupSymbolsForOffset = stryMutAct_9fa48("77911") ? options.lookupSymbolsForOffset && lookupSymbolsForOffset : stryMutAct_9fa48("77910") ? false : stryMutAct_9fa48("77909") ? true : (stryCov_9fa48("77909", "77910", "77911"), options.lookupSymbolsForOffset || lookupSymbolsForOffset);
      this._maxMemoryReadBytes = stryMutAct_9fa48("77912") ? options.maxMemoryReadBytes && DEF.MAX_MEMORY_READ_BYTES : (stryCov_9fa48("77912"), options.maxMemoryReadBytes ?? DEF.MAX_MEMORY_READ_BYTES);
      this._maxVariablesPerScope = stryMutAct_9fa48("77913") ? options.maxVariablesPerScope && DEF.MAX_VARIABLES_PER_SCOPE : (stryCov_9fa48("77913"), options.maxVariablesPerScope ?? DEF.MAX_VARIABLES_PER_SCOPE);
      this._requestTimeoutMs = stryMutAct_9fa48("77914") ? options.requestTimeoutMs && DEF.REQUEST_TIMEOUT_MS : (stryCov_9fa48("77914"), options.requestTimeoutMs ?? DEF.REQUEST_TIMEOUT_MS);
      this._setTimeoutFn = stryMutAct_9fa48("77917") ? options.setTimeoutFn && setTimeout : stryMutAct_9fa48("77916") ? false : stryMutAct_9fa48("77915") ? true : (stryCov_9fa48("77915", "77916", "77917"), options.setTimeoutFn || setTimeout);
      this._clearTimeoutFn = stryMutAct_9fa48("77920") ? options.clearTimeoutFn && clearTimeout : stryMutAct_9fa48("77919") ? false : stryMutAct_9fa48("77918") ? true : (stryCov_9fa48("77918", "77919", "77920"), options.clearTimeoutFn || clearTimeout);
    }
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
    if (stryMutAct_9fa48("77921")) {
      {}
    } else {
      stryCov_9fa48("77921");
      validateBaseRequest(request);
      this._assertRuntimeAdapter();
      const inspectState = await this._inspectWithTimeout(request.instanceHandle);
      const rawFrames = normalizeFrames(inspectState);
      const frames = rawFrames.map((rawFrame, index) => {
        if (stryMutAct_9fa48("77922")) {
          {}
        } else {
          stryCov_9fa48("77922");
          const frameId = isNonNegativeInteger(rawFrame.frameId) ? rawFrame.frameId : index;
          const codeOffset = rawFrame.codeOffset;
          const source = this._lookupSourceForOffset(request.index, codeOffset);
          return stryMutAct_9fa48("77923") ? {} : (stryCov_9fa48("77923"), {
            frameId,
            codeOffset,
            source: source ? toSourceView(source) : null,
            symbols: this._lookupSymbolsForOffset(request.index, codeOffset)
          });
        }
      });
      return stryMutAct_9fa48("77924") ? {} : (stryCov_9fa48("77924"), {
        frames
      });
    }
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
    if (stryMutAct_9fa48("77925")) {
      {}
    } else {
      stryCov_9fa48("77925");
      validateBaseRequest(request);
      this._assertRuntimeAdapter();
      const frameId = stryMutAct_9fa48("77926") ? request.frameId && DEF.DEFAULT_FRAME_ID : (stryCov_9fa48("77926"), request.frameId ?? DEF.DEFAULT_FRAME_ID);
      if (stryMutAct_9fa48("77929") ? false : stryMutAct_9fa48("77928") ? true : stryMutAct_9fa48("77927") ? isNonNegativeInteger(frameId) : (stryCov_9fa48("77927", "77928", "77929"), !isNonNegativeInteger(frameId))) {
        if (stryMutAct_9fa48("77930")) {
          {}
        } else {
          stryCov_9fa48("77930");
          throw new Error(ERR.FRAME_ID_REQUIRED);
        }
      }
      const requestedLimit = stryMutAct_9fa48("77931") ? request.maxVariables && this._maxVariablesPerScope : (stryCov_9fa48("77931"), request.maxVariables ?? this._maxVariablesPerScope);
      if (stryMutAct_9fa48("77934") ? !isNonNegativeInteger(requestedLimit) && requestedLimit > this._maxVariablesPerScope : stryMutAct_9fa48("77933") ? false : stryMutAct_9fa48("77932") ? true : (stryCov_9fa48("77932", "77933", "77934"), (stryMutAct_9fa48("77935") ? isNonNegativeInteger(requestedLimit) : (stryCov_9fa48("77935"), !isNonNegativeInteger(requestedLimit))) || (stryMutAct_9fa48("77938") ? requestedLimit <= this._maxVariablesPerScope : stryMutAct_9fa48("77937") ? requestedLimit >= this._maxVariablesPerScope : stryMutAct_9fa48("77936") ? false : (stryCov_9fa48("77936", "77937", "77938"), requestedLimit > this._maxVariablesPerScope)))) {
        if (stryMutAct_9fa48("77939")) {
          {}
        } else {
          stryCov_9fa48("77939");
          throw new Error(ERR.VARIABLES_LIMIT_EXCEEDED);
        }
      }
      const inspectState = await this._inspectWithTimeout(request.instanceHandle);
      const frame = findFrameById(inspectState, frameId);
      const frameSource = frame ? this._lookupSourceForOffset(request.index, frame.codeOffset) : null;
      const locals = getRawLocalsForFrame(inspectState, frameId);
      const limitedLocals = stryMutAct_9fa48("77940") ? locals : (stryCov_9fa48("77940"), locals.slice(NUM.ZERO, requestedLimit));
      const variables = limitedLocals.map((local, index) => {
        if (stryMutAct_9fa48("77941")) {
          {}
        } else {
          stryCov_9fa48("77941");
          const variable = normalizeLocalVariable(local, index);
          const variableSource = isNonNegativeInteger(variable.codeOffset) ? this._lookupSourceForOffset(request.index, variable.codeOffset) : frameSource;
          return stryMutAct_9fa48("77942") ? {} : (stryCov_9fa48("77942"), {
            name: variable.name,
            value: variable.value,
            type: variable.type,
            source: variableSource ? toSourceView(variableSource) : null
          });
        }
      });
      return stryMutAct_9fa48("77943") ? {} : (stryCov_9fa48("77943"), {
        frameId,
        variables
      });
    }
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
    if (stryMutAct_9fa48("77944")) {
      {}
    } else {
      stryCov_9fa48("77944");
      validateMemoryRequest(request);
      this._assertRuntimeAdapter();
      if (stryMutAct_9fa48("77948") ? request.length <= this._maxMemoryReadBytes : stryMutAct_9fa48("77947") ? request.length >= this._maxMemoryReadBytes : stryMutAct_9fa48("77946") ? false : stryMutAct_9fa48("77945") ? true : (stryCov_9fa48("77945", "77946", "77947", "77948"), request.length > this._maxMemoryReadBytes)) {
        if (stryMutAct_9fa48("77949")) {
          {}
        } else {
          stryCov_9fa48("77949");
          throw new Error(ERR.MEMORY_READ_LIMIT_EXCEEDED);
        }
      }
      const inspectState = await this._inspectWithTimeout(request.instanceHandle);
      const memoryBytes = extractMemoryBytes(inspectState);
      if (stryMutAct_9fa48("77952") ? false : stryMutAct_9fa48("77951") ? true : stryMutAct_9fa48("77950") ? memoryBytes : (stryCov_9fa48("77950", "77951", "77952"), !memoryBytes)) {
        if (stryMutAct_9fa48("77953")) {
          {}
        } else {
          stryCov_9fa48("77953");
          throw new Error(ERR.MEMORY_UNAVAILABLE);
        }
      }
      if (stryMutAct_9fa48("77957") ? request.offset < memoryBytes.byteLength : stryMutAct_9fa48("77956") ? request.offset > memoryBytes.byteLength : stryMutAct_9fa48("77955") ? false : stryMutAct_9fa48("77954") ? true : (stryCov_9fa48("77954", "77955", "77956", "77957"), request.offset >= memoryBytes.byteLength)) {
        if (stryMutAct_9fa48("77958")) {
          {}
        } else {
          stryCov_9fa48("77958");
          return stryMutAct_9fa48("77959") ? {} : (stryCov_9fa48("77959"), {
            offset: request.offset,
            length: NUM.ZERO,
            bytes: new Uint8Array(NUM.ZERO)
          });
        }
      }
      const endOffset = stryMutAct_9fa48("77960") ? Math.max(request.offset + request.length, memoryBytes.byteLength) : (stryCov_9fa48("77960"), Math.min(stryMutAct_9fa48("77961") ? request.offset - request.length : (stryCov_9fa48("77961"), request.offset + request.length), memoryBytes.byteLength));
      const bytes = stryMutAct_9fa48("77962") ? memoryBytes : (stryCov_9fa48("77962"), memoryBytes.slice(request.offset, endOffset));
      return stryMutAct_9fa48("77963") ? {} : (stryCov_9fa48("77963"), {
        offset: request.offset,
        length: bytes.byteLength,
        bytes
      });
    }
  }

  /**
   * @param {Object} instanceHandle
   * @return {Promise<Object>}
   * @private
   */
  async _inspectWithTimeout(instanceHandle) {
    if (stryMutAct_9fa48("77964")) {
      {}
    } else {
      stryCov_9fa48("77964");
      let timeoutId;
      try {
        if (stryMutAct_9fa48("77965")) {
          {}
        } else {
          stryCov_9fa48("77965");
          return await Promise.race(stryMutAct_9fa48("77966") ? [] : (stryCov_9fa48("77966"), [this._runtimeAdapter.inspect(stryMutAct_9fa48("77967") ? {} : (stryCov_9fa48("77967"), {
            instanceHandle
          })), new Promise((_resolve, reject) => {
            if (stryMutAct_9fa48("77968")) {
              {}
            } else {
              stryCov_9fa48("77968");
              timeoutId = this._setTimeoutFn(() => {
                if (stryMutAct_9fa48("77969")) {
                  {}
                } else {
                  stryCov_9fa48("77969");
                  reject(new Error(ERR.INSPECT_TIMEOUT));
                }
              }, this._requestTimeoutMs);
            }
          })]));
        }
      } finally {
        if (stryMutAct_9fa48("77970")) {
          {}
        } else {
          stryCov_9fa48("77970");
          if (stryMutAct_9fa48("77973") ? timeoutId === undefined : stryMutAct_9fa48("77972") ? false : stryMutAct_9fa48("77971") ? true : (stryCov_9fa48("77971", "77972", "77973"), timeoutId !== undefined)) {
            if (stryMutAct_9fa48("77974")) {
              {}
            } else {
              stryCov_9fa48("77974");
              this._clearTimeoutFn(timeoutId);
            }
          }
        }
      }
    }
  }

  /**
   * @private
   */
  _assertRuntimeAdapter() {
    if (stryMutAct_9fa48("77975")) {
      {}
    } else {
      stryCov_9fa48("77975");
      if (stryMutAct_9fa48("77978") ? !this._runtimeAdapter && typeof this._runtimeAdapter.inspect !== TYPEOF.FUNCTION : stryMutAct_9fa48("77977") ? false : stryMutAct_9fa48("77976") ? true : (stryCov_9fa48("77976", "77977", "77978"), (stryMutAct_9fa48("77979") ? this._runtimeAdapter : (stryCov_9fa48("77979"), !this._runtimeAdapter)) || (stryMutAct_9fa48("77981") ? typeof this._runtimeAdapter.inspect === TYPEOF.FUNCTION : stryMutAct_9fa48("77980") ? false : (stryCov_9fa48("77980", "77981"), typeof this._runtimeAdapter.inspect !== TYPEOF.FUNCTION)))) {
        if (stryMutAct_9fa48("77982")) {
          {}
        } else {
          stryCov_9fa48("77982");
          throw new Error(ERR.RUNTIME_ADAPTER_REQUIRED);
        }
      }
    }
  }
}

/**
 * @param {Object} request
 */
function validateBaseRequest(request) {
  if (stryMutAct_9fa48("77983")) {
    {}
  } else {
    stryCov_9fa48("77983");
    if (stryMutAct_9fa48("77986") ? !request && typeof request !== TYPEOF.OBJECT : stryMutAct_9fa48("77985") ? false : stryMutAct_9fa48("77984") ? true : (stryCov_9fa48("77984", "77985", "77986"), (stryMutAct_9fa48("77987") ? request : (stryCov_9fa48("77987"), !request)) || (stryMutAct_9fa48("77989") ? typeof request === TYPEOF.OBJECT : stryMutAct_9fa48("77988") ? false : (stryCov_9fa48("77988", "77989"), typeof request !== TYPEOF.OBJECT)))) {
      if (stryMutAct_9fa48("77990")) {
        {}
      } else {
        stryCov_9fa48("77990");
        throw new Error(ERR.REQUEST_REQUIRED);
      }
    }
    if (stryMutAct_9fa48("77993") ? !request.instanceHandle && typeof request.instanceHandle !== TYPEOF.OBJECT : stryMutAct_9fa48("77992") ? false : stryMutAct_9fa48("77991") ? true : (stryCov_9fa48("77991", "77992", "77993"), (stryMutAct_9fa48("77994") ? request.instanceHandle : (stryCov_9fa48("77994"), !request.instanceHandle)) || (stryMutAct_9fa48("77996") ? typeof request.instanceHandle === TYPEOF.OBJECT : stryMutAct_9fa48("77995") ? false : (stryCov_9fa48("77995", "77996"), typeof request.instanceHandle !== TYPEOF.OBJECT)))) {
      if (stryMutAct_9fa48("77997")) {
        {}
      } else {
        stryCov_9fa48("77997");
        throw new Error(ERR.INSTANCE_HANDLE_REQUIRED);
      }
    }
    if (stryMutAct_9fa48("78000") ? !request.index && typeof request.index !== TYPEOF.OBJECT : stryMutAct_9fa48("77999") ? false : stryMutAct_9fa48("77998") ? true : (stryCov_9fa48("77998", "77999", "78000"), (stryMutAct_9fa48("78001") ? request.index : (stryCov_9fa48("78001"), !request.index)) || (stryMutAct_9fa48("78003") ? typeof request.index === TYPEOF.OBJECT : stryMutAct_9fa48("78002") ? false : (stryCov_9fa48("78002", "78003"), typeof request.index !== TYPEOF.OBJECT)))) {
      if (stryMutAct_9fa48("78004")) {
        {}
      } else {
        stryCov_9fa48("78004");
        throw new Error(ERR.INDEX_REQUIRED);
      }
    }
  }
}

/**
 * @param {Object} request
 */
function validateMemoryRequest(request) {
  if (stryMutAct_9fa48("78005")) {
    {}
  } else {
    stryCov_9fa48("78005");
    validateBaseRequest(request);
    if (stryMutAct_9fa48("78008") ? false : stryMutAct_9fa48("78007") ? true : stryMutAct_9fa48("78006") ? isNonNegativeInteger(request.offset) : (stryCov_9fa48("78006", "78007", "78008"), !isNonNegativeInteger(request.offset))) {
      if (stryMutAct_9fa48("78009")) {
        {}
      } else {
        stryCov_9fa48("78009");
        throw new Error(ERR.OFFSET_REQUIRED);
      }
    }
    if (stryMutAct_9fa48("78012") ? false : stryMutAct_9fa48("78011") ? true : stryMutAct_9fa48("78010") ? isNonNegativeInteger(request.length) : (stryCov_9fa48("78010", "78011", "78012"), !isNonNegativeInteger(request.length))) {
      if (stryMutAct_9fa48("78013")) {
        {}
      } else {
        stryCov_9fa48("78013");
        throw new Error(ERR.LENGTH_REQUIRED);
      }
    }
  }
}

/**
 * @param {Object} inspectState
 * @return {Array<Object>}
 */
function normalizeFrames(inspectState) {
  if (stryMutAct_9fa48("78014")) {
    {}
  } else {
    stryCov_9fa48("78014");
    const rawFrames = stryMutAct_9fa48("78015") ? inspectState.stackFrames : (stryCov_9fa48("78015"), inspectState?.stackFrames);
    if (stryMutAct_9fa48("78018") ? Array.isArray(rawFrames) || rawFrames.length > NUM.ZERO : stryMutAct_9fa48("78017") ? false : stryMutAct_9fa48("78016") ? true : (stryCov_9fa48("78016", "78017", "78018"), Array.isArray(rawFrames) && (stryMutAct_9fa48("78021") ? rawFrames.length <= NUM.ZERO : stryMutAct_9fa48("78020") ? rawFrames.length >= NUM.ZERO : stryMutAct_9fa48("78019") ? true : (stryCov_9fa48("78019", "78020", "78021"), rawFrames.length > NUM.ZERO)))) {
      if (stryMutAct_9fa48("78022")) {
        {}
      } else {
        stryCov_9fa48("78022");
        return stryMutAct_9fa48("78023") ? rawFrames.map((frame, index) => ({
          frameId: isNonNegativeInteger(frame.frameId) ? frame.frameId : index,
          codeOffset: frame.codeOffset
        })) : (stryCov_9fa48("78023"), rawFrames.filter(stryMutAct_9fa48("78024") ? () => undefined : (stryCov_9fa48("78024"), frame => isNonNegativeInteger(stryMutAct_9fa48("78025") ? frame.codeOffset : (stryCov_9fa48("78025"), frame?.codeOffset)))).map(stryMutAct_9fa48("78026") ? () => undefined : (stryCov_9fa48("78026"), (frame, index) => stryMutAct_9fa48("78027") ? {} : (stryCov_9fa48("78027"), {
          frameId: isNonNegativeInteger(frame.frameId) ? frame.frameId : index,
          codeOffset: frame.codeOffset
        }))));
      }
    }
    if (stryMutAct_9fa48("78029") ? false : stryMutAct_9fa48("78028") ? true : (stryCov_9fa48("78028", "78029"), isNonNegativeInteger(stryMutAct_9fa48("78030") ? inspectState.codeOffset : (stryCov_9fa48("78030"), inspectState?.codeOffset)))) {
      if (stryMutAct_9fa48("78031")) {
        {}
      } else {
        stryCov_9fa48("78031");
        return stryMutAct_9fa48("78032") ? [] : (stryCov_9fa48("78032"), [stryMutAct_9fa48("78033") ? {} : (stryCov_9fa48("78033"), {
          frameId: DEF.DEFAULT_FRAME_ID,
          codeOffset: inspectState.codeOffset
        })]);
      }
    }
    return stryMutAct_9fa48("78034") ? ["Stryker was here"] : (stryCov_9fa48("78034"), []);
  }
}

/**
 * @param {Object} inspectState
 * @param {number} frameId
 * @return {Object|null}
 */
function findFrameById(inspectState, frameId) {
  if (stryMutAct_9fa48("78035")) {
    {}
  } else {
    stryCov_9fa48("78035");
    const frames = normalizeFrames(inspectState);
    for (const frame of frames) {
      if (stryMutAct_9fa48("78036")) {
        {}
      } else {
        stryCov_9fa48("78036");
        if (stryMutAct_9fa48("78039") ? frame.frameId !== frameId : stryMutAct_9fa48("78038") ? false : stryMutAct_9fa48("78037") ? true : (stryCov_9fa48("78037", "78038", "78039"), frame.frameId === frameId)) {
          if (stryMutAct_9fa48("78040")) {
            {}
          } else {
            stryCov_9fa48("78040");
            return frame;
          }
        }
      }
    }
    return null;
  }
}

/**
 * @param {Object} inspectState
 * @param {number} frameId
 * @return {Array<Object>}
 */
function getRawLocalsForFrame(inspectState, frameId) {
  if (stryMutAct_9fa48("78041")) {
    {}
  } else {
    stryCov_9fa48("78041");
    const localsByFrame = stryMutAct_9fa48("78042") ? inspectState.localsByFrame : (stryCov_9fa48("78042"), inspectState?.localsByFrame);
    if (stryMutAct_9fa48("78045") ? localsByFrame && typeof localsByFrame === TYPEOF.OBJECT || Array.isArray(localsByFrame[frameId]) : stryMutAct_9fa48("78044") ? false : stryMutAct_9fa48("78043") ? true : (stryCov_9fa48("78043", "78044", "78045"), (stryMutAct_9fa48("78047") ? localsByFrame || typeof localsByFrame === TYPEOF.OBJECT : stryMutAct_9fa48("78046") ? true : (stryCov_9fa48("78046", "78047"), localsByFrame && (stryMutAct_9fa48("78049") ? typeof localsByFrame !== TYPEOF.OBJECT : stryMutAct_9fa48("78048") ? true : (stryCov_9fa48("78048", "78049"), typeof localsByFrame === TYPEOF.OBJECT)))) && Array.isArray(localsByFrame[frameId]))) {
      if (stryMutAct_9fa48("78050")) {
        {}
      } else {
        stryCov_9fa48("78050");
        return localsByFrame[frameId];
      }
    }
    if (stryMutAct_9fa48("78053") ? frameId === DEF.DEFAULT_FRAME_ID || Array.isArray(inspectState?.locals) : stryMutAct_9fa48("78052") ? false : stryMutAct_9fa48("78051") ? true : (stryCov_9fa48("78051", "78052", "78053"), (stryMutAct_9fa48("78055") ? frameId !== DEF.DEFAULT_FRAME_ID : stryMutAct_9fa48("78054") ? true : (stryCov_9fa48("78054", "78055"), frameId === DEF.DEFAULT_FRAME_ID)) && Array.isArray(stryMutAct_9fa48("78056") ? inspectState.locals : (stryCov_9fa48("78056"), inspectState?.locals)))) {
      if (stryMutAct_9fa48("78057")) {
        {}
      } else {
        stryCov_9fa48("78057");
        return inspectState.locals;
      }
    }
    return stryMutAct_9fa48("78058") ? ["Stryker was here"] : (stryCov_9fa48("78058"), []);
  }
}

/**
 * @param {*} local
 * @param {number} index
 * @return {Object}
 */
function normalizeLocalVariable(local, index) {
  if (stryMutAct_9fa48("78059")) {
    {}
  } else {
    stryCov_9fa48("78059");
    if (stryMutAct_9fa48("78062") ? local || typeof local === TYPEOF.OBJECT : stryMutAct_9fa48("78061") ? false : stryMutAct_9fa48("78060") ? true : (stryCov_9fa48("78060", "78061", "78062"), local && (stryMutAct_9fa48("78064") ? typeof local !== TYPEOF.OBJECT : stryMutAct_9fa48("78063") ? true : (stryCov_9fa48("78063", "78064"), typeof local === TYPEOF.OBJECT)))) {
      if (stryMutAct_9fa48("78065")) {
        {}
      } else {
        stryCov_9fa48("78065");
        return stryMutAct_9fa48("78066") ? {} : (stryCov_9fa48("78066"), {
          name: isNonEmptyString(local.name) ? local.name : stryMutAct_9fa48("78067") ? `` : (stryCov_9fa48("78067"), `local_${index}`),
          value: local.value,
          type: isNonEmptyString(local.type) ? local.type : typeof local.value,
          codeOffset: local.codeOffset
        });
      }
    }
    return stryMutAct_9fa48("78068") ? {} : (stryCov_9fa48("78068"), {
      name: stryMutAct_9fa48("78069") ? `` : (stryCov_9fa48("78069"), `local_${index}`),
      value: local,
      type: typeof local,
      codeOffset: null
    });
  }
}

/**
 * @param {Object} inspectState
 * @return {Uint8Array|null}
 */
function extractMemoryBytes(inspectState) {
  if (stryMutAct_9fa48("78070")) {
    {}
  } else {
    stryCov_9fa48("78070");
    const memory = stryMutAct_9fa48("78071") ? (inspectState?.memory ?? inspectState?.linearMemory) && null : (stryCov_9fa48("78071"), (stryMutAct_9fa48("78072") ? inspectState?.memory && inspectState?.linearMemory : (stryCov_9fa48("78072"), (stryMutAct_9fa48("78073") ? inspectState.memory : (stryCov_9fa48("78073"), inspectState?.memory)) ?? (stryMutAct_9fa48("78074") ? inspectState.linearMemory : (stryCov_9fa48("78074"), inspectState?.linearMemory)))) ?? null);
    if (stryMutAct_9fa48("78076") ? false : stryMutAct_9fa48("78075") ? true : (stryCov_9fa48("78075", "78076"), Buffer.isBuffer(memory))) {
      if (stryMutAct_9fa48("78077")) {
        {}
      } else {
        stryCov_9fa48("78077");
        return new Uint8Array(stryMutAct_9fa48("78078") ? memory.buffer : (stryCov_9fa48("78078"), memory.buffer.slice(memory.byteOffset, stryMutAct_9fa48("78079") ? memory.byteOffset - memory.byteLength : (stryCov_9fa48("78079"), memory.byteOffset + memory.byteLength))));
      }
    }
    if (stryMutAct_9fa48("78081") ? false : stryMutAct_9fa48("78080") ? true : (stryCov_9fa48("78080", "78081"), memory instanceof Uint8Array)) {
      if (stryMutAct_9fa48("78082")) {
        {}
      } else {
        stryCov_9fa48("78082");
        return new Uint8Array(stryMutAct_9fa48("78083") ? memory.buffer : (stryCov_9fa48("78083"), memory.buffer.slice(memory.byteOffset, stryMutAct_9fa48("78084") ? memory.byteOffset - memory.byteLength : (stryCov_9fa48("78084"), memory.byteOffset + memory.byteLength))));
      }
    }
    if (stryMutAct_9fa48("78086") ? false : stryMutAct_9fa48("78085") ? true : (stryCov_9fa48("78085", "78086"), memory instanceof ArrayBuffer)) {
      if (stryMutAct_9fa48("78087")) {
        {}
      } else {
        stryCov_9fa48("78087");
        return new Uint8Array(stryMutAct_9fa48("78088") ? memory : (stryCov_9fa48("78088"), memory.slice(NUM.ZERO)));
      }
    }
    return null;
  }
}

/**
 * @param {Object} source
 * @return {{sourceFileUrl: string, lineNumber: number, columnNumber: number}}
 */
function toSourceView(source) {
  if (stryMutAct_9fa48("78089")) {
    {}
  } else {
    stryCov_9fa48("78089");
    return stryMutAct_9fa48("78090") ? {} : (stryCov_9fa48("78090"), {
      sourceFileUrl: source.sourceFileUrl,
      lineNumber: source.lineNumber,
      columnNumber: source.columnNumber
    });
  }
}

/**
 * @param {*} value
 * @return {boolean}
 */
function isNonNegativeInteger(value) {
  if (stryMutAct_9fa48("78091")) {
    {}
  } else {
    stryCov_9fa48("78091");
    return stryMutAct_9fa48("78094") ? Number.isInteger(value) || value >= NUM.ZERO : stryMutAct_9fa48("78093") ? false : stryMutAct_9fa48("78092") ? true : (stryCov_9fa48("78092", "78093", "78094"), Number.isInteger(value) && (stryMutAct_9fa48("78097") ? value < NUM.ZERO : stryMutAct_9fa48("78096") ? value > NUM.ZERO : stryMutAct_9fa48("78095") ? true : (stryCov_9fa48("78095", "78096", "78097"), value >= NUM.ZERO)));
  }
}

/**
 * @param {*} value
 * @return {boolean}
 */
function isNonEmptyString(value) {
  if (stryMutAct_9fa48("78098")) {
    {}
  } else {
    stryCov_9fa48("78098");
    return stryMutAct_9fa48("78101") ? typeof value === TYPEOF.STRING || value.trim().length > NUM.ZERO : stryMutAct_9fa48("78100") ? false : stryMutAct_9fa48("78099") ? true : (stryCov_9fa48("78099", "78100", "78101"), (stryMutAct_9fa48("78103") ? typeof value !== TYPEOF.STRING : stryMutAct_9fa48("78102") ? true : (stryCov_9fa48("78102", "78103"), typeof value === TYPEOF.STRING)) && (stryMutAct_9fa48("78106") ? value.trim().length <= NUM.ZERO : stryMutAct_9fa48("78105") ? value.trim().length >= NUM.ZERO : stryMutAct_9fa48("78104") ? true : (stryCov_9fa48("78104", "78105", "78106"), (stryMutAct_9fa48("78107") ? value.length : (stryCov_9fa48("78107"), value.trim().length)) > NUM.ZERO)));
  }
}
export { RuntimeIntrospector };