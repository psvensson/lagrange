#!/usr/bin/env node

import fs from 'node:fs/promises';
import process from 'node:process';
import {fileURLToPath} from 'node:url';
import {
  buildSubagentSequencingStatus,
} from './work-context.js';
import {
  findActivePackageFile,
  findActiveSprintFile,
} from './work-tracker.js';
import {
  buildSubagentPrompt,
} from './work-subagent-prompt.js';

const ENCODING_UTF8 = 'utf8';
const EXIT_SUCCESS = 0;
const EXIT_FAILURE = 1;
const NUM_ZERO = 0;
const NUM_ONE = 1;
const NUM_TWO = 2;
const EMPTY_TEXT = '';
const NEWLINE = '\n';
const FLAG_HELP = '--help';
const FLAG_PACKAGE = '--package';
const SUBAGENT_ROLE_NONE = 'none';
const HELP_TEXT = [
  'Usage: node scripts/work-subagent-next.js [--package <package.md>]',
  '',
  'Reads the package Execution Evidence or legacy Subagent Sequencing Ledger,',
  'prints the next useful role, and emits the bounded prompt when needed.',
].join(NEWLINE);

function normalizeText(value) {
  return String(value || EMPTY_TEXT).trim();
}

function parseOptionValue(args, optionName) {
  const index = args.indexOf(optionName);
  if (index < NUM_ZERO) {
    return EMPTY_TEXT;
  }
  return normalizeText(args[index + NUM_ONE]);
}

async function resolvePackagePath(args = []) {
  const explicitPackage = parseOptionValue(args, FLAG_PACKAGE);
  if (explicitPackage) {
    return explicitPackage;
  }
  const activeSprintFile = await findActiveSprintFile();
  const activePackageFile = await findActivePackageFile(activeSprintFile);
  if (!activePackageFile) {
    throw new Error('No active work package was found.');
  }
  return activePackageFile;
}

async function buildSubagentNextLines(args = []) {
  if (args.includes(FLAG_HELP)) {
    return HELP_TEXT.split(NEWLINE);
  }
  const packagePath = await resolvePackagePath(args);
  const packageContent = await fs.readFile(packagePath, ENCODING_UTF8);
  const status = buildSubagentSequencingStatus(packageContent, packagePath);
  const lines = [
    '# Next Subagent',
    EMPTY_TEXT,
    `Package: \`${packagePath}\``,
    `Role: \`${status.role}\``,
    `Status: ${status.status}`,
  ];
  if (status.role === SUBAGENT_ROLE_NONE) {
    return lines;
  }
  lines.push(
    EMPTY_TEXT,
    '## Command',
    EMPTY_TEXT,
    `\`npm run work:subagent-prompt -- --role ${status.role} --package ${packagePath}\``,
    EMPTY_TEXT,
    buildSubagentPrompt(status.role, packagePath, packageContent, args),
  );
  return lines;
}

async function runCli(args = process.argv.slice(NUM_TWO)) {
  return `${(await buildSubagentNextLines(args)).join(NEWLINE)}${NEWLINE}`;
}

function isDirectRun() {
  return process.argv[NUM_ONE] === fileURLToPath(import.meta.url);
}

if (isDirectRun()) {
  runCli()
    .then((output) => {
      process.stdout.write(output);
      process.exitCode = EXIT_SUCCESS;
    })
    .catch((error) => {
      process.stderr.write(`${error.message}${NEWLINE}`);
      process.exitCode = EXIT_FAILURE;
    });
}

export {
  buildSubagentNextLines,
  runCli,
};
