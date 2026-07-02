/**
 * DAP server with protocol framing and debug-runtime integration.
 */

import {
  DAP_MESSAGE_TYPE as MT,
  DAP_COMMAND as CMD,
  DAP_EVENT,
  DAP_DEFAULT as DEF,
  DAP_ERROR_MSG as ERR,
} from './dap-constants.js';

const LOCAL_STR_UTF8 = 'utf8';
const LOCAL_STR_UNDEFINED = 'undefined';
const LOCAL_STR_NULL = 'null';

/**
 * Encode one DAP payload into framed wire format.
 *
 * @param {Object} message - DAP message object.
 * @return {string} Framed payload string.
 */
function encodeDapProtocolMessage(message) {
  const payload = JSON.stringify(message);
  const contentLength = Buffer.byteLength(payload, 'utf8');
  return `${DEF.CONTENT_LENGTH_HEADER}: ${contentLength}` +
    `${DEF.LINE_SEPARATOR}${DEF.LINE_SEPARATOR}${payload}`;
}

/**
 * Framing helper for DAP Content-Length payloads.
 */
class DapMessageFramer {
  constructor() {
    this._buffer = '';
  }

  /**
   * Push raw data and parse complete messages.
   *
   * @param {string|Buffer|Uint8Array} chunk - Raw transport bytes.
   * @return {Array<Object>} Parsed DAP messages.
   */
  push(chunk) {
    const chunkText = normalizeChunkToString(chunk);
    this._buffer += chunkText;

    const messages = [];
    while (true) {
      const headerEndIndex = this._buffer.indexOf(
        DEF.HEADER_SEPARATOR,
      );
      if (headerEndIndex < 0) {
        break;
      }

      const headerText = this._buffer.slice(0, headerEndIndex);
      const contentLength = parseContentLength(headerText);
      if (!Number.isInteger(contentLength) ||
        contentLength < 0) {
        throw new Error(ERR.CONTENT_LENGTH_INVALID);
      }

      const payloadStart = headerEndIndex +
        DEF.HEADER_SEPARATOR.length;
      const payloadEnd = payloadStart + contentLength;
      if (this._buffer.length < payloadEnd) {
        break;
      }

      const payload = this._buffer.slice(payloadStart, payloadEnd);
      let parsedPayload;
      try {
        parsedPayload = JSON.parse(payload);
      } catch (_err) {
        throw new Error(ERR.PAYLOAD_INVALID);
      }
      messages.push(parsedPayload);

      this._buffer = this._buffer.slice(payloadEnd);
    }

    return messages;
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
    if (!options.breakpointManager ||
      typeof options.breakpointManager !== 'object') {
      throw new Error(ERR.BREAKPOINT_MANAGER_REQUIRED);
    }
    if (!options.runtimeIntrospector ||
      typeof options.runtimeIntrospector !== 'object') {
      throw new Error(ERR.RUNTIME_INTROSPECTOR_REQUIRED);
    }
    if (typeof options.sendMessage !== 'function') {
      throw new Error(ERR.SEND_MESSAGE_REQUIRED);
    }

    this._breakpointManager = options.breakpointManager;
    this._runtimeIntrospector = options.runtimeIntrospector;
    this._sendMessage = options.sendMessage;
    this._framer = new DapMessageFramer();

    this._initialized = false;
    this._launched = false;
    this._attached = false;
    this._nextSeq = 1;
    this._nextVariableReference = 1;
    this._variablesByReference = new Map();

    this._context = {
      sessionId: null,
      moduleRef: null,
      instanceHandle: null,
      index: null,
      ...(options.context || {}),
    };
  }

  /**
   * Receive transport bytes, parse requests, and emit responses/events.
   *
   * @param {string|Buffer|Uint8Array} chunk
   * @return {Promise<Array<Object>>} Response payloads.
   */
  async receiveData(chunk) {
    const messages = this._framer.push(chunk);
    const responses = [];
    for (const message of messages) {
      const response = await this.handleProtocolMessage(message);
      if (response) {
        responses.push(response);
      }
    }
    return responses;
  }

  /**
   * Handle one parsed DAP protocol message.
   *
   * @param {Object} message - Parsed protocol message.
   * @return {Promise<Object|null>} Response payload.
   */
  async handleProtocolMessage(message) {
    if (!message || typeof message !== 'object') {
      throw new Error(ERR.MESSAGE_REQUIRED);
    }
    if (message.type !== MT.REQUEST) {
      return null;
    }
    return await this.handleRequest(message);
  }

  /**
   * Handle one DAP request and emit its response.
   *
   * @param {Object} request - DAP request.
   * @return {Promise<Object>} DAP response payload.
   */
  async handleRequest(request) {
    if (!request || typeof request !== 'object') {
      throw new Error(ERR.REQUEST_REQUIRED);
    }

    try {
      const body = await this._dispatchCommand(request);
      const response = buildResponse(
        this._nextSeq++,
        request,
        true,
        body,
      );
      this._emitProtocolMessage(response);
      return response;
    } catch (err) {
      const response = buildResponse(
        this._nextSeq++,
        request,
        false,
        null,
        err.message || String(err),
      );
      this._emitProtocolMessage(response);
      return response;
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
    const moduleRef = request.moduleRef || this._context.moduleRef;
    const pause = this._breakpointManager.handlePause({
      sessionId: this._context.sessionId,
      moduleRef,
      codeOffset: request.codeOffset,
    });

    const event = buildEvent(this._nextSeq++, DAP_EVENT.STOPPED, {
      reason: pause.reason,
      threadId: DEF.THREAD_ID,
      allThreadsStopped: true,
    });
    this._emitProtocolMessage(event);
  }

  /**
   * Publish a continued event.
   */
  notifyContinued() {
    const event = buildEvent(this._nextSeq++, DAP_EVENT.CONTINUED, {
      threadId: DEF.THREAD_ID,
      allThreadsContinued: true,
    });
    this._emitProtocolMessage(event);
  }

  /**
   * @param {Object} request
   * @return {Promise<Object>}
   * @private
   */
  async _dispatchCommand(request) {
    const command = request.command;

    switch (command) {
    case CMD.INITIALIZE:
      this._initialized = true;
      this._emitProtocolMessage(buildEvent(
        this._nextSeq++,
        DAP_EVENT.INITIALIZED,
        {},
      ));
      return {
        supportsConfigurationDoneRequest: false,
        supportsSetVariable: false,
      };

    case CMD.LAUNCH:
    case CMD.ATTACH:
      this._assertInitialized();
      this._setContextFromArgs(request.arguments || {});
      if (command === CMD.LAUNCH) {
        this._launched = true;
      } else {
        this._attached = true;
      }
      return {};

    case CMD.SET_BREAKPOINTS:
      this._assertSessionReady();
      return this._handleSetBreakpoints(request.arguments || {});

    case CMD.CONTINUE:
      this._assertSessionReady();
      await this._breakpointManager.continueExecution({
        sessionId: this._context.sessionId,
        instanceHandle: this._context.instanceHandle,
      });
      this.notifyContinued();
      return {allThreadsContinued: true};

    case CMD.NEXT:
      this._assertSessionReady();
      await this._breakpointManager.next({
        sessionId: this._context.sessionId,
        instanceHandle: this._context.instanceHandle,
      });
      this.notifyContinued();
      return {};

    case CMD.STEP_IN:
      this._assertSessionReady();
      await this._breakpointManager.stepIn({
        sessionId: this._context.sessionId,
        instanceHandle: this._context.instanceHandle,
      });
      this.notifyContinued();
      return {};

    case CMD.STEP_OUT:
      this._assertSessionReady();
      await this._breakpointManager.stepOut({
        sessionId: this._context.sessionId,
        instanceHandle: this._context.instanceHandle,
      });
      this.notifyContinued();
      return {};

    case CMD.THREADS:
      this._assertSessionReady();
      return {
        threads: [{
          id: DEF.THREAD_ID,
          name: DEF.MAIN_THREAD_NAME,
        }],
      };

    case CMD.STACK_TRACE:
      this._assertSessionReady();
      return await this._handleStackTrace(request.arguments || {});

    case CMD.SCOPES:
      this._assertSessionReady();
      return this._handleScopes(request.arguments || {});

    case CMD.VARIABLES:
      this._assertSessionReady();
      return await this._handleVariables(request.arguments || {});

    default:
      throw new Error(`${ERR.COMMAND_UNSUPPORTED}: ${command}`);
    }
  }

  /**
   * @param {Object} args
   * @return {{breakpoints: Array<Object>}}
   * @private
   */
  _handleSetBreakpoints(args) {
    const sourceFileUrl = args.source?.path || args.source?.name || null;
    const breakpointInputs = Array.isArray(args.breakpoints) ?
      args.breakpoints :
      (Array.isArray(args.lines) ?
        args.lines.map((line) => ({line})) :
        []);

    const normalized = breakpointInputs.map((input) => ({
      lineNumber: input.line,
      columnNumber: input.column,
      condition: input.condition,
    }));

    const result = this._breakpointManager.setBreakpoints({
      sessionId: this._context.sessionId,
      moduleRef: this._context.moduleRef,
      index: this._context.index,
      sourceFileUrl,
      breakpoints: normalized,
    });

    return {
      breakpoints: result.breakpoints.map((breakpoint) => ({
        id: breakpoint.breakpointId,
        verified: breakpoint.resolved,
        line: breakpoint.lineNumber,
        column: breakpoint.columnNumber,
        message: breakpoint.resolutionError || undefined,
      })),
    };
  }

  /**
   * @param {Object} args
   * @return {Promise<Object>}
   * @private
   */
  async _handleStackTrace(args) {
    const stack = await this._runtimeIntrospector.listStackFrames({
      instanceHandle: this._context.instanceHandle,
      index: this._context.index,
    });

    const startFrame = Number.isInteger(args.startFrame) ?
      Math.max(args.startFrame, 0) :
      0;
    const levels = Number.isInteger(args.levels) ?
      Math.max(args.levels, 0) :
      stack.frames.length;

    const slicedFrames = stack.frames.slice(startFrame, startFrame + levels);
    const stackFrames = slicedFrames.map((frame) => ({
      id: frame.frameId,
      name: frame.symbols.length > 0 ?
        frame.symbols[0] :
        `${DEF.FRAME_NAME_PREFIX}${frame.frameId}`,
      line: frame.source ? frame.source.lineNumber : 0,
      column: frame.source ? frame.source.columnNumber : 0,
      source: frame.source ? {
        path: frame.source.sourceFileUrl,
      } : undefined,
    }));

    return {
      stackFrames,
      totalFrames: stack.frames.length,
    };
  }

  /**
   * @param {Object} args
   * @return {Object}
   * @private
   */
  _handleScopes(args) {
    if (!Number.isInteger(args.frameId) || args.frameId < 0) {
      throw new Error(ERR.FRAME_REQUIRED);
    }
    const variablesReference = this._nextVariableReference++;
    this._variablesByReference.set(variablesReference, args.frameId);
    return {
      scopes: [{
        name: DEF.LOCAL_SCOPE_NAME,
        variablesReference,
        expensive: false,
      }],
    };
  }

  /**
   * @param {Object} args
   * @return {Promise<Object>}
   * @private
   */
  async _handleVariables(args) {
    if (!Number.isInteger(args.variablesReference) ||
      args.variablesReference <= 0) {
      throw new Error(ERR.VARIABLES_REFERENCE_REQUIRED);
    }
    const frameId = this._variablesByReference.get(args.variablesReference);
    if (!Number.isInteger(frameId)) {
      throw new Error(ERR.VARIABLES_REFERENCE_UNKNOWN);
    }

    const locals = await this._runtimeIntrospector.listLocals({
      instanceHandle: this._context.instanceHandle,
      index: this._context.index,
      frameId,
    });

    return {
      variables: locals.variables.map((variable) => ({
        name: variable.name,
        value: formatVariableValue(variable.value),
        type: variable.type,
        variablesReference: 0,
      })),
    };
  }

  /**
   * @private
   */
  _assertInitialized() {
    if (!this._initialized) {
      throw new Error(ERR.INITIALIZE_REQUIRED);
    }
  }

  /**
   * @private
   */
  _assertSessionReady() {
    this._assertInitialized();
    const hasContext = isNonEmptyString(this._context.sessionId) &&
      isNonEmptyString(this._context.moduleRef) &&
      this._context.instanceHandle &&
      typeof this._context.instanceHandle === 'object' &&
      this._context.index &&
      typeof this._context.index === 'object';
    if (!hasContext || (!this._launched && !this._attached)) {
      throw new Error(ERR.SESSION_NOT_READY);
    }
  }

  /**
   * @param {Object} args
   * @private
   */
  _setContextFromArgs(args) {
    if (!isNonEmptyString(args.sessionId) ||
      !isNonEmptyString(args.moduleRef) ||
      !args.instanceHandle ||
      typeof args.instanceHandle !== 'object' ||
      !args.index ||
      typeof args.index !== 'object') {
      throw new Error(ERR.SESSION_CONTEXT_REQUIRED);
    }

    this._context = {
      sessionId: args.sessionId,
      moduleRef: args.moduleRef,
      instanceHandle: args.instanceHandle,
      index: args.index,
    };
  }

  /**
   * Emit one protocol payload over transport.
   *
   * @param {Object} message - DAP payload.
   * @private
   */
  _emitProtocolMessage(message) {
    const framed = encodeDapProtocolMessage(message);
    this._sendMessage(framed, message);
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
  return {
    type: MT.RESPONSE,
    seq,
    request_seq: request.seq,
    success,
    command: request.command,
    message: success ? undefined : errorMessage,
    body: success ? body || {} : {},
  };
}

/**
 * @param {number} seq
 * @param {string} event
 * @param {Object} body
 * @return {Object}
 */
function buildEvent(seq, event, body) {
  return {
    type: MT.EVENT,
    seq,
    event,
    body,
  };
}

/**
 * @param {string} headerText
 * @return {number}
 */
function parseContentLength(headerText) {
  const headerLines = headerText.split(DEF.LINE_SEPARATOR);
  for (const headerLine of headerLines) {
    const separatorIndex = headerLine.indexOf(':');
    if (separatorIndex < 0) {
      continue;
    }

    const headerName = headerLine.slice(0, separatorIndex).trim();
    if (headerName !== DEF.CONTENT_LENGTH_HEADER) {
      continue;
    }

    const headerValue = headerLine.slice(separatorIndex + 1).trim();
    const parsedLength = Number.parseInt(headerValue, 10);
    return Number.isFinite(parsedLength) ? parsedLength : -1;
  }

  return -1;
}

/**
 * @param {string|Buffer|Uint8Array} chunk
 * @return {string}
 */
function normalizeChunkToString(chunk) {
  if (typeof chunk === 'string') {
    return chunk;
  }
  if (Buffer.isBuffer(chunk)) {
    return chunk.toString(LOCAL_STR_UTF8);
  }
  if (chunk instanceof Uint8Array) {
    return Buffer.from(chunk).toString(LOCAL_STR_UTF8);
  }
  throw new Error(ERR.MESSAGE_REQUIRED);
}

/**
 * @param {*} value
 * @return {string}
 */
function formatVariableValue(value) {
  if (typeof value === 'string') {
    return value;
  }
  if (value === undefined) {
    return LOCAL_STR_UNDEFINED;
  }
  if (value === null) {
    return LOCAL_STR_NULL;
  }
  if (typeof value === 'object') {
    try {
      return JSON.stringify(value);
    } catch (_err) {
      return String(value);
    }
  }
  return String(value);
}

/**
 * @param {*} value
 * @return {boolean}
 */
function isNonEmptyString(value) {
  return typeof value === 'string' &&
    value.trim().length > 0;
}

export {
  DapMessageFramer,
  DapServer,
  encodeDapProtocolMessage,
};
