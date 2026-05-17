#!/usr/bin/env node

import {spawnSync} from 'node:child_process';
import process from 'node:process';
import {fileURLToPath} from 'node:url';
import {
  buildSubagentSequencingStatus,
  buildCurrentBlockerFromActivePackage,
  buildCurrentBlockerFromPackage,
} from './work-context.js';
import {
  buildPackageDoctorLines,
} from './work-tracker.js';
import {
  buildSubagentNextLines,
} from './work-subagent-next.js';

const EXIT_SUCCESS = 0;
const EXIT_FAILURE = 1;
const NUM_ZERO = 0;
const NUM_ONE = 1;
const NUM_TWO = 2;
const EMPTY_TEXT = '';
const NEWLINE = '\n';
const FLAG_HELP = '--help';
const FLAG_PACKAGE = '--package';
const FLAG_WRITE = '--write';
const FLAG_CHECK = '--check';
const HELP_TEXT = [
  'Usage: node scripts/work-advance.js [--package <package.md>] [--write] [--check]',
  '',
  'Prints the current package, doctor findings, next subagent role, and the',
  'next bounded prompt. With --write it refreshes current-blocker first.',
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

function runNodeScript(scriptPath, args = []) {
  const result = spawnSync(
    process.execPath,
    [scriptPath, ...args],
    {encoding: 'utf8'},
  );
  return {
    status: result.status,
    stdout: normalizeText(result.stdout),
    stderr: normalizeText(result.stderr),
  };
}

async function resolvePackageBlocker(args = []) {
  const packagePath = parseOptionValue(args, FLAG_PACKAGE);
  return packagePath ?
    buildCurrentBlockerFromPackage(packagePath) :
    buildCurrentBlockerFromActivePackage();
}

function appendCommandResult(lines, title, result) {
  lines.push(EMPTY_TEXT, `## ${title}`, EMPTY_TEXT);
  if (result.stdout) {
    lines.push(result.stdout);
  }
  if (result.stderr) {
    lines.push(result.stderr);
  }
  lines.push(`Exit status: \`${result.status}\``);
}

async function buildAdvanceLines(args = []) {
  if (args.includes(FLAG_HELP)) {
    return HELP_TEXT.split(NEWLINE);
  }
  const lines = ['# Work Advance'];
  if (args.includes(FLAG_WRITE)) {
    appendCommandResult(
      lines,
      'Current Blocker Refresh',
      runNodeScript('scripts/work-tracker.js', ['current-blocker', '--write']),
    );
  }
  const {currentBlocker, packageContent} = await resolvePackageBlocker(args);
  const subagentStatus = buildSubagentSequencingStatus(
    packageContent,
    currentBlocker.package,
  );
  lines.push(
    EMPTY_TEXT,
    '## Current Package',
    EMPTY_TEXT,
    `Package: \`${currentBlocker.package}\``,
    `Lane: \`${currentBlocker.lane}\``,
    `Owner: \`${currentBlocker.owner}\``,
    `Boundary: \`${currentBlocker.boundary}\``,
    `Next action: ${currentBlocker.nextAction}`,
    `Next required subagent role: \`${subagentStatus.role}\``,
    `Subagent sequencing status: ${subagentStatus.status}`,
    EMPTY_TEXT,
    '## Package Doctor',
    EMPTY_TEXT,
    buildPackageDoctorLines(currentBlocker.package, packageContent, {
      suggest: true,
    }).lines.join(NEWLINE),
    EMPTY_TEXT,
    '## Next Subagent',
    EMPTY_TEXT,
    (await buildSubagentNextLines([
      FLAG_PACKAGE,
      currentBlocker.package,
    ])).join(NEWLINE),
  );
  if (args.includes(FLAG_CHECK)) {
    appendCommandResult(
      lines,
      'Entry Validation',
      runNodeScript('scripts/work-tracker.js', ['validate', '--entry']),
    );
    appendCommandResult(
      lines,
      'Pre-Implementation Validation',
      runNodeScript('scripts/work-tracker.js', ['validate', '--pre-impl']),
    );
  }
  return lines;
}

async function runCli(args = process.argv.slice(NUM_TWO)) {
  return `${(await buildAdvanceLines(args)).join(NEWLINE)}${NEWLINE}`;
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
  buildAdvanceLines,
  runCli,
};
