#!/usr/bin/env node

import fs from 'node:fs';
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
  readTheoryLedgerContext,
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
const CURRENT_BLOCKER_JSON_PATH = 'work/sprints/current-blocker.json';
const HELP_TEXT = [
  'Usage: node scripts/work-advance.js [--package <package.md>] [--write] [--check]',
  '',
  'Prints the current package, doctor findings, next subagent role, and the',
  'next bounded prompt. With --write it refreshes current-blocker first.',
  'With --check, failed validation subcommands make this command fail.',
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
    buildCurrentBlockerFromActivePackage().catch((error) => {
      if (error.message !== 'No current blocker handoff was found.') {
        throw error;
      }
      return {
        currentBlocker: JSON.parse(
          fs.readFileSync(CURRENT_BLOCKER_JSON_PATH, 'utf8'),
        ),
        packageContent: EMPTY_TEXT,
      };
    });
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
  return result.status === EXIT_SUCCESS ? EXIT_SUCCESS : EXIT_FAILURE;
}

function validationCommandArgs(phaseFlag, packagePath) {
  const commandArgs = ['validate', phaseFlag];
  if (packagePath) {
    commandArgs.push(packagePath);
  }
  return commandArgs;
}

async function buildAdvanceLines(args = [], options = {}) {
  if (args.includes(FLAG_HELP)) {
    return HELP_TEXT.split(NEWLINE);
  }
  const commandStatuses = options.commandStatuses || [];
  const packagePath = parseOptionValue(args, FLAG_PACKAGE);
  const lines = ['# Work Advance'];
  if (args.includes(FLAG_WRITE)) {
    commandStatuses.push(appendCommandResult(
      lines,
      'Current Blocker Refresh',
      runNodeScript('scripts/work-tracker.js', ['current-blocker', '--write']),
    ));
  }
  const {currentBlocker, packageContent} = await resolvePackageBlocker(args);
  const theoryLedgerContext = await readTheoryLedgerContext();
  const hasActivePackage = currentBlocker.package !== 'none';
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
  );
  if (hasActivePackage) {
    lines.push(
      EMPTY_TEXT,
      '## Package Doctor',
      EMPTY_TEXT,
      buildPackageDoctorLines(currentBlocker.package, packageContent, {
        suggest: true,
        theoryLedgerContext,
      }).lines.join(NEWLINE),
    );
  } else {
    lines.push(
      EMPTY_TEXT,
      '## Package Doctor',
      EMPTY_TEXT,
      'No active package; package doctor is not applicable.',
    );
  }
  lines.push(
    EMPTY_TEXT,
    '## Next Subagent',
    EMPTY_TEXT,
    hasActivePackage ?
      (await buildSubagentNextLines([
        FLAG_PACKAGE,
        currentBlocker.package,
      ])).join(NEWLINE) :
      (await buildSubagentNextLines([])).join(NEWLINE),
  );
  if (args.includes(FLAG_CHECK)) {
    commandStatuses.push(appendCommandResult(
      lines,
      'Entry Validation',
      runNodeScript(
        'scripts/work-tracker.js',
        validationCommandArgs('--entry', packagePath),
      ),
    ));
    commandStatuses.push(appendCommandResult(
      lines,
      'Pre-Implementation Validation',
      runNodeScript(
        'scripts/work-tracker.js',
        validationCommandArgs('--pre-impl', packagePath),
      ),
    ));
  }
  return lines;
}

async function buildAdvanceResult(args = []) {
  const commandStatuses = [];
  const lines = await buildAdvanceLines(args, {commandStatuses});
  const status = commandStatuses.some((commandStatus) =>
    commandStatus !== EXIT_SUCCESS) ? EXIT_FAILURE : EXIT_SUCCESS;
  return {
    output: `${lines.join(NEWLINE)}${NEWLINE}`,
    status,
  };
}

async function runCli(args = process.argv.slice(NUM_TWO)) {
  return (await buildAdvanceResult(args)).output;
}

function isDirectRun() {
  return process.argv[NUM_ONE] === fileURLToPath(import.meta.url);
}

if (isDirectRun()) {
  buildAdvanceResult(process.argv.slice(NUM_TWO))
    .then((result) => {
      process.stdout.write(result.output);
      process.exitCode = result.status;
    })
    .catch((error) => {
      process.stderr.write(`${error.message}${NEWLINE}`);
      process.exitCode = EXIT_FAILURE;
    });
}

export {
  buildAdvanceResult,
  buildAdvanceLines,
  runCli,
};
