#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import {fileURLToPath} from 'node:url';

import {CLI_VIEW_LIST} from '../src/cli/cli-constants.js';
import {VIEW_KEYS} from '../src/cli/core/keyboard-handler.js';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const TEXT_ENCODING = 'utf8';
const CLI_DOC_PATHS = Object.freeze([
  'src/cli/README.md',
  'src/cli/USER_GUIDE.md',
  'src/cli/COMMAND_REFERENCE.md',
]);
const VIEW_LABEL = Object.freeze({
  nodes: 'Nodes',
  services: 'Services',
  replicas: 'Replicas',
  tables: 'Tables',
  partitions: 'Partitions',
  message_groups: 'Message Groups',
  sql: 'SQL',
  logs: 'Logs',
  config: 'Config',
  contexts: 'Contexts',
});

function loadCliDocuments(root = REPO_ROOT) {
  return Object.fromEntries(CLI_DOC_PATHS.map((relativePath) => [
    relativePath,
    fs.readFileSync(path.join(root, relativePath), TEXT_ENCODING),
  ]));
}

function evaluateCliDocs(documents) {
  const problems = [];
  for (const [documentPath, content] of Object.entries(documents)) {
    for (const [key, view] of Object.entries(VIEW_KEYS)) {
      const expectedRow = `| \`${key}\` | ${VIEW_LABEL[view]} |`;
      if (!content.includes(expectedRow)) {
        problems.push(
          `${documentPath} is missing canonical view shortcut ${expectedRow}`,
        );
      }
    }
  }

  const reference = documents['src/cli/COMMAND_REFERENCE.md'] ?? '';
  for (const view of CLI_VIEW_LIST) {
    if (!reference.includes(`\`${view}\``)) {
      problems.push(
        `src/cli/COMMAND_REFERENCE.md is missing startup view ${view}`,
      );
    }
  }

  if (Object.values(documents).some((content) =>
    content.includes('| `2` | Services |'))) {
    problems.push('CLI docs retain the stale key 2 = Services mapping');
  }
  return {valid: problems.length === 0, problems};
}

function checkCliDocs(root = REPO_ROOT) {
  return evaluateCliDocs(loadCliDocuments(root));
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const result = checkCliDocs();
  if (!result.valid) {
    for (const problem of result.problems) {
      process.stderr.write(`CLI documentation violation: ${problem}\n`);
    }
    process.exitCode = 1;
  } else {
    process.stdout.write('CLI documentation: valid\n');
  }
}

export {checkCliDocs, evaluateCliDocs, loadCliDocuments};
