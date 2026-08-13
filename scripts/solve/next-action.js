

const LOCAL_STR_OWNED_001 = 'executable-command';
const LOCAL_STR_OWNED_002 = 'command-template';
const LOCAL_STR_OWNED_003 = 'manual-action';
const LOCAL_STR_OWNED_004 = 'terminal';
const LOCAL_STR_OWNED_005 = 'record-attempt';

export const NEXT_ACTION_TYPE = Object.freeze({
  EXECUTABLE_COMMAND: LOCAL_STR_OWNED_001,
  COMMAND_TEMPLATE: LOCAL_STR_OWNED_002,
  MANUAL_ACTION: LOCAL_STR_OWNED_003,
  TERMINAL: LOCAL_STR_OWNED_004,
});

export const NEXT_ACTION_CODE = Object.freeze({
  BEGIN_STEP: 'begin-step',
  RECORD_ATTEMPT: LOCAL_STR_OWNED_005,
  // Compatibility for projections recorded before record-attempt became the
  // operator term. New projections must not emit this code.
  COMMIT_STEP: 'commit-step',
  REPLACE_REJECTED_ATTEMPT: 'replace-rejected-attempt',
  REQUEST_VERIFICATION: 'request-verification',
  CHECKPOINT: 'checkpoint',
  LAND: 'land',
  REPAIR_AUDIT: 'repair-audit',
  OPERATOR_ACTION: 'operator-action',
});

export function isAttemptRecordActionCode(code) {
  return code === NEXT_ACTION_CODE.RECORD_ATTEMPT ||
    code === NEXT_ACTION_CODE.COMMIT_STEP;
}

const COMMAND_PREFIX = /^(?:node|npm|npx|git|bash|sh|\.\/)\s/u;
const TEMPLATE_TOKEN = /<[^>]+>|\{(?:request|response)File\}|\s+#\s/u;

export function typedNextAction(value, options = {}) {
  const normalized = typeof value === 'string' ? value.trim() : '';
  const structured = options.code ? {
    code: options.code,
    payload: options.payload && typeof options.payload === 'object' ?
      options.payload : {},
  } : {};
  if (options.terminal === true) {
    return {
      type: NEXT_ACTION_TYPE.TERMINAL,
      value: normalized || null,
      ...structured,
    };
  }
  if (COMMAND_PREFIX.test(normalized)) {
    return {
      type: TEMPLATE_TOKEN.test(normalized) ?
        NEXT_ACTION_TYPE.COMMAND_TEMPLATE : NEXT_ACTION_TYPE.EXECUTABLE_COMMAND,
      value: normalized,
      ...structured,
    };
  }
  return {
    type: NEXT_ACTION_TYPE.MANUAL_ACTION,
    value: normalized || null,
    ...structured,
  };
}
