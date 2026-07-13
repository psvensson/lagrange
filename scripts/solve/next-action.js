export const NEXT_ACTION_TYPE = Object.freeze({
  EXECUTABLE_COMMAND: 'executable-command',
  COMMAND_TEMPLATE: 'command-template',
  MANUAL_ACTION: 'manual-action',
  TERMINAL: 'terminal',
});

const COMMAND_PREFIX = /^(?:node|npm|npx|git|bash|sh|\.\/)\s/u;
const TEMPLATE_TOKEN = /<[^>]+>|\{(?:request|response)File\}|\s+#\s/u;

export function typedNextAction(value, options = {}) {
  const normalized = typeof value === 'string' ? value.trim() : '';
  if (options.terminal === true) {
    return {type: NEXT_ACTION_TYPE.TERMINAL, value: normalized || null};
  }
  if (COMMAND_PREFIX.test(normalized)) {
    return {
      type: TEMPLATE_TOKEN.test(normalized) ?
        NEXT_ACTION_TYPE.COMMAND_TEMPLATE : NEXT_ACTION_TYPE.EXECUTABLE_COMMAND,
      value: normalized,
    };
  }
  return {type: NEXT_ACTION_TYPE.MANUAL_ACTION, value: normalized || null};
}
