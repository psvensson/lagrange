/**
 * Constants for breakpoint management and step control.
 */

const BREAKPOINT_MANAGER_DEFAULT = Object.freeze({
  COLUMN_NUMBER: 0,
});

const BREAKPOINT_STEP_ACTION = Object.freeze({
  CONTINUE: 'continue',
  NEXT: 'next',
  STEP_IN: 'stepIn',
  STEP_OUT: 'stepOut',
});

const BREAKPOINT_MANAGER_ERROR_MSG = Object.freeze({
  REQUEST_REQUIRED: 'Breakpoint request is required',
  SESSION_ID_REQUIRED: 'Breakpoint request requires non-empty sessionId',
  MODULE_REF_REQUIRED: 'Breakpoint request requires non-empty moduleRef',
  INDEX_REQUIRED: 'Breakpoint request requires index object',
  SOURCE_FILE_URL_REQUIRED:
    'Breakpoint request requires non-empty sourceFileUrl',
  BREAKPOINTS_REQUIRED:
    'Breakpoint request requires breakpoints array',
  LINE_NUMBER_REQUIRED:
    'Breakpoint request requires non-negative integer lineNumber',
  CODE_OFFSET_REQUIRED:
    'Breakpoint request requires non-negative integer codeOffset',
  RUNTIME_ADAPTER_REQUIRED:
    'Breakpoint step control requires runtimeAdapter.resume function',
  INSTANCE_HANDLE_REQUIRED:
    'Breakpoint step control requires instanceHandle',
});

export {
  BREAKPOINT_MANAGER_DEFAULT,
  BREAKPOINT_STEP_ACTION,
  BREAKPOINT_MANAGER_ERROR_MSG,
};
