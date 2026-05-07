#!/usr/bin/env node

const COMMAND_GROUPS = Object.freeze([
  Object.freeze({
    title: 'Orientation',
    commands: Object.freeze([
      Object.freeze({
        command: 'npm run work:context',
        description: 'Print current blocker, first-read files, proof ladder, and dirty worktree.',
      }),
      Object.freeze({
        command: 'npm run work:validate',
        description: 'Validate active work-package metadata and checklist state.',
      }),
      Object.freeze({
        command: 'npm run steering:llm:pack',
        description: 'Regenerate compact steering packs for prompt loading.',
      }),
    ]),
  }),
  Object.freeze({
    title: 'Focused Validation',
    commands: Object.freeze([
      Object.freeze({
        command: 'npm test -- test/path/to/file.test.js',
        description: 'Run one focused TAP test file.',
      }),
      Object.freeze({
        command: 'npm run test:metrics:scoped -- <files...>',
        description: 'Run scoped cyclomatic and cognitive complexity ratchets.',
      }),
      Object.freeze({
        command: 'npm run audit:file-size',
        description: 'Report oversized production and test files.',
      }),
    ]),
  }),
  Object.freeze({
    title: 'Report And Triage',
    commands: Object.freeze([
      Object.freeze({
        command: 'npm run analyze:distributed-failure -- --report <path>',
        description: 'Print consolidated distributed report and triage diagnostics.',
      }),
      Object.freeze({
        command: 'npm run analyze:topology-convergence -- <artifact>',
        description: 'Render topology convergence evidence from report or playback artifacts.',
      }),
      Object.freeze({
        command: 'npm run summarize:harness -- --report-dir test-output/reports',
        description: 'List latest harness reports by scenario and status.',
      }),
    ]),
  }),
  Object.freeze({
    title: 'Guideline Guardrails',
    commands: Object.freeze([
      Object.freeze({
        command: 'npm run guard:guidelines:staged',
        description: 'Run the staged LLM guideline guard.',
      }),
      Object.freeze({
        command: 'npm run audit:guideline:literals -- <files...>',
        description: 'Check touched files for new unowned runtime literals.',
      }),
      Object.freeze({
        command: 'npm run guard:guideline:constant-names:file -- <files...>',
        description: 'Reject opaque generated constant names in clean explicit files.',
      }),
      Object.freeze({
        command: 'npm run audit:guideline:decision-boundaries -- <files...>',
        description: 'Check semantic decision boundaries for independent branch piles.',
      }),
      Object.freeze({
        command: 'npm run audit:runtime-grammar:file -- <files...>',
        description: 'Check runtime owner-contract and grammar drift.',
      }),
    ]),
  }),
  Object.freeze({
    title: 'Broad Gates',
    commands: Object.freeze([
      Object.freeze({
        command: 'npm run test:static',
        description: 'Run unused, dependency, complexity, metadata, and runtime grammar checks.',
      }),
      Object.freeze({
        command: 'npm run test:fast',
        description: 'Run non-bootstrap, non-integration TAP tests.',
      }),
      Object.freeze({
        command: 'npm run distributed:all',
        description: 'Run distributed scenarios with verbose output.',
      }),
    ]),
  }),
]);

const NEWLINE = '\n';
const EMPTY_TEXT = '';
const SECTION_PREFIX = '## ';
const LIST_PREFIX = '- ';
const DESCRIPTION_SEPARATOR = ' - ';
const OUTPUT_TITLE = '# Useful Commands';

function renderCommandList(groups = COMMAND_GROUPS) {
  const lines = [OUTPUT_TITLE, EMPTY_TEXT];
  for (const group of groups) {
    lines.push(`${SECTION_PREFIX}${group.title}`, EMPTY_TEXT);
    for (const entry of group.commands) {
      lines.push(
        `${LIST_PREFIX}\`${entry.command}\`${DESCRIPTION_SEPARATOR}` +
        entry.description,
      );
    }
    lines.push(EMPTY_TEXT);
  }
  return lines.join(NEWLINE);
}

function main() {
  process.stdout.write(renderCommandList());
}

if (process.argv[1] && process.argv[1].endsWith('list-commands.js')) {
  main();
}

export {
  COMMAND_GROUPS,
  renderCommandList,
};
