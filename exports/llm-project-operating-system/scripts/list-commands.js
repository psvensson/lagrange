#!/usr/bin/env node

const NEWLINE = '\n';
const EMPTY_TEXT = '';
const PROCESS_ARG_SCRIPT_INDEX = 1;
const SCRIPT_NAME = 'list-commands.js';

const COMMAND_GROUPS = Object.freeze([
  Object.freeze({
    title: 'Orientation',
    commands: Object.freeze([
      Object.freeze({
        command: 'npm run commands',
        description: 'Print this command list.',
      }),
    ]),
  }),
  Object.freeze({
    title: 'Focused Validation',
    commands: Object.freeze([
      Object.freeze({
        command: 'npm test -- test/path/to/file.test.js',
        description: 'Run one focused test file.',
      }),
      Object.freeze({
        command: 'npm run audit:file-size',
        description: 'Report oversized source and test files.',
      }),
      Object.freeze({
        command: 'npm run audit:owner-boundary-segments -- <files...>',
        description: 'Print extraction guidance for oversized segment files.',
      }),
    ]),
  }),
]);

function renderCommandList(groups = COMMAND_GROUPS) {
  const lines = ['# Useful Commands', EMPTY_TEXT];
  for (const group of groups) {
    lines.push(`## ${group.title}`, EMPTY_TEXT);
    for (const entry of group.commands) {
      lines.push(`- \`${entry.command}\` - ${entry.description}`);
    }
    lines.push(EMPTY_TEXT);
  }
  return lines.join(NEWLINE);
}

function main() {
  process.stdout.write(renderCommandList());
}

if (
  process.argv[PROCESS_ARG_SCRIPT_INDEX] &&
  process.argv[PROCESS_ARG_SCRIPT_INDEX].endsWith(SCRIPT_NAME)
) {
  main();
}

export {
  COMMAND_GROUPS,
  renderCommandList,
};
