#!/usr/bin/env node

import {spawnSync} from 'node:child_process';
import fs from 'node:fs/promises';
import process from 'node:process';
import {fileURLToPath} from 'node:url';
import {
  buildScenarioRouteSummary,
  renderMarkdown,
} from './work-scenario-route.js';

const ENCODING_UTF8 = 'utf8';
const EXIT_SUCCESS = 0;
const EXIT_FAILURE = 1;
const NUM_ZERO = 0;
const NUM_ONE = 1;
const NUM_TWO = 2;
const EMPTY_TEXT = '';
const NEWLINE = '\n';
const FLAG_ARTIFACT = '--artifact';
const FLAG_PACKAGE = '--package';
const FLAG_SUCCESSOR = '--successor';
const FLAG_OWNER = '--owner';
const FLAG_BOUNDARY = '--boundary';
const FLAG_DOMINANT_REASON = '--dominant-reason';
const FLAG_EXPLAIN = '--explain';
const FLAG_TEST = '--test';
const FLAG_WRITE = '--write';
const FLAG_HELP = '--help';
const CURRENT_BLOCKER_PATH = 'work/sprints/current-blocker.json';
const VALUE_NOT_PROVIDED = 'not-provided';
const VALUE_NONE = 'none';
const MESSAGE_PACKAGE_MIGRATION_FAILED = 'package migration failed';
const MESSAGE_TRANSACTION_STEP_FAILED = 'route-after-rerun transaction step failed';
const MESSAGE_WRITE_REQUIRES_SUCCESSOR =
  '--write requires --successor <active-successor>.';
const MARKDOWN_HEADER_ROUTE_AFTER_RERUN = '# Route After Rerun';
const MARKDOWN_HEADER_TRANSACTION = '## Transaction';
const MARKDOWN_HEADER_REQUIRED_REFRESH = '## Required Refresh';
const MARKDOWN_SUCCESSOR_REQUIRED =
  '- `provide --successor <active-successor> before --write`';
const HELP_TEXT = [
  'Usage: node scripts/work-package-route-after-rerun.js --artifact <artifact.json> [--package <active-package>] [--successor <active-successor>] [--owner <owner>] [--boundary <boundary>] [--dominant-reason <reason>] [--explain <edge>] [--test <test.js>] [--write]',
  '',
  'Combines post-rerun route extraction with the package migration handoff.',
  'Without --write it prints the route and the transaction it would run.',
  'With --write it requires an existing successor package and performs the',
  'validated migrate transaction plus current-blocker regeneration.',
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

function parseRepeatedOptionValues(args, optionName) {
  const values = [];
  for (let index = NUM_ZERO; index < args.length; index += NUM_ONE) {
    if (args[index] === optionName) {
      values.push(normalizeText(args[index + NUM_ONE]));
      index += NUM_ONE;
    }
  }
  return values.filter((value) => value.length > NUM_ZERO);
}

function parseArgs(args = []) {
  return {
    help: args.includes(FLAG_HELP),
    write: args.includes(FLAG_WRITE),
    artifactPath: parseOptionValue(args, FLAG_ARTIFACT),
    packagePath: parseOptionValue(args, FLAG_PACKAGE),
    successorPath: parseOptionValue(args, FLAG_SUCCESSOR),
    owner: parseOptionValue(args, FLAG_OWNER),
    boundary: parseOptionValue(args, FLAG_BOUNDARY),
    dominantReason: parseOptionValue(args, FLAG_DOMINANT_REASON),
    explain: parseOptionValue(args, FLAG_EXPLAIN),
    tests: parseRepeatedOptionValues(args, FLAG_TEST),
  };
}

async function currentPackagePath() {
  const currentBlocker = JSON.parse(
    await fs.readFile(CURRENT_BLOCKER_PATH, ENCODING_UTF8),
  );
  return normalizeText(currentBlocker.package);
}

function runTrackerMigrate(packagePath, successorPath) {
  return runCommand(process.execPath, [
    'scripts/work-tracker.js',
    'migrate',
    '--write',
    '--transaction',
    packagePath,
    successorPath,
  ], MESSAGE_PACKAGE_MIGRATION_FAILED);
}

function runCommand(command, args, failureMessage) {
  const result = spawnSync(
    command,
    args,
    {encoding: 'utf8'},
  );
  if (result.status !== EXIT_SUCCESS) {
    throw new Error(
      normalizeText(result.stderr) ||
      normalizeText(result.stdout) ||
      failureMessage,
    );
  }
  return normalizeText(result.stdout);
}

function runPostMigrationRefresh() {
  return [
    runCommand('npm', ['run', 'work:repair'], MESSAGE_TRANSACTION_STEP_FAILED),
    runCommand(
      'npm',
      ['run', 'work:validate', '--', '--entry'],
      MESSAGE_TRANSACTION_STEP_FAILED,
    ),
    runCommand(
      'npm',
      ['run', 'work:validate', '--', '--pre-impl'],
      MESSAGE_TRANSACTION_STEP_FAILED,
    ),
  ].filter(Boolean).join(NEWLINE);
}

async function buildRouteAfterRerunLines(options = {}) {
  if (options.help || !options.artifactPath) {
    return HELP_TEXT.split(NEWLINE);
  }
  const packagePath = options.packagePath || await currentPackagePath();
  const route = await buildScenarioRouteSummary(options);
  const routeCommand = route.suggestedProof?.[NUM_ZERO] ||
    `npm run work:scenario-route -- ${options.artifactPath}`;
  const lines = [
    MARKDOWN_HEADER_ROUTE_AFTER_RERUN,
    EMPTY_TEXT,
    `- Package: \`${packagePath || VALUE_NONE}\``,
    `- Successor: \`${options.successorPath || VALUE_NOT_PROVIDED}\``,
    `- Write: \`${options.write}\``,
    EMPTY_TEXT,
    renderMarkdown(route),
    EMPTY_TEXT,
    MARKDOWN_HEADER_REQUIRED_REFRESH,
    EMPTY_TEXT,
    `- Route result command: \`${routeCommand}\``,
    `- Successor package command: \`${route.suggestedPackageCommand}\``,
    '- If owner and boundary are stable, open a runtime-owner-boundary successor instead of another classification package.',
    '- Update Sprint Strategy Brief from the route result.',
    '- Update Current Edge Card from the route result.',
    `- Refresh generated tracker handoff: \`npm run work:repair\``,
    `- Enforce entry consistency: \`npm run work:validate -- --entry\``,
    `- Enforce pre-implementation consistency: \`npm run work:validate -- --pre-impl\``,
  ];
  if (!options.write) {
    lines.push(
      EMPTY_TEXT,
      MARKDOWN_HEADER_TRANSACTION,
      EMPTY_TEXT,
      options.successorPath ?
        `- \`npm run work:package:migrate -- --write --transaction ${packagePath} ${options.successorPath}\`` :
        MARKDOWN_SUCCESSOR_REQUIRED,
    );
    return lines;
  }
  if (!options.successorPath) {
    throw new Error(MESSAGE_WRITE_REQUIRES_SUCCESSOR);
  }
  const migrationOutput = runTrackerMigrate(packagePath, options.successorPath);
  const refreshOutput = runPostMigrationRefresh();
  lines.push(
    EMPTY_TEXT,
    MARKDOWN_HEADER_TRANSACTION,
    EMPTY_TEXT,
    migrationOutput,
    refreshOutput,
  );
  return lines;
}

async function runCli(args = process.argv.slice(NUM_TWO)) {
  return `${(await buildRouteAfterRerunLines(parseArgs(args))).join(NEWLINE)}${NEWLINE}`;
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
  buildRouteAfterRerunLines,
  runCli,
};
