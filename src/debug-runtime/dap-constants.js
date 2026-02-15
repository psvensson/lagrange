/**
 * Debug Adapter Protocol constants for runtime debug server.
 */

const DAP_MESSAGE_TYPE = Object.freeze({
  REQUEST: 'request',
  RESPONSE: 'response',
  EVENT: 'event',
});

const DAP_COMMAND = Object.freeze({
  INITIALIZE: 'initialize',
  LAUNCH: 'launch',
  ATTACH: 'attach',
  SET_BREAKPOINTS: 'setBreakpoints',
  CONTINUE: 'continue',
  NEXT: 'next',
  STEP_IN: 'stepIn',
  STEP_OUT: 'stepOut',
  THREADS: 'threads',
  STACK_TRACE: 'stackTrace',
  SCOPES: 'scopes',
  VARIABLES: 'variables',
});

const DAP_EVENT = Object.freeze({
  INITIALIZED: 'initialized',
  STOPPED: 'stopped',
  CONTINUED: 'continued',
});

const DAP_DEFAULT = Object.freeze({
  THREAD_ID: 1,
  CONTENT_LENGTH_HEADER: 'Content-Length',
  HEADER_SEPARATOR: '\r\n\r\n',
  LINE_SEPARATOR: '\r\n',
  LOCAL_SCOPE_NAME: 'Locals',
  MAIN_THREAD_NAME: 'main',
  FRAME_NAME_PREFIX: 'frame_',
});

const DAP_ERROR_MSG = Object.freeze({
  REQUEST_REQUIRED: 'DAP request is required',
  MESSAGE_REQUIRED: 'DAP message is required',
  SEND_MESSAGE_REQUIRED:
    'DAP server requires sendMessage function',
  BREAKPOINT_MANAGER_REQUIRED:
    'DAP server requires breakpointManager object',
  RUNTIME_INTROSPECTOR_REQUIRED:
    'DAP server requires runtimeIntrospector object',
  COMMAND_UNSUPPORTED: 'DAP command is not supported',
  INITIALIZE_REQUIRED:
    'DAP initialize must be completed before this command',
  SESSION_NOT_READY:
    'DAP attach/launch must complete before this command',
  SESSION_CONTEXT_REQUIRED:
    'DAP attach/launch requires sessionId, moduleRef, instanceHandle, and index',
  FRAME_REQUIRED: 'DAP scopes request requires frameId',
  VARIABLES_REFERENCE_REQUIRED:
    'DAP variables request requires variablesReference',
  VARIABLES_REFERENCE_UNKNOWN:
    'DAP variablesReference does not exist',
  CONTENT_LENGTH_INVALID:
    'DAP protocol Content-Length header is missing or invalid',
  PAYLOAD_INVALID: 'DAP protocol payload is invalid JSON',
});

export {
  DAP_MESSAGE_TYPE,
  DAP_COMMAND,
  DAP_EVENT,
  DAP_DEFAULT,
  DAP_ERROR_MSG,
};
