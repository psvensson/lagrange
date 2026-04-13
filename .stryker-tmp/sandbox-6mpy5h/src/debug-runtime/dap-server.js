/**
 * DAP server with protocol framing and debug-runtime integration.
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
import { DAP_MESSAGE_TYPE as MT, DAP_COMMAND as CMD, DAP_EVENT, DAP_DEFAULT as DEF, DAP_ERROR_MSG as ERR } from './dap-constants.js';

/**
 * Encode one DAP payload into framed wire format.
 *
 * @param {Object} message - DAP message object.
 * @return {string} Framed payload string.
 */
function encodeDapProtocolMessage(message) {
  if (stryMutAct_9fa48("75941")) {
    {}
  } else {
    stryCov_9fa48("75941");
    const payload = JSON.stringify(message);
    const contentLength = Buffer.byteLength(payload, stryMutAct_9fa48("75942") ? "" : (stryCov_9fa48("75942"), 'utf8'));
    return (stryMutAct_9fa48("75943") ? `` : (stryCov_9fa48("75943"), `${DEF.CONTENT_LENGTH_HEADER}: ${contentLength}`)) + (stryMutAct_9fa48("75944") ? `` : (stryCov_9fa48("75944"), `${DEF.LINE_SEPARATOR}${DEF.LINE_SEPARATOR}${payload}`));
  }
}

/**
 * Framing helper for DAP Content-Length payloads.
 */
class DapMessageFramer {
  constructor() {
    if (stryMutAct_9fa48("75945")) {
      {}
    } else {
      stryCov_9fa48("75945");
      this._buffer = stryMutAct_9fa48("75946") ? "Stryker was here!" : (stryCov_9fa48("75946"), '');
    }
  }

  /**
   * Push raw data and parse complete messages.
   *
   * @param {string|Buffer|Uint8Array} chunk - Raw transport bytes.
   * @return {Array<Object>} Parsed DAP messages.
   */
  push(chunk) {
    if (stryMutAct_9fa48("75947")) {
      {}
    } else {
      stryCov_9fa48("75947");
      const chunkText = normalizeChunkToString(chunk);
      stryMutAct_9fa48("75948") ? this._buffer -= chunkText : (stryCov_9fa48("75948"), this._buffer += chunkText);
      const messages = stryMutAct_9fa48("75949") ? ["Stryker was here"] : (stryCov_9fa48("75949"), []);
      while (stryMutAct_9fa48("75951") ? false : stryMutAct_9fa48("75950") ? false : (stryCov_9fa48("75950", "75951"), true)) {
        if (stryMutAct_9fa48("75952")) {
          {}
        } else {
          stryCov_9fa48("75952");
          const headerEndIndex = this._buffer.indexOf(DEF.HEADER_SEPARATOR);
          if (stryMutAct_9fa48("75956") ? headerEndIndex >= NUM.ZERO : stryMutAct_9fa48("75955") ? headerEndIndex <= NUM.ZERO : stryMutAct_9fa48("75954") ? false : stryMutAct_9fa48("75953") ? true : (stryCov_9fa48("75953", "75954", "75955", "75956"), headerEndIndex < NUM.ZERO)) {
            if (stryMutAct_9fa48("75957")) {
              {}
            } else {
              stryCov_9fa48("75957");
              break;
            }
          }
          const headerText = stryMutAct_9fa48("75958") ? this._buffer : (stryCov_9fa48("75958"), this._buffer.slice(NUM.ZERO, headerEndIndex));
          const contentLength = parseContentLength(headerText);
          if (stryMutAct_9fa48("75961") ? !Number.isInteger(contentLength) && contentLength < NUM.ZERO : stryMutAct_9fa48("75960") ? false : stryMutAct_9fa48("75959") ? true : (stryCov_9fa48("75959", "75960", "75961"), (stryMutAct_9fa48("75962") ? Number.isInteger(contentLength) : (stryCov_9fa48("75962"), !Number.isInteger(contentLength))) || (stryMutAct_9fa48("75965") ? contentLength >= NUM.ZERO : stryMutAct_9fa48("75964") ? contentLength <= NUM.ZERO : stryMutAct_9fa48("75963") ? false : (stryCov_9fa48("75963", "75964", "75965"), contentLength < NUM.ZERO)))) {
            if (stryMutAct_9fa48("75966")) {
              {}
            } else {
              stryCov_9fa48("75966");
              throw new Error(ERR.CONTENT_LENGTH_INVALID);
            }
          }
          const payloadStart = stryMutAct_9fa48("75967") ? headerEndIndex - DEF.HEADER_SEPARATOR.length : (stryCov_9fa48("75967"), headerEndIndex + DEF.HEADER_SEPARATOR.length);
          const payloadEnd = stryMutAct_9fa48("75968") ? payloadStart - contentLength : (stryCov_9fa48("75968"), payloadStart + contentLength);
          if (stryMutAct_9fa48("75972") ? this._buffer.length >= payloadEnd : stryMutAct_9fa48("75971") ? this._buffer.length <= payloadEnd : stryMutAct_9fa48("75970") ? false : stryMutAct_9fa48("75969") ? true : (stryCov_9fa48("75969", "75970", "75971", "75972"), this._buffer.length < payloadEnd)) {
            if (stryMutAct_9fa48("75973")) {
              {}
            } else {
              stryCov_9fa48("75973");
              break;
            }
          }
          const payload = stryMutAct_9fa48("75974") ? this._buffer : (stryCov_9fa48("75974"), this._buffer.slice(payloadStart, payloadEnd));
          let parsedPayload;
          try {
            if (stryMutAct_9fa48("75975")) {
              {}
            } else {
              stryCov_9fa48("75975");
              parsedPayload = JSON.parse(payload);
            }
          } catch (_err) {
            if (stryMutAct_9fa48("75976")) {
              {}
            } else {
              stryCov_9fa48("75976");
              throw new Error(ERR.PAYLOAD_INVALID);
            }
          }
          messages.push(parsedPayload);
          this._buffer = stryMutAct_9fa48("75977") ? this._buffer : (stryCov_9fa48("75977"), this._buffer.slice(payloadEnd));
        }
      }
      return messages;
    }
  }
}

/**
 * DAP server that routes protocol requests to debug-runtime managers.
 */
class DapServer {
  /**
   * @param {Object} options
   * @param {Object} options.breakpointManager
   * @param {Object} options.runtimeIntrospector
   * @param {Function} options.sendMessage - Transport sender.
   * @param {Object} [options.context] - Initial session context.
   */
  constructor(options = {}) {
    if (stryMutAct_9fa48("75978")) {
      {}
    } else {
      stryCov_9fa48("75978");
      if (stryMutAct_9fa48("75981") ? !options.breakpointManager && typeof options.breakpointManager !== TYPEOF.OBJECT : stryMutAct_9fa48("75980") ? false : stryMutAct_9fa48("75979") ? true : (stryCov_9fa48("75979", "75980", "75981"), (stryMutAct_9fa48("75982") ? options.breakpointManager : (stryCov_9fa48("75982"), !options.breakpointManager)) || (stryMutAct_9fa48("75984") ? typeof options.breakpointManager === TYPEOF.OBJECT : stryMutAct_9fa48("75983") ? false : (stryCov_9fa48("75983", "75984"), typeof options.breakpointManager !== TYPEOF.OBJECT)))) {
        if (stryMutAct_9fa48("75985")) {
          {}
        } else {
          stryCov_9fa48("75985");
          throw new Error(ERR.BREAKPOINT_MANAGER_REQUIRED);
        }
      }
      if (stryMutAct_9fa48("75988") ? !options.runtimeIntrospector && typeof options.runtimeIntrospector !== TYPEOF.OBJECT : stryMutAct_9fa48("75987") ? false : stryMutAct_9fa48("75986") ? true : (stryCov_9fa48("75986", "75987", "75988"), (stryMutAct_9fa48("75989") ? options.runtimeIntrospector : (stryCov_9fa48("75989"), !options.runtimeIntrospector)) || (stryMutAct_9fa48("75991") ? typeof options.runtimeIntrospector === TYPEOF.OBJECT : stryMutAct_9fa48("75990") ? false : (stryCov_9fa48("75990", "75991"), typeof options.runtimeIntrospector !== TYPEOF.OBJECT)))) {
        if (stryMutAct_9fa48("75992")) {
          {}
        } else {
          stryCov_9fa48("75992");
          throw new Error(ERR.RUNTIME_INTROSPECTOR_REQUIRED);
        }
      }
      if (stryMutAct_9fa48("75995") ? typeof options.sendMessage === TYPEOF.FUNCTION : stryMutAct_9fa48("75994") ? false : stryMutAct_9fa48("75993") ? true : (stryCov_9fa48("75993", "75994", "75995"), typeof options.sendMessage !== TYPEOF.FUNCTION)) {
        if (stryMutAct_9fa48("75996")) {
          {}
        } else {
          stryCov_9fa48("75996");
          throw new Error(ERR.SEND_MESSAGE_REQUIRED);
        }
      }
      this._breakpointManager = options.breakpointManager;
      this._runtimeIntrospector = options.runtimeIntrospector;
      this._sendMessage = options.sendMessage;
      this._framer = new DapMessageFramer();
      this._initialized = stryMutAct_9fa48("75997") ? true : (stryCov_9fa48("75997"), false);
      this._launched = stryMutAct_9fa48("75998") ? true : (stryCov_9fa48("75998"), false);
      this._attached = stryMutAct_9fa48("75999") ? true : (stryCov_9fa48("75999"), false);
      this._nextSeq = NUM.ONE;
      this._nextVariableReference = NUM.ONE;
      this._variablesByReference = new Map();
      this._context = stryMutAct_9fa48("76000") ? {} : (stryCov_9fa48("76000"), {
        sessionId: null,
        moduleRef: null,
        instanceHandle: null,
        index: null,
        ...(stryMutAct_9fa48("76003") ? options.context && {} : stryMutAct_9fa48("76002") ? false : stryMutAct_9fa48("76001") ? true : (stryCov_9fa48("76001", "76002", "76003"), options.context || {}))
      });
    }
  }

  /**
   * Receive transport bytes, parse requests, and emit responses/events.
   *
   * @param {string|Buffer|Uint8Array} chunk
   * @return {Promise<Array<Object>>} Response payloads.
   */
  async receiveData(chunk) {
    if (stryMutAct_9fa48("76004")) {
      {}
    } else {
      stryCov_9fa48("76004");
      const messages = this._framer.push(chunk);
      const responses = stryMutAct_9fa48("76005") ? ["Stryker was here"] : (stryCov_9fa48("76005"), []);
      for (const message of messages) {
        if (stryMutAct_9fa48("76006")) {
          {}
        } else {
          stryCov_9fa48("76006");
          const response = await this.handleProtocolMessage(message);
          if (stryMutAct_9fa48("76008") ? false : stryMutAct_9fa48("76007") ? true : (stryCov_9fa48("76007", "76008"), response)) {
            if (stryMutAct_9fa48("76009")) {
              {}
            } else {
              stryCov_9fa48("76009");
              responses.push(response);
            }
          }
        }
      }
      return responses;
    }
  }

  /**
   * Handle one parsed DAP protocol message.
   *
   * @param {Object} message - Parsed protocol message.
   * @return {Promise<Object|null>} Response payload.
   */
  async handleProtocolMessage(message) {
    if (stryMutAct_9fa48("76010")) {
      {}
    } else {
      stryCov_9fa48("76010");
      if (stryMutAct_9fa48("76013") ? !message && typeof message !== TYPEOF.OBJECT : stryMutAct_9fa48("76012") ? false : stryMutAct_9fa48("76011") ? true : (stryCov_9fa48("76011", "76012", "76013"), (stryMutAct_9fa48("76014") ? message : (stryCov_9fa48("76014"), !message)) || (stryMutAct_9fa48("76016") ? typeof message === TYPEOF.OBJECT : stryMutAct_9fa48("76015") ? false : (stryCov_9fa48("76015", "76016"), typeof message !== TYPEOF.OBJECT)))) {
        if (stryMutAct_9fa48("76017")) {
          {}
        } else {
          stryCov_9fa48("76017");
          throw new Error(ERR.MESSAGE_REQUIRED);
        }
      }
      if (stryMutAct_9fa48("76020") ? message.type === MT.REQUEST : stryMutAct_9fa48("76019") ? false : stryMutAct_9fa48("76018") ? true : (stryCov_9fa48("76018", "76019", "76020"), message.type !== MT.REQUEST)) {
        if (stryMutAct_9fa48("76021")) {
          {}
        } else {
          stryCov_9fa48("76021");
          return null;
        }
      }
      return await this.handleRequest(message);
    }
  }

  /**
   * Handle one DAP request and emit its response.
   *
   * @param {Object} request - DAP request.
   * @return {Promise<Object>} DAP response payload.
   */
  async handleRequest(request) {
    if (stryMutAct_9fa48("76022")) {
      {}
    } else {
      stryCov_9fa48("76022");
      if (stryMutAct_9fa48("76025") ? !request && typeof request !== TYPEOF.OBJECT : stryMutAct_9fa48("76024") ? false : stryMutAct_9fa48("76023") ? true : (stryCov_9fa48("76023", "76024", "76025"), (stryMutAct_9fa48("76026") ? request : (stryCov_9fa48("76026"), !request)) || (stryMutAct_9fa48("76028") ? typeof request === TYPEOF.OBJECT : stryMutAct_9fa48("76027") ? false : (stryCov_9fa48("76027", "76028"), typeof request !== TYPEOF.OBJECT)))) {
        if (stryMutAct_9fa48("76029")) {
          {}
        } else {
          stryCov_9fa48("76029");
          throw new Error(ERR.REQUEST_REQUIRED);
        }
      }
      try {
        if (stryMutAct_9fa48("76030")) {
          {}
        } else {
          stryCov_9fa48("76030");
          const body = await this._dispatchCommand(request);
          const response = buildResponse(stryMutAct_9fa48("76031") ? this._nextSeq-- : (stryCov_9fa48("76031"), this._nextSeq++), request, stryMutAct_9fa48("76032") ? false : (stryCov_9fa48("76032"), true), body);
          this._emitProtocolMessage(response);
          return response;
        }
      } catch (err) {
        if (stryMutAct_9fa48("76033")) {
          {}
        } else {
          stryCov_9fa48("76033");
          const response = buildResponse(stryMutAct_9fa48("76034") ? this._nextSeq-- : (stryCov_9fa48("76034"), this._nextSeq++), request, stryMutAct_9fa48("76035") ? true : (stryCov_9fa48("76035"), false), null, stryMutAct_9fa48("76038") ? err.message && String(err) : stryMutAct_9fa48("76037") ? false : stryMutAct_9fa48("76036") ? true : (stryCov_9fa48("76036", "76037", "76038"), err.message || String(err)));
          this._emitProtocolMessage(response);
          return response;
        }
      }
    }
  }

  /**
   * Publish a pause notification as DAP stopped event.
   *
   * @param {Object} request - Pause request.
   * @param {number} request.codeOffset - Current code offset.
   * @param {string} [request.moduleRef] - Optional module override.
   */
  notifyPaused(request) {
    if (stryMutAct_9fa48("76039")) {
      {}
    } else {
      stryCov_9fa48("76039");
      const moduleRef = stryMutAct_9fa48("76042") ? request.moduleRef && this._context.moduleRef : stryMutAct_9fa48("76041") ? false : stryMutAct_9fa48("76040") ? true : (stryCov_9fa48("76040", "76041", "76042"), request.moduleRef || this._context.moduleRef);
      const pause = this._breakpointManager.handlePause(stryMutAct_9fa48("76043") ? {} : (stryCov_9fa48("76043"), {
        sessionId: this._context.sessionId,
        moduleRef,
        codeOffset: request.codeOffset
      }));
      const event = buildEvent(stryMutAct_9fa48("76044") ? this._nextSeq-- : (stryCov_9fa48("76044"), this._nextSeq++), DAP_EVENT.STOPPED, stryMutAct_9fa48("76045") ? {} : (stryCov_9fa48("76045"), {
        reason: pause.reason,
        threadId: DEF.THREAD_ID,
        allThreadsStopped: stryMutAct_9fa48("76046") ? false : (stryCov_9fa48("76046"), true)
      }));
      this._emitProtocolMessage(event);
    }
  }

  /**
   * Publish a continued event.
   */
  notifyContinued() {
    if (stryMutAct_9fa48("76047")) {
      {}
    } else {
      stryCov_9fa48("76047");
      const event = buildEvent(stryMutAct_9fa48("76048") ? this._nextSeq-- : (stryCov_9fa48("76048"), this._nextSeq++), DAP_EVENT.CONTINUED, stryMutAct_9fa48("76049") ? {} : (stryCov_9fa48("76049"), {
        threadId: DEF.THREAD_ID,
        allThreadsContinued: stryMutAct_9fa48("76050") ? false : (stryCov_9fa48("76050"), true)
      }));
      this._emitProtocolMessage(event);
    }
  }

  /**
   * @param {Object} request
   * @return {Promise<Object>}
   * @private
   */
  async _dispatchCommand(request) {
    if (stryMutAct_9fa48("76051")) {
      {}
    } else {
      stryCov_9fa48("76051");
      const command = request.command;
      switch (command) {
        case CMD.INITIALIZE:
          if (stryMutAct_9fa48("76052")) {} else {
            stryCov_9fa48("76052");
            this._initialized = stryMutAct_9fa48("76053") ? false : (stryCov_9fa48("76053"), true);
            this._emitProtocolMessage(buildEvent(stryMutAct_9fa48("76054") ? this._nextSeq-- : (stryCov_9fa48("76054"), this._nextSeq++), DAP_EVENT.INITIALIZED, {}));
            return stryMutAct_9fa48("76055") ? {} : (stryCov_9fa48("76055"), {
              supportsConfigurationDoneRequest: stryMutAct_9fa48("76056") ? true : (stryCov_9fa48("76056"), false),
              supportsSetVariable: stryMutAct_9fa48("76057") ? true : (stryCov_9fa48("76057"), false)
            });
          }
        case CMD.LAUNCH:
        case CMD.ATTACH:
          if (stryMutAct_9fa48("76058")) {} else {
            stryCov_9fa48("76058");
            this._assertInitialized();
            this._setContextFromArgs(stryMutAct_9fa48("76061") ? request.arguments && {} : stryMutAct_9fa48("76060") ? false : stryMutAct_9fa48("76059") ? true : (stryCov_9fa48("76059", "76060", "76061"), request.arguments || {}));
            if (stryMutAct_9fa48("76064") ? command !== CMD.LAUNCH : stryMutAct_9fa48("76063") ? false : stryMutAct_9fa48("76062") ? true : (stryCov_9fa48("76062", "76063", "76064"), command === CMD.LAUNCH)) {
              if (stryMutAct_9fa48("76065")) {
                {}
              } else {
                stryCov_9fa48("76065");
                this._launched = stryMutAct_9fa48("76066") ? false : (stryCov_9fa48("76066"), true);
              }
            } else {
              if (stryMutAct_9fa48("76067")) {
                {}
              } else {
                stryCov_9fa48("76067");
                this._attached = stryMutAct_9fa48("76068") ? false : (stryCov_9fa48("76068"), true);
              }
            }
            return {};
          }
        case CMD.SET_BREAKPOINTS:
          if (stryMutAct_9fa48("76069")) {} else {
            stryCov_9fa48("76069");
            this._assertSessionReady();
            return this._handleSetBreakpoints(stryMutAct_9fa48("76072") ? request.arguments && {} : stryMutAct_9fa48("76071") ? false : stryMutAct_9fa48("76070") ? true : (stryCov_9fa48("76070", "76071", "76072"), request.arguments || {}));
          }
        case CMD.CONTINUE:
          if (stryMutAct_9fa48("76073")) {} else {
            stryCov_9fa48("76073");
            this._assertSessionReady();
            await this._breakpointManager.continueExecution(stryMutAct_9fa48("76074") ? {} : (stryCov_9fa48("76074"), {
              sessionId: this._context.sessionId,
              instanceHandle: this._context.instanceHandle
            }));
            this.notifyContinued();
            return stryMutAct_9fa48("76075") ? {} : (stryCov_9fa48("76075"), {
              allThreadsContinued: stryMutAct_9fa48("76076") ? false : (stryCov_9fa48("76076"), true)
            });
          }
        case CMD.NEXT:
          if (stryMutAct_9fa48("76077")) {} else {
            stryCov_9fa48("76077");
            this._assertSessionReady();
            await this._breakpointManager.next(stryMutAct_9fa48("76078") ? {} : (stryCov_9fa48("76078"), {
              sessionId: this._context.sessionId,
              instanceHandle: this._context.instanceHandle
            }));
            this.notifyContinued();
            return {};
          }
        case CMD.STEP_IN:
          if (stryMutAct_9fa48("76079")) {} else {
            stryCov_9fa48("76079");
            this._assertSessionReady();
            await this._breakpointManager.stepIn(stryMutAct_9fa48("76080") ? {} : (stryCov_9fa48("76080"), {
              sessionId: this._context.sessionId,
              instanceHandle: this._context.instanceHandle
            }));
            this.notifyContinued();
            return {};
          }
        case CMD.STEP_OUT:
          if (stryMutAct_9fa48("76081")) {} else {
            stryCov_9fa48("76081");
            this._assertSessionReady();
            await this._breakpointManager.stepOut(stryMutAct_9fa48("76082") ? {} : (stryCov_9fa48("76082"), {
              sessionId: this._context.sessionId,
              instanceHandle: this._context.instanceHandle
            }));
            this.notifyContinued();
            return {};
          }
        case CMD.THREADS:
          if (stryMutAct_9fa48("76083")) {} else {
            stryCov_9fa48("76083");
            this._assertSessionReady();
            return stryMutAct_9fa48("76084") ? {} : (stryCov_9fa48("76084"), {
              threads: stryMutAct_9fa48("76085") ? [] : (stryCov_9fa48("76085"), [stryMutAct_9fa48("76086") ? {} : (stryCov_9fa48("76086"), {
                id: DEF.THREAD_ID,
                name: DEF.MAIN_THREAD_NAME
              })])
            });
          }
        case CMD.STACK_TRACE:
          if (stryMutAct_9fa48("76087")) {} else {
            stryCov_9fa48("76087");
            this._assertSessionReady();
            return await this._handleStackTrace(stryMutAct_9fa48("76090") ? request.arguments && {} : stryMutAct_9fa48("76089") ? false : stryMutAct_9fa48("76088") ? true : (stryCov_9fa48("76088", "76089", "76090"), request.arguments || {}));
          }
        case CMD.SCOPES:
          if (stryMutAct_9fa48("76091")) {} else {
            stryCov_9fa48("76091");
            this._assertSessionReady();
            return this._handleScopes(stryMutAct_9fa48("76094") ? request.arguments && {} : stryMutAct_9fa48("76093") ? false : stryMutAct_9fa48("76092") ? true : (stryCov_9fa48("76092", "76093", "76094"), request.arguments || {}));
          }
        case CMD.VARIABLES:
          if (stryMutAct_9fa48("76095")) {} else {
            stryCov_9fa48("76095");
            this._assertSessionReady();
            return await this._handleVariables(stryMutAct_9fa48("76098") ? request.arguments && {} : stryMutAct_9fa48("76097") ? false : stryMutAct_9fa48("76096") ? true : (stryCov_9fa48("76096", "76097", "76098"), request.arguments || {}));
          }
        default:
          if (stryMutAct_9fa48("76099")) {} else {
            stryCov_9fa48("76099");
            throw new Error(stryMutAct_9fa48("76100") ? `` : (stryCov_9fa48("76100"), `${ERR.COMMAND_UNSUPPORTED}: ${command}`));
          }
      }
    }
  }

  /**
   * @param {Object} args
   * @return {{breakpoints: Array<Object>}}
   * @private
   */
  _handleSetBreakpoints(args) {
    if (stryMutAct_9fa48("76101")) {
      {}
    } else {
      stryCov_9fa48("76101");
      const sourceFileUrl = stryMutAct_9fa48("76104") ? (args.source?.path || args.source?.name) && null : stryMutAct_9fa48("76103") ? false : stryMutAct_9fa48("76102") ? true : (stryCov_9fa48("76102", "76103", "76104"), (stryMutAct_9fa48("76106") ? args.source?.path && args.source?.name : stryMutAct_9fa48("76105") ? false : (stryCov_9fa48("76105", "76106"), (stryMutAct_9fa48("76107") ? args.source.path : (stryCov_9fa48("76107"), args.source?.path)) || (stryMutAct_9fa48("76108") ? args.source.name : (stryCov_9fa48("76108"), args.source?.name)))) || null);
      const breakpointInputs = Array.isArray(args.breakpoints) ? args.breakpoints : Array.isArray(args.lines) ? args.lines.map(stryMutAct_9fa48("76109") ? () => undefined : (stryCov_9fa48("76109"), line => stryMutAct_9fa48("76110") ? {} : (stryCov_9fa48("76110"), {
        line
      }))) : stryMutAct_9fa48("76111") ? ["Stryker was here"] : (stryCov_9fa48("76111"), []);
      const normalized = breakpointInputs.map(stryMutAct_9fa48("76112") ? () => undefined : (stryCov_9fa48("76112"), input => stryMutAct_9fa48("76113") ? {} : (stryCov_9fa48("76113"), {
        lineNumber: input.line,
        columnNumber: input.column,
        condition: input.condition
      })));
      const result = this._breakpointManager.setBreakpoints(stryMutAct_9fa48("76114") ? {} : (stryCov_9fa48("76114"), {
        sessionId: this._context.sessionId,
        moduleRef: this._context.moduleRef,
        index: this._context.index,
        sourceFileUrl,
        breakpoints: normalized
      }));
      return stryMutAct_9fa48("76115") ? {} : (stryCov_9fa48("76115"), {
        breakpoints: result.breakpoints.map(stryMutAct_9fa48("76116") ? () => undefined : (stryCov_9fa48("76116"), breakpoint => stryMutAct_9fa48("76117") ? {} : (stryCov_9fa48("76117"), {
          id: breakpoint.breakpointId,
          verified: breakpoint.resolved,
          line: breakpoint.lineNumber,
          column: breakpoint.columnNumber,
          message: stryMutAct_9fa48("76120") ? breakpoint.resolutionError && undefined : stryMutAct_9fa48("76119") ? false : stryMutAct_9fa48("76118") ? true : (stryCov_9fa48("76118", "76119", "76120"), breakpoint.resolutionError || undefined)
        })))
      });
    }
  }

  /**
   * @param {Object} args
   * @return {Promise<Object>}
   * @private
   */
  async _handleStackTrace(args) {
    if (stryMutAct_9fa48("76121")) {
      {}
    } else {
      stryCov_9fa48("76121");
      const stack = await this._runtimeIntrospector.listStackFrames(stryMutAct_9fa48("76122") ? {} : (stryCov_9fa48("76122"), {
        instanceHandle: this._context.instanceHandle,
        index: this._context.index
      }));
      const startFrame = Number.isInteger(args.startFrame) ? stryMutAct_9fa48("76123") ? Math.min(args.startFrame, NUM.ZERO) : (stryCov_9fa48("76123"), Math.max(args.startFrame, NUM.ZERO)) : NUM.ZERO;
      const levels = Number.isInteger(args.levels) ? stryMutAct_9fa48("76124") ? Math.min(args.levels, NUM.ZERO) : (stryCov_9fa48("76124"), Math.max(args.levels, NUM.ZERO)) : stack.frames.length;
      const slicedFrames = stryMutAct_9fa48("76125") ? stack.frames : (stryCov_9fa48("76125"), stack.frames.slice(startFrame, stryMutAct_9fa48("76126") ? startFrame - levels : (stryCov_9fa48("76126"), startFrame + levels)));
      const stackFrames = slicedFrames.map(stryMutAct_9fa48("76127") ? () => undefined : (stryCov_9fa48("76127"), frame => stryMutAct_9fa48("76128") ? {} : (stryCov_9fa48("76128"), {
        id: frame.frameId,
        name: (stryMutAct_9fa48("76132") ? frame.symbols.length <= NUM.ZERO : stryMutAct_9fa48("76131") ? frame.symbols.length >= NUM.ZERO : stryMutAct_9fa48("76130") ? false : stryMutAct_9fa48("76129") ? true : (stryCov_9fa48("76129", "76130", "76131", "76132"), frame.symbols.length > NUM.ZERO)) ? frame.symbols[NUM.ZERO] : stryMutAct_9fa48("76133") ? `` : (stryCov_9fa48("76133"), `${DEF.FRAME_NAME_PREFIX}${frame.frameId}`),
        line: frame.source ? frame.source.lineNumber : NUM.ZERO,
        column: frame.source ? frame.source.columnNumber : NUM.ZERO,
        source: frame.source ? stryMutAct_9fa48("76134") ? {} : (stryCov_9fa48("76134"), {
          path: frame.source.sourceFileUrl
        }) : undefined
      })));
      return stryMutAct_9fa48("76135") ? {} : (stryCov_9fa48("76135"), {
        stackFrames,
        totalFrames: stack.frames.length
      });
    }
  }

  /**
   * @param {Object} args
   * @return {Object}
   * @private
   */
  _handleScopes(args) {
    if (stryMutAct_9fa48("76136")) {
      {}
    } else {
      stryCov_9fa48("76136");
      if (stryMutAct_9fa48("76139") ? !Number.isInteger(args.frameId) && args.frameId < NUM.ZERO : stryMutAct_9fa48("76138") ? false : stryMutAct_9fa48("76137") ? true : (stryCov_9fa48("76137", "76138", "76139"), (stryMutAct_9fa48("76140") ? Number.isInteger(args.frameId) : (stryCov_9fa48("76140"), !Number.isInteger(args.frameId))) || (stryMutAct_9fa48("76143") ? args.frameId >= NUM.ZERO : stryMutAct_9fa48("76142") ? args.frameId <= NUM.ZERO : stryMutAct_9fa48("76141") ? false : (stryCov_9fa48("76141", "76142", "76143"), args.frameId < NUM.ZERO)))) {
        if (stryMutAct_9fa48("76144")) {
          {}
        } else {
          stryCov_9fa48("76144");
          throw new Error(ERR.FRAME_REQUIRED);
        }
      }
      const variablesReference = stryMutAct_9fa48("76145") ? this._nextVariableReference-- : (stryCov_9fa48("76145"), this._nextVariableReference++);
      this._variablesByReference.set(variablesReference, args.frameId);
      return stryMutAct_9fa48("76146") ? {} : (stryCov_9fa48("76146"), {
        scopes: stryMutAct_9fa48("76147") ? [] : (stryCov_9fa48("76147"), [stryMutAct_9fa48("76148") ? {} : (stryCov_9fa48("76148"), {
          name: DEF.LOCAL_SCOPE_NAME,
          variablesReference,
          expensive: stryMutAct_9fa48("76149") ? true : (stryCov_9fa48("76149"), false)
        })])
      });
    }
  }

  /**
   * @param {Object} args
   * @return {Promise<Object>}
   * @private
   */
  async _handleVariables(args) {
    if (stryMutAct_9fa48("76150")) {
      {}
    } else {
      stryCov_9fa48("76150");
      if (stryMutAct_9fa48("76153") ? !Number.isInteger(args.variablesReference) && args.variablesReference <= NUM.ZERO : stryMutAct_9fa48("76152") ? false : stryMutAct_9fa48("76151") ? true : (stryCov_9fa48("76151", "76152", "76153"), (stryMutAct_9fa48("76154") ? Number.isInteger(args.variablesReference) : (stryCov_9fa48("76154"), !Number.isInteger(args.variablesReference))) || (stryMutAct_9fa48("76157") ? args.variablesReference > NUM.ZERO : stryMutAct_9fa48("76156") ? args.variablesReference < NUM.ZERO : stryMutAct_9fa48("76155") ? false : (stryCov_9fa48("76155", "76156", "76157"), args.variablesReference <= NUM.ZERO)))) {
        if (stryMutAct_9fa48("76158")) {
          {}
        } else {
          stryCov_9fa48("76158");
          throw new Error(ERR.VARIABLES_REFERENCE_REQUIRED);
        }
      }
      const frameId = this._variablesByReference.get(args.variablesReference);
      if (stryMutAct_9fa48("76161") ? false : stryMutAct_9fa48("76160") ? true : stryMutAct_9fa48("76159") ? Number.isInteger(frameId) : (stryCov_9fa48("76159", "76160", "76161"), !Number.isInteger(frameId))) {
        if (stryMutAct_9fa48("76162")) {
          {}
        } else {
          stryCov_9fa48("76162");
          throw new Error(ERR.VARIABLES_REFERENCE_UNKNOWN);
        }
      }
      const locals = await this._runtimeIntrospector.listLocals(stryMutAct_9fa48("76163") ? {} : (stryCov_9fa48("76163"), {
        instanceHandle: this._context.instanceHandle,
        index: this._context.index,
        frameId
      }));
      return stryMutAct_9fa48("76164") ? {} : (stryCov_9fa48("76164"), {
        variables: locals.variables.map(stryMutAct_9fa48("76165") ? () => undefined : (stryCov_9fa48("76165"), variable => stryMutAct_9fa48("76166") ? {} : (stryCov_9fa48("76166"), {
          name: variable.name,
          value: formatVariableValue(variable.value),
          type: variable.type,
          variablesReference: NUM.ZERO
        })))
      });
    }
  }

  /**
   * @private
   */
  _assertInitialized() {
    if (stryMutAct_9fa48("76167")) {
      {}
    } else {
      stryCov_9fa48("76167");
      if (stryMutAct_9fa48("76170") ? false : stryMutAct_9fa48("76169") ? true : stryMutAct_9fa48("76168") ? this._initialized : (stryCov_9fa48("76168", "76169", "76170"), !this._initialized)) {
        if (stryMutAct_9fa48("76171")) {
          {}
        } else {
          stryCov_9fa48("76171");
          throw new Error(ERR.INITIALIZE_REQUIRED);
        }
      }
    }
  }

  /**
   * @private
   */
  _assertSessionReady() {
    if (stryMutAct_9fa48("76172")) {
      {}
    } else {
      stryCov_9fa48("76172");
      this._assertInitialized();
      const hasContext = stryMutAct_9fa48("76175") ? isNonEmptyString(this._context.sessionId) && isNonEmptyString(this._context.moduleRef) && this._context.instanceHandle && typeof this._context.instanceHandle === TYPEOF.OBJECT && this._context.index || typeof this._context.index === TYPEOF.OBJECT : stryMutAct_9fa48("76174") ? false : stryMutAct_9fa48("76173") ? true : (stryCov_9fa48("76173", "76174", "76175"), (stryMutAct_9fa48("76177") ? isNonEmptyString(this._context.sessionId) && isNonEmptyString(this._context.moduleRef) && this._context.instanceHandle && typeof this._context.instanceHandle === TYPEOF.OBJECT || this._context.index : stryMutAct_9fa48("76176") ? true : (stryCov_9fa48("76176", "76177"), (stryMutAct_9fa48("76179") ? isNonEmptyString(this._context.sessionId) && isNonEmptyString(this._context.moduleRef) && this._context.instanceHandle || typeof this._context.instanceHandle === TYPEOF.OBJECT : stryMutAct_9fa48("76178") ? true : (stryCov_9fa48("76178", "76179"), (stryMutAct_9fa48("76181") ? isNonEmptyString(this._context.sessionId) && isNonEmptyString(this._context.moduleRef) || this._context.instanceHandle : stryMutAct_9fa48("76180") ? true : (stryCov_9fa48("76180", "76181"), (stryMutAct_9fa48("76183") ? isNonEmptyString(this._context.sessionId) || isNonEmptyString(this._context.moduleRef) : stryMutAct_9fa48("76182") ? true : (stryCov_9fa48("76182", "76183"), isNonEmptyString(this._context.sessionId) && isNonEmptyString(this._context.moduleRef))) && this._context.instanceHandle)) && (stryMutAct_9fa48("76185") ? typeof this._context.instanceHandle !== TYPEOF.OBJECT : stryMutAct_9fa48("76184") ? true : (stryCov_9fa48("76184", "76185"), typeof this._context.instanceHandle === TYPEOF.OBJECT)))) && this._context.index)) && (stryMutAct_9fa48("76187") ? typeof this._context.index !== TYPEOF.OBJECT : stryMutAct_9fa48("76186") ? true : (stryCov_9fa48("76186", "76187"), typeof this._context.index === TYPEOF.OBJECT)));
      if (stryMutAct_9fa48("76190") ? !hasContext && !this._launched && !this._attached : stryMutAct_9fa48("76189") ? false : stryMutAct_9fa48("76188") ? true : (stryCov_9fa48("76188", "76189", "76190"), (stryMutAct_9fa48("76191") ? hasContext : (stryCov_9fa48("76191"), !hasContext)) || (stryMutAct_9fa48("76193") ? !this._launched || !this._attached : stryMutAct_9fa48("76192") ? false : (stryCov_9fa48("76192", "76193"), (stryMutAct_9fa48("76194") ? this._launched : (stryCov_9fa48("76194"), !this._launched)) && (stryMutAct_9fa48("76195") ? this._attached : (stryCov_9fa48("76195"), !this._attached)))))) {
        if (stryMutAct_9fa48("76196")) {
          {}
        } else {
          stryCov_9fa48("76196");
          throw new Error(ERR.SESSION_NOT_READY);
        }
      }
    }
  }

  /**
   * @param {Object} args
   * @private
   */
  _setContextFromArgs(args) {
    if (stryMutAct_9fa48("76197")) {
      {}
    } else {
      stryCov_9fa48("76197");
      if (stryMutAct_9fa48("76200") ? (!isNonEmptyString(args.sessionId) || !isNonEmptyString(args.moduleRef) || !args.instanceHandle || typeof args.instanceHandle !== TYPEOF.OBJECT || !args.index) && typeof args.index !== TYPEOF.OBJECT : stryMutAct_9fa48("76199") ? false : stryMutAct_9fa48("76198") ? true : (stryCov_9fa48("76198", "76199", "76200"), (stryMutAct_9fa48("76202") ? (!isNonEmptyString(args.sessionId) || !isNonEmptyString(args.moduleRef) || !args.instanceHandle || typeof args.instanceHandle !== TYPEOF.OBJECT) && !args.index : stryMutAct_9fa48("76201") ? false : (stryCov_9fa48("76201", "76202"), (stryMutAct_9fa48("76204") ? (!isNonEmptyString(args.sessionId) || !isNonEmptyString(args.moduleRef) || !args.instanceHandle) && typeof args.instanceHandle !== TYPEOF.OBJECT : stryMutAct_9fa48("76203") ? false : (stryCov_9fa48("76203", "76204"), (stryMutAct_9fa48("76206") ? (!isNonEmptyString(args.sessionId) || !isNonEmptyString(args.moduleRef)) && !args.instanceHandle : stryMutAct_9fa48("76205") ? false : (stryCov_9fa48("76205", "76206"), (stryMutAct_9fa48("76208") ? !isNonEmptyString(args.sessionId) && !isNonEmptyString(args.moduleRef) : stryMutAct_9fa48("76207") ? false : (stryCov_9fa48("76207", "76208"), (stryMutAct_9fa48("76209") ? isNonEmptyString(args.sessionId) : (stryCov_9fa48("76209"), !isNonEmptyString(args.sessionId))) || (stryMutAct_9fa48("76210") ? isNonEmptyString(args.moduleRef) : (stryCov_9fa48("76210"), !isNonEmptyString(args.moduleRef))))) || (stryMutAct_9fa48("76211") ? args.instanceHandle : (stryCov_9fa48("76211"), !args.instanceHandle)))) || (stryMutAct_9fa48("76213") ? typeof args.instanceHandle === TYPEOF.OBJECT : stryMutAct_9fa48("76212") ? false : (stryCov_9fa48("76212", "76213"), typeof args.instanceHandle !== TYPEOF.OBJECT)))) || (stryMutAct_9fa48("76214") ? args.index : (stryCov_9fa48("76214"), !args.index)))) || (stryMutAct_9fa48("76216") ? typeof args.index === TYPEOF.OBJECT : stryMutAct_9fa48("76215") ? false : (stryCov_9fa48("76215", "76216"), typeof args.index !== TYPEOF.OBJECT)))) {
        if (stryMutAct_9fa48("76217")) {
          {}
        } else {
          stryCov_9fa48("76217");
          throw new Error(ERR.SESSION_CONTEXT_REQUIRED);
        }
      }
      this._context = stryMutAct_9fa48("76218") ? {} : (stryCov_9fa48("76218"), {
        sessionId: args.sessionId,
        moduleRef: args.moduleRef,
        instanceHandle: args.instanceHandle,
        index: args.index
      });
    }
  }

  /**
   * Emit one protocol payload over transport.
   *
   * @param {Object} message - DAP payload.
   * @private
   */
  _emitProtocolMessage(message) {
    if (stryMutAct_9fa48("76219")) {
      {}
    } else {
      stryCov_9fa48("76219");
      const framed = encodeDapProtocolMessage(message);
      this._sendMessage(framed, message);
    }
  }
}

/**
 * @param {number} seq
 * @param {Object} request
 * @param {boolean} success
 * @param {Object|null} body
 * @param {string} [errorMessage]
 * @return {Object}
 */
function buildResponse(seq, request, success, body, errorMessage) {
  if (stryMutAct_9fa48("76220")) {
    {}
  } else {
    stryCov_9fa48("76220");
    return stryMutAct_9fa48("76221") ? {} : (stryCov_9fa48("76221"), {
      type: MT.RESPONSE,
      seq,
      request_seq: request.seq,
      success,
      command: request.command,
      message: success ? undefined : errorMessage,
      body: success ? stryMutAct_9fa48("76224") ? body && {} : stryMutAct_9fa48("76223") ? false : stryMutAct_9fa48("76222") ? true : (stryCov_9fa48("76222", "76223", "76224"), body || {}) : {}
    });
  }
}

/**
 * @param {number} seq
 * @param {string} event
 * @param {Object} body
 * @return {Object}
 */
function buildEvent(seq, event, body) {
  if (stryMutAct_9fa48("76225")) {
    {}
  } else {
    stryCov_9fa48("76225");
    return stryMutAct_9fa48("76226") ? {} : (stryCov_9fa48("76226"), {
      type: MT.EVENT,
      seq,
      event,
      body
    });
  }
}

/**
 * @param {string} headerText
 * @return {number}
 */
function parseContentLength(headerText) {
  if (stryMutAct_9fa48("76227")) {
    {}
  } else {
    stryCov_9fa48("76227");
    const headerLines = headerText.split(DEF.LINE_SEPARATOR);
    for (const headerLine of headerLines) {
      if (stryMutAct_9fa48("76228")) {
        {}
      } else {
        stryCov_9fa48("76228");
        const separatorIndex = headerLine.indexOf(stryMutAct_9fa48("76229") ? "" : (stryCov_9fa48("76229"), ':'));
        if (stryMutAct_9fa48("76233") ? separatorIndex >= NUM.ZERO : stryMutAct_9fa48("76232") ? separatorIndex <= NUM.ZERO : stryMutAct_9fa48("76231") ? false : stryMutAct_9fa48("76230") ? true : (stryCov_9fa48("76230", "76231", "76232", "76233"), separatorIndex < NUM.ZERO)) {
          if (stryMutAct_9fa48("76234")) {
            {}
          } else {
            stryCov_9fa48("76234");
            continue;
          }
        }
        const headerName = stryMutAct_9fa48("76236") ? headerLine.trim() : stryMutAct_9fa48("76235") ? headerLine.slice(NUM.ZERO, separatorIndex) : (stryCov_9fa48("76235", "76236"), headerLine.slice(NUM.ZERO, separatorIndex).trim());
        if (stryMutAct_9fa48("76239") ? headerName === DEF.CONTENT_LENGTH_HEADER : stryMutAct_9fa48("76238") ? false : stryMutAct_9fa48("76237") ? true : (stryCov_9fa48("76237", "76238", "76239"), headerName !== DEF.CONTENT_LENGTH_HEADER)) {
          if (stryMutAct_9fa48("76240")) {
            {}
          } else {
            stryCov_9fa48("76240");
            continue;
          }
        }
        const headerValue = stryMutAct_9fa48("76242") ? headerLine.trim() : stryMutAct_9fa48("76241") ? headerLine.slice(separatorIndex + NUM.ONE) : (stryCov_9fa48("76241", "76242"), headerLine.slice(stryMutAct_9fa48("76243") ? separatorIndex - NUM.ONE : (stryCov_9fa48("76243"), separatorIndex + NUM.ONE)).trim());
        const parsedLength = Number.parseInt(headerValue, 10);
        return Number.isFinite(parsedLength) ? parsedLength : NUM.NEGATIVE_ONE;
      }
    }
    return NUM.NEGATIVE_ONE;
  }
}

/**
 * @param {string|Buffer|Uint8Array} chunk
 * @return {string}
 */
function normalizeChunkToString(chunk) {
  if (stryMutAct_9fa48("76244")) {
    {}
  } else {
    stryCov_9fa48("76244");
    if (stryMutAct_9fa48("76247") ? typeof chunk !== TYPEOF.STRING : stryMutAct_9fa48("76246") ? false : stryMutAct_9fa48("76245") ? true : (stryCov_9fa48("76245", "76246", "76247"), typeof chunk === TYPEOF.STRING)) {
      if (stryMutAct_9fa48("76248")) {
        {}
      } else {
        stryCov_9fa48("76248");
        return chunk;
      }
    }
    if (stryMutAct_9fa48("76250") ? false : stryMutAct_9fa48("76249") ? true : (stryCov_9fa48("76249", "76250"), Buffer.isBuffer(chunk))) {
      if (stryMutAct_9fa48("76251")) {
        {}
      } else {
        stryCov_9fa48("76251");
        return chunk.toString(stryMutAct_9fa48("76252") ? "" : (stryCov_9fa48("76252"), 'utf8'));
      }
    }
    if (stryMutAct_9fa48("76254") ? false : stryMutAct_9fa48("76253") ? true : (stryCov_9fa48("76253", "76254"), chunk instanceof Uint8Array)) {
      if (stryMutAct_9fa48("76255")) {
        {}
      } else {
        stryCov_9fa48("76255");
        return Buffer.from(chunk).toString(stryMutAct_9fa48("76256") ? "" : (stryCov_9fa48("76256"), 'utf8'));
      }
    }
    throw new Error(ERR.MESSAGE_REQUIRED);
  }
}

/**
 * @param {*} value
 * @return {string}
 */
function formatVariableValue(value) {
  if (stryMutAct_9fa48("76257")) {
    {}
  } else {
    stryCov_9fa48("76257");
    if (stryMutAct_9fa48("76260") ? typeof value !== TYPEOF.STRING : stryMutAct_9fa48("76259") ? false : stryMutAct_9fa48("76258") ? true : (stryCov_9fa48("76258", "76259", "76260"), typeof value === TYPEOF.STRING)) {
      if (stryMutAct_9fa48("76261")) {
        {}
      } else {
        stryCov_9fa48("76261");
        return value;
      }
    }
    if (stryMutAct_9fa48("76264") ? value !== undefined : stryMutAct_9fa48("76263") ? false : stryMutAct_9fa48("76262") ? true : (stryCov_9fa48("76262", "76263", "76264"), value === undefined)) {
      if (stryMutAct_9fa48("76265")) {
        {}
      } else {
        stryCov_9fa48("76265");
        return stryMutAct_9fa48("76266") ? "" : (stryCov_9fa48("76266"), 'undefined');
      }
    }
    if (stryMutAct_9fa48("76269") ? value !== null : stryMutAct_9fa48("76268") ? false : stryMutAct_9fa48("76267") ? true : (stryCov_9fa48("76267", "76268", "76269"), value === null)) {
      if (stryMutAct_9fa48("76270")) {
        {}
      } else {
        stryCov_9fa48("76270");
        return stryMutAct_9fa48("76271") ? "" : (stryCov_9fa48("76271"), 'null');
      }
    }
    if (stryMutAct_9fa48("76274") ? typeof value !== TYPEOF.OBJECT : stryMutAct_9fa48("76273") ? false : stryMutAct_9fa48("76272") ? true : (stryCov_9fa48("76272", "76273", "76274"), typeof value === TYPEOF.OBJECT)) {
      if (stryMutAct_9fa48("76275")) {
        {}
      } else {
        stryCov_9fa48("76275");
        try {
          if (stryMutAct_9fa48("76276")) {
            {}
          } else {
            stryCov_9fa48("76276");
            return JSON.stringify(value);
          }
        } catch (_err) {
          if (stryMutAct_9fa48("76277")) {
            {}
          } else {
            stryCov_9fa48("76277");
            return String(value);
          }
        }
      }
    }
    return String(value);
  }
}

/**
 * @param {*} value
 * @return {boolean}
 */
function isNonEmptyString(value) {
  if (stryMutAct_9fa48("76278")) {
    {}
  } else {
    stryCov_9fa48("76278");
    return stryMutAct_9fa48("76281") ? typeof value === TYPEOF.STRING || value.trim().length > NUM.ZERO : stryMutAct_9fa48("76280") ? false : stryMutAct_9fa48("76279") ? true : (stryCov_9fa48("76279", "76280", "76281"), (stryMutAct_9fa48("76283") ? typeof value !== TYPEOF.STRING : stryMutAct_9fa48("76282") ? true : (stryCov_9fa48("76282", "76283"), typeof value === TYPEOF.STRING)) && (stryMutAct_9fa48("76286") ? value.trim().length <= NUM.ZERO : stryMutAct_9fa48("76285") ? value.trim().length >= NUM.ZERO : stryMutAct_9fa48("76284") ? true : (stryCov_9fa48("76284", "76285", "76286"), (stryMutAct_9fa48("76287") ? value.length : (stryCov_9fa48("76287"), value.trim().length)) > NUM.ZERO)));
  }
}
export { DapMessageFramer, DapServer, encodeDapProtocolMessage };